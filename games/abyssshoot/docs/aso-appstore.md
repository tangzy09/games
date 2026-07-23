# App Store 上架资料（Fish Cannon: Deep Sea Merge）

> **内部代号仍叫 abyssshoot / Abyss Shooter**（目录、代码、文档），但**面向用户的一切不含 "Abyss"、不含 "2048"**——原因见下方拒审史。

## 拒审史（本文件为什么长这样）

- **v1.0 以「2048 Shooter: Fish Merge」送审 → 2026-07-20 被 4.3(a) Design-Spam 拒**（Submission `07dd567b-e50d-4a83-8705-2de122c53e8a`）。
  当时 keywords 和审核备注是干净的，但**标题以 2048 开头 + 图标印数字方块 + 盘面印 2/4/…/2048** 就足够被判克隆。
  完整方法论见 `~/.claude/skills/avoiding-clone-spam-rejection`；防回归门禁在 `tests/test-noclone.js`（挂在 `npm run test:abyss` 里）。
- 更早（建记录阶段）已规避过一次：本账号已有上架的《2048 Abyss》（`com.aispeeds.abyss2048`，Apple ID `6788542655`），
  所以 Bundle ID / 品牌从一开始就不含 "Abyss"。**这条切割继续保持。**

## 命名（2026-07-22 整改后，勿回退）

| 字段 | 值 | 说明 |
|---|---|---|
| **App Store 名** | `Fish Cannon: Deep Sea Merge` | 27 / 30 字符 |
| **副标题** | `Blast & collect ocean life` | 26 / 30 字符 |
| **中文名** | `深海鱼炮：合成小鱼消除` | effLen 22 / 30 |
| **中文副标题** | `弹射连锁进化·海洋生物图鉴` | effLen ≈26 / 30 |
| **主屏图标名**（`capacitor.config.appName`） | `Fish Cannon` | 11 字符 |
| **Bundle ID** | `com.aispeeds.fishshooter` | 不变（本就不含 2048/abyss） |
| **Apple ID** | `6790052330` | ASC 记录不变，改名走元数据 PATCH |

## ASO 逻辑

**单打大词没戏，能赢的是长尾**。`Fish Cannon: Deep Sea Merge` 一口气吃下：

| 长尾搜索 | 命中 |
|---|---|
| `fish merge` | ✅ |
| `fish cannon` | ✅（品类里几乎无人占） |
| `deep sea merge` / `sea merge` | ✅ |
| `merge cannon` | ✅ |

副标题再补 4 个名字里没有的词：**blast / collect / ocean / life**。

## 关键词字段（100 上限，逗号分隔、逗号后不留空格）

⚠ **不要重复名字与副标题里已有的词**（Apple 三处索引取并集，重复是浪费额度）。
已覆盖：`fish, cannon, deep, sea, merge, blast, collect, ocean, life`

```
ball,puzzle,block,aquarium,brain,casual,drop,evolve,marine,offline,arcade,tile,shark,shooter,chain
```
（98 / 100 字符。`shooter` 是品类词，放 keywords 安全；放标题才是克隆信号。）

中文关键词见 `store-copy.md`（中文区独立选词）。

## 整改后的提交清单（按序）

- [x] 代码侧去指纹：盘面/图鉴/HUD 全走 `Tiles.tierDisp`（Lv.1–Lv.17），游戏内标题改 Fish Cannon/深海鱼炮
- [x] `privacy.html` / `index.html` / `capacitor.config.json` 改名
- [x] 商店文案全套重写（`store-copy.md`）
- [x] **图标重生成**（2026-07-22 Gemini 三轮出图：炮→小丑鱼→双鱼合鲨，零数字；主图存 `C:\tmp\abyssshoot\icon-master.png`，squircle 60px 蒙版验过无白角）
- [x] 截图重拍重排（`01-codex` 第一张；20 张已在 `C:\tmp\abyssshoot\shots-final\`）
- [ ] ASC 元数据 PATCH（en-US + zh-Hans 名称/副标题/关键词/描述/宣传文本；REJECTED 状态可直接 PATCH）
- [ ] 截图上传替换
- [ ] Resolution Center 回信（认表面误导 + 列改动清单 + 给 30 秒看到差异化的路径）
- [ ] ⛔ 新构建 + 重新提交审核 —— **必须先经用户批准**
