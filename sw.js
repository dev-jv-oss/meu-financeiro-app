/* Meu Financeiro 1.5.1 — precache completo e solicitações com versões consistentes. */
const CACHE='meu-financeiro-pwa-v1.5.1';
const ROOT=new URL('./',self.location.href);
const CORE=[
 './','./index.html','./styles.css?v=1.5.1','./bootstrap.js?v=1.5.1','./app.js?v=1.5.1',
 './parser.mjs?v=1.5.1','./operacoes.mjs?v=1.5.1','./catalogo.mjs?v=1.5.1','./rendimentos.mjs?v=1.5.1',
 './manifest.webmanifest'
];
const OPTIONAL=['./icons/logo-mark.svg','./icons/icon-192.png','./icons/icon-512.png',
 './icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(CORE); // O app precisa de todos os módulos.
 await Promise.all(OPTIONAL.map(path=>cache.add(path).catch(()=>{}))); // Ícone ausente não bloqueia a atualização.
 await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(async keys=>{for(const k of keys)if(k.startsWith('meu-financeiro-pwa-')&&k!==CACHE)await caches.delete(k);await self.clients.claim()})));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(ROOT.pathname))return;
 if(r.mode==='navigate'){
  e.respondWith(fetch(r).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',clone)).catch(()=>{});}return response;}).catch(()=>caches.match('./index.html')));return;
 }
 e.respondWith(fetch(r).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(r,clone)).catch(()=>{});}return response;}).catch(()=>caches.match(r)));
});
