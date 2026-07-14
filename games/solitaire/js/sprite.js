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

    // 左上角：点数 + 花色（⚠ 小牌时只画左上角，这是 Spider/窄屏的出路）
    const fs = Math.round(w * (big ? 0.46 : 0.40));
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${fs}px system-ui, sans-serif`;
    g.fillText(RANK_STR[rank], w * 0.27, h * 0.17);
    g.font = `${Math.round(fs * 0.9)}px system-ui, sans-serif`;
    g.fillText(SUIT_SYM[suit], w * 0.27, h * 0.34);

    // 中央大花色（牌够大时才画 —— 提高辨识度，老年用户友好）
    if (w >= 46) {
      g.globalAlpha = 0.9;
      g.font = `${Math.round(w * 0.62)}px system-ui, sans-serif`;
      g.fillText(SUIT_SYM[suit], w * 0.58, h * 0.66);
      g.globalAlpha = 1;
    }
    return c;
  }

  function makeBack(w, h) {
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const r = Math.max(3, w * 0.09);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#2b5fa8'); grad.addColorStop(1, '#17407a');
    g.fillStyle = grad;
    rr(g, 0.5, 0.5, w - 1, h - 1, r); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
    rr(g, 3.5, 3.5, w - 7, h - 7, r * 0.7); g.stroke();
    return c;
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
    const k = `${curW}x${curH}:${curFour}:${curBig}:${id}`;
    if (!cache[k]) cache[k] = make(id, curW, curH, curFour, curBig);
    return cache[k];
  }
  function back() {
    if (!backCache) backCache = makeBack(curW, curH);
    return backCache;
  }

  root.Sprite = { ensure, face, back, suitColor, SUIT_SYM, RANK_STR, rr };
})(typeof self !== 'undefined' ? self : this);
