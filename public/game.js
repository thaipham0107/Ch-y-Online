'use strict';
(() => {
const $ = (s) => document.querySelector(s);
const { TIERS, tierIndex, speedMult } = window.Tiers;
const PX = 24;                 // pixel / mét
const BASE_SPEED = 14;         // m/s
let TRACK = 3000;
let cfg = { hats: {}, strava: false, mock: false };

// ---------- Trạng thái ----------
let me = null;                 // thông tin của mình (từ server)
let ws = null, myPid = 0, roomId = 0;
const players = new Map();     // pid -> {info,x,tx,z,s,m,phase,lane,bubble}
const st = { x: 0, v: 0, z: 0, vz: 0, stam: 100, stumble: 0, rest: false, sprint: false, phase: 0,
  lap: 0, celebrate: 0, shake: 0, bubble: null, tierPulse: 0 };
const keys = new Set();
let particles = [], floaters = [];

// ---------- Tiện ích ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Lỗi');
  return j;
}
let toastTimer;
function toast(text, ms = 1600) {
  const t = $('#toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Đường chạy (sinh theo seed, ai cũng thấy giống nhau) ----------
const obstacles = [], items = [];
function genTrack() {
  obstacles.length = 0; items.length = 0;
  const rnd = mulberry(20240607);
  let m = 70;
  while (m < TRACK - 60) {
    const r = rnd();
    if (r < 0.5) {
      const type = ['rock', 'puddle', 'dog', 'buffalo', 'cone'][Math.floor(rnd() * 5)];
      obstacles.push({ x: m, type, h: { rock: 30, puddle: 6, dog: 34, buffalo: 50, cone: 28 }[type], done: false });
      if (rnd() < 0.7) for (let k = -2; k <= 2; k++) items.push({ x: m + k * 1.5, z: 24 + (1 - (k * k) / 4) * 70, type: 'coin', got: false });
      m += 16 + rnd() * 14;
    } else if (r < 0.78) {
      items.push({ x: m, z: 10, type: 'bottle', got: false }); m += 10 + rnd() * 14;
    } else if (r < 0.93) {
      for (let k = 0; k < 5; k++) items.push({ x: m + k * 1.6, z: 10, type: 'coin', got: false });
      m += 14 + rnd() * 10;
    } else {
      items.push({ x: m, z: 20, type: 'lotus', got: false }); m += 22;
    }
  }
}
function resetLap() { obstacles.forEach((o) => o.done = false); items.forEach((i) => i.got = false); }

// ---------- Mạng ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = (e) => {
    if (e.code === 4001) return showLogin();
    if (e.code === 4002) { toast('Bạn mở game ở tab khác', 4000); return; }
    setTimeout(() => me && connect(), 2000);
  };
}
function sendWs(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function addPlayer(p) {
  players.set(p.id, { info: p, x: p.x || 0, tx: p.x || 0, z: p.z || 0, s: p.s || 0, m: p.m || 0, phase: Math.random() * 6,
    lane: [0, 1, 3, 4][p.id % 4], bubble: null });
}
function handle(m) {
  switch (m.t) {
    case 'welcome':
      myPid = m.id; roomId = m.room; TRACK = m.track; genTrack();
      players.clear(); m.players.forEach((p) => { if (p.id !== myPid) addPlayer(p); });
      setMe(m.me); logChat(null, `Bạn đang ở Kênh ${roomId} · ${players.size + 1} người`); break;
    case 'join': addPlayer(m.p); logChat(null, `${m.p.name} vào kênh`); break;
    case 'leave': players.delete(m.id); break;
    case 'info': { const p = players.get(m.p.id); if (p) p.info = m.p; break; }
    case 'snap': for (const [id, x, z, s, mv] of m.p) {
      const p = players.get(id); if (!p) continue;
      if (Math.abs(x - p.x) > 300) p.x = x;
      p.tx = x; p.z = z; p.s = s; p.m = mv;
    } break;
    case 'me': setMe(m.me); break;
    case 'fix': st.x = m.x; break;
    case 'toast': toast(m.text, 2200); burst(innerWidth * 0.3, innerHeight * 0.6, 30); break;
    case 'chat': {
      logChat(m.id ? m.name : null, m.text);
      if (m.id === myPid) st.bubble = { text: m.text, t: 4 };
      const p = players.get(m.id); if (p) p.bubble = { text: m.text, t: 4 };
    } break;
  }
}

// ---------- HUD ----------
function badgeHtml(km, tier, ver) {
  const T = TIERS[tier];
  return `<span class="pill" style="background:${T.color}">${T.icon} ${km.toFixed(1)} km ${ver ? '✓' : '✎'}</span>`;
}
function setMe(m) {
  const prevTier = me ? me.tier : m.tier;
  me = m;
  $('#me-name').textContent = m.name;
  $('#me-coins').textContent = '🪙 ' + m.coins;
  $('#me-badge').innerHTML = badgeHtml(m.km, m.tier, m.verified) + ` <span class="small">${TIERS[m.tier].name}</span>`;
  $('#me-mult').textContent = `Sức mạnh → tốc độ ×${m.mult}`;
  if (m.tier > prevTier) { toast(`${TIERS[m.tier].icon} Lên hạng ${TIERS[m.tier].name}!`, 2500); burst(innerWidth / 2, innerHeight / 2, 60); }
  renderQuests(); renderProfile();
}
function renderQuests() {
  if (!me) return;
  const real = me.stravaLinked
    ? `<div class="small">Strava hôm nay: <b>${me.todayKm.toFixed(1)} km</b> · đồng bộ ${me.lastSync ? new Date(me.lastSync).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}</div>`
    : `<div class="small">Kết nối Strava để mở nhiệm vụ chạy thật 👟</div>`;
  $('#tab-quests').innerHTML = `<div class="small">Nhiệm vụ hôm nay (làm mới lúc 0h)</div>${real}` + me.quests.map((q) => `
    <div class="q">
      <span class="ic">${q.icon}</span><span class="t">${esc(q.title)}</span>
      ${q.claimed ? '<button class="btn sec" disabled>Đã nhận</button>'
        : q.needStrava ? `<a class="btn sec" style="text-decoration:none" href="/auth/strava">Strava</a>`
        : `<button class="btn" data-claim="${q.id}" ${q.done ? '' : 'disabled'}>+${q.reward}🪙</button>`}
      <div class="bar"><i style="width:${(q.progress / q.goal) * 100}%"></i></div>
    </div>`).join('') + `<div class="small" style="margin-top:8px">Tiến độ: ${me.quests.filter(q=>q.progress).map(q=>`${q.icon}${q.progress}/${q.goal}`).join('  ') || 'chưa có'}</div>`;
}
$('#tab-quests').addEventListener('click', async (e) => {
  const id = e.target.dataset && e.target.dataset.claim; if (!id) return;
  try { const j = await api('/api/quests/claim', { id }); setMe(j.me); toast('🎉 Nhận thưởng!'); burst(innerWidth * 0.5, innerHeight * 0.4, 40); }
  catch (er) { toast(er.message); }
});
async function renderBoard() {
  const j = await api('/api/leaderboard');
  const rows = (arr, f) => arr.length ? arr.map((r, i) => `<div class="lb"><span class="n">${i + 1}</span><span class="nm">${TIERS[r.tier].icon} ${esc(r.name)}</span>${f(r)}</div>`).join('') : '<div class="small">Chưa có ai</div>';
  $('#tab-board').innerHTML = `<div class="sect">Sức mạnh (km)</div>${rows(j.power, (r) => `<b>${r.km.toFixed(1)} km ${r.ver ? '✓' : '✎'}</b>`)}
    <div class="sect">Chạy trong game hôm nay</div>${rows(j.today, (r) => `<b>${r.km.toFixed(2)} km</b>`)}`;
}
function renderProfile() {
  if (!me) return;
  const opt = (v, t, dis) => `<option value="${v}" ${me.metric === v ? 'selected' : ''} ${dis ? 'disabled' : ''}>${t}</option>`;
  const s = me.stats || {};
  $('#tab-profile').innerHTML = `
    <div>${badgeHtml(me.km, me.tier, me.verified)}</div>
    <div class="field"><label>Sức mạnh tính theo</label>
      <select id="metric">
        ${opt('ytd', `Chạy năm nay (${(s.ytd ?? 0)} km)`, !me.stravaLinked)}
        ${opt('recent', `4 tuần gần đây (${(s.recent ?? 0)} km)`, !me.stravaLinked)}
        ${opt('all', `Tổng cộng (${(s.all ?? 0)} km)`, !me.stravaLinked)}
        ${opt('manual', `Tự khai (${me.manualKm} km)`)}
      </select></div>
    ${me.stravaLinked ? `<button class="btn" id="sync">🔄 Đồng bộ Strava</button>` : `<a class="btn" style="display:block;text-align:center;text-decoration:none" href="/auth/strava">Kết nối Strava</a>`}
    <div class="field"><label>Tự khai km</label><div style="display:flex;gap:6px"><input id="mkm" type="number" min="0" step="0.1" value="${me.manualKm}" style="flex:1;min-width:0"><button class="btn sec" id="msave">Lưu</button></div></div>
    <div class="sect">Cửa hàng mũ</div>
    <div class="hats">${Object.entries(cfg.hats).map(([id, h]) => {
      const owned = me.hats.includes(id);
      return `<button class="hat ${me.hat === id ? 'on' : ''}" data-hat="${id}">${HAT_ICON[id]}<br>${esc(h.name)}<br><b>${owned ? (me.hat === id ? 'Đang đội' : 'Đội') : h.price + '🪙'}</b></button>`;
    }).join('')}</div>
    <div class="sect">Tài khoản</div>
    <button class="btn sec" id="logout">Đăng xuất</button>`;
}
const HAT_ICON = { none: '🙂', nonla: '👒', bando: '🎀', cap: '🧢', neko: '🐱', crown: '👑' };
$('#tab-profile').addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  try {
    if (t.id === 'sync') { t.disabled = true; setMe((await api('/api/strava/sync', {})).me); toast('Đã đồng bộ ✓'); }
    else if (t.id === 'msave') setMe((await api('/api/me/manual', { km: +$('#mkm').value })).me);
    else if (t.id === 'logout') { await api('/api/logout', {}); location.reload(); }
    else if (t.dataset.hat) setMe((await api('/api/shop', { hat: t.dataset.hat })).me);
  } catch (er) { toast(er.message); renderProfile(); }
});
$('#tab-profile').addEventListener('change', async (e) => {
  if (e.target.id !== 'metric') return;
  try { setMe((await api('/api/me/metric', { metric: e.target.value })).me); } catch (er) { toast(er.message); }
});
$('#tabs').addEventListener('click', (e) => {
  const t = e.target.dataset.tab; if (!t) return;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === e.target));
  ['quests', 'board', 'chat', 'profile'].forEach((n) => $('#tab-' + n).hidden = n !== t);
  if (t === 'board') renderBoard();
});
$('#menu-btn').onclick = () => $('#panel').classList.toggle('open');
function logChat(name, text) {
  const d = document.createElement('div');
  if (name) { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, text); }
  else { d.className = 'small'; d.textContent = text; }
  const log = $('#chatlog'); log.append(d); log.scrollTop = log.scrollHeight;
  while (log.children.length > 80) log.firstChild.remove();
}
$('#chatform').onsubmit = (e) => { e.preventDefault(); const i = $('#chatinput'); if (i.value.trim()) sendWs({ t: 'chat', text: i.value }); i.value = ''; };
$('#emotes').onclick = (e) => { if (e.target.tagName === 'BUTTON') sendWs({ t: 'chat', text: e.target.textContent }); };

// ---------- Đăng nhập ----------
function showLogin() {
  $('#login').hidden = false; $('#hud').hidden = true;
  const q = new URLSearchParams(location.search).get('err');
  const msgs = { nostrava: 'Server chưa cấu hình Strava.', denied: 'Bạn đã từ chối quyền Strava.', scope: 'Cần cho phép xem hoạt động (activity:read) để tính km.', state: 'Phiên đăng nhập hết hạn, thử lại nhé.', strava: 'Kết nối Strava thất bại, thử lại nhé.' };
  if (q && msgs[q]) { const e = $('#err'); e.hidden = false; e.textContent = msgs[q]; }
  const b = $('#strava-btn');
  if (!cfg.strava) { b.style.opacity = .5; b.textContent = 'Strava chưa được cấu hình'; b.removeAttribute('href'); }
  $('#mock-note').hidden = !cfg.mock;
}
$('#guest-form').onsubmit = async (e) => {
  e.preventDefault();
  try { const j = await api('/api/guest', { name: $('#g-name').value, km: +$('#g-km').value || 0 }); start(j.me); }
  catch (er) { toast(er.message); }
};
function start(m) {
  $('#login').hidden = true; $('#hud').hidden = false;
  history.replaceState(null, '', '/');
  me = m; resize(); setMe(m); genTrack(); connect();
}

// ---------- Điều khiển ----------
const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
addEventListener('keydown', (e) => {
  if (typing()) return;
  if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); jump(); }
  if (e.key === 'Shift') st.sprint = true;
  if (e.key === 'r' || e.key === 'R') { st.rest = !st.rest; toast(st.rest ? '⏸ Nghỉ' : '▶ Chạy tiếp', 700); }
  if (e.key === 'Enter') { $('#tabs button[data-tab=chat]').click(); $('#chatinput').focus(); }
});
addEventListener('keyup', (e) => { if (e.key === 'Shift') st.sprint = false; });
const hold = (el, on, off) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, () => off && off())); };
hold($('#b-jump'), jump); hold($('#b-sprint'), () => st.sprint = true, () => st.sprint = false);
hold($('#b-rest'), () => { st.rest = !st.rest; $('#b-rest').classList.toggle('on', st.rest); });
const cv = $('#game');
cv.addEventListener('pointerdown', (e) => { if (!typing() && innerWidth > 820) jump(); else if (e.target === cv) jump(); });
function jump() { if (st.z <= 0.5 && me) { st.vz = 560; } }

// ---------- Cập nhật ----------
function evSend(k) { sendWs({ t: 'ev', k }); }
function burst(x, y, n, colors = ['#fde047', '#fb7185', '#38bdf8', '#4ade80', '#fff']) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - .5) * 500, vy: -Math.random() * 500 - 100, g: 900, life: 1 + Math.random() * .8, c: colors[i % colors.length], sz: 4 + Math.random() * 5, screen: true });
}
function floatText(text, wx, wy) { floaters.push({ text, wx, wy, t: 1 }); }

function update(dt) {
  if (!me) return;
  const mult = speedMult(me.km);
  let target = st.rest ? 0 : BASE_SPEED * mult;
  const wantSprint = st.sprint && st.stam > 4 && !st.rest;
  if (wantSprint) { target *= 1.6; st.stam = Math.max(0, st.stam - 26 * dt); } else st.stam = Math.min(100, st.stam + 9 * dt);
  if (st.stumble > 0) { target *= 0.25; st.stumble -= dt; }
  if (st.celebrate > 0) { target = 0; st.celebrate -= dt; if (st.celebrate <= 0) { st.x = 0; st.lap++; resetLap(); } }
  st.v += (target - st.v) * Math.min(1, dt * 6);
  const prev = st.x;
  st.x += st.v * dt;
  // nhảy
  if (st.z > 0 || st.vz > 0) { st.vz -= 1700 * dt; st.z += st.vz * dt; if (st.z <= 0) { st.z = 0; st.vz = 0; dust(3); } }
  st.phase += dt * (6 + st.v * 0.55);
  if (st.v > 3 && st.z === 0 && Math.random() < dt * 14) dust(1);
  // chướng ngại
  for (const o of obstacles) if (!o.done && st.x >= o.x && prev < o.x + 1) {
    o.done = true;
    if (st.z < o.h) { st.stumble = 1; st.stam = Math.max(0, st.stam - 15); st.shake = .35; floatText(o.type === 'dog' ? 'Gâu! 🐕' : 'Á! 💥', o.x, 60); }
    else { evSend('jump'); floatText('+1 🦘', o.x, 90); }
  }
  // vật phẩm
  for (const it of items) if (!it.got && Math.abs(it.x - st.x) < 0.9 && Math.abs(it.z - st.z) < 55) {
    it.got = true;
    if (it.type === 'bottle') { st.stam = Math.min(100, st.stam + 30); evSend('bottle'); floatText('💧 +SỨC', it.x, 80); }
    else if (it.type === 'lotus') { st.stam = 100; evSend('coin'); evSend('coin'); floatText('🪷 Hoa sen!', it.x, 90); }
    else evSend('coin');
  }
  // tới chùa
  if (st.x >= TRACK && st.celebrate <= 0) { st.x = TRACK; st.celebrate = 2.2; evSend('temple'); burst(innerWidth / 2, innerHeight / 2, 120); toast('🏯 TỚI CHÙA!', 2000); }
  st.shake = Math.max(0, st.shake - dt);
  if (st.bubble && (st.bubble.t -= dt) <= 0) st.bubble = null;
  // người khác
  for (const p of players.values()) {
    p.x += (p.tx - p.x) * Math.min(1, dt * 10);
    if (p.m) p.phase += dt * (6 + 14 * 0.55 * speedMult(p.info.km) * (p.s ? 1.6 : 1));
    if (p.bubble && (p.bubble.t -= dt) <= 0) p.bubble = null;
  }
  for (const f of floaters) f.t -= dt; floaters = floaters.filter((f) => f.t > 0);
  for (const q of particles) { q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (!q.screen) q.x -= st.v * PX * dt; }
  particles = particles.filter((q) => q.life > 0);
  // HUD
  $('#stam').style.width = st.stam + '%';
  const left = Math.max(0, Math.round(TRACK - st.x));
  $('#dist-text').textContent = st.celebrate > 0 ? '🏯 Đã tới chùa!' : `Còn ${left} m tới chùa · vòng ${st.lap + 1}`;
  $('#dist-bar').style.width = (st.x / TRACK * 100) + '%';
}
function dust(n) { for (let i = 0; i < n; i++) particles.push({ x: W * 0.3 + (Math.random() - .5) * 10, y: laneY(2) + 2, vx: -40 - Math.random() * 60, vy: -30 - Math.random() * 60, g: 200, life: .5, c: 'rgba(255,255,255,.7)', sz: 3 + Math.random() * 4 }); }

setInterval(() => {
  if (me && ws && ws.readyState === 1) sendWs({ t: 'pos', x: +st.x.toFixed(2), z: Math.round(st.z), s: st.sprint && st.stam > 4 && !st.rest ? 1 : 0, m: st.v > 1 ? 1 : 0 });
}, 100);

// ---------- Vẽ ----------
const canvas = $('#game'), ctx = canvas.getContext('2d'), mmc = $('#mm'), mctx = mmc.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
  const r = mmc.getBoundingClientRect(); mmc.width = r.width * DPR; mmc.height = r.height * DPR;
}
addEventListener('resize', resize);
const horizon = () => H * 0.48, roadTop = () => H * 0.58, roadBot = () => H * 0.9;
const laneY = (l) => roadTop() + (l + 0.5) * (roadBot() - roadTop()) / 5;
const laneScale = (l) => (0.8 + l * 0.07) * clamp(H / 700, 0.7, 1.15);

const PAL = [
  { skyT: '#5cc2ff', skyB: '#e6f7ff', mtn: '#9fd3c7', grass: '#8ed160', name: 'Đồng lúa' },
  { skyT: '#ffc27a', skyB: '#fff1d6', mtn: '#d7a9b8', grass: '#a6d65c', name: 'Làng quê' },
  { skyT: '#86d9a5', skyB: '#e4f9e8', mtn: '#5fae8a', grass: '#4fb36d', name: 'Rừng tre' },
  { skyT: '#79b8ff', skyB: '#dff0ff', mtn: '#7fa3d6', grass: '#6fcf9a', name: 'Bờ sông' },
  { skyT: '#ff8a6a', skyB: '#ffe0b0', mtn: '#7b5e8a', grass: '#6fb36a', name: 'Chân núi' }
];
function palAt(m) {
  const t = clamp(m / 600, 0, 4.999), i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  const a = PAL[i], b = PAL[Math.min(4, i + 1)];
  return { skyT: mix(a.skyT, b.skyT, s), skyB: mix(a.skyB, b.skyB, s), mtn: mix(a.mtn, b.mtn, s), grass: mix(a.grass, b.grass, s), zone: i };
}
const ell = (c, x, y, rx, ry, f) => { c.fillStyle = f; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };
const rrect = (c, x, y, w, h, r, f) => { c.fillStyle = f; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };

function drawMidObj(c, kind, x, y, s, seed) {
  if (kind === 0) { // dừa
    c.strokeStyle = '#8b5a2b'; c.lineWidth = 6 * s; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 8 * s, y - 50 * s, x + 4 * s, y - 90 * s); c.stroke();
    c.fillStyle = '#2f9e44'; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; c.beginPath(); c.ellipse(x + 4 * s + Math.cos(a) * 18 * s, y - 92 * s + Math.sin(a) * 8 * s, 20 * s, 5 * s, a, 0, 7); c.fill(); }
  } else if (kind === 1) { // nhà
    rrect(c, x - 28 * s, y - 40 * s, 56 * s, 40 * s, 3, '#fff3d6'); c.fillStyle = '#d9480f'; c.beginPath(); c.moveTo(x - 36 * s, y - 38 * s); c.lineTo(x, y - 70 * s); c.lineTo(x + 36 * s, y - 38 * s); c.fill();
    rrect(c, x - 6 * s, y - 24 * s, 12 * s, 24 * s, 2, '#7c4a2d');
  } else if (kind === 2) { // tre
    c.strokeStyle = '#3f8f3f'; c.lineWidth = 5 * s; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x + k * 9 * s, y); c.lineTo(x + k * 9 * s + k * 3 * s, y - (90 + seed * 40) * s); c.stroke();
      c.fillStyle = '#6cc070'; for (let j = 0; j < 4; j++) ell(c, x + k * 9 * s + (j % 2 ? 8 : -8) * s, y - (30 + j * 18) * s, 12 * s, 3 * s, '#6cc070'); }
  } else if (kind === 3) { // ao sen
    ell(c, x, y - 4 * s, 46 * s, 10 * s, '#4aa3df'); for (let k = 0; k < 3; k++) { ell(c, x - 22 * s + k * 22 * s, y - 6 * s, 10 * s, 4 * s, '#2f9e44'); ell(c, x - 22 * s + k * 22 * s, y - 14 * s, 5 * s, 8 * s, '#f783ac'); }
  } else { // thông + đèn lồng
    c.fillStyle = '#2b6a45'; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x - (30 - k * 7) * s, y - k * 26 * s); c.lineTo(x, y - (k * 26 + 44) * s); c.lineTo(x + (30 - k * 7) * s, y - k * 26 * s); c.fill(); }
    if (seed > .6) { c.fillStyle = '#6b4a2b'; c.fillRect(x + 36 * s, y - 70 * s, 3 * s, 70 * s); ell(c, x + 37 * s, y - 70 * s, 9 * s, 12 * s, '#ef4444'); }
  }
}

function drawPagoda(c, x, y, s) {
  rrect(c, x - 150 * s, y - 14 * s, 300 * s, 14 * s, 3, '#d6c4a0');                 // bậc thềm
  for (let i = 0; i < 4; i++) { rrect(c, x - (150 - i * 14) * s, y - (14 + (i + 1) * 5) * s, (300 - i * 28) * s, 5 * s, 2, '#cdb98f'); }
  let by = y - 34 * s;
  for (let t = 0; t < 4; t++) {                                                       // 4 tầng mái
    const w = (130 - t * 22) * s, h = 46 * s;
    rrect(c, x - w * .8, by - h, w * 1.6, h, 3, '#fff3d6');
    rrect(c, x - 10 * s, by - h * .85, 20 * s, h * .8, 3, '#8b2e1e');
    c.fillStyle = '#c92a2a'; c.beginPath(); c.moveTo(x - w - 10 * s, by - h + 8 * s); c.quadraticCurveTo(x - w * .5, by - h - 6 * s, x, by - h - 22 * s);
    c.quadraticCurveTo(x + w * .5, by - h - 6 * s, x + w + 10 * s, by - h + 8 * s); c.lineTo(x + w * .9, by - h + 14 * s); c.lineTo(x - w * .9, by - h + 14 * s); c.fill();
    c.fillStyle = '#f2b705'; c.fillRect(x - w - 10 * s, by - h + 8 * s, 6 * s, 6 * s); c.fillRect(x + w + 4 * s, by - h + 8 * s, 6 * s, 6 * s);
    by -= h + 8 * s;
  }
  c.fillStyle = '#f2b705'; c.fillRect(x - 2 * s, by - 28 * s, 4 * s, 28 * s); ell(c, x, by - 30 * s, 6 * s, 6 * s, '#f2b705');
}
function drawGate(c, x, y0, y1, s) {
  const rx = x; rrect(c, rx - 6 * s, y0 - 130 * s, 12 * s, y1 - y0 + 150 * s, 3, '#9c2f1d');
  rrect(c, rx + 0 - 6 * s, y0 - 140 * s, 12 * s, 10 * s, 3, '#f2b705');
}

function render() {
  const c = ctx; c.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!me) { c.fillStyle = '#7ad0ff'; c.fillRect(0, 0, W, H); return; }
  const hz = horizon(), rt = roadTop(), rb = roadBot();
  const camX = st.x * PX - W * 0.3;                      // px
  const pal = palAt(clamp(st.x, 0, TRACK));
  const sh = st.shake > 0 ? (Math.random() - .5) * 8 : 0;
  c.save(); c.translate(sh, sh);
  let g = c.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, pal.skyT); g.addColorStop(1, pal.skyB); c.fillStyle = g; c.fillRect(-10, -10, W + 20, hz + 10);
  ell(c, W * 0.8 - camX * 0.01 % 30, H * 0.15, 40, 40, '#fff6c9');
  for (let i = 0; i < 7; i++) { const cx = ((i * 350 - camX * 0.08) % (W + 400) + (W + 400)) % (W + 400) - 200, cy = 40 + hash(i) * hz * .4;
    ell(c, cx, cy, 60, 16, '#ffffffcc'); ell(c, cx + 30, cy - 10, 40, 14, '#ffffffcc'); }
  // núi xa
  c.fillStyle = pal.mtn; c.beginPath(); c.moveTo(-10, hz);
  for (let x = -10; x <= W + 10; x += 16) { const u = x + camX * 0.16; c.lineTo(x, hz - 30 - (Math.sin(u * .004) * 30 + Math.sin(u * .011) * 16 + Math.sin(u * .0021) * 28 + 40)); }
  c.lineTo(W + 10, hz); c.fill();
  // cỏ
  g = c.createLinearGradient(0, hz, 0, H); g.addColorStop(0, pal.grass); g.addColorStop(1, mix('#4f9d3d', '#2f6f3a', .3)); c.fillStyle = g; c.fillRect(-10, hz - 1, W + 20, H - hz + 10);
  // lớp giữa (parallax .5)
  const cell = 150, i0 = Math.floor((camX * 0.5 - 100) / cell), i1 = Math.ceil((camX * 0.5 + W + 100) / cell);
  for (let i = i0; i <= i1; i++) {
    const h1 = hash(i * 7 + 3); if (h1 < 0.25) continue;
    const mpos = (i * cell) / 0.5 / PX, zone = clamp(Math.floor(mpos / 600), 0, 4);
    const kind = zone === 1 ? (h1 > .5 ? 1 : 0) : zone === 3 ? (h1 > .5 ? 3 : 2) : zone;
    drawMidObj(c, kind, i * cell - camX * 0.5 + hash(i) * 60, rt - 6 - hash(i * 3 + 1) * (rt - hz) * .5, 0.75 + hash(i * 5) * .5, hash(i * 11));
  }
  // chùa (parallax 1, ngay sau cổng)
  const tx = TRACK * PX - camX + 260;
  if (tx > -400 && tx < W + 400) drawPagoda(c, tx, rt - 4, 1.35 * clamp(H / 700, .7, 1.1));
  // đường chạy
  g = c.createLinearGradient(0, rt, 0, rb); g.addColorStop(0, '#d8643f'); g.addColorStop(1, '#bd4a2f'); c.fillStyle = g; c.fillRect(-10, rt, W + 20, rb - rt);
  const stripe = 5 * PX; c.fillStyle = '#00000012';
  for (let x = -((camX % (stripe * 2)) + stripe * 2); x < W + stripe; x += stripe * 2) c.fillRect(x, rt, stripe, rb - rt);
  c.fillStyle = '#ffffffcc'; for (let l = 0; l <= 5; l++) c.fillRect(-10, rt + l * (rb - rt) / 5 - 1.5, W + 20, 3);
  // biển cột mốc (mỗi 100 m nhỏ, mỗi 500 m lớn)
  const m0 = Math.floor((camX - 100) / PX / 100) * 100, m1 = (camX + W + 100) / PX;
  for (let m = Math.max(0, m0); m <= Math.min(TRACK, m1); m += 100) {
    const x = m * PX - camX, big = m % 500 === 0;
    c.fillStyle = '#ffffffee'; c.fillRect(x - 1, rt - (big ? 46 : 26), 3, big ? 46 : 26);
    if (big) { rrect(c, x - 30, rt - 70, 60, 24, 6, '#1d2733'); c.fillStyle = '#fff'; c.font = 'bold 14px system-ui'; c.textAlign = 'center'; c.fillText(m === 0 ? 'XUẤT PHÁT' : m + ' m', x, rt - 53); }
  }
  // chướng ngại + vật phẩm (làn giữa)
  const ly = laneY(2), ls = laneScale(2), t = performance.now() / 1000;
  for (const o of obstacles) { const x = o.x * PX - camX; if (x < -80 || x > W + 80 || (o.done && o.hitGone)) continue; drawObstacle(c, o, x, ly, ls, t); }
  for (const it of items) { if (it.got) continue; const x = it.x * PX - camX; if (x < -40 || x > W + 40) continue; drawItem(c, it, x, ly - it.z * ls, t); }
  // người chơi (sắp theo làn)
  const list = [{ lane: 2, me: true }, ...[...players.values()].map((p) => ({ lane: p.lane, p }))].sort((a, b) => a.lane - b.lane);
  for (const e of list) {
    if (e.me) { drawEntity(c, W * 0.3, laneY(2), laneScale(2) * 1.1, { info: { ...me, ver: me.verified ? 1 : 0 }, z: st.z, phase: st.phase, s: st.sprint && st.stam > 4 && !st.rest, m: st.v > 1, bubble: st.bubble, isMe: true, color: tierShirt(me.tier) }); continue; }
    const x = e.p.x * PX - camX; if (x < -120 || x > W + 120) continue;
    drawEntity(c, x, laneY(e.p.lane), laneScale(e.p.lane), { ...e.p, color: shirt(e.p.info.id) });
  }
  // cổng chùa (tiền cảnh)
  const gx = TRACK * PX - camX;
  if (gx > -100 && gx < W + 100) { drawGate(c, gx, rt, rb, 1); rrect(c, gx - 6, rt - 150, 12, 20, 3, '#9c2f1d');
    rrect(c, gx - 90, rt - 170, 180, 44, 10, '#9c2f1d'); c.fillStyle = '#ffe08a'; c.font = 'bold 24px system-ui'; c.textAlign = 'center'; c.fillText('🏯 CHÙA', gx, rt - 140); }
  // hiệu ứng tốc độ
  if (st.v > BASE_SPEED * 1.4) { c.strokeStyle = '#ffffff55'; c.lineWidth = 2; for (let i = 0; i < 10; i++) { const y = rt + hash(i + Math.floor(t * 8)) * (rb - rt), x = hash(i * 9 + Math.floor(t * 8)) * W; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 80, y); c.stroke(); } }
  for (const f of floaters) { const x = f.wx * PX - camX; c.globalAlpha = clamp(f.t, 0, 1); c.fillStyle = '#fff'; c.strokeStyle = '#0008'; c.lineWidth = 3; c.font = 'bold 16px system-ui'; c.textAlign = 'center'; const y = ly - f.wy * ls - (1 - f.t) * 40; c.strokeText(f.text, x, y); c.fillText(f.text, x, y); c.globalAlpha = 1; }
  for (const q of particles) { c.globalAlpha = clamp(q.life, 0, 1); c.fillStyle = q.c; c.fillRect(q.x, q.y, q.sz, q.sz); } c.globalAlpha = 1;
  c.restore();
  renderMini();
}
const shirt = (id) => `hsl(${(id * 47) % 360},75%,55%)`;
const tierShirt = (t) => TIERS[t].color;

function drawObstacle(c, o, x, y, s, t) {
  const k = s * 1.1;
  ell(c, x, y, 20 * k, 6 * k, '#0003');
  if (o.type === 'rock') { c.fillStyle = '#868e96'; c.beginPath(); c.moveTo(x - 20 * k, y); c.lineTo(x - 14 * k, y - 24 * k); c.lineTo(x + 4 * k, y - 32 * k); c.lineTo(x + 20 * k, y - 10 * k); c.lineTo(x + 22 * k, y); c.fill(); c.fillStyle = '#adb5bd'; c.fillRect(x - 6 * k, y - 26 * k, 8 * k, 8 * k); }
  else if (o.type === 'puddle') { ell(c, x, y - 2 * k, 30 * k, 7 * k, '#5aa9e6'); ell(c, x - 6 * k, y - 4 * k, 12 * k, 2 * k, '#cfeaff'); }
  else if (o.type === 'cone') { c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(x - 14 * k, y); c.lineTo(x, y - 30 * k); c.lineTo(x + 14 * k, y); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - 8 * k, y - 14 * k, 16 * k, 5 * k); }
  else if (o.type === 'dog') {
    const wag = Math.sin(t * 14) * 6 * k;
    ell(c, x, y - 14 * k, 22 * k, 11 * k, '#b9824a'); ell(c, x + 20 * k, y - 26 * k, 11 * k, 10 * k, '#c99057');
    c.fillStyle = '#6b3f1d'; c.beginPath(); c.moveTo(x + 15 * k, y - 32 * k); c.lineTo(x + 12 * k, y - 42 * k); c.lineTo(x + 22 * k, y - 34 * k); c.fill();
    ell(c, x + 25 * k, y - 27 * k, 2 * k, 2 * k, '#000'); ell(c, x + 31 * k, y - 24 * k, 3 * k, 2.5 * k, '#222');
    c.strokeStyle = '#b9824a'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(x - 20 * k, y - 18 * k); c.lineTo(x - 30 * k, y - 28 * k + wag); c.stroke();
    c.lineWidth = 4 * k; c.strokeStyle = '#a06a38'; c.beginPath(); c.moveTo(x - 10 * k, y - 8 * k); c.lineTo(x - 10 * k, y); c.moveTo(x + 10 * k, y - 8 * k); c.lineTo(x + 10 * k, y); c.stroke();
  } else { // trâu
    ell(c, x, y - 28 * k, 36 * k, 20 * k, '#5b6770'); ell(c, x + 34 * k, y - 34 * k, 14 * k, 12 * k, '#6c7983');
    c.strokeStyle = '#e9e1cf'; c.lineWidth = 4 * k; c.beginPath(); c.arc(x + 38 * k, y - 46 * k, 10 * k, Math.PI * .9, Math.PI * 1.9); c.stroke();
    ell(c, x + 40 * k, y - 35 * k, 2 * k, 2 * k, '#000');
    c.strokeStyle = '#4b555d'; c.lineWidth = 7 * k; c.beginPath(); c.moveTo(x - 18 * k, y - 14 * k); c.lineTo(x - 18 * k, y); c.moveTo(x + 18 * k, y - 14 * k); c.lineTo(x + 18 * k, y); c.stroke();
  }
}
function drawItem(c, it, x, y, t) {
  const bob = Math.sin(t * 4 + it.x) * 3;
  if (it.type === 'coin') { const w = Math.abs(Math.cos(t * 3 + it.x)) * 9 + 3; ell(c, x, y + bob, w, 10, '#f5b700'); ell(c, x, y + bob, w * .55, 6, '#ffd84d'); }
  else if (it.type === 'bottle') { rrect(c, x - 6, y - 24 + bob, 12, 24, 4, '#4cc3ff'); rrect(c, x - 3, y - 30 + bob, 6, 7, 2, '#1c7ed6'); c.fillStyle = '#fff8'; c.fillRect(x - 3, y - 18 + bob, 3, 10); }
  else { for (let a = -2; a <= 2; a++) { c.fillStyle = '#f783ac'; c.beginPath(); c.ellipse(x + a * 6, y - 12 + bob - Math.abs(a) * 2, 5, 12, a * .3, 0, 7); c.fill(); } ell(c, x, y + bob, 18, 5, '#2f9e44'); }
}

function drawEntity(c, x, y, s, p) {
  const info = p.info, T = TIERS[info.tier], z = p.z || 0;
  drawRunner(c, x, y, s, { color: p.color, hat: info.hat, phase: p.phase, z, sprint: p.s, moving: p.m, tier: info.tier, isMe: p.isMe });
  // ---- huy hiệu sức mạnh trên đầu ----
  const top = y - z * s - 98 * s - (info.hat === 'nonla' || info.hat === 'crown' ? 14 * s : 0);
  const text = `${T.icon} ${Number(info.km).toFixed(1)} km`, mark = info.ver ? ' ✓' : ' ✎';
  const fs = p.isMe ? 16 : 14;
  c.font = `800 ${fs}px system-ui`; const w = c.measureText(text + mark).width + 16;
  if (info.tier >= 3) { c.shadowColor = T.color; c.shadowBlur = 14; }
  rrect(c, x - w / 2, top - 22, w, 22, 11, T.color); c.shadowBlur = 0;
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(text + mark, x, top - 6);
  c.font = `700 ${p.isMe ? 14 : 12}px system-ui`; c.strokeStyle = '#000a'; c.lineWidth = 3;
  c.strokeText(info.name, x, top - 28); c.fillStyle = p.isMe ? '#ffe066' : '#fff'; c.fillText(info.name, x, top - 28);
  if (p.bubble) {
    c.font = '600 13px system-ui'; const bw = c.measureText(p.bubble.text).width + 16;
    rrect(c, x - bw / 2, top - 68, bw, 24, 10, '#fff'); c.fillStyle = '#1d2733'; c.fillText(p.bubble.text, x, top - 52);
  }
}
function drawRunner(c, x, y, s, o) {
  const lift = o.z * s, by = y - lift;
  ell(c, x, y, 18 * s * (1 - clamp(lift / 220, 0, .5)), 6 * s, '#0004');
  if (o.tier >= 3) { // hào quang cho hạng cao
    const T = TIERS[o.tier]; const g = c.createRadialGradient(x, by - 36 * s, 4, x, by - 36 * s, 56 * s);
    g.addColorStop(0, T.color + '88'); g.addColorStop(1, T.color + '00'); c.fillStyle = g; c.fillRect(x - 60 * s, by - 100 * s, 120 * s, 120 * s);
    if (o.moving) for (let i = 1; i <= 3; i++) { c.globalAlpha = .25 / i; ell(c, x - i * 16 * s, by - 34 * s, 8 * s, 18 * s, T.color); } c.globalAlpha = 1;
  }
  const air = lift > 2, sw = air ? .8 : o.moving ? Math.sin(o.phase) : 0, sw2 = air ? -.6 : o.moving ? Math.sin(o.phase + Math.PI) : 0;
  c.lineCap = 'round';
  const leg = (a, col) => { c.strokeStyle = col; c.lineWidth = 7 * s; const hx = x, hy = by - 24 * s, kx = hx + Math.sin(a) * 12 * s, ky = hy + 12 * s - Math.abs(Math.sin(a)) * 3 * s; c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(kx - Math.sin(a) * (a < 0 ? -8 : 10) * s - 4 * s * (a > 0 ? 0 : 1), ky + 11 * s); c.stroke(); ell(c, kx - Math.sin(a) * 6 * s + 4 * s, ky + 12 * s, 7 * s, 3.5 * s, '#fff'); };
  leg(sw2, '#2b2d42');
  // tay sau
  c.strokeStyle = '#f2c9a0'; c.lineWidth = 5 * s; c.beginPath(); c.moveTo(x, by - 44 * s); c.lineTo(x + Math.sin(sw2) * 14 * s, by - 32 * s + Math.abs(Math.cos(sw2)) * 2 * s); c.stroke();
  rrect(c, x - 10 * s, by - 50 * s, 20 * s, 28 * s, 7 * s, o.color);
  rrect(c, x - 5 * s, by - 44 * s, 10 * s, 10 * s, 2, '#fffe');
  leg(sw, '#1b1d30');
  c.strokeStyle = '#f2c9a0'; c.lineWidth = 5 * s; c.beginPath(); c.moveTo(x, by - 44 * s); c.lineTo(x + Math.sin(sw) * 14 * s, by - 32 * s + Math.abs(Math.cos(sw)) * 2 * s); c.stroke();
  ell(c, x, by - 60 * s, 10 * s, 10.5 * s, '#f5cfa5');
  c.fillStyle = '#1f1f1f'; c.beginPath(); c.arc(x, by - 62 * s, 10.5 * s, Math.PI, 0); c.fill();
  ell(c, x + 4 * s, by - 59 * s, 1.8 * s, 2.2 * s, '#111');
  if (o.sprint) { ell(c, x + 7 * s, by - 55 * s, 2 * s, 1.2 * s, '#e03131'); }
  drawHat(c, o.hat, x, by - 60 * s, s);
}
function drawHat(c, hat, x, y, s) {
  if (hat === 'nonla') { c.fillStyle = '#ecd58e'; c.beginPath(); c.moveTo(x - 20 * s, y - 6 * s); c.lineTo(x, y - 30 * s); c.lineTo(x + 20 * s, y - 6 * s); c.closePath(); c.fill(); c.strokeStyle = '#c4a95a'; c.lineWidth = 1.5 * s; c.beginPath(); c.moveTo(x - 10 * s, y - 14 * s); c.lineTo(x + 10 * s, y - 14 * s); c.stroke(); }
  else if (hat === 'bando') { c.fillStyle = '#e03131'; c.fillRect(x - 10.5 * s, y - 8 * s, 21 * s, 4 * s); c.beginPath(); c.moveTo(x - 10 * s, y - 6 * s); c.lineTo(x - 20 * s, y - 2 * s); c.lineTo(x - 14 * s, y - 10 * s); c.fill(); }
  else if (hat === 'cap') { c.fillStyle = '#1971c2'; c.beginPath(); c.arc(x, y - 6 * s, 11 * s, Math.PI, 0); c.fill(); c.fillRect(x - 1 * s, y - 7 * s, 18 * s, 3.5 * s); }
  else if (hat === 'neko') { c.fillStyle = '#ffb3c7'; c.beginPath(); c.moveTo(x - 10 * s, y - 6 * s); c.lineTo(x - 8 * s, y - 22 * s); c.lineTo(x - 1 * s, y - 9 * s); c.moveTo(x + 10 * s, y - 6 * s); c.lineTo(x + 8 * s, y - 22 * s); c.lineTo(x + 1 * s, y - 9 * s); c.fill(); c.fillStyle = '#222'; c.fillRect(x - 9 * s, y - 10 * s, 18 * s, 3 * s); }
  else if (hat === 'crown') { c.fillStyle = '#f5b700'; c.beginPath(); c.moveTo(x - 11 * s, y - 7 * s); c.lineTo(x - 12 * s, y - 22 * s); c.lineTo(x - 5 * s, y - 14 * s); c.lineTo(x, y - 25 * s); c.lineTo(x + 5 * s, y - 14 * s); c.lineTo(x + 12 * s, y - 22 * s); c.lineTo(x + 11 * s, y - 7 * s); c.fill(); ell(c, x, y - 12 * s, 2 * s, 2 * s, '#e03131'); }
}

function renderMini() {
  const c = mctx, w = mmc.width, h = mmc.height; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const pad = 22 * DPR, X = (m) => pad + (m / TRACK) * (w - pad * 2), y = h / 2;
  c.fillStyle = '#0003'; c.fillRect(pad, y - 2 * DPR, w - pad * 2, 4 * DPR);
  c.fillStyle = '#fc4c02'; c.fillRect(pad, y - 2 * DPR, X(st.x) - pad, 4 * DPR);
  c.font = `${14 * DPR}px system-ui`; c.textAlign = 'center'; c.fillText('🏃', pad - 8 * DPR, y + 5 * DPR); c.fillText('🏯', w - pad + 8 * DPR, y + 5 * DPR);
  for (const p of players.values()) { c.fillStyle = TIERS[p.info.tier].color; c.beginPath(); c.arc(X(p.x), y, 4 * DPR, 0, 7); c.fill(); }
  c.fillStyle = '#fff'; c.strokeStyle = TIERS[me.tier].color; c.lineWidth = 3 * DPR; c.beginPath(); c.arc(X(st.x), y, 7 * DPR, 0, 7); c.fill(); c.stroke();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render(); requestAnimationFrame(loop);
}

// ---------- Khởi động ----------
(async function boot() {
  resize();
  try { cfg = await api('/api/config'); } catch { /* giữ mặc định */ }
  requestAnimationFrame(loop);
  const j = await api('/api/me').catch(() => ({ me: null }));
  if (j.me) start(j.me); else showLogin();
})();
window.__game = { st, players, get me() { return me; } }; // hỗ trợ kiểm thử
})();
