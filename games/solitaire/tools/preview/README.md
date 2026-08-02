# Fair Deal · App Preview 预览片（886×1920，无声）

```bash
node games/solitaire/tools/preview/capture.cjs   # 录原片 → preview-raw.webm（+ caps.json）
node games/solitaire/tools/preview/mux.cjs       # 切头 + 编码 → C:/tmp/solitaire/preview/fairdeal-preview-en.mp4
```

**做法**：舞台页（886×1920）里嵌 443×960 的 iframe 装**真 app**、`transform:scale(2)` 矢量放大；
用 `contentWindow.eval` 驱动真实游戏（classic script 的顶层 `const` 不挂 window，只能 eval）；
字幕/进度点/结尾卡全在舞台层，绝不动 app 的 DOM 与 canvas。

**片子里每一步都是真的**：真求解器在算、真解法在走（`DEMO3` 是产品自带的「演 3 步」）、
真结算屏、真图鉴。这个品类的卖点就是「可验证」，画面本身更不该造假。

## 25 秒的节奏（6 幕）

| 幕 | 画面 | 字幕 |
|---|---|---|
| 1 | Klondike 局中（真解法走到最饱满的一步） | Every deal has **a solution** |
| 2 | 按下「这局还有解吗」→ 真的在算 → 给答案 | Ask any time: **is this still winnable?** |
| 3 | 「演 3 步」把解法的头三步走出来 | The hint is **the move that wins** |
| 4 | FreeCell 打一段 → Spider 发牌 | Klondike · **FreeCell** · Spider |
| 5 | 赢局结算（连关倍率 + 本局榜 + 新天使） | Win a deal, **collect an angel** |
| 6 | 天使图鉴 137/500 → 结尾卡 | **500 angels** to collect |

## 踩过的坑（都在代码注释里，这里只列结论）

- ⛔ **无音乐无音效**（用户 2026-08-01 定）。但**不能没有音轨**：苹果转码对声道较真
  （mono 会 `FAILED MOV_RESAVE_STEREO`）⇒ 铺一条**静音的立体声 AAC**（实测 -91dB = 数字静音）。
- ⛔ **字幕默认贴底会盖住「这局还有解吗」那条** —— 那是整片最核心的一屏。玩法幕一律用
  `.mid`，抬到牌桌中段那片空绿上（顺带把高屏的空牌桌利用起来）。
- ⚠ **首帧黑**：`blackdetect` 的 `d=0.2` 抓不到**单帧**黑（实测 YAVG=16），要在 `black_end`
  之后再多切 0.05s —— 平台默认拿第一帧当封面，别留黑。
- ⚠ **发牌动画期间 `dispatch("STOCK")` 会被吃掉**（连发两次仍写着「5 deals left」）⇒
  先等发牌落定再一次一次发。
- ⚠ 字幕写着三种玩法就得三种都露脸 —— 只演两种等于文案在吹。
- ⚠ 抓图前 `Money.state.noAds = true`：**2.3.7**，画面里不许出现「看广告 → 免费解锁」
  （本作 2026-07-22 就因素材含 "free" 被拒过一次）。
- 验收：`mux.cjs` 自己校验分辨率/时长/帧率/声道并用退出码裁决；**再抽帧做接触表肉眼看一遍**
  （`ffmpeg -i out.mp4 -vf "select='not(mod(n,34))',scale=270:-1,tile=7x3" -frames:v 1 sheet.png`）。

## 上传（⛔ 要先经用户批准）

`appPreviewSets`(previewType=`IPHONE_67`，挂 en-US 版本本地化，其余 locale 自动回退) →
`appPreviews` 预留 → 分块 PUT → PATCH `uploaded:true`+md5 → 轮询 `assetDeliveryState=COMPLETE`
→ PATCH `previewFrameTimeCode` 选海报帧（建议 `00:00:06:00` 那一带：证明器刚给出答案）。
详见 `~/.claude/skills/appstore-listing`。
