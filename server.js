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

const { RULES, ITEMS, MAPS, COIN, SHOP, SHOP_DEFAULT } = Shared;
try { Shared.applyMeta(JSON.parse(fs.readFileSync(path.join(__dirname, 'public/courses/meta.json'), 'utf8'))); } catch { /* chưa dựng dữ liệu đường chạy: dùng số liệu mặc định */ }
const PORT = +process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || strava.FILE_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
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
CREATE TABLE IF NOT EXISTS tournaments(
  code TEXT PRIMARY KEY, owner INTEGER NOT NULL, title TEXT NOT NULL, descr TEXT, visibility TEXT NOT NULL,
  start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, live_at INTEGER, kind TEXT NOT NULL, map TEXT, route TEXT,
  cats TEXT NOT NULL, attempts INTEGER DEFAULT 0, medals TEXT NOT NULL, seed INTEGER NOT NULL, finalized INTEGER DEFAULT 0, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS participants(tid TEXT NOT NULL, pkey TEXT NOT NULL, name TEXT NOT NULL, guest INTEGER DEFAULT 0, joined INTEGER NOT NULL, PRIMARY KEY(tid, pkey));
CREATE TABLE IF NOT EXISTS results(
  id INTEGER PRIMARY KEY, tid TEXT NOT NULL, pkey TEXT NOT NULL, cat TEXT NOT NULL, status TEXT NOT NULL,
  time_s REAL, dist_m REAL, steps INTEGER, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS awards(tid TEXT NOT NULL, pkey TEXT NOT NULL, cat TEXT NOT NULL, kind TEXT NOT NULL, rank INTEGER, time_s REAL, PRIMARY KEY(tid, pkey, cat));
`);
function addCol(table, col, def) { if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); }
addCol('users', 'coins', 'INTEGER DEFAULT 0'); addCol('users', 'coin_rem', 'REAL DEFAULT 0'); addCol('users', 'owned', "TEXT DEFAULT '[]'");
addCol('users', 'equip', "TEXT DEFAULT '{}'"); addCol('users', 'imported', 'INTEGER DEFAULT 0');
addCol('daily', 'imp', 'REAL DEFAULT 0'); addCol('real_daily', 'paid', 'REAL DEFAULT 0');
addCol('tournaments', 'view', "TEXT DEFAULT '3d'"); addCol('runs', 'go', 'INTEGER DEFAULT 0'); addCol('runs', 'pkey', 'TEXT'); addCol('runs', 'tid', 'TEXT'); addCol('runs', 'cat', 'TEXT'); addCol('runs', 'seed', 'INTEGER');

const q = {
  userByName: db.prepare('SELECT * FROM users WHERE username=?'),
  userById: db.prepare('SELECT * FROM users WHERE id=?'),
  insUser: db.prepare('INSERT INTO users(username,name,salt,hash,created) VALUES(?,?,?,?,?)'),
  insSess: db.prepare('INSERT INTO sessions(sid,user_id,created) VALUES(?,?,?)'),
  sess: db.prepare('SELECT user_id FROM sessions WHERE sid=?'),
  delSess: db.prepare('DELETE FROM sessions WHERE sid=?'),
  getDaily: db.prepare('SELECT * FROM daily WHERE user_id=? AND day=?'),
  upDaily: db.prepare(`INSERT INTO daily(user_id,day,game_m,steps,secs,bites,jumps,items,imp) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,day) DO UPDATE SET game_m=excluded.game_m,steps=excluded.steps,secs=excluded.secs,bites=excluded.bites,jumps=excluded.jumps,items=excluded.items,imp=excluded.imp`),
  insRun: db.prepare('INSERT INTO runs(user_id,map,dist_m,mode,started,last_flush,pkey,tid,cat,seed) VALUES(?,?,?,?,?,?,?,?,?,?)'),
  getRun: db.prepare('SELECT * FROM runs WHERE id=?'),
  upRun: db.prepare('UPDATE runs SET last_flush=?,steps=?,meters=?,bolts_used=?,done=? WHERE id=?'),
  hist: db.prepare('SELECT day,game_m,steps,secs,bites,jumps,items FROM daily WHERE user_id=? AND day>=? ORDER BY day DESC'),
  histReal: db.prepare('SELECT day,km FROM real_daily WHERE user_id=? AND day>=?'),
  getReal: db.prepare('SELECT day,km,paid FROM real_daily WHERE user_id=?'),
  upReal: db.prepare('INSERT INTO real_daily(user_id,day,km,paid) VALUES(?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET km=excluded.km,paid=excluded.paid'),
  totals: db.prepare('SELECT COALESCE(SUM(game_m),0) g, COALESCE(SUM(steps),0) st, COALESCE(SUM(secs),0) se FROM daily WHERE user_id=?'),
  totalReal: db.prepare('SELECT COALESCE(SUM(km),0) r FROM real_daily WHERE user_id=?'),
  allItems: db.prepare('SELECT items FROM daily WHERE user_id=?'),
  setInv: db.prepare('UPDATE users SET inventory=? WHERE id=?'),
  setStrava: db.prepare('UPDATE users SET strava=?,last_sync=? WHERE id=?'),
  lbGame: db.prepare('SELECT user_id u, SUM(game_m - imp) g FROM daily WHERE day>=? GROUP BY user_id'),
  lbReal: db.prepare('SELECT user_id u, SUM(km) r FROM real_daily WHERE day>=? GROUP BY user_id'),
  users: db.prepare('SELECT id,name,strava FROM users'),
  setCoins: db.prepare('UPDATE users SET coins=?,coin_rem=? WHERE id=?'),
  setShop: db.prepare('UPDATE users SET coins=?,owned=?,equip=? WHERE id=?'),
  // giải đấu
  tGet: db.prepare('SELECT * FROM tournaments WHERE code=?'),
  tIns: db.prepare('INSERT INTO tournaments(code,owner,title,descr,visibility,start_at,end_at,live_at,kind,map,route,cats,attempts,medals,seed,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  tPublic: db.prepare("SELECT * FROM tournaments WHERE visibility='public' AND end_at>? ORDER BY start_at ASC LIMIT 60"),
  tMine: db.prepare('SELECT t.* FROM tournaments t WHERE t.owner=? OR t.code IN (SELECT tid FROM participants WHERE pkey=?) ORDER BY t.start_at DESC LIMIT 60'),
  tOwnedToday: db.prepare('SELECT COUNT(*) n FROM tournaments WHERE owner=? AND created>?'),
  tOpen: db.prepare('SELECT * FROM tournaments WHERE finalized=0 AND end_at<?'),
  pGet: db.prepare('SELECT * FROM participants WHERE tid=? AND pkey=?'),
  pIns: db.prepare('INSERT OR IGNORE INTO participants(tid,pkey,name,guest,joined) VALUES(?,?,?,?,?)'),
  pList: db.prepare('SELECT * FROM participants WHERE tid=?'),
  pCount: db.prepare('SELECT COUNT(*) n FROM participants WHERE tid=?'),
  rIns: db.prepare('INSERT INTO results(tid,pkey,cat,status,time_s,dist_m,steps,created) VALUES(?,?,?,?,?,?,?,?)'),
  rList: db.prepare('SELECT * FROM results WHERE tid=?'),
  runCount: db.prepare('SELECT COUNT(*) n FROM runs WHERE tid=? AND pkey=? AND cat=?'),
  runBest: db.prepare('SELECT pkey,cat,MAX(meters) m FROM runs WHERE tid=? GROUP BY pkey,cat'),
  aIns: db.prepare('INSERT OR IGNORE INTO awards(tid,pkey,cat,kind,rank,time_s) VALUES(?,?,?,?,?,?)'),
  aList: db.prepare('SELECT * FROM awards WHERE tid=?'),
  aMine: db.prepare('SELECT a.*, t.title, t.medals FROM awards a JOIN tournaments t ON t.code=a.tid WHERE a.pkey=? ORDER BY t.end_at DESC'),
  setFinal: db.prepare('UPDATE tournaments SET finalized=1 WHERE code=?')
};

// ---------- Tiện ích ----------
const VN = 7 * 3600e3;
const dayOf = (t = Date.now()) => new Date(t + VN).toISOString().slice(0, 10);
const dayAgo = (n) => dayOf(Date.now() - n * 864e5);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
const cleanText = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const ITEM_KEYS = [...Object.keys(ITEMS), 'coin'];
const mapById = (id) => MAPS.find((m) => m.id === id);
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const shopById = (id) => SHOP.filter((x) => x.id === id);   // một id có thể xuất hiện ở nhiều nhóm ('none')

function ownedSet(u) { return new Set(jparse(u.owned, [])); }
function equipOf(u) {
  const e = { ...SHOP_DEFAULT, ...jparse(u.equip, {}) }, owned = ownedSet(u);
  for (const cat of Object.keys(SHOP_DEFAULT)) { const it = Shared.shopItem(cat, e[cat]); if (!it || (it.price > 0 && !owned.has(cat + ':' + it.id))) e[cat] = SHOP_DEFAULT[cat]; }
  return e;
}
function totalsFor(uid) {
  const t = q.totals.get(uid), r = q.totalReal.get(uid), items = {};
  for (const row of q.allItems.all(uid)) { const o = jparse(row.items, {}); for (const k of ITEM_KEYS) items[k] = (items[k] || 0) + (o[k] || 0); }
  const gameKm = t.g / 1000, realKm = r.r;
  return { gameKm: r1(gameKm), realKm: r1(realKm), totalKm: r1(gameKm + realKm), steps: t.st, secs: t.se, items };
}
function publicMe(u) {
  u = q.userById.get(u.id);
  const tot = totalsFor(u.id), d = dayOf(), dg = q.getDaily.get(u.id, d);
  const dr = db.prepare('SELECT km FROM real_daily WHERE user_id=? AND day=?').get(u.id, d);
  return {
    id: u.id, username: u.username, name: u.name, stravaLinked: !!u.strava, lastSync: u.last_sync,
    totals: tot, tier: Shared.tierIndex(tot.totalKm), today: { gameKm: r1((dg ? dg.game_m : 0) / 1000), realKm: dr ? dr.km : 0 },
    inventory: jparse(u.inventory, []), coins: u.coins, owned: [...ownedSet(u)], equip: equipOf(u), imported: !!u.imported
  };
}

// ---------- Express ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '300kb' }));
app.use('/maps.js', (req, res) => res.sendFile(path.join(__dirname, 'maps.js')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist')));
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
// danh tính: tài khoản, hoặc khách (mã thiết bị ngẫu nhiên do trình duyệt tạo)
function who(req) {
  if (req.user) return { key: 'u' + req.user.id, name: req.user.name, guest: 0, user: req.user };
  const gid = String(req.headers['x-guest'] || '');
  if (!/^[a-z0-9]{12,40}$/.test(gid)) return null;
  let name = 'Khách'; try { name = cleanName(decodeURIComponent(String(req.headers['x-name'] || ''))) || 'Khách'; } catch { /* mặc định */ }
  return { key: 'g' + gid, name, guest: 1, user: null };
}
const needWho = (req, res, next) => { req.who = who(req); return req.who ? next() : res.status(401).json({ error: 'Cần đăng nhập hoặc chơi khách' }); };
function startSession(res, uid) {
  const sid = crypto.randomBytes(24).toString('hex'); q.insSess.run(sid, uid, Date.now());
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 864e5, secure: BASE_URL.startsWith('https') });
}
const rate = new Map();
function limited(req, key = 'auth', max = 10, win = 600e3) {
  const k = key + req.ip, now = Date.now(); const a = (rate.get(k) || []).filter((t) => now - t < win); a.push(now); rate.set(k, a); return a.length > max;
}

// ---------- Kho ảnh bản đồ ----------
// Ảnh bản đồ/vệ tinh là dữ liệu cố định: server tải từ nguồn một lần, lưu vào DATA_DIR/tiles rồi phát cho mọi client
// (kèm Cache-Control immutable). Đổi TILES_VERSION khi muốn client và kho tải lại; TILE_CACHE=0 để tắt lưu trên server.
const TILE_VER = String(process.env.TILES_VERSION || '1').replace(/[^\w.-]/g, '').slice(0, 20) || '1';
const TILE_UP = {
  road: process.env.TILES_ROAD || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  sat: process.env.TILES_SAT || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
};
const TILES = {
  road: `/tiles/road/{z}/{x}/{y}?v=${TILE_VER}`, sat: `/tiles/sat/{z}/{x}/{y}?v=${TILE_VER}`, version: TILE_VER,
  attrRoad: process.env.TILES_ROAD_ATTR || '© OpenStreetMap contributors',
  attrSat: process.env.TILES_SAT_ATTR || 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics'
};
const TILE_DIR = path.join(DATA_DIR, 'tiles'), TILE_STORE = process.env.TILE_CACHE !== '0', TILE_CAP = (+process.env.TILE_CACHE_MB || 3000) * 1048576;
let tileBytes = 0;
(function scan(d) { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) scan(f); else tileBytes += fs.statSync(f).size; } } catch { /* chưa có kho */ } })(TILE_DIR);
const tileInflight = new Map(); let tileActive = 0; const tileWait = [];
const tileSlot = () => new Promise((res) => { const go = () => { tileActive++; res(); }; if (tileActive < 6) go(); else tileWait.push(go); });
const tileFree = () => { tileActive--; const n = tileWait.shift(); if (n) n(); };
const TILE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }, TILE_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
async function fetchTile(style, z, x, y) {
  const url = TILE_UP[style].replace('{z}', z).replace('{x}', x).replace('{y}', y);
  await tileSlot();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA_TILE }, signal: AbortSignal.timeout(20000) });
    const type = (r.headers.get('content-type') || '').split(';')[0], ext = TILE_EXT[type];
    if (!r.ok || !ext) throw new Error('tile ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 2e6) throw new Error('tile quá lớn');
    if (TILE_STORE && tileBytes + buf.length < TILE_CAP) {
      const dir = path.join(TILE_DIR, style, String(z), String(x)); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${y}.${ext}`), buf); tileBytes += buf.length;
    }
    return { buf, ext };
  } finally { tileFree(); }
}
const UA_TILE = `ChayOnline/1.0 (${BASE_URL})`;
app.get('/tiles/:style/:z/:x/:y', async (req, res) => {
  const style = req.params.style, z = +req.params.z, x = +req.params.x, y = +String(req.params.y).replace(/\.\w+$/, '');
  if (!TILE_UP[style] || !Number.isInteger(z) || z < 3 || z > 19 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return res.status(400).end();
  if (limited(req, 'tile', 6000, 60e3)) return res.status(429).end();
  const send = (buf, ext) => { res.set({ 'Content-Type': TILE_MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' }); res.end(buf); };
  for (const ext of Object.keys(TILE_MIME)) { const f = path.join(TILE_DIR, style, String(z), String(x), `${y}.${ext}`); if (fs.existsSync(f)) { res.set({ 'Content-Type': TILE_MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' }); return res.sendFile(f); } }
  const key = `${style}/${z}/${x}/${y}`;
  try { let p = tileInflight.get(key); if (!p) { p = fetchTile(style, z, x, y).finally(() => tileInflight.delete(key)); tileInflight.set(key, p); } const t = await p; send(t.buf, t.ext); }
  catch { res.status(502).end(); }
});
app.get('/api/tiles/stats', (req, res) => res.json({ version: TILE_VER, store: TILE_STORE, mb: Math.round(tileBytes / 1048576), capMb: Math.round(TILE_CAP / 1048576) }));
app.get('/api/config', (req, res) => res.json({ strava: strava.configured(), mock: strava.MOCK, rules: RULES, tiles: TILES }));
app.get('/api/me', (req, res) => { if (req.user) autoSync(req.user); res.json({ me: req.user ? publicMe(req.user) : null }); });

app.post('/api/register', (req, res) => {
  if (limited(req)) return res.status(429).json({ error: 'Thử lại sau vài phút' });
  const username = String(req.body.username || '').toLowerCase().trim(), pw = String(req.body.password || '');
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
  const u = q.userByName.get(String(req.body.username || '').toLowerCase().trim()), pw = String(req.body.password || '');
  const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  startSession(res, u.id); res.json({ me: publicMe(u) });
});
app.post('/api/logout', (req, res) => { if (req.cookies.sid) q.delSess.run(req.cookies.sid); res.clearCookie('sid'); res.json({ ok: true }); });

// ---------- Strava (tùy chọn) ----------
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
    q.setStrava.run(JSON.stringify({ athleteId: t.athlete && t.athlete.id, access: t.access_token, refresh: t.refresh_token, expires: t.expires_at }), 0, req.user.id);
    res.clearCookie('ostate');
    try { await syncStrava(q.userById.get(req.user.id)); } catch (e) { console.error('sync lỗi', e.message); }
    res.redirect('/?strava=ok');
  } catch (e) { console.error('oauth lỗi', e.message); res.redirect('/?err=' + (e.code === 'rate' ? 'rate' : 'strava')); }
});
// Đồng bộ một người: không chạy chồng, tôn trọng hạn mức (429), tự ngắt kết nối khi Strava thu hồi quyền
const syncing = new Set(); let rateUntil = 0;
async function syncStrava(u) {
  const s = jparse(u.strava, null); if (!s) return;
  if (syncing.has(u.id)) return; syncing.add(u.id);
  try {
    let days;
    try {
      await strava.ensureToken(s);
      q.setStrava.run(JSON.stringify(s), u.last_sync, u.id);          // lưu token mới ngay (Strava đổi refresh token mỗi lần làm mới)
      days = await strava.fetchDaily(s, Math.floor(Date.parse(dayAgo(60) + 'T00:00:00+07:00') / 1000));
    } catch (e) {
      if (e.code === 'revoked') { q.setStrava.run(null, 0, u.id); db.prepare('DELETE FROM real_daily WHERE user_id=?').run(u.id); }
      if (e.code === 'rate') rateUntil = Date.now() + 15 * 60e3;
      throw e;
    }
    const old = new Map(q.getReal.all(u.id).map((r) => [r.day, r]));
    let coinKm = 0; const recent = dayAgo(3);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM real_daily WHERE user_id=? AND day>=?').run(u.id, dayAgo(60));
      for (const [d, km] of Object.entries(days)) {
        const o = old.get(d); let paid = o ? o.paid : 0;
        if (d >= recent && km > paid) { coinKm += km - paid; paid = km; }   // thưởng xu cho km thật gần đây
        q.upReal.run(u.id, d, km, paid);
      }
      const fresh = q.userById.get(u.id), tot = (fresh.coin_rem || 0) + coinKm * COIN.PER_KM_REAL;
      q.setCoins.run(fresh.coins + Math.floor(tot), tot - Math.floor(tot), u.id);
      q.setStrava.run(JSON.stringify(s), Date.now(), u.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { syncing.delete(u.id); }
}
// tự đồng bộ nền khi mở game (không chặn): tối đa mỗi 15 phút/người, cách nhau 5 phút giữa các lần thử
const lastTry = new Map();
function autoSync(u) {
  if (!u || !u.strava || strava.MOCK) return;
  const now = Date.now();
  if (now < rateUntil || now - u.last_sync < 15 * 60e3 || now - (lastTry.get(u.id) || 0) < 5 * 60e3) return;
  lastTry.set(u.id, now);
  syncStrava(u).catch((e) => console.error('đồng bộ nền lỗi:', e.message));
}
const syncError = (res, e) => {
  if (e.code === 'revoked') return res.status(409).json({ error: 'Strava đã thu hồi quyền, hãy kết nối lại', revoked: true });
  if (e.code === 'rate') return res.status(429).json({ error: 'Strava đang giới hạn số lần gọi, thử lại sau ít phút' });
  return res.status(502).json({ error: 'Không lấy được dữ liệu Strava' });
};
app.post('/api/strava/sync', need, async (req, res) => {
  const u = req.user;
  if (!u.strava) return res.status(400).json({ error: 'Chưa kết nối Strava' });
  if (Date.now() - u.last_sync < 60e3) return res.status(429).json({ error: 'Đợi một phút rồi đồng bộ lại nhé' });
  if (Date.now() < rateUntil) return res.status(429).json({ error: 'Strava đang giới hạn số lần gọi, thử lại sau ít phút' });
  try { await syncStrava(u); res.json({ me: publicMe(u) }); } catch (e) { console.error('sync lỗi', e.message); syncError(res, e); }
});
app.post('/api/strava/unlink', need, (req, res) => {
  const s = jparse(req.user.strava, null);
  q.setStrava.run(null, 0, req.user.id); db.prepare('DELETE FROM real_daily WHERE user_id=?').run(req.user.id);
  strava.deauthorize(s);
  res.json({ me: publicMe(req.user) });
});

// ---------- Chuyến chạy: server kiểm tra nhịp bước rồi quy đổi ra km, xu ----------
function applyFlush(run, b, user) {
  const now = Date.now(), dt = clamp((now - run.last_flush) / 1000, 0, 180);
  const steps = clamp(Math.floor(+b.steps || 0), 0, Math.floor(RULES.MAX_STEPS_PER_SEC * dt * 1.05) + 6);
  const bolts = clamp(Math.floor(+b.boltsUsed || 0), 0, 5);
  const boost = Math.min(steps, bolts * RULES.BOLT_SECS * RULES.MAX_STEPS_PER_SEC);
  const meters = clamp(+b.meters || 0, 0, steps * RULES.STRIDE + boost * (RULES.BOLT_STRIDE - RULES.STRIDE));
  const cap = Math.ceil(meters / 60) + 3, items = {}; let total = 0;
  for (const k of Object.keys(ITEMS)) { const n = clamp(Math.floor(+(b.items || {})[k] || 0), 0, cap); items[k] = Math.min(n, Math.max(0, cap - total)); total += items[k]; }
  items.coin = clamp(Math.floor(+(b.items || {}).coin || 0), 0, Math.ceil(meters / 2.5) + 6);
  const newMeters = run.meters + meters;
  const finishedNow = !!b.done && !run.done && run.dist_m > 0 && newMeters >= run.dist_m - 6;
  let coins = 0;
  if (user) {
    const day = dayOf(), d = q.getDaily.get(user.id, day) || { game_m: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: '{}', imp: 0 };
    const it = jparse(d.items, {}); for (const k of ITEM_KEYS) it[k] = (it[k] || 0) + (items[k] || 0);
    q.upDaily.run(user.id, day, d.game_m + meters, d.steps + steps, d.secs + Math.round(Math.min(dt, +b.secs || dt)),
      d.bites + clamp(Math.floor(+b.bites || 0), 0, 20), d.jumps + clamp(Math.floor(+b.jumps || 0), 0, 200), JSON.stringify(it), d.imp || 0);
    const fresh = q.userById.get(user.id), earn = (fresh.coin_rem || 0) + meters / 1000 * COIN.PER_KM_GAME;
    coins = Math.floor(earn) + items.coin + (finishedNow ? COIN.FINISH : 0);
    q.setCoins.run(fresh.coins + coins, earn - Math.floor(earn), user.id);
  }
  q.upRun.run(now, run.steps + steps, newMeters, run.bolts_used + bolts, (b.done || run.done) ? 1 : 0, run.id);
  return { credited: r1(meters), coins, finishedNow, meters: newMeters, steps: run.steps + steps };
}
app.post('/api/run/start', need, (req, res) => {
  const m = mapById(String(req.body.map));
  const dist = Math.round(clamp(+req.body.dist || 0, 0, (m ? m.km : 40) * 1000));
  const gps = String(req.body.map).startsWith('gps');
  if (!m && !gps) return res.status(400).json({ error: 'Bản đồ không tồn tại' });
  const r = q.insRun.run(req.user.id, String(req.body.map).slice(0, 40), dist, req.body.mode === 'auto' ? 'auto' : 'manual', Date.now(), Date.now(), 'u' + req.user.id, null, null, null);
  res.json({ runId: Number(r.lastInsertRowid) });
});
app.post('/api/run/flush', need, (req, res) => {
  const run = q.getRun.get(+req.body.runId || 0);
  if (!run || run.user_id !== req.user.id || run.tid) return res.status(404).json({ error: 'Không có chuyến chạy' });
  res.json({ ok: true, ...applyFlush(run, req.body, req.user) });
});
app.post('/api/inventory', need, (req, res) => {
  const inv = (Array.isArray(req.body.inv) ? req.body.inv : []).slice(0, RULES.INV_SLOTS)
    .filter((s) => s && own(ITEMS, s.k)).map((s) => ({ k: s.k, n: clamp(Math.floor(+s.n || 0), 1, RULES.INV_STACK) }));
  q.setInv.run(JSON.stringify(inv), req.user.id); res.json({ ok: true });
});

// ---------- Cửa hàng ----------
app.post('/api/shop/buy', need, (req, res) => {
  const u = q.userById.get(req.user.id), it = Shared.shopItem(String(req.body.cat), String(req.body.id));
  if (!it) return res.status(400).json({ error: 'Không có vật phẩm này' });
  const owned = ownedSet(u), key = it.cat + ':' + it.id;
  if (it.price > 0 && !owned.has(key)) {
    if (u.coins < it.price) return res.status(400).json({ error: 'Không đủ xu' });
    owned.add(key); q.setShop.run(u.coins - it.price, JSON.stringify([...owned]), u.equip, u.id);
  }
  res.json({ me: publicMe(u) });
});
app.post('/api/shop/equip', need, (req, res) => {
  const u = q.userById.get(req.user.id), it = Shared.shopItem(String(req.body.cat), String(req.body.id));
  if (!it) return res.status(400).json({ error: 'Không có vật phẩm này' });
  if (it.price > 0 && !ownedSet(u).has(it.cat + ':' + it.id)) return res.status(400).json({ error: 'Bạn chưa sở hữu vật phẩm này' });
  const e = jparse(u.equip, {}); e[it.cat] = it.id;
  q.setShop.run(u.coins, u.owned, JSON.stringify(e), u.id);
  res.json({ me: publicMe(u) });
});

// ---------- Gộp dữ liệu khách vào tài khoản (một lần, có giới hạn hợp lý) ----------
app.post('/api/import', need, (req, res) => {
  const u = q.userById.get(req.user.id);
  if (u.imported) return res.status(409).json({ error: 'Tài khoản này đã gộp dữ liệu khách rồi' });
  const g = req.body && req.body.guest; if (!g || typeof g !== 'object') return res.status(400).json({ error: 'Không có dữ liệu khách' });
  const today = dayOf(), rows = [];
  let meters = 0, coinPick = 0;
  for (const [day, d] of Object.entries(g.daily || {}).slice(0, 400)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || !d) continue;
    const secs = clamp(Math.floor(+d.secs || 0), 0, 86400), steps = clamp(Math.floor(+d.steps || 0), 0, secs * RULES.MAX_STEPS_PER_SEC);
    const m = clamp(+d.gameM || 0, 0, steps * RULES.BOLT_STRIDE), items = {};
    for (const k of ITEM_KEYS) items[k] = clamp(Math.floor(+((d.items || {})[k]) || 0), 0, Math.ceil(m / 60) + 3);
    items.coin = clamp(items.coin, 0, Math.ceil(m / 2.5) + 6);
    rows.push({ day, secs, steps, m, items, bites: clamp(Math.floor(+d.bites || 0), 0, 500), jumps: clamp(Math.floor(+d.jumps || 0), 0, 5000) });
    meters += m; coinPick += items.coin;
  }
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const cur = q.getDaily.get(u.id, r.day) || { game_m: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: '{}', imp: 0 };
      const it = jparse(cur.items, {}); for (const k of ITEM_KEYS) it[k] = (it[k] || 0) + (r.items[k] || 0);
      q.upDaily.run(u.id, r.day, cur.game_m + r.m, cur.steps + r.steps, cur.secs + r.secs, cur.bites + r.bites, cur.jumps + r.jumps, JSON.stringify(it), (cur.imp || 0) + r.m);
    }
    // xu và đồ đã mua: không vượt quá số xu mà quãng đường đã nhập có thể kiếm được
    const budget = Math.floor(meters / 1000 * COIN.PER_KM_GAME) + coinPick;
    let owned = (Array.isArray(g.owned) ? g.owned : []).filter((k) => { const [c, id] = String(k).split(':'); const it = Shared.shopItem(c, id); return it && it.price > 0; });
    owned = [...new Set(owned)].sort((a, b) => Shared.shopItem(...a.split(':')).price - Shared.shopItem(...b.split(':')).price);
    let spent = 0; const keep = [];
    for (const k of owned) { const p = Shared.shopItem(...k.split(':')).price; if (spent + p <= budget) { spent += p; keep.push(k); } }
    const coins = Math.max(0, Math.min(Math.floor(+g.coins || 0), budget - spent));
    const own0 = ownedSet(u); keep.forEach((k) => own0.add(k));
    const eq = jparse(u.equip, {}); for (const [c, id] of Object.entries(g.equip || {})) { const it = Shared.shopItem(c, id); if (it && (it.price === 0 || own0.has(c + ':' + id))) eq[c] = id; }
    const inv = (Array.isArray(g.inventory) ? g.inventory : []).slice(0, RULES.INV_SLOTS).filter((s) => s && own(ITEMS, s.k)).map((s) => ({ k: s.k, n: clamp(Math.floor(+s.n || 0), 1, RULES.INV_STACK) }));
    db.prepare('UPDATE users SET coins=coins+?, owned=?, equip=?, inventory=?, imported=1 WHERE id=?').run(coins, JSON.stringify([...own0]), JSON.stringify(eq), JSON.stringify(inv), u.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('import lỗi', e.message); return res.status(500).json({ error: 'Không gộp được dữ liệu' }); }
  res.json({ me: publicMe(u), imported: { days: rows.length, km: r1(meters / 1000) } });
});

// ---------- Lịch sử & xếp hạng ----------
app.get('/api/history', need, (req, res) => {
  const since = dayAgo(clamp(+req.query.days || 90, 1, 400)), map = new Map();
  for (const r of q.hist.all(req.user.id, since)) map.set(r.day, { day: r.day, gameKm: r1(r.game_m / 1000), realKm: 0, steps: r.steps, secs: r.secs, bites: r.bites, jumps: r.jumps, items: jparse(r.items, {}) });
  for (const r of q.histReal.all(req.user.id, since)) { const e = map.get(r.day) || { day: r.day, gameKm: 0, realKm: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: {} }; e.realKm = r.km; map.set(r.day, e); }
  res.json({ rows: [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).map((e) => ({ ...e, totalKm: r1(e.gameKm + e.realKm) })) });
});
app.get('/api/leaderboard', (req, res) => {
  const p = ['today', 'week', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const since = p === 'today' ? dayOf() : p === 'week' ? dayAgo(6) : '0000-00-00', agg = new Map();
  for (const r of q.lbGame.all(since)) agg.set(r.u, { g: r.g / 1000, r: 0 });
  for (const r of q.lbReal.all(since)) { const e = agg.get(r.u) || { g: 0, r: 0 }; e.r = r.r; agg.set(r.u, e); }
  const names = new Map(q.users.all().map((u) => [u.id, u]));
  const rows = [...agg.entries()].filter(([id]) => names.has(id)).map(([id, e]) => ({
    name: names.get(id).name, gameKm: r1(e.g), realKm: r1(e.r), totalKm: r1(e.g + e.r), tier: Shared.tierIndex(totalsFor(id).totalKm),
    strava: !!names.get(id).strava, me: !!(req.user && req.user.id === id) })).filter((r) => r.totalKm > 0).sort((a, b) => b.totalKm - a.totalKm).slice(0, 20);
  res.json({ period: p, rows });
});

// ---------- Bản đồ: tìm địa chỉ + chỉ đường đi bộ (qua server để gắn User-Agent, đệm kết quả, giới hạn tần suất) ----------
const GEO = { search: process.env.GEO_SEARCH_URL || 'https://nominatim.openstreetmap.org', route: process.env.GEO_ROUTE_URL || 'https://valhalla1.openstreetmap.de' };
const UA = `ChayOnline/1.0 (${BASE_URL})`, geoCache = new Map();
let geoChain = Promise.resolve();
function geoFetch(url, opts) {        // Nominatim yêu cầu tối đa 1 yêu cầu/giây
  const run = () => fetch(url, { ...opts, headers: { 'User-Agent': UA, 'Accept-Language': 'vi', ...(opts && opts.headers) }, signal: AbortSignal.timeout(15000) });
  const p = geoChain.then(run, run); geoChain = p.then(() => new Promise((r) => setTimeout(r, 1000)), () => new Promise((r) => setTimeout(r, 1000))); return p;
}
async function cached(key, fn) { const c = geoCache.get(key); if (c && Date.now() - c.t < 864e5) return c.v; const v = await fn(); geoCache.set(key, { t: Date.now(), v }); if (geoCache.size > 500) geoCache.delete(geoCache.keys().next().value); return v; }
app.get('/api/geo/search', async (req, res) => {
  const qs = cleanText(req.query.q, 100); if (qs.length < 3) return res.json({ results: [] });
  if (limited(req, 'geo', 40, 60e3)) return res.status(429).json({ error: 'Bạn tìm quá nhanh, đợi chút nhé' });
  try {
    const results = await cached('s:' + qs.toLowerCase(), async () => {
      const r = await geoFetch(`${GEO.search}/search?q=${encodeURIComponent(qs)}&format=jsonv2&limit=6&countrycodes=vn`); if (!r.ok) throw new Error('geo ' + r.status);
      return (await r.json()).map((x) => ({ name: String(x.display_name).slice(0, 140), lat: +x.lat, lon: +x.lon }));
    });
    res.json({ results });
  } catch (e) { res.status(502).json({ error: 'Không tìm được địa chỉ lúc này' }); }
});
app.get('/api/geo/reverse', async (req, res) => {
  const lat = +req.query.lat, lon = +req.query.lon; if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return res.status(400).json({ error: 'Tọa độ sai' });
  if (limited(req, 'geo', 40, 60e3)) return res.status(429).json({ error: 'Bạn thao tác quá nhanh' });
  try {
    const name = await cached(`r:${lat.toFixed(4)},${lon.toFixed(4)}`, async () => { const r = await geoFetch(`${GEO.search}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=17`); if (!r.ok) throw new Error('geo'); const j = await r.json(); return String(j.display_name || '').slice(0, 140); });
    res.json({ name: name || `${lat.toFixed(5)}, ${lon.toFixed(5)}` });
  } catch (e) { res.json({ name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }); }
});
function decodePoly(str, prec = 6) {       // polyline mã hóa của Valhalla (độ chính xác 1e-6)
  const pts = []; let i = 0, lat = 0, lon = 0, f = 10 ** prec;
  while (i < str.length) {
    for (const axis of [0, 1]) { let sh = 0, res = 0, b; do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32); const d = res & 1 ? ~(res >> 1) : res >> 1; if (axis) lon += d; else lat += d; }
    pts.push([lat / f, lon / f]);
  } return pts;
}
const haversine = (a, b) => { const R = 6371008.8, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const routeLen = (pts) => pts.reduce((s, p, i) => (i ? s + haversine(pts[i - 1], p) : 0), 0);
function thin(pts, minGap = 3) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) if (haversine(out[out.length - 1], pts[i]) >= minGap || i === pts.length - 1) out.push(pts[i]); return out; }
app.get('/api/geo/route', async (req, res) => {
  const f = String(req.query.from || '').split(',').map(Number), t = String(req.query.to || '').split(',').map(Number);
  if (f.length !== 2 || t.length !== 2 || ![...f, ...t].every(Number.isFinite) || Math.abs(f[0]) > 90 || Math.abs(t[0]) > 90) return res.status(400).json({ error: 'Tọa độ sai' });
  if (limited(req, 'route', 20, 60e3)) return res.status(429).json({ error: 'Bạn thao tác quá nhanh' });
  if (haversine(f, t) > 40000) return res.status(400).json({ error: 'Hai điểm cách nhau quá xa (tối đa 40 km)' });
  try {
    const out = await cached(`rt:${f.map((x) => x.toFixed(5))}:${t.map((x) => x.toFixed(5))}`, async () => {
      const body = { locations: [{ lat: f[0], lon: f[1] }, { lat: t[0], lon: t[1] }], costing: 'pedestrian', directions_options: { units: 'kilometers' } };
      const r = await fetch(`${GEO.route}/route?json=${encodeURIComponent(JSON.stringify(body))}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('route ' + r.status);
      const j = await r.json(), shape = j.trip && j.trip.legs && j.trip.legs[0] && j.trip.legs[0].shape;
      if (!shape) throw new Error('no shape');
      const pts = thin(decodePoly(shape)).map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]);
      return { pts, km: r1(routeLen(pts) / 1000) };
    });
    if (out.km > 40) return res.status(400).json({ error: 'Tuyến quá dài (tối đa 40 km)' });
    if (out.km < 0.3) return res.status(400).json({ error: 'Tuyến quá ngắn (tối thiểu 0,3 km)' });
    res.json(out);
  } catch (e) { res.status(502).json({ error: 'Không tính được tuyến đi bộ giữa hai điểm này' }); }
});

// ---------- Giải đấu ----------
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += CODE_CH[crypto.randomInt(CODE_CH.length)]; if (!q.tGet.get(c)) return c; } };
const HEX = /^#[0-9a-fA-F]{6}$/;
const MEDAL_DEF = {
  gold: { shape: 'circle', color: '#f2c230', ribbon: '#d2491f', icon: '🏆', text: 'HẠNG 1' }, silver: { shape: 'circle', color: '#c0c7cf', ribbon: '#d2491f', icon: '🏃', text: 'HẠNG 2' },
  bronze: { shape: 'circle', color: '#c27a3a', ribbon: '#d2491f', icon: '🏃', text: 'HẠNG 3' }, finisher: { shape: 'circle', color: '#35a89a', ribbon: '#d2491f', icon: '🌿', text: 'VỀ ĐÍCH' }
};
function cleanMedals(m) {
  const out = {};
  for (const k of Object.keys(MEDAL_DEF)) {
    const s = (m && m[k]) || {}, d = MEDAL_DEF[k];
    out[k] = { shape: Shared.MEDAL_SHAPES.includes(s.shape) ? s.shape : d.shape, color: HEX.test(s.color) ? s.color : d.color, ribbon: HEX.test(s.ribbon) ? s.ribbon : d.ribbon,
      icon: Shared.MEDAL_ICONS.includes(s.icon) ? s.icon : d.icon, text: cleanText(s.text, 12) || d.text };
  } return out;
}
function tState(t, now = Date.now()) { return t.finalized ? 'final' : now > t.end_at ? 'closing' : now < t.start_at ? 'upcoming' : (t.live_at && now < t.live_at) ? 'lobby' : 'open'; }
function standings(t) {
  const cats = jparse(t.cats, []), names = new Map(q.pList.all(t.code).map((p) => [p.pkey, p.name])), res = {};
  const rows = q.rList.all(t.code);
  for (const c of cats) {
    const best = new Map();
    for (const r of rows.filter((x) => x.cat === c.id)) {
      const cur = best.get(r.pkey);
      const better = !cur || (r.status === 'finished' && (cur.status !== 'finished' || r.time_s < cur.time_s)) || (r.status !== 'finished' && cur.status !== 'finished' && r.dist_m > cur.dist_m);
      if (better) best.set(r.pkey, r);
    }
    res[c.id] = [...best.values()].sort((a, b) => (a.status === 'finished') !== (b.status === 'finished') ? (a.status === 'finished' ? -1 : 1)
      : a.status === 'finished' ? a.time_s - b.time_s || a.created - b.created : b.dist_m - a.dist_m)
      .map((r, i) => ({ rank: i + 1, pkey: r.pkey, name: names.get(r.pkey) || 'Người chơi', status: r.status, timeS: r.time_s, distM: Math.round(r.dist_m) }));
  }
  return res;
}
function finalize(t) {
  if (t.finalized || Date.now() <= t.end_at) return;
  const cats = jparse(t.cats, []);
  db.exec('BEGIN');
  try {
    // người chưa về đích nhưng có chạy: ghi nhận DNF theo quãng đường xa nhất
    const have = new Set(q.rList.all(t.code).map((r) => r.pkey + '|' + r.cat));
    for (const b of q.runBest.all(t.code)) if (b.cat && !have.has(b.pkey + '|' + b.cat) && b.m > 0) q.rIns.run(t.code, b.pkey, b.cat, 'dnf', null, b.m, 0, Date.now());
    const st = standings(t);
    for (const c of cats) {
      let place = 0;
      for (const r of st[c.id]) if (r.status === 'finished') { place++; q.aIns.run(t.code, r.pkey, c.id, place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : 'finisher', place, r.timeS); }
    }
    q.setFinal.run(t.code); db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); console.error('tổng kết lỗi', e.message); }
}
setInterval(() => { for (const t of q.tOpen.all(Date.now())) finalize(t); }, 30000);

function tView(t, w, withStand = true) {
  finalize(t); t = q.tGet.get(t.code);
  const cats = jparse(t.cats, []), now = Date.now();
  const owner = q.userById.get(t.owner);
  const v = { code: t.code, title: t.title, descr: t.descr, visibility: t.visibility, startAt: t.start_at, endAt: t.end_at, liveAt: t.live_at, kind: t.kind, map: t.map,
    route: t.kind === 'gps' ? jparse(t.route, null) : null, cats, attempts: t.attempts, medals: jparse(t.medals, {}), state: tState(t, now), serverNow: now,
    view: t.view || '3d', owner: owner ? owner.name : '—', ownerMe: !!(w && w.user && w.user.id === t.owner), participants: q.pCount.get(t.code).n };
  if (withStand) { const st = standings(t); v.standings = {}; for (const c of cats) v.standings[c.id] = st[c.id].slice(0, 50).map((r) => ({ ...r, me: !!(w && r.pkey === w.key), pkey: undefined })); }
  if (w) {
    v.mine = { joined: !!q.pGet.get(t.code, w.key), attempts: {}, awards: q.aList.all(t.code).filter((a) => a.pkey === w.key).map((a) => ({ cat: a.cat, kind: a.kind, rank: a.rank, timeS: a.time_s })) };
    for (const c of cats) v.mine.attempts[c.id] = q.runCount.get(t.code, w.key, c.id).n;
  }
  return v;
}
app.post('/api/tournaments', need, (req, res) => {
  const b = req.body || {}, now = Date.now();
  if (q.tOwnedToday.get(req.user.id, now - 864e5).n >= 10) return res.status(429).json({ error: 'Một ngày chỉ tạo tối đa 10 giải' });
  const title = cleanText(b.title, 60); if (title.length < 3) return res.status(400).json({ error: 'Tên giải tối thiểu 3 ký tự' });
  const visibility = b.visibility === 'private' ? 'private' : 'public';
  const start = Math.floor(+b.startAt), end = Math.floor(+b.endAt);
  if (!(start > 0 && end > start && end > now)) return res.status(400).json({ error: 'Thời gian giải không hợp lệ (kết thúc phải ở tương lai và sau bắt đầu)' });
  if (end - start > 31 * 864e5) return res.status(400).json({ error: 'Một giải kéo dài tối đa 31 ngày' });
  let live = b.liveAt ? Math.floor(+b.liveAt) : null; if (live && (live < start || live > end)) return res.status(400).json({ error: 'Giờ G phải nằm trong thời gian giải' });
  let kind = b.kind === 'gps' ? 'gps' : 'sim', mapId = null, route = null, maxKm;
  if (kind === 'sim') { const m = mapById(String(b.map)); if (!m) return res.status(400).json({ error: 'Chọn bản đồ cho giải' }); mapId = m.id; maxKm = m.km; }
  else {
    const pts = b.route && Array.isArray(b.route.pts) ? b.route.pts.slice(0, 1500) : [];
    if (pts.length < 2 || !pts.every((p) => Array.isArray(p) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)) return res.status(400).json({ error: 'Tuyến GPS không hợp lệ' });
    const clean = pts.map((p) => [+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)]); maxKm = routeLen(clean) / 1000;
    if (maxKm < 0.3 || maxKm > 40) return res.status(400).json({ error: 'Tuyến GPS phải dài từ 0,3 đến 40 km' });
    route = { name: cleanText(b.route.name, 80) || 'Tuyến GPS', style: b.route.style === 'sat' ? 'sat' : 'road', pts: clean, km: r1(maxKm) };
  }
  const cats = (Array.isArray(b.cats) ? b.cats : []).slice(0, 4).map((c, i) => ({ id: 'c' + (i + 1), km: Math.round(clamp(+c.km || 0, 0.3, maxKm) * 10) / 10 }));
  if (!cats.length) return res.status(400).json({ error: 'Cần ít nhất một cự ly' });
  const code = newCode();
  q.tIns.run(code, req.user.id, title, cleanText(b.descr, 300), visibility, start, end, live, kind, mapId, route ? JSON.stringify(route) : null, JSON.stringify(cats),
    Math.round(clamp(+b.attempts || 0, 0, 20)), JSON.stringify(cleanMedals(b.medals)), crypto.randomInt(1, 2 ** 31 - 1), now);
  db.prepare('UPDATE tournaments SET view=? WHERE code=?').run(kind === 'sim' && ['3d', 'road', 'sat'].includes(b.view) ? b.view : '3d', code);
  res.json({ code, url: `${BASE_URL}/?t=${code}` });
});
app.get('/api/tournaments/public', (req, res) => {
  const list = q.tPublic.all(Date.now() - 7 * 864e5).map((t) => tView(t, null, false));
  res.json({ tournaments: list.map(({ medals, route, ...rest }) => rest) });
});
app.get('/api/tournaments/mine', needWho, (req, res) => {
  const list = q.tMine.all(req.who.user ? req.who.user.id : -1, req.who.key).map((t) => tView(t, req.who, false));
  res.json({ tournaments: list.map(({ medals, route, ...rest }) => rest) });
});
app.get('/api/awards/mine', needWho, (req, res) => {
  res.json({ awards: q.aMine.all(req.who.key).map((a) => ({ tid: a.tid, title: a.title, cat: a.cat, kind: a.kind, rank: a.rank, timeS: a.time_s, medal: jparse(a.medals, {})[a.kind] })) });
});
app.get('/api/tournaments/:code', (req, res) => {
  const t = q.tGet.get(String(req.params.code).toUpperCase()); if (!t) return res.status(404).json({ error: 'Không tìm thấy giải đấu' });
  res.json({ tournament: tView(t, who(req)) });
});
app.post('/api/tournaments/:code/join', needWho, (req, res) => {
  const t = q.tGet.get(String(req.params.code).toUpperCase()); if (!t) return res.status(404).json({ error: 'Không tìm thấy giải đấu' });
  if (Date.now() > t.end_at) return res.status(400).json({ error: 'Giải đã kết thúc' });
  q.pIns.run(t.code, req.who.key, req.who.name, req.who.guest, Date.now());
  res.json({ tournament: tView(t, req.who) });
});
app.post('/api/tournaments/:code/start', needWho, (req, res) => {
  const t = q.tGet.get(String(req.params.code).toUpperCase()); if (!t) return res.status(404).json({ error: 'Không tìm thấy giải đấu' });
  const cat = jparse(t.cats, []).find((c) => c.id === String(req.body.cat)); if (!cat) return res.status(400).json({ error: 'Cự ly không hợp lệ' });
  const st = tState(t);
  if (st === 'upcoming') return res.status(400).json({ error: 'Giải chưa bắt đầu' });
  if (st === 'lobby') return res.status(400).json({ error: 'Chưa tới giờ G' });
  if (st !== 'open') return res.status(400).json({ error: 'Giải đã kết thúc' });
  q.pIns.run(t.code, req.who.key, req.who.name, req.who.guest, Date.now());
  const used = q.runCount.get(t.code, req.who.key, cat.id).n;
  if (t.attempts > 0 && used >= t.attempts) return res.status(403).json({ error: `Bạn đã dùng hết ${t.attempts} lượt chạy cự ly này` });
  const r = q.insRun.run(req.who.user ? req.who.user.id : 0, t.kind === 'sim' ? t.map : 'gps:' + t.code, Math.round(cat.km * 1000), req.body.mode === 'auto' ? 'auto' : 'manual', Date.now(), Date.now(), req.who.key, t.code, cat.id, t.seed);
  res.json({ runId: Number(r.lastInsertRowid), seed: t.seed, dist: Math.round(cat.km * 1000), kind: t.kind, map: t.map, view: t.view || '3d', route: t.kind === 'gps' ? jparse(t.route, null) : null, attemptsLeft: t.attempts ? t.attempts - used - 1 : null });
});
app.post('/api/tournaments/:code/go', needWho, (req, res) => {   // đồng hồ giải bắt đầu khi cảnh đã nạp xong, công bằng giữa máy nhanh/chậm
  const run = q.getRun.get(+req.body.runId || 0);
  if (!run || run.tid !== String(req.params.code).toUpperCase() || run.pkey !== req.who.key) return res.status(404).json({ error: 'Không có chuyến chạy' });
  if (!run.go) { const now = Date.now(); db.prepare('UPDATE runs SET started=?,last_flush=?,go=1 WHERE id=?').run(now, now, run.id); }
  res.json({ ok: true });
});
app.post('/api/tournaments/:code/flush', needWho, (req, res) => {
  const run = q.getRun.get(+req.body.runId || 0);
  if (!run || run.tid !== String(req.params.code).toUpperCase() || run.pkey !== req.who.key) return res.status(404).json({ error: 'Không có chuyến chạy' });
  const t = q.tGet.get(run.tid);
  if (Date.now() > t.end_at + 60e3) return res.status(400).json({ error: 'Giải đã kết thúc' });
  const wasDone = run.done, r = applyFlush(run, req.body, req.who.user);
  if (req.body.done && !wasDone) {      // ghi nhận kết quả: thời gian do server đo từ lúc bắt đầu
    if (r.finishedNow) q.rIns.run(run.tid, run.pkey, run.cat, 'finished', Math.round((Date.now() - run.started) / 100) / 10, run.dist_m, r.steps, Date.now());
    else q.rIns.run(run.tid, run.pkey, run.cat, 'dnf', null, Math.min(run.dist_m, r.meters), r.steps, Date.now());
  }
  res.json({ ok: true, finished: r.finishedNow, coins: r.coins, timeS: r.finishedNow ? Math.round((Date.now() - run.started) / 100) / 10 : null });
});

// ---------- Hiện diện nhiều người (cùng bản đồ/giải thấy nhau) ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
const rooms = new Map();
let nextPid = 1;
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
function bcast(room, o, except) { const s = JSON.stringify(o); for (const p of room) if (p !== except && p.ws.readyState === 1) p.ws.send(s); }
function cleanEquip(e) { const out = {}; for (const cat of Object.keys(SHOP_DEFAULT)) { const it = Shared.shopItem(cat, e && e[cat]); out[cat] = it ? it.id : SHOP_DEFAULT[cat]; } return out; }

wss.on('connection', (ws, req) => {
  const { user } = userFromCookie(req.headers.cookie);
  const p = { id: nextPid++, ws, room: null, s: 0, l: 1, j: 0, mv: 0, name: 'Khách', km: 0, tier: 0, equip: cleanEquip({}), last: 0 };
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m) return;
    if (m.t === 'hello' && !p.room) {
      let key;
      if (m.room && /^t:[A-Z0-9]{6}$/.test(String(m.room)) && q.tGet.get(String(m.room).slice(2))) key = String(m.room);
      else if (m.room && /^gps:[a-z0-9,.\-]{1,40}$/.test(String(m.room))) key = String(m.room);
      else { const map = mapById(String(m.map)); if (!map) return; key = map.id; }
      if (user) { const tot = totalsFor(user.id); p.name = user.name; p.km = tot.totalKm; p.equip = cleanEquip(equipOf(user)); }
      else { p.name = cleanName(m.name) || 'Khách'; p.km = r1(clamp(+m.km || 0, 0, 20000)); p.equip = cleanEquip(m.equip); }
      p.tier = Shared.tierIndex(p.km);
      let rk; for (let k = 1; ; k++) { rk = key + '#' + k; const set = rooms.get(rk) || new Set(); if (set.size < 30) { rooms.set(rk, set); break; } }
      p.room = rooms.get(rk); p.room.add(p);
      const info = (o) => ({ id: o.id, name: o.name, km: o.km, tier: o.tier, equip: o.equip, s: o.s, l: o.l, j: o.j, mv: o.mv });
      send(ws, { t: 'welcome', id: p.id, players: [...p.room].filter((o) => o !== p).map(info) });
      bcast(p.room, { t: 'join', p: info(p) }, p);
    } else if (m.t === 'pos' && p.room) {
      const now = Date.now(); if (now - p.last < 80) return; p.last = now;
      const s = +m.s; if (Number.isFinite(s)) p.s = clamp(s, 0, 60000);
      p.l = clamp(Math.floor(+m.l || 0), 0, 3); p.j = m.j ? 1 : 0; p.mv = m.mv ? 1 : 0;
    }
  });
  ws.on('close', () => { if (p.room) { p.room.delete(p); bcast(p.room, { t: 'leave', id: p.id }); } });
  ws.on('error', () => {});
});
setInterval(() => { for (const room of rooms.values()) if (room.size > 1) bcast(room, { t: 'snap', p: [...room].map((p) => [p.id, +p.s.toFixed(1), p.j, p.mv, p.l]) }); }, 200);

if (require.main === module) {
  server.listen(PORT, () => console.log(`Chạy Online 3D: ${BASE_URL}  (Strava: ${strava.MOCK ? 'DEMO giả' : strava.configured() ? 'đã cấu hình' : 'chưa cấu hình'})`));
}
module.exports = { app, server };
