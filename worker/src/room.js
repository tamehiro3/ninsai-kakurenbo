// 合言葉ごとの部屋（Durable Object）。ロビー→作戦→試合→結果→ロビー を管理し、判定は sim.js で行う。
// 設計書09：入力は「方向と行動」だけ受け取り、座標・命中・旗取得はここが決める。切断は20秒の猶予のあとBotが引き継ぐ。
import { Sim, DATA } from "./sim_bundle.js";

const TICK_MS = 1000 / 30;
const SNAP_EVERY = 2;                 // 15Hz で配信
const GRACE_MS = 20000;               // 再接続の猶予
const IDLE_MS = 30 * 60 * 1000;       // 誰もいない部屋を消すまで
const MAX_HUMANS = 6;
const ROLES = ["vanguard", "scout", "decoy"];

function rid(n = 8) { const b = new Uint8Array(n); crypto.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
function pickChar(exclude) {
  const all = DATA.CHARS.map((c, i) => i).filter(i => !exclude.includes(i));
  const pool = all.length ? all : DATA.CHARS.map((c, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
}

export class Room {
  constructor(state, env) {
    this.state = state; this.env = env;
    this.lobby = null; this.g = null; this.timer = null; this.lastSent = new Map(); this.endAt = 0; this.tickCount = 0;
    this.state.blockConcurrencyWhile(async () => { this.lobby = (await this.state.storage.get("lobby")) || null; });
  }

  // ---------- 保存・配信 ----------
  async save() { await this.state.storage.put("lobby", this.lobby); await this.state.storage.setAlarm(Date.now() + IDLE_MS); }
  sockets() { return this.state.getWebSockets(); }
  pidOf(ws) { const a = ws.deserializeAttachment(); return a && a.pid; }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) { } }
  broadcast(o) { for (const ws of this.sockets()) this.send(ws, o); }
  publicLobby() {
    if (!this.lobby) return null;
    return { code: this.lobby.code, hostId: this.lobby.hostId, phase: this.lobby.phase, difficulty: this.lobby.difficulty,
      players: this.lobby.players.map(p => ({ id: p.id, name: p.name, charId: p.charId, team: p.team, role: p.role, connected: p.connected, host: p.id === this.lobby.hostId })) };
  }
  pushLobby() { this.broadcast({ t: "lobby", lobby: this.publicLobby() }); }

  // ---------- 入口 ----------
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/state") return new Response(JSON.stringify({ lobby: this.publicLobby(), inMatch: !!this.g }), { headers: { "Content-Type": "application/json" } });
    if (url.pathname === "/reset") {
      this.lobby = { code: url.searchParams.get("code"), hostId: null, players: [], phase: "lobby", difficulty: "normal", created: Date.now() };
      this.g = null; this.stopLoop();
      await this.save();
      return new Response("ok");
    }
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      if (!this.lobby) { this.lobby = { code: url.searchParams.get("code"), hostId: null, players: [], phase: "lobby", difficulty: "normal", created: Date.now() }; await this.save(); }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ pid: null });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  // ---------- メッセージ ----------
  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    const pid = this.pidOf(ws);
    const L = this.lobby;
    if (!L) return;
    switch (m.t) {
      case "join": return this.onJoin(ws, m);
      case "ping": return this.send(ws, { t: "pong", at: m.at });
      case "set": {
        const p = L.players.find(x => x.id === pid); if (!p || L.phase !== "lobby") return;
        if (m.team === 0 || m.team === 1) { const humans = L.players.filter(x => x.team === m.team && x.id !== p.id).length; if (humans < 3) p.team = m.team; }
        if (typeof m.charId === "string" && DATA.CHARS.some(c => c.id === m.charId)) { p.charId = m.charId; p.name = this.nameFor(p); }
        if (ROLES.includes(m.role)) p.role = m.role;
        await this.save(); this.pushLobby(); return;
      }
      case "difficulty": { if (pid !== L.hostId) return; if (DATA.DIFFICULTY[m.value]) { L.difficulty = m.value; await this.save(); this.pushLobby(); } return; }
      case "start": { if (pid !== L.hostId || L.phase !== "lobby") return; return this.startMatch(); }
      case "depart": { if (pid === L.hostId && this.g && this.g.phase === "briefing") this.g.timer = 0; return; }
      case "input": { const p = this.g && this.g.players.find(x => x.id === pid); if (p && !p.bot) Sim.netInput(p, m); return; }
      case "rematch": { if (pid !== L.hostId || !this.g || this.g.phase !== "finished") return; return this.rematch(!!m.swap); }
      case "tolobby": { if (pid !== L.hostId) return; return this.toLobby(); }
      case "leave": { return this.onLeave(ws, true); }
    }
  }
  async webSocketClose(ws) { await this.onLeave(ws, false); }
  async webSocketError(ws) { await this.onLeave(ws, false); }

  nameFor(p) {
    const base = (DATA.CHARS.find(c => c.id === p.charId) || DATA.CHARS[0]).name;
    const same = this.lobby.players.filter(x => x.id !== p.id && x.charId === p.charId).length;
    return same ? base + "②③④⑤⑥"[Math.min(same - 1, 4)] : base;
  }

  async onJoin(ws, m) {
    const L = this.lobby;
    let p = m.token ? L.players.find(x => x.token === m.token) : null;
    if (p) {
      // 再接続
      p.connected = true; p.graceAt = 0;
      const gp = this.g && this.g.players.find(x => x.id === p.id);
      if (gp) { gp.connected = true; gp.bot = false; }
    } else {
      if (L.phase !== "lobby") return this.send(ws, { t: "error", error: "この部屋は試合中です。終わるまで待ってからもう一度" });
      if (L.players.filter(x => x.connected).length >= MAX_HUMANS) return this.send(ws, { t: "error", error: "この部屋は6人でいっぱいです" });
      // 切断したまま20秒以上たった人は席を空ける
      L.players = L.players.filter(x => x.connected || (x.graceAt && Date.now() - x.graceAt < GRACE_MS));
      const blue = L.players.filter(x => x.team === 0).length, orange = L.players.filter(x => x.team === 1).length;
      const team = blue <= orange ? 0 : 1;
      const used = L.players.filter(x => x.team === team).map(x => x.role);
      p = { id: "p" + rid(4), token: rid(12), charId: DATA.CHARS.some(c => c.id === m.charId) ? m.charId : "kohaku", team, role: ROLES.find(r => !used.includes(r)) || "scout", connected: true, graceAt: 0, joined: Date.now() };
      p.name = this.nameFor(p);
      L.players.push(p);
      if (!L.hostId || !L.players.some(x => x.id === L.hostId && x.connected)) L.hostId = p.id;
    }
    ws.serializeAttachment({ pid: p.id });
    await this.save();
    this.send(ws, { t: "joined", you: { id: p.id, token: p.token }, lobby: this.publicLobby(), rules: Sim.R.version });
    this.pushLobby();
    if (this.g) { this.lastSent.set(p.id, { eff: 0, logTick: -1 }); this.sendSnapshot(ws, p.id, true); }
  }

  async onLeave(ws, explicit) {
    const pid = this.pidOf(ws);
    try { ws.close(1000, "bye"); } catch (e) { }
    const L = this.lobby; if (!L || !pid) return;
    const p = L.players.find(x => x.id === pid); if (!p) return;
    p.connected = false; p.graceAt = Date.now();
    const gp = this.g && this.g.players.find(x => x.id === pid);
    if (gp) {
      gp.connected = false;
      if (explicit) this.handOverToBot(gp); else setTimeout(() => { if (gp.connected === false && !gp.bot) this.handOverToBot(gp); }, GRACE_MS);
    }
    if (explicit || L.phase === "lobby") {
      L.players = L.players.filter(x => x.id !== pid || (!explicit && this.g));
    }
    // ホストが抜けたら、つながっている人へ引き継ぐ
    if (L.hostId === pid) { const next = L.players.find(x => x.connected); L.hostId = next ? next.id : null; }
    await this.save();
    this.pushLobby();
    if (!L.players.some(x => x.connected) && !this.g) { /* 誰もいない：アラームで掃除 */ }
  }
  handOverToBot(gp) { gp.bot = true; gp.ai = Sim.freshAi(); Sim.assignAi(this.g, gp); Sim.logEvent(this.g, "botTakeover", { id: gp.id }); }

  // ---------- 試合 ----------
  async startMatch() {
    const L = this.lobby;
    const humans = L.players.filter(x => x.connected);
    if (!humans.length) return;
    const players = [];
    const usedChars = humans.map(h => DATA.charIndex(h.charId));
    for (const team of [0, 1]) {
      const mine = humans.filter(h => h.team === team);
      const usedRoles = mine.map(h => h.role);
      let slot = 0;
      for (const h of mine) players.push({ id: h.id, team, char: DATA.charIndex(h.charId), role: h.role, slot: slot++, bot: false, name: h.name });
      let n = 0;
      while (mine.length + n < 3) {
        const role = ROLES.find(r => !usedRoles.includes(r)) || ROLES[n % 3]; usedRoles.push(role);
        const ch = pickChar(usedChars); usedChars.push(ch);
        players.push({ id: `b${team}${n}`, team, char: ch, role, slot: slot++, bot: true });
        n++;
      }
    }
    this.g = Sim.createMatch({ players, seed: (Date.now() % 1000000) | 1, difficulty: L.difficulty || "normal" });
    L.phase = "match"; this.endAt = 0; this.lastSent = new Map();
    await this.save();
    this.broadcast({ t: "start", lobby: this.publicLobby(), players: this.g.players.map(p => ({ id: p.id, team: p.team, char: p.char, role: p.role, name: p.name, bot: p.bot })) });
    this.startLoop();
  }
  startLoop() {
    this.stopLoop();
    this.tickCount = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stopLoop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  tick() {
    const g = this.g; if (!g) return this.stopLoop();
    if (g.phase !== "finished") Sim.step(g);
    this.tickCount++;
    if (this.tickCount % SNAP_EVERY === 0) for (const ws of this.sockets()) { const pid = this.pidOf(ws); if (pid) this.sendSnapshot(ws, pid, false); }
    if (g.phase === "finished") {
      if (!this.endAt) {
        this.endAt = Date.now();
        this.broadcast({ t: "end", result: { winner: g.winner, claimants: g.claimants, reason: g.reason, elapsed: g.elapsed, overtime: g.overtime,
          players: g.players.map(p => ({ id: p.id, team: p.team, char: p.char, role: p.role, name: p.name, bot: p.bot, stats: p.stats })) } });
      } else if (Date.now() - this.endAt > 90000) { this.toLobby(); }
    }
  }
  sendSnapshot(ws, pid, full) {
    const g = this.g; if (!g) return;
    const last = this.lastSent.get(pid) || { eff: 0, logTick: -1 };
    const snap = Sim.snapshot(g, pid);
    snap.t = "snap";
    snap.effects = g.effects.filter(e => e.id > last.eff && Sim.effectVisible(g, pid, e)).map(e => ({ id: e.id, type: e.type, x: e.x, y: e.y, life: e.life, maxLife: e.maxLife, team: e.team, angle: e.angle, owner: e.owner, target: e.target, text: e.text, icon: e.icon, kind: e.kind, marks: e.marks }));
    snap.log = g.log.filter(l => l.tick > last.logTick);
    if (full) snap.full = true;
    this.lastSent.set(pid, { eff: g.effects.length ? Math.max(last.eff, ...g.effects.map(e => e.id)) : last.eff, logTick: g.log.length ? g.log[g.log.length - 1].tick : last.logTick });
    this.send(ws, snap);
  }
  async rematch(swap) {
    if (!this.g) return;
    Sim.resetForRematch(this.g, swap);
    if (swap) for (const p of this.lobby.players) p.team = 1 - p.team;
    this.endAt = 0; this.lastSent = new Map();
    await this.save();
    this.broadcast({ t: "start", lobby: this.publicLobby(), players: this.g.players.map(p => ({ id: p.id, team: p.team, char: p.char, role: p.role, name: p.name, bot: p.bot })) });
    this.startLoop();
  }
  async toLobby() {
    this.stopLoop(); this.g = null; this.endAt = 0;
    const L = this.lobby; L.phase = "lobby";
    L.players = L.players.filter(x => x.connected);
    if (!L.players.some(x => x.id === L.hostId)) L.hostId = L.players[0] ? L.players[0].id : null;
    await this.save();
    this.broadcast({ t: "tolobby", lobby: this.publicLobby() });
  }

  // 誰もいない部屋は消す
  async alarm() {
    if (this.sockets().length === 0) { this.stopLoop(); this.g = null; await this.state.storage.deleteAll(); }
    else await this.state.storage.setAlarm(Date.now() + IDLE_MS);
  }
}
