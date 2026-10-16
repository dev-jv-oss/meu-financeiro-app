/** Simulação LOCAL, não extrato nem saldo bancário. Nenhum lançamento é publicado.
 * CDB/RDB e renda fixa individual simples; outros tipos requerem modelo específico.
 * Somente lotes confirmados MANUALMENTE pelo usuário entram na projeção. */
export const IOF_TABLE=[0,96,93,90,86,83,80,76,73,70,66,63,60,56,53,50,46,43,40,36,33,30,26,23,20,16,13,10,6,3,0];
const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
export function validISO(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d)))return false;const x=new Date(`${d}T12:00:00Z`);return !Number.isNaN(+x)&&x.toISOString().slice(0,10)===d}
export function daysBetween(a,b){return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000)}
export function irRate(d){return d<=180?.225:d<=360?.20:d<=720?.175:.15}
export function iofRate(d){return d>=30?0:IOF_TABLE[Math.max(1,d)]/100}
export const liquidityModes=[['daily','Liquidez diária, sem carência'],['grace','Com carência (dias)'],['maturity','Somente no vencimento']];
export const settlementModes=[['d0','D+0 (no mesmo dia útil)'],['d1','D+1 (dia útil seguinte)'],['other','Outro prazo']];
export const defaultTax=type=>({irEnabled:!['LCI','LCA','LCI/LCA','Poupança'].includes(type),iofEnabled:!['LCI','LCA','LCI/LCA','Poupança'].includes(type),irMode:'regressive',irFixed:''});
export function validateConditions(data,today,defaults={}){
 const d={...defaults,...data},liquidity=d.liquidity||'daily',settlement=d.settlement||'d0';
 if(!liquidityModes.some(x=>x[0]===liquidity))return {ok:false,error:'Selecione a liquidez.'};
 if(!settlementModes.some(x=>x[0]===settlement))return {ok:false,error:'Selecione o prazo de liquidação.'};
 const grace=liquidity==='grace'?Number(d.graceDays):0;
 if(liquidity==='grace'&&(!Number.isInteger(grace)||grace<=0||grace>36500))return {ok:false,error:'Informe a carência em dias inteiros (1 a 36500).'};
 const maturity=liquidity==='maturity'?String(d.maturityDate||''):'';
 if(liquidity==='maturity'&&!validISO(maturity))return {ok:false,error:'Informe uma data de vencimento válida.'};
 const irEnabled=d.irEnabled===true||d.irEnabled==='on';const iofEnabled=d.iofEnabled===true||d.iofEnabled==='on';
 const irMode=irEnabled?(d.irMode||'regressive'):'none';
 if(!['none','regressive','fixed'].includes(irMode))return {ok:false,error:'Regime de IR inválido.'};
 const irFixed=irMode==='fixed'?Number(String(d.irFixed??'').replace(',','.')):null;
 if(irMode==='fixed'&&(!Number.isFinite(irFixed)||irFixed<0||irFixed>100))return {ok:false,error:'Informe a alíquota de IR fixa entre 0 e 100.'};
 return {ok:true,liquidity,graceDays:grace,maturityDate:maturity,settlement,irEnabled,iofEnabled,irMode,irFixed};
}
export function estimateLot(item,lot,today,reference={}){
 const amount=Number(lot.amount),date=String(lot.date||'');
 if(!validISO(today)||!validISO(date)||date>today||!Number.isFinite(amount)||amount<=0)return {ok:false,reason:'Aporte sem valor ou data válida.'};
 const days=daysBetween(date,today);if(days>365*80)return {ok:false,reason:'Prazo excessivo para projeção.'};
 if(item.type&& !['CDB','RDB','LCI','LCA','LCI/LCA'].includes(item.type))return {ok:false,reason:'Este produto precisa de modelo próprio (preço de mercado, taxas ou tributação). Sem projeção automática.'};
 if(item.rateType!=='none'&&(item.rateValue===null||item.rateValue===undefined||item.rateValue===''))return {ok:false,reason:'Informe a taxa contratada antes de projetar.'};
 if(item.irEnabled===true&&item.irMode==='fixed'&&(item.irFixed===null||item.irFixed===undefined||!Number.isFinite(Number(item.irFixed))))return {ok:false,reason:'Informe a alíquota fixa de IR.'};
 const rate=Number(item.rateValue),type=item.rateType;
 let annual=null,approx=false,warning='';
 if(type==='none')annual=0;
 else if(type==='annual'&&Number.isFinite(rate)&&rate>=0)annual=rate/100;
 else if(type==='cdi'&&Number.isFinite(rate)&&rate>=0){
  const ref=Number(reference.cdiAnnual),refDate=reference.cdiUpdatedAt;
  if(!Number.isFinite(ref)||ref<=0||!validISO(refDate))return {ok:false,reason:'Informe CDI anual de referência e data de atualização para simular.'};
  if(daysBetween(refDate,today)<0||daysBetween(refDate,today)>7)return {ok:false,reason:'Referência CDI vencida (mais de 7 dias) ou futura. Atualize em Ajustes.'};
  // Projeção uniformizada. NÃO substitui composição por taxa DI diária histórica.
  annual=(ref/100)*(rate/100);approx=true;warning='CDI projetado com taxa anual manual constante, não série histórica DI.';
 }else return {ok:false,reason:'Modalidade sem série histórica calculável nesta versão (IPCA/outro) ou taxa incompleta.'};
 if(annual>10)return {ok:false,reason:'Taxa fora do limite seguro para simulação.'};
 const gross=amount*Math.pow(1+annual,days/365),yieldGross=Math.max(0,gross-amount);
 const iof=(item.iofEnabled===true&&days<30)?yieldGross*iofRate(days):0;
 const taxBase=Math.max(0,yieldGross-iof);
 let ir=0;
 if(item.irEnabled===true)ir=taxBase*(item.irMode==='fixed'?Number(item.irFixed)/100:irRate(days));
 const net=Math.max(0,gross-iof-ir);
 const liquidity=item.liquidity||'daily';
 const unlock=liquidity==='grace'?days>=Number(item.graceDays||0):liquidity==='maturity'?validISO(item.maturityDate)&&today>=item.maturityDate:true;
 const immediate=unlock&&(item.settlement||'d0')==='d0';
 return {ok:true,days,principal:cents(amount),gross:cents(gross),yieldGross:cents(yieldGross),iof:cents(iof),ir:cents(ir),net:cents(net),immediate,unlock,approx:approx||!item.type,warning:warning||(item.type?'':'Cofrinho: simulação simplificada que pode divergir dos créditos líquidos da instituição.')};
}
export function estimatePosition(item,today,reference={}){
 if(!Array.isArray(item.lots)||!item.lots.length)return {ok:false,reason:'Nenhum aporte-base informado. Saldo confirmado permanece como referência.'};
 if(typeof item.irEnabled!=='boolean'||typeof item.iofEnabled!=='boolean')return {ok:false,reason:'Revise e salve as opções de IR e IOF deste produto antes de projetar.'};
 const lots=item.lots.map(l=>estimateLot(item,l,today,reference));const invalid=lots.find(l=>!l.ok);
 if(invalid)return {ok:false,reason:invalid.reason};
 const sum=k=>cents(lots.reduce((s,l)=>s+l[k],0));
 return {ok:true,lots,principal:sum('principal'),gross:sum('gross'),yieldGross:sum('yieldGross'),iof:sum('iof'),ir:sum('ir'),net:sum('net'),immediatelyAvailable:cents(lots.filter(l=>l.immediate).reduce((s,l)=>s+l.net,0)),locked:cents(lots.filter(l=>!l.immediate).reduce((s,l)=>s+l.net,0)),approx:lots.some(l=>l.approx),warning:lots.find(l=>l.warning)?.warning||'',asOf:today};
}
/** Não use rascunhos para alterar saldos. Uma projeção válida substitui o saldo manual NA VISUALIZAÇÃO. */
export function positionDisplay(item,confirmed,today,reference){
 const projection=estimatePosition(item,today,reference);
 if(projection.ok)return {...projection,value:projection.net,source:'estimated',confirmed};
 return {value:confirmed??null,source:confirmed==null?'missing':'confirmed',confirmed,projectionError:projection.reason,asOf:null};
}
