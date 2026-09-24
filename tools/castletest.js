// 城ダンジョン生成（castle.js）の検査。設計図 docs/castle-dungeon-blueprint.txt の受け入れ条件10項目＋再現性・左右対称・城型の巡回
//   node ninsai-kakurenbo/tools/castletest.js [seeds=40]
const Castle = require("../castle.js");
const Sim = require("../sim.js");
const N = +process.argv[2] || 40;
let pass = 0, fail = 0;
const ng = [];
const ok = (c, m) => { if (c) pass++; else { fail++; if (ng.length < 30) ng.push(m); } };

const DIFS = ["easy", "normal", "hard"];
const TYPES = Castle.TYPES.map(t => t.id);
const MIRROR = { B: "O", O: "B" };
const stats = {};
for (const dif of DIFS) {
  const D = Castle.DIFF[dif];
  const st = stats[dif] = { n: 0, ms: [], maxMs: 0, attempts: 0, floors: {}, rooms: [], fails: {} };
  for (let i = 0; i < N; i++) {
    const type = TYPES[i % TYPES.length];
    const seed = `castletest:${dif}:${i}`;
    const t0 = process.hrtime.bigint();
    const m = Castle.generate({ seed, difficulty: dif, type });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    st.n++; st.ms.push(ms); st.maxMs = Math.max(st.maxMs, ms);
    const tag = `${dif}/${type}/${i}`;
    ok(!!m, `${tag}: 生成できない（${Castle._lastFail && Castle._lastFail()}）`);
    if (!m) continue;
    const C = m.castle;
    st.attempts += C.attempt;
    // 受け入れ条件10項目
    const v = Castle.verify(m);
    ok(v.ok, `${tag}: 検査NG ${v.checks.filter(c => !c.ok).map(c => c.id + "(" + c.detail + ")").join(" / ")}`);
    for (const c of v.checks) if (!c.ok) st.fails[c.id] = (st.fails[c.id] || 0) + 1;
    ok(v.checks.length === 10, `${tag}: 検査項目が10でない（${v.checks.length}）`);
    // 城型・難易度・制限時間（勝利条件・HPは難易度で変えない＝地形と情報と時間だけ）
    ok(C.type === type, `${tag}: 城型が指定と違う ${C.type}`);
    ok(C.duration === D.duration && C.flagInfo === D.flagInfo && C.paths === D.paths, `${tag}: 難易度の定数が違う`);
    // 使用階
    const fl = C.floorsUsed;
    st.floors[fl.length] = (st.floors[fl.length] || 0) + 1;
    ok(fl.length >= D.floors[0] && fl.length <= D.floors[1], `${tag}: 階数 ${fl.length} が範囲外 ${D.floors}`);
    ok(fl.includes("1F"), `${tag}: 1F（開始階）がない`);
    if (dif === "hard") ok(fl.includes("5F"), `${tag}: てごわいに5Fがない`);
    if (dif === "easy") ok(fl.join() === "B1,1F,2F", `${tag}: やさしいの階が B1/1F/2F でない（${fl}）`);
    ok(fl.every(f => Castle.FLOORS.includes(f)) && fl.every((f, k) => k === 0 || Castle.FLOORS.indexOf(f) > Castle.FLOORS.indexOf(fl[k - 1])), `${tag}: 階の並びがおかしい ${fl}`);
    ok(m.flagFloor !== undefined && fl.includes(m.flagFloor), `${tag}: 旗の階が使用階にない`);
    // 部屋数（1階あたり）
    for (const f of m.floors) {
      const n = m.rooms.filter(r => r.floor === f.id).length;
      st.rooms.push(n);
      ok(n >= D.rooms[0] && n <= D.rooms[1], `${tag}: ${f.id} の部屋数 ${n} が範囲外 ${D.rooms}`);
    }
    // 左右対称（陣地 B/O だけ入れ替わる）
    let asym = 0;
    for (const f of m.floors) for (let y = f.oy; y < f.oy + f.h; y++) for (let x = 0; x < f.w; x++) {
      const a = m.rows[y][f.ox + x], b = m.rows[y][f.ox + f.w - 1 - x];
      if ((MIRROR[a] || a) !== b) asym++;
    }
    ok(asym === 0, `${tag}: 左右対称でないマス ${asym}`);
    // 開始地点は鏡像
    ok(m.spawn[0].length === 3 && m.spawn[1].length === 3, `${tag}: 開始地点が3つずつない`);
    // 旗候補（てごわい＝3室。本物を含む）
    if (dif === "hard") ok(m.candidates.length === 3 && m.candidates.includes(m.flagRoom), `${tag}: 旗候補が3室でない/本物を含まない`);
    // 経路（役割ごと：先行・索敵・陽動）
    ok(m.routes[0].length >= D.paths && m.routes[1].length === m.routes[0].length, `${tag}: ルート数 ${m.routes[0].length}（必要 ${D.paths}）`);
    // 鍵は任意目標：鍵の扉をすべて閉じても旗へ行ける（verify の reach が L を閉として計算済み）→ 鍵の扉が必須経路に無いこと
    // レビューの回帰（2026-09-25）
    const SOLIDM = Castle.SOLID_MOVE;
    // ・降下口・階段の着地点に柱や壁が無い（閉じ込められない）
    const badLand = m.portals.filter(pt => SOLIDM[m.rows[Math.floor(pt.ty)][Math.floor(pt.tx)]]);
    ok(badLand.length === 0, `${tag}: 着地点が壁の中 ${badLand.map(pt => pt.kind + "@" + pt.tx + "," + pt.ty).join(" ")}`);
    // ・スイッチ S はどれも鍵の扉を開ける（軸の上の扉は両側のスイッチで）
    let swBad = 0;
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.rows[y][x] === "S" && !m.locks.some(l => (l.sws || []).some(sw => sw[0] === x && sw[1] === y))) swBad++;
    ok(swBad === 0, `${tag}: 扉につながらないスイッチ ${swBad}`);
    // ・軸の列の急流は縦向き（横向きだと両チームとも同じ側へ流される）
    const axCur = m.traps.filter(t => t.kind === "current" && t.dir && t.dir[0] !== 0 && m.floors.some(f => f.id === t.floor && t.cx - f.ox === (f.w - 1) / 2));
    ok(axCur.length === 0, `${tag}: 軸の上の横向きの急流 ${axCur.length}`);
    // ・候補の間（本物・偽）は同じ見た目：中心3.2m以内に柱・擬態帯なし・階段なし
    if (dif === "hard") for (const rid of m.candidates) {
      const r = m.rooms[rid];
      let tell = 0;
      for (let y = Math.floor(r.cy - 4); y <= r.cy + 4; y++) for (let x = Math.floor(r.cx - 4); x <= r.cx + 4; x++) if (Math.hypot(x + 0.5 - r.cx, y + 0.5 - r.cy) <= 3.2 && "rbsw".includes(m.rows[y][x])) tell++;
      const stair = m.portals.some(pt => m.roomOf[pt.cy * m.W + pt.cx] === r.id);
      ok(tell === 0 && !stair, `${tag}: 候補の間 ${r.floor} に目印（柱/擬態帯 ${tell}・階段 ${stair}）`);
    }
    // 再現性：同じ seed なら同じ城
    if (i < 6) {
      const m2 = Castle.generate({ seed, difficulty: dif, type });
      ok(m2 && m2.rows.map(r => r.join("")).join("\n") === m.rows.map(r => r.join("")).join("\n") && m2.flagRoom === m.flagRoom, `${tag}: 同じ seed で城が変わる`);
    }
    // seed が違えば城も変わる
    if (i < 6) {
      const m3 = Castle.generate({ seed: seed + ":other", difficulty: dif, type });
      ok(m3 && m3.rows.map(r => r.join("")).join("") !== m.rows.map(r => r.join("")).join(""), `${tag}: seed を変えても同じ城`);
    }
  }
}
// 城型のシャッフルバッグ：直前と同じ城を引かない・5回で5種類を一巡
{
  let bag = [], last = null, run = [];
  let repeat = 0, cycleBad = 0;
  for (let i = 0; i < 200; i++) {
    const r = Castle.drawType(bag, last, "bagtest:" + i);
    if (r.type === last) repeat++;
    run.push(r.type);
    if (run.length === 5) { if (new Set(run).size !== 5) cycleBad++; run = []; }
    bag = r.bag; last = r.type;
  }
  ok(repeat === 0, `城型が2回続けて出た（${repeat}回）`);
  ok(cycleBad === 0, `5回で5種類を一巡しない（${cycleBad}回）`);
}
// エンジンに載せる：試合が作れて、敵陣は通れない・情報の公開量が難易度どおり
for (const dif of DIFS) {
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ id: `p${t}${i}`, team: t, char: t * 3 + i, bot: true, role: ["vanguard", "scout", "decoy"][i], slot: i });
  const g = Sim.createMatch({ players, seed: 7, difficulty: dif, briefing: false, castle: { seed: "castletest:sim:" + dif, difficulty: dif } });
  ok(g.map && g.map.kind === "castle", `${dif}: 試合に城が載らない`);
  ok(g.duration === Castle.DIFF[dif].duration && g.time === g.duration, `${dif}: 制限時間が難易度どおりでない（${g.duration}）`);
  const I = g.intel[0];
  if (dif === "easy") ok(I.known && I.floorKnown, `${dif}: やさしいで旗が最初から分からない`);
  if (dif === "normal") ok(!I.known && I.floorKnown, `${dif}: ふつうの旗情報（階だけ）が違う`);
  if (dif === "hard") ok(!I.known && I.candidates.length === 3, `${dif}: てごわいの候補3室が違う`);
  // 同じ spec なら端末とサーバーで同じ城（オンライン：開始時に spec を配る）
  const m2 = Sim.castleMap({ seed: "castletest:sim:" + dif, difficulty: dif, type: g.map.castle.type });
  ok(m2.rows.map(r => r.join("")).join("") === g.map.rows.map(r => r.join("")).join(""), `${dif}: 同じ spec で端末とサーバーの城が一致しない`);
  // 再戦で別の城になる
  const before = g.map.rows.map(r => r.join("")).join("");
  Sim.resetForRematch(g, false);
  ok(g.map.kind === "castle" && g.map.rows.map(r => r.join("")).join("") !== before, `${dif}: 再戦で城が変わらない`);
  // 押し壁は鏡の相方と同じ時刻に動く
  const pwKey = pw => { const fl = g.map.floors.find(f => f.id === pw.floor), x0 = pw.cells[0][0] - fl.ox; return pw.floor + ":" + Math.min(x0, fl.w - 1 - x0) + ":" + pw.cells[0][1]; };
  const phase = new Map(); let pwBad = 0;
  for (const pw of g.map.pushes) { const k = pwKey(pw); if (phase.has(k) && phase.get(k) !== pw.next) pwBad++; phase.set(k, pw.next); }
  ok(pwBad === 0, `${dif}: 左右の押し壁の時刻がずれる ${pwBad}`);
  // 30秒ぶん動かして例外が出ない
  g.phase = "playing";
  let err = null;
  try { for (let k = 0; k < 30 * 30; k++) Sim.step(g); } catch (e) { err = e; }
  ok(!err, `${dif}: 試合を進めると例外 ${err && err.stack}`);
}

// 伏せた旗が漏れない：旗の4m以内で居座る敵の波紋・レベルアップの輪（ふつう＝旗の部屋は伏せてある）
{
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ id: `q${t}${i}`, team: t, char: t * 3 + i, bot: false, role: ["vanguard", "scout", "decoy"][i], slot: i });
  const g = Sim.createMatch({ players, seed: 5, difficulty: "normal", briefing: false, castle: { seed: "castletest:leak", difficulty: "normal" } });
  g.phase = "playing";
  const F = g.map.flag, enemy = g.players.find(p => p.team === 1);
  let spot = null;
  for (let d = 2.2; d <= 3.4 && !spot; d += 0.4) for (let a = 0; a < 6.28 && !spot; a += 0.3) { const x = F.x + Math.cos(a) * d, y = F.y + Math.sin(a) * d; if (!Sim.SOLID[g.map.rows[y | 0][x | 0]] && Sim.floorAt(x, y) === Sim.floorAt(F.x, F.y)) spot = { x, y }; }
  enemy.x = enemy.px = spot.x; enemy.y = enemy.py = spot.y; enemy.protect = 0;
  for (let k = 0; k < 30 * 9; k++) { for (const p of g.players) Sim.setInput(p, { x: 0, y: 0, actions: [] }); Sim.step(g); }
  const blue = g.players.find(p => p.team === 0);
  ok(!g.intel[0].known && enemy.pulse, `波紋の前提（青は旗を知らない・橙が波紋）: known=${g.intel[0].known} pulse=${enemy.pulse}`);
  const snap = Sim.snapshot(g, blue.id);
  ok(!snap.players.some(p => p.pulseOnly), "旗を知らないチームに敵の波紋を送らない");
  ok(!g.log.filter(l => l.type === "pulse").some(l => Sim.logVisible(g, blue.id, l)), "旗を知らないチームに敵の波紋のログを送らない");
  // レベルアップの輪は旗の位置に出さない
  g.xp[1] = 79; Sim.addXp(g, 1, 5, "test");
  const lv = g.effects.filter(e => e.type === "levelup");
  ok(lv.every(e => Math.hypot(e.x - F.x, e.y - F.y) > 0.01), `レベルアップの輪が旗の位置に出ない（${lv.length}件）`);
}
for (const dif of DIFS) {
  const s = stats[dif];
  const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  console.log(`${Castle.DIFF[dif].name}: ${s.n}城・生成 平均${avg(s.ms).toFixed(0)}ms 最大${s.maxMs.toFixed(0)}ms・作り直し 平均${(s.attempts / s.n).toFixed(1)}回・階数 ${JSON.stringify(s.floors)}・1階の部屋 ${Math.min(...s.rooms)}〜${Math.max(...s.rooms)}${Object.keys(s.fails).length ? "・NG " + JSON.stringify(s.fails) : ""}`);
}
for (const m of ng) console.log("NG:", m);
console.log(`castletest: OK ${pass} / NG ${fail}`);
process.exit(fail ? 1 : 0);
