# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

经典小游戏 × 肉鸽化 monorepo。**共享引擎 + 每游戏一个目录**，纯 canvas，无框架、无 bundler、无 npm 依赖（Playwright 借用 `../2048/node_modules`）。线上：`mines.ai-speeds.com`（EC2 checkout `/var/www/games`）。

## 常用命令

```bash
# 扫雷验证三件套（改动 games/minesweeper 后全部要绿）
node tools/test-mines.js                 # 单测（含盘面生态放置断言 + 图鉴特性一致性套件）
node tools/test-mines-sim.js 100         # 神谕蒙特卡洛 = 可赢性门禁（全知 bot，必须 ~100% 胜）
node tools/test-mines-sim.js 300 --novice --debug   # 演绎 bot 下界 / 带终局账本
node tools/check-locales.js games/minesweeper/locales   # locale 键集校验（en.json 为基准）
node tools/test-mines-e2e.cjs            # Playwright 端到端（起本地服务，真点击真断言）

# 本地跑游戏：必须 http（locale 走 fetch，file:// 白屏）
npx http-server -p 8080   # 然后开 http://localhost:8080/games/minesweeper/

# 贪吃蛇（另一会话在做）：games/snake/tests/
node games/snake/tests/test-prng.js

# 美术管线（需本机 ComfyUI，见 ~/.claude/skills/comfyui-flux-local）
C:/ComfyUI/venv/Scripts/python.exe main.py --disable-auto-launch   # 起服务(8188)
C:/ComfyUI/venv/Scripts/python.exe tools/art/gen-mines-art.py --only giant   # 生成(可指定 id)
C:/ComfyUI/venv/Scripts/python.exe tools/art/cutout-direct.py   # 抠图→512webp 直接入 assets/sprites/
```

## 部署（手动，绝不自动）

```bash
git push origin main
ssh -i /c/Users/tangz/Documents/credentials/ec2_1.pem ec2-user@3.26.95.240 "sudo git -C /var/www/games pull"
```
**两条部署铁律**：
1. **改任何 js/css 必须 bump 缓存版本**：`games/minesweeper/index.html` 里所有 `?v=N` 统一 +1（`sed -i 's/?v=16/?v=17/g'`）。忘了 = 老玩家拿到新旧混装的 JS。
2. **改 `G` 的形状必须 bump `SAVE_VERSION`**（main.js）：旧存档一律丢弃不迁移，否则老玩家「恢复」成畸形状态（0×0 盘面 = 无报错白屏，新档案的 E2E 测不出来）。

## 架构

**引擎契约**（细节见 `engine/README.md`，必读）：全局脚本按序加载共享命名空间，无模块。游戏提供单一可变状态 `G` + `renderAll()`（每帧 `clearHits()` 重画全屏并 `addHit()` 可点区域）+ `dispatch(action, data)`。`GAME_CONFIG.id` 决定存储键前缀。零硬编码文案（全走 `T('key')` + `locales/<lang>.json`）。

**minesweeper = Dragonsweeper 1.1.18 的 1:1 机制移植 + 原创可爱美术**：
- 权威规格：`C:\tmp\roguelite-minigames\ds-spec.md`（从原作公开源码 `ds-src/game.js` 提取）。**改机制前先查它**，网上攻略数值互相矛盾不可信。
- 核心规则（非直觉，别"修复"它们）：点击未翻开怪 = 直接挨打；**杀怪要求 hp 严格 > 怪等级**（等于 = 你死）；**尸体二段拾取**（打死后再点才得 XP，数字到拾取才下降）；升级是**手动按钮** + 查表 XP + 偶数级只涨半心；雷 lv=100 毒化数字；纯雷连通团自动翻开。
- 放置生态是硬规则（有单测断言）：龙在中心开局可见、雷王必在角落、贤者边缘+5 果冻环绕、巨人恋人同排关于中线对称、门卫一象限一个、哞哞霸与宝箱 1:1 配对且不同列、地精贴医疗包、龙蛋贴龙。
- 美术：`assets/sprites/<id>.webp`，**所有生物立绘统一朝左**，朝向靠运行时镜像（`spriteFlip()`：哞哞霸盯箱、抱抱怪对视、罗密欧望朱丽叶、鼠群朝王）。缺图自动回退 emoji，游戏永远可玩。
- 格子颜色语言：红系 = 会扣血，绿系 = 纯收益；伪装中的礼盒盒故意涂绿（它的骗术）。

**测试哲学**：逻辑全部纯函数、node vm 可测；蒙特卡洛用**独立重算**交叉验证数字（不用被测代码验它自己）；「神谕全知 bot 100% 胜」是经济/规则正确性的门禁——它多次抓到真 bug（数学上不可胜的巨龙、涟漪缺失、治疗经济不足）。

## 本仓库的协作坑（都真实发生过）

- **多个 Claude 会话并行共用本仓**（贪吃蛇在 `games/snake/`）。提交只 `git add` 精确路径，**禁止 `git add -A`**（曾把别会话的未提交文件夹带进提交）。改 `engine/` 前先看当前文件内容——别的会话可能刚改过（input.js 曾因此被贴进孤儿代码）。
- 用脚本批量改代码时，**替换后必须 grep 验证生效**——`str.replace` 没匹配不报错，本仓已静默失败四次。
- locale 十语重翻未做（v2.1 文案定型后 `GAME_CONFIG.languages` 锁在 en/zh-CN）；扩语言按 `~/.claude/skills/i18n` 流程派并行 agent，完后必跑 check-locales 认账。
