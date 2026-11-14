// Dựng thư mục file tĩnh cho Cloudflare: dist/assets = public/ + maps.js + three + leaflet
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'dist/assets');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.copyFileSync(path.join(root, 'maps.js'), path.join(out, 'maps.js'));
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(out, 'vendor/three.module.js'));
for (const rel of ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'libs/meshopt_decoder.module.js', 'controls/OrbitControls.js', 'exporters/GLTFExporter.js']) {
  const dst = path.join(out, 'vendor/jsm', rel); fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, fs.readFileSync(path.join(root, 'node_modules/three/examples/jsm', rel), 'utf8').replace(/from\s+'three'/g, "from '/vendor/three.module.js'"));
}
fs.cpSync(path.join(root, 'node_modules/leaflet/dist'), path.join(out, 'leaflet'), { recursive: true, filter: (s) => !s.endsWith('.map') && !s.includes('-src') });
fs.writeFileSync(path.join(out, '_headers'), `/admin/*\n  X-Robots-Tag: noindex\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n`);
let n = 0, bytes = 0; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { n++; bytes += fs.statSync(f).size; } } })(out);
console.log(`dist/assets: ${n} file, ${(bytes / 1048576).toFixed(1)} MB`);
