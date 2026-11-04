// Kiểm thử nhanh đầu-cuối: node tools/smoke.mjs http://localhost:3000 [adminUser adminPass]
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, ''), [au, ap] = [process.argv[3], process.argv[4]];
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
function jar() { const c = {}; return { async f(path, body, method) {
  const h = { cookie: Object.entries(c).map(([k, v]) => k + '=' + v).join('; ') }; const o = { headers: h, redirect: 'manual' };
  if (body !== undefined) { o.method = method || 'POST'; h['content-type'] = 'application/json'; o.body = JSON.stringify(body); } else if (method) o.method = method;
  const r = await fetch(base + path, o); for (const sc of r.headers.getSetCookie()) { const [kv] = sc.split(';'); const i = kv.indexOf('='); const v = kv.slice(i + 1); if (/Max-Age=0/i.test(sc) || !v) delete c[kv.slice(0, i)]; else c[kv.slice(0, i)] = v; }
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {}; } return { s: r.status, j, r }; }, c }; }
const u = 'sm' + Math.random().toString(36).slice(2, 8), A = jar();
let r = await A.f('/healthz'); ok(r.s === 200 && r.j.ok, 'healthz');
r = await A.f('/api/config'); ok(r.j.tiles && r.j.rules, 'config');
r = await A.f('/api/register', { username: u, password: 'secret1', name: 'Smoke' }); ok(r.s === 200 && r.j.me, 'register');
r = await A.f('/api/me'); ok(r.j.me && r.j.me.username === u, 'me (cookie phiên)');
r = await A.f('/api/login', { username: u, password: 'sai' }); ok(r.s === 401, 'login sai mật khẩu bị từ chối');
r = await A.f('/api/run/start', { map: 'haivan', dist: 1000, mode: 'manual' }); ok(r.j.runId, 'run/start'); const rid = r.j.runId;
r = await A.f('/api/run/flush', { runId: rid, steps: 10, meters: 20, secs: 5, items: {}, done: false }); ok(r.s === 200, 'run/flush ' + r.s);
r = await A.f('/api/shop/buy', { cat: 'hat', id: 'cap' }); ok(r.s === 200 || r.s === 400, 'shop/buy ' + r.s);
r = await A.f('/api/history'); ok(r.s === 200, 'history');
r = await A.f('/api/leaderboard'); ok(r.s === 200, 'leaderboard');
const now = Date.now();
r = await A.f('/api/tournaments', { title: 'Giai thu', startAt: now - 1000, endAt: now + 864e5, kind: 'sim', map: 'haivan', view: 'sat', cats: [{ km: 2 }], attempts: 0 }); ok(r.j.code, 'tạo giải'); const code = r.j.code;
r = await A.f('/api/tournaments/' + code); ok(r.j.tournament ? r.j.tournament.view === 'sat' : r.j.view === 'sat', 'chi tiết giải có view=sat');
r = await A.f('/api/tournaments/' + code + '/join', {}); ok(r.s === 200, 'join giải');
r = await A.f('/api/tournaments/public'); ok(r.s === 200, 'giải công khai');
const t = await fetch(base + '/tiles/road/12/3200/1800?v=1'); ok(t.status === 200 || t.status === 502, 'tile route ' + t.status + (t.status === 502 ? ' (không ra được nguồn ảnh)' : ''));
r = await A.f('/api/track', { a: 'open', vid: 'smokevisitor' + u }); ok(r.j.sid, 'track open'); 
r = await A.f('/api/track', { a: 'hb', vid: 'smokevisitor' + u, sid: r.j.sid, vis: true }); ok(r.s === 200, 'track hb');
// WebSocket
const wsUrl = base.replace(/^http/, 'ws') + '/ws';
const got = await new Promise((res) => { const w = new WebSocket(wsUrl); const to = setTimeout(() => res(null), 6000); w.onopen = () => w.send(JSON.stringify({ t: 'hello', map: 'haivan', name: 'WS' })); w.onmessage = (e) => { clearTimeout(to); w.close(); res(JSON.parse(e.data)); }; w.onerror = () => res(null); });
ok(got && got.t === 'welcome', 'WebSocket welcome');
if (au) {
  const B = jar();
  r = await B.f('/api/admin/login', { username: au, password: ap }); ok(r.s === 200, 'admin login');
  r = await B.f('/api/admin/overview'); ok(r.j.totals && r.j.totals.users >= 1, 'admin overview users=' + (r.j.totals && r.j.totals.users));
  r = await B.f('/api/admin/users?q=' + u); ok(r.j.users && r.j.users.length === 1, 'admin tìm người chơi'); const uid = r.j.users[0] && r.j.users[0].id;
  r = await B.f('/api/admin/users/' + uid); ok(r.j.user && r.j.runs.length >= 1, 'admin chi tiết người chơi');
  r = await B.f('/api/admin/users/' + uid + '/coins', { delta: 5 }); ok(r.s === 200, 'admin cộng xu');
  r = await B.f('/api/admin/users/' + uid + '/ban', { banned: true, reason: 'test' }); ok(r.s === 200, 'admin khóa');
  r = await jar().f('/api/login', { username: u, password: 'secret1' }); ok(r.s === 403, 'người bị khóa không đăng nhập được');
  r = await B.f('/api/admin/users/' + uid + '?confirm=' + u, undefined, 'DELETE'); ok(r.s === 200, 'admin xóa người chơi (giao dịch)');
  r = await B.f('/api/admin/tournaments/' + code, undefined, 'DELETE'); ok(r.s === 200, 'admin xóa giải');
  r = await jar().f('/api/admin/overview'); ok(r.s === 401, 'không đăng nhập thì 401');
}
console.log(fails ? `\n${fails} lỗi` : '\nTất cả đạt'); process.exit(fails ? 1 : 0);
