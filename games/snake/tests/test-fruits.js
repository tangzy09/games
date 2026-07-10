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
