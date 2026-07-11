// main.js — 引擎 boot 契约 + 相位机 + 交互分发(回合制,无 RAF 主循环)。
// 注:G 用 var(非 const)——顶层 const 不挂 window,E2E/调试要 window.G(snake 实测)。
var G = {
  phase: 'HOME',   // HOME | PLAYING | DEAD
  s: null,         // core 状态(Core.createGame 产出)
};

function newGame() {
  // 种子用真随机起(非 core 内部;core 自身禁 Date.now,但外部起局可以)
  G.s = Core.createGame({ seed: (Date.now() % 2147483647) });
  G.phase = 'PLAYING';
}

function dispatch(action, data) {
  switch (action) {
    case 'START':
    case 'RESTART':
      newGame();
      break;
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      Core.shoot(G.s, data.col);
      if (G.s.events.some(e => e.t === 'death')) G.phase = 'DEAD';
      break;
    }
    default: break;
  }
  renderAll();
}

async function boot() {
  try {
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
    restoreAudioPrefs();
    Portal.boot();
    await Ads.init();
    I18N.onChange(() => { Controls.render(); renderAll(); });
    await I18N.setLang(I18N.detect());
    initCanvas();
    G.s = Core.createGame({ seed: 1 });   // HOME 期先建一个空盘供渲染
    G.phase = 'HOME';
    Input.bind({ onAction: dispatch });
    window.addEventListener('resize', () => { initCanvas(); renderAll(); });
    Controls.render();
    renderAll();
    try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
  } catch (err) {
    // boot 异常不许静默白屏:能画就画到屏上
    console.error('abyssshoot boot failed:', err);
    if (typeof ctx !== 'undefined' && ctx) {
      ctx.fillStyle = '#cfe8f5';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Load failed: ' + err.message,
        (GameGlobal.SW || window.innerWidth) / 2, (GameGlobal.SH || window.innerHeight) / 2);
    }
  }
}

boot();
