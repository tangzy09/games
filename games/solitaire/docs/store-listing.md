# 商店页文案（solitaire）

**内部代号 `solitaire` ≠ 商店名**。
- Bundle ID: `com.aispeeds.solitaireproven`（已注册，ASC id `9JN3M7V238`）
- 桌面图标名（`capacitor.config.appName`）: `Solitaire`（短，不截断；与商店名是**两个字段**）
- AdMob app: `ca-app-pub-2141208066469648~1056120854`
  banner `/9972360374` · interstitial `/2229601723` · rewarded `/3947907881`
- Apple ID (APP_STORE_APP_ID): **待填** ← ASC UI 建完 App 记录后回填到 codemagic.yaml

## ⛔ 两条死线（写任何文案前先读）

### 1. 措辞死线：绝不能暗示「你一定能赢」

论文的 81.9% 可解率是 **thoughtful solitaire（透视全部 52 张牌）** 下算的，**玩家看不见暗牌**。

| ❌ 绝不能写 | ✅ 只能这么写 |
|---|---|
| `Every Deal Winnable` / 「每局都能赢」 | `Proven Solvable` / 「每局都有解」 |
| 「保证你能通关」 | 「保证这局不是死局」 |

写 `Winnable` 会造出比「你坑我」更毒的差评：**「它说这局能赢，可我怎么都赢不了」**——而且是我们主动挑起的。
`Solvable`（存在解法）是**事实**，`Winnable`（你能赢）是**谎言**。差一个词，差一条产品命。

### 2. ASO 死线：`solitaire` 是红海，别抢大词

`solitaire` 底下压着微软 / MobilityWare / Zynga，新 app 排它 = **零流量**。
正解：让名字**一口气命中多个长尾**，大词只当「顺带被索引」。

---

## en-US

| 字段 | 内容 | 长度 |
|---|---|---|
| **name** (30) | `Solitaire: Klondike & FreeCell` | **30**（用满） |
| **subtitle** (30) | `Proven solvable patience game` | 29 |
| **keywords** (100) | `card,classic,windows,offline,solver,puzzle,brain,relax,senior,cards,logic,daily,winnable,fair` | 93 |

**为什么名称不放我们的卖点**：`proven solvable` **零搜索量**（没人会去搜它）。
名称那 30 个字符是最重的索引位，必须给**真实搜索词**；差异化放副标题（副标题一样进索引）。

命中的长尾：`solitaire` · `klondike solitaire` · `freecell` · `klondike freecell` · `patience`（英/欧主力词）。
⭐ **FreeCell 是突破口**：搜它的人比 `solitaire` 少，但**竞争小一个数量级**，而我们真有 FreeCell（还带微软局号）。

⚠ `winnable` **只进 keywords 字段**（不显示给用户，纯索引）——搜「winnable solitaire」的人正是目标用户；
   但**名称/副标题/正文里绝不出现这个词**（措辞死线，见上）。
⚠ keywords 不重复 name/subtitle 里的词（索引取并集，重复 = 浪费额度）。
⚠ 不放价格词（`free` 等）—— App Store 2.3.7。

### description（首段 = 直接答案式，吃 AI/Google 引用）

```
Solitaire: Klondike & FreeCell is a classic card game where every deal is checked by
a solver before you ever see it. If a deal has no solution, you never get it.

But we'll be honest with you about what that means — and no other solitaire app will:

"Solvable" means solvable IF you could see the face-down cards. You can't. So luck
still exists. We can promise this deal is not a dead end. We cannot promise you'll win.

We even publish the gap. Open the Fairness page and you'll see it measured:
  • A random Klondike deal (what most apps give you): 81.9% have a solution.
    Our blind AI — which sees exactly what you see — wins 7.6% of them.
  • Our verified deals: 100% have a solution. That same blind AI wins 30%.

And one number we're most proud of: 45% of the deals you lose are STILL winnable when
you give up. You just didn't find it. That is exactly why undo, hints, restart and the
"Is this deal still winnable?" prover are free here — forever, with no ad to watch.
Locking them behind an ad would mean charging you to find out you still had a chance.

WHAT'S INSIDE
• Klondike (draw 1 or draw 3) — every deal verified solvable before it's dealt
• FreeCell with Microsoft deal numbers — play the legendary unsolvable #11982 if you dare
• "Is this deal still winnable?" — a real solver runs on your device and tells you the
  truth, including "we couldn't work it out". It never blames you for a mistake you had
  no way to avoid.
• Unlimited undo. Tap-to-move as well as drag (dragging is hard with arthritic hands).
• Four-colour deck option, big text option
• Card backs and tables to collect
• Plays offline. No account. No energy system. No coin-betting.

FAIR BY DESIGN
• Undo, hints, restart, new deal, the prover: always free, never behind an ad
• The banner never covers the cards — the layout reserves space for it
• Interstitials only after a WIN, at most one per three wins, never after a loss
• One-time Remove Ads purchase. Not a subscription.
```

## zh-Hans

| 字段 | 内容 | effLen (CJK×2) |
|---|---|---|
| **name** (30) | `纸牌接龙：经典与空当接龙` | 24 |
| **subtitle** (30) | `每局发牌前都验证过有解` | 22 |
| **keywords** (100) | `单人纸牌,windows纸牌,单机,离线,益智,休闲,老年,扑克,solitaire,klondike,freecell,求解器,烧脑,放松,每日` | 95 |

⚠ 中文 subtitle 用「验证过有解」，**不是**「每局都能赢」（措辞死线）。
⚠ **keywords 里不放「蜘蛛纸牌」** —— 我们没有蜘蛛玩法，放了是误导（也会拉低转化）。

### description

```
《纸牌接龙：经典与空当接龙》是一款经典纸牌游戏。每一局在发给你之前，都由求解器验证过——
无解的局，你根本拿不到。

但有件事我们要跟你说实话，而别的纸牌 app 不会说：

「有解」的意思是——**如果你能看见暗牌**，它有解。而你看不见。所以运气仍然存在。
我们能保证这局不是死局，不能保证你一定赢。

这个落差我们直接公开在「公平」页里，还附上实测数字：
  • 随机发牌（大多数纸牌 app 给你的）：81.9% 有解。而我们的「盲打 AI」——它和你看到的
    信息完全一样——只赢得下其中 7.6%。
  • 我们验证过的牌局：100% 有解。同一个盲打 AI，赢 30%。

还有一个我们最自豪的数字：**你输掉的局里，45% 其实仍然有解**，你只是没找到。
这正是本作的撤销、提示、重开、还有「这局还有解吗？」永远免费、永远不用看广告的原因——
把它们锁在广告后面，等于收你钱才让你知道自己还有救。

内容
• 经典纸牌（Klondike，翻 1 张 / 翻 3 张）——每局发牌前都验证过有解
• 空当接龙（FreeCell），沿用微软局号——传说中无解的 #11982，你敢不敢试
• 「这局还有解吗？」——真正的求解器在你的设备上跑，并且敢说「我们算不出来」。
  它绝不会因为一个你根本无法避免的失误来责怪你。
• 无限撤销。支持点击移动，不只是拖拽（关节炎的手拖不准）。
• 四色牌、大字号
• 牌背与桌布可收集
• 完全离线。无账号。无体力。不押注。

公平是设计出来的
• 撤销、提示、重开、换局、求解器：永远免费，永远不在广告后面
• 横幅绝不遮牌——布局为它预留了空间
• 插屏只在**赢局后**出，每 3 局最多 1 个，输局永远不出
• 一次性买断去广告。不是订阅。
```

## 截图脚本（6.9" 1290×2796 / iPad 13" 2048×2732）

顺序即优先级 —— **第 1 张必须是公平页**（它是唯一的差异点，也是 4.3(a) 的正面回答）：

1. **公平页**（落差表 + 「45% 其实还有解」）— 标题：`We publish the number no one else will`
2. Klondike 牌桌 + 「✓ 有解 · 困难」角标 — `Every deal verified before you see it`
3. **「这局还有解吗？」→「本局仍然存在解法」** — `A real solver. On your device. Free, forever.`
4. FreeCell（微软局号）— `FreeCell with the original Microsoft deal numbers`
5. 统计页（零撤销·零提示胜率）— `The win rate that actually means something`
6. 收藏页（牌背/桌布）— `Collect card backs and tables`

## ⚠ 4.3(a) spam 风险评估（中等偏高）—— 以及三道防线

**为什么有风险**（不利的都要认）：
1. 纸牌是 App Store 最极端的红海之一，Klondike/FreeCell 克隆成千上万，4.3(a) 正是冲这类品类去的。
2. 我们的玩法是 **100% 经典规则，零原创机制**。审核员打开看到的就是一张标准 Klondike 牌桌。

**真正的失败路径不是「差异化不够」，而是「差异化审核员没看见」**：
真正的差异（设备上跑真求解器、公开可解率落差、微软局号）**全在按钮后面**，
而审核员只花两三分钟。打开 → 普通牌桌 → 拒。

⇒ 三道防线，全部指向同一件事：**让差异在头 5 秒自己撞到审核员脸上**。

| # | 防线 | 位置 |
|---|---|---|
| 1 | **首启一屏**（全新用户必见，可一键进公平页） | `renderIntro()`，钉死在 `tests/e2e-intro.cjs` |
| 2 | **审核备注**（下面这段，直接跟审核员说话，给 30 秒复现步骤） | `appStoreReviewDetails.notes` |
| 3 | **截图 #1 = 公平页**（不是牌桌！） | 见上「截图脚本」 |

（同账号的 5 个游戏题材/玩法各不同——扫雷/贪吃蛇/射击/方块/纸牌——**不构成 identical apps**；图标也完全不撞车。这一条不是风险。）

### App Review Notes（原样贴进 ASC）

```
This is a classic solitaire app (Klondike + FreeCell), and we know the App Store has
many of those. Here is what is genuinely different about this one, and how to see it
in under a minute:

1. EVERY KLONDIKE DEAL IS VERIFIED SOLVABLE BEFORE IT IS DEALT.
   A real solver runs on-device. Deals with no solution are never given to you.
   The app ships a pre-verified deal pool (games/solitaire/data/) built by replaying
   each solution through the game's own rules engine.
   -> Where to see it: the green "Solvable" badge at the top of the board. Tap it.

2. "IS THIS DEAL STILL WINNABLE?" - A SOLVER YOU CAN ACTUALLY PUSH.
   The big button below the board runs a real search in a Web Worker on the device and
   gives one of three answers: still solvable / no longer solvable (with the move number
   after which no solution exists) / "we couldn't work it out". We do not know of another
   solitaire app that will admit the third answer.
   -> Where to see it: tap "Is this deal still winnable?" on the main screen. It answers
      in well under a second on an opening position.

3. WE PUBLISH THE HONEST GAP, WHICH IS NOT FLATTERING TO US.
   The Fairness page states plainly that "solvable" only means solvable IF you could see
   the face-down cards - which you cannot - so we do NOT claim you are guaranteed to win.
   We publish measured numbers, including that our own blind AI (which sees exactly what
   the player sees) wins only 7.6% of random draw-3 deals.
   -> Where to see it: it is the FIRST screen a new user sees, and it is also reachable
      from the badge or from Menu > Fairness.

4. FREECELL USES THE ORIGINAL MICROSOFT DEAL NUMBERS.
   Deal #11982 - famously the only unsolvable deal of the original 32000 - is unsolvable
   here too. Our solver proves it by exhaustive search. This is verified in our test suite
   against that external ground truth.
   -> Where to see it: tap "FreeCell" in the toolbar; the deal number is shown top-right.

MONETIZATION
Undo, hints, restart, new deal and the solver are ALWAYS free and never gated behind an
ad. The banner never covers the cards (the layout reserves space for it). Interstitials
appear only after a WIN, at most one per three wins, never after a loss. Remove Ads is a
one-time purchase, not a subscription.

NO GAMBLING
There is no wagering, no chips, no coin betting, no real-money play and no payouts of any
kind. Coins are earned only by winning and can only be spent on cosmetic card backs and
table felts. Age rating declared accordingly (gambling: none).

No account or login is required. The app works fully offline.
```

⚠ 备注里的每一句都必须是**真的**且**审核员点得到**——写一条他复现不了的，比不写更糟。

## 提交前必查（细节见 skill `appstore-listing`）

- [ ] `primaryCategory` = GAMES + 子类 `GAMES_CARD` / `GAMES_PUZZLE`（**送审必填，建 app 后默认为空**）
- [ ] copyright = `2026 Zhongyuan Tang`（⚠ 首字母大写 Z，别手打）
- [ ] supportUrl 每个 locale 都要（漏了每 locale 各报一条 409）
- [ ] privacyPolicyUrl → https://cards.ai-speeds.com/privacy.html（**提交前必须真实可达**）
- [ ] 年龄分级：`gamblingSimulated=NONE` + `gambling=false`（⚠ 纸牌类！个人账号禁模拟赌博，
      本作无下注/无筹码/无兑付 = 不是赌博模拟，但**分级问卷千万别误报**，见 skill 的 postflop 惨案）
- [ ] `advertising=true`（含广告）
- [ ] App 隐私问卷 Publish（UI-only）
- [ ] `CFBundleLocalizations = ["en","zh-Hans"]`（否则商店「语言」栏只显示英语）
- [ ] **审核备注贴进 appStoreReviewDetails.notes**（上面那段）—— 4.3(a) 的第二道防线
- [ ] **截图 #1 必须是公平页，不是牌桌** —— 第三道防线
- [ ] 首启一屏还在（`npm run test:sol:intro`）—— 第一道防线，别哪天被改没了
