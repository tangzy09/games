# Games

经典小游戏 × 肉鸽化系列（monorepo，目录 `Projects\games`；与旧的 `Projects\game` 单数目录无关）。选品与打法见 `C:\tmp\roguelite-minigames\选品清单.md`。

**共享引擎 + 每游戏一个目录**，纯 canvas，**无框架、无 bundler**——`index.html` 按序 `<script>` 直接引 `../../engine/*.js`，共享一个全局命名空间。唯一 npm 依赖是 devDependency 的 Playwright（E2E 用）。

> 干活前先读 **`CLAUDE.md`**（引擎契约、两条部署铁律、多会话 git 纪律、iOS 流水线）和 **`engine/README.md`**。本文件只讲「这仓库是什么、怎么起步」。

## 结构

```
engine/    共享骨架：canvas/i18n/广告/音频/输入/存储/PRNG（契约见 engine/README.md）
games/     每游戏一个目录；游戏专属的一切（代码/测试/工具/文档/CLAUDE.md）都在自己目录下
tools/     跨游戏工具：build-www.cjs（组装 Capacitor webDir）、check-locales.js
codemagic.yaml   iOS 流水线（共享模板，新游戏加一段 workflow 填 4 个 var）
```

`games/_demo/` 是引擎契约的最小活样板，**新游戏从它起步**。

## 各游戏现状

成熟度差很多，**动手前先看它自己的 `games/<name>/CLAUDE.md` 和 `DESIGN.md`**（DESIGN.md 是该游戏玩法/数值的权威规格）。

| 游戏 | 状态 |
|---|---|
| `minesweeper` | 已上线 + App Store 送审 |
| `snake` | 已上线 + App Store 送审 |
| `abyssshoot` | 已提交 App Store 审核；线上 <https://fishshoot.ai-speeds.com> |
| `blockblast` | 已提交 App Store 审核（「Cube Blast: Block Puzzle」）；线上 <https://blocks.ai-speeds.com> |
| `bouncerogue` | 只有 DESIGN.md，零代码（纯 spec，已 park） |

## 起步

```bash
npm install                # 只为装 Playwright
npx http-server -p 8080    # 本地跑：必须 http（locale 走 fetch，file:// 白屏）
npm test                   # 全量单测；E2E 另跑：npm run test:mines:e2e / test:abyss:e2e
```

## 约定（细则见 CLAUDE.md）

- **引擎只在 `engine/` 改**，游戏不许私拷引擎代码；游戏专属的一切放 `games/<name>/`。
- **零硬编码文案**：全走 `T('key')` + `locales/<lang>.json`（en 为基准），`node tools/check-locales.js games/<name>/locales` 必须 0 fail。
- **数值靠模拟校准**：随机性/难度/经济的数值，先写 node 蒙特卡洛脚本跑几千局用数据定，脚本留在 `games/<name>/tools/` 当回归基线。
- **美术**：每游戏自定风格（ComfyUI 出图 → game-art-pipeline 抠图入库），不强求统一世界观。

## 上线

- **Web**：一台 EC2 checkout 到 `/var/www/games`，每游戏一个子域名（`mines.ai-speeds.com` 等），nginx 直接 serve 游戏目录（**没有构建步骤**）。部署 = 手动 `git push` + ssh 上去 `git pull`，**绝不自动**；改 js/css 必 bump `?v=N`（铁律见 CLAUDE.md）。
- **iOS**：Capacitor → Codemagic 云端构建 → TestFlight/App Store。`www/ ios/ android/` 全部 gitignore，云端每次新鲜生成。
- **路线**：原型全走 web（自有站 + CrazyGames/Poki 门户），数据赢家（≤3）才上 store —— Apple 4.3 反对批量铺同质应用。

## 已知遗留

`games/snake/dist/` 是一份**旧构建产物**（500+ webp / 19 js / html+css+wav），**代码中已无任何引用**（当年 "build 出 dist/" 的做法已废弃，现在 nginx 直接 serve 游戏目录）。属历史遗留，可清理。
