// Dựng dữ liệu 10 tuyến từ OpenStreetMap + SRTM:  node tools/build-courses.mjs [id ...]
import fs from 'node:fs'; import path from 'node:path';
import { route, length } from './lib/geo.mjs';
import { buildCourse } from './lib/course.mjs';
import { COURSES } from './courses.config.mjs';
const OUT = path.resolve('public/courses'); fs.mkdirSync(OUT, { recursive: true });
const metaFile = path.join(OUT, 'meta.json'); const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
const NAMES = { hoguom: 'Hồ Gươm', saigon: 'Nguyễn Huệ – Bến Bạch Đằng', danang: 'Cầu Rồng – Biển Mỹ Khê', halong: 'Bãi Cháy – Vịnh Hạ Long', trangan: 'Tràng An', mocchau: 'Đồi chè Mộc Châu', haivan: 'Đèo Hải Vân', prenn: 'Đèo Prenn', oquyho: 'Đèo Ô Quy Hồ', mapileng: 'Mã Pí Lèng' };
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(COURSES);
for (const id of ids) {
  const c = COURSES[id]; if (!c) { console.log('bỏ qua', id); continue; }
  if (fs.existsSync(path.resolve('gpx', id + '.gpx'))) { console.log(`[${id}] có GPX chính thức, bỏ qua (dùng npm run courses:gpx)`); continue; }
  console.log(`[${id}] chỉ đường ${c.costing}…`);
  try {
    const raw = await route(c.via, c.costing); console.log(`  tuyến thô ${(length(raw) / 1000).toFixed(2)} km, ${raw.length} điểm`);
    const { course, meta: m } = await buildCourse(id, raw, { name: NAMES[id], source: 'osm+srtm', bridges: c.bridges, landmarks: c.landmarks, features: c.features, maxKm: c.maxKm, maxGrade: c.maxGrade, onLog: console.log });
    fs.writeFileSync(path.join(OUT, id + '.json'), JSON.stringify(course)); meta[id] = m;
    console.log(`  ✓ ${course.km} km, leo ${m.gain} m, sides ${JSON.stringify(course.sides)}, marks ${JSON.stringify(course.marks)}`);
    fs.writeFileSync(metaFile, JSON.stringify(meta));
  } catch (e) { console.log(`  ✗ ${id}: ${e.stack}`); }
}
