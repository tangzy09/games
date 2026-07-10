// ════════════════════════════════════════
// main.js — boot, meta persistence, dispatch.
// ════════════════════════════════════════

// Meta progression: souls & best floor survive across runs (death always pays).
const Meta = {
  souls: 0, best: 0,
  load() {
    this.souls = parseInt(Platform.storage.get(CFG.key('souls')) || '0', 10);
    this.best = parseInt(Platform.storage.get(CFG.key('best')) || '0', 10);
  },
  save() {
    Platform.storage.set(CFG.key('souls'), String(this.souls));
    Platform.storage.set(CFG.key('best'), String(this.best));
  },
};

// settle a finished run exactly once (WIN or LOSE)
function settleRun() {
  if (G.settled) return;
  G.settled = true;
  Meta.souls += G.souls;
  const reached = G.phase === 'WIN' ? FLOORS.length : G.floorIdx + 1;
  if (reached > Meta.best) Meta.best = reached;
  Meta.save();
}

let floatTimer = null;
function flushFloat() {
  if (!G.pendingFloat) return;
  G.floatMsg = T(G.pendingFloat.key, G.pendingFloat.params);
  G.pendingFloat = null;
  if (floatTimer) clearTimeout(floatTimer);
  floatTimer = setTimeout(() => { G.floatMsg = null; floatTimer = null; renderAll(); }, 1500);
}

function dispatch(action, data) {
  switch (action) {
    case 'START_RUN': G.settled = false; initRun(); break;
    case 'ENTER_FLOOR': startFloor(); break;
    case 'CELL': {
      if (G.phase !== 'PLAYING') break;
      const before = G.hp;
      clickCell(data.i);
      if (G.hp < before) Haptics.medium();
      if (G.phase === 'LOSE') { Haptics.heavy(); settleRun(); }
      if (G.phase === 'WIN') settleRun();
      break;
    }
    case 'PICK_RELIC': pickRelic(data.id); break;
    case 'RESTART': G.settled = false; initRun(); startFloor(); break; // one tap → straight into a fresh floor
    case 'GO_HOME': G.phase = 'HOME'; break;
    default: break;
  }
  flushFloat();
  renderAll();
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('souls'), CFG.key('best')]);
  restoreAudioPrefs();
  Meta.load();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  Input.bind({ onAction: dispatch });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();
  try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
}

boot();
