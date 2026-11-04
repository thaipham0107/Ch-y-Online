'use strict';
// Strava là tùy chọn: chỉ dùng để lấy km chạy ngoài đời theo từng ngày. STRAVA_MOCK=1 dùng dữ liệu giả để thử.
const MOCK = process.env.STRAVA_MOCK === '1';
const CLIENT_ID = process.env.STRAVA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '';
const SCOPE = process.env.STRAVA_SCOPE || 'read,activity:read';
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);
const configured = () => MOCK || !!(CLIENT_ID && CLIENT_SECRET);

function authUrl(redirectUri, state) {
  if (MOCK) return `${redirectUri}?state=${state}&code=mock&scope=read,activity:read`;
  return 'https://www.strava.com/oauth/authorize?' + new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: SCOPE, state });
}
async function tokenRequest(params) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }) });
  if (!r.ok) throw new Error('strava token ' + r.status);
  return r.json();
}
async function exchange(code) {
  if (MOCK) return { athlete: { id: 424242 }, access_token: 'mock', refresh_token: 'mock', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  return tokenRequest({ code, grant_type: 'authorization_code' });
}
async function ensureToken(s) {
  if (MOCK || s.expires * 1000 - Date.now() > 60000) return s;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh });
  s.access = t.access_token; s.refresh = t.refresh_token; s.expires = t.expires_at;
  return s;
}
// Trả về { 'YYYY-MM-DD': km } cho các buổi chạy từ sinceEpoch tới nay (ngày theo giờ địa phương của buổi chạy)
async function fetchDaily(s, sinceEpoch) {
  const out = {};
  if (MOCK) {
    const pat = [6.4, 0, 3.2, 0, 10.1, 5.0, 0, 8.3, 0, 0, 4.2, 0];
    for (let i = 0; i < pat.length; i++) if (pat[i]) {
      const d = new Date(Date.now() + 7 * 3600e3 - i * 864e5).toISOString().slice(0, 10); out[d] = pat[i];
    }
    return out;
  }
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${sinceEpoch}&per_page=100&page=${page}`,
      { headers: { Authorization: 'Bearer ' + s.access } });
    if (!r.ok) throw new Error('strava api ' + r.status);
    const acts = await r.json();
    for (const a of acts) if (RUN_TYPES.has(a.sport_type || a.type)) {
      const d = String(a.start_date_local || '').slice(0, 10);
      if (d) out[d] = Math.round(((out[d] || 0) + a.distance / 1000) * 10) / 10;
    }
    if (acts.length < 100) break;
  }
  return out;
}
module.exports = { MOCK, SCOPE, configured, authUrl, exchange, ensureToken, fetchDaily };
