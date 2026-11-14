/**
 * DIS v0.2 O3: source-scoped, data-only local rule *candidate* + shadow probe.
 * NOT an AOT-selected Evolution Slot / runtime activation / qualified rule.
 * No caller-supplied qualification or activation authority is accepted.
 */
import {createHash} from 'node:crypto';

const FN='xdownload.describePolicy';
const VERSION='1.0.0';
const SOURCE='xdownload-business';
const SOURCE_BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const MAX_RULE_BYTES=2048;
const fail=code=>{throw Object.assign(new Error(code),{code})};
function record(obj, keys){
 try{
  if(obj===null||typeof obj!=='object'||Array.isArray(obj))return null;
  if(Object.getPrototypeOf(obj)!==Object.prototype && Object.getPrototypeOf(obj)!==null)return null;
  const names=Reflect.ownKeys(obj);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const out=Object.create(null);
  for(const k of keys){
   const d=Object.getOwnPropertyDescriptor(obj,k);
   if(!d||!Object.hasOwn(d,'value'))return null;
   out[k]=d.value;
  }
  return out;
 }catch{return null}
}
function read(obj,k){
 try{
  if(obj===null||typeof obj!=='object'||Array.isArray(obj))return undefined;
  if(Object.getPrototypeOf(obj)!==Object.prototype&&Object.getPrototypeOf(obj)!==null)return undefined;
  const d=Object.getOwnPropertyDescriptor(obj,k);
  return d&&Object.hasOwn(d,'value')?d.value:undefined;
 }catch{return undefined}
}
const sha256=x=>createHash('sha256').update(x).digest('hex');
const selected=app=>{
 try{
  return Array.isArray(app?.functions)&&app.functions.includes(FN)&&
   app?.contractVersions?.[FN]===VERSION&&typeof app?.invoke==='function';
 }catch{return false}
};
function selectedObservation(o){
 const source=read(read(o,'evidence'),'source');
 return read(o,'kind')==='OBSERVATION' && read(o,'disposition')==='OBSERVED' &&
  read(o,'authority')==='NONE' && read(o,'contractVersion')===VERSION &&
  read(read(o,'value'),'domainId')==='downloads' &&
  read(read(o,'evidence'),'attested')===false &&
  read(source,'sourceId')===SOURCE&&read(source,'gitBlob')===SOURCE_BLOB&&
  typeof read(source,'sha256')==='string'&&/^[a-f0-9]{64}$/.test(read(source,'sha256'));
}
const result=(reason,extra={})=>Object.freeze({
 status:'NEED_MORE_EVIDENCE',scope:'SHADOW_ONLY',
 authority:'NONE',ruleActivated:false,experienceIssued:false,
 effectDispatched:false,qualified:false,reason,...extra
});
/** Only accepts an exact, normalized JSON-like grammar. Not a general interpreter. */
export function prepareO3ShadowCandidate(input){
 const x=record(input,['schema','functionId','contractVersion','sourceGitBlob','op','field','equals']);
 if(!x||x.schema!=='dis.v0.2.o3-shadow-candidate/1'||x.functionId!==FN||
  x.contractVersion!==VERSION||x.sourceGitBlob!==SOURCE_BLOB||
  x.op!=='eq'||x.field!=='value.domainId'||x.equals!=='downloads')
  fail('O3_RULE_NOT_SELECTED_OR_UNSAFE');
 const normalized=JSON.stringify(x);
 if(Buffer.byteLength(normalized)>MAX_RULE_BYTES)fail('O3_RULE_TOO_LARGE');
 const digest=sha256(normalized);
 // The hash binds a *candidate*, not trusted authority or an AOT-selection.
 return Object.freeze({schema:x.schema,functionId:FN,contractVersion:VERSION,
  sourceGitBlob:SOURCE_BLOB,digest,disposition:'CANDIDATE_SHADOW_ONLY',
  qualified:false,activationAllowed:false});
}
export function makeO3Shadow({app,candidate,maxWaitMs=1000}={}){
 if(!selected(app))fail('O3_NATIVE_FUNCTION_NOT_SELECTED');
 const c=record(candidate,['schema','functionId','contractVersion','sourceGitBlob','digest','disposition','qualified','activationAllowed']);
 const expected=prepareO3ShadowCandidate({schema:'dis.v0.2.o3-shadow-candidate/1',functionId:FN,
  contractVersion:VERSION,sourceGitBlob:SOURCE_BLOB,op:'eq',field:'value.domainId',equals:'downloads'});
 if(!c||c.schema!==expected.schema||c.disposition!==expected.disposition||
  c.functionId!==FN||c.contractVersion!==VERSION||c.sourceGitBlob!==SOURCE_BLOB||
  c.qualified!==false||c.activationAllowed!==false||c.digest!==expected.digest)
  fail('O3_CANDIDATE_UNQUALIFIED');
 if(!Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>15000)fail('O3_BUDGET_INVALID');
 let used=false;
 return Object.freeze({
  async probe(){
   if(used)return result('SHADOW_BUDGET_EXHAUSTED');
   used=true;
   let timer;
   try{
    // Timeout constrains waiting, not synchronous work, no Effect rights are passed.
    const observation=await Promise.race([
     Promise.resolve().then(()=>app.invoke(FN,{})),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TIMEOUT')),maxWaitMs)})
    ]);
    if(!selectedObservation(observation))return result('SOURCE_OBSERVATION_UNQUALIFIED');
    return result('MATCHED_READ_ONLY_CANDIDATE_NOT_QUALIFIED',{
     candidateDigest:c.digest,shadowMatched:true,
     observedSourceGitBlob:SOURCE_BLOB
    });
   }catch{return result('SHADOW_OBSERVATION_UNKNOWN')}
   finally{if(timer)clearTimeout(timer)}
  }
 });
}
