# games/snake/tools/cut-items.py — 把 raw/*.png 抠成透明 PNG(transparent_background,venv python 跑)
# 用 C:\ComfyUIenv\Scripts\python.exe 跑(有 transparent_background + cuda);裁内容+正方+256。
import os
from PIL import Image
from transparent_background import Remover
names=['apple','twin','gold','demon','meteor','feather','trail','cloud','scissors','halo','heart','magnet','gift']
os.makedirs('cut',exist_ok=True)
rm=Remover(mode='base',device='cuda')
for n in names:
    img=Image.open('raw/%s.png'%n).convert('RGB')
    out=rm.process(img,type='rgba')          # RGBA 透明
    a=out.split()[3]
    bbox=a.getbbox()
    if bbox: out=out.crop(bbox)
    w,h=out.size; s=max(w,h); pad=int(s*0.08); side=s+pad*2  # 8% 边距
    canvas=Image.new('RGBA',(side,side),(0,0,0,0))
    canvas.paste(out,((side-w)//2,(side-h)//2),out)
    canvas=canvas.resize((256,256),Image.LANCZOS)
    canvas.save('cut/%s.png'%n)
    print('  cut',n,canvas.size)
print('done -> cut/')
