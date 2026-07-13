// ════════════════════════════════════════
// drag.js — 拖拽层（引擎缺口：engine/input.js 只有 tap/swipe，没有 drag&drop）。
// 本作是本仓第一个真拖拽游戏。**不动 engine/input.js**（会牵动 4 个线上游戏）；
// 第二个拖拽游戏出现时再抽取到 engine。
//
// 与 engine Input 的共存（DESIGN §5）：
//   · 棋盘/托盘区不 addHit() ⇒ engine 的 tap 在这些区域无区域可命中；
//   · engine 的 tap 判定要求位移 <10px，拖拽天然不会误触发。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const LIFT = 1.2;    // 拼块浮在指尖上方 1.2 格 —— 不做这个，移动端根本没法玩（手指盖住块）

  function bind(canvasEl, hooks) {
    const pos = e => {
      const r = canvasEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    function down(e) {
      const G = root.G;
      if (!G || G.s.over) return;
      const { x, y } = pos(e);
      const slot = Render.traySlotAt(x, y);
      if (slot < 0) return;
      const piece = Core.tray(G.s)[slot];
      if (!piece) return;

      // 锚点 = 手指压住的那一格（DESIGN §5）。托盘里的块是缩小画的，先换算到它的局部格坐标。
      const L = Render.L;
      const size = Math.round(L.cell * L.trayScale);
      const ctr = Render.traySlotCenter(slot);
      const ox = ctr.x - (piece.wdt * size) / 2, oy = ctr.y - (piece.h * size) / 2;
      let dr = Math.floor((y - oy) / size), dc = Math.floor((x - ox) / size);

      // 按在 bounding box 的空洞上（L/S/T 形常见）→ 取最近的实心格
      if (!piece.cells.some(([r, c]) => r === dr && c === dc)) {
        let best = null, bd = Infinity;
        for (const [r, c] of piece.cells) {
          const d = (r - dr) ** 2 + (c - dc) ** 2;
          if (d < bd) { bd = d; best = [r, c]; }
        }
        dr = best[0]; dc = best[1];
      }

      G.drag = { slot, piece, px: x, py: y, anchorDR: dr, anchorDC: dc, target: null };
      Sound.pick();
      updateTarget(G, x, y);
      if (canvasEl.setPointerCapture && e.pointerId != null) {
        try { canvasEl.setPointerCapture(e.pointerId); } catch (err) {}
      }
      hooks.onChange();
    }

    function updateTarget(G, x, y) {
      const L = Render.L, cell = L.cell;
      const d = G.drag;
      d.px = x; d.py = y;
      // 块左上角格的中心（含抬起偏移）→ 吸附到最近的棋盘格
      const topX = x - d.anchorDC * cell - cell / 2;
      const topY = y - d.anchorDR * cell - cell / 2 - cell * LIFT;
      const c = Math.round((topX - L.boardX) / cell);
      const r = Math.round((topY - L.boardY) / cell);
      d.target = (r >= 0 && c >= 0 && r < 8 && c < 8) ? { r, c, piece: d.piece } : null;
    }

    function move(e) {
      const G = root.G;
      if (!G || !G.drag) return;
      const { x, y } = pos(e);
      updateTarget(G, x, y);
      hooks.onChange();
    }

    function up(e) {
      const G = root.G;
      if (!G || !G.drag) return;
      const d = G.drag;
      const t = d.target;
      G.drag = null;
      if (t && Core.canPlace(G.s.board, t.piece, t.r, t.c)) hooks.onPlace(d.slot, t.r, t.c);
      else { Sound.invalid(); hooks.onChange(); }     // 非法：弹回托盘（下一帧它就画回去了）
    }

    canvasEl.addEventListener('pointerdown', down);
    canvasEl.addEventListener('pointermove', move);
    canvasEl.addEventListener('pointerup', up);
    canvasEl.addEventListener('pointercancel', () => { const G = root.G; if (G) { G.drag = null; hooks.onChange(); } });
  }

  root.Drag = { bind, LIFT };
})(typeof self !== 'undefined' ? self : this);
