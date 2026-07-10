// ════════════════════════════════════════
// config.js — engine-wide config facade over window.GAME_CONFIG.
// Each game defines GAME_CONFIG BEFORE any engine script:
//   <script>
//     window.GAME_CONFIG = {
//       id: 'mines',                  // REQUIRED. storage prefix, unique per game
//       canvasId: 'game-canvas',
//       languages: ['zh-CN','en',…],  // optional; defaults to the 10-language set
//       adUnits: {                    // optional; absent → Google TEST ids
//         rewarded:     { ios: 'ca-app-pub-…', android: 'ca-app-pub-…' },
//         interstitial: { ios: 'ca-app-pub-…', android: 'ca-app-pub-…' },
//       },
//       bgm: ['audio/bgm.mp3'], bgmNames: ['Main'],
//       sfx: { tap: 'audio/move.wav', merge: 'audio/merge.wav' },
//       hydrateKeys: [],              // extra Platform storage keys to hydrate at boot
//     };
//   </script>
// Engine modules read CFG.*; games read it too if they need to.
// ════════════════════════════════════════
const CFG = (() => {
  const c = window.GAME_CONFIG || {};
  if (!c.id) console.warn('GAME_CONFIG.id missing — storage keys will collide across games');
  const id = c.id || 'ag';
  return {
    id,
    key: (suffix) => `${id}_${suffix}`, // storage key helper: CFG.key('lang') → 'mines_lang'
    canvasId: c.canvasId || 'game-canvas',
    languages: c.languages || null,
    adUnits: c.adUnits || null,
    bgm: c.bgm || [],
    bgmNames: c.bgmNames || [],
    sfx: c.sfx || {},
    hydrateKeys: c.hydrateKeys || [],
  };
})();
