const assert = require('assert');
const Core = require('../js/core.js');

// --- 初始状态 ---
let s = Core.createGame({ seed: 1 });
assert.strictEqual(s.cols, 5);
assert.strictEqual(s.rows, 9);
assert.strictEqual(s.board.length, 5, '5 列');
assert(s.board.every(col => Array.isArray(col) && col.length === 0), '开局空盘');
assert.strictEqual(s.score, 0);
assert.strictEqual(s.maxTile, 0);
assert(!s.dead);
assert(Number.isInteger(Math.log2(s.ammo)) && s.ammo >= 2, 'ammo 是 >=2 的 2 的幂');
assert.strictEqual(s.queue.length, 3, '预览 3 发');
assert(s.queue.every(v => Number.isInteger(Math.log2(v)) && v >= 2));

// --- 同种子可复现 ---
const a = Core.createGame({ seed: 42 });
const b = Core.createGame({ seed: 42 });
assert.strictEqual(a.ammo, b.ammo);
assert.deepStrictEqual(a.queue, b.queue);

console.log('test-core: createGame OK');

// --- gravityUp: 每列去零、保持顺序、向 index 0 压实 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 0, 4, 0], [0, 0, 8], [], [16], [0]];
Core.gravityUp(s);
assert.deepStrictEqual(s.board[0], [2, 4], '列0 去零保序');
assert.deepStrictEqual(s.board[1], [8], '列1 去零');
assert.deepStrictEqual(s.board[2], [], '列2 空');
assert.deepStrictEqual(s.board[3], [16], '列3 不变');
assert.deepStrictEqual(s.board[4], [], '列4 全零→空');
console.log('test-core: gravityUp OK');

// --- findComponents: 竖向对 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 4], [], [], [], []];   // 列0 两个 4 相邻(index0,1)
let comps = Core.findComponents(s);
assert.strictEqual(comps.length, 1, '一个竖向连通块');
assert.strictEqual(comps[0].value, 4);
assert.strictEqual(comps[0].cells.length, 2);
assert.deepStrictEqual(comps[0].anchor, { c: 0, i: 1 }, '锚点取 index 最大');

// --- 横向对:相邻列同 index ---
s = Core.createGame({ seed: 1 });
s.board = [[8], [8], [], [], []];     // 列0/列1 的 index0 都是 8
comps = Core.findComponents(s);
assert.strictEqual(comps.length, 1, '一个横向连通块');
assert.deepStrictEqual(comps[0].anchor, { c: 0, i: 0 }, '同 index 时锚点取最左 c');

// --- L 形 4 连块 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 2], [2], [], [], []];  // (0,0)(0,1)(1,0) 都是 2;(1,0)与(0,0)横邻,(0,1)与(0,0)竖邻
comps = Core.findComponents(s);
assert.strictEqual(comps.length, 1);
assert.strictEqual(comps[0].cells.length, 3, 'L 形 3 连');
assert.deepStrictEqual(comps[0].anchor, { c: 0, i: 1 }, '最低最左');

// --- 单个不成块;不同值不连 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 4], [8], [], [], []];
assert.strictEqual(Core.findComponents(s).length, 0, '无 ≥2 同值相邻');

// --- 两个分离的同值块各自计 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 4], [], [4, 4], [], []];   // 列0 一对、列2 一对,列1 空隔开
assert.strictEqual(Core.findComponents(s).length, 2, '分离两块');
console.log('test-core: findComponents OK');

// --- resolve: 单块 4+4 → 8,一轮 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 4], [], [], [], []];
let r = Core.resolve(s);
assert.deepStrictEqual(s.board[0], [8], '4,4→8');
assert.strictEqual(r.chain, 1, '一轮');
assert.strictEqual(s.score, 8 * 1, 'gained=8×1');
assert.strictEqual(s.maxTile, 8);

// --- 整个 ≥2 同值连通块塌成 1 个(3 连 → 1 个 ×2) ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 2], [2], [], [], []];   // L 形 3 个 2
Core.resolve(s);
const flat = s.board.flat();
assert.deepStrictEqual(flat, [4], '3 个 2 塌成 1 个 4');

// --- 连锁:2,2 顶上还有个 4 → 合出 4 再与之连锁成 8,两轮 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];  // index0=4,index1=2,index2=2
r = Core.resolve(s);
assert.deepStrictEqual(s.board[0], [8], '2,2→4 再与顶部 4→8');
assert.strictEqual(r.chain, 2, '两轮连锁');
assert.strictEqual(s.score, 4 * 1 + 8 * 2, '第1轮4×1 + 第2轮8×2');

// --- 无块:不变 ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 4], [], [], [], []];
r = Core.resolve(s);
assert.strictEqual(r.chain, 0);
assert.strictEqual(s.score, 0);

// --- newMaxFish 事件 ---
s = Core.createGame({ seed: 1 });
s.board = [[8, 8], [], [], [], []];
Core.resolve(s);
assert(s.events.some(e => e.t === 'newMaxFish' && e.v === 16), '刷新最高档发事件');
console.log('test-core: resolve OK');

// --- spawnRow: 每列顶部各加一个小鱼(2 或 4),原有下移 ---
s = Core.createGame({ seed: 7 });
s.board = [[16], [32], [], [64], []];
Core.spawnRow(s);
for (let c = 0; c < 5; c++) {
  const first = s.board[c][0];
  assert(first === 2 || first === 4, `列${c} 顶部是新小鱼`);
}
assert.deepStrictEqual(s.board[0].slice(1), [16], '列0 原鱼被下移到 index1');
assert.deepStrictEqual(s.board[3].slice(1), [64], '列3 原鱼下移');
assert(s.events.some(e => e.t === 'spawn'), '发 spawn 事件');
console.log('test-core: spawnRow OK');

// --- shoot: 射进空列,弹药落底,换新弹 ---
s = Core.createGame({ seed: 1 });
const firstAmmo = s.ammo, firstQueue = s.queue.slice();
Core.shoot(s, 2);
assert.strictEqual(s.board[2][s.board[2].length - 1], firstAmmo, '弹药落在目标列底');
assert.strictEqual(s.ammo, firstQueue[0], '换成队列下一发');
assert.strictEqual(s.queue.length, 3, '队列仍 3 发');
assert.strictEqual(s.shots, 1);
assert(s.events.some(e => e.t === 'shoot' && e.c === 2), '发 shoot 事件');

// --- shoot 触发合并:列底同数 → 合 ---
s = Core.createGame({ seed: 1 });
s.board = [[], [], [8], [], []];
s.ammo = 8;
Core.shoot(s, 2);
assert.deepStrictEqual(s.board[2], [16], '8 射到 8 上→16');

// --- 越界/死局不炸 ---
s = Core.createGame({ seed: 1 });
Core.shoot(s, 9);          // 越界:无操作
assert.strictEqual(s.shots, 0, '越界不计');
s.dead = true;
Core.shoot(s, 0);
assert.strictEqual(s.shots, 0, '死局不动');

// --- SPAWN_EVERY 发后触发刷行 ---
s = Core.createGame({ seed: 3 });
for (let k = 0; k < Core.SPAWN_EVERY; k++) Core.shoot(s, k % 5);
assert(s.events.some(e => e.t === 'spawn'), '第 SPAWN_EVERY 发后有 spawn');
assert.strictEqual(s.shotsSinceSpawn, 0, '刷行后计数清零');

// --- 失败:把一列灌到超高 ---
// 用相邻不同值填满(否则同值会连锁合并、缩短、反而不死);ammo 也与列底不同数
s = Core.createGame({ seed: 1 });
const alt = [];
for (let i = 0; i < s.rows; i++) alt.push(i % 2 === 0 ? 2 : 4);   // 2,4,2,4,... 共 rows 个,相邻不同
s.board = [alt, [], [], [], []];
s.ammo = 8;
Core.shoot(s, 0);
assert(s.dead, '列高超 rows → 死');
assert(s.events.some(e => e.t === 'death'));
console.log('test-core: shoot OK');

// --- 弹药放大不变量:恒在 [最小档, 最小档×4] 且为 2 的幂 ---
s = Core.createGame({ seed: 5 });
s.board = [[64, 64], [128], [256], [], []];   // 最小档=64
const lo = Core.smallestTile(s);              // 64
const hi = lo * Math.pow(2, Core.AMMO_WINDOW - 1);  // 64×4=256
for (let k = 0; k < 500; k++) {
  const a = Core.genAmmo(s);
  assert(Number.isInteger(Math.log2(a)), 'ammo 是 2 的幂');
  assert(a >= lo && a <= hi, `ammo ${a} 落在 [${lo}, ${hi}]`);
}
console.log('test-core: ammo 区间不变量 OK');
