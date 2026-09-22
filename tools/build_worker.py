# -*- coding: utf-8 -*-
"""ゲーム本体の chars.js + data.js + sim.js を1本にまとめて、部屋サーバー（worker/src/sim_bundle.js）へ置く。
  python ninsai-kakurenbo/tools/build_worker.py
判定ロジックは常にゲーム側の sim.js が正本。サーバーを公開する前に必ずこれを実行する。"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
parts = []
for f in ("chars.js", "data.js", "sim.js"):
    parts.append(f"// ===== {f}（自動コピー・編集しない） =====\n" + open(os.path.join(ROOT, f), encoding="utf-8").read())
out = "\n".join(parts)
# ブラウザ/node 兼用の保険コード（require / module.exports）は ESM バンドルでは邪魔になるので無害化する
out = out.replace('require("./chars.js")', "null").replace('require("./data.js")', "null")
for line in ('if (typeof module !== "undefined") module.exports = CHARS_ALL;',
             'if (typeof module !== "undefined") module.exports = DATA;',
             'if (typeof module !== "undefined") module.exports = Sim;'):
    out = out.replace(line, "")
out += "\nexport { Sim, DATA, CHARS_ALL };\n"
dst = os.path.join(ROOT, "worker", "src", "sim_bundle.js")
os.makedirs(os.path.dirname(dst), exist_ok=True)
open(dst, "w", encoding="utf-8").write(out)
print("worker/src/sim_bundle.js:", len(out), "bytes")
