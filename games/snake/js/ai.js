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
  let move = null;
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
    move = best;
  }
  if (!move) {
    const pure = mem.forcePure || s.snake.length > cyc.n / 2 || mem.sinceReveal > STALL_STEPS * 2;
    move = pure ? suggestion : (shortcutMove(s, cyc, mem, hi, head) || suggestion);
  }
  return survivalMove(s, move);   // 兜底的兜底:仅在原建议致死时介入(设计 §4)
}

// 单步致死判定:出界或撞身(与 core.step 同口径——不长身时尾格让位)
function isLethalMove(s, dir) {
  const d = AIDIRS[dir], head = s.snake[0];
  const nx = head.x + d.x, ny = head.y + d.y;
  if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) return true;
  const grow = s.snake.length < s.targetLen;
  return s.snake.some((c, i) => {
    if (!grow && i === s.snake.length - 1) return false;   // 尾格同步让位
    return c.x === nx && c.y === ny;
  });
}

// BFS:从 (sx,sy) 出发,把当前蛇身(尾格除外)视为障碍,能否走到蛇尾所在格。
// 追得到尾巴 ⇒ 永远有活路(尾巴每步都会让出新格)。
function canReachTail(s, sx, sy) {
  const tail = s.snake[s.snake.length - 1];
  if (sx === tail.x && sy === tail.y) return true;
  const blocked = new Uint8Array(s.cols * s.rows);
  for (let i = 0; i < s.snake.length - 1; i++) {   // 尾格是终点,不算障碍
    const c = s.snake[i];
    blocked[c.y * s.cols + c.x] = 1;
  }
  if (blocked[sy * s.cols + sx]) return false;
  const seen = new Uint8Array(s.cols * s.rows);
  const qx = [sx], qy = [sy];
  seen[sy * s.cols + sx] = 1;
  for (let qi = 0; qi < qx.length; qi++) {
    const x = qx[qi], y = qy[qi];
    for (const k of ['up', 'down', 'left', 'right']) {
      const d = AIDIRS[k];
      const nx = x + d.x, ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
      if (nx === tail.x && ny === tail.y) return true;
      const i = ny * s.cols + nx;
      if (seen[i] || blocked[i]) continue;
      seen[i] = 1; qx.push(nx); qy.push(ny);
    }
  }
  return false;
}

// 兜底的兜底(设计 §4):若即将返回的方向直接致死,或是会被 setDir 忽略的 180°
// (导致直行送死风险),改选「BFS 能追到尾巴」的邻格方向;都追不到则任选不立即
// 致死的;连这都没有才原样返回(必死局面,上层不变式下理论不可达)。
// 纯函数:除入参读取外无任何副作用。
function survivalMove(s, move) {
  const len = s.snake.length;
  const doomed = (len > 1 && move === OPP_[s.dir]) || isLethalMove(s, move);
  if (!doomed) return move;
  const head = s.snake[0];
  let anySafe = null;
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (len > 1 && dir === OPP_[s.dir]) continue;   // 会被 setDir 忽略,无意义
    if (isLethalMove(s, dir)) continue;
    const d = AIDIRS[dir];
    if (canReachTail(s, head.x + d.x, head.y + d.y)) return dir;   // 追尾优先
    if (!anySafe) anySafe = dir;
  }
  return anySafe || move;   // 全堵死:原样返回
}
// 安全不变式:候选格回路前向距离 < 头→尾前向距离 - 余量(身体全部留在前向区间之外);
// 捷径只穿已揭格(目标格例外);等价代价偏好未揭格(顺路揭,防停滞保险 a)。
function shortcutMove(s, cyc, mem, hi, head) {
  const tail = s.snake[s.snake.length - 1];
  const ti = cyc.indexOf[tail.y * s.cols + tail.x];
  const headToTail = relDist(cyc, hi, ti);
  const margin = (s.targetLen - s.snake.length) + 4;

  // 目标:苹果;停滞时改打最近未揭格(防停滞保险 b)
  let target = s.apple;
  if (mem.sinceReveal > STALL_STEPS) target = nearestUnrevealed(s, head) || s.apple;
  if (!target) return null;
  const tIdx = cyc.indexOf[target.y * s.cols + target.x];

  let best = null, bestScore = Infinity;
  for (const dir of ['up', 'down', 'left', 'right']) {
    const d = AIDIRS[dir];
    const nx = head.x + d.x, ny = head.y + d.y;
    if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
    if (s.snake.some(c => c.x === nx && c.y === ny)) continue;   // 尾巴也保守视为占用
    const ni = cyc.indexOf[ny * s.cols + nx];
    const fwd = relDist(cyc, hi, ni);
    const isSucc = fwd === 1;
    const isTargetCell = nx === target.x && ny === target.y;
    if (!isSucc) {
      if (s.snake.length >= 4 && fwd > headToTail - margin) continue;  // 安全不变式
      if (!s.revealed[ny * s.cols + nx] && !isTargetCell) continue;    // 捷径只穿已揭格
    }
    const score = relDist(cyc, ni, tIdx) * 2 + (s.revealed[ny * s.cols + nx] ? 1 : 0);
    if (score < bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

function nearestUnrevealed(s, from) {
  let best = null, bestD = Infinity;
  for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) {
    if (s.revealed[y * s.cols + x]) continue;
    const d = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

const AI = { buildCycle, createMem, nextMove, STALL_STEPS };
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
