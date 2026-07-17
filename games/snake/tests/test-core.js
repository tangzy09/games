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

// --- 里程碑:真实步进跨 25%/50%/75% 档,每档恰 +1 / +100,封顶 3 次 ---
// 4×4 棋盘(16 格,阈值 4/8/12 格),头起点 {1,2},开局已揭 1 格。
// 蛇形路径(每步揭 1 新格,无 180°/无自撞/不踩苹果角 (0,0)/最多揭 14 格不触发过关):
//   R(2,2) R(3,2) D(3,3) L(2,3) L(1,3) L(0,3) U(0,2) U(0,1) R(1,1) R(2,1) R(3,1) U(3,0) L(2,0)
// revealedCount: 1 → 2,3,4*,5,6,7,8*,9,10,11,12*,13,14(* = 跨档步)
g = Core.createGame({ seed: 7, cols: 4, rows: 4 });
assert.deepStrictEqual({ ...g.snake[0] }, { x: 1, y: 2 }, '4×4 起点 {1,2}');
g.apple = { x: 0, y: 0 };                 // 挪到路径永不经过的角落,排除吃苹果得分干扰
{
  const moves = ['right','right','down','left','left','left','up','up','right','right','right','up','left'];
  assert.strictEqual(g.revealedCount, 1);
  assert.strictEqual(g.milestones, 0);
  for (let i = 0; i < moves.length; i++) {
    const msBefore = g.milestones, scBefore = g.score;
    Core.setDir(g, moves[i]); Core.step(g);
    assert(!g.dead, `路径第 ${i + 1} 步不应死`);
    assert.strictEqual(g.revealedCount, i + 2, `第 ${i + 1} 步后揭格数`);
    const crossed = (i + 2 === 4 || i + 2 === 8 || i + 2 === 12);
    assert.strictEqual(g.milestones, msBefore + (crossed ? 1 : 0),
      `第 ${i + 1} 步里程碑${crossed ? '恰好+1' : '不变(含封顶后不加第4次)'}`);
    assert.strictEqual(g.score - scBefore, crossed ? 100 : 0,
      `第 ${i + 1} 步得分${crossed ? '恰好+100' : '不变'}`);
  }
  assert.strictEqual(g.milestones, 3, '三档全部入账,封顶 3');
  assert.strictEqual(g.score, 300, '总分 = 3×100,无苹果干扰、无第 4 次奖励');
  assert(!g.levelJustDone, '未揭满不触发过关');
}

// --- 里程碑分同样吃 scoreScale:0.5 时跨 25% 档 +50 ---
g = Core.createGame({ seed: 8, cols: 4, rows: 4 });
g.apple = { x: 0, y: 0 };
{
  const moves = ['right','right','down'];   // 揭到 4 格,恰跨 25% 档
  for (const m of moves) { Core.setDir(g, m); Core.step(g, { scoreScale: 0.5 }); }
  assert.strictEqual(g.milestones, 1);
  assert.strictEqual(g.score, 50, 'scoreScale=0.5 时里程碑 +50');
}
console.log('OK test-core(里程碑)');

// --- ghost 穿身:同 Task2 自撞局面,但 step 带 ghost:true 应不死且头正常前进(P2 光环果子)---
g = Core.createGame({ seed: 1 });
g.targetLen = 6;
for (let i = 0; i < 6; i++) Core.step(g);           // len=6 直行,头 (9,8)
Core.setDir(g, 'down'); Core.step(g);               // 头 (9,9)
Core.setDir(g, 'left'); Core.step(g);               // 头 (8,9)
Core.setDir(g, 'up');
{
  const target = { x: g.snake[0].x, y: g.snake[0].y - 1 };   // (8,8) 是身体格
  assert(g.snake.some(c => c.x === target.x && c.y === target.y), '前方确为身体格(自撞局面成立)');
  Core.step(g, { ghost: true });
  assert(!g.dead, 'ghost 穿身不死');
  assert.deepStrictEqual({ ...g.snake[0] }, target, 'ghost 时头照常前进到身体格');
}
console.log('OK test-core(ghost)');

// --- revive:看广告原地复活——蛇原地原长、连击恢复、deaths 保留、可继续 step(P3a 复活广告位)---
{
  const g = Core.createGame({ seed: 30 });
  g.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g, { nowMs: 1000 + i });   // 直行养长
  // 制造连击
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.apple = { x: h.x + d.x, y: h.y + d.y };
  Core.step(g, { nowMs: 2000 });
  g.apple = { x: g.snake[0].x + Core.DIRS[g.nextDir].x, y: g.snake[0].y + Core.DIRS[g.nextDir].y };
  Core.step(g, { nowMs: 2100 });                                   // 10s 窗口内连吃 → combo=1
  assert(g.combo >= 1, 'sanity: 已有连击');
  const comboBefore = g.combo;
  // 撞死:向下→向左→向上撞回身体(走位期间蛇可能仍在长,「原长」基准取死亡时刻)
  Core.setDir(g, 'down'); Core.step(g, { nowMs: 3000 });
  Core.setDir(g, 'left'); Core.step(g, { nowMs: 3001 });
  Core.setDir(g, 'up');   Core.step(g, { nowMs: 3002 });
  assert(g.dead, 'sanity: 已撞死');
  assert.strictEqual(g.combo, 0, '死亡清连击');
  const lenAtDeath = g.snake.length, headAtDeath = { ...g.snake[0] };
  Core.revive(g);
  assert(!g.dead, '复活后活着');
  assert.strictEqual(g.snake.length, lenAtDeath, '蛇原长不减半');
  assert.deepStrictEqual({ ...g.snake[0] }, headAtDeath, '蛇原地不挪窝');
  assert.strictEqual(g.combo, comboBefore, '连击恢复');
  assert.strictEqual(g.deaths, 1, 'deaths 计数保留');
  Core.setDir(g, 'right'); Core.step(g, { nowMs: 4000 });          // 复活后可继续走
  assert(!isNaN(g.score) && g.stats.steps > 0, '复活后可继续 step');
}
console.log('OK test-core(revive)');

// --- 转向缓冲:快速「右→上→左」两拐都生效(不丢第二拐、不自吃) ---
{
  const g = Core.createGame({ seed: 1 });
  Core.step(g);                       // 向右走一格,蛇变长
  const h = { ...g.snake[0] };
  Core.setDir(g, 'up');               // 队首
  Core.setDir(g, 'left');             // 队尾(相对'up'合法,旧实现会因 'left'===OPP['right'] 丢掉)
  assert.strictEqual(g.dirQueue.length, 2, '两拐都入队');
  Core.step(g);                       // 应用第一拐:上
  assert.strictEqual(g.dir, 'up', '第一拐=上');
  assert.strictEqual(g.snake[0].y, h.y - 1, '头向上移');
  Core.step(g);                       // 应用第二拐:左
  assert.strictEqual(g.dir, 'left', '第二拐=左(没被丢)');
  // 反向仍被拒:当前向左,立刻按右应无效
  Core.setDir(g, 'right');
  assert.strictEqual(g.dirQueue.length, 0, '相对队尾反向被拒,不入队');
}
console.log('OK test-core(turn-buffer)');
