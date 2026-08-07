# -*- coding: utf-8 -*-
"""
build-icons.py —— 从一张**已通过三条硬检查**的主图，产出上架/网页要的全套图标。

产出（照 generating-app-icons skill）：
  resources/icon.png        1024×1024 **RGB（alpha 剥掉）** —— App Store / Capacitor
  resources/splash.png      2732×2732 主图居中约 38%，其余是品牌底色
                            （⚠ Capacitor 按设备中心裁切 ⇒ 必须留大安全边）
  assets/icons/favicon-32.png / icon-192.png / apple-touch-icon-180.png / icon-512.png
  /tmp/icon-mask-proof.png  ⭐ **Apple squircle 遮罩下 60px 的实拍** —— 必须自己去看

⛔ 本脚本**不修图**：不 flood-fill 白角、不 inset-crop。主图不合格就回去改 prompt 重生成
   （skill 那一整节讲的就是「修出来的图会以完成品的样子混上线」）。

用法：C:/ComfyUI/venv/Scripts/python.exe games/connect4/tools/build-icons.py <master.png>
"""
import sys, os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'resources')
ICONS = os.path.join(ROOT, 'assets', 'icons')

def die(msg):
    print('⛔ ' + msg)
    sys.exit(1)

def main():
    if len(sys.argv) < 2:
        die('用法：build-icons.py <master.png>')
    src = sys.argv[1]
    im = Image.open(src)

    # ── 三条硬检查再跑一遍（⛔ 别信「上一步查过了」）──
    w, h = im.size
    if w != h or w < 1024:
        die('主图 %dx%d —— 要正方且 ≥1024' % (w, h))
    if im.mode in ('RGBA', 'LA'):
        a = im.convert('RGBA').getchannel('A').getextrema()
        if a[0] < 255:
            die('主图带透明（min alpha=%d）—— Apple 会直接拒' % a[0])
    rgb = im.convert('RGB')
    cs = [rgb.getpixel(p) for p in [(3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)]]
    if any(min(c) > 200 for c in cs):
        die('四角有浅色 %s —— 烘进去的圆角，⛔ 别修，回去重生成' % (cs,))
    bg = tuple(sum(c[i] for c in cs) // 4 for i in range(3))
    print('主图 OK  %dx%d  背景色 %s' % (w, h, '#%02X%02X%02X' % bg))

    os.makedirs(RES, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)

    # ── icon.png：1024 RGB，⛔ 无 alpha ──
    icon = rgb.resize((1024, 1024), Image.LANCZOS)
    icon.save(os.path.join(RES, 'icon.png'))
    print('  ✓ resources/icon.png       1024×1024 RGB')

    # ── splash.png：2732，主体居中，底色**与贴上去那块的边缘同色** ──
    #    ⚠⚠ 第一版直接贴整张主图 + 用**四角**色做底 ⇒ 中间那块明显更亮，**接缝一眼可见**：
    #      主图自己带 vignette（中心亮、四角暗），两者根本不是一个颜色。
    #    ⇒ 改成：先把主图**裁到中心 62%**（主体完整 + 周围一圈**均匀**的背景），
    #      底色取这一块的角落色 ⇒ 贴图边缘与底板同色，接缝消失。
    #    ⚠ Capacitor 会按设备中心裁切 ⇒ 主体只占 32%，留足安全边。
    cw = int(w * 0.62)
    co = (w - cw) // 2
    core = rgb.crop((co, co, co + cw, co + cw))
    ccs = [core.getpixel(p) for p in [(2, 2), (cw - 3, 2), (2, cw - 3), (cw - 3, cw - 3)]]
    cbg = tuple(sum(c[i] for c in ccs) // 4 for i in range(3))
    sp = Image.new('RGB', (2732, 2732), cbg)
    side = int(2732 * 0.32)
    sp.paste(core.resize((side, side), Image.LANCZOS), ((2732 - side) // 2, (2732 - side) // 2))
    sp.save(os.path.join(RES, 'splash.png'))
    print('  ✓ resources/splash.png     2732×2732（主体占 32%%，底 %s = 贴图边缘同色）'
          % ('#%02X%02X%02X' % cbg))

    # ── 网页那几张 ──
    for name, size in [('favicon-32', 32), ('icon-192', 192),
                       ('apple-touch-icon-180', 180), ('icon-512', 512)]:
        rgb.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS, name + '.png'))
    print('  ✓ assets/icons/            favicon-32 / icon-192 / apple-touch-icon-180 / icon-512')

    # ── ⭐ Apple squircle 遮罩下的 60px 实拍（放大到 180 好看清）──
    #    ⚠ 底色故意用浅色墙纸：白缺口在浅底上最刺眼
    s = rgb.resize((240, 240), Image.LANCZOS)
    m = Image.new('L', (240, 240), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, 239, 239], radius=int(240 * 0.2237), fill=255)
    out = Image.new('RGB', (240, 240), (228, 230, 235))
    out.paste(s, (0, 0), m)
    proof = os.path.join(ROOT, 'assets', 'art', 'icon-mask-proof.png')
    out.resize((60, 60), Image.LANCZOS).resize((180, 180), Image.NEAREST).save(proof)
    print('  ✓ %s' % proof)
    print('\n⭐ 最后一步机器做不了：**打开那张 mask proof 自己看** ——')
    print('   ⑴ 四角有没有白缺口 ⑵ 60px 下两种造型还分不分得出来')

if __name__ == '__main__':
    main()
