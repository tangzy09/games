// tools.js — 三个救场道具 + 金币经济(纯逻辑,双导出)。
// ⚠ 命名:浏览器全局词法环境共享,core.js 已用 PRNG_/TILES_,storage 用 PRNG_S_,
//   codex 用 TILES_C_ —— 这里用 CORE_T_,别再撞。
const CORE_T_ = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;

// 价格(可调钮)。蒙特卡洛:随机瞎打中位一局攒 130 币 → 够用约 2 次;金币跨局累积。
const COST = { undo: 30, hammer: 60, swap: 80 };

// 金币来源(可调钮)。⚠ 不用分数计价:分数是指数级的(V×2^(N-1)),高手一局能滚到 10 万分,
// 用分数换币会让高手暴富、道具免费(实测跨水平差 11 倍)。改用「合并/连锁」只差 3 倍,
// 技巧仍被奖励但不失控。
const COIN = { merge: 1, chain: 5, escape: 50 };

function coinsFor(events) {
  let c = 0;
  for (const e of events || []) {
    if (e.t === 'merge') c += COIN.merge;
    else if (e.t === 'chain') c += COIN.chain;
    else if (e.t === 'escape') c += COIN.escape;
  }
  return c;
}

// 🔨 锤子:砸掉 (col, i) 那一格。
// ⚠⚠ 砸完必须立刻 gravityUp —— 棋盘的「每列从 index0 起密实、无空洞」是**横向连通判定的前提**
//    (findComponents 靠「相邻列同 index = 同一绝对行」,只有贴顶密实时才成立)。
//    砸出空洞不压实 → 连通判定全乱、合并出错,而且悄无声息。
// ⚠  砸完还要 resolve:移除格子会制造新的相邻,可能触发连锁(测试有断言)。
function hammer(s, col, i) {
  s.events = [];
  if (s.dead) return { ok: false };
  if (!(col >= 0 && col < s.cols)) return { ok: false };
  if (!(i >= 0 && i < s.board[col].length)) return { ok: false };
  const v = s.board[col][i];
  s.board[col][i] = 0;
  CORE_T_.gravityUp(s);                       // 密实不变式:必须立刻重压实
  s.events.push({ t: 'hammer', c: col, i, v });
  CORE_T_.resolve(s);                          // 移除可能制造新相邻 → 连锁
  return { ok: true, v };
}

// 🔀 交换两列(整列对调)。换完可能形成新的横向连通 → 必须 resolve。
function swap(s, a, b) {
  s.events = [];
  if (s.dead) return { ok: false };
  if (a === b) return { ok: false };
  if (!(a >= 0 && a < s.cols) || !(b >= 0 && b < s.cols)) return { ok: false };
  const t = s.board[a]; s.board[a] = s.board[b]; s.board[b] = t;
  s.events.push({ t: 'swap', a, b });
  CORE_T_.resolve(s);
  return { ok: true };
}

// ↩ 撤销:快照 / 回滚。
// ⚠ 必须连 RNG 游标(seed+rolls)一起存/还原,否则「撤销→重射」= 重摇弹药(save-scum)。
function snapshot(s) {
  return {
    board: CORE_T_.snapBoard(s),
    ammo: s.ammo, queue: s.queue.slice(),
    score: s.score, maxTile: s.maxTile,
    shots: s.shots, shotsSinceSpawn: s.shotsSinceSpawn,
    seed: s.seed, rolls: s.rolls,
  };
}
function undo(s, snap) {
  if (!snap) return { ok: false };
  s.board = snap.board.map(c => c.slice());
  s.ammo = snap.ammo; s.queue = snap.queue.slice();
  s.score = snap.score; s.maxTile = snap.maxTile;
  s.shots = snap.shots; s.shotsSinceSpawn = snap.shotsSinceSpawn;
  s.dead = false;
  s.events = [{ t: 'undo' }];
  CORE_T_.restoreRand(s, snap.seed, snap.rolls);   // 精确回退随机数
  return { ok: true };
}

const Tools = { COST, COIN, coinsFor, hammer, swap, snapshot, undo };
if (typeof module !== 'undefined' && module.exports) module.exports = Tools;
