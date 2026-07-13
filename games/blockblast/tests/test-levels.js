const assert = require('assert');
const Core = require('../js/core.js');
const Levels = require('../js/levels.js');
const Pieces = require('../js/pieces.js');

const P = id => Pieces.byId(id);

// ════════ 关卡数据校验（第一道防线：构建期就不许有软锁死的关）════════
const errs = Levels.validate();
assert.deepStrictEqual(errs, [], '关卡表必须零错误:\n' + errs.join('\n'));
assert(Levels.count() >= 20, `至少 20 关，实际 ${Levels.count()}`);
console.log(`test-levels: ${Levels.count()} 关，数据校验 0 错 OK`);

// validate 真的能抓出软锁死（不能是摆设）
{
  const bad = [{ id: 99, stones: [[3, 0], [0, 5]], crystals: [[3, 5, 'blue']] }];  // 行3有石块、列5有石块 → 水晶(3,5)死了
  const e = Levels.validate(bad);
  assert(e.length && e[0].includes('软锁死'), 'validate 必须抓出「行列都被石块封的水晶」');
  const ok = Levels.validate([{ id: 98, stones: [[3, 0]], crystals: [[5, 5, 'blue']] }]);
  assert.deepStrictEqual(ok, [], '只有行被封、列没被封 → 合法（那颗水晶还能靠消列拿到）');
  console.log('test-levels: validate 真能抓软锁死 OK');
}

// ════════ 石块：占格 + 含石块的行/列永远消不掉 ════════
{
  const s = Core.newLevel({ id: 1, stones: [[7, 0]], crystals: [[0, 0, 'blue']] }, 1);
  assert.strictEqual(s.stone[Core.idx(7, 0)], 1);
  assert.strictEqual(s.board[Core.idx(7, 0)], 1, '石块占格');
  assert(!Core.canPlace(s.board, P('i1'), 7, 0), '不能放在石块上');

  // 把第 7 行其余 7 格填满 → 整行「看起来」满了，但因为含石块，**不许消**
  for (let c = 1; c < 8; c++) s.board[Core.idx(7, c)] = 1;
  const f = Core.findFullLines(s.board, s.stone);
  assert.deepStrictEqual(f.rows, [], '含石块的行永远不算满 —— 这是石块作为空间约束的全部意义');
  // 同一盘面若不传 stone（无尽模式）就会被判满 —— 证明差异确实来自 stone
  assert.deepStrictEqual(Core.findFullLines(s.board).rows, [7], '不传 stone 时（无尽模式）行为不变');
  console.log('test-levels: 石块占格 + 封锁整行 OK');
}

// ════════ 水晶：只有被消除时才收集（关卡模式的全部乐趣来源）════════
// ⚠ 之前这两条写成「如果这一手恰好有 1×1 就测，否则 SKIP」—— 结果 seed 11 要到第 23 手才出 i1，
//   于是 P2 最核心的两条断言**一次都没执行过**。有 SKIP 分支的测试等于没有测试。
//   改法：前推 streamIndex 找到含 1×1 的那一手（块流是纯函数，这么做完全确定）。
function seekPieceInTray(s, pieceId) {
  for (let k = 0; k < 500; k++) {
    s.streamIndex = k * 3;
    s.placed = [false, false, false];
    const slot = Core.tray(s).findIndex(p => p && p.id === pieceId);
    if (slot >= 0) return slot;
  }
  throw new Error('块流里找不到 ' + pieceId);
}
{
  const def = { id: 2, blocks: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], crystals: [[7, 7, 'blue']] };
  const s = Core.newLevel(def, 7);
  assert.deepStrictEqual(s.goals, { blue: 1 }, '目标 = 盘上水晶总数（不可能凑不齐）');
  assert.strictEqual(s.board[Core.idx(7, 7)], 1, '水晶长在方块上');

  // 第 7 行现在是满的（blocks 0-6 + 水晶 7）——挖掉 (7,3)，用 1×1 补回去 ⇒ 消行 ⇒ 收集 ⇒ 胜利
  s.board[Core.idx(7, 3)] = 0;
  const slot = seekPieceInTray(s, 'i1');
  const evs = Core.place(s, slot, 7, 3);
  assert(evs, '落子成功');
  const collect = evs.find(e => e.t === 'collect');
  assert(collect, '消行时抛 collect 事件');
  assert.strictEqual(collect.gained[0].kind, 'blue');
  assert.strictEqual(s.collected.blue, 1, '水晶被收集');
  assert.strictEqual(s.crystal[Core.idx(7, 7)], null, '收集后水晶从盘上消失');
  const win = evs.find(e => e.t === 'win');
  assert(win, '目标达成 ⇒ win 事件');
  assert(s.won && s.over);
  assert(win.stars >= 1 && win.stars <= 3);
  console.log('test-levels: 水晶只在消行时收集 + win 事件 OK（不再 SKIP）');

  // 反例：不消行 ⇒ 绝不收集
  // ⚠ 用一个**开局不满行**的 def：上面那个 def 的第 7 行开局就是满的（7 block + 1 水晶 = 8 格），
  //   于是在任何地方落一子都会触发消行、把水晶收走（规则没错——行满就消，与落子位置无关；
  //   是测试数据造错了）。这也是关卡设计的一条隐性约束：**开局盘面不许有已填满的行/列**。
  const def2 = { id: 3, blocks: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], crystals: [[7, 7, 'blue']] };
  const s2 = Core.newLevel(def2, 7);               // 第 7 行差 (7,6)，开局不满
  assert.deepStrictEqual(Core.findFullLines(s2.board, s2.stone).rows, [], '开局没有满行');
  const slot2 = seekPieceInTray(s2, 'i1');
  Core.place(s2, slot2, 0, 0);                     // 空地落子，不可能消行
  assert.strictEqual(s2.collected.blue, 0, '没消行 ⇒ 不收集');
  assert(!s2.won);
  console.log('test-levels: 不消行绝不收集 OK');
}

// ════════ SWEEP 的 left/before 必须排除石块（否则含石块的关永远触发不了）════════
{
  const s = Core.newLevel({ id: 3, stones: [[0, 0], [0, 1]], crystals: [[5, 5, 'blue']] }, 3);
  const raw = Core.fillCount(s.board);          // 含石块
  const lvl = Core.levelFill(s);                // 不含石块
  assert.strictEqual(raw - lvl, 2, 'levelFill 把 2 个石块排除掉了');
  // 若用 raw 当 left，含石块的关 left 永远 ≥ 2，PERFECT 永远不可能 —— 这正是要排除的原因
  assert(Core.sweepOf(0, 20), 'left=0（石块不计）时 PERFECT 可达');
  console.log('test-levels: SWEEP 排除石块 OK');
}

// ════════ ⚠ 不可胜检测（运行时兜底，红队 F4）════════
{
  // 行和列都被石块封的水晶 —— 正常关卡里 validate 会拦，这里手工构造来测运行时兜底
  const s = Core.newLevel({ id: 4, crystals: [[3, 5, 'blue']] }, 4);
  assert(!Core.isUnwinnable(s), '正常关：可胜');
  s.stone[Core.idx(3, 0)] = 1; s.board[Core.idx(3, 0)] = 1;   // 封住第 3 行
  assert(!Core.isUnwinnable(s), '只封了行 ⇒ 还能靠消第 5 列拿到 ⇒ 仍可胜');
  s.stone[Core.idx(0, 5)] = 1; s.board[Core.idx(0, 5)] = 1;   // 再封住第 5 列
  assert(Core.isUnwinnable(s), '行列都封 ⇒ 那颗水晶永远拿不到 ⇒ 不可胜（必须判负 + 免费重开）');

  // 水晶已被收集后，不该再判不可胜
  s.crystal[Core.idx(3, 5)] = null;
  assert(!Core.isUnwinnable(s), '水晶已收集 ⇒ 不再算不可胜');
  console.log('test-levels: 不可胜检测 OK（软锁死的运行时兜底）');
}

// ════════ 三星：按落子数（不限步，但要三星就得省步）════════
{
  const s = Core.newLevel({ id: 5, par: 10, crystals: [[0, 0, 'blue']] }, 5);
  s.stats.turns = 10; assert.strictEqual(Core.starsFor(s), 3, '≤ par → 三星');
  s.stats.turns = 14; assert.strictEqual(Core.starsFor(s), 2, '≤ 1.4×par → 两星');
  s.stats.turns = 15; assert.strictEqual(Core.starsFor(s), 1);
  console.log('test-levels: 三星评级 OK');
}

// ════════ 撤销必须把已收集的水晶「吐回来」（且把 win 状态一起回滚）════════
{
  const def = { id: 6, blocks: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], crystals: [[7, 6, 'blue'], [7, 7, 'pink']] };
  const s = Core.newLevel(def, 11);
  s.board[Core.idx(7, 2)] = 0;                     // 第 7 行差一格
  const slot = seekPieceInTray(s, 'i1');
  const evs = Core.place(s, slot, 7, 2);
  assert(evs.find(e => e.t === 'collect'), '消行收集');
  assert.strictEqual(s.collected.blue, 1);
  assert.strictEqual(s.collected.pink, 1);
  assert(s.won, '两颗水晶都收齐 ⇒ 过关');

  assert(Core.undo(s), '撤销成功');
  assert.strictEqual(s.collected.blue, 0, '撤销后已收集数回退');
  assert.strictEqual(s.crystal[Core.idx(7, 6)], 'blue', '撤销后水晶回到盘上');
  assert.strictEqual(s.crystal[Core.idx(7, 7)], 'pink');
  assert.strictEqual(s.board[Core.idx(7, 2)], 0, '棋盘回到落子前');
  assert(!s.won && !s.over, '撤销把 win/over 一起回滚（否则会卡在结算浮层）');
  assert(s.usedUndo, '用过撤销要留痕 ⇒ 最高两星');
  assert(Core.starsFor(s) <= 2, '用过撤销 ⇒ 拿不到三星');
  console.log('test-levels: 撤销吐回水晶 + 回滚 win + 降星 OK（不再 SKIP）');
}

// ════════ 无尽模式完全不受关卡逻辑影响（回归）════════
{
  const s = Core.newGame(123);
  assert.strictEqual(s.mode, 'endless');
  assert.strictEqual(s.stone, null);
  assert(!Core.isUnwinnable(s));
  assert(!Core.goalsMet(s));
  const before = Core.fillCount(s.board);
  Core.place(s, 0, 0, 0);
  assert(Core.fillCount(s.board) > before, '无尽模式照常落子');
  console.log('test-levels: 无尽模式回归 OK');
}
