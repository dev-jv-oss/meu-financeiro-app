import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync,existsSync} from 'node:fs';
function harness({failCore=false}={}){
 const handlers={},entries=new Map();let fetched=0,claimed=0;
 const root='https://example.invalid/meu-financeiro-app/';
 const key=x=>new URL(typeof x==='string'?x:x.url,root).href;
 const cache={async addAll(paths){if(failCore)throw Error('download failed');for(const p of paths){assert.ok(existsSync(new URL('../'+(p==='./'?'index.html':p.slice(2).split('?')[0]),import.meta.url)));entries.set(key(p),new Response(p))}},async add(p){entries.set(key(p),new Response(p))},async match(r){return entries.get(key(r))?.clone()}};
 vm.runInNewContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),{URL,Response,caches:{open:async()=>cache},fetch:async()=>{fetched++;throw Error('offline')},self:{location:{href:root+'sw.js',origin:'https://example.invalid'},clients:{claim:async()=>claimed++},addEventListener:(type,fn)=>handlers[type]=fn}});
 return {entries,async install(){let p;handlers.install({waitUntil:x=>p=x});await p},async request(url,options={}){let p;handlers.fetch({request:{url:root+url,method:'GET',mode:'cors',...options},respondWith:x=>p=x});return p?await p:null},get fetched(){return fetched}};
}
test('complete versioned module graph cached; navigations and modules work offline without network',async()=>{const h=harness();await h.install();assert.equal(await (await h.request('anything',{mode:'navigate'})).text(),'./index.html');assert.equal((await h.request('storage.mjs?v=1.9.1-audit')).status,200);assert.equal(h.fetched,0)});
test('missing core prevents installation',async()=>{await assert.rejects(harness({failCore:true}).install(),/download failed/)});
test('unknown module version fails closed instead of mixing app releases',async()=>{const h=harness();await h.install();assert.equal((await h.request('app.js?v=other')).status,503);assert.equal(h.fetched,0)});
test('POST requests bypass cache handler',async()=>{const h=harness();assert.equal(await h.request('api/transactions',{method:'POST'}),null)});
