// Engine game: nhân vật chibi, camera góc cao, luật bước/thể lực/vật phẩm/chướng ngại/chó đuổi.
import * as THREE from 'three';
import { buildWorld, textSprite } from './world.js';
const S = window.Shared, R = S.RULES;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const C = (h) => new THREE.Color(h);
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hueColor = (id) => new THREE.Color().setHSL(((id * 47) % 360) / 360, 0.55, 0.52);
export const levelOf = (km) => 1 + Math.floor(km / 5);

// ---------- nhân vật chibi: thân hình chuông, đầu tròn, hào quang quanh chân ----------
const bellGeo = new THREE.LatheGeometry([[0.0, 0], [0.6, 0.04], [0.68, 0.35], [0.56, 0.85], [0.38, 1.2], [0.3, 1.32], [0.0, 1.34]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
const headGeo = new THREE.SphereGeometry(0.52, 16, 12), hairGeo = new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const sashGeo = new THREE.TorusGeometry(0.58, 0.09, 6, 20).rotateX(Math.PI / 2), limbGeo = new THREE.SphereGeometry(0.17, 8, 6), footGeo = new THREE.SphereGeometry(0.2, 8, 6);
const ringGeo = new THREE.RingGeometry(1.0, 1.45, 36).rotateX(-Math.PI / 2);
function actorTag(name, km, tier, me) {
  const w = 512, h = 220, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 70px system-ui, sans-serif'; x.lineWidth = 10; x.strokeStyle = '#000a'; x.strokeText(name, w / 2, 40); x.fillStyle = me ? '#ffe27a' : '#fff'; x.fillText(name, w / 2, 40);
  x.font = '600 38px system-ui, sans-serif'; x.fillStyle = '#e8e1d0'; x.strokeText('Cấp ' + levelOf(km), w / 2, 90); x.fillText('Cấp ' + levelOf(km), w / 2, 90);
  const T = S.TIERS[tier], label = `${T.icon} ${km.toFixed(1)} km`;
  x.font = 'bold 46px system-ui, sans-serif'; const tw = x.measureText(label).width + 44;
  x.fillStyle = T.color; x.beginPath(); x.roundRect(w / 2 - tw / 2, 120, tw, 70, 35); x.fill();
  x.fillStyle = '#fff'; x.fillText(label, w / 2, 157);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(3.7, 3.7 * h / w, 1); sp.renderOrder = 20; return sp;
}
export function makeRunner(info, me) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const col = me ? C('#e0a43a') : hueColor(info.id || 1), T = S.TIERS[info.tier || 0];
  const robe = new THREE.MeshLambertMaterial({ color: col });
  const b = new THREE.Mesh(bellGeo, robe); body.add(b);
  const sash = new THREE.Mesh(sashGeo, new THREE.MeshLambertMaterial({ color: '#f2c230' })); sash.position.y = 0.72; body.add(sash);
  const skin = new THREE.MeshLambertMaterial({ color: '#f0bf98' });
  const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.82; body.add(head);
  const hair = new THREE.Mesh(hairGeo, new THREE.MeshLambertMaterial({ color: ['#2a2220', '#4a3020', '#1d1d24', '#6a4a2a'][(info.id || 0) % 4] })); hair.position.y = 1.86; hair.rotation.z = 0.0; body.add(hair);
  for (const z of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#222' })); e.position.set(0.48, 1.8, z); body.add(e); }
  const arms = [-1, 1].map((sd) => { const a = new THREE.Mesh(limbGeo, skin); a.position.set(0, 0.85, sd * 0.7); body.add(a); return a; });
  const feet = [-1, 1].map((sd) => { const f = new THREE.Mesh(footGeo, new THREE.MeshLambertMaterial({ color: '#3a2d26' })); f.position.set(0, 0.12, sd * 0.28); g.add(f); return f; });
  const halo = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: me ? '#ffe9a0' : T.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = 0.05; g.add(halo);
  const tag = actorTag(info.name || 'Khách', info.km || 0, info.tier || 0, me); tag.position.y = me ? 5.1 : 4.6; g.add(tag);
  let arrow = null;
  if (me) { arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 3).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffd23a' })); arrow.position.y = 3.3; g.add(arrow); }
  g.scale.setScalar(me ? 1.25 : 1.1);
  return { group: g, body, arms, feet, halo, arrow, phase: 0,
    animate(dt, speed, jumpH, t) {
      this.phase += dt * (3 + speed * 1.6);
      const sw = speed > 0.3 ? Math.sin(this.phase) : 0, amp = clamp(speed / 4, 0, 1);
      this.feet[0].position.x = sw * 0.4 * amp; this.feet[1].position.x = -sw * 0.4 * amp;
      this.feet[0].position.y = 0.12 + Math.max(0, Math.cos(this.phase)) * 0.18 * amp + jumpH; this.feet[1].position.y = 0.12 + Math.max(0, -Math.cos(this.phase)) * 0.18 * amp + jumpH;
      this.arms[0].position.x = -sw * 0.35 * amp; this.arms[1].position.x = sw * 0.35 * amp;
      this.body.position.y = jumpH + Math.abs(Math.sin(this.phase)) * 0.12 * amp;
      this.body.rotation.z = -0.1 * amp;
      this.halo.material.opacity = 0.6 + Math.sin(t * 3 + this.phase * 0.1) * 0.2; this.halo.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05);
      if (this.arrow) this.arrow.position.y = 3.3 + Math.sin(t * 4) * 0.18 + jumpH;
    } };
}

// ---------- hình vật phẩm / chướng ngại ----------
const emojiTex = {};
function emojiSprite(ch, size = 2.2) {
  if (!emojiTex[ch]) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); x.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 70); emojiTex[ch] = new THREE.CanvasTexture(cv); emojiTex[ch].colorSpace = THREE.SRGBColorSpace; }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex[ch], transparent: true, depthWrite: false })); sp.scale.set(size, size, 1); return sp;
}
function obstacleMesh(kind) {
  const g = new THREE.Group(), L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  if (kind === 'rock') { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), L('#8d8a84')); m.scale.set(1.2, 0.85, 1.1); m.position.y = 0.6; g.add(m); }
  else if (kind === 'puddle') { const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#58a9d8' })); m.position.y = 0.06; g.add(m); }
  else if (kind === 'cone') { const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 10), L('#ff7a1a')); m.position.y = 0.65; g.add(m); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.25, 10), L('#fff')); b.position.y = 0.6; g.add(b); }
  else if (kind === 'crate') { const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), L('#b98a4f')); m.position.y = 0.6; g.add(m); }
  else if (kind === 'log') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3, 8).rotateX(Math.PI / 2), L('#7a5233')); m.position.y = 0.4; g.add(m); }
  else { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.1), L('#6c747c')); b.position.y = 1.0; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), L('#7b848c')); h.position.set(1.4, 1.2, 0); g.add(h); for (const z of [-0.5, 0.5]) { const hn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), L('#e8e1cf')); hn.position.set(1.7, 1.75, z); hn.rotation.z = -0.5; g.add(hn); } for (const x of [-0.8, 0.8]) for (const z of [-0.4, 0.4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), L('#4a5258')); l.position.set(x, 0.35, z); g.add(l); } }
  return g;
}
const OBST = { hanoi: ['cone', 'crate', 'puddle'], saigon: ['cone', 'crate', 'puddle'], danang: ['cone', 'puddle', 'rock'], halong: ['rock', 'puddle', 'cone'],
  trangan: ['buffalo', 'rock', 'puddle'], mocchau: ['rock', 'puddle', 'buffalo', 'log'], haivan: ['rock', 'rock', 'puddle', 'cone'], prenn: ['rock', 'log', 'puddle'],
  oquyho: ['rock', 'puddle', 'buffalo'], mapileng: ['rock', 'rock', 'cone'] };
const OBST_H = { rock: 1.0, puddle: 0.1, cone: 1.0, crate: 1.1, log: 0.8, buffalo: 1.4 };
function dogMesh() {
  const g = new THREE.Group(), L = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.7), L('#b9824a')); body.position.y = 0.7; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.6, 0.6), L('#c99057')); head.position.set(0.95, 1.0, 0); g.add(head);
  for (const z of [-0.22, 0.22]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.14), L('#6b3f1d')); e.position.set(0.9, 1.4, z); g.add(e); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.14), L('#b9824a')); tail.position.set(-1.0, 1.0, 0); tail.rotation.z = 0.6; g.add(tail);
  const legs = [];
  for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), L('#a06a38')); l.position.set(x, 0.25, z); g.add(l); legs.push(l); }
  g.scale.setScalar(1.3); g.userData.legs = legs; return g;
}

// ---------- Game ----------
export class Game {
  constructor(canvas, hooks) {
    this.hooks = hooks; this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, 1, 0.5, 500);
    this.scene.add(new THREE.HemisphereLight('#fff3dc', '#8a7a62', 1.0));
    const sun = new THREE.DirectionalLight('#fff1d2', 1.1); sun.position.set(40, 80, 30); this.scene.add(sun);
    this.pitch = 0.8; this.camD = 34; this.camHead = 0; this.running = false; this.dyn = new THREE.Group(); this.scene.add(this.dyn);
    this.others = new Map(); this.floaters = []; this.t = 0; this.last = 0; this.hudT = 0;
    this.resize(); addEventListener('resize', () => this.resize());
    this.loop = this.loop.bind(this); this.ticker = setInterval(() => this.logic(), 100);
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  load(map, dist, mode, profile, seed = Math.floor(Math.random() * 1e9)) {
    this.dispose(); this.map = map; this.total = Math.min(dist, map.km * 1000); this.world = buildWorld(map, this.scene);
    this.scene.background = C(this.world.theme.bg); this.scene.fog = new THREE.Fog(this.world.theme.bg, 70, 190);
    this.world.setFinish(this.total);
    this.profile = profile; this.mode = mode; this.seed = seed;
    const rng = mulberry(seed);
    this.st = { s: 0, target: 0, stam: R.STAM_MAX, exhausted: false, slowT: 0, boltT: 0, jumpT: 0, jumpCd: 0, auto: 0, stepTimes: [], lastStep: -9,
      steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, time: 0, speed: 0, finished: false, items: {}, shake: 0, grade: 0 };
    this.unsent = { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} };
    this.inv = (profile.inventory || []).filter((s) => S.ITEMS[s.k]).map((s) => ({ k: s.k, n: Math.min(R.INV_STACK, s.n) })).slice(0, R.INV_SLOTS);
    // chướng ngại + vật phẩm theo seed
    this.obst = []; this.items = [];
    const kinds = OBST[map.theme]; const hard = 1 + (map.diff - 1) * 0.12;
    for (let s = 70; s < this.total - 25; s += (48 + rng() * 60) / hard) {
      const kind = kinds[Math.floor(rng() * kinds.length)], m = obstacleMesh(kind), P = this.world.posAt(s);
      m.position.set(P.x, P.y, P.z); m.rotation.y = -P.h; this.dyn.add(m); this.obst.push({ s, kind, h: OBST_H[kind], done: false, m });
    }
    const wsum = Object.values(S.ITEMS).reduce((a, i) => a + i.w, 0);
    for (let s = 40; s < this.total - 15; s += (115 + rng() * 95) / (1 + (map.diff - 1) * 0.08)) {
      let r = rng() * wsum, key = 'water'; for (const [k, i] of Object.entries(S.ITEMS)) { if ((r -= i.w) <= 0) { key = k; break; } }
      let ss = s; while (this.obst.some((o) => Math.abs(o.s - ss) < 5)) ss += 6;
      const sp = emojiSprite(S.ITEMS[key].icon), P = this.world.posAt(ss); sp.position.set(P.x, P.y + 1.4, P.z); this.dyn.add(sp);
      this.items.push({ s: ss, key, taken: false, sp, y: P.y });
    }
    this.dogEvents = []; for (let s = 260 + rng() * 300; s < this.total - 120; s += 420 + rng() * 600) this.dogEvents.push(s);
    this.dogIdx = 0; this.dog = null;
    this.me = makeRunner({ id: 0, name: profile.name, km: profile.totals.totalKm, tier: profile.tier }, true); this.scene.add(this.me.group);
    this.running = true; this.last = performance.now(); this.camHead = this.world.posAt(0).h; this.hud(true);
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.loop);
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.raf);
    for (const o of [this.world && this.world.group, this.me && this.me.group, this.dyn]) if (o && o !== this.dyn) this.scene.remove(o);
    while (this.dyn.children.length) this.dyn.remove(this.dyn.children[0]);
    for (const o of this.others.values()) this.scene.remove(o.actor.group); this.others.clear(); this.floaters = []; this.dog = null;
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
    const P = this.world.posAt(this.st.s); sp.position.set(P.x, P.y + 4.4, P.z); this.scene.add(sp); this.floaters.push({ sp, t: 1.3, y: P.y + 4.4 });
  }
  zoom(d) { this.camD = clamp(this.camD + d, 12, 48); }
  tilt() { this.pitch = this.pitch > 1.1 ? 0.8 : this.pitch > 0.65 ? 0.5 : 1.3; }

  // ----- logic 10 Hz (cũng chạy khi tab ẩn) -----
  logic() {
    if (!this.running) return;
    const now = performance.now(), dt = clamp((now - this.last) / 1000, 0, 5); this.last = now;
    if (document.hidden) this.advance(dt);
  }
  advance(dt) {
    const st = this.st; if (st.finished) return;
    this.t += dt; st.time += dt; this.unsent.secs += dt;
    if (st.boltT > 0) st.boltT = Math.max(0, st.boltT - dt);
    if (st.slowT > 0) st.slowT = Math.max(0, st.slowT - dt);
    if (st.jumpCd > 0) st.jumpCd -= dt;
    // hồi sức khi đứng yên
    if (this.t - st.lastStep > 1.2 || st.exhausted) { st.stam = Math.min(R.STAM_MAX, st.stam + R.IDLE_REGEN * dt); if (st.exhausted && st.stam >= R.STAM_RESUME) st.exhausted = false; }
    // tự động: 1 bước/giây, tự nhảy qua chướng ngại
    if (this.mode === 'auto' && !st.exhausted) { st.auto += dt; while (st.auto >= 1 / R.AUTO_STEPS_PER_SEC) { st.auto -= 1 / R.AUTO_STEPS_PER_SEC; st.stepTimes = []; this.step(); } }
    // di chuyển mượt tới vị trí mục tiêu
    const prev = st.s; st.s += (st.target - st.s) * Math.min(1, dt * 8); if (st.target - st.s < 0.01) st.s = st.target;
    st.speed += ((st.s - prev) / Math.max(dt, 1e-3) - st.speed) * Math.min(1, dt * 6);
    // nhảy
    if (st.jumpT > 0) st.jumpT = Math.max(0, st.jumpT - dt);
    const nextObs = this.obst.find((o) => !o.done && o.s >= prev - 0.5);
    if (this.mode === 'auto' && nextObs && nextObs.s - st.s < 2.8 && nextObs.s - st.s > 0 && st.jumpT <= 0) { st.jumpT = 0.7; }
    for (const o of this.obst) if (!o.done && prev < o.s && st.s >= o.s) {
      o.done = true;
      if (st.jumpT > 0.08 || o.kind === 'puddle' && st.jumpT > 0) { st.jumps++; this.unsent.jumps++; this.float('Nhảy qua! 🦘', '#ffe27a'); }
      else { st.stam = Math.max(0, st.stam - R.HIT_STAM); st.slowT = Math.max(st.slowT, R.HIT_SLOW_SECS); st.shake = 0.3; this.float('Vấp rồi! -10', '#ff9d8a'); if (st.stam <= 0) st.exhausted = true; }
    }
    // nhặt vật phẩm
    for (const it of this.items) if (!it.taken && prev < it.s + 1.2 && st.s >= it.s - 1.2) {
      const slot = this.inv.find((x) => x.k === it.key && x.n < R.INV_STACK) || (this.inv.length < R.INV_SLOTS ? (this.inv.push({ k: it.key, n: 0 }), this.inv[this.inv.length - 1]) : null);
      if (!slot) continue;
      slot.n++; it.taken = true; this.dyn.remove(it.sp); st.items[it.key] = (st.items[it.key] || 0) + 1; this.unsent.items[it.key] = (this.unsent.items[it.key] || 0) + 1;
      this.float(`${S.ITEMS[it.key].icon} ${S.ITEMS[it.key].name}`, '#fff'); this.hooks.onInventory && this.hooks.onInventory(this.inv);
    }
    this.dogLogic(dt);
    // về đích
    if (st.target >= this.total && st.s >= this.total - 0.05) { st.finished = true; st.s = st.target = this.total; this.hooks.onFinish && this.hooks.onFinish(this.summary()); }
  }
  dogLogic(dt) {
    const st = this.st;
    if (!this.dog && this.dogIdx < this.dogEvents.length && st.s >= this.dogEvents[this.dogIdx]) {
      this.dogIdx++; const m = dogMesh(); this.dyn.add(m); m.visible = false;
      this.dog = { phase: 'warn', t: R.DOG_WARN_SECS, s: 0, lat: 0, m }; this.say('🐕 Gâu gâu! Chó đuổi — dùng ⚡ hoặc chạy nhanh hơn!', 2600); this.float('Gâu! 🐕', '#ffb27a');
    }
    const d = this.dog; if (!d) return;
    d.t -= dt;
    if (d.phase === 'warn' && d.t <= 0) { d.phase = 'chase'; d.t = R.DOG_SECS; d.s = st.s - R.DOG_START_GAP; d.m.visible = true; }
    else if (d.phase === 'chase') {
      d.s += R.DOG_SPEED * dt;
      if (st.s - d.s <= 0.9) { st.stam = Math.max(0, st.stam - R.BITE_STAM); st.slowT = R.BITE_SLOW_SECS; st.bites++; this.unsent.bites++; st.shake = 0.5; this.float(`Bị cắn! -${R.BITE_STAM}`, '#ff7a6a'); if (st.stam <= 0) st.exhausted = true; d.phase = 'leave'; d.t = 2; }
      else if (d.t <= 0) { d.phase = 'leave'; d.t = 2; this.float('Thoát chó rồi 😅', '#9ef0b0'); }
    } else if (d.phase === 'leave') { d.lat += 6 * dt; d.s += 2 * dt; if (d.t <= 0) { this.dyn.remove(d.m); this.dog = null; return; } }
    if (d.m.visible) { const P = this.world.posAt(d.s), [x, z] = this.world.off(P, d.lat); d.m.position.set(x, P.y, z); d.m.rotation.y = -P.h - (d.phase === 'leave' ? 1.2 : 0); d.m.position.y += Math.abs(Math.sin(this.t * 14)) * 0.25; }
  }
  summary() { const st = this.st; return { time: st.time, steps: st.steps, meters: st.meters, jumps: st.jumps, bites: st.bites, items: { ...st.items }, map: this.map, dist: this.total }; }
  takeDelta() { const d = this.unsent; this.unsent = { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} }; d.secs = Math.round(d.secs); return d; }

  // ----- người chơi khác -----
  setOthers(list) { for (const p of list) this.addOther(p); }
  addOther(p) {
    if (this.others.has(p.id)) return;
    const actor = makeRunner(p, false); this.scene.add(actor.group);
    this.others.set(p.id, { actor, s: p.s || 0, ts: p.s || 0, j: 0, mv: 0, lat: ((p.id * 37) % 11 - 5) * 0.55, speed: 0 });
  }
  removeOther(id) { const o = this.others.get(id); if (o) { this.scene.remove(o.actor.group); this.others.delete(id); } }
  snap(arr) { for (const [id, s, j, mv] of arr) { const o = this.others.get(id); if (o) { o.ts = s; o.j = j; o.mv = mv; } } }
  count() { return this.others.size + 1; }

  // ----- vẽ -----
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.running) return;
    const dt = clamp((now - this.rl || now) / 1000, 0, 0.1); this.rl = now;
    if (!document.hidden) { this.advance(dt); }
    this.render(dt);
  }
  render(dt) {
    const st = this.st, w = this.world, t = this.t;
    const P = w.posAt(st.s); const jh = st.jumpT > 0 ? Math.sin((1 - st.jumpT / 0.7) * Math.PI) * 1.7 : 0;
    this.me.group.position.set(P.x, P.y, P.z); this.me.group.rotation.y = -P.h;
    this.me.animate(dt, Math.min(8, st.speed), jh, t);
    for (const o of this.others.values()) {
      o.s += (o.ts - o.s) * Math.min(1, dt * 6); const Q = w.posAt(o.s), [x, z] = w.off(Q, o.lat);
      o.actor.group.position.set(x, Q.y, z); o.actor.group.rotation.y = -Q.h; o.actor.animate(dt, o.mv ? 4 : 0, o.j ? 1 : 0, t);
    }
    for (const f of this.floaters) { f.t -= dt; f.sp.position.y = f.y + (1.3 - f.t) * 1.6; f.sp.material.opacity = clamp(f.t, 0, 1); }
    this.floaters = this.floaters.filter((f) => { if (f.t <= 0) this.scene.remove(f.sp); return f.t > 0; });
    for (const it of this.items) if (!it.taken) it.sp.position.y = it.y + 1.5 + Math.sin(t * 3 + it.s) * 0.25;
    if (this.dog && this.dog.m.visible) for (const [i, l] of this.dog.m.userData.legs.entries()) l.rotation.z = Math.sin(t * 16 + i * 1.6) * 0.5;
    if (st.shake > 0) st.shake -= dt;
    // camera: bám theo hướng đường, góc cao nghiêng
    const tgt = w.posAt(st.s + 6); let dh = tgt.h - this.camHead; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.camHead += dh * Math.min(1, dt * 3);
    const back = this.camD * Math.cos(this.pitch), up = this.camD * Math.sin(this.pitch);
    const sx = st.shake > 0 ? (Math.random() - 0.5) * 0.4 : 0;
    this.camera.position.set(tgt.x - Math.cos(this.camHead) * back + sx, tgt.y + up, tgt.z - Math.sin(this.camHead) * back);
    this.camera.lookAt(tgt.x, tgt.y, tgt.z); w.update(P.x, P.z);
    this.renderer.render(this.scene, this.camera);
    this.hudT += dt; if (this.hudT > 0.1) { this.hudT = 0; this.hud(); }
  }
  hud() {
    const st = this.st; if (!st || !this.hooks.onHud) return;
    const v = st.speed, kmh = v * 3.6;
    this.hooks.onHud({ s: st.s, dist: this.total, stam: st.stam, exhausted: st.exhausted, kmh, pace: kmh > 0.5 ? 60 / kmh : 0, steps: st.steps, time: st.time,
      grade: S.gradeAt(this.map, st.s), elev: S.elevAt(this.map, st.s), boltT: st.boltT, slowT: st.slowT, mode: this.mode, dog: this.dog ? this.dog.phase : null, online: this.count(), finished: st.finished });
  }
}
