import { Store, api, dayOf } from './store.js';
import { Game } from './game.js';
import { sfx } from './sound.js';
import { gpsCourse } from './gpsworld.js';
import { GpsPicker } from './gpspicker.js';
import { createTournamentUI } from './tournaments.js';
import { medalSvg, MEDAL_NAMES } from './medal.js';
const S = window.Shared, MAPS = S.MAPS, R = S.RULES;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = new Store();
let cfg = { strava: false, mock: false, tiles: {} }, game = null, ws = null, wsTimer = 0, flushTimer = 0, posTimer = 0, tours = null, picker = null, cur = null, sessionCoins = 0, coinBase = 0;
let sel = { kind: 'sim', map: MAPS[0], dist: 5000, mode: 'manual', route: null, view: '3d' };
let pendingTour = null;
const GOAL_KM = 5;

let toastT;
const TOUCH = matchMedia('(pointer:coarse)').matches;   // điện thoại/tablet: chỉ dùng chạm, không cần bàn phím
function toast(t, ms = 2000) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), ms); }
const fmtTime = (s) => { if (s == null) return '--:--'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(ss).padStart(2, '0'); };
const fmtPace = (p) => (p > 0 && p < 60 ? Math.floor(p) + ':' + String(Math.round((p % 1) * 60) % 60).padStart(2, '0') : '--:--');
const tierPill = (tier) => { const T = S.TIERS[tier]; return `<span class="pill" style="background:${T.color}">${T.icon} ${T.name}</span>`; };
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const ITEM_ICON = (items = {}) => [...Object.entries(S.ITEMS).filter(([k]) => items[k]).map(([k, v]) => v.icon + items[k]), items.coin ? S.COIN.ICON + items.coin : ''].filter(Boolean).join(' ') || '–';

// ---------- màn hình ----------
function show(name) { for (const id of ['entry', 'lobby', 'tour']) $('#scr-' + id).hidden = id !== name; $('#hud').hidden = name !== 'game'; if (name === 'lobby') { renderLobby(); } }
function showErr(m) { const e = $('#err'); e.hidden = !m; e.textContent = m || ''; }

// ----- đăng nhập / khách -----
$('#entry-tabs').onclick = (e) => {
  const t = e.target.dataset.t; if (!t) return; showErr('');
  document.querySelectorAll('#entry-tabs button').forEach((b) => b.classList.toggle('on', b === e.target));
  for (const k of ['login', 'register', 'guest']) $('#f-' + k).hidden = k !== t;
};
async function afterAuth() {
  const gs = store.guestSummary();
  if (store.mode === 'account' && gs && !store.me.imported && (gs.km > 0 || gs.coins > 0)) {
    await new Promise((resolve) => {
      openModal(`<h2>Gộp dữ liệu khách?</h2><p class="sub">Máy này đang lưu dữ liệu chơi khách: <b>${gs.km} km</b>, ${gs.days} ngày, ${gs.coins} xu, ${gs.owned} vật phẩm đã mua. Gộp vào tài khoản <b>${esc(store.me.name)}</b> để không mất.</p>
        <p class="hint">Dữ liệu khách do máy bạn tự lưu nên server chỉ nhận trong giới hạn hợp lý (nhịp bước, số xu tương ứng quãng đường), và phần km gộp không tính vào bảng xếp hạng chung. Chỉ gộp được một lần cho mỗi tài khoản.</p>
        <div class="seg"><button id="mg-yes" class="on">Gộp vào tài khoản</button><button id="mg-no">Bỏ qua</button></div>`);
      modalCb = resolve;
      $('#mg-yes').onclick = async () => { try { const r = await store.mergeGuest(); toast(`Đã gộp ${r.imported.km} km vào tài khoản ✓`, 3000); } catch (e) { toast(e.message, 3500); } closeModal(); };
      $('#mg-no').onclick = () => closeModal();
    });
  }
  enterLobby();
}
$('#f-login').onsubmit = async (e) => { e.preventDefault(); showErr(''); try { await store.login($('#l-user').value, $('#l-pass').value, false); await afterAuth(); } catch (er) { showErr(er.message); } };
$('#f-register').onsubmit = async (e) => { e.preventDefault(); showErr(''); try { await store.login($('#r-user').value, $('#r-pass').value, true, $('#r-name').value); await afterAuth(); } catch (er) { showErr(er.message); } };
$('#f-guest').onsubmit = (e) => { e.preventDefault(); store.startGuest($('#g-name').value); enterLobby(); };

// ----- sảnh -----
function drawElev(cv, map, cur) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, L = map.km * 1000, pad = 4; x.clearRect(0, 0, w, h);
  if (map.kind === 'gps') return;
  let lo = Infinity, hi = -Infinity; for (let s = 0; s <= L; s += L / 80) { const e = S.elevAt(map, s); lo = Math.min(lo, e); hi = Math.max(hi, e); }
  const span = Math.max(30, hi - lo), X = (s) => pad + s / L * (w - 2 * pad), Y = (e) => h - pad - (e - lo) / span * (h - 2 * pad - 6);
  x.beginPath(); x.moveTo(X(0), h); for (let s = 0; s <= L; s += L / 80) x.lineTo(X(s), Y(S.elevAt(map, s))); x.lineTo(X(L), h); x.closePath(); x.fillStyle = '#e0752f55'; x.fill();
  x.strokeStyle = '#ffb257'; x.lineWidth = 2; x.beginPath(); for (let s = 0; s <= L; s += L / 80) { const f = s ? x.lineTo : x.moveTo; f.call(x, X(s), Y(S.elevAt(map, s))); } x.stroke();
  if (cur != null) { x.fillStyle = '#fff'; x.beginPath(); x.arc(X(Math.min(cur, L)), Y(S.elevAt(map, cur)), 4.5, 0, 7); x.fill(); }
}
const SKY = { hanoi: ['#9fd0f0', '#8cc96b'], saigon: ['#a9cbe4', '#8dc46a'], danang: ['#7cc5f0', '#3d9fc9'], halong: ['#a6dcea', '#4aa3c4'], trangan: ['#cfe0b8', '#9ed066'], mocchau: ['#c5dccb', '#7cbf5c'], haivan: ['#a5c7e0', '#7db561'], prenn: ['#b6c8c4', '#2f7a49'], oquyho: ['#b9cde0', '#78b05a'], mapileng: ['#d4d4c8', '#a79a84'] };
function renderLobby() {
  const p = store.profile(); coinBase = p.coins || 0;
  $('#who-name').innerHTML = (p.avatar ? `<img class="avs" src="${esc(p.avatar)}" alt="">` : '') + esc(p.name); $('#who-tier').innerHTML = tierPill(p.tier ?? S.tierIndex(p.totals.totalKm));
  $('#who-stats').innerHTML = `<div class="stat"><b>${p.totals.gameKm.toFixed(1)}</b>km trong game</div><div class="stat real"><b>${p.totals.realKm.toFixed(1)}</b>km ngoài đời 👟</div><div class="stat tot"><b>${p.totals.totalKm.toFixed(1)}</b>tổng km</div><div class="stat coin"><b><span class="gc"></span> ${p.coins || 0}</b>xu</div>`;
  const g = p.today.gameKm, r = p.today.realKm, tot = g + r, pct = (v) => Math.min(100, v / GOAL_KM * 100);
  $('#goal').innerHTML = `<b>Mục tiêu hôm nay: ${tot.toFixed(1)} / ${GOAL_KM} km</b> ${tot >= GOAL_KM ? '✅' : ''}
    <div class="gb"><i class="g" style="width:${pct(g)}%"></i><i class="r" style="width:${Math.min(pct(r), 100 - pct(g))}%"></i></div>
    <span style="color:var(--acc)">■</span> trong game ${g.toFixed(1)} km &nbsp; <span style="color:var(--ok)">■</span> chạy ngoài đời ${r.toFixed(1)} km
    ${p.mode === 'guest' ? '<div class="hint">Khách: km ngoài đời = 0. Tạo tài khoản (dữ liệu khách sẽ được gộp) và kết nối Strava để cộng km chạy thật + nhận nhiều xu hơn.</div>'
      : !p.stravaLinked ? `<div class="hint">Chưa kết nối Strava nên km ngoài đời = 0. Mỗi km chạy thật được ${S.COIN.PER_KM_REAL} xu (trong game: ${S.COIN.PER_KM_GAME} xu/km).</div>` : ''}`;
}
function renderMaps() {
  $('#mapgrid').innerHTML = MAPS.map((m) => `<button class="mcard ${m === sel.map ? 'on' : ''}" data-id="${m.id}"><canvas class="thumb" width="420" height="156" data-id="${m.id}"></canvas>
    <span class="info"><b>${esc(m.name)}</b><span>${esc(m.place)} · ${m.km} km</span><br><span class="stars">${stars(m.diff)}</span></span></button>`).join('');
  document.querySelectorAll('.thumb').forEach((cv) => {
    const m = MAPS.find((x) => x.id === cv.dataset.id), x = cv.getContext('2d'), c = SKY[m.theme];
    const g = x.createLinearGradient(0, 0, 0, 156); g.addColorStop(0, c[0]); g.addColorStop(0.55, c[0]); g.addColorStop(0.56, c[1]); g.addColorStop(1, c[1]); x.fillStyle = g; x.fillRect(0, 0, 420, 156);
    x.fillStyle = '#ffffff55'; x.beginPath(); x.moveTo(0, 156); x.lineTo(0, 100); for (let i = 0; i <= 20; i++) x.lineTo(i * 21, 100 - Math.max(0, (S.elevAt(m, i / 20 * m.km * 1000) - S.elevAt(m, 0)) / Math.max(40, S.stats(m).gain) * 60) - 10 * Math.sin(i * 1.7)); x.lineTo(420, 156); x.fill();
    x.strokeStyle = '#4b4d55'; x.lineWidth = 34; x.lineCap = 'round'; x.beginPath(); x.moveTo(-10, 140); x.bezierCurveTo(120, 120, 150, 70, 250, 78); x.bezierCurveTo(330, 84, 360, 40, 440, 30); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([14, 12]); x.stroke(); x.setLineDash([]);
  });
}
function curCourse() { return sel.kind === 'gps' ? (sel.route ? gpsCourse(sel.route, 'gps') : null) : sel.map; }
function renderSetup() {
  const c = curCourse(), gps = sel.kind === 'gps';
  $('#s-name').textContent = gps ? (c ? c.name : 'Chạy GPS') : `${c.name} · ${c.place}`;
  $('#s-desc').textContent = gps ? (c ? `Tuyến đi bộ ${c.km} km. Nhân vật chạy ảo dọc tuyến này trên ${c.style === 'sat' ? 'ảnh vệ tinh' : 'bản đồ 2D'}.` : 'Chọn điểm xuất phát và điểm đến ở bên trái.') : c.desc;
  $('#s-ref').textContent = gps ? 'Vị trí thật chỉ dùng để chọn điểm xuất phát, không theo dõi liên tục.' : c.ref + '. ' + (c.real ? (c.source === 'gpx' ? 'Đường chạy và độ cao từ GPX chính thức.' : 'Đường chạy từ OpenStreetMap, độ cao SRTM 30 m (chưa phải GPX chính thức).') : 'Độ cao là xấp xỉ.');
  $('#s-prof').hidden = gps;
  if (!gps) drawElev($('#s-prof'), c);
  if (!c) { $('#s-kv').innerHTML = ''; $('#s-dist').innerHTML = ''; $('#s-go').disabled = true; return; }
  $('#s-go').disabled = false;
  const st = gps ? null : S.stats(c);
  $('#s-kv').innerHTML = gps ? `<div>Dài<b>${c.km} km</b></div><div>Hiển thị<b>${c.style === 'sat' ? 'Vệ tinh' : '2D'}</b></div><div>Làn<b>4 làn</b></div>`
    : `<div>Độ khó<b class="stars">${stars(c.diff)}</b></div><div>Dài<b>${c.km} km</b></div><div>Tổng leo<b>${st.gain} m</b></div><div>Dốc tối đa<b>${st.maxGrade}%</b></div><div>Đỉnh<b>${Math.round(Math.max(...c.elev.map((e) => e[1])))} m</b></div><div>Làn<b>4 làn</b></div>`;
  const opts = [1, 3, 5, 10].filter((d) => d < c.km).concat([c.km]);
  if (!opts.includes(sel.dist / 1000)) sel.dist = opts.includes(5) ? 5000 : opts[opts.length - 1] * 1000;
  $('#s-dist').innerHTML = opts.map((d) => `<button data-d="${d}" class="${d * 1000 === sel.dist ? 'on' : ''}">${d === c.km ? 'Cả tuyến ' + d : d} km</button>`).join('');
  document.querySelectorAll('#s-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === sel.mode));
  const canView = !gps && c.real; $('#s-viewbox').hidden = !canView; if (!canView) sel.view = '3d';
  document.querySelectorAll('#s-view button').forEach((b) => b.classList.toggle('on', b.dataset.v === sel.view));
  $('#s-viewhint').textContent = sel.view === '3d' ? 'Cảnh 3D dựng theo đường thật (có độ cao, vách, vực, biển).' : 'Ảnh bản đồ phẳng trải dưới đường chạy; độ dốc và thể lực vẫn tính theo độ cao thật. Cần mạng để tải ảnh bản đồ.';
  $('#s-modehint').textContent = sel.mode === 'auto' ? `Tự động: ${R.AUTO_STEPS_PER_SEC} bước/giây (${(R.STRIDE * R.AUTO_STEPS_PER_SEC * 3.6).toFixed(1).replace('.', ',')} km/h), tự nhảy qua chướng ngại trong làn của bạn. Khoảng ${fmtTime(sel.dist / (R.STRIDE * R.AUTO_STEPS_PER_SEC))} cho cự ly này. Vẫn đổi làn, dùng vật phẩm được.`
    : TOUCH ? 'Thủ công: chạm màn hình = 1 bước, nút NHẢY = nhảy, vuốt ngang hoặc nút ◀ ▶ để đổi làn. Tối đa 4 bước/giây. Có thể chuyển sang Tự động bất cứ lúc nào.'
      : 'Thủ công: Space hoặc nhấp chuột = 1 bước, J hoặc ↑ = nhảy, ←/→ đổi làn. Tối đa 4 bước/giây. Có thể chuyển sang Tự động bất cứ lúc nào.';
}
$('#mapgrid').onclick = (e) => { const b = e.target.closest('.mcard'); if (!b) return; sel.map = MAPS.find((m) => m.id === b.dataset.id); renderMaps(); renderSetup(); };
$('#s-dist').onclick = (e) => { const d = e.target.dataset.d; if (d) { sel.dist = +d * 1000; renderSetup(); } };
$('#s-view').onclick = (e) => { const v = e.target.dataset.v; if (!v) return; sel.view = v; renderSetup(); if (v !== '3d') { const m = sel.map, el = $('#s-prefetch'); el.textContent = 'Đang chuẩn bị ảnh bản đồ…'; prefetchMap(m, v, (d, n, f, fin) => { if (sel.map === m && sel.view === v) el.textContent = fin ? '✓ Ảnh bản đồ đã sẵn sàng trên thiết bị (chỉ tải lại khi đổi phiên bản).' : `Đang tải ảnh bản đồ ${d}/${n}…`; }).then(() => { if (sel.map === m && sel.view === v && !el.textContent.startsWith('Đang tải')) el.textContent = '✓ Ảnh bản đồ đã sẵn sàng trên thiết bị.'; }); } else $('#s-prefetch').textContent = ''; };
$('#s-mode').onclick = (e) => { const m = e.target.dataset.m; if (m) { sel.mode = m; renderSetup(); } };
$('#kind-tabs').onclick = (e) => {
  const k = e.target.dataset.k; if (!k) return; sel.kind = k;
  document.querySelectorAll('#kind-tabs button').forEach((b) => b.classList.toggle('on', b === e.target));
  $('#mapgrid').hidden = k !== 'sim'; $('#gps-box').hidden = k !== 'gps';
  if (k === 'gps' && !picker) picker = new GpsPicker($('#gps-box'), { cfg, toast, onChange: (r) => { sel.route = r; renderSetup(); } });
  if (k === 'gps') picker.refresh();
  renderSetup();
};
function enterLobby() {
  show('lobby'); renderMaps(); renderSetup();
  if (pendingTour) { const c = pendingTour; pendingTour = null; tours.open(c); }
}
$('#s-go').onclick = () => startFree();
const getMode = () => sel.mode; const setMode = (m) => { sel.mode = m; };

// ----- chạy -----
let invPending = null, invRaf = 0, tickT = 0;
function ensureGame() {
  if (game) return game;
  game = new Game($('#c'), {
    onHud: updateHud,
    onEvent: (text, ms = 2000) => { const t = $('#ticker'); t.textContent = text; clearTimeout(t._t); t._t = setTimeout(() => { t.textContent = ''; }, ms + 2000); if (/Chó|Gâu|Hết thể lực/.test(text)) banner(text, ms); },
    onInventory: (inv) => { invPending = inv; if (!invRaf) invRaf = requestAnimationFrame(() => { invRaf = 0; renderInv(invPending); store.saveInventory(invPending); }); },      // gộp cập nhật túi đồ theo khung hình
    onCoin: (n) => { sessionCoins += n; },
    onTarget: (t) => showTarget(t),
    onAct: (k, to) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'act', k, to })); },
    onTicker: (txt) => { $('#ticker').textContent = txt; clearTimeout(tickT); tickT = setTimeout(() => { $('#ticker').textContent = ''; }, 3500); },
    onFinish: (sum) => finishRun(sum)
  }, cfg);
  if (window.__chayDebug) window.__game = game;      // chỉ để kiểm thử tự động
  return game;
}
let bannerT; function banner(t, ms) { const b = $('#banner'); b.textContent = t; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, ms); }
function roomOf(course) { if (course.kind !== 'gps') return null; const f = course.pts[0], t = course.pts[course.pts.length - 1]; return `gps:${f[0].toFixed(3)},${f[1].toFixed(3)},${t[0].toFixed(3)},${t[1].toFixed(3)}`; }
async function startFree() {
  const course = curCourse(); if (!course) return toast('Hãy chọn tuyến GPS trước');
  $('#s-go').disabled = true;
  try { await store.startRun(course.kind === 'gps' ? 'gps' : course.id, sel.dist, sel.mode); await launch({ course, dist: sel.dist, mode: sel.mode, room: roomOf(course), tour: null, view: sel.view }); }
  finally { $('#s-go').disabled = false; }
}
async function launchTour(t, catId, mode) {
  const cat = t.cats.find((c) => c.id === catId), info = await store.startTourRun(t.code, catId, mode);
  const course = info.kind === 'sim' ? MAPS.find((m) => m.id === info.map) : gpsCourse(info.route, 't' + t.code);
  tours.cancelReady(); tours.stop();
  await launch({ course, dist: info.dist, mode, seed: info.seed, room: 't:' + t.code, tour: { code: t.code, title: t.title, cat: catId, km: cat.km }, view: info.kind === 'sim' ? (info.view || '3d') : '3d' });
  api(`/api/tournaments/${t.code}/go`, { runId: store.runId }).catch(() => {});      // bắt đầu tính giờ
}
async function ensureRoute(course) { if (course.real && !course.route) { try { const r = await fetch(`/courses/${course.id}.json`); if (r.ok) course.route = await r.json(); } catch { /* dựng theo hồ sơ độ cao */ } } return course.route; }
// Tải trước ảnh bản đồ của một tuyến (z18, dải rộng ±1 ô quanh đường): server lưu một lần, trình duyệt giữ lại, chỉ tải lại khi đổi phiên bản
const prefetching = new Set();
function tilesOf(route, style) {
  const z = 18, n = 2 ** z, set = new Map(), tpl = cfg.tiles[style];
  for (let i = 0; i < route.pts.length; i += 3) {
    const [lat, lon] = route.pts[i], x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) set.set((x + dx) + ',' + (y + dy), tpl.replace('{z}', z).replace('{x}', x + dx).replace('{y}', y + dy));
  }
  return [...set.values()];
}
async function prefetchMap(map, style, onProgress) {
  const key = `tiles:${map.id}:${style}:${cfg.tiles.version}`, tag = key;
  try { if (localStorage.getItem(key) || prefetching.has(tag)) return; } catch { /* không có localStorage */ }
  const route = await ensureRoute(map); if (!route || !cfg.tiles[style]) return;
  const urls = tilesOf(route, style); prefetching.add(tag); let done = 0, fail = 0, i = 0;
  const worker = async () => { while (i < urls.length) { const u = urls[i++]; try { const r = await fetch(u); if (!r.ok) fail++; else await r.blob(); } catch { fail++; } done++; onProgress && onProgress(done, urls.length, fail); } };
  await Promise.all(Array.from({ length: 6 }, worker)); prefetching.delete(tag);
  if (fail < urls.length * 0.05) { try { localStorage.setItem(key, '1'); } catch { /* bỏ qua */ } }
  onProgress && onProgress(done, urls.length, fail, true);
}
async function launch({ course, dist, mode, seed, room, tour, view = '3d' }) {
  await ensureRoute(course);
  const g = ensureGame(); sel.mode = mode; sessionCoins = 0; coinBase = store.profile().coins || 0; cur = { course, dist, mode, seed, room, tour };
  show('game');
  g.load(course, dist, mode, store.profile(), seed, view);
  $('#h-map').textContent = tour ? `🏅 ${tour.title}` : course.name; $('#h-auto').checked = mode === 'auto'; renderInv(g.inv);
  $('#h-elev').hidden = course.kind === 'gps'; const imgStyle = course.kind === 'gps' ? course.style : g.view; $('#attr').textContent = imgStyle === 'sat' ? cfg.tiles.attrSat : imgStyle === 'road' ? cfg.tiles.attrRoad : '';
  $('#ticker').textContent = ''; $('#banner').hidden = true; $('#h-coins').innerHTML = '<span class="gc"></span> ' + coinBase;
  g.peace = peaceOn; $('#b-map').hidden = !g.world.bbox;
  if (mode !== 'auto') toast(TOUCH ? (padOn ? 'Chạm màn hình để chạy · nút NHẢY để nhảy' : 'Chạm/giữ = chạy · vuốt ◀ ▶ = đổi làn · vuốt ↓ = trượt · vuốt ↑ = nhảy') : 'Space hoặc nhấp chuột để chạy · J hoặc ↑ để nhảy', 3500);
  connectWs(course, room); clearInterval(flushTimer); flushTimer = setInterval(() => doFlush(false), 15000);
}
async function doFlush(done, finished) { if (!game || !game.st) return null; store.record(game.takeDelta()); return store.flush(done, finished); }
// ----- tương tác (trêu / đấm / đá) -----
const ACT_CD = { tease: 1500, punch: 2500, kick: 3500 };
function showTarget(t) {
  const box = $('#social'); box.hidden = !t; if (!t) return;
  $('#sc-name').textContent = `🎯 ${t.name}`; $('#sc-punch').disabled = $('#sc-kick').disabled = !t.melee;
}
for (const [id, k] of [['sc-tease', 'tease'], ['sc-punch', 'punch'], ['sc-kick', 'kick']]) {
  $('#' + id).addEventListener('pointerdown', (e) => { e.preventDefault(); const b = e.currentTarget; if (!game || b.classList.contains('cd')) return; if (game.interact(k)) { b.classList.add('cd'); setTimeout(() => b.classList.remove('cd'), ACT_CD[k]); } });
}
let peaceOn = false; try { peaceOn = localStorage.getItem('chay.peace') === '1'; } catch { /* bỏ */ }
const applyPeace = () => { $('#b-peace').classList.toggle('on', peaceOn); if (game) { game.peace = peaceOn; } if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'peace', on: peaceOn })); };
$('#b-peace').onclick = () => { peaceOn = !peaceOn; try { localStorage.setItem('chay.peace', peaceOn ? '1' : '0'); } catch { /* bỏ */ } applyPeace(); toast(peaceOn ? '🕊 Hòa bình: bạn không trêu/đánh và cũng không bị trêu/đánh' : '😜 Đã bật tương tác trêu/đấm/đá', 2200); };
$('#b-peace').classList.toggle('on', peaceOn);
function stopRun() { $('#social').hidden = true; clearInterval(flushTimer); clearInterval(posTimer); clearTimeout(wsTimer); if (ws) { ws.onclose = null; ws.close(); ws = null; } if (game) game.dispose(); }
async function exitRun() {
  const t = cur && cur.tour;
  await doFlush(!!t, false); stopRun();
  if (t) tours.open(t.code); else enterLobby();
}
async function finishRun(sum) {
  const t = cur && cur.tour, r = await doFlush(true, true), p = store.profile();
  const result = t ? `<p class="sub">🏅 ${esc(t.title)} · ${t.km} km</p>${r && r.finished ? `<p>Kết quả ghi nhận: <b>${fmtTime(r.timeS)}</b> (thời gian do server đo từ lúc xuất phát).</p>` : '<p class="hint">Kết quả chưa được ghi nhận (nhịp bước không hợp lệ hoặc mất kết nối).</p>'}` : `<p class="sub">${esc(sum.map.name)} · ${(sum.dist / 1000).toFixed(1)} km</p>`;
  openModal(`<h2>${p.avatar ? `<img class="avs" src="${esc(p.avatar)}" alt="">` : ''}🎉 Về đích!</h2>${result}
    <div class="sumgrid"><div>Thời gian<b>${fmtTime(sum.time)}</b></div><div>Số bước<b>${sum.steps}</b></div><div>Pace TB<b>${fmtPace(sum.time / 60 / (sum.dist / 1000))}/km</b></div><div>Nhảy qua<b>${sum.jumps}</b></div><div>Bị chó cắn<b>${sum.bites}</b></div><div>Vật phẩm<b style="font-size:15px">${ITEM_ICON(sum.items)}</b></div></div>
    <p class="hint">Tổng km tích lũy: <b>${p.totals.totalKm.toFixed(1)} km</b> · <span class="gc"></span> ${p.coins || 0} xu (+${S.COIN.FINISH} xu thưởng về đích).</p>
    <div class="seg">${t ? '<button id="tobr" class="on">Xem bảng xếp hạng</button>' : '<button id="again" class="on">Chạy lại</button>'}<button id="tolobby">Về sảnh</button></div>`);
  // luôn thoát được khỏi bảng kết quả, kể cả khi bước kế tiếp lỗi (mạng yếu...)
  const safe = (fn) => async () => { try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Có lỗi, về sảnh', 3000); try { stopRun(); } catch { /* bỏ */ } enterLobby(); } };
  if (t) $('#tobr').onclick = safe(() => { closeModal(); stopRun(); tours.open(t.code); }); else $('#again').onclick = safe(async () => { closeModal(); stopRun(); await startFree(); });
  $('#tolobby').onclick = safe(() => { closeModal(); stopRun(); enterLobby(); });
}
function renderInv(inv) {
  $('#inv').innerHTML = Array.from({ length: R.INV_SLOTS }, (_, i) => { const s = inv[i]; return `<button class="slot ${s ? 'has' : ''}" data-i="${i}" title="${s ? S.ITEMS[s.k].name : 'Ô trống'}"><small>${i + 1}</small>${s ? S.ITEMS[s.k].icon + '<b>' + s.n + '</b>' : ''}</button>`; }).join('');
}
$('#inv').addEventListener('pointerdown', (e) => { const b = e.target.closest('.slot'); if (b && game) { e.preventDefault(); game.useItem(+b.dataset.i); } });
function updateHud(h) {
  $('#h-time').textContent = fmtTime(h.time);
  $('#h-prog').style.width = (h.s / h.dist * 100).toFixed(1) + '%';
  $('#h-dist').textContent = `${(h.s / 1000).toFixed(2)} / ${(h.dist / 1000).toFixed(1)} km`;
  $('#h-speed').textContent = `${h.kmh.toFixed(1)} km/h · ${fmtPace(h.pace)}/km`;
  $('#h-grade').textContent = game.map.kind === 'gps' ? 'GPS' : `${h.grade >= 0 ? '+' : ''}${h.grade.toFixed(1)}% · ${Math.round(h.elev)} m`;
  { const sw = $('#stamwrap'); $('#h-stam').textContent = Math.round(h.stam); $('#h-stamarc').style.strokeDasharray = `${Math.max(0, h.stam).toFixed(1)} 100`;
    sw.classList.toggle('mid', h.stam < 50 && h.stam >= 25); sw.classList.toggle('low', h.stam < 25 && !h.exhausted); sw.classList.toggle('dead', !!h.exhausted); }
  { const fx = []; if (h.shieldT > 0) fx.push(`🛡️ Khiên ${Math.ceil(h.shieldT)}s`); if (h.magT > 0) fx.push(`🧲 Nam châm ${Math.ceil(h.magT)}s`); if (h.boltT > 0) fx.push(`⚡ Tăng tốc ${Math.ceil(h.boltT)}s`); if (h.slowT > 0) fx.push(`🐕 Chậm lại ${Math.ceil(h.slowT)}s`); if (!fx.length && h.dog === 'chase') fx.push('🐕 Chó đang đuổi!');
    $('#h-status').textContent = h.exhausted ? '😮‍💨 Kiệt sức — chờ hồi sức hoặc dùng đồ ăn' : fx.join(' · '); }
  $('#h-online').textContent = `${h.online} đang online`; $('#h-auto').checked = h.mode === 'auto';
  $('#h-coins').innerHTML = '<span class="gc"></span> ' + (coinBase + sessionCoins); $('#viewhint').hidden = !h.overview;
  if (game.map.kind !== 'gps') drawElev($('#h-elev'), game.map, h.s);
}
// điều khiển
const cdKey = (id, k) => { const b = $('#' + id); b.classList.add('cd'); setTimeout(() => b.classList.remove('cd'), ACT_CD[k]); };
const typing = () => /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
const modalOpen = () => !$('#modal').hidden;
addEventListener('keydown', (e) => {
  if (!game || !game.running || $('#hud').hidden || typing()) return;
  if (modalOpen()) { if (e.key === 'Escape') closeModal(); return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { game.step(); game.setHold('key', true); } }
  else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') { if (e.key === 'ArrowDown') e.preventDefault(); game.slide(); }
  else if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowUp') { if (e.key === 'ArrowUp') e.preventDefault(); game.jump(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); game.moveLane(-1); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); game.moveLane(1); }
  else if (/^[1-5]$/.test(e.key)) game.useItem(+e.key - 1);
  else if (e.key === 'a' || e.key === 'A') toggleAuto();
  else if (e.key === '+' || e.key === '=') game.zoom(-1);
  else if (e.key === '-') game.zoom(1);
  else if (e.key === 't' || e.key === 'T') game.tilt();
  else if (e.key === 'm' || e.key === 'M') toggleSound();
  else if (e.key === 'q' || e.key === 'Q') { if (game.interact('tease')) cdKey('sc-tease', 'tease'); }
  else if (e.key === 'e' || e.key === 'E') { if (game.interact('punch')) cdKey('sc-punch', 'punch'); }
  else if (e.key === 'r' || e.key === 'R') { if (game.interact('kick')) cdKey('sc-kick', 'kick'); }
  else if (e.key === 'f' || e.key === 'F') game.fitAll();
});
function toggleAuto() { game.setMode(game.mode === 'auto' ? 'manual' : 'auto'); sel.mode = game.mode; toast(game.mode === 'auto' ? `▶ Chạy tự động (${R.AUTO_STEPS_PER_SEC} bước/giây)` : '✋ Chạy thủ công', 1200); }
$('#h-auto').onchange = () => toggleAuto();
const stepBtn = $('#b-step');
stepBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); stepBtn.setPointerCapture(e.pointerId); if (game) { game.step(); game.setHold('btn', true); } });   // giữ nút = chạy liên tục tốc độ tối đa
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stepBtn.addEventListener(ev, () => game && game.setHold('btn', false));
addEventListener('keyup', (e) => { if (e.code === 'Space' && game) game.setHold('key', false); });
addEventListener('blur', () => game && game.releaseHold());
document.addEventListener('visibilitychange', () => { if (document.hidden && game) game.releaseHold(); });
$('#b-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); game && game.jump(); });
$('#b-slide').addEventListener('pointerdown', (e) => { e.preventDefault(); game && game.slide(); });
$('#b-left').addEventListener('pointerdown', (e) => { e.preventDefault(); game && game.moveLane(-1); });
$('#b-right').addEventListener('pointerdown', (e) => { e.preventDefault(); game && game.moveLane(1); });
$('#z-in').onclick = () => game.zoom(-1); $('#z-out').onclick = () => game.zoom(1);
$('#b-tilt').onclick = () => game.tilt(); $('#b-map').onclick = () => game.fitAll(); $('#b-exit').onclick = () => exitRun();
addEventListener('beforeunload', () => { if (game && game.st && game.running && store.mode === 'guest' && !(cur && cur.tour)) { store.record(game.takeDelta()); store.flush(false); } });

// ----- nhiều người chơi -----
function connectWs(course, room) {
  clearTimeout(wsTimer); if (ws) { ws.onclose = null; ws.close(); }
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  const p = store.profile();
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', map: course.kind === 'gps' ? 'hoguom' : course.id, room, name: p.name, km: p.totals.totalKm, equip: p.equip, peace: !!game.peace }));
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; } if (!game) return;
    if (m.t === 'welcome') { game.myId = m.id; game.setOthers(m.players); }
    else if (m.t === 'act') game.onActMsg(m);
    else if (m.t === 'peace') game.setPeace(m.id, m.on);
    else if (m.t === 'deny') { const T = { range: 'Ở quá xa hoặc khác làn', immune: 'Người này vừa bị chọc, đợi một chút', peace: 'Bạn đang ở chế độ hòa bình 🕊', target_peace: 'Người này đang ở chế độ hòa bình 🕊' }[m.why]; if (T) toast(T, 1500); }
    else if (m.t === 'join') { game.addOther(m.p); $('#ticker').innerHTML = (m.p.av ? `<img class="avs sm" src="/api/avatar/${String(m.p.av).split('.')[0]}?v=${String(m.p.av).split('.')[1]}" alt="">` : '') + esc(m.p.name) + ' vừa vào cung đường'; clearTimeout(tickT); tickT = setTimeout(() => { $('#ticker').textContent = ''; }, 3500); }
    else if (m.t === 'leave') game.removeOther(m.id);
    else if (m.t === 'snap') game.snap(m.p);
  };
  ws.onclose = () => { wsTimer = setTimeout(() => { if (game && game.running && cur) connectWs(cur.course, cur.room); }, 3000); };
  clearInterval(posTimer);
  posTimer = setInterval(() => { if (ws && ws.readyState === 1 && game && game.st) ws.send(JSON.stringify({ t: 'pos', s: +game.st.s.toFixed(1), l: game.st.lane, j: game.st.jumpT > 0 ? 1 : 0, mv: game.st.speed > 0.3 ? 1 : 0 })); }, 250);
}

// ----- hộp thoại -----
let modalCb = null;
function openModal(html) { $('#m-body').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; if (modalCb) { const f = modalCb; modalCb = null; f(); } }
$('#m-x').onclick = closeModal; $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openPanel(b.dataset.open); });

async function openPanel(kind) {
  if (kind === 'history') {
    openModal('<h2>📖 Lịch sử</h2><p class="sub">Đang tải…</p>');
    const rows = await store.history().catch(() => []), byDay = new Map(rows.map((r) => [r.day, r])), cells = [];
    const today = new Date(dayOf() + 'T00:00:00Z'), dow = (today.getUTCDay() + 6) % 7;
    for (let i = 16 * 7 + dow; i >= 0; i--) { const d = new Date(today - i * 864e5).toISOString().slice(0, 10), km = (byDay.get(d) || {}).totalKm || 0; cells.push(`<i title="${d}: ${km} km" data-l="${km <= 0 ? 0 : km < 2 ? 1 : km < 5 ? 2 : km < 10 ? 3 : 4}"></i>`); }
    $('#m-body').innerHTML = `<h2>📖 Lịch sử từng ngày</h2><div class="heat">${cells.join('')}</div>
      <p class="hint">Mỗi ô là một ngày (tổng km = trong game + ngoài đời). Cột <b style="color:var(--ok)">Ngoài đời</b> lấy từ Strava; chưa kết nối thì bằng 0.</p>
      <div class="tw"><table><thead><tr><th>Ngày</th><th>Game</th><th>Ngoài đời 👟</th><th>Tổng</th><th>Bước</th><th>Thời gian</th><th>Vật phẩm</th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr><td>${r.day.slice(8)}/${r.day.slice(5, 7)}</td><td class="g">${r.gameKm.toFixed(1)}</td><td class="r">${r.realKm.toFixed(1)}</td><td class="t">${r.totalKm.toFixed(1)}</td><td>${r.steps}</td><td>${fmtTime(r.secs)}</td><td>${ITEM_ICON(r.items)}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--mut)">Chưa có chuyến chạy nào</td></tr>'}</tbody></table></div>`;
  } else if (kind === 'board') {
    const render = async (period) => {
      if (store.mode !== 'account') { $('#m-body').innerHTML = '<h2>🏆 Xếp hạng</h2><p class="sub">Xếp hạng dành cho tài khoản. Tạo tài khoản để lên bảng (dữ liệu khách được gộp), và kết nối Strava để cộng km chạy ngoài đời.</p>'; return; }
      const j = await store.leaderboard(period).catch(() => ({ rows: [] }));
      $('#m-body').innerHTML = `<h2>🏆 Xếp hạng</h2><div class="seg" id="lb-tabs">${[['today', 'Hôm nay'], ['week', '7 ngày'], ['all', 'Tất cả']].map(([k, n]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="tw"><table><thead><tr><th>#</th><th>Tên</th><th>Game</th><th>Ngoài đời 👟</th><th>Tổng</th></tr></thead><tbody>
        ${j.rows.length ? j.rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${S.TIERS[r.tier].icon} ${r.avatar ? `<img class="avs sm" src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)} ${r.strava ? '<span title="Đã kết nối Strava">🟧</span>' : ''}</td><td class="g">${r.gameKm.toFixed(1)}</td><td class="r">${r.realKm.toFixed(1)}</td><td class="t">${r.totalKm.toFixed(1)}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--mut)">Chưa có dữ liệu</td></tr>'}</tbody></table></div>
        <p class="hint">Xếp theo <b>tổng km</b> = km trong game + km chạy ngoài đời. Người chưa kết nối Strava có cột Ngoài đời = 0. Km gộp từ dữ liệu khách không tính vào bảng này.</p>`;
      $('#lb-tabs').onclick = (e) => { if (e.target.dataset.p) render(e.target.dataset.p); };
    };
    openModal('<h2>🏆 Xếp hạng</h2><p class="sub">Đang tải…</p>'); render('week');
  } else if (kind === 'shop') shopPanel('hat');
  else if (kind === 'tour') { closeModal(); tours.list(); }
  else if (kind === 'profile') profilePanel();
  else if (kind === 'quest') {
    const p = store.profile(), g = p.today.gameKm, r = p.today.realKm;
    openModal(`<h2>🎯 Mục tiêu hôm nay</h2><div class="sumgrid"><div>Trong game<b>${g.toFixed(1)} km</b></div><div>Ngoài đời 👟<b>${r.toFixed(1)} km</b></div><div>Tổng / ${GOAL_KM} km<b>${(g + r).toFixed(1)}</b></div></div><p class="hint">Chạy thật ngoài đời được tính vào tổng km, xếp hạng và nhận ${S.COIN.PER_KM_REAL} xu mỗi km.</p>`);
  }
}
function shopPanel(cat) {
  const p = store.profile(), owned = new Set(p.owned || []), eq = p.equip;
  const items = S.SHOP.filter((x) => x.cat === cat);
  openModal(`<h2>🛍 Cửa hàng</h2><div class="row between"><div class="seg" id="shop-tabs">${S.SHOP_CATS.map(([k, n]) => `<button data-c="${k}" class="${k === cat ? 'on' : ''}">${n}</button>`).join('')}</div><b class="coinbal"><span class="gc"></span> ${p.coins || 0}</b></div>
    <div class="shopgrid">${items.map((it) => { const has = it.price === 0 || owned.has(cat + ':' + it.id), on = eq[cat] === it.id;
      return `<div class="scard ${on ? 'on' : ''}"><div class="sicon" style="${it.color ? `background:${it.color}33` : ''}">${it.icon}</div><b>${esc(it.name)}</b>
        ${on ? '<span class="hint">Đang dùng</span>' : has ? `<button class="ghost" data-equip="${it.id}">Dùng</button>` : `<button class="primary" data-buy="${it.id}" ${(p.coins || 0) < it.price ? 'disabled' : ''}>Mua ${it.price} <span class="gc"></span></button>`}</div>`; }).join('')}</div>
    <p class="hint">Kiếm xu: ${S.COIN.PER_KM_GAME} xu mỗi km trong game, nhặt <span class="gc"></span> trên đường, +${S.COIN.FINISH} xu khi về đích, ${S.COIN.PER_KM_REAL} xu mỗi km chạy ngoài đời (Strava). Trang bị hiện trên nhân vật cho mọi người cùng thấy.</p>`);
  $('#shop-tabs').onclick = (e) => { if (e.target.dataset.c) shopPanel(e.target.dataset.c); };
  document.querySelector('.shopgrid').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.buy) { await store.buy(cat, b.dataset.buy); await store.equipItem(cat, b.dataset.buy); toast('Đã mua và đang dùng ✓'); }
      else if (b.dataset.equip) { await store.equipItem(cat, b.dataset.equip); toast('Đã đổi trang bị ✓'); }
      shopPanel(cat); if (!$('#scr-lobby').hidden) renderLobby();
    } catch (er) { toast(er.message); }
  };
}
// cắt vuông giữa ảnh, thu về 160×160, nén JPEG đến khi nhẹ (<~45 KB) để lưu và gửi nhanh
async function prepareAvatar(file) {
  if (!/^image\//.test(file.type)) throw new Error('Hãy chọn một file ảnh');
  if (file.size > 15e6) throw new Error('Ảnh quá lớn (tối đa 15 MB)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Không đọc được ảnh (thử JPG hoặc PNG)')); i.src = url; });
    const S0 = 160, cv = document.createElement('canvas'); cv.width = cv.height = S0; const x = cv.getContext('2d');
    const side = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    x.fillStyle = '#fff'; x.fillRect(0, 0, S0, S0); x.drawImage(img, sx, sy, side, side, 0, 0, S0, S0);
    for (let q = 0.88; q >= 0.4; q -= 0.12) { const d = cv.toDataURL('image/jpeg', q); if (d.length < 60000) return d; }
    throw new Error('Không nén được ảnh đủ nhẹ');
  } finally { URL.revokeObjectURL(url); }
}
async function profilePanel() {
  const p = store.profile();
  const strava = p.mode !== 'account' ? '<p class="hint">Khách không kết nối Strava được. Tạo tài khoản để cộng km chạy ngoài đời.</p>'
    : p.stravaLinked ? `<p>🟧 Đã kết nối Strava · đồng bộ lần cuối ${p.lastSync ? new Date(p.lastSync).toLocaleString('vi-VN') : '—'}</p><div class="seg"><button id="p-sync">🔄 Đồng bộ</button><button id="p-unlink">Ngắt kết nối</button></div>`
    : cfg.strava ? `<p class="hint">Kết nối để thêm km chạy ngoài đời vào lịch sử và xếp hạng, và nhận ${S.COIN.PER_KM_REAL} xu/km.${cfg.mock ? ' (DEMO: dữ liệu giả)' : ''}</p><a class="primary" style="display:block;text-align:center;text-decoration:none" href="/auth/strava">Kết nối Strava</a>` : '<p class="hint">Server chưa cấu hình Strava.</p>';
  openModal(`<h2>👤 ${esc(p.name)}</h2>
    <div class="avrow"><div class="avbig">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '<span>🙂</span>'}</div>
      <div><div class="seg"><button id="p-avpick" class="on">📷 ${p.avatar ? 'Đổi ảnh' : 'Tải ảnh đại diện'}</button>${p.avatar ? '<button id="p-avdel">Xóa</button>' : ''}</div>
      <p class="hint">Ảnh này thay cho khuôn mặt nhân vật khi chạy.${p.mode === 'guest' ? ' Khách chỉ tự thấy ảnh của mình; tạo tài khoản để mọi người cùng thấy.' : ' Mọi người chơi cùng cung đường sẽ thấy ảnh này.'}</p></div>
      <input type="file" id="p-avfile" accept="image/*" hidden></div>
    ${tierPill(p.tier ?? S.tierIndex(p.totals.totalKm))}
    <div class="sumgrid"><div>Trong game<b>${p.totals.gameKm.toFixed(1)} km</b></div><div>Ngoài đời<b>${p.totals.realKm.toFixed(1)} km</b></div><div>Tổng<b>${p.totals.totalKm.toFixed(1)} km</b></div><div>Số bước<b>${p.totals.steps}</b></div><div>Xu<b><span class="gc"></span> ${p.coins || 0}</b></div><div>Vật phẩm<b style="font-size:15px">${ITEM_ICON(p.totals.items)}</b></div></div>
    <div id="my-awards"></div><h3>Strava (tùy chọn)</h3>${strava}
    <h3>Tài khoản</h3><div class="seg">${p.mode === 'guest' ? '<button id="p-export">Sao lưu dữ liệu (file)</button>' : ''}<button id="p-out">Đăng xuất</button></div>
    ${p.mode === 'guest' ? '<p class="hint">Dữ liệu khách nằm trên trình duyệt này. Khi tạo tài khoản, bạn sẽ được hỏi có gộp dữ liệu này vào không.</p>' : ''}`);
  const on = (id, fn) => { const b = $('#' + id); if (b) b.onclick = fn; };
  on('p-avpick', () => $('#p-avfile').click());
  { const f = $('#p-avfile'); if (f) f.onchange = async () => { const file = f.files && f.files[0]; if (!file) return; try { toast('Đang xử lý ảnh...', 1500); await store.setAvatar(await prepareAvatar(file)); toast('Đã đổi ảnh đại diện ✓'); profilePanel(); renderLobby(); } catch (er) { toast(er.message || 'Không dùng được ảnh này', 3500); } }; }
  on('p-avdel', async () => { try { await store.clearAvatar(); toast('Đã xóa ảnh đại diện'); profilePanel(); renderLobby(); } catch (er) { toast(er.message, 3000); } });
  on('p-sync', async () => { try { await api('/api/strava/sync', {}); await store.refresh(); toast('Đã đồng bộ ✓'); profilePanel(); renderLobby(); } catch (er) { toast(er.message, 3500); await store.refresh().catch(() => {}); profilePanel(); renderLobby(); } });
  on('p-unlink', async () => { await api('/api/strava/unlink', {}); await store.refresh(); profilePanel(); renderLobby(); });
  on('p-out', async () => { await store.logout(); closeModal(); stopRun(); show('entry'); });
  on('p-export', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([store.exportGuest()], { type: 'application/json' })); a.download = 'chay-online-khach.json'; a.click(); });
  try { const aw = (await api('/api/awards/mine')).awards; if (aw.length) $('#my-awards').innerHTML = `<h3>Kệ huy chương</h3><div class="row" style="flex-wrap:wrap">${aw.map((a) => `<div class="awd" title="${esc(a.title)}">${medalSvg(a.medal, 64)}<span>${esc(a.title)}<br><b>${MEDAL_NAMES[a.kind]}</b></span></div>`).join('')}</div>`; } catch { /* chưa có */ }
}

// ----- khởi động -----
(async function boot() {
  try { cfg = await api('/api/config'); } catch { /* giữ mặc định */ }
  try { const r = await fetch('/courses/meta.json'); if (r.ok) S.applyMeta(await r.json()); } catch { /* dùng số liệu mặc định */ }
  tours = createTournamentUI({ store, cfg, toast, show, toLobby: () => enterLobby(), launchTour, getMode, setMode, prefetch: (m, st, cb) => prefetchMap(m, st, cb), fmt: { time: fmtTime } });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  document.querySelectorAll('[data-open]').forEach(() => {});
  const qs = new URLSearchParams(location.search);
  const msgs = { nostrava: 'Server chưa cấu hình Strava.', denied: 'Bạn đã từ chối quyền Strava.', scope: 'Cần cho phép xem hoạt động để tính km.', state: 'Phiên hết hạn, thử lại nhé.', strava: 'Kết nối Strava thất bại.', rate: 'Strava đang giới hạn số lần gọi, thử lại sau ít phút.' };
  const code = (qs.get('t') || '').toUpperCase().slice(0, 6);
  const ok = await store.init();
  if (code) pendingTour = code;
  if (ok) enterLobby(); else { show('entry'); if (code) { const e = $('#err'); e.hidden = false; e.className = 'err info'; e.textContent = `Bạn được mời vào giải đấu ${code}. Đăng nhập hoặc chơi khách để vào giải.`; } }
  if (qs.get('strava') === 'ok') toast('Đã kết nối Strava ✓ Km ngoài đời đã được cộng vào lịch sử.', 3500);
  if (qs.get('err') && msgs[qs.get('err')]) toast(msgs[qs.get('err')], 3500);
  if (location.search) history.replaceState(null, '', '/');
})();
window.__app = { store, get game() { return game; }, sel, get tours() { return tours; }, get picker() { return picker; } };

// nhãn nút theo thiết bị
{ const s = $('#b-step small'), j = $('#b-jump small'), sl = $('#b-slide small'); if (TOUCH) { s.textContent = 'hoặc chạm màn hình'; j.textContent = ''; sl.textContent = ''; } else { s.textContent = 'Space / click'; j.textContent = 'J / ↑'; sl.textContent = 'S / ↓'; } }

// bàn phím ảo / cử chỉ (điện thoại, tablet): mặc định dùng cử chỉ, ẩn các nút ◀ ▶ TRƯỢT NHẢY; nút 🎮 bật lại khi cần
let padOn = false; try { padOn = localStorage.getItem('chay.pad') === '1'; } catch { /* bỏ */ }
const applyPad = () => { $('#hud').classList.toggle('gest', TOUCH && !padOn); $('#b-pad').hidden = !TOUCH; $('#b-pad').classList.toggle('on', padOn); };
$('#b-pad').onclick = () => { padOn = !padOn; try { localStorage.setItem('chay.pad', padOn ? '1' : '0'); } catch { /* bỏ */ } applyPad(); toast(padOn ? 'Đã bật nút ◀ ▶ TRƯỢT NHẢY' : 'Chỉ dùng cử chỉ vuốt', 1400); };
applyPad();
// âm thanh
const soundIcon = () => { $('#b-sound').textContent = sfx.muted ? '🔇' : '🔊'; };
function toggleSound() { sfx.toggle(); soundIcon(); toast(sfx.muted ? 'Đã tắt âm thanh' : 'Đã bật âm thanh', 1200); }
$('#b-sound').onclick = toggleSound; soundIcon();
// tiếng bấm nút ngoài sảnh
document.addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('#hud')) sfx.click(); });
