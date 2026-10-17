import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
globalThis.indexedDB=new IDBFactory();
const {mountQueue}=await import('../queue-ui.mjs');
const {Outbox}=await import('../outbox.mjs');
const owner='google:123456789',apiOrigin='https://test.invalid';
function target(){const els=new Map();return {isConnected:true,innerHTML:'',textContent:'',querySelector(id){if(!els.has(id))els.set(id,{});return els.get(id)}}}
test('queue UI prepares durable snapshot using only GET account lookup and preserves source',async()=>{
 const el=target(),draft={id:'ui-1',syncEligibleVersion:1,operation:'despesa',amount:12.34,date:'2026-01-01',description:'Compra fictícia'},original=structuredClone(draft),messages=[],paths=[];
 await mountQueue(el,{profile:()=>({userId:owner}),apiOrigin,drafts:()=>[draft],notify:x=>messages.push(x),apiRequest:async path=>{paths.push(path);return {accounts:[{id:'bank-a',kind:'bank',status:'active',name:'Conta fictícia'}]}}});
 assert.deepEqual(paths,[]);await el.querySelector('#queue-accounts').onclick();
 const NativeFormData=globalThis.FormData;globalThis.FormData=class {constructor(){return new Map([['sourceId','ui-1'],['fromAccountId','bank-a']])}};
 try{await el.querySelector('#queue-prepare').onsubmit({preventDefault(){},currentTarget:{}})}finally{globalThis.FormData=NativeFormData}
 assert.deepEqual(paths,['/api/accounts']);assert.deepEqual(draft,original);const row=(await new Outbox().list(owner))[0];assert.equal(row.status,'pending');assert.deepEqual(row.sourceSnapshot,original);assert.match(messages[0],/Nenhuma movimentação foi enviada/);
});
test('queue UI rejects unverified owner without network or data mutation',async()=>{const el=target();await mountQueue(el,{profile:()=>null,apiOrigin,drafts:()=>[],notify:()=>{},apiRequest:()=>assert.fail('network')});assert.match(el.textContent,/identidade do titular/)});
