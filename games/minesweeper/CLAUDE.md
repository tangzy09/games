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
oguelite-minigames\ds-spec.md`（提取自原作公开源码 `ds-src/game.js`）。**改机制前先查它**——网上攻略数值互相矛盾不可信。
- 点击未翻开怪 = 直接挨打；**杀怪要求 hp 严格 > 怪等级**（等于 = 你死）；**尸体二段拾取**（打死后再点才得 XP，数字到拾取才下降）；升级是**手动按钮** + 查表 XP + 偶数级只涨半心；雷 lv=100 毒化数字；纯雷连通团自动翻开。
- 放置生态是硬规则（单测有断言）：龙在中心开局可见、雷王必在角落、贤者边缘+5 果冻环绕、巨人恋人同排关于中线对称、门卫一象限一个、哞哞霸与宝箱 1:1 配对且不同列、地精贴医疗包、龙蛋贴龙。
- **图鉴写的每条特性都有一致性测试**——改怪物行为要同步改图鉴文案与测试。

## 美术

- `assets/sprites/<id>.webp`，**所有生物立绘统一朝左**，朝向靠运行时镜像（`spriteFlip()`：哞哞霸盯箱、抱抱怪对视、罗密欧望朱丽叶、鼠群朝王）。缺图自动回退 emoji，游戏永远可玩。
- 格子颜色语言：红系 = 会扣血，绿系 = 纯收益；伪装中的礼盒盒故意涂绿（它的骗术）。
- 重生成/新增立绘（需本机 ComfyUI，见 `~/.claude/skills/comfyui-flux-local`）：
  ```bash
  C:/ComfyUI/venv/Scripts/python.exe main.py --disable-auto-launch      # 起服务(8188)
  C:/ComfyUI/venv/Scripts/python.exe games/minesweeper/tools/art/gen-mines-art.py --only giant
  C:/ComfyUI/venv/Scripts/python.exe games/minesweeper/tools/art/cutout-direct.py   # 抠图→512webp 入 assets/sprites/
  ```
  提示词里生物一律 "facing left"（正面像镜像无效，巨人踩过）。

## 测试哲学

逻辑全部纯函数、node vm 可测；蒙特卡洛用**独立重算**交叉验证数字（不用被测代码验它自己）；「神谕全知 bot 100% 胜」是经济/规则正确性门禁——它多次抓到真 bug（数学上不可胜的巨龙、涟漪缺失、治疗经济不足）。

## 待办

十语重翻未做（v2.1 文案定型，`GAME_CONFIG.languages` 锁在 en/zh-CN）；扩语言按 `~/.claude/skills/i18n` 派并行 agent，完后必跑 check-locales 认账。
