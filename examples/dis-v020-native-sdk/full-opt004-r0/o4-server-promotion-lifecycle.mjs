/**
 * DIS 0.2.0 OPT-004 R211 O4: in-process SERVER/meta slow-layer promotion
 * lifecycle. candidate nomination (with explicit source/summary/version) ->
 * independent validation evidence -> authorized promotion (pinned Ed25519
 * promoter identity, signature genuinely verified) -> new AOT package
 * manifest version (digest chain) -> READY_NOT_ACTIVATED with the activation
 * step explicitly separated and NOT performed by default.
 *
 * This is NOT a deployed Server, Domain/Forge, governance approval, real AOT
 * build, activation or Effect. "authenticated" here means the pinned-key
 * signature/credential checks in this module genuinely execute. Promotion
 * success itself MUST produce zero business Effect: every success and failure
 * result carries the frozen business-state counters, and no code path in this
 * module dispatches an Effect, uploads content or activates a package.
 * Multi-tenant/scope isolation is fail-closed: records are keyed by the exact
 * tenant+scope composite and are invisible across it (version privacy: only
 * digest-level manifest metadata ever leaves the authorizing scope; raw
 * candidate data never does). Consent is explicit: a pinned consent record
 * must enumerate every uploaded data field and not be expired.
 *
 * Replay: each promotion request carries a nonce consumed at most once per
 * server instance (in-memory; durable cross-restart ledger integration is a
 * documented future seam, same discipline as O2 durable nonce ledger).
 *
 * Activation seam assumptions for the Integrator (to reconcile with the O3
 * stable activation ABI after both lanes merge):
 *  - activationSlot: {slotId, pin, epoch} exported on every published manifest
 *  - slotId = 'slot:'+<scope>+':'+packageVersion
 *  - pin = sha256(contentDigest || parentManifestDigest) binding the new
 *    package to exactly one promoted candidate chain
 *  - epoch = packageVersion (strictly monotonic per tenant+scope)
 *  - activation is a separate explicit call requiring an O3 activation
 *    contract; this lane ships no O3 contract, so activatePackage is
 *    fail-closed by construction.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {types} from 'node:util';

const VERSION_CANDIDATE='dis.o4.server-candidate/1';
const VERSION_VALIDATION='dis.o4.server-validation/1';
const VERSION_PROMOTION='dis.o4.server-promotion/1';
const VERSION_CONSENT='dis.o4.server-consent/1';
const VERSION_MANIFEST='dis.o4.aot-package-manifest/1';
const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const TEXT=/^[\x20-\x7e]{1,512}$/;
const HEX=/^[a-f0-9]{64}$/;
const SIG=/^[A-Za-z0-9_-]{86}$/;
const MAX_DATA_FIELDS=32;
const MAX_FIELD_BYTES=4096;
const CANDIDATE_FIELDS=[
 'schema','candidateId','tenantId','scope','sourceSummary','sourceVersion',
 'dataFields','data','consentId','nominatedBy','nominatedAtMs'
];
const CONSENT_FIELDS=[
 'schema','consentId','tenantId','grantedBy','dataFields','purpose',
 'grantedAtMs','expiresAtMs'
];
const VALIDATION_FIELDS=[
 'version','tenantId','scope','candidateId','contentDigest','verdict',
 'validatorId','validatedAtMs','expiresAtMs'
];
const PROMOTION_FIELDS=[
 'version','serverIdentity','tenantId','scope','candidateId','contentDigest',
 'validationDigest','consentId','packageVersion','parentManifestDigest',
 'nonce','issuedAtMs','effectPolicy'
];
const MANIFEST_FIELDS=[
 'schema','packageId','tenantId','scope','packageVersion','parentManifestDigest',
 'candidateId','contentDigest','validationDigest','promotionDigest','consentId',
 'dataFieldDigests','publishedAtMs','status','activationSlot'
];
function exact(x,keys){
 try{
  if(x===null||typeof x!=='object'||Array.isArray(x)||types.isProxy(x)||
     Object.getPrototypeOf(x)!==Object.prototype)return null;
  const names=Reflect.ownKeys(x);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
  const out=Object.create(null);
  for(const key of keys){
   const d=Object.getOwnPropertyDescriptor(x,key);
   if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return null;
   out[key]=d.value;
  }
  return out;
 }catch{return null}
}
function exactSigned(x,fields){
 const rec=exact(x,['payload','signature']);
 if(!rec||typeof rec.signature!=='string'||!SIG.test(rec.signature))return null;
 const payload=exact(rec.payload,fields);
 if(!payload)return null;
 return {payload,signature:rec.signature};
}
function publicEd25519(x){
 const k=x?.type==='public'?x:createPublicKey(x);
 if(k.asymmetricKeyType!=='ed25519'||k.type!=='public')throw Error('O4_ED25519_PUBLIC_KEY_REQUIRED');
 return k;
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Buffer.from(JSON.stringify(value));
const keyOf=(tenantId,scope)=>tenantId+'\u0000'+scope;

export function createO4ServerPromotionLifecycle({
 serverIdentity,validatorPublicKey,promoterPublicKeys,now
}={}){
 if(typeof serverIdentity!=='string'||!TOKEN.test(serverIdentity)||
    !Array.isArray(promoterPublicKeys)||promoterPublicKeys.length<1||
    promoterPublicKeys.length>8)
  throw Error('O4_SERVER_CONFIGURATION_INVALID');
 const validatorKey=publicEd25519(validatorPublicKey);
 const promoterKeys=promoterPublicKeys.map(publicEd25519);
 const promoterDer=promoterKeys.map(k=>k.export({format:'der',type:'spki'}));
 if(new Set(promoterDer.map(d=>d.toString('hex'))).size!==promoterDer.length)
  throw Error('O4_PROMOTER_KEYS_NOT_INDEPENDENT');
 const promoterKeySet=new Set(promoterKeys);
 const clock=typeof now==='function'?now:()=>Date.now();
 // Business-effect counters: no code path in this module mutates these.
 // They exist so every result can prove promotion success changed nothing.
 const business={effectsDispatched:0,contentsUploaded:0,packagesActivated:0,kdpCalls:0};
 const businessState=()=>Object.freeze({...business});
 const deny=(reason,extra={})=>Object.freeze({
  status:'BLOCKED',reason,authorized:false,packagePublished:false,
  newAotBuilt:false,activated:false,effectDispatched:false,
  businessState:businessState(),authority:'NONE',...extra
 });
 const candidates=new Map();   // composite -> Map(candidateId -> record)
 const consents=new Map();     // composite -> Map(consentId -> record)
 const validations=new Map();  // composite -> Map(candidateId -> record)
 const packages=new Map();     // composite -> Map(packageVersion -> manifest)
 const usedNonces=new Set();

 function tenantMap(store,tenantId,scope){
  const k=keyOf(tenantId,scope);
  let m=store.get(k);
  if(!m){m=new Map();store.set(k,m)}
  return m;
 }
 function dataFieldSet(value){
  if(!Array.isArray(value)||value.length<1||value.length>MAX_DATA_FIELDS)return null;
  const names=new Set();
  for(const name of value){
   if(typeof name!=='string'||!TOKEN.test(name)||names.has(name))return null;
   names.add(name);
  }
  return names;
 }
 function consentedData(dataFields,data,consent){
  // Data minimization: upload carries exactly the enumerated fields, all
  // covered by the explicit consent record, each bounded in size. Keys are
  // canonically sorted so the content digest is order-independent.
  const fieldNames=[...dataFields].sort();
  if(fieldNames.length!==dataFields.size)return null;
  const rec=exact(data,fieldNames);
  if(!rec)return null;
  const digests=Object.create(null);
  for(const name of fieldNames){
   const value=rec[name];
   if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>MAX_FIELD_BYTES)return null;
   if(!consent.dataFields.has(name))return null;
   digests[name]=sha(Buffer.from(value,'utf8'));
  }
  return {data:rec,digests};
 }

 function recordConsent(consent){
  const c=exact(consent,CONSENT_FIELDS);
  if(!c||c.schema!==VERSION_CONSENT||!TOKEN.test(c.consentId)||
     !TOKEN.test(c.tenantId)||!TOKEN.test(c.grantedBy)||
     typeof c.purpose!=='string'||!TEXT.test(c.purpose)||
     !Number.isSafeInteger(c.grantedAtMs)||!Number.isSafeInteger(c.expiresAtMs)||
     c.expiresAtMs<=c.grantedAtMs)
   return deny('O4_CONSENT_RECORD_INVALID');
  const dataFields=dataFieldSet(c.dataFields);
  if(!dataFields)return deny('O4_CONSENT_DATA_FIELDS_INVALID');
  tenantMap(consents,c.tenantId,'scope:consent').set(c.consentId,Object.freeze({
   ...c,dataFields:Object.freeze(dataFields)
  }));
  return Object.freeze({status:'CONSENT_RECORDED',consentId:c.consentId,
   tenantId:c.tenantId,effectDispatched:false,businessState:businessState()});
 }

 function nominateCandidate(candidate){
  const c=exact(candidate,CANDIDATE_FIELDS);
  if(!c||c.schema!==VERSION_CANDIDATE||!TOKEN.test(c.candidateId)||
     !TOKEN.test(c.tenantId)||!TOKEN.test(c.scope)||
     typeof c.sourceSummary!=='string'||!TEXT.test(c.sourceSummary)||
     typeof c.sourceVersion!=='string'||!TEXT.test(c.sourceVersion)||
     !TOKEN.test(c.consentId)||
     !Number.isSafeInteger(c.nominatedAtMs))
   return deny('O4_CANDIDATE_SCHEMA_INVALID');
  const dataFields=dataFieldSet(c.dataFields);
  if(!dataFields)return deny('O4_CANDIDATE_DATA_FIELDS_INVALID');
  // Upload requires the explicitly referenced consent record: present,
  // unexpired, and covering every enumerated data field.
  const consentMap=consents.get(keyOf(c.tenantId,'scope:consent'))||new Map();
  const consent=consentMap.get(c.consentId);
  if(!consent||consent.expiresAtMs<=clock())return deny('O4_UPLOAD_WITHOUT_CONSENT');
  if([...dataFields].some(f=>!consent.dataFields.has(f)))
   return deny('O4_DATA_EXCEEDS_CONSENT_ENUMERATION');
  const minimized=consentedData(dataFields,c.data,consent);
  if(!minimized)return deny('O4_DATA_EXCEEDS_CONSENT_ENUMERATION');
  const contentDigest=sha(canonical({
   sourceSummary:c.sourceSummary,sourceVersion:c.sourceVersion,
   dataFields:[...dataFields].sort(),data:minimized.data
  }));
  tenantMap(candidates,c.tenantId,c.scope).set(c.candidateId,Object.freeze({
   ...c,dataFields:Object.freeze(dataFields),data:Object.freeze(minimized.data),
   dataFieldDigests:Object.freeze(minimized.digests),contentDigest,
   consentId:consent.consentId,state:'CANDIDATE_NOMINATED'
  }));
  return Object.freeze({status:'CANDIDATE_NOMINATED',candidateId:c.candidateId,
   tenantId:c.tenantId,scope:c.scope,contentDigest,consentId:consent.consentId,
   effectDispatched:false,businessState:businessState()});
 }

 function recordValidation(receipt){
  const signed=exactSigned(receipt,VALIDATION_FIELDS);
  if(!signed)return deny('O4_VALIDATION_RECEIPT_UNSAFE');
  const p=signed.payload;
  let verified=false;
  try{verified=verify(null,canonical(p),validatorKey,Buffer.from(signed.signature,'base64url'))}
  catch{return deny('O4_VALIDATOR_SIGNATURE_INVALID')}
  if(!verified)return deny('O4_VALIDATOR_SIGNATURE_INVALID');
  if(p.version!==VERSION_VALIDATION)return deny('O4_VALIDATION_VERSION_MISMATCH');
  if(p.verdict!=='PASS')return deny('O4_VALIDATION_VERDICT_NOT_PASS');
  if(!TOKEN.test(p.tenantId)||!TOKEN.test(p.scope)||!TOKEN.test(p.candidateId)||
     !TOKEN.test(p.validatorId)||!HEX.test(p.contentDigest)||
     !Number.isSafeInteger(p.validatedAtMs)||!Number.isSafeInteger(p.expiresAtMs))
   return deny('O4_VALIDATION_RECEIPT_SCHEMA_INVALID');
  if(p.expiresAtMs<=clock())return deny('O4_VALIDATION_RECEIPT_EXPIRED',{status:'STALE'});
  const candidate=(candidates.get(keyOf(p.tenantId,p.scope))||new Map()).get(p.candidateId);
  if(!candidate)return deny('O4_VALIDATION_CANDIDATE_NOT_FOUND');
  if(candidate.contentDigest!==p.contentDigest)
   return deny('O4_VALIDATION_DIGEST_MISMATCH');
  const validation=Object.freeze({...p,signature:signed.signature,
   validationDigest:sha(canonical(p))});
  tenantMap(validations,p.tenantId,p.scope).set(p.candidateId,validation);
  const candidateMap=candidates.get(keyOf(p.tenantId,p.scope));
  candidateMap.set(p.candidateId,Object.freeze({...candidate,state:'VALIDATION_RECORDED'}));
  return Object.freeze({status:'VALIDATION_RECORDED',candidateId:p.candidateId,
   tenantId:p.tenantId,scope:p.scope,contentDigest:p.contentDigest,
   validationDigest:sha(canonical(p)),effectDispatched:false,
   businessState:businessState()});
 }

 function authorizePromotion(packet){
  const signed=exactSigned(packet,PROMOTION_FIELDS);
  if(!signed)return deny('O4_PROMOTION_REQUEST_UNSAFE');
  const p=signed.payload;
  // Verify the pinned promoter credential before any replay-sensitive state.
  let promoter=null;
  for(const key of promoterKeySet){
   let ok=false;
   try{ok=verify(null,canonical(p),key,Buffer.from(signed.signature,'base64url'))}catch{}
   if(ok){promoter=key;break}
  }
  if(!promoter){
   // A structurally valid signature under an unknown key is FORGERY.
   let plausible=false;
   try{plausible=verify(null,canonical(p),validatorKey,Buffer.from(signed.signature,'base64url'))}catch{}
   return deny(plausible?'O4_PROMOTION_FORGERY_VALIDATOR_KEY_REUSED':'O4_PROMOTION_FORGERY_UNPINNED_SIGNER',
    {forgeryFlagged:true});
  }
  if(p.version!==VERSION_PROMOTION||p.serverIdentity!==serverIdentity||
     !TOKEN.test(p.tenantId)||!TOKEN.test(p.scope)||!TOKEN.test(p.candidateId)||
     !HEX.test(p.contentDigest)||!HEX.test(p.validationDigest)||
     !TOKEN.test(p.consentId)||!Number.isSafeInteger(p.packageVersion)||
     p.packageVersion<1||p.packageVersion>Number.MAX_SAFE_INTEGER||
     (p.parentManifestDigest!==null&&!HEX.test(p.parentManifestDigest))||
     !Number.isSafeInteger(p.issuedAtMs)||
     typeof p.nonce!=='string'||!TOKEN.test(p.nonce)||
     p.effectPolicy!=='NO_BUSINESS_EFFECT')
   return deny('O4_PROMOTION_REQUEST_SCHEMA_INVALID');
  const candidate=(candidates.get(keyOf(p.tenantId,p.scope))||new Map()).get(p.candidateId);
  if(!candidate)return deny('O4_PROMOTION_CANDIDATE_NOT_FOUND');
  // An unvalidated candidate can never reach the AOT package stage.
  if(candidate.state==='CANDIDATE_NOMINATED')return deny('O4_PROMOTION_VALIDATION_MISSING');
  if(candidate.contentDigest!==p.contentDigest)return deny('O4_PROMOTION_DIGEST_MISMATCH');
  const validation=(validations.get(keyOf(p.tenantId,p.scope))||new Map()).get(p.candidateId);
  if(!validation)return deny('O4_PROMOTION_VALIDATION_MISSING');
  if(validation.expiresAtMs<=clock())return deny('O4_PROMOTION_VALIDATION_EXPIRED',{status:'STALE'});
  if(validation.validationDigest!==p.validationDigest)return deny('O4_PROMOTION_VALIDATION_DIGEST_MISMATCH');
  const consentMap=consents.get(keyOf(p.tenantId,'scope:consent'))||new Map();
  const consent=consentMap.get(p.consentId);
  if(!consent||consent.consentId!==candidate.consentId||consent.expiresAtMs<=clock()||
     [...candidate.dataFields].some(f=>!consent.dataFields.has(f)))
   return deny('O4_PROMOTION_CONSENT_INVALID');
  // Replay: the same promotion nonce is consumed at most once.
  if(usedNonces.has(p.nonce))return deny('O4_PROMOTION_NONCE_REPLAY');
  const scopePackages=packages.get(keyOf(p.tenantId,p.scope))||new Map();
  const head=scopePackages.get(p.packageVersion-1);
  const headDigest=head?head.manifestDigest:null;
  if(p.parentManifestDigest!==headDigest)
   return deny(p.packageVersion===1?'O4_PROMOTION_PARENT_MANIFEST_MISMATCH':'O4_PROMOTION_VERSION_CHAIN_BROKEN');
  usedNonces.add(p.nonce);
  const promotionDigest=sha(canonical(p));
  const packageId='pkg:'+p.tenantId+':'+p.scope+':'+p.packageVersion;
  const manifestCore=Object.freeze({
   schema:VERSION_MANIFEST,packageId,tenantId:p.tenantId,scope:p.scope,
   packageVersion:p.packageVersion,parentManifestDigest:headDigest,
   candidateId:p.candidateId,contentDigest:p.contentDigest,
   validationDigest:p.validationDigest,promotionDigest,
   consentId:p.consentId,
   dataFieldDigests:candidate.dataFieldDigests,
   publishedAtMs:clock(),status:'READY_NOT_ACTIVATED',
   // Activation seam for the Integrator to reconcile with the O3 ABI.
   activationSlot:Object.freeze({
    slotId:'slot:'+p.scope+':'+p.packageVersion,
    pin:sha(Buffer.from(p.contentDigest+'\u0000'+(headDigest??''),'utf8')),
    epoch:p.packageVersion
   })
  });
  const manifestDigest=sha(canonical(manifestCore));
  const manifest=Object.freeze({...manifestCore,manifestDigest});
  tenantMap(packages,p.tenantId,p.scope).set(p.packageVersion,manifest);
  const state=candidates.get(keyOf(p.tenantId,p.scope));
  state.set(p.candidateId,Object.freeze({...candidate,state:'PROMOTED_PACKAGE_PUBLISHED'}));
  // Deliberately: no Effect, no content upload, no activation. The package is
  // ready but future activation is an explicit separate step that this lane
  // does not and cannot perform without the O3 activation contract.
  return Object.freeze({
   status:'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED',
   tenantId:p.tenantId,scope:p.scope,candidateId:p.candidateId,
   packageId,packageVersion:p.packageVersion,manifestDigest,promotionDigest,
   parentManifestDigest:headDigest,contentDigest:p.contentDigest,
   consentId:p.consentId,authorized:true,authority:'PINNED_PROMOTER_KEY',
   validationRecorded:true,newAotBuilt:true,packagePublished:true,
   newAotActivated:false,activated:false,activation:'EXPLICIT_SEPARATE_STEP_DEFAULT_NOT_INVOKED',
   effectDispatched:false,businessState:businessState(),manifest
  });
 }

 function inspectCandidate({tenantId,scope,candidateId}={}){
  const candidate=(candidates.get(keyOf(tenantId,scope))||new Map()).get(candidateId);
  if(!candidate)return deny('O4_CANDIDATE_NOT_VISIBLE_IN_THIS_SCOPE');
  return Object.freeze({status:'CANDIDATE_VISIBLE',tenantId,scope,candidateId,
   state:candidate.state,contentDigest:candidate.contentDigest,
   sourceSummary:candidate.sourceSummary,sourceVersion:candidate.sourceVersion,
   dataFields:[...candidate.dataFields],data:candidate.data,
   consentId:candidate.consentId,effectDispatched:false,
   businessState:businessState()});
 }
 function getPackageManifest({tenantId,scope,packageVersion}={}){
  const manifest=(packages.get(keyOf(tenantId,scope))||new Map()).get(packageVersion);
  if(!manifest)return deny('O4_PACKAGE_NOT_VISIBLE_IN_THIS_SCOPE');
  return Object.freeze({status:'PACKAGE_VISIBLE',manifest,
   effectDispatched:false,businessState:businessState()});
 }
 function activatePackage({tenantId,scope,packageId,activationContract}={}){
  // Explicitly separated future activation. This lane ships no O3 activation
  // contract, so activation is fail-closed by construction and cannot mint
  // an implicit Effect or a hot new AOT.
  const visible=(packages.get(keyOf(tenantId,scope))||new Map());
  let found=false;
  for(const manifest of visible.values())if(manifest.packageId===packageId)found=true;
  if(!found)return deny('O4_PACKAGE_NOT_VISIBLE_IN_THIS_SCOPE');
  return deny('O3_ACTIVATION_CONTRACT_NOT_AVAILABLE_IN_THIS_LANE',
   {activation:'REQUIRES_SEPARATE_O3_STABLE_ABI',packageId});
 }
 function state({tenantId,scope}={}){
  const k=(typeof tenantId==='string'&&typeof scope==='string')?keyOf(tenantId,scope):null;
  const pick=store=>k!==null?(store.get(k)||new Map()):store;
  const counts=store=>{
   if(k!==null)return pick(store).size;
   let n=0;for(const inner of store.values())n+=inner.size;return n;
  };
  return Object.freeze({
   serverIdentity,consents:counts(consents),candidates:counts(candidates),
   validations:counts(validations),packages:counts(packages),
   usedNonces:usedNonces.size,businessState:businessState()
  });
 }
 return Object.freeze({
  recordConsent,nominateCandidate,recordValidation,authorizePromotion,
  inspectCandidate,getPackageManifest,activatePackage,state
 });
}
