# -*- coding: utf-8 -*-
"""sim.js を城ダンジョン（castle.js が作る多層の城）で遊べるようにする（1回だけ実行）。
設計図：docs/castle-dungeon-blueprint.txt。練習（チュートリアル）は従来の「竹影の城」1枚のまま。"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "sim.js")
s = open(p, encoding="utf-8").read()
if "function bindMap(" in s:
    print("already patched"); raise SystemExit(0)

def rep(old, new, cnt=1):
    global s
    n = s.count(old)
    assert n == cnt, (n, "NOT FOUND/AMBIGUOUS: " + old[:120])
    s = s.replace(old, new)

# ===== 1. 地図を試合ごとに持つ（固定マップ＝練習用／城＝castle.js） =====
rep('''  const D = (typeof DATA !== "undefined") ? DATA : require("./data.js");
  const R = D.RULES;
  const W = D.MAP.w, H = D.MAP.h;
  const TICK = 1 / 30;
  const FLAG = D.MAP.flag;
  const SOLID = { "#": 1, "t": 1, "r": 1 };
  const grid = D.MAP_ROWS.map(r => r.split(""));''',
'''  const D = (typeof DATA !== "undefined") ? DATA : require("./data.js");
  const CastleLib = (typeof Castle !== "undefined") ? Castle : (typeof require === "function" ? require("./castle.js") : null);
  const R = D.RULES;
  const TICK = 1 / 30;
  // 移動を止めるマス（窓 x・鍵の扉 L・閉じた仕掛け扉 M を含む）／視線を止めるマス（窓は見通せる）
  const SOLID = { "#": 1, "t": 1, "r": 1, "x": 1, "L": 1, "M": 1 };
  const LOSBLOCK = { "#": 1, "t": 1, "r": 1, "L": 1, "M": 1 };
  // 練習用の固定マップ（竹影の城・1階だけ）
  const LEGACY = {
    kind: "legacy", W: D.MAP.w, H: D.MAP.h, rows: D.MAP_ROWS.map(r => r.split("")), flag: D.MAP.flag,
    spawn: [0, 1].map(t => D.MAP.spawn.map(sp => ({ x: t ? D.MAP.w - sp.x : sp.x, y: sp.y }))),
    floorOf: null, portalAt: null, fieldCache: new Map(), version: 0, items: [], locks: [], mechs: [], pushes: [], fogObjs: [],
  };
  let curMap = LEGACY, W = LEGACY.W, H = LEGACY.H, FLAG = LEGACY.flag, grid = LEGACY.rows, floorOf = null, portalAt = null;
  // 城（castle.js）→ 試合で使う地図
  function castleMap(spec) {
    const c = CastleLib.generate(spec);
    const m = Object.assign({ kind: "castle", fieldCache: new Map(), version: 0 }, c);
    m.floorOf = new Uint8Array(c.W * c.H).fill(255);
    c.floors.forEach((fl, i) => { for (let y = fl.oy; y < fl.oy + fl.h; y++) for (let x = fl.ox; x < fl.ox + fl.w; x++) m.floorOf[y * c.W + x] = i; });
    m.portalAt = new Map(c.portals.map(pt => [pt.cy * c.W + pt.cx, pt]));
    // 階段の対（上り口⇔降り口）：着いた直後に相方の口を踏んでも戻らない
    for (const pt of c.portals) {
      if (pt.oneWay) continue;
      const a = c.floors.find(f => f.id === pt.floor), b = c.floors.find(f => f.id === pt.toFloor);
      const partner = c.portals.find(q => q.floor === pt.toFloor && q.toFloor === pt.floor && q.cx - b.ox === pt.cx - a.ox && q.cy - b.oy === pt.cy - a.oy);
      pt.partner = partner ? partner.cy * c.W + partner.cx : -1;
    }
    m.trapAt = new Map(c.traps.map(t => [t.cy * c.W + t.cx, t]));
    m.fogObjs = c.fogs.map((f, i) => ({ id: -1 - i, kind: "zone_fog", team: -1, x: f.x, y: f.y, r: f.r, life: 1e9, static: true }));
    m.locks.forEach(l => { l.open = false; });
    m.mechs.forEach(me => { me.open = true; });
    m.items.forEach(it => { it.taken = false; });
    m.pushes.forEach((pw, i) => { pw.next = 5 + i * 1.7; pw.warned = false; });
    m.period = c.castle.type === "water" ? 14 : 10;
    return m;
  }
  function bindMap(g) {
    const m = (g && g.map) || LEGACY;
    if (m === curMap) return;
    curMap = m; W = m.W; H = m.H; FLAG = m.flag; grid = m.rows; floorOf = m.floorOf || null; portalAt = m.portalAt || null;
  }
  // 地図が変わった（鍵の扉が開いた・仕掛け扉が動いた）ら経路の計算をやり直す
  function mapChanged(m) { m.version++; m.fieldCache.clear(); }
  function floorAt(x, y) { if (!floorOf) return 0; const cx = x | 0, cy = y | 0; if (cx < 0 || cy < 0 || cx >= W || cy >= H) return 255; return floorOf[cy * W + cx]; }''')
rep('''  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);''',
    '''  // 別の階どうしは「とても遠い」（範囲技・音・視界が階をまたがない）
  const dist = (a, b) => { if (floorOf) { const fa = floorAt(a.x, a.y), fb = floorAt(b.x, b.y); if (fa !== fb && fa !== 255 && fb !== 255) return Infinity; } return Math.hypot(a.x - b.x, a.y - b.y); };''')
rep('''  const mirrorX = x => W - x;''', '''  const mirrorX = x => W - x;
  const viewRangeOf = p => R.viewRange + (curMap.kind === "castle" && cellAt(p.x, p.y) === "y" ? 6 : 0);   // 火見櫓：遠くまで見える''')
# 視線は LOSBLOCK（窓は見通せる）
rep('''    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false;
    }
    if (DYN.length && dynBlocksLos(ax, ay, bx, by)) return false;
    return !SOLID[cellAt(bx, by)];''',
'''    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (LOSBLOCK[cellAt(ax + dx * t, ay + dy * t)]) return false;
    }
    if (DYN.length && dynBlocksLos(ax, ay, bx, by)) return false;
    return !LOSBLOCK[cellAt(bx, by)];''')

# ===== 2. 経路（BFS）に上下接続を入れる・地図ごとのキャッシュ =====
rep('''  // BFS距離場（チームごとに敵陣地を壁扱い）。Botの経路用
  const fieldCache = new Map();
  function field(team, tx, ty) {
    const cx = Math.max(0, Math.min(W - 1, tx | 0)), cy = Math.max(0, Math.min(H - 1, ty | 0));
    const key = team + ":" + cx + "," + cy;
    let f = fieldCache.get(key);
    if (f) return f;
    f = new Int16Array(W * H).fill(-1);
    const q = [cx + cy * W]; f[cx + cy * W] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i / W) | 0, d = f[i];
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nb) {
        if (solidCell(nx, ny, team)) continue;
        const j = nx + ny * W;
        if (f[j] >= 0) continue;
        f[j] = d + 1; q.push(j);
      }
    }
    fieldCache.set(key, f);
    return f;
  }''',
'''  // BFS距離場（チームごとに敵陣地を壁扱い・階段/降下幕をたどる）。Botの経路用。地図ごと・地図が変わるたびに作り直す
  function field(team, tx, ty) {
    const cx = Math.max(0, Math.min(W - 1, tx | 0)), cy = Math.max(0, Math.min(H - 1, ty | 0));
    const key = team + ":" + cx + "," + cy;
    const cache = curMap.fieldCache;
    let f = cache.get(key);
    if (f) return f;
    if (cache.size > 360) cache.clear();
    f = new Int16Array(W * H).fill(-1);
    const q = [cx + cy * W]; f[cx + cy * W] = 0;
    // 逆向き：着地点 → そこへ飛ばす口
    let from = curMap.portalFrom;
    if (portalAt && !from) { from = curMap.portalFrom = new Map(); for (const [i, pt] of portalAt) { const j = (pt.ty | 0) * W + (pt.tx | 0); if (!from.has(j)) from.set(j, []); from.get(j).push(i); } }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i / W) | 0, d = f[i];
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nb) {
        if (solidCell(nx, ny, team)) continue;
        const j = nx + ny * W;
        if (f[j] >= 0) continue;
        if (portalAt && portalAt.has(j)) continue;   // 口のマスに乗ったら必ず飛ぶ＝隣へ歩いて出られない
        f[j] = d + 1; q.push(j);
      }
      if (from && from.has(i)) for (const j of from.get(i)) { if (f[j] < 0 && !solidCell(j % W, (j / W) | 0, team)) { f[j] = d + 1; q.push(j); } }
    }
    cache.set(key, f);
    return f;
  }''')

# ===== 3. 選手の初期位置・Botのルート（城ではアトラスの座標） =====
rep('''  function makePlayer(id, team, charIdx, opts = {}) {
    const slot = opts.slot | 0;
    const sp = D.MAP.spawn[slot % 3];
    const x = team ? mirrorX(sp.x) : sp.x;''',
'''  function makePlayer(id, team, charIdx, opts = {}) {
    const slot = opts.slot | 0;
    const sp = { x: curMap.spawn[team][slot % 3].x, y: curMap.spawn[team][slot % 3].y };
    const x = sp.x;''')
rep('''      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, firstHitArmed: false, crossedCenter: false, lastSide: 0, protectBonus: 0, soulBoosted: false,''',
    '''      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, firstHitArmed: false, crossedCenter: false, lastSide: 0, protectBonus: 0, soulBoosted: false,
      // 城：上下接続の待ち・罠の待ち・回復地点
      lastCell: -1, portalCd: 0, noPortal: -1, trapCd: 0, shrineT: 0, shrineCd: 0,''')
rep('''  function createMatch(opts) {
    const g = {''', '''  // 城の仕様（seed・難しさ・城型）。省略時は練習用の固定マップ
  function mapFor(opts) { return opts && opts.castle && CastleLib ? castleMap(Object.assign({ difficulty: opts.difficulty || "normal" }, opts.castle)) : LEGACY; }
  function intelFor(m) {
    if (m.kind !== "castle") return [{ known: true, candidates: [] }, { known: true, candidates: [] }];
    const mk = () => {
      const info = m.castle.flagInfo;
      if (info === "full") return { known: true, floorKnown: true, candidates: [m.flagRoom] };
      if (info === "floor") return { known: false, floorKnown: true, candidates: m.rooms.filter(r => r.floor === m.flagFloor && r.spawn == null).map(r => r.id) };
      return { known: false, floorKnown: false, candidates: m.candidates.slice() };
    };
    return [mk(), mk()];
  }
  function createMatch(opts) {
    const map = mapFor(opts);
    bindMap({ map });
    const dur = map.kind === "castle" ? map.castle.duration : R.duration;
    const g = {
      map, intel: intelFor(map), keys: [0, 0], mapT: 0, duration: dur,''')
rep('''      time: R.duration, elapsed: 0, tick: 0, overtime: false,
      seed: (opts.seed | 0) || 20260922,''', '''      time: dur, elapsed: 0, tick: 0, overtime: false,
      seed: (opts.seed | 0) || 20260922,''')
rep('''      flag: "available", rules: R.version, map: D.MAP.version,
    };''', '''      flag: "available", rules: R.version, mapVersion: map.kind === "castle" ? "castle:" + map.castle.seed : D.MAP.version,
    };''')
rep('''    for (const p of g.players) assignAi(g, p);
    return g;
  }
  // 難易度ごとの初期値''', '''    for (const p of g.players) assignAi(g, p);
    return g;
  }
  // 難易度ごとの初期値''')
rep('''    p.ai.routeOverride = null;
    if (dif.aggro && p.bot && rng(g) < 0.5) {
      const routes = Object.keys(D.MAP.routes);
      p.ai.routeOverride = routes[(rng(g) * routes.length) | 0];
    }
  }''', '''    p.ai.routeOverride = null;
    if (dif.aggro && p.bot && rng(g) < 0.5) {
      const routes = curMap.kind === "castle" ? curMap.routes[p.team].map((r, i) => i) : Object.keys(D.MAP.routes);
      p.ai.routeOverride = routes[(rng(g) * routes.length) | 0];
    }
    // 城で旗の場所をまだ知らない：まず候補の部屋を探す
    if (curMap.kind === "castle" && g.intel && !g.intel[p.team].known) p.ai.phase = "search";
  }''')
rep('''  function resetForRematch(g, swapTeams) {
    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role, connected: p.connected }));
    Object.assign(g, { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false,''',
'''  // 再戦：城なら新しい城（opts.castle、無ければ同じ seed に再戦回数を足して作り直す）
  function resetForRematch(g, swapTeams, opts) {
    if (g.map && g.map.kind === "castle") {
      const prev = g.map.castle;
      const spec = (opts && opts.castle) || { seed: prev.baseSeed + ":r" + ((g.rematch | 0) + 1), difficulty: prev.difficulty, type: prev.type };
      g.map = mapFor({ castle: spec, difficulty: spec.difficulty || prev.difficulty });
    }
    g.rematch = (g.rematch | 0) + 1;
    bindMap(g);
    g.intel = intelFor(g.map); g.keys = [0, 0]; g.mapT = 0;
    g.duration = g.map.kind === "castle" ? g.map.castle.duration : R.duration;
    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role, connected: p.connected }));
    Object.assign(g, { phase: "briefing", timer: R.briefing, time: g.duration, elapsed: 0, tick: 0, overtime: false,''')
rep('''  function spawnPos(p) {
    const sp = D.MAP.spawn[p.slot % 3];
    return { x: p.team ? mirrorX(sp.x) : sp.x, y: sp.y };
  }''', '''  function spawnPos(p) {
    const sp = curMap.spawn[p.team][p.slot % 3];
    return { x: sp.x, y: sp.y };
  }''')
rep('''  function inSpawn(p) {
    const b = D.MAP.spawnBox;''', '''  function inSpawn(p) {
    if (curMap.kind === "castle") return cellAt(p.x, p.y) === (p.team ? "O" : "B");
    const b = D.MAP.spawnBox;''')
rep('''  function routeFor(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[1];''', '''  function routeFor(p) {
    if (curMap.kind === "castle") {
      const rs = curMap.routes[p.team];
      const idx = p.ai && p.ai.routeOverride != null ? p.ai.routeOverride : p.role === "vanguard" ? 0 : p.role === "scout" ? 1 : 2;
      const rt = rs[idx % rs.length];
      return { pts: rt.pts, wait: rt.wait, approach: rt.approach, door: rt.door };
    }
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[1];''')
rep('''  function guardPosts(team, dif) {
    // 旗から「警戒半径＋0.6m」の自陣側に3か所（敵の持ち場とは印が届かない距離）
    const r = alertRadius(dif) + 0.6;''', '''  function guardPosts(team, dif) {
    // 旗から「警戒半径＋0.6m」の自陣側に3か所（敵の持ち場とは印が届かない距離）
    const r = alertRadius(dif) + 0.6;
    if (curMap.kind === "castle") {
      // 城：旗の間の中で、自陣側（青は左・橙は右）の歩けるところ。壁なら半径を縮める
      return [-0.42, 0, 0.42].map(a => {
        const ang = (team ? 0 : Math.PI) + a;
        for (let rr = r; rr >= 2.2; rr -= 0.25) { const x = FLAG.x + Math.cos(ang) * rr, y = FLAG.y + Math.sin(ang) * rr; if (!blocked(x, y, R.bodyRadius + 0.05, team) && lineClear(x, y, FLAG.x, FLAG.y)) return { x, y }; }
        return { x: FLAG.x + Math.cos(ang) * 2.2, y: FLAG.y };
      });
    }''')
rep('''  function harassPts(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[2];''', '''  function harassPts(p) {
    if (curMap.kind === "castle") { const rt = routeFor(p); return { peek: rt.approach || rt.door, attack: rt.door }; }
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[2];''')

# ===== 4. 可視・音 =====
rep('''  function canSee(p, q) {
    if (q.returning > 0) return false;
    const d = dist(p, q);
    if (d > R.viewRange) return false;
    if (q.exposed > 0 && d <= R.viewRange && lineClear(p.x, p.y, q.x, q.y)) return true;''', '''  function canSee(p, q) {
    if (q.returning > 0) return false;
    const d = dist(p, q), vr = viewRangeOf(p);
    if (d > vr) return false;
    if (q.exposed > 0 && d <= vr && lineClear(p.x, p.y, q.x, q.y)) return true;''')
rep('''    let r = src.camo === 2 ? (modHas(src, "foxdash") ? R.footCrouch : R.footCamo) : src.crouch ? R.footCrouch : R.footRun;   // 狐駆け：布の揺れが大きい''',
    '''    let r = src.camo === 2 ? (modHas(src, "foxdash") ? R.footCrouch : R.footCamo) : src.crouch ? R.footCrouch : R.footRun;   // 狐駆け：布の揺れが大きい
    if (curMap.kind === "castle") { const c = cellAt(src.x, src.y); if (c === "q" || c === "u") r = Math.min(r, R.footCrouch); }   // 縁側・床下通路は足音が小さい''')
rep('''  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.exposed > 0 && dist(viewer, q) <= R.viewRange && lineClear(viewer.x, viewer.y, q.x, q.y)) return "revealed";''', '''  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.exposed > 0 && dist(viewer, q) <= viewRangeOf(viewer) && lineClear(viewer.x, viewer.y, q.x, q.y)) return "revealed";''')

# ===== 5. 1tick：地図の仕掛け・上下接続・罠・情報 =====
rep('''  function step(g) {
    const dt = TICK;
    bindDyn(g);''', '''  function step(g) {
    const dt = TICK;
    bindMap(g);
    bindDyn(g);''')
rep('''    g.dyn = g.objects.filter(o => DYN_KINDS[o.kind] && !(o.kind === "wall" && o.pending));   // 予告中の金剛壁はまだ実体がない
    DYN = g.dyn;''', '''    g.dyn = g.objects.filter(o => DYN_KINDS[o.kind] && !(o.kind === "wall" && o.pending)).concat(curMap.fogObjs || []);   // 予告中の金剛壁はまだ実体がない・城の霧庭は常設
    DYN = g.dyn;
    if (curMap.kind === "castle") { stepMap(g, dt); if (g.tick % 5 === 0) updateIntel(g); }''')
rep('''    // 旗の周囲4mの確保（生存人数で上回っている側に +8/3秒・チームで1回分）''', '''    // 旗の周囲4mの確保（生存人数で上回っている側に +8/3秒・チームで1回分）''')
rep('''      if (p.exposed > 0) speed = R.speed * p.bal.speedMul * p.bal.exposeMove * difMul;   // 露見：本人の速さの70%（逃走で±）''',
    '''      if (p.exposed > 0) speed = R.speed * p.bal.speedMul * p.bal.exposeMove * difMul;   // 露見：本人の速さの70%（逃走で±）
      if (curMap.kind === "castle") { const cu = cellAt(p.x, p.y); if (cu === "=") speed *= 0.8; else if (cu === "u") speed = Math.min(speed, R.crouchSpeed * p.bal.speedMul); }   // 浅瀬は遅い・床下通路はしゃがみ歩き''')
rep('''      // 設置物との接触（狐火・棘道・矢印・影穴の入口）
      touchObjects(g, p);''', '''      // 設置物との接触（狐火・棘道・矢印・影穴の入口）
      touchObjects(g, p);
      // 城：上下接続・罠・鍵・回復地点
      if (curMap.kind === "castle") mapInteract(g, p, dt);''')
# 中央越え（XP）は自分の階の軸で判定
rep('''        const side = p.x < FLAG.x ? 0 : 1, enemySide = 1 - p.team;''', '''        const side = p.x < axisOf(p) ? 0 : 1, enemySide = 1 - p.team;''')
rep('''  // ---------- HP・露見・復帰 ----------''', r'''  // ---------- 城：上下接続・罠・鍵・仕掛け扉・情報 ----------
  function axisOf(p) {
    if (curMap.kind !== "castle") return FLAG.x;
    const fi = floorAt(p.x, p.y), fl = curMap.floors[fi === 255 ? 0 : fi];
    return fl.ox + fl.w / 2;
  }
  function teleport(g, p, pt) {
    unhide(g, p, true);
    emit(g, "portal", p.x, p.y, { team: -1, life: 0.6, kind: pt.kind, dir: pt.dir });
    p.x = pt.tx; p.y = pt.ty; p.px = p.x; p.py = p.y;
    p.portalCd = 0.4; p.noPortal = pt.partner != null ? pt.partner : -1; p.lastCell = (p.y | 0) * W + (p.x | 0);
    emit(g, "portal", p.x, p.y, { team: -1, life: 0.6, kind: pt.kind, dir: pt.dir });
  }
  // 押し出す（急流・押し壁）。壁と敵の陣地の手前で止まる
  function pushPlayer(g, p, dx, dy) {
    const L = Math.hypot(dx, dy); if (L < 1e-6) return;
    let bx = p.x, by = p.y;
    for (let s2 = 0.25; s2 <= L + 1e-6; s2 += 0.25) { const nx = p.x + dx / L * s2, ny = p.y + dy / L * s2; if (blocked(nx, ny, R.bodyRadius, p.team) || !pathClear(p.x, p.y, nx, ny)) break; bx = nx; by = ny; }
    if (bx !== p.x || by !== p.y) { unhide(g, p); emit(g, "shove", p.x, p.y, { team: -1, tx: bx, ty: by, life: 0.5 }); p.x = bx; p.y = by; p.px = bx; p.py = by; }
  }
  function openLock(g, lk, p) {
    lk.open = true;
    for (const [x, y] of lk.cells) grid[y][x] = ".";
    mapChanged(curMap);
    emit(g, "unlock", lk.cells[0][0] + 0.5, lk.cells[0][1] + 0.5, { team: p ? p.team : -1, life: 1 });
    logEvent(g, "unlock", { id: p ? p.id : null, team: p ? p.team : -1, lock: lk.id });
  }
  function addPhantom(g, x, y) {
    g.objects.push({ id: ++g.serial2, kind: "phantom", team: -1, x, y, angle: rng(g) * Math.PI * 2, life: 4, speed: 3 });
  }
  function phantomAudible(listener, o) {
    if (o.kind !== "phantom") return false;
    let r = R.footRun; if (!lineClear(listener.x, listener.y, o.x, o.y)) r *= 0.5;
    return dist(listener, o) <= r;
  }
  function mapInteract(g, p, dt) {
    const m = curMap;
    p.portalCd = Math.max(0, p.portalCd - dt); p.trapCd = Math.max(0, p.trapCd - dt); p.shrineCd = Math.max(0, p.shrineCd - dt);
    const ci = (p.y | 0) * W + (p.x | 0), entered = ci !== p.lastCell;
    p.lastCell = ci;
    if (p.noPortal >= 0) { const nx = p.noPortal % W + 0.5, ny = ((p.noPortal / W) | 0) + 0.5; if (Math.hypot(p.x - nx, p.y - ny) > 1.6) p.noPortal = -1; }
    const pt = portalAt.get(ci);
    if (pt && p.portalCd <= 0 && ci !== p.noPortal) { teleport(g, p, pt); return; }
    const ch = grid[p.y | 0][p.x | 0];
    if (entered) {
      if (ch === "n") { addMod(p, "fogTrail", 3, { src: "naruko" }); emit(g, "naruko", p.x, p.y, { team: -1, life: 1 }); emit(g, "footprint", p.x, p.y, { team: 1 - p.team, life: 3 }); logEvent(g, "trap", { id: p.id, team: p.team, kind: "naruko" }); }   // 鳴子：3秒だけ足跡が見える
      else if (ch === "c" && p.trapCd <= 0) { const tr = m.trapAt.get(ci); if (tr && tr.dir) { pushPlayer(g, p, tr.dir[0] * 2, tr.dir[1] * 2); p.trapCd = 0.8; logEvent(g, "trap", { id: p.id, team: p.team, kind: "current" }); } }   // 急流：2m押し流す（HPは減らない）
      else if (ch === "f" && p.trapCd <= 0 && p.exposed <= 0) {   // 火鉢：8ダメージ・HP1未満にはならない・XPなし
        const before = p.hp; p.hp = Math.max(1, p.hp - 8); p.trapCd = 1.2;
        if (before > p.hp) { emit(g, "burn", p.x, p.y, { team: -1, target: p.id, dmg: before - p.hp, life: 0.8 }); logEvent(g, "trap", { id: p.id, team: p.team, kind: "brazier", dmg: before - p.hp }); }
      }
      else if (ch === "l") { const tr = m.trapAt.get(ci); if (tr && !(tr.cd > g.elapsed)) { tr.cd = g.elapsed + 6; addPhantom(g, p.x, p.y); emit(g, "lantern", p.x, p.y, { team: -1, life: 0.8 }); logEvent(g, "trap", { id: p.id, team: p.team, kind: "lantern" }); } }   // 幻灯：偽の足音を4秒
      else if (ch === "S") { const lk = m.locks.find(l => l.sw && l.sw[0] === (p.x | 0) && l.sw[1] === (p.y | 0) && !l.open); if (lk) openLock(g, lk, p); }   // 近道スイッチ
    }
    // 回復地点：静かに2秒立つと +25（露見中は不可・20秒に一度）
    if (ch === "H" && p.exposed <= 0 && p.speedNow < 0.3 && p.shrineCd <= 0) { p.shrineT += dt; if (p.shrineT >= 2) { const before = p.hp; p.hp = Math.min(p.hpMax, p.hp + 25); p.shrineCd = 20; p.shrineT = 0; emit(g, "shrine", p.x, p.y, { team: p.team, target: p.id, heal: p.hp - before, life: 1 }); } }
    else p.shrineT = 0;
    // 鍵：拾うとチームの鍵が1つ増える／鍵の扉に触れると開く
    for (const it of m.items) if (!it.taken && it.kind === "key" && Math.hypot(p.x - it.x, p.y - it.y) < 0.8 && p.exposed <= 0) { it.taken = true; g.keys[p.team]++; emit(g, "key", it.x, it.y, { team: p.team, life: 1 }); logEvent(g, "key", { id: p.id, team: p.team }); }
    if (g.keys[p.team] > 0 && p.exposed <= 0) for (const lk of m.locks) { if (lk.open) continue; if (lk.cells.some(([x, y]) => Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 1.3)) { g.keys[p.team]--; openLock(g, lk, p); break; } }
  }
  // 時間で動く仕掛け：回転壁/水門（2組が交互に開閉・敷居に人がいる間は延期）・押し壁（予告1秒のち押す）
  function stepMap(g, dt) {
    const m = curMap;
    g.mapT += dt;
    if (m.mechs.length) {
      const phase = Math.floor(g.mapT / m.period) % 2;
      let changed = false;
      for (const me of m.mechs) {
        const want = me.group === 0 ? phase === 0 : phase === 1;
        if (want === me.open) continue;
        if (!want && g.players.some(q => q.returning <= 0 && me.cells.some(([x, y]) => Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y) < R.bodyRadius + 0.75))) continue;   // 敷居に人がいる＝閉めない
        me.open = want; changed = true;
        for (const [x, y] of me.cells) grid[y][x] = want ? "m" : "M";
        emit(g, "mech", me.cells[0][0] + 0.5, me.cells[0][1] + 0.5, { team: -1, open: want, life: 0.8 });
      }
      if (changed) mapChanged(m);
    }
    for (const pw of m.pushes) {
      if (!pw.warned && g.mapT >= pw.next - 1) { pw.warned = true; emit(g, "push_warn", pw.cells[0][0] + 0.5, pw.cells[0][1] + 1, { team: -1, dx: pw.dx, life: 1 }); }
      if (g.mapT >= pw.next) {
        pw.next += 7; pw.warned = false;
        for (const q of g.players) { if (q.returning > 0) continue; const c = (q.y | 0) * W + (q.x | 0); if (pw.cells.some(([x, y]) => y * W + x === c)) { pushPlayer(g, q, pw.dx, pw.dy); logEvent(g, "trap", { id: q.id, team: q.team, kind: "pushwall" }); } }
      }
    }
  }
  // 旗の情報：見えた（射線・視程内）ら判明。候補の部屋は中が見えたら消える。旗印を見つけると偽の候補が1つ消える
  function updateIntel(g) {
    const m = curMap;
    for (const t of [0, 1]) {
      const I = g.intel[t]; if (I.known) continue;
      for (const p of g.players) {
        if (p.team !== t || p.returning > 0) continue;
        const vr = viewRangeOf(p);
        if (dist(p, FLAG) <= vr && lineClear(p.x, p.y, FLAG.x, FLAG.y)) { I.known = true; I.floorKnown = true; I.candidates = [m.flagRoom]; logEvent(g, "flagfound", { team: t, id: p.id }); emit(g, "flagfound", FLAG.x, FLAG.y, { team: t, life: 2 }); break; }
        I.candidates = I.candidates.filter(rid => { if (rid === m.flagRoom) return true; const r = m.rooms[rid]; const c = { x: r.cx, y: r.cy }; return !(dist(p, c) <= vr && lineClear(p.x, p.y, c.x, c.y)); });
        for (const it of m.items) if (it.kind === "emblem" && it.eliminates != null && I.candidates.includes(it.eliminates) && dist(p, it) <= vr && lineClear(p.x, p.y, it.x, it.y)) { I.candidates = I.candidates.filter(x => x !== it.eliminates); (I.emblems = I.emblems || []).push(it.id); logEvent(g, "emblem", { team: t, id: p.id }); }
      }
      if (!I.known && I.candidates.length <= 1) { I.known = true; I.floorKnown = true; I.candidates = [m.flagRoom]; logEvent(g, "flagfound", { team: t }); }
    }
  }
  // Bot：旗が分かるまで候補の部屋を手分けして見に行く
  function searchTarget(g, p) {
    const I = g.intel[p.team], m = curMap;
    if (p.ai.searchRoom != null && I.candidates.includes(p.ai.searchRoom)) { const r = m.rooms[p.ai.searchRoom]; return { x: r.cx, y: r.cy }; }
    const taken = new Set(g.players.filter(q => q.team === p.team && q !== p && q.ai && q.ai.phase === "search").map(q => q.ai.searchRoom));
    let best = null, bd = 1e9;
    const ci = (p.y | 0) * W + (p.x | 0);
    for (const rid of I.candidates) {
      const r = m.rooms[rid]; const f = field(p.team, r.cx, r.cy); const d = f[ci];
      if (d < 0) continue;
      const cost = d + (taken.has(rid) ? 60 : 0);
      if (cost < bd) { bd = cost; best = rid; }
    }
    p.ai.searchRoom = best;
    if (best == null) return FLAG;
    return { x: m.rooms[best].cx, y: m.rooms[best].cy };
  }
  // 旗が分かったら、ルートのうち旗へ近い側の地点から再開する
  function resumeWp(g, p) {
    const rt = routeFor(p), f = field(p.team, FLAG.x, FLAG.y), dp = f[(p.y | 0) * W + (p.x | 0)];
    for (let i = 0; i < rt.pts.length; i++) { const q = rt.pts[i]; const d = f[(q.y | 0) * W + (q.x | 0)]; if (d >= 0 && dp >= 0 && d <= dp) return i; }
    return rt.pts.length;
  }
  // 地図の状態（オンライン：鍵の扉・仕掛け扉・拾われた鍵）
  function mapState(g) {
    const m = g.map; if (!m || m.kind !== "castle") return null;
    return { v: m.version, locks: m.locks.filter(l => l.open).map(l => l.id), mechs: m.mechs.map(me => me.open ? 1 : 0), taken: m.items.filter(it => it.taken).map(it => it.id) };
  }
  function applyMapState(g, ms) {
    const m = g.map; if (!m || m.kind !== "castle" || !ms) return;
    let changed = false;
    for (const id of ms.locks || []) { const lk = m.locks[id]; if (lk && !lk.open) { lk.open = true; for (const [x, y] of lk.cells) m.rows[y][x] = "."; changed = true; } }
    (ms.mechs || []).forEach((o, i) => { const me = m.mechs[i]; if (me && me.open !== !!o) { me.open = !!o; for (const [x, y] of me.cells) m.rows[y][x] = o ? "m" : "M"; changed = true; } });
    for (const id of ms.taken || []) { const it = m.items[id]; if (it) it.taken = true; }
    if (changed) mapChanged(m);
  }

  // ---------- HP・露見・復帰 ----------''')
# 幻灯の偽の足音：設置物として動かす（描画には出さない・音だけ）
rep('''      if (o.kind === "gate" && o.exit && o.life <= EPS) o.dead = true;''', '''      if (o.kind === "gate" && o.exit && o.life <= EPS) o.dead = true;
      if (o.kind === "phantom") { o.angle += (rng(g) - 0.5) * 0.6; const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, 0.25, -1)) { o.x = nx; o.y = ny; } else o.angle += Math.PI / 2; }''')
# 霧庭（常設）には足跡・風遁の処理をしない
rep('''      if (o.kind === "zone_fog" && o.team !== p.team) {''', '''      if (o.kind === "zone_fog" && o.team !== p.team && !o.static) {''')

# ===== 6. Bot：旗探し・ルート再開・遅くなったら突入 =====
rep('''    const late = g.overtime || g.elapsed > 120;''', '''    const late = g.overtime || g.elapsed > (g.duration || R.duration) * 0.5;''')
rep('''    // ---- 固有技・奥義（状況で使う）----
    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);''', '''    // ---- 城：旗が分かったら探索をやめてルートへ ----
    if (curMap.kind === "castle" && g.intel) {
      const I = g.intel[p.team];
      if (ai.phase === "search" && I.known) { ai.phase = "route"; ai.wp = resumeWp(g, p); ai.searchRoom = null; }
      else if (ai.phase !== "search" && !I.known) ai.phase = "search";
    }
    // ---- 固有技・奥義（状況で使う）----
    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);''')
rep('''    if (ai.phase === "route") {
      while (ai.wp < route.pts.length && dist(p, route.pts[ai.wp]) < 1.3) ai.wp++;''', '''    if (ai.phase === "search") goal = searchTarget(g, p);
    if (ai.phase === "route") {
      // 階段の口の地点は、踏んで別の階へ移ったら（次の地点の方が近い）通過したことにする
      while (ai.wp < route.pts.length && (dist(p, route.pts[ai.wp]) < 1.3 || (route.pts[ai.wp].stair && ai.wp + 1 < route.pts.length && dist(p, route.pts[ai.wp + 1]) < dist(p, route.pts[ai.wp])))) ai.wp++;''')
rep('''          if (dif.aggro && rng(g) < 0.5) { const routes = Object.keys(D.MAP.routes); ai.routeOverride = routes[(rng(g) * routes.length) | 0]; }''',
    '''          if (dif.aggro && rng(g) < 0.5) { const routes = curMap.kind === "castle" ? curMap.routes[p.team].map((r, i) => i) : Object.keys(D.MAP.routes); ai.routeOverride = routes[(rng(g) * routes.length) | 0]; }''')
# 幻灯の偽の足音を Bot も聞き違える
rep('''    const enemy = seen[0] || null;
    if (enemy) { ai.seen += interval; ai.lastContact = g.elapsed; } else ai.seen = 0;''', '''    for (const o of g.objects) if (o.kind === "phantom" && phantomAudible(p, o) && rng(g) < 0.5 && !(ai.suspect && ai.suspect.sure)) ai.suspect = { x: o.x, y: o.y, t: 1.5, sure: false };
    const enemy = seen[0] || null;
    if (enemy) { ai.seen += interval; ai.lastContact = g.elapsed; } else ai.seen = 0;''')

# ===== 7. スナップショット：地図の状態・旗の情報・鍵・偽の足音 =====
rep('''  function snapshot(g, viewerId) {
    bindDyn(g);''', '''  function snapshot(g, viewerId) {
    bindMap(g);
    bindDyn(g);''')
rep('''        if (audible(v, p)) sounds.push({ a: +Math.atan2(p.y - v.y, p.x - v.x).toFixed(2), d: +dist(v, p).toFixed(1) });''',
    '''        if (audible(v, p)) sounds.push({ a: +Math.atan2(p.y - v.y, p.x - v.x).toFixed(2), d: +dist(v, p).toFixed(1) });''')
rep('''    const objects = g.objects.filter(o => !o.dead && objVisible(g, v, o)).map(o => pubObject(o, v));''',
    '''    const objects = g.objects.filter(o => !o.dead && o.kind !== "phantom" && objVisible(g, v, o)).map(o => pubObject(o, v));
    if (v) for (const o of g.objects) if (o.kind === "phantom" && !o.dead && phantomAudible(v, o)) sounds.push({ a: +Math.atan2(o.y - v.y, o.x - v.x).toFixed(2), d: +dist(v, o).toFixed(1) });   // 幻灯：偽の足音''')
rep('''    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds, objects, xp: g.xp, level: g.level };''',
    '''    const I = v && g.intel ? g.intel[v.team] : null;
    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds, objects, xp: g.xp, level: g.level,
      ms: mapState(g), intel: I ? { known: I.known, floorKnown: !!I.floorKnown, cands: I.candidates, emblems: I.emblems || [] } : null, keys: v && g.keys ? g.keys[v.team] : 0, duration: g.duration };''')
rep('''  function effectVisible(g, viewerId, e) {
    bindDyn(g);''', '''  function effectVisible(g, viewerId, e) {
    bindMap(g);
    bindDyn(g);''')
rep('''  function logVisible(g, viewerId, l) {
    const v = g.players.find(p => p.id === viewerId);''', '''  function logVisible(g, viewerId, l) {
    bindMap(g);
    const v = g.players.find(p => p.id === viewerId);''')
rep('''    if (l.type === "ping" || l.type === "perk" || l.type === "ult") return l.team === v.team;''',
    '''    if (l.type === "ping" || l.type === "perk" || l.type === "ult" || l.type === "flagfound" || l.type === "emblem" || l.type === "key") return l.team === v.team;''')

# ===== 8. 公開する関数（地図の値は読むたびに今の地図） =====
rep('''  return { R, D, W, H, TICK, FLAG, grid, SOLID, cellAt, solidCell, blocked, lineClear, zoneAt, dist, angDiff, mirrorX,''',
    '''  return { R, D, TICK, SOLID, LOSBLOCK, LEGACY, get W() { return W; }, get H() { return H; }, get FLAG() { return FLAG; }, get grid() { return grid; }, get map() { return curMap; },
    bindMap, mapFor, castleMap, intelFor, mapState, applyMapState, floorAt, viewRangeOf, phantomAudible, searchTarget, resumeWp, updateIntel, axisOf,
    cellAt, solidCell, blocked, lineClear, zoneAt, dist, angDiff, mirrorX,''')
open(p, "w", encoding="utf-8").write(s)
print("sim.js castle integration done")
