// storage.js — 版本化存档(注入式后端,双导出)
// 后端 = { get(k)→string|null, set(k,v) };浏览器用引擎 Platform.storage(先 hydrate)。
// 注意命名:浏览器里各 <script> 共享全局词法环境,core.js 已声明 PRNG_,这里必须换名
const PRNG_S_ = (typeof module !== 'undefined' && module.exports)
  ? require('../../../engine/prng.js') : PRNG;

const SAVE_V = 4;   // v2: daily;v3: gallery.stars;v4: 当局快照加 dirQueue(转向缓冲)

function defaults() {
  return {
    v: SAVE_V,
    // reduceMotion:null=跟随系统,true/false=用户显式选择。必须在 defaults 里,否则 merge
    // 只拷 default 的 key(见下),用户的显式选择会在重载时被丢掉(减弱动态偏好不持久)。
    settings: { theme: 'cloud', reduceMotion: null },
    // ⚠ stars 是「开放 map」(动态 key=图片名),默认值必须保持空对象 {}(见 merge 注释)
    gallery: { unlocked: [], imgPos: 0, stars: {} },  // unlocked: 图片文件名列表;stars: {文件名:1-3}
    daily: { lastGiftDay: '', giftStreak: 0 },       // 每日天使礼物:领取日(YYYY-MM-DD)+ 连续天数
    ach: { unlocked: [] },
    stats: {                                          // 累计计数(成就引擎消费)
      // ⚠️ specials/skinClears 是「开放 map」(动态 key):默认值必须保持空对象 {},
      //    merge 对空对象整体透传;塞了非空默认就会退回逐 key 递归、丢掉存档动态 key
      apples: 0, specials: {}, cellsRevealed: 0, steps: 0,
      deaths: 0, shieldSaves: 0, levelsCleared: 0, levelsStarted: 0,
      totalScore: 0, noDeathClears: 0, speedClears: 0, aiClears: 0,
      revives: 0, meteorsCaught: 0, ghostPassed: 0, setsDone: 0,
      playtimeMs: 0, langSwitched: 0, skinClears: {},
      distinctImgs: 0,                                // 不同图张数(=gallery.unlocked.length,img 族用)
      levelsSinceAd: 0,                               // 距上次插屏的过关数(P3a,每 2 关一插屏)
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
  // ⚠️ 开放 map(specials/skinClears/…)整体透传——判据是「defaults 里是空对象」。
  // 这些字段的默认值必须保持空对象;若未来给它塞非空默认,会退回下面的逐 key 递归、
  // 重新丢掉存档里的动态 key(P2b 审查 Critical 复发)。新增开放 map 时也照此保持 {}。
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
  if (!Array.isArray(st.dirQueue)) st.dirQueue = [];    // 旧快照无 dirQueue,补默认(否则 step shift 崩)
  return { state: st, imgPos: snap.imgPos, gameMs: snap.gameMs };
}

const Storage = { SAVE_V, defaults, load, save, snapshotRun, restoreRun };
if (typeof module !== 'undefined' && module.exports) module.exports = Storage;
