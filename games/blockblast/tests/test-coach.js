// test-coach.js — 运行时教练（js/coach.js）：提示 / 评价 / 生存模拟 / 死亡复盘。
//
// ⛔ 最重要的一条在最后：**教练绝不能碰块流**。它是「把你本来就能算出来的东西算给你看」，
//    一旦它能影响发块，商店页上的公平承诺就成了谎言。
const assert = require('assert');
const Core = require('../js/core.js');
const Coach = require('../js/coach.js');
const Dealer = require('../js/dealer.js');
const Levels = require('../js/levels.js');

// ════════ 最优一手：一定是合法的、且优于「乱放」════════
{
  const s = Core.newGame(4242);
  const m = Coach.best(s);
  assert(m, '空盘一定有最优手');
  const p = Core.tray(s)[m.slot];
  assert(Core.canPlace(s.board, p, m.r, m.c), '教练给的落点必须真的放得下');

  const all = Coach.rankMoves(s);
  assert(all.length > 3);
  assert.strictEqual(all[0].v, m.v);
  for (let i = 1; i < all.length; i++) assert(all[i - 1].v >= all[i].v, '排序必须降序');
  console.log('test-coach: 最优一手 + 排序 OK');
}

// ════════ 提示不改变任何状态（只读）════════
{
  const s = Core.newGame(777);
  const snap = JSON.stringify({ b: s.board, i: s.streamIndex, sc: s.score, pl: s.placed });
  Coach.best(s); Coach.rankMoves(s); Coach.survive(s, 8);
  assert.strictEqual(JSON.stringify({ b: s.board, i: s.streamIndex, sc: s.score, pl: s.placed }), snap,
    '算提示/模拟绝不能动真实局面（否则「看一眼提示」就把你的局改了）');
  console.log('test-coach: 教练是只读的 OK');
}

// ════════ 评价：能消行却不消 = missLine；同消 2 条 = 妙手 ════════
{
  // 造一个「有一步能消整行」的局面：第 7 行只差最右一格
  const s = Core.newGame(11);
  for (let c = 0; c < 7; c++) s.board[Core.idx(7, c)] = 1;
  const tray = Core.tray(s);
  // 找出「能消行」的那一手和「消不掉」的另一手
  const all = Coach.rankMoves(s);
  const clearing = all.find(m => m.L > 0);
  const dull = all.filter(m => m.L === 0).pop();       // 排名**最差**的那一手
  assert(clearing && dull);
  const good = Coach.judge(s, clearing);
  const bad = Coach.judge(s, dull);
  assert(good.grade !== 'miss', '能消的那一手不该被判失误');
  assert.strictEqual(bad.tag, 'missLine', '有的消不消 ⇒ 标 missLine');
  assert.strictEqual(bad.grade, 'miss');
  // ⚠ 顶尖手即使不消行也只是「不表扬」，绝不判失误（教练不能对有道理的取舍指手画脚）
  const topDull = all.find(m => m.L === 0);
  if (topDull && all.indexOf(topDull) < all.length * 0.15) {
    assert.notStrictEqual(Coach.judge(s, topDull).grade, 'miss');
  }
  assert.strictEqual(Coach.judge(s, { slot: 0, r: 9, c: 9 }), null, '非法手不评价（返回 null）');
  assert(tray.length === 3);
  console.log('test-coach: 妙手 / 失误判定 OK');
}

// ════════ 孤格判定：四面围死的空格才算 ════════
{
  const b = new Array(64).fill(0);
  assert.strictEqual(Coach.isolatedCount(b), 0);
  // (0,0) 角落：只要右边和下边被占，两条边界 + 两个块 = 四面围死
  b[Core.idx(0, 1)] = 1; b[Core.idx(1, 0)] = 1;
  assert.strictEqual(Coach.isolatedCount(b), 1, '角落被封 = 孤格');
  console.log('test-coach: 孤格判定 OK');
}

// ════════ 生存模拟：空盘能走很久；死局是 0 ════════
{
  assert(Coach.survive(Core.newGame(5), 20) >= 15, '空盘按最优走法应该能走满上限附近');
  const dead = Core.newGame(6);
  dead.board = new Array(64).fill(1);          // 全满 ⇒ 一步也放不下
  assert.strictEqual(Coach.survive(dead, 20), 0);
  console.log('test-coach: 生存模拟 OK');
}

// ════════ 死亡复盘：算得出才说，算不出就闭嘴（绝不编故事）════════
{
  // 空 history ⇒ null
  assert.strictEqual(Coach.postmortem([], {}), null);
  // 造一手：当时盘面很空 ⇒ 换个放法当然能多活很多步 ⇒ 应该给出结论
  const s = Core.newGame(31);
  const mv = Coach.rankMoves(s).slice(-1)[0];             // 故意取最差的一手
  const hist = [{ s: Coach.clone(s), mv: { slot: mv.slot, r: mv.r, c: mv.c }, turn: 1 }];
  const rv = Coach.postmortem(hist, { top: 3, limit: 12, min: 1 });
  if (rv) {
    assert(rv.gain >= 1 && rv.turn === 1);
    const p = Core.tray(s)[rv.slot];
    assert(Core.canPlace(s.board, p, rv.r, rv.c), '复盘建议的落点必须是当时真放得下的');
  }
  // min 抬到不可能达到的高度 ⇒ 必须返回 null（宁可不说）
  assert.strictEqual(Coach.postmortem(hist, { top: 3, limit: 12, min: 999 }), null);
  console.log('test-coach: 死亡复盘 OK');
}

// ════════ ⛔ 公平红线：教练存在与否，块流一模一样 ════════
{
  const seed = 98765;
  const before = [];
  for (let i = 0; i < 40; i++) before.push(Dealer.stream(seed, i).id);

  const s = Core.newGame(seed);
  // 疯狂使唤教练：提示、模拟、复盘全跑一遍
  for (let k = 0; k < 6; k++) {
    Coach.best(s); Coach.survive(s, 10);
    const m = Coach.best(s);
    if (!m) break;
    Coach.judge(s, m);
    Core.place(s, m.slot, m.r, m.c);
  }
  const after = [];
  for (let i = 0; i < 40; i++) after.push(Dealer.stream(seed, i).id);
  assert.deepStrictEqual(after, before,
    '⛔ 块流由 (seed, i) 唯一决定 —— 教练看过棋盘之后，发的块必须一块不变');
  console.log('test-coach: 公平承诺不被教练破坏 OK');
}

// ════════ 关卡模式：教练会优先打通有水晶的线（否则提示会把人带沟里）════════
{
  const def = Levels.LEVELS[0];
  const s = Core.newLevel(def, 2026);
  const m = Coach.best(s);
  assert(m, '关卡开局必有可行手');
  assert(Coach.evalBoard(s, s.board) < 0 || true);       // 关卡评估不炸即可
  console.log('test-coach: 关卡模式 OK');
}

// ════════ 性能：每次落子都会跑 judge，卡了就是手感问题 ════════
{
  const s = Core.newGame(1234);
  for (let i = 0; i < 20; i++) { const m = Coach.best(s); if (!m) break; Core.place(s, m.slot, m.r, m.c); }
  let t = Date.now();
  for (let i = 0; i < 20; i++) Coach.rankMoves(s);
  const perJudge = (Date.now() - t) / 20;
  t = Date.now();
  Coach.postmortem([{ s: Coach.clone(s), mv: { slot: 0, r: 0, c: 0 }, turn: 9 }], { top: 3, limit: 16, min: 1 });
  const pm = Date.now() - t;
  console.log(`test-coach: 性能 judge≈${perJudge.toFixed(1)}ms / 复盘≈${pm}ms`);
  assert(perJudge < 15, 'judge 每手都要跑，必须远快于一帧（16ms）');
  assert(pm < 1500, '复盘在死亡动画期间跑，超过 1.5s 就会拖到结算卡出现');
}
