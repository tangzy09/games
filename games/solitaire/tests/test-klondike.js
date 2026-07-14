const assert = require('assert');
const Cards = require('../js/cards.js');
const Deal = require('../js/deal.js');
const R = require('../js/rules-klondike.js');
const Core = require('../js/core.js');

const { rankOf, suitOf, isRed } = Cards;
const card = (rank, suit) => rank * 4 + suit;      // rank 0-based: 0=A, 12=K
const S = 0, H = 1, C = 2, D = 3;

// ════════ 牌的表示 ════════
{
  assert.strictEqual(Cards.freshDeck().length, 52);
  assert.strictEqual(new Set(Cards.freshDeck()).size, 52, '52 张不重复');
  assert.strictEqual(rankOf(card(0, S)), 0);
  assert.strictEqual(suitOf(card(12, D)), D);
  assert(!isRed(card(5, S)) && !isRed(card(5, C)), '♠♣ 是黑');
  assert(isRed(card(5, H)) && isRed(card(5, D)), '♥♦ 是红');
  assert.strictEqual(Cards.str(card(0, S)), 'A♠');
  assert.strictEqual(Cards.str(card(12, H)), 'K♥');
  console.log('test-klondike: 牌表示 OK');
}

// ════════ ⭐ deal 是可复现的纯函数（整个设计的地基）════════
{
  const a = Deal.klondike(12345), b = Deal.klondike(12345);
  assert.deepStrictEqual(a, b, '同 seed ⇒ 完全相同的牌局');
  const c = Deal.klondike(12346);
  assert.notDeepStrictEqual(a.stock, c.stock, '不同 seed ⇒ 不同牌局');

  // 52 张牌不多不少、不重不漏
  const all = [...a.tableau.flatMap(t => t.cards), ...a.stock];
  assert.strictEqual(all.length, 52);
  assert.strictEqual(new Set(all).size, 52, '发牌不重不漏');

  // 7 列：1,2,3,4,5,6,7 张；每列只有 1 张明牌
  a.tableau.forEach((t, i) => {
    assert.strictEqual(t.cards.length, i + 1, `第 ${i} 列 ${i + 1} 张`);
    assert.strictEqual(t.up, 1, '只有顶牌是明的');
  });
  assert.strictEqual(a.stock.length, 24, 'stock 24 张');

  // ⚠ 绝不能有 Math.random 进 deal（存档/牌局编号/可解池全靠它可复现）
  const src = require('fs').readFileSync(require('path').join(__dirname, '../js/deal.js'), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/Math\.random/.test(code.replace(/randomSeed[\s\S]*?\}/, '')),
    'shuffle/klondike 里绝不能有 Math.random（只有 randomSeed 可以）');
  console.log('test-klondike: deal 可复现（纯函数）OK');
}

// ════════ 基本规则 ════════
{
  const s = Core.newGame(1, 3);
  // 空 foundation 只接 A
  assert(R.canToFoundation(s, card(0, S), S), '空 foundation 接 A♠');
  assert(!R.canToFoundation(s, card(1, S), S), '空 foundation 不接 2♠');
  assert(!R.canToFoundation(s, card(0, S), H), 'A♠ 不能进 ♥ 的 foundation');
  s.foundations[S] = [card(0, S)];
  assert(R.canToFoundation(s, card(1, S), S), 'A♠ 上接 2♠');
  assert(!R.canToFoundation(s, card(2, S), S), '不能跳级');

  // 空列只放 K
  s.tableau[0] = { cards: [], up: 0 };
  assert(R.canToTableau(s, card(12, S), 0), '空列放 K');
  assert(!R.canToTableau(s, card(11, S), 0), '空列不放 Q');

  // 交替色降序
  s.tableau[1] = { cards: [card(7, S)], up: 1 };     // 8♠（黑）
  assert(R.canToTableau(s, card(6, H), 1), '8♠ 上接 7♥（红，小 1）');
  assert(!R.canToTableau(s, card(6, C), 1), '8♠ 上不能接 7♣（同色）');
  assert(!R.canToTableau(s, card(5, H), 1), '8♠ 上不能接 6♥（不连续）');
  console.log('test-klondike: 基本规则（空列只放K/交替色降序/foundation同花升序）OK');
}

// ════════ ⭐ autoplay 安全判定：rank ≤ 2 必须无条件安全（红队抓出的真 bug）════════
{
  const s = Core.newGame(1, 3);
  // A 和 2 无条件安全 —— 黑 2 收走后没有任何牌需要它承接（红 A 直接进 foundation）
  assert(R.isSafeToAutoPlay(s, card(0, S)), 'A♠ 无条件安全');
  assert(R.isSafeToAutoPlay(s, card(1, S)), '⭐ 2♠ 无条件安全（经典规则在这里过于保守 = 真 bug）');
  assert(R.isSafeToAutoPlay(s, card(1, H)), '2♥ 同理');

  // 3 就要看异色两门了：黑 3 需要两个红 foundation 都到 2
  assert(!R.isSafeToAutoPlay(s, card(2, S)), '3♠：红门还没到 2 ⇒ 不安全（红 2 可能还要落在它上面）');
  s.foundations[H] = [card(0, H), card(1, H)];       // ♥ 到 2
  assert(!R.isSafeToAutoPlay(s, card(2, S)), '只有一门红到 2 ⇒ 仍不安全');
  s.foundations[D] = [card(0, D), card(1, D)];       // ♦ 也到 2
  assert(R.isSafeToAutoPlay(s, card(2, S)), '两门红都到 2 ⇒ 3♠ 安全');
  console.log('test-klondike: autoplay 安全判定（含 rank≤2 无条件安全）OK');
}

// ════════ ⭐ draw-3 的回收**保序**（这一条直接改变可解率，必须与 solver 一致）════════
{
  const s = Core.newGame(7, 3);
  const stock0 = s.stock.slice();

  // 翻完整个 stock
  const drawn = [];
  while (s.stock.length) {
    const ev = Core.apply(s, { t: 'draw' });
    ev.filter(e => e.t === 'draw').forEach(e => drawn.push(...e.cards));
  }
  assert.strictEqual(s.waste.length, 24, '24 张全进 waste');
  assert.strictEqual(drawn.length, 24);

  // 回收
  assert(Core.apply(s, { t: 'recycle' }), '可以回收');
  assert.strictEqual(s.waste.length, 0);
  assert.strictEqual(s.stock.length, 24);
  assert.deepStrictEqual(s.stock, stock0,
    '⭐ 回收后 stock 与初始完全一致 ⇒ 下一轮翻牌顺序与第一轮相同（保序）');

  // 回收扣分：draw-3 每次 −20
  const s1 = Core.newGame(7, 1);
  while (s1.stock.length) Core.apply(s1, { t: 'draw' });
  const before = s1.score;
  Core.apply(s1, { t: 'recycle' });
  assert.strictEqual(s1.score, Math.max(0, before - 100), 'draw-1 回收 −100');
  console.log('test-klondike: draw-3 回收保序 + 扣分 OK');
}

// ════════ ⭐ 撤销 = 重放（存档只存 seed + moves）════════
{
  const s = Core.newGame(2024, 3);
  // 走几步合法移动
  const path = [];
  let cur = s;
  for (let k = 0; k < 8; k++) {
    const ms = R.legalMoves(cur);
    if (!ms.length) break;
    const m = ms[0];
    Core.apply(cur, m);
    path.push(m);
  }
  assert(cur.moves.length >= 1, '走了几步');
  const snapshot = JSON.stringify({ t: cur.tableau, w: cur.waste, f: cur.foundations, sc: cur.score });

  // 撤销一步
  const back = Core.undo(cur);
  assert(back, '撤销成功');
  assert.strictEqual(back.moves.length, cur.moves.length - 1, '少了一步');
  assert(back.usedUndo, '⭐ 用过撤销要留痕（「零撤销胜率」靠它）');

  // 重放回去 ⇒ 与撤销前逐字段一致
  const redo = Core.replay(cur.seed, cur.drawCount, cur.moves);
  const snap2 = JSON.stringify({ t: redo.tableau, w: redo.waste, f: redo.foundations, sc: redo.score });
  assert.strictEqual(snap2, snapshot, '⭐ 同 seed + 同 move list ⇒ 完全相同的盘面（存档方案成立的前提）');
  console.log('test-klondike: 撤销=重放 + 存档可复现 OK');
}

// ════════ ⭐ 非法 move list 必须被拒（verify-deals.js 的地基）════════
{
  const s = Core.newGame(5, 3);
  const bad = [{ t: 'wf', fi: 0 }];                 // waste 是空的，这步非法
  assert.strictEqual(Core.replay(5, 3, bad), null,
    '⭐ 任何一步非法 ⇒ 整条 move list 无效（solver 的解就是靠这个验证的）');
  console.log('test-klondike: 非法 move list 被拒 OK');
}

// ════════ 赢局判定 ════════
{
  const s = Core.newGame(3, 3);
  assert(!R.isWon(s));
  for (let fi = 0; fi < 4; fi++) s.foundations[fi] = Array.from({ length: 13 }, (_, r) => r * 4 + fi);
  assert(R.isWon(s), '52 张全进 foundation ⇒ 赢');
  console.log('test-klondike: 赢局判定 OK');
}

// ════════ 合法移动枚举不产生死循环（K 在空列间来回搬）════════
{
  const s = Core.newGame(9, 3);
  s.tableau[0] = { cards: [12 * 4 + S], up: 1 };    // 只有 K♠ 的一列
  s.tableau[1] = { cards: [], up: 0 };              // 空列
  const ms = R.legalMoves(s);
  const kingShuffle = ms.filter(m => m.t === 'tt' && m.ti === 0 && m.tj === 1);
  assert.strictEqual(kingShuffle.length, 0,
    '⭐ 整列的 K 搬到另一个空列 = 无意义空转，必须禁掉（否则 solver 会绕圈）');
  console.log('test-klondike: 禁止 K 空列空转 OK');
}
