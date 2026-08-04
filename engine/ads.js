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
  // ⚠ The game MUST reserve space for it in its layout (see bannerReserve()) and
  // draw its board above that band. A banner that covers the cards is the single
  // most-hated thing in this genre — never overlay it on the play area.
  //
  // ⛔ 2026-08-03 实机踩到的真坑：游戏侧写死「横幅 = 56px」，实际盖住了底部工具条。
  //   两处都错了，加起来差 ~68px：
  //   ① **ADAPTIVE_BANNER 不是 50 也不是 56** —— 高度由**设备屏幕高度**分档决定
  //      （≤400dp:32 / ≤720dp:50 / **>720dp:90**）。现代手机屏高都 >720 ⇒ 实际 **90pt**。
  //   ② 插件把横幅约束在 `safeAreaLayoutGuide.bottom`（见 BannerExecutor.swift）
  //      ⇒ 横幅**下面**还压着 home indicator 的 safeBottom(34) ⇒ 预留必须 = 高度 + safeBottom。
  //   插件**不会 resize webview**，只是 addSubview 盖上去 ⇒ 全靠游戏自己让位。
  //   真值来自 `bannerAdSizeChanged` 事件（含 hide/失败时的 0），估算只用于广告到达前的首帧。
  let bannerShown = false;
  let bannerSizeH = -1;         // 插件回报的真实高度（pt/dp = CSS px）；-1 = 还没回报，0 = 明确没有横幅
  let sizeListener = null;

  function bannerId() {
    const p = Platform.platform;
    return (REAL.banner && REAL.banner[p]) || TEST_BANNER[p] || TEST_BANNER.android;
  }

  // Google 官方 anchored-adaptive 分档（按设备屏高，不是屏宽）——只作为事件到达前的首帧估计。
  function estBannerHeight() {
    const h = (window.screen && window.screen.height) || window.innerHeight || 800;
    return h <= 400 ? 32 : (h <= 720 ? 50 : 90);
  }

  /**
   * 游戏布局应当为横幅**预留**多少 CSS px（0 = 不需要预留）。
   * = 横幅自身高度 + 底部安全区（横幅贴在 safe area 之上，它下面那条 home indicator 区也不能画内容）。
   * web 恒为 0（没有原生横幅，游戏自己决定要不要画占位条）。
   */
  //   ⚠ 广告没填充/加载失败时插件会回报 height:0 ⇒ 这时**不留白**（留一条空带比没广告更蠢）。
  function bannerReserve() {
    if (!bannerShown) return 0;
    const h = bannerSizeH < 0 ? estBannerHeight() : bannerSizeH;
    return h > 0 ? h + (GameGlobal.safeBottom || 0) : 0;
  }

  async function showBanner() {
    if (bannerShown) return true;
    if (!Platform.isNative || !plugin) return false;   // web: the game draws a placeholder band
    try {
      // 先订阅尺寸事件再展示，否则首次 bannerViewDidReceiveAd 可能早于监听注册。
      if (!sizeListener) {
        sizeListener = await plugin.addListener('bannerAdSizeChanged', ev => {
          const h = (ev && Number(ev.height)) || 0;
          if (h === bannerSizeH) return;
          bannerSizeH = h;
          try { if (API.onBannerSize) API.onBannerSize(bannerReserve()); } catch (e) {}
        });
      }
      bannerShown = true; bannerSizeH = -1;   // 先置位：estBannerHeight 立刻生效，不等广告回来
      try { if (API.onBannerSize) API.onBannerSize(bannerReserve()); } catch (e) {}
      await plugin.showBanner({
        adId: bannerId(),
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: !hasRealIds(),
      });
      return true;
    } catch (e) {
      console.warn('banner failed', e);
      bannerShown = false;                    // 没起来就别占着地皮
      try { if (API.onBannerSize) API.onBannerSize(0); } catch (e2) {}
      return false;
    }
  }

  async function hideBanner() {
    if (!bannerShown || !plugin) return;
    try { await plugin.removeBanner(); } catch (e) {}
    bannerShown = false;
    bannerSizeH = 0;
    try { if (API.onBannerSize) API.onBannerSize(0); } catch (e) {}
  }

  // GDPR: let users change/withdraw ad consent anytime (required in EU).
  // Returns true if the native form was shown; false on web / not configured.
  async function showPrivacyOptions() {
    if (!Platform.isNative || !plugin) return false;
    try { await plugin.showPrivacyOptionsForm(); return true; }
    catch (e) { console.warn('privacy options failed', e); return false; }
  }

  // onBannerSize：横幅出现/尺寸变化/消失时回调（参数 = 应预留的 px）。
  // 游戏侧接上它重新 layout + renderAll —— 广告是异步到达的，不重排就会错位一整局。
  const API = { init, prepare, showRewarded, prepareInterstitial, showInterstitial,
                showBanner, hideBanner, showPrivacyOptions, bannerReserve,
                onBannerSize: null,
                get ready() { return initialized; }, get bannerShown() { return bannerShown; } };
  return API;
})();
