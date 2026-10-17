import {Outbox} from './outbox.mjs?v=1.9.2-audit';
import {prepareDraftPayload} from './sync-payload.mjs?v=1.9.2-audit';
const outbox=new Outbox();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Preparado neste aparelho',sending:'Resultado pendente',uncertain:'Resultado incerto',completed:'Confirmado pelo D1',review:'Revisão necessária',auth_required:'Novo login necessário',blocked:'Envio bloqueado'};
export async function sourceProtected(id){return outbox.hasSource(id)}
export async function mountQueue(target,{profile,apiRequest,apiOrigin,drafts,notify}){
 target.textContent='Consultando fila local…';
 try{
  const owner=profile()?.userId;if(!owner)throw Error('Entre novamente após a API candidata disponibilizar a identidade do titular.');
  const rows=await outbox.list(owner);if(profile()?.userId!==owner||!target.isConnected)return;
  const eligible=drafts().filter(d=>d.syncEligibleVersion===1&&!rows.some(r=>r.sourceId===d.id));
  target.innerHTML=`<p>A preparação guarda uma cópia imutável. Nenhum registro será enviado.</p>${rows.map(r=>`<p>${esc(r.payload.description)} · ${esc(labels[r.status]||'Revisar')}<br><small>${esc(r.operationId)}</small></p>`).join('')||'<p>Nenhuma operação preparada.</p>'}
  <button type="button" class="btn btn-secondary" id="queue-export">Exportar fila deste titular</button>
  <form id="queue-prepare"><div class="field"><label for="queue-source">Registro novo</label><select id="queue-source" name="sourceId" class="input" required><option value="">Selecione</option>${eligible.map(d=>`<option value="${esc(d.id)}">${esc(d.date)} · ${esc(d.description)} · ${esc(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(d.amount))}</option>`).join('')}</select></div>
  <button type="button" class="btn btn-secondary" id="queue-accounts">Consultar contas D1</button><div id="queue-account-fields"></div><button type="submit" class="btn btn-secondary" disabled id="queue-save">Preparar somente neste aparelho</button></form>
  <p class="hint">Registros antigos, cartões, cofrinhos e investimentos dependem de migração ou conciliação. A cópia preparada não acompanha edições posteriores do registro.</p>`;
  const sameOwner=()=>{if(profile()?.userId!==owner)throw Error('A identidade mudou. Abra a fila novamente.');};
  target.querySelector('#queue-export').onclick=()=>{try{sameOwner();const url=URL.createObjectURL(new Blob([JSON.stringify({format:'meu-financeiro-outbox-v1',ownerId:owner,operations:rows},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='meu-financeiro-fila.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}catch(e){notify(e.message)}};
  let accounts=[];
  target.querySelector('#queue-accounts').onclick=async()=>{try{sameOwner();const response=await apiRequest('/api/accounts');sameOwner();if(!target.isConnected)return;accounts=response.accounts||[];const options='<option value="">Não se aplica / selecione</option>'+accounts.filter(a=>a.status==='active'&&['bank','cash'].includes(a.kind)).map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');target.querySelector('#queue-account-fields').innerHTML=`<div class="field"><label for="queue-from">Conta de origem (despesa ou transferência)</label><select class="input" name="fromAccountId" id="queue-from">${options}</select></div><div class="field"><label for="queue-to">Conta de destino (receita ou transferência)</label><select class="input" name="toAccountId" id="queue-to">${options}</select></div>`;target.querySelector('#queue-save').disabled=false;}catch(e){notify(e.message)}};
  target.querySelector('#queue-prepare').onsubmit=async e=>{e.preventDefault();try{sameOwner();const values=Object.fromEntries(new FormData(e.currentTarget)),draft=drafts().find(d=>d.id===values.sourceId);const payload=prepareDraftPayload(draft,{...values,accounts});await outbox.enqueue({owner,apiOrigin,sourceId:draft.id,payload,sourceSnapshot:draft});notify('Cópia preparada localmente. Nenhuma movimentação foi enviada.');await mountQueue(target,{profile,apiRequest,apiOrigin,drafts,notify});}catch(e){notify(e.message)}};
 }catch(e){target.textContent='Fila indisponível: '+e.message;}
}
