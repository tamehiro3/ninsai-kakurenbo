# -*- coding: utf-8 -*-
"""再レビュー（修正後の sim.js を設計図と再照合・20件）で見つかった不具合を直す（1回だけ実行）。"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "sim.js")
s = open(p, encoding="utf-8").read()
if "function pathClear(" in s:
    print("already patched"); raise SystemExit(0)

def rep(old, new, cnt=1):
    global s
    n = s.count(old)
    assert n == cnt, (n, "NOT FOUND/AMBIGUOUS: " + old[:110])
    s = s.replace(old, new)

# ===== 移動の通り道（地形と実体化した金剛壁だけ。霧・暗幕は視線を遮るが移動は止めない） =====
rep('''  function zoneAt(x, y) {''', '''  function pathClear(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    const n = Math.ceil(len / 0.2);
    for (let i = 1; i <= n; i++) { const t = i / n; if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false; }
    for (const o of DYN) if (o.kind === "wall" && !o.pending && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return false;
    return true;
  }
  function zoneAt(x, y) {''')

# ===== 足音：疾拍子の演奏音は10m届く／鷹の目の間は本体の聴覚が落ちる =====
rep('''  function audible(listener, src) {
    if (src.returning > 0 || src.speedNow < 0.1) return false;''',
'''  function audible(listener, src) {
    if (src.returning > 0) return false;
    const hearMul = (listener.sk && listener.sk.channel && listener.sk.channel.kind === "hawk_eye") ? 0.5 : 1;   // 鷹の目：本体は音も聞こえにくい
    if (listener.team !== src.team && src.sk && src.sk.channel && src.sk.channel.kind === "tempo") {   // 疾拍子：演奏音は10m届く
      let r = 10 * hearMul; if (!lineClear(listener.x, listener.y, src.x, src.y)) r *= 0.5;
      return dist(listener, src) <= r;
    }
    if (src.speedNow < 0.1) return false;''')
rep('''    if (!lineClear(listener.x, listener.y, src.x, src.y)) r *= 0.5;
    return dist(listener, src) <= r;
  }''', '''    r *= hearMul;
    if (!lineClear(listener.x, listener.y, src.x, src.y)) r *= 0.5;
    return dist(listener, src) <= r;
  }''')

# ===== 再戦：切断中の人は切断のまま（猶予が切れたら Bot が引き継ぐ） =====
rep('''      input: { x: 0, y: 0, actions: [], angle: null }, connected: true, netSeq: 0,''',
    '''      input: { x: 0, y: 0, actions: [], angle: null }, connected: opts.connected !== false, netSeq: 0,''')
rep('''    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role }));''',
    '''    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role, connected: p.connected }));''')

# ===== 行動の整理：停止中・露見中は "skill:〜" も捨てる／鷹の目・狙撃・疾拍子は動くと解除 =====
rep('''      if (p.exposed > 0 || p.stunT > 0) { for (const a of ["camo", "scan", "shot", "claim", "skill", "ult", "crouch"]) acts.delete(a); }''',
    '''      if (p.exposed > 0 || p.stunT > 0) { for (const a of [...acts]) if (["camo", "scan", "shot", "claim", "skill", "ult", "crouch"].includes(a) || a.startsWith("skill:")) acts.delete(a); }''')
rep('''      let moving = Math.hypot(i.x, i.y) > 0.1;
      if (i.angle != null) p.angle = i.angle;''',
    '''      let moving = Math.hypot(i.x, i.y) > 0.1;
      if (moving && p.sk.channel && p.sk.channel.cancelOnMove) { p.sk.channel = null; emit(g, "channel_cancel", p.x, p.y, { team: p.team, life: 0.4 }); }   // 鷹の目・狙撃・疾拍子は動けば解ける
      if (i.angle != null) p.angle = i.angle;''')
rep('''      case "hawk_eye": p.sk.channel = { kind: "hawk_eye", t: num(P.channel, 3), radius: num(P.radius, 14), showSec: num(P.showSec, 2), freeze: true, noShot: true, cancelOnHit: true }; fire(); break;''',
    '''      case "hawk_eye": p.sk.channel = { kind: "hawk_eye", t: num(P.channel, 3), radius: num(P.radius, 14), showSec: num(P.showSec, 2), cancelOnMove: true, noShot: true, cancelOnHit: true }; fire(); break;''')
rep('''      case "tempo": p.sk.channel = { kind: "tempo", t: num(P.channel, 5), r: num(P.r, 6), cdReduce: num(P.cdReduce, 2), freeze: true, noShot: true, cancelOnHit: true }; fire(); break;''',
    '''      case "tempo": p.sk.channel = { kind: "tempo", t: num(P.channel, 5), r: num(P.r, 6), cdReduce: num(P.cdReduce, 2), cancelOnMove: true, noShot: true, cancelOnHit: true }; fire(); break;''')
rep('''      case "snipe": p.sk.channel = { kind: "snipe", t: num(P.channel, 1.2), range: num(P.range, 14), speed: num(P.speed, 28), freeze: true, noShot: true, cancelOnHit: true }; unhide(g, p); fire(); break;''',
    '''      case "snipe": p.sk.channel = { kind: "snipe", t: num(P.channel, 1.2), range: num(P.range, 14), speed: num(P.speed, 28), cancelOnMove: true, noShot: true, cancelOnHit: true }; unhide(g, p); fire(); break;''')
rep('''      case "snipe": { g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(p.angle), dy: Math.sin(p.angle), travel: 0, angle: p.angle, speed: c.speed, range: c.range, snipe: true }); emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 }); break; }''',
    '''      case "snipe": { const ang = p.angle + (p.aimJitter > 0 ? (rng(g) - 0.5) * 0.8 : 0); g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), travel: 0, angle: ang, speed: c.speed, range: c.range, snipe: true }); emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 }); break; }   // 迅雷羽の照準乱れは狙撃にも効く''')

# ===== 追香：外した印では消費しない（命中したときだけ付く） =====
rep('''          const poison = p.sk.poisonArmed > 0;''', '''          const poison = p.sk.poisonArmed > 0;   // 当たったときに消費する''')
rep('''          if (poison) p.sk.poisonArmed = 0;
''', '')
rep('''    if (s.poison) { addMod(q, "tracked", s.poisonDur || 6, { by: s.team }); }''',
    '''    if (s.poison && owner && owner.sk.poisonArmed > 0) { owner.sk.poisonArmed = 0; addMod(q, "tracked", owner.sk.poisonDur || 6, { by: s.team }); }''')

# ===== 露見：Bot の持ち場はそのまま（手当で現場復帰したら持ち場へ戻る。自陣へ戻ったときだけ最初から） =====
rep('''    if (q.bot) { q.ai.phase = "route"; q.ai.wp = 0; }
''', '')

# ===== 罪業の中では影穴の出口も変わり身も使えない =====
rep('''      if (gate) {
        const P0 = sk.params || {};
        if (dist(p, gate) > 1.5) return;''', '''      if (gate) {
        const P0 = sk.params || {};
        if (dist(p, gate) > 1.5 || enemyNullAt(p)) return;''')
rep('''    if (q.sk.kawarimi > 0) {''', '''    if (q.sk.kawarimi > 0 && !enemyNullAt(q)) {''')
# 変わり身の移動は霧・暗幕では止まらない（壁は越えない）
rep('''if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; q.px = nx; q.py = ny; break; } }
      q.invuln = R.hitInvuln; return;''',
    '''if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; q.px = nx; q.py = ny; break; } }
      q.invuln = R.hitInvuln; return;''')

# ===== 影穴の出口：どちらかの陣地（敵が入れない場所）には置かない／敵は歩ける出口にだけ移す =====
rep('''      if (blocked(nx, ny, R.bodyRadius, p.team) || !lineClear(gate.x, gate.y, nx, ny)) break;''',
    '''      if (blocked(nx, ny, R.bodyRadius, p.team) || blocked(nx, ny, R.bodyRadius, 1 - p.team) || !pathClear(gate.x, gate.y, nx, ny)) break;''')
rep('''      if (o.kind === "gate" && o.exit && o.team !== p.team && !o.enemyUsed && dist(p, o) <= o.r) {''',
    '''      if (o.kind === "gate" && o.exit && o.team !== p.team && !o.enemyUsed && dist(p, o) <= o.r && !blocked(o.exit.x, o.exit.y, R.bodyRadius, p.team)) {''')

# ===== 線の設置物・跳躍・閃光・押し出しの通り道は pathClear（霧・暗幕で止まらない） =====
rep('''for (let d = 0.25; d <= len + 1e-6; d += 0.25) { const nx = p.x + Math.cos(p.angle) * d, ny = p.y + Math.sin(p.angle) * d; if (SOLID[cellAt(nx, ny)] || !lineClear(p.x, p.y, nx, ny)) break; ex = nx; ey = ny; }''',
    '''for (let d = 0.25; d <= len + 1e-6; d += 0.25) { const nx = p.x + Math.cos(p.angle) * d, ny = p.y + Math.sin(p.angle) * d; if (SOLID[cellAt(nx, ny)] || !pathClear(p.x, p.y, nx, ny)) break; ex = nx; ey = ny; }''')
rep('''          if (blocked(nx, ny, R.bodyRadius, p.team) || !lineClear(p.x, p.y, nx, ny)) break;
          if (DYN.some(o => o.kind === "zone_null" && Math.hypot(nx - o.x, ny - o.y) <= o.r) !== inNull0) break;''',
    '''          if (blocked(nx, ny, R.bodyRadius, p.team) || !pathClear(p.x, p.y, nx, ny)) break;
          if (DYN.some(o => o.kind === "zone_null" && Math.hypot(nx - o.x, ny - o.y) <= o.r) !== inNull0) break;''')
rep('''        if (!blocked(c.tx, c.ty, R.bodyRadius, p.team) && lineClear(p.x, p.y, c.tx, c.ty)) {''',
    '''        if (!blocked(c.tx, c.ty, R.bodyRadius, p.team) && pathClear(p.x, p.y, c.tx, c.ty)) {''')
rep('''      case "dash": { let done = false; for (let dd = c.dist; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && lineClear(p.x, p.y, nx, ny)) {''',
    '''      case "dash": { let done = false; for (let dd = c.dist; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && pathClear(p.x, p.y, nx, ny)) {''')
# 巨人の一撃：前方（±60°）・射線あり・術者から2.5m
rep('''        const a = aheadPos(p, c.reach / 2); let hit = 0;
        const push = (x, y) => { const ang = Math.atan2(y - p.y, x - p.x); return { dx: Math.cos(ang) * c.push, dy: Math.sin(ang) * c.push }; };
        for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.exposed <= 0 && dist(a, q) <= c.reach) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); }''',
'''        const a = aheadPos(p, c.reach / 2); let hit = 0;
        const push = (x, y) => { const ang = Math.atan2(y - p.y, x - p.x); return { dx: Math.cos(ang) * c.push, dy: Math.sin(ang) * c.push }; };
        const inFront = (x, y, extra) => Math.hypot(x - p.x, y - p.y) <= c.reach + extra && (Math.hypot(x - p.x, y - p.y) < 0.6 || Math.abs(angDiff(Math.atan2(y - p.y, x - p.x), p.angle)) <= Math.PI / 3) && pathClear(p.x, p.y, x, y);   // 前方2.5m・壁の向こうには届かない
        for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.exposed <= 0 && inFront(q.x, q.y, R.bodyRadius)) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); }''')
rep('''          if (dist(a, o) > c.reach + (o.r || o.half || 0)) continue;''',
    '''          if (!inFront(o.x, o.y, o.r || o.half || 0.5)) continue;''')
rep('''      for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } }
      unhide(g, q); setReveal(q, 1);
    }
    // 範囲攻撃で分身は同時に消える''',
'''      for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } }
      unhide(g, q); setReveal(q, 1);
    }
    // 範囲攻撃で分身は同時に消える''')

# ===== 金剛壁：立ち上がった瞬間に線の上にいた者は、いた側へ押し出す（4秒間固まらない） =====
rep('''      if (o.kind === "wall" && o.pending && o.age >= o.warn - EPS) { o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 }); }''',
'''      if (o.kind === "wall" && o.pending && o.age >= o.warn - EPS) {
        o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 });
        const L = Math.hypot(o.bx - o.ax, o.by - o.ay) || 1, ux = -(o.by - o.ay) / L, uy = (o.bx - o.ax) / L;
        for (const q of g.players) {
          if (q.returning > 0) continue;
          const d = segDist(q.x, q.y, o.ax, o.ay, o.bx, o.by); if (d >= R.bodyRadius + 0.26) continue;
          const side = ((q.x - o.ax) * ux + (q.y - o.ay) * uy) >= 0 ? 1 : -1;
          let moved = false;
          for (const sd of [side, -side]) { for (let k = 0; k < 10 && !moved; k++) { const need = R.bodyRadius + 0.3 - (sd === side ? d : -d) + k * 0.1; const tx = q.x + ux * sd * need, ty = q.y + uy * sd * need; if (!blocked(tx, ty, R.bodyRadius, q.team)) { q.x = tx; q.y = ty; q.px = tx; q.py = ty; moved = true; } } if (moved) break; }
        }
      }''')

# ===== 棘道：踏んだ敵の「足跡」を3秒表示（擬態は解かず・全体公開もしない） =====
rep('''      if (o.kind === "thorns" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= (p.crouch ? 0.2 : 0.4) && !(o.last === p.id && g.elapsed - o.lastT < 3)) { o.last = p.id; o.lastT = g.elapsed; setReveal(p, o.revealSec); emit(g, "found", p.x, p.y, { team: o.team, target: p.id }); }''',
    '''      if (o.kind === "thorns" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= (p.crouch ? 0.2 : 0.4) && !(o.last === p.id && g.elapsed - o.lastT < 3)) { o.last = p.id; o.lastT = g.elapsed; addMod(p, "fogTrail", o.revealSec, { src: "thornsTrail" }); emit(g, "footprint", p.x, p.y, { team: o.team, life: o.revealSec }); }''')

# ===== ログ：観戦者に関係あるものだけ（合図・系統・奥義は味方だけ、見えていない敵の固有技は送らない） =====
rep('''  // 効果は観戦者に関係あるものだけ（合図は味方のみ）''', '''  const PUBLIC_LOG = { start: 1, end: 1, overtime: 1, levelup: 1, pulse: 1, botTakeover: 1, "return": 1 };
  function logVisible(g, viewerId, l) {
    const v = g.players.find(p => p.id === viewerId);
    if (!v) return true;
    if (l.type === "ping" || l.type === "perk" || l.type === "ult") return l.team === v.team;
    if (l.team === v.team) return true;
    const mine = id => { const q = id != null && g.players.find(p => p.id === id); return !!q && q.team === v.team; };
    if (mine(l.id) || mine(l.by)) return true;
    if (l.type === "skill") { const c = g.players.find(p => p.id === l.id); return !!c && enemyView(v, c) !== "none"; }
    return !!PUBLIC_LOG[l.type];
  }
  // 効果は観戦者に関係あるものだけ（合図は味方のみ）''')
rep('''    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, balNow, skillCdFor, inZone, trackDirFor, bindDyn, get objects() { return DYN; } };''',
    '''    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, balNow, skillCdFor, inZone, trackDirFor, bindDyn, logVisible, pathClear, get objects() { return DYN; } };''')

# ===== Bot =====
# 露見中の敵は的にも脅威にもならない
rep('''    const enemies = g.players.filter(q => q.team !== p.team);
    const mates = g.players.filter(q => q.team === p.team && q !== p);
    const flagD = dist(p, FLAG);
    const late = g.overtime || g.elapsed > 120;''',
    '''    const enemies = g.players.filter(q => q.team !== p.team && q.exposed <= 0);   // 露見中の敵は印が当たらず旗も掴めない
    const mates = g.players.filter(q => q.team === p.team && q !== p);
    const flagD = dist(p, FLAG);
    const late = g.overtime || g.elapsed > 120;''')
# 旗を掴めるなら手当より先／構え（動くと解ける技）の間は止まる
rep('''    // ---- 味方の手当（敵が見えていなければ寄って静止する）----''',
    '''    // ---- 旗を掴めるなら最優先（手当より先）----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"] }); return; }
    // ---- 動くと解ける構え（鷹の目・狙撃・疾拍子）の間は止まる。近くに敵が迫ったら構えを捨てて動く ----
    if (p.sk.channel && p.sk.channel.cancelOnMove) {
      const th = seen[0];
      if (!(th && dist(p, th) < 4 && p.sk.channel.kind !== "snipe")) { setInput(p, { x: 0, y: 0, actions: [], angle: th ? Math.atan2(th.y - p.y, th.x - p.x) : null }); return; }
    }
    // ---- 味方の手当（敵が見えていなければ寄って静止する）----''')
rep('''    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);''',
    '''    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);
    if (skillActs.includes("skill") && p.ai.faceAngle != null) { const fa = p.ai.faceAngle; p.ai.faceAngle = null; setInput(p, { x: 0, y: 0, actions: skillActs, angle: fa }); return; }   // 花隠れ：味方のほうを向いて置く''')
# 擬態中：狐駆け・影渡りがあるときは柄の上を旗へにじり寄る
rep('''    if (p.camo === 2) {
      const threat = enemies.some(q => q.returning <= 0 && dist(p, q) < 11 && (lineClear(p.x, p.y, q.x, q.y) || audible(p, q)));
      const tooClose = enemies.some(q => q.returning <= 0 && dist(p, q) < 1.6);''',
'''    if (p.camo === 2) {
      const threat = enemies.some(q => q.returning <= 0 && dist(p, q) < 11 && (lineClear(p.x, p.y, q.x, q.y) || audible(p, q)));
      const tooClose = enemies.some(q => q.returning <= 0 && dist(p, q) < 1.6);
      const fast = modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影");
      if (fast && !tooClose && flagD > R.flagNoCamo + 0.5) {
        const mv = steer(g, p, FLAG);
        if (zoneAt(p.x + mv.x * 0.6, p.y + mv.y * 0.6)) { setInput(p, { x: mv.x, y: mv.y, actions: [] }); return; }
      }''')
# 技の使いどころ：狐駆け・影渡りは柄の先が旗へ続くとき／花隠れは布を広げそうな味方の前
rep('''      if (t === "影" && p.camo === 2 && flagD > 3 && flagD < 14) acts.push("ult");''',
    '''      if (t === "影" && p.camo === 2 && flagD > 3 && flagD < 14 && zoneTowardFlag(g, p)) acts.push("ult");''')
rep('''    const supportKinds = ["ally_shield", "cleanse", "soul_return", "thread", "tempo", "zone_petals"];''',
    '''    const supportKinds = ["ally_shield", "cleanse", "soul_return", "thread", "tempo"];''')
rep('''    const moveKinds = ["tailwind", "fox_dash", "paint_zone", "shadow_gate"];''',
    '''    const moveKinds = ["tailwind", "paint_zone", "shadow_gate"];''')
rep('''    else if (supportKinds.includes(k) && (hurtMate || (k === "soul_return" && mates.some(m => m.returning > 0 && !m.soulBoosted)) || (k === "zone_petals" && mates.some(m => m.camo === 1)))) acts.push("skill");''',
    '''    else if (k === "soul_return") { if (mates.some(m => m.returning > 0 && !m.soulBoosted)) acts.push("skill"); }
    else if (supportKinds.includes(k) && hurtMate) acts.push("skill");
    else if (k === "zone_petals") { const m = mates.find(m => m.camo === 0 && m.exposed <= 0 && m.returning <= 0 && m.speedNow < 0.5 && zoneAt(m.x, m.y) && dist(m, p) <= 4 && dist(m, p) > 0.5); if (m) { p.ai.faceAngle = Math.atan2(m.y - p.y, m.x - p.x); acts.push("skill"); } }
    else if (k === "fox_dash") { if (p.camo === 2 && flagD < 20 && flagD > 4 && zoneTowardFlag(g, p)) acts.push("skill"); }''')
rep('''  // Botの固有技の使いどころ（型ごと）''', '''  // 擬態したまま旗の方向へ柄が続いているか（狐駆け・影渡りの使いどころ）
  function zoneTowardFlag(g, p) { const mv = steer(g, p, FLAG); return !!zoneAt(p.x + mv.x * 1.0, p.y + mv.y * 1.0); }
  // Botの固有技の使いどころ（型ごと）''')

open(p, "w", encoding="utf-8").write(s)
print("sim.js fixed (round 2)")
