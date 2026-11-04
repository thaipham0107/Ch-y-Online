'use strict';
// Kho ảnh bản đồ cho bản Node: tải từ nguồn một lần, lưu vào DATA_DIR/tiles, các lần sau phát từ đĩa.
const fs = require('fs');
const path = require('path');
module.exports = function nodeTiles(env, DATA_DIR) {
  const UP = {
    road: env.TILES_ROAD || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    sat: env.TILES_SAT || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  };
  const UA = `ChayOnline/1.0 (${env.BASE_URL || 'local'})`;
  const DIR = path.join(DATA_DIR, 'tiles'), STORE = env.TILE_CACHE !== '0', CAP = (+env.TILE_CACHE_MB || 3000) * 1048576;
  let bytes = 0;
  (function scan(d) { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) scan(f); else bytes += fs.statSync(f).size; } } catch { /* chưa có kho */ } })(DIR);
  const inflight = new Map(); let active = 0; const wait = [];
  const slot = () => new Promise((res) => { const go = () => { active++; res(); }; if (active < 6) go(); else wait.push(go); });
  const free = () => { active--; const n = wait.shift(); if (n) n(); };
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }, MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  async function fetchTile(style, z, x, y) {
    const url = UP[style].replace('{z}', z).replace('{x}', x).replace('{y}', y);
    await slot();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      const type = (r.headers.get('content-type') || '').split(';')[0], ext = EXT[type];
      if (!r.ok || !ext) throw new Error('tile ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 2e6) throw new Error('tile quá lớn');
      if (STORE && bytes + buf.length < CAP) {
        const dir = path.join(DIR, style, String(z), String(x)); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${y}.${ext}`), buf); bytes += buf.length;
      }
      return { buf, ext };
    } finally { free(); }
  }
  const rate = new Map();
  async function route(req, res) {
    const style = req.params.style, z = +req.params.z, x = +req.params.x, y = +String(req.params.y).replace(/\.\w+$/, '');
    if (!UP[style] || !Number.isInteger(z) || z < 3 || z > 19 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return res.status(400).end();
    const now = Date.now(), a = (rate.get(req.ip) || []).filter((t) => now - t < 60e3); a.push(now); rate.set(req.ip, a);
    if (a.length > 6000) return res.status(429).end();
    const hdr = (ext) => ({ 'Content-Type': MIME[ext], 'Cache-Control': 'public, max-age=31536000, immutable' });
    for (const ext of Object.keys(MIME)) { const f = path.join(DIR, style, String(z), String(x), `${y}.${ext}`); if (fs.existsSync(f)) { res.set(hdr(ext)); return res.sendFile(f); } }
    const key = `${style}/${z}/${x}/${y}`;
    try { let p = inflight.get(key); if (!p) { p = fetchTile(style, z, x, y).finally(() => inflight.delete(key)); inflight.set(key, p); } const t = await p; res.set(hdr(t.ext)); res.end(t.buf); }
    catch { res.status(502).end(); }
  }
  return { route, stats: () => ({ store: STORE, mb: Math.round(bytes / 1048576), capMb: Math.round(CAP / 1048576) }) };
};
