// ════════════════════════════════════════
// main.js — boot, meta persistence, run save/resume, daily challenge, dispatch.
// ════════════════════════════════════════

function dateStr(d) { return d.toISOString().slice(0, 10); }
function todayStr() { return dateStr(new Date()); }
function yesterdayStr() { const d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d); }
function dailySeed() { return parseInt(todayStr().replace(/-/g, ''), 10); }

// Meta progression: everything that survives across runs.
const Meta = {
  souls: 0, best: 0,
  upgrades: new Set(),      // owned UPGRADES ids
  seen: new Set(),          // codex: monster ids ever encountered
  streak: 0,                // consecutive daily-challenge wins
  lastDailyWin: '',         // date of last daily win (for streak continuity)
  lastDailyTry: '',         // date of last daily attempt (one try per day)
  load() {
    this.souls = parseInt(Platform.storage.get(CFG.key('souls')) || '0', 10);
    this.best = parseInt(Platform.storage.get(CFG.key('best')) || '0', 10);
    this.upgrades = new Set((Platform.storage.get(CFG.key('upg')) || '').split(',').filter(Boolean));
    this.seen = new Set((Platform.storage.get(CFG.key('seen')) || '').split(',').filter(Boolean));
    this.streak = parseInt(Platform.storage.get(CFG.key('streak')) || '0', 10);
    this.lastDailyWin = Platform.storage.get(CFG.key('dailywin')) || '';
    this.lastDailyTry = Platform.storage.get(CFG.key('dailytry')) || '';
  },
  save() {
    Platform.storage.set(CFG.key('souls'), String(this.souls));
    Platform.storage.set(CFG.key('best'), String(this.best));
    Platform.storage.set(CFG.key('upg'), [...this.upgrades].join(','));
    Platform.storage.set(CFG.key('seen'), [...this.seen].join(','));
    Platform.storage.set(CFG.key('streak'), String(this.streak));
    Platform.storage.set(CFG.key('dailywin'), this.lastDailyWin);
    Platform.storage.set(CFG.key('dailytry'), this.lastDailyTry);
  },
  perks() { const p = {}; this.upgrades.forEach(id => { p[id] = true; }); return p; },
  canDaily() { return this.lastDailyTry !== todayStr(); },
  canBuy(u) { return !this.upgrades.has(u.id) && this.souls >= u.cost && (!u.req || this.upgrades.has(u.req)); },
};

// settle a finished run exactly once (WIN or LOSE)
function settleRun() {
  if (G.settled) return;
  G.settled = true;
  Meta.souls += G.souls;
  if (G.mode === 'daily') {
    Meta.lastDailyTry = todayStr();
    if (G.phase === 'WIN') {
      Meta.streak = (Meta.lastDailyWin === yesterdayStr()) ? Meta.streak + 1 : 1;
      Meta.lastDailyWin = todayStr();
    } else {
      Meta.streak = 0;
    }
  } else {
    const reached = G.phase === 'WIN' ? FLOORS.length : G.floorIdx + 1;
    if (reached > Meta.best) Meta.best = reached;
  }
  Meta.save();
  clearRunSave();
}

// codex bookkeeping: merge this dispatch's encounters, pay first-sighting bonus
function mergeEncounters() {
  if (!G.encounters.length) return;
  let fresh = 0;
  for (const id of G.encounters) {
    if (!Meta.seen.has(id)) { Meta.seen.add(id); fresh++; }
  }
  G.encounters = [];
  if (fresh) {
    Meta.souls += fresh * 2;
    Meta.save();
    if (!G.pendingFloat) G.pendingFloat = { key: 'float.codexNew', params: { n: fresh * 2 } };
  }
}

// ── run save/resume: every action autosaves; closing the tab never loses a run ──
const SAVE_PHASES = ['PLAYING', 'LEVEL_INTRO', 'PICK_RELIC', 'SHOP'];
function saveRun() {
  if (!SAVE_PHASES.includes(G.phase)) { clearRunSave(); return; }
  const s = {
    phase: G.phase, mode: G.mode, floorIdx: G.floorIdx, size: G.size, grid: G.grid,
    hp: G.hp, maxHp: G.maxHp, xp: G.xp, level: G.level, gold: G.gold, souls: G.souls,
    relics: G.relics, relicChoiceIds: G.relicChoices.map(r => r.id),
    revealCount: G.revealCount, regenCounter: G.regenCounter,
    revived: G.revived, guardUsed: G.guardUsed, tut: G.tut,
    items: G.items, shieldUp: G.shieldUp, shopAt: G.shopAt,
  };
  try { Platform.storage.set(CFG.key('run'), JSON.stringify(s)); } catch (e) {}
}
function clearRunSave() { Platform.storage.set(CFG.key('run'), ''); }
function loadRun() {
  let s;
  try { s = JSON.parse(Platform.storage.get(CFG.key('run')) || ''); } catch (e) { return false; }
  if (!s || !SAVE_PHASES.includes(s.phase)) return false;
  Object.assign(G, {
    phase: s.phase, mode: s.mode, floorIdx: s.floorIdx, size: s.size, grid: s.grid,
    hp: s.hp, maxHp: s.maxHp, xp: s.xp, level: s.level, gold: s.gold, souls: s.souls,
    relics: s.relics, relicChoices: s.relicChoiceIds.map(id => RELICS.find(r => r.id === id)).filter(Boolean),
    revealCount: s.revealCount, regenCounter: s.regenCounter,
    revived: s.revived, guardUsed: s.guardUsed, tut: s.tut || null,
    items: s.items || [], shieldUp: !!s.shieldUp, shopAt: s.shopAt != null ? s.shopAt : null,
    itemMode: null, encounters: [],
    perks: Meta.perks(), settled: false,
  });
  // seeded daily rng can't be restored mid-sequence; later draws fall back to Math.random
  G.rng = Math.random;
  G.pendingFloat = { key: 'float.resumed' };
  return true;
}

// Inline tutorial: 4 steps woven into floor 1 (never a separate level, never modal).
// step 1: reveal a tile → 2: read numbers [next] → 3: step on a weak monster → 4: stairs/goal [done]
const Tut = {
  start() { if (Platform.storage.get(CFG.key('tut')) !== '1') G.tut = { step: 1 }; },
  advance(revealedSomething, fought) {
    if (!G.tut) return;
    if (G.tut.step === 1 && revealedSomething) G.tut.step = fought ? 4 : 2;
    else if (G.tut.step === 3 && fought) G.tut.step = 4;
  },
  next() {
    if (!G.tut) return;
    if (G.tut.step === 2) G.tut.step = 3;
    else if (G.tut.step === 4) Tut.done();
  },
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

function dispatch(action, data) {
  switch (action) {
    case 'START_RUN': G.settled = false; G.perks = Meta.perks(); G.rng = Math.random; initRun(); Tut.start(); break;
    case 'START_DAILY': {
      if (!Meta.canDaily()) break;
      G.settled = false; G.perks = Meta.perks();
      initDaily(PRNG.create(dailySeed()));
      break;
    }
    case 'ENTER_FLOOR': startFloor(); break;
    case 'CELL': {
      if (G.phase !== 'PLAYING') break;
      const before = G.hp, revBefore = G.revealCount;
      const deadBefore = G.grid.filter(x => x.dead).length;
      clickCell(data.i);
      if (G.hp < before) Haptics.medium();
      // level-up refills HP, so "fought" must come from the kill count, not HP delta
      Tut.advance(G.revealCount > revBefore, G.grid.filter(x => x.dead).length > deadBefore);
      if (G.phase === 'LOSE') { Haptics.heavy(); settleRun(); }
      if (G.phase === 'WIN') settleRun();
      break;
    }
    case 'TUT_NEXT': Tut.next(); break;
    case 'TUT_SKIP': Tut.done(); break;
    case 'USE_ITEM': useItem(data.slot); break;
    case 'SHOP_BUY': buyShopItem(data.id); break;
    case 'SHOP_LEAVE': leaveShop(); break;
    case 'OPEN_CODEX': G.overlay = 'codex'; break;
    case 'PICK_RELIC': {
      if (G.tut) Tut.done();
      pickRelic(data.id);
      // interstitial only from floor 3 on, never in daily (protect the streak ritual)
      if (G.mode === 'normal' && G.floorIdx >= 2) { try { Ads.showInterstitial(); } catch (e) {} }
      break;
    }
    case 'AD_REVIVE': { // LOSE screen, normal mode, once per run: watch an ad, stand back up
      if (G.phase !== 'LOSE' || G.mode !== 'normal' || G.adRevived) break;
      (async () => {
        const ok = await Ads.showRewarded();
        if (ok) {
          Meta.souls -= G.souls; Meta.save(); // un-settle: the run continues, souls settle again at the real end
          G.settled = false;
          G.adRevived = true;
          G.hp = Math.max(1, Math.ceil(G.maxHp / 2));
          G.phase = 'PLAYING';
          G.pendingFloat = { key: 'float.revive' };
        } else {
          G.pendingFloat = { key: 'float.adNoReward' };
        }
        flushFloat(); renderAll(); saveRun();
      })();
      break;
    }
    case 'AD_DOUBLE': { // end screens: double this run's souls
      if ((G.phase !== 'LOSE' && G.phase !== 'WIN') || G.soulsDoubled || G.souls <= 0) break;
      (async () => {
        const ok = await Ads.showRewarded();
        if (ok) {
          Meta.souls += G.souls; Meta.save(); // run's souls were already settled once
          G.souls *= 2;
          G.soulsDoubled = true;
        } else {
          G.pendingFloat = { key: 'float.adNoReward' };
        }
        flushFloat(); renderAll();
      })();
      break;
    }
    case 'RESTART': G.settled = false; G.perks = Meta.perks(); G.rng = Math.random; initRun(); startFloor(); break; // one tap → straight into a fresh floor
    case 'GO_HOME': G.phase = 'HOME'; G.overlay = null; break;
    case 'OPEN_UPGRADES': G.overlay = 'upgrades'; break;
    case 'CLOSE_OVERLAY': G.overlay = null; break;
    case 'BUY_UPGRADE': {
      const u = UPGRADES.find(x => x.id === data.id);
      if (u && Meta.canBuy(u)) {
        Meta.souls -= u.cost;
        Meta.upgrades.add(u.id);
        Meta.save();
        Haptics.light();
      }
      break;
    }
    default: break;
  }
  mergeEncounters();
  flushFloat();
  renderAll();
  saveRun();
}

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('souls'), CFG.key('best'),
    CFG.key('upg'), CFG.key('seen'), CFG.key('streak'), CFG.key('dailywin'), CFG.key('dailytry'),
    CFG.key('run'), CFG.key('tut')]);
  restoreAudioPrefs();
  Meta.load();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  loadRun(); // resume an interrupted run, if any
  Input.bind({ onAction: dispatch });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  flushFloat();
  renderAll();
  try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
}

boot();
