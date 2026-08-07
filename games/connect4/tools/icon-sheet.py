# -*- coding: utf-8 -*-
"""
icon-sheet.py —— 候选图标的**三尺寸对照表**（generating-app-icons / comfyui-flux-local 的死规矩）。

⛔⛔ 「1024 原图张张都好看，缩小后一半会糊」——只看原图**必定误判**。
   而 iOS 主屏图标真身是 **60×60 pt**，还要先被 Apple 的 squircle（半径 22.4%）吃掉四角。
⇒ 本表每张出三格：**原图缩略 / 遮罩后 120px / 遮罩后 60px 放大看**，
  并把 60px 那格摆在**浅色墙纸**上 —— 烘进去的白角在深色底上看不出来，在浅色底上一眼刺目。

用法：python games/connect4/tools/icon-sheet.py <dir> [out.png]
"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont

WALL = (228, 230, 235)      # 浅色墙纸：白缺口在这上面才现形
PAD = 14
LABEL_H = 22

def squircle(im, side):
    s = im.convert('RGB').resize((side, side), Image.LANCZOS)
    m = Image.new('L', (side, side), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, side - 1, side - 1],
                                        radius=int(side * 0.2237), fill=255)
    out = Image.new('RGB', (side, side), WALL)
    out.paste(s, (0, 0), m)
    return out

def main():
    src = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else 'C:/tmp/connect4/icon-sheet.png'
    files = sorted(glob.glob(os.path.join(src, '*.png')))
    if not files:
        print('没有候选'); return 2
    # 每行一个候选：原图 160 / 遮罩 120 / 遮罩 60 放大到 120
    cw = [160, 120, 120]
    row_h = 160 + LABEL_H
    W = PAD + sum(c + PAD for c in cw)
    H = PAD + len(files) * (row_h + PAD)
    sheet = Image.new('RGB', (W, H), (250, 250, 250))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 13)
    except Exception:
        font = ImageFont.load_default()

    for i, f in enumerate(files):
        im = Image.open(f)
        y = PAD + i * (row_h + PAD)
        d.text((PAD, y), os.path.basename(f), fill=(20, 20, 20), font=font)
        yy = y + LABEL_H
        x = PAD
        # ① 原图缩略
        sheet.paste(im.convert('RGB').resize((160, 160), Image.LANCZOS), (x, yy)); x += 160 + PAD
        # ② squircle 120（≈ 主屏实际观感的两倍）
        sheet.paste(squircle(im, 120), (x, yy + 20)); x += 120 + PAD
        # ③ ⭐⭐ squircle 60 —— **真身**，放大到 120 用 NEAREST 看清它糊成什么样
        sheet.paste(squircle(im, 60).resize((120, 120), Image.NEAREST), (x, yy + 20))

    d.text((PAD, H - 16), '左=原图  中=squircle 120px  右=squircle 60px(真身,放大看)',
           fill=(90, 90, 90), font=font)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path)
    print('对照表 →', out_path, ' 共', len(files), '张')
    return 0

if __name__ == '__main__':
    sys.exit(main())
