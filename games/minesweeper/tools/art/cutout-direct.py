# -*- coding: utf-8 -*-
# 直抠版:transparent-background(InSPyReNet) 绕开 ComfyUI LoadImage 的 av 坑
import glob, os, re
from PIL import Image
from transparent_background import Remover

OUT_DIR = "C:/ComfyUI/output"
DST = "C:/Users/tangz/Documents/Projects/games/games/minesweeper/assets/sprites"
os.makedirs(DST, exist_ok=True)

srcs = {}
for f in glob.glob(OUT_DIR + "/mines_*.png"):
    m = re.match(r"mines_([a-z]+)_\d+", os.path.basename(f))
    if m:
        aid = m.group(1)
        if aid not in srcs or os.path.getmtime(f) > os.path.getmtime(srcs[aid]):
            srcs[aid] = f
print("found", len(srcs), flush=True)

remover = Remover(mode='base', device='cuda')
ok = 0
for aid, src in sorted(srcs.items()):
    im = Image.open(src).convert("RGB")
    out = remover.process(im, type='rgba')
    a = out.getchannel("A")
    lo, hi = a.getextrema()
    if hi == 0:
        print("BAD", aid, flush=True); continue
    bbox = a.getbbox()
    out = out.crop(bbox)
    pad = int(max(out.size) * 0.06)
    side = max(out.size) + pad * 2
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    sq = sq.resize((512, 512), Image.LANCZOS)
    sq.save(os.path.join(DST, f"{aid}.webp"), "WEBP", quality=90)
    tp = sum(1 for p in sq.getchannel("A").getdata() if p == 0) / (512 * 512)
    print(f"saved {aid}.webp transparent={tp:.0%}", flush=True)
    ok += 1
print(f"DONE {ok}/{len(srcs)}", flush=True)
