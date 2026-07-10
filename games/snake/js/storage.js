// storage.js — 版本化存档(注入式后端,双导出)
// 后端 = { get(k)→string|null, set(k,v) };浏览器用引擎 Platform.storage(先 hydrate)。
// 注意命名:浏览器里各 <script> 共享全局词法环境,core.js 已声明 PRNG_,这里必须换名
const PRNG_S_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SAVE_V = 1;

function defaults() {
  return {
    v: SAVE_V,
    settings: { theme: 'cloud' },
    gallery: { unlocked: [], imgPos: 0 },            // unlocked: 图片文件名列表(P2c 消费)
    ach: { unlocked: [] },
    stats: {                                          // 累计计数(成就引擎消费)
      apples: 0, specials: {}, cellsRevealed: 0, steps: 0,
      deaths: 0, shieldSaves: 0, levelsCleared: 0, levelsStarted: 0,
      totalScore: 0, noDeathClears: 0, speedClears: 0, aiClears: 0,
      revives: 0, meteorsCaught: 0, ghostPassed: 0, setsDone: 0,
      playtimeMs: 0, langSwitched: 0, skinClears: {},
      maxCombo: 0, maxLen: 0,                         // 历史纪录(AI 局不刷)
      lastPlayDay: '', streakDays: 0, dayClears: 0, dayClearsDate: '',
      day5Done: 0,
    },
    run: null,                                        // 当局快照(可续玩)
  };
}

// 保守合并:default 里有而 saved 缺 → 补;类型不符 → 用 default
function merge(def, saved) {
  if (saved == null || typeof saved !== 'object') return def;
  // 开放 map(defaults 里是空对象,如 specials/skinClears)整体透传——
  // 否则「只遍历 default 的 key」会把已累计的动态 key 全部清掉(P2b 审查 Critical)
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
  const s = merge(defaults(), parsed);
  s.v = SAVE_V;
  return s;
}

function save(backend, key, s) {
  try { backend.set(key, JSON.stringify(s)); } catch (e) {}
}

// 当局快照:core state 里除 rand(函数)外全部可 JSON 化;revealed 转普通数组
function snapshotRun(state, imgPos, gameMs) {
  const { rand, revealed, ...rest } = state;
  return {
    imgPos, gameMs, seed2: Math.floor(Math.random() * 2147483647),
    state: { ...JSON.parse(JSON.stringify(rest)), revealed: Array.from(revealed) },
  };
}
// 恢复:重建 Uint8Array 与新 rand(续玩换新种子不影响公平性——揭图进度/蛇/分数才是要保的)
function restoreRun(snap) {
  const st = JSON.parse(JSON.stringify(snap.state));
  st.revealed = new Uint8Array(st.revealed);
  st.rand = PRNG_S_.create(snap.seed2 || 1);
  if (st.lastEatMs == null) st.lastEatMs = -Infinity;   // JSON 把 -Infinity 变 null,回填防连击断档
  return { state: st, imgPos: snap.imgPos, gameMs: snap.gameMs };
}

const Storage = { SAVE_V, defaults, load, save, snapshotRun, restoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
