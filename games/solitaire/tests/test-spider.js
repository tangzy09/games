// test-spider.js — Spider 规则单测。
// ⚠ 两副牌 id 是 0..103，`id % 52` 才是牌面 —— 这条错了所有比较都静默失效，所以先钉死它。
const assert = require('assert');
const S = require('../js/rules-spider.js');
const Cards = require('../js/cards.js');

const SP = 0, HE = 1, CL = 2, DI = 3;
/** 造一张牌：deck 0/1，rank 0-based(0=A,12=K)，suit */
const card = (copy, rank, suit) => copy * 52 + rank * 4 + suit;   // copy 0..7

// ════════ id 编码：两副牌取模 ════════
{
  assert.strictEqual(S.rk(card(0, 12, SP)), 12, '第一副 K♠ 的 rank');
  assert.strictEqual(S.rk(card(1, 12, SP)), 12, '⭐ 第二副 K♠ rank 也是 12（忘了 %52 会变 25）');
  assert.strictEqual(S.rk(card(7, 12, SP)), 12, '⭐ 第 8 副也一样（1 花色档要 8 副）');
  assert.strictEqual(S.st(card(1, 0, HE)), HE, '第二副 A♥ 花色仍是 ♥');
  assert.notStrictEqual(card(0, 12, SP), card(1, 12, SP), '两副的同一张牌 id 不同（不能互相顶替）');
  console.log('test-spider: 两副牌 id 编码 OK');
}

// ════════ 发牌：104 张不重不漏、三档花色、列型 6/6/6/6/5×6 ════════
{
  for (const suits of [1, 2, 4]) {
    const d = S.deal(2024, suits);
    const all = [...d.tableau.flatMap(t => t.cards), ...d.stock];
    assert.strictEqual(all.length, 104, `${suits} 花色：共 104 张`);
    assert.strictEqual(new Set(all).size, 104, '不重不漏');
    assert.strictEqual(d.stock.length, 50, '牌堆 50 张（5 次 ×10）');
    d.tableau.forEach((t, i) => {
      assert.strictEqual(t.cards.length, i < 4 ? 6 : 5, `第 ${i} 列张数`);
      assert.strictEqual(t.up, 1, '每列只有顶牌是明的');
    });
    const kinds = new Set(all.map(S.st));
    assert.strictEqual(kinds.size, suits, `${suits} 花色档就该只有 ${suits} 种花色`);
    // 每个「牌面」恰好出现 104/13/suits × ... —— 用点数计数校验：每个点数 8 张
    const byRank = {};
    all.forEach(id => { byRank[S.rk(id)] = (byRank[S.rk(id)] || 0) + 1; });
    Object.values(byRank).forEach(n => assert.strictEqual(n, 8, '每个点数 8 张（104/13）'));
  }
  // 可复现（与 deal.js 同一契约）
  assert.deepStrictEqual(S.deal(7, 4), S.deal(7, 4), '同 seed ⇒ 完全相同的牌局');
  assert.notDeepStrictEqual(S.deal(7, 4).stock, S.deal(8, 4).stock, '不同 seed ⇒ 不同牌局');
  console.log('test-spider: 发牌（104 张/三档花色/可复现）OK');
}

/** 造一个干净的 Spider 状态 */
const mkState = () => ({
  mode: 'spider', seed: 1, suits: 4,
  tableau: Array.from({ length: 10 }, () => ({ cards: [], up: 0 })),
  stock: [], foundations: [], score: 500, moves: [], won: false,
});

// ════════ 叠放不看花色，但搬动必须同花 ════════
{
  const s = mkState();
  s.tableau[0] = { cards: [card(0, 8, SP)], up: 1 };            // 9♠
  s.tableau[1] = { cards: [card(0, 7, HE)], up: 1 };            // 8♥（异花）
  assert(S.canToTableau(s, card(0, 7, HE), 0), '⭐ 8♥ 能叠到 9♠ 上（Spider 叠放不看花色）');
  assert(!S.canToTableau(s, card(0, 6, HE), 0), '7♥ 叠不到 9♠（点数必须差 1）');

  // 异花两张叠着 ⇒ 整体搬不动
  s.tableau[0] = { cards: [card(0, 8, SP), card(0, 7, HE)], up: 2 };
  assert(!S.isValidRun(s, 0, 0), '⭐ 9♠+8♥ 异花 ⇒ 不是可搬序列（叠得下≠搬得动）');
  assert(S.isValidRun(s, 0, 1), '单张 8♥ 本身可搬');
  s.tableau[0] = { cards: [card(0, 8, SP), card(0, 7, SP)], up: 2 };
  assert(S.isValidRun(s, 0, 0), '9♠+8♠ 同花连续 ⇒ 可整体搬');
  console.log('test-spider: 叠放不看花色 / 搬动必须同花 OK');
}

// ════════ 空列收任何牌 + 禁止整列搬到空列（空转）════════
{
  const s = mkState();
  s.tableau[0] = { cards: [card(0, 3, DI)], up: 1 };            // 4♦
  assert(S.canToTableau(s, card(0, 12, SP), 1), '空列收 K');
  assert(S.canToTableau(s, card(0, 0, HE), 1), '空列也收 A（不像 Klondike 只收 K）');
  const ms = S.legalMoves(s);
  assert.strictEqual(ms.filter(m => m.ti === 0 && !s.tableau[m.tj].cards.length).length, 0,
    '⭐ 整列（唯一一张）搬到空列 = 空转，必须禁掉');
  console.log('test-spider: 空列规则 + 禁空转 OK');
}

// ════════ ⭐ 复合动作①：发 10 张（有空列不许发）════════
{
  const s = mkState();
  for (let i = 0; i < 10; i++) s.tableau[i] = { cards: [card(0, 5, SP)], up: 1 };
  s.stock = Array.from({ length: 10 }, (_, i) => card(1, i, HE));
  const before = s.score;
  const ev = S.apply(s, { t: 'deal10' });
  assert(ev && ev.some(e => e.t === 'deal10'), '发牌成功');
  s.tableau.forEach(c => assert.strictEqual(c.cards.length, 2, '每列各 +1 张'));
  assert.strictEqual(s.stock.length, 0, '牌堆发空');
  assert.strictEqual(s.score, before - 1, '每走一步 −1（微软计分）');

  // 有空列 ⇒ 拒绝
  const s2 = mkState();
  s2.tableau[0] = { cards: [card(0, 5, SP)], up: 1 };            // 其余 9 列空
  s2.stock = [card(1, 1, HE)];
  assert.strictEqual(S.apply(s2, { t: 'deal10' }), null, '⭐ 有空列时不许发牌（微软规则）');
  console.log('test-spider: 发 10 张 + 有空列拒发 OK');
}

// ════════ ⭐ 复合动作②：凑齐 K→A 同花自动移走 + 露出的暗牌翻开 ════════
{
  const s = mkState();
  // 第 0 列：1 张暗牌 + K..2 同花（12 张明），再从别处搬 A 过来凑满 13
  const run = [];
  for (let r = 12; r >= 1; r--) run.push(card(0, r, SP));        // K♠..2♠
  s.tableau[0] = { cards: [card(1, 6, DI), ...run], up: 12 };    // 底下一张暗牌
  s.tableau[1] = { cards: [card(0, 0, SP)], up: 1 };             // A♠

  const ev = S.apply(s, { t: 'tt', ti: 1, idx: 0, tj: 0 });
  assert(ev, 'A♠ 搬到 2♠ 上');
  assert(ev.some(e => e.t === 'complete'), '⭐ 自动触发「完成一组」');
  assert.strictEqual(s.foundations.length, 1, '一组进 foundations');
  assert.strictEqual(s.foundations[0].length, 13, '整组 13 张');
  assert.strictEqual(s.tableau[0].cards.length, 1, '第 0 列只剩那张原暗牌');
  assert.strictEqual(s.tableau[0].up, 1, '⭐ 移走后露出的暗牌自动翻开');
  assert(ev.some(e => e.t === 'flip'), 'flip 事件也在同一个 move 里');
  assert.strictEqual(s.score, 500 - 1 + 100, '−1 步 +100 完成组');
  console.log('test-spider: 自动移走完成组（含翻暗牌/计分）OK');
}

// ════════ 异花 13 张不算完成（最容易写错的判定）════════
{
  const s = mkState();
  const run = [];
  for (let r = 12; r >= 0; r--) run.push(r === 5 ? card(0, r, HE) : card(0, r, SP));  // 中间混一张 ♥
  s.tableau[0] = { cards: run, up: 13 };
  assert.strictEqual(S.completedAt(s, 0), -1, '⭐ 混了花色的 13 张不算完成组');
  console.log('test-spider: 异花 13 张不算完成 OK');
}

// ════════ 赢局判定：8 组 ════════
{
  const s = mkState();
  s.foundations = Array.from({ length: 7 }, () => new Array(13).fill(0));
  assert(!S.isWon(s), '7 组还没赢');
  s.foundations.push(new Array(13).fill(0));
  assert(S.isWon(s), '8 组全清 = 赢');
  console.log('test-spider: 赢局判定 OK');
}

// ════════ 暗牌不能搬 ════════
{
  const s = mkState();
  s.tableau[0] = { cards: [card(0, 8, SP), card(0, 7, SP)], up: 1 };   // 只有末张明
  assert(!S.isValidRun(s, 0, 0), '⭐ 从暗牌起搬 = 非法');
  assert(S.isValidRun(s, 0, 1), '明牌那张可搬');
  console.log('test-spider: 暗牌不可搬 OK');
}

console.log('\ntest-spider: 全部通过');
