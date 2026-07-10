# CLAUDE.md — games/minesweeper

扫雷小地牢（Dungeon Sweep）：**Dragonsweeper 1.1.18 的 1:1 机制移植 + 原创可爱美术**。线上 mines.ai-speeds.com。

## 验证（改动本目录后全部要绿）

```bash
npm run test:mines        # 单测(含盘面生态放置断言+图鉴特性一致性套件) + 神谕蒙特卡洛(可赢性门禁,必须 ~100% 胜)
npm run test:mines:e2e    # Playwright 端到端(起本地服务,真点击真断言)
node games/minesweeper/tests/test-mines-sim.js 300 --novice --debug   # 演绎 bot 下界/终局账本
node tools/check-locales.js games/minesweeper/locales
```

## 移植不变量（非直觉，别当 bug"修复"）

- 权威规格：`C:/tmp/roguelite-minigames/ds-spec.md`（提取自原作公开源码 C:/tmp/roguelite-minigames/ds-src/game.js）。**改机制前先查它**——网上攻略数值互相矛盾不可信。
- 点击未翻开怪 = 直接挨打；**杀怪要求 hp 严格 > 怪等级**（等于 = 你死）；**尸体二段拾取**（打死后再点才得 XP，数字到拾取才下降）；升级是**手动按钮** + 查表 XP + 偶数级只涨半心；雷 lv=100 毒化数字；纯雷连通团自动翻开。
- 放置生态是硬规则（单测有断言）：龙在中心开局可见、雷王必在角落、贤者边缘+5 果冻环绕、巨人恋人同排关于中线对称、门卫一象限一个、哞哞霸与宝箱 1:1 配对且不同列、地精贴医疗包、龙蛋贴龙。
- **图鉴写的每条特性都有一致性测试**——改怪物行为要同步改图鉴文案与测试。

## 美术

- `assets/sprites/<id>.webp`，**所有生物立绘统一朝左**，朝向靠运行时镜像（`spriteFlip()`：哞哞霸盯箱、抱抱怪对视、罗密欧望朱丽叶、鼠群朝王）。缺图自动回退 emoji，游戏永远可玩。
- 格子颜色语言：红系 = 会扣血，绿系 = 纯收益；伪装中的礼盒盒故意涂绿（它的骗术）。
- `assets/icons/`：站点 icon 全套（favicon-32 / icon-192 / apple-touch-icon-180 / icon-512，index.html head 已挂，icon-512 兼任 og:image），源图 = knight+slime 主视觉 2048 原图直接缩放。主页标题图 = render.js `drawKeyArt()`：画 icon-512、`roundRect` 圆角裁切去掉源图白角、加载完成前回退 🐉。
- 重生成/新增立绘（需本机 ComfyUI，见 `~/.claude/skills/comfyui-flux-local`）：
  ```bash
  C:/ComfyUI/venv/Scripts/python.exe main.py --disable-auto-launch      # 起服务(8188)
  C:/ComfyUI/venv/Scripts/python.exe games/minesweeper/tools/art/gen-mines-art.py --only giant
  C:/ComfyUI/venv/Scripts/python.exe games/minesweeper/tools/art/cutout-direct.py   # 抠图→512webp 入 assets/sprites/
  ```
  提示词里生物一律 "facing left"（正面像镜像无效，巨人踩过）。

## 测试哲学

逻辑全部纯函数、node vm 可测；蒙特卡洛用**独立重算**交叉验证数字（不用被测代码验它自己）；「神谕全知 bot 100% 胜」是经济/规则正确性门禁——它多次抓到真 bug（数学上不可胜的巨龙、涟漪缺失、治疗经济不足）。

## iOS / App Store（1.0 已送审，2026-07-10 WAITING_FOR_REVIEW）

流水线用法见根 CLAUDE.md「iOS 壳」节；本游戏的既定事实（改配置前先核对这里）：

- **ASC App `6789722105`**，商店名 en `Dungeon Sweep: Minesweeper RPG` / zh-Hans `扫雷小地牢 Dungeon Sweep`；Bundle ID `com.aispeeds.dungeonsweep`；主屏名 = capacitor.config 的 `Dungeon Sweep`。
- Codemagic app id `6a5159920057b5324b000964`，workflow `mines-ios-testflight`（首建一次全绿 ~12min）；签名私钥在 ios_signing 组。
- **AdMob 真 ID 已接**：App ID `ca-app-pub-2141208066469648~9504869782`（codemagic.yaml `GAD_APP_ID`）；rewarded `/4578856487`、interstitial `/3586328698`（index.html `GAME_CONFIG.adUnits`，仅 iOS，android 缺省=测试位）。**别把这些 ID 复用给其它游戏**。
- 图标源 = knight+slime 主视觉（`Downloads/Gemini_Generated_Image_o2od06o2od06o2od.png` 2048 原图内切 140px 去烘焙圆角 → resources/icon.png）。**4.3(a)：图标绝不与账号内其他 app 复用**。
- 商店页资料已全（en+zh 元数据、20 张截图、免费全球、分级 9+ 广告=true、隐私页 `/privacy.html`、隐私问卷已 Publish）。
- 截图管线：`tools/capture-appstore-shots.cjs`（本地起服 + Playwright 造景）→ `C:\tmp\dungeon-sweep\shots\`。造景两坑：翻格只翻 `cellNumber(i)<100` 的格（雷毒化的 100+ 数字在截图里像 bug）；`Meta.markHintDone=true`（长按提示行在 iPad 视口贴底会被裁）。上传用 appstore-listing 的 upload-shots-template（改 VER + SHOTS_DIR）。
- **上线后第一个更新的既定任务**：商店页铺 T1+T2 全语言（首版只中英是用户定的节奏）；确认 AdMob 后台 UMP 同意消息 active；门户/游戏页加 App Store 徽章。

## 待办

十语重翻未做（v2.1 文案定型，`GAME_CONFIG.languages` 锁在 en/zh-CN）；扩语言按 `~/.claude/skills/i18n` 派并行 agent，完后必跑 check-locales 认账。
