const CACHE="tph-team-v32";
const ASSETS=["./","./index.html","./style.css","./app.js?v=32","./manifest.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
  ))
));
self.addEventListener("fetch",e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
