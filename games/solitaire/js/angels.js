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

  root.Angels = { load, total, fileAt, img, dropCache };
})(typeof self !== 'undefined' ? self : this);
