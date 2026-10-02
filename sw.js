/* 記帳小屋 PWA service worker（PWA 輪）：app 殼快取優先、背景更新。
   版本號進 cache 名——改版時 bump 讓舊快取汰換。 */
var CACHE = "ledger-house-v14";
var ASSETS = ["./app.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  /* 逐檔快取：addAll 任一 404 會整組失敗＝離線靜默失效（覆核輪）——單檔失敗不拖全組 */
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ASSETS.map(function (a) {
        return c.add(a).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var isNav = e.request.mode === "navigate" || /app\.html$/.test(new URL(e.request.url).pathname);
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      /* 回寫僅限同源正常回應（type basic）＝快取投毒面收斂 */
      var refresh = fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
      if (isNav) {
        /* 導航（app 殼）＝網路優先：連網開啟永遠拿最新版（根治「改版要多開兩次」）；離線退快取 */
        return refresh.catch(function () {
          return hit || caches.match("./app.html").then(function (shell) {
            return shell || Response.error();
          });
        });
      }
      /* 靜態資產＝快取優先＋背景刷新 */
      if (hit) {
        refresh.catch(function () {});
        return hit;
      }
      return refresh.catch(function () {
        return caches.match("./app.html").then(function (shell) {
          return shell || Response.error();
        });
      });
    })
  );
});

/* 推播（Phase C4）：後端送空訊號推播（只 VAPID 授權、無 payload），故 event.data 為 null。
   SW 沒有 localStorage 拿不到 token，不在此拉具體帳目資料——改顯示一則通用通知，
   使用者點開由 app 自己輪詢（pollSharedOnce）拉最新。iOS 要求每個 push 都必須顯示通知。 */
self.addEventListener("push", function (e) {
  e.waitUntil(
    self.registration.showNotification("記帳小屋", {
      body: "共同帳目有新動靜，點開看看",
      tag: "ledger-shared",
      icon: "./icon-192.png"
    })
  );
});

/* 通知點擊：關閉通知、聚焦既有 app 視窗（有的話）否則開新視窗；
   app 開啟後 pollSharedOnce 自會拉最新，故此處不需帶任何資料。 */
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (/app\.html/.test(c.url) && "focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./app.html");
    })
  );
});
