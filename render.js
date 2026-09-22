// 忍彩かくれんぼ — 描画（見下ろし2D・Canvas）。可視判定は Sim の関数を使い、見えない敵は描かない
const Render = (() => {
  const S = Sim, R = Sim.R, D = Sim.D, W = Sim.W, H = Sim.H, FLAG = Sim.FLAG;
  let cv, ctx, dpr = 1, Wpx = 0, Hpx = 0;
  let ppm = 26, zoom = 1;
  let floorCv = null, floorPpm = 0;
  let darkCv = null;
  let miniCv = null;
  const cam = { x: FLAG.x, y: FLAG.y };
  const img = {};      // "kohaku_front" → Image
  let assetsReady = false;
  let t = 0;           // 描画用の時計（秒）
  const reduceMotion = () => !!(opts && opts.reduceMotion);
  let opts = {};

  const C = {
    ink: "#15222B", paper: "#F5EEDD", brass: "#C7A55B",
    ground: "#2c3541", ground2: "#323d4a", solidBase: "#0d1219",
    wallTop: "#3b4754", wallTopEdge: "#4c5967", wallFront: "#222b35",
    bambooTop: "#2f4d3a", bambooStalk: "#4f7f5f", bambooDark: "#2c4a37",
    rock: "#5b636c", rockDark: "#3d444c", rockLight: "#7a838d",
    b: "#2d4737", bLine: "#3c5d48",
    s: "#3e454b", sDot: "#585f66",
    w: "#4a3a2b", wLine: "#5c4837",
    sand: "#6a5d46", sandDot: "#7a6c53",
    B: "#233647", O: "#46321f",
    yellow: "#FFD84A", red: "#D9483B", white: "#ffffff",
  };
  const TEAM = D.TEAMS;

  function init(canvas, options) {
    cv = canvas; ctx = cv.getContext("2d"); opts = options || {};
    resize();
  }
  function setOptions(o) { opts = Object.assign(opts, o || {}); if (o && o.zoom) { zoom = o.zoom; resize(); } }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    Wpx = cv.clientWidth || window.innerWidth; Hpx = cv.clientHeight || window.innerHeight;
    cv.width = Math.round(Wpx * dpr); cv.height = Math.round(Hpx * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const short = Math.min(Wpx, Hpx);
    ppm = Math.max(16, Math.min(44, short / 15)) * zoom;
    if (floorPpm !== ppm) prerenderFloor();
    darkCv = document.createElement("canvas"); darkCv.width = cv.width; darkCv.height = cv.height;
  }
  function loadAssets() {
    const list = [];
    // 手描きシート由来の3体は4方向＋表情、それ以外は公式フィギュアの正面だけ（tools/build_chars.py）
    const PAINTED = { kohaku: ["front", "quarter", "side", "back", "happy", "surprised", "neutral", "focus", "walk"], sakuya: ["front", "quarter", "side", "back", "happy", "surprised", "crouch"], jin: ["front", "quarter", "side", "back", "happy", "surprised", "crouch"] };
    for (const c of D.CHARS) for (const v of (PAINTED[c.id] || ["front"])) list.push(c.id + "_" + v);
    return Promise.all(list.map(k => new Promise(res => {
      const im = new Image();
      im.onload = () => { img[k] = im; res(); };
      im.onerror = () => res();
      im.src = "img/chars/" + k + ".png";
    }))).then(() => { assetsReady = true; });
  }

  // ---------- 床の事前描画 ----------
  function prerenderFloor() {
    floorPpm = ppm;
    floorCv = document.createElement("canvas");
    floorCv.width = Math.ceil(W * ppm); floorCv.height = Math.ceil(H * ppm);
    const f = floorCv.getContext("2d");
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = Sim.grid[y][x];
      const px = x * ppm, py = y * ppm;
      if (Sim.SOLID[c]) { f.fillStyle = C.solidBase; f.fillRect(px, py, ppm + 1, ppm + 1); continue; }
      let base = C.ground;
      if (c === "b") base = C.b; else if (c === "s") base = C.s; else if (c === "w") base = C.w; else if (c === "~") base = C.sand;
      else if (c === "B") base = C.B; else if (c === "O") base = C.O; else if ((x + y) % 2) base = C.ground2;
      f.fillStyle = base; f.fillRect(px, py, ppm + 1, ppm + 1);
      if (c === "b") { f.fillStyle = C.bLine; for (let i = 0; i < 3; i++) f.fillRect(px + ppm * (0.15 + i * 0.33), py, Math.max(1, ppm * 0.09), ppm + 1); }
      else if (c === "s") { f.fillStyle = C.sDot; for (let i = 0; i < 4; i++) { const r = ppm * 0.09; f.beginPath(); f.arc(px + ppm * (0.22 + (i % 2) * 0.5) + (rnd() - 0.5) * ppm * 0.15, py + ppm * (0.25 + ((i / 2) | 0) * 0.5), r, 0, 7); f.fill(); } }
      else if (c === "w") { f.fillStyle = C.wLine; for (let i = 0; i < 3; i++) f.fillRect(px, py + ppm * (0.18 + i * 0.32), ppm + 1, Math.max(1, ppm * 0.07)); }
      else if (c === "~") { f.fillStyle = C.sandDot; for (let i = 0; i < 5; i++) f.fillRect(px + rnd() * ppm, py + rnd() * ppm, 1.5, 1.5); }
      else if (c === "." && rnd() < 0.25) { f.fillStyle = "rgba(255,255,255,0.03)"; f.fillRect(px + rnd() * ppm, py + rnd() * ppm, 2, 2); }
    }
    // 旗の取得範囲（半径1m）の真鍮の輪
    f.strokeStyle = C.brass; f.lineWidth = Math.max(1.5, ppm * 0.08);
    f.beginPath(); f.arc(FLAG.x * ppm, FLAG.y * ppm, R.flagRadius * ppm, 0, 7); f.stroke();
    f.strokeStyle = "rgba(199,165,91,0.25)"; f.setLineDash([4, 6]);
    f.beginPath(); f.arc(FLAG.x * ppm, FLAG.y * ppm, R.flagNoCamo * ppm, 0, 7); f.stroke(); f.setLineDash([]);
    prerenderMini();
  }
  function prerenderMini() {
    miniCv = document.createElement("canvas");
    const s = 3; miniCv.width = W * s; miniCv.height = H * s;
    const m = miniCv.getContext("2d");
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = Sim.grid[y][x];
      let col = "#3a4653";
      if (c === ".") col = "#6c7784"; else if (c === "b") col = "#5c8a6b"; else if (c === "s") col = "#8a9199"; else if (c === "w") col = "#8a6e52";
      else if (c === "~") col = "#c9b17d"; else if (c === "B") col = "#3C83BA"; else if (c === "O") col = "#D87932"; else if (c === "t") col = "#2d4a38"; else if (c === "r") col = "#4a5159";
      m.fillStyle = col; m.fillRect(x * s, y * s, s, s);
    }
  }

  // ---------- 座標 ----------
  const sx = x => (x - cam.x) * ppm + Wpx / 2;
  const sy = y => (y - cam.y) * ppm + Hpx / 2;
  function setCamera(x, y) {
    const halfW = Wpx / 2 / ppm, halfH = Hpx / 2 / ppm;
    cam.x = halfW * 2 >= W ? W / 2 : Math.max(halfW, Math.min(W - halfW, x));
    cam.y = halfH * 2 >= H ? H / 2 : Math.max(halfH, Math.min(H - halfH, y));
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------- 壁ブロック ----------
  function isSolid(x, y) { return x < 0 || y < 0 || x >= W || y >= H || !!Sim.SOLID[Sim.grid[y][x]]; }
  function drawWallCell(x, y, c) {
    const px = sx(x), py = sy(y), hgt = ppm * 0.55;
    const below = y + 1 < H ? Sim.grid[y + 1][x] : "#";
    const frontVisible = !Sim.SOLID[below];
    // 厚い壁の内側（四方が固体）は屋根として暗く塗る
    if (c === "#" && isSolid(x - 1, y) && isSolid(x + 1, y) && isSolid(x, y - 1) && isSolid(x, y + 1)) {
      ctx.fillStyle = "#1a2129"; ctx.fillRect(px, py - hgt, ppm + 0.5, ppm + 0.5);
      if ((x + y) % 2 === 0) { ctx.fillStyle = "#1e262f"; ctx.fillRect(px + ppm * 0.2, py - hgt + ppm * 0.2, ppm * 0.6, ppm * 0.6); }
      return;
    }
    if (c === "t") {
      ctx.fillStyle = C.bambooTop; ctx.fillRect(px, py - hgt, ppm + 0.5, ppm + hgt + 0.5);
      ctx.fillStyle = C.bambooStalk;
      for (let i = 0; i < 3; i++) { const bx = px + ppm * (0.12 + i * 0.33), bw = ppm * 0.16; ctx.fillRect(bx, py - hgt, bw, ppm + hgt); ctx.fillStyle = C.bambooDark; ctx.fillRect(bx, py - hgt + ppm * 0.4, bw, 2); ctx.fillRect(bx, py + ppm * 0.3, bw, 2); ctx.fillStyle = C.bambooStalk; }
      return;
    }
    if (c === "r") {
      ctx.fillStyle = C.rockDark; ctx.beginPath(); ctx.ellipse(px + ppm / 2, py + ppm * 0.62, ppm * 0.55, ppm * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = C.rock; ctx.beginPath(); ctx.ellipse(px + ppm / 2, py + ppm * 0.35, ppm * 0.52, ppm * 0.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = C.rockLight; ctx.beginPath(); ctx.ellipse(px + ppm * 0.38, py + ppm * 0.2, ppm * 0.18, ppm * 0.12, -0.5, 0, 7); ctx.fill();
      return;
    }
    // 城壁
    if (frontVisible) { ctx.fillStyle = C.wallFront; ctx.fillRect(px, py + ppm - hgt, ppm + 0.5, hgt + 0.5); }
    ctx.fillStyle = C.wallTop; ctx.fillRect(px, py - hgt, ppm + 0.5, ppm + 0.5);
    ctx.fillStyle = C.wallTopEdge; ctx.fillRect(px, py - hgt, ppm + 0.5, 2);
    if (frontVisible) { ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(px, py + ppm - hgt, ppm + 0.5, 3); }
  }

  // ---------- 布 ----------
  function drawCloth(x, y, pattern, alpha, sway, scale) {
    const w = 1.35 * ppm * (scale || 1), h = 1.05 * ppm * (scale || 1);
    const cx = sx(x) + (sway ? Math.sin(t * 9) * ppm * 0.08 : 0), cy = sy(y) - h * 0.55;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (sway) ctx.transform(1, 0, Math.sin(t * 9 + 1) * 0.08, 1, 0, 0);
    const r = ppm * 0.22;
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fillStyle = pattern === "b" ? "#35523f" : pattern === "s" ? "#474e55" : "#54432f"; ctx.fill();
    ctx.clip();
    if (pattern === "b") { ctx.fillStyle = "#456b52"; for (let i = 0; i < 4; i++) ctx.fillRect(-w / 2 + w * (0.1 + i * 0.25), -h / 2, w * 0.08, h); }
    else if (pattern === "s") { ctx.fillStyle = "#636a72"; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-w / 2 + w * (0.15 + (i % 3) * 0.35), -h / 2 + h * (0.28 + ((i / 3) | 0) * 0.45), w * 0.07, 0, 7); ctx.fill(); } }
    else { ctx.fillStyle = "#67533d"; for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2, -h / 2 + h * (0.2 + i * 0.3), w, h * 0.06); }
    // 布のしわ
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w * 0.3, -h / 2); ctx.quadraticCurveTo(-w * 0.1, 0, -w * 0.25, h / 2); ctx.moveTo(w * 0.25, -h / 2); ctx.quadraticCurveTo(w * 0.05, 0, w * 0.3, h / 2); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = alpha * 0.35; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r); ctx.stroke(); ctx.restore();
  }

  // ---------- キャラクター ----------
  function spriteFor(p) {
    const cid = D.CHARS[p.char].id;
    const has = v => img[cid + "_" + v];
    if (p.emote && has(p.emote.type)) return { im: has(p.emote.type), flip: false };
    const a = ((p.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const sec = Math.round(a / (Math.PI / 4)) % 8;
    const facingRight = sec === 0 || sec === 1 || sec === 7;
    if (p.crouch && has("crouch")) return { im: has("crouch"), flip: facingRight };
    // 正面の立ち絵しか無いキャラは左右反転だけで向きを表す
    if (!has("side") || !has("quarter") || !has("back")) return { im: has("front"), flip: facingRight };
    switch (sec) {
      case 0: return { im: has("side"), flip: true };
      case 1: return { im: has("quarter"), flip: true };
      case 2: return { im: has("front"), flip: false };
      case 3: return { im: has("quarter"), flip: false };
      case 4: return { im: has("side"), flip: false };
      case 5: return { im: has("back"), flip: false };
      case 6: return { im: has("back"), flip: false };
      default: return { im: has("back"), flip: true };
    }
  }
  function drawBadge(x, y, team, alpha) {
    const c = TEAM[team];
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = c.color; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2;
    const r = ppm * 0.16;
    if (team === 0) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  function drawLabel(x, y, text, color, size) {
    ctx.save(); ctx.font = `600 ${size || Math.max(10, ppm * 0.42)}px "Yu Gothic UI","Hiragino Sans","Meiryo",sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(10,14,20,0.85)"; ctx.strokeText(text, x, y);
    ctx.fillStyle = color || "#fff"; ctx.fillText(text, x, y); ctx.restore();
  }
  function drawCharacter(g, p, viewer, view, ix, iy) {
    const isSelf = p === viewer, ally = p.team === viewer.team;
    const feetX = sx(ix), feetY = sy(iy);
    const hVis = ppm * (p.crouch ? 1.45 : 1.75);
    // 影
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.42, ppm * 0.16, 0, 0, 7); ctx.fill(); ctx.restore();
    // 布（擬態中）
    if (p.camo === 2) {
      const clothAlpha = isSelf ? 0.85 : 1;
      drawCloth(ix, iy, p.camoPattern, clothAlpha, p.speedNow > 0.1, 1);
      if (!isSelf && !ally && view === "cloth") return;      // 敵には布だけ
    }
    if (p.camo === 1) {
      const k = 1 - p.camoEnter / R.camoEnter;
      drawCloth(ix, iy, p.camoPattern, 0.5 + 0.4 * k, false, 0.3 + 0.7 * k);
    }
    const spr = spriteFor(p);
    if (spr.im && assetsReady) {
      const im = spr.im, w = hVis * im.width / im.height;
      const bob = (p.speedNow > 0.3 && !reduceMotion()) ? Math.abs(Math.sin(t * 11)) * ppm * 0.07 : 0;
      ctx.save();
      if (p.reveal > 0) { ctx.shadowColor = C.yellow; ctx.shadowBlur = 14; }
      if (p.camo === 2 && isSelf) ctx.globalAlpha = 0.45;
      if (p.camo === 2 && ally && !isSelf) ctx.globalAlpha = 0.5;
      if (p.protect > 0) ctx.globalAlpha *= 0.65 + 0.35 * Math.abs(Math.sin(t * 8));
      ctx.translate(feetX, feetY - bob);
      if (spr.flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -w / 2, -hVis, w, hVis);
      ctx.restore();
    } else {
      ctx.fillStyle = D.CHARS[p.char].color; ctx.fillRect(feetX - ppm * 0.3, feetY - hVis, ppm * 0.6, hVis);
    }
    // 表情（スプライトが無いキャラは記号で）
    if (p.emote && !img[D.CHARS[p.char].id + "_" + p.emote.type]) drawLabel(feetX + ppm * 0.55, feetY - hVis - ppm * 0.15, p.emote.type === "happy" ? "♪" : "！", p.emote.type === "happy" ? "#ffe08a" : "#ff8a7a", ppm * 0.7);
    // 発見中の輪
    if (p.reveal > 0) { ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.5, ppm * 0.2, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // 保護中の輪
    if (p.protect > 0) { ctx.save(); ctx.strokeStyle = "rgba(180,220,255,0.8)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.6, ppm * 0.25, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // 腕章（擬態中は隠す）
    if (p.camo === 0) drawBadge(feetX + ppm * 0.42, feetY - hVis * 0.62, p.team, 1);
    // 印
    for (let i = 0; i < p.marks; i++) {
      ctx.save(); ctx.translate(feetX - ppm * 0.2 + i * ppm * 0.4, feetY - hVis - ppm * 0.3); ctx.rotate(0.2 - i * 0.4);
      ctx.fillStyle = "#f4e9c8"; ctx.fillRect(-ppm * 0.12, -ppm * 0.2, ppm * 0.24, ppm * 0.4);
      ctx.fillStyle = C.red; ctx.fillRect(-ppm * 0.06, -ppm * 0.12, ppm * 0.12, ppm * 0.24); ctx.restore();
    }
    // 味方の名前・マーカー
    if (ally) {
      const label = isSelf ? "" : p.name;
      if (label) drawLabel(feetX, feetY - hVis - ppm * 0.35, label, TEAM[p.team].light);
      if (!isSelf) { ctx.save(); ctx.fillStyle = TEAM[p.team].light; ctx.beginPath(); ctx.moveTo(feetX, feetY - hVis - ppm * 0.18); ctx.lineTo(feetX - ppm * 0.16, feetY - hVis - ppm * 0.4); ctx.lineTo(feetX + ppm * 0.16, feetY - hVis - ppm * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); }
      if (p.camo === 2 && isSelf) drawLabel(feetX, feetY - hVis - ppm * 0.35, "柄が一致：" + D.MAP.patterns[p.camoPattern].name, "#cfe8d6");
    }
    // 帰還待ちの秒数（味方）
    if (ally && p.returning > 0) drawLabel(feetX, feetY - hVis - ppm * 0.4, "帰還 " + Math.ceil(p.returning), "#ddd");
  }

  // ---------- 旗 ----------
  function drawFlag(g) {
    const x = sx(FLAG.x), y = sy(FLAG.y);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.35, ppm * 0.14, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b5a3a"; ctx.fillRect(x - ppm * 0.3, y - ppm * 0.18, ppm * 0.6, ppm * 0.18);
    ctx.fillStyle = "#e8d9b0"; ctx.fillRect(x - 2, y - ppm * 2.3, 4, ppm * 2.3);
    const wave = reduceMotion() ? 0 : Math.sin(t * 3) * ppm * 0.12;
    ctx.fillStyle = g.phase === "finished" && g.winner.length === 1 ? TEAM[g.winner[0]].color : "#c8452f";
    ctx.beginPath(); ctx.moveTo(x + 2, y - ppm * 2.3); ctx.lineTo(x + ppm * 1.1, y - ppm * 2.0 + wave); ctx.lineTo(x + 2, y - ppm * 1.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.brass; ctx.beginPath(); ctx.arc(x, y - ppm * 2.35, 4, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- 効果 ----------
  function drawGroundEffects(g, viewer) {
    for (const e of g.effects) {
      const k = 1 - e.life / e.maxLife, a = e.life / e.maxLife;
      const x = sx(e.x), y = sy(e.y);
      if (e.type === "scan" && (e.team === viewer.team || Sim.lineClear(viewer.x, viewer.y, e.x, e.y))) {
        ctx.save(); ctx.globalAlpha = a * 0.55; ctx.fillStyle = TEAM[e.team].light;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, R.scanRange * ppm * Math.min(1, k * 2.5), e.angle - R.scanAngle / 2, e.angle + R.scanAngle / 2); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = a; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, R.scanRange * ppm * Math.min(1, k * 2.5), e.angle - R.scanAngle / 2, e.angle + R.scanAngle / 2); ctx.stroke(); ctx.restore();
      } else if (e.type === "scan_pre") {
        ctx.save(); ctx.globalAlpha = 0.8 * a; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ppm * (0.4 + k * 0.9), 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "hide" || e.type === "unhide" || e.type === "return") {
        ctx.save(); ctx.globalAlpha = a * 0.7; ctx.fillStyle = e.type === "return" ? "#c9d3dd" : "#a89f8a";
        for (let i = 0; i < 5; i++) { const an = i * 1.256 + k; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * (0.3 + k * 0.8), y - ppm * 0.3 + Math.sin(an) * ppm * (0.2 + k * 0.5), ppm * (0.18 - k * 0.12), 0, 7); ctx.fill(); }
        ctx.restore();
      } else if (e.type === "win") {
        ctx.save(); ctx.globalAlpha = 0.9;
        for (let i = 0; i < 24; i++) { const an = i * 0.2618 + t * 0.2, rr = ppm * (1 + k * 6) * (0.6 + (i % 3) * 0.2); ctx.fillStyle = i % 2 ? C.brass : "#f6e7c1"; ctx.fillRect(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.6 + k * ppm * 2, 4, 6); }
        ctx.restore();
      }
    }
    if (opts.marker) {
      const x = sx(opts.marker.x), y = sy(opts.marker.y), k = (t * 0.8) % 1;
      ctx.save(); ctx.strokeStyle = C.brass; ctx.lineWidth = 3;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(x, y, ppm * (0.5 + k * 1.4), ppm * (0.2 + k * 0.6), 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.5, ppm * 0.2, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = C.brass; ctx.beginPath(); ctx.moveTo(x, y - ppm * 1.2 - Math.sin(t * 4) * 4); ctx.lineTo(x - 7, y - ppm * 1.6 - Math.sin(t * 4) * 4); ctx.lineTo(x + 7, y - ppm * 1.6 - Math.sin(t * 4) * 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const p of g.players) {
      if (!p.pulse || p.returning > 0 || p.ghost) continue;
      const x = sx(p.x), y = sy(p.y);
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const k = ((t * 0.7 + i / 3) % 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(x, y, ppm * (0.3 + k * 1.6), ppm * (0.12 + k * 0.7), 0, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawTopEffects(g, viewer) {
    for (const e of g.effects) {
      const a = e.life / e.maxLife, k = 1 - a;
      const x = sx(e.x), y = sy(e.y);
      if (e.type === "found") {
        ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y - ppm * 0.8, ppm * (0.5 + k * 1.2), 0, 7); ctx.stroke(); ctx.restore();
        if (e.team === viewer.team) drawLabel(x, y - ppm * 2.2 - k * ppm, "見つけた！", C.yellow);
      } else if (e.type === "miss" && e.owner === viewer.id) {
        drawLabel(x, y - ppm * 2.2 - k * ppm * 0.5, "気配なし", "#cfd6dd");
      } else if (e.type === "hit") {
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#ff8a5c"; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const an = i * 1.047; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * ppm * 0.2, y - ppm * 0.8 + Math.sin(an) * ppm * 0.2); ctx.lineTo(x + Math.cos(an) * ppm * (0.4 + k), y - ppm * 0.8 + Math.sin(an) * ppm * (0.4 + k)); ctx.stroke(); }
        ctx.restore();
        if (e.team === viewer.team) drawLabel(x, y - ppm * 2.3 - k * ppm, e.marks >= 2 ? "帰還！" : "命中", "#ffb090");
      } else if (e.type === "ping" && e.team === viewer.team) {
        const bx = x, by = y - ppm * 2.4 - k * ppm * 0.3;
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 3);
        ctx.font = `600 ${Math.max(11, ppm * 0.44)}px "Yu Gothic UI","Hiragino Sans","Meiryo",sans-serif`;
        const text = e.icon + " " + e.text; const tw = ctx.measureText(text).width + 14;
        ctx.fillStyle = "rgba(245,238,221,0.95)"; ctx.beginPath(); ctx.roundRect(bx - tw / 2, by - ppm * 0.6, tw, ppm * 0.7, 6); ctx.fill();
        ctx.fillStyle = C.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, bx, by - ppm * 0.25);
        ctx.restore();
      } else if (e.type === "claim_fail" && e.owner === viewer.id) {
        drawLabel(x, y - ppm * 2.2, "まだ掴めない", "#ff9a8a");
      } else if (e.type === "overtime") {
        // HUD側で表示
      }
    }
    // 最後に見た場所（味方共有・2秒）
    for (const q of g.players) {
      if (q.team === viewer.team || !q.lastSeen || q.reveal > 0) continue;
      const x = sx(q.lastSeen.x), y = sy(q.lastSeen.y);
      ctx.save(); ctx.globalAlpha = Math.min(1, q.lastSeen.t / R.lastSeen); ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.5, ppm * 0.22, 0, 0, 7); ctx.stroke(); ctx.restore();
    }
  }
  function drawShots(g, viewer) {
    for (const s of g.shots) {
      if (!Sim.lineClear(viewer.x, viewer.y, s.x, s.y) && Sim.dist(viewer, s) > 3) continue;
      const x = sx(s.x), y = sy(s.y) - ppm * 0.8;
      ctx.save(); ctx.translate(x, y); ctx.rotate(s.angle);
      ctx.globalAlpha = 0.4; ctx.fillStyle = "#fff"; ctx.fillRect(-ppm * 0.7, -1.5, ppm * 0.5, 3);
      ctx.globalAlpha = 1; ctx.fillStyle = "#f7efd6"; ctx.fillRect(-ppm * 0.18, -ppm * 0.11, ppm * 0.36, ppm * 0.22);
      ctx.fillStyle = C.red; ctx.fillRect(-ppm * 0.05, -ppm * 0.06, ppm * 0.1, ppm * 0.12);
      ctx.restore();
    }
  }
  // 足音の方向マーク（見えていない敵の足音を、正確な座標を出さずに方向だけで示す）
  function drawFootMarks(g, viewer) {
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
      if (q.ghost || q.pulseOnly) continue;
      if (q.team === viewer.team || !Sim.audible(viewer, q)) continue;
      if (Sim.enemyView(viewer, q) === "seen" || Sim.enemyView(viewer, q) === "revealed") continue;
      const an = Math.atan2(q.y - viewer.y, q.x - viewer.x);
      const d = Sim.dist(viewer, q);
      const rr = ppm * 1.7, cx = sx(viewer.x), cy = sy(viewer.y) - ppm * 0.6;
      ctx.save(); ctx.globalAlpha = Math.max(0.35, 1 - d / 9); ctx.strokeStyle = "#f2e6c4"; ctx.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, rr + i * ppm * 0.25, an - 0.35, an + 0.35); ctx.stroke(); }
      ctx.restore();
    }
  }
  // 視界（壁の向こうを暗く）
  function drawDarkness(viewer) {
    const d = darkCv.getContext("2d");
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, Wpx, Hpx);
    d.fillStyle = "rgba(6,10,16,0.55)"; d.fillRect(0, 0, Wpx, Hpx);
    const N = 100, maxR = R.viewRange, ox = viewer.x, oy = viewer.y;
    d.globalCompositeOperation = "destination-out";
    const grad = d.createRadialGradient(sx(ox), sy(oy), ppm * 2, sx(ox), sy(oy), maxR * ppm);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(0.75, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    d.fillStyle = grad;
    d.beginPath();
    for (let i = 0; i <= N; i++) {
      const an = (i / N) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
      let r = 0;
      for (; r < maxR; r += 0.25) { if (Sim.SOLID[Sim.cellAt(ox + cx * r, oy + cy * r)]) { r += 0.8; break; } }
      const px = sx(ox + cx * r), py = sy(oy + cy * r);
      if (i === 0) d.moveTo(px, py); else d.lineTo(px, py);
    }
    d.closePath(); d.fill();
    // 自分の周りは少し明るく
    ctx.drawImage(darkCv, 0, 0, Wpx, Hpx);
  }

  // ---------- メイン ----------
  function draw(g, viewer, alpha, dt) {
    if (!cv) return;
    t += dt || 0.016;
    const vx = lerp(viewer.px, viewer.x, alpha), vy = lerp(viewer.py, viewer.y, alpha);
    setCamera(vx, vy);
    ctx.fillStyle = C.solidBase; ctx.fillRect(0, 0, Wpx, Hpx);
    // 床
    const fx = (cam.x - Wpx / 2 / ppm) * ppm, fy = (cam.y - Hpx / 2 / ppm) * ppm;
    ctx.drawImage(floorCv, fx, fy, Wpx, Hpx, 0, 0, Wpx, Hpx);
    drawGroundEffects(g, viewer);
    // 描画対象（壁・キャラ・旗）をy順に
    const x0 = Math.max(0, Math.floor(cam.x - Wpx / 2 / ppm) - 1), x1 = Math.min(W - 1, Math.ceil(cam.x + Wpx / 2 / ppm) + 1);
    const y0 = Math.max(0, Math.floor(cam.y - Hpx / 2 / ppm) - 2), y1 = Math.min(H - 1, Math.ceil(cam.y + Hpx / 2 / ppm) + 1);
    const ents = [];
    for (const p of g.players) {
      if (p.returning > 0 || p.ghost || p.pulseOnly) continue;
      let view = "seen";
      if (p.team !== viewer.team) { view = p.cloth ? "cloth" : Sim.enemyView(viewer, p); if (view === "none") continue; }
      const ix = lerp(p.px, p.x, alpha), iy = lerp(p.py, p.y, alpha);
      ents.push({ y: iy, f: () => drawCharacter(g, p, viewer, view, ix, iy) });
    }
    ents.push({ y: FLAG.y, f: () => drawFlag(g) });
    ents.sort((a, b) => a.y - b.y);
    let ei = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { const c = Sim.grid[y][x]; if (Sim.SOLID[c]) drawWallCell(x, y, c); }
      while (ei < ents.length && ents[ei].y < y + 1) { ents[ei].f(); ei++; }
    }
    while (ei < ents.length) { ents[ei].f(); ei++; }
    drawShots(g, viewer);
    drawDarkness(viewer);
    drawTopEffects(g, viewer);
    drawFootMarks(g, viewer);
  }

  // ---------- ミニマップ ----------
  function drawMinimap(mcv, g, viewer) {
    if (!miniCv) return;
    const m = mcv.getContext("2d");
    const mw = mcv.width, mh = mcv.height, k = mw / W;
    m.clearRect(0, 0, mw, mh);
    m.drawImage(miniCv, 0, 0, mw, mh);
    // 旗
    m.fillStyle = C.brass; m.beginPath(); m.arc(FLAG.x * k, FLAG.y * k, 3.5, 0, 7); m.fill();
    for (const p of g.players) {
      if (p.returning > 0) continue;
      const x = p.x * k, y = p.y * k;
      if (p.team === viewer.team) {
        m.fillStyle = p === viewer ? "#ffffff" : TEAM[p.team].light;
        m.beginPath(); m.arc(x, y, p === viewer ? 3.5 : 2.8, 0, 7); m.fill();
        if (p === viewer) { m.strokeStyle = "#15222B"; m.lineWidth = 1; m.stroke(); }
      } else if (p.reveal > 0) {
        m.fillStyle = C.yellow; m.beginPath(); m.arc(x, y, 3, 0, 7); m.fill();
      } else if (p.lastSeen) {
        m.strokeStyle = C.yellow; m.lineWidth = 1; m.beginPath(); m.arc(p.lastSeen.x * k, p.lastSeen.y * k, 3, 0, 7); m.stroke();
      }
      if (p.pulse) { m.strokeStyle = "#fff"; m.lineWidth = 1; m.beginPath(); m.arc(x, y, 5, 0, 7); m.stroke(); }
    }
  }
  // 作戦画面用：ルートを重ねた地図
  function drawBriefingMap(mcv, team, assignments) {
    if (!miniCv) prerenderMini();
    const m = mcv.getContext("2d");
    const mw = mcv.width, mh = mcv.height, k = mw / W;
    m.clearRect(0, 0, mw, mh);
    m.drawImage(miniCv, 0, 0, mw, mh);
    const colors = { north: "#7fd1a6", center: "#f2d27c", south: "#a9b8c9" };
    for (const [routeId, rt] of Object.entries(D.MAP.routes)) {
      const pts = [[team ? 60 : 4, 24], ...rt.pts.map(p => [team ? W - p[0] : p[0], p[1]]), [FLAG.x, FLAG.y]];
      m.strokeStyle = colors[routeId]; m.lineWidth = 3; m.lineJoin = "round"; m.setLineDash([]);
      m.beginPath(); pts.forEach(([x, y], i) => i ? m.lineTo(x * k, y * k) : m.moveTo(x * k, y * k)); m.stroke();
      const lab = assignments && assignments[routeId];
      if (lab) {
        const mid = pts[Math.floor(pts.length / 2)];
        m.font = "bold 12px 'Yu Gothic UI','Hiragino Sans',sans-serif"; m.textAlign = "center";
        const tw = m.measureText(lab).width + 10;
        m.fillStyle = "rgba(21,34,43,0.9)"; m.fillRect(mid[0] * k - tw / 2, mid[1] * k - 18, tw, 16);
        m.fillStyle = colors[routeId]; m.fillText(lab, mid[0] * k, mid[1] * k - 6);
      }
    }
    m.fillStyle = C.brass; m.beginPath(); m.arc(FLAG.x * k, FLAG.y * k, 5, 0, 7); m.fill();
  }

  return { init, resize, setOptions, loadAssets, draw, drawMinimap, drawBriefingMap, get ppm() { return ppm; }, get cam() { return cam; }, get opts() { return opts; }, sx, sy, get img() { return img; } };
})();
