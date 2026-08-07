# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

经典小游戏 × 肉鸽化 monorepo。**共享引擎 + 每游戏一个目录**，纯 canvas，无框架、无 bundler；唯一 npm 依赖是 devDependency 的 Playwright（测试用，`npm install` 即可）。线上：**七个站**（mines/snake/fishshoot/blocks/cards/four 等，EC2 checkout `/var/www/games`，每游戏一个子域名 + 各自的 nginx server 块）。

## 目录约定

- `engine/` 只放跨游戏引擎（契约见 `engine/README.md`，必读）；`tools/` 只放跨游戏工具（如 check-locales）。
- **游戏专属的一切**（代码/测试/工具/文档/CLAUDE.md）放 `games/<name>/` 下。各游戏细节看它自己的 `games/<name>/CLAUDE.md`。
- `games/_demo/` 是引擎契约的最小活样板，新游戏从它起步。

**各游戏成熟度差很多，动手前先看它自己的 CLAUDE.md/DESIGN.md**（游戏内的 `DESIGN.md` 是该游戏玩法/数值的**权威规格**，改核心前必查）：
| 目录 | 状态 |
|---|---|
| `minesweeper` | 已上线 web；**iOS 1.0 自 2026-07-10 起卡在 `WAITING_FOR_REVIEW`（⚠ 已 25 天没动，见下面「审核卡住」一节）**。完整。 |
| `snake` | **已上线 App Store**(Snake Angel: Retro Arcade)。完整 + 爽感 FX/每日天使/星级/奖励关/收集进度/本机 Flux 道具美术。**1.0.1 已过审上线**；**⭐ 1.0.2 已提交审核（2026-08-02，`WAITING_FOR_REVIEW`，过审自动上架）—— 带 624 张截图（39 语 × 手机/iPad × 8）+ 英文预览片 + 39 语 ASO**，web 已上线四批：①全仓元游戏对齐(插屏闸门 2 关→前50关免/每10关、每日任务、统计页、求好评、推送)②**AI 代打免费开放 + 揭图提速 + 激励视频七个位**(结算屏/图鉴/每日礼物/开局礼包/皮肤/任务/复活,`AD_REWARD`+`AD_CAPS` 两张表即全部数值)③**页面视觉打磨**(主界面极光+光环、图鉴缩略图、皮肤真盘面预览、云海填高屏留白)④**粘度层 `js/meta.js`**(等级/称号 XP 条、**天使榜** 20 个预设角色、连续奖励阶梯 3/7/14/30、「下一个目标」条) + **UI 图标 engine 级共享库**⑤**天使图随机化**(主界面主视觉每次进来换一张、每关揭的图随机且优先未解锁) + **复活加厚到 10 条命 + 30 秒无敌**(按钮/toast/HUD 三处提示)。 |
| `abyssshoot` | **整改后已重新提交，1.0 自 2026-07-23 起 `WAITING_FOR_REVIEW`（⚠ 已 12 天没动，见下面「审核卡住」一节）**（2026-07-22 因 4.3(a) 拒审后改名「Fish Cannon: Deep Sea Merge」+ 盘面去数字化）。玩法/美术/图鉴/道具/广告全备，线上 <https://fishshoot.ai-speeds.com>。 |
| `blockblast` | **iOS 1.0 / 1.0.1 均已上架 READY_FOR_SALE**（1.0.1 带 624 张截图（39 语 × 手机/iPad × 8）+ 英文预览片 + 39 语 ASO）。**⭐ 2026-08-04 爽感批（web 已提交、未部署；iOS 下个包 1.0.2）**：⚡ 快速放置加分（**纯增益**，慢了不扣分、每日/挑战不给 —— 同种子分数必须可比）· 消行特效按条数递增（冲击波环 0→4 个是档位差最直观的一维）· 清屏特效三档（perfect 独享全屏闪）· 过关画面可爱化（天使祝贺 + 星星逐颗弹出 + 彩色纸屑）。（ASC 名「Cube Blast: Block Puzzle」）。8×8 消除拼图；卖点是**预生成块流**（出块序列落子前就定死、种子可查）。**2026-08-02 门面批（✅ web 已上线，线上冒烟过：300 关/30 章/par 全覆盖/送方块不动块流）**：主界面 canvas 天国装饰（极光/圣光/云海/星光）· **关卡提成和 ▶ 同等大的主按钮** · **30 关 → 300 关 / 30 章**（生成器程序化铺关 + `npm run fix:levels` 自动收敛通关率门禁 + 标定 par）· **🧱 看广告送方块**（接下来 2 手全是 1×1，⛔ 不动块流 ⇒ 公平承诺不变）· 音效重做（6 → 12 个音 + 离线渲染验收）。**2026-08-01 教练批**：`js/coach.js` 把验关卡的求解器搬进运行时 ⇒ **提示 / 死亡复盘「第 N 手换个位置还能再走 X 步」/ 妙手 / 我的弱点页**（公平承诺不变，单测钉死块流不受影响）；激励视频 **4 位 → 8 位 + `AD_CAPS` 每日额度**（原来「看广告领币」零 cap 可无限刷）；金币出口扩容（+4 款高价皮肤，共 20 套）；等级称号 XP 条（抽出 `engine/meta.js`）；**天使画像去重 -26MB**（走 `engine/angels.js`）；5 种水晶形状双编码。**1.0.1 的内容（已随 1.0.1 上架）**：30关3章/拼块水晶/天使画廊500张/天使榜/每日任务/连续奖励+补签/日历补玩/图鉴/16皮肤/统计/新广告模型（前50盘零插屏）/GC+推送+求好评+反馈（原生件）/**🏠 主界面**（天使 hero + 智能续继 + 六格角标入口）/**🗺 关卡地图瘦身成纯选关**（去掉与主界面重复的一切）/**结算卡**（胜负与无尽共用一张不透明卡）/**系统 emoji 换共享 UI 图标**/**主视觉每次随机**。线上 <https://blocks.ai-speeds.com>。 |
| `solitaire` | **iOS 1.0 / 1.0.1 均已上架 READY_FOR_SALE**（ASC 名「Fair Deal: Patience & Cards」，Apple ID 6790861224）。**⭐ 1.0.2 已提交审核（2026-08-04，`WAITING_FOR_REVIEW`，过审自动上架）—— 内容：关掉底部横幅 + 横幅遮挡修复 + 激励视频加厚且全部带广告标识 + 返回键统一左上角；截图沿用不重截**。1.0.1 这一批：**三种玩法主界面直选**（旧的「一个 chip 轮转 + 二元标签」在三态上必然撒谎）· **蜘蛛提示改成向胜利走**（`solver-spider.js` 残局全解 / 推进搜索两档，后者一律标 GUESS）· **蜘蛛赢局不出结算屏 + FreeCell 分数恒 0 两个真 bug**（core.apply 对这两种玩法提前 return，够不着末尾的统一置位）· **32 款新牌背/桌布**（12 矢量可爱 + 10 Flux 可爱插画 + 8 暗调粉彩桌布，**开局送 10 款且老玩家补发**）· **蜘蛛/FreeCell 关键音效**（凑组/发一排/进自由格）· **iPad 牌宽 96→124 + 高屏明牌间距自适应**。Klondike 可解池 + FreeCell 微软局号 + **Spider 蜘蛛纸牌** + 「这局还有解吗」证明器 + **难度明面阶梯 5 档** + **妙手 ✨/「我的弱点」页** + **求解器自动出题的互动教学 4 课** + **🏠 主界面** + **提示 = 通往胜利的下一步**（不再是启发式）+ **系统 emoji 全换共享可爱图标 · 对手头像换天使画像 · 结算卡 · 菜单瘦身 · 主视觉每次随机**。线上 <https://cards.ai-speeds.com>。⚠ 商店名**不含 solitaire**（品牌差异化），但 keywords 里有（公有品类，合规）。⚠ 措辞是死线：可解率是「透视暗牌」意义下的，绝不能说成「你一定能赢」（见其 CLAUDE.md）。 |
| `connect4` | **✅ 已上线 web <https://four.ai-speeds.com>（2026-08-07）—— P1~P5 全部交付**。⛔ **iOS 出包/上架未起**（图标 splash 已就绪，差 ASC 建 App 记录 + codemagic workflow + 商店截图 ASO）。**P1 求解器地基 + P2a 可玩本体 + P2b 手感与可读性 + P2c 家庭场景与模式**：人机/双人对局、按住预览松手才落、**加速下落+撞底微弹+随深度变调的落定音**（零外部素材合成）、**威胁高亮与双威胁光环**（零搜索判据）、赢局逐段揭示+1.2 秒结算、**减弱动态三态 + 舒适模式**、中英双语。**⭐ P2c 这一批**：**让子**（1-2 枚预置子恒归弱方 —— §6.7「让全家人一起玩下去的唯一办法」）· **儿童档**（第 3 级 + 让 2 子 + 孩子恒先手，`ai.js` 逐字未动）· **对坐模式**（⭐ 转的是 **HUD 不是棋盘**，我原来的规格被实现纠正）+ 猜先动画 · **双人局「对方同意才悔」**（`by = turnOf(g)^1` 指名道姓问对方，无弹窗）· **限时模式**（每手 10 秒、⛔ 默认关、超时由时钟代落且**可重放**：`timeoutMove` 是 (盘面,seed,手数) 的纯函数、⛔ 一行不读时钟；⭐ 加了两道零搜索护栏「有连四就连 / 绝不主动送对方连四」—— 规格原文的「纯随机」会专门制造「它把我赢定的棋扔了」这类最毒差评；儿童档不给表且**不静默**）。**⭐ P3 这一批（2026-08-06）**：**分层提示**（第一按只说「有几列不输」不剧透 / 第二按给列 + 四条**机械导出**的理由；⛔ 永远免费、不限次数、零广告）· **✨ 妙手**（只有 1 列不输而你找到了 —— 判据与提示**同源**，⛔ 不另立一套）· **赛后复盘页**（胜负曲线画的是**胜负态**不是 score 原值 · 转折点 ·［从这一步重来］）· **精准度进结算屏 + 最高纪录**（⛔ 限时局与时钟代落的手不计入）。⭐ 地基是**边打边算** `js/analysis.js`：每落一手就在 Worker 空闲时算真值 ⇒ **终局那一刻已算完 100%**，而点击到落子中位仍 **21 ms**。**⭐ P4 课程系统 + P5 元游戏/变现（2026-08-06）**：§5 那三个自动化机制全落地 —— **16 课全部由求解器自动出题**（题面从真实局面里挑、答案与判分同源，`verify-lessons.js` 每课随机 200 题必须题题有唯一解）· **「我的弱点」页**（诊断标签全是**零搜索**判据）· **等级/称号/成就/每日任务/统计**（走 `engine/meta.js`）。变现：**⛔ 提示/复盘/悔棋/课程永远免费零广告**（写成断言）· 前 50 盘零插屏 · **⛔ 输局永不出插屏** · 激励视频四个位全给收集品与装饰。**⭐ 2026-08-07 code review 批（已上线，`?v=15`）**：修了 11 条，其中两个是用户已经能碰到的 —— **儿童档/让子局/限时局完全不记统计**（孩子打 100 局统计页全空）、**限时模式时钟被提示永久冻结**。⚠⚠ 前者的教训值一读：第一版只把 `recordAccuracy()` **内部**拆成「先无条件记账、再按条件记精准度」，**函数本身却进不去** —— 它只挂在 `C4Analysis.onIdle` 上，而让子/儿童档把边打边算**整个关掉**⇒ 永远不「忙」⇒ onIdle 一次都不响。真修法是 `checkOver()` 里也调一次（`G.accRecorded` 去重），并把插屏挂起到 `markOverReady()` 免得盖在庆祝上。**单测够不着它**（两个函数各自都对，错的是调用链）⇒ 新增端到端门禁 **`npm run test:c4:stats`**（四种局各打完一整局看 `games` 增量），它**支持 `--base=<线上域名>` 直接打线上**，本次部署就是拿它在真站点上验的。**⭐ 2026-08-07 试玩批（`?v=16`）**：用户报「教程里有时候点了没反应」——写了 `tools/play-probe.cjs` 真鼠标玩一遍，当场量出 **16 课里 12 课永远停在「正在出题…」**。根因在 `analysis.js` 的 `fireIdle()`：它把**回调之前**那张忙闲快照写回 `wasBusy`，而教程的 onIdle 回调里恰恰**会再排一道题** ⇒ 新排的活被记成「不忙」⇒ 它算完时 `wasBusy` 已 false ⇒ **onIdle 再也不响**（⚠ 此时 `progress()` 是 done=total，进度/日志/截图**全都看不出来**）。同批：**零搜索预筛 `ctxPreOk()`** 让第 5/12 课从「问求解器 40 次 · 13 秒 · 最后还收下一道不合概念的题」变成「4 次 · 92 ms」；**教程盘上玩家点的那枚子从来没画出来过**（判据写的 `who === null`，而空格返回的是 **-1**）；**整屏没有任何地方说你执哪一色**（第 1 课「一步取胜」不知道颜色根本没法答）；教程盘改用 `C4Render.drawPiece`（六边形/圆环双编码，原来自己画两个一样的圆 ⇒ 恰恰在教学屏丢了双编码）；出题的伪随机同 meta.js 那处溢出（已换 `Math.imul`）。新门禁 **`npm run test:c4:lessons`**（16 课都点得动 + 交付的题满足 `matches`，**已做反证**）。另按用户要求加 **`AI_MIN_MS = 500`** 电脑最短思考时间（⚠ 是**下限**不是叠加延时）。 |
| `bouncerogue` | **设计 v2 定稿（2026-07-18），零代码，下一个动工目标**。市场调研后骨架从实时 paddle 改为**竖屏回合制瞄准发射**（Ballz/Holedown 形态 × 合球化学 × 规则卡 × 种子可查），调研全文见其 `RESEARCH.md`。动工从 P1 走 writing-plans。 |

## ⚠ 审核卡住：两个 app 长期停在 WAITING_FOR_REVIEW（2026-08-04 查出）

⚠ **不只是这个仓的游戏 —— 整个开发者账号有 4 个 app 卡着**（`node tools/asc-apps.cjs` 查出）：

| app | 已等 |
|---|---|
| **Dungeon Sweep**（本仓 minesweeper）1.0 | **24 天** |
| **Fish Cannon**（本仓 abyssshoot）1.0 | **12 天** |
| Mando: Learn Chinese 1.0.2（另一个项目） | 7 天 |
| Wordwing: Learn English 1.0.1（另一个项目） | 7 天 |

⭐ **跨了两个不相干的项目 ⇒ 更像账号级的事**（协议未签 / 税务银行信息过期 / 账号被人工复核），
而不是某个 app 的内容问题。同期 solitaire 1.0.2、blockblast 1.0.1、snake 1.0.2 都在**几天内**
拿到结果 ⇒ 也不是「苹果最近整体慢」。
已确认**不是没提交成功**：`reviewSubmissions` 的状态就是 `WAITING_FOR_REVIEW` 且带 `submittedDate`。

**API 查不出原因**（被拒会变 `REJECTED`/`UNRESOLVED_ISSUES`，这两个都没有）⇒
**要人去 ASC 后台看 Resolution Center 有没有审核员的消息**（苹果索要补充信息时，
版本状态不变、只在后台发消息，API 侧完全看不出来）。

一键复查所有 app 的真实状态：

```bash
node tools/asc-apps.cjs        # 列出账号下每个 app 的版本状态 + 提交单等了多久
```

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
| **天使图鉴素材 501 张（25MB）** | `games/snake/assets/angels/` + `manifest.json`；**代码走 `engine/angels.js`** | ⛔ **绝不再拷第二份**：web 走相对路径 `../snake/assets/angels/`，iOS 出包走 package.json 的 `wwwExtras`。**`engine/angels.js` 是共享实现**（load/total/fileAt/img + LRU + 两端 base 运行时切换），blockblast 已接；solitaire 的 `js/angels.js` 是它的前身、下次动它时迁过来。✅ blockblast 那份 26MB 拷贝已于 2026-08-01 删除。<br>⚠ **换到共享素材 = 换了一批文件名和顺序**（snake 是 hash 名 + manifest 洗牌，不是 `a001..a500`）⇒ 只存计数的存档不会坏，但老玩家「我收集的图」会换脸，接的时候要认这一点。<br>⛔ **接完必须去 nginx 加一条 alias**，否则线上图鉴全空而本地全绿（见「部署」节，blockblast 部署当场踩）。<br>⭐ **用法上的三条**（三款都这么做了）：主界面主视觉**每次进来从已解锁的里随机抽一张**（固定一张 = 静态海报；⚠ 只在「进入」时抽一次并缓存，renderHome 每帧都跑，每帧重抽会闪）；一局一张的收集品（snake 的揭图）**随机发且优先未解锁**（⚠ 顺手查有没有别的机制搭在序号上 —— snake 的奖励关原判 `imgPos%10`，图号一随机就成了 10% 随机撞上，改挂关数）；**伪社交榜的对手头像也用这批画像**，一眼看出是游戏角色不是真人。 |
| 引擎美术回退 | `engine/canvas.js` 的 `makeArt(dir,ids)` / `drawArtIcon` | 缺图自动回退矢量/emoji ⇒ **零改码换图**；生成素材见 `comfyui-flux-local` |
| 十语 i18n | `engine/i18n.js` 默认集 + 各游戏 `locales/*.json` | 加语言 = **纯加 json**；`node tools/check-locales.js games/<name>/locales` 必 0 fail |
| 广告闸门 / 激励视频 | 各游戏 `js/shop.js`（未抽取） | 参数与红线见 skill §1；blockblast 是最简闸门的参考实现 |
| **底部横幅的预留高度** | `engine/ads.js` 的 **`Ads.bannerReserve()` / `Ads.onBannerSize`**（solitaire 是唯一接了横幅的） | ⛔ **绝不写死常数**（2026-08-03 用户实机报「下方广告占据了游戏显示」）：`ADAPTIVE_BANNER` 高度按**设备屏高**分档（≤400:32 / ≤720:50 / **>720:90**），插件又把它约束在 `safeAreaLayoutGuide.bottom` ⇒ 底下还压着 home indicator 的 34 ⇒ **真机实吃 ~124px**，而当时预留的是 56。**插件不 resize webview**，只是盖上去，全靠布局让位。真值来自 `bannerAdSizeChanged` 事件（没填充回报 0 ⇒ 不留白），**异步到达 ⇒ 必须在 `onBannerSize` 里重排重画**。<br>⚠ 第二半更隐蔽：横幅**常驻**（showBanner 一次就一直在）⇒ **菜单/图鉴等二级页也要让位**；它们的底部「‹ 返回」按裸 `SH - 70` 定位，被整颗盖住、点不动（反证实测 16 屏中招）。⇒ 布局导出一个**内容底边**（solitaire 的 `L.botY`），底部元素一律用它。<br>**验收**：`games/solitaire/tools/shot-banner.cjs` —— 三视口逐页**扫描预留带内有没有可点区**（`hitTest` 采样），有一个即 FAIL；比目检硬，也比截图更早发现「按钮点不动」。 |
| **等级 / 称号 / XP 条** | **`engine/meta.js`**（已抽） | `levelOf/titleKey/levelProgress(xp, base, ratio)`，纯函数、零存档。游戏侧只给两样：一个 xp 数（由**既有计数器**折算，如 blockblast 的 `Achievements.xpOf`）+ locales 里的 6 个称号 `rank.t1..t6`。blockblast 已接；snake 的 `js/meta.js` / solitaire 的 `levelOf` 是同一条曲线的前身，下次动它们时迁过来。 |
| **粘度层的其余部分（静态榜 · 连续奖励阶梯 · 「下一个目标」）** | `games/snake/js/meta.js`、`blockblast/js/ghosts.js`、solitaire 的 `main.js`（tourField） | **三份实现了 ⇒ 下一个游戏要接时先抽进 `engine/`**（drag.js 的老规矩）。三份的共同形状：**只吃既有计数器**（累计分/连续天数/收集数），**进度零存档**（榜位由分数现算）。⛔ 两条红线：静态榜的角色**必须明示是游戏角色、绝不称「玩家」**（伪造真人）；**补签必须把连续奖励的已领水位一起恢复**，否则「故意断签→补签」可无限刷奖（两处都写成了单测）。 |
| **分享（链接指向 App Store）** | `engine/share.js` + 各游戏 `GAME_CONFIG.appStoreId`/`webUrl` | ⛔ **分享出去的链接一律指向 App Store，绝不是网页版**（2026-08-01 用户定，全游戏适用）——网页版不产生下载/评分/排名。⚠ 商店链接**带不了 seed** ⇒ 局号/种子必须写进**文案**（只换链接 = 把「同一局」的玩法价值悄悄删了）。没上架的游戏别填 `appStoreId`，会自动回退网页链接。红线测试 `npm run test:share` |
| 原生三件套（推送/求好评/反馈） | `games/blockblast/js/{notify,rate,feedback}.js`、`games/snake/js/{notify,rate}.js` | **三个文件都是 game-agnostic**（只依赖 `T()`/`CFG`/`Platform`），复制即用；反馈后端是共享 hub `feedback.ai-speeds.com`（CORS `*`，任何域可直连）。⚠ 已有**两份**实现 ⇒ **下一个游戏要接时先抽进 `engine/`**（drag.js 的老规矩：第三个用例出现才抽） |
| 插屏闸门 / 每日任务 | `blockblast/js/{shop,quests}.js`、`snake/js/{adgate,quests}.js` | 同一套模型的两份实现（盘数计数口径不同：blockblast 按盘、snake 按关）；参数与红线见 `casual-game-meta` §1/§5.7 |
| **激励视频七个位 + 每日额度** | `snake/js/main.js` 的 `AD_CAPS`/`AD_REWARD`/`adQuotaLeft` + `tests/e2e-rewards.js` | snake 是最全的参考实现（结算屏/图鉴/每日礼物/开局礼包/皮肤/任务/复活）。⚠ 抄的时候连**冒烟一起抄**：额度失效＝长线收集当天被刷穿、线上收不回来。跨天重置必须按 `AD_CAPS` 全量清（手写清 key 必漏）。奖励池要**显式白名单**，别 `filter(排除两个)`。详见 `casual-game-meta` §1 |
| **⭐ 共享 UI 图标库（44 张位图 + 8 个 SVG 字形）** | `engine/assets/ui/*.webp` + `manifest.json` + `engine/ui-icons.js`（DOM）/ `makeUIArt()`（canvas） | 星星/奖杯/金币/宝石/爱心/火苗/锁/日历/时钟/分享/反馈/语言/激励视频/商店/设置/提示/信息/铃铛开关/声音开关/关闭/对勾/加号/奖章/画框/调色盘/图表/书/礼盒/皇冠… **每个游戏都要的那批**。<br>**DOM 游戏**：index.html 加 `<script src="../../engine/ui-icons.js?v=N">` → `UIIcon.img('star')`（回退 emoji 自动从 manifest 取）；样式 `.uic/.uic.inl/.uic.fill` 在 `engine.css`。<br>**canvas 游戏**（blockblast / solitaire 两个参考实现，两款的系统 emoji 已全量替换）：`engine/canvas.js` 的 **`makeUIArt(['star','lock',…])`** —— 同 `makeArt` 的 `{load,get}` 形状，配 `drawArtIcon(UI,id,emoji,…)` 缺图回退 emoji。⚠ 实拍两坑：**浅色贴纸图标压在半透明白按钮上会糊**（底色改深）、**图标与文字必须分开量宽**（把 emoji 拼进字符串靠 `measureText` 猜位置，换成图标后必然叠字）。<br>⛔ **绝不在 `games/*/assets/ui/` 再放一份**（`tools/check-ui-icons.cjs` 会拦，已挂进 `npm test`）。<br>⚠ 路径是**运行时**从 engine 脚本标签反推的（网页 `../../engine/` vs iOS 包 `engine/`）⇒ **CSS 里不能写 `url()`**，要图标就用 JS 渲 `<img>`。缺图自动显示 emoji。<br>⛔ **方向性/几何字形（back/forward/play/pause/menu/undo/redo/restart/unlock）不是图片，是 `UIIcon.GLYPHS` 的内联 SVG** —— 扩散模型画不了这类（两轮实锤：prompt 里的 "LEFT" 被写在图上、restart 没箭头、unlock 和 lock 一模一样）。SVG 跟着 `currentColor` 走，任意尺寸清晰。<br>加新图标：`node tools/gen-ui-icons.cjs`（已有的自动跳过）→ `tools/cut-ui-icons.py`（抠透明 + 出**三尺寸对照表**，34px 认不出的重做）。<br>**44 张**（2026-08-01 为 solitaire 补了 search/eye/cards）；两款 canvas 游戏（blockblast·solitaire）已全量替换系统 emoji。 |
| **⭐ 商店素材工厂（截图 + ASO + 预览片）** | `games/snake/tools/{make-shots,shot-caps,upload-shots}.cjs` · `games/snake/docs/aso-1.0.2.cjs` · `games/snake/tools/preview/`（`capture`/`mux`/`music`/`upload-preview`） | snake 1.0.2 一次跑出 **39 locale × 2 槽位 × 8 张 = 624 张**并全部上传回读，另加 39 语关键词/更新说明/促销文本 + 一条 886×1920/24s 预览片。**下一个游戏要出商店素材直接抄这套**（换 `CAPS` 文案表和摆状态的注入脚本即可）。<br>⚠ **raw 图按 UI 语言出（8 套）、文案按 locale 出（39 套）** —— app UI 只有 10 语，别为了凑 39 套 raw 去机翻界面；两遍法：pass1 跑浏览器出 raw（贵），pass2 纯合成叠文案（便宜）。<br>⛔ **转 JPEG q88 再传**：PNG 全套 ≈1GB 传不完，JPEG 196MB / 20 分钟传完 624 张。<br>⛔ 预览片**音轨必须立体声**（mono 被苹果转码拒 `MOV_RESAVE_STEREO`，四 locale 全拒实锤）；**先传素材后提审**（版本进 `WAITING_FOR_REVIEW` 后截图/预览片全锁死，删改 409）。<br>⚠ 摆状态四坑：注入存档会连锁弹 toast（截图前净场）· 局中态要用**不存在的 phase** 冻结（真实运行态几帧后自己演坏）· 手摆字段照真实类型写 · iPad 裁 `#panel-card` 不是 `#panel`。 |
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

⛔ **接了共享天使画像的游戏，nginx 里必须补一条 alias**（2026-08-01 实锤，blockblast 部署当场踩）：
每个游戏是**独立子域名 + 各自的 `root`**，所以代码里的相对路径 `../snake/assets/angels/` 会解析成
`https://<本游戏域名>/snake/assets/angels/…` —— 不加 alias 就落进 `try_files … /index.html`，
**返回 200 + 一份 HTML**（`r.json()` 静默抛 ⇒ 图鉴全空，`curl -o /dev/null -w '%{http_code}'` 还骗你说 200）。
每个游戏的 server 块加一行（照 solitaire）：

```nginx
location /snake/assets/angels/ { alias /var/www/games/games/snake/assets/angels/; }
```

**验收看内容不看状态码**：`curl -s https://<域名>/snake/assets/angels/manifest.json | head -c 40` 必须是 JSON。
⚠ 改 conf 别用 `sed` 拼 `&`/`#`（分隔符与替换符都会咬）——先 `cp` 备份、用 `python3` 精确插入、
`nginx -t` 通过再 `systemctl reload`（`-t` 失败时旧配置仍在跑，是安全网）。

⛔ **部署前必须先问用户、拿到明确同意才执行（2026-07-31 用户定的，适用于所有游戏）**：
`git commit` / `git push` **不用问**；但把代码放到线上（EC2 pull、nginx 改配置等一切影响
线上站点的动作）**必须先停下来问**。准备到位后报状态、等用户说部署。

## ⛔ 字体大小必须可调（所有游戏，2026-08-04 用户定）

**每个游戏都要能调字体大小，新游戏也一样。** —— 已经做成**引擎级**的，新游戏零成本继承：

| 层 | 在哪 | 怎么做到的 |
|---|---|---|
| canvas 文字 | `engine/canvas.js` 的 `sfont()` | `txt/txtL/txtR/txtLWrap` 是全仓画字的**唯一出口** ⇒ 在那里把 font 串的 px 乘 `GameGlobal.fontScale`（三档 1 / 1.15 / 1.3），一处改动全仓生效 |
| DOM 文字 | `engine.css` 的 `zoom: var(--eng-font-k)` | snake 的主界面 `#home`、snake/abyss 的 `#panel-card` 都是 DOM，**只做 canvas 那半边它们会「看起来没反应」** |
| 入口 | `engine/controls.js`（右上顶栏 `A / A⁺ / A⁺⁺`） | 就是那条**所有游戏共用**的顶栏，连**没有设置页**的 minesweeper/abyssshoot 也照样有 |

- 存储键 `engine.fontScale` **跨游戏共用**：调一次，所有游戏都变。
- 十语文案**内置在 controls.js**，不依赖各游戏 locale（要 5 游戏 × 10 locale 各加 key 才显示得出来
  是本末倒置，而且新游戏必忘）。
- ⚠ **新游戏唯一要注意的**：别绕开 `txt/txtL/txtR` 直接 `ctx.font = '12px …'` + `fillText`，
  那样的字不会被缩放。
- ⛔ 上限只到 **1.3**：canvas 不自动换行，再大就撑破布局。
- **验收**：`node tools/shot-fontscale.cjs`（六游戏 × 三档 + 断言存得住）。
  ⛔ **「大字有没有撑破布局」机器判不了，必须逐张看图** —— 它一次抓出两个真 bug：
  minesweeper 主页两个并排按钮**宽度写死 92** ⇒ 大号档文字互相压（已改成按实际文字宽度自适应）；
  snake 主界面横向溢出 —— `zoom` 会把宽度一起放大，补偿容器宽度之后**子元素的 `vw` 又不随容器变**
  （vw 永远是视口宽度）⇒ `#home` 内部的 `vw` 全部改成了 `%`。

## ⛔ 返回键一律在左上角（所有游戏，2026-08-03 用户定）

**任何「返回上一层」的按钮都画在屏幕左上角，位置与样式全仓统一。新游戏第一版就这么做。**

- 位置：`x = 游戏区左边 + 8`、**`y = GameGlobal.safeTop + 4`**，约 `62×34` 圆角，内容 `‹ 返回`。
  ⛔ y 必须从 `safeTop` 起算（刘海/灵动岛），别写死。
- 每个游戏抽**一个** `backBtn()`，所有二级页共用；页面标题仍可居中，但要**给左上角让出宽度**
  （长语言的标题会压上去）。
- **为什么不是底部**：底部是**广告横幅 + 工具条 + home indicator** 的地盘 —— solitaire 的二级页
  返回键就被真横幅**整颗盖住、点都点不动**（2026-08-03 实锤，反证脚本三视口下 16 屏中招）。
- **为什么不是右上**：那是引擎 DOM 控制栏（`#controls` 语言下拉，fixed 在 `safeTop+8`、高 `ctrlH`）
  的地盘，canvas 画上去会被盖住**且点不动**（solitaire 的「✓ 有解」角标、abyssshoot 的
  Deepest/Coins 都踩过）。
- 现状：solitaire（`page()` + 公平页）· blockblast（`backButton()`）· minesweeper（帮助页 + 图鉴）
  **均已改**；snake 的 canvas 浮层 HOME 角标本来就在卡片左上，合规。
- ⚠ **边界**：DOM 模态面板（snake / abyssshoot 的 `#panel-close`）右上角那个 ✕ 是「关闭模态」，
  不是「返回上一页」，跨平台惯例就在右上 ⇒ **暂不动**（要统一得先跟用户确认）。

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
（safeTop=59，同时注入 `--sat` 让 DOM 顶栏也进入模拟），六个游戏各截一张（有二级页的
再多截几屏）、顶部叠红色灵动岛区，**红带里不该有任何内容**。产物 `C:/tmp/notch-check/*.png`。

⛔⛔ **新游戏上线时，必须同时把自己加进 `tools/shot-notch.cjs` 和 `tools/shot-fontscale.cjs`
的 `GAMES` 表**（2026-08-07 实锤）：这两个「跨游戏门禁」的清单是**手写的、不是自动发现**，
connect4 上线时两张表都漏了它 ⇒ 门禁**全绿但压根没看它**，直接放跑了一个 A⁺⁺ 档文字互相压
的线上 bug。⚠ 同一个陷阱在 `package.json` 的 `test` 串联里也存在（见上面「常用命令」节）
—— 本仓一切「全部游戏都会跑」的东西都是手写清单，**新游戏一律去这三处登记**。

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
