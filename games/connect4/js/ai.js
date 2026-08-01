// ════════════════════════════════════════
// ai.js —— 20 级**明面**难度阶梯（DESIGN §3.1）。这 20 级同时就是 §7.5 的 20 位棋手角色，
// 难度 / 角色 / 榜单三个系统合一。⛔ 级别**由玩家自己选**，程序绝不暗改（casual-game-meta
// 「绝不做暗改随机的 DDA」）——本文件里没有任何一处会因为「玩家最近输太多」而改变行为，
// 因为它**看不到玩家**：
//
// ─────────── ⭐ 公平承诺写进类型签名（DESIGN §2.3）───────────
//
//     aiMove(position, tier, seed) -> column
//
// **入参里没有玩家历史、没有胜负记录、没有自适应状态 ⇒ 想作弊都没有入口。**
// 这句话要能印在公平页上，所以它由 tests/test-ai-determinism.js **守住**，不是靠这段注释：
//   · 往全局塞 G / PlayerProfile / 连胜 99 / 大师级存档 ⇒ 同 (position,tier,seed) 逐手不变
//   · ⭐ **撤销之后不许改主意**：撤销 N 次再重走同一条路，每一手必须逐手一致
//     （否则立刻被读成「它在偷看我要走哪」）
//   · ⛔ 禁 Math.random —— 全文件零出现，测试对源码做正则断言，且把 Math.random 换成
//     抛错函数后整套用例照样绿
//
// ⭐ **随机性是 (position, tier, seed) 的纯函数，不是一条被推进的流。** 这一条是「撤销不改
//    主意」的**唯一**实现方式：若像常规做法那样在开局 create 一次 PRNG、每手推进一格，
//    撤销之后流的位置不会跟着退回去 ⇒ 重走同一条路会得到不同的落子。本文件每一手**现场**
//    用 mixSeed(seed, posHash(position), tier) 起一条新流，局面回到哪里，随机数就回到哪里。
//    ⚠ 四子棋每手必加一子 ⇒ 同一局内局面永不重复 ⇒ 「同局面同随机」不会退化成「重复出招」。
//
// ─────────── 三档只是推荐入口（DESIGN §3.1）───────────
//   第 1-5 级「轻松」  ：只看 2 手（能连四就连、对方要连四就挡），其余随机偏中路。
//                        ⭐ **根本不调求解器**（DESIGN §9.2 断崖那节点名要求）——低档必须
//                        仍然秒出，别让共用代码路径把轻松档也拖成 1.7 秒，那会让轻松档
//                        显得比顶档还重。tests 用「求解器计数器 = 0」+ 耗时双重钉死。
//   第 6-19 级「进阶」 ：完美求解器 + 每步 p 概率从 ranking 里挑第 2/3 好的，p 逐级递减。
//   第 20 级「完美」   ：纯求解器，零失误。
// ⛔ **任何档都绝不主动走「立即败招」**（送对方当场连四）——包括第 1 级。这是全档共用的
//    「战术前置层」，不花求解器一分钱。
//
// ─────────── ⚠ 中档怎么拿 ranking：一次 scoreAll，没有更省的（实测，别再试）───────────
// 原计划是「先 solve 拿最优，只在真要故意走次优时才 scoreAll」，**省不到一分钱**：
// solver.js 的 solve() 就是 `analyze()`（= scoreAll 的同一次全列精确化）+ argmax，
// 两者是同一份工作。实测（DESIGN §9.1 口径：每变体独立进程、5 次取中位、看区间重不重叠；
// 局面 = 无当场制胜手且安全列 ≥2，即战术前置层放行之后 AI 真会调求解器的那一类）：
//
//   n=16：solve  中位区间 [44.98, 53.65] ms   scoreAll [43.81, 50.03] ms   ⇒ 区间重叠 = 无差异
//         childScoreOf（对每个子局面各调一次 scoreOf 自己拼 ranking）[57.37, 64.44] ms
//         ⇒ 与 scoreAll **区间不重叠，慢约 1.35×**：每次 scoreOf 都会清一次置换表，
//           而 scoreAll 的 7 次列搜索**共享**同一张表（兄弟列的转置重叠正是它的主要收益）。
//   n=18：solve [15.67, 17.69]  scoreAll [16.13, 17.01]  childScoreOf [16.47, 19.61]（总耗时 1.24×）
//   （scoreOf 单独调只有 1 个数、给不出着法与 ranking，n=16 中位 ~17.7ms / n=18 ~2.0ms，
//     便宜 2.7-8×，但它答不了「走哪一列」这个问题，本文件用不上。）
//
// ⇒ **定稿：求解器档每手最多一次 `S.scoreAll`**，最优与次优从同一份结果里读。
//   真正省下来的不是换 API，而是**战术前置层**：当场制胜 / 唯一不送头的列 / 全都送头
//   这三类局面**一次求解器都不调**，且这三类的结论都可证明与求解器一致
//   （证明见 safeMoves 与 decide 里的注释，并由测试逐个对拍求解器）。
//   实测免搜比例（1,400 局自对弈、43,000 个**真实对局里出现过**的局面，问 usesSolver）：
//     整局 22%；按手数分段 n0-5 2% · n6-11 12% · n12-17 21% · n18-23 30% · n24-29 36%
//                        · n30-35 45% · n36-41 72%
//   ⚠ 读法：它在**开局帮不上忙**（那一段本来就该靠开局库），但正好在 §9.2 那个断崖段
//     （n=10..15，中位 1.7 秒）替下五分之一的手，而且越到残局越省。
//   ⛔ 别把它理解成「优化」：它首先是**正确性**要求（任何档都不许送头），省时间是副产品。
//
// ⚠⚠ **产品侧前置条件（不是本文件能解决的）**：没装开局库时，n ≤ 9 的一次 scoreAll 是
//    **几十分钟**（DESIGN §9.2：空盘 35.3 分钟 → 装库后 26.8 毫秒）。所以第 6-20 级的
//    开局阶段**必须等开局库就位**（Book.status().state === 'ready'）。UI 用下面的
//    `usesSolver(position, tier)` 判断这一手要不要搜、要不要显示「思考中」。
//    ⛔ 别指望本文件替你挡：solver.js 不暴露「库装了没有」，这里查不到。
//
// ⚠ 浏览器侧脚本顺序：bitboard.js → rules-classic.js → solver.js → book.js → **ai.js**
//   （乱了是「S is undefined」当场炸，响的，但别踩）。
// ════════════════════════════════════════
(function (root) {
  const inNode = (typeof module !== 'undefined' && module.exports);
  const B = inNode ? require('./bitboard.js') : root.Bitboard;
  const R = inNode ? require('./rules-classic.js') : root.RulesClassic;
  const S = inNode ? require('./solver.js') : root.Solver;
  const PRNG = inNode ? require('../../../engine/prng.js') : root.PRNG;

  const TIER_MIN = 1, TIER_MAX = 20;
  const SOLVER_FROM = 6;                       // 第 6 级起用求解器；1-5 级只看 2 手
  const CENTER = (B.W - 1) >> 1;               // W=7 ⇒ 3
  const MAX_DIST = Math.max(CENTER, B.W - 1 - CENTER);
  // ⛔ 下面的中路权重表是**按 W=7 手写的整数**（理由见 weightedPick 那段：不许用 Math.pow）。
  //    换棋盘宽度必须同时重写这张表 —— 这里当场炸，别让它静默读到 undefined 变成 NaN 权重
  //    （NaN 权重 = 总和 NaN = 永远落到兜底列，「随机偏中路」静默变成「永远走同一列」）。
  if (MAX_DIST !== 3) throw new Error('ai.js 的中路权重表是按 W=7 写的，W 变了必须重写这张表');

  // ─────────── 决策原因枚举 ───────────
  // ⛔ 别在别处手写这些字面量（DESIGN §2.4 的教训：solitaire 的 'win' vs 'solvable' 拼错，
  //    每一个有解开局都被静默报成死局）。消费端一律 `AI.REASON.WIN` 这样引用：
  //    属性名打错会拿到 undefined 并在比较时恒假……所以下面还冻结了对象，打错属性名
  //    在严格模式下是 undefined —— 仍比字符串字面量好查，且 REASON 只有 6 个值，
  //    tests 里有一条「decide 返回的 reason 必在 REASON 的值域内」的断言兜底。
  const REASON = Object.freeze({
    WIN: 'WIN',           // 当场连四（任何档都必走）
    FORCED: 'FORCED',     // 只有一列不当场送头（可证明 = 唯一最优，不必搜）
    DOOMED: 'DOOMED',     // 每一列都当场送头（各列分数相同，不必搜）
    SHALLOW: 'SHALLOW',   // 第 1-5 级：安全列里按中路权重随机
    BEST: 'BEST',         // 求解器档：并列最优里按 seed 挑
    SLIP: 'SLIP'          // 求解器档：故意走第 2/3 好（⛔ 仍绝不是立即败招）
  });
  const REASON_VALUES = Object.freeze(Object.keys(REASON).map(k => REASON[k]));

  // ════════ 阶梯参数（⭐ 已校准，2026-08-01 P1 Task 9）════════
  //
  // ⭐ **下面这张 p 表是 `tools/sim-ai.js` 蒙特卡洛跑出来的，不是拍的**（DESIGN §3.1）。
  //   ⛔⛔ **改它之前必须重跑 `npm run sim:c4`** —— 这不是客套话：p 与胜率的关系是**强凸**的
  //   （见下），凭直觉动一个数会把好几级的实际强度挪到你想不到的地方，而且没有任何一处会报错。
  //
  // ─── 为什么是**显式表**而不是一条公式 ───
  // 出厂版是一条线性公式（P0=0.55 线性降到 0），本轮把它整个换掉，三条理由：
  //   ① 这张表是**实测响应曲线的反函数采样**，本来就没有闭式；硬套公式等于把测量结果
  //      重新拟合成一条好看的线，再把误差留给后人。
  //   ② 显式表**没法"凭手感微调形状"** —— 每个数字都必须能从一次 sim 跑出来，改不动就得重跑。
  //   ③ 顺带把 IEEE754 那条顾虑清零：表里是字面量，运行时**一次算术都不做**
  //      （原公式的 `* / ` 虽然逐位确定，但少一层是一层；⛔ 仍然绝不许改用 Math.pow —— 各引擎
  //       实现允许有差，一个 ulp 就能让 `rnd() < p` 在 iOS(JSC) 与 Android(V8) 上分道扬镳，
  //       而 §7 的「确定性锦标赛 / 分享一条 URL 复盘整局」要求跨设备逐手相同）。
  //
  // ─── 校准是怎么做的（口径全在 sim-ai.js 文件头）───
  // ① 尺子 = 参考玩家：会抓立即胜 / 会挡立即负 / 其余偏中路（`basic`），外加一把也懂
  //    「别落在对方赢点下面」的强化版（`solid`）。⛔ 尺子独立于本文件，绝不是 AI.aiMove。
  // ② ⭐ 求解器档的行为**只由 (p, q3) 决定**，tier 本身只参与 PRNG 混种 ⇒ 扫一遍 p 就拿到
  //    整条响应曲线，不必对 15 个级各做一次二分（省 15×）。实测（第 12 级 · q3=0.35 ·
  //    800 局/点 · 先后手各半 · 和局半分 · 标准误 ≈ 0.016）**参考玩家的得分率**：
  //      p        0    .1    .2    .3    .4    .5    .6    .7    .8    .9   1.0
  //      basic  .000  .004  .007  .019  .036  .053  .079  .122  .166  .226  .291
  //      solid  .000  .009  .019  .058  .093  .114  .157  .242  .320  .414  .499
  // ③ ⭐ **响应是强凸的 —— 这正是出厂线性曲线的病**：p 从 .55 线性降到 0 看着"每级降 3.9 个
  //    百分点"很均匀，换算成胜率却是**第 16-20 级全部落在 0-0.6%**（出厂曲线实测 800 局/级：
  //    .006 / .003 / .001 / .000 / .000），**五格台阶是画上去的** —— 这就是出厂注释里那句
  //    「p(19)=.039 与 p(20)=0 玩家分不出来」的真正规模：不止最后一格，是最后五格。
  //    ⇒ 校准 = 把「等距」放到**胜率**上而不是 p 上：本表 = 上面那条响应曲线的**反函数**采样，
  //      让参考玩家的得分率从第 6 级到第 20 级**线性**降到 0（每级约 1.0 个百分点）。
  // ④ 上界不是 p ≤ 1 定的，是**单调性**定的：第 5 级（轻松档最高）实测 .191(basic)/.297(solid)
  //    （800 局；2,000 局复测 .205/.307），第 6 级必须比它更强 ⇒ p(6) 最多约 .78。
  //    ⛔ 再高第 6 级就比第 5 级还弱 —— 阶梯当场倒挂（sim-ai 的 ladder 表会在行尾标
  //    「⚠倒挂」，别忽略它）。
  //
  // ⚠⚠ **两个产品锚点没打到 —— 这是实测结论，不是"没校准好"**（DESIGN §3.1 已记这一行）：
  //   · 「第 1 级 ≈ 参考玩家 90% 胜」：第 1 级实测只给到 **.486**（800 局；2,000 局复测 .493）。
  //     第 1 级已经是**规则允许的最弱**（安全列里等权随机），而 DESIGN §3.1 同时规定「任何档
  //     都绝不主动走立即败招」⇒ 要到 90% 只能让它送头。**两条规格互相矛盾，不是曲线能解决的。**
  //   · 「中位级（≈12）≈ 50%」：整条阶梯的**上限**就是第 1 级那 .486（solid 尺子 .639），
  //     50% 落在第 1-2 级之间。第 12 级在**任何** p 下都够不到（p=1 也只有 .291/.499，
  //     而且 p>.78 会倒挂）。要把 50% 挪到中位级只能改**结构**（SOLVER_FROM 前移、或给低档
  //     加限深搜索把轻松档摊开到十级），那是 P2 的产品决定。
  //     ⛔ 不许靠把 p 顶到 1 来假装达标 —— 那买到的 50% 是用「阶梯倒挂」换的。
  //
  // ⚠ **难度页上该印的不是 p**：p 是「打算走次优」的概率，而次优常常与最优**同分**（那一手
  //   其实没失误）⇒ 真实失误率恒 < p，两者差好几倍。要给玩家看数字，印 sim-ai 的
  //   **「变盘失误/局」**（把必胜走成和/负、或把和走成负 —— 玩家真能抓住的那种失误；
  //   校准后第 6 级 2.34、第 12 级 1.78、第 19 级 0.48、第 20 级 0.00）。
  //   ⛔ 别印「慢招」（分数更差但仍必胜）—— 那种失误玩家看不见，印出来只会显得数字虚高。
  //
  //   tier   6     7     8     9    10    11    12    13    14    15    16    17    18    19    20
  //   p     .750  .727  .702  .679  .656  .630  .607  .573  .535  .488  .429  .371  .312  .225  .000
  const P_TABLE = Object.freeze([
    0.750, 0.727, 0.702, 0.679, 0.656,   // 第 6-10 级
    0.630, 0.607, 0.573, 0.535, 0.488,   // 第 11-15 级
    0.429, 0.371, 0.312, 0.225, 0.000    // 第 16-20 级（第 20 级零失误，由测试钉死）
  ]);
  if (P_TABLE.length !== TIER_MAX - SOLVER_FROM + 1) {
    throw new Error('P_TABLE 的长度必须等于求解器档的级数（' + (TIER_MAX - SOLVER_FROM + 1) + '）');
  }
  /** 第 tier 级的失误概率。⚠ 轻松档（tier < SOLVER_FROM）没有 p，返回 0 —— 它们的强弱轴
   *  是下面的中路权重表，不是 p（把 1..20 串起来比单调性会得到假红，见 tests 里那条注释）。 */
  function pCurve(tier) {
    if (checkTier(tier) < SOLVER_FROM) return 0;
    return P_TABLE[tier - SOLVER_FROM];
  }

  // 第 1-5 级的中路权重：w[dist]，dist = |c - 3|。手写整数（见上面的 ⛔）。
  // 第 1 级 = 全等权（真·瞎走，只是不送头）；到第 5 级中列约是边列的 10.6 倍。
  // ⭐ **这就是 1-5 级之间唯一的梯度**，也正是 DESIGN §3.1 那句「其余随机偏中路」——
  //   中路控制是四子棋最强的静态启发（中列参与 13 条四连线、边列只有 3 条），所以
  //   「偏多少」是一条真实的强弱轴，不是装饰。测试用 t5 vs t1 的确定性自对弈钉死这条梯度。
  // ⚠ 这五行的**间距是几何加速的（1.0→1.5→2.0→2.8→3.8），不是等差**，理由是**阶梯跨度**。
  //   口径：确定性自对弈 · 先后手各半 · 和局算半分 · **800 局/组 × 4 个 seed 家族**
  //        （p≈0.5 处标准误 = sqrt(0.25/800) ≈ 0.018，所以只认区间不重叠的结论）。
  //   与等差版（bias 1.0/1.3/1.6/1.9/2.2，w[d] = round(10 × bias^(3−d))）逐项对比：
  //
  //   ⭐ 复算命令（**改这张表之前必须跑**，1.5 秒，轻松档一次求解器都不调）：
  //        node games/connect4/tools/sim-ai.js --mode=weights --games=800 --families=4
  //
  //            t5v4                          t2v1                          t5v1
  //     等差   .507 .516 .554 .536           .583 .554 .578 .598           .729 .743 .724 .724
  //     几何   .552 .573 .561 .530           .611 .651 .587 .646           .807 .800 .809 .811
  //            └ 区间重叠，**没有可测量差异** └ 只擦边（.598 vs .587）  └ **不重叠**：跨度 .73 → .81
  //
  //   ⇒ 真实且可复现的收益是**跨度**（第 1 级到第 5 级拉得开），不是某一对相邻级。
  //     这正是产品诉求本身：这五级在难度页上是**五个不同的棋手角色**（DESIGN §7.5），
  //     跨度不够就是「五个头像共用一种棋风」。相邻级只要单调即可，本来就不该指望拉开
  //     ——两个相邻角色打起来接近五五开是**对的**。
  //   ⚠⚠ **本段的数字换过两轮，两轮都是被复算纠正的**，读法照旧「只认区间不重叠」：
  //     · 第一版写「等差 t5v4 = .487（打平）」——单次 400 局（标准误 .025）的读数，复算不出来；
  //     · 第二版（上面那组 .512/.549…）是 Task 8 手里的脚本跑的，Task 9 的 sim-ai.js 复算
  //       得到的是现在这组：**跨度结论原样成立**（.73 vs .81，区间不重叠），但 **t2v1
  //       从「不重叠」退成「只擦边」** —— 也就是说第 2 级与第 1 级之间那一格台阶比上一版
  //       宣称的弱。⛔ 别再把 t2v1 当成「已证明」的卖点。
  //     ⛔ 本仓第三次踩这个坑：**标着「实测」的数字必须是此刻的代码能复现的数字**，
  //       否则是给后人留一个查不动的伪真值。
  const CENTER_W = [
    [10, 10, 10, 10],    // 第 1 级 bias 1.0（全等权：真·瞎走，只是不送头）
    [34, 23, 15, 10],    // 第 2 级 bias 1.5
    [80, 40, 20, 10],    // 第 3 级 bias 2.0
    [220, 78, 28, 10],   // 第 4 级 bias 2.8
    [549, 144, 38, 10]   // 第 5 级 bias 3.8
  ];

  // 故意走次优时，挑「第 3 好」而不是「第 2 好」的概率（第 3 好存在时才有意义）。
  // ⚠ 对所有求解器档相同，Task 9 **量过但没动它**：它是把阶梯弱端**再往下拉**的第二个旋钮
  //   （实测 solid 尺子、第 12 级：q3=.35 时 p=1 给 .499，q3=1 时同一个 p=1 给 **.714**），
  //   但阶梯弱端的上界是「不许比第 5 级还弱」定的，不是 p/q3 的量程定的 ⇒ 这个旋钮**这一轮
  //   用不上**。⭐ 真要用它，前提是先把轻松档摊开（见 P_TABLE 那段 ⚠⚠ 的结构性建议）。
  const Q3 = 0.35;

  function buildTiers() {
    const out = [];
    for (let t = TIER_MIN; t <= TIER_MAX; t++) {
      out.push(Object.freeze(t < SOLVER_FROM
        ? { tier: t, mode: 'shallow', w: Object.freeze(CENTER_W[t - 1].slice()), p: 0, q3: 0 }
        : { tier: t, mode: 'solver', w: null, p: pCurve(t), q3: Q3 }));
    }
    return out;
  }
  let _tiers = buildTiers();

  /** 某一级的参数（**冻结**，改不动；要改走 setTierParams）。 */
  function params(tier) { return _tiers[checkTier(tier) - 1]; }
  /** 全部 20 级的参数，下标 0 = 第 1 级。 */
  function allParams() { return Object.freeze(_tiers.slice()); }

  /**
   * ⭐ Task 9（tools/sim-ai.js 蒙特卡洛校准）的**唯一**写入口。
   * @param tier 1..20
   * @param patch { p?, q3?, w? } —— 只允许改这三个；mode 由级别本身决定，不许改
   *   （把第 3 级改成 solver 模式 = 轻松档突然要搜 1.7 秒，正是 DESIGN §9.2 点名不许发生的事）。
   * ⚠ 改的是**明面公开**的阶梯定义（失误率是印在难度选择页上的数字），不是暗改：
   *   ⛔ 绝不许在一局进行中调用它 —— 那会让同一 seed 的同一局面前后给出不同答案，
   *     「撤销不改主意」当场破功，而且没有任何一处会报错。校准是**离线**行为。
   */
  const PATCH_KEYS = ['p', 'q3', 'w'];
  function setTierParams(tier, patch) {
    const t = checkTier(tier);
    const cur = _tiers[t - 1];
    // ⛔ **键名白名单 —— 未知键必须抛错，绝不许静默丢弃**（评审实锤）：
    //   `setTierParams(8, {probability: 0.3})` 若被默默忽略，Task 9 的整轮蒙特卡洛就跑在
    //   **出厂 p** 上，然后如实报告「已校准到目标胜率」—— 一次零报错的哑失败，
    //   而且下游读到的每一个「已校准」的数字都是假的。同理 patch 传 null / 非对象
    //   也不许当 no-op：那等于「我以为我改了」。
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('setTierParams：patch 必须是对象（收到 ' + (Array.isArray(patch) ? 'array' : String(patch)) + '）');
    }
    const keys = Object.keys(patch);
    if (keys.length === 0) throw new Error('setTierParams：patch 是空对象，什么都没改 —— 十有八九是键名写错了');
    for (const k of keys) {
      if (PATCH_KEYS.indexOf(k) === -1) {
        throw new Error('setTierParams：不认识的键 "' + k + '"（只接受 ' + PATCH_KEYS.join(' / ') + '）');
      }
    }
    const next = { tier: t, mode: cur.mode, w: cur.w, p: cur.p, q3: cur.q3 };
    if (patch && patch.p !== undefined) {
      if (typeof patch.p !== 'number' || !(patch.p >= 0 && patch.p <= 1)) {
        throw new Error('setTierParams：p 必须是 [0,1] 的数，收到 ' + String(patch.p));
      }
      if (cur.mode !== 'solver') throw new Error('setTierParams：第 ' + t + ' 级是轻松档（不调求解器），没有 p 可调');
      next.p = patch.p;
    }
    if (patch && patch.q3 !== undefined) {
      if (typeof patch.q3 !== 'number' || !(patch.q3 >= 0 && patch.q3 <= 1)) {
        throw new Error('setTierParams：q3 必须是 [0,1] 的数，收到 ' + String(patch.q3));
      }
      if (cur.mode !== 'solver') throw new Error('setTierParams：第 ' + t + ' 级是轻松档，没有 q3 可调');
      next.q3 = patch.q3;
    }
    if (patch && patch.w !== undefined) {
      if (cur.mode !== 'shallow') throw new Error('setTierParams：第 ' + t + ' 级是求解器档，没有中路权重可调');
      // ⚠ 上界 1e6 不是洁癖：weightedPick 把 W 个权重相加，和一旦越过 2^53，
      //   `Math.floor(rnd() * total)` 就开始**静默丢精度** —— 表现是某几列再也抽不到，
      //   而「随机偏中路」看起来仍然正常。7 × 1e6 离 2^53 有九个数量级的余量。
      if (!Array.isArray(patch.w) || patch.w.length !== MAX_DIST + 1
          || !patch.w.every(x => Number.isInteger(x) && x > 0 && x <= 1e6)) {
        throw new Error('setTierParams：w 必须是 ' + (MAX_DIST + 1)
          + ' 个 1..1e6 的正整数（下标 = 与中列的距离）');
      }
      next.w = Object.freeze(patch.w.slice());
    }
    _tiers = _tiers.slice();
    _tiers[t - 1] = Object.freeze(next);
    _paramsRev++;
    return _tiers[t - 1];
  }
  /** 回到出厂曲线（测试与校准脚本收尾必调，别让一次校准漏到下一个用例里）。 */
  function resetTierParams() { _tiers = buildTiers(); _paramsRev = 0; return allParams(); }

  // ⭐ ─── 参数表指纹（I4）───
  // 公平承诺的**严格**表述不是「同 (position,tier,seed) 恒等」，而是
  //   「**在这张明面参数表下**，同 (position,tier,seed) 恒等」。
  // setTierParams 会合法地改变落子（Task 9 就靠它），⛔ 但「绝不许在一局进行中调用」
  // 原本只是一句口头约定 —— 误调一次，存档与分享 URL 的复盘会与当时对不上，
  // 而**没有任何一处会报错**。所以把参数表本身也钉进指纹：
  //   ⭐ **存档（DESIGN §9.3）与分享 URL 里，除了 seed 还要记下这个 hash**；重放时
  //     hash 不一致 ⇒ 如实说「这局是在另一套难度参数下下的」，⛔ 绝不假装能逐手复现。
  // ⚠ rev 只是「改过几次」的计数（调试用，不参与相等判定）；判定一律用 hash。
  let _paramsRev = 0;
  function paramsDigest() {
    let h = 0x811c9dc5 | 0;
    const mix = v => { h = Math.imul(h ^ (v | 0), 0x01000193); };
    for (const pr of _tiers) {
      mix(pr.tier);
      mix(pr.mode === 'solver' ? 1 : 2);
      mix(Math.round(pr.p * 1e9));      // p/q3 是小数 ⇒ 定点化再拌（⛔ 别把浮点位模式直接拌进去）
      mix(Math.round(pr.q3 * 1e9));
      if (pr.w) for (const x of pr.w) mix(x);
    }
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return Object.freeze({ rev: _paramsRev, hash: (h >>> 0).toString(16) });
  }

  // ════════ 入参校验（⛔ 一律当场抛错，别静默兜底）════════
  // 理由与 bitboard.play 同源：静默兜底会让「AI 其实一直在按第 1 级走」这种事零报错地存在。
  function checkTier(tier) {
    if (!Number.isInteger(tier) || tier < TIER_MIN || tier > TIER_MAX) {
      throw new Error('非法难度级别：必须是 ' + TIER_MIN + '..' + TIER_MAX + ' 的整数，收到 '
        + (typeof tier) + ' ' + String(tier));
    }
    return tier;
  }
  function checkSeed(seed) {
    // ⛔ 不给默认值：seed 是公平承诺的一部分（「同 position+tier+seed 必然同一手」），
    //    默认成 0 会让调用方以为自己传了、而实际上整局共用一个隐式 seed，测不出来也查不出来。
    if (!Number.isInteger(seed)) {
      throw new Error('非法 seed：必须是整数，收到 ' + (typeof seed) + ' ' + String(seed));
    }
    // ⚠ 截到 32 位（PRNG 的种子就是 32 位）⇒ 超过 2^31 的 seed 会**别名**到别的 seed。
    //   这不影响任何承诺（同 seed 仍恒等），但存档里存的 seed 必须是**截断后**的这个值，
    //   否则「分享一条 URL 复盘整局」在两端算出的 seed 一样、显示的 seed 不一样，看着像 bug。
    return seed | 0;
  }
  /** position 接**手数列表**或**棋盘对象**（DESIGN §9.3 的存档就是手数列表）。绝不修改入参。 */
  function toBoard(position) {
    if (Array.isArray(position)) return B.fromMoves(position);   // 列号的类型/合法性一律由 play 收
    if (position && Array.isArray(position.a) && Array.isArray(position.b)
        && Array.isArray(position.h) && Number.isInteger(position.turn) && Number.isInteger(position.n)) {
      return position;
    }
    throw new Error('非法 position：要么是手数列表（数组），要么是 bitboard 的棋盘对象');
  }

  // ════════ 随机性：(position, tier, seed) 的纯函数 ════════
  /** 局面 → 32 位散列。⛔ **不是** solver.keyOf，也绝不许被当成 key 用：
   *  · 它只喂 PRNG，散列碰撞的后果仅仅是「两个局面抽到同一串随机数」（无害）；
   *  · keyOf 做了**左右镜像归一**（开局库与置换表要靠它），拿来播种会让镜像局面抽到同一串
   *    随机数 —— 那本身也无害，但会把「AI 的随机性依赖求解器内部的归一约定」这条隐形耦合
   *    塞进公平承诺里；求解器哪天改了归一方式，AI 的落子就跟着变，而没有任何一处会报错。
   *  ⚠ 必须把 turn 也拌进去：手搓的局面（DESIGN §9.3 说这类局面不可撤销）可以有相同的
   *    a/b 却轮不同的人走，两者是不同的决策问题。 */
  function posHash(bd) {
    let h = 0x811c9dc5 | 0;
    for (let c = 0; c < B.W; c++) {
      h = Math.imul(h ^ bd.a[c], 0x01000193);
      h = Math.imul(h ^ bd.b[c], 0x01000193);
    }
    h = Math.imul(h ^ bd.turn, 0x01000193);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return h >>> 0;
  }
  /** (seed, 局面, 级别) → PRNG 种子。三者都拌进去：换级别不该复用同一串随机数
   *  （否则「第 7 级和第 9 级在同一局面上永远同时失误」，阶梯之间会出现肉眼可见的相关性）。 */
  function mixSeed(seed, ph, tier) {
    let x = (seed ^ Math.imul(ph, 0x9e3779b1) ^ Math.imul(tier, 0x85ebca6b)) | 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  // ════════ 战术前置层（全档共用，⛔ 一次求解器都不调）════════
  /**
   * 不会**当场**把胜利送给对手的列（DESIGN §3.1：任何档都绝不主动走「立即败招」）。
   * ⭐ 它顺手把「该挡必挡」也解决了，不用单独写一条挡棋规则：对手在 X 列有连四时，
   *   除了自己落进 X（把那格填掉）之外的每一列都会被这里筛掉。反过来，单写「挡 X」
   *   的实现会漏掉另一半 —— **落进 X 的下面一格反而给对手垫高**、以及落别处**新造**
   *   出一个对手的连四点。这两类都是「送头」，只有从「落完之后对手有没有一手连四」
   *   这个角度看才一并抓住。
   * ⛔⛔ **前置条件（现在是断言，不再是注释）：本方不许有当场制胜手。**
   *   有制胜手时本函数会说谎，而且谎得很像真话 —— 实例（评审实锤）：
   *     手数线 5113405651221034626204，制胜列 [5] ⇒ 本函数返回 **[]**，
   *     读起来就是「每一列都必败」，而其实**下一手就赢了**。
   *   原因：落进制胜列之后本方已经四连，`R.winningMoves` 在已终局的盘上照样会报出
   *   「对手的制胜手」（rules-classic.js 里有这条实锤警告），于是制胜列被当成送头列筛掉。
   *   ⚠ 内部两个调用点（decide / usesSolver）都已先查过 mates 所以不出错，**但它是公开
   *     导出的**，名字读起来像个全函数，而分层提示（§3.2）与妙手判定（§3.4）都要用它
   *     —— 那两处拿到 [] 会说出「你一列都不剩了」这种正好相反的话。
   *   ⇒ 与其在文档里写「调用方记得先查」，不如让它**响**。热路径不付这笔钱：
   *     decide / usesSolver 走下面那个不校验的 safeMovesUnchecked（它们本来就刚查过）。
   * @returns 中路优先序的列数组（可能为空 = 每一列都送头）
   */
  function safeMoves(bd) {
    const b = toBoard(bd);
    if (R.terminal(b) !== null) throw new Error('safeMoves：已终局的局面没有「安全列」，先自己查 R.terminal');
    if (R.winningMoves(b).length) {
      throw new Error('safeMoves：本方有当场制胜手（' + R.winningMoves(b)
        + '），此时「安全列」这个问题不成立 —— 先走制胜手。⛔ 别忽略这个错误：'
        + '不校验时本函数会把制胜列当成送头列筛掉，返回一个看起来像「全盘皆输」的空数组');
    }
    return safeMovesUnchecked(b);
  }
  /** 热路径版：**不**校验前置条件（decide / usesSolver 在调用前一行刚查过 mates）。
   *  ⛔ 内部函数，不导出 —— 对外的唯一入口是上面那个带断言的 safeMoves。 */
  function safeMovesUnchecked(bd) {
    const sb = B.searchBoard(bd);     // 零分配落子/悔子，绝不碰调用方的盘
    const out = [];
    for (const c of R.moves(sb)) {
      B.playIn(sb, c);
      if (R.winningMoves(sb).length === 0) out.push(c);
      B.undoIn(sb, c);
    }
    return out;
  }

  /** 安全列**严格优于**送头列 —— 这条不是手感，是可证的，前置层敢跳过求解器全靠它：
   *  送头 ⇒ 对手在第 n+2 子上取胜 ⇒ 本方视角 score = -(CELLS+1-(n+2)) = -(41-n)；
   *  安全 ⇒ 对手最早也要等到第 n+4 子 ⇒ score ≥ -(CELLS+1-(n+4)) = -(39-n) > -(41-n)。
   *  ⇒ 只要安全列非空，**全部最优列都在安全列里**；只剩一列安全时，那一列就是唯一最优。
   *  （测试拿求解器逐个对拍这条推论，⛔ 别只当注释看。） */
  function doomedScore(n) { return 0 - (B.CELLS - 1 - n); }

  // ════════ 挑选 ════════
  function pickOne(cols, rnd) { return cols[Math.floor(rnd() * cols.length)]; }

  /** 按中路权重随机（第 1-5 级）。⚠ 只用整数权重 + 一次乘法 + floor：
   *  IEEE754 的乘法与 floor 逐位确定，跨引擎同结果（见 pCurve 那段的 ⛔ Math.pow）。 */
  function weightedPick(cols, w, rnd) {
    let total = 0;
    for (let i = 0; i < cols.length; i++) total += w[Math.abs(cols[i] - CENTER)];
    let r = Math.floor(rnd() * total);
    for (let i = 0; i < cols.length; i++) {
      r -= w[Math.abs(cols[i] - CENTER)];
      if (r < 0) return cols[i];
    }
    // rnd() 恒 < 1 ⇒ r 恒 < total ⇒ 到不了这里。留个兜底只是不想在浮点边界上崩，
    // ⛔ 但别把它改成 cols[0]：那会让潜在的 bug 表现成「永远走最中间那列」（像是正常行为）。
    return cols[cols.length - 1];
  }

  /**
   * ⭐ 完整决策记录（UI 的「思考中」「挡下了」「妙手」都读它；aiMove 只取 col）。
   * @returns { col, tier, seed, n, reason, usedSolver, safe, scores, ranked, slipped }
   *   scores/ranked 只在真的调了求解器时非空。
   */
  function decide(position, tier, seed) {
    const bd = toBoard(position);
    const t = checkTier(tier);
    const sd = checkSeed(seed);
    const term = R.terminal(bd);
    if (term !== null) {
      // 与 solver.scoreOf 同一条纪律：已终局的局面没有「该走哪一列」，⛔ 别编一个返回值。
      throw new Error('已终局的局面没有着法（terminal = ' + term + '）');
    }
    const pr = _tiers[t - 1];
    const rnd = PRNG.create(mixSeed(sd, posHash(bd), t));

    const base = { tier: t, seed: sd, n: bd.n };

    // ① 能连四就连（任何档）。并列制胜手都是最高分（score = CELLS - n），按 seed 挑一个。
    const mates = R.winningMoves(bd);
    if (mates.length) {
      return rec(base, pickOne(mates, rnd), REASON.WIN, false, mates, null, null, false);
    }

    // ② 不送头的列。⛔ 全档硬约束，第 1 级也一样。
    const safe = safeMovesUnchecked(bd);   // 上面刚查过 mates，不必再校验一次前置条件
    if (safe.length === 0) {
      // 每一列都让对手当场连四 ⇒ 各列分数**完全相同**（都是 doomedScore(n)）⇒ 搜也白搜。
      // 取中路优先序的第一列：输是注定的，至少别在最后一手上看起来像乱走。
      return rec(base, R.moves(bd)[0], REASON.DOOMED, false, safe, null, null, false);
    }
    if (safe.length === 1) {
      // 唯一不送头的列 = 唯一最优（证明见 doomedScore 那段）⇒ 顶档在这里跳过求解器
      // **不是降级**，是省掉一次必然得到同样答案的搜索。「该挡必挡」多数落在这一支。
      return rec(base, safe[0], REASON.FORCED, false, safe, null, null, false);
    }

    // ③ 第 1-5 级：到此为止，秒出。⛔ 不许往下走到求解器。
    if (pr.mode === 'shallow') {
      return rec(base, weightedPick(safe, pr.w, rnd), REASON.SHALLOW, false, safe, null, null, false);
    }

    // ④ 求解器档：**每手最多一次 scoreAll**（省不掉，实测见文件头）。
    const scores = S.scoreAll(bd);
    const ranked = safe.map(function (c) {
      const s = scores[c];
      if (typeof s !== 'number') {
        // 求解器和规则层对「哪些列合法」意见不一致 = 地基裂了。⛔ 宁可炸，别拿 undefined 排序
        //（undefined 参与比较恒为 false，排序会静默退化成「保持原序」，AI 从此永远走中列）。
        throw new Error('scoreAll 没给出第 ' + c + ' 列的分数，求解器与规则层不一致');
      }
      return { c: c, score: s };
    });
    // 分数降序；同分按中路优先序（R.moves 的原序）—— 两级都必须是全序，否则 sort 的
    // 结果依赖引擎的排序稳定性，「同 seed 同局面同一手」会在不同引擎上破功。
    const rank = {};
    const ms = R.moves(bd);
    for (let i = 0; i < ms.length; i++) rank[ms[i]] = i;
    ranked.sort(function (x, y) { return (y.score - x.score) || (rank[x.c] - rank[y.c]); });

    // ⭐ 前置层的正确性对拍（免费，就在手边）：送头列必须**严格差于**最好的安全列。
    //   这条一旦不成立，②的两个提前返回就都在给错答案 —— 而那是静默的。
    const bestScore = ranked[0].score;
    for (let i = 0; i < ms.length; i++) {
      const c = ms[i];
      if (safe.indexOf(c) !== -1) continue;
      if (!(scores[c] < bestScore)) {
        throw new Error('不变量破了：送头列 ' + c + ' 的分数 ' + scores[c]
          + ' 不低于最好的安全列 ' + bestScore + '（ai.js 的战术前置层与求解器矛盾）');
      }
    }

    // ⚠ **无论 p 是多少都先抽这一下**（哪怕 p===0 抽了也用不上）：这样「挑并列最优」的
    //   那次抽样永远是流里的第 2 个数，与 p 的取值无关 ⇒ Task 9 把 p 从 0.30 拧到 0.31 时，
    //   那些**没失误**的手不会跟着换一列。少这一行，校准的每次微调都会顺带扰动所有手，
    //   蒙特卡洛的信噪比白白掉一截（而且没人会想到是这里）。
    const slipDraw = rnd();
    const wantSlip = pr.p > 0 && slipDraw < pr.p;
    if (!wantSlip) {
      const ties = [];
      for (let i = 0; i < ranked.length; i++) if (ranked[i].score === bestScore) ties.push(ranked[i].c);
      return rec(base, pickOne(ties, rnd), REASON.BEST, true, safe, scores, ranked, false);
    }
    // 故意走第 2 好（或第 3 好）。⛔ ranked 全部来自 safe ⇒ 结构性不可能是立即败招。
    // ⚠ 第 2 好与最优**同分**时，这一步其实没失误 —— 这是设计：p 是「打算失误」的概率，
    //   真实失误率永远 ≤ p 且随局面而变（明显局面里 AI 照样下得对）。Task 9 校准的是胜率，
    //   不是这个 p 本身，所以这条不影响校准，只影响怎么向玩家描述这个数字。
    let idx = 1;
    if (ranked.length >= 3 && rnd() < pr.q3) idx = 2;
    return rec(base, ranked[idx].c, REASON.SLIP, true, safe, scores, ranked, ranked[idx].score !== bestScore);
  }

  function rec(base, col, reason, usedSolver, safe, scores, ranked, slipped) {
    return Object.freeze({
      col: col, tier: base.tier, seed: base.seed, n: base.n,
      reason: reason, usedSolver: usedSolver,
      safe: Object.freeze(safe.slice()),
      // ⚠ scores 是 S.scoreAll 原样返回的对象 —— **必须冻结**：它是求解器的真值，
      //   消费端（提示 / 妙手 / 复盘）就地改一个字段就等于篡改真值，且零报错。
      //   ⚠ 它是纯对象不是数组 ⇒ 不涉及 §9.1 那条「freeze 把数组踢出 fast packed elements」
      //     的坑（那条只针对数组），这里冻结零代价。
      scores: scores ? Object.freeze(scores) : null,
      ranked: ranked ? Object.freeze(ranked.map(e => Object.freeze({ c: e.c, score: e.score }))) : null,
      slipped: !!slipped
    });
  }

  /**
   * ⭐⭐ 公平承诺的类型签名本体（DESIGN §2.3）。
   *   aiMove(position, tier, seed) -> column
   * 入参里**没有**玩家历史 / 胜负记录 / 自适应状态 ⇒ 想作弊都没有入口。
   * @param position 手数列表（存档格式）或 bitboard 棋盘对象；**绝不会被修改**
   * @param tier 1..20（玩家自己选的明面级别）
   * @param seed 整数（本局的种子）
   * @returns 合法列号（0..W-1）
   */
  function aiMove(position, tier, seed) { return decide(position, tier, seed).col; }

  /**
   * 这一手会不会真的去搜（UI 用它决定要不要显示「思考中」、以及要不要先等开局库）。
   * ⚠ 它自己**不搜**，只跑战术前置层，恒为微秒级。
   * ⚠⚠ 返回 true 且局面 n ≤ 9 而开局库没装 ⇒ 那一次 scoreAll 是**几十分钟**（DESIGN §9.2）。
   *    ⛔ 这一条必须由 UI 拦（查 Book.status()），本文件看不到库。
   */
  function usesSolver(position, tier) {
    const bd = toBoard(position);
    const t = checkTier(tier);
    if (_tiers[t - 1].mode !== 'solver') return false;
    if (R.terminal(bd) !== null) return false;
    if (R.winningMoves(bd).length) return false;
    return safeMovesUnchecked(bd).length >= 2;   // 上面刚 return 过有制胜手的情况
  }

  const API = Object.freeze({
    TIER_MIN, TIER_MAX, SOLVER_FROM, REASON, REASON_VALUES,
    aiMove, decide, usesSolver,
    params, allParams, pCurve, setTierParams, resetTierParams, paramsDigest,
    safeMoves, doomedScore
  });
  // 与本仓其余真值组件同样冻结：挡住 `AI.aiMove = () => 3` 这类把整条决策换掉的误用 ——
  // 换掉之后上面每一层仍会「正常工作」，而公平承诺已经不成立了。
  if (inNode) module.exports = API;
  else root.ConnectAI = API;
})(typeof self !== 'undefined' ? self : this);
