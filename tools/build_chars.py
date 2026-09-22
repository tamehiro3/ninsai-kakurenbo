# -*- coding: utf-8 -*-
"""
CryptoNinja 公式39体をゲームに取り込む（課金なし）。
  python ninsai-kakurenbo/tools/build_chars.py

入力（cnp-3d/ref_official/）
  roster.json … 公式の番号・和名・英名・クラン・忍術・武器・誕生日・紹介文（名前の正本）
  specs.json  … 公式画像をAI解析した色・見た目メモ（パレットと生成プロンプトに使う）
  3d/NNN_Name.png … 公式3Dフィギュア画像（全身・白背景）→ 切り抜いてゲーム内スプライト（正面）
  2d/NNN_Name.png … 公式2Dイラスト（膝上）→ 顔アイコン・図鑑の肖像

出力（ninsai-kakurenbo/）
  chars.js            … CHARS_ALL（39体・ゲームと図鑑が読む）
  img/chars/<id>_front.png … 正面スプライト（高さ240）。手描きシートから作った3体（kohaku/sakuya/jin）は上書きしない
  img/faces/<id>.png       … 96px 顔アイコン（公式2Dの頭部）
  img/art/<id>.jpg         … 図鑑の肖像 360px（公式2D）
"""
import os, sys, json, re
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNS = os.path.dirname(ROOT)
REF = os.path.join(SNS, "cnp-3d", "ref_official")
OUT_CHARS = os.path.join(ROOT, "img", "chars")
OUT_FACES = os.path.join(ROOT, "img", "faces")
OUT_ART = os.path.join(ROOT, "img", "art")
for d in (OUT_CHARS, OUT_FACES, OUT_ART):
    os.makedirs(d, exist_ok=True)

PAINTED = {"kohaku", "sakuya", "jin"}     # 手描きシート由来の4方向スプライトを持つ
SPRITE_H = 240


def split_bilingual(s):
    """'伊賀 Iga' → ('伊賀', 'Iga')。None/'None' → ('—','')"""
    if not s or s.strip().lower() == "none":
        return ("—", "")
    parts = s.strip().split(" ", 1)
    return (parts[0], parts[1] if len(parts) > 1 else "")


def cut_out_white(im, tol=34):
    """白背景をフラッドフィルで透過にし、最大の連結成分だけ残す（足元の薄い影も落ちる）"""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = (255, 255, 255)

    def near(p):
        return (255 - p[0]) + (255 - p[1]) + (255 - p[2]) <= tol * 3

    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near(px[x, y]) and not outside[y * w + x]:
                outside[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near(px[x, y]) and not outside[y * w + x]:
                outside[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx] and near(px[nx, ny]):
                outside[ny * w + nx] = 1; q.append((nx, ny))
    label = [0] * (w * h)
    best, best_n, cur = 0, 0, 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if outside[i0] or label[i0]:
                continue
            cur += 1; n = 0
            stack = [(x0, y0)]; label[i0] = cur
            while stack:
                x, y = stack.pop(); n += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not outside[j] and not label[j]:
                            label[j] = cur; stack.append((nx, ny))
            if n > best_n:
                best_n, best = n, cur
    for y in range(h):
        for x in range(w):
            i = y * w + x
            r, g, b, a = px[x, y]
            if outside[i] or label[i] != best:
                px[x, y] = (r, g, b, 0)
            else:
                d = (255 - r) + (255 - g) + (255 - b)
                if d < tol * 5:        # 白に近い縁は半透明にしてジャギーを抑える
                    px[x, y] = (r, g, b, int(255 * max(0.3, min(1.0, d / (tol * 5)))))
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def main():
    roster = json.load(open(os.path.join(REF, "roster.json"), encoding="utf-8"))
    specs = {s["id"]: s for s in json.load(open(os.path.join(REF, "specs.json"), encoding="utf-8"))}
    manifest = json.load(open(os.path.join(SNS, "cnp-3d", "models", "manifest.json"), encoding="utf-8"))
    accent = {c["id"]: c.get("accent") for c in manifest["characters"] if c.get("num")}
    by_num = {c["num"]: c["id"] for c in manifest["characters"] if c.get("num")}

    chars = []
    for r in roster:
        cid = by_num.get(r["num"])
        if not cid:
            print("manifest に無い:", r["num"], r["nameJa"]); continue
        sp = specs.get(cid, {})
        clan, clan_en = split_bilingual(r.get("clan"))
        jutsu, jutsu_en = split_bilingual(r.get("ninjutsu"))
        weapon, weapon_en = split_bilingual(r.get("weapon"))
        bio = (r.get("bio") or "").strip()
        bio_en = (r.get("bioEn") or "").strip()
        palette = [c for c in [sp.get("skin"), sp.get("hair"), sp.get("hair2"), sp.get("eye"), sp.get("outfit"), sp.get("outfit2"), sp.get("pants"), sp.get("boots"), sp.get("sleeve"), sp.get("scarf")] if c and re.match(r"^#[0-9A-Fa-f]{6}$", c)]
        seen, pal = set(), []
        for c in palette:
            if c.upper() not in seen:
                seen.add(c.upper()); pal.append(c.upper())
        chars.append({
            "id": cid, "num": r["num"], "name": r["nameJa"], "en": r["nameEn"], "file": r["file"],
            "clan": clan, "clanEn": clan_en, "jutsu": jutsu, "jutsuEn": jutsu_en, "weapon": weapon, "weaponEn": weapon_en,
            "birthday": r.get("birthday") or "—", "bio": bio, "bioEn": bio_en,
            "color": accent.get(cid) or sp.get("outfit") or "#7a4fb0", "palette": pal[:8],
            "look": (sp.get("look") or "").strip(), "painted": cid in PAINTED,
        })

        # --- 正面スプライト（公式3Dフィギュア） ---
        fig = os.path.join(REF, "3d", f"{r['num']}_{r['file']}.png")
        if not os.path.exists(fig):
            cands = [f for f in os.listdir(os.path.join(REF, "3d")) if f.startswith(r["num"] + "_")]
            fig = os.path.join(REF, "3d", cands[0]) if cands else None
        if fig and cid not in PAINTED:
            im = cut_out_white(Image.open(fig))
            w = max(1, round(im.width * SPRITE_H / im.height))
            im.resize((w, SPRITE_H), Image.LANCZOS).save(os.path.join(OUT_CHARS, f"{cid}_front.png"), optimize=True)
        elif not fig:
            print("3D画像なし:", r["num"])

        # --- 顔アイコンと図鑑の肖像（公式2D） ---
        art = os.path.join(REF, "2d", f"{r['num']}_{r['file']}.png")
        if not os.path.exists(art):
            cands = [f for f in os.listdir(os.path.join(REF, "2d")) if f.startswith(r["num"] + "_")]
            art = os.path.join(REF, "2d", cands[0]) if cands else None
        if art:
            im = Image.open(art).convert("RGB")
            face = im.crop((260, 40, 1740, 1520)).resize((96, 96), Image.LANCZOS)
            face.save(os.path.join(OUT_FACES, f"{cid}.png"), optimize=True)
            im.resize((360, 360), Image.LANCZOS).save(os.path.join(OUT_ART, f"{cid}.jpg"), quality=80, optimize=True)
        else:
            print("2D画像なし:", r["num"])

    js = "// CryptoNinja 公式39体（自動生成：tools/build_chars.py・出典 ninja-dao.com/characters・名前の正本は cnp-3d/ref_official/roster.json）\n"
    js += "const CHARS_ALL = " + json.dumps(chars, ensure_ascii=False, indent=1) + ";\n"
    js += 'if (typeof module !== "undefined") module.exports = CHARS_ALL;\n'
    open(os.path.join(ROOT, "chars.js"), "w", encoding="utf-8").write(js)
    print(f"chars.js: {len(chars)}体 / sprites: {len([c for c in chars if not c['painted']])} / faces+art: {len(chars)}")


if __name__ == "__main__":
    main()
