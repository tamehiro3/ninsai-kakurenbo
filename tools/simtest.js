// Bot同士の3対3を無人で回して、勝敗・所要時間・例外の有無を確認する
//   node ninsai-kakurenbo/tools/simtest.js [試合数] [難易度]
const path = require("path");
const Sim = require(path.join(__dirname, "..", "sim.js"));
const D = Sim.D;

const N = parseInt(process.argv[2] || "20", 10);
const dif = process.argv[3] || "normal";
const results = { flag: 0, tie: 0, timeout: 0, blue: 0, orange: 0 };
const claimTimes = [];
const byRole = {};
let quick = 0, overtime = 0;
const stats = { hides: 0, reveals: 0, hits: 0, returns: 0, pings: 0 };

for (let m = 0; m < N; m++) {
  const roles = ["vanguard", "scout", "decoy"];
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ id: `t${t}_${i}`, team: t, char: (i + t) % 3, bot: true, role: roles[i], slot: i });
  const g = Sim.createMatch({ players, seed: 1000 + m * 7919, difficulty: dif, briefing: false });
  g.timer = 0; g.phase = "countdown"; g.timer = 0.1;
  let ticks = 0;
  while (g.phase !== "finished" && ticks < 30 * 400) { Sim.step(g); ticks++; }
  if (g.phase !== "finished") { console.log("試合が終わらない", m); process.exit(1); }
  results[g.reason]++;
  if (g.reason === "flag") { const cp = g.players.find(p => p.id === g.claimants[0]); byRole[cp.role] = (byRole[cp.role] || 0) + 1; results[g.winner[0] === 0 ? "blue" : "orange"]++; claimTimes.push(g.elapsed); if (g.elapsed < 20) quick++; }
  if (g.overtime) overtime++;
  for (const p of g.players) for (const k of Object.keys(stats)) stats[k] += p.stats[k];
  // 試合後に状態が残らないこと（T18）
  Sim.resetForRematch(g, m % 2 === 1);
  if (g.players.some(p => p.marks || p.camo || p.reveal || p.returning)) { console.log("再戦で状態が残った"); process.exit(1); }
}
const avg = claimTimes.length ? (claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length) : 0;
console.log(`試合数 ${N} / 難易度 ${dif}`);
console.log(`旗取得 ${results.flag}（青 ${results.blue}・橙 ${results.orange}） 同着 ${results.tie} 引き分け ${results.timeout} 延長突入 ${overtime}`);
console.log(`初回旗取得の平均 ${avg.toFixed(1)}秒（最短 ${Math.min(...claimTimes).toFixed(1)} / 最長 ${Math.max(...claimTimes).toFixed(1)}） 20秒未満決着 ${quick}本`);
console.log("取得者の役割:", JSON.stringify(byRole));
console.log(`1試合平均: 擬態 ${(stats.hides / N).toFixed(1)} 見破り成功 ${(stats.reveals / N).toFixed(1)} 命中 ${(stats.hits / N).toFixed(1)} 帰還 ${(stats.returns / N).toFixed(1)} 合図 ${(stats.pings / N).toFixed(1)}`);
