// Nhập GPX chính thức:  node tools/import-gpx.mjs <id> <file.gpx> ["Tên hiển thị"]   hoặc đặt gpx/<id>.gpx rồi chạy không tham số.
import fs from 'node:fs'; import path from 'node:path';
import { createRequire } from 'node:module';
import { parseGpx, hav, length, resample } from './lib/geo.mjs';
const Shared = createRequire(import.meta.url)('../maps.js');
import { buildCourse } from './lib/course.mjs';
import { COURSES } from './courses.config.mjs';
const OUT = path.resolve('public/courses'); fs.mkdirSync(OUT, { recursive: true });
const metaFile = path.join(OUT, 'meta.json'); const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
let jobs = [];
if (process.argv[2]) jobs.push([process.argv[2], process.argv[3], process.argv[4]]);
else for (const f of fs.existsSync('gpx') ? fs.readdirSync('gpx') : []) if (f.endsWith('.gpx')) jobs.push([f.replace(/\.gpx$/, ''), path.join('gpx', f)]);
if (!jobs.length) { console.log('Không có GPX. Đặt file vào thư mục gpx/ với tên <id>.gpx (id: ' + Object.keys(COURSES).join(', ') + ')'); process.exit(0); }
// Làm sạch vệt: cắt từ điểm gần mốc xuất phát (startNear), rồi cắt đoạn quay lại nếu vệt đi ra rồi về đúng đường cũ
function clean(id, pts, startNear, log) {
  let p = resample(pts, 20);
  if (startNear) { let bi = 0, bd = 1e18; p.forEach((q, i) => { const d = hav(q, startNear); if (d < bd) { bd = d; bi = i; } }); if (bi > 0) { log(`  cắt từ điểm gần mốc xuất phát nhất (cách ${Math.round(bd)} m), bỏ ${(length(p.slice(0, bi + 1)) / 1000).toFixed(1)} km đầu`); p = p.slice(bi); } }
  let retr = 0; for (let i = 0; i < p.length; i++) { for (let j = 0; j < i - 15; j++) if (hav(p[i], p[j]) < 25) { retr++; break; } }
  if (retr / p.length > 0.3) { let far = 0, fi = 0; p.forEach((q, i) => { const d = hav(p[0], q); if (d > far) { far = d; fi = i; } }); log(`  vệt đi ra rồi quay lại đúng đường cũ (${Math.round(100 * retr / p.length)}% lặp): giữ chiều đi, cắt tại điểm xa nhất (${(length(p.slice(0, fi + 1)) / 1000).toFixed(1)} km)`); p = p.slice(0, fi + 1); }
  return p;
}
for (const [id, file, name] of jobs) {
  if (!COURSES[id]) { console.log('id không hợp lệ:', id); continue; }
  const pts = parseGpx(fs.readFileSync(file, 'utf8')); if (pts.length < 2) { console.log(`[${id}] GPX không có điểm`); continue; }
  console.log(`[${id}] ${pts.length} điểm, ${pts.every((p) => p.length > 2) ? 'có độ cao trong GPX' : 'thiếu độ cao: lấy từ SRTM'}`);
  const cleaned = clean(id, pts, COURSES[id].startNear, console.log);
  const nm = name || (Shared.MAPS.find((m) => m.id === id) || {}).name || id;
  const { course, meta: m } = await buildCourse(id, cleaned, { name: nm, source: 'gpx', maxGrade: COURSES[id].maxGrade, bridges: COURSES[id].bridges, landmarks: COURSES[id].landmarks, features: COURSES[id].features, onLog: console.log });
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(course)); meta[id] = m; fs.writeFileSync(metaFile, JSON.stringify(meta));
  console.log(`  ✓ ${course.km} km, leo ${m.gain} m`);
}
