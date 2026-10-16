/* Modelo de registros locais v1.2. Sem acesso a banco, planilha ou rede. */
import {round2} from './parser.mjs';
export const TYPES=['despesa','receita','cofrinho','transferencia','aplicacao','recarga'];
// Os valores canônicos permanecem compatíveis com os rascunhos e parser anteriores.
export const ACCOUNTS=['Inter','Mercado Pago — saldo','Dinheiro','Outro banco/conta'];
export const ACCOUNT_OPTIONS=[['Inter','Inter'],['Mercado Pago — saldo','Mercado Pago'],['Dinheiro','Dinheiro'],['Outro banco/conta','Outro banco']];
export const OTHER_ACCOUNT='Outro banco/conta';
export const POCKETS=['Cofrinho Viagem Fortaleza','Cofrinho Gasolina','Cofrinho Mounjaro','Cofrinho Crédito celular'];
export const EXPENSE_CATS=['Recarga de celular','Refeições','Alimentação','Casa e limpeza','Educação','Transporte','Serviços','Compras online','Saúde','Moradia','Lazer','Outros'];
export const INCOME_CATS=['Salário','Reembolso','Rendimentos','Vendas','Presente','Outras receitas'];
export const METHODS=['Pix','Débito em conta','Cartão de débito','Cartão de crédito','Boleto','Transferência','Outro'];
export const INVESTMENTS=['CDB','Tesouro Direto','LCI/LCA','Fundos de investimento','Poupança','Outros'];
export const BANKS=['Mercado Pago','Inter','Outro banco/instituição'];
export const OTHER_BANK='Outro banco/instituição';
const text=s=>String(s??'').trim();
const missing=(value,label)=>text(value)?null:`Selecione ${label}.`;

/* Máscara dos centavos: 3 -> 0,03 -> 0,35 -> 3,59 -> 35,90. */
export function formatCentavos(raw){
 const digits=String(raw??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'')||'0';
 const cents=Number(digits);
 if(!Number.isFinite(cents)||cents>Number.MAX_SAFE_INTEGER)return '0,00';
 return (cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function amountBR(raw){
 let s=String(raw??'').trim().replace(/\s|R\$/gi,'');
 if(!s)return null;
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const n=Number(s);
 return Number.isFinite(n)&&n>0&&n<=1000000000?round2(n):null;
}
function accountInfo(selected,custom,label){
 if(!ACCOUNTS.includes(selected))return {ok:false,error:`Selecione ${label}.`};
 if(selected===OTHER_ACCOUNT){
  const name=text(custom).replace(/\s+/g,' ');
  if(!name)return {ok:false,error:`Informe o nome do banco de ${label}.`};
  if(name.length>80)return {ok:false,error:'O nome do banco deve ter até 80 caracteres.'};
  return {ok:true,value:selected,name};
 }
 return {ok:true,value:selected,name:selected==='Mercado Pago — saldo'?'Mercado Pago':selected};
}
const sameName=(a,b)=>a.toLocaleLowerCase('pt-BR')===b.toLocaleLowerCase('pt-BR');
function desc(type,d){
 switch(type){
  case'recarga':return `Recarga de celular · ${d.recipient}`;
  case'despesa':return `Despesa${d.category?' · '+d.category:''}`;
  case'receita':return `Receita${d.category?' · '+d.category:''}`;
  case'cofrinho':return `${d.direction==='resgate'?'Resgate':'Aporte'} · ${d.pocket}`;
  case'transferencia':return `Transferência · ${d.fromAccountName} → ${d.toAccountName}`;
  case'aplicacao':return `${d.direction==='resgate'?'Resgate':'Aplicação'} · ${d.investmentType} · ${d.bank}`;
  default:return 'Movimentação';
 }
}
export function makeDraft(input,today,options={}){
 const f=Object.fromEntries(Object.entries(input||{}).map(([k,v])=>[k,text(v)]));
 const type=f.operation;
 if(!TYPES.includes(type))return {ok:false,error:'Escolha o tipo de operação.'};
 const amount=amountBR(f.amount);
 if(amount===null)return {ok:false,error:'Informe um valor válido maior que zero (até 2 casas decimais).'};
 const date=f.date||today;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date)return {ok:false,error:'Informe uma data válida.'};
 if(date>today)return {ok:false,error:'Lançamentos futuros não devem ser registrados como operações já realizadas.'};
 const d={kind:type==='recarga'?'despesa':type==='cofrinho'||type==='transferencia'?'transferencia':type==='aplicacao'?'aplicacao':type,
  operation:type,amount,date,description:'',category:'Não se aplica',account:'',accountName:'',method:'Não se aplica',
  pocket:'',direction:'',fromAccount:'',toAccount:'',bank:'',investmentType:'',note:f.note||''};
 const review=[];
 if(type==='despesa'||type==='receita'||type==='recarga'){
  if(type==='recarga'){f.category='Recarga de celular';if(!['Meu celular','Ísis','Outro contato'].includes(f.recipient))return {ok:false,error:'Escolha quem receberá a recarga.'};if(f.recipient==='Outro contato'&&!text(f.recipientName))return {ok:false,error:'Informe quem receberá a recarga.'};}
  if(!f.category)return {ok:false,error:'Selecione uma categoria.'};
  if(!(type==='receita'?INCOME_CATS:EXPENSE_CATS).includes(f.category))return {ok:false,error:'Selecione uma categoria da lista.'};
  const account=accountInfo(f.account,f.accountName,'conta');
  if(!account.ok)return account;
  // Dinheiro em espécie não tem forma de pagamento a selecionar.
  const method=account.value==='Dinheiro'?'Dinheiro':f.method;
  if(!method)return {ok:false,error:'Selecione a forma de pagamento/recebimento.'};
  if(account.value!=='Dinheiro'&&!METHODS.includes(method))return {ok:false,error:'Selecione uma forma válida.'};
  d.category=f.category;d.account=account.value;d.accountName=account.name;d.method=method;
  if(type==='recarga'){d.recipient=f.recipient==='Outro contato'?text(f.recipientName):f.recipient;d.recipientType=f.recipient;}
  if(type!=='receita'&&method==='Cartão de crédito')review.push('Compra no cartão: conferir cartão e competência da fatura antes de enviar ao controle oficial.');
 }else if(type==='cofrinho'){
  const error=missing(f.pocket,'o cofrinho')||missing(f.direction,'aporte ou resgate');
  if(error)return {ok:false,error};
  if(!(options.pockets||POCKETS).includes(f.pocket)||!['aporte','resgate'].includes(f.direction))return {ok:false,error:'Cofrinho ou direção inválida.'};
  d.pocket=f.pocket;d.pocketId=f.pocketId||'';d.direction=f.direction;d.account='Mercado Pago — saldo';d.accountName='Mercado Pago';
  d.fromAccount=f.direction==='aporte'?d.account:f.pocket;
  d.toAccount=f.direction==='aporte'?f.pocket:d.account;
  d.fromAccountName=f.direction==='aporte'?'Mercado Pago':f.pocket;
  d.toAccountName=f.direction==='aporte'?f.pocket:'Mercado Pago';
  d.method='Movimentação interna';
 }else if(type==='transferencia'){
  const from=accountInfo(f.fromAccount,f.fromAccountName,'conta de origem');
  if(!from.ok)return from;
  const to=accountInfo(f.toAccount,f.toAccountName,'conta de destino');
  if(!to.ok)return to;
  if(sameName(from.name,to.name))return {ok:false,error:'A origem e o destino precisam ser diferentes.'};
  d.fromAccount=from.value===OTHER_ACCOUNT?from.name:from.value;
  d.toAccount=to.value===OTHER_ACCOUNT?to.name:to.value;
  d.fromAccountType=from.value;d.toAccountType=to.value;
  d.fromAccountName=from.name;d.toAccountName=to.name;
  d.account=d.fromAccount;d.accountName=from.name;d.method='Transferência interna';
 }else if(type==='aplicacao'){
  const error=missing(f.direction,'aplicação ou resgate')||missing(f.bank,'a instituição')||missing(f.investmentType,'o tipo de investimento');
  if(error)return {ok:false,error};
  if(!['aporte','resgate'].includes(f.direction)||!BANKS.includes(f.bank)||!INVESTMENTS.includes(f.investmentType))return {ok:false,error:'Confira os dados da aplicação.'};
  const account=accountInfo(f.account,f.accountName,'conta de liquidação');
  if(!account.ok)return account;
  if(account.value==='Dinheiro')return {ok:false,error:'Para investimentos, selecione uma conta bancária de liquidação.'};
  const bank=f.bank===OTHER_BANK?text(f.bankName).replace(/\s+/g,' '):f.bank;
  if(!bank)return {ok:false,error:'Informe o nome da instituição do investimento.'};
  if(bank.length>80)return {ok:false,error:'O nome da instituição deve ter até 80 caracteres.'};
  d.direction=f.direction;d.investmentId=f.investmentId||'';d.investmentName=f.investmentName||'';d.bank=bank;d.bankType=f.bank;d.investmentType=f.investmentType;
  d.account=account.value;d.accountName=account.name;d.method='Movimentação de investimento';
  const target=`${bank} · ${f.investmentType}`;
  if(f.direction==='aporte'){d.fromAccount=account.value;d.toAccount=target;d.fromAccountName=account.name;d.toAccountName=target;}
  else{d.fromAccount=target;d.toAccount=account.value;d.fromAccountName=target;d.toAccountName=account.name;}
  review.push('Investimentos exigem produto/posição identificável e regras de rendimentos/tributação antes da integração oficial.');
 }
 d.description=text(f.description)||desc(type,d);
 d.reviewRequired=review.length>0;d.reviewReasons=review;
 return {ok:true,draft:d,warnings:review};
}
