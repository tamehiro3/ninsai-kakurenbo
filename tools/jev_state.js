// Jev（判定AI）に渡す「状態」テキストを組み立てる：画面の文言・遊び方・利用表示・39体のデータ・台詞
//   node ninsai-kakurenbo/tools/jev_state.js > <出力.md>
// 実行は tools/jev.py ask --state-file <出力.md> --questions-file ninsai-kakurenbo/tools/jev_game_check.json
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
global.CHARS_ALL = require(path.join(ROOT, "chars.js"));
const D = require(path.join(ROOT, "data.js"));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const strip = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const section = (id) => { const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`)); return m ? strip(m[0]) : ""; };
const links = [...new Set((html.match(/https?:\/\/[^\s"'<>)]+/g) || []))];

const out = [];
out.push("# 忍彩かくれんぼ — 城旗争奪（スマホゲーム）の画面文言とデータ");
out.push("\n## タイトル画面\n" + section("screen-title"));
out.push("\n## 遊び方\n" + D.HOWTO.map(h => `${h.h}：${h.p}`).join("\n"));
out.push("\n## 操作\n" + D.CONTROLS.map(r => r.join(" / ")).join("\n"));
out.push("\n## 対戦の準備・練習の文言\n" + section("screen-lobby") + "\n" + D.TUTORIAL.map(t => `${t.title} ${t.text}（${t.hint}）`).join("\n"));
out.push("\n## 利用表示\n" + section("screen-credits"));
out.push("\n## 外部リンク一覧\n" + (links.length ? links.join("\n") : "なし"));
out.push("\n## 設定項目\n" + strip((html.match(/<div id="settings-panel"[\s\S]*?<\/div>\s*<\/div>/) || [""])[0]));
out.push("\n## キャラクター一覧（39体・公式名簿由来）");
for (const c of D.CHARS) out.push(`#${c.num} ${c.name} / ${c.en} ／ クラン:${c.clan} ／ 忍術:${c.jutsu} ／ 武器:${c.weapon} ／ 誕生日:${c.birthday} ／ 紹介:${c.bio || "（公式資料に紹介文なし）"}`);
out.push("\n## 試合後の台詞（優勝/敗北/同着）");
const seen = new Set();
for (const c of D.CHARS) { const key = JSON.stringify(c.lines); if (seen.has(key)) continue; seen.add(key); const shared = D.CHARS.filter(x => JSON.stringify(x.lines) === key).length; out.push(`${shared > 1 ? `共通（${shared}体）` : c.name}: 優勝「${c.lines.win.join("」「")}」 敗北「${c.lines.lose.join("」「")}」 同着「${c.lines.tie.join("」「")}」`); }
out.push("\n## 合図（自由チャットは無い）\n" + D.PINGS.map(p => p.text).join(" / "));
process.stdout.write(out.join("\n") + "\n");
