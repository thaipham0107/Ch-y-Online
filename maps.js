// Dữ liệu chung (server + trình duyệt): hằng số luật chơi, hạng, 10 bản đồ địa danh Việt Nam.
// Độ cao/độ dốc là xấp xỉ theo thực tế để chơi; có thể thay bằng file GPX thật của ban tổ chức giải.
(function (root) {
  const RULES = {
    STRIDE: 4.0,          // m / bước
    BOLT_STRIDE: 6.0,     // m / bước khi có tia sét
    BOLT_SECS: 8,
    MAX_STEPS_PER_SEC: 5,
    AUTO_STEPS_PER_SEC: 4.5,
    STAM_MAX: 100,
    STAM_PER_STEP: 0.06,
    BOLT_COST_MULT: 1.5,
    STAM_RESUME: 15,
    IDLE_REGEN: 2,
    BITE_STAM: 14, BITE_SLOW_SECS: 3, BITE_STRIDE_MULT: 0.5,
    HIT_STAM: 10, HIT_SLOW_SECS: 1,
    DOG_SPEED: 19, DOG_START_GAP: 10, DOG_SECS: 16, DOG_WARN_SECS: 2,
    MAGNET_SECS: 10, SHIELD_SECS: 8, SLIDE_SECS: 0.7,
    RAMP_START: 0.8, RAMP_FULL: 0.6,   // bước ngắn dần lúc xuất phát (80%), đạt 100% sau 60% quãng đường: tốc độ tăng dần như Temple Run
    INV_SLOTS: 5, INV_STACK: 5, BOOST_HOURS: 24
  };
  const ITEMS = {
    water:  { name: 'Nước',      icon: '💧', stam: 15,  w: 40 },
    banana: { name: 'Chuối',     icon: '🍌', stam: 25,  w: 25 },
    melon:  { name: 'Dưa hấu',   icon: '🍉', stam: 35,  w: 15 },
    elec:   { name: 'Điện giải', icon: '🧂', stam: 50,  w: 8, cure: true },
    bolt:   { name: 'Tia sét',   icon: '⚡', stam: 0,   w: 30 },
    magnet: { name: 'Nam châm',  icon: '🧲', stam: 0,   w: 10 },
    shield: { name: 'Khiên',     icon: '🛡️', stam: 0,   w: 9 }
  };
  const TIERS = [
    { min: 0,    name: 'Gà con',      icon: '🐣', color: '#8b95a1' },
    { min: 10,   name: 'Tập sự',      icon: '🥾', color: '#22c55e' },
    { min: 50,   name: 'Chiến binh',  icon: '🏃', color: '#0ea5e9' },
    { min: 150,  name: 'Siêu nhân',   icon: '🔥', color: '#f59e0b' },
    { min: 400,  name: 'Huyền thoại', icon: '⚡', color: '#ef4444' },
    { min: 1000, name: 'Thần chạy',   icon: '👑', color: '#a855f7' }
  ];

  // 4 làn đường rộng; vị trí ngang (m) của tâm từng làn
  const LANES = { COUNT: 4, X: [-3.6, -1.2, 1.2, 3.6], HALF: 5.0 };
  // xu: kiếm khi chạy (nhiều hơn khi chạy ngoài đời để khuyến khích)
  const COIN = { PER_KM_GAME: 10, PER_KM_REAL: 25, FINISH: 20, ICON: '🪙' };
  const SHOP_CATS = [['hat', 'Mũ'], ['shoes', 'Giày'], ['acc', 'Phụ kiện'], ['watch', 'Đồng hồ'], ['aura', 'Hào quang'], ['boost', 'Đồ dùng (24h)']];
  const SHOP_DEFAULT = { hat: 'none', shoes: 'shoe_basic', acc: 'none', watch: 'none', aura: 'aura_tier' };
  // Mỗi trang bị có thể có hiệu ứng (fx) ảnh hưởng tới việc chạy; đồ trang trí (không fx) tồn tại vĩnh viễn trên nhân vật.
  // fx: speed (+% bước dài), stamSave (-% tiêu hao thể lực), slopeSave (-% phần tốn thêm khi lên dốc), eatBonus (+% thể lực từ đồ ăn),
  // coinMult (+% xu), biteResist (-% thể lực mất khi chó cắn), slowResist (-% thời gian bị chậm), hitSlow (nhân thời gian chậm khi vấp), pickupR (+% vùng nhặt),
  // power (+giây cho khiên/nam châm/tia sét), jumpLong (+% thời gian nhảy), slots (+ô túi)
  const SHOP = [
    { id: 'none', cat: 'hat', name: 'Không đội', price: 0, icon: '🙂' },
    { id: 'bando', cat: 'hat', name: 'Băng đô', price: 100, icon: '🎀', color: '#e03131', fx: { stamSave: 0.05 }, desc: 'Giảm 5% tiêu hao thể lực' },
    { id: 'nonla', cat: 'hat', name: 'Nón lá', price: 120, icon: '👒', color: '#ecd58e', fx: { stamSave: 0.08 }, desc: 'Giảm 8% tiêu hao thể lực' },
    { id: 'cap', cat: 'hat', name: 'Mũ lưỡi trai', price: 160, icon: '🧢', color: '#1971c2', fx: { coinMult: 0.1 }, desc: '+10% xu kiếm được' },
    { id: 'neko', cat: 'hat', name: 'Tai mèo', price: 250, icon: '🐱', color: '#ffb3c7', fx: { biteResist: 0.4 }, desc: 'Chó cắn mất ít thể lực hơn 40%' },
    { id: 'crown', cat: 'hat', name: 'Vương miện', price: 600, icon: '👑', color: '#f5b700', fx: { coinMult: 0.2, power: 2 }, desc: '+20% xu; khiên, nam châm, tia sét lâu hơn 2 giây' },
    { id: 'shoe_basic', cat: 'shoes', name: 'Giày thường', price: 0, icon: '👞', color: '#3a2d26' },
    { id: 'shoe_red', cat: 'shoes', name: 'Giày đỏ', price: 80, icon: '👟', color: '#e03131', fx: { speed: 0.01 }, desc: '+1% tốc độ' },
    { id: 'shoe_blue', cat: 'shoes', name: 'Giày xanh', price: 120, icon: '👟', color: '#1c7ed6', fx: { speed: 0.02 }, desc: '+2% tốc độ' },
    { id: 'shoe_road', cat: 'shoes', name: 'Giày chạy phố', price: 200, icon: '👟', color: '#8b5cf6', fx: { speed: 0.03, hitSlow: 0.5 }, desc: '+3% tốc độ; vấp chướng ngại chỉ chậm một nửa' },
    { id: 'shoe_gold', cat: 'shoes', name: 'Giày vàng', price: 300, icon: '🥇', color: '#f5b700', fx: { speed: 0.04, coinMult: 0.1 }, desc: '+4% tốc độ, +10% xu' },
    { id: 'shoe_trail', cat: 'shoes', name: 'Giày địa hình', price: 450, icon: '🥾', color: '#2f9e44', fx: { speed: 0.06, slopeSave: 0.25 }, desc: '+6% tốc độ; leo dốc ít tốn thể lực hơn 25%' },
    { id: 'shoe_carbon', cat: 'shoes', name: 'Giày carbon', price: 650, icon: '👟', color: '#1f2937', fx: { speed: 0.08, stamSave: 0.08 }, desc: '+8% tốc độ, giảm 8% tiêu hao thể lực' },
    { id: 'shoe_wing', cat: 'shoes', name: 'Giày cánh', price: 900, icon: '🪽', color: '#ffffff', fx: { speed: 0.10, jumpLong: 0.25 }, desc: '+10% tốc độ; nhảy lâu hơn 25%' },
    { id: 'none', cat: 'acc', name: 'Không', price: 0, icon: '🙂' },
    { id: 'glasses', cat: 'acc', name: 'Kính râm', price: 150, icon: '🕶️', color: '#111', fx: { pickupR: 0.4 }, desc: 'Vùng nhặt vật phẩm rộng hơn 40%' },
    { id: 'scarf', cat: 'acc', name: 'Khăn quàng', price: 120, icon: '🧣', color: '#d6453d', fx: { slowResist: 0.2 }, desc: 'Bị chậm ngắn hơn 20%' },
    { id: 'backpack', cat: 'acc', name: 'Ba lô', price: 200, icon: '🎒', color: '#2f9e44', fx: { slots: 1 }, desc: '+1 ô túi đồ' },
    { id: 'cape', cat: 'acc', name: 'Áo choàng', price: 450, icon: '🦸', color: '#b02a4a', fx: { power: 3 }, desc: 'Khiên, nam châm, tia sét lâu hơn 3 giây' },
    { id: 'bow', cat: 'acc', name: 'Nơ', price: 90, icon: '🎀', color: '#ff6fa5', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'banner', cat: 'acc', name: 'Băng rôn', price: 130, icon: '🎗️', color: '#e03131', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'none', cat: 'watch', name: 'Không', price: 0, icon: '🙂' },
    { id: 'watch_basic', cat: 'watch', name: 'Đồng hồ thể thao', price: 100, icon: '⌚', color: '#222', fx: { eatBonus: 0.1 }, desc: 'Đồ ăn hồi thêm 10% thể lực' },
    { id: 'watch_gold', cat: 'watch', name: 'Đồng hồ vàng', price: 350, icon: '⌚', color: '#f5b700', fx: { eatBonus: 0.2 }, desc: 'Đồ ăn hồi thêm 20% thể lực' },
    { id: 'watch_smart', cat: 'watch', name: 'Đồng hồ thông minh', price: 500, icon: '⌚', color: '#38bdf8', fx: { eatBonus: 0.3 }, desc: 'Đồ ăn hồi thêm 30% thể lực' },
    { id: 'aura_tier', cat: 'aura', name: 'Theo hạng', price: 0, icon: '✨' },
    { id: 'aura_gold', cat: 'aura', name: 'Hào quang vàng', price: 300, icon: '🌟', color: '#ffd23a', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'aura_fire', cat: 'aura', name: 'Hào quang lửa', price: 500, icon: '🔥', color: '#ff6a2a', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'aura_ice', cat: 'aura', name: 'Hào quang băng', price: 500, icon: '❄️', color: '#7fd8ff', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'aura_sakura', cat: 'aura', name: 'Hào quang hoa anh đào', price: 700, icon: '🌸', color: '#ff9ccd', desc: 'Trang trí, tồn tại vĩnh viễn' },
    { id: 'aura_rainbow', cat: 'aura', name: 'Hào quang cầu vồng', price: 1200, icon: '🌈', color: '#ff00ff', desc: 'Trang trí, tồn tại vĩnh viễn' }
  ];
  // đồ dùng một lần, mua về vào túi đồ và hết hạn sau BOOST_HOURS giờ
  const BOOST = [
    { id: 'shield', k: 'shield', name: 'Khiên', price: 60, icon: '🛡️', desc: 'Chặn mọi va chạm trong 8 giây khi dùng' },
    { id: 'bolt', k: 'bolt', name: 'Tia sét', price: 40, icon: '⚡', desc: 'Bước dài 6 m trong 8 giây khi dùng' },
    { id: 'magnet', k: 'magnet', name: 'Nam châm', price: 50, icon: '🧲', desc: 'Hút xu ở mọi làn trong 10 giây khi dùng' }
  ];
  // tổng hợp hiệu ứng của bộ trang bị đang mặc (mũ, giày, phụ kiện, đồng hồ). Dùng chung cho server (kiểm tra km, xu) và trình duyệt.
  const perksOf = (equip = {}) => {
    const p = { speed: 0, stamSave: 0, slopeSave: 0, eatBonus: 0, coinMult: 0, biteResist: 0, slowResist: 0, hitSlow: 1, pickupR: 0, power: 0, jumpLong: 0, slots: 0 };
    for (const cat of ['hat', 'shoes', 'acc', 'watch']) {
      const it = SHOP.find((x) => x.cat === cat && x.id === equip[cat]); if (!it || !it.fx) continue;
      for (const [k, v] of Object.entries(it.fx)) { if (k === 'hitSlow') p.hitSlow = Math.min(p.hitSlow, v); else p[k] += v; }
    }
    return p;
  };
  const shopItem = (cat, id) => SHOP.find((x) => x.cat === cat && x.id === id);
  // biểu tượng huy chương giải đấu cho phép chọn
  const MEDAL_ICONS = ['🏃', '🏆', '🌿', '⭐', '🔥', '⚡', '🏔️', '🌊', '🐉', '🌸', '🦅', '❤️'];
  const MEDAL_SHAPES = ['circle', 'shield', 'star', 'hex'];

  const tierIndex = (km) => { let i = 0; TIERS.forEach((t, k) => { if (km >= t.min) i = k; }); return i; };

  // elev: [km, mét so với mực nước biển]; curve: độ ngoằn ngoèo; theme: khóa dựng cảnh phía client
  const MAPS = [
    { id: 'hoguom', name: 'Hà Nội – Cầu Long Biên', place: 'Hà Nội', diff: 1, km: 6, theme: 'hanoi',
      desc: 'Cung đường chạy qua nội thành Hà Nội tới cầu Long Biên (GPX Komoot).',
      ref: 'Tham khảo các giải chạy phố đi bộ quanh hồ Gươm', elev: [[0, 6], [6, 6]],
      curve: { a: 0.35, f: [0.006, 0.0135] }, sky: ['#7fc4f2', '#f4efe3'], fog: '#e9e6dc' },
    { id: 'saigon', name: 'Nguyễn Huệ – Bến Bạch Đằng', place: 'TP. Hồ Chí Minh', diff: 1, km: 6, theme: 'saigon',
      desc: 'Cung đường qua trung tâm TP. Hồ Chí Minh (GPX Komoot).',
      ref: 'Tham khảo cung đường quanh trung tâm của giải Marathon TP.HCM', elev: [[0, 3], [3, 5], [6, 3]],
      curve: { a: 0.3, f: [0.005, 0.012] }, sky: ['#77b9ee', '#f6e7cf'], fog: '#e8dcc8' },
    { id: 'danang', name: 'Cầu Rồng – Biển Mỹ Khê', place: 'Đà Nẵng', diff: 2, km: 8, theme: 'danang',
      desc: 'Từ cầu Rồng tới biển Mỹ Khê (GPX Komoot).',
      ref: 'Tham khảo cung đường của giải Marathon Quốc tế Đà Nẵng', elev: [[0, 3], [2, 4], [2.5, 16], [3, 4], [8, 3]],
      curve: { a: 0.3, f: [0.004, 0.01] }, sky: ['#5fb8f5', '#fdf3df'], fog: '#e7edf0', sea: 'L' },
    { id: 'halong', name: 'Bãi Cháy – Vịnh Hạ Long', place: 'Quảng Ninh', diff: 2, km: 8, theme: 'halong',
      desc: 'Từ Quảng Ninh vượt đồi tới cầu Bãi Cháy (GPX Komoot).',
      ref: 'Tham khảo cung đường của giải VnExpress Marathon Hạ Long', elev: [[0, 4], [2, 12], [3, 48], [4, 52], [5, 30], [6, 10], [8, 5]],
      curve: { a: 0.45, f: [0.0045, 0.012] }, sky: ['#7dc7e8', '#eaf6f2'], fog: '#d9ece8', sea: 'R' },
    { id: 'trangan', name: 'Tràng An', place: 'Ninh Bình', diff: 2, km: 7, theme: 'trangan',
      desc: 'Từ khu du lịch Tràng An qua núi đá vôi và đồng lúa tới chùa Bái Đính.',
      ref: 'Lấy cảm hứng từ các cung chạy quanh quần thể Tràng An', elev: [[0, 5], [2, 9], [4, 6], [6, 12], [7, 8]],
      curve: { a: 0.5, f: [0.005, 0.013] }, sky: ['#86c9ee', '#f3f1dc'], fog: '#e3e8d6' },
    { id: 'mocchau', name: 'Đồi chè Mộc Châu', place: 'Sơn La', diff: 3, km: 10, theme: 'mocchau',
      desc: 'Từ thị xã Mộc Châu qua những đồi chè xanh tới thác Dải Yếm.',
      ref: 'Tham khảo các giải chạy trên cao nguyên Mộc Châu', elev: [[0, 980], [2, 1030], [4, 1010], [6, 1090], [8, 1050], [10, 1100]],
      curve: { a: 0.7, f: [0.0055, 0.014] }, sky: ['#9fd0ee', '#eef2e8'], fog: '#dfe9e0' },
    { id: 'haivan', name: 'Đèo Hải Vân', place: 'Đà Nẵng – Huế', diff: 4, km: 12, theme: 'haivan',
      desc: 'Leo từ chân đèo lên đỉnh 496 m với vách núi, biển xanh bên dưới và cổng Hải Vân Quan.',
      ref: 'Tham khảo các giải chạy leo đèo Hải Vân', elev: [[0, 8], [2, 95], [4, 210], [6, 330], [8, 430], [10, 496], [12, 400]],
      curve: { a: 1.1, f: [0.0065, 0.016] }, sky: ['#72b6ea', '#e7eef0'], fog: '#bcd4e6', canyon: 'R', cliff: 'L' },
    { id: 'prenn', name: 'Đèo Prenn', place: 'Đà Lạt', diff: 4, km: 6, theme: 'prenn',
      desc: 'Đường dốc xuống từ trung tâm Đà Lạt, vùng đèo Prenn (GPX Komoot).',
      ref: 'Lấy cảm hứng từ các cung trail của Dalat Ultra Trail', elev: [[0, 1100], [1.5, 1220], [3, 1340], [4.5, 1430], [6, 1490]],
      curve: { a: 1.2, f: [0.007, 0.017] }, sky: ['#aac6d9', '#e5ebe8'], fog: '#cdd9d6', cliff: 'L' },
    { id: 'oquyho', name: 'Đèo Ô Quy Hồ', place: 'Sa Pa – Lai Châu', diff: 5, km: 10, theme: 'oquyho',
      desc: 'Từ Sa Pa leo đèo Ô Quy Hồ tới cầu kính Rồng Mây (GPX Komoot).',
      ref: 'Tham khảo các cung chạy của Vietnam Mountain Marathon (Sa Pa)', elev: [[0, 1550], [2, 1760], [4, 1900], [6, 2000], [8, 2035], [10, 1990]],
      curve: { a: 1.3, f: [0.0075, 0.018] }, sky: ['#6aa9e0', '#eaf0f4'], fog: '#d4dfe8', cliff: 'R' },
    { id: 'mapileng', name: 'Mã Pí Lèng', place: 'Hà Giang', diff: 5, km: 8, theme: 'mapileng',
      desc: 'Từ đèo Mã Pí Lèng xuống dốc về phía Mèo Vạc (GPX Komoot).',
      ref: 'Lấy cảm hứng từ các giải chạy cung đường Hạnh Phúc, Hà Giang', elev: [[0, 820], [1.5, 980], [3, 1160], [4.5, 1230], [6, 1180], [8, 1020]],
      curve: { a: 1.4, f: [0.0075, 0.019] }, sky: ['#78b1e0', '#efe9dc'], fog: '#d9dcd8', cliff: 'L', canyon: 'R' }
  ];

  // độ cao (m) tại quãng đường s (m): nội suy cosine giữa các mốc
  function elevAt(map, s) {
    const e = map.elev, km = s / 1000;
    if (km <= e[0][0]) return e[0][1];
    for (let i = 1; i < e.length; i++) if (km <= e[i][0]) {
      const t = (km - e[i - 1][0]) / (e[i][0] - e[i - 1][0]);
      const u = (1 - Math.cos(Math.PI * t)) / 2;
      return e[i - 1][1] + (e[i][1] - e[i - 1][1]) * u;
    }
    return e[e.length - 1][1];
  }
  // độ dốc % (dương = lên dốc), lấy trung bình quanh s
  function gradeAt(map, s) { return (elevAt(map, s + 25) - elevAt(map, Math.max(0, s - 25))) / (s < 25 ? s + 25 : 50) * 100; }
  function stats(map) {
    let gain = 0, max = 0, prev = elevAt(map, 0);
    for (let s = 20; s <= map.km * 1000; s += 20) { const y = elevAt(map, s); if (y > prev) gain += y - prev; prev = y; max = Math.max(max, gradeAt(map, s)); }
    return { gain: Math.round(gain), maxGrade: Math.round(max * 10) / 10 };
  }
  // hệ số thể lực mỗi bước theo độ dốc: lên dốc tốn hơn, xuống dốc đỡ hơn
  const slopeMult = (g) => (g >= 0 ? 1 + 0.12 * g : Math.max(0.6, 1 + 0.04 * g));

  // Gắn dữ liệu đường chạy thật (public/courses/meta.json): độ dài, độ cao, bên vách/vực/biển, nguồn dữ liệu
  function applyMeta(meta) {
    for (const m of MAPS) {
      const x = meta && meta[m.id]; if (!x) continue;
      m.km = x.km; m.elev = x.elev; m.source = x.source; m.gain = x.gain; m.marks = x.marks || {}; m.real = true;
      delete m.cliff; delete m.canyon; delete m.sea; delete m.lake; delete m.river;
      Object.assign(m, x.sides || {});
    }
  }
  const api = { applyMeta, RULES, ITEMS, TIERS, tierIndex, MAPS, elevAt, gradeAt, stats, slopeMult, LANES, COIN, SHOP, BOOST, perksOf, SHOP_CATS, SHOP_DEFAULT, shopItem, MEDAL_ICONS, MEDAL_SHAPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shared = api;
})(typeof window !== 'undefined' ? window : this);
