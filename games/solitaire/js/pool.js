// ════════════════════════════════════════
// pool.js — 已验证可解的牌局池（DESIGN §2.3/§2.5）。
//
// ⚠ **可解性筛选只对 Klondike 有意义**：FreeCell 本来就 99.999% 可解、Spider ≈99% —— 筛了没区别。
//
// ⚠ **draw-1 和 draw-3 是两个不同的可解性问题**（同一个 seed 在 draw-3 无解、draw-1 可解是常态）
//   ⇒ 池按 draw 模式分开；**draw 模式是开局前属性，局中不可改**（否则「已验证」角标失效）。
//
// 难度 = **盲打 AI 能不能赢**（不是最短解长度）：
//   easy = 看不见暗牌的人也能赢的局；hard = 有解、但盲打赢不了（需要试探/撤销）。
//   这是**玩家的真实体验**，不是拍脑袋的数值。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const pools = {};          // draw → { easy:[], hard:[], meta }
  let loaded = false;

  async function load() {
    if (loaded) return;
    for (const d of [1, 3]) {
      try {
        const r = await fetch(`data/pool-draw${d}.json`);
        if (r.ok) pools[d] = await r.json();
      } catch (e) {}
    }
    loaded = true;
  }

  const has = draw => !!pools[draw];

  /** 取一个已验证可解的 seed。difficulty: 'easy' | 'hard' | 'any' */
  function pick(draw, difficulty, rand) {
    const p = pools[draw];
    if (!p) return null;
    const list = difficulty === 'easy' ? p.easy
               : difficulty === 'hard' ? p.hard
               : p.easy.concat(p.hard);
    if (!list.length) return null;
    const r = rand != null ? rand : Math.random();
    return list[Math.floor(r * list.length)];
  }

  /** 这个 seed 在池里吗（⇒ 能不能打「✓ 本局存在解法」的角标）*/
  function isVerified(draw, seed) {
    const p = pools[draw];
    if (!p) return false;
    return p.easy.includes(seed) || p.hard.includes(seed);
  }
  function difficultyOf(draw, seed) {
    const p = pools[draw];
    if (!p) return null;
    if (p.easy.includes(seed)) return 'easy';
    if (p.hard.includes(seed)) return 'hard';
    return null;
  }

  /** 每日挑战：同一天全球同一局（从**已验证池**里按日期取）*/
  function daily(draw, date) {
    const p = pools[draw];
    if (!p) return null;
    const d = date || new Date();
    const dayId = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    // 用日期做确定性索引（全球同一天 ⇒ 同一个 seed）
    let h = dayId >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    const all = p.easy.concat(p.hard);
    return all[h % all.length];
  }

  const stats = draw => {
    const p = pools[draw];
    if (!p) return null;
    const total = p.easy.length + p.hard.length;
    return { total, easy: p.easy.length, hard: p.hard.length, meta: p.meta };
  };

  root.Pool = { load, has, pick, isVerified, difficultyOf, daily, stats };
})(typeof self !== 'undefined' ? self : this);
