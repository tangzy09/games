# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

经典小游戏 × 肉鸽化 monorepo。**共享引擎 + 每游戏一个目录**，纯 canvas，无框架、无 bundler；唯一 npm 依赖是 devDependency 的 Playwright（测试用，`npm install` 即可）。线上：`mines.ai-speeds.com`（EC2 checkout `/var/www/games`）。

## 目录约定

- `engine/` 只放跨游戏引擎（契约见 `engine/README.md`，必读）；`tools/` 只放跨游戏工具（如 check-locales）。
- **游戏专属的一切**（代码/测试/工具/文档/CLAUDE.md）放 `games/<name>/` 下。各游戏细节看它自己的 `games/<name>/CLAUDE.md`。
- `games/_demo/` 是引擎契约的最小活样板，新游戏从它起步。

## 常用命令

```bash
npm test                  # 全量（改 engine/ 后必跑）；单游戏用 npm run test:mines / test:snake
npx http-server -p 8080   # 本地跑游戏：必须 http（locale 走 fetch，file:// 白屏）
node tools/check-locales.js games/<name>/locales
```

## 引擎契约（速记）

全局脚本按序加载共享命名空间，无模块。游戏提供单一可变状态 `G` + `renderAll()`（每帧 `clearHits()` 重画全屏并 `addHit()` 可点区域）+ `dispatch(action, data)`。`GAME_CONFIG.id` 决定存储键前缀。零硬编码文案（全走 `T('key')` + `locales/<lang>.json`，en.json 为基准）。

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
