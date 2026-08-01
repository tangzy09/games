// games/snake/js/main.js — 引擎 boot 契约 + 游戏主循环
// 注:G 用 var(非 const/let)——顶层 const/let 不会挂到 window 上,
// 而 E2E/调试都要能从 window.G 读状态,实测验证过(见 render.js 提交同批 E2E)。
var G = {
  phase: 'LOADING',        // LOADING | READY | PLAYING | PAUSED | DEAD | LEVEL_DONE
  run: null, cyc: null, aiMem: null,
  img: null, imgList: [], imgPos: 0,
  imgFull: false,          // LEVEL_DONE 时点图全屏欣赏中
  save: null, tracker: null, saveKey: null,   // P2b:存档 + 单局成就 tracker
  revivesThisLevel: 0,                        // P3a:复活广告位,每局(每张图)限 2 次
  aiOn: false, aiUsedThisLevel: false,        // AI 代打:免费开关(存 settings.aiOn);用过的关星级封顶 ★1

  seed: (Date.now() % 2147483647),
};
const loopState = { last: 0, acc: 0 };

function dispatch(action) {
  switch (action) {
    case 'START':  if (G.phase === 'READY') { hideHome(); G.phase = 'PLAYING'; loopState.last = 0; } break;
    case 'PAUSE':  if (G.phase === 'PLAYING') G.phase = 'PAUSED'; break;
    case 'RESUME': if (G.phase === 'PAUSED') { hideHome(); G.phase = 'PLAYING'; loopState.last = 0; } break;
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
      // 看广告原地满状态复活,每局(每张图)限 2 次。⭐ 奖励加厚:复活还附 2 层护盾 + 8s 光环无敌,
      //   让「复活」真的能救回局面,而不是复活两秒又撞死(那种体验比不给还差)。
      if (G.phase === 'DEAD' && G.revivesThisLevel < 2) {
        Ads.showRewarded().then(ok => {
          if (!ok || G.phase !== 'DEAD') return;
          G.revivesThisLevel++;
          Core.revive(G.run);
          G.run.effects.shield += 3;                                   // 护盾 ×3
          G.run.effects.ghostUntil = (G.nowMs || 0) + 10000;           // 10s 穿身无敌
          G.save.stats.revives++;
          const u = Ach.checkCum(G.save).unlocked;      // rev_* 成就
          if (u.length) showAchToasts(u);
          persist();
          G.phase = 'PLAYING'; loopState.last = 0; renderAll();
        });
      }
      break;
    case 'RESCUE':
      // ⭐ AI 代打:**完全免费、随时开关**(2026-08-01 用户定;旧版要看 30s 广告换代驾,已废)。
      //   ⛔ 核心体验不锁广告——这是 casual-game-meta §0 的红线,AI 属于「玩不动时的救济」。
      //   代价只有一个:用过 AI 的那一关**只给 ★1**(见 tick 的 aiUsedThisLevel),
      //   收集/解锁全部照给——不惩罚,只是把「满星」留给手动通关。
      dispatch('AI_TOGGLE');
      break;
    case 'AD_BOOST':
      // 🎁 开局礼包(新类别:局内增益):看广告 → 本关立刻获得 3 个随机特殊果效果。
      //   复用 core 的 applyFruit,不新增机制;⛔ 只给增益,不碰星级/成就/纪录。
      if ((G.phase === 'READY' || G.phase === 'PLAYING') && adQuotaLeft('boost') > 0) {
        Ads.showRewarded().then(ok => {
          if (!ok) return;
          adUse('boost');
          // ⛔ 池子不能是「全部果子」:scissors 开局蛇长才 3,减身是**空签**(看完广告什么也没得到);
          //    demon 提速 50% 对刚开局的人是负面;meteor/gift 是场上机制不是即时增益。
          //    奖励要丰厚 ⇒ 只发真增益,而且**四个不重样**(4 个同款远不如 4 种不同的爽)。
          const pool = BOOST_POOL.slice();
          const got = [];
          for (let i = 0; i < AD_REWARD.boost && pool.length; i++) {
            const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
            Core.applyFruit(G.run, t, G.nowMs || 0, {});
            got.push(Fruits.FRUITS[t].emoji);
          }
          showBoostToast(got);
          Sfx.play('special'); Haptics.medium();
          renderAll();
        });
      }
      break;
    case 'AD_GALLERY':
      // 📖 收集加速(图鉴页):看广告直接 +N 张天使。拒绝 ⇒ 什么也不发生(不扣额度、不给奖励)。
      if (adQuotaLeft('gal') > 0) {
        Ads.showRewarded().then(ok => {
          if (!ok) { renderGalSets(); return; }
          adUse('gal');
          grantAngels(AD_REWARD.gal);
          renderGalSets();
        });
      }
      break;
    case 'AD_DOUBLE':
      // ⭐ 过关结算「奖励翻倍」——赢局结算屏是全场转化最高的位置。每关限一次。
      if (G.phase === 'LEVEL_DONE' && !G.doubledThisLevel) {
        Ads.showRewarded().then(ok => {
          if (!ok) return;
          G.doubledThisLevel = true;
          const n = grantAngels(AD_REWARD.double);
          if (n) showBoostToast([`👼 ×${n}`]);
          renderAll();
        });
      }
      break;
    case 'AD_SKIN':
      // 🎨 皮肤解锁(新类别:外观)——看广告直接永久解锁一款未解锁皮肤
      if (adQuotaLeft('skin') > 0) {
        Ads.showRewarded().then(ok => {
          if (!ok) return;
          const next = Themes.THEME_ORDER.find(k => !Themes.themeUnlocked(k, G.save));
          if (!next) return;
          adUse('skin');
          if (!Array.isArray(G.save.skins)) G.save.skins = [];
          G.save.skins.push(next);
          persist();
          Sfx.play('special'); Haptics.medium();
          showBoostToast(['🎨 ' + T('skins.' + next)]);
          openSkins();
        });
      }
      break;
    case 'AD_QUEST':
      // 📋 任务加速(新类别:任务进度):看广告直接完成一个未完成的今日任务(含其奖励)
      if (adQuotaLeft('quest') > 0) {
        Ads.showRewarded().then(ok => {
          if (!ok) return;
          adUse('quest');
          const day = ymd(Date.now());
          const st = Quests.status(G.save, day);
          const i = st.findIndex(q => !q.done);
          if (i < 0) return;
          questBump(st[i].t, st[i].target);   // 一次喂满 ⇒ 走既有完成/发奖路径
          openQuests();
        });
      }
      break;
    case 'AI_TOGGLE':
      G.aiOn = !G.aiOn;
      if (G.save) { G.save.settings.aiOn = G.aiOn; persist(); }
      if (G.aiOn) G.aiMem = AI.createMem();
      renderAll();
      break;
    case 'NEXT':
      // 防连点:先离开 LEVEL_DONE,二次点击时覆盖层不再渲染、hit 已不存在;
      // frame 对 LOADING 天然安全(非 PLAYING 早退),nextLevel 完成时进 READY。
      if (G.phase === 'LEVEL_DONE') {
        G.imgFull = false; G.phase = 'LOADING';
        G.save.stats.levelsSinceAd = (G.save.stats.levelsSinceAd || 0) + 1;
        // 插屏总闸门（adgate.js，全仓统一）：前 50 关零插屏 → 之后每 10 关至多 1 个 + ≥2min。
        // ⚠ 只在这里（过关后点「下一张」的转场）问；死亡/局中永远不问。
        const wantAd = AdGate.canShow(G.save.stats, Date.now());
        (wantAd ? Ads.showInterstitial().then(() => { AdGate.noteShown(G.save.stats, Date.now()); persist(); })
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
  G.aiUsedThisLevel = false;      // 星级封顶标记不跨关(AI 开关本身跨关保持,是玩家的显式选择)
  G.doubledThisLevel = false;     // 结算「奖励翻倍」每关限一次
  // 奖励关:每 10 张图一关(imgPos 末位=9),2× 分数。不改盘面尺寸 → AI 保证不受影响。
  G.bonusLevel = !!(G.imgList && G.imgList.length && (G.imgPos % 10 === 9));
  if (G.save) {
    if (!resumed) G.save.stats.levelsStarted++;
    G.tracker = Ach.newTracker(loopState.gameMs || 0, false);
    persist();
  }
  if (G.bonusLevel && !resumed) showBonusBanner();
}

// 存档落盘:PLAYING/READY 时附带当局快照(续玩);不要每 tick 调——
// 调用点:enterReady/死亡/过关/RESPAWN/切后台(visibilitychange hidden)。
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
  const nGot = defs.filter(d => got.has(d.id)).length;
  // 顶部总进度:120 个成就里「我拿了几个」是这一页唯一真正想知道的数,原来得自己数
  // 头部标题用**页签名**(单局/累计),不用面板标题——否则和上方大标题一字不差地重复一遍
  const head = `<div class="ach-head">
    <div class="t"><span>🏅 ${T(tab === 'run' ? 'achui.tabRun' : 'achui.tabCum')}</span><b>${nGot}/${defs.length}</b></div>
    <div class="b"><i style="width:${((nGot / defs.length) * 100).toFixed(1)}%"></i></div></div>`;
  body.innerHTML = head + defs.map(d => {
    const has = got.has(d.id);
    let pg = '', bar = '';
    if (tab === 'cum') {
      const info = Ach.tierInfo(d.id);
      const cur = Math.min(Ach.getCounter(G.save, info.counter), info.threshold);
      // div 折算(time 族毫秒 → 小时),其余族 div=1 原样
      pg = T('achui.progress', { cur: Math.floor(cur / info.div), max: Math.round(info.threshold / info.div) });
      // 细进度条只给未解锁的:拿到了就该看金卡,不该再看进度
      // ⚠ 放在 .ach-item **外面**是刻意的——E2E 按 .ach-item 计数(必须恰好 100)
      if (!has) bar = `<div class="ach-pg"><i style="width:${((cur / info.threshold) * 100).toFixed(0)}%"></i></div>`;
    }
    return `<div class="ach-item${has ? ' got' : ''}">
      <span class="medal">🏅</span><span class="nm">${T('ach.' + d.id)}</span>
      <span class="pg">${pg}</span></div>${bar}`;
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
// 25 集的行:缩略图(该集第一张已解锁的图)+ 进度条 + 集齐转金。
// ⚠ 缩略图用该集**已解锁**的第一张——拿未解锁的图当封面等于提前剧透,收集感就没了。
// ⚠ loading=lazy + decoding=async:25 张 512² 全同步解码会在低端机上卡住开面板那一下。
function galSetRowsHTML() {
  const got = new Set(G.save.gallery.unlocked);
  return ((G.manifest && G.manifest.sets) || []).map((s, i) => {
    const pg = Gallery.setProgress(G.save, s);
    const full = pg >= s.images.length;
    const cover = s.images.find(f => got.has(f));
    const pct = Math.max(0, (pg / s.images.length) * 100);
    return `<div class="gal-set${full ? ' full' : ''}" data-i="${i}">
      ${cover
        ? `<img class="th" src="assets/angels/${cover}" loading="lazy" decoding="async" alt="">`
        : `<span class="th lock">🔒</span>`}
      <span class="mid">
        <span class="nm">${T('gal.' + s.key)}
          <span class="pg">${T('gal.progress', { cur: pg, max: s.images.length })}</span></span>
        <span class="gb"><i style="width:${pct.toFixed(0)}%"></i></span>
      </span></div>`;
  }).join('');
}
// 一级视图:25 集列表(缩略图 + 解锁进度)+ 顶部「看广告 +N 张」(自愿、纯增益)
function renderGalSets() {
  const body = document.getElementById('panel-body');
  const done = (G.save.gallery.unlocked.length >= ((G.imgList && G.imgList.length) || 500));
  const left = adQuotaLeft('gal');
  body.innerHTML =
    (done || !left ? '' : `<button class="gal-ad" id="gal-ad" type="button">📺 ${T('ads.gal3', { n: AD_REWARD.gal })}<small>${T('ads.left', { n: left })}</small></button>`) +
    galSetRowsHTML();
  const ad = document.getElementById('gal-ad');
  // ⭐ 收集加速位:全场意愿最高的激励视频(玩家正盯着自己的收集进度)。走统一 dispatch,冒烟可测。
  if (ad) ad.onclick = () => { ad.disabled = true; dispatch('AD_GALLERY'); };
  body.querySelectorAll('.gal-set').forEach(el => {
    el.onclick = () => renderGalSet(parseInt(el.dataset.i, 10));
  });
}

// ——激励视频额度(每日重置)——
// ⭐ 奖励给得厚 ⇒ 必须有额度,否则一天几十条广告就把 500 张图鉴刷穿、当天毕业(长线没了)。
//   额度本身也是设计:每天上限 = 25 张图鉴 + 3 次开局礼包 + 1 次任务加速,已经非常大方。
const AD_CAPS = { gal: 6, boost: 4, quest: 2, skin: 1 };
// 🎁 开局礼包的抽奖池:**只放开局就爽得到的增益**。排除 scissors(开局蛇长 3,减身=空签)、
// demon(提速对刚开局是负面)、meteor/gift(场上机制,不是即时增益)。
const BOOST_POOL = ['heart', 'halo', 'trail', 'magnet', 'feather', 'twin', 'gold', 'cloud'];
// 每次给多少：**奖励要一次见效**（+1 张没人看广告，+8 张才动手）
const AD_REWARD = { gal: 8, daily: 5, boost: 4, double: 3 };
function adQuotaLeft(kind) {
  if (!G.save) return 0;
  const a = G.save.ads, today = ymd(Date.now());
  // ⚠ 跨天重置必须**按 AD_CAPS 全量清**:漏掉哪个 key,那个位就永久卡在首日额度
  //   (skin 上限 1 ⇒ 玩家一辈子只能广告解锁一款皮肤)。加新位时这里零改动。
  if (a.day !== today) { a.day = today; for (const k of Object.keys(AD_CAPS)) a[k] = 0; }
  return Math.max(0, (AD_CAPS[kind] || 0) - (a[kind] || 0));
}
function adUse(kind) {
  const a = G.save.ads;
  a.day = ymd(Date.now());
  a[kind] = (a[kind] || 0) + 1;
  persist();
}

/** 直接解锁 n 张未解锁天使(每日礼物/任务/看广告共用的发放口) */
function grantAngels(n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const f = questPickAngel();
    if (!f) break;
    const setsBefore = G.save.stats.setsDone;
    Gallery.recordUnlock(G.save, f);
    Gallery.updateSetsDone(G.save, G.manifest);
    if (G.save.stats.setsDone > setsBefore) setTimeout(showSetComplete, 400);
    got++;
  }
  if (!got) return 0;
  G.save.stats.distinctImgs = G.save.gallery.unlocked.length;
  const newly = Ach.checkCum(G.save).unlocked;
  if (newly.length) showAchToasts(newly);
  Sfx.play('special'); Haptics.light();
  persist();
  return got;
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
// 皮肤缩略预览:五条色带看不出「换了皮肤盘面长什么样」,直接画一小块真盘面——
// 云层(含该主题的确定性纹理)+ 已揭开的洞 + 蛇 + 苹果,全部走主题自己的调色板。
// ⚠ 复用 themes.js 的 texture(m,px,pc) 契约(this=主题对象),别在这里重抄一份纹理。
function skinPreviewURL(key) {
  const t = Themes.THEMES[key], P = t.pal;
  const S = 132, C = 22;                                   // 画布边长 / 格宽 ⇒ 6×6 格
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  // 底 = 揭开后露出的**天使图**(不随主题变——主题只换云层/蛇/道具),用暖色渐变示意
  const gr = x.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, '#ffe3f0'); gr.addColorStop(0.5, '#fff0d8'); gr.addColorStop(1, '#e8ddff');
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.fillStyle = P.cloud; x.fillRect(0, 0, S, S);           // 云层盖住
  t.texture(x, S, C);                                      // 主题纹理(星点/糖纸格/羽毛…)
  // 揭开的通道(蛇走过的路):挖掉云层露出底图
  x.save();
  x.beginPath();
  [[1,3],[2,3],[3,3],[3,2],[4,2],[1,4],[2,4]].forEach(([cx, cy]) => x.rect(cx*C, cy*C, C, C));
  x.clip(); x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.restore();
  // 蛇身:圆头圆尾的连续管体(画成一条粗线,不是一串圆点——断开的圆点看着像别的东西)
  const seg = [[1,4],[2,4],[2,3],[3,3],[3,2]];
  x.strokeStyle = P.snake; x.lineWidth = C * 0.78;
  x.lineJoin = x.lineCap = 'round';
  x.beginPath();
  seg.forEach(([cx, cy], i) => x[i ? 'lineTo' : 'moveTo'](cx*C + C/2, cy*C + C/2));
  x.stroke();
  const [hx, hy] = seg[seg.length - 1];
  x.strokeStyle = P.glow; x.lineWidth = 2;
  x.beginPath(); x.ellipse(hx*C + C/2, hy*C + C*0.16, C*0.3, C*0.12, 0, 0, Math.PI*2); x.stroke();
  x.fillStyle = P.eye;
  x.beginPath(); x.arc(hx*C + C*0.62, hy*C + C*0.46, C*0.09, 0, Math.PI*2); x.fill();
  // 苹果(放在蛇头前方的已揭格里)
  x.fillStyle = P.apple;
  x.beginPath(); x.arc(4*C + C/2, 2*C + C/2, C*0.3, 0, Math.PI*2); x.fill();
  x.fillStyle = P.leaf;
  x.fillRect(4*C + C/2 - 1.5, 2*C + C*0.14, 3, C*0.16);
  return cv.toDataURL();
}
function renderSkinsBody() {
  const body = document.getElementById('panel-body');
  if (!body) return;
  const cur = G.save.settings.theme || 'cloud';
  // 🎨 皮肤解锁位:还有没解锁的皮肤 + 今日还有额度 ⇒ 顶部给一个激励视频按钮
  const locked = Themes.THEME_ORDER.find(k => !Themes.themeUnlocked(k, G.save));
  body.innerHTML = (locked && adQuotaLeft('skin') > 0
      ? `<button class="gal-ad" id="skin-ad" type="button">📺 ${T('ads.skin')}</button>` : '')
    + Themes.THEME_ORDER.map(k => {
    const t = Themes.THEMES[k];
    const un = Themes.themeUnlocked(k, G.save);
    let tip = '', prog = '';
    if (!un) {
      tip = t.unlock.stat === 'setsDone' ? T('skins.needSet') : T('skins.needLevels', { n: t.unlock.n });
      // 锁着的皮肤给进度条:「还差 2 关」比「需要 5 关」更拉得动人
      const cur2 = t.unlock.stat.split('.').reduce((o, kk) => (o || {})[kk], G.save.stats) || 0;
      prog = `<span class="skin-pg"><i style="width:${Math.min(100, (cur2 / t.unlock.n) * 100).toFixed(0)}%"></i></span>`;
    } else if (k === cur) tip = '✓';
    return `<div class="skin-card${k === cur ? ' on' : ''}${un ? '' : ' locked'}" data-k="${k}">
      <img class="skin-sw" src="${skinPreviewURL(k)}" alt="">
      <span class="skin-mid"><span class="skin-nm">${T('skins.' + k)}</span>${prog}</span>
      <span class="skin-tip">${tip}</span></div>`;
  }).join('');
  body.querySelectorAll('.skin-card:not(.locked)').forEach(el => {
    el.onclick = () => applyThemeFromUI(el.dataset.k);
  });
  const sad = document.getElementById('skin-ad');
  if (sad) sad.onclick = () => { sad.disabled = true; dispatch('AD_SKIN'); };
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
// 减弱动态要同时管住 **CSS 装饰动画**(极光/浮动/流光/入场):canvas 侧看 G.reduceMotion,
// DOM 侧看 body.rm —— 这个函数是两者唯一的同步点,任何改 reduceMotion 的地方都要调它。
function syncMotionClass() {
  if (document.body) document.body.classList.toggle('rm', !!G.reduceMotion);
}
function toggleMotion() {
  const next = !computeReduceMotion();
  G.save.settings.reduceMotion = next; G.reduceMotion = next; persist();
  syncMotionClass();
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
    <div class="hp-top"><span>🖼️ ${T('home.collected', { n: got, total })}</span>
      <span class="pct">${((got / total) * 100).toFixed(1)}%</span></div>
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
  // 菜单角标:每个入口都带一个「你在这儿有多少东西」的数字——空按钮不给人点进去的理由
  const qDone = questDoneCount();
  const achGot = G.save.ach.unlocked.length;
  const skinGot = Themes.THEME_ORDER.filter(k => Themes.themeUnlocked(k, G.save)).length;
  home.innerHTML =
    `<div class="hero-wrap"><img class="home-hero" src="assets/angels/${HERO_ANGEL}" alt=""></div>
     <div class="home-title">Angel Snake</div>
     <div class="home-tag">${T('home.tag')}</div>
     ${homeProgressHTML()}
     <button class="home-play" id="home-play" type="button">${playLabel}</button>
     <button class="home-daily${dailyClaimable() ? ' ready' : ''}" id="home-daily" type="button">
       🎁 ${dailyClaimable() ? T('daily.claim') : T('daily.streak', { n: (G.save.daily && G.save.daily.giftStreak) || 0 })}</button>
     <div class="home-menu">
       <button class="home-btn${qDone < 3 ? ' todo' : ''}" id="home-quests" type="button"><span class="ico">📋</span><span class="lb">${T('q.title')}</span><span class="bdg">${qDone}/3</span></button>
       <button class="home-btn" id="home-ach" type="button"><span class="ico">🏅</span><span class="lb">${T('menu.achievements')}</span><span class="bdg">${achGot}</span></button>
       <button class="home-btn" id="home-gal" type="button"><span class="ico">🖼️</span><span class="lb">${T('menu.gallery')}</span><span class="bdg">${G.save.gallery.unlocked.length}</span></button>
       <button class="home-btn" id="home-skin" type="button"><span class="ico">🎨</span><span class="lb">${T('menu.skins')}</span><span class="bdg">${skinGot}/${Themes.THEME_ORDER.length}</span></button>
       <button class="home-btn" id="home-stats" type="button"><span class="ico">📊</span><span class="lb">${T('stats.title')}</span></button>
       <button class="home-btn" id="home-howto" type="button"><span class="ico">❓</span><span class="lb">${T('howto.title')}</span></button>
     </div>
     <div class="home-foot">
       <button id="home-lang" class="wide" type="button" title="${T('lang.toggle')}">🌐 ${I18N.NATIVE[I18N.lang] || I18N.lang}</button>
       <button id="home-sfx" type="button">${Sfx.on ? '🔊' : '🔇'}</button>
       <button id="home-ai" type="button" title="${T('ai.start')}" class="${G.aiOn ? 'on' : ''}">${G.aiOn ? '🤖' : '🎮'}</button>
       <button id="home-motion" type="button" title="${T('home.motion')}">${G.reduceMotion ? '🍃' : '✨'}</button>
       ${Notify.available ? `<button id="home-remind" type="button" title="${T('notif.toggle')}">${G.save.settings.remind ? '🔔' : '🔕'}</button>` : ''}
       <button id="home-fb" type="button" title="Feedback">💬</button>
     </div>`;
  home.classList.remove('hidden');
  const $ = id => document.getElementById(id);
  $('home-play').onclick = () => { hideHome(); if (playAct) dispatch(playAct); };
  $('home-daily').onclick = () => claimDaily();
  $('home-quests').onclick = () => openQuests();
  $('home-ach').onclick = () => openAchievements();      // 面板 DOM 在 #home 之后,自动叠其上;关闭回到主界面
  $('home-gal').onclick = () => openGallery();
  $('home-skin').onclick = () => openSkins();
  $('home-stats').onclick = () => openStats();
  $('home-howto').onclick = () => openHowTo();
  const rb = $('home-remind');
  if (rb) rb.onclick = () => {                            // 每日提醒开关(原生才显示)
    G.save.settings.remind = !G.save.settings.remind;
    persist();
    rb.textContent = G.save.settings.remind ? '🔔' : '🔕';
    Notify.reschedule(G.save, dailyClaimable());          // 开=申请权限并排期;关=全部取消
  };
  $('home-sfx').onclick = () => { $('home-sfx').textContent = Sfx.toggle() ? '🔊' : '🔇'; };
  // AI 代打开关(免费):主界面与局内按钮共用同一个 action
  $('home-ai').onclick = () => {
    dispatch('AI_TOGGLE');
    const b = $('home-ai');
    b.textContent = G.aiOn ? '🤖' : '🎮';
    b.className = G.aiOn ? 'on' : '';
  };
  $('home-motion').onclick = () => { toggleMotion(); $('home-motion').textContent = G.reduceMotion ? '🍃' : '✨'; };
  $('home-fb').onclick = () => { if (typeof Feedback !== 'undefined') Feedback.openForm(); };   // 意见反馈
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
                ['🖼️', 'collect'], ['💥', 'avoid']];   // 去掉 AI 代打说明(功能已移除)
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

/** 开局礼包发到手时的横幅(显示拿到哪三个果效) */
function showBoostToast(emojis) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'set-banner';
  el.innerHTML = `<span class="sb-emo">🎁</span><span>${T('ads.boostGot')} ${emojis.join(' ')}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 2600);
}

// ——每日任务面板——(复用 #panel;进度条 + 自动发奖,无「领取」按钮)
function questDoneCount() {
  try { return Quests.status(G.save, ymd(Date.now())).filter(q => q.done).length; } catch (e) { return 0; }
}
// 每个任务类型自己的图标:三行同一个 📋 看不出差别,换成对应的果子/格子/连击更好读
const Q_ICON = { apples: '🍎', levels: '🖼️', cells: '🔓', special: '✨', combo: '⚡', noDeath: '🛡️' };
function openQuests() {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('q.title');
  document.getElementById('panel-tabs').innerHTML = '';
  const list = Quests.status(G.save, ymd(Date.now()));
  document.getElementById('panel-body').innerHTML =
    `<div class="q-sub">${T('q.reward', { n: Quests.REWARD_ANGELS })}<br>${T('q.bonusHint', { n: Quests.ALLDONE_BONUS })}</div>` +
    list.map(q => {
      const pct = Math.min(100, (q.prog / q.target) * 100).toFixed(0);
      // qrow:任务图标表达的是「任务类型」不是「拿没拿到」⇒ 不能套成就那套灰掉的样式
      return `<div class="ach-item qrow${q.done ? ' got' : ''}">
          <span class="medal">${q.done ? '✅' : (Q_ICON[q.t] || '📋')}</span>
          <span class="nm">${T('q.' + q.t, { n: q.target })}</span>
          <span class="pg">${q.done ? '✓' : q.prog + '/' + q.target}</span>
        </div>
        <div class="q-bar"><i style="width:${pct}%"></i></div>`;
    }).join('') +
    (list.every(q => q.done)
      ? `<div class="q-all">✨ ${T('q.allDone')}</div>`
      : (adQuotaLeft('quest') > 0 ? `<button class="gal-ad" id="q-ad" type="button">📺 ${T('ads.quest')}</button>` : ''));
  const qad = document.getElementById('q-ad');
  if (qad) qad.onclick = () => { qad.disabled = true; dispatch('AD_QUEST'); };
  document.getElementById('panel-close').onclick = () => {
    panel.classList.add('hidden');
    if (G.phase === 'PAUSED') renderAll();
  };
  panel.classList.remove('hidden');
  if (G.phase === 'PLAYING') dispatch('PAUSE');
}

// ——统计面板——(既有计数器一屏摆出来:沉没成本可视化 = 留存)
function openStats() {
  const panel = document.getElementById('panel');
  document.getElementById('panel-title').textContent = T('stats.title');
  document.getElementById('panel-tabs').innerHTML = '';
  const s = G.save.stats, g = G.save.gallery;
  const total = (G.imgList && G.imgList.length) || 500;
  const hrs = (s.playtimeMs / 3600000);
  // [key, 值, 图标, 分组]。分组只影响配色:col=收集 ply=战绩 hrd=受挫 hab=习惯
  // ——16 个同色数字扫下来像账单,分了组眼睛才抓得住重点。
  const cells = [
    ['levels', s.levelsCleared | 0, '🖼️', 'col'], ['imgs', (g.unlocked.length | 0) + '/' + total, '👼', 'col'],
    ['sets', s.setsDone | 0, '👑', 'col'], ['stars', Object.values(g.stars || {}).reduce((a, v) => a + (v | 0), 0), '⭐', 'col'],
    ['score', s.totalScore | 0, '🏆', 'ply'], ['combo', s.maxCombo | 0, '⚡', 'ply'],
    ['len', s.maxLen | 0, '🐍', 'ply'], ['noDeath', s.noDeathClears | 0, '✨', 'ply'],
    ['apples', s.apples | 0, '🍎', 'ply'], ['cells', s.cellsRevealed | 0, '🔓', 'ply'],
    ['steps', s.steps | 0, '👣', 'ply'],
    ['deaths', s.deaths | 0, '💥', 'hrd'], ['saves', s.shieldSaves | 0, '🛡️', 'hrd'],
    ['streak', s.streakDays | 0, '🔥', 'hab'], ['gift', (G.save.daily && G.save.daily.giftStreak) || 0, '🎁', 'hab'],
    ['time', (hrs >= 1 ? hrs.toFixed(1) + 'h' : Math.round(s.playtimeMs / 60000) + 'm'), '⏱️', 'hab'],
  ];
  document.getElementById('panel-body').innerHTML = `<div class="st-grid">` +
    cells.map(([k, v, ic, c]) =>
      `<div class="st-cell c-${c}"><div class="ic">${ic}</div><b>${v}</b><span>${T('stats.' + k)}</span></div>`).join('') +
    `</div>`;
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
  const gapDays = prevMs != null ? Math.round((new Date(today).getTime() - prevMs) / 86400000) : null;
  const adjacent = gapDays === 1;
  // 恰好漏了 1 天且原来有 ≥2 天连续 ⇒ 给「看广告补签」的机会(弹窗里出按钮)
  G.repairOffer = (!adjacent && gapDays === 2 && (d.giftStreak || 0) >= 2) ? d.giftStreak : null;
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
  Notify.reschedule(G.save, false);          // 今天领过了 ⇒ 撤掉今晚那枪 streak 提醒(绝不放空炮)
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
      ${file ? `<button id="daily-ad" class="daily-ad" type="button">📺 ${T('ads.daily2', { n: AD_REWARD.daily })}</button>` : ''}
      ${G.repairOffer ? `<button id="daily-fix" class="daily-ad" type="button">🔥 ${T('ads.repair', { n: G.repairOffer + 1 })}</button>` : ''}
      <button id="daily-ok" type="button">${T('daily.ok')}</button>
    </div>`;
  // ⭐ 第二个自愿激励位:刚拿到礼物的正反馈时刻问「再来一张？」——拒绝 ⇒ 什么也不发生
  const dad = document.getElementById('daily-ad');
  if (dad) dad.onclick = () => {
    dad.disabled = true;
    Ads.showRewarded().then(okAd => {
      dad.disabled = false;
      if (!okAd) return;
      const n = grantAngels(AD_REWARD.daily);
      if (n) { dad.remove(); const h = lb.querySelector('.daily-h'); if (h) h.textContent = `🎁 +${n}`; }
    });
  };
  // 🔥 streak 补签:恰好漏 1 天 ⇒ 看广告把连续接回来(习惯保护;Duolingo 模式)
  const fix = document.getElementById('daily-fix');
  if (fix) fix.onclick = () => {
    fix.disabled = true;
    Ads.showRewarded().then(okAd => {
      fix.disabled = false;
      if (!okAd || !G.repairOffer) return;
      G.save.daily.giftStreak = G.repairOffer + 1;
      G.repairOffer = null;
      persist();
      fix.remove();
      const el = lb.querySelector('.daily-streak');
      if (el) el.textContent = '🔥 ' + T('daily.streak', { n: G.save.daily.giftStreak });
      Sfx.play('special'); Haptics.light();
    });
  };
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

// ——每日任务——(quests.js 纯逻辑;奖励 = 直接解锁天使图,与每日礼物同一种货币)
// 按日期稳定挑一张未解锁天使;盐与每日礼物不同,免得同一天两处给同一张
function questPickAngel() {
  const got = new Set(G.save.gallery.unlocked);
  const locked = (G.imgList || []).filter(f => !got.has(f));
  if (!locked.length) return null;
  const seed = [...(ymd(Date.now()) + 'q' + G.save.gallery.unlocked.length)]
    .reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 11);
  return locked[seed % locked.length];
}
/** 进度上报 → 完成即**自动发奖**(不做「领取」按钮:多一次点击就多一批忘了领的人) */
function questBump(type, n) {
  if (!G.save || !(n > 0)) return;
  const day = ymd(Date.now());
  const done = Quests.bump(G.save, day, type, n);
  if (!done.length) return;
  const bonus = Quests.allDoneBonus(G.save, day, done);   // 三个全清额外大红包
  const total = done.length * Quests.REWARD_ANGELS + bonus;
  grantAngels(total);                                // 发放口统一（图鉴广告/每日礼物/任务共用）
  const host = document.getElementById('toasts');
  if (host) {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.textContent = `📋 ${T(bonus ? 'q.allDoneBonus' : 'q.done')} · 👼 +${total}`;
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
  // ⭐ AI 代驾 = 免费开关 G.aiOn(玩家自己开关,不再有「到期自动停下」那套)。
  //   先清人手残留转向缓冲,再下 AI 指令 ⇒ 方向权威、当 tick 生效。
  if (G.aiOn) {
    G.aiUsedThisLevel = true;      // 本关用过 AI ⇒ 结算只给 ★1(收集/成就照常)
    run.dirQueue.length = 0;
    Core.setDir(run, AI.nextMove(run, G.cyc, G.aiMem));
  }
  Core.step(run, { nowMs, scoreScale: G.bonusLevel ? 2 : 1 });   // 奖励关 2×
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
  const aiRun = !!G.aiUsedThisLevel;   // 用过 AI 代打的关:成就照给,但星级封顶 ★1
  G.tracker.scoreGained += scoreDelta;   // onStep 不处理 scoreGained(签名无 ctx),接线方负责
  Ach.onStep(G.tracker, run, ev, nowMs);
  Ach.accumulate(G.save, run, ev, { aiRun, scoreDelta, revealDelta, dtMs: interval });
  // 每日任务:复用同一份 core 事件流/增量,**绝不另铺埋点**(quests.js 铁律②)
  questBump('apples', ev.filter(e => e.t === 'apple').length);
  questBump('special', ev.filter(e => e.t === 'special').length);
  if (revealDelta > 0) questBump('cells', revealDelta);
  if (run.combo > 1) questBump('combo', run.combo);          // max 型:传当前值,内部取最大
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
    questBump('levels', 1);
    if (t.deathsInLevel === 0) questBump('noDeath', 1);
    // 求好评:只在**幸福时刻**问(满星通关 / 刚集齐一集),额度门槛全在 rate.js 内部
    if (stars === 3 || G.save.stats.setsDone > setsBefore) { if (Rate.maybeAsk(G.save)) persist(); }
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
    syncMotionClass();                        // 同步给 CSS(body.rm 关掉全部装饰动画)
    G.aiOn = !!G.save.settings.aiOn;          // AI 代打开关跨会话保持(玩家的显式选择)
    if (typeof preloadItems === 'function') preloadItems();   // 预载道具 sprite,防首次出现时 emoji 闪一下
    if (typeof Feedback !== 'undefined') Feedback.flushQueue();   // 补发离线的反馈队列
    Notify.reschedule(G.save, dailyClaimable());   // 每日提醒 + streak 保护(原生才生效,不 await)
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
        if (G.phase === 'PLAYING') Core.setDir(G.run, d);
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
