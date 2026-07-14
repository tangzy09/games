// ════════════════════════════════════════
// solver.js — Klondike 求解器（thoughtful / 透视暗牌）。**纯 JS，node 与浏览器共用同一份**。
//
// ⭐ 为什么自己写而不是引 lonelybot(Rust/WASM) 或 Solvitaire(GPL)：
//   1. **它必须与我们的 rules-klondike.js 规则完全一致** —— 否则「已验证可解」是系统性谎言
//      （红队 F2）。用同一份 core.apply 推演，这个问题从根上消失。
//   2. node 离线建池 + 浏览器实时判定「这局还有解吗」**同一份代码**，零 WASM、零 GPL。
//
// ⚠ 它**透视暗牌**（thoughtful solitaire）—— 这正是论文那 81.9% 的口径。
//   ⇒ 它说「有解」**不等于**玩家能赢（玩家看不见暗牌）。措辞红线见 DESIGN §2.1。
//
// 返回：{ result: 'win' | 'dead' | 'unknown', moves: [...], nodes: n }
//   'unknown' = 超过节点/时间预算 —— ⛔ **绝不把「不知道」说成「有解」**。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Core = isNode ? require('./core.js') : root.Core;
  const R = isNode ? require('./rules-klondike.js') : root.RulesK;
  const RF = isNode ? require('./rules-freecell.js') : root.RulesF;
  const rules = st => (st.mode === 'freecell' ? RF : R);
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const { rankOf } = Cards;

  /** 紧凑克隆（比 JSON 快一个数量级；solver 每个节点都要克隆）*/
  function clone(s) {
    return {
      v: s.v, seed: s.seed, drawCount: s.drawCount,
      tableau: s.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
      stock: s.stock.slice(),
      waste: s.waste.slice(),
      free: s.free ? s.free.slice() : undefined,        // FreeCell 的 4 个 free cell
      mode: s.mode,
      foundations: s.foundations.map(f => f.slice()),
      moves: [],                          // solver 不需要在克隆里记历史（外面单独存路径）
      score: s.score, recycles: s.recycles, won: s.won,
      usedUndo: false, usedHint: false, usedSolver: false,
    };
  }

  /** 局面指纹（透视：包含暗牌，因为 solver 看得见）*/
  function key(s) {
    // 列的顺序无关（两列内容互换是同一个局面）⇒ 排序后再拼，能砍掉大量重复
    const cols = s.tableau.map(c => c.cards.join(',') + '/' + c.up).sort();
    if (s.mode === 'freecell') {
      // ⚠ free cell 之间也是无序的（牌在 1 号还是 3 号格子完全等价）⇒ 排序，否则搜索树炸掉
      const fc = s.free.map(x => (x == null ? '-' : x)).sort().join(',');
      return cols.join(';') + '#' + fc + '#' + s.foundations.map(f => f.length).join(',');
    }
    return cols.join(';') + '#' + s.waste.join(',') + '#' + s.stock.join(',');
  }

  const foundTotal = s => s.foundations.reduce((a, f) => a + f.length, 0);

  /** 走法排序：好棋先试（决定了 solver 的实际速度）*/
  function orderMoves(s, moves) {
    if (s.mode === 'freecell') return orderFC(s, moves);
    const val = m => {
      if (m.t === 'wf' || m.t === 'tf') {
        const card = m.t === 'tf'
          ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1]
          : s.waste[s.waste.length - 1];
        return R.isSafeToAutoPlay(s, card) ? 100 : 60;    // 安全收牌几乎总是对的
      }
      if (m.t === 'tt') {
        const col = s.tableau[m.ti];
        const flips = m.idx > 0 && col.cards.length - m.idx === col.up;   // 翻暗牌
        const empties = m.idx === 0 && col.cards.length === col.up;       // 清空列
        return flips ? 80 : (empties ? 50 : 10);
      }
      if (m.t === 'wt') return 40;
      if (m.t === 'draw') return 20;
      if (m.t === 'recycle') return 5;
      if (m.t === 'ft') return 1;                          // 取回：几乎总是坏棋，最后试
      return 0;
    };
    return moves.map((m, i) => ({ m, v: val(m), i }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i))
      .map(x => x.m);
  }

  /** FreeCell 的走法排序（收牌 > 腾空列 > 搬叠 > 占用 free cell）*/
  function orderFC(s, moves) {
    const val = m => {
      if (m.t === 'tf' || m.t === 'cf') {
        const card = m.t === 'tf' ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1] : s.free[m.ci];
        return RF.isSafeToAutoPlay(s, card) ? 100 : 65;
      }
      if (m.t === 'ct') return 55;                        // 把 free cell 腾出来，几乎总是好的
      if (m.t === 'tt') {
        const col = s.tableau[m.ti];
        const empties = m.idx === 0;                      // 清空一列（FreeCell 里空列是最强资源）
        return empties ? 70 : 30;
      }
      if (m.t === 'tc') return 5;                         // 占用 free cell：最后才考虑
      return 0;
    };
    return moves.map((m, i) => ({ m, v: val(m), i }))
      .sort((a, b) => (b.v - a.v) || (a.i - b.i))
      .map(x => x.m);
  }

  /**
   * 求解。opts: { maxNodes, timeoutMs }
   * ⚠ 超预算返回 'unknown' —— 诚实红线：不知道就说不知道。
   */
  /**
   * 求解入口。
   *
   * ⭐ FreeCell 用**两种搜索分工**（各有各的强项，缺一不可）：
   *   - **找解 → best-first**：DFS 在 FreeCell 上烧 200 万节点也解不出一局（分支因子太大，
   *     一头扎进死胡同）；best-first 永远先展开「离赢最近」的局面，几千节点就解出来。
   *   - **判无解 → DFS**：best-first 要把所有展开过的局面**同时留在内存里**，穷尽一个
   *     状态空间直接 OOM；DFS 的内存只占「当前深度」，而**无解的局树很浅**（很快就无路可走）。
   *
   * ⚠ DFS 对**有解**的局会一路钻到上万层而爆栈 —— 但那种局 best-first 已经先解掉了，
   *   走不到 DFS。万一还是爆了，catch 住诚实返回 unknown，绝不谎报 dead。
   */
  function solve(state, opts) {
    const o0 = opts || {};
    if (state.mode !== 'freecell') return solveDFS(state, o0);

    const bf = solveBF(state, { maxNodes: o0.bfNodes || 120000 });
    if (bf.result === 'win' || bf.result === 'dead') return bf;   // dead = 队列真的空了 = 穷尽
    try {
      return solveDFS(state, { maxNodes: o0.maxNodes || 2000000, maxDepth: 1e9 });
    } catch (e) {
      return { result: 'unknown', moves: [], nodes: bf.nodes, ms: bf.ms };   // 爆栈 ⇒ 不知道
    }
  }

  function solveDFS(state, opts) {
    const o = opts || {};
    const MAX_NODES = o.maxNodes || 200000;
    const TIMEOUT = o.timeoutMs || 0;                      // 0 = 不限时（离线建池用）
    const t0 = Date.now();

    const seen = new Set();
    let nodes = 0;
    let timedOut = false;
    let depthCapped = false;
    const path = [];

    // ⚠ 深度上限：FreeCell 的状态空间比 Klondike 大得多，DFS 能一路钻到上万层（直接爆栈）。
    //   ⛔ 但**触顶只能返回 unknown，绝不能返回 dead** —— 那是拿「我们搜不动」去污蔑一个
    //      有解的局，正是这个产品最不能犯的错。
    const MAX_DEPTH = o.maxDepth || 400;

    function dfs(s, depth) {
      if (s.won || foundTotal(s) === 52) return true;
      if (++nodes > MAX_NODES) { timedOut = true; return false; }
      if (depth > MAX_DEPTH) { depthCapped = true; return false; }
      if (TIMEOUT && (nodes & 255) === 0 && Date.now() - t0 > TIMEOUT) { timedOut = true; return false; }

      const k = key(s);
      if (seen.has(k)) return false;
      seen.add(k);

      // ⭐ 关键剪枝：**安全收牌直接走，不分支**。
      //    一张「安全」的牌（不可能再被 tableau 需要）收进 foundation 永远不会变坏 ——
      //    所以没必要为它开一个分支。这一条把搜索树砍掉一大截。
      const RR = rules(s);
      // ⚠ 搜索用 solverMoves（无损去冗余）；没有就退回 legalMoves
      const gen = RR.solverMoves || RR.legalMoves;
      const forced = gen(s).find(m => {
        if (m.t !== 'tf' && m.t !== 'wf' && m.t !== 'cf') return false;
        const card = m.t === 'tf' ? s.tableau[m.ti].cards[s.tableau[m.ti].cards.length - 1]
                   : m.t === 'cf' ? s.free[m.ci]
                   : s.waste[s.waste.length - 1];
        return card != null && RR.isSafeToAutoPlay(s, card);
      });
      if (forced) {
        const next = clone(s);
        if (Core.apply(next, forced, { replay: true })) {
          path.push(forced);
          if (dfs(next, depth + 1)) return true;
          path.pop();
          return false;                       // 安全收牌是无损的 ⇒ 不必再试别的分支
        }
      }

      for (const m of orderMoves(s, gen(s))) {
        const next = clone(s);
        if (!Core.apply(next, m, { replay: true })) continue;
        path.push(m);
        if (dfs(next, depth + 1)) return true;
        path.pop();
        if (timedOut) return false;
      }
      return false;
    }

    const won = dfs(clone(state), 0);
    return {
      // ⚠ depthCapped 也算 unknown：没搜完就说「无解」= 撒谎
      result: won ? 'win' : ((timedOut || depthCapped) ? 'unknown' : 'dead'),
      moves: won ? path.slice() : [],
      nodes,
      ms: Date.now() - t0,
    };
  }

  // ══════════════════════════════════════
  // best-first 搜索（FreeCell 专用）
  //
  // ⚠ 为什么 FreeCell 不能用 DFS：分支因子远大于 Klondike，深度优先会一头扎进死胡同，
  //   烧 200 万节点也解不出一局有解的牌（实测），而且递归深度上万直接爆栈。
  //   best-first 永远先展开「离赢最近」的局面，且用**显式队列**（不递归 ⇒ 不爆栈）。
  //
  // ⚠ 结论的诚实性：队列真的空了 ⇒ 穷尽 ⇒ 'dead'；超预算 ⇒ 'unknown'。绝不混淆。
  // ══════════════════════════════════════

  /** 离赢有多远（越小越好）—— FreeCell 的全部功夫是「挖出下一张要收的牌」*/
  function hFC(s) {
    let v = (52 - foundTotal(s)) * 10;
    v += s.free.filter(x => x != null).length * 8;          // 占用 free cell = 负担（占满就死）
    // ⭐ 空列是 FreeCell **最强的资源**（supermove 上限按空列数翻倍）—— 漏了这一项，
    //   solver 根本不知道该去腾空一列，烧 15 万节点也解不出一局有解的牌。
    v -= s.tableau.filter(c => !c.cards.length).length * 14;
    for (let su = 0; su < 4; su++) {
      const f = s.foundations[su];
      const nextRank = f.length ? rankOf(f[f.length - 1]) + 1 : 0;
      if (nextRank > 12) continue;
      const id = nextRank * 4 + su;
      for (const col of s.tableau) {
        const i = col.cards.indexOf(id);
        if (i >= 0) { v += (col.cards.length - 1 - i) * 4; break; }   // 下一张要收的牌被压了几张
      }
    }
    return v;
  }

  // 二叉堆（按 h 取最小）
  function hpush(q, x) {
    q.push(x);
    let i = q.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (q[p].h <= q[i].h) break; [q[p], q[i]] = [q[i], q[p]]; i = p; }
  }
  function hpop(q) {
    const top = q[0], last = q.pop();
    if (q.length) {
      q[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < q.length && q[l].h < q[m].h) m = l;
        if (r < q.length && q[r].h < q[m].h) m = r;
        if (m === i) break;
        [q[m], q[i]] = [q[i], q[m]]; i = m;
      }
    }
    return top;
  }

  function solveBF(state, opts) {
    const o = opts || {};
    const MAX_NODES = o.maxNodes || 150000;
    const t0 = Date.now();
    const RR = rules(state);
    const gen = RR.solverMoves || RR.legalMoves;

    const seen = new Set();
    const q = [];
    const root = clone(state);
    hpush(q, { s: root, m: null, parent: null, h: hFC(root) });
    seen.add(key(root));

    let nodes = 0;
    while (q.length) {
      if (++nodes > MAX_NODES) return { result: 'unknown', moves: [], nodes, ms: Date.now() - t0 };
      const cur = hpop(q);

      if (foundTotal(cur.s) === 52) {                     // 赢了 ⇒ 回溯出走法序列
        const path = [];
        for (let n = cur; n && n.m; n = n.parent) path.unshift(n.m);
        return { result: 'win', moves: path, nodes, ms: Date.now() - t0 };
      }

      for (const m of gen(cur.s)) {
        const nx = clone(cur.s);
        if (!Core.apply(nx, m, { replay: true })) continue;
        const k = key(nx);
        if (seen.has(k)) continue;
        seen.add(k);
        hpush(q, { s: nx, m, parent: cur, h: hFC(nx) });
      }
    }
    return { result: 'dead', moves: [], nodes, ms: Date.now() - t0 };   // 队列空 = 真的穷尽了
  }

  /** 便捷：直接从 seed 求解一整局 */
  function solveSeed(seed, drawCount, opts, mode) {
    return solve(Core.newGame(seed, drawCount, mode), opts);
  }

  const API = { solve, solveSeed, solveBF, clone, key, hFC };
  if (isNode) module.exports = API;
  else root.Solver = API;
})(typeof self !== 'undefined' ? self : this);
