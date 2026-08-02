// test-win.js — 三种玩法**赢局的收尾**必须一致（node，无浏览器）
//
// 这两条都是 2026-08-01 实测抓到的真 bug，都属于「功能测试全绿、玩家却看不到结算」那一类：
//   ⛔ Spider 集齐 8 组后 `s.won` **从没被置位**（core.apply 对 Spider 是提前 return 的分支，
//      够不着末尾那句统一置位）⇒ 结算屏画在 `s.won` 上 ⇒ 赢了却停在空盘面上。
//   ⛔ FreeCell 的分数**恒为 0** ⇒ `lastStageScore = score × 连关倍率` 也恒为 0
//      ⇒ 赢局对等级/锦标赛/连关零贡献，伪社交榜上还永远垫底。
const path = require('path');
const Core = require(path.join(__dirname, '../js/core.js'));
const Solver = require(path.join(__dirname, '../js/solver.js'));
const RulesS = require(path.join(__dirname, '../js/rules-spider.js'));
const SolverS = require(path.join(__dirname, '../js/solver-spider.js'));

let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'X   ') + m); if (!c) fail = 1; };

// ── FreeCell：真解一局，赢了要置 won、要有分、要有可结算的数据 ──
{
  let done = 0, lo = 1e9, hi = 0;
  for (let i = 0; i < 6 && done < 4; i++) {
    const s = Core.newGame(2000 + i, 3, 'freecell');
    const sol = Solver.solve(Solver.clone(s), { maxNodes: 900000, timeoutMs: 8000 });
    if (sol.result !== 'win') continue;
    sol.moves.forEach(m => Core.apply(s, m));
    if (!s.won) { ok(false, 'FreeCell 走完解法却没置 won'); break; }
    lo = Math.min(lo, s.score); hi = Math.max(hi, s.score);
    done++;
  }
  ok(done > 0, `FreeCell 解出并走完 ${done} 局`);
  ok(lo > 0, `⛔ FreeCell 胜局分数必须 >0（实测 ${lo}~${hi}）—— 0 分等于赢局对等级/锦标赛零贡献`);
  ok(lo > 600, '分数落在与另两种玩法可比的区间（伪社交榜上不会赢了还垫底）');
}

// ── Spider：集齐 8 组 ⇒ won 必须为 true，且事件里要有 win（结算屏与统计都挂在它上面）──
{
  const c = (r, su, cp) => (cp || 0) * 52 + r * 4 + su;
  const grp = k => Array.from({ length: 13 }, (_, i) => (k * 52 + i * 4 + 1));
  const s = Core.newGame(7, 1, 'spider');
  const a = []; for (let r = 12; r >= 2; r--) a.push(c(r, 0));
  s.tableau = Array.from({ length: 10 }, () => ({ cards: [], up: 0 }));
  s.tableau[0] = { cards: a, up: a.length };
  s.tableau[1] = { cards: [c(1, 0), c(0, 0)], up: 2 };
  s.stock = [];
  s.foundations = [grp(1), grp(2), grp(3), grp(4), grp(5), grp(6), grp(7)];   // 已收 7 组
  s.moves = [];

  const w = SolverS.solveWin(s);
  ok(w.win, '蜘蛛残局搜到必胜线');
  let sawWin = false;
  w.moves.forEach(m => { const ev = Core.apply(s, m); if (ev && ev.some(e => e.t === 'win')) sawWin = true; });
  ok(s.foundations.length === 8, '八组收齐');
  ok(s.won === true, '⛔⛔ 蜘蛛赢了必须置 s.won —— 结算屏就画在这个标志上（曾经恒 false）');
  ok(sawWin, '⛔ 事件里要有 win（onWin 的统计/金币/天使都靠它触发）');
  ok(RulesS.isWon(s), '规则层也认为赢了（两边口径一致）');
  ok(Core.apply(s, { t: 'tt', ti: 0, idx: 0, tj: 1 }) === null, '赢了之后不再接受走子');
}

console.log(fail ? '\nX test-win 有失败项' : '\ntest-win: 全部通过');
process.exit(fail);
