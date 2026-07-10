// core.js — 纯游戏状态机(无 DOM,双导出)
// 浏览器:PRNG/Fruits 来自前置 <script> 全局;node:直接 require
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;
const FR_ = (typeof module !== 'undefined' && module.exports)
  ? require('./fruits.js') : Fruits;

const SNAKE_DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const COMBO_WINDOW_MS = 10000;   // 待校准(设计 §13)

function createGame(opts = {}) {
  const cols = opts.cols || 16, rows = opts.rows || 16;
  const s = {
    cols, rows,
    rand: PRNG_.create(opts.seed == null ? 1 : opts.seed),
    snake: [{ x: Math.min(3, Math.floor(cols / 4)), y: Math.floor(rows / 2) }],
    dir: 'right', nextDir: 'right',
    targetLen: 3,
    revealed: new Uint8Array(cols * rows), revealedCount: 0, milestones: 0,
    apple: null, extraApples: [], special: null, meteor: null,
    applesSinceSpecial: 0, nextSpecialAt: 0, twinBatch: 0,
    effects: { slowUntil: 0, demonUntil: 0, ghostUntil: 0, trailUntil: 0,
               magnetUntil: 0, shield: 0, lastDriftAt: 0 },
    score: 0, combo: 0, lastEatMs: -Infinity,
    level: 1, levelJustDone: false,
    dead: false, deaths: 0,
    shieldJustUsed: false, lastSpecialEaten: null,   // 每步重置,供 UI/音效读取
    events: [],                                       // 每步清空重填,类型化事件流(成就/音效消费)
    stats: { apples: 0, steps: 0, specialsSpawned: 0, specials: {},
             meteorsCaught: 0, ghostPassed: 0 },
  };
  s.nextSpecialAt = 4 + Math.floor(s.rand() * 3);   // 每 4~6 苹果刷 1 个特殊果
  revealCell(s, s.snake[0].x, s.snake[0].y);
  spawnApple(s);
  return s;
}

function idx(s, x, y) { return y * s.cols + x; }
function occupied(s, x, y) { return s.snake.some(c => c.x === x && c.y === y); }
function fruitOccupied(s, x, y) {
  if (s.apple && s.apple.x === x && s.apple.y === y) return true;
  if (s.extraApples.some(a => a.x === x && a.y === y)) return true;
  if (s.special && s.special.x === x && s.special.y === y) return true;
  return false;
}
function randomFreeCell(s) {
  const free = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!occupied(s, x, y) && !fruitOccupied(s, x, y)) free.push({ x, y });
  return free.length ? free[Math.floor(s.rand() * free.length)] : null;
}

function revealCell(s, x, y) {
  const i = idx(s, x, y);
  if (!s.revealed[i]) { s.revealed[i] = 1; s.revealedCount++; }
}

function spawnApple(s) { s.apple = randomFreeCell(s); }

function setDir(s, dir) {
  if (!SNAKE_DIRS[dir]) return;
  if (s.snake.length > 1 && dir === OPP[s.dir]) return;
  s.nextDir = dir;
}

// 身体命中判定(尾巴让位;不含墙、不含 ghost——供 isLethalCell 与 ghostPass 统计复用)
function bodyHit(s, x, y) {
  const grow = s.snake.length < s.targetLen;
  return s.snake.some((c, i) => {
    if (!grow && i === s.snake.length - 1) return false;
    return c.x === x && c.y === y;
  });
}

// 与 step 同口径的致死判定(尾巴让位;ghost 穿身;墙恒死)
function isLethalCell(s, x, y, ghost) {
  if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) return true;
  if (ghost) return false;
  return bodyHit(s, x, y);
}

// o: {nowMs, freezeCombo, scoreScale, ghost}
function step(s, o = {}) {
  if (s.dead) return;
  s.levelJustDone = false;
  s.shieldJustUsed = false; s.lastSpecialEaten = null;
  s.events = [];
  const now = o.nowMs != null ? o.nowMs : s.stats.steps * 140;
  const fx = s.effects;
  tickMeteor(s, now, o);
  tickMagnet(s, now);
  if (s.special && now >= s.special.expiresAt) s.special = null;   // 限时消失
  // 光环:到期时蛇头若仍与身体重叠,天然安全——碰撞只判「新格」,重叠本身不判死
  const ghost = !!o.ghost || now < fx.ghostUntil;
  s.dir = s.nextDir;
  let d = SNAKE_DIRS[s.dir];
  const head = s.snake[0];
  let nx = head.x + d.x, ny = head.y + d.y;
  if (isLethalCell(s, nx, ny, ghost) && fx.shield > 0) {
    // 守护爱心:该步不执行,自动转任一安全方向;四向皆死则不消耗、照死
    for (const alt of ['up', 'down', 'left', 'right']) {
      if (s.snake.length > 1 && alt === OPP[s.dir]) continue;
      const ad = SNAKE_DIRS[alt];
      if (!isLethalCell(s, head.x + ad.x, head.y + ad.y, ghost)) {
        fx.shield--; s.shieldJustUsed = true;
        s.events.push({ t: 'shield' });
        s.dir = s.nextDir = alt; d = ad;
        nx = head.x + ad.x; ny = head.y + ad.y;
        break;
      }
    }
  }
  if (isLethalCell(s, nx, ny, ghost)) return die(s);
  // ghost 穿身统计:本会致死的身体格,靠 ghost 生效才活着穿过(尾让位格不算穿身)
  if (ghost && bodyHit(s, nx, ny)) {
    s.stats.ghostPassed++; s.events.push({ t: 'ghostPass' });
  }
  // 不变式: snake.length ≤ targetLen(targetLen 单调增;respawn 重置 length=1;
  // scissors 减 targetLen 时同步修剪身体),故 step 无需收缩路径
  const grow = s.snake.length < s.targetLen;
  s.snake.unshift({ x: nx, y: ny });
  if (!grow) s.snake.pop();
  s.stats.steps++;
  revealCell(s, nx, ny);
  if (now < fx.trailUntil) {              // 圣光足迹:3 格宽光带(垂直于行进方向)
    const px2 = d.y !== 0 ? 1 : 0, py2 = d.x !== 0 ? 1 : 0;
    for (const sgn of [-1, 1]) {
      const tx = nx + sgn * px2, ty = ny + sgn * py2;
      if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) revealCell(s, tx, ty);
    }
  }
  checkMilestone(s, o);
  eatAt(s, nx, ny, now, o);
  if (s.revealedCount === s.cols * s.rows) completeLevel(s, o);
}

function eatAt(s, x, y, now, o) {
  const demonX = now < s.effects.demonUntil ? 2 : 1;   // 小恶魔期间得分 ×2
  if (s.apple && s.apple.x === x && s.apple.y === y) {
    gainApple(s, now, o, demonX); spawnApple(s); onAppleEaten(s, now); return;
  }
  const ei = s.extraApples.findIndex(a => a.x === x && a.y === y);
  if (ei >= 0) {
    const a = s.extraApples[ei];
    s.extraApples.splice(ei, 1);
    gainApple(s, now, o, demonX); onAppleEaten(s, now);   // 副苹果不重生
    s.events.push({ t: 'extra', batch: a.batch });
    return;
  }
  if (s.special && s.special.x === x && s.special.y === y) {
    const t = s.special.type; s.special = null;
    s.stats.specials[t] = (s.stats.specials[t] || 0) + 1;
    s.lastSpecialEaten = t;
    s.events.push({ t: 'special', type: t });
    applyFruit(s, t, now, o);
    return;
  }
  if (s.meteor && s.meteor.x === x && s.meteor.y === y) {
    s.meteor = null;
    s.score += Math.round(40 * demonX * (o.scoreScale || 1));   // 追上流星 +40
    s.stats.meteorsCaught++;
    s.events.push({ t: 'meteorCatch' });
  }
}

function gainApple(s, now, o, demonX) {
  // 蛇长几何上限:棋盘容量 - 8(留果子刷新空间;10 万步长跑发现的真死因——
  // targetLen 一旦 > 棋盘格数,grow 恒真、尾巴永不让位,蛇填满棋盘后四向皆死,
  // 护盾也救不了。封顶后吃苹果只得分不再增长。上限低于初始 3 时取 3(小棋盘)。
  s.targetLen = Math.min(s.targetLen + 1, Math.max(3, s.cols * s.rows - 8));
  s.stats.apples++;
  if (!o.freezeCombo && now - s.lastEatMs <= COMBO_WINDOW_MS) s.combo++;
  s.lastEatMs = now;
  s.score += Math.round(10 * (1 + 0.1 * s.combo) * demonX * (o.scoreScale || 1));
  s.events.push({ t: 'apple' });   // 主/副苹果共用
}

function onAppleEaten(s, now) {
  s.applesSinceSpecial++;
  if (s.special || s.applesSinceSpecial < s.nextSpecialAt) return;
  const cell = randomFreeCell(s);
  if (!cell) return;
  s.special = { type: pickSpecialType(s), x: cell.x, y: cell.y,
                expiresAt: now + FR_.FRUIT_TIMES.specialLife };
  s.stats.specialsSpawned++;
  s.applesSinceSpecial = 0;
  s.nextSpecialAt = 4 + Math.floor(s.rand() * 3);
}

// 权重选型:前期偏得分,后期(揭图>60% 或蛇>30% 棋盘)偏生存/揭图;
// 稀有果类内按数值系数打折(rare: 0.35 稀有 / 0.12 极稀有,省略 = 1)
function pickSpecialType(s) {
  const late = s.revealedCount / (s.cols * s.rows) > 0.6
            || s.snake.length > s.cols * s.rows * 0.3;
  const w = late ? FR_.CAT_WEIGHTS.late : FR_.CAT_WEIGHTS.early;
  const entries = Object.entries(FR_.FRUITS).map(([type, def]) =>
    [type, w[def.cat] * (def.rare || 1)]);
  let total = 0; for (const [, wt] of entries) total += wt;
  let r = s.rand() * total;
  for (const [type, wt] of entries) { r -= wt; if (r <= 0) return type; }
  return entries[entries.length - 1][0];
}

function applyFruit(s, type, now, o) {
  const fx = s.effects, T = FR_.FRUIT_TIMES;
  switch (type) {
    case 'twin': {
      const batch = ++s.twinBatch;
      for (let i = 0; i < 2; i++) {
        const c = randomFreeCell(s);
        if (c) s.extraApples.push({ x: c.x, y: c.y, batch, at: now });
      }
      s.events.push({ t: 'twinSpawn', batch, at: now });
      break;
    }
    case 'gold':   // 恶魔期 ×2,与苹果/流星的 demonX 语义一致
      s.combo += 2;
      s.score += Math.round(50 * (now < fx.demonUntil ? 2 : 1) * (o.scoreScale || 1));
      break;
    case 'demon':  fx.demonUntil = now + T.demon; break;
    case 'meteor': spawnMeteor(s, now); break;
    case 'feather': {                     // 彩虹羽毛:随机一片 3×3 未揭区域
      const c = randomUnrevealed(s);
      if (c) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const tx = c.x + dx, ty = c.y + dy;
        if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) revealCell(s, tx, ty);
      }
      checkMilestone(s, o);
      break;
    }
    case 'trail':  fx.trailUntil = now + T.trail; break;
    case 'cloud':  fx.slowUntil = now + T.cloud; break;
    case 'scissors':                      // 蛇身 -3:同步修剪身体,维持 length≤targetLen 不变式
      s.targetLen = Math.max(3, s.targetLen - 3);
      while (s.snake.length > s.targetLen) s.snake.pop();
      break;
    case 'halo':   fx.ghostUntil = now + T.halo; break;
    case 'heart':  fx.shield++; break;
    case 'magnet': fx.magnetUntil = now + T.magnet; break;
    case 'gift': {                        // 天国礼盒:随机触发其他任意一种
      const others = Object.keys(FR_.FRUITS).filter(k => k !== 'gift');
      applyFruit(s, others[Math.floor(s.rand() * others.length)], now, o);
      break;
    }
    default: break;
  }
}

function randomUnrevealed(s) {
  const cells = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!s.revealed[y * s.cols + x]) cells.push({ x, y });
  return cells.length ? cells[Math.floor(s.rand() * cells.length)] : null;
}

// 流星:随机左/右缘起点,45° 对角斜穿;飞过即沿途揭开(不论是否追上)
function spawnMeteor(s, now) {
  const fromLeft = s.rand() < 0.5;
  s.meteor = {
    x: fromLeft ? 0 : s.cols - 1,
    y: Math.floor(s.rand() * s.rows),
    dx: fromLeft ? 1 : -1,
    dy: s.rand() < 0.5 ? 1 : -1,
    nextAt: now,
  };
}
function tickMeteor(s, now, o) {
  while (s.meteor && now >= s.meteor.nextAt) {
    const m = s.meteor;
    revealCell(s, m.x, m.y);
    m.x += m.dx; m.y += m.dy;
    m.nextAt += FR_.FRUIT_TIMES.meteorStep;
    if (m.x < 0 || m.y < 0 || m.x >= s.cols || m.y >= s.rows) { s.meteor = null; break; }
  }
  if (o) checkMilestone(s, o);            // 流星揭格也计里程碑
}

// 磁力圣环:每 magnetStep ms 所有果子向蛇头挪 1 格(先大差轴;占用/出界则不动)
function tickMagnet(s, now) {
  const fx = s.effects;
  if (now >= fx.magnetUntil || now - fx.lastDriftAt < FR_.FRUIT_TIMES.magnetStep) return;
  fx.lastDriftAt = now;
  const head = s.snake[0];
  const drift = (f) => {
    if (!f) return;
    const dx = Math.sign(head.x - f.x), dy = Math.sign(head.y - f.y);
    const tryMove = (mx, my) => {
      if (mx === 0 && my === 0) return false;
      const tx = f.x + mx, ty = f.y + my;
      if (tx < 0 || ty < 0 || tx >= s.cols || ty >= s.rows) return false;
      if (occupied(s, tx, ty) || fruitOccupied(s, tx, ty)) return false;
      f.x = tx; f.y = ty; return true;
    };
    if (Math.abs(head.x - f.x) >= Math.abs(head.y - f.y)) { tryMove(dx, 0) || tryMove(0, dy); }
    else { tryMove(0, dy) || tryMove(dx, 0); }
  };
  drift(s.apple);
  s.extraApples.forEach(drift);
  drift(s.special);
}

function checkMilestone(s, o) {
  const total = s.cols * s.rows;
  while (s.milestones < 3 && s.revealedCount / total >= (s.milestones + 1) * 0.25) {
    s.milestones++;
    s.score += Math.round(100 * (o.scoreScale || 1));
    s.events.push({ t: 'milestone' });
  }
}

// 换图重开盘面:清遮罩+清场上限时物+蛇身格揭开(保留蛇/分数/效果)。
// completeLevel 与图鉴「重温」共用。
function resetBoard(s) {
  s.revealed.fill(0); s.revealedCount = 0; s.milestones = 0;
  s.special = null; s.meteor = null;      // 换图清场上限时物;副苹果/效果跨关保留
  for (const c of s.snake) revealCell(s, c.x, c.y);
}

function completeLevel(s, o) {
  s.score += Math.round(500 * (o.scoreScale || 1));
  s.level++; s.levelJustDone = true;
  resetBoard(s);
  s.events.push({ t: 'level' });
}

function die(s) {
  s.comboBeforeDeath = s.combo;           // 供 revive 恢复(看广告复活保连击)
  s.dead = true; s.deaths++; s.combo = 0;
  const fx = s.effects;                   // 死亡清定时效果;护盾保留(它没能触发说明四向皆死或为 0)
  fx.slowUntil = fx.demonUntil = fx.ghostUntil = fx.trailUntil = fx.magnetUntil = 0;
  s.events.push({ t: 'death' });
}

// 看广告复活:蛇原地原长、连击恢复;deaths 计数保留(复活也算死过,
// 不影响「无死亡通关」语义);定时效果已在 die 清空(已接受偏差)。
function revive(s) {
  s.dead = false;
  s.combo = s.comboBeforeDeath || 0;
}

function respawn(s) {
  const newLen = Math.max(3, Math.floor(s.snake.length / 2));
  let best = null, bestD = -1;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (fruitOccupied(s, x, y)) continue;
    let d = Infinity;
    for (const c of s.snake) d = Math.min(d, Math.abs(c.x - x) + Math.abs(c.y - y));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  s.snake = [best]; s.targetLen = newLen;
  s.dir = s.nextDir = (best.x < s.cols / 2 ? 'right' : 'left');
  s.dead = false;
  revealCell(s, best.x, best.y);
}

const Core = { createGame, setDir, step, respawn, revive, applyFruit, pickSpecialType,
               resetBoard, DIRS: SNAKE_DIRS, COMBO_WINDOW_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
