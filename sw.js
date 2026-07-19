const CACHE="tph-team-v2";
const ASSETS=["./","./index.html","./style.css","./app.js?v=31","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
