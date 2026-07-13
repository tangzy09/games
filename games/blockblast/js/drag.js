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

  const LIFT = 1.2;      // 拼块浮在指尖上方 1.2 格 —— 不做这个，移动端根本没法玩（手指盖住块）
  const GROW_DUR = 0.12; // 拾起放大用时（秒）

  const ease = t => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);   // easeOutCubic

  /** 每帧推进拾起放大 / 回弹动画（由 main 的主循环调用）*/
  function tick(G, dt) {
    if (G.drag && G.drag.grow < 1) G.drag.grow = Math.min(1, G.drag.grow + dt / GROW_DUR);
    if (G.fly) {
      G.fly.t += dt;
      if (G.fly.t >= G.fly.dur) G.fly = null;
    }
  }
  /** 有没有拖拽相关动画在跑（主循环据此决定是否继续重画）*/
  const busy = G => !!(G && (G.drag || G.fly));

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

      // 锚点 = 手指压住的那一格（DESIGN §5）。托盘块按实际大小画（scale 通常 = 1），
      // 用它自己的槽 rect 换算到局部格坐标。
      const L = Render.L;
      const rect = L.traySlots[slot];
      const size = rect.size;
      let dr = Math.floor((y - rect.y) / size), dc = Math.floor((x - rect.x) / size);
      dr = Math.max(0, Math.min(piece.h - 1, dr));
      dc = Math.max(0, Math.min(piece.wdt - 1, dc));   // 容差区按下时可能落在块外，夹回块内

      // 按在 bounding box 的空洞上（L/S/T 形常见）→ 取最近的实心格
      if (!piece.cells.some(([r, c]) => r === dr && c === dc)) {
        let best = null, bd = Infinity;
        for (const [r, c] of piece.cells) {
          const d = (r - dr) ** 2 + (c - dc) ** 2;
          if (d < bd) { bd = d; best = [r, c]; }
        }
        dr = best[0]; dc = best[1];
      }

      // grow: 0→1 的拾起放大进度（托盘尺寸 → 棋盘格尺寸）。瞬间跳变很生硬，用它做平滑过渡。
      G.drag = { slot, piece, px: x, py: y, anchorDR: dr, anchorDC: dc, target: null,
                 grow: 0, fromSize: size };
      G.fly = null;
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
      if (t && Core.canPlace(G.s.board, t.piece, t.r, t.c)) { hooks.onPlace(d.slot, t.r, t.c); return; }

      // 非法松手 → **飞回托盘**（150ms ease-out + 缩回原尺寸）。
      // 直接消失重画会让人以为"我的块没了"；看得见它飞回去，才知道这一步没放上。
      const L = Render.L, rect = L.traySlots[d.slot];
      const cur = d.fromSize + (L.cell - d.fromSize) * ease(d.grow);
      G.fly = {
        piece: d.piece, slot: d.slot,
        x0: d.px - d.anchorDC * cur - cur / 2, y0: d.py - d.anchorDR * cur - cur / 2 - L.cell * LIFT,
        x1: rect.x, y1: rect.y, s0: cur, s1: rect.size,
        t: 0, dur: 0.15,
      };
      Sound.invalid();
      hooks.onChange();
    }

    canvasEl.addEventListener('pointerdown', down);
    canvasEl.addEventListener('pointermove', move);
    canvasEl.addEventListener('pointerup', up);
    canvasEl.addEventListener('pointercancel', () => { const G = root.G; if (G) { G.drag = null; hooks.onChange(); } });
  }

  root.Drag = { bind, tick, busy, ease, LIFT };
})(typeof self !== 'undefined' ? self : this);
