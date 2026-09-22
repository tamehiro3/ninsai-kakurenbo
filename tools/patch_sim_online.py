# -*- coding: utf-8 -*-
"""sim.js にオンライン対戦用の関数（観戦者ごとの snapshot・netInput・切断処理）と
「手ごわい」Botの攻撃性・速度・複雑さを追加する（1回だけ実行。再実行しても二重適用しない）"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "sim.js")
s = open(p, encoding="utf-8").read()
if "function snapshot(g, viewerId)" in s:
    print("already patched"); raise SystemExit(0)

def rep(old, new):
    global s
    assert old in s, ("NOT FOUND: " + old[:70])
    s = s.replace(old, new, 1)

# --- 切断中の人間は入力ゼロ・擬態解除（設計書09） ---
rep('''      if (p.bot) { if (p.controller) p.controller(g, p, dt); else botThink(g, p); }
''', '''      if (p.bot) { if (p.controller) p.controller(g, p, dt); else botThink(g, p); }
      else if (p.connected === false) { p.input = { x: 0, y: 0, actions: [], angle: null }; if (p.camo) unhide(g, p); }
''')
rep('''      input: { x: 0, y: 0, actions: [], angle: null },
      stats: {''', '''      input: { x: 0, y: 0, actions: [], angle: null }, connected: true, netSeq: 0,
      stats: {''')

# --- 手ごわい：Botだけ速く・撃つ距離を伸ばす ---
rep('''      const base = p.camo === 2 ? R.camoSpeed : p.crouch ? R.crouchSpeed : R.speed;
      const speed = base * (p.slow > 0 ? R.slowFactor : 1);''',
'''      const base = p.camo === 2 ? R.camoSpeed : p.crouch ? R.crouchSpeed : R.speed;
      const speed = base * (p.slow > 0 ? R.slowFactor : 1) * (p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1);''')
rep('''      if (d <= 7.5 && p.shotCd <= 0) {
        actions.push("shot"); ai.shotAt = g.elapsed;''',
'''      if (d <= (dif.aggro ? 7.9 : 7.5) && p.shotCd <= 0) {
        actions.push("shot"); ai.shotAt = g.elapsed;''')
# 攻撃性：最短取得時間・待ち伏せの突入・陽動の間隔
rep('''    for (const p of g.players) p.ai.minClaim = 35 + rng(g) * 30;
    return g;
  }
  function resetForRematch''',
'''    for (const p of g.players) assignAi(g, p);
    return g;
  }
  // 難易度ごとの初期値（手ごわい＝早く取りに行く・ルートも役割どおりとは限らない）
  function assignAi(g, p) {
    const dif = g.difficulty;
    p.ai.minClaim = dif.aggro ? 18 + rng(g) * 15 : 35 + rng(g) * 30;
    p.ai.routeOverride = null;
    if (dif.aggro && p.bot && rng(g) < 0.5) {
      const routes = Object.keys(D.MAP.routes);
      p.ai.routeOverride = routes[(rng(g) * routes.length) | 0];
    }
  }
  function resetForRematch''')
rep('''    g.players = players;
    for (const p of g.players) p.ai.minClaim = 35 + rng(g) * 30;
    return g;''',
'''    g.players = players;
    for (const p of g.players) assignAi(g, p);
    return g;''')
rep('''  function routeFor(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[1];
    const rt = D.MAP.routes[role.route];''',
'''  function routeFor(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[1];
    const rt = D.MAP.routes[(p.ai && p.ai.routeOverride) || role.route];''')
rep('''    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[2];
    const h = HARASS[role.route] || HARASS.south;''',
'''    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[2];
    const h = HARASS[(p.ai && p.ai.routeOverride) || role.route] || HARASS.south;''')
rep('''          ai.phase = "wait"; ai.goAt = g.elapsed + 25 + rng(g) * 20; ai.waitT = 0;''',
    '''          ai.phase = "wait"; ai.goAt = g.elapsed + (dif.aggro ? 8 + rng(g) * 10 : 25 + rng(g) * 20); ai.waitT = 0;''')
rep('''      const engaged = g.elapsed > 30 && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
      const go = late || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > 30 && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));
      if (go) ai.phase = "go";''',
'''      const minT = dif.aggro ? 12 : 30;
      const engaged = g.elapsed > minT && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
      const go = late || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > minT && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));
      if (go) ai.phase = "go";''')
rep('''        const engaged = g.elapsed > 30 && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
        go = go || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > 30 && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));''',
'''        const minT = dif.aggro ? 12 : 30;
        const engaged = g.elapsed > minT && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
        go = go || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > minT && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));''')
rep('''        if (g.elapsed - ai.hzT > 3 + rng(g) * 3 && p.marks === 0) { ai.hz = "attack"; ai.hzT = g.elapsed; }''',
    '''        if (g.elapsed - ai.hzT > (dif.aggro ? 1.5 + rng(g) * 1.5 : 3 + rng(g) * 3) && p.marks === 0) {
          ai.hz = "attack"; ai.hzT = g.elapsed;
          // 手ごわい：覗く場所を変えて読まれにくくする（複雑さ）
          if (dif.aggro && rng(g) < 0.5) { const routes = Object.keys(D.MAP.routes); ai.routeOverride = routes[(rng(g) * routes.length) | 0]; }
        }''')
# 攻撃性：発見された敵が近ければ追う（手ごわいのみ）
rep('''      } else {
        const z = zoneAt(p.x, p.y);
        const nearThreat = !!ai.suspect || enemies.some(q => q.returning <= 0 && dist(p, q) < 9 && lineClear(p.x, p.y, q.x, q.y));''',
'''      } else {
        const hunt = dif.aggro && !hold && shared.find(q => dist(p, q) < 12 && dist(q, FLAG) > 2);
        if (hunt) move = steer(g, p, hunt);
        const z = zoneAt(p.x, p.y);
        const nearThreat = !!ai.suspect || enemies.some(q => q.returning <= 0 && dist(p, q) < 9 && lineClear(p.x, p.y, q.x, q.y));''')

# --- オンライン対戦用 ---
rep('''  // 観戦側（人間）の可視情報：敵をどう描くか
  function enemyView(viewer, q) {''',
'''  // ネット対戦：受け取った入力を反映（連番の重複・古い入力は捨てる。行動は次のtickまで溜める）
  function netInput(p, m) {
    if (!m || typeof m !== "object") return;
    const seq = m.seq | 0;
    if (seq <= (p.netSeq | 0)) return;
    p.netSeq = seq;
    const n = v => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    let x = n(m.x), y = n(m.y);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.input.x = x; p.input.y = y;
    p.input.angle = Number.isFinite(m.angle) ? m.angle : null;
    const acts = Array.isArray(m.actions) ? m.actions.filter(a => ACTIONS.includes(a) || (typeof a === "string" && a.startsWith("ping:"))).slice(0, 6) : [];
    for (const a of acts) if (!p.input.actions.includes(a)) p.input.actions.push(a);
  }
  // ネット対戦：観戦者ごとに見える情報だけを抜き出す（壁の向こうの敵は送らない・擬態中の敵は布の位置だけ）
  function pubPlayer(p, full) {
    const o = { id: p.id, team: p.team, char: p.char, name: p.name, bot: p.bot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: +p.angle.toFixed(2),
      crouch: p.crouch, camo: p.camo, camoEnter: p.camoEnter, camoPattern: p.camoPattern, reveal: p.reveal, marks: p.marks, protect: p.protect, returning: p.returning,
      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, stats: p.stats, role: p.role });
    return o;
  }
  function snapshot(g, viewerId) {
    const v = g.players.find(p => p.id === viewerId);
    const players = [], sounds = [];
    for (const p of g.players) {
      if (!v || p.team === v.team) { players.push(pubPlayer(p, p === v)); continue; }
      const view = enemyView(v, p);
      if (view === "none") {
        if (p.pulse && p.returning <= 0) players.push({ id: p.id, team: p.team, x: +p.x.toFixed(1), y: +p.y.toFixed(1), pulse: true, pulseOnly: true, lastSeen: p.lastSeen });
        else if (p.lastSeen) players.push({ id: p.id, team: p.team, ghost: true, lastSeen: p.lastSeen });
        if (audible(v, p)) sounds.push({ a: +Math.atan2(p.y - v.y, p.x - v.x).toFixed(2), d: +dist(v, p).toFixed(1) });
        continue;
      }
      if (view === "cloth") players.push({ id: p.id, team: p.team, char: p.char, name: "", x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: 0, camo: 2, camoPattern: p.camoPattern, speedNow: +p.speedNow.toFixed(2), cloth: true, reveal: 0, marks: 0, protect: 0, returning: 0, crouch: false });
      else { const o = pubPlayer(p, false); o.lastSeen = p.lastSeen; players.push(o); }
    }
    const shots = g.shots.filter(s => !v || s.team === v.team || (dist(v, s) < 22 && lineClear(v.x, v.y, s.x, s.y))).map(s => ({ id: s.id, team: s.team, x: +s.x.toFixed(2), y: +s.y.toFixed(2), angle: +s.angle.toFixed(2) }));
    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds };
  }
  // 効果は観戦者に関係あるものだけ（合図は味方のみ）
  function effectVisible(g, viewerId, e) {
    const v = g.players.find(p => p.id === viewerId);
    if (!v) return true;
    if (e.type === "ping") return e.team === v.team;
    if (e.type === "win" || e.type === "overtime") return true;
    if (e.team === v.team) return true;
    return dist(v, e) < 22 && lineClear(v.x, v.y, e.x, e.y);
  }
  function freshAi() {
    return { think: 0, wp: 0, phase: "route", suspect: null, seen: 0, goAt: 0, lastPing: -99, lastPingKind: "", waitT: 0, scanned: false, post: null, postT: 0, patience: 40, lastContact: -99, minClaim: 30, stepOut: false, hz: "attack", hzT: 0, quietT: 0, shotAt: -99, routeOverride: null };
  }

  // 観戦側（人間）の可視情報：敵をどう描くか
  function enemyView(viewer, q) {''')
rep('''    field, steer, createMatch, resetForRematch, makePlayer, setInput, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor };''',
    '''    field, steer, createMatch, resetForRematch, makePlayer, setInput, netInput, snapshot, effectVisible, freshAi, assignAi, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor };''')
open(p, "w", encoding="utf-8").write(s)

# --- data.js：手ごわいの数値とオンラインの接続先 ---
d = os.path.join(ROOT, "data.js")
t = open(d, encoding="utf-8").read()
old = '''  hard:   { name: "手ごわい", reaction: 0.28, aimErr: 0.06, notice: 0.55, scanUse: 0.9,  crouchNear: true,  hideRate: 0.9 },'''
new = '''  hard:   { name: "手ごわい", reaction: 0.2, aimErr: 0.05, notice: 0.7, scanUse: 0.95, crouchNear: true, hideRate: 0.9, speedMul: 1.12, aggro: true },'''
assert old in t; t = t.replace(old, new)
if "const ONLINE" not in t:
    t = t.replace('''const CONTROLS = [''', '''// オンライン対戦（合言葉の部屋）の接続先。Cloudflare Workers の無料枠で動く部屋サーバー（worker/）
const ONLINE = { url: "https://ninsai-room.3moriguchi-3.workers.dev", codeChars: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", codeLen: 4, inputHz: 20, snapshotHz: 15, reconnectGraceSec: 20 };

const CONTROLS = [''')
    t = t.replace("return { RULES, MAP_ROWS, MAP, TEAMS, CHARS, charIndex, ROLES, PINGS, DIFFICULTY, CAMO_REASONS, TUTORIAL, HOWTO, CONTROLS };",
                  "return { RULES, MAP_ROWS, MAP, TEAMS, CHARS, charIndex, ROLES, PINGS, DIFFICULTY, CAMO_REASONS, TUTORIAL, HOWTO, CONTROLS, ONLINE };")
open(d, "w", encoding="utf-8").write(t)
print("sim.js / data.js patched for online + hard mode")
