// main.js — 引擎 boot 契约 + 相位机 + 交互分发(回合制,无 RAF 主循环)。
// 注:G 用 var(非 const)——顶层 const 不挂 window,E2E/调试要 window.G(snake 实测)。
var G = {
  phase: 'HOME',   // HOME | PLAYING | DEAD
  s: null,         // core 状态(Core.createGame 产出)
  anim: null,      // 动画时间线:{ steps:[...], i, elapsed } —— 非 null 时封锁输入
  noAnim: false,   // E2E 用:置 true 则跳过动画瞬间结算
  save: null,      // 存档(Storage.load 产出)
  saveKey: null,
  newRecord: false,   // 本局是否破了纪录(DEAD 画面用)
  tool: null,        // null | 'hammer' | 'swap'  —— 道具瞄准模式
  swapFirst: null,   // 交换列:已选的第一列
  undoSnap: null,    // 上一发之前的快照(撤销用)
  revives: 0,        // 本局已复活次数(每局限 MAX_REVIVES)
  adBusy: false,     // 广告播放中(防连点重复请求)
};
var rafId = null;

// 落盘。⚠ 只在「连锁结算完成的稳定盘」落——Core.shoot 返回时盘面已结算完毕,
// 动画只是视觉回放,不影响状态。绝不在动画中途落(否则续玩恢复成半截盘)。
function persist() {
  if (!G.save || !G.saveKey) return;
  G.save.run = (G.phase === 'PLAYING' && G.s && !G.s.dead) ? Storage.snapshotRun(G.s) : null;
  Storage.save(Platform.storage, G.saveKey, G.save);
}

// 每发之后:记图鉴 + 刷最高分
function afterShot() {
  if (!G.save) return;
  G.save.coins += Tools.coinsFor(G.s.events);      // 合并×1 + 连锁×5 + 梯顶游走×50
  Codex.record(G.save, G.s);
  G.save.stats.shots++;
  for (const e of G.s.events) {
    if (e.t === 'merge') G.save.stats.merges++;
    if (e.t === 'escape') G.save.stats.escapes++;
  }
  if (G.s.maxTile > G.save.best.maxTile) G.save.best.maxTile = G.s.maxTile;
  if (G.s.score > G.save.best.score) { G.save.best.score = G.s.score; G.newRecord = true; }
  persist();
}

// 图鉴浮层:17 档鱼,未解锁显示灰剪影 + ???;已解锁额外显示「见过 N 次」
// (count 来自 save.stats.fishSeenCount —— 真读出来用,别让它变成只写不读的死字段)
function openCodex() {
  const panel = document.getElementById('panel');
  const p = Codex.progress(G.save);
  document.getElementById('panel-title').textContent = T('codex.title');
  document.getElementById('panel-sub').textContent =
    T('codex.progress', { cur: p.seen, max: p.total }) + ' · ' + T('codex.hint');
  document.getElementById('panel-body').innerHTML = Codex.entries(G.save).map(e => `
    <div class="cx-item${e.seen ? '' : ' locked'}">
      <img src="assets/fish/${e.fish}.webp" alt="" loading="lazy">
      <div class="cx-name">${e.seen ? T('fish.' + e.fish) : T('codex.locked')}</div>
      <div class="cx-val">${e.seen ? Tiles.tierDisp(e.v) : '—'}</div>
      <div class="cx-count">${e.seen ? T('codex.seenCount', { n: e.count }) : ''}</div>
    </div>`).join('');
  document.getElementById('panel-close').onclick = () => panel.classList.add('hidden');
  panel.classList.remove('hidden');
}

function newGame() {
  // 种子用真随机起(非 core 内部;core 自身禁 Date.now,但外部起局可以)
  G.s = Core.createGame({ seed: (Date.now() % 2147483647) });
  G.anim = null;
  G.phase = 'PLAYING';
  G.newRecord = false;
  G.tool = null; G.swapFirst = null; G.undoSnap = null;
  G.revives = 0; G.adBusy = false;
  if (G.save) { G.save.stats.runs++; persist(); }
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
  if (G.s.dead) { G.phase = 'DEAD'; persist(); } // 动画播完才进死亡画面;persist 因 phase 非 PLAYING 会把 run 置 null
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

// 简易 toast(金币不够等提示):追加一个节点,2s 后淡出移除。
function toast(msg) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 1600);
}

// 道具用完:道具本身可能触发连锁 → 走同一套动画/结算
function afterToolUse() {
  G.undoSnap = null;                 // 道具改了盘面,旧的射击快照作废(否则撤销会回到错误状态)
  if (G.save) {
    G.save.coins += Tools.coinsFor(G.s.events);   // 道具触发的连锁照常给币
    Codex.record(G.save, G.s);
    if (G.s.maxTile > G.save.best.maxTile) G.save.best.maxTile = G.s.maxTile;
    if (G.s.score > G.save.best.score) { G.save.best.score = G.s.score; G.newRecord = true; }
    persist();
  }
  startAnim(G.s.events);
}

function dispatch(action, data) {
  if (G.anim) return;                            // 动画播放中,封锁一切输入(防连点错乱)
  switch (action) {
    case 'START':
    case 'RESTART': {
      const st = G.save && G.save.stats;
      // ⚠ 顺序:**先 newGame(同步),再放插屏**。
      // 不能反过来 —— `Ads.showInterstitial().finally(() => newGame())` 会把建新局推迟到微任务,
      // 于是 RESTART 之后紧跟的任何操作(玩家连点/脚本/E2E)都会打在**旧的死盘**上、静默失效。
      // 先建好新局、让广告盖在新盘之上,时序竞态就根本不存在。
      newGame();
      // 每 3 局一插屏。放在局间,不放死亡那一刻——别打断情绪。
      if (st && ++st.runsSinceAd >= 3) {
        st.runsSinceAd = 0;
        persist();
        Ads.showInterstitial().finally(() => renderAll());
        renderAll();
        return;
      }
      newGame();
      break;
    }
    // ☠️ 看广告复活
    case 'REVIVE': {
      if (G.phase !== 'DEAD' || G.adBusy) break;
      if (G.revives >= Tools.MAX_REVIVES) break;
      G.adBusy = true; renderAll();
      Ads.showRewarded().then(ok => {
        G.adBusy = false;
        if (!ok || G.phase !== 'DEAD') { renderAll(); return; }   // 没看完 = 不给奖励
        G.revives++;
        G.save.stats.revives++;
        Tools.revive(G.s, Tools.REVIVE_ROWS);
        G.phase = 'PLAYING';
        G.undoSnap = null;                    // 盘面变了,旧快照作废
        afterToolUse();                       // 复活可能触发连锁 → 走同一套动画/结算/落盘
      }).catch(() => { G.adBusy = false; renderAll(); });
      break;
    }
    // 🪙 看广告换金币
    case 'AD_COINS': {
      if (G.phase !== 'PLAYING' || G.anim || G.tool || G.adBusy) break;
      G.adBusy = true; renderAll();
      Ads.showRewarded().then(ok => {
        G.adBusy = false;
        if (ok) {
          G.save.coins += Tools.AD_COINS;
          G.save.stats.adCoins += Tools.AD_COINS;
          toast(T('ads.coins', { n: Tools.AD_COINS }));
          Sfx.play('newfish');
          persist();
        }
        renderAll();
      }).catch(() => { G.adBusy = false; renderAll(); });
      break;
    }
    case 'PRIVACY': Ads.showPrivacyOptions(); break;
    case 'SHOOT': {
      if (G.phase !== 'PLAYING' || !G.s || G.s.dead) break;
      if (G.tool) break;                            // 道具瞄准中,不许射击
      G.undoSnap = Tools.snapshot(G.s);             // 射击前快照(撤销用)
      Core.shoot(G.s, data.col);
      afterShot();                                // 图鉴/最高分/落盘(盘面此刻已是稳定态)
      startAnim(G.s.events);                     // 内部会 renderAll / 起 RAF / 播完判死
      return;                                    // 不走下面的 renderAll(动画循环自己画)
    }
    // 点道具按钮:进入瞄准模式(撤销是即时的,不用瞄准)
    case 'TOOL': {
      if (G.phase !== 'PLAYING' || G.anim) break;
      const k = data.k;
      if (G.save.coins < Tools.COST[k]) { toast(T('tools.needCoins')); break; }
      if (k === 'undo') {
        if (!G.undoSnap) break;                     // 还没射过,没得撤
        Tools.undo(G.s, G.undoSnap);
        G.undoSnap = null;                          // 单步撤销:用掉就没了
        G.save.coins -= Tools.COST.undo;
        Sfx.play('undo'); persist();
        break;
      }
      G.tool = (G.tool === k) ? null : k;           // 再点一次取消
      G.swapFirst = null;
      break;
    }
    // 瞄准模式下点格子/列
    case 'TOOL_CELL': {                             // 锤子:点一条鱼
      if (G.tool !== 'hammer') break;
      const r = Tools.hammer(G.s, data.c, data.i);
      if (!r.ok) break;
      G.save.coins -= Tools.COST.hammer;
      G.tool = null;
      afterToolUse();
      return;
    }
    case 'TOOL_COL': {                              // 交换:点两列
      if (G.tool !== 'swap') break;
      if (G.swapFirst == null) { G.swapFirst = data.col; break; }
      if (G.swapFirst === data.col) { G.swapFirst = null; break; }
      const r = Tools.swap(G.s, G.swapFirst, data.col);
      G.swapFirst = null;
      if (!r.ok) break;
      G.save.coins -= Tools.COST.swap;
      G.tool = null;
      afterToolUse();
      return;
    }
    case 'TOOL_CANCEL': G.tool = null; G.swapFirst = null; break;
    case 'CODEX': openCodex(); return;
    default: break;
  }
  renderAll();
}

async function boot() {
  try {
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('save')]);
    restoreAudioPrefs();
    Portal.boot();
    await Ads.init();
    I18N.onChange(() => { Controls.render(); renderAll(); });
    await I18N.setLang(I18N.detect());
    initCanvas();
    G.saveKey = CFG.key('save');
    G.save = Storage.load(Platform.storage, G.saveKey);
    // 有当局快照 → 恢复续玩;形状不对 restoreRun 会返回 null,直接丢弃回 HOME
    const restored = G.save.run ? Storage.restoreRun(G.save.run) : null;
    if (restored) { G.s = restored; G.phase = 'PLAYING'; }
    else { G.s = Core.createGame({ seed: 1 }); G.phase = 'HOME'; G.save.run = null; }
    Input.bind({ onAction: dispatch });
    window.addEventListener('resize', () => { initCanvas(); renderAll(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
    Controls.render(
      `<div class="ctl-btn" id="codex-btn" title="${T('codex.open')}">🐟</div>
       <div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>
       <div class="ctl-btn" id="priv-btn" title="${T('ads.privacy')}">🛡️</div>`,
      bar => {
        const c = bar.querySelector('#codex-btn');
        if (c) c.onclick = () => dispatch('CODEX', {});
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
        const pv = bar.querySelector('#priv-btn');
        if (pv) pv.onclick = () => dispatch('PRIVACY', {});
      });
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
