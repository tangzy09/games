// ════════════════════════════════════════
// main.js — boot / 状态 G / 走子 / 撤销 / 提示 / autoplay / 纸牌瀑布 / 存档。
// ════════════════════════════════════════
'use strict';

// ⚠ 必须显式挂 window：脚本顶层的 const 不会成为 window 的属性（blockblast 实踩）
const G = window.G = {
  s: null,                 // core 状态
  drag: null,
  pending: null,
  sel: null,               // tap-to-move 的选中
  hintMove: null,
  fourColor: false,        // 四色牌（无障碍）
  bigText: false,
  noAds: false,
  stats: { played: 0, won: 0, cleanWon: 0 },   // ⚠ 双口径（DESIGN §4.5）
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

function newGame(drawCount) {
  G.s = Core.newGame(Deal.randomSeed(), drawCount || (G.s ? G.s.drawCount : 3));
  G.drag = G.pending = G.sel = G.hintMove = null;
  G.stats.played++;
  saveStats();
  FX.reset();
  clearRun();
  renderAll();
}

// ── 走子 ──
function doMove(m) {
  const ev = Core.apply(G.s, m);
  if (!ev) return false;
  Sfx.play('card');
  G.sel = null; G.hintMove = null;
  if (ev.some(e => e.t === 'win')) onWin();
  else saveRun();
  renderAll();
  return true;
}

/** ⭐ 赢局 → 纸牌瀑布（产品的心脏） */
function onWin() {
  const s = G.s;
  G.stats.won++;
  // ⚠ 双口径：全程没用过撤销/提示的赢，才算「clean」（DESIGN §4.5）
  if (!s.usedUndo && !s.usedHint) G.stats.cleanWon++;
  saveStats();
  clearRun();

  const L = Layout.L;
  const cards = [];
  for (let r = 12; r >= 0; r--) {              // K 先飞
    for (let fi = 0; fi < 4; fi++) {
      cards.push({ id: r * 4 + fi, x: L.foundX(fi), y: L.topY });
    }
  }
  FX.startCascade(cards);
  Sfx.play('win');
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
  if (hit.action === 'WASTE' && s.waste.length) {
    // 先试自动送 foundation（双击/单击的常见期待）
    const auto = RulesK.legalMoves(s).find(m => m.t === 'wf');
    if (auto && doMove(auto)) return;
    G.sel = { p: 'w' };
  } else if (hit.action === 'TAB') {
    const { ti, idx } = hit.data;
    const col = s.tableau[ti];
    if (!col.cards.length) return;
    if (!RulesK.isValidRun(s, ti, idx)) return;
    // 单击顶牌 ⇒ 先试送 foundation
    if (idx === col.cards.length - 1) {
      const auto = RulesK.legalMoves(s).find(m => m.t === 'tf' && m.ti === ti);
      if (auto && doMove(auto)) return;
    }
    G.sel = { p: 't', ti, idx };
  }
  renderAll();
}

/** 从「选中 + 落点」构造一个 move */
function buildMove(sel, hit) {
  if (hit.action === 'FOUND') {
    const fi = hit.data.fi;
    if (sel.p === 'w') return { t: 'wf', fi };
    const col = G.s.tableau[sel.ti];
    if (sel.idx === col.cards.length - 1) return { t: 'tf', ti: sel.ti, fi };
    return null;
  }
  if (hit.action === 'TAB') {
    const tj = hit.data.ti;
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
    case 'UNDO': {
      // ⚠ 撤销永远免费、永远不看广告（DESIGN §7.4：纸牌的基本人权）
      const back = Core.undo(s);
      if (back) { G.s = back; G.sel = null; saveRun(); Sfx.play('card'); }
      break;
    }
    case 'HINT': {
      const ms = RulesK.legalMoves(s).filter(m => m.t !== 'draw' && m.t !== 'recycle');
      G.s.usedHint = true;                       // 留痕（「零提示胜率」靠它）
      G.hintMove = ms.length ? ms[0] : null;
      if (!ms.length) G.hintMove = { t: 'none' };
      break;
    }
    case 'AUTO': {
      const ms = Core.autoPlayMoves(s);
      for (const m of ms) Core.apply(G.s, m);
      if (ms.length) { Sfx.play('card'); saveRun(); }
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
  if (FX.busy() || G.drag) {
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

  const resumed = loadRun();
  if (resumed) G.s = resumed; else G.s = Core.newGame(Deal.randomSeed(), 3);

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
