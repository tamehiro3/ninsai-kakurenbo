// 忍彩かくれんぼ — 画面・入力・HUD・練習・音・保存
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const D = DATA, R = DATA.RULES, S = Sim;
  const SAVE_KEY = "ninsaiKakurenboV1";

  // ---------- 保存 ----------
  const DEFAULT_SAVE = {
    settings: { swapSides: false, zoom: 1, reduceMotion: false, footMarks: true, volume: 0.7, difficulty: "normal", charId: "kohaku", mates: [null, null], team: 0, role: "vanguard", showKeys: false },
    stats: { matches: 0, wins: 0, ties: 0, losses: 0, bestClaim: 0, hides: 0, reveals: 0, hits: 0, returns: 0, claims: 0, tutorialDone: false },
    chars: {},
  };
  let save;
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); save = raw ? JSON.parse(raw) : null; } catch (e) { save = null; }
    if (!save || typeof save !== "object") save = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    save.settings = Object.assign({}, DEFAULT_SAVE.settings, save.settings || {});
    save.stats = Object.assign({}, DEFAULT_SAVE.stats, save.stats || {});
    save.chars = save.chars && typeof save.chars === "object" ? save.chars : {};
    if (typeof save.settings.char === "number" && D.CHARS[save.settings.char]) { save.settings.charId = D.CHARS[save.settings.char].id; delete save.settings.char; }
    if (!D.CHARS.some(c => c.id === save.settings.charId)) save.settings.charId = "kohaku";
    if (!Array.isArray(save.settings.mates)) save.settings.mates = [null, null];
  }
  function charRec(id) { if (!save.chars[id]) save.chars[id] = { plays: 0, wins: 0 }; return save.chars[id]; }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できない端末でも遊べる */ } }
  load();

  // ---------- 音（Web Audio 合成・素材なし） ----------
  const Snd = (() => {
    let ac = null, master = null, ambient = null, unlocked = false;
    function unlock() {
      if (unlocked) return;
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = save.settings.volume; master.connect(ac.destination);
        unlocked = true;
      } catch (e) { unlocked = false; }
    }
    function vol(v) { if (master) master.gain.value = v; }
    function tone(freq, dur, type, gain, when, slide) {
      if (!ac) return;
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = type || "sine"; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), ac.currentTime + (when || 0) + dur);
      gn.gain.value = 0; gn.gain.setValueAtTime(0, ac.currentTime + (when || 0));
      gn.gain.linearRampToValueAtTime(gain || 0.2, ac.currentTime + (when || 0) + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + (when || 0) + dur);
      o.connect(gn); gn.connect(master); o.start(ac.currentTime + (when || 0)); o.stop(ac.currentTime + (when || 0) + dur + 0.05);
    }
    function noise(dur, gain, freq, when) {
      if (!ac) return;
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(); src.buffer = buf;
      const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq || 800; f.Q.value = 0.8;
      const gn = ac.createGain(); gn.gain.value = gain || 0.2;
      src.connect(f); f.connect(gn); gn.connect(master); src.start(ac.currentTime + (when || 0));
    }
    const fx = {
      step: () => noise(0.06, 0.06, 400),
      stepSoft: () => noise(0.05, 0.03, 300),
      throw: () => noise(0.12, 0.12, 1800),
      hit: () => { noise(0.08, 0.2, 500); tone(180, 0.15, "square", 0.08); },
      scan: () => { tone(520, 0.25, "sine", 0.12, 0, 900); },
      found: () => { tone(880, 0.1, "triangle", 0.15); tone(1320, 0.18, "triangle", 0.12, 0.1); },
      miss: () => tone(300, 0.15, "sine", 0.06, 0, 240),
      hide: () => noise(0.35, 0.08, 250),
      unhide: () => noise(0.18, 0.06, 350),
      ping: () => { tone(660, 0.08, "square", 0.05); tone(990, 0.1, "square", 0.05, 0.09); },
      returnHome: () => { tone(220, 0.35, "sine", 0.15, 0, 90); },
      count: () => tone(700, 0.1, "sine", 0.12),
      go: () => tone(1000, 0.3, "sine", 0.15),
      win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, "triangle", 0.14, i * 0.12)); tone(110, 1.2, "sine", 0.2, 0.5); },
      lose: () => { tone(330, 0.5, "sine", 0.12, 0, 220); },
      overtime: () => { tone(110, 0.6, "sine", 0.25); tone(110, 0.6, "sine", 0.25, 0.7); },
      ui: () => tone(600, 0.05, "square", 0.04),
      drum: () => { tone(70, 0.9, "sine", 0.22, 0, 45); noise(0.05, 0.04, 120); },
      warn: () => tone(440, 0.12, "square", 0.05),
    };
    function play(n) { if (ac && fx[n]) { if (ac.state === "suspended") ac.resume(); fx[n](); } }
    function startAmbient() {
      if (!ac || ambient) return;
      // 風（ローパスノイズ）＋遠い太鼓
      const len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300;
      const gn = ac.createGain(); gn.gain.value = 0.035;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.17; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(gn.gain); lfo.start();
      src.connect(f); f.connect(gn); gn.connect(master); src.start();
      const drumTimer = setInterval(() => { if (Math.random() < 0.5) play("drum"); }, 6500);
      ambient = { src, drumTimer };
    }
    function stopAmbient() { if (!ambient) return; try { ambient.src.stop(); } catch (e) { } clearInterval(ambient.drumTimer); ambient = null; }
    return { unlock, play, vol, startAmbient, stopAmbient };
  })();

  // ---------- 画面 ----------
  const screens = $$(".screen");
  let current = "title";
  function show(id) {
    screens.forEach(s => s.classList.toggle("active", s.id === "screen-" + id));
    current = id;
    document.body.dataset.screen = id;
    if (id !== "game") Snd.stopAmbient();
  }
  document.addEventListener("pointerdown", () => Snd.unlock(), { once: false });
  $$("[data-go]").forEach(b => b.addEventListener("click", () => { Snd.play("ui"); const to = b.dataset.go; if (to === "lobby") buildLobby(); if (to === "zukan") buildZukan(); show(to); }));
  $$("[data-open-settings]").forEach(b => b.addEventListener("click", () => { Snd.play("ui"); buildSettings(); $("#settings-panel").classList.add("on"); }));

  // ---------- 遊び方・利用表示 ----------
  function buildHowto() {
    $("#howto-body").innerHTML = D.HOWTO.map(h => `<div class="card"><h3>${h.h}</h3><p>${h.p}</p></div>`).join("") +
      `<div class="card"><h3>操作</h3><table class="ctl"><tr><th>動作</th><th>スマホ</th><th>PC</th></tr>${D.CONTROLS.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table></div>`;
  }
  buildHowto();

  // ---------- ロビー ----------
  const lobby = { charId: save.settings.charId, mates: save.settings.mates.slice(), team: save.settings.team, role: save.settings.role, difficulty: save.settings.difficulty, mateRoles: null };
  function otherRoles(role) { return D.ROLES.filter(r => r.id !== role).map(r => r.id); }
  function charCard(c, sel, extra) {
    return `<button class="cgrid-btn ${sel ? "sel" : ""}" data-id="${c.id}" title="${c.name}"><img src="img/faces/${c.id}.png" alt=""><span>${c.name}</span><small>#${c.num}</small>${extra || ""}</button>`;
  }
  function buildLobby() {
    if (!lobby.mateRoles) lobby.mateRoles = otherRoles(lobby.role);
    const me = D.CHARS[D.charIndex(lobby.charId)];
    $("#char-preview").innerHTML = `<img src="img/chars/${me.id}_front.png" alt="${me.name}"><div class="cp-body"><b>${me.name}</b> <small>#${me.num} ${me.en}</small><div class="cp-sub">${me.clan}${me.clanEn ? "・" : ""}${me.jutsu}・${me.weapon}</div><div class="cp-bio">${me.bio || me.gameRole || "公式資料に紹介文なし"}</div>${me.painted ? '<div class="cp-tag">手描きシートの4方向スプライト</div>' : '<div class="cp-tag">公式フィギュアの立ち絵（左右反転で向きを表す）</div>'}</div>`;
    $("#char-grid").innerHTML = D.CHARS.map(c => charCard(c, c.id === lobby.charId)).join("");
    $$("#char-grid .cgrid-btn").forEach(b => b.addEventListener("click", () => { lobby.charId = b.dataset.id; Snd.play("ui"); buildLobby(); }));
    $("#team-cards").innerHTML = D.TEAMS.map(t => `<button class="team-card ${t.id === lobby.team ? "sel" : ""}" data-team="${t.id}" style="--tc:${t.color}"><span class="shape">${t.shape}</span>${t.name}チーム<small>${t.id ? "東から出発" : "西から出発"}</small></button>`).join("");
    $$(".team-card").forEach(b => b.addEventListener("click", () => { lobby.team = +b.dataset.team; Snd.play("ui"); buildLobby(); }));
    $("#role-cards").innerHTML = D.ROLES.map(r => `<button class="role-card ${r.id === lobby.role ? "sel" : ""}" data-role="${r.id}"><b>${r.name}</b><small>${D.MAP.routes[r.route].name}</small><p>${r.desc}</p></button>`).join("");
    $$(".role-card").forEach(b => b.addEventListener("click", () => { lobby.role = b.dataset.role; lobby.mateRoles = otherRoles(lobby.role); Snd.play("ui"); buildLobby(); }));
    $("#mate-list").innerHTML = lobby.mateRoles.map((rid, i) => {
      const r = D.ROLES.find(x => x.id === rid);
      const cid = lobby.mates[i];
      const c = cid ? D.CHARS[D.charIndex(cid)] : null;
      return `<button class="mate-slot" data-slot="${i}">${c ? `<img src="img/faces/${c.id}.png" alt="">` : `<span class="q">？</span>`}<div><b>${c ? c.name : "おまかせ"}</b><small>${r.name}（${D.MAP.routes[r.route].name}）</small></div><em>変える</em></button>`;
    }).join("") + `<button class="btn small" id="btn-swap-mates">担当を入替</button>`;
    $$(".mate-slot").forEach(b => b.addEventListener("click", () => openPicker(+b.dataset.slot)));
    $("#btn-swap-mates").addEventListener("click", () => { lobby.mateRoles.reverse(); Snd.play("ui"); buildLobby(); });
    $("#dif-cards").innerHTML = Object.entries(D.DIFFICULTY).map(([k, v]) => `<button class="dif-card ${k === lobby.difficulty ? "sel" : ""}" data-dif="${k}">${v.name}</button>`).join("");
    $$(".dif-card").forEach(b => b.addEventListener("click", () => { lobby.difficulty = b.dataset.dif; Snd.play("ui"); buildLobby(); }));
  }
  // 味方の指名（おまかせ＝試合ごとに変わる）
  function openPicker(slot) {
    const cur = lobby.mates[slot];
    $("#picker-grid").innerHTML = `<button class="cgrid-btn ${cur ? "" : "sel"}" data-id=""><span class="q">？</span><span>おまかせ</span><small>毎回変わる</small></button>` + D.CHARS.map(c => charCard(c, c.id === cur)).join("");
    $$("#picker-grid .cgrid-btn").forEach(b => b.addEventListener("click", () => { lobby.mates[slot] = b.dataset.id || null; Snd.play("ui"); $("#picker-modal").classList.remove("on"); buildLobby(); }));
    $("#picker-modal").classList.add("on");
  }
  $("#btn-close-picker").addEventListener("click", () => $("#picker-modal").classList.remove("on"));
  $("#btn-start-match").addEventListener("click", () => {
    Object.assign(save.settings, { charId: lobby.charId, mates: lobby.mates.slice(), team: lobby.team, role: lobby.role, difficulty: lobby.difficulty }); persist();
    startMatch({ swap: false });
  });

  // ---------- 試合 ----------
  let g = null, me = null, mode = "match", raf = 0, lastT = 0, acc = 0, paused = false, logIdx = 0, resultTimer = 0, tutorial = null;
  const input = { x: 0, y: 0, actions: [], aim: null, aimOnce: null, keys: {}, mouse: { x: 0, y: 0, t: -99 }, stick: null };
  const cv = $("#game-canvas");
  Render.init(cv, { footMarks: save.settings.footMarks, reduceMotion: save.settings.reduceMotion, zoom: save.settings.zoom });
  const mini = $("#minimap");
  window.addEventListener("resize", () => Render.resize());

  function pickDistinct(pool, n, exclude) {
    const cand = pool.filter(i => !exclude.includes(i));
    const src = cand.length >= n ? cand : pool;
    const out = [];
    while (out.length < n && src.length) { const i = src[Math.floor(Math.random() * src.length)]; if (!out.includes(i)) out.push(i); }
    return out;
  }
  function buildPlayers(swap) {
    const myTeam = swap ? 1 - lobby.team : lobby.team;
    const enemyTeam = 1 - myTeam;
    const all = D.CHARS.map((c, i) => i);
    const myIdx = D.charIndex(lobby.charId);
    const mates = [];
    for (let i = 0; i < 2; i++) {
      const fixed = lobby.mates[i] ? D.charIndex(lobby.mates[i]) : null;
      mates.push(fixed);
    }
    const randoms = pickDistinct(all, 2, [myIdx, ...mates.filter(v => v != null)]);
    for (let i = 0; i < 2; i++) if (mates[i] == null) mates[i] = randoms.shift();
    const enemies = pickDistinct(all, 3, [myIdx, ...mates]);
    const roles = ["vanguard", "scout", "decoy"].sort(() => Math.random() - 0.5);
    const players = [
      { id: "me", team: myTeam, char: myIdx, role: lobby.role, slot: 0, bot: false, name: D.CHARS[myIdx].name },
      { id: "m1", team: myTeam, char: mates[0], role: lobby.mateRoles[0], slot: 1, bot: true },
      { id: "m2", team: myTeam, char: mates[1], role: lobby.mateRoles[1], slot: 2, bot: true },
    ];
    for (let i = 0; i < 3; i++) players.push({ id: "e" + i, team: enemyTeam, char: enemies[i], role: roles[i], slot: i, bot: true });
    return players;
  }
  function startMatch(o) {
    mode = "match"; tutorial = null;
    g = S.createMatch({ players: buildPlayers(o.swap), seed: (Date.now() % 1000000) | 1, difficulty: lobby.difficulty });
    me = g.players.find(p => p.id === "me");
    if (o.swap) { lobby.team = 1 - lobby.team; }
    beginBriefing();
  }
  function beginBriefing() {
    logIdx = 0; paused = false; resultTimer = 0;
    show("briefing");
    const mc = $("#briefing-map");
    const assign = {};
    for (const p of g.players) if (p.team === me.team) { const r = D.ROLES.find(x => x.id === p.role); assign[r.route] = (assign[r.route] ? assign[r.route] + "・" : "") + p.name + "＝" + r.name; }
    Render.drawBriefingMap(mc, me.team, assign);
    const myRole = D.ROLES.find(x => x.id === me.role);
    $("#briefing-text").innerHTML = `<b>${D.TEAMS[me.team].shape} ${D.TEAMS[me.team].name}チーム</b>で出発。あなたは<b>${myRole.name}</b>（${D.MAP.routes[myRole.route].name}）。<br>${myRole.desc}。<br><small>味方は擬態中でも名前と輪郭が見える。敵は布しか見えない。</small>`;
    $("#btn-depart").style.display = (mode === "online" && !onlineIsHost()) ? "none" : "";
    $("#btn-depart").textContent = mode === "online" ? "出発（ホスト・3秒後に開始）" : "出発（3秒後に開始）";
    if (mode === "online") startOnlineLoop(); else startLoop();
  }
  $("#btn-depart").addEventListener("click", () => { if (!g || g.phase !== "briefing") return; Snd.play("ui"); if (mode === "online") Net.send({ t: "depart" }); else g.timer = 0; });

  function startLoop() {
    cancelAnimationFrame(raf); lastT = performance.now(); acc = 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      if (!g) return;
      if (paused) { return; }
      acc += dt;
      let steps = 0;
      while (acc >= S.TICK && steps < 5) {
        applyInput();
        S.step(g);
        if (tutorial) tutorial.update();
        consumeLog();
        acc -= S.TICK; steps++;
      }
      if (g.phase === "briefing") { $("#briefing-timer").textContent = Math.ceil(g.timer); return; }
      if (current === "briefing") { show("game"); Snd.startAmbient(); Render.resize(); }
      if (current === "game") {
        Render.draw(g, me, Math.min(1, acc / S.TICK), dt);
        Render.drawMinimap(mini, g, me);
        updateHUD(dt);
      }
      if (g.phase === "finished" && current === "game") {
        resultTimer += dt;
        if (resultTimer > (tutorial ? 1.5 : 2.2)) { if (tutorial) tutorial.finish(); else showResult(); }
      }
    };
    raf = requestAnimationFrame(frame);
  }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  // ---------- 入力 ----------
  function applyInput() {
    if (!me || me.bot) return;
    let x = input.x, y = input.y;
    if (input.keys.KeyW || input.keys.ArrowUp) y -= 1;
    if (input.keys.KeyS || input.keys.ArrowDown) y += 1;
    if (input.keys.KeyA || input.keys.ArrowLeft) x -= 1;
    if (input.keys.KeyD || input.keys.ArrowRight) x += 1;
    const acts = input.actions.splice(0, 6);
    let angle = null;
    if (input.aimOnce != null && acts.length) { angle = input.aimOnce; }
    else if (performance.now() - input.mouse.t < 2500) {
      angle = Math.atan2(input.mouse.y - Render.sy(me.y), input.mouse.x - Render.sx(me.x));
    }
    input.aimOnce = null;
    if (mode === "online") { onlineInput(x, y, acts, angle); return; }
    S.setInput(me, { x, y, actions: acts, angle });
  }
  function queue(a, angle) { if (!g || paused) return; input.actions.push(a); if (angle != null) input.aimOnce = angle; }

  // 仮想スティック（左側のどこでも）
  const stickZone = $("#stick-zone"), stickBase = $("#stick-base"), stickKnob = $("#stick-knob");
  stickZone.addEventListener("pointerdown", e => {
    if (input.stick || e.pointerType === "mouse") return;
    input.stick = { id: e.pointerId, bx: e.clientX, by: e.clientY };
    stickBase.style.left = e.clientX + "px"; stickBase.style.top = e.clientY + "px"; stickBase.classList.add("on");
    stickKnob.style.transform = "translate(0,0)";
    try { stickZone.setPointerCapture(e.pointerId); } catch (err) { }
    e.preventDefault();
  });
  stickZone.addEventListener("pointermove", e => {
    if (!input.stick || e.pointerId !== input.stick.id) return;
    let dx = e.clientX - input.stick.bx, dy = e.clientY - input.stick.by;
    const len = Math.hypot(dx, dy), max = 52;
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    stickKnob.style.transform = `translate(${dx}px,${dy}px)`;
    const dead = 7;
    if (len < dead) { input.x = 0; input.y = 0; } else { input.x = dx / max; input.y = dy / max; }
  });
  const stickEnd = e => {
    if (!input.stick || e.pointerId !== input.stick.id) return;
    input.stick = null; input.x = 0; input.y = 0; stickBase.classList.remove("on");
  };
  stickZone.addEventListener("pointerup", stickEnd); stickZone.addEventListener("pointercancel", stickEnd); stickZone.addEventListener("lostpointercapture", stickEnd);

  // ボタン（印・目は引っぱって狙える）
  const aimArrow = $("#aim-arrow");
  $$("#btns .abtn").forEach(btn => {
    const action = btn.dataset.action;
    if (!action) return;
    let drag = null;
    btn.addEventListener("pointerdown", e => {
      Snd.unlock();
      btn.classList.add("press");
      if (action === "shot" || action === "scan") {
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, aiming: false };
        try { btn.setPointerCapture(e.pointerId); } catch (err) { }
      } else if (action === "ping") { togglePingMenu(); }
      else { queue(action); }
      e.preventDefault();
    });
    btn.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) > 16) {
        drag.aiming = true; drag.angle = Math.atan2(dy, dx);
        if (save.settings.swapSides) { /* 向きはそのまま */ }
        aimArrow.classList.add("on");
        aimArrow.style.left = Render.sx(me.x) + "px"; aimArrow.style.top = (Render.sy(me.y) - Render.ppm * 0.8) + "px";
        aimArrow.style.transform = `rotate(${drag.angle}rad)`;
        aimArrow.style.width = (action === "shot" ? R.shotRange : R.scanRange) * Render.ppm + "px";
      }
    });
    const end = e => {
      btn.classList.remove("press");
      if (!drag || e.pointerId !== drag.id) return;
      aimArrow.classList.remove("on");
      queue(action, drag.aiming ? drag.angle : null);
      drag = null;
    };
    btn.addEventListener("pointerup", end); btn.addEventListener("pointercancel", end);
  });
  $("#btn-claim").addEventListener("pointerdown", e => { queue("claim"); e.preventDefault(); });
  $("#btn-pause").addEventListener("click", () => togglePause());

  // 合図メニュー
  const pingMenu = $("#ping-menu");
  pingMenu.innerHTML = D.PINGS.map(p => `<button data-ping="${p.id}">${p.icon} ${p.text}</button>`).join("");
  $$("#ping-menu button").forEach(b => b.addEventListener("pointerdown", e => { queue("ping:" + b.dataset.ping); pingMenu.classList.remove("on"); e.preventDefault(); e.stopPropagation(); }));
  function togglePingMenu() { pingMenu.classList.toggle("on"); }

  // キーボード・マウス
  window.addEventListener("keydown", e => {
    if (current !== "game" || !g) return;
    input.keys[e.code] = true;
    if (e.repeat) return;
    switch (e.code) {
      case "KeyE": queue("camo"); break;
      case "KeyQ": queue("scan"); break;
      case "Space": case "KeyJ": queue("shot"); e.preventDefault(); break;
      case "KeyF": queue("claim"); break;
      case "KeyC": case "ControlLeft": queue("crouch"); break;
      case "KeyR": togglePingMenu(); break;
      case "Digit1": queue("ping:here"); pingMenu.classList.remove("on"); break;
      case "Digit2": queue("ping:enemy"); pingMenu.classList.remove("on"); break;
      case "Digit3": queue("ping:flag"); pingMenu.classList.remove("on"); break;
      case "Escape": togglePause(); break;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", e => { input.keys[e.code] = false; });
  window.addEventListener("blur", () => { input.keys = {}; });
  const gameScreen = $("#screen-game");
  window.addEventListener("pointermove", e => { if (e.pointerType !== "mouse" || current !== "game") return; input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.t = performance.now(); });
  gameScreen.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || current !== "game" || !g || e.button !== 0) return;
    if (e.target.closest("button, .ping-menu, .hud-right")) return;
    input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.t = performance.now(); queue("shot");
  });
  gameScreen.addEventListener("contextmenu", e => e.preventDefault());

  // ---------- HUD ----------
  const hud = {
    time: $("#hud-time"), ot: $("#hud-ot"), compass: $("#hud-compass"), mates: $("#hud-mates"), camo: $("#hud-camo"), camoBar: $("#hud-camo-bar"),
    claim: $("#btn-claim"), toast: $("#toast"), count: $("#countdown"), ret: $("#hud-return"), crouch: $("#btn-crouch"),
  };
  let hudAcc = 0;
  const toasts = [];
  function toast(text, cls) { toasts.push({ text, cls: cls || "", t: 2.6 }); if (toasts.length > 3) toasts.shift(); renderToasts(); }
  function renderToasts() { hud.toast.innerHTML = toasts.map(t => `<div class="tst ${t.cls}">${t.text}</div>`).join(""); }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function updateHUD(dt) {
    // カウントダウン
    if (g.phase === "countdown") { hud.count.textContent = Math.ceil(g.timer); hud.count.classList.add("on"); }
    else if (g.phase === "playing" && g.elapsed < 0.8) { hud.count.textContent = "開始！"; hud.count.classList.add("on"); }
    else if (g.phase === "finished") { hud.count.classList.add("on"); hud.count.textContent = g.reason === "timeout" ? "引き分け" : g.winner.length > 1 ? "同着！" : (g.winner[0] === me.team ? "優勝！" : "敗北…"); }
    else hud.count.classList.remove("on");
    // 旗コンパス
    const tgt = (tutorial && Render.opts.marker) || D.MAP.flag;
    const an = Math.atan2(tgt.y - me.y, tgt.x - me.x);
    hud.compass.style.transform = `rotate(${an}rad)`;
    // 旗ボタン
    const inRange = S.dist(me, D.MAP.flag) <= R.flagRadius && me.returning <= 0;
    hud.claim.classList.toggle("on", inRange && g.phase === "playing");
    hud.claim.classList.toggle("blocked", inRange && (me.camo > 0 || me.protect > 0));
    // クールダウン
    setCd("camo", me.camo ? 0 : me.camoCd / R.camoCooldown, me.camo > 0);
    setCd("scan", me.scanCd / (g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown), false);
    setCd("shot", me.shotCd / R.shotCooldown, false);
    setCd("ping", me.pingCd / R.pingCooldown, false);
    hud.crouch.classList.toggle("active", me.crouch);
    hud.ret.classList.toggle("on", me.returning > 0 || me.protect > 0);
    if (me.returning > 0) hud.ret.textContent = `自陣で待機 ${Math.ceil(me.returning)}`; else if (me.protect > 0) hud.ret.textContent = `保護中 ${me.protect.toFixed(1)}`;
    hudAcc += dt;
    for (const t of toasts) t.t -= dt;
    if (toasts.length && toasts[0].t <= 0) { toasts.shift(); renderToasts(); }
    if (hudAcc < 0.1) return;
    hudAcc = 0;
    hud.time.textContent = g.noTimer ? "練習" : fmt(g.time);
    hud.time.classList.toggle("warn", !g.noTimer && g.time <= 10);
    hud.ot.classList.toggle("on", g.overtime);
    // 味方
    hud.mates.innerHTML = g.players.filter(p => p.team === me.team).map(p => {
      const c = D.CHARS[p.char]; const r = D.ROLES.find(x => x.id === p.role);
      const st = p.returning > 0 ? `<em>帰還 ${Math.ceil(p.returning)}</em>` : p.camo === 2 ? "<em>擬態中</em>" : p.marks ? `<em class="mk">印${p.marks}</em>` : "";
      return `<div class="mate-chip ${p === me ? "me" : ""}"><img src="img/faces/${c.id}.png" alt=""><span>${p === me ? "あなた" : c.name}<small>${r ? r.name : ""}</small></span>${st}</div>`;
    }).join("");
    // 擬態の状態
    let text = "", bar = -1, cls = "";
    if (me.camo === 2) { text = `擬態中（${D.MAP.patterns[me.camoPattern].name}）あと${Math.ceil(me.camoTime)}秒`; bar = me.camoTime / (g.overtime ? R.camoOvertime : R.camoDuration); cls = me.camoTime <= R.camoWarn ? "warn" : "ok"; }
    else if (me.camo === 1) { text = "布を広げている…"; bar = 1 - me.camoEnter / R.camoEnter; cls = "ok"; }
    else {
      const z = S.zoneAt(me.x, me.y);
      if (me.protect > 0) text = D.CAMO_REASONS.protect;
      else if (me.reveal > 0) { text = D.CAMO_REASONS.reveal; cls = "warn"; }
      else if (S.dist(me, D.MAP.flag) <= R.flagNoCamo) text = D.CAMO_REASONS.flag;
      else if (!z) text = D.CAMO_REASONS.zone;
      else if (me.camoCd > 0) text = D.CAMO_REASONS.cd.replace("{n}", Math.ceil(me.camoCd));
      else if (me.speedNow > 0.1) text = D.CAMO_REASONS.move;
      else { text = D.CAMO_REASONS.ready.replace("{p}", D.MAP.patterns[z].name); cls = "ok"; }
    }
    hud.camo.textContent = text; hud.camo.className = "hud-camo " + cls;
    hud.camoBar.style.width = bar >= 0 ? (bar * 100) + "%" : "0%";
  }
  function setCd(action, k, active) {
    const b = $(`#btns .abtn[data-action="${action}"]`);
    if (!b) return;
    b.style.setProperty("--cd", Math.max(0, Math.min(1, k)));
    b.classList.toggle("cool", k > 0.001);
    b.classList.toggle("active", !!active);
  }

  // イベントログ → トースト・音
  let footAcc = 0;
  function consumeLog() {
    while (logIdx < g.log.length) {
      const e = g.log[logIdx++];
      const who = id => { const p = g.players.find(q => q.id === id); return p ? (p === me ? "あなた" : p.name) : ""; };
      switch (e.type) {
        case "found":
          if (e.team === me.team) { toast(`${who(e.id)}を見つけた！`, "good"); Snd.play("found"); }
          else if (e.id === me.id) { toast("見つかった！ 3秒間、敵に輪郭が見える", "bad"); Snd.play("warn"); }
          break;
        case "hit":
          if (e.team === me.team) { toast(e.marks >= 2 ? `${who(e.id)}を帰還させた！` : `${who(e.id)}に命中（印1）`, "good"); }
          else if (e.id === me.id) { toast(e.marks >= 2 ? "2回目の印… 自陣へ帰還" : "印を付けられた（8秒以内にもう1回で帰還）", "bad"); }
          Snd.play("hit");
          break;
        case "return":
          if (e.id === me.id) Snd.play("returnHome");
          else if (e.team === me.team) toast(`${who(e.id)}が帰還した`, "bad");
          break;
        case "ping":
          if (e.team === me.team && e.id !== me.id) Snd.play("ping");
          break;
        case "overtime": toast("延長！ 擬態は8秒まで・見破りの回復は6秒", "info"); Snd.play("overtime"); break;
        case "pulse": if (e.id === me.id) toast("旗のそばに居すぎ。足元に波紋が出ている", "bad"); break;
        case "start": Snd.play("go"); break;
        case "end":
          if (e.reason === "timeout") Snd.play("lose"); else if (e.winner.includes(me.team)) Snd.play("win"); else Snd.play("lose");
          break;
      }
    }
    // 効果音（自分の行動）
    for (const ef of g.effects) {
      if (ef.played) continue; ef.played = true;
      if (ef.type === "scan_pre" && ef.team === me.team) Snd.play("scan");
      else if (ef.type === "throw" && ef.team === me.team) Snd.play("throw");
      else if (ef.type === "hide" && S.dist(ef, me) < 10) Snd.play("hide");
      else if (ef.type === "unhide" && S.dist(ef, me) < 10) Snd.play("unhide");
      else if (ef.type === "miss" && ef.owner === me.id) Snd.play("miss");
    }
    // 足音（自分と、聞こえる範囲の他者）
    footAcc += S.TICK;
    if (footAcc > 0.28) {
      footAcc = 0;
      if (me.speedNow > 0.3 && me.returning <= 0) Snd.play(me.crouch || me.camo ? "stepSoft" : "step");
      if (g.sounds) { for (const snd of g.sounds) if (Math.random() < 0.6) Snd.play("stepSoft"); }
      else for (const q of g.players) if (q !== me && !q.ghost && !q.pulseOnly && S.audible(me, q) && Math.random() < 0.6) Snd.play("stepSoft");
    }
    if (g.phase === "countdown") { const c = Math.ceil(g.timer); if (c !== consumeLog.lastC) { consumeLog.lastC = c; Snd.play("count"); } }
  }

  // ---------- ポーズ ----------
  function togglePause() {
    if (!g || current !== "game" || g.phase === "finished") return;
    if (mode === "online") { $("#pause").classList.toggle("on"); document.body.classList.add("online-pause"); return; }
    paused = !paused;
    $("#pause").classList.toggle("on", paused);
    if (!paused) { lastT = performance.now(); }
  }
  $("#btn-resume").addEventListener("click", () => { if (mode === "online") $("#pause").classList.remove("on"); else togglePause(); });
  $("#btn-pause-settings").addEventListener("click", () => { buildSettings(); $("#settings-panel").classList.add("on"); });
  $("#btn-quit").addEventListener("click", () => { paused = false; $("#pause").classList.remove("on"); if (mode === "online") { leaveOnline(); show("online"); return; } endMatch(); show("title"); });
  function endMatch() { stopLoop(); g = null; me = null; tutorial = null; input.actions = []; input.x = input.y = 0; document.body.classList.remove("tutorial"); pingMenu.classList.remove("on"); }

  // ---------- 結果 ----------
  function showResult() {
    show("result");
    const win = g.winner.includes(me.team), tie = g.reason === "tie", timeout = g.reason === "timeout";
    const st = save.stats; st.matches++;
    if (timeout) st.ties++; else if (tie) { st.ties++; } else if (win) st.wins++; else st.losses++;
    const rec = charRec(D.CHARS[me.char].id); rec.plays++; if (win && !timeout) rec.wins++;
    for (const p of g.players) if (p === me) { st.hides += p.stats.hides; st.reveals += p.stats.reveals; st.hits += p.stats.hits; st.returns += p.stats.returns; }
    if (g.claimants.includes(me.id)) { st.claims++; if (!st.bestClaim || g.elapsed < st.bestClaim) st.bestClaim = g.elapsed; }
    persist();
    const title = timeout ? "引き分け（時間切れ）" : tie ? "同着・両チーム優勝" : `${D.TEAMS[g.winner[0]].shape} ${D.TEAMS[g.winner[0]].name}チームの優勝`;
    $("#result-title").textContent = title;
    $("#result-title").className = "result-title " + (timeout ? "draw" : win ? "win" : "lose");
    const claimers = g.claimants.map(id => g.players.find(p => p.id === id));
    const speaker = claimers[0] || me;
    const lineKey = timeout ? "lose" : tie ? "tie" : (win ? "win" : "lose");
    const lines = D.CHARS[speaker.char].lines[lineKey] || [];
    const line = lines[Math.floor(Math.random() * lines.length)] || "";
    const sc = D.CHARS[speaker.char];
    $("#result-hero").innerHTML = `<img src="img/chars/${sc.id}_${sc.painted ? (win || tie ? "happy" : "surprised") : "front"}.png" alt=""><div class="bubble"><b>${sc.name}</b><br>${line}</div>`;
    $("#result-sub").textContent = timeout ? `${R.duration + R.overtime}秒、どちらも旗を掴めなかった` : `${claimers.map(p => (p === me ? "あなた" : p.name) + "（" + D.TEAMS[p.team].name + "）").join("・")}が ${g.elapsed.toFixed(1)}秒 で旗を掴んだ${g.overtime ? "（延長）" : ""}`;
    const rows = g.players.filter(p => p.team === me.team).map(p => { const r = D.ROLES.find(x => x.id === p.role); return `<tr><td>${p === me ? "あなた" : p.name}<small>${r.name}</small></td><td>${p.stats.hides}</td><td>${p.stats.reveals}</td><td>${p.stats.hits}</td><td>${p.stats.pings}</td><td>${p.stats.returns}</td></tr>`; });
    $("#result-table").innerHTML = `<tr><th>味方</th><th>擬態</th><th>見破り</th><th>命中</th><th>合図</th><th>帰還</th></tr>${rows.join("")}`;
    Snd.stopAmbient();
  }
  $("#btn-rematch").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("rematch", false); return; } S.resetForRematch(g, false); me = g.players.find(p => p.id === "me"); beginBriefing(); });
  $("#btn-rematch-swap").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("rematch", true); return; } S.resetForRematch(g, true); me = g.players.find(p => p.id === "me"); lobby.team = me.team; beginBriefing(); });
  $("#btn-to-lobby").addEventListener("click", () => { Snd.play("ui"); if (mode === "online") { onlineNext("tolobby"); return; } endMatch(); buildLobby(); show("lobby"); });

  // ---------- 図鑑 ----------
  let zukanClan = "all";
  function buildZukan() {
    const st = save.stats;
    $("#zukan-stats").innerHTML = `<div class="stat"><b>${st.matches}</b>試合</div><div class="stat"><b>${st.wins}</b>優勝</div><div class="stat"><b>${st.ties}</b>同着/引分</div><div class="stat"><b>${st.claims}</b>旗を掴んだ</div><div class="stat"><b>${st.bestClaim ? st.bestClaim.toFixed(1) + "秒" : "—"}</b>最速</div><div class="stat"><b>${st.hides}</b>擬態</div><div class="stat"><b>${st.reveals}</b>見破り</div><div class="stat"><b>${st.hits}</b>命中</div>`;
    const clans = ["all", ...new Set(D.CHARS.map(c => c.clan))];
    $("#zukan-filter").innerHTML = clans.map(k => `<button class="chip ${k === zukanClan ? "sel" : ""}" data-clan="${k}">${k === "all" ? "全員" : k}</button>`).join("");
    $$("#zukan-filter .chip").forEach(b => b.addEventListener("click", () => { zukanClan = b.dataset.clan; buildZukan(); }));
    const list = D.CHARS.filter(c => zukanClan === "all" || c.clan === zukanClan);
    $("#zukan-cards").innerHTML = list.map(c => {
      const rec = save.chars[c.id] || { plays: 0, wins: 0 };
      const unlocked = rec.wins > 0;
      const lines = c.lines.win;
      return `<div class="zcard"><div class="zimg"><img src="img/art/${c.id}.jpg" alt="${c.name}"><img class="zsprite" src="img/chars/${c.id}_front.png" alt=""></div>
        <div class="zbody"><h3>${c.name} <small>#${c.num} ${c.en}</small></h3>
        <dl><dt>公式資料</dt><dd>${c.clan}${c.clanEn ? "（" + c.clanEn + "）" : ""}・${c.jutsu}・${c.weapon}・誕生日 ${c.birthday}</dd>
        <dt>紹介</dt><dd>${c.bio || c.bioEn || "公式資料に紹介文なし"}</dd>
        ${c.gameRole ? `<dt>この作品での役割</dt><dd>${c.gameRole}</dd>` : ""}
        <dt>ひとこと（優勝すると開く）</dt><dd>${unlocked ? lines.map(l => "「" + l + "」").join("<br>") : "？？？（" + c.name + "で優勝すると開く）"}</dd>
        <dt>戦績</dt><dd>${rec.plays}試合・${rec.wins}優勝</dd></dl>
        <div class="row"><button class="btn small" data-sheet="${c.id}.jpg">資料シート</button>${c.painted ? `<button class="btn small" data-sheet="${c.id === "kohaku" ? "kohaku_sheet.jpg" : "sakuya_jin_sheet.jpg"}">ゲーム用アレンジ案</button>` : ""}</div>
        </div></div>`;
    }).join("");
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-sheet]");
    if (!b) return;
    $("#sheet-img").src = "img/sheets/" + b.dataset.sheet; $("#sheet-modal").classList.add("on");
  });
  $("#sheet-modal").addEventListener("click", () => $("#sheet-modal").classList.remove("on"));

  // ---------- 設定 ----------
  function buildSettings() {
    const s = save.settings;
    $("#set-swap").checked = s.swapSides; $("#set-foot").checked = s.footMarks; $("#set-motion").checked = s.reduceMotion; $("#set-keys").checked = s.showKeys;
    $("#set-zoom").value = s.zoom; $("#set-vol").value = s.volume;
    let su = ""; try { su = localStorage.getItem("ninsaiServerUrl") || ""; } catch (e) { }
    $("#set-server").value = su; $("#set-server").placeholder = D.ONLINE.url;
    applySettings();
  }
  $("#set-server").addEventListener("change", e => { const v = e.target.value.trim().replace(/\/+$/, ""); try { if (v) localStorage.setItem("ninsaiServerUrl", v); else localStorage.removeItem("ninsaiServerUrl"); } catch (x) { } });
  function applySettings() {
    const s = save.settings;
    document.body.classList.toggle("swap", s.swapSides);
    document.body.classList.toggle("show-keys", s.showKeys);
    Render.setOptions({ footMarks: s.footMarks, reduceMotion: s.reduceMotion, zoom: s.zoom });
    Snd.vol(s.volume);
  }
  $("#set-swap").addEventListener("change", e => { save.settings.swapSides = e.target.checked; persist(); applySettings(); });
  $("#set-foot").addEventListener("change", e => { save.settings.footMarks = e.target.checked; persist(); applySettings(); });
  $("#set-motion").addEventListener("change", e => { save.settings.reduceMotion = e.target.checked; persist(); applySettings(); });
  $("#set-keys").addEventListener("change", e => { save.settings.showKeys = e.target.checked; persist(); applySettings(); });
  $("#set-zoom").addEventListener("input", e => { save.settings.zoom = +e.target.value; persist(); applySettings(); });
  $("#set-vol").addEventListener("input", e => { save.settings.volume = +e.target.value; persist(); applySettings(); });
  $("#btn-reset-save").addEventListener("click", () => { if (confirm("戦績と設定を消して最初からにしますか？")) { localStorage.removeItem(SAVE_KEY); load(); buildSettings(); alert("消しました"); } });
  $("#btn-close-settings").addEventListener("click", () => $("#settings-panel").classList.remove("on"));
  applySettings();

  // ---------- 練習（90秒の導入） ----------
  function startTutorial() {
    mode = "tutorial";
    g = S.createMatch({
      practice: true, noTimer: true, briefing: false, difficulty: "easy",
      players: [
        { id: "me", team: 0, char: D.charIndex("kohaku"), role: "vanguard", slot: 0, bot: false },
        { id: "jin", team: 1, char: D.charIndex("jin"), role: "scout", slot: 0, bot: true },
        { id: "sakuya", team: 0, char: D.charIndex("sakuya"), role: "decoy", slot: 1, bot: true },
      ],
    });
    g.phase = "playing"; g.timer = 0;
    me = g.players.find(p => p.id === "me");
    const jin = g.players.find(p => p.id === "jin"), sakuya = g.players.find(p => p.id === "sakuya");
    jin.x = 60; jin.y = 24; sakuya.x = 4; sakuya.y = 27;
    const T = { step: 0, sub: 0, t: 0, done: false, msg: "", retry: 0 };
    const stepDefs = D.TUTORIAL;
    const panel = $("#tut-panel");
    const setMarker = (x, y) => { Render.setOptions({ marker: x == null ? null : { x, y } }); };
    const walkTo = (p, x, y, speedScale) => {
      if (Math.hypot(x - p.x, y - p.y) < 0.3) { S.setInput(p, { x: 0, y: 0, actions: [] }); return true; }
      const m = S.steer(g, p, { x, y });
      S.setInput(p, { x: m.x * (speedScale || 1), y: m.y * (speedScale || 1), actions: [] });
      return false;
    };
    const idle = p => S.setInput(p, { x: 0, y: 0, actions: [] });
    jin.controller = (gg, p) => {
      switch (T.step) {
        case 1: { // 回廊を西へ歩いて通り過ぎる（見つけたら止まる）
          if (T.sub === 0) { p.x = 42; p.y = 9.4; p.angle = Math.PI; T.sub = 1; }
          if (T.sub === 1) {
            if (S.canSee(p, me) && S.dist(p, me) < 6 && me.camo !== 2 && p.x < 30) { T.sub = 3; T.t = 0; T.msg = "見つかった！ 竹の上で止まって「布」。刃がもう一度来る"; idle(p); break; }
            if (S.canSee(p, me) && S.dist(p, me) < 2.0) { T.sub = 3; T.t = 0; T.msg = "近すぎて気づかれた。もう少し奥（上）で隠れよう"; idle(p); break; }
            if (walkTo(p, 10.5, 9.4, 0.7)) { T.sub = 2; }
          } else if (T.sub === 3) { T.t += S.TICK; if (T.t > 1.5) { T.sub = 0; } idle(p); }
          else idle(p);
          break;
        }
        case 2: { // 竹の柄で擬態して、ときどき布を揺らす
          if (T.sub === 0) { p.x = 24.5; p.y = 6.6; p.angle = Math.PI; p.camoCd = 0; T.sub = 1; T.t = 0; }
          T.t += S.TICK;
          if (p.camo === 0 && p.reveal <= 0) { S.setInput(p, { x: 0, y: 0, actions: p.camoCd <= 0 ? ["camo"] : [] }); break; }
          if (p.camo === 2) { p.camoTime = 15; const sway = (T.t % 2.2) < 0.35; S.setInput(p, { x: sway ? 0.5 : 0, y: 0, actions: [] }); }
          else idle(p);
          break;
        }
        case 3: { // 回廊を往復する（撃ち返さない）
          if (T.sub === 0) { if (p.camo) S.setInput(p, { x: 0, y: 0, actions: ["camo"] }); p.reveal = 0; T.sub = 1; T.dir = 1; break; }
          const tx = T.dir > 0 ? 28 : 21;
          if (walkTo(p, tx, 8.5, 0.55)) T.dir = -T.dir;
          break;
        }
        case 4: { // 旗の東で見張り。咲耶が見えたらそちらへ気を取られる
          if (T.sub === 0) { p.x = 36.2; p.y = 24; p.angle = Math.PI; p.marks = 0; p.markTime = 0; p.returning = 0; p.protect = 0; T.sub = 1; }
          const seeS = S.canSee(p, sakuya) && sakuya.returning <= 0;
          if (seeS) {
            const ang = Math.atan2(sakuya.y - p.y, sakuya.x - p.x);
            const acts = p.shotCd <= 0 && S.dist(p, sakuya) < 7 ? ["shot"] : [];
            const d = S.dist(p, sakuya);
            S.setInput(p, { x: d > 4 ? Math.cos(ang) * 0.5 : 0, y: d > 4 ? Math.sin(ang) * 0.5 : 0, actions: acts, angle: ang });
          } else { walkTo(p, 36.2, 24, 0.6); p.angle = Math.PI; }
          break;
        }
        default: idle(p);
      }
    };
    sakuya.controller = (gg, p) => {
      if (T.step !== 4) { idle(p); return; }
      if (T.sub === 1) { p.x = 32; p.y = 31.5; p.returning = 0; p.protect = 0; T.sub = 2; T.t = 0; }
      T.t += S.TICK;
      if (T.t < 1.5) { idle(p); return; }
      if (T.t < 1.6 && p.pingCd <= 0) { S.setInput(p, { x: 0, y: 0, actions: ["ping:here"] }); return; }
      // 旗の南東から刃を挑発
      const target = { x: 35, y: 28.5 };
      const acts = [];
      if (S.dist(p, jin) < 7 && p.shotCd <= 0 && S.canSee(p, jin)) acts.push("shot");
      const ang = Math.atan2(jin.y - p.y, jin.x - p.x);
      if (S.dist(p, target) > 0.4) { const dx = target.x - p.x, dy = target.y - p.y, l = Math.hypot(dx, dy); S.setInput(p, { x: dx / l * 0.7, y: dy / l * 0.7, actions: acts, angle: ang }); }
      else S.setInput(p, { x: 0, y: 0, actions: acts, angle: ang });
    };
    const goal1 = { x: 16.5, y: 6.6 };
    function renderPanel() {
      const s = stepDefs[T.step];
      if (!s) return;
      panel.innerHTML = `<div class="tut-steps">${stepDefs.map((d, i) => `<span class="${i < T.step ? "done" : i === T.step ? "now" : ""}"></span>`).join("")}</div>
        <b>${s.title}</b><p>${T.msg || s.text}</p><small>${s.hint}</small>`;
    }
    T.update = () => {
      if (T.done) return;
      switch (T.step) {
        case 0:
          setMarker(goal1.x, goal1.y);
          if (S.dist(me, goal1) < 0.9) next();
          break;
        case 1:
          setMarker(goal1.x, goal1.y);
          if (T.sub === 2) { T.msg = ""; next(); }
          break;
        case 2:
          setMarker(null);
          if (jin.reveal > 0) { next(); }
          break;
        case 3:
          if (jin.stats.returns > 0 || jin.returning > 0) { next(); }
          break;
        case 4:
          setMarker(D.MAP.flag.x, D.MAP.flag.y);
          if (me.returning > 0 && !T.warned) { T.warned = true; T.msg = "帰還した。もう一度、咲耶が気を引いている間に旗へ"; renderPanel(); }
          if (g.phase === "finished") { T.done = true; }
          break;
      }
    };
    function next() {
      T.step++; T.sub = 0; T.t = 0; T.msg = ""; T.warned = false;
      Snd.play("found");
      if (T.step >= stepDefs.length) { T.done = true; return; }
      renderPanel();
      const flash = document.createElement("div"); flash.className = "tut-ok"; flash.textContent = "できた！"; panel.appendChild(flash); setTimeout(() => flash.remove(), 1200);
    }
    T.finish = () => {
      save.stats.tutorialDone = true; persist();
      endMatch(); setMarker(null);
      $("#tut-done-text").textContent = "見つからずに近づいて、仲間の陽動の隙に旗を掴んだ。これが本作の勝ち方。";
      show("tutdone");
    };
    tutorial = T;
    document.body.classList.add("tutorial");
    renderPanel();
    logIdx = 0; paused = false; resultTimer = 0;
    show("game"); Render.resize(); Snd.startAmbient();
    startLoop();
  }
  $("#btn-tutorial").addEventListener("click", () => { Snd.play("ui"); startTutorial(); });
  $("#btn-tut-skip").addEventListener("click", () => { if (tutorial) { endMatch(); Render.setOptions({ marker: null }); show("title"); } });
  document.body.classList.toggle("tut-done", save.stats.tutorialDone);

  // 縦画面の案内
  function orientationHint() {
    const portrait = window.innerHeight > window.innerWidth;
    $("#rotate-hint").classList.toggle("on", portrait && current === "game");
  }
  window.addEventListener("resize", orientationHint);
  setInterval(orientationHint, 1000);


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
  $("#btn-room-start").addEventListener("click", () => { if (!onlineIsHost()) return; Snd.play("ui"); Net.send({ t: "start" }); $("#room-hint").textContent = "開始しています…"; });
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

  // 検証用の窓口（機械検査・自動テスト用。ゲーム内では使わない）
  window.__ninsai = { get g() { return g; }, get me() { return me; }, get tutorial() { return tutorial; }, get mode() { return mode; }, get online() { return online; }, queue, input, show, startMatch, startTutorial, onlineCreate, onlineJoin, save: () => save };

  // ---------- 起動 ----------
  Render.loadAssets().then(() => { document.body.classList.add("ready"); });
  // ローカル確認中はService Workerを使わない（古いファイルが残らないように）
  if ("serviceWorker" in navigator && !["localhost", "127.0.0.1"].includes(location.hostname)) { window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { })); }
  show("title");
})();
