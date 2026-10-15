/* Interpretador preliminar local, sem acesso a contas ou à planilha oficial. */
export const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export {money};
const pickPocket = t => {
  if (/forta(?:leza|l[e]?za)|forlateza|viagem fortaleza/.test(t)) return 'Cofrinho Viagem Fortaleza';
  if (/gasolina|combustivel/.test(t)) return 'Cofrinho Gasolina';
  if (/mounjaro|tirzepatida/.test(t)) return 'Cofrinho Mounjaro';
  if (/credito celular|celular/.test(t) && /cofr|caixinh/.test(t)) return 'Cofrinho Crédito celular';
  return null;
};
const detectCategory = t => {
  if (/marmita|almoco|jantar|cafe da manha|lanche|salgado|pizza|restaurante|ifood/.test(t)) return 'Refeições';
  if (/limpeza|detergente|sabao|amaciante|desinfetante|alvejante|sabonete/.test(t)) return 'Casa e limpeza';
  if (/viagem escolar|escola|material escolar|colegio|mensalidade escolar|passeio escolar/.test(t)) return 'Educação';
  if (/gasolina|abastec|posto|combustivel|etanol/.test(t)) return 'Transporte';
  if (/diarista|faxina|faxineira/.test(t)) return 'Serviços';
  if (/mercado livre|amazon|shopee|aliexpress/.test(t)) return 'Compras online';
  if (/supermercado|mercearia|feira|hortifruti|mercado/.test(t)) return 'Alimentação';
  if (/farmacia|remedio|medicamento|consulta medica/.test(t)) return 'Saúde';
  return 'Outros';
};
const detectAccount = t => {
  if (/\binter\b/.test(t)) return 'Inter';
  if (/\bmp\b|mercado pago|mercadopago/.test(t)) return 'Mercado Pago — saldo';
  return null;
};
const detectMethod = t => /\bpix\b/.test(t) ? 'Pix' : /credito|cartao de credito/.test(t) ? 'Cartão de crédito' : /debito/.test(t) ? 'Débito' : 'A confirmar';
const hasFuture = t => /\b(vou|irei|pretendo|quero|planejo|planejado|quando|amanha|semana que vem|preciso|devo|gostaria|talvez)\b/.test(t);
function extractAmount(t){
  const cents=t.match(/\b(\d{1,3})\s*centav(?:o|os)\b/);
  if(cents)return Number(cents[1])/100;
  const rs=t.match(/(?:r\$\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d{1,9}(?:[.,]\d{1,2})?)/);
  if(rs) return parseBRL(rs[1]);
  const matches=[...t.matchAll(/\b(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,9}(?:[.,]\d{1,2})?)\b/g)].map(x=>x[0]);
  if(!matches.length)return null;
  let m=matches[0];
  // Não confundir '01/26' de fatura com valor monetário.
  if (/\bfatura\b/.test(t) && /\b\d{1,2}\/\d{2,4}\b/.test(t)) return null;
  return parseBRL(m);
}
function parseBRL(v){
  const s=String(v).replace(/\s/g,'');
  if(s.includes(',')&&s.includes('.'))return Number(s.replace(/\./g,'').replace(',','.'));
  if(s.includes(','))return Number(s.replace(',','.'));
  return Number(s);
}
function queryType(t){
  if (/\blimite\b/.test(t) && /inter|\bmp\b|mercado pago/.test(t))return 'limite';
  if (/\bfatura\b/.test(t))return 'fatura';
  if (/\bsaldo\b|\bsaldos\b|quanto tenho|quanto tem/.test(t))return 'saldo';
  return null;
}
export function interpret(input){
 const raw=String(input??'').trim();const t=norm(raw);
 if(!t) return {status:'incompleto',kind:null,description:'',issues:['Informe uma mensagem.']};
 const q=queryType(t);if(q){
   const account=detectAccount(t),pocket=pickPocket(t);
   let period=null;const mx=t.match(/\b(0?[1-9]|1[0-2])\/(\d{2}|\d{4})\b/);
   if(mx)period=`${mx[1].padStart(2,'0')}/${mx[2].length===2?'20'+mx[2]:mx[2]}`;
   else if(/janeiro/.test(t))period='01/2027 (ano inferido — confirmar)';
   return {status:'consulta',kind:q,account,pocket,period,description:raw,issues:[]};
 }
 const amount=extractAmount(t),account=detectAccount(t),pocket=pickPocket(t),method=detectMethod(t);
 const issues=[];if(amount===null||!Number.isFinite(amount)||amount<=0)issues.push('Informe o valor da operação.');
 const compound=/\s+e\s+/.test(t)&&(/resgat|tirad|tirei|saqu|retir/.test(t))&&(/pagu|gastei|comprei/.test(t));
 if(compound)issues.push('Há mais de uma operação; separe os lançamentos.');
 const future=hasFuture(t);
 let kind='despesa',direction=null,category=detectCategory(t);
 const pocketMention=Boolean(pocket||/cofrinho|cofre|caixinha/.test(t));
 if(pocketMention){
   if (/\b(tenho|esta|estava|ficou|ficaram|existe|sobrou)\b/.test(t) &&
       /\b(guardado|guardados|guardada|depositado|depositados|saldo)\b/.test(t))
     issues.push('Pode ser apenas descrição de um saldo existente, não uma nova operação.');
   const withdraw=/\b(tirei|tirado|retirei|retirado|saquei|sacado|resgatei|resgatado|resgatar|sacar|retirar)\b/.test(t);
   const deposit=/\b(guardei|guardado|coloquei|colocado|depositei|depositado|aportei|aportado|repus|reposto|recoloquei|poupei)\b/.test(t);
   kind='transferencia';category='Não se aplica';
   if(withdraw&&!deposit)direction='resgate';
   else if(deposit&&!withdraw)direction='aporte';
   else issues.push('Confirme se é aporte ou resgate.');
   if(!pocket)issues.push('Informe qual cofrinho.');
   if(!account)issues.push('Confirme a conta de origem/destino (ex.: Mercado Pago).');
 } else if(/\b(rendeu|rendimento|rendimentos|juros recebidos)\b/.test(t)){
   kind='receita';category='Rendimentos';
   if(!account)issues.push('Confirme a conta que recebeu o rendimento.');
 } else if(/\b(recebi|ganhei|salario caiu|depositaram|entrada)\b/.test(t)){
   kind='receita';category='Receitas';
   if(!account)issues.push('Informe a conta que recebeu o dinheiro.');
 } else if(/\b(estorno|reembolso|reembolsado|cancelamento)\b/.test(t)){
   kind='revisao';issues.push('Estornos exigem vinculação à operação original.');
 } else if(method==='Cartão de crédito'){
   kind='revisao';issues.push('Compras no cartão precisam da competência/fatura e aprovação.');
 } else if(!account){issues.push('Informe a conta utilizada (ex.: Pix MP, débito MP ou Inter).');}
 if(future)issues.push('A mensagem indica intenção futura, não movimentação realizada.');
 if(/\b(ontem|anteontem|dia \d{1,2}|semana passada)\b/.test(t))issues.push('Confirme a data efetiva da operação.');
 return {status:issues.length?'revisar':'pronto',kind,amount:amount===null?null:round2(amount),account,method,pocket,direction,category,description:raw,issues,future};
}
