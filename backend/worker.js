/* Meu Financeiro API | HML v0.1 - Cloudflare Worker + D1
 * Seguro por padrao: mutacoes financeiras desabilitadas ate ativacao explicita.
 * Google ID Token verificado com chaves publicas (RS256), aud, iss, exp e email permitido.
 * NUNCA colocar secrets no GitHub Pages. NUNCA modificar o Worker do WhatsApp.
 */
const API_VERSION = '0.3.1-audit';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const encoder = new TextEncoder();
let keyCache = { at: 0, ttl: 0, keys: [] };

function fail(status, code, message) { const e = new Error(message); e.status = status; e.code = code; throw e; }
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
}
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  return origin && origin === env.ALLOWED_ORIGIN ? {'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS','access-control-max-age':'600','vary':'Origin'} : {'vary':'Origin'};
}
function decodeB64Url(encoded){ if(!/^[\w-]+$/.test(encoded)) throw Error('invalid base64'); const s=encoded.replace(/-/g,'+').replace(/_/g,'/'); return Uint8Array.from(atob(s+'='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0)); }
function getClaims(jsonBytes){return JSON.parse(new TextDecoder().decode(jsonBytes));}
function isoDate(input){if(typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return false; const d = new Date(input+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===input;}
function civilToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Porto_Velho',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function validateDate(d){if(!isoDate(d) || d>civilToday()) fail(400,'INVALID_DATE','Informe data efetiva valida, nao futura (YYYY-MM-DD).');return d;}
function stringField(v, name, min=1, max=120){ if(typeof v !== 'string' || v.trim().length<min || v.trim().length>max) fail(400,'INVALID_FIELD',`Campo invalido: ${name}.`); return v.trim(); }
function amountField(v){if(!Number.isSafeInteger(v)||v<=0||v>100_000_000_000)fail(400,'INVALID_AMOUNT','amountCents deve ser inteiro positivo em centavos.');return v;}
function operationId(v){if(typeof v!=='string'|| !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,119}$/.test(v))fail(400,'INVALID_OPERATION_ID','Informe clientOperationId permanente (8 a 120 caracteres alfanumericos).');return v;}
async function sha256(value) {const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function getGoogleKeys(){
  if (keyCache.keys.length && Date.now() < keyCache.at+keyCache.ttl) return keyCache.keys;
  const response=await fetch(JWKS_URL,{headers:{'accept':'application/json'},redirect:'manual'});
  if(!response.ok)fail(503,'AUTH_KEYS_UNAVAILABLE','Nao foi possivel validar a identidade agora.');
  const data=await response.json();if(!Array.isArray(data.keys)||!data.keys.length)fail(503,'AUTH_KEYS_UNAVAILABLE','Chaves de verificacao indisponiveis.');
  const matched=(response.headers.get('cache-control')||'').match(/max-age=(\d+)/i);
  const ttl=Math.max(60,Math.min(Number(matched?.[1]||300),3600))*1000;
  keyCache={at:Date.now(),ttl,keys:data.keys};return data.keys;
}
async function googleIdentity(request,env){
  if(!env.GOOGLE_CLIENT_ID || !env.GOOGLE_ALLOWED_EMAIL)fail(503,'AUTH_NOT_CONFIGURED','Configure GOOGLE_CLIENT_ID e GOOGLE_ALLOWED_EMAIL no Worker.');
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer ')||header.length>8500)fail(401,'MISSING_TOKEN','Autenticacao Google obrigatoria.');
  const token=header.slice(7).trim(),parts=token.split('.');if(parts.length!==3)fail(401,'INVALID_TOKEN','Token invalido.');
  let h,p,sig;try{h=getClaims(decodeB64Url(parts[0]));p=getClaims(decodeB64Url(parts[1]));sig=decodeB64Url(parts[2]);}catch{fail(401,'INVALID_TOKEN','Token invalido.');}
  if(h.alg!=='RS256'||typeof h.kid!=='string')fail(401,'INVALID_TOKEN','Algoritmo de token nao permitido.');
  const jwks=await getGoogleKeys();const key=jwks.find(k=>k.kid===h.kid&&k.kty==='RSA'&&k.alg==='RS256');
  if(!key)fail(401,'UNKNOWN_SIGNING_KEY','Chave de assinatura nao reconhecida; tente novamente.');
  let verified=false;
  try{const publicKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']); verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,sig,encoder.encode(parts[0]+'.'+parts[1]));}catch{verified=false;}
  if(!verified)fail(401,'INVALID_SIGNATURE','Assinatura do token invalida.');
  const now=Math.floor(Date.now()/1000),email=String(p.email||'').toLowerCase();
  if(!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.aud!==env.GOOGLE_CLIENT_ID||!Number.isFinite(p.exp)||p.exp<=now||!Number.isFinite(p.iat)||p.iat>now+60||!/^\d{8,32}$/.test(String(p.sub||''))||p.email_verified!==true||email!==String(env.GOOGLE_ALLOWED_EMAIL).trim().toLowerCase()||(p.azp&&p.azp!==env.GOOGLE_CLIENT_ID))fail(403,'IDENTITY_NOT_ALLOWED','Esta conta Google nao esta autorizada.');
  return {userId:'google:'+p.sub, googleSub:p.sub, email, displayName:String(p.name||'').slice(0,100)};
}
async function dataBody(request){
  const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(type!=='application/json')fail(415,'JSON_REQUIRED','Envie Content-Type: application/json.');
  const text=await request.text();if(text.length>20000)fail(413,'BODY_TOO_LARGE','Corpo da requisicao muito grande.');
  let parsed;try{parsed=JSON.parse(text)}catch{fail(400,'INVALID_JSON','JSON invalido.');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'INVALID_JSON','Objeto JSON obrigatorio.');return parsed;
}
async function requireUser(env,identity){const r=await env.DB.prepare('SELECT id,email FROM users WHERE id=? AND google_sub=?').bind(identity.userId,identity.googleSub).first();if(!r)fail(409,'SETUP_REQUIRED','Primeiro conclua POST /api/bootstrap.');return r;}
async function readAccount(env,u,id,allowedKinds){if(typeof id!=='string'||id.length>150)fail(400,'INVALID_ACCOUNT','Informe uma conta valida.');const a=await env.DB.prepare('SELECT id,kind,status,name FROM accounts WHERE user_id=? AND id=?').bind(u,id).first();if(!a||a.status!=='active'||(allowedKinds&&!allowedKinds.includes(a.kind)))fail(400,'ACCOUNT_NOT_FOUND','Conta inexistente, inativa ou de tipo incompativel.');return a;}
function rowId(prefix){return `${prefix}_${crypto.randomUUID()}`;}
function checkWriteGate(env){if(env.ENABLE_FINANCIAL_WRITES!=='true')fail(403,'WRITES_DISABLED','Gravacoes financeiras desabilitadas em homologacao.');}
function checkAccountGate(env,name,kind){
 if(env.ENABLE_FINANCIAL_WRITES==='true')return;
 if(env.ENABLE_ACCOUNT_SETUP==='true' && kind==='bank' && name.startsWith('TESTE HML - '))return;
 fail(403,'ACCOUNT_SETUP_DISABLED','Cadastro de contas de teste desativado. Ative ENABLE_ACCOUNT_SETUP=true, sem liberar movimentacoes financeiras.');
}
async function duplicateResult(env,u,key,payloadHash){
 const row=await env.DB.prepare('SELECT payload_sha256,status,response_json FROM idempotency_keys WHERE user_id=? AND request_key=?').bind(u,key).first();
 if(!row)return null;
 if(row.payload_sha256!==payloadHash)fail(409,'IDEMPOTENCY_CONFLICT','Essa chave ja foi usada com outro conteudo.');
 if(row.status!=='completed'||!row.response_json)fail(409,'REQUEST_UNRESOLVED','Existe operacao com resultado indefinido. Nao recrie com outra chave.');
 return json({...JSON.parse(row.response_json),replayed:true});
}
async function executeOnce(env,userId,key,validated,makeStatements,publicData={}){
 const hash=await sha256(JSON.stringify(validated));const existing=await duplicateResult(env,userId,key,hash);if(existing)return existing;
 const result={ok:true,...publicData};const st=env.DB.prepare('INSERT INTO idempotency_keys(user_id,request_key,payload_sha256,status,response_json) VALUES(?,?,?,\'completed\',?)').bind(userId,key,hash,JSON.stringify(result));
 try{await env.DB.batch([st,...makeStatements(result)]);return json(result,201);}catch(error){
   const retry=await duplicateResult(env,userId,key,hash);if(retry)return retry;
   console.error('D1 batch error',String(error?.message||'').slice(0,180));fail(503,'DB_WRITE_FAILED','Falha na gravacao. Consulte a operacao antes de tentar novamente.');
 }
}
function insertAudit(env,userId,action,entityType,entityId){return env.DB.prepare('INSERT INTO audit_events(id,user_id,actor,action,entity_type,entity_id,summary) VALUES(?,?,?,?,?,?,?)').bind(rowId('audit'),userId,'authenticated_app',action,entityType,entityId,'API HML v0.1');}
async function bootstrap(env,identity){
 const nowUser=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(identity.userId).first();
 if(nowUser)return json({ok:true,created:false,profile:{email:identity.email}});
 const systemId='sys:'+identity.googleSub+':offset';
 try{await env.DB.batch([
   env.DB.prepare('INSERT INTO users(id,google_sub,email,display_name) VALUES(?,?,?,?)').bind(identity.userId,identity.googleSub,identity.email,identity.displayName),
   env.DB.prepare('INSERT INTO accounts(id,user_id,name,kind) VALUES(?,?,?,\'system\')').bind(systemId,identity.userId,'Contrapartida tecnica'),
   insertAudit(env,identity.userId,'bootstrap','users',identity.userId)
 ]);return json({ok:true,created:true,profile:{email:identity.email}},201);
 }catch{const now=await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(identity.userId).first();if(now)return json({ok:true,created:false,profile:{email:identity.email}});fail(503,'SETUP_FAILED','Nao foi possivel criar a conta.');}
}
async function createAccount(env,u,body){
 const key=operationId(body.clientOperationId),name=stringField(body.name,'name',2,80),kind=body.kind;
 checkAccountGate(env,name,kind);
 if(!['bank','cash'].includes(kind))fail(400,'ACCOUNT_KIND_UNSUPPORTED','Nesta fase, crie somente contas bancarias ou dinheiro em especie.');
 const institution=body.institution==null?null:stringField(body.institution,'institution',2,80);
 const sameName=await env.DB.prepare('SELECT id FROM accounts WHERE user_id=? AND lower(trim(name))=lower(?) AND kind=?').bind(u,name,kind).first();
 // O resultado idempotente da mesma solicitacao deve poder ser recuperado mesmo se a conta ja existir.
 const normalized={type:'account',name,kind,institution};
 const hash=await sha256(JSON.stringify(normalized));
 const prior=await duplicateResult(env,u,key,hash);if(prior)return prior;
 if(sameName)fail(409,'ACCOUNT_ALREADY_EXISTS','Uma conta com esse nome ja existe no D1. Consulte as contas antes de cadastrar novamente.');
 const id=rowId('account');
 return executeOnce(env,u,key,normalized,()=>[
   env.DB.prepare('INSERT INTO accounts(id,user_id,name,kind,institution) VALUES(?,?,?,?,?)').bind(id,u,name,kind,institution),
   insertAudit(env,u,'account.create','accounts',id)
 ],{accountId:id});
}
async function createTransaction(env,u,b,mode='normal'){
 if(mode!=='hml')checkWriteGate(env);const key=operationId(b.clientOperationId),kind=b.kind,description=stringField(b.description,'description',2,200),effectiveDate=validateDate(b.effectiveDate),amountCents=amountField(b.amountCents);
 if(!['expense','income','transfer'].includes(kind))fail(400,'UNSUPPORTED_TRANSACTION','Tipo ainda nao implementado nesta fase.');
 const fromId=b.fromAccountId??null,toId=b.toAccountId??null,note=b.note==null?null:stringField(b.note,'note',1,500);
 let from=null,to=null;
 if(kind==='expense'){from=await readAccount(env,u,fromId,['bank','cash']);to=await readAccount(env,u,'sys:'+u.replace('google:','')+':offset',['system']);}
 if(kind==='income'){from=await readAccount(env,u,'sys:'+u.replace('google:','')+':offset',['system']);to=await readAccount(env,u,toId,['bank','cash']);}
 if(kind==='transfer'){from=await readAccount(env,u,fromId,['bank','cash']);to=await readAccount(env,u,toId,['bank','cash']);}
 if(kind==='pocket_deposit'){from=await readAccount(env,u,fromId,['bank','cash']);to=await readAccount(env,u,toId,['pocket']);}
 if(kind==='pocket_withdrawal'){from=await readAccount(env,u,fromId,['pocket']);to=await readAccount(env,u,toId,['bank','cash']);}
 if(from.id===to.id)fail(400,'SAME_ACCOUNT','Contas de origem e destino devem ser diferentes.');
 const id=mode==='hml'?'hml-tx-'+u.slice(7)+'-'+kind:rowId('tx'),validated={type:'transaction',kind,description,effectiveDate,amountCents,fromAccountId:from.id,toAccountId:to.id,note};
 return executeOnce(env,u,key,validated,()=>[
   env.DB.prepare('INSERT INTO transactions(id,user_id,client_operation_id,kind,effective_date,description,amount_cents,note) VALUES(?,?,?,?,?,?,?,?)').bind(id,u,key,kind,effectiveDate,description,amountCents,note),
   env.DB.prepare('INSERT INTO ledger_postings(id,user_id,transaction_id,account_id,sequence_no,delta_cents) VALUES(?,?,?,?,?,?)').bind(rowId('post'),u,id,from.id,1,-amountCents),
   env.DB.prepare('INSERT INTO ledger_postings(id,user_id,transaction_id,account_id,sequence_no,delta_cents) VALUES(?,?,?,?,?,?)').bind(rowId('post'),u,id,to.id,2,amountCents),
   env.DB.prepare('UPDATE idempotency_keys SET transaction_id=? WHERE user_id=? AND request_key=?').bind(id,u,key),
   insertAudit(env,u,'transaction.create','transactions',id)
 ],{transactionId:id});
}
async function createInvestment(env,u,b,mode='normal'){
 if(mode!=='hml')checkWriteGate(env);const key=operationId(b.clientOperationId),type=b.productType,name=stringField(b.name,'name',2,100),rateMode=b.yieldMode||'none';
 if(!['CDB','RDB','LCI','LCA','COFRINHO'].includes(type))fail(400,'PRODUCT_UNSUPPORTED','Tipo de produto indisponivel nesta etapa.');
 if(!['none','cdi_pct','fixed_annual','cdi_plus','ipca_plus','other'].includes(rateMode))fail(400,'INVALID_YIELD','Modalidade de rendimento invalida.');
 const rate=b.contractedRate==null?null:String(b.contractedRate);
 if(rateMode!=='none'&&(rate===null||!/^\d{1,3}(\.\d{1,4})?$/.test(rate)))fail(400,'INVALID_YIELD','Taxa contratada invalida.');
 const appliedOn=validateDate(b.appliedOn),amountCents=amountField(b.amountCents),source=await readAccount(env,u,b.fromAccountId,['bank','cash']);
 const liquidity=b.liquidity||'daily';if(!['daily','grace','maturity'].includes(liquidity))fail(400,'INVALID_LIQUIDITY','Liquidez invalida.');
 const graceDays=liquidity==='grace'?b.graceDays:null;
 if(liquidity==='grace'&&(!Number.isInteger(graceDays)||graceDays<1||graceDays>36500))fail(400,'INVALID_GRACE','Carencia invalida.');
 const maturityDate=liquidity==='maturity'?b.maturityDate:null;
 if(liquidity==='maturity'&&!isoDate(maturityDate))fail(400,'INVALID_MATURITY','Informe uma data de vencimento válida.');
 if(maturityDate&&maturityDate<appliedOn)fail(400,'INVALID_MATURITY','Vencimento anterior ao aporte.');
 const settlement=b.settlementBusinessDays??0;
 if(!Number.isInteger(settlement)||settlement<0||settlement>30)fail(400,'INVALID_SETTLEMENT','Prazo de liquidacao invalido.');
 const irMode=b.irMode||'regressive';if(!['regressive','fixed','exempt','other'].includes(irMode))fail(400,'INVALID_IR','Regime de IR invalido.');
 const iof=b.iofApplies===false?0:1;
 const institution=b.institution==null?null:stringField(b.institution,'institution',2,100);
 const fixedIrRate=irMode==='fixed'?String(b.fixedIrRate??''):null;
 if(irMode==='fixed'&&(Number(fixedIrRate)>100||!/^(?:[0-9]|[1-9][0-9]|100)(?:\.\d{1,4})?$/.test(fixedIrRate)))fail(400,'INVALID_IR_RATE','Informe aliquota fixa de IR de 0 a 100%.');
 const productId=mode==='hml'?'hml-inv-'+u.slice(7):rowId('inv'),accountId=mode==='hml'?'hml-inv-account-'+u.slice(7):rowId('asset'),txId=rowId('tx'),lotId=rowId('lot');
 const normalized={type:'initial_investment',name,productType:type,yieldMode:rateMode,contractedRate:rate,appliedOn,amountCents,fromAccountId:source.id,liquidity,graceDays,maturityDate,settlementBusinessDays:settlement,irMode,fixedIrRate,iofApplies:iof,institution};
 return executeOnce(env,u,key,normalized,()=>[
   env.DB.prepare('INSERT INTO accounts(id,user_id,name,kind,institution) VALUES(?,?,?,?,?)').bind(accountId,u,name,type==='COFRINHO'?'pocket':'investment',institution),
   env.DB.prepare('INSERT INTO investment_products(id,user_id,account_id,product_type,name,yield_mode,contracted_rate,started_on,liquidity,grace_days,maturity_date,settlement_business_days,ir_mode,fixed_ir_rate,iof_applies) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(productId,u,accountId,type,name,rateMode,rate,appliedOn,liquidity,graceDays,maturityDate,settlement,irMode,fixedIrRate,iof),
   env.DB.prepare('INSERT INTO transactions(id,user_id,client_operation_id,kind,effective_date,description,amount_cents) VALUES(?,?,?,?,?,?,?)').bind(txId,u,key,type==='COFRINHO'?'pocket_deposit':'investment_deposit',appliedOn,'Aporte inicial: '+name,amountCents),
   env.DB.prepare('INSERT INTO ledger_postings(id,user_id,transaction_id,account_id,sequence_no,delta_cents) VALUES(?,?,?,?,?,?)').bind(rowId('post'),u,txId,source.id,1,-amountCents),
   env.DB.prepare('INSERT INTO ledger_postings(id,user_id,transaction_id,account_id,sequence_no,delta_cents) VALUES(?,?,?,?,?,?)').bind(rowId('post'),u,txId,accountId,2,amountCents),
   env.DB.prepare('INSERT INTO investment_lots(id,user_id,product_id,application_transaction_id,applied_on,original_principal_cents,remaining_principal_cents) VALUES(?,?,?,?,?,?,?)').bind(lotId,u,productId,txId,appliedOn,amountCents,amountCents),
   env.DB.prepare('UPDATE idempotency_keys SET transaction_id=? WHERE user_id=? AND request_key=?').bind(txId,u,key),
   insertAudit(env,u,'investment.initial_deposit','investment_products',productId)
 ],{productId,accountId,transactionId:txId,lotId});
}

// Homologação isolada: NUNCA libera rotas financeiras comuns.
// O nome da conta fictícia existente foi mantido sem acento para compatibilidade.
const HML_MAIN='TESTE HML - Conta ficticia';
const HML_AUX='TESTE HML - Conta auxiliar';
const HML_CDB='TESTE HML - CDB 120% CDI';
const HML_KINDS={income:['TESTE HML - Receita',10000],expense:['TESTE HML - Despesa',3500],transfer:['TESTE HML - Transferência',2000]};
function requireHml(env){
 if(env.ENABLE_HML_TESTS!=='true'||env.ENABLE_FINANCIAL_WRITES==='true')fail(403,'HML_DISABLED','Testes de homologação indisponíveis. Mantenha gravações financeiras gerais bloqueadas.');
}
async function getHmlAccounts(env,u){
 const r=await env.DB.prepare("SELECT id,name,kind FROM accounts WHERE user_id=? AND kind='bank' AND name IN (?,?) ORDER BY name").bind(u,HML_MAIN,HML_AUX).all();
 return r.results||[];
}
async function ensureHmlAccount(env,u,b){
 requireHml(env);
 if(b.kind!=='bank'||b.name!==HML_AUX)fail(400,'HML_ACCOUNT_ONLY','Só é permitido cadastrar a conta auxiliar fictícia.');
 const key=operationId(b.clientOperationId);
 const normalized={type:'account',name:HML_AUX,kind:'bank',institution:'Banco fictício HML'};
 const hash=await sha256(JSON.stringify(normalized));
 const prior=await duplicateResult(env,u,key,hash);if(prior)return prior;
 const existing=(await getHmlAccounts(env,u)).find(a=>a.name===HML_AUX);
 if(existing)return json({ok:true,accountId:existing.id,existing:true});
 const id='hml-aux-'+u.slice(7);
 return executeOnce(env,u,key,normalized,()=>[
 env.DB.prepare('INSERT INTO accounts(id,user_id,name,kind,institution) VALUES(?,?,?,?,?)').bind(id,u,HML_AUX,'bank','Banco fictício HML'),
 insertAudit(env,u,'hml.account.create','accounts',id)
 ],{accountId:id});
}
async function hmlTransaction(env,u,b){
 requireHml(env);
 const spec=HML_KINDS[b.kind];
 if(!spec||b.description!==spec[0]||b.amountCents!==spec[1]||b.note!==undefined||Object.keys(b).some(k=>!['clientOperationId','kind','description','amountCents','effectiveDate','fromAccountId','toAccountId'].includes(k)))
  fail(400,'HML_PAYLOAD_ONLY','Somente valores e descrições fixos de homologação são aceitos.');
 const ac=await getHmlAccounts(env,u),main=ac.find(x=>x.name===HML_MAIN),aux=ac.find(x=>x.name===HML_AUX);
 if(!main||!aux)fail(409,'HML_ACCOUNTS_REQUIRED','Prepare as duas contas fictícias antes de lançar testes.');
 const expectedFrom=b.kind==='income'?undefined:main.id,expectedTo=b.kind==='expense'?undefined:b.kind==='income'?main.id:aux.id;
 if((b.fromAccountId??undefined)!==expectedFrom||(b.toAccountId??undefined)!==expectedTo)
  fail(400,'HML_ACCOUNT_MISMATCH','As contas de teste não correspondem à operação.');
 const found=await env.DB.prepare('SELECT client_operation_id FROM transactions WHERE user_id=? AND description=?').bind(u,spec[0]).first();
 if(found&&found.client_operation_id!==b.clientOperationId)fail(409,'HML_ALREADY_DONE','Este teste já foi registrado com outra chave. Consulte o resumo do D1, não crie uma duplicata.');
 return createTransaction(env,u,b,'hml');
}
async function hmlInvestment(env,u,b){
 requireHml(env);
 const accounts=await getHmlAccounts(env,u),main=accounts.find(x=>x.name===HML_MAIN);
 if(!main)fail(409,'HML_ACCOUNTS_REQUIRED','A conta de teste principal não existe.');
 const desired=['clientOperationId','productType','name','yieldMode','contractedRate','appliedOn','amountCents','fromAccountId','liquidity','graceDays','settlementBusinessDays','irMode','iofApplies','institution'];
 if(Object.keys(b).some(k=>!desired.includes(k))||b.productType!=='CDB'||b.name!==HML_CDB||b.yieldMode!=='cdi_pct'||b.contractedRate!=='120'||b.amountCents!==1000||b.fromAccountId!==main.id||b.liquidity!=='grace'||b.graceDays!==90||b.settlementBusinessDays!==1||b.irMode!=='regressive'||b.iofApplies!==true||b.institution!=='Banco fictício HML')
  fail(400,'HML_INVESTMENT_ONLY','Somente o CDB fictício de R$ 10,00 é permitido.');
 const prior=await env.DB.prepare('SELECT t.client_operation_id FROM investment_products p JOIN investment_lots l ON l.product_id=p.id AND l.user_id=p.user_id JOIN transactions t ON t.id=l.application_transaction_id AND t.user_id=p.user_id WHERE p.user_id=? AND p.name=? LIMIT 1').bind(u,HML_CDB).first();
 if(prior&&prior.client_operation_id!==b.clientOperationId)fail(409,'HML_ALREADY_DONE','Este CDB fictício já foi criado com outra chave. Não duplique o investimento.');
 return createInvestment(env,u,b,'hml');
}
async function hmlSummary(env,u){
 const ac=await getHmlAccounts(env,u);
 const balances=await env.DB.prepare("SELECT a.id,a.name,COALESCE(SUM(p.delta_cents),0) AS balanceCents FROM accounts a LEFT JOIN ledger_postings p ON p.account_id=a.id AND p.user_id=a.user_id WHERE a.user_id=? AND a.kind='bank' AND a.name IN (?,?) GROUP BY a.id,a.name ORDER BY a.name").bind(u,HML_MAIN,HML_AUX).all();
 const tx=await env.DB.prepare("SELECT id,kind,description,amount_cents AS amountCents,effective_date AS effectiveDate FROM transactions WHERE user_id=? AND (description LIKE 'TESTE HML - %' OR description LIKE 'Aporte inicial: TESTE HML - %') ORDER BY created_at DESC LIMIT 30").bind(u).all();
 const investments=await env.DB.prepare('SELECT p.id,p.name,COALESCE(SUM(l.remaining_principal_cents),0) AS principalCents FROM investment_products p LEFT JOIN investment_lots l ON l.product_id=p.id AND l.user_id=p.user_id WHERE p.user_id=? AND p.name=? GROUP BY p.id,p.name').bind(u,HML_CDB).all();
 const invalid=await env.DB.prepare("SELECT COUNT(*) AS total FROM v_ledger_integrity v JOIN transactions t ON t.id=v.transaction_id AND t.user_id=v.user_id WHERE v.user_id=? AND (t.description LIKE 'TESTE HML - %' OR t.description LIKE 'Aporte inicial: TESTE HML - %') AND v.integrity<>'ok'").bind(u).first();
 return json({ok:true,environment:'HML',financialWrites:env.ENABLE_FINANCIAL_WRITES==='true',accounts:ac,balances:balances.results||[],transactions:tx.results||[],investments:investments.results||[],invalidTransactions:invalid?.total??0});
}
async function hmlResult(env,u,b){
 const key=operationId(b.clientOperationId);
 const row=await env.DB.prepare('SELECT status,response_json FROM idempotency_keys WHERE user_id=? AND request_key=?').bind(u,key).first();
 if(!row)return json({found:false});
 if(row.status!=='completed'||!row.response_json)return json({found:true,status:'unresolved'},409);
 return json({found:true,status:'completed',result:JSON.parse(row.response_json)});
}

async function handle(request,env){
 const url=new URL(request.url),pathname=url.pathname,method=request.method.toUpperCase();
 if(method==='GET'&&pathname==='/health'){
   const v=await env.DB.prepare('SELECT MAX(version) AS version FROM schema_versions').first();
   return json({status:'ok',service:'meu-financeiro-api',apiVersion:API_VERSION,schemaVersion:v?.version??null,financialWrites:env.ENABLE_FINANCIAL_WRITES==='true',accountSetup:env.ENABLE_ACCOUNT_SETUP==='true',hmlTests:env.ENABLE_HML_TESTS==='true'&&env.ENABLE_FINANCIAL_WRITES!=='true'});
 }
 if(!pathname.startsWith('/api/'))fail(404,'NOT_FOUND','Rota inexistente.');
 const identity=await googleIdentity(request,env),u=identity.userId;
 if(pathname==='/api/me'&&method==='GET'){
   const user=await env.DB.prepare('SELECT id,email FROM users WHERE id=?').bind(u).first();return json({authenticated:true,userId:u,registered:!!user,email:identity.email,financialWrites:env.ENABLE_FINANCIAL_WRITES==='true',accountSetup:env.ENABLE_ACCOUNT_SETUP==='true',hmlTests:env.ENABLE_HML_TESTS==='true'&&env.ENABLE_FINANCIAL_WRITES!=='true'});
 }
 if(pathname==='/api/bootstrap'&&method==='POST'){   if(env.ENABLE_ACCOUNT_SETUP!=='true'){     fail(403,'ACCOUNT_SETUP_DISABLED','Cadastro de usuarios desabilitado.');   }   return bootstrap(env,identity); }
 await requireUser(env,identity);
 // Ledger activity and external confirmations are deliberately separate: no implicit opening balance.
 if(pathname==='/api/balances'&&method==='GET'){
   const rs=await env.DB.prepare(`SELECT a.id,a.name,a.kind,a.status,
     COALESCE((SELECT SUM(p.delta_cents) FROM ledger_postings p WHERE p.user_id=a.user_id AND p.account_id=a.id),0) AS ledgerDeltaCents,
     s.id AS snapshotId,s.as_of_utc AS asOfUtc,s.balance_cents AS confirmedBalanceCents,s.source
     FROM accounts a LEFT JOIN balance_snapshots s ON s.user_id=a.user_id AND s.account_id=a.id
       AND NOT EXISTS (SELECT 1 FROM balance_snapshots newer WHERE newer.user_id=s.user_id AND newer.account_id=s.account_id AND julianday(newer.as_of_utc)>julianday(s.as_of_utc))
     WHERE a.user_id=? AND a.kind<>'system' ORDER BY a.id,s.id`).bind(u).all();
   const accounts=new Map();
   for(const r of rs.results||[]){
     if(!Number.isSafeInteger(r.ledgerDeltaCents)||(r.snapshotId&&!Number.isSafeInteger(r.confirmedBalanceCents)))fail(409,'UNSAFE_BALANCE','Saldo fora da faixa segura; exige revisão.');
     if(!accounts.has(r.id))accounts.set(r.id,{id:r.id,name:r.name,kind:r.kind,status:r.status,ledgerDeltaCents:r.ledgerDeltaCents,confirmedSnapshots:[],reconciledBalanceCents:null,reconciliationStatus:'no_snapshot'});
     const a=accounts.get(r.id);if(r.snapshotId){a.confirmedSnapshots.push({id:r.snapshotId,asOfUtc:r.asOfUtc,balanceCents:r.confirmedBalanceCents,source:r.source});a.reconciliationStatus='required';}
   }
   return json({accounts:[...accounts.values()],note:'Movimentação contabilizada e confirmações externas separadas. Saldo conciliado ainda não disponível.'});
 }
 if(pathname==='/api/accounts'&&method==='GET'){const rs=await env.DB.prepare('SELECT id,name,kind,institution,status FROM accounts WHERE user_id=? AND kind<>\'system\' ORDER BY name').bind(u).all();return json({accounts:rs.results||[]});}
 if(pathname==='/api/transactions'&&method==='GET'){const rs=await env.DB.prepare('SELECT id,client_operation_id AS clientOperationId,kind,effective_date AS effectiveDate,description,amount_cents AS amountCents,status,created_at AS createdAt FROM transactions WHERE user_id=? ORDER BY effective_date DESC,created_at DESC LIMIT 100').bind(u).all();return json({transactions:rs.results||[]});}
 if(pathname==='/api/investments'&&method==='GET'){const rs=await env.DB.prepare('SELECT p.id,p.name,p.product_type AS productType,p.yield_mode AS yieldMode,p.contracted_rate AS contractedRate,p.liquidity,p.grace_days AS graceDays,p.status,a.id AS accountId,COALESCE(SUM(l.remaining_principal_cents),0) AS principalCents FROM investment_products p JOIN accounts a ON a.id=p.account_id AND a.user_id=p.user_id LEFT JOIN investment_lots l ON l.product_id=p.id AND l.user_id=p.user_id WHERE p.user_id=? GROUP BY p.id ORDER BY p.name').bind(u).all();return json({investments:rs.results||[],note:'Principal contabilizado; rendimento estimado ainda nao implementado.'});}
 if(pathname==='/api/integrity'&&method==='GET'){const rs=await env.DB.prepare('SELECT transaction_id,integrity,postings_count,balance_cents FROM v_ledger_integrity WHERE user_id=? AND integrity<>\'ok\' LIMIT 100').bind(u).all();return json({invalidTransactions:rs.results||[]});}
 if(method==='GET'&&pathname==='/api/hml/summary')return hmlSummary(env,u);
 if(method==='POST'&&pathname==='/api/hml/account')return ensureHmlAccount(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/hml/transaction')return hmlTransaction(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/hml/investment')return hmlInvestment(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/hml/result'){requireHml(env);return hmlResult(env,u,await dataBody(request));}
 if(method==='POST'&&pathname==='/api/operation-result')return hmlResult(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/accounts')return createAccount(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/transactions')return createTransaction(env,u,await dataBody(request));
 if(method==='POST'&&pathname==='/api/investments')return createInvestment(env,u,await dataBody(request));
 fail(404,'NOT_FOUND','Rota inexistente.');
}
export default {async fetch(request,env){
 const cors=corsHeaders(request,env);
 const origin=request.headers.get('Origin');
 if(origin&&origin!==env.ALLOWED_ORIGIN)return json({ok:false,error:'ORIGIN_NOT_ALLOWED',message:'Origem não autorizada.'},403,cors);
 if(request.method==='OPTIONS')return new Response(null,{status:request.headers.get('Origin')===env.ALLOWED_ORIGIN?204:403,headers:cors});
 try{const r=await handle(request,env);const h=new Headers(r.headers);for(const [key,value] of Object.entries(cors))h.set(key,value);return new Response(r.body,{status:r.status,headers:h});}
 catch(e){if(!e?.status)console.error('Unexpected request error',String(e?.message||'').slice(0,200));return json({ok:false,error:e?.code||'INTERNAL_ERROR',message:e?.status?e.message:'Erro interno, tente novamente.'},e?.status||500,cors);}
}};
