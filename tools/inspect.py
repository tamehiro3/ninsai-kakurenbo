# -*- coding: utf-8 -*-
"""
忍彩かくれんぼ 公開前の機械点検（読み取り専用・課金なし）
  python ninsai-kakurenbo/tools/inspect.py          # 点検して結果を表示（NGがあれば終了コード1）
  python ninsai-kakurenbo/tools/inspect.py --json   # JSONで出力（報告書用）
検査項目
  1. 39体のデータ（番号001〜039が重複なく揃う・和名/英名/クラン）
  2. 画像資産（正面スプライト・顔・肖像・資料シート が39体ぶん、手描き3体は4方向＋表情）
  3. index.html / sw.js が参照するファイルの実在（balance.js は chars.js の後・data.js の前に読む／sw.js の CORE にもある）
  4. 安全設計（課金・ガチャ・外部決済・個人情報入力・自由チャットの語が無い／外部リンクは ninja-dao.com だけ）
  5. PWA構成（manifest・sw の CACHE 版と index の ?v= が一致・MIN_VER 以上）
  6. JSの構文（node で読めるか）と Bot同士の試合（simtest）＋ HP・レベル設計図の合格基準（Bot同士は参考値＝注意どまり）
  7. 39体の性能（balance.js：39体・能力値6軸の合計21・固有技39種で重複なし・系統は 影/技/護/選択・
     sim.js に全技の処理がある・data.js の CHARS に併合ずみ・HP/成長の正本が揃う）
  8. 部屋サーバー（worker/src の構文・sim_bundle.js が ESM として読める・最新の同梱か）
  9. 城ダンジョン（castle.js：設計図の受け入れ条件10項目・再現性・左右対称・城型の巡回＝tools/castletest.js／
     公開物に検証用ページや設計図が混ざらない）
"""
import os, re, sys, json, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OK, NG, WARN = "OK", "NG", "注意"
MIN_VER = 6            # 2026-09-25：castle.js（城ダンジョン）を足したときに v6 へ。これ未満なら古いキャッシュが残る
STAT_KEYS = ["spd", "camo", "atk", "def", "scout", "esc"]
TREES = ["影", "技", "護"]
results = []


def add(name, status, detail=""):
    results.append({"項目": name, "判定": status, "詳細": detail})


def rd(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


def node(args, **kw):
    return subprocess.run(["node"] + args, capture_output=True, text=True, encoding="utf-8", cwd=ROOT, **kw)


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
    # balance.js は data.js が読み込み時に参照する（BALANCE）ので chars.js の後・data.js の前に読む
    scripts = re.findall(r'<script src="([^"?]+)(?:\?v=\d+)?"', html)
    need = ("chars.js", "balance.js", "castle.js", "data.js", "sim.js", "render.js")
    order_ok = all(s in scripts for s in need) and [scripts.index(s) for s in need] == sorted(scripts.index(s) for s in need)
    add("index.html の読み込み順（chars → balance → castle → data → sim → render）", OK if order_ok else NG, " → ".join(scripts) if scripts else "script タグなし")
    sw = rd("sw.js")
    core = re.findall(r'"\./([^"?]+)(?:\?v=\d+)?"', sw)
    miss_sw = [c for c in core if c and not os.path.exists(os.path.join(ROOT, c))]
    add("sw.js の CORE 直書き分", NG if miss_sw else OK, "不足: " + ", ".join(miss_sw) if miss_sw else f"{len(core)}件すべて実在")
    core_need = [f for f in ("chars.js", "balance.js", "castle.js", "data.js", "sim.js", "render.js", "net.js", "game.js", "style.css", "index.html") if f not in core]
    add("sw.js の CORE に主要ファイル（balance.js・castle.js 含む）", NG if core_need else OK, "CORE に無い: " + ", ".join(core_need) if core_need else "chars/balance/castle/data/sim/render/net/game/style/index が揃っている")
    ids = re.search(r'const ALL = \[(.*?)\];', sw)
    n_ids = len(re.findall(r'"([a-z]+)"', ids.group(1))) if ids else 0
    add("sw.js の39体リスト", OK if n_ids == 39 else NG, f"{n_ids}体")


def check_safety():
    files = ["index.html", "data.js", "balance.js", "castle.js", "game.js", "render.js", "sim.js", "chars.js"]
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
    fetches = re.findall(r"\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon", "\n".join(rd(f) for f in ["game.js", "render.js", "sim.js", "data.js", "balance.js", "castle.js"]))
    add("外部通信コード", NG if fetches else OK, f"{len(fetches)}件" if fetches else "game/render/sim/data/balance に fetch/XHR/WebSocket なし（通信は net.js＝合言葉の部屋サーバーだけ）")
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
    v = int(list(vs_html)[0]) if len(vs_html) == 1 else 0
    same = len(vs_html) == 1 and vs_html == vs_sw and cache.endswith("v" + str(v))
    ok = same and v >= MIN_VER
    why = "" if ok else ("（index/sw/CACHE の版がそろっていない）" if not same else f"（v{MIN_VER} 以上に上げる：castle.js 追加ぶんの古いキャッシュが残る）")
    add("SWキャッシュ版と ?v= の一致", OK if ok else NG, f"CACHE={cache} index?v={sorted(vs_html)} sw?v={sorted(vs_sw)} 必要={MIN_VER}以上{why}")


# 合格基準（docs/hp-level-blueprint.txt「初回テストの合格線」）。Bot同士の試合は参考値なので範囲外は「注意」どまり
CRITERIA = [
    (r"HP0（1人あたり/試合） ([\d.]+)", 1, 3, "HP0/人/試合"),
    (r"露見→復帰の平均 ([\d.]+)秒", 6, 9, "露見→復帰(秒)"),
    (r"レベル差1以内の時間 ([\d.]+)%", 80, 100, "レベル差1以内(%)"),
    (r"Lv5到達（いずれかのチーム） ([\d.]+)%", 30, 50, "Lv5到達(%)"),
    (r"ダメージ由来XP ([\d.]+)%", 0, 35, "ダメージ由来XP(%)"),
]


def check_js():
    files = ["chars.js", "balance.js", "castle.js", "data.js", "sim.js", "render.js", "game.js"]
    js = "const fs=require('fs');for(const f of process.argv.slice(2)){new Function(fs.readFileSync(process.argv[1]+'/'+f,'utf8'));}console.log('ok')"
    r = node(["-e", js, ROOT] + files)
    add("JS構文（node）", OK if r.stdout.strip() == "ok" else NG, r.stderr.strip()[:200] if r.returncode else f"{len(files)}ファイル読み込み可（{'・'.join(files)}）")
    r = node([os.path.join(ROOT, "tools", "simtest.js"), "30", "normal"])
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    add("Bot同士30試合（ふつう）", OK if r.returncode == 0 else NG, " / ".join(lines[1:3]) if len(lines) > 2 else (r.stdout + r.stderr)[:200])
    if r.returncode == 0:
        out, bad = [], []
        for pat, lo, hi, label in CRITERIA:
            m = re.search(pat, r.stdout)
            if not m:
                bad.append(label + " 行なし"); continue
            val = float(m.group(1))
            inside = lo <= val <= hi
            out.append(f"{label} {m.group(1)}{'' if inside else f'（目安 {lo}〜{hi} の外）'}")
            if not inside: bad.append(label)
        add("HP・レベル設計図の合格基準（Bot同士＝参考値）", WARN if bad else OK,
            " / ".join(out) + "｜合格の本判定は人間のプレイテスト（設計図「初回テストの合格線」）。数値は node tools/simtest.js 40 normal で再現")


def check_balance():
    js = r"""
const B=require(process.argv[1]+'/balance.js'), D=require(process.argv[1]+'/data.js'), C=require(process.argv[1]+'/chars.js');
const pick=c=>({id:c.id,num:c.num,role:c.role,title:c.title,stats:c.stats,tree:c.tree,kind:c.skill&&c.skill.kind,name:c.skill&&c.skill.name,cd:c.skill&&c.skill.cd,
  effect:!!(c.skill&&c.skill.effect),counter:!!(c.skill&&c.skill.counter),winPlan:!!c.winPlan,escapePlan:!!c.escapePlan});
const need=["stats","skill","tree","title","roleLabel","winPlan","escapePlan"];
process.stdout.write(JSON.stringify({bal:(B.chars||[]).map(pick),hp:B.hp||null,trees:Object.fromEntries(Object.entries(B.trees||{}).map(([k,v])=>[k,Object.keys(v)])),
  treeNames:Object.keys(B.treeNames||{}),xpActions:(B.xpActions||[]).length,passCriteria:(B.passCriteria||[]).length,charIds:C.map(c=>c.id),
  merged:D.CHARS.map(c=>({id:c.id,missing:need.filter(k=>c[k]==null)})),ruleHp:D.RULES.hp===B.hp,statNames:(D.STAT_NAMES||[]).map(x=>x[0]),
  dTrees:Object.keys(D.TREES||{})}));
"""
    r = node(["-e", js, ROOT])
    if r.returncode or not r.stdout.strip():
        add("39体の性能（balance.js）", NG, "balance.js / data.js を node で読めない: " + r.stderr.strip()[:200]); return
    d = json.loads(r.stdout)
    bal = d["bal"]
    prob = []
    if len(bal) != 39: prob.append(f"体数={len(bal)}")
    if [b["id"] for b in bal] != d["charIds"]: prob.append("id の並びが chars.js と違う")
    if [b["num"] for b in bal] != [f"{i:03d}" for i in range(1, 40)]: prob.append("番号が001〜039でない")
    for b in bal:
        st = b["stats"] or {}
        if sorted(st.keys()) != sorted(STAT_KEYS): prob.append(f"{b['id']}:能力値の軸が6つでない"); continue
        vals = [st[k] for k in STAT_KEYS]
        if any(not isinstance(v, int) or v < 1 or v > 5 for v in vals): prob.append(f"{b['id']}:能力値が1〜5の外 {vals}")
        if sum(vals) != 21: prob.append(f"{b['id']}:能力値合計={sum(vals)}")
        if b["tree"] not in TREES + ["選択"]: prob.append(f"{b['id']}:系統={b['tree']}")
        if not (b["kind"] and b["name"] and isinstance(b["cd"], (int, float)) and b["cd"] > 0): prob.append(f"{b['id']}:固有技の kind/name/cd が欠ける")
        if not (b["effect"] and b["counter"] and b["winPlan"] and b["escapePlan"] and b["role"] and b["title"]): prob.append(f"{b['id']}:効果/対処/勝ち筋/逃げ方/役割/肩書きが欠ける")
    kinds = [b["kind"] for b in bal]
    dup = sorted({k for k in kinds if kinds.count(k) > 1})
    if dup: prob.append("固有技 kind の重複: " + ", ".join(dup))
    if len(set(kinds)) != 39: prob.append(f"固有技の種類={len(set(kinds))}")
    trees_used = {b["tree"] for b in bal}
    add("39体の性能（balance.js）", NG if prob else OK,
        "; ".join(prob[:8]) if prob else f"39体・能力値6軸の合計21・固有技{len(set(kinds))}種で重複なし・系統={'/'.join(sorted(trees_used))}")
    # sim.js に全技の処理（case "kind"）があるか
    sim = rd("sim.js")
    nocase = [k for k in kinds if k and f'case "{k}"' not in sim]
    add("固有技の処理（sim.js に case がある）", NG if nocase else OK, "sim.js に無い: " + ", ".join(nocase) if nocase else f"{len(set(kinds))}種すべて sim.js の useSkill にある")
    # data.js への併合
    miss = [f"{m['id']}({','.join(m['missing'])})" for m in d["merged"] if m["missing"]]
    ok_names = d["statNames"] == STAT_KEYS
    add("data.js への併合（CHARS に stats/skill/tree/title/roleLabel/winPlan/escapePlan）", NG if (miss or not ok_names or not d["ruleHp"]) else OK,
        ("欠け: " + ", ".join(miss[:6]) if miss else "") + ("" if ok_names else f" STAT_NAMES={d['statNames']}") + ("" if d["ruleHp"] else " RULES.hp が BALANCE.hp と別物")
        if (miss or not ok_names or not d["ruleHp"]) else "39体すべて併合ずみ・STAT_NAMES 6軸・RULES.hp＝BALANCE.hp")
    # HP・成長の正本
    hp = d["hp"] or {}
    p2 = []
    bl, xt = hp.get("byLevel") or [], hp.get("xpThresholds") or []
    if len(bl) != 5 or bl != sorted(bl): p2.append(f"byLevel={bl}")
    if len(xt) != 5 or xt != sorted(xt) or xt[:1] != [0]: p2.append(f"xpThresholds={xt}")
    for k in ("exposeSec", "exposeMove", "healSec", "healHp", "healSecFast", "healHpFast", "healRange", "invulnSec", "revealSec", "minCamoHp", "pickSec", "baseDamage"):
        if not isinstance(hp.get(k), (int, float)): p2.append(f"hp.{k} なし")
    for k in ("reveal", "hit", "hp0", "heal", "cross", "hold", "holdEvery"):
        if not isinstance((hp.get("xp") or {}).get(k), (int, float)): p2.append(f"hp.xp.{k} なし")
    for t in TREES:
        if d["trees"].get(t) != ["2", "3", "4", "5"]: p2.append(f"trees.{t}={d['trees'].get(t)}")
    if sorted(d["treeNames"]) != sorted(TREES): p2.append(f"treeNames={d['treeNames']}")
    if sorted(d["dTrees"]) != sorted(TREES): p2.append(f"D.TREES={d['dTrees']}")
    if d["xpActions"] != 6: p2.append(f"xpActions={d['xpActions']}件")
    if d["passCriteria"] != 6: p2.append(f"passCriteria={d['passCriteria']}件")
    add("HP・成長の正本（BALANCE.hp / trees / xpActions / passCriteria）", NG if p2 else OK,
        "; ".join(p2[:8]) if p2 else f"HP {bl[0]}→{bl[-1]}・XP閾値 {xt}・系統3つ×Lv2〜5・経験値行動6・合格基準6")


def check_worker():
    bad = []
    for f in ("worker/src/index.js", "worker/src/room.js"):
        r = node(["--check", os.path.join(ROOT, f)])
        if r.returncode: bad.append(f + ": " + r.stderr.strip().splitlines()[-1][:120] if r.stderr.strip() else f)
    add("部屋サーバーの構文（worker/src）", NG if bad else OK, " / ".join(bad) if bad else "index.js・room.js を node --check で読める")
    dst = os.path.join(ROOT, "worker", "src", "sim_bundle.js")
    if not os.path.exists(dst):
        add("sim_bundle.js（同梱物）", NG, "無い：python tools/build_worker.py で作る"); return
    js = "import * as m from './worker/src/sim_bundle.js'; const need=['Sim','DATA','CHARS_ALL','BALANCE','Castle']; const miss=need.filter(k=>!m[k]); console.log(miss.length?'missing:'+miss.join(','):'ok '+m.DATA.CHARS.length+' '+(m.DATA.CHARS.every(c=>c.stats&&c.skill)?'merged':'unmerged'));"
    r = node(["--input-type=module", "-e", js])
    okb = r.stdout.strip().startswith("ok ") and r.stdout.strip().endswith("merged")
    add("sim_bundle.js を ESM として読める", OK if okb else NG, r.stdout.strip() if okb else (r.stdout.strip() + " " + r.stderr.strip().splitlines()[-1] if r.stderr.strip() else r.stdout.strip())[:200])
    try:
        import build_worker
        fresh = build_worker.build() == open(dst, encoding="utf-8").read()
        add("sim_bundle.js が最新の同梱か", OK if fresh else WARN, "chars/balance/data/castle/sim と一致" if fresh else "古い：python tools/build_worker.py を実行（★オンライン部屋サーバーを公開する.bat は自動で同梱し直す）")
    except Exception as e:
        add("sim_bundle.js が最新の同梱か", WARN, f"確認できない: {e}")


def check_castle():
    r = node([os.path.join(ROOT, "tools", "castletest.js"), "30"])
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    last = lines[-1] if lines else (r.stderr.strip()[:200] or "出力なし")
    add("城ダンジョンの生成（設計図の受け入れ条件10項目・再現性・左右対称・城型の巡回）", OK if r.returncode == 0 else NG,
        last + ("｜" + " / ".join(l for l in lines if l.startswith(("やさしい", "ふつう", "てごわい"))) if r.returncode == 0 else "｜" + " / ".join(l for l in lines if l.startswith("NG"))[:300]))
    # 公開物に検証用ページ・ユーザー提供の設計図が混ざらない（.gitignore で除外されているか）
    gi = rd(".gitignore")
    leak = [f for f in ("docs/castle-dungeon-blueprint.txt", "docs/character-balance-blueprint.txt", "docs/hp-level-blueprint.txt") if f not in gi]
    add("設計図を公開しない（.gitignore）", NG if leak else OK, "除外されていない: " + ", ".join(leak) if leak else "城・39体・HPの設計図3枚を除外ずみ")
    # 検証用ページは端末の保存を消さない（公開されても遊ぶ人の記録を壊さない）
    bad = [f for f in ("tools/castle_view.html", "tools/game_drive.html") if os.path.exists(os.path.join(ROOT, f)) and ("removeItem" in rd(f) or "localStorage.clear" in rd(f))]
    add("検証用ページが保存を消さない", NG if bad else OK, ", ".join(bad) if bad else "castle_view / game_drive は localStorage を消さない")


def main():
    chars = check_chars()
    check_assets(chars)
    check_refs()
    check_safety()
    check_pwa()
    check_js()
    check_balance()
    check_worker()
    check_castle()
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
