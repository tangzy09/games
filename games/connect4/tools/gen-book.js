// ════════════════════════════════════════
// gen-book.js —— 离线预算开局库（DESIGN §2.1 / §9.2，P1 Task 7）。
//
// 架构那句话：**四子棋空位越少搜得越快，真正慢的只有开局，而开局恰恰能离线预计算**
// ⇒ Node 离线把「第 N 手的全部局面」逐个求精确分存成一张表，运行时（Worker）在
//    negamax 里碰到 `bd.n === N` 直接取值 ⇒ 只剩中后盘要真搜。
//
// ─── 库里存什么（决定了文件多大，也决定了它能救哪些局面）───
//   **只存 ply N 这一层**（不存 0..N-1）。浅层不用存：根在 ply k < N 时，搜索从 k 一路展开到
//   N 就全是查表，几毫秒出结果 ⇒ 存浅层是纯浪费。
//   ⚠ 由此推出的**覆盖范围**：根局面 `n ≤ N-1` 才吃得到库。根正好在 n = N 时，solve/scoreAll
//     要的是**每个子局面**（ply N+1）的分，库一条都对不上 ⇒ 一点不省。别把「N 手的库」读成
//     「前 N+1 手都快」。
//
// ─── 不入库的两类局面（省 22% 体积，且零风险）───
//   1) **已终局**（有人连四）：negamax 的前置条件就是「未终局」，永远不会查到它们；
//   2) **轮走方一手连四**：negamax 在库探查**之前**就 `return CELLS - n` 了（见 solver.js
//      里库探查那段的说明），本来就 0 成本。
//   ⛔ 这两条是**省体积**，不是「近似」：查不到就照常搜索，答案一位都不会变。
//
// ─── key 用 solver.js 的 keyOf（⛔ 别另抄一份）───
//   49 位无损编码 + **左右镜像归一** ⇒ 一条记录同时服务一个局面和它的镜像，库直接小一半。
//   ⚠ 也正因为归一了，库里**只能存分数、不能存着法**（着法跨镜像要翻列号，翻错是静默的）。
//
// ─── 为什么用 scoreOf 而不是 solve（实测 2.56×）───
//   solve/scoreAll 会把**每一列**都精确化（提示/精准度/妙手一列都不能少），而库只要局面自身
//   那一个数。ply 10 抽样 50 局：scoreOf 均值 597ms / solve 均值 1529ms。
//   乘上 63 万个局面就是「跑两小时」与「跑五小时」的区别。
//
// ─── 三个加速，缺一个这活就跑不完 ───
//   1) **S.setKeepTable(true)**：跨局面复用整张置换表。库是「一个根 + 它的全部近邻后代」，
//      兄弟子树重叠极大，实测 5.08× 节点 / 6.96× 墙钟。
//      ⛔⛔ **打开它 nodes 就不再可比**（读数随调用历史漂移）⇒ 本文件**任何情况下退出前都要
//        关回去**（finally + exit/uncaughtException/SIGINT 三处兜底）。门禁读 nodes，
//        留着开等于把门禁读数悄悄改掉。
//   2) **多进程**（默认 CPU-2 个 worker）：每个 worker 一张自己的 50MB 表。
//      ⚠ 分片必须**保持树序局部性**：先把 ply-N 局面按 **DFS 首访序**排好，再切成连续块，
//        一块 = 一小撮相邻子树 ⇒ worker 的暖表才有得赚。按 `i % workers` 轮询分片会把
//        局部性彻底打散（那正是 keepTable 一分不赚的那种「互不相关的随机局面」）。
//   3) **断点续跑**：每块算完立刻落盘到 `<out>.parts/`，重跑只补没算完的块。
//      几小时的任务中途挂了不该从头来。⚠ 续跑前用 manifest 校验「局面清单没变」，
//      变了就拒绝续（宁可重来，也不许把两次不同枚举的结果拼成一个文件）。
//
// ─── 用法 ───
//   node games/connect4/tools/gen-book.js --ply=10            # 正式生成（几小时，可中断续跑）
//   node games/connect4/tools/gen-book.js --ply=10 --stop-after=120   # 只跑 2 分钟看吞吐/ETA
//   node games/connect4/tools/gen-book.js --ply=8 --workers=4
//   node games/connect4/tools/gen-book.js --ply=10 --clean    # 丢掉断点重来
//   node games/connect4/tools/gen-book.js --count-only --ply=13   # 只数局面（不求解）
//
// ⛔ **改了 solver.js / bitboard.js / rules-classic.js 的任何行为，库必须重建**（DESIGN §9.2）。
//    文件头里存了三份源码的哈希，tests/test-book.js 会打印比对；但真正的红线是那份门禁本身
//    （分数与现场求解逐个一致 + 从库倒推出的空盘七列分数必须等于 Allis 1988）。
// ════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');

// ─────────── 参数 ───────────
function argOf(name, dflt) {
  const p = process.argv.find(a => a.startsWith('--' + name + '='));
  return p === undefined ? dflt : p.slice(name.length + 3);
}
const hasFlag = f => process.argv.includes('--' + f);

// ═══════════════════════════════════════════════════════════
// 1) 局面枚举（纯枚举，不求解 —— 很便宜，ply 12 十几秒）
// ═══════════════════════════════════════════════════════════

/** 数值集合（开放寻址 + Float64Array）。⚠ 用 Set<number> 也对，但 63 万条要吃上百 MB，
 *  而这里每条只要 8 字节。key 恒 > 0 ⇒ 0 可以当空槽。 */
function keySet(capHint) {
  let bits = 4;
  while ((1 << bits) < capHint * 2) bits++;
  const n = 1 << bits, mask = n - 1;
  const t = new Float64Array(n);
  let size = 0;
  function slot(k) {
    // key 有 49 位，拆成两半再混：直接 `k % n` 会因为低位只编码第 0 列而严重聚簇。
    const lo = k % 16777216, hi = (k - lo) / 16777216;
    let x = (Math.imul(lo, 0x9E3779B1) ^ Math.imul(hi, 0x85EBCA6B)) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x2545F491) >>> 0; x ^= x >>> 13;
    return x & mask;
  }
  return {
    /** @returns true = 这次是新加进来的 */
    add(k) {
      let i = slot(k);
      for (;;) {
        const v = t[i];
        if (v === 0) { t[i] = k; size++; return true; }
        if (v === k) return false;
        i = (i + 1) & mask;
      }
    },
    has(k) {
      let i = slot(k);
      for (;;) {
        const v = t[i];
        if (v === 0) return false;
        if (v === k) return true;
        i = (i + 1) & mask;
      }
    },
    get size() { return size; }
  };
}

/**
 * ⭐ 枚举 ply N 的全部**可入库**局面，按 **DFS 首访序**返回它们的 keyOf。
 * 「可入库」= 未终局（枚举本来就不展开终局）且**轮走方没有一手连四**（见抬头）。
 * ⚠ 去重用的是 keyOf（**已镜像归一**）⇒ 一个局面被剪掉时它的镜像早已展开过，
 *   而镜像的 ply-N 后代与它自己的 ply-N 后代 keyOf 完全相同 ⇒ 剪得安全，还白省一半。
 * @returns { keys: Float64Array（DFS 序）, visited: 展开过的浅层局面数 }
 */
function enumerateFrontier(N, onProgress) {
  const seen = keySet(1 << 22);
  const out = [];
  const sb = B.searchBoard(B.newBoard());
  let visited = 0;

  function dfs() {
    if (sb.n === N) {
      const k = S.keyOf(sb);
      if (!seen.add(k)) return;
      if (R.winningMoves(sb).length === 0) out.push(k);   // 一手连四的不入库（0 成本）
      return;
    }
    const k = S.keyOf(sb);
    if (!seen.add(k)) return;
    visited++;
    if (onProgress && (visited & 0xFFFFF) === 0) onProgress(visited, out.length);
    for (const c of R.moves(sb)) {
      B.playIn(sb, c);
      // ⚠ 终局（刚落子那方连成四）不再展开，也不入库：棋局在这里就结束了，
      //   negamax 永远不会拿这种局面当节点（它的前置条件就是「未终局」）。
      if (!B.hasFourFor(sb, 1 - sb.turn)) dfs();
      B.undoIn(sb, c);
    }
  }
  dfs();
  return { keys: Float64Array.from(out), visited: visited };
}

/**
 * key → 棋盘（keyOf 是**双射**，所以这一步是可逆解码，不是猜）。
 * 每列 7 位 = `轮走方掩码 + (1 << 列高)`；列高之和给出手数 n，n 的奇偶给出轮走方。
 * ⚠ 解出来的是这一族里的**归一代表**（自身或镜像中 key 较小的那个）—— 分数与镜像恒等，
 *   所以解出哪一个都对；但**必须**回头验一次 `keyOf(解出来的盘) === key`（下面 worker 每条都验），
 *   否则编码/解码一旦漂移，整本库会安静地按错局面存分。
 */
function decodeKey(key) {
  const a = new Array(B.W).fill(0), b = new Array(B.W).fill(0), h = new Array(B.W).fill(0);
  const me = new Array(B.W).fill(0);
  let k = key, n = 0;
  for (let c = 0; c < B.W; c++) {
    const v = k % 128; k = (k - v) / 128;
    if (v < 1) throw new Error('key 解码失败：第 ' + c + ' 列的编码是 ' + v);
    let hh = 0;
    while ((1 << (hh + 1)) <= v) hh++;
    if (hh > B.H) throw new Error('key 解码失败：第 ' + c + ' 列列高 ' + hh);
    h[c] = hh; me[c] = v - (1 << hh); n += hh;
  }
  if (k !== 0) throw new Error('key 解码失败：超出 7 列');
  const turn = n & 1;
  for (let c = 0; c < B.W; c++) {
    const all = (1 << h[c]) - 1;
    if (turn === 0) { a[c] = me[c]; b[c] = all ^ me[c]; }
    else { b[c] = me[c]; a[c] = all ^ me[c]; }
  }
  return { a: a, b: b, h: h, turn: turn, n: n, mv: null };
}

/** 解码出来的盘必须是**合法且未终局**的。⛔ 别省这一步：库里混进一个非法局面不会报错，
 *  只会让那一条记录永远查不中（浪费）或者更糟——查中了一个不该存在的局面。 */
function assertLegal(bd, key) {
  if (S.keyOf(bd) !== key) throw new Error('key 往返不一致：' + key + ' → ' + S.keyOf(bd));
  let pa = 0, pb = 0;
  for (let c = 0; c < B.W; c++) {
    const all = (1 << bd.h[c]) - 1;
    if ((bd.a[c] & bd.b[c]) !== 0) throw new Error('同一格两方都占：列 ' + c);
    if ((bd.a[c] | bd.b[c]) !== all) throw new Error('掩码与列高不符：列 ' + c);
    for (let r = 0; r < bd.h[c]; r++) { if ((bd.a[c] >> r) & 1) pa++; else pb++; }
  }
  if (pa !== Math.ceil(bd.n / 2) || pb !== Math.floor(bd.n / 2)) {
    throw new Error('先后手子数不对：' + pa + '/' + pb + ' n=' + bd.n);
  }
  if (R.terminal(bd) !== null) throw new Error('库里不该有终局局面');
}

// ═══════════════════════════════════════════════════════════
// 2) worker：只负责「一块 key → 一块分数」
// ═══════════════════════════════════════════════════════════
function runWorker() {
  // ⛔⛔ 逃生门：**任何**退出路径都要把 keepTable 关回去。
  //   它是进程内状态，本进程一关就没了 —— 但这三行不是形式主义：将来若有人把 worker 改成
  //   常驻/复用（同一个进程里接着跑门禁），少了它 nodes 就静默失真。
  const closeGate = () => { try { S.setKeepTable(false); } catch (e) { /* 退出路径不许再抛 */ } };
  process.on('exit', closeGate);
  process.on('uncaughtException', e => { closeGate(); console.error(e); process.exit(1); });
  process.on('SIGINT', () => { closeGate(); process.exit(130); });
  process.on('SIGTERM', () => { closeGate(); process.exit(143); });

  S.setKeepTable(true);                       // ⭐ 跨局面复用整张表（本文件最大的一个加速）

  process.on('message', msg => {
    if (msg.type === 'quit') { closeGate(); process.exit(0); return; }
    if (msg.type !== 'block') return;
    const keys = msg.keys;
    const scores = new Array(keys.length);
    let nodes = 0;
    const t0 = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const bd = decodeKey(keys[i]);
      assertLegal(bd, keys[i]);               // 每条都验（相对几百毫秒的搜索，成本可以忽略）
      const r = S.scoreOf(bd);
      const s = r.score;
      if (!Number.isInteger(s) || s < -B.CELLS || s > B.CELLS) {
        throw new Error('分数越界：' + s + ' key=' + keys[i]);
      }
      scores[i] = s;
      nodes += r.nodes;
    }
    process.send({ type: 'done', index: msg.index, scores: scores, ms: Date.now() - t0, nodes: nodes });
  });
  process.send({ type: 'ready' });
}

// ═══════════════════════════════════════════════════════════
// 3) 主进程
// ═══════════════════════════════════════════════════════════
function srcHash() {
  // 三份源码的哈希（FNV-1a）。⚠ 只是**信息**，不是正确性判据：真正的红线是 tests/test-book.js
  //   （分数与现场求解一致 + 倒推出的空盘七列 = Allis 1988）。但它能一眼回答
  //   「这份库是不是在当前这版求解器上生成的」，改注释也会变 —— 变了就该重新跑一遍门禁。
  let hash = 0x811c9dc5;
  for (const f of ['solver.js', 'bitboard.js', 'rules-classic.js']) {
    const t = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').replace(/\r\n/g, '\n');
    for (let i = 0; i < t.length; i++) {
      hash ^= t.charCodeAt(i) & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash >>> 0;
}

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? h + 'h' + String(m).padStart(2, '0') + 'm' : m + 'm' + String(s % 60).padStart(2, '0') + 's';
}
const num = v => Math.round(v).toLocaleString('en-US');

function countOnly() {
  const maxPly = Number(argOf('ply', 12));
  console.log('ply | 可入库局面（镜像归一 / 非终局 / 非一手连四）| 8B/条  | 6B/条（本库格式）');
  console.log('----+---------------------------------------------+--------+------------------');
  for (let p = 1; p <= maxPly; p++) {
    const t0 = Date.now();
    const r = enumerateFrontier(p);
    const m = r.keys.length;
    console.log(String(p).padStart(3) + ' | ' + num(m).padStart(43) + ' | ' +
      (m * 8 / 1048576).toFixed(2) + 'MiB | ' + (BOOK.byteSize(m) / 1048576).toFixed(2) + 'MiB' +
      '   (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  }
}

function main() {
  if (hasFlag('count-only')) return countOnly();

  const N = Number(argOf('ply', 10));
  const WORKERS = Number(argOf('workers', Math.max(1, os.cpus().length - 2)));
  // ⚠ 块大小是「断点粒度」与「IPC 开销」的折中：300 个局面在 ply 10 上约 10–30 秒一块，
  //   挂掉最多损失这么多；再小 IPC 就开始有存在感，再大收尾时的空转变长。
  const BLOCK = Number(argOf('block', 300));
  const OUT = path.resolve(argOf('out', path.join(__dirname, '..', 'data', 'book-classic.bin')));
  const STOP_AFTER = Number(argOf('stop-after', 0));   // 秒；>0 = 只跑这么久（探吞吐用）
  const PARTS = OUT + '.parts';

  if (!Number.isInteger(N) || N < 1 || N > 20) throw new Error('--ply 必须是 1..20 的整数');

  console.log('gen-book：classic / ply=' + N + ' / workers=' + WORKERS + ' / block=' + BLOCK);
  console.log('输出 ' + OUT);

  const t0 = Date.now();
  const en = enumerateFrontier(N);
  const keys = en.keys;
  const M = keys.length;
  console.log('枚举完成：ply ' + N + ' 可入库局面 ' + num(M) +
    '（展开浅层 ' + num(en.visited) + ' 个）' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('预计文件 ' + (BOOK.byteSize(M) / 1048576).toFixed(2) + ' MiB');

  // ─── 断点续跑 ───
  const nBlocks = Math.ceil(M / BLOCK);
  const manifestPath = path.join(PARTS, 'manifest.json');
  // 清单指纹：局面清单变了（改了枚举/规则/N）就绝不许把两次的结果拼在一起
  let kh = 0x811c9dc5;
  for (let i = 0; i < M; i++) {
    const k = keys[i], lo = k % 16777216, hi = (k - lo) / 16777216;
    kh = Math.imul(kh ^ lo, 0x01000193) >>> 0;
    kh = Math.imul(kh ^ hi, 0x01000193) >>> 0;
  }
  const manifest = { ply: N, count: M, block: BLOCK, keyHash: kh, format: BOOK.FORMAT };

  if (hasFlag('clean') && fs.existsSync(PARTS)) fs.rmSync(PARTS, { recursive: true });
  fs.mkdirSync(PARTS, { recursive: true });
  if (fs.existsSync(manifestPath)) {
    const old = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const f of ['ply', 'count', 'block', 'keyHash', 'format']) {
      if (old[f] !== manifest[f]) {
        throw new Error('断点数据与本次不匹配（' + f + '：' + old[f] + ' ≠ ' + manifest[f] +
          '）。局面清单变了就不能续跑 —— 用 --clean 重来。');
      }
    }
  } else {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  }

  // 已完成的块
  const scores = new Int8Array(M);
  const doneBlk = new Uint8Array(nBlocks);
  let doneCount = 0;
  for (let b = 0; b < nBlocks; b++) {
    const f = path.join(PARTS, 'b' + String(b).padStart(6, '0') + '.i8');
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const lo = b * BLOCK, hi = Math.min(M, lo + BLOCK);
    if (buf.length !== hi - lo) { fs.unlinkSync(f); continue; }   // 半截文件：丢掉重算
    scores.set(new Int8Array(buf.buffer, buf.byteOffset, buf.length), lo);
    doneBlk[b] = 1; doneCount += hi - lo;
  }
  if (doneCount) console.log('续跑：已完成 ' + num(doneCount) + ' / ' + num(M) +
    '（' + (doneCount * 100 / M).toFixed(1) + '%）');

  if (doneCount === M) { finalize(); return; }

  // ─── 派活：⭐ 每个 worker 一段**连续**的 DFS 区间（暖表的收益全靠这个）───
  // ⛔ 别退回「谁空了就给下一块」的全局队列：那样 worker k 拿到的是第 k、k+W、k+2W… 块，
  //    在 DFS 序上彼此相隔十万八千里 ⇒ keepTable 的暖表一分不赚（那正是 solver.js 里
  //    「互不相关的随机局面上它一分不赚」说的情形）。
  // ⚠ 但纯静态切分会在收尾时空转（各区间难度差几倍）⇒ 自己的区间做完就去**偷**剩得最多的
  //   那个区间，而且从**尾部**偷（对方的游标从头往后走，两边不打架）。
  const started = Date.now();
  let solvedThisRun = 0, nodesThisRun = 0, lastLog = 0, stopping = false;
  const kids = [];
  const assigned = new Uint8Array(nBlocks);
  for (let b = 0; b < nBlocks; b++) if (doneBlk[b]) assigned[b] = 1;
  const regLo = [], regHi = [], head = [], tail = [];
  for (let w = 0; w < WORKERS; w++) {
    regLo[w] = Math.floor(w * nBlocks / WORKERS);
    regHi[w] = Math.floor((w + 1) * nBlocks / WORKERS);
    head[w] = regLo[w]; tail[w] = regHi[w] - 1;
  }
  function remaining(w) {
    let c = 0;
    for (let b = head[w]; b <= tail[w]; b++) if (!assigned[b]) c++;
    return c;
  }
  function nextBlockFor(w) {
    while (head[w] < regHi[w] && assigned[head[w]]) head[w]++;
    if (head[w] < regHi[w] && head[w] <= tail[w]) { assigned[head[w]] = 1; return head[w]++; }
    // 自己的区间做完了 ⇒ 偷剩得最多的那个区间的尾巴
    let best = -1, bestN = 0;
    for (let x = 0; x < WORKERS; x++) { const r = remaining(x); if (r > bestN) { bestN = r; best = x; } }
    if (best < 0) return -1;
    while (tail[best] >= head[best] && assigned[tail[best]]) tail[best]--;
    if (tail[best] < head[best]) return -1;
    assigned[tail[best]] = 1;
    return tail[best]--;
  }
  function feed(kid) {
    if (stopping) { kid.send({ type: 'quit' }); return; }
    const b = nextBlockFor(kid._w);
    if (b < 0) { kid.send({ type: 'quit' }); return; }
    const lo = b * BLOCK, hi = Math.min(M, lo + BLOCK);
    kid.send({ type: 'block', index: b, keys: Array.from(keys.subarray(lo, hi)) });
  }
  function onDone(msg) {
    const b = msg.index, lo = b * BLOCK, hi = Math.min(M, lo + BLOCK);
    const arr = Int8Array.from(msg.scores);
    scores.set(arr, lo);
    // ⚠ 先落盘再记「已完成」：反过来的话进程被 kill 在中间，续跑会把这块当成算过的（静默丢数据）
    fs.writeFileSync(path.join(PARTS, 'b' + String(b).padStart(6, '0') + '.i8'), Buffer.from(arr.buffer));
    doneBlk[b] = 1; doneCount += hi - lo;
    solvedThisRun += hi - lo; nodesThisRun += msg.nodes;
    const now = Date.now();
    if (now - lastLog > 15000 || doneCount === M) {
      lastRateLog(now);
      lastLog = now;
    }
    if (STOP_AFTER > 0 && (now - started) / 1000 >= STOP_AFTER) stopping = true;
  }
  function lastRateLog(now) {
    const el = (now - started) / 1000;
    const rate = solvedThisRun / el;                         // 局面/秒
    const eta = rate > 0 ? (M - doneCount) / rate * 1000 : NaN;
    console.log('  ' + (doneCount * 100 / M).toFixed(2) + '%  ' + num(doneCount) + '/' + num(M) +
      '   ' + rate.toFixed(1) + ' 局面/s   已跑 ' + fmtDur(now - started) +
      '   ETA ' + (Number.isFinite(eta) ? fmtDur(eta) : '?') +
      '   ' + (nodesThisRun / el / 1e6).toFixed(1) + ' Mnodes/s');
  }

  let alive = 0;
  for (let i = 0; i < WORKERS; i++) {
    const kid = cp.fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    kid._w = i;
    alive++;
    kids.push(kid);
    kid.on('message', msg => {
      if (msg.type === 'ready') { feed(kid); return; }
      if (msg.type === 'done') { onDone(msg); feed(kid); }
    });
    kid.on('exit', code => {
      alive--;
      if (code !== 0 && code !== null) {
        console.error('worker 退出码 ' + code + ' —— 中断（已完成的块都在 ' + PARTS + '，可续跑）');
        process.exitCode = 1;
        for (const k of kids) { try { k.kill(); } catch (e) { /* 已经死了 */ } }
        return;
      }
      if (alive === 0) {
        if (doneCount === M) finalize();
        else {
          lastRateLog(Date.now());
          console.log('已停（--stop-after 或全部块派完）。完成 ' + num(doneCount) + '/' + num(M) +
            ' —— 直接重跑同一条命令即可续。');
        }
      }
    });
  }

  process.on('SIGINT', () => {
    console.log('\n收到 Ctrl-C：停止派新块，已完成的块都已落盘，重跑即可续。');
    stopping = true;
  });

  function finalize() {
    const buf = BOOK.encode({
      ply: N, keys: keys, scores: scores, srcHash: srcHash(), ruleset: BOOK.RULESET_CLASSIC
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, buf);
    console.log('✅ 写出 ' + OUT + '  ' + num(buf.length) + ' 字节（' +
      (buf.length / 1048576).toFixed(2) + ' MiB）/ ' + num(M) + ' 条 / ply ' + N);
    // 立刻回读一遍（⭐ 写完必独立复查：不信自己刚才的转述）
    const rb = BOOK.parse(fs.readFileSync(OUT));
    if (rb.count !== M || rb.ply !== N) throw new Error('回读校验失败');
    let bad = 0;
    for (let i = 0; i < M; i++) if (rb.get(keys[i]) !== scores[i]) { bad++; if (bad < 5) console.error('回读不一致 key=' + keys[i]); }
    if (bad) throw new Error('回读逐条校验失败 ' + bad + ' 条');
    console.log('✅ 回读逐条一致（' + num(M) + ' 条）');
    console.log('⛔ 下一步：npm run test:c4（含 test-book.js 一致性门禁）—— 库没过门禁不算生成完。');
  }
}

// ─────────── 入口 ───────────
if (require.main === module) {
  if (process.argv.includes('--worker')) runWorker();
  else {
    try { main(); }
    finally { S.setKeepTable(false); }   // 主进程本来就没开，但这条纪律不留缺口
  }
}

module.exports = { enumerateFrontier, decodeKey, assertLegal, keySet, srcHash };
