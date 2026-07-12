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

console.log('test-storage OK');
