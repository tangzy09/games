# 天使贪吃蛇 P2c(500 图鉴 + 4 皮肤 + 分享卡片)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 500 张天使图鉴(25 集×20,DOM 浮层陈列/lightbox/点已解锁图重温)+ 4 套可解锁皮肤(云朵/星夜/马卡龙/天国,进度解锁)+ 过关分享卡片(canvas 合成 + Web Share/下载)。依赖 P2b 的存档层(`G.save.gallery/stats/settings`)与成就族(set_*/sk_*)。

**Architecture:**
- **图鉴**:pick-images 扩展产出 25 集分组 manifest;过关把当前图文件名记入 `save.gallery.unlocked`;集齐检测更新 `stats.setsDone`(触发 set_* 成就);UI 复用 P2b 的 `#panel` 浮层(集网格 → 集内 20 缩略图 → lightbox;已解锁可点「重温」跳到该图开局)。
- **皮肤**:`themes.js` 数据驱动(调色板 + 遮罩纹理绘制函数 + 解锁条件);render.js 的 `PAL` 常量改为可切换引用,`resetMask` 走主题纹理;皮肤面板复用 `#panel`;过关时 `stats.skinClears[主题]++`(触发 sk_* 成就)。
- **分享**:LEVEL_DONE 覆盖层加第二按钮 → offscreen canvas 合成 1080×1350 卡片 → `navigator.share`(File)优先,降级下载。
- **主菜单屏偏离声明**:设计 §8 的独立主菜单屏 P2c 不做——顶栏图标(🏅成就/🖼️图鉴/🎨皮肤/🔊)已覆盖全部入口,独立菜单屏留给 P3/上店版本(记入设计文档偏离)。

**约定:** 同 P2b(仓库根、禁 `git add -A`、Co-Authored-By 尾注、游戏时钟)。现状必读:P2b 完成后的 `main.js`(#panel 基建/openAchievements/persist)、`render.js`、`storage.js`。**本计划必须在 P2b 全部落地后执行。**

**File Structure:**

```
games/snake/tools/pick-images.js     # 扩展:--sets 25 分组 + 集名 key 输出
games/snake/assets/angels/           # 500 webp + manifest.json(含 sets)
games/snake/js/themes.js             # 新:4 主题(调色板/纹理/解锁)
games/snake/js/render.js             # PAL→主题引用;resetMask 走主题纹理;LEVEL_DONE 加分享按钮
games/snake/js/gallery.js            # 新:图鉴/皮肤面板 DOM 渲染 + 重温 + 分享卡片合成
games/snake/js/main.js               # 接线:解锁记录/setsDone/skinClears/主题应用/顶栏图标/dispatch SHARE
games/snake/index.html               # themes.js/gallery.js script
games/snake/css/game.css             # 图鉴网格/lightbox/皮肤卡样式
games/snake/locales/{en,zh-CN}.json  # 25 集名 + 图鉴/皮肤/分享文案
games/snake/tests/test-gallery.js    # 新:分组/解锁/setsDone 纯逻辑测试
games/snake/tests/e2e-p1.js          # 增:图鉴/皮肤/分享断言
```

---

### Task 1: 500 张素材 + 分组 manifest + 集名文案

**Files:** Modify `games/snake/tools/pick-images.js`;产出 `games/snake/assets/angels/`(500 webp + manifest);Modify locales

- [ ] **Step 1: pick-images.js 扩展**——manifest 增加 sets:

```js
// 现有 picked(count 张,已 sort)之后:
const SET_SIZE = 20;
const sets = [];
for (let i = 0; i < picked.length; i += SET_SIZE)
  sets.push({ key: 'set' + (sets.length + 1), images: picked.slice(i, i + SET_SIZE) });
fs.writeFileSync(path.join(DST, 'manifest.json'),
  JSON.stringify({ v: 2, images: picked, sets }, null, 1));
```

(游戏运行时 `images` 平铺数组语义不变——顺序即闯关顺序;sets 只供图鉴分组。)

- [ ] **Step 2: 运行 `node games/snake/tools/pick-images.js --count 500 --seed 7`,独立复核**:

```
node -e "const m=require('./games/snake/assets/angels/manifest.json');const fs=require('fs');console.log(m.images.length, m.sets.length, m.sets.every(s=>s.images.length===20), m.images.every(f=>fs.existsSync('games/snake/assets/angels/'+f)))"
```
Expected: `500 25 true true`。目录总大小 <30MB(`(gci games/snake/assets/angels | measure Length -Sum).Sum/1MB`)。

- [ ] **Step 3: locales 加 25 集名**(嵌套 `"gal": { "set1": ..., "title", "back", "replay", "lockedTip", "progress" }`):

zh:星空集/猫咪集/四季集/甜点集/花园集/海洋集/音乐集/旅行集/美食集/学园集/节日集/森林集/雨天集/冬雪集/夏日集/蝴蝶集/星愿集/茶会集/云端集/月光集/宝石集/童话集/天使乐队集/梦境集/圣光集
en:Starry / Kittens / Seasons / Desserts / Garden / Ocean / Music / Travel / Foods / School / Festivals / Forest / Rainy Days / Winter Snow / Summer / Butterflies / Wishes / Tea Party / Clouds / Moonlight / Gems / Fairy Tales / Angel Band / Dreams / Holy Light
UI:`gal.title`(Gallery/图鉴)、`gal.back`(← Back/← 返回)、`gal.replay`(Replay/重温)、`gal.progress`("{cur}/{max}")、`menu.gallery`(Gallery/图鉴)。
check-locales 0 fail。

- [ ] **Step 4: Commit**(素材大提交单独放)

```bash
git add games/snake/tools/pick-images.js games/snake/assets/angels games/snake/locales
git commit -m "feat(snake): 500张图鉴素材——25集分组manifest+集名文案"
```

---

### Task 2: themes.js 4 皮肤 + render 接线 + 皮肤面板

**Files:** Create `games/snake/js/themes.js`;Modify `render.js`、`main.js`、`index.html`(themes.js 在 render.js 前)、`game.css`、locales

- [ ] **Step 1: themes.js**

```js
// games/snake/js/themes.js — 4 主题:调色板/遮罩纹理/解锁条件(双导出)
// 纹理函数签名 (m, px, pc):m=遮罩 ctx(先由 resetMask 铺好底色),px=层宽,pc=格宽。
// 纹理必须确定性(禁 Math.random——用格坐标散列),保证换肤/重建一致。
const THEMES = {
  cloud: {   // 云朵粉彩(默认)
    unlock: null,
    pal: { bg:'#fdf3f7', cloud:'#f3e0ef', cloudEdge:'#e6c8e0', snake:'#f7b8d4',
      accent:'#e79cc2', accent2:'#b39ddb', text:'#7a5c72', bar:'#f6d5e5', card:'#ffffff',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#5d4a57', btnOn:'#b39ddb' },
    texture(m, px, pc) {
      m.strokeStyle = this.pal.cloudEdge; m.lineWidth = 1;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        m.beginPath(); m.arc(x*pc+pc/2, y*pc+pc/2, pc*0.34, 0, Math.PI*2); m.stroke();
      }
    },
  },
  star: {    // 星夜梦境:揭开=夜幕破洞透光
    unlock: { stat: 'levelsCleared', n: 5 },
    pal: { bg:'#191a2e', cloud:'#23244a', cloudEdge:'#3b3d6e', snake:'#8c9eff',
      accent:'#7986cb', accent2:'#b39ddb', text:'#c5cae9', bar:'#2c2d55', card:'#262750',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#fff59d', eye:'#e8eaf6', btnOn:'#5c6bc0' },
    texture(m, px, pc) {   // 确定性小星星:格坐标散列挑 ~18% 的格画 2px 星点
      m.fillStyle = '#e8ecff';
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const h = (x * 73856093 ^ y * 19349663) >>> 0;
        if (h % 100 < 18) {
          const ox = (h % 7) / 7 * pc * 0.6 + pc * 0.2, oy = ((h >> 3) % 7) / 7 * pc * 0.6 + pc * 0.2;
          const r = (h % 3) + 1;
          m.globalAlpha = 0.5 + (h % 5) * 0.1;
          m.fillRect(x*pc+ox, y*pc+oy, r, r);
        }
      }
      m.globalAlpha = 1;
    },
  },
  candy: {   // 马卡龙糖果:薄荷/奶油格子糖纸
    unlock: { stat: 'levelsCleared', n: 15 },
    pal: { bg:'#f2fbf4', cloud:'#d9f2e3', cloudEdge:'#bfe6d0', snake:'#a8d8b9',
      accent:'#7cc7a1', accent2:'#f7b8d4', text:'#4e7a62', bar:'#d9f2e3', card:'#ffffff',
      apple:'#ff8fab', leaf:'#66bb6a', glow:'#ffe082', eye:'#33544a', btnOn:'#f7b8d4' },
    texture(m, px, pc) {   // 双色棋盘格
      m.fillStyle = '#fff4d9'; m.globalAlpha = 0.55;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
        if ((x + y) % 2 === 0) m.fillRect(x*pc, y*pc, pc, pc);
      m.globalAlpha = 1;
    },
  },
  heaven: {  // 天国花园:白金羽毛+光晕
    unlock: { stat: 'setsDone', n: 1 },
    pal: { bg:'#fffdf5', cloud:'#f6efdb', cloudEdge:'#e6d9b8', snake:'#f0e2b6',
      accent:'#d4af37', accent2:'#e79cc2', text:'#8a7a4a', bar:'#f0e8d0', card:'#ffffff',
      apple:'#ff8fab', leaf:'#a5d6a7', glow:'#ffe082', eye:'#6d5f35', btnOn:'#c9a227' },
    texture(m, px, pc) {   // 对角羽毛短弧 + 中心光晕
      m.strokeStyle = '#e2cf9b'; m.lineWidth = 1.2;
      const n = Math.round(px / pc);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const h = (x * 2654435761 ^ y * 40503) >>> 0;
        if (h % 100 < 30) {
          const cx = x*pc+pc/2, cy = y*pc+pc/2;
          m.beginPath(); m.arc(cx, cy, pc*0.3, Math.PI*0.2 + (h%4)*0.4, Math.PI*0.9 + (h%4)*0.4); m.stroke();
        }
      }
      const g = m.createRadialGradient(px/2, px/2, px*0.1, px/2, px/2, px*0.7);
      g.addColorStop(0, 'rgba(255,246,200,0.35)'); g.addColorStop(1, 'rgba(255,246,200,0)');
      m.fillStyle = g; m.fillRect(0, 0, px, px);
    },
  },
};
const THEME_ORDER = ['cloud', 'star', 'candy', 'heaven'];
function themeUnlocked(key, save) {
  const u = THEMES[key].unlock;
  if (!u) return true;
  const v = u.stat.split('.').reduce((o, k) => (o || {})[k], save.stats) || 0;
  return v >= u.n;
}
const Themes = { THEMES, THEME_ORDER, themeUnlocked };
if (typeof module !== 'undefined' && module.exports) module.exports = Themes;
```

- [ ] **Step 2: render.js 接线**
  - `const PAL = {...}` 改为 `let PAL = THEMES.cloud.pal;` + 新增 `function applyThemePal(key) { PAL = THEMES[key].pal; }`(main 在 boot 与切肤时调,随后 `initLayers(G.img)` 重建遮罩);
  - `resetMask()`:铺底色后调 `THEMES[G.save && G.save.settings.theme || 'cloud'].texture(m, layerPx, pc)`,删掉内联云圈(挪进 cloud.texture 已含);
  - `game.css` 的 body 背景与 `--eng-*` 覆盖是静态 CSS——换肤时由 main 动态设:`document.body.style.background = PAL.bg;`(放 applyTheme 流程)。

- [ ] **Step 3: main.js**
  - boot:hydrate/load save 之后 `applyThemePal(G.save.settings.theme); document.body.style.background = ...`(theme 不合法回 'cloud');
  - `openSkins()` 面板(复用 #panel):4 张主题卡(色板小方块预览 + 名字 + 解锁条件/✓),点已解锁卡 → `G.save.settings.theme = key; applyThemePal(key); initLayers(G.img); persist(); renderAll(); renderSkinsBody();`;
  - 过关处(onLevelClear 调用旁):`const th = G.save.settings.theme; G.save.stats.skinClears[th] = (G.save.stats.skinClears[th] || 0) + 1;`(在 checkCum 之前,保证 sk_* 成就当场触发);
  - 顶栏加 🎨 按钮(Controls.render extraHtml,onclick openSkins)。
  - locales:`skins.title`(Skins/皮肤)、`skins.cloud/star/candy/heaven`(云朵粉彩/星夜梦境/马卡龙糖果/天国花园;Cloud Pastel/Starry Dream/Macaron Candy/Heaven Garden)、`skins.needLevels`("Clear {n} angels to unlock"/"揭开 {n} 张图解锁")、`skins.needSet`("Complete a full set"/"集齐一个主题集解锁")、`menu.skins`。

- [ ] **Step 4: game.css** 皮肤卡样式:

```css
.skin-card { display: flex; align-items: center; gap: 12px; padding: 12px 10px;
  border: 2px solid transparent; border-radius: 14px; margin-bottom: 8px; }
.skin-card.on { border-color: #e79cc2; }
.skin-card.locked { opacity: .55; }
.skin-sw { width: 56px; height: 36px; border-radius: 10px; display: flex; overflow: hidden; }
.skin-sw i { flex: 1; }
.skin-nm { font: 600 14px sans-serif; }
.skin-tip { margin-left: auto; font: 500 12px sans-serif; opacity: .8; }
```

- [ ] **Step 5: 回归 + 无头冒烟**(evaluate 里解锁星夜:`G.save.stats.levelsCleared=5; openSkins()` 点卡切换,截图对比配色变化 + 遮罩纹理变化)。Commit:

```bash
git add games/snake/js/themes.js games/snake/js/render.js games/snake/js/main.js games/snake/index.html games/snake/css/game.css games/snake/locales
git commit -m "feat(snake): 4套皮肤——主题化调色板/遮罩纹理/进度解锁/皮肤面板"
```

---

### Task 3: 图鉴面板 + 解锁记录 + 重温

**Files:** Create `games/snake/js/gallery.js`;Modify `main.js`、`index.html`、`game.css`、`tests/test-gallery.js`(新)

- [ ] **Step 1: 纯逻辑测试**(test-gallery.js)

```js
const assert = require('assert');
const Gallery = require('../js/gallery.js');

const manifest = { images: [], sets: [] };
for (let s = 0; s < 25; s++) {
  const imgs = [];
  for (let i = 0; i < 20; i++) { const f = `img${s}_${i}.webp`; imgs.push(f); manifest.images.push(f); }
  manifest.sets.push({ key: 'set' + (s + 1), images: imgs });
}
// 解锁记录:去重
{
  const save = { gallery: { unlocked: [] }, stats: { setsDone: 0 } };
  Gallery.recordUnlock(save, 'img0_0.webp');
  Gallery.recordUnlock(save, 'img0_0.webp');
  assert.strictEqual(save.gallery.unlocked.length, 1, '去重');
}
// setsDone:集齐 20 张 → +1,不重复
{
  const save = { gallery: { unlocked: [] }, stats: { setsDone: 0 } };
  for (let i = 0; i < 20; i++) Gallery.recordUnlock(save, `img3_${i}.webp`);
  Gallery.updateSetsDone(save, manifest);
  assert.strictEqual(save.stats.setsDone, 1, '集齐一集');
  Gallery.updateSetsDone(save, manifest);
  assert.strictEqual(save.stats.setsDone, 1, '幂等');
}
// 集进度
{
  const save = { gallery: { unlocked: ['img5_0.webp', 'img5_1.webp'] }, stats: { setsDone: 0 } };
  assert.strictEqual(Gallery.setProgress(save, manifest.sets[5]), 2);
}
console.log('OK test-gallery');
```

- [ ] **Step 2: gallery.js**(纯逻辑双导出 + DOM 渲染;DOM 部分浏览器才执行)

```js
// games/snake/js/gallery.js — 图鉴:解锁记录/集进度(纯逻辑)+ 面板 DOM(浏览器)
function recordUnlock(save, file) {
  if (!save.gallery.unlocked.includes(file)) save.gallery.unlocked.push(file);
}
function setProgress(save, set) {
  const u = new Set(save.gallery.unlocked);
  return set.images.filter(f => u.has(f)).length;
}
function updateSetsDone(save, manifest) {
  let done = 0;
  for (const set of manifest.sets || []) if (setProgress(save, set) === set.images.length) done++;
  save.stats.setsDone = done;      // 幂等:直接以完成集数为准
}
const Gallery = { recordUnlock, setProgress, updateSetsDone };
if (typeof module !== 'undefined' && module.exports) module.exports = Gallery;
```

- [ ] **Step 3: main.js 图鉴面板 + 接线**
  - boot 里把 manifest 存 `G.manifest = mf;`(fetch 已有);
  - 过关处(skinClears 旁):`Gallery.recordUnlock(G.save, G.imgList[G.imgPos % G.imgList.length]); Gallery.updateSetsDone(G.save, G.manifest);`——放 `Ach.checkCum` **之前**(img_*/set_* 成就当场触发);
  - `openGallery()`:#panel 复用,两级视图——集网格(25 卡:集名 + 进度 x/20,全灰=0 解锁)→ 点集进入 20 缩略图网格(`<img loading="lazy" src="assets/angels/<f>">`,未解锁加 `.locked` CSS 灰剪影),点已解锁缩略图 → lightbox(全屏 img + 「重温」按钮);
  - 重温:`replay(file)` → `G.imgPos = G.imgList.indexOf(file); G.phase='LOADING'; loadImage().then(()=>{ 重置 G.run 揭图(new createGame? 不——保留蛇与分数,换图重开遮罩:G.run.revealed.fill(0); G.run.revealedCount=0; G.run.milestones=0; for(蛇身格) revealCell; initLayers(G.img); enterReady(); }); 关面板`。**重温实现放 main(需要 core 内部揭格——加 Core.resetBoard(s) 导出**:把 completeLevel 的「清遮罩+蛇身格揭开」抽成 `resetBoard(s)`,completeLevel 与重温共用,core 加 4 行 + 导出);
  - 顶栏加 🖼️ 按钮(openGallery)。

- [ ] **Step 4: game.css** 图鉴样式:

```css
.gal-set { display: flex; align-items: center; gap: 10px; padding: 10px 8px;
  border-bottom: 1px solid #f6d5e5; font: 600 14px sans-serif; color: #7a5c72; }
.gal-set .pg { margin-left: auto; font-weight: 500; font-size: 12px; color: #b39ddb; }
.gal-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding-top: 8px; }
.gal-grid img { width: 100%; aspect-ratio: 1; border-radius: 10px; object-fit: cover; }
.gal-grid img.locked { filter: grayscale(1) brightness(.35); }
#lightbox { position: fixed; inset: 0; background: rgba(30,20,28,.92); z-index: 40;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
#lightbox img { width: min(92vw, 80vh); border-radius: 16px; }
#lightbox button { border: 0; border-radius: 14px; padding: 12px 32px;
  font: 700 15px sans-serif; color: #fff; background: #e79cc2; }
```

(lightbox 容器动态创建或 index.html 预置 `<div id="lightbox" class="hidden">`——选预置。)

- [ ] **Step 5: 回归**(node 全测 + 无头:evaluate 里预填 unlocked 若干,openGallery 截图集网格与缩略图灰/亮对比)。Commit:

```bash
git add games/snake/js/gallery.js games/snake/js/core.js games/snake/js/main.js games/snake/index.html games/snake/css/game.css games/snake/tests/test-gallery.js
git commit -m "feat(snake): 图鉴——25集陈列/缩略图/lightbox/重温/集齐检测接成就"
```

---

### Task 4: 分享卡片

**Files:** Modify `games/snake/js/gallery.js`(shareCard 合成)、`render.js`(LEVEL_DONE 第二按钮)、`main.js`(dispatch SHARE)、locales

- [ ] **Step 1: render.js** `drawOverlay` 加可选第二按钮:签名加 `extra`(`{label, action}`),主按钮下方 12px 处再画一个次级样式按钮(bar 色底、text 色字)+ addHit;`renderAll` 的 LEVEL_DONE 调用传 `{ label: T('share.btn'), action: 'SHARE' }`。

- [ ] **Step 2: gallery.js 加 shareCard**(放这里避免 main 再膨胀):

```js
async function shareCard(img, score, pal, texts) {   // texts = {title, playAt, url}
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d');
  x.fillStyle = pal.bg; x.fillRect(0, 0, 1080, 1350);
  x.fillStyle = pal.card; x.fillRect(40, 40, 1000, 1270);
  if (img) x.drawImage(img, 60, 150, 960, 960);
  x.fillStyle = pal.text; x.textAlign = 'center';
  x.font = 'bold 56px sans-serif'; x.fillText(texts.title, 540, 110);
  x.font = 'bold 44px sans-serif'; x.fillText(texts.score, 540, 1180);
  x.font = '28px sans-serif'; x.fillText(texts.url, 540, 1250);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'angel-snake.png', { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: texts.title }); return 'shared'; } catch (e) {}
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'angel-snake.png';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
```

Gallery 导出加 shareCard(node 端不 require DOM——shareCard 仅浏览器调用,导出无妨)。

- [ ] **Step 3: main.js** dispatch 加:

```js
    case 'SHARE':
      if (G.phase === 'LEVEL_DONE')
        Gallery.shareCard(G.img, G.run.score, PAL, {
          title: 'Angel Snake',
          score: `${T('snake.score')} ${G.run.score}`,
          url: location.origin + location.pathname,
        });
      break;
```

locales:`share.btn`(Share 📤 / 分享 📤)。

- [ ] **Step 4: 回归 + 无头验证**(evaluate:置 LEVEL_DONE 态,断言 SHARE hit 存在;直接调 shareCard 断言返回 'downloaded' 且不抛错——headless 无 navigator.share)。Commit:

```bash
git add games/snake/js/gallery.js games/snake/js/render.js games/snake/js/main.js games/snake/locales
git commit -m "feat(snake): 分享卡片——canvas合成/WebShare优先/下载降级/过关分享按钮"
```

---

### Task 5: E2E 扩展 + 全量回归 + tag

**Files:** Modify `games/snake/tests/e2e-p1.js`

- [ ] **Step 1: E2E 追加**(成就断言块之后):

```js
  // 图鉴:过关图已解锁;面板可开;500 manifest
  const galProbe = await page.evaluate(() => ({
    unlocked: window.G.save.gallery.unlocked.length,
    total: window.G.manifest.images.length,
    sets: window.G.manifest.sets.length,
  }));
  assert(galProbe.unlocked >= 1, `gallery unlocked >= 1 (got ${galProbe.unlocked})`);
  assert(galProbe.total === 500 && galProbe.sets === 25, `manifest 500/25 (got ${galProbe.total}/${galProbe.sets})`);
  await page.evaluate(() => openGallery());
  const setRows = await page.evaluate(() => document.querySelectorAll('.gal-set').length);
  assert(setRows === 25, `gallery renders 25 sets (got ${setRows})`);
  await page.evaluate(() => document.getElementById('panel-close').click());
  // 皮肤:解锁星夜并切换,PAL 变化 + 存档记录
  await page.evaluate(() => { window.G.save.stats.levelsCleared = 5; });
  await page.evaluate(() => { openSkins(); });
  const before = await page.evaluate(() => PAL.bg);
  await page.evaluate(() => applyThemeFromUI('star'));   // 实现里给皮肤卡点击抽个可测函数
  const after = await page.evaluate(() => ({ bg: PAL.bg, saved: window.G.save.settings.theme }));
  assert(after.bg !== before && after.saved === 'star', `theme switch works (${before} -> ${after.bg}, saved=${after.saved})`);
  await page.evaluate(() => { applyThemeFromUI('cloud'); document.getElementById('panel-close').click(); });
  // 分享:LEVEL_DONE 时 SHARE hit 存在(用 hitTest 探)
```

(SHARE hit 探测:在下一次 LEVEL_DONE 时 `hitAreas` 是 render 内部——改为 evaluate 里直接断言 `typeof Gallery.shareCard === 'function'` + dispatch('SHARE') 不抛错并触发下载分支——headless 下载不好断言,退而断言函数存在 + 手动调用 shareCard 返回 'downloaded'。)

- [ ] **Step 2: 全量回归**:七个 node 测试(prng/core/fruits/ai/storage/achievements/gallery)+ check-locales + E2E ALL PASS + 截图(星夜皮肤一张——中途切 star 后截,收尾切回 cloud)。
- [ ] **Step 3: Commit + tag**

```bash
git add games/snake/tests/e2e-p1.js
git commit -m "test(snake): E2E——图鉴500/25集/皮肤切换/分享函数"
git tag snake-p2c-gallery
```

同时更新设计文档 §8:主菜单屏改为「顶栏图标入口(P2c 落地),独立菜单屏挪 P3」——一行改动,连同本提交(允许加 `games/snake/docs` 到该 commit)。

---

## Self-Review 记录

- **Spec 覆盖**:§5 图鉴(500/25 集/剪影锁/全屏欣赏/重温——重温从「集满后」放宽为「已解锁即可重温」,体验更好,偏离已注)/§6.3 皮肤解锁条件(5 张/15 张/集齐一集)/§8 皮肤 6 件套中的调色板+遮罩纹理+蛇配色(果子托盘/边框细化并入调色板;主菜单屏偏离已声明)/§7 分享卡片(二维码降级为 URL 文本——设计 v1 允许「文字短链兜底」,QR 库留 P3)。
- **成就联动**:set_*(setsDone)/sk_*(skinClears)/img_*(levelsCleared)在过关处按「先记录后 checkCum」顺序触发。
- **命名一致性**:`Themes.THEMES/THEME_ORDER/themeUnlocked`、`applyThemePal`、`Gallery.recordUnlock/setProgress/updateSetsDone/shareCard`、`openGallery/openSkins/applyThemeFromUI`、`Core.resetBoard`(重温抽取)。
- **已知取舍**:重温保留蛇长与分数(只换图重置遮罩)——与过关换图行为一致;纹理确定性(格散列,禁 Math.random);500 图 ~25MB 入库(spec 允许);E2E 的皮肤切换直接调内部函数(UI 点击路径由无头截图冒烟覆盖)。
