// games/snake/js/render.js — renderAll 契约:每帧从 G 全量重画。
// 依赖引擎全局:ctx/GameGlobal/clearHits/addHit/fillRR/txt/txtL/drawDim/T
// 依赖 main.js 全局:G(状态)

// 触摸设备检测:READY/暂停提示按设备区分(触摸=滑动,桌面=方向键)
const IS_TOUCH = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

// 调色板走主题(themes.js 在本文件前加载);applyThemePal 由 main 在 boot/切肤时调,
// 切肤后需 initLayers(G.img) 重建遮罩纹理。PAL 是顶层 let,E2E evaluate 裸名可读。
let PAL = THEMES.cloud.pal;
function applyThemePal(key) { PAL = (THEMES[key] || THEMES.cloud).pal; }

const Layout = { bx:0, by:0, bsize:0, cell:0, btnAI:null, btnRescue:null, btnPause:null };
let bgLayer = null, maskLayer = null, layerPx = 0;

function layoutBoard() {
  const { SW, SH, safeTop } = GameGlobal;
  const hudH = 54, btnH = 78;
  const size = Math.floor(Math.min(SW - 16, SH - safeTop - hudH - btnH - 20));
  Layout.bsize = size; Layout.cell = size / G.run.cols;
  Layout.bx = Math.floor((SW - size) / 2);
  Layout.by = safeTop + hudH;
  const byy = Layout.by + size + 14;
  const half = (size - 10) / 2;                                  // AI 开关 | AI 救场 两键半宽
  Layout.btnAI     = { x: Layout.bx, y: byy, w: half, h: 52 };
  Layout.btnRescue = { x: Layout.bx + half + 10, y: byy, w: half, h: 52 };
  Layout.btnPause  = { x: Layout.bx + size - 40, y: safeTop + 8, w: 40, h: 36 };
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

// ============ 爽感 FX(纯前端,墙钟计时;不进 core、不进存档) ============
// 粒子 / 分数飘字 / 震屏 / 过关完成庆祝。RAF 每帧 renderAll 都会驱动(含 LEVEL_DONE)。
const FX = { parts: [], pops: [], shakeMag: 0, shakeUntil: 0, celebrateStart: 0 };
let fxPrev = 0;
const fxNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function cellCenter(cx, cy) { return [Layout.bx + (cx + 0.5) * Layout.cell, Layout.by + (cy + 0.5) * Layout.cell]; }

// 在格子迸发 n 个粒子(吃果/连击/接流星)
function fxBurst(cx, cy, color, n = 8, spread = 1) {
  const [px, py] = cellCenter(cx, cy), now = fxNow();
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.6, sp = (0.4 + Math.random() * 0.9) * spread;
    FX.parts.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.3,
      r: Layout.cell * (0.06 + Math.random() * 0.07), color, born: now, life: 520 + Math.random() * 260 });
  }
}
// 分数飘字(向上飘 + 淡出)
function fxPop(cx, cy, text, color) {
  const [px, py] = cellCenter(cx, cy);
  FX.pops.push({ x: px, y: py - Layout.cell * 0.3, text, color, born: fxNow(), life: 900 });
}
function fxShake(mag, ms = 260) { FX.shakeMag = Math.max(FX.shakeMag, mag); FX.shakeUntil = Math.max(FX.shakeUntil, fxNow() + ms); }
function fxCelebrate() { FX.celebrateStart = fxNow(); }   // 过关完成:流光+星光+回弹
function fxCelebrating() { return FX.celebrateStart && fxNow() - FX.celebrateStart < 1500; }

// 棋盘变换:庆祝回弹缩放 + 震屏偏移(围绕棋盘中心)
function fxBoardTransform() {
  let sc = 1, dx = 0, dy = 0;
  if (FX.celebrateStart) {
    const t = (fxNow() - FX.celebrateStart) / 1500;
    if (t < 1) { const p = Math.sin(Math.min(1, t / 0.4) * Math.PI); sc = 1 + 0.06 * p; }
  }
  if (fxNow() < FX.shakeUntil) {
    const k = FX.shakeMag * (FX.shakeUntil - fxNow()) / 260;
    dx = (Math.random() * 2 - 1) * k; dy = (Math.random() * 2 - 1) * k;
  }
  return [dx, dy, sc];
}
// 庆祝流光:一道斜向亮带扫过成图 + 中心星光爆发(在棋盘裁剪内画)
function fxDrawCelebrate() {
  if (!FX.celebrateStart) return;
  const { bx, by, bsize } = Layout, t = (fxNow() - FX.celebrateStart) / 1500;
  if (t >= 1) { FX.celebrateStart = 0; return; }
  ctx.save();
  rrPath(ctx, bx, by, bsize, bsize, 14); ctx.clip();
  // 斜向流光(0~0.7 扫过)
  const sp = t / 0.7;
  if (sp < 1) {
    const bandW = bsize * 0.4, cxp = bx - bandW + (bsize + bandW * 2) * sp;
    const g = ctx.createLinearGradient(cxp - bandW, by, cxp + bandW, by + bsize);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(bx, by, bsize, bsize);
  }
  ctx.restore();
  // 一次性中心星光爆发(仅在 t 很小时补种)
  if (t < 0.06 && FX.parts.every(p => p.kind !== 'cele')) {
    const [ccx, ccy] = [bx + bsize / 2, by + bsize / 2], now = fxNow();
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp2 = 1 + Math.random() * 2.2;
      FX.parts.push({ kind: 'cele', x: ccx, y: ccy, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2,
        r: Layout.cell * (0.08 + Math.random() * 0.1), color: PAL.glow || '#fff59d', born: now, life: 900 + Math.random() * 500 });
    }
  }
}
// 更新+画所有粒子(棋盘变换内)
function fxDrawParticles() {
  const now = fxNow(), dt = Math.min(48, now - (fxPrev || now)); fxPrev = now;
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i], age = now - p.born;
    if (age > p.life) { FX.parts.splice(i, 1); continue; }
    p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; p.vy += dt * 0.006;   // 轻重力
    ctx.globalAlpha = Math.max(0, 1 - age / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - 0.3 * age / p.life), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// 画分数飘字(棋盘变换外,不随缩放抖)
function fxDrawPops() {
  const now = fxNow();
  for (let i = FX.pops.length - 1; i >= 0; i--) {
    const p = FX.pops[i], age = now - p.born;
    if (age > p.life) { FX.pops.splice(i, 1); continue; }
    const k = age / p.life;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
    txt(p.text, p.x, p.y - k * Layout.cell * 1.6, p.color, `bold ${Math.round(Layout.cell * 0.5)}px sans-serif`);
  }
  ctx.globalAlpha = 1;
}

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
    drawOverlay(T('snake.dead'), T('snake.deadHint', { from, to }), T('snake.respawn'), 'RESPAWN', false,
                G.revivesThisLevel < 2 ? { label: T('ads.revive'), action: 'REVIVE' } : null);
  } else if (G.phase === 'LEVEL_DONE') {
    if (G.imgFull) drawImgFull();
    // 先放完成庆祝(~0.8s 流光星光),再滑入结算浮层
    else if (!FX.celebrateStart || fxNow() - FX.celebrateStart > 800)
      drawOverlay(T('snake.levelDone', { n: G.run.level - 1 }), T('snake.scoreVal', { n: G.run.score }), T('snake.next'), 'NEXT', true,
                     { label: T('share.btn'), action: 'SHARE' }, G.lastClearStars || 0);
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
  const bonus = G.bonusLevel && (G.phase === 'PLAYING' || G.phase === 'READY');
  txtL(`${T('snake.score')} ${G.run.score}${bonus ? '  ⭐×2' : ''}`, Layout.bx, y, bonus ? '#ffb300' : PAL.text, 'bold 18px sans-serif');
  if (G.run.combo > 0)
    txtL(T('snake.combo', { n: G.run.combo }), Layout.bx + 165, y, PAL.accent, 'bold 16px sans-serif');
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
  // 震屏 + 过关回弹:整个棋盘(含蛇/粒子)围绕中心做变换
  const [sdx, sdy, sc] = fxBoardTransform();
  const cxp = bx + bsize / 2, cyp = by + bsize / 2;
  ctx.save();
  ctx.translate(cxp + sdx, cyp + sdy); ctx.scale(sc, sc); ctx.translate(-cxp, -cyp);
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
  fxDrawCelebrate();     // 过关流光+星光(裁剪在棋盘内)
  fxDrawParticles();     // 吃果/连击迸发的粒子(随棋盘变换)
  ctx.restore();
  fxDrawPops();          // 分数飘字(不随缩放)
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
  // AI 救场倒计时(最后 1 秒放大一档预警,设计 §4)
  if (now < G.rescueUntil) {
    const remainMs = G.rescueUntil - now;
    const label = '🤖⏱' + Math.ceil(remainMs / 1000);
    txtL(label, Layout.bx + Layout.bsize * 0.6, safeTop + 42, PAL.accent,
         remainMs <= 1000 ? 'bold 17px sans-serif' : 'bold 12px sans-serif');
  }
}

// hex → 朝白/黑混合(t>0 提亮,t<0 压暗),给蛇身做体积高光
function mix(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const to = t >= 0 ? 255 : 0, a = Math.abs(t);
  r = Math.round(r + (to - r) * a); g = Math.round(g + (to - g) * a); b = Math.round(b + (to - b) * a);
  return `rgb(${r},${g},${b})`;
}

function drawSnake() {
  const { bx, by, cell } = Layout;
  const s = G.run;
  const cx = c => bx + c.x * cell + cell / 2, cy = c => by + c.y * cell + cell / 2;
  const tracePath = w => {
    ctx.beginPath();
    s.snake.forEach((c, i) => (i ? ctx.lineTo(cx(c), cy(c)) : ctx.moveTo(cx(c), cy(c))));
    if (s.snake.length === 1) ctx.lineTo(cx(s.snake[0]) + 0.1, cy(s.snake[0]));
    ctx.lineWidth = w; ctx.stroke();
  };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // 三层管体:暗描边(轮廓)→ 主体 → 亮核(顺光高光),叠出圆润体积感
  ctx.strokeStyle = mix(PAL.snake, -0.22); tracePath(cell * 0.82);
  ctx.strokeStyle = PAL.snake;             tracePath(cell * 0.72);
  ctx.strokeStyle = mix(PAL.snake, 0.42);  tracePath(cell * 0.30);

  const h = s.snake[0], hx = cx(h), hy = cy(h), d = Core.DIRS[s.dir];
  const R = cell * 0.46;
  // 天使光环:头顶上方一圈金环(点题「天使蛇」)——屏幕正上方,不随朝向
  ctx.lineWidth = Math.max(2, cell * 0.09);
  ctx.strokeStyle = PAL.glow || '#ffe082';
  ctx.beginPath(); ctx.ellipse(hx, hy - R - cell * 0.24, cell * 0.30, cell * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  // 头(带暗描边 + 顺光高光)
  ctx.fillStyle = mix(PAL.snake, -0.22);
  ctx.beginPath(); ctx.arc(hx, hy, R + cell * 0.03, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.snake;
  ctx.beginPath(); ctx.arc(hx, hy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mix(PAL.snake, 0.5);
  ctx.beginPath(); ctx.arc(hx - R * 0.32, hy - R * 0.36, R * 0.44, 0, Math.PI * 2); ctx.fill();   // 额头高光
  // 腮红(朝向两侧靠下)
  const px = d.y !== 0 ? 0.30 : 0.10, py = d.x !== 0 ? 0.30 : 0.10;
  ctx.fillStyle = 'rgba(255,138,171,0.5)';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(hx + sgn * px * cell + d.x * cell * 0.10, hy + sgn * py * cell + d.y * cell * 0.10 + cell * 0.08,
                cell * 0.11, cell * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 大眼睛:白底 + 深瞳 + 高光点
  const ex = d.y !== 0 ? 0.18 : 0, ey = d.x !== 0 ? 0.18 : 0;
  for (const sgn of [-1, 1]) {
    const ox = hx + sgn * ex * cell + d.x * cell * 0.15, oy = hy + sgn * ey * cell + d.y * cell * 0.15;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, cell * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PAL.eye;
    ctx.beginPath(); ctx.arc(ox + d.x * cell * 0.05, oy + d.y * cell * 0.05, cell * 0.085, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ox - cell * 0.03, oy - cell * 0.03, cell * 0.035, 0, Math.PI * 2); ctx.fill();   // catchlight
  }
}

function drawButtons() {
  const a = Layout.btnAI;
  fillRR(a.x, a.y, a.w, a.h, 14, G.ai ? PAL.btnOn : PAL.accent);
  txt(`${T('snake.ai')} · ${G.ai ? T('snake.on') : T('snake.off')}`, a.x + a.w / 2, a.y + a.h / 2, '#fff', 'bold 14px sans-serif');
  addHit(a.x, a.y, a.w, a.h, 'AI_TOGGLE', {});
  // AI 救场 10s(rewarded):AI 模式开启或救场进行中时画灰不可点(不加 hit)
  const r = Layout.btnRescue;
  const rescueActive = (G.nowMs || 0) < G.rescueUntil;
  const disabled = G.ai || rescueActive;
  ctx.globalAlpha = disabled ? 0.45 : 1;
  fillRR(r.x, r.y, r.w, r.h, 14, PAL.bar);
  txt(T('ads.rescue'), r.x + r.w / 2, r.y + r.h / 2, PAL.text, 'bold 14px sans-serif');
  ctx.globalAlpha = 1;
  if (!disabled) addHit(r.x, r.y, r.w, r.h, 'RESCUE', {});
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
function drawOverlay(title, sub, btnLabel, action, showImg, extra, stars) {
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
    // 星级带:成图底部一枚药丸 + 三颗星(得到=金,未得=灰)
    if (stars) {
      const sy = cy + 52 + iw - 8, pw = 128;
      fillRR(cx + (cw - pw) / 2, sy - 26, pw, 40, 20, 'rgba(255,255,255,0.9)');
      for (let i = 0; i < 3; i++)
        txt('★', cx + cw / 2 + (i - 1) * 38, sy - 4, i < stars ? '#ffb300' : 'rgba(150,130,145,0.35)', '28px sans-serif');
    }
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
