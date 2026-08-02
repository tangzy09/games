// ════════════════════════════════════════
// angels.js — 天使画像收集品（501 张）的**共享**素材层。engine 级，game-agnostic。
//
// ⭐ 全仓**只有一份素材**：`games/snake/assets/angels/`（webp + manifest.json，25MB）。
//   · 网页端：同一站点同源 ⇒ 相对路径 `../snake/assets/angels/`（零重复存储）
//   · iOS/Android 壳：各游戏 package.json 的 `wwwExtras` 把它拷进 `www/assets/angels/`
//     （见 tools/build-www.cjs）⇒ 包内 base 是 `assets/angels/`
//   两端 base 不同 ⇒ **运行时**按 Platform.isNative 切，不写死。
//
// ⛔ 绝不再往任何 `games/*/assets/angels/` 拷第二份（blockblast 曾拷了 26MB，2026-08-01 去重）。
//
// 顺序是**固定 seed 洗牌**的 manifest 列表 ⇒ 全球一致、可对比进度；
// 游戏侧存档只存一个数（已解锁张数），零膨胀。
//
// ⚠ 内存：501 张全解码 ≈ 数百 MB，低端 WebView 会被系统杀掉 ⇒ 内置 LRU（默认 64 张）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const SHUFFLE_SEED = 20260731;        // ⛔ 别改：改了 = 所有玩家已收集的画像**换脸**
  let files = [];
  let loading = null;

  const base = () => (typeof Platform !== 'undefined' && Platform.isNative)
    ? 'assets/angels/' : '../snake/assets/angels/';

  /** 固定 seed 的洗牌（mulberry32）——全球同一顺序 */
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

  /** 载入 manifest（幂等；失败静默 ⇒ 游戏侧走「无图回退」，不白屏）*/
  function load() {
    if (loading) return loading;
    loading = fetch(base() + 'manifest.json')
      .then(r => (r.ok ? r.json() : null))
      .then(m => { files = shuffle((m && m.images) || [], SHUFFLE_SEED); })
      .catch(() => { files = []; });
    return loading;
  }

  const total = () => files.length;
  const fileAt = i => files[i] || null;

  // ── LRU 图片缓存 ──
  let CAP = 64;
  const cache = new Map();
  const setCap = n => { CAP = Math.max(4, n | 0); };

  /**
   * 取第 i 张的 Image；**没解码好就返回 null**（调用方画回退底色）。
   * 解码完成后自动 renderAll 补一帧 —— canvas 游戏不会自己回来重画。
   */
  function img(i) {
    const f = fileAt(i);
    if (!f) return null;
    let im = cache.get(f);
    if (!im) {
      im = new Image();
      im.src = base() + f;
      im.onload = () => { if (typeof root.renderAll === 'function') root.renderAll(); };
      cache.set(f, im);
      if (cache.size > CAP) cache.delete(cache.keys().next().value);   // 淘汰最老的
    } else {
      cache.delete(f); cache.set(f, im);                               // 命中 ⇒ 移到队尾
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function dropCache() { cache.clear(); }

  const API = { load, total, fileAt, img, dropCache, setCap, base };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Angels = API;
})(typeof self !== 'undefined' ? self : this);
