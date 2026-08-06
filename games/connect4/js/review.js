// ════════════════════════════════════════
// review.js —— 判分层（P3 Task 1 · DESIGN §4「精准度：这个游戏的分数」/ §3.3 复盘）。
//
// §4：「四子棋只有胜/负/和，没有分数——而元游戏层有一半（榜单/等级/连关/锦标赛）要分数。
//   **必须先有分数模型，否则半个元游戏层是空转的。**」
//   ⇒ 求解器给**每一手**打标签（最优/次优/失误/败招），一局算出 Accuracy %。
//
// ⛔⛔ 本文件是**纯函数**：只吃「已经算好的 scoreAll 结果」，
//   ⛔ 不认识 Solver、不认识 Worker、不读存储、不掷骰子。
//   理由不是洁癖 —— 判分口径是这个产品的**灵魂**（玩家看得见的那个数字），
//   它必须能在 node 里被逐条钉死；一旦它开始自己去取数据，就再也测不动了。
//   ⇒ tests/test-review.js §⑩ 做**源码级检查**（剥掉注释后不许出现 Solver/require/随机/存储）。
//
// ════════ ⭐⭐ 核心口径：判据是「胜负态」，⛔ 不是分差 ════════
//   solver.js 的分数约定（那里是唯一定义处）：
//       score > 0 ⇒ 必胜      score === 0 ⇒ 和      score < 0 ⇒ 必败
//       |score| 越大 ⇒ 分出胜负**越早**
//   ⇒ 只取 `sign` 归成三档，标签**只看这一手把胜负态从哪档带到哪档**：
//
//       best  最优  落在最高分的列里（**并列全算**）           100
//       good  次优  胜负态没变，只是赢得慢 / 输得慢             85
//       slip  失误  胜负态掉一档（必胜→和，或 和→必败）         40
//       loss  败招  胜负态掉两档（必胜→必败）                    0
//
//   ⭐ **为什么不按分差扣分**：`|score|` 差 1 只是「晚一子赢」，那不是错误；
//     而「必胜→和」哪怕分差只有 1，也是**把整局送掉了**。按分差扣分会把这两件事**判反**。
//     ⇒ test-review §③④ 是这条的一对反向对照（必败局面分差 10 不扣分 / 必胜局面分差 1 判 slip）。
//
//   ⭐⭐ **副产品，而且正是产品要的**：**必败局面里怎么走都不掉档 ⇒ 不扣分。**
//     你不该因为对手完美而被判失误 —— §4 那句「你输了，但这局精准度 91%，是你的新高」
//     能成立的全部前提就在这里。⛔ 谁要改成按分差扣分，先去读那一句。
//
//   ⚠ **视角**：`scoreAll(落子前的局面)` 是**当前行棋方**视角，而当前行棋方就是要落这一手的人
//     ⇒ 直接拿 `sa[实际落的列]` 与 `max(sa)` 比，两者同视角，⛔ 别取反。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  /** 胜负态三档（`sign(score)`）。⭐ 它们是**可比较的整数**，掉了几档 = 相减。 */
  const SIGN_WIN = 1, SIGN_DRAW = 0, SIGN_LOSS = -1;

  /** ⭐ 每个标签值多少分。**产品数值**，⛔ 别在别处再抄一份（门禁读的就是这一张，见 §⑨）。 */
  const SCORE_OF_LABEL = Object.freeze({ best: 100, good: 85, slip: 40, loss: 0 });

  /** 掉了几档 → 标签。⚠ 只有 0/1/2 三种可能（三档之间最多差 2）。 */
  const LABEL_OF_DROP = Object.freeze(['good', 'slip', 'loss']);

  function signOf(score) { return score > 0 ? SIGN_WIN : (score < 0 ? SIGN_LOSS : SIGN_DRAW); }

  /**
   * ⭐ 这一手的标签。**纯函数**。
   * @param sa  `Solver.scoreAll(落子前的局面)` 的结果 —— `{ [col]: score }`
   *            ⚠ JS 对象的键**是字符串**（solver.js 明写：`Object.keys` 拿到 '3' 不是 3）
   *            ⇒ 本函数内部一律 `Number()`，调用方不必自己转。
   * @param col 实际落的列
   * @returns 'best' | 'good' | 'slip' | 'loss'
   * @throws ⛔ sa 为空（终局局面的 scoreAll 返回 {}）/ col 不在 sa 里 —— 两者都是
   *         「这个问题不成立」，⛔ 绝不编一个标签出来（那是凭空造事实）。
   */
  function labelOf(sa, col) {
    if (!sa || typeof sa !== 'object') throw new Error('labelOf：scoreAll 结果必须是对象，收到 ' + String(sa));
    const cols = Object.keys(sa);
    if (!cols.length) {
      throw new Error('labelOf：scoreAll 是空的（终局局面）—— 终局上没有「这一手多好」这个问题，'
        + '调用方先自己查 R.terminal');
    }
    const got = sa[col];
    if (typeof got !== 'number' || !isFinite(got)) {
      throw new Error('labelOf：scoreAll 里没有第 ' + String(col) + ' 列（这一手不合法？）'
        + ' —— 合法列是 [' + cols.join(',') + ']');
    }
    let bestScore = -Infinity;
    for (const k of cols) { const v = sa[k]; if (v > bestScore) bestScore = v; }
    if (got === bestScore) return 'best';
    // ⭐ 掉了几档 —— 这是全文件唯一的判据。⛔ 不看 (bestScore - got) 的大小。
    const drop = signOf(bestScore) - signOf(got);
    // drop === 0 ⇒ 胜负态没变（只是赢得慢/输得慢）⇒ good
    return LABEL_OF_DROP[drop] || 'good';
  }

  /** 这条记录算不算进来（`side` / `skipPlies` 两个过滤器的唯一实现）。 */
  function picked(e, opts) {
    if (!e || typeof e.label !== 'string') return false;
    if (opts && opts.side !== undefined && opts.side !== null && e.side !== opts.side) return false;
    if (opts && opts.skipPlies && opts.skipPlies.indexOf(e.ply) >= 0) return false;
    return true;
  }

  /**
   * ⭐ 一局的精准度（0-100 的整数）。
   * @param labels [{ ply, side, label }]
   * @param opts.side      只统计这一方（⛔ 别把对手的手混进玩家的精准度）
   * @param opts.skipPlies 剔除这些 ply（⭐ 限时局里**时钟代落**的那几手走这条 —— 那不是玩家下的）
   * @returns 0-100，或 **null = 没有可统计的手**
   * ⛔⛔ 「没算过」必须是 `null`，**不是 0**：两者在 UI 上长得一模一样，而显示一个
   *   理直气壮的「精准度 0%」正是 §2.4 说的谎报真值。⇒ 渲染层必须显式处理 null。
   */
  function accuracyOf(labels, opts) {
    if (!labels || !labels.length) return null;
    let sum = 0, n = 0;
    for (const e of labels) {
      if (!picked(e, opts)) continue;
      const v = SCORE_OF_LABEL[e.label];
      if (v === undefined) continue;     // 不认识的标签：跳过而不是当 0（当 0 = 静默拉低玩家的分）
      sum += v; n++;
    }
    if (!n) return null;                 // ⛔ 一手都不剩 ⇒ null（见上面那段 ⛔⛔）
    return Math.round(sum / n);
  }

  /**
   * ⭐ 转折点 = **第一次**胜负态下滑的那一手。
   * @returns { ply, from, to } 或 null
   * ⚠⚠ 是「第一次」，⛔ 不是「掉得最狠的一次」：§3.3 那句话是
   *   「你到第 14 手为止一直是必胜的。第 14 手走了第 3 列——这一步之后变成必败。」
   *   它讲的是**故事的转折**。两者在同一局里经常不是同一手（test-review §⑦ 钉死）。
   * ⚠ 需要 labels 带上 `from`/`to`（这一手落之前/之后的胜负态）—— 由调用方在有 scoreAll
   *   的地方填，⛔ 本文件不去算（它没有局面）。
   */
  function turningPoint(labels, opts) {
    if (!labels || !labels.length) return null;
    for (const e of labels) {
      if (!picked(e, opts)) continue;
      if (typeof e.from !== 'number' || typeof e.to !== 'number') continue;
      if (e.to < e.from) return { ply: e.ply, from: e.from, to: e.to };
    }
    return null;
  }

  const API = {
    SIGN_WIN, SIGN_DRAW, SIGN_LOSS, SCORE_OF_LABEL,
    signOf, labelOf, accuracyOf, turningPoint
  };
  // 与其余模块同样冻结：挡住 `C4Review.labelOf = () => 'best'` 这类「精准度永远 100%」
  // 的误用 —— 画面正常、零报错，本仓最怕的失败模式。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Review = API;
})(typeof self !== 'undefined' ? self : this);
