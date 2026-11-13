/**
 * DIS 0.2 O2 / E03 bounded execution-origin evidence, not business validation.
 * The Host (not a caller/model) owns an Ed25519 private key and the selected
 * native AOT/SDK app. A verifier accepts ONLY an externally pinned public key;
 * an untrusted receipt cannot choose its own authority.
 *
 * No signed receipt from this module can mint Experience, PASS, Effect,
 * independent samples, cross-tenant reuse, export or release qualification.
 * Ephemeral in-memory replay protection is not crash-durable authority.
 */
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {types as nodeTypes} from 'node:util';

const FUNCTION='xdownload.interaction.inspect';
const SOURCE='xdownload-interaction';
const BLOB='f57747aa7996c88833e72288a0acd594a7ce5468';
const VERSION='dis.o2.execution-trace/1';
const HEX64=/^[a-f0-9]{64}$/;
const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const deny=reason=>Object.freeze({status:'UNKNOWN',reason,traceVerified:false,experienceIssued:false,qualified:false,authority:'NONE',effectDispatched:false,exportAllowed:false});
function ownRecord(x,expected=null){
 try{
  if(!x||typeof x!=='object'||Array.isArray(x)||nodeTypes.isProxy(x)||Object.getPrototypeOf(x)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(x);
  if(keys.some(k=>typeof k!=='string'))return false;
  if(expected&&(keys.length!==expected.length||keys.some(k=>!expected.includes(k))))return false;
  return keys.every(k=>{const d=Object.getOwnPropertyDescriptor(x,k);return !!d&&Object.hasOwn(d,'value')});
 }catch{return false}
}
function strictJSON(value){
 const visited=new Set();
 function walk(v,depth){
  if(depth>10)throw Error('O2_TRACE_DEPTH');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){
   if(v.length>4096||v.normalize('NFC')!==v||/[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(v))throw Error('O2_TRACE_STRING');
   return v;
  }
  if(typeof v==='number'&&Number.isFinite(v))return v;
  if(!v||typeof v!=='object'||nodeTypes.isProxy(v)||visited.has(v))throw Error('O2_TRACE_UNSAFE_VALUE');
  visited.add(v);
  if(Array.isArray(v)){
   if(v.length>128||Reflect.ownKeys(v).length!==v.length+1)throw Error('O2_TRACE_ARRAY');
   const a=[];
   for(let i=0;i<v.length;i++){
    const d=Object.getOwnPropertyDescriptor(v,String(i));
    if(!d||!Object.hasOwn(d,'value'))throw Error('O2_TRACE_ARRAY_HOLE');
    a.push(walk(d.value,depth+1));
   }
   visited.delete(v);return a;
  }
  if(!ownRecord(v))throw Error('O2_TRACE_RECORD');
  const output={};
  for(const key of Object.keys(v).sort()){
   if(key==='__proto__'||key==='constructor'||key==='prototype')throw Error('O2_TRACE_KEY');
   output[key]=walk(Object.getOwnPropertyDescriptor(v,key).value,depth+1);
  }
  visited.delete(v);return output;
 }
 const json=JSON.stringify(walk(value,0));
 if(Buffer.byteLength(json)>8192)throw Error('O2_TRACE_TOO_LARGE');
 return json;
}
const digest=x=>createHash('sha256').update(strictJSON(x)).digest('hex');
const isToken=x=>typeof x==='string'&&TOKEN.test(x);
const validKeys=(privateKey,publicKey)=>{
 const prv=privateKey?.type==='private'?privateKey:createPrivateKey(privateKey);
 const pub=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
 if(prv.asymmetricKeyType!=='ed25519'||pub.asymmetricKeyType!=='ed25519')throw Error('O2_TRACE_KEY_TYPE');
 if(!pub.export({type:'spki',format:'der'}).equals(createPublicKey(prv).export({type:'spki',format:'der'})))throw Error('O2_TRACE_KEY_MISMATCH');
 return prv;
};
const withDeadline=(task,ms)=>new Promise((resolve,reject)=>{
 const TIMEOUT=Symbol('O2_NATIVE_TIMEOUT');
 const timer=setTimeout(()=>reject(TIMEOUT),ms);
 Promise.resolve().then(task).then(v=>{clearTimeout(timer);resolve(v)},e=>{clearTimeout(timer);reject(e)});
});
const checkObserved=x=>ownRecord(x)&&x.kind==='OBSERVATION'&&x.authority==='NONE'&&
 typeof x.disposition==='string'&&ownRecord(x.evidence)&&x.evidence.attested===false&&
 ownRecord(x.evidence.source)&&x.evidence.source.sourceId===SOURCE&&x.evidence.source.gitBlob===BLOB&&
 typeof x.evidence.source.sha256==='string'&&HEX64.test(x.evidence.source.sha256);
const FIELDS=['version','scope','runId','functionId','sourceId','sourceGitBlob','contractVersion','inputDigest','observationDigest','disposition','authority','privacyScope','effectDispatched','experienceIssued'];

export function createControlledTraceIssuer({app,privateKey,publicKey,scope,maxWaitMs=15000}={}){
 if(!app||typeof app.invoke!=='function'||!Array.isArray(app.functions)||!app.functions.includes(FUNCTION)||!isToken(scope)||
  !Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>60000)throw Error('O2_TRACE_HOST_CONFIGURATION');
 const key=validKeys(privateKey,publicKey),reserved=new Set();
 return Object.freeze({
  async capture({input,runId}={}){
   if(!isToken(runId)||!ownRecord(input)||input.requestId!==runId)return deny('O2_RUN_ID_INVALID');
   let inputDigest;
   try{inputDigest=digest(input)}catch{return deny('O2_INPUT_UNSAFE')}
   if(reserved.has(runId))return deny('O2_RUN_REPLAY');
   reserved.add(runId); // before async invoke: concurrent clones never mint two receipts
   let observation;
   try{observation=await withDeadline(()=>app.invoke(FUNCTION,input),maxWaitMs)}catch{return deny('O2_NATIVE_UNAVAILABLE_OR_TIMEOUT')}
   if(!checkObserved(observation))return deny('O2_NATIVE_OBSERVATION_UNQUALIFIED');
   let observationDigest;
   try{observationDigest=digest(observation)}catch{return deny('O2_OBSERVATION_UNSAFE')}
   const payload={version:VERSION,scope,runId,functionId:FUNCTION,sourceId:SOURCE,sourceGitBlob:BLOB,
    contractVersion:observation.contractVersion,inputDigest,observationDigest,
    disposition:observation.disposition,authority:'NONE',privacyScope:'local-only',
    effectDispatched:false,experienceIssued:false};
   const message=Buffer.from(strictJSON(payload));
   const signature=sign(null,message,key).toString('base64url');
   return Object.freeze({status:'ISSUED_TRACE_ONLY',receipt:Object.freeze({payload:Object.freeze(payload),signature}),
    observation,authority:'NONE',experienceIssued:false,qualified:false,effectDispatched:false,exportAllowed:false});
  }
 });
}
export function createControlledTraceVerifier({publicKey,scope}={}){
 if(!isToken(scope))throw Error('O2_TRACE_VERIFIER_SCOPE');
 const pinnedKey=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
 if(pinnedKey.asymmetricKeyType!=='ed25519')throw Error('O2_TRACE_KEY_TYPE');
 const consumed=new Set();
 return Object.freeze({
  consume({receipt,input,observation,runId}={}){
   if(!isToken(runId)||!ownRecord(receipt,['payload','signature'])||
      !ownRecord(receipt.payload,FIELDS)||typeof receipt.signature!=='string'||
      !/^[A-Za-z0-9_-]{86}$/.test(receipt.signature))return deny('O2_TRACE_RECEIPT_INVALID');
   const p=receipt.payload;
   if(p.version!==VERSION||p.scope!==scope||p.runId!==runId||p.functionId!==FUNCTION||
      p.sourceId!==SOURCE||p.sourceGitBlob!==BLOB||p.authority!=='NONE'||
      p.privacyScope!=='local-only'||p.effectDispatched!==false||p.experienceIssued!==false||
      typeof p.contractVersion!=='string'||p.contractVersion.length>64||
      !HEX64.test(p.inputDigest)||!HEX64.test(p.observationDigest))return deny('O2_TRACE_SCOPE_OR_SCHEMA_MISMATCH');
   let data,actualInputHash,actualObservationHash;
   try{data=Buffer.from(strictJSON(p));actualInputHash=digest(input);actualObservationHash=digest(observation)}
   catch{return deny('O2_TRACE_UNSAFE_REPLAY_INPUT')}
   if(!checkObserved(observation)||input?.requestId!==runId||p.contractVersion!==observation.contractVersion||
      p.disposition!==observation.disposition||p.inputDigest!==actualInputHash||p.observationDigest!==actualObservationHash)
    return deny('O2_TRACE_BOUNDARY_MISMATCH');
   let valid=false;
   try{valid=verify(null,data,pinnedKey,Buffer.from(receipt.signature,'base64url'))}catch{}
   if(!valid)return deny('O2_TRACE_SIGNATURE_INVALID');
   if(consumed.has(runId))return deny('O2_TRACE_REPLAY');
   consumed.add(runId);
   // A signed execution-origin record is NOT a professional business Validator.
   return Object.freeze({status:'VERIFIED_TRACE_ONLY',reason:'INDEPENDENT_BUSINESS_VALIDATOR_MISSING',
    traceVerified:true,experienceIssued:false,qualified:false,authority:'NONE',effectDispatched:false,exportAllowed:false});
  }
 });
}
