'use strict';
// Máy chủ Node (chạy trực tiếp hoặc Docker). Bản Cloudflare nằm ở worker/. Lõi dùng chung: core.js.
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { WebSocketServer } = require('ws');
const createCore = require('./core');
const nodeTiles = require('./node-tiles');

const env = process.env;
const DATA_DIR = env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'chay.db'));
db.exec('PRAGMA journal_mode=WAL;');
db.tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } };

let meta = null;
try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/courses/meta.json'), 'utf8')); } catch { /* chưa dựng dữ liệu đường chạy: dùng số liệu mặc định */ }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '300kb' }));
app.use('/maps.js', (req, res) => res.sendFile(path.join(__dirname, 'maps.js')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use('/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist')));
app.use(express.static(path.join(__dirname, 'public')));
const tiles = nodeTiles(env, DATA_DIR);
app.get('/tiles/:style/:z/:x/:y', tiles.route);

const core = createCore({ db, app, env, platform: { version: require('./package.json').version, meta, tileStats: tiles.stats } });

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
wss.on('connection', (ws, req) => {
  const c = core.connect({ send: (s) => ws.send(s), open: () => ws.readyState === 1 }, req.headers.cookie);
  ws.on('message', (raw) => c.message(raw));
  ws.on('close', () => c.close());
  ws.on('error', () => {});
});
setInterval(core.snapTick, 200);
setInterval(core.sweep, 30000);

if (require.main === module) {
  server.listen(core.PORT, () => console.log(`Chạy Online 3D: ${core.BASE_URL}  (Strava: ${core.strava.MOCK ? 'DEMO giả' : core.strava.configured() ? 'đã cấu hình' : 'chưa cấu hình'})`));
}
module.exports = { app, server };
