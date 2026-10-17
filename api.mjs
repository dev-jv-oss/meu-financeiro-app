/* Meu Financeiro 1.7 — Google Identity Services + API D1 HOMOLOGACAO. */
import {APP_CONFIG} from './app-config.js?v=1.7.0';
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
 const map={AUTH_NOT_CONFIGURED:'Confirme GOOGLE_CLIENT_ID e GOOGLE_ALLOWED_EMAIL no Worker.',IDENTITY_NOT_ALLOWED:'Conta Google nao autorizada. Confira o e-mail permitido e o Client ID nas variaveis do Worker.',INVALID_TOKEN:'Token Google invalido. Faca login novamente.',UNKNOWN_SIGNING_KEY:'Nao foi possivel validar a assinatura do Google agora.',SETUP_REQUIRED:'Seu perfil ainda nao existe no D1. Use o botao Preparar perfil.',WRITES_DISABLED:'Gravacoes financeiras desativadas em homologacao.'};
 return map[body?.error]||String(body?.message||body?.error||`Falha HTTP ${r.status}`).slice(0,250);
}
export async function apiRequest(route,{method='GET',data}={}){
 if(!idToken)throw Error('Primeiro entre com sua conta Google.');
 if(!/^\/api\/[a-z-]+$/.test(route))throw Error('Rota nao permitida no aplicativo.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const options={method,headers:{Authorization:'Bearer '+idToken},cache:'no-store',signal:controller.signal};
  if(method==='POST'){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data||{});}
  const response=await fetch(getApiUrl()+route,options);
  const result=await response.json().catch(()=>({error:'INVALID_RESPONSE',message:'Resposta nao e JSON.'}));
  if(!response.ok){if(response.status===401)logoff();throw Error(errDescription(response,result));}
  return result;
 }catch(e){if(e?.name==='AbortError')throw Error('Tempo de resposta esgotado; confira sua conexao.');throw e}
 finally{clearTimeout(timer)}
}
export async function refreshIdentity(){
 if(!idToken)throw Error('Sem credencial. Entre novamente.');
 const r=await apiRequest('/api/me');
 if(r.authenticated!==true)throw Error('O servidor nao confirmou sua identidade.');
 verifiedProfile=r;return r;
}
export async function bootstrapProfile(){if(!connected())throw Error('Entre primeiro.');const r=await apiRequest('/api/bootstrap',{method:'POST',data:{}});await refreshIdentity();return r;}
export function mountGoogle(el,onLogin,onError){
 authListener=onLogin;errorListener=onError;
 if(!configured()){el.textContent='Informe e salve seu Client ID OAuth Web para habilitar o login.';return;}
 if(connected()){el.textContent='Identidade validada pelo servidor D1.';return;}
 const cid=getClientId();el.textContent='Carregando botao Google...';
 const render=(tries=0)=>{
  if(!el.isConnected)return;
  if(!globalThis.google?.accounts?.id){if(tries>=45){el.textContent='Nao foi possivel carregar o login Google. Confira internet, bloqueadores e configuracao do navegador.';return;}setTimeout(()=>render(tries+1),300);return}
  if(cid!==currentClient){
   globalThis.google.accounts.id.initialize({client_id:cid,auto_select:false,ux_mode:'popup',callback:async response=>{
    if(typeof response?.credential!=='string'||response.credential.length<100)return;
    idToken=response.credential;verifiedProfile=null;
    try{const r=await refreshIdentity();authListener?.(r)}catch(e){logoff();errorListener?.(String(e.message||e))}
   }});
   currentClient=cid;
  }
  el.innerHTML='';
  try{globalThis.google.accounts.id.renderButton(el,{theme:'outline',size:'large',text:'signin_with',shape:'pill',locale:'pt-BR'});}catch(e){el.textContent='O botao Google nao foi carregado: '+String(e?.message||e)}
 };
 render();
}
