# -*- coding: utf-8 -*-
"""sim.js に HP・露見・手当・チーム経験値・レベル成長（影/技/護）・能力値係数・固有技39種を組み込む（1回だけ実行）。
設計図：docs/character-balance-blueprint.txt（39体の性能）・docs/hp-level-blueprint.txt（HP・レベルアップ）"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "sim.js")
s = open(p, encoding="utf-8").read()
if "function useSkill(" in s:
    print("already patched"); raise SystemExit(0)

def rep(old, new, cnt=1):
    global s
    assert old in s, ("NOT FOUND: " + old[:90])
    s = s.replace(old, new, cnt)

# ---------------- 地形：動的な遮蔽（金剛壁・霧・暗幕）を lineClear / blocked に足す ----------------
rep('''  function blocked(x, y, r, team) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);''',
'''  // 試合中に置かれた設置物（金剛壁など）。step() の先頭で更新する
  let DYN = [];
  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    const L = vx * vx + vy * vy; const t = L > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L)) : 0;
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
  }
  function segCrossCircle(ax, ay, bx, by, cx, cy, r) { return segDist(cx, cy, ax, ay, bx, by) <= r; }
  function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  function dynBlocksMove(x, y, r) {
    for (const o of DYN) if (o.kind === "wall" && segDist(x, y, o.ax, o.ay, o.bx, o.by) < r + 0.25) return true;
    return false;
  }
  function dynBlocksLos(ax, ay, bx, by) {
    for (const o of DYN) {
      if (o.kind === "wall" && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return true;
      if ((o.kind === "zone_fog" || o.kind === "zone_dark") && Math.hypot(ax - bx, ay - by) > 1.5) {
        // 霧・暗幕：中を通る視線は遮る（両端が霧の中で1.5m以内なら見える）
        const inA = Math.hypot(ax - o.x, ay - o.y) <= o.r, inB = Math.hypot(bx - o.x, by - o.y) <= o.r;
        if (o.kind === "zone_dark" && !inA && !inB) continue;      // 暗幕は外から外は遮らない（黒い球として見える）
        if (segCrossCircle(ax, ay, bx, by, o.x, o.y, o.r)) return true;
      }
    }
    return false;
  }
  function blocked(x, y, r, team) {
    if (DYN.length && dynBlocksMove(x, y, r)) return true;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);''')
rep('''    const n = Math.ceil(len / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false;
    }
    return !SOLID[cellAt(bx, by)];
  }''',
'''    const n = Math.ceil(len / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false;
    }
    if (DYN.length && dynBlocksLos(ax, ay, bx, by)) return false;
    return !SOLID[cellAt(bx, by)];
  }''')
# 偽の擬態エリア（描景）も柄として扱う
rep('''  function zoneAt(x, y) {
    const c = cellAt(x, y);
    return (c === "b" || c === "s" || c === "w") ? c : null;
  }''',
'''  function zoneAt(x, y) {
    const c = cellAt(x, y);
    if (c === "b" || c === "s" || c === "w") return c;
    for (const o of DYN) if (o.kind === "paint_zone" && Math.abs(x - o.x) <= o.half && Math.abs(y - o.y) <= o.half) return o.pattern;
    return null;
  }''')

# ---------------- プレイヤー生成：HP・能力値係数・固有技・成長 ----------------
rep('''      reveal: 0, marks: 0, markTime: 0, invuln: 0, slow: 0,
      returning: 0, protect: 0,''',
'''      reveal: 0, marks: 0, markTime: 0, invuln: 0, slow: 0,
      returning: 0, protect: 0,
      // HP・露見・手当（設計図：HP・レベルアップ）
      hp: R.hp.byLevel[0], hpMax: R.hp.byLevel[0], exposed: 0, healT: 0, healBy: null, exposedAt: -99, silentT: 0, stunT: 0, aimJitter: 0,
      // 成長：レベルごとに選んだ系統 {2:"影",...}、選択待ち、奥義
      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, crossedCenter: false, lastSide: 0,
      // 固有技
      skillCd: 0, sk: {}, mods: [],       // mods: [{k:"speed", mul:1.15, t:4}, ...]
      bal: balanceFor(charIdx),''')
rep('''      stats: { hides: 0, hideTime: 0, reveals: 0, hits: 0, pings: 0, returns: 0, claims: 0, marked: 0 },''',
    '''      stats: { hides: 0, hideTime: 0, reveals: 0, hits: 0, pings: 0, returns: 0, claims: 0, marked: 0, damage: 0, taken: 0, hp0: 0, heals: 0, skills: 0, xp: 0 },''')
rep('''  function createMatch(opts) {
    const g = {''',
'''  // 能力値（1〜5・3が共通値）→ 係数。設計図「能力3を現行共通値とする」
  function balanceFor(charIdx) {
    const c = D.CHARS[Math.max(0, Math.min(D.CHARS.length - 1, charIdx | 0))];
    const st = (c && c.stats) || { spd: 3, camo: 3, atk: 3, def: 3, scout: 3, esc: 3 };
    const k = v => (v | 0) - 3;
    return {
      stats: st, skill: c && c.skill ? c.skill : null, tree: (c && c.tree) || "選択",
      speedMul: 1 + k(st.spd) * 0.06, camoDurMul: 1 + k(st.camo) * 0.10, camoEnterMul: 1 - k(st.camo) * 0.08, camoSpeedMul: 1 + k(st.camo) * 0.10,
      dmg: R.hp.baseDamage * (1 + k(st.atk) * 0.12), takenMul: 1 - k(st.def) * 0.08,
      scanRangeAdd: k(st.scout) * 0.5, scanCdMul: 1 - k(st.scout) * 0.06,
      slowFactor: R.slowFactor + k(st.esc) * 0.06, exposeMove: R.hp.exposeMove + k(st.esc) * 0.04,
    };
  }
  function createMatch(opts) {
    const g = {
      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, objects: [], serial2: 0,''')
rep('''    Object.assign(g, { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false,
      shots: [], effects: [], log: [], winner: [], claimants: [], reason: "", claimTick: -1, flag: "available" });''',
'''    Object.assign(g, { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false,
      shots: [], effects: [], log: [], winner: [], claimants: [], reason: "", claimTick: -1, flag: "available",
      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, objects: [] });''')

# ---------------- 入力の語彙 ----------------
rep('''  const ACTIONS = ["camo", "scan", "shot", "claim", "ping", "crouch"];''',
    '''  const ACTIONS = ["camo", "scan", "shot", "claim", "ping", "crouch", "skill", "ult"];
  const ACT_OK = a => ACTIONS.includes(a) || (typeof a === "string" && (a.startsWith("ping:") || a.startsWith("tree:") || a.startsWith("skill:")));''')
rep('''      actions: Array.isArray(i.actions) ? i.actions.filter(a => ACTIONS.includes(a) || (typeof a === "string" && a.startsWith("ping:"))).slice(0, 6) : [],''',
    '''      actions: Array.isArray(i.actions) ? i.actions.filter(ACT_OK).slice(0, 8) : [],''')
rep('''    const acts = Array.isArray(m.actions) ? m.actions.filter(a => ACTIONS.includes(a) || (typeof a === "string" && a.startsWith("ping:"))).slice(0, 6) : [];''',
    '''    const acts = Array.isArray(m.actions) ? m.actions.filter(ACT_OK).slice(0, 8) : [];''')

# ---------------- 帰還：HP全回復・露見解除 ----------------
rep('''    p.returning = R.returnWait; p.marks = 0; p.markTime = 0; p.reveal = 0; p.slow = 0;
    p.castleTime = 0; p.awayTime = 0; p.pulse = false; p.scanPending = 0;''',
'''    p.returning = R.returnWait; p.marks = 0; p.markTime = 0; p.reveal = 0; p.slow = 0;
    p.castleTime = 0; p.awayTime = 0; p.pulse = false; p.scanPending = 0;
    p.hp = p.hpMax; p.exposed = 0; p.healT = 0; p.healBy = null; p.crossedCenter = false; p.stunT = 0; p.mods = p.mods.filter(m => m.keep);''')

# ---------------- 可視：露見中は常に見える／暗幕の中は見えない ----------------
rep('''  function canSee(p, q) {
    if (q.returning > 0) return false;
    const d = dist(p, q);
    if (d > R.viewRange) return false;
    if (!lineClear(p.x, p.y, q.x, q.y)) return false;
    if (q.camo === 2 && q.reveal <= 0 && d >= R.closeSee) return false;
    return true;
  }''',
'''  function inZone(kind, x, y, team) {
    for (const o of DYN) if (o.kind === kind && (team == null || o.team === team) && Math.hypot(x - o.x, y - o.y) <= o.r) return o;
    return null;
  }
  function canSee(p, q) {
    if (q.returning > 0) return false;
    const d = dist(p, q);
    if (d > R.viewRange) return false;
    if (q.exposed > 0 && d <= R.viewRange && lineClear(p.x, p.y, q.x, q.y)) return true;
    if (!lineClear(p.x, p.y, q.x, q.y)) return false;
    if (p.team !== q.team && d > 1.2 && (inZone("zone_dark", q.x, q.y) || inZone("zone_dark", p.x, p.y))) return false;
    const closeSee = q.closeSeeOverride || R.closeSee;
    if (q.camo === 2 && q.reveal <= 0 && d >= closeSee) return false;
    return true;
  }''')
rep('''  function audible(listener, src) {
    if (src.returning > 0 || src.speedNow < 0.1) return false;''',
'''  function audible(listener, src) {
    if (src.returning > 0 || src.speedNow < 0.1) return false;
    if (src.silentT > 0 || inZone("zone_water", src.x, src.y, src.team)) return false;''')

# ---------------- 1tick：DYN更新・タイマー・露見・手当・成長 ----------------
rep('''    g.elapsed += dt;
    if (!g.noTimer) g.time -= dt;
    const claims = [];''',
'''    g.elapsed += dt;
    if (!g.noTimer) g.time -= dt;
    const claims = [];
    stepObjects(g, dt);
    DYN = g.objects.filter(o => o.kind === "wall" || o.kind === "zone_fog" || o.kind === "zone_dark" || o.kind === "zone_water" || o.kind === "paint_zone" || o.kind === "zone_null" || o.kind === "zone_petals");
    // 旗の周囲4mの確保（生存人数で上回っている側に +8/3秒・チームで1回分）
    for (const t of [0, 1]) {
      const alive = tm => g.players.filter(q => q.team === tm && q.returning <= 0 && q.exposed <= 0).length;
      const near = g.players.some(q => q.team === t && q.returning <= 0 && q.exposed <= 0 && dist(q, FLAG) <= R.pulseRadius);
      if (near && alive(t) > alive(1 - t)) { g.holdT[t] += dt; if (g.holdT[t] >= 3) { g.holdT[t] -= 3; addXp(g, t, R.hp.xp.hold, "hold"); } }
      else g.holdT[t] = 0;
    }''')
rep('''    for (const p of order) {
      for (const k of ["protect", "markTime", "invuln", "reveal", "slow", "camoCd", "scanCd", "shotCd", "pingCd"]) p[k] = Math.max(0, p[k] - dt);
      if (p.markTime <= 0) p.marks = 0;''',
'''    for (const p of order) {
      for (const k of ["protect", "markTime", "invuln", "reveal", "slow", "camoCd", "scanCd", "shotCd", "pingCd", "skillCd", "silentT", "stunT", "aimJitter", "firstHitCd"]) p[k] = Math.max(0, p[k] - dt);
      if (p.markTime <= 0) p.marks = 0;
      for (const m of p.mods) m.t -= dt;
      if (p.mods.some(m => m.t <= 0)) { for (const m of p.mods) if (m.t <= 0 && m.onEnd) m.onEnd(g, p); p.mods = p.mods.filter(m => m.t > 0); }
      if (p.ult.active > 0) p.ult.active = Math.max(0, p.ult.active - dt);
      if (p.pendingLevel) { p.pickT -= dt; if (p.pickT <= 0 || p.bot) choosePerk(g, p, p.bot ? null : null); }
      if (p.hp >= p.hpMax && p.firstHitCd <= 0) p.firstHitArmed = true;
      // 露見：12秒で自動帰還。自陣に入れば即復帰
      if (p.exposed > 0) {
        p.exposed = Math.max(0, p.exposed - dt);
        p.reveal = Math.max(p.reveal, 0.2);
        if (p.camo) unhide(g, p, true);
        if (inSpawn(p)) { recover(g, p, p.hpMax, "home"); }
        else if (p.exposed <= 0) { returnHome(g, p); }
      }
      // 手当：味方が1.5m以内で静止していると進む
      if (p.exposed > 0 && p.returning <= 0) {
        const healer = g.players.find(h => h !== p && h.team === p.team && h.returning <= 0 && h.exposed <= 0 && h.speedNow < 0.6 && dist(h, p) <= R.hp.healRange);
        if (healer) {
          const need = hasPerk(healer, "護", 4) ? R.hp.healSecFast : R.hp.healSec;
          p.healT += dt; p.healBy = healer.id;
          if (p.healT >= need) { recover(g, p, hasPerk(healer, "護", 4) ? R.hp.healHpFast : R.hp.healHp, "heal"); healer.stats.heals++; addXp(g, p.team, R.hp.xp.heal, "heal"); logEvent(g, "healed", { id: p.id, by: healer.id, team: p.team }); }
        } else { p.healT = Math.max(0, p.healT - dt * 2); p.healBy = null; }
      }''')
# 露見・気絶中は行動できない（合図だけ）
rep('''      const i = p.input;
      const acts = new Set(i.actions);
      i.actions = [];
      const moving = Math.hypot(i.x, i.y) > 0.1;''',
'''      const i = p.input;
      const acts = new Set(i.actions);
      i.actions = [];
      // 成長：系統の選択
      for (const a of acts) if (a.startsWith("tree:") && p.pendingLevel) choosePerk(g, p, a.slice(5));
      if (p.exposed > 0 || p.stunT > 0) { for (const a of ["camo", "scan", "shot", "claim", "skill", "ult", "crouch"]) acts.delete(a); }
      if (p.stunT > 0 || (p.sk.channel && p.sk.channel.freeze)) { i.x = 0; i.y = 0; }
      let moving = Math.hypot(i.x, i.y) > 0.1;''')
# 擬態の条件（HP30以上）・持続/開始の係数
rep('''          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo) {
            p.camo = 1; p.camoEnter = R.camoEnter; p.camoPattern = z;
          }''',
'''          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo && p.hp >= R.hp.minCamoHp && !(p.sk.channel) && !modHas(p, "noCamo")) {
            let enter = R.camoEnter * p.bal.camoEnterMul - (hasPerk(p, "影", 4) ? 0.1 : 0) - (inZone("zone_petals", p.x, p.y, p.team) ? 0.4 : 0);
            p.camo = 1; p.camoEnter = Math.max(0.2, enter); p.camoPattern = z;
          }''')
rep('''            p.camo = 2; p.camoEnter = 0; p.camoTime = g.overtime ? R.camoOvertime : R.camoDuration;''',
    '''            p.camo = 2; p.camoEnter = 0; p.camoTime = (g.overtime ? R.camoOvertime : R.camoDuration) * p.bal.camoDurMul + (hasPerk(p, "影", 4) ? 3 : 0);''')
# 移動速度：能力値・成長・強化・露見・気絶
rep('''      const base = p.camo === 2 ? R.camoSpeed : p.crouch ? R.crouchSpeed : R.speed;
      const speed = base * (p.slow > 0 ? R.slowFactor : 1) * (p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1);''',
'''      let base = p.camo === 2 ? R.camoSpeed * p.bal.camoSpeedMul : p.crouch ? R.crouchSpeed * p.bal.speedMul * (hasPerk(p, "影", 2) ? 1.1 : 1) : R.speed * p.bal.speedMul;
      if (p.camo === 2 && (modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影"))) base = R.speed * 0.7;
      let speed = base * (p.slow > 0 ? p.bal.slowFactor : 1) * (p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1) * modMul(p, "speed");
      if (p.exposed > 0) speed = R.speed * p.bal.exposeMove;
      if (p.sk.channel && p.sk.channel.speedMul != null) speed *= p.sk.channel.speedMul;
      if (inZone("zone_null", p.x, p.y) && p.sk.ownsNull) speed *= 0.7;''')
# 擬態で中央線を越えた（+8・復帰ごとに1回）
rep('''      p.speedNow = Math.hypot(p.x - p.px, p.y - p.py) / dt;
      if (p.camo === 2 && !zoneAt(p.x, p.y)) unhide(g, p);''',
'''      p.speedNow = Math.hypot(p.x - p.px, p.y - p.py) / dt;
      if (p.camo === 2 && !zoneAt(p.x, p.y)) unhide(g, p);
      {
        const side = p.x < FLAG.x ? 0 : 1, enemySide = 1 - p.team;
        if (p.camo === 2 && !p.crossedCenter && p.lastSide === p.team && side === enemySide) { p.crossedCenter = true; addXp(g, p.team, R.hp.xp.cross, "cross"); }
        p.lastSide = side;
      }
      // 設置物との接触（狐火・棘道・矢印・影穴の入口）
      touchObjects(g, p);''')
# 見破り：範囲の係数・擬態を解いたときだけ経験値
rep('''        p.scanCd = g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown;''',
    '''        p.scanCd = (g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown) * p.bal.scanCdMul;''')
rep('''          let hit = 0;
          for (const q of g.players) {
            if (q.team === p.team || q.returning > 0 || q.protect > 0) continue;
            if (dist(p, q) > R.scanRange || !lineClear(p.x, p.y, q.x, q.y)) continue;
            const da = angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.angle);
            if (Math.abs(da) <= R.scanAngle / 2) {
              q.reveal = R.revealDuration; unhide(g, q); hit++; p.stats.reveals++;
              emit(g, "found", q.x, q.y, { team: p.team, target: q.id });
              logEvent(g, "found", { by: p.id, id: q.id, team: p.team });
            }
          }
          if (!hit) emit(g, "miss", p.x, p.y, { team: p.team, owner: p.id });''',
'''          let hit = 0;
          const range = R.scanRange + p.bal.scanRangeAdd + (hasPerk(p, "技", 3) ? 0.5 : 0) + modAdd(p, "scanRange");
          for (const q of g.players) {
            if (q.team === p.team || q.returning > 0 || q.protect > 0) continue;
            if (dist(p, q) > range || !lineClear(p.x, p.y, q.x, q.y)) continue;
            const da = angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.angle);
            if (Math.abs(da) <= R.scanAngle / 2) {
              const wasHidden = q.camo === 2;
              setReveal(q, R.revealDuration); unhide(g, q); hit++; p.stats.reveals++;
              emit(g, "found", q.x, q.y, { team: p.team, target: q.id });
              logEvent(g, "found", { by: p.id, id: q.id, team: p.team });
              const key = p.team + ":" + q.id;
              if (wasHidden && !(g.revealXp[key] > g.elapsed - 10)) { g.revealXp[key] = g.elapsed; addXp(g, p.team, R.hp.xp.reveal, "reveal"); }
            }
          }
          // 分身・描景も見破りに反応する
          for (const o of g.objects) {
            if (o.team === p.team || o.dead) continue;
            if ((o.kind === "decoy_static" || o.kind === "decoy_run" || o.kind === "paint_zone") && dist(p, o) <= range && lineClear(p.x, p.y, o.x, o.y) && Math.abs(angDiff(Math.atan2(o.y - p.y, o.x - p.x), p.angle)) <= R.scanAngle / 2) {
              if (o.kind === "paint_zone") o.life = Math.min(o.life, 2); else { o.dead = true; emit(g, "found", o.x, o.y, { team: p.team, decoy: true }); }
              hit++;
            }
          }
          if (!hit) emit(g, "miss", p.x, p.y, { team: p.team, owner: p.id });''')
# 印投げ：クールダウンの係数・固有技の発動・奥義
rep('''      if (acts.has("shot") && p.shotCd <= 0 && p.protect <= 0) {
        unhide(g, p);
        p.shotCd = R.shotCooldown;
        g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(p.angle), dy: Math.sin(p.angle), travel: 0, angle: p.angle });
        emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 });
      }''',
'''      if (acts.has("shot") && p.shotCd <= 0 && p.protect <= 0 && !(p.sk.channel && p.sk.channel.noShot)) {
        unhide(g, p);
        p.shotCd = Math.max(0.6, (R.shotCooldown - (hasPerk(p, "技", 2) ? 0.15 : 0)) * modMul(p, "shotCd"));
        let ang = p.angle;
        if (p.aimJitter > 0) ang += (rng(g) - 0.5) * 0.8;
        // 無刀取り：正面2m以内で構えている敵がいれば無効化して止める
        const counter = g.players.find(q => q.team !== p.team && q.sk.channel && q.sk.channel.kind === "counter_stance" && dist(p, q) <= 2 && Math.abs(angDiff(Math.atan2(p.y - q.y, p.x - q.x), q.angle)) <= 0.9);
        if (counter) { p.stunT = 0.8; emit(g, "parry", p.x, p.y, { team: counter.team, life: 0.6 }); logEvent(g, "countered", { by: counter.id, id: p.id, team: counter.team }); }
        else {
          const poison = p.sk.poisonArmed > 0;
          g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), travel: 0, angle: ang, poison, speed: R.shotSpeed, range: R.shotRange });
          if (poison) p.sk.poisonArmed = 0;
          emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 });
        }
      }
      // 固有技・奥義
      for (const a of acts) {
        if (a === "skill" || a.startsWith("skill:")) useSkill(g, p, a.startsWith("skill:") ? a.slice(6) : null);
        if (a === "ult") useUlt(g, p);
      }
      stepChannel(g, p, dt, acts);''')
# 印の弾道：ダメージ・HP・防御・反応技
rep('''        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);
        if (q) {
          dead = true;
          if (q.invuln <= 0) {
            q.invuln = R.hitInvuln; q.reveal = R.revealDuration; q.slow = R.slowDuration;
            unhide(g, q); q.marks++; q.markTime = R.markDuration; q.stats.marked++;
            const owner = g.players.find(p => p.id === s.owner);
            if (owner) owner.stats.hits++;
            emit(g, "hit", q.x, q.y, { team: s.team, target: q.id, marks: q.marks });
            logEvent(g, "hit", { by: s.owner, id: q.id, marks: q.marks, team: s.team });
            q.emote = { type: "surprised", t: 1 };
            if (q.marks >= 2) returnHome(g, q);
          }
        }''',
'''        // 分身が印を吸収する
        const dc = g.objects.find(o => !o.dead && (o.kind === "decoy_run" || o.kind === "echo_clone" || o.kind === "decoy_static") && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + R.bodyRadius);
        if (dc) { dead = true; dc.dead = true; emit(g, "hit", dc.x, dc.y, { team: s.team, decoy: true }); break; }
        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);
        if (q) {
          dead = true;
          if (q.invuln <= 0) applyHit(g, q, s);
        }''')
rep('''    for (const s of g.shots) {
      const travel = R.shotSpeed * dt, n = Math.ceil(travel / 0.15);
      let dead = false;
      for (let j = 0; j < n && !dead; j++) {
        s.x += s.dx * travel / n; s.y += s.dy * travel / n; s.travel += travel / n;
        if (SOLID[cellAt(s.x, s.y)] || s.travel > R.shotRange) { dead = true; emit(g, "shot_end", s.x, s.y, { life: 0.3 }); break; }''',
'''    for (const s of g.shots) {
      let sp = s.speed || R.shotSpeed;
      if (inZone("zone_water", s.x, s.y, 1 - s.team)) sp *= 0.8;       // 水鏡：敵の飛び道具が20%遅くなる
      const travel = sp * dt, n = Math.ceil(travel / 0.15);
      let dead = false;
      for (let j = 0; j < n && !dead; j++) {
        const ox = s.x, oy = s.y;
        s.x += s.dx * travel / n; s.y += s.dy * travel / n; s.travel += travel / n;
        if (SOLID[cellAt(s.x, s.y)] || s.travel > (s.range || R.shotRange) || (DYN.length && DYN.some(o => o.kind === "wall" && segsCross(ox, oy, s.x, s.y, o.ax, o.ay, o.bx, o.by)))) { dead = true; emit(g, "shot_end", s.x, s.y, { life: 0.3 }); break; }''')
# 旗取得：露見中は不可
rep('''    const valid = claims.filter(p => p.returning <= 0 && p.protect <= 0 && p.camo === 0 && dist(p, FLAG) <= R.flagRadius && lineClear(p.x, p.y, FLAG.x, FLAG.y));''',
    '''    const valid = claims.filter(p => p.returning <= 0 && p.protect <= 0 && p.exposed <= 0 && p.camo === 0 && dist(p, FLAG) <= R.flagRadius && lineClear(p.x, p.y, FLAG.x, FLAG.y));''')
# 延長：帰還者のHPは満タン（既存処理はそのまま）

# ---------------- ダメージ・露見・復帰・経験値・成長・固有技 ----------------
rep('''  // ネット対戦：受け取った入力を反映（連番の重複・古い入力は捨てる。行動は次のtickまで溜める）''',
r'''  // ---------- HP・露見・復帰 ----------
  function inSpawn(p) {
    const b = D.MAP.spawnBox;
    const x = p.team ? mirrorX(p.x) : p.x;
    return x >= b.x0 && x <= b.x1 + 1 && p.y >= b.y0 && p.y <= b.y1 + 1;
  }
  function setReveal(q, sec) { q.reveal = Math.max(q.reveal, sec - (hasPerk(q, "影", 3) ? 0.5 : 0) - (modHas(q, "revealCut") ? sec * 0.2 : 0)); }
  function modHas(p, k) { return p.mods.some(m => m.k === k); }
  function modMul(p, k) { let v = 1; for (const m of p.mods) if (m.k === k) v *= m.mul; return v; }
  function modAdd(p, k) { let v = 0; for (const m of p.mods) if (m.k === k) v += m.add; return v; }
  function addMod(p, k, t, extra) { p.mods.push(Object.assign({ k, t }, extra || {})); }
  function hasPerk(p, tree, level) { return p.perks && p.perks[level] === tree; }
  function dmgOf(g, owner, target, shot) {
    let d = owner ? owner.bal.dmg * modMul(owner, "atk") : R.hp.baseDamage;
    if (shot && shot.snipe) d *= 1.4;
    let mul = target.bal.takenMul * modMul(target, "def");
    if (hasPerk(target, "護", 2)) mul *= 0.96;
    if (g.players.some(a => a !== target && a.team === target.team && a.ult.active > 0 && a.perks[5] === "護" && dist(a, target) <= 4)) mul *= 0.88;
    d *= mul;
    if (hasPerk(target, "護", 3) && target.firstHitArmed) { d -= 5; target.firstHitArmed = false; target.firstHitCd = 15; }
    return Math.max(1, Math.round(d));
  }
  function applyHit(g, q, s) {
    const owner = g.players.find(p => p.id === s.owner);
    // 反応技：双龍円（正面の印を落とす）・変わり身（無効化して3m移動）
    if (q.sk.channel && q.sk.channel.kind === "parry" && Math.abs(angDiff(Math.atan2(s.x - q.x, s.y - q.y) * 0 + Math.atan2(-s.dy, -s.dx), q.angle)) <= 1.05) { emit(g, "parry", q.x, q.y, { team: q.team, life: 0.6 }); return; }
    if (q.sk.kawarimi > 0) {
      q.sk.kawarimi = 0;
      const ix = q.input.x, iy = q.input.y, l = Math.hypot(ix, iy);
      const ang = l > 0.1 ? Math.atan2(iy, ix) : q.angle;
      emit(g, "kawarimi", q.x, q.y, { team: q.team, angle: ang, life: 0.5 });
      for (let d = 3; d > 0.5; d -= 0.5) { const nx = q.x + Math.cos(ang) * d, ny = q.y + Math.sin(ang) * d; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; q.px = nx; q.py = ny; break; } }
      q.invuln = R.hitInvuln; return;
    }
    let dmg = dmgOf(g, owner, q, s);
    let slow = true;
    if (q.sk.shield > 0) { q.sk.shield = 0; dmg = Math.max(1, dmg - 8); slow = false; emit(g, "shield", q.x, q.y, { team: q.team, life: 0.6 }); }
    q.invuln = R.hitInvuln; setReveal(q, R.revealDuration); if (slow) q.slow = R.slowDuration;
    unhide(g, q); q.stats.marked++; q.stats.taken += dmg; q.marks = 1; q.markTime = R.markDuration;
    if (owner) { owner.stats.hits++; owner.stats.damage += dmg; if (q.exposed <= 0) addXp(g, owner.team, R.hp.xp.hit, "hit"); }
    if (s.poison) { addMod(q, "tracked", 6, { by: s.team }); }
    if (owner && owner.sk.channel && owner.sk.channel.kind === "berserk") { /* 補正は dmgOf 側 */ }
    q.hp = Math.max(0, q.hp - dmg);
    emit(g, "hit", q.x, q.y, { team: s.team, target: q.id, dmg, hp: q.hp });
    logEvent(g, "hit", { by: s.owner, id: q.id, dmg, hp: q.hp, team: s.team });
    q.emote = { type: "surprised", t: 1 };
    if (q.hp <= 0) expose(g, q, owner);
  }
  function expose(g, q, by) {
    q.exposed = R.hp.exposeSec; q.hp = 0; q.healT = 0; q.stats.hp0++;
    unhide(g, q, true); q.sk.channel = null; q.stunT = 0;
    emit(g, "expose", q.x, q.y, { team: q.team, target: q.id, life: 1.2 });
    logEvent(g, "expose", { id: q.id, by: by ? by.id : null, team: q.team });
    if (by) { const key = by.team + ":" + q.id; if (!(g.hp0Xp[key] > g.elapsed - 20)) { g.hp0Xp[key] = g.elapsed; addXp(g, by.team, R.hp.xp.hp0, "hp0"); } }
    if (q.bot) { q.ai.phase = "route"; q.ai.wp = 0; }
  }
  function recover(g, q, hp, how) {
    q.exposed = 0; q.hp = Math.min(q.hpMax, hp); q.healT = 0; q.healBy = null; q.protect = Math.max(q.protect, how === "home" ? R.protect : 1); q.crossedCenter = false;
    emit(g, "recover", q.x, q.y, { team: q.team, target: q.id, life: 1 });
    logEvent(g, "recover", { id: q.id, how, team: q.team });
  }

  // ---------- 経験値・レベル・成長 ----------
  function addXp(g, team, n, src) {
    if (g.level[team] >= 5 && g.xp[team] >= R.hp.xpThresholds[4]) return;
    g.xp[team] += n;
    g.xpLog.push({ t: +g.elapsed.toFixed(1), team, n, src });
    if (g.xpLog.length > 400) g.xpLog.shift();
    for (const p of g.players) if (p.team === team) p.stats.xp += n;
    while (g.level[team] < 5 && g.xp[team] >= R.hp.xpThresholds[g.level[team]]) {
      g.level[team]++;
      const L = g.level[team];
      logEvent(g, "levelup", { team, level: L });
      emit(g, "levelup", FLAG.x, FLAG.y, { team, level: L, life: 2 });
      for (const p of g.players) if (p.team === team) { p.pendingLevel = L; p.pickT = R.hp.pickSec; const old = p.hpMax; p.hpMax = R.hp.byLevel[L - 1]; if (p.exposed <= 0) p.hp = Math.min(p.hpMax, p.hp + (p.hpMax - old)); }
    }
  }
  function defaultTree(p) {
    const t = p.bal.tree;
    if (t === "影" || t === "技" || t === "護") return t;
    return p.role === "vanguard" ? "影" : p.role === "scout" ? "技" : "護";
  }
  function choosePerk(g, p, tree) {
    if (!p.pendingLevel) return;
    if (!["影", "技", "護"].includes(tree)) tree = defaultTree(p);
    p.perks[p.pendingLevel] = tree;
    logEvent(g, "perk", { id: p.id, team: p.team, level: p.pendingLevel, tree });
    p.pendingLevel = 0; p.pickT = 0;
  }
  function useUlt(g, p) {
    if (p.ult.used || p.perks[5] == null || p.exposed > 0) return;
    const tree = p.perks[5];
    if (tree === "影") { if (p.camo !== 2 || dist(p, FLAG) < 3) return; p.ult.used = true; p.ult.active = 5; addMod(p, "camoFast", 5); }
    else if (tree === "技") { if (p.skillCd <= 0) return; p.ult.used = true; p.skillCd = 0; }
    else { p.ult.used = true; p.ult.active = 8; }
    emit(g, "ult", p.x, p.y, { team: p.team, tree, life: 1.2 });
    logEvent(g, "ult", { id: p.id, team: p.team, tree });
  }

  // ---------- 固有技 ----------
  function skillCdFor(g, p) {
    const base = p.bal.skill ? p.bal.skill.cd : 20;
    return base * (hasPerk(p, "技", 4) ? 0.85 : 1);
  }
  function addObj(g, o) { o.id = ++g.serial2; g.objects.push(o); return o; }
  function aheadPos(p, d) { return { x: p.x + Math.cos(p.angle) * d, y: p.y + Math.sin(p.angle) * d }; }
  function nearestAlly(g, p, range) { let best = null, bd = range; for (const q of g.players) { if (q === p || q.team !== p.team || q.returning > 0) continue; const d = dist(p, q); if (d < bd) { bd = d; best = q; } } return best; }
  function useSkill(g, p, opt) {
    const sk = p.bal.skill;
    if (!sk || p.skillCd > 0 || p.exposed > 0 || p.returning > 0 || p.protect > 0 || p.sk.channel) return;
    if (inZone("zone_null", p.x, p.y) && !p.sk.ownsNull) return;   // 罪業：中では固有技が使えない
    const P = sk.params || {}, k = sk.kind;
    const fire = () => { p.skillCd = skillCdFor(g, p); p.stats.skills++; emit(g, "skill", p.x, p.y, { team: p.team, kind: k, owner: p.id, life: 0.8 }); logEvent(g, "skill", { id: p.id, team: p.team, kind: k, name: sk.name }); };
    const num = (v, d) => (typeof v === "number" ? v : d);
    switch (k) {
      case "trail_reveal": { const a = aheadPos(p, num(P.len, 6)); addObj(g, { kind: "trail", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.life, 3), revealSec: num(P.revealSec, 1.5) }); fire(); break; }
      case "track_nearest": addObj(g, { kind: "track", team: p.team, owner: p.id, x: p.x, y: p.y, life: num(P.dur, 8), radius: num(P.radius, 9), delay: num(P.delay, 2), hist: [], next: 0 }); fire(); break;
      case "substitution": p.sk.kawarimi = num(P.armSec, 8); addMod(p, "kawarimiArm", num(P.armSec, 8)); fire(); break;
      case "zone_water": addObj(g, { kind: "zone_water", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 2.5), life: num(P.dur, 5) }); fire(); break;
      case "wall": { const c = aheadPos(p, 1.5), len = num(P.len, 3), nx = -Math.sin(p.angle), ny = Math.cos(p.angle); addObj(g, { kind: "wall", team: p.team, owner: p.id, x: c.x, y: c.y, ax: c.x - nx * len / 2, ay: c.y - ny * len / 2, bx: c.x + nx * len / 2, by: c.y + ny * len / 2, life: num(P.dur, 4) + num(P.warnSec, 0.7), warn: num(P.warnSec, 0.7), pending: true }); fire(); break; }
      case "ally_shield": { const t = nearestAlly(g, p, num(P.range, 8)) || p; t.sk.shield = num(P.dur, 8); addMod(t, "shield", num(P.dur, 8)); emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }
      case "zone_fog": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_fog", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2), life: num(P.dur, 6), trailSec: num(P.trailSec, 2) }); fire(); break; }
      case "decoy_run": addObj(g, { kind: "decoy_run", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 6), speed: R.speed }); fire(); break;
      case "freeze_bomb": { const t = aheadPos(p, Math.min(num(P.range, 6), 6)); addObj(g, { kind: "freeze_bomb", team: p.team, owner: p.id, x: t.x, y: t.y, r: num(P.r, 2.5), life: num(P.delay, 0.8), stun: num(P.stun, 1.2) }); fire(); break; }
      case "dash": p.sk.channel = { kind: "dash", t: num(P.warnSec, 0.35), dist: num(P.dist, 5), revealSec: num(P.revealSec, 1), freeze: true, noShot: true }; fire(); break;
      case "bomb": { const t = aheadPos(p, Math.min(num(P.range, 5), 5)); addObj(g, { kind: "bomb", team: p.team, owner: p.id, x: t.x, y: t.y, r: num(P.r, 3), life: num(P.fuse, 2), push: num(P.push, 3) }); fire(); break; }
      case "poison_mark": p.sk.poisonArmed = num(P.armSec, 10); fire(); break;
      case "berserk": { const d = num(P.dur, 8); addMod(p, "atk", d, { mul: 1 + (5 - p.bal.stats.atk) * 0.12 / (1 + (p.bal.stats.atk - 3) * 0.12) }); addMod(p, "def", d, { mul: (1 - 2 * 0.08) / p.bal.takenMul }); addMod(p, "noCamo", d); addMod(p, "visible", d); addMod(p, "berserkTail", d, { onEnd: (gg, pp) => addMod(pp, "speed", num(P.afterSlowSec, 2), { mul: 0.9 }) }); unhide(g, p); fire(); break; }
      case "hawk_eye": p.sk.channel = { kind: "hawk_eye", t: num(P.channel, 3), radius: num(P.radius, 14), showSec: num(P.showSec, 2), freeze: true, noShot: true, cancelOnHit: true }; fire(); break;
      case "fox_fires": { for (let i = 0; i < num(P.count, 3); i++) { const a = p.angle + (i - 1) * 1.2; addObj(g, { kind: "fox_fire", team: p.team, owner: p.id, x: p.x + Math.cos(a) * 2, y: p.y + Math.sin(a) * 2, r: 0.6, life: num(P.dur, 5), revealSec: num(P.revealSec, 2) }); } fire(); break; }
      case "zone_dark": addObj(g, { kind: "zone_dark", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 3), life: num(P.dur, 4) }); fire(); break;
      case "zone_petals": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_petals", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2.5), life: num(P.dur, 5) }); fire(); break; }
      case "tailwind": addMod(p, "speed", num(P.dur, 4), { mul: 1 + num(P.speedBonus, 0.15) }); addMod(p, "tailwind", num(P.dur, 4)); fire(); break;
      case "sacrifice": { if (p.hp >= p.hpMax) return; p.hp = Math.min(p.hpMax, p.hp + 15); addMod(p, "shotCd", num(P.dur, 4), { mul: 0.6, onEnd: (gg, pp) => addMod(pp, "def", num(P.afterSec, 6), { mul: 1.16 / pp.bal.takenMul }) }); fire(); break; }
      case "cleanse": { for (const q of g.players) if (q.team === p.team && q.returning <= 0 && dist(p, q) <= num(P.r, 4)) { q.mods = q.mods.filter(m => m.k !== "tracked" && m.k !== "hexed"); if (q.exposed <= 0) q.hp = Math.min(q.hpMax, q.hp + num(P.heal, 10)); q.reveal = Math.max(0, q.reveal - 2); emit(g, "buff", q.x, q.y, { team: p.team, life: 0.8 }); } addObj(g, { kind: "halo", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 4), life: 1 }); fire(); break; }
      case "decoy_static": addObj(g, { kind: "decoy_static", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, pattern: zoneAt(p.x, p.y) || "b", life: num(P.dur, 12) }); fire(); break;
      case "snake": addObj(g, { kind: "snake", team: p.team, owner: p.id, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 7), speed: num(P.speed, 3), radius: num(P.radius, 3), reported: false }); fire(); break;
      case "tempo": p.sk.channel = { kind: "tempo", t: num(P.channel, 5), r: num(P.r, 6), cdReduce: num(P.cdReduce, 2), freeze: true, noShot: true, cancelOnHit: true }; fire(); break;
      case "zone_null": { p.sk.channel = { kind: "zone_null_setup", t: num(P.setupSec, 1), r: num(P.r, 3), dur: num(P.dur, 5), speedMul: 0.5 }; fire(); break; }
      case "arrows": { for (let i = 0; i < num(P.count, 3); i++) { const a = aheadPos(p, 1 + i * 1.5); addObj(g, { kind: "arrow", team: p.team, owner: p.id, x: a.x, y: a.y, angle: p.angle, r: 0.7, life: num(P.dur, 10), silentSec: num(P.silentSec, 2) }); } fire(); break; }
      case "paint_zone": { const c = aheadPos(p, 2.5), pats = ["b", "s", "w"]; addObj(g, { kind: "paint_zone", team: p.team, owner: p.id, x: c.x, y: c.y, half: num(P.size, 4) / 2, pattern: pats[(rng(g) * 3) | 0], life: num(P.dur, 8) }); fire(); break; }
      case "leap": { const d = num(P.dist, 4); let done = false; for (let dd = d; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && lineClear(p.x, p.y, nx, ny)) { emit(g, "leap", p.x, p.y, { team: p.team, tx: nx, ty: ny, life: 0.5 }); p.x = nx; p.y = ny; p.px = nx; p.py = ny; done = true; } } for (const q of g.players) if (q.team !== p.team && dist(p, q) <= num(P.jitterR, 2)) q.aimJitter = num(P.jitterSec, 0.6); unhide(g, p); fire(); break; }
      case "parry": p.sk.channel = { kind: "parry", t: num(P.dur, 2), speedMul: num(P.speedMul, 0.5), noCamo: true }; unhide(g, p); fire(); break;
      case "smash": p.sk.channel = { kind: "smash", t: num(P.windup, 0.9), reach: num(P.reach, 2.5), push: num(P.push, 3), freeze: true, noShot: true }; fire(); break;
      case "echo_clone": addObj(g, { kind: "echo_clone", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 3), delay: num(P.delay, 0.6), hist: [] }); fire(); break;
      case "thorns": { const a = aheadPos(p, num(P.len, 5)); addObj(g, { kind: "thorns", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.dur, 8), revealSec: num(P.revealSec, 3) }); fire(); break; }
      case "hex": { let best = null, bd = num(P.range, 8); for (const q of g.players) if (q.team !== p.team && canSee(p, q) && dist(p, q) < bd) { bd = dist(p, q); best = q; } if (!best) return; addMod(best, "hexed", num(P.dur, 4), { by: p.id, range: num(P.range, 8), cdDelay: num(P.cdDelay, 4), applied: false }); emit(g, "hex", best.x, best.y, { team: p.team, target: best.id, life: 1 }); fire(); break; }
      case "cat_choice": { const white = opt === "white" || (opt == null && g.players.some(q => q.team !== p.team && canSee(p, q))); if (white) addMod(p, "scanRange", num(P.dur, 5), { add: 0.5 }); else { addMod(p, "camoBonus", num(P.dur, 5)); } addMod(p, white ? "eyeWhite" : "eyeBlack", num(P.dur, 5)); fire(); break; }
      case "snipe": p.sk.channel = { kind: "snipe", t: num(P.channel, 1.2), range: num(P.range, 14), speed: num(P.speed, 28), freeze: true, noShot: true, cancelOnHit: true }; unhide(g, p); fire(); break;
      case "soul_return": { const t = g.players.find(q => q.team === p.team && q !== p && (q.returning > 0 || q.exposed > 0)); if (!t) return; if (t.returning > 0) { t.returning = Math.max(0.1, t.returning - num(P.returnCut, 1.5)); t.protectBonus = num(P.protectAdd, 1); } else { t.exposed = Math.max(0.1, t.exposed - 3); } emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }
      case "thread": { const t = nearestAlly(g, p, num(P.range, 8)); if (!t) return; const d = num(P.dur, 8); addMod(p, "thread", d, { with: t.id, linkRange: num(P.linkRange, 6) }); addMod(t, "thread", d, { with: p.id, linkRange: num(P.linkRange, 6) }); fire(); break; }
      case "fox_dash": { const d = num(P.dur, 6); addMod(p, "camoFast", d); p.closeSeeOverride = num(P.closeSee, 1.5); addMod(p, "foxdash", d, { onEnd: (gg, pp) => { pp.closeSeeOverride = null; } }); fire(); break; }
      case "counter_stance": p.sk.channel = { kind: "counter_stance", t: num(P.dur, 1.1), reach: num(P.reach, 2), stun: num(P.stun, 0.8), freeze: true, noShot: true }; unhide(g, p); fire(); break;
      case "shadow_gate": { const gate = g.objects.find(o => o.kind === "gate" && o.owner === p.id && !o.exit); if (gate) { if (dist(p, gate) <= num(P.range, 5)) { gate.exit = { x: p.x, y: p.y }; gate.life = num(P.followSec, 3); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); } return; } addObj(g, { kind: "gate", team: p.team, owner: p.id, x: p.x, y: p.y, r: 0.8, life: num(P.window, 6), exit: null }); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); fire(); break; }
      default: fire();
    }
  }
  // 詠唱・構えの進行（毎tick）
  function stepChannel(g, p, dt, acts) {
    const c = p.sk.channel; if (!c) return;
    if (c.cancelOnHit && p.invuln > 0 && p.invuln > R.hitInvuln - dt * 1.5) { p.sk.channel = null; return; }
    if (c.kind === "hawk_eye" && p.speedNow > 0.3) { p.sk.channel = null; return; }
    c.t -= dt;
    if (c.kind === "tempo") { c.acc = (c.acc || 0) + dt; if (c.acc >= 1) { c.acc -= 1; for (const q of g.players) if (q.team === p.team && q !== p && dist(p, q) <= c.r) q.skillCd = Math.max(0, q.skillCd - c.cdReduce / 5); } }
    if (c.t > 0) return;
    p.sk.channel = null;
    switch (c.kind) {
      case "dash": { let done = false; for (let dd = c.dist; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && lineClear(p.x, p.y, nx, ny)) { for (const q of g.players) if (q.team !== p.team && segDist(q.x, q.y, p.x, p.y, nx, ny) <= 0.8) { setReveal(q, c.revealSec); unhide(g, q); } emit(g, "dashline", p.x, p.y, { team: p.team, tx: nx, ty: ny, life: 0.5 }); p.x = nx; p.y = ny; p.px = nx; p.py = ny; done = true; } } unhide(g, p); break; }
      case "hawk_eye": { for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.speedNow > 0.3 && dist(p, q) <= c.radius) { q.lastSeen = { x: q.x, y: q.y, t: c.showSec, team: p.team }; emit(g, "spotted", q.x, q.y, { team: p.team, life: c.showSec }); } break; }
      case "tempo": { for (const q of g.players) if (q.team === p.team && q !== p && dist(p, q) <= c.r) q.skillCd = Math.max(0, q.skillCd - c.cdReduce); break; }
      case "zone_null_setup": { addObj(g, { kind: "zone_null", team: p.team, owner: p.id, x: p.x, y: p.y, r: c.r, life: c.dur }); p.sk.ownsNull = true; addMod(p, "ownsNull", c.dur, { onEnd: (gg, pp) => { pp.sk.ownsNull = false; } }); break; }
      case "smash": { const a = aheadPos(p, c.reach / 2); let hit = 0; for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && dist(a, q) <= c.reach) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); } for (const o of g.objects) if (dist(a, o) <= c.reach + (o.r || 0)) { if (o.kind === "wall") o.dead = true; else if (o.team !== p.team) o.dead = true; } if (!hit) p.stunT = 1; emit(g, "smash", a.x, a.y, { team: p.team, life: 0.5 }); break; }
      case "snipe": { g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(p.angle), dy: Math.sin(p.angle), travel: 0, angle: p.angle, speed: c.speed, range: c.range, snipe: true }); emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 }); break; }
      default: break;
    }
  }
  // 設置物の進行
  function stepObjects(g, dt) {
    for (const o of g.objects) {
      o.life -= dt;
      if (o.life <= 0) o.dead = true;
      if (o.dead) continue;
      if (o.kind === "wall" && o.pending && o.life <= (o.warnTotal || (o.warnTotal = o.life)) - o.warn) { o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 }); }
      if (o.kind === "decoy_run") { const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, R.bodyRadius, o.team)) { o.x = nx; o.y = ny; } else o.dead = true; }
      if (o.kind === "snake") { const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, 0.2, o.team)) { o.x = nx; o.y = ny; } else { o.angle += Math.PI / 2; } if (!o.reported) for (const q of g.players) if (q.team !== o.team && q.camo === 1 && dist(o, q) <= o.radius) { o.reported = true; emit(g, "spotted", q.x, q.y, { team: o.team, life: 2 }); q.lastSeen = { x: q.x, y: q.y, t: 2 }; } }
      if (o.kind === "echo_clone") { const own = g.players.find(p => p.id === o.owner); if (own) { o.hist.push({ x: own.x, y: own.y, a: own.angle, t: g.elapsed }); const past = o.hist.find(h => g.elapsed - h.t <= o.delay); if (past) { o.x = past.x; o.y = past.y; o.angle = past.a; } } }
      if (o.kind === "track") { o.next -= dt; if (o.next <= 0) { o.next = 0.5; const own = g.players.find(p => p.id === o.owner); if (own) { let best = null, bd = o.radius; for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && !(q.camo === 2 && q.speedNow < 0.1) && dist(own, q) < bd) { bd = dist(own, q); best = q; } o.hist.push({ x: best ? best.x : null, y: best ? best.y : null, t: g.elapsed }); const past = o.hist.find(h => g.elapsed - h.t >= o.delay); if (past && past.x != null) { o.mark = { x: past.x, y: past.y }; } } } }
      if (o.kind === "freeze_bomb" && o.life <= 0.001) { for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && dist(o, q) <= o.r) q.stunT = Math.max(q.stunT, o.stun); emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 }); o.dead = true; }
      if (o.kind === "bomb" && o.life <= 0.001) { for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && dist(o, q) <= o.r) { const ang = Math.atan2(q.y - o.y, q.x - o.x); for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); } emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 }); o.dead = true; }
      if (o.kind === "gate" && o.exit && o.life <= 0.001) o.dead = true;
    }
    if (g.objects.some(o => o.dead)) g.objects = g.objects.filter(o => !o.dead);
    // 呪標：8m内なら固有技の回復を遅らせる（一度だけ）
    for (const p of g.players) for (const m of p.mods) if (m.k === "hexed" && !m.applied) { const by = g.players.find(q => q.id === m.by); if (by && dist(by, p) <= m.range) { p.skillCd += m.cdDelay; m.applied = true; } }
    // 結び糸：6m以内なら被発見時間を短く（reveal を少しずつ削る）
    for (const p of g.players) for (const m of p.mods) if (m.k === "thread" && p.reveal > 0) { const q = g.players.find(x => x.id === m.with); if (q && dist(p, q) <= m.linkRange) p.reveal = Math.max(0, p.reveal - dt * 0.25); }
  }
  // 設置物との接触
  function touchObjects(g, p) {
    for (const o of g.objects) {
      if (o.dead) continue;
      if (o.kind === "fox_fire" && o.team !== p.team && dist(p, o) <= o.r + R.bodyRadius) { setReveal(p, o.revealSec); unhide(g, p); o.dead = true; emit(g, "found", p.x, p.y, { team: o.team, target: p.id }); }
      if (o.kind === "thorns" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= (p.crouch ? 0.2 : 0.4) && !(o.last === p.id && g.elapsed - o.lastT < 3)) { o.last = p.id; o.lastT = g.elapsed; setReveal(p, o.revealSec); emit(g, "found", p.x, p.y, { team: o.team, target: p.id }); }
      if (o.kind === "trail" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= 0.5 && !(o.last === p.id && g.elapsed - o.lastT < 1.5)) { o.last = p.id; o.lastT = g.elapsed; setReveal(p, o.revealSec); unhide(g, p); }
      if (o.kind === "arrow" && o.team === p.team && dist(p, o) <= o.r) p.silentT = Math.max(p.silentT, o.silentSec);
      if (o.kind === "zone_fog" && o.team !== p.team && dist(p, o) <= o.r + 0.3 && dist(p, o) > o.r) { addMod(p, "fogTrail", o.trailSec); setReveal(p, o.trailSec); }
      if (o.kind === "gate" && o.exit && dist(p, o) <= o.r && !(o.usedBy || []).includes(p.id) && (p.id === o.owner || o.team !== p.team)) { o.usedBy = (o.usedBy || []).concat(p.id); p.x = o.exit.x; p.y = o.exit.y; p.px = p.x; p.py = p.y; emit(g, "gate", p.x, p.y, { team: o.team, life: 0.6 }); if (p.id === o.owner) o.life = Math.min(o.life, 3); }
      if (o.kind === "zone_petals" && o.team === p.team && p.camo === 1 && dist(p, o) <= o.r) { /* 開始短縮は camo 開始時に反映 */ }
    }
  }

  // ネット対戦：受け取った入力を反映（連番の重複・古い入力は捨てる。行動は次のtickまで溜める）''')

# ---------------- スナップショット：HP・露見・成長・設置物 ----------------
rep('''      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false, role: p.role };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, slow: p.slow, stats: p.stats });''',
'''      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false, role: p.role,
      hp: p.hp, hpMax: p.hpMax, exposed: +p.exposed.toFixed(1), healT: +p.healT.toFixed(2), stunT: p.stunT, channel: p.sk.channel ? p.sk.channel.kind : null, modKeys: p.mods.map(m => m.k), ultActive: p.ult.active };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, slow: p.slow, stats: p.stats,
      skillCd: p.skillCd, skillCdMax: skillCdFor(g, p), perks: p.perks, pendingLevel: p.pendingLevel, pickT: p.pickT, ult: p.ult, kawarimi: p.sk.kawarimi || 0, poisonArmed: p.sk.poisonArmed || 0, shield: p.sk.shield || 0 });''')
rep('''  function pubPlayer(p, full) {''', '''  function pubPlayer(p, full, g) {''')
rep('''      if (!v || p.team === v.team) { players.push(pubPlayer(p, p === v)); continue; }''',
    '''      if (!v || p.team === v.team) { players.push(pubPlayer(p, p === v, g)); continue; }''')
rep('''      else { const o = pubPlayer(p, false); o.lastSeen = p.lastSeen; players.push(o); }''',
    '''      else { const o = pubPlayer(p, false, g); o.lastSeen = p.lastSeen; players.push(o); }''')
rep('''    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds };''',
'''    const objects = g.objects.filter(o => !o.dead && objVisible(g, v, o)).map(o => pubObject(o, v));
    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds, objects, xp: g.xp, level: g.level };''')
rep('''  // 効果は観戦者に関係あるものだけ（合図は味方のみ）''',
'''  function objVisible(g, v, o) {
    if (!v) return true;
    if (o.team === v.team) return true;
    if (o.kind === "track" || o.kind === "arrow" && false) return false;
    if (o.kind === "decoy_static" && o.team !== v.team) return dist(v, o) <= R.viewRange && lineClear(v.x, v.y, o.x, o.y);
    return dist(v, o) <= R.viewRange + (o.r || 2) && (o.kind === "zone_dark" || o.kind === "zone_fog" || lineClear(v.x, v.y, o.x, o.y));
  }
  function pubObject(o, v) {
    const base = { id: o.id, kind: o.kind, team: o.team, x: +o.x.toFixed(2), y: +o.y.toFixed(2), life: +o.life.toFixed(2), r: o.r, half: o.half, pattern: o.pattern, angle: o.angle, char: o.char, pending: o.pending, ax: o.ax, ay: o.ay, bx: o.bx, by: o.by, exit: o.exit };
    if (o.kind === "track" && v && o.team === v.team) base.mark = o.mark;
    if (o.kind === "decoy_static" && v && o.team !== v.team) { base.camo = 2; }
    return base;
  }
  // 効果は観戦者に関係あるものだけ（合図は味方のみ）''')

# ---------------- Bot：露見中の行動・手当・固有技・奥義 ----------------
rep('''    // ---- 旗を掴めるなら最優先 ----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"] }); return; }''',
'''    // ---- 露見中：近くに味方がいれば待つ、いなければ自陣へ ----
    if (p.exposed > 0) {
      const mate = mates.find(m => m.returning <= 0 && m.exposed <= 0 && dist(m, p) < 8);
      if (mate && dist(mate, p) < 2.5) { setInput(p, { x: 0, y: 0, actions: [] }); return; }
      const home = spawnPos(p); const mv = steer(g, p, home); setInput(p, { x: mv.x, y: mv.y, actions: [] }); return;
    }
    // ---- 味方の手当（敵が見えていなければ寄って静止する）----
    const wounded = mates.find(m => m.exposed > 0 && m.returning <= 0 && dist(m, p) < 10);
    if (wounded && !enemies.some(q => q.returning <= 0 && botSees(p, q))) {
      if (dist(p, wounded) <= 1.2) { setInput(p, { x: 0, y: 0, actions: [] }); return; }
      const mv = steer(g, p, wounded); setInput(p, { x: mv.x, y: mv.y, actions: [] }); return;
    }
    // ---- 固有技・奥義（状況で使う）----
    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);
    // ---- 旗を掴めるなら最優先 ----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"].concat(skillActs) }); return; }
    if (skillActs.length) actions.push(...skillActs);''')
rep('''  function botThink(g, p) {
    const ai = p.ai, dif = g.difficulty;''',
'''  // Botの固有技の使いどころ（型ごと）
  function botSkill(g, p, enemies, mates, seen, flagD) {
    const acts = [];
    if (p.ult && !p.ult.used && p.perks[5]) {
      const t = p.perks[5];
      if (t === "影" && p.camo === 2 && flagD > 3 && flagD < 14) acts.push("ult");
      if (t === "技" && p.skillCd > 5) acts.push("ult");
      if (t === "護" && mates.some(m => dist(m, p) <= 4 && m.reveal > 0)) acts.push("ult");
    }
    const sk = p.bal.skill; if (!sk || p.skillCd > 0 || p.sk.channel || p.protect > 0) return acts;
    const k = sk.kind, enemyNear = seen[0], dNear = enemyNear ? dist(p, enemyNear) : 99;
    const hurtMate = mates.find(m => m.returning <= 0 && (m.reveal > 0 || m.hp < m.hpMax * 0.6) && dist(m, p) <= 8);
    const attackKinds = ["trail_reveal", "freeze_bomb", "bomb", "dash", "snipe", "leap", "smash", "hex", "poison_mark", "fox_fires", "berserk", "sacrifice"];
    const defenseKinds = ["wall", "zone_water", "zone_fog", "zone_dark", "zone_null", "parry", "counter_stance", "decoy_run", "decoy_static", "echo_clone", "substitution"];
    const supportKinds = ["ally_shield", "cleanse", "soul_return", "thread", "tempo", "zone_petals"];
    const reconKinds = ["track_nearest", "hawk_eye", "snake", "thorns", "arrows", "cat_choice"];
    const moveKinds = ["tailwind", "fox_dash", "paint_zone", "shadow_gate"];
    if (attackKinds.includes(k) && enemyNear && dNear <= 7) acts.push("skill");
    else if (defenseKinds.includes(k) && enemyNear && dNear <= 6) acts.push("skill");
    else if (supportKinds.includes(k) && (hurtMate || (k === "soul_return" && mates.some(m => m.returning > 0 || m.exposed > 0)) || (k === "zone_petals" && mates.some(m => m.camo === 1)))) acts.push("skill");
    else if (reconKinds.includes(k) && (p.ai.phase === "guard" || p.ai.phase === "wait" || p.ai.phase === "harass") && !enemyNear && rng(g) < 0.02) acts.push("skill");
    else if (moveKinds.includes(k) && p.ai.phase === "go" && flagD < 14 && flagD > 3) acts.push("skill");
    return acts;
  }
  function botThink(g, p) {
    const ai = p.ai, dif = g.difficulty;''')

# ---------------- 露見中の敵は見える／音なし ----------------
rep('''  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.reveal > 0) return "revealed";''',
'''  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.exposed > 0 && dist(viewer, q) <= R.viewRange && lineClear(viewer.x, viewer.y, q.x, q.y)) return "revealed";
    if (q.reveal > 0) return "revealed";''')
# 幽霊/波紋の判定にも hp を
rep('''    field, steer, createMatch, resetForRematch, makePlayer, setInput, netInput, snapshot, effectVisible, freshAi, assignAi, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor };''',
    '''    field, steer, createMatch, resetForRematch, makePlayer, setInput, netInput, snapshot, effectVisible, freshAi, assignAi, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor,
    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, skillCdFor, inZone, get objects() { return DYN; } };''')
open(p, "w", encoding="utf-8").write(s)
print("sim.js patched (HP / level / skills)")
