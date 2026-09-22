// 忍彩かくれんぼ — オンライン対戦の通信（WebSocket）。入力は「方向と行動」だけを送り、状態は部屋サーバーから受け取る
const Net = (() => {
  const D = DATA;
  let ws = null, seq = 0, token = null, you = null, code = null, joinMsg = null, closedByUser = false, reconnectTimer = null, reconnectUntil = 0;
  const handlers = {};
  const emit = (t, m) => { (handlers[t] || []).forEach(fn => { try { fn(m); } catch (e) { console.error(e); } }); };

  function base() {
    let u = "";
    try { u = localStorage.getItem("ninsaiServerUrl") || ""; } catch (e) { }
    return (u || D.ONLINE.url).replace(/\/+$/, "");
  }
  function wsBase() { return base().replace(/^http/, "ws"); }

  async function createRoom() {
    const r = await fetch(base() + "/rooms", { method: "POST" });
    if (!r.ok) { let e = "部屋を作れませんでした"; try { e = (await r.json()).error || e; } catch (x) { } throw new Error(e); }
    return (await r.json()).code;
  }
  async function roomState(c) {
    const r = await fetch(base() + "/rooms/" + c);
    if (!r.ok) throw new Error("部屋が見つかりません");
    return r.json();
  }

  function connect(c, join) {
    code = c; joinMsg = join; closedByUser = false;
    return new Promise((resolve, reject) => {
      let settled = false;
      try { ws = new WebSocket(wsBase() + "/rooms/" + c + "/ws"); } catch (e) { return reject(new Error("接続できません")); }
      ws.onopen = () => { send({ t: "join", token, ...joinMsg }); };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === "joined") { you = m.you; token = m.you.token; if (!settled) { settled = true; resolve(m); } }
        if (m.t === "error" && !settled) { settled = true; reject(new Error(m.error)); }
        emit(m.t, m);
      };
      ws.onerror = () => { if (!settled) { settled = true; reject(new Error("サーバーに接続できません（URLとネット接続を確認）")); } };
      ws.onclose = () => { emit("close", {}); if (!closedByUser && token && Date.now() < reconnectUntil) reconnectTimer = setTimeout(() => connect(code, joinMsg).catch(() => { }), 2000); };
      setTimeout(() => { if (!settled) { settled = true; reject(new Error("応答がありません")); try { ws.close(); } catch (x) { } } }, 8000);
    });
  }
  function allowReconnect(sec) { reconnectUntil = Date.now() + sec * 1000; }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function input(x, y, angle, actions) { send({ t: "input", seq: ++seq, x, y, angle, actions }); }
  function close() { closedByUser = true; clearTimeout(reconnectTimer); if (ws) { try { send({ t: "leave" }); ws.close(); } catch (e) { } } ws = null; token = null; you = null; code = null; }
  function on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); }
  function off(t) { delete handlers[t]; }
  function connected() { return !!ws && ws.readyState === 1; }
  return { base, createRoom, roomState, connect, allowReconnect, send, input, close, on, off, connected, get you() { return you; }, get code() { return code; } };
})();
