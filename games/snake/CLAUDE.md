# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Angel Snake / Snake Angel** —— 揭图收集贪吃蛇。走过的格子揭开底下的天使图(**吃到果实再随机揭 9 格**),揭满换下一张,集 500 张。含 13 果子(**特殊果永远在场**) / 120 成就 / 4 皮肤 / **AI 代打(免费开关)** / 广告 / 每日天使 / **每日任务** / **统计页** / 每关星级 / 奖励关 / 爽感 FX / 本机 Flux 道具美术 / **10 语 UI** / **意见反馈** / **求好评 + 推送提醒(原生)** / **粘度层(等级称号 · 天使榜 · 连续奖励阶梯 · 「下一个目标」条)**。root `CLAUDE.md`(monorepo 引擎契约、部署铁律、git 纪律、iOS 流水线)先读,本文件只讲 snake 专属架构。

## 命令

```bash
# 全量 node 测试(改 core/ai/fruits 后必跑——AI 零死亡保证靠它守)
for f in games/snake/tests/test-*.js; do node "$f" || break; done
node games/snake/tests/test-ai.js        # 含 10 万步零死亡+必通关机器验证(0.5s)
# E2E(先起 http):python -m http.server 8123 (仓库根) → 开 http://localhost:8123/games/snake/
node games/snake/tests/e2e-p1.js         # playwright 无头:救场 AI 整关通关+成就+存档+皮肤+广告全流程
node games/snake/tests/e2e-rewards.js    # 激励七个位冒烟:奖励真发/额度真扣/拒绝真不发(经济红线)
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

引擎脚本 → `prng` → `fruits` → `core` → `ai` → `storage` → `achievements` → `themes` → `gallery` → **`quests` → `adgate`** → `render` → `feedback-client` → **`rate` → `notify`** → `main`。

- **纯逻辑层**(双导出 `if(module.exports)...else 全局`,node 可单测):`prng/core/fruits/ai/storage/achievements/themes/quests/adgate` + `gallery` 的数据函数。**改这些先写/跑测试**。
- **DOM/渲染层**(浏览器专用,无单测,靠 E2E + 无头截图验):`render`(renderAll 契约,offscreen 双层)、`main`(boot/主循环/事件消费/存档触发/面板)、`gallery` 的 DOM 部分。
- `main.js` 的 `G` 用 **`var`**(非 const)——顶层 const 不挂 window,E2E/调试要 `window.G`。同理 dispatch/renderAll/openGallery 等靠全局函数声明暴露。

## 三条贯穿全局的架构主线(要改核心前必须懂)

1. **游戏时钟,非墙钟**:所有时间走 `loopState.gameMs`(每 tick `+= interval`),传进 `core.step({nowMs})`、effects 到期、连击窗口全用它。暂停/切后台 gameMs 冻结 → 光环/护盾/连击不流失。**core 里禁用 `Date.now()`**(唯一豁免:`storage.snapshotRun` 的换种子)。
2. **core 事件流 `s.events`**:每 tick 清空重填类型化事件(apple/special/shield/ghostPass/meteorCatch/level/death/milestone/twinSpawn…)。成就引擎(`Ach.onStep/accumulate/onLevelClear`)与音效(`main` 里 `ev.some(e=>e.t===...)`)统一消费,替代散落 flag。
3. **AI「保证通关」是硬承诺,test-ai 是它的守卫**:`ai.js` = 哈密顿闭合回路(必扫全盘)+ 安全捷径(前向距离不变式)+ 停滞保护(退回纯回路)+ BFS 追尾兜底。**改 core 的碰撞/移动/targetLen 或 ai 任何一行,必跑 test-ai**(5+3 种子 + 10 万步零死亡)。安全不变式:`snake.length ≤ targetLen`(targetLen 在 gainApple 封顶 `cols*rows-8`,防蛇填满棋盘必死)。
4. **转向缓冲 `s.dirQueue`**(core.js):人手快速连拐缓冲≤2 个转向,`setDir` 按**队尾方向**校验反向(不是当前 `dir`,否则「上→左」的左会被误判自吃丢掉),`step` 每 tick 消费队首。`respawn`/`revive`/护盾强制转向都要**清空 dirQueue**;AI 代驾前 `run.dirQueue.length=0` 保证 AI 方向权威、当 tick 生效(main tick)。改了照样跑 test-ai。当局快照带 dirQueue,`restoreRun` 对旧档补 `[]`。

## ⭐ AI 代打(2026-08-01 起:完全免费 + 随时开关)

- **免费开关**(用户拍板):`G.aiOn` ←→ `save.settings.aiOn`(跨会话保持)。入口两处:局内按钮(原救场键位,`AI_TOGGLE`)+ 主界面。⛔ **零广告**——AI 属于「玩不动时的救济」,锁广告后面是 casual-game-meta §0 的红线。旧的「看 30s 广告换限时代驾」(`rescueUntil`/`rescueWasActive`/到期自动 PAUSED)**已整套删除**。
- **代价 = 星级封顶 + 单局成就不给**(前者是本次加的,后者是 `achievements.js` 早就有的防刷边界,被 E2E 重新钉死):
  | AI 局 | 给不给 |
  |---|---|
  | 图鉴解锁 / 分数 / 累计成就(`img_*`/`aic_*`/`levelsCleared`…) | ✅ 全给 |
  | 星级 | **封顶 ★1**(`G.aiUsedThisLevel` → `aiRun=true`) |
  | 单局成就 `r_*` / 纪录(maxCombo·maxLen) / noDeathClears·speedClears | ❌ 不给(`onLevelClear` 的 `if (!aiRun)`) |

  理由:AI 无限免费又给满星满成就 = 游戏自己玩自己,收集与成就经济一起归零;这条边界把「收集进度」放开、把「本事的证明」留给手动。`enterReady` 重置 `aiUsedThisLevel`(不跨关),开关本身跨关保持(玩家的显式选择)。
- `ai.js`(哈密顿闭合回路)与 `test-ai`(10 万步零死亡 + 必通关)照旧是硬承诺,改 core 碰撞/移动/targetLen 必跑。
- **E2E**:`window.G.aiOn = true` 让 AI 代驾到通关;并钉「开 AI 时零广告调用」「aiUsedThisLevel 被标记」。

## ⭐ 揭图节奏(2026-08-01 用户拍板的两条)

- **⭐ 每关揭哪张图 = 随机**(`pickImgIndex()`，2026-08-01 用户定「每次消除游戏时的天使图也都随机」)：
  **优先从没解锁的里抽**（随机的惊喜 + 收集进度一直在动），全解锁了就随便抽一张重温。
  调用点两处：`nextLevel()` 和 boot 里的**新局**（续玩局保持快照里的 `imgPos`，不许换图）。
  ⚠ **奖励关的节奏不能再挂 `imgPos % 10`**（图号随机了 ⇒ 变成 10% 随机撞上）——改看
  `run.level % 10`（每通一关 +1），节奏才稳定。
- **⭐ 主界面主视觉 = 每次进来换一张**(`pickHeroAngel()`)：从**已解锁的**里抽（它是「我的收藏」
  不是装饰画），一张都没解锁时回退 `HERO_ANGEL`（= App 图标那张）。
  ⚠ 抽到的值缓存进 `G.heroAngel`、**只在 `openHome()` 里抽**，`hideHome()` 清空 ——
  主界面会因切语言/领奖重渲多次，每次重渲都重抽的话图会毫无理由地自己跳。
- **吃到果实随机揭 9 格**(`APPLE_REVEAL`,`onAppleEaten` → `revealRandom`):揭图是本作核心爽点,从「一步一格」提到「一果九格」,整关时长与收集节奏大幅提速。走 `s.rand()` ⇒ 同种子可复现(AI 回归/快照续玩都依赖这条)。
- **特殊果永远在场**:开局即生成,吃掉**立刻补下一个**(`ensureSpecial`),**永不过期**——旧的「4~6 苹果刷一个 + 8s 过期」整套作废。⚠ `expiresAt` 保留字段但填 `Number.MAX_SAFE_INTEGER`:① render 的「快过期闪烁」判据因此永假;② **别改回 `Infinity`**——当局快照走 JSON,`Infinity` 会变 `null`,`null - now` 是负数 ⇒ 特殊果会一直闪。

## ⭐ 音效：连吃果子的上行音阶（2026-08-01 用户点名）

固定一个 `eat.wav` 听两百遍只剩噪音感。改成 **每连吃一颗升一级的上行音阶**：
`playEatTone()` + `eatTone(step)`（main.js）用 **WebAudio 实时合成**（本作零外部音源的老规矩，
同 `tools/gen-sfx.js`）—— 三角波主音 + 二倍频正弦泛音 + 音乐盒式指数衰减。

- **音阶 = 大调 7 音 × 3 个八度，20 级封顶后从头**（用户定；再高就刺耳）。大调 ⇒ 怎么连都协和。
- ⚠ **音高不能挂 `run.combo`**：core 的 combo **超时不清零**（只是不再自增），拿它当音高会
  一路只升不降。表现层自己数 `G.eatToneStep`（间隔超过 `Core.COMBO_WINDOW_MS` 就回 0），
  与玩家「连不上了」的听感一致。纯表现层，不进存档、不碰计分。
- WebAudio 不可用/被拦 ⇒ **回退原来的 `eat.wav`**，绝不静音。

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

- **浮层卡 `drawOverlay`**(暂停/死亡/过关共用):⛔ **按钮宽度别写死** —— 复活按钮加上「10 条命 + 30 秒无敌」之后，文字直接冲出那颗 180px 的药丸、📺 还落在按钮外面（实拍）。带奖励说明的按钮**拆两行**（大字说是什么、小字说给多少），卡片高度按真实按钮高度累加，卡片加投影浮起来。🏠 角标与星级带换成**共享 UI 图标**（引擎的 `makeUIArt`）。⚠ 包装函数必须叫 `uiArt` —— main.js 里已经有一个 DOM 版 `uiIcon`，重名会 `SyntaxError: Identifier 'uiIcon' has already been declared`、**整页白屏**（实踩）。
- **爽感 FX**(render.js `FX`/`fx*`,纯前端墙钟,不进 core/存档):吃果/连击/护盾/接流星 → 粒子迸发 + `+分`/`×连击` 飘字 + 震屏;过关 `fxCelebrate` = 流光扫过成图 + 星光 + 棋盘回弹(`fxBoardTransform` 围绕棋盘中心 scale+shake,结算浮层延迟 0.8s)。main tick 按 `run.events` 在蛇头坐标触发。
- **道具 sprite**(`itemSprite`/`preloadItems`,render.js):苹果+12 特殊果+流星的 emoji 换成本机 **Flux schnell** 生成的可爱贴纸(`assets/items/*.png`,256² 透明),sprite 优先、未加载回退 emoji/圆(零破坏)。管线 `tools/gen-items.cjs`(ComfyUI)+`cut-items.py`(transparent_background 抠图),改风格才重跑。
- **每日天使**(`claimDaily`,main.js):每天领一张未解锁天使进图鉴(按日期稳定选、防刷)+ 连续天数 `daily.giftStreak`;主界面 🎁 可领时金色脉动。streak 相邻天判定用 `Math.round(日差)`(夏令时安全,同 achievements)。
- **每关星级**(`gallery.stars{文件名:1-3}`,开放 map):★1 通关+★2 无死亡+★3 速通(<2min)或高连击(≥10)。结算浮层星级药丸(`drawOverlay` 的 `stars` 参)+ 图鉴缩略图下显星(渲染前 `st` 夹 0-3 防崩)。(注:去 AI 代打后 `aiRun` 恒 false,救场清关也算全星,原「AI 局只给 1★」已作废。)
- **奖励关**(`G.bonusLevel`):**每 10 关**一次(`run.level % 10 === 0`)2× 分(`scoreScale` 乘 2)+ 金色 HUD + 开局横幅。**不改盘面尺寸 → AI 保证不受影响**。⚠ 判据从 `imgPos%10===9` 改过来的 —— 图号 2026-08-01 起是随机的，再拿它当节奏就变成「10% 概率随机撞上」。
- **收集进度里程碑**(`homeProgressHTML`):主界面显 `X/500` + 下一皮肤还差多少(`nextSkinHint` 读 themes unlock)。
- **壁纸导出**(`Gallery.saveWallpaper`):图鉴 lightbox 一键存 1080×1920 竖版天使壁纸(粉彩渐变+柔光,Web Share 优先降级下载)。
- **无障碍减弱动态**(`computeReduceMotion`/`G.reduceMotion`):跟随系统 `prefers-reduced-motion`,主界面 ✨/🍃 可覆盖;`fxBurst`/`fxShake`/庆祝缩放/星光按它门控(飘字/流光保留)。持久化坑见存档节。
- **集齐庆祝**(`showSetComplete`)、奖励关横幅(`showBonusBanner`):`#toasts` 里的临时大横幅。
- **⭐ 全仓元游戏对齐(2026-07-31,照 `casual-game-meta` skill §9 接入顺序)**——四件新东西,全部纯逻辑可单测(`tests/test-quests.js`):
  - **插屏闸门下调**(`js/adgate.js`):**旧规则「每 2 关一插屏」是这个品类差评的头号来源**(一关 1-3 分钟 ⇒ 几分钟一个),改为全仓统一模型:**前 50 关零插屏 → 之后每 10 关至多 1 个 + 距上次 ≥2min**,且只在**过关后点「下一张」的转场**问(死亡/局中永不问)。新存档字段 `stats.lastAdAt`。

### snake 广告策略定稿(2026-08-01，一句话版)

| | 规则 |
|---|---|
| ⛔ **永远没广告** | AI 代打(免费开放) · 死亡瞬间/失败 · 局中任何时刻 · **前 50 关的一切插屏** |
| **插屏** | 第 51 关起、每 10 关至多 1 个、距上次 ≥2min,**只在过关后点「下一张」的转场** |
| **激励视频(全自愿,拒绝=什么也不发生)** | 见下表六个位 |

### 激励视频七个位(2026-08-01 二次加厚,用户要求「一定要丰厚」)

奖励数值集中在 `main.js` 的 `AD_REWARD` / `AD_CAPS` 两张表,改数值只动这两行。

| 位置 | 奖励 | 类别 | 额度 |
|---|---|---|---|
| **过关结算屏**(「下一张」下方) | **+3 张天使** | 收集 | 每关 1 次(`G.doubledThisLevel`) |
| 图鉴页 | **+8 张天使** | 收集 | 6 次/天(= 每天最多 +48 张) |
| 每日礼物弹窗 | **+5 张天使** | 收集 | 1 次/天(礼物本身每天一次) |
| **开局礼包**(READY 屏,🎁 与 AI 键并排) | **BOOST_POOL 里的有益增益全给** + **10 条命 + 30 秒无敌**(2026-08-01 用户拍板,取代原来的「随机 4 个」——满配比抽奖爽,也不用赌运气) | **局内增益** | 4 次/天 |
| **皮肤解锁**(皮肤面板顶部) | **永久解锁下一款未解锁皮肤**(写进 `save.skins`) | **外观** | 1 次/天 |
| **任务面板** | **直接完成一个今日任务**(含其 3 张奖励) | **任务进度** | 2 次/天 |
| **streak 补签**(每日礼物弹窗,仅断签当天出现) | 把 giftStreak 接回 `prev+1` | **习惯保护** | 恰好漏 1 天时 |
| 死亡后复活 | 复活 + **10 条命 + 30 秒无敌**（2026-08-01 用户加厚：「用户更开心」） | 救场 | 2 次/关 |

⛔ **复活的奖励必须写在按钮上、复活后再报一次**（`ads.revive` 带 `{n}/{s}` 参数 + `showReviveToast()` + HUD 常驻 `💖×n` / `😇秒`）——**看不见的奖励等于没给**。⚠ 数值只动 `AD_REWARD.reviveLives` / `reviveGhostSec`；「命」= `shield`（墙和身体都保）、「无敌」= `ghost`（**只穿身，墙照死**）—— 两个一起给才是真救场，只给无敌会撞墙照死。

**结算屏是全场转化最高的位置**(刚赢、庆祝动画刚放完),snake 之前竟然空着——这次补上是本批最大的一笔。

**每日任务本身也加厚了**(`quests.js`):单个任务 **3 张**(原 1 张)+ **三个全清额外 +6 张**(`ALLDONE_BONUS`,整天只发一次,`allDoneBonus()` 判定)⇒ 纯手动每天最多 15 张。

- ⛔ **绝不作为奖励发放**:星级 / 单局成就 `r_*` / 纪录——与 AI 免费那条边界同源(**放开进度,锁住「本事的证明」**)。皮肤是外观、不影响强度,所以可以卖。
- **额度是设计不是抠门**:奖励给厚了就必须有 `save.ads{day,gal,boost,quest,skin}` 每日额度,否则一天几十条广告能把 500 张图鉴刷穿、当天毕业,长线直接没了。额度跨天自动清零,UI 上明写「今日还剩 N 次」。
  ⚠ **跨天重置必须按 `AD_CAPS` 全量清**(`for (const k of Object.keys(AD_CAPS)) a[k]=0`)——手写清哪几个 key 必漏(`skin` 上限 1 ⇒ 漏了就是「一辈子只能广告解锁一款皮肤」,实锤 bug)。
- **拒绝广告 ⇒ 零发放且不扣额度**(`tests/e2e-rewards.js` 逐位钉死)。发放口统一在 `grantAngels(n)`,广告入口统一走 `dispatch('AD_*')`(便于冒烟直调)。
- ⛔ **奖励池里不许有空签**(`BOOST_POOL`):礼包原来从「全部果子」抽,能抽到 `scissors`(开局蛇长才 3,减身什么也没发生)和 `demon`(提速 50% 对刚开局是负面)——**看完广告局面一点没变,比不给还伤**。池子只放真增益,且 `splice` 抽取保证四个不重样(4 个同款远不如 4 种不同的爽)。`e2e-rewards` 里钉死了「池子不含 scissors/demon」+「局面确实变了」。
- **`save.skins` 与统计解锁条件并列**:`themes.themeUnlocked(key, save)` 满足任一即解锁。`skins` 是数组(闭合字段)⇒ 必须在 `defaults()` 里,否则 merge 丢(见存档两坑)。
- ⚠ **AI 改免费后原「看广告换救场」收入位没了** —— 上面六个位是补缺口,且全部落在**玩家主动打开收集/任务界面**或**正反馈时刻**,转化高于逼着看的位置。
  - **每日任务**(`js/quests.js`):日期串确定性生成 3 个轻任务(苹果/过关/揭格/特殊果/单局连击/零死亡),进度**挂既有 core 事件流**(`Ach.accumulate` 旁边),**完成即自动发奖不做「领取」按钮**;snake 无金币经济 ⇒ 奖励 = **直接解锁 1 张天使图**(与每日礼物同一种货币)。主界面 📋 显 x/3,面板带进度条。
  - **求好评**(`js/rate.js`,原生):只在**幸福时刻**问(满星通关 / 刚集齐一集),15 关门槛 + 90 天冷却 + 3 次/年,**调用即记账**(`save.rate.asked`)。
  - **推送提醒**(`js/notify.js`,原生):19:00 每日天使 + 21:30 streak 保护(仅当 giftStreak≥2 且今天没领);**领过就立刻撤掉那枪**(`claimDaily` 里 reschedule),绝不放空炮。默认关,主界面 🔔/🔕 开关(`settings.remind`)。
  - **统计页**(`openStats`):16 项既有计数器一屏摆出(沉没成本可视化)。
  - ⚠ 新存档字段全部按 storage.js 两条铁律加:`quests.prog` 是**开放 map ⇒ 空默认**;`settings.remind`/`stats.lastAdAt` 是**闭合对象新字段 ⇒ 必须进 defaults**。未 bump `SAVE_V`(纯增量字段,merge 自动补,老档无损)。
  - ⚠ 两个新原生插件(`in-app-review` / `local-notifications`)**要新二进制才生效**,web 端全静默 no-op。**1.0.1 正在审核中 ⇒ 这批随 1.0.2 出**(出包前先 bump package.json 到 1.0.2)。
- **10 语 UI**(`GAME_CONFIG.languages`=引擎十语默认集 zh-CN/en/es/hi/bn/pt-BR/ru/ja/pa/de):加语言=加 `locales/<code>.json`,零改逻辑。主界面 🌐 弹语言菜单(`openLangMenu`,10 语循环按钮太烂);顶栏引擎语言下拉被 `#home` 盖住,故主界面自带一个。App Store 语言栏(`CFBundleLocalizations`)由 codemagic **从 `GAME_CONFIG.languages` 动态注入**(自动映射 zh-Hans/pt-BR),不虚报。
- **意见反馈**(`js/feedback-client.js`,drop-in):`FB_CONFIG.app="angel-snake"` → 共享 hub `feedback.ai-speeds.com/api/feedback`(EC2 systemd `feedback-hub`,面板 `/admin`,**后端零改**)。表单已粉彩重样式 + 接 snake 的 `T()`/`I18N.lang`(内置中英随语言切,其余回退英文)。主界面 💬 入口,boot `Feedback.flushQueue()` 补发离线队列;诊断静默附版本/平台/语言/`__lastError`。改后端要单独 `systemctl restart feedback-hub`(见 app-ratings-feedback skill)。

## 视觉打磨(2026-08-01,「把页面做得生动好看些」批)

DOM 层的所有页面 + 游戏主画面的下半屏。**零玩法/经济改动**,断言全部沿用旧的。

- **⭐ 主界面 = 天国开场**(`SKY_DECO` 注入的 `.sky-deco` 四层,全部 `pointer-events:none`):
  ① `.sky` 晨曦金→天蓝→粉的天空 + 四团慢飘极光;② `.rays` 从天使背后放射的圣光光柱(conic + 径向 mask 羽化,90s 转一圈 + 7s 呼吸);③ `.fth` ×9 片飘落的羽毛(边转边飘,各自节奏错开);④ `.sea` ×3 层云海。
  再加:主视觉转动的 conic 光环 + 5.5s 起伏 · 标题渐变文字 · Play 按钮高光扫过 · 进度条百分比 + 流光 · 六个入口配彩色圆图标 + **数量角标**(空按钮不给人点进去的理由)。
  **五个踩过的坑,改这块前必读**:
  1. `.sky-deco` 必须 **`position: fixed`** 不是 absolute——`#home` 是滚动容器,absolute 子元素会跟着内容滚,云海会被卷走;
  2. `#home` 只能 `overflow-x: hidden`,写 `overflow: hidden` 会把矮屏的竖向滚动废掉;
  3. 羽毛的逐片参数用 **`nth-of-type`** 不是 `nth-child`——`.sky-deco` 里还有 `.sky`/`.rays`/`.sea` 三种 div,`nth-child` 会从它们开始数、九条规则全落空;羽毛大小改 `width/height`,别用 `transform:scale`(会被飘落动画的 transform 整个覆盖);
  4. **云的做法**:条带高 H、椭圆瓦片高 2H、`background-position: 0 top` ⇒ 只露上半个圆顶;而且**实底(`::after`)的顶边必须正好落在圆顶最宽处**(高 = 条带高 − 圆顶高)。瓦片过高 ⇒ 只截到椭圆中段=一条横白杠;对齐 bottom ⇒ 露下半圆、方向反了;实底偏高 ⇒ 从圆顶缝里露出直角块;没实底 ⇒ 圆顶的平切底边横穿整屏。三层还必须**上下交叠**,不然层间露天空 = 三条横带;
  5. 菜单卡/进度卡/底栏按钮必须是**半透明磨砂**(`rgba(255,255,255,.66~.74)` + `backdrop-filter: blur(10px)`)——实白卡片会把整片云海挡死,等于白画。
- **图鉴**:25 集从「一行字」改成 **缩略图 + 进度条 + 集齐转金 👑**。⚠ 封面必须取该集**已解锁**的第一张(拿未解锁的当封面=提前剧透);`loading=lazy decoding=async`(25 张 512² 同步解码会卡开面板那一下)。
- **成就**:顶部总进度 x/120 · 解锁行金卡 · 未解锁配细进度条。⚠ 进度条**放在 `.ach-item` 外面**——E2E 按 `.ach-item` 计数(必须恰好 100)。
- **皮肤**:五条色带 → **canvas 画的真盘面缩略预览**(`skinPreviewURL`,复用 `themes.js` 的 `texture(m,px,pc)` 契约)+ 锁定款的解锁进度条。揭开区用**中性暖色渐变**而不是主题色——底下的天使图不随皮肤变。
- **统计**:16 格按语义四色分组(收集/战绩/受挫/习惯)。⚠ 图标做**角标水印**不占行——这页的价值就是「一屏摆完」,每格加一行就要多滚两屏。
- **任务**:每个类型自己的图标(`Q_ICON`);任务行加 `.qrow` 类,否则会套上成就那套「灰掉」的锁定样式,图标全成灰的。
- **面板**:顶部粉彩色带 + 标题竖条 · 入场淡入/弹起 · 背景 `backdrop-filter: blur(4px)` · 粉色滚动条。
- **游戏主画面**:方形盘面在高屏必然留白 ⇒ `drawFooterArt()` 画主题化的**云海 + 星光**(确定性散列,禁 `Math.random`,不接 hit,`renderAll` 里最先画)。⚠ 渐变必须与填充矩形**同起点**,否则顶边已经 35% 不透明、横切出一道硬边。
- ⛔ **减弱动态**:`syncMotionClass()` 是 `G.reduceMotion`(canvas 侧)↔ `body.rm`(DOM 侧)的**唯一同步点**,`boot`/`toggleMotion` 都要调。CSS 兜底 `body.rm *,::before,::after { animation:none!important }` ⇒ **新加任何装饰动画自动被管住**,不会漏掉晕动症玩家。回归脚本见下。

**验收工具**:`node games/snake/tools/shot-ui.cjs` 一次截全部 9 个 DOM 界面到 `C:/tmp/snake/ui/`(自动造进度数据,空页看不出排版好坏)。改样式后跑它 + `tools/shot-notch.cjs`。

## UI 图标 —— ⛔ 用**全仓共享库**,不在 snake 下放第二份

emoji 是系统字体、每个平台长得都不一样,和游戏世界观也没关系。显眼位置全换成自制图标:
主界面六个入口 · 成就徽章两档(金翼星章 / 灰石章,120 行共用)· 每日任务六个类型 · 每日礼物 · 集齐皇冠。

**素材和 API 都在引擎层**(见 root `CLAUDE.md` 共用件表):`engine/assets/ui/*.webp` + `engine/ui-icons.js`。
snake 只是调用方:`index.html` 里加载 `engine/ui-icons.js`,`main.js` 的 `uiIcon(name, cls)` 是对 `UIIcon.img()` 的一层薄包装,`boot` 里 `await UIIcon.load()` 取回退 emoji 表。

```bash
node tools/gen-ui-icons.cjs [名字过滤]     # 仓库级生成器,已有成品自动跳过
node tools/check-ui-icons.cjs             # 全仓一致性(引用可解析 / manifest 齐 / 无第二份目录)
```

- **回退**:`UIIcon.img()` 生成的 `<img>` 把 **emoji 填进 `alt`**(取自共享库的 `manifest.json`)⇒ 图缺了浏览器直接显示 emoji,**零 JS 的天然回退**(同引擎 `makeArt` 的思路:换图不改码,丢图不白屏)。
- ⚠ **CSS 里不能 `url(../../engine/assets/ui/...)`**:css 文件在「网页版 `games/snake/css/`」和「iOS 包 `www/css/`」下相对 engine 的深度不一样,写死必错一边。集齐皇冠因此从 `::after{background:url()}` 改成 JS 渲一个 `<img class="crown">`。
- ⛔ **判据只有一个:缩到 34px 还认得出**。第一版三张全糊了(淡粉水晶柱几乎看不见 / 米色卷轴一团 / 画框里的天使只剩紫方块)——图标必须**主体色和背景拉开 + 剪影简单**,prompt 里写 `bold saturated colors` / `strong contrast` / `thick outline`。**验收要做「三尺寸对照表」**(192/62/34 并排,见 `C:/tmp/snake/ui-icons/sheet.py`),只看 1024 原图必定误判。
- ⚠ 未解锁成就**不要**给同一张图套 `filter: grayscale` —— 两档各生成一张(金/灰)才好看,套滤镜是一团脏灰。
- ⚠ 浅色贴纸风图标压在深色/彩色按钮上会糊成一团白 ⇒ 补 `drop-shadow` 脱开底色(每日礼物的金色按钮实踩)。
- ⚠ CSS 里要图标用 `background-image`,`content:'👑'` 塞不进图片资源(集齐皇冠)。
- **回归**:`tools/check-ui-icons.cjs`(仓库级,扫全部游戏)静态查「引用的图标名都在库里 / manifest 与文件一一对应 / 没有游戏私建第二份 `assets/ui/` / 单张 <40KB」。**名字拼错不会报错**(退回 emoji 而已),功能测试和 E2E 都抓不到,只能靠这条。已挂进 `npm test`(顺带把一直漏在外面的 `test-quests` 也补进 `test:snake` 了)。

## 商店截图 + ASO(1.0.2,39 语全套)

- **截图管线**：`tools/make-shots.cjs`(出图) + `tools/shot-caps.cjs`(39 语文案) + `tools/upload-shots.cjs`(传 ASC)。
  一条命令出 **39 locale × 2 槽位(iPhone 6.7" / iPad 12.9") × 8 张 = 624 张**，全部已上传 1.0.2 并回读校验。
  设计公式照 language-study 的 `store-screenshots` skill(大字标题+关键词渐变 · 真机边框 · 真实 UI 占主体 · 波浪缎带跨页连续 · 天使图裁圆贴纸)。
- ⚠ app UI 只有 10 语 ⇒ **8 套 raw**(en/zh-CN/ja/de/ru/hi/es/pt-BR) + 39 套本地化标题；其余 locale 用英文 UI 的 raw(苹果允许)。
- ⚠ 出图四坑(全在脚本注释里)：注入存档会连锁弹成就 toast(截图前净场) · 局中态要用**不存在的 phase** 冻结(否则手摆的蛇几帧后自撞死) · `run.dir` 是字符串键不是向量 · iPad 面板要按 **`#panel-card`** 裁边(`#panel` 是 inset:0 全屏遮罩，裁了等于没裁)。
- ⚠ 上传：**转 JPEG q88 再传**(PNG 全套 ≈1GB 传不完，实测 196MB/20 分钟传完 624 张)；上传器幂等(先删旧图)；⛔ 版本进 WAITING_FOR_REVIEW 后截图锁死 ⇒ **先传图后提审**。
- **ASO**(`docs/aso-1.0.2.cjs`)：⛔ 去掉关键词里的 `nokia`(en-US/id/ms/th/vi —— 活商标，拒审风险)；18 个 locale 的关键词字段补满(平均 97.1/100)；补齐 39 语**更新说明**与**促销文本**。全部 PATCH 后回读校验过。

## 项目状态(上架)

- **已上线 App Store**(`READY_FOR_SALE`)。ASC App「Snake Angel: Retro Arcade」Apple ID `6789757716`,bundle `com.aispeeds.angelsnake`。
- **1.0.1 已提交审核**(`WAITING_FOR_REVIEW`,2026-07-18):build#2(marketing 1.0.1)+ 39 语言商店页 + 10 语 UI(CFBundleLocalizations 自动注入)+ 本轮全部玩法/美术/反馈改良。releaseType=AFTER_APPROVAL(过审自动上架)。ASO 39 语文档 `C:\tmp\snake\aso-39-keywords.md`。
  - **⚠ 出更新版必踩(已在共享 codemagic 修好)**:Capacitor 工程 marketing 版本恒 1.0,`agvtool new-version` 只动 build 号 → 更新版 build **挂不上** ASC 目标版本。修法:codemagic 版本步 `plutil -replace CFBundleShortVersionString = 各游戏 package.json.version`。**上更新版先 bump 该游戏 package.json 到目标版本号**(与 ASC 版本一字不差),否则挂不上。
- AdMob(iOS):App ID `ca-app-pub-2141208066469648~2322595323`,激励 `/4457804077`、插屏 `/5188431812`(在 `index.html` GAME_CONFIG.adUnits + `codemagic.yaml` GAD_APP_ID)。**app-ads.txt 已在 `snake.ai-speeds.com` 根**(全 5 游戏同一份,见 root/admob skill)。
- 网页版 + 隐私页:`https://snake.ai-speeds.com/`(EC2)。tag 里程碑:`snake-p1-playable` → `p2a-fruits` → `p2b-achievements` → `p2c-gallery` → `p3a-ads`。
- **界面已 10 语**(zh-CN/en/es/hi/bn/pt-BR/ru/ja/pa/de);**意见反馈已接生产 hub**。
- **1.0.2 待出包**(2026-07-31 全仓元游戏对齐批,见上节):插屏闸门下调 + 每日任务 + 统计页 + 求好评 + 推送提醒。⚠ 出包前 bump package.json 到 `1.0.2`(与 ASC 版本一字不差,否则 build 挂不上)。
- 未做(候选):P3b 游戏门户铺量、Android 打包、BGM、静态分数榜(见 casual-game-meta §4.4)。

## 粘度层（2026-08-01，`js/meta.js` + 十语）

对齐 solitaire/blockblast 的元游戏件，**全部由既有计数器驱动，零新玩法、零新埋点**：

- **等级 / 称号 / XP 条**：`xp = stats.totalScore`（现成），六档称号（初翎→炽天使）。
  曲线锚在已校准的成就档上：1 万分 ≈ 13 级、500 万分 ≈ 34 级（单测钉住这两个区间）。
  主界面档案头 = 头像（最近解锁的天使）+ 称号 + Lv + XP 条。
- **天使榜**（零后端伪社交）：20 个**预设角色**按累计得分排名，你插在中间。
  ⛔ 文案红线：它们是**游戏角色**（唱诗班的天使），**绝不称「玩家」**（单测 + E2E 双钉）。
  进度**零存档** —— `beatenCount(totalScore)` 现算。分数按幂律铺：**前两档几关内必超**
  （即时爽点），尾档 300 万 ≤ 成就顶档 500 万（**榜尾必须可达**，不可达是坏设计）。
  ⚠ 打开榜要**自动滚到「你」那一行** —— 让人手动滚半屏找自己 = 把爽点藏起来（实拍抓出）。
- **连续奖励阶梯** 3/7/14/30 天（+3/+8/+15/+30 张天使）：单纯数天数没有动机，
  「熬到第 7 天有 8 张」才有。⛔ **补签必须把已领水位 `daily.rewarded` 一起恢复** ——
  只接回天数会让「故意断签 → 补签 → 次日重拿 7 天档」变成可复现的刷奖套路
  （blockblast code review 抓到过同款，单测 + E2E 各有一条回归钉死）。
- **「下一个目标」条**：主界面常驻一行，按优先级取最近的一个未完成奖励
  （今日任务 > 差 ≤2 天的连续档 > 差 ≤3 张的这一集 > 榜上够得着的下一位 > 升级）。
  零新系统，纯查询既有状态；点击直达对应面板。

⚠ **主界面加内容时的两个 flexbox 陷阱**（加完档案头/目标条实拍抓出）：
① flex 子元素默认 `flex-shrink:1` ⇒ 内容一多**主按钮被压扁**（看着像被下面那个按钮盖住）；
② `justify-content:center` 在溢出时把**顶部内容顶到滚动区之外**，怎么滚都看不到。
修法两行：`#home > *{flex-shrink:0}` + `#home{justify-content:safe center}`。
⚠ 新卡片的宽度必须写成和 `.home-prog` 一样的 `min(88vw,340px)`，否则三张卡三个宽度。

测试：`node games/snake/tests/test-meta.js`（12 组，已挂进 `npm test`）+
`npm run test:snake:meta`（DOM 接线 E2E）。
