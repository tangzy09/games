// games/snake/js/main.js — 引擎 boot 契约 + 游戏主循环
// 注:G 用 var(非 const/let)——顶层 const/let 不会挂到 window 上,
// 而 E2E/调试都要能从 window.G 读状态,实测验证过(见 render.js 提交同批 E2E)。
var G = {
  phase: 'LOADING',        // LOADING | PLAYING | PAUSED | DEAD | LEVEL_DONE
  run: null, cyc: null, aiMem: null,
  ai: false, boostHeld: false,
  img: null, imgList: [], imgPos: 0,
  seed: (Date.now() % 2147483647),
};
const loopState = { last: 0, acc: 0 };

function dispatch(action) {
  switch (action) {
    case 'PAUSE':  if (G.phase === 'PLAYING') G.phase = 'PAUSED'; break;
    case 'RESUME': if (G.phase === 'PAUSED') { G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'AI_TOGGLE': G.ai = !G.ai; G.aiMem = AI.createMem(); break;
    case 'RESPAWN':
      Core.respawn(G.run);
      punchCell(G.run.snake[0].x, G.run.snake[0].y);
      G.phase = 'PLAYING'; loopState.last = 0; break;
    case 'NEXT': nextLevel(); break;
    default: break;
  }
  renderAll();
}

function speed() {   // 格/秒:基础7,随长缓升,封顶12(待校准);boost ×1.6
  const base = Math.min(12, 7 + 0.03 * G.run.snake.length);
  return base * (G.boostHeld && !G.ai ? 1.6 : 1);
}

function loadImage() {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { G.img = img; res(); };
    img.onerror = () => { G.img = null; res(); };   // 缺图也能玩
    img.src = 'assets/angels/' + G.imgList[G.imgPos % G.imgList.length];
  });
}
async function nextLevel() {
  G.imgPos++;
  await loadImage();
  initLayers(G.img);
  G.phase = 'PLAYING'; loopState.last = 0;
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (G.phase !== 'PLAYING') { loopState.last = ts; renderAll(); return; }
  if (!loopState.last) loopState.last = ts;
  loopState.acc += ts - loopState.last; loopState.last = ts;
  const interval = 1000 / speed();
  let guard = 0;
  while (loopState.acc >= interval && guard++ < 4 && G.phase === 'PLAYING') {
    loopState.acc -= interval;
    tick(ts);
  }
  renderAll();
}

function tick(nowMs) {
  const prev = G.run.revealedCount;
  if (G.ai) Core.setDir(G.run, AI.nextMove(G.run, G.cyc, G.aiMem));
  Core.step(G.run, { nowMs, freezeCombo: G.boostHeld && !G.ai, scoreScale: G.ai ? 0.5 : 1 });
  if (G.run.revealedCount > prev && !G.run.levelJustDone)
    punchCell(G.run.snake[0].x, G.run.snake[0].y);
  if (G.run.levelJustDone) { G.phase = 'LEVEL_DONE'; revealAllMask(); return; }
  if (G.run.dead) { G.phase = 'DEAD'; }
}

// boost 按住:canvas 原生 pointer 事件(引擎 Input 不管 hold)+ 空格
function bindBoost() {
  const cv = document.getElementById(CFG.canvasId);
  const inBoost = (e) => {
    const b = Layout.btnBoost;
    return b && e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h;
  };
  cv.addEventListener('pointerdown', e => { if (inBoost(e)) G.boostHeld = true; });
  cv.addEventListener('pointerup',   () => { G.boostHeld = false; });
  cv.addEventListener('pointercancel', () => { G.boostHeld = false; });
  document.addEventListener('keydown', e => { if (e.key === ' ') { G.boostHeld = true; e.preventDefault(); } });
  document.addEventListener('keyup',   e => { if (e.key === ' ') G.boostHeld = false; });
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  const mf = await fetch('assets/angels/manifest.json').then(r => r.json());
  G.imgList = mf.images;
  G.run = Core.createGame({ seed: G.seed });
  G.cyc = AI.buildCycle(G.run.cols, G.run.rows);
  G.aiMem = AI.createMem();
  await loadImage();
  initLayers(G.img);
  Input.bind({
    liveSwipe: true,
    onAction: dispatch,
    onSwipe: d => { if (!G.ai && G.phase === 'PLAYING') Core.setDir(G.run, d); },
    canSwipe: () => G.phase === 'PLAYING',
  });
  bindBoost();
  document.addEventListener('visibilitychange', () => { if (document.hidden) dispatch('PAUSE'); });
  window.addEventListener('resize', () => { initCanvas(); if (G.run) initLayers(G.img); renderAll(); });
  Controls.render();
  G.phase = 'PLAYING';
  requestAnimationFrame(frame);
}

boot();
