# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Angel Snake / Snake Angel** —— 揭图收集贪吃蛇。走过的格子揭开底下的天使图,揭满换下一张,集 500 张。含 13 果子 / 120 成就 / 4 皮肤 / AI 代打 / 广告 / 每日天使 / 每关星级 / 奖励关 / 爽感 FX / 本机 Flux 道具美术。root `CLAUDE.md`(monorepo 引擎契约、部署铁律、git 纪律、iOS 流水线)先读,本文件只讲 snake 专属架构。

## 命令

```bash
# 全量 node 测试(改 core/ai/fruits 后必跑——AI 零死亡保证靠它守)
for f in games/snake/tests/test-*.js; do node "$f" || break; done
node games/snake/tests/test-ai.js        # 含 10 万步零死亡+必通关机器验证(0.5s)
# E2E(先起 http):python -m http.server 8123 (仓库根) → 开 http://localhost:8123/games/snake/
node games/snake/tests/e2e-p1.js         # playwright 无头:AI 整关通关+成就+存档+皮肤+广告全流程
node tools/check-locales.js games/snake/locales   # 0 fail
# 素材/音效/图标重生成(改了才跑,产物入库):
node games/snake/tools/pick-images.js --count 500 --seed 7   # 从 language-study 抽 500 图+分 25 集 manifest
node games/snake/tools/gen-sfx.js        # 合成 6 个 wav(零外部素材)
node games/snake/tools/gen-appicon.js    # 合成 App 图标+启动屏(playwright)
# 道具贴纸(需本机 ComfyUI 起服务,见 comfyui-flux-local skill):
node games/snake/tools/gen-items.cjs     # Flux schnell 生成 13 道具 → C:\tmp\snake\items\raw
/c/ComfyUI/venv/Scripts/python.exe games/snake/tools/cut-items.py  # 抠透明 → 拷进 assets/items/
```

## 模块分层(index.html 加载顺序即依赖顺序,load-bearing)

引擎脚本 → `prng` → `fruits` → `core` → `ai` → `storage` → `achievements` → `themes` → `gallery` → `render` → `main`。

- **纯逻辑层**(双导出 `if(module.exports)...else 全局`,node 可单测):`prng/core/fruits/ai/storage/achievements/themes` + `gallery` 的数据函数。**改这些先写/跑测试**。
- **DOM/渲染层**(浏览器专用,无单测,靠 E2E + 无头截图验):`render`(renderAll 契约,offscreen 双层)、`main`(boot/主循环/事件消费/存档触发/面板)、`gallery` 的 DOM 部分。
- `main.js` 的 `G` 用 **`var`**(非 const)——顶层 const 不挂 window,E2E/调试要 `window.G`。同理 dispatch/renderAll/openGallery 等靠全局函数声明暴露。

## 三条贯穿全局的架构主线(要改核心前必须懂)

1. **游戏时钟,非墙钟**:所有时间走 `loopState.gameMs`(每 tick `+= interval`),传进 `core.step({nowMs})`、effects 到期、连击窗口全用它。暂停/切后台 gameMs 冻结 → 光环/护盾/连击不流失。**core 里禁用 `Date.now()`**(唯一豁免:`storage.snapshotRun` 的换种子)。
2. **core 事件流 `s.events`**:每 tick 清空重填类型化事件(apple/special/shield/ghostPass/meteorCatch/level/death/milestone/twinSpawn…)。成就引擎(`Ach.onStep/accumulate/onLevelClear`)与音效(`main` 里 `ev.some(e=>e.t===...)`)统一消费,替代散落 flag。
3. **AI「保证通关」是硬承诺,test-ai 是它的守卫**:`ai.js` = 哈密顿闭合回路(必扫全盘)+ 安全捷径(前向距离不变式)+ 停滞保护(退回纯回路)+ BFS 追尾兜底。**改 core 的碰撞/移动/targetLen 或 ai 任何一行,必跑 test-ai**(5+3 种子 + 10 万步零死亡)。安全不变式:`snake.length ≤ targetLen`(targetLen 在 gainApple 封顶 `cols*rows-8`,防蛇填满棋盘必死)。
4. **转向缓冲 `s.dirQueue`**(core.js):人手快速连拐缓冲≤2 个转向,`setDir` 按**队尾方向**校验反向(不是当前 `dir`,否则「上→左」的左会被误判自吃丢掉),`step` 每 tick 消费队首。`respawn`/`revive`/护盾强制转向都要**清空 dirQueue**;AI 代驾前 `run.dirQueue.length=0` 保证 AI 方向权威、当 tick 生效(main tick)。改了照样跑 test-ai。当局快照带 dirQueue,`restoreRun` 对旧档补 `[]`。

## AI 代打的反刷规则(设计 §4,散落在 main/achievements)

开过 AI 的关整关按 AI 局算(`tracker.aiRun` 粘性,防临关秒切):得分减半 / 不判单局成就 / 不刷历史纪录(maxCombo/maxLen) / aiClears 单独计;但图鉴、计数类累计成就照常。「AI 救场 10s」(看广告)**不算 AI 局**——全分、只临时接管方向。

## 存档(storage.js)—— 两个真实踩过的坑

- **保守合并的开放 map 陷阱**:`defaults().stats` 里 `specials{}`/`skinClears{}` 是**空对象**,merge 靠「空 default 透传」保住存档里的动态 key。**若给它们塞非空默认值(如 `{cloud:0}`),会退回逐 key 递归、每次 load 清空动态 key**(24 个特殊果成就进度全丢,曾是 Critical)。加新的动态 map 字段务必保持空默认。
- **图鉴成就数「不同图张数」不是「通关次数」**:img 族 counter = `stats.distinctImgs`(= `gallery.unlocked.length`,过关时同步),不是 `levelsCleared`——否则重温刷同一张图能虚增「天国全图鉴」。
- 当局快照 `run` 支持中途关页面续玩;`SAVE_V` bump 见 root 铁律。**现 `SAVE_V=4`**(v2 daily、v3 gallery.stars、v4 快照 dirQueue)。
- **⚠ 反面陷阱:非空闭合对象加新 key 必须进 defaults**(2026-07 code review 实锤)。`settings` 默认只有 `{theme}`,`merge` 只拷 default 里存在的 key → `settings.reduceMotion` 若不进 defaults,用户显式选择存进去了也会**重载被 merge 丢掉**(减弱动态偏好不持久)。修:`settings.reduceMotion:null`(null=跟随系统,能被 merge 透传显式值)。**开放 map 要保持空默认(上一条),闭合对象的新字段则相反、必须列进 defaults——两坑方向相反,别记混。**

## 皮肤 / 图鉴 / 成就 数据驱动点

- `themes.js`:4 主题,`render` 的 `PAL` 是**可切换引用**(`applyThemePal` 切完 `initLayers` 重建遮罩)。遮罩纹理函数**必须确定性**(格坐标散列,禁 `Math.random`),否则换肤/重建不一致。
- `achievements.js`:`FAMILIES` 20 个阶梯族 → 展开 `CUM_DEFS` 恰 100(有运行时断言),`RUN_ACHS` 20 单局 tracker。加成就改数据表,别写死判定。
- 图鉴/成就/皮肤 UI 都是 **DOM 浮层 `#panel`**(canvas 只画游戏),120/500 项列表 canvas 手搓不值。
- **主界面 `#home`**(`openHome`,main.js):启动即显示的 hub——天使主视觉 + Play/继续 + 成就/图鉴/皮肤/说明入口 + 音效。**纯 DOM 浮层,不动 phase 机**(boot 后 phase 仍 `READY`,E2E 契约靠这条);`START`/`RESUME` 里 `hideHome()` 收起,PLAYING 时打开会先 `PAUSE`(兼当暂停菜单)。顶栏因此精简成 🏠+🔊。说明面板 `openHowTo` 复用 `#panel`,文案含 `<b>` 高亮(`howto.*` i18n key)。
- **蛇的渲染**(`drawSnake`,render.js):三层管体(暗描边→主体→亮核高光,`mix()` 提亮/压暗 hex)+ 圆头带额头高光/腮红/大眼高光点 + **头顶金色天使光环**(点题)。全部确定性,随 `PAL.snake/eye/glow` 走主题。

## 玩法/美术/无障碍升级(2026-07 一轮,均已 node+E2E 验)

- **爽感 FX**(render.js `FX`/`fx*`,纯前端墙钟,不进 core/存档):吃果/连击/护盾/接流星 → 粒子迸发 + `+分`/`×连击` 飘字 + 震屏;过关 `fxCelebrate` = 流光扫过成图 + 星光 + 棋盘回弹(`fxBoardTransform` 围绕棋盘中心 scale+shake,结算浮层延迟 0.8s)。main tick 按 `run.events` 在蛇头坐标触发。
- **道具 sprite**(`itemSprite`/`preloadItems`,render.js):苹果+12 特殊果+流星的 emoji 换成本机 **Flux schnell** 生成的可爱贴纸(`assets/items/*.png`,256² 透明),sprite 优先、未加载回退 emoji/圆(零破坏)。管线 `tools/gen-items.cjs`(ComfyUI)+`cut-items.py`(transparent_background 抠图),改风格才重跑。
- **每日天使**(`claimDaily`,main.js):每天领一张未解锁天使进图鉴(按日期稳定选、防刷)+ 连续天数 `daily.giftStreak`;主界面 🎁 可领时金色脉动。streak 相邻天判定用 `Math.round(日差)`(夏令时安全,同 achievements)。
- **每关星级**(`gallery.stars{文件名:1-3}`,开放 map):★1 通关+★2 无死亡+★3 速通(<2min)或高连击(≥10),AI 局只给 1★(激励手动重玩)。结算浮层星级药丸(`drawOverlay` 的 `stars` 参)+ 图鉴缩略图下显星(渲染前 `st` 夹 0-3 防崩)。
- **奖励关**(`G.bonusLevel`):`imgPos%10===9` 的关 2× 分(`scoreScale` 乘 2)+ 金色 HUD + 开局横幅。**不改盘面尺寸 → AI 保证不受影响**。
- **收集进度里程碑**(`homeProgressHTML`):主界面显 `X/500` + 下一皮肤还差多少(`nextSkinHint` 读 themes unlock)。
- **壁纸导出**(`Gallery.saveWallpaper`):图鉴 lightbox 一键存 1080×1920 竖版天使壁纸(粉彩渐变+柔光,Web Share 优先降级下载)。
- **无障碍减弱动态**(`computeReduceMotion`/`G.reduceMotion`):跟随系统 `prefers-reduced-motion`,主界面 ✨/🍃 可覆盖;`fxBurst`/`fxShake`/庆祝缩放/星光按它门控(飘字/流光保留)。持久化坑见存档节。
- **集齐庆祝**(`showSetComplete`)、奖励关横幅(`showBonusBanner`):`#toasts` 里的临时大横幅。

## 项目状态(上架)

- **已上线 App Store**(`READY_FOR_SALE`)。ASC App「Snake Angel: Retro Arcade」Apple ID `6789757716`,bundle `com.aispeeds.angelsnake`。
- **ASC 有 1.0.1 草稿待出包送审**:39 语言商店页(en-US+zh-Hans 之外 37 语已灌,待 build)+ 本轮全部玩法/美术改良。**出包+提交要用户批准**(root CLAUDE.md 铁律)。ASO 39 语文档 `C:\tmp\snake\aso-39-keywords.md`。
- AdMob(iOS):App ID `ca-app-pub-2141208066469648~2322595323`,激励 `/4457804077`、插屏 `/5188431812`(在 `index.html` GAME_CONFIG.adUnits + `codemagic.yaml` GAD_APP_ID)。**app-ads.txt 已在 `snake.ai-speeds.com` 根**(全 5 游戏同一份,见 root/admob skill)。
- 网页版 + 隐私页:`https://snake.ai-speeds.com/`(EC2)。tag 里程碑:`snake-p1-playable` → `p2a-fruits` → `p2b-achievements` → `p2c-gallery` → `p3a-ads`。
- 未做(候选):P3b 游戏门户铺量、Android 打包、BGM、i18n 补满界面 10 语(现 en+zh-CN)。
