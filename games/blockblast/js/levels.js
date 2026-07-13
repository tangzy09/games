// ════════════════════════════════════════
// levels.js — 关卡数据表（DESIGN §6）。
//
// 坐标一律 [row, col]，0-based，8×8。
//   crystals: [r, c, kind]  水晶（长在方块上；**只有该格被消行/消列清除时**才收集）
//   stones:   [r, c]        不可消除的惰性格；**含石块的行/列永远消不掉**
//   blocks:   [r, c]        普通预置方块（可消）
//   par:      三星基准落子数 —— 由 tools/verify-levels.js 跑参考 AI 标定，**不要手填**
//
// ⚠ validate() 是**第一道防线**（红队 F4）：石块所在行/列上不许放水晶 ——
//   否则那颗水晶永远收集不到，而玩家又死不了 ⇒ 软锁死（既不 win 也不 lose）。
//   构建期拦住它；core.isUnwinnable() 是运行时兜底。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const B = 'blue', P = 'pink', O = 'orange';

  // 数据由 tools/gen-levels.js 生成（参数化：水晶挂在几条线上 × 每条线留几个空格 × 石块数），
  // 再由 tools/verify-levels.js 验证通关率并标定 par。**不要手改这段，改配方然后重新生成。**
  // 数据由 tools/gen-levels.js 生成（配方：水晶挂在几条线上 × 每条线留几个空格 × 石块数），
  // 再由 tools/verify-levels.js 验证通关率并标定 par。**别手改这段 —— 改配方再重新生成。**
  const LEVELS = [
    { id: 1, par: 3, // FTUE: 一步消掉第一行
      blocks: [[7,2],[7,3],[7,4],[7,5],[7,6]],
      crystals: [[7,0,B],[7,1,B]] },
    { id: 2, par: 3, // FTUE: 连消两行 = 第一次 streak
      blocks: [[7,2],[7,3],[7,4],[7,5],[7,6],[6,1],[6,2],[6,3],[6,4],[6,5],[6,6]],
      crystals: [[7,0,B],[7,1,B],[6,0,P]] },
    { id: 3, par: 4,
      blocks: [[7,2],[7,3],[7,4],[7,5],[6,1],[6,2],[6,3],[6,4],[6,5]],
      crystals: [[7,0,B],[7,1,B],[6,0,P]] },
    { id: 4, par: 7, // 教「消列也收集」
      blocks: [[2,0],[3,0],[4,0],[5,0],[1,7],[2,7],[3,7],[4,7],[5,7]],
      crystals: [[0,0,B],[1,0,B],[0,7,P]] },
    { id: 5, par: 7, // 行列交汇
      blocks: [[7,1],[7,2],[7,3],[7,4],[7,5],[1,7],[2,7],[3,7],[4,7],[5,7]],
      crystals: [[7,0,B],[0,7,P]] },
    { id: 6, par: 9,
      blocks: [[5,1],[5,2],[5,3],[5,4],[7,1],[7,2],[7,3],[7,4],[7,5],[1,0],[2,0],[3,0]],
      crystals: [[5,0,B],[7,0,P],[0,0,O]] },
    { id: 7, par: 7,
      blocks: [[6,2],[6,3],[6,4],[1,2],[2,2],[3,2]],
      crystals: [[6,0,B],[6,1,B],[0,2,P]] },
    { id: 8, par: 12,
      blocks: [[3,1],[3,2],[3,3],[3,4],[6,1],[6,2],[6,3],[6,4],[1,7],[2,7],[3,7],[4,7]],
      crystals: [[3,0,B],[6,0,P],[0,7,O]] },
    { id: 9, par: 10,
      blocks: [[1,1],[2,1],[3,1],[4,1],[1,6],[2,6],[3,6],[4,6],[7,1],[7,2],[7,3],[7,4]],
      crystals: [[0,1,B],[0,6,P],[7,0,O]] },
    { id: 10, par: 12,
      blocks: [[2,1],[2,2],[2,3],[5,1],[5,2],[5,3],[5,4],[1,3],[3,3]],
      crystals: [[2,0,B],[5,0,P],[0,3,O]] },
    { id: 11, par: 12, // 首次石块（在第 0 行/第 0 列，避开所有水晶线）
      stones: [[0,0]],
      blocks: [[7,1],[7,2],[7,3],[7,4],[5,1],[5,2],[5,3],[5,4],[5,5],[1,2],[2,2],[3,2]],
      crystals: [[7,0,B],[5,0,P],[0,2,O]] },
    { id: 12, par: 9,
      stones: [[0,7]],
      blocks: [[6,1],[6,2],[6,3],[6,4],[1,5],[2,5],[3,5],[4,5],[1,1],[2,1],[3,1]],
      crystals: [[6,0,B],[0,5,P],[0,1,O]] },
    { id: 13, par: 10,
      stones: [[0,0]],
      blocks: [[4,1],[4,2],[4,3],[7,1],[7,2],[7,3],[7,4],[1,6],[2,6],[3,6],[4,6]],
      crystals: [[4,0,B],[7,0,P],[0,6,O]] },
    { id: 14, par: 7,
      stones: [[7,7]],
      blocks: [[3,1],[3,2],[3,3],[1,0],[2,0],[6,1],[6,2],[6,3],[6,4]],
      crystals: [[3,0,B],[0,0,P],[6,0,O]] },
    { id: 15, par: 12,
      stones: [[0,0],[7,7]],
      blocks: [[5,1],[5,2],[5,3],[2,1],[2,2],[2,3],[1,4],[2,4],[3,4]],
      crystals: [[5,0,B],[2,0,P],[0,4,O]] },
    { id: 16, par: 12, // 三条线 + 大空缺
      blocks: [[1,1],[1,2],[1,3],[6,1],[6,2],[6,3],[2,0]],
      crystals: [[1,0,B],[6,0,P],[0,0,O]] },
    { id: 17, par: 13,
      stones: [[0,0]],
      blocks: [[7,1],[7,2],[7,3],[1,1],[2,1],[1,6],[2,6],[3,6],[4,6]],
      crystals: [[7,0,B],[0,1,P],[0,6,O]] },
    { id: 18, par: 12,
      stones: [[0,0]],
      blocks: [[2,1],[2,2],[2,3],[5,1],[5,2],[5,3],[1,3]],
      crystals: [[2,0,B],[5,0,P],[0,3,O]] },
    { id: 19, par: 12,
      stones: [[0,0]],
      blocks: [[6,1],[6,2],[6,3],[1,1],[1,2],[1,3],[1,4],[2,2],[3,2]],
      crystals: [[6,0,B],[1,0,P],[0,2,O]] },
    { id: 20, par: 12, // 收尾：四条线 + 最大空缺
      stones: [[0,7]],
      blocks: [[4,1],[4,2],[7,1],[7,2],[7,3],[1,0],[1,6],[2,6],[3,6],[4,6]],
      crystals: [[4,0,B],[7,0,P],[0,0,O],[0,6,B]] },
  ];

  /**
   * 校验（构建期第一道防线）。返回错误列表，空 = 通过。
   * 最重要的一条：**石块所在行/列上不许有水晶** —— 否则那颗水晶永远收集不到、玩家又死不了 = 软锁死。
   */
  function validate(levels) {
    const errs = [];
    const seen = new Set();
    for (const lv of levels || LEVELS) {
      if (seen.has(lv.id)) errs.push(`L${lv.id}: id 重复`);
      seen.add(lv.id);

      const stones = lv.stones || [], crystals = lv.crystals || [], blocks = lv.blocks || [];
      const inb = ([r, c]) => r >= 0 && r < 8 && c >= 0 && c < 8;
      [...stones, ...crystals, ...blocks].forEach(t => { if (!inb(t)) errs.push(`L${lv.id}: 坐标越界 ${t}`); });

      const stoneRows = new Set(stones.map(([r]) => r));
      const stoneCols = new Set(stones.map(([, c]) => c));
      for (const [r, c, kind] of crystals) {
        // ⛔ 软锁死：水晶的行和列都被石块封 ⇒ 永远清不掉
        if (stoneRows.has(r) && stoneCols.has(c)) {
          errs.push(`L${lv.id}: 水晶(${r},${c},${kind}) 的行和列都含石块 ⇒ 永远收集不到（软锁死）`);
        }
        if (!kind) errs.push(`L${lv.id}: 水晶(${r},${c}) 缺 kind`);
      }
      // 同一格不能既是石块又是水晶
      const key = ([r, c]) => r * 8 + c;
      const sset = new Set(stones.map(key));
      for (const cr of crystals) if (sset.has(key(cr))) errs.push(`L${lv.id}: (${cr[0]},${cr[1]}) 既是石块又是水晶`);
      // 重复占格
      const all = [...stones, ...crystals, ...blocks].map(key);
      if (new Set(all).size !== all.length) errs.push(`L${lv.id}: 有格子被重复占用`);
      if (!crystals.length) errs.push(`L${lv.id}: 没有水晶 = 没有目标`);

      // ⚠ 开局盘面不许有**已填满的行/列**：行满就消（与落子位置无关）⇒ 玩家第一子随便落哪
      //   都会白送一次消行 + 白拿那条线上的水晶。（单测构造关卡时踩到的。）
      const occ = new Set([...stones, ...crystals, ...blocks].map(([r, c]) => r * 8 + c));
      const stoneSet = new Set(stones.map(([r, c]) => r * 8 + c));
      for (let r = 0; r < 8; r++) {
        let full = true;
        for (let c = 0; c < 8; c++) if (stoneSet.has(r * 8 + c) || !occ.has(r * 8 + c)) { full = false; break; }
        if (full) errs.push(`L${lv.id}: 第 ${r} 行开局就是满的 ⇒ 第一子随便落哪都会白送一次消行`);
      }
      for (let c = 0; c < 8; c++) {
        let full = true;
        for (let r = 0; r < 8; r++) if (stoneSet.has(r * 8 + c) || !occ.has(r * 8 + c)) { full = false; break; }
        if (full) errs.push(`L${lv.id}: 第 ${c} 列开局就是满的 ⇒ 同上`);
      }
    }
    return errs;
  }

  const byId = id => LEVELS.find(l => l.id === id);
  const count = () => LEVELS.length;

  const API = { LEVELS, validate, byId, count, KINDS: [B, P, O] };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Levels = API;
})(typeof self !== 'undefined' ? self : this);
