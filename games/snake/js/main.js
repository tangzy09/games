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
  revivesThisLevel: 0,                        // P3a:复活广告位,每局(每张图)限 2 次
  rescueUntil: 0,                             // P3a:AI 救场 10s(游戏时钟),期间 AI 代驾但仍算人工局

  seed: (Date.now() % 2147483647),
};
const loopState = { last: 0, acc: 0 };

function dispatch(action) {
  switch (action) {
    case 'START':  if (G.phase === 'READY') { hideHome(); G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'PAUSE':  if (G.phase === 'PLAYING') G.phase = 'PAUSED'; break;
    case 'RESUME': if (G.phase === 'PAUSED') { hideHome(); G.phase = 'PLAYING'; loopState.last = 0; } break;
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
    case 'REVIVE':
      // 看广告原地满状态复活,每局(每张图)限 2 次
      if (G.phase === 'DEAD' && G.revivesThisLevel < 2) {
        Ads.showRewarded().then(ok => {
          if (!ok || G.phase !== 'DEAD') return;
          G.revivesThisLevel++;
          Core.revive(G.run);
          G.save.stats.revives++;
          const u = Ach.checkCum(G.save).unlocked;      // rev_* 成就
          if (u.length) showAchToasts(u);
          persist();
          G.phase = 'PLAYING'; loopState.last = 0; renderAll();
        });
      }
      break;
    case 'RESCUE':
      // AI 救场 10s:看广告换短时代驾;不是 AI 局(全分、不碰 tracker.aiRun)
      if (G.phase === 'PLAYING' && !G.ai && !(G.nowMs < G.rescueUntil)) {
        Ads.showRewarded().then(ok => {
          if (ok && G.phase === 'PLAYING') {
            G.rescueUntil = G.nowMs + 10000;
            G.aiMem = AI.createMem();
            renderAll();
          }
        });
      }
      break;
    case 'NEXT':
      // 防连点:先离开 LEVEL_DONE,二次点击时覆盖层不再渲染、hit 已不存在;
      // frame 对 LOADING 天然安全(非 PLAYING 早退),nextLevel 完成时进 READY。
      if (G.phase === 'LEVEL_DONE') {
        G.imgFull = false; G.phase = 'LOADING';
        G.save.stats.levelsSinceAd = (G.save.stats.levelsSinceAd || 0) + 1;
        const wantAd = !G.ai && G.save.stats.levelsSinceAd >= 2;   // 每 2 关一插屏;AI 代打不弹(设计 §10)
        (wantAd ? Ads.showInterstitial().then(() => { G.save.stats.levelsSinceAd = 0; persist(); })
                : Promise.resolve()).finally(() => nextLevel());
      }
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
    case 'HOME': openHome(); break;   // 浮层角标返回主界面(主按钮按状态智能续继)
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
  G.revivesThisLevel = 0;
  loopState.last = 0;
  G.lastClearStars = 0;
  // 奖励关:每 10 张图一关(imgPos 末位=9),2× 分数。不改盘面尺寸 → AI 保证不受影响。
  G.bonusLevel = !!(G.imgList && G.imgList.length && (G.imgPos % 10 === 9));
  if (G.save) {
    if (!resumed) G.save.stats.levelsStarted++;
    G.tracker = Ach.newTracker(loopState.gameMs || 0, G.ai);
    persist();
  }
  if (G.bonusLevel && !resumed) showBonusBanner();
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
  const stars = (G.save.gallery.stars) || {};
  body.innerHTML = `<div class="gal-set" id="gal-back">${T('gal.back')}</div>
    <div class="gal-grid">` + set.images.map(f => {
      const un = got.has(f);
      const st = Math.max(0, Math.min(3, stars[f] || 0));   // 夹到 0-3,防篡改存档 repeat(负数) 崩溃
      const starRow = un ? `<span class="gal-stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>` : '';
      return `<div class="gal-cell"><img loading="lazy" src="assets/angels/${f}"${un ? ` data-f="${f}"` : ' class="locked"'} alt="">${starRow}</div>`;
    }).join('') + `</div>`;
  document.getElementById('gal-back').onclick = () => renderGalSets();
  body.querySelectorAll('.gal-grid img[data-f]').forEach(el => {
    el.onclick = () => openLightbox(el.dataset.f);
  });
}
function openLightbox(file) {
  const lb = document.getElementById('lightbox');
  lb.innerHTML = `<img src="assets/angels/${file}" alt="">
    <div class="lb-actions">
      <button id="lb-wall" type="button">${T('gal.wallpaper')}</button>
      <button id="lb-replay" type="button">${T('gal.replay')}</button>
    </div>`;
  lb.classList.remove('hidden');
  lb.onclick = e => { if (e.target === lb || e.target.tagName === 'IMG') lb.classList.add('hidden'); };
  document.getElementById('lb-wall').onclick = () => Gallery.saveWallpaper(file, PAL);
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

// ——主界面(启动/暂停 hub)——
// 纯 DOM 浮层,不动 phase 机(boot 后 phase 仍 READY,E2E 契约不变)。
// PLAYING 时打开会先暂停(与成就/图鉴一致);Play/继续按钮收起浮层。
const HERO_ANGEL = '0bep0x.webp';   // 主界面主视觉(= App 图标同一张,品牌一致)
function hideHome() { const h = document.getElementById('home'); if (h) h.classList.add('hidden'); }
// 减弱动态:未显式设置则跟随系统 prefers-reduced-motion;用户可在主界面切换(显式存档覆盖)
function computeReduceMotion() {
  const pref = G.save && G.save.settings ? G.save.settings.reduceMotion : null;
  if (pref != null) return !!pref;
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
}
function toggleMotion() {
  const next = !computeReduceMotion();
  G.save.settings.reduceMotion = next; G.reduceMotion = next; persist();
}
// 下一个待解锁皮肤 + 进度(null=全解锁)
function nextSkinHint() {
  for (const k of Themes.THEME_ORDER) {
    if (Themes.themeUnlocked(k, G.save)) continue;
    const u = Themes.THEMES[k].unlock;
    const cur = u.stat.split('.').reduce((o, kk) => (o || {})[kk], G.save.stats) || 0;
    return { name: T('skins.' + k), cur: Math.min(cur, u.n), need: u.n, bySet: u.stat === 'setsDone' };
  }
  return null;
}
// 主界面收集进度块:X/500 天使 + 进度条 + 下一皮肤里程碑
function homeProgressHTML() {
  const total = (G.imgList && G.imgList.length) || 500;
  const got = G.save.gallery.unlocked.length;
  const skin = nextSkinHint();
  const pct = Math.max(2, (got / total) * 100);
  return `<div class="home-prog">
    <div class="hp-top"><span>🖼️ ${T('home.collected', { n: got, total })}</span></div>
    <div class="hp-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    ${skin ? `<div class="hp-skin">🎨 ${T('home.nextSkin', { name: skin.name })} · ${skin.bySet ? T('skins.needSet') : skin.cur + '/' + skin.need}</div>` : ''}
  </div>`;
}
function openHome() {
  const home = document.getElementById('home');
  if (!home) return;
  if (G.phase === 'PLAYING') dispatch('PAUSE');       // 打开即暂停
  // 主按钮按当前状态智能续继(从任意状态回主界面再点都对):
  // 暂停→继续 / 死亡→重新出发 / 过关→下一张 / 待机→只收起(滑动开始)
  let playLabel = T('home.play'), playAct = null;
  if (G.phase === 'PAUSED') { playLabel = T('home.resume'); playAct = 'RESUME'; }
  else if (G.phase === 'DEAD') { playLabel = T('snake.respawn'); playAct = 'RESPAWN'; }
  else if (G.phase === 'LEVEL_DONE') { playLabel = T('snake.next'); playAct = 'NEXT'; }
  home.innerHTML =
    `<img class="home-hero" src="assets/angels/${HERO_ANGEL}" alt="">
     <div class="home-title">Angel Snake</div>
     <div class="home-tag">${T('home.tag')}</div>
     ${homeProgressHTML()}
     <button class="home-play" id="home-play" type="button">${playLabel}</button>
     <button class="home-daily${dailyClaimable() ? ' ready' : ''}" id="home-daily" type="button">
       🎁 ${dailyClaimable() ? T('daily.claim') : T('daily.streak', { n: (G.save.daily && G.save.daily.giftStreak) || 0 })}</button>
     <div class="home-menu">
       <button class="home-btn" id="home-ach" type="button"><span class="ico">🏅</span>${T('menu.achievements')}</button>
       <button class="home-btn" id="home-gal" type="button"><span class="ico">🖼️</span>${T('menu.gallery')}</button>
       <button class="home-btn" id="home-skin" type="button"><span class="ico">🎨</span>${T('menu.skins')}</button>
       <button class="home-btn" id="home-howto" type="button"><span class="ico">❓</span>${T('howto.title')}</button>
     </div>
     <div class="home-foot">
       <button id="home-lang" class="wide" type="button" title="${T('lang.toggle')}">🌐 ${I18N.NATIVE[I18N.lang] || I18N.lang}</button>
       <button id="home-sfx" type="button">${Sfx.on ? '🔊' : '🔇'}</button>
       <button id="home-motion" type="button" title="${T('home.motion')}">${G.reduceMotion ? '🍃' : '✨'}</button>
     </div>`;
  home.classList.remove('hidden');
  const $ = id => document.getElementById(id);
  $('home-play').onclick = () => { hideHome(); if (playAct) dispatch(playAct); };
  $('home-daily').onclick = () => claimDaily();
  $('home-ach').onclick = () => openAchievements();      // 面板 DOM 在 #home 之后,自动叠其上;关闭回到主界面
  $('home-gal').onclick = () => openGallery();
  $('home-skin').onclick = () => openSkins();
  $('home-howto').onclick = () => openHowTo();
  $('home-sfx').onclick = () => { $('home-sfx').textContent = Sfx.toggle() ? '🔊' : '🔇'; };
  $('home-motion').onclick = () => { toggleMotion(); $('home-motion').textContent = G.reduceMotion ? '🍃' : '✨'; };
  // 语言:主界面浮层盖住了顶栏的引擎语言下拉,这里补一个。10 语循环按钮太烂 → 弹菜单直选。
  $('home-lang').onclick = () => openLangMenu();
}
// 语言选择菜单(每项显示该语言 native 名;点选即切并重渲主界面)
function openLangMenu() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.innerHTML = `<div class="lang-card">` + I18N.SUPPORTED.map(l =>
    `<button class="lang-opt${l === I18N.lang ? ' on' : ''}" data-l="${l}" type="button">${I18N.NATIVE[l] || l}</button>`).join('') + `</div>`;
  lb.classList.remove('hidden');
  lb.onclick = e => { if (e.target === lb) lb.classList.add('hidden'); };
  lb.querySelectorAll('.lang-opt').forEach(b => b.onclick = () => {
    lb.classList.add('hidden');
    I18N.setLang(b.dataset.l).then(() => openHome());   // 切完重渲主界面(新语言)
  });
}

// ——玩法说明——(图文行,复用 #panel)
function openHowTo() {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('howto.title');
  document.getElementById('panel-tabs').innerHTML = '';
  const rows = [['👼', 'reveal'], ['🍎', 'apple'], ['✨', 'fruit'],
                ['🖼️', 'collect'], ['🤖', 'ai'], ['💥', 'avoid']];
  // 特殊果说明:用道具 sprite 当图标(= 游戏里实际长相)+ 效果一句话
  const fruitOrder = ['heart', 'halo', 'cloud', 'scissors', 'magnet', 'meteor', 'feather', 'trail', 'gold', 'twin', 'demon', 'gift'];
  document.getElementById('panel-body').innerHTML =
    rows.map(([ic, k]) => `<div class="howto-row"><span class="ico">${ic}</span><span class="tx">${T('howto.' + k)}</span></div>`).join('')
    + `<div class="howto-sub">✨ ${T('howto.fruitsTitle')}</div>`
    + fruitOrder.map(k => `<div class="howto-fruit"><img src="assets/items/${k}.png" alt=""><span class="tx">${T('fruitd.' + k)}</span></div>`).join('');
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  if (G.phase === 'PLAYING') dispatch('PAUSE');
}

// ——每日天使礼物——(每天领一张未解锁的天使直接进图鉴 + 连续天数;Date 在 UI 层允许)
function ymd(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailyClaimable() { return !!(G.save && G.save.daily && G.save.daily.lastGiftDay !== ymd(Date.now())); }
// 按日期稳定选一张未解锁天使(同一天多次点给同一张,防刷)
function dailyPickAngel() {
  const got = new Set(G.save.gallery.unlocked);
  const locked = (G.imgList || []).filter(f => !got.has(f));
  if (!locked.length) return null;
  const seed = [...ymd(Date.now())].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7);
  return locked[seed % locked.length];
}
function claimDaily() {
  if (!dailyClaimable()) { openHome(); return; }
  const d = G.save.daily, today = ymd(Date.now());
  // 相邻天 streak+1,断档回 1。用 Math.round 算日差:夏令时切换日是 23/25h,严格减 86400000ms
  // 会误判(与 achievements.onLevelClear 的 streak 处理对齐)。
  const prevMs = d.lastGiftDay ? new Date(d.lastGiftDay).getTime() : null;
  const adjacent = prevMs != null && Math.round((new Date(today).getTime() - prevMs) / 86400000) === 1;
  d.giftStreak = adjacent ? d.giftStreak + 1 : 1;
  d.lastGiftDay = today;
  const angel = dailyPickAngel();
  let newly = [];
  if (angel) {
    const setsBefore = G.save.stats.setsDone;
    Gallery.recordUnlock(G.save, angel);
    Gallery.updateSetsDone(G.save, G.manifest);
    G.save.stats.distinctImgs = G.save.gallery.unlocked.length;
    newly = Ach.checkCum(G.save).unlocked;
    if (G.save.stats.setsDone > setsBefore) setTimeout(showSetComplete, 400);   // 每日礼物也可能集齐
  }
  persist();
  Sfx.play('special'); Haptics.light();
  if (newly.length) showAchToasts(newly);
  showDailyGift(angel, d.giftStreak);
}
function showDailyGift(file, streak) {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const img = file ? `<img src="assets/angels/${file}" alt="">` : '';
  lb.innerHTML = `<div class="daily-card">
      <div class="daily-h">🎁 ${file ? T('daily.newAngel') : T('daily.allCollected')}</div>
      ${img}
      <div class="daily-streak">🔥 ${T('daily.streak', { n: streak })}</div>
      <button id="daily-ok" type="button">${T('daily.ok')}</button>
    </div>`;
  lb.classList.remove('hidden');
  lb.onclick = e => { if (e.target === lb) lb.classList.add('hidden'); };
  const ok = document.getElementById('daily-ok');
  if (ok) ok.onclick = () => {
    lb.classList.add('hidden');
    const home = document.getElementById('home');
    if (home && !home.classList.contains('hidden')) openHome();   // 刷新主界面的礼物按钮状态
  };
}

// 奖励关横幅(开局提示 2× 分)
function showBonusBanner() {
  const host = document.getElementById('toasts');
  if (!host) return;
  Sfx.play('milestone');
  const el = document.createElement('div');
  el.className = 'bonus-banner';
  el.textContent = '⭐ ' + T('bonus.banner');
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 2400);
}

// 集齐一个 20 张主题集:居中大横幅庆祝(比成就 toast 更隆重)
function showSetComplete() {
  const host = document.getElementById('toasts');
  if (!host) return;
  Sfx.play('level'); Haptics.medium();
  const el = document.createElement('div');
  el.className = 'set-banner';
  el.innerHTML = `<span class="sb-emo">🎉</span><span>${T('set.complete')}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 2800);
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
  // 救场期间 AI 代驾,但不是 AI 局:全分、不碰 tracker.aiRun;交还瞬间不改方向(AI 最后设的 dir 自然延续)
  const rescue = nowMs < G.rescueUntil;
  // AI 代驾:先清人手残留的转向缓冲,再下 AI 指令(AI 的方向必须权威、当 tick 生效)
  if (G.ai || rescue) { run.dirQueue.length = 0; Core.setDir(run, AI.nextMove(run, G.cyc, G.aiMem)); }
  Core.step(run, { nowMs, scoreScale: (G.ai ? 0.5 : 1) * (G.bonusLevel ? 2 : 1) });   // 奖励关 2×
  syncRevealDiff();
  // 事件驱动:音效与成就统一消费 run.events(取代散落 flag 判定)
  const ev = run.events || [];
  const scoreDelta = run.score - before.score;
  // 过关 tick 里 completeLevel 已把 revealedCount 重置并揭开新关的蛇身格:
  // 本 tick 实际揭开 =(揭满旧关的差)+(新关开局蛇身格)
  const revealDelta = run.levelJustDone
    ? run.cols * run.rows - before.revealed + run.revealedCount
    : run.revealedCount - before.revealed;
  // 爽感 FX:事件都发生在蛇头,粒子/飘字落头格(render 层函数,墙钟计时)
  const h = run.snake[0];
  if (ev.some(e => e.t === 'apple')) {
    Sfx.play('eat');
    fxBurst(h.x, h.y, PAL.apple, 7);
    if (scoreDelta > 0) fxPop(h.x, h.y, '+' + scoreDelta, PAL.accent);
    if (run.combo >= 2) fxPop(h.x, h.y - 0.5, '×' + run.combo, PAL.accent2);   // 连击飘字
  }
  if (ev.some(e => e.t === 'special')) { Sfx.play('special'); fxBurst(h.x, h.y, PAL.glow, 12, 1.4); fxShake(3); Haptics.light(); }
  if (ev.some(e => e.t === 'shield')) { Sfx.play('shield'); Haptics.light(); fxBurst(h.x, h.y, '#ff8fab', 12, 1.3); fxShake(5); }
  if (ev.some(e => e.t === 'meteorCatch')) { fxBurst(h.x, h.y, PAL.glow, 16, 1.6); fxShake(6); Haptics.light(); }
  const milestonePlayed = ev.some(e => e.t === 'milestone') && !run.levelJustDone;
  if (milestonePlayed) { Sfx.play('milestone'); fxShake(4); Haptics.light(); }
  const aiRun = G.ai || !!(G.tracker && G.tracker.aiRun);   // 粘性:本关开过 AI 即整关按 AI 局算
  G.tracker.scoreGained += scoreDelta;   // onStep 不处理 scoreGained(签名无 ctx),接线方负责
  Ach.onStep(G.tracker, run, ev, nowMs);
  Ach.accumulate(G.save, run, ev, { aiRun, scoreDelta, revealDelta, dtMs: interval });
  let newly = [];
  if (run.levelJustDone) {
    // 皮肤通关计数 + 图鉴解锁/集齐检测(sk_*/set_* 成就)——放 checkCum 之前当场触发
    const th = G.save.settings.theme || 'cloud';
    G.save.stats.skinClears[th] = (G.save.stats.skinClears[th] || 0) + 1;
    const setsBefore = G.save.stats.setsDone;
    Gallery.recordUnlock(G.save, G.imgList[G.imgPos % G.imgList.length]);
    Gallery.updateSetsDone(G.save, G.manifest);
    if (G.save.stats.setsDone > setsBefore) showSetComplete();   // 新集齐 → 隆重庆祝
    G.save.stats.distinctImgs = G.save.gallery.unlocked.length;   // img 族数「不同图」,重温不虚增
    const r1 = Ach.onLevelClear(G.tracker, G.save, nowMs, { aiRun });
    newly = r1.unlocked;
    // 星级:★1 通关 + ★2 无死亡 + ★3 速通(<2min)或高连击(≥10);AI 局只给 1★(激励手动重玩)
    const t = G.tracker;
    const stars = aiRun ? 1
      : 1 + (t.deathsInLevel === 0 ? 1 : 0) + ((t.clearMs - t.startMs < 120000 || t.comboMax >= 10) ? 1 : 0);
    const cf = G.imgList[G.imgPos % G.imgList.length];
    G.save.gallery.stars[cf] = Math.max(G.save.gallery.stars[cf] || 0, stars);
    G.lastClearStars = stars;   // 结算浮层显示本次拿到几星
  }
  newly = newly.concat(Ach.checkCum(G.save).unlocked);
  if (newly.length) { showAchToasts(newly); if (!milestonePlayed) Sfx.play('milestone'); }   // 本 tick 播过就不双播
  if (run.levelJustDone) {
    Sfx.play('level'); Haptics.medium(); fxShake(6); fxCelebrate();   // 完成庆祝:流光+星光+回弹
    G.phase = 'LEVEL_DONE'; revealAllMask();
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
    G.reduceMotion = computeReduceMotion();   // 减弱动态:显式设置优先,否则跟随系统
    if (typeof preloadItems === 'function') preloadItems();   // 预载道具 sprite,防首次出现时 emoji 闪一下
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
    // 顶栏精简:🏠 主界面(成就/图鉴/皮肤/说明都收在里面)+ 🔊 音效
    Controls.render(
      `<div class="ctl-btn" id="home-btn" title="${T('home.title')}">🏠</div>
       <div class="ctl-btn" id="sfx-btn">${Sfx.on ? '🔊' : '🔇'}</div>`,
      bar => {
        const h = bar.querySelector('#home-btn');
        if (h) h.onclick = () => openHome();
        const b = bar.querySelector('#sfx-btn');
        if (b) b.onclick = () => { b.textContent = Sfx.toggle() ? '🔊' : '🔇'; };
      });
    enterReady(resumed);
    openHome();   // 启动即进主界面(天使主视觉 + 开始/成就/图鉴/皮肤/说明)
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
