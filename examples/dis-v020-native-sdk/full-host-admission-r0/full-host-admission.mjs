/** DIE #4 R209 / #1527 Phase B — ONE selected trusted Rule/Host admission.
 * Owner-attested structural trust (single-owner ecosystem, #1527 R209 grant
 * comment 7007585312): issuer and Host keys are generated OUTSIDE the repo;
 * only public SPKI material + fingerprints + the signed installer grant are
 * committed. The pinned root is the committed registry, never a receipt
 * supplied SPKI. The admission never promotes qualification: the selected
 * Function stays OBSERVATION/UNKNOWN authority NONE, claimAttested and
 * effectDispatched stay false. R50 historical Host bytes are untouched.
 */
import {createHash,createPublicKey,createPrivateKey,sign as signBytes,
  verify as verifyBytes,generateKeyPairSync} from 'node:crypto';
import {types} from 'node:util';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from '../native-fixture.mjs';
import {makeCurrentVv815Reader} from '../r155-current-vv-815-research-consumer.mjs';
import {serializeO2UntrustedInstallerPayload,O2_INSTALLER_PAYLOAD_SCHEMA}
  from '../o2-installed-rule-trust-preflight.mjs';
import {createO2DurableNonceLedger} from '../o2-durable-nonce-ledger.mjs';

export const ADMISSION_SCHEMA='dis.v0.2.full-host-admission.r0/1';
export const HOST_RECEIPT_SCHEMA='dis.v0.2.full-host-admission.host-receipt/1';
export const TRUST_REGISTRY_SCHEMA='dis.v0.2.full-host-admission.trust-registry/1';
const HEX64=/^[0-9a-f]{64}$/,HEX40=/^[0-9a-f]{40}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const NONCE=/^[A-Za-z0-9_-]{12,128}$/;
const B64U=/^[A-Za-z0-9_-]+$/;
const GRANT_WINDOW_MS_MAX=365*86400000;
export const PIN=Object.freeze({
  graph:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0',
  forge:'63d671aa270df0eff649cd34a5f6258f4c9cbc21',
  reader:'234997708b5520d7f9ce5997eb7ad6ff963a5e68'
});
const ORIGIN=Object.freeze({
  graph:{repository:'kaicreator-mm/domain-harness',
    commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
    path:'examples/dis-v020-native-sdk/fixtures/r155-c1-v212-graph-815.jsonld',
    gitBlob:PIN.graph},
  forge:{repository:'kaicreator-mm/domain-forge',
    commit:'4e7b34075a00426fb9207f33de8115e1e670a934',
    path:'docs/standards/dke/DKE-0.0.1/demos/ev16-d04-source-tier-r0/EV16_D02_VV_SELECTED_CQ_TWO_LEG_SOURCE_REPIN_R143.json',
    gitBlob:PIN.forge},
  reader:{repository:'kaicreator-mm/domain-harness',
    commit:'064740ddecfc257ba4f3e1c50f3025b87660ea81',
    path:'examples/dis-v020-native-sdk/r155-current-vv-815-research-consumer.mjs',
    gitBlob:PIN.reader}
});
const SOURCE=Object.freeze({graph:'r188-graph-815',forge:'r188-forge-r143',reader:'r188-reader'});
const FN='dke.ev16.d02.vv.r188.observe',ELEMENT='dke.ev16.d02.vv.r188';
const BINDING='se:SCB-CS2023-VV-R1';
const RECEIPT_FIELDS=['schema','functionId','subject','tenantId','deploymentId','scope',
  'aotDigest','sdkDigest','ruleDigest','installedBytesDigest','issuerId',
  'grantFingerprint','nonce','observationDigest','observationDisposition',
  'claimAttested','effectDispatched','issuedAtMs'];
const INSTALLER_RECEIPT=['issuerId','spkiDerBase64Url','signatureBase64Url','payload'];
const GRANT_PAYLOAD=['schema','aotDigest','sdkDigest','ruleDigest','installedBytesDigest',
  'tenantId','scope','deploymentId','sourceGitBlob','nonceChallenge','issuedAtMs',
  'expiresAtMs','nonce','revocationEpoch'];
const ECP_FIELDS=['functionId','purpose','approvedFor','formalQualification','grantRef'];
const sha256=x=>createHash('sha256').update(x).digest('hex');

/** All own-data capture: reject Proxy/getters/symbols/prototype drift. */
function capture(value,keys,allowExtra=false){
  if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))return null;
  try{
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)return null;
    const own=Reflect.ownKeys(value);
    if(own.some(k=>typeof k!=='string'||(!allowExtra&&!keys.includes(k))))return null;
    if(keys.some(k=>!own.includes(k)))return null;
    const out=Object.create(null);
    for(const key of own){
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return null;
      if(keys.includes(key))out[key]=d.value;
    }
    return out;
  }catch{return null}
}
function stringList(list){
  if(list===undefined)return false;
  if(!Array.isArray(list)||types.isProxy(list))return null;
  if(list.length>128)return null;
  for(let i=0;i<list.length;i++){
    const d=Object.getOwnPropertyDescriptor(list,String(i));
    if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string')return null;
  }
  return true;
}
/** Deterministic sorted-key canonical JSON over plain own-data (bounded). */
function canonicalJson(value,depth=0){
  if(value===null||typeof value==='string'||typeof value==='boolean'||
     (typeof value==='number'&&Number.isSafeInteger(value)))return JSON.stringify(value);
  if(typeof value!=='object'||types.isProxy(value)||depth>10)return null;
  if(Array.isArray(value)){
    if(value.length>128)return null;
    const parts=[];
    for(let i=0;i<value.length;i++){
      const d=Object.getOwnPropertyDescriptor(value,String(i));
      if(!d||!Object.hasOwn(d,'value'))return null;
      const part=canonicalJson(d.value,depth+1);
      if(part===null)return null;
      parts.push(part);
    }
    return '['+parts.join(',')+']';
  }
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return null;
  const keys=Reflect.ownKeys(value);
  if(keys.some(k=>typeof k!=='string'))return null;
  keys.sort();
  const parts=[];
  for(const key of keys){
    if(key==='__proto__'||key==='constructor'||key==='prototype')return null;
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return null;
    const inner=canonicalJson(d.value,depth+1);
    if(inner===null)return null;
    parts.push(JSON.stringify(key)+':'+inner);
  }
  return '{'+parts.join(',')+'}';
}
export function serializeHostReceiptPayload(payload){
  const x=capture(payload,RECEIPT_FIELDS);
  if(!x)throw Error('ADMISSION_HOST_RECEIPT_PAYLOAD_UNSAFE');
  return Buffer.from(JSON.stringify(
    Object.fromEntries(RECEIPT_FIELDS.map(k=>[k,x[k]]))),'utf8');
}
export function deriveR188RuleDigest({aotDigest,tenantId,scope,functionId,readerSha256,readerGitBlob}){
  if(!HEX64.test(aotDigest??'')||!HEX64.test(readerSha256??'')||
     !HEX40.test(readerGitBlob??'')||!ID.test(tenantId??'')||!ID.test(scope??'')||
     !ID.test(functionId??''))throw Error('ADMISSION_RULE_DIGEST_INPUT_INVALID');
  return sha256(['dis.full-host-admission.r188.rule/v1',aotDigest,tenantId,scope,
    functionId,readerSha256,readerGitBlob].join('\0'));
}

/** Real selected AOT, byte-identical construction to the R188 boundary test. */
export async function buildR188AdmissionAot(){
  const [f,graph,forge,code]=await Promise.all([
    makeNativeFixture(),
    readFile(new URL('../fixtures/r155-c1-v212-graph-815.jsonld',import.meta.url),'utf8'),
    readFile(new URL('../fixtures/r155-ev16-d02-vv-two-leg-source-repin-r143.json',import.meta.url),'utf8'),
    readFile(new URL('../r155-current-vv-815-research-consumer.mjs',import.meta.url),'utf8')
  ]);
  for(const [key,raw] of Object.entries({graph,forge,reader:code}))
    if(sourceGitBlob(raw)!==PIN[key])throw Error('ADMISSION_SOURCE_BLOB_DRIFT_'+key.toUpperCase());
  const reader=makeCurrentVv815Reader(graph,forge);
  const sources=[...f.sources,
    ...Object.entries({graph,forge,reader:code}).map(([key,sourceText])=>({
      id:SOURCE[key],sourceText,origin:ORIGIN[key]}))];
  const program=structuredClone(f.program);
  program.domains.push({
    id:'dke.ev16.r188',description:'Unqualified 815 research observation -> O2 deny',
    repositories:['kaicreator-mm/tally','kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']});
  const fields=Object.fromEntries(Object.entries(reader.value).map(
    ([name,value])=>[name,typeof value]));
  program.elements.push({
    id:ELEMENT,domainId:'dke.ev16.r188',version:'1.0.0',kind:'knowledge',
    description:'Current 815 observation remains UNKNOWN, not an installed Rule',
    dependsOn:[],functions:[{
      id:FN,kind:'knowledge',effect:'none',
      binding:{type:'local',sourceId:SOURCE.reader},
      sourceDependencies:[SOURCE.graph,SOURCE.forge],
      contract:{
        schema:'dis.v0.2.function-contract/1',version:'1.0.0',
        input:{type:'record',fields:{subject:'string'},additionalProperties:false},
        output:{type:'record',fields,additionalProperties:false},
        outcomes:{field:'status',classes:{UNKNOWN:'UNKNOWN'}},
        evidence:{refField:'evidenceRefs',requiredFor:[]},
        compatibility:{major:1,minReader:'0.2.0',maxReaderExclusive:'0.3.0'}
      }
    }]});
  const origins={...f.expectedSourceOrigins,
    ...Object.fromEntries(Object.entries(SOURCE).map(([key,id])=>[id,ORIGIN[key]]))};
  const artifact=compileDisV020Aot({built:f.artifact.built,program,sources,expectedSourceOrigins:origins});
  const registry={...f.registry,[FN]:{
    sourceId:SOURCE.reader,sha256:sourceSha256(code),origin:ORIGIN.reader,
    gitBlob:PIN.reader,execute:input=>reader.query({subject:input.subject})}};
  const expectedSourcePins=Object.fromEntries(
    sources.filter(s=>Object.values(SOURCE).includes(s.id))
      .map(s=>[s.id,{sha256:sourceSha256(s.sourceText),origin:s.origin}]));
  return Object.freeze({artifact,registry,expectedSourcePins,reader,
    texts:Object.freeze({graph,forge,reader:code})});
}

/** Load + structurally verify the committed owner trust registry. */
export function loadFullHostAdmissionTrustRegistry({registryText,issuerSpkiBase64Url,hostSpkiBase64Url}){
  let parsed;
  try{parsed=JSON.parse(registryText)}catch{return null}
  const root=capture(parsed,['schema','recordId','authorityModel','singleOwnerEcosystem',
    'ownerGrant','issuer','host','admission','ecp','limits']);
  if(!root||root.schema!==TRUST_REGISTRY_SCHEMA||
     root.authorityModel!=='OWNER_ATTESTED_STRUCTURAL_NOT_INTERPERSONAL'||
     root.singleOwnerEcosystem!==true)return null;
  const grant=capture(root.ownerGrant,['grantRef','grantVerbatim','grantedAt','rows']);
  const issuer=capture(root.issuer,['issuerId','spkiDerBase64Url','fingerprintSha256','revocationEpochFloor','provisionedOutsideRepo']);
  const host=capture(root.host,['spkiDerBase64Url','fingerprintSha256','custody']);
  const admission=capture(root.admission,['functionId','subjectBinding','tenantId','deploymentId',
    'scope','aotDigest','sdkDigest','ruleDigest','installedBytesDigest','sourceGitBlob','sdkModulePath']);
  const ecp=capture(root.ecp,ECP_FIELDS);
  const limits=capture(root.limits,['noConformancePromotion','observationRemains','claimAttested','effectDispatched']);
  if(!grant||!issuer||!host||!admission||!ecp||!limits)return null;
  if(typeof issuerSpkiBase64Url!=='string'||issuerSpkiBase64Url!==issuer.spkiDerBase64Url||
     typeof hostSpkiBase64Url!=='string'||hostSpkiBase64Url!==host.spkiDerBase64Url)return null;
  if(!ID.test(issuer.issuerId)||!B64U.test(issuer.spkiDerBase64Url)||!B64U.test(host.spkiDerBase64Url))return null;
  if(issuer.provisionedOutsideRepo!==true)return null;
  if(!Number.isSafeInteger(issuer.revocationEpochFloor)||issuer.revocationEpochFloor<1)return null;
  if(!Array.isArray(grant.rows)||grant.rows.length!==4||!grant.rows.every(r=>[1,2,3,4].includes(r)))return null;
  if(!ID.test(admission.functionId)||admission.functionId!==FN||
     admission.subjectBinding!==BINDING||!ID.test(admission.tenantId)||
     !ID.test(admission.deploymentId)||!ID.test(admission.scope)||
     !HEX64.test(admission.aotDigest)||!HEX64.test(admission.sdkDigest)||
     !HEX64.test(admission.ruleDigest)||!HEX64.test(admission.installedBytesDigest)||
     admission.sourceGitBlob!==PIN.reader)return null;
  if(ecp.functionId!==FN||ecp.formalQualification!==false||
     typeof ecp.purpose!=='string'||ecp.purpose.length<8)return null;
  if(limits.noConformancePromotion!==true||limits.claimAttested!==false||
     limits.effectDispatched!==false||limits.observationRemains!=='OBSERVATION_UNKNOWN_AUTHORITY_NONE')return null;
  const issuerDer=Buffer.from(issuer.spkiDerBase64Url,'base64url');
  const hostDer=Buffer.from(host.spkiDerBase64Url,'base64url');
  if(sha256(issuerDer)!==issuer.fingerprintSha256||sha256(hostDer)!==host.fingerprintSha256)return null;
  let issuerKey,hostKey;
  try{
    issuerKey=createPublicKey({key:issuerDer,format:'der',type:'spki'});
    hostKey=createPublicKey({key:hostDer,format:'der',type:'spki'});
  }catch{return null}
  if(issuerKey.asymmetricKeyType!=='ed25519'||hostKey.asymmetricKeyType!=='ed25519')return null;
  return Object.freeze({schema:TRUST_REGISTRY_SCHEMA,authorityModel:root.authorityModel,
    singleOwnerEcosystem:root.singleOwnerEcosystem,grant,issuer,host,admission,ecp,limits,
    issuerKey,hostKey,issuerFingerprint:issuer.fingerprintSha256,
    hostFingerprint:host.fingerprintSha256});
}

function admissionDeny(reason,status='DENIED'){
  return Object.freeze({schema:ADMISSION_SCHEMA,status,reason,
    authority:'OWNER_ATTESTED_STRUCTURAL',admitted:false,signed:false,
    claimAttested:false,effectDispatched:false});
}

/** Pinned-root installer grant verification (root = committed registry). */
export function verifyInstallerGrantAgainstPinnedRoot({trust,receipt,nowEpochMs,observedNonces,revokedIssuerIds}){
  if(!trust||!Number.isSafeInteger(nowEpochMs)||nowEpochMs<0)return admissionDeny('ADM_OPTIONS_UNSAFE');
  const r=capture(receipt,INSTALLER_RECEIPT);
  if(!r)return admissionDeny('ADM_RECEIPT_UNSAFE');
  const p=capture(r.payload,GRANT_PAYLOAD);
  if(!p)return admissionDeny('ADM_PAYLOAD_UNSAFE');
  if(p.schema!==O2_INSTALLER_PAYLOAD_SCHEMA||
     !HEX64.test(p.aotDigest??'')||!HEX64.test(p.sdkDigest??'')||
     !HEX64.test(p.ruleDigest??'')||!HEX64.test(p.installedBytesDigest??'')||
     !HEX40.test(p.sourceGitBlob??'')||!NONCE.test(p.nonceChallenge??'')||
     !NONCE.test(p.nonce??'')||!ID.test(p.tenantId??'')||!ID.test(p.scope??'')||
     !ID.test(p.deploymentId??'')||!Number.isSafeInteger(p.revocationEpoch)||
     !Number.isSafeInteger(p.issuedAtMs)||!Number.isSafeInteger(p.expiresAtMs)||
     p.expiresAtMs<=p.issuedAtMs||p.expiresAtMs-p.issuedAtMs>GRANT_WINDOW_MS_MAX)
    return admissionDeny('ADM_PAYLOAD_SCHEMA_INVALID');
  if(r.issuerId!==trust.issuer.issuerId||typeof r.spkiDerBase64Url!=='string'||
     r.spkiDerBase64Url!==trust.issuer.spkiDerBase64Url)
    return admissionDeny('ADM_ISSUER_NOT_PINNED');
  if(p.revocationEpoch<trust.issuer.revocationEpochFloor)
    return admissionDeny('ADM_REVOCATION_EPOCH_BELOW_FLOOR');
  if(nowEpochMs<p.issuedAtMs||nowEpochMs>=p.expiresAtMs)
    return admissionDeny('ADM_EXPIRED_OR_FUTURE');
  const seen=stringList(observedNonces),revoked=stringList(revokedIssuerIds);
  if(seen===null||revoked===null)return admissionDeny('ADM_REVOCATION_INPUT_UNSAFE');
  if(seen&&observedNonces.includes(p.nonce))return admissionDeny('ADM_NONCE_REPLAY');
  if(revoked&&revokedIssuerIds.includes(r.issuerId))return admissionDeny('ADM_ISSUER_REVOKED');
  for(const [field,pin] of [['aotDigest',trust.admission.aotDigest],
      ['sdkDigest',trust.admission.sdkDigest],['ruleDigest',trust.admission.ruleDigest],
      ['installedBytesDigest',trust.admission.installedBytesDigest],
      ['sourceGitBlob',trust.admission.sourceGitBlob],
      ['tenantId',trust.admission.tenantId],['scope',trust.admission.scope],
      ['deploymentId',trust.admission.deploymentId]])
    if(p[field]!==pin)return admissionDeny('ADM_BINDING_DRIFT_'+field.toUpperCase());
  if(typeof r.signatureBase64Url!=='string'||!B64U.test(r.signatureBase64Url)||
     r.signatureBase64Url.length>128)
    return admissionDeny('ADM_SIGNATURE_FORMAT_INVALID');
  let valid=false;
  try{
    valid=verifyBytes(null,serializeO2UntrustedInstallerPayload(p),
      trust.issuerKey,Buffer.from(r.signatureBase64Url,'base64url'));
  }catch{return admissionDeny('ADM_SIGNATURE_INVALID')}
  if(!valid)return admissionDeny('ADM_SIGNATURE_INVALID');
  return Object.freeze({schema:ADMISSION_SCHEMA,status:'VERIFIED_PINNED_INSTALLER_TRUST_ROOT',
    authority:'OWNER_ATTESTED_STRUCTURAL',admitted:false,signed:false,
    issuerFingerprint:trust.issuerFingerprint,
    grantFingerprint:sha256(serializeO2UntrustedInstallerPayload(p)),
    pinnedKeyProvenance:'COMMITTED_TRUST_REGISTRY_NOT_RECEIPT_SUPPLIED',
    technicalSignatureVerified:true,claimAttested:false,effectDispatched:false});
}

/** Unsigned admission chain: ECP -> pinned grant -> same-call observe.
 *  No Host private key, no ledger, no signature: the CI re-derivation path. */
export async function createAdmissionChainVerifier({trust}){
  if(!trust)throw Error('ADMISSION_VERIFIER_TRUST_MISSING');
  const built=await buildR188AdmissionAot();
  if(built.artifact.digest!==trust.admission.aotDigest)
    throw Error('ADMISSION_AOT_DIGEST_DRIFT_FROM_TRUST_REGISTRY');
  const readerSha256=sourceSha256(built.texts.reader);
  if(sha256(built.texts.reader)!==trust.admission.installedBytesDigest||
     readerSha256!==sha256(built.texts.reader))
    throw Error('ADMISSION_INSTALLED_BYTES_DRIFT_FROM_TRUST_REGISTRY');
  const sdkModule=await readFile(new URL('../../../packages/microkernel/dis-v020.mjs',import.meta.url),'utf8');
  if(sha256(sdkModule)!==trust.admission.sdkDigest)
    throw Error('ADMISSION_SDK_DIGEST_DRIFT_FROM_TRUST_REGISTRY');
  const ruleDigest=deriveR188RuleDigest({aotDigest:built.artifact.digest,
    tenantId:trust.admission.tenantId,scope:trust.admission.scope,functionId:FN,
    readerSha256,readerGitBlob:PIN.reader});
  if(ruleDigest!==trust.admission.ruleDigest)
    throw Error('ADMISSION_RULE_DIGEST_DRIFT_FROM_TRUST_REGISTRY');
  const app=await loadDisV020Aot(built.artifact,{expectedDigest:built.artifact.digest,
    registry:built.registry,expectedSourcePins:built.expectedSourcePins,
    store:new PlainCasDocStore(),tenantId:trust.admission.tenantId});
  const preFence=({installerReceipt,subject,ecpClaim,nowEpochMs,observedNonces,revokedIssuerIds})=>{
    const ecp=capture(ecpClaim,ECP_FIELDS);
    const pinned=capture(trust.ecp,ECP_FIELDS);
    if(!ecp||!pinned||ECP_FIELDS.some(k=>ecp[k]!==pinned[k]))
      return {fenced:false,deny:admissionDeny('FAIL_CLOSED_MISSING_SAP_ECP','UNKNOWN')};
    if(subject!==trust.admission.subjectBinding)
      return {fenced:false,deny:admissionDeny('FAIL_CLOSED_SUBJECT_NOT_BOUND','UNKNOWN')};
    const grant=verifyInstallerGrantAgainstPinnedRoot({trust,receipt:installerReceipt,nowEpochMs,observedNonces,revokedIssuerIds});
    if(grant.status!=='VERIFIED_PINNED_INSTALLER_TRUST_ROOT')
      return {fenced:false,
        deny:Object.freeze({...grant,status:'UNKNOWN',reason:'FAIL_CLOSED_'+grant.reason})};
    return {fenced:true,grant};
  };
  const invokeObserve=async subject=>{
    const observation=await app.invoke(FN,{subject},{expectedContractVersion:'1.0.0'});
    if(observation.kind!=='OBSERVATION'||observation.authority!=='NONE'||
       observation.disposition!=='UNKNOWN'||
       observation.value.sourceGraphGitBlob!==PIN.graph||
       observation.value.forgeSelectedGitBlob!==PIN.forge||
       Object.hasOwn(observation,'executionPermit'))
      throw Error('ADMISSION_OBSERVATION_INVARIANT_VIOLATION');
    return observation;
  };
  const draftReceiptPayload=({grant,observation,nonce,issuedAtMs})=>{
    const canonical=canonicalJson(observation);
    if(canonical===null)throw Error('ADMISSION_OBSERVATION_NOT_CANONICALIZABLE');
    const payload={schema:HOST_RECEIPT_SCHEMA,functionId:FN,
      subject:trust.admission.subjectBinding,tenantId:trust.admission.tenantId,
      deploymentId:trust.admission.deploymentId,scope:trust.admission.scope,
      aotDigest:built.artifact.digest,sdkDigest:trust.admission.sdkDigest,
      ruleDigest:trust.admission.ruleDigest,
      installedBytesDigest:trust.admission.installedBytesDigest,
      issuerId:trust.issuer.issuerId,grantFingerprint:grant.grantFingerprint,
      nonce,observationDigest:sha256(canonical),
      observationDisposition:'OBSERVATION_UNKNOWN',claimAttested:false,
      effectDispatched:false,issuedAtMs};
    return Object.freeze(payload);
  };
  const dryAdmit=async args=>{
    const fence=preFence(args);
    if(!fence.fenced)return fence.deny;
    const observation=await invokeObserve(args.subject);
    return Object.freeze({schema:ADMISSION_SCHEMA,status:'CHAIN_VERIFIED_UNSIGNED_DRAFT',
      authority:'OWNER_ATTESTED_STRUCTURAL',admitted:false,signed:false,
      receiptPayloadDraft:draftReceiptPayload({grant:fence.grant,observation,
        nonce:args.installerReceipt.payload.nonce,issuedAtMs:null}),
      observation,claimAttested:false,effectDispatched:false});
  };
  return Object.freeze({preFence,invokeObserve,draftReceiptPayload,dryAdmit,
    artifactDigest:built.artifact.digest,stop:()=>app.stop()});
}

/** Signed same-call Host: durable nonce fence around the one real invocation. */
export async function createFullHostAdmissionHost({trust,hostPrivateKey,nonceLedger}){
  if(!trust)throw Error('ADMISSION_HOST_TRUST_MISSING');
  if(!hostPrivateKey)throw Error('ADMISSION_HOST_KEY_MISSING');
  const key=hostPrivateKey instanceof Buffer?
    createPrivateKey({key:hostPrivateKey,format:'der',type:'pkcs8'}):hostPrivateKey;
  if(key.asymmetricKeyType!=='ed25519'||
     createPublicKey(key).export({format:'der',type:'spki'}).toString('base64url')!==trust.host.spkiDerBase64Url)
    throw Error('ADMISSION_HOST_KEY_NOT_PINNED');
  const verifier=await createAdmissionChainVerifier({trust});
  if(!nonceLedger||!nonceLedger.reserve||!nonceLedger.consume||
     nonceLedger.scope!==trust.admission.scope||
     nonceLedger.expectedAotDigest!==trust.admission.aotDigest)
    throw Error('ADMISSION_HOST_LEDGER_MISMATCH');
  const admitSameCall=async ({installerReceipt,subject,ecpClaim,nowEpochMs,observedNonces,revokedIssuerIds})=>{
    const args=capture({installerReceipt,subject,ecpClaim,nowEpochMs},
      ['installerReceipt','subject','ecpClaim','nowEpochMs']);
    if(!args||!Number.isSafeInteger(args.nowEpochMs))
      return admissionDeny('ADM_OPTIONS_UNSAFE');
    const fence=verifier.preFence({installerReceipt:args.installerReceipt,subject:args.subject,
      ecpClaim:args.ecpClaim,nowEpochMs:args.nowEpochMs,observedNonces,revokedIssuerIds});
    if(!fence.fenced)return fence.deny;
    const nonce=args.installerReceipt.payload.nonce;
    if(!nonceLedger.reserve(nonce))
      return admissionDeny('ADM_NONCE_REPLAY');
    let observation;
    try{observation=await verifier.invokeObserve(args.subject)}
    catch(error){return admissionDeny('FAIL_CLOSED_OBSERVATION_INVARIANT_VIOLATION','UNKNOWN')}
    const payload=verifier.draftReceiptPayload({grant:fence.grant,observation,
      nonce,issuedAtMs:args.nowEpochMs});
    const bytes=serializeHostReceiptPayload(payload);
    const signatureBase64Url=signBytes(null,bytes,key).toString('base64url');
    if(!verifyBytes(null,bytes,trust.hostKey,Buffer.from(signatureBase64Url,'base64url')))
      return admissionDeny('FAIL_CLOSED_HOST_SIGNATURE_SELF_VERIFY');
    if(!nonceLedger.consume(nonce))
      return admissionDeny('FAIL_CLOSED_NONCE_CONSUME');
    return Object.freeze({schema:ADMISSION_SCHEMA,
      status:'SAME_CALL_ADMITTED_SIGNED_RECEIPT',
      authority:'OWNER_ATTESTED_STRUCTURAL',admitted:true,signed:true,
      receipt:Object.freeze({payload,signatureBase64Url}),
      observation,nonce,grantFingerprint:fence.grant.grantFingerprint,
      issuerFingerprint:trust.issuerFingerprint,hostFingerprint:trust.hostFingerprint,
      observationDisposition:'OBSERVATION_UNKNOWN',claimAttested:false,
      effectDispatched:false,qualified:false,
      singleOwnerEcosystem:true,durableFence:nonceLedger.scope});
  };
  return Object.freeze({admitSameCall,artifactDigest:verifier.artifactDigest,
    scope:trust.admission.scope,stop:verifier.stop});
}

/** Verify a Host receipt against the pinned Host public key + live observation. */
export function verifyHostReceiptAgainstPinnedHostKey({trust,receipt,observation,nowEpochMs}){
  if(!trust||!Number.isSafeInteger(nowEpochMs))return {status:'DENIED',reason:'ADM_RECEIPT_VERIFY_OPTIONS_UNSAFE'};
  const r=capture(receipt,['payload','signatureBase64Url']);
  if(!r)return {status:'DENIED',reason:'ADM_RECEIPT_UNSAFE'};
  const p=capture(r.payload,RECEIPT_FIELDS);
  if(!p)return {status:'DENIED',reason:'ADM_PAYLOAD_UNSAFE'};
  if(p.schema!==HOST_RECEIPT_SCHEMA||p.functionId!==trust.admission.functionId||
     p.subject!==trust.admission.subjectBinding||p.tenantId!==trust.admission.tenantId||
     p.deploymentId!==trust.admission.deploymentId||p.scope!==trust.admission.scope||
     p.aotDigest!==trust.admission.aotDigest||p.sdkDigest!==trust.admission.sdkDigest||
     p.ruleDigest!==trust.admission.ruleDigest||
     p.installedBytesDigest!==trust.admission.installedBytesDigest||
     p.issuerId!==trust.issuer.issuerId||p.claimAttested!==false||
     p.effectDispatched!==false||p.observationDisposition!=='OBSERVATION_UNKNOWN'||
     !NONCE.test(p.nonce??'')||!HEX64.test(p.grantFingerprint??'')||
     !Number.isSafeInteger(p.issuedAtMs)||p.issuedAtMs>nowEpochMs)
    return {status:'DENIED',reason:'ADM_HOST_RECEIPT_BINDING_INVALID'};
  const canonical=canonicalJson(observation);
  if(canonical===null||sha256(canonical)!==p.observationDigest)
    return {status:'DENIED',reason:'ADM_OBSERVATION_DIGEST_MISMATCH'};
  if(typeof r.signatureBase64Url!=='string'||!B64U.test(r.signatureBase64Url))
    return {status:'DENIED',reason:'ADM_SIGNATURE_FORMAT_INVALID'};
  let valid=false;
  try{
    valid=verifyBytes(null,serializeHostReceiptPayload(p),trust.hostKey,
      Buffer.from(r.signatureBase64Url,'base64url'));
  }catch{return {status:'DENIED',reason:'ADM_SIGNATURE_INVALID'}}
  if(!valid)return {status:'DENIED',reason:'ADM_SIGNATURE_INVALID'};
  return Object.freeze({status:'VERIFIED_PINNED_HOST_RECEIPT',
    authority:'OWNER_ATTESTED_STRUCTURAL',verified:true,
    hostFingerprint:trust.hostFingerprint,claimAttested:false,effectDispatched:false});
}

/** Owner provisioning helper (keys NEVER enter the repo). */
export function generateOwnerKeyPair(){
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  return Object.freeze({
    spkiDerBase64Url:publicKey.export({format:'der',type:'spki'}).toString('base64url'),
    pkcs8DerBase64Url:privateKey.export({format:'der',type:'pkcs8'}).toString('base64url'),
    fingerprintSha256:sha256(publicKey.export({format:'der',type:'spki'}))
  });
}

/** Read committed trust artifacts from the module's trust/ directory.
 *  The live receipt is optional: it does not exist before the live same-call. */
export async function readCommittedAdmissionTrust({withLiveReceipt=true}={}){
  const paths=['./trust/registry-r209.json','./trust/issuer-r209.spki.b64u',
    './trust/host-r209.spki.b64u','./trust/installer-grant-r209.json'];
  if(withLiveReceipt)paths.push('./receipts/live-same-call-r209.json');
  const texts=await Promise.all(paths.map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  const [registryText,issuerSpkiBase64Url,hostSpkiBase64Url,installerGrantText,liveReceiptText]=
    texts.map((text,index)=>index===1||index===2?text.trim():text);
  const trust=loadFullHostAdmissionTrustRegistry({registryText,issuerSpkiBase64Url,hostSpkiBase64Url});
  if(!trust)throw Error('ADMISSION_TRUST_REGISTRY_INVALID');
  return Object.freeze({trust,registryText,issuerSpkiBase64Url,hostSpkiBase64Url,
    installerGrant:JSON.parse(installerGrantText),
    liveReceipt:withLiveReceipt?JSON.parse(liveReceiptText):undefined});
}
