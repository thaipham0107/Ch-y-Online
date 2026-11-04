// Vẽ huy chương SVG từ cấu hình do người tổ chức thiết kế: {shape,color,ribbon,icon,text}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function mix(hex, to, k) { const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), a = n(hex), b = n(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join(''); }
let uid = 0;
export function medalSvg(m, size = 96) {
  const id = 'mg' + (uid++), c1 = mix(m.color, '#ffffff', 0.35), c2 = mix(m.color, '#000000', 0.25), cx = 50, cy = 68;
  let shape;
  if (m.shape === 'shield') shape = `<path d="M50 36 L80 46 V70 Q80 92 50 104 Q20 92 20 70 V46 Z" fill="url(#${id})" stroke="${c2}" stroke-width="2.5"/>`;
  else if (m.shape === 'star') { const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 17 : 38; return (cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1); }).join(' '); shape = `<polygon points="${pts}" fill="url(#${id})" stroke="${c2}" stroke-width="2.5" stroke-linejoin="round"/>`; }
  else if (m.shape === 'hex') { const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + i * Math.PI / 3; return (cx + Math.cos(a) * 34).toFixed(1) + ',' + (cy + Math.sin(a) * 34).toFixed(1); }).join(' '); shape = `<polygon points="${pts}" fill="url(#${id})" stroke="${c2}" stroke-width="2.5" stroke-linejoin="round"/>`; }
  else shape = `<circle cx="${cx}" cy="${cy}" r="33" fill="url(#${id})" stroke="${c2}" stroke-width="2.5"/><circle cx="${cx}" cy="${cy}" r="26" fill="none" stroke="#ffffffaa" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 100 112" width="${size}" height="${size * 1.12}" role="img" aria-label="Huy chương ${esc(m.text)}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <path d="M26 0 H46 L60 44 H42 Z" fill="${m.ribbon}"/><path d="M74 0 H54 L40 44 H58 Z" fill="${mix(m.ribbon, '#000000', 0.18)}"/>${shape}
    <text x="50" y="${m.text ? 70 : 78}" text-anchor="middle" font-size="24" font-family="system-ui,'Apple Color Emoji','Noto Color Emoji',sans-serif">${esc(m.icon)}</text>
    ${m.text ? `<text x="50" y="88" text-anchor="middle" font-size="8" font-weight="800" fill="${mix(m.color, '#000000', 0.7)}" font-family="system-ui,sans-serif">${esc(m.text)}</text>` : ''}</svg>`;
}
export const MEDAL_NAMES = { gold: 'Giải nhất', silver: 'Giải nhì', bronze: 'Giải ba', finisher: 'Phong trào' };
