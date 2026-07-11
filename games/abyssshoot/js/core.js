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

// 双导出:node 走 module.exports;浏览器靠顶层 const Core 当全局(同 snake core.js)
const Core = { createGame, genAmmo, smallestTile, gravityUp,
  PREVIEW, AMMO_WINDOW, SPAWN_EVERY, TILE_MIN };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
