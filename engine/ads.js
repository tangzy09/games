// ════════════════════════════════════════
// ads.js — AdMob rewarded video + interstitial
// Web: portal SDK when running on a game portal, else simulated with a
// confirm so both flows are testable. Native: @capacitor-community/admob.
// Real ad unit ids come from GAME_CONFIG.adUnits (one AdMob app per game —
// NEVER reuse another game's ids); absent → Google TEST ids + initializeForTesting.
// ════════════════════════════════════════
const Ads = (() => {
  // Google official test ids (safe to ship during development).
  const TEST_REWARDED = {
    android: 'ca-app-pub-3940256099942544/5224354917',
    ios:     'ca-app-pub-3940256099942544/1712485313',
  };
  const TEST_INTERSTITIAL = {
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios:     'ca-app-pub-3940256099942544/4411468910',
  };
  const TEST_BANNER = {
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios:     'ca-app-pub-3940256099942544/2934735716',
  };
  // { rewarded:{ios,android}, interstitial:{ios,android}, banner:{ios,android} }
  const REAL = CFG.adUnits || {};

  const Cap = Platform.Cap;
  let plugin = null;
  let initialized = false;
  let loaded = false;            // rewarded loaded
  let interstitialLoaded = false;

  function rewardedId() {
    const p = Platform.platform;
    return (REAL.rewarded && REAL.rewarded[p]) || TEST_REWARDED[p] || TEST_REWARDED.android;
  }
  function interstitialId() {
    const p = Platform.platform;
    return (REAL.interstitial && REAL.interstitial[p]) || TEST_INTERSTITIAL[p] || TEST_INTERSTITIAL.android;
  }
  function hasRealIds() {
    return !!(REAL.rewarded && REAL.rewarded[Platform.platform]);
  }

  // GDPR/UMP consent + iOS App Tracking Transparency.
  // Order per AdMob docs: initialize → requestConsentInfo → showConsentForm (if REQUIRED) → ATT → serve ads.
  // Requires a UMP message configured in the AdMob console; otherwise no form is shown (status stays NOT_REQUIRED).
  async function requestConsent() {
    try {
      const info = await plugin.requestConsentInfo();
      if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') {
        await plugin.showConsentForm();
      }
    } catch (e) { console.warn('UMP consent failed', e); }
    // iOS 14.5+ App Tracking Transparency — prompt once if the user hasn't decided.
    if (Platform.platform === 'ios') {
      try {
        const res = await plugin.trackingAuthorizationStatus();
        if (res && res.status === 'notDetermined') await plugin.requestTrackingAuthorization();
      } catch (e) { console.warn('ATT request failed', e); }
    }
  }

  async function init() {
    if (!Platform.isNative) { initialized = true; return; }
    plugin = Cap.Plugins.AdMob;
    if (!plugin) { initialized = true; return; }
    try {
      await plugin.initialize({ initializeForTesting: !hasRealIds() });
      await requestConsent(); // GDPR (UMP) + iOS ATT before serving any ad
      initialized = true;
      prepare();
      prepareInterstitial();
    } catch (e) { console.warn('AdMob init failed', e); initialized = true; }
  }

  async function prepare() {
    if (!plugin) return;
    try {
      await plugin.prepareRewardVideoAd({ adId: rewardedId() });
      loaded = true;
    } catch (e) { loaded = false; }
  }

  async function prepareInterstitial() {
    if (!plugin) return;
    try {
      await plugin.prepareInterstitial({ adId: interstitialId() });
      interstitialLoaded = true;
    } catch (e) { interstitialLoaded = false; }
  }

  // Full-screen interstitial.
  // Returns Promise<boolean> — true if an ad was shown.
  async function showInterstitial() {
    if (!Platform.isNative || !plugin) {
      // On a game portal (GD/CrazyGames/Poki) route to its ad SDK; else simulate in-browser.
      if (Portal.active) { await Portal.showInterstitial(); return true; }
      try { window.confirm(I18N.t('ads.simInterstitial')); } catch (e) {}
      return true;
    }

    try {
      if (!interstitialLoaded) await prepareInterstitial();
      await plugin.showInterstitial();
      interstitialLoaded = false;
      prepareInterstitial(); // preload next
      return true;
    } catch (e) {
      console.warn('interstitial failed', e);
      return false;
    }
  }

  // Returns Promise<boolean> — true if the user earned the reward.
  async function showRewarded() {
    if (!Platform.isNative || !plugin) {
      // On a game portal route to its rewarded SDK; else simulate watching an ad in-browser.
      if (Portal.active) return Portal.showRewarded();
      return new Promise(res => {
        const ok = window.confirm(I18N.t('ads.simWatch'));
        setTimeout(() => res(ok), ok ? 400 : 0);
      });
    }

    try {
      if (!loaded) await prepare();
      let rewarded = false;
      const onReward = () => { rewarded = true; };
      // listener names per @capacitor-community/admob v6
      const h1 = await plugin.addListener('onRewardedVideoAdReward', onReward);
      const h2 = await plugin.addListener('onRewardedVideoCompleted', () => {});
      await plugin.showRewardVideoAd();
      try { h1 && h1.remove(); } catch (e) {}
      try { h2 && h2.remove(); } catch (e) {}
      loaded = false;
      prepare(); // preload next
      return rewarded;
    } catch (e) {
      console.warn('rewarded failed', e);
      return false;
    }
  }

  // ── Banner ────────────────────────────────────────────────────────────────
  // For long-session genres (solitaire: 10-15 min a sitting — among the longest
  // of any casual genre) the banner, not the rewarded video, is the main revenue:
  // huge impression time and it never interrupts play.
  //
  // ⚠ The game MUST reserve space for it in its layout (see Layout.BANNER_H) and
  // draw its board above that band. A banner that covers the cards is the single
  // most-hated thing in this genre — never overlay it on the play area.
  let bannerShown = false;

  function bannerId() {
    const p = Platform.platform;
    return (REAL.banner && REAL.banner[p]) || TEST_BANNER[p] || TEST_BANNER.android;
  }

  async function showBanner() {
    if (bannerShown) return true;
    if (!Platform.isNative || !plugin) return false;   // web: the game draws a placeholder band
    try {
      await plugin.showBanner({
        adId: bannerId(),
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: !hasRealIds(),
      });
      bannerShown = true;
      return true;
    } catch (e) { console.warn('banner failed', e); return false; }
  }

  async function hideBanner() {
    if (!bannerShown || !plugin) return;
    try { await plugin.removeBanner(); } catch (e) {}
    bannerShown = false;
  }

  // GDPR: let users change/withdraw ad consent anytime (required in EU).
  // Returns true if the native form was shown; false on web / not configured.
  async function showPrivacyOptions() {
    if (!Platform.isNative || !plugin) return false;
    try { await plugin.showPrivacyOptionsForm(); return true; }
    catch (e) { console.warn('privacy options failed', e); return false; }
  }

  return { init, prepare, showRewarded, prepareInterstitial, showInterstitial,
           showBanner, hideBanner, showPrivacyOptions,
           get ready() { return initialized; }, get bannerShown() { return bannerShown; } };
})();
