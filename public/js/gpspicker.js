// Bộ chọn tuyến GPS: điểm xuất phát (vị trí thực / địa chỉ / ghim), điểm đến, tính tuyến đi bộ, chọn 2D hoặc vệ tinh.
import { api } from './store.js';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dot = (color, label) => L.divIcon({ className: '', html: `<div style="background:${color};color:#fff;font:700 12px system-ui;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px #0006"><span style="transform:rotate(45deg)">${label}</span></div>`, iconSize: [26, 26], iconAnchor: [4, 26] });

export class GpsPicker {
  constructor(root, { cfg, toast, onChange, style = 'road' }) {
    this.cfg = cfg; this.toast = toast; this.onChange = onChange || (() => {}); this.style = style;
    this.pts = { from: null, to: null }; this.labels = { from: '', to: '' }; this.route = null; this.seq = 0;
    root.innerHTML = `<div class="gp">
      <div class="seg gp-style"><button data-s="road" class="${style === 'road' ? 'on' : ''}">🗺 Đồ họa 2D</button><button data-s="sat" class="${style === 'sat' ? 'on' : ''}">🛰 Vệ tinh</button></div>
      <div class="gp-f"><label class="lbl">Điểm xuất phát</label><div class="gp-row"><input class="gp-from" placeholder="Nhập địa chỉ…" autocomplete="off"><button type="button" class="ghost gp-loc">📍 Vị trí của tôi</button></div><div class="gp-res gp-res-from"></div></div>
      <div class="gp-f"><label class="lbl">Điểm đến</label><input class="gp-to" placeholder="Nhập địa chỉ…" autocomplete="off"><div class="gp-res gp-res-to"></div></div>
      <div class="gp-map"></div><div class="gp-info hint">Chạm lên bản đồ để đặt điểm đi, rồi điểm đến. Kéo ghim để chỉnh.</div></div>`;
    this.root = root; const $ = (s) => root.querySelector(s);
    this.el = { from: $('.gp-from'), to: $('.gp-to'), resFrom: $('.gp-res-from'), resTo: $('.gp-res-to'), info: $('.gp-info') };
    this.map = L.map($('.gp-map'), { zoomControl: true, attributionControl: true }).setView([16.05, 107.5], 5);
    this.setTiles();
    this.markers = {}; this.line = null;
    this.map.on('click', (e) => { if (!this.pts.from) this.setPoint('from', e.latlng.lat, e.latlng.lng); else if (!this.pts.to) this.setPoint('to', e.latlng.lat, e.latlng.lng); else this.toast('Kéo ghim để chỉnh điểm đi/đến'); });
    $('.gp-style').onclick = (e) => { const s = e.target.dataset.s; if (!s) return; this.style = s; root.querySelectorAll('.gp-style button').forEach((b) => b.classList.toggle('on', b.dataset.s === s)); this.setTiles(); this.onChange(this.get()); };
    $('.gp-loc').onclick = () => this.locate();
    for (const k of ['from', 'to']) {
      let t; this.el[k].addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.search(k), 600); });
      this.el['res' + (k === 'from' ? 'From' : 'To')].onclick = (e) => { const b = e.target.closest('button'); if (!b) return; this.setPoint(k, +b.dataset.lat, +b.dataset.lon, b.dataset.name); e.currentTarget.innerHTML = ''; };
    }
  }
  setTiles() {
    if (this.layer) this.map.removeLayer(this.layer);
    const t = this.cfg.tiles; this.layer = L.tileLayer(this.style === 'sat' ? t.sat : t.road, { maxZoom: this.style === 'sat' ? 18 : 19, attribution: this.style === 'sat' ? t.attrSat : t.attrRoad }).addTo(this.map);
  }
  refresh() { setTimeout(() => this.map.invalidateSize(), 50); }
  async search(k) {
    const q = this.el[k].value.trim(), box = this.el['res' + (k === 'from' ? 'From' : 'To')]; if (q.length < 3) { box.innerHTML = ''; return; }
    try {
      const r = await api('/api/geo/search?q=' + encodeURIComponent(q));
      box.innerHTML = r.results.length ? r.results.map((x) => `<button type="button" data-lat="${x.lat}" data-lon="${x.lon}" data-name="${esc(x.name)}">${esc(x.name)}</button>`).join('') : '<div class="hint">Không thấy địa chỉ này</div>';
    } catch (e) { box.innerHTML = `<div class="hint">${esc(e.message)}</div>`; }
  }
  locate() {
    if (!navigator.geolocation) return this.toast('Trình duyệt không hỗ trợ định vị. Hãy nhập địa chỉ hoặc chọn trên bản đồ.', 3500);
    this.el.info.textContent = 'Đang lấy vị trí của bạn…';
    navigator.geolocation.getCurrentPosition((p) => this.setPoint('from', p.coords.latitude, p.coords.longitude), () => { this.el.info.textContent = 'Không lấy được vị trí. Hãy nhập địa chỉ hoặc chạm lên bản đồ để chọn điểm xuất phát.'; this.toast('Không lấy được vị trí của bạn', 3000); }, { timeout: 9000, maximumAge: 60000 });
  }
  async setPoint(k, lat, lon, name) {
    this.pts[k] = [lat, lon]; this.labels[k] = name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`; this.el[k].value = name ? name.split(',').slice(0, 2).join(',') : this.labels[k];
    if (this.markers[k]) this.markers[k].setLatLng([lat, lon]);
    else { this.markers[k] = L.marker([lat, lon], { draggable: true, icon: dot(k === 'from' ? '#d2491f' : '#0b6f66', k === 'from' ? 'A' : 'B') }).addTo(this.map); this.markers[k].on('dragend', () => { const p = this.markers[k].getLatLng(); this.setPoint(k, p.lat, p.lng); }); }
    this.map.setView([lat, lon], Math.max(this.map.getZoom(), 15));
    if (!name) api(`/api/geo/reverse?lat=${lat}&lon=${lon}`).then((r) => { if (this.pts[k] && this.pts[k][0] === lat) { this.labels[k] = r.name; this.el[k].value = r.name.split(',').slice(0, 3).join(','); } }).catch(() => {});
    await this.calc();
  }
  async calc() {
    this.route = null; if (this.line) { this.map.removeLayer(this.line); this.line = null; }
    if (!this.pts.from || !this.pts.to) { this.onChange(null); return; }
    const my = ++this.seq; this.el.info.textContent = 'Đang tính tuyến đi bộ…';
    try {
      const r = await api(`/api/geo/route?from=${this.pts.from.join(',')}&to=${this.pts.to.join(',')}`);
      if (my !== this.seq) return;
      this.route = r; this.line = L.polyline(r.pts, { color: '#d2491f', weight: 5, opacity: 0.9 }).addTo(this.map); this.map.fitBounds(this.line.getBounds(), { padding: [30, 30] });
      this.el.info.innerHTML = `<b>Tuyến đi bộ ${r.km} km</b> — nhân vật sẽ chạy ảo dọc tuyến này.`;
    } catch (e) { if (my === this.seq) this.el.info.textContent = e.message; }
    this.onChange(this.get());
  }
  get() { return this.route ? { name: `${this.labels.from.split(',')[0]} → ${this.labels.to.split(',')[0]}`.slice(0, 80), pts: this.route.pts, km: this.route.km, style: this.style } : null; }
  destroy() { this.map.remove(); }
}
