import {positionDisplay} from './rendimentos.mjs?v=1.5.1';
/** Patrimônio local. Compatível com o armazenamento da v1.0/v1.2.
 * Saldo não é inferido de rascunhos: apenas posição manual confirmada pelo usuário. */
export const DEFAULT_POCKETS = [
 {id:'p-fortaleza',name:'Cofrinho Viagem Fortaleza',legacy:'fortaleza',status:'active'},
 {id:'p-gasolina',name:'Cofrinho Gasolina',legacy:'gasolina',status:'active'},
 {id:'p-mounjaro',name:'Cofrinho Mounjaro',legacy:'mounjaro',status:'active'},
 {id:'p-celular',name:'Cofrinho Crédito celular',legacy:'celular',status:'active'}
];
const clean=s=>String(s??'').trim().replace(/\s+/g,' ');
export const canon=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const isValidName=s=>clean(s).length>=2&&clean(s).length<=80;
export const displayPocket=s=>clean(s).replace(/^cofrinho\s+/i,'');
export const displayBank=s=>s==='Inter'?'Banco Inter':s==='Mercado Pago — saldo'?'Mercado Pago':s;
export const YIELD_MODES=[['none','Sem remuneração'],['cdi','% do CDI'],['annual','Taxa prefixada (% ao ano)'],['ipca','IPCA + % ao ano'],['other','Outra modalidade']];
export function validateYield(data,today){
 const rateType=data.rateType||'';
 if(!YIELD_MODES.some(x=>x[0]===rateType))return {ok:false,error:'Escolha a modalidade de rendimento.'};
 const startedAt=data.startedAt||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)||Number.isNaN(Date.parse(startedAt+'T12:00:00Z'))||new Date(startedAt+'T12:00:00Z').toISOString().slice(0,10)!==startedAt||startedAt>today)return {ok:false,error:'Informe uma data inicial válida, não futura.'};
 let rate=null;
 if(rateType!=='none'){const raw=String(data.rateValue??'').trim().replace(',','.');if(!/^\d+(?:\.\d{1,4})?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>10000)return {ok:false,error:'Informe a taxa contratada, por exemplo 110 para 110% do CDI.'};rate=Number(raw);}
 const other=String(data.rateDescription||'').trim();if(rateType==='other'&&!other)return {ok:false,error:'Descreva a modalidade da remuneração.'};
 return {ok:true,startedAt,rateType,rateValue:rate,rateDescription:other};
}
export function yieldLabel(item){const label=YIELD_MODES.find(x=>x[0]===item.rateType)?.[1];if(!label)return 'Taxa não cadastrada';if(item.rateType==='none')return 'Sem remuneração';if(item.rateType==='other')return item.rateDescription||'Outra modalidade';return `${String(item.rateValue??'—').replace('.',',')}${item.rateType==='cdi'?'% do CDI':item.rateType==='annual'?'% a.a.':'% a.a. + IPCA'}`;}
export const active=items=>(items||[]).filter(x=>x.status!=='archived');
export function migrate(raw){
 const state=raw&&Array.isArray(raw.drafts)?raw:{drafts:[],snapshot:null};
 if(!Array.isArray(state.pockets))state.pockets=DEFAULT_POCKETS.map(p=>({...p}));
 if(!Array.isArray(state.investments))state.investments=[];
 // Vincula rascunhos antigos pelo identificador estável antes de futuros renomes.
 for(const d of state.drafts){if(d.pocket&&!d.pocketId){const item=state.pockets.find(p=>canon(p.name)===canon(d.pocket));if(item)d.pocketId=item.id;}}
 if(!state.snapshot||typeof state.snapshot!=='object')state.snapshot=null;
 return state;
}
export function getPosition(snapshot,key,id='',legacy=''){
 if(!snapshot)return null;
 let v=id?(snapshot[key]?.[id]??(legacy?snapshot[legacy]:null)):snapshot[key];
 if(v==null||v==='')return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
export const pocketBalance=(state,p)=>getPosition(state.snapshot,'pocketBalances',p.id,p.legacy);
export const investmentBalance=(state,a)=>getPosition(state.snapshot,'investmentBalances',a.id);
export function sumKnown(values){
 const known=values.filter(x=>x!==null && Number.isFinite(x));
 return {total:known.length?Math.round(known.reduce((a,b)=>a+b,0)*100)/100:null,known:known.length,all:values.length,partial:known.length!==values.length};
}
export function positionOverview(state,today){
 const s=state.snapshot;
 const mp=getPosition(s,'mp'),inter=getPosition(s,'inter'),cash=getPosition(s,'cash');
 const banks=sumKnown([mp,inter]);
 const valuation=(p,manual)=>today?positionDisplay(p,manual,today,state.referenceRates||{}):{value:manual,source:'confirmed'};
 const pockets=active(state.pockets).map(p=>{const v=valuation(p,pocketBalance(state,p));return {...p,balance:v.value,projectionSource:v.source,projection:v};});
 const investments=active(state.investments).map(p=>{const v=valuation(p,investmentBalance(state,p));return {...p,balance:v.value,projectionSource:v.source,projection:v};});
 const reserved=sumKnown([...pockets.map(p=>p.balance),...investments.map(a=>a.balance)]);
 const total=sumKnown([mp,inter,cash,...pockets.map(p=>p.balance),...investments.map(p=>p.balance)]);
 return {mp,inter,cash,banks,pockets,investments,reserved,total};
}
export function mayArchive(state,kind,id){
 const item=(kind==='pocket'?state.pockets:state.investments).find(x=>x.id===id);
 if(!item)return {ok:false,error:'Cadastro não encontrado.'};
 if(item.lots?.some(l=>l.amount>0))return {ok:false,error:'Há capital de referência ativo. Reconcilie os aportes antes de arquivar.'};
 const balance=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);
 if(balance===null)return {ok:false,error:'Antes de arquivar, informe o saldo atual (R$ 0,00) na posição financeira.'};
 if(balance!==0)return {ok:false,error:'Este item possui saldo informado. Faça a conciliação e informe R$ 0,00 antes de arquivar.'};
 return {ok:true};
}
export function canDelete(state,kind,id){
 const items=kind==='pocket'?state.pockets:state.investments,item=items.find(x=>x.id===id);
 if(!item)return {ok:false,error:'Cadastro não encontrado.'};
 const used=state.drafts.some(d=>kind==='pocket'?d.pocketId===id||(!d.pocketId&&canon(d.pocket)===canon(item.name)):d.investmentId===id);
 if(used||item.lots?.length)return {ok:false,error:'Há registros ou aportes-base vinculados. Arquive em vez de excluir.'};
 const balance=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);
 if(balance!=null&&balance!==0)return {ok:false,error:'Não é possível excluir um cadastro com saldo diferente de zero.'};
 return {ok:true};
}
