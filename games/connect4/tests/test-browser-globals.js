// ════════════════════════════════════════
// test-browser-globals.js —— **浏览器加载路径**的门禁。
//
// 🔴 它为什么存在（P1 终审实锤，一个阻塞级 bug 活到了终审）：
//    P1 的全部测试都在 node 里跑 ⇒ 每个模块 `inNode ? require(...) : root.X` 的
//    **else 分支至今零消费者**。`ai.js` 因此带着
//        const PRNG = inNode ? require('../../../engine/prng.js') : root.PRNG;
//    进了仓库 —— 在浏览器里 `root.PRNG` 恒 undefined，第一次 aiMove 就
//    `TypeError: Cannot read properties of undefined (reading 'create')`，
//    也就是**整条 AI 阶梯在真实产品里 100% 不可用**，而 node 侧的 14 条门禁全绿。
//
// ⭐ 坑的根源是**两种不同的暴露方式混在同一个加载序列里**：
//    · `engine/prng.js` 顶层写的是 `const PRNG = {...}` —— 经典 <script> 里，顶层 const
//      是**全局词法环境的绑定**，不是 `self`/`window` 的属性 ⇒ `self.PRNG === undefined`，
//      但**裸标识符 `PRNG` 可用**（后续 <script> 能看见它）。
//    · 五个游戏模块结尾写的是 `root.X = API` —— 那是**属性** ⇒ `self.Bitboard` 有值。
//    两者都对，但取法不同。取错了不报错、只在浏览器里炸，而 CI 全在 node ⇒ 看不见。
//    ⛔ 正确写法见 games/snake/js/core.js:3-4：取**裸标识符**并换个局部名
//       （`const PRNG_ = inNode ? require(...) : PRNG;`）。
//       ⚠ 别写成 `const PRNG = inNode ? require(...) : PRNG;` —— 那是自我遮蔽，
//         同一作用域里的 const 在初始化前不可读，当场 ReferenceError（TDZ）。
//
// 做法：用 vm 造一个**没有 module / 没有 require、只有 self** 的沙箱，按将来 index.html
//      的真实 <script> 顺序依次求值，然后**真调一次**跨模块的入口，并与 node 路径逐位比对。
//      ⛔ 只断言「全局名挂上了」是不够的：ai.js 那个 bug 里 ConnectAI **挂得好好的**，
//        是它内部引用的 PRNG 拿不到 —— 必须真的调用才暴露。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const JS_DIR = path.resolve(__dirname, '..', 'js');

// ⭐ **这就是 index.html 里 <script> 的顺序**（顺序错了是「X is undefined」当场炸）。
//    ⛔ 将来加模块必须同时加到这里，否则新模块的浏览器路径又变成零覆盖。
// ⚠ state.js 必须排在 ai.js **之后**（它要 ConnectAI.paramsDigest）；
//   render.js 无跨模块依赖，但它的 `root.C4Render = API` 分支同样只有这里覆盖得到。
// ⛔ engine-client.js / main.js 不在这里：前者没有跨模块引用要验（它只 postMessage），
//    后者要 document / Worker，属于真浏览器 E2E 的活。
const LOAD_ORDER = [
  path.join(ROOT, 'engine', 'prng.js'),
  path.join(JS_DIR, 'bitboard.js'),
  path.join(JS_DIR, 'rules-classic.js'),
  path.join(JS_DIR, 'solver.js'),
  path.join(JS_DIR, 'book.js'),
  path.join(JS_DIR, 'ai.js'),
  path.join(JS_DIR, 'state.js'),
  path.join(JS_DIR, 'render.js'),
  path.join(JS_DIR, 'fx.js')
];

/** 造一个尽量像浏览器的沙箱：有 self、有 console，⛔ **没有 module / require / exports**
 *  （只要 `typeof module !== 'undefined'` 为真，模块就会走 node 分支，这条门禁就白做了）。 */
function makeBrowserSandbox() {
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.self = sandbox;                 // 模块取的是 `typeof self !== 'undefined' ? self : this`
  sandbox.console = { log: () => {}, warn: () => {}, error: () => {} };
  return sandbox;
}

const sandbox = makeBrowserSandbox();
for (const f of LOAD_ORDER) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}
console.log('test-browser: ' + LOAD_ORDER.length + ' 个 <script> 按序求值完毕（无 module / 无 require）OK');

// ─────────── ① 沙箱确实是「浏览器」而不是偷偷走了 node 分支 ───────────
{
  assert.strictEqual(vm.runInContext('typeof module', sandbox), 'undefined', '沙箱里不许有 module');
  assert.strictEqual(vm.runInContext('typeof require', sandbox), 'undefined', '沙箱里不许有 require');
  assert.strictEqual(vm.runInContext('typeof exports', sandbox), 'undefined', '沙箱里不许有 exports');
  console.log('test-browser: 沙箱无 module/require/exports（确实走的是浏览器分支）OK');
}

// ─────────── ② ⭐ PRNG 那一条：词法绑定 ≠ self 属性 ───────────
// 把「为什么不能写 root.PRNG」这个事实钉成可执行断言，⛔ 别删：
// 下一个人加模块时最自然的写法就是 `root.PRNG`，而那在 node 里测不出来。
{
  assert.strictEqual(vm.runInContext('typeof self.PRNG', sandbox), 'undefined',
    'engine/prng.js 顶层是 `const PRNG = {...}`（词法绑定）⇒ self.PRNG 必须是 undefined。'
    + '若这条变了，说明 engine 改了暴露方式，ai.js 的取法要跟着改');
  assert.strictEqual(vm.runInContext('typeof PRNG', sandbox), 'object',
    '裸标识符 PRNG 必须可用（后续 <script> 靠它拿到 PRNG）');
  assert.strictEqual(vm.runInContext('typeof PRNG.create', sandbox), 'function');
  // 反过来，五个游戏模块用的是 `root.X = API` ⇒ 必须是 self 的属性
  const NAMES = ['Bitboard', 'RulesClassic', 'Solver', 'Book', 'ConnectAI', 'C4State', 'C4Render', 'C4Fx'];
  for (const name of NAMES) {
    assert.strictEqual(vm.runInContext('typeof self.' + name, sandbox), 'object',
      'self.' + name + ' 没挂上（模块结尾的 root.' + name + ' = API 没生效？）');
  }
  console.log('test-browser: ⭐ self.PRNG === undefined 且裸 PRNG 可用；'
    + NAMES.length + ' 个模块全局名（' + NAMES.join('/') + '）齐 OK');
}

// ─────────── ③ ⭐⭐ 跨模块引用真的解析得到 —— **真调一次**，且与 node 逐位相同 ───────────
// ⛔ 这一节才是本文件的核心。ai.js 那个 bug 里 ConnectAI 挂得好好的、typeof 也是 object，
//    只有真的调用才会炸。所以每一条都必须是**调用**，不是存在性检查。
{
  const B = require('../js/bitboard.js');
  const R = require('../js/rules-classic.js');
  const S = require('../js/solver.js');
  const AI = require('../js/ai.js');
  const St = require('../js/state.js');
  const Rd = require('../js/render.js');

  const CASES = [
    {
      name: 'RulesClassic.moves(Bitboard.newBoard())',
      browser: 'JSON.stringify(RulesClassic.moves(Bitboard.newBoard()))',
      node: () => JSON.stringify(R.moves(B.newBoard()))
    },
    {
      name: 'Bitboard.fromMoves + winner',
      browser: 'JSON.stringify(Bitboard.winner(Bitboard.fromMoves([3,4,3,4,3,4,3])))',
      node: () => JSON.stringify(B.winner(B.fromMoves([3, 4, 3, 4, 3, 4, 3])))
    },
    {
      name: 'Solver.solve(Bitboard.fromMoves([3,4,3,4,3,4]))',
      browser: 'JSON.stringify((function(){var r=Solver.solve(Bitboard.fromMoves([3,4,3,4,3,4]));return [r.score,r.best];})())',
      node: () => { const r = S.solve(B.fromMoves([3, 4, 3, 4, 3, 4])); return JSON.stringify([r.score, r.best]); }
    },
    {
      name: 'Book.status()',
      browser: 'Book.status().state',
      node: () => require('../js/book.js').status().state
    },
    // ⭐ 阻塞项的现场：这一条在修好之前是 TypeError
    {
      name: 'ConnectAI.aiMove([3,3,4], 1, 12345)',
      browser: 'ConnectAI.aiMove([3,3,4], 1, 12345)',
      node: () => AI.aiMove([3, 3, 4], 1, 12345)
    },
    {
      name: 'ConnectAI.aiMove 深局面顶档（跨模块吃到 Solver）',
      browser: 'ConnectAI.aiMove([0,1,0,1,2,3,2,3,4,5,4,5,6,0,6,1,2,3,4,5,6,0,1,2], 20, 7)',
      node: () => AI.aiMove([0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5, 6, 0, 6, 1, 2, 3, 4, 5, 6, 0, 1, 2], 20, 7)
    },
    {
      name: 'ConnectAI.decide(...).reason（低档，走 PRNG）',
      browser: 'ConnectAI.decide([3,3,4], 3, 99).reason',
      node: () => AI.decide([3, 3, 4], 3, 99).reason
    },
    {
      name: 'ConnectAI.paramsDigest().hash（明面参数表两侧必须同一张）',
      browser: 'ConnectAI.paramsDigest().hash',
      node: () => AI.paramsDigest().hash
    },
    // ─── state.js：它跨模块吃 Bitboard / RulesClassic / **ConnectAI**（paramsDigest + TIER_MAX）───
    // ⭐ seed 显式给，否则 autoSeed 两端不同（那是设计，不是 bug）。
    {
      name: 'C4State.newGame（顶档强制玩家先手 + paramsHash 来自 ConnectAI）',
      browser: 'JSON.stringify(C4State.newGame({mode:"ai",tier:20,gameNo:1,seed:7}))',
      node: () => JSON.stringify(St.newGame({ mode: 'ai', tier: 20, gameNo: 1, seed: 7 }))
    },
    {
      name: 'C4State.serialize(play(...))（存档往返，吃 Bitboard.play 的守卫）',
      browser: 'C4State.serialize(C4State.play(C4State.newGame({mode:"human",gameNo:1,seed:-5}),3))',
      node: () => St.serialize(St.play(St.newGame({ mode: 'human', gameNo: 1, seed: -5 }), 3))
    },
    {
      name: 'C4State.isOver / turnOf / isHumanTurn（吃 RulesClassic.terminal）',
      browser: 'JSON.stringify((function(){var g=C4State.newGame({mode:"ai",tier:1,gameNo:0,seed:1});'
        + '[3,0,4,1,5,0,2].forEach(function(c){g=C4State.play(g,c);});'
        + 'return [C4State.isOver(g),C4State.turnOf(g),C4State.isHumanTurn(g),C4State.humanPlayer(g)];})())',
      node: () => {
        let g = St.newGame({ mode: 'ai', tier: 1, gameNo: 0, seed: 1 });
        [3, 0, 4, 1, 5, 0, 2].forEach(c => { g = St.play(g, c); });
        return JSON.stringify([St.isOver(g), St.turnOf(g), St.isHumanTurn(g), St.humanPlayer(g)]);
      }
    },
    // ─── render.js：几何是纯函数 ⇒ 不画一个像素也能在沙箱里逐位对拍 ───
    // （⚠ 沙箱里没有 GameGlobal，layout 的 typeof 兜底必须成立，否则浏览器首帧就 ReferenceError）
    {
      name: 'C4Render.layout(414,896) 的几何 + colAt（沙箱里无 GameGlobal，走 typeof 兜底）',
      browser: 'JSON.stringify((function(){var L=C4Render.layout(414,896);'
        + 'return [L.cell,L.pad,L.boardX,L.boardY,L.drop.y,L.hud.y,L.colAt(200,500),L.colAt(-1,-1)];})())',
      node: () => {
        const L = Rd.layout(414, 896);
        return JSON.stringify([L.cell, L.pad, L.boardX, L.boardY, L.drop.y, L.hud.y, L.colAt(200, 500), L.colAt(-1, -1)]);
      }
    },
    {
      name: 'C4Render.cellOwner / landingRow（读 Bitboard 的掩码，⛔ 不 require Bitboard）',
      browser: 'JSON.stringify((function(){var bd=Bitboard.fromMoves([3,3,4]);'
        + 'return [C4Render.cellOwner(bd,3,0),C4Render.cellOwner(bd,3,1),C4Render.cellOwner(bd,0,0),'
        + 'C4Render.landingRow(bd,3),C4Render.landingRow(bd,9)];})())',
      node: () => {
        const bd = B.fromMoves([3, 3, 4]);
        return JSON.stringify([Rd.cellOwner(bd, 3, 0), Rd.cellOwner(bd, 3, 1), Rd.cellOwner(bd, 0, 0),
          Rd.landingRow(bd, 3), Rd.landingRow(bd, 9)]);
      }
    },
    // ─── fx.js：曲线是闭式纯函数 ⇒ 沙箱里也能逐位对拍（浏览器分支的唯一覆盖）───
    {
      name: 'C4Fx.start/step/pose（浏览器分支：root.C4Fx = API 真的能跑一段动画）',
      browser: 'JSON.stringify((function(){C4Fx.reset();C4Fx.start("drop",{c:3,r:0,player:0});'
        + 'var e=C4Fx.step(150).concat(C4Fx.step(150));var p=C4Fx.pose()[0];C4Fx.reset();'
        + 'return [e.length,e[0].type,e[0].r,p.phase,p.dy,p.sx,p.sy];})())',
      node: () => {
        const Fx = require('../js/fx.js');
        Fx.reset(); Fx.start('drop', { c: 3, r: 0, player: 0 });
        const e = Fx.step(150).concat(Fx.step(150));
        const p = Fx.pose()[0]; Fx.reset();
        return JSON.stringify([e.length, e[0].type, e[0].r, p.phase, p.dy, p.sx, p.sy]);
      }
    }
  ];

  for (const c of CASES) {
    let got;
    try {
      got = vm.runInContext(c.browser, sandbox);
    } catch (e) {
      assert.fail('浏览器路径调用失败：' + c.name + '\n  ' + (e && e.message)
        + '\n  ⇒ 某个模块的 `root.X` 取法在浏览器里拿不到东西（node 侧测不出来，见文件头）');
    }
    const want = c.node();
    assert.strictEqual(got, want,
      '浏览器路径与 node 路径结果不同：' + c.name + '\n  浏览器 ' + String(got) + '\n  node   ' + String(want));
  }
  console.log('test-browser: ⭐⭐ ' + CASES.length + ' 条跨模块真调用，浏览器路径与 node 路径逐位相同 OK');
}

// ─────────── ④ 确定性承诺在浏览器路径上同样成立 ───────────
// ⚠ 两条路径各自确定还不够 —— §7 的「确定性锦标赛 / 一条 URL 分享整局」要求**同一个
//   (position,tier,seed) 在两端给出同一手**，否则手机端与网页端复盘对不上。
{
  const AI = require('../js/ai.js');
  const B2 = require('../js/bitboard.js');
  const R2 = require('../js/rules-classic.js');
  const line = [3, 2, 3, 4, 5, 1];
  // ⚠ 前提写成断言：第一版随手挑的 [3,3,4,4,2,2,5] 其实**已经是 WIN_0**（先手底行 2-5 四连），
  //   aiMove 照约定当场抛「已终局」——测试挂了却不是被测代码的错。夹具必须自证合法。
  assert.strictEqual(R2.terminal(B2.fromMoves(line)), null, '前提：这条线必须是非终局局面');
  let n = 0;
  for (const tier of [1, 3, 6, 12, 20]) {
    for (let seed = 0; seed < 8; seed++) {
      const b = vm.runInContext('ConnectAI.aiMove(' + JSON.stringify(line) + ',' + tier + ',' + seed + ')', sandbox);
      assert.strictEqual(b, AI.aiMove(line, tier, seed),
        '第 ' + tier + ' 级 seed=' + seed + '：浏览器与 node 落子不同');
      n++;
    }
  }
  console.log('test-browser: 同 (position,tier,seed) 两端同手 OK（' + n + ' 组）');
}

console.log('test-browser-globals: 全部通过');
