# snake App Preview（商店介绍视频）管线

照 language-study 的 `store-screenshots` 姊妹管线做的视频版。产物 **886×1920 / 24s / H.264**
（App Store 6.7" 预览片槽位；硬性要求 15–30s）。

```bash
node games/snake/tools/preview/capture.cjs   # 录原片 → preview-raw.webm + sfx.json/caps.json
node games/snake/tools/preview/mux.cjs       # 配音编码 → C:/tmp/snake/preview/snake-preview-en.mp4
```

## 怎么做到「画面是真的」

`video-stage.html` 用 iframe 装**真的 app**（443×960 ×2 放大），靠 `contentWindow.eval` 驱动真实状态，
外层只叠字幕/转场/彩纸/结尾卡。⭐ 玩法幕**开 AI 代打让它自己玩** —— 蛇真的在走、图真的在被揭开
（这是产品自带的免费功能，不是录屏替身）。

## 六幕

1. 揭图玩法（AI 真跑）· 2. 一颗苹果揭 9 格 · 3. 过关三星 + 彩纸 · 4. 图鉴 500 · 5. 四款皮肤 · 6. 结尾卡

## 声音：默认**不放背景音乐**（2026-08-01 用户定：「不要音乐，直接动画」）

片子只有画面 + **游戏自己的音效**（吃果子用游戏内那条上行音阶，连吃一级级升；过关/解锁用 wav）。
商店预览片本来大多是静音自动播放，BGM 反而抢戏。合成配乐的代码留着，`--bgm` 随时开回来，
`--silent` 则完全无声轨。

⚠ 纯音效轨的三条：
- **别用 loudnorm**：整轨大半是静音，把积分响度拉到 -14 等于把那几声轰到削顶 ⇒ 改**按峰值归一**
  （volumedetect 量真实峰值 → 补到 -4 dBFS → 限幅）。第一版忘了补，成片峰值只有 -18.9 dBFS ≈ 听不见。
- **amix 要 `duration=longest`**：写 `first` 时第一路是「第一个延迟过的音效」，混音在它结束时就停 ——
  实测整条音轨只剩 5.96s，后面全没了（波形图一眼看出）。
- **末尾 apad 补静音到全片长**，否则音轨比视频短一截。

## 配乐（music.cjs，默认不用）

第一版是「六个音的琶音死循环 + 低音垫」，听 5 秒就腻 —— 问题不在音色，在**没有音乐结构**。
现在是：**I–V–vi–IV ×2 → C 解决**（88BPM，9 小节 ≈ 24.5s）· 四个声部（pad / 音乐盒主旋律 /
每小节根音 / 高音点缀）· **段落对着六幕排**（留白 → 主题 A → 抬一层 → 升八度 → 推进 → 解决）·
立体声（左右微失谐拉开声场）· tanh 软限幅 + 首尾淡入淡出。
吃果子的音效直接用**游戏内那条上行音阶**（连吃一级级升），片子的声音和真机一致。

⚠ **没耳朵可用时怎么验**（三张图就够）：

```bash
ffmpeg -i out.mp4 -filter_complex "[0:a]showspectrumpic=s=1000x400:legend=1[v]" -map "[v]" -frames:v 1 spec.png   # 段落起伏 / 末尾有没有解决
ffmpeg -i out.mp4 -filter_complex "[0:a]showwavespic=s=1000x220[v]"  -map "[v]" -frames:v 1 wave.png              # 动态弧线 / 有没有削顶
ffmpeg -i out.mp4 -af ebur128=peak=true -f null -                                                                 # LUFS / True peak
```

## 踩过的坑（都已写进代码注释）

- **黑幕切头要用实测值**：`ffmpeg -i preview-raw.webm -vf blackdetect=d=0.2:pix_th=0.10 -an -f null -`
- **`-t` 是切头之后的时长**：写成 `DUR - TRIM` 会把片尾结尾卡砍到只剩 0.6s。
- **音效时间戳要 `+TRIM`**：sfx 相对 t0，而 `-ss` 在滤镜之后砍头；写成 `-TRIM` 会全糊在开头。
- **BGM 要铺满 `DUR + TRIM`**，否则片尾是死寂。
- **多词高亮 `{g:it is yours}` 必须先整体切段再逐词包**：老写法按空格拆完再匹配，
  片子里会原样出现 `{g:...}`。
- **`#toasts` 要整幕禁掉**：AI 一开始玩就不断解锁成就，"Unlocked! …" 会一条条糊在顶部。
- **小节数要按片长倒推**：11 小节 × 2.727s = 30s，24s 的片子把末尾那个解决和弦整个切掉了（听着像被掐断）。
- **BGM 要延后 TRIM 才和画面对齐**（-ss 在滤镜之后砍头），否则前奏被砍、段落全错位。
- **loudnorm 要两遍**：单遍是自适应的，实测把这条片推到 -11.2 LUFS（比目标吵 3dB）；两遍才真的落在 -14。
- **AI 代打按钮是 canvas 画的、CSS 藏不掉** ⇒ 用 `#lower` 品牌带盖住按钮区（⛔ 绝不盖盘面）。
