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

## 踩过的坑（都已写进代码注释）

- **黑幕切头要用实测值**：`ffmpeg -i preview-raw.webm -vf blackdetect=d=0.2:pix_th=0.10 -an -f null -`
- **`-t` 是切头之后的时长**：写成 `DUR - TRIM` 会把片尾结尾卡砍到只剩 0.6s。
- **音效时间戳要 `+TRIM`**：sfx 相对 t0，而 `-ss` 在滤镜之后砍头；写成 `-TRIM` 会全糊在开头。
- **BGM 要铺满 `DUR + TRIM`**，否则片尾是死寂。
- **多词高亮 `{g:it is yours}` 必须先整体切段再逐词包**：老写法按空格拆完再匹配，
  片子里会原样出现 `{g:...}`。
- **`#toasts` 要整幕禁掉**：AI 一开始玩就不断解锁成就，"Unlocked! …" 会一条条糊在顶部。
- **AI 代打按钮是 canvas 画的、CSS 藏不掉** ⇒ 用 `#lower` 品牌带盖住按钮区（⛔ 绝不盖盘面）。
