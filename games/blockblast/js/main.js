// ════════════════════════════════════════
// main.js — boot / 状态 G / 事件消费（core 事件流 → juice）/ 主循环 / 存档。
// core 是纯逻辑（不知道有屏幕），它每次落子返回一串事件；这里把事件翻译成画面和声音。
// ════════════════════════════════════════
'use strict';

// ⚠ 必须显式挂到 window：脚本顶层的 `const G` **不会**成为 window 的属性，
// 而 render.js / drag.js 读的是 root.G（= window.G）—— 少了这一句，渲染层拿到的是 undefined。
// （E2E 抓到的；单测永远抓不到这类跨文件的全局约定问题。）
const G = window.G = {
  phase: 'MENU',                 // MENU | PLAYING | ACH | SKIN | FAIR
  progress: {},                  // levelId → 星数（0 = 未过）
  profile: null,                 // 成就/累计/每日（Achievements.emptyProfile()）
  theme: 'candy',                // 当前皮肤
  wallet: null,                  // 金币 / 去广告 / 插屏计数（Shop.emptyWallet()）
  items: null,                   // 本局道具（每局重置）
  s: null,                       // core 状态
  best: 0,
  drag: null,
  fly: null,                     // 非法松手后正在飞回托盘的块
  cellColor: new Array(64).fill(null),   // 每格的颜色（纯装饰；消除不看颜色）
  opts: null,                    // 设置：{ fx, preview }（boot 时载入）
  overAnim: null,                // 死亡序列动画（回放最后几手 → 红色扫盘证明）；null = 不在播
  recentPlaces: [],              // 最近 3 手的落子格（死亡回放用）
  hint: null,                    // FTUE 指引（第 1-2 关首步：{slot,r,c,piece}）
  coachHint: null,               // 教练提示（玩家主动求助：{slot,r,c}）—— 与上面的 FTUE 是两回事
  history: [],                   // 最近 3 手**落子前**的局面快照（死亡复盘用；不进存档）
  review: null,                  // 死亡复盘结论（Coach.postmortem 的产物）
  achPage: 0,                    // 成就页当前页
  skinPage: 0,                   // 皮肤页当前页
  angPage: 0,                    // 天使图鉴当前页
  angView: -1,                   // 天使大图查看（-1 = 关）
  newAngels: 0,                  // 本盘新收集的天使数（结算页显示）
  repairOffer: null,             // 断签补签报价 {prev}（每日结算页按钮）
  chapter: 0,                    // 关卡地图当前章节（0 = 自动定位到进度所在章）
  animClock: 0,                  // 表现层脉冲时钟（心跳/指引/宽限警示共用）
};

// ── 存档 ──
const K_BEST = () => CFG.key('best');
const K_RUN = () => CFG.key('run');
const K_PROG = () => CFG.key('progress');
const K_PROFILE = () => CFG.key('profile');
const K_THEME = () => CFG.key('theme');
const K_WALLET = () => CFG.key('wallet');
const K_OPTS = () => CFG.key('opts');

function saveOpts() { try { Platform.storage.set(K_OPTS(), JSON.stringify(G.opts)); } catch (e) {} }

function saveRun() {
  try {
    const s = G.s;
    Platform.storage.set(K_RUN(), JSON.stringify({
      v: Core.SAVE_VERSION, seed: s.seed, streamIndex: s.streamIndex, board: s.board,
      placed: s.placed, score: s.score, streak: s.streak, dryTurns: s.dryTurns,
      over: s.over, stats: s.stats, cellColor: G.cellColor,
      bonusHands: s.bonusHands | 0,      // 看广告换来的礼包手：切出去再回来得还在（不然玩家白看）
    }));
  } catch (e) {}
}
function loadRun() {
  try {
    const raw = Platform.storage.get(K_RUN());
    if (!raw) return null;
    const d = JSON.parse(raw);
    // 版本 + 形状校验：不匹配就丢弃、绝不迁移（畸形存档 = 无报错白屏，CLAUDE.md 的铁律）
    if (d.v !== Core.SAVE_VERSION || !Array.isArray(d.board) || d.board.length !== Core.N) return null;
    if (!Array.isArray(d.placed) || d.placed.length !== 3) return null;
    if (d.over) return null;                       // 已结束的局不恢复
    const s = Core.newGame(d.seed);
    Object.assign(s, {
      streamIndex: d.streamIndex, board: d.board, placed: d.placed,
      score: d.score, streak: d.streak, dryTurns: d.dryTurns, stats: d.stats || s.stats,
      // ⚠ 老存档没有这个字段 ⇒ undefined|0 = 0（＝没有礼包手），形状天然兼容，不必 bump SAVE_VERSION
      bonusHands: d.bonusHands | 0,
    });
    G.cellColor = Array.isArray(d.cellColor) && d.cellColor.length === Core.N ? d.cellColor : new Array(Core.N).fill(null);
    return s;
  } catch (e) { return null; }
}
function clearRun() { try { Platform.storage.set(K_RUN(), ''); } catch (e) {} }

/** 每局公共的表现层状态复位（无尽/关卡/每日/挑战都要过这里）*/
function resetRunUi() {
  G.cellColor = new Array(Core.N).fill(null);
  G.drag = null;
  G.fly = null;
  G.phase = 'PLAYING';
  G.lastEarn = null;            // 本局结算发了多少金币（翻倍按钮用）
  G.newBestRun = false;         // 本局是否破了纪录（结算页用 —— 不能拿 score>best 现比：over 时 best 已被更新）
  G.bestToastShown = false;     // 破纪录的**瞬间**只庆祝一次
  G.runStartAt = Date.now();    // 局时长（无尽转场插屏的「短局不出」护栏用）
  G.overAnim = null;
  G.recentPlaces = [];
  G.hint = null;
  G.coachHint = null;
  G.history = [];
  G.review = null;
  G.newAngels = 0;
  G.repairOffer = null;
  FX.reset();
}

/**
 * FTUE 指引（DESIGN §6.3 的最后一步）：前 2 关的第一步，算出「放哪里能消行」，
 * 托盘目标块 + 落点脉冲高亮。数据早就证明 casual 玩家摸不到核心爽点（最长 streak 中位 = 2）——
 * 预置盘面只是把饭做好，这里是把勺子递到手上。放对第一块后指引消失，绝不啰嗦。
 */
function computeHint() {
  G.hint = null;
  const s = G.s;
  if (!s || s.mode !== 'level' || s.levelId > 2 || s.stats.turns > 0 || s.over) return;
  const t = Core.tray(s);
  for (let i = 0; i < 3; i++) {
    const p = t[i];
    if (!p) continue;
    for (const [r, c] of Core.placements(s.board, p)) {
      const test = s.board.slice();
      for (const [dr, dc] of p.cells) test[Core.idx(r + dr, c + dc)] = 1;
      const f = Core.findFullLines(test, s.stone);
      if (f.rows.length + f.cols.length > 0) { G.hint = { slot: i, r, c, piece: p }; return; }
    }
  }
}

/** 菜单「无尽」按钮的状态：有没打完的局 ⇒ 返回它的分数（按钮变「继续」）；没有 ⇒ null */
function resumableScore() {
  const cur = G.s;
  if (cur && cur.mode === 'endless' && !cur.daily && !cur.challenge && !cur.over && cur.stats.turns > 0) return cur.score;
  try {
    const raw = Platform.storage.get(K_RUN());
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== Core.SAVE_VERSION || d.over) return null;
    return d.score || 0;
  } catch (e) { return null; }
}

// ── 新局 ──
function newRun() {
  G.s = Core.newGame(Dealer.randomSeed());
  resetRunUi();
  G.items = Shop.newRunItems();
  clearRun();
}

/** 好友挑战：用对方的种子开一局（同一条块流）。不写无尽存档、不计入无尽最高分 ——
 *  同种子可以反复练，混进最高分就不公平了。*/
function startChallenge(seed) {
  G.s = Core.newGame(seed >>> 0);
  G.s.challenge = true;
  resetRunUi();
  G.items = Shop.newRunItems();
}

/** 开一关。每次重开换一个新种子（块流不同）—— 但**绝不看你之前失败过几次**。*/
function startLevel(id) {
  const def = Levels.byId(id);
  if (!def) return;
  G.s = Core.newLevel(def, Dealer.randomSeed());
  resetRunUi();
  // 预置块也要有颜色（关卡盘面不能是一片死灰）
  for (let i = 0; i < Core.N; i++) {
    if (G.s.board[i] && !G.s.stone[i]) G.cellColor[i] = Render.COLORS[(i * 3) % Render.COLORS.length];
  }
  G.items = Shop.newRunItems();
  computeHint();                 // 前 2 关首步指引（其余关卡内部直接 return）
  // 拼块水晶章：开场提示一句（玩家第一次见「水晶长在托盘的块上」）
  if (def.pieceCrystals) {
    requestAnimationFrame(() => {
      // ⚠ 画在**棋盘中央**，不是 boardY-24 —— 那一行正是水晶目标条，两者叠在一起谁也看不清（实拍抓到）
      FX.toast(T('blockblast.pieceCryIntro'), Render.L.cx, Render.L.boardY + Render.L.boardW / 2,
               '#86efac', 'bold 15px sans-serif', 1.8);
    });
  }
  // ⚠ 别 clearRun()：K_RUN 存的是**无尽模式**的当前局。进一次关卡就把它抹了 = 玩家没打完的
  //    无尽局凭空消失（红队指出）。关卡局本来就不做续玩存档，跟 K_RUN 无关。
}

function saveProgress() {
  try { Platform.storage.set(K_PROG(), JSON.stringify(G.progress)); } catch (e) {}
}
function saveProfile() {
  try { Platform.storage.set(K_PROFILE(), JSON.stringify(G.profile)); } catch (e) {}
}
function saveWallet() {
  try { Platform.storage.set(K_WALLET(), JSON.stringify(G.wallet)); } catch (e) {}
}

/**
 * 用一个道具。⛔ 红线 2：如果玩家**拒绝**看广告，我们**什么也不做** ——
 * 绝不「你不看就强塞一个无奖励广告」（Block Blast 被骂最狠的一条，它拿走了「我不看」的选择权）。
 */
function useItem(kind) {
  const mode = kind === 'undo' ? Shop.undoMode(G.wallet, G.items) : Shop.refreshMode(G.wallet, G.items);
  if (mode === 'no') return;

  const apply = () => {
    const okPay = kind === 'undo' ? Shop.payUndo(G.wallet, G.items, mode) : Shop.payRefresh(G.wallet, G.items, mode);
    if (!okPay) return;
    if (kind === 'undo') { if (Core.undo(G.s)) { FX.reset(); Sound.pick(); } }
    else { if (Core.refreshHand(G.s)) { FX.reset(); Sound.pick(); } }
    computeHint();               // 前 2 关：撤销回首步 / 换了一手 ⇒ 指引重算
    G.coachHint = null;          // 局面变了，刚才那个最优落点已经过期
    saveWallet();
    if (G.s.mode === 'endless') saveRun();
    renderAll();
  };

  if (mode === 'ad') {
    Ads.showRewarded().then(rewarded => {
      if (rewarded) apply();          // 看完了才给
      else renderAll();               // ⛔ 拒绝/失败 ⇒ 什么也不发生。绝不惩罚、绝不强塞广告。
    });
    return;
  }
  apply();
}

// ════════════════════════════════════════
// 激励视频统一入口（七个位共用：领币/每日礼物/开局礼包/皮肤/任务/图鉴/结算翻倍）
//
// ⛔ 三态一处收敛，别在各 case 里各写一遍（写散了必然漏掉某一条红线）：
//   · 'no'   今天额度用完 ⇒ 什么也不做（按钮那边本来就画成置灰）
//   · 'free' 去广告玩家 ⇒ **直接给**（付费玩家不失去功能），但照样吃额度
//   · 'ad'   看完才给；**拒绝/失败 ⇒ 什么也不发生**（不扣额度、不发奖励、不惩罚）
// ════════════════════════════════════════
function adGrant(kind, apply) {
  const mode = Shop.adMode(G.wallet, kind, Date.now());
  if (mode === 'no') return;
  const done = () => {
    Shop.adUse(G.wallet, kind, Date.now());     // ⚠ 只有**真拿到**才记账
    apply();
    saveWallet();
    renderAll();
  };
  if (mode === 'free') { done(); return; }
  Ads.showRewarded().then(ok => { if (ok) done(); else renderAll(); });
}
/** 奖励要看得见 —— 发了什么当场说清楚（看不见的奖励等于没给）*/
function adToast(text) {
  FX.toast(text, Render.L.cx, GameGlobal.SH * 0.42, '#ffe08a', 'bold 20px sans-serif', 1.4);
  Sound.coin(3);                                // 奖励到账 = 叮当，不是又一次 SWEEP
  if (Haptics.medium) Haptics.medium(); else Haptics.light();
}
/** 开局礼包只在「这一局还没落子」时给（它是开局礼包，不是随时补给）*/
function canBoost() {
  const s = G.s;
  return !!(G.phase === 'PLAYING' && s && !s.over && s.stats.turns === 0 && G.items);
}
/** 🧱 送方块：局中随时可用，但**每日/挑战局禁用** —— 同一条块流的分数必须可比 */
function canBlocks() {
  const s = G.s;
  return !!(G.phase === 'PLAYING' && s && !s.over && !s.daily && !s.challenge);
}
/**
 * 下一款可被广告解锁的皮肤：**先给盘数款**（本来就是白送的，只是提前），没有了才给金币款。
 * ⛔ 星星皮肤永远不进这个池子 —— 星星是三星通关的兑现，卖掉它等于把关卡奖励作废。
 */
function nextLockedSkin() {
  const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
  const owned = G.wallet.themes || [], games = G.wallet.gamesPlayed | 0;
  const lockedOf = key => Themes.THEMES.filter(t => t[key] != null && !Themes.isUnlocked(t, stars, owned, games));
  return lockedOf('games')[0] || lockedOf('coins')[0] || null;
}

/** 新解锁的成就：弹一条 toast（不打断玩法）*/
function announce(freshIds) {
  if (!freshIds || !freshIds.length) return;
  saveProfile();
  Sound.levelUp();                              // 解锁成就原来是**完全没有声音**的
  const Lo = Render.L;
  freshIds.slice(0, 2).forEach((id, i) => {
    FX.toast('🏆 ' + T('blockblast.ach.' + id), Lo.cx, Lo.boardY + 40 + i * 30,
             '#ffe08a', 'bold 15px sans-serif', 1);
  });
}

/** 一局结束（无尽/每日）：结算成就 + 每日 */
function settleRun() {
  const s = G.s;
  const fresh = Achievements.settle(G.profile, s);
  if (s.daily) {
    // ⚠ 用**谜题自己的日期**结算（s.daily = YYYYMMDD），不是「现在」——
    //    补玩过去 7 天的题时，用今天的日期会把成绩记到错误的天上。
    const id = s.daily;
    const d = new Date(Math.floor(id / 10000), Math.floor(id / 100) % 100 - 1, id % 100);
    const r = Daily.settleDaily(G.profile, d, s.score, s.backfill);
    if (r.first) { Shop.earnDaily(G.wallet); saveWallet(); }
    if (!s.backfill) {
      // 连续天数奖励阶梯（3/7/14/30 天，一档一次）
      const m = Daily.streakReward(G.profile);
      if (m) {
        G.wallet.coins += m.coins;
        Shop.earnAngels(G.wallet, m.angels);
        saveWallet();
        FX.toast('\u{1F525} ' + T('blockblast.streakMilestone', { d: m.days }) + '  +' + m.coins + '\u{1FA99}',
                 Render.L.cx, Render.L.boardY - 44, '#ffe08a', 'bold 15px sans-serif', 1.4);
        if (Haptics.heavy) Haptics.heavy();
      }
      // 断签（恰好漏 1 天）⇒ 结算页给「金币补签」按钮
      if (r.broken) G.repairOffer = { prev: r.broken };
      Notify.reschedule(G.opts, G.profile);    // 今天玩过了 ⇒ 撤掉今晚的 streak 保护提醒
    }
    GC.submit('daily', s.score);               // Game Center 每日榜（原生；BEST_SCORE 重复提交无害）
    fresh.push(...Achievements.check(G.profile));
  }
  announce(fresh);
  saveProfile();
}

/** 开每日谜题：同一天全球同一条块流。backfill = 日历页补玩过去的题（只记成绩不计 streak）*/
function startDaily(date, backfill) {
  G.s = Daily.newDaily(date || new Date());
  if (backfill) G.s.backfill = true;
  resetRunUi();
  G.items = Shop.newRunItems();
}

// ── 事件消费：core 事件流 → 画面 + 声音（DESIGN §8）+ 每日任务进度 ──
function consume(events) {
  if (!events) return;
  const Lo = Render.L, s = G.s;
  const qDay = Daily.dayNo(new Date());
  const qdone = [];                                  // 本次事件流里新完成的任务

  for (const e of events) {
    if (e.t === 'place') {
      const piece = Pieces.byId(e.piece);
      const col = Render.colorOf(e.piece);
      for (const [dr, dc] of piece.cells) G.cellColor[Core.idx(e.r + dr, e.c + dc)] = col;
      // 最近 3 手（死亡回放用）；放下第一块后 FTUE 指引退场
      G.recentPlaces.push(piece.cells.map(([dr, dc]) => [e.r + dr, e.c + dc]));
      if (G.recentPlaces.length > 3) G.recentPlaces.shift();
      G.hint = null;
      Sound.place();
      Haptics.light();

    } else if (e.t === 'clear') {
      // 逐格延迟扩散消失（不是整行同时消失）+ 碎片粒子
      const cells = [];
      for (const r of e.rows) for (let c = 0; c < 8; c++) cells.push([r, c]);
      for (const c of e.cols) for (let r = 0; r < 8; r++) cells.push([r, c]);
      for (const [r, c] of cells) {
        const { x, y } = Render.cellXY(r, c);
        const col = G.cellColor[Core.idx(r, c)] || Render.COLORS[4];
        // 延迟按「离消除中心的距离」递增 ⇒ 扩散感 = "我引爆了它"
        const dist = e.rows.length ? Math.abs(c - 3.5) : Math.abs(r - 3.5);
        const delay = dist * 0.02;
        FX.killCell(x, y, Lo.cell, col, delay);
        FX.burst(x + Lo.cell / 2, y + Lo.cell / 2, col, 4);
        G.cellColor[Core.idx(r, c)] = null;
      }
      qdone.push(...Quests.bump(G.profile, qDay, 'lines', e.L));
      const praise = e.L >= 4 ? 'unbelievable' : e.L === 3 ? 'amazing' : e.L === 2 ? 'great' : 'good';
      FX.toast(T('blockblast.praise.' + praise), Lo.cx, Lo.boardY + Lo.boardW / 2,
        '#ffe08a', 'bold 30px sans-serif', e.L >= 3 ? 1.25 : 1);
      FX.shake(Math.min(3 + e.L * 3, 14));
      Sound.clear(e.streak, e.L);
      Haptics.medium ? Haptics.medium() : Haptics.light();

    } else if (e.t === 'sweep') {
      FX.toast(T('blockblast.sweep.' + e.kind), Lo.cx, Lo.boardY + Lo.boardW / 2 - 50,
        e.kind === 'perfect' ? '#ffffff' : '#7ef2a0',
        'bold ' + (e.kind === 'perfect' ? 40 : 30) + 'px sans-serif', 1.3);
      FX.shake(e.kind === 'perfect' ? 22 : 12);
      Sound.sweep(e.kind);
      qdone.push(...Quests.bump(G.profile, qDay, 'sweep', 1));
      // 最爽的时刻要有触觉（DESIGN §8：PERFECT = 最高音效 + 长震动 —— 之前漏了）
      if (Haptics.heavy) Haptics.heavy(); else Haptics.medium ? Haptics.medium() : Haptics.light();

    } else if (e.t === 'collect') {
      // 水晶飞向顶部目标条（贝塞尔感：用粒子近似）+ 叮；顺手记图鉴的累计收集数
      G.profile.crystals = G.profile.crystals || {};
      qdone.push(...Quests.bump(G.profile, qDay, 'crystals', e.gained.length));
      for (const g of e.gained) {
        G.profile.crystals[g.kind] = (G.profile.crystals[g.kind] || 0) + 1;
        const r = Math.floor(g.i / 8), c = g.i % 8;
        const { x, y } = Render.cellXY(r, c);
        FX.burst(x + Lo.cell / 2, y + Lo.cell / 2, '#67e8f9', 6);
      }
      Sound.collect();                          // 水晶 = 玻璃质感，和 SWEEP 分得开

    } else if (e.t === 'win') {
      const prev = G.progress[s.levelId] || 0;
      if (e.stars > prev) { G.progress[s.levelId] = e.stars; saveProgress(); }
      // 累计统计 → 成就（星数按「每关最好成绩」求和，重打不会灌水）
      G.profile.levelsWon += 1;
      G.profile.stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
      if (!s.usedUndo) G.profile.cleanWins += 1;
      announce(Achievements.check(G.profile));
      saveProfile();                              // 图鉴的水晶累计也在 profile 里，赢了就落盘
      const won = Shop.earnLevel(G.wallet, e.stars);
      // 去广告玩家：原本要看广告才拿的翻倍**直接给**（红线：付费玩家不失去任何功能）
      if (G.wallet.noAds) { Shop.earnDouble(G.wallet, won); G.lastEarn = { n: won * 2, doubled: true }; }
      else G.lastEarn = { n: won, doubled: false };
      // ⛔ 插屏只在**通关结算**（正反馈时刻）出，且过总闸门（前 50 盘零插屏 / 每 10 盘至多 1 个 / ≥2min）。
      //    失败/局中永远不出。
      Shop.notePlayed(G.wallet);                  // 这一盘计入盘数
      qdone.push(...Quests.bump(G.profile, qDay, 'win', 1));
      qdone.push(...Quests.bump(G.profile, qDay, 'games', 1));
      G.newAngels = Shop.earnAngels(G.wallet, 2); // 通关 = 收集 2 张天使图
      // 三星通关 = 幸福时刻：满足条件时请求原生评分弹窗（rate.js 内部管额度）
      if (e.stars === 3) { Rate.maybeAsk(G); saveProfile(); }
      const show = Shop.canShowInterstitial(G.wallet);
      if (show) Shop.noteAdShown(G.wallet);
      saveWallet();
      if (show) Ads.showInterstitial().finally(() => renderAll());
      FX.toast(T('blockblast.levelWin'), Lo.cx, Lo.boardY + Lo.boardW / 2, '#7ef2a0', 'bold 30px sans-serif', 1.3);
      FX.shake(16);
      Sound.sweep('perfect');
      if (Haptics.heavy) Haptics.heavy();

    } else if (e.t === 'unwinnable') {
      // 软锁死兜底：这是**我们的**错，不是玩家的 ⇒ 免费重开，绝不推广告
      s.unwinnable = true;
      Sound.over();

    } else if (e.t === 'over') {
      Sound.over();
      // 死亡序列（DESIGN §2「失败必须可归因」）：先回放最后几手，再逐块红色扫盘
      // 演示「剩余的每一块确实都放不下」。结算浮层等它播完才出现（点一下可跳过）。
      const remN = Core.remaining(s).length;
      if (remN > 0) {
        const prologue = Math.min(G.recentPlaces.length, 3) * 0.3;
        G.overAnim = { t: 0, prologue, per: 0.55, n: remN, total: prologue + remN * 0.55 + 0.2 };
      }
      scheduleReview();     // 「其实第 N 手换个放法还能再走 X 步」——算得出才说
      // ⚠ 只有**无尽模式**的结束才动最高分和 K_RUN：
      //    关卡失败也会走 'over'，若不门控，关卡的分数会污染无尽的最高分、还会抹掉无尽存档。
      if (s.mode === 'endless') {
        const pure = !s.daily && !s.challenge;         // 每日/挑战是另两条赛道，不动无尽的账
        if (pure && s.score > G.best) {
          G.newBestRun = true;                         // 结算页靠这个标志：下面 best 更新后 score>best 就永远假了
          G.best = s.score;
          try { Platform.storage.set(K_BEST(), String(G.best)); } catch (err) {}
        }
        settleRun();
        if (pure) clearRun();
        // 无尽也产金币（原来无尽零产出 ⇒ 金币经济和主模式脱节）+ 去广告玩家直接翻倍
        const earned = Shop.earnEndless(G.wallet, s.score);
        if (earned > 0 && G.wallet.noAds) { Shop.earnDouble(G.wallet, earned); G.lastEarn = { n: earned * 2, doubled: true }; }
        else G.lastEarn = { n: earned, doubled: false };
        Shop.notePlayed(G.wallet);                     // 每完成一盘都计数（无尽/每日/挑战）
        qdone.push(...Quests.bump(G.profile, qDay, 'games', 1));
        G.newAngels = Shop.earnAngels(G.wallet, 1 + (G.newBestRun ? 1 : 0));   // 每盘 +1，破纪录再 +1
        if (G.newBestRun && Rate.maybeAsk(G)) saveProfile();   // 破纪录也是幸福时刻；记账必须落盘（额度保守原则）
        if (pure) GC.submit('endless', s.score);       // Game Center 无尽榜
        saveWallet();
      } else {
        Shop.notePlayed(G.wallet);                     // 关卡失败也是一盘（但失败永远不出广告）
        qdone.push(...Quests.bump(G.profile, qDay, 'games', 1));
        G.newAngels = Shop.earnAngels(G.wallet, 1);    // 失败也收集 1 张（收集不惩罚失败）
        saveWallet();
        saveProfile();                                 // 图鉴收集数落盘
      }
    }
  }

  // 天使榜：这一步超过了谁就立刻说（明确是游戏角色，绝不称「玩家」——DESIGN §7 红线）
  if (s.mode === 'endless' && G.scoreBefore != null) {
    const crossed = Ghosts.crossed(G.scoreBefore, s.score);
    if (crossed.length) {
      const g = crossed[crossed.length - 1];        // 一步跨多档只报最高那个
      FX.toast('✨ ' + T('blockblast.ghostBeat', { name: g.name }), Render.L.cx, Render.L.boardY - 64,
               '#fbcfe8', 'bold 16px sans-serif', 1.3);
      Sound.collect();
    }
  }
  G.scoreBefore = null;

  // 破纪录的**瞬间**就庆祝（原来只在结算页提一句 —— 而且那行还因为 best 先被更新永远不显示）
  if (s.mode === 'endless' && !s.daily && !s.challenge && !s.over && !G.bestToastShown
      && G.best > 0 && s.score > G.best) {
    G.bestToastShown = true;
    FX.toast(T('blockblast.newBest'), Render.L.cx, Render.L.boardY - 24, '#7ef2a0', 'bold 22px sans-serif', 1.4);
    FX.burst(Render.L.cx, Render.L.boardY - 24, '#7ef2a0', 14);
    Sound.sweep('sweep');
    Haptics.medium ? Haptics.medium() : Haptics.light();
  }

  // 每日任务：单盘极值型（分数/最长连击）每批事件后对账；完成的统一发奖励
  qdone.push(...Quests.bump(G.profile, qDay, 'score', s.score));
  qdone.push(...Quests.bump(G.profile, qDay, 'streak', s.stats.maxStreak));
  if (qdone.length) {
    for (let i = 0; i < qdone.length; i++) {
      G.wallet.coins += Quests.REWARD.coins;
      Shop.earnAngels(G.wallet, Quests.REWARD.angels);
    }
    FX.toast('\u{1F4CB} ' + T('blockblast.questDone') + '  +' + (Quests.REWARD.coins * qdone.length) + '\u{1FA99}',
             Render.L.cx, Render.L.boardY - 44, '#7ef2a0', 'bold 15px sans-serif', 1.3);
    Sound.coin(qdone.length + 1);
    saveWallet();
    saveProfile();
  }

  // ⚠ K_RUN 只存**纯无尽**局：每日/挑战若也写进去，恢复时 daily/challenge 标志会丢，
  //    一局每日就把玩家没打完的无尽局覆盖掉了（实为老 bug，这次一并堵上）。
  if (!s.over && s.mode === 'endless' && !s.daily && !s.challenge) saveRun();
}

// ── 交互入口 ──
/**
 * ⭐ 分享的链接一律指向 **App Store**（engine/share.js），不是网页版 ——
 *   网页版不产生下载量/评分/排名，把朋友导过去等于白送掉一次转化。
 * ⚠ App Store 链接**带不了 ?seed=** ⇒ 「同一条块流比分数」这个卖点必须靠**文案里的种子号**
 *   兑现（装了 app 的朋友在设置里输种子即可）。⛔ 只换链接不写种子 = 把卖点悄悄删了。
 */
function challengeUrl() { return Share.link(); }

// 按钮点击音：⛔ 排除**自己就会发声**的那几个（叠在一起会糊），其余一律给一声轻 tap ——
// 原来除了道具键，整个菜单/商店/图鉴/设置**一个反馈音都没有**，点下去像坏了。
const QUIET_ACTIONS = { SKIP_OVERANIM: 1, UNDO: 1, REFRESH: 1, HINT: 1, CHEST: 1, EQUIP: 1, BUY_SKIN: 1 };

function dispatch(action, data) {
  if (!QUIET_ACTIONS[action]) Sound.tap();
  switch (action) {
    case 'RESTART': {
      // ⛔ 无尽转场插屏：**绝不盖在死亡瞬间**——只在玩家已点「再来一局」、决定继续之后的转场里，
      //    且过总闸门（前 50 盘零插屏 / 每 10 盘至多 1 个 / 距上次 ≥2min）。红线 1/3 不动。
      const s0 = G.s;
      if (s0 && s0.over && s0.mode === 'endless' && !s0.daily && !s0.challenge
          && Shop.canShowInterstitial(G.wallet, Date.now())) {
        Shop.noteAdShown(G.wallet, Date.now());
        saveWallet();
        Ads.showInterstitial().finally(() => { newRun(); renderAll(); });
        return;
      }
      if (s0 && s0.over && s0.challenge) { startChallenge(s0.seed); break; }   // 挑战局重开 = 同一种子再练
      newRun();
      break;
    }
    case 'PLAY_ENDLESS': {
      // ⚠ 有没打完的局 ⇒ 这个按钮是「继续」，不是重开 —— 原来一点就 newRun()，
      //    把玩家没打完的局静默毁掉（菜单上明确的「新开一局」才走 NEW_RUN）。
      const cur = G.s;
      if (cur && cur.mode === 'endless' && !cur.daily && !cur.challenge && !cur.over && cur.stats.turns > 0) {
        G.phase = 'PLAYING';
        break;
      }
      const saved = loadRun();
      if (saved) {
        G.s = saved;                       // loadRun 已恢复 cellColor
        G.drag = null; G.fly = null;
        G.phase = 'PLAYING';
        G.lastEarn = null; G.newBestRun = false; G.bestToastShown = false;
        G.overAnim = null; G.recentPlaces = []; G.hint = null;
        G.runStartAt = Date.now();
        G.items = Shop.newRunItems();
        FX.reset();
        break;
      }
      newRun();
      break;
    }
    case 'NEW_RUN': newRun(); break;
    case 'SKIP_OVERANIM': G.overAnim = null; break;
    case 'PAGE_SET': G.phase = 'SET'; break;
    case 'ACH_PAGE': {
      const pages = Math.max(1, Math.ceil(Achievements.total() / 20));
      G.achPage = Math.max(0, Math.min(pages - 1, G.achPage + data.d));
      break;
    }
    case 'TOGGLE_PREVIEW':
      G.opts.preview = !G.opts.preview;
      saveOpts();
      break;
    case 'TOGGLE_FX':
      G.opts.fx = !G.opts.fx;
      FX.enabled = G.opts.fx;
      if (!G.opts.fx) FX.reset();
      saveOpts();
      break;
    case 'PLAY_LEVEL': startLevel(data.id); break;
    case 'RETRY_LEVEL': startLevel(G.s.levelId); break;          // ⚠ 免费重来：零广告、零插屏
    case 'NEXT_LEVEL': {
      const next = G.s.levelId + 1;
      if (Levels.byId(next)) startLevel(next); else G.phase = 'MENU';
      break;
    }
    case 'MENU': G.phase = 'MENU'; break;
    case 'HOME': G.phase = 'HOME'; break;
    case 'PLAY_DAILY': startDaily(new Date(), false); break;
    case 'PAGE_CAL': G.phase = 'CAL'; break;
    case 'PLAY_DAILY_AT': {
      // 日历补玩：只允许过去 7 天（含今天）。off = 距今天几天
      const off = data.off | 0;
      if (off < 0 || off > 6) break;
      const d = new Date();
      d.setDate(d.getDate() - off);
      startDaily(d, off > 0);
      break;
    }
    case 'CHAPTER': G.chapter = data.id; break;
    case 'CHEST': {
      const ch = Levels.CHAPTERS.find(x => x.id === data.id);
      if (ch && Shop.claimChest(G.wallet, G.progress, ch)) {
        saveWallet();
        Sound.coin(5);                          // 宝箱 = 一把金币
        FX.toast('\u{1F381} +' + ch.chest, Render.L.cx, GameGlobal.SH * 0.4, '#ffe08a', 'bold 26px sans-serif', 1.4);
        if (Haptics.heavy) Haptics.heavy();
      }
      break;
    }
    case 'PAGE_DEX': G.phase = 'DEX'; break;
    case 'PAGE_ANG': G.phase = 'ANG'; G.angView = -1; break;
    case 'PAGE_QUESTS': G.phase = 'QUESTS'; break;
    case 'PAGE_STATS': G.phase = 'STATS'; break;
    case 'PAGE_LADDER': G.phase = 'LADDER'; break;
    case 'LAD_PAGE': {
      const pages = Math.max(1, Math.ceil(Ghosts.LADDER.length / 8));
      G.ladPage = Math.max(0, Math.min(pages - 1, (G.ladPage | 0) + data.d));
      break;
    }
    case 'REPAIR_STREAK': {
      // 金币补签：断签当场（结算页）有效，接回 prev+1 天
      const offer = G.repairOffer;
      if (offer && Daily.repairStreak(G.profile, G.wallet, offer.prev, Daily.REPAIR_COST)) {
        G.repairOffer = null;
        saveWallet();
        saveProfile();
        FX.toast('\u{1F525} ' + T('blockblast.dailyStreak', { n: G.profile.dailyStreak }), Render.L.cx, GameGlobal.SH * 0.4, '#ffe08a', 'bold 18px sans-serif', 1.3);
        Sound.sweep('deep');
      }
      break;
    }
    case 'SHARE_DAILY': {
      // Wordle 式每日分享：日期 + 分数 + 同种子链接（对方打开就是同一条块流）
      const id = G.s.daily || 0;
      const dstr = Math.floor(id / 10000) + '-' + String(Math.floor(id / 100) % 100).padStart(2, '0') + '-' + String(id % 100).padStart(2, '0');
      const text = T('blockblast.shareDaily', { d: dstr, n: G.s.score })
                 + '\n' + T('blockblast.shareSeedTip', { n: G.s.seed })
                 + '\n' + challengeUrl();
      const done = () => {
        FX.toast(T('blockblast.challengeCopied'), Render.L.cx, Render.L.boardY + 40, '#7ef2a0', 'bold 15px sans-serif', 1.2);
        renderAll();
      };
      if (navigator.share) navigator.share({ text }).then(done).catch(() => renderAll());
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => renderAll());
      return;
    }
    case 'TOGGLE_REMIND':
      G.opts.remind = !G.opts.remind;
      saveOpts();
      Notify.reschedule(G.opts, G.profile);          // 开 = 申请权限并排期；关 = 全部取消
      break;
    case 'FB_OPEN': FB.open(); return;
    case 'ANG_PAGE': {
      const pages = Math.max(1, Math.ceil(Shop.ANGELS.total / 24));
      G.angPage = Math.max(0, Math.min(pages - 1, G.angPage + data.d));
      break;
    }
    case 'ANG_VIEW': G.angView = data.i; break;
    case 'ANG_CLOSE': G.angView = -1; break;
    case 'SKIN_PAGE': {
      const pages = Math.max(1, Math.ceil(Themes.THEMES.length / 6));
      G.skinPage = Math.max(0, Math.min(pages - 1, G.skinPage + data.d));
      break;
    }
    case 'PAGE_ACH': G.phase = 'ACH'; G.achPage = 0; break;
    case 'PAGE_SKIN': G.phase = 'SKIN'; break;
    case 'PAGE_FAIR': G.phase = 'FAIR'; break;
    case 'EQUIP': {
      const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
      const t = Themes.byId(data.id);
      if (Themes.isUnlocked(t, stars, G.wallet.themes, G.wallet.gamesPlayed)) {   // 二次校验：不能伪造点击装上未解锁皮肤
        G.theme = t.id;
        Render.applyTheme(t.id);
        try { Platform.storage.set(K_THEME(), t.id); } catch (e) {}
      }
      break;
    }
    case 'BUY_SKIN': {
      const t = Themes.byId(data.id);
      if (Shop.buyTheme(G.wallet, t)) {               // 内部校验价格/余额/重复购买
        saveWallet();
        G.theme = t.id;                               // 买完直接穿上（所见即所得）
        Render.applyTheme(t.id);
        try { Platform.storage.set(K_THEME(), t.id); } catch (e) {}
        Sound.pick();
      }
      break;
    }
    case 'DOUBLE_COINS': {
      // 结算页的「看广告金币×2」。拒绝/失败 ⇒ 什么也不发生（红线 2：绝不惩罚、绝不强塞）
      const earn = G.lastEarn;
      if (!earn || earn.doubled || !earn.n) return;
      Ads.showRewarded().then(rewarded => {
        if (rewarded && G.lastEarn === earn && !earn.doubled) {
          Shop.earnDouble(G.wallet, earn.n);
          earn.n *= 2;
          earn.doubled = true;
          saveWallet();
        }
        renderAll();
      });
      return;
    }
    case 'SHARE_SEED': {
      // 种子挑战：块流由种子定死 ⇒ 「同一条块流比分数」天然成立（公平机制的病毒式副产品）
      const text = T('blockblast.shareText', { n: G.s.score })
                 + '\n' + T('blockblast.shareSeedTip', { n: G.s.seed })
                 + '\n' + challengeUrl();
      const done = () => {
        FX.toast(T('blockblast.challengeCopied'), Render.L.cx, Render.L.boardY + 40, '#7ef2a0', 'bold 15px sans-serif', 1.2);
        renderAll();
      };
      if (navigator.share) navigator.share({ text }).then(done).catch(() => renderAll());
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => renderAll());
      return;
    }
    case 'HINT': {
      // 💡 教练提示 = **这一手的最优落点**（Coach 用当前盘面 + 公开块流现算，不是启发式口号）。
      //    每局第一次免费；之后看广告（每天 3 次）。⛔ 拒绝 ⇒ 什么也不发生。
      if (G.phase !== 'PLAYING' || !G.s || G.s.over) return;
      const give = () => {
        const m = Coach.best(G.s);
        if (!m) return;
        G.coachHint = { slot: m.slot, r: m.r, c: m.c };
        Sound.pick();
      };
      if (G.items && G.items.hintFree > 0) { G.items.hintFree--; give(); break; }
      adGrant('hint', give);
      return;
    }
    case 'AD_BLOCKS':
    case 'BUY_BLOCKS': {
      // 🧱 送方块：接下来 2 手托盘全是 1×1 —— 盘面越满它越救命。
      // ⛔ 它**不动块流**（Core.grantBonusHands：礼包手期间 streamIndex 一动不动，用完从原来那块继续）
      //    ⇒ 公平承诺一个字不用改。⛔ 每日/挑战局禁用（同种子的分数必须可比）——core 里也拦了一道。
      if (!canBlocks()) return;
      const give = () => {
        if (!Core.grantBonusHands(G.s, Shop.AD_REWARD.blocks)) return;
        adToast('\u{1F9F1} ×' + (Shop.AD_REWARD.blocks * 3));
        if (G.s.mode === 'endless' && !G.s.daily && !G.s.challenge) saveRun();
      };
      if (action === 'BUY_BLOCKS') {
        if (Shop.buyWithCoins(G.wallet, 'blocks')) { give(); saveWallet(); }
        break;
      }
      adGrant('blocks', give);
      return;
    }
    case 'PAGE_WEAK': G.phase = 'WEAK'; break;         // 「我的弱点」：教练账本的读出口
    case 'UNDO': useItem('undo'); return;              // 走 Shop 的三段阶梯（免费/广告/金币）
    case 'REFRESH': useItem('refresh'); return;
    case 'PAGE_SHOP': G.phase = 'SHOP'; break;
    case 'AD_COINS':
      adGrant('coins', () => {
        Shop.earnAd(G.wallet);
        adToast('+' + Shop.AD_REWARD.coins + '\u{1FA99}');
      });
      return;
    case 'AD_GIFT':
      // 🎁 每日礼物（HOME，每天一次）——最轻的回访理由：进来点一下就有东西拿
      adGrant('gift', () => {
        const r = Shop.grantGift(G.wallet);
        adToast('\u{1F381} +' + r.coins + '\u{1FA99}' + (r.angels ? '  +' + r.angels + '\u{1F47C}' : ''));
      });
      return;
    case 'AD_BOOST':
      // 🚀 开局礼包：只在**这一局还没落子**时给（它是「开局」礼包，不是随时补给）
      if (!canBoost()) return;
      adGrant('boost', () => {
        Shop.grantBoost(G.items);
        adToast('\u{1F680} +' + Shop.AD_REWARD.boost.undo + '\u{21B6}  +' + Shop.AD_REWARD.boost.refresh + '\u{27F3}');
      });
      return;
    case 'BUY_BOOST':
      // 不想看广告的人的出口（也是金币的去处）
      if (!canBoost()) return;
      if (Shop.buyWithCoins(G.wallet, 'boost')) {
        Shop.grantBoost(G.items);
        saveWallet();
        adToast('\u{1F680} +' + Shop.AD_REWARD.boost.undo + '\u{21B6}  +' + Shop.AD_REWARD.boost.refresh + '\u{27F3}');
      }
      break;
    case 'AD_SKIN':
      // 🎨 皮肤解锁：看广告直接永久解锁一款未解锁的金币皮肤（每天 1 款）
      if (!nextLockedSkin()) return;
      adGrant('skin', () => {
        const t = nextLockedSkin();
        if (!t) return;
        if (!Array.isArray(G.wallet.themes)) G.wallet.themes = [];
        G.wallet.themes.push(t.id);
        G.theme = t.id;                       // 解锁即穿上（所见即所得）
        Render.applyTheme(t.id);
        try { Platform.storage.set(K_THEME(), t.id); } catch (e) {}
        adToast('\u{1F3A8} ' + T('blockblast.theme.' + t.id));
      });
      return;
    case 'AD_QUEST':
      // 📋 任务加速：直接完成一个今日任务（奖励与自己打完**完全一致**）
      adGrant('quest', () => {
        const q = Quests.forceComplete(G.profile, Daily.dayNo(new Date()));
        if (!q) return;
        G.wallet.coins += Quests.REWARD.coins;
        Shop.earnAngels(G.wallet, Quests.REWARD.angels);
        saveProfile();
        adToast('\u{1F4CB} +' + Quests.REWARD.coins + '\u{1FA99}  +' + Quests.REWARD.angels + '\u{1F47C}');
      });
      return;
    case 'AD_GALLERY':
      // 👼 图鉴加速：+5 张画像（长线收集的加速器，纯外观、不碰玩法）
      adGrant('gallery', () => {
        const n = Shop.grantGallery(G.wallet);
        adToast('\u{1F47C} +' + n);
      });
      return;
    case 'BUY_GALLERY':
      if ((G.wallet.angels | 0) >= Shop.ANGELS.total) return;
      if (Shop.buyWithCoins(G.wallet, 'gallery')) {
        const n = Shop.grantGallery(G.wallet);
        saveWallet();
        adToast('\u{1F47C} +' + n);
      }
      break;
    case 'SHOW_GC':
      GC.show(data && data.board);
      return;
    default: break;
  }
  renderAll();
}
function onPlace(slot, r, c) {
  G.scoreBefore = G.s.score;                  // 天使榜局中超越检测要「落子前的分」
  // 教练：评价和复盘都要**落子前**的局面 ⇒ 先拍快照、先判分，再真的落子
  const snap = Coach.clone(G.s);
  const verdict = Coach.judge(G.s, { slot, r, c });
  const evs = Core.place(G.s, slot, r, c);
  if (evs) {
    Shop.onTurn(G.items);                     // 每落一子给「换一手」充能
    noteCoach(snap, { slot, r, c }, verdict);
  }
  consume(evs);
  renderAll();
}

/**
 * 记一手的教练账（DESIGN §2 的延伸：不但要「失败可归因」，还要「赢在哪、错在哪」可归因）。
 * ⛔ 只在**妙手**时出声。失误一律静默记账 ——「每一手都点评」的教练是烦人精，不是教练；
 *    失误的用途是死亡复盘那一句话 + 「我的弱点」页，不是当场戳玩家。
 */
function noteCoach(snap, mv, verdict) {
  G.coachHint = null;                         // 落了子，提示作废
  G.history.push({ s: snap, mv, turn: snap.stats.turns + 1 });
  if (G.history.length > 3) G.history.shift();
  if (!verdict) return;
  if (verdict.grade === 'brilliant') {
    G.profile.brilliants = (G.profile.brilliants || 0) + 1;
    FX.toast('✨ ' + T('blockblast.brilliant'), Render.L.cx, Render.L.boardY - 24,
             '#ffe08a', 'bold 17px sans-serif', 1.1);
    Sound.brilliant();
    saveProfile();
  } else if (verdict.grade === 'miss' && verdict.tag) {
    if (!G.profile.faults) G.profile.faults = { missLine: 0, isolate: 0 };
    G.profile.faults[verdict.tag] = (G.profile.faults[verdict.tag] || 0) + 1;
    saveProfile();
  }
}

/**
 * 死亡复盘：死亡序列已经证明了「剩下的每一块确实都放不下」，这里回答**为什么会走到这一步**。
 * ⚠ 异步跑（几百毫秒的模拟），趁死亡动画播放期间算完；算不出「其实还有救」就**不编故事**。
 */
function scheduleReview() {
  G.review = null;
  const hist = G.history.slice();
  if (!hist.length) return;
  setTimeout(() => {
    // ⚠ 参数是量过的：单测里 judge≈0ms、这一次复盘≈3ms（死亡序列本身要播 1-2s）⇒ 深一点也无感
    try { G.review = Coach.postmortem(hist, { top: 4, limit: 20, min: 3 }); } catch (e) { G.review = null; }
    renderAll();
  }, 50);
}

// ── 主循环：只在「有动画 / 正在拖拽 / 有脉冲状态」时逐帧重画，静止时不烧电 ──
/** 需要持续重画的脉冲状态：死亡序列 / FTUE 指引 / streak 宽限警示 / 濒死心跳。
 *  都是短时状态（几秒到几十秒），不构成常驻耗电。*/
function pulseActive() {
  if (G.overAnim) return true;
  // 🏠 主界面的装饰层（极光/星星/云海/圣光）是动的 ⇒ 停在这一屏时要逐帧重画。
  // ⚠ 关掉「粒子/动态」就退回静止（renderHome 用固定时刻画），此时不必再烧电。
  if (G.phase === 'HOME') return !!(G.opts && G.opts.fx);
  const s = G.s;
  if (G.phase !== 'PLAYING' || !s || s.over) return false;
  if (G.hint) return true;
  if (s.dryTurns === 1 && s.streak >= 2) return true;                       // 宽限中：COMBO 标签闪
  if (s.mode === 'endless' && Core.fillCount(s.board) >= 48) return true;   // fill≥75%：心跳
  return false;
}
let last = 0;
function loop(ts) {
  const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
  last = ts;
  G.animClock = (G.animClock + dt) % 3600;
  // 濒死心跳：视觉早就有（fill≥75% 的脉冲），听觉一直是空的。
  // ⚠ 音量必须很轻、间隔 1.6s —— 它是**氛围**，不是警报（做成警报会把人吓跑）。
  {
    const s0 = G.s;
    const dying = G.phase === 'PLAYING' && s0 && !s0.over && !G.overAnim
                  && Core.fillCount(s0.board) >= 54;
    if (!dying || G.animClock < (G.hbAt || 0)) G.hbAt = -9;    // 不濒死 / 时钟回绕 ⇒ 复位
    if (dying && G.animClock - G.hbAt > 1.6) { G.hbAt = G.animClock; Sound.heartbeat(); }
  }
  if (G.overAnim) {
    G.overAnim.t += dt;
    if (G.overAnim.t >= G.overAnim.total) { G.overAnim = null; renderAll(); }   // 播完补一帧：结算浮层登场
  }
  if (FX.busy() || Drag.busy(G) || pulseActive()) {
    FX.update(dt);
    Drag.tick(G, dt);          // 拾起放大 / 回弹
    renderAll();
  }
  requestAnimationFrame(loop);
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), K_BEST(), K_RUN(), K_PROG(), K_PROFILE(), K_THEME(), K_WALLET(), K_OPTS()]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  // Game Center / 推送提醒 / 反馈补发：原生才生效，web 静默 no-op；不 await —— 不阻塞首屏。
  GC.signIn();
  FB.flush();
  // 天使画像的 manifest（共享素材，engine/angels.js）：**这里只开始下载、绝不 renderAll**
  // —— 此时 initCanvas() 还没跑，ctx 不存在（E2E 抓到：`createLinearGradient of undefined`）。
  // 补帧放在 boot 末尾（load 幂等，第二次调用拿的是同一个 promise）。
  Angels.load();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();

  G.best = parseInt(Platform.storage.get(K_BEST()) || '0', 10) || 0;
  try { G.progress = JSON.parse(Platform.storage.get(K_PROG()) || '{}') || {}; } catch (e) { G.progress = {}; }
  // profile：缺字段用默认值补齐（老档也能平滑升级；成就 id 是稳定的，不会错位）
  try {
    const raw = JSON.parse(Platform.storage.get(K_PROFILE()) || 'null');
    G.profile = Object.assign(Achievements.emptyProfile(), raw || {});
    if (!Array.isArray(G.profile.unlocked)) G.profile.unlocked = [];
  } catch (e) { G.profile = Achievements.emptyProfile(); }
  try {
    const raw = JSON.parse(Platform.storage.get(K_WALLET()) || 'null');
    G.wallet = Object.assign(Shop.emptyWallet(), raw || {});
  } catch (e) { G.wallet = Shop.emptyWallet(); }
  if (!G.wallet.installAt) { G.wallet.installAt = Date.now(); saveWallet(); }   // 首日免打扰的时钟从这里起跳
  try {
    G.opts = Object.assign({ fx: true, preview: true, remind: false }, JSON.parse(Platform.storage.get(K_OPTS()) || 'null') || {});
  } catch (e) { G.opts = { fx: true, preview: true, remind: false }; }
  FX.enabled = !!G.opts.fx;
  G.items = Shop.newRunItems();
  const savedTheme = Platform.storage.get(K_THEME()) || 'candy';
  const stars0 = Object.values(G.progress).reduce((a, v) => a + v, 0);
  G.theme = Themes.isUnlocked(Themes.byId(savedTheme), stars0, G.wallet.themes, G.wallet.gamesPlayed) ? savedTheme : 'candy';
  Render.applyTheme(G.theme);
  // ?seed= 好友挑战链接 → 直接开一局同种子（优先于恢复存档；不动无尽存档，退出后还能续）
  let qseed = null;
  try {
    const v = new URLSearchParams(location.search).get('seed');
    if (v && /^\d{1,10}$/.test(v)) qseed = parseInt(v, 10) >>> 0;
  } catch (e) {}
  const resumed = qseed === null ? loadRun() : null;
  if (qseed !== null) startChallenge(qseed);
  else if (resumed) { G.s = resumed; G.phase = 'PLAYING'; G.runStartAt = Date.now(); }
  else { G.s = Core.newGame(Dealer.randomSeed()); G.phase = 'HOME'; }   // ⭐ 起手在主界面

  Input.bind({ onAction: dispatch });                      // 只处理浮层按钮（棋盘/托盘不注册 hit）
  Drag.bind(document.getElementById(CFG.canvasId), { onPlace, onChange: renderAll });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Notify.reschedule(G.opts, G.profile);    // 每日/streak 提醒（要 profile 就位后才能排，故放 boot 尾部）
  Controls.render();
  renderAll();
  Angels.load().then(() => renderAll());     // manifest 到了补一帧（此时 ctx 已就位）
  if (qseed !== null) {        // 挑战局开场提示（toast 依赖 renderAll 先把布局算出来）
    FX.toast(T('blockblast.challengeRun'), Render.L.cx, Render.L.boardY - 24, '#ffd6e7', 'bold 15px sans-serif', 1.5);
  }
  requestAnimationFrame(loop);
}

boot();
