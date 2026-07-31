// ════════════════════════════════════════
// feedback.js — 意见反馈（DOM 浮层表单 → 共享 feedback hub）。
// 后端 = feedback.ai-speeds.com（所有产品共用的现成 hub，零后端改动）。
// canvas 游戏打不出字 ⇒ 表单用真 DOM 浮层（三个类型 chip + 可选文字 + 发送）。
// 离线/失败 → 本地入队，boot 时 flush 补发。⚠ hub 要求 text 非空且是人话。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const HUB = 'https://feedback.ai-speeds.com/api/feedback';
  const QKEY = () => CFG.key('fbq');
  let ov = null, chip = 'bug';

  const CHIPS = ['bug', 'idea', 'other'];

  function context() {
    const G = root.G || {};
    return {
      app: 'cubeblast', version: '1.0.1',
      lang: (root.I18N && I18N.lang) || '',
      gamesPlayed: G.wallet ? G.wallet.gamesPlayed : 0,
      best: G.best || 0,
      levels: G.progress ? Object.keys(G.progress).length : 0,
    };
  }

  function post(payload) {
    return fetch(HUB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => { if (!r.ok) throw new Error('hub ' + r.status); });
  }

  function enqueue(payload) {
    try {
      const q = JSON.parse(Platform.storage.get(QKEY()) || '[]');
      q.push(payload);
      Platform.storage.set(QKEY(), JSON.stringify(q.slice(-20)));
    } catch (e) {}
  }

  /** boot 时补发离线队列 */
  function flush() {
    try {
      const q = JSON.parse(Platform.storage.get(QKEY()) || '[]');
      if (!q.length) return;
      Platform.storage.set(QKEY(), '[]');
      q.forEach(p => post(p).catch(() => enqueue(p)));
    } catch (e) {}
  }

  function css(el, s) { Object.assign(el.style, s); }

  function build() {
    ov = document.createElement('div');
    css(ov, { position: 'fixed', inset: '0', background: 'rgba(15,8,35,0.72)', zIndex: '50',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center' });
    ov.addEventListener('click', e => { if (e.target === ov) hide(); });

    const card = document.createElement('div');
    css(card, { background: '#2a1a52', borderRadius: '18px 18px 0 0', padding: '18px 16px 24px',
                width: 'min(480px, 100%)', boxSizing: 'border-box', fontFamily: 'sans-serif' });

    const h = document.createElement('div');
    h.textContent = T('blockblast.fbTitle');
    css(h, { color: '#fff', fontWeight: '700', fontSize: '16px', marginBottom: '12px', textAlign: 'center' });
    card.appendChild(h);

    const row = document.createElement('div');
    css(row, { display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '12px' });
    CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.textContent = T('blockblast.fb_' + c);
      b.dataset.chip = c;
      css(b, { border: 'none', borderRadius: '999px', padding: '8px 16px', fontSize: '13px',
               background: c === chip ? '#8b5cf6' : 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer' });
      b.addEventListener('click', () => {
        chip = c;
        row.querySelectorAll('button').forEach(x =>
          x.style.background = x.dataset.chip === chip ? '#8b5cf6' : 'rgba(255,255,255,0.12)');
      });
      row.appendChild(b);
    });
    card.appendChild(row);

    const ta = document.createElement('textarea');
    ta.id = 'fb-text';
    ta.placeholder = T('blockblast.fbPh');
    css(ta, { width: '100%', minHeight: '84px', boxSizing: 'border-box', borderRadius: '12px',
              border: 'none', padding: '10px', fontSize: '14px', background: 'rgba(255,255,255,0.92)',
              color: '#222', resize: 'vertical' });
    card.appendChild(ta);

    const btns = document.createElement('div');
    css(btns, { display: 'flex', gap: '10px', marginTop: '14px' });
    const cancel = document.createElement('button');
    cancel.textContent = T('blockblast.fbCancel');
    css(cancel, { flex: '1', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px',
                  background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' });
    cancel.addEventListener('click', hide);
    const send = document.createElement('button');
    send.textContent = T('blockblast.fbSend');
    css(send, { flex: '2', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '14px',
                fontWeight: '700', background: '#22c55e', color: '#fff', cursor: 'pointer' });
    send.addEventListener('click', () => {
      const note = ta.value.trim();
      const text = '[' + chip + '] ' + (note || '(no text)');   // hub 只显示 text ⇒ 关键信息进 text
      const payload = { app: 'cubeblast', text, context: context() };
      post(payload).catch(() => enqueue(payload));
      ta.value = '';
      hide();
      if (root.FX && root.Render) {
        FX.toast(T('blockblast.fbThanks'), Render.L.cx, GameGlobal.SH * 0.4, '#7ef2a0', 'bold 15px sans-serif', 1.2);
        if (typeof root.renderAll === 'function') root.renderAll();
      }
    });
    btns.appendChild(cancel);
    btns.appendChild(send);
    card.appendChild(btns);
    ov.appendChild(card);
    document.body.appendChild(ov);
  }

  function open() {
    if (!ov) build();
    else {
      // 语言可能切换过：重建最省事（表单极轻）
      ov.remove(); ov = null; build();
    }
    ov.style.display = 'flex';
  }
  function hide() { if (ov) ov.style.display = 'none'; }

  root.FB = { open, flush };
})(typeof self !== 'undefined' ? self : this);
