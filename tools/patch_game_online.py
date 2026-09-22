# -*- coding: utf-8 -*-
"""game.js / index.html / style.css / render.js / sw.js にオンライン対戦（合言葉の部屋）を組み込む（1回だけ実行）"""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
def wr(p, s): open(os.path.join(ROOT, p), "w", encoding="utf-8").write(s)
def rep(s, old, new):
    assert old in s, ("NOT FOUND: " + old[:80]); return s.replace(old, new, 1)

# ================= render.js =================
s = rd("render.js")
if "p.ghost || p.pulseOnly" not in s:
    s = rep(s, '''    for (const p of g.players) {
      if (p.returning > 0) continue;
      let view = "seen";''', '''    for (const p of g.players) {
      if (p.returning > 0 || p.ghost || p.pulseOnly) continue;
      let view = "seen";''')
    s = rep(s, '''    for (const p of g.players) {
      if (!p.pulse || p.returning > 0) continue;''', '''    for (const p of g.players) {
      if (!p.pulse || p.returning > 0 || p.ghost) continue;''')
    s = rep(s, '''  function drawFootMarks(g, viewer) {
    if (!opts.footMarks) return;
    for (const q of g.players) {''', '''  function drawFootMarks(g, viewer) {
    if (!opts.footMarks) return;
    if (g.sounds) {   // オンライン：サーバーが判定した「聞こえる足音」の方向だけ
      for (const snd of g.sounds) {
        const rr = ppm * 1.7, cx = sx(viewer.x), cy = sy(viewer.y) - ppm * 0.6;
        ctx.save(); ctx.globalAlpha = Math.max(0.35, 1 - snd.d / 9); ctx.strokeStyle = "#f2e6c4"; ctx.lineWidth = 2.5;
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, rr + i * ppm * 0.25, snd.a - 0.35, snd.a + 0.35); ctx.stroke(); }
        ctx.restore();
      }
      return;
    }
    for (const q of g.players) {
      if (q.ghost || q.pulseOnly) continue;''')
    # 味方の帰還表示など、pubにない項目でも落ちないように
    s = rep(s, '''      if (p.team !== viewer.team) { view = Sim.enemyView(viewer, p); if (view === "none") continue; }''',
               '''      if (p.team !== viewer.team) { view = p.cloth ? "cloth" : Sim.enemyView(viewer, p); if (view === "none") continue; }''')
    wr("render.js", s)

# ================= sim.js：味方チップ用に role を常に送る =================
s = rd("sim.js")
s = s.replace('''      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, stats: p.stats, role: p.role });''',
'''      speedNow: +p.speedNow.toFixed(2), pulse: p.pulse, emote: p.emote, connected: p.connected !== false, role: p.role };
    if (full) Object.assign(o, { camoTime: p.camoTime, camoCd: p.camoCd, scanCd: p.scanCd, shotCd: p.shotCd, pingCd: p.pingCd, castleTime: p.castleTime, slow: p.slow, stats: p.stats });''')
wr("sim.js", s)

# ================= game.js =================
s = rd("game.js")
if "startOnlineLoop" in s:
    print("game.js already patched")
else:
    # 入力：オンラインはサーバーへ送る
    s = rep(s, '''    input.aimOnce = null;
    S.setInput(me, { x, y, actions: acts, angle });
  }''', '''    input.aimOnce = null;
    if (mode === "online") { onlineInput(x, y, acts, angle); return; }
    S.setInput(me, { x, y, actions: acts, angle });
  }''')
    # ポーズ：オンラインは止められない（メニューだけ）
    s = rep(s, '''  function togglePause() {
    if (!g || current !== "game" || g.phase === "finished") return;
    paused = !paused;
    $("#pause").classList.toggle("on", paused);
    if (!paused) { lastT = performance.now(); }
  }''', '''  function togglePause() {
    if (!g || current !== "game" || g.phase === "finished") return;
    if (mode === "online") { $("#pause").classList.toggle("on"); document.body.classList.add("online-pause"); return; }
    paused = !paused;
    $("#pause").classList.toggle("on", paused);
    if (!paused) { lastT = performance.now(); }
  }''')
    s = rep(s, '''  $("#btn-resume").addEventListener("click", () => togglePause());''',
               '''  $("#btn-resume").addEventListener("click", () => { if (mode === "online") $("#pause").classList.remove("on"); else togglePause(); });''')
    s = rep(s, '''  $("#btn-quit").addEventListener("click", () => { paused = false; $("#pause").classList.remove("on"); endMatch(); show("title"); });''',
               '''  $("#btn-quit").addEventListener("click", () => { paused = false; $("#pause").classList.remove("on"); if (mode === "online") { leaveOnline(); show("online"); return; } endMatch(); show("title"); });''')
    # 作戦画面：オンラインはサーバーの時計で進む
    s = rep(s, '''    $("#briefing-text").innerHTML = `<b>${D.TEAMS[me.team].shape} ${D.TEAMS[me.team].name}チーム</b>で出発。あなたは<b>${myRole.name}</b>（${D.MAP.routes[myRole.route].name}）。<br>${myRole.desc}。<br><small>味方は擬態中でも名前と輪郭が見える。敵は布しか見えない。</small>`;
    startLoop();
  }
  $("#btn-depart").addEventListener("click", () => { if (g && g.phase === "briefing") { g.timer = 0; Snd.play("ui"); } });''',
'''    $("#briefing-text").innerHTML = `<b>${D.TEAMS[me.team].shape} ${D.TEAMS[me.team].name}チーム</b>で出発。あなたは<b>${myRole.name}</b>（${D.MAP.routes[myRole.route].name}）。<br>${myRole.desc}。<br><small>味方は擬態中でも名前と輪郭が見える。敵は布しか見えない。</small>`;
    $("#btn-depart").style.display = (mode === "online" && !onlineIsHost()) ? "none" : "";
    $("#btn-depart").textContent = mode === "online" ? "出発（ホスト・3秒後に開始）" : "出発（3秒後に開始）";
    if (mode === "online") startOnlineLoop(); else startLoop();
  }
  $("#btn-depart").addEventListener("click", () => { if (!g || g.phase !== "briefing") return; Snd.play("ui"); if (mode === "online") Net.send({ t: "depart" }); else g.timer = 0; });''')
    # 結果画面のボタン：オンラインはホストだけが次を決める
    s = rep(s, '''  $("#btn-rematch").addEventListener("click", () => { Snd.play("ui"); S.resetForRematch(g, false); me = g.players.find(p => p.id === "me"); beginBriefing(); });
  $("#btn-rematch-swap").addEventListener("click", () => { Snd.play("ui"); S.resetForRematch(g, true); me = g.players.find(p => p.id === "me"); lobby.team = me.team; beginBriefing(); });
  $("#btn-to-lobby").addEventListener("click", () => { Snd.play("ui"); endMatch(); buildLobby(); show("lobby"); });''',
'''  $("#btn-rematch").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("rematch", false); return; } S.resetForRematch(g, false); me = g.players.find(p => p.id === "me"); beginBriefing(); });
  $("#btn-rematch-swap").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("rematch", true); return; } S.resetForRematch(g, true); me = g.players.find(p => p.id === "me"); lobby.team = me.team; beginBriefing(); });
  $("#btn-to-lobby").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("tolobby"); return; } endMatch(); buildLobby(); show("lobby"); });''')
    # 足音：幽霊/波紋だけの項目は飛ばし、オンラインの足音はサーバーの判定を使う
    s = rep(s, '''      for (const q of g.players) if (q !== me && S.audible(me, q) && Math.random() < 0.6) Snd.play("stepSoft");''',
               '''      if (g.sounds) { for (const snd of g.sounds) if (Math.random() < 0.6) Snd.play("stepSoft"); }
      else for (const q of g.players) if (q !== me && !q.ghost && !q.pulseOnly && S.audible(me, q) && Math.random() < 0.6) Snd.play("stepSoft");''')
    # 設定：サーバーURL
    s = rep(s, '''    $("#set-zoom").value = s.zoom; $("#set-vol").value = s.volume;
    applySettings();
  }''', '''    $("#set-zoom").value = s.zoom; $("#set-vol").value = s.volume;
    let su = ""; try { su = localStorage.getItem("ninsaiServerUrl") || ""; } catch (e) { }
    $("#set-server").value = su; $("#set-server").placeholder = D.ONLINE.url;
    applySettings();
  }
  $("#set-server").addEventListener("change", e => { const v = e.target.value.trim().replace(/\\/+$/, ""); try { if (v) localStorage.setItem("ninsaiServerUrl", v); else localStorage.removeItem("ninsaiServerUrl"); } catch (x) { } });''')

    ONLINE = r'''
  // ---------- オンライン対戦（合言葉の部屋） ----------
  // サーバー（worker/）が判定を持つ。ここは「入力を送る・状態を受けて描く・自分の移動だけ先読み」
  const online = { code: null, lobby: null, byId: new Map(), snapAt: 0, endMsg: null, pending: null, sendAcc: 0, status: "" };
  function onlineIsHost() { return !!(online.lobby && Net.you && online.lobby.hostId === Net.you.id); }
  function onlineStatus(text, cls) { const el = $("#online-status"); el.textContent = text || ""; el.className = "mini " + (cls || ""); }
  function myOnlineChar() { return save.settings.charId || "kohaku"; }

  async function onlineCreate() {
    Snd.play("ui"); onlineStatus("部屋を作っています…");
    try { const code = await Net.createRoom(); await onlineJoin(code); }
    catch (e) { onlineStatus(e.message || "作れませんでした", "bad"); }
  }
  async function onlineJoin(code) {
    code = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) { onlineStatus("合言葉は4文字です", "bad"); return; }
    onlineStatus("部屋に入っています…");
    try {
      Net.off("lobby"); Net.off("start"); Net.off("snap"); Net.off("end"); Net.off("tolobby"); Net.off("error"); Net.off("close");
      Net.on("lobby", m => { online.lobby = m.lobby; buildRoom(); });
      Net.on("start", m => startOnlineMatch(m));
      Net.on("snap", m => applySnapshot(m));
      Net.on("end", m => onlineEnd(m));
      Net.on("tolobby", m => { online.lobby = m.lobby; endOnlineMatch(); show("room"); buildRoom(); });
      Net.on("error", m => { toast(m.error || "エラー", "bad"); onlineStatus(m.error || "エラー", "bad"); });
      Net.on("close", () => { if (mode === "online" && g) toast("接続が切れた。再接続しています…", "bad"); });
      const m = await Net.connect(code, { charId: myOnlineChar() });
      online.code = code; online.lobby = m.lobby;
      Net.allowReconnect(60 * 60);
      onlineStatus("");
      show("room"); buildRoom();
    } catch (e) { onlineStatus(e.message || "入れませんでした", "bad"); }
  }
  function leaveOnline() {
    endOnlineMatch();
    Net.close(); online.code = null; online.lobby = null;
  }
  function endOnlineMatch() {
    stopLoop(); g = null; me = null; mode = "match"; online.byId = new Map(); online.endMsg = null; input.actions = []; input.x = input.y = 0;
    document.body.classList.remove("online-pause"); $("#pause").classList.remove("on"); pingMenu.classList.remove("on"); Snd.stopAmbient();
  }
  function buildRoom() {
    const L = online.lobby; if (!L) return;
    const meL = L.players.find(p => p.id === (Net.you && Net.you.id));
    $("#room-code").textContent = L.code; $("#room-code-big").textContent = L.code;
    for (const t of [0, 1]) {
      const list = L.players.filter(p => p.team === t);
      const slots = [];
      for (let i = 0; i < 3; i++) {
        const p = list[i];
        if (p) { const c = D.CHARS[D.charIndex(p.charId)]; const r = D.ROLES.find(x => x.id === p.role); slots.push(`<div class="slot ${p.id === (Net.you && Net.you.id) ? "me" : ""} ${p.connected ? "" : "off"}"><img src="img/faces/${c.id}.png" alt=""><div><b>${p.name}${p.host ? " 👑" : ""}</b><small>${r ? r.name : ""}${p.connected ? "" : "・切断中"}</small></div></div>`); }
        else slots.push(`<div class="slot bot"><span class="q">🤖</span><div><b>Bot</b><small>空きは自動で埋まる</small></div></div>`);
      }
      $(`#room-team-${t}`).innerHTML = `<h4 style="color:${D.TEAMS[t].color}">${D.TEAMS[t].shape} ${D.TEAMS[t].name}チーム</h4>` + slots.join("");
    }
    if (meL) {
      const c = D.CHARS[D.charIndex(meL.charId)];
      $("#room-me").innerHTML = `<button class="btn" id="btn-room-char"><img class="face" src="img/faces/${c.id}.png" alt="">${c.name}<small>忍者を変える</small></button>` +
        D.TEAMS.map(t => `<button class="btn ${meL.team === t.id ? "primary" : ""}" data-team="${t.id}">${t.shape} ${t.name}</button>`).join("") +
        D.ROLES.map(r => `<button class="btn ${meL.role === r.id ? "primary" : ""}" data-role="${r.id}">${r.name}</button>`).join("");
      $("#btn-room-char").addEventListener("click", () => openPickerOnline());
      $$("#room-me [data-team]").forEach(b => b.addEventListener("click", () => { Snd.play("ui"); Net.send({ t: "set", team: +b.dataset.team }); }));
      $$("#room-me [data-role]").forEach(b => b.addEventListener("click", () => { Snd.play("ui"); Net.send({ t: "set", role: b.dataset.role }); }));
    }
    const host = onlineIsHost();
    $("#room-dif").innerHTML = Object.entries(D.DIFFICULTY).map(([k, v]) => `<button class="dif-card ${k === (L.difficulty || "normal") ? "sel" : ""}" data-dif="${k}" ${host ? "" : "disabled"}>${v.name}</button>`).join("");
    $$("#room-dif .dif-card").forEach(b => b.addEventListener("click", () => { if (!host) return; Snd.play("ui"); Net.send({ t: "difficulty", value: b.dataset.dif }); }));
    const humans = L.players.filter(p => p.connected).length;
    $("#btn-room-start").style.display = host ? "" : "none";
    $("#btn-room-start").disabled = L.phase !== "lobby";
    $("#room-hint").textContent = L.phase !== "lobby" ? "試合中です。終わるとロビーに戻ります" : host ? `参加 ${humans}人。開始すると空きはBotが埋めます` : `参加 ${humans}人。ホスト（👑）の開始を待っています`;
  }
  function openPickerOnline() {
    const cur = myOnlineChar();
    $("#picker-grid").innerHTML = D.CHARS.map(c => charCard(c, c.id === cur)).join("");
    $$("#picker-grid .cgrid-btn").forEach(b => b.addEventListener("click", () => { save.settings.charId = b.dataset.id; persist(); Snd.play("ui"); $("#picker-modal").classList.remove("on"); Net.send({ t: "set", charId: b.dataset.id }); }));
    $("#picker-modal").classList.add("on");
  }
  $("#btn-room-create").addEventListener("click", onlineCreate);
  $("#btn-room-join").addEventListener("click", () => { Snd.play("ui"); onlineJoin($("#room-code-input").value); });
  $("#room-code-input").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); });
  $("#btn-room-leave").addEventListener("click", () => { Snd.play("ui"); leaveOnline(); show("online"); });
  $("#btn-code-copy").addEventListener("click", () => { try { navigator.clipboard.writeText(online.code || ""); toast("合言葉をコピーした", "good"); } catch (e) { } });
  $$("[data-go='online']").forEach(b => b.addEventListener("click", () => { onlineStatus(""); }));

  // 試合開始（サーバーから）
  function startOnlineMatch(m) {
    mode = "online"; tutorial = null; online.lobby = m.lobby || online.lobby; online.endMsg = null; online.byId = new Map();
    g = { phase: "briefing", timer: R.briefing, time: R.duration, elapsed: 0, tick: 0, overtime: false, winner: [], claimants: [], reason: "", players: [], shots: [], effects: [], log: [], sounds: [], practice: false, noTimer: false, difficulty: D.DIFFICULTY[(online.lobby && online.lobby.difficulty) || "normal"] };
    for (const sp of m.players) {
      const p = { id: sp.id, team: sp.team, char: sp.char, role: sp.role, name: sp.name, bot: sp.bot, x: sp.team ? 60 : 4, y: 24, px: sp.team ? 60 : 4, py: 24, angle: sp.team ? Math.PI : 0, camo: 0, camoEnter: 0, camoTime: 0, camoCd: 0, camoPattern: null, reveal: 0, marks: 0, protect: 0, returning: 0, speedNow: 0, crouch: false, scanCd: 0, shotCd: 0, pingCd: 0, castleTime: 0, pulse: false, emote: null, lastSeen: null, stats: { hides: 0, reveals: 0, hits: 0, pings: 0, returns: 0, claims: 0 }, input: { x: 0, y: 0, actions: [], angle: null } };
      online.byId.set(p.id, p); g.players.push(p);
    }
    me = online.byId.get(Net.you.id) || g.players[0];
    logIdx = 0; paused = false; resultTimer = 0; toasts.length = 0; renderToasts();
    beginBriefing();
  }
  function applySnapshot(m) {
    if (!g || mode !== "online") return;
    online.snapAt = performance.now();
    Object.assign(g, { phase: m.phase, timer: m.timer, time: m.time, elapsed: m.elapsed, tick: m.tick, overtime: m.overtime, winner: m.winner, claimants: m.claimants, reason: m.reason });
    const seen = new Set();
    for (const sp of m.players) {
      seen.add(sp.id);
      let p = online.byId.get(sp.id);
      if (!p) { p = Object.assign({ px: sp.x, py: sp.y, stats: {}, input: { x: 0, y: 0, actions: [], angle: null } }, sp); online.byId.set(sp.id, p); g.players.push(p); continue; }
      if (!g.players.includes(p)) g.players.push(p);
      if (p === me) {
        const sx = sp.x, sy = sp.y, keepAngle = p.angle;
        const err = Math.hypot(sx - p.x, sy - p.y);
        Object.assign(p, sp); p.angle = keepAngle;
        if (err > 1.2 || p.returning > 0) { p.x = sx; p.y = sy; p.px = sx; p.py = sy; } else { p.x = online.px + (sx - online.px) * 0.25; p.y = online.py + (sy - online.py) * 0.25; }
        online.px = p.x; online.py = p.y;
      } else {
        const ox = p.x, oy = p.y;
        Object.assign(p, sp);
        if (sp.x != null) { p.px = ox != null ? ox : sp.x; p.py = oy != null ? oy : sp.y; }
      }
    }
    g.players = g.players.filter(p => seen.has(p.id) || p === me);
    g.shots = m.shots || []; g.sounds = m.sounds || [];
    for (const e of (m.effects || [])) { e.played = false; g.effects.push(e); }
    for (const l of (m.log || [])) g.log.push(l);
    if (g.effects.length > 120) g.effects.splice(0, g.effects.length - 120);
  }
  function onlineInput(x, y, acts, angle) {
    if (!me) return;
    Net.input(x, y, angle, acts);
    online.pending = { x, y };
    if (angle != null) me.angle = angle; else if (Math.hypot(x, y) > 0.1) me.angle = Math.atan2(y, x);
  }
  // 自分の移動だけ先読み（サーバーの位置と大きくずれたら合わせる）
  function predictSelf(dt) {
    if (!me || !online.pending || g.phase !== "playing" || me.returning > 0 || me.camo === 1) return;
    const { x, y } = online.pending;
    if (Math.hypot(x, y) < 0.1) return;
    const base = me.camo === 2 ? R.camoSpeed : me.crouch ? R.crouchSpeed : R.speed;
    const sp = base * (me.slow > 0 ? R.slowFactor : 1);
    const nx = me.x + x * sp * dt, ny = me.y + y * sp * dt;
    me.px = me.x; me.py = me.y;
    if (!S.blocked(nx, me.y, R.bodyRadius, me.team)) me.x = nx;
    if (!S.blocked(me.x, ny, R.bodyRadius, me.team)) me.y = ny;
    if (me.camo === 2 && !S.zoneAt(me.x, me.y)) { /* サーバーが解除する */ }
    online.px = me.x; online.py = me.y;
  }
  function startOnlineLoop() {
    cancelAnimationFrame(raf); lastT = performance.now(); online.sendAcc = 0; online.px = me.x; online.py = me.y;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (!g || mode !== "online") return;
      online.sendAcc += dt;
      if (online.sendAcc >= 1 / D.ONLINE.inputHz) { online.sendAcc = 0; applyInput(); }
      predictSelf(dt);
      for (const e of g.effects) e.life -= dt;
      g.effects = g.effects.filter(e => e.life > 0);
      for (const p of g.players) if (p.emote) { p.emote.t -= dt; if (p.emote.t <= 0) p.emote = null; }
      consumeLog();
      if (g.phase === "briefing") { $("#briefing-timer").textContent = Math.ceil(g.timer); if (current !== "briefing") { show("briefing"); } return; }
      if (current === "briefing") { show("game"); Snd.startAmbient(); Render.resize(); }
      if (current === "game") {
        const alpha = Math.min(1, (now - online.snapAt) / (1000 / D.ONLINE.snapshotHz));
        Render.draw(g, me, alpha, dt);
        Render.drawMinimap(mini, g, me);
        updateHUD(dt);
      }
      if (g.phase === "finished" && online.endMsg && current === "game") { resultTimer += dt; if (resultTimer > 2.2) showResult(); }
    };
    raf = requestAnimationFrame(frame);
  }
  function onlineEnd(m) {
    if (!g || mode !== "online") return;
    const r = m.result;
    Object.assign(g, { phase: "finished", winner: r.winner, claimants: r.claimants, reason: r.reason, elapsed: r.elapsed, overtime: r.overtime });
    for (const rp of r.players) { let p = online.byId.get(rp.id); if (!p) { p = Object.assign({ x: 0, y: 0, px: 0, py: 0 }, rp); online.byId.set(p.id, p); } Object.assign(p, { team: rp.team, char: rp.char, role: rp.role, name: rp.name, stats: rp.stats }); if (!g.players.includes(p)) g.players.push(p); }
    online.endMsg = m; resultTimer = 0;
    for (const p of g.players) p.emote = { type: g.winner.includes(p.team) ? "happy" : "surprised", t: 10 };
  }
  function onlineNext(kind, swap) {
    if (onlineIsHost()) { Net.send(kind === "rematch" ? { t: "rematch", swap: !!swap } : { t: "tolobby" }); if (kind === "tolobby") { endOnlineMatch(); show("room"); buildRoom(); } }
    else { toast("ホスト（👑）が次を決めます。少し待って", "info"); if (kind === "tolobby") { endOnlineMatch(); show("room"); buildRoom(); } }
  }
'''
    s = rep(s, '''  // 検証用の窓口（機械検査・自動テスト用。ゲーム内では使わない）''', ONLINE + '''
  // 検証用の窓口（機械検査・自動テスト用。ゲーム内では使わない）''')
    s = rep(s, '''  window.__ninsai = { get g() { return g; }, get me() { return me; }, get tutorial() { return tutorial; }, queue, input, show, startMatch, startTutorial, save: () => save };''',
               '''  window.__ninsai = { get g() { return g; }, get me() { return me; }, get tutorial() { return tutorial; }, get mode() { return mode; }, get online() { return online; }, queue, input, show, startMatch, startTutorial, onlineCreate, onlineJoin, save: () => save };''')
    wr("game.js", s)

# ================= index.html =================
h = rd("index.html")
if 'id="screen-online"' not in h:
    h = rep(h, '''        <button class="btn primary big" data-go="lobby">ひとりで対戦（3対3・Bot）</button>''',
               '''        <button class="btn primary big" data-go="lobby">ひとりで対戦（3対3・Bot）</button>
        <button class="btn primary big" data-go="online">合言葉の部屋（オンライン対戦）<small>友だちと3対3・空きはBot</small></button>''')
    h = rep(h, '''  <!-- 作戦（15秒） -->''', '''  <!-- オンライン：部屋を作る／合言葉で参加 -->
  <section id="screen-online" class="screen page">
    <header class="page-head"><button class="btn small" data-go="title">← 戻る</button><h2>合言葉の部屋</h2></header>
    <div class="page-body">
      <div class="card"><h3>部屋を作る</h3><p>4文字の合言葉が発行されます。友だちに伝えて同じ部屋に入ってもらいます（最大6人・足りない分はBot）。</p><button class="btn primary big" id="btn-room-create">部屋を作る</button></div>
      <div class="card"><h3>合言葉で参加</h3><div class="code-row"><input id="room-code-input" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="例：AB7K"><button class="btn primary" id="btn-room-join">参加する</button></div></div>
      <p class="mini" id="online-status"></p>
      <p class="mini">通信するのは試合の入力（方向と行動）と状態だけ。名前はキャラ名を使い、自由チャットはありません。判定はサーバーが行い、同着は両チーム優勝です。</p>
    </div>
  </section>

  <!-- オンライン：部屋（ロビー） -->
  <section id="screen-room" class="screen page">
    <header class="page-head"><button class="btn small" id="btn-room-leave">← 退室</button><h2>部屋 <span id="room-code" class="code-inline"></span></h2></header>
    <div class="page-body">
      <div class="card code-card"><div class="mini">合言葉（友だちに伝える）</div><div class="code-big" id="room-code-big"></div><button class="btn small" id="btn-code-copy">コピー</button></div>
      <div class="teams"><div class="team-col" id="room-team-0"></div><div class="team-col" id="room-team-1"></div></div>
      <h3>あなた <small>忍者・チーム・担当</small></h3>
      <div class="row room-me" id="room-me"></div>
      <h3>相手Botの強さ <small>ホストが決める</small></h3>
      <div id="room-dif" class="cards"></div>
      <button class="btn primary big" id="btn-room-start">開始（空きはBotで埋める）</button>
      <p class="mini" id="room-hint"></p>
    </div>
  </section>

  <!-- 作戦（15秒） -->''')
    h = rep(h, '''      <label class="row-set"><span>音量</span><input type="range" id="set-vol" min="0" max="1" step="0.1"></label>''',
               '''      <label class="row-set"><span>音量</span><input type="range" id="set-vol" min="0" max="1" step="0.1"></label>
      <label class="row-set col"><span>オンラインのサーバーURL<small>空欄なら既定。自分で公開したWorkerのURLに変えられる</small></span><input id="set-server" inputmode="url" autocomplete="off" spellcheck="false"></label>''')
    h = rep(h, '''  <script src="game.js?v=3"></script>''', '''  <script src="net.js?v=3"></script>
  <script src="game.js?v=3"></script>''')
    h = h.replace("?v=3", "?v=4")
    wr("index.html", h)

# ================= style.css =================
c = rd("style.css")
if ".code-big" not in c:
    c = c.rstrip() + '''

/* ---------- オンライン（合言葉の部屋） ---------- */
.code-row { display: flex; gap: 8px; }
.code-row input, #set-server { flex: 1; min-height: 48px; border-radius: 12px; border: 1px solid #ffffff33; background: #0f1a24; color: var(--text); font-size: 22px; letter-spacing: .3em; text-align: center; text-transform: uppercase; padding: 4px 10px; font-family: var(--font); }
#set-server { font-size: 14px; letter-spacing: 0; text-transform: none; text-align: left; width: 100%; }
.row-set.col { flex-direction: column; align-items: stretch; }
.row-set.col small { display: block; }
.code-inline { font-family: monospace; color: var(--brass); letter-spacing: .15em; }
.code-card { text-align: center; }
.code-big { font-family: monospace; font-size: 44px; font-weight: 700; letter-spacing: .35em; color: var(--brass); margin: 4px 0 6px; padding-left: .35em; }
.teams { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.team-col h4 { margin: 0 0 6px; font-size: 15px; }
.slot { display: flex; align-items: center; gap: 8px; background: var(--ink2); border: 1px solid #ffffff14; border-radius: 12px; padding: 6px 8px; margin-bottom: 6px; min-height: 52px; }
.slot img, .slot .q { width: 38px; height: 38px; border-radius: 50%; background: #3a4a55; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.slot small { display: block; font-size: 11px; }
.slot.me { border-color: var(--brass); }
.slot.off { opacity: .55; }
.slot.bot { opacity: .7; border-style: dashed; }
.room-me .btn img.face { width: 28px; height: 28px; border-radius: 50%; }
.room-me .btn small { margin-left: 4px; }
body.online-pause #btn-resume { display: none; }
'''
    wr("style.css", c)

# ================= sw.js =================
w = rd("sw.js")
w = w.replace('const CACHE = "ninsai-kakurenbo-v3";', 'const CACHE = "ninsai-kakurenbo-v4";').replace("?v=3", "?v=4")
if "net.js" not in w:
    w = w.replace('"./render.js?v=4", "./game.js?v=4",', '"./render.js?v=4", "./net.js?v=4", "./game.js?v=4",')
wr("sw.js", w)
print("game/index/style/sw patched for online")
