// ════════════════════════════════════════
// platform.js — native/web abstraction layer
// Detects Capacitor; provides storage + native readiness.
// On the web everything degrades to localStorage / no-ops.
// ════════════════════════════════════════
const Platform = (() => {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const platform = (Cap && Cap.getPlatform) ? Cap.getPlatform() : 'web';

  // Synchronous storage facade backed by an in-memory cache.
  // We hydrate the cache from Capacitor Preferences (or localStorage) at boot
  // so the rest of the game can keep using synchronous get/set.
  const cache = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  async function hydrate(keys) {
    if (isNative && Cap.Plugins && Cap.Plugins.Preferences) {
      const P = Cap.Plugins.Preferences;
      for (const k of keys) {
        try { const { value } = await P.get({ key: k }); if (value != null) cache[k] = value; }
        catch (e) {}
      }
    } else {
      for (const k of keys) { const v = lsGet(k); if (v != null) cache[k] = v; }
    }
  }

  const storage = {
    get(k) { return k in cache ? cache[k] : lsGet(k); },
    set(k, v) {
      v = String(v);
      cache[k] = v;
      lsSet(k, v); // always mirror to localStorage for instant reads
      if (isNative && Cap.Plugins && Cap.Plugins.Preferences) {
        try { Cap.Plugins.Preferences.set({ key: k, value: v }); } catch (e) {}
      }
    },
  };

  return { Cap, isNative, platform, storage, hydrate };
})();
