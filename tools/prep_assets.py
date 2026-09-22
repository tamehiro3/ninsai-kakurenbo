# -*- coding: utf-8 -*-
"""
キャラクターシート（Codex出力の character-kohaku.png / character-sakuya-jin.png）から
ゲーム用スプライト・顔アイコン・アプリアイコン・図鑑用の縮小シートを作る。
  python ninsai-kakurenbo/tools/prep_assets.py
背景は紙色なので、外周からのフラッドフィルで透過にし、最大の連結成分だけ残す（ラベル文字の混入防止）。
"""
import os, sys
from collections import deque
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.environ.get("NINSAI_SHEETS", r"C:\Users\3mori\Documents\Codex\2026-09-22\https-vibe-co-jp-luna-occulta-3\outputs")
OUT_CHARS = os.path.join(ROOT, "img", "chars")
OUT_FACES = os.path.join(ROOT, "img", "faces")
OUT_SHEETS = os.path.join(ROOT, "img", "sheets")
OUT_ICON = os.path.join(ROOT, "icons")
for d in (OUT_CHARS, OUT_FACES, OUT_SHEETS, OUT_ICON):
    os.makedirs(d, exist_ok=True)

SPRITE_H = 240   # ゲーム内・ポートレート共用（ブラウザ側で縮小）

# (file, char id, view, box) box = (x0,y0,x1,y1) 元画像1536x1024の座標
CROPS = [
    ("character-kohaku.png", "kohaku", "front", (100, 110, 340, 545)),
    ("character-kohaku.png", "kohaku", "quarter", (430, 110, 680, 545)),
    ("character-kohaku.png", "kohaku", "side", (790, 130, 1010, 545)),
    ("character-kohaku.png", "kohaku", "back", (1120, 120, 1400, 545)),
    ("character-kohaku.png", "kohaku", "neutral", (40, 620, 250, 935)),
    ("character-kohaku.png", "kohaku", "happy", (250, 620, 450, 935)),
    ("character-kohaku.png", "kohaku", "surprised", (450, 620, 640, 935)),
    ("character-kohaku.png", "kohaku", "focus", (640, 620, 840, 935)),
    ("character-kohaku.png", "kohaku", "walk", (880, 620, 1160, 935)),
    ("character-sakuya-jin.png", "sakuya", "front", (200, 160, 400, 525)),
    ("character-sakuya-jin.png", "sakuya", "quarter", (400, 160, 595, 525)),
    ("character-sakuya-jin.png", "sakuya", "side", (610, 160, 790, 525)),
    ("character-sakuya-jin.png", "sakuya", "back", (800, 160, 965, 525)),
    ("character-sakuya-jin.png", "sakuya", "happy", (990, 165, 1180, 505)),
    ("character-sakuya-jin.png", "sakuya", "surprised", (1180, 165, 1365, 505)),
    ("character-sakuya-jin.png", "sakuya", "crouch", (1365, 215, 1525, 505)),
    ("character-sakuya-jin.png", "jin", "front", (200, 590, 400, 935)),
    ("character-sakuya-jin.png", "jin", "quarter", (400, 590, 600, 935)),
    ("character-sakuya-jin.png", "jin", "side", (610, 590, 790, 935)),
    ("character-sakuya-jin.png", "jin", "back", (800, 590, 965, 935)),
    ("character-sakuya-jin.png", "jin", "happy", (990, 600, 1180, 935)),
    ("character-sakuya-jin.png", "jin", "surprised", (1180, 600, 1365, 935)),
    ("character-sakuya-jin.png", "jin", "crouch", (1365, 650, 1525, 935)),
]


def cut_out(im, tol=26):
    """外周から背景色をフラッドフィルして透過に。最大連結成分だけ残す。"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def near(p):
        return (p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2 <= tol * tol

    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near(px[x, y]) and not outside[y * w + x]:
                outside[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near(px[x, y]) and not outside[y * w + x]:
                outside[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx] and near(px[nx, ny]):
                outside[ny * w + nx] = 1
                q.append((nx, ny))
    label = [0] * (w * h)
    best, best_n, cur = 0, 0, 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if outside[i0] or label[i0]:
                continue
            cur += 1
            n = 0
            stack = [(x0, y0)]
            label[i0] = cur
            while stack:
                x, y = stack.pop()
                n += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not outside[j] and not label[j]:
                            label[j] = cur
                            stack.append((nx, ny))
            if n > best_n:
                best_n, best = n, cur
    for y in range(h):
        for x in range(w):
            i = y * w + x
            r, g, b, a = px[x, y]
            if outside[i] or label[i] != best:
                px[x, y] = (r, g, b, 0)
            else:
                d = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
                if d < tol * 1.6:
                    px[x, y] = (r, g, b, int(255 * min(1.0, max(0.25, d / (tol * 1.6)))))
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    sheets = {}
    for f in {c[0] for c in CROPS}:
        p = os.path.join(SRC, f)
        if not os.path.exists(p):
            print("シートが見つかりません:", p)
            sys.exit(1)
        sheets[f] = Image.open(p).convert("RGBA")
    made = 0
    for f, cid, view, box in CROPS:
        im = cut_out(sheets[f].crop(box))
        h = SPRITE_H
        w = max(1, round(im.width * h / im.height))
        im = im.resize((w, h), Image.LANCZOS)
        im.save(os.path.join(OUT_CHARS, f"{cid}_{view}.png"), optimize=True)
        made += 1
        if view == "front":
            side = int(im.width * 1.15)
            face = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            face.paste(im, ((side - im.width) // 2, 6), im)
            face = face.crop((0, 0, side, side)).resize((96, 96), Image.LANCZOS)
            face.save(os.path.join(OUT_FACES, f"{cid}.png"), optimize=True)
    print(f"sprites: {made} / faces: 3")

    for f, name in (("character-kohaku.png", "kohaku_sheet.jpg"), ("character-sakuya-jin.png", "sakuya_jin_sheet.jpg")):
        im = sheets[f].convert("RGB").resize((1024, 683), Image.LANCZOS)
        im.save(os.path.join(OUT_SHEETS, name), quality=78, optimize=True)
    print("sheets: 2")

    front = Image.open(os.path.join(OUT_CHARS, "kohaku_front.png")).convert("RGBA")

    def make_icon(size, path):
        ic = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(ic)
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=(21, 34, 43, 255))
        d.ellipse((size * 0.08, size * 0.08, size * 0.92, size * 0.92), fill=(199, 165, 91, 255))
        d.ellipse((size * 0.12, size * 0.12, size * 0.88, size * 0.88), fill=(31, 48, 62, 255))
        headh = int(front.height * 0.46)
        head = front.crop((0, 0, front.width, headh))
        scale = (size * 0.62) / head.width
        head = head.resize((int(head.width * scale), int(head.height * scale)), Image.LANCZOS)
        ic.paste(head, ((size - head.width) // 2, int(size * 0.2)), head)
        ic.save(path, optimize=True)

    make_icon(192, os.path.join(OUT_ICON, "icon-192.png"))
    make_icon(512, os.path.join(OUT_ICON, "icon-512.png"))
    make_icon(180, os.path.join(OUT_ICON, "apple-touch-icon.png"))
    print("icons: ok")


def auto_extract(png, cid, out_dir=OUT_CHARS):
    """生成したキャラクターシートPNGから、上段4方向（まえ/ななめ/よこ/うしろ）と
    下段のしぐさ（ふつう/うれしい/びっくり/しんけん/あるく/かくれる）を自動で切り出す。
      python ninsai-kakurenbo/tools/prep_assets.py --auto <sheet.png> <id>
    紙色の背景と黒い輪郭が前提。ラベル文字やパレットは小さいので除外される。"""
    im = Image.open(png).convert("RGB")
    W, H = im.size
    k = 4
    small = im.resize((W // k, H // k), Image.BILINEAR)
    w, h = small.size
    px = small.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    tol = 40
    fg = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 > tol * tol:
                fg[y * w + x] = 1
    # 連結成分（8連結）→ bbox
    label = [0] * (w * h)
    boxes = []
    cur = 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if not fg[i0] or label[i0]:
                continue
            cur += 1
            stack = [(x0, y0)]; label[i0] = cur
            x1 = x2 = x0; y1 = y2 = y0; n = 0
            while stack:
                x, y = stack.pop(); n += 1
                x1 = min(x1, x); x2 = max(x2, x); y1 = min(y1, y); y2 = max(y2, y)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            j = ny * w + nx
                            if fg[j] and not label[j]:
                                label[j] = cur; stack.append((nx, ny))
            boxes.append((x1, y1, x2, y2, n))
    figs = [b for b in boxes if (b[3] - b[1]) > h * 0.14 and (b[2] - b[0]) > w * 0.04]
    # 近すぎる箱（同じ図の分離パーツ）を横方向で結合
    figs.sort(key=lambda b: (b[1] > h * 0.5, b[0]))
    merged = []
    for b in figs:
        if merged:
            m = merged[-1]
            same_row = (m[1] > h * 0.5) == (b[1] > h * 0.5)
            if same_row and b[0] <= m[2] + w * 0.01:
                merged[-1] = (min(m[0], b[0]), min(m[1], b[1]), max(m[2], b[2]), max(m[3], b[3]), m[4] + b[4]); continue
        merged.append(b)
    top = [b for b in merged if b[1] <= h * 0.5]
    bottom = [b for b in merged if b[1] > h * 0.5]
    print(f"検出: 上段 {len(top)} 体 / 下段 {len(bottom)} 体")
    names_top = ["front", "quarter", "side", "back"]
    names_bottom = ["neutral", "happy", "surprised", "focus", "walk", "hide"]
    made = 0
    for row, names in ((top, names_top), (bottom, names_bottom)):
        for b, name in zip(row, names):
            pad = 3
            box = (max(0, (b[0] - pad) * k), max(0, (b[1] - pad) * k), min(W, (b[2] + pad + 1) * k), min(H, (b[3] + pad + 1) * k))
            crop = cut_out(im.crop(box))
            hh = SPRITE_H
            ww = max(1, round(crop.width * hh / crop.height))
            crop = crop.resize((ww, hh), Image.LANCZOS)
            crop.save(os.path.join(out_dir, f"{cid}_{name}.png"), optimize=True)
            made += 1
            if name == "front":
                side = int(crop.width * 1.15)
                face = Image.new("RGBA", (side, side), (0, 0, 0, 0))
                face.paste(crop, ((side - crop.width) // 2, 6), crop)
                face.crop((0, 0, side, side)).resize((96, 96), Image.LANCZOS).save(os.path.join(OUT_FACES, f"{cid}.png"), optimize=True)
    print(f"{cid}: {made} 枚を書き出し（{out_dir}）。上段が4体・下段が6体でなければシートの配置を確認")
    if len(top) != 4:
        print("⚠ 上段の検出数が4ではない。ラベルや配置を確認して手動の CROPS で切り出す")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "--auto":
        auto_extract(sys.argv[2], sys.argv[3])
    else:
        main()
