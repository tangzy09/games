// ════════════════════════════════════════
// solver.js —— 完美求解器（negamax + alpha-beta）。**整个产品的心脏。**
// 诚实分档的 AI、会讲道理的提示、赛后复盘的「你第 14 手之后从必胜变必败」、课程的
// 自动出题与自动判分 —— 全部读这个文件的输出。⛔ 它静默算错，上面每一层都会**显得
// 工作正常**，而玩家被告知的每一句话都是假的。所以：宁可慢，绝不许「大概对」。
//
// ─────────── 这一版有什么（P1 Task 5，全部是**纯提速**，一个结果都没变）───────────
//   逐项收益都是「每个变体起独立进程、5 次取中位、看区间重不重叠」量的（DESIGN §9.1）：
//   1. **置换表**（49 位无损 key，见下面那一大段）                        单项 46×
//   2. **预判败招**（对手可落制胜点 ≥2 判负 / =1 强制堵 / 剪掉送头的列）  单项 1.32×
//   3. **根节点空窗二分**（exactScore）                                   单项 1.79×
//   4. **威胁数 move ordering**（落子后我方够得着的威胁格数降序）         单项 2.30×
//   5. **key 左右镜像归一** —— 只在镜像对称的根（开局/gen-book）上有收益，其余处零代价
//   6. 表从 2^21 加到 2^23 —— 只在上亿节点的搜索上有收益（见 TT_SIZE 那段的 ⚠⚠）
//   合计对同一批局面 **209×**（18 手档：80.3s → 384ms，区间不重叠）。
//   ⭐ 4,229 个局面（剩 1-28 手）的 score/best/scoreAll **逐位不变**（跨进程 SHA-256
//     digest 与改前完全相同）—— 提速不许改答案，一位都不许。改这个文件之后必须重跑对拍。
//
// ⚠ 被实测**证伪**、⛔ 别再加的（省下你的时间）：
//   · 把置换表的界拿去收窄 alpha/beta（不只当场截断）—— 区间重叠，且会让 alpha0 的语义
//     变模糊、EXACT/UPPER 判错就是往表里存**错的界**（静默给错答案），风险白担；
//   · 表里存「上次截断的着法」并在排序时插到最前 —— 14 手档 0.98×、10 手档 0.96×，
//     区间全重叠。威胁数排序已经把它该抓的都抓了。
// ⚠ 反过来，有一条差点被**错误地**证伪：表的大小在 10/14 手档上量不出任何差别（四种大小
//   区间全重叠），据此差点定成 12 MB —— 换成上亿节点的搜索再量，2^21→2^23 是实打实的
//   1.74× 节点。**量优化要在它该起作用的规模上量**，这是本轮最贵的一课，细节见 TT_SIZE。
//
// ─────────── ⭐ 分数约定（本文件是唯一定义处，别处一律引用这里）───────────
// 从**当前行棋方**视角：
//     score > 0 ⇒ 必胜        score === 0 ⇒ 和        score < 0 ⇒ 必败
//     |score| 越大 ⇒ 分出胜负越早（这条是赛后复盘「最快取胜 / 转折点」的全部依据）
// 锚点：**当场落子即赢 ⇒ score = CELLS - n**（n = 落子前的手数）。
// 等价的闭式：设分出胜负那一刻盘上共 nWin 子，则**胜方视角** score = CELLS + 1 - nWin，
//             负方视角取相反数。negamax 每层取反，绝对值沿路径不变 ⇒ 与节点自身的 n 无关。
//
// ─────────── ⭐ alpha-beta 的上界 max（写错不报错，只会悄悄剪掉正确答案）───────────
// 进入下面的循环前，我们**已经确认当前方不能当场取胜**（前一段的威胁格扫描全部落空）。
// 那么本方最早的取胜时刻是「我 → 对手 → 我」之后，即 nWin = n + 3：
//     40 - n = CELLS + 1 - (n + 3) = CELLS - 2 - n
// ⚠⚠ **但这还不是上界，必须再夹一次 `max(…, 0)`**，理由是「n+3 手」这个假设在盘快满
//    的时候不成立：
//      · n ≤ 39 ⇒ 40 - n ≥ 1 > 0，夹不夹一样；
//      · n = 40（剩 2 格）⇒ 公式给 0，恰好也对（我方已不可能赢，最好就是和）；
//      · n = 41（剩 1 格）⇒ 公式给 **-1**，可真值是 **0**：填掉最后一格就是和棋。
//    这一格之差不是小事：该节点会返回 -1（「我在最后一子上输」），**父节点取反后得到
//    +1，凭空长出一个「用最后一子取胜」的必胜**。实锤——本文件初版照裸公式写，
//    tests/test-solver.js 的大规模对拍第 11 个局面就抓到 `solver=1 / 参考=0`。
//    （Pons 的 C++ 参考实现用「半手」计分 `(CELLS+1-nWin)/2`，整数除法在 n=41 处
//     自动向 0 取整，所以那边看不到这个坑；本文件不halve，必须显式夹。）
// ⛔ 一般化的正确写法：`max(CELLS - 2 - n, 0)` —— 真分数只可能是「胜(≤40-n 且需 n≤39)
//    / 和(0) / 负(<0)」，取二者较大者必定不小于真值，永远不会剪掉正确答案。
// ⚠ 反过来，若把它写成比真值**小**的数（如 CELLS - 3 - n），αβ 会静默剪掉「三手取胜」
//   这个真答案；写成偏大的数（CELLS - n）则只是白剪、不影响正确性。
// ════════════════════════════════════════
(function (root) {
  const inNode = (typeof module !== 'undefined' && module.exports);
  const B = inNode ? require('./bitboard.js') : root.Bitboard;
  const R = inNode ? require('./rules-classic.js') : root.RulesClassic;

  // 严格大于任何可能出现的分数（最快的四连是 nWin=7 ⇒ |score| ≤ CELLS+1-7 = 36）。
  // 用有限整数而不是 ±Infinity：搜索窗全程留在 SMI，且 -INF 仍是精确整数。
  const INF = B.CELLS + 1;

  // 中路优先的列序，热路径专用的**不冻结**副本。
  // ⛔ 别在搜索里直接读 R.ORDER：那个是对外的**冻结**副本，而 Object.freeze 会把数组踢出
  //    V8 的 fast packed elements（DESIGN §9.1 实锤，rules-classic.js 里已为此付过一次学费）。
  //    这里 slice 出来的副本不冻结，本模块内部持有、绝不外泄，等价于 rules 层的 _ORDER。
  const ORDER = R.ORDER.slice();

  // 节点计数器。求解是**同步**递归、单线程、无 await ⇒ 模块级计数器不会被交错污染。
  // ⚠ 将来若把搜索改成可中断/分片的协程，这里必须改成显式传入的上下文对象。
  let _nodes = 0;

  // ════════ 置换表（P1 Task 5）════════
  //
  // ─── key：49 位，**一个 JS Number 无损装下，结构性无碰撞** ───
  // 每列编码成 7 位：`己方掩码 + 全体掩码 + 1`。因为重力保证「全体掩码 = (1<<h)-1」，
  // 这个值恒等于 **`己方掩码 + (1 << h)`** —— 即「一个哨兵位标出列高 h，其下 h 位标出
  // 哪些子是己方的」。于是 (h, 己方) 可逆地还原，对手 = 全体 ^ 己方；h 又给出总子数 n，
  // n 的奇偶给出 turn ⇒ **key ⟷ 完整局面（含轮走方）是双射**。
  //   值域：h ≤ 6 ⇒ 值 ≤ 63 + 64 = 127 < 128 ⇒ 7 位；7 列 × 7 位 = 49 位 < 53 位安全整数。
  // ⭐ 这不是哈希，是**编码** ⇒ 不需要 Zobrist、不存在「碰撞误判」这一整类静默错。
  //   实证（穷举验证，不是推理）：深度 ≤ 10 的全部 2,482,043 个去重局面，key 零碰撞，
  //   且每个 key 都能解回原局面；key ∈ [4.43e12, 5.42e14]，理论上界 128^7-1 = 5.63e14。
  //
  // ─── 表的形态：直接映射 + 商校验，**没有假阳性** ───
  // 槽位 idx = key % TT_SIZE；槽里存的不是 key 本身而是**商** q = (key-idx)/TT_SIZE。
  // 因为 key = q*TT_SIZE + idx，(idx, q) 与 key 一一对应 ⇒ 校验 q 相等就等于校验 key 相等，
  // 而 q < 5.63e14 / TT_SIZE 只要 ~28 位，塞得进 Int32Array（存 q+1，让 0 专表示空槽）。
  // ⛔ 别退化成「只存 key 的低 32 位」那种省内存写法：那才会有真正的碰撞误判，而误判在
  //    这个文件里的后果是**求解器悄悄给出错误结论**（DESIGN §2.2 的地面真值会红，但产品里
  //    的提示/复盘/精准度只会静默撒谎）。省 4 字节不值这个风险。
  //
  // ─── 值：Int16 里塞 (分数 << 2 | 界的类型) ───
  // 分数 ∈ [-42, 42] ⇒ 打包后 ∈ [-168, 171]，Int16 绰绰有余。
  // ⚠ **这里存的是绝对分数，不是「相对当前手数的偏移」**：本文件的分数约定（见文件头）本来
  //   就与节点自身的 n 无关（negamax 每层取反、绝对值沿路径不变）⇒ 一个局面的分数是它自己的
  //   纯函数。存偏移反而会引入一个「减完再加回来」的算术，溢出还是静默的。
  // 界的类型三种，缺一不可（**这正是上一轮把 negamax 改成完整 fail-soft 换来的信息**：
  //   低侧返回真实上界而不是入口 alpha，才能区分 EXACT 与 UPPER）：
  //   EXACT 精确值 / LOWER 真实值 ≥ v（fail-high）/ UPPER 真实值 ≤ v（fail-low）。
  //
  // ─── 替换策略：always-replace ───
  // 直接映射 + 无条件覆盖（Pons 的选择）。理由：本搜索是深度优先、同一子树内的重复访问
  // 高度局部化，新条目几乎总比旧条目更可能被再次用到；而「按深度优先保留」需要多存一个
  // 字节的 n 并在每次写入时比较，实测收益不抵开销（且会让表被浅层老条目占死）。
  //
  // ─── 大小：TT_SIZE = 8388593（2^23 附近的**素数**）───
  // 素数是关键：key 的低位分布远非均匀（低 7 位只编码第 0 列），`% 2^k` 会把大量局面挤进
  // 同一批槽；取素数取模后分布均匀。内存 = 8388593×(4+2) ≈ 50 MB。
  // ⚠⚠ **表大小的收益只在「工作集撑爆表」的搜索上才看得见——量小了会得出完全相反的结论。**
  //   本轮踩过：先在 10 手 / 14 手档（每次几十万到几百万节点）比 2^20/2^21/2^22/2^23，
  //   四者**区间全重叠**，差点据此定成 12 MB。换成一个 5,900 万节点的搜索（n=8 镜像对称局面）
  //   再比，差距立刻出来：
  //       2^21 (12 MB)  58,726,667 节点 / 18.4s
  //       2^22 (25 MB)  40,719,709 节点 / 12.2s   （节点 1.44×）
  //       2^23 (50 MB)  33,795,502 节点 / 11.7s   （节点 1.74×）
  //       2^25 (192 MB) 29,116,021 节点 /  9.9s   （节点 2.02×，内存翻四倍只换 1.16×）
  //   ⇒ 2^23 是拐点。⛔ 下次动这个常量前，**必须拿上亿节点的搜索去量**，别再拿浅档量。
  // ⚠ 运行时（Worker，只搜 n ≥ N 的中后盘）对大小**不敏感**（上面浅档的重叠就是证据）
  //   ⇒ 将来真遇到低端机内存压力，把它调小**不会改变任何答案**，只会让离线 gen-book 变慢。
  //   （但会改变 nodes ⇒ tests 的节点数上限门禁要跟着重新量。）
  const TT_SIZE = 8388593;
  // ⭐ **懒分配**：这 50 MB 只在真的搜索时才拿。solver.js 会被 index.html 直接引进主线程
  //   （DESIGN §9 的脚本顺序），而主线程可能一次搜索都不做（棋局在 Worker 里算）——
  //   在模块加载时就吃掉 50 MB 是白白给首屏加内存压力。
  let ttQ = null;      // Int32Array：0 = 空槽；否则 = 商 + 1
  let ttV = null;      // Int16Array：(score << 2) | flag
  const F_EXACT = 1, F_LOWER = 2, F_UPPER = 3;   // ⛔ 0 不用：0 是「空」的语义

  // ─── 清表：只清**真正写过**的槽 ───
  // solve/scoreAll 每次入口必须让表看起来是空的（见 analyze 里的 ⛔）。整表 fill(0) 是
  // 12 MB 的 memset ≈ 1ms —— 对一次几十毫秒的搜索无所谓，但 tests 里有上万次**微秒级**的
  // solve()，那样会给整份测试凭空加十几秒。所以记下写过的槽号，清的代价与搜索规模成正比。
  // 溢出（写过的不同槽超过 log 容量）时退化成整表 fill —— 能写满 50 万个槽的搜索本身
  // 已经是几百万节点，1ms 的 memset 可以忽略。
  const TT_LOG_CAP = 1 << 19;
  let ttLog = null;
  let ttLogN = 0, ttOverflow = false;

  // ⚠ ttOverflow 这条分支在 CI 里几乎不会触发（要一次搜索写满 50 万个不同的槽）。
  //   ⭐ 但它**即使写错也不会算错**：残留的表项仍然是「这个局面的真分数 ≥/≤/= v」这种
  //     与调用历史无关的**正确事实**，多留下来只会让 nodes 变小、打破「同局面两次解逐位
  //     相同」那条契约。所以这里的风险等级是「门禁读数漂移」，不是「求解器撒谎」——
  //     别因为它难覆盖就以为这里藏着正确性地雷。
  function ttReset() {
    if (ttQ === null) {                                  // 首次搜索才真正分配（见上面的 ⭐）
      ttQ = new Int32Array(TT_SIZE);
      ttV = new Int16Array(TT_SIZE);
      ttLog = new Int32Array(TT_LOG_CAP);
      // ⚠ 这两行必须在 return 之前：今天它们本来就是 0，但将来若加「内存紧张时释放大表
      //   （ttQ = null）」，回到这条分支时 ttLogN/ttOverflow 就是上一轮的脏值 —— log 里
      //   记的是**已经被释放的那张表**的槽号，拿去清新表就是清错位置（静默）。
      ttLogN = 0; ttOverflow = false;
      return;                                            // 新数组本来就是全 0，不用再清
    }
    if (ttOverflow) { ttQ.fill(0); ttOverflow = false; }
    else for (let i = 0; i < ttLogN; i++) ttQ[ttLog[i]] = 0;
    ttLogN = 0;
  }

  // ⭐ ─── 离线专用逃生门：跨局面复用整张表（Task 7 的 gen-book 专用）───
  // 默认**关**。关着时 analyze 每次清表，`nodes` 才是「只由局面决定」的确定量（tests 的
  // 节点数上限门禁、DESIGN §10 全押在这条上）。
  // ⛔ 打开它 nodes 就不再可比（读数随调用历史漂移）⇒ 任何门禁/预算都不许再读 nodes；
  //    tests 与 DESIGN §10 的节点数上限**必须**在关闭状态下跑。
  // ⭐ 复用本身是**无损**的，不是「近似加速」：key 是无损编码（不是哈希，无碰撞），表里存的
  //    是「这个局面的真分数 ≥/≤/= v」这种**与窗口、与调用者、与是哪一次 solve 都无关的
  //    绝对事实」⇒ 换个局面来查照样成立，答案一位都不会变。它就是纯记忆化。
  // ⭐ 为什么值得开：开局库是「一个根 + 它的全部近邻后代」，兄弟子树重叠极大。实测（n=14 的
  //    根 + 3 层内全部 287 个去重非终局后代）：56,392,914 → 12,445,476 节点、15.0s → 3.1s，
  //    **4.53× 节点 / 4.81× 墙钟**，score 指纹完全相同。
  //    ⚠ 而在**互不相关**的随机局面上它一分不赚（10,368,810 → 10,364,625）—— 所以这笔收益
  //      在 tools/bench-solver.js 那种随机散点基准里**永远看不见**，别拿 bench 去证伪它。
  let keepTable = false;
  /** @param v true = 跨 solve/scoreAll 复用整张表（离线用）；false = 回到每次清表的可比状态 */
  function setKeepTable(v) {
    keepTable = !!v;
    // ⚠ 关闭时必须置 overflow：暖表期间写过的槽早已超出 log 的记录（log 只记「由空变非空」
    //   的那些，而且中途可能已溢出）⇒ 下一次 ttReset 必须整表 fill 才能真正回到干净状态。
    //   少这一行，关掉之后第一次搜索仍会读到暖表的残留 ⇒ nodes 对不上、门禁静默失真。
    if (!keepTable) ttOverflow = true;
  }

  // ⭐ ─── 开局库（Task 7，DESIGN §2.1 / §9.2）───
  // 默认**没有库** ⇒ 本文件的行为与 Task 6 定稿版逐位相同（tests 的节点数上限门禁、
  // DESIGN §10 的地面真值都在无库状态下跑，装库不影响它们）。
  // 契约：`{ ply: 整数手数, get(key) -> 分数 | undefined }`，key 就是本文件 keyOf 的输出
  // （**已镜像归一**）。分数是「该局面轮走方视角的精确分」，与本文件的分数约定完全一致。
  // ⛔ 运行时装库的唯一入口；⛔ gen-book 生成期间绝不许装（会拿自己的输出喂自己）。
  // ⚠ bookPly 单独存一个数：热路径上 `n === bookPly` 是一次 SMI 比较，
  //   写成 `book !== null && n === book.ply` 会在每个节点上多一次属性读。
  //   ⇒ 没库时 bookPly = -1，而 n ≥ 0，比较恒假。
  let book = null, bookPly = -1;
  /** @param b 库对象或 null（卸载）。⛔ 形状不对就当场抛错 —— 一个「装上了但其实没生效」
   *  的库会让运行时静默地慢下去（然后被读成「求解器变慢了」），比崩掉难查得多。 */
  function setBook(b) {
    if (b === null || b === undefined) { book = null; bookPly = -1; return; }
    if (!Number.isInteger(b.ply) || b.ply < 1 || b.ply > B.CELLS) {
      throw new Error('开局库的 ply 必须是 1..' + B.CELLS + ' 的整数，收到 ' + String(b.ply));
    }
    if (typeof b.get !== 'function') throw new Error('开局库必须提供 get(key) 函数');
    book = b; bookPly = b.ply;
  }

  /** 局面的无损 key（推导见上），**取自身与左右镜像的较小者**。
   *  ⭐ **已导出**（Task 7）：开局库的键就是它，三处（gen-book 写 / book.js 读 / 下面 negamax 查）
   *     共用这**一个**定义。⚠ 因为它归一了镜像，库里一条记录同时服务一个局面和它的镜像
   *     ⇒ 库直接小一半；也因此库里**只许存分数、不许存着法**（着法跨镜像要翻列号）。
   *  ⚠ 它编码了 (子力分布 + 列高 + 轮走方)，不编码手数列表 ⇒ 走法顺序不同但局面相同的两局
   *     共用一条记录（这正是我们要的）。
   *  `me[c] + (1 << h[c])` 是 `me[c] + mask[c] + 1` 的等价形式，少一次数组读与一次或运算 ——
   *  两种写法在深度 ≤ 10 的全部局面上逐位相同（穷举验证过）。
   *
   *  ⭐ **左右镜像归一**：四子棋的规则关于中列完全对称 ⇒ 一个局面与它的镜像**分数恒等**
   *     （胜负、最快手数都一样）。所以把两个 key 里较小的那个当作两者共用的表项，是无损的，
   *     而且立刻把一整族转置合并掉。
   *  ⚠ 它**只在根局面本身镜像对称时**才有收益（开局、gen-book 那条路径）：根一旦不对称，
   *     搜索树里几乎不会同时到达 P 和 mirror(P)。实测——
   *       · 镜像对称根：n=16 节点 307,746→200,616（1.53×）、n=12 1,797,065→1,203,430（1.49×）、
   *         n=8 102,366,792→58,726,667（1.74×，28.9s→18.1s）
   *       · 随机（不对称）根 10 手档：0.98×，区间重叠 ⇒ **没有可测量代价**
   *     ⇒ 空盘/开局免费提速一大截，中后盘白拿一次多余的 keyOf，划算。
   *  ⭐ **为什么在非对称的窗口下也合法**（这是最容易被怀疑的一点）：表里存的从来不是「在
   *     窗口 (α,β) 下算出来的东西」，而是**「这个局面的真分数 ≥ v / ≤ v / = v」这种与窗口
   *     无关的绝对事实** —— 分数是局面自身的纯函数。窗口只在**探查那一刻**被拿来重判一次
   *     （`v >= beta` / `v <= alpha`）。所以谁来查、拿什么窗查、是不是同一次 solve，
   *     都不影响事实本身；镜像局面与原局面的真分数恒等，共用一条事实自然也成立。
   *  ⛔ 别顺手把「表里存的着法也镜像回来」那套加上：本文件的表里**不存着法**（存了实测无
   *     收益，见文件头），而着法一旦跨镜像复用就必须跟着翻列号，翻错是静默的错答案。
   *  ⚠ 镜像归一有专门的门禁：tests/test-solver.js §3.8 的对称定点局面，同时钉「每列与其
   *     镜像列同分 / best 对 c↦6-c 闭合」（正确性）与节点数上限（它有没有真的在生效）。
   *     ⛔ 没有那条门禁的话，这整块删掉，全部随机语料的节点数**一位不差** —— 静默失效。 */
  function keyOf(bd) {
    const me = bd.turn === 0 ? bd.a : bd.b, h = bd.h;
    let k = 0, km = 0;
    for (let c = B.W - 1; c >= 0; c--) k = k * 128 + me[c] + (1 << h[c]);
    for (let c = 0; c < B.W; c++) km = km * 128 + me[c] + (1 << h[c]);   // 列序反过来 = 镜像
    return k < km ? k : km;
  }

  /** 写表（always-replace）。⚠ 只在槽**由空变非空**时记 log —— 覆盖写时槽号早就在 log 里了，
   *  重复记会让 log 撑爆、白白退化成整表 fill。 */
  function ttPut(idx, qk, v, f) {
    if (ttQ[idx] === 0) {
      if (ttLogN < TT_LOG_CAP) ttLog[ttLogN++] = idx; else ttOverflow = true;
    }
    ttQ[idx] = qk;
    ttV[idx] = (v << 2) | f;
  }

  // ════════ 威胁掩码（move ordering 与「预判败招」的共同地基）════════
  //
  // threatMask(m, out)：给一方的列掩码数组，算出「**这个空格**落下去就成四」的全部格子。
  // ⚠⚠ **只保证在空格上正确**（对已占格的输出无意义，调用方永远只查 h[c] 与 h[c]+1 这两行）。
  //    竖直方向正是靠这一点简化的：空格 (c,r) 的上方**必然全空**（重力），所以经过它的竖四
  //    只可能用 r-1/r-2/r-3 三格 ⇒ 一个 `(v<<1)&(v<<2)&(v<<3)` 就完备了。横与两条斜则把
  //    四个窗口位置全部枚举，不做任何简化。
  // ⭐ 与 bitboard.js 的 hasFourMasks 同一个结构性保证：**所有位运算都在列内完成，相邻列是
  //    两个独立的数**，`c+3 < W` 的循环本身就是边界 ⇒ 斜线不可能跨越棋盘边缘、也不会和相邻
  //    列串成竖线（DESIGN §9.1）。⛔ 别把它「优化」成对 49 位打包的整数移位，那一整类静默
  //    bug 会立刻回来。
  // ⚠ 左移最高触到 bit H+2（H=6 时 bit 8），远离符号位；最后统一 & MASK_H 把行 ≥ H 的
  //   伪位夹掉 —— 那些位代表「第 7 行」的幽灵格，漏夹一次就是凭空多一个威胁。
  // ⚠ 正确性怎么被钉住的，见 negamax 里调用处的那段 ⚠（独立预言机 + 零剪枝参考解对拍）。
  //   ⛔ 别在这里加「本函数已验证」之类的空话：这个文件最怕的就是靠注释背书的正确性。
  const MASK_H = (1 << B.H) - 1;
  // ⛔⛔ ─── 下面这四个模块级临时数组被**全部递归栈帧共用**，只有一条纪律保着它们 ───
  //   `_tMe` / `_tOp`（negamax 用）与 `_tOrd` / `_key`（orderMoves 用）都不是每层一份。
  //   它们今天安全**只是因为**：每一次读都发生在本层第一个 `B.playIn` 之前 —— 递归一旦开始，
  //   子节点会把它们全部覆盖掉。
  //   ⛔ **绝对不许在主循环内部或之后再读它们**。下一个人最自然的一行就是在循环后面加一句
  //     「回头看看对手还有没有威胁」去读 `_tOp` —— 那时读到的是**最深那个子节点**的数据，
  //     不报错、不崩溃、不越界，只是分数悄悄变了。这与 `_nodes` 那条警告是同一类病，
  //     但比它更隐蔽（计数器至少还是个能对账的数）。
  //   ⇒ 真要在递归之后用，就在递归**之前**把需要的值抄进局部变量（SMI，零成本）。
  const _tMe = new Int32Array(B.W);
  const _tOp = new Int32Array(B.W);

  function threatMask(m, out) {
    for (let c = 0; c < B.W; c++) {
      const v = m[c];
      out[c] = (v << 1) & (v << 2) & (v << 3);          // 竖：三子在正下方
    }
    for (let c = 0; c + 3 < B.W; c++) {
      const a0 = m[c], a1 = m[c + 1], a2 = m[c + 2], a3 = m[c + 3];
      // 横：同一行跨 4 列，缺哪一列就是哪一列的威胁格
      out[c]     |= a1 & a2 & a3;
      out[c + 1] |= a0 & a2 & a3;
      out[c + 2] |= a0 & a1 & a3;
      out[c + 3] |= a0 & a1 & a2;
      // 斜 ↗：(c,r)(c+1,r+1)(c+2,r+2)(c+3,r+3)，先把四列都对齐到「行 r」
      const b1 = a1 >> 1, b2 = a2 >> 2, b3 = a3 >> 3;
      out[c]     |= b1 & b2 & b3;
      out[c + 1] |= (a0 & b2 & b3) << 1;                // 缺口在行 r+1，得移回去
      out[c + 2] |= (a0 & b1 & b3) << 2;
      out[c + 3] |= (a0 & b1 & b2) << 3;
      // 斜 ↘：(c,r)(c+1,r-1)(c+2,r-2)(c+3,r-3)
      const d1 = a1 << 1, d2 = a2 << 2, d3 = a3 << 3;
      out[c]     |= d1 & d2 & d3;
      out[c + 1] |= (a0 & d2 & d3) >> 1;
      out[c + 2] |= (a0 & d1 & d3) >> 2;
      out[c + 3] |= (a0 & d1 & d2) >> 3;
    }
    for (let c = 0; c < B.W; c++) out[c] &= MASK_H;
  }

  // 6 位掩码的 popcount 查表（H=6 ⇒ 只有 64 种取值，查表比任何位技巧都快）。
  const POPC = new Uint8Array(1 << B.H);
  for (let i = 1; i < POPC.length; i++) POPC[i] = POPC[i >> 1] + (i & 1);
  // ⛔ 同上那条「模块级临时数组被全部栈帧共用」的纪律，这两个也一样（都在 orderMoves 内部
  //   用完即弃，orderMoves 整个跑在第一个 playIn 之前）。
  const _tOrd = new Int32Array(B.W);        // orderMoves 的临时威胁掩码
  const _key = new Int32Array(B.W);         // 每个候选列的排序键

  /** move ordering：按「落这一子之后，我方**够得着的**威胁格数」降序重排 ms。
   *  ⭐ 为什么是这个键：四子棋的胜负几乎全在「造双威胁」，一个能同时开两个威胁的落子
   *     大概率就是最优解 ⇒ 先搜它，αβ 的 fail-high 来得最早。
   *  ⚠ 只数「够得着的」（行 ≥ 该列当前高度）：埋在已有子下面的格子永远轮不到，把它们
   *     算进去等于给排序喂噪声。
   *  ⚠ 插入排序 + 严格大于 ⇒ **稳定**，同分保持进来的中路优先序（ORDER）。⛔ 别换成
   *     Array.prototype.sort：它对小数组不保证更快，且比较器一变就可能把中路优先洗掉。
   *  ⚠ 借 me[c] 一下就还（同 bitboard 的 isWinningMove）：threatMask 只读、不抛错、
   *     不持有引用，中间没有任何人能观察到这个临时位。 */
  function orderMoves(bd, ms, h) {
    const me = bd.turn === 0 ? bd.a : bd.b;
    for (let i = 0; i < ms.length; i++) {
      const c = ms[i], old = me[c];
      me[c] = old | (1 << h[c]);
      threatMask(me, _tOrd);
      me[c] = old;
      let cnt = 0;
      for (let j = 0; j < B.W; j++) {
        const floor = j === c ? h[j] + 1 : h[j];        // 自己这列落完子后高度 +1
        cnt += POPC[_tOrd[j] >>> floor];               // threatMask 出来已夹到 H 位
      }
      _key[i] = cnt;
    }
    for (let i = 1; i < ms.length; i++) {
      const mvv = ms[i], kv = _key[i];
      let j = i - 1;
      while (j >= 0 && _key[j] < kv) { ms[j + 1] = ms[j]; _key[j + 1] = _key[j]; j--; }
      ms[j + 1] = mvv; _key[j + 1] = kv;
    }
  }

  /**
   * 负极大搜索。bd 必须是 **searchBoard**（会被就地修改再原样还原）。
   * ⛔ 前置条件：bd **未终局**（上一手没有成四）。调用方保证：
   *    · 根：solve/scoreAll 先查 R.terminal；
   *    · 递归：只对「非制胜手」recurse（制胜手在上面那段就返回了）。
   *    少这一条就会穿过终局节点继续搜、结果全错且零报错（rules 层故意不查终局）。
   * @returns 当前行棋方视角的精确分数（在 (alpha, beta) 窗内；窗外返回的是同向的界）
   */
  function negamax(bd, alpha, beta) {
    _nodes++;
    if (bd.n === B.CELLS) return 0;                     // 满盘且无人四连 ⇒ 和

    // ─── 置换表探查 ───
    // ⚠ 放在「当场取胜扫描」**之前**：命中就连两次 threatMask 和着法数组的分配一起省掉。
    //   这是安全的，因为**能当场取胜的节点从不入表**（下面那段 return 在任何 ttPut 之前，
    //   而全部四处 ttPut 都在它之后），所以任何命中的 key 一定是「没有当场制胜手」的节点。
    // ⚠ 只用来**当场截断**，不拿界去收窄 alpha/beta：收窄后 alpha0 的语义要跟着变，
    //   而 alpha0 判错 EXACT/UPPER 会往表里存**错的界**（不报错，只是悄悄给错答案）。
    //   实测收窄那一版在本机基准上区间重叠 ⇒ 没有可测量收益，不值这个风险。
    const key = keyOf(bd);
    const idx = key % TT_SIZE;
    const qk = (key - idx) / TT_SIZE + 1;               // 商 + 1（整数运算精确：key < 2^53）
    if (ttQ[idx] === qk) {
      const p = ttV[idx], v = p >> 2, f = p & 3;
      if (f === F_EXACT) return v;
      if (f === F_LOWER) { if (v >= beta) return v; }
      else if (v <= alpha) return v;                    // F_UPPER
    }

    const n = bd.n, h = bd.h;
    // 己方的全部威胁格（空格中「落下去就成四」的那些）。
    // ⚠ 这一整块替代了原来的 `for (c of R.moves) if (B.isWinningMove(bd,c))` 扫描：
    //   一次 threatMask 比 W 次 isWinningMove 便宜，而且**顺带把对手的威胁也算出来了**，
    //   下面「预判败招」那一整套剪枝全靠它。
    // ⚠ threatMask 只有**行 h[c] 与 h[c]+1** 这两行会被查到（这里查 h[c]，预判败招查两者）
    //   ⇒ 需要被钉死的也只有这两行。钉它的是两处，都不碰 solver 内部（API 只有 solve/scoreAll）：
    //     · tests/test-solver.js §3.7：拿 B.isWinningMove / R.winningMoves 当**独立预言机**，
    //       逐条压「预判败招」三个分支的可观测后果（错一位就换一条分支，分数当场变）；
    //     · 同文件 §4 的大规模对拍：每一列的精确分数与**零剪枝**参考解逐位相同。
    //   ⛔ 别把这里改成「相信注释」——它错了不会报错，只会让求解器安静地给错答案。
    threatMask(bd.turn === 0 ? bd.a : bd.b, _tMe);
    // 先看能不能当场赢：这是唯一能拿到 CELLS - n 的情形，也保证了下面 recurse 的
    // 每个子节点都不是「已经被赢掉」的局面（negamax 的前置条件由此自我维持）。
    for (let c = 0; c < B.W; c++) {
      const r = h[c];
      if (r < B.H && ((_tMe[c] >>> r) & 1)) return B.CELLS - n;
    }

    // ─── ⭐ 开局库探查（Task 7）───
    // 位置：**在当场制胜扫描之后**。两个理由，都不是风格问题：
    //   1) 库里因此不必收「轮走方一手连四」的局面（ply 10 少 22%、ply 8 少 15%），
    //      而它们本来就 0 成本；
    //   2) 与置换表探查分开：TT 那次在最前面（命中就连 threatMask 都省了），库这次晚一点点，
    //      多付一次 threatMask —— 但 n === bookPly 的节点在一次搜索里只占很小一撮，无所谓。
    // ⭐ **为什么在任何窗口下返回它都合法**：库里存的是 exactScore 的输出 = 这个局面的**真分数**，
    //    与窗口、与谁来查、与调用历史都无关（和置换表的 F_EXACT 同一个道理，见 keyOf 那段的 ⭐）。
    //    key 也用同一个 keyOf ⇒ **镜像归一天然对齐**，库直接小一半，且不需要翻列号
    //    （库里不存着法，只存一个分数 —— 存了着法才必须跟着镜像翻，那是静默错的入口）。
    // ⛔ **查不到就必须继续正常搜索，绝不许编一个值**：库缺失/残缺/版本不符时游戏只是变慢，
    //    不许变错（DESIGN §9.2）。`book.get` 返回 undefined 就是「不知道」。
    // ⛔ 也别顺手把它 ttPut 进置换表：白占槽位，而库查本来就是 O(1)。
    if (n === bookPly) {
      const bv = book.get(key);
      if (bv !== undefined) return bv;
    }

    // 上界：不能当场赢 ⇒ 最早 nWin = n+3 ⇒ CELLS+1-(n+3) = CELLS-2-n。**但必须夹到 ≥ 0**，
    // 推导与实锤见文件头「上界 max」一节 —— n = CELLS-1 时裸公式给 -1，会凭空造出 +1。
    let max = B.CELLS - 2 - n;
    if (max < 0) max = 0;
    if (beta > max) { beta = max; if (alpha >= beta) return beta; }

    // ─── ⭐ 预判败招（本轮最大的一个剪枝，Pons 的 "anticipate direct losing moves"）───
    // 已知：我不能当场赢 ⇒ 本节点**最坏**的可能就是「对手在第 n+2 子取胜」，分数 -(41-n)。
    // 这是本节点分数的**下确界**，正因如此下面三种剪枝都不改变精确分数：
    //   · 对手有 ≥2 个**可落**的制胜点 ⇒ 我只能堵一个 ⇒ 精确分就是 -(41-n)，一个子节点都不用展开；
    //   · 恰好 1 个 ⇒ 我**必须**堵它（别的走法全是 -(41-n) = 下确界，取 max 时一定被它盖住）；
    //   · 0 个 ⇒ 凡是「落下去正好把对手的制胜点垫到可落高度」的列，其值必然 = -(41-n)（下确界）
    //     ⇒ 可以整列剪掉；若所有列都这样，精确分就是 -(41-n)。
    // ⛔ 这三条**只有在「我没有当场制胜手」时才成立**（上面那段 return 保证了）。把这块挪到
    //    制胜扫描之前 = 明明能一手赢却报「必败」，而且是静默的。
    threatMask(bd.turn === 0 ? bd.b : bd.a, _tOp);
    const lose = 0 - (B.CELLS - 1 - n);                 // ⚠ `0 - x` 不是 `-x`（n=41 时会漏 -0）
    let ms;
    {
      let forced = -1, nForced = 0;
      for (let i = 0; i < B.W; i++) {
        const c = ORDER[i], r = h[c];
        if (r < B.H && ((_tOp[c] >>> r) & 1)) { nForced++; forced = c; }
      }
      if (nForced >= 2) { ttPut(idx, qk, lose, F_EXACT); return lose; }
      if (nForced === 1) ms = [forced];
      else {
        ms = [];
        for (let i = 0; i < B.W; i++) {
          const c = ORDER[i], r = h[c];
          if (r >= B.H) continue;
          if (r + 1 < B.H && ((_tOp[c] >>> (r + 1)) & 1)) continue;   // 落这里等于把胜利递给对手
          ms.push(c);
        }
        if (ms.length === 0) { ttPut(idx, qk, lose, F_EXACT); return lose; }
      }
    }

    // ─── move ordering：按「落子后我方够得着的威胁格数」降序 ───
    if (ms.length > 1) orderMoves(bd, ms, h);

    // ⚠ alpha0 必须是**进入本节点时**的 alpha（beta 被 max 夹过不影响它）——最后判
    //   EXACT/UPPER 全靠它。别图省事复用循环里被抬高的 alpha：那样每个 fail-low 节点都会
    //   被当成 EXACT 存进去，表里从此是错的界，而搜索照跑不报错。
    // ⭐ **为什么 `best > alpha0` 就一定是精确值**（正面证明，不只是「反过来会错」）：
    //   循环里恒有 `alpha === Math.max(alpha0, best)`。设第 i 手是最后一次把 best 抬过
    //   alpha0 的那一手，它搜索时用的窗是 (alpha_i, beta)，而 alpha_i < score_i（否则抬不
    //   起来）、score_i < beta（否则上面就 fail-high 返回了）⇒ **score_i 严格落在窗内
    //   ⇒ 子搜索没有 fail 任何一侧 ⇒ 拿回来的就是精确值**。
    //   其余各手返回的都是「自身真值的上界」且 ≤ best（不然 best 会更大）⇒ 全部手的真值
    //   都 ≤ best，而第 i 手的真值**恰好等于** best ⇒ max 正好落在它身上 ⇒ best 精确。∎
    //   反之 best ≤ alpha0 时，各手只保证「真值 ≤ 自己的返回值」⇒ 只能断言本节点 ≤ best，
    //   即 UPPER。
    const alpha0 = alpha;
    let best = -INF;
    for (const c of ms) {
      B.playIn(bd, c);
      const score = -negamax(bd, -beta, -alpha);
      B.undoIn(bd, c);                                  // ⚠ 必须与 playIn 成对且同列
      if (score >= beta) {                              // fail-soft 高侧：返回真实下界
        ttPut(idx, qk, score, F_LOWER);
        return score;
      }
      if (score > best) { best = score; if (score > alpha) alpha = score; }
    }
    ttPut(idx, qk, best, best > alpha0 ? F_EXACT : F_UPPER);
    // fail-soft 低侧：返回**真实**上界（≤ 入口 alpha），不是入口 alpha 本身。
    // ⛔ 别「简化」成 `return alpha`：那样 fail-low 与 exact 的返回值都等于入口 alpha，
    //    Task 5 的置换表没法据此判 EXACT / UPPER，只能一律当 UPPER 存最松的界 ——
    //    「注释写 fail-soft、代码低侧却是 fail-hard」正是照注释写却存进糟糕界的标准剧本。
    //    实测：`return alpha` → `return best` 后，3120 个局面的 score/best/**nodes**
    //    与每一列的 scoreAll 逐位不变（控制流不变：fail-low 时父节点必然 score>=beta 当场
    //    截断，只是返回值更紧）。纯白送的信息，零风险。
    return best;
  }

  /**
   * ⭐ 一个局面的**精确**分数，用「空窗（null-window）+ 对分数区间二分」求出，而不是一发满窗。
   *   每次 `negamax(sb, med, med+1)` 的窗宽只有 1 ⇒ αβ 剪得最狠（几乎每个节点都能立刻
   *   fail-high 或 fail-low），代价是要问 ~7 次；而这 7 次共享同一张置换表，第二次起绝大
   *   部分子树是表命中。实测 **1.79×**（18 手档，独立进程 5 次取中位，区间不重叠）。
   * ⚠ 二分的收敛靠 fail-soft：`r` 不是 med/med+1 而是**真实的界**，所以一次问话往往能把
   *   区间砍掉不止一半。⛔ 把 negamax 退回 fail-hard 会让这里退化成纯二分（还是对的，只是慢）。
   * ⚠ `med` 的偏置（往 0 的另一侧靠）是 Pons 的技巧：四子棋里「和棋(0)」极其常见，
   *   不偏置的话每次都从 0 附近问起，要问满 log2(84) 次才能确认 0。
   * ⚠ `(x/2)|0` 是**向 0 取整**，照抄 Pons 的 C++ 整数除法语义。写成 `x >> 1`（向下取整）
   *   不会算错——终止性只靠「r ≤ med 时 max 严格变小、否则 min 严格变大」——但那是**另一条
   *   没被量过的启发式**，别顺手改了就当等价。
   */
  function exactScore(sb) {
    let min = 0 - (B.CELLS - sb.n), max = B.CELLS - sb.n;   // 真值必在此闭区间内
    while (min < max) {
      let med = min + ((max - min) >> 1);
      if (med <= 0 && (min / 2 | 0) < med) med = min / 2 | 0;
      else if (med >= 0 && (max / 2 | 0) > med) med = max / 2 | 0;
      const r = negamax(sb, med, med + 1);
      if (r <= med) max = r; else min = r;                  // fail-soft ⇒ r 本身就是新的界
    }
    // ⚠ **本函数会返回 `-0`**（和棋支上 negamax 内部的 `-negamax(...)` 会造出来）。这不是
    //   理论担心：插桩数过，本机 2,100 个局面的语料里出现 173 次（评审员另一份语料 993 次）。
    //   今天唯一的调用点 rootScores 用 `0 - exactScore(sb)`
    //   把它洗成 `+0` —— **清洗只有那一处**。⛔ 下一个人直接调 exactScore 拿去比
    //   `Object.is(s, 0)` / deepStrictEqual / `.toFixed(1)`（复盘曲线）会当场翻脸，且只在
    //   「和棋」这一支出现，最难查。要直接用就自己再夹一次 `0 - x`。
    return min;
  }

  /**
   * 内部：逐列算**精确**分数。sb 必须是非终局的 searchBoard。
   * @returns [{ c, score }]，按 R.moves 的中路优先序
   * ⚠ 每列都**单独**求精确分 —— 用「上一列的 alpha」收窄会更快，但那样非最优列拿到的
   *   只是上界而不是精确分，而 scoreAll 的精确分正是提示/精准度/妙手的输入。
   * ⛔ **「既精确又快」的两个自然写法都已被实测证伪，别再试**（P1 code review 实锤）：
   *      · 先跑一遍收窄 pass 拿到精确最大分 M，再用 `beta = M+1` 重搜全部列 → 节点数 **1.83×**
   *      · 同上但只重搜 fail-low 的列                                    → 节点数 **1.01×**
   *    两者结果都精确，但都更慢。原因：negamax 内部的 `beta = max` 夹取**已经**把 beta
   *    收到该节点的理论上界，外面塞进来的 `M+1` 几乎从不更紧 ⇒ 多跑的那一遍 pass 是净亏。
   *    ⭐ 上面那条结论**只否定「拿别的列的分数当窗」**，不否定 exactScore 的空窗二分：
   *      后者是在**同一列自己**的分数区间上二分，每次窗宽 1（比 `M+1` 紧得多），且靠
   *      置换表把 7 次问话的重复子树摊掉。两件事别混。
   */
  function rootScores(sb) {
    _nodes++;                                           // 根也是一个访问过的节点
    const out = [];
    for (const c of R.moves(sb)) {
      let s;
      if (B.isWinningMove(sb, c)) {
        s = B.CELLS - sb.n;                             // 当场取胜，无需搜索
      } else {
        B.playIn(sb, c);
        // ⚠ 写 `0 - x` 而不是 `-x`：和棋时 `-0` 会漏到外面去。JS 里 `-0 === 0` 为真，
        //    所以搜索本身不受影响，但 `Object.is(score, 0)`、assert.deepStrictEqual、
        //    以及复盘曲线的 `(-0).toFixed(1) === '-0.0'` 都会当场翻脸 —— 一个只在
        //    「和棋」这一支出现的怪异分支，最难查。`0 - 0` 恒为 `+0`，在边界一次夹干净。
        s = 0 - exactScore(sb);
        B.undoIn(sb, c);
      }
      out.push({ c: c, score: s });
    }
    return out;
  }

  /**
   * ⭐ 计数器的**唯一**闸口：`_nodes` 的重置与读取只在这一个函数里发生，且紧挨着。
   * ⛔ 别退回「solve 和 scoreAll 各写一次 `_nodes = 0`」—— 这俩今天近似重复
   *    （solve ≈ rootScores 的 max + argmax），下一个人最自然的合并就是让 solve
   *    内部去调 scoreAll，那一刻第二次重置会在搜索**中途**清零，`solve().nodes`
   *    静默变小、零报错。而 nodes 将来喂的是诚实分档 AI 的搜索预算和 gen-book.js
   *    的进度 —— 错了没有任何一处会响。计数器只许有一个开关。
   * @param sb 非终局的 searchBoard（由调用方 B.searchBoard 出来，本函数不再复制）
   * @param scoreOnly true = 只算**局面自身**的一个精确分（scoreOf / gen-book 用），
   *        不把每一列都精确化。⭐ 两条出口共用这**同一个**闸口，正是上面那条 ⛔ 的要求：
   *        别为 scoreOf 另写一个 `_nodes = 0`，第二个重置点就是那条静默 bug 的入口。
   * @returns { cols: [{c, score}] | null, score: number | undefined, nodes }
   */
  function analyze(sb, scoreOnly) {
    _nodes = 0;
    // ⛔ **置换表的清空必须和 _nodes 的重置绑在这同一个闸口上**，理由与计数器同源但更硬：
    //    表里存的是「局面 → 分数」的纯函数关系，key 又是无损的 ⇒ 跨次调用复用其实**不会
    //    算错**。但它会让 `solve(bd)` 连着调两次得到**不同的 nodes**，而 nodes 是对外契约
    //    的一部分（tests 钉死「同局面两次解逐位相同」，DESIGN §10 的节点数上限门禁也靠它
    //    拦剪枝退化）。留着表 = 门禁读数随调用历史漂移 = 门禁失效。
    // ⭐ 反过来，**同一次 analyze 内部的 7 次列搜索必须共享这张表**：兄弟列之间的转置重叠
    //    正是置换表在 scoreAll 上的主要收益来源（scoreAll 是提示/精准度/妙手判定的输入，
    //    也是本项目最需要救的那条路径）。所以清表在 analyze 开头、rootScores 之外。
    // ⭐ setKeepTable(true) 时**故意不清**（离线 gen-book 专用，见那里的说明）——
    //    但表还没分配的话仍要走一次 ttReset 去分配。
    if (!keepTable || ttQ === null) ttReset();
    if (scoreOnly) {
      // ⚠ `+ 0` 把 exactScore 可能返回的 `-0` 洗成 `+0`（那边的 ⚠ 说得很清楚：清洗只有
      //   调用点做）。⛔ 别照 rootScores 写成 `0 - exactScore(sb)` —— 那是**取反**，
      //   rootScores 需要取反（它要的是父节点视角），这里不需要（要的就是本局面的分数），
      //   写错了整本开局库的符号全反，而门禁之外没有任何一处会报错。
      return { cols: null, score: exactScore(sb) + 0, nodes: _nodes };
    }
    const cols = rootScores(sb);
    return { cols: cols, nodes: _nodes };
  }

  /**
   * ⭐ 求解一个局面。
   * @param bd 普通盘或搜索盘皆可；**绝不会被修改**（内部一律先 searchBoard 复制一份）
   * @returns { score, best, nodes }
   *   score —— 当前行棋方视角的精确分数（约定见文件头）
   *   best  —— **全部**并列最优的列，中路优先序（⚠ 不是「随便一个最优解」：
   *            AI 阶梯要从并列里按 seed 挑、提示要说「有几列不输」、妙手判定要数
   *            「只有 1 列不输」—— 漏返回一列，这三件事同时开始撒谎）
   *   nodes —— 本次访问的搜索节点数（含根）
   * ⚠ 已终局的局面返回 { score: 0, best: [], nodes: 0 }：局面已经结束，「当前方的最优着法」
   *   这个问题不成立。⛔ 消费端别把这个 0 读成「和棋」——先自己查 R.terminal。
   */
  function solve(bd) {
    if (R.terminal(bd) !== null) return { score: 0, best: [], nodes: 0 };

    const sb = B.searchBoard(bd);
    // 捷径：有当场制胜手时 CELLS - n 就是这个节点**理论上的最大分**（不可能更早赢），
    // 于是并列最优 = 全部制胜手，其余列一定更差，一个子节点都不用展开。
    // 这条让「AI 落子 / 提示」在任何深度的战术局面上都是瞬时的。
    // ⚠ 这条路径报 `nodes: 1`（**不是 0**）：根节点确实被检查过——一次 moves() 加
    //   至多 W 次 isWinningMove——只是没展开任何子节点。这里写字面量而不是碰 _nodes，
    //   是为了让「重置 + 读取」始终只发生在 analyze() 里（见那里的 ⛔）。
    const mates = R.winningMoves(sb);
    if (mates.length) return { score: B.CELLS - sb.n, best: mates, nodes: 1 };

    const a = analyze(sb);
    const rs = a.cols;
    // ⚠ 用 rs[0] 起头而不是 -INF 哨兵：rs 若为空（今天不可达——非终局必有合法列），
    //   哨兵会让 solve 返回 { score: -43, best: [] }，看着像个合法的「必败」；
    //   rs[0].score 则当场 TypeError（响的）。真值组件宁可炸，别静默编一个分数。
    let score = rs[0].score;
    for (const e of rs) if (e.score > score) score = e.score;
    const best = [];
    for (const e of rs) if (e.score === score) best.push(e.c);
    return { score: score, best: best, nodes: a.nodes };
  }

  /**
   * ⭐ 每一个合法列的精确分数（同样是**当前行棋方**视角，约定见文件头）。
   * 提示的「有几列不输」、精准度的每手打标签、妙手判定、课程的自动判分全读它。
   * @returns { [col]: score }（已终局的局面返回 {}）
   *   ⚠ JS 对象的键**是字符串**：`Object.keys(sa)` 拿到的是 `'3'` 不是 `3`，
   *     `Object.entries` 同理。要拿去调 B.play / 比对列号，先 `.map(Number)`
   *     （bitboard 的 play 对字符串列号会当场抛错——响的，但别踩）。
   * ⚠ 它比 solve 贵得多。注意**不是**因为它没有当场制胜捷径 —— rootScores 对每一列
   *   都走了那条捷径（见那里的 isWinningMove 分支）。差别在于：solve 一旦发现存在制胜手，
   *   就知道其余列必定更差，**整个都不用搜**；scoreAll 必须给出每一列的真值，所以那些
   *   「更差的列」它一个都省不掉。
   * ⛔ 别照 solve 在这里加一个顶层的 `if (mates.length) return {...}` 捷径 ——
   *   那会让每个**非制胜列**返回错值，而提示的「有几列不输」、妙手判定、课程判分
   *   全读这些值（且 solve 的定点测试只钉制胜列，未必挡得住）。
   */
  function scoreAll(bd) {
    const out = {};
    if (R.terminal(bd) !== null) return out;
    for (const e of analyze(B.searchBoard(bd)).cols) out[e.c] = e.score;
    return out;
  }

  /**
   * ⭐ 局面**自身**的精确分数（当前行棋方视角，约定见文件头）。开局库生成器的主力入口。
   * @param bd 普通盘或搜索盘皆可；**绝不会被修改**
   * @returns { score, nodes }
   * ⚠ **它与 solve().score 恒等，但便宜得多**：solve/scoreAll 走 rootScores，把**每一列**
   *   都精确化（提示/精准度/妙手判定一列都不能少）；本函数只要一个数，αβ 可以在兄弟列之间
   *   自由剪枝。实测比值见 tools/gen-book.js 抬头 —— 这个差价乘上几十万个局面，
   *   就是「跑一夜」与「跑一周」的区别。
   * ⛔ **已终局的局面直接抛错**，不像 solve 那样返回 0：solve 返回 0 时还配着 `best: []`
   *   这个能被下游看见的信号，而一个光秃秃的 0 与「和棋」完全无法区分 —— 开局库里混进一条
   *   「终局局面 = 和棋」是最标准的静默谎言。调用方自己先查 R.terminal。
   */
  function scoreOf(bd) {
    if (R.terminal(bd) !== null) {
      throw new Error('scoreOf：已终局的局面没有「当前方的分数」，先自己查 R.terminal');
    }
    const a = analyze(B.searchBoard(bd), true);
    return { score: a.score, nodes: a.nodes };
  }

  // 与 rules-classic.js 同样冻结：不在热路径上（只是属性读取），零代价，却能挡住
  // `S.solve = () => ({score:0,best:[3]})` 这类把真值整个换掉的误用 —— 求解器被悄悄
  // 替换掉，上面每一层仍会「正常工作」，正是本文件最怕的失败模式。
  // ⚠ setKeepTable 是**离线专用**的导出（Task 7 gen-book），默认关、行为与不导出时
  //   完全一致。⛔ 运行时（Worker/UI）永远不许调它：一旦打开，nodes 就不再是「只由局面决定」
  //   的量，而 DESIGN §10 的节点数上限门禁与 AI 分档的搜索预算都读 nodes。
  // ⚠ keyOf 导出出去**只为了让开局库与置换表共用同一个 key 定义**（gen-book 写、book.js 读、
  //   negamax 查，三处必须逐位一致）。⛔ 别在别处再抄一份「差不多的」key 函数：两份定义漂移
  //   之后，库会安静地按错 key 命中——那正是「库说谎」的标准剧本（Task 7 门禁的由来）。
  const API = Object.freeze({ solve, scoreAll, scoreOf, keyOf, setKeepTable, setBook });
  // ⚠ 浏览器侧按 root.Bitboard / root.RulesClassic 取依赖 ⇒ index.html 里
  //   bitboard.js → rules-classic.js → solver.js 的**脚本顺序不能乱**（乱了是
  //   「B is undefined」当场炸，响的，不是静默错，但仍别踩）。
  if (inNode) module.exports = API;
  else root.Solver = API;
})(typeof self !== 'undefined' ? self : this);
