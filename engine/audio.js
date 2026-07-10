// ════════════════════════════════════════
// audio.js — sfx / bgm / haptics
// Sound effects and bgm tracks come from GAME_CONFIG:
//   sfx: { tap:'audio/move.wav', merge:'audio/merge.wav', … } → Sfx.play('tap')
//   bgm: ['audio/bgm.mp3', …], bgmNames: ['Main', …]          → Music.start()/nextTrack()
// Persisted toggle: CFG.key('sfx') (default on). Haptics gated on the same toggle.
// ════════════════════════════════════════

// Shared audio flags (SW/SH live in canvas.js's GameGlobal; audio only owns these)
const AudioState = { sfxOn: true, bgmOn: false, bgmTrackName: '' };

function createWebAudio(src) {
  const el = new Audio();
  el.src = src;
  return {
    get src(){return el.src;}, set src(v){el.src=v;}, set loop(v){el.loop=v;},
    get currentTime(){return el.currentTime;}, set currentTime(v){try{el.currentTime=v;}catch(e){}},
    play(){const p=el.play();if(p)p.catch(()=>{});}, pause(){el.pause();},
    stop(){el.pause();try{el.currentTime=0;}catch(e){}}, destroy(){el.pause();el.src='';},
  };
}

const Sfx = (() => {
  const pool = {}; // name → audio element (lazy)
  function get(name) {
    if (!pool[name] && CFG.sfx[name]) pool[name] = createWebAudio(CFG.sfx[name]);
    return pool[name];
  }
  return {
    play(name) {
      if (!AudioState.sfxOn) return;
      try { const a = get(name); if (a) { a.currentTime = 0; a.play(); } } catch (e) {}
    },
    toggle() {
      AudioState.sfxOn = !AudioState.sfxOn;
      try { Platform.storage.set(CFG.key('sfx'), AudioState.sfxOn ? '1' : '0'); } catch (e) {}
      return AudioState.sfxOn;
    },
    get on() { return AudioState.sfxOn; },
  };
})();

const Music = (() => {
  let bgmCtx = null, trackIdx = 0, pausedForAd = false;
  function loadBgm(idx) {
    if (!CFG.bgm.length) return;
    if (bgmCtx) { try { bgmCtx.stop(); bgmCtx.destroy(); } catch (e) {} }
    bgmCtx = createWebAudio(CFG.bgm[idx]);
    bgmCtx.loop = true;
    if (AudioState.bgmOn) bgmCtx.play();
  }
  return {
    start() {
      if (!CFG.bgm.length) return;
      AudioState.bgmOn = true;
      AudioState.bgmTrackName = CFG.bgmNames[0] || '';
      loadBgm(0);
    },
    toggleBgm() {
      AudioState.bgmOn = !AudioState.bgmOn;
      try { AudioState.bgmOn ? bgmCtx.play() : bgmCtx.pause(); } catch (e) {}
      return AudioState.bgmOn;
    },
    nextTrack() {
      if (!CFG.bgm.length) return;
      trackIdx = (trackIdx + 1) % CFG.bgm.length;
      AudioState.bgmTrackName = CFG.bgmNames[trackIdx] || '';
      loadBgm(trackIdx);
    },
    // portal.js hooks: portals require muting during their ads
    pauseForAd()  { if (AudioState.bgmOn && bgmCtx) { pausedForAd = true;  try { bgmCtx.pause(); } catch (e) {} } },
    resumeForAd() { if (pausedForAd && bgmCtx)      { pausedForAd = false; try { bgmCtx.play();  } catch (e) {} } },
    get on() { return AudioState.bgmOn; },
    get trackName() { return AudioState.bgmTrackName; },
  };
})();

// Haptics: native Capacitor Haptics plugin, else Web Vibration API.
// Gated on the sound toggle so the 🔊 button also silences vibration.
const Haptics = (() => {
  const plugin = () => Platform.Cap && Platform.Cap.Plugins && Platform.Cap.Plugins.Haptics;
  function impact(style, fallbackMs) {
    if (!AudioState.sfxOn) return;
    const p = plugin();
    if (p && p.impact) { try { p.impact({ style }); return; } catch (e) {} }
    try { if (navigator.vibrate) navigator.vibrate(fallbackMs); } catch (e) {}
  }
  return {
    light()  { impact('LIGHT', 12); },
    medium() { impact('MEDIUM', 24); },
    heavy()  { impact('HEAVY', [40, 30, 60]); },
  };
})();

// Restore persisted sound toggle. Call after Platform.hydrate([...CFG.key('sfx')...]).
function restoreAudioPrefs() {
  AudioState.sfxOn = Platform.storage.get(CFG.key('sfx')) !== '0';
}
