// Âm thanh tổng hợp bằng WebAudio (không cần file âm thanh). Bật/tắt bằng nút 🔊 hoặc phím M, nhớ lựa chọn trên máy.
let ctx = null, master = null, muted = false, foot = 0;
try { muted = localStorage.getItem('chay.mute') === '1'; } catch { /* bị chặn */ }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  return ctx;
}
// trình duyệt chỉ cho phát âm sau khi người dùng chạm/nhấn lần đầu
function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { passive: true });

function tone({ type = 'sine', f0 = 440, f1 = null, t = 0, dur = 0.15, vol = 0.3, attack = 0.005, vib = 0 }) {
  const c = ensure(); if (!c || muted || c.state !== 'running') return;
  const t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 22; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
}
let noiseBuf = null;
function noise({ t = 0, dur = 0.06, vol = 0.25, freq = 1200, q = 0.8, type = 'lowpass' }) {
  const c = ensure(); if (!c || muted || c.state !== 'running') return;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random() * 0.3); s.stop(t0 + dur + 0.02);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(m) { muted = !!m; try { localStorage.setItem('chay.mute', muted ? '1' : '0'); } catch { /* bỏ */ } if (master) master.gain.value = muted ? 0 : 0.55; if (!muted) { unlock(); this.click(); } },
  toggle() { this.setMuted(!muted); return muted; },
  unlock,
  step(fast) { foot ^= 1; const k = foot ? 1 : 0.88; noise({ dur: 0.05, vol: 0.2, freq: 700 * k + (fast ? 250 : 0), q: 0.7 }); tone({ f0: 150 * k, f1: 90, dur: 0.07, vol: 0.16 }); },
  jump() { tone({ type: 'sine', f0: 280, f1: 720, dur: 0.18, vol: 0.28 }); tone({ type: 'triangle', f0: 560, f1: 1100, t: 0.04, dur: 0.12, vol: 0.1 }); },
  land() { noise({ dur: 0.08, vol: 0.22, freq: 500 }); tone({ f0: 120, f1: 70, dur: 0.1, vol: 0.18 }); },
  coin() { tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.12 }); tone({ type: 'square', f0: 1319, t: 0.06, dur: 0.14, vol: 0.12 }); },
  pickup() { [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.06, dur: 0.14, vol: 0.22 })); },
  eat() { tone({ f0: 380, f1: 200, dur: 0.09, vol: 0.2 }); tone({ f0: 420, f1: 230, t: 0.11, dur: 0.09, vol: 0.2 }); tone({ type: 'triangle', f0: 700, t: 0.24, dur: 0.18, vol: 0.14 }); },
  bolt() { tone({ type: 'sawtooth', f0: 220, f1: 1500, dur: 0.38, vol: 0.14, vib: 40 }); noise({ dur: 0.3, vol: 0.12, freq: 3000, type: 'highpass' }); },
  hit() { noise({ dur: 0.14, vol: 0.3, freq: 400 }); tone({ f0: 160, f1: 55, dur: 0.18, vol: 0.32 }); },
  warn() { tone({ type: 'square', f0: 880, dur: 0.1, vol: 0.12 }); tone({ type: 'square', f0: 880, t: 0.16, dur: 0.1, vol: 0.12 }); },
  bark() { for (let i = 0; i < 2; i++) { const t = i * 0.19; tone({ type: 'sawtooth', f0: 330, f1: 190, t, dur: 0.13, vol: 0.28, attack: 0.01 }); noise({ t, dur: 0.1, vol: 0.18, freq: 900, q: 2, type: 'bandpass' }); } },
  bite() { tone({ type: 'sawtooth', f0: 260, f1: 90, dur: 0.22, vol: 0.3 }); noise({ dur: 0.18, vol: 0.28, freq: 1500, q: 1.2, type: 'bandpass' }); },
  tired() { tone({ f0: 420, f1: 150, dur: 0.6, vol: 0.22 }); },
  finish() { [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.12, dur: 0.3, vol: 0.28 })); tone({ type: 'triangle', f0: 1047, t: 0.5, dur: 0.7, vol: 0.2 }); },
  honk() { tone({ type: 'square', f0: 420, dur: 0.16, vol: 0.14 }); tone({ type: 'square', f0: 520, t: 0.02, dur: 0.16, vol: 0.12 }); tone({ type: 'square', f0: 420, t: 0.24, dur: 0.2, vol: 0.14 }); tone({ type: 'square', f0: 520, t: 0.26, dur: 0.2, vol: 0.12 }); },
  swoosh() { noise({ dur: 0.28, vol: 0.2, freq: 1400, q: 0.6, type: 'bandpass' }); tone({ type: 'sawtooth', f0: 180, f1: 90, dur: 0.25, vol: 0.08 }); },
  click() { tone({ type: 'triangle', f0: 640, f1: 480, dur: 0.06, vol: 0.12 }); },
};
