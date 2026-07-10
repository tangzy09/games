// games/snake/js/render.js — renderAll 契约:每帧从 G 全量重画。
// 依赖引擎全局:ctx/GameGlobal/clearHits/addHit/fillRR/txt/txtL/drawDim/T
// 依赖 main.js 全局:G(状态)

// 触摸设备检测:READY/暂停提示按设备区分(触摸=滑动,桌面=方向键)
const IS_TOUCH = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

// 调色板走主题(themes.js 在本文件前加载);applyThemePal 由 main 在 boot/切肤时调,
// 切肤后需 initLayers(G.img) 重建遮罩纹理。PAL 是顶层 let,E2E evaluate 裸名可读。
let PAL = THEMES.cloud.pal;
function applyThemePal(key) { PAL = (THEMES[key] || THEMES.cloud).pal; }

const Layout = { bx:0, by:0, bsize:0, cell:0, btnAI:null, btnPause:null };
let bgLayer = null, maskLayer = null, layerPx = 0;

function layoutBoard() {
  const { SW, SH, safeTop } = GameGlobal;
  const hudH = 54, btnH = 78;
  const size = Math.floor(Math.min(SW - 16, SH - safeTop - hudH - btnH - 20));
  Layout.bsize = size; Layout.cell = size / G.run.cols;
  Layout.bx = Math.floor((SW - size) / 2);
  Layout.by = safeTop + hudH;
  const byy = Layout.by + size + 14;
  Layout.btnAI    = { x: Layout.bx, y: byy, w: size, h: 52 };   // 占满整行
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
  revealMirror = new Uint8Array(G.run.revealed);   // 构造函数即拷贝
}

// 揭格 diff 同步:core 揭开的每一格(头格/羽毛/足迹/流星)都在遮罩上挖洞。
// 镜像上帧 revealed,新揭的才 punch(取代旧的「只 punch 头格」)。
let revealMirror = null;
function syncRevealDiff() {
  const r = G.run.revealed, n = r.length;
  if (!revealMirror || revealMirror.length !== n) revealMirror = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    if (r[i] && !revealMirror[i]) punchCell(i % G.run.cols, Math.floor(i / G.run.cols));
  revealMirror.set(r);
}

function resetMask() {
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, layerPx, layerPx);
  m.fillStyle = PAL.cloud; m.fillRect(0, 0, layerPx, layerPx);
  // 遮罩纹理走主题(云圈/星点/棋盘格/羽毛),确定性绘制
  const key = (G.save && G.save.settings && THEMES[G.save.settings.theme])
    ? G.save.settings.theme : 'cloud';
  THEMES[key].texture(m, layerPx, pc);
}

function rrPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function punchCell(x, y) {
  // 揭开一格:整格方形挖洞,四周多挖 0.5px 重叠——不内缩不圆角,
  // 否则相邻已揭格之间留缝、四角留暗斑,天使图看起来碎。
  const m = maskLayer.getContext('2d');
  const pc = layerPx / G.run.cols;
  m.globalCompositeOperation = 'destination-out';
  m.fillRect(x * pc - 0.5, y * pc - 0.5, pc + 1, pc + 1);
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
  if (G.phase === 'READY') drawHint(T(IS_TOUCH ? 'snake.hintStartTouch' : 'snake.hintStartKey'));
  else if (G.phase === 'PAUSED') drawOverlay(T('snake.paused'), T(IS_TOUCH ? 'snake.hintResumeTouch' : 'snake.hintResumeKey'), T('snake.resume'), 'RESUME', false);
  else if (G.phase === 'DEAD') {
    const from = G.run.snake.length, to = Math.max(3, Math.floor(from / 2));
    drawOverlay(T('snake.dead'), T('snake.deadHint', { from, to }), T('snake.respawn'), 'RESPAWN', false);
  } else if (G.phase === 'LEVEL_DONE') {
    if (G.imgFull) drawImgFull();
    else drawOverlay(T('snake.levelDone', { n: G.run.level - 1 }), T('snake.scoreVal', { n: G.run.score }), T('snake.next'), 'NEXT', true,
                     { label: T('share.btn'), action: 'SHARE' });
  }
}

// 过关图片全屏欣赏:点图放大,再点任意处收回
function drawImgFull() {
  const { SW, SH } = GameGlobal;
  drawDim('rgba(50,35,48,0.92)');
  if (G.img) {
    const size = Math.min(SW, SH) - 16;
    ctx.drawImage(G.img, (SW - size) / 2, (SH - size) / 2, size, size);
  }
  addHit(0, 0, SW, SH, 'IMG_CLOSE', {});
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
  drawEffectsRow(safeTop);
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
  for (const a of G.run.extraApples) drawApple(a);
  drawSpecial();
  drawMeteor();
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

// 特殊果:emoji 绘制(引擎美术哲学:emoji 占位,后补图零改码);临期急促闪烁
function drawSpecial() {
  const sp = G.run.special;
  if (!sp) return;
  const { bx, by, cell } = Layout;
  const remain = sp.expiresAt - (G.nowMs || 0);
  if (remain < Fruits.FRUIT_TIMES.blinkAt && Math.sin(performance.now() / 90) < 0) return;
  const bob = Math.sin(performance.now() / 250) * cell * 0.05;
  txt(Fruits.FRUITS[sp.type].emoji,
      bx + sp.x * cell + cell / 2, by + sp.y * cell + cell / 2 + bob,
      '#fff', `${Math.round(cell * 0.8)}px sans-serif`);
}
function drawMeteor() {
  const m = G.run.meteor;
  if (!m) return;
  const { bx, by, cell } = Layout;
  txt('🌠', bx + m.x * cell + cell / 2, by + m.y * cell + cell / 2,
      '#fff', `${Math.round(cell * 0.8)}px sans-serif`);
}
// 生效中的效果指示:分数下方一行小字(💖×n + 各效果剩余秒)
function drawEffectsRow(safeTop) {
  const fx = G.run.effects, now = G.nowMs || 0;
  const items = [];
  if (fx.shield > 0) items.push('💖×' + fx.shield);
  for (const [key, emo] of [['slowUntil', '☁️'], ['demonUntil', '😈'], ['ghostUntil', '😇'],
                            ['trailUntil', '✨'], ['magnetUntil', '🧲']])
    if (now < fx[key]) items.push(emo + Math.ceil((fx[key] - now) / 1000));
  if (items.length)   // y=+42:棋盘白卡从 safeTop+50 起,+48 时 12px 字形下缘被卡片压住
    txtL(items.join('  '), Layout.bx, safeTop + 42, PAL.text, '12px sans-serif');
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
  const a = Layout.btnAI;
  fillRR(a.x, a.y, a.w, a.h, 14, G.ai ? PAL.btnOn : PAL.accent);
  txt(`${T('snake.ai')} · ${G.ai ? T('snake.on') : T('snake.off')}`, a.x + a.w / 2, a.y + a.h / 2, '#fff', 'bold 15px sans-serif');
  addHit(a.x, a.y, a.w, a.h, 'AI_TOGGLE', {});
}

// 非模态提示条(READY 用):不遮盘面、无按钮,任何方向输入即开始
function drawHint(text) {
  const { SW } = GameGlobal;
  const y = Layout.by + Layout.bsize / 2;
  const w = Math.min(SW * 0.8, 320);
  ctx.globalAlpha = 0.92;
  fillRR((SW - w) / 2, y - 24, w, 48, 24, PAL.card);
  ctx.globalAlpha = 1;
  txt(text, SW / 2, y, PAL.text, 'bold 15px sans-serif');
}

// extra: 可选第二按钮 { label, action }(次级样式,主按钮下方)
function drawOverlay(title, sub, btnLabel, action, showImg, extra) {
  const { SW, SH } = GameGlobal;
  drawDim('rgba(122,92,114,0.45)');
  const cw = Math.min(SW * 0.86, 360);
  const ch = (showImg ? cw + 150 : 190) + (extra ? 58 : 0);
  const cx = (SW - cw) / 2, cy = (SH - ch) / 2;
  fillRR(cx, cy, cw, ch, 22, PAL.card);
  txt(title, cx + cw / 2, cy + 34, PAL.text, 'bold 20px sans-serif');
  let by = cy + 64;
  if (showImg && G.img) {
    const iw = cw - 44;
    ctx.drawImage(G.img, cx + 22, cy + 52, iw, iw);
    addHit(cx + 22, cy + 52, iw, iw, 'IMG_FULL', {});   // 点图全屏欣赏
    by = cy + 52 + iw + 24;
  }
  if (sub) { txt(sub, cx + cw / 2, by, PAL.text, '14px sans-serif'); by += 30; }
  const bw2 = 180, bh2 = 46;
  fillRR(cx + (cw - bw2) / 2, by, bw2, bh2, 14, PAL.accent);
  txt(btnLabel, cx + cw / 2, by + bh2 / 2, '#fff', 'bold 15px sans-serif');
  addHit(cx + (cw - bw2) / 2, by, bw2, bh2, action, {});
  if (extra) {
    const ey = by + bh2 + 12;
    fillRR(cx + (cw - bw2) / 2, ey, bw2, bh2, 14, PAL.bar);
    txt(extra.label, cx + cw / 2, ey + bh2 / 2, PAL.text, 'bold 15px sans-serif');
    addHit(cx + (cw - bw2) / 2, ey, bw2, bh2, extra.action, {});
  }
}
