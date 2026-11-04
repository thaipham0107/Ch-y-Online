// Nhập GPX chính thức:  node tools/import-gpx.mjs <id> <file.gpx> ["Tên hiển thị"]   hoặc đặt gpx/<id>.gpx rồi chạy không tham số.
import fs from 'node:fs'; import path from 'node:path';
import { parseGpx } from './lib/geo.mjs';
import { buildCourse } from './lib/course.mjs';
import { COURSES } from './courses.config.mjs';
const OUT = path.resolve('public/courses'); fs.mkdirSync(OUT, { recursive: true });
const metaFile = path.join(OUT, 'meta.json'); const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
let jobs = [];
if (process.argv[2]) jobs.push([process.argv[2], process.argv[3], process.argv[4]]);
else for (const f of fs.existsSync('gpx') ? fs.readdirSync('gpx') : []) if (f.endsWith('.gpx')) jobs.push([f.replace(/\.gpx$/, ''), path.join('gpx', f)]);
if (!jobs.length) { console.log('Không có GPX. Đặt file vào thư mục gpx/ với tên <id>.gpx (id: ' + Object.keys(COURSES).join(', ') + ')'); process.exit(0); }
for (const [id, file, name] of jobs) {
  if (!COURSES[id]) { console.log('id không hợp lệ:', id); continue; }
  const pts = parseGpx(fs.readFileSync(file, 'utf8')); if (pts.length < 2) { console.log(`[${id}] GPX không có điểm`); continue; }
  console.log(`[${id}] ${pts.length} điểm, ${pts.every((p) => p.length > 2) ? 'có độ cao trong GPX' : 'thiếu độ cao: lấy từ SRTM'}`);
  const { course, meta: m } = await buildCourse(id, pts, { name: name || id, source: 'gpx', maxGrade: COURSES[id].maxGrade, bridges: COURSES[id].bridges, landmarks: COURSES[id].landmarks, features: COURSES[id].features, onLog: console.log });
  fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(course)); meta[id] = m; fs.writeFileSync(metaFile, JSON.stringify(meta));
  console.log(`  ✓ ${course.km} km, leo ${m.gain} m`);
}
