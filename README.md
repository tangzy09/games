# Abyss Games

经典小游戏 × 肉鸽化系列（monorepo）。选品与打法见 `C:\tmp\roguelite-minigames\选品清单.md`。

## 结构

```
engine/    共享骨架：canvas 核心、i18n、广告适配、肉鸽 meta（天赋/遗物/存档）
games/     每个游戏一个目录：src + locales + 数值表 → build 出 dist/
tools/     build.js、check-locales、素材生成、截图脚本
```

## 约定

- 引擎只在 `engine/` 改，游戏不许私拷引擎代码。
- 每个游戏 = `games/<name>/`，构建产物 `dist/` 进 git（EC2 直接 serve）。
- 部署：一个 EC2 checkout `/var/www/abyss-games`，每游戏一个子域名，nginx root 指到各自 `dist/`。
- 美术：深海世界观（Abyss 系列），ComfyUI 管线，素材跨游戏复用。
- 首发三个：minesweeper（跑通骨架）→ snake（空白最大）→ breakout（市场最大）。

## 规划路线

原型全走 web（自有门户 + CrazyGames/Poki），数据赢家（≤3）才上 store——Apple 4.3 反对批量铺。
