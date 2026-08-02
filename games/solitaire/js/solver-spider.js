// ════════════════════════════════════════
// solver-spider.js — Spider 的**目标导向搜索**：让提示「向胜利走」，而不是「现在能走什么」。
//
// ⭐ 为什么不是「解开整局」（2026-08-01 用户点名「蜘蛛的提示要向胜利走」）：
//   104 张 + 5 次发牌的状态空间远超 Klondike，**开局就求整解在任何预算内都是不现实的**
//   （4 花色人类胜率 <10%，机器也不便宜）。所以这里分两档，**两档都诚实**：
//     ① **残局全解**：牌堆空 + 无暗牌时，直接搜真正的必胜线 —— 找到就是「通往胜利的下一步」。
//     ② **推进搜索**（平时走这条）：搜出一条能兑现「离胜利更近」的**可验证事件**的最短线，
//        提示 = 那条线的第一步。蜘蛛离胜利更近只有四件事，按价值排：
//          收走一组 K→A（8 组 = 赢） > 翻开暗牌 > 空出一列 > 同花序列接更长。
//   ⛔ 第 ② 档**不许说成「必胜」** —— UI 标成 GUESS（同求解器 unknown 的口径）。
//      把「推进」画成「证明」，就是拿产品最核心的承诺撒谎。
//
// ⚠ 只搜 'tt'（搬牌），**不搜 deal10**：发牌不是推进（它把牌面变复杂），而且它随时可用，
//   玩家自己会按。搜索里混进发牌会让「最短推进线」变成「发一轮再看看」，那是废话提示。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const RulesS = isNode ? require('./rules-spider.js') : root.RulesS;

  const clone = s => ({
    mode: 'spider', suits: s.suits, seed: s.seed, score: s.score || 0,
    tableau: s.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
    stock: s.stock.slice(),
    foundations: s.foundations.slice(),
    waste: [], free: [], drawCount: 1, moves: [],
  });

  /** 状态签名：列之间可交换 ⇒ **排序后**再拼（否则同一局面换个列序会被当成新节点，白搜） */
  function hash(s) {
    const cols = s.tableau.map(c => c.up + '|' + c.cards.join(','));
    cols.sort();
    return s.foundations.length + '#' + s.stock.length + '#' + cols.join(';');
  }

  /** 离胜利有多近的四个可验证指标 */
  function metric(s) {
    let down = 0, empty = 0, seq = 0;
    for (const c of s.tableau) {
      down += c.cards.length - c.up;
      if (!c.cards.length) empty++;
      // 顶端同花顺降序有多长（能整段搬走的那一段 = 蜘蛛真正的「进度」）
      let n = 1;
      for (let i = c.cards.length - 1; i > c.cards.length - c.up && i > 0; i--) {
        const a = c.cards[i], b = c.cards[i - 1];
        if (RulesS.st(a) === RulesS.st(b) && RulesS.rk(b) === RulesS.rk(a) + 1) n++;
        else break;
      }
      if (c.cards.length) seq += n;
    }
    return { f: s.foundations.length, down, empty, seq };
  }
  const gainOf = (m, b) =>
    (m.f - b.f) * 10000 + (b.down - m.down) * 100 + (m.empty - b.empty) * 40 + (m.seq - b.seq) * 3;
  function kindOf(m, b) {
    if (m.f > b.f) return 'set';
    if (m.down < b.down) return 'flip';
    if (m.empty > b.empty) return 'empty';
    return 'seq';
  }

  /** 着法排序：先试**看起来就在推进**的（翻暗牌 / 空列 / 同花接龙），搜索能早很多命中 */
  function order(s, ms) {
    return ms.map(m => {
      const col = s.tableau[m.ti], to = s.tableau[m.tj];
      const nDown = col.cards.length - col.up;
      let v = 0;
      if (m.idx === nDown && nDown > 0) v += 60;                       // 搬走后能翻一张暗牌
      if (m.idx === 0) v += 45;                                        // 搬走整列 = 空出一列
      const card = col.cards[m.idx];
      const top = to.cards[to.cards.length - 1];
      if (top != null && RulesS.st(top) === RulesS.st(card)) v += 30;  // 同花接上（能整段搬）
      if (!to.cards.length) v -= 10;                                   // 往空列扔单牌：常常是白走
      return { m, v };
    }).sort((a, b) => b.v - a.v).map(x => x.m);
  }

  /**
   * ① 残局全解：牌堆空 + 全明牌时才调（那时搜索空间已经小到能穷）。
   * 返回 { win:true, moves:[…] } 或 { win:false }
   */
  function solveWin(s0, opt) {
    opt = opt || {};
    const maxNodes = opt.maxNodes || 120000, timeoutMs = opt.timeoutMs || 1500;
    const t0 = Date.now();
    const seen = new Set();
    let nodes = 0, out = null;
    (function dfs(s, path) {
      if (out || nodes++ > maxNodes || Date.now() - t0 > timeoutMs) return;
      if (RulesS.isWon(s)) { out = path; return; }
      const h = hash(s);
      if (seen.has(h)) return;
      seen.add(h);
      for (const m of order(s, RulesS.legalMoves(s))) {
        const c = clone(s);
        if (!RulesS.apply(c, m)) continue;
        dfs(c, path.concat([m]));
        if (out) return;
      }
    })(clone(s0), []);
    return out ? { win: true, moves: out } : { win: false };
  }

  /**
   * ② 推进搜索：找**最短**的一条能带来正向进度的线，返回它的第一步。
   * 返回 { move, kind, gain, depth } 或 null（预算内找不到任何推进）
   */
  function findProgress(s0, opt) {
    opt = opt || {};
    const maxNodes = opt.maxNodes || 20000, timeoutMs = opt.timeoutMs || 250;
    const maxDepth = opt.maxDepth || 5;
    const t0 = Date.now();
    const base = metric(s0);
    const seen = new Set();
    let nodes = 0, best = null;

    // ⚠ 迭代加深：**最短的推进线才是好提示** —— 一上来就深搜会先撞到「五步之后能翻一张」，
    //   而眼前其实一步就能翻（玩家会觉得这提示很怪）。
    for (let depth = 1; depth <= maxDepth && !best; depth++) {
      seen.clear();
      (function dfs(s, d, first) {
        // ⚠ 这里**不能**写 `if (best || …) return`：那样第一个正收益就锁死了结果，
        //   同层更值钱的（凑组 gain 10000 vs 翻牌 100）永远轮不到比较（实测被单测抓出）。
        if (nodes++ > maxNodes || Date.now() - t0 > timeoutMs) return;
        const g = gainOf(metric(s), base);
        if (g > 0 && first) {
          if (!best || g > best.gain) best = { move: first, kind: kindOf(metric(s), base), gain: g, depth: d };
          return;                                   // 这一层已经有推进，不必再往深了
        }
        if (d >= depth) return;
        const h = hash(s);
        if (seen.has(h)) return;
        seen.add(h);
        // ⚠ 找到一步推进就收手是**错的**：同一层里「凑齐一组」比「翻一张暗牌」值钱得多
        //   （gain 差 100 倍），提前 return 会让它取到排序里靠前的那个 flip。
        //   同层要扫完再比 gain；深度由迭代加深控制，扫完一层不贵。
        for (const m of order(s, RulesS.legalMoves(s))) {
          const c = clone(s);
          if (!RulesS.apply(c, m)) continue;
          dfs(c, d + 1, first || m);
        }
      })(clone(s0), 0, null);
    }
    return best;
  }

  /**
   * 提示统一入口：先看能不能真赢（残局），再退到推进搜索。
   * 返回 { move, win:bool, kind } 或 null —— **win 为 false 时 UI 必须标成 GUESS**。
   */
  function hint(s, opt) {
    const m0 = metric(s);
    if (!s.stock.length && m0.down === 0) {
      const w = solveWin(s, opt && opt.win);
      if (w.win && w.moves.length) return { move: w.moves[0], win: true, kind: 'win' };
    }
    const p = findProgress(s, opt && opt.progress);
    return p ? { move: p.move, win: false, kind: p.kind } : null;
  }

  const API = { hint, findProgress, solveWin, metric, clone, hash };
  if (isNode) module.exports = API;
  else root.SolverS = API;
})(typeof self !== 'undefined' ? self : this);
