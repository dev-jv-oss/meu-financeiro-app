/** Preserve bytes on read/migration failures; reject stale-tab overwrites. */
export function openLocalStore(storage, key, migrate, fresh) {
 let original, blocked=false;
 let state;
 try {
  original=storage.getItem(key);
  if(original===null) state=fresh();
  else {
   const raw=JSON.parse(original);
   if(!raw || !Array.isArray(raw.drafts) || raw.drafts.some(d=>!d || typeof d!=='object')) throw Error('Formato local inválido.');
   state=migrate(raw);
  }
 } catch { blocked=true; state=fresh(); }
 return {
  state,
  get originalBytes(){return original;},
  get blocked(){return blocked;},
  save(next){
   if(blocked)throw Error('Armazenamento protegido: não foi possível ler os dados anteriores. Não limpe os dados do site.');
   if(storage.getItem(key)!==original)throw Error('Os dados mudaram em outra aba. Reabra o aplicativo antes de salvar.');
   const encoded=JSON.stringify(next);
   storage.setItem(key,encoded); original=encoded;
  }
 };
}
