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
  const rings = [];     // ⚡ 冲击波环（消行越多、环越多越大 —— 2026-08-04 用户点名「特效依次增加」）
  const beams = [];     // ⚡ 被消掉的整行/整列先闪一道光带（"是我打通了这条线"）
  let shakeT = 0, shakeMag = 0;
  let flashA = 0;       // ⚡ 全屏闪白（只有 PERFECT 全清才配用）

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
      // 排队防重叠：赞美词/SWEEP/成就/NEW BEST 会挤在同一时刻弹向棋盘中心附近，
      // 新 toast 与在场的太近就往下错一行（截图验收抓到过 "Heating Up" 压在标题底下）。
      let yy = y;
      for (let guard = 0; guard < 6; guard++) {
        // ⚠ 阈值要盖得住**最大那号字**：30 对 40px 的 PERFECT/SWEEP 根本不够,
        //   实拍到「DEEP SWEEP!」和「Unbelievable!」几乎完全重叠（特效变强后更挤）。
        const clash = toasts.some(t => Math.abs(t.y - yy) < 46 && Math.abs(t.x - x) < 220);
        if (!clash) break;
        yy += 34;
      }
      toasts.push({ text, x, y: yy, color, font, age: 0, life: 0.9, scale: scale || 1 });
    },

    shake(mag) { if (FX.enabled) { shakeMag = Math.max(shakeMag, mag); shakeT = 0.28; } },

    /**
     * ⚡ 冲击波环：从消除中心扩散的一圈光。
     * 这是「消 2 行 vs 消 5 行」在**视觉上分得开**的主力手段 —— 粒子多寡人眼其实不敏感，
     * 但「几个环、铺多大」一眼就看得出来。delay 让多个环依次荡开（不是同时画三个圈）。
     */
    ring(x, y, color, maxR, delay, width) {
      if (!FX.enabled) return;
      rings.push({ x, y, color, maxR, delay: delay || 0, width: width || 4, age: 0, dur: 0.42 });
    },

    /** ⚡ 整行/整列的光带：消除瞬间先亮一下，再让格子逐个碎掉 */
    beam(x, y, w, h, color) {
      if (!FX.enabled) return;
      beams.push({ x, y, w, h, color, age: 0, dur: 0.26 });
    },

    /** ⚡ 全屏闪白 —— ⛔ 只留给 PERFECT（全清）。到处用就不值钱了，而且晃眼 */
    flash(a) { if (FX.enabled) flashA = Math.max(flashA, a); },

    /** 屏震偏移（render 在画之前 translate 一下）*/
    offset() {
      if (!FX.enabled || shakeT <= 0) return { x: 0, y: 0 };
      const k = shakeT / 0.28;
      return { x: (Math.random() - 0.5) * shakeMag * k, y: (Math.random() - 0.5) * shakeMag * k };
    },

    /** 有没有动画在跑（main 用它决定是否继续逐帧重画）*/
    busy() {
      return parts.length > 0 || toasts.length > 0 || dying.length > 0 || shakeT > 0
          || rings.length > 0 || beams.length > 0 || flashA > 0;
    },

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
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.age += dt;
        if (r.age >= r.delay + r.dur) rings.splice(i, 1);
      }
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.age += dt;
        if (b.age >= b.dur) beams.splice(i, 1);
      }
      if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.6);
    },

    draw(ctx) {
      if (!FX.enabled) return;
      // 光带画在最底下：格子碎掉的过程压在它上面，观感才是「线被打通了」
      for (const b of beams) {
        const k = b.age / b.dur;
        ctx.globalAlpha = (1 - k) * 0.55;
        ctx.fillStyle = b.color;
        const grow = k * 6;
        ctx.fillRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2);
      }
      ctx.globalAlpha = 1;
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

      for (const r of rings) {
        const t = r.age - r.delay;
        if (t < 0) continue;
        const k = Math.min(t / r.dur, 1);
        const rad = r.maxR * (0.15 + k * 0.85);
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.75;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * (1 - k * 0.6);
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;

      if (flashA > 0) {
        ctx.globalAlpha = Math.min(flashA, 0.85);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, (root.GameGlobal && root.GameGlobal.SW) || 2000,
                           (root.GameGlobal && root.GameGlobal.SH) || 2000);
        ctx.globalAlpha = 1;
      }
    },

    reset() {
      parts.length = 0; toasts.length = 0; dying.length = 0;
      rings.length = 0; beams.length = 0; flashA = 0;
      shakeT = 0; shakeMag = 0;
    },
  };

  root.FX = FX;
})(typeof self !== 'undefined' ? self : this);
