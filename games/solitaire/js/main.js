// ════════════════════════════════════════
// main.js — boot / 状态 G / 走子 / 撤销 / 提示 / autoplay / 纸牌瀑布 / 存档。
// ════════════════════════════════════════
'use strict';

// ⚠ 必须显式挂 window：脚本顶层的 const 不会成为 window 的属性（blockblast 实踩）
const G = window.G = {
  phase: 'PLAY',           // INTRO | PLAY | FAIR | MENU | STATS | SHOP
  seenIntro: 0,            // 首启一屏只出一次
  s: null,                 // core 状态
  drag: null,
  pending: null,
  sel: null,               // tap-to-move 的选中
  hintMove: null,
  fourColor: false,        // 四色牌（无障碍）
  bigText: false,
  comfort: false,          // 舒适模式：四色+大字+放宽点击判定（65+ 主力人群一键开）
  reduceFx: false,         // 减弱动态：跳过瀑布/滑牌/浮字（晕动症/前庭敏感用户）
  difficulty: 'any',       // 发牌难度（'any'|'easy'|'hard'，池按盲打 AI 分档）——下一局生效
  noAds: false,
  tAcc: 0,                 // 本局用时（ms，只累计两步操作间 ≤30s 的间隔——挂机不算）
  tLast: 0,
  dailyHist: {},           // 每日挑战史 {YYYYMMDD: 1=来打过 2=赢了}（日历/连续天数用，只留最近 60 条）
  badges: {},              // 每日挑战月度奖牌 {YYYYMM: 'gold'|'silver'|'bronze'|'none'}（永久）
  ach: {},                 // 已解锁成就 {id:1}
  lastWinCoins: 0,         // 上一次赢局发的金币（结算屏礼包按它 ×3 保底 80）
  winDoubled: false,       // 本局的结算礼包领过了（一局一次）
  lastWinAdCoins: 0,       // 结算礼包实际发了多少币（结算屏显示，别让玩家猜）
  freePick: 0,             // 手上有一张「任选一款外观免费解锁」券（看广告得，1 次/天）
  angels: 0,               // 天使图鉴解锁数（顺序固定,只存计数;赢+1/每日赢+2/看广告+3）
  lastAngelGain: 0,        // 本次赢局解锁了几张（结算屏显示）
  galPage: 0,              // 图鉴当前页
  galView: null,           // 图鉴大图查看中的索引（null=网格）
  shopTab: 'back',         // 收藏页当前签（back|table|fx —— 牌背 19 款后单页放不下了）
  spiderSuits: 1,          // Spider 花色档 1/2/4（新手默认 1 花色——4 花色人类胜率 <10%）
  lesson: 0,               // 正在上的课（0=不在教学中）
  lessonNeed: 0,           // 这一课还差几步赢（由 solver 证明）
  lessonsDone: {},         // 已完成的课 {id:1}
  diffLv: 1,               // ⭐ 难度阶梯 1..5（明面进度,代替原来的三个下拉项）
  diffBest: 1,             // 打通过的最高档
  brilliant: 0,            // 本局妙手数（走出盲打 AI 打分最高的那步）
  insight: {},             // 「我的弱点」计数器 {move 类型: 次数}
  spWarnUntil: 0,          // 「先填满空列」提示期间高亮空列
  achPage: 0,              // 成就页当前页（18 项后单页放不下）
  jokers: 0,               // 🃏 万能牌数量（本局有效,看广告获得,上限 3;Klondike 专属救场）
  jokerOffer: 0,           // 「拿万能牌」入口的展示截止时间戳（卡死检测/死局判定时点亮）
  comboN: 0,               // 连击收牌计数（4s 窗口）
  comboAt: 0,
  stage: 1,                // ⭐ 连关:第 N 关(倍率 = min(stage,5));NEW/DAILY 重置,NEXT_STAGE 递增
  runScore: 0,             // 本轮连关累计分(结算分 = s.score × 倍率 逐关累加)
  lastStageScore: 0,
  dayScore: 0,             // 🏆 每日锦标赛当日累计分(确定性对手场,零后端)
  dayId: '',
  xp: 0,                   // 玩家经验(= 历史累计得分) → 等级/称号
  avatarFile: null,        // 头像 = 图鉴里选中的天使(未选用 ⭐)
  // ⚠ 双口径（DESIGN §4.5）：无限撤销会把总胜率架空 ⇒ 不分开记，统计就是假的
  stats: { played: 0, won: 0, cleanWon: 0, streak: 0, bestStreak: 0 },
  dailyDone: '',           // 今天的每日挑战完成了没（YYYYMMDD）
  dailyAI: null,           // 今天这局盲打 AI 的战绩 {seed, won, moves}（确定性,不存档,进每日时现算）
  toast: null,             // 轻提示 {msg, until}（分享复制成功等）
};

const K_RUN = () => CFG.key('run');
const K_STATS = () => CFG.key('stats');
const K_OPT = () => CFG.key('opts');

// ── 存档：只存 seed + drawCount + move list（不是盘面快照！）──
function saveRun() {
  try {
    const s = G.s;
    Platform.storage.set(K_RUN(), JSON.stringify({
      v: Core.SAVE_VERSION, seed: s.seed, drawCount: s.drawCount, moves: s.moves,
      usedUndo: s.usedUndo, usedHint: s.usedHint, tAcc: G.tAcc, jokers: G.jokers,
    }));
  } catch (e) {}
}
function loadRun() {
  try {
    const raw = Platform.storage.get(K_RUN());
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== Core.SAVE_VERSION || !Array.isArray(d.moves)) return null;
    const s = Core.replay(d.seed, d.drawCount, d.moves);   // ⭐ 重放恢复（撤销栈天然还在）
    if (!s) return null;
    s.usedUndo = !!d.usedUndo; s.usedHint = !!d.usedHint;
    if (s.won) return null;
    G.tAcc = d.tAcc || 0;                                  // 本局用时跟着存档走
    G.jokers = d.jokers || 0;                              // 🃏 也跟着（本局资产）
    return s;
  } catch (e) { return null; }
}
const clearRun = () => { try { Platform.storage.set(K_RUN(), ''); } catch (e) {} };
const saveStats = () => { try { Platform.storage.set(K_STATS(), JSON.stringify(G.stats)); } catch (e) {} };

const todayId = () => {
  const d = new Date();
  return '' + d.getFullYear() + (d.getMonth() + 1) + d.getDate();
};
const saveOpts = () => {
  try {
    Platform.storage.set(K_OPT(), JSON.stringify({
      fourColor: G.fourColor, bigText: G.bigText, comfort: G.comfort, reduceFx: G.reduceFx,
      difficulty: G.difficulty, dailyDone: G.dailyDone, dailyHist: G.dailyHist,
      badges: G.badges, ach: G.ach, angels: G.angels, seenIntro: G.seenIntro,
      spiderSuits: G.spiderSuits, diffLv: G.diffLv, diffBest: G.diffBest, insight: G.insight,
      ads: G.ads, freePick: G.freePick,
      lessonsDone: G.lessonsDone,
      stage: G.stage, runScore: G.runScore, dayScore: G.dayScore, dayId: G.dayId,
      xp: G.xp, avatarFile: G.avatarFile,
    }));
  } catch (e) {}
};

function newGame(drawCount, mode) {
  const md = mode || (G.s ? G.s.mode : 'klondike');
  // ⭐ Klondike：只发**已验证可解**的牌局（池里取）。
  //    FreeCell：**不需要池** —— 本来就 ~100% 可解（32000 局里只有 #11982 无解），
  //    直接用微软局号随机取一个（这样玩家可以对照经典局号）。
  // ⭐ 首 3 局必发 easy 池（盲打 AI 都能赢的局）：首次会话有没有赢过一局强烈预测 D1 留存。
  //   之后回到玩家自选难度。
  // 阶梯决定「翻几张 + 从哪个池发牌」；首 3 局仍强制 easy（D1 留存）
  const lad = diffAt(G.diffLv);
  const wantDiff = G.stats.played < 3 ? 'easy' : lad.pool;
  // ⚠ draw 必须在**套用阶梯默认值之后**再定：先算 draw 再改 drawCount = 阶梯的翻牌数永远不生效
  //   （「换一局」走的正是这条无参路径，改良包 E2E 抓出来的）
  const draw = drawCount || (md === 'klondike' ? lad.draw : (G.s ? G.s.drawCount : 3));
  // ⚠ Spider **不进可解池**（104 张状态空间远超 solver 能力；DESIGN 明说它兑现不了「已验证可解」）
  const pooled = (md === 'freecell' || md === 'spider') ? null : Pool.pick(draw, wantDiff);
  const seed = md === 'freecell'
    ? (1 + Math.floor(Math.random() * 32000))
    : (pooled != null ? pooled : Deal.randomSeed());
  // Spider 的 drawCount 位复用成花色档（1/2/4）
  G.s = Core.newGame(seed, md === 'spider' ? (G.spiderSuits || 1) : draw, md);
  // 换局 = 放弃了上一局 ⇒ 连胜断（没打完就换，不能算赢）
  if (G.s && !G.s.won && G.s.moves.length > 0) G.stats.streak = 0;
  // 蜜月期结束的那一盘把横幅亮出来（前 30 盘连横幅都没有 —— 首因效应和评分关键期）
  if (G.noAds && !Money.noAds && !Money.adFree(G.stats.played + 1)) {
    G.noAds = false;
    Ads.showBanner();
  }
  G.dailySeed = null;
  G.drag = G.pending = G.sel = G.hintMove = null;
  G.tAcc = 0; G.tLast = Date.now();
  G.jokers = 0; G.jokerOffer = 0;             // 🃏 是本局资产,换局清零
  G.comboN = 0; G.brilliant = 0;
  G.lesson = 0; G.lessonNeed = 0; G.lessonBase = 0;   // 普通局 ⇒ 退出教学态
  G.hintWant = false; G.hintWin = false; G.peekUntil = 0;
  Prover.reset();
  Snd.deal();                                 // 洗牌声
  G.stats.played++;
  saveStats();
  FX.reset();
  clearRun();
  renderAll();
  dealAnim();                                 // 发牌飞入（reduceFx 自动跳过）
}

/** 发牌飞入动画：整副牌从牌堆位置逐张飞到位（暗牌以牌背飞行,不泄底）*/
function dealAnim() {
  if (G.reduceFx) return;
  const s = G.s;
  const L = Layout.L;
  const from = s.mode === 'freecell'
    ? { x: L.cx - L.cardW / 2, y: -L.cardH }             // FreeCell 无牌堆,从顶部中央撒下
    : Layout.cardXY(s, { p: 'stock' });
  let k = 0;
  for (let i = 0; ; i++) {                               // 行优先 = 真实发牌顺序
    let dealt = false;
    for (let ti = 0; ti < s.tableau.length; ti++) {
      const col = s.tableau[ti];
      if (i >= col.cards.length) continue;
      dealt = true;
      const up = i >= col.cards.length - col.up;
      const to = Layout.cardXY(s, { p: 't', ti, i });
      FX.slide([col.cards[i]], from.x, from.y, to.x, to.y, k * 0.022, { back: !up });
      k++;
    }
    if (!dealt) break;
  }
}

// ── 走子 ──
/**
 * ⭐ 走一步 + **滑牌动画**。
 *
 * ⚠ 顺序是死的：**源坐标必须在 apply 之前取**（牌还在原位），
 *   **目标坐标必须在 apply 之后取**（牌已到位、列的 offset 也已重算）。
 *   搞反了牌就会从错误的地方飞出来 —— 而且不会报错，只是看着诡异。
 */
function moveAnim(m, before) {
  const s = G.s;
  const L = Layout.L;
  let ids = [], from = null, to = null;

  if (m.t === 'draw') {
    // 翻牌：只飞**最上面那张**（waste 是水平扇形的，多张各自位置不同，全飞反而乱）
    if (!s.waste.length) return;
    ids = [s.waste[s.waste.length - 1]];
    from = Layout.cardXY(before, { p: 'stock' });
    to = Layout.cardXY(s, { p: 'w' });
  } else if (m.t === 'recycle') {
    return;                                   // 回收：整堆搬回去，不演（演了反而乱）
  } else if (m.t === 'tt') {
    const col = before.tableau[m.ti];
    ids = col.cards.slice(m.idx);
    from = Layout.cardXY(before, { p: 't', ti: m.ti, i: m.idx });
    to = Layout.cardXY(s, { p: 't', ti: m.tj, i: s.tableau[m.tj].cards.length - ids.length });
  } else if (m.t === 'tf') {
    const col = before.tableau[m.ti];
    ids = [col.cards[col.cards.length - 1]];
    from = Layout.cardXY(before, { p: 't', ti: m.ti, i: col.cards.length - 1 });
    to = Layout.cardXY(s, { p: 'f', fi: m.fi });
  } else if (m.t === 'wf') {
    ids = [before.waste[before.waste.length - 1]];
    from = Layout.cardXY(before, { p: 'w' });
    to = Layout.cardXY(s, { p: 'f', fi: m.fi });
  } else if (m.t === 'wt') {
    ids = [before.waste[before.waste.length - 1]];
    from = Layout.cardXY(before, { p: 'w' });
    to = Layout.cardXY(s, { p: 't', ti: m.ti, i: s.tableau[m.ti].cards.length - 1 });
  } else if (m.t === 'tc') {
    const col = before.tableau[m.ti];
    ids = [col.cards[col.cards.length - 1]];
    from = Layout.cardXY(before, { p: 't', ti: m.ti, i: col.cards.length - 1 });
    to = Layout.cardXY(s, { p: 'c', ci: m.ci });
  } else if (m.t === 'ct') {
    ids = [before.free[m.ci]];
    from = Layout.cardXY(before, { p: 'c', ci: m.ci });
    to = Layout.cardXY(s, { p: 't', ti: m.tj, i: s.tableau[m.tj].cards.length - 1 });
  } else if (m.t === 'cf') {
    ids = [before.free[m.ci]];
    from = Layout.cardXY(before, { p: 'c', ci: m.ci });
    to = Layout.cardXY(s, { p: 'f', fi: m.fi });
  } else if (m.t === 'jk') {
    // 🃏 被召唤的牌从它原来的位置飞向 foundation
    const id = s.foundations[m.fi][s.foundations[m.fi].length - 1];
    ids = [id];
    to = Layout.cardXY(s, { p: 'f', fi: m.fi });
    from = null;
    for (let ti = 0; ti < before.tableau.length && !from; ti++) {
      const idx = before.tableau[ti].cards.indexOf(id);
      if (idx >= 0) from = Layout.cardXY(before, { p: 't', ti, i: idx });
    }
    if (!from && before.waste.indexOf(id) >= 0) from = Layout.cardXY(before, { p: 'w' });
    if (!from) from = Layout.cardXY(before, { p: 'stock' });
  }
  if (ids.length && from && to && ids.every(id => id != null)) {
    FX.slide(ids, from.x, from.y, to.x, to.y);
  }
  void L;
}

/** 走子前的浅快照（只要坐标算得出来的那部分）*/
const snapshot = s => ({
  drawCount: s.drawCount,
  tableau: s.tableau.map(c => ({ cards: c.cards.slice(), up: c.up })),
  waste: s.waste.slice(),
  free: s.free ? s.free.slice() : null,
  foundations: s.foundations.map(f => f.slice()),
});

/** 计时：只累计两步操作之间 ≤30s 的间隔（放下手机去倒茶不算用时）*/
function tick() {
  const now = Date.now();
  if (G.tLast) G.tAcc += Math.min(now - G.tLast, 30000);
  G.tLast = now;
}

function doMove(m) {
  const before = snapshot(G.s);             // ⚠ 必须在 apply 之前
  // ⭐ 妙手判定也必须在 apply **之前**：这时 G.s 还是走之前的局面。
  //   判据 = 这一步正好是盲打 AI 打分最高的那步（scoreMove 是纯函数，零额外开销）。
  //   ⚠ 只对 Klondike 判：FreeCell 全明牌靠规划、Spider 的 AI 打分口径不适用。
  let wasBest = false;
  if (G.s.mode === 'klondike' && m.t !== 'draw' && m.t !== 'recycle') {
    try {
      const cand = RulesK.legalMoves(G.s).filter(x => x.t !== 'draw' && x.t !== 'recycle');
      if (cand.length > 1) {
        let bv = -Infinity, bm = null;
        for (const c of cand) {
          const v = AIBlind.scoreMove(G.s, c);
          if (v > bv) { bv = v; bm = c; }
        }
        wasBest = !!bm && JSON.stringify(bm) === JSON.stringify(m);
      }
    } catch (e) {}
  }
  const ev = Core.apply(G.s, m);
  if (!ev) { Snd.nope(); return false; }     // 非法落点：一声轻的低音，不惩罚玩家
  tick();
  if (wasBest) {                            // ✨ 即时正反馈（不打断，只是一个浮字）
    G.brilliant++;
    FX.float('✨', Layout.L.cx, Layout.L.tabY - 6, '#ffd84d');
  }
  moveAnim(m, before);                      // ⚠ 必须在 apply 之后（目标坐标才对）
  // 浮动加分（结算感）：收牌 +10，翻暗牌 +5 —— 和 core 的计分一致
  for (const e of ev) {
    if (e.t === 'toFoundation') {
      const p = Layout.cardXY(G.s, { p: 'f', fi: e.fi });
      FX.float('+10', p.x + Layout.L.cardW / 2, p.y + Layout.L.cardH / 2);
    } else if (e.t === 'flip') {
      const p = Layout.cardXY(G.s, { p: 't', ti: e.ti, i: G.s.tableau[e.ti].cards.length - 1 });
      FX.float('+5', p.x + Layout.L.cardW / 2, p.y, '#7ef2a0');
    }
  }
  // 声音按**动作**分（纸牌的质感全在这里；此前全程静音）
  if (m.t === 'draw' || m.t === 'recycle') Snd.draw();
  else if (m.t === 'tf' || m.t === 'wf' || m.t === 'cf' || m.t === 'jk') {
    // ⭐ 连击：4s 窗口内连续收 foundation ⇒ 音阶上扬 + ×N 浮字（正反馈要越滚越爽）
    const now = Date.now();
    G.comboN = now - G.comboAt < 4000 ? G.comboN + 1 : 1;
    G.comboAt = now;
    if (G.comboN >= 2) {
      Snd.combo(G.comboN);
      const fe = ev.find(e => e.t === 'toFoundation');
      if (fe) {
        const p = Layout.cardXY(G.s, { p: 'f', fi: fe.fi });
        // 浮字也跟着连击数升级（声音在爬、字不动 = 一半的爽感白丢）
        const hot = G.comboN >= 7, mid = G.comboN >= 4;
        FX.float((hot ? '🔥×' : mid ? '✨×' : '×') + G.comboN,
                 p.x + Layout.L.cardW / 2, p.y - 6,
                 hot ? '#ff4d4d' : mid ? '#ffd84d' : '#ff9d3d');
      }
      if (G.comboN >= 5 && G.comboN % 5 === 0) {   // 每 5 连给一次金币（把手感换成实得）
        Money.state.coins += 5; Money.save();
        FX.float('+5', Layout.L.cx, Layout.L.tabY - 22, '#ffd84d');
      }
    } else {
      Snd.found(G.s.foundations.reduce((a, f) => a + f.length, 0) % 8);
    }
  }
  else if (m.t === 'tt' && ev.some(e => e.n > 1)) Snd.run(ev[0].n);
  else Snd.place();
  G.sel = null; G.hintMove = null;
  Prover.reset();      // ⚠ 局面变了，旧的「还有解」结论立刻作废（留着它 = 撒谎）
  if (ev.some(e => e.t === 'win')) onWin();
  else saveRun();
  renderAll();
  return true;
}

/** ⭐ 赢局 → 纸牌瀑布（产品的心脏） */
function onWin() {
  const s = G.s;
  // ⭐ 教学局:赢了只记「这一课学会了」——**必须在任何统计之前 return**。
  //   教学局是 solver 替玩家走到「差 N 步」的局面,把它计进胜率/连胜/锦标赛 = 战绩是假的。
  if (G.lesson) {
    G.lessonsDone = G.lessonsDone || {};
    G.lessonsDone[G.lesson] = 1;
    saveOpts(); clearRun();
    return;
  }
  const clean = !s.usedUndo && !s.usedHint && !s.usedJoker;
  G.stats.won++;
  if (clean) G.stats.cleanWon++;                 // 双口径：零撤销零提示才算「clean」
  G.stats.streak = (G.stats.streak || 0) + 1;
  G.stats.bestStreak = Math.max(G.stats.bestStreak || 0, G.stats.streak);
  tick();
  // 最快胜局（速通玩家的口径；0 或异常小的用时不记 —— 恢复的旧档 tAcc 可能缺失）
  if (G.tAcc > 3000 && (!G.stats.bestTime || G.tAcc < G.stats.bestTime)) G.stats.bestTime = G.tAcc;
  saveStats();
  clearRun();

  if (s.mode === 'freecell') G.stats.fcWon = (G.stats.fcWon || 0) + 1;
  if (s.mode === 'spider') G.stats.spWon = (G.stats.spWon || 0) + 1;
  G.stats.brilliantAll = (G.stats.brilliantAll || 0) + (G.brilliant || 0);   // ✨ 妙手累计
  // ⭐ 连关结算:本关得分 × 倍率(min(stage,5)) 计入本轮/当日锦标赛/XP
  const mult = Math.min(G.stage, 5);
  G.lastStageScore = s.score * mult;
  G.runScore += G.lastStageScore;
  ensureDay();
  G.dayScore += G.lastStageScore;
  G.xp = (G.xp || 0) + G.lastStageScore;
  G.lastWinCoins = Money.earnWin(clean);         // 金币（只能换外观，换不到任何优势）
  G.winDoubled = false;
  // 👼 天使图鉴：赢一局 +1，每日挑战赢局再 +2（500 张的长线收集；集组奖励见 gainAngels）
  G.lastAngelGain = gainAngels(1 + (G.dailySeed === s.seed ? 2 : 0));
  if (G.dailySeed === s.seed) {
    G.dailyDone = todayId();
    G.stats.dailyWon = (G.stats.dailyWon || 0) + 1;
    G.dailyHist = G.dailyHist || {};
    G.dailyHist[todayId()] = 2;                  // 2 = 赢了（1 = 只是来打过）
    const ks = Object.keys(G.dailyHist);
    if (ks.length > 60) ks.sort().slice(0, ks.length - 60).forEach(k => delete G.dailyHist[k]);
    saveOpts();
  }
  checkAchievements();

  // ⛔ 插屏**只在赢局后**出，**输局永远不出**（刚输完还甩一脸广告是本品类最招恨的做法）。
  //    节奏：前 30 盘蜜月零广告 + 之后距上次 ≥4 盘冷却（Money.AD_*，2026-07-31 拍板）。
  const showAd = Money.canShowInterstitial(G.stats.played);
  Money.noteWin(showAd, G.stats.played);
  if (showAd) setTimeout(() => Ads.showInterstitial().finally(() => renderAll()), 1800);  // 让瀑布先跑

  // 减弱动态：跳过瀑布，直接进结算（瀑布是产品的心脏，但晕动症用户的舒适优先）
  if (!G.reduceFx) {
    const L = Layout.L;
    const cards = [];
    for (let r = 12; r >= 0; r--) {              // K 先飞
      for (let fi = 0; fi < 4; fi++) {
        cards.push({ id: r * 4 + fi, x: L.foundX(fi), y: L.topY });
      }
    }
    FX.startCascade(cards);
  }
  Snd.win();
}

/** 切屏 + 过场淡出：把当前画面快照交给 FX 盖在上面淡出（reduceFx 自动跳过）*/
function goPhase(p) {
  if (!G.reduceFx && G.phase !== p) {
    try {
      const cv = document.getElementById(CFG.canvasId);
      const snap = document.createElement('canvas');
      snap.width = cv.width; snap.height = cv.height;
      snap.getContext('2d').drawImage(cv, 0, 0);
      FX.transition(snap);
    } catch (e) {}
  }
  G.phase = p;
}

// ── 预设对手（伪排行榜:零后端、按 seed 确定性,全球看到同一组分数）──
// ⚠ 头像用**天使画像的序号**（render 的 drawAvatar 去取图），不是人物 emoji ——
//   一来跟图鉴/主视觉同一套世界观，二来一眼看出榜上是**游戏角色不是真人玩家**（伪社交红线）。
const RIVALS = [
  { name: 'Mia', av: 12,  lo: 120, hi: 300 },
  { name: 'Leo', av: 87,  lo: 100, hi: 260 },
  { name: 'Sam', av: 203, lo: 60,  hi: 200 },
  { name: 'Ava', av: 341, lo: 140, hi: 340 },
];
/** 本局四位对手的分数（seed 确定性 ⇒ 可复现、可跟朋友对同一局的榜）*/
function rivalScores(seed) {
  return RIVALS.map((r, i) => {
    let a = (seed ^ Math.imul(i + 1, 2654435761)) >>> 0;
    a = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    const f = ((a >>> 8) % 1000) / 1000;
    return { name: r.name, av: r.av, score: Math.round(r.lo + (r.hi - r.lo) * f) };
  });
}

// ── 交互 ──
function onTap(hit, cardHit) {
  const s = G.s;
  if (!hit) { G.sel = null; return renderAll(); }

  if (hit.action === 'STOCK') {
    if (s.mode === 'spider') {
      // ⚠ 「有空列不许发牌」不是死锁，但点了没反应 = 经典的「这是不是 bug」投诉
      //   ⇒ 必须给明确反馈（DESIGN §1.4）。
      if (!s.stock.length) {
        G.toast = { msg: T('sol.spNoStock'), until: Date.now() + 1800 };
        setTimeout(renderAll, 1900); return renderAll();
      }
      if (RulesS.hasEmptyCol(s)) {
        G.toast = { msg: T('sol.spFillFirst'), until: Date.now() + 2200 };
        G.spWarnUntil = Date.now() + 2200;      // 同时高亮空列
        setTimeout(renderAll, 2300); return renderAll();
      }
      doMove({ t: 'deal10' });
      return;
    }
    doMove(s.stock.length ? { t: 'draw' } : { t: 'recycle' });
    return;
  }

  // 双击 = 再点一下已选中的牌 ⇒ 自动送到可去的地方（foundation → 有牌的列 → 空列 → free cell）。
  // ⚠ 判据是「点的还是它」而不是两击间隔 —— 65+ 手抖用户吃不住 250ms 计时窗（DESIGN §7.5）。
  //   取消选中 = 点空白处（onTap 开头的 !hit 分支），不受影响。
  if (G.sel && sameAsSel(hit)) {
    const m = Core.autoDest(s, G.sel);
    if (m && doMove(m)) return;
    G.sel = null;                              // 没有可去的地方 ⇒ 当作取消选中
    return renderAll();
  }

  // 已有选中 ⇒ 这一下是「落点」
  if (G.sel) {
    const m = buildMove(G.sel, hit);
    if (m && doMove(m)) return;
    G.sel = null;
    return renderAll();
  }

  // 没有选中 ⇒ 这一下是「拿起」
  if (hit.action === 'CELL') {                 // FreeCell 的 free cell
    const ci = hit.data.ci;
    if (s.free[ci] == null) return renderAll();
    const auto = RulesF.legalMoves(s).find(m => m.t === 'cf' && m.ci === ci);
    if (auto && doMove(auto)) return;          // 先试自动收 foundation
    G.sel = { p: 'c', ci };
  } else if (hit.action === 'WASTE' && s.waste.length) {
    // ⭐ 单击 = 直接自动走牌（Klondike;先 foundation 再 tableau）——品类标准交互。
    //   FreeCell 保持「选中→落点」:那边是规划游戏,自动走会替玩家做致命决定。
    const auto = RulesK.legalMoves(s).find(m => m.t === 'wf');
    if (auto && doMove(auto)) return;
    if (s.mode !== 'freecell') {
      const am = Core.autoDest(s, { p: 'w' });
      if (am && doMove(am)) return;
    }
    G.sel = { p: 'w' };
  } else if (hit.action === 'FOUND') {
    // ⭐ 收到右上角的牌**还能拿回来**（'ft'）：收早了是纸牌最常见的失误，
    //   不给取回的话玩家只能一路撤销一大串（Klondike 专属 —— FreeCell 全明牌不需要，
    //   Spider 的完成组按规则本来就不能拆）。
    const fi = hit.data.fi;
    const f = s.foundations[fi];
    if (s.mode !== 'klondike' || !f || !f.length) return renderAll();
    const am = Core.autoDest(s, { p: 'f', fi });
    // ⚠ 只在「落到有牌的列」时才自动走：把 K 从 foundation 自动扔进空列几乎不是玩家想要的
    if (am && s.tableau[am.ti] && s.tableau[am.ti].cards.length && doMove(am)) return;
    G.sel = { p: 'f', fi };
  } else if (hit.action === 'TAB') {
    const { ti, idx } = hit.data;
    const col = s.tableau[ti];
    if (!col.cards.length) return;
    if (!Core.rules(s).isValidRun(s, ti, idx)) return;
    // 单击顶牌 ⇒ 先试送 foundation
    if (idx === col.cards.length - 1) {
      const auto = Core.rules(s).legalMoves(s).find(m => m.t === 'tf' && m.ti === ti);
      if (auto && doMove(auto)) return;
    }
    if (s.mode !== 'freecell') {
      const am = Core.autoDest(s, { p: 't', ti, idx });
      if (am && am.t !== 'tc' && doMove(am)) return;
    }
    G.sel = { p: 't', ti, idx };
  }
  renderAll();
}

/** 这一下点的就是当前选中的那张牌？（双击判定）*/
function sameAsSel(hit) {
  const sel = G.sel;
  if (hit.action === 'WASTE') return sel.p === 'w';
  if (hit.action === 'CELL') return sel.p === 'c' && hit.data.ci === sel.ci;
  if (hit.action === 'TAB') return sel.p === 't' && hit.data.ti === sel.ti && hit.data.idx === sel.idx;
  if (hit.action === 'FOUND') return sel.p === 'f' && hit.data.fi === sel.fi;
  return false;
}

/** 从「选中 + 落点」构造一个 move */
function buildMove(sel, hit) {
  const s = G.s;
  if (hit.action === 'FOUND') {
    const fi = hit.data.fi;
    if (sel.p === 'c') return { t: 'cf', ci: sel.ci, fi };        // free cell → foundation
    if (sel.p === 'w') return { t: 'wf', fi };
    const col = s.tableau[sel.ti];
    if (sel.idx === col.cards.length - 1) return { t: 'tf', ti: sel.ti, fi };
    return null;
  }
  if (hit.action === 'CELL') {                                     // → free cell（只收单张）
    const ci = hit.data.ci;
    if (s.free[ci] != null) return null;
    if (sel.p !== 't') return null;
    const col = s.tableau[sel.ti];
    if (sel.idx !== col.cards.length - 1) return null;             // 只有顶牌能进格子
    return { t: 'tc', ti: sel.ti, ci };
  }
  if (hit.action === 'TAB') {
    const tj = hit.data.ti;
    if (sel.p === 'f') return { t: 'ft', fi: sel.fi, ti: tj };     // ⭐ foundation → tableau（取回）
    if (sel.p === 'c') return { t: 'ct', ci: sel.ci, tj };         // free cell → tableau
    if (sel.p === 'w') return { t: 'wt', ti: tj };
    if (sel.ti === tj) return null;
    return { t: 'tt', ti: sel.ti, idx: sel.idx, tj };
  }
  return null;
}

function onDrop(drag, target, at) {
  const sel = drag.from === 'w' ? { p: 'w' } : { p: 't', ti: drag.from, idx: drag.idx };
  if (target) {
    const m = buildMove(sel, target);
    if (m && doMove(m)) return;
  }
  // ⭐ 吸附：松手点没压中目标（落在列缝/略偏）⇒ 按距离找最近的**合法**落点。
  //   手抖用户拖不准 —— 这比点击宽容度影响更大，跟舒适模式是同一批人（DESIGN §7.5）。
  if (at) {
    const L = Layout.L;
    let best = null, bd = Infinity;
    for (const mv of Core.destsFor(G.s, sel)) {
      let px, py = null;
      if (mv.t === 'tf' || mv.t === 'wf' || mv.t === 'cf') { px = L.foundX(mv.fi) + L.cardW / 2; py = L.topY + L.cardH / 2; }
      else if (mv.t === 'tc') { px = L.cellX(mv.ci) + L.cardW / 2; py = L.topY + L.cardH / 2; }
      else { px = L.colX(mv.t === 'wt' ? mv.ti : mv.tj) + L.cardW / 2; }
      if (py != null && Math.abs(at.y - py) > L.cardH * 1.2) continue;   // 顶排目标要求 y 也在附近
      const d = Math.abs(at.x - px) + (py != null ? Math.abs(at.y - py) * 0.5 : 0);
      if (d < bd) { bd = d; best = mv; }
    }
    if (best && bd < L.cardW * 1.6 && doMove(best)) return;
  }
  renderAll();
}

function dispatch(action, data) {
  const s = G.s;
  switch (action) {
    case 'NEW': G.stage = 1; G.runScore = 0; newGame(); break;
    // ⭐ 赢局后「下一关」:倍率递增的连关(分数滚雪球 —— 「再来一关」的钩子)
    case 'NEXT_STAGE': {
      if (!s.won) break;
      G.stage = Math.min(G.stage + 1, 99);
      newGame(s.drawCount, s.mode);
      break;
    }
    case 'JOKER_DISMISS': G.jokerOffer = 0; break;
    // 👤 把图鉴大图设为头像
    case 'SET_AVA': {
      if (G.galView != null && G.galView < G.angels) {
        G.avatarFile = Angels.fileAt(G.galView);
        saveOpts();
        G.toast = { msg: '👤 ✓', until: Date.now() + 1400 };
        setTimeout(renderAll, 1500);
      }
      break;
    }
    case 'MODE': {                             // 切玩法 = 换一局（玩法是开局前属性）
      // ⭐ 三合一轮转：Klondike → FreeCell → Spider → Klondike
      //   ⚠ 这是**旧入口**（E2E 与老习惯还在用）。玩家侧现在一律走 MODE_SET 直选，
      //     因为「轮转」在三个玩法上必然产生撒谎的按钮标签（见 MODE_SET 的注释）。
      const next = s.mode === 'klondike' ? 'freecell' : s.mode === 'freecell' ? 'spider' : 'klondike';
      setMode(next);
      break;
    }
    // ⭐ 直选玩法（2026-08-01）：三个玩法并排，点哪个是哪个。
    //   ⛔ 换掉的旧做法是「一个 chip 轮转」，而标签写的是二元三目
    //     （`当前是 FreeCell ? 显示 Klondike : 显示 FreeCell`）—— 三个玩法上必然对不上：
    //     在 FreeCell 里写着「Klondike」却跳去 Spider，在 Spider 里写着「FreeCell」却跳去 Klondike。
    //     **三态的东西不要用二元标签 + 轮转**，玩家点下去得到的必须就是标签上写的那个。
    case 'MODE_SET': {
      const m = data && data.m;
      if (!m || m === s.mode || !['klondike', 'freecell', 'spider'].includes(m)) break;
      setMode(m);
      break;
    }
    case 'FAIR': goPhase('FAIR'); break;
    case 'MENU': goPhase('MENU'); break;
    // 首启一屏（4.3(a) 防线）：看过一次就不再出现
    case 'INTRO_GO': G.phase = 'PLAY'; G.seenIntro = 1; saveOpts(); break;
    case 'INTRO_LESSON': G.seenIntro = 1; saveOpts(); dispatch('LESSON', { id: 1 }); break;
    case 'INTRO_FAIR': G.phase = 'FAIR'; G.seenIntro = 1; saveOpts(); break;
    case 'STATS': goPhase('STATS'); break;
    case 'ACH': goPhase('ACH'); break;
    // 👼 天使图鉴
    case 'GALLERY': goPhase('GALLERY'); G.galView = null; break;
    case 'GAL_PG': {
      G.galPage = Math.max(0, data && data.p != null ? data.p : 0);
      G.galView = null;
      Angels.dropCache();                      // 只缓存当前页（501 张全解码是几百 MB）
      break;
    }
    case 'GAL_VIEW': G.galView = data && data.i != null ? data.i : null; break;
    case 'GAL_CLOSE': G.galView = null; break;
    // 图鉴里看广告 +3 张（纯增益,激励视频的又一消耗端）
    case 'GAL_AD': {
      watchAd('gallery', () => gainAngels(AD_GIVE.gallery));
      break;
    }
    // 👼 大图存壁纸（snake 同款体验：Web Share 优先降级下载）
    case 'GAL_WALL': {
      if (G.galView != null && G.galView < G.angels) {
        Angels.saveWallpaper(Angels.fileAt(G.galView)).catch(() => {});
      }
      break;
    }
    // 🔥 补签：昨天没来、连续天数正要断 ⇒ 看广告补上（打卡记录不是玩法优势，不踩红线）
    case 'MAKEUP': {
      if (!canMakeup()) break;
      watchAd('makeup', () => {
        G.dailyHist[dayKeyAgo(1)] = 1;
        G.toast = { msg: '🔥 ' + T('sol.dailyStreak', { n: dailyStreakDays() }), until: Date.now() + 2200 };
        setTimeout(renderAll, 2300);
      });
      break;
    }
    // #️⃣ 局号直输（FreeCell 有 30 年的局号文化；Klondike 用自家 seed）——与分享链接闭环
    case 'ENTER_SEED': {
      const fc = s.mode === 'freecell';
      const v = parseInt(window.prompt(T('sol.enterSeedAsk')) || '', 10);
      if (!isFinite(v) || v < 1 || (fc && v > 32000) || v > 4294967295) break;
      G.s = Core.newGame(fc ? v : (v >>> 0), s.drawCount, s.mode);
      G.dailySeed = null;
      G.drag = G.sel = G.hintMove = null;
      G.tAcc = 0; G.tLast = Date.now();
      G.jokers = 0; G.jokerOffer = 0; G.comboN = 0;
      Prover.reset(); FX.reset(); clearRun();
      goPhase('PLAY');
      dealAnim();
      break;
    }
    case 'HELP': goPhase('HELP'); break;
    case 'ACH_PG': G.achPage = Math.max(0, data && data.p != null ? data.p : 0); break;
    // ▶ 演 3 步：prover 证明有解后，把解法的头 3 步慢速演给玩家看（强提示——演完整解=看戏）
    case 'DEMO3': {
      const mv = (Prover.st.solMoves || []).slice(0, 3);
      if (!mv.length) break;
      G.s.usedHint = true;                       // 演示 = 提示，零提示口径要留痕
      G.s.usedSolver = true;
      mv.forEach((m, i) => {
        const before = snapshot(G.s);
        if (!Core.apply(G.s, m)) return;
        const orig = FX.slide;
        FX.slide = (ids, x0, y0, x1, y1) => orig(ids, x0, y0, x1, y1, i * 0.4);
        moveAnim(m, before);
        FX.slide = orig;
      });
      tick(); Prover.reset(); saveRun();
      if (G.s.won) onWin();
      break;
    }
    // 🖼 赢局战绩图卡分享（支持 File share 时出图，否则降级为链接分享）
    case 'SHARE_CARD': {
      shareWinCard().catch(() => {});
      break;
    }
    // 🃏 万能牌:看广告获得(⚠ 红线口径:救场与 snake 的 AI 救场同类——提示/撤销/证明仍永远免费)
    case 'JOKER_AD': {
      if (s.mode === 'freecell' || G.jokers >= 3) break;
      watchAd('joker', () => {
        // ⭐ 救场要**真能救回来**：一次拉满 3 张 + 附送 30 秒透视。
        //   只给两张牌 = 用完还是卡死在同一个地方，体验比不给还差（skill §1 实锤）。
        G.jokers = Math.min(3, G.jokers + AD_GIVE.joker);
        G.peekUntil = Date.now() + AD_GIVE.peek;
        G.s.usedHint = true;                                // 透视 = 外部帮助，口径与 AD_PEEK 一致
        G.jokerOffer = 0;
        saveRun();
        G.toast = { msg: '🃏×' + G.jokers + '  👁 ' + Math.round(AD_GIVE.peek / 1000) + 's', until: Date.now() + 2600 };
        setTimeout(renderAll, 2700);
        setTimeout(renderAll, AD_GIVE.peek + 100);          // 透视到期重画
      });
      break;
    }
    case 'JOKER_USE': {
      if (G.jokers < 1 || s.mode === 'freecell' || s.won) break;
      // 自动选最缺的 foundation（最短且没满的）
      let fi = -1, best = 99;
      for (let i = 0; i < 4; i++) {
        if (s.foundations[i].length < 13 && s.foundations[i].length < best) {
          best = s.foundations[i].length; fi = i;
        }
      }
      if (fi >= 0 && doMove({ t: 'jk', fi })) { G.jokers--; saveRun(); }
      break;
    }
    case 'SHOP': goPhase('SHOP'); break;
    case 'SHOP_TAB': if (data && data.t) G.shopTab = data.t; break;
    case 'SET': goPhase('SET'); break;

    // ⚠ 这三个功能**代码里一直都有，但此前没有任何 UI 入口** —— 等于死代码
    case 'TOG_4COLOR': G.fourColor = !G.fourColor; Sprite.ensure(0, 0); saveOpts(); break;
    case 'TOG_BIGTEXT': G.bigText = !G.bigText; Sprite.ensure(0, 0); saveOpts(); break;
    case 'TOG_SOUND': Sfx.toggle(); break;
    // 舒适模式 = 四色 + 大字 + 放宽点击判定（input.js 读 G.comfort）。
    // 开 = 三件一起开；关 = 只关判定放宽，四色/大字保持玩家手动状态（别替他关掉看得清的牌面）。
    case 'TOG_COMFORT': {
      G.comfort = !G.comfort;
      if (G.comfort) { G.fourColor = true; G.bigText = true; Sprite.ensure(0, 0); }
      saveOpts();
      break;
    }
    // 发牌难度（分档 = 盲打 AI 赢不赢得了，不是拍脑袋）。**下一局生效**，不动当前局。
    case 'SET_SUITS': {                       // Spider 花色档（换档 = 换一局）
      if (data && data.n && data.n !== G.spiderSuits) {
        G.spiderSuits = data.n;
        saveOpts();
        if (G.s.mode === 'spider') { G.stage = 1; G.runScore = 0; newGame(undefined, 'spider'); }
      }
      break;
    }
    case 'SET_DIFF': {                         // 旧口径（保留兼容，E2E 仍在用）
      if (data && data.d) { G.difficulty = data.d; saveOpts(); }
      break;
    }
    case 'SET_LV': {                           // ⭐ 难度阶梯：只能选已解锁的档
      const lv = data && data.lv;
      if (lv >= 1 && lv <= 5 && lv <= diffUnlocked()) {
        G.diffLv = lv;
        G.diffBest = Math.max(G.diffBest || 1, lv);
        saveOpts();
        newGame(diffAt(lv).draw, 'klondike');
        goPhase('PLAY');
      }
      break;
    }
    case 'INSIGHT': goPhase('INSIGHT'); break;
    // ⭐ 互动教学：solver 现场出题（可解池取 seed → 解出来 → 退回「差 N 步」）
    case 'LESSON': {
      const id = (data && data.id) || 1;
      const seeds = [];
      for (let i = 0; i < 8; i++) { const sd = Pool.pick(1, 'easy'); if (sd != null) seeds.push(sd); }
      if (!seeds.length) seeds.push(1, 2, 3, 4, 5);
      const built = Lessons.buildFrom(id, seeds);
      if (!built) { G.toast = { msg: T('sol.lessonFail'), until: Date.now() + 2000 };
                    setTimeout(renderAll, 2100); break; }
      G.s = built.state;
      G.lesson = id; G.lessonNeed = built.need;
      G.lessonBase = built.state.moves.length;   // solver 替玩家走到这里；玩家自己的步数从这儿算
      G.dailySeed = null;
      G.drag = G.sel = G.hintMove = null;
      G.tAcc = 0; G.tLast = Date.now(); G.jokers = 0; G.comboN = 0; G.brilliant = 0;
      Prover.reset(); FX.reset(); clearRun();
      goPhase('PLAY');
      dealAnim();
      break;
    }
    case 'LESSON_NEXT': {                      // 上一课通关后接着上下一课
      const nx = (G.lesson || 0) + 1;
      if (nx <= Lessons.LESSONS.length) dispatch('LESSON', { id: nx });
      else { G.lesson = 0; newGame(); }
      break;
    }
    case 'LESSON_QUIT': { G.lesson = 0; newGame(); break; }

    // 翻牌数：**开局前属性**，改了必须换一局（否则「已验证可解」角标就是假的 ——
    // draw-1 和 draw-3 是两个不同的可解性问题，池也是分开建的）
    case 'SET_DRAW': {
      if (data && data.n && data.n !== G.s.drawCount) { newGame(data.n, G.s.mode); G.phase = 'SET'; }
      break;
    }

    // 每日挑战：全世界同一天、同一副牌（且**从已验证可解池里取**）
    case 'DAILY': {
      const seed = Pool.daily(G.s.drawCount);
      if (seed != null) {
        G.s = Core.newGame(seed, G.s.drawCount, 'klondike');
        G.dailySeed = seed;
        G.drag = G.sel = G.hintMove = null;
        G.tAcc = 0; G.tLast = Date.now();
        G.jokers = 0; G.jokerOffer = 0; G.comboN = 0;
        G.stage = 1; G.runScore = 0;
        Prover.reset(); FX.reset(); clearRun();
        goPhase('PLAY');
        dealAnim();
        // ⭐ 打卡即记（连续天数不要求赢 —— 「来」可控，「赢」不可控）
        G.dailyHist = G.dailyHist || {};
        G.dailyHist[todayId()] = Math.max(G.dailyHist[todayId()] || 0, 1);
        saveOpts();
        checkAchievements();                     // 连续天数成就在打卡时就可能达成
        // ⭐ 盲打 AI 打同一局（确定性、不透视、几十毫秒）——赢局结算时对比战绩。
        //   它就是公平页基线里那个 AI（js/ai-blind.js 与 sim-blind.js 同一份），不可作弊。
        G.dailyAI = null;
        const draw = G.s.drawCount;
        setTimeout(() => {
          const r = AIBlind.playBlind(seed, draw, 1200);
          G.dailyAI = { seed, won: r.won, moves: r.moves };
        }, 80);
      }
      break;
    }

    // ⛔ 去广告 IAP **不做**（2026-07-31 拍板，永久决定）：收入就三条腿
    //    （横幅主力 + 克制插屏 + 激励视频）。Money.buyNoAds() 只是死开关
    //    （e2e-p5p6 红线测试用它模拟「买了去广告」），别把入口/StoreKit 加回来。

    // 激励视频 → 金币。⚠ **纯增益**：金币只能换外观，换不到提示/撤销（那是基本人权）
    case 'EARN_AD': {
      watchAd('coins', () => Money.earnAd(AD_GIVE.coins));
      break;
    }
    // ⭐ 外观位·**免费解锁券**（1 次/天）：原来是「白送最便宜的那款牌背」＝ 20 币的货，
    //   一条广告换 20 币的东西没人看。改成看完广告拿一张券，**牌背/桌布/瀑布特效任选一款**
    //   （最贵的 500 币那款也行）。外观不影响强度 ⇒ 可以卖；额度 1/天 才不贬值。
    case 'AD_BACK': {
      if (G.freePick) break;                                 // 手上已有一张券，先花掉
      watchAd('back', () => {
        G.freePick = 1;
        saveOpts();
        goPhase('SHOP');
        G.toast = { msg: '🎁 ' + T('sol.pickFree'), until: Date.now() + 3200 };
        setTimeout(renderAll, 3300);
      });
      break;
    }
    // 🎁 每日礼物（主界面，1 次/天）：观感是「给我福利」而不是「拦我路」——
    //   这类**玩家主动点开**的位置转化高于逼着看的位置（skill §0 的补位原则）。
    case 'DAILY_GIFT': {
      watchAd('gift', () => {
        Money.state.coins += AD_GIVE.giftCoins;
        Money.save();
        const n = gainAngels(AD_GIVE.giftAngels);
        G.toast = { msg: '🎁 +' + AD_GIVE.giftCoins + ' 🪙   +' + n + ' 👼', until: Date.now() + 2600 };
        setTimeout(renderAll, 2700);
      });
      break;
    }
    // 新位·局内增益：**透视暗牌 15 秒**。
    //   它不改牌局、不改随机，只把**已经定死**的信息提前给你看 ⇒ 不碰公平红线；
    //   但它是外部帮助 ⇒ 与提示同口径记 usedHint，**不算干净赢**（统计不能撒谎）。
    case 'AD_PEEK': {
      if (s.won || s.mode === 'freecell') break;            // FreeCell 全明牌，没得透视
      watchAd('peek', () => {
        G.peekUntil = Date.now() + AD_GIVE.peek;
        G.s.usedHint = true;
        saveRun();
        setTimeout(renderAll, AD_GIVE.peek + 100);
      });
      break;
    }
    // 三个 PICK 共用：已有 ⇒ 换上；手上有免费券 ⇒ 直接解锁（券只能用一次）；否则花金币买。
    case 'PICK_BACK': pickSkin('back', data.id); break;
    case 'PICK_TABLE': pickSkin('table', data.id); break;
    case 'PICK_FX': pickSkin('fx', data.id); break;
    // ⭐ 赢局结算礼包：**转化最高的位置**（刚赢、瀑布刚放完），所以也是**给得最厚**的位置。
    //    金币 max(×3, 80) + 👼×3。纯增益：不看也照拿基础金币。
    //    ⚠ 走统一的 watchAd（额度/回滚/冒烟都在里面）—— 原来它自己直连 Ads，口径漂在外面。
    case 'WIN_X2': {
      if (G.winDoubled || !G.lastWinCoins || !s.won) break;
      watchAd('win', () => {
        G.winDoubled = true;
        G.lastWinAdCoins = winAdCoins();
        Money.state.coins += G.lastWinAdCoins;
        Money.save();
        G.lastAngelGain = (G.lastAngelGain || 0) + gainAngels(AD_GIVE.winAngels);
      });
      break;
    }
    // ⭐ 分享此局：牌局 = 一个 seed ⇒ 一条 URL 就是完整挑战（零后端）。
    //   FreeCell 用微软局号（老玩家的接头暗号），Klondike 用自家 seed（draw 模式进链接 ——
    //   draw-1/draw-3 是两个不同的可解性问题，丢了它「同一局」就是假的）。
    case 'SHARE': {
      // ⭐ 链接指向 App Store（不是网页版）——分享是最便宜的获客渠道，网页版不产生下载/评分。
      // ⚠ App Store 链接**带不了 seed** ⇒ 局号必须写进**文案**，否则「一起打同一局」这个
      //   玩法价值就被悄悄删掉了。装了 app 的朋友用设置里的 #️⃣ 局号直输即可进同一局。
      const msg = T('sol.shareText', { n: s.seed })
                + (Share.hasStore() ? '\n' + T('sol.shareSeedTip', { n: s.seed }) : '');
      const toast = () => {
        G.toast = { msg: T('sol.copied'), until: Date.now() + 1600 };
        renderAll();
        setTimeout(renderAll, 1700);
      };
      Share.text(msg).then(r => { if (r === 'copied') toast(); });
      break;
    }
    // ⭐ 「这局还有解吗？」—— 永远免费、永远不看广告（它是产品的灵魂，不是道具）
    case 'PROVE': Prover.ask(G.s); break;
    case 'UNDO_TO': {                          // 从「死局」结论一键撤回到最后有解的那一步
      const n = data && data.n;
      if (n != null && n < G.s.moves.length) {
        const back = Core.replay(G.s.seed, G.s.drawCount, G.s.moves.slice(0, n));
        if (back) { back.usedUndo = true; G.s = back; G.sel = null; Prover.reset(); saveRun(); }
      }
      break;
    }
    case 'PLAY': goPhase('PLAY'); break;
    case 'HOME': goPhase('HOME'); break;
    // 🏠 主按钮**智能续继**：局中未完就接着打（把人扔回新局 = 白丢一局进度）
    case 'HOME_PLAY': {
      if (!(G.s && !G.s.won && G.s.moves.length > 0)) newGame();
      goPhase('PLAY');
      break;
    }
    case 'UNDO': {
      // ⚠ 撤销永远免费、永远不看广告（DESIGN §7.4：纸牌的基本人权）
      const undone = s.moves[s.moves.length - 1];
      const oldS = s;
      const back = Core.undo(s);
      // ⚠ 撤销**必须**作废旧结论：玩家看到「死局」后最可能做的就是撤销，
      //   结论还挂着「死局」= 对一个已经不同的局面撒谎。
      if (back) {
        G.s = back; G.sel = null; Prover.reset(); tick(); saveRun(); Snd.undo();
        undoAnim(undone, oldS, back);            // 牌反向滑回去（瞬移回去比没动画更怪）
      }
      break;
    }
    case 'HINT': {
      let ms = Core.rules(s).legalMoves(s).filter(m => m.t !== 'draw' && m.t !== 'recycle');
      if (!ms.length && s.mode !== 'freecell' && (s.stock.length || s.waste.length)) {
        // ⭐ 没有可走的一步 ⇒ **自动帮玩家翻牌**直到出现可走步（要翻多少翻多少,
        //   最多一整圈+一次回收——翻完一圈还没有,就是真的没有）
        const guard = Math.ceil((s.stock.length + s.waste.length) / s.drawCount) + 3;
        for (let i = 0; i < guard; i++) {
          const dm = s.stock.length ? { t: 'draw' } : { t: 'recycle' };
          if (!Core.apply(s, dm)) break;
          ms = Core.rules(s).legalMoves(s).filter(m => m.t !== 'draw' && m.t !== 'recycle');
          if (ms.length) break;
        }
        Snd.draw(); tick(); Prover.reset(); saveRun();
      }
      if (!ms.length) {
        // 翻穿一整圈也没有 ⇒ 真卡死。诚实说 + （Klondike）点亮 🃏 救场入口
        G.hintMove = null;
        if (s.mode !== 'freecell') G.jokerOffer = Date.now() + 12000;
        G.toast = { msg: T('sol.hintNone'), until: Date.now() + 2200 };
        setTimeout(renderAll, 2300);
        break;
      }
      G.s.usedHint = true;                       // 留痕（「零提示胜率」靠它）
      // ⭐⭐ 提示的目标是**赢**，不是「现在有什么能走」。
      //   我们有求解器 ⇒ 提示就该是**解法的下一步**（别家给不了：他们只有启发式）。
      //   ⛔ 仍然永远免费、永远不看广告（变现红线 §0）。
      //   Spider 不进求解器（104 张状态空间超出能力）⇒ 只能退回启发式。
      if (s.mode !== 'spider') {
        const P = Prover.st;
        if (P.phase === 'done' && P.result === 'solvable' && P.solMoves && P.solMoves.length) {
          G.hintMove = P.solMoves[0]; G.hintWin = true; break;     // ← 通往胜利的那一步
        }
        if (P.phase === 'done' && P.result === 'dead') {
          // ⛔ 措辞死线：陈述事实「这局已经没解了」，**绝不说「是你走错了」**。
          //   并且给退路（撤销回还有解的那一步 / 🃏），不是把人晾在那儿。
          G.toast = { msg: T('sol.hintDead'), until: Date.now() + 2600 };
          if (G.jokers < 1 && s.mode === 'klondike') G.jokerOffer = Date.now() + 15000;
          setTimeout(renderAll, 2700);
          break;
        }
        if (P.phase !== 'proving') {              // 还没算过 ⇒ 现在去算（证明条会显示进度）
          G.hintWant = true; Prover.ask(s); renderAll(); break;
        }
        if (P.phase === 'proving') { G.hintWant = true; renderAll(); break; }
      }
      // ⭐ 用盲打 AI 的打分挑「像好棋」的一步（翻暗牌>清列>收牌），不是 legalMoves[0] 随手一指。
      //   FreeCell 的 AI 打分不适用（全明牌），按 收牌 > 搬牌 > 出格 > 进格 排。
      let best = ms[0], bv = -Infinity;
      for (const m of ms) {
        const v = s.mode === 'freecell'
          ? (m.t === 'cf' || m.t === 'tf' ? 100 : m.t === 'tt' ? 50 : m.t === 'ct' ? 30 : 10)
          : AIBlind.scoreMove(s, m);
        if (v > bv) { bv = v; best = m; }
      }
      G.hintMove = best;
      break;
    }
    // ⭐ 稳赢一键走完：全明牌 + 牌堆空时出现。解法来自 Solver **实证**（不赌「全明牌必胜」的民间定理），
    //   拿到 move list 后逐步错开滑动播完 —— 这就是「解法回放」在最自然场景的落地。
    case 'FINISH': {
      if (G.lesson) break;                     // ⛔ 教学局不给「一键走完」——那等于替玩家把课上了
      if (!Core.canAutoFinish(s)) break;
      const sol = Solver.solve(Solver.clone(s), { maxNodes: 400000, timeoutMs: 4000 });
      if (sol.result !== 'win') break;           // 证不出必胜就不动（全明牌局基本毫秒级出解）
      tick();
      sol.moves.forEach((m, i) => {
        const before = snapshot(G.s);
        if (!Core.apply(G.s, m)) return;
        const orig = FX.slide;
        FX.slide = (ids, x0, y0, x1, y1) => orig(ids, x0, y0, x1, y1, i * 0.05);
        moveAnim(m, before);
        FX.slide = orig;
      });
      Prover.reset(); saveRun();
      if (G.s.won) onWin();
      break;
    }
    case 'TOG_RFX': G.reduceFx = !G.reduceFx; saveOpts(); break;
    // ⛔ 'AUTO'（自动收牌）已删（2026-08-01 用户："这个没用"）——单击自动走牌 +
    //    「✨ 一键走完」把它夹在中间没有位置了。⚠ UNDO/FINISH 仍各自 Prover.reset()。
    case 'STOCK': case 'WASTE': case 'TAB': case 'FOUND': break;   // 由 input 层处理
    default: break;
  }
  renderAll();
}

/**
 * 撤销的反向滑牌：把被撤销那步 m 的牌，从**旧状态的落点**滑回**新状态的源位置**。
 * ⚠ 与 moveAnim 同一套坐标约定（cardXY），方向相反。recycle 整堆搬回不演。
 */
function undoAnim(m, oldS, newS) {
  if (!m) return;
  let ids = [], from = null, to = null;
  if (m.t === 'draw') {
    ids = [oldS.waste[oldS.waste.length - 1]];
    from = Layout.cardXY(oldS, { p: 'w' });
    to = Layout.cardXY(newS, { p: 'stock' });
  } else if (m.t === 'tt') {
    const col = newS.tableau[m.ti];
    ids = col.cards.slice(m.idx);
    from = Layout.cardXY(oldS, { p: 't', ti: m.tj, i: oldS.tableau[m.tj].cards.length - ids.length });
    to = Layout.cardXY(newS, { p: 't', ti: m.ti, i: m.idx });
  } else if (m.t === 'tf') {
    const col = newS.tableau[m.ti];
    ids = [col.cards[col.cards.length - 1]];
    from = Layout.cardXY(oldS, { p: 'f', fi: m.fi });
    to = Layout.cardXY(newS, { p: 't', ti: m.ti, i: col.cards.length - 1 });
  } else if (m.t === 'wf') {
    ids = [newS.waste[newS.waste.length - 1]];
    from = Layout.cardXY(oldS, { p: 'f', fi: m.fi });
    to = Layout.cardXY(newS, { p: 'w' });
  } else if (m.t === 'wt') {
    ids = [newS.waste[newS.waste.length - 1]];
    from = Layout.cardXY(oldS, { p: 't', ti: m.ti, i: oldS.tableau[m.ti].cards.length - 1 });
    to = Layout.cardXY(newS, { p: 'w' });
  } else if (m.t === 'tc') {
    const col = newS.tableau[m.ti];
    ids = [col.cards[col.cards.length - 1]];
    from = Layout.cardXY(oldS, { p: 'c', ci: m.ci });
    to = Layout.cardXY(newS, { p: 't', ti: m.ti, i: col.cards.length - 1 });
  } else if (m.t === 'ct') {
    ids = [newS.free[m.ci]];
    from = Layout.cardXY(oldS, { p: 't', ti: m.tj, i: oldS.tableau[m.tj].cards.length - 1 });
    to = Layout.cardXY(newS, { p: 'c', ci: m.ci });
  } else if (m.t === 'cf') {
    ids = [newS.free[m.ci]];
    from = Layout.cardXY(oldS, { p: 'f', fi: m.fi });
    to = Layout.cardXY(newS, { p: 'c', ci: m.ci });
  } else return;
  if (ids.length && from && to && ids.every(id => id != null)) {
    FX.slide(ids, from.x, from.y, to.x, to.y);
  }
}

// ══ 成就（全部从既有计数器算，达成发金币 —— 目标感 + 收集系统的供弹药）══
const ACHS = [
  { id: 'firstWin', coins: 20,  ok: () => G.stats.won >= 1 },
  { id: 'win10',    coins: 50,  ok: () => G.stats.won >= 10 },
  { id: 'win50',    coins: 100, ok: () => G.stats.won >= 50 },
  { id: 'clean1',   coins: 30,  ok: () => G.stats.cleanWon >= 1 },
  { id: 'clean10',  coins: 80,  ok: () => G.stats.cleanWon >= 10 },
  { id: 'streak3',  coins: 40,  ok: () => (G.stats.bestStreak || 0) >= 3 },
  { id: 'streak5',  coins: 80,  ok: () => (G.stats.bestStreak || 0) >= 5 },
  { id: 'fast',     coins: 60,  ok: () => G.stats.bestTime > 0 && G.stats.bestTime < 180000 },
  { id: 'fc',       coins: 30,  ok: () => (G.stats.fcWon || 0) >= 1 },
  { id: 'daily7',   coins: 60,  ok: () => (G.stats.dailyWon || 0) >= 7 },
  { id: 'collect6', coins: 50,
    ok: () => Money.state.ownedBacks.length + Money.state.ownedTables.length + Money.state.ownedFx.length >= 6 },
  // 👼 天使图鉴系列（长线目标）+ 🔥 连续天数系列 + 🥇 奖牌
  { id: 'angels50',  coins: 40,  ok: () => G.angels >= 50 },
  { id: 'angels150', coins: 60,  ok: () => G.angels >= 150 },
  { id: 'angels300', coins: 80,  ok: () => G.angels >= 300 },
  { id: 'angels500', coins: 150, ok: () => G.angels >= 500 },
  { id: 'streak7d',  coins: 50,  ok: () => dailyStreakDays() >= 7 },
  { id: 'streak30d', coins: 120, ok: () => dailyStreakDays() >= 30 },
  { id: 'gold1',     coins: 100, ok: () => Object.values(G.badges || {}).indexOf('gold') >= 0 },
];
function checkAchievements() {
  G.ach = G.ach || {};
  for (const a of ACHS) {
    if (G.ach[a.id] || !a.ok()) continue;
    G.ach[a.id] = 1;
    Money.state.coins += a.coins; Money.save();
    G.toast = { msg: '🏆 ' + T('sol.ach_' + a.id) + '  +' + a.coins, until: Date.now() + 2400 };
    setTimeout(renderAll, 2500);
  }
  saveOpts();
}

/**
 * 👼 加天使 + 集组奖励：每 25 张一集，跨过整集边界发金币 ——
 * 收集动机从「攒到 500」变成「差 7 张集齐这一集」（目标感密度完全不同）。
 * 返回实际新增张数。
 */
function gainAngels(n) {
  const total = Angels.total() || 500;
  const before = G.angels;
  G.angels = Math.min(total, G.angels + n);
  const SET = 25, BONUS = 50;
  for (let k = Math.floor(before / SET) + 1; k * SET <= G.angels; k++) {
    Money.state.coins += BONUS;
    G.toast = { msg: '🎉 ' + T('sol.setDone', { k, c: BONUS }), until: Date.now() + 2600 };
    setTimeout(renderAll, 2700);
  }
  Money.save();
  return G.angels - before;
}

/** 昨天/前天的日期 key（补签判定用）*/
function dayKeyAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return '' + d.getFullYear() + (d.getMonth() + 1) + d.getDate();
}
/** 能补签吗：昨天没来 + 前天来过（连续天数正要断）*/
function canMakeup() {
  const h = G.dailyHist || {};
  return !h[dayKeyAgo(1)] && !!h[dayKeyAgo(2)];
}

/**
 * ⭐ 求解器算完了 ⇒ 如果玩家在等提示，把**解法的第一步**给他。
 *   算不出来（unknown/超时）⇒ 退回盲打 AI 的启发式，并**如实标注**这一步不保证通往胜利
 *   （`hintWin=false`）—— 「我们算不出来」是一等公民，不许伪装成「这就是最优解」。
 */
function hintFromProof() {
  if (!G.hintWant) return;
  G.hintWant = false;
  const P = Prover.st, s = G.s;
  if (P.result === 'solvable' && P.solMoves && P.solMoves.length) {
    G.hintMove = P.solMoves[0]; G.hintWin = true;
  } else if (P.result === 'dead') {
    G.hintMove = null; G.hintWin = false;
    G.toast = { msg: T('sol.hintDead'), until: Date.now() + 2600 };
    setTimeout(renderAll, 2700);
  } else {                                        // unknown ⇒ 启发式兜底
    const ms = Core.rules(s).legalMoves(s).filter(m => m.t !== 'draw' && m.t !== 'recycle');
    let best = ms[0], bv = -Infinity;
    for (const m of ms) {
      const v = s.mode === 'freecell'
        ? (m.t === 'cf' || m.t === 'tf' ? 100 : m.t === 'tt' ? 50 : m.t === 'ct' ? 30 : 10)
        : AIBlind.scoreMove(s, m);
      if (v > bv) { bv = v; best = m; }
    }
    G.hintMove = best || null; G.hintWin = false;
  }
  renderAll();
}

// == 激励视频：统一入口 + 每日额度（skill `casual-game-meta` 的打法）==
//  设计要点（三款产品踩出来的）：
//   (1) 奖励给厚，一次见效 —— 图鉴 +1 张没人看，+8 张才动手；按钮标签**把数量写出来**。
//   (2) 给得厚 ⇒ **必须配每日额度**，否则一天几十条广告把 500 张长线收集当天刷穿。
//       额度是设计不是抠门：6×8 = 每天 48 张已经很大方，而长尾还在。
//   (3) 跨天重置**按额度表全量清**（手写清哪几个 key 必漏，而漏掉的位会永久卡在首日额度）。
//   (4) 拒绝观看 ⇒ **零发放且不扣额度**（写进冒烟测试）。
//   (5) 发放口收敛成**一个函数**、入口统一成 dispatch('AD_*')，否则冒烟点不到、口径也会漂。
//  绝不动的红线：撤销 / 提示 / 重开 / 换局 / 证明器**永远免费**。这里全是纯增益 + 救场。
//  ⭐ 2026-08-01 加厚（用户点名「看广告的回馈要更丰厚」）：改动的都是**给多少**，
//     红线一个字没动（撤销/提示/重开/换局/证明器仍然永远免费，广告只买纯增益与救场）。
//     四条口径：① **最贵的位置不许最薄** —— 结算屏原来只多给 10~25 币，比商店那条 60 币还少，
//     现在是「金币 ×3 保底 80 + 👼×3」的礼包；② 每个位都要**一次见效**（金币位 60→100 = 一次
//     买得动一款中级牌背，图鉴 8→12）；③ 救场要**真能救回来**（万能牌一次拉满 3 张 + 附送 30 秒
//     透视，光给两张牌照样卡死）；④ 外观位从「白送最便宜的那款」（20 币的货）升级成
//     **任选一款免费解锁券**（牌背/桌布/瀑布特效都行）。给厚 ⇒ 额度照旧兜底（见下）。
const AD_CAPS = { gallery: 6, coins: 5, joker: 3, back: 1, peek: 3, makeup: 1, win: 6, gift: 1 };
const AD_GIVE = {
  gallery: 12, coins: 100, joker: 3, peek: 30000,   // peek 单位是毫秒
  winMin: 80, winAngels: 3,                          // 结算屏礼包：金币 max(×3, 80) + 👼×3
  giftCoins: 100, giftAngels: 5,                     // 主界面每日礼物（1 次/天）
};
/** 结算屏礼包的金币数（`×3` 但有保底 —— 脏赢基础只有 10 币，×3 也不够看） */
const winAdCoins = () => Math.max(AD_GIVE.winMin, (G.lastWinCoins || 0) * 3);

/** 换玩法 = 换一局（玩法是开局前属性）；连关轮从头开始。MODE / MODE_SET 共用一份口径。 */
function setMode(m) {
  G.stage = 1; G.runScore = 0;
  newGame(undefined, m);
  goPhase('PLAY');                             // 选完直接回牌桌，别把人留在菜单里
}

/** 收藏品点选：已有=换上 / 有免费券=白拿（券作废）/ 否则金币买。三个 tab 共用一份口径。 */
function pickSkin(kind, id) {
  if (!id) return;
  if (Money.owns(kind, id)) { Money.equip(kind, id); return; }
  if (G.freePick && Money.grantFree(kind, id)) {
    G.freePick = 0;
    saveOpts();
    checkAchievements();
    G.toast = { msg: '🎁 ' + T('sol.freeGot'), until: Date.now() + 2200 };
    setTimeout(renderAll, 2300);
    return;
  }
  if (Money.buy(kind, id)) checkAchievements();
}

function adsState() {
  G.ads = G.ads || { day: '' };
  if (G.ads.day !== todayId()) {
    G.ads = { day: todayId() };
    for (const k of Object.keys(AD_CAPS)) G.ads[k] = 0;    // 全量清，别手写几个
  }
  return G.ads;
}
function adLeft(kind) { return Math.max(0, (AD_CAPS[kind] || 0) - (adsState()[kind] || 0)); }

/** 唯一的激励视频入口。拒绝观看 ⇒ 零发放且**不扣额度**。 */
function watchAd(kind, grant) {
  const st = adsState();
  if (adLeft(kind) <= 0) {
    G.toast = { msg: T('sol.adNoneLeft'), until: Date.now() + 2200 };
    setTimeout(renderAll, 2300);
    return renderAll();
  }
  // ⚠ **先占位再放广告**：showRewarded 是异步的，若等回调才扣，连点两下会双双通过
  //   「点击时」的检查 ⇒ 额度超发（E2E 抓出过 7/6）。拒绝观看时再回滚。
  st[kind] = (st[kind] || 0) + 1;
  Ads.showRewarded().then(function (got) {
    if (got) {
      grant();
      saveOpts();
      checkAchievements();
    } else {
      st[kind] = Math.max(0, st[kind] - 1);      // 拒绝 ⇒ 回滚（不惩罚没看完的人）
    }
    renderAll();
  });
}

// ══ ⭐ 难度阶梯（明面进度，代替「混合/简单/困难」三个下拉项）══
//  每一档都是**真实存在的难度差**，不是拍脑袋的标签：翻 1 张 vs 翻 3 张是两个不同的
//  可解性问题（盲打 AI 32.3% vs 7.6%），easy/hard 池的分档依据也是「盲打 AI 赢不赢得了」。
//  ⛔ 每一档**都只发已验证可解的局** —— 难度上去的是「找到解有多难」，不是「有没有解」。
const DIFF_LADDER = [
  { lv: 1, draw: 1, pool: 'easy', need: 0 },
  { lv: 2, draw: 1, pool: 'any',  need: 2 },
  { lv: 3, draw: 3, pool: 'easy', need: 5 },
  { lv: 4, draw: 3, pool: 'any',  need: 9 },
  { lv: 5, draw: 3, pool: 'hard', need: 14 },   // 有解、但盲打 AI 赢不了的局
];
const diffAt = lv => DIFF_LADDER[Math.max(0, Math.min(4, (lv || 1) - 1))];
/** 已解锁到第几档（按累计胜局；最高档也必须可赢——池里全是已验证可解局）*/
function diffUnlocked() {
  let n = 1;
  for (const d of DIFF_LADDER) if ((G.stats.won || 0) >= d.need) n = d.lv;
  return n;
}
/** 记一次「弱点」：走到这一步之后局面从有解变无解（由证明器定位）*/
function noteWeak(kind) {
  G.insight = G.insight || {};
  G.insight[kind] = (G.insight[kind] || 0) + 1;
  saveOpts();
}

// ══ 🏆 每日锦标赛（零后端伪社交:100 名确定性对手,同一天全球同一场）══
const TOUR_NAMES = ['Patricio','Alex','Isabel','Marco','Yuki','Nadia','Omar','Elena','Kai','Zoe',
  'Ivan','Lucia','Noah','Aicha','Ravi','Mei','Jonas','Sofia','Tariq','Anya','Diego','Hana','Felix','Nora'];
// 头像同上：天使画像序号（drawAvatar 缺图会回退到带首字母的彩盘）
function tourField() {
  const dayN = parseInt(todayId(), 10) >>> 0;
  const out = [];
  for (let i = 0; i < 100; i++) {
    let a = (dayN ^ Math.imul(i + 7, 2654435761)) >>> 0;
    a = Math.imul(a ^ (a >>> 15), 1 | a) >>> 0;
    const noise = ((a >>> 8) % 1000) / 1000;
    const base = Math.pow(1 - i / 110, 2.1) * 155000;
    out.push({ name: TOUR_NAMES[a % TOUR_NAMES.length],
               av: (a >>> 5) % 500,
               score: Math.round(base * (0.9 + noise * 0.2)) + 500 });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
/** 你今天的名次（1 + 比你高分的对手数;打一关就往上爬,爬榜就是留存钩子） */
function tourRank() {
  const f = tourField();
  let r = 1;
  for (const e of f) if (e.score > (G.dayScore || 0)) r++;
  return { rank: r, field: f };
}
/** 跨天回滚:锦标赛当日分清零 */
function ensureDay() {
  if (G.dayId !== todayId()) { G.dayId = todayId(); G.dayScore = 0; }
}

// ══ 玩家等级(XP = 历史累计得分)══
const xpNeed = l => 150 * l * (l + 1);          // 升到 l+1 级所需累计 XP(Lvl1 → 300 起步)
function levelOf(xp) { let l = 1; while (xp >= xpNeed(l) && l < 99) l++; return l; }
function levelTitleKey(l) {
  return l >= 20 ? 'titleGrand' : l >= 15 ? 'titleMaster' : l >= 10 ? 'titleExpert'
       : l >= 6 ? 'titleSkilled' : l >= 3 ? 'titleAmateur' : 'titleNovice';
}

/** 每日挑战连续天数：打卡即续（不要求赢 —— 回访动机要可控）。今天还没来则从昨天起算（未断）*/
function dailyStreakDays() {
  const hist = G.dailyHist || {};
  const key = dt => '' + dt.getFullYear() + (dt.getMonth() + 1) + dt.getDate();
  const d = new Date();
  if (!hist[key(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (hist[key(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/** 上个月的每日挑战奖牌结算（一次性，boot 时跑）：全勤金 / ≥20 银 / ≥10 铜（按**赢**计，与日历同口径）*/
function settleMonthBadges() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = '' + prev.getFullYear() + (prev.getMonth() + 1);
  G.badges = G.badges || {};
  if (G.badges[ym] != null) return;
  const dim = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  let won = 0;
  for (let d = 1; d <= dim; d++) if ((G.dailyHist || {})[ym + d] >= 2) won++;
  G.badges[ym] = won >= dim ? 'gold' : won >= 20 ? 'silver' : won >= 10 ? 'bronze' : 'none';
  saveOpts();
}

/**
 * 🖼 赢局战绩图卡：offscreen 1080×1350 合成 → Web Share(File)。
 * 不支持文件分享的环境（桌面浏览器等）降级为原来的链接分享（SHARE）。
 */
async function shareWinCard() {
  const s = G.s;
  const fmt = ms => {
    const t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0f6b3f'); g.addColorStop(1, '#0a3b24');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,255,255,0.10)'; x.font = '150px serif';
  x.fillText('♠', 110, 150); x.fillText('♥', W - 110, 150);
  x.fillText('♣', 110, H - 150); x.fillText('♦', W - 110, H - 150);
  x.fillStyle = '#fff'; x.font = 'bold 96px sans-serif';
  x.fillText(T('sol.youWin'), W / 2, 320);
  x.fillStyle = '#ffd84d'; x.font = 'bold 62px sans-serif';
  x.fillText(T('sol.deal', { n: s.seed }), W / 2, 480);
  x.fillStyle = '#eafff2'; x.font = '50px sans-serif';
  x.fillText(T('sol.timeMoves', { t: fmt(G.tAcc), m: s.moves.length }), W / 2, 590);
  const clean = !s.usedUndo && !s.usedHint && !s.usedJoker;
  if (clean) { x.fillStyle = '#7ef2a0'; x.font = 'bold 44px sans-serif'; x.fillText(T('sol.cleanWin'), W / 2, 690); }
  if (G.dailySeed === s.seed && G.dailyAI && G.dailyAI.seed === s.seed && !G.dailyAI.won) {
    x.fillStyle = '#ffd84d'; x.font = '40px sans-serif';
    x.fillText(T('sol.dailyAiLost'), W / 2, 780);
  }
  x.fillStyle = '#fff'; x.font = 'bold 46px sans-serif';
  x.fillText(T('sol.shareText', { n: s.seed }), W / 2, 1020);
  // 图卡上印 App Store 链接（不是网页版）—— 截图被转发时这行字就是获客入口
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '40px sans-serif';
  x.fillText(Share.link(), W / 2, 1110);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], 'fair-deal-win.png', { type: 'image/png' });
  const cap = T('sol.shareText', { n: s.seed })
            + (Share.hasStore() ? '\n' + T('sol.shareSeedTip', { n: s.seed }) : '');
  if ((await Share.files(f, cap)) !== 'failed') return;
  dispatch('SHARE');                             // 降级：链接分享（剪贴板 + toast）
}

/** 解析分享链接（#d1-N / #d3-N / #fc-N）。命中就消费掉 hash，返回 {mode, draw, seed} */
function dealFromHash() {
  const m = /^#(d1|d3|fc)-(\d+)$/.exec(location.hash || '');
  if (!m) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (m[1] === 'fc') {
    const n = +m[2];
    return (n >= 1 && n <= 32000) ? { mode: 'freecell', draw: 3, seed: n } : null;
  }
  return { mode: 'klondike', draw: m[1] === 'd1' ? 1 : 3, seed: (+m[2]) >>> 0 };
}

// ── 主循环（只在瀑布/拖拽时逐帧重画）──
let last = 0;
function loop(ts) {
  const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
  last = ts;
  // ⚠ proving 时也要逐帧重画：动画不动 = 看起来卡死 = 毁掉「它真的在算」的全部说服力
  if (FX.busy() || G.drag || Prover.st.phase === 'proving') {
    FX.update(dt);
    renderAll();
  }
  requestAnimationFrame(loop);
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), K_RUN(), K_STATS(), K_OPT()]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();

  try { G.stats = Object.assign(G.stats, JSON.parse(Platform.storage.get(K_STATS()) || '{}')); } catch (e) {}
  try { Object.assign(G, JSON.parse(Platform.storage.get(K_OPT()) || '{}')); } catch (e) {}

  Money.load();
  Sprite.preloadBacks();                               // 图片牌背预热（几百 KB，onload 自动重画）
  settleMonthBadges();                                 // 上个月的每日奖牌（一次性结算）
  // ⭐ 横幅是**主力收入**（纸牌单次会话 10-15 分钟，曝光时长极高且不打断牌局）。
  //    布局已为它**预留**了 Layout.BANNER_H —— 它永远不会盖在牌上（变现红线 §7.4-5）。
  //    G.noAds = 「不占横幅位」：死开关 noAds 或**前 30 盘蜜月期**（跨过蜜月在 newGame 里亮出）。
  G.noAds = Money.noAds || Money.adFree(G.stats.played);
  if (!G.noAds) Ads.showBanner();

  Angels.load();                                       // 👼 图鉴 manifest（非阻塞,失败图鉴显示 0/0）
  await Pool.load();                                   // ⭐ 先加载可解池（决定发什么牌）
  // ⭐ 分享链接进来（#d1-N / #d3-N / #fc-N）⇒ 直接开那一局（朋友挑战同一副牌）。
  //   消费掉 hash（否则之后每次刷新都困在这一局里）。
  const linked = dealFromHash();
  const resumed = linked ? null : loadRun();
  if (linked) { G.s = Core.newGame(linked.seed, linked.draw, linked.mode); clearRun(); }
  else if (resumed) G.s = resumed;
  else {
    // 新玩家的头几局也走 easy 池（与 newGame 的首 3 局规则同口径）
    const sd = Pool.pick(3, G.stats.played < 3 ? 'easy' : 'any');
    G.s = Core.newGame(sd != null ? sd : Deal.randomSeed(), 3);
  }

  // ⭐ 第一次打开 → 先给首启一屏（App Store 4.3(a) 的主要防线：差异必须在头 5 秒撞到脸上）
  //   之后每次启动落在 🏠 主界面（回访必经之路,收集/教学/成就的进度都摆在那儿）。
  G.phase = G.seenIntro ? 'HOME' : 'INTRO';

  Input.bind({ onAction: dispatch });                       // 工具条
  Input2.bind(document.getElementById(CFG.canvasId), {      // 牌区：拖拽 + tap-to-move
    onTap, onDrop, onChange: renderAll,
  });
  // 点一下跳过瀑布
  document.getElementById(CFG.canvasId).addEventListener('pointerdown', () => { if (FX.busy()) FX.skip(); });

  // 长按撤销 = 连续撤（65+ 友好；抬手时引擎 tap 还会再撤一步——无害，也是撤销）
  const cv = document.getElementById(CFG.canvasId);
  let lpT = null, lpI = null;
  const lpStop = () => { clearTimeout(lpT); clearInterval(lpI); lpT = lpI = null; };
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect();
    const h = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (h && h.action === 'UNDO') {
      lpT = setTimeout(() => { lpI = setInterval(() => dispatch('UNDO'), 150); }, 450);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, lpStop));

  // 分享链接贴进**已开着的**标签页 = 同文档导航,不会重新 boot ⇒ 靠 hashchange 接住
  window.addEventListener('hashchange', () => {
    const l = dealFromHash();
    if (!l) return;
    G.s = Core.newGame(l.seed, l.draw, l.mode);
    G.dailySeed = null;
    G.drag = G.sel = G.hintMove = null;
    Prover.reset(); FX.reset(); clearRun();
    G.phase = 'PLAY';
    renderAll();
  });
  ensureDay();
  // ⏱ 每秒重画一次(仅 PLAY/MENU):行2 的 Time 与锦标赛倒计时要活着走
  setInterval(() => {
    if ((G.phase === 'PLAY' && G.s && !G.s.won && !FX.busy()) || G.phase === 'MENU') {
      ensureDay();
      renderAll();
    }
  }, 1000);
  window.addEventListener('resize', () => { initCanvas(); FX.reset(); renderAll(); });
  Controls.render();
  renderAll();
  requestAnimationFrame(loop);
}

boot();
