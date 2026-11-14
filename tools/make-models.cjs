// Dựng lại các mô hình mẫu: node tools/make-models.cjs  (cần server đang chạy: PORT=3999 node tools/demo.mjs). Ghi vào public/models/*.glb
const pw = require('playwright'), fs = require('fs'), path = require('path');
const BASE = process.env.BASE || 'http://localhost:3999';
(async () => {
  const b = await pw.chromium.launch({ args: ['--no-sandbox'] }); const p = await b.newPage();
  p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CON', m.text()));
  await p.goto(BASE + '/robots.txt').catch(() => {}); await p.setContent('<html></html>'); await p.goto(BASE + '/');
  const code = fs.readFileSync(path.join(__dirname, 'lib/sample-models.js'), 'utf8') + '\nwindow.__lab = { MODELS, exportGlb, stats };';
  await p.addScriptTag({ type: 'module', content: code }); await p.waitForFunction(() => window.__lab, null, { timeout: 15000 });
  const out = await p.evaluate(async () => {
    const mod = window.__lab, res = {};
    for (const [k, f] of Object.entries(mod.MODELS)) { const g = f(); const buf = await mod.exportGlb(g); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); res[k] = { b64: btoa(s), ...mod.stats(g) }; }
    return res;
  });
  for (const [k, v] of Object.entries(out)) { const f = path.join(__dirname, '../public/models', k + '.glb'); fs.writeFileSync(f, Buffer.from(v.b64, 'base64')); console.log(k, v.tri + ' tam giác', v.mesh + ' mesh', (fs.statSync(f).size / 1024).toFixed(1) + ' KB'); }
  await b.close();
})();
