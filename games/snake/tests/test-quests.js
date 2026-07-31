// test-quests.js — 每日任务 + 插屏闸门（纯逻辑）
const assert = require('assert');
const Quests = require('../js/quests.js');
const AdGate = require('../js/adgate.js');

// ════════ 每日任务：确定性、进度、完成、跨天重置 ════════
{
  const day = '2026-08-01';
  assert.deepStrictEqual(Quests.todays(day), Quests.todays(day), '同一天恒同组（确定性，全球一致）');
  const qs = Quests.todays(day);
  assert.strictEqual(qs.length, 3);
  assert.strictEqual(new Set(qs.map(q => q.t)).size, 3, '3 个任务类型互不相同');
  assert(qs.every(q => q.target > 0));

  const save = {};
  const sumQ = qs.find(q => q.mode === 'sum');
  let done = [];
  for (let i = 0; i < sumQ.target; i++) done = done.concat(Quests.bump(save, day, sumQ.t, 1));
  assert.strictEqual(done.length, 1, '攒满目标恰好完成一次');
  assert.deepStrictEqual(Quests.bump(save, day, sumQ.t, 99), [], '完成后不再重复发奖');
  assert(Quests.status(save, day).find(q => q.t === sumQ.t).done, 'status 反映完成态');
  assert.deepStrictEqual(Quests.bump(save, day, sumQ.t, 0), [], '零增量不上报');

  const maxQ = qs.find(q => q.mode === 'max');
  if (maxQ) {
    Quests.bump(save, day, maxQ.t, maxQ.target - 1);
    Quests.bump(save, day, maxQ.t, 1);
    assert.strictEqual(Quests.status(save, day).find(q => q.t === maxQ.t).prog, maxQ.target - 1,
      'max 型取最大值，不累加（单局连击不能靠多局攒）');
  }
  // 跨天自动重置
  Quests.ensure(save, '2026-08-02');
  assert.strictEqual(save.quests.day, '2026-08-02');
  assert.deepStrictEqual(save.quests.done, [], '新的一天进度清零');
  // 存档只存进度、不存题面（题面由日期推导）
  assert.deepStrictEqual(Object.keys(save.quests).sort(), ['day', 'done', 'prog']);
  console.log('test-quests: 每日任务 OK');
}

// ════════ 插屏总闸门：前 50 关免 / 每 10 关至多 1 个 / ≥2min ════════
{
  const now = 1e12;
  const st = { levelsCleared: 0, levelsSinceAd: 0, lastAdAt: 0 };
  // 蜜月期：哪怕过关数攒够也不出
  for (let lv = 1; lv <= 50; lv++) {
    st.levelsCleared = lv; st.levelsSinceAd = 99;
    assert(!AdGate.canShow(st, now), `第 ${lv} 关仍在蜜月期（前 50 关零插屏）`);
  }
  st.levelsCleared = 51;
  assert(AdGate.canShow(st, now), '第 51 关起才可能出第一个');
  AdGate.noteShown(st, now);
  assert.strictEqual(st.levelsSinceAd, 0);
  assert.strictEqual(st.lastAdAt, now);
  // 频次闸门
  for (let i = 1; i < 10; i++) {
    st.levelsSinceAd = i; st.levelsCleared += 1;
    assert(!AdGate.canShow(st, now + 1e7), `距上次 ${i} 关，还不够 10 关`);
  }
  st.levelsSinceAd = 10;
  assert(AdGate.canShow(st, now + 1e7), '攒满 10 关才有下一个');
  // 时间闸门
  assert(!AdGate.canShow(st, now + 60000), '⛔ 距上次插屏不足 2 分钟不出');
  console.log('test-quests: 插屏闸门 OK（前 50 关免 / 每 10 关至 1 / 2min）');
}
