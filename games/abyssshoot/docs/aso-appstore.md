# App Store 上架资料（2048 Shooter: Fish Merge）

> 建 ASC App 记录时照抄本文件。**内部代号仍叫 abyssshoot / Abyss Shooter**（目录、代码、文档），
> 但**面向用户的一切都不含 "Abyss"** —— 原因见下方「⚠ 4.3 拒审风险」。

## 命名（已定，勿擅改）

| 字段 | 值 | 说明 |
|---|---|---|
| **App Store 名** | `2048 Shooter: Fish Merge` | 24 / 30 字符 |
| **副标题** | `Number blast: collect sea life` | 30 / 30 字符 |
| **主屏图标名**（`capacitor.config.appName`） | `2048 Fish` | 9 字符，不会被截断 |
| **Bundle ID** | `com.aispeeds.fishshooter` | |
| **AdMob / ASC 数字 ID** | 见 `codemagic.yaml` 的 `GAD_APP_ID` / `APP_STORE_APP_ID` | 建完回填 |

## ⚠ 4.3 拒审风险（这是命名如此的**唯一原因**，别"优化"回去）

本账号**已有一个上架的海洋主题 2048**：**`2048 Abyss`**（`com.aispeeds.abyss2048`，Apple ID `6788542655`）。

原本给本游戏配的是 `Abyss Shooter` / `com.aispeeds.abyssshooter` —— 同账号、同 "Abyss" 品牌、同海洋主题、同沾 2048、Bundle ID 只差一个词。**这正好长成 Apple 4.3(a) 最典型的拒审形态**（「同一个 app 的多个 Bundle ID / 重复应用」），审核员会认为是同一游戏的两个版本。

**已做的切割**（务必保持）：
- Bundle ID 改成 `com.aispeeds.fishshooter`（**不含 abyss**）
- 商店名/主屏名**不含 Abyss**，改以「射击 + 鱼」立品牌
- 图标已完全不同（本作是数字鱼砖 + 带尾焰的弹药，一眼是射击）
- 视觉反差大：`2048 Abyss` 是浅蓝底 `#dff1ff`，本作是近黑深渊 `#04121f`
- **机制本就不同**：那个是滑动合并的网格 2048，本作是**列式射击 + 连通块指数合并 + 鱼图鉴**

## ASO 逻辑（为什么是这个名字）

**单打「2048」没戏**——上万个 2048 克隆在抢这个大词。**能赢的是长尾**。
`2048 Shooter: Fish Merge` 一口气吃下四个长尾：

| 长尾搜索 | 命中 |
|---|---|
| `2048 shooter` | ✅ **精准、竞争小、意图强**（这是本作的品类原名） |
| `2048 fish` | ✅ |
| `fish merge` | ✅ |
| `merge shooter` | ✅ |

副标题 `Number blast: collect sea life` 再补 5 个名字里没有的词：**number / blast / collect / sea / life**。

## 关键词字段（100 字符上限，逗号分隔、**逗号后不留空格**）

⚠ **不要重复名字与副标题里已有的词**（Apple 已经索引了它们，重复是浪费额度）。
已覆盖：`2048, shooter, fish, merge, number, blast, collect, sea, life`

```
ball,puzzle,block,ocean,aquarium,brain,casual,drop,cannon,evolve,marine,offline,arcade,tile,shark
```
（97 / 100 字符）

## 建 ASC App 记录（唯一手工步）

appstoreconnect.apple.com → Apps → **+** → 新建 App：
- 平台：iOS
- **名称**：`2048 Shooter: Fish Merge`
- 主要语言：English (U.S.)
- **Bundle ID**：`com.aispeeds.fishshooter`（需先在开发者门户注册）
- SKU：`fishshooter`

建完在「App 信息」页记下**数字 Apple ID** → 回填 `codemagic.yaml` 的 `APP_STORE_APP_ID`。

## 分级 / 隐私（提交审核前要填）

- **年龄分级**：9+（含**广告**；无暴力/成人内容）
- **隐私政策 URL**：`https://fishshoot.ai-speeds.com/privacy.html` ⚠ **还没做，提交前必须补**
- **隐私标签**：会通过 AdMob 收集「标识符（IDFA）」用于第三方广告 → 数据类型勾 *Identifiers*，用途 *Third-Party Advertising*
- **广告**：ASC 的「App 含广告」勾选 = 是

## 上架前必做清单

- [ ] AdMob 建 app + 激励视频 + 插页式广告位 → 三个 ID 回填 `index.html` 的 `GAME_CONFIG.adUnits` 与 `codemagic.yaml` 的 `GAD_APP_ID`
      ⚠ **绝不复用 minesweeper / snake / 2048 Abyss 的广告位 ID**（AdMob 会判作弊封号）
- [ ] 开发者门户注册 Bundle ID `com.aispeeds.fishshooter`
- [ ] ASC 建 App 记录 → 回填 `APP_STORE_APP_ID`
- [ ] **写隐私政策页** `privacy.html`（抄 snake 的，改产品名与广告说明）
- [ ] 商店截图（`appstore-listing` skill 有 Playwright 造景脚本）
- [ ] Codemagic 触发 `abyss-ios-testflight` 构建
