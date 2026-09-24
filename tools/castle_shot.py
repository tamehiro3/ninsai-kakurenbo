# -*- coding: utf-8 -*-
"""城ダンジョンの見た目を Edge ヘッドレスで撮る（検証用・課金なし）。
  python ninsai-kakurenbo/tools/castle_shot.py --seed view1 --dif normal --type bamboo --view 0 --sec 20 --out shot.png
tools/castle_view.html が城を生成して Bot 同士で sec 秒すすめ、視点の選手の画面・ミニマップ・作戦画面の地図を描く。"""
import argparse, os, subprocess, urllib.parse, pathlib, time
ROOT = pathlib.Path(__file__).resolve().parent


def edge():
    for p in [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]:
        if os.path.exists(p):
            return p
    raise SystemExit("msedge.exe が見つかりません")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default="view")
    ap.add_argument("--dif", default="normal")
    ap.add_argument("--type", default="")
    ap.add_argument("--view", default="0")
    ap.add_argument("--sec", default="20")
    ap.add_argument("--until", default="")
    ap.add_argument("--zoom", default="1")
    ap.add_argument("--at", default="", help="fog|mech|push|lock|key|emblem|stair|trap|shrine のそばへ視点を移す")
    ap.add_argument("--out", default="castle_shot.png")
    a = ap.parse_args()
    q = {"seed": a.seed, "dif": a.dif, "view": a.view, "sec": a.sec, "zoom": a.zoom}
    if a.type: q["type"] = a.type
    if a.until: q["until"] = a.until
    if a.at: q["at"] = a.at
    url = (ROOT / "castle_view.html").as_uri() + "?" + urllib.parse.urlencode(q)
    out = os.path.abspath(a.out)
    prof = os.path.join(os.path.dirname(out), "_edge_profile_%d" % os.getpid())      # 毎回まっさらなプロファイル（古い render.js をキャッシュから読まない）
    if os.path.exists(out): os.remove(out)
    subprocess.run([edge(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--disable-extensions", "--user-data-dir=" + prof, "--allow-file-access-from-files",
                    "--window-size=1368,720", "--virtual-time-budget=20000", f"--screenshot={out}", url], check=False, timeout=120,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Edge の起動役はすぐ戻り、撮影は裏で続く＝ファイルができるまで待つ
    for _ in range(120):
        if os.path.exists(out) and os.path.getsize(out) > 0:
            time.sleep(0.5); break
        time.sleep(0.5)
    print(out if os.path.exists(out) else "撮れませんでした")


if __name__ == "__main__":
    main()
