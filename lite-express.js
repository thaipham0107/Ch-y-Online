'use strict';
// Khung định tuyến tối giản kiểu Express, chạy trên Fetch API (Cloudflare Workers / Durable Objects).
// Chỉ có phần dự án dùng: app.use / get / post / delete, req.{query,params,body,headers,cookies,ip,secure}, res.{status,json,set,cookie,clearCookie,redirect,end,send}.
function compile(path) {
  const keys = [], src = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  return { re: new RegExp('^' + src + '/?$'), keys };
}
function serializeCookie(name, value, o = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=${o.path || '/'}`;
  if (o.maxAge != null) s += `; Max-Age=${Math.floor(o.maxAge / 1000)}`;
  if (o.httpOnly) s += '; HttpOnly';
  if (o.secure) s += '; Secure';
  if (o.sameSite) s += `; SameSite=${String(o.sameSite).replace(/^./, (c) => c.toUpperCase())}`;
  return s;
}

class App {
  constructor() { this.stack = []; this.settings = {}; }
  set(k, v) { this.settings[k] = v; }
  use(a, ...fns) { if (typeof a === 'function') this.stack.push({ prefix: '', fns: [a, ...fns] }); else this.stack.push({ prefix: a, fns }); }
  _route(method, path, fns) { this.stack.push({ method, route: compile(path), fns }); }
  get(p, ...f) { this._route('GET', p, f); }
  post(p, ...f) { this._route('POST', p, f); }
  put(p, ...f) { this._route('PUT', p, f); }
  delete(p, ...f) { this._route('DELETE', p, f); }

  async handle(request, ctx = {}) {
    const url = new URL(request.url), headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    const req = { method: request.method, url: request.url, path: url.pathname, headers, params: {}, query: Object.fromEntries(url.searchParams), body: {},
      ip: headers['cf-connecting-ip'] || (headers['x-forwarded-for'] || '').split(',').pop().trim() || ctx.ip || '0.0.0.0',
      secure: url.protocol === 'https:' || headers['x-forwarded-proto'] === 'https', cookies: {} };
    if (request.method !== 'GET' && request.method !== 'HEAD' && /json/.test(headers['content-type'] || '')) {
      const text = await request.text();
      if (text.length > 300 * 1024) return Response.json({ error: 'Dữ liệu quá lớn' }, { status: 413 });
      try { req.body = text ? JSON.parse(text) : {}; } catch { return Response.json({ error: 'JSON không hợp lệ' }, { status: 400 }); }
    }
    const out = { status: 200, headers: new Headers(), body: null, done: false };
    let resolve; const finished = new Promise((r) => { resolve = r; });
    const finish = (body) => { if (out.done) return; out.done = true; out.body = body; resolve(); };
    const res = {
      status(c) { out.status = c; return res; },
      set(k, v) { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) out.headers.set(a, b); else out.headers.set(k, v); return res; },
      cookie(n, v, o) { out.headers.append('Set-Cookie', serializeCookie(n, v, o)); return res; },
      clearCookie(n, o = {}) { out.headers.append('Set-Cookie', serializeCookie(n, '', { ...o, maxAge: 0 })); return res; },
      json(o) { out.headers.set('Content-Type', 'application/json; charset=utf-8'); finish(JSON.stringify(o)); return res; },
      send(b) { finish(b); return res; },
      end(b) { finish(b == null ? null : b); return res; },
      redirect(u) { out.status = 302; out.headers.set('Location', u); finish(null); return res; },
    };
    const run = async (fns, next) => {
      let i = 0;
      const step = async () => {
        if (out.done) return;
        const fn = fns[i++]; if (!fn) return next();
        await fn(req, res, step);
      };
      await step();
    };
    const exec = async () => {
      let idx = 0;
      const nextLayer = async () => {
        while (idx < this.stack.length && !out.done) {
          const L = this.stack[idx++];
          if (L.route) {
            if (L.method !== request.method && !(L.method === 'GET' && request.method === 'HEAD')) continue;
            const m = L.route.re.exec(req.path); if (!m) continue;
            req.params = {}; L.route.keys.forEach((k, j) => { req.params[k] = decodeURIComponent(m[j + 1]); });
            return run(L.fns, nextLayer);
          }
          if (L.prefix && !(req.path === L.prefix || req.path.startsWith(L.prefix.replace(/\/$/, '') + '/'))) continue;
          return run(L.fns, nextLayer);
        }
        if (!out.done) { out.status = 404; res.json({ error: 'Không tìm thấy' }); }
      };
      await nextLayer();
    };
    try { await exec(); } catch (e) { console.error('lỗi xử lý', request.method, req.path, e && e.stack || e); if (!out.done) { out.status = 500; out.headers.set('Content-Type', 'application/json'); finish(JSON.stringify({ error: 'Lỗi máy chủ' })); } }
    if (!out.done) await Promise.race([finished, new Promise((r) => setTimeout(r, 0))]);
    return new Response(out.status === 204 || out.status === 304 ? null : out.body, { status: out.status, headers: out.headers });
  }
}
module.exports = () => new App();
