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
  let spawnedTotal = 0, eatenTotal = 0;   // 特殊果集成:跨 5 种子累计
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
    spawnedTotal += g.stats.specialsSpawned;
    eatenTotal += Object.values(g.stats.specials).reduce((a, b) => a + b, 0);
  }
  assert(totalSteps >= 2048, 'sanity:至少走完理论下限');
  assert(spawnedTotal > 0, `特殊果在 AI 局中确实刷新(spawned=${spawnedTotal})`);
  assert(eatenTotal > 0, `AI 确实吃到特殊果(eaten=${eatenTotal})——目标选择生效`);
  console.log(`  完整 AI 5 种子 ×2 关,总步数 ${totalSteps},零死亡`);
  console.log(`  特殊果:刷新 ${spawnedTotal} 个,AI 吃到 ${eatenTotal} 个`);
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

{
  // --- 确定性用例 a:180° 冲突——回路建议方向恰为 OPP[dir] ---
  // 回路第 0 行是 x 0→15 正向段,(5,0) 的后继是 (6,0),建议 'right'。
  // 手工构造 dir='left' 的蛇(neck 在 (6,0)),建议 'right' === OPP['left'],
  // 会被 setDir 忽略导致直行——nextMove 必须给出一个安全的替代方向。
  const g = Core.createGame({ seed: 42 });
  g.snake = [{ x: 5, y: 0 }, { x: 6, y: 0 }];
  g.dir = 'left'; g.nextDir = 'left';
  g.targetLen = 2;
  g.apple = { x: 0, y: 15 };
  const mem = AI.createMem();
  const mv = AI.nextMove(g, cyc, mem);
  assert.notStrictEqual(mv, 'right', '不许返回会被 setDir 忽略的 180° 方向');
  const d = Core.DIRS[mv];
  const nx = g.snake[0].x + d.x, ny = g.snake[0].y + d.y;
  assert(nx >= 0 && ny >= 0 && nx < 16 && ny < 16, `方向 ${mv} 不出界`);
  assert(!g.snake.some(c => c.x === nx && c.y === ny), `方向 ${mv} 不撞身`);
}
console.log('OK test-ai(180°防御)');

{
  // --- 确定性用例 b:BFS 追尾兜底——头被半包围,唯一活路是能追到尾巴的方向 ---
  // 头 (3,3),dir='down'(neck (3,2),'up' 是 OPP)。回路 y=3 行是 x 15→1 反向段,
  // (3,3) 的后继是 (2,3)——已被身体占据,建议方向直接致死。
  // forcePure 跳过捷径层,让致死建议原样传到兜底层。
  // 'down'→(3,4) 不立即致死,但 {(3,4),(3,5)} 是身体围成的死口袋(BFS 到不了尾巴);
  // 'right'→(4,3) 开阔,可绕到尾巴 (6,4)。兜底必须选 'right' 而非口袋。
  const g = Core.createGame({ seed: 43 });
  g.snake = [
    { x: 3, y: 3 },                                   // 头
    { x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 },   // (2,3) 挡死回路建议
    { x: 2, y: 4 }, { x: 2, y: 5 }, { x: 2, y: 6 },   // 口袋左壁
    { x: 3, y: 6 },                                   // 口袋底
    { x: 4, y: 6 }, { x: 4, y: 5 }, { x: 4, y: 4 },   // 口袋右壁
    { x: 5, y: 4 }, { x: 6, y: 4 },                   // 尾巴在开阔区
  ];
  g.dir = 'down'; g.nextDir = 'down';
  g.targetLen = g.snake.length;
  g.apple = { x: 15, y: 15 };
  const mem = AI.createMem();
  mem.forcePure = true;
  const mv = AI.nextMove(g, cyc, mem);
  assert.strictEqual(mv, 'right', `半包围局面必须选追得到尾巴的 'right',实际 ${mv}`);
}
console.log('OK test-ai(BFS追尾兜底)');
