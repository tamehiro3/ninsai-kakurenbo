# -*- coding: utf-8 -*-
"""ゲーム本体の chars.js + balance.js + data.js + sim.js を1本にまとめて、部屋サーバー（worker/src/sim_bundle.js）へ置く。
  python ninsai-kakurenbo/tools/build_worker.py
判定ロジックは常にゲーム側の sim.js が正本。サーバーを公開する前に必ずこれを実行する。
同梱順は読み込み依存の順（chars → balance → data → sim）。data.js は読み込み時に CHARS_ALL と BALANCE を参照する。
tools/inspect.py は build() を呼んで、置いてある sim_bundle.js が最新かを確かめる。"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = ("chars.js", "balance.js", "data.js", "sim.js")
DST = os.path.join(ROOT, "worker", "src", "sim_bundle.js")
# ブラウザ/node 兼用の保険コード（require / module.exports）は ESM バンドルでは邪魔になるので無害化する
EXPORT_LINES = ('if (typeof module !== "undefined") module.exports = CHARS_ALL;',
                'if (typeof module !== "undefined") module.exports = BALANCE;',
                'if (typeof module !== "undefined") module.exports = DATA;',
                'if (typeof module !== "undefined") module.exports = Sim;')


def build():
    """同梱した文字列を返す。無害化できない require/module.exports が残っていれば RuntimeError"""
    parts = []
    for f in ORDER:
        p = os.path.join(ROOT, f)
        if not os.path.exists(p):
            raise RuntimeError("見つからない: " + p)
        parts.append(f"// ===== {f}（自動コピー・編集しない） =====\n" + open(p, encoding="utf-8").read())
    out = "\n".join(parts)
    for f in ORDER:
        out = out.replace(f'require("./{f}")', "null")
    for line in EXPORT_LINES:
        out = out.replace(line, "")
    left = [l.strip()[:120] for l in out.splitlines() if "require(" in l or "module.exports" in l]
    if left:
        raise RuntimeError("無害化できなかった行があります: " + " / ".join(left))
    return out + "\nexport { Sim, DATA, CHARS_ALL, BALANCE };\n"


def main():
    try:
        out = build()
    except RuntimeError as e:
        print(e); sys.exit(1)
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    open(DST, "w", encoding="utf-8").write(out)
    print("worker/src/sim_bundle.js:", len(out), "bytes (" + " -> ".join(ORDER) + ")")


if __name__ == "__main__":
    main()
