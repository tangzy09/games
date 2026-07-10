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
