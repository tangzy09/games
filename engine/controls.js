// ════════════════════════════════════════
// controls.js — top DOM control bar: language menu (+ optional per-game extras).
// The one DOM element over the canvas. Requires in index.html:
//   <div id="controls"></div>
// and CSS for .ctl-btn / .lang-menu / .lang-item (see engine/engine.css).
// Games append extra controls via Controls.render(extraHtml, bindExtra).
// Re-render on I18N.onChange.
// ════════════════════════════════════════
const Controls = (() => {
  let lastExtra = '', lastBind = null;

  function render(extraHtml, bindExtra) {
    if (extraHtml !== undefined) { lastExtra = extraHtml || ''; lastBind = bindExtra || null; }
    const bar = document.getElementById('controls');
    if (!bar) return;

    const cur = I18N.lang;
    const curName = I18N.NATIVE[cur] || I18N.t('lang.name');
    const langBtn = `<div class="ctl-btn lang" id="lang-btn" title="${I18N.t('lang.toggle')}">${curName} <span class="caret">▾</span></div>`;
    const langMenu = `<div id="lang-menu" class="lang-menu" hidden>` + I18N.SUPPORTED.map(l =>
      `<div class="lang-item${l === cur ? ' sel' : ''}" data-lang="${l}">${I18N.NATIVE[l] || l}</div>`
    ).join('') + `</div>`;

    bar.innerHTML = langBtn + langMenu + lastExtra;

    const lb = document.getElementById('lang-btn');
    const menu = document.getElementById('lang-menu');
    if (lb && menu) {
      lb.onclick = (e) => { e.stopPropagation(); toggleLangMenu(); };
      menu.querySelectorAll('.lang-item').forEach(it => {
        it.onclick = async (e) => {
          e.stopPropagation();
          closeLangMenu();
          await I18N.setLang(it.getAttribute('data-lang')); // onChange → game re-renders
        };
      });
    }
    if (lastBind) { try { lastBind(bar); } catch (e) {} }
  }

  function toggleLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (!menu) return;
    if (menu.hidden) openLangMenu(); else closeLangMenu();
  }
  function openLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (!menu) return;
    menu.hidden = false;
    // close when tapping anywhere outside the menu; defer a tick so the opening
    // click itself doesn't immediately close it
    setTimeout(() => document.addEventListener('pointerdown', onOutsideLang), 0);
  }
  function closeLangMenu() {
    const menu = document.getElementById('lang-menu');
    if (menu) menu.hidden = true;
    document.removeEventListener('pointerdown', onOutsideLang);
  }
  function onOutsideLang(e) {
    if (!e.target.closest('#lang-menu, #lang-btn')) closeLangMenu();
  }

  return { render };
})();
