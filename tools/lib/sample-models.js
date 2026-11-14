// Dựng các mô hình mẫu (phong cách bưu thiếp, ít mặt) bằng three.js rồi xuất .glb. Chạy trong trình duyệt bởi tools/make-models.cjs.
import * as THREE from '/vendor/three.module.js';
import { GLTFExporter } from '/vendor/jsm/exporters/GLTFExporter.js';
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.0, flatShading: true, ...o });
const box = (w, h, d, c, x = 0, y = 0, z = 0, g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y + h / 2, z); g && g.add(m); return m; };
function hullGeo(L, W, H, bow = 0.25) {                   // thân tàu: mặt cắt hình thang, mũi nhọn
  const s = new THREE.Shape(); s.moveTo(-L / 2, 0); s.lineTo(L / 2 - L * bow, 0); s.lineTo(L / 2, H * 0.9); s.lineTo(-L / 2, H); s.lineTo(-L / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }); g.translate(0, 0, -W / 2); return g;
}
function name(g, n) { g.name = n; return g; }

export const MODELS = {
  'junk-boat': () => {                                      // thuyền buồm gỗ Hạ Long (hướng +x là mũi)
    const g = new THREE.Group(); const hull = new THREE.Mesh(hullGeo(9, 3, 1.4), M('#5b3a1f')); g.add(hull);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 3.1), M('#c9a15b')); trim.position.set(0, 1.4, 0); g.add(trim);
    box(2.6, 1.3, 2.2, '#8a5a2b', -1.6, 1.4, 0, g); box(2.8, 0.15, 2.4, '#3d2a16', -1.6, 2.7, 0, g);
    for (const [x, h, sc] of [[1.8, 7.2, 1], [-0.5, 8.6, 1.15], [-3.0, 6.4, 0.9]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 6), M('#3d2a16')); mast.position.set(x, 1.4 + h / 2, 0); g.add(mast);
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.78, 2.5 * sc), M('#9c3b22', { side: THREE.DoubleSide })); sail.position.set(x - 0.2, 1.8 + h * 0.46, 0.2); sail.rotation.y = 0.12; g.add(sail);
      for (let i = 1; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 2.6 * sc), M('#2b1b10')); b.position.set(x - 0.23, 1.8 + h * 0.78 * i / 6, 0.2); b.rotation.y = 0.12; g.add(b); }
    }
    return name(g, 'junk-boat');
  },
  'tour-boat': () => {                                      // tàu du lịch hai tầng (trắng, sọc xanh, cờ đỏ sao vàng)
    const g = new THREE.Group(); g.add(new THREE.Mesh(hullGeo(16, 4.2, 1.6, 0.18), M('#f4f4f2')));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.35, 4.3), M('#1f5fa8')); stripe.position.set(-0.4, 0.9, 0); g.add(stripe);
    box(12, 1.6, 3.6, '#ffffff', -0.8, 1.6, 0, g); box(8.4, 1.5, 3.2, '#ffffff', -1.6, 3.2, 0, g);
    for (let i = 0; i < 9; i++) { for (const z of [-1.82, 1.82]) { box(0.8, 0.7, 0.05, '#2b4a6f', -5.4 + i * 1.3, 2.0, z, g); } }
    for (let i = 0; i < 6; i++) for (const z of [-1.62, 1.62]) box(0.8, 0.65, 0.05, '#2b4a6f', -4.6 + i * 1.3, 3.5, z, g);
    box(12.3, 0.18, 3.9, '#c9ccd1', -0.8, 3.2, 0, g); box(8.7, 0.18, 3.5, '#1f5fa8', -1.6, 4.7, 0, g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), M('#8a8f99')); pole.position.set(-1.0, 6.3, 0); g.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 1.5), M('#d62828')); flag.position.set(-1.0, 7.3, 0.8); g.add(flag);
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.16 : 0.4, a = Math.PI / 2 + i * Math.PI / 5; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    const sm = new THREE.Mesh(new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: false }), M('#ffd23a')); sm.rotation.y = Math.PI / 2; sm.position.set(-0.98, 7.3, 0.8); g.add(sm);
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12), M('#ff7a1a')); t.position.set(-6 + i * 2.2, 1.6, 2.03); g.add(t); }   // phao cứu sinh
    return name(g, 'tour-boat');
  },
  'thap-rua': () => {                                        // Tháp Rùa: tháp ba tầng trên gò đất nhỏ
    const g = new THREE.Group(); const isl = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 1.2, 10), M('#6f8f56')); isl.position.y = 0.6; g.add(isl);
    const stone = '#c9b98d', dark = '#7d6a45';
    box(5.2, 0.6, 5.2, '#a89a74', 0, 1.2, 0, g);
    let y = 1.8, w = 4.4;
    for (let t = 0; t < 3; t++) {
      box(w, 1.7, w, stone, 0, y, 0, g);
      for (const [dx, dz, rot] of [[0, w / 2 + 0.02, 0], [0, -w / 2 - 0.02, 0], [w / 2 + 0.02, 0, 1], [-w / 2 - 0.02, 0, 1]]) {
        const arch = new THREE.Mesh(new THREE.BoxGeometry(rot ? 0.06 : 1.0, 1.0, rot ? 1.0 : 0.06), M(dark)); arch.position.set(dx, y + 0.8, dz); g.add(arch);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10, 1, false, 0, Math.PI), M(dark)); top.rotation.set(rot ? Math.PI / 2 : Math.PI / 2, rot ? Math.PI / 2 : 0, rot ? 0 : 0); top.position.set(dx, y + 1.3, dz); g.add(top);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 0.55, 4), M('#8b7d58')); roof.rotation.y = Math.PI / 4; roof.position.y = y + 1.7 + 0.27; g.add(roof);
      y += 1.7 + 0.45; w *= 0.82;
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 4), M('#8b7d58')); top.rotation.y = Math.PI / 4; top.position.y = y + 0.1; g.add(top);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), M('#d62828')); star.position.y = y + 1.1; g.add(star);
    return name(g, 'thap-rua');
  },
  'duc-ba': () => {                                          // Nhà thờ Đức Bà (Sài Gòn): mặt tiền gạch đỏ, hai tháp chuông
    const g = new THREE.Group(); const brick = '#b4462f', trim = '#e8d8c0', roof = '#6c4a3a';
    box(12, 7, 9, brick, 0, 0, 0, g); box(13, 0.5, 10, '#8a8277', 0, 0, 0, g);
    box(11, 3, 22, brick, 0, 0, -13, g); const gable = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 22, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), M(roof)); gable.scale.set(1, 0.35, 1); gable.position.set(0, 3.4, -13); g.add(gable);
    for (const x of [-4.2, 4.2]) {
      box(3.6, 20, 3.6, brick, x, 0, 3.2, g); box(3.9, 0.5, 3.9, trim, x, 15, 3.2, g);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.6, 11, 4), M('#3a3a3a')); spire.rotation.y = Math.PI / 4; spire.position.set(x, 20 + 5.5, 3.2); g.add(spire);
      const cross = box(0.25, 1.6, 0.25, '#e8e8e8', x, 31, 3.2, g); const cb = box(1.0, 0.25, 0.25, '#e8e8e8', x, 31.9, 3.2, g);
      for (const y of [4, 9, 13]) box(1.0, 2.2, 0.15, '#2a2018', x, y, 5.05, g);
    }
    box(4.4, 5, 0.3, trim, 0, 0.2, 4.6, g); box(2.2, 3.4, 0.2, '#3a2a20', 0, 0.2, 4.8, g); const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.15, 14).rotateX(Math.PI / 2), M('#4a78b8')); rose.position.set(0, 6.0, 4.8); g.add(rose);
    for (const x of [-4.2, 4.2]) box(0.12, 4, 0.12, trim, x * 0.55, 0, 5.1, g);
    return name(g, 'duc-ba');
  },
  'karst': () => {                                           // đảo đá vôi Hạ Long: nón núi lởm chởm, rêu xanh trên đỉnh
    const g = new THREE.Group(); const geo = new THREE.CylinderGeometry(3.2, 7.5, 26, 9, 6, false); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = (y + 13) / 26, k = Math.sin(i * 12.9898) * 43758.5453; const r = (k - Math.floor(k)); const f = 0.78 + r * 0.44 + Math.sin(p.getX(i) * 0.7 + y * 0.35) * 0.15; p.setXYZ(i, p.getX(i) * f * (1 + (1 - t) * 0.1), y, p.getZ(i) * f); }
    geo.computeVertexNormals(); const rock = new THREE.Mesh(geo, M('#a6a59a')); rock.position.y = 13; g.add(rock);
    const green = new THREE.Mesh(new THREE.SphereGeometry(3.4, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), M('#4f8a4a')); green.scale.set(1.1, 0.7, 1.1); green.position.y = 23.6; g.add(green);
    for (const [x, z, r] of [[3.5, 1.2, 1.6], [-3.2, -2, 1.4], [1, -4, 1.2]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), M('#5d9b52')); b.position.set(x, 3.4 + r * 0.4, z); g.add(b); }
    const smaller = rock.clone(); smaller.scale.set(0.42, 0.34, 0.42); smaller.position.set(11, 4.4, -3); g.add(smaller);
    return name(g, 'karst');
  },
};

export async function exportGlb(group) {
  return new Promise((ok, no) => new GLTFExporter().parse(group, (buf) => ok(buf), no, { binary: true, onlyVisible: true }));
}
export function stats(group) { let tri = 0, mesh = 0; group.traverse((o) => { if (o.isMesh) { mesh++; const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { tri: Math.round(tri), mesh }; }
