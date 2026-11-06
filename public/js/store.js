// Lưu hồ sơ: tài khoản -> server (SQLite); khách -> localStorage trên máy này (có thể gộp vào tài khoản sau).
const S = window.Shared;
const GK = 'chayonline.guest.v1', GBK = 'chayonline.guest.backup';
export const dayOf = (t = Date.now()) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const r1 = (v) => Math.round(v * 10) / 10;
const ITEM_KEYS = ['water', 'banana', 'melon', 'elec', 'bolt', 'magnet', 'shield', 'coin'];
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);

let GUEST_HDR = {};
export async function api(path, body, method, ms = 15000) {
  const opt = { headers: { ...GUEST_HDR } }, ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac ? setTimeout(() => ac.abort(), ms) : 0;   // quá thời gian thì hủy, không để treo màn hình
  if (ac) opt.signal = ac.signal;
  if (body !== undefined) { opt.method = method || 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  try {
    const r = await fetch(path, opt), j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Có lỗi xảy ra'); e.status = r.status; throw e; }
    return j;
  } catch (e) { if (e.name === 'AbortError') { const x = new Error('Mạng chậm, hết thời gian chờ'); x.network = true; throw x; } if (!e.status) e.network = true; throw e; }
  finally { clearTimeout(tm); }
}
const safeGet = (k = GK) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const safeSet = (v) => { try { localStorage.setItem(GK, JSON.stringify(v)); } catch { /* bộ nhớ đầy hoặc bị chặn */ } };

export class Store {
  constructor() { this.mode = null; this.me = null; this.guest = null; this.runId = 0; this.run = null; this.acc = this.blank(); this.invTimer = 0; }
  blank() { return { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} }; }
  setGuestHeaders() { GUEST_HDR = this.mode === 'guest' ? { 'X-Guest': this.guest.gid, 'X-Name': encodeURIComponent(this.guest.name) } : {}; }

  async init() {
    const r = await api('/api/me').catch(() => ({ me: null }));
    if (r.me) { this.mode = 'account'; this.me = r.me; this.setGuestHeaders(); return true; }
    const g = safeGet();
    if (g && g.name) { this.mode = 'guest'; this.guest = this.fixGuest(g); this.setGuestHeaders(); return true; }
    return false;
  }
  fixGuest(g) { g.gid = g.gid || rid(); g.daily = g.daily || {}; g.inventory = g.inventory || []; g.coins = g.coins || 0; g.coinRem = g.coinRem || 0; g.owned = g.owned || []; g.equip = g.equip || {}; return g; }
  hasGuestData() { const g = safeGet(); return !!(g && g.daily && Object.keys(g.daily).length); }
  startGuest(name) {
    this.mode = 'guest'; this.guest = this.fixGuest(safeGet() || { name: '', created: Date.now() });
    this.guest.name = String(name || 'Khách').replace(/[<>]/g, '').trim().slice(0, 16) || 'Khách';
    safeSet(this.guest); this.setGuestHeaders();
  }
  async login(username, password, register, name) {
    const r = await api(register ? '/api/register' : '/api/login', { username, password, name });
    this.mode = 'account'; this.me = r.me; this.setGuestHeaders(); return r.me;
  }
  async logout() { if (this.mode === 'account') await api('/api/logout', {}); this.mode = null; this.me = null; this.setGuestHeaders(); }
  async refresh() { if (this.mode === 'account') this.me = (await api('/api/me')).me; }

  // Gộp dữ liệu khách (lưu trên máy) vào tài khoản vừa đăng nhập
  guestSummary() { const g = safeGet(); if (!g || !g.daily) return null; let m = 0, st = 0; for (const d of Object.values(g.daily)) { m += d.gameM || 0; st += d.steps || 0; } return { km: r1(m / 1000), steps: st, days: Object.keys(g.daily).length, coins: g.coins || 0, owned: (g.owned || []).length }; }
  async mergeGuest() {
    const g = safeGet(); if (!g) throw new Error('Không có dữ liệu khách trên máy này');
    const r = await api('/api/import', { guest: g });
    try { localStorage.setItem(GBK, JSON.stringify(g)); localStorage.removeItem(GK); } catch { /* bỏ qua */ }
    this.me = r.me; return r;
  }

  // Hồ sơ hợp nhất cho giao diện
  profile() {
    if (this.mode === 'account') return { ...this.me, mode: 'account', inventory: this.me.inventory || [], equip: { ...S.SHOP_DEFAULT, ...(this.me.equip || {}) } };
    const g = this.guest, t = { gameM: 0, steps: 0, secs: 0, items: {} };
    for (const d of Object.values(g.daily)) { t.gameM += d.gameM; t.steps += d.steps; t.secs += d.secs; for (const k of ITEM_KEYS) t.items[k] = (t.items[k] || 0) + ((d.items || {})[k] || 0); }
    const today = g.daily[dayOf()], gameKm = r1(t.gameM / 1000);
    return { mode: 'guest', name: g.name, stravaLinked: false, lastSync: 0, totals: { gameKm, realKm: 0, totalKm: gameKm, steps: t.steps, secs: t.secs, items: t.items },
      today: { gameKm: r1((today ? today.gameM : 0) / 1000), realKm: 0 }, inventory: g.inventory || [], coins: g.coins, owned: g.owned, equip: { ...S.SHOP_DEFAULT, ...g.equip }, avatar: g.avatar || null };
  }

  // ----- chuyến chạy tự do -----
  async startRun(map, dist, mode) {
    this.acc = this.blank(); this.run = { kind: 'free' };
    if (this.mode === 'account') { try { this.runId = (await api('/api/run/start', { map, dist, mode })).runId; } catch { this.runId = 0; } }
  }
  // ----- chuyến chạy trong giải đấu (khách cũng chạy được, kết quả lưu trên server) -----
  async startTourRun(code, cat, mode) {
    this.acc = this.blank();
    const r = await api(`/api/tournaments/${code}/start`, { cat, mode }); this.runId = r.runId; this.run = { kind: 'tour', code }; return r;
  }
  record(d) {
    const a = this.acc;
    for (const k of ['steps', 'meters', 'jumps', 'bites', 'boltsUsed', 'secs']) a[k] += d[k] || 0;
    for (const k of ITEM_KEYS) a.items[k] = (a.items[k] || 0) + ((d.items || {})[k] || 0);
  }
  async flush(done, finished) {
    const a = this.acc; if (!a.steps && !a.secs && !done) return null;
    this.acc = this.blank();
    const tour = this.run && this.run.kind === 'tour';
    if (this.mode === 'account' || tour) {
      if (!this.runId) return null;
      try {
        const r = await api(tour ? `/api/tournaments/${this.run.code}/flush` : '/api/run/flush', { runId: this.runId, ...a, done: done ? 1 : 0 });
        if (this.mode === 'account') await this.refresh();
        if (tour && this.mode === 'guest') this.guestEarn(a, finished);      // khách: xu lưu trên máy
        return r;
      } catch (e) { this.record(a); return { error: e.message }; }       // lỗi mạng: giữ lại, gửi lần sau
    }
    this.guestEarn(a, finished, true); return null;
  }
  // ----- gửi kết quả cuối chuyến: có thử lại, hết thời gian chờ, và hộp thư đi lưu trên máy để gửi lại sau nếu mạng lỗi -----
  snapshotRun() { return { runId: this.runId, run: this.run }; }
  async flushFinal(snap, finished) {
    const a = this.acc; this.acc = this.blank();
    const tour = snap.run && snap.run.kind === 'tour';
    if (this.mode !== 'account' && !tour) { this.guestEarn(a, finished, true); return { ok: true, local: true, finished }; }
    if (!snap.runId) return null;
    const url = tour ? `/api/tournaments/${snap.run.code}/flush` : '/api/run/flush', body = { runId: snap.runId, ...a, done: 1, fin: finished ? 1 : 0 };
    for (let i = 0; i < 3; i++) {
      try {
        const r = await api(url, body, 'POST', 9000);
        if (tour && this.mode === 'guest') this.guestEarn(a, finished);        // khách: xu lưu trên máy
        return r;
      } catch (e) {
        if (!e.network) return { error: e.message, fatal: true };               // lỗi do server từ chối (hết hạn giải...): gửi lại cũng vô ích
        await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
      }
    }
    this.pushOutbox({ url, body, guestEarn: tour && this.mode === 'guest' ? { a, finished } : null, at: Date.now() });
    return { error: 'Mạng yếu', pending: true };
  }
  outbox() { try { return JSON.parse(localStorage.getItem('chay.outbox') || '[]'); } catch { return []; } }
  pushOutbox(e) { try { const o = this.outbox(); o.push(e); localStorage.setItem('chay.outbox', JSON.stringify(o.slice(-20))); } catch { /* bộ nhớ đầy */ } }
  async retryOutbox() {                                                          // gửi lại kết quả còn kẹt (mở lại trang, có mạng trở lại...)
    if (this.retrying) return 0; const list = this.outbox(); if (!list.length) return 0; this.retrying = true; let ok = 0; const keep = [];
    try {
      for (const e of list) {
        try { await api(e.url, e.body, 'POST', 9000); ok++; if (e.guestEarn && this.guest) this.guestEarn(e.guestEarn.a, e.guestEarn.finished); }
        catch (er) { if (er.network && Date.now() - e.at < 3 * 864e5) keep.push(e); }       // lỗi mạng: giữ lại; lỗi server hoặc quá 3 ngày: bỏ
      }
      try { localStorage.setItem('chay.outbox', JSON.stringify(keep)); } catch { /* bỏ */ }
      if (ok && this.mode === 'account') await this.refresh().catch(() => {});
    } finally { this.retrying = false; }
    return ok;
  }
  guestEarn(a, finished, saveDaily) {
    const g = this.guest; if (!g) return;
    if (saveDaily) {
      const day = dayOf(), d = g.daily[day] || (g.daily[day] = { gameM: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: {} });
      d.gameM += a.meters; d.steps += a.steps; d.secs += a.secs; d.bites += a.bites; d.jumps += a.jumps;
      for (const k of ITEM_KEYS) d.items[k] = (d.items[k] || 0) + (a.items[k] || 0);
    }
    const earn = g.coinRem + a.meters / 1000 * S.COIN.PER_KM_GAME;
    g.coins += Math.floor(earn) + (a.items.coin || 0) + (finished ? S.COIN.FINISH : 0); g.coinRem = earn - Math.floor(earn); safeSet(g);
  }
  // ảnh đại diện: tài khoản lưu trên server (mọi người thấy), khách lưu trên trình duyệt (chỉ mình thấy)
  async setAvatar(dataUrl) {
    if (this.mode === 'guest') { this.guest.avatar = dataUrl; safeSet(this.guest); return; }
    const r = await api('/api/avatar', { data: dataUrl }); this.me = r.me;
  }
  async clearAvatar() {
    if (this.mode === 'guest') { delete this.guest.avatar; safeSet(this.guest); return; }
    const r = await api('/api/avatar', undefined, 'DELETE'); this.me = r.me;
  }
  saveInventory(inv) {
    const clean = inv.map((s) => ({ k: s.k, n: s.n }));
    if (this.mode === 'guest') { this.guest.inventory = clean; clearTimeout(this.invTimer); this.invTimer = setTimeout(() => safeSet(this.guest), 700); return; }      // gộp nhiều lần nhặt đồ, không ghi localStorage liên tục
    clearTimeout(this.invTimer); this.invTimer = setTimeout(() => api('/api/inventory', { inv: clean }).catch(() => {}), 1500);
  }

  // ----- cửa hàng -----
  async buy(cat, id) {
    const it = S.shopItem(cat, id);
    if (this.mode === 'account') { this.me = (await api('/api/shop/buy', { cat, id })).me; return; }
    if (cat === 'boost') {
      const b = S.BOOST.find((x) => x.id === id), g = this.guest; if (!b) throw new Error('Không có vật phẩm này');
      if (g.coins < b.price) throw new Error('Không đủ xu');
      const slots = S.RULES.INV_SLOTS + S.perksOf(g.equip || {}).slots, now = Date.now(), exp = now + S.RULES.BOOST_HOURS * 3600e3;
      const inv = (g.inventory || []).filter((s) => !s.exp || s.exp > now), st = inv.find((s) => s.k === b.k && s.exp && s.n < S.RULES.INV_STACK);
      if (st) { st.n++; st.exp = exp; } else if (inv.length < slots) inv.push({ k: b.k, n: 1, exp }); else throw new Error('Túi đồ đã đầy');
      g.coins -= b.price; g.inventory = inv; safeSet(g); return;
    }
    const g = this.guest; if (!it) throw new Error('Không có vật phẩm này');
    if (it.price > 0 && !g.owned.includes(cat + ':' + id)) { if (g.coins < it.price) throw new Error('Không đủ xu'); g.coins -= it.price; g.owned.push(cat + ':' + id); safeSet(g); }
  }
  async equipItem(cat, id) {
    if (this.mode === 'account') { this.me = (await api('/api/shop/equip', { cat, id })).me; return; }
    const g = this.guest, it = S.shopItem(cat, id); if (!it || (it.price > 0 && !g.owned.includes(cat + ':' + id))) throw new Error('Bạn chưa sở hữu vật phẩm này');
    g.equip[cat] = id; safeSet(g);
  }

  async history() {
    if (this.mode === 'account') return (await api('/api/history?days=120')).rows;
    return Object.entries(this.guest.daily).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, d]) => ({ day, gameKm: r1(d.gameM / 1000), realKm: 0, totalKm: r1(d.gameM / 1000), steps: d.steps, secs: d.secs, bites: d.bites, jumps: d.jumps, items: d.items }));
  }
  leaderboard(period) { return api('/api/leaderboard?period=' + period); }
  exportGuest() { return JSON.stringify(this.guest); }
}
