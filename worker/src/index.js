// 忍彩かくれんぼ — 合言葉の部屋サーバー（Cloudflare Workers + Durable Objects・無料枠）
// 役割：合言葉の発行と、部屋（Durable Object）へのWebSocket中継だけ。判定は部屋の中で sim.js が行う。
import { Room } from "./room.js";
export { Room };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 見間違えやすい I O 0 1 を除く
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });

function genCode(n = 4) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, name: "ninsai-room", version: "1.0", rules: "1.0" });

    // 部屋を作る：空いている合言葉を発行する
    if (url.pathname === "/rooms" && req.method === "POST") {
      for (let i = 0; i < 8; i++) {
        const code = genCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const r = await stub.fetch("https://room/state");
        const st = await r.json();
        if (!st.lobby || st.lobby.players.length === 0) {
          await stub.fetch("https://room/reset?code=" + code, { method: "POST" });
          return json({ code });
        }
      }
      return json({ error: "部屋がいっぱいです。少し待ってからもう一度" }, 503);
    }

    // 部屋の状態（参加前の確認用）
    let m = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,6})$/);
    if (m && req.method === "GET") {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      const r = await stub.fetch("https://room/state");
      return json(await r.json());
    }

    // 部屋へWebSocketで入る
    m = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,6})\/ws$/);
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") return json({ error: "WebSocket が必要です" }, 426);
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(new Request("https://room/ws?code=" + m[1], req));
    }
    return json({ error: "not found" }, 404);
  },
};
