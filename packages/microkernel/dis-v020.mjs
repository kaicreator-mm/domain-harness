/**
 * DIS 0.2.0 native Microkernel SDK consumer.
 *
 * Exact AOT digest is supplied by a trusted installer independently of the
 * artifact; AOT data never self-authorizes. LOCAL is observation-only;
 * KDP_INTENT delegates to the real selected K, never to a local stub.
 */
import {load} from './dist/domain-app.js';
import {
 DisV020Error,qualifyDisV020Artifact,validateDisV020FunctionValue,classifyDisV020FunctionOutcome,classifyDisV020KdpReceipt
} from '@kaicreator/domain-harness-contracts/dis-v020';

const refuse=code=>{throw new DisV020Error(code)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export async function loadDisV020Aot(artifact,{expectedDigest,registry,store,tenantId,deploymentIdentity}={}){
 if(typeof expectedDigest!=='string'||expectedDigest.length!==64)refuse('DIS_TRUST_ANCHOR_REQUIRED');
 const qualified=qualifyDisV020Artifact(artifact);
 if(expectedDigest!==artifact.digest)refuse('DIS_INSTALLED_AOT_MISMATCH');
 if(!plain(registry)||!store)refuse('DIS_RUNTIME_INPUT_INVALID');
 const delegates=new Map(),absentOptional=new Set();
 // Preflight every bounded LOCAL Function before bootstrapping the Kernel.
 // The registry belongs to the *trusted sealed consumer application*, never
 // user-supplied Intent content, remote evidence or an LLM response.
 for(const [id,{definition:f}] of qualified.functions){
  if(f.binding.type!=='local')continue;
  const pin=qualified.pins.get(f.binding.sourceId);
  const impl=registry[id];
  if(impl===undefined&&f.optional===true&&f.kind!=='init'){
   absentOptional.add(id);continue;
  }
  if(!plain(impl)||impl.sourceId!==f.binding.sourceId||
     impl.sha256!==pin.sha256||impl.gitBlob!==pin.origin.gitBlob||
     !plain(impl.origin)||['repository','commit','path','gitBlob'].some(k=>impl.origin[k]!==pin.origin[k])||
     typeof impl.execute!=='function')refuse('DIS_LOCAL_REGISTRY_MISMATCH');
  delegates.set(id,impl.execute);
 }
 let app,open=false;
 try{
  app=await load(artifact.built,{store,tenantId,deploymentIdentity});
  const selected=qualified.functions.get(artifact.program.appInit);
  if(!selected||selected.definition.kind!=='init')refuse('DIS_INIT_NOT_SELECTED');
  const result=await delegates.get(artifact.program.appInit)(Object.freeze({
   appId:artifact.built.appId,domainIds:Object.freeze(artifact.program.domains.map(x=>x.id)),
   buildPin:artifact.built.subjectDigest,aotDigest:artifact.digest,
   functions:Object.freeze([...qualified.functions.keys()].filter(x=>x!==artifact.program.appInit))
  }));
  if(!result||!['READY','DEGRADED'].includes(result.status))refuse('DIS_INIT_BLOCKED');
  const unavailable=result.unavailable??[];
  if(!Array.isArray(unavailable)||new Set(unavailable).size!==unavailable.length)refuse('DIS_INIT_INVALID');
  for(const id of absentOptional){
   if(!unavailable.includes(id))refuse('DIS_INIT_OPTIONAL_UNDECLARED');
  }
  if(result.status==='READY'&&unavailable.length)refuse('DIS_INIT_INVALID');
  for(const id of unavailable){
   const fn=qualified.functions.get(id)?.definition;
   if(!fn||fn.optional!==true||fn.kind==='init')refuse('DIS_INIT_MANDATORY_DEGRADED');
  }
  const disabled=new Set(unavailable);
  open=true;
  return Object.freeze({
   aotDigest:artifact.digest,
   get state(){return open?result.status:'STOPPED'},
   functions:Object.freeze([...qualified.functions.keys()].filter(x=>x!==artifact.program.appInit)),
   contractVersions:Object.freeze(Object.fromEntries([...qualified.functions]
    .filter(([,x])=>x.definition.contract!==undefined||x.definition.receiptContract!==undefined)
    .map(([id,x])=>[id,x.definition.contract?.version??x.definition.receiptContract.version]))),
   async invoke(id,input,options={}){
    if(!open)refuse('DIS_APP_NOT_READY');
    const entry=qualified.functions.get(id);
    if(!entry||id===artifact.program.appInit)refuse('DIS_FUNCTION_UNBOUND');
    if(disabled.has(id))refuse('DIS_FUNCTION_UNAVAILABLE');
    const f=entry.definition;
    if(!plain(options)||Object.keys(options).some(x=>x!=='expectedContractVersion'))
     refuse('DIS_INVOKE_OPTIONS_INVALID');
    const currentContractVersion=f.contract?.version??f.receiptContract?.version;
    if(currentContractVersion&&options.expectedContractVersion!==undefined&&
       options.expectedContractVersion!==currentContractVersion)refuse('DIS_FUNCTION_VERSION_MISMATCH');
    if(f.contract)validateDisV020FunctionValue(f.contract,'input',input);
    if(f.binding.type==='local'){
     const value=await delegates.get(id)(input);
     if(f.contract){
      validateDisV020FunctionValue(f.contract,'output',value);
      const typed=classifyDisV020FunctionOutcome(f.contract,value);
      const pin=qualified.pins.get(f.binding.sourceId);
      return Object.freeze({
       kind:'OBSERVATION',authority:'NONE',value,
       disposition:typed.disposition,contractVersion:f.contract.version,
       evidence:Object.freeze({
        source:Object.freeze({sourceId:pin.id,sha256:pin.sha256,gitBlob:pin.origin.gitBlob}),
        // Declared refs are unverified business claims, never KDP evidence.
        declaredRefs:typed.evidenceRefs,attested:false
       })
      });
     }
     // Observations, rule projections and stateful objects have NO ability to
     // mint an admitted Intent, live execution lease or Effect permit.
     return Object.freeze({kind:'OBSERVATION',authority:'NONE',value});
    }
    if(!plain(input)||typeof input.messageId!=='string'||!input.messageId||
       typeof input.instanceKey!=='string'||!input.instanceKey||
       !plain(input.input))refuse('DIS_INTENT_INPUT_INVALID');
    const receipt=await app.send({
     intentType:f.binding.intentId,
     messageId:input.messageId,instanceKey:input.instanceKey,input:input.input
    });
    if(f.receiptContract){
     const typed=classifyDisV020KdpReceipt(f.receiptContract,receipt);
     return Object.freeze({
      kind:'KDP_RECEIPT',authority:'KDP',receipt,
      admission:typed.admission,execution:typed.execution,
      contractVersion:f.receiptContract.version,
      // KDP admission is real authority over admission, NOT independent proof
      // of a completed Effect, current Domain fact, Claim, Review or release.
      evidence:Object.freeze({receiptAuthority:'KDP',businessAttested:false})
     });
    }
    return Object.freeze({kind:'KDP_RECEIPT',authority:'KDP',receipt});
   },
   stop(){
    if(!open)return;
    open=false;
    app.stop();
   }
  });
 }catch(e){
  open=false;
  app?.stop();
  throw e;
 }
}
