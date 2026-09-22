# -*- coding: utf-8 -*-
"""
「竹影の城」のマップを左半分だけ定義して左右対称に鏡像化し、検証してから ASCII を出力する。
  python ninsai-kakurenbo/tools/build_map.py        → 検証＋ASCIIを表示
  python ninsai-kakurenbo/tools/build_map.py --write → data.js の MAP_ROWS を書き換える
記号: # 城壁  t 竹  r 岩  . 地面  b 竹の擬態  s 石の擬態  w 木の擬態  ~ 砂（擬態不可）  B/O 陣地（敵進入不可）
"""
import sys, os, re
from collections import deque

W, H = 64, 48
HALF = 32
g = [["#"] * HALF for _ in range(H)]


def rect(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < HALF and 0 <= y < H:
                g[y][x] = ch


# --- 西の前庭（縦の広間） cols 9..13 rows 6..42
rect(9, 6, 13, 42, ".")
# 広間の曲がり角（射線を切る）
rect(12, 16, 13, 17, "#")
rect(9, 31, 10, 32, "#")

# --- 北：竹回廊 rows 6..10, cols 9..31（右半分へ続く）
rect(9, 6, 31, 10, ".")
rect(14, 6, 31, 7, "b")           # 北壁ぞいの竹の擬態帯
rect(14, 5, 31, 5, "t")           # 北壁は竹
rect(18, 9, 19, 10, "t")          # 南側からの竹の張り出し（短い曲がり角）
rect(26, 6, 27, 7, "t")           # 北側からの張り出し
rect(17, 8, 20, 8, "b")           # 張り出しの脇に擬態
rect(9, 11, 31, 11, "#")          # 回廊の南壁
rect(9, 11, 13, 11, ".")          # 広間との接続
# 北の連絡路 rows 12..14 cols 29..31（鏡像で29..34）
rect(29, 11, 31, 14, ".")
rect(29, 12, 29, 14, "b")         # 連絡路の西壁ぞいの擬態（先行役の待機所）
rect(28, 11, 28, 14, "#")

# --- 南：石庭 rows 37..42, cols 9..31
rect(9, 37, 31, 42, ".")
rect(14, 41, 31, 42, "s")         # 南壁ぞいの石の擬態帯
rect(9, 36, 31, 36, "#")          # 石庭の北壁
rect(9, 36, 13, 36, ".")          # 広間との接続
rect(16, 39, 17, 40, "r")         # 岩
rect(22, 39, 23, 40, "r")
rect(26, 39, 26, 40, "r")
rect(15, 38, 18, 38, "s")         # 岩のまわりの石の擬態
rect(19, 39, 20, 40, "s")
# 南の連絡路 rows 34..36 cols 29..31
rect(29, 34, 31, 36, ".")
rect(29, 34, 29, 36, "s")         # 連絡路の擬態
rect(28, 34, 28, 36, "#")

# --- 中央：中央門への道 rows 22..25, cols 14..21
rect(14, 22, 21, 25, ".")
rect(14, 21, 21, 21, "#")
rect(14, 26, 21, 26, "#")
rect(17, 22, 18, 23, "#")         # 枡形の板塀（道の上半分をふさぐ）
rect(15, 22, 16, 23, "w")         # 板塀の手前の木の擬態（中央の唯一の隠れ場所）

# --- 城 cols 22..31 rows 15..33
rect(22, 15, 31, 33, "#")
rect(23, 16, 31, 32, ".")
rect(22, 22, 22, 25, ".")         # 西門
rect(30, 15, 31, 15, ".")         # 北門（鏡像で30..33）
rect(30, 33, 31, 33, ".")         # 南門
rect(26, 21, 26, 26, "#")         # 西門の目隠し塀
rect(29, 19, 31, 19, "#")         # 北門の目隠し塀（鏡像で29..34）
rect(29, 29, 31, 29, "#")         # 南門の目隠し塀
rect(23, 17, 23, 19, "w")         # 城内の板敷き（擬態）
rect(23, 29, 23, 31, "w")
rect(25, 16, 27, 16, "w")
rect(25, 32, 27, 32, "w")

# --- 青の陣地 cols 1..7 rows 17..31（出口2つ＝col8 rows19..21 / 27..29）
rect(1, 17, 7, 31, "B")
rect(8, 19, 8, 21, "B")
rect(8, 27, 8, 29, "B")

# --- 鏡像化
rows = []
for y in range(H):
    left = "".join(g[y])
    right = left[::-1].replace("B", "O")
    rows.append(left + right)

# 砂地：旗(32,24)から半径3m以内の床
FLAG = (32.0, 24.0)
for y in range(H):
    for x in range(W):
        if rows[y][x] in ".w" and ((x + .5 - FLAG[0]) ** 2 + (y + .5 - FLAG[1]) ** 2) ** .5 <= 3.0:
            rows[y] = rows[y][:x] + "~" + rows[y][x + 1:]

SOLID = set("#tr")


def walkable(x, y, team=None):
    c = rows[y][x]
    if c in SOLID:
        return False
    if team == 0 and c == "O":
        return False
    if team == 1 and c == "B":
        return False
    return True


def bfs(start_cells, team=None):
    dist = [[-1] * W for _ in range(H)]
    q = deque()
    for (x, y) in start_cells:
        dist[y][x] = 0
        q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and dist[ny][nx] < 0 and walkable(nx, ny, team):
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    return dist


def check():
    ok = True
    # 対称性
    for y in range(H):
        l, r = rows[y][:HALF], rows[y][HALF:][::-1].replace("O", "B")
        if l != r:
            print("非対称 row", y); ok = False
    # 通路幅：床セルは必ず2x2の空きブロックに含まれる（幅2m以上）
    bad = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not walkable(x, y):
                continue
            found = False
            for ox in (0, -1):
                for oy in (0, -1):
                    cells = [(x + ox + i, y + oy + j) for i in (0, 1) for j in (0, 1)]
                    if all(0 <= cx < W and 0 <= cy < H and walkable(cx, cy) for cx, cy in cells):
                        found = True
            if not found:
                bad.append((x, y))
    if bad:
        print("幅1mの通路:", bad[:20]); ok = False
    # 到達性：青陣地から旗まで、敵陣地には入れない
    blue = [(x, y) for y in range(H) for x in range(W) if rows[y][x] == "B"]
    d0 = bfs(blue, team=0)
    fx, fy = int(FLAG[0]), int(FLAG[1])
    if d0[fy][fx] < 0:
        print("旗に到達できない"); ok = False
    unreachable = [(x, y) for y in range(H) for x in range(W) if walkable(x, y, 0) and d0[y][x] < 0]
    if unreachable:
        print("到達できない床:", unreachable[:20]); ok = False
    # 3ルートの経路長（青のスポーン中心→中間点→旗）
    routes = {"中央門": [(15, 24), (24, 24)], "北・竹回廊": [(11, 8), (31, 8), (31, 13)], "南・石庭": [(11, 39), (31, 39), (31, 35)]}
    for name, wps in routes.items():
        pts = [(4, 24)] + wps + [(fx, fy)]
        total = 0
        for a, b in zip(pts, pts[1:]):
            d = bfs([a], team=0)
            if d[b[1]][b[0]] < 0:
                print(name, "途中で切断", a, b); ok = False; break
            total += d[b[1]][b[0]]
        print(f"{name}: 約{total}m（走行{total / 4.5:.0f}秒）")
    zones = {c: sum(r.count(c) for r in rows) for c in "bsw~"}
    print("擬態セル数:", zones)
    return ok


ok = check()
print()
print("\n".join(rows))
if not ok:
    sys.exit(1)

if "--write" in sys.argv:
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data.js")
    src = open(path, encoding="utf-8").read()
    body = "const MAP_ROWS = [\n" + "\n".join(f'  "{r}",' for r in rows) + "\n];"
    new, n = re.subn(r"const MAP_ROWS = \[\n(?:.*\n)*?\];", body, src, count=1)
    if n != 1:
        print("data.js の MAP_ROWS が見つかりません"); sys.exit(1)
    open(path, "w", encoding="utf-8").write(new)
    print("data.js を更新しました")
