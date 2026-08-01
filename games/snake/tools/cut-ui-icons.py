# games/snake/tools/cut-ui-icons.py — UI 图标抠透明 + 裁正方 + 出 webp(小,进仓库)
# 用 C:\ComfyUI\venv\Scripts\python.exe 跑(有 transparent_background + cuda)。
#   cd C:/tmp/snake/ui-icons && C:/ComfyUI/venv/Scripts/python.exe <本文件>
# 产物 cut/*.webp → 拷进 games/snake/assets/ui/
#
# ⚠ 图标只在 34~62px 显示 ⇒ 192 边长足够(再大纯属白占体积);webp q=90 一张 ~6KB。
# ⚠ 抠图走 transparent_background(InSPyReNet)而不是 ComfyUI 的 RMBG 工作流:
#   本机 ComfyUI 的 LoadImage 卡在 av 版本死锁,绕开(见 comfyui-flux-local skill 坑表)。
import os
from PIL import Image
from transparent_background import Remover

NAMES = [
    'menu-quests', 'menu-ach', 'menu-gallery', 'menu-skins', 'menu-stats', 'menu-howto',
    'ach-locked', 'ach-gold',
    'q-apples', 'q-levels', 'q-cells', 'q-special', 'q-combo', 'q-noDeath',
    'daily-gift', 'set-crown',
]
SIDE = 192

os.makedirs('cut', exist_ok=True)
rm = Remover(mode='base', device='cuda')
for n in NAMES:
    src = 'raw/%s.png' % n
    if not os.path.exists(src):
        print('  skip (no raw)', n); continue
    img = Image.open(src).convert('RGB')
    out = rm.process(img, type='rgba')
    bbox = out.split()[3].getbbox()
    if bbox:
        out = out.crop(bbox)
    w, h = out.size
    s = max(w, h)
    pad = int(s * 0.06)                    # 6% 边距:图标本身已经留白,再多就显小
    side = s + pad * 2
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - w) // 2, (side - h) // 2), out)
    canvas = canvas.resize((SIDE, SIDE), Image.LANCZOS)
    canvas.save('cut/%s.webp' % n, 'WEBP', quality=90, method=6)
    print('  cut', n, canvas.size)
print('done -> cut/')
