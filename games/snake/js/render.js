// games/snake/js/render.js — renderAll 契约:每帧从 G 全量重画。
// 依赖引擎全局:ctx/GameGlobal/clearHits/addHit/fillRR/roundRect/txt/txtL/drawDim/T
// 依赖 main.js 全局:G(状态)
const PAL = { bg:'#fdf3f7', cloud:'#f3e0ef', cloudEdge:'#e6c8e0', snake:'#f7b8d4',
  accent:'#e79cc2', accent2:'#b39ddb', text:'#7a5c72', bar:'#f6d5e5', card:'#ffffff',
  apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#5d4a57', btnOn:'#b39ddb' };

const Layout = { bx:0, by:0, bsize:0, cell:0, btnAI:null, btnBoost:null, btnPause:null };
let bgLayer = null, maskLayer = null, layerPx = 0;

function layoutBoard() {
  const { SW, SH, safeTop } = GameGlobal;
  const hudH = 54, btnH = 78;
  const size = Math.floor(Math.min(SW - 16, SH - safeTop - hudH - btnH - 20));
  Layout.bsize = size; Layout.cell = size / G.run.cols;
  Layout.bx = Math.floor((SW - size) / 2);
  Layout.by = safeTop + hudH;
  const bw = (size - 12) / 2, byy = Layout.by + size + 14;
  Layout.btnAI    = { x: Layout.bx,           y: byy, w: bw, h: 52 };
  Layout.btnBoost = { x: Layout.bx + bw + 12, y: byy, w: bw, h: 52 };
  Layout.btnPause = { x: Layout.bx + size - 40, y: safeTop + 8, w: 40, h: 36 };
}

// 每关/每次 resize 调:重建底图+遮罩 offscreen,并按 G.run.revealed 同步已揭格
function initLayers(img) {
  layoutBoard();
  layerPx = Math.max(64, Math.round(Layout.bsize * (window.devicePixelRatio || 1)));
  bgLayer = document.createElement('canvas'); bgLayer.width = bgLayer.height = layerPx;
  if (img) bgLayer.getContext('2d').drawImage(img, 0, 0, layerPx, layerPx);
  maskLayer = document.createElement('canvas'); maskLayer.width = maskLayer.height = layerPx;
  resetMask();
  for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++)
    if (G.run.revealed[y * G.run.cols + x]) punchCell(x, y);
}

function resetMask() {
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, layerPx, layerPx);
  m.fillStyle = PAL.cloud; m.fillRect(0, 0, layerPx, layerPx);
  m.strokeStyle = PAL.cloudEdge; m.lineWidth = 1;
  for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++) {
    m.beginPath();
    m.arc(x * pc + pc / 2, y * pc + pc / 2, pc * 0.34, 0, Math.PI * 2);
    m.stroke();                       // 云朵纹理:每格一圈
  }
}

function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function punchCell(x, y) {           // 揭开一格:遮罩挖圆角洞
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'destination-out';
  rrPath(m, x * pc + 1, y * pc + 1, pc - 2, pc - 2, pc * 0.3);
  m.fill();
}
function revealAllMask() { maskLayer.getContext('2d').clearRect(0, 0, layerPx, layerPx); }

function renderAll() {
  if (!G || !G.run || !ctx) return;
  clearHits();
  const { SW, SH, safeTop } = GameGlobal;
  ctx.fillStyle = PAL.bg; ctx.fillRect(0, 0, SW, SH);
  drawHud(safeTop);
  drawBoardArea();
  drawButtons();
  if (G.phase === 'PAUSED') drawOverlay(T('snake.paused'), '', T('snake.resume'), 'RESUME', false);
  else if (G.phase === 'DEAD') {
    const from = G.run.snake.length, to = Math.max(3, Math.floor(from / 2));
    drawOverlay(T('snake.dead'), T('snake.deadHint', { from, to }), T('snake.respawn'), 'RESPAWN', false);
  } else if (G.phase === 'LEVEL_DONE')
    drawOverlay(T('snake.levelDone', { n: G.run.level - 1 }), T('snake.scoreVal', { n: G.run.score }), T('snake.next'), 'NEXT', true);
}

function drawHud(safeTop) {
  const y = safeTop + 26;
  txtL(`${T('snake.score')} ${G.run.score}`, Layout.bx, y, PAL.text, 'bold 18px sans-serif');
  if (G.run.combo > 0)
    txtL(T('snake.combo', { n: G.run.combo }), Layout.bx + 130, y, PAL.accent, 'bold 16px sans-serif');
  const pw = Layout.bsize * 0.42, px = Layout.bx + Layout.bsize - pw - 48, ph = 14;
  const pct = G.run.revealedCount / (G.run.cols * G.run.rows);
  fillRR(px, y - ph / 2, pw, ph, 7, PAL.bar);
  if (pct > 0) fillRR(px, y - ph / 2, Math.max(ph, pw * pct), ph, 7, PAL.accent);
  txt(Math.floor(pct * 100) + '%', px + pw / 2, y, PAL.text, 'bold 10px sans-serif');
  const b = Layout.btnPause;
  fillRR(b.x, b.y, b.w, b.h, 10, PAL.card);
  txt(T('snake.pause'), b.x + b.w / 2, b.y + b.h / 2, PAL.text, '16px sans-serif');
  addHit(b.x, b.y, b.w, b.h, 'PAUSE', {});
}

function drawBoardArea() {
  const { bx, by, bsize, cell } = Layout;
  fillRR(bx - 4, by - 4, bsize + 8, bsize + 8, 18, PAL.card);
  if (bgLayer) ctx.drawImage(bgLayer, bx, by, bsize, bsize);
  if (maskLayer) ctx.drawImage(maskLayer, bx, by, bsize, bsize);
  const left = G.run.cols * G.run.rows - G.run.revealedCount;
  if (left > 0 && left <= 10 && G.phase === 'PLAYING') {
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 300);
    ctx.fillStyle = PAL.glow;
    for (let y = 0; y < G.run.rows; y++) for (let x = 0; x < G.run.cols; x++)
      if (!G.run.revealed[y * G.run.cols + x]) {
        rrPath(ctx, bx + x * cell + 2, by + y * cell + 2, cell - 4, cell - 4, cell * 0.3);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  }
  if (G.run.apple) drawApple(G.run.apple);
  drawSnake();
}

function drawApple(a) {
  const { bx, by, cell } = Layout;
  const cx = bx + a.x * cell + cell / 2;
  const cy = by + a.y * cell + cell / 2 + Math.sin(performance.now() / 250) * cell * 0.05;
  ctx.fillStyle = PAL.apple;
  ctx.beginPath(); ctx.arc(cx, cy, cell * 0.32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.leaf;
  ctx.beginPath(); ctx.ellipse(cx + cell * 0.1, cy - cell * 0.3, cell * 0.12, cell * 0.07, -0.6, 0, Math.PI * 2); ctx.fill();
}

function drawSnake() {
  const { bx, by, cell } = Layout;
  const s = G.run;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.snake; ctx.lineWidth = cell * 0.72;
  ctx.beginPath();
  s.snake.forEach((c, i) => {
    const px = bx + c.x * cell + cell / 2, py = by + c.y * cell + cell / 2;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  if (s.snake.length === 1) ctx.lineTo(bx + s.snake[0].x * cell + cell / 2 + 0.1, by + s.snake[0].y * cell + cell / 2);
  ctx.stroke();
  const h = s.snake[0], hx = bx + h.x * cell + cell / 2, hy = by + h.y * cell + cell / 2;
  ctx.fillStyle = PAL.snake;
  ctx.beginPath(); ctx.arc(hx, hy, cell * 0.42, 0, Math.PI * 2); ctx.fill();
  const d = Core.DIRS[s.dir];
  const ex = d.y !== 0 ? 0.16 : 0, ey = d.x !== 0 ? 0.16 : 0;
  for (const sgn of [-1, 1]) {
    const ox = hx + sgn * ex * cell + d.x * cell * 0.14, oy = hy + sgn * ey * cell + d.y * cell * 0.14;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, cell * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.eye;
    ctx.beginPath(); ctx.arc(ox + d.x * cell * 0.04, oy + d.y * cell * 0.04, cell * 0.07, 0, Math.PI * 2); ctx.fill();
  }
}

function drawButtons() {
  const a = Layout.btnAI, b = Layout.btnBoost;
  fillRR(a.x, a.y, a.w, a.h, 14, G.ai ? PAL.btnOn : PAL.accent);
  txt(T('snake.ai'), a.x + a.w / 2, a.y + a.h / 2, '#fff', 'bold 15px sans-serif');
  addHit(a.x, a.y, a.w, a.h, 'AI_TOGGLE', {});
  fillRR(b.x, b.y, b.w, b.h, 14, G.boostHeld ? PAL.btnOn : PAL.accent);
  txt(T('snake.boost'), b.x + b.w / 2, b.y + b.h / 2, '#fff', 'bold 15px sans-serif');
  // boost 不 addHit——按住逻辑由 main.js 原生 pointer 事件按 Layout.btnBoost 矩形处理
}

function drawOverlay(title, sub, btnLabel, action, showImg) {
  const { SW, SH } = GameGlobal;
  drawDim('rgba(122,92,114,0.45)');
  const cw = Math.min(SW * 0.86, 360);
  const ch = showImg ? cw + 150 : 190;
  const cx = (SW - cw) / 2, cy = (SH - ch) / 2;
  fillRR(cx, cy, cw, ch, 22, PAL.card);
  txt(title, cx + cw / 2, cy + 34, PAL.text, 'bold 20px sans-serif');
  let by = cy + 64;
  if (showImg && G.img) {
    const iw = cw - 44;
    ctx.drawImage(G.img, cx + 22, cy + 52, iw, iw);
    by = cy + 52 + iw + 24;
  }
  if (sub) { txt(sub, cx + cw / 2, by, PAL.text, '14px sans-serif'); by += 30; }
  const bw2 = 180, bh2 = 46;
  fillRR(cx + (cw - bw2) / 2, by, bw2, bh2, 14, PAL.accent);
  txt(btnLabel, cx + cw / 2, by + bh2 / 2, '#fff', 'bold 15px sans-serif');
  addHit(cx + (cw - bw2) / 2, by, bw2, bh2, action, {});
}
