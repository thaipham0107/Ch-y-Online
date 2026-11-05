// Thế giới GPS: chạy ảo dọc một tuyến đường thật. Nền là ảnh bản đồ (2D hoặc vệ tinh) trải dưới đường 4 làn.
import * as THREE from 'three';
import { textSprite } from './world.js';
const S = window.Shared;
const RAD = Math.PI / 180;
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

  // --- ảnh bản đồ: nhiều lớp. Nền thấp (cả tuyến, nạp một lần) + lớp z18 quanh người chơi + lớp z19 rất nét khi zoom gần (vệ tinh) ---
  const tpl = course.style === 'sat' ? cfg.tiles.sat : cfg.tiles.road;
  const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous');
  let loading = 0; const layers = [];
  const aniso = Math.max(4, cfg.aniso || 8);
  function blank(img) {          // ô "chưa có dữ liệu" của nhà cung cấp ảnh vệ tinh: gần như một màu phẳng, sáng và xám
    try {
      const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data; let m = 0, v = 0, sat = 0; const n = d.length / 4;
      for (let k = 0; k < d.length; k += 4) { const l = (d[k] + d[k + 1] + d[k + 2]) / 3; m += l; sat += Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]); }
      m /= n; sat /= n; for (let k = 0; k < d.length; k += 4) { const l = (d[k] + d[k + 1] + d[k + 2]) / 3; v += (l - m) ** 2; }
      return Math.sqrt(v / n) < 7 || (m > 205 && sat < 14);
    } catch { return false; }
  }
  function makeLayer(zoom, { poly = 0, check = false } = {}) {
    const n2 = 2 ** zoom, tiles = new Map(); let lastKey = '';
    const tileLat = (ty) => Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n2))) / RAD, tileLon = (tx) => tx / n2 * 360 - 180;
    function ensure(tx, ty) {
      const key = tx + ',' + ty; if (tiles.has(key)) { tiles.get(key).used = true; return; }
      const c = [[tileLat(ty), tileLon(tx)], [tileLat(ty), tileLon(tx + 1)], [tileLat(ty + 1), tileLon(tx + 1)], [tileLat(ty + 1), tileLon(tx)]].map(([a, b]) => toXZ(a, b));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap(([x, z]) => [x, 0, z]), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2)); g.setIndex([0, 2, 1, 0, 3, 2]);
      const mat = new THREE.MeshBasicMaterial({ color: course.style === 'sat' ? '#556b4a' : '#e8e4da', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: poly, polygonOffsetUnits: poly });
      const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 0; mesh.visible = !check; group.add(mesh);     // lớp kiểm tra chỉ hiện khi ảnh hợp lệ
      tiles.set(key, { mesh, used: true, tx, ty, started: false });
    }
    function drop(kk, t) { group.remove(t.mesh); t.mesh.geometry.dispose(); if (t.mesh.material.map) t.mesh.material.map.dispose(); t.mesh.material.dispose(); tiles.delete(kk); }
    return {
      zoom, tiles,
      ensure,
      clear() { for (const [kk, t] of [...tiles]) drop(kk, t); lastKey = ''; },
      set(list, key) {                       // list: danh sách [tx, ty] cần có
        if (key === lastKey) return; lastKey = key;
        for (const t of tiles.values()) t.used = false;
        for (const [tx, ty] of list) ensure(tx, ty);
        for (const [kk, t] of [...tiles]) if (!t.used) drop(kk, t);
      },
      start() {
        for (const t of tiles.values()) {
          if (t.started || loading >= 6) continue; t.started = true; loading++;
          const url = tpl.replace('{z}', zoom).replace('{x}', t.tx).replace('{y}', t.ty);
          loader.load(url, (tex) => {
            loading--; if (!tiles.has(t.tx + ',' + t.ty) || tiles.get(t.tx + ',' + t.ty) !== t) { tex.dispose(); return; }
            if (check && blank(tex.image)) { tex.dispose(); t.mesh.visible = false; return; }
            tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso; t.mesh.material.map = tex; t.mesh.material.color.set('#ffffff'); t.mesh.material.needsUpdate = true; t.mesh.visible = true;
          }, undefined, () => { loading--; });
        }
      },
      toTile(lat, lon) { return [Math.floor((lon + 180) / 360 * n2), Math.floor((1 - Math.log(Math.tan(lat * RAD) + 1 / Math.cos(lat * RAD)) / Math.PI) / 2 * n2)]; },
      tileM(lat) { return 40075016 * Math.cos(lat * RAD) / n2; },
    };
  }
  const mid = makeLayer(18, { poly: 1 }), hi = course.style === 'sat' ? makeLayer(19, { poly: 0, check: true }) : null;
  // khung bao cả tuyến để chọn lớp nền thấp và để camera "toàn tuyến"
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < N; i += 5) { minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]); }
  const bbox = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, size: Math.max(maxX - minX, maxZ - minZ, 200) };
  let base = null;
  {
    const [laN, loW] = toLL(minX - 400, minZ - 400), [laS, loE] = toLL(maxX + 400, maxZ + 400);
    for (let z = 16; z >= 9; z--) {
      const L = makeLayer(z, { poly: 3 }), [x0, y0] = L.toTile(laN, loW), [x1, y1] = L.toTile(laS, loE);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 56 || z === 9) {
        const list = []; for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) list.push([tx, ty]);
        L.set(list, 'all'); base = L; break;
      }
    }
  }
  function update(px, pz, radius = 300) {
    const [lat, lon] = toLL(px, pz), [tx, ty] = mid.toTile(lat, lon), k = clamp(Math.ceil(radius / mid.tileM(lat)), 1, 3);
    const list = []; for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) list.push([tx + dx, ty + dy]);
    mid.set(list, tx + ',' + ty + ',' + k); mid.start();
    if (hi) {                              // zoom gần: lớp z19 (nét gấp đôi) quanh người chơi
      if (radius < 150) { const [hx, hy] = hi.toTile(lat, lon), hl = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) hl.push([hx + dx, hy + dy]); hi.set(hl, hx + ',' + hy); hi.start(); }
      else hi.clear();
    }
    if (base) base.start();
  }

  // --- đường chấm cam + chấm vị trí khi nhìn toàn cảnh (kích thước theo màn hình nên luôn thấy được) ---
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill(); x.strokeStyle = '#0006'; x.lineWidth = 6; x.stroke(); return new THREE.CanvasTexture(c); })();
  const dp = []; for (let s = 0; s < length; s += 18) { const P = posAt(s); dp.push(P.x, 2, P.z); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  const dots = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ff7a1a', size: 7, sizeAttenuation: false, map: dotTex, alphaTest: 0.3, depthTest: false, transparent: true })); dots.renderOrder = 40; dots.visible = false; dots.frustumCulled = false; group.add(dots);
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute([0, 3, 0], 3));
  const marker = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#ffd23a', size: 22, sizeAttenuation: false, map: dotTex, alphaTest: 0.3, depthTest: false, transparent: true })); marker.renderOrder = 41; marker.visible = false; marker.frustumCulled = false; group.add(marker);
  const fg = new THREE.BufferGeometry(); { const P = posAt(length); fg.setAttribute('position', new THREE.Float32BufferAttribute([P.x, 3, P.z], 3)); }
  const endMark = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#19c37d', size: 20, sizeAttenuation: false, map: dotTex, alphaTest: 0.3, depthTest: false, transparent: true })); endMark.renderOrder = 41; endMark.visible = false; endMark.frustumCulled = false; group.add(endMark);
  function setOverview(on, px, pz) { dots.visible = marker.visible = endMark.visible = on; if (on) marker.position.set(px, 0, pz); }

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
  return { group, bg, theme: { bg }, posAt, off, setFinish, length, bbox, setOverview, update(x, z, rad) { update(x, z, rad || 300); },
    dispose() { mid.clear(); if (hi) hi.clear(); if (base) base.clear(); } };
}

// Chuẩn hóa một tuyến GPS thành "course" mà Game hiểu như một bản đồ
export function gpsCourse(route, id = 'gps') {
  const pts = route.pts, R = 6371008.8, r = Math.PI / 180;
  let km = 0; for (let i = 1; i < pts.length; i++) { const dLat = (pts[i][0] - pts[i - 1][0]) * r, dLon = (pts[i][1] - pts[i - 1][1]) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(pts[i - 1][0] * r) * Math.cos(pts[i][0] * r) * Math.sin(dLon / 2) ** 2; km += 2 * R * Math.asin(Math.sqrt(h)); }
  km = Math.round(km / 100) / 10;
  return { kind: 'gps', id, name: route.name || 'Tuyến GPS', place: 'GPS', km, diff: 1, theme: 'gps', style: route.style || 'road', pts, elev: [[0, 0], [km, 0]], desc: '' };
}
