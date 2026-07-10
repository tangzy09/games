// ════════════════════════════════════════
// input.js — touch/mouse tap + swipe + long-press, keyboard arrows/WASD.
// Tap → hitTest → handlers.onAction(action, data)   (the game's dispatch)
// Swipe / arrow keys → handlers.onSwipe('left'|'right'|'up'|'down')
// Long-press (450ms, <10px movement) or right-click → handlers.onLongPress(hit)
//   (fires with the same hitTest result; the release tap is suppressed)
// handlers.canSwipe() gates swipes. Omit any handler you don't need.
// ════════════════════════════════════════
const Input = (() => {
  let H = {};

  function bind(handlers) {
    H = handlers || {};
    const cv = document.getElementById(CFG.canvasId);
    let sx = 0, sy = 0, st = 0, movedLive = false, lpTimer = null, lpFired = false;
    function fireLongPress(x, y) {
      lpFired = true;
      const hit = hitTest(x, y);
      if (hit && H.onLongPress) H.onLongPress(hit.action, hit.data);
    }
    function start(x, y) {
      sx = x; sy = y; st = Date.now(); movedLive = false; lpFired = false;
      if (H.onLongPress) { clearTimeout(lpTimer); lpTimer = setTimeout(() => fireLongPress(x, y), 450); }
    }
    function end(x, y) {
      clearTimeout(lpTimer);
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
    cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: false });
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
    cv.addEventListener('mousedown', e => start(e.clientX, e.clientY));
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
