// ════════════════════════════════════════
// sprite.js — 牌面**离屏 sprite 缓存**（DESIGN §3.1 ②）。
//
// ⚠ 52 张牌每帧重画 = 每帧几百次 fillText + 圆角路径。
//   「纯 canvas 画牌不用图片素材」听起来省事，**不缓存就掉帧**（尤其纸牌瀑布 + 低端安卓 WebView）。
//   ⇒ 每张牌按当前 cardW 预渲染一次，之后每帧只是 drawImage。
//   换皮肤 / 换尺寸时整体重建。
//
// ⭐ 四色牌（four-color deck）：♠黑 ♥红 ♣绿 ♦蓝 —— 无障碍的标配选项（DESIGN §7.5）。
//   对老花 / 色觉衰退用户，它的价值高于大字号：红黑在小牌面上最难分的就是 ♠/♣ 和 ♥/♦。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const cache = {};        // key: `${w}x${h}:${fourColor}:${id}` → canvas
  let backCache = null;

  const SUIT_SYM = ['♠', '♥', '♣', '♦'];
  const RANK_STR = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // 两色（经典）与四色（无障碍）
  const COLOR_2 = ['#1a1a2e', '#d92b2b', '#1a1a2e', '#d92b2b'];
  const COLOR_4 = ['#1a1a2e', '#d92b2b', '#127a3d', '#1d5fd0'];   // ♠黑 ♥红 ♣绿 ♦蓝

  function suitColor(suit, fourColor) {
    return (fourColor ? COLOR_4 : COLOR_2)[suit];
  }

  function make(id, w, h, fourColor, big) {
    // ⚠ Spider 是两副牌，id 可达 415（copy*52 + rank*4 + suit）⇒ 取牌面必须先 %52。
    //   忘了取模：rank 变成 13..25 ⇒ RANK_STR[rank] 是 undefined，牌面直接画不出字。
    id = id % 52;
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);

    const suit = id & 3, rank = id >> 2;
    const col = suitColor(suit, fourColor);
    const r = Math.max(3, w * 0.09);

    // 牌面
    g.fillStyle = '#fdfdfb';
    rr(g, 0.5, 0.5, w - 1, h - 1, r); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1;
    rr(g, 0.5, 0.5, w - 1, h - 1, r); g.stroke();

    // 左上角：点数 + 花色 —— ⚠ **必须横排，不能竖排**。
    //   牌是堆叠着画的，每张只露出顶上 ~0.28h。竖排（rank 在 0.17h、suit 在 0.34h）
    //   会让**花色正好被下一张牌盖住** ⇒ 玩家只看得到点数、看不到花色。
    //   FreeCell（8 列全明牌）和 Spider（10 列）牌又窄又密，这就直接没法玩了。
    const fs = Math.round(w * (big ? 0.44 : 0.38));
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${fs}px system-ui, sans-serif`;
    g.fillText(RANK_STR[rank], w * 0.26, h * 0.16);
    g.font = `${Math.round(fs * 0.92)}px system-ui, sans-serif`;
    g.fillText(SUIT_SYM[suit], w * 0.68, h * 0.16);

    // 中央大花色（牌够大时才画 —— 提高辨识度，老年用户友好）
    if (w >= 46) {
      g.globalAlpha = 0.9;
      g.font = `${Math.round(w * 0.62)}px system-ui, sans-serif`;
      g.fillText(SUIT_SYM[suit], w * 0.58, h * 0.66);
      g.globalAlpha = 1;
    }
    return c;
  }

  // 牌背样式（激励视频的**消耗端** —— 没有可换的东西，激励视频约等于零收入）
  // img:1 的款式 = 本机 Flux 生成的整幅插画（assets/backs/<id>.jpg，360×512 JPG）；
  // a/b 渐变是它的**加载兜底**（图没到位时先画程序化底色，onload 后重建缓存）。
  const BACK_STYLES = {
    classic:  { a: '#2b5fa8', b: '#17407a', ink: 'rgba(255,255,255,0.45)' },
    waves:    { a: '#0e7490', b: '#083344', ink: 'rgba(255,255,255,0.40)' },
    plaid:    { a: '#7f1d1d', b: '#450a0a', ink: 'rgba(255,220,180,0.40)' },
    stars:    { a: '#3730a3', b: '#1e1b4b', ink: 'rgba(255,240,150,0.55)' },
    gold:     { a: '#a16207', b: '#4a2c04', ink: 'rgba(255,240,190,0.60)' },
    // 易收集 10 款（无缝图案 JPG）
    cherry:   { a: '#f6efd8', b: '#e8dcc0', ink: 'rgba(180,40,40,0.35)', img: 1 },
    sunset:   { a: '#f9c39a', b: '#e78f5f', ink: 'rgba(255,255,255,0.40)', img: 1 },
    ocean:    { a: '#1c3f6e', b: '#0f2544', ink: 'rgba(255,255,255,0.40)', img: 1 },
    sakura:   { a: '#f7d9e2', b: '#eebccd', ink: 'rgba(200,90,120,0.35)', img: 1 },
    mint:     { a: '#dff0dd', b: '#bfe0c2', ink: 'rgba(60,140,90,0.35)', img: 1 },
    honey:    { a: '#f2c437', b: '#d99a1b', ink: 'rgba(120,70,10,0.40)', img: 1 },
    snow:     { a: '#1f4e79', b: '#12304d', ink: 'rgba(255,255,255,0.45)', img: 1 },
    maple:    { a: '#e8c9a0', b: '#c98a4b', ink: 'rgba(140,60,20,0.40)', img: 1 },
    lavender: { a: '#d9d0ee', b: '#b39fd8', ink: 'rgba(90,60,150,0.35)', img: 1 },
    candy:    { a: '#f9d7e2', b: '#d7ecdf', ink: 'rgba(200,90,120,0.35)', img: 1 },
    koi:      { a: '#0e5f63', b: '#083a3d', ink: 'rgba(255,255,255,0.40)', img: 1 },
    peacock:  { a: '#0c6b47', b: '#06382a', ink: 'rgba(255,240,150,0.45)', img: 1 },
    nebula:   { a: '#3b2d6e', b: '#171038', ink: 'rgba(255,240,150,0.45)', img: 1 },
    deco:     { a: '#3f3a1f', b: '#171405', ink: 'rgba(255,240,190,0.50)', img: 1 },
    // ⭐ 可爱系 12 款（2026-08-01 用户点名）——**全部程序化画**，不加一张图：
    //   牌背在盘面上只有 54×77，图片素材缩到这个尺寸细节全糊；而矢量图案任意尺寸都清楚，
    //   仓库也不用为 12 张 JPG 再胖一圈。判据同图标：**缩到牌面大小还认得出是什么**
    //   ⇒ 图案单元 8-14px、只用一种前景色、形状轮廓要简单。
    hearts:   { a: '#f6a5c0', b: '#d2678c', ink: 'rgba(255,255,255,0.70)', pat: 'heart' },
    cloud:    { a: '#8ec5f0', b: '#4f8dc9', ink: 'rgba(255,255,255,0.72)', pat: 'cloud' },
    paws:     { a: '#c9a7e8', b: '#8f66c4', ink: 'rgba(255,255,255,0.70)', pat: 'paw' },
    bubbles:  { a: '#7fd9c8', b: '#3f9c8d', ink: 'rgba(255,255,255,0.66)', pat: 'bubble' },
    daisy:    { a: '#f5cf6a', b: '#d9a326', ink: 'rgba(255,255,255,0.78)', pat: 'daisy' },
    gingham:  { a: '#f19aa8', b: '#c96b7c', ink: 'rgba(255,255,255,0.55)', pat: 'gingham' },
    bows:     { a: '#f3b7d4', b: '#c9709f', ink: 'rgba(255,255,255,0.75)', pat: 'bow' },
    rainbow:  { a: '#a7d8f0', b: '#6aa8d8', ink: 'rgba(255,255,255,0.72)', pat: 'rainbow' },
    berry:    { a: '#ef8fa0', b: '#c4485f', ink: 'rgba(255,255,255,0.72)', pat: 'berry' },
    moon:     { a: '#5b6bb5', b: '#28305e', ink: 'rgba(255,240,170,0.80)', pat: 'moon' },
    sprinkle: { a: '#f7d9b0', b: '#dba86a', ink: 'rgba(255,255,255,0.80)', pat: 'sprinkle' },
    sweets:   { a: '#b7a4e8', b: '#7b64c0', ink: 'rgba(255,255,255,0.70)', pat: 'sweets' },
  };

  /**
   * ⭐ 可爱系图案（牌背与桌布共用）：在 (x,y) 处画一个大小 s 的图案单元。
   * ⚠ 画之前调用方已把 fillStyle/strokeStyle 设成该皮肤的 ink 色 —— 这里只管形状。
   */
  function motif(g, kind, x, y, s) {
    const k = s / 10;
    if (kind === 'heart') {
      g.beginPath();
      g.moveTo(x, y + 3 * k);
      g.bezierCurveTo(x, y - 1.2 * k, x - 4.6 * k, y - 1.2 * k, x - 4.6 * k, y + 2.4 * k);
      g.bezierCurveTo(x - 4.6 * k, y + 5.6 * k, x, y + 7.4 * k, x, y + 9.4 * k);
      g.bezierCurveTo(x, y + 7.4 * k, x + 4.6 * k, y + 5.6 * k, x + 4.6 * k, y + 2.4 * k);
      g.bezierCurveTo(x + 4.6 * k, y - 1.2 * k, x, y - 1.2 * k, x, y + 3 * k);
      g.fill();
    } else if (kind === 'cloud') {
      g.beginPath();
      g.arc(x - 3 * k, y + 4 * k, 2.6 * k, 0, 7);
      g.arc(x, y + 2.6 * k, 3.4 * k, 0, 7);
      g.arc(x + 3.2 * k, y + 4 * k, 2.4 * k, 0, 7);
      g.rect(x - 3 * k, y + 4 * k, 6.4 * k, 2.6 * k);
      g.fill();
    } else if (kind === 'paw') {
      g.beginPath(); g.arc(x, y + 5 * k, 3 * k, 0, 7); g.fill();          // 掌
      [[-3.2, 1.4], [-1.1, 0.2], [1.1, 0.2], [3.2, 1.4]].forEach(p => {   // 四趾
        g.beginPath(); g.arc(x + p[0] * k, y + p[1] * k, 1.25 * k, 0, 7); g.fill();
      });
    } else if (kind === 'bubble') {
      g.beginPath(); g.arc(x, y + 4 * k, 3.4 * k, 0, 7); g.stroke();
      g.beginPath(); g.arc(x - 1.2 * k, y + 2.6 * k, 0.9 * k, 0, 7); g.fill();   // 高光
    } else if (kind === 'daisy') {
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5 - Math.PI / 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * 2.6 * k, y + 4 * k + Math.sin(a) * 2.6 * k, 1.7 * k, 1.15 * k, a, 0, 7);
        g.fill();
      }
      g.beginPath(); g.arc(x, y + 4 * k, 1.25 * k, 0, 7); g.fill();
    } else if (kind === 'gingham') {
      g.globalAlpha = 0.55; g.fillRect(x - 4.5 * k, y, 9 * k, 9 * k); g.globalAlpha = 1;
    } else if (kind === 'bow') {
      g.beginPath();
      g.moveTo(x, y + 4 * k); g.lineTo(x - 4.4 * k, y + 1.2 * k); g.lineTo(x - 4.4 * k, y + 6.8 * k); g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(x, y + 4 * k); g.lineTo(x + 4.4 * k, y + 1.2 * k); g.lineTo(x + 4.4 * k, y + 6.8 * k); g.closePath(); g.fill();
      g.beginPath(); g.arc(x, y + 4 * k, 1.5 * k, 0, 7); g.fill();
    } else if (kind === 'rainbow') {
      g.lineWidth = 1.5 * k;
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = 0.85 - i * 0.22;
        g.beginPath(); g.arc(x, y + 7 * k, (2 + i * 1.6) * k, Math.PI, 0); g.stroke();
      }
      g.globalAlpha = 1;
    } else if (kind === 'berry') {
      g.beginPath();
      g.moveTo(x, y + 9 * k);
      g.bezierCurveTo(x - 4 * k, y + 6 * k, x - 3.6 * k, y + 1.6 * k, x, y + 2 * k);
      g.bezierCurveTo(x + 3.6 * k, y + 1.6 * k, x + 4 * k, y + 6 * k, x, y + 9 * k);
      g.fill();
      g.beginPath();                                                     // 叶
      g.moveTo(x - 2.4 * k, y + 1.6 * k); g.lineTo(x, y - 0.4 * k); g.lineTo(x + 2.4 * k, y + 1.6 * k);
      g.closePath(); g.fill();
    } else if (kind === 'moon') {
      g.beginPath();
      g.arc(x, y + 4.5 * k, 3.6 * k, Math.PI * 0.35, Math.PI * 1.65);
      g.arc(x + 1.9 * k, y + 4.5 * k, 3.3 * k, Math.PI * 1.5, Math.PI * 0.5, true);
      g.fill();
      g.beginPath(); g.arc(x + 4.6 * k, y + 1.2 * k, 0.9 * k, 0, 7); g.fill();   // 小星
    } else if (kind === 'sprinkle') {
      g.lineWidth = 1.5 * k; g.lineCap = 'round';
      [[0, 0, 0.6], [3.4, 3.6, -0.8], [-3.4, 5.2, 0.3]].forEach(p => {
        g.beginPath();
        g.moveTo(x + p[0] * k - Math.cos(p[2]) * 1.7 * k, y + 3 * k + p[1] * k - Math.sin(p[2]) * 1.7 * k);
        g.lineTo(x + p[0] * k + Math.cos(p[2]) * 1.7 * k, y + 3 * k + p[1] * k + Math.sin(p[2]) * 1.7 * k);
        g.stroke();
      });
      g.lineCap = 'butt';
    } else if (kind === 'sweets') {                                       // 糖果：斜条 + 圆点
      g.lineWidth = 1.4 * k;
      g.beginPath(); g.moveTo(x - 4 * k, y + 7.5 * k); g.lineTo(x + 4 * k, y + 0.5 * k); g.stroke();
      g.beginPath(); g.arc(x + 3.4 * k, y + 6.6 * k, 1.2 * k, 0, 7); g.fill();
    }
  }

  /** 把图案铺满一块区域（错行摆放，别摆成死板的方格） */
  function tileMotif(g, kind, w, h, step) {
    const s = step * 0.86;
    for (let row = 0, y = -step * 0.4; y < h + step; y += step, row++) {
      for (let x = (row % 2 ? step * 0.5 : 0) - step * 0.3; x < w + step; x += step) {
        motif(g, kind, x + s / 2, y, s);
      }
    }
  }

  // 图片牌背的加载缓存（onload 后失效当前 backCache 并触发重画,商店预览同理）
  const backImgs = {};
  function backImg(style) {
    const st = BACK_STYLES[style];
    if (!st || !st.img) return null;
    let im = backImgs[style];
    if (!im) {
      im = backImgs[style] = new Image();
      im.onload = () => {
        im.ok = true;
        if (style === curBack) backCache = null;
        // ⚠ 预热在 boot 早期就开始，onload 可能先于 G.s 就绪 —— 没就绪就别重画（boot 末尾自会画）
        if (root.renderAll && root.G && root.G.s) root.renderAll();
      };
      im.src = 'assets/backs/' + style + '.jpg';
    }
    return im.ok ? im : null;
  }
  /** 这个款式可以定稿绘制了吗（无图款式恒 true；商店预览靠它决定要不要缓存）*/
  const backReady = style => !(BACK_STYLES[style] && BACK_STYLES[style].img)
    || !!(backImgs[style] && backImgs[style].ok);
  /** 预热全部图片素材（牌背 + 桌布，boot 时调；总共 <1MB）*/
  function preloadBacks() {
    for (const k of Object.keys(BACK_STYLES)) if (BACK_STYLES[k].img) backImg(k);
    for (const k of Object.keys(TABLE_STYLES)) if (TABLE_STYLES[k].img) tableImg(k);
  }

  function makeBack(w, h, style) {
    const st = BACK_STYLES[style] || BACK_STYLES.classic;
    const im = backImg(style);
    if (im) {
      const c0 = document.createElement('canvas');
      const dpr0 = window.devicePixelRatio || 1;
      c0.width = Math.ceil(w * dpr0); c0.height = Math.ceil(h * dpr0);
      const g0 = c0.getContext('2d');
      g0.scale(dpr0, dpr0);
      const r0 = Math.max(3, w * 0.09);
      g0.save();
      rr(g0, 0.5, 0.5, w - 1, h - 1, r0); g0.clip();
      const sc = Math.max(w / im.width, h / im.height);      // cover 裁切
      g0.drawImage(im, (w - im.width * sc) / 2, (h - im.height * sc) / 2, im.width * sc, im.height * sc);
      g0.restore();
      g0.strokeStyle = 'rgba(0,0,0,0.30)'; g0.lineWidth = 1;
      rr(g0, 0.5, 0.5, w - 1, h - 1, r0); g0.stroke();
      return c0;
    }
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const r = Math.max(3, w * 0.09);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, st.a); grad.addColorStop(1, st.b);
    g.fillStyle = grad;
    rr(g, 0.5, 0.5, w - 1, h - 1, r); g.fill();
    g.strokeStyle = st.ink; g.lineWidth = 2;
    rr(g, 3.5, 3.5, w - 7, h - 7, r * 0.7); g.stroke();

    // 花纹（各样式一眼可分 —— 分不出来的皮肤没人愿意为它看广告）
    g.save();
    rr(g, 3.5, 3.5, w - 7, h - 7, r * 0.7); g.clip();
    g.strokeStyle = st.ink; g.fillStyle = st.ink;
    if (style === 'waves') {
      g.lineWidth = 1.4;
      for (let y = 6; y < h; y += 7) {
        g.beginPath();
        for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin(x / 5) * 2.2);
        g.stroke();
      }
    } else if (style === 'plaid') {
      g.lineWidth = 1.2;
      for (let x = 5; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 5; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    } else if (style === 'stars') {
      for (let y = 8; y < h; y += 12) {
        for (let x = 8; x < w; x += 12) {
          const o = ((x + y) / 12) % 2 ? 0 : 6;
          g.beginPath(); g.arc(x + o, y, 1.6, 0, 7); g.fill();
        }
      }
    } else if (style === 'gold') {
      g.lineWidth = 1.2;
      for (let i = -h; i < w; i += 7) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      }
    } else if (st.pat) {
      // ⭐ 可爱系：图案单元铺满（错行）。牌背只有 54×77 ⇒ step 取 ~13px，一张牌上摆 3×5 个
      tileMotif(g, st.pat, w, h, Math.max(11, w * 0.24));
    } else {
      g.lineWidth = 1.2;
      for (let i = -h; i < w; i += 6) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      }
    }
    g.restore();
    return c;
  }

  // 桌布（同上：收藏品）。img:1 = 本机 Flux 材质图（assets/tables/<id>.jpg，540×960），
  // a/b 渐变仍是加载兜底 + 商店小图占位。
  const TABLE_STYLES = {
    felt:     { a: '#0f6b3f', b: '#0a4f2e' },
    midnight: { a: '#1e293b', b: '#0f172a' },
    wood:     { a: '#6b4423', b: '#3d2412' },
    rose:     { a: '#7d2b4a', b: '#4a1229' },
    walnut:   { a: '#4a2f1a', b: '#241407', img: 1 },
    bamboo:   { a: '#6b4f1d', b: '#3a2a0e', img: 1 },
    velvet:   { a: '#16255e', b: '#080d26', img: 1 },
    marble:   { a: '#0c3330', b: '#04100f', img: 1 },
    // ⭐ 可爱系 8 款（程序化图案，零素材）。
    //   ⛔ **桌布必须偏暗**：白牌面 + 白字要浮得出来 —— 可爱不等于浅色，这里走的是
    //     「莓果 / 丁香 / 深青」这类**暗调粉彩**，图案只用很低的透明度点缀。
    blush:    { a: '#6d3a4a', b: '#3a1c26', pat: 'heart' },
    lilac:    { a: '#4a3a7a', b: '#241b40', pat: 'daisy' },
    teal:     { a: '#125e63', b: '#06333a', pat: 'bubble' },
    moss:     { a: '#2f5a35', b: '#142c18', pat: 'cloud' },
    plum:     { a: '#5a2a5e', b: '#2c1230', pat: 'paw' },
    night:    { a: '#26315e', b: '#0e1330', pat: 'moon' },
    sea:      { a: '#14506e', b: '#062535', pat: 'bubble' },
    cocoa:    { a: '#5a3a2a', b: '#2b1a11', pat: 'sprinkle' },
  };

  // 桌布图案：铺一张小 tile 再 createPattern（桌布**每帧全屏重画**，逐个图案画会拖慢帧率）
  const tabPat = {};
  function tablePattern(g, style, st) {
    if (tabPat[style]) return tabPat[style];
    const S = 64;
    const t = document.createElement('canvas');
    t.width = t.height = S;
    const tg = t.getContext('2d');
    tg.fillStyle = tg.strokeStyle = 'rgba(255,255,255,0.075)';   // 只是点缀，别抢牌面
    tg.lineWidth = 1.6;
    motif(tg, st.pat, S * 0.28, S * 0.10, 22);
    motif(tg, st.pat, S * 0.78, S * 0.58, 22);
    tabPat[style] = g.createPattern(t, 'repeat');
    return tabPat[style];
  }

  const tableImgs = {};
  function tableImg(style) {
    const st = TABLE_STYLES[style];
    if (!st || !st.img) return null;
    let im = tableImgs[style];
    if (!im) {
      im = tableImgs[style] = new Image();
      im.onload = () => {
        im.ok = true;
        if (root.renderAll && root.G && root.G.s) root.renderAll();   // 同牌背:守卫 G.s 就绪
      };
      im.src = 'assets/tables/' + style + '.jpg';
    }
    return im.ok ? im : null;
  }
  const tableReady = style => !(TABLE_STYLES[style] && TABLE_STYLES[style].img)
    || !!(tableImgs[style] && tableImgs[style].ok);

  /** 画桌布到任意矩形（全屏背景和商店小图共用）：图片款 cover 裁切，没到位/无图 ⇒ 渐变 */
  function drawTable(g, x, y, w, h, style) {
    const im = tableImg(style);
    if (im) {
      const sc = Math.max(w / im.width, h / im.height);
      g.save();
      g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.drawImage(im, x + (w - im.width * sc) / 2, y + (h - im.height * sc) / 2,
                  im.width * sc, im.height * sc);
      g.restore();
      return;
    }
    const st = TABLE_STYLES[style] || TABLE_STYLES.felt;
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, st.a); grad.addColorStop(1, st.b);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
    if (st.pat) {                                  // 可爱系：再叠一层极淡的图案
      g.save();
      g.translate(x, y);
      g.fillStyle = tablePattern(g, style, st);
      g.fillRect(0, 0, w, h);
      g.restore();
    }
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  let curW = 0, curH = 0, curFour = false, curBig = false;

  /** 尺寸/皮肤变了就整体重建（这是 sprite 缓存唯一需要失效的时机）*/
  function ensure(w, h, fourColor, big) {
    if (w === curW && h === curH && fourColor === curFour && big === curBig) return;
    curW = w; curH = h; curFour = fourColor; curBig = big;
    for (const k of Object.keys(cache)) delete cache[k];
    backCache = null;
  }

  function face(id) {
    const k = `${curW}x${curH}:${curFour}:${curBig}:${id % 52}`;   // 同一牌面共用缓存
    if (!cache[k]) cache[k] = make(id, curW, curH, curFour, curBig);
    return cache[k];
  }
  let curBack = 'classic';
  function back() {
    if (!backCache) backCache = makeBack(curW, curH, curBack);
    return backCache;
  }
  /** 换牌背（收藏品）*/
  function setBack(style) {
    if (style === curBack) return;
    curBack = style; backCache = null;
  }
  const tableStyle = id => TABLE_STYLES[id] || TABLE_STYLES.felt;

  root.Sprite = { ensure, face, back, setBack, backReady, preloadBacks,
                  tableStyle, tableReady, drawTable, BACK_STYLES, TABLE_STYLES,
                  suitColor, SUIT_SYM, RANK_STR, rr };
})(typeof self !== 'undefined' ? self : this);
