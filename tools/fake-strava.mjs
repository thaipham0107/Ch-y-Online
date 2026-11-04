// Máy chủ Strava GIẢ để thử luồng OAuth và đồng bộ mà không cần khóa thật.
// Chạy: node tools/fake-strava.mjs [cổng=9999]
// Điều khiển khi đang chạy: GET /__mode?expired=1|0&fail=401|429|none  (mô phỏng token quá hạn / lỗi API)
import http from 'node:http';

const PORT = +process.argv[2] || +process.env.FAKE_STRAVA_PORT || 9999;
const CLIENT_ID = process.env.FAKE_CLIENT_ID || 'test-id', CLIENT_SECRET = process.env.FAKE_CLIENT_SECRET || 'test-secret';
const mode = { expired: false, fail: 'none', refreshes: 0, apiCalls: 0, tokenGen: 0 };
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(Object.fromEntries(new URLSearchParams(b)))); });

// Hoạt động mẫu: 14 ngày gần đây (giờ VN), có Run, TrailRun, VirtualRun, Ride, Walk; thêm 130 buổi để thử phân trang
function activities() {
  const out = []; const vn = Date.now() + 7 * 3600e3, day = (i) => new Date(vn - i * 864e5).toISOString().slice(0, 10);
  const add = (i, type, km, h = 6) => out.push({ id: out.length + 1, type, sport_type: type, distance: km * 1000, start_date_local: `${day(i)}T0${h}:00:00Z` });
  add(0, 'Run', 4.0); add(0, 'TrailRun', 2.5, 7); add(0, 'Ride', 30); add(1, 'Run', 5.25); add(2, 'VirtualRun', 3.0); add(2, 'Walk', 6);
  add(5, 'Run', 10.0); add(9, 'Run', 8.4); add(13, 'Run', 6.1);
  add(50, 'Run', 7.7);   // buổi chạy cũ nhất: chỉ nằm ở trang 2 khi phân trang
  for (let i = 0; i < 130; i++) add(20 + (i % 30), 'Ride', 1.0, 8);   // nhiều hoạt động để phân trang, không phải chạy bộ
  return out.sort((a, b) => (a.start_date_local < b.start_date_local ? 1 : -1));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/__mode') {
    if (url.searchParams.has('expired')) mode.expired = url.searchParams.get('expired') === '1';
    if (url.searchParams.has('fail')) mode.fail = url.searchParams.get('fail');
    return json(res, 200, mode);
  }
  if (url.pathname === '/oauth/authorize') {
    const ru = url.searchParams.get('redirect_uri'), st = url.searchParams.get('state');
    if (url.searchParams.get('client_id') !== CLIENT_ID || !ru) return json(res, 400, { message: 'Bad Request' });
    const scope = url.searchParams.get('deny') ? '' : (url.searchParams.get('scope') || 'read,activity:read');
    res.writeHead(302, { Location: `${ru}?state=${encodeURIComponent(st)}&code=fakecode&scope=${encodeURIComponent(scope)}` }); return res.end();
  }
  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const b = await body(req);
    if (b.client_id !== CLIENT_ID || b.client_secret !== CLIENT_SECRET) return json(res, 401, { message: 'Authorization Error', errors: [{ resource: 'Application', field: '', code: 'invalid' }] });
    if (b.grant_type === 'authorization_code') {
      if (b.code !== 'fakecode') return json(res, 400, { message: 'Bad Request', errors: [{ resource: 'RequestToken', field: 'code', code: 'invalid' }] });
      mode.tokenGen++;
      return json(res, 200, { token_type: 'Bearer', athlete: { id: 777, firstname: 'Fake', lastname: 'Runner' }, access_token: `acc${mode.tokenGen}`,
        refresh_token: `ref${mode.tokenGen}`, expires_at: Math.floor(Date.now() / 1000) + (mode.expired ? -60 : 21600) });
    }
    if (b.grant_type === 'refresh_token') {
      if (!/^ref\d+$/.test(b.refresh_token || '')) return json(res, 400, { message: 'Bad Request', errors: [{ resource: 'RefreshToken', field: 'refresh_token', code: 'invalid' }] });
      mode.refreshes++; mode.tokenGen++; mode.expired = false;
      return json(res, 200, { token_type: 'Bearer', access_token: `acc${mode.tokenGen}`, refresh_token: `ref${mode.tokenGen}`, expires_at: Math.floor(Date.now() / 1000) + 21600 });
    }
    return json(res, 400, { message: 'Bad Request' });
  }
  if (url.pathname === '/oauth/deauthorize' && req.method === 'POST') { mode.deauth = (mode.deauth || 0) + 1; return json(res, 200, {}); }
  if (url.pathname === '/api/v3/athlete/activities') {
    mode.apiCalls++;
    if (mode.fail === '401') return json(res, 401, { message: 'Authorization Error' });
    if (mode.fail === '429') { res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ message: 'Rate Limit Exceeded' })); }
    if (!/^Bearer acc\d+$/.test(req.headers.authorization || '')) return json(res, 401, { message: 'Authorization Error' });
    const per = Math.min(200, +url.searchParams.get('per_page') || 30), page = +url.searchParams.get('page') || 1, after = +url.searchParams.get('after') || 0;
    const list = activities().filter((a) => Date.parse(a.start_date_local) / 1000 > after);
    return json(res, 200, list.slice((page - 1) * per, page * per));
  }
  json(res, 404, { message: 'Not Found' });
}).listen(PORT, () => console.log(`Strava GIẢ chạy tại http://localhost:${PORT} (client_id=${CLIENT_ID})`));
