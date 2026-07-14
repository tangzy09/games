// ════════════════════════════════════════
// fx.js — **纸牌瀑布**（产品的心脏，不是彩蛋 —— DESIGN §0.1/§3）。
//
// 玩家原话：9 岁那年赢牌时，「那些弹跳的牌感觉像**全场起立鼓掌**」。
// Vista 砍掉它引发十几年怨念。**这不是特效，这是玩家记了三十年的东西。**
//
// ⚠ 它与引擎契约正面冲突（DESIGN §3.1 ①）：
//   经典瀑布的美感来自**永不擦除的累积拖尾**，而引擎是 `renderAll()` **每帧全屏重画**。
//   若每帧重画全部历史轨迹：5-10 秒 × 60fps × 52 张牌 ⇒ 每帧几万个圆角矩形，低端安卓必挂。
//   ⇒ **正解：一层持久 trail canvas（永不清）+ 主 canvas 每帧只画运动中的牌。**
//      这是本作在引擎契约上打的一个洞，写在这里。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let trail = null, tctx = null;      // 持久拖尾层（永不清）
  const flying = [];                  // 正在飞的牌
  let running = false;

  const GRAVITY = 1400;               // px/s²
  const BOUNCE = 0.85;                // ⚠ 经典阻尼：0.85（弹得够久，但会停）
  const VX = 260;                     // 水平初速

  /** 建/重建拖尾层（尺寸变了要重建）*/
  function ensureTrail() {
    const { SW, SH } = GameGlobal;
    const dpr = window.devicePixelRatio || 1;
    if (trail && trail.width === Math.ceil(SW * dpr) && trail.height === Math.ceil(SH * dpr)) return;
    trail = document.createElement('canvas');
    trail.width = Math.ceil(SW * dpr);
    trail.height = Math.ceil(SH * dpr);
    tctx = trail.getContext('2d');
    tctx.scale(dpr, dpr);
  }

  /**
   * 开始瀑布。cards = [{ id, x, y }]（从 foundation 的位置弹出）
   * ⚠ 不需要玩家操作（点一下可跳过；设置里可关）
   */
  function startCascade(cards) {
    ensureTrail();
    tctx.clearRect(0, 0, GameGlobal.SW, GameGlobal.SH);
    flying.length = 0;
    running = true;

    // 从 foundation 一张张弹出（倒序：K 先飞）
    cards.forEach((c, i) => {
      flying.push({
        id: c.id, x: c.x, y: c.y,
        vx: (Math.random() < 0.5 ? -1 : 1) * (VX * (0.5 + Math.random())),
        vy: -(150 + Math.random() * 260),
        delay: i * 0.06,               // 一张接一张，像被"泼"出来
        t: 0, alive: true,
      });
    });
  }

  function update(dt) {
    updateSlides(dt);
    if (!running) return;
    const { SW, SH } = GameGlobal;
    const L = Layout.L;
    let anyAlive = false;

    for (const f of flying) {
      if (!f.alive) continue;
      f.t += dt;
      if (f.t < f.delay) { anyAlive = true; continue; }

      const px = f.x, py = f.y;
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // 落地反弹
      const floor = SH - L.cardH;
      if (f.y > floor) {
        f.y = floor;
        f.vy = -f.vy * BOUNCE;
        if (Math.abs(f.vy) < 60) { f.alive = false; continue; }   // 弹不动了
      }

      // ⭐ 把这一帧的牌**盖进拖尾层**（永不清）—— 这就是那条累积的彩虹轨迹
      const sp = Sprite.face(f.id);
      tctx.drawImage(sp, f.x, f.y, L.cardW, L.cardH);

      // 飞出屏幕两侧 ⇒ 收工
      if (f.x < -L.cardW * 2 || f.x > SW + L.cardW * 2) f.alive = false;
      else anyAlive = true;
    }

    if (!anyAlive) running = false;
  }

  // ══════════════════════════════════════
  // 滑牌（牌从源位置**滑**到目标位置，而不是瞬移）
  //
  // ⚠ 这不是可有可无的润色：**所有正经纸牌 app 的牌都是滑过去的**，
  //   瞬移是这个品类最明显的「廉价」信号之一，而 App Store 4.3 判的是
  //   「unique AND **high-quality** experience」。
  //
  // ⚠ 与纸牌瀑布**共存但互不干扰**：瀑布走持久拖尾层（trail canvas），
  //   滑牌只画在主 canvas 上，每帧重画。两者的 busy() 合并成一个。
  //
  // ⚠ 关键契约：**正在滑的牌，render 必须在目标位置跳过不画**（否则牌会同时出现在两处）。
  //   靠 FX.isFlying(id) 查询。
  // ══════════════════════════════════════
  const slides = [];                    // { ids:[], x0,y0, x1,y1, t, dur, delay }
  const slideIds = new Set();           // 正在滑的牌（render 要跳过它们）
  const SLIDE_DUR = 0.13;               // ⚠ 要**快**：纸牌玩家点得飞快，动画拖沓比没有更糟

  /** 缓动：快出慢入（牌被「甩」出去然后稳稳落下）*/
  const ease = t => 1 - Math.pow(1 - t, 3);

  /**
   * 让一叠牌从 (x0,y0) 滑到 (x1,y1)。
   * ids 是**整叠**（supermove 一次滑好几张，它们保持相对偏移）。
   */
  function slide(ids, x0, y0, x1, y1, delay) {
    if (!ids || !ids.length) return;
    if (Math.abs(x1 - x0) < 1 && Math.abs(y1 - y0) < 1) return;   // 没动就别演
    slides.push({ ids: ids.slice(), x0, y0, x1, y1, t: 0, dur: SLIDE_DUR, delay: delay || 0 });
    ids.forEach(id => slideIds.add(id));
  }

  const isFlying = id => slideIds.has(id);

  function updateSlides(dt) {
    for (let i = slides.length - 1; i >= 0; i--) {
      const s = slides[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.t += dt;
      if (s.t >= s.dur) {
        s.ids.forEach(id => slideIds.delete(id));
        slides.splice(i, 1);
      }
    }
  }

  function drawSlides(ctx) {
    const L = Layout.L;
    for (const s of slides) {
      if (s.delay > 0) continue;
      const k = ease(Math.min(1, s.t / s.dur));
      const x = s.x0 + (s.x1 - s.x0) * k;
      const y = s.y0 + (s.y1 - s.y0) * k;
      s.ids.forEach((id, j) => {
        ctx.drawImage(Sprite.face(id), x, y + j * L.upOff, L.cardW, L.cardH);
      });
    }
  }

  /** 把拖尾层合成到主 canvas + 画滑动中的牌（render 每帧调一次，**最后**调）*/
  function draw(ctx) {
    if (trail) {
      const { SW, SH } = GameGlobal;
      ctx.drawImage(trail, 0, 0, SW, SH);
    }
    drawSlides(ctx);
  }

  const busy = () => running || slides.length > 0;
  function skip() { running = false; flying.length = 0; }
  function reset() {
    running = false; flying.length = 0;
    slides.length = 0; slideIds.clear();
    if (tctx) tctx.clearRect(0, 0, GameGlobal.SW, GameGlobal.SH);
  }

  root.FX = { startCascade, update, draw, busy, skip, reset, slide, isFlying, updateSlides };
})(typeof self !== 'undefined' ? self : this);
