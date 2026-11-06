// Kiểm tra server ghi nhận đủ quãng đường khi tia sét vắt qua nhiều lần gửi và giày tăng tốc: node tools/test-flush.mjs <url> <thư mục data>
import { DatabaseSync } from 'node:sqlite'; import path from 'node:path';
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, ''), db = new DatabaseSync(path.join(process.argv[3] || 'data', 'chay.db'));
let cookie = '', fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const api = async (p, b) => { const r = await fetch(base + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.getSetCookie()[0]; if (sc) cookie = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
const u = 'ft' + Math.random().toString(36).slice(2, 7); await api('/api/register', { username: u, password: 'secret12', name: 'FT' });
const uid = db.prepare('SELECT id FROM users WHERE username=?').get(u).id;
async function scenario(name, equip, speed) {
  db.prepare('UPDATE users SET coins=5000, owned=?, equip=? WHERE id=?').run(JSON.stringify(Object.entries(equip).map(([c, i]) => c + ':' + i)), JSON.stringify(equip), uid);
  const DIST = 5000, run = (await api('/api/run/start', { map: 'haivan', dist: DIST, mode: 'auto' })).j.runId; let done = 0, boltT = 0, t = 0; const dtw = 15, rate = 4.5, stride = 4 * speed, bolt = 6 * speed;
  const events = new Set([10, 31, 55, 77, 100, 140, 190, 230]);       // thời điểm dùng tia sét (giây)
  while (done < DIST - 1) {
    let steps = 0, meters = 0, bolts = 0;
    for (let i = 0; i < dtw * rate && done + meters < DIST; i++) {
      const tt = t + i / rate; for (const e of events) if (Math.abs(tt - e) < 0.12) { boltT = 8; bolts++; events.delete(e); }
      const m = boltT > 0 ? bolt : stride; meters += m; steps++; boltT = Math.max(0, boltT - 1 / rate);
    }
    t += dtw; db.prepare('UPDATE runs SET last_flush=? WHERE id=?').run(Date.now() - dtw * 1000, run);
    const last = done + meters >= DIST - 1;
    const r = await api('/api/run/flush', { runId: run, steps, meters, secs: dtw, boltsUsed: bolts, items: {}, done: last ? 1 : 0, fin: last ? 1 : 0 });
    done += Math.min(meters, r.j.credited ?? meters); if (last) { ok(r.j.finished === true, `${name}: về đích được ghi nhận (đã ghi ${Math.round(r.j.meters)} / ${DIST} m)`); return; }
  }
}
await scenario('mặc định + nhiều tia sét', { hat: 'none', shoes: 'shoe_basic', acc: 'none', watch: 'none', aura: 'aura_tier' }, 1);
await scenario('giày cánh +10% + vương miện', { hat: 'crown', shoes: 'shoe_wing', acc: 'none', watch: 'none', aura: 'aura_tier' }, 1.1);
console.log(fails ? `\n${fails} lỗi` : '\nTất cả đạt'); process.exit(fails ? 1 : 0);
