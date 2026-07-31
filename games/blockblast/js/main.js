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
  achPage: 0,                    // 成就页当前页
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
      FX.toast(T('blockblast.pieceCryIntro'), Render.L.cx, Render.L.boardY - 24, '#86efac', 'bold 14px sans-serif', 1.5);
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

/** 新解锁的成就：弹一条 toast（不打断玩法）*/
function announce(freshIds) {
  if (!freshIds || !freshIds.length) return;
  saveProfile();
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

// ── 事件消费：core 事件流 → 画面 + 声音（DESIGN §8）──
function consume(events) {
  if (!events) return;
  const Lo = Render.L, s = G.s;

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
      // 最爽的时刻要有触觉（DESIGN §8：PERFECT = 最高音效 + 长震动 —— 之前漏了）
      if (Haptics.heavy) Haptics.heavy(); else Haptics.medium ? Haptics.medium() : Haptics.light();

    } else if (e.t === 'collect') {
      // 水晶飞向顶部目标条（贝塞尔感：用粒子近似）+ 叮；顺手记图鉴的累计收集数
      G.profile.crystals = G.profile.crystals || {};
      for (const g of e.gained) {
        G.profile.crystals[g.kind] = (G.profile.crystals[g.kind] || 0) + 1;
        const r = Math.floor(g.i / 8), c = g.i % 8;
        const { x, y } = Render.cellXY(r, c);
        FX.burst(x + Lo.cell / 2, y + Lo.cell / 2, '#67e8f9', 6);
      }
      Sound.sweep('sweep');

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
      // ⛔ 插屏**只在通关**（正反馈时刻）出，且每 3 次通关最多一个 + 首日/间隔护栏。失败/局中永远不出。
      const show = Shop.canShowInterstitial(G.wallet);
      Shop.noteWin(G.wallet, show);
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
        if (pure) {
          Shop.noteEndlessRun(G.wallet);               // 转场插屏的「每 3 局」计数
          G.lastRunMs = Date.now() - (G.runStartAt || Date.now());
        }
        saveWallet();
      } else {
        saveProfile();                                 // 关卡失败也要把图鉴收集数落盘
      }
    }
  }

  // 破纪录的**瞬间**就庆祝（原来只在结算页提一句 —— 而且那行还因为 best 先被更新永远不显示）
  if (s.mode === 'endless' && !s.daily && !s.challenge && !s.over && !G.bestToastShown
      && G.best > 0 && s.score > G.best) {
    G.bestToastShown = true;
    FX.toast(T('blockblast.newBest'), Render.L.cx, Render.L.boardY - 24, '#7ef2a0', 'bold 22px sans-serif', 1.4);
    FX.burst(Render.L.cx, Render.L.boardY - 24, '#7ef2a0', 14);
    Sound.sweep('sweep');
    Haptics.medium ? Haptics.medium() : Haptics.light();
  }

  // ⚠ K_RUN 只存**纯无尽**局：每日/挑战若也写进去，恢复时 daily/challenge 标志会丢，
  //    一局每日就把玩家没打完的无尽局覆盖掉了（实为老 bug，这次一并堵上）。
  if (!s.over && s.mode === 'endless' && !s.daily && !s.challenge) saveRun();
}

// ── 交互入口 ──
/** 挑战链接：web 上用当前地址，原生壳里用线上域名（分享出去的链接必须打得开）*/
function challengeUrl(seed) {
  try {
    if (!Platform.isNative && location.protocol.startsWith('http')) {
      return location.origin + location.pathname + '?seed=' + seed;
    }
  } catch (e) {}
  return 'https://blocks.ai-speeds.com/?seed=' + seed;
}

function dispatch(action, data) {
  switch (action) {
    case 'RESTART': {
      // ⛔ 无尽转场插屏：**绝不盖在死亡瞬间**——只在玩家已点「再来一局」、决定继续之后的转场里，
      //    且过四重护栏（首日零插屏 / 短局不出 / 距上次 ≥2min / 每 3 局最多 1 个）。红线 1/3 不动。
      const s0 = G.s;
      if (s0 && s0.over && s0.mode === 'endless' && !s0.daily && !s0.challenge
          && Shop.canShowEndlessInterstitial(G.wallet, G.lastRunMs || 0, Date.now())) {
        Shop.noteEndlessAdShown(G.wallet, Date.now());
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
        Sound.sweep('perfect');
        FX.toast('\u{1F381} +' + ch.chest, Render.L.cx, GameGlobal.SH * 0.4, '#ffe08a', 'bold 26px sans-serif', 1.4);
        if (Haptics.heavy) Haptics.heavy();
      }
      break;
    }
    case 'PAGE_DEX': G.phase = 'DEX'; break;
    case 'PAGE_ACH': G.phase = 'ACH'; G.achPage = 0; break;
    case 'PAGE_SKIN': G.phase = 'SKIN'; break;
    case 'PAGE_FAIR': G.phase = 'FAIR'; break;
    case 'EQUIP': {
      const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
      const t = Themes.byId(data.id);
      if (Themes.isUnlocked(t, stars, G.wallet.themes)) {   // 二次校验：不能靠伪造点击装上没解锁的皮肤
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
      const url = challengeUrl(G.s.seed);
      const text = T('blockblast.shareText', { n: G.s.score }) + ' ' + url;
      const done = () => {
        FX.toast(T('blockblast.challengeCopied'), Render.L.cx, Render.L.boardY + 40, '#7ef2a0', 'bold 15px sans-serif', 1.2);
        renderAll();
      };
      if (navigator.share) navigator.share({ text }).then(done).catch(() => renderAll());
      else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => renderAll());
      return;
    }
    case 'UNDO': useItem('undo'); return;              // 走 Shop 的三段阶梯（免费/广告/金币）
    case 'REFRESH': useItem('refresh'); return;
    case 'PAGE_SHOP': G.phase = 'SHOP'; break;
    case 'AD_COINS':
      Ads.showRewarded().then(rewarded => {
        if (rewarded) { Shop.earnAd(G.wallet); saveWallet(); }   // 拒绝 ⇒ 什么也不发生
        renderAll();
      });
      return;
    case 'BUY_NOADS':
      // TODO(P4b): 接真 IAP（RevenueCat）。web 上先本地开启，便于验证「买了之后功能不变少」。
      G.wallet.noAds = true;
      saveWallet();
      break;
    default: break;
  }
  renderAll();
}
function onPlace(slot, r, c) {
  const evs = Core.place(G.s, slot, r, c);
  if (evs) Shop.onTurn(G.items);            // 每落一子给「换一手」充能
  consume(evs);
  renderAll();
}

// ── 主循环：只在「有动画 / 正在拖拽 / 有脉冲状态」时逐帧重画，静止时不烧电 ──
/** 需要持续重画的脉冲状态：死亡序列 / FTUE 指引 / streak 宽限警示 / 濒死心跳。
 *  都是短时状态（几秒到几十秒），不构成常驻耗电。*/
function pulseActive() {
  if (G.overAnim) return true;
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
    G.opts = Object.assign({ fx: true, preview: true }, JSON.parse(Platform.storage.get(K_OPTS()) || 'null') || {});
  } catch (e) { G.opts = { fx: true, preview: true }; }
  FX.enabled = !!G.opts.fx;
  G.items = Shop.newRunItems();
  const savedTheme = Platform.storage.get(K_THEME()) || 'candy';
  const stars0 = Object.values(G.progress).reduce((a, v) => a + v, 0);
  G.theme = Themes.isUnlocked(Themes.byId(savedTheme), stars0, G.wallet.themes) ? savedTheme : 'candy';
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
  else { G.s = Core.newGame(Dealer.randomSeed()); G.phase = 'MENU'; }   // 起手在菜单

  Input.bind({ onAction: dispatch });                      // 只处理浮层按钮（棋盘/托盘不注册 hit）
  Drag.bind(document.getElementById(CFG.canvasId), { onPlace, onChange: renderAll });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();
  if (qseed !== null) {          // 挑战局开场提示（toast 依赖 renderAll 先把布局算出来）
    FX.toast(T('blockblast.challengeRun'), Render.L.cx, Render.L.boardY - 24, '#ffd6e7', 'bold 15px sans-serif', 1.5);
  }
  requestAnimationFrame(loop);
}

boot();
