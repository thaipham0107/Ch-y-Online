'use strict';
// Cổng quản trị: theo dõi truy cập, thời gian sử dụng, quản lý người chơi và giải đấu.
// Tài khoản quản trị KHÔNG nằm trong mã nguồn: đặt trong admin.config.json (đã .gitignore) hoặc biến môi trường ADMIN_USER / ADMIN_PASS.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadConfig(env) {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(path.join(typeof __dirname === 'string' ? __dirname : '.', 'admin.config.json'), 'utf8')); } catch { /* chưa có file */ }
  const username = String(env.ADMIN_USER || f.username || '').trim();
  const cfg = { username, salt: f.salt, hash: f.hash, password: env.ADMIN_PASS || f.password };
  if (!username || !(cfg.password || (cfg.salt && cfg.hash))) return null;
  if (cfg.password) { cfg.salt = crypto.randomBytes(16).toString('hex'); cfg.hash = crypto.scryptSync(String(cfg.password), cfg.salt, 32).toString('hex'); delete cfg.password; }
  return cfg;
}

module.exports = function mountAdmin(app, ctx) {
  const { db, dayOf, hashPw, publicTotals, MAPS, online, env = process.env } = ctx;
  const VN_S = 7 * 3600;
  const cfg = loadConfig(env);

  db.exec(`
  CREATE TABLE IF NOT EXISTS vsessions(
    id INTEGER PRIMARY KEY, vid TEXT NOT NULL, gid TEXT, user_id INTEGER, name TEXT, start INTEGER NOT NULL, last INTEGER NOT NULL,
    active_s REAL DEFAULT 0, hits INTEGER DEFAULT 1, device TEXT, ua TEXT, ip TEXT, ref TEXT, day TEXT);
  CREATE INDEX IF NOT EXISTS vs_user ON vsessions(user_id);
  CREATE INDEX IF NOT EXISTS vs_day ON vsessions(day);
  CREATE INDEX IF NOT EXISTS vs_vid ON vsessions(vid);
  CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, day TEXT, user_id INTEGER, vid TEXT, type TEXT NOT NULL, data TEXT);
  CREATE INDEX IF NOT EXISTS ev_user ON events(user_id);
  CREATE INDEX IF NOT EXISTS ev_ts ON events(ts);
  CREATE TABLE IF NOT EXISTS admin_log(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, admin TEXT, action TEXT, target TEXT, data TEXT);
  `);
  const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
  if (!hasCol('users', 'banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0');
  if (!hasCol('users', 'ban_reason')) db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT');

  const IP_SALT = crypto.randomBytes(8).toString('hex');
  const ipHash = (ip) => crypto.createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 10);
  const S = {
    insVs: db.prepare('INSERT INTO vsessions(vid,gid,user_id,name,start,last,device,ua,ip,ref,day) VALUES(?,?,?,?,?,?,?,?,?,?,?)'),
    getVs: db.prepare('SELECT * FROM vsessions WHERE id=?'),
    updVs: db.prepare('UPDATE vsessions SET last=?, active_s=?, hits=hits+1, user_id=COALESCE(?,user_id), name=COALESCE(?,name) WHERE id=?'),
    insEv: db.prepare('INSERT INTO events(ts,day,user_id,vid,type,data) VALUES(?,?,?,?,?,?)'),
  };
  function logEv(type, userId, vid, data) {
    try { S.insEv.run(Date.now(), dayOf(), userId || null, vid || null, String(type).slice(0, 24), data == null ? null : JSON.stringify(data).slice(0, 300)); } catch { /* không để lỗi ghi log làm hỏng yêu cầu */ }
  }

  // ---------- theo dõi truy cập (công khai, chỉ ghi) ----------
  const trackRate = new Map();
  const deviceOf = (ua = '') => (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'pc');
  const cleanStr = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, n);
  app.post('/api/track', (req, res) => {
    const now = Date.now(), k = req.ip, a = (trackRate.get(k) || []).filter((t) => now - t < 60e3); a.push(now); trackRate.set(k, a);
    if (a.length > 90) return res.status(429).json({});
    const b = req.body || {}, vid = String(b.vid || '');
    if (!/^[a-z0-9]{12,40}$/.test(vid)) return res.status(400).json({});
    const uid = req.user ? req.user.id : null, name = req.user ? req.user.name : cleanStr(b.name, 16) || null;
    const gid = /^[a-z0-9]{12,40}$/.test(String(b.gid || '')) ? String(b.gid) : null;
    if (b.a === 'open') {
      const ua = cleanStr(req.headers['user-agent'], 200), ref = cleanStr(b.ref, 120);
      const r = S.insVs.run(vid, gid, uid, name, now, now, deviceOf(ua), ua, ipHash(req.ip), ref, dayOf(now));
      return res.json({ sid: Number(r.lastInsertRowid) });
    }
    const vs = S.getVs.get(+b.sid || 0);
    if (!vs || vs.vid !== vid) return res.json({});
    if (b.a === 'hb') {
      const delta = Math.min(now - vs.last, 45e3) / 1000;
      S.updVs.run(now, vs.active_s + (b.vis ? delta : 0), uid, name, vs.id);
    } else if (b.a === 'ev' && /^[a-z_]{2,24}$/.test(String(b.ev))) {
      logEv(String(b.ev), uid || vs.user_id, vid, b.data && typeof b.data === 'object' ? b.data : null);
    }
    res.json({});
  });

  if (!cfg) {
    app.use('/api/admin', (req, res) => res.status(503).json({ error: 'Chưa cấu hình tài khoản quản trị (admin.config.json)' }));
    return { logEv, cleanup() {}, enabled: false };
  }

  // ---------- đăng nhập quản trị ----------
  const asess = new Map();   // token -> hết hạn
  const TTL = 12 * 3600e3;
  const loginRate = new Map();
  const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const cookieOf = (req) => { const m = /(?:^|;\s*)asid=([a-f0-9]{48})/.exec(req.headers.cookie || ''); return m && m[1]; };
  const isAdmin = (req) => { const t = cookieOf(req), e = t && asess.get(t); if (e && e > Date.now()) return true; if (t) asess.delete(t); return false; };
  const guard = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Cần đăng nhập quản trị' }));
  const alog = (action, target, data) => db.prepare('INSERT INTO admin_log(ts,admin,action,target,data) VALUES(?,?,?,?,?)').run(Date.now(), cfg.username, action, String(target || ''), data == null ? null : JSON.stringify(data).slice(0, 300));

  app.use('/api/admin', (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex'); next(); });
  app.post('/api/admin/login', (req, res) => {
    const now = Date.now(), a = (loginRate.get(req.ip) || []).filter((t) => now - t < 600e3);
    if (a.length >= 6) return res.status(429).json({ error: 'Thử sai quá nhiều lần, đợi 10 phút' });
    const u = String((req.body || {}).username || ''), p = String((req.body || {}).password || '');
    const hash = crypto.scryptSync(p, cfg.salt, 32).toString('hex');
    const ok = eq(u, cfg.username) & eq(hash, cfg.hash);   // không short-circuit: thời gian không lộ trường nào sai
    if (!ok) { a.push(now); loginRate.set(req.ip, a); alog('login_fail', req.ip, null); return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' }); }
    const token = crypto.randomBytes(24).toString('hex'); asess.set(token, now + TTL);
    res.cookie('asid', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: TTL, secure: req.secure });
    alog('login', req.ip, null); res.json({ ok: true, admin: cfg.username });
  });
  app.post('/api/admin/logout', (req, res) => { const t = cookieOf(req); if (t) asess.delete(t); res.clearCookie('asid', { path: '/' }); res.json({ ok: true }); });
  app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req) ? cfg.username : null }));

  // ---------- thống kê ----------
  const sday = "strftime('%Y-%m-%d', started/1000 + " + VN_S + ", 'unixepoch')";
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const num = (v) => (Number.isFinite(+v) ? +v : 0);
  const r1 = (v) => Math.round(num(v) * 10) / 10;

  app.get('/api/admin/overview', guard, (req, res) => {
    const days = Math.min(365, Math.max(7, Math.floor(+req.query.days) || 30)), now = Date.now(), today = dayOf(now);
    const from = dayOf(now - (days - 1) * 864e5);
    const dayList = []; for (let i = days - 1; i >= 0; i--) dayList.push(dayOf(now - i * 864e5));
    const mapBy = (rows, key = 'day') => { const m = new Map(rows.map((r) => [r[key], r])); return (d) => m.get(d) || {}; };
    const vis = mapBy(all('SELECT day, COUNT(*) n, COUNT(DISTINCT vid) u, COUNT(DISTINCT user_id) pu, COALESCE(SUM(active_s),0) act FROM vsessions WHERE day>=? GROUP BY day', from));
    const nu = mapBy(all("SELECT strftime('%Y-%m-%d', created/1000 + " + VN_S + ", 'unixepoch') day, COUNT(*) n FROM users GROUP BY day HAVING day>=?", from));
    const rn = mapBy(all('SELECT ' + sday + ' day, COUNT(*) n, COUNT(DISTINCT user_id) u, COALESCE(SUM(meters),0) m FROM runs GROUP BY day HAVING day>=?', from));
    const series = dayList.map((d) => ({ day: d, visits: num(vis(d).n), uniq: num(vis(d).u), loggedIn: num(vis(d).pu), activeMin: r1(num(vis(d).act) / 60), newUsers: num(nu(d).n), runs: num(rn(d).n), runners: num(rn(d).u), km: r1(num(rn(d).m) / 1000) }));
    const dauOf = (n) => num(one('SELECT COUNT(DISTINCT vid) n FROM vsessions WHERE day>=?', dayOf(now - (n - 1) * 864e5)).n);
    const t30 = one('SELECT COUNT(*) n, COALESCE(AVG(active_s),0) a, COALESCE(SUM(active_s),0) s FROM vsessions WHERE day>=?', dayOf(now - 29 * 864e5));
    const med = all('SELECT active_s FROM vsessions WHERE day>=? AND hits>1 ORDER BY active_s', dayOf(now - 29 * 864e5));
    const agg = one('SELECT COUNT(*) users, COALESCE(SUM(banned),0) banned, COALESCE(SUM(coins),0) coins, SUM(strava IS NOT NULL AND strava!=\'\') strava FROM users');
    const km = one('SELECT COALESCE((SELECT SUM(game_m) FROM daily),0)/1000.0 g, COALESCE((SELECT SUM(km) FROM real_daily),0) r');
    res.json({
      generatedAt: now, days,
      totals: {
        users: num(agg.users), banned: num(agg.banned), coins: num(agg.coins), strava: num(agg.strava),
        newToday: num(one("SELECT COUNT(*) n FROM users WHERE created>=?", Date.parse(today + 'T00:00:00Z') - VN_S * 1000).n),
        guestsEver: num(one('SELECT COUNT(DISTINCT vid) n FROM vsessions WHERE user_id IS NULL AND vid NOT IN (SELECT vid FROM vsessions WHERE user_id IS NOT NULL)').n),
        visitorsEver: num(one('SELECT COUNT(DISTINCT vid) n FROM vsessions').n), visitsEver: num(one('SELECT COUNT(*) n FROM vsessions').n),
        dau: dauOf(1), wau: dauOf(7), mau: dauOf(30), viewing: num(one('SELECT COUNT(DISTINCT vid) n FROM vsessions WHERE last>?', now - 90e3).n), ...online(),
        avgSessionS: Math.round(num(t30.a)), medianSessionS: Math.round(num((med[Math.floor(med.length / 2)] || {}).active_s)), activeHours30: r1(num(t30.s) / 3600),
        runs: num(one('SELECT COUNT(*) n FROM runs').n), runsToday: num(one('SELECT COUNT(*) n FROM runs WHERE ' + sday + '=?', today).n),
        gameKm: r1(km.g), realKm: r1(km.r),
        tournaments: num(one('SELECT COUNT(*) n FROM tournaments').n), tournamentsLive: num(one('SELECT COUNT(*) n FROM tournaments WHERE start_at<=? AND end_at>?', now, now).n),
        tournamentPlayers: num(one('SELECT COUNT(*) n FROM participants').n),
      },
      series,
      hours: (() => { const h = Array(24).fill(0); for (const r of all("SELECT CAST(strftime('%H', start/1000 + " + VN_S + ", 'unixepoch') AS INTEGER) h, COUNT(*) n FROM vsessions WHERE day>=? GROUP BY h", from)) h[r.h] = r.n; return h; })(),
      devices: Object.fromEntries(all('SELECT device, COUNT(DISTINCT vid) n FROM vsessions WHERE day>=? GROUP BY device', from).map((r) => [r.device || 'pc', r.n])),
      topMaps: all('SELECT map, COUNT(*) runs, COUNT(DISTINCT user_id) players, COALESCE(SUM(meters),0)/1000.0 km FROM runs WHERE ' + sday + '>=? GROUP BY map ORDER BY runs DESC LIMIT 12', from)
        .map((r) => ({ map: r.map, name: (MAPS.find((m) => m.id === r.map) || {}).name || (String(r.map).startsWith('gps') ? 'GPS chạy ảo' : r.map), runs: r.runs, players: r.players, km: r1(r.km) })),
      modes: Object.fromEntries(all('SELECT mode, COUNT(*) n FROM runs WHERE ' + sday + '>=? GROUP BY mode', from).map((r) => [r.mode || 'manual', r.n])),
      events: all('SELECT type, COUNT(*) n FROM events WHERE day>=? GROUP BY type ORDER BY n DESC', from),
      topRunners: all('SELECT u.id, u.name, u.username, COALESCE(SUM(d.game_m),0)/1000.0 km FROM users u JOIN daily d ON d.user_id=u.id WHERE d.day>=? GROUP BY u.id ORDER BY km DESC LIMIT 8', from).map((r) => ({ ...r, km: r1(r.km) })),
    });
  });

  // ---------- người chơi ----------
  const SORTS = { created: 'u.created', seen: 'seen', km: 'gm', real: 'rk', coins: 'u.coins', time: 'act', runs: 'runs', name: 'u.name COLLATE NOCASE' };
  const userRow = (u) => ({ id: u.id, username: u.username, name: u.name, created: u.created, coins: u.coins, banned: !!u.banned });
  app.get('/api/admin/users', guard, (req, res) => {
    const qs = String(req.query.q || '').trim().slice(0, 40), like = '%' + qs.replace(/[%_\\]/g, '') + '%';
    const sort = SORTS[req.query.sort] || SORTS.created, dir = req.query.dir === 'asc' ? 'ASC' : 'DESC';
    const size = 25, page = Math.max(0, Math.floor(+req.query.page) || 0);
    const where = qs ? 'WHERE u.username LIKE ? OR u.name LIKE ?' : '';
    const args = qs ? [like, like] : [];
    const total = one(`SELECT COUNT(*) n FROM users u ${where}`, ...args).n;
    const rows = all(`SELECT u.id,u.username,u.name,u.created,u.coins,u.banned,
      (SELECT COALESCE(SUM(game_m),0) FROM daily WHERE user_id=u.id) gm, (SELECT COALESCE(SUM(km),0) FROM real_daily WHERE user_id=u.id) rk,
      (SELECT MAX(last) FROM vsessions WHERE user_id=u.id) seen, (SELECT COUNT(*) FROM vsessions WHERE user_id=u.id) sess,
      (SELECT COALESCE(SUM(active_s),0) FROM vsessions WHERE user_id=u.id) act, (SELECT COUNT(*) FROM runs WHERE user_id=u.id) runs,
      (u.strava IS NOT NULL AND u.strava!='') strava FROM users u ${where} ORDER BY ${sort} ${dir}, u.id DESC LIMIT ${size} OFFSET ${page * size}`, ...args);
    res.json({ total, page, size, users: rows.map((r) => ({ id: r.id, username: r.username, name: r.name, created: r.created, coins: r.coins, banned: !!r.banned, gameKm: r1(r.gm / 1000), realKm: r1(r.rk), seen: r.seen, sessions: r.sess, activeS: Math.round(r.act), runs: r.runs, strava: !!r.strava })) });
  });

  app.get('/api/admin/users/:id', guard, (req, res) => {
    const u = one('SELECT * FROM users WHERE id=?', +req.params.id);
    if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    const jp = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
    const key = 'u' + u.id;
    const sess = all('SELECT id,start,last,active_s,hits,device,ua,ip,ref FROM vsessions WHERE user_id=? ORDER BY start DESC LIMIT 60', u.id);
    const tot = publicTotals(u.id);
    res.json({
      user: { ...userRow(u), avatar: u.avatar ? `/api/avatar/${u.id}?v=${u.avatar_v}` : null, banReason: u.ban_reason, strava: !!(u.strava && u.strava !== ''), lastSync: u.last_sync, owned: jp(u.owned, []), equip: jp(u.equip, {}), inventory: jp(u.inventory, []), imported: !!u.imported },
      totals: tot,
      usage: one('SELECT COUNT(*) sessions, COALESCE(SUM(active_s),0) activeS, COALESCE(AVG(active_s),0) avgS, MIN(start) first, MAX(last) last, COUNT(DISTINCT ip) ips FROM vsessions WHERE user_id=?', u.id),
      daily: all('SELECT d.day, d.game_m, d.steps, d.secs, d.bites, d.jumps, d.imp, COALESCE(r.km,0) real_km FROM daily d LEFT JOIN real_daily r ON r.user_id=d.user_id AND r.day=d.day WHERE d.user_id=? ORDER BY d.day DESC LIMIT 120', u.id),
      realOnly: all('SELECT day, km FROM real_daily WHERE user_id=? AND day NOT IN (SELECT day FROM daily WHERE user_id=?) ORDER BY day DESC LIMIT 60', u.id, u.id),
      runs: all('SELECT r.id, r.map, r.dist_m, r.mode, r.started, r.last_flush, r.steps, r.meters, r.bolts_used, r.done, r.tid, r.cat, t.title ttitle FROM runs r LEFT JOIN tournaments t ON t.code=r.tid WHERE r.user_id=? ORDER BY r.started DESC LIMIT 100', u.id),
      sessions: sess,
      events: all('SELECT ts,type,data FROM events WHERE user_id=? ORDER BY ts DESC LIMIT 120', u.id),
      tournamentsOwned: all('SELECT code,title,visibility,start_at,end_at,kind,map FROM tournaments WHERE owner=? ORDER BY created DESC LIMIT 30', u.id),
      tournamentsJoined: all('SELECT p.tid code, t.title, p.joined, (SELECT COUNT(*) FROM results r WHERE r.tid=p.tid AND r.pkey=p.pkey) results FROM participants p LEFT JOIN tournaments t ON t.code=p.tid WHERE p.pkey=? ORDER BY p.joined DESC LIMIT 30', key),
      awards: all('SELECT a.tid, t.title, a.cat, a.kind, a.rank, a.time_s FROM awards a LEFT JOIN tournaments t ON t.code=a.tid WHERE a.pkey=? ORDER BY a.rowid DESC LIMIT 40', key),
    });
  });

  app.post('/api/admin/users/:id/ban', guard, (req, res) => {
    const u = one('SELECT id,username FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    const banned = req.body.banned ? 1 : 0, reason = cleanStr(req.body.reason, 120) || null;
    db.prepare('UPDATE users SET banned=?, ban_reason=? WHERE id=?').run(banned, banned ? reason : null, u.id);
    if (banned) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    alog(banned ? 'ban' : 'unban', u.username, { reason }); res.json({ ok: true });
  });
  app.post('/api/admin/users/:id/password', guard, (req, res) => {
    const u = one('SELECT id,username FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    const pw = String(req.body.password || ''); if (pw.length < 6 || pw.length > 100) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hashPw(pw, salt), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
    alog('reset_password', u.username, null); res.json({ ok: true });
  });
  app.post('/api/admin/users/:id/coins', guard, (req, res) => {
    const u = one('SELECT id,username,coins FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    const d = Math.trunc(+req.body.delta); if (!d || Math.abs(d) > 1e6) return res.status(400).json({ error: 'Số xu không hợp lệ (±1.000.000)' });
    const next = Math.max(0, u.coins + d);
    db.prepare('UPDATE users SET coins=? WHERE id=?').run(next, u.id);
    alog('coins', u.username, { delta: d, before: u.coins, after: next, note: cleanStr(req.body.note, 80) }); res.json({ ok: true, coins: next });
  });
  app.post('/api/admin/users/:id/avatar-clear', guard, (req, res) => {
    const u = one('SELECT id,username FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    db.prepare('UPDATE users SET avatar=NULL, avatar_v=? WHERE id=?').run(Date.now(), u.id); alog('avatar_clear', u.username, null); res.json({ ok: true });
  });
  app.post('/api/admin/users/:id/rename', guard, (req, res) => {
    const u = one('SELECT id,username FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    const name = cleanStr(req.body.name, 16).trim(); if (name.length < 1) return res.status(400).json({ error: 'Tên trống' });
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name, u.id); alog('rename', u.username, { name }); res.json({ ok: true });
  });
  app.delete('/api/admin/users/:id', guard, (req, res) => {
    const u = one('SELECT id,username FROM users WHERE id=?', +req.params.id); if (!u) return res.status(404).json({ error: 'Không có người chơi' });
    if (String(req.query.confirm) !== u.username) return res.status(400).json({ error: 'Cần xác nhận bằng tên đăng nhập' });
    const key = 'u' + u.id;
    try { db.tx(() => {
      for (const sql of ['DELETE FROM sessions WHERE user_id=?', 'DELETE FROM daily WHERE user_id=?', 'DELETE FROM real_daily WHERE user_id=?', 'DELETE FROM runs WHERE user_id=?', 'DELETE FROM users WHERE id=?']) db.prepare(sql).run(u.id);
      for (const sql of ['DELETE FROM participants WHERE pkey=?', 'DELETE FROM results WHERE pkey=?', 'DELETE FROM awards WHERE pkey=?']) db.prepare(sql).run(key);
      db.prepare('UPDATE vsessions SET user_id=NULL WHERE user_id=?').run(u.id);
      });
    } catch (e) { return res.status(500).json({ error: 'Không xóa được: ' + e.message }); }
    alog('delete_user', u.username, null); res.json({ ok: true });
  });

  // ---------- khách ----------
  app.get('/api/admin/guests', guard, (req, res) => {
    const size = 25, page = Math.max(0, Math.floor(+req.query.page) || 0);
    const base = 'FROM vsessions WHERE user_id IS NULL AND vid NOT IN (SELECT vid FROM vsessions WHERE user_id IS NOT NULL)';
    const total = one(`SELECT COUNT(DISTINCT vid) n ${base}`).n;
    const rows = all(`SELECT vid, MAX(gid) gid, (SELECT name FROM vsessions v2 WHERE v2.vid=vsessions.vid AND name IS NOT NULL ORDER BY start DESC LIMIT 1) name, COUNT(*) sessions,
      COALESCE(SUM(active_s),0) act, MIN(start) first, MAX(last) last, MAX(device) device FROM vsessions WHERE user_id IS NULL AND vid NOT IN (SELECT vid FROM vsessions WHERE user_id IS NOT NULL)
      GROUP BY vid ORDER BY last DESC LIMIT ${size} OFFSET ${page * size}`);
    res.json({ total, page, size, guests: rows.map((r) => ({ vid: r.vid, name: r.name || 'Khách', sessions: r.sessions, activeS: Math.round(r.act), first: r.first, last: r.last, device: r.device,
      tournaments: r.gid ? num(one('SELECT COUNT(*) n FROM participants WHERE pkey=?', 'g' + r.gid).n) : 0 })) });
  });

  // ---------- giải đấu ----------
  app.get('/api/admin/tournaments', guard, (req, res) => {
    const now = Date.now();
    res.json({ tournaments: all(`SELECT t.code,t.title,t.visibility,t.kind,t.map,t.view,t.start_at,t.end_at,t.finalized,t.created,u.name owner, u.username ownername,
      (SELECT COUNT(*) FROM participants p WHERE p.tid=t.code) players, (SELECT COUNT(*) FROM results r WHERE r.tid=t.code) results
      FROM tournaments t LEFT JOIN users u ON u.id=t.owner ORDER BY t.created DESC LIMIT 200`).map((t) => ({ ...t, state: t.finalized || now > t.end_at ? 'ended' : now < t.start_at ? 'upcoming' : 'live' })) });
  });
  app.delete('/api/admin/tournaments/:code', guard, (req, res) => {
    const code = String(req.params.code).toUpperCase(); const t = one('SELECT code,title FROM tournaments WHERE code=?', code);
    if (!t) return res.status(404).json({ error: 'Không có giải' });
    for (const sql of ['DELETE FROM results WHERE tid=?', 'DELETE FROM awards WHERE tid=?', 'DELETE FROM participants WHERE tid=?', 'DELETE FROM runs WHERE tid=?', 'DELETE FROM tournaments WHERE code=?']) db.prepare(sql).run(code);
    alog('delete_tournament', code, { title: t.title }); res.json({ ok: true });
  });

  // ---------- hoạt động & nhật ký ----------
  app.get('/api/admin/activity', guard, (req, res) => {
    const type = /^[a-z_]{2,24}$/.test(String(req.query.type || '')) ? String(req.query.type) : null;
    const rows = all(`SELECT e.id,e.ts,e.type,e.data,e.user_id,u.name uname,u.username FROM events e LEFT JOIN users u ON u.id=e.user_id ${type ? 'WHERE e.type=?' : ''} ORDER BY e.id DESC LIMIT 150`, ...(type ? [type] : []));
    res.json({ events: rows, types: all('SELECT type, COUNT(*) n FROM events GROUP BY type ORDER BY n DESC') });
  });
  app.get('/api/admin/audit', guard, (req, res) => res.json({ log: all('SELECT ts,admin,action,target,data FROM admin_log ORDER BY id DESC LIMIT 200') }));

  // dọn dữ liệu cũ: giữ 400 ngày; chạy tối đa 6 giờ/lần khi nền tảng gọi sweep()
  let lastClean = 0;
  function cleanup() {
    const now = Date.now(); for (const [t, e] of asess) if (e < now) asess.delete(t);
    if (now - lastClean < 6 * 3600e3) return; lastClean = now;
    const cut = now - 400 * 864e5;
    db.prepare('DELETE FROM events WHERE ts<?').run(cut); db.prepare('DELETE FROM vsessions WHERE start<?').run(cut);
  }

  return { logEv, cleanup, enabled: true };
};
