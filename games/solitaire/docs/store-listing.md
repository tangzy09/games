# 商店页文案（solitaire）

**内部代号 `solitaire` ≠ 商店名**。Bundle: `com.aispeeds.solitaireproven`，桌面图标名 `Solitaire`（短，不截断）。

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
| **name** (30) | `Solitaire: Proven Solvable` | 26 |
| **subtitle** (30) | `Klondike & FreeCell Card Game` | 29 |
| **keywords** (100) | `patience,card,classic,windows,offline,solver,deal,puzzle,brain,relax,senior,cards,logic,solitario` | 97 |

命中的长尾：`proven solvable solitaire` / `klondike solitaire` / `freecell card game` / `windows solitaire` / `offline patience`。
⚠ keywords 里不放 `solitaire`/`klondike`/`freecell`（已在 name/subtitle，索引取并集，重复 = 浪费额度）。
⚠ 不放价格词（`free` 等）—— App Store 2.3.7。

### description（首段 = 直接答案式，吃 AI/Google 引用）

```
Solitaire: Proven Solvable is a classic card game (Klondike + FreeCell) where every
deal is checked by a solver before you ever see it. If a deal has no solution, you
never get it.

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
| **name** (30) | `纸牌接龙：每局都有解` | 20 |
| **subtitle** (30) | `经典纸牌 + 空当接龙` | 19 |
| **keywords** (100) | `单人纸牌,windows纸牌,蜘蛛纸牌,离线,单机,益智,休闲,老年,扑克,solitaire,克朗代克,求解器,烧脑,放松` | 88 |

⚠ 中文 name 用「每局都有解」，**不是**「每局都能赢」（见措辞死线）。

### description

```
《纸牌接龙：每局都有解》是一款经典纸牌游戏（经典纸牌 + 空当接龙）。每一局在发给你之前，
都由求解器验证过——无解的局，你根本拿不到。

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
