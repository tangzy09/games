// games/snake/js/main.js — 引擎 boot 契约 + 游戏主循环
// 注:G 用 var(非 const/let)——顶层 const/let 不会挂到 window 上,
// 而 E2E/调试都要能从 window.G 读状态,实测验证过(见 render.js 提交同批 E2E)。
var G = {
  phase: 'LOADING',        // LOADING | READY | PLAYING | PAUSED | DEAD | LEVEL_DONE
  run: null, cyc: null, aiMem: null,
  ai: false,
  img: null, imgList: [], imgPos: 0,
  imgFull: false,          // LEVEL_DONE 时点图全屏欣赏中
  save: null, tracker: null, saveKey: null,   // P2b:存档 + 单局成就 tracker

  seed: (Date.now() % 2147483647),
};
const loopState = { last: 0, acc: 0 };

function dispatch(action) {
  switch (action) {
    case 'START':  if (G.phase === 'READY') { G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'PAUSE':  if (G.phase === 'PLAYING') G.phase = 'PAUSED'; break;
    case 'RESUME': if (G.phase === 'PAUSED') { G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'AI_TOGGLE':
      G.ai = !G.ai; G.aiMem = AI.createMem();
      // AI 局标记粘性:本关一旦开过 AI,单局成就/纪录整关不判(设计 §4,防「AI 打完人工收尾」刷成就)
      if (G.ai && G.tracker) G.tracker.aiRun = true;
      persist();
      break;
    case 'RESPAWN': {
      const rb = G.run.revealedCount;          // 重生落点揭格发生在 tick 外,单独入账
      Core.respawn(G.run);
      if (G.save) G.save.stats.cellsRevealed += G.run.revealedCount - rb;
      syncRevealDiff();
      G.phase = 'PLAYING'; loopState.last = 0;
      persist();
      break;
    }
    case 'NEXT':
      // 防连点:先离开 LEVEL_DONE,二次点击时覆盖层不再渲染、hit 已不存在;
      // frame 对 LOADING 天然安全(非 PLAYING 早退),nextLevel 完成时进 READY。
      if (G.phase === 'LEVEL_DONE') { G.imgFull = false; G.phase = 'LOADING'; nextLevel(); }
      break;
    case 'SHARE':
      if (G.phase === 'LEVEL_DONE')
        Gallery.shareCard(G.img, G.run.score, PAL, {
          title: 'Angel Snake',
          score: `${T('snake.score')} ${G.run.score}`,
          url: location.origin + location.pathname,
        });
      break;
    case 'IMG_FULL':  if (G.phase === 'LEVEL_DONE') G.imgFull = true; break;
    case 'IMG_CLOSE': G.imgFull = false; break;
    default: break;
  }
  renderAll();
}

function speed() {   // 格/秒:基础7随长缓升封顶12;慢慢云 ×0.7;小恶魔 ×1.5(待校准)
  const now = G.nowMs || 0, fx = G.run.effects;
  let m = 1;
  if (now < fx.slowUntil) m *= 0.7;
  if (now < fx.demonUntil) m *= 1.5;
  return Math.min(12, 7 + 0.03 * G.run.snake.length) * m;
}

function loadImage() {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { G.img = img; res(); };
    img.onerror = () => { G.img = null; res(); };   // 缺图也能玩
    img.src = 'assets/angels/' + G.imgList[G.imgPos % G.imgList.length];
  });
}
// 每关开局待机态:玩家看清盘面再动手;AI 挂机时不停下等人,直接开跑。
// RESPAWN 不走这里——死亡重生是玩家主动点的按钮,已有准备,直接 PLAYING。
// resumed=true:reload 续玩恢复——重建 tracker 但不计新开局(否则反复刷新虚增 levelsStarted)
function enterReady(resumed) {
  G.phase = 'READY';
  loopState.last = 0;
  if (G.save) {
    if (!resumed) G.save.stats.levelsStarted++;
    G.tracker = Ach.newTracker(loopState.gameMs || 0, G.ai);
    persist();
  }
  if (G.ai) dispatch('START');
}

// 存档落盘:PLAYING/READY 时附带当局快照(续玩);不要每 tick 调——
// 调用点:enterReady/死亡/过关/AI_TOGGLE/RESPAWN/切后台(visibilitychange hidden)。
function persist() {
  if (!G.save || !G.saveKey) return;
  if (G.phase === 'PLAYING' || G.phase === 'READY')
    G.save.run = Storage.snapshotRun(G.run, G.imgPos, loopState.gameMs || 0);
  Storage.save(Platform.storage, G.saveKey, G.save);
}

// 成就墙浮层:双 tab(单局/累计),累计带族进度;打开时暂停
function openAchievements(tab) {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('achui.title');
  const tabs = document.getElementById('panel-tabs');
  tabs.innerHTML = `<button class="ptab" data-t="run" type="button">${T('achui.tabRun')}</button>
                    <button class="ptab" data-t="cum" type="button">${T('achui.tabCum')}</button>`;
  tabs.querySelectorAll('.ptab').forEach(b => {
    b.onclick = () => renderAchTab(b.dataset.t);
  });
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  renderAchTab(tab || 'run');
  if (G.phase === 'PLAYING') dispatch('PAUSE');       // 看成就时暂停
}
function renderAchTab(tab) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const body = document.getElementById('panel-body');
  const got = new Set(G.save.ach.unlocked);
  const defs = tab === 'run' ? Ach.RUN_ACHS : Ach.CUM_DEFS;
  body.innerHTML = defs.map(d => {
    const has = got.has(d.id);
    let pg = '';
    if (tab === 'cum') {
      const info = Ach.tierInfo(d.id);
      const cur = Math.min(Ach.getCounter(G.save, info.counter), info.threshold);
      // div 折算(time 族毫秒 → 小时),其余族 div=1 原样
      pg = T('achui.progress', { cur: Math.floor(cur / info.div), max: Math.round(info.threshold / info.div) });
    }
    return `<div class="ach-item${has ? ' got' : ''}">
      <span class="medal">🏅</span><span class="nm">${T('ach.' + d.id)}</span>
      <span class="pg">${pg}</span></div>`;
  }).join('');
}

// ——图鉴——
function openGallery() {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('gal.title');
  document.getElementById('panel-tabs').innerHTML = '';
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  renderGalSets();
  if (G.phase === 'PLAYING') dispatch('PAUSE');       // 看图鉴时暂停
}
// 一级视图:25 集列表(集名 + 解锁进度)
function renderGalSets() {
  const body = document.getElementById('panel-body');
  body.innerHTML = ((G.manifest && G.manifest.sets) || []).map((s, i) => {
    const pg = Gallery.setProgress(G.save, s);
    return `<div class="gal-set" data-i="${i}"><span>${T('gal.' + s.key)}</span>
      <span class="pg">${T('gal.progress', { cur: pg, max: s.images.length })}</span></div>`;
  }).join('');
  body.querySelectorAll('.gal-set').forEach(el => {
    el.onclick = () => renderGalSet(parseInt(el.dataset.i, 10));
  });
}
// 二级视图:集内 20 缩略图(未解锁灰剪影;已解锁点开 lightbox)
function renderGalSet(i) {
  const body = document.getElementById('panel-body');
  const set = G.manifest.sets[i];
  const got = new Set(G.save.gallery.unlocked);
  body.innerHTML = `<div class="gal-set" id="gal-back">${T('gal.back')}</div>
    <div class="gal-grid">` + set.images.map(f => {
      const un = got.has(f);
      return `<img loading="lazy" src="assets/angels/${f}"${un ? ` data-f="${f}"` : ' class="locked"'} alt="">`;
    }).join('') + `</div>`;
  document.getElementById('gal-back').onclick = () => renderGalSets();
  body.querySelectorAll('.gal-grid img[data-f]').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.f);
  });
}
function openLightbox(file) {
  const lb = document.getElementById('lightbox');
  lb.innerHTML = `<img src="assets/angels/${file}" alt="">
    <button id="lb-replay" type="button">${T('gal.replay')}</button>`;
  lb.classList.remove('hidden');
  lb.onclick = e => { if (e.target === lb || e.target.tagName === 'IMG') lb.classList.add('hidden'); };
  document.getElementById('lb-replay').onclick = () => {
    lb.classList.add('hidden');
    document.getElementById('panel').classList.add('hidden');
    replayImage(file);
  };
}
// 重温:跳到该图开局。保留蛇长与分数(与过关换图行为一致),只重开遮罩。
function replayImage(file) {
  const idx = G.imgList.indexOf(file);
  if (idx < 0) return;
  G.imgPos = idx;
  G.imgFull = false;
  G.phase = 'LOADING';
  loadImage().then(() => {
    if (G.run.dead) Core.respawn(G.run);   // 死亡态重温:先重生,否则 step 恒早退卡死
    Core.resetBoard(G.run);
    if (G.save) G.save.stats.cellsRevealed += G.run.revealedCount;   // 新盘开局蛇身格(tick 外)入账
    initLayers(G.img);
    enterReady();
  });
}

// ——皮肤——
// 应用主题:调色板 + body 背景;切肤后由调用方 initLayers 重建遮罩纹理
function applyTheme(key) {
  if (!THEMES[key]) key = 'cloud';
  G.save.settings.theme = key;
  applyThemePal(key);
  document.body.style.background = PAL.bg;
}
// 皮肤卡点击路径(E2E 直接调):已解锁才生效,返回是否切换成功
function applyThemeFromUI(key) {
  if (!Themes.themeUnlocked(key, G.save)) return false;
  applyTheme(key);
  initLayers(G.img);
  persist();
  renderAll();
  if (document.querySelector('.skin-card')) renderSkinsBody();   // 面板开着就刷新选中态
  return true;
}
function openSkins() {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('skins.title');
  document.getElementById('panel-tabs').innerHTML = '';
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  renderSkinsBody();
  if (G.phase === 'PLAYING') dispatch('PAUSE');
}
function renderSkinsBody() {
  const body = document.getElementById('panel-body');
  if (!body) return;
  const cur = G.save.settings.theme || 'cloud';
  body.innerHTML = Themes.THEME_ORDER.map(k => {
    const t = Themes.THEMES[k];
    const un = Themes.themeUnlocked(k, G.save);
    const sw = ['bg', 'cloud', 'snake', 'accent', 'accent2']
      .map(c => `<i style="background:${t.pal[c]}"></i>`).join('');
    let tip = '';
    if (!un) tip = t.unlock.stat === 'setsDone' ? T('skins.needSet') : T('skins.needLevels', { n: t.unlock.n });
    else if (k === cur) tip = '✓';
    return `<div class="skin-card${k === cur ? ' on' : ''}${un ? '' : ' locked'}" data-k="${k}">
      <span class="skin-sw">${sw}</span><span class="skin-nm">${T('skins.' + k)}</span>
      <span class="skin-tip">${tip}</span></div>`;
  }).join('');
  body.querySelectorAll('.skin-card:not(.locked)').forEach(el => {
    el.onclick = () => applyThemeFromUI(el.dataset.k);
  });
}

// 解锁 toast:一次最多叠 3 条,2.6s 后淡出
function showAchToasts(ids) {
  const host = document.getElementById('toasts');
  if (!host) return;
  for (const id of ids.slice(0, 3)) {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.textContent = `🏅 ${T('achui.unlocked')} ${T('ach.' + id)}`;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
  }
}

async function nextLevel() {
  G.imgPos++;
  await loadImage();
  initLayers(G.img);
  enterReady();
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (G.phase !== 'PLAYING') { loopState.last = ts; renderAll(); return; }
  if (!loopState.last) loopState.last = ts;
  loopState.acc += ts - loopState.last; loopState.last = ts;
  const interval = 1000 / speed();
  let guard = 0;
  while (loopState.acc >= interval && guard++ < 4 && G.phase === 'PLAYING') {
    loopState.acc -= interval;
    // 游戏时钟(非墙钟):只在实际推进的 tick 里累计——暂停/切后台时
    // demon/halo/cloud 等定时效果与连击 10s 窗口全部冻结,恢复后不吃亏。
    // 单调递增,boot/RESPAWN/START 后继续累计不重置。
    loopState.gameMs = (loopState.gameMs || 0) + interval;
    tick(loopState.gameMs, interval);
  }
  renderAll();
}

function tick(nowMs, interval) {
  G.nowMs = nowMs;
  const run = G.run;
  const before = { score: run.score, revealed: run.revealedCount };
  if (G.ai) Core.setDir(run, AI.nextMove(run, G.cyc, G.aiMem));
  Core.step(run, { nowMs, scoreScale: G.ai ? 0.5 : 1 });
  syncRevealDiff();
  // 事件驱动:音效与成就统一消费 run.events(取代散落 flag 判定)
  const ev = run.events || [];
  const scoreDelta = run.score - before.score;
  // 过关 tick 里 completeLevel 已把 revealedCount 重置并揭开新关的蛇身格:
  // 本 tick 实际揭开 =(揭满旧关的差)+(新关开局蛇身格)
  const revealDelta = run.levelJustDone
    ? run.cols * run.rows - before.revealed + run.revealedCount
    : run.revealedCount - before.revealed;
  if (ev.some(e => e.t === 'apple')) Sfx.play('eat');
  if (ev.some(e => e.t === 'special')) Sfx.play('special');
  if (ev.some(e => e.t === 'shield')) { Sfx.play('shield'); Haptics.light(); }
  const milestonePlayed = ev.some(e => e.t === 'milestone') && !run.levelJustDone;
  if (milestonePlayed) Sfx.play('milestone');
  const aiRun = G.ai || !!(G.tracker && G.tracker.aiRun);   // 粘性:本关开过 AI 即整关按 AI 局算
  G.tracker.scoreGained += scoreDelta;   // onStep 不处理 scoreGained(签名无 ctx),接线方负责
  Ach.onStep(G.tracker, run, ev, nowMs);
  Ach.accumulate(G.save, run, ev, { aiRun, scoreDelta, revealDelta, dtMs: interval });
  let newly = [];
  if (run.levelJustDone) {
    // 皮肤通关计数 + 图鉴解锁/集齐检测(sk_*/set_* 成就)——放 checkCum 之前当场触发
    const th = G.save.settings.theme || 'cloud';
    G.save.stats.skinClears[th] = (G.save.stats.skinClears[th] || 0) + 1;
    Gallery.recordUnlock(G.save, G.imgList[G.imgPos % G.imgList.length]);
    Gallery.updateSetsDone(G.save, G.manifest);
    const r1 = Ach.onLevelClear(G.tracker, G.save, nowMs, { aiRun });
    newly = r1.unlocked;
  }
  newly = newly.concat(Ach.checkCum(G.save).unlocked);
  if (newly.length) { showAchToasts(newly); if (!milestonePlayed) Sfx.play('milestone'); }   // 本 tick 播过就不双播
  if (run.levelJustDone) {
    Sfx.play('level'); G.phase = 'LEVEL_DONE'; revealAllMask();
    G.save.run = null; persist(); return;
  }
  if (run.dead) { Sfx.play('death'); Haptics.medium(); G.phase = 'DEAD'; persist(); }
}

async function boot() {
  try {
    await Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), CFG.key('save')]);
    restoreAudioPrefs();
    G.saveKey = CFG.key('save');
    G.save = Storage.load(Platform.storage, G.saveKey);
    applyTheme(G.save.settings.theme);   // 主题不合法自动回 cloud
    Portal.boot();
    await Ads.init();
    let langBooted = false;
    I18N.onChange(() => {
      Controls.render(); renderAll();
      if (!langBooted) { langBooted = true; return; }   // boot 的 setLang 也走 onChange,不算「切换」
      if (G.save && !G.save.stats.langSwitched) {       // 环游世界:玩家主动切过一次语言
        G.save.stats.langSwitched = 1;
        const u = Ach.checkCum(G.save).unlocked;
        if (u.length) showAchToasts(u);
        persist();
      }
    });
    await I18N.setLang(I18N.detect());
    initCanvas();
    const mf = await fetch('assets/angels/manifest.json').then(r => r.json());
    G.manifest = mf;
    G.imgList = mf.images;
    let resumed = false;
    if (G.save.run) {                       // 有当局快照 → 恢复续玩
      try {
        const r = Storage.restoreRun(G.save.run);
        G.run = r.state; G.imgPos = r.imgPos;
        loopState.gameMs = r.gameMs || 0;
        resumed = true;
      } catch (e) { console.error('restore failed', e); G.run = null; }
    }
    if (!G.run) {
      G.run = Core.createGame({ seed: G.seed });
      G.save.stats.cellsRevealed += G.run.revealedCount;   // 出生格揭开发生在 tick 外(续玩局上一场已入账,不重复)
    }
    G.cyc = AI.buildCycle(G.run.cols, G.run.rows);
    G.aiMem = AI.createMem();
    await loadImage();
    initLayers(G.img);
    Input.bind({
      liveSwipe: true,
      onAction: dispatch,
      // READY/PAUSED 时任何方向输入即开始/继续(不用点按钮),并立即应用该方向
      onSwipe: d => {
        // 浮层(成就墙/图鉴/皮肤)开着时方向键不许在背后偷偷 RESUME 开跑
        const panel = document.getElementById('panel');
        if (panel && !panel.classList.contains('hidden')) return;
        if (G.phase === 'READY') dispatch('START');
        else if (G.phase === 'PAUSED') dispatch('RESUME');
        if (!G.ai && G.phase === 'PLAYING') Core.setDir(G.run, d);
      },
      canSwipe: () => G.phase === 'PLAYING' || G.phase === 'READY' || G.phase === 'PAUSED',
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { persist(); dispatch('PAUSE'); }   // 暂停前先落盘(切后台可能被杀进程)
    });
    window.addEventListener('resize', () => { initCanvas(); if (G.run) initLayers(G.img); renderAll(); });
    Controls.render(
      `<div class="ctl-btn" id="ach-btn" title="${T('menu.achievements')}">🏅</div>
       <div class="ctl-btn" id="gal-btn" title="${T('menu.gallery')}">🖼️</div>
       <div class="ctl-btn" id="skin-btn" title="${T('menu.skins')}">🎨</div>
       <div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>`,
      bar => {
        const a = bar.querySelector('#ach-btn');
        if (a) a.onclick = () => openAchievements();
        const g = bar.querySelector('#gal-btn');
        if (g) g.onclick = () => openGallery();
        const s = bar.querySelector('#skin-btn');
        if (s) s.onclick = () => openSkins();
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
      });
    enterReady(resumed);
    requestAnimationFrame(frame);
  } catch (err) {
    // boot 任何异常(manifest fetch 失败等)不许静默白屏:能画就画到屏幕上
    console.error('snake boot failed:', err);
    if (typeof ctx !== 'undefined' && ctx) {
      ctx.fillStyle = '#7a5c72';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Load failed: ' + err.message,
        (GameGlobal.SW || window.innerWidth) / 2, (GameGlobal.SH || window.innerHeight) / 2);
    }
  }
}

boot();
