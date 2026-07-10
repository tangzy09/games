# 天使贪吃蛇 P3a(广告位接线 + iOS 打包脚手架)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 设计 §10 的三个游戏内广告位(复活/AI 救场 10s/插屏每 2 关)接引擎 `Ads`(web=confirm 模拟即可全流程测试,native=AdMob 测试 ID 已就绪)+ iOS 打包全部本地准备物(dist 组装 build 脚本、Capacitor 工程、图标/启动屏、codemagic.yaml)。AdMob 后台/App Store Connect/Codemagic 云构建等凭据环节**不在本计划**(协调者随后亲自处理)。

**约定:** 同前(仓库根、禁 `git add -A`、Co-Authored-By 尾注、游戏时钟)。引擎 `Ads.showRewarded()→Promise<bool>` / `Ads.showInterstitial()`(web 无 Portal 时 confirm 模拟;boot 已 `await Ads.init()`)。参考:`engine/ads.js`、2048 的 `capacitor.config.json`/`codemagic.yaml`(打包模板,坑已录)。

---

### Task 1: 复活广告位(死亡弹窗 📺 复活)

**Files:** `core.js`(+revive)、`main.js`、`render.js`(DEAD overlay 第二按钮)、locales、`test-core.js`(revive 断言)

- core.js:`die()` 里在 `combo = 0` **之前**存 `s.comboBeforeDeath = s.combo;`;新增导出 `revive(s)`:`s.dead = false; s.combo = s.comboBeforeDeath || 0;`(蛇原地原长;deaths 计数保留——看广告复活也算死过,不影响「无死亡通关」语义;定时效果已在 die 清空,可接受)。test-core 追加:养长→撞死→revive→断言 !dead、长度不变、combo 恢复、deaths=1、可继续 step。
- main.js:`G.revivesThisLevel = 0`(enterReady 重置);dispatch 加 `REVIVE`:

```js
    case 'REVIVE':
      if (G.phase === 'DEAD' && G.revivesThisLevel < 2) {
        Ads.showRewarded().then(ok => {
          if (!ok || G.phase !== 'DEAD') return;
          G.revivesThisLevel++;
          Core.revive(G.run);
          G.save.stats.revives++;
          const u = Ach.checkCum(G.save).unlocked;      // rev_* 成就
          if (u.length) showAchToasts(u);
          persist();
          G.phase = 'PLAYING'; loopState.last = 0; renderAll();
        });
      }
      break;
```

- render.js:DEAD overlay 用 drawOverlay 的 extra 第二按钮(P2c 已有 extra 机制):`G.revivesThisLevel < 2` 时传 `{ label: T('ads.revive'), action: 'REVIVE' }`(主按钮仍是「重新出发」半长重生)。
- locales:`ads.revive`("📺 Revive (ad)" / "📺 看广告原地复活")。

Commit:`feat(snake): 复活广告位——看激励视频原地满状态复活,每局限2次`

### Task 2: AI 救场 10 秒(rewarded)

**Files:** `main.js`、`render.js`、locales

- main.js:`G.rescueUntil = 0`;dispatch 加 `RESCUE`(PLAYING 且非 AI 模式且 !rescueActive 时):`Ads.showRewarded().then(ok => { if (ok && G.phase === 'PLAYING') { G.rescueUntil = G.nowMs + 10000; G.aiMem = AI.createMem(); renderAll(); } })`。
- tick:`const rescue = G.nowMs < G.rescueUntil; if (G.ai || rescue) Core.setDir(...AI.nextMove...)`;**救场不是 AI 局**:`scoreScale` 仍按 `G.ai ? 0.5 : 1`(救场期间全分),不碰 tracker.aiRun——这是「看广告换 10 秒代驾、局面保持人工」的卖点;交还瞬间不改方向(AI 最后设的 dir 自然延续)。
- render.js:救场生效时效果指示行追加 `🤖⏱N`(N=剩余秒,由 drawEffectsRow 顺手画,读 G.rescueUntil);最后 1 秒把提示画大一档(倒计时预警,设计 §4)。AI 按钮旁不动;**救场入口**:底部 AI 按钮行改两键——`btnAI` 恢复半宽,新增 `btnRescue`(半宽,label `T('ads.rescue')`,addHit 'RESCUE';AI 模式开启或救场进行中时画灰不可点(hit 不加))。
- locales:`ads.rescue`("📺 AI 10s" / "📺 AI 救场 10s")。

Commit:`feat(snake): AI 救场 10 秒——激励视频换短时代驾,保人工局全分`

### Task 3: 插屏每 2 关

**Files:** `main.js`、`storage.js`(defaults.stats 加 `levelsSinceAd: 0`)

- dispatch NEXT 处(进入 LOADING 前):

```js
      if (G.phase === 'LEVEL_DONE') {
        G.imgFull = false; G.phase = 'LOADING';
        G.save.stats.levelsSinceAd = (G.save.stats.levelsSinceAd || 0) + 1;
        const wantAd = !G.ai && G.save.stats.levelsSinceAd >= 2;   // AI 代打不弹(设计 §10)
        (wantAd ? Ads.showInterstitial().then(() => { G.save.stats.levelsSinceAd = 0; persist(); })
                : Promise.resolve()).finally(() => nextLevel());
      }
```

- storage defaults 加字段;test-storage round-trip 顺手补一行断言。

Commit:`feat(snake): 插屏每2关——AI代打模式不弹,计数入档`

### Task 4: E2E 广告流程断言

**Files:** `tests/e2e-p1.js`

- 脚本开头加 `page.on('dialog', d => d.accept());`(web 端 Ads 模拟用 confirm——自动接受即"看完广告")。
- 追加断言:a) 人工撞死(初始无输入撞墙那次正好可用)后 dispatch('REVIVE'),轮询断言 phase 回 PLAYING、`G.run.snake.length` 未减半、`stats.revives===1`;b) dispatch('RESCUE') 后断言 `G.rescueUntil > G.nowMs`,等 3s 断言蛇在动且 `tracker.aiRun` 未被置 true;c) 连过 2 关后 `stats.levelsSinceAd` 归 0(插屏走过 confirm)。
- 全量回归(七 node 测试 + check-locales + E2E ALL PASS)。

Commit:`test(snake): E2E 广告位——复活/救场/插屏 confirm 模拟全流程`

### Task 5: dist 组装脚本(自包含打包)

**Files:** Create `games/snake/tools/build.js`;产出 `games/snake/dist/`(**提交入库**,monorepo 约定 dist 进 git 供 EC2 直接 serve)

```js
// games/snake/tools/build.js — 组装自包含 dist:游戏文件 + engine 拷入,路径重写
// 用法: node games/snake/tools/build.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');            // games/snake
const REPO = path.join(ROOT, '..', '..');
const OUT = path.join(ROOT, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'engine'), { recursive: true });
// 1) engine 全量(js + css)
for (const f of fs.readdirSync(path.join(REPO, 'engine')))
  if (f.endsWith('.js') || f.endsWith('.css'))
    fs.copyFileSync(path.join(REPO, 'engine', f), path.join(OUT, 'engine', f));
// 2) 游戏静态目录
for (const dir of ['js', 'css', 'locales', 'assets'])
  fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
// 3) index.html:../../engine/ → engine/
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/\.\.\/\.\.\/engine\//g, 'engine/');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('dist assembled:', OUT);
```

跑完独立复核:dist/index.html 无 `../../` 残留;`python -m http.server` 指到 dist 开页面,E2E 用 `node games/snake/tests/e2e-p1.js http://localhost:8125`(baseUrl 参数已支持——但路径是 `/games/snake/`,dist 直 serve 时是根路径:给 e2e 加个可选第三形态或临时手测;**最低要求**:无头开 dist 根路径,console 0 error + phase 达 READY)。
Commit:`feat(snake): build.js 组装自包含 dist(engine 拷入+路径重写)——EC2/Capacitor 共用`

### Task 6: Capacitor 工程 + 图标启动屏 + codemagic.yaml

**Files:** `games/snake/package.json`(新)、`capacitor.config.json`(新)、`codemagic.yaml`(新)、`assets-src/icon.png`+`splash.png`(生成)、`.gitignore`(games/snake 下:node_modules/ ios/ android/)

- package.json(照 2048 版本族,Capacitor 6):

```json
{
  "name": "angel-snake", "private": true, "version": "1.0.0",
  "dependencies": {
    "@capacitor/core": "^6.1.0", "@capacitor/ios": "^6.1.0",
    "@capacitor-community/admob": "^6.2.0"
  },
  "devDependencies": { "@capacitor/cli": "^6.1.0", "@capacitor/assets": "^3.0.5" }
}
```

- capacitor.config.json:

```json
{
  "appId": "com.aispeeds.angelsnake",
  "appName": "Angel Snake",
  "webDir": "dist",
  "backgroundColor": "#fdf3f7",
  "plugins": {
    "SplashScreen": { "launchShowDuration": 800, "backgroundColor": "#fdf3f7", "showSpinner": false },
    "AdMob": { "initializeForTesting": true }
  }
}
```

(initializeForTesting 在拿到真广告位 ID 后由协调者翻 false;appName 最终以 App Store 命名为准,占位 Angel Snake。)
- 图标/启动屏源图(@capacitor/assets 要求 `assets/`——与游戏素材目录撞名!用它的替代路径 `assets-src` 不行,它认 `assets/` 或 `resources/`——**用 `resources/icon.png`+`resources/splash.png`**,@capacitor/assets 支持 `--assetPath resources`):用 playwright 无头页合成 1024×1024 图标(粉彩底 #fdf3f7 圆角 + 居中一张精选天使 webp(挑 manifest 第一张)+ 底部一条粉蛇胶囊装饰)与 2732×2732 splash(纯 #fdf3f7 底 + 居中同图 512px),脚本放 `games/snake/tools/gen-appicon.js`(playwright 从仓库根 node_modules require)。产出提交入库。
- codemagic.yaml:照抄 2048 的 ios-testflight workflow 改五处——name、BUNDLE_ID=com.aispeeds.angelsnake、APP_STORE_APP_ID 占位 "TBD_BY_COORDINATOR"、GADApplicationIdentifier 占位(注释:AdMob 后台建 app 后由协调者替换)、`npx @capacitor/assets generate --ios --assetPath resources`。**保留 UMP pin 2.3 的 perl 补丁与注释原样**(2048 实踩坑)。工作目录:codemagic working_directory 设 `games/games/snake`?——monorepo 结构下 Codemagic 需在 snake 子目录跑:workflow 顶部加 `working_directory: games/snake`(Codemagic 支持),npm/cap 命令相对它执行;build.js 在 npm 依赖后先跑 `node tools/build.js` 生成 dist(scripts 第一步加)。
- ⚠️ 本 Task 只做文件,**不跑** `npx cap add ios`(云端做)、不装 node_modules(codemagic npm install;本地不需要)。

Commit:`feat(snake): Capacitor 工程+图标启动屏+codemagic.yaml(iOS 打包就绪,后台 ID 占位)`

### Task 7: 全量回归 + tag

七 node 测试 + check-locales + E2E(含广告断言)ALL PASS → `git tag snake-p3a-ads`。设计文档 §10 表格加落地状态列(web=模拟/native=AdMob 测试 ID,真 ID 待后台)。

---

## Self-Review
- §10 四个广告位:复活 ✓ 救场 ✓ 插屏 ✓;banner **不做**(移动端 banner 挤占竖屏棋盘空间、eCPM 低,留 P3b 与 AdSense 一起定夺——记入设计文档偏离)。
- 救场语义与 §4 一致(倒计时预警/交还不改向/全分/非 AI 局);复活「保长度保连击」照 §2(效果清空为已接受偏差,注释);每局 2 次 ✓。
- 打包链:build.js(dist)→ capacitor(webDir=dist)→ codemagic(monorepo working_directory + assets 路径避撞)。凭据环节全部留白线交协调者。
