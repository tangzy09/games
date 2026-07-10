const assert = require('assert');
const Core = require('../js/core.js');

// --- 初始状态 ---
let g = Core.createGame({ seed: 1 });
assert.strictEqual(g.cols, 16); assert.strictEqual(g.rows, 16);
assert.strictEqual(g.snake.length, 1, '开局只有蛇头');
assert.strictEqual(g.targetLen, 3);
assert(!g.dead);

// --- 移动:头前进,身体渐长到 targetLen ---
g = Core.createGame({ seed: 1 });
const h0 = { ...g.snake[0] };
Core.step(g);
assert.strictEqual(g.snake[0].x, h0.x + 1, '默认向右');
Core.step(g); Core.step(g); Core.step(g);
assert.strictEqual(g.snake.length, 3, '长到 targetLen 后不再涨');

// --- 撞墙死 ---
g = Core.createGame({ seed: 1 });
for (let i = 0; i < 20 && !g.dead; i++) Core.step(g);
assert(g.dead, '一直向右必撞墙');
assert.strictEqual(g.deaths, 1);

// --- 180° 禁转(len>1)与撞自己 ---
g = Core.createGame({ seed: 1 });
Core.step(g); Core.step(g); Core.step(g);          // len=3, dir right
Core.setDir(g, 'left');                             // 应被忽略
Core.step(g);
assert(!g.dead, '180° 掉头被忽略,不应死');
// 绕小圈撞自己
// 注:原计划坐标(targetLen=3,6步右+下左上)在实测中永远不会自撞——
// 长度3时,collision 检测跳过尾格(尾格同步让位),而唯一非尾格是"上一步头位置",
// 该格与 180° 禁转命中同一格,已被 setDir 拦下,故三格蛇不可能在非 180° 路径下撞自己。
// 保持测试意图(转向后应撞到早先经过的身体格)不变,把 targetLen 调大到 6 让身体够长,
// 这样 down→left→up 的小圈才会真正圈回到还未让位的旧身体格上。
g = Core.createGame({ seed: 1 });
g.targetLen = 6;
for (let i = 0; i < 6; i++) Core.step(g);           // 长到 len=6 直行
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'left'); Core.step(g);
Core.setDir(g, 'up');   Core.step(g);               // 撞回自己身体
assert(g.dead, '撞自己应死');
console.log('OK test-core(骨架)');
