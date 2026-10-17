/** Durable immutable envelopes. No network, no migration or deletion of legacy data. */
const DB_NAME='meu-financeiro-outbox-v1';
export class OutboxError extends Error { constructor(code,message){super(message);this.code=code;} }
export function ownerId(value){if(typeof value!=='string'||!/^google:\d{8,32}$/.test(value))throw new OutboxError('OWNER_REQUIRED','Entre com uma identidade validada pelo servidor.');return value;}
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function destination(value){const u=new URL(value);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Destino da API inválido.');if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('A API deve usar uma origem sem caminho.');return u.origin;}
export function normalizePayload(p){
 if(!p||!['expense','income','transfer'].includes(p.kind))throw Error('Esta operação exige tratamento específico antes de sincronizar.');
 if(!Number.isSafeInteger(p.amountCents)||p.amountCents<=0||p.amountCents>100_000_000_000)throw Error('Valor inválido em centavos.');
 if(typeof p.effectiveDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveDate)||Number.isNaN(Date.parse(p.effectiveDate))||new Date(p.effectiveDate).toISOString().slice(0,10)!==p.effectiveDate)throw Error('Data inválida.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Porto_Velho',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(p.effectiveDate>today)throw Error('A data efetiva não pode ser futura.');
 const description=String(p.description||'').trim();if(description.length<2||description.length>200)throw Error('Descrição deve ter entre 2 e 200 caracteres.');
 const note=p.note==null?null:String(p.note).trim();if(note!==null&&(!note||note.length>500))throw Error('Observação inválida.');
 const account=x=>{if(typeof x!=='string'||!x.trim()||x.length>150)throw Error('Selecione uma conta D1.');return x;};
 const fromAccountId=p.kind==='income'?null:account(p.fromAccountId),toAccountId=p.kind==='expense'?null:account(p.toAccountId);
 if(fromAccountId&&fromAccountId===toAccountId)throw Error('Origem e destino precisam ser diferentes.');
 return {kind:p.kind,description,effectiveDate:p.effectiveDate,amountCents:p.amountCents,fromAccountId,toAccountId,note};
}
export class Outbox {
 constructor({indexedDB=globalThis.indexedDB,name=DB_NAME}={}){this.factory=indexedDB;this.name=name;this.opening=null;}
 async open(){
  if(!this.factory)throw Error('Este navegador não disponibilizou o armazenamento da fila. Nenhum dado antigo foi alterado.');
  if(!this.opening)this.opening=new Promise((resolve,reject)=>{
   let blocked=false;const r=this.factory.open(this.name,1);
   r.onupgradeneeded=()=>{const s=r.result.createObjectStore('operations',{keyPath:'sourceId'});s.createIndex('ownerId','ownerId');s.createIndex('operationId','operationId',{unique:true});};
   r.onsuccess=()=>{const db=r.result;if(blocked){db.close();return;}db.onversionchange=()=>{db.close();this.opening=null;};resolve(db)};
   r.onerror=()=>{this.opening=null;reject(r.error)};
   r.onblocked=()=>{blocked=true;this.opening=null;reject(Error('Feche outras abas para abrir a fila com segurança.'));};
  });return this.opening;
 }
 async change(sourceId,fn){
  const db=await this.open();return new Promise((resolve,reject)=>{
   let result,error;const tx=db.transaction('operations','readwrite',{durability:'strict'}),store=tx.objectStore('operations'),r=store.get(sourceId);
   r.onsuccess=()=>{try{const next=fn(r.result?structuredClone(r.result):null);result=next;if(next)store.put(next);}catch(e){error=e;tx.abort()}};
   tx.oncomplete=()=>resolve(structuredClone(result));tx.onabort=()=>reject(error||tx.error||Error('A gravação da fila foi cancelada.'));tx.onerror=()=>{};
  });
 }
 async enqueue({owner,apiOrigin,sourceId,payload,sourceSnapshot}){
  owner=ownerId(owner);apiOrigin=destination(apiOrigin);payload=normalizePayload(payload);
  if(typeof sourceId!=='string'||sourceId.length<1||sourceId.length>150)throw Error('Identificador de origem inválido.');
  const operationId=crypto.randomUUID(),body=canonical(payload),now=new Date().toISOString();
  return this.change(sourceId,old=>{
   if(old){if(old.ownerId!==owner||old.apiOrigin!==apiOrigin)throw new OutboxError('OWNER_CONFLICT','Registro já vinculado a outro titular ou ambiente.');if(old.canonicalPayload!==body)throw new OutboxError('PAYLOAD_CONFLICT','A operação preparada é imutável. Faça uma retificação após conciliar.');return old;}
   return {version:1,sourceId,operationId,ownerId:owner,apiOrigin,payload:{...payload,clientOperationId:operationId},canonicalPayload:body,sourceSnapshot:structuredClone(sourceSnapshot??null),status:'pending',attempts:0,createdAt:now,updatedAt:now,retryAt:0,leaseUntil:0,claimToken:null,result:null,errorCode:null};
  });
 }
 async list(owner){ownerId(owner);const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('operations','readonly'),r=tx.objectStore('operations').index('ownerId').getAll(owner);tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);});}
 async hasSource(sourceId){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('operations','readonly'),r=tx.objectStore('operations').getKey(sourceId);tx.oncomplete=()=>resolve(r.result!==undefined);tx.onabort=()=>reject(tx.error);});}
 async claim(sourceId,owner,apiOrigin,now=Date.now()){
  ownerId(owner);apiOrigin=destination(apiOrigin);let claimed=false;
  const item=await this.change(sourceId,old=>{
   if(!old||old.ownerId!==owner||old.apiOrigin!==apiOrigin)throw new OutboxError('OWNER_CONFLICT','A fila não pertence ao usuário/ambiente atual.');
   if(['completed','review'].includes(old.status)||old.leaseUntil>now||old.retryAt>now)return old;
   claimed=true;return {...old,status:'sending',mustResolve:old.attempts>0,attempts:old.attempts+1,claimToken:crypto.randomUUID(),leaseUntil:now+60000,updatedAt:new Date(now).toISOString()};
  });return claimed?item:null;
 }
 async settle(claim,status,{result=null,errorCode=null,retryAt=0}={}){
  if(!['completed','uncertain','review','auth_required','blocked'].includes(status))throw Error('Estado de fila inválido.');
  return this.change(claim.sourceId,old=>{
   if(!old||old.ownerId!==claim.ownerId||old.operationId!==claim.operationId)throw Error('Operação não encontrada.');
   // An expired attempt must never overwrite a newer result.
   if(old.claimToken!==claim.claimToken||old.status==='completed')return old;
   return {...old,status,result,errorCode,retryAt,leaseUntil:0,claimToken:null,updatedAt:new Date().toISOString()};
  });
 }
}
