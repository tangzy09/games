# CLAUDE.md — games/abyssshoot

**深渊射手（Abyss Shooter）**：列式 2048 射手 × 深海鱼图鉴。底部加农炮把小鱼往上射进 5 列，同数鱼相撞合并翻倍成更大的鱼；越合越深，创到新最深的鱼就解锁图鉴。root `CLAUDE.md`（引擎契约、部署铁律、git 纪律、iOS 流水线）先读，本文件只讲本游戏专属。

**规格与计划是权威**：`DESIGN.md`（玩法规则，改核心前必查）、`docs/2026-07-10-p1-core-plan.md`（P1 逐任务 TDD 记录 + 蒙特卡洛调平衡结果）。

## 当前状态（2026-07-11）

**已上 TestFlight（`VALID`），功能完整可玩。** 线上 web：<https://fishshoot.ai-speeds.com>

- **玩法**：五条核心规则（全部经玩家实战校正）+ 动画 + 9 音效 + 17 条深海鱼 + 🐟 鱼图鉴 + 存档续玩 + 最高分 + 🔨🔀↩ 三道具 + 金币经济 + 激励广告（复活/换金币/插屏）。
- **iOS**：Bundle ID `com.aispeeds.fishshooter`；ASC「**2048 Shooter: Fish Merge**」Apple ID `6790052330`；AdMob App `ca-app-pub-2141208066469648~1063418775`（激励 `/5808478997`、插屏 `/7442527234`，**本游戏专属，绝不复用他游戏的**）。
- **⚠ 内部代号仍是 abyssshoot / Abyss Shooter，但面向用户的一切都不含 "Abyss"** —— 因为本账号已有上架的「2048 Abyss」，同名会撞 Apple 4.3(a)。原因与命名方案见 `docs/aso-appstore.md`，**别"优化"回去**。
- **还没做**：商店截图与文案、提交审核、每日盘、成就、皮肤、Android。

## 验证（改 core/tiles/storage/codex/tools 后必跑）

```bash
npm run test:abyss                          # 单测(tiles+core+storage+codex+tools) + 蒙特卡洛冒烟,已挂进全量 npm test
npm run test:abyss:e2e                      # Playwright 无头:整局跑通 + 图鉴 + 存档续玩 + 道具(锤子/撤销/金币门槛) + 截图到 C:\tmp\abyssshoot
node games/abyssshoot/tests/test-core.js    # 单跑 core 单测(含 RNG 游标可复现)
node games/abyssshoot/tests/test-storage.js # 单跑存档单测(版本门控/保守合并/开放map/形状校验/精确恢复)
node games/abyssshoot/tests/test-codex.js   # 单跑图鉴单测(见过即解锁/允许有洞)
node games/abyssshoot/tests/test-tools.js   # 单跑道具单测(密实不变式硬断言 + 防 save-scum 断言)
node games/abyssshoot/tests/test-sim.js     # 单跑蒙特卡洛(300 局)
node tools/check-locales.js games/abyssshoot/locales   # 必 0 fail
```

## 棋盘模型（最容易搞反的地方）

`s.board` = 长度 `cols` 的数组，每列一个栈：**index 0 = 顶（远离玩家），末尾 = 底（玩家侧 / 死线）**。

- **密实不变式**：每列任何时候都从 index 0 起紧密排列、**无内部空洞**（靠 `gravityUp` 去零重排保证）。
- 这个不变式是**横向邻接判定的前提**——正因为每列都贴顶密实，「相邻列的同一 index」才等于「同一条绝对视觉行」。`findComponents` 的 `c±1` 同 `i` 判定**直接依赖它**。
- ⚠ **P2 加锤子（砸中间块）时，砸完必须立刻 `gravityUp` 重压实**，否则不变式破裂、连通判定全乱。
- 射击 `push` 到列末尾（往玩家侧长），刷行 `unshift` 到 index 0（从顶往下压）——两端都会长，**死亡 = 列高 > `rows`**。

## 五条核心规则（非直觉，别当 bug「修」）

1. **连通块合并 = 指数奖励**（`findComponents` + `resolve`）：四邻相连的同值块 N 个（N≥2）→ **合并 N-1 次 → `V × 2^(N-1)`**，落在锚点（锚点怎么选见规则 3）。3 连=4 倍、4 连=8 倍、5 连=16 倍——**「憋大团」是核心爽点与赌注**。结算是**确定性单趟**：找出当前所有块 → 同趟全部结算 → 一次 `gravityUp` → 重扫，直到无块。**连锁倍率 = 迭代轮数**，计分 `gained += 新值 × 当前轮数`。
   - ⚠ **2026-07-11 玩家实战推翻的旧规则**：原本不论 N 一律塌成 `×2` → **凑的团越大亏得越多**（5 个 4 → 8，总值 20→8，亏 12）。反玩家、一上手就撞到。**已废弃，勿回退。**
2. **弹药与刷行都从「盘面现有值」抽样，且盘上当前最大值绝不出现**（`pickFromBoard(s, bias, excludeMax=true)`）——不是公式算区间。偏小抽样（`AMMO_BIAS=2` / `SPAWN_BIAS=3`，`r^bias` 权重）：主要靠「射小鱼 → 级联长大」推进（经典 2048 射手的正路）。
   - **最大值排除**：能直接射到当前最大值 = 白嫖（射一条 1024 贴到 1024 上直接得 2048），「挣到最深的鱼」就没意义了。**最深的鱼只能靠合并去挣。** 也顺带堵死「皇带鱼被抽成弹药、射出更多顶档大块」的坑。兜底：盘上只剩一种值（排除后池子空）→ 给条 `TILE_MIN` 小鱼当火种。
   - ⚠ **防「两端死墙」的硬不变量，玩家两次实战撞出来的**：
     - ① 弹药挂「盘上最小值」+ 刷行恒生 2/4 → 最小值被永久钉死在 2 → 弹药永远 `{2,4,8}` → 列底的 256 **永远合不动**（**大鱼死墙**）。
     - ② 改成挂 `baseTier`（随 maxTile 上浮、只升不降）→ 早期留在盘上的 2/4 **再也抽不到**（**小鱼死墙**，同一个病反过来）。
     - **任何公式法都必然在某一端漏掉盘上真实存在的值。** 从盘面抽样是结构性解法：盘上有什么，你就可能拿到什么。单测钉死两条：弹药必须是盘上真实存在的值 + 盘上每个不同的值都抽得到。**勿回退成公式法。**
3. **优先向击中块合并**（`pickAnchor`）：锚点**优先取玩家打中的那一格**（`shoot` 把击中格传给 `resolve`）；连锁时**继续以上一轮合出的那条鱼为锚**（大鱼原地滚雪球）；都不沾边（如刷行连带触发的块）才回退几何规则「最低、再最左」。
   - ⚠ 纯几何锚点的毛病（2026-07-11 玩家指出）：跨列连通块时，合出的大鱼会长在**你没瞄的那一列**，「把大鱼摆在哪」完全失控。改后玩家才真正掌控布局。**实测副作用是正向的**：中位局长 48→59、随机瞎打最高鱼 4096→65536（连锁能原地积累，不再每合完就窜走）。单测有跨列反证用例守着。
4. **梯顶（皇带鱼 131072）相遇则双双游走**：两条以上顶档鱼相邻 → **全部清空 + 巨额分数**（`MAX_V × 条数 × 连锁轮数`），发 `escape` 事件。单条不成块 → 原地稳定，你可以**主动再合一条来清掉它**（策略目标）。指数规则冲过梯顶的结果**钳到梯顶**。
   - ⚠ **DESIGN 原案「顶档不合并、当永久稳定块」已废弃**：那会让皇带鱼成为**永久不可消的方块**，卡在列底 = 那一列判死刑；**最大的成就反而变成杀死你的东西**。（另注：我曾误判「不跳过顶档会导致 resolve 死循环」——实测**不会**，连通块合并会塌成一格、循环自然停止。别被旧注释误导。）
   - 图鉴不受影响：`maxTile` 记录过 131072 就永久解锁，鱼游走了也算收集到。
5. **唯一失败条件**：任意列 `length > rows` 即死（学 mines 的「一条干净规则」）。没有命数、没有别的死法。

## 纯逻辑纪律

- `core.js`/`tiles.js` 是**双导出**（`const Core = {...}; if (module.exports) module.exports = Core;`），浏览器靠顶层 `const` 当全局，**不写 `this.X=`/`window.X=`**（同 snake）。node 里 require 引擎走 `../../../engine/prng.js`。
- **禁 `Date.now()`**：所有随机走 `s.rand`（`PRNG.create(seed)`，mulberry32）→ 同种子完全可复现，蒙特卡洛与单测才立得住。
- **事件流 `s.events`**：每次 `shoot` 清空重填（`shoot/merge/chain/newMaxFish/spawn/escape/death`）。这是给音效与成就消费的硬契约（同 snake），单测有断言守着——改事件形状要同步改测试。
- **级联逐轮快照**：`resolve` 每轮发 `{t:'round', n, merges, board}`（board 是深拷贝快照），`shoot`/`spawn` 也各带一份 `board` 快照——**这是动画逐轮回放的数据来源**。core 依然纯函数确定；改 resolve 时别把这些快照弄丢，否则动画退化成瞬间闪现。
- `resolve` 有 `MAX_ITERS` 硬上限，不收敛就 throw（防死循环，正常规则下够不到）。

## 可调平衡参数（蒙特卡洛调，别拍脑袋）

`core.js` 顶部：`PREVIEW=3`（预览发数）、`SPAWN_EVERY=6`（每 N 发刷一行）、`AMMO_BIAS=2`/`SPAWN_BIAS=3`（从盘面抽样的偏小系数，**最关键的平衡钮**）、`TILE_MIN=2`、`cols=5`/`rows=9`。鱼梯 17 档（`tiles.js`，顶到 131072 皇带鱼）；`render.js` 的 `PAL.tiers` 必须 ≥ 鱼梯档数，否则高档取模绕回浅色撞色。

**蒙特卡洛口径**：无尽刷分**没有「可赢性」可验**（区别于 mines 的必胜门禁）——`test-sim.js` 只验「不变量成立 + 无退化的秒死/永生局 + 局长分布合理 + resolve 收敛」。当前随机瞎打 300 局（AMMO_BIAS=4 / SPAWN_BIAS=5 后）：**局长 min=25 / 中位=62 / 均=67 / max=132**；**最高鱼中位=256（鮟鱇）、max=2048（大白鲨）**。⚠ 这是「随机选列、完全不动脑」的**下限**——大鱼弹药只占 16%，进度必须靠憋大团去挣，会玩的人应走得深得多。连通块大小分布：2 连 76% / 3 连 14% / 4 连 4% / 5+ 连 3%（指数大奖够得着但不廉价）。

## 动画（P2a-1）——三条别踩回去的坑

`render.js` 顶部 `ANIM = { fly, merge, spawn, death }`（毫秒，调手感在这里）。动画播放期间 `main.js` **封锁输入**（`G.anim` 非 null 即拒绝 dispatch），播完才判死进 DEAD。`G.noAnim = true` 可跳过动画瞬间结算（E2E 用）。RAF 循环**空闲即停**（不烧 CPU）。

1. **红警不许在动画期画**：`Core.shoot` 是**同步算完整局结算**才启动动画的 —— 动画一开始 `s.board` 就已经是「死了的终局盘」。所以盘面步骤（fly/merge/spawn）期间 `renderAll` **跳过 `drawBreaches`**：否则弹药还在半空，顶爆红框红洗已经贴脸剧透死亡，动画白做。红警只在 `death` step 与静态帧亮。顺带也防「同一格被 step 和 drawBreaches 双画」。
2. **越线格只有一套 y 公式**：动画里的越界格走 `tileY()`，它在 `i >= rows` 时**恰好等于 `drawBreaches` 的越线偏移**（`test-anim.js` 逐值断言守着）。两套公式 = 弹药压过死线那一下跳帧。
3. **绘制抛错必须强制解锁**：`renderAll` 一律经 `safeRender()`（try/catch）。裸调时一旦绘制抛异常，RAF 断掉 → `G.anim` 永不清空 → **所有输入（含 RESTART）被永久封死且零提示**。单帧 delta 也夹到 100ms（切后台恢复时墙钟 delta 暴涨会整段跳过动画步）。

`mapColumn`（重力压实后的 index 重映射，动画位置插值的心脏）逻辑最绕，**改它必跑 `test-anim.js`**（render.js 末尾有薄双导出供 node require）。

## 存档（P2b-1）—— 三条别踩回去的坑

- **版本门控丢弃不迁移**：`SAVE_V` 不匹配 → 整份回 `defaults()`。改 `G`/存档形状必 bump。畸形快照恢复 = 0×0 盘面 = **无报错白屏**，全新档案的 E2E 测不出来。
- **保守合并的「开放 map」陷阱**（snake 的 Critical，勿重蹈）：`merge()` 靠「defaults 里是空对象 `{}`」判断某字段是动态-key 的开放 map 并**整体透传**。`stats.fishSeenCount` 必须保持 `{}` 默认——**塞了非空默认就会退回逐 key 递归、每次 load 清空动态 key**。以后新增开放 map 字段照此保持 `{}`。
- **只在稳定盘落盘**：`Core.shoot` 返回时盘面已结算完毕（动画只是视觉回放）。绝不在动画中途 `persist()`，否则续玩恢复成半截盘。
- **续玩精确恢复（P2b-2 改过一次）**：`snapshotRun` 曾经靠**换新种子**（`seed2`，`Math.random` 的唯一豁免）恢复——意味着**刷新页面就能重摇弹药**（save-scum）。已改成存 `seed + rolls`，`restoreRun` 用 `Core.attachRand` 精确回放 RNG 游标；`Math.random` 在 core 之外的豁免也顺手消掉了。

## 图鉴（P2b-1）

**「见过即解锁」**：某个值只要在盘面上**真实存在过**（合出来的/射上去的/刷下来的）就永久进 `save.codex.seen`。
⚠ **允许有洞、不许撒谎**：指数合并可跳档（3 个 2 连 → 直接 8，跳过 4）。某档从没出现过就该**如实显示未解锁**——这是完美主义者的收集动力。**不要**用「≤ maxTile 就全解锁」去填洞。
UI 是 DOM 浮层 `#panel`（同 snake 的 gallery，canvas 只画游戏）：已解锁 = 彩色鱼图 + 名字 + 数值；未解锁 = `filter: brightness(0) invert(0.28)` 灰剪影 + `???`（`.cx-item.locked img`，见 `css/game.css`）。

## 命名冲突提醒（P2b-1 踩过一次）

浏览器里各 `<script>` 共享全局词法环境。`core.js` 已声明 `PRNG_`/`TILES_`，`storage.js`/`codex.js` 必须换名（`PRNG_S_`/`TILES_C_`）——重名会 `SyntaxError: Identifier has already been declared`，整个游戏白屏。以后新增纯逻辑模块照此检查命名。

## 道具（P2b-2）—— 三条别踩回去的坑

- **🔨 锤子砸完必须立刻 `gravityUp`**：棋盘的「每列从 index0 起密实、无空洞」是**横向连通判定的前提**（`findComponents` 靠「相邻列同 index = 同一绝对行」）。砸出空洞不压实 → **连通判定全乱、合并出错，且悄无声息**。砸完还要 `resolve`（移除会制造新相邻 → 连锁）。`test-tools.js` 有密实不变式硬断言守着。
- **撤销必须精确回退 RNG**：`rand` 是闭包读不出状态 → 记 `s.rolls`（调用次数），回退时用同一 `seed` 重建并空转 `rolls` 次快进。**没有这个，撤销 = 重摇弹药（save-scum）**。同理 `storage.snapshotRun` 也改成存 `seed+rolls` 精确恢复——**刷新页面也不能重摇弹药**了（顺手消掉了 core 里 `Math.random` 的最后一处豁免）。
- **道具用完必须清 `G.undoSnap`**：道具改了盘面后，那份「上一发之前」的快照已经对不上现在的状态；不清掉，玩家撤销会回到一个**错误的过去**。
- `pickFromBoard` 的空盘/单值盘早退分支也补了一次 `s.rand()`（结果仍是确定性 `TILE_MIN`，只是烧一次游标）——否则 `createGame` 后 `rolls` 恒为 0（初始盘总是空的），RNG 游标的「每次抽样尝试都推进」语义就不一致，撤销/续玩回放的起点会对不上。

## 金币经济（蒙特卡洛定的）

来源：`合并×1 + 连锁×5 + 梯顶游走×50`（`tools.js` 的 `COIN`）。价格：撤销 30 / 锤子 60 / 交换 80（`COST`）。
⚠ **不用分数计价**：分数是指数级的（`V×2^(N-1)`），高手一局能滚到 10 万分 → 用分数换币会让高手**暴富、道具免费**（实测跨水平差 **11 倍**）。改用「合并/连锁」只差 **3 倍**，技巧仍被奖励但不失控。随机瞎打中位一局攒 **130 币**（够用约 2 次），金币**跨局累积**。

## 广告（P3a）

三个投放位：**死亡复活**（看广告 → 每列削顶部 3 格 + 继续，每局限 2 次）、**看广告换金币**（+100）、**局间插屏**（每 3 局，放 RESTART 不放死亡那一刻——别打断情绪）。顶栏 🛡️ 是 GDPR 隐私选项（欧盟要求可随时撤回同意；web 上无副作用）。

- ⚠ **复活削「顶部」不削「底部」**：两者同样降低列高（同样远离死线），但**顶部是最老的杂鱼、底部是玩家辛苦垒的大鱼**。削底部 = 毁掉玩家的成果。反直觉但正确。
- ⚠ **复活/道具改完盘面必须清 `G.undoSnap`**（旧快照已对不上现状）。
- ⚠ **`G.adBusy` 防连点**：广告是异步的，不锁会重复请求。
- ⚠ **插屏必须「先 `newGame()`（同步），再放广告」**：反过来（`showInterstitial().finally(() => newGame())`）会把建新局推迟到微任务 → **RESTART 之后紧跟的任何操作（玩家连点/脚本/E2E）都会打在旧的死盘上、静默失效**。先建好新局、让广告盖在新盘之上，竞态根本不存在。E2E 有断言守着。
- ⚠ **道具栏只在 `PLAYING` 时画和 `addHit`**：曾经在任何相位都画且注册热区，但 `dispatch` 的守卫要求 `PLAYING` → 按钮**看起来能点、点了没反应**（死按钮），还挤在死亡覆盖层里跟「再次下潜」抢视线。**画了就要能点，能点就要有效**。E2E 有「DEAD 时道具栏无热区」的防回归断言。
- ⚠ **插屏节奏是跨 `dispatch('RESTART')` 计数的(`stats.runsSinceAd`)，触发时 `newGame()` 走 `Ads.showInterstitial().finally(...)`,被推迟到微任务**——若测试/脚本在同一个同步块里紧跟着对旧 `G.s` 操作(如连续 `dispatch('SHOOT',...)`),会打在还没重开的旧盘上、静默失败。`e2e-p1b.cjs` 已在每次 START/RESTART 前清零该计数以绕开这个坑；以后新增会大量调 RESTART 的测试/脚本照此处理。

### ⚠⚠ 上线前必做（现在是 Google 测试广告位！）

`index.html` 的 `GAME_CONFIG.adUnits` **现在是空的** → 引擎自动用 **Google 官方测试位** + `initializeForTesting`（开发期安全，**但没有收入，且拿测试位跑真流量会被 AdMob 封号**）。

上架前必须：
1. AdMob 后台建 app（**本游戏专属**，绝不复用他游戏的 ID）+ 建激励/插屏广告位 → 见 `~/.claude/skills/admob-monetization`。
2. 把真 ID 填进 `index.html` 的 `GAME_CONFIG.adUnits` 与 `codemagic.yaml` 的 `GAD_APP_ID`。
3. AdMob 后台配 UMP（GDPR）同意消息，否则欧盟用户不会看到同意弹窗。

**web 端目前无收入**：`Ads` 会降级成 `confirm()` 模拟。要在 web 上真赚钱得铺游戏门户（`~/.claude/skills/html5-game-portals`，`engine/portal.js` 适配已写好）。

## DESIGN 里已定但 core 尚未实现的规则（P1b/P2 接线时补）

- **梯子封顶**：DESIGN §3 定「合到最深鱼即封顶、顶档鱼不再合当稳定块」——`resolve` 已消费 `tiles.js` 的 `MAX_TILE_VALUE`（梯顶「相遇则游走」，见上方「五条核心规则」第 4 条），此项已接。
- **道具已接**：锤子 / 交换列 / 单步撤销（含 RNG 游标三件套）已在 P2b-2 做完，见上方「道具（P2b-2）」小节。每日盘禁用撤销仍未做（每日盘本身还没做）。
- 巨数显示（高档纯鱼图/缩写）、皮肤（纯背景群系，不换鱼）、成就、每日盘——全在 DESIGN 里，均未做。图鉴/存档/最高分/金币/道具已分别在 P2b-1/P2b-2 做完，见上方对应小节。

## 美术

`js/tiles.js` 是数字→鱼的梯子（**17 档**，2 小丑鱼 → 131072 皇带鱼，浅礁→深渊；指数合并规则让数值涨得快，13 档不够用，已扩）。`render.js` 的 `PAL.tiers` 必须 ≥ 鱼梯档数。素材复用 **fishId** 项目：`C:/Users/tangz/Documents/fishId/assets/fish/cute/`（271 条已去背景 webp，物种命名）。**不是拿来即用**——当格子图标要过一道预处理（统一裁切 + 尺寸归一 + 投影 + 数字 badge 叠图保可读），走 `~/.claude/skills/game-art-pipeline`。美学参考用户自己的 **2048 Abyss「Deep Merge」**（`C:/Users/tangz/Documents/Projects/2048`，本仓引擎的源头）。开发期先 emoji/纯色占位。
