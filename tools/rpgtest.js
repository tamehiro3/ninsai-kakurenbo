// HP・露見・手当・経験値・レベル・系統・奥義・固有技39種の決定論テスト（設計図2枚に沿う）
//   node ninsai-kakurenbo/tools/rpgtest.js
const path = require("path");
const Sim = require(path.join(__dirname, "..", "sim.js"));
const D = Sim.D, R = Sim.R;
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("NG:", msg); } };
function mk(chars, opts) {
  const roles = ["vanguard", "scout", "decoy"];
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ id: `t${t}_${i}`, team: t, char: chars ? chars[t * 3 + i] : (i + t) % 3, bot: false, role: roles[i], slot: i });
  const g = Sim.createMatch(Object.assign({ players, seed: 7, difficulty: "normal", briefing: false }, opts || {}));
  g.phase = "playing"; g.timer = 0; g.noTimer = true;
  for (const p of g.players) { p.protect = 0; }
  return g;
}
const steps = (g, n) => { for (let i = 0; i < n; i++) Sim.step(g); };
const place = (p, x, y, a) => { p.x = x; p.y = y; p.px = x; p.py = y; if (a != null) p.angle = a; p.protect = 0; };
const idle = g => { for (const p of g.players) Sim.setInput(p, { x: 0, y: 0, actions: [] }); };
const findZone = () => { for (let x = 10; x < 30; x += 0.5) for (let y = 8; y < 40; y += 0.5) if (Sim.zoneAt(x, y) && !Sim.blocked(x, y, R.bodyRadius, 0)) return [x, y]; return null; };
const idx = id => D.CHARS.findIndex(c => c.id === id);

// 1) 被弾ダメージと露見
{
  const g = mk([1, 1, 1, 1, 1, 1]); // 咲耶（攻3防3）同士 → 34ダメージ
  const a = g.players[0], b = g.players[3];
  place(a, 20, 24, 0); place(b, 24, 24, Math.PI);
  idle(g);
  const hp0 = b.hp;
  Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  ok(b.hp === hp0 - 34, `基本ダメージ34: ${hp0}→${b.hp}`);
  ok(b.reveal > 0 && b.invuln <= 0 && b.slow > 0, "被弾で発見3秒・減速1秒・無敵0.6秒は切れている");
  a.shotCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  a.shotCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  ok(b.hp === 0 && b.exposed > 10.5 && b.exposed <= 12, `3発で露見12秒: hp=${b.hp} exposed=${b.exposed.toFixed(1)}`);
  ok(Sim.enemyView(a, b) === "revealed", "露見中は敵から常時見える");
  // 露見中は動きが70%・行動不可
  Sim.setInput(b, { x: -1, y: 0, actions: ["camo", "shot", "scan", "claim"] }); steps(g, 30);
  ok(Math.abs(b.speedNow - R.speed * b.bal.speedMul * 0.7) < 0.15, `露見中の移動は本人の速さの70%: ${b.speedNow.toFixed(2)}`);
  // 露見中の相手には印が当たらない（露見12秒・手当の進みがリセットされない）
  const ex0 = b.exposed; a.shotCd = 0; place(a, b.x + 4, b.y, Math.PI); Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); Sim.setInput(b, { x: 0, y: 0, actions: [] }); steps(g, 20);
  ok(b.exposed < ex0 && b.stats.hp0 === 1 && g.xp[0] === 3 * 3 + 12, `露見中は的にならない: exposed ${ex0.toFixed(1)}→${b.exposed.toFixed(1)} hp0=${b.stats.hp0} xp=${g.xp[0]}`);
  { const far = g.players[1]; place(far, 4, 21, 0); const rv = b.reveal; b.reveal = 0; ok(Sim.enemyView(far, b) !== "revealed" && Sim.enemyView(a, b) === "revealed", "露見中は射線内の敵にだけ見える（被弾の3秒可視化が切れたあとは全体公開しない）"); b.reveal = rv; }
  ok(b.camo === 0 && g.shots.length === 0, "露見中は擬態・印投げ不可");
  ok(g.xp[0] === 3 * 3 + 12 && g.xp[1] === 0, `XP: 有効な一撃+3×3＋HP0+12 = ${g.xp[0]}`);
  // 手当：味方が1.5m以内で静止3秒
  const c = g.players[4]; place(c, b.x + 1, b.y, 0); idle(g);
  steps(g, 30 * 3 + 2);
  ok(b.exposed === 0 && b.hp === 35, `手当で復帰HP35: exposed=${b.exposed} hp=${b.hp}`);
  ok(g.xp[1] === 10, `手当復帰でXP+10: ${g.xp[1]}`);
  ok(c.stats.heals === 1 && b.stats.hp0 === 1, "統計 heals/hp0");
}
// 2) 自陣で全回復・12秒で自動帰還
{
  const g = mk([1, 1, 1, 1, 1, 1]);
  const b = g.players[3]; idle(g);
  b.hp = 0; b.exposed = 12;
  place(b, 60, 24, 0); steps(g, 5);
  ok(b.exposed === 0 && b.hp === b.hpMax, `自陣に入ると全回復: hp=${b.hp}`);
  const c = g.players[4]; c.hp = 0; c.exposed = 12; place(c, 30, 30, 0); steps(g, 30 * 12 + 2);
  ok(c.returning > 0 && c.exposed === 0 && c.hp === c.hpMax, `12秒で自動帰還→全回復: returning=${c.returning.toFixed(1)} hp=${c.hp}`);
}
// 3) HP30未満は擬態不可
{
  const g = mk([1, 1, 1, 1, 1, 1]); idle(g);
  const a = g.players[0];
  const zx = findZone();
  place(a, zx[0], zx[1], 0); a.hp = 29;
  Sim.setInput(a, { x: 0, y: 0, actions: ["camo"] }); steps(g, 40);
  ok(a.camo === 0, "HP29では擬態できない");
  a.hp = 30; Sim.setInput(a, { x: 0, y: 0, actions: ["camo"] }); steps(g, 40);
  ok(a.camo === 2, "HP30なら擬態できる");
}
// 4) 経験値→レベル→系統選択→HP上限
{
  const g = mk([1, 1, 1, 1, 1, 1]); idle(g);
  const a = g.players[0];
  Sim.addXp(g, 0, 80, "test"); steps(g, 1);
  ok(g.level[0] === 2 && a.pendingLevel === 2 && a.hpMax === 105 && a.hp === 105, `Lv2でHP上限105（満タンは追随）: lv=${g.level[0]} hpMax=${a.hpMax} hp=${a.hp}`);
  Sim.setInput(a, { x: 0, y: 0, actions: ["tree:技"] }); steps(g, 1);
  ok(a.perks[2] === "技" && a.pendingLevel === 0, "系統を選べる");
  Sim.addXp(g, 0, 120, "test"); steps(g, 30 * 5 + 2);
  ok(g.level[0] === 3 && a.perks[3] === "技" && a.pendingLevel === 0, `5秒で推奨系統（咲耶＝技）が自動選択: ${JSON.stringify(a.perks)}`);
  Sim.addXp(g, 0, 160, "test"); steps(g, 1); Sim.setInput(a, { x: 0, y: 0, actions: ["tree:護"] }); steps(g, 1);
  Sim.addXp(g, 0, 200, "test"); steps(g, 1); Sim.setInput(a, { x: 0, y: 0, actions: ["tree:影"] }); steps(g, 1);
  ok(g.level[0] === 5 && a.hpMax === 120 && a.perks[5] === "影", `Lv5・HP120・系統は各レベル別々に選べる: ${JSON.stringify(a.perks)}`);
  Sim.addXp(g, 0, 999, "test"); ok(g.xp[0] === 560, `Lv5以上は経験値が増えない: ${g.xp[0]}`);
  // 技Lv2 早印：印CD −0.15
  place(a, 20, 24, 0);
  Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 1);
  ok(Math.abs(a.shotCd - (R.shotCooldown - 0.15 - 1 / 30)) < 0.05, `技Lv2で印CD-0.15: ${a.shotCd.toFixed(2)}`);
  // 奥義（影）：擬態中でないと使えない → 擬態中なら5秒間0.7倍速で動ける
  Sim.setInput(a, { x: 0, y: 0, actions: ["ult"] }); steps(g, 1);
  ok(!a.ult.used, "影の奥義は擬態中でないと使えない");
  const zx = findZone();
  place(a, zx[0], zx[1], 0); a.hp = 120; a.reveal = 0; a.camoCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["camo"] }); steps(g, 40);
  ok(a.camo === 2, "擬態成立");
  Sim.setInput(a, { x: 0, y: 0, actions: ["ult"] }); steps(g, 1);
  ok(a.ult.used && a.ult.active > 4.9, "影渡り発動（一試合一度）");
  Sim.setInput(a, { x: 1, y: 0, actions: [] }); steps(g, 3);
  ok(a.camo === 2 && Math.abs(a.speedNow - R.speed * 0.7) < 0.25, `影渡り中は擬態のまま70%速: camo=${a.camo} v=${a.speedNow.toFixed(2)}`);
}
// 5) 技の奥義（再演）・護の奥義（不退陣）
{
  const g = mk([1, 1, 1, 1, 1, 1]); idle(g);
  const a = g.players[0], m = g.players[1], e = g.players[3];
  for (const lv of [2, 3, 4, 5]) { Sim.addXp(g, 0, [80, 120, 160, 200][lv - 2], "t"); steps(g, 1); Sim.setInput(a, { x: 0, y: 0, actions: ["tree:技"] }); Sim.setInput(m, { x: 0, y: 0, actions: ["tree:護"] }); steps(g, 1); }
  ok(a.perks[5] === "技" && m.perks[5] === "護", `2人が別々の系統: ${JSON.stringify(a.perks)} ${JSON.stringify(m.perks)}`);
  place(a, 20, 24, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1);
  ok(a.skillCd > 0 && Math.abs(a.skillCd - 22 * 0.85) < 0.1, `技Lv4で固有技CD-15%: ${a.skillCd.toFixed(2)}（咲耶22秒）`);
  Sim.setInput(a, { x: 0, y: 0, actions: ["ult"] }); steps(g, 1);
  ok(a.ult.used && a.skillCd === 0, `再演で固有技CDが即回復: ${a.skillCd}`);
  // 護：不退陣 8秒・4m以内の味方の被ダメ−12%
  place(m, 20, 26, 0); place(e, 24, 26, Math.PI); Sim.setInput(m, { x: 0, y: 0, actions: ["ult"] }); steps(g, 1);
  ok(m.ult.used && m.ult.active > 7.9, "不退陣発動");
  place(a, 20, 24, 0); place(e, 24, 24, Math.PI); a.invuln = 0;
  const hp0 = a.hp; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  ok(hp0 - a.hp === 30, `不退陣で味方の被ダメ-12%（34→30）: ${hp0 - a.hp}`);
}
// 6) 能力値係数（速さ・攻撃・防御）
{
  const g = mk([idx("dan"), 1, 1, idx("ganzi"), idx("kanaoni"), 1]); idle(g);
  const dan = g.players[0], ganzi = g.players[3], kana = g.players[4];
  place(dan, 20, 24, 0); Sim.setInput(dan, { x: 1, y: 0, actions: [] }); steps(g, 3);
  ok(Math.abs(dan.speedNow - R.speed * 1.12) < 0.1, `断（速さ5）は1.12倍: ${dan.speedNow.toFixed(2)}`);
  place(ganzi, 30, 38, 0); Sim.setInput(ganzi, { x: 1, y: 0, actions: [] }); steps(g, 3);
  ok(Math.abs(ganzi.speedNow - R.speed * 0.94) < 0.1, `岩爺（速さ2）は0.94倍: ${ganzi.speedNow.toFixed(2)}`);
  // 金鬼（攻5）→ 咲耶（防3）：34×1.24=42
  const s = g.players[1]; place(dan, 12, 42, 0); place(s, 20, 24, 0); place(kana, 24, 24, Math.PI); idle(g);
  const h0 = s.hp; Sim.setInput(kana, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  ok(h0 - s.hp === 42, `攻撃5→防御3は42ダメージ: ${h0 - s.hp}`);
  // 咲耶（攻3）→ 金鬼（防5）：34×0.84=29
  const h1 = kana.hp; kana.invuln = 0; place(s, 20, 24, 0); place(kana, 24, 24, Math.PI); Sim.setInput(s, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
  ok(h1 - kana.hp === 29, `攻撃3→防御5は29ダメージ: ${h1 - kana.hp}`);
}
// 7) 39種の固有技：例外なく発動し、CDが回る
{
  const kinds = {};
  for (let i = 0; i < D.CHARS.length; i++) {
    const g = mk([i, 1, 1, (i + 1) % 39, 1, 1]); idle(g);
    const a = g.players[0], e = g.players[3], m = g.players[1];
    place(a, 22, 38, 0); place(e, 26, 38, Math.PI); place(m, 21, 39, 0);
    e.reveal = 3; // 呪標などの対象が要る技のため
    m.hp = 50; a.hp = 80; // 犠牲/浄化系
    if (D.CHARS[i].skill.kind === "soul_return") m.returning = 2.5;
    let err = null;
    try {
      Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 4);
      Sim.setInput(a, { x: 1, y: 0, actions: ["shot"] }); steps(g, 30 * 3);
      Sim.setInput(e, { x: -1, y: 0, actions: ["shot", "scan"] }); steps(g, 30 * 6);
      Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 10);
    } catch (ex) { err = ex; }
    const c = D.CHARS[i];
    const used = a.stats.skills >= 1;
    ok(!err, `${c.num} ${c.name} ${c.skill.kind}: 例外 ${err && err.stack}`);
    ok(used, `${c.num} ${c.name} ${c.skill.kind}: 発動しない`);
    kinds[c.skill.kind] = (kinds[c.skill.kind] || 0) + 1;
  }
  ok(Object.keys(kinds).length === 39, `固有技の型は39種: ${Object.keys(kinds).length}`);
}
// 8) 個別の技の効き目
{
  // 金剛壁：印を遮る
  { const g = mk([idx("kanaoni"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 26, 38, Math.PI);
    Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 40); const h = a.hp; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
    ok(a.hp === h && g.objects.some(o => o.kind === "wall"), `金剛壁が印を遮る hp=${a.hp}`); ok(!Sim.lineClear(e.x, e.y, a.x, a.y), "金剛壁が視線を遮る"); }
  // 変わり身：1発無効
  { const g = mk([idx("kohaku"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 26, 38, Math.PI);
    Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); Sim.setInput(a, { x: 0, y: -1, actions: [] }); const h = a.hp; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 30);
    ok(a.hp === h && Math.abs(a.y - 24) > 1.5, `変わり身で無効化＋入力方向へ移動 hp=${a.hp} y=${a.y.toFixed(1)}`); }
  // 影縫い：停止
  { const g = mk([idx("anne"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 26, 38, Math.PI);
    Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30); Sim.setInput(e, { x: 1, y: 0, actions: [] }); steps(g, 5);
    ok(e.stunT > 0 && e.speedNow < 0.1, `黒団子で1.2秒停止 stun=${e.stunT.toFixed(2)}`); }
  // 追風：15%速く
  { const g = mk([idx("fuuta"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; place(a, 22, 38, 0);
    Sim.setInput(a, { x: 1, y: 0, actions: ["skill"] }); steps(g, 3);
    ok(Math.abs(a.speedNow - R.speed * 1.12 * 1.15) < 0.15, `追風: ${a.speedNow.toFixed(2)}（速さ5×1.15）`); }
  // 鷹の目：動いている敵を味方地図に
  { const g = mk([idx("hayate"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 36, 38, Math.PI);
    Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); Sim.setInput(e, { x: -1, y: 0, actions: [] }); steps(g, 30 * 3 + 3);
    ok(e.lastSeen && e.lastSeen.t > 0 && e.lastSeen.team === 0, `鷹の目で lastSeen が付く: ${JSON.stringify(e.lastSeen)}`); }
  // 罪業：中では固有技が使えない
  { const g = mk([idx("karma"), 1, 1, idx("jin"), 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 23, 38, Math.PI);
    Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 40); Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2);
    ok(g.objects.some(o => o.kind === "zone_null") && e.stats.skills === 0, `罪業の中では敵の固有技が使えない: objects=${g.objects.map(o => o.kind)} skills=${e.stats.skills}`); }
  // 一閃（狙撃）：1.4倍
  { const g = mk([idx("magoichi"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, 38, 0); place(e, 32, 38, Math.PI);
    const h = e.hp; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 3);
    ok(h - e.hp === Math.round(34 * (1 + 2 * 0.12) * 1.4), `一閃は射程14m・1.4倍: ${h - e.hp}`); }
}
// 9) レビュー指摘の回帰テスト（設計図2枚との突き合わせ）
{
  const Y = 38; // 開けた行
  const one = (charA, charE, fn) => { const g = mk([idx(charA), 1, 1, charE != null ? idx(charE) : 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y, 0); place(e, 26, Y, Math.PI); for (const p of [g.players[1], g.players[2], g.players[4], g.players[5]]) place(p, 12 + p.slot, 42 + p.team, 0); fn(g, a, e); };
  // 焙烙玉：2秒後に必ず破裂し、押し出して擬態を解く。遮蔽物の裏なら当たらない
  one("hinanojoh", null, (g, a, e) => { const x0 = e.x; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 2 + 3); ok(g.objects.every(o => o.kind !== "bomb") && Math.abs(e.x - x0) > 1, `焙烙玉が破裂して押し出す: x ${x0}→${e.x.toFixed(2)}`); });
  // 影縫い：着弾0.8秒で必ず止める（寿命の端数に依存しない）
  one("anne", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); let stunned = false; for (let i = 0; i < 40; i++) { Sim.step(g); if (e.stunT > 0) stunned = true; } ok(stunned, "影縫いが必ず発動する"); });
  // 金剛壁：予告0.7秒のあいだは素通り・その後は印を遮る
  one("kanaoni", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(Sim.lineClear(a.x, a.y, e.x, e.y), "予告中の金剛壁は射線を遮らない"); steps(g, 25); ok(!Sim.lineClear(a.x, a.y, e.x, e.y), "予告後の金剛壁は射線を遮る"); });
  // 疾拍子：味方のCDをちょうど2秒進める
  one("benten", null, (g, a) => { const m = g.players[1]; m.skillCd = 10; place(m, 23, Y + 1, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 5 + 2); ok(Math.abs(m.skillCd - (10 - 5 - 2 - 2 / 30)) < 0.1, `疾拍子は各2秒: ${m.skillCd.toFixed(2)}`); });
  // 呪標：4秒後に8m外なら不発／8m内なら固有技の回復が4秒遅れる
  one("seori", null, (g, a, e) => { e.reveal = 3; e.skillCd = 5; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(e.skillCd < 5, "呪標は即時には効かない"); place(e, 40, Y, Math.PI); steps(g, 30 * 4 + 2); ok(e.skillCd < 1, `8m外へ離れれば不発: cd=${e.skillCd.toFixed(2)}`); });
  one("seori", null, (g, a, e) => { e.reveal = 3; e.skillCd = 5; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 4 + 2); ok(e.skillCd > 4.5, `8m内なら4秒遅れる: cd=${e.skillCd.toFixed(2)}`); });
  // 双龍円：最初の1発だけ落として構えを解く
  one("xiaolan", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const h = a.hp; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 15); ok(a.hp === h && !a.sk.channel, "双龍円は1発落として構えが解ける"); e.shotCd = 0; a.invuln = 0; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 15); ok(a.hp < h, "2発目は当たる"); });
  // 守り兎：8秒で切れる／効いている間の最初の被弾は減速なし・可視化なし／ダメージは減らさない／追香を除く
  one("oto", null, (g, a, e) => { a.mods.push({ k: "tracked", src: "tracked", t: 5, by: 1 }); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(a.sk.shield > 0 && !a.mods.some(m => m.k === "tracked"), "守り兎は自分にも付き、追香を除く"); const h = a.hp; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 15); ok(a.slow === 0 && a.reveal === 0 && h - a.hp === Math.round(34 * (1 + (2 - 3) * 0.12) * (1 - (4 - 3) * 0.08) * 0 + Sim.D.RULES.hp.baseDamage * (1 + (e.bal.stats.atk - 3) * 0.12) * a.bal.takenMul), `守り兎：減速・可視化なし・ダメージはそのまま ${h - a.hp}`); });
  one("oto", null, (g, a) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 8 + 3); ok(!(a.sk.shield > 0), "守り兎は8秒で切れる"); });
  // 変わり身：8秒で切れる
  one("kohaku", null, (g, a) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30 * 8 + 3); ok(!(a.sk.kawarimi > 0), "変わり身の待機は8秒で切れる"); });
  // 追風：同じ技は重ねがけで乗算しない／曲がると加速が落ちる
  one("fuuta", null, (g, a) => { Sim.setInput(a, { x: 1, y: 0, actions: ["skill"] }); steps(g, 1); a.skillCd = 0; Sim.setInput(a, { x: 1, y: 0, actions: ["skill"] }); steps(g, 3); ok(a.mods.filter(m => m.src === "tailwindSpeed").length === 1 && Math.abs(a.speedNow - R.speed * 1.12 * 1.15) < 0.15, `追風は重ねても1本: ${a.speedNow.toFixed(2)}`); Sim.setInput(a, { x: 0, y: 1, actions: [] }); steps(g, 3); ok(!a.mods.some(m => m.src === "tailwindSpeed"), "曲がると加速が落ちる"); });
  // 追風が敵の紫煙を押し流す（残り時間半分）
  one("fuuta", "rotten", (g, a, e) => { e.angle = Math.PI; Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const fog = g.objects.find(o => o.kind === "zone_fog"); const l0 = fog.life; place(a, fog.x - 3.2, fog.y, 0); Sim.setInput(a, { x: 1, y: 0, actions: ["skill"] }); steps(g, 10); ok(fog.windHit && fog.life < l0 / 2 + 0.1, `風遁で紫煙が半分: ${l0.toFixed(2)}→${fog.life.toFixed(2)}`); });
  // 紫煙：縁に立つだけでは何も起きず、中から外へ出たときだけ足跡が残る
  one("rotten", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const fog = g.objects.find(o => o.kind === "zone_fog"); place(e, fog.x + fog.r + 0.15, fog.y, Math.PI); steps(g, 10); ok(!e.mods.some(m => m.k === "fogTrail") && e.reveal === 0, "縁に立つだけでは足跡は付かない"); place(e, fog.x, fog.y, 0); steps(g, 2); place(e, fog.x + fog.r + 0.5, fog.y, 0); steps(g, 2); ok(e.mods.filter(m => m.k === "fogTrail").length === 1, "外へ出ると足跡（1本だけ）"); });
  // 残火：壁で切れる・敵の水鏡で消え、水鏡は2秒短くなる
  one("jin", "shiba", (g, a, e) => { e.angle = 0; place(e, 24, Y, 0); Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const w = g.objects.find(o => o.kind === "zone_water"); const l0 = w.life; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(!g.objects.some(o => o.kind === "trail" && !o.dead) && w.life < l0 - 1.9, `残火は水遁で消え、水鏡は2秒短縮: ${l0.toFixed(2)}→${w.life.toFixed(2)}`); });
  { const g = mk([idx("jin"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; let wx = null; for (let x = 20; x < 40 && wx == null; x += 0.25) if (Sim.SOLID[Sim.cellAt(x, 24)]) wx = x; place(a, wx - 2, 24, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const t = g.objects.find(o => o.kind === "trail"); ok(t && t.bx <= wx + 0.01, `残火は壁で止まる: 壁x=${wx} 端=${t && t.bx.toFixed(2)}`); }
  // 水鏡が敵の狐火を一つ消す
  one("uka", "shiba", (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const f0 = g.objects.filter(o => o.kind === "fox_fire").length; const f = g.objects.find(o => o.kind === "fox_fire"); place(e, f.x + 1.5, f.y, 0); Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(g.objects.filter(o => o.kind === "fox_fire").length === f0 - 1, "水遁で狐火が一つ消える"); });
  // 白蛇：印で消える
  one("janome", null, (g, a, e) => { a.angle = Math.PI; place(a, 22, Y, Math.PI); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 3); const sn = g.objects.find(o => o.kind === "snake"); place(e, sn.x - 4, sn.y, 0); e.angle = 0; Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); steps(g, 10); ok(!g.objects.some(o => o.kind === "snake"), "白蛇は印で消せる"); });
  // 漆黒：見破りで1秒短縮
  one("ganzi", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const dk = g.objects.find(o => o.kind === "zone_dark"); const l0 = dk.life; Sim.setInput(e, { x: 0, y: 0, actions: ["scan"] }); steps(g, 9); ok(dk.life < l0 - 1.2, `漆黒は見破りで1秒短縮: ${l0.toFixed(2)}→${dk.life.toFixed(2)}`); });
  // 罪業：味方は中でも固有技を使える・敵は使えない
  one("karma", "jin", (g, a, e) => { const m = g.players[1]; place(m, 23, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 40); place(e, 23.5, Y, Math.PI); Sim.setInput(m, { x: 0, y: 0, actions: ["skill"] }); Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(m.stats.skills === 1 && e.stats.skills === 0, `罪業：味方は使える(${m.stats.skills})・敵は使えない(${e.stats.skills})`); });
  // 迅雷羽：0.3秒の予告のあとに跳ぶ
  one("karura", null, (g, a) => { const x0 = a.x; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 3); ok(a.x === x0 && a.sk.channel && a.sk.channel.kind === "leap", "迅雷羽は予告中は動かない"); steps(g, 10); ok(a.x > x0 + 3, `0.3秒後に跳ぶ: ${x0}→${a.x.toFixed(2)}`); });
  // 影穴：入口→出口で一度だけ移動、敵も一度だけ追える
  one("sasagane", null, (g, a, e) => { place(a, 22, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 3); const x0 = a.x; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(a.x > x0 + 3, `影穴で移動: ${x0}→${a.x.toFixed(2)}`); const gate = g.objects.find(o => o.kind === "gate"); const e2 = g.players[4]; place(e, gate.x, gate.y, 0); steps(g, 2); ok(Math.abs(e.x - gate.exit.x) < 0.3, "敵も一度だけ追って入れる"); place(e2, gate.x, gate.y, 0); steps(g, 2); ok(Math.abs(e2.x - gate.exit.x) > 1, "2人目の敵は入れない"); });
  // 猫の目：黒目で擬態+1（持続が延びる）・白目で見破り範囲+0.5
  one("quon", null, (g, a) => { const zx = findZone(); place(a, zx[0], zx[1], 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill:black"] }); steps(g, 1); ok(Sim.balNow(a).camoDurMul > a.bal.camoDurMul, "黒目で擬態の係数が上がる"); });
  one("quon", null, (g, a) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill:white"] }); steps(g, 1); ok(Sim.balNow(a).scanRangeAdd === a.bal.scanRangeAdd + 0.5 && Sim.balNow(a).scanCdMul < a.bal.scanCdMul, "白目で索敵+1"); });
  // 帰魂：帰還中の味方だけ・保護が1秒延びる・同じ帰還へ一度だけ
  one("ibuki", null, (g, a) => { const m = g.players[1]; Sim.returnHome(g, m); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(a.stats.skills === 1 && m.soulBoosted, "帰魂が帰還中の味方に効く"); a.skillCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(a.stats.skills === 1, "同じ帰還へ一度だけ"); steps(g, 30 * 2); ok(m.protect > 2.0, `復帰後の保護が1秒延びる（延長なしなら約1.5秒残り）: ${m.protect.toFixed(2)}`); });
  // 結び糸：6mを超えると切れる
  one("oen", null, (g, a) => { const m = g.players[1]; place(m, 23, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(a.mods.some(x => x.k === "thread"), "結び糸が付く"); place(m, 35, Y, 0); steps(g, 2); ok(!a.mods.some(x => x.k === "thread") && !m.mods.some(x => x.k === "thread"), "6mを超えると切れる"); });
  // 帰還で固有技の状態が残らない（狐駆け・罪業・変わり身）
  one("izuna", null, (g, a) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); Sim.returnHome(g, a); ok(a.mods.length === 0 && Object.keys(a.sk).length === 0, "帰還で強化・待機が消える"); });
  // 白狐：足跡は2秒前の位置を追い続ける（最初の位置に張り付かない）
  one("sakuya", null, (g, a, e) => { place(e, 28, Y, Math.PI); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); Sim.setInput(e, { x: -1, y: 0, actions: ["crouch"] }); steps(g, 1); Sim.setInput(e, { x: -1, y: 0, actions: [] }); steps(g, 30 * 3); const t = g.objects.find(o => o.kind === "track"); const m1 = t.mark && t.mark.x; steps(g, 30 * 2); ok(t.mark && t.mark.x < m1 - 1, `白狐の足跡が更新される: ${m1 && m1.toFixed(1)}→${t.mark && t.mark.x.toFixed(1)}`); });
  // 白蛇：現在位置ではなく擬態の開始地点を知らせる
  one("janome", null, (g, a, e) => { const zx = findZone(); place(e, zx[0], zx[1], 0); Sim.setInput(e, { x: 0, y: 0, actions: ["camo"] }); steps(g, 30); ok(e.camo === 2 && g.camoMarks.length === 1, "擬態開始痕が残る"); place(a, zx[0] + 1, zx[1], 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 3); ok(g.effects.some(f => f.type === "spotted" && f.mark && Math.abs(f.x - zx[0]) < 0.01), "白蛇が開始地点を知らせる"); });
  // レベルが5秒以内に続けて上がっても、前のレベルの系統は推奨で確定する
  { const g = mk([1, 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; Sim.addXp(g, 0, 80, "t"); steps(g, 1); Sim.addXp(g, 0, 120, "t"); steps(g, 1); ok(a.perks[2] === "技" && a.pendingLevel === 3, `連続レベルアップで前の系統を確定: ${JSON.stringify(a.perks)}`); }
  // HP0 +12：再露見から20秒間は0（露見のたびに数え直す）
  { const g = mk([1, 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], b = g.players[3]; place(a, 20, 24, 0); place(b, 24, 24, Math.PI);
    const kill = () => { b.hp = 1; b.invuln = 0; b.exposed = 0; a.shotCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 10); };
    kill(); const x1 = g.xp[0]; for (let i = 0; i < 30 * 15; i++) Sim.step(g); kill(); const x2 = g.xp[0]; for (let i = 0; i < 30 * 8; i++) Sim.step(g); kill(); const x3 = g.xp[0];
    ok(x2 - x1 === 0 && x3 - x2 === 0, `再露見から20秒は+12なし: ${x1}→${x2}→${x3}`); }
  // 別の試合の設置物が可視判定に混ざらない
  { const g1 = mk([idx("kanaoni"), 1, 1, 1, 1, 1]); idle(g1); place(g1.players[0], 22, Y, 0); Sim.setInput(g1.players[0], { x: 0, y: 0, actions: ["skill"] }); steps(g1, 30); const g2 = mk([1, 1, 1, 1, 1, 1]); idle(g2); steps(g2, 1); ok(Sim.lineClear(22, Y, 26, Y), "別の試合の金剛壁は遮らない"); steps(g1, 1); ok(!Sim.lineClear(22, Y, 26, Y), "自分の試合の金剛壁は遮る"); }
  // スナップショット：敵に変わり身の待機を送らない
  one("kohaku", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); a.reveal = 2; const snap = Sim.snapshot(g, e.id); const pa = snap.players.find(p => p.id === a.id); ok(pa && !(pa.modKeys || []).includes("kawarimiArm"), "敵に変わり身の待機を送らない"); const own = Sim.snapshot(g, a.id).players.find(p => p.id === a.id); ok(own.modKeys.includes("kawarimiArm"), "本人には送る"); });
  // 追香：見えない相手の移動方向だけを追跡側へ
  one("torika", null, (g, a, e) => { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); Sim.setInput(a, { x: 0, y: 0, actions: ["shot"] }); steps(g, 12); ok(e.mods.some(m => m.k === "tracked"), "追香が付く"); place(e, 50, 8, 0); e.reveal = 0; e.lastSeen = null; Sim.setInput(e, { x: 1, y: 0, actions: [] }); steps(g, 2); const snap = Sim.snapshot(g, a.id); const pe = snap.players.find(p => p.id === e.id); ok(pe && pe.trackDir != null && pe.x == null, `追跡側には方向だけ: ${JSON.stringify(pe)}`); });
}
// 10) 再レビュー（修正後の再照合）の回帰テスト
{
  const Y = 38, F = Sim.FLAG;
  const mk2 = (chars, botMask) => { const roles = ["vanguard", "scout", "decoy"], ps = []; for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) ps.push({ id: `t${t}_${i}`, team: t, char: chars[t * 3 + i], bot: !!botMask[t * 3 + i], role: roles[i], slot: i }); const g = Sim.createMatch({ players: ps, seed: 7, difficulty: "normal", briefing: false }); g.phase = "playing"; g.timer = 0; g.noTimer = true; for (const p of g.players) p.protect = 0; return g; };
  const humansIdle = g => { for (const p of g.players) if (!p.bot) Sim.setInput(p, { x: 0, y: 0, actions: [] }); };
  // Bot：旗を掴めるなら、露見した味方の手当より先に掴む
  { const g = mk2([1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0]); const [a, m] = g.players; place(a, F.x - 0.5, F.y); place(m, F.x - 5, F.y); m.hp = 0; m.exposed = 10; for (const p of g.players.slice(3)) place(p, 60, 24); for (let i = 0; i < 30 && g.phase !== "finished"; i++) { humansIdle(g); Sim.step(g); } ok(g.phase === "finished" && g.winner[0] === 0, `Botは手当より旗を優先: ${g.phase}`); }
  // Bot：露見中の敵は狙わない（見えている生身の敵を狙う）
  { const g = mk2([1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0]); const [a, , , ex, lv, fr] = g.players; place(a, 22, Y); place(ex, 24, Y); ex.hp = 0; ex.exposed = 12; place(lv, 21, 41); place(fr, 60, 24); place(g.players[1], 12, 42); place(g.players[2], 13, 42); a.ai.phase = "guard"; a.ai.post = { x: 22, y: Y };
    let atEx = 0, n = 0; for (let i = 0; i < 30 * 6; i++) { humansIdle(g); ex.exposed = Math.max(ex.exposed, 5); Sim.step(g); for (const s of g.shots) if (s.owner === a.id && !s.c) { s.c = 1; n++; if (Math.abs(Sim.angDiff(s.angle, 0)) < 0.5) atEx++; } }
    ok(atEx === 0, `Botは露見中の敵を狙わない: 撃った${n}・露見中へ${atEx}・生身の敵HP${lv.hp}`); }
  // 露見しても Bot の持ち場はそのまま（手当で現場復帰したら持ち場へ戻る）
  { const g = mk2([1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0]); const a = g.players[0]; a.ai.phase = "wait"; a.ai.wp = 3; a.hp = 1; place(a, 29.5, 12); const e = g.players[3]; place(e, 33.5, 12, Math.PI); humansIdle(g); Sim.setInput(e, { x: 0, y: 0, actions: ["shot"] }); for (let i = 0; i < 20; i++) Sim.step(g); ok(a.exposed > 0 && a.ai.wp === 3, `露見で持ち場の記録を消さない: wp=${a.ai.wp} phase=${a.ai.phase}`); }
  // 再戦しても切断中の人は切断のまま
  { const g = mk2([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]); g.players[1].connected = false; Sim.resetForRematch(g, false); ok(g.players[1].connected === false && g.players[0].connected === true, "再戦で切断状態を引き継ぐ"); }
  // ログ：敵の合図・見えていない敵の固有技は送らない
  { const g = mk2([idx("kohaku"), 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]); const [A] = g.players, B = g.players[3]; place(A, 12, 42); place(B, 52, 8); humansIdle(g); Sim.setInput(A, { x: 0, y: 0, actions: ["skill", "ping:flag"] }); Sim.step(g); const L = g.log.slice(-4); ok(!L.some(l => Sim.logVisible(g, B.id, l) && (l.type === "skill" || l.type === "ping")) && L.some(l => l.type === "skill" && Sim.logVisible(g, g.players[1].id, l)), "見えていない敵の技・合図はログに乗らない（味方には乗る）"); }
  // 停止中は "skill:〜" も使えない
  { const g = mk([idx("quon"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; place(a, 22, Y); a.stunT = 1; Sim.setInput(a, { x: 0, y: 0, actions: ["skill:white"] }); steps(g, 1); ok(a.stats.skills === 0, "停止中は skill:white も弾く"); }
  { const g = mk([idx("dan"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; place(a, 26, Y, Math.PI); a.stunT = 1; Sim.setInput(a, { x: 0, y: 0, actions: ["skill:x"] }); steps(g, 20); ok(a.stats.skills === 0 && a.x === 26, `停止中に白刃で抜けられない: x=${a.x}`); }
  // 鷹の目・狙撃・疾拍子は動くと解ける
  for (const id of ["hayate", "magoichi", "benten"]) { const g = mk([idx(id), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; place(a, 22, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); const had = !!a.sk.channel; Sim.setInput(a, { x: 0, y: 1, actions: [] }); steps(g, 8); ok(had && !a.sk.channel && Math.abs(a.y - Y) > 0.3, `${id}：動くと構えが解けて動ける y=${a.y.toFixed(2)}`); }
  // 罪業の中では影穴の出口も変わり身も使えない
  { const g = mk([idx("karma"), 1, 1, idx("sasagane"), idx("kohaku"), 1]); idle(g); const [K] = g.players, S = g.players[3], H = g.players[4]; place(K, 24, Y); place(S, 26, Y, Math.PI); Sim.setInput(S, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); Sim.setInput(K, { x: 0, y: 0, actions: ["skill"] }); steps(g, 40); ok(g.objects.some(o => o.kind === "zone_null" && Sim.dist(o, S) <= o.r), "影穴の使い手が罪業の中にいる"); const x0 = S.x; Sim.setInput(S, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(Math.abs(S.x - x0) < 0.01, `罪業の中では影穴の出口を置けない: ${x0}→${S.x}`); }
  // 影穴の出口は陣地に置かない
  { const g = mk([idx("sasagane"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0]; place(a, 11, 20.5, Math.PI); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(!Sim.blocked(a.x, a.y, R.bodyRadius, 1), `出口は敵も立てる場所: (${a.x.toFixed(1)},${a.y.toFixed(1)}) cell=${Sim.cellAt(a.x, a.y)}`); }
  // 金剛壁が立った位置にいた者は押し出され、その後は動ける
  { const g = mk([idx("kanaoni"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y, 0); place(e, 23.5, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 30); const w = g.objects.find(o => o.kind === "wall"); const d0 = Sim.dist(e, { x: w.x, y: w.y }); const x0 = e.x, y0 = e.y; Sim.setInput(e, { x: 1, y: 0, actions: [] }); steps(g, 15); Sim.setInput(e, { x: 0, y: 1, actions: [] }); steps(g, 15); ok(!w.pending && Math.hypot(e.x - x0, e.y - y0) > 0.5, `金剛壁の上にいても動ける: 移動${Math.hypot(e.x - x0, e.y - y0).toFixed(2)}`); }
  // 巨人の一撃：背後・壁の向こうには当たらない
  { const g = mk([idx("aum"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y, 0); place(e, 21, Y); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 32); ok(Math.abs(e.x - 21) < 0.01, `背後1mの敵には当たらない: x=${e.x}`); }
  { const g = mk([idx("aum"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; let wx = null; for (let x = 20; x < 40 && wx == null; x += 0.25) if (Sim.SOLID[Sim.cellAt(x, 24)]) wx = x; place(a, wx - 0.8, 24, 0); let ex = wx; while (Sim.SOLID[Sim.cellAt(ex, 24)]) ex += 0.25; place(e, ex + 0.5, 24); const e0 = e.x; if (ex + 0.5 - a.x <= 2.8) { Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 32); ok(Math.abs(e.x - e0) < 0.01, `壁の向こうの敵には当たらない: ${e0}→${e.x}`); } }
  // 追香：外した印では消費しない
  { const g = mk([idx("torika"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y, Math.PI / 2); place(e, 26, Y); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); Sim.setInput(a, { x: 0, y: 0, actions: ["shot"], angle: Math.PI / 2 }); steps(g, 20); ok(a.sk.poisonArmed > 0, "外した印では追香を消費しない"); a.shotCd = 0; Sim.setInput(a, { x: 0, y: 0, actions: ["shot"], angle: 0 }); steps(g, 12); ok(e.mods.some(m => m.k === "tracked") && !(a.sk.poisonArmed > 0), "次に当たった印で追香が付く"); }
  // 白刃は霧で止まらない（5m）
  { const g = mk([idx("dan"), 1, 1, idx("rotten"), 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(e, 30, Y, Math.PI); Sim.setInput(e, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); place(e, 40, 42); place(a, 24.5, Y, 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 15); ok(Math.abs(a.x - 29.5) < 0.05, `白刃は霧を抜けて5m: x=${a.x.toFixed(2)}`); }
  // 疾拍子の演奏音は10m届く（壁越しは半分）／鷹の目の間は聞こえにくい
  { const g = mk([idx("benten"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y); place(e, 29, Y); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 2); ok(Sim.audible(e, a), "演奏中は7m先の敵に聞こえる"); }
  { const g = mk([idx("hayate"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; place(a, 22, Y); place(e, 28, Y); Sim.setInput(e, { x: 1, y: 0, actions: [] }); steps(g, 2); const before = Sim.audible(a, e); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); ok(before && !Sim.audible(a, e), "鷹の目の間は足音が聞こえにくい"); }
  // 棘道：擬態は解けず、足跡だけ
  { const g = mk([idx("shion"), 1, 1, 1, 1, 1]); idle(g); const a = g.players[0], e = g.players[3]; const zx = findZone(); place(a, zx[0] - 2.5, zx[1], 0); Sim.setInput(a, { x: 0, y: 0, actions: ["skill"] }); steps(g, 1); const th = g.objects.find(o => o.kind === "thorns"); place(e, zx[0], zx[1]); e.camo = 2; e.camoTime = 10; e.camoPattern = Sim.zoneAt(zx[0], zx[1]); e.reveal = 0; const onLine = Sim.D && th; place(e, (th.ax + th.bx) / 2, (th.ay + th.by) / 2); e.camo = Sim.zoneAt(e.x, e.y) ? 2 : 0; const c0 = e.camo; steps(g, 2); ok(e.reveal === 0 && e.camo === c0 && e.mods.some(m => m.k === "fogTrail") && g.effects.some(f => f.type === "footprint"), `棘道は足跡だけ（擬態${c0}→${e.camo}・可視化${e.reveal}）`); }
}
console.log(`rpgtest: OK ${pass} / NG ${fail}`);
process.exit(fail ? 1 : 0);
