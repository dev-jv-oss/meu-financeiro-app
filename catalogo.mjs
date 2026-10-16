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
export function positionOverview(state){
 const s=state.snapshot;
 const mp=getPosition(s,'mp'),inter=getPosition(s,'inter'),cash=getPosition(s,'cash');
 const banks=sumKnown([mp,inter]);
 const pockets=active(state.pockets).map(p=>({...p,balance:pocketBalance(state,p)}));
 const investments=active(state.investments).map(p=>({...p,balance:investmentBalance(state,p)}));
 const reserved=sumKnown([...pockets.map(p=>p.balance),...investments.map(a=>a.balance)]);
 const total=sumKnown([mp,inter,cash,...pockets.map(p=>p.balance),...investments.map(p=>p.balance)]);
 return {mp,inter,cash,banks,pockets,investments,reserved,total};
}
export function mayArchive(state,kind,id){
 const item=(kind==='pocket'?state.pockets:state.investments).find(x=>x.id===id);
 if(!item)return {ok:false,error:'Cadastro não encontrado.'};
 const balance=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);
 if(balance===null)return {ok:false,error:'Antes de arquivar, informe o saldo atual (R$ 0,00) na posição financeira.'};
 if(balance!==0)return {ok:false,error:'Este item possui saldo informado. Faça a conciliação e informe R$ 0,00 antes de arquivar.'};
 return {ok:true};
}
export function canDelete(state,kind,id){
 const items=kind==='pocket'?state.pockets:state.investments,item=items.find(x=>x.id===id);
 if(!item)return {ok:false,error:'Cadastro não encontrado.'};
 const used=state.drafts.some(d=>kind==='pocket'?d.pocketId===id||(!d.pocketId&&canon(d.pocket)===canon(item.name)):d.investmentId===id);
 if(used)return {ok:false,error:'Há movimentações vinculadas. Arquive em vez de excluir, preservando o histórico.'};
 const balance=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);
 if(balance!=null&&balance!==0)return {ok:false,error:'Não é possível excluir um cadastro com saldo diferente de zero.'};
 return {ok:true};
}
