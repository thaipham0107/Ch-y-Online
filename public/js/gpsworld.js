// Thế giới GPS: chạy ảo dọc một tuyến đường thật. Nền là ảnh bản đồ (2D hoặc vệ tinh) trải dưới đường 4 làn.
import * as THREE from 'three';
import { textSprite } from './world.js';
const S = window.Shared;
const ZOOM = 18, RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function buildGpsWorld(course, scene, cfg) {
  const group = new THREE.Group(); scene.add(group);
  const [lat0, lon0] = course.pts[0], kx = 111320 * Math.cos(lat0 * RAD), kz = 110574;
  const toXZ = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];           // bắc = -z
  const toLL = (x, z) => [lat0 - z / kz, lon0 + x / kx];

  // --- làm mịn + lấy mẫu mỗi 1 m dọc tuyến ---
  const raw = course.pts.map(([a, b]) => toXZ(a, b));
  const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = cum[cum.length - 1], N = Math.floor(total) + 2;
  let xs = new Float32Array(N), zs = new Float32Array(N), j = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.min(i, total); while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const f = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    xs[i] = raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f; zs[i] = raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f;
  }
  const smooth = (a, w) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) { let s = 0, n = 0; for (let k = -w; k <= w; k++) { const q = i + k; if (q >= 0 && q < a.length) { s += a[q]; n++; } } o[i] = s / n; } return o; };
  xs = smooth(xs, 5); zs = smooth(zs, 5);
  const hs = new Float32Array(N); let prev = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 6), b = Math.min(N - 1, i + 6); let h = Math.atan2(zs[b] - zs[a], xs[b] - xs[a]);
    if (i) { while (h - prev > Math.PI) h -= 2 * Math.PI; while (h - prev < -Math.PI) h += 2 * Math.PI; } hs[i] = h; prev = h;
  }
  const at = (arr, s) => { const i = clamp(Math.floor(s), 0, N - 2), f = clamp(s - i, 0, 1); return arr[i] * (1 - f) + arr[i + 1] * f; };
  const posAt = (s) => ({ x: at(xs, s), y: 0, z: at(zs, s), h: at(hs, s) });
  const off = (P, o) => [P.x - Math.sin(P.h) * o, P.z + Math.cos(P.h) * o];
  const length = N - 2;

  // --- dải đường 4 làn bán trong suốt đặt lên ảnh bản đồ ---
  {
    const OFF = [-5.0, -4.75, -2.45, -2.35, -0.06, 0.06, 2.35, 2.45, 4.75, 5.0], pos = [], col = [];
    const asph = new THREE.Color(course.style === 'sat' ? '#2c2f36' : '#555961'), white = new THREE.Color('#fbf8ef'), yellow = new THREE.Color('#f2c230');
    for (let s = 0; s < length - 3; s += 3) {
      const A = posAt(s), B = posAt(s + 3), dash = Math.floor(s / 6) % 2 === 0, base = asph.clone().multiplyScalar(Math.floor(s / 6) % 2 ? 0.92 : 1);
      const colors = [white, base, dash ? white : base, base, yellow, base, dash ? white : base, base, white];
      for (let c = 0; c < 9; c++) {
        const [ax, az] = off(A, OFF[c]), [bx, bz] = off(A, OFF[c + 1]), [cx, cz] = off(B, OFF[c + 1]), [dx, dz] = off(B, OFF[c]);
        pos.push(ax, 0.12, az, bx, 0.12, bz, cx, 0.12, cz, ax, 0.12, az, cx, 0.12, cz, dx, 0.12, dz);
        for (let k = 0; k < 6; k++) col.push(colors[c].r, colors[c].g, colors[c].b);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 2; group.add(m);
  }

  // --- ảnh bản đồ: lát gạch quanh người chơi, nạp dần ---
  const tpl = course.style === 'sat' ? cfg.tiles.sat : cfg.tiles.road;
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  const tiles = new Map(); let loading = 0;
  const n2 = 2 ** ZOOM;
  const tileLat = (ty) => Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n2))) / RAD, tileLon = (tx) => tx / n2 * 360 - 180;
  function ensureTile(tx, ty) {
    const key = tx + ',' + ty; if (tiles.has(key)) { tiles.get(key).used = true; return; }
    const c = [[tileLat(ty), tileLon(tx)], [tileLat(ty), tileLon(tx + 1)], [tileLat(ty + 1), tileLon(tx + 1)], [tileLat(ty + 1), tileLon(tx)]].map(([a, b]) => toXZ(a, b));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap(([x, z]) => [x, 0, z]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 2, 1, 0, 3, 2]);
    const mat = new THREE.MeshBasicMaterial({ color: course.style === 'sat' ? '#556b4a' : '#e8e4da', side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 0; group.add(mesh);
    const t = { mesh, used: true, tx, ty, started: false }; tiles.set(key, t);
  }
  function startLoads() {
    for (const t of tiles.values()) {
      if (t.started || loading >= 6) continue; t.started = true; loading++;
      const url = tpl.replace('{z}', ZOOM).replace('{x}', t.tx).replace('{y}', t.ty);
      loader.load(url, (tex) => { loading--; if (!tiles.has(t.tx + ',' + t.ty)) { tex.dispose(); return; } tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; t.mesh.material.map = tex; t.mesh.material.color.set('#ffffff'); t.mesh.material.needsUpdate = true; },
        undefined, () => { loading--; });
    }
  }
  let lastKey = '', lastRad = 0;
  function update(px, pz, radius = 300) {
    const [lat, lon] = toLL(px, pz), tx = Math.floor((lon + 180) / 360 * n2);
    const ty = Math.floor((1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2 * n2);
    const tileM = 40075016 * Math.cos(lat * RAD) / n2, k = clamp(Math.ceil(radius / tileM), 1, 3), key = tx + ',' + ty + ',' + k;
    if (key !== lastKey) {
      lastKey = key; for (const t of tiles.values()) t.used = false;
      for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) ensureTile(tx + dx, ty + dy);
      for (const [kk, t] of tiles) if (!t.used) { group.remove(t.mesh); t.mesh.geometry.dispose(); if (t.mesh.material.map) t.mesh.material.map.dispose(); t.mesh.material.dispose(); tiles.delete(kk); }
    }
    startLoads();
  }

  // --- biển km + cổng xuất phát / về đích ---
  for (let s = 500; s < length; s += 500) {
    const P = posAt(s), [x, z] = off(P, 7.0), sp = textSprite((s % 1000 === 0 ? s / 1000 : (s / 1000).toFixed(1)) + ' km', { bg: '#1f2a33cc', scaleW: 3.2, w: 256, h: 96, font: 'bold 48px system-ui' });
    sp.position.set(x, 1.6, z); group.add(sp);
  }
  function gantry(s, label, color) {
    const P = posAt(s), g = new THREE.Group();
    for (const o of [-5.7, 5.7]) { const [x, z] = off(P, o); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 8), new THREE.MeshLambertMaterial({ color: '#e9e6dc' })); m.position.set(x, 3, z); g.add(m); }
    const [cx, cz] = off(P, 0), bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 12.2), new THREE.MeshLambertMaterial({ color })); bar.position.set(cx, 6, cz); bar.rotation.y = -P.h; g.add(bar);
    const t = textSprite(label, { scaleW: 5, w: 512, h: 128, font: 'bold 64px system-ui' }); t.position.set(cx, 8, cz); g.add(t);
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' })); chk.position.set(cx, 0.2, cz); chk.rotation.y = -P.h; g.add(chk);
    group.add(g); return g;
  }
  gantry(0, 'XUẤT PHÁT', '#d2491f');
  let finish = null;
  const setFinish = (dist) => { if (finish) group.remove(finish); finish = gantry(Math.min(dist, length), 'VỀ ĐÍCH', '#0b6f66'); };

  const bg = course.style === 'sat' ? '#4d5f45' : '#e8e4da';
  update(xs[0], zs[0], 300);
  return { group, bg, theme: { bg }, posAt, off, setFinish, length, update(x, z, rad) { update(x, z, rad || 300); },
    dispose() { for (const t of tiles.values()) { t.mesh.geometry.dispose(); if (t.mesh.material.map) t.mesh.material.map.dispose(); t.mesh.material.dispose(); } tiles.clear(); } };
}

// Chuẩn hóa một tuyến GPS thành "course" mà Game hiểu như một bản đồ
export function gpsCourse(route, id = 'gps') {
  const pts = route.pts, R = 6371008.8, r = Math.PI / 180;
  let km = 0; for (let i = 1; i < pts.length; i++) { const dLat = (pts[i][0] - pts[i - 1][0]) * r, dLon = (pts[i][1] - pts[i - 1][1]) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(pts[i - 1][0] * r) * Math.cos(pts[i][0] * r) * Math.sin(dLon / 2) ** 2; km += 2 * R * Math.asin(Math.sqrt(h)); }
  km = Math.round(km / 100) / 10;
  return { kind: 'gps', id, name: route.name || 'Tuyến GPS', place: 'GPS', km, diff: 1, theme: 'gps', style: route.style || 'road', pts, elev: [[0, 0], [km, 0]], desc: '' };
}
