/**
 * DIS 0.2 native contract shared by BUILD and the public Microkernel SDK.
 * The V10 BUILD and KDP remain the only owners of module selection and Effects.
 * This additive ABI has no authority to admit, execute, or mint KDP permits.
 */
import {createHash} from 'node:crypto';
import {sha256Canonical} from './dist/digest.js';

export const DIS_V020_PROGRAM='dis.v0.2.program/1';
export const DIS_V020_AOT='dis.v0.2.aot/1';
const ID=/^[A-Za-z][A-Za-z0-9._:@/-]{0,127}$/;
const HEX=/^[a-f0-9]{64}$/;
const GIT=/^[a-f0-9]{40}$/;
const ELEMENT_KINDS=new Set(['global','knowledge','rule','stateful','workflow','effect','interaction']);
const FUNCTION_KINDS=new Set(['init','knowledge','rule','stateful','workflow','effect','interaction']);
const REL_KINDS=new Set(['depends-on','constrains','cooperates','defines']);
// DKE producer JSON-LD/receipt content is a provenance DATA dependency,
// never a Function executable. Keep the allowance narrow, Git-blob pinned.
const DKE_DATA_ORIGIN=/^docs\/standards\/dke\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:json|json\.zlib\.b64|mjs\.zlib\.b64)$/;
// B18/R64 + B19/R65 source-specific exceptions: a real Tally JSON-LD Knowledge DATA file is
// not executable, and the DKE R23 original Reader is source-pinned LOCAL code.
// Do not expand docs/ or .mjs broadly; the original Git commit + Blob are mandatory.
const R64_SOURCE_EXCEPTIONS=Object.freeze([
 Object.freeze({role:'DATA',repository:'kaicreator-mm/tally',
  commit:'3e94685ca57a4b7258988826697af1c1c3a6b3c8',
  path:'docs/versions/v2.1.1/knowledge/generated/graph.jsonld',
  gitBlob:'0f6007315fd7352fe6fd218effcfecf672cb4961'}),
 Object.freeze({role:'LOCAL_CODE',repository:'kaicreator-mm/domain-forge',
  commit:'1f3b39a2a6716c1e977e726fd3737d9bd590a412',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r23-ev16-bound-reader/verified-reader.mjs',
  gitBlob:'c37b09082a50eeec7e17c17ecd9366a79c4ce8ae'}),
 // B19/R65: R26 strict-typed reusable Reader; exact producer commit+Git Blob
 // is an additional LOCAL_CODE source, never a docs-wide executable exception.
 Object.freeze({role:'LOCAL_CODE',repository:'kaicreator-mm/domain-forge',
  commit:'38f5c6bbb93873f5042dd0afd31e6b051639d41d',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r23-ev16-bound-reader/verified-reader.mjs',
  gitBlob:'b0e02389abc156cbd8006371765d597ebf86c61c'}),
 // C1/R90: one exact source-first independently reviewed R31 Markdown report
 // may be AOT-pinned as read-only DATA. Do NOT add a docs-wide Markdown
 // exception: executable LOCAL binding is explicitly forbidden for this pin.
 Object.freeze({role:'DATA',repository:'kaicreator-mm/domain-forge',
  commit:'4667becfdc9bfb382bbe830150fa7c9af4533ba2',
  path:'docs/standards/dke/DKE-0.0.1/demos/knowledge-solidification-rv-r0/cross-domain-r8/executions/r31-d02-firstparty-source-cq/INDEPENDENT_SOURCE_FIRST_R31_REVIEW.md',
  gitBlob:'10cc8aeade4b9019105490c08995aa7496e093f4'})
]);
const r64Exception=origin=>R64_SOURCE_EXCEPTIONS.find(item=>
 origin!==null&&typeof origin==='object'&&
 ['repository','commit','path','gitBlob'].every(k=>origin[k]===item[k]));
const sourceOriginIsData=origin=>DKE_DATA_ORIGIN.test(origin?.path??'')||
 r64Exception(origin)?.role==='DATA';
const MAX=256;

/** R11 bounded Function Contract — source evidence is NOT business attestation. */
const OUTCOMES=new Set(['OBSERVED','UNKNOWN','FAILED','NEEDS_INPUT','NEEDS_CONFIRMATION','PENDING_AUTHORIZATION','SUCCEEDED']);
const VALUE_TYPES=new Set(['string','boolean','number','record','array']);
const KDP_ADMISSIONS=new Set(['ADMITTED','DENIED','UNKNOWN']);
const SEMVER=/^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;

const FIELD=/^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const UNSAFE_METHODS=new Set(['constructor','prototype','__proto__','then']);
function validateLocalHandleContract(c){
 keys(c,['schema','version','methods','lifetime','factoryInput','methodIO']);
 if(c.schema!=='dis.v0.2.local-handle-contract/1'||!SEMVER.test(c.version)||
    c.lifetime!=='PROCESS_LOCAL'||!arr(c.methods)||c.methods.length>16||
    new Set(c.methods).size!==c.methods.length||
    c.methods.some(m=>typeof m!=='string'||!FIELD.test(m)||UNSAFE_METHODS.has(m)))
  fail('DIS_LOCAL_HANDLE_CONTRACT_INVALID');
 if((c.factoryInput===undefined)!==(c.methodIO===undefined))
  fail('DIS_LOCAL_HANDLE_IO_INCOMPLETE');
 if(c.methodIO!==undefined){
  if(c.factoryInput!=='CLOCK_FUNCTION'||!record(c.methodIO)||
    Object.keys(c.methodIO).length!==c.methods.length||
    c.methods.some(n=>!Object.hasOwn(c.methodIO,n)))
   fail('DIS_LOCAL_HANDLE_IO_INVALID');
  for(const io of Object.values(c.methodIO)){
   keys(io,['args','returns','record']);
   if(!arr(io.args,true)||io.args.length>8||
     !['void','records','nullable-record'].includes(io.returns))
    fail('DIS_LOCAL_HANDLE_IO_INVALID');
   for(const a of io.args)validateShape(a);
   if(io.returns==='void'){
    if(io.record!==undefined)fail('DIS_LOCAL_HANDLE_IO_INVALID');
   }else{
    if(io.record===undefined)fail('DIS_LOCAL_HANDLE_IO_INVALID');
    validateShape(io.record);
   }
  }
 }
}
/**
 * The returned class instance may be used only in-process. Method shape is
 * checked, not its business truth or delegated authority.
 */
export function validateDisV020LocalHandle(contract,value){
 validateLocalHandleContract(contract);
 if(value===null||typeof value!=='object'||Array.isArray(value)||
    Object.getPrototypeOf(value)===null||record(value)||
    contract.methods.some(name=>typeof value[name]!=='function'))
  fail('DIS_LOCAL_HANDLE_INVALID');
 return true;
}

/** Source-bound in-process Handle; never serialized or accepted as semantic SAP. */
export function bindDisV020LocalHandle(contract,value){
 validateDisV020LocalHandle(contract,value);
 if(contract.methodIO===undefined)return value;
 // Do not expose the Runx class instance/prototype or its TS-private
 // runtime fields. These methods are the entire selected public surface.
 const api=Object.create(null);
 for(const name of [...contract.methods]){
  const original=value[name],io=structuredClone(contract.methodIO[name]);
  const invoke=(...args)=>{
   if(args.length!==io.args.length||args.some((x,i)=>!valueMatchesShape(io.args[i],x)))
    fail('DIS_LOCAL_HANDLE_INPUT_INVALID');
   const result=Reflect.apply(original,value,args);
   if(io.returns==='void'){
    if(result!==undefined)fail('DIS_LOCAL_HANDLE_OUTPUT_INVALID');
    return undefined;
   }
   if(io.returns==='nullable-record'){
    if(result!==null&&!valueMatchesShape(io.record,result))
     fail('DIS_LOCAL_HANDLE_OUTPUT_INVALID');
    // Return a detached read-only observation, not the mutable source row.
    return result===null?null:Object.freeze(structuredClone(result));
   }
   if(!Array.isArray(result)||result.length>MAX||
      result.some(x=>!valueMatchesShape(io.record,x)))
    fail('DIS_LOCAL_HANDLE_OUTPUT_INVALID');
   return Object.freeze(result.map(x=>Object.freeze(structuredClone(x))));
  };
  Object.defineProperty(api,name,{value:Object.freeze(invoke),enumerable:true,
   writable:false,configurable:false});
 }
 return Object.freeze(api);
}
/** Business App Init has a typed lifecycle envelope, not a second Kernel. */
function validateAppInitContract(c){
 keys(c,['schema','version','input','output','outcomes','compatibility']);
 if(c.schema!=='dis.v0.2.app-init-contract/1'||!SEMVER.test(c.version)||
    c.input===undefined||c.output===undefined)
  fail('DIS_APP_INIT_CONTRACT_INVALID');
 validateShape(c.input);validateShape(c.output);
 const i=c.input.fields??{},o=c.output.fields??{};
 if(i.appId!=='string'||i.domainIds!=='array'||i.buildPin!=='string'||
    i.aotDigest!=='string'||i.functions!=='array'||o.status!=='string')
  fail('DIS_APP_INIT_SCHEMA_INVALID');
 keys(c.outcomes,['READY','DEGRADED','BLOCKED','FAILED']);
 for(const state of ['READY','DEGRADED','BLOCKED','FAILED'])
  if(c.outcomes[state]!==state)fail('DIS_APP_INIT_OUTCOMES_INVALID');
 keys(c.compatibility,['major','minReader','maxReaderExclusive']);
 if(!Number.isSafeInteger(c.compatibility.major)||c.compatibility.major<1||
    Number(c.version.split('.')[0])!==c.compatibility.major||
    c.compatibility.minReader!=='0.2.0'||c.compatibility.maxReaderExclusive!=='0.3.0')
  fail('DIS_APP_INIT_COMPATIBILITY_INVALID');
}
function validateKdpReceiptContract(contract){
 keys(contract,['schema','version','statusMap','compatibility','input','output']);
 if(contract.schema!=='dis.v0.2.kdp-receipt-contract/1'||!SEMVER.test(contract.version))
  fail('DIS_KDP_RECEIPT_CONTRACT_INVALID');
 // R73: a complete typed KDP public Function profile describes BOTH the
 // caller envelope and the receipt, never the successful business Effect.
 if((contract.input===undefined)!==(contract.output===undefined))
  fail('DIS_KDP_RECEIPT_SCHEMA_INCOMPLETE');
 if(contract.input!==undefined){
  validateShape(contract.input);validateShape(contract.output);
  const i=contract.input.fields??{},o=contract.output.fields??{};
  if(i.messageId!=='string'||i.instanceKey!=='string'||
     i.input!=='record'||o.status!=='string')
   fail('DIS_KDP_RECEIPT_SCHEMA_INVALID');
 }
 if(!record(contract.statusMap)||Object.keys(contract.statusMap).length===0||
    Object.keys(contract.statusMap).length>MAX||contract.statusMap.admitted!=='ADMITTED')
  fail('DIS_KDP_RECEIPT_CONTRACT_INVALID');
 for(const [status,admission] of Object.entries(contract.statusMap)){
  if(!FIELD.test(status)||!KDP_ADMISSIONS.has(admission)||
     (status!=='admitted'&&admission==='ADMITTED'))
   fail('DIS_KDP_RECEIPT_ADMISSION_WEAK');
 }
 keys(contract.compatibility,['major','minReader','maxReaderExclusive']);
 if(!Number.isSafeInteger(contract.compatibility.major)||contract.compatibility.major<1||
    Number(contract.version.split('.')[0])!==contract.compatibility.major||
    contract.compatibility.minReader!=='0.2.0'||
    contract.compatibility.maxReaderExclusive!=='0.3.0')
   fail('DIS_KDP_RECEIPT_COMPATIBILITY_INVALID');
}
/** Only a genuine KDP send() result carries KDP authority; this helper alone grants none. */
export function classifyDisV020KdpReceipt(contract,receipt){
 validateKdpReceiptContract(contract);
 if(!record(receipt)||typeof receipt.status!=='string'||!receipt.status)
  fail('DIS_KDP_RECEIPT_INVALID');
 // Unrecognized statuses fail closed to UNKNOWN, never SUCCEEDED or ADMITTED.
 return Object.freeze({
  admission:contract.statusMap[receipt.status]??'UNKNOWN',
  execution:'NOT_PROVEN',businessEvidenceAttested:false
 });
}

// Opt-in bounded nested schema. Legacy string 'record'/'array' signatures stay
// unchanged; only an explicit descriptor constrains nested contents.
const MAX_SHAPE_DEPTH=5;
function validateFieldType(type,depth){
 // Schema admission and runtime matching must have the same maximum depth.
 // Previously a primitive leaf at depth 6 compiled but could never match.
 if(depth>MAX_SHAPE_DEPTH)fail('DIS_FUNCTION_SCHEMA_INVALID');
 if(typeof type==='string'){
  if(!VALUE_TYPES.has(type))fail('DIS_FUNCTION_SCHEMA_INVALID');
  return;
 }
 if(!record(type))fail('DIS_FUNCTION_SCHEMA_INVALID');
 if(type.type==='record'){validateShape(type,depth,false);return}
 if(type.type!=='array')fail('DIS_FUNCTION_SCHEMA_INVALID');
 keys(type,['type','items','minItems','maxItems']);
 const min=type.minItems??0,max=type.maxItems??MAX;
 if(type.items===undefined||!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||
    min<0||max<min||max>MAX)fail('DIS_FUNCTION_SCHEMA_INVALID');
 validateFieldType(type.items,depth+1);
}
function validateShape(shape,depth=0,top=true){
 if(depth>MAX_SHAPE_DEPTH)fail('DIS_FUNCTION_SCHEMA_INVALID');
 keys(shape,top?['type','fields','optional','additionalProperties','allowAbsent']:
  ['type','fields','optional','additionalProperties']);
 if(shape.type!=='record'||(shape.fields!==undefined&&!record(shape.fields))||
    (shape.additionalProperties!==undefined&&typeof shape.additionalProperties!=='boolean')||
    (shape.allowAbsent!==undefined&&typeof shape.allowAbsent!=='boolean'))
  fail('DIS_FUNCTION_SCHEMA_INVALID');
 const fields=shape.fields??{},optional=shape.optional??[];
 if(Object.keys(fields).length>MAX||!arr(optional,true)||new Set(optional).size!==optional.length)
  fail('DIS_FUNCTION_SCHEMA_INVALID');
 for(const [name,type] of Object.entries(fields)){
  if(!FIELD.test(name))fail('DIS_FUNCTION_SCHEMA_INVALID');
  validateFieldType(type,depth+1);
 }
 if(optional.some(name=>typeof name!=='string'||!Object.hasOwn(fields,name))||
    (shape.allowAbsent===true&&(Object.keys(fields).length!==0||
      shape.additionalProperties!==false)))
  fail('DIS_FUNCTION_SCHEMA_INVALID');
}
function valueMatchesField(type,value,depth=0){
 if(depth>MAX_SHAPE_DEPTH)return false;
 if(typeof type==='string'){
  if(type==='record')return record(value);
  if(type==='array')return Array.isArray(value);
  return type==='number'?typeof value==='number'&&Number.isFinite(value):
    typeof value===type;
 }
 if(type.type==='record')return valueMatchesShape(type,value,depth);
 if(type.type!=='array'||!Array.isArray(value))return false;
 if(value.length<(type.minItems??0)||value.length>(type.maxItems??MAX))return false;
 for(let i=0;i<value.length;i++){
  if(!Object.hasOwn(value,i)||!valueMatchesField(type.items,value[i],depth+1))return false;
 }
 return true;
}
function valueMatchesShape(shape,value,depth=0){
 // The public SDK checks input before calling a selected LOCAL Reader.
 // Never evaluate caller getters during that preflight: capture a bounded
 // own-data descriptor snapshot once, just as the downstream Reader does.
 try{
  if(!record(value)||depth>MAX_SHAPE_DEPTH)return false;
  const fields=shape.fields??{},optional=new Set(shape.optional??[]);
  const names=Reflect.ownKeys(value);
  if(names.length>MAX||names.some(name=>typeof name!=='string'))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if(names.some(name=>!Object.hasOwn(descriptors,name)||
     !Object.hasOwn(descriptors[name],'value')))return false;
  for(const [name,type] of Object.entries(fields)){
   if(!Object.hasOwn(descriptors,name)){
    if(optional.has(name))continue;
    return false;
   }
   if(!valueMatchesField(type,descriptors[name].value,depth+1))return false;
  }
  return shape.additionalProperties!==false||
   names.every(name=>Object.hasOwn(fields,name));
 }catch{
  // A hostile Proxy trap is invalid input, not a raw exception reaching the
  // selected Function; valid data still has to pass the Reader's own gate.
  return false;
 }
}
const sameFieldType=(a,b)=>typeof a==='string'&&typeof b==='string'?
 a===b:typeof a==='object'&&a!==null&&typeof b==='object'&&b!==null&&
 sha256Canonical(a)===sha256Canonical(b);
function validateFunctionContract(c){
 keys(c,['schema','version','input','output','outcomes','evidence','compatibility']);
 if(c.schema!=='dis.v0.2.function-contract/1'||!/^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(c.version))fail('DIS_FUNCTION_CONTRACT_INVALID');
 validateShape(c.input);validateShape(c.output);
 if(c.output.allowAbsent===true)fail('DIS_FUNCTION_SCHEMA_INVALID');
 keys(c.outcomes,['field','classes']);
 if(!FIELD.test(c.outcomes.field)||!record(c.outcomes.classes)||
  !Object.keys(c.outcomes.classes).length||Object.keys(c.outcomes.classes).length>MAX)fail('DIS_FUNCTION_OUTCOMES_INVALID');
 for(const [tag,disposition] of Object.entries(c.outcomes.classes)){
  if(!FIELD.test(tag)||!OUTCOMES.has(disposition))fail('DIS_FUNCTION_OUTCOMES_INVALID');
 }
 keys(c.evidence,['refField','requiredFor']);
 if(!FIELD.test(c.evidence.refField)||!arr(c.evidence.requiredFor,true)||
  new Set(c.evidence.requiredFor).size!==c.evidence.requiredFor.length||
  c.evidence.requiredFor.some(x=>!OUTCOMES.has(x)))fail('DIS_FUNCTION_EVIDENCE_INVALID');
 if(Object.values(c.outcomes.classes).includes('SUCCEEDED')&&!c.evidence.requiredFor.includes('SUCCEEDED'))
  fail('DIS_EVIDENCE_POLICY_WEAK');
 keys(c.compatibility,['major','minReader','maxReaderExclusive']);
 if(!Number.isSafeInteger(c.compatibility.major)||c.compatibility.major<1||
  Number(c.version.split('.')[0])!==c.compatibility.major||
  c.compatibility.minReader!=='0.2.0'||c.compatibility.maxReaderExclusive!=='0.3.0')
  fail('DIS_FUNCTION_COMPATIBILITY_INVALID');
}
/**
 * Bounded structural consumer-compatibility check, NOT independent evidence or
 * an authorization to replace an installed AOT. Nested descriptors are opt-in;
 * changing their structure within one major is conservatively breaking.
 * Same-version ABI drift and same-major breaking changes fail closed.
 */
export function compareDisV020FunctionContracts(previous,next){
 validateFunctionContract(previous);validateFunctionContract(next);
 const v1=previous.version.split('.').map(Number),v2=next.version.split('.').map(Number);
 if(v1[0]!==v2[0]||v2[1]<v1[1]||
    (v2[1]===v1[1]&&v2[2]<v1[2]))
  fail('DIS_FUNCTION_ABI_INCOMPATIBLE');
 if(previous.version===next.version){
  if(sha256Canonical(previous)!==sha256Canonical(next))
   fail('DIS_FUNCTION_ABI_UNVERSIONED_DRIFT');
  return Object.freeze({compatible:true,from:previous.version,to:next.version});
 }
 const broken=()=>fail('DIS_FUNCTION_ABI_INCOMPATIBLE');
 const prevIn=previous.input,nextIn=next.input;
 const prevOut=previous.output,nextOut=next.output;
 const prevInFields=prevIn.fields??{},nextInFields=nextIn.fields??{};
 const prevOutFields=prevOut.fields??{},nextOutFields=nextOut.fields??{};
 const prevInOptional=new Set(prevIn.optional??[]),nextInOptional=new Set(nextIn.optional??[]);
 const prevOutOptional=new Set(prevOut.optional??[]),nextOutOptional=new Set(nextOut.optional??[]);
 if(prevIn.additionalProperties!==false&&nextIn.additionalProperties===false)broken();
 if(prevIn.allowAbsent===true&&nextIn.allowAbsent!==true)broken();
 for(const [name,type] of Object.entries(nextInFields)){
  if(Object.hasOwn(prevInFields,name)){
   if(!sameFieldType(prevInFields[name],type)||
      (prevInOptional.has(name)&&!nextInOptional.has(name)))broken();
  }else if(!nextInOptional.has(name)||prevIn.additionalProperties!==false)broken();
 }
 for(const name of Object.keys(prevInFields)){
  if(!Object.hasOwn(nextInFields,name)&&nextIn.additionalProperties===false)broken();
 }
 for(const [name,type] of Object.entries(prevOutFields)){
  if(!sameFieldType(nextOutFields[name],type)||
     (!prevOutOptional.has(name)&&nextOutOptional.has(name)))broken();
 }
 if(prevOut.additionalProperties===false&&
    (nextOut.additionalProperties!==false||
      Object.keys(nextOutFields).some(name=>!Object.hasOwn(prevOutFields,name))))broken();
 if(previous.outcomes.field!==next.outcomes.field||
    previous.evidence.refField!==next.evidence.refField||
    previous.compatibility.minReader!==next.compatibility.minReader||
    previous.compatibility.maxReaderExclusive!==next.compatibility.maxReaderExclusive)broken();
 for(const [status,disposition] of Object.entries(previous.outcomes.classes)){
  if(next.outcomes.classes[status]!==disposition)broken();
 }
 for(const disposition of previous.evidence.requiredFor){
  if(!next.evidence.requiredFor.includes(disposition))broken();
 }
 return Object.freeze({compatible:true,from:previous.version,to:next.version});
}
export function validateDisV020FunctionValue(contract,phase,value){
 if(phase!=='input'&&phase!=='output')fail('DIS_FUNCTION_PHASE_INVALID');
 const shape=contract?.[phase];
 if(!shape)fail(phase==='input'?'DIS_FUNCTION_INPUT_INVALID':'DIS_FUNCTION_OUTPUT_INVALID');
 // An explicitly zero-parameter LOCAL Function accepts no argument as well
 // as {}. This is not the same as accepting unknown/unvalidated fields.
 if(phase==='input'&&value===undefined&&shape.allowAbsent===true)return true;
 if(!valueMatchesShape(shape,value))
  fail(phase==='input'?'DIS_FUNCTION_INPUT_INVALID':'DIS_FUNCTION_OUTPUT_INVALID');
 return true;
}
export function classifyDisV020FunctionOutcome(contract,value){
 const tag=value[contract.outcomes.field];
 const disposition=typeof tag==='string'?contract.outcomes.classes[tag]:undefined;
 if(!disposition)fail('DIS_OUTCOME_UNDECLARED');
 const refs=value[contract.evidence.refField];
 const valid=Array.isArray(refs)&&refs.length>0&&refs.length<=MAX&&
  refs.every(x=>typeof x==='string'&&x.length>0&&x.length<=2048);
 if(refs!==undefined&&!valid)fail('DIS_EVIDENCE_INVALID');
 if(contract.evidence.requiredFor.includes(disposition)&&!valid)fail('DIS_EVIDENCE_REQUIRED');
 return Object.freeze({disposition,evidenceRefs:Object.freeze(valid?[...refs]:[])});
}


/**
 * R30: bounded same-major Element ABI comparison. This checks stable public
 * identity/function membership, not domain-semantic equivalence or an
 * authorization to install an AOT with a changed contract.
 */
export function compareDisV020ElementContracts(previous,next){
 const allowed=['id','domainId','kind','description','version','packageId','dependsOn','dependencies','functions','validation'];
 keys(previous,allowed);keys(next,allowed);
 if(!SEMVER.test(previous.version)||!SEMVER.test(next.version))
  fail('DIS_ELEMENT_VERSION_INVALID');
 const a=previous.version.split('.').map(Number),b=next.version.split('.').map(Number);
 if(previous.id!==next.id||previous.domainId!==next.domainId||
    previous.kind!==next.kind||previous.packageId!==next.packageId||
    a[0]!==b[0]||b[1]<a[1]||(b[1]===a[1]&&b[2]<a[2]))
  fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
 if(previous.version===next.version){
  if(sha256Canonical(previous)!==sha256Canonical(next))
   fail('DIS_ELEMENT_UNVERSIONED_DRIFT');
  return Object.freeze({compatible:true,from:previous.version,to:next.version});
 }
 if(!arr(previous.functions,true)||!arr(next.functions,true)||
    !arr(previous.dependsOn,true)||!arr(next.dependsOn,true))
  fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
 const nextFunctions=new Map(next.functions.map(f=>[f.id,f]));
 for(const f of previous.functions){
  const target=nextFunctions.get(f.id);
  if(!target||f.kind!==target.kind||f.effect!==target.effect||
     sha256Canonical(f.binding)!==sha256Canonical(target.binding))
   fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
  // R76: every selected Public Function contract is a separate ABI
  // obligation. Membership and binding alone do not prove compatibility.
  for(const key of ['contract','receiptContract','initContract','handleContract']){
   const before=f[key],after=target[key];
   if((before===undefined)!==(after===undefined))
    fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
   if(before===undefined)continue;
   if(key==='contract'){
    try{compareDisV020FunctionContracts(before,after)}
    catch{fail('DIS_ELEMENT_ABI_INCOMPATIBLE')}
    continue;
   }
   if(!SEMVER.test(before.version)||!SEMVER.test(after.version))
    fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
   const av=before.version.split('.').map(Number),
    bv=after.version.split('.').map(Number);
   if(av[0]!==bv[0]||bv[1]<av[1]||
      (bv[1]===av[1]&&bv[2]<av[2]))
    fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
   // No verified relaxed variance rule for these special interfaces:
   // a changed KDP admission, Init lifecycle or process-local method
   // contract must not be called same-major consumer-compatible.
   const {version:_oldVersion,...oldShape}=before;
   const {version:_newVersion,...newShape}=after;
   if(sha256Canonical(oldShape)!==sha256Canonical(newShape))
    fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
  }
 }
 if(previous.dependsOn.some(id=>!next.dependsOn.includes(id)))
  fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
 // A consumer must not lose an AOT-locked Function-level dependency
 // in a same-major Element upgrade, even when the coarse edge remains.
 if(previous.dependencies!==undefined){
  if(!arr(next.dependencies,true))fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
  for(const old of previous.dependencies){
   const cur=next.dependencies.find(x=>x.element===old.element);
   if(!cur||old.functions.some(x=>!cur.functions.some(y=>
      y.id===x.id&&y.contractVersion===x.contractVersion)))
    fail('DIS_ELEMENT_ABI_INCOMPATIBLE');
  }
 }
 return Object.freeze({compatible:true,from:previous.version,to:next.version});
}

export class DisV020Error extends Error{
 constructor(code){super(code);this.name='DisV020Error';this.code=code}
}
const fail=code=>{throw new DisV020Error(code)};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const id=x=>typeof x==='string'&&ID.test(x);
const arr=(x,allowEmpty=false)=>Array.isArray(x)&&x.length<=MAX&&(allowEmpty||x.length>0);
const keys=(x,allow)=>{
 if(!record(x))fail('DIS_INVALID_RECORD');
 if(Object.keys(x).some(k=>!allow.includes(k)))fail('DIS_UNKNOWN_FIELD');
};
const unique=(items,code)=>{if(new Set(items).size!==items.length)fail(code)};
export const sourceSha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
export const sourceGitBlob=value=>{
 const bytes=Buffer.from(value,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
};
// B03 R38: a declared Target is a digest-bound installed selection claim, not
// automatic host compatibility or evidence that a native OS variant exists.
const DIS_TARGET_PLATFORMS=new Set(['linux','windows','android']);
const DIS_TARGET_ARCHITECTURES=new Set(['x64','arm64']);
function validateDisV020Target(target,selected){
 if(target===undefined)return null; // legacy experimental v0.2 artifacts
 keys(target,['schema','platform','architecture','runtime','selectedModules']);
 if(target.schema!=='dis.v0.2.selected-target/1'||
    !DIS_TARGET_PLATFORMS.has(target.platform)||
    !DIS_TARGET_ARCHITECTURES.has(target.architecture)||
    target.runtime!=='node')fail('DIS_TARGET_INVALID');
 if(!arr(target.selectedModules)||target.selectedModules.length!==selected.size)
  fail('DIS_TARGET_CLOSURE_INCOMPLETE');
 const seen=new Set();
 for(const entry of target.selectedModules){
  keys(entry,['packageId','moduleSha256']);
  if(!id(entry.packageId)||!HEX.test(entry.moduleSha256))fail('DIS_TARGET_MODULE_INVALID');
  if(seen.has(entry.packageId))fail('DIS_TARGET_MODULE_DUPLICATE');
  seen.add(entry.packageId);
  const chosen=selected.get(entry.packageId);
  if(!chosen)fail('DIS_TARGET_MODULE_UNSELECTED');
  if(chosen.moduleSha256!==entry.moduleSha256)fail('DIS_TARGET_MODULE_DRIFT');
 }
 return target;
}
function validateBuilt(built){
 if(!record(built)||built.formatVersion!=='dh.v10.build/1'||!id(built.appId)||
   !HEX.test(built.subjectDigest)||!arr(built.modules)||!arr(built.routes)||!arr(built.loadOrder))fail('DIS_BUILD_INVALID');
 const selected=new Map();
 for(const m of built.modules){
  if(!record(m)||!id(m.packageId)||typeof m.moduleSource!=='string'||!HEX.test(m.moduleSha256))fail('DIS_BUILD_INVALID');
  if(selected.has(m.packageId))fail('DIS_BUILD_DUPLICATE');
  selected.set(m.packageId,m);
  if(sourceSha256(m.moduleSource)!==m.moduleSha256)fail('DIS_BUILD_BYTES_DRIFT');
 }
 return selected;
}
function validatePins(pins){
 if(!arr(pins,true))fail('DIS_SOURCES_INVALID');
 const map=new Map();
 for(const p of pins){
  keys(p,['id','sha256','origin']);
  if(!id(p.id)||!HEX.test(p.sha256)||map.has(p.id))fail('DIS_SOURCE_PIN_INVALID');
  keys(p.origin,['repository','commit','path','gitBlob']);
  if(!/^[-\w]+\/[-\w.]+$/.test(p.origin.repository)||!GIT.test(p.origin.commit)||
     typeof p.origin.path!=='string'||p.origin.path.includes('..')||!(p.origin.path.startsWith('packages/')||p.origin.path.startsWith('examples/')||DKE_DATA_ORIGIN.test(p.origin.path)||r64Exception(p.origin))||
     !GIT.test(p.origin.gitBlob))fail('DIS_SOURCE_ORIGIN_INVALID');
  map.set(p.id,p);
 }
 return map;
}
export function qualifyDisV020Artifact(artifact){
 keys(artifact,['format','built','program','sources','digest']);
 if(artifact.format!==DIS_V020_AOT||!HEX.test(artifact.digest))fail('DIS_AOT_FORMAT_INVALID');
 const {built,program,sources}=artifact;
 const selected=validateBuilt(built),pins=validatePins(sources);
 const target=validateDisV020Target(program?.target,selected);
 keys(program,['format','appId','domains','elements','relations','appInit','target']);
 if(program.format!==DIS_V020_PROGRAM||program.appId!==built.appId||
   !arr(program.domains)||!arr(program.elements)||!arr(program.relations,true)||!id(program.appInit))fail('DIS_PROGRAM_INVALID');
 const domains=new Map();
 for(const d of program.domains){
  keys(d,['id','description','repositories']);
  if(!id(d.id)||typeof d.description!=='string'||!d.description.trim()||domains.has(d.id)||
     !arr(d.repositories)||new Set(d.repositories).size!==d.repositories.length||
     d.repositories.some(repo=>typeof repo!=='string'||!/^[-\w]+\/[-\w.]+$/.test(repo)))fail('DIS_DOMAIN_INVALID');
  domains.set(d.id,d);
 }
 const elements=new Map(),functions=new Map(),inits=[];
 // Reverse dependency is derived from the exact AOT-selected Function graph,
 // NOT from external dynamic knowledge truth or a fabricated ECP closure.
 const sourceConsumers=new Map([...pins.keys()].map(sourceId=>[sourceId,[]]));
 for(const e of program.elements){
  keys(e,['id','domainId','kind','version','description','packageId','dependsOn','dependencies','functions','validation']);
  if(!SEMVER.test(e.version))fail('DIS_ELEMENT_VERSION_INVALID');
  if(!id(e.id)||!domains.has(e.domainId)||!ELEMENT_KINDS.has(e.kind)||
     typeof e.description!=='string'||!e.description.trim()||
     !arr(e.dependsOn,true)||!arr(e.functions,e.kind==='global')||
     elements.has(e.id))fail('DIS_ELEMENT_INVALID');
  if(e.packageId!==null&&e.packageId!==undefined&&(!id(e.packageId)||!selected.has(e.packageId)))fail('DIS_ELEMENT_PACKAGE_UNSELECTED');
  if(e.kind!=='global'&&e.functions.length===0)fail('DIS_ELEMENT_NO_FUNCTION');
  unique(e.dependsOn,'DIS_DEPENDENCY_DUPLICATE');
  elements.set(e.id,e);
  for(const f of e.functions){
   keys(f,['id','kind','description','effect','binding','optional','contract','receiptContract','handleContract','initContract','sourceDependencies']);
   if(f.optional!==undefined&&typeof f.optional!=='boolean')fail('DIS_FUNCTION_INVALID');
   if(f.description!==undefined&&(
      typeof f.description!=='string'||!f.description.trim()||
      f.description.length>2048))fail('DIS_FUNCTION_DESCRIPTION_INVALID');
   if(!id(f.id)||functions.has(f.id)||!FUNCTION_KINDS.has(f.kind)||
      !['none','governed'].includes(f.effect))fail('DIS_FUNCTION_INVALID');
   if(f.contract!==undefined)validateFunctionContract(f.contract);
   if(f.receiptContract!==undefined)validateKdpReceiptContract(f.receiptContract);
   if(f.handleContract!==undefined)validateLocalHandleContract(f.handleContract);
   if(f.initContract!==undefined)validateAppInitContract(f.initContract);
   keys(f.binding,['type','sourceId','intentId']);
   const b=f.binding;
   // Interaction is an ordinary Element service, never a new Effect authority.
   if(f.kind==='interaction'&&(f.effect!=='none'||b.type!=='local'))fail('DIS_INTERACTION_EFFECT_FORBIDDEN');
   if(f.contract!==undefined&&b.type!=='local')fail('DIS_FUNCTION_CONTRACT_BINDING_UNSUPPORTED');
   if(f.receiptContract!==undefined&&(b.type!=='kdp-intent'||f.contract!==undefined||
      f.handleContract!==undefined))
    fail('DIS_KDP_RECEIPT_BINDING_UNSUPPORTED');
   if(f.handleContract!==undefined&&(f.kind!=='stateful'||f.effect!=='none'||
      b.type!=='local'||f.contract!==undefined))
    fail('DIS_LOCAL_HANDLE_BINDING_UNSUPPORTED');
   if(f.initContract!==undefined&&(f.kind!=='init'||b.type!=='local'||
      f.contract!==undefined||f.receiptContract!==undefined||
      f.handleContract!==undefined))fail('DIS_INIT_CONTRACT_BINDING_UNSUPPORTED');
   if(f.sourceDependencies!==undefined){
    if(b.type!=='local'||!arr(f.sourceDependencies)||
       new Set(f.sourceDependencies).size!==f.sourceDependencies.length||
       f.sourceDependencies.some(sourceId=>!id(sourceId)||sourceId===b.sourceId||!pins.has(sourceId)))
      fail('DIS_FUNCTION_SOURCE_DEPENDENCY_INVALID');
    for(const sourceId of f.sourceDependencies){
     if(!domains.get(e.domainId).repositories.includes(pins.get(sourceId).origin.repository))
      fail('DIS_SOURCE_DOMAIN_MISMATCH');
    }
   }
   if(b.type==='local'){
    // A selected producer DATA pin may be consumed as sourceDependencies only;
    // it cannot be registered as trusted executable LOCAL code.
    if(sourceOriginIsData(pins.get(b.sourceId)?.origin))
     fail('DIS_DATA_SOURCE_EXECUTION_FORBIDDEN');
    if(f.effect!=='none'||typeof b.sourceId!=='string'||!pins.has(b.sourceId)||
       Object.hasOwn(b,'intentId')||f.kind==='effect')fail('DIS_LOCAL_NOT_QUALIFIED');
    if(!domains.get(e.domainId).repositories.includes(pins.get(b.sourceId).origin.repository))fail('DIS_SOURCE_DOMAIN_MISMATCH');
   }else if(b.type==='kdp-intent'){
    if(f.kind==='init'||!id(b.intentId)||Object.hasOwn(b,'sourceId')||!e.packageId)fail('DIS_INTENT_INVALID');
    const business=selected.get(e.packageId);
    if(business?.role!=='business'||!business.provides?.includes('intent:'+b.intentId))fail('DIS_INTENT_NOT_SELECTED');
    const route=built.routes.find(r=>r.intentId===b.intentId);
    if(!route)fail('DIS_ROUTE_NOT_SELECTED');
    const cap=built.modules.find(m=>m.role==='capability'&&m.capabilityId===route.capabilityId&&
      m.handlers?.some(h=>h.operationId===route.operationId&&h.handler===route.handlerId));
    if(!cap)fail('DIS_CAPABILITY_NOT_SELECTED');
    if(f.effect==='governed'&&!cap.externalEffect)fail('DIS_EFFECT_NOT_SELECTED');
    if(f.effect==='none'&&cap.externalEffect)fail('DIS_EFFECT_CLASS_MISMATCH');
    if(f.kind==='effect'&&f.effect!=='governed')fail('DIS_EFFECT_CLASS_MISMATCH');
   }else fail('DIS_BINDING_UNKNOWN');
   if(f.kind==='init'){
    if(f.optional===true)fail('DIS_INIT_OPTIONAL_FORBIDDEN');
    if(e.packageId===undefined||e.packageId===null||selected.get(e.packageId)?.role!=='business')fail('DIS_INIT_BUSINESS_REQUIRED');
    inits.push(f.id);
   }
   functions.set(f.id,Object.freeze({definition:f,element:e}));
   if(b.type==='local'){
    sourceConsumers.get(b.sourceId).push(f.id);
    for(const sourceId of f.sourceDependencies??[])sourceConsumers.get(sourceId).push(f.id);
   }
  }
  // A source-referenced validation declaration is not independent truth.
  // Each selected source must really be read by this Element's bound Functions.
  if(e.validation!==undefined){
   keys(e.validation,['schema','sourceIds','authority']);
   if(e.validation.schema!=='dis.v0.2.element-validation/1'||
      e.validation.authority!=='NONE'||!arr(e.validation.sourceIds)||
      new Set(e.validation.sourceIds).size!==e.validation.sourceIds.length)
    fail('DIS_ELEMENT_VALIDATION_INVALID');
   for(const sid of e.validation.sourceIds){
    const pin=pins.get(sid);
    if(!pin||!domains.get(e.domainId).repositories.includes(pin.origin.repository))
     fail('DIS_ELEMENT_VALIDATION_SOURCE_INVALID');
    if(!e.functions.some(f=>f.binding.type==='local'&&
       (f.binding.sourceId===sid||f.sourceDependencies?.includes(sid))))
     fail('DIS_ELEMENT_VALIDATION_UNBOUND');
   }
  }
 }
 // R52: optional complete Function-level references inside each static
 // Element dependency edge. Legacy dependsOn-only AOTs remain valid. No
 // dynamic cross-Element execution authority is granted by this metadata.
 for(const e of program.elements){
  if(e.dependencies===undefined)continue;
  if(!arr(e.dependencies,e.dependsOn.length===0)||
     e.dependencies.length!==e.dependsOn.length)
   fail('DIS_FUNCTION_DEPENDENCY_INVALID');
  const targets=new Set();
  for(const dep of e.dependencies){
   keys(dep,['element','functions']);
   if(!id(dep.element)||!e.dependsOn.includes(dep.element)||targets.has(dep.element)||
      !arr(dep.functions))fail('DIS_FUNCTION_DEPENDENCY_INVALID');
   targets.add(dep.element);
   const to=elements.get(dep.element);
   if(!to)fail('DIS_FUNCTION_DEPENDENCY_UNBOUND');
   const funcs=new Set();
   for(const ref of dep.functions){
    keys(ref,['id','contractVersion']);
    if(!id(ref.id)||typeof ref.contractVersion!=='string'||
       !SEMVER.test(ref.contractVersion)||funcs.has(ref.id))
      fail('DIS_FUNCTION_DEPENDENCY_INVALID');
    funcs.add(ref.id);
    const target=to.functions.find(x=>x.id===ref.id);
    if(!target)fail('DIS_FUNCTION_DEPENDENCY_UNBOUND');
    const v=target.contract?.version??target.receiptContract?.version??target.handleContract?.version;
    if(v===undefined)fail('DIS_FUNCTION_DEPENDENCY_CONTRACT_MISSING');
    if(v!==ref.contractVersion)fail('DIS_FUNCTION_DEPENDENCY_VERSION_MISMATCH');
   }
  }
 }
 if(inits.length!==1||inits[0]!==program.appInit)fail('DIS_INIT_NOT_UNIQUE');
 const visitStatus=new Map();
 const visit=key=>{
  if(!elements.has(key))fail('DIS_DEPENDENCY_MISSING');
  if(visitStatus.get(key)===1)fail('DIS_DEPENDENCY_CYCLE');
  if(visitStatus.get(key)===2)return;
  visitStatus.set(key,1);
  for(const d of elements.get(key).dependsOn)visit(d);
  visitStatus.set(key,2);
 };
 for(const k of elements.keys())visit(k);
 // R53: source-linked relation verification is a selected LOCAL Function
 // reference, NOT an independently accepted semantic claim. Cyclic semantic
 // links do not authorize cycles in the static Element dependency DAG.
 const semanticRelations=[],relationIds=new Set();
 for(const r of program.relations){
  keys(r,['from','to','kind','contract']);
  if(!elements.has(r.from)||!elements.has(r.to)||!REL_KINDS.has(r.kind))fail('DIS_RELATION_INVALID');
  if(r.kind==='depends-on'&&!elements.get(r.to).dependsOn.includes(r.from))fail('DIS_RELATION_DEPENDENCY_MISMATCH');
  if(r.contract===undefined)continue; // Legacy metadata-only relations.
  const c=r.contract;
  keys(c,['schema','id','version','sourceId','verifierFunctionId','verifierContractVersion','applicability','authority']);
  if(c.schema!=='dis.v0.2.semantic-relation/1'||!id(c.id)||relationIds.has(c.id)||
     !SEMVER.test(c.version)||!id(c.sourceId)||!id(c.verifierFunctionId)||
     !SEMVER.test(c.verifierContractVersion)||c.applicability!=='AOT_SELECTED'||
     c.authority!=='NONE')
   fail('DIS_RELATION_CONTRACT_INVALID');
  relationIds.add(c.id);
  const fn=functions.get(c.verifierFunctionId);
  if(!fn||fn.element.id!==r.from||!['rule','knowledge'].includes(fn.definition.kind)||
     fn.definition.binding.type!=='local'||fn.definition.binding.sourceId!==c.sourceId)
   fail('DIS_RELATION_VERIFIER_UNBOUND');
  if(fn.definition.contract?.version!==c.verifierContractVersion)
   fail('DIS_RELATION_VERIFIER_VERSION_MISMATCH');
  const pin=pins.get(c.sourceId);
  if(!pin)fail('DIS_RELATION_VERIFIER_UNBOUND');
  semanticRelations.push(Object.freeze({
   id:c.id,version:c.version,from:r.from,to:r.to,kind:r.kind,
   verifierFunctionId:c.verifierFunctionId,verifierContractVersion:c.verifierContractVersion,
   sourceId:c.sourceId,sourceSha256:pin.sha256,authority:'NONE',
   applicability:'AOT_SELECTED',verifiedBusinessSemantics:false
  }));
 }
 const data={format:artifact.format,built,program,sources};
 if(sha256Canonical(data)!==artifact.digest)fail('DIS_AOT_DIGEST_DRIFT');
 return {functions,elements,selected,pins,target,semanticRelations:Object.freeze(semanticRelations),
  sourceConsumers:new Map([...sourceConsumers].map(([sourceId,ids])=>
    [sourceId,Object.freeze(ids.sort())]))};
}


// R72: public Function description and typed I/O inventory for *actual*
// selected AOT Functions. Strict metadata check is opt-in for legacy
// experimental DIS 0.2 artifacts; no missing description is fabricated from
// an Element's description or a source name. The result is NOT SAP or a
// business-validity oracle, and is not a certificate that CORE-003 is closed.
export function inspectDisV020PublicFunctionCoverage(artifact){
 const qualified=qualifyDisV020Artifact(artifact);
 const rows=[];
 for(const [id,selected] of qualified.functions){
  const fn=selected.definition;
  if(typeof fn.description!=='string'||!fn.description.trim()||
     fn.description.length>2048)
   fail('DIS_PUBLIC_FUNCTION_DESCRIPTION_REQUIRED');
  const typedIO=fn.contract!==undefined||
   (fn.receiptContract?.input!==undefined&&fn.receiptContract?.output!==undefined)||
   (fn.initContract?.input!==undefined&&fn.initContract?.output!==undefined)||
   (fn.handleContract?.factoryInput!==undefined&&fn.handleContract?.methodIO!==undefined);
  rows.push(Object.freeze({
   id,kind:fn.kind,binding:fn.binding.type,description:fn.description,
   typedIO,profile:fn.contract!==undefined?'TYPED_LOCAL_IO':
    fn.initContract?.input!==undefined?'TYPED_APP_INIT_IO':
    fn.receiptContract?.input!==undefined?'TYPED_KDP_ADMISSION_IO':
    fn.receiptContract!==undefined?'KDP_ADMISSION_RECEIPT_ONLY':
    fn.handleContract?.methodIO!==undefined?'TYPED_LOCAL_HANDLE_IO':
    fn.handleContract!==undefined?'LOCAL_HANDLE_METHODS_ONLY':
    fn.kind==='init'?'APP_INIT_LIFECYCLE_ONLY':'UNQUALIFIED_PUBLIC_IO'
  }));
 }
 rows.sort((a,b)=>a.id.localeCompare(b.id));
 const gaps=rows.filter(x=>!x.typedIO);
 return Object.freeze({
  functions:rows.length,descriptionsPresent:rows.length,
  typedIOFunctions:rows.length-gaps.length,
  missingTypedIO:Object.freeze(gaps.map(x=>x.id)),
  rows:Object.freeze(rows),
  fullCore003Ready:gaps.length===0,
  independentSAP:false,
  effectExecutionProven:false
 });
}
