// ════════════════════════════════════════
// input.js — 拖拽 **+ 点击移动（tap-to-move）**，两种都支持。
//
// ⭐ tap-to-move 不是可选项，是无障碍必需（DESIGN §7.5）：
//   这个品类 65+ 严重 over-index，**手抖 / 关节炎 / 帕金森的用户拖不准**。
//   不给点击移动，他们根本玩不了。
//
// ⚠ 与 engine Input 共存：牌区自己处理 pointer；engine 的 tap 判定要求位移 <10px，
//   所以拖拽不会误触发它。工具条走 engine 的 addHit/hitTest。
//
// tap vs drag 的仲裁（DESIGN §8.0）：位移 <10px 且时长 <250ms ⇒ 当作 tap。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const TAP_DIST = 10, TAP_MS = 250;

  function bind(canvasEl, hooks) {
    const pos = e => {
      const r = canvasEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let downAt = null, downPos = null, downHit = null;

    /** 命中了哪张牌？（返回 {p:'t'|'w', ti, idx}）*/
    function hitCard(x, y) {
      const h = hitTest(x, y);
      if (!h) return null;
      if (h.action === 'TAB') return { p: 't', ti: h.data.ti, idx: h.data.idx };
      if (h.action === 'WASTE') return { p: 'w' };
      return null;
    }

    function down(e) {
      const G = root.G;
      if (!G || G.s.won || FX.busy()) return;
      const { x, y } = pos(e);
      downPos = { x, y };
      downAt = Date.now();
      downHit = hitCard(x, y);
      if (!downHit) return;

      // 准备拖拽（但还不确定是 tap 还是 drag —— 等 move/up 仲裁）
      const s = G.s;
      if (downHit.p === 't') {
        const col = s.tableau[downHit.ti];
        if (!RulesK.isValidRun(s, downHit.ti, downHit.idx)) { downHit = null; return; }
        G.pending = {
          from: downHit.ti, idx: downHit.idx,
          cards: col.cards.slice(downHit.idx),
          x, y, ox: x - Layout.L.colX(downHit.ti), oy: 0,
        };
      } else if (downHit.p === 'w') {
        G.pending = { from: 'w', cards: [s.waste[s.waste.length - 1]], x, y, ox: Layout.L.cardW / 2, oy: 0 };
      }
      if (canvasEl.setPointerCapture && e.pointerId != null) {
        try { canvasEl.setPointerCapture(e.pointerId); } catch (err) {}
      }
    }

    function move(e) {
      const G = root.G;
      if (!G || !G.pending) return;
      const { x, y } = pos(e);
      const dist = Math.hypot(x - downPos.x, y - downPos.y);
      if (!G.drag && dist > TAP_DIST) {
        // 升格为拖拽
        G.drag = G.pending;
        G.sel = null;                          // 拖拽时取消 tap 选中
      }
      if (G.drag) {
        G.drag.x = x - G.drag.ox;
        G.drag.y = y - Layout.L.cardH * 0.4;   // 牌浮在指尖上方一点
        hooks.onChange();
      }
    }

    function up(e) {
      const G = root.G;
      if (!G) return;
      const { x, y } = pos(e);
      const dt = Date.now() - (downAt || 0);
      const dist = downPos ? Math.hypot(x - downPos.x, y - downPos.y) : 999;

      if (G.drag) {
        // ── 拖拽落子 ──
        const target = hitTest(x, y);
        hooks.onDrop(G.drag, target);
        G.drag = null;
        G.pending = null;
      } else if (dist < TAP_DIST && dt < TAP_MS) {
        // ── tap（点击移动 / 选中）──
        const h = hitTest(x, y);
        hooks.onTap(h, downHit);
        G.pending = null;
      } else {
        G.pending = null;
        hooks.onChange();
      }
      downHit = null; downPos = null;
    }

    canvasEl.addEventListener('pointerdown', down);
    canvasEl.addEventListener('pointermove', move);
    canvasEl.addEventListener('pointerup', up);
    canvasEl.addEventListener('pointercancel', () => {
      const G = root.G;
      if (G) { G.drag = null; G.pending = null; hooks.onChange(); }
    });
  }

  root.Input2 = { bind, TAP_DIST, TAP_MS };
})(typeof self !== 'undefined' ? self : this);
