/** Pure dry-run. Never credits estimates or writes financial data. */
export function reconcile({baseCents,baseDate,postings}){
 if(!Number.isSafeInteger(baseCents)||!validDate(baseDate))throw Error('Base inválida.');
 let balance=baseCents;const seen=new Set(),included=[],excluded=[],review=[];
 for(const p of postings){
  if(!p.id||seen.has(p.id)||!Number.isSafeInteger(p.deltaCents)||!validDate(p.date)){review.push({id:p.id,reason:'Identificador, valor ou data inválidos/duplicados.'});continue;}
  seen.add(p.id);
  if(p.estimated){excluded.push(p.id);continue;}
  // Date-only source cannot order operations inside snapshot day.
  if(p.date===baseDate&&typeof p.afterBase!=='boolean'){review.push({id:p.id,reason:'Operação no dia da base: confirme se já está incluída.'});continue;}
  if(p.date<baseDate||(p.date===baseDate&&!p.afterBase)){excluded.push(p.id);continue;}
  balance+=p.deltaCents;if(!Number.isSafeInteger(balance))throw Error('Saldo fora do intervalo seguro.');included.push(p.id);
 }
 return {candidateBalanceCents:balance,ready:review.length===0,included,excluded,review};
}
function validDate(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
export function migrationDryRun(rows){
 const groups=new Map(),invalid=[];
 for(const r of rows){
  if(!r.sourceId||!r.source||!Number.isSafeInteger(r.amountCents)||!validDate(r.date)){invalid.push(r);continue;}
  const key=r.referenceId||r.externalKey||`${r.source}:${r.sourceId}`;
  const g=groups.get(key)||[];g.push(r);groups.set(key,g);
 }
 return {mode:'dry-run',writes:0,invalid,groups:[...groups].map(([key,refs])=>({key,references:refs,status:refs.some(r=>r.amountCents!==refs[0].amountCents||r.date!==refs[0].date)?'conflict':refs.length>1?'matched-review':'review',reason:'Correspondência por referência não autoriza importação nem exclusão.'}))};
}
