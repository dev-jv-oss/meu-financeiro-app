import {test} from 'node:test';import assert from 'node:assert/strict';
test('application imports and renders main routes with legacy local data (DOM stub, not browser)',async()=>{
 const listeners=new Map(),elements=new Map();
 const element=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},querySelector(){return null},querySelectorAll(){return []}});
 for(const id of ['#main','#toast','#net-status'])elements.set(id,element());
 globalThis.document={querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],body:{addEventListener:(type,f)=>{const a=listeners.get(type)||[];a.push(f);listeners.set(type,a)}}};
 globalThis.window={addEventListener(){},scrollTo(){}};globalThis.location={protocol:'file:'};
 const raw=JSON.stringify({drafts:[{id:'legacy',kind:'despesa',amount:10,date:'2026-01-01',description:'<img src=x onerror=alert(1)>',syncStatus:'LOCAL'}],snapshot:{mp:15}});
 const data=new Map([['meu-financeiro-pwa-local-v1',raw]]);globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 await import('../app.js');assert.match(elements.get('#main').innerHTML,/Registros locais/);
 for(const route of ['patrimonio','consultar','rascunhos']){for(const f of listeners.get('click'))f({target:{closest:()=>({dataset:{route}})}});assert.ok(elements.get('#main').innerHTML.length>100)}
 assert.ok(elements.get('#main').innerHTML.includes('&lt;img'));assert.ok(!elements.get('#main').innerHTML.includes('<img src=x'));
 assert.equal(data.get('meu-financeiro-pwa-local-v1'),raw);
});
