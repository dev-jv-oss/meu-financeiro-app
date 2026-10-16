/* Formulário estruturado: modelagem local, sem gravação externa. */
import {round2} from './parser.mjs';
export const TYPES=['despesa','receita','cofrinho','transferencia','aplicacao'];
export const ACCOUNTS=['Mercado Pago — saldo','Inter','Outro banco/conta','Dinheiro'];
export const POCKETS=['Cofrinho Viagem Fortaleza','Cofrinho Gasolina','Cofrinho Mounjaro','Cofrinho Crédito celular'];
export const EXPENSE_CATS=['Refeições','Alimentação','Casa e limpeza','Educação','Transporte','Serviços','Compras online','Saúde','Moradia','Lazer','Outros'];
export const INCOME_CATS=['Salário','Reembolso','Rendimentos','Vendas','Presente','Outras receitas'];
export const METHODS=['Pix','Débito','Cartão de crédito','Boleto','Transferência','Dinheiro','Outro'];
export const INVESTMENTS=['CDB','Tesouro Direto','LCI/LCA','Fundos de investimento','Poupança','Outros'];
export const BANKS=['Mercado Pago','Inter','Outro banco/instituição'];
export function amountBR(raw){
  let s=String(raw??'').trim().replace(/\s|R\$/gi,'');
  if(!s)return null;
  if(s.includes(',') && s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
  else if(s.includes(','))s=s.replace(',','.');
  else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n) && n>0 && n<=1000000000?round2(n):null;
}
const text=s=>String(s??'').trim();
const missing=(value,label)=>text(value)?null:`Selecione ${label}.`;
const desc=(type,f)=>{
 switch(type){
  case'despesa':return `Despesa${f.category?' · '+f.category:''}`;
  case'receita':return `Receita${f.category?' · '+f.category:''}`;
  case'cofrinho':return `${f.direction==='resgate'?'Resgate':'Aporte'} · ${f.pocket}`;
  case'transferencia':return `Transferência · ${f.fromAccount} → ${f.toAccount}`;
  case'aplicacao':return `${f.direction==='resgate'?'Resgate':'Aplicação'} · ${f.investmentType} · ${f.bank}`;
  default:return 'Movimentação';
 }
};
export function makeDraft(input,today){
 const f=Object.fromEntries(Object.entries(input||{}).map(([k,v])=>[k,text(v)]));
 const type=f.operation;
 if(!TYPES.includes(type))return {ok:false,error:'Escolha o tipo de operação.'};
 const amount=amountBR(f.amount);
 if(amount===null)return {ok:false,error:'Informe um valor válido maior que zero (até 2 casas decimais).'};
 const date=f.date||today;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`)))return {ok:false,error:'Informe uma data válida.'};
 if(date>today)return {ok:false,error:'Lançamentos futuros não devem ser registrados como operações já realizadas.'};
 const d={kind:type==='cofrinho'||type==='transferencia'?'transferencia':type==='aplicacao'?'aplicacao':type,
   operation:type,amount,date,description:'',category:'Não se aplica',account:'',method:'Não se aplica',
   pocket:'',direction:'',fromAccount:'',toAccount:'',bank:'',investmentType:'',note:f.note||''};
 let error=null,review=[];
 if(type==='despesa'||type==='receita'){
   error=missing(f.category,'uma categoria')||missing(f.account,'a conta')||missing(f.method,'a forma de pagamento/recebimento');
   if(error)return {ok:false,error};
   if(!(type==='despesa'?EXPENSE_CATS:INCOME_CATS).includes(f.category))return {ok:false,error:'Selecione uma categoria da lista.'};
   if(!ACCOUNTS.includes(f.account))return {ok:false,error:'Selecione uma conta válida.'};
   if(!METHODS.includes(f.method))return {ok:false,error:'Selecione uma forma válida.'};
   d.category=f.category;d.account=f.account;d.method=f.method;
   if(type==='despesa'&&f.method==='Cartão de crédito')review.push('Compra no cartão: conferir cartão e competência da fatura antes de enviar ao controle oficial.');
 }else if(type==='cofrinho'){
   error=missing(f.pocket,'o cofrinho')||missing(f.direction,'aporte ou resgate');
   if(error)return {ok:false,error};
   if(!POCKETS.includes(f.pocket)||!['aporte','resgate'].includes(f.direction))return {ok:false,error:'Cofrinho ou direção inválida.'};
   d.pocket=f.pocket;d.direction=f.direction;d.account='Mercado Pago — saldo';
   d.fromAccount=f.direction==='aporte'?d.account:f.pocket;
   d.toAccount=f.direction==='aporte'?f.pocket:d.account;
   d.method='Movimentação interna';
 }else if(type==='transferencia'){
   error=missing(f.fromAccount,'a conta de origem')||missing(f.toAccount,'a conta de destino');
   if(error)return {ok:false,error};
   if(!ACCOUNTS.includes(f.fromAccount)||!ACCOUNTS.includes(f.toAccount))return {ok:false,error:'Selecione contas válidas.'};
   if(f.fromAccount===f.toAccount)return {ok:false,error:'A origem e o destino precisam ser diferentes.'};
   d.fromAccount=f.fromAccount;d.toAccount=f.toAccount;d.account=f.fromAccount;d.method='Transferência interna';
 }else if(type==='aplicacao'){
   error=missing(f.direction,'aplicação ou resgate')||missing(f.bank,'a instituição')||missing(f.investmentType,'o tipo de investimento')||missing(f.account,'a conta de liquidação');
   if(error)return {ok:false,error};
   if(!['aporte','resgate'].includes(f.direction)||!BANKS.includes(f.bank)||!INVESTMENTS.includes(f.investmentType)||!ACCOUNTS.includes(f.account))return {ok:false,error:'Confira os dados da aplicação.'};
   d.direction=f.direction;d.bank=f.bank;d.investmentType=f.investmentType;d.account=f.account;
   d.method='Movimentação de investimento';
   if(f.direction==='aporte'){d.fromAccount=f.account;d.toAccount=`${f.bank} · ${f.investmentType}`;}
   else {d.fromAccount=`${f.bank} · ${f.investmentType}`;d.toAccount=f.account;}
   review.push('Investimentos exigem produto/posição identificável e regras de rendimentos/tributação antes da integração oficial.');
 }
 d.description=text(f.description)||desc(type,{...f,category:d.category});
 d.reviewRequired=review.length>0;d.reviewReasons=review;
 return {ok:true,draft:d,warnings:review};
}
