import {interpret,money,norm,round2} from './parser.mjs';
import {makeDraft,TYPES,ACCOUNTS,POCKETS,EXPENSE_CATS,INCOME_CATS,METHODS,INVESTMENTS,BANKS} from './operacoes.mjs';
const VERSION='1.1.0-local';
const KEY='meu-financeiro-pwa-local-v1';
const main=document.querySelector('#main');
const toastEl=document.querySelector('#toast');
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maybeMoney=v=>v==null?'—':money(v);
const num=v=>{let s=String(v??'').trim();if(!s)return null;s=s.replace(/R\$|\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?round2(n):null};
const fresh=()=>({drafts:[],snapshot:null});
function load(){try{let s=JSON.parse(localStorage.getItem(KEY)||'null');return s&&Array.isArray(s.drafts)?s:fresh()}catch(_){return fresh()}}
let state=load(),route='inicio',pending=null,installedPrompt=null,activeOperation='despesa',entryMode='rapido';
function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));return true}catch(_){notify('Não foi possível salvar. Verifique o armazenamento do navegador.');return false}}
function notify(t){toastEl.textContent=t;toastEl.classList.add('show');clearTimeout(notify._id);notify._id=setTimeout(()=>toastEl.classList.remove('show'),4000)}
function navigate(r){route=r;pending=null;document.querySelectorAll('[data-route]').forEach(x=>x.classList.toggle('selected',x.dataset.route===r));render();window.scrollTo({top:0,behavior:'instant'})}
const card=(html)=>`<div class="card">${html}</div>`;
const label=(s)=>`<span class="eyebrow">${s}</span>`;
const alert=`<div class="notice notice-blue">🔒 <b>Modo local:</b> este protótipo <b>não consulta bancos nem grava no Google Sheets</b>. Tudo que você salvar aqui é um rascunho armazenado apenas neste navegador.</div>`;
const localISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function render(){switch(route){case'inicio':return home();case'registrar':return register();case'consultar':return consult();case'rascunhos':return drafts();case'ajustes':return settings();default:home()}}
function home(){let sp=state.snapshot;main.innerHTML=`
  <div class="hero"><div class="hero-label">Saldo livre · Mercado Pago</div>
    <div class="hero-val money">${maybeMoney(sp?.mp)}</div>
    <div class="hero-rule"></div><div class="hero-bottom"><div class="hero-chip">${sp?`Posição inserida manualmente · ${esc(sp.date||'sem data')}`:'Não conectado à planilha oficial'}</div><button class="btn btn-white" type="button" data-do="snapshot">${sp?'Atualizar':'Informar saldo'}</button></div>
  </div>
  ${alert}
  <div class="section-title">O que vamos fazer?</div>
  <div class="quickgrid">
   <button class="quick" data-operation="despesa"><span class="qicon">↗</span><strong>Nova despesa</strong><span>Formulário rápido</span></button>
   <button class="quick" data-operation="receita"><span class="qicon">↘</span><strong>Receita</strong><span>Entrada de dinheiro</span></button>
   <button class="quick" data-operation="cofrinho"><span class="qicon">⇄</span><strong>Cofrinhos</strong><span>Guardar ou retirar</span></button>
   <button class="quick" data-route="consultar"><span class="qicon">◷</span><strong>Consultas</strong><span>Saldos e faturas</span></button>
  </div>
  <div class="section-title">Seu espaço de teste <small>Somente no aparelho</small></div>
  <div class="stats"><div class="stat"><div class="caption">Rascunhos locais</div><div class="metric">${state.drafts.length}</div><div class="caption">Nada publicado ainda</div></div><div class="stat"><div class="caption">Sistema financeiro</div><div class="metric metric-sm">Pendente</div><div class="caption">Conexão segura será a próxima etapa</div></div></div>
  <div class="section-title">Registro simplificado</div>
  ${card(`<p class="small muted">Escolha a operação, informe o valor e selecione apenas os dados necessários. O texto livre continua disponível na aba Registrar.</p><div class="quick-inline"><button class="btn btn-secondary" data-operation="transferencia">Transferir entre contas</button><button class="btn btn-secondary" data-operation="aplicacao">Investimentos</button></div>`)}
 `}
const opLabels={despesa:'Despesa',receita:'Receita',cofrinho:'Cofrinho',transferencia:'Entre contas',aplicacao:'Investimento'};
function register(){
 main.innerHTML=`${label('Lançamento rápido')}<h1 class="heading">Registrar movimentação</h1>
 <p class="lede">Escolha a operação. O formulário mostrará somente o que precisa ser informado.</p>
 <div class="entry-tabs" role="group" aria-label="Forma de registrar">
  <button type="button" class="entry-tab ${entryMode==='rapido'?'active':''}" data-entry="rapido">Formulário rápido</button>
  <button type="button" class="entry-tab ${entryMode==='texto'?'active':''}" data-entry="texto">Escrever mensagem</button>
 </div><div id="entry-area"></div>${alert}`;
 renderEntry();
}
function optSelect(name,values,val='',caption='Selecione'){return sel(name,values.map(x=>[x,x]),val,caption)}
function fieldSelect(title,name,opts,value='',placeholder='Selecione'){return `<div class="field"><label for="quick-${name}">${esc(title)}</label>${sel(name,opts.map(x=>Array.isArray(x)?x:[x,x]),value,placeholder).replace(`name="${name}"`,`id="quick-${name}" name="${name}"`)}</div>`}
function renderEntry(){const target=document.querySelector('#entry-area');if(!target)return;
 if(entryMode==='texto'){
  target.innerHTML=card(`<form id="natural-form"><div class="field"><label for="natural-text">Descreva a movimentação</label><textarea id="natural-text" class="textarea" maxlength="400" placeholder="Ex.: paguei 30 da viagem escolar pix mp"></textarea></div><button class="btn btn-block" type="submit">Interpretar mensagem →</button></form><div class="sample-wrap"><button class="sample" data-sample="gastei 48 em duas marmitas pix mp">Marmitas</button><button class="sample" data-sample="coloquei 0,04 cofrinho gasolina mp">Aporte</button><button class="sample" data-sample="rendeu 6 centavos mp">Rendimento</button></div>`)+`<div id="parse-display"></div>`;
 }else renderQuick();
}
function renderQuick(preserve={}){const target=document.querySelector('#entry-area');if(!target)return;
 let op=activeOperation;
 let typeOptions=TYPES.map(x=>[x,opLabels[x]]);
 let fields='';
 if(op==='despesa'||op==='receita'){
  fields+=fieldSelect('Categoria','category',op==='despesa'?EXPENSE_CATS:INCOME_CATS);
  fields+=fieldSelect(op==='despesa'?'Conta utilizada':'Conta que recebeu','account',ACCOUNTS);
  fields+=fieldSelect(op==='despesa'?'Forma de pagamento':'Forma de recebimento','method',METHODS);
  fields+=`<div class="field"><label for="quick-description">Descrição (opcional)</label><input id="quick-description" class="input" name="description" maxlength="200" placeholder="Ex.: almoço, salário, presente"></div>`;
 }else if(op==='cofrinho'){
  fields+=fieldSelect('Qual cofrinho?','pocket',POCKETS);
  fields+=fieldSelect('O que aconteceu?','direction',[['aporte','Guardar dinheiro (aporte)'],['resgate','Retirar dinheiro (resgate)']]);
  fields+=`<div class="explain-transfer"><b>Conta: Mercado Pago (automático)</b><span>Ao guardar: saldo MP → cofrinho. Ao retirar: cofrinho → saldo MP. Não é despesa nem receita.</span></div>`;
 }else if(op==='transferencia'){
  fields+=fieldSelect('Conta de origem','fromAccount',ACCOUNTS);
  fields+=fieldSelect('Conta de destino','toAccount',ACCOUNTS);
  fields+=`<div class="explain-transfer">Transferência entre contas próprias. Não é receita nem despesa.</div>`;
 }else if(op==='aplicacao'){
  fields+=fieldSelect('Operação','direction',[['aporte','Aplicar dinheiro'],['resgate','Resgatar aplicação']]);
  fields+=fieldSelect('Instituição do investimento','bank',BANKS);
  fields+=fieldSelect('Tipo de investimento','investmentType',INVESTMENTS);
  fields+=fieldSelect('Conta de origem / recebimento (confira)','account',ACCOUNTS);
  fields+=`<div class="explain-transfer">Aplicação: sai da conta para o investimento. Resgate: volta para a conta. O produto específico e os rendimentos precisarão de conferência.</div>`;
 }
 target.innerHTML=`<div class="card"><form id="quick-form" novalidate>
  <div class="field"><label for="quick-operation">Tipo de movimentação</label>${sel('operation',typeOptions,op,'Selecione').replace('name="operation"','id="quick-operation" name="operation"')}</div>
  <div class="field"><label for="quick-amount">Valor (R$)</label><input id="quick-amount" class="input quick-amount" name="amount" inputmode="decimal" type="text" autocomplete="off" placeholder="0,00" required></div>
  ${fields}
  <details class="more-details"><summary>Data e observações</summary><div class="field"><label for="quick-date">Data da movimentação</label><input id="quick-date" class="input" type="date" name="date" value="${localISO()}" required></div><div class="field"><label for="quick-note">Observações (opcional)</label><textarea id="quick-note" class="textarea" name="note" maxlength="300" placeholder="Informações adicionais"></textarea></div></details>
  <div id="quick-feedback" role="alert" aria-live="polite"></div>
  <p class="hint">Ao salvar, a operação ficará somente como rascunho local. A planilha e os saldos não serão alterados.</p>
  <button class="btn btn-block" type="submit">Salvar rascunho</button>
 </form></div>`;
 for(const name of ["amount","date","note"]){if(preserve[name]!=null){const input=target.querySelector(`[name="${name}"]`);if(input)input.value=preserve[name];}}
}
function saveQuick(form){
 const data=Object.fromEntries(new FormData(form)),r=makeDraft(data,localISO());
 const feedback=document.querySelector('#quick-feedback');
 if(!r.ok){if(feedback)feedback.innerHTML=`<div class="notice">${esc(r.error)}</div>`;notify(r.error);return;}
 const d={...r.draft};
 d.id=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
 d.createdAt=new Date().toISOString();d.state='RASCUNHO LOCAL';d.source='app-v1.1-form';
 if(!saveLocalDraft(d))return;
 notify(r.warnings.length?'Salvo com marcação de revisão.':'Rascunho salvo no aparelho.');
 navigate('rascunhos');
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
function consult(){let sp=state.snapshot;main.innerHTML=`${label('Acompanhamento')}<h1 class="heading">Consultar finanças</h1><p class="lede">Valores informados manualmente neste aparelho. A sincronização com o Google Sheets será implementada em seguida.</p>${alert}
 ${card(`<form id="query-form"><div class="field"><label for="query-text">O que deseja consultar?</label><input id="query-text" class="input" maxlength="150" placeholder="Ex.: fatura atual inter"></div><button class="btn btn-block" type="submit">Consultar</button></form><div class="sample-wrap">${['saldo mp','saldo cofrinho fortaleza','limite disponível inter','fatura atual mp','fatura janeiro mp','fatura 01/26 inter'].map(x=>`<button class="sample" data-query="${esc(x)}">${esc(x)}</button>`).join('')}</div><div id="query-out"></div>`)}
 <div class="section-title">Valores locais <small>Não sincronizados</small></div>
 <div class="bankgrid">${[
 ['Saldo MP',sp?.mp],['Fortaleza',sp?.fortaleza],['Gasolina',sp?.gasolina],['Mounjaro',sp?.mounjaro],['Crédito celular',sp?.celular],['Fatura atual MP',sp?.faturaMp],['Fatura atual Inter',sp?.faturaInter],['Limite MP',sp?.limiteMp],['Limite Inter',sp?.limiteInter]
 ].map(([name,value])=>`<div class="bank"><div class="bank-label">${name}</div><div class="bank-value money">${maybeMoney(value)}</div><small>${sp?'Dado manual':'Não informado'}</small></div>`).join('')}</div>
 <button data-do="snapshot" class="btn btn-secondary btn-block mt-14">${sp?'Editar valores locais':'Informar valores manualmente'}</button>`;}
function showQuery(text){const p=interpret(text),target=document.querySelector('#query-out');if(!target)return;let sp=state.snapshot;
if(p.status!=='consulta'){target.innerHTML=`<div class="notice">Esta frase não foi reconhecida como consulta. Use a aba Registrar para criar um rascunho.</div>`;return}
if(!sp){target.innerHTML=`<div class="notice">Ainda não há dados locais. <b>Nenhuma conta bancária ou planilha está conectada.</b> Você pode inserir valores de teste manualmente, ou esperar pela sincronização segura.</div>`;return}
let val=null,labelText='',extra='';
if(p.kind==='saldo'){if(p.pocket){const k=norm(p.pocket);val=k.includes('fortaleza')?sp.fortaleza:k.includes('gasolina')?sp.gasolina:k.includes('mounjaro')?sp.mounjaro:sp.celular;labelText=p.pocket;}else if(p.account==='Mercado Pago — saldo'){val=sp.mp;labelText='Saldo livre MP';}else{extra='Indique uma conta ou cofrinho específico.';}}
if(p.kind==='limite'){val=p.account==='Inter'?sp.limiteInter:p.account==='Mercado Pago — saldo'?sp.limiteMp:null;labelText=`Limite disponível ${p.account||''}`;}
if(p.kind==='fatura'){if(p.period)extra='Consulta por competência específica ainda não disponível na posição local; precisará da sincronização com as faturas futuras.';else{val=p.account==='Inter'?sp.faturaInter:p.account==='Mercado Pago — saldo'?sp.faturaMp:null;labelText=`Fatura atual ${p.account||''}`;}}
target.innerHTML=`<div class="card"><span class="pill neutral">Consulta local</span><h3 class="mb-7">${esc(labelText||'Consulta')}</h3><div class="heading money">${maybeMoney(val)}</div><p class="hint">${esc(extra||'Última posição digitada neste aparelho: '+(sp.date||'sem data')+'. Não é uma consulta ao banco nem à planilha oficial.')}</p></div>`;}
function drafts(){main.innerHTML=`${label('Área privada do aparelho')}<h1 class="heading">Rascunhos</h1><p class="lede">Estas operações não foram enviadas à sua planilha oficial. Não as registre duas vezes.</p>${alert}
 <div class="spaced section-title"><span>${state.drafts.length} rascunho(s)</span><button class="btn btn-ghost" data-do="export" ${state.drafts.length?'':'disabled'}>Exportar JSON</button></div>
 ${state.drafts.length?state.drafts.map(d=>`<div class="draft"><div class="draft-head"><div><span class="pill neutral">RASCUNHO LOCAL</span><h4>${esc(d.description)}</h4><div class="meta">${esc(d.date)} · ${esc(opLabels[d.operation]||d.kind||"Movimentação")} · ${esc(d.pocket||d.category||"—")}</div>${d.reviewRequired?`<div class="review-note">Pendente de revisão antes de integrar</div>`:""}</div><div class="amount money">${money(d.amount)}</div></div><div class="draft-acts"><button class="btn btn-red" data-del="${esc(d.id)}">Excluir rascunho</button></div></div>`).join(''):`<div class="empty"><div class="symbol">▤</div><b>Nenhum rascunho</b><p>Use a aba Registrar para experimentar o interpretador com operações reais sem afetar a planilha.</p></div>`}
 <p class="secondary-note">Rascunhos não são transações financeiras confirmadas. Para evitar registros duplicados, não envie automaticamente o arquivo exportado ao bot do WhatsApp.</p>`;}
function snapshot(){const s=state.snapshot||{}; const fields=[['mp','Saldo livre MP'],['fortaleza','Cofrinho Viagem Fortaleza'],['gasolina','Cofrinho Gasolina'],['mounjaro','Cofrinho Mounjaro'],['celular','Cofrinho Crédito celular'],['limiteMp','Limite disponível cartão MP'],['limiteInter','Limite disponível Inter'],['faturaMp','Fatura atual MP'],['faturaInter','Fatura atual Inter']];main.innerHTML=`${label('Valores inseridos por você')}<h1 class="heading">Posição financeira local</h1><p class="lede">Você pode preencher manualmente para testar as consultas. Não corresponde a uma sincronização com seus bancos.</p><div class="notice">⚠️ Dados salvos no armazenamento do navegador, sem criptografia própria. Não recomendamos usar em aparelhos compartilhados.</div>${card(`<form id="snapshot-form">${fields.map(([id,name])=>`<div class="field"><label>${name}</label><input class="input" inputmode="decimal" name="${id}" placeholder="Deixe em branco se não souber" value="${s[id]??''}"></div>`).join('')}<div class="field"><label>Data da posição</label><input type="date" class="input" name="date" value="${esc(s.date||localISO())}"></div><button class="btn btn-block" type="submit">Salvar valores apenas neste aparelho</button></form>`)}`}
function settings(){main.innerHTML=`${label('Seu aplicativo')}<h1 class="heading">Ajustes e privacidade</h1>
 ${card(`<div class="kv"><div class="k">Versão</div><div class="v">${VERSION}</div></div><div class="kv"><div class="k">Conexão Google Sheets</div><div class="v">Não configurada</div></div><div class="kv"><div class="k">API da OpenAI</div><div class="v">Desativada / sem custo</div></div><div class="kv"><div class="k">Armazenamento</div><div class="v">Local no navegador</div></div><div class="line"></div><button class="btn btn-block" data-do="install" id="install-action">Instalar na tela inicial</button><p class="installnote">Android / Chrome: ⋮ → <b>Adicionar à tela inicial</b> ou <b>Instalar aplicativo</b>. É necessário abrir por HTTPS ou localhost, não por arquivo ZIP diretamente.</p>`)}
 ${card(`<h3>Controle dos dados locais</h3><p class="small muted">Você controla os dados armazenados neste navegador. Limpar os dados do navegador também os apaga.</p><div class="flex-wrap-row"><button class="btn btn-secondary" data-do="export">Exportar rascunhos</button><button class="btn btn-red" data-do="clear">Apagar dados locais</button></div>`)}
 ${card(`<h3>O que vem na próxima versão?</h3><p class="small muted">Autenticação individual, leitura da planilha oficial em tempo real, envio de lançamentos com confirmação e histórico integrado. O webhook da Meta continuará separado.</p>`)}
 `}
function saveSnapshot(form){const s={};for(const [k,v] of new FormData(form)){if(k==='date'){s.date=v;continue}const value=num(v);if(String(v).trim()&&value===null){notify('Valor inválido em '+k);return}if(value!==null)s[k]=value}state.snapshot=s;persist();notify('Valores guardados neste aparelho.');navigate('consultar')}
function exportData(){const payload={format:'meu-financeiro-pwa-v1.1',createdAt:new Date().toISOString(),warning:'Rascunhos locais, não publicados no controle oficial.',drafts:state.drafts};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='meu-financeiro-rascunhos.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function clearData(){if(!confirm('Apagar TODOS os rascunhos e valores locais armazenados neste navegador? Isso não afeta a planilha oficial.'))return;state=fresh();persist();notify('Dados locais apagados.');navigate('inicio')}
document.body.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.operation){activeOperation=b.dataset.operation;entryMode='rapido';navigate('registrar');return}
 if(b.dataset.entry){entryMode=b.dataset.entry;register();return}
 if(b.dataset.route){navigate(b.dataset.route);return}
 if(b.id==='btn-settings'){navigate('ajustes');return}
 if(b.dataset.sample){const t=document.querySelector('#natural-text');if(t){t.value=b.dataset.sample;showInterpret(t.value)}return}
 if(b.dataset.query){const x=document.querySelector('#query-text');x.value=b.dataset.query;showQuery(x.value);return}
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
});
document.body.addEventListener('submit',e=>{e.preventDefault();if(e.target.id==='quick-form')saveQuick(e.target);else if(e.target.id==='natural-form')showInterpret(e.target.querySelector('#natural-text').value);else if(e.target.id==='draft-form')handleSaveDraft(e.target);else if(e.target.id==='query-form')showQuery(e.target.querySelector('#query-text').value);else if(e.target.id==='snapshot-form')saveSnapshot(e.target)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e});
window.addEventListener('appinstalled',()=>{installedPrompt=null;notify('Aplicativo adicionado à tela inicial!')});
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
