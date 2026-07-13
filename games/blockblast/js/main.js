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
};

// ── 存档 ──
const K_BEST = () => CFG.key('best');
const K_RUN = () => CFG.key('run');
const K_PROG = () => CFG.key('progress');
const K_PROFILE = () => CFG.key('profile');
const K_THEME = () => CFG.key('theme');
const K_WALLET = () => CFG.key('wallet');

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

// ── 新局 ──
function newRun() {
  G.s = Core.newGame(Dealer.randomSeed());
  G.cellColor = new Array(Core.N).fill(null);
  G.drag = null;
  G.fly = null;
  G.phase = 'PLAYING';
  G.items = Shop.newRunItems();
  FX.reset();
  clearRun();
}

/** 开一关。每次重开换一个新种子（块流不同）—— 但**绝不看你之前失败过几次**。*/
function startLevel(id) {
  const def = Levels.byId(id);
  if (!def) return;
  G.s = Core.newLevel(def, Dealer.randomSeed());
  G.cellColor = new Array(Core.N).fill(null);
  // 预置块也要有颜色（关卡盘面不能是一片死灰）
  for (let i = 0; i < Core.N; i++) {
    if (G.s.board[i] && !G.s.stone[i]) G.cellColor[i] = Render.COLORS[(i * 3) % Render.COLORS.length];
  }
  G.drag = null; G.fly = null;
  G.phase = 'PLAYING';
  G.items = Shop.newRunItems();
  FX.reset();
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
    const r = Daily.settleDaily(G.profile, new Date(), s.score);
    if (r.first) { Shop.earnDaily(G.wallet); saveWallet(); }
    fresh.push(...Achievements.check(G.profile));
  }
  announce(fresh);
  saveProfile();
}

/** 开今天的每日谜题：同一天全球同一条块流 */
function startDaily() {
  G.s = Daily.newDaily(new Date());
  G.cellColor = new Array(Core.N).fill(null);
  G.drag = null; G.fly = null;
  G.phase = 'PLAYING';
  FX.reset();
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

    } else if (e.t === 'collect') {
      // 水晶飞向顶部目标条（贝塞尔感：用粒子近似）+ 叮
      for (const g of e.gained) {
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
      Shop.earnLevel(G.wallet, e.stars);
      // ⛔ 插屏**只在通关**（正反馈时刻）出，且每 3 次通关最多一个。失败/局中永远不出。
      const show = Shop.canShowInterstitial(G.wallet);
      Shop.noteWin(G.wallet, show);
      saveWallet();
      if (show) Ads.showInterstitial().finally(() => renderAll());
      FX.toast(T('blockblast.levelWin'), Lo.cx, Lo.boardY + Lo.boardW / 2, '#7ef2a0', 'bold 30px sans-serif', 1.3);
      FX.shake(16);
      Sound.sweep('perfect');

    } else if (e.t === 'unwinnable') {
      // 软锁死兜底：这是**我们的**错，不是玩家的 ⇒ 免费重开，绝不推广告
      s.unwinnable = true;
      Sound.over();

    } else if (e.t === 'over') {
      Sound.over();
      // ⚠ 只有**无尽模式**的结束才动最高分和 K_RUN：
      //    关卡失败也会走 'over'，若不门控，关卡的分数会污染无尽的最高分、还会抹掉无尽存档。
      if (s.mode === 'endless') {
        if (!s.daily && s.score > G.best) {            // 每日谜题的分不进无尽最高分（是两条赛道）
          G.best = s.score;
          try { Platform.storage.set(K_BEST(), String(G.best)); } catch (err) {}
        }
        settleRun();
        clearRun();
      }
    }
  }
  if (!s.over && s.mode === 'endless') saveRun();     // 关卡局不做续玩存档（重开成本低）
}

// ── 交互入口 ──
function dispatch(action, data) {
  switch (action) {
    case 'RESTART': newRun(); break;
    case 'PLAY_ENDLESS': newRun(); break;
    case 'PLAY_LEVEL': startLevel(data.id); break;
    case 'RETRY_LEVEL': startLevel(G.s.levelId); break;          // ⚠ 免费重来：零广告、零插屏
    case 'NEXT_LEVEL': {
      const next = G.s.levelId + 1;
      if (Levels.byId(next)) startLevel(next); else G.phase = 'MENU';
      break;
    }
    case 'MENU': G.phase = 'MENU'; break;
    case 'PLAY_DAILY': startDaily(); break;
    case 'PAGE_ACH': G.phase = 'ACH'; break;
    case 'PAGE_SKIN': G.phase = 'SKIN'; break;
    case 'PAGE_FAIR': G.phase = 'FAIR'; break;
    case 'EQUIP': {
      const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
      const t = Themes.byId(data.id);
      if (Themes.isUnlocked(t, stars)) {              // 二次校验：不能靠伪造点击装上没解锁的皮肤
        G.theme = t.id;
        Render.applyTheme(t.id);
        try { Platform.storage.set(K_THEME(), t.id); } catch (e) {}
      }
      break;
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

// ── 主循环：只在「有动画 / 正在拖拽」时逐帧重画，静止时不烧电 ──
let last = 0;
function loop(ts) {
  const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
  last = ts;
  if (FX.busy() || Drag.busy(G)) {
    FX.update(dt);
    Drag.tick(G, dt);          // 拾起放大 / 回弹
    renderAll();
  }
  requestAnimationFrame(loop);
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), K_BEST(), K_RUN(), K_PROG(), K_PROFILE(), K_THEME(), K_WALLET()]);
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
  G.items = Shop.newRunItems();
  const savedTheme = Platform.storage.get(K_THEME()) || 'candy';
  const stars0 = Object.values(G.progress).reduce((a, v) => a + v, 0);
  G.theme = Themes.isUnlocked(Themes.byId(savedTheme), stars0) ? savedTheme : 'candy';
  Render.applyTheme(G.theme);
  const resumed = loadRun();
  if (resumed) { G.s = resumed; G.phase = 'PLAYING'; }
  else { G.s = Core.newGame(Dealer.randomSeed()); G.phase = 'MENU'; }   // 起手在菜单

  Input.bind({ onAction: dispatch });                      // 只处理浮层按钮（棋盘/托盘不注册 hit）
  Drag.bind(document.getElementById(CFG.canvasId), { onPlace, onChange: renderAll });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();
  requestAnimationFrame(loop);
}

boot();
