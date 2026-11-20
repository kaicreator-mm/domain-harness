import {createHash} from 'node:crypto';
import {openSqliteCasStore} from '../../packages/domain-harness/src/host-v8/index.js';

/** Real file-backed SQLite CAS with the exact existing V10DocStore adapter. */
export async function openPhysicalStore(path){
 const physical=await openSqliteCasStore({path});
 const docs={
  get:key=>physical.get(key),
  put:(key,value,condition)=>physical.put(key,value,condition.kind==='create'
    ?{mustBeAbsent:true}:{mustMatchRevision:condition.revision}),
  remove:(key,condition)=>physical.remove(key,condition.kind==='create'
    ?{mustBeAbsent:true}:{mustMatchRevision:condition.revision}),
  keys:()=>physical.list(''),
 };
 return {physical,docs};
}
/** Compare stable KDP journal and instance rows, not volatile Host logs. */
export async function protectedKdpSnapshot(physical){
 const all=await physical.list('v10/k/');
 const keys=all.filter(k=>k.includes('wf-instance')||k.includes('effect-journal')||
  k.includes('original-receipt')).sort();
 const rows=[];
 for(const key of keys){const doc=await physical.get(key);if(doc)rows.push({
  key,revision:doc.revision,value:doc.value
 })}
 const digest=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 return {keys:rows.map(x=>x.key),digest,totalKdpRows:all.length,
  instanceRows:rows.filter(x=>x.key.includes('wf-instance')).length,
  effectJournalRows:rows.filter(x=>x.key.includes('effect-journal')).length};
}
