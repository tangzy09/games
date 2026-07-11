// main.js — 引擎 boot 契约 + 相位机 + 交互分发(回合制,无 RAF 主循环)。
// 注:G 用 var(非 const)——顶层 const 不挂 window,E2E/调试要 window.G(snake 实测)。
var G = {
  phase: 'HOME',   // HOME | PLAYING | DEAD
  s: null,         // core 状态(Core.createGame 产出)
  anim: null,      // 动画时间线:{ steps:[...], i, elapsed } —— 非 null 时封锁输入
  noAnim: false,   // E2E 用:置 true 则跳过动画瞬间结算
};
var rafId = null;

function newGame() {
  // 种子用真随机起(非 core 内部;core 自身禁 Date.now,但外部起局可以)
  G.s = Core.createGame({ seed: (Date.now() % 2147483647) });
  G.anim = null;
  G.phase = 'PLAYING';
}

// 从事件流编排动画时间线。事件是按时间顺序 push 的,顺着走即可。
function buildAnim(events) {
  const steps = [];
  let prev = null;
  for (const ev of events) {
    if (ev.t === 'shoot') {
      // 弹药飞入:起始盘面 = 「弹药尚未落定」的盘 = 快照去掉该列末尾那一格
      const from = ev.board.map(col => col.slice());
      from[ev.c].pop();
      steps.push({ type: 'fly', dur: ANIM.fly, from, col: ev.c, v: ev.v,
                   toI: ev.board[ev.c].length - 1, sfx: 'shoot' });
      prev = ev.board;
    } else if (ev.t === 'round') {
      steps.push({ type: 'merge', dur: ANIM.merge, from: prev, to: ev.board,
                   merges: ev.merges, sfx: ev.n >= 2 ? 'chain' : 'merge' });
      prev = ev.board;
    } else if (ev.t === 'spawn') {
      steps.push({ type: 'spawn', dur: ANIM.spawn, from: prev, to: ev.board, sfx: 'spawn' });
      prev = ev.board;
    } else if (ev.t === 'death') {
      steps.push({ type: 'death', dur: ANIM.death, sfx: 'death' });
    }
  }
  return steps.length ? { steps, i: 0, elapsed: 0, last: 0 } : null;
}

function playStepSfx(step) {
  if (!step) return;
  if (step.sfx) Sfx.play(step.sfx);
  if (step.type === 'death') Haptics.medium();
}

// 绘制抛错绝不能永久封死输入:G.anim 非 null 时 dispatch 全拒,若 renderAll 抛异常把
// RAF 打断(rafId 那行执行不到),anim 永不清空 → 玩家点什么都没反应、零提示、静默卡死。
// 故绘制一律包 try/catch:出事留痕 + 强制解锁(宁可丢动画,不可丢游戏)。
function safeRender() {
  try { renderAll(); return true; }
  catch (err) {
    console.error('abyssshoot renderAll failed (强制解锁动画,避免永久封死输入):', err);
    G.anim = null; rafId = null;
    return false;
  }
}

// 单帧 delta 上限:切后台/卡顿时 RAF 暂停,恢复的第一帧 ts 是真实墙钟 → delta 暴涨 →
// 当前这一步会被整段跳过(画面跳切)。夹到 100ms,最坏情况只是慢放一点,不会跳帧。
const MAX_FRAME_DELTA = 100;

function frame(ts) {
  if (!G.anim) { rafId = null; return; }        // 空闲即停 RAF,不烧 CPU
  const a = G.anim;
  if (!a.last) a.last = ts;
  a.elapsed += Math.min(ts - a.last, MAX_FRAME_DELTA);
  a.last = ts;
  const step = a.steps[a.i];
  if (a.elapsed >= step.dur) {
    a.i++; a.elapsed = 0;
    if (a.i >= a.steps.length) { finishAnim(); return; }
    playStepSfx(a.steps[a.i]);
  }
  if (!safeRender()) { finishAnim(); return; }   // 绘制炸了:解锁并落到静态终局帧
  rafId = requestAnimationFrame(frame);
}

function finishAnim() {
  G.anim = null;                                 // 先解锁再绘制:哪怕绘制炸了,输入也已经放开
  rafId = null;
  if (G.s.dead) G.phase = 'DEAD';               // 动画播完才进死亡画面
  safeRender();
}

function startAnim(events) {
  // 「新最深的鱼」独立播一声(不占时间线,叠在合并音上)
  if (events.some(e => e.t === 'newMaxFish')) Sfx.play('newfish');
  const a = buildAnim(events);
  if (!a || G.noAnim) { finishAnim(); return; }
  G.anim = a;
  playStepSfx(a.steps[0]);
  if (!safeRender()) { finishAnim(); return; }   // 首帧就炸:别起 RAF,直接解锁落静态帧
  if (rafId == null) rafId = requestAnimationFrame(frame);
}

function dispatch(action, data) {
  if (G.anim) return;                            // 动画播放中,封锁一切输入(防连点错乱)
  switch (action) {
    case 'START':
    case 'RESTART':
      newGame();
      break;
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      Core.shoot(G.s, data.col);
      startAnim(G.s.events);                     // 内部会 renderAll / 起 RAF / 播完判死
      return;                                    // 不走下面的 renderAll(动画循环自己画)
    }
    default: break;
  }
  renderAll();
}

async function boot() {
  try {
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
    restoreAudioPrefs();
    Portal.boot();
    await Ads.init();
    I18N.onChange(() => { Controls.render(); renderAll(); });
    await I18N.setLang(I18N.detect());
    initCanvas();
    G.s = Core.createGame({ seed: 1 });   // HOME 期先建一个空盘供渲染
    G.phase = 'HOME';
    Input.bind({ onAction: dispatch });
    window.addEventListener('resize', () => { initCanvas(); renderAll(); });
    Controls.render();
    renderAll();
    try { Platform.Cap?.Plugins?.SplashScreen?.hide(); } catch (e) {}
  } catch (err) {
    // boot 异常不许静默白屏:能画就画到屏上
    console.error('abyssshoot boot failed:', err);
    if (typeof ctx !== 'undefined' && ctx) {
      ctx.fillStyle = '#cfe8f5';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Load failed: ' + err.message,
        (GameGlobal.SW || window.innerWidth) / 2, (GameGlobal.SH || window.innerHeight) / 2);
    }
  }
}

boot();
