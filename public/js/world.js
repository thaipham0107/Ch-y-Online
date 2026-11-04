// Dựng thế giới 3D cho một bản đồ: tuyến đường theo độ cao, địa hình, cảnh vật đặc trưng từng địa danh.
import * as THREE from 'three';
const S = window.Shared;

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hstr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const r = (i, j) => { let n = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (r(xi, yi) * (1 - u) + r(xi + 1, yi) * u) * (1 - v) + (r(xi, yi + 1) * (1 - u) + r(xi + 1, yi + 1) * u) * v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const C = (h) => new THREE.Color(h);

// bảng màu từng địa danh
const THEMES = {
  hanoi:   { grass: '#8cc96b', rock: '#9a9185', road: '#4d4f58', pave: '#dccfb6', bg: '#cfe3ef', hill: 1 },
  saigon:  { grass: '#8dc46a', rock: '#9a9488', road: '#4a4c54', pave: '#d8cdb8', bg: '#d6e4ec', hill: 0.6 },
  danang:  { grass: '#9ccd70', rock: '#a39a88', road: '#4b4d55', pave: '#e0d6bf', bg: '#cbe6f5', hill: 0.8, sand: '#ecd9a6' },
  halong:  { grass: '#87c46e', rock: '#8a9488', road: '#4b4d55', pave: '#ddd2bb', bg: '#c9e8ee', hill: 1.5, sand: '#e5d3a0' },
  trangan: { grass: '#9ed066', rock: '#8e968a', road: '#5a5a58', pave: null, bg: '#dfe9d2', hill: 1 },
  mocchau: { grass: '#7cbf5c', rock: '#a09a88', road: '#55555a', pave: null, bg: '#dce9dd', hill: 7 },
  haivan:  { grass: '#7db561', rock: '#8f8a80', road: '#4f5057', pave: null, bg: '#bcd4e6', hill: 3 },
  prenn:   { grass: '#5ea558', rock: '#8a857a', road: '#505158', pave: null, bg: '#cdd9d6', hill: 4 },
  oquyho:  { grass: '#78b05a', rock: '#9b9686', road: '#57585e', pave: null, bg: '#d4dfe8', hill: 3 },
  mapileng:{ grass: '#9cae6b', rock: '#a79a84', road: '#55565c', pave: null, bg: '#d9dcd8', hill: 2 }
};
const URBAN = new Set(['hanoi', 'saigon', 'danang', 'halong']);

export function textSprite(text, { color = '#fff', bg = null, font = 'bold 56px system-ui, sans-serif', w = 512, h = 128, scaleW = 8 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (bg) { x.fillStyle = bg; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 28); x.fill(); }
  x.lineWidth = 8; x.strokeStyle = '#0008'; if (!bg) x.strokeText(text, w / 2, h / 2 + 3);
  x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 3);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(scaleW, scaleW * h / w, 1); return sp;
}

export function buildWorld(map, scene) {
  const T = THEMES[map.theme];
  const rng = mulberry(hstr(map.id));
  const L = map.km * 1000 + 120;
  const N = Math.ceil(L) + 2;
  const group = new THREE.Group(); scene.add(group);

  // ---------- tuyến đường: hướng uốn lượn + độ cao theo hồ sơ ----------
  const xs = new Float32Array(N), zs = new Float32Array(N), ys = new Float32Array(N), hs = new Float32Array(N);
  const p1 = rng() * 6.28, p2 = rng() * 6.28, cv = map.curve;
  let px = 0, pz = 0;
  for (let i = 0; i < N; i++) {
    const th = cv.a * (0.7 * Math.sin(cv.f[0] * i + p1) + 0.3 * Math.sin(cv.f[1] * i + p2)) - cv.a * 0.7 * Math.sin(p1);
    hs[i] = th; xs[i] = px; zs[i] = pz; ys[i] = S.elevAt(map, i);
    px += Math.cos(th); pz += Math.sin(th);
  }
  const at = (arr, s) => { const i = clamp(Math.floor(s), 0, N - 2), f = clamp(s - i, 0, 1); return arr[i] * (1 - f) + arr[i + 1] * f; };
  const posAt = (s) => ({ x: at(xs, s), y: at(ys, s), z: at(zs, s), h: at(hs, s) });
  const off = (P, o) => [P.x - Math.sin(P.h) * o, P.z + Math.cos(P.h) * o];  // o>0: bên phải

  // độ cao mặt đất tại (s, o): đường, vai đường, vách núi, vực, bãi biển...
  function groundH(s, o) {
    const ry = at(ys, s), a = Math.abs(o), side = o < 0 ? 'L' : 'R';
    if (a <= 4.3) return ry - 0.04;
    let y = ry - 0.3;
    const n = vnoise(s * 0.06, o * 0.08);
    if (map.cliff === side) return y + (a - 4.3) * 0.8 + n * 3.5;
    if (map.canyon === side) return y - Math.max(0, a - 6) * 1.35 + n * 1.2;
    if (map.sea === side) return a > 14 ? Math.max(y - (a - 14) * 0.7, -2.2) : y;
    if (map.theme === 'hanoi' && side === 'L' && a > 24) return ry - 2.4;
    if (map.theme === 'saigon' && side === 'R' && a > 34) return ry - 2.6;
    if (map.theme === 'trangan' && side === 'L' && a > 14 && a < 26) return ry - 1.2;
    return y + (vnoise(s * 0.012, o * 0.025) - 0.5) * T.hill * 2 * clamp((a - 4.3) / 18, 0, 1) + n * 0.4;
  }

  // ---------- mặt đường (tô đỏ ấm khi dốc), kẻ vạch, nhịp sọc để thấy chuyển động ----------
  {
    const OFF = [-4.3, -3.9, -0.12, 0.12, 3.9, 4.3];
    const pos = [], col = [];
    const asph = C(T.road), warm = C('#9a4f3e'), white = C('#f5f2ea'), yellow = C('#f2c230');
    for (let s = 0; s < L - 2; s += 2) {
      const g = S.gradeAt(map, s), tint = clamp((g - 3) / 9, 0, 0.8);
      const stripe = Math.floor(s / 6) % 2 ? 0.93 : 1;
      const base = asph.clone().lerp(warm, tint).multiplyScalar(stripe);
      const A = posAt(s), B = posAt(s + 2);
      const dash = Math.floor(s / 6) % 2 === 0;
      const colors = [white, base, dash ? yellow : base, base, white];
      for (let c = 0; c < 5; c++) {
        const [ax, az] = off(A, OFF[c]), [bx, bz] = off(A, OFF[c + 1]), [cx, cz] = off(B, OFF[c + 1]), [dx, dz] = off(B, OFF[c]);
        const y0 = A.y + 0.02, y1 = B.y + 0.02;
        pos.push(ax, y0, az, bx, y0, bz, cx, y1, cz, ax, y0, az, cx, y1, cz, dx, y1, dz);
        for (let k = 0; k < 6; k++) col.push(colors[c].r, colors[c].g, colors[c].b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // ---------- địa hình hai bên ----------
  {
    const COLS = [-90, -60, -40, -25, -14, -7, -4.3, 4.3, 7, 14, 25, 40, 60, 90];
    const pos = [], col = [], idx = [];
    const grass = C(T.grass), rock = C(T.rock), sand = C(T.sand || '#e6d6a6'), pave = T.pave ? C(T.pave) : null, water = C('#4aa3c4');
    let rows = 0;
    for (let s = 0; s < L; s += 4) {
      const P = posAt(s);
      for (let c = 0; c < COLS.length; c++) {
        const o = COLS[c], a = Math.abs(o), side = o < 0 ? 'L' : 'R';
        const [x, z] = off(P, o), y = groundH(s, o);
        pos.push(x, y, z);
        const n = 0.9 + vnoise(s * 0.09, o * 0.13) * 0.2;
        let k = grass.clone();
        if (map.cliff === side) k.lerp(rock, clamp((a - 6) / 12, 0, 1));
        if (map.canyon === side) k.lerp(rock, clamp((a - 7) / 8, 0, 1));
        if (map.sea === side && a > 7) k.lerp(sand, clamp((a - 7) / 5, 0, 1)).lerp(water, clamp((a - 16) / 6, 0, 1));
        if (pave && a < 8.5) k = pave.clone();
        if (map.theme === 'trangan' && side === 'L' && a > 14 && a < 26) k = water.clone();
        k.multiplyScalar(n); col.push(k.r, k.g, k.b);
      }
      if (rows > 0) for (let c = 0; c < COLS.length - 1; c++) {
        if (c === 6) continue;     // khe giữa là mặt đường
        const i0 = (rows - 1) * COLS.length + c, i1 = rows * COLS.length + c;
        idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
      }
      rows++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  // ---------- nước: biển (đi theo người chơi) và dải sông/hồ ----------
  let sea = null;
  if (map.sea) {
    sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#3d9fc9', transparent: true, opacity: 0.92 }));
    sea.position.y = 0; group.add(sea);
  }
  function ribbon(s0, s1, o0, o1, dy, color, opacity = 0.9) {
    const pos = [], idx = []; let r = 0;
    for (let s = s0; s <= s1; s += 5) {
      const P = posAt(s); const [ax, az] = off(P, o0), [bx, bz] = off(P, o1);
      pos.push(ax, P.y + dy, az, bx, P.y + dy, bz);
      if (r) idx.push((r - 1) * 2, r * 2, (r - 1) * 2 + 1, (r - 1) * 2 + 1, r * 2, r * 2 + 1); r++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide })));
  }

  // ---------- đồ vật nhân bản (instancing) ----------
  const G = {
    ico: new THREE.IcosahedronGeometry(1, 0), cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
    cone4: new THREE.ConeGeometry(0.75, 0.5, 4).rotateY(Math.PI / 4).translate(0, 0.25, 0),
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
    dod: new THREE.DodecahedronGeometry(1, 0), sph: new THREE.SphereGeometry(1, 8, 6)
  };
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const sets = {};
  function put(name, geo, s, o, sx, sy, sz, color, ry = 0, dy = 0) {
    const P = posAt(s), [x, z] = off(P, o), y = groundH(s, o) + dy;
    (sets[name] || (sets[name] = { geo, list: [] })).list.push([x, y, z, sx, sy, sz, ry, color]);
  }
  const fwd = (s) => -posAt(s).h;       // quay theo hướng đường
  const tree = (s, o, k, col = '#4fa84a') => { put('trunk', G.cyl, s, o, 0.35 * k, 1.8 * k, 0.35 * k, '#7a5231'); put('crown', G.ico, s, o, 1.7 * k, 1.5 * k, 1.7 * k, col, rng() * 3, 1.7 * k); };
  const pine = (s, o, k, col = '#2f7a49') => { put('pine', G.cone, s, o, 1.5 * k, 2.8 * k, 1.5 * k, col, 0, 0.5 * k); put('pine', G.cone, s, o, 1.1 * k, 2.4 * k, 1.1 * k, col, 0, 2.2 * k); };
  const palm = (s, o, k) => { put('trunk', G.cyl, s, o, 0.3 * k, 4.6 * k, 0.3 * k, '#8a6a43'); put('crown', G.ico, s, o, 2.4 * k, 0.7 * k, 2.4 * k, '#3f9a4a', rng() * 3, 4.5 * k); };
  const house = (s, o, w, d, h, wall, roof) => { const r = fwd(s); put('box', G.box, s, o, w, h, d, wall, r); put('roof', G.cone4, s, o, w * 1.45, h * 0.5 + 0.8, d * 1.45, roof, r, h); };
  const block = (s, o, w, d, h, col, top = '#d7d7d2') => { const r = fwd(s); put('box', G.box, s, o, w, h, d, col, r); put('box', G.box, s, o, w * 0.9, 0.4, d * 0.9, top, r, h); };
  const rock = (s, o, k, col = '#8f8a80') => put('rock', G.dod, s, o, k, k * 0.7, k, col, rng() * 3, k * 0.3);
  const karst = (s, o, r, h, col = '#7d8a7a') => { put('karst', G.cone, s, o, r, h, r, col, rng() * 3, -2); put('karst', G.cone, s, o + 3, r * 0.6, h * 0.65, r * 0.6, '#6f7d6d', rng() * 3, -2); put('karst', G.sph, s, o, r * 0.55, h * 0.14, r * 0.55, '#5a9a4e', 0, h * 0.82); };
  const lamp = (s, o, h = 4.2) => { put('pole', G.cyl, s, o, 0.14, h, 0.14, '#4b4b50'); put('lamp', G.sph, s, o, 0.34, 0.34, 0.34, '#ffe9a8', 0, h); };
  const guard = (s, o) => put('guard', G.box, s, o, 3.9, 0.7, 0.18, '#e8e6e0', fwd(s), 0.2);
  const along = (a, b, g0, g1, fn) => { for (let s = a; s < b; s += g0 + rng() * (g1 - g0)) fn(s); };
  const both = (fn) => (s) => { fn(s, -1); fn(s, 1); };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const PASTEL = ['#f4d27a', '#f1a9a0', '#9fd3c7', '#e9c8a0', '#c8b6e2', '#f3e3b5'];

  switch (map.theme) {
    case 'hanoi':
      ribbon(0, L, -150, -24, -0.35, '#5fa8b8', 0.88);
      along(0, L, 11, 16, both((s, sd) => tree(s, sd * 7.5, 1.1 + rng() * 0.4, sd > 0 ? '#e0533c' : '#59b04c')));
      along(0, L, 10, 14, (s) => { const w = 6 + rng() * 3, h = 9 + rng() * 8; house(s, 17 + rng() * 3, w, 11, h, pick(PASTEL), '#b8503a'); });
      along(20, L, 28, 34, both((s, sd) => lamp(s, sd * 9.4)));
      put('box', G.box, 3000, -62, 6, 6, 3, '#d9d3c3'); put('box', G.box, 3000, -62, 4.6, 4.6, 3, '#d9d3c3', 0, 3); put('roof', G.cone4, 3000, -62, 8, 2.4, 8, '#7a8f6a', 0, 6);
      put('box', G.box, 1500, -20, 3.2, 26, 0.5, '#c93f2e', fwd(1500) + Math.PI / 2, -0.4);
      break;
    case 'saigon':
      ribbon(0, L, 36, 120, -0.5, '#5f9bb0', 0.9);
      along(0, L, 14, 20, both((s, sd) => { if (sd > 0 && rng() < 0.5) return; block(s, sd * (15 + rng() * 6), 9 + rng() * 8, 12, 14 + rng() * 40, pick(['#7fb1cf', '#a9c1d1', '#d6cdbf', '#c9ad92', '#8fa6b8']), '#cfd5d8'); }));
      along(0, L, 12, 17, both((s, sd) => tree(s, sd * 8, 1.4 + rng() * 0.5, '#3f9a4a')));
      along(20, L, 24, 30, both((s, sd) => lamp(s, sd * 9.4)));
      put('cyl', G.cyl, 2800, 26, 7, 70, 7, '#3d79a8'); put('cyl', G.cyl, 2800, 26, 4, 8, 4, '#c8d6df', 0, 70); put('cyl', G.cyl, 2800, 26, 6.5, 0.8, 6.5, '#d0504b', 0, 78);
      break;
    case 'danang':
      along(0, L, 11, 16, both((s, sd) => palm(s, sd * (7 + rng() * 2), 1.2 + rng() * 0.5)));
      along(0, L, 12, 18, (s) => block(s, 18 + rng() * 6, 10 + rng() * 6, 14, 20 + rng() * 36, pick(['#f1f1ec', '#cfe2ee', '#f2e6c8']), '#9fb7c8'));
      along(20, L, 28, 34, both((s, sd) => lamp(s, sd * 9.4)));
      for (let s = 2050; s <= 2950; s += 14) { const t = (s - 2050) / 900, y = 2.2 + Math.sin(Math.PI * t) * 6.5; put('gold', G.sph, s, -6.2, 1.5, 1.3 + Math.sin(t * 40) * 0.2, 1.5, '#f2b705', 0, y + 3 + Math.sin(Math.PI * t) * 3.5); }
      break;
    case 'halong':
      for (let i = 0; i < 90; i++) karst(rng() * L, 30 + rng() * 120, 8 + rng() * 9, 18 + rng() * 30, pick(['#7d8a7a', '#8b9684', '#6f7d6d']));
      for (let i = 0; i < 40; i++) { const s = rng() * L, o = 24 + rng() * 80; put('hull', G.box, s, o, 3.4, 0.9, 1.2, '#7a4b2b', rng() * 3, 0.2); put('sail', G.cone4, s, o, 3.4, 3.4, 0.5, '#b34a2d', rng() * 3, 1.1); }
      along(0, L, 12, 18, (s) => palm(s, -(7 + rng() * 2), 1.2 + rng() * 0.4));
      along(0, L, 13, 19, (s) => block(s, -(16 + rng() * 6), 9 + rng() * 5, 14, 14 + rng() * 26, pick(['#f2ecdd', '#e8cdb0', '#d6e6ee']), '#9fb7c8'));
      along(20, L, 28, 34, both((s, sd) => lamp(s, sd * 9.4)));
      break;
    case 'trangan':
      for (let i = 0; i < 110; i++) karst(rng() * L, (rng() < 0.5 ? -1 : 1) * (26 + rng() * 70), 9 + rng() * 11, 24 + rng() * 38);
      along(0, L, 10, 18, both((s, sd) => { if (sd < 0 && s % 20 < 1) return; put('paddy', G.box, s, sd * (11 + rng() * 14), 6 + rng() * 6, 7, 0.1, pick(['#9ed45a', '#c8dc6a', '#7fbf4f', '#d9d57a']), fwd(s), 0.05); }));
      along(0, L, 14, 22, both((s, sd) => tree(s, sd * 6.4, 1 + rng() * 0.4)));
      for (let i = 0; i < 14; i++) { const s = rng() * L; put('hull', G.box, s, -20, 3, 0.7, 1, '#7a4b2b', fwd(s), -1); }
      block(5500, 52, 9, 9, 6, '#f1e4c4', '#c4402f'); put('roof', G.cone4, 5500, 52, 14, 5, 14, '#b8402f', 0, 6.5); put('roof', G.cone4, 5500, 52, 9, 4, 9, '#b8402f', 0, 11);
      break;
    case 'mocchau':
      for (let r = 0; r < 8; r++) along(30, L, 6, 7, both((s, sd) => put('tea', G.box, s, sd * (9 + r * 3.4), 1.9, 0.8, 6.4, r % 2 ? '#4f9c3f' : '#5fae48', fwd(s), 0.0)));
      along(0, L, 22, 40, both((s, sd) => pine(s, sd * (35 + rng() * 40), 1.5 + rng())));
      along(120, L, 160, 260, (s) => house(s, (rng() < 0.5 ? -1 : 1) * (28 + rng() * 10), 6, 8, 3.2, '#c9a66b', '#8a5a34'));
      along(0, L, 22, 30, both((s, sd) => rock(s, sd * 7.4, 0.5 + rng() * 0.4, '#a79f8e')));
      break;
    case 'haivan':
      along(0, L, 6, 12, (s) => rock(s, -(7 + rng() * 40), 0.8 + rng() * 2.4, pick(['#8f8a80', '#7f7b73', '#9a9488'])));
      along(0, L, 10, 18, (s) => tree(s, -(9 + rng() * 40), 0.9 + rng() * 0.7, pick(['#5e9a4a', '#6aa84f', '#4d8a45'])));
      along(0, L, 14, 22, (s) => tree(s, 14 + rng() * 40, 0.8 + rng() * 0.6, '#4f9a55'));
      along(0, L, 4, 4.2, (s) => guard(s, 5.2));
      { const g = 10000; put('box', G.box, g, -5.6, 1.6, 9, 1.6, '#bcb4a2'); put('box', G.box, g, 5.6, 1.6, 9, 1.6, '#bcb4a2'); put('box', G.box, g, 0, 13, 1.8, 2.4, '#b0a892', fwd(g) + Math.PI / 2, 8.5); put('roof', G.cone4, g, 0, 15, 2.4, 4, '#a7402e', fwd(g) + Math.PI / 2, 10.3); }
      break;
    case 'prenn':
      along(0, L, 4.5, 8, (s) => pine(s, -(8 + rng() * 45), 1.4 + rng() * 1.2));
      along(0, L, 5, 9, (s) => pine(s, 8 + rng() * 45, 1.4 + rng() * 1.2, '#2a6e45'));
      along(0, L, 24, 40, (s) => rock(s, -(7 + rng() * 14), 1 + rng() * 1.6));
      along(0, L, 4, 4.2, (s) => put('guard', G.box, s, 5.3, 3.9, 0.7, 0.18, s % 8 < 4 ? '#e24a3a' : '#f3f1ea', fwd(s), 0.2));
      break;
    case 'oquyho':
      for (let t = 0; t < 7; t++) along(40, L, 8, 9, (s) => put('paddy', G.box, s, -(10 + t * 7), 8.5, 6.2, 0.4, pick(['#8fc455', '#b6cf5e', '#6fae48']), fwd(s), 0.2 + t * 0.9));
      along(0, L, 8, 14, (s) => rock(s, -(8 + rng() * 40), 0.8 + rng() * 2.2, '#9b9686'));
      along(0, L, 14, 26, (s) => put('hull', G.box, s, 12 + rng() * 40, 6, 3, 6, '#f4f4f0', rng() * 3, 8 + rng() * 14));
      along(0, L, 4, 4.2, (s) => guard(s, 5.2));
      along(100, L, 150, 240, (s) => house(s, -(24 + rng() * 10), 6, 7, 3, '#b59a6d', '#6e4e30'));
      break;
    case 'mapileng':
      ribbon(0, L, 56, 70, -90, '#3fb3a6', 1);
      along(0, L, 5, 10, (s) => rock(s, -(7 + rng() * 40), 1 + rng() * 3, pick(['#a79a84', '#8f8472', '#b4a68c'])));
      along(0, L, 10, 18, (s) => rock(s, 14 + rng() * 40, 1 + rng() * 2, '#9a8f7a'));
      along(0, L, 4, 4.2, (s) => guard(s, 5.2));
      along(150, L, 240, 380, (s) => house(s, -(22 + rng() * 10), 6, 7, 3, '#a8a79f', '#5e5a52'));
      along(0, L, 18, 30, (s) => put('hull', G.box, s, -(18 + rng() * 30), 2.2, 0.2, 2.2, pick(['#f2a6c4', '#f7d4e2', '#ffffff']), 0, 0.1));
      break;
  }
  // ---------- dựng các instance ----------
  const tmp = new THREE.Object3D(), tc = new THREE.Color();
  for (const [name, set] of Object.entries(sets)) {
    const m = new THREE.InstancedMesh(set.geo, mat, set.list.length);
    set.list.forEach((e, i) => {
      tmp.position.set(e[0], e[1], e[2]); tmp.scale.set(e[3], e[4], e[5]); tmp.rotation.set(0, e[6], 0); tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix); m.setColorAt(i, tc.set(e[7]));
    });
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; group.add(m);
  }

  // ---------- biển cột mốc mỗi 500 m ----------
  for (let s = 500; s < map.km * 1000; s += 500) {
    const P = posAt(s), [x, z] = off(P, 6.4);
    const sp = textSprite(s % 1000 === 0 ? (s / 1000) + ' km' : (s / 1000).toFixed(1) + ' km', { bg: '#1f2a33cc', scaleW: 3.2, w: 256, h: 96, font: 'bold 48px system-ui' });
    sp.position.set(x, P.y + 1.6, z); group.add(sp);
  }
  // ---------- cổng xuất phát / về đích ----------
  function gantry(s, label, color) {
    const P = posAt(s), g = new THREE.Group();
    const post = (o) => { const [x, z] = off(P, o); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 6, 8), new THREE.MeshLambertMaterial({ color: '#e9e6dc' })); m.position.set(x, P.y + 3, z); g.add(m); };
    post(-4.8); post(4.8);
    const [cx, cz] = off(P, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 10.4), new THREE.MeshLambertMaterial({ color })); bar.position.set(cx, P.y + 6, cz); bar.rotation.y = -P.h; g.add(bar);
    const t = textSprite(label, { scaleW: 7, w: 512, h: 128, font: 'bold 64px system-ui' }); t.position.set(cx, P.y + 8, cz); g.add(t);
    const chk = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 8.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    chk.position.set(cx, P.y + 0.06, cz); chk.rotation.y = -P.h; g.add(chk);
    group.add(g); return g;
  }
  gantry(0, 'XUẤT PHÁT', '#d2491f');
  let finish = null;
  function setFinish(dist) { if (finish) group.remove(finish); finish = gantry(dist, 'VỀ ĐÍCH', '#0b6f66'); }

  return {
    group, theme: T, posAt, off, groundH, setFinish,
    update(x, z) { if (sea) sea.position.set(x, 0, z); }
  };
}
