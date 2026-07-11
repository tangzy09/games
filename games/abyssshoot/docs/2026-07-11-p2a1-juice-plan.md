# Abyss Shooter P2a-1「手感层」—— 动画 + 音效 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让深渊射手从「电子表格」变成「游戏」——弹药飞入、合并弹跳、**级联逐轮回放**、重力滑动、刷行下压、顶爆震动，配 6 个合成音效。这一层是「原型→产品」的那一跃，也是能公平判断核心好不好玩的前提。

**Architecture:** 三处改动，从下到上：
1. **core（最小侵入）**：`resolve()` 现在把整串连锁**一次算完**，render 只看得到最终盘面——中间那几轮级联「在数据上根本不存在」。改法：每轮往 `s.events` 塞一份**盘面快照 + 本轮合并明细**（`{t:'round', n, merges, board}`），`shoot`/`spawnRow` 也各塞一份快照。core 依然纯函数、依然确定、单测照跑，只是多留了「过程」而不只是「结果」。**现有 `merge`/`chain` 事件保留不动**（音效/成就的硬契约，单测在守）。
2. **main**：加 **RAF 动画循环**（P1b 是回合制立即模式，无主循环）。`shoot` 后从事件流**编排动画时间线**，播放期间**封锁输入**，播完才判死进 DEAD。空闲时停 RAF 不烧 CPU。
3. **render**：按「上一帧盘面 → 下一帧盘面 + 进度 p」插值绘制。

**测试友好**：`G.noAnim = true` 可跳过动画瞬间结算（E2E 用，保持快且确定）。

**Tech Stack:** 纯 JS + canvas。音效走 `engine/audio.js` 的 `Sfx.play(name)`（`GAME_CONFIG.sfx` 映射），wav **纯代码合成、零外部素材**（抄 `games/snake/tools/gen-sfx.js` 的做法：自己写 RIFF 头）。

**必读**：`games/abyssshoot/CLAUDE.md`（棋盘模型/不变量）、`games/abyssshoot/js/core.js`（现有实现）、`games/snake/tools/gen-sfx.js`（音效合成）、`games/snake/js/main.js`（RAF 循环 + `Sfx.play` 消费事件流的写法）、`engine/audio.js`。

**⚠ 部署铁律**：本阶段改了 js → **`index.html` 里所有 `?v=1` 统一改成 `?v=2`**（忘了 = 老玩家拿到新旧混装 JS）。

---

## 棋盘/动画的关键事实（别搞反）

- 列 `index 0 = 顶`，往下长，**末尾 = 底（玩家侧/死线）**。格子 `(c,i)` 画在 `y = boardY + i*cell`。
- 重力是 `filter(v>0)` **保序压实向 index 0**——所以「幸存的格子从旧 index 映射到新 index」是**可精确计算**的：按顺序数它前面还剩几个非零格。动画的位置插值就靠这个。
- `spawnRow` 是 `unshift`：所有格子 index +1，顶部 index 0 是新格。

---

## 文件结构

- 修改 `games/abyssshoot/js/core.js` —— `resolve`/`spawnRow`/`shoot` 增发盘面快照与合并明细（不改玩法规则）。
- 修改 `games/abyssshoot/tests/test-core.js` —— 断言新事件的形状与内容。
- 新建 `games/abyssshoot/tools/gen-sfx.js` —— 合成 6 个 wav（产物入库）。
- 新建 `games/abyssshoot/assets/audio/*.wav` —— 6 个音效（由上面脚本生成）。
- 修改 `games/abyssshoot/js/render.js` —— 动画感知绘制（插值/弹跳/震动）。
- 修改 `games/abyssshoot/js/main.js` —— RAF 动画循环 + 时间线编排 + 输入封锁 + 音效接线。
- 修改 `games/abyssshoot/index.html` —— `GAME_CONFIG.sfx` + **`?v=2`**。
- 修改 `games/abyssshoot/tests/e2e-p1b.cjs` —— 适配动画（`noAnim` 快速通关 + 单独验动画真的在跑）。

---

## Task 1: core —— 级联逐轮快照（让「过程」在数据上存在）

**Files:**
- Modify: `games/abyssshoot/js/core.js`
- Test: `games/abyssshoot/tests/test-core.js`

- [ ] **Step 1: 写失败测试**

Append to `games/abyssshoot/tests/test-core.js`（放在文件末尾 `console.log` 之前的位置，新起一段）：

```javascript
// ── P2a-1: 级联逐轮快照(动画回放要用) ──
// snapBoard 深拷贝,round 事件带本轮合并明细 + 本轮结算后的盘面
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];   // 2+2→4,再与顶部 4→8:两轮
Core.resolve(s);
const rounds = s.events.filter(e => e.t === 'round');
assert.strictEqual(rounds.length, 2, '两轮级联发两个 round 事件');
assert.strictEqual(rounds[0].n, 1, '第一轮 n=1');
assert.strictEqual(rounds[1].n, 2, '第二轮 n=2');
// 每轮带本轮合并明细
assert.strictEqual(rounds[0].merges.length, 1, '第1轮一次合并');
assert.strictEqual(rounds[0].merges[0].value, 2, '合的是 2');
assert.strictEqual(rounds[0].merges[0].nv, 4, '合成 4');
assert.strictEqual(rounds[0].merges[0].cells.length, 2, '两个 2 参与');
assert.deepStrictEqual(rounds[0].merges[0].anchor, { c: 0, i: 2 }, '锚点=最低');
// 每轮带「本轮结算+重力后」的盘面快照
assert.deepStrictEqual(rounds[0].board[0], [4, 4], '第1轮后:2,2合成4,与顶部4并列');
assert.deepStrictEqual(rounds[1].board[0], [8], '第2轮后:4,4→8');
// 最后一轮的快照 === 最终盘面
assert.deepStrictEqual(rounds[rounds.length - 1].board, s.board.map(c => c.slice()),
  '末轮快照应等于最终盘面');
// 快照是深拷贝:改快照不该动到真盘
rounds[0].board[0].push(999);
assert.deepStrictEqual(s.board[0], [8], '快照是深拷贝,不与真盘共享引用');

// shoot 事件带「弹药落定后、结算前」的盘面(动画起始帧)
s = Core.createGame({ seed: 1 });
s.board = [[], [], [8], [], []];
s.ammo = 4;                                  // 与 8 不同数,不会合并,盘面可预期
Core.shoot(s, 2);
const shotEv = s.events.find(e => e.t === 'shoot');
assert(shotEv && shotEv.board, 'shoot 事件带盘面快照');
assert.deepStrictEqual(shotEv.board[2], [8, 4], '快照是「弹药已落底、尚未结算」的盘面');

// spawn 事件带刷行后的盘面
s = Core.createGame({ seed: 3 });
s.board = [[16], [32], [], [64], []];
Core.spawnRow(s);
const spEv = s.events.find(e => e.t === 'spawn');
assert(spEv && spEv.board, 'spawn 事件带盘面快照');
assert.strictEqual(spEv.board[0].length, 2, '刷行后列0 两格');
assert.deepStrictEqual(spEv.board[0].slice(1), [16], '原有格被下移');

// 旧契约不许破:merge/chain 事件仍在(音效/成就在消费)
s = Core.createGame({ seed: 1 });
s.board = [[4, 2, 2], [], [], [], []];
const rr = Core.resolve(s);
assert.strictEqual(s.events.filter(e => e.t === 'merge').length, 2, 'merge 事件仍发');
assert(s.events.some(e => e.t === 'chain' && e.n === 2), 'chain 事件仍发');
assert.strictEqual(rr.merges, 2, 'resolve 返回值不变');
console.log('test-core: 级联快照 OK');
```

- [ ] **Step 2: 跑测试看它失败**

Run: `node games/abyssshoot/tests/test-core.js`
Expected: FAIL — 断言 `两轮级联发两个 round 事件` 失败（`rounds.length` 为 0）

- [ ] **Step 3: 改 core.js**

In `games/abyssshoot/js/core.js`：

(a) 在 `gravityUp` 上方加快照助手：

```javascript
// 盘面深拷贝快照(动画逐轮回放要用;5×9 小盘,开销可忽略)
function snapBoard(s) { return s.board.map(col => col.slice()); }
```

(b) 把 `resolve` 整个替换为（**只加事件，玩法规则一字不改**）：

```javascript
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
```

(c) `spawnRow` 末尾的事件改为带快照：

```javascript
function spawnRow(s) {
  for (let c = 0; c < s.cols; c++) s.board[c].unshift(spawnTile(s));
  s.events.push({ t: 'spawn', board: snapBoard(s) });
}
```

(d) `shoot` 里 push 弹药后的事件改为带快照（**在 `resolve(s)` 之前**）：

```javascript
  s.board[col].push(s.ammo);
  s.events.push({ t: 'shoot', c: col, v: s.ammo, board: snapBoard(s) });
  resolve(s);
```

(e) 把 `snapBoard` 加进导出对象：

```javascript
const Core = { createGame, genAmmo, smallestTile, gravityUp, findComponents, resolve, spawnRow, shoot, snapBoard,
  PREVIEW, AMMO_WINDOW, SPAWN_EVERY, TILE_MIN };
```

- [ ] **Step 4: 跑测试看它通过**

Run: `node games/abyssshoot/tests/test-core.js`
Expected: PASS — 全部 OK，含 `test-core: 级联快照 OK`

- [ ] **Step 5: 跑蒙特卡洛确认没改坏玩法/性能**

Run: `node games/abyssshoot/tests/test-sim.js`
Expected: PASS，局长分布应与之前**基本一致**（中位 ~54）——若分布大变，说明误改了玩法规则，回去查。

- [ ] **Step 6: 提交**

```bash
git add games/abyssshoot/js/core.js games/abyssshoot/tests/test-core.js
git commit -m "feat(abyssshoot): core 增发级联逐轮快照+合并明细(供动画回放,玩法规则不变)"
```

---

## Task 2: 音效合成工具 + 6 个 wav

**Files:**
- Create: `games/abyssshoot/tools/gen-sfx.js`
- Create（脚本产出，入库）: `games/abyssshoot/assets/audio/{shoot,merge,chain,spawn,newfish,death}.wav`

抄 `games/snake/tools/gen-sfx.js` 的做法：纯代码合成 44.1kHz/16bit/mono wav，自己写 RIFF 头，**零外部素材**。深海主题 → 音色偏水润、柔和、有气泡感。

- [ ] **Step 1: 写生成脚本**

Create `games/abyssshoot/tools/gen-sfx.js`:

```javascript
// games/abyssshoot/tools/gen-sfx.js — 合成 6 个音效 wav(44.1kHz 16bit mono,零外部素材)
// 用法: node games/abyssshoot/tools/gen-sfx.js   (产物入库,改了才需重跑)
// 深海主题:水润、柔和、带气泡感。
const fs = require('fs'), path = require('path');
const SR = 44100;

function envelope(t, dur, a = 0.005, r = 0.08) {
  if (t < a) return t / a;
  const rel = dur - r;
  return t > rel ? Math.max(0, 1 - (t - rel) / r) : 1;
}
function synth(dur, fn) {
  const n = Math.round(SR * dur), buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; buf[i] = fn(t) * envelope(t, dur); }
  return buf;
}
// f0→f1 滑音正弦
function tone(f0, f1, dur, amp = 0.5) {
  return synth(dur, t => Math.sin(2 * Math.PI * (f0 + (f1 - f0) * (t / dur) / 2) * t) * amp);
}
// 气泡:快速上滑 + 轻微颤音
function bubble(f0, f1, dur, amp = 0.45) {
  return synth(dur, t => {
    const f = f0 + (f1 - f0) * (t / dur);
    const vib = 1 + 0.05 * Math.sin(2 * Math.PI * 28 * t);
    return Math.sin(2 * Math.PI * f * vib * t) * amp;
  });
}
function noise(dur, amp = 0.3) {
  // 确定性伪随机(不用 Math.random,保证每次生成的 wav 字节一致、可复现)
  let x = 123456789;
  return synth(dur, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return ((x / 0x7fffffff) * 2 - 1) * amp; });
}
function mix(...bufs) {
  const n = Math.max(...bufs.map(b => b.length));
  const out = new Float32Array(n);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}
function concat(...bufs) {
  let n = 0; bufs.forEach(b => { n += b.length; });
  const out = new Float32Array(n); let o = 0;
  bufs.forEach(b => { out.set(b, o); o += b.length; });
  return out;
}
function toWav(f32) {
  const n = f32.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE((Math.max(-1, Math.min(1, f32[i])) * 32767) | 0, 44 + i * 2);
  return buf;
}

const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });

const SFX = {
  shoot:   bubble(320, 620, 0.10, 0.40),                          // 发射:短促上冒气泡
  merge:   mix(tone(520, 780, 0.14, 0.42), bubble(700, 980, 0.12, 0.20)),  // 合并:清亮上扬
  chain:   concat(tone(600, 820, 0.09, 0.38), tone(820, 1100, 0.09, 0.38),
                  tone(1100, 1450, 0.11, 0.36)),                  // 连锁:三段递进(越连越高)
  spawn:   mix(tone(200, 150, 0.16, 0.34), noise(0.10, 0.06)),    // 刷行:低沉下压
  newfish: concat(tone(660, 880, 0.10, 0.40), tone(880, 1320, 0.16, 0.42)), // 新最深鱼:欢快两段
  death:   mix(tone(260, 70, 0.55, 0.48), noise(0.30, 0.10)),     // 死亡:下坠闷响
};

for (const [name, buf] of Object.entries(SFX)) {
  const f = path.join(OUT, name + '.wav');
  fs.writeFileSync(f, toWav(buf));
  console.log('写出', f, fs.statSync(f).size, 'bytes');
}
console.log('gen-sfx OK — 6 个音效已生成');
```



- [ ] **Step 2: 跑生成**

Run: `node games/abyssshoot/tools/gen-sfx.js`
Expected: 打印 6 行「写出 …wav … bytes」+ `gen-sfx OK`。确认 `games/abyssshoot/assets/audio/` 下有 6 个 wav 且**大小 > 4KB**（太小说明合成失败）。

- [ ] **Step 3: 提交（脚本 + 产物都入库）**

```bash
git add games/abyssshoot/tools/gen-sfx.js games/abyssshoot/assets/audio
git commit -m "feat(abyssshoot): 合成 6 个深海音效 wav(零外部素材)"
```

---

## Task 3: render —— 动画感知绘制

**Files:**
- Modify: `games/abyssshoot/js/render.js`

`renderAll()` 现在要能画「两个盘面之间的中间态」。核心是 `drawBoardAnimated(L, step, p)`：给定 `step.from`（旧盘）、`step.to`（新盘）、进度 `p∈[0,1]`，插值画出。

**幸存格的 index 映射**（精确可算，别猜）：重力是保序压实，所以对每列，把 `from[c]` 里**不参与合并的格**按顺序取出，它们在 `to[c]` 里的新 index 就是它们在这个序列里的位置；锚点格是幸存的（值变成 `nv`）。

- [ ] **Step 1: 改 render.js**

在 `games/abyssshoot/js/render.js` 里：

(a) 顶部常量区加缓动与动画时长：

```javascript
// 动画时长(ms)。改这里调手感。
const ANIM = { fly: 110, merge: 200, spawn: 160, death: 340 };
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
```

(b) 加一个「按像素位置画格子」的底层函数（现有 `drawTile` 是按格坐标画；抽出可缩放版）：

```javascript
// 按像素位置+缩放画一个格子(动画用)。scale=1 即正常大小,alpha 控淡出。
function drawTileAt(px, py, cell, v, scale = 1, alpha = 1) {
  const t = Tiles.tierOf(v);
  const color = t < 0 ? PAL.tiers[PAL.tiers.length - 1] : PAL.tiers[t % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  const size = (cell - m * 2) * scale;
  const cx = px + cell / 2, cy = py + cell / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRR(cx - size / 2, cy - size / 2, size, size, Math.round(size * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.max(6, Math.round(size * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42)));
  txt(label, cx, cy, '#04121f', `bold ${fs}px sans-serif`);
  ctx.restore();
}
```

(c) 加「合并/刷行的中间态盘面」绘制：

```javascript
// 算出 from[c] 里每个 index 的去向:
//   merged 非锚点 → 飞向锚点后消失
//   其余(含锚点) → 幸存,新 index = 它在「幸存序列」里的位置(重力保序压实)
function mapColumn(fromCol, c, merges) {
  const mergedSet = new Set(), anchorVal = new Map();
  for (const m of merges) {
    for (const cell of m.cells) if (cell.c === c) mergedSet.add(cell.i);
    if (m.anchor.c === c) anchorVal.set(m.anchor.i, m.nv);
  }
  const out = [];        // {i, v, kind:'survive'|'vanish', toI, anchorI}
  let newIdx = 0;
  const anchorNewIdx = new Map();
  // 第一遍:定幸存者的新 index
  for (let i = 0; i < fromCol.length; i++) {
    const isMerged = mergedSet.has(i), isAnchor = anchorVal.has(i);
    if (isMerged && !isAnchor) continue;          // 消失,不占位
    if (isAnchor) anchorNewIdx.set(i, newIdx);
    out.push({ i, v: isAnchor ? anchorVal.get(i) : fromCol[i],
               oldV: fromCol[i], kind: 'survive', toI: newIdx, isAnchor });
    newIdx++;
  }
  // 第二遍:消失者飞向它所属锚点的新位置
  for (const m of merges) {
    if (m.anchor.c !== c && !m.cells.some(x => x.c === c)) continue;
    for (const cell of m.cells) {
      if (cell.c !== c) continue;
      if (anchorVal.has(cell.i)) continue;        // 锚点自己不算消失
      out.push({ i: cell.i, v: fromCol[cell.i], kind: 'vanish',
                 anchor: m.anchor, anchorNv: m.nv });
    }
  }
  return { items: out, anchorNewIdx };
}

// 画一步合并动画的中间态
function drawMergeStep(L, step, p) {
  const e = easeOut(p);
  const s = G.s;
  // 先算每列锚点的新 index(消失格要飞向「锚点所在列的新位置」)
  const colMaps = [];
  for (let c = 0; c < s.cols; c++) colMaps.push(mapColumn(step.from[c], c, step.merges));
  const anchorPos = new Map();   // "c,i" → {c, toI}
  for (const m of step.merges) {
    const cm = colMaps[m.anchor.c];
    anchorPos.set(`${m.anchor.c},${m.anchor.i}`, { c: m.anchor.c, toI: cm.anchorNewIdx.get(m.anchor.i) });
  }
  for (let c = 0; c < s.cols; c++) {
    for (const it of colMaps[c].items) {
      if (it.kind === 'survive') {
        const y = L.boardY + (it.i + (it.toI - it.i) * e) * L.cell;
        const x = L.boardX + c * L.cell;
        if (it.isAnchor) {
          // 锚点:前半程还是旧值,p>0.5 换成新值并弹跳
          const showNew = p >= 0.5;
          const pop = showNew ? 1 + 0.28 * Math.sin(((p - 0.5) / 0.5) * Math.PI) : 1;
          drawTileAt(x, y, L.cell, showNew ? it.v : it.oldV, pop, 1);
        } else {
          drawTileAt(x, y, L.cell, it.v, 1, 1);
        }
      } else {
        // 消失格:飞向锚点新位置,缩小淡出
        const ap = anchorPos.get(`${it.anchor.c},${it.anchor.i}`);
        const fx = L.boardX + c * L.cell, fy = L.boardY + it.i * L.cell;
        const tx = L.boardX + ap.c * L.cell, ty = L.boardY + ap.toI * L.cell;
        const x = fx + (tx - fx) * e, y = fy + (ty - fy) * e;
        drawTileAt(x, y, L.cell, it.v, Math.max(0.05, 1 - e), Math.max(0, 1 - e));
      }
    }
  }
}

// 刷行:所有格下移一行,顶部新格淡入
function drawSpawnStep(L, step, p) {
  const e = easeInOut(p);
  const s = G.s;
  for (let c = 0; c < s.cols; c++) {
    const from = step.from[c], to = step.to[c];
    for (let i = 0; i < from.length; i++) {
      const y = L.boardY + (i + 1 * e) * L.cell;
      drawTileAt(L.boardX + c * L.cell, y, L.cell, from[i], 1, 1);
    }
    if (to.length) drawTileAt(L.boardX + c * L.cell, L.boardY, L.cell, to[0], 0.6 + 0.4 * e, e);
  }
}

// 发射:弹药从炮台飞到落点
function drawFlyStep(L, step, p) {
  const e = easeOut(p);
  const s = G.s;
  for (let c = 0; c < s.cols; c++)
    for (let i = 0; i < step.from[c].length; i++)
      drawTileAt(L.boardX + c * L.cell, L.boardY + i * L.cell, L.cell, step.from[c][i], 1, 1);
  const fx = L.boardX + step.col * L.cell, fy = L.cannonY;
  const ty = L.boardY + step.toI * L.cell;
  drawTileAt(fx, fy + (ty - fy) * e, L.cell, step.v, 1, 1);
}
```

(d) `renderAll()` 里，把「画鱼格」那一段改成：**若 `G.anim` 正在播，交给对应的 step 绘制；否则照旧静态画**。同时给 DEAD 加轻微震动：

在 `renderAll` 里原本的静态格子循环处，改为：

```javascript
  // ── 鱼格:动画中交给 step 绘制,否则静态画 ──
  const step = G.anim && G.anim.steps[G.anim.i];
  const p = step ? Math.min(1, (G.anim.elapsed || 0) / step.dur) : 1;
  if (step && step.type === 'fly')        drawFlyStep(L, step, p);
  else if (step && step.type === 'merge') drawMergeStep(L, step, p);
  else if (step && step.type === 'spawn') drawSpawnStep(L, step, p);
  else {
    for (let c = 0; c < s.cols; c++) {
      const col = s.board[c];
      for (let i = 0; i < col.length && i < s.rows; i++) {
        drawTile(L.boardX + c * L.cell, L.boardY + i * L.cell, L.cell, col[i]);
      }
    }
  }
```

> ⚠ **顶爆格（`drawBreaches`）与死线、炮台、HUD、覆盖层的绘制顺序保持原样不变**——顶爆格仍在 `drawDim` 之后画（P1b 的修复，别回退）。

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/render.js
git commit -m "feat(abyssshoot): render 动画感知绘制(飞入/合并弹跳/重力滑动/刷行下压)"
```

---

## Task 4: main —— RAF 动画循环 + 时间线编排 + 音效

**Files:**
- Modify: `games/abyssshoot/js/main.js`

- [ ] **Step 1: 改 main.js**

(a) `G` 加动画字段：

```javascript
var G = {
  phase: 'HOME',   // HOME | PLAYING | DEAD
  s: null,         // core 状态
  anim: null,      // 动画时间线:{ steps:[...], i, elapsed } —— 非 null 时封锁输入
  noAnim: false,   // E2E 用:置 true 则跳过动画瞬间结算
};
var rafId = null;
```

(b) 加时间线编排 + RAF 循环 + 音效接线：

```javascript
// 从事件流编排动画时间线。事件是按时间顺序 push 的,顺着走即可。
function buildAnim(events) {
  const steps = [];
  let prev = null;
  for (const ev of events) {
    if (ev.t === 'shoot') {
      // 弹药飞入:起始盘面 = 「弹药尚未落定」的盘 = 快照去掉该列末尾那一格
      const from = ev.board.map(col => col.slice());
      from[ev.c].pop();
      steps.push({ type: 'fly', dur: ANIM.fly, from, col: ev.c, v: ev.v,
                   toI: ev.board[ev.c].length - 1, sfx: 'shoot' });
      prev = ev.board;
    } else if (ev.t === 'round') {
      steps.push({ type: 'merge', dur: ANIM.merge, from: prev, to: ev.board,
                   merges: ev.merges, sfx: ev.n >= 2 ? 'chain' : 'merge' });
      prev = ev.board;
    } else if (ev.t === 'spawn') {
      steps.push({ type: 'spawn', dur: ANIM.spawn, from: prev, to: ev.board, sfx: 'spawn' });
      prev = ev.board;
    } else if (ev.t === 'death') {
      steps.push({ type: 'death', dur: ANIM.death, sfx: 'death' });
    }
  }
  return steps.length ? { steps, i: 0, elapsed: 0, last: 0 } : null;
}

function playStepSfx(step) {
  if (!step) return;
  if (step.sfx) Sfx.play(step.sfx);
  if (step.type === 'death') Haptics.medium();
}

function frame(ts) {
  if (!G.anim) { rafId = null; return; }        // 空闲即停 RAF,不烧 CPU
  const a = G.anim;
  if (!a.last) a.last = ts;
  a.elapsed += ts - a.last;
  a.last = ts;
  const step = a.steps[a.i];
  if (a.elapsed >= step.dur) {
    a.i++; a.elapsed = 0;
    if (a.i >= a.steps.length) { finishAnim(); return; }
    playStepSfx(a.steps[a.i]);
  }
  renderAll();
  rafId = requestAnimationFrame(frame);
}

function finishAnim() {
  G.anim = null;
  rafId = null;
  if (G.s.dead) G.phase = 'DEAD';               // 动画播完才进死亡画面
  renderAll();
}

function startAnim(events) {
  // 「新最深的鱼」独立播一声(不占时间线,叠在合并音上)
  if (events.some(e => e.t === 'newMaxFish')) Sfx.play('newfish');
  const a = buildAnim(events);
  if (!a || G.noAnim) { finishAnim(); return; }
  G.anim = a;
  playStepSfx(a.steps[0]);
  renderAll();
  if (rafId == null) rafId = requestAnimationFrame(frame);
}
```

(c) `dispatch` 的 SHOOT 分支改为走动画，并**动画播放期间封锁输入**：

```javascript
function dispatch(action, data) {
  if (G.anim) return;                            // 动画播放中,封锁一切输入(防连点错乱)
  switch (action) {
    case 'START':
    case 'RESTART':
      newGame();
      break;
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      Core.shoot(G.s, data.col);
      startAnim(G.s.events);                     // 内部会 renderAll / 起 RAF / 播完判死
      return;                                    // 不走下面的 renderAll(动画循环自己画)
    }
    default: break;
  }
  renderAll();
}
```

(d) `newGame()` 里清动画状态：

```javascript
function newGame() {
  G.s = Core.createGame({ seed: (Date.now() % 2147483647) });
  G.anim = null;
  G.phase = 'PLAYING';
}
```

- [ ] **Step 2: 提交**

```bash
git add games/abyssshoot/js/main.js
git commit -m "feat(abyssshoot): main RAF 动画循环+时间线编排+音效接线+动画期封锁输入"
```

---

## Task 5: index.html —— 音效配置 + **?v=2**（部署铁律）

**Files:**
- Modify: `games/abyssshoot/index.html`

- [ ] **Step 1: 加 sfx 配置**

把 `window.GAME_CONFIG` 改为：

```javascript
  window.GAME_CONFIG = {
    id: 'abyss',
    languages: ['en', 'zh-CN'],
    sfx: {
      shoot: 'assets/audio/shoot.wav', merge: 'assets/audio/merge.wav',
      chain: 'assets/audio/chain.wav', spawn: 'assets/audio/spawn.wav',
      newfish: 'assets/audio/newfish.wav', death: 'assets/audio/death.wav',
    },
  };
```

- [ ] **Step 2: ⚠ 把所有 `?v=1` 改成 `?v=2`**

`index.html` 里**每一处** `?v=1`（engine.css / game.css / 全部 engine 脚本 / 全部游戏脚本）统一改成 `?v=2`。

> 根 CLAUDE.md 部署铁律：**改任何 js/css 必须 bump 缓存版本**，忘了 = 老玩家拿到新旧混装的 JS。

- [ ] **Step 3: grep 验证真的全改了（本仓静默失败过四次）**

Run: `grep -c "?v=2" games/abyssshoot/index.html && grep -c "?v=1" games/abyssshoot/index.html || echo "?v=1 已清零 ✅"`
Expected: `?v=2` 出现 **14** 次（2 个 css + 12 个 js），`?v=1` **0 次**。

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/index.html
git commit -m "feat(abyssshoot): 接入音效配置 + bump ?v=2(部署铁律)"
```

---

## Task 6: E2E 适配动画

**Files:**
- Modify: `games/abyssshoot/tests/e2e-p1b.cjs`

动画会让 `dispatch('SHOOT')` 不再瞬间完成。两条路都要测：
- **快速通关**：`G.noAnim = true` → 瞬间结算，整局跑到死（保持 E2E 快且确定）。
- **动画真的在跑**：单独一小段——不设 noAnim，射一发，断言 `G.anim` 变成非 null（动画启动）→ 等它变回 null（播完），并在动画**中途**截一张图。

- [ ] **Step 1: 改 E2E**

在 `games/abyssshoot/tests/e2e-p1b.cjs` 的「开局」之后、「连射直到死」之前，插入动画验证段：

```javascript
  // ── 动画真的在跑（不设 noAnim）──
  await page.evaluate(() => { G.noAnim = false; dispatch('SHOOT', { col: 0 }); });
  const animStarted = await page.evaluate(() => G.anim !== null);
  if (!animStarted) throw new Error('射击后 G.anim 应非 null(动画应启动)');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1b-anim.png') });   // 动画中途
  await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
  console.log('OK 动画启动→播放→结束');

  // 动画期间输入被封锁:anim 非 null 时 dispatch 应无效
  const blocked = await page.evaluate(() => {
    dispatch('SHOOT', { col: 1 });
    const shotsBefore = G.s.shots;
    if (G.anim) { dispatch('SHOOT', { col: 2 }); return G.s.shots === shotsBefore; }
    return true;   // 动画太快已结束,不算失败
  });
  if (!blocked) throw new Error('动画播放期间应封锁输入');
  await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
  console.log('OK 动画期封锁输入');
```

然后把「连射直到死」那段改成先关动画（保持快 + 确定）：

```javascript
  // 连射直到死(关动画瞬间结算,确定性选列,上限保护)
  await page.evaluate(() => { G.noAnim = true; });
  let guard = 0;
  while (guard < 3000) {
    const dead = await page.evaluate((g) => {
      if (G.phase !== 'PLAYING') return true;
      dispatch('SHOOT', { col: g % G.s.cols });
      return G.phase !== 'PLAYING';
    }, guard);
    guard++;
    if (dead) break;
  }
```

（其余断言与截图逻辑保持不变。）

- [ ] **Step 2: 跑 E2E**

Run: `node games/abyssshoot/tests/e2e-p1b.cjs`
Expected: 依次 `OK HOME 渲染` / `OK START → PLAYING` / `OK 动画启动→播放→结束` / `OK 动画期封锁输入` / `OK 整局跑通:…/ 顶爆 N 列 → DEAD` / `OK RESTART → 全新一局` / `e2e-p1b OK`，退出码 0。

- [ ] **Step 3: 看动画截图认账（地面真值）**

用 Read 工具真的看 `C:\tmp\abyssshoot\e2e-1b-anim.png`：应能看到**动画中途态**——比如弹药悬在半空飞向落点，或合并格正在收缩/弹跳。若看到的只是静止的最终盘面，说明动画没真跑起来（或截图时机不对），回去查。

- [ ] **Step 4: 提交**

```bash
git add games/abyssshoot/tests/e2e-p1b.cjs
git commit -m "test(abyssshoot): E2E 适配动画(noAnim 快速通关 + 验动画启动/封锁输入)"
```

---

## Task 7: 全量回归 + 文档更新

**Files:**
- Modify: `games/abyssshoot/CLAUDE.md`

- [ ] **Step 1: 全量回归**

Run: `npm test`
Expected: mines + snake + abyss 全绿（abyss 的 core 单测含新的级联快照断言、蒙特卡洛分布应与之前基本一致）。

Run: `npm run test:abyss:e2e`
Expected: 全绿。

- [ ] **Step 2: 更新 CLAUDE.md**

在 `games/abyssshoot/CLAUDE.md` 的「当前状态」段，把内容更新为反映 P2a-1 已完成（动画+音效已有；道具/图鉴/皮肤/成就/存档/鱼美术/iOS 仍未做）。

并在「纯逻辑纪律」段的事件流那一条后面，补一句新契约：

```markdown
- **级联逐轮快照**：`resolve` 每轮发 `{t:'round', n, merges, board}`（board 是深拷贝快照），`shoot`/`spawn` 也各带一份 `board` 快照——**这是动画逐轮回放的数据来源**。core 依然纯函数确定；改 resolve 时别把这些快照弄丢，否则动画退化成瞬间闪现。
```

并在「可调平衡参数」段后加一节：

```markdown
## 动画时长（调手感在这里）

`render.js` 顶部 `ANIM = { fly, merge, spawn, death }`（毫秒）。动画播放期间 `main.js` **封锁输入**（`G.anim` 非 null 即拒绝 dispatch），播完才判死进 DEAD。`G.noAnim = true` 可跳过动画瞬间结算（E2E 用）。RAF 循环**空闲即停**（不烧 CPU）。
```

- [ ] **Step 3: 提交**

```bash
git add games/abyssshoot/CLAUDE.md
git commit -m "docs(abyssshoot): CLAUDE.md 记录动画/音效契约与调参位置"
```

---

## Self-Review（写完自查）

- **Spec 覆盖**：core 级联快照✓(T1)、音效合成+产物✓(T2)、动画绘制(飞入/合并弹跳/重力滑动/刷行下压)✓(T3)、RAF 循环+时间线+封锁输入+音效接线✓(T4)、sfx 配置+`?v=2` 铁律✓(T5)、E2E 适配+动画截图认账✓(T6)、全量回归+文档✓(T7)。鱼美术明确留给 P2a-2，非本计划缺口。
- **占位扫描**：无 TBD/TODO/占位，每步含真实代码与确切命令/预期。
- **类型/命名一致**：`G.anim{steps,i,elapsed,last}`、`G.noAnim`、`ANIM{fly,merge,spawn,death}`、step 类型 `fly|merge|spawn|death`、事件 `{t:'round', n, merges, board}`、`Core.snapBoard`、`drawTileAt/drawFlyStep/drawMergeStep/drawSpawnStep/mapColumn` 全程一致。
- **不变量保护**：core 玩法规则一字未改（只加事件）——T1 Step 5 用蒙特卡洛分布比对来守这条；P1b 的顶爆格渲染（`drawDim` 之后画）明确要求不回退。
