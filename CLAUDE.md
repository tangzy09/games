# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

经典小游戏 × 肉鸽化 monorepo。**共享引擎 + 每游戏一个目录**，纯 canvas，无框架、无 bundler；唯一 npm 依赖是 devDependency 的 Playwright（测试用，`npm install` 即可）。线上：`mines.ai-speeds.com`（EC2 checkout `/var/www/games`）。

## 目录约定

- `engine/` 只放跨游戏引擎（契约见 `engine/README.md`，必读）；`tools/` 只放跨游戏工具（如 check-locales）。
- **游戏专属的一切**（代码/测试/工具/文档/CLAUDE.md）放 `games/<name>/` 下。各游戏细节看它自己的 `games/<name>/CLAUDE.md`。
- `games/_demo/` 是引擎契约的最小活样板，新游戏从它起步。

**各游戏成熟度差很多，动手前先看它自己的 CLAUDE.md/DESIGN.md**（游戏内的 `DESIGN.md` 是该游戏玩法/数值的**权威规格**，改核心前必查）：
| 目录 | 状态 |
|---|---|
| `minesweeper` | 已上线 + App Store 送审。完整。 |
| `snake` | **已上线 App Store**(Snake Angel: Retro Arcade)。完整 + 爽感 FX/每日天使/星级/奖励关/收集进度/本机 Flux 道具美术。**1.0.1 已过审上线（2026-08-01 itunes lookup 实证 v1.0.1）**；**1.0.2 待出包**，web 已上线四批：①全仓元游戏对齐(插屏闸门 2 关→前50关免/每10关、每日任务、统计页、求好评、推送)②**AI 代打免费开放 + 揭图提速 + 激励视频七个位**(结算屏/图鉴/每日礼物/开局礼包/皮肤/任务/复活,`AD_REWARD`+`AD_CAPS` 两张表即全部数值)③**页面视觉打磨**(主界面极光+光环、图鉴缩略图、皮肤真盘面预览、云海填高屏留白)④**粘度层 `js/meta.js`**(等级/称号 XP 条、**天使榜** 20 个预设角色、连续奖励阶梯 3/7/14/30、「下一个目标」条) + **UI 图标 engine 级共享库**⑤**天使图随机化**(主界面主视觉每次进来换一张、每关揭的图随机且优先未解锁) + **复活加厚到 10 条命 + 30 秒无敌**(按钮/toast/HUD 三处提示)。 |
| `abyssshoot` | **被 4.3(a) 拒审后整改中**（2026-07-22 改名「Fish Cannon: Deep Sea Merge」+ 盘面去数字化）。玩法/美术/图鉴/道具/广告全备，线上 <https://fishshoot.ai-speeds.com>。 |
| `blockblast` | **iOS 1.0 已上架（READY_FOR_SALE）**（ASC 名「Cube Blast: Block Puzzle」）。8×8 消除拼图；卖点是**预生成块流**（出块序列落子前就定死、种子可查）。**1.0.1 全量改良已上线 web、iOS 待出包**：30关3章/拼块水晶/天使画廊500张/天使榜/每日任务/连续奖励+补签/日历补玩/图鉴/16皮肤/统计/新广告模型（前50盘零插屏）/GC+推送+求好评+反馈（原生件）/**🏠 主界面**（天使 hero + 智能续继 + 六格角标入口）/**🗺 关卡地图瘦身成纯选关**（去掉与主界面重复的一切）/**结算卡**（胜负与无尽共用一张不透明卡）/**系统 emoji 换共享 UI 图标**/**主视觉每次随机**。线上 <https://blocks.ai-speeds.com>。 |
| `solitaire` | **iOS 1.0 已上架 READY_FOR_SALE（2026-07-23 过审）**（ASC 名「Fair Deal: Patience & Cards」，Apple ID 6790861224）。**web 已迭代六轮改良（v30），iOS 待出新包**。Klondike 可解池 + FreeCell 微软局号 + **Spider 蜘蛛纸牌** + 「这局还有解吗」证明器 + **难度明面阶梯 5 档** + **妙手 ✨/「我的弱点」页** + **求解器自动出题的互动教学 4 课** + **🏠 主界面** + **提示 = 通往胜利的下一步**（不再是启发式）+ **系统 emoji 全换共享可爱图标 · 对手头像换天使画像 · 结算卡 · 菜单瘦身 · 主视觉每次随机**。线上 <https://cards.ai-speeds.com>。⚠ 商店名**不含 solitaire**（品牌差异化），但 keywords 里有（公有品类，合规）。⚠ 措辞是死线：可解率是「透视暗牌」意义下的，绝不能说成「你一定能赢」（见其 CLAUDE.md）。 |
| `connect4` | **P1 求解器地基 + P2a 可玩本体 + P2b 手感与可读性 + P2c 家庭场景与模式 均已交付（2026-08-06）—— 🎮🎵👨‍👩‍👧 能玩、有手感、一家人能一起玩下去了**：人机/双人对局、按住预览松手才落、**加速下落+撞底微弹+随深度变调的落定音**（零外部素材合成）、**威胁高亮与双威胁光环**（零搜索判据）、赢局逐段揭示+1.2 秒结算、**减弱动态三态 + 舒适模式**、中英双语。**⭐ P2c 这一批**：**让子**（1-2 枚预置子恒归弱方 —— §6.7「让全家人一起玩下去的唯一办法」）· **儿童档**（第 3 级 + 让 2 子 + 孩子恒先手，`ai.js` 逐字未动）· **对坐模式**（⭐ 转的是 **HUD 不是棋盘**，我原来的规格被实现纠正）+ 猜先动画 · **双人局「对方同意才悔」**（`by = turnOf(g)^1` 指名道姓问对方，无弹窗）· **限时模式**（每手 10 秒、⛔ 默认关、超时由时钟代落且**可重放**：`timeoutMove` 是 (盘面,seed,手数) 的纯函数、⛔ 一行不读时钟；⭐ 加了两道零搜索护栏「有连四就连 / 绝不主动送对方连四」—— 规格原文的「纯随机」会专门制造「它把我赢定的棋扔了」这类最毒差评；儿童档不给表且**不静默**）。**⭐ P3 这一批（2026-08-06）**：**分层提示**（第一按只说「有几列不输」不剧透 / 第二按给列 + 四条**机械导出**的理由；⛔ 永远免费、不限次数、零广告）· **✨ 妙手**（只有 1 列不输而你找到了 —— 判据与提示**同源**，⛔ 不另立一套）· **赛后复盘页**（胜负曲线画的是**胜负态**不是 score 原值 · 转折点 ·［从这一步重来］）· **精准度进结算屏 + 最高纪录**（⛔ 限时局与时钟代落的手不计入）。⭐ 地基是**边打边算** `js/analysis.js`：每落一手就在 Worker 空闲时算真值 ⇒ **终局那一刻已算完 100%**，而点击到落子中位仍 **21 ms**。**⭐ P4 课程系统 + P5 元游戏/变现（2026-08-06）**：§5 那三个自动化机制全落地 ——
**自动出题**（九个概念全部筛得出真题，门禁用真求解器验过）· **自动判分**（⛔ 判据复用 review.js
⇒ 课程/提示/妙手/复盘不可能对不上）· ⭐ **诊断推课**（四类失误标签 → 「下一个目标」→「我的弱点」页）；
元游戏有等级/称号 · **双口径统计**（零提示胜率才是拿去炫的）· 十条成就 · 三档星级 · 每日任务；
§8 变现闸门（**前 50 盘零插屏** · ⛔ **输局永不出** · 激励位里没有 hint/review/undo/lesson）。
⚠ **还差**：**一张美术图都没有** ⇒ iOS 壳（icon/splash）与商店素材做不了，**上架未起**；
元游戏还差每日一题/连关/棋手榜/棋谱卡/原生三件套（照 casual-game-meta 抄的量）。⭐ 卖点已立住：**完美求解器通过 Allis 1988 外部真值门禁**（空盘七列 `−3 −1 0 +2 0 −1 −3`，取胜手数逐列对上），空盘查库 25 ms。20 级明面 AI 阶梯 + 公平承诺写进 `aiMove(position,tier,seed)` 签名并由**跨进程指纹**守住。剩 P1b(Pop Out) / P2(可玩本体) / P3(提示复盘) / P4(课程) / P5(元游戏变现)。⛔ 商标红线：`Connect 4` 是孩之宝活商标，**一个字都不许进任何面向用户的地方**（泛型词是 `Four in a Row`）；红黄圆片+蓝框是其 trade dress。**动手前必读其 `DESIGN.md` §0 与 §11b**。 |
| `bouncerogue` | **设计 v2 定稿（2026-07-18），零代码，下一个动工目标**。市场调研后骨架从实时 paddle 改为**竖屏回合制瞄准发射**（Ballz/Holedown 形态 × 合球化学 × 规则卡 × 种子可查），调研全文见其 `RESEARCH.md`。动工从 P1 走 writing-plans。 |

## 常用命令

```bash
npm test                  # 全量单测（改 engine/ 后必跑）；单游戏：npm run test:mines / test:snake / test:abyss
npm run test:mines:e2e    # E2E 单独跑，⚠ 不在 npm test 里（另有 test:abyss:e2e）
npx http-server -p 8080   # 本地跑游戏：必须 http（locale 走 fetch，file:// 白屏）
node tools/check-locales.js games/<name>/locales
```

**新游戏必须把自己的 `test:<name>` 挂进 `package.json` 的 `test`**，否则它的测试永远不会被跑到（`npm test` 是手写的串联，不是自动发现）。

## 数值靠模拟校准，不靠拍脑袋（本仓惯例）

涉及随机性/难度/经济的数值（掉率、发牌、分数曲线、平衡），**先写一个 node 蒙特卡洛脚本跑几千局，用数据定值**，脚本留在 `games/<name>/tools/` 当回归基线——abyssshoot 的 P1 平衡、blockblast 的整份设计都是这么定的（后者靠模拟证伪了两个想当然的核心机制）。这类脚本同时是「改了核心逻辑有没有把手感搞坏」的回归工具。

## 引擎契约（速记）

全局脚本按序加载共享命名空间，无模块。游戏提供单一可变状态 `G` + `renderAll()`（每帧 `clearHits()` 重画全屏并 `addHit()` 可点区域）+ `dispatch(action, data)`。`GAME_CONFIG.id` 决定存储键前缀。

## 跨游戏共用件（加留存/收集系统前先看这张表 + `casual-game-meta` skill）

**元游戏打法（广告节奏/收集三层曲线/每日任务/streak 补签/静态分数榜/伪社交）全部沉淀在全局 skill `casual-game-meta`**，三款上线产品验证过——**别重新发明，也别重新踩坑**。

| 共用件 | 位置 | 复用方式 |
|---|---|---|
| **天使图鉴素材 501 张（25MB）** | `games/snake/assets/angels/` + `manifest.json` | ⛔ **绝不再拷第二份**：web 走相对路径 `../snake/assets/angels/`，iOS 出包走 package.json 的 `wwwExtras`（照 `games/solitaire` 抄）。⚠ blockblast 已踩：又拷了 24MB 进自己目录，待去重。<br>⭐ **用法上的三条**（三款都这么做了）：主界面主视觉**每次进来从已解锁的里随机抽一张**（固定一张 = 静态海报；⚠ 只在「进入」时抽一次并缓存，renderHome 每帧都跑，每帧重抽会闪）；一局一张的收集品（snake 的揭图）**随机发且优先未解锁**（⚠ 顺手查有没有别的机制搭在序号上 —— snake 的奖励关原判 `imgPos%10`，图号一随机就成了 10% 随机撞上，改挂关数）；**伪社交榜的对手头像也用这批画像**，一眼看出是游戏角色不是真人。 |
| 引擎美术回退 | `engine/canvas.js` 的 `makeArt(dir,ids)` / `drawArtIcon` | 缺图自动回退矢量/emoji ⇒ **零改码换图**；生成素材见 `comfyui-flux-local` |
| 十语 i18n | `engine/i18n.js` 默认集 + 各游戏 `locales/*.json` | 加语言 = **纯加 json**；`node tools/check-locales.js games/<name>/locales` 必 0 fail |
| 广告闸门 / 激励视频 | 各游戏 `js/shop.js`（未抽取） | 参数与红线见 skill §1；blockblast 是最简闸门的参考实现 |
| **粘度层（等级/称号 · 静态榜 · 连续奖励阶梯 · 「下一个目标」）** | `games/snake/js/meta.js`、`blockblast/js/ghosts.js`、solitaire 的 `main.js`（levelOf/tourField） | **三份实现了 ⇒ 下一个游戏要接时先抽进 `engine/`**（drag.js 的老规矩）。三份的共同形状：**只吃既有计数器**（累计分/连续天数/收集数），**进度零存档**（榜位由分数现算）。⛔ 两条红线：静态榜的角色**必须明示是游戏角色、绝不称「玩家」**（伪造真人）；**补签必须把连续奖励的已领水位一起恢复**，否则「故意断签→补签」可无限刷奖（两处都写成了单测）。 |
| **分享（链接指向 App Store）** | `engine/share.js` + 各游戏 `GAME_CONFIG.appStoreId`/`webUrl` | ⛔ **分享出去的链接一律指向 App Store，绝不是网页版**（2026-08-01 用户定，全游戏适用）——网页版不产生下载/评分/排名。⚠ 商店链接**带不了 seed** ⇒ 局号/种子必须写进**文案**（只换链接 = 把「同一局」的玩法价值悄悄删了）。没上架的游戏别填 `appStoreId`，会自动回退网页链接。红线测试 `npm run test:share` |
| 原生三件套（推送/求好评/反馈） | `games/blockblast/js/{notify,rate,feedback}.js`、`games/snake/js/{notify,rate}.js` | **三个文件都是 game-agnostic**（只依赖 `T()`/`CFG`/`Platform`），复制即用；反馈后端是共享 hub `feedback.ai-speeds.com`（CORS `*`，任何域可直连）。⚠ 已有**两份**实现 ⇒ **下一个游戏要接时先抽进 `engine/`**（drag.js 的老规矩：第三个用例出现才抽） |
| 插屏闸门 / 每日任务 | `blockblast/js/{shop,quests}.js`、`snake/js/{adgate,quests}.js` | 同一套模型的两份实现（盘数计数口径不同：blockblast 按盘、snake 按关）；参数与红线见 `casual-game-meta` §1/§5.7 |
| **激励视频七个位 + 每日额度** | `snake/js/main.js` 的 `AD_CAPS`/`AD_REWARD`/`adQuotaLeft` + `tests/e2e-rewards.js` | snake 是最全的参考实现（结算屏/图鉴/每日礼物/开局礼包/皮肤/任务/复活）。⚠ 抄的时候连**冒烟一起抄**：额度失效＝长线收集当天被刷穿、线上收不回来。跨天重置必须按 `AD_CAPS` 全量清（手写清 key 必漏）。奖励池要**显式白名单**，别 `filter(排除两个)`。详见 `casual-game-meta` §1 |
| **⭐ 共享 UI 图标库（44 张位图 + 8 个 SVG 字形）** | `engine/assets/ui/*.webp` + `manifest.json` + `engine/ui-icons.js`（DOM）/ `makeUIArt()`（canvas） | 星星/奖杯/金币/宝石/爱心/火苗/锁/日历/时钟/分享/反馈/语言/激励视频/商店/设置/提示/信息/铃铛开关/声音开关/关闭/对勾/加号/奖章/画框/调色盘/图表/书/礼盒/皇冠… **每个游戏都要的那批**。<br>**DOM 游戏**：index.html 加 `<script src="../../engine/ui-icons.js?v=N">` → `UIIcon.img('star')`（回退 emoji 自动从 manifest 取）；样式 `.uic/.uic.inl/.uic.fill` 在 `engine.css`。<br>**canvas 游戏**（blockblast / solitaire 两个参考实现，两款的系统 emoji 已全量替换）：`engine/canvas.js` 的 **`makeUIArt(['star','lock',…])`** —— 同 `makeArt` 的 `{load,get}` 形状，配 `drawArtIcon(UI,id,emoji,…)` 缺图回退 emoji。⚠ 实拍两坑：**浅色贴纸图标压在半透明白按钮上会糊**（底色改深）、**图标与文字必须分开量宽**（把 emoji 拼进字符串靠 `measureText` 猜位置，换成图标后必然叠字）。<br>⛔ **绝不在 `games/*/assets/ui/` 再放一份**（`tools/check-ui-icons.cjs` 会拦，已挂进 `npm test`）。<br>⚠ 路径是**运行时**从 engine 脚本标签反推的（网页 `../../engine/` vs iOS 包 `engine/`）⇒ **CSS 里不能写 `url()`**，要图标就用 JS 渲 `<img>`。缺图自动显示 emoji。<br>⛔ **方向性/几何字形（back/forward/play/pause/menu/undo/redo/restart/unlock）不是图片，是 `UIIcon.GLYPHS` 的内联 SVG** —— 扩散模型画不了这类（两轮实锤：prompt 里的 "LEFT" 被写在图上、restart 没箭头、unlock 和 lock 一模一样）。SVG 跟着 `currentColor` 走，任意尺寸清晰。<br>加新图标：`node tools/gen-ui-icons.cjs`（已有的自动跳过）→ `tools/cut-ui-icons.py`（抠透明 + 出**三尺寸对照表**，34px 认不出的重做）。<br>**44 张**（2026-08-01 为 solitaire 补了 search/eye/cards）；两款 canvas 游戏（blockblast·solitaire）已全量替换系统 emoji。 |
| **元游戏页面视觉打磨** | DOM 侧：`snake/css/game.css` + `snake/tools/shot-ui.cjs`；**canvas 侧：`blockblast/js/render.js`**（`renderMenu`/`settleCard`/`drawRows`/`uiIcon`）、`solitaire/js/render.js`（`page(title,icon)`/`iconText`/`drawAvatar`）+ 各自的 `tools/shot-ui.cjs` | 入口数量角标 / 收集列表带缩略图 / 皮肤画真盘面预览 / 统计图标做水印 / 方形盘面高屏留白画装饰 / `body.rm` 兜底关掉全部 CSS 动画。清单见 `casual-game-meta` §6.2；`shot-ui.cjs` 是「一次截全部界面 + 先注入有进度的存档」的验收模板，其它游戏照抄（canvas 版还会直接把 `G.s` 摆成结算态、每屏跑两种视口）。<br>⛔ **做完 🏠 主界面必须回头把二级页的重复入口删干净**（blockblast 2026-08-01：HOME 和关卡地图各有一份每日/无尽/成就/皮肤/设置 —— 地图因此还是「像设置页」）。二级页只做一件事，**所有子页面的返回键直接回 HOME**。<br>⛔ **canvas 的结算浮层必须画在不透明卡上**：`drawDim()` + 按 `SH*0.32` 摆文字挡不住盘面，彩块从按钮缝里透出来一片花；胜/负/无尽**共用同一张卡**。<br>⚠ 卡底必须**全不透明**（0.97 的 alpha 在白牌面上肉眼可见）；流式内容量不出高度时，用**上一帧量到的高度**（solitaire 的 `winCardH`，首帧退回估计值，差一帧无感）。<br>⭐ **伪社交榜的对手头像用收集品画像**（solitaire 把 👩🏻/🦊 换成天使画像）：既统一世界观，又一眼看出是**游戏角色不是真人**。 |

**各游戏留存件覆盖（2026-08-01 实测）**：**blockblast / snake / solitaire 三款全套 ✅**（三者都有：主界面门面 · 每日 + streak + 补签 · 每日任务 · 收集图鉴 500 · 成就 · 统计 · 皮肤 · 静态榜/锦标赛 · 等级称号 · 激励视频多位 + 每日额度 · 原生三件套）；solitaire 另有品类独有的**求解器教练**（教学/我的弱点/通往胜利的提示）。⛔ **minesweeper / abyssshoot 仍几乎为零且只有 2 语 —— 现在它俩是全仓 ROI 最高的缺口**（元游戏层是 game-agnostic 的，照 §9 的接入顺序搬即可）。

## 语言策略（所有游戏一律如此，第一版就要照办）

**新游戏首发只做 `en` + `zh-CN` 两语，但代码从第一行起就必须是「零硬编码文案」** —— 全部走 `T('key')` + `locales/<lang>.json`。后续加语言是**纯加 json 文件、零改代码**（`GAME_CONFIG.languages` 加一项即可，不加则用引擎的十语默认集）。

- **绝不允许**「先把中英文写死在代码里、以后再抽出来」——抽文案是一次全量返工，而且必漏（canvas 里散落的字符串没有编译期检查）。
- `locales/<lang>.json` **必须是嵌套结构**（`{"game":{"score":"分数"}}`）；扁平写法 `{"game.score":"…"}` 查不到、满屏 key 原文且**零报错**，`check-locales` 也查不出来（snake 实踩）。
- `en.json` 是基准（key 的真相来源），`node tools/check-locales.js games/<name>/locales` 必须 0 fail。
- canvas 上**所有非定长文案**过 `wrapLines`/`txtLWrap`——canvas 不自动换行，德/俄文案会静默溢出。
- 商店页文案（ASO）是另一回事，与界面 i18n 不共用，见 `appstore-listing` skill。

## 部署（手动，绝不自动）

```bash
git push origin main
ssh -i /c/Users/tangz/Documents/credentials/ec2_1.pem ec2-user@3.26.95.240 "sudo git -C /var/www/games pull"
```

⛔ **部署前必须先问用户、拿到明确同意才执行（2026-07-31 用户定的，适用于所有游戏）**：
`git commit` / `git push` **不用问**；但把代码放到线上（EC2 pull、nginx 改配置等一切影响
线上站点的动作）**必须先停下来问**。准备到位后报状态、等用户说部署。

## ⛔ 刘海/灵动岛适配（所有游戏，2026-07-31 用户定的铁律）

**任何机型的顶部内容都不许被刘海/灵动岛/状态栏压住。** 引擎已做好地基，游戏侧只需守两条：

1. **canvas 内容一律从 `GameGlobal.safeTop` 起算**，⛔ 禁止写死 y 坐标（`y=46`）或纯比例
   （`SH*0.145`）——灵动岛机型 safeTop=**59**（iPhone X 类 44/47/48），写死必被压。
   `safeTop = max(44, env(safe-area-inset-top))`，`initCanvas()` 每次 resize 重测。
2. **右上角是禁区**：引擎 DOM 控制栏（`#controls`，语言下拉）fixed 在 `safeTop+8`、高
   `GameGlobal.ctrlH`(34)。canvas 在那一带画的东西会被盖住**且点不动**（solitaire 的
   「✓ 有解」角标、abyssshoot 的 Deepest/Coins 都实踩过）⇒ 右上要放东西，y 从
   `safeTop + ctrlH + 8` 起，或整块左移。

**验收工具（改顶部布局后必跑）**：`node tools/shot-notch.cjs` —— 模拟 iPhone 15 Pro
（safeTop=59，同时注入 `--sat` 让 DOM 顶栏也进入模拟），五个游戏各截一张、顶部叠红色
灵动岛区，**红带里不该有任何内容**。产物 `C:/tmp/notch-check/*.png`。

**两条部署铁律**：
1. **改任何 js/css 必须 bump 缓存版本**：该游戏 index.html 里所有 `?v=N` 统一 +1。忘了 = 老玩家拿到新旧混装的 JS。
2. **改 `G` 的形状必须 bump `SAVE_VERSION`**：旧存档一律丢弃不迁移，否则老玩家「恢复」成畸形状态（0×0 盘面 = 无报错白屏，新档案的 E2E 测不出来）。

## iOS 壳（Capacitor → Codemagic → TestFlight）

流水线是共享模板，游戏只带自己的配置：

- 每游戏自备三样：`games/<name>/package.json`（Cap6 依赖，抄 minesweeper）、`capacitor.config.json`（appId/appName）、`resources/`（icon.png 1024 直角方图 + splash.png 2732）。
- `tools/build-www.cjs`：在游戏目录 `npm run build`，把 engine+游戏组装成 `www/`（webDir，路径自动重写+自校验）。`www/ ios/ android/` 均 gitignore，云端新鲜生成。
- `codemagic.yaml`：iOS 流水线全在 `&ios_*` 模板里，新游戏加一段 workflow 填 4 个 vars（GAME_DIR/BUNDLE_ID/APP_STORE_APP_ID/GAD_APP_ID）即可，文件头有完整清单。
- 上架顺序：API 注册 Bundle ID（`com.aispeeds.*`）→ ASC UI 建 App 记录（唯一手工步）→ 回填 APP_STORE_APP_ID → 触发构建。细节见 `~/.claude/skills/{capacitor-ios-codemagic,appstore-listing}`。

## 本仓库的协作坑（都真实发生过）

- **多个 Claude 会话并行共用本仓**。提交只 `git add` 精确路径，**禁止 `git add -A`**（曾把别会话的未提交文件夹带进提交）。改 `engine/` 或根级文件（package.json、本文件）前先 `git status` 看别的会话有没有未提交改动，改前先读当前内容（input.js 曾因替换旧版内容被贴进孤儿代码）。
- ⚠ **「从 git 干净版本重建文件」会踩掉别会话刚做的改动**（2026-07-31 实锤）：某会话为修编码损坏
  把 `blockblast/index.html` 从旧提交重建，**把另一会话刚 bump 的 `?v=21` 打回 `?v=20`**，
  结果线上同一页面 10 行 v=20 + 19 行 v=21 **新旧 JS 混装**（其中就有刚改过刘海适配的 `engine/canvas.js`，
  老玩家命中旧缓存 = 修了等于没修）。**重建/回滚任何文件前先 `git log -3 -- <file>` 看最近有没有别人的改动**；
  改完 `grep -o "?v=[0-9]*" <file> | sort -u` **必须只有一个值**。混装的修法是**统一提到比现存最大值更高**的号
  （不能取回原值——命中过高版本的浏览器不会再拉）。
- 用脚本批量改代码时，**替换后必须 grep 验证生效**——`str.replace` 没匹配不报错，本仓已静默失败四次。
  更稳的做法：python 脚本里对每个替换 `assert old in s`（不匹配直接炸，而不是静默跳过）。
- **⛔ 绝不用 PowerShell 读写含中文/emoji 的源文件（本仓几乎全是）**——`(Get-Content x.html -Raw) -replace ... | Set-Content -Encoding utf8` 这条看似人畜无害的「bump `?v=N`」写法，**会把整个文件的非 ASCII 毁掉**：PS 5.1 的 `Get-Content` 对**无 BOM 的 UTF-8** 按系统 ANSI 码页解码，再按 UTF-8 写回 ⇒ `✕` 变 `âœ•`、中文注释全成乱码。**2026-07-31 咬了两次**：snake 的面板关闭按钮变成用户可见的 `âœ•`；blockblast 带着损坏注释连发了 9 个提交上线。
  **改文件一律用 Write/Edit 工具，或写成 `.cjs` 用 node 跑**（`fs.readFileSync/writeFileSync(...,'utf8')` 无此问题）。
  **体检**：`node scan-moji.cjs` 式的全仓扫描（正则 `â€|âœ|ï¼|ã€|å¤|è¯`），批量改文件后跑一次；已坏的从 git 干净版本重建、别试图「就地反解」（PS 的映射不可逆，latin1 round-trip 会产出替换字符）。
  ⚠ **扫描要排除 `*.md`**：本条目自己就引用了那些坏字符当样例 ⇒ 扫全仓时 `CLAUDE.md` 必然命中，
  每次都要白查一轮。只扫 `games/*/js/*.js`、`games/*/*.html`、`engine/*.js`、`css` 这些**源码**。
- **别用 shell heredoc 写含反斜杠/引号的代码**：`'C:\tmp'` 里的 `\t` 会被吃成 tab（真实踩过），
  引号也会和 bash 打架。用 Write 工具写文件，或写成 `.py` 再 `python` 执行。
- **Monte-Carlo / solver 是本仓的数值真值源**：拍脑袋的数值一律先用模拟器验（`games/*/tools/sim*.js`）。
  已多次推翻自己的设计（blockblast 的两个机制、solitaire 的措辞）。
- **有外部地面真值时，必须拿它验**（不能自我确认）：solitaire 的 FreeCell 用微软 #11982
  （32000 局里唯一无解的那局）验发牌+规则，一次抓出「solver 提速 437×」的深层 bug。
