// ════════════════════════════════════════
// state.js —— 对局状态 `G` 的形状 + 存档 / 撤销 / 复盘的**唯一入口**（DESIGN §9.3）。
//
// ⭐ 核心决定（已定稿，⛔ 别改）：**存「先后手 + 手数列表」，不存局面快照栈。**
//    一个决定同时白送四样：
//      · 撤销      = 重放到 n−1
//      · 中断恢复  = 存 42 个个位数（⚠ **实测整局 ≤195 字节**，上界取在 seed 最长时；
//                    手数列表本体 89 字节，其余全是元数据键名。快照栈是几十 KB ——
//                    量级差三个数量级，但「几十字节」只对手数列表本身成立，别再复制那个数。
//                    ⚠ 这个数由 tests/test-state.js 现场量并断言，⛔ 改了这里就去对一遍）
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

  /** ⚠ G 的形状一变就 bump（老存档直接丢弃，⛔ 不迁移）。 */
  const SAVE_VERSION = 1;

  /** 对局模式的**闭集**。⛔ 别在别处写 `'ai'` 字面量比较——跨模块比字符串、没有单一来源，
   *  正是 P1 终审点名的那个活口（`=== 'load'` 静默恒假）。 */
  const MODES = Object.freeze(['human', 'ai']);

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
   * @param {{mode:'human'|'ai', tier?:number, gameNo:number, humanFirst?:boolean, seed?:number}} opts
   *   · mode     'human' = 同机双人 / 'ai' = 人机
   *   · tier     mode==='ai' 时必给（1..AI.TIER_MAX）；'human' 局必须**不给**（给了 = 调用方搞混了）
   *   · gameNo   本轮的第几局，从 0 开始 —— ⭐ **交替先手全靠它**（DESIGN §1.1 第 2 条）
   *   · humanFirst 显式覆盖先后手。⭐ 给它是为了 DESIGN §1.1 第 1 条：顶档必须让玩家先手
   *                （后手对完美 AI 是数学上的必败），⛔ 别逼 UI 去谎报 gameNo。
   *   · seed     显式给 = 复现某一局（分享 URL / 测试夹具）；不给就生成一个并存下来。
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

    let humanFirst;
    if (opts.humanFirst === undefined) {
      humanFirst = gameNo % 2 === 0;
      // ⭐ DESIGN §1.1 第 1 条：顶档是完美求解器，**后手是数学上的必败** ⇒ 交替先手在这一档必须让位，
      //    否则每两局就有一局是「凭定义赢不了」的差评制造机。
      //    ⛔ 别把这条留给 UI「记得传 humanFirst」——只写一处才守得住（漏传时零报错）。
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
      moves: []
    };
  }

  /** ⭐ 由手数列表**现算**盘面。⛔ 绝不缓存（缓存会和撤销打架）。
   *  ⚠ 每次返回**全新对象**：调用方随便改都影响不到 G，也影响不到下一次调用。 */
  function boardOf(g) { return B.fromMoves(g.moves); }

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
    return Object.assign({}, g, { moves: g.moves.slice(0, k) });
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
    if (!Array.isArray(d.moves) || d.moves.length > B.CELLS) return null;
    // ⚠ 这一行是**故意的冗余**（变异实测：删掉它整份测试仍绿）—— 下面 B.play 的守卫已经能拦下
    //   每一种非法列号。留着是为了「意图写在字段校验里」+ 早退，⛔ 但别因此以为它是承重的：
    //   真正承重的是下面那个 try/catch（拆掉立刻红）。删这一行前先确认 B.play 的守卫还在。
    for (const c of d.moves) if (!isCol(c)) return null;

    // ⭐ 手数列表必须**真的能重放**：满列、以及「终局之后还有手」都要在这里被拦下。
    // ⚠ B.play 对非法着法会**抛**（P1 的守卫，故意的）—— 包住它，别让异常逃到 UI。
    try {
      let bd = B.newBoard();
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
      moves: d.moves.slice()      // ⚠ 拷一份：别让解析出来的数组被外部句柄捏在手里
    };
  }

  const API = {
    SAVE_VERSION, MODES,
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
