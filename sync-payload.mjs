import {normalizePayload} from './outbox.mjs?v=1.9.2-audit';
export function prepareDraftPayload(d,{fromAccountId=null,toAccountId=null,accounts=[]}={}){
 if(d?.syncEligibleVersion!==1||(d.syncStatus||'LOCAL')!=='LOCAL')throw Error('Registro legado ou já processado: precisa de migração revisada.');
 if(d.reviewRequired||d.method==='Cartão de crédito')throw Error('Cartões e registros em revisão ainda não podem entrar na fila.');
 const kind=({despesa:'expense',recarga:'expense',receita:'income',transferencia:'transfer'})[d.operation];if(!kind)throw Error('Cofrinhos e investimentos exigem conciliação dos lotes.');
 const check=id=>{if(!accounts.some(a=>a.id===id&&a.status==='active'&&['bank','cash'].includes(a.kind)))throw Error('Selecione uma conta ativa retornada pelo D1.');};
 if(kind!=='income')check(fromAccountId);if(kind!=='expense')check(toAccountId);
 const decimal=String(d.amount);if(!/^\d+(?:\.\d{1,2})?$/.test(decimal))throw Error('Valor local inválido; não será arredondado silenciosamente.');
 const [whole,fraction='']=decimal.split('.'),amountCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 return normalizePayload({kind,description:d.description,effectiveDate:d.date,amountCents,fromAccountId,toAccountId,note:d.note||null});
}
