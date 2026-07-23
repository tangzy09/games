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
| `snake` | **已上线 App Store**(Snake Angel: Retro Arcade)。完整 + 一轮大改良(爽感 FX/每日天使/星级/奖励关/转向缓冲/收集进度/减弱动态/本机 Flux 道具美术)。ASC 有 1.0.1 草稿(39 语言 + 改良)待出包。 |
| `abyssshoot` | **被 4.3(a) 拒审后整改中**（2026-07-22 改名「Fish Cannon: Deep Sea Merge」+ 盘面去数字化）。玩法/美术/图鉴/道具/广告全备，线上 <https://fishshoot.ai-speeds.com>。 |
| `blockblast` | **已提交 App Store 审核**（ASC 名「Cube Blast: Block Puzzle」）。8×8 消除拼图；卖点是**预生成块流**（出块序列落子前就定死、种子可查）。线上 <https://blocks.ai-speeds.com>。 |
| `solitaire` | **P1 完成（Klondike 可玩 + 纸牌瀑布），未上线**。三合一纸牌；差异化 = **每局都存在解法且可验证**。⚠ 措辞是死线：可解率是「透视暗牌」意义下的，绝不能说成「你一定能赢」（见其 CLAUDE.md）。 |
| `blockblast` | **已提交 App Store 审核**（ASC 名「Cube Blast: Block Puzzle」）。线上 <https://blocks.ai-speeds.com>。 |
| `solitaire` | **已提交 App Store 审核**（ASC 名「Fair Deal: Patience & Cards」，Apple ID 6790861224）。Klondike 可解池 + FreeCell 微软局号 + 「这局还有解吗」证明器。线上 <https://cards.ai-speeds.com>。⚠ 商店名**不含 solitaire**（品牌差异化），但 keywords 里有（公有品类，合规）。 |
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
- 用脚本批量改代码时，**替换后必须 grep 验证生效**——`str.replace` 没匹配不报错，本仓已静默失败四次。
  更稳的做法：python 脚本里对每个替换 `assert old in s`（不匹配直接炸，而不是静默跳过）。
- **别用 shell heredoc 写含反斜杠/引号的代码**：`'C:\tmp'` 里的 `\t` 会被吃成 tab（真实踩过），
  引号也会和 bash 打架。用 Write 工具写文件，或写成 `.py` 再 `python` 执行。
- **Monte-Carlo / solver 是本仓的数值真值源**：拍脑袋的数值一律先用模拟器验（`games/*/tools/sim*.js`）。
  已多次推翻自己的设计（blockblast 的两个机制、solitaire 的措辞）。
- **有外部地面真值时，必须拿它验**（不能自我确认）：solitaire 的 FreeCell 用微软 #11982
  （32000 局里唯一无解的那局）验发牌+规则，一次抓出「solver 提速 437×」的深层 bug。
