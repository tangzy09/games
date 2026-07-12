const assert = require('assert');
const Codex = require('../js/codex.js');
const Storage = require('../js/storage.js');
const Tiles = require('../js/tiles.js');
const Core = require('../js/core.js');

// --- 见过即解锁:盘面上真实存在过的值 + 当前弹药 ---
let sv = Storage.defaults();
const g = Core.createGame({ seed: 1 });
g.board = [[2, 4], [8], [], [], []];
g.ammo = 16;
Codex.record(sv, g);
assert.deepStrictEqual(sv.codex.seen, [2, 4, 8, 16], '盘面值 + 弹药值都算见过,且升序');
assert(Codex.isSeen(sv, 2) && Codex.isSeen(sv, 16));
assert(!Codex.isSeen(sv, 32), '没出现过的不算');

// --- 幂等:重复 record 不产生重复项 ---
Codex.record(sv, g);
assert.deepStrictEqual(sv.codex.seen, [2, 4, 8, 16], '重复 record 不重复计入');

// --- 计数:每见一次累加(开放 map,动态 key) ---
assert.strictEqual(sv.stats.fishSeenCount[2], 2, '见过两次(两轮 record)');

// --- ⚠ 允许有洞:指数合并可跳档,没出现过的档位就该如实显示未解锁 ---
sv = Storage.defaults();
const g2 = Core.createGame({ seed: 1 });
g2.board = [[2], [8], [], [], []];     // 从没出现过 4
g2.ammo = 2;
Codex.record(sv, g2);
assert(Codex.isSeen(sv, 8), '8 见过');
assert(!Codex.isSeen(sv, 4), '4 从没出现过 → 如实未解锁(不许用「≤maxTile 就全解锁」去填洞撒谎)');

// --- 进度统计 ---
const p = Codex.progress(sv);
assert.strictEqual(p.total, Tiles.TILES.length, '总数 = 鱼梯档数');
assert.strictEqual(p.seen, 2, '见过 2 条(2 和 8)');

// --- entries: 给 UI 用的完整列表(每档:值/鱼id/是否解锁),顺序 = 鱼梯顺序 ---
const es = Codex.entries(sv);
assert.strictEqual(es.length, Tiles.TILES.length);
assert.strictEqual(es[0].v, 2);
assert.strictEqual(es[0].fish, Tiles.TILES[0].fish);
assert.strictEqual(es[0].seen, true, '2 见过');
assert.strictEqual(es[1].v, 4);
assert.strictEqual(es[1].seen, false, '4 未见过');
assert.strictEqual(es[2].seen, true, '8 见过');

// --- 真实一局跑下来,图鉴应该攒起来 ---
sv = Storage.defaults();
const g3 = Core.createGame({ seed: 77 });
let n = 0;
while (!g3.dead && n < 500) { Core.shoot(g3, n % g3.cols); Codex.record(sv, g3); n++; }
assert(Codex.progress(sv).seen >= 3, '一整局下来至少见过 3 档鱼,实为 ' + Codex.progress(sv).seen);

console.log('test-codex OK');
