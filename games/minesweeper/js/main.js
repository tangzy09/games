// ════════════════════════════════════════
// main.js — v2 boot, meta, save/resume, daily, dispatch.
// ════════════════════════════════════════

function dateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return dateStr(new Date()); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); }
function dailySeed() { return parseInt(todayStr().replace(/-/g, ''), 10); }

const Meta = {
  wins: 0, seen: new Set(), badges: new Set(), streak: 0, lastDailyWin: '', lastDailyTry: '', markHintDone: false,
  load() {
    this.wins = parseInt(Platform.storage.get(CFG.key('wins')) || '0', 10);
    this.seen = new Set((Platform.storage.get(CFG.key('seen')) || '').split(',').filter(Boolean));
    this.badges = new Set((Platform.storage.get(CFG.key('badges')) || '').split(',').filter(Boolean));
    this.streak = parseInt(Platform.storage.get(CFG.key('streak')) || '0', 10);
    this.lastDailyWin = Platform.storage.get(CFG.key('dailywin')) || '';
    this.lastDailyTry = Platform.storage.get(CFG.key('dailytry')) || '';
    this.markHintDone = Platform.storage.get(CFG.key('markhint')) === '1';
  },
  save() {
    Platform.storage.set(CFG.key('wins'), String(this.wins));
    Platform.storage.set(CFG.key('seen'), [...this.seen].join(','));
    Platform.storage.set(CFG.key('badges'), [...this.badges].join(','));
    Platform.storage.set(CFG.key('streak'), String(this.streak));
    Platform.storage.set(CFG.key('dailywin'), this.lastDailyWin);
    Platform.storage.set(CFG.key('dailytry'), this.lastDailyTry);
  },
  canDaily() { return this.lastDailyTry !== todayStr(); },
};

function settleRun() {
  if (G.settled) return;
  G.settled = true;
  if (G.phase === 'WIN') { Meta.wins++; G.badgesThisRun.forEach(b => Meta.badges.add(b)); }
  if (G.mode === 'daily') {
    Meta.lastDailyTry = todayStr();
    if (G.phase === 'WIN') {
      Meta.streak = (Meta.lastDailyWin === yesterdayStr()) ? Meta.streak + 1 : 1;
      Meta.lastDailyWin = todayStr();
    } else Meta.streak = 0;
  }
  Meta.save();
  clearRunSave();
}

function mergeEncounters() {
  if (!G.encounters.length) return;
  let fresh = 0;
  for (const id of G.encounters) if (!Meta.seen.has(id)) { Meta.seen.add(id); fresh++; }
  G.encounters = [];
  if (fresh) Meta.save(); // codex shows everything already — no need to announce entries
}

// ── save/resume ──
const SAVE_VERSION = 3; // bump on any G-shape change; old saves are discarded, not migrated
function saveRun() {
  if (G.phase !== 'PLAYING') { clearRunSave(); return; }
  const s = {
    v: SAVE_VERSION,
    phase: G.phase, mode: G.mode, w: G.w, h: G.h, grid: G.grid,
    hp: G.hp, maxHp: G.maxHp, halfHeart: G.halfHeart, xp: G.xp, level: G.level,
    killedMice: G.killedMice, minesDisarmed: G.minesDisarmed, badgesThisRun: G.badgesThisRun,
    revealCount: G.revealCount,
    adRevived: !!G.adRevived, tut: G.tut,
  };
  try { Platform.storage.set(CFG.key('run'), JSON.stringify(s)); } catch (e) {}
}
function clearRunSave() { Platform.storage.set(CFG.key('run'), ''); }
function loadRun() {
  let s;
  try { s = JSON.parse(Platform.storage.get(CFG.key('run')) || ''); } catch (e) { return false; }
  // v1 saves (and anything malformed) resume into a 0×0 board = silent blank screen.
  // Version-gate + shape-check; anything suspect is discarded, never migrated.
  if (!s || s.v !== SAVE_VERSION || s.phase !== 'PLAYING'
    || !(s.w > 0) || !(s.h > 0) || !Array.isArray(s.grid) || s.grid.length !== s.w * s.h) {
    clearRunSave();
    return false;
  }
  Object.assign(G, s, { rng: Math.random, encounters: [], settled: false, tut: s.tut || null });
  G.pendingFloat = { key: 'float.resumed' };
  return true;
}

// tutorial: 1 tap-to-reveal → 2 numbers [next] → 3 fight a monster → 4 goal [done]
const Tut = {
  start() { if (Platform.storage.get(CFG.key('tut')) !== '1') G.tut = { step: 1 }; },
  advance(revealed, fought) {
    if (!G.tut) return;
    if (G.tut.step === 1 && revealed) G.tut.step = 2;
    else if (G.tut.step === 3 && fought) G.tut.step = 4;
  },
  next() { if (!G.tut) return; if (G.tut.step === 2) G.tut.step = 3; else if (G.tut.step === 4) Tut.done(); },
  done() { G.tut = null; Platform.storage.set(CFG.key('tut'), '1'); },
};

let floatTimer = null;
function flushFloat() {
  if (!G.pendingFloat) return;
  G.floatMsg = T(G.pendingFloat.key, G.pendingFloat.params);
  G.pendingFloat = null;
  if (floatTimer) clearTimeout(floatTimer);
  floatTimer = setTimeout(() => { G.floatMsg = null; floatTimer = null; renderAll(); }, 1500);
}

function orientBoard() { // portrait phones get 10×13
  if (window.innerHeight > window.innerWidth) { BOARD_W = 10; BOARD_H = 13; }
  else { BOARD_W = 13; BOARD_H = 10; }
}

function dispatch(action, data) {
  switch (action) {
    case 'START_RUN': orientBoard(); G.reviewMode = false; G.settled = false; G.rng = Math.random; G.adRevived = false; initRun(); Tut.start(); break;
    case 'START_DAILY':
      if (!Meta.canDaily()) break;
      orientBoard(); G.reviewMode = false; G.settled = false; G.adRevived = false;
      initDaily(PRNG.create(dailySeed()));
      break;
    case 'CELL': {
      if (G.phase !== 'PLAYING') break;
      if (G.markMenu != null) { G.markMenu = null; break; }
      const revBefore = G.revealCount, hpBefore = G.hp;
      const deadBefore = G.grid.filter(x => x.defeated).length;
      clickCell(data.i);
      if (G.hp < hpBefore) Haptics.medium();
      Tut.advance(G.revealCount > revBefore, G.grid.filter(x => x.defeated).length > deadBefore);
      if (G.phase === 'LOSE') { Haptics.heavy(); settleRun(); }
      if (G.phase === 'WIN') { Haptics.light(); settleRun(); }
      break;
    }
    case 'LEVEL_UP': levelUp(); Haptics.light(); break;
    case 'TUT_NEXT': Tut.next(); break;
    case 'TUT_SKIP': Tut.done(); break;
    case 'AD_REVIVE': { // once per run: watch an ad, stand back up at half HP
      if (G.phase !== 'LOSE' || G.mode !== 'normal' || G.adRevived) break;
      (async () => {
        const ok = await Ads.showRewarded();
        if (ok) {
          G.settled = false; // run resumes; it will settle again at its real end
          if (G.phase === 'LOSE') Meta.wins -= 0; // wins untouched on lose; nothing to roll back
          G.adRevived = true;
          G.hp = Math.max(1, Math.ceil(G.maxHp / 2));
          G.phase = 'PLAYING';
          G.pendingFloat = { key: 'float.revive' };
        } else G.pendingFloat = { key: 'float.adNoReward' };
        flushFloat(); renderAll(); saveRun();
      })();
      break;
    }
    case 'AD_HINT': { // watch an ad → scout a random 3×3 patch (sight only, no fight)
      if (G.phase !== 'PLAYING' || G.hintPending) break;
      G.hintPending = true;
      renderAll();
      (async () => {
        const ok = await Ads.showRewarded();
        G.hintPending = false;
        if (ok && G.phase === 'PLAYING') {
          const opened = hintReveal();
          if (opened.length) { Haptics.light(); G.pendingFloat = { key: 'float.hint', params: { n: opened.length } }; }
          else G.pendingFloat = { key: 'float.hintNone' };
        } else if (!ok) G.pendingFloat = { key: 'float.adNoReward' };
        flushFloat(); renderAll(); saveRun();
      })();
      break;
    }
    case 'RESTART': orientBoard(); G.reviewMode = false; G.settled = false; G.rng = Math.random; G.adRevived = false; initRun(); break;
    case 'REVEAL_ALL': if (G.phase === 'LOSE') { G.reviewMode = true; G.grid.forEach(c => { c.rev = true; }); } break;
    case 'GO_HOME': G.phase = 'HOME'; G.overlay = null; G.reviewMode = false; break;
    case 'OPEN_CODEX': G.overlay = 'codex'; G.codexPage = 0; break;
    case 'OPEN_HELP': G.overlay = 'help'; G.helpPage = 0; break;
    case 'HELP_PAGE': G.helpPage = (G.helpPage || 0) + data.d; break;
    case 'CODEX_PAGE': G.codexPage = (G.codexPage || 0) + data.d; break;
    case 'MARK_MENU': { // long-press a hidden tile → mark picker
      if (G.phase !== 'PLAYING') break;
      const cell = G.grid[data.i];
      G.markMenu = (cell && !cell.rev) ? data.i : null;
      break;
    }
    case 'SET_MARK': {
      if (G.markMenu != null && G.grid[G.markMenu]) G.grid[G.markMenu].mark = data.m || null;
      G.markMenu = null;
      if (data.m && !Meta.markHintDone) { Meta.markHintDone = true; Platform.storage.set(CFG.key('markhint'), '1'); }
      break;
    }
    case 'MARK_CLOSE': G.markMenu = null; break;
    case 'CLOSE_OVERLAY': G.overlay = null; break;
    default: break;
  }
  mergeEncounters();
  flushFloat();
  renderAll();
  saveRun();
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('wins'), CFG.key('seen'), CFG.key('badges'),
    CFG.key('streak'), CFG.key('dailywin'), CFG.key('dailytry'), CFG.key('run'), CFG.key('tut')]);
  restoreAudioPrefs();
  Meta.load();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  loadRun();
  Input.bind({ onAction: dispatch, onLongPress: (action, data) => { if (action === 'CELL') dispatch('MARK_MENU', data); } });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  flushFloat();
  renderAll();
  try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
}

boot();
