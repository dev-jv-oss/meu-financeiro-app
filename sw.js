/* Meu Financeiro 1.4 — same origin, versioned cache, offline-safe navigation. */
const CACHE='meu-financeiro-pwa-v1.5.0';
const ROOT=new URL('./',self.location.href);
const CORE=['./','./index.html','./styles.css','./app.js','./parser.mjs','./operacoes.mjs','./catalogo.mjs','./rendimentos.mjs','./manifest.webmanifest','./icons/logo-mark.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(async keys=>{for(const k of keys)if(k.startsWith('meu-financeiro-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(ROOT.pathname))return;
 // Navigation uses network first, with offline fallback only for documents.
 if(r.mode==='navigate'){
  e.respondWith(fetch(r).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',clone)).catch(()=>{});}return response;}).catch(()=>caches.match('./index.html')));return;
 }
 e.respondWith(fetch(r).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(r,clone)).catch(()=>{});}return response;}).catch(()=>caches.match(r)));
});
