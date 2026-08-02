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
  assert.deepStrictEqual(S.KEYS.slice(), ['threatHints']);
  console.log('test-settings: 默认 threatHints=true（新手默认开）OK');
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
