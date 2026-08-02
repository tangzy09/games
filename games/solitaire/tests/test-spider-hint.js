// test-spider-hint.js — 蜘蛛的提示必须「向胜利走」，不是「现在能走什么」
//
// 钉四件事：
//   ① 眼前一步就能翻暗牌 ⇒ 提示就得是那一步（而不是随便一个合法着法）
//   ② 能凑齐 K→A 一组 ⇒ 提示优先走它（那是**直接的胜利进度**：8 组即赢）
//   ③ 残局（牌堆空 + 全明牌）能真赢 ⇒ 提示标 win（UI 才敢写「通往胜利」）
//   ④ ⛔ 找不到推进时**不许假装**：返回 null，由调用方退回启发式并标 GUESS
const path = require('path');
const RulesS = require(path.join(__dirname, '../js/rules-spider.js'));
const SolverS = require(path.join(__dirname, '../js/solver-spider.js'));

let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'X   ') + m); if (!c) fail = 1; };

const S = 0, H = 1, C = 2, D = 3;                 // ♠♥♣♦
const card = (rank, suit, copy) => (copy || 0) * 52 + rank * 4 + suit;   // rank 0=A … 12=K

function mk(cols, opt) {
  return Object.assign({
    mode: 'spider', suits: 1, seed: 1, score: 500,
    tableau: cols.map(c => ({ cards: c.cards.slice(), up: c.up })),
    stock: [], foundations: [], waste: [], free: [], drawCount: 1, moves: [],
  }, opt || {});
}
const col = (cards, up) => ({ cards, up: up == null ? cards.length : up });
const pad = n => col([card(12, S), card(11, H)], 2);   // 无关的占位列（K♠ 上压 Q♥，搬不动）

// ── ① 一步就能翻暗牌 ⇒ 提示必须是那一步 ──
{
  // 列 0：[暗牌, 6♠(明)]；列 1 顶是 7♠ ⇒ 把 6♠ 搬过去就翻开暗牌
  const cols = [col([card(3, S, 1), card(5, S)], 1), col([card(6, S)], 1)];
  while (cols.length < 10) cols.push(pad());
  const s = mk(cols);
  const h = SolverS.hint(s);
  ok(!!h, '找到了推进的一步');
  ok(h && h.kind === 'flip', '⭐ 认出这一步是「翻开暗牌」，kind=' + (h && h.kind));
  ok(h && h.move.ti === 0 && h.move.tj === 1 && h.move.idx === 1,
     '⭐ 提示 = 把 6♠ 搬到 7♠ 上（翻开下面的暗牌）：' + JSON.stringify(h && h.move));
  ok(h && h.win === false, '⛔ 没证明必胜 ⇒ win=false（UI 必须标 GUESS，不能吹成通往胜利）');
}

// ── ② 能凑齐一组 K→A ⇒ 优先走它（直接的胜利进度）──
{
  // 列 0：K..2 同花 12 张（明）；列 1：A♠ —— 把 A 接上去即凑齐 13 张自动收走
  const run = [];
  for (let r = 12; r >= 1; r--) run.push(card(r, S));
  const cols = [col(run), col([card(0, S)])];
  // 另给一列也能接 A 的地方（2♠ 另一副），确保「凑齐组」与「普通接龙」都合法、看它选哪个
  cols.push(col([card(1, S, 1)]));
  while (cols.length < 10) cols.push(pad());
  const s = mk(cols);
  const h = SolverS.hint(s);
  ok(h && h.move.ti === 1 && h.move.tj === 0,
     '⭐ 提示 = 把 A♠ 接到 K→2 那列（凑齐一组）：' + JSON.stringify(h && h.move));
  ok(h && (h.kind === 'set' || h.kind === 'flip'), 'kind 标成 set（凑组）：' + (h && h.kind));
  // 真走一遍：组应当被自动收走
  const c = SolverS.clone(s);
  RulesS.apply(c, h.move);
  ok(c.foundations.length === 1, '⭐ 走完这一步真的收走了一组（foundations 1）');
}

// ── ②b 同一层里「凑齐一组」必须赢过「翻暗牌」（gain 差 100 倍，别被着法排序带偏）──
{
  const run = [];
  for (let r = 12; r >= 1; r--) run.push(card(r, S));
  const cols = [
    col(run),                                        // 0：K→2 同花，差一张 A
    col([card(0, S)]),                               // 1：A♠ —— 接上去就凑齐一组
    col([card(3, H, 1), card(5, H)], 1),             // 2：搬走 6♥ 能翻一张暗牌
    col([card(6, H)]),                               // 3：7♥ 收 6♥
  ];
  while (cols.length < 10) cols.push(pad());
  const s = mk(cols);
  const h = SolverS.hint(s);
  ok(h && h.kind === 'set' && h.move.ti === 1,
     '⭐ 同时能「凑组」和「翻暗牌」时选凑组：kind=' + (h && h.kind) + ' ' + JSON.stringify(h && h.move));
}

// ── ③ 残局能真赢 ⇒ 标 win（这时才配说「通往胜利」）──
{
  // 两列：K..A 同花但被拆成 K..3 与 2,A —— 两步内可完成一组，且这是全局最后一组
  const a = [], b = [];
  for (let r = 12; r >= 2; r--) a.push(card(r, S));
  b.push(card(1, S), card(0, S));
  const cols = [col(a), col(b)];
  while (cols.length < 10) cols.push(col([]));
  const s = mk(cols, { foundations: [1, 2, 3, 4, 5, 6, 7] });   // 已收 7 组，这是最后一组
  const h = SolverS.hint(s);
  ok(h && h.win === true, '⭐⭐ 残局搜到真必胜线 ⇒ win=true（' + JSON.stringify(h && h.move) + '）');
  // 照着解法走完必须真赢
  const w = SolverS.solveWin(s);
  const c = SolverS.clone(s);
  w.moves.forEach(m => RulesS.apply(c, m));
  ok(RulesS.isWon(c), '⭐ 解法逐步重放后确实赢了（不是嘴上说赢）');
}

// ── ④ 无路可推进 ⇒ 返回 null，绝不编一步 ──
{
  const cols = [];
  for (let i = 0; i < 10; i++) cols.push(col([card(12, S), card(11, H)], 2));   // 全是搬不动的
  const s = mk(cols);
  ok(SolverS.hint(s) === null, '⛔ 推进不了就返回 null（由调用方退回启发式并标 GUESS）');
}

// ── ⑤ 预算守得住：开局那种大局面也要在几百毫秒内返回 ──
{
  // ⚠ RulesS.deal 只给 {tableau, stock}（foundations 由 Core.newGame 补）—— 测试里自己补齐
  const d = RulesS.deal(12345, 4);
  const s = mk(d.tableau, { stock: d.stock, suits: 4 });
  const t0 = Date.now();
  const h = SolverS.hint(s);
  const ms = Date.now() - t0;
  ok(ms < 1200, `开局大局面 ${ms}ms 内返回（提示是点击后同步跑的，不能卡住 UI）`);
  ok(h === null || h.win === false, '开局这种局面不许标成 win');
}

console.log(fail ? '\nX test-spider-hint 有失败项' : '\ntest-spider-hint: 全部通过');
process.exit(fail);
