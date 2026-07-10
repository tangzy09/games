// ════════════════════════════════════════
// render.js — immediate-mode canvas renderer. Pure function of G.
// ════════════════════════════════════════

const NUM_COLORS = { 1:'#2b7de9', 2:'#2f9e44', 3:'#e8590c', 4:'#9c36b5', 5:'#c92a2a', 6:'#0b7285' };
const C = {
  bg: '#f2ede4', surface: '#ffffff', border: '#d8cfc0', text: '#3d3529', muted: '#8a7f6d',
  tile: '#b8a888', tileEdge: '#a29372', open: '#efe9dd',
  accent: '#c9552e', gold: '#c9922e', hp: '#c92a2a', xp: '#2f9e44', purple: '#9c36b5',
};

function layout() {
  const SW = GameGlobal.SW, SH = GameGlobal.SH, PAD = 14;
  const hudY = GameGlobal.safeTop + 8, hudH = 74;
  const relicH = 34;
  const availH = SH - hudY - hudH - relicH - PAD * 3;
  const bs = Math.min(SW - PAD * 2, availH);
  return { SW, SH, PAD, hudY, hudH, boardX: (SW - bs) / 2, boardY: hudY + hudH + PAD, boardSize: bs, relicY: hudY + hudH + PAD * 2 + bs };
}

function drawHud(L) {
  const { PAD, SW, hudY: y, hudH: h } = L;
  fillRR(PAD, y, SW - PAD * 2, h, 14, C.surface);
  strokeRR(PAD, y, SW - PAD * 2, h, 14, C.border);
  const half = y + 22;
  txtL(`❤️ ${G.hp}/${G.maxHp}`, PAD + 12, half, C.hp, 'bold 15px sans-serif');
  txt(`${T('ui.floor')} ${G.floorIdx + 1}/${FLOORS.length}`, SW / 2, half, C.text, 'bold 13px sans-serif');
  txtR(`🪙 ${G.gold}   🔮 ${G.souls}`, SW - PAD - 12, half, C.gold, 'bold 13px sans-serif');
  // xp bar
  const bx = PAD + 12, bw = SW - PAD * 2 - 24, by = y + 42, need = G.level * XP_PER_LEVEL;
  txtL(`${T('ui.level')} ${G.level}`, bx, by + 6, C.xp, 'bold 11px sans-serif');
  const barX = bx + 54, barW = bw - 54;
  fillRR(barX, by, barW, 12, 6, C.open);
  fillRR(barX, by, Math.max(6, barW * Math.min(1, G.xp / need)), 12, 6, C.xp);
  txt(`${G.xp}/${need}`, barX + barW / 2, by + 6, '#fff', 'bold 9px sans-serif');
}

function drawGrid(L) {
  const { boardX: bx, boardY: by, boardSize: bs } = L;
  const s = G.size, GAP = 3;
  const ts = (bs - GAP * (s - 1)) / s;
  const fs = Math.round(ts * 0.42);
  for (let i = 0; i < s * s; i++) {
    const r = Math.floor(i / s), c = i % s;
    const x = bx + c * (ts + GAP), y = by + r * (ts + GAP), rad = Math.min(8, ts * 0.2);
    const cell = G.grid[i];
    if (!cell.rev) {
      fillRR(x, y, ts, ts, rad, C.tile);
      strokeRR(x, y, ts, ts, rad, C.tileEdge);
      addHit(x, y, ts, ts, 'CELL', { i });
      continue;
    }
    fillRR(x, y, ts, ts, rad, C.open);
    if (cell.mon && cell.dead) {
      ctx.globalAlpha = MONSTERS[cell.mon].boss ? 1 : 0.35;
      txt(MONSTERS[cell.mon].icon, x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      ctx.globalAlpha = 1;
    } else if (cell.t === 'coin') {
      txt('🪙', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (cell.t === 'potion') {
      txt('🧪', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else if (cell.t === 'stairs') {
      fillRR(x, y, ts, ts, rad, '#ffe9c7');
      strokeRR(x, y, ts, ts, rad, C.accent, 2);
      txt('🪜', x + ts / 2, y + ts / 2, C.text, `${fs}px sans-serif`);
      addHit(x, y, ts, ts, 'CELL', { i });
    } else {
      const n = cellNumber(i);
      if (n > 0) txt(String(n), x + ts / 2, y + ts / 2, NUM_COLORS[Math.min(n, 6)] || C.purple, `bold ${fs}px sans-serif`);
    }
  }
}

function drawRelicBar(L) {
  if (!G.relics.length) return;
  let x = L.PAD;
  G.relics.forEach(id => {
    const rl = RELICS.find(r => r.id === id);
    const lbl = `${rl.icon} ${T('relic.' + id + '.name')}`;
    ctx.font = '11px sans-serif';
    const w = ctx.measureText(lbl).width + 18;
    fillRR(x, L.relicY, w, 26, 13, 'rgba(156,54,181,0.10)');
    strokeRR(x, L.relicY, w, 26, 13, C.purple);
    txt(lbl, x + w / 2, L.relicY + 13, C.purple, '11px sans-serif');
    x += w + 6;
  });
}

function bigButton(cy, key, action, data, color) {
  const { SW } = GameGlobal;
  fillRR(SW / 2 - 100, cy, 200, 48, 12, color || C.accent);
  txt(T(key), SW / 2, cy + 24, '#fff', 'bold 15px sans-serif');
  addHit(SW / 2 - 100, cy, 200, 48, action, data || {});
}

function drawHome() {
  const { SW, SH } = GameGlobal;
  txt('💣', SW / 2, SH * 0.22, C.text, '54px sans-serif');
  txt(T('home.title'), SW / 2, SH * 0.31, C.accent, 'bold 26px sans-serif');
  txtLWrap(T('home.subtitle'), SW / 2 - 140, SH * 0.38, 280, C.muted, '13px sans-serif', 17);
  txt(`🔮 ${T('home.souls', { n: Meta.souls })}    🏆 ${T('home.best', { n: Meta.best })}`, SW / 2, SH * 0.47, C.purple, 'bold 13px sans-serif');
  bigButton(SH * 0.55, 'home.start', 'START_RUN');
}

function drawIntro() {
  drawDim('rgba(40,30,20,0.82)');
  const { SW, SH } = GameGlobal;
  const f = FLOORS[G.floorIdx];
  txt(T('intro.floor', { n: G.floorIdx + 1 }), SW / 2, SH * 0.34, '#ffd9a0', 'bold 24px sans-serif');
  txt(`${f.size} × ${f.size}`, SW / 2, SH * 0.42, '#fff', 'bold 16px sans-serif');
  if (G.floorIdx === FLOORS.length - 1) txt(T('intro.boss'), SW / 2, SH * 0.48, '#ff8787', 'bold 13px sans-serif');
  bigButton(SH * 0.56, 'intro.enter', 'ENTER_FLOOR');
}

function drawRelicPick() {
  drawDim('rgba(40,30,20,0.85)');
  const { SW, SH } = GameGlobal;
  txt(T('relic.pick'), SW / 2, 90, '#ffd9a0', 'bold 20px sans-serif');
  const cardW = SW - 48, cardH = 78, startY = 130;
  G.relicChoices.forEach((rl, k) => {
    const y = startY + k * (cardH + 12);
    fillRR(24, y, cardW, cardH, 14, C.surface);
    strokeRR(24, y, cardW, cardH, 14, C.purple, 2);
    txt(rl.icon, 24 + 32, y + cardH / 2, C.text, '30px sans-serif');
    txtL(T('relic.' + rl.id + '.name'), 24 + 62, y + 24, C.text, 'bold 15px sans-serif');
    txtLWrap(T('relic.' + rl.id + '.desc'), 24 + 62, y + 50, cardW - 84, C.muted, '11px sans-serif', 14);
    addHit(24, y, cardW, cardH, 'PICK_RELIC', { id: rl.id });
  });
  const skipY = startY + G.relicChoices.length * (cardH + 12) + 8;
  txt(T('relic.skip'), SW / 2, skipY + 14, '#d8cfc0', '13px sans-serif');
  addHit(SW / 2 - 80, skipY, 160, 28, 'PICK_RELIC', { id: null });
}

// The most important screen in the game: earnings + gap narrative + one-tap restart.
function drawEnd(win) {
  drawDim(win ? 'rgba(20,60,30,0.88)' : 'rgba(40,20,20,0.88)');
  const { SW, SH } = GameGlobal;
  txt(win ? '🏆' : '💀', SW / 2, SH * 0.2, '#fff', '50px sans-serif');
  txt(T(win ? 'win.title' : 'lose.title'), SW / 2, SH * 0.29, win ? '#8ce99a' : '#ff8787', 'bold 24px sans-serif');
  if (!win) txt(T('lose.gap', { n: FLOORS.length - G.floorIdx }), SW / 2, SH * 0.35, '#ffd9a0', '13px sans-serif');
  // earnings
  fillRR(SW / 2 - 120, SH * 0.4, 240, 54, 12, 'rgba(255,255,255,0.12)');
  txt(T('end.souls', { n: G.souls }), SW / 2, SH * 0.4 + 18, '#e5b3ff', 'bold 15px sans-serif');
  txt(T('end.total', { n: Meta.souls }), SW / 2, SH * 0.4 + 38, '#c8b8d8', '11px sans-serif');
  bigButton(SH * 0.55, 'end.retry', 'RESTART', {}, win ? '#2f9e44' : C.accent);
  fillRR(SW / 2 - 100, SH * 0.55 + 58, 200, 38, 10, 'rgba(255,255,255,0.14)');
  txt(T('end.home'), SW / 2, SH * 0.55 + 77, '#fff', '13px sans-serif');
  addHit(SW / 2 - 100, SH * 0.55 + 58, 200, 38, 'GO_HOME', {});
}

function drawFloat() {
  if (!G.floatMsg) return;
  const { SW, SH } = GameGlobal;
  ctx.font = 'bold 13px sans-serif';
  const w = ctx.measureText(G.floatMsg).width + 32;
  fillRR((SW - w) / 2, SH / 2 - 80, w, 40, 13, 'rgba(40,30,20,0.9)');
  txt(G.floatMsg, SW / 2, SH / 2 - 60, '#ffd9a0', 'bold 13px sans-serif');
}

function renderAll() {
  clearHits();
  const { SW, SH } = GameGlobal;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);
  if (G.phase === 'HOME') { drawHome(); drawFloat(); return; }
  const L = layout();
  drawHud(L);
  if (G.grid.length) drawGrid(L);
  drawRelicBar(L);
  if (G.phase === 'LEVEL_INTRO') drawIntro();
  else if (G.phase === 'PICK_RELIC') drawRelicPick();
  else if (G.phase === 'WIN') { drawEnd(true); return; }   // end screens own the frame:
  else if (G.phase === 'LOSE') { drawEnd(false); return; } // no float toast on top
  drawFloat();
}
