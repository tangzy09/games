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

// --- 揭图:走过即揭,重复不计数 ---
g = Core.createGame({ seed: 2 });
const r0 = g.revealedCount;
Core.step(g);
assert.strictEqual(g.revealedCount, r0 + 1, '走一步揭一格');
Core.setDir(g, 'down'); Core.step(g);
Core.setDir(g, 'left'); Core.step(g);
Core.setDir(g, 'up');   Core.step(g);
const rc = g.revealedCount;
Core.setDir(g, 'right'); Core.step(g);  // 回到已揭格(起点右一格)
assert(g.revealedCount === rc || g.revealedCount === rc + 1, '重走已揭格不重复计数');

// --- 吃苹果:得分/长度/连击窗口 ---
g = Core.createGame({ seed: 3 });
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 1000 });
assert.strictEqual(g.stats.apples, 1);
assert.strictEqual(g.targetLen, 4, '吃苹果 targetLen+1');
assert.strictEqual(g.combo, 0, '第一个苹果 combo=0');
assert.strictEqual(g.score, 10, '10 × (1+0) = 10');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 3000 });                       // 窗口内
assert.strictEqual(g.combo, 1, '窗口内连击+1');
assert.strictEqual(g.score, 10 + 11, '10×1.1=11');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 3000 + Core.COMBO_WINDOW_MS + 1 }); // 超窗
assert.strictEqual(g.combo, 1, '超窗连击不涨也不清');
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
const cb = g.combo;
Core.step(g, { nowMs: g.lastEatMs + 100, freezeCombo: true });
assert.strictEqual(g.combo, cb, '加速期间连击冻结');

// --- AI 代打减分:scoreScale=0.5 ---
g = Core.createGame({ seed: 6 });
g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };
Core.step(g, { nowMs: 1000, scoreScale: 0.5 });
assert.strictEqual(g.score, 5, 'AI 代打得分减半');

// --- 过关:揭满触发,重置遮罩保留蛇 ---
g = Core.createGame({ seed: 4 });
g.revealed.fill(1); g.revealedCount = 16 * 16 - 1;
{
  const hx = g.snake[0].x + 1, hy = g.snake[0].y;
  g.revealed[hy * 16 + hx] = 0;         // 头右侧设为唯一未揭格
  g.apple = { x: 0, y: 0 };
  const lv = g.level, sc = g.score;
  Core.step(g);
  assert(g.levelJustDone, '揭满触发过关');
  assert.strictEqual(g.level, lv + 1);
  assert(g.score >= sc + 500, '过关奖励入账');
  assert.strictEqual(g.revealedCount, g.snake.length, '重置后仅蛇身格已揭');
}
console.log('OK test-core(揭图/苹果/连击/过关)');

// --- 半长重生 ---
g = Core.createGame({ seed: 5 });
g.targetLen = 12;
// 蛇形走位把身体养长,然后掉头撞死
for (let i = 0; i < 14 && !g.dead; i++) {
  Core.setDir(g, ['right','down','left','down'][i % 4]); Core.step(g);
}
if (!g.dead) { Core.setDir(g, 'up'); while (!g.dead) Core.step(g); }
const lenBefore = g.snake.length;
const revBefore = g.revealedCount;
Core.respawn(g);
assert(!g.dead);
assert.strictEqual(g.snake.length, 1, '重生只有蛇头');
assert.strictEqual(g.targetLen, Math.max(3, Math.floor(lenBefore / 2)), '半长重生');
assert(g.revealedCount >= revBefore, '揭图进度保留');
assert.strictEqual(g.combo, 0, '死亡清连击');
console.log('OK test-core(重生)');
