#!/usr/bin/env python
# games/abyssshoot/tools/prep-fish.py — 把 fishId 的鱼素材归一化成游戏格子图标
#
# 用法: python games/abyssshoot/tools/prep-fish.py      (产物入库,改了鱼梯才需重跑)
#
# 为什么需要这一步(不是拿来即用):
#   fishId 的 271 条鱼是给「识鱼 App」做的,512x512 已去背景,但**取景差异极大**——
#   宽高比 1.04(皇带鱼近方形) 到 1.87(大白鲨很扁),内容占比 52%~96%。
#   直接贴进方格子:扁鱼会显得很小、各档大小忽大忽小,像没做过美术。
#
# 归一化策略:
#   1. 裁到 alpha 实际内容框(去掉不等量的透明边)
#   2. 按「视觉面积」而非「外接框」缩放 —— 扁鱼放大一点,方鱼收一点,让各档**看起来一样重**
#   3. 居中放到方形画布,留边给数字徽章
#   4. 加柔和投影(深色背景上把鱼托起来,不然糊成一团)
import io, os, sys, math
from PIL import Image, ImageFilter

SRC = r'C:\Users\tangz\Documents\fishId\assets\fish\cute'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fish')

CANVAS = 256          # 输出画布(格子最大 ~90px @2x DPR,256 足够且省流量)
TARGET_AREA = 0.42    # 鱼的"视觉面积"占画布比例 —— 各档统一,这是"看起来一样大"的关键
MAX_W, MAX_H = 0.92, 0.78   # 外接框上限(占画布):高度留窄一点,给底部数字徽章让位

# 鱼梯(必须与 js/tiles.js 一致 —— 改了那边就要重跑这个脚本)
LADDER = [
    (2, 'clownfish'), (4, 'blenny'), (8, 'butterflyfish'), (16, 'angelfish'),
    (32, 'blackspottedpuffer'), (64, 'barracuda'), (128, 'blacktipreefshark'),
    (256, 'anglerfish'), (512, 'barreleye'), (1024, 'coelacanth'),
    (2048, 'greatwhiteshark'), (4096, 'whaleshark'), (8192, 'belugawhale'),
    (16384, 'orca'), (32768, 'humpbackwhale'), (65536, 'spermwhale'),
    (131072, 'oarfish'),
]


def prep(name):
    src = os.path.join(SRC, name + '.webp')
    im = Image.open(src).convert('RGBA')

    # 1) 裁到实际内容
    bb = im.getchannel('A').getbbox()
    if not bb:
        raise SystemExit('no content: ' + name)
    im = im.crop(bb)
    w, h = im.size

    # 2) 按视觉面积缩放:先算"不透明像素占外接框的比例",据此补偿——
    #    扁而稀疏的鱼(大白鲨)会被放大,饱满的鱼(皇带鱼)会被收小,视觉重量才齐。
    alpha = im.getchannel('A')
    opaque = sum(alpha.point(lambda p: 255 if p > 32 else 0).convert('L').getdata()) / 255.0
    density = opaque / float(w * h)                     # 0..1
    want_area = TARGET_AREA * CANVAS * CANVAS           # 想要的不透明像素数
    scale = math.sqrt(want_area / max(1.0, opaque))     # 面积→边长

    # 外接框不能超限(否则鱼顶出格子/压到徽章)
    scale = min(scale, MAX_W * CANVAS / w, MAX_H * CANVAS / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.LANCZOS)

    # 3) 居中(略偏上,给底部数字徽章留空)
    canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - nw) // 2
    y = int((CANVAS - nh) * 0.42)

    # 4) 柔和投影:格子底色是彩色的,不托一下鱼会糊进去
    sh_a = Image.new('L', (CANVAS, CANVAS), 0)
    sh_a.paste(im.getchannel('A'), (x, y + 5))
    sh_a = sh_a.filter(ImageFilter.GaussianBlur(6)).point(lambda p: int(p * 0.45))
    shadow = Image.new('RGBA', (CANVAS, CANVAS), (2, 12, 24, 0))
    shadow.putalpha(sh_a)
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(im, (x, y), im)
    return canvas, density


def main():
    os.makedirs(OUT, exist_ok=True)
    for v, name in LADDER:
        img, density = prep(name)
        dst = os.path.join(OUT, name + '.webp')
        img.save(dst, 'WEBP', quality=90, method=6)
        kb = os.path.getsize(dst) / 1024.0
        print('%7d  %-20s density=%.2f  -> %s (%.0fKB)' % (v, name, density, os.path.basename(dst), kb))
    print('prep-fish OK: %d fish -> %s' % (len(LADDER), os.path.abspath(OUT)))


if __name__ == '__main__':
    main()
