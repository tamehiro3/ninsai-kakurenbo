# -*- coding: utf-8 -*-
"""
手描き風「ゲーム用アレンジ案」キャラクターシートを画像生成AIで作るためのプロンプトを39体分書き出す。
  python ninsai-kakurenbo/tools/build_prompts.py  → docs/image-prompts_39.txt
狐白のシートを作ったときのプロンプト（Codex outputs/image-prompts.txt）と同じ骨格。
参照画像は cnp-3d/ref_official/2d/NNN_Name.png（公式2D）と 3d/NNN_Name.png（公式3Dフィギュア）。
できたシートは tools/prep_assets.py --auto <png> <id> でスプライトに切り出せる。
"""
import os, json, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")
os.makedirs(OUT, exist_ok=True)


def load_chars():
    src = open(os.path.join(ROOT, "chars.js"), encoding="utf-8").read()
    body = src[src.index("const CHARS_ALL = ") + len("const CHARS_ALL = "):]
    return json.loads(body[:body.index("];") + 1])


HEAD = """# 手描き風キャラクターシート 生成プロンプト（CryptoNinja 39体）
# 制作方式：狐白のシートと同じ built-in image_gen / imagegen（CLI・APIキー不使用）。
# 各キャラの「参照1」= cnp-3d/ref_official/2d/NNN_Name.png（公式2D）、「参照2」= 3d/NNN_Name.png（公式3Dフィギュア）。
# 生成後の目視確認：髪・面・武器・衣装色が公式と一致するか。背面・足元・小物の位置は制作案。
# できたPNGは ninsai-kakurenbo/tools/prep_assets.py --auto <png> <id> で4方向＋しぐさに切り出す。
# 既に手描きシートがある3体（狐白・咲耶・刃）は除外。

"""

BODY = """### #{num} {name} / {en}
参照1: cnp-3d/ref_official/2d/{num}_{file}.png　参照2: cnp-3d/ref_official/3d/{num}_{file}.png
Use case: stylized-concept. Create a polished landscape Japanese game character model sheet of CryptoNinja {en} (#{num}, "{name}"), based faithfully on input 1 (official 2D illustration) and input 2 (official 3D figure) for identity, colors and equipment. Cream washi paper, fine graphite outlines with crisp muted watercolor/cel fills, large clear readable silhouettes, cute 2.5-head proportions suitable for a hide-and-seek game. Human/character identity to preserve: {identity}. Japanese reference notes from the official images: {look}. Weapon or prop kept small and safe in all poses. Views in top row: front, 3/4, side, back, aligned identical scale. Back/feet are proposed fan-game adaptations. Bottom left four emotional body/head poses: neutral, happy, startled, concentrating. Bottom right walking, and crouching behind a camouflage cloth with bamboo vertical stripe pattern (face partly visible). Small palette swatches: {palette}. Minimal Japanese labels exactly: top '{name}｜キャラクターシート'; sub 'ゲーム用アレンジ案'; view labels 'まえ' 'ななめ' 'よこ' 'うしろ'; bottom 'しぐさ' and 'うごき・擬態'; footer 'CryptoNinja ファンゲーム制作資料'. Uniformly opaque light warm ivory paper #F7F1E5, no dark gradients, no vignette, all text dark brown #3B302A highly legible. Airy professional production sheet, no scenic background, no logo, no other characters.

"""


def identity_from(c):
    parts = []
    if c.get("clan") and c["clan"] != "—":
        parts.append(f"{c['clanEn'] or c['clan']} clan ninja")
    if c.get("weapon") and c["weapon"] != "—":
        parts.append(f"signature item: {c['weaponEn'] or c['weapon']}")
    if c.get("jutsuEn"):
        parts.append(f"ninjutsu theme: {c['jutsuEn']}")
    return "; ".join(parts) if parts else "official CryptoNinja character"


def main():
    chars = load_chars()
    out = [HEAD]
    n = 0
    for c in chars:
        if c["painted"]:
            continue
        out.append(BODY.format(num=c["num"], name=c["name"], en=c["en"], file=c["file"], identity=identity_from(c),
                               look=(c["look"] or "（見た目メモなし・公式画像に忠実に）").replace("\n", " "),
                               palette=" / ".join(c["palette"][:6]) if c["palette"] else "match the official colors"))
        n += 1
    path = os.path.join(OUT, "image-prompts_39.txt")
    open(path, "w", encoding="utf-8").write("".join(out))
    print(f"{path}: {n}体")


if __name__ == "__main__":
    main()
