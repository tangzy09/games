// games/snake/tests/test-ai.js
const assert = require('assert');
const AI = require('../js/ai.js');
const Core = require('../js/core.js');

const cyc = AI.buildCycle(16, 16);
assert.strictEqual(cyc.order.length, 256, '回路覆盖全部 256 格');
const seen = new Set(cyc.order.map(c => c.y * 16 + c.x));
assert.strictEqual(seen.size, 256, '每格恰好一次');
for (let i = 0; i < 256; i++) {
  const a = cyc.order[i], b = cyc.order[(i + 1) % 256];
  assert.strictEqual(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1,
    `第 ${i} 步必须相邻(含首尾闭合)`);
}
assert.strictEqual(cyc.indexOf[cyc.order[7].y * 16 + cyc.order[7].x], 7, 'indexOf 反查');
console.log('OK test-ai(回路)');

{
  const g = Core.createGame({ seed: 11 });
  const mem = AI.createMem();
  mem.forcePure = true;                  // 测试钩子:只走回路
  let levels = 0;
  for (let i = 0; i < 10000 && levels < 2; i++) {
    Core.setDir(g, AI.nextMove(g, cyc, mem));
    Core.step(g);
    assert(!g.dead, `纯回路第 ${i} 步不该死`);
    if (g.levelJustDone) levels++;
  }
  assert(levels >= 2, '纯回路 10000 步内至少通关 2 次');
}
console.log('OK test-ai(纯回路)');

{
  let totalSteps = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = Core.createGame({ seed });
    const mem = AI.createMem();
    let levels = 0, steps = 0;
    while (levels < 2) {
      Core.setDir(g, AI.nextMove(g, cyc, mem));
      Core.step(g);
      steps++;
      assert(!g.dead, `seed=${seed} 第 ${steps} 步死亡——安全不变式被破坏`);
      assert(steps < 20000, `seed=${seed} 超 2 万步未通 2 关——揭图停滞`);
      if (g.levelJustDone) levels++;
    }
    totalSteps += steps;
    assert(g.stats.apples > 0, '捷径模式应吃到苹果');
  }
  assert(totalSteps >= 2048, 'sanity:至少走完理论下限');
  console.log(`  完整 AI 5 种子 ×2 关,总步数 ${totalSteps},零死亡`);
}
console.log('OK test-ai(捷径+保证通关)');

{
  // 压力测试:再跑 3 个种子各通 3 关,确保多种子零死亡不是运气
  let totalSteps = 0;
  for (const seed of [7, 8, 9]) {
    const g = Core.createGame({ seed });
    const mem = AI.createMem();
    let levels = 0, steps = 0;
    while (levels < 3) {
      Core.setDir(g, AI.nextMove(g, cyc, mem));
      Core.step(g);
      steps++;
      assert(!g.dead, `压力测试 seed=${seed} 第 ${steps} 步死亡`);
      assert(steps < 30000, `压力测试 seed=${seed} 超 3 万步未通 3 关`);
      if (g.levelJustDone) levels++;
    }
    totalSteps += steps;
  }
  console.log(`  压力测试 3 种子 ×3 关,总步数 ${totalSteps},零死亡`);
}
console.log('OK test-ai(压力测试)');
