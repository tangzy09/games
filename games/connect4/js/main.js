// connect4 主循环。P2a Task 1 骨架:只接通引擎(i18n / canvas / input / controls),
// 不画棋盘(棋盘是 Task 5)。
// ⚠ G 用 var 不用 const —— 顶层 const 不挂 window,E2E/调试要 window.G(snake 实踩)。
var G = { phase: 'HOME' };

function dispatch(action, data) {
  switch (action) {
    case 'START': G.phase = 'PLAYING'; break;
    case 'HOME': G.phase = 'HOME'; break;
    default: break;
  }
  renderAll();
}

function renderAll() {
  clearHits();
  const { SW, SH } = GameGlobal;
  ctx.clearRect(0, 0, SW, SH);
  txt(T('app.title'), SW / 2, SH * 0.3, '#1f6e4d', 'bold 28px sans-serif');
  fillRR(SW / 2 - 90, SH * 0.5, 180, 48, 12, '#0a84ff');
  txt(T(G.phase === 'HOME' ? 'menu.vsAI' : 'game.again'), SW / 2, SH * 0.5 + 24, '#fff', 'bold 16px sans-serif');
  addHit(SW / 2 - 90, SH * 0.5, 180, 48, G.phase === 'HOME' ? 'START' : 'HOME', {});
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  Input.bind({ onAction: dispatch });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();
}

boot();
