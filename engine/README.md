# engine/ — 共享骨架

从 2048（Deep Merge，已上架双端）抽取的通用层。**架构 = 全局脚本 + 加载顺序**：无模块、无 bundler，`<script>` 按序加载共享一个全局命名空间，后面的文件只能引用前面文件定义的全局。

## 游戏 index.html 加载顺序（load-bearing）

```html
<link rel="stylesheet" href="../../engine/engine.css">
<link rel="stylesheet" href="css/game.css">        <!-- 主题覆盖 :root 变量 + 游戏自有样式 -->
<canvas id="game-canvas"></canvas>
<div id="controls"></div>

<script>window.GAME_CONFIG = { id: 'mines', languages: [...], sfx: {...}, bgm: [...] };</script>
<script src="../../engine/config.js"></script>     <!-- CFG -->
<script src="../../engine/platform.js"></script>   <!-- Platform -->
<script src="../../engine/i18n.js"></script>       <!-- I18N -->
<script src="../../engine/portal.js"></script>     <!-- Portal（要在 Ads 前）-->
<script src="../../engine/ads.js"></script>        <!-- Ads -->
<script src="../../engine/audio.js"></script>      <!-- Sfx / Music / Haptics -->
<script src="../../engine/canvas.js"></script>     <!-- GameGlobal / hit / draw / wrapLines / makeArt -->
<script src="../../engine/input.js"></script>      <!-- Input -->
<script src="../../engine/controls.js"></script>   <!-- Controls（顶栏语言菜单）-->
<!-- 然后是游戏自己的 constants → logic → render → main -->
```

> 部署/打包时 `../../engine/` 由 build 脚本内联或拷贝（web 直接按目录 serve 即可）。

## 游戏必须实现的契约

- **状态**：单一可变对象 `G`（含 `G.phase` 状态机）；UI 是 `G` 的纯函数。
- **`renderAll()`**（全局函数）：每帧 `clearHits()` → 从 `G` 重画整屏 → 每个可点击区域 `addHit(x,y,w,h,action,data)`。引擎在美术图异步加载完成时会调用全局 `renderAll`。
- **`dispatch(action, data)`**：所有交互入口。`Input.bind({ onAction: dispatch, onSwipe, canSwipe })`。
- **boot 流程**（参考 2048 main.js）：
  `Platform.hydrate([CFG.key('lang'), CFG.key('sfx'), ...CFG.hydrateKeys])` → `restoreAudioPrefs()` → `Portal.boot()` → `await Ads.init()` → `I18N.onChange(重渲染)` → `await I18N.setLang(I18N.detect())` → `initCanvas()` → 初始化 G → `Input.bind(...)` → `Controls.render(extraHtml?)` → `renderAll()`。
- **零硬编码文案**：全走 `T('dotted.key', {params})`（= `I18N.t`），locale 文件 `locales/<lang>.json`，以 en 为基准，`node tools/check-locales.js games/<name>/locales` 必须 0 fail。
- **canvas 上所有非定长文案过 `wrapLines`/`txtLWrap`**（德/俄膨胀、canvas 不自动换行）。
- **美术**：`makeArt('items', [ids])` 预载 `assets/items/<id>.webp`，`drawArtIcon(art, id, emoji, ...)` 画图、缺图回退 emoji——先用 emoji 占位开发，美术后补零改码。

## 各模块提供的全局

| 文件 | 全局 | 说明 |
|---|---|---|
| config.js | `CFG` | `GAME_CONFIG` 门面；`CFG.key('lang')` → `'<id>_lang'` |
| platform.js | `Platform` | Capacitor/web 探测、同步 storage 门面（先 `hydrate`）|
| i18n.js | `I18N` | 10 语默认集（`languages` 可覆盖）、detect/setLang/t/onChange |
| portal.js | `Portal` | GD/CrazyGames/Poki 广告适配；`__PORTAL__`/`?portal=` 激活 |
| ads.js | `Ads` | AdMob 激励+插屏；web 走 Portal 或 confirm 模拟；**每游戏自己的 adUnits，绝不复用他游戏的** |
| audio.js | `Sfx` `Music` `Haptics` `restoreAudioPrefs` | 配置驱动的音效/BGM/震动；Music 带 pauseForAd/resumeForAd |
| canvas.js | `canvas` `ctx` `GameGlobal` `initCanvas` `clearHits` `addHit` `hitTest` `roundRect/fillRR/strokeRR` `txt/txtL/txtR` `wrapLines` `txtLWrap` `drawDim` `makeArt` `drawArtIcon` `T` | 画布与绘制基建 |
| input.js | `Input` | tap→hitTest→onAction；滑动/方向键→onSwipe（canSwipe 门控）；`liveSwipe:true` 时 touchmove 即触发 onSwipe（实时游戏，opt-in，回合制游戏不受影响）|
| controls.js | `Controls` | 顶栏 DOM：语言菜单 + 游戏附加控件 |
| prng.js | `PRNG` | 可注种子随机(mulberry32);测试/每日种子/AI 验证用,替代 Math.random |

## 暂未抽取（等第一个游戏驱动）

- **肉鸽 meta 框架**（天赋/遗物/局间奖励/永久进阶/存档）——2048 里与玩法耦合太深，抄结构不抄代码：`TALENTS/ITEMS_DEF` 数值表 + `applyLocale()` 注入文案 + `REWARD` phase 的模式。做扫雷时先在游戏内实现，第二个游戏再回头抽公共部分。
- IAP（RevenueCat）——只有上 store 的赢家才需要，见 2048 的 iap.js 与 appstore-connect-iap-api skill。

## 存档版本纪律（踩坑沉淀）

run 存档（`CFG.key('run')`）**必须带版本号**（`v: N`），loadRun 校验 `v` + 关键形状（如 `grid.length === w*h`），不匹配就 `clearRunSave()` 丢弃、绝不迁移——玩法重构后老玩家带着旧档打开会「恢复」成畸形状态（0×0 盘面 = 无报错的白屏，E2E 全新档案测不出来）。同理：改了 G 的形状就 bump 版本 + 给 `<script src>` 加 `?v=N` 防浏览器缓存混装新旧 JS。
