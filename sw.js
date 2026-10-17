/* Atomic app shell: no activation over an open older client, no mixed network modules. */
const CACHE='meu-financeiro-pwa-v1.9.1-audit';
const ROOT=new URL('./',self.location.href);
const CORE=['./','./index.html','./styles.css?v=1.9.1-audit','./bootstrap.js?v=1.9.1-audit','./app.js?v=1.9.1-audit',
 './parser.mjs?v=1.9.1-audit','./operacoes.mjs?v=1.9.1-audit','./catalogo.mjs?v=1.9.1-audit','./rendimentos.mjs?v=1.9.1-audit',
 './api.mjs?v=1.9.1-audit','./app-config.js?v=1.9.1-audit','./storage.mjs?v=1.9.1-audit','./manifest.webmanifest'];
const OPTIONAL=['./icons/logo-mark.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-192.png','./icons/icon-maskable-512.png','./icons/icon-180.png'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(CORE);
 await Promise.all(OPTIONAL.map(path=>cache.add(path).catch(()=>{})));
 // Browser activates only after the previous controlled clients close.
})()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==ROOT.origin||!u.pathname.startsWith(ROOT.pathname))return;
 e.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=r.mode==='navigate'?new URL('index.html',ROOT).href:r;
  const hit=await cache.match(key);if(hit)return hit;
  // Unknown modules must not be fetched from another deployment version.
  if(/\.(?:m?js|css)$/.test(u.pathname))return new Response('Versão indisponível; feche e reabra o aplicativo.',{status:503});
  try{return await fetch(r)}catch{return new Response('Conteúdo indisponível offline.',{status:503})}
 })());
});
