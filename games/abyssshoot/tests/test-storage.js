const assert = require('assert');
const Storage = require('../js/storage.js');
const Core = require('../js/core.js');

// 内存后端(测试用)
function mem() {
  const m = {};
  return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, _m: m };
}

// --- 空档 → defaults ---
let b = mem();
let s = Storage.load(b, 'k');
assert.strictEqual(s.v, Storage.SAVE_V);
assert.strictEqual(s.best.score, 0);
assert.strictEqual(s.best.maxTile, 0);
assert.deepStrictEqual(s.codex.seen, []);
assert.strictEqual(s.run, null);

// --- 存 → 读回 ---
s.best.score = 1234; s.best.maxTile = 256; s.codex.seen = [2, 4, 8];
Storage.save(b, 'k', s);
let s2 = Storage.load(b, 'k');
assert.strictEqual(s2.best.score, 1234);
assert.deepStrictEqual(s2.codex.seen, [2, 4, 8]);

// --- 版本不匹配 → 整份丢弃回 defaults(绝不迁移) ---
b = mem();
b.set('k', JSON.stringify({ v: 999, best: { score: 9e9 }, codex: { seen: [2] } }));
s = Storage.load(b, 'k');
assert.strictEqual(s.best.score, 0, '版本不匹配必须整份丢弃,不许把旧数据带进来');

// --- 保守合并:老档缺字段 → 用 default 补齐(同版本) ---
b = mem();
b.set('k', JSON.stringify({ v: Storage.SAVE_V, best: { score: 500 } }));   // 缺 maxTile/codex/run
s = Storage.load(b, 'k');
assert.strictEqual(s.best.score, 500, '存档里有的保留');
assert.strictEqual(s.best.maxTile, 0, '存档里缺的用 default 补');
assert.deepStrictEqual(s.codex.seen, [], '缺的整块用 default');

// --- ⚠ 开放 map:defaults 里是空对象的字段必须整体透传(动态 key 不许被清空) ---
b = mem();
b.set('k', JSON.stringify({ v: Storage.SAVE_V, stats: { fishSeenCount: { 256: 3, 512: 1 } } }));
s = Storage.load(b, 'k');
assert.deepStrictEqual(s.stats.fishSeenCount, { 256: 3, 512: 1 },
  '开放 map 的动态 key 必须原样保住(snake 的 Critical:塞非空默认会让它每次 load 被清空)');

// --- 当局快照 → 恢复 ---
const g = Core.createGame({ seed: 42 });
Core.shoot(g, 0); Core.shoot(g, 1); Core.shoot(g, 2);
const snap = Storage.snapshotRun(g);
const json = JSON.parse(JSON.stringify(snap));      // 必须可 JSON 化(rand 是函数,要剥掉)
const r = Storage.restoreRun(json);
assert.deepStrictEqual(r.board, g.board, '盘面原样恢复');
assert.strictEqual(r.score, g.score);
assert.strictEqual(r.maxTile, g.maxTile);
assert.strictEqual(r.shots, g.shots);
assert.strictEqual(r.ammo, g.ammo);
assert.deepStrictEqual(r.queue, g.queue);
assert.strictEqual(typeof r.rand, 'function', '恢复后必须有可用的 rand(换新种子,不影响公平)');
Core.shoot(r, 0);                                    // 恢复后能继续玩,不炸
assert(r.shots === g.shots + 1);

// --- ⚠ 形状校验:畸形快照一律丢弃(否则恢复成 0×0 盘面 = 无报错白屏) ---
assert.strictEqual(Storage.restoreRun(null), null);
assert.strictEqual(Storage.restoreRun({ v: 999, board: [[], [], [], [], []] }), null, '版本不符 → 丢弃');
assert.strictEqual(Storage.restoreRun({ v: Storage.SAVE_V, board: [[], []] }), null, '列数不符 → 丢弃');
assert.strictEqual(Storage.restoreRun({ v: Storage.SAVE_V, board: 'nope' }), null, '盘面不是数组 → 丢弃');

// --- ⚠ 数值字段的类型校验(光查数组不够) ---
// 合法基底:改一个字段就该被拒/被净化
const ok = () => ({ v: Storage.SAVE_V, board: [[2], [], [], [], []], cols: 5, rows: 9,
                    ammo: 4, queue: [2, 4, 8], score: 10, maxTile: 4,
                    shots: 3, shotsSinceSpawn: 1, seed2: 123 });
assert(Storage.restoreRun(ok()), '合法基底本身必须能恢复(否则下面的负向断言不成立)');

// ammo 畸形 → 整份丢弃(否则 Core.shoot 把 undefined push 进棋盘 → 画面出现 "undefined" 文字块)
for (const bad of [undefined, 0, '8', null, NaN, -2]) {
  const s0 = ok(); s0.ammo = bad;
  assert.strictEqual(Storage.restoreRun(s0), null, `ammo=${JSON.stringify(bad)} → 必须丢弃`);
}
// queue 里混进畸形值 → 整份丢弃(它会成为下一发弹药)
for (const bad of [undefined, 0, 'x', null]) {
  const s0 = ok(); s0.queue = [2, bad, 8];
  assert.strictEqual(Storage.restoreRun(s0), null, `queue 含 ${JSON.stringify(bad)} → 必须丢弃`);
}
// board 里混进畸形值 → 整份丢弃
{
  const s0 = ok(); s0.board = [[2, 'x'], [], [], [], []];
  assert.strictEqual(Storage.restoreRun(s0), null, 'board 含非数字 → 必须丢弃');
}
// 计数字段被污染成非空字符串:`"abc" || 0` 是 truthy 会漏过 → 必须归 0 的数字,
// 否则 `s.score += gained` 变字符串拼接,分数彻底乱。
{
  const s0 = ok(); s0.score = 'abc'; s0.maxTile = 'x'; s0.shots = {}; s0.shotsSinceSpawn = 'y';
  const r0 = Storage.restoreRun(s0);
  assert(r0, '计数字段脏不至于丢档(净化即可,能玩的 board/ammo 是好的)');
  assert.strictEqual(r0.score, 0, 'score="abc" → 净化成数字 0,不是字符串');
  assert.strictEqual(typeof r0.score, 'number');
  assert.strictEqual(r0.maxTile, 0);
  assert.strictEqual(r0.shots, 0);
  assert.strictEqual(r0.shotsSinceSpawn, 0);
  // 真的能继续算分,而不是字符串拼接
  Core.shoot(r0, 0);
  assert.strictEqual(typeof r0.score, 'number', '恢复后继续玩,分数必须仍是数字');
}

console.log('test-storage OK');
