'use strict';
// Tích hợp Strava (OAuth + số liệu chạy). STRAVA_MOCK=1 dùng dữ liệu giả để thử.
const MOCK = process.env.STRAVA_MOCK === '1';
const CLIENT_ID = process.env.STRAVA_CLIENT_ID || '';
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || '';
const SCOPE = process.env.STRAVA_SCOPE || 'read,activity:read';
const RUN_TYPES = new Set(['Run', 'TrailRun', 'VirtualRun']);

const configured = () => MOCK || !!(CLIENT_ID && CLIENT_SECRET);

function authUrl(redirectUri, state) {
  if (MOCK) return `${redirectUri}?state=${state}&code=mock&scope=read,activity:read`;
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
    approval_prompt: 'auto', scope: SCOPE, state
  });
  return 'https://www.strava.com/oauth/authorize?' + q;
}

async function tokenRequest(params) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params })
  });
  if (!r.ok) throw new Error('strava token ' + r.status);
  return r.json();
}

async function exchange(code) {
  if (MOCK) {
    return {
      athlete: { id: 424242, firstname: 'Runner', lastname: 'Demo', profile_medium: '' },
      access_token: 'mock', refresh_token: 'mock', expires_at: Math.floor(Date.now() / 1000) + 3600
    };
  }
  return tokenRequest({ code, grant_type: 'authorization_code' });
}

async function ensureToken(s) {
  if (MOCK || s.expires * 1000 - Date.now() > 60000) return s;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh });
  s.access = t.access_token; s.refresh = t.refresh_token; s.expires = t.expires_at;
  return s;
}

async function api(path, token) {
  const r = await fetch('https://www.strava.com/api/v3' + path, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('strava api ' + r.status);
  return r.json();
}

// Trả về { recent, ytd, all, today } (đơn vị km, chỉ tính chạy bộ)
async function fetchKm(s, dayStartEpoch) {
  if (MOCK) return { recent: 87.3, ytd: 1234.5, all: 3210.9, today: 6.4 };
  const stats = await api(`/athletes/${s.athleteId}/stats`, s.access);
  const acts = await api(`/athlete/activities?after=${dayStartEpoch}&per_page=100`, s.access);
  const km = (t) => Math.round(((t && t.distance) || 0) / 100) / 10;
  const today = acts.filter(a => RUN_TYPES.has(a.sport_type || a.type))
    .reduce((sum, a) => sum + (a.distance || 0), 0) / 1000;
  return {
    recent: km(stats.recent_run_totals), ytd: km(stats.ytd_run_totals), all: km(stats.all_run_totals),
    today: Math.round(today * 10) / 10
  };
}

module.exports = { MOCK, SCOPE, configured, authUrl, exchange, ensureToken, fetchKm };
