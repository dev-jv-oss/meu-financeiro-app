import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const source=process.env.WORKER_SOURCE || '../backend/worker.js';
const {default:worker}=await import(new URL(source,import.meta.url));
const sub='123456789123456789123', uid='google:'+sub;
let keys,jwk;
before(async()=>{
 keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'local-test',alg:'RS256'};
 globalThis.fetch=async(url)=>{assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[jwk]});};
});
async function token(overrides={}){
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const h=enc({alg:'RS256',kid:'local-test'}),p=enc({iss:'https://accounts.google.com',aud:'local-client',sub,email:'test@example.invalid',email_verified:true,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...overrides});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p));
 return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
}
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync(new URL('../database/schema-v1.sql',import.meta.url),'utf8'));
 const adapter={failAfter:null,prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this},async first(){return db.prepare(sql).get(...this.args)||null},async all(){return {results:db.prepare(sql).all(...this.args)}}}},async batch(statements){db.exec('BEGIN');try{for(const [i,s] of statements.entries()){if(i===this.failAfter)throw Error('injected failure');db.prepare(s.sql).run(...s.args)}db.exec('COMMIT');return []}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB:adapter,GOOGLE_CLIENT_ID:'local-client',GOOGLE_ALLOWED_EMAIL:'test@example.invalid',ALLOWED_ORIGIN:'http://localhost:8080',ENABLE_FINANCIAL_WRITES:'false',ENABLE_ACCOUNT_SETUP:'false',ENABLE_HML_TESTS:'false'};
 const call=async(path,body,claims={},headers={})=>{const r=await worker.fetch(new Request('http://local'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+await token(claims),'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);return {...await r.json(),status:r.status}};
 const seed=()=>{db.prepare('INSERT INTO users(id,google_sub) VALUES(?,?)').run(uid,sub);for(const [id,kind]of [['bank-a','bank'],['bank-b','bank'],['sys:'+sub+':offset','system'],['pocket-a','pocket']])db.prepare('INSERT INTO accounts(id,user_id,name,kind) VALUES(?,?,?,?)').run(id,uid,id,kind)};
 return {db,adapter,env,call,seed};
}
const expense=(key='operation-0001')=>({clientOperationId:key,kind:'expense',description:'Despesa fictícia',effectiveDate:'2026-01-01',amountCents:3500,fromAccountId:'bank-a'});
test('defaults block financial, account and HML writes',async()=>{const {seed,call}=setup();seed();for(const [path,body]of [['/api/transactions',expense()],['/api/accounts',{clientOperationId:'account-0001',kind:'bank',name:'TESTE HML - Conta ficticia'}],['/api/hml/transaction',expense()]])assert.equal((await call(path,body)).status,403)});
test('real RS256 validation rejects audience, issuer, expiry, email, verification, sub and signature',async()=>{
 const {seed,call,env}=setup();seed();assert.equal((await call('/api/me')).status,200);
 for(const c of [{aud:'wrong'},{iss:'wrong'},{exp:0},{email:'other@example.invalid'},{email_verified:false},{sub:'bad'},{iat:Date.now()},{azp:'wrong'}])assert.equal((await call('/api/me',undefined,c)).status,403);
 const r=await worker.fetch(new Request('http://local/api/me',{headers:{authorization:'Bearer '+(await token()).slice(0,-20)+'aaaaaaaaaaaaaaaaaaaa'}}),env);assert.equal(r.status,401);
 const no=await worker.fetch(new Request('http://local/api/me'),env);assert.equal(no.status,401);
});
test('atomic balanced expense, replay, hash conflict, concurrent retry and response recovery',async()=>{
 const {seed,call,env,db}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';
 const pair=await Promise.all([call('/api/transactions',expense()),call('/api/transactions',expense())]);
 assert.deepEqual(pair.map(x=>x.status).sort(),[200,201]);assert.equal(pair[0].transactionId,pair[1].transactionId);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions').get().n,1);
 assert.equal(db.prepare('SELECT SUM(delta_cents) n FROM ledger_postings').get().n,0);
 assert.equal(db.prepare('SELECT integrity FROM v_ledger_integrity').get().integrity,'ok');
 assert.equal((await call('/api/transactions',{...expense(),amountCents:3501})).status,409);
 env.ENABLE_FINANCIAL_WRITES='false';const result=await call('/api/operation-result',{clientOperationId:expense().clientOperationId});assert.equal(result.status,200);assert.equal(result.result.transactionId,pair[0].transactionId);
});
test('injected mid-batch failure rolls back idempotency, transaction, postings and audit; retry keeps key',async()=>{
 const {seed,call,env,db,adapter}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';adapter.failAfter=3;
 assert.equal((await call('/api/transactions',expense())).status,503);
 for(const table of ['transactions','ledger_postings','idempotency_keys','audit_events'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 adapter.failAfter=null;assert.equal((await call('/api/transactions',expense())).status,201);
});
test('account ownership prevents writes and reads across users',async()=>{
 const {seed,call,env,db}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';
 db.prepare('INSERT INTO users(id,google_sub) VALUES(?,?)').run('google:987654321','987654321');
 db.prepare("INSERT INTO accounts(id,user_id,name,kind) VALUES('foreign','google:987654321','Foreign','bank')").run();
 assert.equal((await call('/api/transactions',{...expense(),fromAccountId:'foreign'})).status,400);
 assert.ok(!(await call('/api/accounts')).accounts.some(a=>a.id==='foreign'));
 assert.equal((await call('/api/transactions',expense())).status,201);
 assert.equal((await call('/api/transactions',undefined,{sub:'987654321'})).transactions.length,0);
});
test('invalid cent amounts, impossible dates and same-account transfer rejected',async()=>{
 const {seed,call,env}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';
 for(const amountCents of [0,-1,1.5,'100',Number.MAX_SAFE_INTEGER])assert.equal((await call('/api/transactions',{...expense(),amountCents})).status,400);
 for(const effectiveDate of ['2026-02-30','2099-01-01'])assert.equal((await call('/api/transactions',{...expense(),effectiveDate})).status,400);
 assert.equal((await call('/api/transactions',{...expense(),kind:'transfer',toAccountId:'bank-a'})).status,400);
});
test('future investment maturity is valid; fixed tax above 100 is rejected',async()=>{
 const {seed,call,env}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';
 const b={clientOperationId:'investment-0001',name:'CDB fictício',productType:'CDB',yieldMode:'none',appliedOn:'2026-01-01',amountCents:1000,fromAccountId:'bank-a',liquidity:'maturity',maturityDate:'2030-01-01',irMode:'fixed',fixedIrRate:'100.1'};
 assert.equal((await call('/api/investments',b)).status,400);
 assert.equal((await call('/api/investments',{...b,fixedIrRate:'15'})).status,201);
});
test('pocket mutations blocked until ledger and lot accounting share one transaction',async()=>{const {seed,call,env,db}=setup();seed();env.ENABLE_FINANCIAL_WRITES='true';assert.equal((await call('/api/transactions',{...expense(),kind:'pocket_deposit',toAccountId:'pocket-a'})).status,400);assert.equal(db.prepare('SELECT COUNT(*) n FROM transactions').get().n,0)});
test('disallowed Origin is rejected before a bootstrap mutation',async()=>{const {call,db}=setup();assert.equal((await call('/api/bootstrap',{}, {},{Origin:'https://untrusted.invalid'})).status,403);assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,0)});
test('HML scenario yields 4 transactions and balances 3500/2000/1000 with replay',async()=>{
 const {seed,call,env,db}=setup();seed();env.ENABLE_HML_TESTS='true';
 db.prepare('UPDATE accounts SET name=? WHERE id=?').run('TESTE HML - Conta ficticia','bank-a');
 const aux=await call('/api/hml/account',{clientOperationId:'hml-aux-0001',kind:'bank',name:'TESTE HML - Conta auxiliar'});assert.equal(aux.status,201);
 for(const [kind,description,amountCents]of [['income','TESTE HML - Receita',10000],['expense','TESTE HML - Despesa',3500],['transfer','TESTE HML - Transferência',2000]]){
  const b={clientOperationId:'hml-key-'+kind,kind,description,amountCents,effectiveDate:'2026-01-01',...(kind!=='income'?{fromAccountId:'bank-a'}:{}),...(kind!=='expense'?{toAccountId:kind==='income'?'bank-a':aux.accountId}:{})};
  assert.equal((await call('/api/hml/transaction',b)).status,201);assert.equal((await call('/api/hml/transaction',b)).replayed,true);
 }
 assert.equal((await call('/api/hml/investment',{clientOperationId:'hml-inv-0001',productType:'CDB',name:'TESTE HML - CDB 120% CDI',yieldMode:'cdi_pct',contractedRate:'120',appliedOn:'2026-01-01',amountCents:1000,fromAccountId:'bank-a',liquidity:'grace',graceDays:90,settlementBusinessDays:1,irMode:'regressive',iofApplies:true,institution:'Banco fictício HML'})).status,201);
 const r=await call('/api/hml/summary');assert.equal(r.transactions.length,4);assert.deepEqual(r.balances.map(x=>x.balanceCents).sort((a,b)=>a-b),[2000,3500]);assert.equal(r.investments[0].principalCents,1000);assert.equal(r.invalidTransactions,0);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('verified profile exposes stable owner and balances keep ledger separate from confirmations',async()=>{
 const {seed,call,env,db}=setup();seed();assert.equal((await call('/api/me')).userId,uid);env.ENABLE_FINANCIAL_WRITES='true';await call('/api/transactions',expense());env.ENABLE_FINANCIAL_WRITES='false';
 const insert=db.prepare('INSERT INTO balance_snapshots(id,user_id,account_id,as_of_utc,balance_cents,source) VALUES(?,?,?,?,?,?)');
 insert.run('older',uid,'bank-a','2025-12-01T00:00:00Z',10000,'manual');insert.run('latest',uid,'bank-a','2026-01-01T00:00:00Z',20000,'bank');insert.run('conflicting',uid,'bank-a','2026-01-01T00:00:00Z',21000,'manual');
 const r=await call('/api/balances');assert.equal(r.status,200);const a=r.accounts.find(a=>a.id==='bank-a');assert.equal(a.ledgerDeltaCents,-3500);assert.equal(a.reconciledBalanceCents,null);assert.equal(a.reconciliationStatus,'required');assert.equal(a.confirmedSnapshots.length,2);assert.ok(!a.confirmedSnapshots.some(s=>s.id==='older'));
 const empty=r.accounts.find(a=>a.id==='bank-b');assert.equal(empty.ledgerDeltaCents,0);assert.equal(empty.reconciliationStatus,'no_snapshot');assert.ok(!r.accounts.some(a=>a.kind==='system'));
 db.prepare('INSERT INTO users(id,google_sub) VALUES(?,?)').run('google:987654321','987654321');assert.deepEqual((await call('/api/balances',undefined,{sub:'987654321'})).accounts,[]);
});
