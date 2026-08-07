// ════════════════════════════════════════
// test-lessons.js —— 课程引擎的门禁（P4 · DESIGN §5）。
//
// §5 的差异化不是「16 课的文案」，而是 §5.2 那三个自动化机制：
//   ① 自动出题（求解器筛局面 ⇒ 题目无限）② 自动判分 ③ ⭐ 诊断驱动推课。
// 这三条全在 lessons.js 里，而且**都是纯函数** ⇒ 在这里逐条钉死。
//
// ⚠ 出题那一条用**真求解器 + 真开局库**跑（那才叫「筛得出来」）；
//   判分/诊断用**手摆的 scoreAll**（⛔ 别真调求解器：那样测的是求解器不是判据）。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const LS = require('../js/lessons.js');
const RV = require('../js/review.js');
const B = require('../js/bitboard.js');
const R = require('../js/rules-classic.js');
const S = require('../js/solver.js');
const BOOK = require('../js/book.js');
const Th = require('../js/threats.js');

// ─────────── ① 课表本身 ───────────
{
  assert.strictEqual(LS.LESSONS.length, 16, '§5.1：五章**十六**课');
  const ids = LS.LESSONS.map(l => l.id);
  assert.deepStrictEqual(ids, Array.from({ length: 16 }, (_, i) => i + 1), 'id 必须是 1..16 连续');
  const chs = [...new Set(LS.LESSONS.map(l => l.chapter))];
  assert.deepStrictEqual(chs, [1, 2, 3, 4, 5], '五章');
  for (const L of LS.LESSONS) {
    assert.ok(LS.CONCEPTS.indexOf(L.concept) >= 0, '第 ' + L.id + ' 课的 concept 不在闭集里：' + L.concept);
    assert.ok(/^l\d+$/.test(L.key), '第 ' + L.id + ' 课的 locale key 形状不对');
  }
  assert.ok(Object.isFrozen(LS.LESSONS), '课表必须冻结');
  console.log('test-lessons: ① 五章十六课 + concept 闭集 OK');
}

// ─────────── ② ⭐ 自动判分：判据**复用 review.js**（⛔ 不另立一套）───────────
// ⚠⚠ 三处（提示 / 妙手 / 课程）一漂，就会同时出现「课程说你走对了、复盘说这是失误」，
//   而两边看起来都合理。⇒ 这条把它们钉在一起。
{
  const sa = { 0: -5, 3: 2, 6: -9 };
  const j = LS.judge(sa, 3);
  assert.strictEqual(j.ok, true, '走对唯一那列 ⇒ 判对');
  assert.strictEqual(j.label, RV.labelOf(sa, 3), '⭐ label 必须与 review.js 逐字相同');
  assert.deepStrictEqual(j.best, RV.safeCols(sa), '⭐ best 必须与 review.js 逐位相同');
  assert.strictEqual(LS.judge(sa, 0).ok, false, '走错 ⇒ 判错');
  assert.strictEqual(LS.judge(sa, 6).ok, false, '走错 ⇒ 判错');

  // ⭐ 「次优但没掉档」要判**对** —— ⛔ 别把它算错（玩家会莫名其妙）
  const sa2 = { 3: 9, 4: 5 };
  assert.strictEqual(LS.judge(sa2, 4).ok, true,
    '⭐ 同为必胜、只是赢得慢 ⇒ 判对（⛔ 把次优判成错会让玩家莫名其妙）');
  assert.strictEqual(LS.judge(sa2, 4).label, 'good');

  // ⭐ 必败局面里怎么走都不算错（与 review 的口径一致）
  const sa3 = { 0: -5, 3: -3 };
  for (const c of [0, 3]) assert.strictEqual(LS.judge(sa3, c).ok, true, '必败局面不扣分');

  // 理由是那四条机械导出之一
  assert.ok(['only', 'makeFork', 'blockFork', 'steady'].indexOf(j.reason) >= 0, '理由必须机械导出');
  assert.throws(() => LS.judge({}, 3), /终局|scoreAll/, '⛔ 终局局面 fail-fast');
  console.log('test-lessons: ② ⭐ 自动判分（与 review.js 同源 + 次优判对 + 必败不扣分）OK');
}

// ─────────── ③ ⭐⭐ 诊断标签 → 推课（§5.2.3 的自适应课程）───────────
{
  // ⚠ 只给**真的掉了档**的手打标签
  assert.strictEqual(LS.tagOf({ 3: 9, 4: 5 }, 4, {}), null,
    '⛔ 次优但没掉档 ⇒ 不打标签（否则「我的弱点」会统计出一堆根本不是错的东西）');
  assert.strictEqual(LS.tagOf({ 0: -5, 3: -3 }, 0, {}), null, '必败局面里不打标签');

  // ⭐ 走在对方威胁正下方 —— 新手最致命的一错，优先级最高
  assert.strictEqual(LS.tagOf({ 3: 5, 4: -3 }, 4, { underCols: [4] }), 'under');
  // 漏挡对方的双威胁
  assert.strictEqual(LS.tagOf({ 3: 5, 4: -3 }, 4, { antiforkCols: [3] }), 'missFork');
  // 弃中路（中列本来是最优之一）
  assert.strictEqual(LS.tagOf({ 3: 5, 4: 0 }, 4, {}), 'offCenter');
  // 兜底：说不清类型的掉档
  assert.strictEqual(LS.tagOf({ 0: 5, 4: 0 }, 4, {}), 'parity',
    '⚠ 说不清类型的掉档也要有标签 —— ⛔ 丢掉的话统计会漏');

  // ⭐ 每个标签都推得出一课，且那一课真的存在
  for (const t of LS.TAGS) {
    const id = LS.LESSON_OF_TAG[t];
    assert.ok(LS.lessonOf(id), '标签 ' + t + ' 推的第 ' + id + ' 课不存在');
  }
  // ⭐ 「我的弱点」按次数降序，⛔ 0 次的不出现
  const w = LS.weakness({ under: 23, offCenter: 5, missFork: 0 });
  assert.strictEqual(w.length, 2, '⛔ 0 次的不该出现在弱点页');
  assert.strictEqual(w[0].tag, 'under', '最常犯的排第一（§5.3 那句「本月 23 次」）');
  assert.strictEqual(w[0].lesson, 5, '⭐ 直接推第 5 课');
  assert.deepStrictEqual(LS.weakness({}), [], '一次失误都没有 ⇒ 空');

  // ⭐ 「下一个目标」
  assert.strictEqual(LS.nextLesson({ under: 3 }, []), 5, '有弱点 ⇒ 推那一课');
  assert.strictEqual(LS.nextLesson({ under: 3 }, [5]), 1, '那一课已做完 ⇒ 推第一课没做完的');
  assert.strictEqual(LS.nextLesson({}, []), 1, '没弱点 ⇒ 从第 1 课开始');
  assert.strictEqual(LS.nextLesson({}, [1, 2]), 3, '按顺序推下一课');
  console.log('test-lessons: ③ ⭐⭐ 诊断标签 → 自适应推课 OK');
}

// ─────────── ④ ⭐⭐ 自动出题：**真的筛得出来**（用真求解器 + 真库）───────────
// ⚠ 这条才是 §5.2.1 那句「题目无限、零人工设计」的证据。
// ⛔ 只测 matches() 的分支是不够的：那证明不了「随机走 N 手真能撞到符合条件的局面」。
{
  const BOOK_PATH = path.join(__dirname, '..', 'data', 'book-classic.bin');
  if (!fs.existsSync(BOOK_PATH)) {
    console.log('test-lessons: ④ 跳过（没有开局库；先跑 npm run gen:c4book）');
  } else {
    const raw = fs.readFileSync(BOOK_PATH);
    S.setBook(BOOK.parse(new Uint8Array(raw.buffer, raw.byteOffset, raw.length)));

    /** 攒出题用的上下文（⚠ threats 那几项是**零搜索**判据）。 */
    function ctxOf(bd) {
      const me = bd.turn;
      const legal = R.moves(bd);
      const underCols = [], forkCols = [], antiforkCols = [];
      const theirThreats = Th.forPlayer(bd, me ^ 1);
      for (const c of legal) {
        const nb = B.play(bd, c);
        // 走了就当场输 = 对方下一手能连四
        const loses = R.moves(nb).some(d => B.isWinningMove(nb, d));
        // ⭐ 「正下方」：这一列的落点**正好在**对方某个威胁格的下面一格
        if (loses && theirThreats.some(t => t.c === c)) underCols.push(c);
        const f = Th.forkOf(bd, nb);
        if (f && f.player === me) forkCols.push(c);
        // 不走这列，对方下一手就能形成双威胁 ⇒ 这列是「反叉」的关键
        const ob = B.clone(nb); ob.turn = me ^ 1;
        if (R.winningMoves(ob).length >= 2) antiforkCols.push(c);
      }
      return { n: bd.n, underCols, forkCols, antiforkCols };
    }

    /** ⭐ 出题器：确定性伪随机走 N 手，筛符合本课概念的局面（⛔ 禁 Math.random）。 */
    function findFor(concept, tries) {
      let x = 20260806;
      for (let t = 0; t < tries; t++) {
        let bd = B.newBoard();
        const depth = 4 + (t % 26);
        for (let d = 0; d < depth; d++) {
          if (R.terminal(bd) !== null) break;
          const legal = R.moves(bd);
          x = (x * 1103515245 + 12345) >>> 0;
          bd = B.play(bd, legal[x % legal.length]);
        }
        if (R.terminal(bd) !== null) continue;
        const sa = S.scoreAll(bd);
        if (!Object.keys(sa).length) continue;
        if (LS.matches(concept, sa, ctxOf(bd))) return { bd, sa };
      }
      return null;
    }

    // ⭐ 每个概念都要真的筛得出题目来（⛔ 筛不出 = 那一课上不了）
    const got = {};
    for (const cpt of LS.CONCEPTS) {
      const q = findFor(cpt, 160);
      got[cpt] = !!q;
      assert.ok(q, '⛔⛔ 概念「' + cpt + '」一道题都筛不出来 —— 那一课就上不了'
        + '（§5.2.1 的「题目无限、零人工设计」不成立）');
      // ⭐ 筛出来的题必须**判得了分**（自动出题与自动判分要接得上）
      const best = RV.safeCols(q.sa);
      assert.ok(best.length >= 1, '筛出来的题必须有最优解');
      assert.strictEqual(LS.judge(q.sa, best[0]).ok, true, '⭐ 走最优必须判对');
      const bad = Object.keys(q.sa).map(Number).filter(c => best.indexOf(c) < 0);
      if (bad.length) {
        const jb = LS.judge(q.sa, bad[0]);
        assert.ok(typeof jb.ok === 'boolean', '非最优也要判得出结果');
      }
    }
    console.log('test-lessons: ④ ⭐⭐ 九个概念**全部筛得出真题**（' +
      Object.keys(got).join('/') + '）+ 判分接得上 OK');
  }
}

// ─────────── ⑤ ⛔ 源码级红线：不碰 Worker / 存储 / 随机 ───────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'lessons.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const bad of ['EngineClient', 'Math.random', 'localStorage', 'fetch']) {
    assert.ok(code.indexOf(bad) < 0,
      '⛔ lessons.js 的**代码**里出现了 "' + bad + '" —— 真值由调用方注入，'
      + '这一层必须能在 node 里逐条钉死');
  }
  assert.ok(src.indexOf('EngineClient') >= 0 && code.indexOf('EngineClient') < 0, '剥注释没生效');
  assert.ok(Object.isFrozen(LS), 'API 必须冻结');
  console.log('test-lessons: ⑤ ⛔ 源码红线 + API 冻结 OK');
}

console.log('test-lessons: 全部通过');
