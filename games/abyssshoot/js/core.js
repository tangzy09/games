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

function resolve(s) {
  let chain = 0, gained = 0, merges = 0;
  while (true) {
    const comps = findComponents(s);
    if (!comps.length) break;
    chain++;
    for (const comp of comps) {
      const nv = comp.value * 2;
      for (const cell of comp.cells) s.board[cell.c][cell.i] = 0;   // 整块清零
      s.board[comp.anchor.c][comp.anchor.i] = nv;                   // 锚点置 ×2
      gained += nv * chain;                                         // 连锁倍率
      merges++;
      if (nv > s.maxTile) { s.maxTile = nv; s.events.push({ t: 'newMaxFish', v: nv }); }
      s.events.push({ t: 'merge', v: nv, chain });
    }
    gravityUp(s);
  }
  if (chain > 1) s.events.push({ t: 'chain', n: chain });
  s.score += gained;
  return { chain, gained, merges };
}

// 双导出:node 走 module.exports;浏览器靠顶层 const Core 当全局(同 snake core.js)
const Core = { createGame, genAmmo, smallestTile, gravityUp, findComponents, resolve,
  PREVIEW, AMMO_WINDOW, SPAWN_EVERY, TILE_MIN };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
