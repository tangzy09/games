// games/snake/tools/gen-appicon.js — 合成 iOS 图标/启动屏源图(playwright 无头 canvas)
// 产出 resources/icon.png(1024²,天使满血出血,无边框/无烘焙圆角/无 alpha)
//     resources/splash.png(2732²,粉彩底 + 居中天使)
// 用法: node games/snake/tools/gen-appicon.js   (playwright 走仓库根 node_modules)
//
// ⚠ 图标铁律(见全局 skill generating-app-icons,踩过白边+alpha 双坑):
//   1. 满血出血——美术画到 1024 四边,不留任何内缩边、不画描边框、不烘焙圆角(iOS 自己切角;
//      自己再切一层 = 双圆角,四角露底色 = 「白边」)。
//   2. 无 alpha——苹果拒收带透明通道的图标;产出后一律 flatten 成 RGB。
//   3. 四角不得near-white——满血蓝天会让角发白,故略微放大(cover)+ 轻微下沉聚焦脸部,
//      并给四角压一层同世界观的柔粉晕(不是描边框,是径向渐变叠色),读起来是天空不是白边。
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const ANGEL = '0bep0x.webp';   // 精选:蓝天底/主体居中/明亮可爱(00wq72 偏暗、08aj1n 太密)
const OUT = path.join(ROOT, 'resources');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'angels', ANGEL)).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const dataUrls = await page.evaluate(async (imgB64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/webp;base64,' + imgB64; });

    // —— icon 1024²:满血出血。源 512²,放大 1.12× cover 铺满,略上移聚焦脸部 ——
    const N = 1024;
    const ic = document.createElement('canvas'); ic.width = ic.height = N;
    const x = ic.getContext('2d');
    x.fillStyle = '#eaf4ff'; x.fillRect(0, 0, N, N);              // 兜底(几乎被完全盖住)
    const zoom = 1.12, dw = N * zoom, dh = N * zoom;
    x.drawImage(img, (N - dw) / 2, (N - dh) / 2 - N * 0.03, dw, dh);   // 略上移,让脸落在视觉中心

    // 四角柔粉晕:四个径向渐变把最亮的天空角压成粉彩,避免「发白的角」(不是描边框)
    for (const [cx, cy] of [[0, 0], [N, 0], [0, N], [N, N]]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, N * 0.42);
      g.addColorStop(0, 'rgba(247,184,212,0.55)');
      g.addColorStop(1, 'rgba(247,184,212,0)');
      x.fillStyle = g; x.fillRect(0, 0, N, N);
    }
    // 顶部再压一层极浅暖光,统一色温
    const top = x.createLinearGradient(0, 0, 0, N);
    top.addColorStop(0, 'rgba(255,245,157,0.10)');
    top.addColorStop(0.4, 'rgba(255,245,157,0)');
    x.fillStyle = top; x.fillRect(0, 0, N, N);

    // —— splash 2732²:粉彩底 + 居中天使(圆角,启动屏可留边,非图标不受铁律限制) ——
    function rr(x2, X, Y, w, h, r) {
      x2.beginPath();
      x2.moveTo(X + r, Y); x2.arcTo(X + w, Y, X + w, Y + h, r); x2.arcTo(X + w, Y + h, X, Y + h, r);
      x2.arcTo(X, Y + h, X, Y, r); x2.arcTo(X, Y, X + w, Y, r); x2.closePath();
    }
    const sp = document.createElement('canvas'); sp.width = sp.height = 2732;
    const y = sp.getContext('2d');
    y.fillStyle = '#fdf3f7'; y.fillRect(0, 0, 2732, 2732);
    const s = 640, sx = (2732 - s) / 2;
    rr(y, sx, sx, s, s, 80); y.save(); y.clip();
    y.drawImage(img, sx, sx, s, s);
    y.restore();

    return { icon: ic.toDataURL('image/png'), splash: sp.toDataURL('image/png') };
  }, b64);

  for (const [name, url] of Object.entries(dataUrls)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
  }
  await browser.close();

  // flatten 去 alpha(RGB)+ 四角自检:任一角 near-white(min 通道>235 且饱和度<0.06)即报错
  const py = `
from PIL import Image
for f,mn in [('icon.png',50000),('splash.png',10000)]:
    p='${OUT.replace(/\\/g, '/')}/'+f
    im=Image.open(p).convert('RGB'); im.save(p)   # 去 alpha
    import os
    assert os.path.getsize(p)>=mn, f+' too small'
    if f=='icon.png':
        w,h=im.size
        assert (w,h)==(1024,1024), 'icon must be 1024²'
        for cx,cy in [(6,6),(w-6,6),(6,h-6),(w-6,h-6)]:
            r,g,b=im.getpixel((cx,cy)); mx,mn2=max(r,g,b),min(r,g,b)
            sat=0 if mx==0 else (mx-mn2)/mx
            assert not (mn2>235 and sat<0.06), f'corner {cx},{cy} near-white {(r,g,b)} — 会露白边'
        # alpha 已去
        assert Image.open(p).mode=='RGB', 'icon still has alpha'
    print('OK',f,im.size,Image.open(p).mode)
`;
  execSync('python -c "' + py.replace(/"/g, '\\"') + '"', { stdio: 'inherit' });
  console.log('OK gen-appicon —— 记得 Read icon.png 肉眼验(满血/无框/无白角/脸清晰)');
})();
