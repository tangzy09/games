// ════════════════════════════════════════
// input.js — touch/mouse tap + swipe + long-press, keyboard arrows/WASD.
// Tap → hitTest → handlers.onAction(action, data)   (the game's dispatch)
// Swipe / arrow keys → handlers.onSwipe('left'|'right'|'up'|'down')
// Long-press (450ms, <10px movement) or right-click → handlers.onLongPress(hit)
//   (fires with the same hitTest result; the release tap is suppressed)
// 按住预览三件套(opt-in):onHold(x,y) 按下 / onHoldMove(x,y) 按住移动 / onHoldEnd(x,y) 松手
//   —— 落子类玩法「按住预览、松手才落」用;与 onAction 是两套,详见 bind 里的注释。
// handlers.canSwipe() gates swipes. Omit any handler you don't need.
// ════════════════════════════════════════
const Input = (() => {
  let H = {};

  function bind(handlers) {
    H = handlers || {};
    const cv = document.getElementById(CFG.canvasId);
    let sx = 0, sy = 0, st = 0, movedLive = false, lpTimer = null, lpFired = false;
    // ⭐ onHold* 三件套(opt-in,「按住预览、松手才落」类玩法用):
    //   onHold(x, y)      按下(仅主键/手指;右键不发)
    //   onHoldMove(x, y)  按住移动,每次移动都发(不节流,游戏自己按列号去重)
    //   onHoldEnd(x, y)   松手
    // ⭐ 为什么必须新加而不是复用 onAction:onAction 只在 `dist<10 && dt<500` 的
    //   「快点」窗口里才发,而「按住预览、松手才落」按定义 dt 就是好几秒(玩家盯着
    //   盘面想两秒再松手是常态)⇒ 那一手会被 end() 静默丢掉;而且松手前根本没有
    //   任何「指针正悬在第 N 列」的信号,预览无从画起。这不是新功能的问题,是现
    //   契约对该品类本来就是坏的。
    // 坐标是 clientX/clientY 原样(与 hitTest 同一坐标系),游戏自己 hitTest。
    // 三件套与 onAction **并行**触发(快点一下两者都会发)⇒ opt-in 的游戏要在
    //   onHoldEnd 里自己判断落点、别和 onAction 的按钮分支重复处理。
    // ⛔ 不传这三个的游戏一行行为都不变(同 liveSwipe 的纪律):hold 恒 false ⇒
    //   holding 永远为 false ⇒ 新增的分支与监听器全部第一句就 return。
    const hold = !!(H.onHold || H.onHoldMove || H.onHoldEnd);
    let holding = false;
    function fireLongPress(x, y) {
      lpFired = true;
      const hit = hitTest(x, y);
      if (hit && H.onLongPress) H.onLongPress(hit.action, hit.data);
    }
    function start(x, y, primary) {
      sx = x; sy = y; st = Date.now(); movedLive = false; lpFired = false;
      if (H.onLongPress) { clearTimeout(lpTimer); lpTimer = setTimeout(() => fireLongPress(x, y), 450); }
      if (hold && primary) { holding = true; if (H.onHold) H.onHold(x, y); }
    }
    // 取消(指针离开画布 / 触摸被系统打断):照发 onHoldEnd,但坐标给 (-1, -1) ——
    // hitTest 必然落空 ⇒ 游戏清掉预览而不落子。
    function cancelHold() { if (!holding) return; holding = false; if (H.onHoldEnd) H.onHoldEnd(-1, -1); }
    function end(x, y) {
      clearTimeout(lpTimer);
      // ⚠ 松手必须在 lpFired 判断**之前**发 —— 否则按住超过 450ms 触发长按后,
      //   松手事件会被下面的 `if (lpFired) return` 吞掉,棋子永远落不下去。
      if (holding) { holding = false; if (H.onHoldEnd) H.onHoldEnd(x, y); if (!H.onAction) return; }
      if (lpFired) return; // long-press already handled; swallow the tap
      const dx = x - sx, dy = y - sy, dist = Math.sqrt(dx * dx + dy * dy), dt = Date.now() - st;
      if (dist < 10 && dt < 500 && !movedLive) {
        const hit = hitTest(x, y);
        if (hit && H.onAction) H.onAction(hit.action, hit.data);
        return;
      }
      if (!H.onSwipe) return;
      if (H.canSwipe && !H.canSwipe()) return;
      if (dist < 28 || movedLive) return;
      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      H.onSwipe(dir);
    }
    cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY, true); }, { passive: false });
    cv.addEventListener('touchend',   e => { e.preventDefault(); const t = e.changedTouches[0]; end(t.clientX, t.clientY); }, { passive: false });
    // liveSwipe(opt-in):touchmove 位移过阈值即转向并重锚,实时游戏用;
    // 不传 liveSwipe 的游戏(回合制)完全不受影响。
    cv.addEventListener('touchmove', e => {
      if (!H.liveSwipe || !H.onSwipe) return;
      if (H.canSwipe && !H.canSwipe()) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
      movedLive = true;
      H.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    cv.addEventListener('touchmove', e => { const t = e.touches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimeout(lpTimer); }, { passive: true });
    // onHoldMove:触摸与鼠标两条路(mousemove 此前根本没有监听)。holding 门控 ⇒
    // 没按下的鼠标划过画布不会发,不传三件套的游戏第一句就 return。
    cv.addEventListener('touchmove', e => { if (!holding || !H.onHoldMove) return; const t = e.touches[0]; if (t) H.onHoldMove(t.clientX, t.clientY); }, { passive: true });
    cv.addEventListener('mousemove', e => { if (!holding || !H.onHoldMove) return; H.onHoldMove(e.clientX, e.clientY); });
    cv.addEventListener('touchcancel', () => cancelHold());
    cv.addEventListener('mouseleave',  () => cancelHold());
    cv.addEventListener('mousedown', e => start(e.clientX, e.clientY, e.button === 0));
    cv.addEventListener('mouseup',   e => end(e.clientX, e.clientY));
    cv.addEventListener('contextmenu', e => { e.preventDefault(); clearTimeout(lpTimer); fireLongPress(e.clientX, e.clientY); });

    document.addEventListener('keydown', e => {
      if (!H.onSwipe) return;
      const dirs = { ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
                     a:'left', d:'right', w:'up', s:'down', A:'left', D:'right', W:'up', S:'down' };
      const dir = dirs[e.key];
      if (dir && (!H.canSwipe || H.canSwipe())) { e.preventDefault(); H.onSwipe(dir); }
    });
  }

  return { bind };
})();
