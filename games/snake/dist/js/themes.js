// games/snake/js/themes.js — 4 主题:调色板/遮罩纹理/解锁条件(双导出)
// 纹理函数签名 (m, px, pc):m=遮罩 ctx(先由 resetMask 铺好底色),px=层宽,pc=格宽。
// 纹理必须确定性(禁 Math.random——用格坐标散列),保证换肤/重建一致。
const THEMES = {
  cloud: {   // 云朵粉彩(默认)
    unlock: null,
    pal: { bg:'#fdf3f7', cloud:'#f3e0ef', cloudEdge:'#e6c8e0', snake:'#f7b8d4',
      accent:'#e79cc2', accent2:'#b39ddb', text:'#7a5c72', bar:'#f6d5e5', card:'#ffffff',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#5d4a57', btnOn:'#b39ddb' },
    texture(m, px, pc) {
      m.strokeStyle = this.pal.cloudEdge; m.lineWidth = 1;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        m.beginPath(); m.arc(x*pc+pc/2, y*pc+pc/2, pc*0.34, 0, Math.PI*2); m.stroke();
      }
    },
  },
  star: {    // 星夜梦境:揭开=夜幕破洞透光
    unlock: { stat: 'levelsCleared', n: 5 },
    pal: { bg:'#191a2e', cloud:'#23244a', cloudEdge:'#3b3d6e', snake:'#8c9eff',
      accent:'#7986cb', accent2:'#b39ddb', text:'#c5cae9', bar:'#2c2d55', card:'#262750',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#e8eaf6', btnOn:'#5c6bc0' },
    texture(m, px, pc) {   // 确定性小星星:格坐标散列挑 ~18% 的格画 2px 星点
      m.fillStyle = '#e8ecff';
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const h = (x * 73856093 ^ y * 19349663) >>> 0;
        if (h % 100 < 18) {
          const ox = (h % 7) / 7 * pc * 0.6 + pc * 0.2, oy = ((h >> 3) % 7) / 7 * pc * 0.6 + pc * 0.2;
          const r = (h % 3) + 1;
          m.globalAlpha = 0.5 + (h % 5) * 0.1;
          m.fillRect(x*pc+ox, y*pc+oy, r, r);
        }
      }
      m.globalAlpha = 1;
    },
  },
  candy: {   // 马卡龙糖果:薄荷/奶油格子糖纸
    unlock: { stat: 'levelsCleared', n: 15 },
    pal: { bg:'#f2fbf4', cloud:'#d9f2e3', cloudEdge:'#bfe6d0', snake:'#a8d8b9',
      accent:'#7cc7a1', accent2:'#f7b8d4', text:'#4e7a62', bar:'#d9f2e3', card:'#ffffff',
      apple:'#ff8fab', leaf:'#66bb6a', glow:'#ffe082', eye:'#33544a', btnOn:'#f7b8d4' },
    texture(m, px, pc) {   // 双色棋盘格
      m.fillStyle = '#fff4d9'; m.globalAlpha = 0.55;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
        if ((x + y) % 2 === 0) m.fillRect(x*pc, y*pc, pc, pc);
      m.globalAlpha = 1;
    },
  },
  heaven: {  // 天国花园:白金羽毛+光晕
    unlock: { stat: 'setsDone', n: 1 },
    pal: { bg:'#fffdf5', cloud:'#f6efdb', cloudEdge:'#e6d9b8', snake:'#f0e2b6',
      accent:'#d4af37', accent2:'#e79cc2', text:'#8a7a4a', bar:'#f0e8d0', card:'#ffffff',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#ffe082', eye:'#6d5f35', btnOn:'#c9a227' },
    texture(m, px, pc) {   // 对角羽毛短弧 + 中心光晕
      m.strokeStyle = '#e2cf9b'; m.lineWidth = 1.2;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const h = (x * 2654435761 ^ y * 40503) >>> 0;
        if (h % 100 < 30) {
          const cx = x*pc+pc/2, cy = y*pc+pc/2;
          m.beginPath(); m.arc(cx, cy, pc*0.3, Math.PI*0.2 + (h%4)*0.4, Math.PI*0.9 + (h%4)*0.4); m.stroke();
        }
      }
      const g = m.createRadialGradient(px/2, px/2, px*0.1, px/2, px/2, px*0.7);
      g.addColorStop(0, 'rgba(255,246,200,0.35)'); g.addColorStop(1, 'rgba(255,246,200,0)');
      m.fillStyle = g; m.fillRect(0, 0, px, px);
    },
  },
};
const THEME_ORDER = ['cloud', 'star', 'candy', 'heaven'];
function themeUnlocked(key, save) {
  const u = THEMES[key].unlock;
  if (!u) return true;
  const v = u.stat.split('.').reduce((o, k) => (o || {})[k], save.stats) || 0;
  return v >= u.n;
}
const Themes = { THEMES, THEME_ORDER, themeUnlocked };
if (typeof module !== 'undefined' && module.exports) module.exports = Themes;
