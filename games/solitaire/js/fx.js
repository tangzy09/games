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

  /** 把拖尾层合成到主 canvas（render 每帧调一次）*/
  function draw(ctx) {
    if (!trail) return;
    const { SW, SH } = GameGlobal;
    ctx.drawImage(trail, 0, 0, SW, SH);
  }

  const busy = () => running;
  function skip() { running = false; flying.length = 0; }
  function reset() {
    running = false; flying.length = 0;
    if (tctx) tctx.clearRect(0, 0, GameGlobal.SW, GameGlobal.SH);
  }

  root.FX = { startCascade, update, draw, busy, skip, reset };
})(typeof self !== 'undefined' ? self : this);
