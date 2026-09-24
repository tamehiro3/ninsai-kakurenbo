// 部屋サーバー（worker/src/room.js）の回帰テスト。Cloudflare を使わず node だけで動かす
//   python ninsai-kakurenbo/tools/build_worker.py && node ninsai-kakurenbo/tools/roomtest.mjs
import { pathToFileURL } from "url";
import path from "path";
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const src = f => pathToFileURL(path.join(here, "..", "worker", "src", f)).href;
const timers = [];
globalThis.setTimeout = f => { timers.push(f); return timers.length; };
const { Room } = await import(src("room.js"));
const { Sim } = await import(src("sim_bundle.js"));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("NG:", m); } };
const storage = { get: async () => null, put: async () => {}, setAlarm: async () => {} };

// 1) 切断の猶予中に再戦しても、猶予が切れたら作り直した選手を Bot が引き継ぐ
{
  const W = [];
  const mk = pid => ({ pid, send() {}, close() {}, serializeAttachment() {}, deserializeAttachment() { return { pid }; } });
  // 部屋は起動時に storage から lobby を読み直すので、スタブも同じ lobby を返す
  const lobby = { code: "A", hostId: "pA", phase: "match", players: [
    { id: "pA", charId: "kohaku", team: 0, role: "vanguard", connected: true, name: "A" },
    { id: "pB", charId: "sakuya", team: 0, role: "scout", connected: true, name: "B" }] };
  const r = new Room({ blockConcurrencyWhile: f => f(), storage: Object.assign({}, storage, { get: async () => lobby }), getWebSockets: () => W }, {});
  await Promise.resolve(); await Promise.resolve();
  r.startLoop = () => {};
  r.lobby = lobby;
  W.push(mk("pA"), mk("pB"));
  await r.startMatch();
  r.g.phase = "finished";
  await r.onLeave(W[1], false); W.pop();
  await r.rematch(false);
  timers.splice(0).forEach(f => f());
  const g = r.g, B = g.players.find(p => p.id === "pB");
  g.phase = "playing";
  const x0 = B.x, y0 = B.y;
  for (let i = 0; i < 900; i++) Sim.step(g);
  ok(B.bot === true && Math.hypot(B.x - x0, B.y - y0) > 1, `再戦後も切断者は Bot が引き継ぐ: bot=${B.bot} 移動=${Math.hypot(B.x - x0, B.y - y0).toFixed(1)}`);
}
// 2) 敵へ送るログに、見えていない敵の固有技・合図を入れない
{
  const ws = { m: [], send(s) { this.m.push(JSON.parse(s)); }, deserializeAttachment: () => ({ pid: "pB" }) };
  const r = new Room({ blockConcurrencyWhile: f => f(), storage, getWebSockets: () => [ws] }, {});
  const g = r.g = Sim.createMatch({ players: [{ id: "pA", team: 0, char: Sim.D.charIndex("kohaku"), slot: 0 }, { id: "pB", team: 1, char: 1, slot: 0 }], seed: 3, briefing: false });
  g.phase = "playing"; g.noTimer = true;
  const [A, B] = g.players; A.protect = 0; A.x = A.px = 12; A.y = A.py = 42; B.x = B.px = 52; B.y = B.py = 8;
  Sim.setInput(A, { x: 0, y: 0, actions: ["skill", "ping:flag"] }); Sim.step(g);
  r.sendSnapshot(ws, "pB", false);
  const s = ws.m[0];
  ok(!s.players.some(p => p.id === "pA") && !s.log.some(l => l.type === "skill" || l.type === "ping"), `見えていない敵の技・合図はログに乗らない: ${JSON.stringify(s.log)}`);
}
console.log(`roomtest: OK ${pass} / NG ${fail}`);
process.exit(fail ? 1 : 0);
