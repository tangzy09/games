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
  difficulty: 'any',       // 发牌难度（'any'|'easy'|'hard'，池按盲打 AI 分档）——下一局生效
  noAds: false,
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
      fourColor: G.fourColor, bigText: G.bigText, comfort: G.comfort,
      difficulty: G.difficulty, dailyDone: G.dailyDone, seenIntro: G.seenIntro,
    }));
  } catch (e) {}
};

function newGame(drawCount, mode) {
  const md = mode || (G.s ? G.s.mode : 'klondike');
  const draw = drawCount || (G.s ? G.s.drawCount : 3);
  // ⭐ Klondike：只发**已验证可解**的牌局（池里取）。
  //    FreeCell：**不需要池** —— 本来就 ~100% 可解（32000 局里只有 #11982 无解），
  //    直接用微软局号随机取一个（这样玩家可以对照经典局号）。
  const pooled = md === 'freecell' ? null : Pool.pick(draw, G.difficulty || 'any');
  const seed = md === 'freecell'
    ? (1 + Math.floor(Math.random() * 32000))
    : (pooled != null ? pooled : Deal.randomSeed());
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

function doMove(m) {
  const before = snapshot(G.s);             // ⚠ 必须在 apply 之前
  const ev = Core.apply(G.s, m);
  if (!ev) { Snd.nope(); return false; }     // 非法落点：一声轻的低音，不惩罚玩家
  moveAnim(m, before);                      // ⚠ 必须在 apply 之后（目标坐标才对）
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

/** 这一下点的就是当前选中的那张牌？（双击判定）*/
function sameAsSel(hit) {
  const sel = G.sel;
  if (hit.action === 'WASTE') return sel.p === 'w';
  if (hit.action === 'CELL') return sel.p === 'c' && hit.data.ci === sel.ci;
  if (hit.action === 'TAB') return sel.p === 't' && hit.data.ti === sel.ti && hit.data.idx === sel.idx;
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
    // 舒适模式 = 四色 + 大字 + 放宽点击判定（input.js 读 G.comfort）。
    // 开 = 三件一起开；关 = 只关判定放宽，四色/大字保持玩家手动状态（别替他关掉看得清的牌面）。
    case 'TOG_COMFORT': {
      G.comfort = !G.comfort;
      if (G.comfort) { G.fourColor = true; G.bigText = true; Sprite.ensure(0, 0); }
      saveOpts();
      break;
    }
    // 发牌难度（分档 = 盲打 AI 赢不赢得了，不是拍脑袋）。**下一局生效**，不动当前局。
    case 'SET_DIFF': {
      if (data && data.d) { G.difficulty = data.d; saveOpts(); }
      break;
    }

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

    // ⛔ 'NOADS' 入口**首版已移除**：宣称有内购却没接 StoreKit = 2.1(b) 必被拒
    //    （审核员点了直接生效、且 ASC 里找不到 IAP 产品）。
    //    Money.buyNoAds() 保留，等真接了 StoreKit 再把入口加回来 + 做 3.1.2 的 paywall 四要素。

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
    case 'PICK_FX': {
      const id = data.id;
      if (Money.owns('fx', id)) Money.equip('fx', id);
      else Money.buy('fx', id);
      break;
    }
    // ⭐ 分享此局：牌局 = 一个 seed ⇒ 一条 URL 就是完整挑战（零后端）。
    //   FreeCell 用微软局号（老玩家的接头暗号），Klondike 用自家 seed（draw 模式进链接 ——
    //   draw-1/draw-3 是两个不同的可解性问题，丢了它「同一局」就是假的）。
    case 'SHARE': {
      const tag = (s.mode === 'freecell' ? 'fc' : 'd' + s.drawCount) + '-' + s.seed;
      const base = location.protocol.indexOf('http') === 0
        ? location.origin + location.pathname : 'https://cards.ai-speeds.com/';
      const msg = T('sol.shareText', { n: s.seed }) + ' ' + base + '#' + tag;
      const toast = () => {
        G.toast = { msg: T('sol.copied'), until: Date.now() + 1600 };
        renderAll();
        setTimeout(renderAll, 1700);
      };
      if (navigator.share) navigator.share({ text: msg }).catch(() => {});
      else if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(msg).then(toast).catch(() => {});
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
      // ⚠ 逐张**错开**滑（一堆牌同时瞬移，比没有动画还怪）
      ms.forEach((m, i) => {
        const before = snapshot(G.s);
        if (!Core.apply(G.s, m)) return;
        const L = Layout.L; void L;
        const sn = G.s;
        // 复用 moveAnim 的坐标逻辑，但加一个递增延迟
        const pending = FX.slide;
        FX.slide = (ids, x0, y0, x1, y1) => pending(ids, x0, y0, x1, y1, i * 0.055);
        moveAnim(m, before);
        FX.slide = pending;
        void sn;
      });
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
  G.noAds = Money.noAds;
  // ⭐ 横幅是**主力收入**（纸牌单次会话 10-15 分钟，曝光时长极高且不打断牌局）。
  //    布局已为它**预留**了 Layout.BANNER_H —— 它永远不会盖在牌上（变现红线 §7.4-5）。
  if (!Money.noAds) Ads.showBanner();

  await Pool.load();                                   // ⭐ 先加载可解池（决定发什么牌）
  // ⭐ 分享链接进来（#d1-N / #d3-N / #fc-N）⇒ 直接开那一局（朋友挑战同一副牌）。
  //   消费掉 hash（否则之后每次刷新都困在这一局里）。
  const linked = dealFromHash();
  const resumed = linked ? null : loadRun();
  if (linked) { G.s = Core.newGame(linked.seed, linked.draw, linked.mode); clearRun(); }
  else if (resumed) G.s = resumed;
  else { const sd = Pool.pick(3, 'any'); G.s = Core.newGame(sd != null ? sd : Deal.randomSeed(), 3); }

  // ⭐ 第一次打开 → 先给首启一屏（App Store 4.3(a) 的主要防线：差异必须在头 5 秒撞到脸上）
  if (!G.seenIntro) G.phase = 'INTRO';

  Input.bind({ onAction: dispatch });                       // 工具条
  Input2.bind(document.getElementById(CFG.canvasId), {      // 牌区：拖拽 + tap-to-move
    onTap, onDrop, onChange: renderAll,
  });
  // 点一下跳过瀑布
  document.getElementById(CFG.canvasId).addEventListener('pointerdown', () => { if (FX.busy()) FX.skip(); });

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
  window.addEventListener('resize', () => { initCanvas(); FX.reset(); renderAll(); });
  Controls.render();
  renderAll();
  requestAnimationFrame(loop);
}

boot();
