# solitaire —— 设计文档 v1（调研驱动）

> **内部代号 `solitaire`（目录名）。商店名二期定**（`appstore-listing` skill 的 ASO 铁律：克隆泛滥的品类别抢大词，去吃长尾组合）。
>
> **三合一**：Klondike（经典微软纸牌）+ FreeCell（空当接龙）+ Spider（蜘蛛纸牌）。微软已经验证过这个组合，且**三种玩法的用户几乎不重叠**。
>
> root `CLAUDE.md`（引擎契约、部署铁律、git 纪律、iOS 流水线）与 `engine/README.md` 先读。
> **本作复用 blockblast 验证过的哲学：可验证的公平。** 但换了个战场——那边是"出块序列落子前就定死"，这边是"**每一局都能赢，我们证明给你看**"。

---

## 0. 调研结论（v1 的全部依据，证据见 §12）

### 0.1 爽点不是"赢"，是赢之后那段**纸牌瀑布**

玩家原话：9 岁那年赢牌时，**「那些弹跳的牌感觉像全场起立鼓掌」**。Vista 砍掉它引发十几年怨念，还被人反复用 canvas 复刻成梗（Know Your Meme 有词条）。

⇒ **纸牌瀑布是产品的心脏，不是彩蛋**。要长、要过度、要不需要玩家操作。我们的 canvas 引擎做这个几乎零成本（重力 + 0.85 反弹阻尼）。

### 0.2 这个品类最大的怨气是「这局根本赢不了」——而且是**信任问题**，不是数学问题

**硬数据**（JAIR 2025 论文 Solvitaire，烧了 ~30 CPU 年）：

| 玩法 | 理论可解率（完美信息） | 人类实际胜率 |
|---|---|---|
| **Klondike draw-3**（标准） | **81.9%** ⇒ **18% 的局怎么打都赢不了** | **~11%**（1/9） |
| Klondike draw-1 | 90.5% | ~30-40% |
| **FreeCell** | **99.999%**（86 亿局里约 1/84000 无解） | 新手 40%，熟手 75-80% |
| Spider 4 花色 | ≈99%（理论上几乎都可解） | **<10%** |

**关键洞察**：**理论可解 82% 与真人胜率 11% 之间的巨大落差，就是阴谋论的温床。** 玩家不会怪随机数，只会怪你。微软官方论坛上有《Microsoft Solitaire 是不是被操纵了？》的专帖，官方回答「不同模式用不同洗牌算法」反而火上浇油。

⇒ **§2 的差异化直接建在这条上。**

### 0.3 微软纸牌的口碑已经塌了 —— 这是我们的整个市场缺口

玩家实测投诉（微软自家 Q&A 论坛）：
- **「一口气 12 个广告，中间一局都没玩上」**、开局前连播 3 个 30 秒广告
- 广告 X 假关闭、二次弹窗、**绕过静音外放**
- **付了订阅照样出广告**
- **Windows 更新把我 2017 年起的全勤连胜清零了**

它把一个**秒开的离线小工具**做成了联网服务，于是拿到了服务型产品的全部差评（掉线、崩溃、清档、耗电）。

⇒ **它的护城河是分发和怀旧，不是产品质量。** 而这个品类的用户是**高龄 + 低容忍 + 情绪调节导向**（有玩家说广告「破坏了我用纸牌做情绪调节的用途」），恰恰最恨这些。

### 0.4 撤销/提示/重开是「基本人权」，把它们做成激励视频 = 差评的最短路径

玩家原话：**「他们故意让你更容易无路可走，好逼你看广告拿提示、再看广告拿 Joker 续命」**、「每天只给 10 次撤销，多要就得看广告，**别家 Solitaire 根本不需要**」。

⇒ **§7 的红线。**

### 0.5 两条基调（写死不动）

- ⛔ **不要体力，不要押注式金币**。Klondike 品类对此**零容忍**（「纸牌凭什么不让我玩下一局」）；头部产品也基本不敢上。Solitaire Grand Harvest 的押注式金币被骂成「披着纸牌皮的老虎机」（期望值为负：「花 5000 金币玩一局，最多赢回 500」）。
- 📉 **单局 5-15 分钟、单次会话 10-15 分钟、每天 4-6 次**。这是所有品类里 session 最长的之一（远高于手游中位 3-5 分钟），用户偏年长、偏女性、65+ 严重 over-index。**场景是上班摸鱼/睡前/情绪调节。**

---

## 1. 三种玩法（规则以此为准）

### 1.1 Klondike（经典微软纸牌）
7 列 tableau（1..7 张，仅顶牌明），4 个 foundation（同花 A→K），tableau 交替色降序，**空列只放 K**。翻牌堆 draw-1 / draw-3 可切换。

**标准计分**（Windows 原版）：waste→tableau +5 / →foundation +10 / tableau→foundation +10 / 翻开暗牌 +5 / foundation→tableau **−15** / draw-1 每过一遍牌堆 −100（第一轮后）、draw-3 每次回收 −20。计时模式每 10 秒 −2，通关奖励 `700000 / 秒数`。

### 1.2 FreeCell（空当接龙）
52 张**全明牌**，8 列 + **4 个自由单元** + 4 foundation。空列可放任意牌。

**Supermove 公式**（一次能搬几张，必须实现对）：
```
C = (空 free cell 数 + 1) × 2^(空列数)
移动到空列时： (空 free cell 数 + 1) × 2^(空列数 − 1)   // 目标列不能再当中转
```

**⭐ 微软局号 1:1 复刻**（几乎白送的营销梗）——就是 6 行 LCG：
```
state = (214013 × state + 2531011) mod 2^31 ;  rand = state >> 16   // 0..32767
以局号为种子，从剩余牌堆按 rand % 剩余张数 抽牌交换，横向发进 8 列
```
⇒ 传说中「32000 局里唯一无解的 **#11982**」我们可以**原样提供**，做成成就（`挑战 #11982`）。

### 1.3 Spider（蜘蛛纸牌）
**双副牌 104 张**，10 列，stock 每次发 10 张（**发牌前不许有空列**）。tableau 不分花色按点数降序叠放，但**只有同花连续序列**才能整体搬动。凑齐同花 K→A 自动移走，8 组全清即胜。1/2/4 花色三档难度。

**微软计分**：起始 500 分，**每走一步 −1（含 undo）**，每完成一组 +100。

---

## 2. ⭐ 核心差异化：**每一局都能赢，而且我们证明给你看**

> 这是本作唯一的、也是最强的卖点。它直接打在品类最大的信任伤口上（§0.2）。
> 与 blockblast 的「预生成块流」是**同一条哲学**：不辩解，把公平做成**可验证的机制**。

### 2.1 三条承诺（写进游戏内「公平」页 + 商店描述）

1. **默认只发已验证可解的牌局。** 每局显示**牌局编号**和 **✓ 已验证可解**角标。你卡住时，我们能证明「这局确实有解，是你还没找到」——而不是让你怀疑人生。
2. **难度不是拍脑袋的，是 solver 算出来的。** 用**最短解长度 / 搜索节点数**当难度指标（免费送的，比任何启发式都准）。Easy/Normal/Hard 是真实的解题难度，不是数值缩放。
3. **想要经典体验？一个开关的事。** 「经典模式（含无解局，如同 1990 年的原版）」可选开启 —— 这是唯一能同时服务「放松派」和「硬核派」的做法（MobilityWare 的 Winning Deals 滑杆已验证）。

### 2.2 ⚠ 可解性筛选**只对 Klondike 有意义**（别做无用功）

| 玩法 | 要不要筛 | 为什么 |
|---|---|---|
| **Klondike** | ✅ **必须筛** | 18% 的局天生无解 —— 这是玩家挫败感的**唯一最大来源** |
| **FreeCell** | ❌ 不筛 | 本来就 99.999% 可解。筛了也没区别；难的是人不会玩，不是牌不给赢 |
| **Spider** | ❌ 不筛 | 理论上 ≈99% 可解，难度全在人。**筛可解性对 Spider 毫无意义**（新手常见的误解） |

⇒ **只需要给 Klondike 建可解 seed 池。** FreeCell 直接用微软局号（LCG），Spider 纯随机。

### 2.3 技术路线：**离线预生成 seed 池**（零运行时成本、零 GPL 污染）

1. 离线用开源 solver 批量跑几十万 seed，导出 `{seed, 最短解长度}` JSON 打进包。
2. **难度分档**按最短解长度（solver 免费给的）。
3. 每日挑战：`seed = hash(YYYY-MM-DD)` 从**已验证池**里取 ⇒ 全球同一局、保证可解、**零服务器**。

**⚠ 许可证红线**：`Solvitaire`（论文用的那个）是 **GPL-2.0** ⇒ **只能在离线管线里用，绝不进 app**。
可选 MIT 方案：`lonelybot`（Rust/WASM，Klondike SOTA）、`fc-solve`（C/MIT，已有 emscripten 版）。

**⚠ Klondike solver 有极重的长尾**：论文里 100 万局中有 157 局跑 1 小时也判不出来 ⇒ **必须设超时 + 放弃策略**（判不出的 seed 直接丢弃，反正我们只要"确定可解"的）。

---

## 3. 纸牌瀑布（产品的心脏，不是彩蛋 —— §0.1）

赢局时全屏纸牌瀑布：每张牌从 foundation 弹出，**重力 + 0.85 反弹阻尼**，在屏幕上撞出彩虹轨迹，持续 5-10 秒，**不需要玩家操作**（点一下可跳过；设置里可关）。

配一声长的、上扬的胜利音（WebAudio 合成，同 blockblast）。

> ⚠ 这一节的优先级 **等同核心逻辑**。玩家几十年记住的就是这个画面。

---

## 4. 入场券（不是加分项，缺了就是一星）

- **无限撤销**（Klondike 玩家把 undo 当成玩法本身：卡住时反复试探别的走法）
- **提示**（枚举所有合法移动 + 启发式排序：翻暗牌 > 空列 > 收 foundation > 移动序列。「保证不走死」的 hint 需要 solver，二期）
- **自动收牌 autoplay**（判定规则：一张牌可以无脑收 ⟺ 两个异色花色的 foundation 都已到 `rank − 1`）
- **重开 / 换一局**（永远免费）
- **统计**（胜率/最快/连胜。玩家会**拿统计数字审判你的公平性**，所以必须准）
- **⚠ 任何新增装饰（横幅/社交/推送）必须可关** —— 玩家原话：「Now you have added all of these bells and whistles that **can't be turned off**」

## 5. 每日挑战 + 连胜（留存三件套，但先把地基做扎实）

- **每日挑战**：三种玩法各一局/天，`seed = hash(日期)` 从可解池取 ⇒ **全球同一局**。
- **连胜 streak** + 月度日历（一整月不断的皇冠）。
- ⚠ **连胜会把你产品的每一个技术缺陷放大成人身伤害**（微软实锤：崩溃/掉线/更新清档 → 玩家 2017 年起的全勤没了）。所以：
  - **本地优先、离线可用、绝不丢档**（这正是微软崩掉的地方 = 我们最好抄的缺口）
  - **连胜给一次「补签」**（断了不至于让人怒删）

## 6. 「秒开 + 离线」是我们的隐性卖点

微软把纸牌做成了联网服务（HN 原话：「没网就是残废，而且**耗电像没有明天**」）。我们是纯 canvas + 本地存档 ⇒ **秒开、离线、不耗电、不丢档**。这条要写进商店描述。

## 7. ⛔ 变现红线（都是被差评逼出来的）

1. **撤销 / 提示 / 重开 / 换一局 —— 永远免费，永远不看广告。** 这是纸牌的基本人权（§0.4）。把它上锁省下的那点 eCPM，换来的是「这游戏是骗子」的定性。
2. **绝不局间连播插屏，绝不在「玩到一局之前」播广告。** 微软的「12 连播」是这个品类最致命的叙事。
3. **不要体力，不要押注式金币**（§0.5）。
4. **一次性去广告 IAP，不是订阅。**「付费还看广告」是微软最毒的一条差评。买了之后**功能不能变少**（激励奖励改为直接给）。
5. 激励视频**只用于纯增益**（皮肤、牌背、额外每日挑战），绝不用于「解锁基本功能」。

## 8. 工程（严守引擎契约）

### 8.1 分层（index.html 加载顺 = 依赖顺）

引擎 → `prng` → `cards`（牌/花色/牌堆）→ `deal`（发牌：Klondike 从可解池 / FreeCell 微软 LCG / Spider 随机）→ `rules-klondike` / `rules-freecell` / `rules-spider`（三套纯规则，各自可单测）→ `core`（选中/移动/撤销栈/计分/胜负）→ `hint` → `storage` → `drag` → `fx`（**纸牌瀑布**）→ `render` → `main`。

- **纯逻辑层**（双导出，node 可单测）：`prng / cards / deal / rules-* / core / hint`。
- **拖拽层复用 blockblast 的 `drag.js` 经验**（引擎的 `input.js` 只有 tap/swipe，没有 drag&drop）。本作是第二个拖拽游戏 ⇒ **该考虑把 drag 抽取进 engine 了**（blockblast 的 DESIGN §5 埋的伏笔）。
- **零硬编码文案**：`T('key')` + `locales/<lang>.json`（**嵌套结构**）。首发 en + zh-CN，代码零硬编码 ⇒ 加语言零改码（根 CLAUDE.md 的语言策略）。
- **存档**（带 `v: N`）：统计/连胜/每日/设置/当局快照。**改 `G` 形状必 bump `SAVE_VERSION`**。

### 8.2 测试

- **node 单测**：三套规则各自的合法移动/边界（空列只放 K、supermove 公式、Spider 同花序列搬动、发牌前不许有空列）、撤销精确复原、计分公式、autoplay 安全判定、胜负判定。
- **`tools/verify-deals.js`**：可解池里随机抽 N 个 seed，用 solver 复验「确实可解」——**我们承诺了可解，就必须真的对**（一旦承诺，玩家会把每次失败都当成 bug/欺骗）。
- **E2E**：真实鼠标拖拽（**不用 dispatch 绕过** —— blockblast 那次「假绿」的教训）、赢局瀑布、撤销、每日挑战、三种玩法切换。

## 9. 分阶段

1. **P1 Klondike 可玩**：cards + deal + rules-klondike + core + drag + **纸牌瀑布** + 撤销/提示/autoplay + 单测 + E2E。
   **验收：赢一局，看那段瀑布，想不想再来一局。**
2. **P2 可解池**：离线 solver 管线 + seed 池 + 牌局编号 + 「已验证可解」角标 + 难度分档 + `verify-deals.js`。
3. **P3 FreeCell + Spider**：两套规则 + 微软局号复刻（#11982 成就）+ 玩法切换。
4. **P4 元层**：每日挑战 + 连胜 + 统计 + 牌背皮肤 + 成就 + 公平页。
5. **P5 变现/上架**：Ads（§7 红线内）+ 去广告 IAP + i18n 十语 + iOS 壳 + 商店素材。

## 10. 美术

纯 canvas 画牌（不用图片素材）：圆角白牌 + 花色符号 + 大号点数，**60px 缩略图下也要认得出**（老年用户是主力人群！**字号要大、对比要高**）。牌背皮肤走 `PAL` 调色板切换（确定性、禁 `Math.random`）。

## 11. ⚠ 上架风险（比 block puzzle 更狠）

**Solitaire 是 App Store 克隆最泛滥的品类之一（几万个）。4.3(a) 风险比 blockblast 更高。**

对策（**P1 就要规划**，不能等到上架前）：
- **「已验证可解 + 牌局编号 + 最短解长度」是审核员 5 秒能看见的东西** ⇒ 商店截图第 1 张就打这个。
- ASO：**别抢 `solitaire` 大词**（底下压着几万个克隆，排不进去 = 零流量）。去吃长尾组合（`winnable solitaire` / `solitaire no ads` / `freecell classic`…）。
  - 💡 **`no ads` 已经成为这个品类的可搜索词**（存在一批「愿意为清净付钱」的存量用户）——这与我们的红线天然一致。
- 图标不能与账号下其他 app 撞（Mando 实锤被拒）。

## 12. 调研来源

- **可解率（权威）**：Blake & Gent, *The Winnability of Klondike Solitaire and Many Other Patience Games*, JAIR 2025（Solvitaire，~30 CPU 年）：[arXiv:1906.12314](https://arxiv.org/abs/1906.12314) · 独立复算 [lonelybot](https://github.com/vuonghy2442/lonelybot)（Rust/MIT/WASM，81.95±0.03）
- **FreeCell #11982**：[Wikipedia](https://en.wikipedia.org/wiki/FreeCell) · [solitairelaboratory FAQ](http://www.solitairelaboratory.com/fcfaq.html) · 微软 LCG 发牌算法 [Rosetta Code](https://rosettacode.org/wiki/Deal_cards_for_FreeCell)
- **玩家怨气（一手）**：微软官方 Q&A —— [12 连播广告](https://learn.microsoft.com/en-us/answers/questions/4066270/is-anyone-else-having-5-6-or-more-ads-show-up-betw) · [广告变多](https://learn.microsoft.com/en-us/answers/questions/4061852/increased-ads-in-microsoft-solitaire) · [是不是做鬼了](https://learn.microsoft.com/en-us/answers/questions/5519026/microsoft-solitaire-game-is-rigged-why) · [付费仍有广告](https://learn.microsoft.com/en-us/answers/questions/5830662/fix-problem-with-premium-solitaire) · [每日挑战清档](https://answers.microsoft.com/en-us/windows/forum/all/microsoft-solitaire-collection-daily-challenges/4dd350fe-e328-4012-99b3-b2e1383d5412)
- **纸牌瀑布的情感价值**：[zeke.sikelianos.com/solitaire](https://zeke.sikelianos.com/solitaire/) · [Know Your Meme](https://knowyourmeme.com/memes/cards-when-you-win-in-solitaire)
- **竞品做法**：[MobilityWare Winning Deals 滑杆](https://mobilityware.helpshift.com/hc/en/10-solitaire/faq/1498-what-s-the-difference-between-the-random-deal-and-winning-deal/) · [Solitaired「只发可解局」](https://solitaired.ca/) · 微软每日挑战 guaranteed solvable
- **押注式金币的翻车**：[Grand Harvest ComplaintsBoard](https://www.complaintsboard.com/solitaire-grand-harvest-b157543)
- **开源实现**：[fc-solve](https://fc-solve.shlomifish.org/)（C/MIT，有 WASM）· [PySolFC](https://github.com/shlomif/PySolFC)（规则百科）· [erendn/solitaire-js](https://github.com/erendn/solitaire-js)（canvas，技术栈最近）
- ⚠ **证据缺口**：Reddit 全站不可爬；「人类实际胜率」那一列全部来自无样本量的 SEO 站点，**当量级参考，别当精确值**。
