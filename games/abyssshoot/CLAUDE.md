# CLAUDE.md — games/abyssshoot

**深渊射手（Abyss Shooter）**：列式 2048 射手 × 深海鱼图鉴。底部加农炮把小鱼往上射进 5 列，同数鱼相撞合并翻倍成更大的鱼；越合越深，创到新最深的鱼就解锁图鉴。root `CLAUDE.md`（引擎契约、部署铁律、git 纪律、iOS 流水线）先读，本文件只讲本游戏专属。

**规格与计划是权威**：`DESIGN.md`（玩法规则，改核心前必查）、`docs/2026-07-10-p1-core-plan.md`（P1 逐任务 TDD 记录 + 蒙特卡洛调平衡结果）。

## 当前状态（2026-07-11）

**P1 纯逻辑内核 + P1b 可玩壳 + P2a-1 动画/音效已完成 —— 浏览器里能真玩了**（仓库根起 http 服 → `http://localhost:8080/games/abyssshoot/`）。
已有：`js/{tiles,core,render,main}.js` + `index.html` + `css/game.css` + `locales/{en,zh-CN}.json` + `assets/audio/*.wav`（6 个合成音效）；测试：`npm run test:abyss`（单测+蒙特卡洛）、`npm run test:abyss:e2e`（Playwright 无头整局，含动画启动/封锁输入验证）。
**还没做**：道具（锤子/交换列/撤销）、图鉴、皮肤、成就、存档续玩、鱼图美术、iOS 壳 —— 见下方「DESIGN 里已定但未实现」与 DESIGN.md 的 P2/P3/P4。

## 验证（改 core/tiles 后必跑）

```bash
npm run test:abyss                          # 单测(tiles+core) + 蒙特卡洛冒烟,已挂进全量 npm test
npm run test:abyss:e2e                      # Playwright 无头:整局跑通 + 截图到 C:\tmp\abyssshoot
node games/abyssshoot/tests/test-core.js    # 单跑 core 单测
node games/abyssshoot/tests/test-sim.js     # 单跑蒙特卡洛(300 局)
node tools/check-locales.js games/abyssshoot/locales   # 必 0 fail
```

## 棋盘模型（最容易搞反的地方）

`s.board` = 长度 `cols` 的数组，每列一个栈：**index 0 = 顶（远离玩家），末尾 = 底（玩家侧 / 死线）**。

- **密实不变式**：每列任何时候都从 index 0 起紧密排列、**无内部空洞**（靠 `gravityUp` 去零重排保证）。
- 这个不变式是**横向邻接判定的前提**——正因为每列都贴顶密实，「相邻列的同一 index」才等于「同一条绝对视觉行」。`findComponents` 的 `c±1` 同 `i` 判定**直接依赖它**。
- ⚠ **P2 加锤子（砸中间块）时，砸完必须立刻 `gravityUp` 重压实**，否则不变式破裂、连通判定全乱。
- 射击 `push` 到列末尾（往玩家侧长），刷行 `unshift` 到 index 0（从顶往下压）——两端都会长，**死亡 = 列高 > `rows`**。

## 三条核心规则（非直觉，别当 bug「修」）

1. **连通块合并语义**（`findComponents` + `resolve`）：一整个四邻相连的同值块（≥2）**塌成 1 个 ×2**（不是按对消——4 个 `4` 合成 1 个 `8`，是有意的数值亏损），落在**锚点 = index 最大（最低）、再 c 最小（最左）**。结算是**确定性单趟**：找出当前所有块 → 同趟全部结算 → 一次 `gravityUp` → 重扫，直到无块。**连锁倍率 = 迭代轮数**，计分 `gained += 新值 × 当前轮数`。改这里必然改手感与平衡，先读 DESIGN §1。
2. **弹药随进度放大**（`genAmmo`）：弹药值恒在 `[最小档 .. 最小档×4]`（`AMMO_WINDOW=3`）。**这是防「大鱼变死墙」的硬不变量**——若把弹药固定成 2，盘上压着 512 时你永远合不动它，游戏卡死。单测有区间断言守着。
3. **唯一失败条件**：任意列 `length > rows` 即死（学 mines 的「一条干净规则」）。没有命数、没有别的死法。

## 纯逻辑纪律

- `core.js`/`tiles.js` 是**双导出**（`const Core = {...}; if (module.exports) module.exports = Core;`），浏览器靠顶层 `const` 当全局，**不写 `this.X=`/`window.X=`**（同 snake）。node 里 require 引擎走 `../../../engine/prng.js`。
- **禁 `Date.now()`**：所有随机走 `s.rand`（`PRNG.create(seed)`，mulberry32）→ 同种子完全可复现，蒙特卡洛与单测才立得住。
- **事件流 `s.events`**：每次 `shoot` 清空重填（`shoot/merge/chain/newMaxFish/spawn/death`）。这是给音效与成就消费的硬契约（同 snake），单测有断言守着——改事件形状要同步改测试。
- **级联逐轮快照**：`resolve` 每轮发 `{t:'round', n, merges, board}`（board 是深拷贝快照），`shoot`/`spawn` 也各带一份 `board` 快照——**这是动画逐轮回放的数据来源**。core 依然纯函数确定；改 resolve 时别把这些快照弄丢，否则动画退化成瞬间闪现。
- `resolve` 有 `MAX_ITERS` 硬上限，不收敛就 throw（防死循环，正常规则下够不到）。

## 可调平衡参数（蒙特卡洛调，别拍脑袋）

`core.js` 顶部：`PREVIEW=3`（预览发数）、`AMMO_WINDOW=3`（弹药档窗）、`SPAWN_EVERY=6`（每 N 发刷一行）、`TILE_MIN=2`、`cols=5`/`rows=9`。

**蒙特卡洛口径**：无尽刷分**没有「可赢性」可验**（区别于 mines 的必胜门禁）——`test-sim.js` 只验「不变量成立 + 无退化的秒死/永生局 + 局长分布合理 + resolve 收敛」。当前随机瞎打 300 局：**局长 min=18 / 中位=54 / 均=57 / max=128**（起始参数首跑即达标，未调；P2a-1 加动画快照后复跑分布完全一致，规则未被误改）。调参后必须回填分布到计划文档。

## 动画（P2a-1）——三条别踩回去的坑

`render.js` 顶部 `ANIM = { fly, merge, spawn, death }`（毫秒，调手感在这里）。动画播放期间 `main.js` **封锁输入**（`G.anim` 非 null 即拒绝 dispatch），播完才判死进 DEAD。`G.noAnim = true` 可跳过动画瞬间结算（E2E 用）。RAF 循环**空闲即停**（不烧 CPU）。

1. **红警不许在动画期画**：`Core.shoot` 是**同步算完整局结算**才启动动画的 —— 动画一开始 `s.board` 就已经是「死了的终局盘」。所以盘面步骤（fly/merge/spawn）期间 `renderAll` **跳过 `drawBreaches`**：否则弹药还在半空，顶爆红框红洗已经贴脸剧透死亡，动画白做。红警只在 `death` step 与静态帧亮。顺带也防「同一格被 step 和 drawBreaches 双画」。
2. **越线格只有一套 y 公式**：动画里的越界格走 `tileY()`，它在 `i >= rows` 时**恰好等于 `drawBreaches` 的越线偏移**（`test-anim.js` 逐值断言守着）。两套公式 = 弹药压过死线那一下跳帧。
3. **绘制抛错必须强制解锁**：`renderAll` 一律经 `safeRender()`（try/catch）。裸调时一旦绘制抛异常，RAF 断掉 → `G.anim` 永不清空 → **所有输入（含 RESTART）被永久封死且零提示**。单帧 delta 也夹到 100ms（切后台恢复时墙钟 delta 暴涨会整段跳过动画步）。

`mapColumn`（重力压实后的 index 重映射，动画位置插值的心脏）逻辑最绕，**改它必跑 `test-anim.js`**（render.js 末尾有薄双导出供 node require）。

## DESIGN 里已定但 core 尚未实现的规则（P1b/P2 接线时补）

- **梯子封顶**：DESIGN §3 定「合到最深鱼即封顶、顶档鱼不再合当稳定块」——`resolve` 目前**未消费 `tiles.js` 的 `MAX_TILE_VALUE`**，8192 之上仍会继续合。做图鉴时要回来接。
- 巨数显示（高档纯鱼图/缩写）、道具（锤子 / 交换列或清行 / 单步撤销含 RNG 游标三件套 + 每日盘禁用撤销）、图鉴、皮肤（纯背景群系，不换鱼）、成就——全在 DESIGN 里，均未做。

## 美术

`js/tiles.js` 是数字→鱼的梯子（13 档，2 小丑鱼 → 8192 白鲸，浅礁→深渊）。素材复用 **fishId** 项目：`C:/Users/tangz/Documents/fishId/assets/fish/cute/`（271 条已去背景 webp，物种命名）。**不是拿来即用**——当格子图标要过一道预处理（统一裁切 + 尺寸归一 + 投影 + 数字 badge 叠图保可读），走 `~/.claude/skills/game-art-pipeline`。美学参考用户自己的 **2048 Abyss「Deep Merge」**（`C:/Users/tangz/Documents/Projects/2048`，本仓引擎的源头）。开发期先 emoji/纯色占位。
