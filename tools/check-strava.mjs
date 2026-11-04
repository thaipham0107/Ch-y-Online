// Kiểm tra cấu hình Strava: npm run check:strava
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const strava = require('../strava.js');

const baseUrl = String(process.env.BASE_URL || strava.FILE_BASE_URL || '').replace(/\/$/, '');
const rows = []; let bad = 0;
const row = (ok, what, detail = '') => { rows.push(`${ok === true ? '✅' : ok === false ? '❌' : '⚠️ '} ${what}${detail ? ' — ' + detail : ''}`); if (ok === false) bad++; };

console.log('Kiểm tra cấu hình Strava (file: strava.config.json hoặc biến môi trường)\n');
if (strava.MOCK) row(null, 'Đang bật STRAVA_MOCK=1', 'dữ liệu Strava là GIẢ, bỏ biến này khi chạy thật');
row(!!strava.CLIENT_ID, 'Client ID', strava.CLIENT_ID ? `đã điền (${strava.CLIENT_ID})` : 'chưa điền (trong strava.config.json: "clientId")');
row(!!strava.CLIENT_SECRET, 'Client Secret', strava.CLIENT_SECRET ? 'đã điền (ẩn)' : 'chưa điền (trong strava.config.json: "clientSecret")');

let host = '', callback = '';
try {
  const u = new URL(baseUrl); host = u.hostname; callback = `${baseUrl}/auth/strava/callback`;
  const local = ['localhost', '127.0.0.1'].includes(host);
  row(true, 'baseUrl hợp lệ', baseUrl);
  if (u.protocol === 'http:' && !local) row(null, 'baseUrl dùng http', 'nên dùng https khi chạy thật (cookie đăng nhập chỉ an toàn với https)');
  if (u.pathname !== '/' && u.pathname !== '') row(null, 'baseUrl có đường dẫn', 'chỉ nên là địa chỉ gốc, ví dụ https://chay.example.com');
} catch { row(false, 'baseUrl', baseUrl ? `"${baseUrl}" không phải URL hợp lệ` : 'chưa điền (ví dụ https://chay.example.com)'); }
row(strava.SCOPE.includes('activity:read'), 'Quyền (scope)', strava.SCOPE.includes('activity:read') ? strava.SCOPE : `"${strava.SCOPE}" thiếu activity:read nên không đọc được hoạt động`);

if (host) {
  console.log('Điền vào trang https://www.strava.com/settings/api:');
  console.log(`   • Authorization Callback Domain : ${host}`);
  console.log(`   • (URL callback game dùng)      : ${callback}\n`);
}
if (strava.CLIENT_ID && strava.CLIENT_SECRET && !strava.MOCK) {
  try {
    const r = await fetch(`${strava.OAUTH_URL}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: strava.CLIENT_ID, client_secret: strava.CLIENT_SECRET, code: 'kiem-tra-khong-co-that', grant_type: 'authorization_code' }), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({})), res = ((j.errors || [])[0] || {}).resource;
    if (r.status === 401 || res === 'Application') row(false, 'Khóa Strava', 'Client ID hoặc Client Secret SAI (Strava trả 401)');
    else if (r.status === 400) row(true, 'Khóa Strava', 'ĐÚNG (Strava chỉ từ chối mã thử nghiệm, đúng như mong đợi)');
    else if (r.status === 429) row(null, 'Khóa Strava', 'Strava đang giới hạn tần suất (429), thử lại sau');
    else row(null, 'Khóa Strava', `phản hồi lạ: ${r.status}`);
  } catch (e) { row(null, 'Gọi thử tới Strava', `không kết nối được (${e.message}). Kiểm tra mạng rồi chạy lại`); }
} else if (!strava.MOCK) row(null, 'Gọi thử tới Strava', 'bỏ qua vì chưa đủ Client ID/Secret');

console.log(rows.join('\n'));
console.log(bad ? `\n${bad} mục cần sửa trước khi bấm "Kết nối Strava".` : '\nCấu hình ổn. Chạy `npm start` rồi vào Hồ sơ → Kết nối Strava.');
process.exit(bad ? 1 : 0);
