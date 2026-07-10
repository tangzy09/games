// _demo — minimal game proving the engine contract end-to-end:
// G + phase machine, dispatch, renderAll/clearHits/addHit, i18n, controls bar, input.
const G = { phase: 'HOME', taps: 0 };

function dispatch(action, data) {
  switch (action) {
    case 'START': G.phase = 'PLAYING'; break;
    case 'TAP': G.taps++; Haptics.light(); break;
    case 'HOME': G.phase = 'HOME'; G.taps = 0; break;
    default: break;
  }
  renderAll();
}

function renderAll() {
  clearHits();
  const { SW, SH } = GameGlobal;
  ctx.clearRect(0, 0, SW, SH);

  if (G.phase === 'HOME') {
    txt(T('demo.title'), SW / 2, SH * 0.35, '#0a6a8a', 'bold 28px sans-serif');
    txtLWrap(T('demo.subtitle'), SW / 2 - 130, SH * 0.45, 260, '#3a6480', '14px sans-serif', 18);
    fillRR(SW / 2 - 80, SH * 0.55, 160, 48, 12, '#0a84ff');
    txt(T('demo.start'), SW / 2, SH * 0.55 + 24, '#fff', 'bold 16px sans-serif');
    addHit(SW / 2 - 80, SH * 0.55, 160, 48, 'START', {});
  } else {
    txt(T('demo.taps', { n: G.taps }), SW / 2, SH * 0.4, '#0a6a8a', 'bold 24px sans-serif');
    fillRR(SW / 2 - 60, SH * 0.5, 120, 120, 16, '#38a169');
    txt('👆', SW / 2, SH * 0.5 + 60, '#fff', '40px sans-serif');
    addHit(SW / 2 - 60, SH * 0.5, 120, 120, 'TAP', {});
    fillRR(SW / 2 - 60, SH * 0.72, 120, 36, 10, '#e2e8f0');
    txt(T('demo.back'), SW / 2, SH * 0.72 + 18, '#3a6480', '13px sans-serif');
    addHit(SW / 2 - 60, SH * 0.72, 120, 36, 'HOME', {});
  }
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
