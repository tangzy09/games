// ════════════════════════════════════════
// core.js — 状态 / 走子 / 撤销 / 计分 / 统计。纯逻辑，无 DOM，可 node 单测。
//
// ⭐ 撤销 = **重放 move list 到 n−1 步**，不是快照栈（DESIGN §8.1）：
//    · 存档只需 `seed + moves[]`（几百字节），不是几百个盘面快照
//    · 「恢复后不能撤销」是这个品类的经典一星 —— 重放方案天然没这个问题
//    · 白送「回放 / 分享解法」，也正是 verify-deals.js 验证 solver 解的机制
//    前提：`deal.js` 是可复现的纯函数（已在那里写死）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const Cards = isNode ? require('./cards.js') : root.Cards;
  const Deal = isNode ? require('./deal.js') : root.Deal;
  const R = isNode ? require('./rules-klondike.js') : root.RulesK;
  const RF = isNode ? require('./rules-freecell.js') : root.RulesF;
  const RS = isNode ? require('./rules-spider.js') : root.RulesS;
  /** 按模式取规则模块（新增模式只在这里加一行）*/
  const rules = s => (s.mode === 'freecell' ? RF : s.mode === 'spider' ? RS : R);

  const SAVE_VERSION = 1;
  const { rankOf } = Cards;

  /** 开局（纯函数：同 seed + 同 drawCount ⇒ 完全相同的一局）*/
  function newGame(seed, drawCount, mode) {
    // ⭐ FreeCell：8 列全明牌、4 个 free cell、没有 stock/waste。
    //    52 张全可见 ⇒ 「有解」和「你能赢」之间**没有信息差**（与 Klondike 的根本区别）。
    if (mode === 'freecell') {
      const f = RF.deal(seed);
      return {
        v: SAVE_VERSION, mode: 'freecell',
        seed: seed >>> 0,
        drawCount: 3,                          // 占位（FreeCell 无此概念，但存档/签名统一）
        tableau: f.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
        free: [null, null, null, null],        // ⭐ 4 个 free cell
        stock: [], waste: [],                  // FreeCell 没有牌堆（留空，保持 state 形状统一）
        foundations: [[], [], [], []],
        moves: [], score: 0, recycles: 0, won: false,
        usedUndo: false, usedHint: false, usedSolver: false, usedJoker: false,
      };
    }
    // ⭐ Spider：104 张两副牌、10 列、1/2/4 花色三档难度。
    //   计分是**微软口径**：起始 500、每步 −1、每完成一组 +100（与另两种玩法不同，别统一）。
    if (mode === 'spider') {
      const sp = RS.deal(seed, drawCount);          // ⚠ drawCount 位复用成 suits（1/2/4）
      return {
        v: SAVE_VERSION, mode: 'spider',
        seed: seed >>> 0,
        drawCount: drawCount === 1 ? 1 : drawCount === 2 ? 2 : 4,   // = suits
        tableau: sp.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
        stock: sp.stock.slice(),
        waste: [],                                   // Spider 没有 waste（保持 state 形状统一）
        free: null,
        foundations: [],                             // 已完成的 8 组（不是 4 门花色）
        moves: [], score: 500, recycles: 0, won: false,
        usedUndo: false, usedHint: false, usedSolver: false, usedJoker: false,
      };
    }
    const d = Deal.klondike(seed);
    return {
      v: SAVE_VERSION, mode: 'klondike',
      seed: seed >>> 0,
      drawCount: drawCount === 1 ? 1 : 3,     // ⚠ 开局前属性，局中不可改（改了可解性角标就失效）
      tableau: d.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
      stock: d.stock.slice(),                 // 末尾 = 下一张要翻的
      waste: [],
      foundations: [[], [], [], []],          // 按花色 0..3
      moves: [],                              // ⭐ 唯一的历史真相；撤销靠重放它
      score: 0,
      recycles: 0,
      won: false,
      // 统计口径（DESIGN §4.5）：无限撤销会把胜率架空 ⇒ 必须分开记
      usedUndo: false,
      usedHint: false,
      usedSolver: false,                      // 用过「还有解吗？」
      usedJoker: false,                       // 用过 🃏 万能牌（不算干净赢）
    };
  }

  // ── 计分（Windows 标准计分）──
  function addScore(s, n) { s.score = Math.max(0, s.score + n); }

  /**
   * 走一步。move 见 rules.legalMoves() 的形状。
   * 返回事件数组（供 fx/音效消费）；非法则返回 null 且不改状态。
   */
  function apply(s, m, opts) {
    if (s.won) return null;
    const rec = !(opts && opts.replay);      // 重放时不再往 moves 里记

    // FreeCell 的走子全在 rules-freecell.js 里（move 类型都不一样：tc/ct/cf + supermove）
    if (s.mode === 'freecell') {
      const fev = RF.apply(s, m);
      if (!fev) return null;
      if (rec) s.moves.push(m);
      return fev;
    }
    // Spider 同理（move 类型：tt / deal10；含两个复合动作，见 rules-spider.js）
    if (s.mode === 'spider') {
      const sev = RS.apply(s, m);
      if (!sev) return null;
      if (rec) s.moves.push(m);
      if (RS.isWon(s)) s.won = true;         // ⛔ 双保险：这三条分支都提前 return，
      return sev;                            //    末尾那句统一置位**够不着**（Spider 曾因此永不结算）
    }
    const ev = [];

    const flipIfNeeded = ti => {
      const col = s.tableau[ti];
      if (col.cards.length && col.up === 0) {
        col.up = 1;
        addScore(s, 5);                       // 翻开一张暗牌 +5
        ev.push({ t: 'flip', ti, card: col.cards[col.cards.length - 1] });
      }
    };

    switch (m.t) {
      case 'draw': {
        if (!s.stock.length) return null;
        const n = Math.min(s.drawCount, s.stock.length);
        const drawn = [];
        for (let k = 0; k < n; k++) drawn.push(s.stock.pop());   // ⚠ 顺序：栈顶先出
        for (const c of drawn) s.waste.push(c);
        ev.push({ t: 'draw', cards: drawn });
        break;
      }
      case 'recycle': {
        if (s.stock.length || !s.waste.length) return null;
        // ⚠ 回收**保序**：waste 反转回 stock ⇒ 下一轮翻牌顺序与第一轮相同。
        //    这一条直接改变可解率,必须与离线 solver 的模型一致（DESIGN §1.4/§2.4）。
        s.stock = s.waste.reverse();
        s.waste = [];
        s.recycles++;
        addScore(s, s.drawCount === 1 ? -100 : -20);   // draw-1 过一遍 −100；draw-3 每次 −20
        ev.push({ t: 'recycle' });
        break;
      }
      case 'wf': {                              // waste → foundation
        if (!s.waste.length) return null;
        const c = s.waste[s.waste.length - 1];
        if (!R.canToFoundation(s, c, m.fi)) return null;
        s.waste.pop();
        s.foundations[m.fi].push(c);
        addScore(s, 10);
        ev.push({ t: 'toFoundation', card: c, fi: m.fi });
        break;
      }
      case 'wt': {                              // waste → tableau
        if (!s.waste.length) return null;
        const c = s.waste[s.waste.length - 1];
        if (!R.canToTableau(s, c, m.ti)) return null;
        s.waste.pop();
        const col = s.tableau[m.ti];
        col.cards.push(c);
        col.up++;
        addScore(s, 5);
        ev.push({ t: 'move', card: c, to: { p: 't', i: m.ti } });
        break;
      }
      case 'tf': {                              // tableau 顶牌 → foundation
        const col = s.tableau[m.ti];
        if (!col.cards.length) return null;
        const c = col.cards[col.cards.length - 1];
        if (!R.canToFoundation(s, c, m.fi)) return null;
        col.cards.pop();
        col.up = Math.max(0, col.up - 1);
        s.foundations[m.fi].push(c);
        addScore(s, 10);
        ev.push({ t: 'toFoundation', card: c, fi: m.fi });
        flipIfNeeded(m.ti);
        break;
      }
      case 'tt': {                              // tableau 序列 → tableau
        const from = s.tableau[m.ti], to = s.tableau[m.tj];
        if (m.idx >= from.cards.length) return null;
        if (!R.isValidRun(s, m.ti, m.idx)) return null;
        const card = from.cards[m.idx];
        if (!R.canToTableau(s, card, m.tj)) return null;
        const moved = from.cards.splice(m.idx);
        from.up -= moved.length;
        if (from.up < 0) from.up = 0;
        to.cards.push(...moved);
        to.up += moved.length;
        ev.push({ t: 'move', card, n: moved.length, to: { p: 't', i: m.tj } });
        flipIfNeeded(m.ti);
        break;
      }
      case 'jk': {                              // 🃏 万能牌：把 foundation 需要的下一张**真牌**从
        // 全场召唤过来（不复制 ⇒ 52 张守恒不破；只有 UI 走这步,solver 永不产生）。
        // 确定性 ⇒ 撤销=重放、prover 复盘照常成立。⚠ 用过 = usedJoker,不算干净赢。
        const f = s.foundations[m.fi];
        if (f.length >= 13) return null;
        const need = f.length * 4 + m.fi;       // rank = f.length, suit = fi
        let src = null;
        for (let ti = 0; ti < s.tableau.length && !src; ti++) {
          const idx = s.tableau[ti].cards.indexOf(need);
          if (idx >= 0) src = { p: 't', ti, idx };
        }
        if (!src) { const i = s.waste.indexOf(need); if (i >= 0) src = { p: 'w', i }; }
        if (!src) { const i = s.stock.indexOf(need); if (i >= 0) src = { p: 's', i }; }
        if (!src) return null;
        if (src.p === 't') {
          const col = s.tableau[src.ti];
          const nDown = col.cards.length - col.up;
          col.cards.splice(src.idx, 1);
          if (src.idx >= nDown) col.up--;       // 抽走的是明牌才减 up；抽暗牌 up 不变
          flipIfNeeded(src.ti);
        } else if (src.p === 'w') s.waste.splice(src.i, 1);
        else s.stock.splice(src.i, 1);
        f.push(need);
        s.usedJoker = true;
        addScore(s, 10);
        ev.push({ t: 'toFoundation', card: need, fi: m.fi });
        break;
      }
      case 'ft': {                              // foundation → tableau（取回）
        const f = s.foundations[m.fi];
        if (!f.length) return null;
        const c = f[f.length - 1];
        if (!R.canToTableau(s, c, m.ti)) return null;
        f.pop();
        const col = s.tableau[m.ti];
        col.cards.push(c);
        col.up++;
        addScore(s, -15);                       // 取回 −15
        ev.push({ t: 'move', card: c, to: { p: 't', i: m.ti } });
        break;
      }
      default: return null;
    }

    if (rec) s.moves.push(m);
    if (R.isWon(s)) { s.won = true; ev.push({ t: 'win' }); }
    return ev;
  }

  /** 从头重放一串 move（用于撤销 / 存档恢复 / 验证 solver 的解）*/
  function replay(seed, drawCount, moves, mode) {
    const s = newGame(seed, drawCount, mode);
    for (const m of moves) {
      if (!apply(s, m, { replay: true })) return null;   // 任何一步非法 ⇒ 整条 move list 无效
      s.moves.push(m);
    }
    return s;
  }

  /** 撤销一步 = 重放到 n−1（⚠ 会打上 usedUndo，统计口径见 DESIGN §4.5）*/
  function undo(s) {
    if (!s.moves.length) return null;
    const next = replay(s.seed, s.drawCount, s.moves.slice(0, -1), s.mode);
    if (!next) return null;
    next.usedUndo = true;                       // 一旦用过就永久留痕（「零撤销胜率」靠它）
    next.usedHint = s.usedHint;
    next.usedSolver = s.usedSolver;
    return next;
  }

  /**
   * 双击（再点一下已选中的牌）⇒ 自动挑一个落点。
   * 纯函数：只读 s，返回 move 或 null（没有可去的地方）。
   * sel 形状同 UI 的 G.sel：{p:'w'} | {p:'c',ci} | {p:'t',ti,idx}。
   * 优先级：foundation → 有牌的列 → 空列 → free cell。
   *   空列排在有牌的列后面 —— 空列是稀缺资源，别被双击随手占掉；
   *   free cell 只当兜底（FreeCell 经典双击行为），同理。
   */
  /** 「选中这张/这叠牌」能走的全部合法落点（双击、拖拽吸附、落点高亮共用同一份口径） */
  function destsFor(s, sel) {
    const topIdx = ti => s.tableau[ti].cards.length - 1;
    const match = m => {
      if (sel.p === 'w') return m.t === 'wf' || m.t === 'wt';
      if (sel.p === 'c') return (m.t === 'cf' || m.t === 'ct') && m.ci === sel.ci;
      // ⭐ 从 foundation 取回（'ft'）——收早了的牌要能拿回来（Klondike 专属，见 rules-klondike）
      if (sel.p === 'f') return m.t === 'ft' && m.fi === sel.fi;
      if (m.t === 'tf' || m.t === 'tc') return m.ti === sel.ti && sel.idx === topIdx(sel.ti);
      if (m.t === 'tt') return m.ti === sel.ti && m.idx === sel.idx;
      return false;
    };
    return rules(s).legalMoves(s).filter(match);
  }

  function autoDest(s, sel) {
    const rank = m => {
      if (m.t === 'tf' || m.t === 'wf' || m.t === 'cf') return 0;
      if (m.t === 'tc') return 3;
      const tj = (m.t === 'wt' || m.t === 'ft') ? m.ti : m.tj;   // ⚠ wt/ft 的目标列字段叫 ti，不是 tj
      return s.tableau[tj].cards.length ? 1 : 2;
    };
    let best = null, bestR = Infinity;
    for (const m of destsFor(s, sel)) {
      const r = rank(m);
      if (r < bestR) { best = m; bestR = r; }     // 同档取 legalMoves 的先后（列号小者）
    }
    return best;
  }

  /**
   * 稳赢检测（Klondike）：牌堆/废牌堆空 + 全部明牌 ⇒ 可以一键走完。
   * ⚠ 这只是**按钮的显示条件**；真正走之前仍用 Solver 实证拿解法 move list ——
   *   「全明牌必胜」是民间定理，我们有求解器就不赌它。
   */
  function canAutoFinish(s) {
    if (s.mode !== 'klondike' || s.won) return false;
    if (s.stock.length || s.waste.length) return false;
    return s.tableau.every(c => c.up === c.cards.length);
  }

  // ⛔ `autoPlayMoves`（一次收光所有安全牌）已删（2026-08-01）：它只服务于底部那个
  //    「⤴ 自动收牌」按钮，按钮去掉后没有第二个调用点。
  //    ⚠ `rules.isSafeToAutoPlay` **保留**——solver/盲打 AI 的启发式仍靠它打分。

  const API = { SAVE_VERSION, newGame, apply, replay, undo,
                autoDest, destsFor, canAutoFinish, addScore, rules };
  if (isNode) module.exports = API;
  else root.Core = API;
})(typeof self !== 'undefined' ? self : this);
