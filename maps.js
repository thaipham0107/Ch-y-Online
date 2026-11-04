// Dữ liệu chung (server + trình duyệt): hằng số luật chơi, hạng, 10 bản đồ địa danh Việt Nam.
// Độ cao/độ dốc là xấp xỉ theo thực tế để chơi; có thể thay bằng file GPX thật của ban tổ chức giải.
(function (root) {
  const RULES = {
    STRIDE: 2.0,          // m / bước
    BOLT_STRIDE: 3.0,     // m / bước khi có tia sét
    BOLT_SECS: 8,
    MAX_STEPS_PER_SEC: 4,
    AUTO_STEPS_PER_SEC: 1,
    STAM_MAX: 100,
    STAM_PER_STEP: 0.12,
    BOLT_COST_MULT: 1.5,
    STAM_RESUME: 15,
    IDLE_REGEN: 2,
    BITE_STAM: 20, BITE_SLOW_SECS: 4, BITE_STRIDE_MULT: 0.5,
    HIT_STAM: 10, HIT_SLOW_SECS: 1,
    DOG_SPEED: 2.8, DOG_START_GAP: 3.5, DOG_SECS: 9, DOG_WARN_SECS: 2,
    INV_SLOTS: 5, INV_STACK: 3
  };
  const ITEMS = {
    water:  { name: 'Nước',      icon: '💧', stam: 15,  w: 40 },
    banana: { name: 'Chuối',     icon: '🍌', stam: 25,  w: 25 },
    melon:  { name: 'Dưa hấu',   icon: '🍉', stam: 35,  w: 15 },
    elec:   { name: 'Điện giải', icon: '🧂', stam: 50,  w: 8, cure: true },
    bolt:   { name: 'Tia sét',   icon: '⚡', stam: 0,   w: 12 }
  };
  const TIERS = [
    { min: 0,    name: 'Gà con',      icon: '🐣', color: '#8b95a1' },
    { min: 10,   name: 'Tập sự',      icon: '🥾', color: '#22c55e' },
    { min: 50,   name: 'Chiến binh',  icon: '🏃', color: '#0ea5e9' },
    { min: 150,  name: 'Siêu nhân',   icon: '🔥', color: '#f59e0b' },
    { min: 400,  name: 'Huyền thoại', icon: '⚡', color: '#ef4444' },
    { min: 1000, name: 'Thần chạy',   icon: '👑', color: '#a855f7' }
  ];
  const tierIndex = (km) => { let i = 0; TIERS.forEach((t, k) => { if (km >= t.min) i = k; }); return i; };

  // elev: [km, mét so với mực nước biển]; curve: độ ngoằn ngoèo; theme: khóa dựng cảnh phía client
  const MAPS = [
    { id: 'hoguom', name: 'Hồ Gươm', place: 'Hà Nội', diff: 1, km: 6, theme: 'hanoi',
      desc: 'Vòng quanh hồ Hoàn Kiếm: Tháp Rùa, cầu Thê Húc, phố cổ nhà ống, hàng phượng và liễu rủ.',
      ref: 'Tham khảo các giải chạy phố đi bộ quanh hồ Gươm', elev: [[0, 6], [6, 6]],
      curve: { a: 0.35, f: [0.006, 0.0135] }, sky: ['#7fc4f2', '#f4efe3'], fog: '#e9e6dc' },
    { id: 'saigon', name: 'Nguyễn Huệ – Bến Bạch Đằng', place: 'TP. Hồ Chí Minh', diff: 1, km: 6, theme: 'saigon',
      desc: 'Phố đi bộ Nguyễn Huệ, tháp Bitexco, bờ sông Sài Gòn, cầu Ba Son.',
      ref: 'Tham khảo cung đường quanh trung tâm của giải Marathon TP.HCM', elev: [[0, 3], [3, 5], [6, 3]],
      curve: { a: 0.3, f: [0.005, 0.012] }, sky: ['#77b9ee', '#f6e7cf'], fog: '#e8dcc8' },
    { id: 'danang', name: 'Cầu Rồng – Biển Mỹ Khê', place: 'Đà Nẵng', diff: 2, km: 8, theme: 'danang',
      desc: 'Cầu Rồng phun lửa, đường Võ Nguyên Giáp ven biển Mỹ Khê, bán đảo Sơn Trà phía xa.',
      ref: 'Tham khảo cung đường của giải Marathon Quốc tế Đà Nẵng', elev: [[0, 3], [2, 4], [2.5, 16], [3, 4], [8, 3]],
      curve: { a: 0.3, f: [0.004, 0.01] }, sky: ['#5fb8f5', '#fdf3df'], fog: '#e7edf0', sea: 'L' },
    { id: 'halong', name: 'Bãi Cháy – Vịnh Hạ Long', place: 'Quảng Ninh', diff: 2, km: 8, theme: 'halong',
      desc: 'Cầu Bãi Cháy bắc qua vịnh, các đảo đá vôi nhô lên mặt nước, thuyền buồm nâu.',
      ref: 'Tham khảo cung đường của giải VnExpress Marathon Hạ Long', elev: [[0, 4], [2, 12], [3, 48], [4, 52], [5, 30], [6, 10], [8, 5]],
      curve: { a: 0.45, f: [0.0045, 0.012] }, sky: ['#7dc7e8', '#eaf6f2'], fog: '#d9ece8', sea: 'R' },
    { id: 'trangan', name: 'Tràng An', place: 'Ninh Bình', diff: 2, km: 7, theme: 'trangan',
      desc: 'Núi đá vôi dựng đứng giữa đồng lúa, sông nước, chùa Bái Đính xa xa.',
      ref: 'Lấy cảm hứng từ các cung chạy quanh quần thể Tràng An', elev: [[0, 5], [2, 9], [4, 6], [6, 12], [7, 8]],
      curve: { a: 0.5, f: [0.005, 0.013] }, sky: ['#86c9ee', '#f3f1dc'], fog: '#e3e8d6' },
    { id: 'mocchau', name: 'Đồi chè Mộc Châu', place: 'Sơn La', diff: 3, km: 10, theme: 'mocchau',
      desc: 'Những đồi chè xanh uốn lượn, rừng thông, sương sớm trên cao nguyên 1.000 m.',
      ref: 'Tham khảo các giải chạy trên cao nguyên Mộc Châu', elev: [[0, 980], [2, 1030], [4, 1010], [6, 1090], [8, 1050], [10, 1100]],
      curve: { a: 0.7, f: [0.0055, 0.014] }, sky: ['#9fd0ee', '#eef2e8'], fog: '#dfe9e0' },
    { id: 'haivan', name: 'Đèo Hải Vân', place: 'Đà Nẵng – Huế', diff: 4, km: 12, theme: 'haivan',
      desc: 'Leo từ chân đèo lên đỉnh 496 m với vách núi, biển xanh bên dưới và cổng Hải Vân Quan.',
      ref: 'Tham khảo các giải chạy leo đèo Hải Vân', elev: [[0, 8], [2, 95], [4, 210], [6, 330], [8, 430], [10, 496], [12, 400]],
      curve: { a: 1.1, f: [0.0065, 0.016] }, sky: ['#72b6ea', '#e7eef0'], fog: '#bcd4e6', canyon: 'R', cliff: 'L' },
    { id: 'prenn', name: 'Đèo Prenn', place: 'Đà Lạt', diff: 4, km: 6, theme: 'prenn',
      desc: 'Đường đèo dưới rừng thông, sương mù, thác Prenn và thung lũng phía dưới.',
      ref: 'Lấy cảm hứng từ các cung trail của Dalat Ultra Trail', elev: [[0, 1100], [1.5, 1220], [3, 1340], [4.5, 1430], [6, 1490]],
      curve: { a: 1.2, f: [0.007, 0.017] }, sky: ['#aac6d9', '#e5ebe8'], fog: '#cdd9d6', cliff: 'L' },
    { id: 'oquyho', name: 'Đèo Ô Quy Hồ', place: 'Sa Pa – Lai Châu', diff: 5, km: 10, theme: 'oquyho',
      desc: 'Đèo cao nhất miền Bắc: ruộng bậc thang, biển mây, đỉnh Fansipan phía sau.',
      ref: 'Tham khảo các cung chạy của Vietnam Mountain Marathon (Sa Pa)', elev: [[0, 1550], [2, 1760], [4, 1900], [6, 2000], [8, 2035], [10, 1990]],
      curve: { a: 1.3, f: [0.0075, 0.018] }, sky: ['#6aa9e0', '#eaf0f4'], fog: '#d4dfe8', cliff: 'R' },
    { id: 'mapileng', name: 'Mã Pí Lèng', place: 'Hà Giang', diff: 5, km: 8, theme: 'mapileng',
      desc: 'Đường treo trên vách đá cao, hẻm vực Tu Sản, dòng sông Nho Quế xanh ngọc phía dưới.',
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

  const api = { RULES, ITEMS, TIERS, tierIndex, MAPS, elevAt, gradeAt, stats, slopeMult };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Shared = api;
})(typeof window !== 'undefined' ? window : this);
