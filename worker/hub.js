import { DurableObject } from 'cloudflare:workers';
import { makeDb } from './sqlite.js';
import meta from '../public/courses/meta.json';
import pkg from '../package.json';

// Toàn bộ API + WebSocket chạy trong MỘT Durable Object (có SQLite riêng): dữ liệu nhất quán, không cần dịch vụ CSDL ngoài.
export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const strEnv = {};
    for (const [k, v] of Object.entries(env)) if (typeof v === 'string') strEnv[k] = v;
    try { Object.assign(process.env, strEnv); } catch { /* môi trường không cho ghi */ }
    // nạp muộn để strava.js / admin.js thấy đủ biến môi trường
    const createCore = require('../core.js'), createApp = require('../lite-express.js');
    this.app = createApp();
    this.app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
    this.core = createCore({ db: makeDb(ctx), app: this.app, env: strEnv, platform: { version: pkg.version, meta, tileStats: () => ({ store: env.TILES ? 'r2' : 'edge-cache' }) } });
    this.socks = 0; this.timer = null; this.lastSweep = 0;
  }

  async fetch(request) {
    const now = Date.now();
    if (now - this.lastSweep > 30000) { this.lastSweep = now; try { this.core.sweep(); } catch (e) { console.error('sweep', e.message); } }
    if (request.headers.get('Upgrade') === 'websocket') return this.socket(request);
    return this.app.handle(request);
  }

  socket(request) {
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    server.accept();
    const c = this.core.connect({ send: (s) => server.send(s), open: () => server.readyState === 1 }, request.headers.get('cookie') || '');
    this.socks++;
    if (!this.timer) this.timer = setInterval(() => this.core.snapTick(), 200);
    let closed = false;
    const end = () => { if (closed) return; closed = true; c.close(); if (--this.socks <= 0) { clearInterval(this.timer); this.timer = null; this.socks = 0; } };
    server.addEventListener('message', (e) => { if (typeof e.data !== 'string' || e.data.length > 1024) return server.close(1009, 'quá lớn'); c.message(e.data); });
    server.addEventListener('close', end);
    server.addEventListener('error', end);
    return new Response(null, { status: 101, webSocket: client });
  }
}
