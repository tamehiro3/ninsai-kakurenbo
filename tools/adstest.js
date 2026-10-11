// 広告の受け渡し（ads.js）の検査。設計図 docs/login-bonus-blueprint.md §8.1 H（偽の win・doc と、手で進めるタイマー＝本当には待たない）
//   node ninsai-kakurenbo/tools/adstest.js
const fs = require("fs");
const path = require("path");
const SRC_PATH = path.join(__dirname, "..", "ads.js");
const Ads = require("../ads.js");
let pass = 0, fail = 0;
const ng = [], skips = [], groups = [];
let gName = "", gPass = 0, gFail = 0;
const ok = (c, m) => { if (c) { pass++; gPass++; } else { fail++; gFail++; if (ng.length < 40) ng.push(`${gName} ${m}`); } };
function group(name, fn) {
  gName = name; gPass = 0; gFail = 0;
  try { fn(); } catch (e) { ok(false, "例外: " + (e && e.stack || e)); }
  groups.push(`${name}: OK ${gPass}${gFail ? " / NG " + gFail : ""}`);
}
const noThrow = fn => { try { fn(); return true; } catch (e) { return false; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 偽物 ----
function fakeTimer() {                       // setT/clearT を手で進める
  let now = 0, seq = 0;
  const q = new Map();
  return {
    setT: (f, ms) => { const id = ++seq; q.set(id, { at: now + Math.max(0, +ms || 0), f }); return id; },
    clearT: id => { q.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let best = null;
        for (const [id, t] of q) if (t.at <= end && (!best || t.at < best[1].at || (t.at === best[1].at && id < best[0]))) best = [id, t];
        if (!best) break;
        q.delete(best[0]); now = best[1].at; best[1].f();
      }
      now = end;
    },
    pending: () => q.size,
  };
}
function fakeDoc() {                         // 要素を作った・足した・探した回数を数える
  const d = { created: 0, appended: 0, queried: 0 };
  d.createElement = tag => { d.created++; return { tagName: String(tag).toUpperCase(), attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } }; };
  d.head = { appendChild: el => { d.appended++; return el; } };
  d.body = { appendChild: el => { d.appended++; return el; } };
  d.querySelectorAll = () => { d.queried++; return []; };
  d.querySelector = () => { d.queried++; return null; };
  return d;
}
function setup(o = {}) {
  const T = fakeTimer(), doc = fakeDoc();
  const win = { navigator: { onLine: o.onLine === undefined ? true : o.onLine } };
  const cfg = Object.assign({}, Ads.CONFIG, o.cfg || {});
  const isLocal = o.isLocal !== false;
  const env = { win, doc, setT: T.setT, clearT: T.clearT, isLocal, isTestHost: o.isTestHost === undefined ? isLocal : o.isTestHost };
  return { T, doc, win, cfg, env, ads: Ads.create(env, cfg) };
}
// 偽の広告ネットワーク：adBreak の引数（コールバック）を覚えておき、検査が順に呼ぶ
function fakeNet(o = {}) {
  const f = { calls: [], cfgCalls: [], onReady: null, shown: 0 };
  f.adBreak = p => {
    f.calls.push(p);
    if (o.throws) throw new Error("fake adBreak");
    if (o.autoOffer) f.offer(p);                // すぐ beforeReward（広告を用意できた）
    if (o.onCall) o.onCall(p, f.calls.length, f);
  };
  f.adConfig = c => {
    f.cfgCalls.push(c);
    if (c && typeof c.onReady === "function") { f.onReady = c.onReady; if (o.readyNow) c.onReady(); }
  };
  f.last = () => f.calls[f.calls.length - 1];
  f.offer = p => (p || f.last()).beforeReward(() => { f.shown++; if (o.onShow) o.onShow(p || f.last(), f); });
  return f;
}
function recorder(o = {}) {
  const r = { results: [], readyN: 0, show: null, before: 0, after: 0, log: [] };
  const boom = () => { if (o.throwAll) throw new Error("hook"); };
  r.cb = {
    onReady: s => { r.readyN++; r.show = s; r.log.push("ready"); boom(); },
    onResult: (k, d) => { r.results.push(d === undefined ? [k] : [k, d]); r.log.push("result:" + k); boom(); },
    beforeAd: () => { r.before++; r.log.push("beforeAd"); boom(); },
    afterAd: () => { r.after++; r.log.push("afterAd"); boom(); },
  };
  return r;
}
// h5（偽の広告入り）で prepare まで進める
function start(o = {}) {
  const S = setup(o.setup);
  const f = fakeNet(o.net);
  const r = recorder(o.rec);
  S.installed = S.ads._test.useFake(f.adBreak, o.withConfig ? f.adConfig : undefined);
  S.started = S.ads.prepare(r.cb);
  return Object.assign(S, { f, r });
}

// ---- 検査 ----
group("H1 provider none", () => {
  const S = setup();
  let called = 0;
  S.win.adBreak = () => { called++; };
  const r = recorder();
  ok(S.cfg.provider === "none", "既定の provider が none");
  ok(S.ads.available() === false, "available が false");
  ok(S.ads.prepare(r.cb) === false, "prepare が false");
  ok(called === 0, `adBreak を呼ばない（${called}回）`);
  ok(S.doc.created === 0 && S.doc.appended === 0, `createElement を呼ばない（${S.doc.created}回）`);
  ok(r.results.length === 0 && r.readyN === 0, "フックを1つも呼ばない");
  ok(S.ads.ensureLoader() === false && S.doc.created === 0, "ensureLoader も false・要素なし");
  ok(S.ads.isBusy() === false, "使用中にならない");
});

group("H2 viewed", () => {
  const S = start({ net: { onCall: p => p.beforeReward(() => { S.f.shown++; }) } });
  ok(S.installed === true && S.cfg.provider === "h5", "useFake（手元）で provider が h5");
  ok(S.ads.available() === true, "available が true");
  ok(S.started === true, "prepare が true");
  ok(S.f.calls.length === 1 && S.f.calls[0].type === "reward", "adBreak を reward で1回");
  const p = S.f.calls[0];
  ok(["beforeReward", "beforeAd", "afterAd", "adDismissed", "adViewed", "adBreakDone"].every(k => typeof p[k] === "function"), "コールバック6つを渡す");
  ok(S.r.readyN === 1 && typeof S.r.show === "function", "onReady(show) が1回");
  ok(S.r.results.length === 0, "準備できただけでは結果なし");
  ok(S.r.show() === true && S.f.shown === 1, "show で showAdFn を呼ぶ");
  ok(S.r.show() === false && S.f.shown === 1, "show は1回だけ");
  p.beforeAd(); p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
  ok(same(S.r.results, [["viewed"]]), `onResult("viewed") が1回: ${JSON.stringify(S.r.results)}`);
  ok(same(S.r.log, ["ready", "beforeAd", "result:viewed", "afterAd"]), `順番: ${S.r.log}`);
  ok(S.ads.isBusy() === false && S.ads.inAd() === false, "終わったら使用中を解く");
  ok(S.T.pending() === 0, "タイマーが残らない");
  ok(S.doc.created === 0, "偽の広告でも要素を作らない");
});

group("H3 dismissed", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  S.r.show(); p.beforeAd(); p.adDismissed(); p.afterAd(); p.adBreakDone({ breakStatus: "dismissed" });
  ok(same(S.r.results, [["dismissed"]]), `"dismissed" が1回: ${JSON.stringify(S.r.results)}`);
  ok(!S.r.results.some(x => x[0] === "viewed"), "報酬の結果は出ない");
  ok(S.ads.isBusy() === false, "使用中を解く");
});

group("H4 返事なし→timeout", () => {
  const S = start();
  ok(S.f.calls.length === 1, "adBreak を呼んだ");
  S.T.advance(9999);
  ok(S.r.results.length === 0 && S.ads.isBusy() === true, "9.999秒ではまだ待つ");
  S.T.advance(1);
  ok(same(S.r.results, [["unavailable", "timeout"]]), `10秒で unavailable/timeout: ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false, "使用中を解く");
  S.f.offer();
  ok(S.r.readyN === 0 && S.f.shown === 0, "時間切れのあとの beforeReward は無視（広告を出さない）");
  S.T.advance(60000);
  ok(S.r.results.length === 1, "結果は1回だけ");
});

group("H5 onReady の後の noAdPreloaded", () => {
  for (const withConfig of [false, true]) {
    const tag = withConfig ? "（adConfig あり・onReady 済み）" : "（adConfig なし＝すぐ準備完了）";
    const S = start({ withConfig, net: { readyNow: true, onCall: p => p.adBreakDone({ breakStatus: "noAdPreloaded" }) } });
    if (withConfig) ok(S.f.cfgCalls.length === 1 && S.f.cfgCalls[0].preloadAdBreaks === "on" && typeof S.f.cfgCalls[0].onReady === "function", "adConfig に preloadAdBreaks と onReady");
    ok(same(S.r.results, [["unavailable", "noAdPreloaded"]]), `unavailable${tag}: ${JSON.stringify(S.r.results)}`);
    ok(S.f.calls.length === 1, `やり直さない${tag}（${S.f.calls.length}回）`);
    ok(S.r.readyN === 0 && S.ads.isBusy() === false, `ボタンを出さず使用中を解く${tag}`);
    S.T.advance(20000);
    ok(S.r.results.length === 1, `結果は1回だけ${tag}`);
  }
});

group("H6 viewed は1回だけ", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  S.r.show(); p.beforeAd(); p.adViewed(); p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" }); p.adDismissed(); p.adBreakDone({ breakStatus: "error" });
  S.T.advance(60000);
  ok(same(S.r.results, [["viewed"]]), `onResult は viewed の1回だけ: ${JSON.stringify(S.r.results)}`);
});

group("H7 adBreak が例外", () => {
  const S = start({ net: { throws: true } });
  ok(S.started === true, "prepare 自体は落ちない");
  ok(same(S.r.results, [["error", "exception"]]), `"error"/"exception": ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false && S.T.pending() === 0, "使用中・タイマーを解く");
  S.T.advance(20000);
  ok(S.r.results.length === 1, "結果は1回だけ");
});

group("H8 使用中の2回目", () => {
  const S = start();
  const r2 = recorder();
  ok(S.ads.isBusy() === true, "1回目のあと使用中");
  ok(S.ads.prepare(r2.cb) === false, "2回目の prepare は false");
  ok(S.f.calls.length === 1, "adBreak は1回のまま");
  ok(r2.results.length === 0 && r2.readyN === 0, "2回目のフックは呼ばない");
  S.T.advance(10000);
  ok(same(S.r.results, [["unavailable", "timeout"]]) && S.ads.isBusy() === false, "1回目が終わる");
  const r3 = recorder();
  ok(S.ads.prepare(r3.cb) === true && S.f.calls.length === 2, "終わったあとはまた prepare できる");
  S.f.calls[0].adBreakDone({ breakStatus: "other" });
  ok(r3.results.length === 0 && S.r.results.length === 1, "前の申し出の返事は、次の申し出に混ざらない");
});

group("H9 cancel", () => {
  { // beforeReward の前に cancel
    const S = start();
    ok(S.ads.cancel() === true && S.ads.isBusy() === false, "待っている間の cancel で使用中を解く");
    const p = S.f.last();
    S.f.offer(p);
    ok(S.r.readyN === 0 && S.f.shown === 0, "cancel のあとの beforeReward は無視");
    p.adBreakDone({ breakStatus: "other" }); S.T.advance(20000);
    ok(S.r.results.length === 0, "cancel のあとは結果を届けない（timeout も無し）");
    ok(S.ads.cancel() === false, "2回目の cancel は何もしない");
  }
  { // show の前に cancel
    const S = start({ net: { autoOffer: true } });
    const p = S.f.last();
    ok(S.r.readyN === 1, "準備できた");
    ok(S.ads.cancel() === true && S.ads.isBusy() === false, "show の前の cancel で使用中を解く");
    ok(S.r.show() === false && S.f.shown === 0, "cancel のあとの show は何もしない");
    p.beforeAd(); p.adViewed(); p.adDismissed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
    ok(S.r.results.length === 0 && S.r.before === 0 && S.r.after === 0, `そのあとの返事は無視: ${JSON.stringify(S.r.results)}`);
  }
  { // show のあと・beforeAd の前に cancel
    const S = start({ net: { autoOffer: true } });
    const p = S.f.last();
    S.r.show();
    ok(S.ads.inAd() === false && S.ads.cancel() === true, "表示の前（beforeAd の前）なら cancel できる");
    ok(S.ads.isBusy() === false, "使用中を解く");
    p.beforeAd();
    ok(S.r.before === 1 && S.ads.inAd() === true, "あとから広告が出たら音のフックは呼ぶ");
    p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
    ok(same(S.r.results, [["viewed"]]), `show のあとの cancel でも viewed は届く: ${JSON.stringify(S.r.results)}`);
    ok(S.r.after === 1 && S.ads.inAd() === false, "afterAd で音を戻す");
  }
  { // 広告が画面に出ている間の cancel
    const S = start({ net: { autoOffer: true } });
    const p = S.f.last();
    S.r.show(); p.beforeAd();
    ok(S.ads.cancel() === false && S.ads.isBusy() === true && S.ads.inAd() === true, "表示中の cancel は何もしない");
    p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
    ok(same(S.r.results, [["viewed"]]) && S.ads.isBusy() === false, "表示中に cancel しても viewed は届く");
  }
});

group("H10 beforeAd/afterAd のフック", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  S.r.show();
  ok(S.r.before === 0 && S.ads.inAd() === false, "show の直後はまだ表示前");
  p.beforeAd();
  ok(S.r.before === 1 && S.ads.inAd() === true && S.ads.isBusy() === true, "beforeAd のフック・inAd が true");
  p.beforeAd();
  ok(S.r.before === 1, "beforeAd の重複は1回に");
  p.adViewed();
  ok(S.ads.inAd() === true && S.ads.isBusy() === true, "viewed のあとも afterAd までは表示中");
  p.afterAd();
  ok(S.r.after === 1 && S.ads.inAd() === false && S.ads.isBusy() === false, "afterAd のフック・inAd が false");
  { // afterAd が来ないまま adBreakDone
    const S2 = start({ net: { autoOffer: true } });
    const q = S2.f.last();
    S2.r.show(); q.beforeAd(); q.adViewed(); q.adBreakDone({ breakStatus: "viewed" });
    ok(S2.r.after === 1 && S2.ads.inAd() === false && S2.ads.isBusy() === false, "afterAd が来なくても adBreakDone で音を戻し、使用中を解く");
  }
});

group("H11 公開URLでは偽の広告を入れない", () => {
  for (const isTestHost of [false, true]) {
    const S = setup({ isLocal: false, isTestHost });
    const f = fakeNet();
    const tag = isTestHost ? "（LAN・Tailscale）" : "（公開URL）";
    ok(S.ads._test.useFake(f.adBreak, f.adConfig) === false, `useFake が false${tag}`);
    ok(S.cfg.provider === "none", `provider は none のまま${tag}`);
    ok(S.win.adBreak === undefined && S.win.adConfig === undefined, `win.adBreak を差し替えない${tag}`);
    ok(S.ads.available() === false && S.ads.ensureLoader() === false, `available・ensureLoader は false${tag}`);
    const r = recorder();
    ok(S.ads.prepare(r.cb) === false && f.calls.length === 0, `prepare は false・adBreak なし${tag}`);
  }
  const L = setup({ isLocal: true });
  ok(L.ads._test.useFake("not a function") === false && L.cfg.provider === "none", "関数でない adBreak は入れない");
});

group("H12 段階1の ensureLoader は要素を作らない", () => {
  { // h5 だが偽の広告なし
    const S = setup({ cfg: { provider: "h5", client: "ca-pub-0000000000000000" } });
    ok(S.ads.ensureLoader() === false, "偽の広告が無ければ false");
    const r = recorder();
    ok(S.ads.prepare(r.cb) === true, "prepare は受け付ける");
    ok(same(r.results, [["unavailable", "no_api"]]), `unavailable/no_api: ${JSON.stringify(r.results)}`);
    ok(S.ads.isBusy() === false && S.T.pending() === 0, "使用中・タイマーを残さない");
    ok(S.doc.created === 0 && S.doc.appended === 0, `script 要素を作らない（createElement ${S.doc.created}回）`);
  }
  { // 偽の広告あり
    const S = setup();
    const f = fakeNet();
    S.ads.setSound(false);
    S.ads._test.useFake(f.adBreak, f.adConfig);
    ok(S.ads.ensureLoader() === true && S.ads.ensureLoader() === true, "偽の広告があれば true");
    ok(f.cfgCalls.length === 1, `adConfig の準備は一度だけ（${f.cfgCalls.length}回）`);
    ok(f.cfgCalls[0] && f.cfgCalls[0].sound === "off" && f.cfgCalls[0].preloadAdBreaks === "on", "準備に音の設定と preloadAdBreaks を渡す");
    ok(S.doc.created === 0 && S.doc.appended === 0 && S.doc.queried === 0, "偽の広告でも要素を作らない・探さない");
  }
});

group("H13 表示後に adBreakDone だけ", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  S.r.show(); p.beforeAd(); p.afterAd(); p.adBreakDone({ breakStatus: "other" });
  ok(same(S.r.results, [["error", "other"]]), `"error": ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false, "使用中を解く");
  const S2 = start({ net: { autoOffer: true } });
  const q = S2.f.last();
  S2.r.show(); q.beforeAd(); q.afterAd(); q.adBreakDone();
  ok(same(S2.r.results, [["error", "other"]]), `breakStatus が無くても "error": ${JSON.stringify(S2.r.results)}`);
});

group("H14 オフライン", () => {
  ok(setup({ cfg: { provider: "h5" }, onLine: false }).ads.available() === false, "navigator.onLine=false で false");
  ok(setup({ cfg: { provider: "h5" }, onLine: true }).ads.available() === true, "onLine=true で true");
  const S = setup({ cfg: { provider: "h5" } });
  delete S.win.navigator;
  ok(S.ads.available() === true, "navigator が無くても落ちない");
  const S2 = setup({ onLine: false });
  S2.ads._test.useFake(fakeNet().adBreak);
  ok(S2.ads.available() === false, "偽の広告でもオフラインなら false");
});

group("H15 表示の前に捨てられた（回転など）", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  ok(S.r.readyN === 1, "準備できた");
  p.adBreakDone({ breakStatus: "other" });
  ok(same(S.r.results, [["unavailable", "other"]]), `"unavailable": ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false && S.T.pending() === 0, "使用中を解く");
  ok(S.r.show() === false && S.f.shown === 0, "そのあとの show は何もしない");
  p.adViewed();
  ok(S.r.results.length === 1, "見せていない申し出の viewed は無視");
  const r2 = recorder();
  ok(S.ads.prepare(r2.cb) === true, "また prepare できる（固まらない）");
});

group("H16 表示が始まらない（show_timeout）", () => {
  const S = start({ net: { autoOffer: true } });
  const p = S.f.last();
  S.r.show();
  S.T.advance(4999);
  ok(S.r.results.length === 0 && S.ads.isBusy() === true, "4.999秒ではまだ待つ");
  S.T.advance(1);
  ok(same(S.r.results, [["error", "show_timeout"]]), `"error"/"show_timeout": ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false, "使用中を解く");
  p.beforeAd();
  ok(S.r.before === 1 && S.ads.inAd() === true, "あとから広告が出たら音を止める");
  p.adViewed(); p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
  ok(same(S.r.results, [["error", "show_timeout"], ["viewed"]]), `その後の adViewed は "viewed" が1回: ${JSON.stringify(S.r.results)}`);
  ok(S.ads.isBusy() === false && S.ads.inAd() === false, "終わったら使用中を解く");
  { // beforeAd が間に合えば show_timeout は出ない
    const S2 = start({ net: { autoOffer: true } });
    const q = S2.f.last();
    S2.r.show(); S2.T.advance(4000); q.beforeAd(); S2.T.advance(60000);
    ok(S2.r.results.length === 0 && S2.ads.isBusy() === true, "表示が始まったら5秒の見張りは止まる（広告が長くても error にしない）");
    q.adViewed(); q.afterAd();
    ok(same(S2.r.results, [["viewed"]]), "長い広告でも viewed");
  }
  { // 別の順番：dismissed のあとに viewed が来ても viewed は届ける
    const S3 = start({ net: { autoOffer: true } });
    const q = S3.f.last();
    S3.r.show(); q.beforeAd(); q.adDismissed(); q.adViewed(); q.afterAd(); q.adBreakDone({ breakStatus: "viewed" });
    ok(same(S3.r.results, [["dismissed"], ["viewed"]]), `ほかの結果のあとでも viewed は届く: ${JSON.stringify(S3.r.results)}`);
  }
});

group("H17 フックが例外を投げても落ちない", () => {
  let S;
  const ran = noThrow(() => {
    S = start({ rec: { throwAll: true }, net: { autoOffer: true } });
  });
  ok(ran, "prepare・onReady の例外が外へ出ない");
  const p = S.f.last();
  ok(typeof S.r.show === "function", "onReady が例外でも show は渡っている");
  ok(noThrow(() => S.r.show()) && S.f.shown === 1, "show が動く");
  ok(noThrow(() => p.beforeAd()), "beforeAd のフックの例外が広告側へ出ない");
  ok(noThrow(() => p.adViewed()), "onResult の例外が広告側へ出ない");
  ok(noThrow(() => p.adViewed()), "2回目の adViewed も落ちない");
  ok(noThrow(() => p.afterAd()), "afterAd のフックの例外が広告側へ出ない");
  ok(noThrow(() => p.adBreakDone({ breakStatus: "viewed" })), "adBreakDone も落ちない");
  ok(same(S.r.results, [["viewed"]]), `"viewed" は1回だけ: ${JSON.stringify(S.r.results)}`);
  ok(S.r.before === 1 && S.r.after === 1, "フックは1回ずつ呼ばれた");
  ok(S.ads.isBusy() === false && S.ads.inAd() === false, "使用中・表示中を解く");
  { // 例外のフックで、ほかの結果も1回だけ
    let S2;
    noThrow(() => { S2 = start({ rec: { throwAll: true } }); });
    ok(noThrow(() => S2.T.advance(10000)) && same(S2.r.results, [["unavailable", "timeout"]]), "timeout の onResult が例外でも落ちない");
  }
});

group("H18 onReady の前の notReady", () => {
  { // 1回だけやり直して beforeReward
    let n = 0;
    const S = start({ withConfig: true, net: { onCall: (p, k) => { n = k; if (k === 1) p.adBreakDone({ breakStatus: "notReady" }); } } });
    ok(S.f.cfgCalls.length === 1 && typeof S.f.onReady === "function", "adConfig に onReady を渡した（まだ呼ばれていない）");
    ok(S.f.calls.length === 1 && S.r.results.length === 0 && S.ads.isBusy() === true, "onReady の前の notReady では結果を出さず待つ");
    S.T.advance(3000);
    ok(S.f.calls.length === 1, "onReady が来るまでやり直さない");
    S.f.onReady();
    ok(S.f.calls.length === 2 && n === 2, `onReady のあと1回だけやり直す（adBreak ${S.f.calls.length}回）`);
    S.f.offer(S.f.calls[1]);
    ok(S.r.readyN === 1 && S.r.results.length === 0, "やり直しで beforeReward が来る");
    S.f.offer(S.f.calls[0]);
    S.f.calls[0].adBreakDone({ breakStatus: "other" });
    ok(S.r.readyN === 1 && S.r.results.length === 0, "古い方の返事は無視");
    S.f.onReady();
    ok(S.f.calls.length === 2, "onReady が重ねて来ても増えない");
    const p = S.f.calls[1];
    S.r.show(); p.beforeAd(); p.adViewed(); p.afterAd(); p.adBreakDone({ breakStatus: "viewed" });
    ok(same(S.r.results, [["viewed"]]), "やり直した広告で viewed");
  }
  { // 2回目の失敗は unavailable
    const S = start({ withConfig: true, net: { onCall: (p, k) => p.adBreakDone({ breakStatus: k === 1 ? "notReady" : "noAdPreloaded" }) } });
    S.f.onReady();
    ok(S.f.calls.length === 2, "1回だけやり直した");
    ok(same(S.r.results, [["unavailable", "noAdPreloaded"]]), `2回目の失敗で unavailable: ${JSON.stringify(S.r.results)}`);
    ok(S.ads.isBusy() === false && S.T.pending() === 0, "使用中を解く");
    S.f.onReady();
    ok(S.f.calls.length === 2, "それ以上はやり直さない");
  }
  { // onReady の前に noAdPreloaded が2回続いても、やり直しは1回
    const S = start({ withConfig: true, net: { onCall: p => p.adBreakDone({ breakStatus: "noAdPreloaded" }) } });
    ok(S.f.calls.length === 1 && S.r.results.length === 0, "1回目はやり直しを待つ");
    S.f.onReady();
    ok(S.f.calls.length === 2 && same(S.r.results, [["unavailable", "noAdPreloaded"]]), "やり直しは1回・その失敗で unavailable");
  }
  { // onReady が来ないまま10秒
    const S = start({ withConfig: true, net: { onCall: p => p.adBreakDone({ breakStatus: "notReady" }) } });
    S.T.advance(10000);
    ok(same(S.r.results, [["unavailable", "timeout"]]), `合計10秒で unavailable/timeout: ${JSON.stringify(S.r.results)}`);
    S.f.onReady();
    ok(S.f.calls.length === 1, "時間切れのあとに onReady が来ても、やり直さない");
  }
  { // やり直しを待つ間の cancel
    const S = start({ withConfig: true, net: { onCall: p => p.adBreakDone({ breakStatus: "notReady" }) } });
    ok(S.ads.cancel() === true && S.ads.isBusy() === false, "待つ間に cancel できる");
    S.f.onReady();
    ok(S.f.calls.length === 1 && S.r.results.length === 0, "cancel のあとはやり直さない");
  }
  { // やり直しも合計10秒の内側
    const S = start({ withConfig: true, net: { onCall: (p, k) => { if (k === 1) p.adBreakDone({ breakStatus: "notReady" }); } } });
    S.T.advance(8000); S.f.onReady();
    ok(S.f.calls.length === 2, "8秒後に onReady → やり直す");
    S.T.advance(1999);
    ok(S.r.results.length === 0, "まだ10秒たっていない");
    S.T.advance(1);
    ok(same(S.r.results, [["unavailable", "timeout"]]), "最初から数えて10秒で timeout（やり直しで延びない）");
  }
  { // notReady 以外（frequencyCapped など）はやり直さない
    const S = start({ withConfig: true, net: { onCall: p => p.adBreakDone({ breakStatus: "frequencyCapped" }) } });
    ok(S.f.calls.length === 1 && same(S.r.results, [["unavailable", "frequencyCapped"]]), "ほかの理由はすぐ unavailable");
  }
});

skips.push("H19 段階2で追加（段階1は ensureLoader が script を作らないことを H12 で確認）");

group("H20 isBusy は関数で今の値を返す", () => {
  const S = start({ net: { autoOffer: true } });
  const copy = Object.assign({}, S.ads);                       // ゲームの Ads と同じく、写した物でも古くならない
  ok(S.ads.isBusy() === true && copy.isBusy() === true, "prepare のあと true");
  const p = S.f.last();
  S.r.show(); p.beforeAd();
  ok(copy.isBusy() === true && copy.inAd() === true, "表示中は true");
  p.adViewed();
  ok(copy.isBusy() === true, "viewed のあとも画面に出ている間は true");
  p.afterAd();
  ok(copy.isBusy() === false && copy.inAd() === false, "afterAd のあと false");
  const S2 = setup();
  ok(S2.ads.isBusy() === false, "prepare の前は false");
  S2.ads._test.useFake(fakeNet().adBreak);
  const r = recorder();
  S2.ads.prepare(r.cb);
  const c2 = Object.assign({}, S2.ads);
  ok(c2.isBusy() === true, "prepare の直後は true");
  S2.T.advance(10000);
  ok(c2.isBusy() === false && r.results.length === 1, "結果のあと false");
  S2.ads.prepare(recorder().cb);
  ok(c2.isBusy() === true, "次の prepare でまた true");
  S2.ads.cancel();
  ok(c2.isBusy() === false, "cancel のあと false");
});

group("そのほか（setSound・leakCheck・偽の広告の入れ替え）", () => {
  const S = setup();
  ok(noThrow(() => S.ads.setSound(true)), "adConfig が無くても setSound は落ちない");
  const f = fakeNet();
  S.ads._test.useFake(f.adBreak, f.adConfig);
  S.ads.setSound(false); S.ads.setSound(true);
  ok(same(f.cfgCalls.map(c => c.sound), ["off", "on"]), `setSound は adConfig に sound を渡す: ${JSON.stringify(f.cfgCalls)}`);
  ok(S.ads.leakCheck("match") === 0 && S.doc.queried === 0, "段階1の leakCheck は0を返し、何も探さない");
  ok(S.ads.cancel() === false, "何もしていないときの cancel は false");
  const r = recorder();
  S.ads.prepare(r.cb);
  ok(S.ads._test.useFake(fakeNet().adBreak) === false, "使用中は偽の広告を入れ替えない");
  S.ads.cancel();
  const f2 = fakeNet({ onCall: p => f2.offer(p) });
  ok(S.ads._test.useFake(f2.adBreak) === true, "使用中でなければ入れ替えられる");
  const r2 = recorder();
  S.ads.prepare(r2.cb);
  ok(f2.calls.length === 1 && r2.readyN === 1 && f.calls.length === 1, "新しい偽の広告を使う（adConfig なし＝すぐ準備完了）");
});

group("ブラウザでの形（window・hostname）", () => {
  const src = fs.readFileSync(SRC_PATH, "utf8");
  const load = host => {
    const T = fakeTimer();
    const win = { location: { hostname: host }, navigator: { onLine: true } };
    const A = new Function("window", "document", "module", "setTimeout", "clearTimeout", src + "\nreturn Ads;")(win, undefined, undefined, T.setT, T.clearT);
    return { A, win, T };
  };
  const HOSTS = [
    ["localhost", true, true], ["127.0.0.1", true, true], ["[::1]", true, true],
    ["192.168.1.20", false, true], ["100.106.77.88", false, true], ["100.64.0.1", false, true], ["100.127.255.254", false, true],
    ["100.63.1.1", false, false], ["100.128.0.1", false, false], ["10.0.0.2", false, false], ["192.169.0.1", false, false],
    ["192.168.1.256", false, false], ["tamehiro3.github.io", false, false], ["localhost.example.com", false, false], ["", false, false],
  ];
  for (const [h, L, T] of HOSTS) {
    const { A } = load(h);
    const got = A._test.host();
    ok(got.isLocal === L && got.isTestHost === T, `${h || "(空)"}: isLocal ${got.isLocal}/${L} isTestHost ${got.isTestHost}/${T}`);
  }
  const pub = load("tamehiro3.github.io");
  ok(typeof pub.A.prepare === "function" && pub.A.CONFIG.provider === "none", "ブラウザでは関数と CONFIG がそろう");
  ok(pub.A._test.useFake(() => { }) === false && pub.A.CONFIG.provider === "none" && pub.win.adBreak === undefined, "公開URLでは偽の広告を入れない");
  ok(pub.A.available() === false && pub.A.prepare({}) === false, "公開URL（段階1）では広告を出さない");
  const lan = load("192.168.1.20");
  ok(lan.A._test.useFake(() => { }) === false, "LAN では偽の広告を入れない（localhost だけ）");
  const loc = load("localhost");
  ok(loc.A._test.useFake(() => { }) === true && loc.A.CONFIG.provider === "h5", "localhost の偽の広告で Ads.CONFIG.provider が h5 になる（adGate がそれを見る）");
  ok(typeof loc.win.adBreak === "function", "win.adBreak を差し替えた");
  const r = recorder();
  loc.A.prepare(r.cb);
  ok(loc.A.isBusy() === true, "ブラウザの形でも isBusy が今の値");
  loc.T.advance(10000);
  ok(same(r.results, [["unavailable", "timeout"]]) && loc.A.isBusy() === false, "ブラウザの形でもタイマーが効く");
});

group("node での形・段階1の禁止語", () => {
  ok(typeof Ads.create === "function", "create がある");
  ok(Ads.prepare === undefined, "node（window なし）では実体を作らない");
  ok(same(Ads.CONFIG, { provider: "none", client: "", testMode: false, offerTimeoutMs: 10000, showTimeoutMs: 5000, childDirected: true }), `CONFIG が段階1の値: ${JSON.stringify(Ads.CONFIG)}`);
  const src = fs.readFileSync(SRC_PATH, "utf8");
  ok(noThrow(() => new Function(src)), "構文");
  const lower = src.toLowerCase();
  for (const w of ["adsbygoogle", "googlesyndication", "data-adbreak-test"]) ok(!lower.includes(w), `ads.js に「${w}」が無い`);
  ok(!/https?:\/\//i.test(src), "ads.js に URL が無い");
  for (const w of ["fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon", "importScripts", "createElement", "appendChild", "<script", "localStorage"]) ok(!src.includes(w), `ads.js に「${w}」が無い（段階1は通信も要素の追加もしない）`);
  for (const w of ["ガチャ", "課金", "決済", "購入する", "クレジットカード", "パスワード", "Stripe", "paypal"]) ok(!src.includes(w), `ads.js に「${w}」が無い（inspect の禁止語）`);
  ok((src.match(/provider:\s*"/g) || []).length === 1 && /provider:\s*"none"/.test(src), "provider の値は CONFIG の1か所だけで none");
  ok(/testMode:\s*false/.test(src) && !/testMode:\s*true/.test(src), "testMode は false");
  const um = /useFake[\s\S]{0,400}/.exec(src);
  ok(!!um && um[0].includes("isLocal"), "useFake のすぐ後に isLocal の条件（inspect 9）");
});

for (const g of groups) console.log(g);
for (const s of skips) console.log("SKIP:", s);
for (const m of ng) console.log("NG:", m);
console.log(`adstest: OK ${pass} / NG ${fail}`);
process.exit(fail ? 1 : 0);
