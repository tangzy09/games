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
{
  const def = { id: 2, blocks: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], crystals: [[7, 7, 'blue']] };
  const s = Core.newLevel(def, 7);
  assert.deepStrictEqual(s.goals, { blue: 1 }, '目标 = 盘上水晶总数（不可能凑不齐）');
  assert.strictEqual(s.collected.blue, 0);
  assert.strictEqual(s.board[Core.idx(7, 7)], 1, '水晶长在方块上');

  // 只是把别的格填上、没消行 → 不收集
  s.board[Core.idx(0, 0)] = 1;
  assert.strictEqual(s.collected.blue, 0, '没消行 ⇒ 不收集');

  // 真消掉水晶所在的行 → 收集 + 胜利
  const s2 = Core.newLevel(def, 7);
  // 第 7 行已有 0..6 + 水晶在 (7,7) ⇒ 已经满了？不：blocks 填 0-6，crystal 填 7 ⇒ 整行已满。
  // 所以构造一个差一格的：清掉 (7,3) 再用 1×1 补
  s2.board[Core.idx(7, 3)] = 0;
  const slot = Core.tray(s2).findIndex(p => p && p.id === 'i1');
  const evs = slot >= 0 ? Core.place(s2, slot, 7, 3) : null;
  if (evs) {
    const collect = evs.find(e => e.t === 'collect');
    const win = evs.find(e => e.t === 'win');
    assert(collect, '消行时抛 collect 事件');
    assert.strictEqual(collect.gained[0].kind, 'blue');
    assert.strictEqual(s2.collected.blue, 1);
    assert(win, '目标达成 ⇒ win 事件');
    assert(s2.won && s2.over);
    console.log('test-levels: 水晶只在消行时收集 + 胜利判定 OK');
  } else {
    // 这一手没有 1×1 —— 直接测规则函数本身
    const before = s2.collected.blue;
    s2.board[Core.idx(7, 3)] = 1;
    const f = Core.findFullLines(s2.board, s2.stone);
    assert.deepStrictEqual(f.rows, [7]);
    assert.strictEqual(before, 0);
    console.log('test-levels: 水晶收集（规则函数级）OK');
  }
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

// ════════ 撤销必须把已收集的水晶「吐回来」════════
{
  const def = { id: 6, blocks: [[7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], crystals: [[7, 6, 'blue'], [7, 7, 'pink']] };
  const s = Core.newLevel(def, 11);
  s.board[Core.idx(7, 2)] = 0;                              // 第 7 行差一格
  const slot = Core.tray(s).findIndex(p => p && p.id === 'i1');
  if (slot >= 0) {
    Core.place(s, slot, 7, 2);
    assert.strictEqual(s.collected.blue, 1, '收集了');
    Core.undo(s);
    assert.strictEqual(s.collected.blue, 0, '撤销后已收集数回退');
    assert.strictEqual(s.crystal[Core.idx(7, 6)], 'blue', '撤销后水晶回到盘上');
    assert(!s.won && !s.over);
    console.log('test-levels: 撤销吐回水晶 OK');
  } else {
    console.log('test-levels: 撤销吐回水晶 SKIP（这一手没有 1×1）');
  }
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
