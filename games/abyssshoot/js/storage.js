// storage.js — 版本化存档(注入式后端,双导出)
// 后端 = { get(k)→string|null, set(k,v) };浏览器用引擎 Platform.storage(键须先 hydrate)。
// ⚠ 命名:浏览器里各 <script> 共享全局词法环境,core.js 已声明 PRNG_/TILES_,这里必须换名。
const PRNG_S_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SAVE_V = 1;
const COLS = 5;   // 形状校验用(与 core 的默认一致)

function defaults() {
  return {
    v: SAVE_V,
    best: { score: 0, maxTile: 0 },
    codex: { seen: [] },              // 见过的鱼(值的数组,升序);「见过即解锁」
    stats: {
      // ⚠ fishSeenCount 是「开放 map」(动态 key = 鱼的值):默认必须保持空对象 {}。
      //   merge 对空对象整体透传;塞了非空默认就会退回逐 key 递归、每次 load 清空动态 key
      //   (snake 的 Critical 事故,勿重蹈)。以后新增开放 map 字段也照此保持 {}。
      fishSeenCount: {},
      runs: 0, shots: 0, merges: 0, escapes: 0,
    },
    run: null,                        // 当局快照(可续玩)
  };
}

// 保守合并:default 里有而 saved 缺 → 补;类型不符 → 用 default
function merge(def, saved) {
  if (saved == null || typeof saved !== 'object') return def;
  // ⚠ 开放 map 整体透传——判据是「defaults 里是空对象」。见上方注释。
  if (!Array.isArray(def) && Object.keys(def).length === 0)
    return (saved && typeof saved === 'object' && !Array.isArray(saved)) ? { ...saved } : def;
  const out = Array.isArray(def) ? saved : { ...def };
  if (!Array.isArray(def)) {
    for (const k of Object.keys(def)) {
      const dv = def[k], sv = saved[k];
      if (sv === undefined) continue;
      out[k] = (dv !== null && typeof dv === 'object' && !Array.isArray(dv))
        ? merge(dv, sv)
        : (Array.isArray(dv) ? (Array.isArray(sv) ? sv : dv) : sv);
    }
  }
  return out;
}

function load(backend, key) {
  let raw = null;
  try { raw = backend.get(key); } catch (e) {}
  if (!raw) return defaults();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return defaults(); }
  // 版本门控:不匹配一律整份丢弃,绝不迁移(root CLAUDE.md 铁律)
  if (!parsed || parsed.v !== SAVE_V) return defaults();
  const s = merge(defaults(), parsed);
  s.v = SAVE_V;
  return s;
}

function save(backend, key, s) {
  try { backend.set(key, JSON.stringify(s)); } catch (e) {}
}

// 当局快照:core state 里除 rand(函数)外全部可 JSON 化。
// 续玩换新种子(seed2)——弹药是从盘面抽样的,换种子不影响公平;盘面/分数/图鉴才是要保的。
function snapshotRun(s) {
  return {
    v: SAVE_V,
    board: JSON.parse(JSON.stringify(s.board)),
    cols: s.cols, rows: s.rows,
    ammo: s.ammo, queue: s.queue.slice(),
    score: s.score, maxTile: s.maxTile,
    shots: s.shots, shotsSinceSpawn: s.shotsSinceSpawn,
    seed2: Math.floor(Math.random() * 2147483647),   // 唯一允许用 Math.random 的地方(不在 core 里)
  };
}

// 恢复:形状不对一律返回 null(调用方丢弃重开)。
// ⚠ 畸形快照恢复成 0×0 盘面 = 无报错白屏,全新档案的 E2E 测不出来(root CLAUDE.md 铁律)。
function restoreRun(snap) {
  if (!snap || typeof snap !== 'object') return null;
  if (snap.v !== SAVE_V) return null;
  if (!Array.isArray(snap.board) || snap.board.length !== (snap.cols || COLS)) return null;
  if (!snap.board.every(col => Array.isArray(col) && col.every(v => v > 0))) return null;
  if (!(snap.rows > 0) || !Array.isArray(snap.queue)) return null;
  return {
    cols: snap.cols || COLS, rows: snap.rows,
    seed: snap.seed2 || 1,
    rand: PRNG_S_.create(snap.seed2 || 1),
    board: JSON.parse(JSON.stringify(snap.board)),
    score: snap.score || 0, maxTile: snap.maxTile || 0,
    shots: snap.shots || 0, shotsSinceSpawn: snap.shotsSinceSpawn || 0,
    dead: false, events: [],
    ammo: snap.ammo, queue: snap.queue.slice(),
  };
}

const Storage = { SAVE_V, defaults, merge, load, save, snapshotRun, restoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
