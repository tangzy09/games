// core.js — 纯游戏状态机(无 DOM,双导出)。棋盘 = 每列一个栈,index 0=顶、末尾=底(玩家侧)。
const PRNG_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;
// 鱼梯(浏览器:tiles.js 在 core.js 之前加载,见 index.html 的 load-bearing 顺序)
const TILES_ = (typeof module !== 'undefined' && module.exports)
  ? require('./tiles.js') : Tiles;

const PREVIEW = 3;       // 弹药预览发数
const SPAWN_EVERY = 6;   // 每 N 发顶部刷一整行(可调)
const TILE_MIN = 2;      // 最小档(空盘时的起手值)
// 从盘面抽样的偏小系数(r^bias):越大越偏向小鱼。平衡关键钮。
const AMMO_BIAS = 4;     // 弹药:偏小(主要靠射小鱼级联长大)。越大→大鱼越稀有
const SPAWN_BIAS = 5;    // 刷行:更偏小(刷下来的是杂鱼,不是白送大鱼)

// ⚠⚠ 弹药与刷行的**唯一正确原则**:「你拿到的东西,必须配得上盘面上真实存在的值」。
// 实现:直接从**盘上现有值的多重集**里抽样,而不是用公式算区间。
//
// 两次踩坑史(都是玩家实战撞出来的,别再走回去):
//   ① 弹药挂「盘上最小值」+ 刷行恒生 2/4 → 刷行把最小值永久钉死在 2 → 弹药永远{2,4,8}
//      → 列底的 256 永远合不动 = **大鱼死墙**。
//   ② 改成弹药挂 baseTier(随 maxTile 上浮) → 区间只升不降 → 早期留在盘上的 2/4
//      再也抽不到 = **小鱼死墙**(同一个病,反过来而已)。
// 公式法必然在某一端漏掉盘上真实存在的值。从盘面抽样则**结构性**杜绝两端死墙:
// 盘上有什么,你就可能拿到什么。单测有硬不变量守着。
//
// 偏小抽样(r² 权重):主要靠「射小鱼 → 级联长大」推进(经典 2048 射手的正路),
// 而不是直接射一条大鱼;也保证残留的小鱼总能被清掉,不会堆成垃圾。
function boardValues(s) {
  const vs = [];
  for (let c = 0; c < s.cols; c++) for (const v of s.board[c]) vs.push(v);
  return vs;
}
// excludeMax:**盘上当前最大的值绝不发给你**(弹药与刷行都排除)。
// 为什么:能直接射到当前最大值 = 花钱买最强的鱼(射一条 1024 贴到 1024 上白嫖 2048),
// 「挣到最深的鱼」这件事就没了意义。排除后,**最大的鱼只能靠合并去挣**。
// 顺带堵死一个坑:否则皇带鱼(梯顶)自己也能被抽成弹药,你会射出更多顶档大块。
function pickFromBoard(s, bias, excludeMax) {
  let vs = boardValues(s);
  // ⚠ 早退分支也要 s.rand() 烧一次游标:结果仍是确定性的 TILE_MIN(规则不变),
  // 但保持「每次抽样尝试都推进一次 rolls」的语义一致,撤销/续玩回放才对得上(P2b-2)。
  if (!vs.length) { s.rand(); return TILE_MIN; }         // 空盘:从最小档起手
  if (excludeMax) {
    const mx = Math.max.apply(null, vs);
    vs = vs.filter(v => v < mx);
    if (!vs.length) { s.rand(); return TILE_MIN; }       // 盘上只剩一种值:给条新小鱼当火种
  }
  vs.sort((a, b) => a - b);
  const r = Math.pow(s.rand(), bias);                    // bias>1 → 偏向小端
  return vs[Math.min(vs.length - 1, Math.floor(r * vs.length))];
}
function smallestTile(s) {
  let m = Infinity;
  for (let c = 0; c < s.cols; c++) for (const v of s.board[c]) if (v < m) m = v;
  return m === Infinity ? TILE_MIN : m;
}
function genAmmo(s)   { return pickFromBoard(s, AMMO_BIAS, true); }
// 刷行的鱼同样从盘面抽(偏小更狠)——刷下来的行必定是你合得掉的东西。
function spawnTile(s) { return pickFromBoard(s, SPAWN_BIAS, true); }

// rand 是闭包,内部状态读不出来。所以记「调用次数」(rolls),
// 要回退时用同一 seed 重建、空转 rolls 次快进到原位 —— 精确,且一局才几百次,开销可忽略。
// ⚠ 没有这个,撤销就等于「重摇弹药」(save-scum);页面刷新续玩同理。
function attachRand(s, seed, rolls) {
  const base = PRNG_.create(seed);
  for (let k = 0; k < rolls; k++) base();     // 快进
  s.seed = seed;
  s.rolls = rolls;
  s.rand = () => { s.rolls++; return base(); };
}
function restoreRand(s, seed, rolls) { attachRand(s, seed, rolls); return s; }

function createGame(opts = {}) {
  const cols = opts.cols || 5, rows = opts.rows || 9;
  const seed = opts.seed == null ? 1 : opts.seed;
  const s = {
    cols, rows, seed,
    rolls: 0,                       // rand 被调用的次数(撤销/精确续玩靠它回退)
    rand: null,
    board: Array.from({ length: cols }, () => []),
    score: 0, maxTile: 0,
    shots: 0, shotsSinceSpawn: 0,
    dead: false, events: [],
    ammo: 0, queue: [],
  };
  attachRand(s, seed, 0);
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

// 锚点选择:**优先向击中块合并**。
// prefer = 本轮「优先成为锚点」的格子:第 1 轮是玩家打中的那一格;之后每轮是上一轮合出的鱼。
// 为什么:锚点原本是纯几何规则(最低、再最左)。跨列连通块时,合出的大鱼可能长在**你没瞄的那一列**——
// 「把大鱼摆在哪」这件事就失控了。改成优先落在击中格,玩家才真正掌控布局;连锁时继续以刚合出的
// 那条鱼为锚,大鱼就在原地滚雪球而不是乱窜。都不沾边(如别处被连带触发的块)才回退几何规则。
function pickAnchor(comp, prefer) {
  for (const p of prefer) {
    if (comp.cells.some(x => x.c === p.c && x.i === p.i)) return { c: p.c, i: p.i };
  }
  return { c: comp.anchor.c, i: comp.anchor.i };   // 回退:findComponents 算好的「最低、再最左」
}

function resolve(s, prefer) {
  let chain = 0, gained = 0, merges = 0;
  let pref = Array.isArray(prefer) ? prefer.slice() : [];
  const MAX_ITERS = 10000;
  const MAX_V = TILES_.MAX_TILE_VALUE;   // 梯顶(皇带鱼 131072)
  while (chain < MAX_ITERS) {
    const comps = findComponents(s);
    if (!comps.length) break;
    chain++;
    const roundMerges = [];
    const nextPref = [];
    for (const comp of comps) {
      // ── 梯顶:相遇则双双游走 ──
      // 两条以上顶档鱼(皇带鱼)相邻 → **全部游回深渊(清空)** + 巨额分数。
      // 为什么不做「稳定块永不合并」(DESIGN 原案):那会让皇带鱼成为**永久不可消的方块**,
      // 卡在列底 = 那一列判死刑;更糟的是弹药从盘面抽样 → 皇带鱼自己也能被抽成弹药,
      // 你会射出更多永久垃圾越堆越死 —— **最大的成就变成杀死你的东西**。
      // 现在:单条仍是稳定块(不成块就不动),但你可以**主动再合一条来清掉它** → 策略目标,不是死刑。
      // 图鉴不受影响:maxTile 记录过 131072 就永久解锁,鱼游走了也算收集到。
      if (comp.value >= MAX_V) {
        const bonus = MAX_V * comp.cells.length;
        roundMerges.push({ value: comp.value, nv: 0, escape: true,
                           cells: comp.cells.map(x => ({ c: x.c, i: x.i })),
                           anchor: { c: comp.anchor.c, i: comp.anchor.i } });
        for (const cell of comp.cells) s.board[cell.c][cell.i] = 0;   // 全部清空,无幸存者
        gained += bonus * chain;
        merges++;
        s.events.push({ t: 'escape', v: MAX_V, n: comp.cells.length, chain });
        continue;
      }
      // 连通块 N 个 → 合并 N-1 次 → V × 2^(N-1)。
      // 「憋大团」是核心爽点与赌注:3 连=4 倍、4 连=8 倍、5 连=16 倍。
      // (旧规则不论 N 一律塌成 ×2,导致凑的团越大亏得越多、反玩家,已废弃。)
      // 指数规则会冲过梯顶(如 5 连 16384 → ×16 = 262144),结果钳到梯顶。
      const nv = Math.min(MAX_V, comp.value * Math.pow(2, comp.cells.length - 1));
      const anchor = pickAnchor(comp, pref);      // 优先向击中块/上一轮合出的鱼合并
      // 本轮合并明细在「变更前」采集,供动画把参与格飞向锚点
      roundMerges.push({ value: comp.value, nv, cells: comp.cells.map(x => ({ c: x.c, i: x.i })),
                         anchor: { c: anchor.c, i: anchor.i } });
      for (const cell of comp.cells) s.board[cell.c][cell.i] = 0;
      s.board[anchor.c][anchor.i] = nv;
      // 算出这条新鱼「重力压实后」的位置,作为下一轮的优先锚点(大鱼原地滚雪球)
      let newI = 0;
      for (let k = 0; k < anchor.i; k++) if (s.board[anchor.c][k] > 0) newI++;
      nextPref.push({ c: anchor.c, i: newI });
      gained += nv * chain;
      merges++;
      if (nv > s.maxTile) { s.maxTile = nv; s.events.push({ t: 'newMaxFish', v: nv }); }
      s.events.push({ t: 'merge', v: nv, chain });   // 旧契约:音效/成就在消费,保留
    }
    gravityUp(s);
    pref = nextPref;
    // 本轮结算+重力后的盘面快照(动画的「下一帧」)
    s.events.push({ t: 'round', n: chain, merges: roundMerges, board: snapBoard(s) });
  }
  if (chain >= MAX_ITERS) throw new Error('resolve 未收敛(可能死循环)');
  if (chain > 1) s.events.push({ t: 'chain', n: chain });
  s.score += gained;
  return { chain, gained, merges };
}

// 刷行的鱼也挂基准档(不是恒定的 2/4)——否则会把盘上最小值永久钉死在 2,
// 让弹药永远够不着列底的大鱼,刷下来的行根本消不掉,只能眼看着被顶死。
function spawnRow(s) {
  for (let c = 0; c < s.cols; c++) s.board[c].unshift(spawnTile(s));
  s.events.push({ t: 'spawn', board: snapBoard(s) });
}

function shoot(s, col) {
  s.events = [];
  if (s.dead) return s;
  if (col < 0 || col >= s.cols) return s;

  s.board[col].push(s.ammo);
  // 击中格 = 弹药落定的位置。传给 resolve 当优先锚点:合出的鱼长在**你瞄的那一格**,
  // 而不是几何上「最低最左」的某个别处(跨列块时那会长到你没瞄的列去,布局失控)。
  const hit = { c: col, i: s.board[col].length - 1 };
  s.events.push({ t: 'shoot', c: col, v: s.ammo, board: snapBoard(s) });
  resolve(s, [hit]);

  if (++s.shotsSinceSpawn >= SPAWN_EVERY) {
    spawnRow(s);
    resolve(s);            // 刷行连带触发的合并没有「击中格」,回退几何锚点
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
const Core = { createGame, attachRand, restoreRand, genAmmo, spawnTile, smallestTile, boardValues,
  pickFromBoard, gravityUp, findComponents, resolve, spawnRow, shoot, snapBoard,
  PREVIEW, SPAWN_EVERY, TILE_MIN, AMMO_BIAS, SPAWN_BIAS };
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
