// Công cụ dùng chung để dựng dữ liệu đường chạy: tìm địa điểm, chỉ đường, độ cao, đọc GPX, lấy mẫu lại.
export const UA = 'ChayOnline-tools/1.0 (https://github.com/thaipham0107/Ch-y-Online)';
const R = 6371008.8, RAD = Math.PI / 180;
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CACHE = path.resolve('tools/.cache'); fs.mkdirSync(CACHE, { recursive: true });
const cget = (k) => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, crypto.createHash('sha1').update(k).digest('hex') + '.json'), 'utf8')); } catch { return null; } };
const cset = (k, v) => fs.writeFileSync(path.join(CACHE, crypto.createHash('sha1').update(k).digest('hex') + '.json'), JSON.stringify(v));
export const hav = (a, b) => { const dLat = (b[0] - a[0]) * RAD, dLon = (b[1] - a[1]) * RAD, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
export const length = (pts) => pts.reduce((s, p, i) => (i ? s + hav(pts[i - 1], p) : 0), 0);

// lấy mẫu lại đường theo khoảng cách đều (m), nội suy cả độ cao nếu có (pts: [lat,lon,ele?])
export function resample(pts, step = 5) {
  const out = [pts[0].slice()]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = hav(a, b); if (d === 0) continue;
    let pos = step - carry;
    while (pos <= d) { const f = pos / d; out.push(a.map((v, k) => v + (b[k] - v) * f)); pos += step; }
    carry = d - (pos - step);
  }
  const last = pts[pts.length - 1]; if (hav(out[out.length - 1], last) > step * 0.3) out.push(last.slice());
  return out;
}
export const smooth = (arr, w) => arr.map((_, i) => { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const q = i + k; if (q >= 0 && q < arr.length) { s += arr[q]; n++; } } return s / n; });

// ---- tìm địa điểm (Nominatim, 1 yêu cầu/giây) ----
export async function geocode(q, { country = 'vn' } = {}) {
  await sleep(1100);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&countrycodes=${country}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('nominatim ' + r.status);
  return (await r.json()).map((x) => ({ name: x.display_name, lat: +x.lat, lon: +x.lon, type: x.type, cls: x.class }));
}

// ---- chỉ đường đi bộ qua nhiều điểm (Valhalla) ----
function decodePoly(str, prec = 6) { const pts = []; let i = 0, lat = 0, lon = 0, f = 10 ** prec; while (i < str.length) { for (const ax of [0, 1]) { let sh = 0, res = 0, b; do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << sh; sh += 5; } while (b >= 32); const d = res & 1 ? ~(res >> 1) : res >> 1; if (ax) lon += d; else lat += d; } pts.push([lat / f, lon / f]); } return pts; }
export async function route(waypoints, costing = 'pedestrian') {
  const ck = 'route:' + costing + JSON.stringify(waypoints); const hit = cget(ck); if (hit) return hit;
  await sleep(600);
  const body = { locations: waypoints.map(([lat, lon]) => ({ lat, lon, type: 'through' })), costing, directions_options: { units: 'kilometers' } };
  body.locations[0].type = 'break'; body.locations[body.locations.length - 1].type = 'break';
  const r = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(body))}`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('valhalla ' + r.status + ' ' + (await r.text()).slice(0, 120));
  const j = await r.json(); let pts = [];
  for (const leg of j.trip.legs) pts = pts.concat(decodePoly(leg.shape));
  cset(ck, pts); return pts;
}

// ---- độ cao SRTM 30 m (OpenTopoData công cộng: tối đa 100 điểm/yêu cầu, 1 yêu cầu/giây) ----
export async function elevations(pts, dataset = 'srtm30m', { fill = true } = {}) {
  const out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100), loc = chunk.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join('|');
    const ck = 'ele:' + dataset + loc, hit = cget(ck); if (hit) { out.push(...hit); continue; }
    for (let attempt = 0; ; attempt++) {
      await sleep(1100);
      const r = await fetch(`https://api.opentopodata.org/v1/${dataset}?locations=${loc}&interpolation=bilinear`, { headers: { 'User-Agent': UA } });
      if (r.status === 429 && attempt < 5) { await sleep(4000 * (attempt + 1)); continue; }
      if (!r.ok) throw new Error('opentopodata ' + r.status);
      const j = await r.json(); if (j.status !== 'OK') throw new Error('opentopodata ' + JSON.stringify(j).slice(0, 120));
      const part = j.results.map((x) => (x.elevation == null ? null : x.elevation)); cset(ck, part); out.push(...part); break;
    }
  }
  if (!fill) return out;      // giữ null = mặt nước/biển (SRTM không có dữ liệu)
  // điền ô thiếu dữ liệu bằng giá trị lân cận
  for (let i = 0; i < out.length; i++) if (out[i] == null) { let k = i - 1; while (k >= 0 && out[k] == null) k--; let n = i + 1; while (n < out.length && out[n] == null) n++; out[i] = out[k] != null ? out[k] : out[n] != null ? out[n] : 0; }
  return out;
}

// ---- GPX: đọc điểm đường chạy (lat, lon, ele?) từ trkpt/rtept ----
export function parseGpx(xml) {
  const pts = []; const re = /<(trkpt|rtept)\s+([^>]*?)>([\s\S]*?)<\/\1>|<(trkpt|rtept)\s+([^>]*?)\/>/g; let m;
  while ((m = re.exec(xml))) {
    const attrs = m[2] || m[5] || '', body = m[3] || '';
    const lat = /lat\s*=\s*["']([-\d.]+)["']/.exec(attrs), lon = /lon\s*=\s*["']([-\d.]+)["']/.exec(attrs), ele = /<ele>\s*([-\d.eE+]+)\s*<\/ele>/.exec(body);
    if (lat && lon) pts.push(ele ? [+lat[1], +lon[1], +ele[1]] : [+lat[1], +lon[1]]);
  }
  return pts;
}
