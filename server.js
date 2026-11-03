'use strict';
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Tiers = require('./tiers');
const strava = require('./strava');

const PORT = +process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TRACK = 3000;          // chiều dài đường (m) tới chùa
const ROOM_MAX = 30;
const MAX_SPEED = 42;        // m/s, ngưỡng chống gian lận vị trí

// ---------- Lưu trữ đơn giản (JSON) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { users: {}, sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { /* lần đầu */ }
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DB_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), (e) => { if (!e) fs.rename(tmp, DB_FILE, () => {}); });
  }, 500);
}
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

// ---------- Tiện ích ----------
const VN_OFFSET = 7 * 3600e3;
const dayKey = () => new Date(Date.now() + VN_OFFSET).toISOString().slice(0, 10);
const dayStartEpoch = () => Math.floor(Date.parse(dayKey() + 'T00:00:00+07:00') / 1000);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r1 = (v) => Math.round(v * 10) / 10;
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

const HATS = {
  none:  { name: 'Không đội',     price: 0 },
  nonla: { name: 'Nón lá',        price: 60 },
  bando: { name: 'Băng đô',       price: 100 },
  cap:   { name: 'Mũ lưỡi trai',  price: 160 },
  neko:  { name: 'Tai mèo',       price: 250 },
  crown: { name: 'Vương miện',    price: 400 }
};

const QUESTS = [
  { id: 'dist',    icon: '🏃', title: 'Chạy 5 km trong game',      goal: 5,  unit: 'km', reward: 30,  src: 'dist' },
  { id: 'temple',  icon: '🏯', title: 'Về tới chùa 2 lần',          goal: 2,  unit: 'lần', reward: 50, src: 'temple' },
  { id: 'bottles', icon: '💧', title: 'Nhặt 15 chai nước',          goal: 15, unit: 'chai', reward: 20, src: 'bottles' },
  { id: 'jumps',   icon: '🦘', title: 'Nhảy qua 10 chướng ngại',    goal: 10, unit: 'lần', reward: 20, src: 'jumps' },
  { id: 'real5',   icon: '👟', title: 'Chạy thật 5 km hôm nay',     goal: 5,  unit: 'km', reward: 100, src: 'real', strava: true },
  { id: 'real10',  icon: '🏅', title: 'Chạy thật 10 km hôm nay',    goal: 10, unit: 'km', reward: 250, src: 'real', strava: true }
];

function newUser(id, name) {
  return {
    id, name, avatar: '', metric: 'manual', manualKm: 0, strava: null, stats: {},
    todayKm: 0, todayDay: '', lastSync: 0, coins: 0, hat: 'none', hats: ['none'],
    q: null, totalGameKm: 0, created: Date.now()
  };
}
function uq(u) {
  const d = dayKey();
  if (!u.q || u.q.day !== d) {
    u.q = { day: d, dist: 0, temple: 0, bottles: 0, jumps: 0, coin: 0, claimed: {} };
  }
  return u.q;
}
function powerKm(u) {
  if (u.strava && u.metric !== 'manual') return u.stats[u.metric] || 0;
  return u.manualKm || 0;
}
const isVerified = (u) => !!u.strava && u.metric !== 'manual';
function progress(u, def) {
  const q = uq(u);
  if (def.src === 'real') return u.strava && u.todayDay === q.day ? u.todayKm : 0;
  return q[def.src] || 0;
}
function questsView(u) {
  const q = uq(u);
  return QUESTS.map((def) => ({
    id: def.id, icon: def.icon, title: def.title, goal: def.goal, unit: def.unit, reward: def.reward,
    progress: r1(Math.min(def.goal, progress(u, def))),
    done: progress(u, def) >= def.goal, claimed: !!q.claimed[def.id],
    needStrava: !!def.strava && !u.strava
  }));
}
function publicMe(u) {
  const km = powerKm(u);
  return {
    id: u.id, name: u.name, avatar: u.avatar, metric: u.metric, manualKm: u.manualKm,
    stravaLinked: !!u.strava, verified: isVerified(u), km: r1(km), tier: Tiers.tierIndex(km),
    mult: +Tiers.speedMult(km).toFixed(2), stats: u.stats, todayKm: u.todayDay === dayKey() ? u.todayKm : 0,
    lastSync: u.lastSync, coins: u.coins, hat: u.hat, hats: u.hats, quests: questsView(u),
    gameKmToday: r1(uq(u).dist)
  };
}

// ---------- Express ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.use('/tiers.js', (req, res) => res.sendFile(path.join(__dirname, 'tiers.js')));
app.use(express.static(path.join(__dirname, 'public')));

function parseCookies(h = '') {
  const o = {};
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bỏ qua */ } }
  }
  return o;
}
function userFromCookie(header) {
  const c = parseCookies(header);
  const uid = own(db.sessions, c.sid || '');
  return { cookies: c, user: (uid && own(db.users, uid)) || null };
}
app.use((req, res, next) => {
  const { cookies, user } = userFromCookie(req.headers.cookie);
  req.cookies = cookies; req.user = user;
  next();
});
function startSession(res, uid) {
  const sid = crypto.randomBytes(24).toString('hex');
  db.sessions[sid] = uid; save();
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 365 * 864e5, secure: BASE_URL.startsWith('https') });
}
const need = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Chưa đăng nhập' }));

app.get('/api/config', (req, res) => {
  res.json({
    strava: strava.configured(), mock: strava.MOCK, hats: HATS, track: TRACK,
    scope: strava.SCOPE
  });
});
app.get('/api/me', (req, res) => res.json({ me: req.user ? publicMe(req.user) : null }));

app.post('/api/guest', (req, res) => {
  const name = cleanName(req.body.name) || 'Runner';
  const km = clamp(+req.body.km || 0, 0, 20000);
  const u = newUser('g_' + crypto.randomBytes(6).toString('hex'), name);
  u.manualKm = r1(km);
  db.users[u.id] = u; startSession(res, u.id); save();
  res.json({ me: publicMe(u) });
});
app.post('/api/logout', (req, res) => {
  delete db.sessions[req.cookies.sid]; save();
  res.clearCookie('sid'); res.json({ ok: true });
});
app.post('/api/me/metric', need, (req, res) => {
  const m = String(req.body.metric);
  if (!['recent', 'ytd', 'all', 'manual'].includes(m)) return res.status(400).json({ error: 'metric không hợp lệ' });
  if (m !== 'manual' && !req.user.strava) return res.status(400).json({ error: 'Cần kết nối Strava' });
  req.user.metric = m; save(); refreshLive(req.user);
  res.json({ me: publicMe(req.user) });
});
app.post('/api/me/manual', need, (req, res) => {
  req.user.manualKm = r1(clamp(+req.body.km || 0, 0, 20000));
  if (req.body.name) req.user.name = cleanName(req.body.name) || req.user.name;
  save(); refreshLive(req.user);
  res.json({ me: publicMe(req.user) });
});

// --- Strava OAuth ---
app.get('/auth/strava', (req, res) => {
  if (!strava.configured()) return res.redirect('/?err=nostrava');
  const state = crypto.randomBytes(12).toString('hex');
  res.cookie('ostate', state, { httpOnly: true, sameSite: 'lax', maxAge: 600e3 });
  res.redirect(strava.authUrl(`${BASE_URL}/auth/strava/callback`, state));
});
app.get('/auth/strava/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/?err=denied');
    if (!req.query.state || req.query.state !== req.cookies.ostate) return res.redirect('/?err=state');
    if (!String(req.query.scope || '').includes('activity:read')) return res.redirect('/?err=scope');
    const t = await strava.exchange(String(req.query.code));
    const a = t.athlete || {};
    const uid = 's_' + a.id;
    let u = own(db.users, uid);
    if (!u) {
      u = newUser(uid, cleanName(`${a.firstname || 'Runner'} ${(a.lastname || '').slice(0, 1)}`.trim()) || 'Runner');
      db.users[uid] = u;
    }
    u.avatar = a.profile_medium || '';
    u.strava = { athleteId: a.id, access: t.access_token, refresh: t.refresh_token, expires: t.expires_at };
    startSession(res, uid);
    try { await syncStrava(u, true); } catch (e) { console.error('sync lỗi', e.message); }
    save();
    res.clearCookie('ostate');
    res.redirect('/');
  } catch (e) {
    console.error('oauth lỗi', e.message);
    res.redirect('/?err=strava');
  }
});
async function syncStrava(u, first) {
  const s = await strava.ensureToken(u.strava);
  const k = await strava.fetchKm(s, dayStartEpoch());
  u.stats = { recent: k.recent, ytd: k.ytd, all: k.all };
  u.todayKm = k.today; u.todayDay = dayKey(); u.lastSync = Date.now();
  if (first && u.metric === 'manual') u.metric = 'ytd';
  save(); refreshLive(u);
}
app.post('/api/strava/sync', need, async (req, res) => {
  const u = req.user;
  if (!u.strava) return res.status(400).json({ error: 'Chưa kết nối Strava' });
  if (Date.now() - u.lastSync < 60e3) return res.status(429).json({ error: 'Đợi một phút rồi đồng bộ lại nhé' });
  try { await syncStrava(u); res.json({ me: publicMe(u) }); }
  catch (e) { res.status(502).json({ error: 'Không lấy được dữ liệu Strava' }); }
});

// --- Nhiệm vụ & cửa hàng ---
app.post('/api/quests/claim', need, (req, res) => {
  const u = req.user; const def = QUESTS.find((q) => q.id === String(req.body.id));
  if (!def) return res.status(400).json({ error: 'Nhiệm vụ không tồn tại' });
  const q = uq(u);
  if (q.claimed[def.id]) return res.status(400).json({ error: 'Đã nhận rồi' });
  if (progress(u, def) < def.goal) return res.status(400).json({ error: 'Chưa hoàn thành' });
  q.claimed[def.id] = 1; u.coins += def.reward; save();
  res.json({ me: publicMe(u) });
});
app.post('/api/shop', need, (req, res) => {
  const u = req.user; const id = String(req.body.hat);
  const hat = own(HATS, id);
  if (!hat) return res.status(400).json({ error: 'Không có mũ này' });
  if (!u.hats.includes(id)) {
    if (u.coins < hat.price) return res.status(400).json({ error: 'Không đủ xu' });
    u.coins -= hat.price; u.hats.push(id);
  }
  u.hat = id; save(); refreshLive(u);
  res.json({ me: publicMe(u) });
});
app.get('/api/leaderboard', (req, res) => {
  const users = Object.values(db.users), d = dayKey();
  res.json({
    power: users.map((u) => ({ name: u.name, km: r1(powerKm(u)), tier: Tiers.tierIndex(powerKm(u)), ver: isVerified(u) }))
      .sort((a, b) => b.km - a.km).slice(0, 10),
    today: users.filter((u) => u.q && u.q.day === d && u.q.dist > 0)
      .map((u) => ({ name: u.name, km: r1(u.q.dist), tier: Tiers.tierIndex(powerKm(u)) }))
      .sort((a, b) => b.km - a.km).slice(0, 10)
  });
});

// ---------- Realtime ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const online = new Map();   // uid -> player
const rooms = [];
let nextPid = 1;

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const info = (p) => {
  const u = p.u, km = powerKm(u);
  return { id: p.id, name: u.name, km: r1(km), tier: Tiers.tierIndex(km), ver: isVerified(u) ? 1 : 0, hat: u.hat };
};
function roomBroadcast(room, o, except) {
  const s = JSON.stringify(o);
  for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
function sendMe(p) {
  if (p.meTimer) { p.meDirty = true; return; }
  send(p.ws, { t: 'me', me: publicMe(p.u) });
  p.meTimer = setTimeout(() => {
    p.meTimer = null;
    if (p.meDirty) { p.meDirty = false; sendMe(p); }
  }, 800);
}
function refreshLive(u) {
  const p = online.get(u.id);
  if (!p) return;
  roomBroadcast(p.room, { t: 'info', p: info(p) });
  sendMe(p);
}

wss.on('connection', (ws, req) => {
  const { user: u } = userFromCookie(req.headers.cookie);
  if (!u) return ws.close(4001, 'unauth');
  const old = online.get(u.id);
  if (old) old.ws.close(4002, 'dup');

  let room = rooms.find((r) => r.players.size < ROOM_MAX);
  if (!room) { room = { id: rooms.length + 1, players: new Map() }; rooms.push(room); }
  const p = { id: nextPid++, u, ws, room, x: 0, z: 0, s: 0, m: 0, lastX: 0, lastT: Date.now(),
    lastEv: {}, lastChat: 0, lastTemple: 0, evCount: { bottles: 0, jumps: 0, coin: 0 } };
  room.players.set(p.id, p); online.set(u.id, p);
  uq(u);

  send(ws, {
    t: 'welcome', id: p.id, room: room.id, track: TRACK,
    players: [...room.players.values()].map((o) => ({ ...info(o), x: o.x, z: o.z, s: o.s, m: o.m })),
    me: publicMe(u)
  });
  roomBroadcast(room, { t: 'join', p: { ...info(p), x: 0, z: 0, s: 0, m: 0 } }, p);

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const now = Date.now();
    if (m.t === 'pos') {
      const x = +m.x;
      if (!Number.isFinite(x)) return;
      const dt = Math.max(0.05, (now - p.lastT) / 1000);
      const dx = x - p.lastX;
      const mult = Tiers.speedMult(powerKm(u));
      if (dx < -500 && now - p.lastTemple < 10e3) {            // vòng mới sau khi về chùa
        p.lastX = x; p.x = x;
      } else if (dx >= -3 && dx <= MAX_SPEED * Math.max(1, mult / 1.6) * dt + 2) {
        if (dx > 0) { const q = uq(u); q.dist += dx / 1000; u.totalGameKm += dx / 1000; save(); }
        p.lastX = x; p.x = clamp(x, 0, TRACK + 20);
      } else {
        send(ws, { t: 'fix', x: p.x });                           // kéo về vị trí hợp lệ
        p.lastX = p.x;
      }
      p.lastT = now;
      p.z = clamp(+m.z || 0, 0, 200); p.s = m.s ? 1 : 0; p.m = m.m ? 1 : 0;
    } else if (m.t === 'ev') {
      const k = m.k, q = uq(u);
      const gap = { bottle: 150, jump: 300, coin: 60, temple: 15000 }[k];
      if (!gap || now - (p.lastEv[k] || 0) < gap) return;
      p.lastEv[k] = now;
      if (k === 'bottle' && q.bottles < 300) q.bottles++;
      else if (k === 'jump' && q.jumps < 500) q.jumps++;
      else if (k === 'coin' && q.coin < 400) { q.coin++; u.coins++; }
      else if (k === 'temple' && p.x >= TRACK - 60) {
        q.temple++; p.lastTemple = now; u.coins += 25;
        send(ws, { t: 'toast', text: '🏯 Tới chùa rồi! +25 xu' });
        roomBroadcast(room, { t: 'chat', id: 0, name: '🏯', text: `${u.name} vừa về tới chùa!` });
      } else return;
      save(); sendMe(p);
    } else if (m.t === 'chat') {
      if (now - p.lastChat < 800) return;
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
      if (!text) return;
      p.lastChat = now;
      roomBroadcast(room, { t: 'chat', id: p.id, name: u.name, text });
    }
  });
  ws.on('close', () => {
    room.players.delete(p.id);
    if (online.get(u.id) === p) online.delete(u.id);
    clearTimeout(p.meTimer);
    roomBroadcast(room, { t: 'leave', id: p.id });
  });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const room of rooms) {
    if (!room.players.size) continue;
    const arr = [];
    for (const p of room.players.values()) arr.push([p.id, +p.x.toFixed(2), Math.round(p.z), p.s, p.m]);
    roomBroadcast(room, { t: 'snap', p: arr });
  }
}, 100);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Chạy Online: ${BASE_URL}  (Strava: ${strava.MOCK ? 'DEMO giả' : strava.configured() ? 'đã cấu hình' : 'chưa cấu hình'})`);
  });
}
module.exports = { app, server };
