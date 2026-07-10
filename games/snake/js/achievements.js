// achievements.js — 成就引擎(纯逻辑,双导出,零内部依赖)
// 数据驱动:100 个累计成就由 20 个「阶梯族」定义展开;20 个单局成就由每关 tracker 判定。

// 累计成就:20 族 → 100 个(阈值与名字严格对应设计 §6.2)
const FAMILIES = [
  { id: 'img',    counter: 'levelsCleared', tiers: [1, 5, 10, 25, 50, 75, 100, 200, 350, 500] },
  { id: 'set',    counter: 'setsDone',      tiers: [1, 3, 5, 10, 15, 25] },
  { id: 'games',  counter: 'levelsStarted', tiers: [10, 50, 100, 500, 1000] },
  { id: 'score',  counter: 'totalScore',    tiers: [10000, 100000, 500000, 1000000, 5000000] },
  { id: 'apple',  counter: 'apples',        tiers: [100, 500, 1000, 5000, 10000] },
  // 12 特殊果 ×2 档:常见 50/500,稀有(gold/meteor/scissors)20/100
  { id: 'f_twin',     counter: 'specials.twin',     tiers: [50, 500] },
  { id: 'f_feather',  counter: 'specials.feather',  tiers: [50, 500] },
  { id: 'f_cloud',    counter: 'specials.cloud',    tiers: [50, 500] },
  { id: 'f_halo',     counter: 'specials.halo',     tiers: [50, 500] },
  { id: 'f_demon',    counter: 'specials.demon',    tiers: [50, 500] },
  { id: 'f_heart',    counter: 'specials.heart',    tiers: [50, 500] },
  { id: 'f_magnet',   counter: 'specials.magnet',   tiers: [50, 500] },
  { id: 'f_trail',    counter: 'specials.trail',    tiers: [50, 500] },
  { id: 'f_gift',     counter: 'specials.gift',     tiers: [50, 500] },
  { id: 'f_gold',     counter: 'specials.gold',     tiers: [20, 100] },
  { id: 'f_meteor',   counter: 'specials.meteor',   tiers: [20, 100] },
  { id: 'f_scissors', counter: 'specials.scissors', tiers: [20, 100] },
  { id: 'cell',   counter: 'cellsRevealed', tiers: [1000, 10000, 50000, 128000] },
  { id: 'dist',   counter: 'steps',         tiers: [10000, 100000, 500000, 1000000] },
  { id: 'death',  counter: 'deaths',        tiers: [1, 10, 100, 1000] },
  { id: 'save',   counter: 'shieldSaves',   tiers: [1, 10, 100] },
  { id: 'noD',    counter: 'noDeathClears', tiers: [1, 10, 50] },
  { id: 'fast',   counter: 'speedClears',   tiers: [1, 10, 50] },
  { id: 'aic',    counter: 'aiClears',      tiers: [1, 10, 100] },
  { id: 'rev',    counter: 'revives',       tiers: [1, 10] },
  { id: 'cmb',    counter: 'maxCombo',      tiers: [10, 30, 50] },
  { id: 'len',    counter: 'maxLen',        tiers: [50, 100, 150] },
  { id: 'day',    counter: 'streakDays',    tiers: [3, 7, 30, 100] },
  { id: 'time',   counter: 'playtimeMs',    tiers: [3600000, 36000000, 180000000], div: 3600000 },   // UI 按小时折算显示
  // 4 皮肤各通关 1 次(P2c 皮肤上线前 counter 恒 0,先定义)
  { id: 'sk_cloud',  counter: 'skinClears.cloud',   tiers: [1] },
  { id: 'sk_star',   counter: 'skinClears.star',    tiers: [1] },
  { id: 'sk_candy',  counter: 'skinClears.candy',   tiers: [1] },
  { id: 'sk_heaven', counter: 'skinClears.heaven',  tiers: [1] },
  { id: 'lang',   counter: 'langSwitched',  tiers: [1] },
  { id: 'day5',   counter: 'day5Done',      tiers: [1] },
];
// 展开数恰 100:10+6+5+5+5+(9*2+3*2)+4+4+4+3+3+3+3+2+3+3+4+3+(4*1)+1+1 = 100

const CUM_DEFS = [];
for (const fam of FAMILIES) {
  fam.tiers.forEach((threshold, i) => {
    CUM_DEFS.push({ id: `${fam.id}_${i + 1}`, counter: fam.counter, threshold,
                    family: fam.id, tier: i + 1, div: fam.div || 1 });
  });
}
if (CUM_DEFS.length !== 100) {
  throw new Error(`achievements.js: CUM_DEFS 展开数应为 100,实际 ${CUM_DEFS.length}`);
}

// 20 个单局成就(tracker 判定,见 newTracker/onStep/onLevelClear)
const RUN_ACHS = [
  { id: 'r_score1',  check: t => t.scoreGained >= 1000 },
  { id: 'r_score2',  check: t => t.scoreGained >= 5000 },
  { id: 'r_speed3',  check: t => t.clearMs - t.startMs < 180000 },
  { id: 'r_speed2',  check: t => t.clearMs - t.startMs < 120000 },
  { id: 'r_perfect', check: t => t.deathsInLevel === 0 },
  { id: 'r_naked',   check: t => t.deathsInLevel === 0 && t.survEaten === 0 },
  { id: 'r_vegan',   check: t => t.kindsEaten.size === 0 },
  { id: 'r_feast',   check: t => t.kindsEaten.size >= 8 },
  { id: 'r_combo20', check: t => t.comboMax >= 20 },
  { id: 'r_combo50', check: t => t.comboMax >= 50 },
  { id: 'r_len50',   check: t => t.lenMax >= 50 },
  { id: 'r_len100',  check: t => t.lenMax >= 100 },
  { id: 'r_demon3',  check: t => t.demonMax >= 3 },
  { id: 'r_meteor2', check: t => t.meteorsCaught >= 2 },
  { id: 'r_magnet4', check: t => t.magnetMax >= 4 },
  { id: 'r_twinfast',check: t => t.twinFast },
  { id: 'r_ghost5',  check: t => t.ghostPassMax >= 5 },
  { id: 'r_clutch',  check: t => t.clutch },
  { id: 'r_edge',    check: t => t.edgeDone },
  { id: 'r_lastbite',check: t => t.lastBite },
];

// 存活/护体类特殊果(用于 r_naked 的 survEaten 计数)
const SURV_TYPES = { cloud: 1, scissors: 1, halo: 1, heart: 1 };
// 判定窗口(ms)
const DEMON_WIN_MS = 5000, MAGNET_WIN_MS = 8000, TWIN_WIN_MS = 10000, CLUTCH_WIN_MS = 30000;
const BOARD_MAX = 15;   // 16×16 棋盘边界(0..15)——edge 判定用

function newTracker(gameMs, aiRun) {
  return {
    startMs: gameMs, clearMs: null, aiRun: !!aiRun,
    scoreGained: 0, deathsInLevel: 0,
    kindsEaten: new Set(), survEaten: 0,
    comboMax: 0, lenMax: 0,
    meteorsCaught: 0, ghostPassMax: 0, ghostRun: 0,
    magnetMax: 0, demonMax: 0,
    demonWinStart: null, demonWinEats: 0,
    magnetWinStart: null, magnetWinEats: 0,
    twinFast: false, twinBatches: {},
    shieldAt: null, clutch: false,
    ring: 0, edgeDone: false, lastBite: false,
  };
}

// 每 tick 调:更新 tracker(读 events + runState)。
function onStep(t, run, events, gameMs) {
  const combo = (run && run.combo) || 0;
  const len = (run && run.snake && run.snake.length) || 0;
  if (combo > t.comboMax) t.comboMax = combo;
  if (len > t.lenMax) t.lenMax = len;

  let hadLevel = false, hadBite = false;
  for (const e of (events || [])) {
    if (e.t === 'apple' || e.t === 'extra' || e.t === 'special') {
      hadBite = true;
      if (e.t === 'special') {
        t.kindsEaten.add(e.type);
        if (SURV_TYPES[e.type]) t.survEaten++;
      }
      if (t.demonWinStart !== null && gameMs < t.demonWinStart + DEMON_WIN_MS) {
        t.demonWinEats++;
        if (t.demonWinEats > t.demonMax) t.demonMax = t.demonWinEats;
      }
      if (t.magnetWinStart !== null && gameMs < t.magnetWinStart + MAGNET_WIN_MS) {
        t.magnetWinEats++;
        if (t.magnetWinEats > t.magnetMax) t.magnetMax = t.magnetWinEats;
      }
    }
    if (e.t === 'special' && e.type === 'demon') { t.demonWinStart = gameMs; t.demonWinEats = 0; }
    if (e.t === 'special' && e.type === 'magnet') { t.magnetWinStart = gameMs; t.magnetWinEats = 0; }
    if (e.t === 'special' && e.type === 'halo') { t.ghostRun = 0; }
    if (e.t === 'meteorCatch') t.meteorsCaught++;
    if (e.t === 'ghostPass') {
      t.ghostRun++;
      if (t.ghostRun > t.ghostPassMax) t.ghostPassMax = t.ghostRun;
    }
    if (e.t === 'twinSpawn') { t.twinBatches[e.batch] = { at: e.at, left: 2 }; }
    if (e.t === 'extra' && t.twinBatches[e.batch]) {
      const b = t.twinBatches[e.batch];
      b.left--;
      if (b.left === 0 && gameMs - b.at <= TWIN_WIN_MS) t.twinFast = true;
    }
    if (e.t === 'shield') t.shieldAt = gameMs;
    if (e.t === 'level') hadLevel = true;
    if (e.t === 'death') t.deathsInLevel++;
  }
  if (hadLevel) {
    t.clutch = t.shieldAt !== null && gameMs - t.shieldAt <= CLUTCH_WIN_MS;
    if (hadBite) t.lastBite = true;
  }
  // halo 结束(effects.ghostUntil < gameMs)后 ghostRun 清 0;非 ghostPass 步不清零
  if (run && run.effects && run.effects.ghostUntil < gameMs) t.ghostRun = 0;
  // 边圈:头在最外圈连续计数,60 步(16×16 周长)= 整圈
  const head = run && run.snake && run.snake[0];
  if (head) {
    const onEdge = head.x === 0 || head.y === 0 || head.x === BOARD_MAX || head.y === BOARD_MAX;
    t.ring = onEdge ? t.ring + 1 : 0;
    if (t.ring >= 60) t.edgeDone = true;
  }
}

// 每关(揭满)调一次:判定单局成就(AI 局不判)+ 更新 save.stats 的过关类计数。
function onLevelClear(t, save, gameMs, extra) {
  extra = extra || {};
  const aiRun = !!extra.aiRun;
  t.clearMs = gameMs;

  save.stats.levelsCleared++;
  if (aiRun) {
    save.stats.aiClears++;
  } else {
    if (t.deathsInLevel === 0) save.stats.noDeathClears++;
    if (gameMs - t.startMs < 180000) save.stats.speedClears++;
  }

  // 日期系列:相邻天 streak+1,断档回 1;当日通关数≥5 → day5Done
  const today = new Date().toDateString();
  if (save.stats.lastPlayDay !== today) {
    const prevTime = save.stats.lastPlayDay ? new Date(save.stats.lastPlayDay).getTime() : null;
    const isAdjacent = prevTime != null && (new Date(today).getTime() - prevTime) === 86400000;
    save.stats.streakDays = isAdjacent ? save.stats.streakDays + 1 : 1;
    save.stats.lastPlayDay = today;
  }
  if (save.stats.dayClearsDate !== today) { save.stats.dayClearsDate = today; save.stats.dayClears = 0; }
  save.stats.dayClears++;
  if (save.stats.dayClears >= 5) save.stats.day5Done = 1;

  const unlocked = [];
  if (!aiRun) {
    const got = new Set(save.ach.unlocked);
    for (const def of RUN_ACHS) {
      if (got.has(def.id)) continue;
      if (def.check(t)) { save.ach.unlocked.push(def.id); got.add(def.id); unlocked.push(def.id); }
    }
  }
  return { unlocked };
}

// 每 tick 调:累计计数(apples/specials/steps/cells/deaths/shieldSaves/meteorsCaught/
// ghostPassed/totalScore);纪录类(maxCombo/maxLen)仅 !aiRun 时刷新。
function accumulate(save, run, events, ctx) {
  ctx = ctx || {};
  const aiRun = !!ctx.aiRun;
  const scoreDelta = ctx.scoreDelta || 0;
  const revealDelta = ctx.revealDelta || 0;
  const dtMs = ctx.dtMs || 0;

  save.stats.steps++;
  save.stats.cellsRevealed += revealDelta;
  save.stats.totalScore += scoreDelta;
  save.stats.playtimeMs += dtMs;

  for (const e of (events || [])) {
    if (e.t === 'apple') save.stats.apples++;         // 'extra' 与 'apple' 同步触发,只记一次
    else if (e.t === 'special') save.stats.specials[e.type] = (save.stats.specials[e.type] || 0) + 1;
    else if (e.t === 'shield') save.stats.shieldSaves++;
    else if (e.t === 'meteorCatch') save.stats.meteorsCaught++;
    else if (e.t === 'ghostPass') save.stats.ghostPassed++;
    else if (e.t === 'death') save.stats.deaths++;
  }

  if (!aiRun) {
    const combo = (run && run.combo) || 0;
    const len = (run && run.snake && run.snake.length) || 0;
    if (combo > save.stats.maxCombo) save.stats.maxCombo = combo;
    if (len > save.stats.maxLen) save.stats.maxLen = len;
  }
}

// 扫累计族,新过阈值的入 save.ach.unlocked
function checkCum(save) {
  const got = new Set(save.ach.unlocked);
  const unlocked = [];
  for (const def of CUM_DEFS) {
    if (got.has(def.id)) continue;
    const v = getCounter(save, def.counter);
    if (v >= def.threshold) {
      save.ach.unlocked.push(def.id);
      got.add(def.id);
      unlocked.push(def.id);
    }
  }
  return { unlocked };
}

// 'specials.gold' 点路径取数
function getCounter(save, path) {
  const parts = path.split('.');
  let v = save.stats;
  for (const p of parts) {
    if (v == null) return 0;
    v = v[p];
  }
  return v || 0;
}

function tierInfo(id) {
  for (const def of CUM_DEFS) {
    if (def.id === id) return { threshold: def.threshold, counter: def.counter, div: def.div || 1 };
  }
  return null;
}

const ALL_IDS = CUM_DEFS.map(d => d.id).concat(RUN_ACHS.map(d => d.id));

const Ach = {
  FAMILIES, CUM_DEFS, RUN_ACHS, ALL_IDS,
  newTracker, onStep, onLevelClear, accumulate, checkCum, getCounter, tierInfo,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Ach;
