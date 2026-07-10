// ════════════════════════════════════════
// i18n.js — lightweight i18n engine
// Locale JSON files live in /locales/<lang>.json (serve over http; file:// fails)
// Storage key is per-game: CFG.key('lang').
// ════════════════════════════════════════
const I18N = (() => {
  // Default = the 10-language set (by native speakers); override via GAME_CONFIG.languages.
  const SUPPORTED = CFG.languages || ['zh-CN', 'en', 'es', 'hi', 'bn', 'pt-BR', 'ru', 'ja', 'pa', 'de'];
  // native display name per locale — for the language menu, which must list ALL
  // languages before their dicts are loaded (the active dict's lang.name only
  // covers the current one). Keep in sync with each locale's lang.name.
  const NATIVE = {
    'zh-CN': '中文', en: 'English', es: 'Español', hi: 'हिन्दी', bn: 'বাংলা',
    'pt-BR': 'Português', ru: 'Русский', ja: '日本語', pa: 'ਪੰਜਾਬੀ', de: 'Deutsch',
    fr: 'Français', ko: '한국어', it: 'Italiano', 'zh-TW': '繁體中文',
  };
  const FALLBACK = 'en';
  const STORAGE_KEY = CFG.key('lang');
  let lang = FALLBACK;
  let dict = {};
  const listeners = [];

  function detect() {
    let saved = '';
    try { saved = Platform.storage.get(STORAGE_KEY) || ''; } catch (e) {}
    if (SUPPORTED.includes(saved)) return saved;
    // derive prefix→locale from SUPPORTED (first match wins) so adding a
    // language only means editing SUPPORTED — no separate table to keep in sync.
    // e.g. 'zh-CN'→zh, 'pt-BR'→pt; a bare device lang like 'pt'/'zh' still maps.
    const PREFIX = {};
    for (const l of SUPPORTED) { const p = l.toLowerCase().split('-')[0]; if (!(p in PREFIX)) PREFIX[p] = l; }
    const navs = (navigator.languages || [navigator.language || '']).map(String);
    for (const n of navs) {
      const p = n.toLowerCase().split('-')[0];
      if (PREFIX[p]) return PREFIX[p];
    }
    return FALLBACK;
  }

  async function load(l) {
    const res = await fetch(`locales/${l}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('locale load failed: ' + l);
    return res.json();
  }

  // dotted-path getter: t('home.title'), t('skins.deep.labels.2')
  function get(path) {
    const parts = String(path).split('.');
    let cur = dict;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  // t('float.crit', {val:512}) — {val} placeholders replaced
  function t(path, params) {
    let v = get(path);
    if (v == null) return path; // surface the missing key for debugging
    if (typeof v === 'string' && params) {
      v = v.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? params[k] : m));
    }
    return v;
  }

  async function setLang(l) {
    if (!SUPPORTED.includes(l)) l = FALLBACK;
    dict = await load(l);
    lang = l;
    try { Platform.storage.set(STORAGE_KEY, l); } catch (e) {}
    listeners.forEach(fn => { try { fn(l); } catch (e) {} });
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    SUPPORTED, NATIVE, FALLBACK, STORAGE_KEY,
    get lang() { return lang; },
    detect, setLang, t, get, onChange,
  };
})();
