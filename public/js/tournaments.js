// Giao diện giải đấu: danh sách, tạo giải (4 bước, thiết kế huy chương), trang giải, tổng kết.
import { api } from './store.js';
import { GpsPicker } from './gpspicker.js';
import { medalSvg, MEDAL_NAMES } from './medal.js';
const S = window.Shared;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATE = { upcoming: ['Sắp diễn ra', '#0ea5e9'], lobby: ['Chờ giờ G', '#f59e0b'], open: ['Đang diễn ra', '#22c55e'], closing: ['Đang tổng kết', '#a855f7'], final: ['Đã tổng kết', '#8b95a1'] };
const fmtDT = (t) => new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const MEDAL_DEF = {
  gold: { shape: 'circle', color: '#f2c230', ribbon: '#d2491f', icon: '🏆', text: 'HẠNG 1' }, silver: { shape: 'circle', color: '#c0c7cf', ribbon: '#d2491f', icon: '🏃', text: 'HẠNG 2' },
  bronze: { shape: 'circle', color: '#c27a3a', ribbon: '#d2491f', icon: '🏃', text: 'HẠNG 3' }, finisher: { shape: 'circle', color: '#35a89a', ribbon: '#d2491f', icon: '🌿', text: 'VỀ ĐÍCH' }
};
const SHAPE_NAME = { circle: 'Tròn', shield: 'Khiên', star: 'Sao', hex: 'Lục giác' };

export function createTournamentUI(ctx) {
  const { store, cfg, toast, fmt } = ctx;
  const root = () => document.getElementById('tour-root');
  let picker = null, liveTimer = 0, refreshTimer = 0;
  const stop = () => { clearInterval(liveTimer); clearInterval(refreshTimer); if (picker) { try { picker.destroy(); } catch { /* đã hủy */ } picker = null; } };
  const pill = (st) => `<span class="pill" style="background:${STATE[st][1]}">${STATE[st][0]}</span>`;
  const courseName = (t) => (t.kind === 'sim' ? (S.MAPS.find((m) => m.id === t.map) || { name: '?' }).name : 'GPS · ' + (t.route ? t.route.name : ''));
  const shell = (title, body, back = 'list') => `<div class="tourbar"><button class="ghost" data-act="${back === 'lobby' ? 'lobby' : 'list'}">← ${back === 'lobby' ? 'Về sảnh' : 'Giải đấu'}</button><h2>${title}</h2></div>${body}`;

  // ---------- danh sách ----------
  async function list(tab = 'public') {
    stop(); ctx.show('tour');
    root().innerHTML = shell('🏅 Giải đấu', '<p class="sub">Đang tải…</p>', 'lobby');
    let items = []; try { items = (await api(tab === 'mine' ? '/api/tournaments/mine' : '/api/tournaments/public')).tournaments; } catch (e) { items = []; }
    const card = (t) => `<button class="tcard" data-code="${t.code}"><div class="row">${pill(t.state)}<span class="hint">${t.visibility === 'private' ? '🔒 Riêng tư' : '🌐 Công khai'}</span></div><b>${esc(t.title)}</b>
      <span class="hint">${esc(courseName(t))} · ${t.cats.map((c) => c.km + ' km').join(' / ')}</span><span class="hint">${fmtDT(t.startAt)} → ${fmtDT(t.endAt)} · ${t.participants} người</span></button>`;
    root().innerHTML = shell('🏅 Giải đấu', `
      <div class="seg" id="tour-tabs"><button data-tab="public" class="${tab === 'public' ? 'on' : ''}">Công khai</button><button data-tab="mine" class="${tab === 'mine' ? 'on' : ''}">Của tôi</button></div>
      <div class="tourtools"><form id="tour-code" class="row"><input id="tc-in" placeholder="Dán mã hoặc link giải (vd: K7QX2M)" maxlength="80"><button class="primary">Vào giải</button></form>
        ${store.mode === 'account' ? '<button class="primary" data-act="create">＋ Tạo giải</button>' : '<span class="hint">Cần tài khoản để tạo giải. Khách vẫn tham gia được bằng link.</span>'}</div>
      <div class="tgrid">${items.length ? items.map(card).join('') : `<p class="sub">${tab === 'mine' ? 'Bạn chưa tạo hoặc tham gia giải nào.' : 'Chưa có giải công khai nào. Hãy tạo giải đầu tiên!'}</p>`}</div>`, 'lobby');
  }

  // ---------- trang giải ----------
  let detail = null, offset = 0;
  async function open(code, opt = {}) {
    stop(); ctx.show('tour'); code = String(code).trim().toUpperCase().replace(/^.*[?&]t=/, '').slice(0, 6);
    let t; try { t = (await api(`/api/tournaments/${code}`)).tournament; } catch (e) { toast(e.message); return list(); }
    detail = t; offset = t.serverNow - Date.now(); render(opt);
    if (t.kind === 'sim' && t.view !== '3d' && t.state !== 'final') { const m = S.MAPS.find((x) => x.id === t.map); if (m && ctx.prefetch) ctx.prefetch(m, t.view, (d, n, f, fin) => { const el = document.getElementById('t-prefetch'); if (el) el.textContent = fin ? '✓ Ảnh bản đồ đã sẵn sàng trên thiết bị.' : `Đang tải ảnh bản đồ ${d}/${n}…`; }); }
    refreshTimer = setInterval(async () => { try { const n = (await api(`/api/tournaments/${code}`)).tournament; if (n.state !== detail.state || n.participants !== detail.participants || JSON.stringify(n.standings) !== JSON.stringify(detail.standings)) { detail = n; offset = n.serverNow - Date.now(); render(opt); } } catch { /* mạng lỗi tạm thời */ } }, 15000);
  }
  function render(opt = {}) {
    const t = detail, link = `${location.origin}/?t=${t.code}`, mine = t.mine || { joined: false, attempts: {}, awards: [] }, now = Date.now() + offset;
    const cat = opt.cat || t.cats[0].id, st = t.standings[cat] || [];
    const awards = mine.awards.map((a) => `<div class="awd">${medalSvg(t.medals[a.kind], 64)}<span>${MEDAL_NAMES[a.kind]}<br><b>${fmt.time(a.timeS)}</b></span></div>`).join('');
    const start = t.cats.map((c) => {
      const used = mine.attempts[c.id] || 0, left = t.attempts ? t.attempts - used : null;
      const dis = t.state === 'lobby' ? 'disabled' : t.state !== 'open' || (left !== null && left <= 0) ? 'disabled' : '';
      return `<button class="primary" data-act="run" data-cat="${c.id}" ${dis}>Chạy ${c.km} km${left !== null ? ` (còn ${Math.max(0, left)} lượt)` : ''}</button>`;
    }).join('');
    root().innerHTML = shell(esc(t.title), `
      <div class="tdet">
        <div class="box"><div class="row">${pill(t.state)}<span class="hint">${t.visibility === 'private' ? '🔒 Riêng tư: chỉ người có link mới vào được' : '🌐 Công khai'}</span></div>
          <p class="sub">${esc(t.descr || '')}</p>
          <div class="kv2"><div>Tổ chức<b>${esc(t.owner)}</b></div><div>Bản đồ<b>${esc(courseName(t))}</b></div>${t.kind === 'sim' ? `<div>Hiển thị<b>${{ '3d': 'Cảnh 3D', road: 'Bản đồ 2D', sat: 'Vệ tinh' }[t.view] || 'Cảnh 3D'}</b></div>` : `<div>Hiển thị<b>${t.route && t.route.style === 'sat' ? 'Vệ tinh' : 'Bản đồ 2D'}</b></div>`}<div>Bắt đầu<b>${fmtDT(t.startAt)}</b></div><div>Kết thúc<b>${fmtDT(t.endAt)}</b></div><div>Người chơi<b>${t.participants}</b></div>${t.liveAt ? `<div>Giờ G (cùng xuất phát)<b>${fmtDT(t.liveAt)}</b></div>` : ''}</div>
          <div class="fld"><label class="lbl">Link mời</label><div class="row"><input id="t-link" value="${link}" readonly><button class="ghost" data-act="copy">Sao chép</button></div>
            ${t.visibility === 'private' ? '<div class="hint">Giải riêng tư không hiện trong danh sách; chỉ người nhận được link này mới vào được.</div>' : ''}</div></div>
        <div class="box"><h3>Huy chương</h3><div class="medals">${['gold', 'silver', 'bronze', 'finisher'].map((k) => `<div class="mcell">${medalSvg(t.medals[k], 70)}<span>${MEDAL_NAMES[k]}</span></div>`).join('')}</div>
          <p class="hint">Phong trào: chỉ cần hoàn thành cự ly trước khi giải kết thúc.</p>${awards ? `<h3>Huy chương của bạn</h3><div class="row">${awards}</div>` : ''}</div>
      </div>
      <div class="box tact">${t.state === 'lobby' ? `<div class="live"><b>Giờ G còn</b> <span id="countdown">--:--</span><div class="hint">Bấm "Sẵn sàng", tới giờ G mọi người xuất phát cùng lúc và thấy nhau trên đường.</div><div class="row"><div class="seg" id="live-cat">${t.cats.map((c, i) => `<button data-cat="${c.id}" class="${i === 0 ? 'on' : ''}">${c.km} km</button>`).join('')}</div><button class="primary" data-act="ready">Sẵn sàng</button></div></div>` : ''}
        ${!mine.joined && t.state !== 'final' && t.state !== 'closing' ? '<button class="primary" data-act="join">Tham gia giải</button>' : ''}
        <div class="row" style="flex-wrap:wrap;gap:8px">${start}</div>
        <div class="seg mode" id="t-mode"><button data-m="manual" class="${ctx.getMode() === 'manual' ? 'on' : ''}">Thủ công</button><button data-m="auto" class="${ctx.getMode() === 'auto' ? 'on' : ''}">Tự động</button></div>
        <div class="hint" id="t-prefetch"></div><div class="hint">Giải áp dụng chung cho cả thủ công và tự động; bạn đổi giữa hai kiểu bất cứ lúc nào khi đang chạy. Mọi người dùng chung một bộ chướng ngại và vật phẩm.${t.kind === 'gps' ? ' Tuyến GPS do người tổ chức đặt, bạn không cần cấp quyền vị trí.' : ''}</div></div>
      <div class="box"><div class="seg" id="t-cats">${t.cats.map((c) => `<button data-cat="${c.id}" class="${c.id === cat ? 'on' : ''}">${c.km} km</button>`).join('')}</div>
        <h3>${t.state === 'final' ? 'Tổng kết' : 'Bảng xếp hạng'} · ${t.cats.find((c) => c.id === cat).km} km</h3>
        ${t.state === 'final' && st.length ? podium(t, st) : ''}
        <div class="tw"><table><thead><tr><th>#</th><th>Tên</th><th>Kết quả</th></tr></thead><tbody>${st.length ? st.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.rank}</td><td>${r.avatar ? `<img class="avs sm" src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)}</td><td>${r.status === 'finished' ? '<b>' + fmt.time(r.timeS) + '</b>' : `Chưa về đích · ${(r.distM / 1000).toFixed(2)} km`}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--mut)">Chưa có kết quả</td></tr>'}</tbody></table></div></div>`);
    if (t.state === 'lobby') { clearInterval(liveTimer); liveTimer = setInterval(tick, 250); tick(); }
    root().dataset.cat = cat;
  }
  function podium(t, st) {
    const top = st.filter((r) => r.status === 'finished').slice(0, 3), order = [top[1], top[0], top[2]], kinds = ['silver', 'gold', 'bronze'];
    return `<div class="podium">${order.map((r, i) => r ? `<div class="pod p${i}">${medalSvg(t.medals[kinds[i]], i === 1 ? 92 : 72)}<b>${r.avatar ? `<img class="avs" src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)}</b><span>${fmt.time(r.timeS)}</span></div>` : '<div></div>').join('')}</div>
      <p class="hint">${st.filter((r) => r.status === 'finished').length} người về đích và nhận huy chương (3 người đầu nhận huy chương hạng, còn lại nhận huy chương phong trào).</p>`;
  }
  let ready = null;
  function tick() {
    const t = detail; if (!t || t.state !== 'lobby') return; const left = t.liveAt - (Date.now() + offset), el = document.getElementById('countdown');
    if (el) { const s = Math.max(0, Math.ceil(left / 1000)); el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
    if (left <= 0) { clearInterval(liveTimer); if (ready) { const r = ready; ready = null; ctx.launchTour(t, r.cat, ctx.getMode()); } else { open(t.code); } }
  }

  // ---------- tạo giải ----------
  let draft = null;
  function create(step = 1) {
    stop(); ctx.show('tour');
    if (!draft) { const now = Date.now(); draft = { title: '', descr: '', visibility: 'public', startAt: now + 5 * 60e3, endAt: now + 7 * 864e5, live: false, liveAt: now + 3600e3, kind: 'sim', view: '3d', map: S.MAPS[0].id, cats: [{ km: 5 }], attempts: 3, medals: JSON.parse(JSON.stringify(MEDAL_DEF)), route: null, editing: 'gold' }; }
    const steps = ['Thông tin', 'Thể thức', 'Huy chương', 'Xuất bản'], d = draft;
    const head = `<div class="steps">${steps.map((n, i) => `<span class="${i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''}">${i + 1}. ${n}</span>`).join('')}</div>`;
    let body = '';
    if (step === 1) body = `<div class="form"><input id="d-title" maxlength="60" placeholder="Tên giải (vd: Giải chạy cuối tuần)" value="${esc(d.title)}"><textarea id="d-descr" maxlength="300" placeholder="Mô tả ngắn">${esc(d.descr)}</textarea>
      <div class="seg" id="d-vis"><button data-v="public" class="${d.visibility === 'public' ? 'on' : ''}">🌐 Công khai</button><button data-v="private" class="${d.visibility === 'private' ? 'on' : ''}">🔒 Riêng tư</button></div>
      <div class="hint">Công khai: ai cũng thấy trong danh sách. Riêng tư: chỉ người nhận được link mới vào được.</div>
      <label class="lbl">Bắt đầu</label><input id="d-start" type="datetime-local" value="${toLocalInput(d.startAt)}"><label class="lbl">Kết thúc (tối đa 31 ngày)</label><input id="d-end" type="datetime-local" value="${toLocalInput(d.endAt)}">
      <label class="chk"><input type="checkbox" id="d-live" ${d.live ? 'checked' : ''}> Có giờ G (mọi người xuất phát cùng lúc và thấy nhau)</label><input id="d-liveat" type="datetime-local" value="${toLocalInput(d.liveAt)}" ${d.live ? '' : 'hidden'}></div>`;
    else if (step === 2) body = `<div class="seg" id="d-kind"><button data-k="sim" class="${d.kind === 'sim' ? 'on' : ''}">Giả lập 3D</button><button data-k="gps" class="${d.kind === 'gps' ? 'on' : ''}">GPS (tuyến thật)</button></div>
      <div id="d-course">${d.kind === 'sim' ? `<div class="mapsel">${S.MAPS.map((m) => `<button data-map="${m.id}" class="${m.id === d.map ? 'on' : ''}">${esc(m.name)}<small>${m.km} km · ${'★'.repeat(m.diff)}</small></button>`).join('')}</div>
        <label class="lbl">Hiển thị khi chạy (mọi người thấy giống nhau)</label><div class="seg" id="d-view">${[['3d', 'Cảnh 3D'], ['road', 'Bản đồ 2D'], ['sat', 'Vệ tinh']].map(([k, n]) => `<button data-v="${k}" class="${d.view === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : '<div id="d-gps"></div>'}</div>
      <label class="lbl">Cự ly (tối đa 4, mỗi cự ly một bảng xếp hạng)</label><div id="d-cats">${d.cats.map((c, i) => `<div class="row"><input type="number" class="catkm" data-i="${i}" min="0.3" step="0.1" value="${c.km}"> km ${d.cats.length > 1 ? `<button class="ghost" data-act="delcat" data-i="${i}">Xóa</button>` : ''}</div>`).join('')}</div>
      ${d.cats.length < 4 ? '<button class="ghost" data-act="addcat">＋ Thêm cự ly</button>' : ''}
      <label class="lbl">Số lượt chạy mỗi người / cự ly</label><select id="d-att">${[1, 2, 3, 5, 10, 0].map((n) => `<option value="${n}" ${d.attempts === n ? 'selected' : ''}>${n ? n + ' lượt' : 'Không giới hạn'}</option>`).join('')}</select>`;
    else if (step === 3) { const e = d.medals[d.editing]; body = `<div class="medals big">${['gold', 'silver', 'bronze', 'finisher'].map((k) => `<button class="mcell ${k === d.editing ? 'on' : ''}" data-edit="${k}">${medalSvg(d.medals[k], 84)}<span>${MEDAL_NAMES[k]}</span></button>`).join('')}</div>
      <div class="box"><h3>Thiết kế: ${MEDAL_NAMES[d.editing]}</h3>
        <label class="lbl">Hình dáng</label><div class="seg" id="m-shape">${S.MEDAL_SHAPES.map((s) => `<button data-s="${s}" class="${e.shape === s ? 'on' : ''}">${SHAPE_NAME[s]}</button>`).join('')}</div>
        <div class="row"><label class="lbl">Màu huy chương <input type="color" id="m-color" value="${e.color}"></label><label class="lbl">Màu dây đeo <input type="color" id="m-ribbon" value="${e.ribbon}"></label></div>
        <label class="lbl">Biểu tượng</label><div class="icons" id="m-icon">${S.MEDAL_ICONS.map((i) => `<button data-i="${i}" class="${e.icon === i ? 'on' : ''}">${i}</button>`).join('')}</div>
        <label class="lbl">Chữ khắc (tối đa 12 ký tự)</label><input id="m-text" maxlength="12" value="${esc(e.text)}"></div>`; }
    else body = `<div class="box"><h3>${esc(d.title || '(chưa đặt tên)')}</h3><p class="sub">${esc(d.descr)}</p><div class="kv2"><div>Chế độ<b>${d.visibility === 'public' ? 'Công khai' : 'Riêng tư'}</b></div><div>Thời gian<b>${fmtDT(d.startAt)} → ${fmtDT(d.endAt)}</b></div><div>Bản đồ<b>${d.kind === 'sim' ? esc(S.MAPS.find((m) => m.id === d.map).name) : esc(d.route ? d.route.name : '—')}</b></div><div>Cự ly<b>${d.cats.map((c) => c.km + ' km').join(' / ')}</b></div>${d.live ? `<div>Giờ G<b>${fmtDT(d.liveAt)}</b></div>` : ''}<div>Lượt chạy<b>${d.attempts || 'Không giới hạn'}</b></div></div>
      <div class="medals">${['gold', 'silver', 'bronze', 'finisher'].map((k) => `<div class="mcell">${medalSvg(d.medals[k], 64)}<span>${MEDAL_NAMES[k]}</span></div>`).join('')}</div><div id="pub-res"></div></div>`;
    root().innerHTML = shell('＋ Tạo giải đấu', `${head}${body}<div class="row navrow">${step > 1 ? `<button class="ghost" data-act="prev" data-step="${step}">← Quay lại</button>` : ''}${step < 4 ? `<button class="primary" data-act="next" data-step="${step}">Tiếp tục →</button>` : '<button class="primary" data-act="publish">Xuất bản giải</button>'}</div>`);
    if (step === 2 && d.kind === 'gps') { picker = new GpsPicker(document.getElementById('d-gps'), { cfg, toast, style: d.route ? d.route.style : 'road', onChange: (r) => { d.route = r; if (r) d.cats = d.cats.map((c) => ({ km: Math.min(c.km, r.km) })); } }); if (d.route) { picker.route = { pts: d.route.pts, km: d.route.km }; picker.style = d.route.style; } picker.refresh(); }
  }
  function readStep(step) {
    const d = draft, v = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
    if (step === 1) {
      d.title = v('d-title').trim(); d.descr = v('d-descr').trim(); d.startAt = new Date(v('d-start')).getTime(); d.endAt = new Date(v('d-end')).getTime(); d.live = document.getElementById('d-live').checked; d.liveAt = new Date(v('d-liveat')).getTime();
      if (d.title.length < 3) return 'Tên giải tối thiểu 3 ký tự'; if (!(d.endAt > d.startAt)) return 'Thời gian kết thúc phải sau thời gian bắt đầu'; if (d.endAt < Date.now()) return 'Thời gian kết thúc phải ở tương lai';
      if (d.endAt - d.startAt > 31 * 864e5) return 'Giải kéo dài tối đa 31 ngày'; if (d.live && !(d.liveAt >= d.startAt && d.liveAt <= d.endAt)) return 'Giờ G phải nằm trong thời gian giải';
    } else if (step === 2) {
      d.attempts = +v('d-att'); d.cats = [...document.querySelectorAll('.catkm')].map((e) => ({ km: Math.round(+e.value * 10) / 10 }));
      const max = d.kind === 'sim' ? S.MAPS.find((m) => m.id === d.map).km : d.route ? d.route.km : 0;
      if (d.kind === 'gps' && !d.route) return 'Hãy chọn điểm đi và điểm đến để tạo tuyến GPS'; if (d.cats.some((c) => !(c.km >= 0.3 && c.km <= max))) return `Mỗi cự ly từ 0,3 đến ${max} km (độ dài bản đồ/tuyến)`;
    } return null;
  }
  async function publish() {
    const d = draft, b = { title: d.title, descr: d.descr, visibility: d.visibility, startAt: d.startAt, endAt: d.endAt, liveAt: d.live ? d.liveAt : null, kind: d.kind, view: d.view, map: d.map, route: d.route, cats: d.cats, attempts: d.attempts, medals: d.medals };
    try { const r = await api('/api/tournaments', b); draft = null; document.getElementById('pub-res').innerHTML = `<div class="ok">🎉 Đã tạo giải! Gửi link này cho mọi người:<div class="row"><input id="t-link" value="${r.url}" readonly><button class="ghost" data-act="copy">Sao chép</button></div><button class="primary" data-open-code="${r.code}">Mở trang giải</button></div>`; document.querySelector('.navrow').hidden = true; }
    catch (e) { toast(e.message, 3500); }
  }

  // ---------- sự kiện ----------
  document.addEventListener('click', async (e) => {
    const r = root(); if (!r || !r.contains(e.target)) return;
    const card = e.target.closest('.tcard'); if (card) return open(card.dataset.code);
    const oc = e.target.closest('[data-open-code]'); if (oc) return open(oc.dataset.openCode);
    const tab = e.target.closest('#tour-tabs button'); if (tab) return list(tab.dataset.tab);
    const act = e.target.closest('[data-act]'); const a = act && act.dataset.act;
    const catBtn = e.target.closest('#t-cats button'); if (catBtn) return render({ cat: catBtn.dataset.cat });
    const liveCat = e.target.closest('#live-cat button'); if (liveCat) { document.querySelectorAll('#live-cat button').forEach((b) => b.classList.toggle('on', b === liveCat)); if (ready) ready.cat = liveCat.dataset.cat; return; }
    const mode = e.target.closest('#t-mode button'); if (mode) { ctx.setMode(mode.dataset.m); document.querySelectorAll('#t-mode button').forEach((b) => b.classList.toggle('on', b === mode)); return; }
    // tạo giải
    if (e.target.closest('#d-vis button')) { const d = draft; readStep(1); d.visibility = e.target.dataset.v; return create(1); }
    if (e.target.closest('#d-view button')) { readStep(2); draft.view = e.target.dataset.v; return create(2); }
    if (e.target.closest('#d-kind button')) { readStep(2); draft.kind = e.target.dataset.k; if (draft.kind === 'sim') draft.cats = draft.cats.map((c) => ({ km: Math.min(c.km, S.MAPS.find((m) => m.id === draft.map).km) })); return create(2); }
    const mp = e.target.closest('[data-map]'); if (mp) { readStep(2); draft.map = mp.dataset.map; draft.cats = draft.cats.map((c) => ({ km: Math.min(c.km, S.MAPS.find((m) => m.id === draft.map).km) })); return create(2); }
    const ed = e.target.closest('[data-edit]'); if (ed) { draft.editing = ed.dataset.edit; return create(3); }
    const sh = e.target.closest('#m-shape button'); if (sh) { draft.medals[draft.editing].shape = sh.dataset.s; return create(3); }
    const ic = e.target.closest('#m-icon button'); if (ic) { draft.medals[draft.editing].icon = ic.dataset.i; return create(3); }
    if (!a) return;
    if (a === 'lobby') { stop(); return ctx.toLobby(); }
    if (a === 'list') return list();
    if (a === 'create') return create(1);
    if (a === 'addcat') { readStep(2); draft.cats.push({ km: draft.cats[draft.cats.length - 1].km }); return create(2); }
    if (a === 'delcat') { readStep(2); draft.cats.splice(+act.dataset.i, 1); return create(2); }
    if (a === 'prev') return create(+act.dataset.step - 1);
    if (a === 'next') { const step = +act.dataset.step, err = readStep(step); if (err) return toast(err, 3000); return create(step + 1); }
    if (a === 'publish') return publish();
    if (a === 'copy') { const i = document.getElementById('t-link'); try { await navigator.clipboard.writeText(i.value); toast('Đã sao chép link ✓'); } catch { i.select(); toast('Hãy nhấn Ctrl/Cmd+C để sao chép'); } return; }
    // tham gia / chạy
    if (a === 'join') { try { detail = (await api(`/api/tournaments/${detail.code}/join`, {})).tournament; render({ cat: root().dataset.cat }); toast('Đã tham gia giải ✓'); } catch (er) { toast(er.message); } return; }
    if (a === 'ready') { const cat = (document.querySelector('#live-cat button.on') || {}).dataset.cat || detail.cats[0].id; ready = { cat }; act.textContent = '✓ Đã sẵn sàng — chờ giờ G'; act.disabled = true; try { await api(`/api/tournaments/${detail.code}/join`, {}); } catch { /* đã tham gia */ } return; }
    if (a === 'run') { const t = detail, cat = act.dataset.cat; try { await api(`/api/tournaments/${t.code}/join`, {}); await ctx.launchTour(t, cat, ctx.getMode()); } catch (er) { toast(er.message, 3500); } return; }
  });
  document.addEventListener('change', (e) => {
    if (!root() || !root().contains(e.target)) return;
    if (e.target.id === 'd-live') { document.getElementById('d-liveat').hidden = !e.target.checked; }
    else if (e.target.id === 'm-color') { draft.medals[draft.editing].color = e.target.value; create(3); }
    else if (e.target.id === 'm-ribbon') { draft.medals[draft.editing].ribbon = e.target.value; create(3); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'm-text' && draft) { draft.medals[draft.editing].text = e.target.value.slice(0, 12); const cell = document.querySelector(`[data-edit="${draft.editing}"]`); if (cell) cell.querySelector('svg').outerHTML = medalSvg(draft.medals[draft.editing], 84); } });
  document.getElementById('tour-root').addEventListener('submit', (e) => { if (e.target.id === 'tour-code') { e.preventDefault(); const v = document.getElementById('tc-in').value.trim(); if (v) open(v); } });

  return { list, open, create, stop, cancelReady: () => { ready = null; } };
}
