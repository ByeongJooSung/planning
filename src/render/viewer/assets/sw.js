/* Planning Studio 서비스 워커 — 설치형 앱(PWA)
 * - 화면(HTML·아이콘)은 네트워크 우선, 끊기면 저장해 둔 것으로 연다
 * - /api/ 요청은 저장하지 않는다 (로그인·프로젝트 데이터는 항상 서버에서)
 */
var CACHE = "planning-shell-v1";
var SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  // 화면 이동: 어느 경로든 같은 앱 화면을 쓴다
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) caches.open(CACHE).then(function (c) { c.put("/", res.clone()); });
      return res;
    }).catch(function () { return caches.match("/"); }));
    return;
  }
  if (url.pathname.indexOf("/icons/") === 0 || url.pathname === "/manifest.webmanifest") {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
  }
});
