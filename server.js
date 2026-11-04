'use strict';
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { WebSocketServer } = require('ws');
const Shared = require('./maps');
const strava = require('./strava');

const { RULES, ITEMS, MAPS } = Shared;
const PORT = +process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- SQLite ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'chay.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
  strava TEXT, last_sync INTEGER DEFAULT 0, inventory TEXT DEFAULT '[]', created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS daily(
  user_id INTEGER NOT NULL, day TEXT NOT NULL, game_m REAL DEFAULT 0, steps INTEGER DEFAULT 0, secs INTEGER DEFAULT 0,
  bites INTEGER DEFAULT 0, jumps INTEGER DEFAULT 0, items TEXT DEFAULT '{}', PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS real_daily(user_id INTEGER NOT NULL, day TEXT NOT NULL, km REAL NOT NULL, PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS runs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, map TEXT NOT NULL, dist_m INTEGER, mode TEXT, started INTEGER NOT NULL,
  last_flush INTEGER NOT NULL, steps INTEGER DEFAULT 0, meters REAL DEFAULT 0, bolts_used INTEGER DEFAULT 0, done INTEGER DEFAULT 0);
`);
const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username=?'),
  userById: db.prepare('SELECT * FROM users WHERE id=?'),
  insUser: db.prepare('INSERT INTO users(username,name,salt,hash,created) VALUES(?,?,?,?,?)'),
  insSess: db.prepare('INSERT INTO sessions(sid,user_id,created) VALUES(?,?,?)'),
  sess: db.prepare('SELECT user_id FROM sessions WHERE sid=?'),
  delSess: db.prepare('DELETE FROM sessions WHERE sid=?'),
  getDaily: db.prepare('SELECT * FROM daily WHERE user_id=? AND day=?'),
  upDaily: db.prepare(`INSERT INTO daily(user_id,day,game_m,steps,secs,bites,jumps,items) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,day) DO UPDATE SET game_m=excluded.game_m,steps=excluded.steps,secs=excluded.secs,bites=excluded.bites,jumps=excluded.jumps,items=excluded.items`),
  insRun: db.prepare('INSERT INTO runs(user_id,map,dist_m,mode,started,last_flush) VALUES(?,?,?,?,?,?)'),
  getRun: db.prepare('SELECT * FROM runs WHERE id=? AND user_id=?'),
  upRun: db.prepare('UPDATE runs SET last_flush=?,steps=?,meters=?,bolts_used=?,done=? WHERE id=?'),
  hist: db.prepare('SELECT day,game_m,steps,secs,bites,jumps,items FROM daily WHERE user_id=? AND day>=? ORDER BY day DESC'),
  histReal: db.prepare('SELECT day,km FROM real_daily WHERE user_id=? AND day>=?'),
  upReal: db.prepare('INSERT INTO real_daily(user_id,day,km) VALUES(?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET km=excluded.km'),
  delReal: db.prepare('DELETE FROM real_daily WHERE user_id=? AND day>=?'),
  totals: db.prepare('SELECT COALESCE(SUM(game_m),0) g, COALESCE(SUM(steps),0) st, COALESCE(SUM(secs),0) se FROM daily WHERE user_id=?'),
  totalReal: db.prepare('SELECT COALESCE(SUM(km),0) r FROM real_daily WHERE user_id=?'),
  allItems: db.prepare('SELECT items FROM daily WHERE user_id=?'),
  setInv: db.prepare('UPDATE users SET inventory=? WHERE id=?'),
  setStrava: db.prepare('UPDATE users SET strava=?,last_sync=? WHERE id=?'),
  setSync: db.prepare('UPDATE users SET last_sync=? WHERE id=?'),
  lbGame: db.prepare('SELECT user_id u, SUM(game_m) g FROM daily WHERE day>=? GROUP BY user_id'),
  lbReal: db.prepare('SELECT user_id u, SUM(km) r FROM real_daily WHERE day>=? GROUP BY user_id'),
  users: db.prepare('SELECT id,name,strava FROM users')
};

// ---------- Tiện ích ----------
const VN = 7 * 3600e3;
const dayOf = (t = Date.now()) => new Date(t + VN).toISOString().slice(0, 10);
const dayAgo = (n) => dayOf(Date.now() - n * 864e5);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
const ITEM_KEYS = Object.keys(ITEMS);
const mapById = (id) => MAPS.find((m) => m.id === id);
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

function totalsFor(uid) {
  const t = q.totals.get(uid), r = q.totalReal.get(uid);
  const items = {};
  for (const row of q.allItems.all(uid)) { let o = {}; try { o = JSON.parse(row.items); } catch { /* bỏ */ } for (const k of ITEM_KEYS) items[k] = (items[k] || 0) + (o[k] || 0); }
  const gameKm = t.g / 1000, realKm = r.r;
  return { gameKm: r1(gameKm), realKm: r1(realKm), totalKm: r1(gameKm + realKm), steps: t.st, secs: t.se, items };
}
function publicMe(u) {
  const tot = totalsFor(u.id), d = dayOf();
  const dg = q.getDaily.get(u.id, d);
  const dr = db.prepare('SELECT km FROM real_daily WHERE user_id=? AND day=?').get(u.id, d);
  let inv = []; try { inv = JSON.parse(u.inventory); } catch { /* bỏ */ }
  return {
    id: u.id, username: u.username, name: u.name, stravaLinked: !!u.strava, lastSync: u.last_sync,
    totals: tot, tier: Shared.tierIndex(tot.totalKm),
    today: { gameKm: r1((dg ? dg.game_m : 0) / 1000), realKm: dr ? dr.km : 0 }, inventory: inv
  };
}

// ---------- Express ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.use('/maps.js', (req, res) => res.sendFile(path.join(__dirname, 'maps.js')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));

function parseCookies(h = '') {
  const o = {};
  for (const p of h.split(';')) { const i = p.indexOf('='); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* bỏ */ } } }
  return o;
}
function userFromCookie(header) {
  const c = parseCookies(header); const s = c.sid && q.sess.get(c.sid);
  return { cookies: c, user: s ? q.userById.get(s.user_id) : null };
}
app.use((req, res, next) => { const r = userFromCookie(req.headers.cookie); req.cookies = r.cookies; req.user = r.user; next(); });
const need = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Chưa đăng nhập' }));
function startSession(res, uid) {
  const sid = crypto.randomBytes(24).toString('hex'); q.insSess.run(sid, uid, Date.now());
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 864e5, secure: BASE_URL.startsWith('https') });
}
const rate = new Map();   // chống dò mật khẩu: tối đa 10 lần/10 phút/IP
function limited(req) {
  const k = req.ip, now = Date.now(); const a = (rate.get(k) || []).filter((t) => now - t < 600e3);
  a.push(now); rate.set(k, a); return a.length > 10;
}

app.get('/api/config', (req, res) => res.json({ strava: strava.configured(), mock: strava.MOCK, rules: RULES }));
app.get('/api/me', (req, res) => res.json({ me: req.user ? publicMe(req.user) : null }));

app.post('/api/register', (req, res) => {
  if (limited(req)) return res.status(429).json({ error: 'Thử lại sau vài phút' });
  const username = String(req.body.username || '').toLowerCase().trim();
  const pw = String(req.body.password || '');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: 'Tên đăng nhập 3-20 ký tự: chữ thường, số, gạch dưới' });
  if (pw.length < 6 || pw.length > 100) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
  if (q.userByName.get(username)) return res.status(409).json({ error: 'Tên đăng nhập đã có người dùng' });
  const salt = crypto.randomBytes(16).toString('hex');
  const r = q.insUser.run(username, cleanName(req.body.name) || username, salt, hashPw(pw, salt), Date.now());
  startSession(res, Number(r.lastInsertRowid));
  res.json({ me: publicMe(q.userById.get(Number(r.lastInsertRowid))) });
});
app.post('/api/login', (req, res) => {
  if (limited(req)) return res.status(429).json({ error: 'Thử lại sau vài phút' });
  const u = q.userByName.get(String(req.body.username || '').toLowerCase().trim());
  const pw = String(req.body.password || '');
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  startSession(res, u.id); res.json({ me: publicMe(u) });
});
app.post('/api/logout', (req, res) => { if (req.cookies.sid) q.delSess.run(req.cookies.sid); res.clearCookie('sid'); res.json({ ok: true }); });

// --- Strava (tùy chọn, chỉ cho tài khoản đã đăng nhập) ---
app.get('/auth/strava', need, (req, res) => {
  if (!strava.configured()) return res.redirect('/?err=nostrava');
  const state = crypto.randomBytes(12).toString('hex');
  res.cookie('ostate', state, { httpOnly: true, sameSite: 'lax', maxAge: 600e3 });
  res.redirect(strava.authUrl(`${BASE_URL}/auth/strava/callback`, state));
});
app.get('/auth/strava/callback', need, async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/?err=denied');
    if (!req.query.state || req.query.state !== req.cookies.ostate) return res.redirect('/?err=state');
    if (!String(req.query.scope || '').includes('activity:read')) return res.redirect('/?err=scope');
    const t = await strava.exchange(String(req.query.code));
    const s = { athleteId: t.athlete && t.athlete.id, access: t.access_token, refresh: t.refresh_token, expires: t.expires_at };
    q.setStrava.run(JSON.stringify(s), 0, req.user.id);
    res.clearCookie('ostate');
    try { await syncStrava(q.userById.get(req.user.id)); } catch (e) { console.error('sync lỗi', e.message); }
    res.redirect('/?strava=ok');
  } catch (e) { console.error('oauth lỗi', e.message); res.redirect('/?err=strava'); }
});
async function syncStrava(u) {
  const s = JSON.parse(u.strava);
  await strava.ensureToken(s);
  const since = Math.floor(Date.parse(dayAgo(60) + 'T00:00:00+07:00') / 1000);
  const days = await strava.fetchDaily(s, since);
  db.exec('BEGIN');
  try {
    q.delReal.run(u.id, dayAgo(60));
    for (const [d, km] of Object.entries(days)) q.upReal.run(u.id, d, km);
    q.setStrava.run(JSON.stringify(s), Date.now(), u.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
app.post('/api/strava/sync', need, async (req, res) => {
  const u = req.user;
  if (!u.strava) return res.status(400).json({ error: 'Chưa kết nối Strava' });
  if (Date.now() - u.last_sync < 60e3) return res.status(429).json({ error: 'Đợi một phút rồi đồng bộ lại nhé' });
  try { await syncStrava(u); res.json({ me: publicMe(q.userById.get(u.id)) }); }
  catch (e) { res.status(502).json({ error: 'Không lấy được dữ liệu Strava' }); }
});
app.post('/api/strava/unlink', need, (req, res) => {
  q.setStrava.run(null, 0, req.user.id); db.prepare('DELETE FROM real_daily WHERE user_id=?').run(req.user.id);
  res.json({ me: publicMe(q.userById.get(req.user.id)) });
});

// --- Chuyến chạy: client báo số bước, server kiểm tra nhịp bước và quy đổi ra km ---
app.post('/api/run/start', need, (req, res) => {
  const m = mapById(String(req.body.map));
  if (!m) return res.status(400).json({ error: 'Bản đồ không tồn tại' });
  const r = q.insRun.run(req.user.id, m.id, Math.round(clamp(+req.body.dist || 0, 0, m.km * 1000)), req.body.mode === 'auto' ? 'auto' : 'manual', Date.now(), Date.now());
  res.json({ runId: Number(r.lastInsertRowid) });
});
app.post('/api/run/flush', need, (req, res) => {
  const b = req.body || {};
  const run = q.getRun.get(+b.runId || 0, req.user.id);
  if (!run) return res.status(404).json({ error: 'Không có chuyến chạy' });
  const now = Date.now();
  const dt = clamp((now - run.last_flush) / 1000, 0, 180);
  const steps = clamp(Math.floor(+b.steps || 0), 0, Math.floor(RULES.MAX_STEPS_PER_SEC * dt * 1.05) + 6);
  const bolts = clamp(Math.floor(+b.boltsUsed || 0), 0, 5);
  const boostSteps = Math.min(steps, bolts * RULES.BOLT_SECS * RULES.MAX_STEPS_PER_SEC);
  const maxM = steps * RULES.STRIDE + boostSteps * (RULES.BOLT_STRIDE - RULES.STRIDE);
  const meters = clamp(+b.meters || 0, 0, maxM);
  const itemCap = Math.ceil(meters / 60) + 3;
  const items = {}; let total = 0;
  for (const k of ITEM_KEYS) { const n = clamp(Math.floor(+(b.items || {})[k] || 0), 0, itemCap); items[k] = Math.min(n, Math.max(0, itemCap - total)); total += items[k]; }
  const day = dayOf();
  const d = q.getDaily.get(req.user.id, day) || { game_m: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: '{}' };
  let it = {}; try { it = JSON.parse(d.items); } catch { /* bỏ */ }
  for (const k of ITEM_KEYS) it[k] = (it[k] || 0) + items[k];
  q.upDaily.run(req.user.id, day, d.game_m + meters, d.steps + steps, d.secs + Math.round(Math.min(dt, +b.secs || dt)),
    d.bites + clamp(Math.floor(+b.bites || 0), 0, 20), d.jumps + clamp(Math.floor(+b.jumps || 0), 0, 200), JSON.stringify(it));
  q.upRun.run(now, run.steps + steps, run.meters + meters, run.bolts_used + bolts, b.done ? 1 : run.done, run.id);
  res.json({ ok: true, credited: r1(meters) });
});
app.post('/api/inventory', need, (req, res) => {
  const inv = (Array.isArray(req.body.inv) ? req.body.inv : []).slice(0, RULES.INV_SLOTS)
    .filter((s) => s && own(ITEMS, s.k)).map((s) => ({ k: s.k, n: clamp(Math.floor(+s.n || 0), 1, RULES.INV_STACK) }));
  q.setInv.run(JSON.stringify(inv), req.user.id); res.json({ ok: true });
});

// --- Lịch sử & xếp hạng: cột Game, cột Ngoài đời (Strava), cột Tổng ---
app.get('/api/history', need, (req, res) => {
  const since = dayAgo(clamp(+req.query.days || 90, 1, 400));
  const map = new Map();
  for (const r of q.hist.all(req.user.id, since)) {
    let items = {}; try { items = JSON.parse(r.items); } catch { /* bỏ */ }
    map.set(r.day, { day: r.day, gameKm: r1(r.game_m / 1000), realKm: 0, steps: r.steps, secs: r.secs, bites: r.bites, jumps: r.jumps, items });
  }
  for (const r of q.histReal.all(req.user.id, since)) {
    const e = map.get(r.day) || { day: r.day, gameKm: 0, realKm: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: {} };
    e.realKm = r.km; map.set(r.day, e);
  }
  const rows = [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map((e) => ({ ...e, totalKm: r1(e.gameKm + e.realKm) }));
  res.json({ rows });
});
app.get('/api/leaderboard', (req, res) => {
  const p = ['today', 'week', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const since = p === 'today' ? dayOf() : p === 'week' ? dayAgo(6) : '0000-00-00';
  const agg = new Map();
  for (const r of q.lbGame.all(since)) agg.set(r.u, { g: r.g / 1000, r: 0 });
  for (const r of q.lbReal.all(since)) { const e = agg.get(r.u) || { g: 0, r: 0 }; e.r = r.r; agg.set(r.u, e); }
  const names = new Map(q.users.all().map((u) => [u.id, u]));
  const rows = [...agg.entries()].filter(([id]) => names.has(id)).map(([id, e]) => {
    const total = totalsFor(id).totalKm;
    return { name: names.get(id).name, gameKm: r1(e.g), realKm: r1(e.r), totalKm: r1(e.g + e.r), tier: Shared.tierIndex(total), strava: !!names.get(id).strava, me: !!(req.user && req.user.id === id) };
  }).filter((r) => r.totalKm > 0).sort((a, b) => b.totalKm - a.totalKm).slice(0, 20);
  res.json({ period: p, rows });
});

// ---------- Hiện diện nhiều người (cùng bản đồ thấy nhau) ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const rooms = new Map();   // key -> Set(player)
let nextPid = 1;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function bcast(room, o, except) { const s = JSON.stringify(o); for (const p of room) if (p !== except && p.ws.readyState === 1) p.ws.send(s); }

wss.on('connection', (ws, req) => {
  const { user } = userFromCookie(req.headers.cookie);
  const p = { id: nextPid++, ws, user, room: null, s: 0, j: 0, mv: 0, name: 'Khách', km: 0, tier: 0, last: 0 };
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m) return;
    if (m.t === 'hello' && !p.room) {
      const map = mapById(String(m.map)); if (!map) return;
      if (user) { const tot = totalsFor(user.id); p.name = user.name; p.km = tot.totalKm; }
      else { p.name = cleanName(m.name) || 'Khách'; p.km = r1(clamp(+m.km || 0, 0, 20000)); p.guest = 1; }
      p.tier = Shared.tierIndex(p.km);
      let key = null;
      for (let k = 1; ; k++) { const kk = map.id + '#' + k; const set = rooms.get(kk) || new Set(); if (set.size < 30) { key = kk; rooms.set(kk, set); break; } }
      p.room = rooms.get(key); p.room.add(p);
      const info = (o) => ({ id: o.id, name: o.name, km: o.km, tier: o.tier, s: o.s, j: o.j, mv: o.mv });
      send(ws, { t: 'welcome', id: p.id, players: [...p.room].filter((o) => o !== p).map(info) });
      bcast(p.room, { t: 'join', p: info(p) }, p);
    } else if (m.t === 'pos' && p.room) {
      const now = Date.now(); if (now - p.last < 80) return; p.last = now;
      const s = +m.s; if (Number.isFinite(s)) p.s = clamp(s, 0, 50000);
      p.j = m.j ? 1 : 0; p.mv = m.mv ? 1 : 0;
    }
  });
  ws.on('close', () => { if (p.room) { p.room.delete(p); bcast(p.room, { t: 'leave', id: p.id }); } });
  ws.on('error', () => {});
});
setInterval(() => {
  for (const room of rooms.values()) if (room.size > 1) bcast(room, { t: 'snap', p: [...room].map((p) => [p.id, +p.s.toFixed(1), p.j, p.mv]) });
}, 200);

if (require.main === module) {
  server.listen(PORT, () => console.log(`Chạy Online 3D: ${BASE_URL}  (Strava: ${strava.MOCK ? 'DEMO giả' : strava.configured() ? 'đã cấu hình' : 'chưa cấu hình'})`));
}
module.exports = { app, server };
