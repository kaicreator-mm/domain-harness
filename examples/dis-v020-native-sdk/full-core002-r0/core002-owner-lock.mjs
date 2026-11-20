/**
 * CORE-002 lane r0 — executable Element source-owner / version lock.
 *
 * Source-scoped engineering layer for DIS 0.2.0 CORE-002 (Element identity,
 * cohesive Function granularity, owner semantics). The owner declaration is
 * bound to a digest-sealed locked manifest and verified at AOT assembly time,
 * BEFORE the Microkernel boots:
 *
 * - every selected Element must carry an owner declaration (missing → explicit
 *   UNKNOWN rejection, never silent pass-through);
 * - the declared owner must be a real repository string, selected by the
 *   Element's domain, equal to the manifest lock and to the Element version;
 * - every Function of every Element must be locked with its contract version
 *   AND the implementation digest (sha256 of the pinned source bytes);
 * - every dependency edge (coarse dependsOn and R52 Function-level refs) must
 *   target manifest-locked Functions;
 * - implementation drift (same declared version, different implementation
 *   bytes) fails closed.
 *
 * Honesty: this is byte/identity engineering. It proves who owns the selected
 * bytes and that the assembled bytes match the locked digests. It does NOT
 * mint publication rights, an independent professional Oracle, SAP/ECP
 * qualification, business attestation, or a Matrix promotion. Formal
 * original-source owner qualification stays with DIE #155.
 */
import {sha256Canonical} from '@kaicreator/domain-harness-contracts';
import {DisV020Error,qualifyDisV020Artifact} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';

export const CORE002_OWNER_DECLARATION_SCHEMA='core002.element-owner-declaration/1';
export const CORE002_OWNER_MANIFEST_SCHEMA='core002.element-owner-manifest/1';
export const CORE002_ASSEMBLY_RECEIPT_SCHEMA='core002.owner-locked-assembly/1';
const REPO=/^[-\w]+\/[-\w.]+$/;
const SEMVER=/^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const HEX64=/^[a-f0-9]{64}$/;
const fail=code=>{throw new DisV020Error(code)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
const strictKeys=(x,allow,code)=>{
 if(!plain(x))fail(code);
 if(Object.keys(x).some(key=>!allow.includes(key)))fail(code);
};
const declaredFunctionVersion=f=>f.contract?.version??
 f.receiptContract?.version??f.handleContract?.version??f.initContract?.version;

/**
 * Build one validated Element owner declaration (the honest submitter path).
 * functionLocks: [{fnId, sourceId, contractVersion, implementationSha256}].
 */
export function buildOwnerDeclaration({elementId,ownerRepository,ownerVersion,
 functionLocks}){
 if(typeof elementId!=='string'||elementId.length===0)
  fail('DIS_INVALID_RECORD');
 if(typeof ownerRepository!=='string'||!REPO.test(ownerRepository))
  fail('CORE002_OWNER_UNKNOWN');
 if(typeof ownerVersion!=='string'||!SEMVER.test(ownerVersion))
  fail('CORE002_ELEMENT_VERSION_UNKNOWN');
 if(!Array.isArray(functionLocks)||functionLocks.length===0)
  fail('CORE002_FUNCTION_UNLOCKED');
 const functions={};
 for(const lock of functionLocks){
  if(!plain(lock)||typeof lock.fnId!=='string'||lock.fnId.length===0||
     typeof lock.sourceId!=='string'||lock.sourceId.length===0||
     typeof lock.contractVersion!=='string'||!SEMVER.test(lock.contractVersion)||
     typeof lock.implementationSha256!=='string'||!HEX64.test(lock.implementationSha256))
   fail('CORE002_FUNCTION_UNLOCKED');
  if(Object.hasOwn(functions,lock.fnId))fail('CORE002_FUNCTION_UNLOCKED');
  functions[lock.fnId]={sourceId:lock.sourceId,
   contractVersion:lock.contractVersion,
   implementationSha256:lock.implementationSha256};
 }
 return Object.freeze({schema:CORE002_OWNER_DECLARATION_SCHEMA,elementId,
  ownerRepository,ownerVersion,functions:Object.freeze(functions)});
}

/**
 * Seal a locked owner manifest. The seal covers schema, manifestId and all
 * entries; any later entry tampering is detected before any owner decision.
 */
export function sealOwnerManifest({manifestId,entries}){
 if(typeof manifestId!=='string'||manifestId.length===0||!plain(entries))
  fail('CORE002_MANIFEST_SCHEMA_INVALID');
 const payload={schema:CORE002_OWNER_MANIFEST_SCHEMA,manifestId,entries};
 return Object.freeze({...payload,seal:sha256Canonical(payload)});
}

/** Reconstruct the declaration/manifest entry for one locked Function. */
const lockedFunctionShape=lock=>{
 strictKeys(lock,['sourceId','contractVersion','implementationSha256'],
  'CORE002_FUNCTION_UNLOCKED');
 if(typeof lock.sourceId!=='string'||lock.sourceId.length===0||
    typeof lock.contractVersion!=='string'||!SEMVER.test(lock.contractVersion)||
    typeof lock.implementationSha256!=='string'||!HEX64.test(lock.implementationSha256))
  fail('CORE002_FUNCTION_UNLOCKED');
};

/**
 * Verify owner/version/dependency locks over an exact AOT artifact and only
 * then report the assembly receipt. The artifact itself is qualified by the
 * real contract layer first; every lock violation fails closed with a typed
 * code before the Microkernel boots.
 */
export function verifyOwnerLockedAssembly({artifact,declarations,manifest}){
 const qualified=qualifyDisV020Artifact(artifact);
 if(manifest===undefined||manifest===null)fail('CORE002_MANIFEST_REQUIRED');
 strictKeys(manifest,['schema','manifestId','entries','seal'],
  'CORE002_MANIFEST_SCHEMA_INVALID');
 if(manifest.schema!==CORE002_OWNER_MANIFEST_SCHEMA||
    typeof manifest.manifestId!=='string'||manifest.manifestId.length===0||
    !plain(manifest.entries))
  fail('CORE002_MANIFEST_SCHEMA_INVALID');
 if(typeof manifest.seal!=='string'||!HEX64.test(manifest.seal)||
    manifest.seal!==sha256Canonical({
     schema:manifest.schema,manifestId:manifest.manifestId,
     entries:manifest.entries}))
  fail('CORE002_MANIFEST_SEAL_MISMATCH');
 if(!plain(declarations))fail('CORE002_OWNER_DECLARATION_MISSING');
 const program=artifact.program;
 const elementIds=new Set(program.elements.map(element=>element.id));
 for(const key of Object.keys(declarations))
  if(!elementIds.has(key))fail('CORE002_OWNER_DECLARATION_ORPHAN');
 for(const key of Object.keys(manifest.entries))
  if(!elementIds.has(key))fail('CORE002_MANIFEST_ENTRY_ORPHAN');
 const lockedElements=[];
 for(const element of program.elements){
  const declaration=declarations[element.id];
  if(declaration===undefined)fail('CORE002_OWNER_DECLARATION_MISSING');
  strictKeys(declaration,['schema','elementId','ownerRepository','ownerVersion',
   'functions'],'CORE002_OWNER_DECLARATION_INVALID');
  if(declaration.schema!==CORE002_OWNER_DECLARATION_SCHEMA)
   fail('CORE002_OWNER_DECLARATION_INVALID');
  if(declaration.elementId!==element.id)
   fail('CORE002_OWNER_DECLARATION_ELEMENT_MISMATCH');
  // UNKNOWN family: owner/version missing, blank or unrecognized shape is an
  // explicit typed rejection, never a silent pass.
  if(typeof declaration.ownerRepository!=='string'||
     !REPO.test(declaration.ownerRepository))fail('CORE002_OWNER_UNKNOWN');
  if(typeof declaration.ownerVersion!=='string'||
     !SEMVER.test(declaration.ownerVersion))
   fail('CORE002_ELEMENT_VERSION_UNKNOWN');
  const domain=program.domains.find(d=>d.id===element.domainId);
  if(!domain||!domain.repositories.includes(declaration.ownerRepository))
   fail('CORE002_OWNER_NOT_IN_DOMAIN');
  if(declaration.ownerVersion!==element.version)
   fail('CORE002_ELEMENT_VERSION_DECLARATION_MISMATCH');
  const entry=manifest.entries[element.id];
  if(entry===undefined)fail('CORE002_OWNER_UNRECOGNIZED');
  strictKeys(entry,['owner','version','functions'],'CORE002_OWNER_UNRECOGNIZED');
  if(entry.owner!==declaration.ownerRepository)fail('CORE002_OWNER_MISMATCH');
  if(entry.version!==element.version)
   fail('CORE002_ELEMENT_VERSION_LOCK_MISMATCH');
  if(!plain(entry.functions))fail('CORE002_FUNCTION_UNLOCKED');
  const lockedFunctions={};
  for(const fn of element.functions){
   const lock=entry.functions[fn.id];
   if(lock===undefined)fail('CORE002_FUNCTION_UNLOCKED');
   lockedFunctionShape(lock);
   const declared=declaredFunctionVersion(fn);
   if(declared===undefined)fail('CORE002_FUNCTION_CONTRACT_VERSION_UNKNOWN');
   if(lock.contractVersion!==declared)
    fail('CORE002_FUNCTION_CONTRACT_VERSION_MISMATCH');
   const pin=qualified.pins.get(fn.binding.sourceId);
   if(lock.sourceId!==fn.binding.sourceId)
    fail('CORE002_IMPLEMENTATION_SOURCE_MISMATCH');
   if(lock.implementationSha256!==pin.sha256)
    fail('CORE002_IMPLEMENTATION_DRIFT');
   lockedFunctions[fn.id]={sourceId:lock.sourceId,
    contractVersion:lock.contractVersion,
    implementationSha256:lock.implementationSha256};
  }
  // A sealed manifest may not lock Functions the Element does not declare:
  // lock coverage is exact, both directions fail closed.
  for(const fnId of Object.keys(entry.functions))
   if(!element.functions.some(fn=>fn.id===fnId))
    fail('CORE002_MANIFEST_FUNCTION_ORPHAN');
  lockedElements.push({elementId:element.id,owner:entry.owner,
   version:element.version,functions:lockedFunctions});
 }
 // Dependency pass: every coarse edge and every R52 Function-level reference
 // must point into the locked manifest of the target Element.
 const byElement=new Map(lockedElements.map(x=>[x.elementId,x]));
 for(const element of program.elements){
  for(const targetId of element.dependsOn){
   if(!byElement.has(targetId))fail('CORE002_DEPENDENCY_UNLOCKED');
  }
  for(const dep of element.dependencies??[]){
   const target=byElement.get(dep.element);
   if(!target)fail('CORE002_DEPENDENCY_UNLOCKED');
   for(const ref of dep.functions){
    const lock=target.functions[ref.id];
    if(!lock)fail('CORE002_DEPENDENCY_FUNCTION_UNLOCKED');
    if(lock.contractVersion!==ref.contractVersion)
     fail('CORE002_DEPENDENCY_VERSION_MISMATCH');
   }
  }
 }
 lockedElements.sort((a,b)=>a.elementId.localeCompare(b.elementId));
 return Object.freeze({
  schema:CORE002_ASSEMBLY_RECEIPT_SCHEMA,
  aotDigest:artifact.digest,
  manifestId:manifest.manifestId,
  manifestSeal:manifest.seal,
  elements:Object.freeze(lockedElements.map(x=>Object.freeze({
   elementId:x.elementId,owner:x.owner,version:x.version,
   functions:Object.freeze(x.functions)}))),
  verification:'ENGINEERING_SOURCE_SCOPED',
  independentSemanticAuthority:false,
  publicationRights:false,
  independentProfessionalOracle:false,
 });
}

/**
 * Verify the owner lock and only then boot the real Microkernel app on the
 * exact artifact digest. No authority is minted here beyond the existing SDK
 * observation semantics.
 */
export async function openOwnerLockedApp({artifact,declarations,manifest,
 registry,store,tenantId}){
 const receipt=verifyOwnerLockedAssembly({artifact,declarations,manifest});
 const app=await loadDisV020Aot(artifact,{
  expectedDigest:artifact.digest,registry,store,tenantId});
 return Object.freeze({app,receipt});
}
