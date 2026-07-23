#!/usr/bin/env python
# compose-shots.py — 把原始游戏截图合成为带营销文案的 App Store 截图
#
#   python games/abyssshoot/tools/compose-shots.py
#   读 C:\tmp\abyssshoot\shots\{en,zh}\{iphone,ipad}\*.png(原始)
#   写 C:\tmp\abyssshoot\shots-final\{en,zh}\{iphone,ipad}\*.png(带文案)
#
# 做法(App Store 截图的标准形态):深海渐变底 + 顶部大字文案 + 下方缩放的真实游戏画面。
# ⚠ 输出尺寸必须与槽位**精确一致**(6.7"=1290×2796,iPad12.9"=2048×2732),不是近似。
import os
from PIL import Image, ImageDraw, ImageFont

SRC = r'C:\tmp\abyssshoot\shots'
DST = r'C:\tmp\abyssshoot\shots-final'

SIZES = {'iphone': (1290, 2796), 'ipad': (2048, 2732)}
BG_TOP = (14, 116, 144)      # #0e7490 浅礁青(与游戏 tier0 同色)
BG_BOT = (4, 18, 31)         # #04121f 深渊(与游戏 PAL.bg 同色)
ACCENT = (252, 211, 77)      # #fcd34d 金

# 微软雅黑粗体:同时支持中英,避免中文缺字变豆腐块
FONT = r'C:\Windows\Fonts\msyhbd.ttc'

CAPS = {
    'en': {
        '02-gameplay': ('Shoot fish up.', 'Same fish merge and evolve.'),
        '03-chain':    ('Chain reactions.', 'Bigger clusters, bigger fish.'),
        '01-codex':    ('Collect 17 sea creatures.', 'From clownfish to oarfish.'),
        '04-tools':    ('Smash. Swap. Undo.', 'Save a board gone wrong.'),
        '05-deep':     ('Merge into the deep.', 'Sharks, whales, legends.'),
    },
    'zh': {
        '02-gameplay': ('把鱼射上去', '同种合并，越合越大'),
        '03-chain':    ('连锁爆发', '团越大，鱼越大'),
        '01-codex':    ('收集 17 种深海生物', '从小丑鱼到皇带鱼'),
        '04-tools':    ('锤子 · 换列 · 撤销', '绝境也能翻盘'),
        '05-deep':     ('一路合进深渊', '鲨鱼、巨鲸、传说'),
    },
}


def gradient(size):
    w, h = size
    g = Image.new('RGB', (1, h))
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(1, h - 1)
        t = t ** 0.7                       # 上半段亮色多留一点
        d.point((0, y), fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    return g.resize(size, Image.BILINEAR)


def fit_font(draw, text, max_w, start, path=FONT):
    size = start
    while size > 12:
        f = ImageFont.truetype(path, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(path, 12)


def compose(src, dst, dev, cap):
    W, H = SIZES[dev]
    shot = Image.open(src).convert('RGB')
    canvas = gradient((W, H))
    d = ImageDraw.Draw(canvas)

    pad = int(W * 0.06)
    title_y = int(H * 0.045)
    # 文案两行:主标题(金,大) + 副标题(浅,小)
    f1 = fit_font(d, cap[0], W - pad * 2, int(W * 0.085))
    f2 = fit_font(d, cap[1], W - pad * 2, int(W * 0.048))
    t1w = d.textlength(cap[0], font=f1)
    t2w = d.textlength(cap[1], font=f2)
    d.text(((W - t1w) / 2, title_y), cap[0], font=f1, fill=ACCENT)
    y2 = title_y + f1.size * 1.25
    d.text(((W - t2w) / 2, y2), cap[1], font=f2, fill=(207, 232, 245))

    # 游戏画面:等比缩放贴在下方,顶部圆角,带柔和外发光
    top = int(y2 + f2.size * 2.6)
    avail_h = H - top - int(H * 0.02)
    avail_w = W - pad * 2
    sc = min(avail_w / shot.width, avail_h / shot.height)
    nw, nh = int(shot.width * sc), int(shot.height * sc)
    art = shot.resize((nw, nh), Image.LANCZOS)

    # 圆角遮罩
    r = int(nw * 0.045)
    m = Image.new('L', (nw, nh), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, nw - 1, nh - 1], radius=r, fill=255)
    x = (W - nw) // 2
    # 外发光(把画面从背景里托起来)
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rounded_rectangle(
        [x - 6, top - 6, x + nw + 6, top + nh + 6], radius=r + 6, fill=(43, 179, 192, 90))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), glow).convert('RGB')
    canvas.paste(art, (x, top), m)

    os.makedirs(os.path.dirname(dst), exist_ok=True)
    canvas.save(dst, 'PNG')
    assert canvas.size == (W, H), 'size mismatch: %s' % (canvas.size,)


def main():
    n = 0
    for lang in ('en', 'zh'):
        for dev in ('iphone', 'ipad'):
            for sid, cap in CAPS[lang].items():
                s = os.path.join(SRC, lang, dev, sid + '.png')
                t = os.path.join(DST, lang, dev, sid + '.png')
                compose(s, t, dev, cap)
                print('  %s/%s/%s.png  %s' % (lang, dev, sid, SIZES[dev]))
                n += 1
    print('composed %d shots -> %s' % (n, DST))
    print('NEXT: Read every image. Script success is NOT acceptance.')


if __name__ == '__main__':
    main()
