// Engine game: nhân vật chibi + trang bị, 4 làn, camera zoom in/zoom out xoay 360°, thể lực/vật phẩm/chướng ngại/chó đuổi.
import * as THREE from 'three';
import { buildWorld, textSprite } from './world.js';
import { buildGpsWorld } from './gpsworld.js';
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
function addAcc(body, g, id) {
  const col = itemColor('acc', id); if (!col) return;
  if (id === 'glasses') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.62), L(col)); m.position.set(0.5, 1.84, 0); body.add(m); }
  else if (id === 'scarf') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 6, 16).rotateX(Math.PI / 2), L(col)); t.position.y = 1.36; body.add(t); const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.2), L(col)); tail.position.set(-0.45, 1.1, 0.15); body.add(tail); }
  else if (id === 'backpack') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.75, 0.62), L(col)); m.position.set(-0.6, 0.95, 0); body.add(m); }
  else if (id === 'cape') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 1.0), L(col, { side: THREE.DoubleSide })); m.position.set(-0.66, 0.95, 0); m.rotation.z = 0.12; body.add(m); g.userData.cape = m; }
}
export function makeRunner(info, me) {
  const eq = { ...S.SHOP_DEFAULT, ...(info.equip || {}) };
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const T = S.TIERS[info.tier || 0];
  const b = new THREE.Mesh(bellGeo, L(me ? '#e0a43a' : hueColor(info.id || 1))); body.add(b);
  const sash = new THREE.Mesh(sashGeo, L('#f2c230')); sash.position.y = 0.72; body.add(sash);
  const skin = L('#f0bf98'), head = new THREE.Mesh(headGeo, skin); head.position.y = 1.82; body.add(head);
  const hair = new THREE.Mesh(hairGeo, L(['#2a2220', '#4a3020', '#1d1d24', '#6a4a2a'][(info.id || 0) % 4])); hair.position.y = 1.86; body.add(hair);
  for (const z of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#222' })); e.position.set(0.48, 1.8, z); body.add(e); }
  const hp = new THREE.Group(); hp.position.y = 1.82; body.add(hp); addHat(hp, eq.hat);
  addAcc(body, g, eq.acc);
  const arms = [-1, 1].map((sd) => { const a = new THREE.Mesh(limbGeo, skin); a.position.set(0, 0.85, sd * 0.7); body.add(a); return a; });
  const wc = itemColor('watch', eq.watch);
  if (wc) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.26), eq.watch === 'watch_smart' ? new THREE.MeshBasicMaterial({ color: wc }) : L(wc)); w.position.set(0, -0.1, 0); arms[1].add(w); }
  const shoeCol = itemColor('shoes', eq.shoes) || '#3a2d26';
  const feet = [-1, 1].map((sd) => { const f = new THREE.Mesh(footGeo, L(shoeCol)); f.position.set(0, 0.12, sd * 0.28); g.add(f);
    if (eq.shoes === 'shoe_wing') { const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), L('#fff')); w.position.set(-0.18, 0.12, sd * 0.2); w.rotation.z = 0.5; f.add(w); } return f; });
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
  return { group: g, body, arms, feet, halo, arrow, sparks, rainbow: eq.aura === 'aura_rainbow', phase: 0,
    animate(dt, speed, jumpH, t) {
      this.phase += dt * (3 + speed * 1.6);
      const sw = speed > 0.3 ? Math.sin(this.phase) : 0, amp = clamp(speed / 4, 0, 1);
      this.feet[0].position.x = sw * 0.4 * amp; this.feet[1].position.x = -sw * 0.4 * amp;
      this.feet[0].position.y = 0.12 + Math.max(0, Math.cos(this.phase)) * 0.18 * amp + jumpH; this.feet[1].position.y = 0.12 + Math.max(0, -Math.cos(this.phase)) * 0.18 * amp + jumpH;
      this.arms[0].position.x = -sw * 0.35 * amp; this.arms[1].position.x = sw * 0.35 * amp;
      this.body.position.y = jumpH + Math.abs(Math.sin(this.phase)) * 0.12 * amp; this.body.rotation.z = -0.1 * amp;
      const cape = this.group.userData.cape; if (cape) cape.rotation.z = 0.12 + 0.25 * amp + Math.sin(t * 8) * 0.05 * amp;
      this.halo.material.opacity = 0.6 + Math.sin(t * 3 + this.phase * 0.1) * 0.2; this.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05);
      if (this.rainbow) this.halo.material.color.setHSL((t * 0.3) % 1, 0.9, 0.6);
      this.sparks.forEach((m, i) => { const a = t * 1.6 + i * 6.28 / this.sparks.length; m.position.set(Math.cos(a) * 1.25, 0.4 + ((t * 0.8 + i * 0.37) % 1) * 2.2, Math.sin(a) * 1.25); if (this.rainbow) m.material.color.setHSL((t * 0.3 + i / 7) % 1, 0.9, 0.6); });
      if (this.arrow) this.arrow.position.y = 3.3 + Math.sin(t * 4) * 0.18 + jumpH;
    } };
}

// ---------- hình vật phẩm / chướng ngại ----------
const emojiTex = {};
function emojiSprite(ch, size = 2.2) {
  if (!emojiTex[ch]) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70); emojiTex[ch] = new THREE.CanvasTexture(cv); emojiTex[ch].colorSpace = THREE.SRGBColorSpace; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex[ch], transparent: true, depthWrite: false })); sp.scale.set(size, size, 1); sp.renderOrder = 6; return sp;   // vẽ sau lớp đường bán trong suốt của chế độ bản đồ
}
function obstacleMesh(kind) {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  if (kind === 'rock') { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), M('#8d8a84')); m.scale.set(1.2, 0.85, 1.1); m.position.y = 0.6; g.add(m); }
  else if (kind === 'puddle') { const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#58a9d8' })); m.scale.set(1, 1, 1.7); m.position.y = 0.06; g.add(m); }
  else if (kind === 'cone') { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 10), M('#ff7a1a')); m.position.y = 0.65; g.add(m); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.25, 10), M('#fff')); b.position.y = 0.6; g.add(b); }
  else if (kind === 'crate') { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), M('#b98a4f')); m.position.y = 0.6; g.add(m); }
  else if (kind === 'log') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.6, 8).rotateX(Math.PI / 2), M('#7a5233')); m.position.y = 0.4; g.add(m); }
  else { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.1), M('#6c747c')); b.position.y = 1.0; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), M('#7b848c')); h.position.set(1.4, 1.2, 0); g.add(h); for (const z of [-0.5, 0.5]) { const hn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), M('#e8e1cf')); hn.position.set(1.7, 1.75, z); hn.rotation.z = -0.5; g.add(hn); } for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), M('#4a5258')); l.position.set(x, 0.35, z); g.add(l); } }
  return g;
}
const OBST = { hanoi: ['cone', 'crate', 'puddle', 'log'], saigon: ['cone', 'crate', 'puddle'], danang: ['cone', 'puddle', 'rock'], halong: ['rock', 'puddle', 'cone'],
  trangan: ['buffalo', 'rock', 'puddle'], mocchau: ['rock', 'puddle', 'buffalo', 'log'], haivan: ['rock', 'rock', 'puddle', 'cone'], prenn: ['rock', 'log', 'puddle'],
  oquyho: ['rock', 'puddle', 'buffalo'], mapileng: ['rock', 'rock', 'cone'], gps: ['cone', 'crate', 'puddle', 'rock', 'log'] };
const OBST_H = { rock: 1.0, puddle: 0.1, cone: 1.0, crate: 1.1, log: 0.8, buffalo: 1.4 }, OBST_W = { puddle: 2, log: 2 };
function dogMesh() {
  const g = new THREE.Group(), M = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.7), M('#b9824a')); body.position.y = 0.7; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.6, 0.6), M('#c99057')); head.position.set(0.95, 1.0, 0); g.add(head);
  for (const z of [-0.22, 0.22]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.14), M('#6b3f1d')); e.position.set(0.9, 1.4, z); g.add(e); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.14), M('#b9824a')); tail.position.set(-1.0, 1.0, 0); tail.rotation.z = 0.6; g.add(tail);
  const legs = []; for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), M('#a06a38')); l.position.set(x, 0.25, z); g.add(l); legs.push(l); }
  g.scale.setScalar(1.3); g.userData.legs = legs; return g;
}

// ---------- Game ----------
export class Game {
  constructor(canvas, hooks, cfg = {}) {
    this.hooks = hooks; this.canvas = canvas; this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2500);
    this.scene.add(new THREE.HemisphereLight('#fff3dc', '#8a7a62', 1.0));
    const sun = new THREE.DirectionalLight('#fff1d2', 1.1); sun.position.set(40, 80, 30); this.scene.add(sun);
    // camera: zoom in = bám đường chạy; zoom out = toàn cảnh, kéo để xoay 360°
    this.camD = 34; this.focusPitch = 0.8; this.pitchCur = 0.8; this.pitchO = 1.0; this.yaw = 0; this.yawCur = 0; this.camHead = 0;
    this.running = false; this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.others = new Map(); this.floaters = []; this.t = 0; this.last = 0; this.hudT = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this); this.ticker = setInterval(() => this.logic(), 100);
    this.bindPointer();
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  get overview() { return this.camD > 60; }
  bindPointer() {
    const el = this.canvas, pts = new Map(); let pinch = 0, drag = null, swipe = null;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = [e.clientX, e.clientY]; swipe = [e.clientX, e.clientY, performance.now()]; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.camD = clamp(this.camD * pinch / d, 14, 180); pinch = d; return; }
      if (this.overview) this.orbit(e.clientX - prev[0], e.clientY - prev[1]);
    });
    const up = (e) => {
      if (swipe && pts.size === 1 && !this.overview && this.running) {          // vuốt ngang để đổi làn khi đang zoom in
        const dx = e.clientX - swipe[0], dy = e.clientY - swipe[1];
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - swipe[2] < 600) this.moveLane(dx > 0 ? 1 : -1);
      }
      pts.delete(e.pointerId); pinch = 0; swipe = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.camD = clamp(this.camD * (e.deltaY > 0 ? 1.1 : 0.9), 14, 180); }, { passive: false });
  }
  orbit(dx, dy) { this.yaw += dx * 0.008; this.pitchO = clamp(this.pitchO - dy * 0.006, 0.35, 1.45); }
  resetView() { this.camD = 34; this.yaw = 0; this.pitchO = 1.0; }

  load(course, dist, mode, profile, seed = Math.floor(Math.random() * 1e9), view = '3d') {
    this.dispose(); this.map = course; this.total = Math.min(dist, course.km * 1000);
    // vệ tinh / bản đồ 2D cho bản đồ có tuyến thật: trải ảnh bản đồ dưới đường chạy (mặt phẳng, độ dốc vẫn tính theo dữ liệu độ cao)
    const imagery = course.kind !== 'gps' && course.route && (view === 'sat' || view === 'road');
    this.world = course.kind === 'gps' ? buildGpsWorld(course, this.scene, this.cfg) : imagery ? buildGpsWorld({ pts: course.route.pts, style: view }, this.scene, this.cfg) : buildWorld(course, this.scene);
    this.view = course.kind === 'gps' ? course.style : imagery ? view : '3d';
    this.scene.background = C(this.world.theme.bg); this.scene.fog = new THREE.Fog(this.world.theme.bg, 70, 190);
    this.world.setFinish(this.total);
    this.profile = profile; this.mode = mode; this.seed = seed;
    const rng = mulberry(seed);
    this.st = { s: 0, target: 0, lane: 1, lat: LX[1], stam: R.STAM_MAX, exhausted: false, slowT: 0, boltT: 0, jumpT: 0, jumpCd: 0, auto: 0, stepTimes: [], lastStep: -9,
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
    for (let s = 55; s < this.total - 20; s += 38 + rng() * 60) {      // hàng xu ở một làn
      const lane = Math.floor(rng() * 4), n = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) if (!hasObst(s + i * 2.4, lane)) addItem(s + i * 2.4, lane, 'coin', emojiSprite(S.COIN.ICON, 1.4), 1.0);
    }
    this.items.sort((a, b) => a.s - b.s);
    this.dogEvents = []; for (let s = 260 + rng() * 300; s < this.total - 120; s += 420 + rng() * 600) this.dogEvents.push(s);
    this.dogIdx = 0; this.dog = null;
    this.me = makeRunner({ id: 0, name: profile.name, km: profile.totals.totalKm, tier: profile.tier, equip: profile.equip }, true); this.scene.add(this.me.group);
    this.running = true; this.last = performance.now(); this.camHead = this.world.posAt(0).h; this.camD = 34; this.yaw = this.yawCur = 0; this.pitchO = 1.0; this.pitchCur = this.focusPitch; this.hud(true);
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.raf);
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
    st.stepTimes.push(now); st.lastStep = now;
    const g = S.gradeAt(this.map, st.target); st.grade = g;
    const cost = R.STAM_PER_STEP * S.slopeMult(g) * (st.boltT > 0 ? R.BOLT_COST_MULT : 1);
    let stride = st.boltT > 0 ? R.BOLT_STRIDE : R.STRIDE; if (st.slowT > 0) stride *= R.BITE_STRIDE_MULT;
    st.stam -= cost; st.target += stride; st.steps++; st.meters += stride; this.unsent.steps++; this.unsent.meters += stride;
    if (st.stam <= 0) { st.stam = 0; st.exhausted = true; this.say('😮‍💨 Hết thể lực! Dùng đồ ăn hoặc chờ hồi sức', 2200); }
    return true;
  }
  jump() { const st = this.st; if (!this.running || st.finished || st.jumpT > 0 || st.jumpCd > 0) return; st.jumpT = 0.7; st.jumpCd = 0.15; }
  moveLane(d) { const st = this.st; if (!this.running || st.finished) return; st.lane = clamp(st.lane + d, 0, S.LANES.COUNT - 1); }
  setMode(m) { this.mode = m; this.st.auto = 0; }
  useItem(i) {
    const slot = this.inv[i]; if (!slot || !this.running || this.st.finished) return;
    const it = S.ITEMS[slot.k], st = this.st;
    if (slot.k === 'bolt') { st.boltT = Math.min(st.boltT + R.BOLT_SECS, R.BOLT_SECS * 2); st.boltsUsed++; this.unsent.boltsUsed++; this.float('⚡ Tăng tốc!', '#ffe27a'); }
    else { st.stam = Math.min(R.STAM_MAX, st.stam + it.stam); if (it.cure) st.slowT = 0; this.float(`${it.icon} +${it.stam} thể lực`, '#9ef0b0'); if (st.exhausted && st.stam >= R.STAM_RESUME) st.exhausted = false; }
    if (--slot.n <= 0) this.inv.splice(i, 1);
    this.hooks.onInventory && this.hooks.onInventory(this.inv);
  }
  say(text, ms) { this.hooks.onEvent && this.hooks.onEvent(text, ms); }
  float(text, color = '#fff') {
    const sp = textSprite(text, { color, scaleW: 6, w: 512, h: 96, font: 'bold 52px system-ui' }); sp.material.depthTest = false; sp.renderOrder = 30;
    const P = this.world.posAt(this.st.s), [x, z] = this.world.off(P, this.st.lat); sp.position.set(x, P.y + 4.4, z); this.scene.add(sp); this.floaters.push({ sp, t: 1.3, y: P.y + 4.4 });
  }
  zoom(d) { this.camD = clamp(this.camD * (d < 0 ? 0.8 : 1.25), 14, 180); }
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
    if (this.mode === 'auto' && !st.exhausted) { st.auto += dt; while (st.auto >= 1 / R.AUTO_STEPS_PER_SEC) { st.auto -= 1 / R.AUTO_STEPS_PER_SEC; st.stepTimes = []; this.step(); } }
    const prev = st.s; st.s += (st.target - st.s) * Math.min(1, dt * 8); if (st.target - st.s < 0.01) st.s = st.target;
    st.speed += ((st.s - prev) / Math.max(dt, 1e-3) - st.speed) * Math.min(1, dt * 6);
    if (st.jumpT > 0) st.jumpT = Math.max(0, st.jumpT - dt);
    // tự động: nhảy qua chướng ngại nằm trong làn của mình
    const nextObs = this.obst.find((o) => !o.done && o.s >= prev - 0.5 && o.lanes.includes(st.lane));
    if (this.mode === 'auto' && nextObs && nextObs.s - st.s < 2.8 && nextObs.s - st.s > 0 && st.jumpT <= 0) st.jumpT = 0.7;
    for (const o of this.obst) if (!o.done && prev < o.s && st.s >= o.s) {
      o.done = true; if (!o.lanes.includes(st.lane)) continue;           // né sang làn khác: không va
      if (st.jumpT > 0.08) { st.jumps++; this.unsent.jumps++; this.float('Nhảy qua! 🦘', '#ffe27a'); }
      else { st.stam = Math.max(0, st.stam - R.HIT_STAM); st.slowT = Math.max(st.slowT, R.HIT_SLOW_SECS); st.shake = 0.3; this.float('Vấp rồi! -10', '#ff9d8a'); if (st.stam <= 0) st.exhausted = true; }
    }
    for (const it of this.items) {
      if (it.taken || it.lane !== st.lane || !(prev < it.s + 1.2 && st.s >= it.s - 1.2)) continue;
      if (it.key === 'coin') { it.taken = true; this.dyn.remove(it.sp); st.items.coin = (st.items.coin || 0) + 1; this.unsent.items.coin = (this.unsent.items.coin || 0) + 1; this.hooks.onCoin && this.hooks.onCoin(1); continue; }
      const slot = this.inv.find((x) => x.k === it.key && x.n < R.INV_STACK) || (this.inv.length < R.INV_SLOTS ? (this.inv.push({ k: it.key, n: 0 }), this.inv[this.inv.length - 1]) : null);
      if (!slot) continue;
      slot.n++; it.taken = true; this.dyn.remove(it.sp); st.items[it.key] = (st.items[it.key] || 0) + 1; this.unsent.items[it.key] = (this.unsent.items[it.key] || 0) + 1;
      this.float(`${S.ITEMS[it.key].icon} ${S.ITEMS[it.key].name}`, '#fff'); this.hooks.onInventory && this.hooks.onInventory(this.inv);
    }
    this.dogLogic(dt);
    if (st.target >= this.total && st.s >= this.total - 0.05) { st.finished = true; st.s = st.target = this.total; this.hooks.onFinish && this.hooks.onFinish(this.summary()); }
  }
  dogLogic(dt) {
    const st = this.st;
    if (!this.dog && this.dogIdx < this.dogEvents.length && st.s >= this.dogEvents[this.dogIdx]) {
      this.dogIdx++; const m = dogMesh(); this.dyn.add(m); m.visible = false;
      this.dog = { phase: 'warn', t: R.DOG_WARN_SECS, s: 0, lat: st.lat, m }; this.say('🐕 Gâu gâu! Chó đuổi — dùng ⚡ hoặc chạy nhanh hơn!', 2600); this.float('Gâu! 🐕', '#ffb27a');
    }
    const d = this.dog; if (!d) return; d.t -= dt;
    if (d.phase === 'warn' && d.t <= 0) { d.phase = 'chase'; d.t = R.DOG_SECS; d.s = st.s - R.DOG_START_GAP; d.m.visible = true; }
    else if (d.phase === 'chase') {
      d.s += R.DOG_SPEED * dt; d.lat += (st.lat - d.lat) * Math.min(1, dt * 3);
      if (st.s - d.s <= 0.9) { st.stam = Math.max(0, st.stam - R.BITE_STAM); st.slowT = R.BITE_SLOW_SECS; st.bites++; this.unsent.bites++; st.shake = 0.5; this.float(`Bị cắn! -${R.BITE_STAM}`, '#ff7a6a'); if (st.stam <= 0) st.exhausted = true; d.phase = 'leave'; d.t = 2; }
      else if (d.t <= 0) { d.phase = 'leave'; d.t = 2; this.float('Thoát chó rồi 😅', '#9ef0b0'); }
    } else if (d.phase === 'leave') { d.lat += (d.lat < 0 ? -1 : 1) * 6 * dt; d.s += 2 * dt; if (d.t <= 0) { this.dyn.remove(d.m); this.dog = null; return; } }
    if (d.m.visible) { const P = this.world.posAt(d.s), [x, z] = this.world.off(P, d.lat); d.m.position.set(x, P.y + Math.abs(Math.sin(this.t * 14)) * 0.25, z); d.m.rotation.y = -P.h - (d.phase === 'leave' ? 1.2 : 0); }
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
    if (!document.hidden) this.advance(dt);
    this.render(dt);
  }
  render(dt) {
    const st = this.st, w = this.world, t = this.t;
    const P = w.posAt(st.s), [mx, mz] = w.off(P, st.lat), jh = st.jumpT > 0 ? Math.sin((1 - st.jumpT / 0.7) * Math.PI) * 1.7 : 0;
    this.me.group.position.set(mx, P.y, mz); this.me.group.rotation.y = -P.h; this.me.animate(dt, Math.min(8, st.speed), jh, t);
    for (const o of this.others.values()) {
      o.s += (o.ts - o.s) * Math.min(1, dt * 6); o.lat += (LX[o.lane] - o.lat) * Math.min(1, dt * 8);
      const Q = w.posAt(o.s), [x, z] = w.off(Q, o.lat); o.actor.group.position.set(x, Q.y, z); o.actor.group.rotation.y = -Q.h; o.actor.animate(dt, o.mv ? 4 : 0, o.j ? 1 : 0, t);
    }
    for (const f of this.floaters) { f.t -= dt; f.sp.position.y = f.y + (1.3 - f.t) * 1.6; f.sp.material.opacity = clamp(f.t, 0, 1); }
    this.floaters = this.floaters.filter((f) => { if (f.t <= 0) this.scene.remove(f.sp); return f.t > 0; });
    for (const it of this.items) if (!it.taken) it.sp.position.y = it.y + Math.sin(t * 3 + it.s) * 0.2;
    if (this.dog && this.dog.m.visible) for (const [i, l] of this.dog.m.userData.legs.entries()) l.rotation.z = Math.sin(t * 16 + i * 1.6) * 0.5;
    if (st.shake > 0) st.shake -= dt;
    // camera: zoom in -> bám đường (hướng theo đường); zoom out -> toàn cảnh, xoay tự do quanh người chơi
    const ov = this.overview, look = w.posAt(st.s + (ov ? 0 : 6));
    let dh = look.h - this.camHead; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.camHead += dh * Math.min(1, dt * 3);
    this.yawCur += ((ov ? this.yaw : 0) - this.yawCur) * Math.min(1, dt * 5); if (!ov) this.yaw = this.yawCur;
    this.pitchCur += ((ov ? this.pitchO : this.focusPitch) - this.pitchCur) * Math.min(1, dt * 4);
    const H = this.camHead + this.yawCur, back = this.camD * Math.cos(this.pitchCur), up = this.camD * Math.sin(this.pitchCur), sx = st.shake > 0 ? (Math.random() - 0.5) * 0.4 : 0;
    const tx = ov ? mx : look.x, tz = ov ? mz : look.z, ty = look.y;
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
