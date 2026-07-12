#!/usr/bin/env python
# games/abyssshoot/tools/gen-icons.py — 从主图生成全套图标 + iOS 启动屏
#
# 用法: python games/abyssshoot/tools/gen-icons.py <source.png>
#       (产物入库;换主图才需重跑)
#
# ⚠ 主图硬要求(脚本会校验,不合格直接报错):
#   1. 正方形、**直角**(不许自带圆角) —— Apple 会自己切圆角,你切了会出现「双圆角」白缺口
#   2. **不透明**(无 alpha) —— App Store 明确拒收带透明通道的图标
#   3. 四角必须是实心背景色(不是白/透明)
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
RES = os.path.join(GAME, 'resources')
ICONS = os.path.join(GAME, 'assets', 'icons')
BG = (4, 18, 31)          # #04121f,与 render.js 的 PAL.bg 一致

# 网页图标:名字 → 边长
WEB = {'favicon-32.png': 32, 'icon-192.png': 192,
       'apple-touch-icon-180.png': 180, 'icon-512.png': 512}   # icon-512 兼任 og:image


def check(im):
    w, h = im.size
    if w != h:
        sys.exit('FAIL: not square (%dx%d)' % (w, h))
    if w < 1024:
        sys.exit('FAIL: too small (%d), need >= 1024' % w)
    rgba = im.convert('RGBA')
    lo, hi = rgba.getchannel('A').getextrema()
    if lo != 255:
        sys.exit('FAIL: has transparency (alpha min=%d). Apple rejects icons with alpha.' % lo)
    # 四角不能是白(= 自带圆角的典型症状)
    for name, (x, y) in [('TL', (2, 2)), ('TR', (w - 3, 2)), ('BL', (2, h - 3)), ('BR', (w - 3, h - 3))]:
        p = rgba.getpixel((x, y))[:3]
        if p[0] > 230 and p[1] > 230 and p[2] > 230:
            sys.exit('FAIL: corner %s is white %s -> the source has BAKED ROUNDED CORNERS.\n'
                     '      Apple masks its own corners; a pre-rounded icon shows white notches.\n'
                     '      Regenerate full-bleed (background must reach all 4 corners).' % (name, p))
        print('  corner %-3s %s  OK' % (name, p))


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: python gen-icons.py <source.png>')
    src = sys.argv[1]
    im = Image.open(src)
    print('source: %s  %s  %s' % (os.path.basename(src), im.size, im.mode))
    check(im)
    im = im.convert('RGB')          # 去 alpha 通道(App Store 要求)

    os.makedirs(RES, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)

    # 1) App Store / Capacitor 主图标:1024 直角方图,无 alpha
    icon = im.resize((1024, 1024), Image.LANCZOS)
    p = os.path.join(RES, 'icon.png')
    icon.save(p, 'PNG')
    print('  -> %s  1024x1024 RGB' % os.path.relpath(p, GAME))

    # 2) 网页图标
    for name, size in WEB.items():
        p = os.path.join(ICONS, name)
        im.resize((size, size), Image.LANCZOS).save(p, 'PNG')
        print('  -> %s  %dx%d' % (os.path.relpath(p, GAME), size, size))

    # 3) iOS/Capacitor 启动屏:2732 方形,主图居中约 38%,其余填深渊底色
    #    (Capacitor 会按各设备尺寸居中裁切,所以四周必须留足安全边)
    sp = Image.new('RGB', (2732, 2732), BG)
    art = im.resize((1040, 1040), Image.LANCZOS)
    sp.paste(art, ((2732 - 1040) // 2, (2732 - 1040) // 2))
    p = os.path.join(RES, 'splash.png')
    sp.save(p, 'PNG')
    print('  -> %s  2732x2732 (art centered, safe margins)' % os.path.relpath(p, GAME))

    print('gen-icons OK')


if __name__ == '__main__':
    main()
