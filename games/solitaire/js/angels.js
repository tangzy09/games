// ════════════════════════════════════════
// angels.js — 天使图鉴（501 张，长线收集）。
//
// ⭐ 素材**复用 snake 的同一份**（games/snake/assets/angels/，webp + manifest.json）：
//   · 网页端：同一 EC2 同源，走相对路径 ../snake/assets/angels/ —— 零重复存储
//   · iOS 壳：build-www.cjs 按 package.json 的 wwwExtras 把它拷进 www/assets/angels/
//   两端 base 不同 ⇒ 运行时按 Platform.isNative 切。
//
// 解锁经济（纯增益，不碰任何玩法优势）：
//   赢一局 +1 · 每日挑战赢局再 +2 · 图鉴里看广告 +3（激励视频的又一消耗端）
//   存档只存**计数** G.angels（顺序 = manifest 固定 seed 洗牌，全球一致 ⇒ 可对比进度）
//
// ⚠ 内存：501 张解码后 ≈ 数百 MB —— 图鉴翻页时**只缓存当前页**，换页即清。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let files = [];            // 洗牌后的固定顺序（manifest 加载完成后填充）
  let loaded = false;

  const base = () => (typeof Platform !== 'undefined' && Platform.isNative)
    ? 'assets/angels/' : '../snake/assets/angels/';

  /** 固定 seed 的洗牌（mulberry32）—— 全球同一顺序，进度可对比、可分享 */
  function shuffle(list, seed) {
    let a = seed >>> 0;
    const rnd = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  async function load() {
    if (loaded) return;
    try {
      const r = await fetch(base() + 'manifest.json');
      if (r.ok) {
        const m = await r.json();
        files = shuffle(m.images || [], 20260731);
      }
    } catch (e) {}
    loaded = true;
  }

  const total = () => files.length;
  const fileAt = i => files[i] || null;

  // ── 当前页图片缓存（换页即清 —— 501 张全解码是几百 MB）──
  let cache = {};            // file → Image
  function img(file) {
    if (!file) return null;
    let im = cache[file];
    if (!im) {
      im = cache[file] = new Image();
      im.onload = () => {
        im.ok = true;
        if (root.renderAll && root.G && root.G.s) root.renderAll();
      };
      im.src = base() + file;
    }
    return im.ok ? im : null;
  }
  function dropCache() { cache = {}; }

  /**
   * 存为手机壁纸：1080×1920 竖版，粉彩渐变 + 柔光 + 圆角天使（照 snake 的同款体验）。
   * Web Share(File) 优先，降级下载。也是零成本的自传播面。
   */
  async function saveWallpaper(file) {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = base() + file;
    }).catch(() => null);
    const W = 1080, H = 1920;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f3e0ef'); g.addColorStop(1, '#fdf3f7');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const s = 900, sx = (W - s) / 2, sy = (H - s) / 2 - 60;
    const glow = x.createRadialGradient(W / 2, sy + s / 2, s * 0.2, W / 2, sy + s / 2, s * 0.8);
    glow.addColorStop(0, '#fff59d88'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = glow; x.fillRect(0, sy - 60, W, s + 200);
    if (im) {
      const r = 56;
      x.save();
      x.beginPath();
      x.moveTo(sx + r, sy); x.arcTo(sx + s, sy, sx + s, sy + s, r); x.arcTo(sx + s, sy + s, sx, sy + s, r);
      x.arcTo(sx, sy + s, sx, sy, r); x.arcTo(sx, sy, sx + s, sy, r); x.closePath(); x.clip();
      x.drawImage(im, sx, sy, s, s);
      x.restore();
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const f = new File([blob], 'fair-deal-angel.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f] }); return 'shared'; } catch (e) {}
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'fair-deal-angel.png';
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'downloaded';
  }

  root.Angels = { load, total, fileAt, img, dropCache, saveWallpaper };
})(typeof self !== 'undefined' ? self : this);
