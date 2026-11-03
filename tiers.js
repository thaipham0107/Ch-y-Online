// Dùng chung cho server (require) và trình duyệt (<script>)
(function (root) {
  const TIERS = [
    { min: 0,    name: 'Gà con',    icon: '🐣', color: '#8b95a1' },
    { min: 10,   name: 'Tập sự',    icon: '🥾', color: '#22c55e' },
    { min: 50,   name: 'Chiến binh',icon: '🏃', color: '#0ea5e9' },
    { min: 150,  name: 'Siêu nhân', icon: '🔥', color: '#f59e0b' },
    { min: 400,  name: 'Huyền thoại',icon: '⚡', color: '#ef4444' },
    { min: 1000, name: 'Thần chạy', icon: '👑', color: '#a855f7' }
  ];
  function tierIndex(km) {
    let idx = 0;
    for (let i = 0; i < TIERS.length; i++) if (km >= TIERS[i].min) idx = i;
    return idx;
  }
  // km càng cao chạy càng nhanh (tối đa +60%)
  function speedMult(km) { return 1 + Math.min(0.6, Math.max(0, km) / 800); }
  const api = { TIERS, tierIndex, speedMult };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tiers = api;
})(typeof window !== 'undefined' ? window : this);
