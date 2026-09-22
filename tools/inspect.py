# -*- coding: utf-8 -*-
"""
忍彩かくれんぼ 公開前の機械点検（読み取り専用・課金なし）
  python ninsai-kakurenbo/tools/inspect.py          # 点検して結果を表示（NGがあれば終了コード1）
  python ninsai-kakurenbo/tools/inspect.py --json   # JSONで出力（報告書用）
検査項目
  1. 39体のデータ（番号001〜039が重複なく揃う・和名/英名/クラン）
  2. 画像資産（正面スプライト・顔・肖像・資料シート が39体ぶん、手描き3体は4方向＋表情）
  3. index.html / sw.js が参照するファイルの実在
  4. 安全設計（課金・ガチャ・外部決済・個人情報入力・自由チャットの語が無い／外部リンクは ninja-dao.com だけ）
  5. PWA構成（manifest・sw の CACHE 版と index の ?v= が一致）
  6. JSの構文（node で読めるか）と Bot同士の試合（simtest）
"""
import os, re, sys, json, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OK, NG, WARN = "OK", "NG", "注意"
results = []


def add(name, status, detail=""):
    results.append({"項目": name, "判定": status, "詳細": detail})


def rd(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def check_chars():
    src = rd("chars.js")
    body = src[src.index("const CHARS_ALL = ") + len("const CHARS_ALL = "):]
    chars = json.loads(body[:body.index("];") + 1])
    nums = [c["num"] for c in chars]
    expect = [f"{i:03d}" for i in range(1, 40)]
    bad = [c["id"] for c in chars if not (c.get("name") and c.get("en") and c.get("clan"))]
    if len(chars) == 39 and nums == expect and not bad:
        add("39体のデータ", OK, "番号001〜039・和名/英名/クランが揃っている")
    else:
        add("39体のデータ", NG, f"体数={len(chars)} 番号順={nums == expect} 欠け={bad}")
    nobio = [c["name"] for c in chars if not c.get("bio")]
    add("紹介文なし（公式資料に無い）", WARN if nobio else OK, "・".join(nobio) + "（画面では『紹介文なし』と表示）" if nobio else "")
    return chars


def check_assets(chars):
    missing = []
    for c in chars:
        for p in (f"img/chars/{c['id']}_front.png", f"img/faces/{c['id']}.png", f"img/art/{c['id']}.jpg", f"img/sheets/{c['id']}.jpg"):
            if not os.path.exists(os.path.join(ROOT, p)):
                missing.append(p)
        if c.get("painted"):
            for v in ("quarter", "side", "back", "happy", "surprised"):
                p = f"img/chars/{c['id']}_{v}.png"
                if not os.path.exists(os.path.join(ROOT, p)):
                    missing.append(p)
    add("画像資産（正面・顔・肖像・資料シート×39、手描き3体の4方向）", NG if missing else OK, "不足: " + ", ".join(missing[:10]) if missing else "すべて実在")
    total = 0
    for d, _, fs in os.walk(os.path.join(ROOT, "img")):
        for f in fs:
            total += os.path.getsize(os.path.join(d, f))
    add("画像の合計容量", OK if total < 16 * 1024 * 1024 else WARN, f"{total / 1024 / 1024:.1f} MB（資料シートは初回キャッシュに含めない）")


def check_refs():
    html = rd("index.html")
    refs = re.findall(r'(?:src|href)="([^"#:]+?)(?:\?v=\d+)?"', html)
    missing = [r for r in refs if not r.startswith("http") and not os.path.exists(os.path.join(ROOT, r))]
    add("index.html の参照ファイル", NG if missing else OK, "不足: " + ", ".join(missing) if missing else f"{len(refs)}件すべて実在")
    sw = rd("sw.js")
    core = re.findall(r'"\./([^"?]+)(?:\?v=\d+)?"', sw)
    miss_sw = [c for c in core if c and not os.path.exists(os.path.join(ROOT, c))]
    add("sw.js の CORE 直書き分", NG if miss_sw else OK, "不足: " + ", ".join(miss_sw) if miss_sw else f"{len(core)}件すべて実在")
    ids = re.search(r'const ALL = \[(.*?)\];', sw)
    n_ids = len(re.findall(r'"([a-z]+)"', ids.group(1))) if ids else 0
    add("sw.js の39体リスト", OK if n_ids == 39 else NG, f"{n_ids}体")


def check_safety():
    files = ["index.html", "data.js", "game.js", "render.js", "sim.js", "chars.js"]
    text = "\n".join(rd(f) for f in files)
    forbidden = ["ガチャ", "課金", "決済", "購入する", "クレジットカード", "パスワード", "Stripe", "paypal", "adsbygoogle", "<input type=\"text\"", "<textarea", "contenteditable"]
    hits = []
    for w in forbidden:
        for m in re.finditer(re.escape(w), text):
            ctx = text[max(0, m.start() - 30): m.end() + 30].replace("\n", " ")
            # 否定文（課金なし・ガチャなし 等）は除外
            tail = text[m.end(): m.end() + 60].split("。")[0]
            if re.search(r"(なし|ありません|しない|禁止|しません|無し|売りません|使わない|一切)", tail):
                continue
            hits.append(f"{w}: …{ctx}…")
    add("課金・決済・個人情報入力・自由入力の語", NG if hits else OK, " / ".join(hits[:5]) if hits else "肯定文での出現なし（『課金なし』等の否定文のみ）")
    urls = set(re.findall(r'https?://[^\s"\'<>)]+', text))
    other = [u for u in urls if "ninja-dao.com" not in u and "workers.dev" not in u]
    add("外部リンク", NG if other else OK, "ninja-dao.com / workers.dev 以外: " + ", ".join(other) if other else f"ninja-dao.com と部屋サーバー（workers.dev）のみ（{len(urls)}件）")
    add("非公式表示", OK if "非公式ファンゲーム" in rd("index.html") else NG, "タイトル画面と利用表示に記載" if "非公式ファンゲーム" in rd("index.html") else "見当たらない")
    fetches = re.findall(r"\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon", "\n".join(rd(f) for f in ["game.js", "render.js", "sim.js", "data.js"]))
    add("外部通信コード", NG if fetches else OK, f"{len(fetches)}件" if fetches else "game/render/sim/data に fetch/XHR/WebSocket なし（通信は net.js＝合言葉の部屋サーバーだけ）")
    net = rd("net.js")
    urls_net = set(re.findall(r'https?://[^\s"\'<>)]+', net))
    add("net.js の接続先", NG if urls_net else OK, "URLの直書きなし（data.js の ONLINE.url と設定画面の値だけ）" if not urls_net else ", ".join(urls_net))


def check_pwa():
    m = json.load(open(os.path.join(ROOT, "manifest.webmanifest"), encoding="utf-8"))
    icons = [i["src"] for i in m.get("icons", [])]
    miss = [i for i in icons if not os.path.exists(os.path.join(ROOT, i))]
    add("manifest.webmanifest", NG if miss else OK, f"name={m.get('name')} display={m.get('display')} icons={len(icons)}" + (" 不足:" + ",".join(miss) if miss else ""))
    sw = rd("sw.js"); html = rd("index.html")
    vs_html = set(re.findall(r"\?v=(\d+)", html)); vs_sw = set(re.findall(r"\?v=(\d+)", sw))
    cache = re.search(r'const CACHE = "([^"]+)"', sw).group(1)
    ok = len(vs_html) == 1 and vs_html == vs_sw and cache.endswith("v" + list(vs_html)[0])
    add("SWキャッシュ版と ?v= の一致", OK if ok else NG, f"CACHE={cache} index?v={sorted(vs_html)} sw?v={sorted(vs_sw)}")


def check_js():
    js = "const fs=require('fs');for(const f of ['chars.js','data.js','sim.js','render.js','game.js']){new Function(fs.readFileSync(process.argv[1]+'/'+f,'utf8'));}console.log('ok')"
    r = subprocess.run(["node", "-e", js, ROOT], capture_output=True, text=True)
    add("JS構文（node）", OK if r.stdout.strip() == "ok" else NG, r.stderr.strip()[:200] if r.returncode else "5ファイル読み込み可")
    r = subprocess.run(["node", os.path.join(ROOT, "tools", "simtest.js"), "30", "normal"], capture_output=True, text=True, encoding="utf-8")
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    add("Bot同士30試合（ふつう）", OK if r.returncode == 0 else NG, " / ".join(lines[1:3]) if len(lines) > 2 else r.stdout[:200])


def main():
    chars = check_chars()
    check_assets(chars)
    check_refs()
    check_safety()
    check_pwa()
    check_js()
    ng = [r for r in results if r["判定"] == NG]
    if "--json" in sys.argv:
        print(json.dumps({"results": results, "ng": len(ng)}, ensure_ascii=False, indent=1))
    else:
        for r in results:
            print(f"[{r['判定']}] {r['項目']}: {r['詳細']}")
        print(f"\nNG {len(ng)}件 / 注意 {len([r for r in results if r['判定'] == WARN])}件 / OK {len([r for r in results if r['判定'] == OK])}件")
    sys.exit(1 if ng else 0)


if __name__ == "__main__":
    main()
