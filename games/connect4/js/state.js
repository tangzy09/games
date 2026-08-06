// ════════════════════════════════════════
// state.js —— 对局状态 `G` 的形状 + 存档 / 撤销 / 复盘的**唯一入口**（DESIGN §9.3）。
//
// ⭐ 核心决定（已定稿，⛔ 别改）：**存「先后手 + 手数列表」，不存局面快照栈。**
//    一个决定同时白送四样：
//      · 撤销      = 重放到 n−1
//      · 中断恢复  = 存 42 个个位数（⚠ **实测整局 ≤241 字节**，上界取在 seed 最长时；
//                    手数列表本体 89 字节，其余全是元数据键名。快照栈是几十 KB ——
//                    量级差三个数量级，但「几十字节」只对手数列表本身成立，别再复制那个数。
//                    ⚠ 这个数由 tests/test-state.js 现场量并断言，⛔ 改了这里就去对一遍。
//                    ⚠ P2c T1 从 195 涨到 204、T2 再到 217（`"kids":false,` = 13 字节）：让子的 `pre` 字段（`"pre":[2,4],` = 12 字节，
//                      让 0 子时 `"pre":[],` = 9 字节）；**T5 再到 241**（`"timed":false,` = 14 +
//                      `"auto":[],` = 10 字节；⚠ 限时局里 auto 每记一手再 +2 左右，一局最多 21 手 ⇒
//                      真实上界还要高一点，但仍是「几百字节」这个量级）。**DESIGN §9.3 里那个 195 已过期。**）
//      · 「从第 N 步重来」= rewindTo(g, N)（DESIGN §3.3 复盘那颗按钮）
//      · 一条 URL 分享整局（§11 异步对弈直接开）
//    ⚠ 代价只有一个，而且是**故意收下**的：**手搓的局面不可撤销**（没有手数列表 ⇒ 重放不出来）。
//      solitaire 在测试里踩过这条，这里提前写死在文档里：任何「调试用直接摆一个局面」的入口
//      都不许绕过 moves 进来。
//
// ⭐ 盘面**永远由 moves 现算**（boardOf），⛔ 不缓存。42 手以内成本可忽略，
//    而缓存会和撤销打架——那正是快照栈方案的病：撤销之后拿到上一手的盘，零报错。
//
// ⭐ 两侧纪律相反，是**故意的**，别为了「一致」把哪边改掉：
//    · newGame / play / rewindTo 的调用方是**我们自己的 UI** ⇒ 非法入参 = 程序 bug ⇒ **当场抛**。
//      （与 B.play、AI.checkTier 同源：静默兜底会让「命中区算错」「AI 其实一直按第 1 级走」
//       这类事零报错地活下去。UI 想先问一句用 canPlay，它永远只回 true/false。）
//    · deserialize 的输入来自 **localStorage / 分享 URL**（外部、不可信、可能是上个版本的）
//      ⇒ **只返回 null，绝不抛**，⛔ 且绝不迁移（root 铁律：老档「恢复」成畸形状态
//        = 无报错白屏，而新档案的 E2E 测不出来）。
//
// ⚠ 改 G 的形状必须 bump SAVE_VERSION；改任何 js/css 必须 bump index.html 的 ?v=N（root 铁律）。
// ════════════════════════════════════════
(function (root) {
  const inNode = (typeof module !== 'undefined' && module.exports);
  const B = inNode ? require('./bitboard.js') : root.Bitboard;
  const R = inNode ? require('./rules-classic.js') : root.RulesClassic;
  // ⚠ 只为 paramsDigest() 一个用途（DESIGN §11b 第 4 条）。ai.js 在 <script> 顺序里必须排在前面。
  const AI = inNode ? require('./ai.js') : root.ConnectAI;

  /** ⚠ G 的形状一变就 bump（老存档直接丢弃，⛔ 不迁移）。
   *  · v1 = P2a（先后手 + 手数列表）
   *  · v2 = P2c Task 1：加了让子字段 `pre`（DESIGN §6.7）。⚠ v1 的存档一律丢弃 —— 少了 pre
   *    的老档若被「宽容地」读成 `pre: []`，让子局会**静默变成普通局**，玩家眼里是「我的让子没了」。
   *  · v3 = P2c Task 2：加了儿童档字段 `kids`（DESIGN §6.7）。⚠ 同上，v2 的档一律丢弃 ——
   *    少了 kids 的老档若被读成 `false`，一局儿童档会**静默变成普通第 1 级局**（先手规则跟着
   *    反过来、文案变回「第 1 级」），而盘面看起来完全正常。
   *  · v4 = P2c Task 5：加了限时字段 `timed` + 时钟代落手的 ply 列表 `auto`（DESIGN §6.10）。
   *    ⚠ v3 的档一律丢弃：少了 `timed` 的老档若被宽容读成 `false`，一局限时局读回来会
   *    **静默变成普通局**（表不见了）；反过来，`auto` 缺失会让 §4 的精准度纪录**把一局
   *    限时局当成正常局收进去** —— 而 §6.10 白纸黑字要求「限时局不计入精准度纪录」。 */
  const SAVE_VERSION = 4;

  /** 对局模式的**闭集**。⛔ 别在别处写 `'ai'` 字面量比较——跨模块比字符串、没有单一来源，
   *  正是 P1 终审点名的那个活口（`=== 'load'` 静默恒假）。 */
  const MODES = Object.freeze(['human', 'ai']);

  // ════════ ⭐⭐ 让子（DESIGN §6.7）════════
  //
  // 「⭐ **让子**：弱的一方可**预置 1-2 枚子**在盘上（经典棋类的成熟做法）。家长 vs 孩子终于能
  //   打得有来有回 —— **这是让全家人一起玩下去的唯一办法**。」
  //
  // ⭐ **存的是「格子」（`pre` = 列号数组），不是「让几子」这个档位号。**
  //   档位 → 格子的映射表（下面的 HANDICAP_COLS）是**产品数值**，将来一定会按实测再调；
  //   存档里若只存档位号，同一份存档在新旧代码里会摆出**不同的盘**，而且零报错 ——
  //   与 §9.3「存手数不存快照」是同一条判据：**存那个不会被重新解释的东西。**
  //
  // ⭐ **预置子不是「手数」**：
  //   · 它不进 `moves` ⇒ 撤销（= 重放到 n−1）**在结构上撤不掉它**，`rewindTo(g,0)` 回到的是
  //     「只有预置子」的盘而不是空盘。⛔ 这条不许靠 UI 去防（漏一次就是「孩子的让子被撤没了」）。
  //   · 它也不进 `boardOf` 返回盘的 `mv` ⇒ **`B.toMoves(boardOf(g))` 恒等于 `g.moves`**。
  //     ⚠ 代价如实写在这：**让子局的盘面无法只由手数列表重建**（`B.fromMoves(g.moves)` 会少两枚子）。
  //     ⛔ 所以凡是「只拿 moves 重放」的下游都必须一起改：threats.missedWin 已加 startBd 入参，
  //       传给引擎的 position 已经从手数列表改成**盘面对象**（ai.js 的 toBoard 两种都收）。
  //
  // ⭐ **谁先走：让子局里「强的一方」先手**（弱方既拿预置子又先走 = 双重优势）。
  //   ⚠ 但 §1.1 第 1 条「顶档必须玩家先手」**优先级更高**，写在 newGame 的最后一行覆盖回来 ——
  //     后手对完美求解器是**数学上的必败**，那是硬约束，⛔ 不许被让子这条产品规则推翻。
  //   ⚠ 让子局里**先手不再逐局交替**：让子本身已经是明面的不对称，再交替等于每两局把
  //     「谁是弱方」翻一次。
  //
  // ⚠⚠ **奇偶性（DESIGN §5.1 第 10 课）会被动到，如实记在这里**：
  //   奇偶理论建立在「42 格、先手走第 1,3,…,41 手」上。预置 k 枚子之后剩 42−k 格 ⇒
  //     · **k 为奇数（让 1 子）⇒ 全局奇偶整个翻过来**：奇/偶威胁的归属对调。无法回避，这是
  //       「多一枚子」这件事本身的算术后果，⛔ 别试图用规则去「修正」它（那只会变成第三套规则）。
  //     · **k 为偶数（让 2 子）⇒ 全局奇偶恢复**，只剩「预置子所在的列被顶高了几行」这一层扰动。
  //   ⇒ 两条纪律：① **课程（§5）与精准度纪录（§4）一律只在让 0 子的标准局里**（同 §6.10
  //     限时局不计入精准度的先例）—— 这是把奇偶性的冲击**围起来**的办法，比试图「修正」它诚实；
  //     ② 让 2 子的两枚**摆在同一列**（[3,3]），⇒ 那一列上移 **2** 行 ⇒ 连该列的奇/偶行归属
  //     都不变 —— 这是唯一「几乎不动奇偶理论」的让 2 子摆法，理由与实测见 HANDICAP_COLS。
  //
  // ⚠⚠ **让子只对「不调求解器」的档位开放**（轻松档 1-5 与同机双人），这是**技术硬约束**不是偏好：
  //   开局库（§9.2）里存的全是从空盘交替走出来的局面，而让子局面的两方子数**恒不相等**
  //   ⇒ **库必然 100% 落空** ⇒ 求解器档在 n≤9 那一段每手要 4-5 秒到几十分钟（§9.2 的断崖）。
  //   ⛔ 放开它不是「慢一点」，是「点下去之后页面看起来死了」。
  const HANDICAP_MAX = 2;

  /**
   * ⭐ 档位 → 预置子摆哪几列（都摆在该列当时的落点，即从底往上叠）。**产品数值**。
   *   · 让 1 子 = **中列底**：全盘最强的一格（中列参与 13 条四连线、边列只有 3 条），
   *     也正好是「先手把第一子下在中列 ⇒ 先手必胜」那条定理里的那一格（§1.1）。
   *   · 让 2 子 = **中列底再叠一枚**（同一列）。⭐ **让 2 子 = 让 1 子再加一枚**，
   *     一句话就能对孩子讲清楚，画面上也只是中间那一摞高了一格。
   *
   * ⭐⭐ **这张表是量出来的，不是想出来的**（`npm run sim:c4:handicap`，20,000 局/格 ·
   *   参考玩家[basic] vs 第 5 级 · 得分率）：
   *     让 0 子(AI 先手) .451 │ 让 1 子[3] **.661** │ [2,4] .629 │ [3,0] .712 │
   *     **[3,3] .775** │ [3,2] .839 │ [3,4] .838
   *   ⚠⚠ 两条结论都和动手前的直觉相反，⛔ 别再改回去：
   *   ① **让 2 子必须含中列底**。第一版写的是「中列两侧 [2,4]、⛔ 不叠中列」，理由是「叠中列
   *      = 现成的竖向二连 × 全盘最强的一列 ⇒ 强得离谱」。**实测把它证伪了**：[2,4] 把中列底
   *      让给了强方，于是第 5 级上 **让 2 子（.629）反而不如让 1 子（.661）** —— 一个
   *      「越让越弱」的档位，是这条功能最坏的失败模式，而且盘上确实多了两枚子，肉眼看不出来。
   *   ② **叠中列并不「强得离谱」**：[3,3]=.775 反而是含中列诸方案里**最弱**的一个
   *      （[3,2]/[3,4] 到 .839）—— 第二枚叠在自己已经占住的列上，边际收益本来就小。
   *
   *   ⭐ 在 [3,3] / [3,2] / [3,4] 三个都合格的方案里选 [3,3]，理由是**奇偶性**与**对称性**：
   *     · 奇偶性（§5.1 第 10 课）：两枚同列 ⇒ 那一列整体上移 **2** 行 ⇒ **该列的奇/偶行归属不变**，
   *       且总子数为偶 ⇒ 全局奇偶也不变。⭐ **[3,3] 是唯一「几乎不动奇偶理论」的让 2 子方案**；
   *       [3,2] 会把两列各上移 1 行，两列的奇/偶威胁归属**同时对调**。
   *     · 对称性：[3,2] 与 [3,4] 实测等价（.839 / .838，差在噪声里），二选一是**任意的左右偏向**——
   *       在一个左右对称的棋盘上，让子摆得偏一边会被读成 bug。
   *     · 量程：.775 已经是「弱方明显占上风」，⛔ 不必再往 .84 顶（那是把让 2 子做成必胜的方向）。
   *
   *   ⚠ 改这张表**不必** bump SAVE_VERSION（存档存的是格子不是档位），但**必须重跑
   *     `npm run sim:c4:handicap`**（两把尺子都跑）并把上面这组数字一起更新。
   */
  const HANDICAP_COLS = Object.freeze([
    Object.freeze([]),          // 0 子
    Object.freeze([3]),         // 1 子：中列底
    Object.freeze([3, 3])       // 2 子：中列底叠两枚（= 让 1 子再加一枚）
  ]);

  /** ⭐ 这个（模式, 档位）组合许不许让子。**纯函数**，UI 与 newGame 读同一个判据。
   *  ⛔ 别在 UI 里再写一份 `tier < 6`：两份判据漂了就会出现「界面上选得动、开局当场抛」。 */
  function handicapAllowed(mode, tier) {
    if (mode === 'human') return true;
    // 求解器档（6-20）⇒ 库必落空 ⇒ 断崖。理由全文见上面那段 ⚠⚠。
    return Number.isInteger(tier) && tier >= 1 && tier < AI.SOLVER_FROM;
  }

  /**
   * ⭐ 把预置子摆到盘上。**纯函数**（⛔ 不改入参：内部先 clone）。
   * @param owner 这些子归谁（0 = 先手位 / 1 = 后手位）
   * @returns 新盘，且 **turn 恒为 0**（预置子不算手数 ⇒ 行棋权在先手方）、**mv 清空**
   *   （预置子不进手数列表，见上面那段 ⭐）。
   * ⚠ 摆法：借 B.play 落子（重力、满列、非法列的守卫全在它那儿，⛔ 别在这里写第二份），
   *   每落一枚之前把 turn 摆成 owner —— B.play 是纯函数、每次都 clone，所以改的永远是本函数
   *   自己刚拿到的那个盘。
   */
  function placeHandicap(bd, pre, owner) {
    let out = B.clone(bd);
    for (const c of pre) {
      out.turn = owner;
      out = B.play(out, c);
    }
    out.turn = 0;
    if (out.mv) out.mv.length = 0;
    return out;
  }

  /** 这一局让了几子（0..HANDICAP_MAX）。⭐ 单一真值是 `g.pre` 的长度，⛔ 别再存一个计数。 */
  function handicapOf(g) { return (g && g.pre) ? g.pre.length : 0; }

  // ════════ ⭐⭐ 儿童档（DESIGN §6.7，P2c Task 2）════════
  //
  // 「**儿童档**：AI 明显放水、不说难懂的话、赢了大撒花、更大的字与按钮。」
  //
  // ⭐ ─── 产品决定 ①：它是**独立开关**，⛔ 不是「阶梯往下延一格」的第 0 级 ───
  //   三条理由，按分量排：
  //   1. **儿童档要改的不只是棋力。** 阶梯是一条**一维强弱轴**（第 N 级 = 一个失误率），
  //      而儿童档同时要改：先手规则、文案、结算的庆祝、字号与按钮。把这些挂到「一格」上，
  //      「第 3 级」和「第 0 级」就不再是同一类东西 —— 那条阶梯从此说不清自己是什么。
  //   2. **「第 0 级」这个数在界面上没法说。** 要么写 0（玩家读成「没有难度」），
  //      要么写「儿童」——写「儿童」的那一刻它本来就不是一格了，是一个模式。
  //   3. ⛔ **技术上它会撞公平门禁**：`AI.TIER_MIN === 1`，而 tests/test-ai-determinism.js
  //      **逐字断言 `tier=0` 必须抛「非法难度级别」**。延一格要动 ai.js 的接线（TIER_MIN /
  //      checkTier / 两张参数表的下标基准）**并且改掉那条公平门禁本身** —— 为了一个 UI 入口
  //      去松公平承诺的守卫，代价与收益完全不成比例。
  //   ⇒ 儿童档 = 一组**明面预设**：一个**轻松档的级别** + 让子 + 下面这条先手规则 + UI 侧的
  //     文案/庆祝/字号。⚠ 具体是哪一级**是量出来的**，见 KIDS_TIER 下方那张表。
  //
  // ⭐ ─── 产品决定 ②：**选了儿童档就不再选难度** ───
  //   给 4-5 岁孩子的家长再摆一排 20 级是噪音；而「儿童档 + 第 12 级」这个组合本身也自相矛盾。
  //   ⇒ `KIDS_TIER` 是**硬绑定**（newGame 收到别的 tier 当场抛，⛔ 不静默改写）。
  //   ⇒ 界面上它是「对手」那一排的**第四个入口**（儿童 / 轻松 / 进阶 / 完美）——
  //     ⛔ 不是另开一行开关：玩家找「对手有多强」只会看那一排，多开一行等于藏起来。
  //
  // ⭐ ─── 儿童档自己的「放水」旋钮：**孩子恒先手** ───
  //   四子棋**先手必胜**（Allis 1988，§1.1）—— 「你永远先走」是这个游戏里能给出的**最大**的
  //   一个让步，而且一句话就能对孩子讲清楚。
  //   ⚠⚠ **它的优先级高于 T1 那条「让子局强方先手」**：让子局本来把先手判给强方（弱方既拿子
  //     又先走 = 双重优势），而儿童档**故意**要那个双重优势 —— DESIGN §6.7 把「最弱档 + 最大
  //     让子」明写成「给 4-5 岁孩子的角落」。⇒ newGame 里 kids 那一行排在 handicap 之后。
  //   ⚠ 但 §1.1 第 1 条（顶档必须玩家先手）仍排在最后、优先级最高；儿童档恒在轻松档，两条够不着。
  //
  // ⛔ ─── 它**不是**暗改（DDA 红线）───
  //   儿童档是玩家自己在 HOME 上点开的、写在界面上的一个入口，并且**存进这一局的存档**
  //   （所以复盘/分享说得出「这局是儿童档」）。`AI.aiMove(position, tier, seed)` 的签名
  //   一个字都没动 —— 儿童档改的是「用哪一级、谁先走、盘上先摆几枚」，
  //   ⛔ 不是「AI 在局中按孩子的表现调档」。
  //
  // ⚠ 儿童档只对**人机局**开放：双人局里没有 AI 可以放水，那一侧的产品答案是让子（T1）。

  // ════════ ⭐⭐ 儿童档的两个产品数值：**先定目标、再量出来的** ════════
  //
  // 口径：`npm run sim:c4:kids`（20,000 局/格 · seed 20260801 · 参数表指纹 da3c3d1d ·
  //       两把尺子 basic/solid）+ `tests/test-kids.js`（封堵率，纯随机基线，确定性）。
  //
  // ─── ① 目标，**写在校准之前**（⛔ 事后不许改成量出来的数）───
  //   儿童档开箱：**basic ≥ .93**，且**两把尺子都 < .99**、绝不 1.000。三条理由：
  //     · 第 1 级是 .889（每 9 局输 1 局）。儿童档面向的玩家**比 basic 弱得多** ——
  //       basic 会抓立即胜、会挡立即负，4-5 岁两样都不会 ⇒ 在 basic 上必须留出余量，
  //       孩子真实的体验才会是「几乎总是赢」。
  //     · ⛔ **绝不 1.000**（DESIGN §3.1 护栏②）：它必须仍然偶尔赢，否则孩子三局之内就会
  //       发现「这个对手不会赢」——那和「它在乱下」一样毁掉这局棋。
  //     · 上界取 .99 是因为 T1 已经把「第 1 级 + 让 2 子」的 solid .990 记成「我们敢做的最极端一格」。
  //
  // ─── ② ⭐⭐ 一个**当场被证伪**的直觉：儿童档 ≠ 「阶梯最弱的那一格」 ───
  //   动手前我把 KIDS_TIER 定成 **第 1 级**（「儿童档当然用最弱的一档」），
  //   `tests/test-kids.js` 的护栏②判据**当场把它打回来**（DESIGN §3.1：最低档也要「会挡」）：
  //     级别   blunder   **封堵率**（对方有当场赢点时不送头的比例）   = 纯随机的几倍
  //      1      .950        33.9%                                    **1.07×**  ← 与掷骰子无异
  //      2      .920        38.6%                                      1.22×
  //      3      .650      **56.3%**                                  **1.77×**
  //      4      .508        67.6%                                      2.13×
  //      5      .380        76.0%                                      2.39×
  //     （纯随机基线 31.7%，**精确算**不是采样；第 20 级同一批局面上是 100%，自证这个量没算错）
  //   ⇒ **第 1 级在「会不会挡」这件事上统计上就是个随机玩家**（+2.2 个百分点）。它没坏 ——
  //     「能连四就连」仍是 100%（纯随机只有 26.9%）—— 但一个 5 岁孩子盯着看的正是「它挡不挡我」。
  //   ⇒ ⭐ **结论反过来了：「更弱」不该靠「更笨」。** 让子与先手把优势**直接**交给孩子，
  //     AI 那一侧反而应该**更会挡**，它才像个在下棋的对手。
  //
  // ─── ③ 选择规则（在 ② 之后定，判据来自规格不是数字）───
  //   **在满足 ① 的全部配置里，选封堵率最高的那一个。**
  //   实测（参考玩家得分率，孩子恒先手）：
  //     配置                    basic    solid    封堵率
  //     第1级+让1子              .972     .989     33.9%
  //     第1级+让2子              .991 ⛔  .998 ⛔  33.9%   ← 越过 .99
  //     第2级+让1子              .948     .973     38.6%
  //     第2级+让2子              .983     .994 ⛔  38.6%   ← solid 越界
  //     **第3级+让2子**        **.954** **.978** **56.3%** ← ⭐ 定稿
  //     第4级+让2子              .926 ⛔  .960     67.6%   ← 够不着 .93
  //     第5级+让2子              .893 ⛔  .935     76.0%
  //   ⇒ **KIDS_TIER = 3、KIDS_HANDICAP = 2**：唯一同时满足两把尺子的目标区间、
  //     且封堵率最高（1.77× 随机）的一格。
  //   ⚠ 第 1 级锚点：basic **.889** / solid **.936** ⇒ 儿童档 **+.065 / +.042**，
  //     两把尺子上差值的 95% CI 都不跨 0（±.007 / ±.006）—— **确实比第 1 级更弱**。
  //   ⚠ 如实记一笔：**儿童档的 AI 恰好和「轻松」那个入口是同一级（第 3 级）。** 这是好事，
  //     一句话就讲得清：「对手和轻松档是同一个人，只是你多两颗子、还先走。」
  //   ⚠ 改这两个数必须重跑 `npm run sim:c4:kids`（两把尺子）+ `node tests/test-kids.js`，
  //     并把上面这三张表一起更新。
  const KIDS_TIER = 3;

  /**
   * ⭐ 打开儿童档时**顺手把让子推到至少这么多枚**（0..HANDICAP_MAX）。**产品数值**，来源见上。
   *
   * ⚠ 它是**预设不是锁**：那一下是一次真的 `C4Settings.set('handicap', …)`，家长事后按那一行
   *   还能改回 1 或 0（孩子长大了就是这么退下来的：让2 → 让1 → 让0 → 轻松档）。
   *   ⛔ 别做成「儿童档期间强制当 2 用」的影子覆盖 —— 那样界面上写着 0、开出来是 2，
   *   正是 §2.4 点名的那类静默降级（只是方向反过来）。
   */
  const KIDS_HANDICAP = 2;

  /** 这一局是不是儿童档。⭐ 单一真值是 `g.kids`，⛔ 别在 UI 里改读 C4Settings
   *  （设置是「下一局怎么开」，G 才是「这一局是什么」——一局打到一半家长翻了设置，
   *   靠设置去画的那些文案会当场跳，而这一局的规则并没有变）。 */
  function kidsOf(g) { return !!(g && g.kids); }

  // ════════ ⭐⭐ 限时模式（DESIGN §6.10，P2c Task 5）════════
  //
  // §6.10 全文：「每手 10 秒倒计时，超时随机落子（偏中路）。四子棋在时间压力下完全是另一个
  //   游戏，紧张感翻倍且一局压到 1 分钟内；实现成本近乎为零。
  //   ⚠ **绝不能是默认** —— 休闲玩家讨厌计时。⚠ 限时局**不计入精准度纪录**。」
  //
  // 本模块负责其中**规则**的那一半（表本身在 clock.js，停表判据在 main.js）：
  //   · `timed`  这一局是不是限时局 —— 与 kids 同一条纪律：**改规则的东西必须钉在 G 上**，
  //              ⛔ 不许「读设置现算」（一局打到一半有人翻了设置，这一局的规则并没有变）；
  //   · `auto`   哪几手是**时钟替他落的**（ply 下标）；
  //   · `timeoutMove(g)` 超时落哪一列 —— **纯函数**。
  //
  // ⭐⭐ ─── 判断③：超时手怎么做到「可重放」 ───
  //   `timeoutMove` 是 **(盘面, g.seed, g.moves.length)** 的纯函数：
  //     ⛔ 零 `Math.random`（本仓公平承诺，且 fx.js/state.js 的猜先那一节已经为同一条理由
  //        把随机源赶出去过一次）；
  //     ⛔⛔ **一行都不读时钟** —— 这是本条最容易做砸的地方：只要它掺进「当时表上还剩多少」
  //        「超时发生在墙钟第几毫秒」，重放（= 撤销、= 读档、= 分享 URL）就**再也复现不出来**，
  //        而落下去的那一手看起来完全合法 ⇒ 零报错。
  //   ⇒ 落完之后它在 `moves` 里就是**一个普通的列号**，与玩家自己落的一手在存档里逐位无差别
  //     ⇒ §9.3 那条「撤销 = 重放到 n−1」原样成立，⛔ 一行都不用改。
  //   ⚠ `auto` **不参与重建盘面**（重建只读 pre + moves），它只回答「这一手是谁落的」——
  //     §3.3 复盘要说得出「第 17 手是时钟落的，不是你」。归因是本作的资产（§2.3），
  //     ⛔ 别因为「盘面不需要它」就省掉。
  //
  // ⭐⭐⭐ ─── 我推翻了规格里的「超时**随机**落子」那半句（本 task 的第五个判断）───
  //   §6.10 写的是「超时随机落子（偏中路）」。**偏中路的伪随机保留，但加两道零搜索的护栏**：
  //     ① **有当场连四就连**；② **绝不主动送对方当场连四**（除非所有列都送）。
  //   理由：本作的差异化是「完美求解器 + 会讲道理的复盘 + **失败必须可归因**」（§2.3 / §3.3 / §4）。
  //   一个纯随机的代打专门制造两种最毒的差评 ——「它把我赢定的棋扔了」「它直接把棋送给对面」——
  //   而这两种**恰好零搜索就能挡掉**（≤7 + ≤49 次 `B.isWinningMove`，微秒级，与 threats.js 同源，
  //   ⛔ 绝不碰 Solver：§9.2 的断崖是每手 1.7 秒，而这是在倒计时归零那一瞬间要出结果的）。
  //   ⛔ 但**到此为止，绝不替玩家下好棋**：再往上走（比如调 AI 按玩家的档位代打）会让超时
  //     **没有代价**，计时器本身就失去意义。⇒ 停在「一手平庸但不自杀的棋」。
  //   ⚠ 归因照做：落完当场如实写「时间到 · 第 N 列由时钟落下」，并把 ply 记进 `auto`。
  //
  // ⭐ ─── 判断④：儿童档**不给**限时，且 ⛔ 不静默 ───
  //   4-5 岁读不懂倒计时；儿童档整套设计（让 2 子 + 恒先手 + 大撒花 + 不说难懂的话）就是
  //   「让他赢」，加一个会替他乱下的时钟正好反着来。⇒ 照 T1「让子在求解器档下」的先例：
  //   设置**存得住**（家长的选择不该被清掉）、HOME 那行如实写「儿童档不适用」、
  //   而 `newGame({kids:true, timed:true})` **当场抛**（⛔ 不静默改写成非限时局）。

  /** ⭐ 这一局是不是限时局。⭐ 单一真值是 `g.timed`（同 kidsOf 那条 ⚠）。 */
  function timedOf(g) { return !!(g && g.timed); }
  /** 这一局里由时钟代落的那些 ply（⛔ 只读，别改返回的数组）。 */
  function autoOf(g) { return (g && g.auto) ? g.auto.slice() : []; }
  /** 第 ply 手是不是时钟落的（§3.3 复盘的归因入口）。 */
  function isAutoPly(g, ply) { return !!(g && g.auto && g.auto.indexOf(ply) >= 0); }

  /** ⭐ 这个（儿童档）组合许不许限时。**纯函数**，UI 与 newGame 读同一个判据。
   *  ⛔ 别在 UI 里再写一份 `!kids`：两份判据漂了就会出现「界面上开得了、开局当场抛」
   *  （与 handicapAllowed 逐字同一条纪律）。 */
  function timedAllowed(kids) { return !kids; }

  /** ⭐ 超时落子的**中路权重**（DESIGN §6.10 的「偏中路」）。中列参与 13 条四连线、边列只有 3 条，
   *  这张表就是那个事实的粗略投影。⚠ **产品数值**，改它不必 bump SAVE_VERSION
   *  （存档存的是落下去的列号，⛔ 不是「按哪张表抽的」），但会改变同一份 seed 的重放结果 ——
   *  ⇒ 与 HANDICAP_COLS 同一条：改了就去把门禁里那几个期望列号一起重量。 */
  const TIMEOUT_W = Object.freeze([1, 2, 3, 4, 3, 2, 1]);

  /** ⭐ (seed, ply) → u32。**纯函数**（FNV/murmur 混合，与 autoSeed 同一套手法）。
   *  ⚠ 必须把 ply 混进去：只用 seed 的话同一局里每一次超时都落同一列（而且是同一列的
   *    第 1/2/3 枚），肉眼看着像 bug，且「偏中路」会退化成「恒中列」。 */
  function timeoutRand(seed, ply) {
    let h = (seed | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (ply | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /** 在一组列里按 TIMEOUT_W 加权挑一个。⚠ `cols` 的**顺序必须是确定的**（调用方一律来自
   *  `R.moves`，中路优先的固定序）—— 顺序一变，同一个 r 会挑出另一列。 */
  function pickWeighted(cols, r) {
    let total = 0;
    for (const c of cols) total += TIMEOUT_W[c];
    let x = r % total;
    for (const c of cols) { x -= TIMEOUT_W[c]; if (x < 0) return c; }
    return cols[cols.length - 1];   // 浮点/取模都不可能到这，留个不会静默返回 undefined 的兜底
  }

  /**
   * ⭐⭐ 倒计时归零时**落哪一列**。**纯函数**：同 (盘面, seed, 手数) 恒同一列。
   * ⛔ 不读时钟、⛔ 不用 Math.random、⛔ 不调求解器（理由全文见上面那段 ⭐⭐⭐）。
   * @throws 非限时局 / 已终局（都是程序 bug：调用方是我们自己的计时器）
   */
  function timeoutMove(g) {
    if (!timedOf(g)) throw new Error('timeoutMove：只有限时局才会有超时手（这一局 timed=false）');
    const bd = boardOf(g);
    if (R.terminal(bd) !== null) throw new Error('timeoutMove：这一局已终局，不该再有超时手');
    const legal = R.moves(bd);                        // ⚠ 中路优先的**固定序**，非终局 ⇒ 恒非空
    // ① ⭐ 有当场连四就连 —— ⛔ 系统绝不许替玩家把一局已经赢了的棋扔掉
    const win = legal.filter(c => B.isWinningMove(bd, c));
    let pool = win;
    if (!pool.length) {
      // ② ⭐ 绝不主动送对方当场连四（⚠ 全都送时退回全集：那种局面本来就已经输了，
      //    此时再挑三拣四只会让「护栏」变成一条恒不成立的死代码）
      const safe = legal.filter(c => {
        const nb = B.play(bd, c);
        return !R.moves(nb).some(d => B.isWinningMove(nb, d));
      });
      pool = safe.length ? safe : legal;
    }
    return pickWeighted(pool, timeoutRand(g.seed, g.moves.length));
  }

  // ════════ seed ════════
  // ⭐ 要求是**同一份存档重放出同一局**（AI 的随机性是 (position,tier,seed) 的纯函数），
  //    不是「每次开局都一样」——后者会让玩家连开三局撞上同一条 AI 线。
  // 所以：开局时生成一次、**存进存档**，之后一律从存档里读。
  // ⚠ 只用 Date.now() 会撞：同一毫秒里「再来一局」是最常见的操作（结算页连点）。
  //   ⇒ 进程内用单调计数器兜底，**同一进程内保证不重复**（不是「概率上很少重复」）。
  // ⛔ 不用 Math.random：本仓的公平承诺一路要求可复现，随机源越少越好；这里也确实不需要它。
  //
  // ⭐⭐ **存的是 i32（`| 0`），不是 u32** —— `ai.js` 的 checkSeed 白纸黑字要求：
  //    「存档里存的 seed 必须是**截断后**的这个值，否则『分享一条 URL 复盘整局』在两端算出的
  //      seed 一样、显示的 seed 不一样，看着像 bug」。
  //    ⚠ 确定性本来就不受影响（0xF0000001 与 -268435455 是同一条 PRNG 流），真正的坑是
  //      **同一局有两个 seed 数值在系统里流通**，而且是不是负数取决于本进程 _seedBase 的最高位
  //      ⇒ 表现为「时灵时不灵」，最难查的一类。⛔ 别反过来去动 ai.js（P1 已冻结）。
  const _seedBase = (function () {
    const t = Date.now();
    let h = 0x811c9dc5 | 0;
    const mix = v => { h = Math.imul(h ^ (v | 0), 0x01000193); };
    mix(t >>> 0); mix(Math.floor(t / 0x100000000));
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return h | 0;
  })();
  let _seedSeq = 0;
  function autoSeed() { return (_seedBase + (++_seedSeq)) | 0; }

  // ════════ 入参校验（一律抛错）════════
  /** seed 的值域 = `x | 0` 的值域（与 AI.checkSeed 逐位同一个数，见上）。 */
  function isI32(v) { return Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff; }
  function isCol(c) { return Number.isInteger(c) && c >= 0 && c < B.W; }

  /**
   * 开一局新的。
   * @param {{mode:'human'|'ai', tier?:number, gameNo:number, humanFirst?:boolean, seed?:number,
   *          handicap?:number}} opts
   *   · mode     'human' = 同机双人 / 'ai' = 人机
   *   · tier     mode==='ai' 时必给（1..AI.TIER_MAX）；'human' 局必须**不给**（给了 = 调用方搞混了）
   *   · gameNo   本轮的第几局，从 0 开始 —— ⭐ **交替先手全靠它**（DESIGN §1.1 第 2 条）
   *   · humanFirst 显式覆盖先后手。⭐ 给它是为了 DESIGN §1.1 第 1 条：顶档必须让玩家先手
   *                （后手对完美 AI 是数学上的必败），⛔ 别逼 UI 去谎报 gameNo。
   *   · seed     显式给 = 复现某一局（分享 URL / 测试夹具）；不给就生成一个并存下来。
   *   · handicap ⭐ 让子枚数 0..HANDICAP_MAX（DESIGN §6.7），默认 0。⚠ 求解器档（6-20）给了会**抛**
   *                —— 那不是偏好而是断崖（理由见 HANDICAP_COLS 上方那段 ⚠⚠），UI 先问 handicapAllowed。
   *   · kids     ⭐ 儿童档（DESIGN §6.7），默认 false。⚠ 只许 `mode==='ai'` 且 `tier===KIDS_TIER`，
   *                否则**当场抛**（⛔ 不静默改写成第 1 级：那会让「我选了进阶档」变成一局儿童局）。
   */
  function newGame(opts) {
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) {
      throw new Error('newGame：参数必须是 options 对象，收到 ' + String(opts));
    }
    const mode = opts.mode;
    if (MODES.indexOf(mode) < 0) throw new Error('newGame：未知 mode «' + String(mode) + '»，只许 ' + MODES.join(' / '));

    let tier = null;
    if (mode === 'ai') {
      tier = opts.tier;
      if (!Number.isInteger(tier) || tier < 1 || tier > AI.TIER_MAX) {
        throw new Error('newGame：ai 局的 tier 必须是 1..' + AI.TIER_MAX + ' 的整数，收到 ' + String(tier));
      }
    } else if (opts.tier !== undefined && opts.tier !== null) {
      // ⛔ 静默忽略会让「以为选了难度、其实是双人局」零报错地存在
      throw new Error('newGame：human 局不许带 tier（收到 ' + String(opts.tier) + '）');
    }

    const gameNo = opts.gameNo;
    if (!Number.isInteger(gameNo) || gameNo < 0) {
      throw new Error('newGame：gameNo 必须是 ≥0 的整数（交替先手靠它），收到 ' + String(gameNo));
    }

    let seed = opts.seed;
    if (seed === undefined) seed = autoSeed();
    else if (!isI32(seed)) throw new Error('newGame：seed 必须是有符号 32 位整数（与 AI.checkSeed 同值域），收到 ' + String(seed));

    // ⭐ 让子（DESIGN §6.7）。⚠ 校验必须排在 humanFirst 之前：先手规则要读它。
    let handicap = opts.handicap === undefined ? 0 : opts.handicap;
    if (!Number.isInteger(handicap) || handicap < 0 || handicap > HANDICAP_MAX) {
      throw new Error('newGame：handicap 必须是 0..' + HANDICAP_MAX + ' 的整数，收到 ' + String(opts.handicap));
    }
    if (handicap > 0 && !handicapAllowed(mode, tier)) {
      // ⛔ 静默降成 0 会让「我明明选了让 2 子」变成一局普通对局，零报错；而这是**技术硬约束**
      //   （开局库对让子局面 100% 落空 ⇒ §9.2 的断崖），UI 必须先问 handicapAllowed 再传。
      throw new Error('newGame：第 ' + tier + ' 级是求解器档，不许让子 —— 让子局面不在开局库里，'
        + '每手要几秒到几十分钟（DESIGN §9.2 的断崖）。让子只在同机双人与轻松档 1-'
        + (AI.SOLVER_FROM - 1) + ' 级开放。');
    }

    // ⭐ 儿童档（DESIGN §6.7）。⚠ 与 handicap 同理排在 humanFirst 之前：先手规则要读它。
    const kids = opts.kids === undefined ? false : opts.kids;
    if (typeof kids !== 'boolean') throw new Error('newGame：kids 必须是布尔值，收到 ' + String(opts.kids));
    if (kids) {
      // ⛔ 两条都当场抛，⛔ 绝不「顺手修正」：静默把 mode 改成 ai / 把 tier 改成 1，
      //   表现就是「我选了双人（或进阶档），开出来却是一局儿童局」——零报错。
      if (mode !== 'ai') {
        throw new Error('newGame：儿童档只对人机局开放（双人局里没有 AI 可以放水，那一侧的答案是让子）');
      }
      if (tier !== KIDS_TIER) {
        throw new Error('newGame：儿童档恒为第 ' + KIDS_TIER + ' 级（阶梯最弱的一格），收到 tier=' + tier
          + ' —— 选了儿童档就不再选难度（DESIGN §6.7）');
      }
    }

    // ⭐ 限时模式（DESIGN §6.10）。⚠ 与 kids / handicap 同一条纪律：**默认关**，非法组合当场抛。
    const timed = opts.timed === undefined ? false : opts.timed;
    if (typeof timed !== 'boolean') throw new Error('newGame：timed 必须是布尔值，收到 ' + String(opts.timed));
    if (timed && !timedAllowed(kids)) {
      // ⛔ 静默改成 false 会让「我明明开了限时」变成一局普通局；静默把 kids 关掉更糟
      //   （家长会发现儿童档自己没了）。⇒ 抛，UI 先问 timedAllowed（见 main.js 的 effTimed）。
      throw new Error('newGame：儿童档不许限时 —— 4-5 岁读不懂倒计时，而儿童档整套设计'
        + '（让子 + 恒先手 + 大撒花）就是为了让孩子赢，一个会替他乱下的时钟正好反着来（DESIGN §6.10 / §6.7）');
    }

    let humanFirst;
    if (opts.humanFirst === undefined) {
      humanFirst = gameNo % 2 === 0;
      // ⭐ 让子局：**强的一方先手**（弱方既拿预置子又先走 = 双重优势），且先手不再逐局交替。
      //    ⚠ 预置子恒归 humanPlayer 那个座位（= 人机局的玩家 / 双人局的 Player 1）⇒
      //      「弱方走后手」就等于 humanFirst = false。
      if (handicap > 0) humanFirst = false;
      // ⭐⭐ 儿童档：**孩子恒先手**（先手必胜是这个游戏的地基定理 ⇒ 这是能给出的最大让步），
      //    且同样不逐局交替。⚠⚠ 这一行**必须排在让子那条之后**：让子局本来把先手判给强方，
      //    而儿童档故意要「拿子 + 先走」这个双重优势 —— DESIGN §6.7 把「最弱档 + 最大让子」
      //    明写成「给 4-5 岁孩子的角落」。⛔ 顺序反了不会报错，只会让儿童档 + 让子时孩子后手，
      //    而那正好是这条功能最想避免的局面。
      if (kids) humanFirst = true;
      // ⭐ DESIGN §1.1 第 1 条：顶档是完美求解器，**后手是数学上的必败** ⇒ 交替先手在这一档必须让位，
      //    否则每两局就有一局是「凭定义赢不了」的差评制造机。
      //    ⛔ 别把这条留给 UI「记得传 humanFirst」——只写一处才守得住（漏传时零报错）。
      //    ⚠⚠ 这一行**必须留在最后**：它的优先级高于上面那条让子规则（顶档本来也不许让子，
      //      所以两条现在够不着彼此；⛔ 但顺序是承重的，将来放开顶档让子时它仍必须赢）。
      if (mode === 'ai' && tier === AI.TIER_MAX) humanFirst = true;
    }
    // ⚠ 显式传 false 仍然放行：读别人分享的「AI 先手」那一局要用（那是玩家自己选的，不是我们漏了）。
    else if (typeof opts.humanFirst !== 'boolean') throw new Error('newGame：humanFirst 必须是布尔值');
    else humanFirst = opts.humanFirst;

    return {
      v: SAVE_VERSION,
      mode,
      tier,                                  // ⚠ human 局是 **null 不是 undefined**：
                                             //   JSON.stringify 会静默吃掉 undefined 的键 ⇒ 往返后字段消失而不报错
      gameNo,
      humanFirst,
      seed,
      paramsHash: AI.paramsDigest().hash,    // DESIGN §11b 第 4 条：换过难度参数表，复盘要说得出来
      // ⭐ 让子的预置格（⛔ 存格子不存档位号，理由见文件上方那段 ⭐）。
      //   ⚠ 各代 G 共享同一个 pre 数组是**故意的**：它在一局之内永不变（moves 那条「每代新数组」
      //     的纪律是为撤销服务的，pre 没有那个问题；⛔ 别顺手也拷一份，那只会掩盖「谁改了 pre」
      //     这件本来就不该发生的事）。
      pre: HANDICAP_COLS[handicap].slice(),
      // ⭐ 儿童档是**这一局的属性**（⛔ 不是「读设置现算」）：设置是「下一局怎么开」，
      //   一局打到一半家长翻了设置，这一局的规则并没有跟着变（见 kidsOf 上方那段 ⚠）。
      kids: kids,
      // ⭐ 限时是**这一局的属性**（⛔ 不是「读设置现算」，同 kids 的理由）。
      timed: timed,
      // ⭐ 由时钟代落的那几手的 ply 下标（升序）。⚠ 它**不参与重建盘面** —— 盘面恒由
      //   pre + moves 现算；这个字段只回答「这一手是谁落的」（§3.3 复盘的归因、§4 精准度的排除）。
      auto: [],
      moves: []
    };
  }

  /**
   * ⭐ 由**时钟**落一子（超时）。= `play` + 把这一手的 ply 记进 `auto`。
   * ⚠ 列号由调用方从 `timeoutMove(g)` 拿（两件事拆开：一个是「落哪」，一个是「谁落的」，
   *   各自能被单独钉死）。
   * @throws 非限时局（程序 bug：只有限时局才有时钟）；其余非法入参由 play 抛。
   */
  function playAuto(g, col) {
    if (!timedOf(g)) throw new Error('playAuto：只有限时局才会有时钟代落的手');
    const ply = g.moves.length;
    const out = play(g, col);
    // ⚠ concat 而不是 push：与 moves 同一条纪律 —— 各代 G 之间不许共享这个数组
    //   （共享的话撤销会把「历史」那一份一起改掉，零报错）。
    out.auto = (g.auto || []).concat([ply]);
    return out;
  }

  /** ⭐ 由「预置子 + 手数列表」**现算**盘面。⛔ 绝不缓存（缓存会和撤销打架）。
   *  ⚠ 每次返回**全新对象**：调用方随便改都影响不到 G，也影响不到下一次调用。
   *  ⭐ **先摆预置子、再重放手数** —— 这个顺序就是「撤销撤不掉让子」那条保证本身：
   *    撤销只砍 moves，而 pre 每次都从头摆一遍。 */
  function boardOf(g) {
    let bd = placeHandicap(B.newBoard(), g.pre || [], humanPlayer(g));
    for (const c of g.moves) bd = B.play(bd, c);
    return bd;
  }

  /** 这一局是否已经结束（分出胜负或满盘和）。 */
  function isOver(g) { return R.terminal(boardOf(g)) !== null; }

  /** 现在轮到谁走（0 = 先手 / 1 = 后手）。 */
  function turnOf(g) { return g.moves.length % 2; }

  /** ⭐ 「humanFirst ↔ 玩家编号」这条绑定**只写在这一处**。
   *  散到 UI 各处就是错源（bitboard.js 头注释里 a↔0 的同一条教训）。 */
  function humanPlayer(g) { return g.humanFirst ? 0 : 1; }
  /** 现在是不是该人类走（'human' 局两边都是人 ⇒ 恒 true）。 */
  function isHumanTurn(g) { return g.mode === 'human' || turnOf(g) === humanPlayer(g); }

  /** UI 先问一句用的**不抛版本**：非法列 / 满列 / 已终局一律 false。 */
  function canPlay(g, col) {
    if (!isCol(col)) return false;
    const bd = boardOf(g);
    return R.terminal(bd) === null && B.canPlay(bd, col);
  }

  /**
   * 落一子 → 返回**新的** G（⛔ 纯函数，绝不就地改：撤销靠的正是「旧 G 还在」）。
   * ⚠ 非法列 / 满列 / 已终局一律**抛错**，理由见文件头。想先问就用 canPlay。
   */
  function play(g, col) {
    if (!isCol(col)) {
      throw new Error('play：非法列号，必须是 0..' + (B.W - 1) + ' 的整数，收到 ' + (typeof col) + ' ' + String(col));
    }
    const bd = boardOf(g);
    // ⛔ 终局之后再存进手数列表，会让**每一次重放**都走过终局线 ——
    //    复盘的胜负曲线、妙手判定、分享 URL 全跟着错，而且零报错。
    if (R.terminal(bd) !== null) throw new Error('play：这一局已终局，不许再落子（要继续请先 rewindTo / newGame）');
    if (!B.canPlay(bd, col)) throw new Error('play：列 ' + col + ' 已满');
    return Object.assign({}, g, { moves: g.moves.concat([col]) });
  }

  /**
   * ⭐ 回到「刚下完第 n 手」的状态 —— 复盘那颗［从这一步重来］按钮（DESIGN §3.3）。
   * ⚠ 只动 moves：seed / tier / gameNo / humanFirst / paramsHash 一个都不许变，
   *   否则重来之后 AI 走的是另一局。
   * ⚠ n 越界（滑杆走到头）**夹住**；n 不是整数（程序 bug）**抛错**。两者判据不同是故意的。
   */
  function rewindTo(g, n) {
    if (!Number.isInteger(n)) throw new Error('rewindTo：n 必须是整数，收到 ' + (typeof n) + ' ' + String(n));
    const k = Math.max(0, Math.min(g.moves.length, n));
    return Object.assign({}, g, {
      moves: g.moves.slice(0, k),
      // ⭐ 撤销/重来必须把**被砍掉那几手的归因**一起砍掉（P2c T5）。⛔ 少了这一行，
      //   撤销一手时钟落的子之后再自己下一手，那一手会**顶着别人的名字**：复盘会说
      //   「第 9 手是时钟落的」而它其实是玩家自己下的 —— 盘面完全正确、零报错。
      //   ⚠ 判据是 `p < k`（第 k 手起被砍掉；auto 存的是 0 起的 ply 下标）。
      auto: (g.auto || []).filter(p => p < k)
    });
  }

  /** ⭐ 撤销 = 重放到 n−1，**不是**弹快照栈。空局是 no-op（下界由 rewindTo 夹住）。 */
  function undo(g) { return rewindTo(g, g.moves.length - 1); }

  /** 存档里的 paramsHash 与当前明面参数表对不上？⇒ 复盘时如实说「这局是在另一套难度参数下下的」，
   *  ⛔ 绝不假装能逐手复现（DESIGN §11b 第 4 条）。 */
  function paramsChanged(g) { return g.paramsHash !== AI.paramsDigest().hash; }

  // ════════ 存档 ════════

  /** @returns JSON 字符串。⚠ 字段**逐个显式列出**：
   *  ① 挡住 UI 顺手挂在 G 上的临时字段渗进存档；
   *  ② 任何一个是 undefined 都会被 JSON.stringify 静默吃掉 ⇒ 由 tests 钉死「无 undefined 字段」。 */
  function serialize(g) {
    const s = JSON.stringify({
      v: SAVE_VERSION,
      mode: g.mode,
      tier: g.tier === undefined ? null : g.tier,
      gameNo: g.gameNo,
      humanFirst: g.humanFirst,
      seed: g.seed,
      paramsHash: g.paramsHash,
      pre: g.pre,          // ⚠ undefined 会被 JSON.stringify 静默吃掉 ⇒ 下面的自校验当场抓住
      kids: g.kids,        // ⚠ 同上（`kids: undefined` 会整键消失 ⇒ deserialize 拒收 ⇒ 自校验红）
      timed: g.timed,      // ⚠ 同上（P2c T5）
      auto: g.auto,        // ⚠ 同上
      moves: g.moves
    });
    // ⭐ 自校验：**存得进 ⇒ 必须读得回**。这是本文件那条纪律唯一漏掉对称的地方 ——
    //   newGame/play/rewindTo 对非法入参一律当场抛，而 serialize 曾对一个坏掉的 G 照写不误，
    //   deserialize 那头却一定拒收 ⇒ 玩家看到「已保存」，下次进来**存档没了，零报错**。
    //   ⚠ 成本实测 6.2 µs/次，每手存一次盘完全吃得下。
    if (deserialize(s) === null) throw new Error('serialize：这个 G 存得进读不回，形状已经坏了：' + s);
    return s;
  }

  /**
   * @returns G，或 **null = 这份存档丢弃**。⛔ 绝不抛、⛔ 绝不迁移。
   * ⚠ 调用方拿到 null 的正确反应是「当作没有存档，开新局」，不是「试着修一修」。
   */
  function deserialize(s) {
    let d;
    try { d = JSON.parse(s); } catch (e) { return null; }
    if (d === null || typeof d !== 'object' || Array.isArray(d)) return null;

    // ⛔ 版本不符 = 丢弃。老档「恢复」成畸形状态是**无报错白屏**，而新档案的 E2E 测不出来。
    if (d.v !== SAVE_VERSION) return null;

    if (MODES.indexOf(d.mode) < 0) return null;
    if (d.mode === 'ai') {
      if (!Number.isInteger(d.tier) || d.tier < 1 || d.tier > AI.TIER_MAX) return null;
    } else if (d.tier !== null) return null;   // ⚠ human 局的 tier 必须**在场且为 null**：
    //   serialize 永远写得出它（JSON 不会丢 null）⇒ 缺字段 = 这份档不是我们写的 ⇒ 丢弃。
    //   ⛔ 别放宽成「缺了也行」：那是本函数唯一一处「字段不在也放行」，与「丢弃不迁移」相抵。
    if (!Number.isInteger(d.gameNo) || d.gameNo < 0) return null;
    if (typeof d.humanFirst !== 'boolean') return null;
    if (!isI32(d.seed)) return null;
    if (typeof d.paramsHash !== 'string' || !d.paramsHash) return null;
    // ⭐ 让子的预置格。⚠ 与 tier 同一条纪律：**字段必须在场**（serialize 永远写得出它）——
    //   缺了就说明这份档不是我们写的 ⇒ 丢弃，⛔ 别宽容成「缺了当 []」（那会把一局让子局
    //   静默读成普通局，玩家眼里是「我的让子没了」）。
    // ⚠ 这里**只判长度与列号**，⛔ 不判「必须等于 HANDICAP_COLS 里的某一项」：
    //   那张表是产品数值、还会再调，把它写成存档的校验条件 = 调一次表就把所有老档判死。
    if (!Array.isArray(d.pre) || d.pre.length > HANDICAP_MAX) return null;
    for (const c of d.pre) if (!isCol(c)) return null;
    // ⭐ 儿童档。⚠ 与 tier / pre 同一条纪律：**字段必须在场且是布尔**（serialize 永远写得出它）。
    //   ⛔ 别宽容成「缺了当 false」——那会把一局儿童档静默读成普通第 1 级局（先手规则相反、
    //     文案变回「第 1 级」），而盘面看起来完全正常。
    if (typeof d.kids !== 'boolean') return null;
    // ⛔ 儿童档与 mode/tier 的绑定在这里也要成立，否则手改一份存档就能造出
    //   「儿童档 + 第 20 级」这种 newGame 明令抛错的 G，绕过唯一的构造入口。
    if (d.kids && (d.mode !== 'ai' || d.tier !== KIDS_TIER)) return null;
    // ⭐ 限时（P2c T5）。⚠ 与 tier / pre / kids 同一条纪律：**字段必须在场且是布尔** ——
    //   ⛔ 别宽容成「缺了当 false」：那会把一局限时局静默读成普通局（表不见了），
    //     更要命的是 §4 的精准度纪录会**把它当成一局正常棋收进去**，而 §6.10 明写不许。
    if (typeof d.timed !== 'boolean') return null;
    // ⛔ 「儿童档 + 限时」在 newGame 里是当场抛的 ⇒ 这里也必须拦，否则手改一份存档就能
    //   绕过唯一的构造入口造出一个 4-5 岁 + 10 秒倒计时的局（照 kids × mode/tier 的先例）。
    if (d.timed && !timedAllowed(d.kids)) return null;
    if (!Array.isArray(d.moves) || d.moves.length > B.CELLS) return null;
    // ⭐ 时钟代落手的 ply 列表。⚠ 三条各挡一种坏档，缺一条都会让归因静默说谎：
    //   ① 非限时局不许有 auto（那是「没有表的局里有一手是表落的」）；
    //   ② 下标必须落在 moves 之内（越界 = 指着一手不存在的棋说话）；
    //   ③ **严格递增** ⇒ 顺带挡掉重复（同一手被记两次，P3 统计会重复计数）。
    if (!Array.isArray(d.auto)) return null;
    if (!d.timed && d.auto.length) return null;
    for (let i = 0; i < d.auto.length; i++) {
      const p = d.auto[i];
      if (!Number.isInteger(p) || p < 0 || p >= d.moves.length) return null;
      if (i > 0 && p <= d.auto[i - 1]) return null;
    }
    // ⚠ 这一行是**故意的冗余**（变异实测：删掉它整份测试仍绿）—— 下面 B.play 的守卫已经能拦下
    //   每一种非法列号。留着是为了「意图写在字段校验里」+ 早退，⛔ 但别因此以为它是承重的：
    //   真正承重的是下面那个 try/catch（拆掉立刻红）。删这一行前先确认 B.play 的守卫还在。
    for (const c of d.moves) if (!isCol(c)) return null;

    // ⭐ 手数列表必须**真的能重放**：满列、以及「终局之后还有手」都要在这里被拦下。
    // ⚠ B.play 对非法着法会**抛**（P1 的守卫，故意的）—— 包住它，别让异常逃到 UI。
    // ⚠ 起点是**摆好预置子的盘**（⛔ 不是空盘）：让子局里「这串手数走不走得通」本来就要
    //   带着那两枚子算 —— 少了它，一份合法的让子存档会因为「列满/终局」的判断偏差被误杀或误收。
    //   ⚠ placeHandicap 也会抛（满列 / 非法列），一并包在同一个 try 里。
    try {
      let bd = placeHandicap(B.newBoard(), d.pre, humanPlayer(d));
      for (const c of d.moves) {
        if (R.terminal(bd) !== null) return null;   // 终局之后还有手 ⇒ 这份档是坏的
        bd = B.play(bd, c);
      }
    } catch (e) {
      return null;
    }

    return {
      v: SAVE_VERSION,
      mode: d.mode,
      tier: d.mode === 'ai' ? d.tier : null,
      gameNo: d.gameNo,
      humanFirst: d.humanFirst,
      seed: d.seed,
      paramsHash: d.paramsHash,
      pre: d.pre.slice(),         // ⚠ 同 moves：拷一份，别让解析出来的数组被外部句柄捏在手里
      kids: d.kids,
      timed: d.timed,
      auto: d.auto.slice(),       // ⚠ 同上
      moves: d.moves.slice()      // ⚠ 拷一份：别让解析出来的数组被外部句柄捏在手里
    };
  }

  const API = {
    SAVE_VERSION, MODES,
    // ⭐ 儿童档（DESIGN §6.7 · P2c Task 2）。KIDS_TIER 导出是为了 UI 与门禁读**同一个**绑定，
    //   ⛔ 别在 main.js 里再写一个 `tier: 1`（两份漂了就会出现「界面写儿童档、开的是别的级」）。
    KIDS_TIER, KIDS_HANDICAP, kidsOf,
    // ⭐ 让子（DESIGN §6.7）。HANDICAP_COLS 导出是为了 UI 画图例 + `tools/sim-handicap.js`
    //   量胜率时**摆的是同一批格子**（⛔ 别让模拟台自己抄一份，那就成了「量的不是产品」）。
    HANDICAP_MAX, HANDICAP_COLS, handicapAllowed, handicapOf, placeHandicap,
    // ⭐ 限时模式（DESIGN §6.10 · P2c Task 5）。TIMEOUT_W 导出是为了门禁读**同一张表**
    //   （⛔ 别让测试自己抄一份权重，那就成了「测的不是产品」）。
    TIMEOUT_W, timedOf, timedAllowed, autoOf, isAutoPly, timeoutMove, playAuto,
    newGame, play, canPlay, undo, rewindTo,
    boardOf, isOver, turnOf, humanPlayer, isHumanTurn,
    serialize, deserialize, paramsChanged
  };
  // 与 P1 五个模块同样冻结：挡住 `St.deserialize = () => ({...})` 这类把存档边界整个换掉的误用。
  // ⚠ 只冻结容器：里面除了 MODES（已单独冻结的短字符串数组，不在热路径）全是函数与数字。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4State = API;
})(typeof self !== 'undefined' ? self : this);
