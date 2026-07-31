# Cube Blast — 商店页实际值（2026-07-13 提交审核时的真实内容）

> 这份是**实际写进 ASC 的值**，不是草稿。改商店页前先看它，别凭记忆重写。

## 标识

| 项 | 值 |
|---|---|
| ASC 名称 | **Cube Blast: Block Puzzle** |
| Apple ID | `6790598746` |
| Bundle ID | `com.aispeeds.cubeblast`（bundleId 资源 id `32NH3RYJZ2`） |
| 桌面图标名（`capacitor.config.appName`） | `Cube Blast`（短，不截断） |
| SKU | `cubeblast` |
| AdMob App ID | `ca-app-pub-2141208066469648~6813744374` |
| AdMob 激励 | `ca-app-pub-2141208066469648/1692445484` |
| AdMob 插屏 | `ca-app-pub-2141208066469648/1094976854` |
| 隐私政策 | <https://blocks.ai-speeds.com/privacy.html> |
| 支持 URL | <https://blocks.ai-speeds.com/> |
| 类别 | GAMES / Puzzle + Casual |
| 定价 | 免费（baseTerritory USA → 自动铺全球） |
| Copyright | `2026 Zhongyuan Tang` |

## 命名理由（别"优化"回去）

- ⛔ *Block Blast!* 是 Hungry Studio 的商标 + 爆款。名称里 **block 与 blast 分属不同短语、被冒号隔开**（`Cube Blast` + `Block Puzzle`），不构成商标的字面组合。
- ASO：克隆泛滥的品类**别抢大词**。这个名字一口气吃下 `cube blast` / `block puzzle` / `block blast puzzle` 等长尾组合，而不是去排 `block puzzle` 的头部。
- 名称/副标题/关键词**三处零重复**（苹果索引取并集，重复=浪费额度）。

## 文案（en-US）

- **name**: `Cube Blast: Block Puzzle`（24/30）
- **subtitle**: `Brick Puzzle & Daily Blocks`（27/30）
- **keywords**（91/100）: `sweep,tetris,tile,grid,offline,brain,relax,classic,logic,gem,crystal,fit,drag,jigsaw,teaser`
- **promotionalText**: The pieces are decided before you start. Check the seed yourself — no rigged blocks, ever.
- **description 首段**（答案式，吃 AI 引用）: Cube Blast is an 8x8 block puzzle where the whole sequence of pieces is decided BEFORE you place anything — and you can check it yourself.

## 文案（zh-Hans）

- **name**: `方块爆破：消除拼图`（18/30，CJK 按 2 算）
- **subtitle**: `公平出块 · 每日谜题 · 离线玩`（28/30）
- **keywords**（84/100）: `消除,拼图,俄罗斯方块,益智,休闲,离线,单机,烧脑,放松,经典,格子,水晶,连击,横扫,每日挑战`
- **promotionalText**: 出块顺序在你落第一子前就定死了。种子游戏里能查——没有暗箱，从来没有。

## 截图（24 张）

`tools/capture-shots.cjs` 抓**线上真站**（不合成、不美化），iPhone 6.7"(1290×2796) + iPad 13"(2048×2732) × en-US/zh-Hans × 6 张。

顺序即展示顺序：

1. **公平页** ← ⚠ 第一张固定是它。审核员 30 秒试玩只会看到「又一个 block puzzle」，**差异化必须在这一屏 5 秒说清**（对抗 App Store 4.3(a)）。
2. 玩法（拖拽中 + 整行高亮「松手就消」）
3. SWEEP 大招（粒子 + COMBO ×4.0）
4. 关卡（水晶目标 + 石块）
5. 关卡地图 + 每日/成就/皮肤入口
6. 每日谜题

## 审核备注（提交时写的）

> No account or login required. Everything is playable immediately from the main menu.
> The differentiator is verifiable fairness: the entire piece sequence of a run is generated from a seed before the first move and never reads the player state. Tap "Fairness" on the main menu to see the three promises and the current run seed.
> Ads: rewarded videos are always player-initiated (piece refresh / undo / coins). Interstitials appear only after completing a level, at most once every 3 wins, never during play and never after a failure. A one-time IAP removes all interstitials.

## 分级问卷

全 NONE + **`advertising: true`**（有广告）+ 赌博全 false + **`kidsAgeBand: null`**。
⛔ **含广告的 app「儿童类别」永远选 NO** —— 选 YES 触发儿童隐私规则（禁第三方广告 + 禁 IDFA），AdMob 三样全占 → 必被拒。

## App Privacy（UI-only，API 已被苹果下线）

AdMob 官方披露口径：勾 **Device ID**（Identifiers）、**Advertising Data** + **Product Interaction**（Usage Data）、**Coarse Location**（Location）、**Crash Data** + **Performance Data**（Diagnostics）。
**关联身份全 No**（无账号系统，属实）；**「用于追踪」只有 Device ID 和 Advertising Data 是 Yes**。填完必须 **Publish**。

## 下一版要做

- **T1+T2 全语言商店页**（代码里十语 UI 已有，缺的只是商店页文案）。每多一种语言 = 那个国家 App Store 里一份独立的 100 字关键词索引位 = 最大的免费自然流量。
- `CFBundleLocalizations`：商品页「语言」栏只读**二进制**里的这个 key，不看商店页本地化。Capacitor 用 JS 切语言、包里没有 `.lproj` → 苹果默认只写「英语」。下次出包时在 CI 里 `plutil -replace CFBundleLocalizations` 补上真实十语。

## 1.0.1 iOS 侧资产（2026-07-31 已程序化建好，全部幂等可重跑）

| 资产 | 值 | 状态 |
|---|---|---|
| IAP（非消耗型 $2.99） | productId `cubeblast_noads`，ASC id `6796603142`，en+zh 本地化、baseTerritory=USA 定价、175 区 availability、审核截图 | **READY_TO_SUBMIT**（⚠ 首个非消耗型必须随版：出包后用 `reviewSubmissionItems` 带 `inAppPurchaseVersion` 与 1.0.1 同车） |
| Game Center | bundleId 已加 GAME_CENTER 能力；榜 `cubeblast.endless.best` / `cubeblast.daily.best`（BEST_SCORE/DESC/INTEGER，en+zh 名） | 已建；CI 用 `tools/ios-extra.sh` 注入 entitlement（⚠ 首次出包盯一下这步的 `恰好 2 处` 校验） |
| 代码 | `js/iap.js`（RevenueCat，web 回退本地开关）+ `js/gc.js`（登录/提交/展示全静默兜底）+ 商店页 Restore 按钮 + 设置页排行榜入口 | 已接线，E2E 全绿 |
| CFBundleLocalizations | codemagic 共享模板已从 `GAME_CONFIG.languages` 动态注入（十语） | 无需操作 |

**⚠ 出包前唯一的手工步（RevenueCat dashboard，约 5 分钟——skill 铁律：app config 只能 dashboard 建）**：
1. dashboard 新建 project「cubeblast」→ **New app configuration** → App Store，bundle `com.aispeeds.cubeblast`，上传 In-App Purchase Key（`Documents/credentials/SubscriptionKey_4N977536WH.p8` + 其 Key ID + Issuer `f723569b-…`）；
2. 之后全 API：建 entitlement `noads` → 建 product `cubeblast_noads`(type one_time) → attach 到 entitlement 和 default offering 的 `$rc_lifetime` 包 → `GET .../public_api_keys` 取 `appl_` key 填 `index.html` 的 `GAME_CONFIG.rc.ios`（⚠ 别手抄，坑⑦b）。
   没配 RC 也能出包：`rc.ios` 为空 ⇒ IAP 不初始化、购买走 web 回退（= 1.0 行为），但那样收入漏洞仍在，**强烈建议配完再出**。

## 1.0.1 出包素材（2026-07-30 改良已上线 web，见 DESIGN §9.1；⚠ 出包/提交前必经批准）

**What's New（en-US 草稿）**：

> • Run stats at game over: longest streak, sweeps, and how close you came to your best
> • Every endless run now earns coins — double them with an optional ad
> • Two new skins: Neon Night & Sakura (buy with coins)
> • Challenge a friend: share your seed — they get the exact same pieces
> • Instant celebration the moment you break your record

**What's New（zh-Hans 草稿）**：

> • 结算页全新升级：最长连击、清扫次数、距最高分差距一目了然
> • 无尽模式也产金币，可看广告翻倍（去广告用户直接双倍）
> • 新增两套皮肤：霓虹之夜 & 樱花（金币购买）
> • 挑战好友：分享种子链接，对方拿到一模一样的方块
> • 破纪录瞬间即时庆祝

**⚠ 审核备注必须同步更新**（上面 1.0 的备注写「Interstitials appear only after completing a level」，1.0.1 不再准确——照旧提交等于对审核员撒谎）。1.0.1 版草稿：

> Ads: rewarded videos are always player-initiated (piece refresh / undo / coins / double-coins). Interstitials appear only after completing a level, or in the transition after the player taps "Play Again" following an endless run — never during play, never covering a game-over or failure screen, at most one per 3 wins/runs with a 2-minute minimum spacing, and none in the first 24 hours after install. A one-time IAP removes all interstitials.
