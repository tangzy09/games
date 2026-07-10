// games/snake/js/ai.js — 哈密顿回路 + 捷径 + 停滞保护(纯函数,双导出)
const CoreRef = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;
const AIDIRS = CoreRef.DIRS;
const STALL_STEPS = 40;   // 待校准(设计 §13)

// S 形闭合回路:第 0 行通铺,1..rows-1 行在 x∈[1,cols-1] 蛇形,x=0 列收尾回起点
function buildCycle(cols, rows) {
  const order = [];
  for (let x = 0; x < cols; x++) order.push({ x, y: 0 });
  for (let y = 1; y < rows; y++) {
    if (y % 2 === 1) for (let x = cols - 1; x >= 1; x--) order.push({ x, y });
    else             for (let x = 1; x < cols; x++)      order.push({ x, y });
  }
  for (let y = rows - 1; y >= 1; y--) order.push({ x: 0, y });
  const indexOf = new Int32Array(cols * rows);
  order.forEach((c, i) => { indexOf[c.y * cols + c.x] = i; });
  return { order, indexOf, n: cols * rows };
}

function createMem() {
  return { sinceReveal: 0, lastRevealCount: -1, forcePure: false };
}
function relDist(cyc, a, b) { return (b - a + cyc.n) % cyc.n; }
function dirBetween(a, b) {
  if (b.x === a.x + 1) return 'right';
  if (b.x === a.x - 1) return 'left';
  if (b.y === a.y + 1) return 'down';
  return 'up';
}
const OPP_ = { up: 'down', down: 'up', left: 'right', right: 'left' };

function nextMove(s, cyc, mem) {
  if (s.revealedCount !== mem.lastRevealCount) { mem.sinceReveal = 0; mem.lastRevealCount = s.revealedCount; }
  else mem.sinceReveal++;

  const head = s.snake[0];
  const hi = cyc.indexOf[head.y * s.cols + head.x];
  const succ = cyc.order[(hi + 1) % cyc.n];
  let suggestion = dirBetween(head, succ);

  // 已知坑:蛇起点不一定在回路起点上,回路建议方向可能与当前 dir 成 180°
  // (setDir 会忽略这种转向,导致蛇直行偏离回路)。此时挑一个安全的过渡方向:
  // 优先选一个不出界、不撞身、且能让蛇尽快汇入回路前进方向的邻格方向。
  if (s.snake.length > 1 && suggestion === OPP_[s.dir]) {
    let best = null, bestFwd = Infinity;
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (dir === OPP_[s.dir]) continue;   // setDir 本来就会忽略,跳过
      const d = AIDIRS[dir];
      const nx = head.x + d.x, ny = head.y + d.y;
      if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
      if (s.snake.some(c => c.x === nx && c.y === ny)) continue;
      const ni = cyc.indexOf[ny * s.cols + nx];
      const fwd = relDist(cyc, hi, ni);
      if (fwd < bestFwd) { bestFwd = fwd; best = dir; }
    }
    if (best) return best;
  }

  const pure = mem.forcePure || s.snake.length > cyc.n / 2 || mem.sinceReveal > STALL_STEPS * 2;
  if (pure) return suggestion;
  return shortcutMove(s, cyc, mem, hi, head) || suggestion;
}
function shortcutMove() { return null; }   // Task 7 实现

const AI = { buildCycle, createMem, nextMove, STALL_STEPS };
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
