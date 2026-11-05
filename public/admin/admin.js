'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const fmt = (v) => nf.format(+v || 0);
const dur = (s) => { s = Math.round(+s || 0); if (s < 60) return s + ' giây'; const m = Math.round(s / 60); if (m < 60) return m + ' phút'; return Math.floor(m / 60) + 'g ' + (m % 60) + 'p'; };
const dt = (t) => (t ? new Date(t).toLocaleString('vi-VN', { hour12: false }) : '—');
const dd = (t) => (t ? new Date(t).toLocaleDateString('vi-VN') : '—');
const ago = (t) => { if (!t) return '—'; const s = (Date.now() - t) / 1000; if (s < 90) return 'vừa xong'; if (s < 3600) return Math.round(s / 60) + ' phút trước'; if (s < 86400) return Math.round(s / 3600) + ' giờ trước'; return Math.round(s / 86400) + ' ngày trước'; };
const EVT = { register: 'Đăng ký', login: 'Đăng nhập', login_fail: 'Đăng nhập sai', login_banned: 'Bị khóa vẫn đăng nhập', run_start: 'Bắt đầu chạy', shop_buy: 'Mua vật phẩm', tour_create: 'Tạo giải', tour_join: 'Tham gia giải' };
const evName = (t) => EVT[t] || t;
function evText(e) { let d = {}; try { d = JSON.parse(e.data || '{}') || {}; } catch { /* trống */ } const p = []; for (const [k, v] of Object.entries(d)) p.push(k + ': ' + v); return p.join(' · '); }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }
async function api(path, body, method) {
  const o = { headers: {} }; if (body !== undefined) { o.method = method || 'POST'; o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); } else if (method) o.method = method;
  const r = await fetch('/api/admin' + path, o), j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/login')) { showLogin(); throw new Error('Hết phiên'); }
  if (!r.ok) throw new Error(j.error || 'Lỗi');
  return j;
}

// ---------- biểu đồ SVG ----------
const COL = { gold: '#f2c230', blue: '#60a5fa', green: '#4ade80', org: '#fb923c', pink: '#f472b6' };
function chart(rows, series, { label = (r) => r.day.slice(5), h = 190 } = {}) {
  const W = 640, H = h, L = 36, B = 22, T = 8, R = 6, n = rows.length; if (!n) return '<p class="mut">Chưa có dữ liệu</p>';
  const max = Math.max(1, ...series.flatMap((s) => rows.map((r) => +r[s.k] || 0))), nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); const m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; })();
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1)), bw = Math.max(2, ((W - L - R) / n) * 0.7), y = (v) => T + (H - T - B) * (1 - v / nice);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (nice * i) / 4, yy = y(v); g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#ffffff14"/><text x="${L - 5}" y="${yy + 3}" text-anchor="end">${fmt(v)}</text>`; }
  const step = Math.ceil(n / 8); for (let i = 0; i < n; i += step) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(label(rows[i]))}</text>`;
  const bars = series.filter((s) => s.t === 'bar'), lines = series.filter((s) => s.t !== 'bar');
  bars.forEach((s) => rows.forEach((r, i) => { const v = +r[s.k] || 0; g += `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(0, H - B - y(v))}" rx="2" fill="${s.c}" opacity=".85"><title>${esc(label(r))}: ${fmt(v)} ${esc(s.name)}</title></rect>`; }));
  lines.forEach((s) => { g += `<polyline fill="none" stroke="${s.c}" stroke-width="2" stroke-linejoin="round" points="${rows.map((r, i) => x(i) + ',' + y(+r[s.k] || 0)).join(' ')}"/>`; if (n <= 40) rows.forEach((r, i) => { g += `<circle cx="${x(i)}" cy="${y(+r[s.k] || 0)}" r="2.5" fill="${s.c}"><title>${esc(label(r))}: ${fmt(r[s.k])} ${esc(s.name)}</title></circle>`; }); });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${g}</svg><div class="legend">${series.map((s) => `<span><i style="background:${s.c}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
function hbars(items, unit = '') { const max = Math.max(1, ...items.map((i) => i.v)); return `<div class="bars">${items.map((i) => `<div class="hb"><span title="${esc(i.l)}">${esc(i.l)}</span><div><i style="width:${(i.v / max) * 100}%;${i.c ? 'background:' + i.c : ''}"></i></div><b>${fmt(i.v)}${unit}</b></div>`).join('') || '<p class="mut">Chưa có dữ liệu</p>'}</div>`; }
const kpi = (l, v, sub) => `<div class="kpi"><small>${esc(l)}</small><b>${v}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;

// ---------- đăng nhập ----------
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; clearInterval(timer); }
$('#f').addEventListener('submit', async (e) => {
  e.preventDefault(); const er = $('#lerr'); er.hidden = true;
  try { await api('/login', { username: $('#u').value, password: $('#p').value }); $('#p').value = ''; start(); } catch (x) { er.textContent = x.message; er.hidden = false; }
});
$('#out').onclick = async () => { await api('/logout', {}).catch(() => {}); showLogin(); };

// ---------- định tuyến ----------
let timer, days = 30, usersQ = { q: '', sort: 'created', dir: 'desc', page: 0 }, guestPage = 0, actType = '';
const main = $('#main');
async function route() {
  clearInterval(timer);
  const [, r, id] = (location.hash || '#/overview').split('/');
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.r === r || (r === 'user' && a.dataset.r === 'users'));
  try {
    if (r === 'users') await pageUsers(); else if (r === 'user') await pageUser(+id); else if (r === 'guests') await pageGuests();
    else if (r === 'tournaments') await pageTours(); else if (r === 'activity') await pageActivity(); else if (r === 'audit') await pageAudit();
    else { await pageOverview(); timer = setInterval(() => pageOverview(true).catch(() => {}), 30e3); }
  } catch (e) { if (e.message !== 'Hết phiên') main.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);
async function start() {
  const me = await fetch('/api/admin/me').then((r) => r.json()).catch(() => ({}));
  if (!me.admin) return showLogin();
  $('#login').hidden = true; $('#app').hidden = false; route();
}

// ---------- tổng quan ----------
async function pageOverview(quiet) {
  const d = await api('/overview?days=' + days), t = d.totals;
  const tabs = [7, 30, 90, 180].map((n) => `<button class="${n === days ? 'on' : ''}" data-d="${n}">${n} ngày</button>`).join('');
  const dev = Object.entries(d.devices).map(([k, v]) => ({ l: { pc: '💻 Máy tính', mobile: '📱 Điện thoại', tablet: '📲 Tablet' }[k] || k, v })).sort((a, b) => b.v - a.v);
  const hrs = d.hours.map((v, h) => ({ day: String(h).padStart(2, '0') + 'h', v }));
  main.innerHTML = `
  <div class="bar"><h2>Tổng quan hệ thống</h2><span class="sp"></span><div class="tabs" id="dtabs">${tabs}</div><span class="mut">cập nhật ${new Date(d.generatedAt).toLocaleTimeString('vi-VN')}</span></div>
  <div class="kpis">
    ${kpi('Đang truy cập (90s)', fmt(t.viewing), `đang chạy: ${fmt(t.running)}`)}${kpi('Người dùng hôm nay (DAU)', fmt(t.dau), `7 ngày: ${fmt(t.wau)} · 30 ngày: ${fmt(t.mau)}`)}
    ${kpi('Tài khoản', fmt(t.users), `mới hôm nay: ${fmt(t.newToday)} · khóa: ${fmt(t.banned)}`)}${kpi('Khách (chưa đăng ký)', fmt(t.guestsEver), `tổng thiết bị: ${fmt(t.visitorsEver)}`)}
    ${kpi('Lượt truy cập', fmt(t.visitsEver), 'mỗi lần mở trang')}${kpi('Thời gian / lượt (30 ngày)', dur(t.avgSessionS), `trung vị ${dur(t.medianSessionS)}`)}
    ${kpi('Tổng giờ sử dụng (30 ngày)', fmt(t.activeHours30) + ' giờ', 'chỉ tính lúc tab đang mở')}${kpi('Chuyến chạy', fmt(t.runs), `hôm nay: ${fmt(t.runsToday)}`)}
    ${kpi('Km trong game', fmt(t.gameKm), 'tài khoản')}${kpi('Km ngoài đời (Strava)', fmt(t.realKm), `${fmt(t.strava)} tài khoản kết nối`)}
    ${kpi('Giải đấu', fmt(t.tournaments), `đang diễn ra: ${fmt(t.tournamentsLive)} · lượt tham gia: ${fmt(t.tournamentPlayers)}`)}${kpi('Xu lưu hành', fmt(t.coins))}
  </div>
  <div class="grid2">
    <div class="card"><h3>Lượt truy cập & thiết bị duy nhất / ngày</h3>${chart(d.series, [{ k: 'visits', t: 'bar', c: COL.gold, name: 'Lượt truy cập' }, { k: 'uniq', t: 'line', c: COL.blue, name: 'Thiết bị duy nhất' }])}</div>
    <div class="card"><h3>Thời gian sử dụng (phút / ngày)</h3>${chart(d.series, [{ k: 'activeMin', t: 'bar', c: COL.green, name: 'Phút hoạt động' }])}</div>
    <div class="card"><h3>Người dùng mới & số người chạy / ngày</h3>${chart(d.series, [{ k: 'newUsers', t: 'bar', c: COL.org, name: 'Tài khoản mới' }, { k: 'runners', t: 'line', c: COL.pink, name: 'Người chạy' }])}</div>
    <div class="card"><h3>Chuyến chạy & km / ngày</h3>${chart(d.series, [{ k: 'runs', t: 'bar', c: COL.gold, name: 'Chuyến chạy' }, { k: 'km', t: 'line', c: COL.green, name: 'Km' }])}</div>
    <div class="card"><h3>Giờ truy cập trong ngày (giờ Việt Nam)</h3>${chart(hrs, [{ k: 'v', t: 'bar', c: COL.blue, name: 'Lượt truy cập' }], { label: (r) => r.day })}</div>
    <div class="card"><h3>Thiết bị & chế độ chạy</h3>${hbars(dev, ' thiết bị')}<div style="height:12px"></div>${hbars(Object.entries(d.modes).map(([k, v]) => ({ l: k === 'auto' ? '🤖 Tự động' : '👟 Thủ công', v, c: COL.org })), ' chuyến')}</div>
    <div class="card"><h3>Bản đồ được chạy nhiều nhất</h3>${hbars(d.topMaps.map((m) => ({ l: m.name, v: m.runs })), ' chuyến')}</div>
    <div class="card"><h3>Hành động ghi nhận</h3>${hbars(d.events.map((e) => ({ l: evName(e.type), v: e.n, c: COL.green })))}</div>
    <div class="card"><h3>Top người chạy (${days} ngày)</h3><div class="tw"><table><tbody>${d.topRunners.map((u, i) => `<tr class="click" data-u="${u.id}"><td>${i + 1}</td><td>${esc(u.name)} <span class="mut">@${esc(u.username)}</span></td><td class="n">${fmt(u.km)} km</td></tr>`).join('') || '<tr><td class="mut">Chưa có dữ liệu</td></tr>'}</tbody></table></div></div>
  </div>`;
  $('#dtabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { days = +b.dataset.d; pageOverview(); } };
  main.onclick = (e) => { const r = e.target.closest('tr[data-u]'); if (r) location.hash = '#/user/' + r.dataset.u; };
}

// ---------- người chơi ----------
const pager = (p, size, total) => `<div class="pg"><span class="mut">${total ? p * size + 1 : 0}–${Math.min(total, (p + 1) * size)} / ${fmt(total)}</span><button class="btn sm" data-pg="-1" ${p ? '' : 'disabled'}>‹ Trước</button><button class="btn sm" data-pg="1" ${(p + 1) * size < total ? '' : 'disabled'}>Sau ›</button></div>`;
async function pageUsers() {
  const u = usersQ, d = await api(`/users?q=${encodeURIComponent(u.q)}&sort=${u.sort}&dir=${u.dir}&page=${u.page}`);
  const th = (k, l, cls = '') => `<th class="s ${cls}" data-s="${k}">${l}${u.sort === k ? (u.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
  main.innerHTML = `<div class="bar"><h2>Người chơi (${fmt(d.total)})</h2><span class="sp"></span><form id="sf" class="bar"><input id="sq" placeholder="Tìm tên / tài khoản" value="${esc(u.q)}"><button class="btn">Tìm</button></form></div>
  <div class="card"><div class="tw"><table><thead><tr>${th('name', 'Người chơi')}${th('created', 'Tham gia')}${th('seen', 'Truy cập gần nhất')}${th('km', 'Km game', 'n')}${th('real', 'Km ngoài đời', 'n')}${th('runs', 'Chuyến', 'n')}${th('time', 'Thời gian dùng', 'n')}<th class="n">Lượt</th>${th('coins', 'Xu', 'n')}<th>Trạng thái</th></tr></thead><tbody>
  ${d.users.map((x) => `<tr class="click" data-u="${x.id}"><td>${x.avatar ? `<img src="${esc(x.avatar)}" alt="" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px">` : ''}${esc(x.name)} <span class="mut">@${esc(x.username)}</span></td><td>${dd(x.created)}</td><td>${ago(x.seen)}</td><td class="n">${fmt(x.gameKm)}</td><td class="n">${fmt(x.realKm)}</td><td class="n">${fmt(x.runs)}</td><td class="n">${dur(x.activeS)}</td><td class="n">${fmt(x.sessions)}</td><td class="n">${fmt(x.coins)}</td><td>${x.banned ? '<span class="tag bad">Khóa</span>' : '<span class="tag ok">Hoạt động</span>'} ${x.strava ? '<span class="tag gold">Strava</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="mut">Không có kết quả</td></tr>'}
  </tbody></table></div>${pager(d.page, d.size, d.total)}</div>`;
  $('#sf').onsubmit = (e) => { e.preventDefault(); usersQ.q = $('#sq').value.trim(); usersQ.page = 0; pageUsers(); };
  main.onclick = (e) => {
    const s = e.target.closest('th[data-s]'); if (s) { if (usersQ.sort === s.dataset.s) usersQ.dir = usersQ.dir === 'asc' ? 'desc' : 'asc'; else { usersQ.sort = s.dataset.s; usersQ.dir = 'desc'; } usersQ.page = 0; return pageUsers(); }
    const p = e.target.closest('[data-pg]'); if (p) { usersQ.page += +p.dataset.pg; return pageUsers(); }
    const r = e.target.closest('tr[data-u]'); if (r) location.hash = '#/user/' + r.dataset.u;
  };
}

function ask(html, onOk, { danger } = {}) {
  const dlg = $('#dlg'); $('#dbody').innerHTML = html + `<div class="bar"><span class="sp"></span><button class="btn" id="dno">Hủy</button><button class="btn ${danger ? 'bad' : 'pri'}" id="dyes">Xác nhận</button></div><div id="derr" class="err" hidden></div>`;
  dlg.hidden = false; $('#dno').onclick = () => { dlg.hidden = true; };
  $('#dyes').onclick = async () => { try { await onOk(); dlg.hidden = true; } catch (e) { const er = $('#derr'); er.textContent = e.message; er.hidden = false; } };
}
let userTab = 'daily';
async function pageUser(id) {
  const d = await api('/users/' + id), u = d.user, t = d.totals || {}, us = d.usage;
  const shopN = (k) => esc(k.replace(':', ' · '));
  const tabs = [['daily', 'Lịch sử theo ngày'], ['runs', 'Chuyến chạy'], ['sess', 'Phiên truy cập'], ['ev', 'Hoạt động'], ['tour', 'Giải đấu & huy chương'], ['items', 'Vật phẩm']];
  const body = {
    daily: () => `<div class="tw"><table><thead><tr><th>Ngày</th><th class="n">Km game</th><th class="n">Km ngoài đời</th><th class="n">Bước</th><th class="n">Thời gian chơi</th><th class="n">Bị chó cắn</th><th class="n">Lần nhảy</th></tr></thead><tbody>${d.daily.map((r) => `<tr><td>${r.day}</td><td class="n">${fmt(r.game_m / 1000)}</td><td class="n">${fmt(r.real_km)}</td><td class="n">${fmt(r.steps)}</td><td class="n">${dur(r.secs)}</td><td class="n">${r.bites}</td><td class="n">${r.jumps}</td></tr>`).join('')}${d.realOnly.map((r) => `<tr><td>${r.day}</td><td class="n">0</td><td class="n">${fmt(r.km)}</td><td colspan="4" class="mut">chỉ có chạy ngoài đời</td></tr>`).join('') || ''}</tbody></table></div>`,
    runs: () => `<div class="tw"><table><thead><tr><th>Bắt đầu</th><th>Bản đồ</th><th>Chế độ</th><th class="n">Cự ly</th><th class="n">Đã chạy</th><th class="n">Bước</th><th class="n">Thời lượng</th><th class="n">Tia sét</th><th>Kết quả</th></tr></thead><tbody>${d.runs.map((r) => `<tr><td>${dt(r.started)}</td><td>${esc(r.ttitle ? '🏅 ' + r.ttitle : r.map)}</td><td>${r.mode === 'auto' ? '🤖 Tự động' : '👟 Thủ công'}</td><td class="n">${r.dist_m ? fmt(r.dist_m / 1000) + ' km' : '—'}</td><td class="n">${fmt(r.meters / 1000)} km</td><td class="n">${fmt(r.steps)}</td><td class="n">${dur((r.last_flush - r.started) / 1000)}</td><td class="n">${r.bolts_used}</td><td>${r.done ? '<span class="tag ok">Về đích</span>' : '<span class="tag">Bỏ dở</span>'}</td></tr>`).join('') || '<tr><td class="mut">Chưa có chuyến chạy</td></tr>'}</tbody></table></div>`,
    sess: () => `<div class="tw"><table><thead><tr><th>Mở lúc</th><th>Lần cuối</th><th class="n">Thời gian dùng</th><th>Thiết bị</th><th>Trình duyệt</th><th>IP (băm)</th><th>Nguồn</th></tr></thead><tbody>${d.sessions.map((r) => `<tr><td>${dt(r.start)}</td><td>${ago(r.last)}</td><td class="n">${dur(r.active_s)}</td><td>${esc(r.device)}</td><td title="${esc(r.ua)}">${esc((r.ua || '').replace(/^Mozilla\/5.0 /, '').slice(0, 44))}</td><td>${esc(r.ip)}</td><td>${esc(r.ref || '—')}</td></tr>`).join('') || '<tr><td class="mut">Chưa có phiên</td></tr>'}</tbody></table></div>`,
    ev: () => `<div class="tw"><table><thead><tr><th>Thời điểm</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>${d.events.map((e) => `<tr><td>${dt(e.ts)}</td><td>${esc(evName(e.type))}</td><td class="mut">${esc(evText(e))}</td></tr>`).join('') || '<tr><td class="mut">Chưa có</td></tr>'}</tbody></table></div>`,
    tour: () => `<h3>Giải đã tham gia</h3><div class="tw"><table><tbody>${d.tournamentsJoined.map((x) => `<tr><td><a href="/?t=${esc(x.code)}" target="_blank">${esc(x.title || x.code)}</a></td><td>${dt(x.joined)}</td><td class="n">${x.results} kết quả</td></tr>`).join('') || '<tr><td class="mut">Chưa tham gia</td></tr>'}</tbody></table></div>
      <h3 style="margin-top:14px">Huy chương</h3><div class="tw"><table><tbody>${d.awards.map((a) => `<tr><td>${esc(a.title || a.tid)}</td><td>${esc(a.kind)}${a.rank ? ' #' + a.rank : ''}</td><td>${esc(a.cat)}</td><td class="n">${a.time_s ? dur(a.time_s) : ''}</td></tr>`).join('') || '<tr><td class="mut">Chưa có</td></tr>'}</tbody></table></div>
      <h3 style="margin-top:14px">Giải do người này tổ chức</h3><div class="tw"><table><tbody>${d.tournamentsOwned.map((x) => `<tr><td><a href="/?t=${esc(x.code)}" target="_blank">${esc(x.title)}</a></td><td>${x.visibility === 'private' ? '🔒 Riêng tư' : '🌐 Công khai'}</td><td>${dt(x.end_at)}</td></tr>`).join('') || '<tr><td class="mut">Chưa tổ chức</td></tr>'}</tbody></table></div>`,
    items: () => `<h3>Đã sở hữu (${u.owned.length})</h3><p>${u.owned.map((k) => `<span class="tag">${shopN(k)}</span>`).join(' ') || '<span class="mut">Chưa mua</span>'}</p><h3>Đang trang bị</h3><p>${Object.entries(u.equip).map(([k, v]) => `<span class="tag">${esc(k)}: ${esc(v)}</span>`).join(' ')}</p><h3>Vật phẩm đang giữ</h3><p>${(u.inventory || []).map((i) => `<span class="tag">${esc(JSON.stringify(i))}</span>`).join(' ') || '<span class="mut">Trống</span>'}</p>`,
  };
  main.innerHTML = `<div class="bar"><a class="btn sm" href="#/users">‹ Danh sách</a><h2>${u.avatar ? `<img src="${esc(u.avatar)}" alt="" style="width:38px;height:38px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px">` : ''}${esc(u.name)} <span class="mut">@${esc(u.username)}</span></h2>${u.banned ? `<span class="tag bad">Khóa${u.banReason ? ': ' + esc(u.banReason) : ''}</span>` : '<span class="tag ok">Hoạt động</span>'}${u.strava ? '<span class="tag gold">Strava</span>' : ''}<span class="sp"></span>
    <button class="btn sm" id="a-coin">Cộng/trừ xu</button><button class="btn sm" id="a-name">Đổi tên</button>${u.avatar ? '<button class="btn sm" id="a-av">Xóa avatar</button>' : ''}<button class="btn sm" id="a-pw">Đặt lại mật khẩu</button><button class="btn sm ${u.banned ? '' : 'bad'}" id="a-ban">${u.banned ? 'Mở khóa' : 'Khóa tài khoản'}</button><button class="btn sm bad" id="a-del">Xóa</button></div>
  <div class="kpis">${kpi('Tham gia', dd(u.created))}${kpi('Km game', fmt(t.gameKm))}${kpi('Km ngoài đời', fmt(t.realKm))}${kpi('Tổng km', fmt(t.totalKm))}${kpi('Xu', fmt(u.coins))}
    ${kpi('Số lượt truy cập', fmt(us.sessions), `${fmt(us.ips)} IP khác nhau`)}${kpi('Tổng thời gian dùng', dur(us.activeS), `TB ${dur(us.avgS)} / lượt`)}${kpi('Truy cập gần nhất', ago(us.last), dt(us.last))}${kpi('Lần đầu', dd(us.first))}</div>
  <div class="card"><div class="tabs" id="utabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === userTab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="ubody" style="margin-top:12px">${body[userTab]()}</div></div>`;
  $('#utabs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; userTab = b.dataset.t; for (const x of $('#utabs').children) x.classList.toggle('on', x === b); $('#ubody').innerHTML = body[userTab](); };
  const reload = () => pageUser(id);
  $('#a-coin').onclick = () => ask('<h2>Cộng / trừ xu</h2><input id="x1" type="number" placeholder="Số xu (âm để trừ)"><input id="x2" placeholder="Ghi chú (tuỳ chọn)">', async () => { const r = await api(`/users/${id}/coins`, { delta: +$('#x1').value, note: $('#x2').value }); toast('Xu mới: ' + r.coins); reload(); });
  $('#a-name').onclick = () => ask(`<h2>Đổi tên hiển thị</h2><input id="x1" maxlength="16" value="${esc(u.name)}">`, async () => { await api(`/users/${id}/rename`, { name: $('#x1').value }); toast('Đã đổi tên'); reload(); });
  if ($('#a-av')) $('#a-av').onclick = () => ask('<h2>Xóa ảnh đại diện?</h2><p class="mut">Dùng khi ảnh vi phạm. Người chơi có thể tải ảnh khác.</p>', async () => { await api(`/users/${id}/avatar-clear`, {}); toast('Đã xóa avatar'); reload(); });
  $('#a-pw').onclick = () => ask('<h2>Đặt lại mật khẩu</h2><p class="mut">Người chơi sẽ bị đăng xuất khỏi mọi thiết bị.</p><input id="x1" type="text" placeholder="Mật khẩu mới (≥ 6 ký tự)">', async () => { await api(`/users/${id}/password`, { password: $('#x1').value }); toast('Đã đặt lại mật khẩu'); });
  $('#a-ban').onclick = () => ask(u.banned ? '<h2>Mở khóa tài khoản?</h2>' : '<h2>Khóa tài khoản?</h2><p class="mut">Người chơi bị đăng xuất và không đăng nhập lại được.</p><input id="x1" placeholder="Lý do (hiện cho người chơi)">', async () => { await api(`/users/${id}/ban`, { banned: !u.banned, reason: u.banned ? '' : $('#x1').value }); toast(u.banned ? 'Đã mở khóa' : 'Đã khóa'); reload(); });
  $('#a-del').onclick = () => ask(`<h2>Xóa vĩnh viễn?</h2><p class="mut">Xóa tài khoản, lịch sử, chuyến chạy và kết quả giải. Không hoàn tác. Gõ <b>${esc(u.username)}</b> để xác nhận.</p><input id="x1" placeholder="${esc(u.username)}">`, async () => { await api(`/users/${id}?confirm=${encodeURIComponent($('#x1').value)}`, undefined, 'DELETE'); toast('Đã xóa'); location.hash = '#/users'; }, { danger: true });
  main.onclick = null;
}

// ---------- khách / giải / hoạt động / nhật ký ----------
async function pageGuests() {
  const d = await api('/guests?page=' + guestPage);
  main.innerHTML = `<div class="bar"><h2>Khách (${fmt(d.total)})</h2><span class="mut">thiết bị chưa đăng ký tài khoản; dữ liệu chơi của khách nằm trên máy họ nên chỉ thấy lượt truy cập</span></div>
  <div class="card"><div class="tw"><table><thead><tr><th>Tên</th><th>Mã thiết bị</th><th>Thiết bị</th><th class="n">Lượt</th><th class="n">Thời gian dùng</th><th>Lần đầu</th><th>Gần nhất</th><th class="n">Giải tham gia</th></tr></thead><tbody>
  ${d.guests.map((g) => `<tr><td>${esc(g.name)}</td><td class="mut">${esc(g.vid.slice(0, 8))}…</td><td>${esc(g.device || '')}</td><td class="n">${g.sessions}</td><td class="n">${dur(g.activeS)}</td><td>${dt(g.first)}</td><td>${ago(g.last)}</td><td class="n">${g.tournaments}</td></tr>`).join('') || '<tr><td class="mut">Chưa có</td></tr>'}</tbody></table></div>${pager(d.page, d.size, d.total)}</div>`;
  main.onclick = (e) => { const p = e.target.closest('[data-pg]'); if (p) { guestPage += +p.dataset.pg; pageGuests(); } };
}
async function pageTours() {
  const d = await api('/tournaments'), st = { live: ['Đang diễn ra', 'ok'], upcoming: ['Sắp tới', 'gold'], ended: ['Đã kết thúc', ''] };
  main.innerHTML = `<div class="bar"><h2>Giải đấu (${d.tournaments.length})</h2></div><div class="card"><div class="tw"><table><thead><tr><th>Mã</th><th>Tên giải</th><th>Người tổ chức</th><th>Loại</th><th>Quyền</th><th>Bắt đầu</th><th>Kết thúc</th><th class="n">Người chơi</th><th class="n">Kết quả</th><th>Trạng thái</th><th></th></tr></thead><tbody>
  ${d.tournaments.map((t) => `<tr><td><a href="/?t=${esc(t.code)}" target="_blank">${esc(t.code)}</a></td><td>${esc(t.title)}</td><td>${esc(t.owner || '—')}</td><td>${t.kind === 'gps' ? '📍 GPS' : esc(t.map) + ' · ' + esc(t.view || '3d')}</td><td>${t.visibility === 'private' ? '🔒' : '🌐'}</td><td>${dt(t.start_at)}</td><td>${dt(t.end_at)}</td><td class="n">${t.players}</td><td class="n">${t.results}</td><td><span class="tag ${st[t.state][1]}">${st[t.state][0]}</span></td><td><button class="btn sm bad" data-del="${esc(t.code)}">Xóa</button></td></tr>`).join('') || '<tr><td class="mut">Chưa có giải</td></tr>'}</tbody></table></div></div>`;
  main.onclick = (e) => { const b = e.target.closest('[data-del]'); if (b) ask(`<h2>Xóa giải ${esc(b.dataset.del)}?</h2><p class="mut">Xóa luôn người chơi, kết quả và huy chương của giải.</p>`, async () => { await api('/tournaments/' + b.dataset.del, undefined, 'DELETE'); toast('Đã xóa giải'); pageTours(); }, { danger: true }); };
}
async function pageActivity() {
  const d = await api('/activity' + (actType ? '?type=' + actType : ''));
  main.innerHTML = `<div class="bar"><h2>Hoạt động gần đây</h2><span class="sp"></span><select id="at"><option value="">Tất cả</option>${d.types.map((x) => `<option value="${esc(x.type)}" ${x.type === actType ? 'selected' : ''}>${esc(evName(x.type))} (${x.n})</option>`).join('')}</select></div>
  <div class="card"><div class="tw"><table><thead><tr><th>Thời điểm</th><th>Người chơi</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>${d.events.map((e) => `<tr ${e.user_id ? `class="click" data-u="${e.user_id}"` : ''}><td>${dt(e.ts)}</td><td>${e.user_id ? esc(e.uname || '#' + e.user_id) + ' <span class="mut">@' + esc(e.username || '') + '</span>' : '<span class="mut">khách / ẩn danh</span>'}</td><td>${esc(evName(e.type))}</td><td class="mut">${esc(evText(e))}</td></tr>`).join('') || '<tr><td class="mut">Chưa có hoạt động</td></tr>'}</tbody></table></div></div>`;
  $('#at').onchange = (e) => { actType = e.target.value; pageActivity(); };
  main.onclick = (e) => { const r = e.target.closest('tr[data-u]'); if (r) location.hash = '#/user/' + r.dataset.u; };
}
async function pageAudit() {
  const d = await api('/audit');
  main.innerHTML = `<div class="bar"><h2>Nhật ký quản trị</h2><span class="mut">mọi thao tác của quản trị viên đều được ghi lại</span></div><div class="card"><div class="tw"><table><thead><tr><th>Thời điểm</th><th>Quản trị viên</th><th>Thao tác</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>${d.log.map((l) => `<tr><td>${dt(l.ts)}</td><td>${esc(l.admin)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td class="mut">${esc(l.data || '')}</td></tr>`).join('') || '<tr><td class="mut">Trống</td></tr>'}</tbody></table></div></div>`;
  main.onclick = null;
}
start();
