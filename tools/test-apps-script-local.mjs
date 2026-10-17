/** Runs only the supplied in-memory suites. No Apps Script services are provided. */
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const folder=process.argv[2];if(!folder)throw Error('Informe a pasta dos quatro anexos .txt.');
const blocked=name=>new Proxy({}, {get(){throw Error('I/O bloqueado: '+name)}});
const ctx=vm.createContext({console,Logger:{log:console.log},SpreadsheetApp:blocked('SpreadsheetApp'),UrlFetchApp:blocked('UrlFetchApp'),PropertiesService:blocked('PropertiesService'),LockService:blocked('LockService'),ScriptApp:blocked('ScriptApp'),Utilities:{formatDate(date,timeZone,pattern){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));
 return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g,k=>parts[{yyyy:'year',MM:'month',dd:'day',HH:'hour',mm:'minute',ss:'second'}[k]]);
}}});
for(const name of ['Texto colado.txt','Texto colado (2).txt','Texto colado (3).txt','Texto colado (4).txt'])vm.runInContext(readFileSync(resolve(folder,name),'utf8'),ctx,{filename:name,timeout:3000});
let failed=0;
for(const name of ['finCartTestes','finTestesInterpretadorV10','finTestesRotaEventoV11','finTestesVariacoesCofrinhoV12','finTestesIntegracao','finTestesAutomacao','finTestesAprovacaoCofrinhoV12','finTestesRespostasV14']){
 try{vm.runInContext(name+'()',ctx,{timeout:5000});console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+': '+e.message)}
}
console.log('Suites: 8; falhas: '+failed);process.exitCode=failed?1:0;
