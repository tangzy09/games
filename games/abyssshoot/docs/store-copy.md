# 商店文案（en-US / zh-Hans）

> ⚠ **2026-07-22 全套重写**：v1.0 以「2048 Shooter: Fish Merge」送审，2026-07-20 被 Apple **4.3(a) Design-Spam** 拒。
> 整改后铁律（见 `~/.claude/skills/avoiding-clone-spam-rejection` 与 `tests/test-noclone.js` 门禁）：
> **任何字段、任何语言、任何表面不得出现 "2048" / "Abyss"，不得出现 2 的幂数值**（32/64/…/131072）。
> 描述里「翻倍/四倍/十六倍」是倍数不是盘面值，允许。

> ASO 铁律（来自 `appstore-listing` skill）：**名称 / 副标题 / 关键词三处的词不许重复**——苹果只索引这三处，取并集；重复 = 浪费额度。描述不进苹果排名，但被 Google / AI 抓 → **首段写成「直接答案式」**吃 AI 引用。

---

## en-US

**Name**（30 上限 · 用 27）
```
Fish Cannon: Deep Sea Merge
```

**Subtitle**（30 上限 · 用 26 · 不重复名称已有词）
```
Blast & collect ocean life
```

**Keywords**（100 上限 · 用 98 · 逗号分隔、**逗号后不留空格**、不重复名称/副标题已有的词）
```
ball,puzzle,block,aquarium,brain,casual,drop,evolve,marine,offline,arcade,tile,shark,shooter,chain
```

**Promotional Text**（170 上限 · 可随时改、不需重新过审）
```
Smash, swap and undo to survive. Watch the deep open up as you merge your way from clownfish to the legendary oarfish.
```

**Description**
```
Fish Cannon: Deep Sea Merge is a column-shooter puzzle game: you fire small fish upward, matching fish collide and evolve into bigger species, and you collect 17 deep-sea creatures along the way.

HOW IT PLAYS
Tap a column to launch the fish in your cannon. When it lands next to a matching fish, they merge into a bigger one — and the chain keeps going. Miss, and the column grows toward the line at the bottom. Get pushed past it and the run is over.

CLUSTERS PAY EXPONENTIALLY
Two matching fish evolve one step. Three jump further. Five leap four steps at once. The real skill is not merging fast — it is engineering a big cluster and setting it off in one shot.

COLLECT THE DEEP
Every level is a real sea creature, from the humble clownfish through the great white and the orca, down to the legendary oarfish at the very bottom of the ladder. Reach one and it is yours forever in the codex. Skip a rung and it stays a silhouette — so you will go back for it.

WHEN THE BOARD TURNS
Smash a fish that is blocking a column. Swap two columns. Undo the shot you regret. Earn coins from every merge and chain, and spend them when it counts.

- Endless runs, one clean rule: don't let a column cross the line
- No timer, no energy, no waiting — play a run in a minute or an hour
- Works offline
- Your progress is saved on your device
```

---

## zh-Hans（简体中文）

> ⚠ **不是机翻**：中文用户搜的词和英文用户不同（「消除/合成/闯关/休闲」是中文区高频词），关键词字段独立配。

**名称**（30 上限 · effLen 22）
```
深海鱼炮：合成小鱼消除
```

**副标题**（30 上限 · effLen 约 26 · 不重复名称已有词）
```
弹射连锁进化·海洋生物图鉴
```

> ⚠ 中文副标题按苹果 **effLen（CJK 算 2）** 计，最多约 **15 个汉字**，别按「字数」估（v1.0 实踩被 ASC 拒收过）。

**关键词**（100 上限 · 逗号分隔、无空格；**中文区独立选词**，不重复名称/副标题里已有的词）
```
大鱼,水族馆,鲨鱼,鲸鱼,闯关,离线,休闲,解压,合并,鱼类,海底,河豚,章鱼,收藏,无尽,街机,高分,射击,爆破
```

> ⚠ **故意不用「消消乐」**：它强关联竞品品牌（开心消消乐），`appstore-listing` skill 明确列为拒审风险词。
> ⚠ 「深海/弹射/连锁/进化」已进名称/副标题，从关键词里移除（三处取并集，重复 = 白扔额度）。

**宣传文本**（170 上限）
```
锤子、换列、撤销——绝境也能翻盘。从小丑鱼一路合到传说中的皇带鱼，看看你能潜多深。
```

**描述**
```
《深海鱼炮：合成小鱼消除》是一款列式弹射合成游戏：把小鱼往上射，同种小鱼相撞就进化成更大的鱼，一路收集 17 种深海生物。

怎么玩
点哪一列，炮里的鱼就飞进哪一列。落在同种鱼旁边，两条就合成更大的一条——还会继续连锁。射错了，那一列就往底线长；被顶过底线，这一局就结束了。

大团 = 指数级回报
两条同种合并进化一级，三条跳得更远，五条一口气连跳四级。真正的高手不是合得快，而是**憋出一大团，然后一发引爆**。

越合越深
每一级都是一种真实的海洋生物：从浅礁的小丑鱼、凶悍的大白鲨、深海的虎鲸，一路到梯子最底端传说中的皇带鱼。合出过的鱼永久进图鉴；跳过的那一档会一直是灰剪影——你会想回去把它补上。

盘面走坏的时候
锤子砸掉卡死一整列的大鱼；换列重组烂掉的布局；撤销手滑的那一发。每次合并和连锁都攒金币，关键时刻花出去。

· 无尽模式，只有一条规则：别让任何一列越过底线
· 无体力、无倒计时、不等待——一分钟能玩，一小时也能玩
· 支持离线
· 进度保存在你自己的设备上
```

---

## 截图（顺序是硬要求）

**第一张必须是图鉴/收集页（`01-codex`），不许是核心盘面**——盘面是「又一个克隆」的最强信号（4.3(a) 教训）。
顺序：`01-codex → 02-gameplay → 03-chain → 04-tools → 05-deep`（`tools/capture-shots.cjs` + `compose-shots.py` 已按此编号）。

## 分类（送审必填，建 app 后默认为空）

主类 **GAMES** · 子类 **GAMES_PUZZLE + GAMES_CASUAL** · 次类 **ENTERTAINMENT**。
（苹果的 GAMES 底下**没有 ARCADE** 这个子类，别填。）

## 版权 / 分级 / 隐私（提交时要填）

- **Copyright**：`2026 Zhongyuan Tang`
- **年龄分级**：**9+**（含广告；无暴力/成人内容）
- **隐私政策 URL**：`https://fishshoot.ai-speeds.com/privacy.html`
- **隐私标签**：AdMob 会收集**标识符（IDFA）** → 数据类型勾 *Identifiers*，用途 *Third-Party Advertising*，**关联到身份：否**，**用于追踪：是**
- **App 含广告**：是
