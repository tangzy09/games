# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Angel Snake / Snake Angel** —— 揭图收集贪吃蛇。走过的格子揭开底下的天使图,揭满换下一张,集 500 张。含 13 果子 / 120 成就 / 4 皮肤 / AI 代打 / 广告。root `CLAUDE.md`(monorepo 引擎契约、部署铁律、git 纪律、iOS 流水线)先读,本文件只讲 snake 专属架构。

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

## AI 代打的反刷规则(设计 §4,散落在 main/achievements)

开过 AI 的关整关按 AI 局算(`tracker.aiRun` 粘性,防临关秒切):得分减半 / 不判单局成就 / 不刷历史纪录(maxCombo/maxLen) / aiClears 单独计;但图鉴、计数类累计成就照常。「AI 救场 10s」(看广告)**不算 AI 局**——全分、只临时接管方向。

## 存档(storage.js)—— 两个真实踩过的坑

- **保守合并的开放 map 陷阱**:`defaults().stats` 里 `specials{}`/`skinClears{}` 是**空对象**,merge 靠「空 default 透传」保住存档里的动态 key。**若给它们塞非空默认值(如 `{cloud:0}`),会退回逐 key 递归、每次 load 清空动态 key**(24 个特殊果成就进度全丢,曾是 Critical)。加新的动态 map 字段务必保持空默认。
- **图鉴成就数「不同图张数」不是「通关次数」**:img 族 counter = `stats.distinctImgs`(= `gallery.unlocked.length`,过关时同步),不是 `levelsCleared`——否则重温刷同一张图能虚增「天国全图鉴」。
- 当局快照 `run` 支持中途关页面续玩;`SAVE_V` bump 见 root 铁律。

## 皮肤 / 图鉴 / 成就 数据驱动点

- `themes.js`:4 主题,`render` 的 `PAL` 是**可切换引用**(`applyThemePal` 切完 `initLayers` 重建遮罩)。遮罩纹理函数**必须确定性**(格坐标散列,禁 `Math.random`),否则换肤/重建不一致。
- `achievements.js`:`FAMILIES` 20 个阶梯族 → 展开 `CUM_DEFS` 恰 100(有运行时断言),`RUN_ACHS` 20 单局 tracker。加成就改数据表,别写死判定。
- 图鉴/成就/皮肤 UI 都是 **DOM 浮层 `#panel`**(canvas 只画游戏),120/500 项列表 canvas 手搓不值。

## 项目状态(上架)

- 已提交 **App Store 审核**(`WAITING_FOR_REVIEW`)。ASC App「Snake Angel: Retro Arcade」Apple ID `6789757716`,bundle `com.aispeeds.angelsnake`。
- AdMob(iOS):App ID `ca-app-pub-2141208066469648~2322595323`,激励 `/4457804077`、插屏 `/5188431812`(在 `index.html` GAME_CONFIG.adUnits + `codemagic.yaml` GAD_APP_ID)。
- 网页版 + 隐私页:`https://snake.ai-speeds.com/`(EC2)。tag 里程碑:`snake-p1-playable` → `p2a-fruits` → `p2b-achievements` → `p2c-gallery` → `p3a-ads`。
- 未做(候选):P3b 游戏门户铺量、Android 打包、i18n 补满 10 语(现 en+zh-CN,商店页已 10 语)。
