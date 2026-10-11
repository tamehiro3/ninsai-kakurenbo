// 忍彩かくれんぼ — 広告の受け渡し（設計図 login-bonus-blueprint v2 §5.3・§6.5）
// 段階1：provider "none"＝広告は無効。外への通信はしない・読み込みの要素も作らない・広告の画面も出さない。
// 段階2（オーナーの承認と設定のあと）で ensureLoader と leakCheck の中身を設計図 §5.4・§5.8 に置き換える。
// 副作用はこのファイルだけ。node の検査（tools/adstest.js）は create(env, cfg) に偽の win・doc・タイマーを渡す。
const Ads = (() => {
  const CONFIG = { provider: "none", client: "", testMode: false, offerTimeoutMs: 10000, showTimeoutMs: 5000, childDirected: true };
  const RETRY = { notReady: 1, noAdPreloaded: 1 };   // 準備の合図（onReady）の前のこの2つは、1回だけやり直す

  // env = { win, doc, setT, clearT, isLocal, isTestHost }。cfg は写さずに使う（手元の検証で provider を変えると Ads.CONFIG にも映る）
  function create(env, cfg) {
    const win = env.win || {};
    const doc = env.doc || null;            // 段階1では使わない（段階2の読み込みで使う）
    const setT = env.setT, clearT = env.clearT;
    const isLocal = !!env.isLocal, isTestHost = !!env.isTestHost;
    let soundOn = true;
    let fake = false;                       // 段階1：手元の偽の広告が入っているか
    let loaded = false;                     // 読み込みの準備は一度だけ
    let gen = 0;                            // 準備の世代（古い合図を無視する）
    let cfgReady = false;                   // adConfig の onReady を受けたか
    let waiters = [];                       // onReady を待っている処理
    let cur = null;                         // いまの申し出（prepare 1回ぶん）
    let onScreen = null;                    // 画面に出ている広告（beforeAd〜afterAd）

    const safe = (fn, ...args) => { try { if (typeof fn === "function") fn(...args); } catch (e) { } };   // ゲーム側のフックで落ちない
    const stopT = (s, k) => { if (s[k] != null) { clearT(s[k]); s[k] = null; } };

    function available() {                  // 通信しない
      return cfg.provider === "h5" && !(win.navigator && win.navigator.onLine === false);
    }
    function markReady(g) {
      if (g !== gen || cfgReady) return;
      cfgReady = true;
      const w = waiters; waiters = [];
      w.forEach(f => safe(f));
    }
    function whenReady(f) { if (cfgReady) f(); else waiters.push(f); }

    // 段階1：本物の広告は読み込まない（要素も作らない）。手元の偽の広告が入っているときだけ true。
    // 段階2で中身を設計図 §5.4 に置き換える（子ども向けの属性を全部付けてから足す・一度だけ・読み直さない）。
    function ensureLoader() {
      if (cfg.provider !== "h5" || !fake) return false;
      if (loaded) return true;
      loaded = true;
      const g = gen;
      if (typeof win.adConfig === "function") {
        try { win.adConfig({ preloadAdBreaks: "on", sound: soundOn ? "on" : "off", onReady: () => markReady(g) }); } catch (e) { }   // 合図が来なければ10秒で unavailable
      } else markReady(g);
      return true;
    }

    // ---- 結果の届け方：viewed 以外は1回の prepare につき1回まで。viewed は1回まで・ほかの結果や cancel のあとでも届ける。viewed のあとは何も届けない ----
    function close(s) {
      if (s.closed) return;
      s.closed = true;
      stopT(s, "offerT"); stopT(s, "showT");
    }
    function result(s, kind, detail) {
      const send = !s.sent && !s.viewed && !s.cancelled;
      close(s);
      if (!send) return;
      s.sent = true;
      safe(s.cb.onResult, kind, detail);
    }
    function viewed(s) {
      if (s.viewed) return;
      s.viewed = true;
      close(s);
      safe(s.cb.onResult, "viewed");
    }

    // ---- adBreak 1回ぶん（やり直したら古い方の返事は無視） ----
    function request(s) {
      if (s.closed) return;
      if (typeof win.adBreak !== "function") { result(s, "unavailable", "no_api"); return; }
      const a = { s, phase: "requested", shown: false, inAd: false };
      s.att = a;
      try {
        win.adBreak({
          type: "reward", name: "otsutome_bonus",
          beforeReward: showAdFn => onBeforeReward(a, showAdFn),
          beforeAd: () => onBeforeAd(a),
          afterAd: () => onAfterAd(a),
          adDismissed: () => onDismissed(a),
          adViewed: () => onViewed(a),
          adBreakDone: info => onDone(a, info),
        });
      } catch (e) { if (s.att === a) result(s, "error", "exception"); }
    }
    function onBeforeReward(a, showAdFn) {
      const s = a.s;
      if (s.closed || s.att !== a || a.phase !== "requested") return;   // 捨てた申し出・重複は無視（広告は出さない）
      stopT(s, "offerT");
      a.phase = "offered";
      let used = false;
      const show = () => {                  // showAdFn を1回だけ呼ぶ包み
        if (used || s.closed || a.phase !== "offered") return false;
        used = true; a.shown = true; a.phase = "showing";
        s.showT = setT(() => { s.showT = null; if (a.phase === "showing") result(s, "error", "show_timeout"); }, cfg.showTimeoutMs);
        try { showAdFn(); } catch (e) { result(s, "error", "exception"); }
        return true;
      };
      safe(s.cb.onReady, show);
    }
    function onBeforeAd(a) {
      if (!a.shown || a.inAd) return;
      if (a.phase === "showing") { a.phase = "inad"; stopT(a.s, "showT"); }
      a.inAd = true; onScreen = a;
      safe(a.s.cb.beforeAd);
    }
    function onAfterAd(a) {
      if (!a.inAd) return;
      a.inAd = false;
      if (onScreen === a) onScreen = null;
      if (a.phase === "inad") a.phase = "after";
      safe(a.s.cb.afterAd);
    }
    function onViewed(a) {
      if (!a.shown) return;                 // 見せていない申し出の返事は無視
      viewed(a.s);
    }
    function onDismissed(a) {
      if (!a.shown) return;
      a.dismissed = true;
      result(a.s, "dismissed");
    }
    function onDone(a, info) {
      const s = a.s;
      const st = info && typeof info.breakStatus === "string" ? info.breakStatus : "other";
      if (a.inAd) onAfterAd(a);             // afterAd が来ないまま終わっても音は戻す
      if (s.closed || s.att !== a || a.phase === "dropped") return;
      if (!a.shown) {
        if (a.phase === "requested" && RETRY[st] && !cfgReady && !s.retried) {   // onReady の前の失敗：待って1回だけやり直す（合計10秒の内側）
          s.retried = true; a.phase = "dropped";
          whenReady(() => request(s));
          return;
        }
        result(s, "unavailable", st);       // 用意できなかった・表示の前に捨てられた（回転など）
        return;
      }
      if (s.viewed || a.dismissed) { close(s); return; }
      result(s, "error", st);               // 表示したのに viewed も dismissed も来なかった
    }

    // ---- 公開の入口 ----
    // cb = { onReady(show), onResult(kind, detail), beforeAd(), afterAd() }
    function prepare(cb) {
      if (isBusy() || cfg.provider !== "h5") return false;   // 何も呼ばない
      const s = { cb: cb || {}, closed: false, sent: false, viewed: false, cancelled: false, retried: false, att: null, offerT: null, showT: null };
      cur = s;
      if (!ensureLoader()) { result(s, "unavailable", "no_api"); return true; }
      s.offerT = setT(() => { s.offerT = null; result(s, "unavailable", "timeout"); }, cfg.offerTimeoutMs);   // 準備から beforeReward までの合計
      request(s);
      return true;
    }
    function cancel() {                     // 広告が画面に出ている間は何もしない。それ以外は申し出を捨てて使用中を解く
      if (onScreen) return false;
      const s = cur;
      if (!s || s.closed) return false;
      s.cancelled = true;
      if (s.att && !s.att.shown) s.att.phase = "dropped";
      close(s);
      return true;
    }
    function inAd() { return !!onScreen; }
    function isBusy() { return !!(cur && !cur.closed) || !!onScreen; }
    function setSound(on) {
      soundOn = !!on;
      if (typeof win.adConfig === "function") { try { win.adConfig({ sound: soundOn ? "on" : "off" }); } catch (e) { } }
    }
    function leakCheck(where) { return 0; }   // 段階1：何もしない（段階2で §5.8＝広告の要素を数えて記録する）

    const _test = {
      useFake(adBreakFn, adConfigFn) {      // 手元（localhost／127.0.0.1／[::1]）のときだけ。公開URLでは何もしない
        if (isLocal) {
          if (typeof adBreakFn !== "function" || isBusy()) return false;
          win.adBreak = adBreakFn;
          win.adConfig = typeof adConfigFn === "function" ? adConfigFn : undefined;
          fake = true; loaded = false; gen++; cfgReady = false; waiters = [];
          cfg.provider = "h5";
          return true;
        }
        return false;
      },
      host: () => ({ isLocal, isTestHost }),
    };
    return { available, ensureLoader, prepare, cancel, inAd, isBusy, setSound, leakCheck, _test };
  }

  function browserEnv() {
    const host = String((window.location && window.location.hostname) || "");
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    const o = m ? m.slice(1).map(Number) : null;
    const lan = !!o && o.every(n => n <= 255) && ((o[0] === 192 && o[1] === 168) || (o[0] === 100 && o[1] >= 64 && o[1] <= 127));   // 手元の LAN・Tailscale
    return {
      win: window, doc: typeof document !== "undefined" ? document : null,
      setT: (f, ms) => setTimeout(f, ms), clearT: id => clearTimeout(id),
      isLocal, isTestHost: isLocal || lan,
    };
  }
  const api = typeof window !== "undefined" ? create(browserEnv(), CONFIG) : null;
  return Object.assign({ CONFIG, create }, api || {});   // api は関数だけ（getter を持たない）なので、写しても古くならない
})();
if (typeof module !== "undefined") module.exports = Ads;
