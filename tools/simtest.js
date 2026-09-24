// Bot同士の3対3を無人で回して、勝敗・所要時間・例外の有無と、HP・レベル設計図の合格基準を確認する
//   node ninsai-kakurenbo/tools/simtest.js [試合数] [難易度] [--fixed] [--legacy]
//   既定＝城ダンジョン（castle.js が毎試合ちがう城を作る）。--legacy＝練習用の固定マップ（竹影の城）。--fixed＝キャラを旧来の3体に固定
const path = require("path");
const Sim = require(path.join(__dirname, "..", "sim.js"));
const D = Sim.D;

const N = parseInt(process.argv[2] || "20", 10);
const dif = process.argv[3] || "normal";
const fixed = process.argv.includes("--fixed");
const legacy = process.argv.includes("--legacy");
const CS = { gen: [], known: [], types: {}, traps: {}, keys: 0, unlocks: 0, floors: [] };
const results = { flag: 0, tie: 0, timeout: 0, blue: 0, orange: 0 };
const claimTimes = [];
const byRole = {};
let quick = 0, overtime = 0;
const stats = { hides: 0, reveals: 0, hits: 0, returns: 0, pings: 0, hp0: 0, heals: 0, skills: 0, damage: 0 };
// 合格基準（docs/hp-level-blueprint.txt）
const M = { hp0PerPlayer: [], recoverSecs: [], levelDiffOkTicks: 0, ticks: 0, lv5Matches: 0, xpBySrc: {}, xpTotal: 0, skillsByKind: {}, healRecover: 0, homeRecover: 0, autoReturn: 0 };
let seedRng = 12345;
const rnd = () => { seedRng = (seedRng * 1103515245 + 12345) & 0x7fffffff; return seedRng / 0x7fffffff; };

for (let m = 0; m < N; m++) {
  const roles = ["vanguard", "scout", "decoy"];
  const players = [];
  const pool = fixed ? null : [...Array(D.CHARS.length).keys()].sort(() => rnd() - 0.5);
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ id: `t${t}_${i}`, team: t, char: fixed ? (i + t) % 3 : pool[t * 3 + i], bot: true, role: roles[i], slot: i });
  const t0 = Date.now();
  const g = Sim.createMatch({ players, seed: 1000 + m * 7919, difficulty: dif, briefing: false, castle: legacy ? null : { seed: "simtest:" + dif + ":" + m, difficulty: dif } });
  if (!legacy) { CS.gen.push(Date.now() - t0); CS.types[g.map.castle.typeName] = (CS.types[g.map.castle.typeName] || 0) + 1; CS.floors.push(g.map.castle.floorsUsed.length); }
  let knownAt = null;
  g.timer = 0; g.phase = "countdown"; g.timer = 0.1;
  let ticks = 0, lastTick = -1;
  const exposedAt = {};
  while (g.phase !== "finished" && ticks < 30 * 480) {
    Sim.step(g); ticks++;
    if (!legacy && knownAt == null && g.intel && g.intel[0].known && g.intel[1].known) knownAt = g.elapsed;
    for (const e of g.log) {
      if (e.tick <= lastTick) continue;
      if (e.type === "expose") exposedAt[e.id] = g.elapsed;
      if (e.type === "recover" && exposedAt[e.id] != null) { M.recoverSecs.push(g.elapsed - exposedAt[e.id]); delete exposedAt[e.id]; if (e.how === "heal") M.healRecover++; else M.homeRecover++; }
      if (e.type === "return" && exposedAt[e.id] != null) { M.recoverSecs.push(g.elapsed - exposedAt[e.id]); delete exposedAt[e.id]; M.autoReturn++; }
      if (e.type === "skill") M.skillsByKind[e.kind] = (M.skillsByKind[e.kind] || 0) + 1;
      if (e.type === "trap") CS.traps[e.kind] = (CS.traps[e.kind] || 0) + 1;
      if (e.type === "key") CS.keys++;
      if (e.type === "unlock") CS.unlocks++;
    }
    lastTick = g.tick;
    if (g.phase === "playing") { M.ticks++; if (Math.abs(g.level[0] - g.level[1]) <= 1) M.levelDiffOkTicks++; }
  }
  if (g.phase !== "finished") { console.log("試合が終わらない", m); process.exit(1); }
  if (knownAt != null) CS.known.push(knownAt);
  results[g.reason]++;
  if (g.reason === "flag") { const cp = g.players.find(p => p.id === g.claimants[0]); byRole[cp.role] = (byRole[cp.role] || 0) + 1; results[g.winner[0] === 0 ? "blue" : "orange"]++; claimTimes.push(g.elapsed); if (g.elapsed < 20) quick++; }
  if (g.overtime) overtime++;
  for (const p of g.players) { for (const k of Object.keys(stats)) stats[k] += p.stats[k] || 0; M.hp0PerPlayer.push(p.stats.hp0); }
  if (g.level[0] >= 5 || g.level[1] >= 5) M.lv5Matches++;
  for (const x of g.xpLog) { M.xpBySrc[x.src] = (M.xpBySrc[x.src] || 0) + x.n; M.xpTotal += x.n; }
  // 試合後に状態が残らないこと（T18）
  Sim.resetForRematch(g, m % 2 === 1);
  if (!legacy && (!g.map || g.map.kind !== "castle" || g.duration !== g.map.castle.duration)) { console.log("再戦で城が作り直されない"); process.exit(1); }
  if (g.players.some(p => p.marks || p.camo || p.reveal || p.returning || p.exposed || p.hp !== p.hpMax || p.skillCd || Object.keys(p.perks).length) || g.xp[0] || g.level[1] !== 1 || g.objects.length) { console.log("再戦で状態が残った"); process.exit(1); }
}
const avg = claimTimes.length ? (claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length) : 0;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log(`試合数 ${N} / 難易度 ${dif} / キャラ ${fixed ? "固定3体" : "39体ランダム"} / 地図 ${legacy ? "固定（竹影の城）" : "城ダンジョン"}`);
console.log(`旗取得 ${results.flag}（青 ${results.blue}・橙 ${results.orange}） 同着 ${results.tie} 引き分け ${results.timeout} 延長突入 ${overtime}`);
console.log(`初回旗取得の平均 ${avg.toFixed(1)}秒（最短 ${claimTimes.length ? Math.min(...claimTimes).toFixed(1) : "-"} / 最長 ${claimTimes.length ? Math.max(...claimTimes).toFixed(1) : "-"}） 20秒未満決着 ${quick}本`);
console.log("取得者の役割:", JSON.stringify(byRole));
console.log(`1試合平均: 擬態 ${(stats.hides / N).toFixed(1)} 見破り成功 ${(stats.reveals / N).toFixed(1)} 命中 ${(stats.hits / N).toFixed(1)} 帰還 ${(stats.returns / N).toFixed(1)} 合図 ${(stats.pings / N).toFixed(1)} 固有技 ${(stats.skills / N).toFixed(1)} 手当 ${(stats.heals / N).toFixed(1)}`);
const dmgXp = (M.xpBySrc.hit || 0) + (M.xpBySrc.hp0 || 0);
console.log("--- 合格基準（HP・レベル設計図）---");
console.log(`HP0（1人あたり/試合） ${mean(M.hp0PerPlayer).toFixed(2)}（目安 1〜3）`);
console.log(`露見→復帰の平均 ${mean(M.recoverSecs).toFixed(1)}秒（目安 6〜9・件数 ${M.recoverSecs.length}＝手当 ${M.healRecover}／自陣 ${M.homeRecover}／自動帰還 ${M.autoReturn}）`);
console.log(`レベル差1以内の時間 ${(M.ticks ? 100 * M.levelDiffOkTicks / M.ticks : 0).toFixed(0)}%（目安 80%以上）`);
console.log(`Lv5到達（いずれかのチーム） ${(100 * M.lv5Matches / N).toFixed(0)}%（目安 30〜50%）`);
console.log(`ダメージ由来XP ${(M.xpTotal ? 100 * dmgXp / M.xpTotal : 0).toFixed(0)}%（目安 35%以下） 内訳 ${JSON.stringify(M.xpBySrc)} 合計 ${M.xpTotal}`);
console.log("固有技の発動:", JSON.stringify(M.skillsByKind));
if (!legacy) {
  const avgc = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0;
  console.log("--- 城ダンジョン ---");
  console.log(`城型 ${JSON.stringify(CS.types)}・階数の平均 ${avgc(CS.floors).toFixed(1)}・生成の平均 ${avgc(CS.gen).toFixed(0)}ms（最大 ${Math.max(...CS.gen)}ms）`);
  console.log(`両陣営が旗の位置を知るまで 平均 ${avgc(CS.known).toFixed(1)}秒（${CS.known.length}/${N}試合）`);
  console.log(`罠が作動 ${JSON.stringify(CS.traps)}・鍵を拾う ${CS.keys}・鍵の扉/スイッチで開く ${CS.unlocks}`);
}
