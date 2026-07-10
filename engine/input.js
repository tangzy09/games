// ════════════════════════════════════════
// input.js — touch/mouse tap + swipe, keyboard arrows/WASD.
// Tap → hitTest → handlers.onAction(action, data)   (the game's dispatch)
// Swipe / arrow keys → handlers.onSwipe('left'|'right'|'up'|'down')
// handlers.canSwipe() gates swipes (e.g. only during PLAYING, no item mode armed).
// Games with no directional input just omit onSwipe.
// ════════════════════════════════════════
const Input = (() => {
  let H = {};

  function bind(handlers) {
    H = handlers || {};
    const cv = document.getElementById(CFG.canvasId);
    let sx = 0, sy = 0, st = 0;
    function start(x, y) { sx = x; sy = y; st = Date.now(); }
    function end(x, y) {
      const dx = x - sx, dy = y - sy, dist = Math.sqrt(dx * dx + dy * dy), dt = Date.now() - st;
      if (dist < 10 && dt < 500) {
        const hit = hitTest(x, y);
        if (hit && H.onAction) H.onAction(hit.action, hit.data);
        return;
      }
      if (!H.onSwipe) return;
      if (H.canSwipe && !H.canSwipe()) return;
      if (dist < 28) return;
      let dir;
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      H.onSwipe(dir);
    }
    cv.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; start(t.clientX, t.clientY); }, { passive: false });
    cv.addEventListener('touchend',   e => { e.preventDefault(); const t = e.changedTouches[0]; end(t.clientX, t.clientY); }, { passive: false });
    cv.addEventListener('mousedown', e => start(e.clientX, e.clientY));
    cv.addEventListener('mouseup',   e => end(e.clientX, e.clientY));

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
