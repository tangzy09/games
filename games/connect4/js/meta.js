// ════════════════════════════════════════
// meta.js —— 元游戏层：等级 / 双口径统计 / 成就 / 每日任务 / 「下一个目标」（P5 · DESIGN §7）。
//
// §7 抬头：「照 casual-game-meta 抄，全部已在三款上线产品验证」——**别重新发明，也别重新踩坑**。
//
// ⚠⚠ **合并回 main 时要迁移**：main 上已经有 `engine/meta.js`（等级/称号/XP 条的共享实现，
//   blockblast 2026-08-01 抽的），但**本分支是从更早的 main 分出来的、那个文件还不存在**。
//   ⇒ 这里的 `levelOf/titleKey/levelProgress` 是同一条曲线的第四份实现；
//     **合并之后应当删掉它们、改用 `engine/meta.js`**（⛔ 别留两份漂移的曲线）。
//
// ⛔ 本文件是**纯函数**：只吃「已经数好的计数器」，⛔ 不读存储、不碰 UI、不掷骰子
//   ⇒ 每一条口径都能在 node 里钉死（源码级检查在 test-meta.js）。
// ⛔⛔ 公平红线：本文件算出来的**任何东西都不许流进 AI 的决策** —— 代码里连
//   `ConnectAI` / `Solver` / `EngineClient` 这几个名字都不许出现（源码级检查在 test-meta.js ⑧）。
//   §3.1 那条 `aiMove(position, tier, seed)` 的承诺由跨进程指纹守着，而元游戏层是最容易
//   破它的地方（「这位玩家连输三局 ⇒ 悄悄放水」正是 casual-game-meta 骂了整节的 DDA）。
//   ⇒ 本文件只决定**界面上写什么**，⛔ 不决定盘上发生什么。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  // ════════ 等级 / 称号（六档，与另外三款同一条曲线）════════
  /** 每级所需 XP 的底与倍率（⚠ 与 snake/blockblast/solitaire 同参数，⛔ 别自己调）。 */
  const XP_BASE = 100, XP_RATIO = 1.35, MAX_LEVEL = 60;

  /** ⭐ XP → 等级（1 起）。**纯函数**。 */
  function levelOf(xp) {
    let lv = 1, need = XP_BASE, left = Math.max(0, xp | 0);
    while (lv < MAX_LEVEL && left >= need) { left -= need; lv++; need = Math.round(need * XP_RATIO); }
    return lv;
  }
  /** 等级 → 称号 locale key（六档 rank.t1..t6）。⚠ 文案在 locale，⛔ 本文件零硬编码。 */
  function titleKey(lv) {
    const t = lv >= 50 ? 6 : lv >= 35 ? 5 : lv >= 22 ? 4 : lv >= 12 ? 3 : lv >= 5 ? 2 : 1;
    return 'rank.t' + t;
  }
  /** { lv, cur, need, frac } —— XP 条画它。 */
  function levelProgress(xp) {
    let lv = 1, need = XP_BASE, left = Math.max(0, xp | 0);
    while (lv < MAX_LEVEL && left >= need) { left -= need; lv++; need = Math.round(need * XP_RATIO); }
    return { lv: lv, cur: left, need: need, frac: need > 0 ? Math.min(1, left / need) : 1 };
  }

  /**
   * ⭐ XP 由**既有计数器**折算（casual-game-meta 的老规矩：⛔ 别再存一个 xp 字段，
   * 那会和计数器漂移，且必须迁移存档）。
   * ⚠ 权重的意思：赢一局 > 打一局；**零提示赢**额外加（那才是拿去炫的口径，§7.8）；
   *   上完一课也给 —— 课程是留存的主力（§5）。
   */
  function xpOf(st) {
    const s = st || {};
    return (s.games | 0) * 4
         + (s.wins | 0) * 10
         + (s.winsNoHint | 0) * 15
         + (s.lessonsDone | 0) * 25
         + Math.round((s.bestAcc | 0) / 2);
  }

  // ════════ ⭐ 双口径统计（§7.8）════════
  // 「总胜率 + **零提示胜率**（后者才是拿去炫的）」

  /** @returns { games, wins, rate, noHintWins, noHintRate } —— ⚠ 没打过时 rate 是 **null**（⛔ 不是 0）。 */
  function stats(st) {
    const s = st || {};
    const g = s.games | 0, w = s.wins | 0, nw = s.winsNoHint | 0;
    return {
      games: g, wins: w, noHintWins: nw,
      // ⛔ 0 局时给 null 而不是 0%：「还没打过」与「一局没赢过」是两件事（§2.4 的同一条纪律）
      rate: g > 0 ? Math.round(w * 100 / g) : null,
      noHintRate: g > 0 ? Math.round(nw * 100 / g) : null
    };
  }

  // ════════ ⭐ 成就阶梯（§7.7）════════
  // ⚠ 每条成就 = 一个**既有计数器**过某个门槛 ⇒ ⛔ 零新存档、零新事件流。
  const ACHIEVEMENTS = Object.freeze([
    { id: 'play10', key: 'a.play10', stat: 'games', need: 10 },
    { id: 'play100', key: 'a.play100', stat: 'games', need: 100 },
    { id: 'win1', key: 'a.win1', stat: 'wins', need: 1 },
    { id: 'win25', key: 'a.win25', stat: 'wins', need: 25 },
    { id: 'clean5', key: 'a.clean5', stat: 'winsNoHint', need: 5 },     // ⭐ 零提示赢 5 局
    { id: 'acc80', key: 'a.acc80', stat: 'bestAcc', need: 80 },
    { id: 'acc95', key: 'a.acc95', stat: 'bestAcc', need: 95 },         // ⭐ 三档星级的 ★3 门槛
    { id: 'bril10', key: 'a.bril10', stat: 'brilliants', need: 10 },    // ✨ 妙手 10 次
    { id: 'lesson5', key: 'a.lesson5', stat: 'lessonsDone', need: 5 },
    { id: 'lesson16', key: 'a.lesson16', stat: 'lessonsDone', need: 16 }
  ]);

  /** @returns [{ id, key, got, cur, need }]（顺序 = 定义顺序，⇒ UI 稳定）。 */
  function achievements(st) {
    const s = st || {};
    return ACHIEVEMENTS.map(a => {
      const cur = s[a.stat] | 0;
      return { id: a.id, key: a.key, got: cur >= a.need, cur: cur, need: a.need };
    });
  }
  function achievedCount(st) { return achievements(st).filter(a => a.got).length; }

  // ════════ ⭐ 三档星级（§7.7）════════
  /**
   * ★1 赢 / ★2 零提示赢 / ★3 精准度 ≥95%。
   * @returns 0-3
   * ⚠ 是**阶梯**不是集合：没赢就是 0 星（⛔ 别给「输了但精准度 95%」发 ★3 —— 那与 ★ 的语义不符；
   *   §4 那条「输了也能创纪录」由**精准度新高**兑现，⛔ 不是靠星级）。
   */
  function starsOf(won, usedHint, acc) {
    if (!won) return 0;
    let s = 1;
    if (!usedHint) s = 2;
    if (!usedHint && typeof acc === 'number' && acc >= 95) s = 3;
    return s;
  }

  // ════════ ⭐ 每日任务（§7.4：dayNo 确定性生成、挂既有事件流、只做顺手量）════════
  const QUESTS = Object.freeze([
    { id: 'q_play3', key: 'q.play3', stat: 'games', need: 3 },
    { id: 'q_win1', key: 'q.win1', stat: 'wins', need: 1 },
    { id: 'q_bril1', key: 'q.bril1', stat: 'brilliants', need: 1 },
    { id: 'q_acc70', key: 'q.acc70', stat: 'dayBestAcc', need: 70 },
    { id: 'q_lesson1', key: 'q.lesson1', stat: 'lessonsDone', need: 1 },
    { id: 'q_nohint1', key: 'q.nohint1', stat: 'winsNoHint', need: 1 }
  ]);

  /**
   * ⭐ 今天的三个任务。**由 dayNo 确定性生成**（⇒ 零存档、全球同题、跨设备一致）。
   * ⛔ 别用 Math.random：那样刷新一次就换一批任务。
   */
  function questsOf(dayNo) {
    const d = dayNo | 0;
    const out = [];
    const used = {};
    // ⛔⛔ 必须用 Math.imul：`x * 1103515245` 的乘积约 2^62，**超过 float64 的 53 位尾数**
    //   ⇒ 结果被舍入成 2^8~2^10 的倍数 ⇒ **每一步之后 x 恒为偶数** ⇒ `x % 6` 只能得 0/2/4，
    //     六个任务里三个永远抽不到，而且实测**未来 60 天只有 1 种组合**（2026-08-07 抓到）。
    //   ⚠ 单测没抓到是因为它比的是**有序**列表：顺序会变而集合不变 ⇒ 加了集合级断言。
    let x = (Math.imul(d, 2654435761) ^ 0x9e3779b9) >>> 0;
    while (out.length < 3) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      const i = x % QUESTS.length;
      if (used[i]) continue;
      used[i] = 1;
      out.push(QUESTS[i]);
    }
    return out;
  }

  /** 今天这三个任务的进度。@param day 今天的计数器快照（⚠ 与 stats 的字段名同一套）。 */
  function questProgress(dayNo, day) {
    const d = day || {};
    return questsOf(dayNo).map(q => {
      const cur = Math.min(d[q.stat] | 0, q.need);
      return { id: q.id, key: q.key, cur: cur, need: q.need, done: cur >= q.need };
    });
  }

  /** ⭐ 今天是第几天（本地日期 → 整数）。⚠ 由调用方把 Date 传进来 ⇒ 本文件仍是纯函数。 */
  function dayNoOf(ms) {
    const d = new Date(ms);
    // 本地零点为界（⛔ 别用 UTC：玩家眼里的「今天」是本地的）
    return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
  }

  const API = {
    XP_BASE, XP_RATIO, MAX_LEVEL, ACHIEVEMENTS, QUESTS,
    levelOf, titleKey, levelProgress, xpOf,
    stats, achievements, achievedCount, starsOf,
    questsOf, questProgress, dayNoOf
  };
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Meta = API;
})(typeof self !== 'undefined' ? self : this);
