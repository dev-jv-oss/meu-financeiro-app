import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {Outbox} from '../outbox.mjs';
import {flushOutbox} from '../sync-engine.mjs';
import {prepareDraftPayload} from '../sync-payload.mjs';
const owner='google:123456789',other='google:987654321',apiOrigin='https://test.invalid';
const payload={kind:'expense',amountCents:1234,effectiveDate:'2026-01-01',description:'Teste fictício',fromAccountId:'bank-a'};
function fixture(){const indexedDB=new IDBFactory(),outbox=new Outbox({indexedDB});const enqueue=(extras={})=>outbox.enqueue({owner,apiOrigin,sourceId:'local-1',payload,sourceSnapshot:{preserved:true},...extras});const flush=(extras={})=>flushOutbox({outbox,owner,apiOrigin,enabled:true,serverWrites:true,currentOwner:()=>owner,now:()=>100000,...extras});return {indexedDB,outbox,enqueue,flush};}
test('committed envelope survives reopen and keeps key; source payload and owner cannot change',async()=>{
 const {indexedDB,outbox,enqueue}=fixture();const first=await enqueue();(await outbox.open()).close();
 const reopened=new Outbox({indexedDB});assert.equal((await reopened.list(owner))[0].operationId,first.operationId);
 assert.equal((await reopened.enqueue({owner,apiOrigin,sourceId:'local-1',payload})).operationId,first.operationId);
 await assert.rejects(reopened.enqueue({owner:other,apiOrigin,sourceId:'local-1',payload}),{code:'OWNER_CONFLICT'});
 await assert.rejects(reopened.enqueue({owner,apiOrigin,sourceId:'local-1',payload:{...payload,amountCents:1235}}),{code:'PAYLOAD_CONFLICT'});
 assert.deepEqual(await reopened.list(other),[]);assert.equal(await reopened.hasSource('local-1'),true);
});
test('parallel tabs obtain one lease; expired attempt cannot overwrite newer completion',async()=>{
 const {outbox,enqueue}=fixture();await enqueue();const claims=await Promise.all([outbox.claim('local-1',owner,apiOrigin,100),outbox.claim('local-1',owner,apiOrigin,100)]);assert.equal(claims.filter(Boolean).length,1);
 const old=claims.find(Boolean),next=await outbox.claim('local-1',owner,apiOrigin,60101);assert.equal(next.mustResolve,true);
 await outbox.settle(next,'completed',{result:{transactionId:'tx'}});await outbox.settle(old,'uncertain');assert.equal((await outbox.list(owner))[0].status,'completed');
});
test('both explicit write gates must be true; defaults perform no network',async()=>{
 const {outbox,enqueue,flush}=fixture();await enqueue();const request=()=>assert.fail('network');
 for(const gates of [{enabled:false},{serverWrites:false},{enabled:'true'}])assert.equal((await flush({...gates,request})).blocked,true);
 assert.equal((await flushOutbox({outbox,owner,apiOrigin,request})).blocked,true);assert.equal((await outbox.list(owner))[0].attempts,0);
});
test('lost response resolves original operation without a second financial POST',async()=>{
 const {outbox,enqueue,flush}=fixture();const row=await enqueue();let posts=0;
 await flush({request:async(path,{data})=>{assert.equal(path,'/api/transactions');assert.equal(data.clientOperationId,row.operationId);posts++;throw Error('response lost')}});
 assert.equal((await outbox.list(owner))[0].status,'uncertain');
 await flush({now:()=>200000,request:async(path,{data})=>{assert.equal(path,'/api/operation-result');assert.equal(data.clientOperationId,row.operationId);return {found:true,status:'completed',result:{ok:true,transactionId:'tx-1'}}}});
 assert.equal(posts,1);assert.equal((await outbox.list(owner))[0].status,'completed');
});
test('retry after authoritative not-found reuses exact frozen key and payload',async()=>{
 const {enqueue,flush}=fixture();const row=await enqueue();await flush({request:async()=>{throw Error('offline')}});const paths=[];
 await flush({now:()=>200000,request:async(path,{data})=>{paths.push(path);if(path==='/api/operation-result')return {found:false};assert.deepEqual(data,row.payload);return {ok:true,transactionId:'tx-2'}}});assert.deepEqual(paths,['/api/operation-result','/api/transactions']);
});
test('failed lookup never replays a financial POST',async()=>{
 const {outbox,enqueue,flush}=fixture();await enqueue();await flush({request:async()=>{throw Error('offline')}});
 await flush({now:()=>200000,request:async path=>{assert.equal(path,'/api/operation-result');throw Error('lookup offline')}});assert.equal((await outbox.list(owner))[0].status,'uncertain');
});
test('owner change during recovery blocks send, preserving original ownership',async()=>{
 const {outbox,enqueue,flush}=fixture();await enqueue();await flush({request:async()=>{throw Error('offline')}});let active=owner;
 await flush({now:()=>200000,currentOwner:()=>active,request:async path=>{assert.equal(path,'/api/operation-result');active=other;return {found:false}}});const row=(await outbox.list(owner))[0];assert.equal(row.status,'auth_required');assert.equal(row.ownerId,owner);assert.deepEqual(await outbox.list(other),[]);
});
test('environment mismatch sends nothing; conflict requires review and does not retry',async()=>{
 const {outbox,enqueue,flush}=fixture();await enqueue();await flush({apiOrigin:'https://other.invalid',request:()=>assert.fail('network')});
 await flush({request:async()=>{throw Object.assign(Error('conflict'),{status:409})}});assert.equal((await outbox.list(owner))[0].status,'review');await flush({request:()=>assert.fail('network')});
});
test('invalid acknowledgement is uncertain, never completed',async()=>{const {outbox,enqueue,flush}=fixture();await enqueue();await flush({request:async()=>({ok:true})});assert.equal((await outbox.list(owner))[0].status,'uncertain')});
test('storage write failure cannot report a durable prepared operation',async()=>{
 const {outbox,enqueue}=fixture();const db=await outbox.open();const original=db.transaction.bind(db);db.transaction=(...args)=>{if(args[1]==='readwrite')throw new DOMException('full','QuotaExceededError');return original(...args)};
 await assert.rejects(enqueue(),{name:'QuotaExceededError'});assert.deepEqual(await outbox.list(owner),[]);
});
test('draft conversion excludes legacy, cards, lot operations, unknown accounts and fractional cents',()=>{
 const draft={syncEligibleVersion:1,syncStatus:'LOCAL',operation:'despesa',amount:12.34,date:'2026-01-01',description:'Teste fictício'};const options={fromAccountId:'bank-a',accounts:[{id:'bank-a',kind:'bank',status:'active'}]};assert.equal(prepareDraftPayload(draft,options).amountCents,1234);
 for(const patch of [{syncEligibleVersion:undefined},{method:'Cartão de crédito'},{reviewRequired:true},{operation:'resgate'},{amount:1.001}])assert.throws(()=>prepareDraftPayload({...draft,...patch},options));assert.throws(()=>prepareDraftPayload(draft,{...options,accounts:[]}));
});
