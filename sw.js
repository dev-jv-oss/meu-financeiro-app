const CACHE='meu-financeiro-pwa-v1.0.0';
const CORE=['./','./index.html','./styles.css','./app.js','./parser.mjs','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(async keys=>{for(const key of keys)if(key!==CACHE)await caches.delete(key);await self.clients.claim()})));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const rc=r.clone();caches.open(CACHE).then(c=>c.put(e.request,rc)).catch(()=>{});}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
