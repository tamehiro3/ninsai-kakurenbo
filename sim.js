// 忍彩かくれんぼ — 競技シミュレーション（決定論・30Hz固定tick・DOM非依存）
// 将来サーバーへ移す前提：入力は「方向と希望する行動」だけ。座標や命中はここが決める（設計書09）。
const Sim = (() => {
  const D = (typeof DATA !== "undefined") ? DATA : require("./data.js");
  const R = D.RULES;
  const W = D.MAP.w, H = D.MAP.h;
  const TICK = 1 / 30;
  const FLAG = D.MAP.flag;
  const SOLID = { "#": 1, "t": 1, "r": 1 };
  const grid = D.MAP_ROWS.map(r => r.split(""));

  // ---------- 地形 ----------
  function cellAt(x, y) {
    const cx = x | 0, cy = y | 0;
    if (x < 0 || y < 0 || cx >= W || cy >= H) return "#";
    return grid[cy][cx];
  }
  function solidCell(cx, cy, team) {
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
    const c = grid[cy][cx];
    if (SOLID[c]) return true;
    if (team === 0 && c === "O") return true;
    if (team === 1 && c === "B") return true;
    return false;
  }
  // 試合中に置かれた設置物（金剛壁など）。step() の先頭で更新する
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
    for (const o of DYN) if (o.kind === "wall" && !o.pending && segDist(x, y, o.ax, o.ay, o.bx, o.by) < r + 0.25) return true;
    return false;
  }
  function dynBlocksLos(ax, ay, bx, by) {
    for (const o of DYN) {
      if (o.kind === "wall" && !o.pending && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return true;
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
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!solidCell(cx, cy, team)) continue;
      const nx = Math.max(cx, Math.min(x, cx + 1)), ny = Math.max(cy, Math.min(y, cy + 1));
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  // 射線：固体セルだけが遮る（陣地は遮らない）
  function lineClear(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    const n = Math.ceil(len / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false;
    }
    if (DYN.length && dynBlocksLos(ax, ay, bx, by)) return false;
    return !SOLID[cellAt(bx, by)];
  }
  function pathClear(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-6) return true;
    const n = Math.ceil(len / 0.2);
    for (let i = 1; i <= n; i++) { const t = i / n; if (SOLID[cellAt(ax + dx * t, ay + dy * t)]) return false; }
    for (const o of DYN) if (o.kind === "wall" && !o.pending && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return false;
    return true;
  }
  function zoneAt(x, y) {
    const c = cellAt(x, y);
    if (c === "b" || c === "s" || c === "w") return c;
    for (const o of DYN) if (o.kind === "paint_zone" && Math.abs(x - o.x) <= o.half && Math.abs(y - o.y) <= o.half) return o.pattern;
    return null;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const mirrorX = x => W - x;

  // BFS距離場（チームごとに敵陣地を壁扱い）。Botの経路用
  const fieldCache = new Map();
  function field(team, tx, ty) {
    const cx = Math.max(0, Math.min(W - 1, tx | 0)), cy = Math.max(0, Math.min(H - 1, ty | 0));
    const key = team + ":" + cx + "," + cy;
    let f = fieldCache.get(key);
    if (f) return f;
    f = new Int16Array(W * H).fill(-1);
    const q = [cx + cy * W]; f[cx + cy * W] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i / W) | 0, d = f[i];
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of nb) {
        if (solidCell(nx, ny, team)) continue;
        const j = nx + ny * W;
        if (f[j] >= 0) continue;
        f[j] = d + 1; q.push(j);
      }
    }
    fieldCache.set(key, f);
    return f;
  }
  // 距離場を下る方向（斜めは両隣が空いているときだけ）
  function descend(f, p, team, target) {
    const cx = p.x | 0, cy = p.y | 0;
    let best = null, bd = f[cx + cy * W], bt = 1e9;
    if (bd < 0) bd = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (solidCell(nx, ny, team)) continue;
      if (dx && dy && (solidCell(cx + dx, cy, team) || solidCell(cx, cy + dy, team))) continue;
      const d = f[nx + ny * W];
      if (d < 0) continue;
      const cost = d + (dx && dy ? 0.41 : 0);
      const tie = target ? Math.hypot(nx + 0.5 - target.x, ny + 0.5 - target.y) : 0;
      if (cost < bd - 1e-6 || (Math.abs(cost - bd) < 1e-6 && tie < bt)) { bd = cost; bt = tie; best = { x: nx + 0.5, y: ny + 0.5 }; }
    }
    return best;
  }

  // ---------- 乱数 ----------
  function rng(g) {
    let x = g.seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; g.seed = x >>> 0;
    return g.seed / 4294967296;
  }

  // ---------- 生成 ----------
  function makePlayer(id, team, charIdx, opts = {}) {
    const slot = opts.slot | 0;
    const sp = D.MAP.spawn[slot % 3];
    const x = team ? mirrorX(sp.x) : sp.x;
    return {
      id, team, char: Math.max(0, Math.min(D.CHARS.length - 1, charIdx | 0)), name: opts.name || D.CHARS[Math.max(0, Math.min(D.CHARS.length - 1, charIdx | 0))].name,
      bot: !!opts.bot, role: opts.role || "scout", slot,
      x, y: sp.y, px: x, py: sp.y, angle: team ? Math.PI : 0, speedNow: 0,
      crouch: false,
      camo: 0, camoEnter: 0, camoTime: 0, camoCd: 0, camoPattern: null,
      reveal: 0, marks: 0, markTime: 0, invuln: 0, slow: 0,
      returning: 0, protect: 0,
      // HP・露見・手当（設計図：HP・レベルアップ）
      hp: R.hp.byLevel[0], hpMax: R.hp.byLevel[0], exposed: 0, healT: 0, healBy: null, exposedAt: -99, silentT: 0, stunT: 0, aimJitter: 0,
      // 成長：レベルごとに選んだ系統 {2:"影",...}、選択待ち、奥義
      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, firstHitArmed: false, crossedCenter: false, lastSide: 0, protectBonus: 0, soulBoosted: false,
      // 固有技
      skillCd: 0, sk: {}, mods: [],       // mods: [{k:"speed", mul:1.15, t:4}, ...]
      bal: balanceFor(charIdx),
      scanCd: 0, scanPending: 0, shotCd: 0, pingCd: 0,
      castleTime: 0, awayTime: 0, pulse: false,
      lastSeen: null,           // 味方が共有する「最後に見た場所」{x,y,t}
      input: { x: 0, y: 0, actions: [], angle: null }, connected: opts.connected !== false, netSeq: 0,
      stats: { hides: 0, hideTime: 0, reveals: 0, hits: 0, pings: 0, returns: 0, claims: 0, marked: 0, damage: 0, taken: 0, hp0: 0, heals: 0, skills: 0, xp: 0 },
      // Bot用
      ai: { think: 0, wp: 0, phase: "route", suspect: null, seen: 0, goAt: 0, lastPing: -99, lastPingKind: "", waitT: 0, scanned: false, post: null, postT: 0, patience: 40, lastContact: -99, minClaim: 30, stepOut: false, hz: "attack", hzT: 0, quietT: 0, shotAt: -99 },
      controller: null,         // 練習用の台本Bot
      emote: null,              // {type, t}
    };
  }

  // 能力値（1〜5・3が共通値）→ 係数。設計図「能力3を現行共通値とする」
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
      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, lastExpose: {}, objects: [], dyn: [], camoMarks: [], serial2: 0,
      phase: "briefing", timer: opts.briefing === false ? 0 : R.briefing,
      time: R.duration, elapsed: 0, tick: 0, overtime: false,
      seed: (opts.seed | 0) || 20260922,
      difficulty: D.DIFFICULTY[opts.difficulty] || D.DIFFICULTY.normal,
      practice: !!opts.practice, noTimer: !!opts.noTimer,
      players: [], shots: [], effects: [], log: [], serial: 0,
      winner: [], claimants: [], reason: "", claimTick: -1,
      flag: "available", rules: R.version, map: D.MAP.version,
    };
    (opts.players || []).forEach((p, i) => g.players.push(makePlayer(p.id || ("p" + i), p.team, p.char, p)));
    for (const p of g.players) assignAi(g, p);
    return g;
  }
  // 難易度ごとの初期値（手ごわい＝早く取りに行く・ルートも役割どおりとは限らない）
  function assignAi(g, p) {
    const dif = g.difficulty;
    // HP制（3発で露見）になって守りが弱まったぶん、最短取得を設計書の目安（初回45〜90秒）へ寄せる。手ごわいは従来どおり速い
    p.ai.minClaim = dif.aggro ? 18 + rng(g) * 15 : dif.name === "やさしい" ? 60 + rng(g) * 40 : 45 + rng(g) * 35;
    p.ai.routeOverride = null;
    if (dif.aggro && p.bot && rng(g) < 0.5) {
      const routes = Object.keys(D.MAP.routes);
      p.ai.routeOverride = routes[(rng(g) * routes.length) | 0];
    }
  }
  function resetForRematch(g, swapTeams) {
    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role, connected: p.connected }));
    Object.assign(g, { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false,
      shots: [], effects: [], log: [], winner: [], claimants: [], reason: "", claimTick: -1, flag: "available",
      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, lastExpose: {}, objects: [], dyn: [], camoMarks: [] });
    DYN = g.dyn;
    g.players = players;
    for (const p of g.players) assignAi(g, p);
    return g;
  }

  function emit(g, type, x, y, extra) {
    const life = extra && extra.life != null ? extra.life : (type === "ping" ? 2 : type === "scan" ? 0.6 : type === "win" ? 4 : 1);
    g.effects.push(Object.assign({ id: ++g.serial, type, x, y, life, maxLife: life, team: -1 }, extra || {}));
    if (g.effects.length > 120) g.effects.shift();
  }
  function logEvent(g, type, extra) {
    g.log.push(Object.assign({ tick: g.tick, type }, extra || {}));
    if (g.log.length > 60) g.log.shift();
  }

  // ---------- 入力 ----------
  const ACTIONS = ["camo", "scan", "shot", "claim", "ping", "crouch", "skill", "ult"];
  const ACT_OK = a => ACTIONS.includes(a) || (typeof a === "string" && (a.startsWith("ping:") || a.startsWith("tree:") || a.startsWith("skill:")));
  function setInput(p, i) {
    if (!i || typeof i !== "object") return;
    const n = v => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    let x = n(i.x), y = n(i.y);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.input = {
      x, y,
      actions: Array.isArray(i.actions) ? i.actions.filter(ACT_OK).slice(0, 8) : [],
      angle: Number.isFinite(i.angle) ? i.angle : null,
    };
  }

  // ---------- 状態遷移の補助 ----------
  function unhide(g, p, quiet) {
    if (p.camo) {
      if (p.camo === 2 && !quiet) emit(g, "unhide", p.x, p.y, { team: p.team });
      p.camo = 0; p.camoEnter = 0; p.camoTime = 0; p.camoCd = R.camoCooldown;
    }
  }
  function spawnPos(p) {
    const sp = D.MAP.spawn[p.slot % 3];
    return { x: p.team ? mirrorX(sp.x) : sp.x, y: sp.y };
  }
  function returnHome(g, p) {
    unhide(g, p, true);
    const s = spawnPos(p);
    emit(g, "return", p.x, p.y, { team: p.team });
    p.x = s.x; p.y = s.y; p.px = s.x; p.py = s.y;
    p.returning = R.returnWait; p.marks = 0; p.markTime = 0; p.reveal = 0; p.slow = 0;
    p.castleTime = 0; p.awayTime = 0; p.pulse = false; p.scanPending = 0;
    p.hp = p.hpMax; p.exposed = 0; p.healT = 0; p.healBy = null; p.crossedCenter = false; p.stunT = 0; p.aimJitter = 0; p.silentT = 0;
    p.mods = []; p.sk = {}; p.firstHitArmed = false;
    p.ai.wp = 0; p.ai.phase = "route"; p.ai.retreat = 0;
    p.stats.returns++;
    logEvent(g, "return", { id: p.id, team: p.team });
  }

  // 可視判定（同じ関数を人間の描画とBotの両方が使う）
  function inZone(kind, x, y, team) {
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
    if (q.camo === 2 && q.reveal <= 0 && d >= R.closeSee) return false;
    return true;
  }
  // 布だけが見える（擬態中・射線あり）
  function clothVisible(p, q) {
    return q.camo === 2 && q.returning <= 0 && dist(p, q) <= R.viewRange && lineClear(p.x, p.y, q.x, q.y);
  }
  // 足音が聞こえるか（壁があれば半減）
  function audible(listener, src) {
    if (src.returning > 0) return false;
    const hearMul = (listener.sk && listener.sk.channel && listener.sk.channel.kind === "hawk_eye") ? 0.5 : 1;   // 鷹の目：本体は音も聞こえにくい
    if (listener.team !== src.team && src.sk && src.sk.channel && src.sk.channel.kind === "tempo") {   // 疾拍子：演奏音は10m届く
      let r = 10 * hearMul; if (!lineClear(listener.x, listener.y, src.x, src.y)) r *= 0.5;
      return dist(listener, src) <= r;
    }
    if (src.speedNow < 0.1) return false;
    if (src.silentT > 0 || inZone("zone_water", src.x, src.y, src.team)) return false;
    // 紫煙から出た直後は足跡が残る（視程内の敵には方向が伝わる）
    if (listener.team !== src.team && modHas(src, "fogTrail") && dist(listener, src) <= R.viewRange) return true;
    let r = src.camo === 2 ? (modHas(src, "foxdash") ? R.footCrouch : R.footCamo) : src.crouch ? R.footCrouch : R.footRun;   // 狐駆け：布の揺れが大きい
    r *= hearMul;
    if (!lineClear(listener.x, listener.y, src.x, src.y)) r *= 0.5;
    return dist(listener, src) <= r;
  }

  // ---------- Bot ----------
  function routeFor(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[1];
    const rt = D.MAP.routes[(p.ai && p.ai.routeOverride) || role.route];
    const m = pt => p.team ? { x: mirrorX(pt[0]), y: pt[1] } : { x: pt[0], y: pt[1] };
    return { pts: rt.pts.map(m), wait: m(rt.wait) };
  }
  function steer(g, p, target) {
    const f = field(p.team, target.x, target.y);
    const cx = p.x | 0, cy = p.y | 0;
    let aim;
    if (f[cx + cy * W] <= 1 || dist(p, target) < 1.2) aim = target;
    else aim = descend(f, p, p.team, target) || target;
    let dx = aim.x - p.x, dy = aim.y - p.y, l = Math.hypot(dx, dy);
    if (l < 0.15) return { x: 0, y: 0 };
    const a = Math.atan2(dy, dx);
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2]) {
      const t = a + off;
      if (!blocked(p.x + Math.cos(t) * 0.7, p.y + Math.sin(t) * 0.7, R.bodyRadius + 0.05, p.team)) return { x: Math.cos(t), y: Math.sin(t) };
    }
    return { x: 0, y: 0 };
  }
  // 守り役の持ち場（旗から約3.3m・砂地の縁）。橙は鏡像
  function alertRadius(dif) { return dif.aimErr > 0.2 ? 3.5 : dif.aimErr < 0.1 ? 5.5 : 4.5; }
  function guardPosts(team, dif) {
    // 旗から「警戒半径＋0.6m」の自陣側に3か所（敵の持ち場とは印が届かない距離）
    const r = alertRadius(dif) + 0.6;
    return [-0.42, 0, 0.42].map(a => {
      const ang = Math.PI + a;
      const x = FLAG.x + Math.cos(ang) * r, y = FLAG.y + Math.sin(ang) * r;
      return { x: team ? mirrorX(x) : x, y };
    });
  }
  // 陽動役の覗き場所と攻め場所（ルート別・青。橙は鏡像）
  const HARASS = {
    north:  { peek: [30.5, 17.0], attack: [29.0, 20.6] },
    center: { peek: [24.3, 24.0], attack: [27.6, 20.6] },
    south:  { peek: [30.5, 31.0], attack: [29.0, 27.4] },
  };
  function harassPts(p) {
    const role = D.ROLES.find(r => r.id === p.role) || D.ROLES[2];
    const h = HARASS[(p.ai && p.ai.routeOverride) || role.route] || HARASS.south;
    const m = pt => p.team ? { x: mirrorX(pt[0]), y: pt[1] } : { x: pt[0], y: pt[1] };
    return { peek: m(h.peek), attack: m(h.attack) };
  }
  const BOT_FOV = Math.PI * 220 / 180;
  function botSees(p, q) {
    if (!canSee(p, q)) return false;
    if (dist(p, q) < 2.5) return true;
    return Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.angle)) <= BOT_FOV / 2;
  }
  // 擬態したまま旗の方向へ柄が続いているか（狐駆け・影渡りの使いどころ）
  function zoneTowardFlag(g, p) { const mv = steer(g, p, FLAG); return !!zoneAt(p.x + mv.x * 1.0, p.y + mv.y * 1.0); }
  // Botの固有技の使いどころ（型ごと）
  function botSkill(g, p, enemies, mates, seen, flagD) {
    const acts = [];
    if (p.ult && !p.ult.used && p.perks[5]) {
      const t = p.perks[5];
      if (t === "影" && p.camo === 2 && flagD > 3 && flagD < 14 && zoneTowardFlag(g, p)) acts.push("ult");
      if (t === "技" && p.skillCd > 5) acts.push("ult");
      if (t === "護" && mates.some(m => dist(m, p) <= 4 && m.reveal > 0)) acts.push("ult");
    }
    const sk = p.bal.skill;
    if (sk && sk.kind === "shadow_gate" && g.objects.some(o => o.kind === "gate" && o.owner === p.id && !o.exit && !o.dead && dist(p, o) <= 1.2)) { acts.push("skill"); return acts; }   // 出口を置いて渡る
    if (!sk || p.skillCd > 0 || p.sk.channel || p.protect > 0) return acts;
    const k = sk.kind, enemyNear = seen[0], dNear = enemyNear ? dist(p, enemyNear) : 99;
    const hurtMate = mates.find(m => m.returning <= 0 && (m.reveal > 0 || m.hp < m.hpMax * 0.6) && dist(m, p) <= 8);
    const attackKinds = ["trail_reveal", "freeze_bomb", "bomb", "dash", "snipe", "leap", "smash", "hex", "poison_mark", "fox_fires", "berserk", "sacrifice"];
    const defenseKinds = ["wall", "zone_water", "zone_fog", "zone_dark", "zone_null", "parry", "counter_stance", "decoy_run", "decoy_static", "echo_clone", "substitution"];
    const supportKinds = ["ally_shield", "cleanse", "soul_return", "thread", "tempo"];
    const reconKinds = ["track_nearest", "hawk_eye", "snake", "thorns", "arrows", "cat_choice"];
    const moveKinds = ["tailwind", "paint_zone", "shadow_gate"];
    if (attackKinds.includes(k) && enemyNear && dNear <= 7) acts.push("skill");
    else if (defenseKinds.includes(k) && enemyNear && dNear <= 6) acts.push("skill");
    else if (k === "soul_return") { if (mates.some(m => m.returning > 0 && !m.soulBoosted)) acts.push("skill"); }
    else if (supportKinds.includes(k) && hurtMate) acts.push("skill");
    else if (k === "zone_petals") { const m = mates.find(m => m.camo === 0 && m.exposed <= 0 && m.returning <= 0 && m.speedNow < 0.5 && zoneAt(m.x, m.y) && dist(m, p) <= 4 && dist(m, p) > 0.5); if (m) { p.ai.faceAngle = Math.atan2(m.y - p.y, m.x - p.x); acts.push("skill"); } }
    else if (k === "fox_dash") { if (p.camo === 2 && flagD < 20 && flagD > 4 && zoneTowardFlag(g, p)) acts.push("skill"); }
    else if (reconKinds.includes(k) && (p.ai.phase === "guard" || p.ai.phase === "wait" || p.ai.phase === "harass") && !enemyNear && rng(g) < 0.02) acts.push("skill");
    else if (moveKinds.includes(k) && p.ai.phase === "go" && flagD < 14 && flagD > 3) acts.push("skill");
    return acts;
  }
  function botThink(g, p) {
    const ai = p.ai, dif = g.difficulty;
    ai.think -= TICK;
    if (ai.think > 0) { p.input.actions = []; return; }
    const interval = 0.15 + rng(g) * 0.12;
    ai.think = interval;
    const actions = [];
    const enemies = g.players.filter(q => q.team !== p.team && q.exposed <= 0);   // 露見中の敵は印が当たらず旗も掴めない
    const mates = g.players.filter(q => q.team === p.team && q !== p);
    const flagD = dist(p, FLAG);
    const late = g.overtime || g.elapsed > 120;
    const easy = dif.aimErr > 0.2;

    // ---- 知覚（人間と同じ可視ルール＋視野220°）----
    const seen = enemies.filter(q => botSees(p, q)).sort((a, b) => dist(p, a) - dist(p, b));
    const shared = enemies.filter(q => q.reveal > 0 && q.returning <= 0 && !seen.includes(q));
    if (ai.suspect) { ai.suspect.t -= interval; if (ai.suspect.t <= 0) ai.suspect = null; }
    for (const q of enemies) {
      if (q.returning > 0 || seen.includes(q)) continue;
      if (q.camo === 2 && q.speedNow > 0.1 && dist(p, q) <= R.scanRange && lineClear(p.x, p.y, q.x, q.y) && rng(g) < dif.notice * interval * 2)
        ai.suspect = { x: q.x, y: q.y, t: 2.5, sure: true };
      else if (audible(p, q) && rng(g) < 0.6 && !(ai.suspect && ai.suspect.sure))
        ai.suspect = { x: q.x + (rng(g) - 0.5) * 2, y: q.y + (rng(g) - 0.5) * 2, t: 1.5, sure: false };
    }
    const enemy = seen[0] || null;
    if (enemy) { ai.seen += interval; ai.lastContact = g.elapsed; } else ai.seen = 0;
    const reacted = enemy && ai.seen >= dif.reaction;
    // 旗に迫る敵（見えている／発見中）
    const approaching = q => { const vx = (q.x - q.px) / TICK, vy = (q.y - q.py) / TICK; const d = dist(q, FLAG); return d > 0.1 && ((FLAG.x - q.x) * vx + (FLAG.y - q.y) * vy) / d > 1.0; };
    const alertR = alertRadius(dif);
    // 競り合い：旗へ「向かって来ている」敵だけを侵入者とみなす（陽動役が旗の近くをうろつくだけでは反応しない。HP制で守りが弱まったぶん早取りを抑える）
    const intruder = enemies.filter(q => q.returning <= 0 && dist(q, FLAG) < alertR && (botSees(p, q) || q.reveal > 0) && (approaching(q) && (dist(q, FLAG) < flagD + 1.5 || dist(q, FLAG) < alertR * 0.6))).sort((a, b) => dist(a, FLAG) - dist(b, FLAG))[0] || null;
    const contest = !!intruder && flagD <= dist(intruder, FLAG) + 2.5;
    const quiet2 = ai.lastContact + 2 < g.elapsed && !ai.suspect && !enemies.some(q => q.returning <= 0 && dist(q, FLAG) < 12 && audible(p, q));
    const opportunity = quiet2 && g.elapsed > ai.minClaim;

    // ---- 露見中：近くに味方がいれば待つ、いなければ自陣へ ----
    if (p.exposed > 0) {
      const mate = mates.find(m => m.returning <= 0 && m.exposed <= 0 && dist(m, p) < 8);
      if (mate && dist(mate, p) < 2.5) { setInput(p, { x: 0, y: 0, actions: [] }); return; }
      const home = spawnPos(p); const mv = steer(g, p, home); setInput(p, { x: mv.x, y: mv.y, actions: [] }); return;
    }
    // ---- 旗を掴めるなら最優先（手当より先）----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"] }); return; }
    // ---- 動くと解ける構え（鷹の目・狙撃・疾拍子）の間は止まる。近くに敵が迫ったら構えを捨てて動く ----
    if (p.sk.channel && p.sk.channel.cancelOnMove) {
      const th = seen[0];
      if (!(th && dist(p, th) < 4 && p.sk.channel.kind !== "snipe")) { setInput(p, { x: 0, y: 0, actions: [], angle: th ? Math.atan2(th.y - p.y, th.x - p.x) : null }); return; }
    }
    // ---- 味方の手当（敵が見えていなければ寄って静止する）----
    const wounded = mates.find(m => m.exposed > 0 && m.returning <= 0 && dist(m, p) < 10);
    if (wounded && !enemies.some(q => q.returning <= 0 && botSees(p, q))) {
      if (dist(p, wounded) <= 1.2) { setInput(p, { x: 0, y: 0, actions: [] }); return; }
      const mv = steer(g, p, wounded); setInput(p, { x: mv.x, y: mv.y, actions: [] }); return;
    }
    // ---- 固有技・奥義（状況で使う）----
    const skillActs = botSkill(g, p, enemies, mates, seen, flagD);
    if (skillActs.includes("skill") && p.ai.faceAngle != null) { const fa = p.ai.faceAngle; p.ai.faceAngle = null; setInput(p, { x: 0, y: 0, actions: skillActs, angle: fa }); return; }   // 花隠れ：味方のほうを向いて置く
    // ---- 旗を掴めるなら最優先 ----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"].concat(skillActs) }); return; }
    if (skillActs.length) actions.push(...skillActs);
    // ---- 布を広げている最中は動かない ----
    if (p.camo === 1) { setInput(p, { x: 0, y: 0, actions: [] }); return; }

    // ---- 擬態中：とどまるか出るか ----
    if (p.camo === 2) {
      const threat = enemies.some(q => q.returning <= 0 && dist(p, q) < 11 && (lineClear(p.x, p.y, q.x, q.y) || audible(p, q)));
      const tooClose = enemies.some(q => q.returning <= 0 && dist(p, q) < 1.6);
      const fast = modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影");
      if (fast && !tooClose && flagD > R.flagNoCamo + 0.5) {
        const mv = steer(g, p, FLAG);
        if (zoneAt(p.x + mv.x * 0.6, p.y + mv.y * 0.6)) { setInput(p, { x: mv.x, y: mv.y, actions: [] }); return; }
      }
      if (threat && !tooClose) ai.waitT = 0; else ai.waitT += interval;
      let leave = p.camoTime < 1.0 || tooClose || late;
      let go = late;
      if (ai.phase === "wait") {
        const minT = dif.aggro ? 12 : 40;
        const engaged = g.elapsed > minT && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
        go = go || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > minT && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));
        if (go && !threat) leave = true;
        // 脅威が無いあいだは布をたたんで持ち時間を温存（持ち場には留まる）
        if (!threat && ai.waitT > 4 && !go) leave = true;
      } else if (!threat && ai.waitT > 1.5) leave = true;
      if (leave) { actions.push("camo"); if (ai.phase === "wait" && go) ai.phase = "go"; }
      setInput(p, { x: 0, y: 0, actions });
      return;
    }

    // ---- 目標地点 ----
    const route = routeFor(p);
    let goal = FLAG, hold = false, angleHold = null;
    if (ai.phase === "route") {
      while (ai.wp < route.pts.length && dist(p, route.pts[ai.wp]) < 1.3) ai.wp++;
      if (ai.wp >= route.pts.length) {
        if (late) ai.phase = "go";
        else if (p.role === "vanguard" && g.elapsed < 60) ai.phase = "towait";
        else if (p.role === "scout") { ai.phase = "guard"; ai.post = guardPosts(p.team, dif)[(rng(g) * 3) | 0]; ai.postT = g.elapsed; ai.patience = 25 + rng(g) * 25; }
        else if (p.role === "decoy") { ai.phase = "harass"; ai.hz = "attack"; ai.hzT = g.elapsed; ai.quietT = 0; }
        else ai.phase = "go";
      }
      goal = ai.wp < route.pts.length ? route.pts[ai.wp] : FLAG;
    }
    if (ai.phase === "towait") {
      goal = route.wait;
      if (dist(p, goal) < 0.45) {
        if (zoneAt(p.x, p.y) && p.camoCd <= 0 && p.reveal <= 0 && p.protect <= 0) {
          ai.phase = "wait"; ai.goAt = g.elapsed + (dif.aggro ? 8 + rng(g) * 10 : 25 + rng(g) * 20); ai.waitT = 0;
          setInput(p, { x: 0, y: 0, actions: ["camo"] }); return;
        }
        ai.phase = "go";
      }
    }
    if (ai.phase === "wait") {
      // 待ち伏せ（擬態が切れても持ち場で再擬態しながら待つ）
      const minT = dif.aggro ? 12 : 40;
      const engaged = g.elapsed > minT && mates.some(m => m.returning <= 0 && m.ai.lastContact > g.elapsed - 2 && dist(m, FLAG) < 16);
      const go = late || engaged || g.elapsed >= ai.goAt || opportunity || (g.elapsed > minT && !!mates.find(m => m.ai.lastPing > g.elapsed - 3 && m.ai.lastPingKind === "flag"));
      if (go) ai.phase = "go";
      else {
        goal = route.wait; hold = dist(p, goal) < 0.6;
        const threatNear = !!ai.suspect || enemies.some(q => q.returning <= 0 && dist(p, q) < 12 && (lineClear(p.x, p.y, q.x, q.y) || audible(p, q)));
        if (hold && threatNear && zoneAt(p.x, p.y) && p.camoCd <= 0 && p.reveal <= 0 && p.protect <= 0 && !enemy) { ai.waitT = 0; setInput(p, { x: 0, y: 0, actions: ["camo"] }); return; }
      }
    }
    if (ai.phase === "guard") {
      // 波紋よけ：8秒居座る前に一度外へ（やさしいBotはしない）
      if (!easy && p.castleTime > 6.5 && !ai.stepOut) ai.stepOut = true;
      if (ai.stepOut && p.castleTime === 0) ai.stepOut = false;
      const post = ai.post;
      const out = { x: FLAG.x + (post.x - FLAG.x) * 1.5, y: FLAG.y + (post.y - FLAG.y) * 1.5 };
      goal = ai.stepOut ? out : post;
      if (dist(p, goal) < 0.5) {
        hold = true;
        angleHold = p.team ? Math.PI : 0;               // 敵側を向いて見張る
        if (p.scanCd <= 0 && p.protect <= 0 && (ai.suspect || rng(g) < 0.015) && rng(g) < dif.scanUse) { actions.push("scan"); ai.suspect = null; angleHold = ai.suspect ? Math.atan2(ai.suspect.y - p.y, ai.suspect.x - p.x) : angleHold; }
        if (g.elapsed - ai.postT > 20 && rng(g) < 0.04) { ai.post = guardPosts(p.team, dif)[(rng(g) * 3) | 0]; ai.postT = g.elapsed; }
      }
      if (late || contest || opportunity || mates.some(m => m.returning <= 0 && dist(m, FLAG) < 2.5)) ai.phase = "go";
    }
    if (ai.phase === "harass") {
      const hp = harassPts(p);
      if (ai.hz === "attack") {
        goal = hp.attack;
        if (dist(p, goal) < 0.6) { hold = true; angleHold = Math.atan2(FLAG.y - p.y, FLAG.x - p.x); }
        if (p.marks > 0 || (ai.shotAt && g.elapsed - ai.shotAt < 0.4 && g.elapsed - ai.hzT > 1)) { ai.hz = "peek"; ai.hzT = g.elapsed; }
        if (hold && !enemy) ai.quietT += interval; else ai.quietT = 0;
      } else {
        goal = hp.peek;
        if (dist(p, goal) < 0.6) { hold = true; angleHold = Math.atan2(FLAG.y - p.y, FLAG.x - p.x); }
        if (g.elapsed - ai.hzT > (dif.aggro ? 1.5 + rng(g) * 1.5 : 3 + rng(g) * 3) && p.marks === 0) {
          ai.hz = "attack"; ai.hzT = g.elapsed;
          // 手ごわい：覗く場所を変えて読まれにくくする（複雑さ）
          if (dif.aggro && rng(g) < 0.5) { const routes = Object.keys(D.MAP.routes); ai.routeOverride = routes[(rng(g) * routes.length) | 0]; }
        }
      }
      if (late || contest || (ai.quietT > 6 && quiet2 && g.elapsed > ai.minClaim * 0.7) || opportunity || mates.some(m => m.returning <= 0 && dist(m, FLAG) < 2.5)) ai.phase = "go";
    }
    if (ai.phase === "go") {
      goal = FLAG;
      if (p.role !== "scout" && !ai.scanned && flagD < 12 && p.scanCd <= 0 && p.protect <= 0 && rng(g) < dif.scanUse * 0.6) {
        ai.scanned = true; p.angle = Math.atan2(FLAG.y - p.y, FLAG.x - p.x);
        setInput(p, { x: 0, y: 0, actions: ["scan"], angle: p.angle }); return;
      }
      if (flagD < 7 && ai.lastPing + 10 < g.elapsed && p.pingCd <= 0) { actions.push("ping:flag"); ai.lastPing = g.elapsed; ai.lastPingKind = "flag"; }
    }
    let move = hold ? { x: 0, y: 0 } : steer(g, p, goal);
    let angle = angleHold;

    // ---- 戦闘の上書き ----
    if (reacted && p.protect <= 0) {
      const d = dist(p, enemy);
      const tt = d / R.shotSpeed;
      const lead = p.role === "decoy" || dif.aimErr < 0.1 ? 1 : dif.aimErr < 0.2 ? 0.5 : 0;
      const ex = enemy.x + (enemy.x - enemy.px) / TICK * tt * lead, ey = enemy.y + (enemy.y - enemy.py) / TICK * tt * lead;
      const ang = Math.atan2(ey - p.y, ex - p.x);
      angle = ang;
      if (d <= (dif.aggro ? 7.9 : 7.5) && p.shotCd <= 0) {
        actions.push("shot"); ai.shotAt = g.elapsed;
        angle = ang + (rng(g) - 0.5) * 2 * dif.aimErr * (0.4 + d / 6);
        if (ai.lastPing + 8 < g.elapsed && p.pingCd <= 0) { actions.push("ping:enemy"); ai.lastPing = g.elapsed; ai.lastPingKind = "enemy"; }
      }
      if (p.marks > 0 && d < 7 && flagD > 2.5 && ai.phase !== "go") {
        const away = { x: p.x - Math.cos(ang) * 5, y: p.y - Math.sin(ang) * 5 };
        move = steer(g, p, away);
      } else if (ai.phase === "harass" && ai.hz === "attack" && d > 7.2 && flagD > 5 && p.marks === 0) {
        move = steer(g, p, enemy);
      } else if (hold) {
        move = { x: 0, y: 0 };
      }
    } else if (ai.suspect && p.scanCd <= 0 && p.protect <= 0 && dist(p, ai.suspect) <= R.scanRange + 0.5 && rng(g) < dif.scanUse) {
      angle = Math.atan2(ai.suspect.y - p.y, ai.suspect.x - p.x);
      actions.push("scan"); ai.suspect = null; move = { x: 0, y: 0 };
    } else {
      const target = shared.find(q => dist(p, q) < 7.5 && lineClear(p.x, p.y, q.x, q.y));
      if (target && p.shotCd <= 0 && p.protect <= 0) {
        angle = Math.atan2(target.y - p.y, target.x - p.x) + (rng(g) - 0.5) * dif.aimErr;
        actions.push("shot"); ai.shotAt = g.elapsed;
      } else {
        const hunt = dif.aggro && !hold && shared.find(q => dist(p, q) < 12 && dist(q, FLAG) > 2);
        if (hunt) move = steer(g, p, hunt);
        const z = zoneAt(p.x, p.y);
        const nearThreat = !!ai.suspect || enemies.some(q => q.returning <= 0 && dist(p, q) < 9 && lineClear(p.x, p.y, q.x, q.y));
        if (z && !hold && !late && ai.phase !== "harass" && p.camoCd <= 0 && p.reveal <= 0 && p.protect <= 0 && flagD > R.flagNoCamo && nearThreat && p.marks === 0 && rng(g) < dif.hideRate) {
          setInput(p, { x: 0, y: 0, actions: ["camo"] }); ai.waitT = 0; return;
        }
      }
    }
    // 忍び足：先行役の突入と手ごわいBotは旗の近くでしゃがむ
    const sneak = (p.role === "vanguard" && ai.phase === "go" && !easy) || dif.crouchNear;
    if (sneak && flagD < 13 && !p.crouch && !enemy) actions.push("crouch");
    if (p.crouch && (flagD > 14 || enemy || flagD < 2.5)) actions.push("crouch");
    setInput(p, { x: move.x, y: move.y, actions, angle });
  }

  // ---------- 1tick ----------
  const DYN_KINDS = { wall: 1, zone_fog: 1, zone_dark: 1, zone_water: 1, paint_zone: 1, zone_null: 1, zone_petals: 1 };
  function bindDyn(g) { DYN = (g && g.dyn) || []; }
  function step(g) {
    const dt = TICK;
    bindDyn(g);
    if (g.phase === "finished") return;
    g.tick++;
    for (const e of g.effects) e.life -= dt;
    g.effects = g.effects.filter(e => e.life > 0);
    for (const p of g.players) { p.px = p.x; p.py = p.y; if (p.emote) { p.emote.t -= dt; if (p.emote.t <= 0) p.emote = null; } }

    if (g.phase === "briefing") { g.timer -= dt; if (g.timer <= 0) { g.phase = "countdown"; g.timer = R.countdown; } g.players.forEach(p => p.input.actions = []); return; }
    if (g.phase === "countdown") { g.timer -= dt; if (g.timer <= 0) { g.phase = "playing"; logEvent(g, "start"); } g.players.forEach(p => p.input.actions = []); return; }

    g.elapsed += dt;
    if (!g.noTimer) g.time -= dt;
    const claims = [];
    stepObjects(g, dt);
    g.dyn = g.objects.filter(o => DYN_KINDS[o.kind] && !(o.kind === "wall" && o.pending));   // 予告中の金剛壁はまだ実体がない
    DYN = g.dyn;
    // 旗の周囲4mの確保（生存人数で上回っている側に +8/3秒・チームで1回分）
    for (const t of [0, 1]) {
      const alive = tm => g.players.filter(q => q.team === tm && q.returning <= 0 && q.exposed <= 0).length;
      const near = g.players.some(q => q.team === t && q.returning <= 0 && q.exposed <= 0 && dist(q, FLAG) <= R.pulseRadius);
      if (near && alive(t) > alive(1 - t)) { g.holdT[t] += dt; if (g.holdT[t] >= 3) { g.holdT[t] -= 3; addXp(g, t, R.hp.xp.hold, "hold"); } }
      else g.holdT[t] = 0;
    }

    // 処理順で後のチームが有利にならないよう、tickごとに順番を反転する
    const order = g.tick % 2 ? g.players.slice().reverse() : g.players;
    for (const p of order) {
      for (const k of ["protect", "markTime", "invuln", "reveal", "slow", "camoCd", "scanCd", "shotCd", "pingCd", "skillCd", "silentT", "stunT", "aimJitter", "firstHitCd"]) p[k] = Math.max(0, p[k] - dt);
      if (p.markTime <= 0) p.marks = 0;
      for (const m of p.mods) m.t -= dt;
      if (p.mods.some(m => m.t <= 0)) { for (const m of p.mods) if (m.t <= 0 && m.onEnd) m.onEnd(g, p); p.mods = p.mods.filter(m => m.t > 0); }
      if (p.ult.active > 0) p.ult.active = Math.max(0, p.ult.active - dt);
      if (p.pendingLevel) { p.pickT -= dt; if (p.pickT <= 0 || p.bot) choosePerk(g, p, null); }
      // 護Lv3 最初の一印：満タンのときだけ構える（減ったら外す）
      p.firstHitArmed = hasPerk(p, "護", 3) && p.hp >= p.hpMax && p.firstHitCd <= 0;
      // 固有技の待機（守り兎8秒・変わり身・追香）は時間で切れる
      for (const k2 of ["shield", "kawarimi", "poisonArmed"]) if (p.sk[k2] > 0) p.sk[k2] = Math.max(0, p.sk[k2] - dt);
      // 逢魔刻：自身が常に可視化される（位置が明確）
      if (modHas(p, "visible")) p.reveal = Math.max(p.reveal, 0.15);
      // 露見：12秒で自動帰還。自陣に入れば即復帰（敵からは射線内で見える＝canSee）
      if (p.exposed > 0) {
        p.exposed = Math.max(0, p.exposed - dt);
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
      }
      if (p.lastSeen) { p.lastSeen.t -= dt; if (p.lastSeen.t <= 0) p.lastSeen = null; }
      if (p.reveal > 0) p.lastSeen = { x: p.x, y: p.y, t: R.lastSeen + 0.001 };
      if (p.returning > 0) {
        p.returning = Math.max(0, p.returning - dt);
        if (p.returning <= 0) { p.protect = R.protect + (p.protectBonus || 0); p.protectBonus = 0; p.soulBoosted = false; }
        p.input.actions = []; p.speedNow = 0;
        continue;
      }
      if (p.bot) { if (p.controller) p.controller(g, p, dt); else botThink(g, p); }
      else if (p.connected === false) { p.input = { x: 0, y: 0, actions: [], angle: null }; if (p.camo) unhide(g, p); }

      const i = p.input;
      const acts = new Set(i.actions);
      i.actions = [];
      // 成長：系統の選択
      for (const a of acts) if (a.startsWith("tree:") && p.pendingLevel) choosePerk(g, p, a.slice(5));
      if (p.exposed > 0 || p.stunT > 0) { for (const a of [...acts]) if (["camo", "scan", "shot", "claim", "skill", "ult", "crouch"].includes(a) || a.startsWith("skill:")) acts.delete(a); }
      if (p.stunT > 0 || (p.sk.channel && p.sk.channel.freeze)) { i.x = 0; i.y = 0; }
      let moving = Math.hypot(i.x, i.y) > 0.1;
      if (moving && p.sk.channel && p.sk.channel.cancelOnMove) { p.sk.channel = null; emit(g, "channel_cancel", p.x, p.y, { team: p.team, life: 0.4 }); }   // 鷹の目・狙撃・疾拍子は動けば解ける
      if (i.angle != null) p.angle = i.angle;
      else if (moving) p.angle = Math.atan2(i.y, i.x);
      const B = balNow(p);
      {
        const tw = p.mods.find(m => m.k === "tailwind");
        if (tw && moving && Math.abs(angDiff(Math.atan2(i.y, i.x), tw.dir)) > Math.PI / 4) {
          p.mods = p.mods.filter(m => m.src !== "tailwindSpeed" && m.k !== "tailwind");   // 曲がると加速が落ちる
          emit(g, "wind_end", p.x, p.y, { team: p.team, life: 0.4 });
        }
      }

      if (acts.has("crouch")) p.crouch = !p.crouch;

      // 擬態
      if (acts.has("camo")) {
        if (p.camo) unhide(g, p);
        else {
          const z = zoneAt(p.x, p.y);
          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo && p.hp >= R.hp.minCamoHp && !(p.sk.channel) && !modHas(p, "noCamo")) {
            const petals = inZone("zone_petals", p.x, p.y, p.team);
            let enter = R.camoEnter * B.camoEnterMul - (hasPerk(p, "影", 4) ? 0.1 : 0) - (petals ? (petals.faster || 0.4) : 0);
            p.camo = 1; p.camoEnter = Math.max(0.2, enter); p.camoPattern = z;
            // 擬態開始痕（白蛇が拾う）
            g.camoMarks.push({ x: p.x, y: p.y, team: p.team, id: p.id, t: g.elapsed });
            if (g.camoMarks.length > 60) g.camoMarks.shift();
          }
        }
      }
      if (p.camo === 1) {
        if (moving || p.reveal > 0 || !zoneAt(p.x, p.y)) unhide(g, p, true);
        else {
          p.camoEnter -= dt;
          if (p.camoEnter <= 0) {
            p.camo = 2; p.camoEnter = 0; p.camoTime = (g.overtime ? R.camoOvertime : R.camoDuration) * B.camoDurMul + (hasPerk(p, "影", 4) ? 3 : 0);
            p.stats.hides++;
            emit(g, "hide", p.x, p.y, { team: p.team });
          }
        }
      }
      if (p.camo === 2) {
        p.camoTime -= dt; p.stats.hideTime += dt;
        if (p.camoTime <= 0 || !zoneAt(p.x, p.y) || p.reveal > 0 || dist(p, FLAG) < R.flagNoCamo) unhide(g, p);
      }

      // 移動
      let base = p.camo === 2 ? R.camoSpeed * B.camoSpeedMul : p.crouch ? R.crouchSpeed * p.bal.speedMul * (hasPerk(p, "影", 2) ? 1.1 : 1) : R.speed * p.bal.speedMul;
      if (p.camo === 2 && (modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影"))) base = R.speed * 0.7;
      const difMul = p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1;
      let speed = base * (p.slow > 0 ? p.bal.slowFactor : 1) * difMul * modMul(p, "speed");
      if (p.exposed > 0) speed = R.speed * p.bal.speedMul * p.bal.exposeMove * difMul;   // 露見：本人の速さの70%（逃走で±）
      if (p.sk.channel && p.sk.channel.speedMul != null) speed *= p.sk.channel.speedMul;
      if (DYN.some(o => o.kind === "zone_null" && o.owner === p.id && Math.hypot(p.x - o.x, p.y - o.y) <= o.r)) speed *= 0.7;   // 罪業：本人も遅くなる
      const nx = p.x + i.x * speed * dt, ny = p.y + i.y * speed * dt;
      if (!blocked(nx, p.y, R.bodyRadius, p.team)) p.x = nx;
      if (!blocked(p.x, ny, R.bodyRadius, p.team)) p.y = ny;
      p.speedNow = Math.hypot(p.x - p.px, p.y - p.py) / dt;
      if (p.camo === 2 && !zoneAt(p.x, p.y)) unhide(g, p);
      {
        const side = p.x < FLAG.x ? 0 : 1, enemySide = 1 - p.team;
        if (p.camo === 2 && !p.crossedCenter && p.lastSide === p.team && side === enemySide) { p.crossedCenter = true; addXp(g, p.team, R.hp.xp.cross, "cross"); }
        p.lastSide = side;
      }
      // 設置物との接触（狐火・棘道・矢印・影穴の入口）
      touchObjects(g, p);

      // 旗まわりの波紋
      const fd = dist(p, FLAG);
      if (fd < R.pulseRadius) { p.castleTime += dt; p.awayTime = 0; if (p.castleTime >= R.pulseTime && !p.pulse) { p.pulse = true; logEvent(g, "pulse", { id: p.id }); } }
      else { p.awayTime += dt; if (p.awayTime > R.pulseLeave) { p.castleTime = 0; p.pulse = false; } }

      // 見破り（0.25秒後に判定）
      if (acts.has("scan") && p.scanCd <= 0 && p.protect <= 0 && p.scanPending <= 0) {
        unhide(g, p);
        p.scanCd = (g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown) * B.scanCdMul;
        p.scanPending = R.scanDelay;
        emit(g, "scan_pre", p.x, p.y, { team: p.team, life: R.scanDelay });
      }
      if (p.scanPending > 0) {
        p.scanPending -= dt;
        if (p.scanPending <= 0) {
          p.scanPending = 0;
          emit(g, "scan", p.x, p.y, { team: p.team, angle: p.angle, owner: p.id });
          let hit = 0;
          const range = R.scanRange + B.scanRangeAdd + (hasPerk(p, "技", 3) ? 0.5 : 0);
          for (const q of g.players) {
            if (q.team === p.team || q.returning > 0 || q.protect > 0) continue;
            if (dist(p, q) > range || !lineClear(p.x, p.y, q.x, q.y)) continue;
            const da = angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.angle);
            if (Math.abs(da) <= R.scanAngle / 2) {
              const wasHidden = q.camo === 2;
              setReveal(q, R.revealDuration, true); unhide(g, q); hit++; p.stats.reveals++;
              emit(g, "found", q.x, q.y, { team: p.team, target: q.id });
              logEvent(g, "found", { by: p.id, id: q.id, team: p.team });
              const key = p.team + ":" + q.id;
              if (wasHidden && !(g.revealXp[key] > g.elapsed - 10)) { g.revealXp[key] = g.elapsed; addXp(g, p.team, R.hp.xp.reveal, "reveal"); }
            }
          }
          // 分身・描景・暗幕も見破りに反応する
          for (const o of g.objects) {
            if (o.team === p.team || o.dead) continue;
            if (o.kind === "zone_dark" && dist(p, o) <= range + o.r && (dist(p, o) <= o.r || Math.abs(angDiff(Math.atan2(o.y - p.y, o.x - p.x), p.angle)) <= R.scanAngle / 2)) { o.life = Math.max(0.05, o.life - 1); hit++; continue; }   // 漆黒：見破りで1秒短縮
            if ((o.kind === "decoy_static" || o.kind === "decoy_run" || o.kind === "paint_zone") && dist(p, o) <= range && lineClear(p.x, p.y, o.x, o.y) && Math.abs(angDiff(Math.atan2(o.y - p.y, o.x - p.x), p.angle)) <= R.scanAngle / 2) {
              if (o.kind === "paint_zone") o.life = Math.min(o.life, 2); else { o.dead = true; emit(g, "found", o.x, o.y, { team: p.team, decoy: true }); }
              hit++;
            }
          }
          if (!hit) emit(g, "miss", p.x, p.y, { team: p.team, owner: p.id });
        }
      }

      // 印投げ
      if (acts.has("shot") && p.shotCd <= 0 && p.protect <= 0 && !(p.sk.channel && p.sk.channel.noShot)) {
        unhide(g, p);
        p.shotCd = Math.max(0.6, (R.shotCooldown - (hasPerk(p, "技", 2) ? 0.15 : 0)) * modMul(p, "shotCd"));
        let ang = p.angle;
        if (p.aimJitter > 0) ang += (rng(g) - 0.5) * 0.8;
        // 無刀取り：正面2m以内で構えている敵がいれば無効化して止める
        const counter = g.players.find(q => q.team !== p.team && q.sk.channel && q.sk.channel.kind === "counter_stance" && dist(p, q) <= q.sk.channel.reach && Math.abs(angDiff(Math.atan2(p.y - q.y, p.x - q.x), q.angle)) <= 0.9);
        // 花隠れ：範囲内の味方が攻撃すると恩恵は即終了
        for (const o of g.objects) if (o.kind === "zone_petals" && o.team === p.team && !o.dead && dist(p, o) <= o.r) { o.dead = true; emit(g, "petals_end", o.x, o.y, { team: o.team, life: 0.5 }); }
        if (counter) { p.stunT = counter.sk.channel.stun; emit(g, "parry", p.x, p.y, { team: counter.team, life: 0.6 }); logEvent(g, "countered", { by: counter.id, id: p.id, team: counter.team }); }
        else {
          const poison = p.sk.poisonArmed > 0;   // 当たったときに消費する
          g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), travel: 0, angle: ang, poison, speed: R.shotSpeed, range: R.shotRange });
          emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 });
        }
      }
      // 固有技・奥義
      for (const a of acts) {
        if (a === "skill" || a.startsWith("skill:")) useSkill(g, p, a.startsWith("skill:") ? a.slice(6) : null);
        if (a === "ult") useUlt(g, p);
      }
      stepChannel(g, p, dt, acts);
      // 合図
      for (const a of acts) {
        if (a.startsWith("ping") && p.pingCd <= 0) {
          const kind = a.split(":")[1] || "here";
          const ping = D.PINGS.find(k => k.id === kind) || D.PINGS[0];
          p.pingCd = R.pingCooldown; p.stats.pings++;
          emit(g, "ping", p.x, p.y, { team: p.team, owner: p.id, text: ping.text, icon: ping.icon, kind: ping.id });
          logEvent(g, "ping", { id: p.id, team: p.team, kind: ping.id });
        }
      }
      if (acts.has("claim")) { p.stats.claims++; claims.push(p); }
    }

    // 印の弾道（連続衝突）
    const alive = [];
    for (const s of g.shots) {
      let sp = s.speed || R.shotSpeed;
      { const w = inZone("zone_water", s.x, s.y, 1 - s.team); if (w) sp *= 1 - (w.projSlow != null ? w.projSlow : 0.2); }   // 水鏡：敵の飛び道具が遅くなる
      const travel = sp * dt, n = Math.ceil(travel / 0.15);
      let dead = false;
      for (let j = 0; j < n && !dead; j++) {
        const ox = s.x, oy = s.y;
        s.x += s.dx * travel / n; s.y += s.dy * travel / n; s.travel += travel / n;
        if (SOLID[cellAt(s.x, s.y)] || s.travel > (s.range || R.shotRange) || (DYN.length && DYN.some(o => o.kind === "wall" && !o.pending && segsCross(ox, oy, s.x, s.y, o.ax, o.ay, o.bx, o.by)))) { dead = true; emit(g, "shot_end", s.x, s.y, { life: 0.3 }); break; }
        // 分身が印を吸収する
        const dc = g.objects.find(o => !o.dead && (o.kind === "decoy_run" || o.kind === "echo_clone" || o.kind === "decoy_static") && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + R.bodyRadius);
        if (dc) { dead = true; dc.dead = true; emit(g, "hit", dc.x, dc.y, { team: s.team, decoy: true }); break; }
        const sn = g.objects.find(o => !o.dead && o.kind === "snake" && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + 0.35);
        if (sn) { dead = true; sn.dead = true; emit(g, "shot_end", sn.x, sn.y, { life: 0.3 }); break; }   // 白蛇は印で消せる
        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && p.exposed <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);   // 露見中は的にならない
        if (q) {
          dead = true;
          if (q.invuln <= 0) applyHit(g, q, s);
        }
      }
      if (!dead) alive.push(s);
    }
    g.shots = alive;

    // 旗取得（このtickの候補を検証。帰還が先に処理されるので同tickの被弾者は無効）
    const valid = claims.filter(p => p.returning <= 0 && p.protect <= 0 && p.exposed <= 0 && p.camo === 0 && dist(p, FLAG) <= R.flagRadius && lineClear(p.x, p.y, FLAG.x, FLAG.y));
    if (valid.length) {
      g.phase = "finished"; g.flag = "claimed"; g.claimTick = g.tick;
      g.winner = [...new Set(valid.map(p => p.team))];
      g.claimants = valid.map(p => p.id);
      g.reason = g.winner.length > 1 ? "tie" : "flag";
      emit(g, "win", FLAG.x, FLAG.y, { team: g.winner.length > 1 ? -1 : g.winner[0] });
      logEvent(g, "end", { reason: g.reason, winner: g.winner });
      for (const p of g.players) p.emote = { type: g.winner.includes(p.team) ? "happy" : "surprised", t: 10 };
      return;
    }
    for (const p of claims) if (!valid.includes(p)) emit(g, "claim_fail", p.x, p.y, { life: 0.4, owner: p.id });

    if (!g.noTimer && g.time <= 0) {
      if (!g.overtime) {
        g.overtime = true; g.time = R.overtime;
        for (const p of g.players) { p.camoTime = Math.min(p.camoTime, R.camoOvertime); p.scanCd = Math.min(p.scanCd, R.scanOvertime); }
        emit(g, "overtime", FLAG.x, FLAG.y, { life: 3 });
        logEvent(g, "overtime");
      } else {
        g.phase = "finished"; g.reason = "timeout"; g.winner = []; g.claimants = [];
        logEvent(g, "end", { reason: "timeout", winner: [] });
      }
    }
  }

  // ---------- HP・露見・復帰 ----------
  function inSpawn(p) {
    const b = D.MAP.spawnBox;
    const x = p.team ? mirrorX(p.x) : p.x;
    return x >= b.x0 && x <= b.x1 + 1 && p.y >= b.y0 && p.y <= b.y1 + 1;
  }
  // 影Lv3 残り香断ちは「見破り・被弾による可視化」だけに効く（固有技の可視化には効かない）
  function setReveal(q, sec, perkable) { q.reveal = Math.max(q.reveal, sec - (perkable && hasPerk(q, "影", 3) ? 0.5 : 0)); }
  // 猫の目（白目＝索敵+1／黒目＝擬態+1・最大5）を含めた、いまの係数
  function balNow(p) {
    const cb = modHas(p, "eyeBlack") && p.bal.stats.camo < 5, sb = modHas(p, "eyeWhite") && p.bal.stats.scout < 5;
    if (!cb && !sb) return p.bal;
    const b = Object.assign({}, p.bal);
    if (cb) { b.camoDurMul += 0.10; b.camoEnterMul -= 0.08; b.camoSpeedMul += 0.10; }
    if (sb) { b.scanRangeAdd += 0.5; b.scanCdMul -= 0.06; }
    return b;
  }
  function modHas(p, k) { return p.mods.some(m => m.k === k); }
  function modMul(p, k) { let v = 1; for (const m of p.mods) if (m.k === k) v *= m.mul; return v; }
  function modAdd(p, k) { let v = 0; for (const m of p.mods) if (m.k === k) v += m.add; return v; }
  // 同じ固有技の重複効果は加算せず、長い残り時間だけを採用する（設計図「実装基準」）
  function addMod(p, k, t, extra) {
    const src = (extra && extra.src) || k;
    const ex = p.mods.find(m => m.src === src);
    if (ex) { if (t > ex.t) Object.assign(ex, extra || {}, { k, t, src }); return ex; }
    const m = Object.assign({ k, t, src }, extra || {}); p.mods.push(m); return m;
  }
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
    // 双龍円：前方から来た「最初の印」だけを落として構えを解く
    if (q.sk.channel && q.sk.channel.kind === "parry" && Math.abs(angDiff(Math.atan2(-s.dy, -s.dx), q.angle)) <= 1.05) { q.sk.channel = null; emit(g, "parry", q.x, q.y, { team: q.team, life: 0.6 }); return; }
    if (q.sk.kawarimi > 0 && !enemyNullAt(q)) {
      q.sk.kawarimi = 0; q.mods = q.mods.filter(m => m.k !== "kawarimiArm");
      const ix = q.input.x, iy = q.input.y, l = Math.hypot(ix, iy);
      const ang = l > 0.1 ? Math.atan2(iy, ix) : q.angle;
      emit(g, "kawarimi", q.x, q.y, { team: q.team, angle: ang, life: q.sk.smokeSec || 0.5 });
      for (let d = q.sk.blink || 3; d > 0.5; d -= 0.5) { const nx = q.x + Math.cos(ang) * d, ny = q.y + Math.sin(ang) * d; if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; q.px = nx; q.py = ny; break; } }
      q.invuln = R.hitInvuln; return;
    }
    const dmg = dmgOf(g, owner, q, s);
    let slow = true, revealSec = R.revealDuration;
    // 守り兎：8秒以内の最初の減速を無効化し、印の残り時間（＝被弾の可視化）を3秒減らす
    if (q.sk.shield > 0) { q.sk.shield = 0; slow = false; revealSec = Math.max(0, revealSec - (q.sk.shieldCut || 3)); q.mods = q.mods.filter(m => m.k !== "shield"); emit(g, "shield", q.x, q.y, { team: q.team, life: 0.6 }); }
    q.invuln = R.hitInvuln; if (revealSec > 0) setReveal(q, revealSec, true); if (slow) q.slow = R.slowDuration;
    unhide(g, q); q.stats.marked++; q.stats.taken += dmg; q.marks = 1; q.markTime = R.markDuration;
    if (owner) { owner.stats.hits++; owner.stats.damage += dmg; if (q.exposed <= 0) addXp(g, owner.team, R.hp.xp.hit, "hit"); }
    if (s.poison && owner && owner.sk.poisonArmed > 0) { owner.sk.poisonArmed = 0; addMod(q, "tracked", owner.sk.poisonDur || 6, { by: s.team }); }
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
    // HP0 +12：同じ敵の再露見からは20秒間0（露見のたびに時刻を更新）
    const last = g.lastExpose[q.id];
    g.lastExpose[q.id] = g.elapsed;
    if (by && !(last > g.elapsed - 20)) addXp(g, by.team, R.hp.xp.hp0, "hp0");
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
      for (const p of g.players) if (p.team === team) { if (p.pendingLevel) choosePerk(g, p, null); p.pendingLevel = L; p.pickT = R.hp.pickSec; const old = p.hpMax; p.hpMax = R.hp.byLevel[L - 1]; if (p.exposed <= 0) p.hp = Math.min(p.hpMax, p.hp + (p.hpMax - old)); }
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
  function enemyNullAt(p) { return DYN.some(o => o.kind === "zone_null" && o.team !== p.team && Math.hypot(p.x - o.x, p.y - o.y) <= o.r); }
  // 線状の設置物（残火・棘道）を壁で切る
  function clipRay(p, len) {
    let ex = p.x, ey = p.y;
    for (let d = 0.25; d <= len + 1e-6; d += 0.25) { const nx = p.x + Math.cos(p.angle) * d, ny = p.y + Math.sin(p.angle) * d; if (SOLID[cellAt(nx, ny)] || !pathClear(p.x, p.y, nx, ny)) break; ex = nx; ey = ny; }
    return { x: ex, y: ey };
  }
  // 影穴の出口：入口から最大 range 先（壁で止まる・柄の上を優先）
  function gateExitPoint(p, gate, range) {
    let best = null, bestZone = null;
    for (let d = 0.5; d <= range + 1e-6; d += 0.25) {
      const nx = gate.x + Math.cos(p.angle) * d, ny = gate.y + Math.sin(p.angle) * d;
      if (blocked(nx, ny, R.bodyRadius, p.team) || blocked(nx, ny, R.bodyRadius, 1 - p.team) || !pathClear(gate.x, gate.y, nx, ny)) break;
      best = { x: nx, y: ny }; if (zoneAt(nx, ny)) bestZone = best;
    }
    return bestZone || best;
  }
  function useSkill(g, p, opt) {
    const sk = p.bal.skill;
    if (!sk || p.exposed > 0 || p.returning > 0) return;
    // 影穴の2回目（出口を置く）はクールダウン中でも受け付ける（入口の6秒以内・入口のそばで）
    if (sk.kind === "shadow_gate") {
      const gate = g.objects.find(o => o.kind === "gate" && o.owner === p.id && !o.exit && !o.dead);
      if (gate) {
        const P0 = sk.params || {};
        if (dist(p, gate) > 1.5 || enemyNullAt(p)) return;
        const ex = gateExitPoint(p, gate, P0.range || 5); if (!ex) return;
        gate.exit = ex; gate.life = P0.followSec || 3; gate.enemyUsed = false;
        emit(g, "gate", p.x, p.y, { team: p.team, tx: ex.x, ty: ex.y, life: 0.8 });
        unhide(g, p); p.x = ex.x; p.y = ex.y; p.px = ex.x; p.py = ex.y;   // 一度だけ移動する
        return;
      }
    }
    if (p.skillCd > 0 || p.protect > 0 || p.sk.channel) return;
    if (enemyNullAt(p)) return;   // 罪業：中の敵は固有技を使えない（味方・本人は使える）
    const P = sk.params || {}, k = sk.kind;
    const fire = () => { p.skillCd = skillCdFor(g, p); p.stats.skills++; emit(g, "skill", p.x, p.y, { team: p.team, kind: k, owner: p.id, life: 0.8 }); logEvent(g, "skill", { id: p.id, team: p.team, kind: k, name: sk.name }); };
    const num = (v, d) => (typeof v === "number" ? v : d);
    switch (k) {
      case "trail_reveal": {
        const a = clipRay(p, num(P.len, 6));   // 壁越しには届かない
        const tr = addObj(g, { kind: "trail", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.life, 3), revealSec: num(P.revealSec, 1.5) });
        fireVsWater(g, tr, (w) => segDist(w.x, w.y, tr.ax, tr.ay, tr.bx, tr.by) <= w.r);   // 火遁で水鏡を2秒短縮・残火は水遁で消える
        fire(); break; }
      case "track_nearest": addObj(g, { kind: "track", team: p.team, owner: p.id, x: p.x, y: p.y, life: num(P.dur, 8), radius: num(P.radius, 9), delay: num(P.delay, 2), hist: [], next: 0 }); fire(); break;
      case "substitution": p.sk.kawarimi = num(P.armSec, 8); p.sk.blink = num(P.blink, 3); p.sk.smokeSec = num(P.smokeSec, 0.5); addMod(p, "kawarimiArm", num(P.armSec, 8)); fire(); break;
      case "zone_water": addObj(g, { kind: "zone_water", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 2.5), life: num(P.dur, 5), projSlow: num(P.projSlow, 0.2) }); fire(); break;
      case "wall": { const c = aheadPos(p, 1.5), len = num(P.len, 3), nx = -Math.sin(p.angle), ny = Math.cos(p.angle); addObj(g, { kind: "wall", team: p.team, owner: p.id, x: c.x, y: c.y, ax: c.x - nx * len / 2, ay: c.y - ny * len / 2, bx: c.x + nx * len / 2, by: c.y + ny * len / 2, life: num(P.dur, 4) + num(P.warnSec, 0.7), warn: num(P.warnSec, 0.7), pending: true }); fire(); break; }
      case "ally_shield": { const t = nearestAlly(g, p, num(P.range, 8)) || p; t.sk.shield = num(P.dur, 8); t.sk.shieldCut = num(P.markReduceSec, 3); addMod(t, "shield", num(P.dur, 8)); t.mods = t.mods.filter(m => m.k !== "tracked"); emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }   // 守り兎は追香も除く
      case "zone_fog": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_fog", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2), life: num(P.dur, 6), trailSec: num(P.trailSec, 2) }); fire(); break; }
      case "decoy_run": addObj(g, { kind: "decoy_run", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 6), speed: R.speed }); fire(); break;
      case "freeze_bomb": { const t = aheadPos(p, Math.min(num(P.range, 6), 6)); addObj(g, { kind: "freeze_bomb", team: p.team, owner: p.id, x: t.x, y: t.y, r: num(P.r, 2.5), life: num(P.delay, 0.8), stun: num(P.stun, 1.2) }); fire(); break; }
      case "dash": p.sk.channel = { kind: "dash", t: num(P.warnSec, 0.35), dist: num(P.dist, 5), revealSec: num(P.revealSec, 1), freeze: true, noShot: true }; fire(); break;
      case "bomb": { const t = aheadPos(p, Math.min(num(P.range, 5), 5)); addObj(g, { kind: "bomb", team: p.team, owner: p.id, x: t.x, y: t.y, r: num(P.r, 3), life: num(P.fuse, 2), push: num(P.push, 3) }); fire(); break; }
      case "poison_mark": p.sk.poisonArmed = num(P.armSec, 10); p.sk.poisonDur = num(P.dur, 6); fire(); break;
      case "berserk": { const d = num(P.dur, 8); addMod(p, "atk", d, { src: "berserkAtk", mul: (1 + 2 * 0.12) / (1 + (p.bal.stats.atk - 3) * 0.12) }); addMod(p, "def", d, { src: "berserkDef", mul: (1 - 2 * 0.08) / p.bal.takenMul }); addMod(p, "noCamo", d); addMod(p, "visible", d); addMod(p, "berserkTail", d, { onEnd: (gg, pp) => addMod(pp, "speed", num(P.afterSlowSec, 2), { src: "berserkSlow", mul: 0.9 }) }); unhide(g, p); fire(); break; }
      case "hawk_eye": p.sk.channel = { kind: "hawk_eye", t: num(P.channel, 3), radius: num(P.radius, 14), showSec: num(P.showSec, 2), cancelOnMove: true, noShot: true, cancelOnHit: true }; fire(); break;
      case "fox_fires": { for (let i = 0; i < num(P.count, 3); i++) { const a = p.angle + (i - 1) * 1.2; addObj(g, { kind: "fox_fire", team: p.team, owner: p.id, x: p.x + Math.cos(a) * 2, y: p.y + Math.sin(a) * 2, r: 0.6, life: num(P.dur, 5), revealSec: num(P.revealSec, 2) }); } fire(); break; }
      case "zone_dark": addObj(g, { kind: "zone_dark", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 3), life: num(P.dur, 4) }); fire(); break;
      case "zone_petals": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_petals", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2.5), life: num(P.dur, 5), faster: num(P.camoStartFaster, 0.4) }); fire(); break; }
      case "tailwind": addMod(p, "speed", num(P.dur, 4), { src: "tailwindSpeed", mul: 1 + num(P.speedBonus, 0.15) }); addMod(p, "tailwind", num(P.dur, 4), { dir: p.angle }); fire(); break;
      case "sacrifice": { if (p.hp >= p.hpMax) return; p.hp = Math.min(p.hpMax, p.hp + num(P.heal, 15)); addMod(p, "shotCd", num(P.dur, 4), { src: "sacrificeShot", mul: 0.6, onEnd: (gg, pp) => addMod(pp, "def", num(P.afterSec, 6), { src: "sacrificeDef", mul: (1 + 2 * 0.08) / pp.bal.takenMul }) }); fire(); break; }   // 「印を一つ消す」＝HP回復に読み替え（HPが満タンだと使えない）
      case "cleanse": { for (const q of g.players) if (q.team === p.team && q.returning <= 0 && dist(p, q) <= num(P.r, 4)) { q.mods = q.mods.filter(m => m.k !== "tracked" && m.k !== "fogTrail"); q.reveal = Math.max(0, q.reveal - num(P.revealCut, 2)); emit(g, "buff", q.x, q.y, { team: p.team, life: 0.8 }); } addObj(g, { kind: "halo", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 4), life: 1 }); fire(); break; }   // 追香・足跡を除き、印の残り時間（可視化）を2秒減らす
      case "decoy_static": addObj(g, { kind: "decoy_static", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, pattern: zoneAt(p.x, p.y) || "b", life: num(P.dur, 12) }); fire(); break;
      case "snake": addObj(g, { kind: "snake", team: p.team, owner: p.id, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 7), speed: num(P.speed, 3), radius: num(P.radius, 3), reported: false }); fire(); break;
      case "tempo": p.sk.channel = { kind: "tempo", t: num(P.channel, 5), r: num(P.r, 6), cdReduce: num(P.cdReduce, 2), cancelOnMove: true, noShot: true, cancelOnHit: true }; fire(); break;
      case "zone_null": { p.sk.channel = { kind: "zone_null_setup", t: num(P.setupSec, 1), r: num(P.r, 3), dur: num(P.dur, 5), speedMul: 0.5 }; fire(); break; }
      case "arrows": { for (let i = 0; i < num(P.count, 3); i++) { const a = aheadPos(p, 1 + i * 1.5); addObj(g, { kind: "arrow", team: p.team, owner: p.id, x: a.x, y: a.y, angle: p.angle, r: 0.7, life: num(P.dur, 10), silentSec: num(P.silentSec, 2) }); } fire(); break; }
      case "paint_zone": { const c = aheadPos(p, 2.5), pats = ["b", "s", "w"]; addObj(g, { kind: "paint_zone", team: p.team, owner: p.id, x: c.x, y: c.y, half: num(P.size, 4) / 2, pattern: pats[(rng(g) * 3) | 0], life: num(P.dur, 8) }); fire(); break; }
      case "leap": {
        // 着地点を決めて0.3秒予告（壁と罪業の境目を越えない）
        const d = num(P.dist, 4), inNull0 = DYN.some(o => o.kind === "zone_null" && Math.hypot(p.x - o.x, p.y - o.y) <= o.r);
        let tgt = null;
        for (let dd = 0.5; dd <= d + 1e-6; dd += 0.25) {
          const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd;
          if (blocked(nx, ny, R.bodyRadius, p.team) || !pathClear(p.x, p.y, nx, ny)) break;
          if (DYN.some(o => o.kind === "zone_null" && Math.hypot(nx - o.x, ny - o.y) <= o.r) !== inNull0) break;
          tgt = { x: nx, y: ny };
        }
        if (!tgt) return;
        p.sk.channel = { kind: "leap", t: num(P.warnSec, 0.3), tx: tgt.x, ty: tgt.y, jitterR: num(P.jitterR, 2), jitterSec: num(P.jitterSec, 0.6), freeze: true, noShot: true };
        emit(g, "leap_warn", tgt.x, tgt.y, { team: p.team, life: num(P.warnSec, 0.3) });
        unhide(g, p); fire(); break; }
      case "parry": p.sk.channel = { kind: "parry", t: num(P.dur, 2), speedMul: num(P.speedMul, 0.5), noCamo: true }; unhide(g, p); fire(); break;
      case "smash": p.sk.channel = { kind: "smash", t: num(P.windup, 0.9), reach: num(P.reach, 2.5), push: num(P.push, 3), missStun: num(P.missStun, 1), freeze: true, noShot: true }; fire(); break;
      case "echo_clone": addObj(g, { kind: "echo_clone", team: p.team, owner: p.id, char: p.char, x: p.x, y: p.y, angle: p.angle, life: num(P.dur, 3), delay: num(P.delay, 0.6), hist: [] }); fire(); break;
      case "thorns": { const a = aheadPos(p, num(P.len, 5)); addObj(g, { kind: "thorns", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.dur, 8), revealSec: num(P.revealSec, 3) }); fire(); break; }
      case "hex": {
        let best = null, bd = num(P.range, 8); for (const q of g.players) if (q.team !== p.team && q.exposed <= 0 && canSee(p, q) && dist(p, q) < bd) { bd = dist(p, q); best = q; } if (!best) return;
        const range = num(P.range, 8), delay = num(P.cdDelay, 4), casterId = p.id;
        // 4秒後にまだ術者の8m以内なら、固有技の回復を4秒遅らせる（離れれば不発）
        addMod(best, "hexed", num(P.dur, 4), { onEnd: (gg, pp) => { const by = gg.players.find(x => x.id === casterId); if (by && by.returning <= 0 && pp.returning <= 0 && dist(by, pp) <= range) { pp.skillCd += delay; emit(gg, "hex", pp.x, pp.y, { team: by.team, target: pp.id, life: 1 }); } } });
        emit(g, "hex", best.x, best.y, { team: p.team, target: best.id, life: 1 }); fire(); break; }
      case "cat_choice": { const white = opt === "white" || (opt == null && g.players.some(q => q.team !== p.team && canSee(p, q))); addMod(p, white ? "eyeWhite" : "eyeBlack", num(P.dur, 5)); fire(); break; }   // 係数は balNow() が読む
      case "snipe": p.sk.channel = { kind: "snipe", t: num(P.channel, 1.2), range: num(P.range, 14), speed: num(P.speed, 28), cancelOnMove: true, noShot: true, cancelOnHit: true }; unhide(g, p); fire(); break;
      case "soul_return": { const t = g.players.find(q => q.team === p.team && q !== p && q.returning > 0 && !q.soulBoosted); if (!t) return; t.returning = Math.max(0.1, t.returning - num(P.returnCut, 1.5)); t.protectBonus = num(P.protectAdd, 1); t.soulBoosted = true; emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }   // 帰還中の味方だけ・同じ帰還へ一度だけ
      case "thread": { const t = nearestAlly(g, p, num(P.range, 8)); if (!t) return; const d = num(P.dur, 8); addMod(p, "thread", d, { with: t.id, linkRange: num(P.linkRange, 6) }); addMod(t, "thread", d, { with: p.id, linkRange: num(P.linkRange, 6) }); fire(); break; }
      case "fox_dash": { const d = num(P.dur, 6); addMod(p, "camoFast", d); addMod(p, "foxdash", d); fire(); break; }   // 対処：布の揺れ（足音）が大きく、近距離（2.1m以内）では輪郭が見える
      case "counter_stance": p.sk.channel = { kind: "counter_stance", t: num(P.dur, 1.1), reach: num(P.reach, 2), stun: num(P.stun, 0.8), speedMul: 0.7, noShot: true }; unhide(g, p); fire(); break;   // 構えたまま下がれる
      case "shadow_gate": addObj(g, { kind: "gate", team: p.team, owner: p.id, x: p.x, y: p.y, r: 0.8, life: num(P.window, 6), exit: null }); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); fire(); break;
      default: fire();
    }
  }
  // 詠唱・構えの進行（毎tick）
  function stepChannel(g, p, dt, acts) {
    const c = p.sk.channel; if (!c) return;
    if (c.cancelOnHit && p.invuln > 0 && p.invuln > R.hitInvuln - dt * 1.5) { p.sk.channel = null; return; }
    if (c.kind === "hawk_eye" && p.speedNow > 0.3) { p.sk.channel = null; return; }
    c.t -= dt;
    if (c.t > 0) return;
    p.sk.channel = null;
    switch (c.kind) {
      case "dash": { let done = false; for (let dd = c.dist; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && pathClear(p.x, p.y, nx, ny)) { for (const q of g.players) if (q.team !== p.team && segDist(q.x, q.y, p.x, p.y, nx, ny) <= 0.8) { setReveal(q, c.revealSec); unhide(g, q); } emit(g, "dashline", p.x, p.y, { team: p.team, tx: nx, ty: ny, life: 0.5 }); p.x = nx; p.y = ny; p.px = nx; p.py = ny; done = true; } } unhide(g, p); break; }
      case "hawk_eye": { for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.speedNow > 0.3 && dist(p, q) <= c.radius) { q.lastSeen = { x: q.x, y: q.y, t: c.showSec, team: p.team }; emit(g, "spotted", q.x, q.y, { team: p.team, life: c.showSec }); } break; }
      case "tempo": { for (const q of g.players) if (q.team === p.team && q !== p && dist(p, q) <= c.r) q.skillCd = Math.max(0, q.skillCd - c.cdReduce); break; }
      case "zone_null_setup": { addObj(g, { kind: "zone_null", team: p.team, owner: p.id, x: p.x, y: p.y, r: c.r, life: c.dur }); break; }
      case "leap": {
        if (!blocked(c.tx, c.ty, R.bodyRadius, p.team) && pathClear(p.x, p.y, c.tx, c.ty)) {
          emit(g, "leap", p.x, p.y, { team: p.team, tx: c.tx, ty: c.ty, life: 0.5 });
          p.x = c.tx; p.y = c.ty; p.px = c.tx; p.py = c.ty;
          for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && dist(p, q) <= c.jitterR) q.aimJitter = c.jitterSec;   // 着地点から2mの敵の照準を乱す
        }
        break; }
      case "smash": {
        const a = aheadPos(p, c.reach / 2); let hit = 0;
        const push = (x, y) => { const ang = Math.atan2(y - p.y, x - p.x); return { dx: Math.cos(ang) * c.push, dy: Math.sin(ang) * c.push }; };
        const inFront = (x, y, extra) => Math.hypot(x - p.x, y - p.y) <= c.reach + extra && (Math.hypot(x - p.x, y - p.y) < 0.6 || Math.abs(angDiff(Math.atan2(y - p.y, x - p.x), p.angle)) <= Math.PI / 3) && pathClear(p.x, p.y, x, y);   // 前方2.5m・壁の向こうには届かない
        for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.exposed <= 0 && inFront(q.x, q.y, R.bodyRadius)) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); }
        // 設置物は3m押し出す（金剛壁は壊す）
        for (const o of g.objects) {
          if (o.dead || o.team === p.team && o.kind !== "wall") continue;
          if (!inFront(o.x, o.y, o.r || o.half || 0.5)) continue;
          hit++;
          if (o.kind === "wall") { o.dead = true; continue; }
          const v = push(o.x, o.y); o.x += v.dx; o.y += v.dy;
          if (o.ax != null) { o.ax += v.dx; o.ay += v.dy; o.bx += v.dx; o.by += v.dy; }
        }
        if (!hit) p.stunT = c.missStun;   // 外すと1秒停止
        emit(g, "smash", a.x, a.y, { team: p.team, life: 0.5 }); break; }
      case "snipe": { const ang = p.angle + (p.aimJitter > 0 ? (rng(g) - 0.5) * 0.8 : 0); g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), travel: 0, angle: ang, speed: c.speed, range: c.range, snipe: true }); emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 }); break; }   // 迅雷羽の照準乱れは狙撃にも効く
      default: break;
    }
  }
  // 設置物の進行
  // 火遁（残火・焙烙玉）が敵の水鏡に触れたら水鏡を2秒短縮し、残火は消える
  function fireVsWater(g, fireObj, touches) {
    for (const w of g.objects) {
      if (w.dead || w.kind !== "zone_water" || w.team === fireObj.team || !touches(w)) continue;
      w.life = Math.max(0.05, w.life - 2);
      if (fireObj.kind === "trail") { fireObj.dead = true; emit(g, "steam", w.x, w.y, { team: w.team, life: 0.6 }); }
    }
  }
  function burstBomb(g, o) {
    for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && q.exposed <= 0 && dist(o, q) <= o.r && lineClear(o.x, o.y, q.x, q.y)) {   // 遮蔽物の裏なら当たらない
      const ang = Math.atan2(q.y - o.y, q.x - o.x);
      for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && pathClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } }
      unhide(g, q); setReveal(q, 1);
    }
    // 範囲攻撃で分身は同時に消える
    for (const d of g.objects) if (!d.dead && d.team !== o.team && (d.kind === "echo_clone" || d.kind === "decoy_run" || d.kind === "decoy_static") && dist(o, d) <= o.r) d.dead = true;
    fireVsWater(g, o, (w) => dist(o, w) <= o.r + w.r);
    emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 });
  }
  function stepObjects(g, dt) {
    const EPS = 1e-6;
    for (const o of g.objects) {
      if (o.dead) continue;
      o.life -= dt; o.age = (o.age || 0) + dt;
      // 時限式は寿命が尽きた tick に必ず発動する（浮動小数の誤差で取りこぼさない）
      if (o.kind === "freeze_bomb" && o.life <= EPS) { for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && q.exposed <= 0 && dist(o, q) <= o.r) q.stunT = Math.max(q.stunT, o.stun); emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 }); o.dead = true; continue; }
      if (o.kind === "bomb" && o.life <= EPS) { burstBomb(g, o); o.dead = true; continue; }
      if (o.life <= EPS) { o.dead = true; continue; }
      if (o.kind === "wall" && o.pending && o.age >= o.warn - EPS) {
        o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 });
        const L = Math.hypot(o.bx - o.ax, o.by - o.ay) || 1, ux = -(o.by - o.ay) / L, uy = (o.bx - o.ax) / L;
        for (const q of g.players) {
          if (q.returning > 0) continue;
          const d = segDist(q.x, q.y, o.ax, o.ay, o.bx, o.by); if (d >= R.bodyRadius + 0.26) continue;
          const side = ((q.x - o.ax) * ux + (q.y - o.ay) * uy) >= 0 ? 1 : -1;
          let moved = false;
          for (const sd of [side, -side]) { for (let k = 0; k < 10 && !moved; k++) { const need = R.bodyRadius + 0.3 - (sd === side ? d : -d) + k * 0.1; const tx = q.x + ux * sd * need, ty = q.y + uy * sd * need; if (!blocked(tx, ty, R.bodyRadius, q.team)) { q.x = tx; q.y = ty; q.px = tx; q.py = ty; moved = true; } } if (moved) break; }
        }
      }
      // 水遁：敵の残火は即座に消え、敵の狐火を一つ消す
      if (o.kind === "zone_water") {
        for (const t of g.objects) if (!t.dead && t.kind === "trail" && t.team !== o.team && segDist(o.x, o.y, t.ax, t.ay, t.bx, t.by) <= o.r) { t.dead = true; emit(g, "steam", t.x, t.y, { team: o.team, life: 0.6 }); }
        if (!o.foxDone) { const f = g.objects.find(t => !t.dead && t.kind === "fox_fire" && t.team !== o.team && dist(o, t) <= o.r + t.r); if (f) { f.dead = true; o.foxDone = true; emit(g, "steam", f.x, f.y, { team: o.team, life: 0.6 }); } }
      }
      if (o.kind === "decoy_run") { const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, R.bodyRadius, o.team)) { o.x = nx; o.y = ny; } else o.dead = true; }
      if (o.kind === "snake") {
        const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, 0.2, o.team)) { o.x = nx; o.y = ny; } else { o.angle += Math.PI / 2; }
        // 3m以内の擬態開始痕を一度だけ知らせる（現在位置ではなく開始地点）
        if (!o.reported) { const mk = g.camoMarks.find(m => m.team !== o.team && g.elapsed - m.t <= 20 && Math.hypot(m.x - o.x, m.y - o.y) <= o.radius); if (mk) { o.reported = true; emit(g, "spotted", mk.x, mk.y, { team: o.team, life: 2, mark: true }); } }
      }
      if (o.kind === "echo_clone") { const own = g.players.find(p => p.id === o.owner); if (own) { o.hist.push({ x: own.x, y: own.y, a: own.angle, t: g.elapsed }); const past = o.hist.find(h => g.elapsed - h.t <= o.delay); if (past) { o.x = past.x; o.y = past.y; o.angle = past.a; } } }
      if (o.kind === "track") {
        const own = g.players.find(p => p.id === o.owner);
        if (own) { o.x = own.x; o.y = own.y; }   // 白狐は術者について回る
        o.next -= dt;
        if (o.next <= 0 && own) {
          o.next = 0.5;
          let best = null, bd = o.radius; for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && !(q.camo === 2 && q.speedNow < 0.1) && dist(own, q) < bd) { bd = dist(own, q); best = q; }
          o.hist.push({ x: best ? best.x : null, y: best ? best.y : null, t: g.elapsed });
          // 足跡は「2秒前」の情報：delay 以上前のうち一番新しいもの
          let past = null; for (let j = o.hist.length - 1; j >= 0; j--) if (g.elapsed - o.hist[j].t >= o.delay - 1e-6) { past = o.hist[j]; break; }
          o.mark = past && past.x != null ? { x: past.x, y: past.y } : null;
          while (o.hist.length && g.elapsed - o.hist[0].t > o.delay + 1) o.hist.shift();
        }
      }
      if (o.kind === "gate" && o.exit && o.life <= EPS) o.dead = true;
    }
    if (g.objects.some(o => o.dead)) g.objects = g.objects.filter(o => !o.dead);
    if (g.camoMarks.length && g.elapsed - g.camoMarks[0].t > 30) g.camoMarks = g.camoMarks.filter(m => g.elapsed - m.t <= 30);
    // 結び糸：互いが6m以内なら被発見時間を20%短縮／6mを超えると切れる
    for (const p of g.players) {
      const m = p.mods.find(x => x.k === "thread"); if (!m) continue;
      const q = g.players.find(x => x.id === m.with);
      if (!q || q.returning > 0 || p.returning > 0 || dist(p, q) > m.linkRange) { p.mods = p.mods.filter(x => x.k !== "thread"); if (q) q.mods = q.mods.filter(x => !(x.k === "thread" && x.with === p.id)); continue; }
      if (p.reveal > 0) p.reveal = Math.max(0, p.reveal - dt * 0.25);
    }
  }
  // 設置物との接触
  function touchObjects(g, p) {
    for (const o of g.objects) {
      if (o.dead) continue;
      if (o.kind === "fox_fire" && o.team !== p.team && dist(p, o) <= o.r + R.bodyRadius) { setReveal(p, o.revealSec); unhide(g, p); o.dead = true; emit(g, "found", p.x, p.y, { team: o.team, target: p.id }); }
      if (o.kind === "thorns" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= (p.crouch ? 0.2 : 0.4) && !(o.last === p.id && g.elapsed - o.lastT < 3)) { o.last = p.id; o.lastT = g.elapsed; addMod(p, "fogTrail", o.revealSec, { src: "thornsTrail" }); emit(g, "footprint", p.x, p.y, { team: o.team, life: o.revealSec }); }
      if (o.kind === "trail" && o.team !== p.team && segDist(p.x, p.y, o.ax, o.ay, o.bx, o.by) <= 0.5 && !(o.last === p.id && g.elapsed - o.lastT < 1.5)) { o.last = p.id; o.lastT = g.elapsed; setReveal(p, o.revealSec); unhide(g, p); }
      if (o.kind === "arrow" && o.team === p.team && dist(p, o) <= o.r) p.silentT = Math.max(p.silentT, o.silentSec);
      if (o.kind === "zone_fog" && o.team !== p.team) {
        o.inside = o.inside || {};
        const inside = dist(p, o) <= o.r;
        if (o.inside[p.id] && !inside) addMod(p, "fogTrail", o.trailSec);   // 外へ出た後も足跡が2秒残る
        o.inside[p.id] = inside;
      }
      if ((o.kind === "zone_fog" || o.kind === "zone_petals") && o.team !== p.team && !o.windHit && modHas(p, "tailwind") && dist(p, o) <= o.r + 1) {
        o.windHit = true; o.life = o.life / 2;   // 風遁で半分の時間に短縮・押し流す
        o.x += Math.cos(p.angle) * 1.5; o.y += Math.sin(p.angle) * 1.5;
        emit(g, "wind", o.x, o.y, { team: p.team, life: 0.5 });
      }
      if (o.kind === "gate" && o.exit && o.team !== p.team && !o.enemyUsed && dist(p, o) <= o.r && !blocked(o.exit.x, o.exit.y, R.bodyRadius, p.team)) { o.enemyUsed = true; p.x = o.exit.x; p.y = o.exit.y; p.px = p.x; p.py = p.y; emit(g, "gate", p.x, p.y, { team: o.team, life: 0.6 }); }   // 敵も一度だけ追って入れる
    }
  }

  // ネット対戦：受け取った入力を反映（連番の重複・古い入力は捨てる。行動は次のtickまで溜める）
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
    const acts = Array.isArray(m.actions) ? m.actions.filter(ACT_OK).slice(0, 8) : [];
    for (const a of acts) if (!p.input.actions.includes(a)) p.input.actions.push(a);
  }
  // ネット対戦：観戦者ごとに見える情報だけを抜き出す（壁の向こうの敵は送らない・擬態中の敵は布の位置だけ）
  // 敵にも見えてよい強化（設計図の「対処」で見えると書かれているもの）
  const PUBLIC_MODS = { visible: 1, tracked: 1, hexed: 1, shield: 1, tailwind: 1, eyeWhite: 1, eyeBlack: 1, thread: 1, foxdash: 1 };
  function pubPlayer(p, full, g, enemy) {
    const o = { id: p.id, team: p.team, char: p.char, name: p.name, bot: p.bot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: +p.angle.toFixed(2),
      crouch: p.crouch, camo: p.camo, camoEnter: p.camoEnter, camoPattern: p.camoPattern, reveal: p.reveal, marks: p.marks, protect: p.protect, returning: p.returning,
      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false, role: p.role,
      hp: p.hp, hpMax: p.hpMax, exposed: +p.exposed.toFixed(1), healT: +p.healT.toFixed(2), stunT: p.stunT, channel: p.sk.channel ? p.sk.channel.kind : null, modKeys: [...new Set(p.mods.map(m => m.k))].filter(k => !enemy || PUBLIC_MODS[k]), ultActive: p.ult.active };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, slow: p.slow, stats: p.stats,
      skillCd: p.skillCd, skillCdMax: skillCdFor(g, p), perks: p.perks, pendingLevel: p.pendingLevel, pickT: p.pickT, ult: p.ult, kawarimi: p.sk.kawarimi || 0, poisonArmed: p.sk.poisonArmed || 0, shield: p.sk.shield || 0 });
    return o;
  }
  function snapshot(g, viewerId) {
    bindDyn(g);
    const v = g.players.find(p => p.id === viewerId);
    const players = [], sounds = [];
    for (const p of g.players) {
      if (!v || p.team === v.team) { players.push(pubPlayer(p, p === v, g)); continue; }
      const view = enemyView(v, p);
      if (view === "none") {
        const tk = trackDirFor(v, p);
        if (p.pulse && p.returning <= 0) players.push({ id: p.id, team: p.team, x: +p.x.toFixed(1), y: +p.y.toFixed(1), pulse: true, pulseOnly: true, lastSeen: p.lastSeen, trackDir: tk });
        else if (p.lastSeen || tk != null) players.push({ id: p.id, team: p.team, char: p.char, ghost: true, lastSeen: p.lastSeen, trackDir: tk });
        if (audible(v, p)) sounds.push({ a: +Math.atan2(p.y - v.y, p.x - v.x).toFixed(2), d: +dist(v, p).toFixed(1) });
        continue;
      }
      if (view === "cloth") players.push({ id: p.id, team: p.team, char: p.char, name: "", x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: 0, camo: 2, camoPattern: p.camoPattern, speedNow: +p.speedNow.toFixed(2), cloth: true, reveal: 0, marks: 0, protect: 0, returning: 0, crouch: false });
      else { const o = pubPlayer(p, false, g, true); o.lastSeen = p.lastSeen; players.push(o); }
    }
    const shots = g.shots.filter(s => !v || s.team === v.team || (dist(v, s) < 22 && lineClear(v.x, v.y, s.x, s.y))).map(s => ({ id: s.id, team: s.team, x: +s.x.toFixed(2), y: +s.y.toFixed(2), angle: +s.angle.toFixed(2) }));
    const objects = g.objects.filter(o => !o.dead && objVisible(g, v, o)).map(o => pubObject(o, v));
    return { phase: g.phase, timer: +g.timer.toFixed(2), time: +g.time.toFixed(2), elapsed: +g.elapsed.toFixed(2), tick: g.tick, overtime: g.overtime, winner: g.winner, claimants: g.claimants, reason: g.reason, players, shots, sounds, objects, xp: g.xp, level: g.level };
  }
  function objVisible(g, v, o) {
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
  const PUBLIC_LOG = { start: 1, end: 1, overtime: 1, levelup: 1, pulse: 1, botTakeover: 1, "return": 1 };
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
  // 効果は観戦者に関係あるものだけ（合図は味方のみ）
  function effectVisible(g, viewerId, e) {
    bindDyn(g);
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

  // 追香：追跡側のチームには、見えない相手の「移動方向」だけを渡す（位置は渡さない）
  function trackDirFor(viewer, q) {
    const m = q.mods.find(x => x.k === "tracked" && x.by === viewer.team);
    if (!m || q.returning > 0) return null;
    const vx = q.x - q.px, vy = q.y - q.py;
    return +(Math.hypot(vx, vy) > 1e-4 ? Math.atan2(vy, vx) : q.angle).toFixed(2);
  }
  // 観戦側（人間）の可視情報：敵をどう描くか
  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.exposed > 0 && dist(viewer, q) <= R.viewRange && lineClear(viewer.x, viewer.y, q.x, q.y)) return "revealed";
    if (q.reveal > 0) return "revealed";
    if (canSee(viewer, q)) return "seen";
    if (clothVisible(viewer, q)) return "cloth";
    return "none";
  }

  return { R, D, W, H, TICK, FLAG, grid, SOLID, cellAt, solidCell, blocked, lineClear, zoneAt, dist, angDiff, mirrorX,
    field, steer, createMatch, resetForRematch, makePlayer, setInput, netInput, snapshot, effectVisible, freshAi, assignAi, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor,
    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, balNow, skillCdFor, inZone, trackDirFor, bindDyn, logVisible, pathClear, get objects() { return DYN; } };
})();
if (typeof module !== "undefined") module.exports = Sim;
