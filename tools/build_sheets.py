# -*- coding: utf-8 -*-
"""
公式39体の「資料シート」（1536×1024・JPEG）を Edge ヘッドレスで作る（課金なし）。
  python ninsai-kakurenbo/tools/build_sheets.py            # 全員
  python ninsai-kakurenbo/tools/build_sheets.py shiba oto  # 指定だけ
手描き風の「ゲーム用アレンジ案」シートは画像生成が必要なので別（docs/image-prompts_39.txt のプロンプトで作る）。
ここで作るのは公式2D・公式3Dフィギュア・公式データ・パレットを1枚にまとめた参照用。
出力: img/sheets/<id>.jpg
"""
import os, sys, json, subprocess, html, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNS = os.path.dirname(ROOT)
REF = os.path.join(SNS, "cnp-3d", "ref_official")
OUT = os.path.join(ROOT, "img", "sheets")
os.makedirs(OUT, exist_ok=True)
W, H = 1536, 1024


def edge_path():
    for p in [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]:
        if os.path.exists(p):
            return p
    raise SystemExit("msedge.exe が見つかりません")


def file_url(p):
    return "file:///" + os.path.abspath(p).replace("\\", "/")


def load_chars():
    src = open(os.path.join(ROOT, "chars.js"), encoding="utf-8").read()
    body = src[src.index("const CHARS_ALL = ") + len("const CHARS_ALL = "):]
    body = body[:body.index("];") + 1]
    return json.loads(body)


TEMPLATE = """<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
html,body{margin:0;width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:#F7F1E5;color:#3B302A;font-family:"Yu Gothic UI","Meiryo",sans-serif}
.wrap{position:relative;width:%(W)dpx;height:%(H)dpx;padding:38px 56px;box-sizing:border-box}
h1{margin:0;font-family:"Yu Mincho","MS Mincho",serif;font-size:44px;font-weight:700;letter-spacing:.04em}
h1 small{font-size:24px;margin-left:14px;font-weight:600}
.sub{font-size:19px;margin:2px 0 18px;color:#5a4d3f}
.row{display:flex;gap:34px;height:700px}
.col1{width:400px;display:flex;flex-direction:column;align-items:center}
.col1 img{width:380px;height:380px;border-radius:24px;box-shadow:0 4px 14px rgba(60,40,20,.18)}
.cap{font-size:18px;margin-top:10px;color:#5a4d3f}
.col2{width:470px;display:flex;flex-direction:column;align-items:center}
.figs{display:flex;gap:14px;align-items:flex-end;height:420px}
.figs img{height:400px;max-width:225px;object-fit:contain}
.figs .flip{transform:scaleX(-1)}
.labels{display:flex;gap:90px;font-size:18px;color:#5a4d3f;margin-top:8px}
.col3{flex:1;font-size:17px;line-height:1.55}
table{border-collapse:collapse;width:100%%}
td{padding:6px 8px;border-bottom:1px solid #d9cdb4;vertical-align:top}
td:first-child{width:96px;color:#8a6b2f;font-weight:700}
.bio{margin-top:10px;font-size:16px;line-height:1.6}
.look{margin-top:10px;font-size:13px;line-height:1.55;color:#5a4d3f;max-height:150px;overflow:hidden}
.pal{display:flex;gap:10px;margin-top:12px}
.pal span{width:44px;height:44px;border-radius:50%%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.foot{position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:17px;color:#5a4d3f;letter-spacing:.06em}
.rule{position:absolute;left:56px;right:56px;bottom:58px;border-top:2px solid #6b5a46}
</style></head><body><div class="wrap">
<h1>%(name)s <span style="font-weight:400">｜</span> キャラクターシート <small>#%(num)s %(en)s</small></h1>
<div class="sub">公式資料の参照シート（公式2D・公式3Dフィギュア・公式データ）。ゲーム用アレンジ案は別途作成。</div>
<div class="row">
 <div class="col1"><img src="%(art)s" alt=""><div class="cap">公式2Dイラスト</div></div>
 <div class="col2"><div class="figs"><img src="%(fig)s" alt=""><img class="flip" src="%(fig)s" alt=""></div><div class="labels"><span>まえ</span><span>反転（ゲーム内の向き）</span></div><div class="pal">%(pal)s</div></div>
 <div class="col3">
  <table>
   <tr><td>番号</td><td>#%(num)s</td></tr>
   <tr><td>名前</td><td>%(name)s / %(en)s</td></tr>
   <tr><td>クラン</td><td>%(clan)s</td></tr>
   <tr><td>忍術</td><td>%(jutsu)s</td></tr>
   <tr><td>武器</td><td>%(weapon)s</td></tr>
   <tr><td>誕生日</td><td>%(birthday)s</td></tr>
  </table>
  <div class="bio">%(bio)s</div>
  <div class="look"><b>見た目メモ（公式画像のAI解析・制作の手がかり）</b><br>%(look)s</div>
 </div>
</div>
<div class="rule"></div>
<div class="foot">CryptoNinja ファンゲーム制作資料 ／ 出典：Ninja DAO 公式キャラクター資料（ninja-dao.com/characters・CC0）／ 本作は非公式</div>
</div></body></html>"""


def main(argv):
    chars = load_chars()
    only = set(a for a in argv if not a.startswith("--"))
    edge = edge_path()
    tmp = tempfile.mkdtemp(prefix="ninsai_sheet_")
    n = 0
    for c in chars:
        if only and c["id"] not in only:
            continue
        art = os.path.join(REF, "2d", f"{c['num']}_{c['file']}.png")
        fig = os.path.join(REF, "3d", f"{c['num']}_{c['file']}.png")
        if not os.path.exists(art) or not os.path.exists(fig):
            print("画像なし:", c["id"]); continue
        pal = "".join(f'<span style="background:{p}"></span>' for p in c["palette"])
        # フィギュア画像は余白が広いので、白でない範囲だけに切り詰めてから置く
        from PIL import Image, ImageChops
        fim = Image.open(fig).convert("RGB")
        diff = ImageChops.difference(fim, Image.new("RGB", fim.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 24 else 0)
        bb = diff.getbbox() or (0, 0, fim.width, fim.height)
        fig_c = os.path.join(tmp, c["id"] + "_fig.png")
        fim.crop((max(0, bb[0] - 10), max(0, bb[1] - 10), min(fim.width, bb[2] + 10), min(fim.height, bb[3] + 10))).save(fig_c)
        bio = html.escape(c["bio"] or (c["bioEn"] or "公式資料に紹介文なし"))
        page = TEMPLATE % {
            "W": W, "H": H, "name": html.escape(c["name"]), "en": html.escape(c["en"]), "num": c["num"],
            "art": file_url(art), "fig": file_url(fig_c), "pal": pal,
            "clan": html.escape((c["clan"] + " " + c["clanEn"]).strip()), "jutsu": html.escape((c["jutsu"] + " " + c["jutsuEn"]).strip()),
            "weapon": html.escape((c["weapon"] + " " + c["weaponEn"]).strip()), "birthday": html.escape(c["birthday"]),
            "bio": bio, "look": html.escape(c["look"] or "—"),
        }
        hp = os.path.join(tmp, c["id"] + ".html")
        open(hp, "w", encoding="utf-8").write(page)
        png = os.path.join(tmp, c["id"] + ".png")
        cmd = [edge, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
               f"--window-size={W},{H}", f"--screenshot={png}", "--virtual-time-budget=2500",
               "--user-data-dir=" + os.path.join(tmp, "_profile"), "--allow-file-access-from-files", file_url(hp)]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
        if not os.path.exists(png) or os.path.getsize(png) < 5000:
            print("撮影失敗:", c["id"]); continue
        from PIL import Image
        Image.open(png).convert("RGB").save(os.path.join(OUT, c["id"] + ".jpg"), "JPEG", quality=80, optimize=True)
        os.remove(png); n += 1
        print("ok", c["num"], c["name"])
    print(f"sheets: {n}")


if __name__ == "__main__":
    main(sys.argv[1:])
