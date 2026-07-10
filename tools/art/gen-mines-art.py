# -*- coding: utf-8 -*-
# 批量生成扫雷小地牢立绘: Flux schnell Q4 (统一可爱风) → C:/ComfyUI/output/
# 用法: python gen-mines-art.py [--only id1,id2]
import json, time, urllib.request, sys, random

API = "http://127.0.0.1:8188"
STYLE = ("cute chibi game sprite, kawaii pastel colors, big head, tiny body, "
         "large sparkling eyes, thick clean dark-brown outline, soft cel shading, "
         "bold simple silhouette readable at small size, single centered character, "
         "plain soft cream background, no text, no watermark")
STYLE_ITEM = ("cute game item icon, kawaii pastel colors, glossy, "
              "thick clean dark-brown outline, soft cel shading, bold simple silhouette, "
              "single centered object, plain soft cream background, no text, no watermark")

ASSETS = {
  # 怪物(危险) — 朝向统一:面朝左(游戏里镜像翻转做朝右)
  "mousey":    f"a tiny round grey-pink mouse with big ears, facing left, {STYLE}",
  "flitter":   f"a small round lavender bat with tiny wings, hovering, facing left, {STYLE}",
  "rattle":    f"a cute cartoon bone creature, small skeleton puppy shape, facing left, {STYLE}",
  "cuddle":    f"a fluffy grey koala monster hugging itself, facing left, {STYLE}",
  "pudding":   f"a round mint-green frog with puffed cheeks, facing left, {STYLE}",
  "gazer":     f"a floating round one-eyed monster, big single violet eye, tiny bat wings, facing left, {STYLE}",
  "mouseking": f"a plump grey rat wearing a tiny golden crown, smug face, facing left, {STYLE}",
  "moobo":     f"a chubby brown-white cow monster with tiny horns, staring intensely, facing left, {STYLE}",
  "guard":     f"a sleepy grey wolf guard wearing a tiny cap, arms crossed, facing left, {STYLE}",
  "jelly":     f"a wobbly blue-purple squid jelly monster with cute tentacles, facing left, {STYLE}",
  "giant":     f"a huge gentle round stone golem with mossy patches and a shy smile, STRICT SIDE PROFILE VIEW facing left, head and body turned fully to the left, eyes looking left, walking left, {STYLE}",
  "mineking":  f"a round black bomb monster wearing a tall top hat and monocle, mischievous grin, facing left, {STYLE}",
  "mimic":     f"a pink gift box monster with sharp teeth inside opened lid, tongue out, facing left, {STYLE}",
  "dragon":    f"a majestic but cute pink-red baby dragon, small wings, proud pose, facing left, {STYLE}",
  "sage":      f"a tiny old wizard with long white beard, purple robe and pointy hat, facing left, {STYLE}",
  "boomy":     f"a round black bomb with a lit sparkling fuse and an anxious cute face, {STYLE}",
  "gnome":     f"a tiny mushroom gnome with red polka-dot cap, cheeky grin, mid-hop, facing left, {STYLE}",
  "egg":       f"a large cream dragon egg with pink spots, tiny crack on top, sitting in a small nest, {STYLE_ITEM}",
  # 物品(有益)
  "chest":     f"a small pink treasure chest with a ribbon bow, closed, {STYLE_ITEM}",
  "medikit":   f"a round white medicine capsule pill with a pink heart symbol, {STYLE_ITEM}",
  "orb":       f"a glowing crystal ball on a tiny golden stand, swirling sparkles inside, {STYLE_ITEM}",
  "spellorb":  f"a glowing star-shaped magic charm with sparkle trail, {STYLE_ITEM}",
  "treasure":  f"a sparkling pink-cyan gemstone cluster, {STYLE_ITEM}",
  "crown":     f"a golden royal crown with pink gems, radiant glow, {STYLE_ITEM}",
  "scroll":    f"an unrolled parchment scroll with glowing runes, wax seal, {STYLE_ITEM}",
  "wall":      f"a rounded stone brick wall block, mossy, cracked, {STYLE_ITEM}",
}

WF = {
  "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q4_K_S.gguf"}},
  "2": {"class_type": "DualCLIPLoader", "inputs": {"clip_name1": "t5xxl_fp8_e4m3fn.safetensors", "clip_name2": "clip_l.safetensors", "type": "flux"}},
  "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
  "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": "text, watermark, photo, realistic, scary, blurry"}},
  "5": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
  "6": {"class_type": "KSampler", "inputs": {"model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0],
        "seed": 0, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
  "7": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
  "8": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["7", 0]}},
  "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "mines"}},
}

def post(path, body):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

def get(path):
    return json.loads(urllib.request.urlopen(API + path, timeout=30).read())

only = None
if "--only" in sys.argv:
    only = set(sys.argv[sys.argv.index("--only") + 1].split(","))

jobs = []
for aid, prompt in ASSETS.items():
    if only and aid not in only: continue
    wf = json.loads(json.dumps(WF))
    wf["3"]["inputs"]["text"] = prompt
    wf["6"]["inputs"]["seed"] = random.randint(1, 2**31)
    wf["9"]["inputs"]["filename_prefix"] = "mines_" + aid
    r = post("/prompt", {"prompt": wf})
    jobs.append((aid, r["prompt_id"]))
    print("queued", aid, r["prompt_id"], flush=True)

# 等全部完成
pending = dict(jobs)
t0 = time.time()
while pending and time.time() - t0 < 1800:
    time.sleep(6)
    for aid, pid in list(pending.items()):
        try:
            h = get(f"/history/{pid}")
            if pid in h and h[pid].get("status", {}).get("completed"):
                outs = [o["filename"] for node in h[pid]["outputs"].values() for o in node.get("images", [])]
                print("done", aid, outs, flush=True)
                del pending[aid]
        except Exception as e:
            pass
print("ALL DONE" if not pending else f"TIMEOUT, pending: {list(pending)}", flush=True)
