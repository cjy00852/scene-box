const CACHE="scene-box-v32";
const APP=["./google-config.js","./scene-data.js","./scene-categories.js?v=28","./drive-rules.js","./drive-sync.js","./","./index.html","./manifest.webmanifest","./icon-photo-192.png","./icon-photo-512.png","./icon-photo-maskable-512.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP.map(url=>new Request(url,{cache:"reload"})))).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET"||new URL(e.request.url).origin!==self.location.origin)return;
 if(new URL(e.request.url).pathname.endsWith('.js')){
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return resp}).catch(()=>caches.match(e.request)));
  return;
 }
 if(e.request.mode==="navigate"){
  e.respondWith(fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put("./index.html",copy));return resp}).catch(()=>caches.match("./index.html")));
  return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp})));
});
