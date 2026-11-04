// Kiểm tra trước khi chạy: node tools/doctor.mjs
import fs from 'node:fs'; import path from 'node:path'; import net from 'node:net'; import { spawnSync } from 'node:child_process';
const root = path.resolve(import.meta.dirname, '..');
let bad = 0; const row = (ok, m, hint) => { console.log((ok ? 'ok   ' : 'LỖI ') + m + (!ok && hint ? '\n       → ' + hint : '')); if (!ok) bad++; };
const warn = (m) => console.log('lưu ý ' + m);
const [maj, min] = process.versions.node.split('.').map(Number);
row(maj > 22 || (maj === 22 && min >= 5), `Node ${process.versions.node}`, 'cần Node 22.5 trở lên (https://nodejs.org)');
row(fs.existsSync(path.join(root, 'node_modules/express')), 'đã cài thư viện', 'chạy: npm install --omit=dev');
// đọc .env đơn giản
const env = { ...process.env };
try { for (const l of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l); if (m && !l.trim().startsWith('#') && !(m[1] in env)) env[m[1]] = m[2]; } } catch { warn('chưa có file .env (dùng mặc định). Tạo bằng: copy .env.example .env'); }
const base = env.BASE_URL || '';
row(/^https:\/\//.test(base) || !env.STRAVA_CLIENT_ID, `BASE_URL = ${base || '(chưa đặt)'}`, 'khi đã có tên miền Cloudflare, đặt BASE_URL=https://tên-miền-của-bạn trong .env');
const adminOk = !!(env.ADMIN_USER && env.ADMIN_PASS) || fs.existsSync(path.join(root, 'admin.config.json'));
row(adminOk, 'tài khoản quản trị', 'đặt ADMIN_USER và ADMIN_PASS trong .env (nếu không, /admin/ bị tắt)');
if (env.ADMIN_PASS && env.ADMIN_PASS.length < 10) warn('ADMIN_PASS ngắn: đặt mật khẩu dài hơn 10 ký tự vì trang quản trị sẽ ra Internet');
const port = +env.PORT || 3000;
await new Promise((r) => { const s = net.createServer().once('error', () => { warn(`cổng ${port} đang được dùng (game đang chạy rồi, hoặc phần mềm khác)`); r(); }).once('listening', () => s.close(r)).listen(port); });
try { fs.mkdirSync(path.join(root, 'data'), { recursive: true }); fs.accessSync(path.join(root, 'data'), fs.constants.W_OK); row(true, 'thư mục data ghi được'); } catch { row(false, 'thư mục data', 'cần quyền ghi'); }
const cf = spawnSync('cloudflared', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (cf.status === 0) row(true, 'cloudflared: ' + cf.stdout.trim().split('\n')[0]); else warn('chưa thấy cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), cần để đưa game ra Internet');
console.log(bad ? `\n${bad} mục cần sửa` : '\nSẵn sàng'); process.exit(bad ? 1 : 0);
