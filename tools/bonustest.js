// おつとめ帳（bonus.js）の検査。設計図 docs/login-bonus-blueprint.md §8.1 の A〜G（日付・おつとめ・時計・広告スタンプ・交換所・正規化・カタログ/文言/大人の確認）
//   node ninsai-kakurenbo/tools/bonustest.js
// タイムゾーンは中で process.env.TZ を切り替えて5通り回す（Windows の node は起動前の TZ が効かないため）。課金なし・通信なし
const fs = require("fs");
const path = require("path");
const B = require("../bonus.js");
const D = require("../data.js");
const SRC = fs.readFileSync(path.join(__dirname, "..", "bonus.js"), "utf8");
const NGW = JSON.parse(fs.readFileSync(path.join(__dirname, "bonus_ngwords.json"), "utf8"));
const CAT = B.buildCatalog(D.CHARS);
const TZS = ["Asia/Tokyo", "America/New_York", "Pacific/Kiritimati", "Europe/London", "UTC"];
const TZ_OFF = { "Asia/Tokyo": -540, "America/New_York": 240, "Pacific/Kiritimati": -840, "Europe/London": -60, "UTC": 0 };   // 2026-10-10 の getTimezoneOffset

let pass = 0, fail = 0, TZ = "";
const ng = [];
const ok = (c, id, m) => { if (c) pass++; else { fail++; if (ng.length < 40) ng.push(`[${TZ}] ${id}: ${m}`); } };
const J = x => JSON.stringify(x);
const H = 3600000;
const SHIFT = 18000000;
// 日本時間の y/mo/d h:mi:s.ms
const jst = (y, mo, d, h, mi = 0, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h - 9, mi, s, ms);
// 日番号 day の日本時間 h 時（4〜27）
const at = (day, h = 10) => day * B.DAY_MS - SHIFT + (h - 4) * H;
const R = 20736;     // 2026-10-10
const ctxOf = (st, over) => Object.assign({
  provider: "h5", settingOn: true, screen: "bonus", inMatch: false, inRoom: false,
  adClockOk: st.ad.clockOk, claimedToday: st.claimedToday, adDoneToday: st.ad.doneToday, declinedToday: st.ad.declinedToday,
  online: true, apiOk: true,
}, over || {});
// 小さな乱数（検査の再現のため Math.random は使わない）
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 中身の詰まった state（非破壊の検査用）
function richState() {
  let s = B.empty(5);
  for (let i = 0; i < 9; i++) { s = B.claim(s, at(R + i), CAT).state; s = B.recordAdView(s, at(R + i)).state; }
  s = B.exchange(s, "t_minarai", CAT).state;
  s = B.exchange(s, "seal_jin", CAT).state;
  s = B.exchange(s, "fr_take", CAT).state;
  s = B.equip(s, "title", "t_minarai", CAT).state;
  s = B.equip(s, "frame", "fr_take", CAT).state;
  s = B.equip(s, "trio", ["jin", "sakuya", "kohaku"], CAT).state;
  return s;
}

// ---------- A. 日付 ----------
function groupA() {
  const out = {};
  const t1 = Date.UTC(2026, 9, 9, 19, 0, 0);
  ok(new Date(t1).getTimezoneOffset() === TZ_OFF[TZ], "A6", `タイムゾーンが切り替わっていない（${new Date(t1).getTimezoneOffset()}）`);
  out.A1 = [B.dayIndex(t1), B.dayLabel(B.dayIndex(t1))];
  ok(out.A1[0] === 20736 && out.A1[1] === "2026-10-10", "A1", `日本時間10/10 04:00 → ${out.A1}`);
  out.A2 = [B.dayIndex(t1 - 1), B.dayLabel(B.dayIndex(t1 - 1))];
  ok(out.A2[0] === 20735 && out.A2[1] === "2026-10-09", "A2", `その1ミリ秒前 → ${out.A2}`);
  out.A3 = [B.dayLabel(B.dayIndex(jst(2026, 10, 10, 23, 59))), B.dayLabel(B.dayIndex(jst(2026, 10, 11, 3, 59, 59, 999)))];
  ok(out.A3[0] === "2026-10-10" && out.A3[1] === "2026-10-10", "A3", `10/10 23:59 と 10/11 03:59:59.999 → ${out.A3}`);
  out.A4 = [jst(2026, 12, 31, 4), jst(2027, 1, 1, 3, 59), jst(2027, 1, 1, 4)].map(t => B.dayLabel(B.dayIndex(t)));
  ok(J(out.A4) === J(["2026-12-31", "2026-12-31", "2027-01-01"]), "A4", `年またぎ → ${out.A4}`);
  out.A5 = [jst(2028, 2, 29, 4), jst(2028, 3, 1, 3, 59), jst(2028, 2, 29, 3, 59)].map(t => B.dayLabel(B.dayIndex(t)));
  ok(J(out.A5) === J(["2028-02-29", "2028-02-29", "2028-02-28"]), "A5", `うるう日 → ${out.A5}`);
  // status も同じ日付を出す（端末の時刻設定に左右されない）
  const st = B.status(B.empty(0), t1, CAT);
  out.A5s = [st.today, st.label, st.labelJa];
  ok(st.today === 20736 && st.label === "2026-10-10", "A6", `status の日付 ${out.A5s}`);
  ok(B.dayLabelJa(20736) === "10月10日" && B.dayLabelJa(B.dayIndex(jst(2027, 1, 1, 4))) === "1月1日" && st.labelJa === "10月10日", "A7", `dayLabelJa → ${B.dayLabelJa(20736)}`);
  ok(B.nextBoundaryMs(20736) === jst(2026, 10, 11, 4) && B.nextBoundaryMs(20736) === Date.UTC(2026, 9, 10, 19), "A8", `次の境目 ${new Date(B.nextBoundaryMs(20736)).toISOString()}`);
  const t030 = jst(2026, 10, 11, 0, 30);
  const s030 = B.status(B.empty(0), t030, CAT);
  ok(s030.today === 20736 && s030.nextBoundaryMs - t030 === 3.5 * H && s030.hoursToNext === 4, "A8", `00:30 → 境目まで ${(s030.nextBoundaryMs - t030) / H}時間・表示 ${s030.hoursToNext}`);
  const s0400 = B.status(B.empty(0), jst(2026, 10, 11, 4), CAT), s0359 = B.status(B.empty(0), jst(2026, 10, 11, 3, 59, 59, 999), CAT);
  ok(s0400.hoursToNext === 24 && s0359.hoursToNext === 1, "A8", `表示の時間は1〜24（04:00→${s0400.hoursToNext}・03:59:59→${s0359.hoursToNext}）`);
  out.A8 = [B.nextBoundaryMs(20736), s030.hoursToNext];
  return out;
}

// ---------- B. おつとめ ----------
function groupB() {
  const e = B.empty(0);
  const st0 = B.status(e, at(R), CAT);
  ok(st0.canClaim && st0.reason === "ok" && st0.nextSlot === 0 && st0.nextAmount === 10 && st0.firstPending === true && st0.days === 0, "B1", J({ c: st0.canClaim, s: st0.nextSlot, a: st0.nextAmount, f: st0.firstPending }));
  const before = J(e);
  const r1 = B.claim(e, at(R), CAT);
  const s1 = r1.state;
  ok(r1.reason === "ok" && s1.koban === 30 && s1.days === 1 && s1.lastDay === R && s1.firstGift === true && r1.granted.total === 30 && r1.granted.amount === 10 && r1.granted.first === true && r1.granted.slot === 0, "B2", J(r1.granted) + " koban=" + s1.koban);
  ok(J(e) === before, "B8", "claim が入力を書き換えた");
  const j1 = J(s1);
  const r1b = B.claim(s1, at(R, 23), CAT);
  ok(r1b.reason === "claimed" && r1b.granted === null && J(r1b.state) === j1 && J(s1) === j1, "B3", `同じ日の2回目 ${r1b.reason}`);
  const r2 = B.claim(s1, at(R + 1), CAT);
  ok(r2.reason === "ok" && r2.state.koban === 40 && r2.granted.total === 10 && r2.granted.first === false && r2.granted.slot === 1, "B4", J(r2.granted));
  ok(r2.state.rev === s1.rev + 1 && s1.rev === 1, "B9", `rev ${s1.rev}→${r2.state.rev}`);
  // 7回目は30・8回目は10
  let s = r2.state;
  for (let d = 2; d <= 5; d++) { const r = B.claim(s, at(R + d), CAT); ok(r.reason === "ok" && r.granted.total === 10 && r.state.rev === s.rev + 1, "B5", `${d + 1}回目 ${J(r.granted)}`); s = r.state; }
  const st6 = B.status(s, at(R + 6), CAT);
  ok(st6.nextSlot === 6 && st6.nextAmount === 30, "B5", `7回目の前 slot=${st6.nextSlot} amount=${st6.nextAmount}`);
  const r7 = B.claim(s, at(R + 6), CAT);
  ok(r7.reason === "ok" && r7.granted.amount === 30 && r7.granted.total === 30 && r7.granted.slot === 6 && r7.state.koban === 30 + 50 + 30, "B5", `7回目 ${J(r7.granted)} koban=${r7.state.koban}`);
  s = r7.state;
  const st8 = B.status(s, at(R + 7), CAT);
  ok(st8.nextSlot === 0 && st8.nextAmount === 10, "B5", `8回目の前 slot=${st8.nextSlot}`);
  const r8 = B.claim(s, at(R + 7), CAT);
  ok(r8.reason === "ok" && r8.granted.amount === 10 && r8.granted.slot === 0 && r8.state.days === 8, "B5", `8回目 ${J(r8.granted)}`);
  // B6：3日あけても次のマスから（戻らない）
  {
    let x = B.empty(0);
    for (let d = 0; d < 3; d++) x = B.claim(x, at(R + d), CAT).state;
    const r = B.claim(x, at(R + 6), CAT);
    ok(r.reason === "ok" && r.granted.slot === 3 && r.state.days === 4 && r.granted.total === 10, "B6", `3日あけて ${J(r.granted)} days=${r.state.days}`);
    let y = B.empty(0);
    for (let d = 0; d < 6; d++) y = B.claim(y, at(R + d), CAT).state;
    const r6 = B.claim(y, at(R + 20), CAT);
    ok(r6.reason === "ok" && r6.granted.slot === 6 && r6.granted.amount === 30 && r6.state.days === 7, "B6", `14日あけても7回目は30 ${J(r6.granted)}`);
  }
  // B7：03:59 と 04:00 は別の日
  {
    const a = B.claim(B.empty(0), jst(2026, 10, 11, 3, 59), CAT);
    const b = B.claim(a.state, jst(2026, 10, 11, 4, 0), CAT);
    ok(a.reason === "ok" && b.reason === "ok" && a.state.lastDay === 20736 && b.state.lastDay === 20737, "B7", `${a.reason}/${b.reason} ${a.state.lastDay}/${b.state.lastDay}`);
    const c = B.claim(a.state, jst(2026, 10, 11, 3, 59, 59, 999), CAT);
    ok(c.reason === "claimed", "B7", `03:59:59.999 は同じ日 ${c.reason}`);
  }
  // B8：どの関数も入力を書き換えない
  {
    const rich = richState(), jr = J(rich);
    const calls = [
      () => B.normalize(rich, CAT), () => B.status(rich, at(R + 9), CAT), () => B.claim(rich, at(R + 9), CAT), () => B.claim(rich, at(R + 30), CAT),
      () => B.recordAdView(rich, at(R + 9)), () => B.recordAdView(rich, at(R + 30)), () => B.declineAd(rich, at(R + 9)),
      () => B.exchange(rich, "bg_yuki", CAT), () => B.exchange(rich, "t_minarai", CAT), () => B.equip(rich, "title", null, CAT),
      () => B.equip(rich, "trio", ["jin", "dan", "oto"], CAT), () => B.clock(rich, R - 3, CAT), () => B.clock(rich, R - 100, CAT),
      () => B.newer(rich, B.empty(0)),
    ];
    calls.forEach((f, i) => { f(); ok(J(rich) === jr, "B8", `入力が変わった（呼び出し${i}）`); });
    // 返した state を書き換えても、入力に響かない（複製が深い）
    const r = B.claim(rich, at(R + 9), CAT);
    r.state.owned.push("x"); r.state.equip.trio[0] = "zz"; r.state.log[0].n = 999;
    ok(J(rich) === jr, "B8", "返した state と入力が中身を共有している");
  }
  // B9：失敗では rev が変わらない
  {
    const a = B.claim(B.empty(0), at(R), CAT), b = B.claim(a.state, at(R), CAT);
    ok(a.state.rev === 1 && b.state.rev === 1, "B9", `成功で+1・失敗で据え置き ${a.state.rev}/${b.state.rev}`);
  }
  // B10：小判の上限
  {
    const x = B.normalize({ koban: 999995, earned: 5, days: 1, lastDay: R - 1, firstGift: true }, CAT);
    const r = B.claim(x, at(R), CAT);
    ok(r.state.koban === B.KOBAN_MAX && r.state.earned === 15, "B10", `koban=${r.state.koban} earned=${r.state.earned}`);
    const r2 = B.recordAdView(r.state, at(R));
    ok(r2.state.koban === B.KOBAN_MAX && r2.granted.amount === 5, "B10", "上限でも広告の結果は5のまま");
  }
  // B11：log は最大30件・新しい順に残す
  {
    let x = B.empty(0);
    for (let d = 0; d < 40; d++) x = B.claim(x, at(R + d), CAT).state;
    ok(x.log.length === 30 && x.log[29].d === R + 39 && x.log[0].d === R + 10 && x.log.every(l => l.k === "login"), "B11", `log ${x.log.length}件 最初=${x.log[0].d - R}`);
  }
  // B12：doneInCycle
  {
    let x = B.empty(0);
    ok(B.status(x, at(R), CAT).doneInCycle === 0, "B12", "0回→0");
    const seq = [];
    for (let d = 0; d < 7; d++) { x = B.claim(x, at(R + d), CAT).state; seq.push(B.status(x, at(R + d, 20), CAT).doneInCycle); }
    ok(J(seq) === J([1, 2, 3, 4, 5, 6, 7]), "B12", `受け取り直後 ${seq}`);
    ok(B.status(x, at(R + 7), CAT).doneInCycle === 0, "B12", "8回目の前→0");
    ok(B.status(x, at(R + 10), CAT).doneInCycle === 0 && B.status(B.claim(x, at(R + 7), CAT).state, at(R + 7), CAT).doneInCycle === 1, "B12", "8回目の直後→1");
  }
  // B13：hiDay は受け取りで上がり、status では変わらない
  {
    const x = B.empty(0), j = J(x);
    const st = B.status(x, at(R), CAT);
    ok(st.state.hiDay === -1 && J(x) === j, "B13", "status を見ただけで hiDay が変わった");
    const r = B.claim(x, at(R), CAT);
    ok(r.state.hiDay === R, "B13", `受け取り後 hiDay=${r.state.hiDay}`);
    const hi = B.claim(B.normalize({ hiDay: R + 3, lastDay: R - 1, days: 1, firstGift: true }, CAT), at(R), CAT);
    ok(hi.reason === "ok" && hi.state.hiDay === R + 3, "B13", `hiDay は下げない ${hi.state.hiDay - R}`);
  }
}

// ---------- C. 時計 ----------
function groupC() {
  const base = { koban: 77, earned: 500, days: 12, firstGift: true, adStamps: 4, adCards: 1, owned: ["t_minarai", "seal_jin"], equip: { title: "t_minarai" } };
  // C1・C2
  for (const [k, id] of [[1, "C1"], [7, "C2"]]) {
    const x = B.normalize(Object.assign({}, base, { lastDay: R + k }), CAT);
    const st = B.status(x, at(R), CAT);
    const r = B.claim(x, at(R), CAT);
    ok(st.clock === "ahead" && st.reason === "ahead" && !st.canClaim && st.resumeLabelJa === B.dayLabelJa(R + k + 1) && st.aheadLabelJa === B.dayLabelJa(R + k), id, `lastDay=today+${k} → ${st.clock} resume=${st.resumeLabelJa}`);
    ok(r.reason === "ahead" && r.granted === null && J(r.state) === J(x), id, `受け取れない ${r.reason}`);
  }
  // C3：大きく先 → reset で受け取れる。ほかは残る
  {
    const x = B.normalize(Object.assign({}, base, { lastDay: R + 8, hiDay: R + 8 }), CAT);
    const c = B.clock(x, R, CAT);
    ok(c.clock === "reset" && c.state.lastDay === R - 1 && c.state.hiDay === R + 8 && c.adClockOk === false, "C3", J({ c: c.clock, l: c.state.lastDay - R, h: c.state.hiDay - R }));
    const st = B.status(x, at(R), CAT);
    const r = B.claim(x, at(R), CAT);
    ok(st.clock === "reset" && st.canClaim && r.reason === "ok", "C3", `${st.clock} ${r.reason}`);
    const y = r.state;
    ok(y.koban === 77 + r.granted.total && y.days === 13 && y.adStamps === 4 && y.adCards === 1 && J(y.owned) === J(["t_minarai", "seal_jin"]) && y.equip.title === "t_minarai" && y.hiDay === R + 8 && y.lastDay === R, "C3", J({ k: y.koban, d: y.days, s: y.adStamps, h: y.hiDay - R }));
  }
  // C4：同じ日の中で時計を戻す
  {
    const r = B.claim(B.empty(0), at(R, 10), CAT);
    const st = B.status(r.state, at(R, 9), CAT);
    ok(st.reason === "claimed" && st.clock === "ok", "C4", st.reason);
  }
  // C5
  {
    const r = B.claim(B.empty(0), at(R), CAT);
    const st = B.status(r.state, at(R), CAT);           // 翌日（R+1）に、時計を前日（R）へ戻した
    ok(st.reason === "claimed", "C5", `受け取った翌日に前日へ → ${st.reason}`);
    const r2 = B.claim(r.state, at(R + 1), CAT);
    const st2 = B.status(r2.state, at(R), CAT);
    ok(r2.reason === "ok" && st2.reason === "ahead", "C5", `翌日の分を受け取ってから前日へ → ${st2.reason}`);
  }
  // C6：+8日で受け取り＋広告 → 本当の日付へ
  {
    let x = B.claim(B.empty(0), at(R + 8), CAT).state;
    x = B.recordAdView(x, at(R + 8)).state;
    const st = B.status(x, at(R), CAT);
    ok(st.clock === "reset" && st.canClaim, "C6", `おつとめは受け取れる ${st.clock}`);
    ok(B.adGate(ctxOf(st)).reason === "clock" && st.ad.resumeLabelJa === B.dayLabelJa(R + 8), "C6", `受け取り前の adGate ${B.adGate(ctxOf(st)).reason}`);
    const y = B.claim(x, at(R), CAT).state;
    const st2 = B.status(y, at(R), CAT);
    ok(st2.claimedToday && B.adGate(ctxOf(st2)).reason === "clock" && !st2.ad.clockOk, "C6", `受け取り後の adGate ${B.adGate(ctxOf(st2)).reason}`);
  }
  // C7：1つの本当の日に、今日と+8日を10回往復
  {
    let x = B.empty(0), gated = 0, raw = B.empty(0), rawOk = 0;
    for (let i = 0; i < 20; i++) {
      const t = i % 2 === 0 ? at(R, 10) : at(R + 8, 10);
      if (B.status(x, t, CAT).canClaim) x = B.claim(x, t, CAT).state;
      const st = B.status(x, t, CAT);
      if (B.adGate(ctxOf(st)).ok) { const r = B.recordAdView(x, t); if (r.reason === "ok") gated++; x = r.state; }
      // 門を通さず毎回見終えた扱いにしても、スタンプつきは2本まで
      raw = B.claim(raw, t, CAT).state;
      const rr = B.recordAdView(raw, t); if (rr.reason === "ok") rawOk++; raw = rr.state;
      ok(rr.granted.amount === 5, "C7", "往復しても見終えたら5小判");
    }
    ok(gated === 2, "C7", `adGate が通って記録された本数 ${gated}`);
    ok(rawOk <= 2, "C7", `スタンプつきの本数 ${rawOk}`);
  }
  // C8：+8〜+17 を1日ずつ → 10本。本当の日付へ戻すと +18 まで出ない
  {
    let x = B.empty(0);
    const okDays = [];
    const step = day => {
      const t = at(day);
      if (B.status(x, t, CAT).canClaim) x = B.claim(x, t, CAT).state;
      const st = B.status(x, t, CAT);
      const g = B.adGate(ctxOf(st));
      if (g.ok) { const r = B.recordAdView(x, t); if (r.reason === "ok") okDays.push(day); x = r.state; }
      return g.reason;
    };
    for (let k = 8; k <= 17; k++) step(R + k);
    ok(okDays.length === 10, "C8", `先の日付で ${okDays.length}本`);
    const reasons = [];
    for (let k = 0; k <= 18; k++) reasons.push(step(R + k));
    ok(reasons.slice(0, 17).every(r => r === "clock") && reasons[17] === "done_today" && reasons[18] === "ok", "C8", `本当の日付へ戻したあと ${reasons.join(",")}`);
    const strictly = okDays.every((d, i) => i === 0 || d > okDays[i - 1]);
    ok(okDays.length === 11 && strictly && okDays.length <= (Math.max(...okDays) - R + 1), "C8", `本数 ${okDays.length}・日番号 ${okDays.map(d => d - R)}`);
  }
}

// ---------- D. 広告スタンプとゲート ----------
function groupD() {
  // D1
  {
    const a = B.claim(B.empty(0), at(R), CAT).state;
    const r = B.recordAdView(a, at(R));
    ok(r.reason === "ok" && r.state.koban === a.koban + 5 && r.state.adStamps === 1 && r.state.adLastDay === R && r.state.adTotal === 1 && r.granted.amount === 5 && r.granted.stamps === 1 && !r.granted.big && !r.granted.extra, "D1", J(r.granted));
    ok(r.state.log[r.state.log.length - 1].k === "ad", "D1", "log に ad");
  }
  // D2：7日続けて
  {
    let x = B.empty(0), adSum = 0, last = null;
    for (let d = 0; d < 7; d++) { x = B.claim(x, at(R + d), CAT).state; const k0 = x.koban; last = B.recordAdView(x, at(R + d)); adSum += last.state.koban - k0; x = last.state; }
    ok(last.reason === "ok" && last.granted.big && last.granted.bonus === 70 && last.granted.total === 75 && last.granted.stamps === 7 && x.adStamps === 0 && x.adCards === 1, "D2", J(last.granted));
    ok(adSum === 105, "D2", `7日の広告の合計 ${adSum}`);
    ok(x.log.some(l => l.k === "big" && l.n === 70), "D2", "log に big");
  }
  // D3：20日のうち飛び飛びの7日
  {
    let x = B.empty(0);
    const days = [0, 2, 5, 9, 12, 16, 19], seq = [];
    let big = null;
    for (const d of days) { x = B.claim(x, at(R + d), CAT).state; const r = B.recordAdView(x, at(R + d)); seq.push(r.granted.stamps); big = r.granted.big; x = r.state; }
    ok(J(seq) === J([1, 2, 3, 4, 5, 6, 7]) && big && x.adCards === 1 && x.adStamps === 0, "D3", `スタンプ ${seq}`);
  }
  // D4：7回目のおつとめ（30）の日でも広告は+5
  {
    let x = B.empty(0);
    for (let d = 0; d < 7; d++) x = B.claim(x, at(R + d), CAT).state;
    const r = B.recordAdView(x, at(R + 6));
    ok(r.granted.amount === 5 && r.granted.total === 5 && r.state.koban === x.koban + 5, "D4", J(r.granted));
  }
  // D5：受け取りの記録が無くても渡す
  {
    const r = B.recordAdView(B.empty(0), at(R));
    ok(r.reason === "ok" && r.state.koban === 5 && r.state.adStamps === 1, "D5", J(r.granted));
  }
  // D6・D7
  {
    const a = B.claim(B.empty(0), at(R), CAT).state;
    const dcl = B.declineAd(a, at(R));
    const st = B.status(dcl, at(R), CAT), stN = B.status(dcl, at(R + 1), CAT);
    ok(st.ad.declinedToday === true && dcl.adDeclineDay === R && dcl.rev === a.rev + 1 && stN.ad.declinedToday === false, "D6", `${st.ad.declinedToday}/${stN.ad.declinedToday}`);
    ok(B.adGate(ctxOf(st)).reason === "declined_today", "D6", B.adGate(ctxOf(st)).reason);
    const stN2 = B.status(B.claim(dcl, at(R + 1), CAT).state, at(R + 1), CAT);
    ok(B.adGate(ctxOf(stN2)).ok, "D6", "翌日はまた選べる");
    const r = B.recordAdView(dcl, at(R));
    ok(r.reason === "ok" && r.state.koban === dcl.koban + 5 && r.state.adStamps === 1, "D7", `断った日でも見終えたら記録 ${r.reason}`);
  }
  // D8：11の理由と順番
  {
    const all = { provider: "h5", settingOn: true, screen: "bonus", inMatch: false, inRoom: false, adClockOk: true, claimedToday: true, adDoneToday: false, declinedToday: false, online: true, apiOk: true };
    ok(B.adGate(all).ok === true && B.adGate(all).reason === "ok", "D8", "全部満たすと ok");
    const flips = [
      ["provider", "none", "provider_none"], ["settingOn", false, "setting_off"], ["screen", "title", "not_bonus_screen"], ["inMatch", true, "in_match"],
      ["inRoom", true, "in_room"], ["adClockOk", false, "clock"], ["claimedToday", false, "not_claimed"], ["adDoneToday", true, "done_today"],
      ["declinedToday", true, "declined_today"], ["online", false, "offline"], ["apiOk", false, "no_api"],
    ];
    const seen = new Set();
    for (const [k, v, why] of flips) { const g = B.adGate(Object.assign({}, all, { [k]: v })); seen.add(g.reason); ok(!g.ok && g.reason === why, "D8", `${k}=${v} → ${g.reason}`); }
    ok(seen.size === 11, "D8", `理由の種類 ${seen.size}`);
    const pairs = [
      [{ provider: "none", settingOn: false }, "provider_none"], [{ adClockOk: false, claimedToday: false }, "clock"],
      [{ settingOn: false, screen: "title" }, "setting_off"], [{ inMatch: true, inRoom: true }, "in_match"],
      [{ adDoneToday: true, declinedToday: true }, "done_today"], [{ online: false, apiOk: false }, "offline"],
      [{ claimedToday: false, adDoneToday: true, online: false }, "not_claimed"], [{ screen: "match", inMatch: true }, "not_bonus_screen"],
    ];
    for (const [over, why] of pairs) ok(B.adGate(Object.assign({}, all, over)).reason === why, "D8", `${J(over)} → ${B.adGate(Object.assign({}, all, over)).reason}（${why}）`);
    ok(B.adGate(null).reason === "provider_none" && B.adGate(undefined).reason === "provider_none" && B.adGate([]).reason === "provider_none", "D8", "ctx が無いときは provider_none");
  }
  // D9：provider none・設定オフでも、おつとめの結果は同じ
  {
    const x = B.empty(0);
    const base = B.claim(x, at(R), CAT);
    const withSettings = B.claim(Object.assign({}, x, { settings: { adOffers: false }, provider: "none" }), at(R), CAT);
    const st = B.status(base.state, at(R), CAT);
    ok(J(base) === J(withSettings) && base.reason === "ok" && B.adGate(ctxOf(st, { provider: "none", settingOn: false })).reason === "provider_none", "D9", "おつとめが広告の設定に左右された");
  }
  // D10：日付をまたいで見終えた
  {
    const a = B.claim(B.empty(0), at(R, 23), CAT).state;
    const r = B.recordAdView(a, at(R + 1, 4) + 1000);
    ok(r.reason === "ok" && r.state.adLastDay === R + 1 && r.state.hiDay === R + 1, "D10", `adLastDay=${r.state.adLastDay - R}`);
    ok(B.status(r.state, at(R + 1), CAT).ad.doneToday === true && B.status(r.state, at(R + 1), CAT).ad.stamps === 1, "D10", "翌日の分として数える");
  }
  // D11：台紙の色は1色
  {
    ok(B.CARD_COLOR === "#F5EEDD" && typeof B.CARD_COLOR === "string", "D11", B.CARD_COLOR);
    let x = B.empty(0);
    const shapes = new Set(), colors = [];
    for (let d = 0; d < 22; d++) {
      x = B.claim(x, at(R + d), CAT).state; x = B.recordAdView(x, at(R + d)).state;
      const ad = B.status(x, at(R + d), CAT).ad;
      shapes.add(Object.keys(ad).join(","));
      for (const v of Object.values(ad)) if (typeof v === "string" && /^#|rgb|hsl/i.test(v)) colors.push(v);
    }
    ok(x.adCards === 3 && shapes.size === 1 && colors.length === 0, "D11", `周回で変わる色を返さない（${colors.join(",")}）`);
  }
  // D12：「このおさそいを出さない」→ その日も翌日以降も setting_off
  {
    let x = B.claim(B.empty(0), at(R), CAT).state;
    for (let d = 0; d < 5; d++) {
      if (d) x = B.claim(x, at(R + d), CAT).state;
      ok(B.adGate(ctxOf(B.status(x, at(R + d), CAT), { settingOn: false })).reason === "setting_off", "D12", `${d}日後`);
    }
  }
  // D13：同じ日の2回目（別タブで先に見た）→ extra で +5
  {
    const a = B.recordAdView(B.claim(B.empty(0), at(R), CAT).state, at(R)).state;
    const r = B.recordAdView(a, at(R, 20));
    ok(r.reason === "extra" && r.granted.extra === true && r.granted.amount === 5 && r.state.koban === a.koban + 5 && r.state.adStamps === a.adStamps && r.state.adLastDay === a.adLastDay && r.state.adTotal === a.adTotal + 1, "D13", J(r.granted));
    ok(r.state.log[r.state.log.length - 1].k === "ad_extra" && r.state.log[r.state.log.length - 1].n === 5, "D13", "log に ad_extra");
  }
  // D14：today < hiDay → extra
  {
    const a = B.claim(B.empty(0), at(R + 3), CAT).state;
    const r = B.recordAdView(a, at(R));
    ok(r.reason === "extra" && r.granted.amount === 5 && r.state.koban === a.koban + 5 && r.state.adStamps === 0 && r.state.adLastDay === -1 && r.state.hiDay === R + 3, "D14", J(r.granted));
  }
  // D15：でたらめな state 1,000通りでも 5小判以上
  {
    const rnd = mulberry32(12345);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const vals = () => [undefined, null, NaN, Infinity, -Infinity, -1, 0, 1, 6, 7, 9, 100, 1e12, -1e12, 2.5, "100", "x", true, false, [], {}, [1, 2], R, R + 1, R - 1, R + 9, Math.floor(rnd() * 1e7) - 1e3];
    let bad = 0;
    for (let i = 0; i < 1000; i++) {
      let st;
      const kind = rnd();
      if (kind < 0.05) st = pick([null, undefined, 3, "s", [], true]);
      else {
        st = {};
        for (const k of ["v", "epoch", "rev", "koban", "earned", "days", "lastDay", "firstGift", "hiDay", "adStamps", "adCards", "adTotal", "adLastDay", "adDeclineDay"]) if (rnd() < 0.8) st[k] = pick(vals());
        if (rnd() < 0.5) st.owned = [pick(["t_minarai", "seal_jin", "__proto__", "<b>", 5]), pick(["bg_yuki", null, "seal_zzz"])];
        if (rnd() < 0.5) st.equip = pick([{ title: "t_minarai", trio: ["jin", "jin", "x"] }, null, [], { bg: 5 }]);
        if (rnd() < 0.5) st.log = pick([[{ d: R, k: "ad", n: 5 }, { d: "x" }], "log", [null]]);
      }
      const now = pick([at(R), at(R + 1), at(R - 5), at(R + 300), NaN, -1, 0, 1e20, "abc", undefined, Date.UTC(2026, 9, 9, 19)]);
      const r = B.recordAdView(st, now, rnd() < 0.5 ? CAT : undefined);
      if (!(r && r.granted && r.granted.amount >= 5 && r.granted.total >= 5 && (r.reason === "ok" || r.reason === "extra") && Number.isInteger(r.state.koban) && r.state.koban >= 0)) bad++;
    }
    ok(bad === 0, "D15", `5小判未満・形の崩れ ${bad}件／1000`);
  }
}

// ---------- E. 交換所 ----------
function groupE() {
  const rich = B.normalize({ koban: 100, days: 3, lastDay: R, hiDay: R, firstGift: true }, CAT);
  // E1
  const r1 = B.exchange(rich, "t_minarai", CAT, at(R));
  const last = r1.state.log[r1.state.log.length - 1];
  ok(r1.reason === "ok" && r1.state.koban === 80 && r1.state.owned.includes("t_minarai") && r1.item && r1.item.id === "t_minarai" && r1.state.rev === rich.rev + 1, "E1", `${r1.reason} koban=${r1.state.koban}`);
  ok(last.k === "swap" && last.n === -20 && last.id === "t_minarai" && last.d === R, "E1", J(last));
  const r1b = B.exchange(rich, "seal_jin", CAT);
  ok(r1b.reason === "ok" && r1b.state.log[r1b.state.log.length - 1].d === R, "E1", "時刻を渡さないときは最後に見た日で記録");
  // E2
  const poor = B.normalize({ koban: 10 }, CAT), jp = J(poor);
  const r2 = B.exchange(poor, "t_minarai", CAT);
  ok(r2.reason === "short" && r2.need === 10 && J(r2.state) === jp && J(poor) === jp, "E2", `${r2.reason} need=${r2.need}`);
  // E3
  const r3 = B.exchange(r1.state, "t_minarai", CAT);
  ok(r3.reason === "owned" && r3.state.koban === 80, "E3", r3.reason);
  // E4
  for (const id of ["nope", "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "", null, undefined, 5, {}, [], "seal_", "seal_nobody", "SEAL_JIN", "t_minarai "]) {
    const r = B.exchange(rich, id, CAT);
    ok(r.reason === "unknown" && r.item === null && r.state.koban === 100 && Number.isFinite(r.state.koban), "E4", `${String(id)} → ${r.reason} koban=${r.state.koban}`);
  }
  ok(B.exchange(rich, "t_minarai").reason === "unknown" && B.exchange(rich, "t_minarai", {}).reason === "unknown", "E4", "カタログなしは unknown");
  // E5：朱印 39件・各20小判・番号順
  {
    const seals = CAT.items.filter(i => i.kind === "seal");
    const order = D.CHARS.slice().sort((a, b) => Number(a.num) - Number(b.num));
    ok(seals.length === 39 && seals.every(s => s.price === 20), "E5", `${seals.length}件`);
    ok(J(seals.map(s => s.id)) === J(order.map(c => "seal_" + c.id)) && seals.every((s, i) => s.name === order[i].name + "の朱印" && s.char === order[i].id), "E5", "ID・名前・並び");
    ok(seals[0].name === "刃の朱印" && seals[38].id === "seal_sasagane", "E5", seals[0].name);
    ok(CAT.charIds.size === 39 && D.CHARS.every(c => CAT.charIds.has(c.id)), "E5", "charIds");
    // 39体でなくても落ちない
    let threw = false, cats = [];
    try { cats = [null, undefined, [], "x", [{ id: "a", name: "A", num: "2" }, { id: "a", name: "dup" }, {}, null, { id: "BAD" }, { id: "b", num: "1" }, { id: "c<", name: "x" }, { id: "z", name: "Z" }]].map(c => B.buildCatalog(c)); } catch (e) { threw = true; }
    ok(!threw && cats[0].items.length === 19 && cats[2].items.length === 19, "E5", "39体でなくても落ちない");
    const odd = cats[4];
    ok(odd && J(odd.items.filter(i => i.kind === "seal").map(i => i.id)) === J(["seal_b", "seal_a", "seal_z"]) && odd.byId.get("seal_b").name === "bの朱印", "E5", odd ? J(odd.items.filter(i => i.kind === "seal").map(i => i.id + ":" + i.name)) : "");
    const rev = B.buildCatalog(D.CHARS.slice().reverse());
    ok(J(rev.items.map(i => i.id)) === J(CAT.items.map(i => i.id)), "E5", "渡す順に関係なく公式番号順");
  }
  // E6・E7
  {
    let x = B.normalize({ koban: 1000 }, CAT);
    for (const id of ["t_minarai", "bg_yuki", "fr_gin", "bb_washi", "seal_dan"]) x = B.exchange(x, id, CAT).state;
    const e1 = B.equip(x, "title", "t_minarai", CAT);
    ok(e1.reason === "ok" && e1.state.equip.title === "t_minarai" && e1.state.rev === x.rev + 1, "E6", e1.reason);
    ok(B.equip(x, "bg", "bg_yuki", CAT).reason === "ok" && B.equip(x, "frame", "fr_gin", CAT).reason === "ok" && B.equip(x, "bubble", "bb_washi", CAT).reason === "ok", "E6", "4つの枠");
    ok(B.equip(x, "title", "t_tsukimi", CAT).reason === "not_owned", "E6", "持っていない物");
    ok(B.equip(x, "title", "bg_yuki", CAT).reason === "kind" && B.equip(x, "frame", "seal_dan", CAT).reason === "kind", "E6", "kind 違い");
    ok(B.equip(x, "hat", "t_minarai", CAT).reason === "slot" && B.equip(x, "__proto__", "t_minarai", CAT).reason === "slot" && B.equip(x, "seal", "seal_dan", CAT).reason === "slot" && B.equip(x, 3, null, CAT).reason === "slot", "E6", "存在しない枠");
    ok(B.equip(x, "title", "__proto__", CAT).reason === "not_owned" && B.equip(x, "title", 5, CAT).reason === "not_owned", "E6", "変な値");
    const un = B.equip(e1.state, "title", null, CAT);
    ok(un.reason === "ok" && un.state.equip.title === null && un.state.owned.includes("t_minarai"), "E7", "null ではずす");
    ok(B.equip(e1.state, "title", undefined, CAT).state.equip.title === null, "E7", "undefined もはずす");
  }
  // E8：顔ぶれ（無料）
  {
    const x = B.empty(0);
    const g = B.equip(x, "trio", ["jin", "sakuya", "kohaku"], CAT);
    ok(g.reason === "ok" && J(g.state.equip.trio) === J(["jin", "sakuya", "kohaku"]) && g.state.koban === 0 && g.state.owned.length === 0, "E8", g.reason);
    for (const bad of [["jin", "sakuya"], ["jin", "jin", "kohaku"], ["jin", "sakuya", "nobody"], ["jin", "sakuya", "kohaku", "dan"], "jin", 5, {}, ["seal_jin", "sakuya", "kohaku"], ["__proto__", "sakuya", "kohaku"]])
      ok(B.equip(x, "trio", bad, CAT).reason === "trio_invalid", "E8", `${J(bad)} → ${B.equip(x, "trio", bad, CAT).reason}`);
    ok(B.equip(g.state, "trio", null, CAT).state.equip.trio === null, "E8", "null で元に戻す");
  }
}

// ---------- F. 正規化と保存 ----------
function groupF() {
  const E0 = J(B.empty(0));
  for (const v of [null, undefined, 0, 5, "x", "", [], [1, 2], true, NaN]) ok(J(B.normalize(v, CAT)) === E0, "F1", `${String(v)} → empty`);
  const kob = [[-5, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [1e12, B.KOBAN_MAX], ["100", 0], [3.5, 0], [250, 250], [B.KOBAN_MAX + 1, B.KOBAN_MAX]];
  for (const [v, want] of kob) { const k = B.normalize({ koban: v }, CAT).koban; ok(k === want && Number.isInteger(k) && k >= 0 && k <= B.KOBAN_MAX, "F2", `koban ${String(v)} → ${k}`); }
  {
    const n = B.normalize({ owned: ["nope", "<img src=x onerror=alert(1)>", "t_minarai", "t_minarai", "seal_jin", 5, null, "__proto__", "constructor"] }, CAT);
    ok(J(n.owned) === J(["t_minarai", "seal_jin"]), "F3", J(n.owned));
  }
  {
    const n = B.normalize({ owned: ["t_minarai", "bg_yuki"], equip: { title: "t_tsukimi", bg: "t_minarai", frame: "<x>", bubble: 5, trio: ["jin", "jin", "dan"] } }, CAT);
    ok(n.equip.title === null && n.equip.bg === null && n.equip.frame === null && n.equip.bubble === null && n.equip.trio === null, "F4", J(n.equip));
    const m = B.normalize({ owned: ["t_minarai", "bg_yuki"], equip: { title: "t_minarai", bg: "bg_yuki", trio: ["jin", "dan", "oto"] } }, CAT);
    ok(m.equip.title === "t_minarai" && m.equip.bg === "bg_yuki" && J(m.equip.trio) === J(["jin", "dan", "oto"]), "F4", "正しい物は残す");
  }
  ok(B.normalize({ adStamps: 9 }, CAT).adStamps === 6 && B.normalize({ adStamps: -3 }, CAT).adStamps === 0 && B.normalize({ adStamps: 4 }, CAT).adStamps === 4, "F5", "adStamps の範囲");
  {
    const v6 = { settings: { volume: 0.8 }, stats: { wins: 3 }, chars: {}, castle: {} };
    ok(J(B.normalize(v6.bonus, CAT)) === E0, "F6", "v6 の保存（bonus なし）→ empty");
  }
  {
    const a = { epoch: 0, rev: 5 }, b = { epoch: 0, rev: 6 }, c = { epoch: 1, rev: 0 }, a2 = { epoch: 0, rev: 5 };
    ok(B.newer(a, b) === b && B.newer(b, a) === b && B.newer(a, c) === c && B.newer(c, b) === c && B.newer(a, a2) === a && B.newer(a2, a) === a2, "F7", "epoch→rev の順・同じなら a");
    ok(B.newer(null, a) === a && B.newer(a, null) === a && B.newer(a, "x") === a && B.newer({ epoch: NaN, rev: 1 }, { epoch: 0, rev: 2 }).rev === 2, "F7", "壊れた値");
  }
  {
    const states = [B.empty(0), richState(), B.normalize({ koban: 1e12, hiDay: 5, lastDay: 9, log: [{ d: 1, k: "ad", n: 5 }, { d: 1, k: "swap", n: -20, id: "t_minarai" }, { d: 2, k: "swap", n: -20 }, { d: 3, k: "nope", n: 1 }] }, CAT)];
    const rnd = mulberry32(99);
    for (let i = 0; i < 50; i++) states.push(B.normalize({ koban: Math.floor(rnd() * 2e6) - 1e5, days: Math.floor(rnd() * 99), lastDay: R + Math.floor(rnd() * 20) - 10, adStamps: Math.floor(rnd() * 12) - 3, owned: ["seal_jin", "t_minarai", "x"], equip: { title: "t_minarai", trio: ["jin", "dan", "oto"] } }, CAT));
    ok(states.every(s => J(B.normalize(JSON.parse(J(s)), CAT)) === J(s)), "F8", "JSON に通して戻しても同じ");
    ok(states.every(s => J(B.normalize(s)) === J(s)), "F8", "カタログなしで整えても品を落とさない（recordAdView 等）");
    const lg = states[2].log;
    ok(lg.length === 2 && lg[1].id === "t_minarai", "F8", `log の形 ${J(lg)}`);
  }
  {
    const a = B.normalize({ lastDay: 100, adLastDay: 120 }, CAT), b = B.normalize({ lastDay: 100, adLastDay: 120, hiDay: 50 }, CAT), c = B.normalize({ lastDay: 100, adLastDay: 120, hiDay: 200 }, CAT);
    ok(a.hiDay === 120 && b.hiDay === 120 && c.hiDay === 200, "F9", `${a.hiDay}/${b.hiDay}/${c.hiDay}`);
  }
  {
    const old = B.normalize({ epoch: 0, rev: 50, koban: 900, owned: ["t_minarai"] }, CAT);
    const cleared = B.empty(1791590400000);
    ok(B.newer(old, cleared) === cleared && B.newer(cleared, old) === cleared && cleared.rev === 0 && cleared.epoch === 1791590400000, "F10", "保存を消した側が勝つ");
    ok(B.empty(NaN).epoch === 0 && B.empty(-5).epoch === 0 && B.empty(12.7).epoch === 12, "F10", "empty の epoch");
  }
}

// ---------- G. カタログ・純粋さ・経済・文言・大人の確認 ----------
function groupG() {
  ok(CAT.items.every(i => B.KINDS.includes(i.kind)) && !CAT.items.some(i => i.kind === "trio") && J(CAT.kinds) === J(B.KINDS) && B.KINDS.length === 5, "G1", "kind");
  {
    const ids = CAT.items.map(i => i.id);
    ok(CAT.items.every(i => Number.isInteger(i.price) && i.price >= 1 && i.price <= 500 && typeof i.name === "string" && i.name.length > 0), "G2", "値段・名前");
    ok(new Set(ids).size === ids.length && ids.every(id => /^[a-z0-9_]+$/.test(id)), "G2", "ID が一意で形式どおり");
    const total = CAT.items.reduce((a, i) => a + i.price, 0);
    const by = k => CAT.items.filter(i => i.kind === k);
    ok(total === 2020 && CAT.items.length === 58, "G2", `合計 ${total}・${CAT.items.length}件`);
    ok([["title", 7, 560], ["bg", 5, 340], ["frame", 4, 210], ["bubble", 3, 130], ["seal", 39, 780]].every(([k, n, p]) => by(k).length === n && by(k).reduce((a, i) => a + i.price, 0) === p), "G2", "種類ごとの件数と合計");
    ok(by("bg").concat(by("frame"), by("bubble")).every(i => typeof i.css === "string" && i.css.length > 0) && by("title").every(i => i.css === null), "G2", "css の目安");
    ok(CAT.byId instanceof Map && !CAT.byId.has("constructor") && CAT.byId.get("fr_gin").name === "銀の名札", "G2", "byId は Map");
  }
  // G3：使ってはいけない物（コメントも含めて）
  {
    const forb = [/Math\.random/, /Date\.now/, /new Date\(\s*\)/, /localStorage/, /document\./, /window\./];
    const hits = forb.filter(re => re.test(SRC)).map(String);
    ok(hits.length === 0, "G3", `bonus.js に ${hits.join(" ")}`);
    ok(!/https?:\/\//.test(SRC) && !/adsbygoogle|googlesyndication/.test(SRC), "G3", "URL・広告の語が無い");
  }
  // G4：同じ入力から同じ出力
  {
    const rich = richState();
    const pairs = [
      () => B.status(rich, at(R + 9, 13), CAT), () => B.claim(rich, at(R + 10), CAT), () => B.recordAdView(rich, at(R + 10)), () => B.recordAdView(rich, at(R + 9)),
      () => B.gateQuestion(1234), () => B.gateQuestion("x"), () => B.exchange(rich, "bg_kinbyobu", CAT), () => B.equip(rich, "bg", null, CAT), () => B.declineAd(rich, at(R + 9)),
    ];
    pairs.forEach((f, i) => ok(J(f()) === J(f()), "G4", `呼び出し${i} の結果が毎回違う`));
  }
  // G5：経済（70日・全部そろう日数）
  {
    const run = (n, ad) => { let s = B.empty(0); for (let i = 0; i < n; i++) { const t = at(R + i); s = B.claim(s, t, CAT).state; if (ad) s = B.recordAdView(s, t).state; } return s; };
    const no = run(70, false), yes = run(70, true);
    ok(no.earned === 920 && yes.earned === 1970 && yes.earned / no.earned <= 2.2, "G5", `70日 ${no.earned} 対 ${yes.earned}＝${(yes.earned / no.earned).toFixed(3)}倍`);
    const daysToAll = ad => {
      const total = CAT.items.reduce((a, i) => a + i.price, 0);
      let s = B.empty(0);
      for (let i = 0; i < 400; i++) {
        const t = at(R + i); s = B.claim(s, t, CAT).state; if (ad) s = B.recordAdView(s, t).state;
        if (s.koban >= total) {
          let x = s, allOk = true;
          for (const it of CAT.items) { const r = B.exchange(x, it.id, CAT, t); if (r.reason !== "ok") allOk = false; x = r.state; }
          return { days: i + 1, allOk, left: x.koban, owned: x.owned.length };
        }
      }
      return { days: -1 };
    };
    const a = daysToAll(false), b = daysToAll(true);
    ok(a.days === 156 && b.days === 74 && a.allOk && b.allOk && a.owned === 58 && b.owned === 58, "G5", `全部そろう日 広告なし${a.days}日・広告あり${b.days}日`);
    ok(CAT.items.every(i => i.price > 0), "G5", "広告でしか手に入らない品が無い（全部に値段がある）");
    const week = [run(7, false).earned, run(7, true).earned];
    ok(week[0] === 110 && week[1] === 215, "G5", `最初の7日 ${week}`);
  }
  // G6：禁止語
  {
    ok(Array.isArray(NGW) && NGW.length >= 1 && NGW.every(w => typeof w === "string" && w.length > 0), "G6", "bonus_ngwords.json の形");
    const texts = Object.entries(B.TEXT).map(([k, v]) => ["TEXT." + k, v]).concat([["HOWTO.h", B.HOWTO.h], ["HOWTO.p", B.HOWTO.p], ["HOWTO_AD", B.HOWTO_AD]], Object.entries(B.KIND_LABEL).map(([k, v]) => ["KIND_LABEL." + k, v]), CAT.items.map(i => ["item." + i.id, i.name]));
    const hits = [];
    for (const [k, v] of texts) for (const w of NGW) if (v.includes(w)) hits.push(`${k}:${w}`);
    ok(hits.length === 0, "G6", hits.join(" "));
    const need = ["titleBtn", "titleHint", "titleBtnAria", "titleBadge", "todayHead", "todayLead", "firstNote", "claimBtn", "claimed", "claimedFirst", "alreadyToday", "nextTime", "ahead", "saveFail", "daysTotal", "slotLabel",
      "adHead", "adBeforeClaim", "adClock", "adIntro", "adChoose", "adSkip", "adStop", "adChecking", "adCancel", "adOffer", "adWatch", "adViewed", "adBig", "adExtra", "adDismissed", "adError", "adUnavailable", "adDeclined", "adDoneToday", "adStopped",
      "stampHead", "stampNote", "stampCards", "allItems", "adPolicyLink", "shopHead", "shopLead", "swapBtn", "swapConfirm", "short", "swapped", "equipBtn", "equipped", "sealCount", "bonusFoot",
      "setHint", "setHintSub", "setTrio", "trioPick", "trioReset", "trioHead", "setAd", "setAdSub", "gateHead", "gateLead", "gateQ", "gateOk", "gateDel", "gateWrong", "gateWait", "gateCancel", "resetBtn", "resetConfirm"];
    const miss = need.filter(k => typeof B.TEXT[k] !== "string" || !B.TEXT[k]);
    ok(miss.length === 0 && Object.keys(B.TEXT).length === need.length, "G6", `TEXT の欠け ${miss.join(",")}`);
    ok(B.textFill("claimBtn", { n: 10 }) === "受け取る（+10小判）" && B.textFill("adViewed", { n: 5, s: 3 }) === "広告のおまけ：+5小判。スタンプ 3/7" && B.textFill("gateQ", { a: 47, b: 6 }) === "47 × 6 = ?" && B.textFill("nope") === "" && B.textFill("constructor") === "" && B.textFill("daysTotal") === "通算 {d}日", "G6", "textFill");
    ok(Object.values(B.TEXT).every(v => !/[<>]/.test(v)), "G6", "文言に HTML の記号が無い");
  }
  // G7：大人の確認
  {
    let bad = 0;
    const seeds = [];
    for (let s = 0; s < 10000; s++) seeds.push(s);
    seeds.push(-1, -77, -9999.5, 0.5, 3.999, NaN, Infinity, -Infinity, "12", "abc", "", null, undefined, {}, [], true, 1e300, -1e300, Symbol("s"));
    for (const sd of seeds) {
      const q = B.gateQuestion(sd);
      const q2 = B.gateQuestion(sd);
      const good = Number.isInteger(q.a) && q.a >= 24 && q.a <= 98 && q.a % 10 >= 2 && Number.isInteger(q.b) && q.b >= 6 && q.b <= 9 && q.answer === q.a * q.b && q.answer >= 144 && q.answer <= 882 && String(q.answer).length === 3 && (q.a % 10) * q.b >= 10 && J(q) === J(q2);
      if (!good) bad++;
    }
    ok(bad === 0, "G7", `範囲・3けた・繰り上がり・再現 NG ${bad}件`);
    const q = B.gateQuestion(4321);
    let pass3 = 0;
    for (let n = 100; n <= 999; n++) if (B.gateCheck(q, String(n))) pass3++;
    ok(pass3 === 1 && 1 / 900 <= 1 / 100, "G7", `3けたで通る数 ${pass3}／900`);
    const d = String(q.answer).split("");
    ok(B.gateCheck(q, d) && B.gateCheck(q, d.map(Number)) && B.gateCheck(q, String(q.answer)), "G7", "答えの数字の列で真");
    ok(!B.gateCheck(q, "0" + q.answer) && !B.gateCheck(q, "") && !B.gateCheck(q, null) && !B.gateCheck(q, q.answer) && !B.gateCheck(q, [q.answer]) && !B.gateCheck(q, String(q.answer) + "0") && !B.gateCheck(null, "144") && !B.gateCheck({ a: 24, b: 6, answer: 1 }, "1"), "G7", "それ以外は偽");
    const as = new Set(), bs = new Set();
    for (let s = 0; s < 300; s++) { const x = B.gateQuestion(s); as.add(x.a); bs.add(x.b); }
    ok(as.size >= 60 && bs.size === 4 && B.GATE_LOCK_MS === 60000, "G7", `問題の種類 a:${as.size} b:${bs.size}`);
  }
}

// ---------- 5つのタイムゾーンで回す ----------
const aOut = {};
const ORIG_TZ = process.env.TZ;
for (const tz of TZS) {
  process.env.TZ = tz; TZ = tz;
  aOut[tz] = groupA();
  groupB(); groupC(); groupD(); groupE(); groupF(); groupG();
}
TZ = "all";
const ref = J(aOut[TZS[0]]);
for (const tz of TZS) ok(J(aOut[tz]) === ref, "A6", `${tz} の日付の結果が Asia/Tokyo と違う ${J(aOut[tz])}`);
if (ORIG_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIG_TZ;

for (const m of ng) console.log("  NG " + m);
console.log(`bonustest: OK ${pass} / NG ${fail}`);
process.exit(fail ? 1 : 0);
