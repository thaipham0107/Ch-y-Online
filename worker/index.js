import { Hub } from './hub.js';
export { Hub };

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Ảnh bản đồ: lưu một lần (R2 nếu có binding TILES, nếu không thì cache biên của Cloudflare), phát với Cache-Control immutable.
async function tile(request, env, ctx) {
  const m = /^\/tiles\/(road|sat)\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?$/.exec(new URL(request.url).pathname);
  if (!m) return new Response(null, { status: 400 });
  const [style, z, x, y] = [m[1], +m[2], +m[3], +m[4]];
  if (z < 3 || z > 19 || x >= 2 ** z || y >= 2 ** z) return new Response(null, { status: 400 });
  const cache = caches.default;
  const hit = await cache.match(request); if (hit) return hit;
  const key = `${env.TILES_VERSION || '1'}/${style}/${z}/${x}/${y}`;
  const respond = (body, type) => { const r = new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': IMMUTABLE } }); ctx.waitUntil(cache.put(request, r.clone())); return r; };
  if (env.TILES) { const o = await env.TILES.get(key); if (o) return respond(o.body, (o.httpMetadata && o.httpMetadata.contentType) || 'image/png'); }
  const up = style === 'road' ? (env.TILES_ROAD || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    : (env.TILES_SAT || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
  let r;
  try { r = await fetch(up.replace('{z}', z).replace('{x}', x).replace('{y}', y), { headers: { 'User-Agent': `ChayOnline/1.0 (${env.BASE_URL || 'cloudflare'})` } }); } catch { return new Response(null, { status: 502 }); }
  const type = (r.headers.get('content-type') || '').split(';')[0];
  if (!r.ok || !EXT[type]) return new Response(null, { status: 502 });
  const buf = await r.arrayBuffer(); if (buf.byteLength > 2e6) return new Response(null, { status: 502 });
  if (env.TILES) ctx.waitUntil(env.TILES.put(key, buf, { httpMetadata: { contentType: type } }));
  return respond(buf, type);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/tiles/')) return tile(request, env, ctx);
    const id = env.HUB.idFromName('main');
    return env.HUB.get(id, env.HUB_LOCATION ? { locationHint: env.HUB_LOCATION } : undefined).fetch(request);
  },
};
