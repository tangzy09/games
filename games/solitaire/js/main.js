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
  noAds: false,
  // ⚠ 双口径（DESIGN §4.5）：无限撤销会把总胜率架空 ⇒ 不分开记，统计就是假的
  stats: { played: 0, won: 0, cleanWon: 0, streak: 0, bestStreak: 0 },
  dailyDone: '',           // 今天的每日挑战完成了没（YYYYMMDD）
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
      usedUndo: s.usedUndo, usedHint: s.usedHint,
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
      fourColor: G.fourColor, bigText: G.bigText, dailyDone: G.dailyDone, seenIntro: G.seenIntro,
    }));
  } catch (e) {}
};

function newGame(drawCount, mode) {
  const md = mode || (G.s ? G.s.mode : 'klondike');
  const draw = drawCount || (G.s ? G.s.drawCount : 3);
  // ⭐ Klondike：只发**已验证可解**的牌局（池里取）。
  //    FreeCell：**不需要池** —— 本来就 ~100% 可解（32000 局里只有 #11982 无解），
  //    直接用微软局号随机取一个（这样玩家可以对照经典局号）。
  const seed = md === 'freecell'
    ? (1 + Math.floor(Math.random() * 32000))
    : (Pool.pick(draw, G.difficulty || 'any') != null
        ? Pool.pick(draw, G.difficulty || 'any') : Deal.randomSeed());
  G.s = Core.newGame(seed, draw, md);
  // 换局 = 放弃了上一局 ⇒ 连胜断（没打完就换，不能算赢）
  if (G.s && !G.s.won && G.s.moves.length > 0) G.stats.streak = 0;
  G.dailySeed = null;
  G.drag = G.pending = G.sel = G.hintMove = null;
  Prover.reset();
  Snd.deal();                                 // 洗牌声
  G.stats.played++;
  saveStats();
  FX.reset();
  clearRun();
  renderAll();
}

// ── 走子 ──
function doMove(m) {
  const ev = Core.apply(G.s, m);
  if (!ev) { Snd.nope(); return false; }     // 非法落点：一声轻的低音，不惩罚玩家
  // 声音按**动作**分（纸牌的质感全在这里；此前全程静音）
  if (m.t === 'draw' || m.t === 'recycle') Snd.draw();
  else if (m.t === 'tf' || m.t === 'wf' || m.t === 'cf') Snd.found(G.s.foundations.reduce((a,f)=>a+f.length,0) % 8);
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
  const clean = !s.usedUndo && !s.usedHint;
  G.stats.won++;
  if (clean) G.stats.cleanWon++;                 // 双口径：零撤销零提示才算「clean」
  G.stats.streak = (G.stats.streak || 0) + 1;
  G.stats.bestStreak = Math.max(G.stats.bestStreak || 0, G.stats.streak);
  saveStats();
  clearRun();

  Money.earnWin(clean);                          // 金币（只能换外观，换不到任何优势）
  if (G.dailySeed === s.seed) { G.dailyDone = todayId(); saveOpts(); }

  // ⛔ 插屏**只在赢局后**出，且每 3 局最多 1 个。**输局永远不出** ——
  //    刚输完还甩一脸广告，是这个品类最招恨的做法（微软的「12 连播」就是这么臭掉的）。
  const showAd = Money.canShowInterstitial();
  Money.noteWin(showAd);
  if (showAd) setTimeout(() => Ads.showInterstitial().finally(() => renderAll()), 1800);  // 让瀑布先跑

  const L = Layout.L;
  const cards = [];
  for (let r = 12; r >= 0; r--) {              // K 先飞
    for (let fi = 0; fi < 4; fi++) {
      cards.push({ id: r * 4 + fi, x: L.foundX(fi), y: L.topY });
    }
  }
  FX.startCascade(cards);
  Snd.win();
}

// ── 交互 ──
function onTap(hit, cardHit) {
  const s = G.s;
  if (!hit) { G.sel = null; return renderAll(); }

  if (hit.action === 'STOCK') {
    doMove(s.stock.length ? { t: 'draw' } : { t: 'recycle' });
    return;
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
    // 先试自动送 foundation（双击/单击的常见期待）
    const auto = RulesK.legalMoves(s).find(m => m.t === 'wf');
    if (auto && doMove(auto)) return;
    G.sel = { p: 'w' };
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
    G.sel = { p: 't', ti, idx };
  }
  renderAll();
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
    if (sel.p === 'c') return { t: 'ct', ci: sel.ci, tj };         // free cell → tableau
    if (sel.p === 'w') return { t: 'wt', ti: tj };
    if (sel.ti === tj) return null;
    return { t: 'tt', ti: sel.ti, idx: sel.idx, tj };
  }
  return null;
}

function onDrop(drag, target) {
  if (!target) return renderAll();
  const sel = drag.from === 'w' ? { p: 'w' } : { p: 't', ti: drag.from, idx: drag.idx };
  const m = buildMove(sel, target);
  if (m) doMove(m); else renderAll();
}

function dispatch(action, data) {
  const s = G.s;
  switch (action) {
    case 'NEW': newGame(); break;
    case 'MODE': {                             // 切模式 = 换一局（模式是开局前属性）
      const next = s.mode === 'freecell' ? 'klondike' : 'freecell';
      newGame(undefined, next);
      break;
    }
    case 'FAIR': G.phase = 'FAIR'; break;
    case 'MENU': G.phase = 'MENU'; break;
    // 首启一屏（4.3(a) 防线）：看过一次就不再出现
    case 'INTRO_GO': G.phase = 'PLAY'; G.seenIntro = 1; saveOpts(); break;
    case 'INTRO_FAIR': G.phase = 'FAIR'; G.seenIntro = 1; saveOpts(); break;
    case 'STATS': G.phase = 'STATS'; break;
    case 'SHOP': G.phase = 'SHOP'; break;
    case 'SET': G.phase = 'SET'; break;

    // ⚠ 这三个功能**代码里一直都有，但此前没有任何 UI 入口** —— 等于死代码
    case 'TOG_4COLOR': G.fourColor = !G.fourColor; Sprite.ensure(0, 0); saveOpts(); break;
    case 'TOG_BIGTEXT': G.bigText = !G.bigText; Sprite.ensure(0, 0); saveOpts(); break;
    case 'TOG_SOUND': Sfx.toggle(); break;

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
        Prover.reset(); FX.reset(); clearRun();
        G.phase = 'PLAY';
      }
      break;
    }

    // 一次性去广告（⚠ 买断，不是订阅）
    case 'NOADS': {
      // TODO(P6): 接 StoreKit / Play Billing。web 端先直接给（本地测试）
      Money.buyNoAds();
      G.noAds = true;
      Ads.hideBanner();
      break;
    }

    // 激励视频 → 金币。⚠ **纯增益**：金币只能换外观，换不到提示/撤销（那是基本人权）
    case 'EARN_AD': {
      Ads.showRewarded().then(got => { if (got) Money.earnAd(); renderAll(); });
      break;
    }
    case 'PICK_BACK': {
      const id = data.id;
      if (Money.owns('back', id)) Money.equip('back', id);
      else Money.buy('back', id);
      break;
    }
    case 'PICK_TABLE': {
      const id = data.id;
      if (Money.owns('table', id)) Money.equip('table', id);
      else Money.buy('table', id);
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
    case 'PLAY': G.phase = 'PLAY'; break;
    case 'UNDO': {
      // ⚠ 撤销永远免费、永远不看广告（DESIGN §7.4：纸牌的基本人权）
      const back = Core.undo(s);
      // ⚠ 撤销**必须**作废旧结论：玩家看到「死局」后最可能做的就是撤销，
      //   结论还挂着「死局」= 对一个已经不同的局面撒谎。
      if (back) { G.s = back; G.sel = null; Prover.reset(); saveRun(); Snd.undo(); }
      break;
    }
    case 'HINT': {
      const ms = Core.rules(s).legalMoves(s).filter(m => m.t !== 'draw' && m.t !== 'recycle');
      G.s.usedHint = true;                       // 留痕（「零提示胜率」靠它）
      G.hintMove = ms.length ? ms[0] : null;
      if (!ms.length) G.hintMove = { t: 'none' };
      break;
    }
    case 'AUTO': {
      const ms = Core.autoPlayMoves(s);
      for (const m of ms) Core.apply(G.s, m);
      // ⚠ AUTO / UNDO 都**不经过 doMove()** ⇒ 得各自 reset（这就是当初漏掉的地方）
      if (ms.length) { Prover.reset(); Snd.found(0); saveRun(); }
      if (G.s.won) onWin();
      break;
    }
    case 'STOCK': case 'WASTE': case 'TAB': case 'FOUND': break;   // 由 input 层处理
    default: break;
  }
  renderAll();
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
  G.noAds = Money.noAds;
  // ⭐ 横幅是**主力收入**（纸牌单次会话 10-15 分钟，曝光时长极高且不打断牌局）。
  //    布局已为它**预留**了 Layout.BANNER_H —— 它永远不会盖在牌上（变现红线 §7.4-5）。
  if (!Money.noAds) Ads.showBanner();

  await Pool.load();                                   // ⭐ 先加载可解池（决定发什么牌）
  const resumed = loadRun();
  if (resumed) G.s = resumed;
  else { const sd = Pool.pick(3, 'any'); G.s = Core.newGame(sd != null ? sd : Deal.randomSeed(), 3); }

  // ⭐ 第一次打开 → 先给首启一屏（App Store 4.3(a) 的主要防线：差异必须在头 5 秒撞到脸上）
  if (!G.seenIntro) G.phase = 'INTRO';

  Input.bind({ onAction: dispatch });                       // 工具条
  Input2.bind(document.getElementById(CFG.canvasId), {      // 牌区：拖拽 + tap-to-move
    onTap, onDrop, onChange: renderAll,
  });
  // 点一下跳过瀑布
  document.getElementById(CFG.canvasId).addEventListener('pointerdown', () => { if (FX.busy()) FX.skip(); });

  window.addEventListener('resize', () => { initCanvas(); FX.reset(); renderAll(); });
  Controls.render();
  renderAll();
  requestAnimationFrame(loop);
}

boot();
