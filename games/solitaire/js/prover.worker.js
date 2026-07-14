// ════════════════════════════════════════
// prover.worker.js — 「这局还有解吗？」的后台证明器（DESIGN §3）。
//
// ⚠ **必须在 Worker 里跑**：大预算求解要几百毫秒到几秒，跑在主线程 = 牌面卡死，
//   而这个功能的全部说服力就在于「它真的在算」——卡成幻灯片会让人以为是假的。
//
// 三值结果，**「算不出来」是一等公民**：
//   solvable  — 证明了：当前局面仍存在通关路径
//   dead      — 证明了：当前局面**无论怎么走都赢不了**（+ 二分定位「从第几步起就没救了」）
//   unknown   — **没算完**。我们不知道。⚠ 绝不能把 unknown 说成 dead ——
//               那是在拿「我们算力不够」诬陷玩家走错了棋。
//
// ⚠ 建池用的低预算（5000）**只能信 win、不能信 dead**（烧完预算就放弃 ≠ 真无解）。
//   这里必须给大预算，且给不出结论时**老实说 unknown**。
// ════════════════════════════════════════
'use strict';

// ⚠ 顺序 = 依赖顺序，且 **cards.js 不能漏**（rules-klondike.js 解构 Cards.suitOf）。
// 漏了它 Worker 一 new 就抛 TypeError → onerror 把结果兜成 'unknown' →
// 看起来像「算不出来」，其实是**证明器从没跑起来过**。E2E 抓出来的。
importScripts('cards.js', 'deal.js', 'rules-klondike.js', 'rules-freecell.js', 'core.js', 'solver.js');

const BUDGET = 300000;          // 主判定预算（~1-3s，Worker 里不卡 UI）
const PROBE = 60000;            // 二分探测预算（要跑 log2(n) 次，单次得便宜些）

/**
 * 从 seed + 前 n 步 重建局面，再问「还有解吗」。
 *
 * ⚠⚠ **返回的是 Solver 的枚举：'win' | 'dead' | 'unknown'** —— 不是 UI 那套 'solvable'。
 *   踩过的坑（E2E 真实点击才抓到）：这里原本返回 'solvable'，而 solve() 返回的是 'win'，
 *   出口处 `if (now === 'solvable')` 永远不成立 ⇒ **每一个已验证有解的开局都被报成「死局」**。
 *   一个字符串常量拼错，就把产品最核心的承诺变成了系统性谎言。
 *   ⇒ 两套枚举**只在出口处映射一次**（win → solvable），中间一律用 Solver 的原生枚举。
 */
function probe(seed, drawCount, moves, n, maxNodes, mode) {
  const s = Core.replay(seed, drawCount, moves.slice(0, n), mode);
  if (!s) return 'unknown';
  if (s.won) return 'win';
  // FreeCell 走 best-first、Klondike 走 DFS —— solve() 内部按 mode 分派
  return Solver.solve(s, { maxNodes, bfNodes: Math.min(maxNodes, 120000) }).result;
}

self.onmessage = (e) => {
  const { seed, drawCount, moves, mode } = e.data;
  const t0 = Date.now();

  // ① 当前局面还有解吗？（大预算）
  const now = probe(seed, drawCount, moves, moves.length, BUDGET, mode);

  if (now === 'win' || now === 'unknown') {
    // ⭐ 唯一的枚举映射点：Solver 的 'win' → UI 的 'solvable'
    return self.postMessage({ result: now === 'win' ? 'solvable' : 'unknown', ms: Date.now() - t0 });
  }

  // ② 已证明当前是死局 ⇒ 二分找「最后一个还有解的步数」。
  //    ⚠ 措辞死线（DESIGN §3.3）：只陈述事实「第 N 步之后不再有解」，
  //    **绝不说「是你走错了」**——盲打时走进死局往往是信息论上不可避免的。
  let lo = 0, hi = moves.length;          // lo 已知有解（开局必有解），hi 已知无解
  let bailed = false;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const r = probe(seed, drawCount, moves, mid, PROBE, mode);
    if (r === 'win') lo = mid;
    else if (r === 'dead') hi = mid;
    else { bailed = true; break; }        // 探测算不出来 ⇒ 不猜,直接停(见下)
  }

  self.postMessage({
    result: 'dead',
    // 二分中途遇到 unknown ⇒ 只报「当前是死局」,**不报具体步数**。
    // 报一个没证明的步数 = 冤枉玩家在那一步走错，比不报更糟。
    deadFrom: bailed ? null : hi,
    ms: Date.now() - t0,
  });
};
