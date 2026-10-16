import {interpret,money,norm,round2} from './parser.mjs';
import {makeDraft,TYPES,ACCOUNT_OPTIONS,OTHER_ACCOUNT,POCKETS,EXPENSE_CATS,INCOME_CATS,METHODS,INVESTMENTS,BANKS,OTHER_BANK,formatCentavos} from './operacoes.mjs';
import {migrate,active,canon,isValidName,positionOverview,getPosition,pocketBalance,investmentBalance,mayArchive,canDelete} from './catalogo.mjs';
const VERSION='1.3.0-local';
const KEY='meu-financeiro-pwa-local-v1';
const main=document.querySelector('#main');
const toastEl=document.querySelector('#toast');
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maybeMoney=v=>v==null?'—':money(v);
const num=v=>{let s=String(v??'').trim();if(!s)return null;s=s.replace(/R\$|\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?round2(n):null};
const fresh=()=>migrate({drafts:[],snapshot:null});
function load(){try{let s=JSON.parse(localStorage.getItem(KEY)||'null');return migrate(s)}catch(_){return fresh()}}
let state=load(),route='inicio',pending=null,installedPrompt=null,activeOperation='despesa',entryMode='rapido';
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch(_){notify('Não foi possível salvar. Verifique o armazenamento do navegador.');return false}}
function notify(t){toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(notify._id);notify._id=setTimeout(()=>toastEl.classList.remove('show'),4000)}
function navigate(r){route=r;pending=null;document.querySelectorAll('[data-route]').forEach(x=>x.classList.toggle('selected',x.dataset.route===r));render();window.scrollTo({top:0,behavior:'instant'})}
const card=(html)=>`<div class="card">${html}</div>`;
const label=(s)=>`<span class="eyebrow">${s}</span>`;
const alert=`<div class="quiet-notice"><span class="lock" aria-hidden="true">◇</span><div><b>Modo local:</b> rascunhos e valores somente neste aparelho. Sem sincronização ou alterações na planilha.</div></div>`;
const pictos={despesa:'<path d="M6 18 18 6M8 6h10v10"/>',receita:'<path d="M6 6 18 18M18 8v10H8"/>',cofrinho:'<path d="M5 8h14v10H5zM9 12h6M9 5h6"/>',transferencia:'<path d="M4 8h16m-5-4 5 4-5 4M20 16H4m5-4-5 4 5 4"/>',aplicacao:'<path d="M4 20V12h4v8m4 0V8h4v12m4 0V4h2v16M3 20h20"/>',recarga:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',consultar:'<circle cx="11" cy="11" r="8"/><path d="M11 7v5l3 2"/>'};
const iconSVG=(key)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${pictos[key]||pictos.consultar}</svg>`;
const localISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function render(){switch(route){case'inicio':return home();case'registrar':return register();case'consultar':return consult();case'rascunhos':return drafts();case'ajustes':return settings();case'patrimonio':return patrimonio();default:home()}}
function balanceText(x){return x?.total==null?'—':money(x.total)}
function balanceStatus(x){return x?.total==null?'Sem valores informados':x.partial?'Total parcial · dados manuais':'Valores informados manualmente'}
function assetLine(name,value,extra=''){return `<div class="asset-line"><span class="asset-line-name">${esc(name)}${extra?`<small>${esc(extra)}</small>`:''}</span><strong class="money">${maybeMoney(value)}</strong></div>`}
function home(){const sp=state.snapshot,overview=positionOverview(state),draftCount=state.drafts.length;
 const items=[['despesa','Nova despesa','Gastos do dia a dia','q-expense'],['receita','Receita','Entradas de dinheiro','q-income'],['cofrinho','Cofrinhos','Guardar ou retirar','q-pocket'],['transferencia','Transferência','Entre contas próprias','q-transfer'],['aplicacao','Investimentos','Aplicar ou resgatar','q-invest'],['recarga','Recarga de celular','Crédito para telefone','q-recharge'],['consultar','Consultas','Saldos e faturas','q-consult']];
 const mpLabel=assetLine('Mercado Pago',overview.mp),interLabel=assetLine('Inter',overview.inter);
 const pockets=overview.pockets.map(p=>assetLine(p.name,p.balance,'Cofrinho')).join('');
 const investments=overview.investments.map(p=>assetLine(p.name,p.balance,`${p.bank} · ${p.type}`)).join('');
 main.innerHTML=`
 <section class="hero"><div class="hero-label">Total informado · contas + reservas</div>
   <div class="hero-val money">${balanceText(overview.total)}</div>
   <div class="hero-bottom"><div class="hero-chip">${balanceStatus(overview.total)}. Não é saldo bancário online.</div><button class="btn btn-white" type="button" data-do="snapshot">${sp?'Atualizar valores':'Informar saldos'}</button></div>
 </section>
 <div class="balance-grid">
  <details class="balance-panel"><summary><span><small>Disponível nos bancos</small><strong class="money">${balanceText(overview.banks)}</strong></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="balance-detail">${mpLabel}${interLabel}<div class="balance-foot">${balanceStatus(overview.banks)}</div></div></details>
  <details class="balance-panel"><summary><span><small>Cofrinhos + investimentos</small><strong class="money">${balanceText(overview.reserved)}</strong></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="balance-detail">${pockets||'<p class="small muted">Nenhum cofrinho ativo.</p>'}${investments}${overview.investments.length?'':'<p class="small muted">Sem investimentos cadastrados.</p>'}<div class="balance-foot">${balanceStatus(overview.reserved)}</div></div></details>
 </div>
 <div class="balance-links"><button class="mini-link" data-do="snapshot">Editar saldos</button><button class="mini-link" data-route="patrimonio">Gerenciar cofrinhos e investimentos →</button></div>
 ${alert}
 <div class="section-title">O que vamos fazer?</div>
 <div class="quickgrid">${items.map(([id,title,subtitle,style])=>`<button type="button" class="quick ${style}" ${id==='consultar'?'data-route="consultar"':`data-operation="${id}"`}><span class="qicon">${iconSVG(id)}</span><strong>${title}</strong><span class="subtitle">${subtitle}</span></button>`).join('')}</div>
 <div class="section-title">Visão rápida <small>Somente no aparelho</small></div>
 <div class="stats"><div class="stat"><div class="caption">Rascunhos salvos</div><div class="metric">${draftCount}</div><button class="mini-link" type="button" data-route="rascunhos">Ver rascunhos →</button></div><div class="stat"><div class="caption">Sincronização oficial</div><div class="metric metric-sm">Desconectado</div><div class="caption">Saldo e cadastros são locais</div></div></div>
 <p class="secondary-note">Os totais somam somente posições manuais conhecidas e não incluem rascunhos. Não somamos um mesmo dinheiro duas vezes: saldo livre dos bancos e saldos separados de cofrinhos e investimentos.</p>`;
}
const opLabels={despesa:'Despesa',receita:'Receita',cofrinho:'Cofrinho',transferencia:'Entre contas',aplicacao:'Investimento',recarga:'Recarga de celular'};
function register(){
 main.innerHTML=`<div class="page-intro">${label('Seu registro')}<h1 class="heading">Nova movimentação</h1>
 <p class="lede">Selecione a operação e informe apenas o necessário.</p></div>
 <div class="entry-tabs" role="group" aria-label="Forma de registrar">
  <button type="button" class="entry-tab ${entryMode==='rapido'?'active':''}" data-entry="rapido">Formulário rápido</button>
  <button type="button" class="entry-tab ${entryMode==='texto'?'active':''}" data-entry="texto">Escrever mensagem</button>
 </div><div id="entry-area"></div>${alert}`;
 renderEntry();
}
function optSelect(name,values,val='',caption='Selecione'){return sel(name,values.map(x=>[x,x]),val,caption)}
function fieldSelect(title,name,opts,value='',placeholder='Selecione'){return `<div class="field"><label for="quick-${name}">${esc(title)}</label>${sel(name,opts.map(x=>Array.isArray(x)?x:[x,x]),value,placeholder).replace(`name="${name}"`,`id="quick-${name}" name="${name}"`)}</div>`}
function otherField(name,label){return `<div class="field conditional-other is-hidden" data-other-for="${name}"><label for="quick-${name}-name">${esc(label)}</label><input id="quick-${name}-name" class="input" name="${name}Name" maxlength="80" autocomplete="off" placeholder="Digite o nome" disabled></div>`}
function accountField(label,name,options=ACCOUNT_OPTIONS){return fieldSelect(label,name,options)+otherField(name,'Nome do outro banco')}
function syncQuickConditional(){
 const form=document.querySelector('#quick-form');if(!form)return;
 for(const wrapper of form.querySelectorAll('[data-other-for]')){
  const field=wrapper.dataset.otherFor;
  const select=form.elements.namedItem(field),extra=wrapper.querySelector('input');
  const visible=select && select.value === (field==='bank'?OTHER_BANK:field==='recipient'?'Outro contato':OTHER_ACCOUNT);
  wrapper.classList.toggle('is-hidden',!visible); extra.disabled=!visible;
 }
 const account=form.elements.namedItem('account');
 const cash=!!account&&account.value==='Dinheiro'&&(activeOperation==='despesa'||activeOperation==='receita'||activeOperation==='recarga');
 const methodWrapper=form.querySelector('#quick-method-wrap');
 if(methodWrapper){methodWrapper.classList.toggle('is-hidden',cash);methodWrapper.querySelector('select').disabled=cash;}
 const cashInfo=form.querySelector('#quick-cash-info');if(cashInfo)cashInfo.classList.toggle('is-hidden',!cash);
 for(const [selectName,wrapId] of [['pocket','new-pocket-wrap'],['investment','new-investment-wrap']]){const w=form.querySelector('#'+wrapId),v=form.elements.namedItem(selectName);if(w){const show=v?.value==='__new__';w.classList.toggle('is-hidden',!show);w.querySelector('input').disabled=!show;}}
 const investmentSelect=form.elements.namedItem('investment'),investFields=form.querySelector('#investment-fields-wrap');if(investFields&&investmentSelect){const known=investmentSelect.value!==''&&investmentSelect.value!=='__new__';investFields.classList.toggle('is-hidden',known);investFields.querySelectorAll('input,select').forEach(x=>x.disabled=known);}

}
function renderEntry(){const target=document.querySelector('#entry-area');if(!target)return;
 if(entryMode==='texto'){
  target.innerHTML=card(`<form id="natural-form"><div class="field"><label for="natural-text">Descreva a movimentação</label><textarea id="natural-text" class="textarea" maxlength="400" placeholder="Ex.: paguei 30 da viagem escolar pix mp"></textarea></div><button class="btn btn-block" type="submit">Interpretar mensagem →</button></form><div class="sample-wrap"><button class="sample" data-sample="gastei 48 em duas marmitas pix mp">Marmitas</button><button class="sample" data-sample="coloquei 0,04 cofrinho gasolina mp">Aporte</button><button class="sample" data-sample="rendeu 6 centavos mp">Rendimento</button></div>`)+`<div id="parse-display"></div>`;
 }else renderQuick();
}
function renderQuick(preserve={}){const target=document.querySelector('#entry-area');if(!target)return;
 let op=activeOperation;
 let typeOptions=TYPES.map(x=>[x,opLabels[x]]);
 let fields='';
 if(op==='despesa'||op==='receita'||op==='recarga'){
  if(op==='recarga')fields+=fieldSelect('Quem receberá a recarga?','recipient',['Meu celular','Ísis','Outro contato'])+otherField('recipient','Nome do contato');
  if(op!=='recarga')fields+=fieldSelect('Categoria','category',op==='receita'?INCOME_CATS:EXPENSE_CATS);
  fields+=accountField(op==='receita'?'Conta que recebeu':'Conta utilizada','account');
  fields+=`<div id="quick-method-wrap">${fieldSelect(op==='receita'?'Forma de recebimento':'Forma de pagamento','method',METHODS)}</div>`;
  fields+=`<div id="quick-cash-info" class="explain-transfer is-hidden">Dinheiro em espécie selecionado. Não precisa escolher uma forma de pagamento ou recebimento.</div>`;
  fields+=`<div class="field"><label for="quick-description">Descrição (opcional)</label><input id="quick-description" class="input" name="description" maxlength="200" placeholder="Ex.: almoço, salário, presente"></div>`;
 }else if(op==='cofrinho'){
  fields+=fieldSelect('Qual cofrinho?','pocket',[...active(state.pockets).map(p=>[p.id,p.name]),['__new__','＋ Criar novo cofrinho']]);
  fields+=`<div id="new-pocket-wrap" class="conditional-other is-hidden"><div class="field"><label for="new-pocket-name">Nome do novo cofrinho</label><input id="new-pocket-name" class="input" name="newPocketName" maxlength="80" placeholder="Ex.: Cofrinho Emergência" disabled></div><p class="hint">Será cadastrado neste aparelho quando você salvar o rascunho.</p></div>`;
  fields+=fieldSelect('O que aconteceu?','direction',[['aporte','Guardar dinheiro (aporte)'],['resgate','Retirar dinheiro (resgate)']]);
  fields+=`<div class="explain-transfer"><b>Conta: Mercado Pago (automático)</b><span>Ao guardar: saldo MP → cofrinho. Ao retirar: cofrinho → saldo MP. Não é despesa nem receita.</span></div>`;
 }else if(op==='transferencia'){
  fields+=accountField('Conta de origem','fromAccount');
  fields+=accountField('Conta de destino','toAccount');
  fields+=`<div class="explain-transfer">Transferência entre contas próprias. Não é receita nem despesa.</div>`;
 }else if(op==='aplicacao'){
  fields+=fieldSelect('Operação','direction',[['aporte','Aplicar dinheiro'],['resgate','Resgatar aplicação']]);
  fields+=fieldSelect('Qual investimento?','investment',[...active(state.investments).map(i=>[i.id,`${i.name} · ${i.bank}`]),['__new__','＋ Criar novo investimento']]);
  fields+=`<div id="new-investment-wrap" class="conditional-other is-hidden"><div class="field"><label for="new-investment-name">Nome do produto ou aplicação</label><input id="new-investment-name" class="input" name="newInvestmentName" maxlength="80" placeholder="Ex.: CDB liquidez diária" disabled></div></div>`;
  fields+=`<div id="investment-fields-wrap">`;
  fields+=fieldSelect('Instituição do investimento','bank',BANKS);
  fields+=otherField('bank','Nome da instituição');
  fields+=fieldSelect('Tipo de investimento','investmentType',INVESTMENTS);
  fields+=`</div>`;
  fields+=accountField('Conta de origem / recebimento (confira)','account',ACCOUNT_OPTIONS.filter(([id])=>id!=='Dinheiro'));
  fields+=`<div class="explain-transfer">Aplicação: sai da conta para o investimento. Resgate: volta para a conta. O produto específico e os rendimentos precisarão de conferência.</div>`;
 }
 target.innerHTML=`<div class="card"><div class="form-hero"><span class="form-hero-icon">${{despesa:'↗',receita:'↘',cofrinho:'◇',transferencia:'⇄',aplicacao:'▥',recarga:'▣'}[op]}</span><div><div class="form-hero-title">${opLabels[op]}</div><div class="form-hero-copy">Preencha os campos abaixo para criar seu rascunho.</div></div></div><form id="quick-form" novalidate>
  <div class="field"><label for="quick-operation">Tipo de movimentação</label>${sel('operation',typeOptions,op,'Selecione').replace('name="operation"','id="quick-operation" name="operation"')}</div>
  <div class="field"><label for="quick-amount">Valor (R$)</label><input id="quick-amount" class="input quick-amount" name="amount" inputmode="numeric" type="text" autocomplete="off" value="0,00" data-centavos required aria-describedby="amount-hint"><p class="hint" id="amount-hint">Digite apenas os números: 3590 vira 35,90.</p></div>
  ${fields}
  <details class="more-details"><summary>Data e observações</summary><div class="field"><label for="quick-date">Data da movimentação</label><input id="quick-date" class="input" type="date" name="date" value="${localISO()}" required></div><div class="field"><label for="quick-note">Observações (opcional)</label><textarea id="quick-note" class="textarea" name="note" maxlength="300" placeholder="Informações adicionais"></textarea></div></details>
  <div id="quick-feedback" role="alert" aria-live="polite"></div>
  <div class="safety-tip"><span aria-hidden="true">◇</span><span>Você está salvando apenas um rascunho. Nenhum saldo bancário será alterado.</span></div>
  <button class="btn btn-block" type="submit">Salvar rascunho →</button>
 </form></div>`;
 for(const name of ['amount','date','note']){if(preserve[name]!=null){const input=target.querySelector(`[name="${name}"]`);if(input)input.value=name==='amount'?formatCentavos(preserve[name]):preserve[name];}}
 syncQuickConditional();
}

function newId(prefix){return `${prefix}-${globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)}`}
function saveQuick(form){
 const data=Object.fromEntries(new FormData(form));let created=null,investment=null;
 if(data.operation==='cofrinho'){
  if(data.pocket==='__new__'){
   const name=(data.newPocketName||'').trim().replace(/\s+/g,' ');
   if(!isValidName(name)){notify('Dê um nome ao novo cofrinho (2 a 80 caracteres).');return}
   if(state.pockets.some(p=>canon(p.name)===canon(name))){notify('Já existe cofrinho com este nome, inclusive entre os arquivados.');return}
   created={id:newId('p'),name,status:'active'};data.pocket=name;data.pocketId=created.id;
  }else{const p=active(state.pockets).find(p=>p.id===data.pocket);if(!p){notify('Selecione um cofrinho ativo.');return}data.pocket=p.name;data.pocketId=p.id;}
 }else if(data.operation==='aplicacao'){
  if(data.investment==='__new__'){
   const name=(data.newInvestmentName||'').trim().replace(/\s+/g,' ');
   if(!isValidName(name)){notify('Informe um nome para a nova aplicação (2 a 80 caracteres).');return}
   const bankName=data.bank===OTHER_BANK?data.bankName:data.bank;
   if(!bankName||!data.investmentType){notify('Informe instituição e tipo do investimento.');return}
   if(state.investments.some(x=>canon(x.name)===canon(name)&&canon(x.bank)===canon(bankName))){notify('Esse investimento já está cadastrado, inclusive entre os encerrados.');return}
   investment={id:newId('inv'),name,bank:bankName,bankType:data.bank,bankName:data.bankName||'',type:data.investmentType,status:'active'};
  }else{
   investment=active(state.investments).find(x=>x.id===data.investment);
   if(!investment){notify('Selecione um investimento ativo ou crie um novo.');return}
   data.bank=investment.bankType;data.bankName=investment.bankName;data.investmentType=investment.type;
  }
  data.investmentId=investment.id;data.investmentName=investment.name;
 }
 const r=makeDraft(data,localISO(),{pockets:state.pockets.filter(p=>p.status==='active').map(p=>p.name).concat(created?[created.name]:[])});
 const feedback=document.querySelector('#quick-feedback');
 if(!r.ok){if(feedback)feedback.innerHTML=`<div class="notice">${esc(r.error)}</div>`;notify(r.error);return;}
 const d={...r.draft};d.id=newId('draft');d.createdAt=new Date().toISOString();d.state='RASCUNHO LOCAL';d.source='app-v1.3-form';
 const previous={...state,drafts:[...state.drafts],pockets:[...state.pockets],investments:[...state.investments]};
 if(created)state.pockets.push(created);
 if(data.operation==='aplicacao'&&data.investment==='__new__')state.investments.push(investment);
 state.drafts.unshift(d);state.drafts=state.drafts.slice(0,100);
 if(!persist()){state=previous;return}
 notify(r.warnings.length?'Salvo com marcação de revisão.':'Rascunho salvo neste aparelho.');navigate('rascunhos');
}
function saveLocalDraft(d){const previous=[...state.drafts];state.drafts.unshift(d);if(state.drafts.length>100)state.drafts.length=100;if(!persist()){state.drafts=previous;return false;}return true;}
const kinds=[['despesa','Despesa'],['receita','Receita'],['transferencia','Transferência interna'],['revisao','Revisão especial']];
const cats=['Refeições','Casa e limpeza','Educação','Transporte','Serviços','Compras online','Alimentação','Saúde','Outros','Receitas','Rendimentos','Não se aplica'];
const accounts=['Mercado Pago — saldo','Inter','Outro banco/conta'];
const pockets=['Cofrinho Viagem Fortaleza','Cofrinho Gasolina','Cofrinho Mounjaro','Cofrinho Crédito celular'];
const methods=['Pix','Débito','Cartão de crédito','Transferência','A confirmar'];
function sel(name,opts,val,blank='Selecione'){return `<select name="${name}" class="select"><option value="">${blank}</option>${opts.map(([v,n])=>`<option value="${esc(v)}" ${v===val?'selected':''}>${esc(n)}</option>`).join('')}</select>`}
function plainSel(name,arr,v){return sel(name,arr.map(x=>[x,x]),v)}
function showInterpret(text){const p=interpret(text);const wrap=document.querySelector('#parse-display');pending=p;
 if(p.status==='consulta'){wrap.innerHTML=`<div class="card"><span class="pill neutral">Consulta identificada</span><h3>${esc(p.kind)}</h3><p class="small">As consultas são atendidas na aba <b>Consultar</b>. Não geram despesa ou receita.</p><button data-route="consultar" class="btn btn-secondary">Abrir consultas</button></div>`;return}
 let warnings=p.issues.length?`<div class="notice"><b>Precisa conferir antes de salvar:</b>${p.issues.map(x=>`<div class="issue">${esc(x)}</div>`).join('')}</div>`:`<div class="notice notice-good">✓ Interpretação inicial completa. Confira os campos antes de salvar como rascunho.</div>`;
 wrap.innerHTML=`<div class="section-title">Conferir dados identificados</div>${warnings}${card(`<form id="draft-form">
 <div class="field"><label>Descrição</label><input class="input" name="description" value="${esc(p.description)}" maxlength="400" required></div>
 <div class="field"><label>Tipo</label>${sel('kind',kinds,p.kind)}</div>
 <div class="field"><label>Valor (R$)</label><input class="input" name="amount" inputmode="decimal" placeholder="0,00" value="${p.amount??''}" required></div>
 <div class="field"><label>Categoria</label>${plainSel('category',cats,p.category)}</div>
 <div class="field"><label>Conta</label>${plainSel('account',accounts,p.account)}</div>
 <div class="field"><label>Meio</label>${plainSel('method',methods,p.method)}</div>
 <div class="field"><label>Cofrinho (se for transferência)</label>${plainSel('pocket',pockets,p.pocket)}</div>
 <div class="field"><label>Direção (se for transferência)</label>${sel('direction',[['aporte','Aporte: conta → cofrinho'],['resgate','Resgate: cofrinho → conta']],p.direction)}</div>
 <div class="field"><label>Data efetiva</label><input class="input" type="date" name="date" value="${localISO()}" required></div>
 <div class="field"><label>Observações</label><textarea class="textarea" name="note" placeholder="Opcional"></textarea></div>
 <div class="notice notice-blue">Esta ação salva <b>apenas um rascunho local</b>. Não movimenta banco, não atualiza saldo e não grava na planilha oficial.</div>
 <div class="sticky-actions"><button class="btn btn-block" type="submit">Salvar rascunho neste aparelho</button></div>
 </form>`)}`;
 wrap.scrollIntoView({behavior:'smooth',block:'start'});
}
function handleSaveDraft(form){let d=Object.fromEntries(new FormData(form)),val=num(d.amount);if(val==null||val<=0){notify('Informe um valor maior que zero.');return}if(!d.account){notify('Informe a conta antes de salvar.');return}if(d.kind==='transferencia'&&(!d.pocket||!d.direction)){notify('Informe cofrinho e direção da transferência.');return}if(!d.date){notify('Informe a data efetiva.');return}if(d.kind==='revisao') {notify('Estornos e operações complexas precisam revisão antes de integrar.');}
 d.amount=val;d.id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;d.createdAt=new Date().toISOString();d.state='RASCUNHO LOCAL';d.source='app-v1';if(saveLocalDraft(d)){notify('Rascunho salvo neste aparelho. Não foi enviado à planilha.');navigate('rascunhos')}}
function consult(){const s=state.snapshot,o=positionOverview(state);
 const cards=[['Mercado Pago',o.mp],['Inter',o.inter],['Dinheiro em espécie',o.cash],...o.pockets.map(p=>[p.name,p.balance]),...o.investments.map(a=>[`${a.name} · ${a.bank}`,a.balance]),['Fatura MP',s?.faturaMp],['Fatura Inter',s?.faturaInter],['Limite MP',s?.limiteMp],['Limite Inter',s?.limiteInter]];
 main.innerHTML=`<div class="page-intro">${label('Acompanhamento')}<h1 class="heading">Consultar finanças</h1><p class="lede">Posições preenchidas por você. Não há conexão com bancos ou com o Google Sheets.</p></div>${alert}
  <div class="bankgrid">${cards.map(([title,value])=>`<div class="bank"><div class="bank-label">${esc(title)}</div><div class="bank-value money">${maybeMoney(value)}</div><small>${s?'Dado manual':'Não informado'}</small></div>`).join('')}</div>
  <div class="flex-wrap-row mt-14"><button class="btn btn-secondary" data-do="snapshot">Atualizar valores</button><button class="btn btn-ghost" data-route="patrimonio">Gerenciar cadastros</button></div>
  ${card(`<form id="query-form"><div class="field"><label for="query-text">Consultar por mensagem (opcional)</label><input id="query-text" class="input" maxlength="150" placeholder="Ex.: saldo mp"></div><button class="btn btn-block" type="submit">Consultar</button></form><div class="sample-wrap">${['saldo mp','saldo cofrinho fortaleza','limite disponível inter','fatura atual mp'].map(x=>`<button class="sample" data-query="${esc(x)}">${esc(x)}</button>`).join('')}</div><div id="query-out"></div>`)}`;
}
function showQuery(text){const p=interpret(text),target=document.querySelector('#query-out');if(!target)return;
 const s=state.snapshot;
 if(p.status!=='consulta'){target.innerHTML='<div class="notice">Não reconheci uma consulta. Para lançar use Registrar.</div>';return}
 if(!s){target.innerHTML='<div class="notice">Nenhum saldo informado. Preencha seus valores manuais primeiro.</div>';return}
 let val=null,labelText='',extra='';
 if(p.kind==='saldo'){
  if(p.pocket){const needle=canon(p.pocket),found=state.pockets.find(x=>canon(x.name).includes(needle)||needle.includes(canon(x.name).replace(/^cofrinho /,'')));
   if(found){val=pocketBalance(state,found);labelText=found.name;}else extra='Cofrinho não reconhecido nesta posição local.';
  }else if(p.account==='Mercado Pago — saldo'){val=getPosition(s,'mp');labelText='Mercado Pago';}
  else if(p.account==='Inter'){val=getPosition(s,'inter');labelText='Inter';}
  else extra='Indique uma conta ou cofrinho específico.';
 }else if(p.kind==='limite'){val=p.account==='Inter'?getPosition(s,'limiteInter'):p.account==='Mercado Pago — saldo'?getPosition(s,'limiteMp'):null;labelText=`Limite disponível ${p.account||''}`;}
 else if(p.kind==='fatura'){labelText=`Fatura atual ${p.account||''}`;if(p.period)extra='A posição local não possui faturas por competência.';else val=p.account==='Inter'?getPosition(s,'faturaInter'):p.account==='Mercado Pago — saldo'?getPosition(s,'faturaMp'):null;}
 target.innerHTML=`<div class="card"><span class="pill neutral">Consulta local</span><h3>${esc(labelText||'Consulta')}</h3><div class="heading money">${maybeMoney(val)}</div><p class="hint">${esc(extra||'Última posição digitada neste aparelho: '+(s.date||'sem data')+'. Não equivale ao saldo bancário atual.')}</p></div>`;
}
function niceDate(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return String(iso||'');const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
function patrimonio(){
 const o=positionOverview(state);
 const manager=(items,kind)=>items.map(item=>{
  const bal=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);
  const count=state.drafts.filter(d=>kind==='pocket'?(d.pocketId===item.id||(!d.pocketId&&canon(d.pocket)===canon(item.name))):d.investmentId===item.id).length;
  const heading=kind==='investment'?`${item.bank} · ${item.type}`:'Cofrinho';
  return `<div class="asset-manager"><div class="asset-row"><div><b>${esc(item.name)}</b><small>${esc(heading)} · ${count} rascunho(s) vinculado(s)${item.status==='archived'?' · Arquivado':''}</small></div><strong class="money">${maybeMoney(bal)}</strong></div>
  <details class="asset-manage-detail"><summary>Gerenciar</summary>
   <form class="rename-form" data-rename-kind="${kind}" data-rename-id="${esc(item.id)}"><div class="field"><label>Renomear</label><input class="input" name="newName" value="${esc(item.name)}" maxlength="80" required></div><button class="btn btn-secondary" type="submit">Salvar nome</button></form>
   <div class="flex-wrap-row asset-actions"><button class="btn btn-ghost" type="button" data-asset-act="${item.status==='archived'?'reactivate':'archive'}" data-asset-kind="${kind}" data-asset-id="${esc(item.id)}">${item.status==='archived'?'Reativar':'Arquivar'}</button><button class="btn btn-red" type="button" data-asset-act="delete" data-asset-kind="${kind}" data-asset-id="${esc(item.id)}">Excluir cadastro</button></div>
   <p class="hint">Arquivar oculta do formulário, preservando o histórico. A exclusão definitiva só é permitida quando não há rascunhos vinculados nem saldo.</p>
  </details></div>`;
 }).join('');
 main.innerHTML=`<div class="page-intro">${label('Organização do patrimônio')}<h1 class="heading">Cofrinhos e investimentos</h1><p class="lede">Cadastros locais. Os saldos devem ser preenchidos manualmente; rascunhos não mudam sua posição financeira.</p></div>${alert}
 <div class="card asset-section"><div class="spaced section-title"><span>Cofrinhos ativos</span><button class="mini-link" data-do="snapshot">Editar saldos</button></div>
 ${manager(active(state.pockets),'pocket')||'<p class="small muted">Nenhum cofrinho ativo.</p>'}
 <details class="new-asset"><summary>＋ Criar cofrinho</summary><form id="new-pocket-form"><div class="field"><label>Nome do cofrinho</label><input name="name" class="input" required maxlength="80" placeholder="Ex.: Cofrinho Emergência"></div><button class="btn btn-block" type="submit">Cadastrar cofrinho</button></form></details></div>
 <div class="card asset-section"><div class="section-title">Investimentos ativos</div>
 ${manager(active(state.investments),'investment')||'<p class="small muted">Nenhum investimento cadastrado.</p>'}
 <details class="new-asset"><summary>＋ Criar investimento</summary><form id="new-investment-form"><div class="field"><label>Nome do investimento</label><input name="name" class="input" required maxlength="80" placeholder="Ex.: CDB liquidez diária"></div>${fieldSelect('Instituição','bank',BANKS)}${otherField('bank','Nome da instituição')}${fieldSelect('Tipo','investmentType',INVESTMENTS)}<button class="btn btn-block" type="submit">Cadastrar investimento</button></form></details></div>
 <details class="archived-assets"><summary>Cadastros arquivados (${state.pockets.filter(x=>x.status==='archived').length+state.investments.filter(x=>x.status==='archived').length})</summary>${manager(state.pockets.filter(x=>x.status==='archived'),'pocket')}${manager(state.investments.filter(x=>x.status==='archived'),'investment')||''}</details>
 <p class="secondary-note">Resgatar o valor total não arquiva automaticamente: nesta versão os lançamentos são apenas rascunhos. Após integração, o encerramento deverá ocorrer somente com saldo oficial conciliado e igual a zero.</p>`;
}
function createCatalog(form,kind){
 const data=Object.fromEntries(new FormData(form)),name=(data.name||'').trim().replace(/\s+/g,' ');
 if(!isValidName(name)){notify('Informe um nome entre 2 e 80 caracteres.');return}
 let item,collection;
 if(kind==='pocket'){
  collection=state.pockets;
  if(collection.some(p=>canon(p.name)===canon(name))){notify('Já existe cofrinho com esse nome, inclusive arquivado.');return}
  item={id:newId('p'),name,status:'active'};
 }else{
  collection=state.investments;
  const bank=data.bank===OTHER_BANK?(data.bankName||'').trim():data.bank;
  if(!bank||!BANKS.includes(data.bank)||!INVESTMENTS.includes(data.investmentType)){notify('Informe instituição e tipo válido.');return}
  if(collection.some(p=>canon(p.name)===canon(name)&&canon(p.bank)===canon(bank))){notify('Já existe investimento com esse nome e banco.');return}
  item={id:newId('inv'),name,bank,bankType:data.bank,bankName:data.bankName||'',type:data.investmentType,status:'active'};
 }
 collection.push(item);if(!persist()){collection.pop();return}
 notify('Cadastro criado neste aparelho.');patrimonio();
}
function renameCatalog(form){
 const kind=form.dataset.renameKind,id=form.dataset.renameId,collection=kind==='pocket'?state.pockets:state.investments;
 const item=collection.find(x=>x.id===id),name=(new FormData(form).get('newName')||'').trim().replace(/\s+/g,' ');
 if(!item||!isValidName(name)){notify('Informe um nome válido de 2 a 80 caracteres.');return}
 if(collection.some(x=>x.id!==id&&canon(x.name)===canon(name)&&(kind==='pocket'||canon(x.bank)===canon(item.bank)))){notify('Já existe cadastro com esse nome.');return}
 const before=item.name;item.name=name;
 if(!persist()){item.name=before;return}
 notify('Nome atualizado. O histórico continua preservado.');patrimonio();
}
function actionCatalog(kind,id,action){
 const collection=kind==='pocket'?state.pockets:state.investments,item=collection.find(x=>x.id===id);
 if(!item)return;
 if(action==='reactivate'){
  item.status='active';if(!persist()){item.status='archived';return}notify('Cadastro reativado.');patrimonio();return;
 }
 if(action==='archive'){
  const r=mayArchive(state,kind,id);if(!r.ok){notify(r.error);return}
  if(!confirm(`Arquivar ${item.name}? O cadastro ficará oculto do registro e o histórico será preservado.`))return;
  item.status='archived';if(!persist()){item.status='active';return}notify('Arquivado, sem apagar histórico.');patrimonio();return;
 }
 if(action==='delete'){
  const r=canDelete(state,kind,id);if(!r.ok){notify(r.error);return}
  if(!confirm(`Excluir definitivamente o cadastro ${item.name} deste aparelho?`))return;
  const ix=collection.findIndex(x=>x.id===id);const backup=collection[ix],priorSnapshot=state.snapshot?structuredClone(state.snapshot):null;collection.splice(ix,1);
  if(state.snapshot){if(kind==='pocket')delete state.snapshot.pocketBalances?.[id];else delete state.snapshot.investmentBalances?.[id]}
  if(!persist()){collection.splice(ix,0,backup);state.snapshot=priorSnapshot;return}notify('Cadastro local excluído.');patrimonio();
 }
}
function drafts(){
 main.innerHTML=`<div class="page-intro">${label('Neste aparelho')}<h1 class="heading">Rascunhos</h1><p class="lede">Movimentações salvas localmente. Nenhuma foi enviada à planilha oficial.</p></div>
 ${alert}
 <div class="spaced section-title"><span>${state.drafts.length} registro(s)</span><button class="btn btn-ghost" data-do="export" ${state.drafts.length?'':'disabled'}>Exportar JSON</button></div>
 ${state.drafts.length?state.drafts.map(d=>{
 const kind=d.operation||d.kind||'transferencia';const type=opLabels[kind]||d.kind||'Movimentação';
 const sign=kind==='receita'?'+':(kind==='despesa'||kind==='recarga')?'−':'';
 const amountClass=kind==='receita'?'receita':(kind==='despesa'||kind==='recarga')?'despesa':'';
 const picture={despesa:'↗',receita:'↘',cofrinho:'◇',transferencia:'⇄',aplicacao:'▥',recarga:'▣'}[kind]||'≡';
 return `<article class="draft"><div class="draft-head"><div class="draft-title"><span class="draft-icon ${esc(kind)}" aria-hidden="true">${picture}</span><div><h4>${esc(d.description||type)}</h4><div class="meta">${esc(type)} · ${esc(niceDate(d.date))}</div><div class="meta">${esc((d.pocketId&&state.pockets.find(p=>p.id===d.pocketId)?.name)||(d.investmentId&&state.investments.find(i=>i.id===d.investmentId)?.name)||d.recipient||d.pocket||d.accountName||d.category||'Rascunho local')}</div></div></div><div class="amount money ${amountClass}">${sign}${money(d.amount)}</div></div>${d.reviewRequired?'<div class="review-note">Pendente de revisão para integração</div>':''}<div class="draft-acts"><button type="button" class="btn btn-red" data-del="${esc(d.id)}">Excluir</button></div></article>`;
 }).join(''):`<div class="card empty"><div class="symbol">◇</div><b>Nenhum rascunho ainda</b><p>Toque em Registrar para criar seu primeiro lançamento.</p><button class="btn btn-secondary" data-route="registrar">Criar rascunho</button></div>`}
 <p class="secondary-note">Rascunhos não são operações financeiras confirmadas. Confira seus registros oficiais antes de repetir uma movimentação.</p>`;
}
function snapshot(){const s=state.snapshot||{};
 const fixed=[['mp','Saldo livre Mercado Pago'],['inter','Saldo livre Inter'],['cash','Dinheiro em espécie'],['limiteMp','Limite disponível cartão MP'],['limiteInter','Limite disponível Inter'],['faturaMp','Fatura atual MP'],['faturaInter','Fatura atual Inter']];
 const field=(name,title,val)=>`<div class="field"><label>${esc(title)}</label><input class="input" inputmode="decimal" name="${esc(name)}" placeholder="—" value="${val==null?'':esc(String(val).replace('.',','))}"></div>`;
 main.innerHTML=`<div class="page-intro">${label('Dados manuais')}<h1 class="heading">Atualizar saldos</h1><p class="lede">Informe os valores atuais confirmados no banco. Deixe em branco quando não souber; zero significa saldo realmente zerado.</p></div>
 <div class="notice notice-blue">Os saldos são informados manualmente e não são alterados por rascunhos. Informe em Mercado Pago apenas o <b>saldo livre</b>, sem incluir cofrinhos, para não contar duas vezes.</div>
 ${card(`<form id="snapshot-form">
  <div class="section-title">Contas</div>${fixed.slice(0,3).map(([id,title])=>field(id,title,getPosition(s,id))).join('')}
  <div class="section-title">Cofrinhos</div>${state.pockets.filter(p=>p.status!=='archived').map(p=>field('pocketBalance__'+p.id,p.name,pocketBalance(state,p))).join('')}
  <div class="section-title">Investimentos</div>${active(state.investments).length?active(state.investments).map(i=>field('investmentBalance__'+i.id,`${i.name} · ${i.bank}`,investmentBalance(state,i))).join(''):'<p class="small muted">Nenhum investimento cadastrado.</p>'}
  <div class="section-title">Cartões</div>${fixed.slice(3).map(([id,title])=>field(id,title,getPosition(s,id))).join('')}
  <div class="field"><label>Data da posição</label><input type="date" class="input" name="date" value="${esc(s.date||localISO())}"></div><button class="btn btn-block" type="submit">Guardar posição local</button></form>`)}`;
}
function settings(){main.innerHTML=`<div class="page-intro">${label('Seu aplicativo')}<h1 class="heading">Ajustes e privacidade</h1></div>
 ${card(`<div class="kv"><div class="k">Versão</div><div class="v">${VERSION}</div></div><div class="kv"><div class="k">Conexão Google Sheets</div><div class="v">Não configurada</div></div><div class="kv"><div class="k">API da OpenAI</div><div class="v">Desativada / sem custo</div></div><div class="kv"><div class="k">Armazenamento</div><div class="v">Local no navegador</div></div><div class="line"></div><button class="btn btn-block" data-do="install" id="install-action">Instalar na tela inicial</button><p class="installnote">Android / Chrome: ⋮ → <b>Adicionar à tela inicial</b> ou <b>Instalar aplicativo</b>. É necessário abrir por HTTPS ou localhost, não por arquivo ZIP diretamente.</p>`)}
 ${card(`<h3>Controle dos dados locais</h3><p class="small muted">Você controla os dados armazenados neste navegador. Limpar os dados do navegador também os apaga.</p><div class="flex-wrap-row"><button class="btn btn-secondary" data-do="export">Exportar backup completo</button><button class="btn btn-red" data-do="clear">Apagar dados locais</button></div>`)}
 ${card(`<h3>Próxima fase: integração segura</h3><p class="small muted">Estamos preparando autenticação individual, consulta dos saldos oficiais e envio com confirmação e proteção contra duplicidades. Nada está conectado nesta versão; o webhook do WhatsApp continuará separado.</p>`)}
 `}
function saveSnapshot(form){
 const original=state.snapshot,values=new FormData(form);
 const s={...(original||{}),pocketBalances:{...(original?.pocketBalances||{})},investmentBalances:{...(original?.investmentBalances||{})}};
 for(const [k,v] of values){
  if(k==='date'){s.date=v;continue}
  const raw=String(v).trim(),value=raw?num(raw):null;
  if(raw&&value===null){notify('Valor inválido no campo '+k);return}
  if(k.startsWith('pocketBalance__')){
   const id=k.slice(15);if(!state.pockets.some(p=>p.id===id)){notify('Cofrinho inválido.');return}
   if(value===null)delete s.pocketBalances[id];else s.pocketBalances[id]=value;
   const pocket=state.pockets.find(p=>p.id===id);if(pocket?.legacy)delete s[pocket.legacy];
  }else if(k.startsWith('investmentBalance__')){
   const id=k.slice(19);if(!state.investments.some(p=>p.id===id)){notify('Investimento inválido.');return}
   if(value===null)delete s.investmentBalances[id];else s.investmentBalances[id]=value;
  }else{if(value===null)delete s[k];else s[k]=value;}
 }
 state.snapshot=s;if(!persist()){state.snapshot=original;return}
 notify('Posição manual atualizada.');navigate('inicio');
}
function exportData(){const payload={format:'meu-financeiro-pwa-v1.3',createdAt:new Date().toISOString(),warning:'Dados locais, não publicados no controle oficial. Armazene o backup em local seguro.',drafts:state.drafts,snapshot:state.snapshot,pockets:state.pockets,investments:state.investments};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='meu-financeiro-rascunhos.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function clearData(){if(!confirm('Apagar TODOS os rascunhos, saldos e cadastros locais armazenados neste navegador? Isso não afeta a planilha oficial.'))return;state=fresh();persist();notify('Dados locais apagados.');navigate('inicio')}
document.body.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.operation){activeOperation=b.dataset.operation;entryMode='rapido';navigate('registrar');return}
 if(b.dataset.entry){entryMode=b.dataset.entry;register();return}
 if(b.dataset.route){navigate(b.dataset.route);return}
 if(b.id==='btn-settings'){navigate('ajustes');return}
 if(b.dataset.sample){const t=document.querySelector('#natural-text');if(t){t.value=b.dataset.sample;showInterpret(t.value)}return}
 if(b.dataset.query){const x=document.querySelector('#query-text');x.value=b.dataset.query;showQuery(x.value);return}
 if(b.dataset.assetAct){actionCatalog(b.dataset.assetKind,b.dataset.assetId,b.dataset.assetAct);return}
 if(b.dataset.del){if(!confirm('Excluir somente este rascunho local?'))return;state.drafts=state.drafts.filter(d=>d.id!==b.dataset.del);persist();render();notify('Rascunho removido.');return}
 switch(b.dataset.do){case'export':exportData();return;case'clear':clearData();return;case'snapshot':route='snapshot';snapshot();return;case'install':if(installedPrompt){installedPrompt.prompt();installedPrompt.userChoice.finally(()=>{installedPrompt=null})}else notify('No Chrome Android: menu ⋮ → Instalar app / Adicionar à tela inicial.');return}
});
document.body.addEventListener('change',e=>{
 if(e.target.matches('#quick-operation')){
  const previous=Object.fromEntries(new FormData(e.target.form));activeOperation=e.target.value;renderQuick(previous);
 }
 if(e.target.matches('#quick-bank')){
  const account=document.querySelector('#quick-account');
  const match={'Mercado Pago':'Mercado Pago — saldo','Inter':'Inter','Outro banco/instituição':'Outro banco/conta'};
  if(account && !account.value)account.value=match[e.target.value]||'';
 }
 if(e.target.matches('#quick-account,#quick-fromAccount,#quick-toAccount,#quick-bank,#quick-recipient,#quick-pocket,#quick-investment'))syncQuickConditional();
 if(e.target.matches('#new-investment-form [name=bank]')){const input=e.target.form.querySelector('[name=bankName]'),wrapper=input?.closest('.conditional-other'),show=e.target.value===OTHER_BANK;if(wrapper){wrapper.classList.toggle('is-hidden',!show);input.disabled=!show;}}
});
document.body.addEventListener('input',e=>{
 if(!e.target.matches('[data-centavos]'))return;
 const input=e.target;
 const masked=formatCentavos(input.value);
 if(input.value!==masked)input.value=masked;
 try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}
});
document.body.addEventListener('focusin',e=>{
 if(e.target.matches('[data-centavos]')){const input=e.target;try{input.setSelectionRange(input.value.length,input.value.length)}catch(_){}}
});
document.body.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='quick-form')saveQuick(e.target);else if(e.target.id==='natural-form')showInterpret(e.target.querySelector('#natural-text').value);else if(e.target.id==='draft-form')handleSaveDraft(e.target);else if(e.target.id==='query-form')showQuery(e.target.querySelector('#query-text').value);else if(e.target.id==='snapshot-form')saveSnapshot(e.target);else if(e.target.id==='new-pocket-form')createCatalog(e.target,'pocket');else if(e.target.id==='new-investment-form')createCatalog(e.target,'investment');else if(e.target.matches('.rename-form'))renameCatalog(e.target)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e});
window.addEventListener('appinstalled',()=>{installedPrompt=null;notify('Aplicativo adicionado à tela inicial!')});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
