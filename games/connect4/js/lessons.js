// ════════════════════════════════════════
// lessons.js —— 课程系统的**引擎**（P4 · DESIGN §5）。
//
// §5 开篇：「竞品的教程都是几张静态图。**有真值 ⇒ 教程可以自动出题、自动判分、
//   无限供给、还能诊断你哪儿不会。**」
//
// ⭐⭐ 本文件承载的是 §5.2 那**三个自动化机制**（那才是差异化，16 课的文案只是量）：
//   ① **自动出题**：随机走 N 手 → 用求解器筛出符合本课概念的局面 ⇒ 题目无限、零人工设计；
//   ② **自动判分**：玩家一点，求解器立刻判对错，理由从评分结构**机械导出**；
//   ③ ⭐ **诊断驱动推课**：给每个失误打标签 → 统计最常犯哪一类 → 直接推那一课。
//
// ⛔ 本文件**不认识 Worker、不认识 UI、不读存储**：出题要用的真值由调用方以
//    `scoreAll(moves) -> {col:score}` 的形式**注入**（浏览器里是 EngineClient、
//    node 门禁里是真 solver）⇒ 这一层在 node 里可以被逐条钉死。
// ⚠ 判分与提示/妙手**共用 review.js 的判据**（⛔ 别另立一套：三处一漂，
//   「课程说你走对了、复盘说这是失误」就会同时出现，而两边看起来都合理）。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);
  const RV = inNode ? require('./review.js') : root.C4Review;

  /**
   * ⭐ 五章十六课（DESIGN §5.1 那张表）。
   * ⚠ 每一课只有三样东西是**代码**关心的：
   *   · `concept` —— 出题筛子的判据（⇒ 题目无限）
   *   · `chapter` —— 分章（UI 分组）
   *   · `key`     —— locale 前缀（⛔ 文案一律走 T()，本文件零硬编码）
   * ⚠ §5.4：讲解「短句 + 盘面为主」⇒ 每课只有 title/hint 两条文案，重量放在**局面**上。
   */
  const LESSONS = Object.freeze([
    // 第 1 章 看懂棋盘
    { id: 1, chapter: 1, key: 'l1', concept: 'win1' },      // 一步取胜
    { id: 2, chapter: 1, key: 'l2', concept: 'block1' },    // 一步防守
    { id: 3, chapter: 1, key: 'l3', concept: 'win1' },      // 四个方向（同判据、不同题面）
    // 第 2 章 别送人头
    { id: 4, chapter: 2, key: 'l4', concept: 'center' },    // 中列价值
    { id: 5, chapter: 2, key: 'l5', concept: 'under' },     // ⭐ 不要走在对方威胁正下方
    { id: 6, chapter: 2, key: 'l6', concept: 'block1' },    // 威胁识别
    // 第 3 章 制胜结构
    { id: 7, chapter: 3, key: 'l7', concept: 'fork' },      // 双威胁
    { id: 8, chapter: 3, key: 'l8', concept: 'fork' },      // 常见形状
    { id: 9, chapter: 3, key: 'l9', concept: 'antifork' },  // 提前破坏对方的叉
    // 第 4 章 深层理论（竞品完全没有）
    { id: 10, chapter: 4, key: 'l10', concept: 'only' },    // ⭐⭐ 奇偶性
    { id: 11, chapter: 4, key: 'l11', concept: 'only' },    // Zugzwang 迫移
    { id: 12, chapter: 4, key: 'l12', concept: 'under' },   // 威胁叠加
    { id: 13, chapter: 4, key: 'l13', concept: 'only' },    // 奇/偶威胁对抗
    // 第 5 章 兑现必胜
    { id: 14, chapter: 5, key: 'l14', concept: 'opening' }, // 开局理论（求解器当场演示）
    { id: 15, chapter: 5, key: 'l15', concept: 'endgame' }, // ⭐ 倒着教
    { id: 16, chapter: 5, key: 'l16', concept: 'opening' }  // 终极：空盘兑现
  ]);

  const CHAPTERS = Object.freeze([1, 2, 3, 4, 5]);
  const CONCEPTS = Object.freeze(['win1', 'block1', 'center', 'under', 'fork', 'antifork', 'only', 'opening', 'endgame']);

  function lessonOf(id) {
    for (const L of LESSONS) if (L.id === id) return L;
    return null;
  }

  // ════════ ⭐ 机制①：自动出题 ════════
  //
  // 判据全部建在**已经算好的 scoreAll** 上（⇒ 与判分、提示、妙手同一份真值）：
  //   · win1     有一列当场制胜（= 最优分等于「立刻赢」那一档）
  //   · block1   不走某列就会当场输 ⇒ 「只有 1 列不输」的一个子集
  //   · only     ⭐ 只有 1 列不输（奇偶性/迫移那几课的通用筛子 —— 那正是它们的表现形式）
  //   · center   最优列**只有中列**（中列参与 13 条四连线、边列只有 3 条）
  //   · under    ⭐ 存在一列「走了就当场输」，而它正在对方威胁的正下方（新手最致命的一错）
  //   · fork     走某列之后自己形成双威胁
  //   · antifork 不走某列，对方下一手就能形成双威胁
  //   · opening  n 很小（开局理论）
  //   · endgame  n 很大（⭐ 第 15 课的「倒着教」：从残局往前推）
  //
  // ⚠ `under`/`fork`/`antifork` 需要盘面信息 ⇒ 由调用方把 `C4Threats` 的结果一起喂进来
  //   （**零搜索**判据，⛔ 别为出题去调求解器第二次）。

  /**
   * ⭐ 这个局面符不符合某一课的概念。**纯函数**。
   * @param sa   `scoreAll(该局面)`
   * @param ctx  { n, threats:{mine:[],theirs:[]}, forkCols:[], antiforkCols:[] }
   * @returns bool
   */
  function matches(concept, sa, ctx) {
    if (!sa || !Object.keys(sa).length) return false;
    const c = ctx || {};
    const cols = Object.keys(sa).map(Number);
    const l1 = RV.hintLevel1(sa);
    const best = RV.safeCols(sa);
    switch (concept) {
      case 'win1':
        // ⚠ 「当场制胜」在分数上就是**最大可能分**：CELLS - n（solver.js 的锚点）
        return l1.bestSign > 0 && best.length >= 1 && (c.n === undefined || sa[best[0]] === (42 - c.n));
      case 'block1':
      case 'only':
        return l1.kind === 'only';
      case 'center':
        return best.length === 1 && best[0] === 3;
      case 'under':
        // ⭐ 有一列走了就当场输，且它在对方威胁的**正下方**（调用方算好传进来）
        return !!(c.underCols && c.underCols.length) && l1.kind !== 'lost';
      case 'fork':
        return !!(c.forkCols && c.forkCols.length);
      case 'antifork':
        return !!(c.antiforkCols && c.antiforkCols.length);
      case 'opening':
        return c.n !== undefined && c.n <= 6 && l1.kind !== 'lost';
      case 'endgame':
        return c.n !== undefined && c.n >= 20 && l1.kind !== 'lost' && cols.length >= 2;
      default:
        return false;
    }
  }

  // ════════ ⭐ 机制②：自动判分（⛔ 判据复用 review.js）════════

  /**
   * ⭐ 玩家在这一课点了某列 —— 对不对，为什么。
   * @returns { ok, label, reason, best }
   *   reason ∈ 'only' | 'makeFork' | 'blockFork' | 'steady'（与提示**同一套**机械理由）
   * ⚠⚠ `ok` 的判据是**「有没有掉档」而不是「是不是最优」**：
   *   一课里常有多列同样不输（比如第 4 课的中列价值），把「次优」判成错会让玩家莫名其妙。
   *   ⛔ 但 `only` 那几课本来就只有一列不掉档 ⇒ 那里两者自然重合，不必特判。
   */
  function judge(sa, col, ctx) {
    const label = RV.labelOf(sa, col);            // ⚠ 脏输入的 fail-fast 全在它那儿
    const best = RV.safeCols(sa);
    const h = RV.hintLevel2(sa, ctx || {});
    return {
      ok: label === 'best' || label === 'good',
      label: label,
      reason: h.reason,
      best: best
    };
  }

  // ════════ ⭐⭐ 机制③：诊断标签 → 推课（§5.2.3 / §5.3）════════
  //
  // 「复盘时给每个失误**打标签** → 统计玩家最常犯哪一类 → 『下一个目标』条直接推那一课。
  //   **自适应课程，零手写内容。**」

  /** 四类失误标签。⚠ 与课程 `concept` 的映射写在 LESSON_OF_TAG（⛔ 别在 UI 里再写一份）。 */
  const TAGS = Object.freeze(['under', 'missFork', 'offCenter', 'parity']);
  /** 每类失误推哪一课（§5.2.3）。 */
  const LESSON_OF_TAG = Object.freeze({
    under: 5,       // ⭐ 走在对方威胁正下方 —— 新手最致命
    missFork: 9,    // 漏挡对方的双威胁
    offCenter: 4,   // 弃中路
    parity: 10      // 奇偶性
  });

  /**
   * ⭐ 给一次失误打标签。**纯函数**（盘面信息由调用方用零搜索判据算好传进来）。
   * @param sa  落子前的 scoreAll
   * @param col 实际落的列
   * @param ctx { underCols, antiforkCols, n }
   * @returns 标签字符串，或 null（这一手没失误 / 认不出类型）
   * ⚠ 只给**真的掉了档**的手打标签（label 是 slip/loss）——
   *   ⛔ 别给「次优但没掉档」打标签：那会让「我的弱点」页统计出一堆根本不是错的东西。
   */
  function tagOf(sa, col, ctx) {
    let label;
    try { label = RV.labelOf(sa, col); } catch (e) { return null; }
    if (label !== 'slip' && label !== 'loss') return null;
    const c = ctx || {};
    // ⚠ 判定顺序 = 严重性顺序（一手可能同时命中好几类，取最该教的那一条）
    if (c.underCols && c.underCols.indexOf(col) >= 0) return 'under';
    if (c.antiforkCols && c.antiforkCols.length && c.antiforkCols.indexOf(col) < 0) return 'missFork';
    if (col !== 3 && RV.safeCols(sa).indexOf(3) >= 0) return 'offCenter';
    return 'parity';    // ⚠ 兜底：说不清类型的掉档都算「深层理论没学」——⛔ 别丢掉（丢了统计就漏）
  }

  /**
   * ⭐ 「我的弱点」：把标签计数摊出来，最常犯的排第一。
   * @param counts { tag: n }
   * @returns [{ tag, n, lesson }]（降序；⛔ 计数为 0 的不返回）
   */
  function weakness(counts) {
    const out = [];
    for (const t of TAGS) {
      const n = (counts && counts[t]) | 0;
      if (n > 0) out.push({ tag: t, n: n, lesson: LESSON_OF_TAG[t] });
    }
    out.sort((a, b) => b.n - a.n || a.lesson - b.lesson);
    return out;
  }

  /** ⭐ 「下一个目标」推哪一课：最常犯的那类；⚠ 一次失误都没有 ⇒ 推**第一课没做完的**。 */
  function nextLesson(counts, doneIds) {
    const w = weakness(counts);
    const done = doneIds || [];
    if (w.length && done.indexOf(w[0].lesson) < 0) return w[0].lesson;
    for (const L of LESSONS) if (done.indexOf(L.id) < 0) return L.id;
    return w.length ? w[0].lesson : LESSONS[0].id;   // 全做完了 ⇒ 回去练最弱的那一课
  }

  const API = {
    LESSONS, CHAPTERS, CONCEPTS, TAGS, LESSON_OF_TAG,
    lessonOf, matches, judge, tagOf, weakness, nextLesson
  };
  // 与其余模块同样冻结（`C4Lessons.judge = () => ({ok:true})` 会让课程永远判对，画面正常）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Lessons = API;
})(typeof self !== 'undefined' ? self : this);
