// core.js — 纯游戏状态机(无 DOM,双导出)
// 浏览器:PRNG 来自 engine/prng.js 全局;node:直接 require
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SNAKE_DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const COMBO_WINDOW_MS = 10000;   // 待校准(设计 §13)

function createGame(opts = {}) {
  const cols = opts.cols || 16, rows = opts.rows || 16;
  const s = {
    cols, rows,
    rand: PRNG_.create(opts.seed == null ? 1 : opts.seed),
    // 头在前;身体随前进长出。起点按棋盘尺寸取(16×16 = {3,8},同原硬编码;
    // 小棋盘如 4×4 = {1,2},避免硬编码 y:8 越界)
    snake: [{ x: Math.min(3, Math.floor(cols / 4)), y: Math.floor(rows / 2) }],
    dir: 'right', nextDir: 'right',
    targetLen: 3,
    revealed: new Uint8Array(cols * rows), revealedCount: 0, milestones: 0,
    apple: null,
    score: 0, combo: 0, lastEatMs: -Infinity,
    level: 1, levelJustDone: false,
    dead: false, deaths: 0,
    stats: { apples: 0, steps: 0 },
  };
  revealCell(s, s.snake[0].x, s.snake[0].y);
  spawnApple(s);
  return s;
}

function idx(s, x, y) { return y * s.cols + x; }
function occupied(s, x, y) { return s.snake.some(c => c.x === x && c.y === y); }

function revealCell(s, x, y) {
  const i = idx(s, x, y);
  if (!s.revealed[i]) { s.revealed[i] = 1; s.revealedCount++; }
}

function spawnApple(s) {
  const free = [];
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++)
    if (!occupied(s, x, y)) free.push({ x, y });
  s.apple = free.length ? free[Math.floor(s.rand() * free.length)] : null;
}

function setDir(s, dir) {
  if (!SNAKE_DIRS[dir]) return;
  if (s.snake.length > 1 && dir === OPP[s.dir]) return;
  s.nextDir = dir;
}

// o: {nowMs, freezeCombo, scoreScale, ghost} — 后两者供 AI 代打/光环(P2)用
function step(s, o = {}) {
  if (s.dead) return;
  s.levelJustDone = false;
  s.dir = s.nextDir;
  const d = SNAKE_DIRS[s.dir], head = s.snake[0];
  const nx = head.x + d.x, ny = head.y + d.y;
  if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) return die(s);
  const grow = s.snake.length < s.targetLen;
  const hitSelf = s.snake.some((c, i) => {
    if (!grow && i === s.snake.length - 1) return false;  // 尾巴同步让位
    return c.x === nx && c.y === ny;
  });
  if (hitSelf && !o.ghost) return die(s);
  s.snake.unshift({ x: nx, y: ny });
  if (!grow) s.snake.pop();
  s.stats.steps++;
  revealCell(s, nx, ny);
  checkMilestone(s, o);
  if (s.apple && s.apple.x === nx && s.apple.y === ny) eatApple(s, o);
  if (s.revealedCount === s.cols * s.rows) completeLevel(s, o);
}

function eatApple(s, o) {
  s.targetLen++; s.stats.apples++;
  const now = o.nowMs != null ? o.nowMs : s.stats.steps * 140;
  if (!o.freezeCombo && now - s.lastEatMs <= COMBO_WINDOW_MS) s.combo++;
  s.lastEatMs = now;
  s.score += Math.round(10 * (1 + 0.1 * s.combo) * (o.scoreScale || 1));
  spawnApple(s);
}

function checkMilestone(s, o) {
  const total = s.cols * s.rows;
  while (s.milestones < 3 && s.revealedCount / total >= (s.milestones + 1) * 0.25) {
    s.milestones++;
    s.score += Math.round(100 * (o.scoreScale || 1));
  }
}

function completeLevel(s, o) {
  s.score += Math.round(500 * (o.scoreScale || 1));
  s.level++; s.levelJustDone = true;
  s.revealed.fill(0); s.revealedCount = 0; s.milestones = 0;
  for (const c of s.snake) revealCell(s, c.x, c.y);  // 蛇站着的格子即时揭开
}

function die(s) { s.dead = true; s.deaths++; s.combo = 0; }

function respawn(s) {  // 半长重生:头置最空旷格,身体随前进长出
  const newLen = Math.max(3, Math.floor(s.snake.length / 2));
  let best = null, bestD = -1;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (s.apple && s.apple.x === x && s.apple.y === y) continue;
    let d = Infinity;
    for (const c of s.snake) d = Math.min(d, Math.abs(c.x - x) + Math.abs(c.y - y));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  s.snake = [best]; s.targetLen = newLen;
  s.dir = s.nextDir = (best.x < s.cols / 2 ? 'right' : 'left');
  s.dead = false;
  revealCell(s, best.x, best.y);
}

const Core = { createGame, setDir, step, respawn, DIRS: SNAKE_DIRS, COMBO_WINDOW_MS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
