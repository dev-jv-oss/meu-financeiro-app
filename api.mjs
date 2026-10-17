/* Meu Financeiro 1.9 — Google Identity Services + API D1 HOMOLOGAÇÃO. */
import {APP_CONFIG} from './app-config.js?v=1.9.2-audit';
let idToken='',verifiedProfile=null,currentClient='',authListener=null,errorListener=null;
const pattern=/^\d{6,}-[a-z0-9-]+\.apps\.googleusercontent\.com$/i;
export const getApiUrl=()=>APP_CONFIG.apiBaseUrl;
export function getClientId(){try{return String(localStorage.getItem(APP_CONFIG.authSettingsKey)||'').trim()}catch{return ''}}
export const configured=()=>pattern.test(getClientId())&&/^https:\/\//.test(getApiUrl());
export const connected=()=>!!idToken&&!!verifiedProfile?.authenticated;
export const email=()=>connected()?String(verifiedProfile.email||''):'';
export const profile=()=>verifiedProfile?{...verifiedProfile}:null;
export function logoff(){idToken='';verifiedProfile=null;try{globalThis.google?.accounts?.id?.disableAutoSelect?.()}catch{}}
export function storeClientId(id){
 const candidate=String(id||'').trim();
 if(!pattern.test(candidate))throw Error('Informe o Client ID OAuth Web completo, terminado em .apps.googleusercontent.com.');
 if(candidate!==getClientId()){logoff();localStorage.setItem(APP_CONFIG.authSettingsKey,candidate)}
 return candidate;
}
function errDescription(r,body){
 const map={AUTH_NOT_CONFIGURED:'Confirme GOOGLE_CLIENT_ID e GOOGLE_ALLOWED_EMAIL no Worker.',IDENTITY_NOT_ALLOWED:'Conta Google não autorizada. Confira o e-mail permitido e o Client ID nas variáveis do Worker.',INVALID_TOKEN:'Token Google inválido. Faça login novamente.',UNKNOWN_SIGNING_KEY:'Não foi possível validar a assinatura do Google agora.',SETUP_REQUIRED:'Seu perfil ainda não existe no D1. Use o botão Preparar perfil.',WRITES_DISABLED:'Gravações financeiras desativadas em homologação.'};
 return map[body?.error]||String(body?.message||body?.error||`Falha HTTP ${r.status}`).slice(0,250);
}
export async function apiRequest(route,{method='GET',data,owner}={}){
 if(owner&&verifiedProfile?.userId!==owner)throw Object.assign(Error('O titular da fila não corresponde ao login atual.'),{status:401,code:'OWNER_CHANGED'});
 if(!idToken)throw Error('Primeiro entre com sua conta Google.');
 if(!/^\/api\/(?:[a-z-]+|hml\/[a-z-]+)$/.test(route))throw Error('Rota não permitida no aplicativo.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const options={method,headers:{Authorization:'Bearer '+idToken},cache:'no-store',redirect:'error',signal:controller.signal};
  if(method==='POST'){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data||{});}
  const response=await fetch(getApiUrl()+route,options);
  let result;try{result=await response.json()}catch{throw Error('Resposta inválida do servidor. Consulte o resultado antes de repetir a operação.')}
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Resposta inválida do servidor.');
  if(!response.ok){if(response.status===401)logoff();throw Object.assign(Error(errDescription(response,result)),{status:response.status,code:result.error});}
  return result;
 }catch(e){if(e?.name==='AbortError')throw Error('Tempo de resposta esgotado; consulte o resultado antes de repetir; não crie outra operação.');throw e}
 finally{clearTimeout(timer)}
}
export async function refreshIdentity(){
 if(!idToken)throw Error('Sem credencial. Entre novamente.');
 const r=await apiRequest('/api/me');
 if(r.authenticated!==true)throw Error('O servidor não confirmou sua identidade.');
 verifiedProfile=r;return r;
}
export async function bootstrapProfile(){if(!connected())throw Error('Entre primeiro.');const r=await apiRequest('/api/bootstrap',{method:'POST',data:{}});await refreshIdentity();return r;}
export function mountGoogle(el,onLogin,onError){
 authListener=onLogin;errorListener=onError;
 if(!configured()){el.textContent='Informe e salve seu Client ID OAuth Web para habilitar o login.';return;}
 if(connected()){el.textContent='Identidade validada pelo servidor D1.';return;}
 const cid=getClientId();el.textContent='Carregando botão Google...';
 const render=(tries=0)=>{
  if(!el.isConnected)return;
  if(!globalThis.google?.accounts?.id){if(tries>=45){el.textContent='Não foi possível carregar o login Google. Confira a internet, possíveis bloqueadores e as configurações do navegador.';return;}setTimeout(()=>render(tries+1),300);return}
  if(cid!==currentClient){
   globalThis.google.accounts.id.initialize({client_id:cid,auto_select:false,ux_mode:'popup',callback:async response=>{
    if(typeof response?.credential!=='string'||response.credential.length<100)return;
    idToken=response.credential;verifiedProfile=null;
    try{const r=await refreshIdentity();authListener?.(r)}catch(e){logoff();errorListener?.(String(e.message||e))}
   }});
   currentClient=cid;
  }
  el.innerHTML='';
  try{globalThis.google.accounts.id.renderButton(el,{theme:'outline',size:'large',text:'signin_with',shape:'pill',locale:'pt-BR'});}catch(e){el.textContent='O botão Google não foi carregado: '+String(e?.message||e)}
 };
 render();
}
