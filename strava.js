'use strict';
// Strava là tùy chọn: chỉ dùng để lấy km chạy ngoài đời theo từng ngày.
// Cấu hình: biến môi trường > strava.config.json. STRAVA_MOCK=1 dùng dữ liệu giả để thử giao diện.
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(typeof __dirname === 'string' ? __dirname : '.', 'strava.config.json');
function readFile() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; } }
const FILE = readFile();
const pick = (env, key, def = '') => String(process.env[env] || FILE[key] || def).trim();

const MOCK = process.env.STRAVA_MOCK === '1';
const CLIENT_ID = pick('STRAVA_CLIENT_ID', 'clientId');
const CLIENT_SECRET = pick('STRAVA_CLIENT_SECRET', 'clientSecret');
const SCOPE = pick('STRAVA_SCOPE', 'scope', 'read,activity:read');
const FILE_BASE_URL = pick('BASE_URL', 'baseUrl');
const OAUTH_URL = (process.env.STRAVA_OAUTH_URL || 'https://www.strava.com/oauth').replace(/\/$/, '');
const API_URL = (process.env.STRAVA_API_URL || 'https://www.strava.com/api/v3').replace(/\/$/, '');
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const configured = () => MOCK || !!(CLIENT_ID && CLIENT_SECRET);

// code: 'revoked' (token bị thu hồi / hết hiệu lực), 'rate' (hết hạn mức), 'api' (lỗi khác)
class StravaError extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status; } }
function fail(status, what) {
  if (status === 429) return new StravaError('rate', `${what}: Strava giới hạn số lần gọi (429)`, status);
  if (status === 401 || status === 403) return new StravaError('revoked', `${what}: Strava từ chối (${status})`, status);
  return new StravaError('api', `${what}: lỗi ${status}`, status);
}

function authUrl(redirectUri, state) {
  if (MOCK) return `${redirectUri}?state=${state}&code=mock&scope=read,activity:read`;
  return `${OAUTH_URL}/authorize?` + new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state });
}
async function tokenRequest(params) {
  const r = await fetch(`${OAUTH_URL}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    // làm mới token mà bị 400/401 nghĩa là quyền đã bị thu hồi
    if (params.grant_type === 'refresh_token' && (r.status === 400 || r.status === 401)) throw new StravaError('revoked', 'Token làm mới không còn hiệu lực', r.status);
    throw fail(r.status, 'Đổi token');
  }
  return r.json();
}
async function exchange(code) {
  if (MOCK) return { athlete: { id: 424242 }, access_token: 'mock', refresh_token: 'mock', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  return tokenRequest({ code, grant_type: 'authorization_code' });
}
// làm mới token khi còn dưới 60 giây; s được cập nhật tại chỗ (người gọi phải lưu lại)
async function ensureToken(s) {
  if (MOCK || s.expires * 1000 - Date.now() > 60000) return s;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh });
  s.access = t.access_token; s.refresh = t.refresh_token || s.refresh; s.expires = t.expires_at;
  return s;
}
// Trả về { 'YYYY-MM-DD': km } cho các buổi chạy từ sinceEpoch tới nay (ngày theo start_date_local)
async function fetchDaily(s, sinceEpoch) {
  const out = {};
  if (MOCK) {
    const pat = [6.4, 0, 3.2, 0, 10.1, 5.0, 0, 8.3, 0, 0, 4.2, 0];
    for (let i = 0; i < pat.length; i++) if (pat[i]) { out[new Date(Date.now() + 7 * 3600e3 - i * 864e5).toISOString().slice(0, 10)] = pat[i]; }
    return out;
  }
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${API_URL}/athlete/activities?after=${sinceEpoch}&per_page=100&page=${page}`,
      { headers: { Authorization: 'Bearer ' + s.access }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw fail(r.status, 'Lấy hoạt động');
    const acts = await r.json();
    for (const a of acts) if (RUN_TYPES.has(a.sport_type || a.type)) {
      const d = String(a.start_date_local || '').slice(0, 10);
      if (d) out[d] = (out[d] || 0) + (a.distance || 0) / 1000;
    }
    if (acts.length < 100) break;
  }
  for (const d of Object.keys(out)) out[d] = Math.round(out[d] * 10) / 10;
  return out;
}
// Ngắt quyền phía Strava khi người dùng ngắt kết nối (không bắt buộc, lỗi thì bỏ qua)
async function deauthorize(s) {
  if (MOCK || !s || !s.access) return;
  try { await fetch(`${OAUTH_URL}/deauthorize`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ access_token: s.access }), signal: AbortSignal.timeout(8000) }); } catch { /* bỏ qua */ }
}
module.exports = { MOCK, SCOPE, FILE, FILE_BASE_URL, CONFIG_FILE, CLIENT_ID, CLIENT_SECRET, OAUTH_URL, API_URL, StravaError,
  configured, authUrl, exchange, ensureToken, fetchDaily, deauthorize };
