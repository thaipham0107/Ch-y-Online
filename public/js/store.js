// Lưu hồ sơ: tài khoản -> server (SQLite); khách -> localStorage trên máy này.
const GK = 'chayonline.guest.v1';
export const dayOf = (t = Date.now()) => new Date(t + 7 * 3600e3).toISOString().slice(0, 10);
const r1 = (v) => Math.round(v * 10) / 10;
const ITEM_KEYS = ['water', 'banana', 'melon', 'elec', 'bolt'];

export async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Có lỗi xảy ra');
  return j;
}
const safeGet = () => { try { return JSON.parse(localStorage.getItem(GK)); } catch { return null; } };
const safeSet = (v) => { try { localStorage.setItem(GK, JSON.stringify(v)); } catch { /* bộ nhớ đầy hoặc bị chặn */ } };

export class Store {
  constructor() { this.mode = null; this.me = null; this.guest = null; this.runId = 0; this.acc = this.blank(); this.invTimer = 0; }
  blank() { return { steps: 0, meters: 0, jumps: 0, bites: 0, boltsUsed: 0, secs: 0, items: {} }; }

  async init() {
    const r = await api('/api/me').catch(() => ({ me: null }));
    if (r.me) { this.mode = 'account'; this.me = r.me; return true; }
    const g = safeGet();
    if (g && g.name) { this.mode = 'guest'; this.guest = g; return true; }
    return false;
  }
  startGuest(name) {
    this.mode = 'guest';
    this.guest = safeGet() || { name: '', daily: {}, inventory: [], created: Date.now() };
    this.guest.name = String(name || 'Khách').replace(/[<>]/g, '').trim().slice(0, 16) || 'Khách';
    safeSet(this.guest);
  }
  async login(username, password, register, name) {
    const r = await api(register ? '/api/register' : '/api/login', { username, password, name });
    this.mode = 'account'; this.me = r.me; return r.me;
  }
  async logout() { if (this.mode === 'account') await api('/api/logout', {}); else { /* khách giữ dữ liệu trên máy */ } this.mode = null; this.me = null; }
  async refresh() { if (this.mode === 'account') { this.me = (await api('/api/me')).me; } }

  // Hồ sơ hợp nhất cho giao diện
  profile() {
    if (this.mode === 'account') return { ...this.me, mode: 'account', inventory: this.me.inventory || [] };
    const g = this.guest, t = { gameM: 0, steps: 0, secs: 0, items: {} };
    for (const d of Object.values(g.daily)) {
      t.gameM += d.gameM; t.steps += d.steps; t.secs += d.secs;
      for (const k of ITEM_KEYS) t.items[k] = (t.items[k] || 0) + ((d.items || {})[k] || 0);
    }
    const today = g.daily[dayOf()];
    const gameKm = r1(t.gameM / 1000);
    return { mode: 'guest', name: g.name, stravaLinked: false, lastSync: 0,
      totals: { gameKm, realKm: 0, totalKm: gameKm, steps: t.steps, secs: t.secs, items: t.items },
      today: { gameKm: r1((today ? today.gameM : 0) / 1000), realKm: 0 }, inventory: g.inventory || [] };
  }

  // ----- chuyến chạy -----
  async startRun(map, dist, mode) {
    this.acc = this.blank();
    if (this.mode === 'account') { try { this.runId = (await api('/api/run/start', { map, dist, mode })).runId; } catch { this.runId = 0; } }
  }
  record(d) {
    const a = this.acc;
    for (const k of ['steps', 'meters', 'jumps', 'bites', 'boltsUsed', 'secs']) a[k] += d[k] || 0;
    for (const k of ITEM_KEYS) a.items[k] = (a.items[k] || 0) + ((d.items || {})[k] || 0);
  }
  async flush(done) {
    const a = this.acc; if (!a.steps && !a.secs && !done) return;
    this.acc = this.blank();
    if (this.mode === 'account') {
      if (!this.runId) return;
      try { await api('/api/run/flush', { runId: this.runId, ...a, done: done ? 1 : 0 }); await this.refresh(); }
      catch { this.record(a); }                    // gửi lỗi: giữ lại, gửi lần sau
    } else if (this.guest) {
      const day = dayOf(); const d = this.guest.daily[day] || (this.guest.daily[day] = { gameM: 0, steps: 0, secs: 0, bites: 0, jumps: 0, items: {} });
      d.gameM += a.meters; d.steps += a.steps; d.secs += a.secs; d.bites += a.bites; d.jumps += a.jumps;
      for (const k of ITEM_KEYS) d.items[k] = (d.items[k] || 0) + (a.items[k] || 0);
      safeSet(this.guest);
    }
  }
  saveInventory(inv) {
    const clean = inv.map((s) => ({ k: s.k, n: s.n }));
    if (this.mode === 'guest') { this.guest.inventory = clean; safeSet(this.guest); return; }
    clearTimeout(this.invTimer);
    this.invTimer = setTimeout(() => api('/api/inventory', { inv: clean }).catch(() => {}), 1500);
  }

  async history() {
    if (this.mode === 'account') return (await api('/api/history?days=120')).rows;
    return Object.entries(this.guest.daily).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, d]) => ({
      day, gameKm: r1(d.gameM / 1000), realKm: 0, totalKm: r1(d.gameM / 1000), steps: d.steps, secs: d.secs, bites: d.bites, jumps: d.jumps, items: d.items }));
  }
  leaderboard(period) { return api('/api/leaderboard?period=' + period); }
  exportGuest() { return JSON.stringify(this.guest); }
}
