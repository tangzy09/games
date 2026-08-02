# tools/cut-ui-icons.py — 共享 UI 图标库:抠透明 + 裁正方 + 出 webp,并拼三尺寸对照表
#
# 用 ComfyUI 的 venv python 跑(有 transparent_background + cuda):
#   cd C:/tmp/ui-icons
#   C:/ComfyUI/venv/Scripts/python.exe <本文件>
#   → cut/*.webp（拷进 engine/assets/ui/）+ sheet.png（验收用）
#
# ⚠ 名单从 raw/ 目录扫,不写死 —— 生成器只补新图,这里也就只处理新图。
# ⚠ 抠图走 transparent_background(InSPyReNet),不走 ComfyUI 的 RMBG 工作流:
#   本机 ComfyUI 的 LoadImage 卡在 av 版本死锁(见 comfyui-flux-local skill 坑表)。
import os
import sys
from PIL import Image, ImageDraw
from transparent_background import Remover

# ⚠ Windows 控制台默认 cp1252,print 中文会 UnicodeEncodeError 把脚本崩在最后一行
#   (图其实都出完了,看着像失败——实锤)。强制 stdout 走 utf-8。
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

SIDE = 192          # 图标只在 34~62px 显示,192 足够;再大纯属白占体积
PAD = 0.06          # 6% 边距(图标本身已留白,再多就显小)

names = sorted(f[:-4] for f in os.listdir('raw') if f.endswith('.png'))
if not names:
    raise SystemExit('raw/ 里没有 png')
os.makedirs('cut', exist_ok=True)

rm = Remover(mode='base', device='cuda')
for n in names:
    img = Image.open('raw/%s.png' % n).convert('RGB')
    out = rm.process(img, type='rgba')
    bbox = out.split()[3].getbbox()
    if bbox:
        out = out.crop(bbox)
    w, h = out.size
    s = max(w, h)
    pad = int(s * PAD)
    side = s + pad * 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - w) // 2, (side - h) // 2), out)
    canvas = canvas.resize((SIDE, SIDE), Image.LANCZOS)
    canvas.save('cut/%s.webp' % n, 'WEBP', quality=90, method=6)
    print('  cut', n)

# ── 三尺寸对照表(192 / 62 / 34)——⛔ 验收必须看这张,只看 1024 原图必定误判 ──
COLS, CELL, ROW_H = 4, 210, 46
all_names = sorted(f[:-5] for f in os.listdir('cut') if f.endswith('.webp'))
rows = (len(all_names) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * CELL, rows * (CELL + ROW_H)), (250, 240, 247))
d = ImageDraw.Draw(sheet)
for i, n in enumerate(all_names):
    im = Image.open('cut/%s.webp' % n).convert('RGBA')
    cx, cy = (i % COLS) * CELL, (i // COLS) * (CELL + ROW_H)
    for size, pos in ((150, (cx + 8, cy + 8)), (62, (cx + 164, cy + 12)), (34, (cx + 164, cy + 84))):
        r = im.resize((size, size), Image.LANCZOS)
        sheet.paste(r, pos, r)
    d.text((cx + 10, cy + 164), n, fill=(90, 60, 85))
sheet.save('sheet.png')
print('done ->', len(names), '张新图;对照表 sheet.png(', len(all_names), '张 )')
