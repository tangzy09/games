// core.js — 纯游戏状态机(无 DOM,双导出)。棋盘 = 每列一个栈,index 0=顶、末尾=底(玩家侧)。
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const PREVIEW = 3;       // 弹药预览发数
const AMMO_WINDOW = 3;   // 弹药档窗:base * 2^(0..AMMO_WINDOW-1) = base, ×2, ×4 (可调)
const SPAWN_EVERY = 6;   // 每 N 发顶部刷一整行(可调)
const TILE_MIN = 2;      // 最小档

function smallestTile(s) {
  let m = Infinity;
  for (let c = 0; c < s.cols; c++) for (const v of s.board[c]) if (v < m) m = v;
  return m === Infinity ? TILE_MIN : m;
}
function genAmmo(s) {
  const base = smallestTile(s);
  const e = Math.floor(s.rand() * AMMO_WINDOW);   // 0..AMMO_WINDOW-1
  return base * Math.pow(2, e);
}

function createGame(opts = {}) {
  const cols = opts.cols || 5, rows = opts.rows || 9;
  const seed = opts.seed == null ? 1 : opts.seed;
  const s = {
    cols, rows, seed,
    rand: PRNG_.create(seed),
    board: Array.from({ length: cols }, () => []),
    score: 0, maxTile: 0,
    shots: 0, shotsSinceSpawn: 0,
    dead: false, events: [],
    ammo: 0, queue: [],
  };
  s.ammo = genAmmo(s);
  for (let k = 0; k < PREVIEW; k++) s.queue.push(genAmmo(s));
  return s;
}

function gravityUp(s) {
  for (let c = 0; c < s.cols; c++) s.board[c] = s.board[c].filter(v => v > 0);
}

// 不变式:棋盘每列任何时候都从 index0 起紧密排列、无内部空洞(靠 gravityUp 去零重排保证)。
// 故「相邻列同 index = 同一绝对视觉行」才成立,横向邻接判定(c±1 同 i)直接依赖此。
// P2 若加锤子砸中间块,砸完必须立刻 gravityUp 重压实,否则该不变式破裂、连通判定错乱。
function findComponents(s) {
  const comps = [];
  const seen = s.board.map(col => col.map(() => false));
  for (let c = 0; c < s.cols; c++) {
    for (let i = 0; i < s.board[c].length; i++) {
      if (seen[c][i]) continue;
      const v = s.board[c][i];
      seen[c][i] = true;
      if (v <= 0) continue;
      const cells = [{ c, i }];
      const stack = [{ c, i }];
      while (stack.length) {
        const cur = stack.pop();
        const nb = [
          { c: cur.c, i: cur.i - 1 }, { c: cur.c, i: cur.i + 1 },
          { c: cur.c - 1, i: cur.i }, { c: cur.c + 1, i: cur.i },
        ];
        for (const n of nb) {
          if (n.c < 0 || n.c >= s.cols) continue;
          if (n.i < 0 || n.i >= s.board[n.c].length) continue;
          if (seen[n.c][n.i]) continue;
          if (s.board[n.c][n.i] !== v) continue;
          seen[n.c][n.i] = true;
          cells.push(n); stack.push(n);
        }
      }
      if (cells.length >= 2) {
        let anchor = cells[0];
        for (const cell of cells)
          if (cell.i > anchor.i || (cell.i === anchor.i && cell.c < anchor.c)) anchor = cell;
        comps.push({ value: v, cells, anchor });
      }
    }
  }
  return comps;
}

// 盘面深拷贝快照(动画逐轮回放要用;5×9 小盘,开销可忽略)
function snapBoard(s) { return s.board.map(col => col.slice()); }

function resolve(s) {
  let chain = 0, gained = 0, merges = 0;
  const MAX_ITERS = 10000;
  while (chain < MAX_ITERS) {
    const comps = findComponents(s);
    if (!comps.length) break;
    chain++;
    const roundMerges = [];
    for (const comp of comps) {
      const nv = comp.value * 2;
      // 本轮合并明细在「变更前」采集,供动画把参与格飞向锚点
      roundMerges.push({ value: comp.value, nv, cells: comp.cells.map(x => ({ c: x.c, i: x.i })),
                         anchor: { c: comp.anchor.c, i: comp.anchor.i } });
      for (const cell of comp.cells) s.board[cell.c][cell.i] = 0;
      s.board[comp.anchor.c][comp.anchor.i] = nv;
      gained += nv * chain;
      merges++;
      if (nv > s.maxTile) { s.maxTile = nv; s.events.push({ t: 'newMaxFish', v: nv }); }
      s.events.push({ t: 'merge', v: nv, chain });   // 旧契约:音效/成就在消费,保留
    }
    gravityUp(s);
    // 本轮结算+重力后的盘面快照(动画的「下一帧」)
    s.events.push({ t: 'round', n: chain, merges: roundMerges, board: snapBoard(s) });
  }
  if (chain >= MAX_ITERS) throw new Error('resolve 未收敛(可能死循环)');
  if (chain > 1) s.events.push({ t: 'chain', n: chain });
  s.score += gained;
  return { chain, gained, merges };
}

function spawnTile(s) {
  return TILE_MIN * Math.pow(2, Math.floor(s.rand() * 2));   // 2 或 4
}
function spawnRow(s) {
  for (let c = 0; c < s.cols; c++) s.board[c].unshift(spawnTile(s));
  s.events.push({ t: 'spawn', board: snapBoard(s) });
}

function shoot(s, col) {
  s.events = [];
  if (s.dead) return s;
  if (col < 0 || col >= s.cols) return s;

  s.board[col].push(s.ammo);
  s.events.push({ t: 'shoot', c: col, v: s.ammo, board: snapBoard(s) });
  resolve(s);

  if (++s.shotsSinceSpawn >= SPAWN_EVERY) {
    spawnRow(s);
    resolve(s);
    s.shotsSinceSpawn = 0;
  }
  s.shots++;

  for (let c = 0; c < s.cols; c++) {
    if (s.board[c].length > s.rows) { s.dead = true; s.events.push({ t: 'death' }); break; }
  }

  if (!s.dead) {
    s.ammo = s.queue.shift();
    s.queue.push(genAmmo(s));
  }
  return s;
}

// 双导出:node 走 module.exports;浏览器靠顶层 const Core 当全局(同 snake core.js)
const Core = { createGame, genAmmo, smallestTile, gravityUp, findComponents, resolve, spawnRow, shoot, snapBoard,
  PREVIEW, AMMO_WINDOW, SPAWN_EVERY, TILE_MIN };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
