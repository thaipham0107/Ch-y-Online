// Kiểm thử đầu-cuối luồng Strava (cần: máy chủ giả cổng 9911, server cổng 3555, Playwright cài toàn cục).
// Dùng: NODE_PATH=$(npm root -g) node tools/test-strava.cjs <đường dẫn file chay.db của server>
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const B = 'http://localhost:3555', F = 'http://localhost:9911', DB = process.argv[2];
const db = new DatabaseSync(DB);
const res = []; const ok = (name, cond, detail = '') => { res.push(`${cond ? 'ĐẠT ' : 'LỖI '} ${name}${detail ? ' — ' + detail : ''}`); };
const mode = async (q) => (await fetch(`${F}/__mode?${q}`)).json();
const row = (u, tbl) => db.prepare(`SELECT * FROM ${tbl} WHERE user_id=?`).all(u);
const vn = (i) => new Date(Date.now() + 7 * 3600e3 - i * 864e5).toISOString().slice(0, 10);

(async () => {
  await mode('expired=0&fail=none');
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const api = (path, body) => p.evaluate(async ([path, body]) => { const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }, [path, body]);
  const lobby = () => p.waitForSelector('#scr-lobby:not([hidden])');

  await p.goto(B + '/'); await p.click('[data-t=register]'); await p.fill('#r-name', 'Strava Test'); await p.fill('#r-user', 'st' + Date.now() % 1e6); await p.fill('#r-pass', 'secret1'); await p.click('#f-register .primary'); await lobby();
  const uid = (await api('/api/me')).j.me.id;

  // 1) Kết nối qua giao diện -> OAuth tới máy chủ giả -> quay lại
  await p.click('[data-open=profile]'); await p.click('a[href="/auth/strava"]'); await lobby(); await p.waitForTimeout(600);
  const rd = Object.fromEntries(row(uid, 'real_daily').map((r) => [r.day, r.km]));
  ok('Kết nối OAuth và quay lại game', (await api('/api/me')).j.me.stravaLinked === true);
  ok('Km từng ngày đúng (chỉ Run/TrailRun/VirtualRun, bỏ Ride/Walk)', rd[vn(0)] === 6.5 && rd[vn(1)] === 5.3 && rd[vn(2)] === 3 && rd[vn(5)] === 10 && rd[vn(9)] === 8.4 && rd[vn(13)] === 6.1, JSON.stringify(rd));
  ok('Phân trang: lấy được buổi chạy ở trang 2 (cách 50 ngày)', rd[vn(50)] === 7.7);
  const me = (await api('/api/me')).j.me;
  ok('Xu thưởng cho km thật 3 ngày gần đây = floor(14.8 km x 25)', me.coins === 370, 'coins=' + me.coins);
  ok('Hồ sơ: km ngoài đời hôm nay = 6.5', me.today.realKm === 6.5);
  await p.click('[data-open=history]'); await p.waitForSelector('.tw table'); const hist = await p.innerText('.tw table');
  ok('Bảng lịch sử có cột Ngoài đời và số km', /Ngoài đời/i.test(hist) && /6\.5/.test(hist) && /10\.0/.test(hist));
  await p.click('#m-x');
  // callback sai state / thiếu scope
  const cb = async (query, withState) => { const r1 = await ctx.request.get(B + '/auth/strava', { maxRedirects: 0 }); const st = new URL(r1.headers().location).searchParams.get('state'); const r2 = await ctx.request.get(`${B}/auth/strava/callback?code=fakecode&${query}&state=${withState ? st : 'sai'}`, { maxRedirects: 0 }); return r2.headers().location; };
  ok('Callback sai state -> err=state', (await cb('scope=read,activity:read', false)) === '/?err=state');
  ok('Callback thiếu activity:read -> err=scope', (await cb('scope=read', true)) === '/?err=scope');
  ok('Callback người dùng từ chối -> err=denied', (await (await ctx.request.get(`${B}/auth/strava/callback?error=access_denied&state=x`, { maxRedirects: 0 })).headers().location) === '/?err=denied');

  // 2) Làm mới token hết hạn và lưu token mới
  const before = JSON.parse(db.prepare('SELECT strava FROM users WHERE id=?').get(uid).strava);
  db.prepare('UPDATE users SET strava=?, last_sync=0 WHERE id=?').run(JSON.stringify({ ...before, expires: Math.floor(Date.now() / 1000) - 100 }), uid);
  const r0 = (await mode('')).refreshes;
  const sy = await api('/api/strava/sync', {});
  const after = JSON.parse(db.prepare('SELECT strava FROM users WHERE id=?').get(uid).strava);
  ok('Token hết hạn -> tự làm mới, đồng bộ thành công', sy.s === 200 && (await mode('')).refreshes === r0 + 1, `status=${sy.s}`);
  ok('Token mới đã được lưu (access/refresh/expires đổi)', after.access !== before.access && after.refresh !== before.refresh && after.expires * 1000 > Date.now());
  // Callback khi Strava trả token đã quá hạn: đồng bộ đầu tiên vẫn làm mới được
  await api('/api/strava/unlink', {}); await p.waitForTimeout(300);
  ok('Ngắt kết nối: xóa token + km ngoài đời và gọi deauthorize', db.prepare('SELECT strava FROM users WHERE id=?').get(uid).strava === null && row(uid, 'real_daily').length === 0 && (await mode('')).deauth >= 1);
  ok('Sau ngắt kết nối giao diện báo chưa kết nối (km ngoài đời = 0)', (await api('/api/me')).j.me.totals.realKm === 0);
  await mode('expired=1'); const r1 = (await mode('')).refreshes;
  await p.goto(B + '/auth/strava'); await lobby(); await p.waitForTimeout(600);
  ok('Token cấp ra đã quá hạn ngay khi kết nối -> làm mới rồi vẫn có dữ liệu', (await mode('')).refreshes === r1 + 1 && row(uid, 'real_daily').length >= 6);
  await mode('expired=0');

  // 3) Tự đồng bộ nền khi mở game
  db.prepare('UPDATE users SET last_sync=? WHERE id=?').run(Date.now() - 20 * 60e3, uid);
  const calls0 = (await mode('')).apiCalls; await api('/api/me'); await p.waitForTimeout(1500);
  const ls = db.prepare('SELECT last_sync FROM users WHERE id=?').get(uid).last_sync;
  ok('Tự đồng bộ nền khi last_sync > 15 phút', (await mode('')).apiCalls > calls0 && Date.now() - ls < 10000);
  const calls1 = (await mode('')).apiCalls; await api('/api/me'); await p.waitForTimeout(500);
  ok('Không đồng bộ lại khi vừa đồng bộ xong', (await mode('')).apiCalls === calls1);

  // 4) 401: Strava thu hồi quyền -> tự ngắt kết nối + thông báo
  await mode('fail=401'); db.prepare('UPDATE users SET last_sync=0 WHERE id=?').run(uid);
  await p.reload(); await lobby(); await p.click('[data-open=profile]'); await p.waitForSelector('#p-sync');
  await p.click('#p-sync'); await p.waitForTimeout(800);
  const toast = await p.innerText('#toast');
  ok('401 -> báo "Strava đã thu hồi quyền, hãy kết nối lại"', /thu hồi quyền/.test(toast), toast);
  ok('401 -> tự ngắt kết nối (token null, xóa km ngoài đời)', db.prepare('SELECT strava FROM users WHERE id=?').get(uid).strava === null && row(uid, 'real_daily').length === 0);
  await p.waitForTimeout(300); ok('401 -> hồ sơ hiện nút Kết nối Strava lại', (await p.locator('a[href="/auth/strava"]').count()) === 1);

  // 5) 429: hết hạn mức -> báo thử lại sau, không gọi chồng
  await mode('fail=none'); await p.goto(B + '/auth/strava'); await lobby(); await p.waitForTimeout(500);
  await mode('fail=429'); db.prepare('UPDATE users SET last_sync=0 WHERE id=?').run(uid);
  const s429 = await api('/api/strava/sync', {});
  ok('429 -> trả 429 với thông báo thử lại sau', s429.s === 429 && /thử lại sau/.test(s429.j.error), s429.j.error);
  ok('429 -> vẫn giữ kết nối (không ngắt)', db.prepare('SELECT strava FROM users WHERE id=?').get(uid).strava !== null);
  await mode('fail=none'); const c2 = (await mode('')).apiCalls; db.prepare('UPDATE users SET last_sync=0 WHERE id=?').run(uid);
  const s429b = await api('/api/strava/sync', {});
  ok('Sau 429: tôn trọng hạn mức, không gọi Strava trong thời gian chờ', s429b.s === 429 && (await mode('')).apiCalls === c2);

  console.log(res.join('\n')); console.log('Lỗi trang:', errs.slice(0, 3));
  console.log(res.some((x) => x.startsWith('LỖI')) ? 'TỔNG: CÓ LỖI' : 'TỔNG: TẤT CẢ ĐẠT');
  await b.close(); process.exit(0);
})().catch((e) => { console.log(res.join('\n')); console.error('NGOẠI LỆ', e.message); process.exit(1); });
