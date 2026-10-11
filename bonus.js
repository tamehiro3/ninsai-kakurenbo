// 忍彩かくれんぼ — おつとめ帳（毎日の小判・交換所・広告のおまけのスタンプ）。設計図 docs/login-bonus-blueprint.md v2 §6.3
// 純粋な関数だけ：時刻・epoch・問題の種は引数で受け取り、保存は呼び出し側（game.js）が行う。
// 入力は書き換えない（毎回 normalize で作り直した複製を変えて、新しい state を返す）。画面の文言は全部 TEXT に置く。
const Bonus = (() => {
  const VERSION = 1;
  const TZ_OFFSET_MIN = 540;          // 日本時間
  const DAY_START_HOUR = 4;           // 午前4時で日付が変わる（夜ふかしの理由を作らない）
  const DAY_MS = 86400000;
  const SHIFT_MS = (TZ_OFFSET_MIN - DAY_START_HOUR * 60) * 60000;   // = 18,000,000
  const FUTURE_LIMIT_DAYS = 7;        // これより先の受け取り記録は「時計が大きく狂っていた」とみなす
  const LOGIN_TRACK = Object.freeze([10, 10, 10, 10, 10, 10, 30]);
  const TRACK = LOGIN_TRACK.length;
  const FIRST_GIFT = 20;
  const AD_AMOUNT = 5;                // 広告1本の小判（おつとめの量には連動しない）
  const AD_CARD = 7;
  const AD_BIG = 70;
  const KOBAN_MAX = 999999;
  const EARNED_MAX = 999999999;
  const LOG_MAX = 30;
  const SEAL_PRICE = 20;
  const KINDS = Object.freeze(["title", "bg", "frame", "bubble", "seal"]);
  const EQUIP_SLOTS = Object.freeze(["title", "bg", "frame", "bubble", "trio"]);
  const CARD_COLOR = "#F5EEDD";       // 台紙は1色だけ（周回で変えない）
  const GATE_LOCK_MS = 60000;         // 大人の確認でまちがえたときの待ち
  // 日番号の範囲（-1＝まだ。上は 9999-12-31＝日付の表示が崩れない所まで）
  const DAY_MIN = -1, DAY_MAX = 2932896;
  const INT_MAX = Number.MAX_SAFE_INTEGER;
  const LOG_KINDS = Object.freeze(["login", "first", "ad", "ad_extra", "big", "swap"]);
  const ID_RE = /^[a-z0-9_]+$/;
  const KIND_LABEL = Object.freeze({ title: "称号", bg: "タイトルの背景", frame: "名札", bubble: "吹き出し", seal: "朱印帳" });

  // ---------- 画面の文言（§2 の表と同じ。{x} は textFill で差し込む） ----------
  const TEXT = Object.freeze({
    // タイトル
    titleBtn: "おつとめ帳",
    titleHint: "受け取れます",
    titleBtnAria: "おつとめ帳（今日の小判を受け取れます）",      // 「受け取れます」を出しているときだけ使う
    titleBadge: "称号：{name}",
    // 今日のおつとめ
    todayHead: "今日のおつとめ",
    todayLead: "1日1回、小判を受け取れます。7回目ごとに多め。お休みしても、ゲームが進み具合を減らすことはありません。",
    firstNote: "はじめての受け取りは、さらに +20小判。",
    claimBtn: "受け取る（+{n}小判）",
    claimed: "受け取りました：+{n}小判",
    claimedFirst: "（はじめてのおまけ +20小判）",
    alreadyToday: "今日のおつとめは受け取りました。",
    nextTime: "次は、日本時間の午前4時（あと約{h}時間）から受け取れます。",
    ahead: "前に受け取った日付（{date}）が、まだ来ていません。端末の日付と時刻を確かめてください。{resume}から、また受け取れます。",
    saveFail: "この端末では記録を保存できませんでした。ページを閉じると、小判が消えることがあります。",
    daysTotal: "通算 {d}日",
    slotLabel: "{k}回目",
    // 広告のおまけ（段階2だけ画面に出す）
    adHead: "広告のおまけ",
    adBeforeClaim: "今日のおつとめを受け取ると、広告のおまけを選べます。",
    adClock: "端末の日付が先に進んでいた記録があるため、{date}まで広告のおまけはお休みです。おつとめと交換所は、いつもどおり使えます。",
    adIntro: "広告を1本見ると、+{n}小判とスタンプ1つ（7つで +70小判）。見るかどうかは自由です。「広告のおまけを選ぶ」を押すと、広告を用意するために Google と通信します。",
    adChoose: "広告のおまけを選ぶ",
    adSkip: "見ない",
    adStop: "このおさそいを出さない",
    adChecking: "広告を用意しています…",
    adCancel: "やめる",
    adOffer: "広告を1本、最後まで見ると +{n}小判。スタンプも1つ押します（7つで +70小判）。途中で閉じると、もらえません。見なくても、ほかは何も変わりません。",
    adWatch: "広告を見る",
    adViewed: "広告のおまけ：+{n}小判。スタンプ {s}/7",
    adBig: "スタンプが7つそろいました。+70小判",
    adExtra: "広告のおまけ：+{n}小判（スタンプは1日1つまでなので、今日はそのままです）",
    adDismissed: "広告を閉じました。今日の広告のおまけはありません（スタンプはそのまま）。",
    adError: "広告をうまく表示できませんでした。スタンプはそのままです。",
    adUnavailable: "いまは広告のおまけはありません。スタンプはそのままです。",
    adDeclined: "今日は広告なし。",
    adDoneToday: "今日の広告のおまけは受け取りました。",
    adStopped: "広告のおさそいを止めました。設定で戻せます。",
    stampHead: "スタンプ {s}/7（7つで +70小判）",
    stampNote: "1日1つまで。期限はなく、お休みしても、ゲームがスタンプを減らすことはありません。",
    stampCards: "そろえた台紙 {c}枚",
    allItems: "広告を見なくても、交換所の品は全部手に入ります。",
    adPolicyLink: "外部送信について",                              // 段階2でポータルのページへつなぐ
    // 交換所・朱印帳
    shopHead: "交換所",
    shopLead: "小判を、見た目の品と交換できます。どれも試合の強さは変わらず、ほかの人にも見えません。",
    swapBtn: "交換する（{p}小判）",
    swapConfirm: "もう一度押すと交換（取り消せません）",
    short: "小判が足りません（あと{x}）",
    swapped: "交換しました：{name}",
    equipBtn: "つける",
    equipped: "つけている（はずす）",
    sealCount: "朱印 {n}/39",
    bonusFoot: "小判と品は、この端末のこのブラウザの中だけの記録です。お金では手に入りません。ほかの人には見えず、送信もしません。iPhoneのSafariでは、しばらく開かないと記録が消えることがあります（ホーム画面に追加すると残りやすくなります。ホーム画面のアプリとSafariでは、記録は別々です）。",
    // 設定
    setHint: "タイトルに「受け取れます」を出す",
    setHintSub: "その日のおつとめをまだ受け取っていないとき、おつとめ帳のボタンに小さく表示します。",
    setTrio: "タイトルに並べる3人",
    trioPick: "選ぶ",
    trioReset: "元に戻す",
    trioHead: "タイトルに並べる3人を選ぶ（{k}/3）",
    setAd: "広告のおさそいを表示する",
    setAdSub: "おつとめ帳のいちばん下に、見るかどうかを選べる広告のおまけを出します。オフにしても、小判は毎日もらえます。広告や使う時間を確実に管理したいときは、端末の機能（iPhoneのスクリーンタイム、Androidのファミリーリンク）もお使いください。",
    gateHead: "大人の方へ",
    gateLead: "広告のおさそいを表示に戻すには、下の計算の答えを数字のボタンで入れてください。",
    gateQ: "{a} × {b} = ?",
    gateOk: "決定",
    gateDel: "消す",
    gateWrong: "ちがいます。1分たってから、もう一度どうぞ。",
    gateWait: "あと{s}秒で、もう一度答えられます。",
    gateCancel: "やめる",
    resetBtn: "戦績・設定・小判を消す",
    resetConfirm: "戦績・設定・小判と交換した品を消して、最初からにしますか？",
  });
  const HOWTO = Object.freeze({
    h: "おつとめ帳（毎日の小判）",
    p: "タイトル右上の「おつとめ帳」で、1日1回、小判を受け取れる（日本時間の午前4時に日付が変わる）。7回目ごとに多め。お休みしても、ゲームが進み具合を減らすことはない（ただし iPhone の Safari では、しばらく開かないと端末が記録を消すことがある）。小判は交換所で、称号・タイトルの背景・名札・吹き出し・朱印と交換できる。どれも見た目だけで、試合の強さは変わらず、ほかの人にも見えない。タイトルに並ぶ3人は、設定から無料で選べる。",
  });
  // 段階2だけ遊び方に足す段落
  const HOWTO_AD = "広告のおまけ：その日のおつとめを受け取ったあと、おつとめ帳のいちばん下で、見たいときだけ選べる。「広告のおまけを選ぶ」を押すと広告を用意し（このとき Google と通信する）、「広告を見る」で1本流れる。最後まで見ると +5小判とスタンプ1つ。スタンプ7つで +70小判。1日1回まで。ゲームがスタンプを減らすことはない。広告を見なくても、交換所の品は全部手に入る。試合中・部屋の中では広告は出ない。「このおさそいを出さない」か設定で止められる。";
  // NG語の一覧はここに置かない（tools/bonus_ngwords.json。点検ツールの誤検知を防ぐため）

  // ---------- カタログ（§4.2。css は見た目の目安＝見本やCSSを書くときの手がかり） ----------
  const FIXED = [
    ["t_minarai", "title", "見習いの忍", 20, null],
    ["t_takebayashi", "title", "竹林の影", 40, null],
    ["t_ishiniwa", "title", "石庭の影", 40, null],
    ["t_kogarashi", "title", "木枯らしの影", 60, null],
    ["t_tsukimi", "title", "月見の忍", 80, null],
    ["t_shiromori", "title", "城旗の守り手", 120, null],
    ["t_sanjukyu", "title", "三十九忍の友", 200, null],
    ["bg_yuyake", "bg", "夕焼けの城", 40, "background: radial-gradient(ellipse at 50% 110%, #8a4a2a 0%, #3a2430 45%, var(--ink) 78%)"],
    ["bg_yuki", "bg", "雪の城", 40, "background: radial-gradient(circle at 30% 30%, #ffffffb3 0 1.2px, transparent 1.8px) 0 0 / 26px 26px, radial-gradient(circle at 70% 70%, #ffffff80 0 1px, transparent 1.6px) 0 0 / 38px 38px, linear-gradient(180deg, #4a5f72 0%, #1f2d3a 55%, var(--ink) 100%)"],
    ["bg_sakura", "bg", "桜の城", 60, "background: radial-gradient(circle at 30% 30%, #f6c9d8b3 0 1.2px, transparent 1.8px) 0 0 / 26px 26px, radial-gradient(circle at 70% 70%, #f6c9d880 0 1px, transparent 1.6px) 0 0 / 38px 38px, linear-gradient(180deg, #6a3a52 0%, #2a1f2e 55%, var(--ink) 100%)"],
    ["bg_tsukiyo", "bg", "月夜の天守", 80, "background: radial-gradient(circle at 78% 16%, #f5eedd 0 3%, #f5eedd44 3.5%, transparent 9%), radial-gradient(ellipse at 50% 110%, #22344a 0%, #0b131b 70%)"],
    ["bg_kinbyobu", "bg", "金屏風", 120, "background: linear-gradient(135deg, #2e2614 0%, #5d4a20 45%, #2e2614 100%)"],
    ["fr_take", "frame", "竹の名札", 30, "border-color: #5fae7c"],
    ["fr_gin", "frame", "銀の名札", 30, "border-color: #b9c3cb"],
    ["fr_fuji", "frame", "藤の名札", 50, "border-color: #9b7fc4"],
    ["fr_kin", "frame", "金の名札", 100, "border-color: #e2c887; box-shadow: 0 0 6px #e2c88744"],
    ["bb_washi", "bubble", "和紙の吹き出し", 30, "background: #efe6cf; border: 1px solid #c9b98f"],
    ["bb_makimono", "bubble", "巻物の吹き出し", 50, "border-left: 6px solid #7a5230; border-right: 6px solid #7a5230"],
    ["bb_yozora", "bubble", "夜空の吹き出し", 50, "background: #1b2a44; color: var(--text)"],
  ];
  // カタログが無いときに ID の形から種類を決める（品を消さないための予備）
  const PREFIX_KIND = [["t_", "title"], ["bg_", "bg"], ["fr_", "frame"], ["bb_", "bubble"], ["seal_", "seal"]];

  function buildCatalog(chars) {
    const items = FIXED.map(([id, kind, name, price, css]) => Object.freeze({ id, kind, name, price, css }));
    const list = Array.isArray(chars) ? chars : [];
    const seen = new Set(), cs = [];
    list.forEach((c, i) => {
      if (!c || typeof c !== "object") return;
      const id = c.id;
      if (typeof id !== "string" || !ID_RE.test(id) || id.length > 40 || seen.has(id)) return;
      seen.add(id);
      const num = parseInt(c.num, 10);
      cs.push({ id, name: typeof c.name === "string" && c.name ? c.name : id, num: Number.isFinite(num) ? num : Infinity, i });
    });
    cs.sort((x, y) => (x.num - y.num) || (x.i - y.i));      // 公式番号順（番号が無い物は後ろ・元の順）
    for (const c of cs) items.push(Object.freeze({ id: "seal_" + c.id, kind: "seal", name: c.name + "の朱印", price: SEAL_PRICE, css: null, char: c.id }));
    return { items: Object.freeze(items), byId: new Map(items.map(it => [it.id, it])), kinds: KINDS.slice(), charIds: new Set(cs.map(c => c.id)) };
  }

  // ---------- 小さな道具 ----------
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  function intIn(v, def, lo, hi) {           // 有限の整数でなければ既定値・範囲の外は丸める
    if (typeof v !== "number" || !Number.isInteger(v)) return def;
    const x = v < lo ? lo : v > hi ? hi : v;
    return x === 0 ? 0 : x;                   // -0 を 0 に
  }
  const isCatalog = cat => !!cat && !!cat.byId && typeof cat.byId.has === "function" && typeof cat.byId.get === "function";
  function lookup(cat) {
    if (isCatalog(cat)) {
      const chars = cat.charIds && typeof cat.charIds.has === "function" ? cat.charIds : new Set();
      return {
        has: id => typeof id === "string" && cat.byId.has(id),
        kind: id => (typeof id === "string" && cat.byId.has(id) ? cat.byId.get(id).kind : null),
        isChar: id => typeof id === "string" && chars.has(id),
        max: Array.isArray(cat.items) ? cat.items.length : cat.byId.size,
      };
    }
    // カタログを渡されなかったとき（recordAdView 等）：ID の形だけで確かめる
    const kind = id => {
      if (typeof id !== "string" || id.length > 64 || !ID_RE.test(id)) return null;
      for (const [p, k] of PREFIX_KIND) if (id.startsWith(p) && id.length > p.length) return k;
      return null;
    };
    return { has: id => kind(id) !== null, kind, isChar: id => typeof id === "string" && id.length <= 40 && ID_RE.test(id), max: 512 };
  }
  function validTrio(v, L) {
    return Array.isArray(v) && v.length === 3 && v.every(x => L.isChar(x)) && new Set(v).size === 3;
  }
  function cleanLog(e, L) {
    if (!isObj(e)) return null;
    const d = own(e, "d"), k = own(e, "k"), n = own(e, "n"), id = own(e, "id");
    if (typeof d !== "number" || !Number.isInteger(d) || d < DAY_MIN || d > DAY_MAX) return null;
    if (typeof k !== "string" || !LOG_KINDS.includes(k)) return null;
    if (typeof n !== "number" || !Number.isInteger(n) || Math.abs(n) > KOBAN_MAX) return null;
    if (k === "swap") return L.has(id) ? { d, k, n, id } : null;     // 交換の記録だけ品IDを持つ
    return { d, k, n };
  }
  function todayOf(nowMs) {                   // 数値でない・範囲外の時刻は 1970-01-01〜9999-12-31 に収める
    const d = dayIndex(nowMs);
    return Number.isFinite(d) ? Math.min(DAY_MAX, Math.max(0, d)) : 0;
  }
  function addKoban(s, n) {
    s.koban = Math.min(KOBAN_MAX, s.koban + n);
    s.earned = Math.min(EARNED_MAX, s.earned + n);
  }
  function pushLog(s, e) {
    s.log.push(e);
    if (s.log.length > LOG_MAX) s.log = s.log.slice(-LOG_MAX);
  }
  const bump = s => { s.rev = Math.min(s.rev + 1, INT_MAX); };

  // ---------- 日付（日本時間の午前4時で変わる。端末のタイムゾーンに関係なく同じ） ----------
  function dayIndex(ms) { return Math.floor((Number(ms) + SHIFT_MS) / DAY_MS); }
  function nextBoundaryMs(day) { return (day + 1) * DAY_MS - SHIFT_MS; }
  function dayLabel(day) {
    const d = Number(day);
    if (!Number.isInteger(d) || d < -719162 || d > DAY_MAX) return "";   // 0001-01-01〜9999-12-31
    return new Date(d * DAY_MS).toISOString().slice(0, 10);
  }
  function dayLabelJa(day) {
    const s = dayLabel(day);
    return s ? Number(s.slice(5, 7)) + "月" + Number(s.slice(8, 10)) + "日" : "";
  }

  // ---------- 状態 ----------
  function empty(epoch) {
    const e = typeof epoch === "number" && Number.isFinite(epoch) ? Math.floor(epoch) : 0;
    return {
      v: VERSION, epoch: intIn(e, 0, 0, INT_MAX), rev: 0, koban: 0, earned: 0, days: 0, lastDay: -1, firstGift: false, hiDay: -1,
      adStamps: 0, adCards: 0, adTotal: 0, adLastDay: -1, adDeclineDay: -1,
      owned: [], equip: { title: null, bg: null, frame: null, bubble: null, trio: null }, log: [],
    };
  }

  // 何が来ても §6.1 の形に整える（毎回新しい物を返す＝呼び出し側の物は変えない）
  function normalize(raw, cat) {
    if (!isObj(raw)) return empty(0);
    // 将来 v:2 にするときは、ここで migrate(raw) を呼ぶ。v1 では v が無い・1以外も 1 として読む
    const L = lookup(cat);
    const s = empty(intIn(own(raw, "epoch"), 0, 0, INT_MAX));
    s.rev = intIn(own(raw, "rev"), 0, 0, INT_MAX);
    s.koban = intIn(own(raw, "koban"), 0, 0, KOBAN_MAX);
    s.earned = intIn(own(raw, "earned"), 0, 0, EARNED_MAX);
    s.days = intIn(own(raw, "days"), 0, 0, INT_MAX);
    s.lastDay = intIn(own(raw, "lastDay"), -1, DAY_MIN, DAY_MAX);
    s.firstGift = own(raw, "firstGift") === true || s.days > 0;     // 受け取ったことがあれば、はじめてのおまけは済み
    s.adStamps = intIn(own(raw, "adStamps"), 0, 0, AD_CARD - 1);
    s.adCards = intIn(own(raw, "adCards"), 0, 0, INT_MAX);
    s.adTotal = intIn(own(raw, "adTotal"), 0, 0, INT_MAX);
    s.adLastDay = intIn(own(raw, "adLastDay"), -1, DAY_MIN, DAY_MAX);
    s.adDeclineDay = intIn(own(raw, "adDeclineDay"), -1, DAY_MIN, DAY_MAX);
    s.hiDay = Math.max(intIn(own(raw, "hiDay"), -1, DAY_MIN, DAY_MAX), s.lastDay, s.adLastDay);   // 下げない
    const owned = new Set();
    const ro = own(raw, "owned");
    if (Array.isArray(ro)) for (const id of ro) { if (owned.size >= L.max) break; if (L.has(id)) owned.add(id); }
    s.owned = [...owned];
    const eq = isObj(own(raw, "equip")) ? raw.equip : {};
    for (const slot of ["title", "bg", "frame", "bubble"]) {
      const v = own(eq, slot);
      s.equip[slot] = typeof v === "string" && owned.has(v) && L.kind(v) === slot ? v : null;
    }
    const trio = own(eq, "trio");
    s.equip.trio = validTrio(trio, L) ? trio.slice() : null;        // 顔ぶれは無料＝持ち物は調べない
    const rl = own(raw, "log"), log = [];
    if (Array.isArray(rl)) for (const e of rl) { const x = cleanLog(e, L); if (x) log.push(x); }
    s.log = log.slice(-LOG_MAX);
    return s;
  }

  // 時計の表（§3）。reset のときは lastDay だけ直す。hiDay は下げない
  function clockOn(s, today) {
    if (s.lastDay <= today) return "ok";
    if (s.lastDay <= today + FUTURE_LIMIT_DAYS) return "ahead";
    s.lastDay = today - 1;
    return "reset";
  }
  function cleanDay(today) {
    const t = typeof today === "number" && Number.isFinite(today) ? Math.floor(today) : 0;
    return Math.min(DAY_MAX, Math.max(0, t));
  }
  function clock(state, today, cat) {
    const s = normalize(state, cat), t = cleanDay(today);
    const c = clockOn(s, t);
    return { state: s, clock: c, adClockOk: t >= s.hiDay };
  }

  function status(state, nowMs, cat) {
    const s = normalize(state, cat);
    const today = todayOf(nowMs);
    const c = clockOn(s, today);
    const claimedToday = s.lastDay === today;
    const reason = c === "ahead" ? "ahead" : claimedToday ? "claimed" : "ok";
    const nb = nextBoundaryMs(today);
    const t = Number(nowMs);
    const clockOk = today >= s.hiDay;
    return {
      today, label: dayLabel(today), labelJa: dayLabelJa(today), nextBoundaryMs: nb,
      hoursToNext: Number.isFinite(t) ? Math.min(24, Math.max(1, Math.ceil((nb - t) / 3600000))) : 24,   // nextTime の {h}
      clock: c, claimedToday, canClaim: reason === "ok", reason,
      resumeLabelJa: reason === "ahead" ? dayLabelJa(s.lastDay + 1) : null,
      aheadLabelJa: reason === "ahead" ? dayLabelJa(s.lastDay) : null,
      nextSlot: s.days % TRACK,
      doneInCycle: claimedToday && s.days > 0 ? ((s.days - 1) % TRACK) + 1 : s.days % TRACK,
      nextAmount: LOGIN_TRACK[s.days % TRACK], firstPending: !s.firstGift,
      days: s.days, koban: s.koban, earned: s.earned,
      ad: {
        stamps: s.adStamps, cards: s.adCards, total: s.adTotal,
        doneToday: s.adLastDay === today, declinedToday: s.adDeclineDay === today,
        clockOk, resumeLabelJa: clockOk ? null : dayLabelJa(s.hiDay), amount: AD_AMOUNT, left: AD_CARD - s.adStamps,
      },
      state: s,
    };
  }

  // おつとめを受け取る。1日1回。広告とは関係ない
  function claim(state, nowMs, cat) {
    const s = normalize(state, cat);
    const today = todayOf(nowMs);
    const c = clockOn(s, today);
    if (c === "ahead") return { reason: "ahead", state: s, granted: null };
    if (s.lastDay === today) return { reason: "claimed", state: s, granted: null };
    const slot = s.days % TRACK, amount = LOGIN_TRACK[slot], first = !s.firstGift;
    const total = amount + (first ? FIRST_GIFT : 0);
    addKoban(s, total);
    s.days = Math.min(s.days + 1, INT_MAX);
    s.lastDay = today;
    s.firstGift = true;
    s.hiDay = Math.max(s.hiDay, today);
    bump(s);
    pushLog(s, { d: today, k: "login", n: amount });
    if (first) pushLog(s, { d: today, k: "first", n: FIRST_GIFT });
    return { reason: "ok", state: s, granted: { amount, first, total, slot } };
  }

  // 広告のおまけの段①を出してよいか（§5.2 の順）。どれを調べても通信はしない
  function adGate(ctx) {
    const c = isObj(ctx) ? ctx : {};
    const no = reason => ({ ok: false, reason });
    if (c.provider !== "h5") return no("provider_none");
    if (!c.settingOn) return no("setting_off");
    if (c.screen !== "bonus") return no("not_bonus_screen");
    if (c.inMatch) return no("in_match");
    if (c.inRoom) return no("in_room");
    if (!c.adClockOk) return no("clock");
    if (!c.claimedToday) return no("not_claimed");
    if (c.adDoneToday) return no("done_today");
    if (c.declinedToday) return no("declined_today");
    if (!c.online) return no("offline");
    if (!c.apiOk) return no("no_api");
    return { ok: true, reason: "ok" };
  }

  // 広告を最後まで見た。見終えたら必ず小判を渡す（小判0の結果は無い）。おつとめを受け取ったかは調べない
  function recordAdView(state, nowMs, cat) {
    const s = normalize(state, cat);
    const today = todayOf(nowMs);
    const extra = s.adLastDay === today || today < s.hiDay;          // 今日もう押した・時計が前借りの日より前 → 小判だけ
    let big = false;
    if (extra) {
      pushLog(s, { d: today, k: "ad_extra", n: AD_AMOUNT });
    } else {
      s.adStamps += 1;
      s.adLastDay = today;
      pushLog(s, { d: today, k: "ad", n: AD_AMOUNT });
      if (s.adStamps >= AD_CARD) {                                     // 7つそろった：台紙を戻して次の周へ
        big = true;
        s.adStamps = 0;
        s.adCards = Math.min(s.adCards + 1, INT_MAX);
        pushLog(s, { d: today, k: "big", n: AD_BIG });
      }
    }
    const bonus = big ? AD_BIG : 0;
    addKoban(s, AD_AMOUNT + bonus);
    s.adTotal = Math.min(s.adTotal + 1, INT_MAX);
    s.hiDay = Math.max(s.hiDay, today);
    bump(s);
    return {
      reason: extra ? "extra" : "ok", state: s,
      granted: { amount: AD_AMOUNT, bonus, total: AD_AMOUNT + bonus, stamps: big ? AD_CARD : s.adStamps, big, cards: s.adCards, extra },
    };
  }

  // 「見ない」「やめる」・途中で閉じた：その日はもう出さない
  function declineAd(state, nowMs, cat) {
    const s = normalize(state, cat);
    s.adDeclineDay = todayOf(nowMs);
    bump(s);
    return s;
  }

  // 交換所。カタログに無いID（__proto__ 等も）は unknown
  function exchange(state, id, cat, nowMs) {
    const s = normalize(state, cat);
    const item = isCatalog(cat) && typeof id === "string" && cat.byId.has(id) ? cat.byId.get(id) : null;
    if (!item) return { reason: "unknown", state: s, item: null, need: 0 };
    if (s.owned.includes(id)) return { reason: "owned", state: s, item, need: 0 };
    if (s.koban < item.price) return { reason: "short", state: s, item, need: item.price - s.koban };
    s.koban -= item.price;
    s.owned.push(id);
    bump(s);
    const d = typeof nowMs === "number" && Number.isFinite(nowMs) ? todayOf(nowMs) : s.hiDay;   // 時刻が無ければ最後に見た日
    pushLog(s, { d, k: "swap", n: -item.price, id });
    return { reason: "ok", state: s, item, need: 0 };
  }

  // つける／はずす（value = null）。顔ぶれ（trio）は無料で、持ち物は調べない
  function equip(state, slot, value, cat) {
    const s = normalize(state, cat);
    if (typeof slot !== "string" || !EQUIP_SLOTS.includes(slot)) return { reason: "slot", state: s };
    if (value == null) {
      if (s.equip[slot] !== null) { s.equip[slot] = null; bump(s); }
      return { reason: "ok", state: s };
    }
    const L = lookup(cat);
    if (slot === "trio") {
      if (!validTrio(value, L)) return { reason: "trio_invalid", state: s };
      const cur = s.equip.trio;
      if (!cur || cur.some((x, i) => x !== value[i])) { s.equip.trio = value.slice(); bump(s); }
      return { reason: "ok", state: s };
    }
    if (typeof value !== "string" || !s.owned.includes(value)) return { reason: "not_owned", state: s };
    if (L.kind(value) !== slot) return { reason: "kind", state: s };
    if (s.equip[slot] !== value) { s.equip[slot] = value; bump(s); }
    return { reason: "ok", state: s };
  }

  // 新旧判定：epoch（保存を消した回）→ rev（書き換えの回数）。同じなら a
  function newer(a, b) {
    if (!isObj(b)) return a;
    if (!isObj(a)) return b;
    const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const ea = num(a.epoch), eb = num(b.epoch);
    if (eb !== ea) return eb > ea ? b : a;
    return num(b.rev) > num(a.rev) ? b : a;
  }

  // 大人の確認：2けた×1けた（一の位で繰り上がる・答えは必ず3けた 144〜882）
  function gateQuestion(seed) {
    let n;
    try { n = Number(seed); } catch (e) { n = 0; }
    let s = Math.abs(Math.floor(n)) || 0;
    if (!Number.isFinite(s)) s = 0;
    let a = 24 + (s % 75);
    if (a % 10 < 2) a += 2;
    const b = 6 + (Math.floor(s / 75) % 4);
    return { a, b, answer: a * b };
  }
  function gateCheck(q, digits) {
    if (!isObj(q) || !Number.isInteger(q.answer) || q.answer !== q.a * q.b) return false;
    let str;
    if (Array.isArray(digits)) {
      if (!digits.every(d => (typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 9) || (typeof d === "string" && /^[0-9]$/.test(d)))) return false;
      str = digits.join("");
    } else if (typeof digits === "string") str = digits;
    else return false;
    return /^[0-9]{1,6}$/.test(str) && str === String(q.answer);
  }

  function textFill(key, vars) {
    if (typeof key !== "string" || !Object.prototype.hasOwnProperty.call(TEXT, key)) return "";
    const v = isObj(vars) ? vars : {};
    return TEXT[key].replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(v, k) && v[k] != null ? String(v[k]) : m));
  }

  return {
    VERSION, TZ_OFFSET_MIN, DAY_START_HOUR, DAY_MS, FUTURE_LIMIT_DAYS, LOGIN_TRACK, FIRST_GIFT, AD_AMOUNT, AD_CARD, AD_BIG,
    KOBAN_MAX, EARNED_MAX, LOG_MAX, SEAL_PRICE, KINDS, EQUIP_SLOTS, CARD_COLOR, GATE_LOCK_MS, KIND_LABEL,
    TEXT, HOWTO, HOWTO_AD,
    buildCatalog, empty, normalize, clock, status, claim, adGate, recordAdView, declineAd, exchange, equip, newer,
    gateQuestion, gateCheck, textFill, dayIndex, nextBoundaryMs, dayLabel, dayLabelJa,
  };
})();
if (typeof module !== "undefined") module.exports = Bonus;
