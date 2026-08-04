// ════════════════════════════════════════
// test-state.js —— `js/state.js` 的门禁。
//
// state.js 很薄，但它是**存档 / 撤销 / 复盘 / 分享的唯一入口**（DESIGN §9.3）：
// 存的是「先后手 + 手数列表」，不是局面快照栈。一个决定同时兑现四件事 ——
// 撤销（重放到 n−1）· 中断恢复 · 「从第 N 步重来」· 一条 URL 分享整局。
// 所以这里每一条断言守的都不是「函数返回值对不对」，而是那四件事之一还成不成立。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const AI = require('../js/ai.js');
const St = require('../js/state.js');

// --- 新局：交替先手（DESIGN §1.1 第 2 条）---
{
  const a = St.newGame({ mode: 'human', gameNo: 0 });
  const b = St.newGame({ mode: 'human', gameNo: 1 });
  assert.strictEqual(a.humanFirst, true);
  assert.strictEqual(b.humanFirst, false, '⛔ 同机双人必须每局交替先手——零运气对局里先手是硬优势，而这游戏没有运气可以背锅');
}

// --- 落子 → 手数列表增长；盘面由手数列表重建 ---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  g = St.play(g, 3); g = St.play(g, 3); g = St.play(g, 4);
  assert.deepStrictEqual(g.moves, [3, 3, 4]);
  assert.strictEqual(St.boardOf(g).n, 3);
}

// --- ⭐ 撤销 = 重放到 n-1，不是快照栈 ---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4, 4, 2]) g = St.play(g, c);
  const before = JSON.stringify(St.boardOf(g));
  g = St.undo(g);
  assert.deepStrictEqual(g.moves, [3, 3, 4, 4]);
  g = St.play(g, 2);
  assert.strictEqual(JSON.stringify(St.boardOf(g)), before, '撤销后重走同一列必须回到同一个盘面');
}
{
  const g = St.newGame({ mode: 'human', gameNo: 0 });
  assert.deepStrictEqual(St.undo(g).moves, [], '空局撤销必须是 no-op，不许炸也不许出负数');
}

// --- ⭐ 从第 N 步重来（复盘的「从这一步重来」，DESIGN §3.3）---
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4, 4, 2, 2]) g = St.play(g, c);
  const g2 = St.rewindTo(g, 3);
  assert.deepStrictEqual(g2.moves, [3, 3, 4]);
  assert.strictEqual(g2.humanFirst, g.humanFirst, '重来不许改先后手');
}

// --- 存档往返 ---
{
  let g = St.newGame({ mode: 'ai', tier: 12, gameNo: 5 });
  for (const c of [3, 3, 4]) g = St.play(g, c);
  const s = St.serialize(g);
  assert.strictEqual(typeof s, 'string');
  const back = St.deserialize(s);
  assert.deepStrictEqual(back.moves, g.moves);
  assert.strictEqual(back.tier, 12);
  assert.strictEqual(back.humanFirst, g.humanFirst);
  assert.strictEqual(back.seed, g.seed, 'seed 必须存，否则 AI 重放不出同一局');
}

// --- ⛔ 版本不符必须丢弃，绝不迁移（root CLAUDE.md 铁律）---
{
  const s = JSON.parse(St.serialize(St.newGame({ mode: 'ai', tier: 8, gameNo: 0 })));
  s.v = St.SAVE_VERSION + 1;
  assert.strictEqual(St.deserialize(JSON.stringify(s)), null, '版本不符必须返回 null（丢弃），不许迁移');
  assert.strictEqual(St.deserialize('not json'), null);
  assert.strictEqual(St.deserialize(JSON.stringify({ v: St.SAVE_VERSION, moves: [99] })), null,
    '非法手数列表必须整份丢弃（fromMoves 会抛，别让它逃出去）');
}

// --- ⭐ 参数表指纹要进存档（DESIGN §11b 第 4 条）---
{
  const g = St.newGame({ mode: 'ai', tier: 12, gameNo: 0 });
  assert.ok(g.paramsHash, '存档必须记 AI.paramsDigest().hash —— 否则换过难度参数后复盘会静默对不上');
  const back = St.deserialize(St.serialize(g));
  assert.strictEqual(back.paramsHash, g.paramsHash);
}

console.log('test-state: 规格用例（交替先手 / 撤销 / 重来 / 往返 / 版本 / 指纹）OK');

// ════════════════════════════════════════════════════════════════════
// 以下是补充用例。上面那批钉的是「功能在」，下面这批钉的是「它在真实误用下不会静默出错」。
// ════════════════════════════════════════════════════════════════════

// ════════ ⭐ play 对非法列**抛错**，不吞（与 B.play / AI.checkTier 同一条纪律）════════
// ⚠ 判据不是「哪种写法优雅」，是**谁在调**：
//   · St.play 的调用方是我们自己的 UI（列号由点击命中区算出来）⇒ 非法列 = 程序 bug。
//     静默吞掉会变成「点了没反应」，而真正的 bug（命中区算错、AI 返回了满列）零报错地活下去。
//   · deserialize 的调用方是 localStorage / 分享 URL（外部、不可信）⇒ 那一侧必须**只返回 null**，
//     绝不抛。两侧纪律相反是**故意的**，别为了「一致」把哪一边改掉。
{
  const g0 = St.newGame({ mode: 'human', gameNo: 0 });
  for (const bad of [-1, 7, 7.5, '3', null, undefined, NaN]) {
    assert.throws(() => St.play(g0, bad), /列|column/,
      '非法列 ' + String(bad) + ' 必须抛错（吞掉 = 命中区算错时零报错）');
  }
  // 满列：连下 6 次同一列后第 7 次必须抛
  let g = g0;
  for (let i = 0; i < 6; i++) g = St.play(g, 0);
  assert.throws(() => St.play(g, 0), /满|full/, '满列必须抛');
  // ⭐ 但 UI 有一条**不抛**的路可以先问：canPlay 永远只回 true/false
  assert.strictEqual(St.canPlay(g, 0), false, '满列 canPlay=false');
  assert.strictEqual(St.canPlay(g, 1), true);
  for (const bad of [-1, 7, 7.5, '3', null, undefined, NaN]) {
    assert.strictEqual(St.canPlay(g0, bad), false, 'canPlay 对非法输入只返回 false，不许抛');
  }
  console.log('test-state: ⭐ play 非法列/满列抛错、canPlay 永不抛 OK');
}

// ════════ ⭐ 已分胜负的局面不许再落子 ════════
// 手数列表是唯一真相 ⇒ 终局之后多存进去的那一手会让**每一次重放**都走过终局线，
// 复盘的胜负曲线、妙手判定、分享 URL 全部跟着错，而且零报错。
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 4, 3, 4, 3, 4, 3]) g = St.play(g, c);   // 先手 c3 竖四连
  assert.ok(R.isWin(R.terminal(St.boardOf(g))), '前提：这条线必须真的是胜局');
  assert.strictEqual(St.isOver(g), true);
  assert.throws(() => St.play(g, 0), /终局|over/, '终局后落子必须抛');
  assert.strictEqual(St.canPlay(g, 0), false, '终局后 canPlay 必须全 false');
  // ⚠ 但撤销/重来在终局上必须照常可用 —— 「从这一步重来」正是从结算页点的
  assert.deepStrictEqual(St.undo(g).moves, [3, 4, 3, 4, 3, 4]);
  assert.deepStrictEqual(St.rewindTo(g, 2).moves, [3, 4]);
  console.log('test-state: ⭐ 终局后不许落子，但撤销/重来照常 OK');
}

// ════════ rewindTo 边界：n=0 / n>len / 负数 / 非整数 ════════
{
  let g = St.newGame({ mode: 'human', gameNo: 4 });
  for (const c of [3, 3, 4, 4, 2, 2]) g = St.play(g, c);
  assert.deepStrictEqual(St.rewindTo(g, 0).moves, [], 'n=0 = 回到开局（不是「保留第 0 手」）');
  assert.deepStrictEqual(St.rewindTo(g, 6).moves, [3, 3, 4, 4, 2, 2], 'n=len 是 no-op');
  // ⚠ 「no-op」指内容不变，**不是**把同一个数组交出去：早退优化（k===len 就 return g）会让
  //   重来后的 G 与原 G 共享 moves ⇒ 之后往新 G 落子会把「历史」那一份一起改掉，零报错。
  assert.notStrictEqual(St.rewindTo(g, g.moves.length).moves, g.moves, 'n=len 也必须给新数组');
  assert.notStrictEqual(St.rewindTo(g, g.moves.length), g, 'n=len 也必须给新对象');
  assert.deepStrictEqual(St.rewindTo(g, 99).moves, [3, 3, 4, 4, 2, 2], 'n>len 夹到 len（复盘滑杆的边）');
  assert.deepStrictEqual(St.rewindTo(g, -5).moves, [], '负数夹到 0');
  // ⚠ 越界只是滑杆走到头（夹住），但**类型错**是程序 bug（抛）—— 与 play 同一条判据
  for (const bad of ['3', null, undefined, NaN, 2.5]) {
    assert.throws(() => St.rewindTo(g, bad), /整数|integer/, 'rewindTo 的 n 必须是整数：' + String(bad));
  }
  // 重来只动 moves，别的字段一个都不许变
  const g2 = St.rewindTo(g, 3);
  assert.deepStrictEqual({ ...g2, moves: null }, { ...g, moves: null },
    '重来不许改 seed / tier / gameNo / humanFirst / paramsHash（改了 = AI 重放不出同一局）');
  console.log('test-state: rewindTo 边界（0 / len / 越界夹住 / 类型抛错 / 只动 moves）OK');
}

// ════════ ⭐ 纯函数：play / undo / rewindTo 不许就地改 ════════
// 撤销靠的是「旧 g 还在」，一处就地改就会让复盘的历史被未来污染。
{
  const g0 = St.newGame({ mode: 'human', gameNo: 0 });
  const snap0 = JSON.stringify(g0);
  const g1 = St.play(g0, 3);
  assert.strictEqual(JSON.stringify(g0), snap0, 'play 不许改入参');
  assert.notStrictEqual(g1, g0);
  assert.notStrictEqual(g1.moves, g0.moves, 'moves 必须是新数组（共享数组 = 撤销把历史一起改了）');
  const g2 = St.play(g1, 4);
  g2.moves.push(999);                              // 外部乱改新对象
  assert.deepStrictEqual(g1.moves, [3], '不同代 G 之间不许共享 moves 数组');
  const g3 = St.rewindTo(g1, 0);
  assert.deepStrictEqual(g1.moves, [3], 'rewindTo 不许改入参');
  assert.notStrictEqual(g3.moves, g1.moves);
  console.log('test-state: ⭐ play/undo/rewindTo 纯函数、moves 不共享 OK');
}

// ════════ ⭐ boardOf 每次重建 ⇒ 返回的盘面互相独立 ════════
// 一旦为了「省一点」缓存盘面，撤销之后拿到的就是上一手的盘 —— 这正是快照栈那套方案的病。
{
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4]) g = St.play(g, c);
  const b1 = St.boardOf(g), b2 = St.boardOf(g);
  assert.notStrictEqual(b1, b2, 'boardOf 必须每次重建（⛔ 不许缓存）');
  assert.notStrictEqual(b1.a, b2.a);
  assert.notStrictEqual(b1.h, b2.h);
  assert.notStrictEqual(b1.mv, b2.mv);
  assert.deepStrictEqual(b1, b2);
  b1.a[0] = 63; b1.h[0] = 6; b1.mv.push(0); b1.n = 99;   // 蹂躏第一个
  assert.deepStrictEqual(St.boardOf(g), b2, '改一个盘面不许影响下一次 boardOf');
  // 手数列表也不许被盘面借走
  const g4 = St.play(g, 4);
  St.boardOf(g4).mv.push(5);
  assert.deepStrictEqual(g4.moves, [3, 3, 4, 4], 'boardOf 返回的 mv 不许是 g.moves 本体');
  console.log('test-state: ⭐ boardOf 每次重建、互相独立 OK');
}

// ════════ ⭐ serialize 的产物里不许有 undefined 字段 ════════
// JSON.stringify 会**静默丢掉** undefined 值的键 ⇒ 往返之后字段消失而不报错，
// 下一次读档时 `g.tier` 是 undefined，AI 档位静默变成「没选」。
{
  for (const opts of [{ mode: 'human', gameNo: 0 }, { mode: 'ai', tier: 20, gameNo: 3 }]) {
    const g = St.newGame(opts);
    for (const k of Object.keys(g)) {
      assert.notStrictEqual(g[k], undefined, 'newGame(' + JSON.stringify(opts) + ') 的字段 ' + k + ' 是 undefined');
    }
    const parsed = JSON.parse(St.serialize(g));
    assert.deepStrictEqual(Object.keys(parsed).sort(), Object.keys(g).sort(),
      'serialize 丢了字段（多半是某个字段是 undefined 被 JSON.stringify 静默吃掉）');
    // ⭐ 往返必须**逐字段无损**（不只是测试点名的那几个）
    assert.deepStrictEqual(St.deserialize(St.serialize(g)), g, '存档往返必须逐字段无损');
  }
  // human 局的 tier 必须是实打实的 null（不是 undefined）
  assert.strictEqual(St.newGame({ mode: 'human', gameNo: 0 }).tier, null);
  console.log('test-state: ⭐ serialize 无 undefined 字段、往返逐字段无损 OK');
}

// ════════ ⭐ serialize 自校验：**存得进 ⇒ 必须读得回** ════════
// 这是本文件那条纪律唯一漏掉对称的地方：newGame/play/rewindTo 对非法入参一律当场抛，
// 而 serialize 曾对一个坏掉的 G 照写不误，deserialize 那头却一定拒收 ⇒
// **玩家看到「已保存」，下次进来存档没了，零报错**。
{
  let g = St.newGame({ mode: 'ai', tier: 12, gameNo: 0 });
  for (const c of [3, 4, 3, 4, 3, 4, 3]) g = St.play(g, c);   // 先手已胜（合法，最后一手就是制胜手）
  assert.ok(St.serialize(g), '正常的终局存档必须存得下（别把自校验写成一律拒收）');
  const broken = [
    { ...g, moves: g.moves.concat([0, 1]) },        // 终局之后还有手（play 拦得住，但直接改 G 拦不住）
    { ...g, moves: [0, 0, 0, 0, 0, 0, 0] },         // 满列
    { ...g, tier: 999 },
    { ...g, gameNo: -5 },
    { ...g, humanFirst: 'yes' },
    { ...g, seed: 0x80000000 },
    { ...g, mode: 'AI' },
    { ...g, paramsHash: '' }
  ];
  for (const bad of broken) {
    assert.throws(() => St.serialize(bad), /存得进读不回|serialize/,
      'serialize 必须拒绝一个 deserialize 读不回的 G：' + JSON.stringify(bad).slice(0, 70));
  }
  console.log('test-state: ⭐ serialize 自校验（存得进必读得回）拦下 ' + broken.length + ' 类坏 G OK');
}

// ════════ 交替先手：连续多局的先手序列 ════════
{
  const seq = [];
  for (let n = 0; n < 6; n++) seq.push(St.newGame({ mode: 'human', gameNo: n }).humanFirst);
  assert.deepStrictEqual(seq, [true, false, true, false, true, false], 'gameNo 递增必须严格交替');
  // ⭐⭐ 顶档**默认**就必须让玩家先手（DESIGN §1.1 第 1 条：后手对完美 AI 是**数学上的必败**）。
  //    ⛔ 这条不许留给 UI「记得传 humanFirst」—— 漏传一次就是每两局送一局「凭定义赢不了」的
  //      差评制造机，而且零报错。所以断言的是**默认行为**，不是「允许覆盖」。
  for (let n = 0; n < 6; n++) {
    assert.strictEqual(St.newGame({ mode: 'ai', tier: AI.TIER_MAX, gameNo: n }).humanFirst, true,
      '顶档第 ' + n + ' 局：玩家必须先手（后手对完美求解器是数学必败）');
  }
  // ⚠ 但只让位这一档：19 级不是完美求解器，交替先手照旧（别把规则悄悄扩大到整个进阶段）
  const t19 = [];
  for (let n = 0; n < 4; n++) t19.push(St.newGame({ mode: 'ai', tier: AI.TIER_MAX - 1, gameNo: n }).humanFirst);
  assert.deepStrictEqual(t19, [true, false, true, false], '非顶档必须照常交替');
  // ⚠ 显式传 false 仍要放行：读别人分享的「AI 先手」那一局要用
  assert.strictEqual(St.newGame({ mode: 'ai', tier: AI.TIER_MAX, gameNo: 0, humanFirst: false }).humanFirst, false,
    '显式 humanFirst:false 必须放行（分享 URL 里 AI 先手的那一局）');
  console.log('test-state: 交替先手序列 + ⭐ 顶档默认让先（0..5 全 true）OK');
}

// ════════ ⭐ humanFirst ↔ 玩家编号的绑定只写一处 ════════
// 「先手是 player 0」这条绑定散落到 UI 各处就是错源（bitboard.js 头注释同一条教训）。
{
  const gA = St.newGame({ mode: 'ai', tier: 6, gameNo: 0 });   // 人先手
  const gB = St.newGame({ mode: 'ai', tier: 6, gameNo: 1 });   // AI 先手
  assert.strictEqual(St.humanPlayer(gA), 0);
  assert.strictEqual(St.humanPlayer(gB), 1);
  assert.strictEqual(St.isHumanTurn(gA), true, '人先手 ⇒ 开局是人走');
  assert.strictEqual(St.isHumanTurn(gB), false, 'AI 先手 ⇒ 开局是 AI 走');
  assert.strictEqual(St.isHumanTurn(St.play(gA, 3)), false);
  assert.strictEqual(St.isHumanTurn(St.play(gB, 3)), true);
  // ⚠ turnOf 是「该谁走」的**第二份**定义（moves.length % 2），盘面里还有一份（bd.turn）。
  //   两份定义必须逐手一致 —— 漂了的话「轮到谁」在 UI 和棋盘上会各说各话，且零报错。
  let g = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3, 4, 4, 2, 6, 1]) {
    assert.strictEqual(St.turnOf(g), St.boardOf(g).turn, 'turnOf 与 bd.turn 对不上（第 ' + g.moves.length + ' 手）');
    g = St.play(g, c);
  }
  assert.strictEqual(St.turnOf(g), St.boardOf(g).turn);
  assert.strictEqual(St.isHumanTurn(St.newGame({ mode: 'human', gameNo: 1 })), true, 'human 局两边都是人 ⇒ 恒 true');
  console.log('test-state: humanFirst ↔ 玩家编号、turnOf ↔ bd.turn OK');
}

// ════════ newGame 的入参一律当场校验（⛔ 别静默兜底）════════
// 与 AI.checkTier 同源：静默兜底会让「AI 其实一直在按第 1 级走」这种事零报错地存在。
{
  assert.throws(() => St.newGame({ mode: 'AI', gameNo: 0 }), /mode/, '未知 mode 必须抛（闭集）');
  assert.throws(() => St.newGame({ mode: 'ai', gameNo: 0 }), /tier/, 'ai 局必须给 tier');
  assert.throws(() => St.newGame({ mode: 'ai', tier: 0, gameNo: 0 }), /tier/);
  assert.throws(() => St.newGame({ mode: 'ai', tier: AI.TIER_MAX + 1, gameNo: 0 }), /tier/);
  assert.throws(() => St.newGame({ mode: 'ai', tier: 12.5, gameNo: 0 }), /tier/);
  assert.throws(() => St.newGame({ mode: 'human', tier: 5, gameNo: 0 }), /tier/, 'human 局给 tier = 调用方搞混了，抛');
  assert.throws(() => St.newGame({ mode: 'human', gameNo: -1 }), /gameNo/);
  assert.throws(() => St.newGame({ mode: 'human', gameNo: 1.5 }), /gameNo/);
  assert.throws(() => St.newGame({ mode: 'human' }), /gameNo/, 'gameNo 必给：交替先手全靠它');
  assert.throws(() => St.newGame(), /参数|options/);
  assert.deepStrictEqual(St.MODES, ['human', 'ai']);
  assert.ok(Object.isFrozen(St.MODES), 'MODES 必须冻结（跨模块比字符串必须有闭集来源）');
  console.log('test-state: newGame 入参校验 OK');
}

// ════════ ⭐ seed：显式可给、否则自生成，且**局局不同** ════════
// 确定性要求的是「同一份存档重放出同一局」，不是「每次开局都一样」——
// 后者会让玩家连开三局遇到同一条 AI 线。
{
  const g = St.newGame({ mode: 'ai', tier: 6, gameNo: 0, seed: 12345 });
  assert.strictEqual(g.seed, 12345, '显式 seed 必须原样用（分享 URL / 测试夹具靠它）');
  const seeds = new Set();
  for (let i = 0; i < 500; i++) seeds.add(St.newGame({ mode: 'human', gameNo: 0 }).seed);
  assert.strictEqual(seeds.size, 500,
    '同一毫秒内连开的局也必须拿到不同 seed（只用 Date.now() 会撞，重开一局还是同一条 AI 线）');
  // ⭐⭐ 值域必须钉死成 **i32**（`x | 0` 的值域），⛔ 别写成 u32：
  //    ai.js 的 checkSeed 会 `seed | 0`，存档里必须存**截断后**的那个值 ——
  //    否则同一局有两个 seed 数值在系统里流通（分享 URL 两端算出同一手、显示的 seed 不同）。
  //    ⚠ 而且「是不是负数」取决于本进程 _seedBase 的最高位 ⇒ 写成 u32 断言时，
  //      灵敏度会随进程摇摆（评审实测：`|0` 的变异体在某些进程里恰好存活）。这里恒等钉死：
  for (const s of seeds) {
    assert.strictEqual(s | 0, s, 'seed 必须已经是 i32（与 AI.checkSeed 逐位同值）：' + s);
  }
  assert.ok([...seeds].every(s => Number.isInteger(s) && s >= -0x80000000 && s <= 0x7fffffff));
  assert.strictEqual(St.newGame({ mode: 'human', gameNo: 0, seed: -1 }).seed, -1, '负 seed 必须原样接受');
  assert.throws(() => St.newGame({ mode: 'human', gameNo: 0, seed: 1.5 }), /seed/);
  assert.throws(() => St.newGame({ mode: 'human', gameNo: 0, seed: 0x80000000 }), /seed/, '超出 i32 必须抛');
  assert.throws(() => St.newGame({ mode: 'human', gameNo: 0, seed: -0x80000001 }), /seed/);
  console.log('test-state: ⭐ seed 可显式给 / 自生成不撞 / 恒为 i32 OK');
}

// ════════ ⭐ 存档里的 seed 与 AI 实际用的 seed 必须是**同一个数值** ════════
// ⚠ 光「确定性成立」不够：0xF0000001 与 -268435455 是同一条 PRNG 流，逐手重放照样对，
//   但系统里就有了两个 seed 数值 ⇒ 分享 URL 两端显示不同的 seed，看着像 bug（ai.js:439 原话）。
{
  for (let i = 0; i < 50; i++) {
    const g = St.newGame({ mode: 'ai', tier: 3, gameNo: 0 });
    const d = AI.decide(g.moves, g.tier, g.seed);
    assert.strictEqual(d.seed, g.seed,
      '存档 seed ' + g.seed + ' 与 AI.decide().seed ' + d.seed + ' 数值不同（ai.js 的 checkSeed 会 |0）');
    assert.strictEqual(St.deserialize(St.serialize(g)).seed, g.seed, '往返之后也必须是同一个数值');
  }
  // ⭐⭐ 上面两条的灵敏度都受制于**本进程**的 _seedBase 最高位（base < 2^31 时，
  //    `>>> 0` 写法照样全绿 —— 评审实测过这个变异体「时灵时不灵」地存活）。
  //    ⇒ 重新 require 出多份**独立 base** 的 state.js（每份都等到毫秒跳变），逐份钉死值域。
  //    正确实现下这一段恒绿；`>>> 0` 的实现每份约有一半概率被抓 ⇒ 32 份等于必杀。
  const P = require.resolve('../js/state.js');
  for (let i = 0; i < 32; i++) {
    const t0 = Date.now();
    while (Date.now() === t0) { /* 等毫秒跳变，否则 _seedBase 不会变 */ }
    delete require.cache[P];
    const Fresh = require(P);
    const s = Fresh.newGame({ mode: 'human', gameNo: 0 }).seed;
    assert.strictEqual(s | 0, s, '第 ' + i + ' 份实例的自生成 seed 不是 i32：' + s
      + '（autoSeed 写成 `>>> 0` 就会这样 —— 存档里于是流通着与 AI 不同的 seed 数值）');
  }
  delete require.cache[P];   // ⚠ 还原：后面的用例还要用最初那份 St
  console.log('test-state: ⭐ 存档 seed ≡ AI.decide().seed（i32，32 份独立 base 逐份钉死）OK');
}

// ════════ ⭐ 存档 = 同一局的 AI 逐手可重放 ════════
// 这才是 seed 与 paramsHash 存在的**目的**；上面那些字段断言只是它的必要条件。
// ⚠⚠ 这里**必须**用轻松档（1-5 级，不调求解器）：DESIGN §11b 第 2 条那个断崖是真的 ——
//    本文件第一版写的是 tier 12，从空盘连走 6 手 ⇒ n≤9 的 scoreAll **无库要几十分钟**，
//    测试直接挂死（实测 >2 分钟没出第 1 手）。⛔ 门禁里别对浅局面调求解器档。
{
  let g = St.newGame({ mode: 'ai', tier: 3, gameNo: 0 });
  const lineA = [];
  for (let i = 0; i < 6; i++) {
    const c = AI.aiMove(g.moves, g.tier, g.seed);
    lineA.push(c);
    g = St.play(g, c);
  }
  let g2 = St.deserialize(St.serialize(St.rewindTo(g, 0)));   // 存档 → 读档 → 从头重放
  const lineB = [];
  for (let i = 0; i < 6; i++) {
    const c = AI.aiMove(g2.moves, g2.tier, g2.seed);
    lineB.push(c);
    g2 = St.play(g2, c);
  }
  assert.deepStrictEqual(lineB, lineA, '读档后 AI 必须逐手重放出同一局（seed / tier 有一个没存住就会红）');
  console.log('test-state: ⭐ 读档后 AI 逐手重放同一局 OK');
}

// ════════ ⭐ paramsHash：换了难度参数表必须**说得出来**（DESIGN §11b 第 4 条）════════
{
  const g = St.newGame({ mode: 'ai', tier: 12, gameNo: 0 });
  assert.strictEqual(g.paramsHash, AI.paramsDigest().hash);
  assert.strictEqual(St.paramsChanged(g), false);
  const stale = { ...g, paramsHash: 'deadbeef' };
  assert.strictEqual(St.paramsChanged(stale), true,
    '指纹对不上必须报得出来 —— 否则复盘会静默地按另一套参数解释这局');
  // 真的改一次参数表，指纹必须跟着变（⚠ 改完立刻还原，别污染同进程后面的用例）
  const before = AI.paramsDigest().hash;
  AI.setTierParams(12, { p: 0.123456 });
  try {
    assert.notStrictEqual(AI.paramsDigest().hash, before);
    assert.strictEqual(St.paramsChanged(g), true, '参数表真改过之后，老存档必须被判为「不是同一套参数」');
  } finally {
    AI.resetTierParams();
  }
  assert.strictEqual(AI.paramsDigest().hash, before, '前提：参数表已还原');
  assert.strictEqual(St.paramsChanged(g), false);
  console.log('test-state: ⭐ paramsHash 变更可检出 OK');
}

// ════════ deserialize 是**不可信输入**的边界：只返回 null，绝不抛 ════════
{
  const good = JSON.parse(St.serialize(St.newGame({ mode: 'ai', tier: 9, gameNo: 2 })));
  const bad = [
    null, undefined, '', '[]', '"str"', '42', 'null', '{', '{"v":1',
    JSON.stringify({}),
    JSON.stringify({ ...good, v: undefined }),
    JSON.stringify({ ...good, v: '1' }),                       // 版本必须是数字，'1' !== 1
    JSON.stringify({ ...good, mode: 'AI' }),                   // 闭集外
    JSON.stringify({ ...good, mode: 'ai', tier: null }),       // ai 局没 tier
    JSON.stringify({ ...good, mode: 'human', tier: 9 }),       // human 局带 tier
    // ⚠ human 局的 tier **必须在场且为 null**。这是本函数唯一可能「字段不在也放行」的地方，
    //   而 serialize 永远写得出它（JSON 不丢 null）⇒ 缺了就说明这份档不是我们写的 ⇒ 丢弃。
    //   ⛔ 别当成 bug「修」宽：那与「版本不符即丢弃、绝不迁移」是同一条纪律。
    JSON.stringify({ ...good, mode: 'human', tier: undefined }),
    JSON.stringify({ ...good, tier: 999 }),
    JSON.stringify({ ...good, gameNo: -3 }),
    JSON.stringify({ ...good, humanFirst: 'yes' }),
    JSON.stringify({ ...good, seed: 0x80000000 }),             // 超出 i32（存档只存截断后的值）
    JSON.stringify({ ...good, seed: 'abc' }),
    JSON.stringify({ ...good, paramsHash: 123 }),
    JSON.stringify({ ...good, moves: null }),
    JSON.stringify({ ...good, moves: '334' }),
    JSON.stringify({ ...good, moves: [3, '3'] }),
    JSON.stringify({ ...good, moves: [3, 3.5] }),
    JSON.stringify({ ...good, moves: [3, -1] }),
    JSON.stringify({ ...good, moves: new Array(43).fill(0) }),
    // ⭐ 这一条才真正打到 fromMoves 的守卫上：字段全合法、列号全在 0..6，但第 7 次落进满列。
    //   ⚠ 上面那些在字段校验就被拦下了 ⇒ 少了这条，try/catch 删掉测试照样全绿。
    JSON.stringify({ ...good, moves: [0, 0, 0, 0, 0, 0, 0] }),
    // ⭐ 字段全合法、列号全合法、也没有满列，但第 7 手已经分出胜负 ⇒ 后面那两手不该存在。
    //   ⛔ 少了这条，把 deserialize 里那行 R.terminal 检查整个删掉，测试照样全绿（评审实测）。
    //   守的正是：终局之后多存的手会让**每一次重放**都走过终局线 ⇒ 胜负曲线 / 妙手判定 /
    //   分享 URL 全跟着错，而且零报错。而这份输入正来自分享 URL。
    JSON.stringify({ ...good, moves: [3, 4, 3, 4, 3, 4, 3, 0, 1] })
  ];
  for (const s of bad) {
    let r;
    assert.doesNotThrow(() => { r = St.deserialize(s); },
      'deserialize 对不可信输入不许抛（它读的是 localStorage / 分享 URL）：' + String(s).slice(0, 60));
    assert.strictEqual(r, null, '这份存档必须被丢弃：' + String(s).slice(0, 60));
  }
  // 反面：好的那份必须活着（别写成「一律 null」）
  assert.ok(St.deserialize(JSON.stringify(good)), '合法存档不许被误杀');
  console.log('test-state: deserialize 丢弃 ' + bad.length + ' 类脏输入且从不抛 OK');
}

// ════════ ⚠ 存档体积：DESIGN §9.3 说「几十字节」，实测一下 ════════
// ⚠ 这串 42 手真和棋照抄自 tests/test-bitboard.js 的 DRAW_MOVES（DFS 搜出、独立 2D 实现验过）。
const DRAW_MOVES = [3, 5, 5, 1, 6, 3, 2, 5, 1, 3, 5, 4, 4, 4, 2, 6, 5, 4, 6, 3, 5, 6,
                    6, 0, 2, 4, 4, 2, 2, 6, 0, 0, 1, 2, 3, 3, 1, 0, 0, 1, 0, 1];
{
  // ⚠ seed 取**最长的那个** i32（-2147483648，11 个字符）⇒ 量到的是**上界**，
  //   而不是一个随 seed 位数飘的数（自生成 seed 是 2..11 个字符）。顺带钉住负 seed 无损往返。
  let g = St.newGame({ mode: 'ai', tier: 20, gameNo: 0, seed: -0x80000000 });
  for (const c of DRAW_MOVES) g = St.play(g, c);
  assert.strictEqual(St.boardOf(g).n, 42);
  assert.strictEqual(R.terminal(St.boardOf(g)), R.DRAW, '前提：这串必须是满盘和');
  const s = St.serialize(g);
  const bytes = Buffer.byteLength(s, 'utf8');
  console.log('test-state: 42 手整局存档 = ' + bytes + ' 字节 / ' + s.length + ' 字符');
  assert.ok(bytes < 256, '一整局存档超过 256 字节 ⇒ 多半是有人把局面快照塞进来了（实测 ' + bytes + '）');
  assert.deepStrictEqual(St.deserialize(s), g, '满盘存档也要能无损读回');
  // 手数列表本身只有 42 个个位数 ⇒ 主体永远是几十字节，其余全是元数据
  assert.ok(JSON.stringify(g.moves).length <= 90);
}

// ════════════════════════════════════════════════════════════════════
// ⭐⭐ 让子（P2c Task 1 · DESIGN §6.7）
//
// 「弱的一方可**预置 1-2 枚子** —— 这是让全家人一起玩下去的唯一办法。」
// 这一组守的是四件事，每一件都对应一个**静默**的失败模式：
//   ① 预置子进的是**另一个字段**（不是手数）⇒ 撤销/重来在**结构上**撤不掉它；
//   ② `rewindTo(g,0)` 回到「只有预置子」而不是空盘；
//   ③ 存档往返无损（`pre` 是「格子」不是「档位号」⇒ 改产品数值不会重新解释老档）；
//   ④ v1 老档一律丢弃（少了 `pre` 的档若被宽容读成 `pre:[]`，让子局静默变普通局）。
// ════════════════════════════════════════════════════════════════════

// ─── 档位表本身：0/1/2 三档，且**不叠中列**（HANDICAP_COLS 上方那段的产品判断）───
{
  assert.strictEqual(St.HANDICAP_MAX, 2, 'DESIGN §6.7：预置 **1-2** 枚');
  assert.strictEqual(St.HANDICAP_COLS.length, 3, '0/1/2 三档');
  assert.deepStrictEqual(St.HANDICAP_COLS[0].slice(), []);
  assert.deepStrictEqual(St.HANDICAP_COLS[1].slice(), [3], '让 1 子 = 中列底（全盘最强的一格）');
  assert.deepStrictEqual(St.HANDICAP_COLS[2].slice(), [3, 3],
    '让 2 子 = 中列底叠两枚（实测选型见 state.js 的 HANDICAP_COLS）');
  // ⭐⭐ 这一条是实测逼出来的（`npm run sim:c4:handicap`）：把中列底让给强方的摆法（[2,4]）
  //   在第 5 级上让 2 子（.629）**反而不如**让 1 子（.661）—— 一个「越让越弱」的档位，
  //   而盘上确实多了两枚子 ⇒ **肉眼与「多了子」类断言都抓不住**。判据只能写成结构性的：
  //   **每一档都必须是上一档的超集**（多让一枚 = 多一枚在盘上，⛔ 不许换地方）。
  for (let n = 1; n <= St.HANDICAP_MAX; n++) {
    const prev = St.HANDICAP_COLS[n - 1].slice(), cur = St.HANDICAP_COLS[n].slice();
    assert.strictEqual(cur.length, n, '让 ' + n + ' 子必须正好 ' + n + ' 枚');
    assert.deepStrictEqual(cur.slice(0, n - 1), prev,
      '⛔ 让 ' + n + ' 子必须是让 ' + (n - 1) + ' 子**再加一枚**（⛔ 不许换地方摆）—— '
      + '换地方会把最强的中列底还给强方，实测出现过「越让越弱」');
  }
  assert.ok(St.HANDICAP_COLS[St.HANDICAP_MAX].indexOf(3) >= 0,
    '⛔ 每一档让子都必须含**中列**（参与 13 条四连线；边列只有 3 条）');
  console.log('test-state: ⭐ 让子档位表（0/1/2 · 逐档超集 · 恒含中列）OK');
}

// ─── ⭐ 让子局的开局：预置子在盘上、归弱方、且**强方先手** ───
{
  for (const n of [1, 2]) {
    const g = St.newGame({ mode: 'human', gameNo: 0, handicap: n });
    assert.strictEqual(St.handicapOf(g), n);
    assert.deepStrictEqual(g.pre, St.HANDICAP_COLS[n].slice());
    assert.deepStrictEqual(g.moves, [], '⭐ 预置子**不是手数** —— moves 必须还是空的');

    const bd = St.boardOf(g);
    assert.strictEqual(bd.n, n, '开局盘上就有 ' + n + ' 枚子');
    assert.strictEqual(bd.turn, 0, '预置子不算手数 ⇒ 行棋权在先手位');
    assert.strictEqual(St.turnOf(g), bd.turn, 'turnOf 与 bd.turn 在让子局上也必须一致');
    assert.deepStrictEqual(bd.mv, [], '⭐ 预置子也不进盘面的手数列表（B.toMoves(boardOf(g)) ≡ g.moves）');
    // ⭐ 全部归**同一方**，且那一方是 humanPlayer（= 弱方的座位）
    const owner = St.humanPlayer(g);
    const mine = owner === 0 ? bd.a : bd.b, other = owner === 0 ? bd.b : bd.a;
    assert.strictEqual(other.reduce((s, v) => s + v, 0), 0, '预置子必须全归弱方一个人（对方一枚都没有）');
    // ⚠ 数的是**枚数**（掩码里的 1 的个数），⛔ 不是「有子的列数」——
    //   让 2 子叠在同一列时后者恒为 1，那条断言会静默地永远绿。
    const bits = mine.reduce((s, v) => { let k = 0; for (let m = v; m; m >>= 1) k += m & 1; return s + k; }, 0);
    assert.strictEqual(bits, n, '弱方手里必须正好 ' + n + ' 枚');
    // ⚠ 让 2 子是同一列两枚 ⇒ 按列计数，⛔ 别断言「每列一枚」
    for (const c of new Set(g.pre)) {
      assert.strictEqual(bd.h[c], g.pre.filter(x => x === c).length,
        '第 ' + c + ' 列的高度必须等于摆进去的枚数（预置子从底往上叠）');
    }

    // ⭐ 谁先走：弱方拿子 ⇒ **强方先手**（⛔ 既拿子又先走 = 双重优势）
    assert.strictEqual(g.humanFirst, false,
      '⭐ 让子局里强的一方先手 —— 弱方既拿预置子又先走是双重优势');
    assert.strictEqual(owner, 1, '⇒ 预置子归后手位（= Player 1 那个座位）');
  }
  // ⚠ 让 0 子必须与 P2a 完全一样（交替先手照旧）
  const g0 = St.newGame({ mode: 'human', gameNo: 0 });
  assert.deepStrictEqual(g0.pre, []);
  assert.strictEqual(g0.humanFirst, true, '让 0 子 ⇒ 交替先手照旧（⛔ 别把让子规则扩大到普通局）');
  assert.strictEqual(St.boardOf(g0).n, 0);
  // ⭐ 让子局**先手不再逐局交替**（让子本身已经是明面的不对称）
  for (let no = 0; no < 4; no++) {
    assert.strictEqual(St.newGame({ mode: 'human', gameNo: no, handicap: 1 }).humanFirst, false,
      '让子局第 ' + no + ' 局：先手不许交替（交替会每两局把「谁是弱方」翻一次）');
  }
  console.log('test-state: ⭐ 让子开局（子在盘上 / 归弱方 / 强方先手 / 不交替）OK');
}

// ─── ⭐⭐ 撤销**撤不掉**预置子；rewindTo(0) 回到「只有预置子」而不是空盘 ───
{
  let g = St.newGame({ mode: 'human', gameNo: 0, handicap: 2 });
  const pre0 = JSON.stringify(St.boardOf(g));
  for (const c of [2, 2, 5, 5, 1]) g = St.play(g, c);
  assert.strictEqual(St.boardOf(g).n, 7, '2 枚预置 + 5 手 = 7 枚');

  // 一路撤到底
  let u = g;
  for (let i = 0; i < 20; i++) u = St.undo(u);
  assert.deepStrictEqual(u.moves, [], '手数撤光了');
  assert.strictEqual(St.boardOf(u).n, 2,
    '⛔⛔ 撤销**绝不许**撤掉预置子 —— 撤光手数之后盘上必须仍有 2 枚（撤没了 = 孩子的让子被吃了）');
  assert.strictEqual(JSON.stringify(St.boardOf(u)), pre0, '撤到底必须逐位回到开局那个盘');
  assert.deepStrictEqual(u.pre, St.HANDICAP_COLS[2].slice(), 'pre 字段本身也不许被撤销动到');

  // rewindTo(0) 同理（复盘滑杆走到最左）
  const r0 = St.rewindTo(g, 0);
  assert.deepStrictEqual(r0.moves, []);
  assert.strictEqual(St.boardOf(r0).n, 2, '⭐ rewindTo(0) 回到的是「只有预置子」，⛔ 不是空盘');
  assert.strictEqual(JSON.stringify(St.boardOf(r0)), pre0);
  // 中途重来也一样
  assert.strictEqual(St.boardOf(St.rewindTo(g, 3)).n, 5, 'rewindTo(3) = 2 枚预置 + 3 手');
  // ⚠ 反向对照：让 0 子时 rewindTo(0) 必须真的是空盘（否则上面几条恒绿）
  let z = St.newGame({ mode: 'human', gameNo: 0 });
  for (const c of [3, 3]) z = St.play(z, c);
  assert.strictEqual(St.boardOf(St.rewindTo(z, 0)).n, 0, '让 0 子 ⇒ rewindTo(0) 就是空盘');
  console.log('test-state: ⭐⭐ 撤销/重来撤不掉预置子（rewindTo(0) = 只有预置子）OK');
}

// ─── ⭐ 让子局的存档往返 + 版本 ───
{
  let g = St.newGame({ mode: 'ai', tier: 3, gameNo: 0, handicap: 2, seed: 424242 });
  for (const c of [3, 3, 4]) g = St.play(g, c);
  const s = St.serialize(g);
  const back = St.deserialize(s);
  assert.deepStrictEqual(back, g, '让子局的存档必须逐字段无损往返');
  assert.deepStrictEqual(back.pre, St.HANDICAP_COLS[2].slice());
  assert.notStrictEqual(back.pre, g.pre, 'pre 必须拷一份（⛔ 别让解析出来的数组被外部句柄捏住）');
  assert.strictEqual(St.boardOf(back).n, 5, '读回来的盘必须还是 2 枚预置 + 3 手');
  assert.strictEqual(JSON.stringify(St.boardOf(back)), JSON.stringify(St.boardOf(g)));

  // ⭐ 存的是**格子**不是「让几子」这个档位号 —— 存档里必须看得见列号
  const raw = JSON.parse(s);
  assert.deepStrictEqual(raw.pre, St.HANDICAP_COLS[2].slice(),
    '⭐ 存档里存的必须是**格子**（列号），⛔ 不是档位号 —— 档位表一调，老档就会摆出另一个盘');

  // ⛔ SAVE_VERSION 必须已经 bump（G 的形状变了）
  //   ⚠ 判据写成 **≥ 3** 而不是「等于某个数」：P2c T1 加了 pre（1→2）、T2 加了 kids（2→3），
  //     再加字段还会涨 —— 钉死一个数只会让下一个人来改这一行，那条断言就没在守任何东西了。
  assert.ok(St.SAVE_VERSION >= 3,
    'G 加了 pre / kids 字段 ⇒ SAVE_VERSION 必须 bump（root 铁律），现在是 ' + St.SAVE_VERSION);
  // ⛔ v1 / v2 的老档一律丢弃、绝不迁移（⚠ 它们长得完全合法，只是少了 pre / kids）
  const v1 = { v: 1, mode: 'human', tier: null, gameNo: 0, humanFirst: true,
               seed: 1, paramsHash: AI.paramsDigest().hash, moves: [3, 3] };
  assert.strictEqual(St.deserialize(JSON.stringify(v1)), null,
    '⛔ v1 老档必须丢弃（⛔ 不迁移：少了 pre 的档若被宽容读成 pre:[]，让子局会静默变成普通局）');
  assert.strictEqual(St.deserialize(JSON.stringify({ ...v1, v: 2, pre: [3, 3] })), null,
    '⛔ v2 老档必须丢弃（少了 kids 的档若被读成 false，一局儿童档会静默变成普通局）');
  // ⚠⚠ 「pre 必须在场」这条要用**当前**版本号造样本 —— ⛔ 别用老版本号：那样它是被上面的
  //   版本检查拦下的，这条断言就空转了（本仓「加了断言但抓不住」的标准形状；改 SAVE_VERSION
  //   时这里最容易变成恒绿）。
  assert.strictEqual(
    St.deserialize(JSON.stringify({ ...v1, v: St.SAVE_VERSION, kids: false })), null,
    'pre 字段**必须在场**（serialize 永远写得出它 ⇒ 缺了说明这份档不是我们写的）');
  assert.strictEqual(
    St.deserialize(JSON.stringify({ ...v1, v: St.SAVE_VERSION, pre: [] })), null,
    'kids 字段**必须在场**（同上）');
  // ⭐ 反向对照：**两个字段都在**的当前版本档必须读得回（⛔ 少了它，上面四条可能只是「什么都拒收」）
  assert.ok(St.deserialize(JSON.stringify({ ...v1, v: St.SAVE_VERSION, pre: [], kids: false })),
    '反向对照：字段齐全的当前版本档必须读得回');
  console.log('test-state: ⭐ 让子局存档往返 · 存格子不存档位 · v1 老档丢弃 OK');
}

// ─── deserialize 对让子字段的脏输入：只丢弃，绝不抛 ───
{
  const good = JSON.parse(St.serialize(St.newGame({ mode: 'human', gameNo: 0, handicap: 2 })));
  const bad = [
    { ...good, pre: null }, { ...good, pre: '24' }, { ...good, pre: [2, '4'] },
    { ...good, pre: [2, 4.5] }, { ...good, pre: [2, 7] }, { ...good, pre: [2, -1] },
    { ...good, pre: [2, 4, 5] },                       // 超过 HANDICAP_MAX
    { ...good, pre: [0, 0, 0], moves: [] },            // 同上（列合法但太多）
    // ⭐ 这一条才打到「摆预置子这件事本身可能非法」上：⚠ 只有当 pre 摆得下、
    //   而后面的手数把那一列**填满**时才拦得住 —— 6 枚同列（超上限）已被长度挡了，
    //   这里用「1 枚预置 + 6 手同列」把 B.play 的满列守卫真正打通。
    { ...good, pre: [0], moves: [0, 0, 0, 0, 0, 0] }
  ];
  for (const b of bad) {
    let r;
    assert.doesNotThrow(() => { r = St.deserialize(JSON.stringify(b)); },
      'deserialize 对脏 pre 不许抛：' + JSON.stringify(b.pre));
    assert.strictEqual(r, null, '这份档必须丢弃：' + JSON.stringify(b).slice(0, 80));
  }
  assert.ok(St.deserialize(JSON.stringify(good)), '反面：合法让子档不许被误杀');
  // ⚠ 反向对照：同样 6 手同列但**没有**预置子 ⇒ 合法（否则上一条测的其实是「6 手同列」）
  assert.ok(St.deserialize(JSON.stringify({ ...good, pre: [], moves: [0, 0, 0, 0, 0, 0] })),
    '没有预置子时 6 手同列是合法的 —— 上面那条拦的必须是「预置子把列顶满了」');
  // ⭐ serialize 的自校验也必须挡住手搓的坏 pre（存得进读不回 = 玩家看到「已保存」，下次没了）
  const g = St.newGame({ mode: 'human', gameNo: 0, handicap: 1 });
  for (const badG of [{ ...g, pre: undefined }, { ...g, pre: [9] }, { ...g, pre: [1, 2, 3] }]) {
    assert.throws(() => St.serialize(badG), /存得进读不回|serialize/,
      'serialize 必须拒绝一个读不回的让子 G：' + JSON.stringify(badG.pre));
  }
  console.log('test-state: 让子字段的脏输入丢弃 ' + bad.length + ' 类且从不抛 OK');
}

// ─── ⛔ 让子只在同机双人与轻松档开放（技术硬约束：开局库对让子局面 100% 落空）───
{
  assert.strictEqual(St.handicapAllowed('human', null), true, '同机双人恒许');
  for (let t = 1; t < AI.SOLVER_FROM; t++) {
    assert.strictEqual(St.handicapAllowed('ai', t), true, '轻松档第 ' + t + ' 级必须许');
  }
  for (const t of [AI.SOLVER_FROM, 12, AI.TIER_MAX]) {
    assert.strictEqual(St.handicapAllowed('ai', t), false,
      '⛔ 第 ' + t + ' 级是求解器档 —— 让子局面不在开局库里，每手要几秒到几十分钟（§9.2 断崖）');
    assert.throws(() => St.newGame({ mode: 'ai', tier: t, gameNo: 0, handicap: 1 }), /让子|断崖|开局库/,
      '⛔ 静默降成 0 会让「我明明选了让子」变成普通局，零报错 ⇒ 必须抛');
  }
  // 让 0 子在任何档都合法（⛔ 别把守卫写成「求解器档不许传 handicap」）
  for (const t of [3, 12, AI.TIER_MAX]) {
    assert.strictEqual(St.newGame({ mode: 'ai', tier: t, gameNo: 0, handicap: 0 }).pre.length, 0);
  }
  // 入参校验（与 newGame 其余入参同一条纪律：调用方是我们自己的 UI ⇒ 当场抛）
  for (const bad of [-1, 3, 1.5, '1', null, NaN]) {
    assert.throws(() => St.newGame({ mode: 'human', gameNo: 0, handicap: bad }), /handicap/,
      'handicap=' + String(bad) + ' 必须抛');
  }
  console.log('test-state: ⛔ 让子的开放范围（双人 + 轻松档 1-' + (AI.SOLVER_FROM - 1) + ' 级）OK');
}

// ─── ⭐ placeHandicap 是纯函数，且与 boardOf 走同一条路 ───
// ⚠ 它被 tools/sim-handicap.js 用来摆模拟局的开局 —— **模拟台和产品必须摆同一批格子**，
//   否则量出来的胜率不是这个产品的胜率。
{
  const empty = B.newBoard();
  const snap = JSON.stringify(empty);
  const out = St.placeHandicap(empty, St.HANDICAP_COLS[2].slice(), 1);
  assert.strictEqual(JSON.stringify(empty), snap, 'placeHandicap 不许改入参');
  assert.strictEqual(out.n, 2);
  assert.strictEqual(out.turn, 0, '摆完行棋权必须回到先手位');
  assert.deepStrictEqual(out.mv, [], '预置子不进手数列表');
  const g = St.newGame({ mode: 'human', gameNo: 0, handicap: 2 });
  assert.strictEqual(JSON.stringify(St.boardOf(g)), JSON.stringify(out),
    'placeHandicap 与 boardOf 必须给出同一个盘（⛔ 两份实现 = 模拟台量的不是产品）');
  assert.strictEqual(St.placeHandicap(empty, [], 1).n, 0, '空 pre 是 no-op');
  console.log('test-state: ⭐ placeHandicap 纯函数、与 boardOf 同一条路 OK');
}

// ════════ ⭐ 浏览器加载路径（照 test-browser-globals.js 的做法）════════
// state.js 的 `root.C4State = API` 分支在 node 里零消费者 —— P1 终审的阻塞 bug 就长在
// 这种地方（ai.js 的 root.PRNG 恒 undefined，node 侧 14 条门禁全绿）。
// ⛔ 只断言「全局名挂上了」不够：必须**真调一次**，且与 node 逐位相同。
{
  const ROOT = path.resolve(__dirname, '..', '..', '..');
  const JS = path.resolve(__dirname, '..', 'js');
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.self = sandbox;
  sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };
  // ⚠ 这就是将来 index.html 里 <script> 的顺序：state.js 必须排在 ai.js 之后（它要 ConnectAI）
  for (const f of [
    path.join(ROOT, 'engine', 'prng.js'),
    path.join(JS, 'bitboard.js'), path.join(JS, 'rules-classic.js'),
    path.join(JS, 'solver.js'), path.join(JS, 'ai.js'), path.join(JS, 'state.js')
  ]) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });

  assert.strictEqual(vm.runInContext('typeof module', sandbox), 'undefined', '沙箱必须没有 module');
  assert.strictEqual(vm.runInContext('typeof self.C4State', sandbox), 'object',
    'self.C4State 没挂上（结尾的 root.C4State = API 没生效？）');
  const OPTS = '{mode:"ai",tier:12,gameNo:3,seed:424242}';
  const got = vm.runInContext('C4State.serialize(C4State.play(C4State.play(C4State.newGame(' + OPTS + '),3),4))', sandbox);
  const want = St.serialize(St.play(St.play(St.newGame({ mode: 'ai', tier: 12, gameNo: 3, seed: 424242 }), 3), 4));
  assert.strictEqual(got, want, '浏览器路径与 node 路径的存档不同 ⇒ 手机端与网页端复盘会对不上');
  // 跨模块引用真的解析得到（paramsHash 走的是 root.ConnectAI）
  assert.strictEqual(vm.runInContext('C4State.newGame(' + OPTS + ').paramsHash', sandbox), AI.paramsDigest().hash);
  console.log('test-state: ⭐ 浏览器路径（self.C4State）真调用与 node 逐位相同 OK');
}

console.log('test-state: 全部通过');
