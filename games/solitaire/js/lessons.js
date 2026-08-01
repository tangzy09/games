// ════════════════════════════════════════
// lessons.js — 互动教学：**用求解器自动出题**，不手工设计关卡。
//
// ⭐ 为什么这个产品能做别人做不了的教学：我们有**在设备上跑的求解器**。
//   出题流程全自动：可解池取 seed → solver 解出完整 move list → 重放到「差 N 步」的位置
//   → 让玩家自己走完那 N 步。**答案是证明出来的，不是策划猜的**。
//   ⇒ 课程零手工内容、零维护；换了发牌规则也不会失效（重新解一遍就是了）。
//
// ⚠ 每一课都必须**当场可完成**（差 N 步且那 N 步已被证明能赢）——
//   教学局里让玩家走进死胡同，比不做教学更糟。
//
// 课程设计（由易到难，每课一个概念）：
//   1 收牌  = 差 2 步就赢：先认识「把牌收进右上角就是赢」
//   2 翻暗牌 = 差 4 步：认识「搬走明牌能翻开下面的暗牌」
//   3 用牌堆 = 差 6 步：认识「翻牌堆找需要的牌」
//   4 空列   = 差 8 步：认识「空列只能放 K」
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Core = isNode ? require('./core.js') : root.Core;
  const Solver = isNode ? require('./solver.js') : root.Solver;

  // 课程表：backFrom = 从解法末尾往回退几步（= 玩家要自己走的步数）
  const LESSONS = [
    { id: 1, backFrom: 2, draw: 1 },
    { id: 2, backFrom: 4, draw: 1 },
    { id: 3, backFrom: 6, draw: 1 },
    { id: 4, backFrom: 8, draw: 3 },
  ];

  /**
   * 生成第 n 课的起始局面（纯函数：同 seed ⇒ 同一课）。
   * 返回 { state, need }，need = 还差几步赢；失败返回 null（调用方回退到普通局）。
   */
  function build(lessonId, seed) {
    const L = LESSONS.find(x => x.id === lessonId) || LESSONS[0];
    const s0 = Core.newGame(seed >>> 0, L.draw, 'klondike');
    const sol = Solver.solve(Solver.clone(s0), { maxNodes: 200000, timeoutMs: 4000 });
    if (sol.result !== 'win' || !sol.moves || sol.moves.length <= L.backFrom) return null;
    // 重放到「差 backFrom 步」的位置 —— 剩下的那几步已被证明能赢
    const cut = sol.moves.slice(0, sol.moves.length - L.backFrom);
    const st = Core.replay(s0.seed, s0.drawCount, cut, 'klondike');
    if (!st || st.won) return null;
    return { state: st, need: L.backFrom, lesson: L.id };
  }

  /** 从候选 seed 里找一个能出题的（池里的 seed 都已验证可解，通常第一个就成）*/
  function buildFrom(lessonId, seeds) {
    for (const sd of seeds) {
      const r = build(lessonId, sd);
      if (r) return r;
    }
    return null;
  }

  const API = { LESSONS, build, buildFrom };
  if (isNode) module.exports = API;
  else root.Lessons = API;
})(typeof self !== 'undefined' ? self : this);
