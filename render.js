// 忍彩かくれんぼ — 描画（見下ろし2D・Canvas）。可視判定は Sim の関数を使い、見えない敵は描かない
const Render = (() => {
  const S = Sim, R = Sim.R, D = Sim.D;
  let W = Sim.W, H = Sim.H, FLAG = Sim.FLAG;      // 試合ごとの地図（syncMap で結び直す）
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
    // 城ダンジョン
    water: "#2f5a74", waterLine: "#5d93b5", plank: "#5a4632", plankLine: "#6f583f", crawl: "#2a2824", crawlBeam: "#4a3a2b", mechTrack: "#6a5a44",
    stair: "#4b4436", stairLine: "#6d6450", door: "#7a5636", doorDark: "#4a3322", window: "#56626e",
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
    if (floorPpm !== ppm) floorCv = null;          // 次の描画（syncMap）で描き直す
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

  // ---------- 地図（試合ごと）・いまの階 ----------
  // 城ダンジョンは全階を1枚の地図に横並びで持つ（castle.js）。描くのは見ている人の階だけ
  let mapRef = null, mapVer = -1, curFloor = null;
  const mapOf = g => (g && g.map) || Sim.LEGACY;
  const isCastle = () => !!(mapRef && mapRef.kind === "castle");
  function floorRectOf(m, x, y) {
    if (!m || !m.floors) return { id: "1F", ox: 0, oy: 0, w: W, h: H, index: 0 };
    const fi = Sim.floorAt(x, y);
    return m.floors[fi === 255 || fi == null ? 0 : fi] || m.floors[0];
  }
  const sameFloor = (a, b) => !isCastle() || Sim.floorAt(a.x, a.y) === Sim.floorAt(b.x, b.y);
  // 描く前に、試合の地図を Sim に結び直して、階が変わったら床を描き直す
  function syncMap(g, viewer) {
    if (g) { Sim.bindMap(g); if (Sim.bindDyn && g.dyn) Sim.bindDyn(g); }
    const m = mapOf(g);
    W = Sim.W; H = Sim.H; FLAG = Sim.FLAG;
    const fr = floorRectOf(m, viewer ? viewer.x : FLAG.x, viewer ? viewer.y : FLAG.y);
    if (m !== mapRef || m.version !== mapVer || !curFloor || fr.id !== curFloor.id || floorPpm !== ppm || !floorCv) {
      if (m !== mapRef) { miniCache.clear(); objMax.clear(); }
      if (m.version !== mapVer) miniCache.clear();
      mapRef = m; mapVer = m.version; curFloor = fr;
      prerenderFloor();
    }
  }
  // 旗の情報（見ている人のチーム）。固定マップはいつも分かっている
  function intelOf(g, team) {
    if (!isCastle()) return { known: true, floorKnown: true, candidates: [] };
    return (g && g.intel && g.intel[team]) || { known: false, floorKnown: false, candidates: [] };
  }
  const portalOf = (x, y) => (mapRef && mapRef.portalAt) ? mapRef.portalAt.get(y * W + x) : null;
  const trapOf = (x, y) => (mapRef && mapRef.trapAt) ? mapRef.trapAt.get(y * W + x) : null;
  const pushOf = (x, y) => (mapRef && mapRef.pushes) ? mapRef.pushes.find(pw => pw.cells.some(([cx, cy]) => cx === x && cy === y)) : null;
  const floorLabel = id => (typeof Castle !== "undefined" && Castle.FLOOR_LABEL[id]) || id;

  // ---------- 床の事前描画（いまの階だけ） ----------
  function groundCell(f, c, x, y, px, py, rnd) {
    const s = ppm;
    let base = C.ground;
    if (c === "b") base = C.b; else if (c === "s") base = C.s; else if (c === "w") base = C.w; else if (c === "~") base = C.sand;
    else if (c === "B") base = C.B; else if (c === "O") base = C.O; else if (c === "=" || c === "c") base = C.water; else if (c === "q" || c === "y") base = C.plank;
    else if (c === "u") base = C.crawl; else if ((x + y) % 2) base = C.ground2;
    f.fillStyle = base; f.fillRect(px, py, s + 1, s + 1);
    if (c === "b") { f.fillStyle = C.bLine; for (let i = 0; i < 3; i++) f.fillRect(px + s * (0.15 + i * 0.33), py, Math.max(1, s * 0.09), s + 1); }
    else if (c === "s") { f.fillStyle = C.sDot; for (let i = 0; i < 4; i++) { const r = s * 0.09; f.beginPath(); f.arc(px + s * (0.22 + (i % 2) * 0.5) + (rnd() - 0.5) * s * 0.15, py + s * (0.25 + ((i / 2) | 0) * 0.5), r, 0, 7); f.fill(); } }
    else if (c === "w") { f.fillStyle = C.wLine; for (let i = 0; i < 3; i++) f.fillRect(px, py + s * (0.18 + i * 0.32), s + 1, Math.max(1, s * 0.07)); }
    else if (c === "~") { f.fillStyle = C.sandDot; for (let i = 0; i < 5; i++) f.fillRect(px + rnd() * s, py + rnd() * s, 1.5, 1.5); }
    else if (c === "." && rnd() < 0.25) { f.fillStyle = "rgba(255,255,255,0.03)"; f.fillRect(px + rnd() * s, py + rnd() * s, 2, 2); }
    else if (c === "=") { f.strokeStyle = C.waterLine; f.lineWidth = 1; for (let i = 0; i < 2; i++) { const yy = py + s * (0.3 + i * 0.4); f.beginPath(); f.moveTo(px + s * 0.1, yy); f.quadraticCurveTo(px + s * 0.3, yy - s * 0.08, px + s * 0.5, yy); f.quadraticCurveTo(px + s * 0.7, yy + s * 0.08, px + s * 0.9, yy); f.stroke(); } }
    else if (c === "q") { f.fillStyle = C.plankLine; for (let i = 1; i < 4; i++) f.fillRect(px, py + s * i / 4, s + 1, 1); }
    else if (c === "u") { f.fillStyle = C.crawlBeam; f.fillRect(px, py + s * 0.12, s + 1, s * 0.12); f.fillRect(px, py + s * 0.76, s + 1, s * 0.12); f.fillStyle = "rgba(0,0,0,0.25)"; f.fillRect(px, py + s * 0.24, s + 1, s * 0.52); }
    else if (c === "y") { f.strokeStyle = C.plankLine; f.lineWidth = 1.5; f.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3); f.beginPath(); f.moveTo(px + 2, py + 2); f.lineTo(px + s - 2, py + s - 2); f.moveTo(px + s - 2, py + 2); f.lineTo(px + 2, py + s - 2); f.stroke(); }
    else if (c === "m") { f.fillStyle = C.mechTrack; f.fillRect(px + s * 0.1, py + s * 0.42, s * 0.8, s * 0.16); }
  }
  // 階段・降下・祠・スイッチ・罠（予告つき）の絵
  function markCell(f, c, x, y, px, py) {
    const s = ppm, cx = px + s / 2, cy = py + s / 2;
    if (c === "^" || c === "v") {
      f.fillStyle = C.stair; f.fillRect(px, py, s + 1, s + 1);
      f.fillStyle = C.stairLine; for (let i = 0; i < 4; i++) f.fillRect(px + s * 0.08, py + s * (0.12 + i * 0.22), s * 0.84, Math.max(1.5, s * 0.07));
      f.fillStyle = c === "^" ? "#f2e6c4" : "#9fd3ff"; f.beginPath();
      if (c === "^") { f.moveTo(cx, py + s * 0.12); f.lineTo(cx + s * 0.28, py + s * 0.5); f.lineTo(cx - s * 0.28, py + s * 0.5); }
      else { f.moveTo(cx, py + s * 0.88); f.lineTo(cx + s * 0.28, py + s * 0.5); f.lineTo(cx - s * 0.28, py + s * 0.5); }
      f.closePath(); f.fill();
    } else if (c === "z") {
      f.fillStyle = "#0b0f14"; f.beginPath(); f.ellipse(cx, cy, s * 0.42, s * 0.36, 0, 0, 7); f.fill();
      f.strokeStyle = "#8a6e52"; f.lineWidth = 2; f.stroke();
      f.fillStyle = "#9fd3ff"; f.beginPath(); f.moveTo(cx, cy + s * 0.28); f.lineTo(cx + s * 0.16, cy + s * 0.02); f.lineTo(cx - s * 0.16, cy + s * 0.02); f.closePath(); f.fill();
    } else if (c === "H") {
      f.fillStyle = "#c8452f"; f.fillRect(px + s * 0.18, py + s * 0.2, s * 0.64, s * 0.1); f.fillRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.08);
      f.fillRect(px + s * 0.26, py + s * 0.2, s * 0.08, s * 0.6); f.fillRect(px + s * 0.66, py + s * 0.2, s * 0.08, s * 0.6);
      f.fillStyle = "rgba(143,242,164,0.35)"; f.beginPath(); f.arc(cx, cy + s * 0.12, s * 0.18, 0, 7); f.fill();
    } else if (c === "S") {
      f.fillStyle = "#3a3024"; f.fillRect(px + s * 0.25, py + s * 0.55, s * 0.5, s * 0.25);
      f.strokeStyle = C.brass; f.lineWidth = Math.max(2, s * 0.08); f.beginPath(); f.moveTo(cx, py + s * 0.62); f.lineTo(cx + s * 0.22, py + s * 0.2); f.stroke();
      f.fillStyle = C.brass; f.beginPath(); f.arc(cx + s * 0.22, py + s * 0.2, s * 0.09, 0, 7); f.fill();
    } else if (c === "n") {           // 鳴子：縄と鈴
      f.strokeStyle = "#c9b17d"; f.lineWidth = 1.5; f.beginPath(); f.moveTo(px, cy); f.lineTo(px + s, cy); f.stroke();
      f.fillStyle = "#e8c65a"; for (let i = 0; i < 3; i++) { f.beginPath(); f.arc(px + s * (0.2 + i * 0.3), cy + s * 0.08, s * 0.08, 0, 7); f.fill(); }
    } else if (c === "c") {           // 急流：流れる向きの矢
      const tr = trapOf(x, y), d = tr && tr.dir ? tr.dir : [1, 0];
      f.save(); f.translate(cx, cy); f.rotate(Math.atan2(d[1], d[0]));
      f.strokeStyle = "#dff4ff"; f.lineWidth = Math.max(1.5, s * 0.07);
      for (let i = -1; i <= 1; i++) { f.beginPath(); f.moveTo(-s * 0.1 + i * s * 0.28, -s * 0.18); f.lineTo(s * 0.08 + i * s * 0.28, 0); f.lineTo(-s * 0.1 + i * s * 0.28, s * 0.18); f.stroke(); }
      f.restore();
    } else if (c === "f") {           // 火鉢
      f.fillStyle = "rgba(255,140,60,0.25)"; f.beginPath(); f.arc(cx, cy, s * 0.48, 0, 7); f.fill();
      f.fillStyle = "#4a3a2b"; f.beginPath(); f.ellipse(cx, cy + s * 0.12, s * 0.3, s * 0.18, 0, 0, 7); f.fill();
      f.fillStyle = "#ff9a3c"; f.beginPath(); f.moveTo(cx, cy - s * 0.3); f.quadraticCurveTo(cx + s * 0.2, cy, cx, cy + s * 0.08); f.quadraticCurveTo(cx - s * 0.2, cy, cx, cy - s * 0.3); f.fill();
    } else if (c === "l") {           // 幻灯：提灯
      f.fillStyle = "rgba(255,220,150,0.18)"; f.beginPath(); f.arc(cx, cy, s * 0.46, 0, 7); f.fill();
      f.fillStyle = "#f0dcae"; f.beginPath(); f.ellipse(cx, cy, s * 0.2, s * 0.28, 0, 0, 7); f.fill();
      f.strokeStyle = "#c8452f"; f.lineWidth = 1; for (let i = -1; i <= 1; i++) { f.beginPath(); f.moveTo(cx - s * 0.2, cy + i * s * 0.1); f.lineTo(cx + s * 0.2, cy + i * s * 0.1); f.stroke(); }
    } else if (c === "p") {           // 押し壁：黄黒の予告帯＋押す向き
      f.save(); f.beginPath(); f.rect(px, py, s + 1, s + 1); f.clip();
      f.fillStyle = "rgba(230,190,60,0.55)"; f.fillRect(px, py, s + 1, s + 1);
      f.fillStyle = "rgba(20,20,20,0.55)"; for (let i = -2; i < 4; i++) { f.beginPath(); f.moveTo(px + i * s * 0.4, py + s); f.lineTo(px + i * s * 0.4 + s * 0.2, py + s); f.lineTo(px + i * s * 0.4 + s * 0.6, py); f.lineTo(px + i * s * 0.4 + s * 0.4, py); f.closePath(); f.fill(); }
      f.restore();
      const pw = pushOf(x, y);
      if (pw) { f.fillStyle = "#fff"; f.beginPath(); const an = Math.atan2(pw.dy, pw.dx); f.moveTo(cx + Math.cos(an) * s * 0.34, cy + Math.sin(an) * s * 0.34); f.lineTo(cx + Math.cos(an + 2.5) * s * 0.26, cy + Math.sin(an + 2.5) * s * 0.26); f.lineTo(cx + Math.cos(an - 2.5) * s * 0.26, cy + Math.sin(an - 2.5) * s * 0.26); f.closePath(); f.fill(); }
    }
  }
  function prerenderFloor() {
    floorPpm = ppm;
    W = Sim.W; H = Sim.H; FLAG = Sim.FLAG;
    if (!curFloor || mapRef !== Sim.map) { mapRef = Sim.map; mapVer = mapRef.version; curFloor = floorRectOf(mapRef, FLAG.x, FLAG.y); }
    const fr = curFloor;
    floorCv = document.createElement("canvas");
    floorCv.width = Math.ceil(fr.w * ppm); floorCv.height = Math.ceil(fr.h * ppm);
    const f = floorCv.getContext("2d");
    let seed = 7 + (fr.index || 0) * 131;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const DOORS = { L: 1, M: 1, x: 1 };      // 扉・窓の下は床（開いたとき・窓越しに床が見える）
    for (let y = fr.oy; y < fr.oy + fr.h; y++) for (let x = fr.ox; x < fr.ox + fr.w; x++) {
      const c = Sim.grid[y][x];
      const px = (x - fr.ox) * ppm, py = (y - fr.oy) * ppm;
      if (Sim.SOLID[c] && !DOORS[c]) { f.fillStyle = C.solidBase; f.fillRect(px, py, ppm + 1, ppm + 1); continue; }
      groundCell(f, DOORS[c] || (c === "~" && isCastle()) ? "." : c, x, y, px, py, rnd);
      markCell(f, c, x, y, px, py);
    }
    // 旗の取得範囲の輪は、固定マップだけ床に描く（城は旗が見えたときに毎フレーム描く）
    if (!isCastle()) {
      f.strokeStyle = C.brass; f.lineWidth = Math.max(1.5, ppm * 0.08);
      f.beginPath(); f.arc((FLAG.x - fr.ox) * ppm, (FLAG.y - fr.oy) * ppm, R.flagRadius * ppm, 0, 7); f.stroke();
      f.strokeStyle = "rgba(199,165,91,0.25)"; f.setLineDash([4, 6]);
      f.beginPath(); f.arc((FLAG.x - fr.ox) * ppm, (FLAG.y - fr.oy) * ppm, R.flagNoCamo * ppm, 0, 7); f.stroke(); f.setLineDash([]);
    }
  }
  // ミニマップ用の小さな階の絵（階ごとにキャッシュ）
  const miniCache = new Map();
  function miniFor(fr) {
    const key = fr.id + ":" + (mapRef ? mapRef.version : 0);
    if (miniCache.has(key)) return miniCache.get(key);
    const cvs = document.createElement("canvas");
    const s = 3; cvs.width = fr.w * s; cvs.height = fr.h * s;
    const m = cvs.getContext("2d");
    for (let y = fr.oy; y < fr.oy + fr.h; y++) for (let x = fr.ox; x < fr.ox + fr.w; x++) {
      const c = Sim.grid[y][x];
      let col = "#3a4653";
      if (c === "." || c === "m" || c === "S" || c === "n" || c === "l" || c === "f" || c === "p") col = "#6c7784"; else if (c === "b") col = "#5c8a6b"; else if (c === "s") col = "#8a9199"; else if (c === "w") col = "#8a6e52";
      else if (c === "~") col = isCastle() ? "#6c7784" : "#c9b17d"; else if (c === "B") col = "#3C83BA"; else if (c === "O") col = "#D87932"; else if (c === "t") col = "#2d4a38"; else if (c === "r") col = "#4a5159";
      else if (c === "=" || c === "c") col = "#4f86a8"; else if (c === "q" || c === "y") col = "#8a7458"; else if (c === "u") col = "#4d4a44"; else if (c === "H") col = "#c8452f";
      else if (c === "^") col = "#f2e6c4"; else if (c === "v" || c === "z") col = "#9fd3ff"; else if (c === "L") col = "#b08a3a"; else if (c === "M") col = "#6a5a44"; else if (c === "x") col = "#56626e";
      m.fillStyle = col; m.fillRect((x - fr.ox) * s, (y - fr.oy) * s, s, s);
    }
    miniCache.set(key, cvs);
    if (miniCache.size > 24) miniCache.delete(miniCache.keys().next().value);
    return cvs;
  }
  function prerenderMini() { if (curFloor) miniFor(curFloor); }

  // ---------- 座標 ----------
  const sx = x => (x - cam.x) * ppm + Wpx / 2;
  const sy = y => (y - cam.y) * ppm + Hpx / 2;
  function setCamera(x, y) {
    const halfW = Wpx / 2 / ppm, halfH = Hpx / 2 / ppm;
    const fr = curFloor || { ox: 0, oy: 0, w: W, h: H };
    cam.x = halfW * 2 >= fr.w ? fr.ox + fr.w / 2 : Math.max(fr.ox + halfW, Math.min(fr.ox + fr.w - halfW, x));
    // 上端は2マスぶん余白を許す（一番上の部屋でも頭・名前が切れない）
    cam.y = halfH * 2 >= fr.h + 2 ? fr.oy + fr.h / 2 - 1 : Math.max(fr.oy - 2 + halfH, Math.min(fr.oy + fr.h - halfH, y));
  }
  const lerp = (a, b, k) => a + (b - a) * k;

  // ---------- 状態の読み取り（オフライン＝Simの生オブジェクト／オンライン＝スナップショット。両方の形を受ける） ----------
  const chanKind = p => (p.sk && p.sk.channel) ? p.sk.channel.kind : (typeof p.channel === "string" ? p.channel : null);
  const hasMod = (p, k) => !!((p.mods && p.mods.some(m => m.k === k)) || (p.modKeys && p.modKeys.includes(k)));
  const modOf = (p, k) => (p.mods && p.mods.find(m => m.k === k)) || null;
  const ultOn = p => !!((p.ult && p.ult.active > 0) || p.ultActive > 0);
  const objsOf = g => g.objects || [];
  const teamCol = (team, light) => { const c = TEAM[team]; return c ? (light ? c.light : c.color) : "#cfd6dd"; };
  const CHANNEL_LABEL = { hawk_eye: "俯瞰", snipe: "狙い", tempo: "舞", parry: "構え", counter_stance: "構え", dash: "閃光", smash: "振り", zone_null_setup: "封印", leap: "雷" };
  // 効果が見えるか（味方の効果は常に・敵の効果は視界内で射線が通るとき）
  const effVisible = (viewer, e) => e.team === viewer.team || (Sim.dist(viewer, e) <= (Sim.viewRangeOf ? Sim.viewRangeOf(viewer) : R.viewRange) && Sim.lineClear(viewer.x, viewer.y, e.x, e.y));
  // 設置物の初期寿命（予告円の縮みに使う。id ごとに最初に見た life を覚える）
  const objMax = new Map();
  function objLifeK(o) {
    let m = objMax.get(o.id);
    if (m == null || o.life > m) { if (objMax.size > 400) objMax.clear(); m = o.life; objMax.set(o.id, m); }
    return m > 0 ? Math.max(0, Math.min(1, 1 - o.life / m)) : 1;
  }
  const fadeOf = o => o.life < 0.5 ? Math.max(0.1, o.life / 0.5) : 1;
  // 設置物が見えるか（Sim.snapshot の objVisible と同じ考え方。オンラインはサーバーが先に絞っている）
  function objVisible(viewer, o) {
    if (o.team === viewer.team) return true;
    if (o.kind === "track") return false;
    const d = Math.hypot(viewer.x - o.x, viewer.y - o.y);
    if (o.kind === "decoy_static") return d <= R.viewRange && Sim.lineClear(viewer.x, viewer.y, o.x, o.y);
    if (o.kind === "zone_dark" || o.kind === "zone_fog") return d <= R.viewRange + (o.r || 2);
    if (o.kind === "wall") {   // 壁自身が射線を切らないよう、手前0.4mまでで判定
      if (d > R.viewRange + 2) return false;
      const k = Math.max(0, 1 - 0.4 / Math.max(0.01, d));
      return Sim.lineClear(viewer.x, viewer.y, viewer.x + (o.x - viewer.x) * k, viewer.y + (o.y - viewer.y) * k);
    }
    return d <= R.viewRange + (o.r || 2) && Sim.lineClear(viewer.x, viewer.y, o.x, o.y);
  }
  // 技名（skill 効果の owner → そのキャラの固有技名。引けなければ「技」）
  function skillNameOf(g, e) {
    const p = e.owner != null && g.players.find(q => q.id === e.owner);
    const c = p && p.char != null && D.CHARS[p.char];
    return c && c.skill && c.skill.name ? c.skill.name : "技";
  }
  // 手当に要する秒数（1.5m以内の味方に護Lv4がいれば短い）
  function healNeed(g, p) {
    const fast = g.players.some(h => h !== p && h.team === p.team && h.returning <= 0 && h.exposed <= 0 && h.perks && h.perks[4] === "護" && Math.hypot(h.x - p.x, h.y - p.y) <= R.hp.healRange);
    return fast ? R.hp.healSecFast : R.hp.healSec;
  }
  // 位置ごとに固定の乱数（粒の配置に使う。毎フレーム同じ値）
  function pseudo(i, s) { const v = Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453; return v - Math.floor(v); }

  // ---------- 設置物の描画（地面層＝床の上／上層＝キャラと同じ並び替え／霧・暗幕＝キャラの上） ----------
  let lastTick = -1;
  function drawPatternCells(x0w, y0w, x1w, y1w, pattern) {
    // 描景（paint_zone）：床の事前描画と同じ色・同じ線を、世界座標のセルに揃えて塗る
    const px0 = sx(x0w), py0 = sy(y0w), pw = (x1w - x0w) * ppm, ph = (y1w - y0w) * ppm;
    ctx.save(); ctx.beginPath(); ctx.rect(px0, py0, pw, ph); ctx.clip();
    ctx.fillStyle = pattern === "b" ? C.b : pattern === "s" ? C.s : C.w; ctx.fillRect(px0, py0, pw, ph);
    for (let cy = Math.floor(y0w); cy < Math.ceil(y1w); cy++) for (let cx = Math.floor(x0w); cx < Math.ceil(x1w); cx++) {
      const px = sx(cx), py = sy(cy);
      if (pattern === "b") { ctx.fillStyle = C.bLine; for (let i = 0; i < 3; i++) ctx.fillRect(px + ppm * (0.15 + i * 0.33), py, Math.max(1, ppm * 0.09), ppm + 1); }
      else if (pattern === "s") { ctx.fillStyle = C.sDot; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(px + ppm * (0.22 + (i % 2) * 0.5), py + ppm * (0.25 + ((i / 2) | 0) * 0.5), ppm * 0.09, 0, 7); ctx.fill(); } }
      else { ctx.fillStyle = C.wLine; for (let i = 0; i < 3; i++) ctx.fillRect(px, py + ppm * (0.18 + i * 0.32), ppm + 1, Math.max(1, ppm * 0.07)); }
    }
    ctx.restore();
  }
  function drawGroundObjects(g, viewer) {
    if (g.tick < lastTick) objMax.clear();      // 新しい試合（IDが振り直される）
    lastTick = g.tick || 0;
    for (const o of objsOf(g)) {
      if (o.dead || !objVisible(viewer, o)) continue;
      const a = fadeOf(o), ally = o.team === viewer.team, col = teamCol(o.team), lcol = teamCol(o.team, true);
      const x = sx(o.x), y = sy(o.y), r = (o.r || 0) * ppm;
      ctx.save(); ctx.globalAlpha = a;
      switch (o.kind) {
        case "wall":       // 予告線（設置前0.7秒）。立った壁は上層で描く
          if (o.pending) { ctx.strokeStyle = lcol; ctx.lineWidth = Math.max(2, ppm * 0.12); ctx.setLineDash([ppm * 0.3, ppm * 0.2]); ctx.lineDashOffset = -t * ppm; ctx.beginPath(); ctx.moveTo(sx(o.ax), sy(o.ay)); ctx.lineTo(sx(o.bx), sy(o.by)); ctx.stroke(); }
          break;
        case "zone_water": {
          ctx.fillStyle = "rgba(72,150,225,0.30)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(170,215,255,0.85)"; ctx.lineWidth = 1.5; ctx.stroke();
          if (!reduceMotion()) for (let i = 0; i < 3; i++) { const k = (t * 0.45 + i / 3) % 1; ctx.globalAlpha = a * (1 - k) * 0.7; ctx.beginPath(); ctx.arc(x, y, r * k, 0, 7); ctx.stroke(); }
          break;
        }
        case "zone_fog": ctx.fillStyle = "rgba(150,90,210,0.22)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); break;
        case "zone_dark": ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); break;
        case "zone_null": {
          ctx.fillStyle = "rgba(140,140,150,0.28)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(210,210,220,0.8)"; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
          drawLabel(x, y + ppm * 0.45, "封", "#e4e6ea", ppm * 0.9);
          break;
        }
        case "zone_petals": {
          ctx.fillStyle = "rgba(245,170,200,0.12)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          ctx.fillStyle = "#f7b8d0";
          for (let i = 0; i < 16; i++) {
            const ph = (pseudo(i, o.id) + t * 0.12 * (0.6 + pseudo(i + 50, o.id))) % 1, an = pseudo(i + 100, o.id) * 6.283 + t * 0.4, rr = r * (0.15 + ph * 0.85);
            ctx.save(); ctx.translate(x + Math.cos(an) * rr, y + Math.sin(an) * rr); ctx.rotate(an + t * 3); ctx.beginPath(); ctx.ellipse(0, 0, ppm * 0.12, ppm * 0.07, 0, 0, 7); ctx.fill(); ctx.restore();
          }
          break;
        }
        case "halo": {
          const k = objLifeK(o);
          ctx.globalAlpha = a * (1 - k); ctx.strokeStyle = "rgba(255,240,190,0.9)"; ctx.lineWidth = Math.max(2, ppm * 0.1);
          ctx.beginPath(); ctx.arc(x, y, r * (0.4 + 0.6 * k), 0, 7); ctx.stroke(); ctx.fillStyle = "rgba(255,240,190,0.15)"; ctx.fill();
          break;
        }
        case "paint_zone": {
          drawPatternCells(o.x - o.half, o.y - o.half, o.x + o.half, o.y + o.half, o.pattern);
          ctx.strokeStyle = ally ? lcol : "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.setLineDash(ally ? [4, 4] : []); ctx.globalAlpha = a * (ally ? 0.7 : 1);
          ctx.strokeRect(sx(o.x - o.half), sy(o.y - o.half), o.half * 2 * ppm, o.half * 2 * ppm);
          break;
        }
        case "thorns": {
          const ax = sx(o.ax), ay = sy(o.ay), bx = sx(o.bx), by = sy(o.by), dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          ctx.strokeStyle = "#2f5a36"; ctx.lineWidth = Math.max(2, ppm * 0.16); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.strokeStyle = "#8fc27a"; ctx.lineWidth = 1.5; ctx.beginPath();
          const n = Math.max(3, Math.round(L / (ppm * 0.45)));
          for (let i = 0; i <= n; i++) { const k = i / n, px = ax + dx * k, py = ay + dy * k, s = (i % 2 ? 1 : -1) * ppm * 0.3; ctx.moveTo(px, py); ctx.lineTo(px + nx * s + dx / L * ppm * 0.1, py + ny * s + dy / L * ppm * 0.1); }
          ctx.stroke();
          break;
        }
        case "trail": {
          const ax = sx(o.ax), ay = sy(o.ay), bx = sx(o.bx), by = sy(o.by), fl = reduceMotion() ? 0 : Math.sin(t * 18 + o.id) * 0.15;
          ctx.lineCap = "round";
          ctx.strokeStyle = "rgba(255,110,40,0.45)"; ctx.lineWidth = ppm * (0.7 + fl); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.strokeStyle = "rgba(255,200,90,0.9)"; ctx.lineWidth = ppm * (0.28 + fl * 0.5); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.fillStyle = "#ffd36a";
          const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / (ppm * 0.6)));
          for (let i = 0; i <= n; i++) { const k = i / n, px = ax + (bx - ax) * k, py = ay + (by - ay) * k, h = ppm * (0.25 + 0.2 * Math.abs(Math.sin(t * 10 + i * 1.7))); ctx.beginPath(); ctx.moveTo(px - ppm * 0.1, py); ctx.lineTo(px, py - h); ctx.lineTo(px + ppm * 0.1, py); ctx.closePath(); ctx.fill(); }
          break;
        }
        case "arrow": {
          ctx.translate(x, y); ctx.rotate(o.angle || 0); const s = (o.r || 0.7) * ppm;
          ctx.fillStyle = ally ? lcol : col; ctx.globalAlpha = a * 0.75;
          ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.4, s * 0.6); ctx.lineTo(-s * 0.1, 0); ctx.lineTo(-s * 0.4, -s * 0.6); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.stroke();
          break;
        }
        case "freeze_bomb": case "bomb": {
          const k = objLifeK(o), ice = o.kind === "freeze_bomb", cc = ice ? "#9fdcff" : "#ffb070";
          ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = ice ? "rgba(160,220,255,0.28)" : "rgba(255,150,80,0.28)"; ctx.beginPath(); ctx.arc(x, y, r * Math.max(0, 1 - k), 0, 7); ctx.fill();
          ctx.fillStyle = ice ? "#cfeeff" : "#3a2a22"; ctx.beginPath(); ctx.arc(x, y - ppm * 0.15, ppm * 0.22, 0, 7); ctx.fill();
          ctx.strokeStyle = "#e8d9b0"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - ppm * 0.35); ctx.quadraticCurveTo(x + ppm * 0.2, y - ppm * 0.6, x + ppm * 0.1, y - ppm * 0.75); ctx.stroke();
          if (!reduceMotion()) { ctx.fillStyle = "#fff3a0"; ctx.beginPath(); ctx.arc(x + ppm * 0.1 + Math.sin(t * 40) * 2, y - ppm * 0.75 + Math.cos(t * 37) * 2, 2.2, 0, 7); ctx.fill(); }
          break;
        }
        case "snake": {
          ctx.translate(x, y); ctx.rotate(o.angle || 0); const L = ppm * 0.9;
          ctx.strokeStyle = "#e9eef2"; ctx.lineWidth = Math.max(2, ppm * 0.12); ctx.lineCap = "round"; ctx.beginPath();
          for (let i = 0; i <= 8; i++) { const k = i / 8, px = -L * k, py = Math.sin(k * 9 + t * 12) * ppm * 0.12; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.stroke();
          ctx.fillStyle = "#e9eef2"; ctx.beginPath(); ctx.arc(ppm * 0.05, 0, ppm * 0.1, 0, 7); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ppm * 0.08, -ppm * 0.03, 1.5, 0, 7); ctx.fill();
          break;
        }
        case "track": {        // 白狐の足跡（自チームにだけ・2秒前の位置）
          if (!ally || !o.mark) break;
          const mx = sx(o.mark.x), my = sy(o.mark.y), pulse = 0.6 + 0.4 * Math.abs(Math.sin(t * 3));
          ctx.globalAlpha = a * pulse; ctx.strokeStyle = lcol; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(mx, my, ppm * 0.55, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = lcol;
          for (const [ox, oy, rot] of [[-0.16, 0.08, -0.3], [0.16, -0.1, 0.3]]) { ctx.save(); ctx.translate(mx + ox * ppm, my + oy * ppm); ctx.rotate(rot); ctx.beginPath(); ctx.ellipse(0, 0, ppm * 0.09, ppm * 0.16, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -ppm * 0.2, ppm * 0.07, ppm * 0.05, 0, 0, 7); ctx.fill(); ctx.restore(); }
          drawLabel(mx, my - ppm * 0.65, "足跡", lcol, ppm * 0.34);
          break;
        }
        case "gate": {
          const rr = r || ppm * 0.8;
          const hole = (hx, hy) => {
            const gr = ctx.createRadialGradient(hx, hy, 0, hx, hy, rr); gr.addColorStop(0, "rgba(5,3,12,0.95)"); gr.addColorStop(0.7, "rgba(40,20,70,0.85)"); gr.addColorStop(1, "rgba(120,80,190,0)");
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(hx, hy, rr, 0, 7); ctx.fill();
            ctx.strokeStyle = "rgba(170,120,255,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath();
            for (let i = 0; i < 40; i++) { const k = i / 40, an = k * 9 + t * 2, rd = rr * 0.8 * (1 - k), px = hx + Math.cos(an) * rd, py = hy + Math.sin(an) * rd; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
            ctx.stroke();
          };
          hole(x, y);
          if (o.exit) { const ex = sx(o.exit.x), ey = sy(o.exit.y); hole(ex, ey); ctx.strokeStyle = "rgba(170,120,255,0.5)"; ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]); if (ally) drawLabel(ex, ey - ppm * 0.9, "出口", "#d9c8ff", ppm * 0.34); }
          if (ally) drawLabel(x, y - ppm * 0.9, o.exit ? "入口" : "影穴", "#d9c8ff", ppm * 0.34);
          break;
        }
        default: break;
      }
      ctx.restore();
    }
  }
  // 金剛壁（立った状態・上層）
  function drawWallObject(o) {
    const ax = sx(o.ax), ay = sy(o.ay), bx = sx(o.bx), by = sy(o.by), h = ppm * 0.95, a = fadeOf(o);
    ctx.save(); ctx.globalAlpha = a; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = ppm * 0.5; ctx.beginPath(); ctx.moveTo(ax, ay + ppm * 0.12); ctx.lineTo(bx, by + ppm * 0.12); ctx.stroke();
    ctx.fillStyle = "#4d5a67"; ctx.strokeStyle = "#4d5a67"; ctx.lineWidth = ppm * 0.34;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(bx, by - h); ctx.lineTo(ax, ay - h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#b9c5d1"; ctx.lineWidth = Math.max(2, ppm * 0.16); ctx.beginPath(); ctx.moveTo(ax, ay - h); ctx.lineTo(bx, by - h); ctx.stroke();
    ctx.strokeStyle = "#2b333c"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay - h * 0.5); ctx.lineTo(bx, by - h * 0.5); ctx.stroke();
    ctx.fillStyle = teamCol(o.team, true);
    for (let i = 0; i < 4; i++) { const k = (i + 0.5) / 4; ctx.beginPath(); ctx.arc(ax + (bx - ax) * k, ay + (by - ay) * k - h * 0.5, Math.max(1.5, ppm * 0.06), 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // 分身（走り影・猫化け・連拳）：そのキャラのスプライト。敵から見た静止分身は布だけ
  function drawDecoy(g, o, viewer) {
    const ally = o.team === viewer.team, a = fadeOf(o);
    const x = sx(o.x), y = sy(o.y), hVis = ppm * 1.75;
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.42, ppm * 0.16, 0, 0, 7); ctx.fill(); ctx.restore();
    if (o.kind === "decoy_static" && (o.camo === 2 || !ally)) { drawCloth(o.x, o.y, o.pattern || "b", a, false, 1); if (!ally) return; }
    else if (o.kind === "decoy_static") drawCloth(o.x, o.y, o.pattern || "b", a * 0.55, false, 1);
    if (o.char == null || !D.CHARS[o.char]) return;
    const spr = spriteFor({ char: o.char, angle: o.angle != null ? o.angle : (o.team ? Math.PI : 0), crouch: false, emote: null });
    ctx.save(); ctx.globalAlpha = a * (ally ? 0.5 : 1);
    if (spr.im && assetsReady) {
      const im = spr.im, w = hVis * im.width / im.height;
      const bob = (o.kind === "decoy_run" && !reduceMotion()) ? Math.abs(Math.sin(t * 11)) * ppm * 0.07 : 0;
      ctx.translate(x, y - bob); if (spr.flip) ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -hVis, w, hVis);
    } else { ctx.fillStyle = D.CHARS[o.char].color; ctx.fillRect(x - ppm * 0.3, y - hVis, ppm * 0.6, hVis); }
    ctx.restore();
    if (!ally && o.kind !== "decoy_static") drawBadge(x + ppm * 0.42, y - hVis * 0.62, o.team, a);
    if (ally) drawLabel(x, y - hVis - ppm * 0.15, "影", teamCol(o.team, true), ppm * 0.4);
  }
  // 狐火（触れると発見される・上層）
  function drawFoxFire(o) {
    const x = sx(o.x), y = sy(o.y), a = fadeOf(o), fl = reduceMotion() ? 0 : Math.sin(t * 14 + (o.id || 0) * 1.7) * 0.12;
    ctx.save(); ctx.globalAlpha = a;
    const gr = ctx.createRadialGradient(x, y - ppm * 0.3, 0, x, y - ppm * 0.3, ppm * 1.1); gr.addColorStop(0, "rgba(255,170,70,0.35)"); gr.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y - ppm * 0.3, ppm * 1.1, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.3, ppm * 0.12, 0, 0, 7); ctx.fill();
    const flame = (h, wd, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - ppm * h); ctx.quadraticCurveTo(x + ppm * wd, y - ppm * h * 0.35, x, y); ctx.quadraticCurveTo(x - ppm * wd, y - ppm * h * 0.35, x, y - ppm * h); ctx.fill(); };
    flame(0.95 + fl, 0.42, "#ff9a3c"); flame(0.6 + fl * 0.6, 0.24, "#ffe08a");
    ctx.strokeStyle = teamCol(o.team, true); ctx.lineWidth = 1.5; ctx.globalAlpha = a * 0.7; ctx.beginPath(); ctx.ellipse(x, y, ppm * 0.45, ppm * 0.18, 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
  // 霧（紫のもや）と暗幕（黒い球）はキャラの上に重ねる
  function drawTopZones(g, viewer) {
    for (const o of objsOf(g)) {
      if (o.dead || (o.kind !== "zone_fog" && o.kind !== "zone_dark") || !objVisible(viewer, o)) continue;
      const a = fadeOf(o), x = sx(o.x), y = sy(o.y), r = (o.r || 2) * ppm;
      ctx.save(); ctx.globalAlpha = a;
      if (o.kind === "zone_fog") {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(160,100,220,0.62)"); gr.addColorStop(0.75, "rgba(150,90,210,0.45)"); gr.addColorStop(1, "rgba(150,90,210,0)");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        if (!reduceMotion()) { ctx.fillStyle = "rgba(200,150,255,0.18)"; for (let i = 0; i < 6; i++) { const an = i * 1.05 + t * 0.35, rr = r * (0.3 + 0.35 * pseudo(i, o.id)); ctx.beginPath(); ctx.arc(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.8, r * 0.35, 0, 7); ctx.fill(); } }
      } else {
        // 外からは黒い球（味方の漆黒は中の味方が透けて見える程度に薄く）・中にいる自分は暗く
        const inside = Math.hypot(viewer.x - o.x, viewer.y - o.y) <= (o.r || 3);
        ctx.fillStyle = inside ? "rgba(4,4,10,0.5)" : o.team === viewer.team ? "rgba(4,4,10,0.6)" : "rgba(4,4,10,0.9)"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = "rgba(120,90,160,0.6)"; ctx.lineWidth = 2; ctx.stroke();
        if (!inside) { const gr = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, "rgba(90,70,120,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = gr; ctx.fill(); }
      }
      ctx.restore();
    }
  }

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
    if (c === "x") {          // 窓（通れないが見通せる）：低い腰壁と格子
      ctx.fillStyle = C.wallFront; ctx.fillRect(px, py + ppm * 0.45, ppm + 0.5, ppm * 0.55);
      ctx.fillStyle = C.wallTopEdge; ctx.fillRect(px, py + ppm * 0.4, ppm + 0.5, ppm * 0.1);
      ctx.strokeStyle = "#b9a888"; ctx.lineWidth = Math.max(1, ppm * 0.05);
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(px + ppm * i / 4, py - hgt * 0.4); ctx.lineTo(px + ppm * i / 4, py + ppm * 0.4); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(px, py - hgt * 0.4); ctx.lineTo(px + ppm, py - hgt * 0.4); ctx.stroke();
      return;
    }
    if (c === "L" || c === "M") {   // 鍵の扉／閉じた仕掛け扉（回転壁・水門）
      const mt = mapRef && mapRef.castle ? mapRef.castle.type : "";
      ctx.fillStyle = c === "L" ? C.door : (mt === "water" ? "#3c5566" : "#5b4a36"); ctx.fillRect(px, py - hgt, ppm + 0.5, ppm + hgt + 0.5);
      ctx.fillStyle = c === "L" ? C.doorDark : "rgba(0,0,0,0.3)";
      for (let i = 1; i < 3; i++) ctx.fillRect(px + ppm * i / 3 - 1, py - hgt, 2, ppm + hgt);
      if (c === "L") { ctx.fillStyle = "#ffd84a"; ctx.beginPath(); ctx.arc(px + ppm / 2, py + ppm * 0.1, ppm * 0.12, 0, 7); ctx.fill(); ctx.fillRect(px + ppm / 2 - ppm * 0.04, py + ppm * 0.1, ppm * 0.08, ppm * 0.2); }
      else { ctx.strokeStyle = "#c9a67a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px + ppm / 2, py + ppm * 0.1, ppm * 0.2, 0, 7); ctx.stroke(); }
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
  let tintCv = null;
  // 露見中のスプライトを灰色寄りに（ctx.filter は Safari で使えないので合成で作る）
  function grayed(im, w, h) {
    if (!tintCv) tintCv = document.createElement("canvas");
    const cw = Math.max(1, Math.ceil(w * dpr)), ch = Math.max(1, Math.ceil(h * dpr));
    if (tintCv.width !== cw || tintCv.height !== ch) { tintCv.width = cw; tintCv.height = ch; }
    const c = tintCv.getContext("2d");
    c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, cw, ch); c.drawImage(im, 0, 0, cw, ch);
    c.globalCompositeOperation = "source-atop"; c.fillStyle = "rgba(125,130,140,0.72)"; c.fillRect(0, 0, cw, ch);
    return tintCv;
  }
  function drawStar(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const an = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r, px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill();
  }
  function drawCharacter(g, p, viewer, view, ix, iy) {
    const isSelf = p === viewer, ally = p.team === viewer.team;
    const feetX = sx(ix), feetY = sy(iy);
    const hVis = ppm * (p.crouch ? 1.45 : 1.75);
    const exposed = p.exposed > 0, chan = chanKind(p), ult = ultOn(p), stunned = p.stunT > 0 && !exposed;
    const showBar = (ally || view === "seen" || view === "revealed") && p.hpMax > 0;
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
    // 足元の輪：詠唱・構え（光の輪）／奥義（金）／逢魔刻（薄赤）
    if (chan || ult || hasMod(p, "visible")) {
      ctx.save(); ctx.lineWidth = 2;
      if (ult) { ctx.strokeStyle = "#ffd23f"; ctx.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(t * 6)); ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.7, ppm * 0.3, 0, 0, 7); ctx.stroke(); }
      if (chan) {
        const k = reduceMotion() ? 0.5 : (t * 1.2) % 1; ctx.strokeStyle = ally ? "#e8f4ff" : "#ffd0b8";
        ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * (0.4 + k * 0.5), ppm * (0.16 + k * 0.22), 0, 0, 7); ctx.stroke();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.55, ppm * 0.22, 0, 0, 7); ctx.stroke();
      }
      if (hasMod(p, "visible")) { ctx.strokeStyle = "rgba(255,90,90,0.75)"; ctx.globalAlpha = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.62, ppm * 0.26, 0, 0, 7); ctx.stroke(); }
      ctx.restore();
    }
    const spr = spriteFor(p);
    if (spr.im && assetsReady) {
      const im = spr.im, w = hVis * im.width / im.height;
      const bob = (p.speedNow > 0.3 && !reduceMotion()) ? Math.abs(Math.sin(t * 11)) * ppm * 0.07 : 0;
      ctx.save();
      if (ult) { ctx.shadowColor = "#ffd23f"; ctx.shadowBlur = 18; }
      else if (hasMod(p, "visible")) { ctx.shadowColor = "#ff5a5a"; ctx.shadowBlur = 14; }
      else if (p.reveal > 0) { ctx.shadowColor = C.yellow; ctx.shadowBlur = 14; }
      if (p.camo === 2 && isSelf) ctx.globalAlpha = 0.45;
      if (p.camo === 2 && ally && !isSelf) ctx.globalAlpha = 0.5;
      if (p.protect > 0) ctx.globalAlpha *= 0.65 + 0.35 * Math.abs(Math.sin(t * 8));
      ctx.translate(feetX, feetY - bob);
      if (spr.flip) ctx.scale(-1, 1);
      ctx.drawImage(exposed ? grayed(im, w, hVis) : im, -w / 2, -hVis, w, hVis);
      ctx.restore();
    } else {
      ctx.fillStyle = exposed ? "#7d828c" : D.CHARS[p.char].color; ctx.fillRect(feetX - ppm * 0.3, feetY - hVis, ppm * 0.6, hVis);
    }
    // 表情（スプライトが無いキャラは記号で）
    if (p.emote && !img[D.CHARS[p.char].id + "_" + p.emote.type]) drawLabel(feetX + ppm * 0.55, feetY - hVis - ppm * 0.15, p.emote.type === "happy" ? "♪" : "！", p.emote.type === "happy" ? "#ffe08a" : "#ff8a7a", ppm * 0.7);
    // 発見中の輪
    if (p.reveal > 0) { ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.5, ppm * 0.2, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // 保護中の輪
    if (p.protect > 0) { ctx.save(); ctx.strokeStyle = "rgba(180,220,255,0.8)"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.6, ppm * 0.25, 0, 0, 7); ctx.stroke(); ctx.restore(); }
    // 腕章（擬態中は隠す）
    if (p.camo === 0) drawBadge(feetX + ppm * 0.42, feetY - hVis * 0.62, p.team, 1);
    // 追香（毒手裏剣）：移動方向の矢印を敵にも見せる
    if (hasMod(p, "tracked")) {
      const mv = Math.hypot(p.x - p.px, p.y - p.py), an = (p.speedNow > 0.3 && mv > 1e-4) ? Math.atan2(p.y - p.py, p.x - p.px) : p.angle;
      ctx.save(); ctx.translate(feetX, feetY); ctx.rotate(an || 0); ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 5)); ctx.fillStyle = "#c86bff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ppm * 1.1, 0); ctx.lineTo(ppm * 0.65, ppm * 0.28); ctx.lineTo(ppm * 0.75, 0); ctx.lineTo(ppm * 0.65, -ppm * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    // 頭上のHPバー（味方は常時・敵は見えているときだけ）。名前などはバーのぶん上へ
    const top = feetY - hVis - (showBar ? ppm * 0.2 : 0);
    if (showBar) {
      const ratio = Math.max(0, Math.min(1, p.hp / p.hpMax)), bw = ppm * 1.1, bh = Math.max(3, ppm * 0.13), bx = feetX - bw / 2, by = feetY - hVis - ppm * 0.18;
      ctx.save(); ctx.fillStyle = "rgba(10,14,20,0.75)"; ctx.beginPath(); ctx.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 2); ctx.fill();
      ctx.fillStyle = ratio > 0.5 ? "#5fd36b" : ratio > 0.25 ? "#f2c94c" : "#e4553f"; ctx.fillRect(bx, by, bw * ratio, bh);
      if (p.hpMax > R.hp.byLevel[0]) { ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(bx + bw * R.hp.byLevel[0] / p.hpMax - 0.5, by, 1, bh); }
      ctx.restore();
    }
    // 露見（灰色＋バッジ＋残り秒）・手当（円ゲージ）・動けない（星）
    if (exposed) {
      const txt = "露見 " + Math.ceil(p.exposed);
      ctx.save(); ctx.font = `700 ${Math.max(10, ppm * 0.38)}px "Yu Gothic UI","Hiragino Sans","Meiryo",sans-serif`;
      const tw = ctx.measureText(txt).width + 10, byy = top - ppm * (ally && !isSelf ? 0.75 : 0.42);
      ctx.fillStyle = "rgba(217,72,59,0.95)"; ctx.beginPath(); ctx.roundRect(feetX - tw / 2, byy - ppm * 0.42, tw, ppm * 0.46, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, feetX, byy - ppm * 0.19); ctx.restore();
      if (p.healT > 0) {
        const ratio = Math.min(1, p.healT / healNeed(g, p));
        ctx.save(); ctx.lineWidth = Math.max(3, ppm * 0.12); ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.7, ppm * 0.3, 0, 0, 7); ctx.stroke();
        ctx.strokeStyle = "#7be08a"; ctx.beginPath(); ctx.ellipse(feetX, feetY, ppm * 0.7, ppm * 0.3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio); ctx.stroke(); ctx.restore();
        drawLabel(feetX, feetY + ppm * 0.75, "手当 " + Math.round(ratio * 100) + "%", "#7be08a", ppm * 0.34);
      }
    } else if (stunned) {
      ctx.save(); ctx.fillStyle = C.yellow;
      for (let i = 0; i < 3; i++) { const an = (reduceMotion() ? 0 : t * 5) + i * 2.094; drawStar(feetX + Math.cos(an) * ppm * 0.45, feetY - hVis - ppm * 0.05 + Math.sin(an) * ppm * 0.12, ppm * 0.13); }
      ctx.restore();
    }
    // 詠唱・構えの短い文言（足元）
    if (chan) drawLabel(feetX, feetY + ppm * 0.7, CHANNEL_LABEL[chan] || "技", ally ? "#e8f4ff" : "#ffd0b8", ppm * 0.36);
    // 味方の名前・マーカー
    if (ally) {
      const label = isSelf ? "" : p.name;
      if (label) drawLabel(feetX, top - ppm * 0.35, label, TEAM[p.team].light);
      if (!isSelf) { ctx.save(); ctx.fillStyle = TEAM[p.team].light; ctx.beginPath(); ctx.moveTo(feetX, top - ppm * 0.18); ctx.lineTo(feetX - ppm * 0.16, top - ppm * 0.4); ctx.lineTo(feetX + ppm * 0.16, top - ppm * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); }
      if (p.camo === 2 && isSelf) drawLabel(feetX, top - ppm * 0.35, "柄が一致：" + D.MAP.patterns[p.camoPattern].name, "#cfe8d6");
    }
    // 帰還待ちの秒数（味方）
    if (ally && p.returning > 0) drawLabel(feetX, top - ppm * 0.4, "帰還 " + Math.ceil(p.returning), "#ddd");
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
      } else if (e.type === "burst" || e.type === "smash") {          // 焙烙玉・黒団子の爆発／巨人の一撃の衝撃波
        if (!effVisible(viewer, e)) continue;
        const rr = (e.r || 2) * ppm * Math.min(1, k * 1.6);
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.type === "smash" ? "#e0b37a" : teamCol(e.team, true); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.stroke();
        ctx.globalAlpha = a * 0.25; ctx.fillStyle = ctx.strokeStyle; ctx.fill();
        if (e.type === "smash") { ctx.globalAlpha = a * 0.8; ctx.fillStyle = "#c9b28e"; for (let i = 0; i < 8; i++) { const an = i * 0.785 + 0.3; ctx.beginPath(); ctx.arc(x + Math.cos(an) * rr * 0.9, y + Math.sin(an) * rr * 0.9 - k * ppm * 0.5, ppm * (0.16 - k * 0.1), 0, 7); ctx.fill(); } }
        ctx.restore();
      } else if (e.type === "dashline" || e.type === "leap") {        // 白刃の閃光／迅雷羽の跳躍
        if (!effVisible(viewer, e)) continue;
        const tx = sx(e.tx), ty = sy(e.ty);
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = e.type === "dashline" ? Math.max(2, ppm * 0.14) : 2; ctx.lineCap = "round";
        if (e.type === "leap") ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.moveTo(x, y);
        if (e.type === "leap") ctx.quadraticCurveTo((x + tx) / 2, Math.min(y, ty) - ppm * 1.4, tx, ty); else ctx.lineTo(tx, ty);
        ctx.stroke(); ctx.restore();
      } else if (e.type === "footprint") {                            // 棘道：踏んだ敵の足跡（仕掛けた側にだけ3秒）
        if (e.team !== viewer.team) continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = "#e7c27a";
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(x + (i ? ppm * 0.14 : -ppm * 0.14), y + (i ? -ppm * 0.12 : ppm * 0.12), ppm * 0.09, ppm * 0.15, 0.3, 0, 7); ctx.fill(); }
        ctx.restore(); drawLabel(x, y - ppm * 0.5, "足跡", "#e7c27a", ppm * 0.3);
      } else if (e.type === "leap_warn") {                            // 迅雷羽：着地点の雷の予告（0.3秒）
        const k = 1 - a;
        ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * a; ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.ellipse(x, y, ppm * (0.9 - k * 0.3), ppm * (0.4 - k * 0.12), 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#ffe066"; ctx.beginPath(); ctx.moveTo(x - ppm * 0.12, y - ppm * 1.1); ctx.lineTo(x + ppm * 0.1, y - ppm * 0.55); ctx.lineTo(x - ppm * 0.02, y - ppm * 0.55); ctx.lineTo(x + ppm * 0.12, y); ctx.lineTo(x - ppm * 0.1, y - ppm * 0.45); ctx.lineTo(x + ppm * 0.02, y - ppm * 0.45); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (e.type === "steam" || e.type === "petals_end" || e.type === "wind" || e.type === "wind_end") {   // 属性の相殺（水遁で火が消える・風遁で霧が流れる）・花隠れの終了
        const col = e.type === "steam" ? "rgba(235,240,245,0.9)" : e.type === "petals_end" ? "rgba(255,190,215,0.9)" : "rgba(200,235,255,0.9)";
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
        if (e.type === "wind" || e.type === "wind_end") { for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - ppm * 0.8, y + i * ppm * 0.3); ctx.quadraticCurveTo(x, y + i * ppm * 0.3 - ppm * 0.25, x + ppm * 0.8 * (1 - a * 0.3), y + i * ppm * 0.3); ctx.stroke(); } }
        else for (let i = 0; i < 6; i++) { const an = i * 1.05 + t; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * 0.6 * (1.4 - a), y - ppm * 0.4 * (1 - a) + Math.sin(an) * ppm * 0.3, ppm * 0.14, 0, 7); ctx.fill(); }
        ctx.restore();
        if (e.type === "steam" && a > 0.5) drawLabel(x, y - ppm * 1.0, "じゅっ", "#dfe8ef", ppm * 0.34);
      } else if (e.type === "wall_up") {
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#dfe7ef"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ppm * (0.6 + k * 1.2), 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "gate") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#b48cff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ppm * (0.4 + k * 1.0), 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "levelup") {
        if (e.team !== viewer.team) continue;
        ctx.save(); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = teamCol(e.team, true); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, ppm * (0.5 + k * 4), 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "ult") {
        if (!effVisible(viewer, e)) continue;
        const rr = ppm * (1 + k * 3);
        ctx.save(); const gr = ctx.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, "rgba(255,225,120,0.7)"); gr.addColorStop(1, "rgba(255,200,60,0)");
        ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); ctx.restore();
      } else if (e.type === "skill") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = teamCol(e.team, true); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, ppm * (0.5 + k * 1.2), ppm * (0.2 + k * 0.5), 0, 0, 7); ctx.stroke(); ctx.restore();
      } else if (e.type === "recover") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); const gr = ctx.createRadialGradient(x, y, 0, x, y, ppm * 1.2); gr.addColorStop(0, "rgba(120,240,150,0.6)"); gr.addColorStop(1, "rgba(120,240,150,0)");
        ctx.globalAlpha = a; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, ppm * 1.2, 0, 7); ctx.fill(); ctx.restore();
      } else if (e.type === "kawarimi") {                             // 変わり身：丸太と煙、移動方向
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y - ppm * 0.4); ctx.rotate(-0.3);
        ctx.fillStyle = "#7a5636"; ctx.beginPath(); ctx.roundRect(-ppm * 0.22, -ppm * 0.55, ppm * 0.44, ppm * 1.1, ppm * 0.1); ctx.fill();
        ctx.fillStyle = "#c9a67a"; ctx.beginPath(); ctx.ellipse(0, -ppm * 0.55, ppm * 0.22, ppm * 0.1, 0, 0, 7); ctx.fill();
        ctx.restore();
        ctx.save(); ctx.globalAlpha = a * 0.7; ctx.fillStyle = "#c8c2b4";
        for (let i = 0; i < 6; i++) { const an = i * 1.05 + k * 2; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * (0.3 + k * 0.9), y - ppm * 0.3 + Math.sin(an) * ppm * (0.2 + k * 0.5), ppm * (0.22 - k * 0.14), 0, 7); ctx.fill(); }
        if (e.angle != null) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(e.angle) * ppm * 3, y + Math.sin(e.angle) * ppm * 3); ctx.stroke(); }
        ctx.restore();
      } else if (e.type === "shot_end") {
        ctx.save(); ctx.globalAlpha = a * 0.6; ctx.fillStyle = "#f2ead6";
        for (let i = 0; i < 3; i++) { const an = i * 2.1; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * k * 0.4, y - ppm * 0.8 + Math.sin(an) * ppm * k * 0.4, ppm * (0.1 - k * 0.06), 0, 7); ctx.fill(); }
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
      if (p.team !== viewer.team && Sim.pulseShownTo && !Sim.pulseShownTo(g, viewer)) continue;
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
      if (CASTLE_FX[e.type]) { if (e.type === "mech" || e.type === "push_warn" || e.team === viewer.team || effVisible(viewer, e)) drawCastleEffect(g, viewer, e); continue; }
      if (e.type === "found") {
        ctx.save(); ctx.strokeStyle = C.yellow; ctx.lineWidth = 3; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(x, y - ppm * 0.8, ppm * (0.5 + k * 1.2), 0, 7); ctx.stroke(); ctx.restore();
        if (e.team === viewer.team) drawLabel(x, y - ppm * 2.2 - k * ppm, e.decoy ? "分身だった" : "見つけた！", C.yellow);
      } else if (e.type === "miss" && e.owner === viewer.id) {
        drawLabel(x, y - ppm * 2.2 - k * ppm * 0.5, "気配なし", "#cfd6dd");
      } else if (e.type === "hit") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#ff8a5c"; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const an = i * 1.047; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * ppm * 0.2, y - ppm * 0.8 + Math.sin(an) * ppm * 0.2); ctx.lineTo(x + Math.cos(an) * ppm * (0.4 + k), y - ppm * 0.8 + Math.sin(an) * ppm * (0.4 + k)); ctx.stroke(); }
        ctx.restore();
        // ダメージ数字（自分が受けた＝大きく赤／味方が当てた＝金／それ以外＝橙）
        if (e.decoy) { if (e.team === viewer.team) drawLabel(x, y - ppm * 2.3 - k * ppm, "分身だった", "#cfd6dd"); }
        else if (e.dmg != null) { const mine = e.target === viewer.id; drawLabel(x, y - ppm * 2.2 - k * ppm * 1.2, "-" + e.dmg, mine ? "#ff6a5a" : e.team === viewer.team ? "#ffd27a" : "#ffb090", ppm * (mine ? 0.7 : 0.55)); }
        else if (e.team === viewer.team) drawLabel(x, y - ppm * 2.3 - k * ppm, "命中", "#ffb090");
      } else if (e.type === "expose") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.red; ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x, y - ppm * 0.8, ppm * (0.4 + k * 1.6 + i * 0.4), 0, 7); ctx.stroke(); }
        ctx.restore();
        drawLabel(x, y - ppm * 2.5 - k * ppm * 0.6, "露見", "#ff6a5a", ppm * 0.85);
      } else if (e.type === "recover") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = "#8ff2a4";
        for (let i = 0; i < 7; i++) { const an = i * 0.9 + 0.4, rr = ppm * (0.3 + (i % 3) * 0.2); ctx.beginPath(); ctx.arc(x + Math.cos(an) * rr, y - ppm * 0.6 - k * ppm * (1 + (i % 2) * 0.6) + Math.sin(an) * rr * 0.4, ppm * 0.07, 0, 7); ctx.fill(); }
        ctx.restore();
        drawLabel(x, y - ppm * 2.3 - k * ppm * 0.6, "復帰", "#8ff2a4");
      } else if (e.type === "levelup") {
        if (e.team !== viewer.team) continue;
        drawLabel(x, y - ppm * 2.2 - k * ppm * 0.8, "Lv." + e.level, teamCol(e.team, true), ppm * 0.8);
      } else if (e.type === "ult") {
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) { const an = i * 0.785 + k; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * ppm * 0.5, y - ppm * 0.8 + Math.sin(an) * ppm * 0.5); ctx.lineTo(x + Math.cos(an) * ppm * (1 + k * 2), y - ppm * 0.8 + Math.sin(an) * ppm * (1 + k * 2)); ctx.stroke(); }
        ctx.restore();
        const tr = D.TREES && D.TREES[e.tree] && D.TREES[e.tree][5];
        drawLabel(x, y - ppm * 2.4 - k * ppm * 0.6, tr ? tr.name : "奥義", "#ffd23f", ppm * 0.6);
      } else if (e.type === "skill") {
        if (!effVisible(viewer, e)) continue;
        drawLabel(x, y - ppm * 2.3 - k * ppm * 0.5, skillNameOf(g, e), e.team === viewer.team ? "#cfe8ff" : "#ffc9b0", ppm * 0.42);
      } else if (e.type === "parry") {                                 // 双龍円・無刀取り
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y - ppm * 0.8, ppm * (0.6 + k * 0.5), -2.2, -0.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - ppm * 0.8, ppm * (0.6 + k * 0.5), 0.9, 2.2); ctx.stroke(); ctx.restore();
        drawLabel(x, y - ppm * 2.3 - k * ppm * 0.4, "弾いた", "#ffffff");
      } else if (e.type === "shield") {                                // 守り兎の盾が印を受けた
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#8fd0ff"; ctx.fillStyle = "rgba(143,208,255,0.18)"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const an = i * 1.047 - 0.52, rr = ppm * (0.9 + k * 0.3), px = x + Math.cos(an) * rr, py = y - ppm * 0.8 + Math.sin(an) * rr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        drawLabel(x, y - ppm * 2.3 - k * ppm * 0.4, "守り", "#8fd0ff");
      } else if (e.type === "buff") {                                  // 守り兎・円光・帰魂などの強化
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#dfffe6"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) { const px = x + Math.cos(i * 1.26) * ppm * 0.5, py = y - ppm * 0.5 - k * ppm * (0.8 + (i % 2) * 0.5) + Math.sin(i * 1.26) * ppm * 0.2, s = ppm * 0.09; ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px + s, py); ctx.moveTo(px, py - s); ctx.lineTo(px, py + s); ctx.stroke(); }
        ctx.restore();
      } else if (e.type === "hex") {                                   // 呪標（紫の印）
        if (!effVisible(viewer, e)) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#c07bff"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= 5; i++) { const an = -Math.PI / 2 + i * 4 * Math.PI / 5 + k, rr = ppm * 0.7, px = x + Math.cos(an) * rr, py = y - ppm * 0.8 + Math.sin(an) * rr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke(); ctx.restore();
        drawLabel(x, y - ppm * 2.3 - k * ppm * 0.4, "呪", "#c07bff", ppm * 0.6);
      } else if (e.type === "spotted") {                               // 鷹の目・白蛇が捉えた点（味方だけ）
        if (e.team !== viewer.team) continue;
        const pl = reduceMotion() ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(t * 6));
        ctx.save(); ctx.globalAlpha = Math.min(1, a * 2) * pl; ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.arc(x, y, ppm * 0.2, 0, 7); ctx.fill();
        ctx.strokeStyle = C.yellow; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, ppm * 0.55, 0, 7); ctx.stroke(); ctx.restore();
        drawLabel(x, y - ppm * 0.7, e.mark ? "擬態痕" : "敵", C.yellow, ppm * 0.36);
      } else if (e.type === "gate") {
        if (!effVisible(viewer, e)) continue;
        drawLabel(x, y - ppm * 1.8 - k * ppm * 0.3, "影穴", "#d9c8ff", ppm * 0.4);
      } else if (e.type === "smash") {
        if (!effVisible(viewer, e)) continue;
        drawLabel(x, y - ppm * 1.5 - k * ppm * 0.5, "一撃", "#e0b37a", ppm * 0.6);
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
    // 追香：見えない相手の「移動方向」だけを自分の頭上に矢印で出す（位置は出さない）
    let ti = 0;
    for (const q of g.players) {
      if (q.team === viewer.team) continue;
      let dir = null;
      if (q.mods) { if (Sim.enemyView(viewer, q) === "none" && Sim.trackDirFor) dir = Sim.trackDirFor(viewer, q); }   // ひとり用
      else if ((q.ghost || q.pulseOnly) && q.trackDir != null) dir = q.trackDir;                                      // オンライン
      if (dir == null) continue;
      const cx = sx(viewer.x) + (ti - 0.5) * ppm * 1.6, cy = sy(viewer.y) - ppm * 2.9; ti++;
      ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = "rgba(30,14,44,0.75)"; ctx.beginPath(); ctx.arc(cx, cy, ppm * 0.52, 0, 7); ctx.fill();
      ctx.translate(cx, cy); ctx.rotate(dir); ctx.fillStyle = "#c86bff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ppm * 0.4, 0); ctx.lineTo(-ppm * 0.22, ppm * 0.24); ctx.lineTo(-ppm * 0.08, 0); ctx.lineTo(-ppm * 0.22, -ppm * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      const nm = q.char != null && D.CHARS[q.char] ? D.CHARS[q.char].name : "";
      drawLabel(cx, cy - ppm * 0.75, "追香" + (nm ? "・" + nm : ""), "#e2b8ff", ppm * 0.3);
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
    // 幻灯（月霧城の罠）の偽の足音も、本物と同じ見た目で出す
    for (const o of objsOf(g)) {
      if (o.kind !== "phantom" || o.dead || !Sim.phantomAudible || !Sim.phantomAudible(viewer, o)) continue;
      const an = Math.atan2(o.y - viewer.y, o.x - viewer.x), d = Sim.dist(viewer, o);
      const rr = ppm * 1.7, cx = sx(viewer.x), cy = sy(viewer.y) - ppm * 0.6;
      ctx.save(); ctx.globalAlpha = Math.max(0.35, 1 - d / 9); ctx.strokeStyle = "#f2e6c4"; ctx.lineWidth = 2.5;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, rr + i * ppm * 0.25, an - 0.35, an + 0.35); ctx.stroke(); }
      ctx.restore();
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
    const N = 100, maxR = Sim.viewRangeOf ? Sim.viewRangeOf(viewer) : R.viewRange, ox = viewer.x, oy = viewer.y;
    d.globalCompositeOperation = "destination-out";
    const grad = d.createRadialGradient(sx(ox), sy(oy), ppm * 2, sx(ox), sy(oy), maxR * ppm);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(0.75, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    d.fillStyle = grad;
    d.beginPath();
    for (let i = 0; i <= N; i++) {
      const an = (i / N) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
      let r = 0;
      for (; r < maxR; r += 0.25) { if ((Sim.LOSBLOCK || Sim.SOLID)[Sim.cellAt(ox + cx * r, oy + cy * r)]) { r += 0.8; break; } }
      const px = sx(ox + cx * r), py = sy(oy + cy * r);
      if (i === 0) d.moveTo(px, py); else d.lineTo(px, py);
    }
    d.closePath(); d.fill();
    // 自分の周りは少し明るく
    ctx.drawImage(darkCv, 0, 0, Wpx, Hpx);
  }

  // ---------- 城：拾える物・旗の台座・霧の庭 ----------
  // 旗は「チームが見つけた」か「いま見えている」ときだけ描く（ふつう・てごわいは旗の位置が伏せてある）
  function flagShown(g, viewer) {
    if (!isCastle()) return true;
    if (g.phase === "finished") return true;
    if (intelOf(g, viewer.team).known) return true;
    return sameFloor(viewer, FLAG) && Sim.dist(viewer, FLAG) <= Sim.viewRangeOf(viewer) && Sim.lineClear(viewer.x, viewer.y, FLAG.x, FLAG.y);
  }
  function drawFlagRing() {
    const x = sx(FLAG.x), y = sy(FLAG.y);
    ctx.save();
    // 擬態できない砂の輪（半径3m）
    ctx.fillStyle = "rgba(106,93,70,0.55)"; ctx.beginPath(); ctx.arc(x, y, R.flagNoCamo * ppm, 0, 7); ctx.fill();
    ctx.strokeStyle = C.brass; ctx.lineWidth = Math.max(1.5, ppm * 0.08);
    ctx.beginPath(); ctx.arc(x, y, R.flagRadius * ppm, 0, 7); ctx.stroke();
    ctx.strokeStyle = "rgba(199,165,91,0.25)"; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(x, y, R.flagNoCamo * ppm, 0, 7); ctx.stroke(); ctx.restore();
  }
  // 旗の台座（てごわいの候補の間には、空の台座と本物の台座が同じ形で置いてある）
  function drawPedestal(x, y, cand) {
    const px = sx(x), py = sy(y);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(px, py, ppm * 0.42, ppm * 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#6b5a3a"; ctx.fillRect(px - ppm * 0.34, py - ppm * 0.2, ppm * 0.68, ppm * 0.2);
    ctx.fillStyle = "#8a7550"; ctx.fillRect(px - ppm * 0.34, py - ppm * 0.24, ppm * 0.68, ppm * 0.06);
    if (cand) drawLabel(px, py - ppm * 0.7, "？", "#f2d27c", ppm * 0.5);
    ctx.restore();
  }
  function drawKey(it) {
    const x = sx(it.x), y = sy(it.y) - ppm * 0.3 - (reduceMotion() ? 0 : Math.sin(t * 3 + it.id) * ppm * 0.06);
    ctx.save();
    ctx.fillStyle = "rgba(255,216,74,0.18)"; ctx.beginPath(); ctx.arc(x, y, ppm * 0.45, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = Math.max(2, ppm * 0.08);
    ctx.beginPath(); ctx.arc(x - ppm * 0.14, y, ppm * 0.12, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - ppm * 0.02, y); ctx.lineTo(x + ppm * 0.26, y); ctx.moveTo(x + ppm * 0.18, y); ctx.lineTo(x + ppm * 0.18, y + ppm * 0.1); ctx.moveTo(x + ppm * 0.26, y); ctx.lineTo(x + ppm * 0.26, y + ppm * 0.1); ctx.stroke();
    ctx.restore();
  }
  function drawEmblem(it, seenByTeam) {
    const x = sx(it.x), y = sy(it.y);
    ctx.save(); ctx.globalAlpha = seenByTeam ? 0.45 : 1;
    ctx.fillStyle = "#e8d9b0"; ctx.fillRect(x - 1.5, y - ppm * 1.2, 3, ppm * 1.2);
    ctx.fillStyle = "#3a5a8a"; ctx.fillRect(x + 1.5, y - ppm * 1.15, ppm * 0.5, ppm * 0.62);
    ctx.fillStyle = "#f2d27c"; ctx.beginPath(); ctx.moveTo(x + 1.5 + ppm * 0.25, y - ppm * 1.02); ctx.lineTo(x + 1.5 + ppm * 0.4, y - ppm * 0.84); ctx.lineTo(x + 1.5 + ppm * 0.25, y - ppm * 0.66); ctx.lineTo(x + 1.5 + ppm * 0.1, y - ppm * 0.84); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (!seenByTeam) drawLabel(x + ppm * 0.2, y - ppm * 1.45, "旗印", "#f2d27c", ppm * 0.3);
  }
  // 霧の庭（月霧城）：ずっとある白い霧。中の人は外から見えにくい（判定は sim の zone_fog と同じ）
  function drawStaticFog(g, viewer) {
    const fogs = (mapRef && mapRef.fogObjs) || [];
    for (const o of fogs) {
      if (!sameFloor(viewer, o)) continue;
      const x = sx(o.x), y = sy(o.y), r = (o.r || 2) * ppm;
      if (x < -r || y < -r || x > Wpx + r || y > Hpx + r) continue;
      const inside = Math.hypot(viewer.x - o.x, viewer.y - o.y) <= (o.r || 2);
      ctx.save(); ctx.globalAlpha = inside ? 0.45 : 0.85;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(225,232,240,0.62)"); gr.addColorStop(0.7, "rgba(210,220,232,0.45)"); gr.addColorStop(1, "rgba(210,220,232,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (!reduceMotion()) { ctx.fillStyle = "rgba(240,244,250,0.16)"; for (let i = 0; i < 5; i++) { const an = i * 1.26 + t * 0.2, rr = r * (0.25 + 0.4 * pseudo(i, o.id)); ctx.beginPath(); ctx.arc(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.7, r * 0.3, 0, 7); ctx.fill(); } }
      ctx.restore();
    }
  }
  // 城の効果（上下移動・罠・鍵・仕掛け）
  function drawCastleEffect(g, viewer, e) {
    const a = e.life / e.maxLife, k = 1 - a, x = sx(e.x), y = sy(e.y);
    if (e.type === "portal") {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#dfe8ef"; ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(x, y, ppm * (0.4 + k * 0.9 + i * 0.3), ppm * (0.16 + k * 0.4 + i * 0.12), 0, 0, 7); ctx.stroke(); }
      ctx.restore();
    } else if (e.type === "shove") {
      const tx = sx(e.tx), ty = sy(e.ty);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "rgba(200,235,255,0.9)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
    } else if (e.type === "unlock") {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#ffd84a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, ppm * (0.5 + k * 1.4), 0, 7); ctx.stroke(); ctx.restore();
      drawLabel(x, y - ppm * 1.2 - k * ppm * 0.5, "開いた", "#ffd84a", ppm * 0.45);
    } else if (e.type === "burn") {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = "#ff9a3c";
      for (let i = 0; i < 6; i++) { const an = i * 1.05 + k * 2; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * 0.4, y - ppm * 0.6 - k * ppm + Math.sin(an) * ppm * 0.2, ppm * 0.1, 0, 7); ctx.fill(); }
      ctx.restore();
      if (e.dmg) drawLabel(x, y - ppm * 2.2 - k * ppm, "-" + e.dmg + " 火鉢", e.target === viewer.id ? "#ff6a5a" : "#ffb090", ppm * 0.5);
    } else if (e.type === "naruko") {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = "#e8c65a"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y - ppm * 0.4, ppm * (0.4 + k * 1.2 + i * 0.3), -2.4, -0.7); ctx.stroke(); }
      ctx.restore(); drawLabel(x, y - ppm * 1.6 - k * ppm * 0.4, "カラン", "#e8c65a", ppm * 0.42);
    } else if (e.type === "lantern") {
      ctx.save(); ctx.globalAlpha = a * 0.8; const gr = ctx.createRadialGradient(x, y, 0, x, y, ppm * 1.4); gr.addColorStop(0, "rgba(255,220,150,0.6)"); gr.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, ppm * 1.4, 0, 7); ctx.fill(); ctx.restore();
    } else if (e.type === "shrine") {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = "#8ff2a4";
      for (let i = 0; i < 6; i++) { const an = i * 1.05 + 0.3; ctx.beginPath(); ctx.arc(x + Math.cos(an) * ppm * 0.45, y - ppm * 0.5 - k * ppm * 1.2 + Math.sin(an) * ppm * 0.15, ppm * 0.07, 0, 7); ctx.fill(); }
      ctx.restore(); if (e.heal) drawLabel(x, y - ppm * 2.2 - k * ppm, "+" + e.heal, "#8ff2a4", ppm * 0.55);
    } else if (e.type === "key") {
      drawLabel(x, y - ppm * 1.2 - k * ppm, e.team === viewer.team ? "鍵を拾った" : "鍵", "#ffd84a", ppm * 0.45);
    } else if (e.type === "mech") {
      ctx.save(); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = "#c9a67a"; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, ppm * (0.6 + k * 0.8), 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.type === "push_warn") {
      ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 12)); ctx.fillStyle = "#ffd84a";
      drawLabel(x, y - ppm * 1.2, "押し壁が動く", "#ffd84a", ppm * 0.42); ctx.restore();
    } else if (e.type === "flagfound" && e.team === viewer.team) {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = C.brass; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - ppm, ppm * (0.6 + k * 2.4), 0, 7); ctx.stroke(); ctx.restore();
    }
  }
  const CASTLE_FX = { portal: 1, shove: 1, unlock: 1, burn: 1, naruko: 1, lantern: 1, shrine: 1, key: 1, mech: 1, push_warn: 1, flagfound: 1 };

  // ---------- メイン ----------
  function draw(g, viewer, alpha, dt) {
    if (!cv) return;
    t += dt || 0.016;
    syncMap(g, viewer);
    const fr = curFloor, vfi = isCastle() ? Sim.floorAt(viewer.x, viewer.y) : 0;
    const onFloor = o => !isCastle() || Sim.floorAt(o.x, o.y) === vfi;
    const vx = lerp(viewer.px, viewer.x, alpha), vy = lerp(viewer.py, viewer.y, alpha);
    // 階を移った直後は補間しない（別の階の座標から線を引かない）
    setCamera(onFloor({ x: vx, y: vy }) ? vx : viewer.x, onFloor({ x: vx, y: vy }) ? vy : viewer.y);
    ctx.fillStyle = C.solidBase; ctx.fillRect(0, 0, Wpx, Hpx);
    // いまの階の外は描かない
    ctx.save();
    const clipTop = sy(fr.oy) - ppm * 2;
    ctx.beginPath(); ctx.rect(sx(fr.ox), clipTop, fr.w * ppm, sy(fr.oy + fr.h) - clipTop); ctx.clip();
    // 床（いまの階だけを事前に描いた絵）
    ctx.drawImage(floorCv, sx(fr.ox), sy(fr.oy), fr.w * ppm, fr.h * ppm);
    drawGroundObjects(g, viewer);      // 設置物の地面層（水鏡・封印・描景・棘道・予告円…）
    drawGroundEffects(g, viewer);
    const showFlag = flagShown(g, viewer) && onFloor(FLAG);
    if (showFlag && isCastle()) drawFlagRing();
    // 描画対象（壁・キャラ・旗・立った設置物）をy順に
    const x0 = Math.max(fr.ox, Math.floor(cam.x - Wpx / 2 / ppm) - 1), x1 = Math.min(fr.ox + fr.w - 1, Math.ceil(cam.x + Wpx / 2 / ppm) + 1);
    const y0 = Math.max(fr.oy, Math.floor(cam.y - Hpx / 2 / ppm) - 2), y1 = Math.min(fr.oy + fr.h - 1, Math.ceil(cam.y + Hpx / 2 / ppm) + 1);
    const ents = [];
    for (const p of g.players) {
      if (p.returning > 0 || p.ghost || p.pulseOnly || p.x == null || !onFloor(p)) continue;
      let view = "seen";
      if (p.team !== viewer.team) { view = p.cloth ? "cloth" : Sim.enemyView(viewer, p); if (view === "none") continue; }
      const ix = lerp(p.px, p.x, alpha), iy = lerp(p.py, p.y, alpha);
      ents.push({ y: iy, f: () => drawCharacter(g, p, viewer, view, ix, iy) });
    }
    for (const o of objsOf(g)) {
      if (o.dead || o.kind === "phantom" || !objVisible(viewer, o)) continue;
      if (o.kind === "wall" && !o.pending) ents.push({ y: Math.max(o.ay, o.by), f: () => drawWallObject(o) });
      else if (o.kind === "decoy_run" || o.kind === "decoy_static" || o.kind === "echo_clone") ents.push({ y: o.y, f: () => drawDecoy(g, o, viewer) });
      else if (o.kind === "fox_fire") ents.push({ y: o.y, f: () => drawFoxFire(o) });
    }
    if (isCastle()) {
      const I = intelOf(g, viewer.team);
      // 旗の台座（本物＋てごわいの偽の候補）
      for (const r of mapRef.rooms) {
        if (mapRef.castle.flagInfo !== "candidates") break;
        if (!(r.flag || r.candidate) || !onFloor({ x: r.cx, y: r.cy })) continue;
        if (r.flag && showFlag) continue;
        const cand = !I.known && I.candidates.includes(r.id) && mapRef.castle.flagInfo !== "full";
        ents.push({ y: r.cy, f: () => drawPedestal(r.cx, r.cy, cand) });
      }
      const seenEmb = I.emblems || [];
      for (const it of mapRef.items) {
        if (it.taken || !onFloor(it)) continue;
        if (it.kind === "key") ents.push({ y: it.y, f: () => drawKey(it) });
        else if (it.kind === "emblem") ents.push({ y: it.y, f: () => drawEmblem(it, seenEmb.includes(it.id)) });
      }
    }
    if (showFlag) ents.push({ y: FLAG.y, f: () => drawFlag(g) });
    ents.sort((a, b) => a.y - b.y);
    let ei = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { const c = Sim.grid[y][x]; if (Sim.SOLID[c]) drawWallCell(x, y, c); }
      while (ei < ents.length && ents[ei].y < y + 1) { ents[ei].f(); ei++; }
    }
    while (ei < ents.length) { ents[ei].f(); ei++; }
    drawShots(g, viewer);
    drawStaticFog(g, viewer);          // 霧の庭（月霧城）
    drawTopZones(g, viewer);           // 紫煙・漆黒はキャラの上
    drawDarkness(viewer);
    drawTopEffects(g, viewer);
    ctx.restore();
    drawFootMarks(g, viewer);
  }

  // ---------- ミニマップ（いまの階） ----------
  function drawMinimap(mcv, g, viewer) {
    syncMap(g, viewer);
    const fr = curFloor; if (!fr) return;
    const m = mcv.getContext("2d");
    const mw = mcv.width, mh = mcv.height;
    const k = Math.min(mw / fr.w, mh / fr.h), ox = (mw - fr.w * k) / 2, oy = (mh - fr.h * k) / 2;
    const X = x => ox + (x - fr.ox) * k, Y = y => oy + (y - fr.oy) * k;
    m.clearRect(0, 0, mw, mh);
    m.drawImage(miniFor(fr), ox, oy, fr.w * k, fr.h * k);
    const castle = isCastle(), I = intelOf(g, viewer.team);
    const onFloor = o => !castle || Sim.floorAt(o.x, o.y) === fr.index;
    // 旗（分かっていて、この階にあるとき）／候補の部屋
    if (flagShown(g, viewer) && onFloor(FLAG)) { m.fillStyle = C.brass; m.beginPath(); m.arc(X(FLAG.x), Y(FLAG.y), 3.5, 0, 7); m.fill(); }
    else if (castle && !I.known) {
      for (const rid of I.candidates) { const r = mapRef.rooms[rid]; if (!r || !onFloor({ x: r.cx, y: r.cy })) continue; m.strokeStyle = "#f2d27c"; m.lineWidth = 1.2; m.setLineDash([2, 2]); m.strokeRect(X(r.x0), Y(r.y0), (r.x1 - r.x0 + 1) * k, (r.y1 - r.y0 + 1) * k); m.setLineDash([]); }
    }
    for (const p of g.players) {
      if (p.returning > 0 || p.x == null || !onFloor(p)) continue;
      const x = X(p.x), y = Y(p.y);
      if (p.team === viewer.team) {
        m.fillStyle = p === viewer ? "#ffffff" : TEAM[p.team].light;
        m.beginPath(); m.arc(x, y, p === viewer ? 3.5 : 2.8, 0, 7); m.fill();
        if (p === viewer) { m.strokeStyle = "#15222B"; m.lineWidth = 1; m.stroke(); }
      } else if (p.reveal > 0) {
        m.fillStyle = C.yellow; m.beginPath(); m.arc(x, y, 3, 0, 7); m.fill();
      } else if (p.lastSeen && onFloor(p.lastSeen)) {
        m.strokeStyle = C.yellow; m.lineWidth = 1; m.beginPath(); m.arc(X(p.lastSeen.x), Y(p.lastSeen.y), 3, 0, 7); m.stroke();
      }
      if (p.pulse && (p.team === viewer.team || !Sim.pulseShownTo || Sim.pulseShownTo(g, viewer))) { m.strokeStyle = "#fff"; m.lineWidth = 1; m.beginPath(); m.arc(x, y, 5, 0, 7); m.stroke(); }
    }
    // 白狐の足跡（track.mark）と鷹の目・白蛇が捉えた点（spotted）は味方だけに出す
    for (const o of objsOf(g)) {
      if (o.dead || o.team !== viewer.team || o.kind !== "track" || !o.mark || !onFloor(o.mark)) continue;
      const mx = X(o.mark.x), my = Y(o.mark.y);
      m.fillStyle = TEAM[viewer.team].light;
      m.beginPath(); m.ellipse(mx - 1.6, my + 0.8, 1.3, 2, -0.3, 0, 7); m.fill();
      m.beginPath(); m.ellipse(mx + 1.6, my - 0.8, 1.3, 2, 0.3, 0, 7); m.fill();
      m.strokeStyle = TEAM[viewer.team].light; m.lineWidth = 1; m.setLineDash([2, 2]); m.beginPath(); m.arc(mx, my, 5, 0, 7); m.stroke(); m.setLineDash([]);
    }
    for (const e of g.effects) {
      if (e.type !== "spotted" || e.team !== viewer.team || !onFloor(e)) continue;
      m.fillStyle = C.yellow; m.beginPath(); m.arc(X(e.x), Y(e.y), 2.5, 0, 7); m.fill();
      m.strokeStyle = "#15222B"; m.lineWidth = 1; m.stroke();
    }
    // 階の名前（城）
    if (castle) {
      const lab = floorLabel(fr.id) + (I.floorKnown ? (mapRef.flagFloor === fr.id ? " 🚩" : "｜旗" + floorLabel(mapRef.flagFloor)) : "｜旗？");
      m.font = "bold 11px 'Yu Gothic UI','Hiragino Sans',sans-serif"; m.textAlign = "left"; m.textBaseline = "top";
      const tw = m.measureText(lab).width + 8;
      m.fillStyle = "rgba(13,18,25,0.85)"; m.fillRect(2, 2, tw, 15);
      m.fillStyle = "#f2e6c4"; m.fillText(lab, 6, 4);
    }
  }
  // 作戦画面用：ルートを重ねた地図（城は全階を並べる）
  const ROUTE_COLORS = ["#7fd1a6", "#f2d27c", "#a9b8c9"];
  function drawBriefingMap(mcv, team, assignments, g) {
    if (g) syncMap(g, null);
    const m = mcv.getContext("2d");
    const mw = mcv.width, mh = mcv.height;
    m.clearRect(0, 0, mw, mh);
    if (!isCastle()) {
      const fr = { id: "1F", ox: 0, oy: 0, w: W, h: H, index: 0 }, k = mw / W;
      m.drawImage(miniFor(fr), 0, 0, mw, mh);
      const colors = { north: "#7fd1a6", center: "#f2d27c", south: "#a9b8c9" };
      for (const [routeId, rt] of Object.entries(D.MAP.routes)) {
        const pts = [[team ? 60 : 4, 24], ...rt.pts.map(p => [team ? W - p[0] : p[0], p[1]]), [FLAG.x, FLAG.y]];
        m.strokeStyle = colors[routeId]; m.lineWidth = 3; m.lineJoin = "round"; m.setLineDash([]);
        m.beginPath(); pts.forEach(([x, y], i) => i ? m.lineTo(x * k, y * k) : m.moveTo(x * k, y * k)); m.stroke();
        const lab = assignments && assignments[routeId];
        if (lab) briefLabel(m, lab, pts[Math.floor(pts.length / 2)][0] * k, pts[Math.floor(pts.length / 2)][1] * k, colors[routeId]);
      }
      m.fillStyle = C.brass; m.beginPath(); m.arc(FLAG.x * k, FLAG.y * k, 5, 0, 7); m.fill();
      return;
    }
    // 城：階を下から上へ、格子に並べる
    const floors = mapRef.floors, n = floors.length;
    const cols = n <= 3 ? 1 : 2, rows = Math.ceil(n / cols), pad = 4, headH = 14;
    const cw = (mw - pad * (cols + 1)) / cols, ch = (mh - pad * (rows + 1)) / rows;
    const I = intelOf(g, team);
    const cell = {};
    floors.forEach((fr, i) => {
      const ri = rows - 1 - Math.floor(i / cols), ci = i % cols;      // 下の階ほど下に
      const bx = pad + ci * (cw + pad), by = pad + ri * (ch + pad);
      const k = Math.min(cw / fr.w, (ch - headH) / fr.h);
      const ox = bx + (cw - fr.w * k) / 2, oy = by + headH + (ch - headH - fr.h * k) / 2;
      cell[fr.id] = { fr, k, X: x => ox + (x - fr.ox) * k, Y: y => oy + (y - fr.oy) * k };
      m.fillStyle = "rgba(13,18,25,0.6)"; m.fillRect(bx, by, cw, ch);
      m.drawImage(miniFor(fr), ox, oy, fr.w * k, fr.h * k);
      const flagHere = mapRef.flagFloor === fr.id && I.floorKnown;
      m.font = "bold 11px 'Yu Gothic UI','Hiragino Sans',sans-serif"; m.textAlign = "left"; m.textBaseline = "top";
      m.fillStyle = flagHere ? "#f2d27c" : "#cfd6dd";
      m.fillText(floorLabel(fr.id) + "  " + ((typeof Castle !== "undefined" && Castle.FLOOR_TITLE[fr.id]) || "") + (flagHere ? "  🚩旗の階" : "") + (fr.id === "1F" ? "  ◎開始" : ""), bx + 4, by + 2);
    });
    const at = p => { const fi = Sim.floorAt(p.x, p.y); const fr = floors[fi === 255 ? 0 : fi]; return cell[fr.id]; };
    // ルート（同じ階の点どうしだけを線で結ぶ。階段は丸印）
    const routes = mapRef.routes[team] || [];
    routes.forEach((rt, ri) => {
      const col = ROUTE_COLORS[ri % ROUTE_COLORS.length];
      const sp = mapRef.spawn[team][0];
      let pts = [sp].concat(rt.pts);
      if (I.known) pts.push(FLAG);
      else {
        const floorId = p => { const fi = Sim.floorAt(p.x, p.y); return floors[fi === 255 ? 0 : fi].id; };
        const stop = mapRef.castle.flagInfo === "floor" ? (p => floorId(p) === mapRef.flagFloor) : (p => floorId(p) !== "1F");
        const cut = pts.findIndex((p, i) => i > 0 && stop(p));
        if (cut > 0) pts = pts.slice(0, cut + 1);
      }
      m.strokeStyle = col; m.lineWidth = 2.5; m.lineJoin = "round"; m.lineCap = "round";
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], ca = at(a), cb = at(b);
        if (ca !== cb) { m.fillStyle = col; m.beginPath(); m.arc(ca.X(a.x), ca.Y(a.y), 3, 0, 7); m.fill(); m.beginPath(); m.arc(cb.X(b.x), cb.Y(b.y), 3, 0, 7); m.fill(); continue; }
        m.beginPath(); m.moveTo(ca.X(a.x), ca.Y(a.y)); m.lineTo(ca.X(b.x), ca.Y(b.y)); m.stroke();
      }
      const lab = assignments && assignments[ri];
      if (lab) { const c1 = at(sp); briefLabel(m, lab, c1.X(sp.x) + (team ? -1 : 1) * 46, c1.Y(sp.y) + (ri - (routes.length - 1) / 2) * 17 + 5, col); }
    });
    // 旗・候補
    if (I.known) { const c = at(FLAG); m.fillStyle = C.brass; m.beginPath(); m.arc(c.X(FLAG.x), c.Y(FLAG.y), 4.5, 0, 7); m.fill(); }
    else for (const rid of I.candidates) {
      const r = mapRef.rooms[rid]; if (!r) continue; const c = at({ x: r.cx, y: r.cy });
      m.strokeStyle = "#f2d27c"; m.lineWidth = 1.5; m.setLineDash([3, 2]); m.strokeRect(c.X(r.x0), c.Y(r.y0), (r.x1 - r.x0 + 1) * c.k, (r.y1 - r.y0 + 1) * c.k); m.setLineDash([]);
    }
  }
  function briefLabel(m, lab, x, y, col) {
    m.font = "bold 12px 'Yu Gothic UI','Hiragino Sans',sans-serif"; m.textAlign = "center"; m.textBaseline = "alphabetic";
    const tw = m.measureText(lab).width + 10;
    x = Math.max(tw / 2 + 2, Math.min(m.canvas.width - tw / 2 - 2, x)); y = Math.max(16, y);
    m.fillStyle = "rgba(21,34,43,0.9)"; m.fillRect(x - tw / 2, y - 12, tw, 16);
    m.fillStyle = col; m.fillText(lab, x, y);
  }

  return { init, resize, setOptions, loadAssets, draw, drawMinimap, drawBriefingMap, syncMap, get floor() { return curFloor; }, get ppm() { return ppm; }, get cam() { return cam; }, get opts() { return opts; }, sx, sy, get img() { return img; } };
})();
