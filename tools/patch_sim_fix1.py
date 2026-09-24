# -*- coding: utf-8 -*-
"""レビュー（設計図2枚との突き合わせ・87件）で見つかった sim.js の不具合をまとめて直す（1回だけ実行）。"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(ROOT, "sim.js")
s = open(p, encoding="utf-8").read()
if "function balNow(" in s:
    print("already patched"); raise SystemExit(0)

def rep(old, new, cnt=1):
    global s
    n = s.count(old)
    assert n >= 1, ("NOT FOUND: " + old[:100])
    s = s.replace(old, new, cnt)

# ===== 1. 設置物キャッシュ DYN を試合ごとに持つ（部屋をまたいで混ざらない・予告中の壁は遮らない） =====
rep('''  function step(g) {
    const dt = TICK;
    if (g.phase === "finished") return;''', '''  const DYN_KINDS = { wall: 1, zone_fog: 1, zone_dark: 1, zone_water: 1, paint_zone: 1, zone_null: 1, zone_petals: 1 };
  function bindDyn(g) { DYN = (g && g.dyn) || []; }
  function step(g) {
    const dt = TICK;
    bindDyn(g);
    if (g.phase === "finished") return;''')
rep('''    stepObjects(g, dt);
    DYN = g.objects.filter(o => o.kind === "wall" || o.kind === "zone_fog" || o.kind === "zone_dark" || o.kind === "zone_water" || o.kind === "paint_zone" || o.kind === "zone_null" || o.kind === "zone_petals");''',
'''    stepObjects(g, dt);
    g.dyn = g.objects.filter(o => DYN_KINDS[o.kind] && !(o.kind === "wall" && o.pending));   // 予告中の金剛壁はまだ実体がない
    DYN = g.dyn;''')
rep('''      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, objects: [], serial2: 0,''',
    '''      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, lastExpose: {}, objects: [], dyn: [], camoMarks: [], serial2: 0,''')
rep('''      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, objects: [] });''',
    '''      xp: [0, 0], level: [1, 1], xpLog: [], holdT: [0, 0], revealXp: {}, hp0Xp: {}, lastExpose: {}, objects: [], dyn: [], camoMarks: [] });
    DYN = g.dyn;''')
rep('''  function snapshot(g, viewerId) {
    const v = g.players.find(p => p.id === viewerId);''', '''  function snapshot(g, viewerId) {
    bindDyn(g);
    const v = g.players.find(p => p.id === viewerId);''')
rep('''  function effectVisible(g, viewerId, e) {
    const v = g.players.find(p => p.id === viewerId);''', '''  function effectVisible(g, viewerId, e) {
    bindDyn(g);
    const v = g.players.find(p => p.id === viewerId);''')
rep('''  function dynBlocksMove(x, y, r) {
    for (const o of DYN) if (o.kind === "wall" && segDist(x, y, o.ax, o.ay, o.bx, o.by) < r + 0.25) return true;''',
    '''  function dynBlocksMove(x, y, r) {
    for (const o of DYN) if (o.kind === "wall" && !o.pending && segDist(x, y, o.ax, o.ay, o.bx, o.by) < r + 0.25) return true;''')
rep('''      if (o.kind === "wall" && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return true;''',
    '''      if (o.kind === "wall" && !o.pending && segsCross(ax, ay, bx, by, o.ax, o.ay, o.bx, o.by)) return true;''')
rep('''(DYN.length && DYN.some(o => o.kind === "wall" && segsCross(ox, oy, s.x, s.y, o.ax, o.ay, o.bx, o.by)))''',
    '''(DYN.length && DYN.some(o => o.kind === "wall" && !o.pending && segsCross(ox, oy, s.x, s.y, o.ax, o.ay, o.bx, o.by)))''')

# ===== 2. プレイヤーの初期値 =====
rep('''      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, crossedCenter: false, lastSide: 0,''',
    '''      perks: {}, pendingLevel: 0, pickT: 0, ult: { used: false, active: 0 }, firstHitCd: 0, firstHitArmed: false, crossedCenter: false, lastSide: 0, protectBonus: 0, soulBoosted: false,''')

# ===== 3. 帰還：強化・固有技の状態をすべて片付ける（onEnd の後始末を残さない） =====
rep('''    p.hp = p.hpMax; p.exposed = 0; p.healT = 0; p.healBy = null; p.crossedCenter = false; p.stunT = 0; p.mods = p.mods.filter(m => m.keep);''',
    '''    p.hp = p.hpMax; p.exposed = 0; p.healT = 0; p.healBy = null; p.crossedCenter = false; p.stunT = 0; p.aimJitter = 0; p.silentT = 0;
    p.mods = []; p.sk = {}; p.firstHitArmed = false;''')

# ===== 4. 可視：狐駆けの上書きをやめる／足音（狐駆け＝布の揺れが大きい・紫煙の足跡） =====
rep('''    const closeSee = q.closeSeeOverride || R.closeSee;
    if (q.camo === 2 && q.reveal <= 0 && d >= closeSee) return false;''',
    '''    if (q.camo === 2 && q.reveal <= 0 && d >= R.closeSee) return false;''')
rep('''    if (src.silentT > 0 || inZone("zone_water", src.x, src.y, src.team)) return false;
    let r = src.camo === 2 ? R.footCamo : src.crouch ? R.footCrouch : R.footRun;''',
    '''    if (src.silentT > 0 || inZone("zone_water", src.x, src.y, src.team)) return false;
    // 紫煙から出た直後は足跡が残る（視程内の敵には方向が伝わる）
    if (listener.team !== src.team && modHas(src, "fogTrail") && dist(listener, src) <= R.viewRange) return true;
    let r = src.camo === 2 ? (modHas(src, "foxdash") ? R.footCrouch : R.footCamo) : src.crouch ? R.footCrouch : R.footRun;   // 狐駆け：布の揺れが大きい''')

# ===== 5. 1tick の状態更新 =====
rep('''      if (p.pendingLevel) { p.pickT -= dt; if (p.pickT <= 0 || p.bot) choosePerk(g, p, p.bot ? null : null); }
      if (p.hp >= p.hpMax && p.firstHitCd <= 0) p.firstHitArmed = true;
      // 露見：12秒で自動帰還。自陣に入れば即復帰
      if (p.exposed > 0) {
        p.exposed = Math.max(0, p.exposed - dt);
        p.reveal = Math.max(p.reveal, 0.2);
        if (p.camo) unhide(g, p, true);''',
'''      if (p.pendingLevel) { p.pickT -= dt; if (p.pickT <= 0 || p.bot) choosePerk(g, p, null); }
      // 護Lv3 最初の一印：満タンのときだけ構える（減ったら外す）
      p.firstHitArmed = hasPerk(p, "護", 3) && p.hp >= p.hpMax && p.firstHitCd <= 0;
      // 固有技の待機（守り兎8秒・変わり身・追香）は時間で切れる
      for (const k2 of ["shield", "kawarimi", "poisonArmed"]) if (p.sk[k2] > 0) p.sk[k2] = Math.max(0, p.sk[k2] - dt);
      // 逢魔刻：自身が常に可視化される（位置が明確）
      if (modHas(p, "visible")) p.reveal = Math.max(p.reveal, 0.15);
      // 露見：12秒で自動帰還。自陣に入れば即復帰（敵からは射線内で見える＝canSee）
      if (p.exposed > 0) {
        p.exposed = Math.max(0, p.exposed - dt);
        if (p.camo) unhide(g, p, true);''')
rep('''        if (p.returning <= 0) p.protect = R.protect;''',
    '''        if (p.returning <= 0) { p.protect = R.protect + (p.protectBonus || 0); p.protectBonus = 0; p.soulBoosted = false; }''')
# 露見・気絶・構え中の入力整理。追風は曲がると落ちる
rep('''      let moving = Math.hypot(i.x, i.y) > 0.1;
      if (i.angle != null) p.angle = i.angle;
      else if (moving) p.angle = Math.atan2(i.y, i.x);''',
'''      let moving = Math.hypot(i.x, i.y) > 0.1;
      if (i.angle != null) p.angle = i.angle;
      else if (moving) p.angle = Math.atan2(i.y, i.x);
      const B = balNow(p);
      {
        const tw = p.mods.find(m => m.k === "tailwind");
        if (tw && moving && Math.abs(angDiff(Math.atan2(i.y, i.x), tw.dir)) > Math.PI / 4) {
          p.mods = p.mods.filter(m => m.src !== "tailwind" && m.k !== "tailwind");   // 曲がると加速が落ちる
          emit(g, "wind_end", p.x, p.y, { team: p.team, life: 0.4 });
        }
      }''')
rep('''          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo && p.hp >= R.hp.minCamoHp && !(p.sk.channel) && !modHas(p, "noCamo")) {
            let enter = R.camoEnter * p.bal.camoEnterMul - (hasPerk(p, "影", 4) ? 0.1 : 0) - (inZone("zone_petals", p.x, p.y, p.team) ? 0.4 : 0);
            p.camo = 1; p.camoEnter = Math.max(0.2, enter); p.camoPattern = z;
          }''',
'''          if (p.protect <= 0 && p.camoCd <= 0 && p.reveal <= 0 && z && !moving && dist(p, FLAG) > R.flagNoCamo && p.hp >= R.hp.minCamoHp && !(p.sk.channel) && !modHas(p, "noCamo")) {
            const petals = inZone("zone_petals", p.x, p.y, p.team);
            let enter = R.camoEnter * B.camoEnterMul - (hasPerk(p, "影", 4) ? 0.1 : 0) - (petals ? (petals.faster || 0.4) : 0);
            p.camo = 1; p.camoEnter = Math.max(0.2, enter); p.camoPattern = z;
            // 擬態開始痕（白蛇が拾う）
            g.camoMarks.push({ x: p.x, y: p.y, team: p.team, id: p.id, t: g.elapsed });
            if (g.camoMarks.length > 60) g.camoMarks.shift();
          }''')
rep('''            p.camo = 2; p.camoEnter = 0; p.camoTime = (g.overtime ? R.camoOvertime : R.camoDuration) * p.bal.camoDurMul + (hasPerk(p, "影", 4) ? 3 : 0);''',
    '''            p.camo = 2; p.camoEnter = 0; p.camoTime = (g.overtime ? R.camoOvertime : R.camoDuration) * B.camoDurMul + (hasPerk(p, "影", 4) ? 3 : 0);''')
rep('''      let base = p.camo === 2 ? R.camoSpeed * p.bal.camoSpeedMul : p.crouch ? R.crouchSpeed * p.bal.speedMul * (hasPerk(p, "影", 2) ? 1.1 : 1) : R.speed * p.bal.speedMul;
      if (p.camo === 2 && (modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影"))) base = R.speed * 0.7;
      let speed = base * (p.slow > 0 ? p.bal.slowFactor : 1) * (p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1) * modMul(p, "speed");
      if (p.exposed > 0) speed = R.speed * p.bal.exposeMove;
      if (p.sk.channel && p.sk.channel.speedMul != null) speed *= p.sk.channel.speedMul;
      if (inZone("zone_null", p.x, p.y) && p.sk.ownsNull) speed *= 0.7;''',
'''      let base = p.camo === 2 ? R.camoSpeed * B.camoSpeedMul : p.crouch ? R.crouchSpeed * p.bal.speedMul * (hasPerk(p, "影", 2) ? 1.1 : 1) : R.speed * p.bal.speedMul;
      if (p.camo === 2 && (modHas(p, "camoFast") || (p.ult.active > 0 && p.perks[5] === "影"))) base = R.speed * 0.7;
      const difMul = p.bot && !p.controller && g.difficulty.speedMul ? g.difficulty.speedMul : 1;
      let speed = base * (p.slow > 0 ? p.bal.slowFactor : 1) * difMul * modMul(p, "speed");
      if (p.exposed > 0) speed = R.speed * p.bal.speedMul * p.bal.exposeMove * difMul;   // 露見：本人の速さの70%（逃走で±）
      if (p.sk.channel && p.sk.channel.speedMul != null) speed *= p.sk.channel.speedMul;
      if (DYN.some(o => o.kind === "zone_null" && o.owner === p.id && Math.hypot(p.x - o.x, p.y - o.y) <= o.r)) speed *= 0.7;   // 罪業：本人も遅くなる''')
# 見破り：能力値（猫の目の白目を含む）・暗幕を1秒短縮・perk は見破りと被弾だけ
rep('''        p.scanCd = (g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown) * p.bal.scanCdMul;''',
    '''        p.scanCd = (g.practice ? R.scanPractice : g.overtime ? R.scanOvertime : R.scanCooldown) * B.scanCdMul;''')
rep('''          const range = R.scanRange + p.bal.scanRangeAdd + (hasPerk(p, "技", 3) ? 0.5 : 0) + modAdd(p, "scanRange");''',
    '''          const range = R.scanRange + B.scanRangeAdd + (hasPerk(p, "技", 3) ? 0.5 : 0);''')
rep('''              setReveal(q, R.revealDuration); unhide(g, q); hit++; p.stats.reveals++;''',
    '''              setReveal(q, R.revealDuration, true); unhide(g, q); hit++; p.stats.reveals++;''')
rep('''          // 分身・描景も見破りに反応する
          for (const o of g.objects) {
            if (o.team === p.team || o.dead) continue;''',
'''          // 分身・描景・暗幕も見破りに反応する
          for (const o of g.objects) {
            if (o.team === p.team || o.dead) continue;
            if (o.kind === "zone_dark" && dist(p, o) <= range + o.r && (dist(p, o) <= o.r || Math.abs(angDiff(Math.atan2(o.y - p.y, o.x - p.x), p.angle)) <= R.scanAngle / 2)) { o.life = Math.max(0.05, o.life - 1); hit++; continue; }   // 漆黒：見破りで1秒短縮''')
# 印投げ：無刀取りは構えの値を読む・花隠れは攻撃で終わる
rep('''        const counter = g.players.find(q => q.team !== p.team && q.sk.channel && q.sk.channel.kind === "counter_stance" && dist(p, q) <= 2 && Math.abs(angDiff(Math.atan2(p.y - q.y, p.x - q.x), q.angle)) <= 0.9);
        if (counter) { p.stunT = 0.8; emit(g, "parry", p.x, p.y, { team: counter.team, life: 0.6 }); logEvent(g, "countered", { by: counter.id, id: p.id, team: counter.team }); }''',
'''        const counter = g.players.find(q => q.team !== p.team && q.sk.channel && q.sk.channel.kind === "counter_stance" && dist(p, q) <= q.sk.channel.reach && Math.abs(angDiff(Math.atan2(p.y - q.y, p.x - q.x), q.angle)) <= 0.9);
        // 花隠れ：範囲内の味方が攻撃すると恩恵は即終了
        for (const o of g.objects) if (o.kind === "zone_petals" && o.team === p.team && !o.dead && dist(p, o) <= o.r) { o.dead = true; emit(g, "petals_end", o.x, o.y, { team: o.team, life: 0.5 }); }
        if (counter) { p.stunT = counter.sk.channel.stun; emit(g, "parry", p.x, p.y, { team: counter.team, life: 0.6 }); logEvent(g, "countered", { by: counter.id, id: p.id, team: counter.team }); }''')
# 弾道：水鏡の減速は設置時の値・白蛇は印で消える・露見中の相手には当たらない
rep('''      if (inZone("zone_water", s.x, s.y, 1 - s.team)) sp *= 0.8;       // 水鏡：敵の飛び道具が20%遅くなる''',
    '''      { const w = inZone("zone_water", s.x, s.y, 1 - s.team); if (w) sp *= 1 - (w.projSlow != null ? w.projSlow : 0.2); }   // 水鏡：敵の飛び道具が遅くなる''')
rep('''        const dc = g.objects.find(o => !o.dead && (o.kind === "decoy_run" || o.kind === "echo_clone" || o.kind === "decoy_static") && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + R.bodyRadius);
        if (dc) { dead = true; dc.dead = true; emit(g, "hit", dc.x, dc.y, { team: s.team, decoy: true }); break; }
        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);''',
'''        const dc = g.objects.find(o => !o.dead && (o.kind === "decoy_run" || o.kind === "echo_clone" || o.kind === "decoy_static") && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + R.bodyRadius);
        if (dc) { dead = true; dc.dead = true; emit(g, "hit", dc.x, dc.y, { team: s.team, decoy: true }); break; }
        const sn = g.objects.find(o => !o.dead && o.kind === "snake" && o.team !== s.team && Math.hypot(s.x - o.x, s.y - o.y) < R.shotRadius + 0.35);
        if (sn) { dead = true; sn.dead = true; emit(g, "shot_end", sn.x, sn.y, { life: 0.3 }); break; }   // 白蛇は印で消せる
        const q = g.players.find(p => p.team !== s.team && p.returning <= 0 && p.protect <= 0 && p.exposed <= 0 && dist(s, p) < R.shotRadius + R.bodyRadius);   // 露見中は的にならない''')

# ===== 6. 補助関数：能力値の一時加算（猫の目）・強化の重複は長い方だけ・可視化の系統補正は見破り/被弾のみ =====
rep('''  function setReveal(q, sec) { q.reveal = Math.max(q.reveal, sec - (hasPerk(q, "影", 3) ? 0.5 : 0) - (modHas(q, "revealCut") ? sec * 0.2 : 0)); }''',
'''  // 影Lv3 残り香断ちは「見破り・被弾による可視化」だけに効く（固有技の可視化には効かない）
  function setReveal(q, sec, perkable) { q.reveal = Math.max(q.reveal, sec - (perkable && hasPerk(q, "影", 3) ? 0.5 : 0)); }
  // 猫の目（白目＝索敵+1／黒目＝擬態+1・最大5）を含めた、いまの係数
  function balNow(p) {
    const cb = modHas(p, "eyeBlack") && p.bal.stats.camo < 5, sb = modHas(p, "eyeWhite") && p.bal.stats.scout < 5;
    if (!cb && !sb) return p.bal;
    const b = Object.assign({}, p.bal);
    if (cb) { b.camoDurMul += 0.10; b.camoEnterMul -= 0.08; b.camoSpeedMul += 0.10; }
    if (sb) { b.scanRangeAdd += 0.5; b.scanCdMul -= 0.06; }
    return b;
  }''')
rep('''  function addMod(p, k, t, extra) { p.mods.push(Object.assign({ k, t }, extra || {})); }''',
'''  // 同じ固有技の重複効果は加算せず、長い残り時間だけを採用する（設計図「実装基準」）
  function addMod(p, k, t, extra) {
    const src = (extra && extra.src) || k;
    const ex = p.mods.find(m => m.src === src);
    if (ex) { if (t > ex.t) Object.assign(ex, extra || {}, { k, t, src }); return ex; }
    const m = Object.assign({ k, t, src }, extra || {}); p.mods.push(m); return m;
  }''')

# ===== 7. 被弾・露見・XP =====
rep('''    if (q.sk.channel && q.sk.channel.kind === "parry" && Math.abs(angDiff(Math.atan2(s.x - q.x, s.y - q.y) * 0 + Math.atan2(-s.dy, -s.dx), q.angle)) <= 1.05) { emit(g, "parry", q.x, q.y, { team: q.team, life: 0.6 }); return; }
    if (q.sk.kawarimi > 0) {
      q.sk.kawarimi = 0;
      const ix = q.input.x, iy = q.input.y, l = Math.hypot(ix, iy);
      const ang = l > 0.1 ? Math.atan2(iy, ix) : q.angle;
      emit(g, "kawarimi", q.x, q.y, { team: q.team, angle: ang, life: 0.5 });
      for (let d = 3; d > 0.5; d -= 0.5) {''',
'''    // 双龍円：前方から来た「最初の印」だけを落として構えを解く
    if (q.sk.channel && q.sk.channel.kind === "parry" && Math.abs(angDiff(Math.atan2(-s.dy, -s.dx), q.angle)) <= 1.05) { q.sk.channel = null; emit(g, "parry", q.x, q.y, { team: q.team, life: 0.6 }); return; }
    if (q.sk.kawarimi > 0) {
      q.sk.kawarimi = 0; q.mods = q.mods.filter(m => m.k !== "kawarimiArm");
      const ix = q.input.x, iy = q.input.y, l = Math.hypot(ix, iy);
      const ang = l > 0.1 ? Math.atan2(iy, ix) : q.angle;
      emit(g, "kawarimi", q.x, q.y, { team: q.team, angle: ang, life: q.sk.smokeSec || 0.5 });
      for (let d = q.sk.blink || 3; d > 0.5; d -= 0.5) {''')
rep('''    let dmg = dmgOf(g, owner, q, s);
    let slow = true;
    if (q.sk.shield > 0) { q.sk.shield = 0; dmg = Math.max(1, dmg - 8); slow = false; emit(g, "shield", q.x, q.y, { team: q.team, life: 0.6 }); }
    q.invuln = R.hitInvuln; setReveal(q, R.revealDuration); if (slow) q.slow = R.slowDuration;''',
'''    const dmg = dmgOf(g, owner, q, s);
    let slow = true, revealSec = R.revealDuration;
    // 守り兎：8秒以内の最初の減速を無効化し、印の残り時間（＝被弾の可視化）を3秒減らす
    if (q.sk.shield > 0) { q.sk.shield = 0; slow = false; revealSec = Math.max(0, revealSec - (q.sk.shieldCut || 3)); q.mods = q.mods.filter(m => m.k !== "shield"); emit(g, "shield", q.x, q.y, { team: q.team, life: 0.6 }); }
    q.invuln = R.hitInvuln; if (revealSec > 0) setReveal(q, revealSec, true); if (slow) q.slow = R.slowDuration;''')
rep('''    if (s.poison) { addMod(q, "tracked", 6, { by: s.team }); }
    if (owner && owner.sk.channel && owner.sk.channel.kind === "berserk") { /* 補正は dmgOf 側 */ }''',
    '''    if (s.poison) { addMod(q, "tracked", s.poisonDur || 6, { by: s.team }); }''')
rep('''    if (by) { const key = by.team + ":" + q.id; if (!(g.hp0Xp[key] > g.elapsed - 20)) { g.hp0Xp[key] = g.elapsed; addXp(g, by.team, R.hp.xp.hp0, "hp0"); } }''',
    '''    // HP0 +12：同じ敵の再露見からは20秒間0（露見のたびに時刻を更新）
    const last = g.lastExpose[q.id];
    g.lastExpose[q.id] = g.elapsed;
    if (by && !(last > g.elapsed - 20)) addXp(g, by.team, R.hp.xp.hp0, "hp0");''')
rep('''      for (const p of g.players) if (p.team === team) { p.pendingLevel = L; p.pickT = R.hp.pickSec;''',
    '''      for (const p of g.players) if (p.team === team) { if (p.pendingLevel) choosePerk(g, p, null); p.pendingLevel = L; p.pickT = R.hp.pickSec;''')

# ===== 8. 固有技 =====
rep('''  function useSkill(g, p, opt) {
    const sk = p.bal.skill;
    if (!sk || p.skillCd > 0 || p.exposed > 0 || p.returning > 0 || p.protect > 0 || p.sk.channel) return;
    if (inZone("zone_null", p.x, p.y) && !p.sk.ownsNull) return;   // 罪業：中では固有技が使えない
    const P = sk.params || {}, k = sk.kind;''',
'''  function enemyNullAt(p) { return DYN.some(o => o.kind === "zone_null" && o.team !== p.team && Math.hypot(p.x - o.x, p.y - o.y) <= o.r); }
  // 線状の設置物（残火・棘道）を壁で切る
  function clipRay(p, len) {
    let ex = p.x, ey = p.y;
    for (let d = 0.25; d <= len + 1e-6; d += 0.25) { const nx = p.x + Math.cos(p.angle) * d, ny = p.y + Math.sin(p.angle) * d; if (SOLID[cellAt(nx, ny)] || !lineClear(p.x, p.y, nx, ny)) break; ex = nx; ey = ny; }
    return { x: ex, y: ey };
  }
  // 影穴の出口：入口から最大 range 先（壁で止まる・柄の上を優先）
  function gateExitPoint(p, gate, range) {
    let best = null, bestZone = null;
    for (let d = 0.5; d <= range + 1e-6; d += 0.25) {
      const nx = gate.x + Math.cos(p.angle) * d, ny = gate.y + Math.sin(p.angle) * d;
      if (blocked(nx, ny, R.bodyRadius, p.team) || !lineClear(gate.x, gate.y, nx, ny)) break;
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
        if (dist(p, gate) > 1.5) return;
        const ex = gateExitPoint(p, gate, P0.range || 5); if (!ex) return;
        gate.exit = ex; gate.life = P0.followSec || 3; gate.enemyUsed = false;
        emit(g, "gate", p.x, p.y, { team: p.team, tx: ex.x, ty: ex.y, life: 0.8 });
        unhide(g, p); p.x = ex.x; p.y = ex.y; p.px = ex.x; p.py = ex.y;   // 一度だけ移動する
        return;
      }
    }
    if (p.skillCd > 0 || p.protect > 0 || p.sk.channel) return;
    if (enemyNullAt(p)) return;   // 罪業：中の敵は固有技を使えない（味方・本人は使える）
    const P = sk.params || {}, k = sk.kind;''')
rep('''      case "trail_reveal": { const a = aheadPos(p, num(P.len, 6)); addObj(g, { kind: "trail", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.life, 3), revealSec: num(P.revealSec, 1.5) }); fire(); break; }''',
'''      case "trail_reveal": {
        const a = clipRay(p, num(P.len, 6));   // 壁越しには届かない
        const tr = addObj(g, { kind: "trail", team: p.team, owner: p.id, ax: p.x, ay: p.y, bx: a.x, by: a.y, x: (p.x + a.x) / 2, y: (p.y + a.y) / 2, life: num(P.life, 3), revealSec: num(P.revealSec, 1.5) });
        fireVsWater(g, tr, (w) => segDist(w.x, w.y, tr.ax, tr.ay, tr.bx, tr.by) <= w.r);   // 火遁で水鏡を2秒短縮・残火は水遁で消える
        fire(); break; }''')
rep('''      case "track_nearest": addObj(g, { kind: "track", team: p.team, owner: p.id, x: p.x, y: p.y, life: num(P.dur, 8), radius: num(P.radius, 9), delay: num(P.delay, 2), hist: [], next: 0 }); fire(); break;
      case "substitution": p.sk.kawarimi = num(P.armSec, 8); addMod(p, "kawarimiArm", num(P.armSec, 8)); fire(); break;
      case "zone_water": addObj(g, { kind: "zone_water", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 2.5), life: num(P.dur, 5) }); fire(); break;''',
'''      case "track_nearest": addObj(g, { kind: "track", team: p.team, owner: p.id, x: p.x, y: p.y, life: num(P.dur, 8), radius: num(P.radius, 9), delay: num(P.delay, 2), hist: [], next: 0 }); fire(); break;
      case "substitution": p.sk.kawarimi = num(P.armSec, 8); p.sk.blink = num(P.blink, 3); p.sk.smokeSec = num(P.smokeSec, 0.5); addMod(p, "kawarimiArm", num(P.armSec, 8)); fire(); break;
      case "zone_water": addObj(g, { kind: "zone_water", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 2.5), life: num(P.dur, 5), projSlow: num(P.projSlow, 0.2) }); fire(); break;''')
rep('''      case "ally_shield": { const t = nearestAlly(g, p, num(P.range, 8)) || p; t.sk.shield = num(P.dur, 8); addMod(t, "shield", num(P.dur, 8)); emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }''',
    '''      case "ally_shield": { const t = nearestAlly(g, p, num(P.range, 8)) || p; t.sk.shield = num(P.dur, 8); t.sk.shieldCut = num(P.markReduceSec, 3); addMod(t, "shield", num(P.dur, 8)); t.mods = t.mods.filter(m => m.k !== "tracked"); emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }   // 守り兎は追香も除く''')
rep('''      case "poison_mark": p.sk.poisonArmed = num(P.armSec, 10); fire(); break;
      case "berserk": { const d = num(P.dur, 8); addMod(p, "atk", d, { mul: 1 + (5 - p.bal.stats.atk) * 0.12 / (1 + (p.bal.stats.atk - 3) * 0.12) }); addMod(p, "def", d, { mul: (1 - 2 * 0.08) / p.bal.takenMul }); addMod(p, "noCamo", d); addMod(p, "visible", d); addMod(p, "berserkTail", d, { onEnd: (gg, pp) => addMod(pp, "speed", num(P.afterSlowSec, 2), { mul: 0.9 }) }); unhide(g, p); fire(); break; }''',
'''      case "poison_mark": p.sk.poisonArmed = num(P.armSec, 10); p.sk.poisonDur = num(P.dur, 6); fire(); break;
      case "berserk": { const d = num(P.dur, 8); addMod(p, "atk", d, { src: "berserkAtk", mul: (1 + 2 * 0.12) / (1 + (p.bal.stats.atk - 3) * 0.12) }); addMod(p, "def", d, { src: "berserkDef", mul: (1 - 2 * 0.08) / p.bal.takenMul }); addMod(p, "noCamo", d); addMod(p, "visible", d); addMod(p, "berserkTail", d, { onEnd: (gg, pp) => addMod(pp, "speed", num(P.afterSlowSec, 2), { src: "berserkSlow", mul: 0.9 }) }); unhide(g, p); fire(); break; }''')
rep('''      case "zone_petals": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_petals", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2.5), life: num(P.dur, 5) }); fire(); break; }
      case "tailwind": addMod(p, "speed", num(P.dur, 4), { mul: 1 + num(P.speedBonus, 0.15) }); addMod(p, "tailwind", num(P.dur, 4)); fire(); break;
      case "sacrifice": { if (p.hp >= p.hpMax) return; p.hp = Math.min(p.hpMax, p.hp + 15); addMod(p, "shotCd", num(P.dur, 4), { mul: 0.6, onEnd: (gg, pp) => addMod(pp, "def", num(P.afterSec, 6), { mul: 1.16 / pp.bal.takenMul }) }); fire(); break; }
      case "cleanse": { for (const q of g.players) if (q.team === p.team && q.returning <= 0 && dist(p, q) <= num(P.r, 4)) { q.mods = q.mods.filter(m => m.k !== "tracked" && m.k !== "hexed"); if (q.exposed <= 0) q.hp = Math.min(q.hpMax, q.hp + num(P.heal, 10)); q.reveal = Math.max(0, q.reveal - 2); emit(g, "buff", q.x, q.y, { team: p.team, life: 0.8 }); } addObj(g, { kind: "halo", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 4), life: 1 }); fire(); break; }''',
'''      case "zone_petals": { const c = aheadPos(p, 2); addObj(g, { kind: "zone_petals", team: p.team, owner: p.id, x: c.x, y: c.y, r: num(P.r, 2.5), life: num(P.dur, 5), faster: num(P.camoStartFaster, 0.4) }); fire(); break; }
      case "tailwind": addMod(p, "speed", num(P.dur, 4), { src: "tailwind", mul: 1 + num(P.speedBonus, 0.15) }); addMod(p, "tailwind", num(P.dur, 4), { dir: p.angle }); fire(); break;
      case "sacrifice": { if (p.hp >= p.hpMax) return; p.hp = Math.min(p.hpMax, p.hp + num(P.heal, 15)); addMod(p, "shotCd", num(P.dur, 4), { src: "sacrificeShot", mul: 0.6, onEnd: (gg, pp) => addMod(pp, "def", num(P.afterSec, 6), { src: "sacrificeDef", mul: (1 + 2 * 0.08) / pp.bal.takenMul }) }); fire(); break; }   // 「印を一つ消す」＝HP回復に読み替え（HPが満タンだと使えない）
      case "cleanse": { for (const q of g.players) if (q.team === p.team && q.returning <= 0 && dist(p, q) <= num(P.r, 4)) { q.mods = q.mods.filter(m => m.k !== "tracked" && m.k !== "fogTrail"); q.reveal = Math.max(0, q.reveal - num(P.revealCut, 2)); emit(g, "buff", q.x, q.y, { team: p.team, life: 0.8 }); } addObj(g, { kind: "halo", team: p.team, owner: p.id, x: p.x, y: p.y, r: num(P.r, 4), life: 1 }); fire(); break; }   // 追香・足跡を除き、印の残り時間（可視化）を2秒減らす''')
rep('''      case "leap": { const d = num(P.dist, 4); let done = false; for (let dd = d; dd > 0.5 && !done; dd -= 0.5) { const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd; if (!blocked(nx, ny, R.bodyRadius, p.team) && lineClear(p.x, p.y, nx, ny)) { emit(g, "leap", p.x, p.y, { team: p.team, tx: nx, ty: ny, life: 0.5 }); p.x = nx; p.y = ny; p.px = nx; p.py = ny; done = true; } } for (const q of g.players) if (q.team !== p.team && dist(p, q) <= num(P.jitterR, 2)) q.aimJitter = num(P.jitterSec, 0.6); unhide(g, p); fire(); break; }''',
'''      case "leap": {
        // 着地点を決めて0.3秒予告（壁と罪業の境目を越えない）
        const d = num(P.dist, 4), inNull0 = DYN.some(o => o.kind === "zone_null" && Math.hypot(p.x - o.x, p.y - o.y) <= o.r);
        let tgt = null;
        for (let dd = 0.5; dd <= d + 1e-6; dd += 0.25) {
          const nx = p.x + Math.cos(p.angle) * dd, ny = p.y + Math.sin(p.angle) * dd;
          if (blocked(nx, ny, R.bodyRadius, p.team) || !lineClear(p.x, p.y, nx, ny)) break;
          if (DYN.some(o => o.kind === "zone_null" && Math.hypot(nx - o.x, ny - o.y) <= o.r) !== inNull0) break;
          tgt = { x: nx, y: ny };
        }
        if (!tgt) return;
        p.sk.channel = { kind: "leap", t: num(P.warnSec, 0.3), tx: tgt.x, ty: tgt.y, jitterR: num(P.jitterR, 2), jitterSec: num(P.jitterSec, 0.6), freeze: true, noShot: true };
        emit(g, "leap_warn", tgt.x, tgt.y, { team: p.team, life: num(P.warnSec, 0.3) });
        unhide(g, p); fire(); break; }''')
rep('''      case "smash": p.sk.channel = { kind: "smash", t: num(P.windup, 0.9), reach: num(P.reach, 2.5), push: num(P.push, 3), freeze: true, noShot: true }; fire(); break;''',
    '''      case "smash": p.sk.channel = { kind: "smash", t: num(P.windup, 0.9), reach: num(P.reach, 2.5), push: num(P.push, 3), missStun: num(P.missStun, 1), freeze: true, noShot: true }; fire(); break;''')
rep('''      case "hex": { let best = null, bd = num(P.range, 8); for (const q of g.players) if (q.team !== p.team && canSee(p, q) && dist(p, q) < bd) { bd = dist(p, q); best = q; } if (!best) return; addMod(best, "hexed", num(P.dur, 4), { by: p.id, range: num(P.range, 8), cdDelay: num(P.cdDelay, 4), applied: false }); emit(g, "hex", best.x, best.y, { team: p.team, target: best.id, life: 1 }); fire(); break; }
      case "cat_choice": { const white = opt === "white" || (opt == null && g.players.some(q => q.team !== p.team && canSee(p, q))); if (white) addMod(p, "scanRange", num(P.dur, 5), { add: 0.5 }); else { addMod(p, "camoBonus", num(P.dur, 5)); } addMod(p, white ? "eyeWhite" : "eyeBlack", num(P.dur, 5)); fire(); break; }''',
'''      case "hex": {
        let best = null, bd = num(P.range, 8); for (const q of g.players) if (q.team !== p.team && q.exposed <= 0 && canSee(p, q) && dist(p, q) < bd) { bd = dist(p, q); best = q; } if (!best) return;
        const range = num(P.range, 8), delay = num(P.cdDelay, 4), casterId = p.id;
        // 4秒後にまだ術者の8m以内なら、固有技の回復を4秒遅らせる（離れれば不発）
        addMod(best, "hexed", num(P.dur, 4), { onEnd: (gg, pp) => { const by = gg.players.find(x => x.id === casterId); if (by && by.returning <= 0 && pp.returning <= 0 && dist(by, pp) <= range) { pp.skillCd += delay; emit(gg, "hex", pp.x, pp.y, { team: by.team, target: pp.id, life: 1 }); } } });
        emit(g, "hex", best.x, best.y, { team: p.team, target: best.id, life: 1 }); fire(); break; }
      case "cat_choice": { const white = opt === "white" || (opt == null && g.players.some(q => q.team !== p.team && canSee(p, q))); addMod(p, white ? "eyeWhite" : "eyeBlack", num(P.dur, 5)); fire(); break; }   // 係数は balNow() が読む''')
rep('''      case "soul_return": { const t = g.players.find(q => q.team === p.team && q !== p && (q.returning > 0 || q.exposed > 0)); if (!t) return; if (t.returning > 0) { t.returning = Math.max(0.1, t.returning - num(P.returnCut, 1.5)); t.protectBonus = num(P.protectAdd, 1); } else { t.exposed = Math.max(0.1, t.exposed - 3); } emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }''',
    '''      case "soul_return": { const t = g.players.find(q => q.team === p.team && q !== p && q.returning > 0 && !q.soulBoosted); if (!t) return; t.returning = Math.max(0.1, t.returning - num(P.returnCut, 1.5)); t.protectBonus = num(P.protectAdd, 1); t.soulBoosted = true; emit(g, "buff", t.x, t.y, { team: p.team, life: 0.8 }); fire(); break; }   // 帰還中の味方だけ・同じ帰還へ一度だけ''')
rep('''      case "fox_dash": { const d = num(P.dur, 6); addMod(p, "camoFast", d); p.closeSeeOverride = num(P.closeSee, 1.5); addMod(p, "foxdash", d, { onEnd: (gg, pp) => { pp.closeSeeOverride = null; } }); fire(); break; }
      case "counter_stance": p.sk.channel = { kind: "counter_stance", t: num(P.dur, 1.1), reach: num(P.reach, 2), stun: num(P.stun, 0.8), freeze: true, noShot: true }; unhide(g, p); fire(); break;
      case "shadow_gate": { const gate = g.objects.find(o => o.kind === "gate" && o.owner === p.id && !o.exit); if (gate) { if (dist(p, gate) <= num(P.range, 5)) { gate.exit = { x: p.x, y: p.y }; gate.life = num(P.followSec, 3); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); } return; } addObj(g, { kind: "gate", team: p.team, owner: p.id, x: p.x, y: p.y, r: 0.8, life: num(P.window, 6), exit: null }); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); fire(); break; }''',
'''      case "fox_dash": { const d = num(P.dur, 6); addMod(p, "camoFast", d); addMod(p, "foxdash", d); fire(); break; }   // 対処：布の揺れ（足音）が大きく、近距離（2.1m以内）では輪郭が見える
      case "counter_stance": p.sk.channel = { kind: "counter_stance", t: num(P.dur, 1.1), reach: num(P.reach, 2), stun: num(P.stun, 0.8), speedMul: 0.7, noShot: true }; unhide(g, p); fire(); break;   // 構えたまま下がれる
      case "shadow_gate": addObj(g, { kind: "gate", team: p.team, owner: p.id, x: p.x, y: p.y, r: 0.8, life: num(P.window, 6), exit: null }); emit(g, "gate", p.x, p.y, { team: p.team, life: 0.8 }); fire(); break;''')

# ===== 9. 詠唱の完了 =====
rep('''    if (c.kind === "tempo") { c.acc = (c.acc || 0) + dt; if (c.acc >= 1) { c.acc -= 1; for (const q of g.players) if (q.team === p.team && q !== p && dist(p, q) <= c.r) q.skillCd = Math.max(0, q.skillCd - c.cdReduce / 5); } }
''', '')
rep('''      case "zone_null_setup": { addObj(g, { kind: "zone_null", team: p.team, owner: p.id, x: p.x, y: p.y, r: c.r, life: c.dur }); p.sk.ownsNull = true; addMod(p, "ownsNull", c.dur, { onEnd: (gg, pp) => { pp.sk.ownsNull = false; } }); break; }
      case "smash": { const a = aheadPos(p, c.reach / 2); let hit = 0; for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && dist(a, q) <= c.reach) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); } for (const o of g.objects) if (dist(a, o) <= c.reach + (o.r || 0)) { if (o.kind === "wall") o.dead = true; else if (o.team !== p.team) o.dead = true; } if (!hit) p.stunT = 1; emit(g, "smash", a.x, a.y, { team: p.team, life: 0.5 }); break; }''',
'''      case "zone_null_setup": { addObj(g, { kind: "zone_null", team: p.team, owner: p.id, x: p.x, y: p.y, r: c.r, life: c.dur }); break; }
      case "leap": {
        if (!blocked(c.tx, c.ty, R.bodyRadius, p.team) && lineClear(p.x, p.y, c.tx, c.ty)) {
          emit(g, "leap", p.x, p.y, { team: p.team, tx: c.tx, ty: c.ty, life: 0.5 });
          p.x = c.tx; p.y = c.ty; p.px = c.tx; p.py = c.ty;
          for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && dist(p, q) <= c.jitterR) q.aimJitter = c.jitterSec;   // 着地点から2mの敵の照準を乱す
        }
        break; }
      case "smash": {
        const a = aheadPos(p, c.reach / 2); let hit = 0;
        const push = (x, y) => { const ang = Math.atan2(y - p.y, x - p.x); return { dx: Math.cos(ang) * c.push, dy: Math.sin(ang) * c.push }; };
        for (const q of g.players) if (q.team !== p.team && q.returning <= 0 && q.exposed <= 0 && dist(a, q) <= c.reach) { hit++; const ang = Math.atan2(q.y - p.y, q.x - p.x); for (let dd = c.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); }
        // 設置物は3m押し出す（金剛壁は壊す）
        for (const o of g.objects) {
          if (o.dead || o.team === p.team && o.kind !== "wall") continue;
          if (dist(a, o) > c.reach + (o.r || o.half || 0)) continue;
          hit++;
          if (o.kind === "wall") { o.dead = true; continue; }
          const v = push(o.x, o.y); o.x += v.dx; o.y += v.dy;
          if (o.ax != null) { o.ax += v.dx; o.ay += v.dy; o.bx += v.dx; o.by += v.dy; }
        }
        if (!hit) p.stunT = c.missStun;   // 外すと1秒停止
        emit(g, "smash", a.x, a.y, { team: p.team, life: 0.5 }); break; }''')

# ===== 10. 設置物の進行（破裂の取りこぼし・属性の相殺・白狐・白蛇・結び糸） =====
rep('''  function stepObjects(g, dt) {
    for (const o of g.objects) {
      o.life -= dt;
      if (o.life <= 0) o.dead = true;
      if (o.dead) continue;
      if (o.kind === "wall" && o.pending && o.life <= (o.warnTotal || (o.warnTotal = o.life)) - o.warn) { o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 }); }''',
'''  // 火遁（残火・焙烙玉）が敵の水鏡に触れたら水鏡を2秒短縮し、残火は消える
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
      for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } }
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
      if (o.kind === "wall" && o.pending && o.age >= o.warn - EPS) { o.pending = false; emit(g, "wall_up", o.x, o.y, { team: o.team, life: 0.4 }); }
      // 水遁：敵の残火は即座に消え、敵の狐火を一つ消す
      if (o.kind === "zone_water") {
        for (const t of g.objects) if (!t.dead && t.kind === "trail" && t.team !== o.team && segDist(o.x, o.y, t.ax, t.ay, t.bx, t.by) <= o.r) { t.dead = true; emit(g, "steam", t.x, t.y, { team: o.team, life: 0.6 }); }
        if (!o.foxDone) { const f = g.objects.find(t => !t.dead && t.kind === "fox_fire" && t.team !== o.team && dist(o, t) <= o.r + t.r); if (f) { f.dead = true; o.foxDone = true; emit(g, "steam", f.x, f.y, { team: o.team, life: 0.6 }); } }
      }''')
rep('''      if (o.kind === "snake") { const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, 0.2, o.team)) { o.x = nx; o.y = ny; } else { o.angle += Math.PI / 2; } if (!o.reported) for (const q of g.players) if (q.team !== o.team && q.camo === 1 && dist(o, q) <= o.radius) { o.reported = true; emit(g, "spotted", q.x, q.y, { team: o.team, life: 2 }); q.lastSeen = { x: q.x, y: q.y, t: 2 }; } }''',
'''      if (o.kind === "snake") {
        const nx = o.x + Math.cos(o.angle) * o.speed * dt, ny = o.y + Math.sin(o.angle) * o.speed * dt; if (!blocked(nx, ny, 0.2, o.team)) { o.x = nx; o.y = ny; } else { o.angle += Math.PI / 2; }
        // 3m以内の擬態開始痕を一度だけ知らせる（現在位置ではなく開始地点）
        if (!o.reported) { const mk = g.camoMarks.find(m => m.team !== o.team && g.elapsed - m.t <= 20 && Math.hypot(m.x - o.x, m.y - o.y) <= o.radius); if (mk) { o.reported = true; emit(g, "spotted", mk.x, mk.y, { team: o.team, life: 2, mark: true }); } }
      }''')
rep('''      if (o.kind === "track") { o.next -= dt; if (o.next <= 0) { o.next = 0.5; const own = g.players.find(p => p.id === o.owner); if (own) { let best = null, bd = o.radius; for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && !(q.camo === 2 && q.speedNow < 0.1) && dist(own, q) < bd) { bd = dist(own, q); best = q; } o.hist.push({ x: best ? best.x : null, y: best ? best.y : null, t: g.elapsed }); const past = o.hist.find(h => g.elapsed - h.t >= o.delay); if (past && past.x != null) { o.mark = { x: past.x, y: past.y }; } } } }
      if (o.kind === "freeze_bomb" && o.life <= 0.001) { for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && dist(o, q) <= o.r) q.stunT = Math.max(q.stunT, o.stun); emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 }); o.dead = true; }
      if (o.kind === "bomb" && o.life <= 0.001) { for (const q of g.players) if (q.team !== o.team && q.returning <= 0 && dist(o, q) <= o.r) { const ang = Math.atan2(q.y - o.y, q.x - o.x); for (let dd = o.push; dd > 0; dd -= 0.5) { const nx = q.x + Math.cos(ang) * dd, ny = q.y + Math.sin(ang) * dd; if (!blocked(nx, ny, R.bodyRadius, q.team) && lineClear(q.x, q.y, nx, ny)) { q.x = nx; q.y = ny; break; } } unhide(g, q); setReveal(q, 1); } emit(g, "burst", o.x, o.y, { team: o.team, r: o.r, life: 0.5 }); o.dead = true; }
      if (o.kind === "gate" && o.exit && o.life <= 0.001) o.dead = true;
    }
    if (g.objects.some(o => o.dead)) g.objects = g.objects.filter(o => !o.dead);
    // 呪標：8m内なら固有技の回復を遅らせる（一度だけ）
    for (const p of g.players) for (const m of p.mods) if (m.k === "hexed" && !m.applied) { const by = g.players.find(q => q.id === m.by); if (by && dist(by, p) <= m.range) { p.skillCd += m.cdDelay; m.applied = true; } }
    // 結び糸：6m以内なら被発見時間を短く（reveal を少しずつ削る）
    for (const p of g.players) for (const m of p.mods) if (m.k === "thread" && p.reveal > 0) { const q = g.players.find(x => x.id === m.with); if (q && dist(p, q) <= m.linkRange) p.reveal = Math.max(0, p.reveal - dt * 0.25); }
  }''',
'''      if (o.kind === "track") {
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
  }''')
# 接触：紫煙は「中から外へ出た」ときだけ足跡が残る／風遁は敵の霧・花びらを押し流す／影穴は敵も一度だけ追える
rep('''      if (o.kind === "zone_fog" && o.team !== p.team && dist(p, o) <= o.r + 0.3 && dist(p, o) > o.r) { addMod(p, "fogTrail", o.trailSec); setReveal(p, o.trailSec); }
      if (o.kind === "gate" && o.exit && dist(p, o) <= o.r && !(o.usedBy || []).includes(p.id) && (p.id === o.owner || o.team !== p.team)) { o.usedBy = (o.usedBy || []).concat(p.id); p.x = o.exit.x; p.y = o.exit.y; p.px = p.x; p.py = p.y; emit(g, "gate", p.x, p.y, { team: o.team, life: 0.6 }); if (p.id === o.owner) o.life = Math.min(o.life, 3); }
      if (o.kind === "zone_petals" && o.team === p.team && p.camo === 1 && dist(p, o) <= o.r) { /* 開始短縮は camo 開始時に反映 */ }''',
'''      if (o.kind === "zone_fog" && o.team !== p.team) {
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
      if (o.kind === "gate" && o.exit && o.team !== p.team && !o.enemyUsed && dist(p, o) <= o.r) { o.enemyUsed = true; p.x = o.exit.x; p.y = o.exit.y; p.px = p.x; p.py = p.y; emit(g, "gate", p.x, p.y, { team: o.team, life: 0.6 }); }   // 敵も一度だけ追って入れる''')

# ===== 11. スナップショット：敵に隠し情報を送らない・追香の方向だけを追跡側に送る =====
rep('''  function pubPlayer(p, full, g) {''', '''  // 敵にも見えてよい強化（設計図の「対処」で見えると書かれているもの）
  const PUBLIC_MODS = { visible: 1, tracked: 1, hexed: 1, shield: 1, tailwind: 1, eyeWhite: 1, eyeBlack: 1, thread: 1, foxdash: 1 };
  function pubPlayer(p, full, g, enemy) {''')
rep('''channel: p.sk.channel ? p.sk.channel.kind : null, modKeys: p.mods.map(m => m.k), ultActive: p.ult.active };''',
    '''channel: p.sk.channel ? p.sk.channel.kind : null, modKeys: [...new Set(p.mods.map(m => m.k))].filter(k => !enemy || PUBLIC_MODS[k]), ultActive: p.ult.active };''')
rep('''        if (p.pulse && p.returning <= 0) players.push({ id: p.id, team: p.team, x: +p.x.toFixed(1), y: +p.y.toFixed(1), pulse: true, pulseOnly: true, lastSeen: p.lastSeen });
        else if (p.lastSeen) players.push({ id: p.id, team: p.team, ghost: true, lastSeen: p.lastSeen });''',
'''        const tk = trackDirFor(v, p);
        if (p.pulse && p.returning <= 0) players.push({ id: p.id, team: p.team, x: +p.x.toFixed(1), y: +p.y.toFixed(1), pulse: true, pulseOnly: true, lastSeen: p.lastSeen, trackDir: tk });
        else if (p.lastSeen || tk != null) players.push({ id: p.id, team: p.team, char: p.char, ghost: true, lastSeen: p.lastSeen, trackDir: tk });''')
rep('''      else { const o = pubPlayer(p, false, g); o.lastSeen = p.lastSeen; players.push(o); }''',
    '''      else { const o = pubPlayer(p, false, g, true); o.lastSeen = p.lastSeen; players.push(o); }''')
rep('''  // 観戦側（人間）の可視情報：敵をどう描くか''', '''  // 追香：追跡側のチームには、見えない相手の「移動方向」だけを渡す（位置は渡さない）
  function trackDirFor(viewer, q) {
    const m = q.mods.find(x => x.k === "tracked" && x.by === viewer.team);
    if (!m || q.returning > 0) return null;
    const vx = q.x - q.px, vy = q.y - q.py;
    return +(Math.hypot(vx, vy) > 1e-4 ? Math.atan2(vy, vx) : q.angle).toFixed(2);
  }
  // 観戦側（人間）の可視情報：敵をどう描くか''')
rep('''    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, skillCdFor, inZone, get objects() { return DYN; } };''',
    '''    useSkill, useUlt, choosePerk, addXp, hasPerk, balanceFor, balNow, skillCdFor, inZone, trackDirFor, bindDyn, get objects() { return DYN; } };''')

# ===== 12. Bot：影穴の2回目・帰魂の対象 =====
rep('''    const sk = p.bal.skill; if (!sk || p.skillCd > 0 || p.sk.channel || p.protect > 0) return acts;''',
    '''    const sk = p.bal.skill;
    if (sk && sk.kind === "shadow_gate" && g.objects.some(o => o.kind === "gate" && o.owner === p.id && !o.exit && !o.dead && dist(p, o) <= 1.2)) { acts.push("skill"); return acts; }   // 出口を置いて渡る
    if (!sk || p.skillCd > 0 || p.sk.channel || p.protect > 0) return acts;''')
rep('''(k === "soul_return" && mates.some(m => m.returning > 0 || m.exposed > 0))''',
    '''(k === "soul_return" && mates.some(m => m.returning > 0 && !m.soulBoosted))''')

open(p, "w", encoding="utf-8").write(s)
print("sim.js fixed")
