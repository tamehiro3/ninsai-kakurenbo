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
  function blocked(x, y, r, team) {
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
    return !SOLID[cellAt(bx, by)];
  }
  function zoneAt(x, y) {
    const c = cellAt(x, y);
    return (c === "b" || c === "s" || c === "w") ? c : null;
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
      scanCd: 0, scanPending: 0, shotCd: 0, pingCd: 0,
      castleTime: 0, awayTime: 0, pulse: false,
      lastSeen: null,           // 味方が共有する「最後に見た場所」{x,y,t}
      input: { x: 0, y: 0, actions: [], angle: null }, connected: true, netSeq: 0,
      stats: { hides: 0, hideTime: 0, reveals: 0, hits: 0, pings: 0, returns: 0, claims: 0, marked: 0 },
      // Bot用
      ai: { think: 0, wp: 0, phase: "route", suspect: null, seen: 0, goAt: 0, lastPing: -99, lastPingKind: "", waitT: 0, scanned: false, post: null, postT: 0, patience: 40, lastContact: -99, minClaim: 30, stepOut: false, hz: "attack", hzT: 0, quietT: 0, shotAt: -99 },
      controller: null,         // 練習用の台本Bot
      emote: null,              // {type, t}
    };
  }

  function createMatch(opts) {
    const g = {
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
    p.ai.minClaim = dif.aggro ? 18 + rng(g) * 15 : 35 + rng(g) * 30;
    p.ai.routeOverride = null;
    if (dif.aggro && p.bot && rng(g) < 0.5) {
      const routes = Object.keys(D.MAP.routes);
      p.ai.routeOverride = routes[(rng(g) * routes.length) | 0];
    }
  }
  function resetForRematch(g, swapTeams) {
    const players = g.players.map(p => makePlayer(p.id, swapTeams ? 1 - p.team : p.team, p.char, { slot: p.slot, name: p.name, bot: p.bot, role: p.role }));
    Object.assign(g, { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false,
      shots: [], effects: [], log: [], winner: [], claimants: [], reason: "", claimTick: -1, flag: "available" });
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
  const ACTIONS = ["camo", "scan", "shot", "claim", "ping", "crouch"];
  function setInput(p, i) {
    if (!i || typeof i !== "object") return;
    const n = v => Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    let x = n(i.x), y = n(i.y);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    p.input = {
      x, y,
      actions: Array.isArray(i.actions) ? i.actions.filter(a => ACTIONS.includes(a) || (typeof a === "string" && a.startsWith("ping:"))).slice(0, 6) : [],
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
    p.ai.wp = 0; p.ai.phase = "route"; p.ai.retreat = 0;
    p.stats.returns++;
    logEvent(g, "return", { id: p.id, team: p.team });
  }

  // 可視判定（同じ関数を人間の描画とBotの両方が使う）
  function canSee(p, q) {
    if (q.returning > 0) return false;
    const d = dist(p, q);
    if (d > R.viewRange) return false;
    if (!lineClear(p.x, p.y, q.x, q.y)) return false;
    if (q.camo === 2 && q.reveal <= 0 && d >= R.closeSee) return false;
    return true;
  }
  // 布だけが見える（擬態中・射線あり）
  function clothVisible(p, q) {
    return q.camo === 2 && q.returning <= 0 && dist(p, q) <= R.viewRange && lineClear(p.x, p.y, q.x, q.y);
  }
  // 足音が聞こえるか（壁があれば半減）
  function audible(listener, src) {
    if (src.returning > 0 || src.speedNow < 0.1) return false;
    let r = src.camo === 2 ? R.footCamo : src.crouch ? R.footCrouch : R.footRun;
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
  function botThink(g, p) {
    const ai = p.ai, dif = g.difficulty;
    ai.think -= TICK;
    if (ai.think > 0) { p.input.actions = []; return; }
    const interval = 0.15 + rng(g) * 0.12;
    ai.think = interval;
    const actions = [];
    const enemies = g.players.filter(q => q.team !== p.team);
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
    const intruder = enemies.filter(q => q.returning <= 0 && dist(q, FLAG) < alertR && (botSees(p, q) || q.reveal > 0) && (approaching(q) || dist(q, FLAG) < flagD - 0.3)).sort((a, b) => dist(a, FLAG) - dist(b, FLAG))[0] || null;
    const contest = !!intruder && flagD <= dist(intruder, FLAG) + 2.5;
    const quiet2 = ai.lastContact + 2 < g.elapsed && !ai.suspect && !enemies.some(q => q.returning <= 0 && dist(q, FLAG) < 12 && audible(p, q));
    const opportunity = quiet2 && g.elapsed > ai.minClaim;

    // ---- 旗を掴めるなら最優先 ----
    if (flagD <= R.flagRadius && p.camo === 0 && p.protect <= 0) { setInput(p, { x: 0, y: 0, actions: ["claim"] }); return; }
    // ---- 布を広げている最中は動かない ----
    if (p.camo === 1) { setInput(p, { x: 0, y: 0, actions: [] }); return; }

    // ---- 擬態中：とどまるか出るか ----
    if (p.camo === 2) {
      const threat = enemies.some(q => q.returning <= 0 && dist(p, q) < 11 && (lineClear(p.x, p.y, q.x, q.y) || audible(p, q)));
      const tooClose = enemies.some(q => q.returning <= 0 && dist(p, q) < 1.6);
      if (threat && !tooClose) ai.waitT = 0; else ai.waitT += interval;
      let leave = p.camoTime < 1.0 || tooClose || late;
      let go = late;
      if (ai.phase === "wait") {
        const minT = dif.aggro ? 12 : 30;
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
      const minT = dif.aggro ? 12 : 30;
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
  function step(g) {
    const dt = TICK;
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

    // 処理順で後のチームが有利にならないよう、tickごとに順番を反転する
    const order = g.tick % 2 ? g.players.slice().reverse() : g.players;
    for (const p of order) {
      for (const k of ["protect", "markTime", "invuln", "reveal", "slow", "camoCd", "scanCd", "shotCd", "pingCd"]) p[k] = Math.max(0, p[k] - dt);
      if (p.markTime <= 0) p.marks = 0;
      if (p.lastSeen) { p.lastSeen.t -= dt; if (p.lastSeen.t <= 0) p.lastSeen = null; }
      if (p.reveal > 0) p.lastSeen = { x: p.x, y: p.y, t: R.lastSeen + 0.001 };
      if (p.returning > 0) {
        p.returning = Math.max(0, p.returning - dt);
        if (p.returning <= 0) p.protect = R.protect;
        p.input.actions = []; p.speedNow = 0;
        continue;
      }
      if (p.bot) { if (p.controller) p.controller(g, p, dt); else botThink(g, p); }
      else if (p.connected === false) { p.input = { x: 0, y: 0, actions: [], angle: null }; if (p.camo) unhide(g, p); }

      const i = p.input;
      const acts = new Set(i.actions);
      i.actions = [];
      const moving = Math.hypot(i.x, i.y) > 0.1;
      if (i.angle != null) p.angle = i.angle;
      else if (moving) p.angle = Math.atan2(i.y, i.x);

      if (acts.has("crouch")) p.crouch = !p.crouch;

      // 擬態
      if (acts.has("camo")) {
        if (p.camo) unhide(g, p);
        else {
          const z = zoneAt(p.x, p.y);
          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo) {
            p.camo = 1; p.camoEnter = R.camoEnter; p.camoPattern = z;
          }
        }
      }
      if (p.camo === 1) {
        if (moving || p.reveal > 0 || !zoneAt(p.x, p.y)) unhide(g, p, true);
        else {
          p.camoEnter -= dt;
          if (p.camoEnter <= 0) {
            p.camo = 2; p.camoEnter = 0; p.camoTime = g.overtime ? R.camoOvertime : R.camoDuration;
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
      const base = p.camo === 2 ? R.camoSpeed : p.crouch ? R.crouchSpeed : R.speed;
      const speed = base * (p.slow > 0 ? R.slowFactor : 1) * (p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1);
      const nx = p.x + i.x * speed * dt, ny = p.y + i.y * speed * dt;
      if (!blocked(nx, p.y, R.bodyRadius, p.team)) p.x = nx;
      if (!blocked(p.x, ny, R.bodyRadius, p.team)) p.y = ny;
      p.speedNow = Math.hypot(p.x - p.px, p.y - p.py) / dt;
      if (p.camo === 2 && !zoneAt(p.x, p.y)) unhide(g, p);

      // 旗まわりの波紋
      const fd = dist(p, FLAG);
      if (fd < R.pulseRadius) { p.castleTime += dt; p.awayTime = 0; if (p.castleTime >= R.pulseTime && !p.pulse) { p.pulse = true; logEvent(g, "pulse", { id: p.id }); } }
      else { p.awayTime += dt; if (p.awayTime > R.pulseLeave) { p.castleTime = 0; p.pulse = false; } }

      // 見破り（0.25秒後に判定）
      if (acts.has("scan") && p.scanCd <= 0 && p.protect <= 0 && p.scanPending <= 0) {
        unhide(g, p);
        p.scanCd = g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown;
        p.scanPending = R.scanDelay;
        emit(g, "scan_pre", p.x, p.y, { team: p.team, life: R.scanDelay });
      }
      if (p.scanPending > 0) {
        p.scanPending -= dt;
        if (p.scanPending <= 0) {
          p.scanPending = 0;
          emit(g, "scan", p.x, p.y, { team: p.team, angle: p.angle, owner: p.id });
          let hit = 0;
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
          if (!hit) emit(g, "miss", p.x, p.y, { team: p.team, owner: p.id });
        }
      }

      // 印投げ
      if (acts.has("shot") && p.shotCd <= 0 && p.protect <= 0) {
        unhide(g, p);
        p.shotCd = R.shotCooldown;
        g.shots.push({ id: ++g.serial, owner: p.id, team: p.team, x: p.x, y: p.y, dx: Math.cos(p.angle), dy: Math.sin(p.angle), travel: 0, angle: p.angle });
        emit(g, "throw", p.x, p.y, { team: p.team, life: 0.3 });
      }
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
      const travel = R.shotSpeed * dt, n = Math.ceil(travel / 0.15);
      let dead = false;
      for (let j = 0; j < n && !dead; j++) {
        s.x += s.dx * travel / n; s.y += s.dy * travel / n; s.travel += travel / n;
        if (SOLID[cellAt(s.x, s.y)] || s.travel > R.shotRange) { dead = true; emit(g, "shot_end", s.x, s.y, { life: 0.3 }); break; }
        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);
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
        }
      }
      if (!dead) alive.push(s);
    }
    g.shots = alive;

    // 旗取得（このtickの候補を検証。帰還が先に処理されるので同tickの被弾者は無効）
    const valid = claims.filter(p => p.returning <= 0 && p.protect <= 0 && p.camo === 0 && dist(p, FLAG) <= R.flagRadius && lineClear(p.x, p.y, FLAG.x, FLAG.y));
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
    const acts = Array.isArray(m.actions) ? m.actions.filter(a => ACTIONS.includes(a) || (typeof a === "string" && a.startsWith("ping:"))).slice(0, 6) : [];
    for (const a of acts) if (!p.input.actions.includes(a)) p.input.actions.push(a);
  }
  // ネット対戦：観戦者ごとに見える情報だけを抜き出す（壁の向こうの敵は送らない・擬態中の敵は布の位置だけ）
  function pubPlayer(p, full) {
    const o = { id: p.id, team: p.team, char: p.char, name: p.name, bot: p.bot, x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: +p.angle.toFixed(2),
      crouch: p.crouch, camo: p.camo, camoEnter: p.camoEnter, camoPattern: p.camoPattern, reveal: p.reveal, marks: p.marks, protect: p.protect, returning: p.returning,
      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false, role: p.role };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, slow: p.slow, stats: p.stats });
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
  function enemyView(viewer, q) {
    if (q.returning > 0) return "none";
    if (q.reveal > 0) return "revealed";
    if (canSee(viewer, q)) return "seen";
    if (clothVisible(viewer, q)) return "cloth";
    return "none";
  }

  return { R, D, W, H, TICK, FLAG, grid, SOLID, cellAt, solidCell, blocked, lineClear, zoneAt, dist, angDiff, mirrorX,
    field, steer, createMatch, resetForRematch, makePlayer, setInput, netInput, snapshot, effectVisible, freshAi, assignAi, step, canSee, clothVisible, audible, enemyView, emit, logEvent, returnHome, rng, spawnPos, routeFor };
})();
if (typeof module !== "undefined") module.exports = Sim;
