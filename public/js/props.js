// Địa danh / vật thể 3D dạng GLB đặt dọc đường chạy. Tải bất đồng bộ, KHÔNG chặn vào game; lỗi tải → bỏ qua im lặng.
// Cấu hình: public/props/<mapId>.json = [{ model:'junk-boat.glb', name:'Thuyền buồm', s:900, lat:60, scale:1, rotY:0, y:0, sea:true, checkin:true }]
//  s = mét dọc đường; lat = khoảng cách ngang (m, luôn dương: tự lật về phía biển nếu sea:true, ngược lại về phía lề phải); sea:true → đặt trên mặt nước (y=0)
import * as THREE from '/vendor/three.module.js';

let loaderP = null;
function getLoader() {
  return loaderP || (loaderP = Promise.all([import('/vendor/jsm/loaders/GLTFLoader.js'), import('/vendor/jsm/libs/meshopt_decoder.module.js')])
    .then(([{ GLTFLoader }, { MeshoptDecoder }]) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)));
}
const cache = new Map();      // model → Promise<gltf scene>  (dùng lại cho nhiều vị trí)
const fetchModel = (file) => cache.get(file) || (cache.set(file, getLoader().then((L) => new Promise((ok, no) => L.load('/models/' + file, (g) => ok(g.scene), undefined, no)))), cache.get(file));

export class Props {
  constructor(game) { this.g = game; this.list = []; this.group = new THREE.Group(); this.group.name = 'props'; this.dead = false; this.visited = new Set(); }
  async load(mapId) {
    let cfg; try { const r = await fetch('/props/' + mapId + '.json', { cache: 'no-cache' }); if (!r.ok) return; cfg = await r.json(); } catch { return; }
    if (this.dead || !Array.isArray(cfg)) return;
    this.g.dyn.add(this.group);
    const w = this.g.world, side = (this.g.map.sea || 'R') === 'L' ? -1 : 1;
    for (const c of cfg) {
      if (c.s > this.g.total + 50) continue;
      try {
        const base = await fetchModel(c.model); if (this.dead) return;
        const m = base.clone(true), P = w.posAt(c.s); let lat = (c.sea ? side : (c.side || 1)) * Math.abs(c.lat || 20);
        if (c.sea && w.groundH) { for (let k = 0; k < 40 && w.groundH(c.s, lat) > -0.4; k++) lat += side * 10; }      // đẩy ra ngoài tới khi thật sự là mặt nước (không chôn dưới đồi)
        const [x, z] = w.off(P, lat);
        m.scale.setScalar(c.scale || 1); m.position.set(x, c.sea ? (c.y || 0) : P.y + (c.y || 0), z); m.rotation.y = -P.h + (c.rotY || 0) * Math.PI / 180;
        m.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; o.matrixAutoUpdate = false; o.updateMatrix(); } });
        m.userData = { bob: !!c.sea, y0: m.position.y, ph: c.s };
        this.group.add(m); this.list.push({ c, m });
      } catch (e) { console.warn('GLB lỗi', c.model, e && e.message); }
    }
  }
  tick(s, t) {
    for (const p of this.list) {
      if (p.m.userData.bob) p.m.position.y = p.m.userData.y0 + Math.sin(t * 1.1 + p.m.userData.ph) * 0.12;
      const c = p.c; if (c.checkin && !this.visited.has(c.name) && Math.abs(s - c.s) < 30) { this.visited.add(c.name); this.g.float('📍 ' + c.name.slice(0, 18), '#fff3b0'); this.g.say('📍 Đã check-in: ' + c.name, 3200); }
    }
  }
  dispose() { this.dead = true; if (this.group.parent) this.group.parent.remove(this.group); }
}

// Lớp phủ FPS/draw call: bật bằng ?perf=1 trên URL (để đo trên điện thoại/iPad)
export function perfOverlay(renderer) {
  if (!/[?&]perf=1/.test(location.search)) return null;
  const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;background:#000a;color:#7CFC9A;font:12px/1.3 monospace;padding:4px 7px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(el); let n = 0, t0 = performance.now(), worst = 0, last = t0;
  return () => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; n++; if (now - t0 > 1000) { const i = renderer.info; el.textContent = `${Math.round(n * 1000 / (now - t0))} FPS  (khựng tối đa ${Math.round(worst)} ms)\n${i.render.calls} draw · ${(i.render.triangles / 1000).toFixed(0)}k tam giác · ${i.memory.textures} texture`; n = 0; t0 = now; worst = 0; } };
}
