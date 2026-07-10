// games/snake/tests/test-storage.js
const assert = require('assert');
const Storage = require('../js/storage.js');
const Core = require('../js/core.js');

// 注入内存后端
function memBackend() {
  const m = {};
  return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, _m: m };
}

// --- 空后端 → 默认档 ---
{
  const be = memBackend();
  const s = Storage.load(be, 'snake_save');
  assert.strictEqual(s.v, 1);
  assert.deepStrictEqual(s.ach.unlocked, []);
  assert.strictEqual(s.stats.apples, 0);
  assert.strictEqual(s.run, null);
}
// --- 写读闭环 ---
{
  const be = memBackend();
  const s = Storage.load(be, 'k');
  s.stats.apples = 42; s.ach.unlocked.push('img_1');
  Storage.save(be, 'k', s);
  const s2 = Storage.load(be, 'k');
  assert.strictEqual(s2.stats.apples, 42);
  assert.deepStrictEqual(s2.ach.unlocked, ['img_1']);
}
// --- 坏档/旧版本 → 不崩,回默认(字段保守合并) ---
{
  const be = memBackend();
  be.set('k', '{broken json');
  const s = Storage.load(be, 'k');
  assert.strictEqual(s.v, 1, '坏档回默认');
  be.set('k', JSON.stringify({ v: 0, stats: { apples: 7 } }));
  const s2 = Storage.load(be, 'k');
  assert.strictEqual(s2.v, 1, '旧版本升到当前');
  assert.strictEqual(s2.stats.apples, 7, '已有字段保留');
  assert(Array.isArray(s2.ach.unlocked), '缺失字段补默认');
}
// --- 开放 map(specials/skinClears)round-trip:动态 key 不许被 merge 清空(P2b 审查 Critical) ---
{
  const be = memBackend();
  const s = Storage.load(be, 'k');
  s.stats.specials = { gold: 7, twin: 3 };
  s.stats.skinClears = { star: 2 };
  Storage.save(be, 'k', s);
  const s2 = Storage.load(be, 'k');
  assert.strictEqual(s2.stats.specials.gold, 7, 'specials 动态 key 保留');
  assert.strictEqual(s2.stats.specials.twin, 3);
  assert.strictEqual(s2.stats.skinClears.star, 2, 'skinClears 动态 key 保留');
}
// --- 当局快照:序列化 core state → 恢复后逐字段一致且可继续 step ---
{
  const g = Core.createGame({ seed: 33 });
  for (let i = 0; i < 30; i++) {
    Core.setDir(g, ['right', 'down', 'left', 'down'][i % 4]);
    Core.step(g, { nowMs: 1000 + i * 100 });
    if (g.dead) Core.respawn(g);
  }
  const snap = Storage.snapshotRun(g, 5, 12345);      // (state, imgPos, gameMs)
  const r = Storage.restoreRun(snap);
  assert.strictEqual(r.imgPos, 5);
  assert.strictEqual(r.gameMs, 12345);
  const h = r.state;
  assert.deepStrictEqual(h.snake, g.snake);
  assert.strictEqual(h.revealedCount, g.revealedCount);
  assert.strictEqual(h.score, g.score);
  assert.strictEqual(h.targetLen, g.targetLen);
  assert.deepStrictEqual(Array.from(h.revealed), Array.from(g.revealed));
  assert.deepStrictEqual(h.effects, g.effects);
  Core.step(h, { nowMs: 99999 });                     // 恢复态可继续跑
  assert(!isNaN(h.score));
}
// --- lastEatMs=-Infinity 经 JSON round-trip 不许变 null(否则续玩首吃连击判定坏) ---
{
  const g = Core.createGame({ seed: 34 });
  assert.strictEqual(g.lastEatMs, -Infinity, 'sanity: 新局 -Infinity');
  const r = Storage.restoreRun(Storage.snapshotRun(g, 0, 0));
  assert.strictEqual(r.state.lastEatMs, -Infinity, '恢复后回填 -Infinity');
}
console.log('OK test-storage');
