// Từ một đường (lat,lon[,ele]) dựng file dữ liệu đường chạy: lấy mẫu 10 m, độ cao làm mịn, phát hiện bên vách/vực/biển, vị trí các điểm mốc.
import { hav, length, resample, smooth, elevations } from './geo.mjs';
const RAD = Math.PI / 180;
export function projector(lat0, lon0) { const kx = 111320 * Math.cos(lat0 * RAD), kz = 110574; return { toXZ: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz], toLL: (x, z) => [lat0 - z / kz, lon0 + x / kx] }; }

const median = (arr, w) => arr.map((_, i) => { const a = arr.slice(Math.max(0, i - w), i + w + 1).sort((x, y) => x - y); return a[a.length >> 1]; });
// giới hạn độ dốc (%) giữa hai điểm cách nhau `step` m: SRTM đo cả mặt nước/hẻm vực nên có gai nhọn
function limitSlope(e, step, g) { const lim = g / 100 * step, o = e.slice(); for (let i = 1; i < o.length; i++) o[i] = Math.min(o[i - 1] + lim, Math.max(o[i - 1] - lim, o[i])); for (let i = o.length - 2; i >= 0; i--) o[i] = Math.min(o[i + 1] + lim, Math.max(o[i + 1] - lim, o[i])); return o; }
export async function buildCourse(id, rawPts, { name, source, bridges = [], landmarks = {}, features = {}, maxKm, maxGrade = 12, onLog = () => {} }) {
  let pts = rawPts.map((p) => p.slice(0, 2));
  if (maxKm) { let acc = 0; const cut = [pts[0]]; for (let i = 1; i < pts.length; i++) { acc += hav(pts[i - 1], pts[i]); cut.push(pts[i]); if (acc >= maxKm * 1000) break; } pts = cut; rawPts = rawPts.slice(0, cut.length); }
  const hasEle = rawPts.every((p) => p.length >= 3);
  const STEP = 10, line = resample(rawPts.map((p, i) => (hasEle ? p : [p[0], p[1]])), STEP);
  const km = length(line.map((p) => [p[0], p[1]])) / 1000;
  let ele;
  if (hasEle) ele = line.map((p) => p[2]);
  else {
    // lấy mẫu độ cao thưa (mỗi 30 m) rồi nội suy về 10 m
    const idx = []; for (let i = 0; i < line.length; i += 3) idx.push(i); if (idx[idx.length - 1] !== line.length - 1) idx.push(line.length - 1);
    onLog(`  độ cao: ${idx.length} điểm`); const e = await elevations(idx.map((i) => line[i]));
    ele = line.map((_, i) => { let k = 0; while (k < idx.length - 2 && idx[k + 1] < i) k++; const f = (i - idx[k]) / (idx[k + 1] - idx[k] || 1); return e[k] + (e[k + 1] - e[k]) * f; });
  }
  for (const [a, b] of bridges) { const i0 = Math.round(a * 1000 / STEP), i1 = Math.min(line.length - 1, Math.round(b * 1000 / STEP)); for (let i = i0; i <= i1; i++) ele[i] = ele[i0] + (ele[i1] - ele[i0]) * (i - i0) / (i1 - i0 || 1); }
  ele = limitSlope(smooth(median(ele, 5), 6), STEP, maxGrade);   // bỏ gai nhiễu, làm mịn, rồi giới hạn độ dốc thực tế
  ele = smooth(ele, 3);
  // --- bên vách / vực / biển: so độ cao hai bên đường (±70 m) với mặt đường ---
  const P = projector(line[0][0], line[0][1]), xz = line.map((p) => P.toXZ(p[0], p[1]));
  const head = (i) => { const a = Math.max(0, i - 3), b = Math.min(line.length - 1, i + 3); return Math.atan2(xz[b][1] - xz[a][1], xz[b][0] - xz[a][0]); };
  const DIST = [60, 130, 220], sample = [];
  for (let i = 6; i < line.length - 6; i += 40) { const h = head(i), nx = -Math.sin(h), nz = Math.cos(h); for (const sd of [-1, 1]) for (const d of DIST) { const [lat, lon] = P.toLL(xz[i][0] + nx * d * sd, xz[i][1] + nz * d * sd); sample.push({ i, sd, d, lat, lon }); } }
  onLog(`  địa hình hai bên: ${sample.length} điểm`);
  const se = (sample.length ? await elevations(sample.map((s) => [s.lat, s.lon]), 'srtm30m', { fill: false }) : []).map((v) => (v == null ? 0 : v));   // null = mặt nước -> 0 m
  const acc = { '-1': [], 1: [] }; sample.forEach((s, k) => acc[s.sd].push({ d: se[k] - ele[s.i], abs: se[k], road: ele[s.i] }));
  const mean = (a, f) => (a.length ? a.reduce((x, y) => x + f(y), 0) / a.length : 0), sides = {};
  const name2 = { '-1': 'L', 1: 'R' }, dz = { '-1': mean(acc[-1], (x) => x.d), 1: mean(acc[1], (x) => x.d) };
  const seaFrac = (a) => (a.length ? a.filter((x) => x.abs <= 1.5 && x.road < 40).length / a.length : 0);
  if (seaFrac(acc[-1]) > 0.3 && seaFrac(acc[-1]) >= seaFrac(acc[1])) sides.sea = 'L'; else if (seaFrac(acc[1]) > 0.3) sides.sea = 'R';
  const hi = dz[-1] > dz[1] ? -1 : 1, lo = -hi;
  if (dz[hi] > 10) sides.cliff = name2[hi];
  if (dz[lo] < -10 && name2[lo] !== sides.sea) sides.canyon = name2[lo];
  onLog(`  độ chênh trung bình trái ${dz[-1].toFixed(0)} m, phải ${dz[1].toFixed(0)} m`);
  // --- điểm mốc: vị trí s (m) dọc tuyến và độ lệch ngang o (m, dương = bên phải) ---
  const marks = {};
  for (const [key, [lat, lon]] of Object.entries({ ...landmarks, ...features })) {
    const [x, z] = P.toXZ(lat, lon); let best = 0, bd = 1e18; xz.forEach((q, i) => { const d = (q[0] - x) ** 2 + (q[1] - z) ** 2; if (d < bd) { bd = d; best = i; } });
    const h = head(best), nx = -Math.sin(h), nz = Math.cos(h), o = (x - xz[best][0]) * nx + (z - xz[best][1]) * nz;
    marks[key] = { s: best * STEP, o: +o.toFixed(1), d: +Math.sqrt(bd).toFixed(0) };
  }
  if (features.lake && marks.lake && marks.lake.d <= 260) sides.lake = marks.lake.o < 0 ? 'L' : 'R';
  if (features.river && marks.river && marks.river.d <= 120) sides.river = marks.river.o < 0 ? 'L' : 'R';
  const coarse = []; for (let i = 0; i < ele.length; i += 10) coarse.push([+(i * STEP / 1000).toFixed(3), +ele[i].toFixed(1)]);
  const last = [+(km).toFixed(3), +ele[ele.length - 1].toFixed(1)]; if (coarse[coarse.length - 1][0] < last[0]) coarse.push(last);
  let gain = 0; for (let i = 1; i < coarse.length; i++) if (coarse[i][1] > coarse[i - 1][1]) gain += coarse[i][1] - coarse[i - 1][1];
  return { course: { id, name, source, step: STEP, km: +km.toFixed(2), pts: line.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]), elev: ele.map((e) => +e.toFixed(1)), sides, marks, built: new Date().toISOString().slice(0, 10) },
    meta: { km: Math.floor(km * 10) / 10, source, sides, elev: coarse, gain: Math.round(gain), marks } };
}
