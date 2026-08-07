// ════════════════════════════════════════
// settings.js —— 玩家偏好的持久化（P2b Task 4）。**一个闭合对象 + 一层保守合并**，没有别的。
//
// ⭐⭐ 本文件唯一一条会咬人的规矩（snake 实锤，DESIGN 之外的血泪）：
//    **闭合对象的新字段必须列进 `defaults()`。**
//    merge 只拷「defaults 里有的 key」（这是故意的：存档里多出来的陈年字段不许复活），
//    所以字段忘了写进 defaults ⇒ 用户的显式选择**存得进去、读不回来**，
//    表现是「设置改了、刷新一下又变回去了」，零报错。
//    snake 的 `reduceMotion` 就这么丢过一次（games/snake/js/storage.js:12-15 那段注释）。
//
// ⚠ 别和「开放 map」搞混，方向是**相反**的：
//    · 开放 map（动态 key，如 snake 的 stats.specials）：默认值必须保持 `{}`，整体透传；
//    · 闭合对象（本文件）：每个字段都必须在 defaults 里点名，否则会被丢掉。
//
// ⭐ 「字段忘了写进 defaults」这件事在这里是**响的不是哑的**：`get/set` 对未知 key **抛错**。
//    这就是把 snake 那个静默 bug 变成一次当场炸的 TypeError —— 设置项是闭合集合，
//    问一个不存在的字段是**程序错误**，不是「返回 undefined 就算了」。
//    （门禁 tests/test-settings.js 与 e2e-p2b-t4.cjs 都押在这条上：把 threatHints 从
//     defaults 里拿掉，开关按钮当场抛 + 刷新后 `get` 不再等于 false ⇒ 两处一起红。）
//
// ⚠ 后端是**注入**的（`attach(backend, key)`），本文件不 import Platform：
//   · node 侧能拿假后端跑门禁（不用起浏览器）；
//   · 浏览器里由 main.js 在 `Platform.hydrate` **之后**接上真后端 ——
//     ⛔ hydrate 之前读 Platform.storage 在原生壳里拿到的是空的（engine/platform.js 的约定）。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  // ⚠ 存的形状变了（改字段名 / 改类型）就 +1，⛔ 加字段不用动它（merge 会补默认）。
  const SETTINGS_V = 1;

  /**
   * ⭐⭐ **闭合对象：新增字段一律加在这里**（见文件头）。
   * @returns 每次都是**新对象**（⛔ 别返回共享常量：调用方一改就把默认值污染了）
   */
  function defaults() {
    return {
      v: SETTINGS_V,
      // ⭐ 威胁高亮（DESIGN §6.4）：一步就能成四的格子标出来，两方不同标记。
      //   **新手默认开** —— 这条提示存在的理由就是「新手根本读不出三连」，默认关等于没做。
      threatHints: true,
      // ⭐⭐ 减弱动态（DESIGN §6.8，P2b Task 6）。**三态**，⛔ 不是布尔：
      //   'auto' 跟随系统 prefers-reduced-motion（默认）· 'on' 强制开 · 'off' 强制关。
      //   ⚠ 两个「强制」都必须存在：系统开关是全局的，而玩家可能只想在这个游戏里
      //     留着动画（'off'），或者系统没设但这一款晃得他难受（'on'）——
      //     做成布尔的话「跟随系统」和「强制关」就压成了同一个值，永远回不到跟随。
      reduceMotion: 'auto',
      // ⭐ 舒适模式（DESIGN §6.8）：大字 + 更大点击窗。⚠ 用户画像 4 岁到 80 岁。
      //   默认**关**：它改的是版面尺寸，⛔ 不该替没提要求的人改掉界面（与 threatHints 相反，
      //   那一条默认开是因为「读不出三连」的人自己不知道要开）。
      comfort: false,
      // ⭐⭐ 让子（DESIGN §6.7，P2c Task 1）：弱的一方开局就有 0/1/2 枚子在盘上。
      //   **默认 0** —— 它改的是**规则**，⛔ 绝不许替没提要求的人改掉一局棋的胜负条件
      //   （与 comfort 同一条判据；threatHints 默认开是因为它只加信息、不动规则）。
      //   ⚠ 值域是**数字枚举**（不是布尔）：0/1/2 三档，UI 上点一下 cycle 一档。
      //     ⛔ 别写成 `handicapOn: boolean` + 另一个「几枚」——两个字段表达一件事，
      //       必然出现「开着但 0 枚」这种谁都读不懂的状态。
      //   ⚠ 具体摆哪几格由 `C4State.HANDICAP_COLS` 说了算（**产品数值**，本文件只存档位）。
      handicap: 0,
      // ⭐⭐ 儿童档（DESIGN §6.7，P2c Task 2）：「AI 明显放水、不说难懂的话、赢了大撒花、
      //   更大的字与按钮」。**独立开关，⛔ 不是阶梯上的第 0 级**（理由写在 state.js 的 KIDS 那节）。
      //   **默认关** —— 与 comfort / handicap 同一条判据：它改的是**这一局怎么开**
      //   （锁第 1 级 + 孩子恒先手），⛔ 绝不许替没提要求的人改掉一局棋。
      //   ⚠ 它是**布尔**不是三态：儿童档要么是儿童档、要么不是，中间没有「跟随系统」这种东西。
      //   ⚠ 打开它会**顺手写另外两项**（让子 ≥1、舒适模式开）—— 那三次写入都是**真的落盘、
      //     家长事后都改得回**的（见 main.js 的 TOGGLE_KIDS）。⛔ 别做成「儿童档期间把那两项
      //     锁死/影子覆盖」：锁死的表现是家长点得动却改不掉，零报错。
      kids: false,
      // ⭐⭐ 对坐模式（DESIGN §6.7，P2c Task 3）：两个人**面对面**坐在同一台平板的两侧。
      //   **默认关**（与 comfort / handicap / kids 同一条判据：⛔ 不替没提要求的人改界面）。
      //   ⚠ 它**只改画面、一条规则都不改** ⇒ ⛔ 不进 G、不进存档、不 bump SAVE_VERSION
      //     （与 kids 正好相反，两者的分界写在 main.js 的 f2fOn 那一节）。
      //   ⚠ 它**只对同机双人局有意义**：人机局下这个选择**存得住但不生效**，
      //     ⛔ 不静默清掉（照 handicap 在求解器档下的先例）。
      faceToFace: false,
      // ⭐⭐ 限时模式（DESIGN §6.10，P2c Task 5）：每手 10 秒，超时由时钟替你落一手。
      //   ⛔⛔ **默认关，而且这一条是规格里被加粗写死的**：「⚠ 绝不能是默认 —— 休闲玩家讨厌计时」。
      //     它与 comfort / handicap / kids / faceToFace 同一条判据里**最硬**的一个：
      //     前面几条最坏是「界面不合我意」，这一条会**替玩家在盘上落子**。
      //   ⚠ 它是**布尔**：10 秒这个数是产品数值（C4Clock.TURN_MS），⛔ 不做成「5/10/20 秒」的枚举 ——
      //     §6.10 要的是「这局棋变成另一个游戏」这一件事，多一个旋钮只是把它做成设置页。
      //   ⚠ 儿童档下这个选择**存得住但不生效**（照 handicap 在求解器档下、faceToFace 在人机局下
      //     的先例）：⛔ 别在这里替家长清掉它 —— 判据只有 C4State.timedAllowed 一份。
      timed: false,
      // ⭐⭐ 最高精准度（P3 T6 · DESIGN §4「你输了，但这局精准度 91%，是你的新高」）。
      //   ⚠ 它是**跨局的玩家纪录**，不是「这一局是什么」⇒ 放**设置这一侧**，
      //     ⛔ 别塞进 G：那要 bump SAVE_VERSION 把所有老档判死，而它根本不影响任何一局的规则。
      //   ⚠ **0 是合法值**（真的一局都没打好）—— 判「有没有纪录」看的是 bestAccN（打过几局），
      //     ⛔ 别用 `bestAcc > 0` 当判据（那会把「打过但 0 分」说成「还没打过」）。
      bestAcc: 0,
      // 计入过纪录的局数（⇒ 才分得清「还没有纪录」与「纪录就是 0」）
      bestAccN: 0,
      // ════ ⭐ 元游戏计数器（P5 · DESIGN §7）════
      // ⚠ 全部是 number ⇒ 直接吃 settings 既有的类型校验，⛔ 不必为它们发明第二套存储。
      // ⚠ 等级/成就/任务/弱点**全部由这几个数现算**（meta.js 是纯函数）
      //   ⇒ ⛔ 别再存「等级」「已解锁成就」那类**派生**字段：它们必然与计数器漂移。
      games: 0,          // 打完的局数
      wins: 0,           // 赢的局数
      winsNoHint: 0,     // ⭐ **零提示**赢的局数（§7.8：这个口径才是拿去炫的）
      brilliants: 0,     // ✨ 妙手累计
      // ⭐ 十六课的完成情况压进一个整数的低 16 位（⛔ 别用数组：settings 的合并只认标量）
      lessonsMask: 0,
      // ⭐ 诊断标签累计（§5.3 「我的弱点」页直接读它们）
      tagUnder: 0, tagMissFork: 0, tagOffCenter: 0, tagParity: 0,
      // ⭐ 上一个插屏的时刻（§8 的「距上次 ≥2min」判据要它）。⚠ 0 = 还没出过。
      lastAdAt: 0
    };
  }

  /** ⭐ 取值受限的字段（**闭合枚举**）：merge 遇到不在表里的值退回默认，`set` 直接抛。
   *  ⛔ 光靠 `typeof` 是不够的：三态存的是字符串，`set('reduceMotion','yes')` 类型完全合法，
   *    存进去之后 motionReduced 会当成 'auto' 处理 —— 用户选的「强制关」变成「跟随系统」，
   *    零报错。⇒ 枚举必须自己有一道校验。
   *  ⚠ 枚举**不必是字符串**：`handicap` 是 [0,1,2]，`indexOf` 对数字一样精确
   *    （⛔ 别改成范围判断 `0<=v<=2`：那会放行 1.5 —— 类型是 number、范围也对，
   *      而 `HANDICAP_COLS[1.5]` 是 undefined ⇒ 开局当场炸在别处，追不回这里）。 */
  const ENUMS = Object.freeze({
    reduceMotion: Object.freeze(['auto', 'on', 'off']),
    handicap: Object.freeze([0, 1, 2])
  });

  /**
   * ⭐ 三态 → 「这一刻到底减不减动态」。**纯函数**（⇒ node 侧门禁能把真值表逐格钉死）。
   * @param mode      'auto' | 'on' | 'off'
   * @param sysPrefers 系统的 prefers-reduced-motion 是否为 reduce
   * ⚠ 认不出的 mode 一律**跟随系统** —— 坏存档不该把无障碍偏好静默变成「强制关」。
   */
  function motionReduced(mode, sysPrefers) {
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return !!sysPrefers;
  }

  /** defaults 的只读快照：UI / 门禁要「这个字段的默认值是什么」时读它，⛔ 别改。 */
  const DEFAULTS = Object.freeze(defaults());

  /** 保守合并：**只认 defaults 里有的 key**，类型不符一律退回默认。
   *  ⛔ 别改成 `{...def, ...saved}` —— 那会让存档里的陈年字段/脏类型原样复活。 */
  function merge(def, saved) {
    const out = defaults();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
    for (const k of Object.keys(def)) {
      if (k === 'v') continue;                                  // 版本号由本模块说了算
      const sv = saved[k];
      if (sv === undefined) continue;                           // 老存档缺字段 ⇒ 用默认
      if (typeof sv !== typeof def[k]) continue;                // 类型不符 ⇒ 用默认（⛔ 别硬转）
      if (ENUMS[k] && ENUMS[k].indexOf(sv) < 0) continue;       // ⭐ 枚举外的值 ⇒ 用默认
      out[k] = sv;
    }
    return out;
  }

  /** 纯函数：一串 JSON（或 null / 坏字符串）→ 一份完整设置。⛔ 任何情况都不抛。 */
  function parse(raw) {
    if (typeof raw !== 'string' || !raw) return defaults();
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return defaults(); }
    return merge(defaults(), o);
  }

  // ─────────── 实例状态（浏览器里就一份）───────────
  let cur = defaults();
  let backend = null;      // { get(k)→string|null, set(k,v) }
  let storeKey = '';

  function knownKey(k) { return k !== 'v' && Object.prototype.hasOwnProperty.call(DEFAULTS, k); }
  function assertKey(k) {
    if (!knownKey(k)) {
      // ⭐ 见文件头：闭合集合里问一个不存在的字段 = 程序错误，必须**响**。
      throw new Error('未知设置项 "' + String(k) + '" —— 新字段必须先列进 settings.js 的 defaults()');
    }
  }

  /** 接上真后端并**立刻读一次**。⚠ 浏览器里必须在 Platform.hydrate 之后调。 */
  function attach(be, key) {
    backend = be || null;
    storeKey = key || '';
    let raw = null;
    try { raw = backend && storeKey ? backend.get(storeKey) : null; } catch (e) { raw = null; }
    cur = parse(raw);
    return all();
  }

  function persist() {
    if (!backend || !storeKey) return;
    try { backend.set(storeKey, JSON.stringify(cur)); } catch (e) { /* 存不进去不许弄死一局游戏 */ }
  }

  /** @returns 副本（⛔ 别把内部对象交出去：外面一改就绕过了 set 的校验与落盘）。 */
  function all() { return Object.assign({}, cur); }

  function get(k) { assertKey(k); return cur[k]; }

  /** @throws 未知 key 或类型不符。⭐ 写完**立刻落盘**（⛔ 别攒着等某个「保存」时机——那个时机不存在）。 */
  function set(k, v) {
    assertKey(k);
    if (typeof v !== typeof DEFAULTS[k]) {
      throw new Error('设置项 "' + k + '" 的类型必须是 ' + (typeof DEFAULTS[k]) + '，收到 ' + (typeof v));
    }
    if (ENUMS[k] && ENUMS[k].indexOf(v) < 0) {
      throw new Error('设置项 "' + k + '" 只能是 ' + ENUMS[k].join(' / ') + '，收到 ' + JSON.stringify(v));
    }
    cur[k] = v;
    persist();
    return v;
  }

  /** 翻一个布尔项（UI 的开关就一句）。 */
  function toggle(k) { return set(k, !get(k)); }

  /** ⭐ 三态项转到下一个值（UI 上点一下就换一档）。⚠ 只对枚举字段有意义。 */
  function cycle(k) {
    assertKey(k);
    const vals = ENUMS[k];
    if (!vals) throw new Error('设置项 "' + k + '" 不是枚举项，用 set/toggle');
    return set(k, vals[(vals.indexOf(cur[k]) + 1) % vals.length]);
  }

  function reset() { cur = defaults(); persist(); return all(); }

  const API = {
    SETTINGS_V, DEFAULTS, ENUMS, KEYS: Object.freeze(Object.keys(DEFAULTS).filter(k => k !== 'v')),
    defaults, parse, attach, all, get, set, toggle, cycle, reset, motionReduced
  };
  // 与 P1 五个模块同样冻结：挡住 `C4Settings.get = () => true` 这类「设置看起来还在、
  // 但读的是另一份东西」的误用（本仓最怕的失败模式：画错/读错不报错）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Settings = API;
})(typeof self !== 'undefined' ? self : this);
