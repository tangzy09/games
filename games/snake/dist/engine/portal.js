// ════════════════════════════════════════
// portal.js — HTML5 game-portal ad adapter (GameDistribution / CrazyGames / Poki).
// The game core only ever calls Ads.*; Ads routes its WEB branch here when a portal
// is active. Which portal is chosen at BUILD time by injecting, before this script:
//     <script>window.__PORTAL__='gd'; window.__GD_GAME_ID__='<id>';</script>
// or for quick local testing: ?portal=gd
// Inert on native (AdMob owns ads) and on plain web (Ads falls back to its confirm-sim).
// ════════════════════════════════════════
const Portal = (() => {
  const q = new URLSearchParams(location.search);
  const id = window.__PORTAL__ || q.get('portal') || null;   // 'gd' | 'crazy' | 'poki'
  const active = !!id && !Platform.isNative;

  const mute   = () => { try { if (window.Music && Music.pauseForAd)  Music.pauseForAd();  } catch (e) {} };
  const unmute = () => { try { if (window.Music && Music.resumeForAd) Music.resumeForAd(); } catch (e) {} };

  // ---------- GameDistribution ----------
  // Docs: https://github.com/GameDistribution/GD-HTML5/wiki/SDK-Implementation
  function gdBoot() {
    window.GD_OPTIONS = {
      gameId: window.__GD_GAME_ID__ || '00000000000000000000000000000000',
      onEvent(e) {
        if (e.name === 'SDK_GAME_PAUSE') mute();
        else if (e.name === 'SDK_GAME_START') unmute();
      },
    };
    const s = document.createElement('script');
    s.id = 'gamedistribution-jssdk';
    s.src = 'https://html5.api.gamedistribution.com/main.min.js';
    document.head.appendChild(s);
  }
  const gd = {
    interstitial() { try { return Promise.resolve(window.gdsdk && gdsdk.showAd(gdsdk.AdType && gdsdk.AdType.Interstitial)).catch(() => {}); } catch (e) { return Promise.resolve(); } },
    rewarded() {
      // GD rewarded: preload then show; the promise resolves when watched to the end.
      // ⚠ VALIDATE exact resolve/reject in GD's dashboard iframe (their required Activation step).
      try {
        return Promise.resolve(gdsdk.showAd(gdsdk.AdType.Rewarded)).then(() => true).catch(() => false);
      } catch (e) { return Promise.resolve(false); }
    },
  };

  // ---------- CrazyGames (adapter slot) ----------
  // Build injects: <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
  // then CrazyGames.SDK.init(). Ads: CrazyGames.SDK.ad.requestAd('midgame'|'rewarded', {adFinished,adError}).
  const crazy = {
    interstitial() { return new Promise(res => { try { CrazyGames.SDK.ad.requestAd('midgame', { adFinished: res, adError: res }); } catch (e) { res(); } }); },
    rewarded()     { return new Promise(res => { try { CrazyGames.SDK.ad.requestAd('rewarded', { adFinished: () => res(true), adError: () => res(false) }); } catch (e) { res(false); } }); },
  };

  // ---------- Poki (adapter slot) ----------
  // Build injects: <script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
  // then PokiSDK.init(). Ads: PokiSDK.commercialBreak() / PokiSDK.rewardedBreak()->Promise<bool>.
  const poki = {
    interstitial() { try { return Promise.resolve(window.PokiSDK && PokiSDK.commercialBreak()); } catch (e) { return Promise.resolve(); } },
    rewarded()     { try { return Promise.resolve(window.PokiSDK && PokiSDK.rewardedBreak()).then(v => !!v); } catch (e) { return Promise.resolve(false); } },
  };

  const P = ({ gd, crazy, poki })[id] || null;

  return {
    active, id,
    boot() { if (active && id === 'gd') gdBoot(); /* crazy/poki SDK <script> injected by build; init() wired when account ready */ },
    showInterstitial() { return P ? Promise.resolve(P.interstitial()).catch(() => {})    : Promise.resolve(); },
    showRewarded()     { return P ? Promise.resolve(P.rewarded()).catch(() => false)     : Promise.resolve(false); },
  };
})();
