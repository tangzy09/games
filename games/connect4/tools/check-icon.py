# -*- coding: utf-8 -*-
"""
check-icon.py —— app 图标候选的**自动**验收（generating-app-icons skill 的三条硬检查）。

⛔⛔ skill 明说：**别用肉眼查四角**。Flux 的 "full bleed" 在某些 seed 上仍会漏出
   2-4px 的近白边 —— 缩略图里根本看不见，套上 Apple 的圆角遮罩就刺眼。

三条硬检查（不过就不许拿去做资产）：
  ① 正方形且 ≥1024        —— 商店要求
  ② 无 alpha（min α=255）  —— 带透明会被直接拒审
  ③ 四角**不是白/浅色**    —— 这条抓的正是「烘进去的圆角」

外加一条 skill 补的：**填充分布**（把图缩到 128² 后看上/中/下三段的亮像素比例）——
它抓的是另一种废图：「主体浮在一片空场中间」。
⚠ 但别过度纠正：squircle 会吃掉 22.4% 的圆角 ⇒ **背景**要铺满四角，而**主体**该躲开四角。

用法：C:/ComfyUI/venv/Scripts/python.exe games/connect4/tools/check-icon.py <dir-or-file>...
"""
import sys, os, glob
from PIL import Image

WHITEISH = 200          # 任一通道高于它就当「浅色」
CORNER_INSET = 3        # 采样点离角多少像素（⚠ 别取 (0,0)：有些编码器会在最边缘留一像素噪点）

def corners(im):
    w, h = im.size
    d = CORNER_INSET
    return [im.getpixel(p) for p in [(d, d), (w - 1 - d, d), (d, h - 1 - d), (w - 1 - d, h - 1 - d)]]

def fill_profile(im):
    """缩到 128² 后上/中/下三段的「非背景」像素比例。背景 = 四角颜色的均值。"""
    s = im.convert('RGB').resize((128, 128), Image.LANCZOS)
    cs = corners(s)
    bg = tuple(sum(c[i] for c in cs) // len(cs) for i in range(3))
    px = s.load()
    thirds = [0, 0, 0]
    for y in range(128):
        band = 0 if y < 43 else (1 if y < 86 else 2)
        for x in range(128):
            r, g, b = px[x, y][:3]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 60:
                thirds[band] += 1
    return [round(t / (128 * 43), 3) for t in thirds], bg

def check(p):
    im = Image.open(p)
    name = os.path.basename(p)
    fails = []
    w, h = im.size
    # ① 正方 + ≥1024
    if w != h or w < 1024:
        fails.append('尺寸 %dx%d（要正方且 ≥1024）' % (w, h))
    # ② 无 alpha
    if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
        a = im.convert('RGBA').getchannel('A').getextrema()
        if a[0] < 255:
            fails.append('带透明（min alpha=%d）—— Apple 会直接拒' % a[0])
    # ③ 四角不是浅色
    rgb = im.convert('RGB')
    cs = corners(rgb)
    pale = [c for c in cs if min(c[:3]) > WHITEISH]
    if pale:
        fails.append('四角有浅色 %s —— 这是烘进去的圆角/白边，套上遮罩会露白缺口' % (pale,))
    # ④ 填充分布
    prof, bg = fill_profile(rgb)
    mid_only = prof[1] > 0.25 and prof[0] < 0.05 and prof[2] < 0.05
    note = '背景%s 分布%s' % (bg, prof)
    if mid_only:
        note += '  ⚠ 主体像是浮在空场中间（居中徽章式），不是 full-bleed 构图'
    ok = not fails
    print(('  ✓ ' if ok else '  ✗ ') + name + '  ' + note)
    for f in fails:
        print('      ⛔ ' + f)
    return ok

def main():
    args = sys.argv[1:] or ['games/connect4/assets/art/icon-candidates']
    files = []
    for a in args:
        files.extend(sorted(glob.glob(os.path.join(a, '*.png'))) if os.path.isdir(a) else [a])
    if not files:
        print('⛔ 没有候选图'); sys.exit(2)
    print('检查 %d 张：' % len(files))
    good = [f for f in files if check(f)]
    print('\n通过 %d / %d' % (len(good), len(files)))
    if not good:
        print('⛔ 一张都没过 —— ⛔ 别去修图（flood-fill / inset-crop 都会留下缝或啃掉构图），'
              '改 prompt 重新生成。')
        sys.exit(1)
    print('⇒ 通过的这几张仍要**肉眼**看：60px 下认不认得出（检查抓角落，抓不了可读性）。')
    for g in good:
        print('   · ' + g)

if __name__ == '__main__':
    main()
