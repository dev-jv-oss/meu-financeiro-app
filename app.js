import {openLocalStore} from './storage.mjs?v=1.9.1-audit';
import {configured,connected,email,profile,mountGoogle,apiRequest,bootstrapProfile,logoff,storeClientId,getClientId,getApiUrl} from './api.mjs?v=1.9.1-audit';
import {interpret,money,norm,round2} from './parser.mjs?v=1.9.1-audit';
import {makeDraft,TYPES,ACCOUNT_OPTIONS,OTHER_ACCOUNT,POCKETS,EXPENSE_CATS,INCOME_CATS,METHODS,INVESTMENTS,BANKS,BANK_OPTIONS,OTHER_BANK,formatCentavos} from './operacoes.mjs?v=1.9.1-audit';
import {localPosition,migrate,active,canon,isValidName,positionOverview,getPosition,pocketBalance,investmentBalance,mayArchive,canDelete,displayPocket,displayBank,YIELD_MODES,validateYield,yieldLabel} from './catalogo.mjs?v=1.9.1-audit';
import {estimatePosition,positionDisplay,validateConditions,liquidityModes,settlementModes,validISO,daysBetween,defaultTax} from './rendimentos.mjs?v=1.9.1-audit';
const VERSION='1.9.1-audit-transactions-hml';
const KEY='meu-financeiro-pwa-local-v1';
const main=document.querySelector('#main');
const toastEl=document.querySelector('#toast');
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maybeMoney=v=>v==null?'—':money(v);
const num=v=>{let s=String(v??'').trim();if(!s)return null;s=s.replace(/R\$|\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?round2(n):null};
const fresh=()=>migrate({drafts:[],snapshot:null});
const localStore=openLocalStore(localStorage,KEY,migrate,fresh);
let state=localStore.state,editingDraftId=null,route='inicio',pending=null,installedPrompt=null,activeOperation='despesa',entryMode='rapido';
function persist(){try{localStore.save(state);return true}catch(e){notify(e.message||'Não foi possível salvar. Verifique o armazenamento do navegador.');return false}}
function notify(t){toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(notify._id);notify._id=setTimeout(()=>toastEl.classList.remove('show'),4000)}
function navigate(r){route=r;pending=null;document.querySelectorAll('[data-route]').forEach(x=>x.classList.toggle('selected',x.dataset.route===r));render();window.scrollTo({top:0,behavior:'instant'})}
const card=(html)=>`<div class="card">${html}</div>`;
const label=(s)=>`<span class="eyebrow">${s}</span>`;
const alert=(localStore.blocked?'<div class="notice"><b>Dados locais protegidos.</b> A leitura falhou. Gravações bloqueadas para evitar perda de dados. Não limpe os dados do site; exporte uma cópia para recuperação.</div>':'')+`<div class="quiet-notice"><span class="lock" aria-hidden="true">◇</span><div><b>Homologação:</b> registros anteriores continuam locais. Os testes fictícios do D1 não são integrados ao seu patrimônio real.</div></div>`;
const pictos={despesa:'<path d="M6 18 18 6M8 6h10v10"/>',receita:'<path d="M6 6 18 18M18 8v10H8"/>',cofrinho:'<path d="M5 8h14v10H5zM9 12h6M9 5h6"/>',transferencia:'<path d="M4 8h16m-5-4 5 4-5 4M20 16H4m5-4-5 4 5 4"/>',aplicacao:'<path d="M4 20V12h4v8m4 0V8h4v12m4 0V4h2v16M3 20h20"/>',recarga:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',consultar:'<circle cx="12" cy="12" r="9"/><path d="M15 9c-.7-1-1.6-1.5-3-1.5-1.8 0-3 1-3 2.5 0 3.4 6 1.5 6 5 0 1.5-1.3 2.5-3 2.5-1.5 0-2.5-.6-3.3-1.7M12 5v14"/>'};
const iconSVG=(key)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${pictos[key]||pictos.consultar}</svg>`;
const localISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Porto_Velho',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function render(){const badge=document.querySelector('#net-status');if(badge){badge.innerHTML=connected()?'<span class="dot"></span> Conectado':'<span class="dot"></span> Local';}switch(route){case'inicio':return home();case'registrar':return register();case'consultar':return consult();case'rascunhos':return drafts();case'ajustes':return settings();case'patrimonio':return patrimonio();case'editar-registro':return editDraft();default:home()}}
function balanceText(x){return x?.total==null?'—':money(x.total)}
function balanceStatus(x){return x?.total==null?'Sem valores informados':x.partial?'Total parcial · dados manuais':'Valores informados manualmente'}
function assetLine(name,value,extra=''){return `<div class="asset-line"><span class="asset-line-name">${esc(name)}${extra?`<small>${esc(extra)}</small>`:''}</span><strong class="money">${maybeMoney(value)}</strong></div>`}
function home(){const sp=state.snapshot,overview=positionOverview(state,localISO()),draftCount=state.drafts.length;
 const items=[['despesa','Despesa','Gastos e recargas','q-expense'],['receita','Receita','Entradas de dinheiro','q-income'],['cofrinho','Cofrinhos','Guardar ou retirar','q-pocket'],['transferencia','Transferência','Entre contas próprias','q-transfer'],['aplicacao','Investimentos','Aplicar ou resgatar','q-invest']];
 const mpLabel=assetLine('Mercado Pago',overview.mp),interLabel=assetLine('Banco Inter',overview.inter);
 const pockets=overview.pockets.map(p=>assetLine(displayPocket(p.name),p.balance,`Cofrinho · Mercado Pago · ${yieldLabel(p)} · ${p.projectionSource==='estimated'?'estimado':'confirmado/manual'}`)).join('');
 const investments=overview.investments.map(p=>assetLine(p.name,p.balance,`${p.type} · ${displayBank(p.bank)} · ${yieldLabel(p)} · ${p.projectionSource==='estimated'?'estimado':'confirmado/manual'}`)).join('');
 main.innerHTML=`
 <section class="hero"><div class="hero-label">Total informado · contas + reservas</div>
   <div class="hero-val money">${balanceText(overview.total)}</div>
   <div class="hero-bottom"><div class="hero-chip">${balanceStatus(overview.total)}. Não é saldo bancário online.</div><button class="btn btn-white" type="button" data-do="snapshot">${sp?'Atualizar valores':'Informar saldos'}</button></div>
 </section>
 <div class="balance-grid">
  <details class="balance-panel"><summary><span><small>Disponível nos bancos</small><strong class="money">${balanceText(overview.banks)}</strong></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="balance-detail">${mpLabel}${interLabel}<div class="balance-foot">${balanceStatus(overview.banks)}. Dinheiro em espécie é contado separadamente no total geral, quando informado.</div></div></details>
  <details class="balance-panel"><summary><span><small>Cofrinhos + investimentos</small><strong class="money">${balanceText(overview.reserved)}</strong></span><span class="panel-chevron" aria-hidden="true">⌄</span></summary><div class="balance-detail">${pockets||'<p class="small muted">Nenhum cofrinho ativo.</p>'}${investments}${overview.investments.length?'':'<p class="small muted">Sem investimentos cadastrados.</p>'}<div class="balance-foot">${balanceStatus(overview.reserved)}</div></div></details>
 </div>
 <div class="balance-links"><button class="mini-link" data-do="snapshot">Editar saldos</button><button class="mini-link" data-route="patrimonio">Ver patrimônio →</button></div>
 ${alert}
 <div class="section-title">O que vamos fazer?</div>
 <div class="quickgrid">${items.map(([id,title,subtitle,style])=>`<button type="button" class="quick ${style}" ${id==='consultar'?'data-route="consultar"':`data-operation="${id}"`}><span class="qicon">${iconSVG(id)}</span><strong>${title}</strong><span class="subtitle">${subtitle}</span></button>`).join('')}</div>
 <div class="section-title">Visão rápida <small>Somente no aparelho</small></div>
 <div class="stats"><div class="stat"><div class="caption">Registros locais</div><div class="metric">${draftCount}</div><button class="mini-link" type="button" data-route="rascunhos">Ver registros →</button></div><div class="stat"><div class="caption">Sincronização oficial</div><div class="metric metric-sm">Desconectado</div><div class="caption">Saldo e cadastros são locais</div></div></div>
 <p class="secondary-note">Os totais combinam posições manuais e projeções calculáveis; estimativas não são extratos bancários e registros locais não atualizam os saldos bancários. Informe nos bancos somente os saldos livres, sem incluir valores já contabilizados nos cofrinhos e investimentos. Dinheiro em espécie, se informado, participa do total geral.</p>`;
}
const opLabels={despesa:'Despesa',receita:'Receita',cofrinho:'Cofrinho',transferencia:'Entre contas',aplicacao:'Investimento',recarga:'Despesa · recarga'};
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
function conditionsFields(item={},kind='investment'){
 const inferred=defaultTax(item.type|| (kind==='pocket'?'Cofrinho':'CDB'));
 const t={...inferred,...item};
 const checks=(name,checked,label)=>`<label class="checkline"><input type="checkbox" name="${name}" value="on" ${checked?'checked':''}> ${label}</label>`;
 return `<div class="finance-conditions"><div class="section-title">Resgate e impostos</div>
 ${fieldSelect('Liquidez','liquidity',liquidityModes,t.liquidity||'daily')}
 <div class="field conditional-finance" data-for-liquidity="grace"><label>Carência em dias (por aporte)</label><input class="input" type="number" min="1" max="36500" name="graceDays" value="${esc(t.graceDays||'30')}"></div>
 <div class="field conditional-finance" data-for-liquidity="maturity"><label>Vencimento</label><input class="input" type="date" name="maturityDate" value="${esc(t.maturityDate||'')}"></div>
 ${fieldSelect('Prazo para receber o resgate','settlement',settlementModes,t.settlement||'d0')}
 ${checks('irEnabled',t.irEnabled===true,'Incide Imposto de Renda (IR)')}
 <div data-ir-opts>${fieldSelect('Regime de IR','irMode',[['regressive','Regressivo de renda fixa'],['fixed','Alíquota fixa']],t.irMode||'regressive')}
 <div class="field" data-for-ir-fixed><label>Alíquota IR fixa (%)</label><input class="input" name="irFixed" inputmode="decimal" placeholder="Ex.: 15" value="${esc(t.irFixed??'')}"></div></div>
 ${checks('iofEnabled',t.iofEnabled===true,'Incide IOF nos primeiros 30 dias')}
 <p class="hint">Confirme as condições específicas do produto: fundos, Tesouro, promoções e produtos com regras especiais podem exigir um modelo diferente.</p></div>`;
}
function syncFinanceFields(scope=document){for(const form of scope.querySelectorAll('form')){
 const liq=form.querySelector('select[name="liquidity"]');if(liq)for(const el of form.querySelectorAll('[data-for-liquidity]')){const show=liq.value===el.dataset.forLiquidity;el.classList.toggle('is-hidden',!show);el.querySelectorAll('input').forEach(x=>x.disabled=!show)}
 const ir=form.querySelector('[name="irEnabled"]'),area=form.querySelector('[data-ir-opts]');if(area&&ir){area.classList.toggle('is-hidden',!ir.checked);area.querySelectorAll('select,input').forEach(x=>x.disabled=!ir.checked)}
 const mode=form.querySelector('select[name="irMode"]'),fixed=form.querySelector('[data-for-ir-fixed]');if(mode&&fixed){const show=!!ir?.checked&&mode.value==='fixed';fixed.classList.toggle('is-hidden',!show);fixed.querySelectorAll('input').forEach(x=>x.disabled=!show)}
 }}
function readConditions(form,kind,type,old={}){
 const data=Object.fromEntries(new FormData(form));
 data.irEnabled=!!form.querySelector('[name="irEnabled"]')?.checked;
 data.iofEnabled=!!form.querySelector('[name="iofEnabled"]')?.checked;
 const d=validateConditions(data,localISO(),{...defaultTax(type|| (kind==='pocket'?'Cofrinho':'CDB')),...old});return d;
}
function rateFields(item=null,scope='form',kind='investment'){
 const editing=!!item;item=item||{};const uid=esc(item.id||scope),rateType=item.rateType||(editing?'':'cdi'),rate=item.rateValue==null?'':String(item.rateValue).replace('.',',');
 const modeSelect=fieldSelect('Modalidade de rendimento','rateType',YIELD_MODES,rateType).replaceAll('quick-rateType',`rate-${uid}-type`);
 return `<div class="field"><label for="rate-${uid}-date">Data inicial do produto</label><input type="date" class="input" name="startedAt" id="rate-${uid}-date" value="${esc(item.startedAt||(editing?'':localISO()))}"></div>${modeSelect}
 <div class="field rate-value-wrap ${!rateType||rateType==='none'?'is-hidden':''}" data-rate-value><label for="rate-${uid}-value">Percentual / taxa contratada</label><input class="input" name="rateValue" id="rate-${uid}-value" type="text" inputmode="decimal" placeholder="Ex.: 120 (% CDI) ou 4,5 (% ao ano)" value="${esc(rate)}" ${!rateType||rateType==='none'?'disabled':''}><p class="hint">CDI exige referência manual recente; IPCA e modalidades especiais não serão calculados sem dados suficientes.</p></div>
 <div class="field ${rateType==='other'?'':'is-hidden'}" data-rate-description><label>Descrição da modalidade</label><input class="input" name="rateDescription" value="${esc(item.rateDescription||'')}" placeholder="Ex.: taxa variável / promoção" maxlength="120" ${rateType==='other'?'':'disabled'}></div>
 ${conditionsFields(item,kind)}`;
}
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
 const recharge=form.querySelector('#recharge-recipient-wrap'),category=form.elements.namedItem('category');if(recharge){const show=(activeOperation==='recarga'||(activeOperation==='despesa'&&category?.value==='Recarga de celular'));recharge.classList.toggle('is-hidden',!show);recharge.querySelectorAll('input,select').forEach(x=>{x.disabled=!show});}
 for(const area of form.querySelectorAll('[data-rate-set]')){const chooser=area.querySelector('[name="rateType"]');if(!chooser)continue;const value=area.querySelector('[data-rate-value]'),detail=area.querySelector('[data-rate-description]');if(value){value.classList.toggle('is-hidden',!chooser.value||chooser.value==='none');value.querySelector('input').disabled=!chooser.value||chooser.value==='none';}if(detail){detail.classList.toggle('is-hidden',chooser.value!=='other');detail.querySelector('input').disabled=chooser.value!=='other';}}
 for(const [selectName,wrapId] of [['pocket','new-pocket-wrap'],['investment','new-investment-wrap']]){const w=form.querySelector('#'+wrapId),v=form.elements.namedItem(selectName);if(w){const show=v?.value==='__new__';w.classList.toggle('is-hidden',!show);w.querySelectorAll('input,select').forEach(x=>{x.disabled=!show});}}
 const investmentSelect=form.elements.namedItem('investment'),investFields=form.querySelector('#investment-fields-wrap');if(investFields&&investmentSelect){const known=investmentSelect.value!==''&&investmentSelect.value!=='__new__';investFields.classList.toggle('is-hidden',known);investFields.querySelectorAll('input,select').forEach(x=>x.disabled=known);}
 for(const w of form.querySelectorAll('[data-other-for]')){const select=form.elements.namedItem(w.dataset.otherFor);if(select)w.querySelector('input').disabled=(select.value!==(w.dataset.otherFor==='bank'?OTHER_BANK:w.dataset.otherFor==='recipient'?'Outro contato':OTHER_ACCOUNT))||!!w.closest('.is-hidden');}

}
function renderEntry(){const target=document.querySelector('#entry-area');if(!target)return;
 if(entryMode==='texto'){
  target.innerHTML=card(`<form id="natural-form"><div class="field"><label for="natural-text">Descreva a movimentação</label><textarea id="natural-text" class="textarea" maxlength="400" placeholder="Ex.: paguei 30 da viagem escolar pix Mercado Pago"></textarea></div><button class="btn btn-block" type="submit">Interpretar mensagem →</button></form><div class="sample-wrap"><button class="sample" data-sample="gastei 48 em duas marmitas pix Mercado Pago">Marmitas</button><button class="sample" data-sample="coloquei 0,04 cofrinho gasolina Mercado Pago">Aporte</button><button class="sample" data-sample="rendeu 6 centavos Mercado Pago">Rendimento</button></div>`)+`<div id="parse-display"></div>`;
 }else renderQuick();
}
function renderQuick(preserve={}){const target=document.querySelector('#entry-area');if(!target)return;
 let op=activeOperation;
 let typeOptions=TYPES.filter(x=>x!=='recarga').map(x=>[x,opLabels[x]]);
 let fields='';
 if(op==='despesa'||op==='receita'||op==='recarga'){
  if(op!=='recarga')fields+=fieldSelect('Categoria','category',op==='receita'?INCOME_CATS:EXPENSE_CATS);
  if(op!=='receita')fields+=`<div id="recharge-recipient-wrap" class="is-hidden">${fieldSelect('Quem receberá a recarga?','recipient',['Meu celular','Ísis','Outro contato'])}${otherField('recipient','Nome do contato')}<p class="hint">Recarga é uma despesa comum, com destinatário. Não realizamos a recarga no aparelho.</p></div>`;
  fields+=accountField(op==='receita'?'Conta que recebeu':'Conta utilizada','account');
  fields+=`<div id="quick-method-wrap">${fieldSelect(op==='receita'?'Forma de recebimento':'Forma de pagamento','method',METHODS)}</div>`;
  fields+=`<div id="quick-cash-info" class="explain-transfer is-hidden">Dinheiro em espécie selecionado. Não precisa escolher uma forma de pagamento ou recebimento.</div>`;
  fields+=`<div class="field"><label for="quick-description">Descrição (opcional)</label><input id="quick-description" class="input" name="description" maxlength="200" placeholder="Ex.: almoço, salário, presente"></div>`;
 }else if(op==='cofrinho'){
  fields+=fieldSelect('Qual cofrinho?','pocket',[...active(state.pockets).map(p=>[p.id,displayPocket(p.name)]),['__new__','＋ Criar novo cofrinho']]);
  fields+=`<div id="new-pocket-wrap" class="conditional-other is-hidden"><div class="field"><label for="new-pocket-name">Nome do novo cofrinho</label><input id="new-pocket-name" class="input" name="newPocketName" maxlength="80" placeholder="Ex.: Viagem de férias" disabled></div><div data-rate-set>${rateFields(null,'quick-pocket','pocket')}</div><p class="hint">Será cadastrado neste aparelho quando você salvar o registro local.</p></div>`;
  fields+=fieldSelect('Operação','direction',[['aporte','Guardar dinheiro (aporte)'],['resgate','Retirar dinheiro (resgate)']]);
  fields+=`<div class="explain-transfer"><b>Conta: Mercado Pago (automático)</b><span>Ao guardar: Mercado Pago → cofrinho. Ao retirar: cofrinho → Mercado Pago. Não é despesa nem receita.</span></div>`;
 }else if(op==='transferencia'){
  fields+=accountField('Conta de origem','fromAccount');
  fields+=accountField('Conta de destino','toAccount');
  fields+=`<div class="explain-transfer">Transferência entre contas próprias. Não é receita nem despesa.</div>`;
 }else if(op==='aplicacao'){
  fields+=fieldSelect('Operação','direction',[['aporte','Aplicar dinheiro'],['resgate','Resgatar aplicação']]);
  fields+=fieldSelect('Qual investimento?','investment',[...active(state.investments).map(i=>[i.id,`${i.name} · ${displayBank(i.bank)}`]),['__new__','＋ Criar novo investimento']]);
  fields+=`<div id="new-investment-wrap" class="conditional-other is-hidden"><div class="field"><label for="new-investment-name">Nome desta aplicação</label><input id="new-investment-name" class="input" name="newInvestmentName" maxlength="80" placeholder="Ex.: CDB Reserva de emergência" disabled></div><div data-rate-set>${rateFields(null,'quick-investment','investment')}</div></div>`;
  fields+=`<div id="investment-fields-wrap">`;
  fields+=fieldSelect('Instituição do investimento','bank',BANK_OPTIONS);
  fields+=otherField('bank','Nome da instituição');
  fields+=fieldSelect('Tipo de investimento','investmentType',INVESTMENTS);
  fields+=`</div>`;
  fields+=accountField('Conta de origem / recebimento (confira)','account',ACCOUNT_OPTIONS.filter(([id])=>id!=='Dinheiro'));
  fields+=`<div class="explain-transfer">Aplicação: sai da conta para o investimento. Resgate: volta para a conta. O produto específico e os rendimentos precisarão de conferência.</div>`;
 }
 target.innerHTML=`<div class="card"><div class="form-hero"><span class="form-hero-icon">${{despesa:'↗',receita:'↘',cofrinho:'◇',transferencia:'⇄',aplicacao:'▥',recarga:'▣'}[op]}</span><div><div class="form-hero-title">${opLabels[op]}</div><div class="form-hero-copy">Registre uma movimentação já realizada.</div></div></div><form id="quick-form" novalidate>
  <div class="field"><label for="quick-operation">Tipo de operação</label>${sel('operation',typeOptions,op,'Selecione').replace('name="operation"','id="quick-operation" name="operation"')}</div>
  <div class="field"><label for="quick-amount">Valor (R$)</label><input id="quick-amount" class="input quick-amount" name="amount" inputmode="numeric" type="text" autocomplete="off" value="0,00" data-centavos required aria-describedby="amount-hint"><p class="hint" id="amount-hint">Digite apenas os números: 3590 vira 35,90.</p></div>
  ${fields}
  <details class="more-details"><summary>Data e observações</summary><div class="field"><label for="quick-date">Data da movimentação</label><input id="quick-date" class="input" type="date" name="date" value="${localISO()}" required></div><div class="field"><label for="quick-note">Observações (opcional)</label><textarea id="quick-note" class="textarea" name="note" maxlength="300" placeholder="Informações adicionais"></textarea></div></details>
  <div id="quick-feedback" role="alert" aria-live="polite"></div>
  <div class="safety-tip"><span aria-hidden="true">◇</span><span>O registro é efetivo no controle local. A sincronização oficial depende de autenticação e de validação contábil; não movimenta seu banco.</span></div>
  <button class="btn btn-block" type="submit">Registrar movimentação →</button>
 </form></div>`;
 for(const name of ['amount','date','note']){if(preserve[name]!=null){const input=target.querySelector(`[name="${name}"]`);if(input)input.value=name==='amount'?formatCentavos(preserve[name]):preserve[name];}}
 syncQuickConditional();syncFinanceFields(target);
}

function newId(prefix){return `${prefix}-${globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(36).slice(2)}`}
function saveQuick(form){
 const data=Object.fromEntries(new FormData(form));let created=null,investment=null;
 if(data.operation==='cofrinho'){
  if(data.pocket==='__new__'){
   const name=(data.newPocketName||'').trim().replace(/\s+/g,' ');
   if(!isValidName(name)){notify('Dê um nome ao novo cofrinho (2 a 80 caracteres).');return}
   if(state.pockets.some(p=>canon(displayPocket(p.name))===canon(displayPocket(name)))){notify('Já existe cofrinho com este nome, inclusive entre os arquivados.');return}
   const yieldData=validateYield(data,localISO());if(!yieldData.ok){notify(yieldData.error);return}
   const condition=readConditions(form,'pocket');if(!condition.ok){notify(condition.error);return}
   created={id:newId('p'),name:displayPocket(name),status:'active',...yieldData,...condition,lots:[]};data.pocket=created.name;data.pocketId=created.id;
  }else{const p=active(state.pockets).find(p=>p.id===data.pocket);if(!p){notify('Selecione um cofrinho ativo.');return}data.pocket=p.name;data.pocketId=p.id;}
 }else if(data.operation==='aplicacao'){
  if(data.investment==='__new__'){
   const name=(data.newInvestmentName||'').trim().replace(/\s+/g,' ');
   if(!isValidName(name)){notify('Informe um nome para a nova aplicação (2 a 80 caracteres).');return}
   const bankName=data.bank===OTHER_BANK?data.bankName:data.bank;
   if(!bankName||!data.investmentType){notify('Informe instituição e tipo do investimento.');return}
   if(state.investments.some(x=>canon(x.name)===canon(name)&&canon(x.bank)===canon(bankName))){notify('Esse investimento já está cadastrado, inclusive entre os encerrados.');return}
   const yieldData=validateYield(data,localISO());if(!yieldData.ok){notify(yieldData.error);return}
   const condition=readConditions(form,'investment',data.investmentType);if(!condition.ok){notify(condition.error);return}
   investment={id:newId('inv'),name,bank:bankName,bankType:data.bank,bankName:data.bankName||'',type:data.investmentType,status:'active',...yieldData,...condition,lots:[]};
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
 const d={...r.draft};d.id=newId('draft');d.createdAt=new Date().toISOString();d.state='EFETIVO LOCAL';d.syncStatus='LOCAL';d.source='app-v1.9.1-audit-form';
 const previous={...state,drafts:[...state.drafts],pockets:[...state.pockets],investments:[...state.investments]};
 if(created)state.pockets.push(created);
 if(data.operation==='aplicacao'&&data.investment==='__new__')state.investments.push(investment);
 const asset=d.operation==='aplicacao'?investment:d.operation==='cofrinho'?(created||state.pockets.find(p=>p.id===d.pocketId)):null;
 const oldLots=asset?[...(asset.lots||[])]:null;
 if(asset&&d.direction==='aporte')asset.lots=[...(asset.lots||[]),{id:newId('lot'),amount:d.amount,date:d.date,sourceDraftId:d.id}];
 state.drafts.unshift(d);
 if(!persist()){if(asset)asset.lots=oldLots;state=previous;return}
 notify('Movimentação salva somente neste aparelho. Envio ao D1 desativado.');navigate('rascunhos');
}
function saveLocalDraft(d){const previous=[...state.drafts];state.drafts.unshift(d);if(!persist()){state.drafts=previous;return false;}return true;}
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
function consult(){const s=state.snapshot,o=positionOverview(state,localISO());
 const cards=[['Mercado Pago',o.mp],['Banco Inter',o.inter],['Dinheiro em espécie',o.cash],...o.pockets.map(p=>[displayPocket(p.name)+' · Cofrinho',p.balance]),...o.investments.map(a=>[`${a.name} · ${a.type} · ${displayBank(a.bank)}`,a.balance]),['Fatura Mercado Pago',s?.faturaMp],['Fatura Banco Inter',s?.faturaInter],['Limite Mercado Pago',s?.limiteMp],['Limite Banco Inter',s?.limiteInter]];
 main.innerHTML=`<div class="page-intro">${label('Acompanhamento')}<h1 class="heading">Saldos e faturas</h1><p class="lede">Posições preenchidas por você. Não há conexão com bancos ou com o Google Sheets.</p></div>${alert}
  <div class="bankgrid">${cards.map(([title,value])=>`<div class="bank"><div class="bank-label">${esc(title)}</div><div class="bank-value money">${maybeMoney(value)}</div><small>${s?'Estimativa ou dado manual':'Não informado'}</small></div>`).join('')}</div>
  <div class="flex-wrap-row mt-14"><button class="btn btn-secondary" data-do="snapshot">Atualizar valores</button><button class="btn btn-ghost" data-route="patrimonio">Gerenciar cadastros</button></div>
  ${card(`<form id="query-form"><div class="field"><label for="query-text">Consultar por mensagem (opcional)</label><input id="query-text" class="input" maxlength="150" placeholder="Ex.: saldo Mercado Pago"></div><button class="btn btn-block" type="submit">Consultar</button></form><div class="sample-wrap">${['saldo Mercado Pago','saldo cofrinho fortaleza','limite disponível Banco Inter','fatura atual Mercado Pago'].map(x=>`<button class="sample" data-query="${esc(x)}">${esc(x)}</button>`).join('')}</div><div id="query-out"></div>`)}`;
}
function showQuery(text){const p=interpret(text),target=document.querySelector('#query-out');if(!target)return;
 const s=state.snapshot;
 if(p.status!=='consulta'){target.innerHTML='<div class="notice">Não reconheci uma consulta. Para lançar use Registrar.</div>';return}
 if(!s){target.innerHTML='<div class="notice">Nenhum saldo informado. Preencha seus valores manuais primeiro.</div>';return}
 let val=null,labelText='',extra='';
 if(p.kind==='saldo'){
  if(p.pocket){const needle=canon(p.pocket),found=state.pockets.find(x=>canon(x.name).includes(needle)||needle.includes(canon(x.name).replace(/^cofrinho /,'')));
   if(found){const projected=localPosition(state,found,pocketBalance(state,found),localISO());val=projected.value;labelText=found.name;extra=projected.source==='estimated'?'Valor líquido estimado, não saldo bancário confirmado.':'Última posição manual; não há projeção calculável.';}else extra='Cofrinho não reconhecido nesta posição local.';
  }else if(p.account==='Mercado Pago — saldo'){val=getPosition(s,'mp');labelText='Mercado Pago';}
  else if(p.account==='Inter'){val=getPosition(s,'inter');labelText='Banco Inter';}
  else extra='Indique uma conta ou cofrinho específico.';
 }else if(p.kind==='limite'){val=p.account==='Inter'?getPosition(s,'limiteInter'):p.account==='Mercado Pago — saldo'?getPosition(s,'limiteMp'):null;labelText=`Limite disponível ${displayBank(p.account||'')}`;}
 else if(p.kind==='fatura'){labelText=`Fatura atual ${displayBank(p.account||'')}`;if(p.period)extra='A posição local não possui faturas por competência.';else val=p.account==='Inter'?getPosition(s,'faturaInter'):p.account==='Mercado Pago — saldo'?getPosition(s,'faturaMp'):null;}
 target.innerHTML=`<div class="card"><span class="pill neutral">Consulta local</span><h3>${esc(labelText||'Consulta')}</h3><div class="heading money">${maybeMoney(val)}</div><p class="hint">${esc(extra||'Última posição digitada neste aparelho: '+(s.date||'sem data')+'. Não equivale ao saldo bancário atual.')}</p></div>`;
}
function niceDate(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return String(iso||'');const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
function patrimonio(){
 const o=positionOverview(state,localISO());
 const manager=(items,kind)=>items.map(item=>{
  const confirmed=kind==='pocket'?pocketBalance(state,item):investmentBalance(state,item);const projection=localPosition(state,item,confirmed,localISO());const bal=projection.value;
  const count=state.drafts.filter(d=>kind==='pocket'?(d.pocketId===item.id||(!d.pocketId&&canon(d.pocket)===canon(item.name))):d.investmentId===item.id).length;
  const heading=kind==='investment'?`${item.type} · ${displayBank(item.bank)}`:'Cofrinho · Mercado Pago';
  const shown=kind==='pocket'?displayPocket(item.name):item.name;
  const rateText=yieldLabel(item);
  const started=item.startedAt?` · desde ${niceDate(item.startedAt)}`:' · data inicial não informada';
  return `<div class="asset-manager"><div class="asset-row"><div><b>${esc(shown)}</b><small>${esc(heading)} · ${count} registro(s) local(is)${item.status==='archived'?' · Arquivado':''}</small><small>${esc(rateText+started)}</small></div><div class="asset-position"><strong class="money">${maybeMoney(bal)}</strong><small>${projection.source==='estimated'?'Líquido estimado':projection.source==='confirmed'?'Último confirmado':'Capital informado / sem projeção'}</small></div></div>
  <details class="asset-manage-detail"><summary>Gerenciar</summary>
   <form class="rename-form" data-rename-kind="${kind}" data-rename-id="${esc(item.id)}"><div class="field"><label>Nome de exibição</label><input class="input" name="newName" value="${esc(shown)}" maxlength="80" required></div><div data-rate-set>${rateFields(item,'edit-'+item.id,kind)}</div><button class="btn btn-secondary" type="submit">Salvar cadastro</button></form>
  ${projection.source==='estimated'?`<div class="valuation-details"><div><span>Capital</span><b>${money(projection.principal)}</b></div><div><span>Bruto estimado</span><b>${money(projection.gross)}</b></div><div><span>IR estimado</span><b>− ${money(projection.ir)}</b></div><div><span>IOF estimado</span><b>− ${money(projection.iof)}</b></div><div><span>Elegível a D+0*</span><b>${money(projection.immediatelyAvailable)}</b></div><div><span>Último confirmado</span><b>${maybeMoney(confirmed)} · ${esc(state.snapshot?.date||'sem data')}</b></div></div><p class="hint">*D+0 indica prazo cadastrado; feriados, horários de corte e disponibilidade real não foram verificados. ${projection.approx?'Simulação aproximada; pode divergir do extrato bancário.':'Projeção matemática, não extrato bancário.'}</p>`:`<p class="notice">Projeção indisponível: ${esc(projection.projectionError||'sem dados')}. Valor exibido vem da última posição manual, quando existente.</p>`}
  <div class="lot-management"><h4>Capital de referência · aportes confirmados</h4><p class="hint">Inclua somente valores efetivamente aplicados que ainda estão investidos. Aportes locais vinculados também podem compor os lotes. Não conte o mesmo aporte duas vezes.</p>
   ${(item.lots||[]).map(l=>`<div class="lot-line"><span>${money(l.amount)} · ${esc(niceDate(l.date))}</span><button class="mini-link" type="button" data-lot-delete="${esc(l.id)}" data-lot-asset="${esc(item.id)}" data-lot-kind="${kind}">Remover</button></div>`).join('')}
   <form class="lot-form" data-lot-asset="${esc(item.id)}" data-lot-kind="${kind}"><div class="field"><label>Capital ainda aplicado (R$)</label><input class="input" name="amount" inputmode="decimal" placeholder="Ex.: 1000,00" required></div><div class="field"><label>Data do aporte</label><input class="input" name="date" type="date" max="${localISO()}" value="${esc(item.startedAt||localISO())}" required></div><button class="btn btn-secondary" type="submit">Adicionar aporte à base de cálculo</button></form>
   <p class="hint">Resgates ainda exigem ajuste manual da base de cálculo. Não use projeção se houver resgates não refletidos nos aportes acima.</p>
  </div>
   <div class="flex-wrap-row asset-actions"><button class="btn btn-ghost" type="button" data-asset-act="${item.status==='archived'?'reactivate':'archive'}" data-asset-kind="${kind}" data-asset-id="${esc(item.id)}">${item.status==='archived'?'Reativar':'Arquivar'}</button><button class="btn btn-red" type="button" data-asset-act="delete" data-asset-kind="${kind}" data-asset-id="${esc(item.id)}">Excluir cadastro</button></div>
   <p class="hint">Arquivar oculta do formulário, preservando o histórico. A exclusão definitiva só é permitida quando não há registros vinculados nem saldo.</p>
  </details></div>`;
 }).join('');
 main.innerHTML=`<div class="page-intro">${label('Organização do patrimônio')}<h1 class="heading">Cofrinhos e investimentos</h1><p class="lede">Cadastros locais. Saldos são posições manuais ou projeções de aportes-base informados; os registros não são conciliados automaticamente com os saldos.</p></div>${alert}
 <div class="card asset-section"><div class="spaced section-title"><span>Cofrinhos ativos</span><button class="mini-link" data-do="snapshot">Editar saldos</button></div>
 ${manager(active(state.pockets),'pocket')||'<p class="small muted">Nenhum cofrinho ativo.</p>'}
 <details class="new-asset"><summary>＋ Criar cofrinho</summary><form id="new-pocket-form"><div class="field"><label>Nome do cofrinho</label><input name="name" class="input" required maxlength="80" placeholder="Ex.: Reserva de emergência"></div><div data-rate-set>${rateFields(null,'create-pocket','pocket')}</div><button class="btn btn-block" type="submit">Cadastrar cofrinho</button></form></details></div>
 <div class="card asset-section"><div class="section-title">Investimentos ativos</div>
 ${manager(active(state.investments),'investment')||'<p class="small muted">Nenhum investimento cadastrado.</p>'}
 <details class="new-asset"><summary>＋ Criar investimento</summary><form id="new-investment-form"><div class="field"><label>Nome do investimento</label><input name="name" class="input" required maxlength="80" placeholder="Ex.: CDB liquidez diária"></div>${fieldSelect('Instituição','bank',BANK_OPTIONS)}${otherField('bank','Nome da instituição')}${fieldSelect('Tipo','investmentType',INVESTMENTS)}<div data-rate-set>${rateFields(null,'create-investment','investment')}</div><button class="btn btn-block" type="submit">Cadastrar investimento</button></form></details></div>
 <details class="archived-assets"><summary>Cadastros arquivados (${state.pockets.filter(x=>x.status==='archived').length+state.investments.filter(x=>x.status==='archived').length})</summary>${manager(state.pockets.filter(x=>x.status==='archived'),'pocket')}${manager(state.investments.filter(x=>x.status==='archived'),'investment')||''}</details>
 <p class="secondary-note">Resgatar o valor total não arquiva automaticamente. Antes de encerrar, reconcilie a posição no controle oficial e confirme saldo zero.</p>`;syncFinanceFields(main);
}
function createCatalog(form,kind){
 const data=Object.fromEntries(new FormData(form)),name=(data.name||'').trim().replace(/\s+/g,' ');
 if(!isValidName(name)){notify('Informe um nome entre 2 e 80 caracteres.');return}
 const yieldData=validateYield(data,localISO());if(!yieldData.ok){notify(yieldData.error);return}
 const condition=readConditions(form,kind,data.investmentType);if(!condition.ok){notify(condition.error);return}
 let item,collection;
 if(kind==='pocket'){
  collection=state.pockets;
  if(collection.some(p=>canon(displayPocket(p.name))===canon(displayPocket(name)))){notify('Já existe cofrinho com esse nome, inclusive arquivado.');return}
  item={id:newId('p'),name:displayPocket(name),status:'active',...yieldData,...condition,lots:[]};
 }else{
  collection=state.investments;
  const bank=data.bank===OTHER_BANK?(data.bankName||'').trim():data.bank;
  if(!bank||!BANKS.includes(data.bank)||!INVESTMENTS.includes(data.investmentType)){notify('Informe instituição e tipo válido.');return}
  if(collection.some(p=>canon(p.name)===canon(name)&&canon(p.bank)===canon(bank))){notify('Já existe investimento com esse nome e banco.');return}
  item={id:newId('inv'),name,bank,bankType:data.bank,bankName:data.bankName||'',type:data.investmentType,status:'active',...yieldData,...condition,lots:[]};
 }
 collection.push(item);if(!persist()){collection.pop();return}
 notify('Cadastro criado neste aparelho.');patrimonio();
}
function renameCatalog(form){
 const kind=form.dataset.renameKind,id=form.dataset.renameId,collection=kind==='pocket'?state.pockets:state.investments;
 const item=collection.find(x=>x.id===id),data=Object.fromEntries(new FormData(form)),name=(data.newName||'').trim().replace(/\s+/g,' ');
 if(!item||!isValidName(name)){notify('Informe um nome válido de 2 a 80 caracteres.');return}
 if(collection.some(x=>x.id!==id&&canon(kind==='pocket'?displayPocket(x.name):x.name)===canon(kind==='pocket'?displayPocket(name):name)&&(kind==='pocket'||canon(x.bank)===canon(item.bank)))){notify('Já existe cadastro com esse nome.');return}
 let changes={};if(data.rateType||data.startedAt){const r=validateYield(data,localISO());if(!r.ok){notify(r.error);return}changes=r;}const condition=readConditions(form,kind,item.type,item);if(!condition.ok){notify(condition.error);return}changes={...changes,...condition};
 const before={...item};Object.assign(item,{name:kind==='pocket'?displayPocket(name):name},changes);
 if(!persist()){Object.assign(item,before);return}
 notify('Cadastro atualizado, sem apagar o histórico.');patrimonio();
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
function saveLot(form){const kind=form.dataset.lotKind,id=form.dataset.lotAsset,items=kind==='pocket'?state.pockets:state.investments,item=items.find(x=>x.id===id);if(!item)return;
 const raw=new FormData(form),amount=num(raw.get('amount')),date=raw.get('date');if(!amount||amount<=0||!validISO(date)||date>localISO()){notify('Informe valor positivo e data não futura.');return}
 if(!confirm('Confirmar que este capital está efetivamente aplicado e ainda não está refletido em outro aporte-base? Não será criada uma transferência ou despesa.'))return;
 const before=[...(item.lots||[])];item.lots=[...before,{id:newId('lot'),amount,date}];if(!persist()){item.lots=before;return}notify('Aporte-base armazenado; projeção recalculada.');patrimonio();}
function removeLot(kind,assetId,lotId){const item=(kind==='pocket'?state.pockets:state.investments).find(x=>x.id===assetId);if(!item||!item.lots?.some(x=>x.id===lotId))return;
 if(!confirm('Remover este aporte-base da projeção? Isso NÃO estorna lançamentos, nem altera sua conta bancária.'))return;
 const before=item.lots;item.lots=before.filter(x=>x.id!==lotId);if(!persist()){item.lots=before;return}notify('Base de cálculo atualizada.');patrimonio();}
function saveReference(form){const d=Object.fromEntries(new FormData(form)),n=String(d.cdiAnnual||'').trim().replace(',','.');if(n&&!/^\d+(?:\.\d{1,4})?$/.test(n)){notify('Taxa CDI inválida.');return}
 const rate=n?Number(n):null;if(rate!==null&&(rate<=0||rate>100)){notify('Informe percentual CDI anual plausível.');return}
 if(rate!==null&&(!validISO(d.cdiUpdatedAt)||d.cdiUpdatedAt>localISO())){notify('Data da taxa inválida.');return}
 const old=state.referenceRates;state.referenceRates=rate===null?{}:{cdiAnnual:rate,cdiUpdatedAt:d.cdiUpdatedAt};if(!persist()){state.referenceRates=old;return}notify('Referência manual salva; não é cotação oficial.');settings();}
function editAccount(label,name,selected,custom){return fieldSelect(label,name,ACCOUNT_OPTIONS,selected)+otherField(name,'Nome do banco').replace('placeholder="Digite o nome"',`placeholder="Digite o nome" value="${esc(custom||'')}"`)}
function editDraft(){const d=state.drafts.find(x=>x.id===editingDraftId);if(!d){navigate('rascunhos');return}
 const kind=d.operation||d.kind||'revisao',simple=['despesa','receita','recarga'].includes(kind),special=['cofrinho','transferencia','aplicacao'].includes(kind),cats=kind==='receita'?INCOME_CATS:EXPENSE_CATS;
 let specialFields='';
 if(simple){specialFields+=fieldSelect('Categoria','category',cats,d.category);
  specialFields+=editAccount('Conta','account',d.account,d.accountName);
  specialFields+=fieldSelect('Forma de pagamento ou recebimento','method',METHODS,d.method==='Dinheiro'?'':d.method);
  specialFields+=`<div id="edit-recharge-fields" class="${d.category==='Recarga de celular'?'':'is-hidden'}">${fieldSelect('Destinatário da recarga','recipient',['Meu celular','Ísis','Outro contato'],d.recipientType||'')}${otherField('recipient','Nome do contato').replace('placeholder="Digite o nome"',`placeholder="Digite o nome" value="${esc(d.recipient||'')}"`)}</div>`;
 }else if(kind==='cofrinho'){
  const selected=d.pocketId||state.pockets.find(x=>canon(x.name)===canon(d.pocket))?.id||'';
  specialFields+=fieldSelect('Cofrinho','pocket',state.pockets.map(p=>[p.id,displayPocket(p.name)]),selected);
  specialFields+=fieldSelect('Direção','direction',[['aporte','Guardar no cofrinho'],['resgate','Resgatar do cofrinho']],d.direction);
 }else if(kind==='transferencia'){
  specialFields+=editAccount('Origem','fromAccount',d.fromAccountType||d.fromAccount,d.fromAccountName);
  specialFields+=editAccount('Destino','toAccount',d.toAccountType||d.toAccount,d.toAccountName);
 }else if(kind==='aplicacao'){
  specialFields+=fieldSelect('Investimento','investment',state.investments.map(x=>[x.id,x.name+' · '+displayBank(x.bank)]),d.investmentId||'');
  specialFields+=fieldSelect('Direção','direction',[['aporte','Aplicar'],['resgate','Resgatar']],d.direction);
  specialFields+=editAccount('Conta de liquidação','account',d.account,d.accountName);
 }
 main.innerHTML=`<div class="page-intro">${label('Registro local')}<h1 class="heading">Editar registro</h1><p class="lede">As alterações mantêm o ID e um histórico local de revisões. Nenhuma edição afeta o banco ou a planilha oficial.</p></div>${alert}
 ${card(`<form id="edit-draft-form"><div class="field"><label>Operação</label><div class="input read-only">${esc(opLabels[kind]||kind)}</div></div>
 <div class="field"><label>Valor (R$)</label><input class="input" name="amount" inputmode="decimal" value="${esc(String(d.amount).replace('.',','))}" required></div>
 <div class="field"><label>Data efetiva</label><input type="date" class="input" name="date" max="${localISO()}" value="${esc(d.date||localISO())}" required></div>
 ${specialFields}
 <div class="field"><label>Descrição</label><input class="input" name="description" value="${esc(d.description||'')}" maxlength="400"></div>
 <div class="field"><label>Observações</label><textarea class="textarea" name="note" maxlength="1000">${esc(d.note||'')}</textarea></div>
 ${!simple&&!special?'<p class="notice">Registro legado com campos de operação não compatíveis com o formulário rápido. Somente valor, data e textos são editáveis aqui.</p>':''}
 <button class="btn btn-block" type="submit">Salvar alterações</button><button class="btn btn-ghost btn-block" type="button" data-route="rascunhos">Cancelar</button></form>`)}`;
 syncEditFields();
}
function syncEditFields(){const form=document.querySelector('#edit-draft-form');if(!form)return;
 const category=form.querySelector('[name=category]'),recharge=form.querySelector('#edit-recharge-fields');if(recharge){const show=category?.value==='Recarga de celular';recharge.classList.toggle('is-hidden',!show);for(const e of recharge.querySelectorAll('input,select'))e.disabled=!show;}
 for(const wrap of form.querySelectorAll('[data-other-for]')){
  const name=wrap.dataset.otherFor,sel=form.elements.namedItem(name),input=wrap.querySelector('input'),show=sel?.value===(name==='recipient'?'Outro contato':OTHER_ACCOUNT)&&!wrap.parentElement.closest('.is-hidden');
  wrap.classList.toggle('is-hidden',!show);input.disabled=!show;
 }
 const cash=form.querySelector('[name=account]')?.value==='Dinheiro',method=form.querySelector('[name=method]');if(method)method.disabled=cash;
}
function saveEditedDraft(form){const i=state.drafts.findIndex(x=>x.id===editingDraftId);if(i<0)return;const old=state.drafts[i];if(['IMPORTADO','REVISAO','ENVIANDO','ERRO','PROCESSANDO'].includes(old.syncStatus)){notify('Operação já enviada. Para corrigir um lançamento oficial é necessária retificação auditável.');return;}const raw=Object.fromEntries(new FormData(form)),val=num(raw.amount),kind=old.operation||old.kind;
 if(!val||val>1000000000||!validISO(raw.date)||raw.date>localISO()){notify('Confira valor e data.');return}
 let d={...old,amount:val,date:raw.date,description:String(raw.description||'').trim()||old.description,note:String(raw.note||'').trim()};
 if(['despesa','receita','recarga','cofrinho','transferencia','aplicacao'].includes(kind)){
  const params={...raw,operation:kind,amount:String(val),date:raw.date};
  if(['cofrinho','transferencia','aplicacao'].includes(kind)&&String(raw.description||'')===String(old.description||'')&&/^(Aporte|Resgate|Aplicação|Transferência) · /.test(old.description||''))params.description='';
  if(['despesa','receita','recarga'].includes(kind)){if(params.account==='Dinheiro')params.method='Dinheiro';if(params.category==='Recarga de celular'&&params.recipient==='Outro contato'&&!params.recipientName&&old.recipientType==='Outro contato')params.recipientName=old.recipient;}
  if(kind==='cofrinho'){const item=state.pockets.find(x=>x.id===raw.pocket);if(!item){notify('Selecione um cofrinho cadastrado.');return}params.pocket=item.name;params.pocketId=item.id;}
  if(kind==='aplicacao'){const item=state.investments.find(x=>x.id===raw.investment);if(!item){notify('Selecione uma aplicação cadastrada.');return}Object.assign(params,{bank:item.bankType,bankName:item.bankName,investmentType:item.type,investmentId:item.id,investmentName:item.name});}
  const r=makeDraft(params,localISO(),{pockets:state.pockets.map(p=>p.name)});if(!r.ok){notify(r.error);return}
  d={...d,...r.draft,id:old.id,createdAt:old.createdAt,source:old.source};
 }
 const prior=state.drafts[i];d.modifiedAt=new Date().toISOString();d.revisions=[...(old.revisions||[]),{at:d.modifiedAt,previous:{amount:old.amount,date:old.date,account:old.account,accountName:old.accountName,fromAccount:old.fromAccount,toAccount:old.toAccount,investmentId:old.investmentId,pocketId:old.pocketId,direction:old.direction,method:old.method,category:old.category,description:old.description,note:old.note}}];
  const allAssets=[...state.investments,...state.pockets];
 const oldLotMap=allAssets.map(a=>({asset:a,lots:[...(a.lots||[])]}));
 for(const asset of allAssets)asset.lots=(asset.lots||[]).filter(l=>l.sourceDraftId!==old.id);
 if(d.direction==='aporte'&&['cofrinho','aplicacao'].includes(d.operation)){
  const nextAsset=d.operation==='cofrinho'?state.pockets.find(x=>x.id===d.pocketId):state.investments.find(x=>x.id===d.investmentId);
  if(nextAsset)nextAsset.lots=[...(nextAsset.lots||[]),{id:newId('lot'),amount:d.amount,date:d.date,sourceDraftId:d.id}];
 }
 state.drafts[i]=d;if(!persist()){state.drafts[i]=prior;for(const x of oldLotMap)x.asset.lots=x.lots;return}editingDraftId=null;notify('Registro atualizado.');navigate('rascunhos');}
function syncLabel(d){const s=d.syncStatus||'LOCAL';return ({IMPORTADO:'Importado anteriormente (origem legada)',REVISAO:'Revisão de migração pendente',PROCESSANDO:'Status legado: revisar antes de migrar',ENVIANDO:'Status legado: conferir antes de migrar',ERRO:'Status legado incerto: revisar',LOCAL:'Registro somente neste aparelho — não enviado ao D1'})[s]||'Registro local';}
async function syncRecord(){notify('Envio de registros reais ao D1 desativado nesta versão. Nenhuma operação foi transmitida.');}
async function readOfficial(){
 const target=document.querySelector('#official-summary');if(!target)return;
 target.textContent='Consultando D1 (somente leitura)...';
 try{
  const [accounts,transactions,investments,integrity]=await Promise.all([
   apiRequest('/api/accounts'),apiRequest('/api/transactions'),apiRequest('/api/investments'),apiRequest('/api/integrity')
  ]);
  const ac=accounts.accounts||[],tx=transactions.transactions||[],inv=investments.investments||[],bad=integrity.invalidTransactions||[];
  target.innerHTML=`<div class="notice notice-blue"><b>Banco D1 de HOMOLOGAÇÃO — leitura</b><p>Contas: ${ac.length} · Lançamentos: ${tx.length} · Investimentos: ${inv.length} · Inconsistências: ${bad.length}</p></div>
   ${ac.length?`<p class="small">Contas encontradas:</p>${ac.map(x=>`<p class="small">${esc(x.name)} · ${esc(x.kind)}</p>`).join('')}`:''}
   ${tx.length?`<p class="small">Últimos registros:</p>${tx.slice(0,10).map(x=>`<p class="small">${esc(x.effectiveDate)} · ${esc(x.description)} · ${money((x.amountCents||0)/100)}</p>`).join('')}`:'<p class="small muted">Nenhuma movimentação no D1 ainda. Isso é esperado nesta etapa.</p>'}
   ${bad.length?'<p class="notice">Foram identificadas inconsistências contábeis; não habilite gravações.</p>':''}`;
 }catch(e){target.textContent='Falha na consulta: '+String(e.message||e)}
}
const TEST_ACCOUNT_NAME='TESTE HML - Conta ficticia';
const TEST_ACCOUNT_KEY='meu-financeiro-hml-pending-account-v1';
function pendingTestAccount(){try{const j=JSON.parse(localStorage.getItem(TEST_ACCOUNT_KEY)||'null');return j&&j.name===TEST_ACCOUNT_NAME&&typeof j.clientOperationId==='string'?j:null}catch{return null}}
function makeTestAccount(){
 const old=pendingTestAccount();if(old)return old;
 if(!crypto?.randomUUID)throw Error('Gerador seguro de identificacao indisponivel.');
 const newAccount={name:TEST_ACCOUNT_NAME,kind:'bank',institution:'Banco ficticio HML',clientOperationId:'hml-account-'+crypto.randomUUID()};
 localStorage.setItem(TEST_ACCOUNT_KEY,JSON.stringify(newAccount));return newAccount;
}
async function createD1TestAccount(){
 if(!connected()||!profile()?.registered){notify('Entre com Google e prepare o perfil no D1.');return}
 if(!profile()?.accountSetup){notify('Cadastro de contas de teste bloqueado. Configure ENABLE_ACCOUNT_SETUP=true no Worker HML.');return}
 const el=document.querySelector('#account-test-feedback'),btn=document.querySelector('#account-test-create');
 if(btn)btn.disabled=true;
 if(el)el.textContent='Consultando D1 antes de criar...';
 try{
  const existing=await apiRequest('/api/accounts');
  if((existing.accounts||[]).some(x=>x.name===TEST_ACCOUNT_NAME)){
   localStorage.removeItem(TEST_ACCOUNT_KEY);
   if(el)el.textContent='Conta fictícia já existe no D1. Nenhuma duplicata criada.';
   await readOfficial();return;
  }
  const request=makeTestAccount();
  if(!confirm('Criar a conta fictícia "'+TEST_ACCOUNT_NAME+'" no banco D1 de HOMOLOGAÇÃO? Nenhuma movimentação ou saldo será criado.')){
   if(el)el.textContent='Cadastro cancelado. A chave da tentativa foi preservada.';return;
  }
  if(el)el.textContent='Enviando conta fictícia ao D1...';
  const response=await apiRequest('/api/accounts',{method:'POST',data:request});
  // Confirmar leitura antes de descartar o identificador: respostas perdidas nao devem gerar duplicidade.
  const confirmRead=await apiRequest('/api/accounts');
  if(!(confirmRead.accounts||[]).some(x=>x.id===response.accountId))throw Error('O servidor respondeu, mas a nova conta ainda não apareceu. Mantenha a mesma chave e consulte novamente.');
  localStorage.removeItem(TEST_ACCOUNT_KEY);
  if(el)el.textContent=response.replayed?'A conta fictícia já havia sido gravada; resposta recuperada sem duplicação.':'Conta fictícia gravada e confirmada no D1!';
  await readOfficial();
 }catch(e){
  if(el)el.textContent='Não foi possível confirmar o resultado: '+String(e.message||e)+'. Não crie outra conta manualmente; esta tentativa manteve sua chave.';
 }finally{if(btn)btn.disabled=false;}
}
async function verifyD1(){try{const r=await apiRequest('/api/me');notify(r.authenticated?'Identidade confirmada pelo D1.':'O servidor não confirmou a identidade.');settings()}catch(e){notify('Falha na verificação: '+String(e.message||e));settings()}}
async function createD1Profile(){if(!confirm('Criar seu perfil técnico no banco D1 de HOMOLOGAÇÃO? Isso não importa registros nem habilita movimentações.'))return;try{await bootstrapProfile();notify('Perfil criado/confirmado no D1.');settings()}catch(e){notify('Falha ao preparar perfil: '+String(e.message||e))}}
function drafts(){
 main.innerHTML=`<div class="page-intro">${label('Neste aparelho')}<h1 class="heading">Registros</h1><p class="lede">Movimentações salvas neste aparelho. Ainda não transmitidas ao banco D1.</p></div>
 ${alert}
 <div class="spaced section-title"><span>${state.drafts.length} registro(s)</span><button class="btn btn-ghost" data-do="export" ${state.drafts.length?'':'disabled'}>Exportar JSON</button></div>
 ${state.drafts.length?state.drafts.map(d=>{
 const kind=d.operation||d.kind||'transferencia';const type=opLabels[kind]||d.kind||'Movimentação';
 const sign=kind==='receita'?'+':(kind==='despesa'||kind==='recarga')?'−':'';
 const amountClass=kind==='receita'?'receita':(kind==='despesa'||kind==='recarga')?'despesa':'';
 const picture={despesa:'↗',receita:'↘',cofrinho:'◇',transferencia:'⇄',aplicacao:'▥',recarga:'▣'}[kind]||'≡';
 return `<article class="draft"><div class="draft-head"><div class="draft-title"><span class="draft-icon ${esc(kind)}" aria-hidden="true">${picture}</span><div><h4>${esc(d.description||type)}</h4><div class="meta">${esc(type)} · ${esc(niceDate(d.date))}</div><div class="meta">${esc((d.pocketId&&displayPocket(state.pockets.find(p=>p.id===d.pocketId)?.name||d.pocket))||(d.investmentId&&state.investments.find(i=>i.id===d.investmentId)?.name)||d.recipient||d.pocket||displayBank(d.accountName)||d.category||'Registro local')}</div></div></div><div class="amount money ${amountClass}">${sign}${money(d.amount)}</div></div><div class="sync-note">${esc(syncLabel(d))}${d.officialId?' · '+esc(d.officialId):''}</div>
 <div class="draft-acts">
 ${(['IMPORTADO','REVISAO','ENVIANDO','ERRO','PROCESSANDO'].includes(d.syncStatus))?'<button type="button" class="btn btn-secondary" disabled>Registro protegido</button>':`<button type="button" class="btn btn-secondary" data-edit="${esc(d.id)}">Editar</button><button type="button" class="btn btn-red" data-del="${esc(d.id)}">Excluir</button>`}
 
 </div></article>`;
 }).join(''):`<div class="card empty"><div class="symbol">◇</div><b>Nenhum registro local ainda</b><p>Toque em Registrar para criar seu primeiro registro.</p><button class="btn btn-secondary" data-route="registrar">Criar registro</button></div>`}
 <p class="secondary-note">Registros continuam somente neste aparelho. A conexão D1 permite login, consultas e testes fictícios explicitamente habilitados; nenhum registro local será enviado automaticamente.</p>`;
}
function snapshot(){const s=state.snapshot||{};
 const fixed=[['mp','Saldo livre Mercado Pago'],['inter','Saldo livre Banco Inter'],['cash','Dinheiro em espécie'],['limiteMp','Limite disponível cartão Mercado Pago'],['limiteInter','Limite disponível Banco Inter'],['faturaMp','Fatura atual Mercado Pago'],['faturaInter','Fatura atual Banco Inter']];
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

// Testes de homologação v1.9. Os identificadores são salvos ANTES da requisição.
// Não interferem nos lançamentos locais nem nas posições de patrimônio real.
const HML_TEST_STORAGE='meu-financeiro-hml-testes-v1.9';
const HML_TEST_MAIN='TESTE HML - Conta ficticia'; // Identificador técnico legado: não modificar.
const HML_TEST_AUX='TESTE HML - Conta auxiliar';
const HML_TEST_CDB='TESTE HML - CDB 120% CDI';
let hmlLastStep='';
function savedHmlTests(){try{return JSON.parse(localStorage.getItem(HML_TEST_STORAGE)||'{}')||{}}catch{return {}}}
function storeHmlTest(step,payload){const s=savedHmlTests();s[step]=payload;localStorage.setItem(HML_TEST_STORAGE,JSON.stringify(s));}
function operationKey(prefix){if(!crypto?.randomUUID)throw Error('Seu navegador não disponibiliza identificadores seguros.');return 'hml-v19-'+prefix+'-'+crypto.randomUUID()}
function hmlTestsPanel(pr){
 const ready=connected()&&pr?.registered;
 const allowed=ready&&pr?.hmlTests===true&&pr?.financialWrites!==true;
 return card(`<h3>Homologação D1 · Movimentações fictícias</h3>
 <p class="small muted">Somente neste painel são permitidos testes de R$ 100,00 (receita), R$ 35,00 (despesa), R$ 20,00 (transferência) e R$ 10,00 (CDB). <b>Não altera contas reais, lançamentos antigos ou a planilha.</b></p>
 <p class="small"><b>Segurança:</b> ${pr?.financialWrites?'ATENÇÃO: gravações financeiras gerais habilitadas. Interrompa!':pr?.hmlTests?'Testes HML liberados; gravações gerais bloqueadas.':'Testes bloqueados. Configure ENABLE_HML_TESTS=true no Worker, mantendo ENABLE_FINANCIAL_WRITES=false.'}</p>
 <div class="flex-wrap-row">
 <button type="button" class="btn btn-secondary" data-do="hml-refresh" ${ready?'':'disabled'}>Consultar saldos fictícios</button>
 </div>
 <div class="line"></div>
 <div class="field"><label>Sequência recomendada</label></div>
 <div class="flex-wrap-row">
 <button type="button" class="btn btn-secondary" data-do="hml-step" data-hml-step="aux" ${allowed?'':'disabled'}>1. Preparar conta auxiliar</button>
 <button type="button" class="btn btn-secondary" data-do="hml-step" data-hml-step="income" ${allowed?'':'disabled'}>2. Receita fictícia · R$ 100</button>
 <button type="button" class="btn btn-secondary" data-do="hml-step" data-hml-step="expense" ${allowed?'':'disabled'}>3. Despesa fictícia · R$ 35</button>
 <button type="button" class="btn btn-secondary" data-do="hml-step" data-hml-step="transfer" ${allowed?'':'disabled'}>4. Transferência fictícia · R$ 20</button>
 <button type="button" class="btn btn-secondary" data-do="hml-step" data-hml-step="investment" ${allowed?'':'disabled'}>5. CDB fictício · R$ 10</button>
 <button type="button" class="btn btn-ghost" data-do="hml-repeat" ${allowed?'':'disabled'}>6. Reenviar última operação (teste de duplicidade)</button>
 </div>
 <div id="hml-test-feedback" class="hint" aria-live="polite">${ready?'Consulte o D1 para conferir os saldos.':'Entre com Google e confirme seu perfil no D1 para continuar.'}</div>
 <div id="hml-test-summary" aria-live="polite"></div>
 <p class="hint">Valores exibidos são apenas partidas fictícias do banco de homologação. Não representam dinheiro disponível nem saldos reais. Reenvios reaproveitam a mesma chave de operação.</p>`);
}
function summaryHmlText(d){
 const bankAccounts=d.accounts||[],tx=d.transactions||[],balance=d.balances||[],investments=d.investments||[];
 const showName=n=>n===HML_TEST_MAIN?'Conta fictícia principal':n===HML_TEST_AUX?'Conta fictícia auxiliar':n;
 const balanceLines=balance.map(x=>`<div class="spaced"><span>${esc(showName(x.name))}</span><strong>${money(Number(x.balanceCents||0)/100)}</strong></div>`).join('');
 return `<div class="notice notice-blue"><b>Posição de teste no D1</b>
 <p>Contas fictícias: ${bankAccounts.length} · Movimentações fictícias: ${tx.length} · Investimentos fictícios: ${investments.length}</p>
 ${balanceLines||'<p>As contas fictícias ainda não foram encontradas.</p>'}
 ${investments.map(i=>`<div class="spaced"><span>${esc(i.name)} · capital</span><strong>${money(Number(i.principalCents||0)/100)}</strong></div>`).join('')}
 <p>Integridade contábil: <strong>${Number(d.invalidTransactions||0)===0?'Sem divergências detectadas':'ATENÇÃO: '+Number(d.invalidTransactions||0)+' inconsistência(s)'}</strong></p>
 ${tx.length?`<p class="small">Últimas operações: ${tx.slice(0,5).map(t=>esc(t.description)).join(' · ')}</p>`:''}
 </div>`;
}
async function refreshHmlTests(){
 const target=document.querySelector('#hml-test-summary');
 if(target)target.textContent='Consultando lançamentos fictícios no D1...';
 try{const d=await apiRequest('/api/hml/summary');if(target)target.innerHTML=summaryHmlText(d);return d}
 catch(e){if(target)target.textContent='Não foi possível consultar o D1: '+String(e.message||e);throw e}
}
function hmlStepPayload(step,data){
 const main=data.accounts.find(x=>x.name===HML_TEST_MAIN),aux=data.accounts.find(x=>x.name===HML_TEST_AUX);
 if(step==='aux')return {kind:'bank',name:HML_TEST_AUX};
 if(!main||!aux)throw Error('É necessário preparar as duas contas fictícias antes das movimentações.');
 const date=localISO();
 if(step==='income')return {kind:'income',description:'TESTE HML - Receita',amountCents:10000,effectiveDate:date,toAccountId:main.id};
 if(step==='expense')return {kind:'expense',description:'TESTE HML - Despesa',amountCents:3500,effectiveDate:date,fromAccountId:main.id};
 if(step==='transfer')return {kind:'transfer',description:'TESTE HML - Transferência',amountCents:2000,effectiveDate:date,fromAccountId:main.id,toAccountId:aux.id};
 if(step==='investment')return {productType:'CDB',name:HML_TEST_CDB,yieldMode:'cdi_pct',contractedRate:'120',appliedOn:date,amountCents:1000,fromAccountId:main.id,liquidity:'grace',graceDays:90,settlementBusinessDays:1,irMode:'regressive',iofApplies:true,institution:'Banco fictício HML'};
 throw Error('Teste não reconhecido.');
}
const HML_STEP_ROUTES={aux:'/api/hml/account',income:'/api/hml/transaction',expense:'/api/hml/transaction',transfer:'/api/hml/transaction',investment:'/api/hml/investment'};
function hmlWasDone(step,d){
 if(step==='aux')return (d.accounts||[]).some(x=>x.name===HML_TEST_AUX);
 if(step==='investment')return (d.investments||[]).some(x=>x.name===HML_TEST_CDB);
 const desc={income:'TESTE HML - Receita',expense:'TESTE HML - Despesa',transfer:'TESTE HML - Transferência'}[step];
 return (d.transactions||[]).some(x=>x.description===desc);
}
async function doHmlStep(step){
 const route=HML_STEP_ROUTES[step],status=document.querySelector('#hml-test-feedback');if(!route)return;
 if(!connected()||profile()?.hmlTests!==true||profile()?.financialWrites===true){notify('Acesso de homologação indisponível. Confira as variáveis do Worker.');return}
 const btns=[...document.querySelectorAll('[data-hml-step],[data-do="hml-repeat"]')];btns.forEach(b=>b.disabled=true);
 try{
  if(status)status.textContent='Conferindo operações existentes no D1...';
  const d=await apiRequest('/api/hml/summary');
  const saved=savedHmlTests()[step];
  if(hmlWasDone(step,d)){
   hmlLastStep=step;
   if(status)status.textContent='Operação já consta no D1. Nenhuma nova gravação foi feita. Utilize "Reenviar" para verificar a idempotência, se a chave estiver salva.';
   await refreshHmlTests();return;
  }
  const body=saved||{...hmlStepPayload(step,d),clientOperationId:operationKey(step)};
  if(!saved)storeHmlTest(step,body); // Persistir a chave antes de enviar.
  if(!confirm('Confirmar a operação FICTÍCIA "'+step+'" no D1 de HOMOLOGAÇÃO? Não afeta suas finanças reais.')){if(status)status.textContent='Operação cancelada; a chave ficou preservada para a próxima tentativa.';return;}
  if(status)status.textContent='Conferindo eventual gravação anterior pela chave...';
  const prior=await apiRequest('/api/hml/result',{method:'POST',data:{clientOperationId:body.clientOperationId}});
  if(prior.found&&prior.status==='completed'){
   hmlLastStep=step;if(status)status.textContent='Registro anterior recuperado pela chave, sem duplicação.';
   await refreshHmlTests();return;
  }
  if(prior.found)throw Error('Resultado anterior indefinido. Não será enviada outra operação.');
  if(status)status.textContent='Registrando operação fictícia...';
  const created=await apiRequest(route,{method:'POST',data:body});
  hmlLastStep=step;
  if(status)status.textContent=created.replayed?'Resposta repetida: mesma operação, sem duplicação.':'Operação gravada. Conferindo a leitura do D1...';
  await refreshHmlTests();
 }catch(e){if(status)status.textContent='A gravação não pôde ser confirmada: '+String(e.message||e)+'. A chave foi preservada. Use o mesmo botão para consultar e tentar novamente.';}
 finally{btns.forEach(b=>b.disabled=false)}
}
async function resendHmlOperation(){
 const step=hmlLastStep||['investment','transfer','expense','income','aux'].find(k=>savedHmlTests()[k]);
 const saved=savedHmlTests()[step],status=document.querySelector('#hml-test-feedback');
 if(!step||!saved){if(status)status.textContent='Nenhuma chave de teste está salva neste aparelho.';return}
 if(!confirm('Reenviar a MESMA operação fictícia e sua chave para verificar a ausência de duplicidade?'))return;
 try{const answer=await apiRequest(HML_STEP_ROUTES[step],{method:'POST',data:saved});
  if(status)status.textContent=answer.replayed?'Aprovado: a API reconheceu o reenvio, sem criar uma segunda operação.':'ATENÇÃO: a resposta não indicou replay. Confira a contagem e informe o resultado.';
  await refreshHmlTests();
 }catch(e){if(status)status.textContent='Falha no teste de reenvio: '+String(e.message||e)}
}

function settings(){const pr=profile(),cl=getClientId();
 main.innerHTML=`<div class="page-intro">${label('Seu aplicativo')}<h1 class="heading">Ajustes e privacidade</h1></div>
 ${card(`<div class="kv"><div class="k">Versão</div><div class="v">${VERSION}</div></div><div class="kv"><div class="k">API D1 de homologação</div><div class="v">Consultas e testes fictícios no D1</div></div><div class="kv"><div class="k">Gravações financeiras</div><div class="v">Gerais bloqueadas; apenas testes fictícios liberados separadamente</div></div><div class="kv"><div class="k">Registros existentes</div><div class="v">Preservados neste aparelho</div></div><div class="line"></div><button class="btn btn-block" data-do="install" id="install-action">Instalar na tela inicial</button><p class="installnote">Android/Chrome: menu ⋮ → Instalar app. Não remova a instalação atual nem limpe o armazenamento.</p>`)}
 ${card(`<h3>Google + Cloudflare D1 (HML)</h3><p class="small muted">Servidor público: ${esc(getApiUrl())}. O identificador OAuth Web é público e fica salvo apenas neste navegador. Nunca coloque aqui Client Secret ou token.</p>
 <form id="client-id-form"><div class="field"><label for="client-id-input">Client ID OAuth Web do Google</label><input id="client-id-input" name="clientId" class="input" type="text" inputmode="text" autocomplete="off" placeholder="123...apps.googleusercontent.com" value="${esc(cl)}" required></div><button class="btn btn-secondary" type="submit">Salvar Client ID neste aparelho</button></form>
 <div class="line"></div><p class="small"><b>Identidade:</b> <span id="auth-status">${connected()?esc(email())+' — validada pelo Worker':configured()?'Aguardando login Google.':'Configure o Client ID para continuar.'}</span></p>
 <div id="google-login-area" class="login-area"></div>
 <div class="flex-wrap-row mt-14"><button type="button" class="btn btn-secondary" data-do="verify-d1" ${connected()?'':'disabled'}>Verificar acesso</button><button type="button" class="btn btn-secondary" data-do="bootstrap-d1" ${connected()&&!pr?.registered?'':'disabled'}>Preparar meu perfil no D1</button><button type="button" class="btn btn-secondary" data-do="read-d1" ${connected()&&pr?.registered?'':'disabled'}>Consultar D1</button><button type="button" class="btn btn-ghost" data-do="logout">Sair</button></div>
 <p class="hint">${connected()?(pr?.registered?'Perfil cadastrado no D1.':'Identidade validada. Falta preparar perfil técnico no D1.'):'Os tokens Google não são armazenados no backup nem no navegador; será necessário novo login quando a página recarregar.'}</p>
 <div id="official-summary" aria-live="polite"></div><p class="hint">Esta versão não sincroniza lançamentos financeiros reais. Os testes fictícios usam rotas próprias e autorização separada.</p>`)}
 ${hmlTestsPanel(pr)}
 ${card(`<h3>Taxas de referência (opcional)</h3><p class="small muted">CDI informado manualmente para simulações locais. Não representa saldo bancário.</p><form id="reference-form"><div class="field"><label>CDI anual de referência (%)</label><input class="input" inputmode="decimal" name="cdiAnnual" placeholder="Ex.: 14,90" value="${esc(state.referenceRates?.cdiAnnual??'')}"></div><div class="field"><label>Data dessa referência</label><input class="input" type="date" name="cdiUpdatedAt" value="${esc(state.referenceRates?.cdiUpdatedAt||localISO())}"></div><button class="btn btn-secondary" type="submit">Guardar taxa de referência</button></form>`)}
 ${card(`<h3>Controle dos dados locais</h3><p class="small muted">Limpar dados do navegador apaga os registros. Faça backup antes de atualizar.</p><div class="flex-wrap-row"><button class="btn btn-secondary" data-do="export">Exportar backup completo</button><label class="btn btn-secondary backup-import" for="backup-file">Restaurar backup</label><input type="file" accept="application/json,.json" id="backup-file" class="sr-only"><button class="btn btn-red" data-do="clear">Apagar dados locais</button></div>`)}
 ${card(`<h3>Limites da homologação</h3><p class="small muted">As movimentações reais continuam locais e não são enviadas ao D1. Somente as operações fictícias do painel de homologação estão habilitadas.</p>`)}
 `;
 const googleEl=document.querySelector('#google-login-area');if(googleEl)mountGoogle(googleEl,()=>{notify('Login Google validado pelo servidor.');settings();},msg=>{notify('Falha no login Google.');const x=document.querySelector('#auth-status');if(x)x.textContent='Não autorizado: '+msg;});
}

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
function exportData(){if(localStore.blocked){const bytes=localStore.originalBytes;if(typeof bytes!=='string'){notify('Não foi possível acessar os dados para exportar. Não limpe o armazenamento.');return;}const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='meu-financeiro-recuperacao-original.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);return;}const payload={format:'meu-financeiro-pwa-v1.6',createdAt:new Date().toISOString(),warning:'Dados locais, não publicados no controle oficial. Armazene o backup em local seguro.',drafts:state.drafts,snapshot:state.snapshot,pockets:state.pockets,investments:state.investments,referenceRates:state.referenceRates||{}};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='meu-financeiro-backup-v1.6.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function clearData(){notify('Exclusão total bloqueada durante a auditoria. Exporte um backup para preservar seus registros.');return;}
document.body.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.operation){activeOperation=b.dataset.operation;entryMode='rapido';navigate('registrar');return}
 if(b.dataset.entry){entryMode=b.dataset.entry;register();return}
 if(b.dataset.route){navigate(b.dataset.route);return}
 if(b.id==='btn-settings'){navigate('ajustes');return}
 if(b.dataset.sample){const t=document.querySelector('#natural-text');if(t){t.value=b.dataset.sample;showInterpret(t.value)}return}
 if(b.dataset.query){const x=document.querySelector('#query-text');x.value=b.dataset.query;showQuery(x.value);return}
 if(b.dataset.assetAct){actionCatalog(b.dataset.assetKind,b.dataset.assetId,b.dataset.assetAct);return}
 if(b.dataset.sync){void syncRecord(b.dataset.sync);return}
 if(b.dataset.edit){editingDraftId=b.dataset.edit;navigate('editar-registro');return}
 if(b.dataset.lotDelete){removeLot(b.dataset.lotKind,b.dataset.lotAsset,b.dataset.lotDelete);return}
 if(b.dataset.del){const rec=state.drafts.find(d=>d.id===b.dataset.del);if(!rec||rec.syncStatus&&rec.syncStatus!=='LOCAL')return;
  if(!confirm('Excluir este registro e o aporte-base vinculado, quando existir? Isso não estorna operações no banco.'))return;
  for(const a of [...state.pockets,...state.investments])a.lots=(a.lots||[]).filter(l=>l.sourceDraftId!==rec.id);
  state.drafts=state.drafts.filter(d=>d.id!==b.dataset.del);persist();render();notify('Registro local excluído.');return}
 switch(b.dataset.do){case'hml-refresh':void refreshHmlTests();return;case'hml-step':void doHmlStep(b.dataset.hmlStep);return;case'hml-repeat':void resendHmlOperation();return;case'create-test-account':void createD1TestAccount();return;case'read-d1':void readOfficial();return;case'verify-d1':void verifyD1();return;case'bootstrap-d1':void createD1Profile();return;case'official-summary':void readOfficial();return;case'logout':logoff();settings();return;case'export':exportData();return;case'clear':clearData();return;case'snapshot':route='snapshot';snapshot();return;case'install':if(installedPrompt){installedPrompt.prompt();installedPrompt.userChoice.finally(()=>{installedPrompt=null})}else notify('No Chrome Android: menu ⋮ → Instalar app / Adicionar à tela inicial.');return}
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
 if(e.target.matches('#quick-account,#quick-fromAccount,#quick-toAccount,#quick-bank,#quick-recipient,#quick-pocket,#quick-investment,#quick-category,#quick-rateType'))syncQuickConditional();
 if(e.target.matches('#edit-draft-form select'))syncEditFields();
 if(e.target.matches('select[name="liquidity"],select[name="irMode"],input[name="irEnabled"]'))syncFinanceFields(document);
 if(e.target.matches('select[name=rateType]')){const area=e.target.closest('[data-rate-set]');if(area){const rate=area.querySelector('[data-rate-value]'),other=area.querySelector('[data-rate-description]');rate?.classList.toggle('is-hidden',!e.target.value||e.target.value==='none');if(rate)rate.querySelector('input').disabled=!e.target.value||e.target.value==='none';other?.classList.toggle('is-hidden',e.target.value!=='other');if(other)other.querySelector('input').disabled=e.target.value!=='other';}}
 if(e.target.matches('select[name=investmentType]')){const f=e.target.form,ir=f?.querySelector('[name=irEnabled]'),iof=f?.querySelector('[name=iofEnabled]'),defaults=defaultTax(e.target.value);if(ir)ir.checked=defaults.irEnabled;if(iof)iof.checked=defaults.iofEnabled;syncFinanceFields(document);}
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
document.body.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='client-id-form'){try{storeClientId(new FormData(e.target).get('clientId'));notify('Client ID salvo. Recarregando login...');settings()}catch(err){notify('Client ID inválido: '+String(err.message||err))}}else if(e.target.id==='quick-form')saveQuick(e.target);else if(e.target.id==='natural-form')showInterpret(e.target.querySelector('#natural-text').value);else if(e.target.id==='draft-form')handleSaveDraft(e.target);else if(e.target.id==='query-form')showQuery(e.target.querySelector('#query-text').value);else if(e.target.id==='snapshot-form')saveSnapshot(e.target);else if(e.target.id==='new-pocket-form')createCatalog(e.target,'pocket');else if(e.target.id==='new-investment-form')createCatalog(e.target,'investment');else if(e.target.matches('.rename-form'))renameCatalog(e.target);else if(e.target.matches('.lot-form'))saveLot(e.target);else if(e.target.id==='reference-form')saveReference(e.target);else if(e.target.id==='edit-draft-form')saveEditedDraft(e.target)});
document.body.addEventListener('change',async e=>{if(e.target.id!=='backup-file')return;const file=e.target.files?.[0];if(!file)return;try{if(file.size>5000000)throw new Error('Arquivo grande demais.');const raw=JSON.parse(await file.text());if(!Array.isArray(raw.drafts)||!Array.isArray(raw.pockets)||!Array.isArray(raw.investments)||!('snapshot'in raw))throw new Error('Formato de backup não reconhecido.');if(raw.drafts.length>50000||raw.pockets.length>1000||raw.investments.length>1000)throw new Error('Arquivo excede os limites de segurança.');if(!confirm(`Restaurar backup com ${raw.drafts.length} registro(s), ${raw.pockets.length} cofrinho(s) e ${raw.investments.length} investimento(s)? Isso substituirá todos os dados locais atuais. Exporte um backup antes.`))return;const backup=state;state=migrate({drafts:raw.drafts,pockets:raw.pockets,investments:raw.investments,snapshot:raw.snapshot,referenceRates:raw.referenceRates||{}});if(!persist()){state=backup;return;}notify('Backup restaurado neste aparelho.');navigate('inicio');}catch(err){notify('Não foi possível restaurar: '+(err.message||'arquivo inválido'));}finally{e.target.value='';}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e});
window.addEventListener('appinstalled',()=>{installedPrompt=null;notify('Aplicativo adicionado à tela inicial!')});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
