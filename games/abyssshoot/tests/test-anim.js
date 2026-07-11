// test-anim.js — 动画纯函数单测。mapColumn 是动画位置插值的心脏(逻辑最绕),
// 它算错的表现是「格子飞错地方/错位/闪现」,肉眼很难可靠发现 → 必须有单测钉死。
// render.js 是浏览器专用(顶层 const 当全局),但末尾有一层薄双导出供 node require。
const assert = require('assert');
const Core = require('../js/core.js');
const { mapColumn, tileY } = require('../js/render.js');

// 用真实 core 产出的 round 事件里的 merges(而非手搓假数据):测试直接绑在真契约上。
function round1Merges(board) {
  const s = Core.createGame({ seed: 1 });
  s.board = board.map(c => c.slice());
  Core.resolve(s);
  const r = s.events.find(e => e.t === 'round');
  return r ? r.merges : [];
}
const clone = b => b.map(c => c.slice());
const survivors = m => m.items.filter(x => x.kind === 'survive');
const vanished  = m => m.items.filter(x => x.kind === 'vanish');
// 动画里任何 undefined/NaN 都会静默画到画布外(不报错、只是「格子不见了」)→ 显式扫一遍。
function assertSane(m, label) {
  for (const it of m.items) {
    assert(Number.isFinite(it.i) && it.i >= 0, `${label}: i 有限非负`);
    assert(Number.isFinite(it.v) && it.v > 0, `${label}: v 有限正数(不许 undefined/NaN)`);
    if (it.kind === 'survive') assert(Number.isFinite(it.toI) && it.toI >= 0, `${label}: toI 有限非负`);
    else {
      assert(it.anchor && Number.isFinite(it.anchor.c) && Number.isFinite(it.anchor.i),
        `${label}: vanish 必须带合法 anchor`);
    }
  }
}

// ── ① 同列两个不相干连通块、同一轮各自合并 ──
{
  const board = [[2, 2, 8, 8], [], [], [], []];
  const merges = round1Merges(board);
  assert.strictEqual(merges.length, 2, '同列两个独立块 → 本轮两次合并');
  const m = mapColumn(clone(board)[0], 0, merges);
  assertSane(m, '①');
  const sv = survivors(m), vn = vanished(m);
  assert.strictEqual(sv.length, 2, '① 两个锚点幸存');
  assert.strictEqual(vn.length, 2, '① 两个非锚点消失');
  // 锚点取最低:2 的块锚在 i=1(合成 4),8 的块锚在 i=3(合成 16)
  assert.deepStrictEqual(sv.map(x => [x.i, x.oldV, x.v, x.toI, x.isAnchor]),
    [[1, 2, 4, 0, true], [3, 8, 16, 1, true]],
    '① 重力压实后:4→新 index0,16→新 index1(保序)');
  assert.deepStrictEqual(vn.map(x => x.i), [0, 2], '① 消失的是两个非锚点格');
  assert.strictEqual(m.anchorNewIdx.get(1), 0, '① 锚点 i=1 的新 index=0');
  assert.strictEqual(m.anchorNewIdx.get(3), 1, '① 锚点 i=3 的新 index=1');
  // 与真盘对账:core 算完确实是 [4,16]
  const s = Core.createGame({ seed: 1 }); s.board = clone(board); Core.resolve(s);
  assert.deepStrictEqual(s.board[0], [4, 16], '① 与 core 的真实结果一致');
}

// ── ② 跨列合并,锚点在别的列(本列只出「消失格」,它要飞去别列) ──
{
  const board = [[4], [4], [], [], []];
  const merges = round1Merges(board);
  assert.strictEqual(merges.length, 1);
  assert.deepStrictEqual(merges[0].anchor, { c: 0, i: 0 }, '② 同 index 时锚点取最左列');
  const m1 = mapColumn(clone(board)[1], 1, merges);   // 列1:锚点不在这列
  assertSane(m1, '②');
  assert.strictEqual(survivors(m1).length, 0, '② 列1 无幸存格');
  assert.strictEqual(vanished(m1).length, 1, '② 列1 那个 4 要飞走');
  assert.deepStrictEqual(vanished(m1)[0].anchor, { c: 0, i: 0 }, '② 飞向列0 的锚点');
  assert.strictEqual(vanished(m1)[0].v, 4, '② 飞的是旧值 4');
  // 锚点所在列必须能查到新 index —— drawMergeStep 靠它算落点,查不到就是 NaN 坐标
  const m0 = mapColumn(clone(board)[0], 0, merges);
  assert.strictEqual(m0.anchorNewIdx.get(0), 0, '② 锚点新 index 可查(否则落点 NaN)');
  assert.strictEqual(survivors(m0)[0].v, 8, '② 锚点变成 8');
}

// ── ③ 锚点是该块最低格,且该列上下都还有静态格(考验重力压实的 index 重映射) ──
{
  const board = [[2, 4, 4, 2], [], [], [], []];
  const merges = round1Merges(board);
  assert.strictEqual(merges.length, 1);
  assert.deepStrictEqual(merges[0].anchor, { c: 0, i: 2 }, '③ 锚点 = 块内最低格');
  const m = mapColumn(clone(board)[0], 0, merges);
  assertSane(m, '③');
  assert.deepStrictEqual(survivors(m).map(x => [x.i, x.v, x.toI]),
    [[0, 2, 0], [2, 8, 1], [3, 2, 2]],
    '③ 顶部静态格不动(0→0);锚点 8 落到 1;下方静态格上滑 3→2');
  assert.deepStrictEqual(vanished(m).map(x => x.i), [1], '③ 只有 i=1 消失');
  const s = Core.createGame({ seed: 1 }); s.board = clone(board); Core.resolve(s);
  assert.deepStrictEqual(s.board[0], [2, 8, 2], '③ 与 core 真实结果一致(3 格,保序)');
}

// ── ④ 整列格子全参与跨列合并、该列被清空(最容易出 undefined/NaN 的边界) ──
{
  const board = [[8], [8], [8], [], []];
  const merges = round1Merges(board);
  assert.strictEqual(merges.length, 1, '④ 三列同 index 的 8 连成一块');
  assert.deepStrictEqual(merges[0].anchor, { c: 0, i: 0 });
  for (const c of [1, 2]) {
    const m = mapColumn(clone(board)[c], c, merges);
    assertSane(m, `④ 列${c}`);
    assert.strictEqual(survivors(m).length, 0, `④ 列${c} 被清空,零幸存`);
    assert.strictEqual(m.anchorNewIdx.size, 0, `④ 列${c} 无锚点`);
    assert.strictEqual(vanished(m).length, 1, `④ 列${c} 唯一那格飞向列0`);
    assert.deepStrictEqual(vanished(m)[0].anchor, { c: 0, i: 0 });
  }
  const s = Core.createGame({ seed: 1 }); s.board = clone(board); Core.resolve(s);
  assert.deepStrictEqual([s.board[1], s.board[2]], [[], []], '④ core 里这两列确实空了');
}

// ── ⑤ 无合并时 mapColumn 是恒等映射(动画不该无中生有地挪格子) ──
{
  const m = mapColumn([2, 4, 8], 0, []);
  assertSane(m, '⑤');
  assert.strictEqual(vanished(m).length, 0, '⑤ 无合并 → 无消失格');
  assert.deepStrictEqual(survivors(m).map(x => [x.i, x.toI, x.v]),
    [[0, 0, 2], [1, 1, 4], [2, 2, 8]], '⑤ 每格原地不动');
}

console.log('test-anim: mapColumn OK');

// ── tileY:越线格必须与 drawBreaches 用同一套偏移(否则弹药「压过死线」会跳一帧) ──
{
  const L = { boardY: 100, cell: 50, lineY: 100 + 9 * 50 };   // rows=9 → lineY=550
  const BREACH_RISE = 0.25;   // 与 render.js 同值
  assert.strictEqual(tileY(L, 9, 0), 100, '盘内首格贴棋盘顶');
  assert.strictEqual(tileY(L, 9, 8), 500, '盘内最后一格无越线偏移');
  // drawBreaches 的公式:lineY + (i-rows)*cell - cell*BREACH_RISE
  const breachY = i => L.lineY + (i - 9) * L.cell - L.cell * BREACH_RISE;
  assert.strictEqual(tileY(L, 9, 9), breachY(9), '越线首格 y 必须等于 drawBreaches 的公式');
  assert.strictEqual(tileY(L, 9, 10), breachY(10), '越线第二格同理');
  assert(tileY(L, 9, 9) > L.lineY - L.cell && tileY(L, 9, 9) < L.lineY,
    '越线格骑跨死线(视觉上「冲破」)');
  // 8→9 之间连续 ramp:滑动不跳变
  assert(tileY(L, 9, 8.5) > tileY(L, 9, 8) && tileY(L, 9, 8.5) < tileY(L, 9, 9),
    '8→9 之间单调连续(重力滑动不跳帧)');
}
console.log('test-anim: tileY 越线偏移与 drawBreaches 一致 OK');
