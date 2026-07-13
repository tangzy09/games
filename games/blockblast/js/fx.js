// ════════════════════════════════════════
// fx.js — 粒子 / 浮字 / 屏震 / 逐格扩散消失（DESIGN §8）。
// 这不是「锦上添花」：消行那 0.4 秒的手感就是这个品类的产品本体。
//
// 性能预算（DESIGN §8.1，写死，主力机型是低端安卓 WebView）：
//   · 粒子总数 ≤ MAX（超出直接丢弃，不排队）
//   · FX.enabled = false 可整体关闭，且**不影响 core 逻辑与测试**（fx 只读不写游戏状态）
// 时钟由 main 的 rAF 传入 dt，不用 Date.now()。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const MAX = 300;
  const parts = [];     // 粒子
  const toasts = [];    // 浮字
  const dying = [];     // 正在消失的格子（逐格延迟）
  let shakeT = 0, shakeMag = 0;

  const FX = {
    enabled: true,

    /** 碎片：从一个格子迸出 n 个同色碎片 */
    burst(x, y, color, n) {
      if (!FX.enabled) return;
      for (let i = 0; i < n && parts.length < MAX; i++) {
        const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 140;
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          life: 0.5 + Math.random() * 0.35, age: 0,
          size: 3 + Math.random() * 4, color,
        });
      }
    },

    /** 逐格延迟消失：扩散感 = "我引爆了它"（不是整行同时消失）*/
    killCell(x, y, size, color, delay) {
      if (!FX.enabled) return;
      dying.push({ x, y, size, color, delay, age: 0, dur: 0.18 });
    },

    toast(text, x, y, color, font, scale) {
      if (!FX.enabled) return;
      toasts.push({ text, x, y, color, font, age: 0, life: 0.9, scale: scale || 1 });
    },

    shake(mag) { if (FX.enabled) { shakeMag = Math.max(shakeMag, mag); shakeT = 0.28; } },

    /** 屏震偏移（render 在画之前 translate 一下）*/
    offset() {
      if (!FX.enabled || shakeT <= 0) return { x: 0, y: 0 };
      const k = shakeT / 0.28;
      return { x: (Math.random() - 0.5) * shakeMag * k, y: (Math.random() - 0.5) * shakeMag * k };
    },

    /** 有没有动画在跑（main 用它决定是否继续逐帧重画）*/
    busy() { return parts.length > 0 || toasts.length > 0 || dying.length > 0 || shakeT > 0; },

    /** 某个格子是不是正在「消失动画」中（render 用它决定还画不画那一格）*/
    isDying(x, y) {
      for (const d of dying) if (d.x === x && d.y === y) return true;
      return false;
    },

    update(dt) {
      if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt;   // 重力
      }
      for (let i = toasts.length - 1; i >= 0; i--) {
        const t = toasts[i];
        t.age += dt; t.y -= 34 * dt;
        if (t.age >= t.life) toasts.splice(i, 1);
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const d = dying[i];
        d.age += dt;
        if (d.age >= d.delay + d.dur) dying.splice(i, 1);
      }
    },

    draw(ctx) {
      if (!FX.enabled) return;
      // 正在消失的格子：延迟到点后缩小+淡出
      for (const d of dying) {
        const t = d.age - d.delay;
        if (t < 0) { // 还没轮到它：照常实心画（render 已跳过，这里补画）
          ctx.globalAlpha = 1;
          ctx.fillStyle = d.color;
          ctx.fillRect(d.x, d.y, d.size, d.size);
          continue;
        }
        const k = Math.min(t / d.dur, 1);
        const shrink = d.size * (1 - k) * 0.5;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x + shrink, d.y + shrink, d.size - shrink * 2, d.size - shrink * 2);
      }
      ctx.globalAlpha = 1;

      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      for (const t of toasts) {
        const k = t.age / t.life;
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : Math.max(0, 1 - (k - 0.15) / 0.85);
        const pop = k < 0.15 ? 0.7 + (k / 0.15) * 0.4 : 1.1 - k * 0.1;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.scale(pop * t.scale, pop * t.scale);
        ctx.font = t.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.strokeText(t.text, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    reset() { parts.length = 0; toasts.length = 0; dying.length = 0; shakeT = 0; shakeMag = 0; },
  };

  root.FX = FX;
})(typeof self !== 'undefined' ? self : this);
