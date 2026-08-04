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

  // ⭐ 字号选择器的文案**内置在引擎里**，不走各游戏的 locale：
  //   这是引擎级 UI，要求 5 个游戏 × 10 个 locale 各加 4 个 key 才显示得出来是本末倒置，
  //   而且新游戏会忘。⚠ I18N.t 找不到 key 时返回 key 本身（会在按钮上显示 "font.s"）。
  const FONT_TXT = {
    'en':    ['Text size', 'Small', 'Medium', 'Large'],
    'zh-CN': ['字体大小', '小', '中', '大'],
    'ja':    ['文字サイズ', '小', '中', '大'],
    'de':    ['Schriftgröße', 'Klein', 'Mittel', 'Groß'],
    'es':    ['Tamaño de texto', 'Pequeño', 'Mediano', 'Grande'],
    'pt-BR': ['Tamanho do texto', 'Pequeno', 'Médio', 'Grande'],
    'ru':    ['Размер текста', 'Мелкий', 'Средний', 'Крупный'],
    'hi':    ['टेक्स्ट आकार', 'छोटा', 'मध्यम', 'बड़ा'],
    'bn':    ['লেখার আকার', 'ছোট', 'মাঝারি', 'বড়'],
    'pa':    ['ਲਿਖਤ ਆਕਾਰ', 'ਛੋਟਾ', 'ਦਰਮਿਆਨਾ', 'ਵੱਡਾ'],
  };
  const ftxt = i => (FONT_TXT[I18N.lang] || FONT_TXT.en)[i];

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

    // ⭐ 字号选择器（2026-08-04 用户定：所有游戏都要有，新游戏自动继承）。
    //   放在这条**引擎级顶栏**里而不是各游戏的设置页 —— 五个游戏零改动就都有了，
    //   而且 minesweeper/abyssshoot 这种**根本没有设置页**的也照样有。
    const fs0 = (typeof GameGlobal !== 'undefined' && GameGlobal.fontScale) || 1;
    const fsLabel = fs0 >= 1.3 ? 'A⁺⁺' : fs0 >= 1.15 ? 'A⁺' : 'A';
    const fontBtn = `<div class="ctl-btn font" id="font-btn" title="${ftxt(0)}">${fsLabel}</div>`;
    const fontMenu = `<div id="font-menu" class="lang-menu" hidden>` +
      [[1, 1], [1.15, 2], [1.3, 3]].map(([v, i]) =>
        `<div class="lang-item${Math.abs(v - fs0) < 0.01 ? ' sel' : ''}" data-fs="${v}">${ftxt(i)}</div>`
      ).join('') + `</div>`;

    bar.innerHTML = langBtn + langMenu + fontBtn + fontMenu + lastExtra;

    const fb = document.getElementById('font-btn'), fm = document.getElementById('font-menu');
    if (fb && fm) {
      fb.onclick = (e) => {
        e.stopPropagation();
        closeLangMenu();
        if (fm.hidden) {
          fm.hidden = false;
          setTimeout(() => document.addEventListener('pointerdown', onOutsideFont), 0);
        } else closeFontMenu();
      };
      fm.querySelectorAll('.lang-item').forEach(it => {
        it.onclick = (e) => {
          e.stopPropagation();
          closeFontMenu();
          setFontScale(parseFloat(it.getAttribute('data-fs')));
          render();                                   // 顶栏自己也要刷新（A / A⁺ / A⁺⁺）
          // 让游戏重画：canvas 游戏统一暴露 renderAll（引擎契约）
          try { if (typeof renderAll === 'function') renderAll(); } catch (e2) {}
          try { window.dispatchEvent(new Event('resize')); } catch (e2) {}
        };
      });
    }

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
  function closeFontMenu() {
    const m = document.getElementById('font-menu');
    if (m) m.hidden = true;
    document.removeEventListener('pointerdown', onOutsideFont);
  }
  function onOutsideFont(e) {
    if (!e.target.closest('#font-menu, #font-btn')) closeFontMenu();
  }
  function onOutsideLang(e) {
    if (!e.target.closest('#lang-menu, #lang-btn')) closeLangMenu();
  }

  return { render };
})();
