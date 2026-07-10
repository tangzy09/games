const assert = require('assert');
const Ach = require('../js/achievements.js');
const Storage = require('../js/storage.js');

// --- 定义完整性:恰 100 累计 + 20 单局,id 无重复 ---
{
  assert.strictEqual(Ach.CUM_DEFS.length, 100, '累计成就恰 100');
  assert.strictEqual(Ach.RUN_ACHS.length, 20, '单局成就恰 20');
  const ids = [...Ach.CUM_DEFS.map(d => d.id), ...Ach.RUN_ACHS.map(d => d.id)];
  assert.strictEqual(new Set(ids).size, 120, 'id 无重复');
}
// --- 累计族:过阈值解锁一次、不重复 ---
{
  const s = Storage.defaults();
  s.stats.apples = 99;
  assert.deepStrictEqual(Ach.checkCum(s).unlocked, [], '99 苹果不解锁');
  s.stats.apples = 100;
  const r1 = Ach.checkCum(s);
  assert(r1.unlocked.includes('apple_1'), '100 苹果解锁 apple_1');
  assert.deepStrictEqual(Ach.checkCum(s).unlocked, [], '不重复解锁');
  s.stats.apples = 10000;
  const r2 = Ach.checkCum(s);
  assert(['apple_2','apple_3','apple_4','apple_5'].every(id => r2.unlocked.includes(id)), '跨档补齐');
}
// --- 点路径计数(specials)与稀有档 ---
{
  const s = Storage.defaults();
  s.stats.specials = { gold: 20 };
  assert(Ach.checkCum(s).unlocked.includes('f_gold_1'), 'specials.gold 点路径生效');
}
// --- 纪录类 AI 局不刷 ---
{
  const s = Storage.defaults();
  Ach.accumulate(s, { combo: 40, snake: { length: 60 }, stats: {} }, [], { aiRun: true, scoreDelta: 0, revealDelta: 0, dtMs: 100 });
  assert.strictEqual(s.stats.maxCombo, 0, 'AI 局不刷 maxCombo');
  Ach.accumulate(s, { combo: 40, snake: { length: 60 }, stats: {} }, [], { aiRun: false, scoreDelta: 0, revealDelta: 0, dtMs: 100 });
  assert.strictEqual(s.stats.maxCombo, 40, '人工局刷新');
  assert.strictEqual(s.stats.maxLen, 60);
}
// --- 单局 tracker:完美/速通/连击/素食 ---
{
  const t = Ach.newTracker(1000, false);
  t.scoreGained = 1200; t.comboMax = 21;   // 直接注入(tracker 是纯数据)
  const s = Storage.defaults();
  const r = Ach.onLevelClear(t, s, 1000 + 60000, { aiRun: false });
  assert(r.unlocked.includes('r_score1'), '1000 分');
  assert(r.unlocked.includes('r_perfect'), '无死亡');
  assert(r.unlocked.includes('r_speed3'), '3 分钟内');
  assert(r.unlocked.includes('r_speed2'), '2 分钟内');
  assert(r.unlocked.includes('r_combo20'), '连击 20');
  assert(r.unlocked.includes('r_vegan'), '素食(没吃特殊果)');
  assert(!r.unlocked.includes('r_score2'), '5000 分未到');
  assert.strictEqual(s.stats.levelsCleared, 1);
  assert.strictEqual(s.stats.noDeathClears, 1);
  assert.strictEqual(s.stats.speedClears, 1);
}
// --- AI 局:图计数照常,单局不判 ---
{
  const t = Ach.newTracker(0, true);
  t.scoreGained = 99999;
  const s = Storage.defaults();
  const r = Ach.onLevelClear(t, s, 30000, { aiRun: true });
  assert.deepStrictEqual(r.unlocked.filter(id => id.startsWith('r_')), [], 'AI 局零单局成就');
  assert.strictEqual(s.stats.levelsCleared, 1, '图计数照常');
  assert.strictEqual(s.stats.aiClears, 1);
  assert.strictEqual(s.stats.noDeathClears, 0, 'AI 局不计无死亡');
}
// --- onStep 事件消费:demon 窗口/twin 限时/边圈/lastBite ---
{
  const t = Ach.newTracker(0, false);
  const run = { combo: 0, snake: { length: 3 }, effects: { ghostUntil: 0 } };
  const st = (events, ms, head) => {
    run.snake[0] = head || { x: 1, y: 1 };
    Ach.onStep(t, run, events, ms);
  };
  st([{ t: 'special', type: 'demon' }], 1000);
  st([{ t: 'apple' }], 2000); st([{ t: 'apple' }], 3000); st([{ t: 'apple' }], 4000);
  assert(t.demonMax >= 3, 'demon 窗口 3 吃');
  st([{ t: 'twinSpawn', batch: 1, at: 5000 }], 5000);
  st([{ t: 'extra', batch: 1 }], 6000);
  st([{ t: 'extra', batch: 1 }], 9000);
  assert(t.twinFast, 'twin 10s 内吃完');
  // 边圈:喂 60 个连续边格头位置
  const t2 = Ach.newTracker(0, false);
  const run2 = { combo: 0, snake: [{ x: 0, y: 0 }], effects: { ghostUntil: 0 } };
  run2.snake.length = 1;
  const per = [];
  for (let x = 0; x < 16; x++) per.push({ x, y: 0 });
  for (let y = 1; y < 16; y++) per.push({ x: 15, y });
  for (let x = 14; x >= 0; x--) per.push({ x, y: 15 });
  for (let y = 14; y >= 1; y--) per.push({ x: 0, y });
  per.forEach((h, i) => { run2.snake[0] = h; Ach.onStep(t2, run2, [], i * 100); });
  assert(t2.edgeDone, '连续 60 边格 = 整圈');
  // lastBite
  const t3 = Ach.newTracker(0, false);
  Ach.onStep(t3, run2, [{ t: 'level' }, { t: 'apple' }], 100);
  assert(t3.lastBite, '揭满同步吃果');
}
// --- 阶梯 UI 数据:tierInfo ---
{
  const info = Ach.tierInfo('apple_3');
  assert.strictEqual(info.threshold, 1000);
  assert.strictEqual(info.counter, 'apples');
}
console.log('OK test-achievements');
