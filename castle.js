// 忍彩かくれんぼ — 城ダンジョン生成（設計図 castle-dungeon-blueprint v1.3）
// 地下1階〜5階・五つの城型・三段階の複雑さ。同じ seed からは必ず同じ城ができる（サーバーとスマホで同じ城を作る）。
// 左半分（＋中央の列）だけを作って鏡に写す＝両陣営の距離・曲がり角は完全に同じ。採用条件を1つでも満たさない seed は捨てて作り直す。
const Castle = (() => {
  const MOD = 8;                 // 部屋モジュールは 8m 単位（内側 7m）
  const GAP = 6;                 // 階と階のあいだの壁（音や範囲技が別の階へ届かない厚さ）
  const SIGHT_MAX = 18;          // 18m を超える射線には遮蔽を置く
  const FLOORS = ["B1", "1F", "2F", "3F", "4F", "5F"];
  const FLOOR_LABEL = { B1: "地下1F", "1F": "1F", "2F": "2F", "3F": "3F", "4F": "4F", "5F": "5F" };
  const FLOOR_TITLE = { B1: "地下", "1F": "大手門", "2F": "書院", "3F": "渡櫓", "4F": "軍議", "5F": "天守" };
  const MODULES = {
    B1: ["地下牢", "抜け穴", "貯水槽", "兵糧庫", "古井戸", "床下道"],
    "1F": ["大手門", "中庭", "台所", "武具蔵", "厩口", "番所"],
    "2F": ["大広間", "書院", "茶室", "回廊", "隠し間", "納戸"],
    "3F": ["客殿", "弓廊下", "庭見台", "渡櫓", "鐘の間", "小天守"],
    "4F": ["軍議の間", "宝物庫", "星見廊", "上層回廊", "破風の間", "守り櫓"],
    "5F": ["天守最上階", "旗の間", "月見台", "最終回廊", "鯱の間", "天窓広間"],
  };
  const TYPES = [
    { id: "bamboo", name: "竹影城", theme: "擬態と抜け道", features: "竹壁・床下通路・音の少ない縁側", trap: "naruko", trapName: "鳴子", trapDesc: "踏むと3秒だけ足跡が見える" },
    { id: "water", name: "水鏡城", theme: "水路と開閉水門", features: "水路・開閉水門・浅瀬・渡り廊下", trap: "current", trapName: "急流", trapDesc: "2m押し流すがHPは減らさない" },
    { id: "fire", name: "焔櫓城", theme: "縦移動と見通し", features: "吹抜け・火見櫓・短い螺旋階段", trap: "brazier", trapName: "火鉢", trapDesc: "8ダメージ。HP1未満にはならない" },
    { id: "karakuri", name: "絡繰城", theme: "時間で変わる道", features: "回転壁・重り床・歯車廊下", trap: "pushwall", trapName: "押し壁", trapDesc: "別室へ押すがHPは減らさない" },
    { id: "moon", name: "月霧城", theme: "情報と錯覚", features: "霧庭・似た部屋・月明かりの窓", trap: "lantern", trapName: "幻灯", trapDesc: "偽の足音を4秒鳴らす" },
  ];
  const DIFF = {
    easy:   { name: "やさしい", floors: [3, 3], mc: 5, mr: 3, rooms: [7, 10], branches: [1, 2], paths: 2, flagInfo: "full",       duration: 240, deadMax: 0.4 },
    normal: { name: "ふつう",   floors: [4, 5], mc: 7, mr: 3, rooms: [9, 13], branches: [2, 3], paths: 2, flagInfo: "floor",      duration: 300, deadMax: 0.35 },
    hard:   { name: "てごわい", floors: [5, 6], mc: 7, mr: 4, rooms: [11, 16], branches: [3, 4], paths: 3, flagInfo: "candidates", duration: 360, deadMax: 0.35 },
  };
  // 移動を止めるマス／視線を止めるマス（窓 x は視線を通す）
  const SOLID_MOVE = { "#": 1, "t": 1, "r": 1, "x": 1, "L": 1, "M": 1 };
  const SOLID_LOS = { "#": 1, "t": 1, "r": 1, "L": 1, "M": 1 };
  const TRAP_CH = { n: "naruko", c: "current", f: "brazier", l: "lantern", p: "pushwall" };

  // ---------- 乱数（128bit seed：xmur3 → sfc32） ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
  }
  function makeRng(str) {
    const s = xmur3(String(str)); let a = s(), b = s(), c = s(), d = s();
    const f = () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; };
    for (let i = 0; i < 12; i++) f();
    return f;
  }
  // 五つの城型をシャッフルバッグで巡る（直前と同じ城は避ける）
  function drawType(bag, last, seedStr) {
    const rng = makeRng("bag:" + seedStr);
    let b = Array.isArray(bag) ? bag.filter(id => TYPES.some(t => t.id === id)) : [];
    if (!b.length) {
      b = TYPES.map(t => t.id);
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      if (b[0] === last && b.length > 1) [b[0], b[1]] = [b[1], b[0]];
    }
    const type = b[0];
    return { type, bag: b.slice(1) };
  }

  // ---------- 1回ぶんの生成 ----------
  let lastFail = "";
  function build(seedStr, diffKey, typeId) {
    const fail = why => { lastFail = why; return null; };
    const rng = makeRng(seedStr);
    const P = DIFF[diffKey] || DIFF.normal;
    const T = TYPES.find(t => t.id === typeId) || TYPES[0];
    const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const MC = P.mc, MR = P.mr, cc = (MC - 1) / 2, FW = MC * MOD + 1, FH = MR * MOD + 1, AX = cc * MOD + 4;   // AX＝中央の列のまん中のマス（鏡の軸）
    const k = P.paths;

    // 1) 使う階と旗の階
    let used;
    if (diffKey === "easy") used = ["B1", "1F", "2F"];
    else if (diffKey === "normal") { const pool = ["B1", "1F", "2F", "3F", "4F"]; if (ri(4, 5) === 5) used = pool; else { const omit = pick(["B1", "2F", "3F", "4F"]); used = pool.filter(f => f !== omit); } }
    else { const n = ri(5, 6); if (n === 6) used = FLOORS.slice(); else { const omit = pick(["B1", "2F", "3F", "4F"]); used = FLOORS.filter(f => f !== omit); } }
    used = FLOORS.filter(f => used.includes(f));
    let flagFloor, candFloors = null;
    // てごわい：候補3室を別々の階に置き、本物の旗はその3階のどれか（5Fとは限らない＝規則から当てられない）
    // 候補の階は上の3階（2F以上・5Fを含む）＝開始階のすぐそばには旗を置かず、候補の階の選び方からも本物を当てられない
    if (diffKey === "hard") { candFloors = used.filter(f => f !== "1F" && f !== "B1").slice(-3); flagFloor = pick(candFloors); }
    else if (diffKey === "easy") flagFloor = pick(["B1", "2F"]);
    else { const up = used.filter(f => f !== "1F"); flagFloor = rng() < 0.5 ? up[up.length - 1] : pick(up); }
    const rs = Math.floor(MR / 2), rf = ri(0, MR - 1);
    // てごわい：旗の候補3室（本物＋偽2）。偽は別の階の中央の列（両陣営から公平）
    const fakeFloors = candFloors ? candFloors.filter(f => f !== flagFloor) : [];
    const fakeRows = fakeFloors.map(() => ri(0, MR - 1));

    // 2) 必須のモジュール（半分：c ≤ cc）
    const key = (c, r) => c + "," + r;
    const req = {}; used.forEach(f => { req[f] = new Set(); });
    const inLat = (c, r) => c >= 0 && c <= cc && r >= 0 && r < MR;
    req["1F"].add(key(0, rs));
    for (const [dc, dr] of [[1, 0], [0, -1], [0, 1]]) if (inLat(dc, rs + dr)) req["1F"].add(key(dc, rs + dr));   // 開始部屋の出口を増やす
    req[flagFloor].add(key(cc - 1, rf)); req[flagFloor].add(key(cc, rf));
    if (cc - 2 >= 0) req[flagFloor].add(key(cc - 2, rf));
    if (k >= 3) { const rr = rf > 0 ? rf - 1 : rf + 1; req[flagFloor].add(key(cc, rr)); }
    fakeFloors.forEach((f, i) => { req[f].add(key(cc, fakeRows[i])); req[f].add(key(cc - 1, fakeRows[i])); });   // 偽の候補も本物と同じ3部屋幅（形で見分けられないように）
    // 上下接続：隣り合う使用階ごとに、片側 k-1 本（焔櫓は+1）＋中央1本
    const trans = [];
    let prevMods = [];
    for (let i = 0; i + 1 < used.length; i++) {
      const a = used[i], b = used[i + 1];
      // 開始部屋・旗の間・偽の候補の間（本物と同じく階段を置かない＝階段の有無で見分けられない）
      const bad = (f, c, r) => (f === "1F" && c === 0 && r === rs) || (f === flagFloor && r === rf && c >= cc - 1) || fakeFloors.some((ff, i) => ff === f && r === fakeRows[i] && c >= cc - 1);
      // 階段室を縦に積まない：前の上下接続（この階に着く口）から2部屋以上離す（だめなら1部屋）＝各階を歩いて渡る
      // 開始部屋・旗の間のすぐ隣に上下接続を置かない（各階を歩かせる）
      const awayFromKey = (c, r, need) => (!(a === "1F" || b === "1F") || Math.abs(c - 0) + Math.abs(r - rs) >= need) && (!(a === flagFloor || b === flagFloor) || Math.min(Math.abs(c - (cc - 1)), Math.abs(c - cc)) + Math.abs(r - rf) >= need);
      const far = (c, r, need) => prevMods.every(m => Math.abs(m.c - c) + Math.abs(m.r - r) >= need) && awayFromKey(c, r, need);
      const side = [];
      const sc = k - 1 + (T.id === "fire" ? 1 : 0);
      let guard = 0;
      while (side.length < sc && guard++ < 400) {
        const c = ri(0, cc - 1), r = ri(0, MR - 1);
        if (bad(a, c, r) || bad(b, c, r) || side.some(m => m.c === c && m.r === r)) continue;
        if (!far(c, r, guard < 200 ? 2 : 1)) continue;
        side.push({ c, r, axis: false });
      }
      if (side.length < sc) return fail("L2s");
      const arOpts = [];
      for (let r = 0; r < MR; r++) if (!bad(a, cc, r) && !bad(b, cc, r)) arOpts.push(r);
      const arFar = arOpts.filter(r => far(cc, r, 2)), arNear = arOpts.filter(r => far(cc, r, 1));
      const arPool = arFar.length ? arFar : arNear;
      if (!arPool.length) return fail("L2");
      const ar = pick(arPool);
      const mods = side.concat([{ c: cc, r: ar, axis: true }]);
      for (const m of mods) { req[a].add(key(m.c, m.r)); req[b].add(key(m.c, m.r)); }
      trans.push({ a, b, mods });
      prevMods = mods;
    }

    // 3) 各階の部屋（半分を育てて鏡に写す）
    const F = {};
    for (const f of used) {
      const HS = new Set(req[f]);
      // 必須どうしをつなぐ
      const list = [...HS];
      const conn = new Set([list[0]]);
      const bfsPath = (from, targetSet) => {
        const prev = new Map([[from, null]]), q = [from];
        for (let qi = 0; qi < q.length; qi++) {
          const cur = q[qi]; if (targetSet.has(cur) && cur !== from) { const path = []; let x = cur; while (x) { path.push(x); x = prev.get(x); } return path; }
          const [c, r] = cur.split(",").map(Number);
          for (const [dc, dr] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) { const n = key(c + dc, r + dr); if (inLat(c + dc, r + dr) && !prev.has(n)) { prev.set(n, cur); q.push(n); } }
        }
        return null;
      };
      for (const m of list.slice(1)) { if (conn.has(m)) continue; const p = bfsPath(m, conn); if (p) p.forEach(x => { HS.add(x); conn.add(x); }); conn.add(m); }
      // 大部屋（旗の間・偽の候補）は先に決める
      const merges = [];
      if (f === flagFloor) merges.push([key(cc - 1, rf), key(cc, rf)]);
      fakeFloors.forEach((ff, i) => { if (ff === f) merges.push([key(cc - 1, fakeRows[i]), key(cc, fakeRows[i])]); });
      const fixed = new Set(merges.flat());
      // 部屋数＝大部屋をひとつと数え、鏡を含めて数える（設計図：1階あたりの部屋数）
      const roomsNow = () => {
        const par = new Map(); const fd = x => { while (par.get(x) !== x) x = par.get(x); return x; };
        const full = [];
        for (const m of HS) { const [c, r] = m.split(",").map(Number); full.push(key(c, r)); if (c !== cc) full.push(key(MC - 1 - c, r)); }
        full.forEach(x => par.set(x, x));
        for (const [a, b] of merges) { const [c1, r1] = a.split(",").map(Number), [c2, r2] = b.split(",").map(Number); for (const [p, q] of [[key(c1, r1), key(c2, r2)], [key(MC - 1 - c1, r1), key(MC - 1 - c2, r2)]]) if (par.has(p) && par.has(q) && fd(p) !== fd(q)) par.set(fd(p), fd(q)); }
        return new Set(full.map(fd)).size;
      };
      const growCand = () => { const cand = []; for (const m of HS) { const [c, r] = m.split(",").map(Number); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = key(c + dc, r + dr); if (inLat(c + dc, r + dr) && !HS.has(n) && !cand.includes(n)) cand.push(n); } } return cand; };
      const N = ri(P.rooms[0], P.rooms[1]);
      let g3 = 0;
      while (roomsNow() < N && g3++ < 200) {
        const cand = growCand();
        if (!cand.length) break;
        const n = pick(cand); const add = Number(n.split(",")[0]) === cc ? 1 : 2;
        if (roomsNow() + add > P.rooms[1] && add === 2) { const ax = cand.find(x => Number(x.split(",")[0]) === cc); if (ax) { HS.add(ax); continue; } break; }
        HS.add(n);
      }
      // 大部屋（吹抜け・大広間）
      const spawnMod = m => f === "1F" && m === key(0, rs);
      const nHall = T.id === "fire" ? ri(1, 2) : ri(0, 1);
      for (let h = 0; h < nHall; h++) {
        const opts = [];
        for (const m of HS) { const [c, r] = m.split(",").map(Number); const n = key(c + 1, r); if (c + 1 < cc && HS.has(n) && !spawnMod(m) && !spawnMod(n) && !merges.some(p => p.includes(m) || p.includes(n))) opts.push([m, n]); }
        if (opts.length) merges.push(pick(opts));
      }
      // 部屋数を範囲に収める：多ければ隣どうしをつないで大部屋に、少なければ部屋を足す
      let g5 = 0;
      while (g5++ < 80) {
        const n = roomsNow();
        if (n > P.rooms[1]) {
          const opts = [];
          for (const m of HS) { const [c, r] = m.split(",").map(Number); const nn = key(c + 1, r); if (c + 1 <= cc && HS.has(nn) && !spawnMod(m) && !spawnMod(nn) && !fixed.has(m) && !fixed.has(nn) && !merges.some(p => p.includes(m) && p.includes(nn))) opts.push([m, nn]); }
          if (!opts.length) break;
          merges.push(pick(opts)); continue;
        }
        if (n < P.rooms[0]) { const cand = growCand(); if (!cand.length) break; HS.add(pick(cand)); continue; }
        break;
      }
      { const n = roomsNow(); if (n < P.rooms[0] || n > P.rooms[1]) return fail("L3n " + f + " " + n); }
      // 通路：全域木＋分岐
      const parent = new Map(); const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      for (const m of HS) parent.set(m, m);
      const unite = (a, b) => parent.set(find(a), find(b));
      merges.forEach(([a, b]) => unite(a, b));
      const isMerged = (a, b) => merges.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
      const all = [];
      for (const m of HS) {
        const [c, r] = m.split(",").map(Number);
        const h = key(c + 1, r), v = key(c, r + 1);
        if (c + 1 <= cc && HS.has(h) && !isMerged(m, h)) all.push({ a: m, b: h, dir: "h", c, r });
        if (HS.has(v)) all.push({ a: m, b: v, dir: "v", c, r });
      }
      shuffle(all);
      const edges = [], pool = [];
      for (const e of all) { if (find(e.a) !== find(e.b)) { unite(e.a, e.b); e.kind = "door"; e.tree = true; edges.push(e); } else pool.push(e); }
      // 半分の連結を確認（鏡で右もつながる）
      const r0 = find([...HS][0]); if ([...HS].some(m => find(m) !== r0)) return fail("L4");
      const nb = ri(P.branches[0], P.branches[1]);
      for (let i = 0; i < nb && pool.length; i++) { const e = pool.shift(); e.kind = "door"; e.branch = true; edges.push(e); }
      F[f] = { id: f, HS, merges, edges, pool, stairs: [], portals: [], traps: [], items: [], fogs: [], locks: [], mechs: [], push: [], reserved: new Set(), doorCells: new Set(), feat: new Map() };
    }
    // 開始部屋・旗の間の出入口を k 本以上に
    const incident = (Fl, m) => Fl.edges.filter(e => e.a === m || e.b === m);
    const forceEdges = (Fl, mods, need) => {
      const inc = () => Fl.edges.filter(e => mods.includes(e.a) !== mods.includes(e.b)).length;
      while (inc() < need) { const i = Fl.pool.findIndex(e => mods.includes(e.a) !== mods.includes(e.b)); if (i < 0) break; const e = Fl.pool.splice(i, 1)[0]; e.kind = "door"; e.forced = true; Fl.edges.push(e); }
    };
    forceEdges(F["1F"], [key(0, rs)], k);
    forceEdges(F[flagFloor], [key(cc - 1, rf), key(cc, rf)], k >= 3 ? 2 : 1);   // 半分で片側1〜2本＝鏡で2〜4本

    // 4) 部屋グラフで独立経路（辺素なパス）を確かめる。足りなければ分岐を足す
    const floorIdx = f => used.indexOf(f);
    const flowVal = () => {
      const G = moduleGraph(used, F, trans, cc, MR, key);
      const s = G.nodeOf("1F", 0, rs), t = G.nodeOf(flagFloor, cc, rf);
      return maxFlow(G.n, G.edges, s, t);
    };
    const flowOK = () => flowVal() >= k;
    let fg = 0;
    while (!flowOK() && fg++ < 40) {
      const opt = used.filter(f => F[f].pool.length); if (!opt.length) return fail("L5 flow=" + flowVal() + " used=" + used.join("") + " flag=" + flagFloor);
      const Fl = F[pick(opt)]; const e = Fl.pool.splice(Math.floor(rng() * Fl.pool.length), 1)[0]; e.kind = "door"; e.branch = true; Fl.edges.push(e);
    }
    if (!flowOK()) return fail("L6");
    // 分岐の一部を仕掛けの扉に（旗への必須にしない＝独立経路は通常の扉だけで満たしてある）
    for (const f of used) {
      const Fl = F[f];
      // 水鏡城・絡繰城は仕掛け扉が城の顔＝各階に分岐の扉を1本足して、必ず仕掛けを置ける余地を作る
      if ((T.id === "karakuri" || T.id === "water") && Fl.pool.length) { const e = Fl.pool.splice(Math.floor(rng() * Fl.pool.length), 1)[0]; e.kind = "door"; e.branch = true; Fl.edges.push(e); }
      const br = Fl.edges.filter(e => e.branch && !e.forced);
      shuffle(br);
      let used2 = 0;
      const tryKind = (kind) => { for (const e of br) { if (e.kind !== "door") continue; const old = e.kind; e.kind = kind; if (flowOK()) { used2++; return e; } e.kind = old; } return null; };
      if (diffKey !== "easy" && rng() < 0.7) tryKind("locked");
      if (T.id === "bamboo") tryKind("crawl");
      if (T.id === "karakuri" || T.id === "water") { const e1 = tryKind("mech"); if (e1) e1.group = 0; if (T.id === "karakuri") { const e2 = tryKind("mech"); if (e2) e2.group = 1; } }
    }
    // 袋小路を上限内に（行き止まりの部屋が多すぎれば分岐を足す）
    for (const f of used) {
      const Fl = F[f];
      const dead = () => [...Fl.HS].filter(m => roomDegree(Fl, m, trans, f, key) <= 1);
      let g4 = 0;
      while (dead().length * 2 > Math.ceil(P.deadMax * countRooms(Fl, cc)) + 1 && g4++ < 10) {
        const d = dead(); const i = Fl.pool.findIndex(e => d.includes(e.a) || d.includes(e.b)); if (i < 0) break;
        const e = Fl.pool.splice(i, 1)[0]; e.kind = "door"; e.branch = true; Fl.edges.push(e);
      }
    }

    // 5) マス目を刻む（左半分＋軸）
    for (const f of used) {
      const Fl = F[f];
      const cells = Fl.cells = Array.from({ length: FH }, () => Array(FW).fill("#"));
      const set = (x, y, ch) => { if (x <= AX) cells[y][x] = ch; };
      for (const m of Fl.HS) {
        const [c, r] = m.split(",").map(Number);
        for (let y = r * MOD + 1; y <= r * MOD + MOD - 1; y++) for (let x = c * MOD + 1; x <= Math.min(c * MOD + MOD - 1, AX); x++) cells[y][x] = ".";
      }
      for (const [a, b] of Fl.merges) {
        const [c, r] = a.split(",").map(Number), wx = (c + 1) * MOD;
        for (let y = r * MOD + 1; y <= r * MOD + MOD - 1; y++) set(wx, y, ".");
      }
      const wallOff = new Map();
      const pickOff = (keys, w1) => {
        const opts = []; for (let o = 1; o <= (w1 ? 7 : 6); o++) if (keys.every(kk => !wallOff.has(kk) || Math.abs(wallOff.get(kk) - o) >= 3)) opts.push(o);
        return opts.length ? pick(opts) : ri(1, w1 ? 7 : 6);
      };
      for (const e of Fl.edges) {
        const ch = e.kind === "crawl" ? "u" : e.kind === "locked" ? "L" : e.kind === "mech" ? "m" : ".";
        const w1 = e.kind === "crawl";
        const cellsE = [];
        if (e.dir === "h") {
          const o = pickOff(["h:" + (e.c - 1) + ":" + e.r, "h:" + (e.c + 1) + ":" + e.r], w1); wallOff.set("h:" + e.c + ":" + e.r, o);
          const wx = (e.c + 1) * MOD; for (let i = 0; i < (w1 ? 1 : 2); i++) cellsE.push([wx, e.r * MOD + o + i]);
        } else {
          const wy = (e.r + 1) * MOD;
          if (e.c === cc) {
            // 中央の列：まん中の扉と、左右対称の二つ扉を段ごとに交互に（縦に一直線に並ばない）
            if (e.r % 2 === 0) { if (w1) cellsE.push([AX, wy]); else cellsE.push([AX - 1, wy], [AX, wy]); }
            else { if (w1) cellsE.push([AX - 2, wy]); else cellsE.push([AX - 3, wy], [AX - 2, wy]); }
          } else {
            const o = pickOff(["v:" + e.c + ":" + (e.r - 1), "v:" + e.c + ":" + (e.r + 1)], w1); wallOff.set("v:" + e.c + ":" + e.r, o);
            for (let i = 0; i < (w1 ? 1 : 2); i++) cellsE.push([e.c * MOD + o + i, wy]);
          }
        }
        e.cells = cellsE;
        for (const [x, y] of cellsE) { set(x, y, ch); Fl.doorCells.add(x + "," + y); }
        if (e.kind === "locked") Fl.locks.push({ edge: e, cells: cellsE });
        if (e.kind === "mech") Fl.mechs.push({ edge: e, cells: cellsE, group: e.group | 0 });
      }
      // 扉の前後1マスは空けておく（階段・仕掛けを置かない）
      for (const dc of Fl.doorCells) { const [x, y] = dc.split(",").map(Number); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) Fl.reserved.add((x + dx) + "," + (y + dy)); }
      // 開始部屋＝陣地
      if (f === "1F") for (let y = rs * MOD + 1; y <= rs * MOD + MOD - 1; y++) for (let x = 1; x <= MOD - 1; x++) cells[y][x] = "B";
      // 旗のまわり3m＝砂（擬態できない）
      if (f === flagFloor) {
        const fx = AX + 0.5, fy = rf * MOD + 4.5;
        for (let y = rf * MOD + 1; y <= rf * MOD + MOD - 1; y++) for (let x = (cc - 1) * MOD + 1; x <= AX; x++) if (Math.hypot(x + 0.5 - fx, y + 0.5 - fy) <= 3.2 && cells[y][x] === ".") { cells[y][x] = "~"; Fl.reserved.add(x + "," + y); }
        Fl.flag = { x: fx, y: fy };
      }
      fakeFloors.forEach((ff, i) => {
        if (ff !== f) return;
        const fx = AX + 0.5, fy = fakeRows[i] * MOD + 4.5;
        for (let y = fakeRows[i] * MOD + 1; y <= fakeRows[i] * MOD + MOD - 1; y++) for (let x = (cc - 1) * MOD + 1; x <= AX; x++) if (Math.hypot(x + 0.5 - fx, y + 0.5 - fy) <= 3.2 && cells[y][x] === ".") Fl.reserved.add(x + "," + y);
      });
    }
    // 上下接続のマス（下の階＝登り口 ^、上の階＝降り口 v）
    const plain = (f, x, y) => { const Fl = F[f]; return x >= 0 && y >= 0 && x <= AX && y < FH && Fl.cells[y][x] === "." && !Fl.reserved.has(x + "," + y); };
    const reserve = (f, x, y) => F[f].reserved.add(x + "," + y);
    const SIDE_OFF = [[2, 2], [6, 2], [2, 6], [6, 6], [2, 4], [6, 4], [4, 2], [4, 6]];
    const AXIS_OFF = [[4, 2], [4, 6], [4, 3], [4, 5]];
    for (const tr of trans) {
      for (const m of tr.mods) {
        const offs = m.axis ? AXIS_OFF : shuffle(SIDE_OFF.slice());
        const dirs = m.axis ? [[0, 1], [0, -1]] : shuffle([[0, 1], [0, -1], [1, 0], [-1, 0]]);
        let ok = false;
        for (const [ox, oy] of offs) {
          const x = m.axis ? AX : m.c * MOD + ox, y = m.r * MOD + oy;
          if (!plain(tr.a, x, y) || !plain(tr.b, x, y)) continue;
          for (const [dx, dy] of dirs) {
            const ax2 = x + dx, ay2 = y + dy;
            if (!plain(tr.a, ax2, ay2) || !plain(tr.b, ax2, ay2)) continue;
            F[tr.a].cells[y][x] = "^"; F[tr.b].cells[y][x] = "v";
            const kind = m.axis ? "階段" : T.id === "fire" ? "螺旋階段" : pick(["階段", "梯子", "昇降機"]);
            F[tr.a].portals.push({ x, y, toFloor: tr.b, tx: ax2 + 0.5, ty: ay2 + 0.5, kind, dir: "up" });
            F[tr.b].portals.push({ x, y, toFloor: tr.a, tx: ax2 + 0.5, ty: ay2 + 0.5, kind, dir: "down" });
            for (const f of [tr.a, tr.b]) { for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) reserve(f, x + xx, y + yy); reserve(f, ax2, ay2); }
            ok = true; break;
          }
          if (ok) break;
        }
        if (!ok) return fail("L8");
      }
      // 降下幕（上の階から下の階への一方通行・追加の近道）
      if (diffKey !== "easy" && rng() < 0.5) {
        // 旗の間・偽の候補の間（とその隣）には置かない＝候補の見た目をそろえる
        const nearCand = (f, c, r) => (f === flagFloor && r === rf && c >= cc - 2) || fakeFloors.some((ff, i) => ff === f && r === fakeRows[i] && c >= cc - 2);
        const Fb = F[tr.b], opts = [...Fb.HS].filter(m => { const [c, r] = m.split(",").map(Number); return F[tr.a].HS.has(m) && c < cc && !nearCand(tr.a, c, r) && !nearCand(tr.b, c, r); });
        shuffle(opts);
        for (const m of opts) {
          const [c, r] = m.split(",").map(Number); const x = c * MOD + 4, y = r * MOD + 4;
          if (!plain(tr.b, x, y) || !plain(tr.a, x, y)) continue;
          Fb.cells[y][x] = "z"; Fb.portals.push({ x, y, toFloor: tr.a, tx: x + 0.5, ty: y + 0.5, kind: "降下幕", dir: "drop", oneWay: true });
          reserve(tr.b, x, y); reserve(tr.a, x, y); break;
        }
      }
    }

    // 6) ダンジョン性：擬態帯・城型の特徴・罠（すべて予告つき・迂回できる）
    for (const f of used) {
      const Fl = F[f];
      const modsL = [...Fl.HS].map(m => m.split(",").map(Number));
      const isSpawn = (c, r) => f === "1F" && c === 0 && r === rs;
      const inFlagRoom = (c, r) => f === flagFloor && r === rf && c >= cc - 1;
      const rect = (c, r) => ({ x0: c * MOD + 1, y0: r * MOD + 1, x1: Math.min(c * MOD + MOD - 1, AX), y1: r * MOD + MOD - 1 });
      const patch = (c, r, w, h, ch, tries) => {
        const R = rect(c, r);
        for (let t = 0; t < (tries || 12); t++) {
          const x0 = ri(R.x0, Math.max(R.x0, R.x1 - w + 1)), y0 = ri(R.y0, Math.max(R.y0, R.y1 - h + 1));
          const cellsP = [];
          let okp = true;
          for (let y = y0; y < y0 + h && okp; y++) for (let x = x0; x < x0 + w; x++) { if (x > AX || !plain(f, x, y)) { okp = false; break; } cellsP.push([x, y]); }
          if (!okp) continue;
          for (const [x, y] of cellsP) { Fl.cells[y][x] = ch; reserve(f, x, y); }
          return cellsP;
        }
        return null;
      };
      const pats = T.id === "bamboo" ? ["b", "b", "b", "s"] : ["b", "s", "w"];
      for (const [c, r] of modsL) {
        if (isSpawn(c, r)) continue;
        const n = (T.id === "bamboo" ? 2 : 1) + (rng() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) { const vert = rng() < 0.5; patch(c, r, vert ? 2 : 3, vert ? 3 : 2, pick(pats)); }
      }
      const rooms2 = modsL.filter(([c, r]) => !isSpawn(c, r) && !inFlagRoom(c, r) && !(f === flagFloor && r === rf && c === cc - 2));
      shuffle(rooms2);
      const trapHere = (c, r) => !inFlagRoom(c, r);
      const nTrap = diffKey === "easy" ? 1 : 2;
      let placed = 0;
      for (const [c, r] of rooms2) {
        if (placed >= nTrap) break;
        if (!trapHere(c, r)) continue;
        if (T.trap === "pushwall") {
          // 押し壁：扉の手前に立つと、予告ののち扉の向こうの部屋へ押し出される
          const nearBase = m2 => f === "1F" && Fl.edges.some(e2 => (e2.a === m2 && e2.b === key(0, rs)) || (e2.b === m2 && e2.a === key(0, rs)));
          // 通り道の扉でも、その扉を通らずに階の部屋をすべて回れる（迂回路がある）なら置ける
          const bypass = e0 => {
            const adj = new Map([...Fl.HS].map(m => [m, []]));
            for (const e2 of Fl.edges) if (e2 !== e0 && (e2.kind === "door" || e2.kind === "crawl") && adj.has(e2.a) && adj.has(e2.b)) { adj.get(e2.a).push(e2.b); adj.get(e2.b).push(e2.a); }
            for (const [a2, b2] of Fl.merges) if (adj.has(a2) && adj.has(b2)) { adj.get(a2).push(b2); adj.get(b2).push(a2); }
            const st = [...Fl.HS][0], seen = new Set([st]), q = [st];
            while (q.length) { const x = q.pop(); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } }
            return seen.size === Fl.HS.size;
          };
          const doors = Fl.edges.filter(e => e.kind === "door" && (e.cells.length >= 2 || !e.tree || bypass(e)) && !e.pushed && (e.a === key(c, r) || e.b === key(c, r)) && e.dir === "h" && e.c + 1 <= cc && !nearBase(e.a) && !nearBase(e.b) && e.a !== key(0, rs) && e.b !== key(0, rs));
          if (!doors.length) continue;
          const e = pick(doors); const wx = e.cells[0][0];
          const fromLeft = e.a === key(c, r);   // この部屋が扉の左側なら右へ押す
          const sx = fromLeft ? wx - 1 : wx + 1, dir = fromLeft ? 1 : -1;
          if (sx > AX || wx + dir * 2 > AX) continue;
          // 迂回路のない扉は、幅の1マスを空けて置く（押し壁の帯を踏まずに通れる）
          const lane = (e.tree && !bypass(e)) ? e.cells.slice(0, e.cells.length - 1) : e.cells;
          if (!lane.length) continue;
          const strip = lane.map(([x, y]) => [sx, y]);
          const land = lane.map(([x, y]) => [wx + dir * 2, y]);
          if (!strip.every(([x, y]) => Fl.cells[y][x] === "." ) || !land.every(([x, y]) => x <= AX && ".bsw".includes(Fl.cells[y][x]))) continue;
          for (const [x, y] of strip) Fl.cells[y][x] = "p";
          e.pushed = true;   // 同じ扉の両側には置かない
          Fl.push.push({ cells: strip, dx: dir * 3, dy: 0 });
          placed++;
          continue;
        }
        const ch = { naruko: "n", current: "c", brazier: "f", lantern: "l" }[T.trap];
        const vert = rng() < 0.5;
        const cellsT = patch(c, r, T.trap === "current" ? (vert ? 1 : 3) : (vert ? 1 : 2), T.trap === "current" ? (vert ? 3 : 1) : (vert ? 2 : 1), ch, 16);
        if (!cellsT) continue;
        let dir = T.trap === "current" ? (vert ? [0, rng() < 0.5 ? 1 : -1] : [rng() < 0.5 ? 1 : -1, 0]) : null;
        if (dir && dir[0] !== 0 && cellsT.some(([x]) => x >= AX)) dir = [0, rng() < 0.5 ? 1 : -1];
        for (const [x, y] of cellsT) Fl.traps.push({ kind: T.trap, x, y, dir });
        placed++;
      }
      // 城型の特徴
      if (T.id === "bamboo") { const [c, r] = pick(rooms2.length ? rooms2 : modsL); const R = rect(c, r); for (let x = R.x0; x <= R.x1; x++) if (plain(f, x, R.y1)) { Fl.cells[R.y1][x] = "q"; reserve(f, x, R.y1); } }   // 縁側（足音が小さい）
      if (T.id === "water") for (const [c, r] of rooms2.slice(0, 2)) patch(c, r, 3, 3, "=", 10);                                                                                      // 浅瀬（遅くなる）
      if (T.id === "fire") for (const [c, r] of rooms2.slice(0, 1)) { const R = rect(c, r); for (const [x, y] of [[R.x0, R.y0], [R.x1, R.y0], [R.x0, R.y1], [R.x1, R.y1]]) if (plain(f, x, y)) { Fl.cells[y][x] = "y"; reserve(f, x, y); break; } }   // 火見櫓（遠くまで見える）
      if (T.id === "moon") for (const [c, r] of rooms2.slice(0, 2)) { const R = rect(c, r); const cx = (R.x0 + R.x1 + 1) / 2, cy = (R.y0 + R.y1 + 1) / 2; if (cx + 2.2 < AX + 0.5) Fl.fogs.push({ x: cx, y: cy, r: 2.2 }); }   // 霧庭（視線を遮る）
      if (T.id === "moon" || T.id === "water") {   // 月明かりの窓・渡り廊下の窓（通れないが見える）
        const walls = [];
        for (const m of Fl.HS) { const [c, r] = m.split(",").map(Number); const n = key(c + 1, r); if (c + 1 <= cc && Fl.HS.has(n) && !Fl.edges.some(e => (e.a === m && e.b === n) || (e.a === n && e.b === m)) && !Fl.merges.some(p => p.includes(m) && p.includes(n))) walls.push([c, r]); }
        shuffle(walls);
        for (const [c, r] of walls.slice(0, 2)) { const wx = (c + 1) * MOD, y = r * MOD + ri(2, 5); if (wx <= AX && Fl.cells[y][wx] === "#" && Fl.cells[y + 1][wx] === "#") { Fl.cells[y][wx] = "x"; Fl.cells[y + 1][wx] = "x"; } }
      }
      // 袋小路には鍵・偵察窓・回復地点・近道スイッチのどれかを置く
      const deadMods = modsL.filter(([c, r]) => !isSpawn(c, r) && !inFlagRoom(c, r) && roomDegree(Fl, key(c, r), trans, f, key) <= 1);
      for (const [c, r] of deadMods) {
        const R = rect(c, r), cx = Math.min(R.x1, (R.x0 + R.x1) >> 1), cy = (R.y0 + R.y1) >> 1;
        const spots = []; for (let y = R.y0; y <= R.y1; y++) for (let x = R.x0; x <= R.x1; x++) if (plain(f, x, y)) spots.push([x, y, Math.abs(x - cx) + Math.abs(y - cy)]);
        spots.sort((p, q) => p[2] - q[2]);
        if (!spots.length) continue;
        const [x, y] = spots[0];
        const lockNoSwitch = Fl.locks.find(l => !l.sw);
        const roll = rng();
        let feat;
        if (lockNoSwitch && roll < 0.3) { Fl.cells[y][x] = "S"; lockNoSwitch.sw = [x, y]; feat = "switch"; }
        else if (roll < 0.6) { Fl.items.push({ kind: "key", x: x + 0.5, y: y + 0.5 }); feat = "key"; }
        else if (roll < 0.8) { Fl.cells[y][x] = "H"; feat = "shrine"; }
        else {
          // 偵察窓：扉のない隣の部屋との壁に窓をあける
          const linked = (a, b) => Fl.edges.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a)) || Fl.merges.some(p2 => p2.includes(a) && p2.includes(b));
          const nbr = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => [c + dc, r + dr]).find(([c2, r2]) => inLat(c2, r2) && Fl.HS.has(key(c2, r2)) && !linked(key(c, r), key(c2, r2)));
          let win = null;
          if (nbr) {
            const [c2, r2] = nbr;
            if (c2 !== c) { const wx = Math.max(c, c2) * MOD, yy = r * MOD + ri(2, 5); win = [[wx, yy], [wx, yy + 1]]; }
            else { const wy = Math.max(r, r2) * MOD, xx = c === cc ? AX - 1 : c * MOD + ri(2, 5); win = [[xx, wy], [xx + 1, wy]].filter(([x2]) => x2 <= AX); }
            if (!win.every(([x2, y2]) => x2 <= AX && Fl.cells[y2][x2] === "#")) win = null;
          }
          if (win) { for (const [x2, y2] of win) Fl.cells[y2][x2] = "x"; feat = "window"; }
          else { Fl.cells[y][x] = "H"; feat = "shrine"; }
        }
        reserve(f, x, y);
        Fl.feat.set(key(c, r), feat);
      }
    }
    // てごわい：旗印（見つけた陣営は偽の候補を1つ消せる）
    if (diffKey === "hard") {
      const emblemFloors = used.filter(f => f !== flagFloor && f !== "1F");
      for (let i = 0; i < fakeFloors.length; i++) {
        const f = pick(emblemFloors), Fl = F[f];
        const mods = [...Fl.HS].map(m => m.split(",").map(Number)).filter(([c, r]) => c < cc && !(f === "1F" && c === 0 && r === rs));
        shuffle(mods);
        for (const [c, r] of mods) {
          const x = c * MOD + ri(2, 6), y = r * MOD + ri(2, 6);
          if (!plain(f, x, y)) continue;
          Fl.items.push({ kind: "emblem", x: x + 0.5, y: y + 0.5, fake: i }); reserve(f, x, y); break;
        }
      }
    }

    // 城型の顔になる仕掛けが1つも無い城は作り直す（水鏡＝水門・絡繰＝回転壁と押し壁）
    if ((T.id === "water" || T.id === "karakuri") && !used.some(f => F[f].edges.some(e => e.kind === "mech"))) return fail("L7 mech");
    if (T.id === "karakuri" && !used.some(f => F[f].push.length)) return fail("L7 push");
    // 7) 鏡に写して1枚の地図（階を横に並べたアトラス）にする
    const n = used.length, W = n * (FW + GAP) + GAP, H = FH + 2 * GAP;
    const rows = Array.from({ length: H }, () => Array(W).fill("#"));
    const floors = used.map((f, i) => ({ id: f, label: FLOOR_LABEL[f], title: FLOOR_TITLE[f], ox: GAP + i * (FW + GAP), oy: GAP, w: FW, h: FH, index: i }));
    const floorById = Object.fromEntries(floors.map(fl => [fl.id, fl]));
    const mirCh = ch => ch === "B" ? "O" : ch;
    for (const fl of floors) {
      const Fl = F[fl.id];
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const src = x <= AX ? Fl.cells[y][x] : mirCh(Fl.cells[y][FW - 1 - x]);
        rows[fl.oy + y][fl.ox + x] = src;
      }
    }
    const mx = (fl, lx) => FW - 1 - lx;                                 // マスの鏡
    const mpx = (fl, x) => FW - x;                                       // 座標の鏡（連続値）
    const portals = [], traps = [], items = [], fogs = [], locks = [], mechs = [], pushes = [];
    const addBoth = (lx, fn) => { fn(false); if (lx < AX) fn(true); };
    for (const fl of floors) {
      const Fl = F[fl.id];
      for (const p of Fl.portals) {
        const to = floorById[p.toFloor];
        addBoth(p.x, m => portals.push({ id: portals.length, x: fl.ox + (m ? mx(fl, p.x) : p.x) + 0.5, y: fl.oy + p.y + 0.5, cx: fl.ox + (m ? mx(fl, p.x) : p.x), cy: fl.oy + p.y, floor: fl.id, toFloor: p.toFloor, tx: to.ox + (m ? mpx(fl, p.tx) : p.tx), ty: to.oy + p.ty, kind: p.kind, dir: p.dir, oneWay: !!p.oneWay }));
      }
      for (const t of Fl.traps) addBoth(t.x, m => traps.push({ kind: t.kind, cx: fl.ox + (m ? mx(fl, t.x) : t.x), cy: fl.oy + t.y, dir: t.dir ? [m ? -t.dir[0] : t.dir[0], t.dir[1]] : null, floor: fl.id }));
      for (const it of Fl.items) { const lx = Math.floor(it.x); addBoth(lx, m => items.push(Object.assign({}, it, { id: items.length, x: fl.ox + (m ? mpx(fl, it.x) : it.x), y: fl.oy + it.y, floor: fl.id }))); }
      for (const fg of Fl.fogs) { fogs.push({ x: fl.ox + fg.x, y: fl.oy + fg.y, r: fg.r, floor: fl.id }); fogs.push({ x: fl.ox + mpx(fl, fg.x), y: fl.oy + fg.y, r: fg.r, floor: fl.id }); }
      for (const l of Fl.locks) {
        const onAxis = l.cells.some(([x]) => x === AX);
        const mk = m => { const cellsL = []; for (const [x, y] of l.cells) { cellsL.push([fl.ox + (m ? mx(fl, x) : x), fl.oy + y]); if (onAxis && x < AX && !m) cellsL.push([fl.ox + mx(fl, x), fl.oy + y]); } const sw = l.sw ? [fl.ox + (m ? mx(fl, l.sw[0]) : l.sw[0]), fl.oy + l.sw[1]] : null; const sws = !l.sw ? [] : onAxis && l.sw[0] < AX ? [sw, [fl.ox + mx(fl, l.sw[0]), fl.oy + l.sw[1]]] : [sw]; return { id: locks.length, cells: cellsL, sw, sws, floor: fl.id }; };
        locks.push(mk(false)); if (!onAxis) locks.push(mk(true));
      }
      for (const me of Fl.mechs) {
        const onAxis = me.cells.some(([x]) => x === AX);
        const cellsM = [];
        for (const [x, y] of me.cells) { cellsM.push([fl.ox + x, fl.oy + y]); if (x < AX) cellsM.push([fl.ox + mx(fl, x), fl.oy + y]); }
        mechs.push({ id: mechs.length, cells: cellsM, group: me.group, floor: fl.id, axis: onAxis });
      }
      for (const pw of Fl.push) {
        addBoth(pw.cells[0][0], m => pushes.push({ id: pushes.length, cells: pw.cells.map(([x, y]) => [fl.ox + (m ? mx(fl, x) : x), fl.oy + y]), dx: m ? -pw.dx : pw.dx, dy: pw.dy, floor: fl.id }));
      }
    }
    // 窓・スイッチなどは rows に入っている。鍵の扉は L、仕掛け扉は m（開）で初期化
    // 部屋
    const rooms = [];
    const roomOf = new Int16Array(W * H).fill(-1);
    for (const fl of floors) {
      const Fl = F[fl.id];
      const full = new Set();
      for (const m of Fl.HS) { const [c, r] = m.split(",").map(Number); full.add(key(c, r)); full.add(key(MC - 1 - c, r)); }
      const mergesFull = [];
      for (const [a, b] of Fl.merges) { const [c1, r1] = a.split(",").map(Number), [c2, r2] = b.split(",").map(Number); mergesFull.push([key(c1, r1), key(c2, r2)], [key(MC - 1 - c1, r1), key(MC - 1 - c2, r2)]); }
      const par = new Map(); for (const m of full) par.set(m, m);
      const fnd = x => { while (par.get(x) !== x) x = par.get(x); return x; };
      for (const [a, b] of mergesFull) par.set(fnd(a), fnd(b));
      const groups = new Map();
      for (const m of full) { const r = fnd(m); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(m); }
      const names = MODULES[fl.id];
      const nameOf = new Map();
      const sortedGroups = [...groups.values()].map(g => g.sort()).sort((a, b) => a[0] < b[0] ? -1 : 1);
      for (const g of sortedGroups) {
        const mods = g.map(m => m.split(",").map(Number));
        const minC = Math.min(...mods.map(m => m[0])), maxC = Math.max(...mods.map(m => m[0]));
        const twinKey = mods.map(([c, r]) => key(MC - 1 - c, r)).sort().join("|");
        const isFlag = fl.id === flagFloor && mods.some(([c, r]) => c === cc && r === rf);
        const isFake = fakeFloors.some((ff, i) => ff === fl.id && mods.some(([c, r]) => c === cc && r === fakeRows[i]));
        const isSpawn0 = fl.id === "1F" && mods.some(([c, r]) => c === 0 && r === rs), isSpawn1 = fl.id === "1F" && mods.some(([c, r]) => c === MC - 1 && r === rs);
        let name;
        if (isFlag || isFake) name = fl.id === "5F" ? "旗の間" : names[0];
        else if (isSpawn0 || isSpawn1) name = "大手門";
        else if (nameOf.has(twinKey)) name = nameOf.get(twinKey);
        else name = T.id === "moon" ? names[ri(0, 2)] : pick(names.slice(1));
        nameOf.set(g.slice().sort().join("|"), name);
        const x0 = fl.ox + minC * MOD + 1, x1 = fl.ox + maxC * MOD + MOD - 1;
        const ys = mods.map(m => m[1]); const y0 = fl.oy + Math.min(...ys) * MOD + 1, y1 = fl.oy + Math.max(...ys) * MOD + MOD - 1;
        const cx = isFlag ? fl.ox + Fl.flag.x : mods.reduce((s, [c]) => s + fl.ox + c * MOD + 4.5, 0) / mods.length;
        const cy = isFlag ? fl.oy + Fl.flag.y : mods.reduce((s, [, r]) => s + fl.oy + r * MOD + 4.5, 0) / mods.length;
        const room = { id: rooms.length, floor: fl.id, name, mods: g, x0, y0, x1, y1, cx, cy, flag: isFlag, spawn: isSpawn0 ? 0 : isSpawn1 ? 1 : null, candidate: false, twinKey, key: g.slice().sort().join("|") };
        rooms.push(room);
        for (const [c, r] of mods) for (let y = r * MOD + 1; y <= r * MOD + MOD - 1; y++) for (let x = c * MOD + 1; x <= c * MOD + MOD - 1; x++) roomOf[(fl.oy + y) * W + fl.ox + x] = room.id;
        for (const [a, b] of mergesFull) if (g.includes(a) && g.includes(b)) { const [c1, r1] = a.split(",").map(Number), [c2] = b.split(",").map(Number); const wx = Math.max(c1, c2) * MOD; for (let y = r1 * MOD + 1; y <= r1 * MOD + MOD - 1; y++) roomOf[(fl.oy + y) * W + fl.ox + wx] = room.id; }
      }
    }
    rooms.forEach(r => { const t = rooms.find(q => q.floor === r.floor && q.key === r.twinKey); r.twin = t ? t.id : r.id; });
    const flagRoom = rooms.find(r => r.flag);
    const flagFl = floorById[flagFloor];
    const flag = { x: flagFl.ox + F[flagFloor].flag.x, y: flagFl.oy + F[flagFloor].flag.y };
    const candidates = [flagRoom.id];
    fakeFloors.forEach((f, i) => { const fl = floorById[f]; const rr = rooms.find(r => r.floor === f && r.mods.includes(key(cc, fakeRows[i]))); if (rr) { rr.candidate = true; rr.fake = i; candidates.push(rr.id); } });
    flagRoom.candidate = true;
    // 旗印を偽の候補部屋に結びつける
    for (const it of items) if (it.kind === "emblem") { const rr = rooms.find(r => r.fake === it.fake); it.eliminates = rr ? rr.id : null; }

    const map = { W, H, rows, floors, portals, traps, items, fogs, locks, mechs, pushes, rooms, roomOf, flag, flagRoom: flagRoom.id, flagFloor, candidates };
    // 開始地点（陣地の中に3つ）
    const f1 = floorById["1F"];
    map.spawn = [
      [2.5, 4.5, 6.5].map(yy => ({ x: f1.ox + 2.5, y: f1.oy + rs * MOD + yy })),
      [2.5, 4.5, 6.5].map(yy => ({ x: f1.ox + FW - 2.5, y: f1.oy + rs * MOD + yy })),
    ];
    // 8) 18m超の射線に遮蔽（柱）を置く
    fixSightlines(map, AX, FW, cc, MOD);
    // 勝利骨格＝独立経路をルート化（先行/索敵/陽動に割り当てる）
    const graph = cellGraph(map);
    map.graph = graph;
    const routes0 = buildRoutes(map, graph, 0, k, rng);
    if (!routes0) return fail("L10");
    map.routes = [routes0, routes0.map(rt => mirrorRoute(map, rt))];
    // ルートの待ち伏せ地点に擬態帯がなければ作る（鏡も）
    for (const rt of map.routes[0]) ensureWait(map, rt);
    map.routes[1] = map.routes[0].map(rt => mirrorRoute(map, rt));
    const castle = {
      v: 1, seed: seedStr, type: T.id, typeName: T.name, typeTheme: T.theme, trapName: T.trapName, trapDesc: T.trapDesc, features: T.features,
      difficulty: diffKey, diffName: P.name, duration: P.duration, overtime: 60, flagInfo: P.flagInfo, paths: k,
      floorsUsed: used, mc: MC, mr: MR, fw: FW, fh: FH, module: MOD, axisOffset: AX,
    };
    return Object.assign(map, { castle });
  }

  // ---------- 部屋グラフ（モジュール単位・鏡を含む）と最大流 ----------
  function moduleGraph(used, F, trans, cc, MR, key) {
    const MC = cc * 2 + 1;
    const nodes = new Map(); let n = 0;
    const fullSet = f => { const s = new Set(); for (const m of F[f].HS) { const [c, r] = m.split(",").map(Number); s.add(key(c, r)); s.add(key(MC - 1 - c, r)); } return s; };
    const rep = {};
    for (const f of used) {
      const par = new Map(); const full = fullSet(f); for (const m of full) par.set(m, m);
      const fnd = x => { while (par.get(x) !== x) x = par.get(x); return x; };
      for (const [a, b] of F[f].merges) { const [c1, r1] = a.split(",").map(Number), [c2, r2] = b.split(",").map(Number); par.set(fnd(a), fnd(b)); par.set(fnd(key(MC - 1 - c1, r1)), fnd(key(MC - 1 - c2, r2))); }
      rep[f] = m => f + ":" + fnd(m);
      for (const m of full) { const id = rep[f](m); if (!nodes.has(id)) nodes.set(id, n++); }
    }
    const edges = [];
    const idOf = (f, m) => nodes.get(rep[f](m));
    for (const f of used) {
      for (const e of F[f].edges) {
        if (e.kind !== "door" && e.kind !== "crawl") continue;
        const [c1, r1] = e.a.split(",").map(Number), [c2, r2] = e.b.split(",").map(Number);
        edges.push([idOf(f, e.a), idOf(f, e.b)]);
        const ma = key(MC - 1 - c1, r1), mb = key(MC - 1 - c2, r2);
        if (!(c1 === cc && c2 === cc)) edges.push([idOf(f, ma), idOf(f, mb)]);
      }
    }
    for (const tr of trans) for (const m of tr.mods) {
      edges.push([idOf(tr.a, key(m.c, m.r)), idOf(tr.b, key(m.c, m.r))]);
      if (!m.axis) edges.push([idOf(tr.a, key(MC - 1 - m.c, m.r)), idOf(tr.b, key(MC - 1 - m.c, m.r))]);
    }
    return { n, edges: edges.filter(([a, b]) => a !== b), nodeOf: (f, c, r) => idOf(f, key(c, r)) };
  }
  function maxFlow(n, edges, s, t, wantPaths) {
    // 無向・容量1 の辺素パス数（Edmonds–Karp）
    const adj = Array.from({ length: n }, () => []);
    const cap = [], to = [];
    const addArc = (u, v) => { to.push(v); cap.push(1); adj[u].push(to.length - 1); };
    for (const [u, v] of edges) { addArc(u, v); addArc(v, u); }
    const rev = i => i ^ 1;
    // 無向辺を2本の弧（相互の逆弧）として扱う
    let flow = 0;
    for (;;) {
      const prev = new Int32Array(n).fill(-1); prev[s] = -2; const q = [s];
      for (let qi = 0; qi < q.length && prev[t] === -1; qi++) { const u = q[qi]; for (const a of adj[u]) if (cap[a] > 0 && prev[to[a]] === -1) { prev[to[a]] = a; q.push(to[a]); } }
      if (prev[t] === -1) break;
      for (let v = t; v !== s;) { const a = prev[v]; cap[a] -= 1; cap[rev(a)] += 1; v = to[rev(a)]; }
      flow++;
    }
    if (!wantPaths) return flow;
    // 流れた弧（元の容量1→0）から経路を取り出す
    const used = new Set(); const paths = [];
    for (let i = 0; i < flow; i++) {
      const path = [s]; let u = s, guard = 0;
      while (u !== t && guard++ < n * 4) {
        const a = adj[u].find(x => cap[x] === 0 && cap[rev(x)] === 2 && !used.has(x));
        if (a == null) break;
        used.add(a); u = to[a]; path.push(u);
      }
      if (u === t) paths.push(path);
    }
    return { flow, paths };
  }
  function roomDegree(Fl, m, trans, f, key) {
    const grp = new Set([m]);
    for (let grew = true; grew;) { grew = false; for (const p of Fl.merges) if (p.some(x => grp.has(x)) && !p.every(x => grp.has(x))) { p.forEach(x => grp.add(x)); grew = true; } }
    let d = Fl.edges.filter(e => e.kind !== "locked" && grp.has(e.a) !== grp.has(e.b)).length;
    for (const tr of trans) if (tr.a === f || tr.b === f) for (const md of tr.mods) if (grp.has(key(md.c, md.r))) d++;
    return d;
  }
  function countRooms(Fl, cc) { return [...Fl.HS].reduce((s, m) => s + (Number(m.split(",")[0]) === cc ? 1 : 2), 0); }

  // ---------- マス単位のグラフ（移動可能・チーム別・上下接続つき） ----------
  function cellGraph(map) {
    const { W, H } = map;
    const portalAt = new Map();
    for (const p of map.portals) portalAt.set(p.cy * W + p.cx, p);
    return { portalAt };
  }
  function walkable(map, x, y, team, opt) {
    if (x < 0 || y < 0 || x >= map.W || y >= map.H) return false;
    const ch = map.rows[y][x];
    if (SOLID_MOVE[ch]) return false;
    if (ch === "m" && opt && opt.mechClosed && opt.mechClosed.has(y * map.W + x)) return false;
    if (team === 0 && ch === "O") return false;
    if (team === 1 && ch === "B") return false;
    if (opt && opt.noTrap && (TRAP_CH[ch])) return false;
    return true;
  }
  // BFS（チーム・仕掛けの状態・罠を避けるか）。距離と前のマスを返す
  function bfs(map, graph, sx, sy, team, opt) {
    const { W, H } = map;
    const dist = new Int32Array(W * H).fill(-1), prev = new Int32Array(W * H).fill(-1);
    const s = sy * W + sx; dist[s] = 0; const q = [s];
    const order = team === 1 ? [[-1, 0], [1, 0], [0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i / W) | 0;
      const p = graph.portalAt.get(i);
      if (p && !(opt && opt.biOnly && p.oneWay)) {
        const j = Math.floor(p.ty) * W + Math.floor(p.tx);
        if (dist[j] < 0 && walkable(map, j % W, (j / W) | 0, team, opt)) { dist[j] = dist[i] + 1; prev[j] = i; q.push(j); }
        continue;   // 上下接続のマスに乗ったら必ず移動する
      }
      for (const [dx, dy] of order) {
        const nx = x + dx, ny = y + dy;
        if (!walkable(map, nx, ny, team, opt)) continue;
        const j = ny * W + nx; if (dist[j] >= 0) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev };
  }
  function turnsOf(map, prev, target) {
    const { W } = map; let turns = 0, lastDir = null, i = target, guard = 0;
    while (prev[i] >= 0 && guard++ < 100000) {
      const j = prev[i]; const dx = (i % W) - (j % W), dy = ((i / W) | 0) - ((j / W) | 0);
      const d = Math.abs(dx) + Math.abs(dy) === 1 ? (dx + "," + dy) : "portal";
      if (d !== "portal" && lastDir && d !== lastDir) turns++;
      if (d !== "portal") lastDir = d; else lastDir = null;
      i = j;
    }
    return turns;
  }
  // 部屋グラフ（アトラス上・通常の扉と双方向の上下接続だけ）
  function roomGraph(map, graph, opt) {
    const { W, H, rows, roomOf } = map;
    const edges = [], seen = new Set(), info = [];
    const add = (a, b, kind, pt) => { if (a < 0 || b < 0 || a === b) return; const k2 = a < b ? a + "-" + b + ":" + kind + ":" + Math.round(pt.x) + "," + Math.round(pt.y) : b + "-" + a + ":" + kind + ":" + Math.round(pt.x) + "," + Math.round(pt.y); if (seen.has(k2)) return; seen.add(k2); edges.push([a, b]); info.push({ a, b, kind, x: pt.x, y: pt.y }); };
    // 扉：部屋に属さない通行可能マスで、両側に別の部屋がある
    const doorSeen = new Set();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (roomOf[i] >= 0) continue;
      const ch = rows[y][x];
      const pass = !SOLID_MOVE[ch] || (opt && opt.withMech && ch === "M");
      if (!pass || ch === "#") continue;
      if (opt && opt.noLocked && ch === "L") continue;
      if (ch === "m" && opt && opt.noMech) continue;
      if (ch === "M" && !(opt && opt.withMech)) continue;
      const hl = roomOf[i - 1], hr = roomOf[i + 1], vu = roomOf[i - W], vd = roomOf[i + W];
      if (hl >= 0 && hr >= 0 && hl !== hr) { const kk = "h" + x + ":" + hl + ":" + hr; if (!doorSeen.has(kk)) { doorSeen.add(kk); const cells = []; for (let yy = y; yy < H && roomOf[yy * W + x] < 0 && !SOLID_MOVE[rows[yy][x]]; yy++) cells.push(yy); add(hl, hr, ch === "u" ? "crawl" : ch === "m" ? "mech" : "door", { x: x + 0.5, y: y + cells.length / 2 }); for (const yy of cells) doorSeen.add("h" + x + ":" + hl + ":" + hr + ":" + yy); } }
      if (vu >= 0 && vd >= 0 && vu !== vd) { const kk = "v" + y + ":" + vu + ":" + vd; if (!doorSeen.has(kk)) { doorSeen.add(kk); const cells = []; for (let xx = x; xx < W && roomOf[y * W + xx] < 0 && !SOLID_MOVE[rows[y][xx]]; xx++) cells.push(xx); add(vu, vd, ch === "u" ? "crawl" : ch === "m" ? "mech" : "door", { x: x + cells.length / 2, y: y + 0.5 }); } }
    }
    const stairSeen = new Set();
    for (const p of map.portals) {
      if (p.oneWay) continue;
      const a = roomOf[p.cy * W + p.cx], b = roomOf[Math.floor(p.ty) * W + Math.floor(p.tx)];
      const fl = map.floors.find(f => f.id === p.floor);
      const sk = Math.min(a, b) + "-" + Math.max(a, b) + "@" + (p.cx - fl.ox) + "," + (p.cy - fl.oy);   // 同じ階段の上り口と降り口＝1本
      if (stairSeen.has(sk)) continue; stairSeen.add(sk);
      add(a, b, "portal:" + p.id, { x: p.x, y: p.y });
    }
    return { edges, info };
  }
  function buildRoutes(map, graph, team, k, rng) {
    const RG = roomGraph(map, graph, { noLocked: true, noMech: true });
    const s = map.rooms.find(r => r.spawn === team), t = map.rooms[map.flagRoom];
    const res = maxFlow(map.rooms.length, RG.edges, s.id, t.id, true);
    if (res.flow < k) return null;
    const routes = [];
    for (const path of res.paths.slice(0, 3)) {
      const pts = [];
      let pre = s.id;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        // この2部屋をつなぐ辺（扉 or 上下接続）を1つ選ぶ
        const cand = RG.info.filter(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
        const e = cand[0];
        if (!e) return null;
        if (e.kind.startsWith("portal:")) {
          const p = map.portals[Number(e.kind.split(":")[1])];
          // 向きを合わせる（a→b に進む方の上下接続を使う）
          const pr = map.roomOf[p.cy * map.W + p.cx] === a ? p : map.portals.find(q => !q.oneWay && map.roomOf[q.cy * map.W + q.cx] === a && map.roomOf[Math.floor(q.ty) * map.W + Math.floor(q.tx)] === b) || p;
          pts.push({ x: pr.x, y: pr.y, stair: true }, { x: pr.tx, y: pr.ty });
        } else pts.push({ x: e.x, y: e.y, door: true });
        if (b !== t.id) pre = b;
      }
      const door = pts[pts.length - 1];
      const approach = pts.length >= 2 ? pts[pts.length - 2] : { x: map.rooms[pre].cx, y: map.rooms[pre].cy };
      routes.push({ pts, pre, door, approach, wait: null });
    }
    while (routes.length < 3) routes.push(routes[routes.length % Math.max(1, routes.length)]);
    return routes.map((r, i) => Object.assign({ id: "r" + i }, r));
  }
  function floorOfX(map, x) { return map.floors.find(fl => x >= fl.ox && x < fl.ox + fl.w) || null; }
  function mirrorPt(map, pt) { const fl = floorOfX(map, pt.x); if (!fl) return Object.assign({}, pt); return Object.assign({}, pt, { x: 2 * fl.ox + fl.w - pt.x }); }
  function mirrorRoute(map, rt) {
    const m = pt => pt ? mirrorPt(map, pt) : null;
    const preRoom = map.rooms[rt.pre];
    return { id: rt.id, pts: rt.pts.map(m), pre: preRoom ? preRoom.twin : rt.pre, door: m(rt.door), approach: m(rt.approach), wait: m(rt.wait) };
  }
  // 待ち伏せ地点：旗の間の手前の部屋にある擬態帯（旗から4.2m以上）。無ければ2×2の擬態帯を作る（鏡も）
  function ensureWait(map, rt) {
    const room = map.rooms[rt.pre]; const { W, rows } = map;
    const isZone = ch => ch === "b" || ch === "s" || ch === "w";
    const far = (x, y) => Math.hypot(x + 0.5 - map.flag.x, y + 0.5 - map.flag.y) > 4.2 || floorOfX(map, x) !== floorOfX(map, map.flag.x);
    let best = null, bd = 1e9;
    const scan = () => { best = null; bd = 1e9; for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) if (map.roomOf[y * W + x] === room.id && isZone(rows[y][x]) && far(x, y)) { const d = Math.hypot(x + 0.5 - rt.door.x, y + 0.5 - rt.door.y); if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; } } };
    scan();
    if (!best) {
      const fl = floorOfX(map, room.x0);
      const ok = (x, y) => map.roomOf[y * W + x] === room.id && rows[y][x] === "." && far(x, y);
      outer: for (let y = room.y0; y < room.y1; y++) for (let x = room.x0; x < room.x1; x++) {
        if (!(ok(x, y) && ok(x + 1, y) && ok(x, y + 1) && ok(x + 1, y + 1))) continue;
        for (const [xx, yy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) { rows[yy][xx] = "w"; const mxx = 2 * fl.ox + fl.w - 1 - xx; if (rows[yy][mxx] === ".") rows[yy][mxx] = "w"; }
        break outer;
      }
      scan();
    }
    rt.wait = best || { x: room.cx, y: room.cy };
  }
  // 射線：18m を超える直線視認があれば柱を置く（鏡の位置にも）
  function fixSightlines(map, AX, FW, cc, MOD) {
    const { W, H, rows } = map;
    const DIRS = 16, STEP = 0.5;
    const blocksLos = ch => ch === "#" || ch === "r" || ch === "t";
    const free = (x, y) => {
      if (!".bsw=q".includes(rows[y][x])) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = rows[y + dy][x + dx];
        if ("^vzSHBO~Lmux".includes(c) || (c !== "." && c !== "#" && !"bsw=qyr".includes(c))) return false;
        if (!SOLID_MOVE[c] && map.roomOf[(y + dy) * W + x + dx] < 0) return false;   // 扉のマスの隣
      }
      if (map.roomOf[y * W + x] < 0) return false;
      if (Math.hypot(x + 0.5 - map.flag.x, y + 0.5 - map.flag.y) < 3.6) return false;
      if (map.rooms.some(r => r.candidate && Math.hypot(x + 0.5 - r.cx, y + 0.5 - r.cy) < 3.6)) return false;   // 偽の候補も本物と同じく中心を空ける（柱で見分けられない）
      if (map.portals.some(p => Math.abs(Math.floor(p.tx) - x) <= 1 && Math.abs(Math.floor(p.ty) - y) <= 1)) return false;   // 着地点（降下口は隣に口が無い）
      if (map.items.some(it => Math.floor(it.x) === x && Math.floor(it.y) === y)) return false;
      return true;
    };
    const longest = () => {
      const out = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (SOLID_MOVE[rows[y][x]] || rows[y][x] === "#") continue;
        for (let d = 0; d < DIRS / 2; d++) {   // 反対向きは相手側から数えるので半分でよい
          const a = d * Math.PI * 2 / DIRS, cx = Math.cos(a), cy = Math.sin(a);
          // 両方向に伸ばした線分の長さ
          let l1 = 0; for (let s = STEP; ; s += STEP) { const px = x + 0.5 + cx * s, py = y + 0.5 + cy * s; if (blocksLos(rows[py | 0][px | 0])) break; l1 = s; }
          let l2 = 0; for (let s = STEP; ; s += STEP) { const px = x + 0.5 - cx * s, py = y + 0.5 - cy * s; if (blocksLos(rows[py | 0][px | 0])) break; l2 = s; }
          if (l1 + l2 > SIGHT_MAX) out.push({ x, y, cx, cy, l1, l2 });
        }
      }
      return out;
    };
    let pillars = 0;
    // 柱を置いても階の中の行き来が切れないか（切れるなら戻す）
    const floorReach = (fl) => {
      let start = -1, total = 0;
      for (let y = fl.oy; y < fl.oy + fl.h; y++) for (let x = fl.ox; x < fl.ox + fl.w; x++) { const ch = rows[y][x]; if (!SOLID_MOVE[ch] && ch !== "m") { total++; if (start < 0) start = y * W + x; } }
      if (start < 0) return true;
      const seen = new Uint8Array(W * H); seen[start] = 1; const q = [start]; let n = 0;
      for (let qi = 0; qi < q.length; qi++) { const i = q[qi]; n++; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * W + x + dx, ch = rows[y + dy][x + dx]; if (!seen[j] && !SOLID_MOVE[ch] && ch !== "m") { seen[j] = 1; q.push(j); } } }
      return n === total;
    };
    const banned = new Set();
    const segD = (px, py, s) => { const ax = s.x + 0.5 - s.cx * s.l2, ay = s.y + 0.5 - s.cy * s.l2, bx = s.x + 0.5 + s.cx * s.l1, by = s.y + 0.5 + s.cy * s.l1; const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy; const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0; return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
    for (let pass = 0; pass < 24; pass++) {
      const v = longest();
      if (!v.length) break;
      const done = new Set(), placed = [];
      for (const s of v) {
        if (placed.some(([px, py]) => segD(px + 0.5, py + 0.5, s) < 1.2)) continue;   // この線はもう遮った
        // 線分の中点付近で柱にできるマスを探す
        const mid = (s.l1 - s.l2) / 2, half = (s.l1 + s.l2) / 2;
        let put = null;
        for (let off = 0; off <= half && !put; off += 0.5) for (const sg of [1, -1]) {
          const t = mid + sg * off, px = Math.floor(s.x + 0.5 + s.cx * t), py = Math.floor(s.y + 0.5 + s.cy * t);
          if (py <= 0 || px <= 0 || py >= H - 1 || px >= W - 1) continue;
          if (!banned.has(px + "," + py) && free(px, py)) { put = [px, py]; break; }
        }
        if (!put) continue;
        const key2 = put[0] + "," + put[1]; if (done.has(key2)) continue; done.add(key2);
        const fl = floorOfX(map, put[0]); const mxx = 2 * fl.ox + fl.w - 1 - put[0];
        const old1 = rows[put[1]][put[0]], old2 = rows[put[1]][mxx];
        rows[put[1]][put[0]] = "r"; if (".bsw=q".includes(old2)) rows[put[1]][mxx] = "r";
        if (!floorReach(fl)) { rows[put[1]][put[0]] = old1; rows[put[1]][mxx] = old2; banned.add(key2); continue; }
        placed.push(put, [mxx, put[1]]);
        pillars++;
      }
      if (!done.size) break;
    }
    map.pillarsAdded = pillars;
  }

  // ---------- 採用条件の自動検証 ----------
  function verify(map) {
    const graph = map.graph || cellGraph(map);
    const { W, H, rows } = map, C = map.castle;
    const k = C.paths;
    const checks = [];
    const add = (id, label, ok, detail) => checks.push({ id, label, ok: !!ok, detail });
    const cellOf = pt => [Math.floor(pt.x), Math.floor(pt.y)];
    const [fx, fy] = cellOf(map.flag);
    const mechCells = g => new Set(map.mechs.filter(m => m.group === g).flatMap(m => m.cells.map(([x, y]) => y * W + x)));
    // 到達可能性：鍵なし（L は閉）・仕掛け扉は位相A/Bの両方
    let reachOK = true; const lens = [[], []]; const turns = [[], []];
    for (const phase of [0, 1]) {
      const closed = mechCells(phase === 0 ? 1 : 0);
      for (const team of [0, 1]) {
        const [sx, sy] = cellOf(map.spawn[team][1]);
        const r = bfs(map, graph, sx, sy, team, { mechClosed: closed, biOnly: true });
        const d = r.dist[fy * W + fx];
        if (d < 0) reachOK = false;
        lens[team].push(d); turns[team].push(turnsOf(map, r.prev, fy * W + fx));
      }
    }
    add("reach", "到達可能性", reachOK, `両陣営→旗 最短 ${lens[0].join("/")}・${lens[1].join("/")} マス（仕掛け扉の位相A/B）`);
    const diffPct = Math.max(...lens[0].map((d, i) => Math.abs(d - lens[1][i]) / Math.max(1, Math.min(d, lens[1][i])))) * 100;
    const turnDiff = Math.max(...turns[0].map((t, i) => Math.abs(t - turns[1][i])));
    add("fair", "公平性", diffPct <= 5 && turnDiff <= 1, `最短移動の差 ${diffPct.toFixed(1)}%・曲がり角の差 ${turnDiff}`);
    // 独立経路
    const RG = roomGraph(map, graph, { noLocked: true, noMech: true });
    const fl0 = maxFlow(map.rooms.length, RG.edges, map.rooms.find(r => r.spawn === 0).id, map.flagRoom);
    const fl1 = maxFlow(map.rooms.length, RG.edges, map.rooms.find(r => r.spawn === 1).id, map.flagRoom);
    add("paths", "独立経路", fl0 >= k && fl1 >= k, `辺素な経路 青${fl0}・橙${fl1}（必要 ${k}）`);
    // 上下移動：各使用階に入口・出口が2つ以上
    const vert = map.floors.map(fl => {
      const out = map.portals.filter(p => p.floor === fl.id && !p.oneWay).length;
      const inn = map.portals.filter(p => p.toFloor === fl.id && !p.oneWay).length;
      return { id: fl.id, out, inn };
    });
    add("vertical", "上下移動", vert.every(v => v.out >= 2 && v.inn >= 2), vert.map(v => `${v.id}:入${v.inn}/出${v.out}`).join(" "));
    // 袋小路
    const RGall = roomGraph(map, graph, {});
    const deg = new Array(map.rooms.length).fill(0);
    for (const [a, b] of RGall.edges) { deg[a]++; deg[b]++; }
    const dead = map.rooms.filter(r => deg[r.id] <= 1 && r.spawn == null);
    const hasFeature = r => {
      for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) { const ch = rows[y] && rows[y][x]; if (ch === "S" || ch === "H" || ch === "x") return true; }
      return map.items.some(it => it.x >= r.x0 && it.x <= r.x1 + 1 && it.y >= r.y0 && it.y <= r.y1 + 1);
    };
    const deadBad = dead.filter(r => !hasFeature(r));
    const deadLimit = Math.ceil(map.rooms.length * 0.35);
    add("deadend", "袋小路", deadBad.length === 0 && dead.length <= deadLimit, `袋小路 ${dead.length}室（上限 ${deadLimit}）・目的なし ${deadBad.length}室`);
    // 射線
    const losClear = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), n = Math.ceil(len / 0.2); for (let i = 1; i < n; i++) { const t = i / n; const ch = rows[(a.y + dy * t) | 0][(a.x + dx * t) | 0]; if (SOLID_LOS[ch]) return false; } return true; };
    let spawnLos = false;
    for (const a of map.spawn[0]) { for (const b of map.spawn[1]) if (losClear(a, b)) spawnLos = true; if (losClear(a, map.flag)) spawnLos = true; }
    for (const b of map.spawn[1]) if (losClear(b, map.flag)) spawnLos = true;
    let longCount = 0;
    {
      const DIRS = 16, STEP = 0.5, blocks = ch => ch === "#" || ch === "r" || ch === "t";
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (SOLID_MOVE[rows[y][x]]) continue;
        for (let d = 0; d < DIRS / 2; d++) {
          const a = d * Math.PI * 2 / DIRS, cx = Math.cos(a), cy = Math.sin(a);
          let l = 0; for (let s = STEP; ; s += STEP) { if (blocks(rows[(y + 0.5 + cy * s) | 0][(x + 0.5 + cx * s) | 0])) break; l = s; }
          let l2 = 0; for (let s = STEP; ; s += STEP) { if (blocks(rows[(y + 0.5 - cy * s) | 0][(x + 0.5 - cx * s) | 0])) break; l2 = s; }
          if (l + l2 > SIGHT_MAX) longCount++;
        }
      }
    }
    add("sight", "射線", !spawnLos && longCount === 0, `開始地点どうし・開始地点と旗の直線視認 ${spawnLos ? "あり" : "なし"}／18m超の射線 ${longCount}本（柱 ${map.pillarsAdded || 0}本を追加）`);
    // 罠：避けて全部屋・旗へ行ける／環境ダメージは HP1 未満にしない（ルール側）
    let trapOK = true;
    for (const team of [0, 1]) {
      const [sx, sy] = cellOf(map.spawn[team][1]);
      const a = bfs(map, graph, sx, sy, team, { mechClosed: mechCells(1), biOnly: true });
      const b = bfs(map, graph, sx, sy, team, { mechClosed: mechCells(1), biOnly: true, noTrap: true });
      if (b.dist[fy * W + fx] < 0) trapOK = false;
      const anyIn = (res, r, skipTrap) => { for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = y * W + x; if (map.roomOf[i] !== r.id) continue; if (skipTrap && TRAP_CH[rows[y][x]]) continue; if (res.dist[i] >= 0) return true; } return false; };
      for (const r of map.rooms) { if (r.spawn === 1 - team) continue; if (anyIn(a, r, false) && !anyIn(b, r, true)) trapOK = false; }
    }
    add("trap", "罠", trapOK && map.traps.every(t => t.kind), `罠 ${map.traps.length}マス＋押し壁 ${map.pushes.length}か所・すべて予告つきで迂回できる`);
    // 復帰：陣地があり、敵は入れない
    const baseCells = [0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (rows[y][x] === "B") baseCells[0]++; if (rows[y][x] === "O") baseCells[1]++; }
    let invade = false;
    for (const team of [0, 1]) {
      const [sx, sy] = cellOf(map.spawn[1 - team][1]);
      const r = bfs(map, graph, sx, sy, 1 - team, { mechClosed: new Set(), biOnly: false });
      for (let i = 0; i < W * H; i++) if (r.dist[i] >= 0 && rows[(i / W) | 0][i % W] === (team === 0 ? "B" : "O")) invade = true;
    }
    add("recover", "復帰", baseCells[0] > 0 && baseCells[1] > 0 && !invade, `陣地 ${baseCells[0]}/${baseCells[1]}マス・敵の侵入 ${invade ? "あり" : "なし"}（露見から12秒で自動帰還）`);
    add("mech", "絡繰変更", reachOK, `仕掛け扉 ${map.mechs.length}組・どの位相でも旗へ行ける（敷居に人がいる間は切替を延期＝ルール側）`);
    // 旗室
    const fr = map.rooms[map.flagRoom];
    let camoNear = 0, trapNear = 0;
    for (let y = fr.y0 - 4; y <= fr.y1 + 4; y++) for (let x = fr.x0 - 4; x <= fr.x1 + 4; x++) {
      const ch = rows[y] && rows[y][x]; if (!ch) continue;
      if ("bsw".includes(ch) && Math.hypot(x + 0.5 - map.flag.x, y + 0.5 - map.flag.y) < 3) camoNear++;
      if ((TRAP_CH[ch] || ch === "z") && (map.roomOf[y * W + x] === fr.id)) trapNear++;
    }
    const entr = RG.info.filter(e => e.a === fr.id || e.b === fr.id).length;
    add("flagroom", "旗室", camoNear === 0 && trapNear === 0 && entr >= 2, `擬態帯(3m内) ${camoNear}・罠/落下 ${trapNear}・侵入口 ${entr}`);
    return { ok: checks.every(c => c.ok), checks };
  }

  // ---------- 公開の入口 ----------
  // opts: { seed, difficulty, type }（type を省略すると seed から決める）
  function generate(opts) {
    const diff = DIFF[opts && opts.difficulty] ? opts.difficulty : "normal";
    const base = String((opts && opts.seed) || "castle");
    const type = (opts && opts.type) || TYPES[Math.floor(makeRng("type:" + base)() * TYPES.length)].id;
    let lastErr = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const s = attempt ? base + "#" + attempt : base;
      let m = null;
      try { m = build(s, diff, type); } catch (e) { lastErr = e; m = null; }
      if (!m) continue;
      const v = verify(m);
      if (!v.ok) continue;
      m.castle.attempt = attempt; m.castle.baseSeed = base; m.verify = v;
      return m;
    }
    throw new Error("castle generation failed: " + (lastErr ? lastErr.message : "no valid seed"));
  }
  return { _build: build, _lastFail: () => lastFail, generate, verify, drawType, makeRng, TYPES, DIFF, FLOORS, FLOOR_LABEL, FLOOR_TITLE, MODULES, SOLID_MOVE, SOLID_LOS, TRAP_CH, MOD };
})();
if (typeof module !== "undefined") module.exports = Castle;
