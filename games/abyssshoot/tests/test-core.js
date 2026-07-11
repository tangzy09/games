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

// --- 连通块 N 个 → 合并 N-1 次 → V × 2^(N-1)(「憋大团」= 指数级大奖) ---
s = Core.createGame({ seed: 1 });
s.board = [[2, 2], [2], [], [], []];   // L 形 3 个 2 → 合 2 次 → 2×2^2 = 8
Core.resolve(s);
const flat = s.board.flat();
assert.deepStrictEqual(flat, [8], '3 连 → ×2^2 = 8');

// 指数规则逐档验证 + 经济学:2 连不赚不亏,3 连起净赚(旧规则是「团越大亏越多」,反玩家,已废弃)
for (const [n, expect] of [[2, 8], [3, 16], [4, 32], [5, 64]]) {
  const g = Core.createGame({ seed: 1 });
  g.board = [Array.from({ length: n }, () => 4), [], [], [], []];
  Core.resolve(g);
  assert.deepStrictEqual(g.board.flat(), [expect], `${n} 个 4 相连 → 4×2^${n - 1} = ${expect}`);
  const before = n * 4, after = expect;
  assert(after >= before, `${n} 连不该亏(总值 ${before}→${after})`);
}

// --- 连锁:2,2 顶上还有个 4 → 合出 4 再与之连锁成 8,两轮 ---
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];  // index0=4,index1=2,index2=2
r = Core.resolve(s);
assert.deepStrictEqual(s.board[0], [8], '2,2→4 再与顶部 4→8');
assert.strictEqual(r.chain, 2, '两轮连锁');
assert.strictEqual(s.score, 4 * 1 + 8 * 2, '第1轮4×1 + 第2轮8×2');
assert(s.events.some(e => e.t === 'chain' && e.n === 2), '两轮连锁发 chain 事件 n=2');
assert.strictEqual(s.events.filter(e => e.t === 'merge').length, 2, '两次合并两条 merge 事件');
assert.strictEqual(r.merges, 2, 'merges 计数=2');

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

// --- spawnRow: 每列顶部各加一条鱼、原有下移;新鱼必须是**盘上已有的值**(不是恒定的 2/4) ---
s = Core.createGame({ seed: 7 });
s.board = [[16], [32], [], [64], []];
const onBoard = new Set(s.board.flat());     // {16,32,64}
Core.spawnRow(s);
for (let c = 0; c < 5; c++) {
  assert(onBoard.has(s.board[c][0]), `列${c} 顶部的新鱼必须是盘上已有的值(否则刷下来合不掉)`);
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

// --- 优先向击中块合并:跨列块必须合到「你打中的那一列」,而不是几何最低最左 ---
// 布局:列0=[4,4](index 0,1) 列1=[4](index 0);往列1 射一发 4 → 列1=[4,4]
// 四个 4 全连通(同 index 横邻 + 同列竖邻),N=4 → 4×2^3 = 32
// 几何锚点会选 {c:0,i:1}(最低 i=1,并列时取最左 c=0) → 鱼长在列0(你没瞄的那列)
// 新规则:击中格是 {c:1,i:1} → 鱼必须长在**列1**
s = Core.createGame({ seed: 1 });
s.board = [[4, 4], [4], [], [], []];
s.ammo = 4;
Core.shoot(s, 1);
assert.deepStrictEqual(s.board[1], [32], '合出的 32 必须落在击中的列1');
assert.deepStrictEqual(s.board[0], [], '列0 应被清空(鱼没长在这)');
// 反证:同样盘面直接 resolve(无击中格)→ 回退几何锚点,鱼长在列0
s = Core.createGame({ seed: 1 });
s.board = [[4, 4], [4, 4], [], [], []];
Core.resolve(s);
assert.deepStrictEqual(s.board[0], [32], '无击中格时回退几何锚点(最低最左)→ 列0');
assert.deepStrictEqual(s.board[1], [], '列1 空');

// --- 连锁时:大鱼在「上一轮合出的位置」原地滚雪球,不乱窜 ---
// 列1 底部打中 → 合出鱼在列1;若该鱼又与别处同值连锁,仍以它为锚
s = Core.createGame({ seed: 1 });
s.board = [[8], [4], [], [], []];   // 列0=[8] 列1=[4]
s.ammo = 4;
Core.shoot(s, 1);                    // 列1=[4,4] → 两个 4 合成 8(锚=击中格 {c:1,i:1})
                                     // 该 8 与列0 的 8 同 index? 压实后列1=[8](i=0),列0=[8](i=0) → 横邻 → 再合成 16
assert.deepStrictEqual(s.board.flat(), [16], '连锁合成 16');
assert.deepStrictEqual(s.board[1], [16], '连锁后的大鱼仍在击中的列1(原地滚雪球)');

// --- 越界/死局不炸 ---
s = Core.createGame({ seed: 1 });
Core.shoot(s, 9);          // 越界:无操作
assert.strictEqual(s.shots, 0, '越界不计');
Core.shoot(s, -1);         // 负向越界:也无操作
assert.strictEqual(s.shots, 0, '负向越界也不计');
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

// --- ⚠ 核心不变量:防「两端死墙」——弹药与刷行都必须配得上盘面上真实存在的值 ---
// 踩坑史(玩家两次实战撞出):
//   ① 弹药挂「盘上最小值」+ 刷行恒生 2 → 最小值被钉死在 2 → 弹药永远{2,4,8} → 大鱼合不动(大鱼死墙)
//   ② 弹药挂 baseTier(只升不降) → 早期留在盘上的 2/4 再也抽不到 → 小鱼合不掉(小鱼死墙,同病反向)
// 结构性解法:直接从**盘面现有值**抽样。以下两条断言把这条性质钉死。

// (a) 弹药永远是「盘上真实存在的值」——不会出现盘上没有、你却拿到的废弹
s = Core.createGame({ seed: 5 });
s.board = [[2, 512], [4, 256], [1024], [], []];
const present = new Set(s.board.flat());
for (let k = 0; k < 800; k++) {
  const a = Core.genAmmo(s);
  assert(present.has(a), `弹药 ${a} 必须是盘上真实存在的值(不能是废弹)`);
}
// (b) 盘上**每一个**不同的值都抽得到(含最大和最小)——两端都不会被永久遗弃
const seenAmmo = new Set(), seenSpawn = new Set();
for (let k = 0; k < 20000; k++) seenAmmo.add(Core.genAmmo(s));
for (const v of present) {
  assert(seenAmmo.has(v), `盘上的 ${v} 必须抽得到弹药(否则它成为永久合不掉的死墙)`);
}
// (c) 刷行的鱼同样只从盘面抽 → 刷下来的必定是你合得掉的东西
for (let k = 0; k < 20000; k++) {
  const g = Core.createGame({ seed: 9 });
  g.board = [[2, 512], [4, 256], [1024], [], []];
  seenSpawn.add(Core.pickFromBoard(g, Core.SPAWN_BIAS));
}
for (const v of seenSpawn) assert(present.has(v), `刷行的鱼 ${v} 必须是盘上存在的值`);
// (d) 空盘兜底:从最小档起手,不炸
const empty = Core.createGame({ seed: 1 });
assert.strictEqual(Core.genAmmo(empty), Core.TILE_MIN, '空盘弹药 = TILE_MIN');
console.log('test-core: 弹药/刷行 从盘面抽样 不变量 OK(防两端死墙)');

// ── P2a-1: 级联逐轮快照(动画回放要用) ──
// snapBoard 深拷贝,round 事件带本轮合并明细 + 本轮结算后的盘面
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];   // 2+2→4,再与顶部 4→8:两轮
Core.resolve(s);
const rounds = s.events.filter(e => e.t === 'round');
assert.strictEqual(rounds.length, 2, '两轮级联发两个 round 事件');
assert.strictEqual(rounds[0].n, 1, '第一轮 n=1');
assert.strictEqual(rounds[1].n, 2, '第二轮 n=2');
// 每轮带本轮合并明细
assert.strictEqual(rounds[0].merges.length, 1, '第1轮一次合并');
assert.strictEqual(rounds[0].merges[0].value, 2, '合的是 2');
assert.strictEqual(rounds[0].merges[0].nv, 4, '合成 4');
assert.strictEqual(rounds[0].merges[0].cells.length, 2, '两个 2 参与');
assert.deepStrictEqual(rounds[0].merges[0].anchor, { c: 0, i: 2 }, '锚点=最低');
// 每轮带「本轮结算+重力后」的盘面快照
assert.deepStrictEqual(rounds[0].board[0], [4, 4], '第1轮后:2,2合成4,与顶部4并列');
assert.deepStrictEqual(rounds[1].board[0], [8], '第2轮后:4,4→8');
// 最后一轮的快照 === 最终盘面
assert.deepStrictEqual(rounds[rounds.length - 1].board, s.board.map(c => c.slice()),
  '末轮快照应等于最终盘面');
// 快照是深拷贝:改快照不该动到真盘
rounds[0].board[0].push(999);
assert.deepStrictEqual(s.board[0], [8], '快照是深拷贝,不与真盘共享引用');

// shoot 事件带「弹药落定后、结算前」的盘面(动画起始帧)
s = Core.createGame({ seed: 1 });
s.board = [[], [], [8], [], []];
s.ammo = 4;                                  // 与 8 不同数,不会合并,盘面可预期
Core.shoot(s, 2);
const shotEv = s.events.find(e => e.t === 'shoot');
assert(shotEv && shotEv.board, 'shoot 事件带盘面快照');
assert.deepStrictEqual(shotEv.board[2], [8, 4], '快照是「弹药已落底、尚未结算」的盘面');

// spawn 事件带刷行后的盘面
s = Core.createGame({ seed: 3 });
s.board = [[16], [32], [], [64], []];
Core.spawnRow(s);
const spEv = s.events.find(e => e.t === 'spawn');
assert(spEv && spEv.board, 'spawn 事件带盘面快照');
assert.strictEqual(spEv.board[0].length, 2, '刷行后列0 两格');
assert.deepStrictEqual(spEv.board[0].slice(1), [16], '原有格被下移');

// 旧契约不许破:merge/chain 事件仍在(音效/成就在消费)
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];
const rr = Core.resolve(s);
assert.strictEqual(s.events.filter(e => e.t === 'merge').length, 2, 'merge 事件仍发');
assert(s.events.some(e => e.t === 'chain' && e.n === 2), 'chain 事件仍发');
assert.strictEqual(rr.merges, 2, 'resolve 返回值不变');
console.log('test-core: 级联快照 OK');
