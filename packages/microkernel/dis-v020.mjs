/**
 * DIS 0.2.0 native Microkernel SDK consumer.
 *
 * Exact AOT digest is supplied by a trusted installer independently of the
 * artifact; AOT data never self-authorizes. LOCAL is observation-only;
 * KDP_INTENT delegates to the real selected K, never to a local stub.
 */
import {load} from './dist/domain-app.js';
import {
 DisV020Error,qualifyDisV020Artifact,validateDisV020FunctionValue,classifyDisV020FunctionOutcome,classifyDisV020KdpReceipt,validateDisV020LocalHandle
} from '@kaicreator/domain-harness-contracts/dis-v020';

const refuse=code=>{throw new DisV020Error(code)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export async function loadDisV020Aot(artifact,{expectedDigest,expectedSourcePins,requireAllSourcesPinned,expectedTarget,registry,store,tenantId,deploymentIdentity}={}){
 if(typeof expectedDigest!=='string'||expectedDigest.length!==64)refuse('DIS_TRUST_ANCHOR_REQUIRED');
 const qualified=qualifyDisV020Artifact(artifact);
 if(expectedDigest!==artifact.digest)refuse('DIS_INSTALLED_AOT_MISMATCH');
 // Exact installer Target is independent of AOT-declared Target, pre-KDP.
 // Node/platform labels do not verify physical execution environments.
 if(qualified.target===null){
  if(expectedTarget!==undefined)refuse('DIS_TARGET_UNSELECTED');
 }else{
  if(!plain(expectedTarget)||Object.keys(expectedTarget).sort().join(',')!=='architecture,platform,runtime')
   refuse('DIS_TARGET_TRUST_ANCHOR_REQUIRED');
  if(!['linux','windows','android'].includes(expectedTarget.platform)||
     !['x64','arm64'].includes(expectedTarget.architecture)||expectedTarget.runtime!=='node')
   refuse('DIS_TARGET_TRUST_ANCHOR_REQUIRED');
  if(['platform','architecture','runtime'].some(k=>expectedTarget[k]!==qualified.target[k]))
   refuse('DIS_TARGET_INSTALLED_MISMATCH');
  // R44: independently compare against the actual Node runtime's OS/arch.
  // Caller-provided expectedTarget and AOT metadata cannot spoof process data.
  const hostPlatform=process.platform==='win32'?'windows':process.platform;
  if(hostPlatform!==qualified.target.platform||
     process.arch!==qualified.target.architecture)
   refuse('DIS_TARGET_HOST_MISMATCH');
 }

 // R26: an optional independent installer pin for named AOT-selected sources.
 // It is supplied by a trusted caller, NEVER read as authority from the AOT.
 // This is a load-time checkpoint, not a live watch, semantic oracle or Effect.
 if(expectedSourcePins!==undefined){
  if(!plain(expectedSourcePins)||Object.keys(expectedSourcePins).length===0)
   refuse('DIS_SOURCE_ANCHORS_INVALID');
  for(const [sourceId,expect] of Object.entries(expectedSourcePins)){
   const actual=qualified.pins.get(sourceId);
   if(!actual||!(qualified.sourceConsumers.get(sourceId)?.length>0))
    refuse('DIS_SOURCE_ANCHOR_NOT_CONSUMED');
   if(!plain(expect)||Object.keys(expect).sort().join(',')!=='origin,sha256'||
      typeof expect.sha256!=='string'||!/^[a-f0-9]{64}$/.test(expect.sha256)||
      !plain(expect.origin)||Object.keys(expect.origin).sort().join(',')!=='commit,gitBlob,path,repository'||
      typeof expect.origin.repository!=='string'||!expect.origin.repository||
      typeof expect.origin.path!=='string'||!expect.origin.path||
      typeof expect.origin.commit!=='string'||!/^[a-f0-9]{40}$/.test(expect.origin.commit)||
      typeof expect.origin.gitBlob!=='string'||!/^[a-f0-9]{40}$/.test(expect.origin.gitBlob))
    refuse('DIS_SOURCE_ANCHORS_INVALID');
   if(actual.sha256!==expect.sha256||
      ['repository','commit','path','gitBlob'].some(k=>actual.origin[k]!==expect.origin[k]))
    refuse('DIS_SOURCE_ANCHOR_STALE');
  }
 }
 // R45: opt-in complete original source closure. The trusted installer must
 // supply independent exact pins for EVERY consumed source; AOT cannot
 // self-vouch merely by listing its own source IDs/digests.
 if(requireAllSourcesPinned!==undefined&&typeof requireAllSourcesPinned!=='boolean')
  refuse('DIS_SOURCE_ANCHOR_POLICY_INVALID');
 if(requireAllSourcesPinned===true){
  if(!plain(expectedSourcePins))refuse('DIS_SOURCE_ANCHOR_COVERAGE_INCOMPLETE');
  for(const [id,consumers] of qualified.sourceConsumers){
   if(consumers.length>0&&!Object.hasOwn(expectedSourcePins,id))
    refuse('DIS_SOURCE_ANCHOR_COVERAGE_INCOMPLETE');
  }
 }
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
   selectedTarget:qualified.target===null?null:Object.freeze({platform:qualified.target.platform,architecture:qualified.target.architecture,runtime:qualified.target.runtime}),
   // Real runtime identity, not OS hardware attestation or platform-specific
   // module provenance. Null for backward-compatible untargeted artifacts.
   actualHostTarget:qualified.target===null?null:Object.freeze({
    platform:process.platform==='win32'?'windows':process.platform,
    architecture:process.arch,runtime:'node'
   }),
   // Read-only semantic relationship catalog, source-linked at AOT. It is not
   // a trusted domain oracle or an authorization for a cross-Element invoke.
   semanticRelations:qualified.semanticRelations,
   get state(){return open?result.status:'STOPPED'},
   functions:Object.freeze([...qualified.functions.keys()].filter(x=>x!==artifact.program.appInit)),
   contractVersions:Object.freeze(Object.fromEntries([...qualified.functions]
    .filter(([,x])=>x.definition.contract!==undefined||
      x.definition.receiptContract!==undefined||x.definition.handleContract!==undefined)
    .map(([id,x])=>[id,x.definition.contract?.version??
       x.definition.receiptContract?.version??x.definition.handleContract.version]))),
   async invoke(id,input,options={}){
    if(!open)refuse('DIS_APP_NOT_READY');
    const entry=qualified.functions.get(id);
    if(!entry||id===artifact.program.appInit)refuse('DIS_FUNCTION_UNBOUND');
    if(disabled.has(id))refuse('DIS_FUNCTION_UNAVAILABLE');
    const f=entry.definition;
    if(!plain(options)||Object.keys(options).some(x=>x!=='expectedContractVersion'))
     refuse('DIS_INVOKE_OPTIONS_INVALID');
    const currentContractVersion=f.contract?.version??f.receiptContract?.version??f.handleContract?.version;
    if(currentContractVersion&&options.expectedContractVersion!==undefined&&
       options.expectedContractVersion!==currentContractVersion)refuse('DIS_FUNCTION_VERSION_MISMATCH');
    if(f.contract)validateDisV020FunctionValue(f.contract,'input',input);
    if(f.binding.type==='local'){
     const value=await delegates.get(id)(input);
     if(f.handleContract){
      validateDisV020LocalHandle(f.handleContract,value);
      const pin=qualified.pins.get(f.binding.sourceId);
      return Object.freeze({
       kind:'OBSERVATION',authority:'NONE',value,
       contractVersion:f.handleContract.version,
       handle:Object.freeze({
        lifetime:'PROCESS_LOCAL',methods:Object.freeze([...f.handleContract.methods])
       }),
       evidence:Object.freeze({
        source:Object.freeze({sourceId:pin.id,sha256:pin.sha256,gitBlob:pin.origin.gitBlob}),
        attested:false
       })
      });
     }
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
