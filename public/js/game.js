// Engine game: nhân vật chibi + trang bị, 4 làn, camera zoom in/zoom out xoay 360°, thể lực/vật phẩm/chướng ngại/chó đuổi.
import * as THREE from 'three';
import { buildWorld, textSprite } from './world.js';
import { buildGpsWorld } from './gpsworld.js';
import { sfx } from './sound.js';
const S = window.Shared, R = S.RULES, LX = S.LANES.X;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const C = (h) => new THREE.Color(h);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hueColor = (id) => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.55, 0.52);
export const levelOf = (km) => 1 + Math.floor(km / 5);
const itemColor = (cat, id) => { const it = S.shopItem(cat, id); return it && it.color ? it.color : null; };

// ---------- nhân vật chibi: thân hình chuông, đầu tròn, hào quang quanh chân ----------
const bellGeo = new THREE.LatheGeometry([[0.0, 0], [0.6, 0.04], [0.68, 0.35], [0.56, 0.85], [0.38, 1.2], [0.3, 1.32], [0.0, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
const headGeo = new THREE.SphereGeometry(0.52, 16, 12), hairGeo = new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const sashGeo = new THREE.TorusGeometry(0.58, 0.09, 6, 20).rotateX(Math.PI / 2), limbGeo = new THREE.SphereGeometry(0.17, 8, 6), footGeo = new THREE.SphereGeometry(0.2, 8, 6);
const ringGeo = new THREE.RingGeometry(1.0, 1.45, 36).rotateX(-Math.PI / 2), sparkGeo = new THREE.SphereGeometry(0.1, 6, 4);
const L = (c, extra) => new THREE.MeshLambertMaterial({ color: c, ...extra });
function actorTag(name, km, tier, me) {
  const w = 512, h = 220, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 70px system-ui, sans-serif'; x.lineWidth = 10; x.strokeStyle = '#000a'; x.strokeText(name, w / 2, 40); x.fillStyle = me ? '#ffe27a' : '#fff'; x.fillText(name, w / 2, 40);
  x.font = '600 38px system-ui, sans-serif'; x.fillStyle = '#e8e1d0'; x.strokeText('Cấp ' + levelOf(km), w / 2, 90); x.fillText('Cấp ' + levelOf(km), w / 2, 90);
  const T = S.TIERS[tier], label = `${T.icon} ${km.toFixed(1)} km`;
  x.font = 'bold 46px system-ui, sans-serif'; const tw = x.measureText(label).width + 44;
  x.fillStyle = T.color; x.beginPath(); x.roundRect(w / 2 - tw / 2, 120, tw, 70, 35); x.fill(); x.fillStyle = '#fff'; x.fillText(label, w / 2, 157);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(3.7, 3.7 * h / w, 1); sp.renderOrder = 20; return sp;
}
function addHat(head, id) {
  const col = itemColor('hat', id); if (!col) return;
  const add = (m, x, y, z, rx = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, 0, rz); head.add(m); return m; };
  if (id === 'nonla') add(new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 16), L(col)), 0, 0.62, 0);
  else if (id === 'bando') { add(new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.07, 6, 18).rotateX(Math.PI / 2), L(col)), 0, 0.22, 0); add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), L(col)), -0.65, 0.12, 0.1, 0, 0.5); }
  else if (id === 'cap') { add(new THREE.Mesh(new THREE.SphereGeometry(0.57, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), L(col)), 0, 0.14, 0); add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.6), L(col)), 0.62, 0.2, 0); }
  else if (id === 'neko') for (const z of [-0.3, 0.3]) add(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4), L(col)), 0, 0.62, z);
  else if (id === 'crown') { add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.22, 12, 1, true), L(col, { side: THREE.DoubleSide })), 0, 0.58, 0); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 4), L(col)), Math.cos(a) * 0.4, 0.82, Math.sin(a) * 0.4); } }
}
function addAcc(body, g, id, headG) {
  const col = itemColor('acc', id); if (!col) return;
  if (id === 'glasses') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.62), L(col)); m.position.set(0.5, 0.03, 0); headG.add(m); }
  else if (id === 'scarf') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 6, 16).rotateX(Math.PI / 2), L(col)); t.position.y = 1.08; body.add(t); const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.2), L(col)); tail.position.set(-0.45, 0.85, 0.15); body.add(tail); }
  else if (id === 'backpack') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.75, 0.62), L(col)); m.position.set(-0.6, 0.78, 0); body.add(m); }
  else if (id === 'cape') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 1.0), L(col, { side: THREE.DoubleSide })); m.position.set(-0.66, 0.8, 0); m.rotation.z = 0.12; body.add(m); g.userData.cape = m; }
}
export function makeRunner(info, me) {
  const eq = { ...S.SHOP_DEFAULT, ...(info.equip || {}) };
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const T = S.TIERS[info.tier || 0];
  const b = new THREE.Mesh(bellGeo, L(me ? '#e0a43a' : hueColor(info.id || 1))); b.scale.set(0.92, 0.85, 0.92); body.add(b);
  const sash = new THREE.Mesh(sashGeo, L('#f2c230')); sash.position.y = 0.62; sash.scale.set(0.92, 1, 0.92); body.add(sash);
  const skin = L('#f0bf98'), headG = new THREE.Group(); headG.position.y = 1.72; headG.scale.setScalar(1.3); body.add(headG);      // chibi: đầu to gấp 1,3 lần
  headG.add(new THREE.Mesh(headGeo, skin));
  const hair = new THREE.Mesh(hairGeo, L(['#2a2220', '#4a3020', '#1d1d24', '#6a4a2a'][(info.id || 0) % 4])); hair.position.y = 0.04; headG.add(hair);
  const white = new THREE.MeshBasicMaterial({ color: '#fff' }), ink = new THREE.MeshBasicMaterial({ color: '#1d1a1a' }), blush = new THREE.MeshBasicMaterial({ color: '#ff8fa0', transparent: true, opacity: 0.75 });
  for (const z of [-0.2, 0.2]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), white); w.scale.set(0.5, 1.15, 1); w.position.set(0.42, 0.0, z); headG.add(w);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), ink); e.scale.set(0.6, 1.15, 1); e.position.set(0.47, -0.01, z); headG.add(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), white); h.position.set(0.52, 0.05, z + 0.025); headG.add(h);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), blush); ch.scale.set(0.35, 0.8, 1.3); ch.position.set(0.44, -0.17, z * 1.65); headG.add(ch);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.013, 4, 10, Math.PI).rotateZ(Math.PI), ink); mouth.rotation.y = Math.PI / 2; mouth.position.set(0.5, -0.15, 0); headG.add(mouth);
  const hp = new THREE.Group(); headG.add(hp); addHat(hp, eq.hat);
  addAcc(body, g, eq.acc, headG);
  // thân nâng lên (BASE) để lộ đôi chân; tay và chân có khớp hông/vai + gối/khuỷu để bước tự nhiên
  const BASE = 0.42, skinMat = skin, cyl = (r, h) => new THREE.CylinderGeometry(r, r * 0.9, h, 8).translate(0, -h / 2, 0);
  const wc = itemColor('watch', eq.watch), shoeCol = itemColor('shoes', eq.shoes) || '#3a2d26';
  const limb = (len1, len2, r, endGeo, endMat, y, z) => {
    const hip = new THREE.Group(); hip.position.set(0, y, z); body.add(hip);
    hip.add(new THREE.Mesh(cyl(r, len1), skinMat));
    const knee = new THREE.Group(); knee.position.y = -len1; hip.add(knee);
    knee.add(new THREE.Mesh(cyl(r * 0.92, len2), skinMat));
    const end = new THREE.Mesh(endGeo, endMat); end.position.y = -len2; knee.add(end);
    return { hip, knee, end };
  };
  const arms = [-1, 1].map((sd) => limb(0.28, 0.26, 0.085, limbGeo.clone().scale(0.8, 0.8, 0.8), skinMat, 0.9, sd * 0.64));
  if (wc) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), eq.watch === 'watch_smart' ? new THREE.MeshBasicMaterial({ color: wc }) : L(wc)); w.position.set(0, 0.1, 0); arms[1].knee.add(w); }
  const legs = [-1, 1].map((sd) => limb(0.22, 0.22, 0.1, footGeo.clone().scale(1.15, 0.7, 0.9), L(shoeCol), 0.2, sd * 0.26));
  const feet = legs.map((lg, k) => { lg.end.position.x = 0.08;
    if (eq.shoes === 'shoe_wing') { const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), L('#fff')); w.position.set(-0.22, 0.05, 0); w.rotation.z = 0.5; lg.end.add(w); } return lg.end; });
  // hào quang: theo hạng, hoặc loại đã mua
  const auraCol = eq.aura !== 'aura_tier' ? itemColor('aura', eq.aura) : null, ringCol = me && !auraCol ? '#ffe9a0' : (auraCol || T.color);
  const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = 0.05; g.add(halo);
  const sparks = [];
  if (auraCol) for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: auraCol, transparent: true, opacity: 0.9 })); g.add(m); sparks.push(m); }
  const tag = actorTag(info.name || 'Khách', info.km || 0, info.tier || 0, me); tag.position.y = me ? 5.1 : 4.6; g.add(tag);
  let arrow = null;
  if (me) { arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 3).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffd23a' })); arrow.position.y = 3.3; g.add(arrow); }
  g.scale.setScalar(me ? 1.25 : 1.1);
  return { group: g, body, arms, legs, feet, halo, arrow, sparks, rainbow: eq.aura === 'aura_rainbow', phase: 0,
    sp: 0,
    animate(dt, speed, jumpH, t) {
      this.sp += (speed - this.sp) * Math.min(1, dt * 10);
      const mv = clamp((this.sp - 0.4) / 1.2, 0, 1), amp = mv * clamp(0.6 + this.sp / 10, 0.6, 1), air = clamp(jumpH / 1.1, 0, 1), g1 = 1 - air;
      if (mv > 0) this.phase += dt * (6 + this.sp * 0.7);            // nhịp chân theo tốc độ thật
      const p = this.phase, A = 0.8 * amp, sn = Math.sin(p), K = 1.15;
      const hipA = A * sn * g1 + air * 0.75, hipB = -A * sn * g1 - air * 0.25;
      const kneeA = -(K * Math.max(0, Math.cos(p)) * amp * g1 + air * 1.0), kneeB = -(K * Math.max(0, -Math.cos(p)) * amp * g1 + air * 0.7);
      this.legs[0].hip.rotation.z = hipA; this.legs[0].knee.rotation.z = kneeA; this.legs[1].hip.rotation.z = hipB; this.legs[1].knee.rotation.z = kneeB;
      const sw = 0.95 * amp * g1;
      this.arms[0].hip.rotation.z = -sn * sw + air * 2.3; this.arms[1].hip.rotation.z = sn * sw + air * 2.3;
      const el = 0.3 + 0.8 * amp; this.arms[0].knee.rotation.z = el * g1 + air * 0.3; this.arms[1].knee.rotation.z = el * g1 + air * 0.3;
      this.body.position.y = BASE + jumpH - 0.12 * (1 - Math.abs(Math.cos(p))) * amp * g1;
      this.body.rotation.z = -0.14 * amp - 0.1 * air; this.body.rotation.x = sn * 0.07 * amp * g1;
      const cape = this.group.userData.cape; if (cape) cape.rotation.z = 0.12 + 0.25 * amp + Math.sin(t * 8) * 0.05 * amp;
      this.halo.material.opacity = 0.6 + Math.sin(t * 3 + this.phase * 0.1) * 0.2; this.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05);
      if (this.rainbow) this.halo.material.color.setHSL((t * 0.3) % 1, 0.9, 0.6);
      this.sparks.forEach((m, i) => { const a = t * 1.6 + i * 6.28 / this.sparks.length; m.position.set(Math.cos(a) * 1.25, 0.4 + ((t * 0.8 + i * 0.37) % 1) * 2.2, Math.sin(a) * 1.25); if (this.rainbow) m.material.color.setHSL((t * 0.3 + i / 7) % 1, 0.9, 0.6); });
      if (this.arrow) this.arrow.position.y = 3.6 + Math.sin(t * 4) * 0.18 + jumpH;
    } };
}

// ---------- hình vật phẩm / chướng ngại ----------
const emojiTex = {};
function coinTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(48, 44, 6, 64, 64, 58); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#ffd23a'); g.addColorStop(0.8, '#e0a100'); g.addColorStop(1, '#a86d00');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 56, 0, 7); x.fill();
  x.lineWidth = 8; x.strokeStyle = '#c98a00'; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.stroke();
  x.lineWidth = 5; x.strokeStyle = '#ffe27a'; x.beginPath(); x.arc(64, 64, 40, 0, 7); x.stroke();
  x.fillStyle = '#b87800'; x.font = 'bold 54px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 64, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function emojiSprite(ch, size = 2.2) {
  if (ch === S.COIN.ICON && !emojiTex[ch]) emojiTex[ch] = coinTexture();     // xu vàng tự vẽ (emoji 🪙 trên iPhone ra màu bạc)
  if (!emojiTex[ch]) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70); emojiTex[ch] = new THREE.CanvasTexture(cv); emojiTex[ch].colorSpace = THREE.SRGBColorSpace; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex[ch], transparent: true, depthWrite: false })); sp.scale.set(size, size, 1); sp.renderOrder = 6; return sp;   // vẽ sau lớp đường bán trong suốt của chế độ bản đồ
}
const rockCache = [];
function rockGeo(i) {                                   // đá lởm chởm: icosahedron bị xô lệch đỉnh (cố định theo i)
  if (rockCache[i]) return rockCache[i];
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, h = (n) => { const x = Math.sin(n * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };
  const seen = new Map();
  for (let k = 0; k < p.count; k++) { const key = p.getX(k).toFixed(3) + p.getY(k).toFixed(3) + p.getZ(k).toFixed(3); if (!seen.has(key)) seen.set(key, 0.78 + h(seen.size + 1) * 0.5); const f = seen.get(key); p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.85, p.getZ(k) * f); }
  g.computeVertexNormals(); return (rockCache[i] = g);
}
function rockCluster(M) {
  const g = new THREE.Group(), tones = ['#8d8a84', '#7d7a74', '#9b978e'];
  [[0, 0.62, 0, 1.0, 0], [-0.9, 0.38, 0.55, 0.62, 1], [0.85, 0.33, -0.5, 0.52, 2]].forEach(([x, y, z, sc, k]) => { const m = new THREE.Mesh(rockGeo(k), M(tones[k])); m.position.set(x, y, z); m.scale.setScalar(sc * 1.05); m.rotation.y = k * 1.7; g.add(m); });
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.42), M('#6f9a4a')); moss.position.set(0.05, 0.95, 0.05); moss.scale.set(1, 0.7, 1); g.add(moss);   // rêu trên đỉnh
  return g;
}
function branchMesh(M) {                                // cành cây gãy nằm ngang đường, có cành con và lá
  const g = new THREE.Group(), bark = M('#6b4a2c'), dark = M('#4e3620');
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 4.6, 7).rotateX(Math.PI / 2), bark); trunk.position.y = 0.42; g.add(trunk);
  const cut = new THREE.Mesh(new THREE.CircleGeometry(0.34, 7), M('#d9b988')); cut.position.set(0, 0.42, -2.3); cut.rotation.y = Math.PI; g.add(cut);   // mặt cắt gỗ
  [[-1.3, 0.55, 0.75, 0.4, 1.3], [0.2, 0.62, -0.85, -0.45, 1.1], [1.4, 0.5, 0.6, 0.55, 0.9]].forEach(([z, y, x, rot, len]) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, len, 5).translate(0, len / 2, 0), dark); t.position.set(0, y - 0.1, z); t.rotation.z = -Math.sign(x) * (1.0 + Math.abs(rot) * 0.3); t.rotation.y = rot; g.add(t);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M(['#4f8a3a', '#5f9d45', '#3f7a33'][Math.abs(Math.floor(z * 3)) % 3])); leaf.position.set(Math.sign(x) * (0.2 + len * 0.78), y + 0.35, z); leaf.scale.set(1.15, 0.7, 1.15); g.add(leaf);
  });
  const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), M('#4f8a3a')); tip.position.set(0, 0.62, 2.35); tip.scale.set(1.2, 0.75, 1); g.add(tip);
  return g;
}
export function obstacleMesh(kind) {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  if (kind === 'rock') g.add(rockCluster(M));
  else if (kind === 'branch') g.add(branchMesh(M));
  else if (kind === 'puddle') { const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#58a9d8' })); m.scale.set(1, 1, 1.7); m.position.y = 0.06; g.add(m); }
  else if (kind === 'cone') { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 10), M('#ff7a1a')); m.position.y = 0.65; g.add(m); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.25, 10), M('#fff')); b.position.y = 0.6; g.add(b); }
  else if (kind === 'crate') { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), M('#b98a4f')); m.position.y = 0.6; g.add(m); }
  else if (kind === 'log') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 4.6, 10).rotateX(Math.PI / 2), M('#7a5233')); m.position.y = 0.42; g.add(m);
    for (const z of [-2.31, 2.31]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), M('#d6b17a')); c.position.set(0, 0.42, z); c.rotation.y = z < 0 ? Math.PI : 0; g.add(c); const r = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 10), M('#a8804e')); r.position.set(0, 0.42, z * 1.001); r.rotation.y = c.rotation.y; g.add(r); }
    for (const z of [-1.3, 0.5, 1.6]) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 4, 12), M('#5d3d24')); k.position.set(0, 0.42, z); g.add(k); }
  }
  else { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.1), M('#6c747c')); b.position.y = 1.0; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), M('#7b848c')); h.position.set(1.4, 1.2, 0); g.add(h); for (const z of [-0.5, 0.5]) { const hn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), M('#e8e1cf')); hn.position.set(1.7, 1.75, z); hn.rotation.z = -0.5; g.add(hn); } for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), M('#4a5258')); l.position.set(x, 0.35, z); g.add(l); } }
  return g;
}
const OBST = { hanoi: ['cone', 'crate', 'puddle', 'log', 'branch'], saigon: ['cone', 'crate', 'puddle'], danang: ['cone', 'puddle', 'rock', 'branch'], halong: ['rock', 'puddle', 'cone', 'branch'],
  trangan: ['buffalo', 'rock', 'puddle', 'branch'], mocchau: ['rock', 'puddle', 'buffalo', 'branch', 'log'], haivan: ['rock', 'rock', 'puddle', 'cone', 'branch'], prenn: ['rock', 'branch', 'log', 'puddle'],
  oquyho: ['rock', 'puddle', 'buffalo', 'branch'], mapileng: ['rock', 'rock', 'cone', 'branch'], gps: ['cone', 'crate', 'puddle', 'rock', 'log', 'branch'] };
const OBST_H = { rock: 1.0, puddle: 0.1, cone: 1.0, crate: 1.1, log: 0.8, branch: 0.9, buffalo: 1.4 }, OBST_W = { puddle: 2, log: 2, branch: 2 };
export function dogMesh() {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const fur = M('#d08f4f'), dark = M('#8b5a2b'), light = M('#f6e6c8'), pink = M('#e8788a'), ink = new THREE.MeshBasicMaterial({ color: '#1b1210' });
  const S = (r, sx, sy, sz, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz), mat); m.position.set(x, y, z); parent.add(m); return m; };
  const rig = new THREE.Group(); g.add(rig);                                    // thân + đầu nhún theo nhịp phi
  S(0.5, 1.5, 0.92, 0.88, fur, 0, 0.98, 0, rig);                                // thân
  S(0.4, 0.95, 1, 0.86, light, 0.58, 0.88, 0, rig);                             // ngực trắng
  S(0.44, 1, 1, 0.95, fur, -0.55, 1.0, 0, rig);                                 // mông
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 16), M('#d93a3a')); collar.rotation.y = Math.PI / 2; collar.position.set(0.82, 1.2, 0); collar.rotation.z = -0.5; rig.add(collar);
  const head = new THREE.Group(); head.position.set(0.98, 1.38, 0); rig.add(head);
  S(0.4, 1.05, 1, 0.95, fur, 0, 0, 0, head);                                    // sọ
  S(0.22, 1.5, 0.85, 1, light, 0.38, -0.12, 0, head);                           // mõm
  S(0.085, 1, 0.8, 1.1, ink, 0.66, -0.02, 0, head);                             // mũi
  for (const z of [-0.18, 0.18]) {
    S(0.075, 1, 1.2, 1, ink, 0.3, 0.1, z, head); S(0.025, 1, 1, 1, new THREE.MeshBasicMaterial({ color: '#fff' }), 0.36, 0.15, z + (z > 0 ? -0.02 : 0.02), head);   // mắt + ánh
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), dark); brow.position.set(0.28, 0.24, z); brow.rotation.x = z > 0 ? 0.45 : -0.45; head.add(brow);   // chân mày dữ nhưng dễ thương
    const ear = S(0.17, 0.55, 1.25, 0.45, dark, -0.1, 0.32, z * 1.65, head); ear.rotation.x = z > 0 ? 0.5 : -0.5; ear.rotation.z = 0.25;                                       // tai cụp
  }
  const jaw = new THREE.Group(); jaw.position.set(0.22, -0.2, 0); head.add(jaw);
  const jm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.22), light); jm.position.x = 0.18; jaw.add(jm);
  const tongue = S(0.1, 1.6, 0.35, 0.8, pink, 0.3, -0.05, 0, jaw);
  const tail = new THREE.Group(); tail.position.set(-0.98, 1.15, 0); rig.add(tail);
  const tm = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8).translate(0, 0.4, 0), fur); tm.rotation.z = 0.9; tail.add(tm);
  const legs = [[0.62, -1], [0.62, 1], [-0.6, -1], [-0.6, 1]].map(([x, sd]) => {
    const pv = new THREE.Group(); pv.position.set(x, 0.72, sd * 0.27); g.add(pv);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.5, 8).translate(0, -0.25, 0), fur); pv.add(leg);
    S(0.14, 1.3, 0.7, 1, light, 0.05, -0.52, 0, pv); return pv; });
  g.scale.setScalar(1.35); g.userData = { rig, head, jaw, tongue, tail, legs }; return g;
}
export function dogAnimate(g, t, run) {
  const u = g.userData, w = t * 17, sn = Math.sin(w);
  u.legs[0].rotation.z = sn * 0.95 * run; u.legs[1].rotation.z = Math.sin(w + 0.5) * 0.95 * run;       // chân trước
  u.legs[2].rotation.z = Math.sin(w + 2.3) * 0.95 * run; u.legs[3].rotation.z = Math.sin(w + 2.8) * 0.95 * run;   // chân sau
  u.rig.position.y = Math.abs(Math.sin(w + 0.6)) * 0.2 * run; u.rig.rotation.z = Math.sin(w + 1.2) * 0.08 * run;
  u.head.rotation.z = -0.08 + Math.sin(w + 0.4) * 0.1 * run; u.jaw.rotation.z = -(0.18 + 0.2 * (0.5 + 0.5 * Math.sin(t * 15))) * run;
  u.tongue.position.y = -0.05 - Math.abs(Math.sin(t * 15)) * 0.05; u.tail.rotation.y = Math.sin(t * 24) * 0.7;
}

// ---------- xe máy đi ngược chiều ----------
const BIKE_COL = ['#d93a3a', '#2f7fd8', '#19a974', '#f2b420', '#8e5bd9', '#ef7d2d'];
export function bikeMesh(hue) {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }), col = BIKE_COL[hue % BIKE_COL.length];
  const wheels = [];
  for (const x of [-0.72, 0.74]) {
    const w = new THREE.Group(); w.position.set(x, 0.38, 0); g.add(w);
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 14).rotateX(Math.PI / 2), M('#222')));
    w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 8).rotateX(Math.PI / 2), M('#c9ccd1')));
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.04), M('#888')); w.add(sp); wheels.push(w);
  }
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.34), M(col)); body.position.set(0, 0.72, 0); g.add(body);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.38), M(col)); tank.position.set(0.28, 0.98, 0); g.add(tank);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.34), M('#2b2b30')); seat.position.set(-0.3, 0.98, 0); g.add(seat);
  const fork = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), M('#bfc3c8')); fork.position.set(0.74, 0.78, 0); fork.rotation.z = 0.28; g.add(fork);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 6).rotateX(Math.PI / 2), M('#1f1f24')); bar.position.set(0.62, 1.2, 0); g.add(bar);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff7b0' })); lamp.position.set(0.9, 1.05, 0); g.add(lamp);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 14), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0.35, depthWrite: false })); glow.position.set(1.1, 1.05, 0); glow.rotation.y = Math.PI / 2; g.add(glow);   // chùm đèn pha: dễ thấy từ xa
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.62, 8), M('#33557a')); torso.position.set(-0.22, 1.42, 0); torso.rotation.z = -0.25; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), M('#f0bf98')); head.position.set(-0.02, 1.9, 0); g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), M(col)); helm.position.set(-0.02, 1.95, 0); g.add(helm);
  for (const z of [-0.3, 0.3]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6), M('#33557a')); arm.position.set(0.25, 1.38, z); arm.rotation.z = -1.0; g.add(arm); }
  g.scale.setScalar(1.3); g.userData.wheels = wheels; return g;
}

// ---------- đội cổ vũ: các bạn nữ chibi đứng hai bên đường ----------
const CHEER_MAX = { hanoi: 5, saigon: 5, danang: 5, gps: 5, halong: 4, trangan: 4, mocchau: 3, haivan: 3, prenn: 3, oquyho: 2, mapileng: 2 };   // số người tối đa mỗi đội theo cung đường
const CHEER_ROLES = ['pompom', 'cheer', 'spray', 'wave', 'pompom'];
const CHEER_SAY = ['Cố lên!', 'Hết mình!', 'Tuyệt vời!', 'Đỉnh quá!', 'Go go go!', 'Fighting!', 'Sắp tới rồi!', 'Chạy đi!'];
const OUTFIT = [['#ff5c93', '#ffffff'], ['#ffb02e', '#ff5c5c'], ['#38b6ff', '#ffffff'], ['#9b5cff', '#ffe27a'], ['#2ec27e', '#ffffff'], ['#ff6b3d', '#fff2b0']];
export function makeCheer(k, role) {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c }), [top, accent] = OUTFIT[k % OUTFIT.length], skin = M('#f6c9a4');
  const body = new THREE.Group(); body.position.y = 0.4; g.add(body);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 0.62, 10), M(top)); torso.position.y = 0.95; body.add(torso);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.55, 12, 1, true).translate(0, -0.275, 0), new THREE.MeshLambertMaterial({ color: accent, side: THREE.DoubleSide })); skirt.position.y = 0.72; body.add(skirt);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 6, 14).rotateX(Math.PI / 2), M('#fff')); sash.position.y = 0.76; body.add(sash);
  const headG = new THREE.Group(); headG.position.y = 1.62; headG.scale.setScalar(1.3); body.add(headG);
  headG.add(new THREE.Mesh(headGeo, skin));
  const hairCol = ['#1d1717', '#3a2316', '#5a2a1c', '#14141c'][k % 4], hairM = M(hairCol);
  const hair = new THREE.Mesh(hairGeo, hairM); hair.position.y = 0.05; headG.add(hair);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), hairM); back.scale.set(0.55, 1.05, 0.95); back.position.set(-0.28, -0.2, 0); headG.add(back);          // tóc dài sau lưng
  if (k % 2 === 0) { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hairM); tail.scale.set(0.7, 1.7, 0.7); tail.position.set(-0.55, -0.1, 0.25); tail.rotation.z = 0.4; headG.add(tail); }   // đuôi ngựa
  for (const z of [-0.3, 0.3]) { const bow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 4), M(top)); bow.position.set(-0.05, 0.5, z); bow.rotation.x = z > 0 ? -1.2 : 1.2; headG.add(bow); }
  const white = new THREE.MeshBasicMaterial({ color: '#fff' }), ink = new THREE.MeshBasicMaterial({ color: '#1d1a1a' }), blush = new THREE.MeshBasicMaterial({ color: '#ff8fa0', transparent: true, opacity: 0.8 });
  for (const z of [-0.2, 0.2]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), white); w.scale.set(0.5, 1.2, 1); w.position.set(0.42, 0.0, z); headG.add(w);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), ink); e.scale.set(0.6, 1.2, 1); e.position.set(0.47, -0.01, z); headG.add(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), white); h.position.set(0.52, 0.05, z + 0.025); headG.add(h);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), blush); ch.scale.set(0.35, 0.8, 1.3); ch.position.set(0.44, -0.17, z * 1.65); headG.add(ch);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#c2385a' })); mouth.scale.set(0.4, 0.6, 1); mouth.position.set(0.5, -0.15, 0); headG.add(mouth);      // miệng há cười
  const arm = (sd) => {
    const sh = new THREE.Group(); sh.position.set(0, 1.2, sd * 0.46); body.add(sh);
    sh.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.5, 6).translate(0, -0.25, 0), skin));
    const hand = new THREE.Group(); hand.position.y = -0.52; sh.add(hand); hand.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), skin));
    return { sh, hand };
  };
  const arms = [arm(-1), arm(1)], pom = [];
  if (role === 'pompom' || role === 'cheer') for (const a of arms) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshLambertMaterial({ color: k % 2 ? '#ff4f8b' : '#ffd23a', flatShading: true, emissive: '#331100' })); p.position.y = 0.05; a.hand.add(p); pom.push(p); }
  let bottle = null;
  if (role === 'spray') { bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 8), new THREE.MeshLambertMaterial({ color: '#6fd0ff', transparent: true, opacity: 0.85 })); bottle.position.set(0.12, 0.1, 0); bottle.rotation.z = -1.1; arms[1].hand.add(bottle); }
  const legs = [-1, 1].map((sd) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.4, 6).translate(0, -0.2, 0), M('#fff')); l.position.set(0, 0.42, sd * 0.2); body.add(l); const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1.2, 0.7, 0.9), M(accent)); f.position.set(0.06, -0.4, 0); l.add(f); return l; });
  g.scale.setScalar(1.2); g.userData = { body, arms, legs, headG, role, pom, bottle, skirt, k };
  return g;
}
export function animateCheer(c, t, ph, excite) {                 // excite 0..1: càng gần vận động viên càng nhiệt
  const u = c.userData, a = 0.7 + excite * 0.6, w = t * (5 + excite * 4) + ph, s = Math.sin(w), hop = Math.max(0, Math.sin(w * 1.0)) * (0.12 + excite * 0.3);
  u.body.position.y = 0.4 + (u.role === 'cheer' || excite > 0.5 ? hop : hop * 0.3); u.skirt.scale.set(1 + Math.abs(s) * 0.12, 1, 1 + Math.abs(s) * 0.12);
  u.headG.rotation.z = Math.sin(w * 0.5) * 0.12; u.headG.rotation.x = Math.sin(w * 0.7) * 0.08;
  const [L, R] = u.arms;
  if (u.role === 'cheer') { L.sh.rotation.z = 2.4 + s * 0.3 * a; R.sh.rotation.z = 2.4 - s * 0.3 * a; L.sh.rotation.x = 0.9; R.sh.rotation.x = -0.9; }     // hai tay giơ cao
  else if (u.role === 'pompom') { L.sh.rotation.z = 1.9 + s * 0.6 * a; R.sh.rotation.z = 1.9 - s * 0.6 * a; L.sh.rotation.x = 0.8; R.sh.rotation.x = -0.8; }
  else if (u.role === 'wave') { R.sh.rotation.z = 2.7; R.sh.rotation.x = -0.25; R.hand.rotation.z = s * 0.9; L.sh.rotation.z = 0.35; L.hand.rotation.z = 0; }       // vẫy tay
  else { R.sh.rotation.z = 1.5; R.sh.rotation.x = -0.3 + s * 0.08; L.sh.rotation.z = 2.3 + s * 0.4 * a; L.sh.rotation.x = 0.3; }                                   // cầm chai phun nước, tay kia giơ lên
  if (u.pom) for (const p of u.pom) p.rotation.y = w * 3;
  for (let i = 0; i < 2; i++) u.legs[i].rotation.z = (i ? s : -s) * 0.25 * (u.role === 'cheer' || excite > 0.5 ? 1 : 0.4);
}

// ---------- Game ----------
export class Game {
  constructor(canvas, hooks, cfg = {}) {
    this.hooks = hooks; this.canvas = canvas; this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxPR = Math.min(2, window.devicePixelRatio || 1); this.pr = Math.min(this.maxPR, 1.5); this.ft = 16; this.fc = 0;   // độ phân giải tự điều chỉnh theo FPS
    this.renderer.setPixelRatio(this.pr); cfg.aniso = this.renderer.capabilities.getMaxAnisotropy(); this.cfg = cfg;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2500); this.maxD = 180;
    this.scene.add(new THREE.HemisphereLight('#fff3dc', '#8a7a62', 1.0));
    const sun = new THREE.DirectionalLight('#fff1d2', 1.1); sun.position.set(40, 80, 30); this.scene.add(sun);
    // camera: zoom in = bám đường chạy; zoom out = toàn cảnh, kéo để xoay 360°
    this.camD = 34; this.focusPitch = 0.8; this.pitchCur = 0.8; this.pitchO = 1.0; this.yaw = 0; this.yawCur = 0; this.camHead = 0;
    this.hold = new Set(); this.running = false; this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.others = new Map(); this.floaters = []; this.t = 0; this.last = 0; this.hudT = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this); this.ticker = setInterval(() => this.logic(), 100);
    this.bindPointer();
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = h > w ? Math.min(78, 48 * Math.pow(h / w, 0.55)) : 48; this.camera.updateProjectionMatrix(); }
  get overview() { return this.camD > 60; }
  bindPointer() {
    const el = this.canvas, pts = new Map(); let pinch = 0, drag = null, swipe = null, tap = null, holdT = 0;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; swipe = [e.clientX, e.clientY, performance.now()];
      tap = pts.size === 1 && (e.pointerType !== 'mouse' || e.button === 0) ? { x: e.clientX, y: e.clientY, t: performance.now(), ok: true, held: false } : null; if (pts.size > 1 && tap) tap.ok = false;
      clearTimeout(holdT); if (tap) { const mine = tap; holdT = setTimeout(() => { if (tap === mine && mine.ok && this.running) { mine.held = true; this.setHold('ptr', true); } }, 220); }   /* giữ yên 0,22 giây = chạy liên tục */
      if (pts.size > 1) this.setHold('ptr', false);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (tap && (pts.size > 1 || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10)) { tap.ok = false; if (tap.held) { tap.held = false; this.setHold('ptr', false); } }   // kéo/chụm thì không tính là chạm
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.camD = clamp(this.camD * pinch / d, 14, this.maxD); pinch = d; return; }
      if (this.overview) this.orbit(e.clientX - prev[0], e.clientY - prev[1]);
    });
    const up = (e) => {
      if (swipe && pts.size === 1 && !this.overview && this.running) {          // vuốt ngang để đổi làn khi đang zoom in
        const dx = e.clientX - swipe[0], dy = e.clientY - swipe[1];
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - swipe[2] < 600) this.moveLane(dx > 0 ? 1 : -1);
      }
      // chạm nhanh hoặc nhấp chuột (không kéo) = 1 bước; vuốt ngang/kéo xoay/chụm zoom không tính
      clearTimeout(holdT); this.setHold('ptr', false);
      if (tap && tap.ok && !tap.held && e.type === 'pointerup' && pts.size === 1 && performance.now() - tap.t < 400 && this.running) this.step();
      tap = null;
      pts.delete(e.pointerId); pinch = 0; swipe = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.camD = clamp(this.camD * (e.deltaY > 0 ? 1.12 : 0.89), 14, this.maxD); }, { passive: false });
  }
  orbit(dx, dy) { this.yaw += dx * 0.008; this.pitchO = clamp(this.pitchO - dy * 0.006, 0.35, 1.45); }
  resetView() { this.camD = 34; this.yaw = 0; this.pitchO = 1.0; }

  load(course, dist, mode, profile, seed = Math.floor(Math.random() * 1e9), view = '3d') {
    this.dispose(); this.map = course; this.total = Math.min(dist, course.km * 1000);
    // vệ tinh / bản đồ 2D cho bản đồ có tuyến thật: trải ảnh bản đồ dưới đường chạy (mặt phẳng, độ dốc vẫn tính theo dữ liệu độ cao)
    const imagery = course.kind !== 'gps' && course.route && (view === 'sat' || view === 'road');
    this.world = course.kind === 'gps' ? buildGpsWorld(course, this.scene, this.cfg) : imagery ? buildGpsWorld({ pts: course.route.pts, style: view }, this.scene, this.cfg) : buildWorld(course, this.scene);
    this.view = course.kind === 'gps' ? course.style : imagery ? view : '3d';
    const bb = this.world.bbox; this.maxD = bb ? clamp(bb.size * 1.1 + 200, 400, 7000) : 180;
    this.camera.near = bb ? 2 : 0.5; this.camera.far = bb ? 40000 : 2500; this.camera.updateProjectionMatrix();
    this.scene.background = C(this.world.theme.bg); this.scene.fog = new THREE.Fog(this.world.theme.bg, 70, 190);
    this.world.setFinish(this.total);
    this.profile = profile; this.mode = mode; this.seed = seed;
    const rng = mulberry(seed);
    this.st = { s: 0, target: 0, rate: 0, v: 0, lane: 1, lat: LX[1], stam: R.STAM_MAX, exhausted: false, slowT: 0, boltT: 0, jumpT: 0, jumpCd: 0, auto: 0, stepTimes: [], lastStep: -9,
      steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, time: 0, speed: 0, finished: false, items: {}, shake: 0, grade: 0 };
    this.unsent = { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} };
    this.inv = (profile.inventory || []).filter((s) => S.ITEMS[s.k]).map((s) => ({ k: s.k, n: Math.min(R.INV_STACK, s.n) })).slice(0, R.INV_SLOTS);
    // chướng ngại + vật phẩm + xu rơi ngẫu nhiên (theo seed) ở các làn
    this.obst = []; this.items = [];
    const kinds = OBST[course.theme] || OBST.gps, hard = 1 + ((course.diff || 1) - 1) * 0.12;
    for (let s = 70; s < this.total - 25; s += (48 + rng() * 60) / hard) {
      const kind = kinds[Math.floor(rng() * kinds.length)], w = OBST_W[kind] || 1, first = Math.floor(rng() * (S.LANES.COUNT - w + 1)), lanes = Array.from({ length: w }, (_, i) => first + i);
      const m = obstacleMesh(kind), P = this.world.posAt(s), lat = lanes.reduce((a, l) => a + LX[l], 0) / w, [x, z] = this.world.off(P, lat);
      m.position.set(x, P.y, z); m.rotation.y = -P.h; this.dyn.add(m); this.obst.push({ s, kind, lanes, h: OBST_H[kind], done: false, m });
    }
    const wsum = Object.values(S.ITEMS).reduce((a, i) => a + i.w, 0), hasObst = (s, lane) => this.obst.some((o) => Math.abs(o.s - s) < 5 && o.lanes.includes(lane));
    const addItem = (s, lane, key, sprite, z = 1.4) => { const P = this.world.posAt(s), [x, zz] = this.world.off(P, LX[lane]); sprite.position.set(x, P.y + z, zz); this.dyn.add(sprite); this.items.push({ s, lane, key, taken: false, sp: sprite, y: P.y + z }); };
    for (let s = 40; s < this.total - 15; s += (115 + rng() * 95) / (1 + ((course.diff || 1) - 1) * 0.08)) {
      let r = rng() * wsum, key = 'water'; for (const [k, i] of Object.entries(S.ITEMS)) { if ((r -= i.w) <= 0) { key = k; break; } }
      let lane = Math.floor(rng() * 4); for (let t = 0; t < 4 && hasObst(s, lane); t++) lane = (lane + 1) % 4;
      addItem(s, lane, key, emojiSprite(S.ITEMS[key].icon));
    }
    for (let s = 90; s < this.total - 40; s += 190 + rng() * 150) {     // thêm tia sét ⚡ rải đều để người chơi hay được tăng tốc
      let lane = Math.floor(rng() * 4); for (let t = 0; t < 4 && hasObst(s, lane); t++) lane = (lane + 1) % 4;
      addItem(s, lane, 'bolt', emojiSprite(S.ITEMS.bolt.icon));
    }
    for (let s = 55; s < this.total - 20; s += 38 + rng() * 60) {      // hàng xu ở một làn
      const lane = Math.floor(rng() * 4), n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) if (!hasObst(s + i * 2.4, lane)) addItem(s + i * 2.4, lane, 'coin', emojiSprite(S.COIN.ICON, 1.4), 1.0);
    }
    this.items.sort((a, b) => a.s - b.s);
    this.bikes = []; this.bikeEvents = []; for (let s = 140 + rng() * 120; s < this.total - 150; s += (230 + rng() * 170) / hard) this.bikeEvents.push({ s, lane: Math.floor(rng() * 4), v: 9 + rng() * 5, hue: Math.floor(rng() * 6) }); this.bikeIdx = 0;
    this.dogEvents = []; for (let s = 260 + rng() * 300; s < this.total - 120; s += 420 + rng() * 600) this.dogEvents.push(s);
    this.dogIdx = 0; this.dog = null; this.hold.clear();
    this.squads = []; { const cm = CHEER_MAX[course.theme] || 3; for (let s = 105 + rng() * 80; s < this.total - 50; s += 150 + rng() * 170) this.squads.push({ s, side: rng() < 0.5 ? -1 : 1, n: 1 + Math.floor(rng() * cm), k: Math.floor(rng() * 6), built: false, pass: false, g: null, list: [], parts: [] }); }
    this.emo = null;
    this.me = makeRunner({ id: 0, name: profile.name, km: profile.totals.totalKm, tier: profile.tier, equip: profile.equip }, true); this.scene.add(this.me.group);
    this.running = true; this.last = performance.now(); this.camHead = this.world.posAt(0).h; this.camD = 34; this.yaw = this.yawCur = 0; this.pitchO = 1.0; this.pitchCur = this.focusPitch; this.hud(true);
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.raf); this.emo = null; this.squads = [];
    if (this.world) { this.scene.remove(this.world.group); if (this.world.dispose) this.world.dispose(); }
    if (this.me) this.scene.remove(this.me.group);
    while (this.dyn.children.length) this.dyn.remove(this.dyn.children[0]);
    for (const o of this.others.values()) this.scene.remove(o.actor.group); this.others.clear(); for (const f of this.floaters || []) this.scene.remove(f.sp); this.floaters = []; this.dog = null;
  }

  // ----- hành động của người chơi -----
  step() {
    const st = this.st; if (!this.running || st.finished || st.exhausted) return false;
    const now = this.t; st.stepTimes = st.stepTimes.filter((x) => now - x < 1);
    if (st.stepTimes.length >= R.MAX_STEPS_PER_SEC) return false;
    const prevStep = st.lastStep; st.stepTimes.push(now); st.lastStep = now;
    const g = S.gradeAt(this.map, st.target); st.grade = g;
    const cost = R.STAM_PER_STEP * S.slopeMult(g) * (st.boltT > 0 ? R.BOLT_COST_MULT : 1);
    let stride = st.boltT > 0 ? R.BOLT_STRIDE : R.STRIDE; if (st.slowT > 0) stride *= R.BITE_STRIDE_MULT;
    { const gt = now - prevStep, inst = gt > 1.2 ? stride * 0.8 : Math.min(28, stride / Math.max(0.12, gt)); st.rate += (inst - st.rate) * (gt > 1.2 ? 1 : 0.4); }   // tốc độ chạy ước lượng (m/s) để chuyển động liên tục
    st.stam -= cost; st.target += stride; st.steps++; st.meters += stride; this.unsent.steps++; this.unsent.meters += stride; sfx.step(st.boltT > 0);
    if (st.stam <= 0) { st.stam = 0; st.exhausted = true; sfx.tired(); this.say('😮‍💨 Hết thể lực! Dùng đồ ăn hoặc chờ hồi sức', 2200); }
    return true;
  }
  jump() { const st = this.st; if (!this.running || st.finished || st.jumpT > 0 || st.jumpCd > 0) return; st.jumpT = 0.7; st.jumpCd = 0.15; sfx.jump(); }
  moveLane(d) { const st = this.st; if (!this.running || st.finished) return; st.lane = clamp(st.lane + d, 0, S.LANES.COUNT - 1); }
  setMode(m) { this.mode = m; this.st.auto = 0; }
  // giữ nút/phím/màn hình = chạy liên tục ở tốc độ tối đa (4 bước/giây)
  setHold(key, on) { if (on) this.hold.add(key); else this.hold.delete(key); }
  releaseHold() { this.hold.clear(); }
  useItem(i) {
    const slot = this.inv[i]; if (!slot || !this.running || this.st.finished) return;
    this.applyItem(slot.k);
    if (--slot.n <= 0) this.inv.splice(i, 1);
    this.hooks.onInventory && this.hooks.onInventory(this.inv);
  }
  applyItem(k) {
    const it = S.ITEMS[k], st = this.st;
    if (k === 'bolt') { st.boltT = Math.min(st.boltT + R.BOLT_SECS, R.BOLT_SECS * 2); st.boltsUsed++; this.unsent.boltsUsed++; this.float('⚡ Tăng tốc!', '#ffe27a'); sfx.bolt(); }
    else { sfx.eat(); st.stam = Math.min(R.STAM_MAX, st.stam + it.stam); if (it.cure) st.slowT = 0; this.float(`${it.icon} +${it.stam} thể lực`, '#9ef0b0'); if (st.exhausted && st.stam >= R.STAM_RESUME) st.exhausted = false; }
  }
  say(text, ms) { this.hooks.onEvent && this.hooks.onEvent(text, ms); }
  float(text, color = '#fff') {
    const sp = textSprite(text, { color, scaleW: 6, w: 512, h: 96, font: 'bold 52px system-ui' }); sp.material.depthTest = false; sp.renderOrder = 30;
    const P = this.world.posAt(this.st.s), [x, z] = this.world.off(P, this.st.lat); sp.position.set(x, P.y + 4.4, z); this.scene.add(sp); this.floaters.push({ sp, t: 1.3, y: P.y + 4.4 });
  }
  zoom(d) { this.camD = clamp(this.camD * (d < 0 ? 0.8 : 1.3), 14, this.maxD); }
  // xem toàn tuyến (chỉ bản đồ ảnh/GPS): zoom ra vừa khít cả tuyến; bấm lại để về góc chạy
  fitAll() { if (!this.world.bbox) return false; const fit = this.fitD(); if (this.camD > fit * 0.75) this.resetView(); else { this.camD = fit; this.pitchO = 1.35; } return true; }
  fitD() { const b = this.world.bbox, asp = this.camera.aspect || 1; return b ? clamp((b.size * 1.05 + 120) * (asp < 1 ? Math.min(2.2, 1 / asp) : 1), 180, this.maxD) : 180; }
  tilt() { if (this.overview) { this.resetView(); return; } this.focusPitch = this.focusPitch > 1.1 ? 0.8 : this.focusPitch > 0.65 ? 0.5 : 1.3; }

  // ----- logic (cũng chạy khi tab ẩn) -----
  logic() { if (!this.running) return; const now = performance.now(), dt = clamp((now - this.last) / 1000, 0, 5); this.last = now; if (document.hidden) this.advance(dt); }
  advance(dt) {
    const st = this.st; if (st.finished) return;
    this.t += dt; st.time += dt; this.unsent.secs += dt;
    if (st.boltT > 0) st.boltT = Math.max(0, st.boltT - dt);
    if (st.slowT > 0) st.slowT = Math.max(0, st.slowT - dt);
    if (st.jumpCd > 0) st.jumpCd -= dt;
    st.lat += (LX[st.lane] - st.lat) * Math.min(1, dt * 10);
    if (this.t - st.lastStep > 1.2 || st.exhausted) { st.stam = Math.min(R.STAM_MAX, st.stam + R.IDLE_REGEN * dt); if (st.exhausted && st.stam >= R.STAM_RESUME) st.exhausted = false; }
    if (this.hold.size && this.mode !== 'auto' && !st.exhausted && this.t - st.lastStep >= 1 / R.MAX_STEPS_PER_SEC - 0.002) this.step();
    if (this.mode === 'auto' && !st.exhausted) { st.auto += dt; while (st.auto >= 1 / R.AUTO_STEPS_PER_SEC) { st.auto -= 1 / R.AUTO_STEPS_PER_SEC; st.stepTimes = []; this.step(); } }
    // chạy liên tục theo nhịp bước (không dịch từng cục theo từng bước): vận tốc bám theo tốc độ ước lượng + phần quãng đường còn thiếu
    const prev = st.s, gap = st.target - st.s;
    if (this.t - st.lastStep > 0.4) st.rate *= Math.exp(-dt * 3.5);
    const overdue = clamp((this.t - st.lastStep - 0.6) / 0.4, 0, 1);      // quá nhịp bước dự kiến thì dồn nốt phần còn thiếu
    const vDes = 0.95 * st.rate + gap * (0.35 + 2.5 * overdue);
    st.v += (vDes - st.v) * Math.min(1, dt * 8);
    st.s += Math.min(gap, Math.max(0, st.v) * dt); if (st.target - st.s < 0.01) st.s = st.target;
    st.speed += ((st.s - prev) / Math.max(dt, 1e-3) - st.speed) * Math.min(1, dt * 6);
    if (st.jumpT > 0) { st.jumpT = Math.max(0, st.jumpT - dt); if (st.jumpT === 0) sfx.land(); }
    // tự động: nhảy qua chướng ngại nằm trong làn của mình
    const nextObs = this.obst.find((o) => !o.done && o.s >= prev - 0.5 && o.lanes.includes(st.lane));
    if (this.mode === 'auto' && nextObs && nextObs.s - st.s < clamp(st.speed * 0.45, 2.8, 9) && nextObs.s - st.s > 0 && st.jumpT <= 0) st.jumpT = 0.7;
    for (const o of this.obst) if (!o.done && prev < o.s && st.s >= o.s) {
      o.done = true; if (!o.lanes.includes(st.lane)) continue;           // né sang làn khác: không va
      if (st.jumpT > 0.08) { st.jumps++; this.unsent.jumps++; this.float('Nhảy qua! 🦘', '#ffe27a'); }
      else { st.stam = Math.max(0, st.stam - R.HIT_STAM); st.slowT = Math.max(st.slowT, R.HIT_SLOW_SECS); st.shake = 0.3; this.float('Vấp rồi! -10', '#ff9d8a'); sfx.hit(); if (st.stam <= 0) st.exhausted = true; }
    }
    for (const it of this.items) {
      if (it.taken || !(it.lane === st.lane || Math.abs(st.lat - LX[it.lane]) < 1.3) || !(prev < it.s + 1.8 && st.s >= it.s - 1.8)) continue;       // quét cả đoạn vừa đi qua (chạy nhanh/FPS thấp không bị lọt) và chấp nhận khi đã sát làn
      if (it.key === 'coin') { it.taken = true; this.dyn.remove(it.sp); st.items.coin = (st.items.coin || 0) + 1; this.unsent.items.coin = (this.unsent.items.coin || 0) + 1; this.hooks.onCoin && this.hooks.onCoin(1); sfx.coin(); continue; }
      const slot = this.inv.find((x) => x.k === it.key && x.n < R.INV_STACK) || (this.inv.length < R.INV_SLOTS ? (this.inv.push({ k: it.key, n: 0 }), this.inv[this.inv.length - 1]) : null);
      if (!slot) {                               // túi đầy: dùng luôn nếu có ích, không thì để lại trên đường và báo
        if (it.key === 'bolt' || st.stam < R.STAM_MAX - 8 || st.slowT > 0) { it.taken = true; this.dyn.remove(it.sp); st.items[it.key] = (st.items[it.key] || 0) + 1; this.unsent.items[it.key] = (this.unsent.items[it.key] || 0) + 1; sfx.pickup(); this.applyItem(it.key); }
        else if (!it.warned) { it.warned = true; this.float('Túi đầy! 🎒', '#ffb27a'); }
        continue;
      }
      slot.n++; it.taken = true; this.dyn.remove(it.sp); st.items[it.key] = (st.items[it.key] || 0) + 1; this.unsent.items[it.key] = (this.unsent.items[it.key] || 0) + 1;
      sfx.pickup(); this.float(`${S.ITEMS[it.key].icon} ${S.ITEMS[it.key].name}`, '#fff'); this.hooks.onInventory && this.hooks.onInventory(this.inv);
    }
    for (const q of this.squads) if (!q.pass && st.s >= q.s) { q.pass = true; this.emote(q.n); }
    this.bikeLogic(dt, prev);
    this.dogLogic(dt);
    if (st.target >= this.total && st.s >= this.total - 0.05) { st.finished = true; st.s = st.target = this.total; sfx.finish(); this.hold.clear(); this.hooks.onFinish && this.hooks.onFinish(this.summary()); }
  }
  // ----- đội cổ vũ -----
  buildSquad(q) {
    const w = this.world, gy = w.bbox ? 0 : -0.3; q.g = new THREE.Group(); this.dyn.add(q.g); q.built = true;
    for (let i = 0; i < q.n; i++) {
      const role = CHEER_ROLES[(i + q.k) % 5], m = makeCheer(q.k + i, role), P = w.posAt(q.s + (i - (q.n - 1) / 2) * 1.9), [x, z] = w.off(P, q.side * (6.7 + (i % 2) * 1.1));
      m.position.set(x, P.y + gy, z); q.g.add(m);
      const c = { m, x, z, h: P.h, ph: i * 1.3 + q.k, role, y: P.y + gy, bubble: null, say: CHEER_SAY[(q.k * 3 + i * 5) % CHEER_SAY.length] };
      if (role === 'spray') { c.drops = []; for (let k = 0; k < 14; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: '#8fdcff', transparent: true, opacity: 0.85 })); d.visible = false; q.g.add(d); c.drops.push({ d, life: 0, v: [0, 0, 0] }); } c.acc = 0; }
      q.list.push(c);
    }
  }
  destroySquad(q) { for (const c of q.list) if (c.bubble) { c.bubble.material.map.dispose(); c.bubble.material.dispose(); } this.dyn.remove(q.g); q.g = null; q.list = []; q.built = false; }
  cheerUpdate(dt, t, px, pz) {
    const st = this.st;
    for (const q of this.squads) {
      const d = q.s - st.s;
      if (!q.built && d < 130 && d > -35) this.buildSquad(q); else if (q.built && (d < -50 || d > 190)) this.destroySquad(q);
      if (!q.built) continue;
      const ex = clamp(1 - Math.abs(d) / 45, 0, 1);
      for (const [i, c] of q.list.entries()) {
        const base = -c.h + (q.side > 0 ? Math.PI / 2 : -Math.PI / 2), face = -Math.atan2(pz - c.z, px - c.x);        // ban đầu quay mặt ra đường, rồi quay theo nhìn vận động viên
        let diff = Math.atan2(Math.sin(face - base), Math.cos(face - base)); diff = clamp(diff, -2.0, 2.0);
        let cur = Math.atan2(Math.sin(c.m.rotation.y - base), Math.cos(c.m.rotation.y - base)); cur += (diff - cur) * Math.min(1, dt * 6); c.m.rotation.y = base + cur;
        animateCheer(c.m, t, c.ph, ex);
        if (ex > 0.2 && i % 2 === 0 && !c.bubble) { c.bubble = textSprite(c.say, { color: '#fff', bg: '#e8408fdd', scaleW: 3.0, w: 320, h: 96, font: 'bold 50px system-ui, sans-serif' }); c.bubble.position.set(0, 3.7, 0); c.bubble.material.depthTest = false; c.bubble.renderOrder = 26; c.m.add(c.bubble); c.bt = 0; }
        if (c.bubble) { c.bt += dt; const sc = Math.min(1, c.bt * 4) * (1 + Math.sin(t * 8 + i) * 0.04); c.bubble.scale.set(3.0 * sc / 1.2, 3.0 * sc * 0.3 / 1.2, 1); c.bubble.visible = ex > 0.05; }
        if (c.drops && Math.abs(d) < 70) {                                                                               // phun nước về phía đường
          const lx = -Math.sin(c.h) * -q.side, lz = Math.cos(c.h) * -q.side; c.acc += dt * 26;
          while (c.acc >= 1) { c.acc -= 1; const p = c.drops.find((o) => o.life <= 0); if (!p) break; p.life = 0.9; const sp = 4 + Math.random() * 2.5; p.v = [lx * sp + (Math.random() - 0.5), 3.6 + Math.random() * 2, lz * sp + (Math.random() - 0.5)]; p.d.position.set(c.x + lx * 0.7, c.y + 2.2 + Math.abs(Math.sin(t * 5 + c.ph)) * 0.2, c.z + lz * 0.7); p.d.visible = true; }
        }
        if (c.drops) for (const p of c.drops) if (p.life > 0) { p.life -= dt; p.v[1] -= 9 * dt; p.d.position.x += p.v[0] * dt; p.d.position.y += p.v[1] * dt; p.d.position.z += p.v[2] * dt; p.d.material.opacity = clamp(p.life * 1.5, 0, 0.85); if (p.life <= 0 || p.d.position.y < c.y) { p.life = 0; p.d.visible = false; } }
      }
    }
  }
  emote(n) {                                                           // cảm xúc hiện trên đầu nhân vật khi chạy qua đội cổ vũ
    const pool = n >= 4 ? [['🤩', 'Hưng phấn!'], ['🔥', 'Bốc lửa!'], ['😆', 'Phấn khích!']] : n >= 2 ? [['😄', 'Vui vẻ!'], ['🥰', 'Hạnh phúc!'], ['😍', 'Thích quá!']] : [['😊', 'Vui vẻ!'], ['😘', 'Ngại quá!']];
    const [ch, label] = pool[Math.floor(Math.random() * pool.length)], bonus = Math.min(8, 2 + n);
    this.clearEmote();
    const sp = emojiSprite(ch, 2.1), lb = textSprite(`${label} +${bonus}`, { color: '#fff3b0', scaleW: 3.6, w: 420, h: 96, font: 'bold 54px system-ui, sans-serif' });
    for (const o of [sp, lb]) { o.material.depthTest = false; o.renderOrder = 28; this.me.group.add(o); }
    this.emo = { sp, lb, t: 2.8, life: 2.8 }; this.st.stam = Math.min(R.STAM_MAX, this.st.stam + bonus); if (this.st.exhausted && this.st.stam >= R.STAM_RESUME) this.st.exhausted = false;
    sfx.cheer();
  }
  clearEmote() { const e = this.emo; if (!e) return; this.me.group.remove(e.sp, e.lb); e.lb.material.map.dispose(); e.lb.material.dispose(); this.emo = null; if (this.me.arrow) this.me.arrow.visible = true; }
  bikeLogic(dt, prevS) {
    const st = this.st;
    while (this.bikeIdx < this.bikeEvents.length && st.s >= this.bikeEvents[this.bikeIdx].s) {         // xe máy xuất hiện cách người chơi ~170 m, chạy ngược về phía bạn
      const e = this.bikeEvents[this.bikeIdx++], m = bikeMesh(e.hue); m.visible = true; this.dyn.add(m);
      this.bikes.push({ m, s: st.s + 170, ps: st.s + 170, lane: e.lane, v: e.v, done: false, near: false }); sfx.honk(); this.float('Xe máy ngược chiều! 🏍️', '#ffd27a');
    }
    for (const b of this.bikes) {
      b.ps = b.s; b.s -= b.v * dt;
      if (this.mode === 'auto' && !b.done && b.lane === st.lane && b.s > st.s) {                                       // tự động: tránh sang làn trống khi xe sắp tới
        const ttc = (b.s - st.s) / Math.max(1, st.speed + b.v);
        if (ttc < 1.7) { const cands = [st.lane - 1, st.lane + 1].filter((l) => l >= 0 && l < S.LANES.COUNT && !this.bikes.some((o) => !o.done && o !== b && o.lane === l && Math.abs(o.s - st.s) < 60)); if (cands.length) this.moveLane(cands[Math.floor(Math.random() * cands.length)] - st.lane); }
      }
      if (!b.done && b.ps - prevS > 0 && b.s - st.s <= 0) {                                                            // hai bên vừa đi qua nhau
        b.done = true; const dl = Math.abs(st.lat - LX[b.lane]);
        if (dl < 1.5) { st.stam = Math.max(0, st.stam - 15); st.slowT = Math.max(st.slowT, 1.5); st.shake = 0.5; this.float('Đụng xe máy! -15', '#ff7a6a'); sfx.hit(); if (st.stam <= 0) st.exhausted = true; }
        else if (dl < 3.8) { this.float('Suýt va! 😅', '#ffe27a'); sfx.swoosh(); }
      }
    }
    this.bikes = this.bikes.filter((b) => { if (b.s < st.s - 60) { this.dyn.remove(b.m); return false; } return true; });
  }
  dogLogic(dt) {
    const st = this.st;
    if (!this.dog && this.dogIdx < this.dogEvents.length && st.s >= this.dogEvents[this.dogIdx]) {
      this.dogIdx++; const m = dogMesh(); this.dyn.add(m); m.visible = false;
      this.dog = { phase: 'warn', t: R.DOG_WARN_SECS, s: 0, lat: st.lat, m }; sfx.warn(); sfx.bark(); this.say('🐕 Gâu gâu! Chó đuổi — dùng ⚡ hoặc chạy nhanh hơn!', 2600); this.float('Gâu! 🐕', '#ffb27a');
    }
    const d = this.dog; if (!d) return; d.t -= dt;
    if (d.phase === 'warn' && d.t <= 0) { d.phase = 'chase'; d.t = R.DOG_SECS; d.s = st.s - R.DOG_START_GAP; d.m.visible = true; d.bark = 1.6; sfx.bark(); }
    else if (d.phase === 'chase') {
      d.s += R.DOG_SPEED * dt; d.lat += (st.lat - d.lat) * Math.min(1, dt * 3);
      if ((d.bark -= dt) <= 0) { d.bark = 1.8; sfx.bark(); }
      d.cool = (d.cool || 0) - dt;
      if (st.s - d.s <= 0.9 && d.cool <= 0) { st.stam = Math.max(0, st.stam - R.BITE_STAM); st.slowT = R.BITE_SLOW_SECS; st.bites++; this.unsent.bites++; st.shake = 0.5; this.float(`Bị cắn! -${R.BITE_STAM}`, '#ff7a6a'); sfx.bite(); if (st.stam <= 0) st.exhausted = true; d.cool = 3.5; d.s = st.s - R.DOG_START_GAP * 0.8; d.bitten = true; }   // cắn xong lùi lại rồi lại đuổi tiếp tới hết giờ
      else if (d.t <= 0) { d.phase = 'leave'; d.t = 2; this.float(d.bitten ? 'Chó bỏ cuộc 😮‍💨' : 'Thoát chó rồi 😅', '#9ef0b0'); }
    } else if (d.phase === 'leave') { d.lat += (d.lat < 0 ? -1 : 1) * 6 * dt; d.s += 2 * dt; if (d.t <= 0) { this.dyn.remove(d.m); this.dog = null; return; } }
    if (d.m.visible) { const P = this.world.posAt(d.s), [x, z] = this.world.off(P, d.lat); d.m.position.set(x, P.y, z); d.m.rotation.y = -P.h - (d.phase === 'leave' ? 1.2 : 0); }
  }
  summary() { const st = this.st; return { time: st.time, steps: st.steps, meters: st.meters, jumps: st.jumps, bites: st.bites, items: { ...st.items }, map: this.map, dist: this.total }; }
  takeDelta() { const d = this.unsent; this.unsent = { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} }; d.secs = Math.round(d.secs); return d; }

  // ----- người chơi khác -----
  setOthers(list) { for (const p of list) this.addOther(p); }
  addOther(p) {
    if (this.others.has(p.id)) return;
    const actor = makeRunner(p, false); this.scene.add(actor.group);
    this.others.set(p.id, { actor, s: p.s || 0, ts: p.s || 0, j: 0, mv: 0, lane: p.l ?? (p.id % 4), lat: LX[p.l ?? (p.id % 4)] });
  }
  removeOther(id) { const o = this.others.get(id); if (o) { this.scene.remove(o.actor.group); this.others.delete(id); } }
  snap(arr) { for (const [id, s, j, mv, l] of arr) { const o = this.others.get(id); if (o) { o.ts = s; o.j = j; o.mv = mv; o.lane = l ?? o.lane; } } }
  count() { return this.others.size + 1; }

  // ----- vẽ -----
  loop(now) {
    this.raf = requestAnimationFrame(this.loop); if (!this.running) return;
    const dt = clamp(((now - this.rl) || 16) / 1000, 0, 0.1); this.rl = now;
    if (this.st.finished) { this.fin = (this.fin || 0) + dt; if (this.fin > 1.2) return; } else this.fin = 0;      // về đích: dừng vẽ sau 1,2 giây để nhường máy cho bảng thống kê
    if (!document.hidden) this.advance(dt);
    this.render(dt);
    if (!document.hidden && ++this.fc > 90) {          // bỏ 90 khung đầu (biên dịch shader), sau đó tự giảm/tăng độ nét để giữ FPS mượt
      this.ft = this.ft * 0.96 + Math.min(100, (now - (this.lastNow || now))) * 0.04;
      if (this.fc % 60 === 0) {
        let pr = this.pr; if (this.ft > 24 && pr > 0.6) pr = Math.max(0.6, pr - 0.2); else if (this.ft < 15 && pr < this.maxPR) pr = Math.min(this.maxPR, pr + 0.1);
        if (pr !== this.pr) { this.pr = pr; this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth, innerHeight, false); }
      }
    }
    this.lastNow = now;
  }
  render(dt) {
    const st = this.st, w = this.world, t = this.t;
    const P = w.posAt(st.s), [mx, mz] = w.off(P, st.lat), jh = st.jumpT > 0 ? Math.sin((1 - st.jumpT / 0.7) * Math.PI) * 1.7 : 0;
    this.me.group.position.set(mx, P.y, mz); this.me.group.rotation.y = -P.h; this.me.animate(dt, Math.min(20, st.speed), jh, t);
    for (const o of this.others.values()) {
      o.s += (o.ts - o.s) * Math.min(1, dt * 6); o.lat += (LX[o.lane] - o.lat) * Math.min(1, dt * 8);
      const Q = w.posAt(o.s), [x, z] = w.off(Q, o.lat); o.actor.group.position.set(x, Q.y, z); o.actor.group.rotation.y = -Q.h; o.actor.animate(dt, o.mv ? 4 : 0, o.j ? 1 : 0, t);
    }
    for (const f of this.floaters) { f.t -= dt; f.sp.position.y = f.y + (1.3 - f.t) * 1.6; f.sp.material.opacity = clamp(f.t, 0, 1); }
    this.floaters = this.floaters.filter((f) => { if (f.t <= 0) this.scene.remove(f.sp); return f.t > 0; });
    for (const it of this.items) if (!it.taken) it.sp.position.y = it.y + Math.sin(t * 3 + it.s) * 0.2;
    this.cheerUpdate(dt, t, mx, mz);
    if (this.emo) { const e = this.emo; e.t -= dt; const k = 1 - e.t / e.life, pop = k < 0.12 ? k / 0.12 * 1.25 : k < 0.25 ? 1.25 - (k - 0.12) / 0.13 * 0.25 : 1, fade = clamp(e.t / 0.6, 0, 1);
      const zf = clamp(this.camD / 34, 0.55, 2.6);       // giữ kích thước trên màn hình ổn định khi zoom
      e.sp.scale.setScalar(1.6 * zf * pop * (1 + Math.sin(t * 9) * 0.05)); e.sp.position.set(0, 4.3 + 0.5 * zf + Math.sin(t * 6) * 0.1, 0); e.sp.material.opacity = fade;
      e.lb.scale.set(2.9 * zf * pop, 2.9 * zf * pop * 96 / 420, 1); e.lb.position.set(0, 3.9 + 0.2 * zf, 0); e.lb.material.opacity = fade; if (this.me.arrow) this.me.arrow.visible = false; if (e.t <= 0) this.clearEmote(); }
    for (const b of this.bikes) { const Q = w.posAt(b.s), [x, z] = w.off(Q, LX[b.lane]); b.m.position.set(x, Q.y, z); b.m.rotation.y = -Q.h + Math.PI; for (const wh of b.m.userData.wheels) wh.rotation.z -= b.v * dt / 0.38; b.m.rotation.z = Math.sin(t * 9 + b.s) * 0.02; }
    if (this.dog && this.dog.m.visible) dogAnimate(this.dog.m, t, this.dog.phase === 'leave' ? 0.55 : 1);
    if (st.shake > 0) st.shake -= dt;
    // camera: zoom in -> bám đường (hướng theo đường); zoom out -> toàn cảnh, xoay tự do quanh người chơi
    const ov = this.overview, look = w.posAt(st.s + (ov ? 0 : 6));
    let dh = look.h - this.camHead; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.camHead += dh * Math.min(1, dt * 3);
    this.yawCur += ((ov ? this.yaw : 0) - this.yawCur) * Math.min(1, dt * 5); if (!ov) this.yaw = this.yawCur;
    this.pitchCur += ((ov ? this.pitchO : this.focusPitch) - this.pitchCur) * Math.min(1, dt * 4);
    const H = this.camHead + this.yawCur, back = this.camD * Math.cos(this.pitchCur), up = this.camD * Math.sin(this.pitchCur), sx = st.shake > 0 ? (Math.random() - 0.5) * 0.4 : 0;
    let tx = ov ? mx : look.x, tz = ov ? mz : look.z; const ty = look.y;
    if (w.bbox && ov) { const fd = this.fitD(), k = clamp((this.camD - 120) / Math.max(1, fd * 0.8 - 120), 0, 1); tx += (w.bbox.cx - tx) * k; tz += (w.bbox.cz - tz) * k; }   // zoom ra xa thì dần nhìn vào tâm cả tuyến
    if (w.setOverview) w.setOverview(this.camD > 130, mx, mz);
    this.camera.position.set(tx - Math.cos(H) * back + sx, ty + up, tz - Math.sin(H) * back); this.camera.lookAt(tx, ty, tz);
    if (this.scene.fog) { this.scene.fog.near = this.camD * 1.6; this.scene.fog.far = this.camD * 7 + 160; }
    w.update(P.x, P.z, this.camD * 1.5); this.renderer.render(this.scene, this.camera);
    this.hudT += dt; if (this.hudT > 0.1) { this.hudT = 0; this.hud(); }
  }
  hud() {
    const st = this.st; if (!st || !this.hooks.onHud) return; const kmh = st.speed * 3.6;
    this.hooks.onHud({ s: st.s, dist: this.total, stam: st.stam, exhausted: st.exhausted, kmh, pace: kmh > 0.5 ? 60 / kmh : 0, steps: st.steps, time: st.time, lane: st.lane, overview: this.overview,
      grade: S.gradeAt(this.map, st.s), elev: S.elevAt(this.map, st.s), boltT: st.boltT, slowT: st.slowT, mode: this.mode, dog: this.dog ? this.dog.phase : null, online: this.count(), finished: st.finished });
  }
}
