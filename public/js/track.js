// Ghi nhận lượt truy cập và thời gian sử dụng (ẩn danh theo mã thiết bị). Không gửi nội dung nhập của người chơi.
const K = 'chay.vid';
let vid; try { vid = localStorage.getItem(K); } catch { /* bị chặn */ }
if (!vid) { vid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20); try { localStorage.setItem(K, vid); } catch { /* bỏ */ } }
function guest() { try { const g = JSON.parse(localStorage.getItem('chayonline.guest.v1') || 'null'); return g && g.gid ? { gid: g.gid, name: g.name } : {}; } catch { return {}; } }
let sid = 0;
const post = (o) => fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vid, ...guest(), ...o }), keepalive: true }).then((r) => r.json()).catch(() => ({}));
post({ a: 'open', ref: document.referrer ? new URL(document.referrer).host : '' }).then((j) => { sid = j.sid || 0; });
setInterval(() => { if (sid && !document.hidden) post({ a: 'hb', sid, vis: true }); }, 30e3);
document.addEventListener('visibilitychange', () => { if (sid) post({ a: 'hb', sid, vis: !document.hidden }); });
window.addEventListener('pagehide', () => { if (sid) post({ a: 'hb', sid, vis: false }); });
window.track = (ev, data) => { if (sid) post({ a: 'ev', sid, ev, data }); };
