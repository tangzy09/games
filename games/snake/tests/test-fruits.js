// games/snake/tests/test-fruits.js
const assert = require('assert');
const Core = require('../js/core.js');
const Fruits = require('../js/fruits.js');

function eatN(g, n, startMs) {  // 连吃 n 个苹果:每次把苹果摆到头前一格再 step
  let t = startMs || 1000;
  for (let i = 0; i < n; i++) {
    // 蛇一直向右会撞墙:走蛇形。把苹果放头的下一步位置。
    const dir = ['right', 'down', 'left', 'down'][g.stats.apples % 4];
    Core.setDir(g, dir);
    const d = Core.DIRS[g.nextDir], h = g.snake[0];
    g.apple = { x: h.x + d.x, y: h.y + d.y };
    Core.step(g, { nowMs: (t += 500) });
    if (g.dead) throw new Error('eatN 走位撞死,调整路径');
  }
  return t;
}

// --- 特殊果刷新节奏:吃 4~6 个苹果后必刷,且场上至多 1 个 ---
{
  const g = Core.createGame({ seed: 1 });
  assert.strictEqual(g.special, null, '开局无特殊果');
  eatN(g, 6, 1000);
  assert(g.special, '6 苹果内必刷特殊果');
  assert(Fruits.FRUITS[g.special.type], '类型合法');
  assert(g.special.expiresAt > 0, '有过期时间');
  assert.strictEqual(g.stats.specialsSpawned, 1);
  const firstType = g.special.type;
  // 走位调整(意图不变,时间可调):startMs 需落在首个特殊果 expiresAt(spawn+8000ms)之内,
  // 否则它会在第二批次开局前先自然过期,导致合法地刷出第 2 个——那不是本用例要测的场景。
  // seed=1 首个特殊果约在 t=4000 时刷出、expiresAt≈11500,故用 5000 起跑确保仍在场。
  eatN(g, 6, 5000);
  assert.strictEqual(g.stats.specialsSpawned, 1, '场上已有特殊果时不再刷');
  assert.strictEqual(g.special.type, firstType);
}

// --- 过期消失 ---
{
  const g = Core.createGame({ seed: 2 });
  const t = eatN(g, 6, 1000);
  assert(g.special, '已刷特殊果');
  Core.step(g, { nowMs: t + Fruits.FRUIT_TIMES.specialLife + 1 });
  assert.strictEqual(g.special, null, '超时消失');
}

// --- 吃到特殊果:计数 + 生效(用 gold 验证通路) ---
{
  const g = Core.createGame({ seed: 3 });
  const t = eatN(g, 6, 1000);
  // 手工把特殊果改成 gold 并摆到头前
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.special = { type: 'gold', x: h.x + d.x, y: h.y + d.y, expiresAt: t + 8000 };
  g.apple = { x: 0, y: 0 };                       // 苹果挪走防干扰
  const sc = g.score, cb = g.combo;
  Core.step(g, { nowMs: t + 500 });
  assert.strictEqual(g.special, null, '吃掉后场上清空');
  assert.strictEqual(g.stats.specials.gold, 1, '类型计数');
  assert.strictEqual(g.combo, cb + 2, '金苹果连击 +2');
  assert.strictEqual(g.score, sc + 50, '金苹果 +50 分');
}

// --- twin:场上多 2 个苹果;吃副苹果与主苹果同效 ---
{
  const g = Core.createGame({ seed: 4 });
  Core.applyFruit(g, 'twin', 1000, {});
  assert.strictEqual(g.extraApples.length, 2, '双子星刷 2 个副苹果');
  const a = g.extraApples[0];
  // 把副苹果搬到头前吃掉
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  a.x = h.x + d.x; a.y = h.y + d.y;
  g.apple = { x: 0, y: 15 };
  const len = g.targetLen, ap = g.stats.apples;
  Core.step(g, { nowMs: 2000 });
  assert.strictEqual(g.extraApples.length, 1, '副苹果被吃移除,不重生');
  assert.strictEqual(g.targetLen, len + 1, '副苹果同样 +1 节');
  assert.strictEqual(g.stats.apples, ap + 1);
}
console.log('OK test-fruits(刷新/过期/gold/twin)');

// --- feather:恰揭一片 3×3(边缘裁剪),计里程碑 ---
{
  const g = Core.createGame({ seed: 5 });
  const before = g.revealedCount;
  Core.applyFruit(g, 'feather', 1000, {});
  const gained = g.revealedCount - before;
  assert(gained >= 4 && gained <= 9, `羽毛揭 4~9 格(边缘裁剪,已揭重叠),实得 ${gained}`);
}

// --- trail:8s 内走过揭 3 格宽 ---
{
  const g = Core.createGame({ seed: 6 });
  Core.applyFruit(g, 'trail', 1000, {});
  const before = g.revealedCount;
  g.apple = { x: 15, y: 15 };            // 挪开苹果
  Core.step(g, { nowMs: 1100 });         // 向右一步:头格+上下两格
  assert.strictEqual(g.revealedCount, before + 3, '足迹揭 3 格');
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.trail + 1 });   // 过期后
  const b2 = g.revealedCount;
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.trail + 200 });
  assert.strictEqual(g.revealedCount, b2 + 1, '过期后只揭头格');
}

// --- cloud/demon:只设置到期时间(速度由 main 读),demon 得分 ×2 ---
{
  const g = Core.createGame({ seed: 7 });
  Core.applyFruit(g, 'cloud', 1000, {});
  assert.strictEqual(g.effects.slowUntil, 1000 + Fruits.FRUIT_TIMES.cloud);
  Core.applyFruit(g, 'demon', 1000, {});
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.apple = { x: h.x + d.x, y: h.y + d.y };
  const sc = g.score;
  Core.step(g, { nowMs: 1100 });          // demon 生效期内吃苹果
  assert.strictEqual(g.score, sc + 20, '恶魔期得分 ×2(10×1×2)');
}

// --- scissors:targetLen-3 且身体同步修剪(不变式) ---
{
  const g = Core.createGame({ seed: 8 });
  g.targetLen = 10;
  for (let i = 0; i < 12; i++) {          // 蛇形养长
    Core.setDir(g, ['right', 'down', 'left', 'down'][i % 4]); Core.step(g, { nowMs: 1000 + i });
  }
  const len = g.snake.length;
  assert(len >= 8, 'sanity: 蛇已养长');
  Core.applyFruit(g, 'scissors', 5000, {});
  assert.strictEqual(g.targetLen, 7, 'targetLen 10-3=7');
  assert(g.snake.length <= g.targetLen, '身体修剪,不变式保持');
}

// --- halo:幽灵期穿身不死;过期后撞身死 ---
{
  const g = Core.createGame({ seed: 9 });
  g.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g, { nowMs: 1000 + i });   // 直行养长
  Core.setDir(g, 'down'); Core.step(g, { nowMs: 2000 });
  Core.setDir(g, 'left'); Core.step(g, { nowMs: 2001 });
  Core.applyFruit(g, 'halo', 2002, {});
  Core.setDir(g, 'up');   Core.step(g, { nowMs: 2002 });           // 撞回身体——幽灵穿过
  assert(!g.dead, '光环期穿身不死');
  // 过期后再制造一次撞身
  const g2 = Core.createGame({ seed: 9 });
  g2.targetLen = 6;
  for (let i = 0; i < 6; i++) Core.step(g2, { nowMs: 1000 + i });
  Core.setDir(g2, 'down'); Core.step(g2, { nowMs: 2000 });
  Core.setDir(g2, 'left'); Core.step(g2, { nowMs: 2001 });
  Core.applyFruit(g2, 'halo', 2002, {});
  Core.setDir(g2, 'up');
  Core.step(g2, { nowMs: 2002 + Fruits.FRUIT_TIMES.halo + 1 });    // 已过期
  assert(g2.dead, '光环过期后撞身应死');
}

// --- heart:护盾自动转安全方向,消耗一层,shieldJustUsed 置位 ---
{
  const g = Core.createGame({ seed: 10 });
  Core.applyFruit(g, 'heart', 1000, {});
  assert.strictEqual(g.effects.shield, 1);
  // 逼到右墙:一直向右直到下一步是墙
  while (g.snake[0].x < g.cols - 1) Core.step(g, { nowMs: 2000 + g.snake[0].x });
  g.apple = { x: 0, y: 0 };
  Core.step(g, { nowMs: 3000 });          // 本该撞墙——护盾转向
  assert(!g.dead, '护盾救命');
  assert.strictEqual(g.effects.shield, 0, '护盾消耗');
  assert(g.shieldJustUsed, 'shieldJustUsed 置位');
  assert(g.dir === 'up' || g.dir === 'down', '转向为垂直安全方向');
}

// --- gift:确定性(同种子同结果)且必为其他 11 种之一的效果 ---
{
  const g = Core.createGame({ seed: 11 });
  const snap = JSON.stringify({ e: g.effects, x: g.extraApples.length });
  Core.applyFruit(g, 'gift', 1000, {});
  const changed = JSON.stringify({ e: g.effects, x: g.extraApples.length }) !== snap
    || g.score > 0 || g.meteor || g.snake.length !== 1 || g.revealedCount > 1;
  assert(changed, '礼盒必然触发某种效果');
  // 同种子重放,结果一致
  const h = Core.createGame({ seed: 11 });
  Core.applyFruit(h, 'gift', 1000, {});
  assert.strictEqual(JSON.stringify(h.effects), JSON.stringify(g.effects), '同种子礼盒结果一致');
}
console.log('OK test-fruits(八效果)');

// --- meteor:按时刻推进、沿途揭开、出界消失 ---
{
  const g = Core.createGame({ seed: 12 });
  Core.applyFruit(g, 'meteor', 1000, {});
  assert(g.meteor, '流星生成');
  const step = Fruits.FRUIT_TIMES.meteorStep;
  const before = g.revealedCount;
  g.apple = { x: g.snake[0].x + 1, y: g.snake[0].y };  // 让蛇原地小步动,时间推进靠 nowMs
  Core.step(g, { nowMs: 1000 + step * 5 });            // 推进 5 个流星步
  assert(g.revealedCount > before, '流星沿途揭开(不论是否追上)');
  Core.step(g, { nowMs: 1000 + step * 40 });           // 40 步足够穿出 16 格棋盘
  assert.strictEqual(g.meteor, null, '流星出界消失');
}

// --- meteor:追上得分 ---
{
  const g = Core.createGame({ seed: 13 });
  const d = Core.DIRS[g.nextDir], h = g.snake[0];
  g.meteor = { x: h.x + d.x, y: h.y + d.y, dx: 1, dy: 1, nextAt: 99999999 };  // 冻结在头前
  g.apple = { x: 0, y: 15 };
  const sc = g.score;
  Core.step(g, { nowMs: 2000 });
  assert.strictEqual(g.meteor, null, '追上后消失');
  assert.strictEqual(g.score, sc + 40, '追上 +40');
}

// --- magnet:每 magnetStep 果子向头挪 1 格;不入蛇身/不出界/不叠果 ---
{
  const g = Core.createGame({ seed: 14 });
  Core.applyFruit(g, 'magnet', 1000, {});
  const h = g.snake[0];
  g.apple = { x: h.x + 5, y: h.y };       // 正右方 5 格
  Core.step(g, { nowMs: 1000 + Fruits.FRUIT_TIMES.magnetStep });
  // 蛇也向右走了一步:头 x+1;苹果向头挪 1 格:x+5-1 → 距离仍 3?精确断言位置:
  assert.strictEqual(g.apple.x, h.x + 4, '苹果向头漂移 1 格');
  // 不叠果:special 放在苹果漂移目标位,应停住
  const g2 = Core.createGame({ seed: 15 });
  Core.applyFruit(g2, 'magnet', 1000, {});
  const h2 = g2.snake[0];
  g2.apple  = { x: h2.x + 5, y: h2.y };
  g2.special = { type: 'gold', x: h2.x + 4, y: h2.y, expiresAt: 99999999 };
  Core.step(g2, { nowMs: 1000 + Fruits.FRUIT_TIMES.magnetStep });
  assert.strictEqual(g2.apple.x, h2.x + 5, '目标被特殊果占用,苹果原地不动(或走纵轴——y 相同故不动)');
}
console.log('OK test-fruits(流星/磁力)');
