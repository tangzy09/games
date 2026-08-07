// ════════════════════════════════════════
// test-settings.js —— 设置持久化的门禁（P2b Task 4）。
//
// ⭐⭐ 本文件存在的唯一理由是 snake 踩过的那个坑（games/snake/js/storage.js:12-15）：
//    **闭合对象的新字段没写进 defaults ⇒ 用户的显式选择存得进去、读不回来。**
//    表现是「我明明关了，刷新一下又开着」——零报错、零异常，只有用户会发现。
//    ⇒ 这里把它钉成两条会红的断言：
//      ① 显式 false → 换一个「新会话」重新 attach 同一份后端 → **`=== false`**（⛔ 不是「假值」：
//         字段被 merge 丢掉时读到的是 `undefined`，那也是假值，用 `!x` 判会**恒绿**）；
//      ② 未知 key 一律**抛**（把静默变成响的）——字段从 defaults 里拿掉之后，
//         UI 那句 `C4Settings.toggle('threatHints')` 会当场炸，E2E 的零 console error 也跟着红。
// ⚠ 与「开放 map 要保持空默认」方向**相反**，别记混（settings 是闭合对象）。
// ════════════════════════════════════════
const assert = require('assert');
const S = require('../js/settings.js');

/** 假后端：只是一个字符串桶（真后端是 engine/platform.js 的 Platform.storage）。
 *  ⚠ `store` 是**共享**的：「刷新页面」= 拿同一个 store 造一个新门面重新 attach。
 *  ⛔ 别做成拷贝一份（第一版就是拷贝的，于是「再开回去」那一步写进了另一个桶，
 *     断言红了却不是被测代码的错）。 */
function fakeBackend(store) {
  const m = store || {};
  return {
    map: m,
    get(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    set(k, v) { m[k] = String(v); }
  };
}
const KEY = 'c4_settings';

// ─────────── ① 默认值：新手默认**开** ───────────
{
  assert.strictEqual(S.DEFAULTS.threatHints, true,
    'DESIGN §6.4：威胁高亮「可开关，新手默认开」——默认关等于这功能没做');
  assert.strictEqual(S.defaults().threatHints, true);
  assert.notStrictEqual(S.defaults(), S.defaults(), 'defaults() 必须每次给新对象（⛔ 别共享常量）');
  assert.ok(Object.isFrozen(S.DEFAULTS), 'DEFAULTS 必须冻结');
  assert.deepStrictEqual(S.KEYS.slice(),
    ['threatHints', 'reduceMotion', 'comfort', 'handicap', 'kids', 'faceToFace', 'timed',
     'bestAcc', 'bestAccN',
     'games', 'wins', 'winsNoHint', 'brilliants', 'lessonsMask',
     'tagUnder', 'tagMissFork', 'tagOffCenter', 'tagParity', 'lastAdAt']);
  console.log('test-settings: 默认 threatHints=true（新手默认开）OK');
}

// ─────────── ①c ⭐ P2c Task 1：让子（DESIGN §6.7）───────────
// ⚠ 判据全部取**非默认值**方向（本文件 ②b 那条实锤：默认值方向的断言在持久化坏掉时照样绿）。
{
  assert.strictEqual(S.DEFAULTS.handicap, 0,
    '让子默认 0：它改的是**规则**，⛔ 绝不许替没提要求的人改掉一局棋的胜负条件');
  assert.deepStrictEqual(S.ENUMS.handicap.slice(), [0, 1, 2],
    '⭐ 让子是 0/1/2 三档的**数字枚举**（§6.7：预置 1-2 枚子）');
  // cycle：0 → 1 → 2 → 0
  S.attach(fakeBackend(), KEY);
  assert.strictEqual(S.cycle('handicap'), 1);
  assert.strictEqual(S.cycle('handicap'), 2);
  assert.strictEqual(S.cycle('handicap'), 0, 'cycle 必须能**回到**不让子');
  // ⭐ 数字枚举同样要有校验：typeof 是 number、范围也对，但 1.5 会让 HANDICAP_COLS[1.5]
  //   变成 undefined ⇒ 开局炸在别处（追不回这里）。
  assert.throws(() => S.set('handicap', 3), /只能是/, '枚举外的数字必须抛');
  assert.throws(() => S.set('handicap', 1.5), /只能是/,
    '⭐ 1.5 的 typeof 完全合法、范围也对 —— 只有枚举校验拦得住');
  assert.throws(() => S.set('handicap', '2'), /类型/, '字符串 "2" 必须抛（存进去之后到处都是隐式转换）');
  assert.strictEqual(S.parse('{"handicap":1.5}').handicap, 0, '存档里的脏值 ⇒ 退回默认');
  assert.strictEqual(S.parse('{"handicap":2}').handicap, 2, '反向对照：合法值必须原样读回（否则上一条恒绿）');
  // ⭐⭐ 持久化：两个**非默认**档各走一遍「写 → 刷新 → 读回」
  for (const v of [1, 2]) {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    S.set('handicap', v);
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('handicap'), v,
      '⭐ handicap=' + v + ' 没活过一次刷新（十有八九是字段没进 defaults）');
  }
  console.log('test-settings: ⭐ 让子档位（0/1/2 枚举 + cycle + 脏值退默认 + 持久化）OK');
}

// ─────────── ①d ⭐ P2c Task 2：儿童档（DESIGN §6.7）───────────
{
  assert.strictEqual(S.DEFAULTS.kids, false,
    '儿童档默认关：它改的是「这一局怎么开」（锁档位 + 孩子恒先手），⛔ 不许替没提要求的人开');
  assert.strictEqual(typeof S.DEFAULTS.kids, 'boolean',
    '儿童档是**布尔**不是三态：要么是儿童档、要么不是，中间没有「跟随系统」');
  assert.throws(() => S.set('kids', 'yes'), /类型/, '字符串必须抛（存进去之后到处是隐式转换）');
  assert.throws(() => S.set('kids', 1), /类型/);
  // ⭐⭐ 持久化：只走**非默认**方向（true）—— 写 true → 刷新 → 读回仍是 true。
  //   ⛔ 别反过来断言「刷新后仍是 false」：那在字段根本没进 defaults 时照样绿。
  {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    assert.strictEqual(S.toggle('kids'), true);
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('kids'), true,
      '⭐ kids=true 没活过一次刷新（十有八九是字段没进 defaults）');
  }
  assert.strictEqual(S.parse('{"kids":true}').kids, true, '合法值必须原样读回');
  assert.strictEqual(S.parse('{"kids":"true"}').kids, false, '存档里的脏类型 ⇒ 退回默认');
  console.log('test-settings: ⭐ 儿童档（默认关 + 布尔校验 + 持久化）OK');
}

// ─────────── ①e ⭐ P2c Task 3：对坐模式（DESIGN §6.7）───────────
{
  assert.strictEqual(S.DEFAULTS.faceToFace, false,
    '对坐模式默认关：它改的是界面版面（要从棋盘身上收走 64 px），⛔ 不许替没提要求的人改');
  assert.strictEqual(typeof S.DEFAULTS.faceToFace, 'boolean',
    '对坐模式是**布尔**：要么两人对坐、要么不是，中间没有第三档');
  assert.throws(() => S.set('faceToFace', 'yes'), /类型/);
  assert.throws(() => S.set('faceToFace', 1), /类型/);
  // ⭐⭐ 持久化只走**非默认**方向（true）—— ⛔ 别反过来断言「刷新后仍是 false」：
  //   那在字段根本没进 defaults 时照样绿（本文件 ②b 那条实锤）。
  {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    assert.strictEqual(S.toggle('faceToFace'), true);
    assert.strictEqual(JSON.parse(store[KEY]).faceToFace, true, '必须立刻落盘');
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('faceToFace'), true,
      '⭐ faceToFace=true 没活过一次刷新（十有八九是字段没进 defaults）');
  }
  assert.strictEqual(S.parse('{"faceToFace":true}').faceToFace, true, '合法值原样读回');
  assert.strictEqual(S.parse('{"faceToFace":"true"}').faceToFace, false, '脏类型 ⇒ 退回默认');
  console.log('test-settings: ⭐ 对坐模式（默认关 + 布尔校验 + 持久化）OK');
}

// ─────────── ①g ⭐ P3 Task 6：最高精准度纪录（DESIGN §4）───────────
// ⚠ 它是**跨局的玩家纪录**，放设置这一侧 ⇒ ⛔ 不必 bump SAVE_VERSION。
{
  assert.strictEqual(S.DEFAULTS.bestAcc, 0, '默认没有纪录');
  assert.strictEqual(S.DEFAULTS.bestAccN, 0, '默认打过 0 局');
  assert.throws(() => S.set('bestAcc', 'x'), /类型/);
  // ⭐⭐ 持久化只走**非默认**方向（⛔ 别断言「刷新后仍是 0」——字段没进 defaults 时那条照样绿）
  {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    S.set('bestAcc', 91); S.set('bestAccN', 3);
    assert.strictEqual(JSON.parse(store[KEY]).bestAcc, 91, '必须立刻落盘');
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('bestAcc'), 91, '⭐⭐ 纪录没活过一次刷新（十有八九是字段没进 defaults）');
    assert.strictEqual(S.get('bestAccN'), 3);
  }
  // ⭐ 「0 是合法纪录」与「还没有纪录」必须分得开 —— 判据是 bestAccN，⛔ 不是 bestAcc > 0
  {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    S.set('bestAcc', 0); S.set('bestAccN', 1);
    S.attach(fakeBackend(store), KEY);
    assert.strictEqual(S.get('bestAcc'), 0);
    assert.strictEqual(S.get('bestAccN'), 1,
      '⭐ 打过一局但精准度 0 ⇒ bestAccN=1 ⇒ 有纪录（⛔ 用 bestAcc>0 判会说成「还没打过」）');
  }
  console.log('test-settings: ①g ⭐ 最高精准度纪录（默认 0 / 持久化非默认方向 / 0 与「没纪录」分得开）OK');
}

// ─────────── ①f ⭐⭐ P2c Task 5：限时模式（DESIGN §6.10）───────────
// ⚠⚠ 这一格的「默认关」比前面几条都硬：§6.10 白纸黑字写着「**绝不能是默认** —— 休闲玩家
//   讨厌计时」，而且它是唯一一条**会替玩家在盘上落子**的设置。
{
  assert.strictEqual(S.DEFAULTS.timed, false,
    '⛔⛔ DESIGN §6.10：「⚠ **绝不能是默认** —— 休闲玩家讨厌计时」。'
    + '而且它是唯一一条会**替玩家落子**的设置，默认开 = 开箱就有人替你下棋');
  assert.strictEqual(S.defaults().timed, false, 'defaults() 每次给的新对象里也必须是 false');
  assert.strictEqual(S.parse(null).timed, false, '干净存档 ⇒ 关');
  assert.strictEqual(S.parse('{}').timed, false, '老存档缺字段 ⇒ 关（⛔ 不许「缺了当开」）');
  assert.strictEqual(typeof S.DEFAULTS.timed, 'boolean',
    '限时是**布尔**：10 秒那个数是产品数值（C4Clock.TURN_MS），⛔ 不做成秒数枚举');
  assert.throws(() => S.set('timed', 'yes'), /类型/);
  assert.throws(() => S.set('timed', 1), /类型/);
  // ⭐⭐ 持久化只走**非默认**方向（true）。⛔ 别反过来断言「刷新后仍是 false」——
  //   本文件 ②b 那条实锤：字段根本没进 defaults 时，默认值方向的断言**照样绿**。
  {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    assert.strictEqual(S.toggle('timed'), true);
    assert.strictEqual(JSON.parse(store[KEY]).timed, true, '必须立刻落盘');
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('timed'), true,
      '⭐⭐ timed=true 没活过一次刷新（十有八九是字段没进 defaults）');
    assert.ok(Object.prototype.hasOwnProperty.call(S.all(), 'timed'),
      '⭐ 字段本身必须还在（被 merge 丢掉时它会整个消失，读到 undefined —— 而 `!undefined` 也是真）');
    // 再关回去也要活过刷新（⛔ 别只测一个方向）
    S.set('timed', false);
    S.attach(fakeBackend(store), KEY);
    assert.strictEqual(S.get('timed'), false);
  }
  assert.strictEqual(S.parse('{"timed":true}').timed, true, '合法值必须原样读回');
  assert.strictEqual(S.parse('{"timed":"true"}').timed, false, '存档里的脏类型 ⇒ 退回默认（关）');
  console.log('test-settings: ⭐⭐ 限时模式（⛔ 默认关 + 布尔校验 + 非默认方向的持久化）OK');
}

// ─────────── ①b ⭐ P2b Task 6：减弱动态（三态）+ 舒适模式（DESIGN §6.8）───────────
{
  assert.strictEqual(S.DEFAULTS.reduceMotion, 'auto',
    '§6.8：减弱动态默认**跟随系统** —— 系统里已经勾了「减弱动态」的人不该还要来这里再勾一次');
  assert.strictEqual(S.DEFAULTS.comfort, false,
    '舒适模式默认关：它改的是版面尺寸，⛔ 不该替没提要求的人改掉界面');
  assert.deepStrictEqual(S.ENUMS.reduceMotion.slice(), ['auto', 'on', 'off'],
    '⭐ 三态就是这三个值（⛔ 做成布尔的话「跟随系统」与「强制关」会压成同一个值）');

  // ⭐⭐ 真值表逐格钉死（纯函数 ⇒ node 里就能测完，⛔ 不用起浏览器）
  assert.strictEqual(S.motionReduced('on', false), true, '强制开：系统说不用也得减');
  assert.strictEqual(S.motionReduced('on', true), true);
  assert.strictEqual(S.motionReduced('off', true), false,
    '⭐ 强制关：**系统说要减、这里仍然不减** —— 这一格就是「三态不是布尔」的全部理由');
  assert.strictEqual(S.motionReduced('off', false), false);
  assert.strictEqual(S.motionReduced('auto', true), true, '跟随系统：系统要减 ⇒ 减');
  assert.strictEqual(S.motionReduced('auto', false), false, '跟随系统：系统没要求 ⇒ 不减');
  assert.strictEqual(S.motionReduced('zzz', true), true,
    '⚠ 认不出的值一律**跟随系统**：坏存档不该把无障碍偏好静默变成「强制关」');

  // cycle：点一下换一档，绕一圈回到原点
  S.attach(fakeBackend(), KEY);
  assert.strictEqual(S.cycle('reduceMotion'), 'on');
  assert.strictEqual(S.cycle('reduceMotion'), 'off');
  assert.strictEqual(S.cycle('reduceMotion'), 'auto', 'cycle 必须能**回到**跟随系统');
  assert.throws(() => S.cycle('comfort'), /不是枚举项/, 'cycle 只对枚举项有意义');

  // ⭐ 枚举校验：类型合法但取值非法必须**抛**（⛔ 光靠 typeof 挡不住 —— 那会让
  //   「强制关」被静默降级成「跟随系统」，零报错）
  assert.throws(() => S.set('reduceMotion', 'yes'), /只能是/,
    '⭐ 枚举外的字符串必须抛（typeof 完全合法，只有枚举校验拦得住）');
  assert.deepStrictEqual(S.parse('{"reduceMotion":"yes"}').reduceMotion, 'auto',
    '存档里的脏枚举值 ⇒ 退回默认');
  assert.deepStrictEqual(S.parse('{"reduceMotion":"off"}').reduceMotion, 'off',
    '反向对照：合法枚举值必须原样读回来（否则上一条恒绿）');
  console.log('test-settings: ⭐ 减弱动态三态（真值表 + cycle + 枚举校验）OK');
}

// ─────────── ②b ⭐⭐ 新字段的持久化：判据一律取**非默认值**那个方向 ───────────
// ⚠ T4 实锤：「开→刷新仍是开」在持久化坏掉时**照样绿**（默认值恰好就是开）。
//   ⇒ 三态的每一档都要单独走一遍「写 → 换新会话 → 读回来」，且每次都断言 `=== 那一档`。
{
  for (const v of ['on', 'off', 'auto']) {
    const store = {};
    S.attach(fakeBackend(store), KEY);
    S.set('reduceMotion', v);
    S.attach(fakeBackend(store), KEY);                  // 「刷新页面」
    assert.strictEqual(S.get('reduceMotion'), v,
      '⭐ reduceMotion="' + v + '" 没活过一次刷新（十有八九是字段没进 defaults）');
    assert.ok(Object.prototype.hasOwnProperty.call(S.all(), 'reduceMotion'),
      '⭐ 字段本身必须还在（被 merge 丢掉时它会整个消失，读到 undefined）');
  }
  const store2 = {};
  S.attach(fakeBackend(store2), KEY);
  S.set('comfort', true);                               // ⚠ **非默认值**方向
  assert.strictEqual(JSON.parse(store2[KEY]).comfort, true, 'comfort 必须立刻落盘');
  S.attach(fakeBackend(store2), KEY);
  assert.strictEqual(S.get('comfort'), true,
    '⭐ comfort=true 没活过一次刷新（判据是 `=== true`，⛔ 不是「真值」）');
  console.log('test-settings: ⭐⭐ 三态每一档 + comfort=true 都活过「刷新」OK');
}

// ─────────── ② ⭐⭐ 「显式关掉 → 下次启动仍然是关的」（snake 那个坑的回归）───────────
{
  const store = {};
  S.attach(fakeBackend(store), KEY);
  assert.strictEqual(S.get('threatHints'), true, '干净后端应给默认值');
  S.set('threatHints', false);
  assert.ok(store[KEY] && store[KEY].indexOf('false') > 0, '关掉之后必须**立刻**落盘：' + store[KEY]);

  // 「刷新页面」= 同一个 store 造一个新门面重新 attach（模块内存被重置）
  S.attach(fakeBackend(store), KEY);
  assert.strictEqual(S.get('threatHints'), false,
    '⭐⭐ 刷新后用户的显式选择丢了 —— 十有八九是字段没进 defaults（merge 只拷 defaults 里的 key）');
  assert.strictEqual(S.all().threatHints, false, 'all() 里也必须是 false（⛔ 不是 undefined）');
  assert.ok(Object.prototype.hasOwnProperty.call(S.all(), 'threatHints'),
    '⭐ 字段本身必须还在（被 merge 丢掉时它会整个消失，而 `!undefined` 恰好也是 true ⇒ 断言恒绿）');

  // 再开回去也要活过一次刷新（⛔ 别只测一个方向）
  S.set('threatHints', true);
  assert.strictEqual(JSON.parse(store[KEY]).threatHints, true, '开回去也要立刻落盘');
  S.attach(fakeBackend(store), KEY);
  assert.strictEqual(S.get('threatHints'), true);
  console.log('test-settings: ⭐⭐ 关→刷新仍是关、开→刷新仍是开 OK');
}

// ─────────── ③ 未知 key 必须**抛**（闭合集合） ───────────
{
  S.attach(fakeBackend(), KEY);
  assert.throws(() => S.get('nope'), /未知设置项/, 'get 未知 key 必须抛');
  assert.throws(() => S.set('nope', 1), /未知设置项/, 'set 未知 key 必须抛');
  assert.throws(() => S.get('v'), /未知设置项/, '版本号不是设置项');
  assert.throws(() => S.set('threatHints', 'yes'), /类型/, '类型不符必须抛（⛔ 别硬转）');
  console.log('test-settings: 未知 key / 错类型一律抛（把静默变成响的）OK');
}

// ─────────── ④ 坏存档 / 老存档 / 脏字段 ───────────
{
  assert.deepStrictEqual(S.parse(null), S.defaults(), 'null → 默认');
  assert.deepStrictEqual(S.parse('}{'), S.defaults(), '坏 JSON → 默认（⛔ 不许抛）');
  assert.deepStrictEqual(S.parse('[1,2]'), S.defaults(), '数组 → 默认');
  assert.deepStrictEqual(S.parse('{}'), S.defaults(), '老存档缺字段 → 补默认');
  assert.deepStrictEqual(S.parse('{"threatHints":"x"}'), S.defaults(), '类型不符 → 退回默认');
  const p = S.parse('{"threatHints":false,"zombie":42,"v":99}');
  assert.strictEqual(p.threatHints, false);
  assert.strictEqual(p.v, S.SETTINGS_V, '版本号由模块说了算（⛔ 别信存档里的）');
  assert.ok(!('zombie' in p), '存档里的陈年字段不许复活');
  console.log('test-settings: 坏/老/脏存档一律收敛到合法设置 OK');
}

// ─────────── ⑤ 没接后端也不许炸（node 门禁 / 沙箱路径）───────────
{
  S.attach(null, '');
  assert.strictEqual(S.get('threatHints'), true);
  S.set('threatHints', false);                       // 只在内存里，落盘静默跳过
  assert.strictEqual(S.get('threatHints'), false);
  S.reset();
  assert.strictEqual(S.get('threatHints'), true);
  // 后端抛错也不许弄死一局游戏
  const angry = { get() { throw new Error('boom'); }, set() { throw new Error('boom'); } };
  S.attach(angry, KEY);
  assert.deepStrictEqual(S.all(), S.defaults(), '后端读抛错 ⇒ 退回默认');
  S.set('threatHints', false);                       // 写抛错被吞
  assert.strictEqual(S.get('threatHints'), false, '写失败也不该影响本次会话的内存值');
  console.log('test-settings: 无后端 / 后端抛错都不炸 OK');
}

// ─────────── ⑥ all() 是副本，toggle 会落盘 ───────────
{
  const be = fakeBackend();
  S.attach(be, KEY);
  const a = S.all(); a.threatHints = false;
  assert.strictEqual(S.get('threatHints'), true, 'all() 必须是副本（⛔ 别把内部对象交出去）');
  assert.strictEqual(S.toggle('threatHints'), false);
  assert.strictEqual(JSON.parse(be.map[KEY]).threatHints, false, 'toggle 之后必须已落盘');
  console.log('test-settings: all() 是副本 / toggle 立刻落盘 OK');
}

console.log('test-settings: 全部通过');
