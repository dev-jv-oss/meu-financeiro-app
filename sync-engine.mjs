/** Explicitly invoked only; no timer, service worker dispatch or token persistence. */
import {ownerId,destination} from './outbox.mjs?v=1.9.2-audit';
export async function flushOutbox({outbox,owner,apiOrigin,enabled=false,serverWrites=false,currentOwner,request,now=()=>Date.now()}){
 ownerId(owner);apiOrigin=destination(apiOrigin);
 if(enabled!==true||serverWrites!==true)return {sent:0,blocked:true};
 const assertOwner=()=>{if(currentOwner()!==owner)throw Object.assign(Error('Entre novamente com o titular desta fila.'),{status:401,code:'OWNER_CHANGED'});};
 let sent=0;
 for(const row of await outbox.list(owner)){
  assertOwner();if(row.apiOrigin!==apiOrigin)continue;
  const claim=await outbox.claim(row.sourceId,owner,apiOrigin,now());if(!claim)continue;
  try{
   assertOwner();let result;
   if(claim.mustResolve){
    const lookup=await request('/api/operation-result',{method:'POST',data:{clientOperationId:claim.operationId},owner});
    assertOwner();
    if(lookup?.found===true){if(lookup.status!=='completed'||lookup.result?.ok!==true||typeof lookup.result.transactionId!=='string')throw Object.assign(Error('Resultado exige revisão.'),{status:409,code:'REQUEST_UNRESOLVED'});result=lookup.result;}
    else if(lookup?.found!==false)throw Error('Resposta de recuperação inválida.');
   }
   if(!result){assertOwner();result=await request('/api/transactions',{method:'POST',data:structuredClone(claim.payload),owner});}
   if(result?.ok!==true||typeof result.transactionId!=='string'||!result.transactionId)throw Error('Confirmação contábil inválida.');
   await outbox.settle(claim,'completed',{result:{ok:true,transactionId:result.transactionId}});sent++;
  }catch(e){
   const status=e.status===401?'auth_required':e.status===403?'blocked':[400,409,415].includes(e.status)?'review':'uncertain';
   const delay=Math.min(300000,1000*2**Math.min(claim.attempts,8));
   await outbox.settle(claim,status,{errorCode:e.code||'RESULT_UNKNOWN',retryAt:status==='uncertain'?now()+delay:0});
   if(status==='auth_required'||status==='blocked')break;
  }
 }
 return {sent,blocked:false};
}
