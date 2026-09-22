// Service Worker: オフラインでも遊べるようにキャッシュする
// 更新時は CACHE のバージョンと index.html の ?v=N を両方上げる
const CACHE = "ninsai-kakurenbo-v2";
const PAINTED = ["kohaku", "sakuya", "jin"];
const VIEWS = ["quarter", "side", "back", "happy", "surprised"];
const ALL = ["jin","sakuya","kohaku","shiba","kanaoni","oto","rotten","nagisa","anne","dan","hinanojoh","torika","atoza","hayate","uka","ganzi","yui","fuuta","rei","sattva","nekomata","janome","benten","karma","ichiya","nemu","karura","xiaolan","aum","konga","shion","seori","quon","magoichi","ibuki","oen","izuna","sekishusai","sasagane"];
const CORE = [
  "./", "./index.html", "./style.css?v=2", "./chars.js?v=2", "./data.js?v=2", "./sim.js?v=2", "./render.js?v=2", "./game.js?v=2",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "./img/chars/kohaku_neutral.png", "./img/chars/kohaku_focus.png", "./img/chars/kohaku_walk.png", "./img/chars/sakuya_crouch.png", "./img/chars/jin_crouch.png",
  "./img/sheets/kohaku_sheet.jpg", "./img/sheets/sakuya_jin_sheet.jpg",
];
for (const c of ALL) { CORE.push(`./img/faces/${c}.png`); CORE.push(`./img/chars/${c}_front.png`); }
for (const c of PAINTED) for (const v of VIEWS) CORE.push(`./img/chars/${c}_${v}.png`);

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached ||
      fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
        .catch(() => caches.match("./index.html"))
    )
  );
});
