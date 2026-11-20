/**
 * DIS 0.2.0 R211 O4 OPT-004 native: server promotion lifecycle positive chain
 * plus essential fail-closed negatives. In-process server semantics only;
 * pinned-key signature/credential checks genuinely execute. No real Server,
 * Domain/Forge, governance authority, AOT build, activation or Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {createO4ServerPromotionLifecycle} from './o4-server-promotion-lifecycle.mjs';

const CANDIDATE_SCHEMA='dis.o4.server-candidate/1';
const CONSENT_SCHEMA='dis.o4.server-consent/1';
const VALIDATION_VERSION='dis.o4.server-validation/1';
const PROMOTION_VERSION='dis.o4.server-promotion/1';
const MANIFEST_SCHEMA='dis.o4.aot-package-manifest/1';
const TENANT_A='tenant:acme',TENANT_B='tenant:rival';
const SCOPE_A='scope:xdownload-na',SCOPE_B='scope:xdownload-eu';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Buffer.from(JSON.stringify(value));
const signed=(payload,key)=>({
 payload,signature:sign(null,canonical(payload),key).toString('base64url')
});
let clockMs=1_800_000_000_000;
let seq=0;
function setup(){
 clockMs=1_800_000_000_000;
 const validator=generateKeyPairSync('ed25519');
 const promoter=generateKeyPairSync('ed25519');
 const promoter2=generateKeyPairSync('ed25519');
 const server=createO4ServerPromotionLifecycle({
  serverIdentity:'server:o4-r211-meta-1',
  validatorPublicKey:validator.publicKey,
  promoterPublicKeys:[promoter.publicKey,promoter2.publicKey],
  now:()=>clockMs
 });
 return {server,validator,promoter,promoter2};
}
function consentRecord(tenantId,{fields=['pattern','counterexample'],expiry=3_600_000}={}){
 return {
  schema:CONSENT_SCHEMA,consentId:'consent:'+(++seq),tenantId,
  grantedBy:'owner:'+tenantId,dataFields:fields,purpose:'authorized slow-layer pattern learning',
  grantedAtMs:clockMs,expiresAtMs:clockMs+expiry
 };
}
function candidateRecord(tenantId,scope,{fields=['pattern','counterexample'],consentId='consent:0'}={}){
  const data={};
  for(const f of fields)data[f]='observed-'+f+'-value-'+(++seq);
  return {
   schema:CANDIDATE_SCHEMA,candidateId:'cand:'+(++seq),tenantId,scope,
   sourceSummary:'authorized collection: download confirm fallbacks',sourceVersion:'v'+(++seq),
   dataFields:fields,data,consentId,nominatedBy:'collector:'+tenantId,nominatedAtMs:clockMs
  };
}
function contentDigestOf(candidate){
 // Same canonical binding the server computes over minimized content.
 const dataFields=[...candidate.dataFields].sort();
 const data=Object.create(null);
 for(const f of dataFields)data[f]=candidate.data[f];
 return sha(canonical({
  sourceSummary:candidate.sourceSummary,sourceVersion:candidate.sourceVersion,
  dataFields,data
 }));
}
function validationReceipt({candidate,validator,change={}}){
 const payload={
  version:VALIDATION_VERSION,tenantId:candidate.tenantId,scope:candidate.scope,
  candidateId:candidate.candidateId,contentDigest:contentDigestOf(candidate),
  verdict:'PASS',validatorId:'validator:independent-1',
  validatedAtMs:clockMs,expiresAtMs:clockMs+3_600_000,...change
 };
 return {receipt:signed(payload,validator.privateKey),payload};
}
function promotionPacket({candidate,validator,promoter,nonce='nonce:'+(++seq),version=1,parentManifestDigest=null,change={}}){
  const {receipt,payload}=validationReceipt({candidate,validator});
 const request={
  version:PROMOTION_VERSION,serverIdentity:'server:o4-r211-meta-1',
  tenantId:candidate.tenantId,scope:candidate.scope,candidateId:candidate.candidateId,
  contentDigest:contentDigestOf(candidate),
  validationDigest:sha(canonical(payload)),consentId:consentIdOf(candidate),
  packageVersion:version,parentManifestDigest,nonce,issuedAtMs:clockMs,
  effectPolicy:'NO_BUSINESS_EFFECT',...change
 };
 return {packet:signed(request,promoter.privateKey),request,payload,vReceipt:receipt};
}
// Nomination binds the consent id explicitly referenced by the candidate.
const consentIds=new Map();
function consentIdOf(candidate){return consentIds.get(candidate.candidateId)}
function nominateWithConsent(server,validator,{tenantId=TENANT_A,scope=SCOPE_A,fields=['pattern','counterexample']}={}){
  const consent=consentRecord(tenantId,{fields});
  assert.equal(server.recordConsent(consent).status,'CONSENT_RECORDED');
  const candidate=candidateRecord(tenantId,scope,{fields,consentId:consent.consentId});
  consentIds.set(candidate.candidateId,consent.consentId);
  const nominated=server.nominateCandidate(candidate);
  assert.equal(nominated.status,'CANDIDATE_NOMINATED');
  const {receipt}=validationReceipt({candidate,validator});
  const validated=server.recordValidation(receipt);
  assert.equal(validated.status,'VALIDATION_RECORDED');
  return {candidate,consent};
}
const noEffect=x=>{
 assert.equal(x.effectDispatched,false);
 assert.equal(x.businessState.effectsDispatched,0);
 assert.equal(x.businessState.contentsUploaded,0);
 assert.equal(x.businessState.packagesActivated,0);
 assert.equal(x.businessState.kdpCalls,0);
};
const denied=(x,reason)=>{
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.reason,reason);
 assert.equal(x.authorized,false);
 assert.equal(x.packagePublished,false);
 assert.equal(x.activated,false);
 assert.equal(x.effectDispatched,false);
 assert.equal(x.authority,'NONE');
 assert.equal(x.newAotBuilt,false);
};

test('O4 positive chain: nominate -> validate -> authorized promotion -> new AOT package version -> future activation not performed',()=>{
 const {server,validator,promoter}=setup();
 const effects=[];
 const {candidate}=nominateWithConsent(server,validator);
 const {packet,request,payload}=promotionPacket({candidate,validator,promoter});
 const out=server.authorizePromotion(packet);
 assert.equal(out.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 assert.equal(out.authorized,true);
 assert.equal(out.authority,'PINNED_PROMOTER_KEY');
 assert.equal(out.validationRecorded,true);
 assert.equal(out.newAotBuilt,true);
 assert.equal(out.packagePublished,true);
 assert.equal(out.newAotActivated,false);
 assert.equal(out.activated,false);
 assert.equal(out.activation,'EXPLICIT_SEPARATE_STEP_DEFAULT_NOT_INVOKED');
 assert.equal(out.packageVersion,1);
 assert.equal(out.parentManifestDigest,null);
 noEffect(out);
 assert.equal(effects.length,0);
 // Manifest digest chain is recomputable and binds every stage digest.
 const m=out.manifest;
 assert.equal(m.schema,MANIFEST_SCHEMA);
 assert.equal(m.status,'READY_NOT_ACTIVATED');
 const {manifestDigest,...core}=m;
 assert.equal(out.manifestDigest,sha(canonical(core)));
 assert.equal(out.promotionDigest,sha(canonical(request)));
 assert.equal(m.contentDigest,contentDigestOf(candidate));
 assert.equal(m.validationDigest,sha(canonical(payload)));
 assert.equal(m.dataFieldDigests.pattern,sha(Buffer.from(candidate.data.pattern,'utf8')));
 assert.equal(m.activationSlot.slotId,'slot:'+SCOPE_A+':1');
 assert.equal(m.activationSlot.epoch,1);
 assert.equal(typeof m.activationSlot.pin,'string');
 // Same-tenant reads work; activation is a separate explicit step that this
 // lane cannot perform without the O3 activation contract.
 const visible=server.getPackageManifest({tenantId:TENANT_A,scope:SCOPE_A,packageVersion:1});
 assert.equal(visible.status,'PACKAGE_VISIBLE');
 const blocked=server.activatePackage({tenantId:TENANT_A,scope:SCOPE_A,packageId:m.packageId});
 denied(blocked,'O3_ACTIVATION_CONTRACT_NOT_AVAILABLE_IN_THIS_LANE');
 assert.equal(blocked.activation,'REQUIRES_SEPARATE_O3_STABLE_ABI');
 noEffect(blocked);
 // Second promotion chains parentManifestDigest to the first manifest.
 const {candidate:candidate2}=nominateWithConsent(server,validator);
 const second=server.authorizePromotion(promotionPacket({
  candidate:candidate2,validator,promoter,version:2,parentManifestDigest:out.manifestDigest
 }).packet);
 assert.equal(second.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 assert.equal(second.packageVersion,2);
 assert.equal(second.parentManifestDigest,out.manifestDigest);
 noEffect(second);
 assert.equal(server.state().packages,2);
 assert.equal(server.state().businessState.effectsDispatched,0);
});

test('O4 multi-tenant/scope isolation: cross-tenant and cross-scope candidate and package reads fail closed',()=>{
 const {server,validator,promoter}=setup();
 const {candidate}=nominateWithConsent(server,validator);
 const out=server.authorizePromotion(promotionPacket({candidate,validator,promoter}).packet);
 assert.equal(out.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 // Cross-tenant candidate read: not visible, zero content leakage.
 const crossTenant=server.inspectCandidate({tenantId:TENANT_B,scope:SCOPE_A,candidateId:candidate.candidateId});
 denied(crossTenant,'O4_CANDIDATE_NOT_VISIBLE_IN_THIS_SCOPE');
 assert.equal(Object.hasOwn(crossTenant,'data'),false);
 // Cross-scope candidate read within the same tenant also fails closed.
 const crossScope=server.inspectCandidate({tenantId:TENANT_A,scope:SCOPE_B,candidateId:candidate.candidateId});
 denied(crossScope,'O4_CANDIDATE_NOT_VISIBLE_IN_THIS_SCOPE');
 // Cross-tenant package manifest read fails closed (version privacy).
 const crossPkg=server.getPackageManifest({tenantId:TENANT_B,scope:SCOPE_A,packageVersion:1});
 denied(crossPkg,'O4_PACKAGE_NOT_VISIBLE_IN_THIS_SCOPE');
 assert.equal(Object.hasOwn(crossPkg,'manifest'),false);
 // Same-tenant same-scope read returns full data with digests intact.
 const own=server.inspectCandidate({tenantId:TENANT_A,scope:SCOPE_A,candidateId:candidate.candidateId});
 assert.equal(own.status,'CANDIDATE_VISIBLE');
 assert.equal(own.data.pattern,candidate.data.pattern);
 noEffect(own);
});

test('O4 negative: upload without consent is rejected and never enters the candidate store',()=>{
 const {server}=setup();
 // Candidate references a consent that was never recorded.
 const missing=candidateRecord(TENANT_A,SCOPE_A);
 denied(server.nominateCandidate(missing),'O4_UPLOAD_WITHOUT_CONSENT');
 assert.equal(server.state({tenantId:TENANT_A,scope:SCOPE_A}).candidates,0);
 // Consent missing one enumerated field also fails closed.
 const consent=consentRecord(TENANT_A,{fields:['pattern']});
 assert.equal(server.recordConsent(consent).status,'CONSENT_RECORDED');
 const partial=candidateRecord(TENANT_A,SCOPE_A,{consentId:consent.consentId});
 denied(server.nominateCandidate(partial),'O4_DATA_EXCEEDS_CONSENT_ENUMERATION');
 // Expired consent fails closed.
 clockMs+=3_600_001;
 const expired=consentRecord(TENANT_A,{expiry:1});
 assert.equal(server.recordConsent(expired).status,'CONSENT_RECORDED');
 clockMs+=2;
 const expiredCandidate=candidateRecord(TENANT_A,SCOPE_A,{fields:expired.dataFields,consentId:expired.consentId});
 denied(server.nominateCandidate(expiredCandidate),'O4_UPLOAD_WITHOUT_CONSENT');
});

test('O4 negative: promotion before validation is rejected; an unvalidated candidate never reaches AOT',()=>{
 const {server,validator,promoter}=setup();
 const consent=consentRecord(TENANT_A);
 server.recordConsent(consent);
 const candidate=candidateRecord(TENANT_A,SCOPE_A,{consentId:consent.consentId});
 consentIds.set(candidate.candidateId,consent.consentId);
 assert.equal(server.nominateCandidate(candidate).status,'CANDIDATE_NOMINATED');
 // Fabricate a promotion packet whose validationDigest matches no recorded
 // validation: the state machine refuses before any package exists.
 const {packet}=promotionPacket({candidate,validator,promoter});
 const out=server.authorizePromotion(packet);
 denied(out,'O4_PROMOTION_VALIDATION_MISSING');
 assert.equal(server.state({tenantId:TENANT_A,scope:SCOPE_A}).packages,0);
 assert.equal(server.state().usedNonces,0);
});

test('O4 negative: forged promoter signature is rejected and flagged FORGERY; validator key reuse is flagged',()=>{
 const {server,validator,promoter}=setup();
 const foreign=generateKeyPairSync('ed25519');
 const {candidate}=nominateWithConsent(server,validator);
 const {payload}=validationReceipt({candidate,validator});
 // Forged: signed by an unpinned foreign key.
 const forgedRequest={
  version:PROMOTION_VERSION,serverIdentity:'server:o4-r211-meta-1',
  tenantId:candidate.tenantId,scope:candidate.scope,candidateId:candidate.candidateId,
  contentDigest:contentDigestOf(candidate),validationDigest:sha(canonical(payload)),
  consentId:consentIdOf(candidate.candidateId),packageVersion:1,
  parentManifestDigest:null,nonce:'nonce:forged-1',issuedAtMs:clockMs,
  effectPolicy:'NO_BUSINESS_EFFECT'
 };
 const forged=server.authorizePromotion(signed(forgedRequest,foreign.privateKey));
 assert.equal(forged.status,'BLOCKED');
 assert.match(forged.reason,/^O4_PROMOTION_FORGERY_/);
 assert.equal(forged.forgeryFlagged,true);
 // Forged with the pinned validator key (wrong role) is also FORGERY.
 const misused=server.authorizePromotion(signed(forgedRequest,validator.privateKey));
 assert.equal(misused.reason,'O4_PROMOTION_FORGERY_VALIDATOR_KEY_REUSED');
 assert.equal(misused.forgeryFlagged,true);
 // Corrupt signature is FORGERY too.
 const corrupt=signed(forgedRequest,promoter.privateKey);
 corrupt.signature='A'.repeat(86);
 const bad=server.authorizePromotion(corrupt);
 assert.match(bad.reason,/^O4_PROMOTION_FORGERY_/);
 assert.equal(server.state({tenantId:TENANT_A,scope:SCOPE_A}).packages,0);
 assert.equal(server.state().usedNonces,0);
});

test('O4 negative: replay of the same authorized promotion nonce is rejected',()=>{
 const {server,validator,promoter}=setup();
 const {candidate}=nominateWithConsent(server,validator);
 const {packet}=promotionPacket({candidate,validator,promoter,nonce:'nonce:fixed-1'});
 const first=server.authorizePromotion(packet);
 assert.equal(first.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 const replay=server.authorizePromotion(packet);
 denied(replay,'O4_PROMOTION_NONCE_REPLAY');
 assert.equal(server.state({tenantId:TENANT_A,scope:SCOPE_A}).packages,1);
 noEffect(replay);
 // A fresh nonce for the same validated candidate promotes a new version.
 const {candidate:candidate2}=nominateWithConsent(server,validator);
 const {packet:packet2}=promotionPacket({
  candidate:candidate2,validator,promoter,version:2,parentManifestDigest:first.manifestDigest
 });
 const second=server.authorizePromotion(packet2);
 assert.equal(second.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 assert.equal(second.packageVersion,2);
});

test('O4 negative: implicit Effect — promotion success leaves business state exactly zero and activation not performed',()=>{
 const {server,validator,promoter}=setup();
 const {candidate}=nominateWithConsent(server,validator);
 const before=server.state().businessState;
 assert.deepEqual(before,{effectsDispatched:0,contentsUploaded:0,packagesActivated:0,kdpCalls:0});
 const out=server.authorizePromotion(promotionPacket({candidate,validator,promoter}).packet);
 assert.equal(out.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 const after=server.state().businessState;
 assert.deepEqual(after,before);
 noEffect(out);
 // The published manifest itself carries no raw data, only field digests.
 assert.equal(Object.hasOwn(out.manifest.dataFieldDigests,'pattern'),true);
 assert.equal(Object.hasOwn(out.manifest,'rawData'),false);
 // A repeated explicit activation attempt still produces zero Effect.
 const again=server.activatePackage({tenantId:TENANT_A,scope:SCOPE_A,packageId:out.manifest.packageId});
 denied(again,'O3_ACTIVATION_CONTRACT_NOT_AVAILABLE_IN_THIS_LANE');
 assert.deepEqual(server.state().businessState,before);
});

test('O4 negative: unverified or mismatched validation evidence cannot support promotion (fail-closed, incl. STALE)',()=>{
 const {server,validator,promoter}=setup();
 const {candidate}=nominateWithConsent(server,validator);
 // Verdict FAIL receipt.
 const failReceipt=validationReceipt({candidate,validator,change:{verdict:'FAIL'}});
 const failOut=server.recordValidation(failReceipt.receipt);
 denied(failOut,'O4_VALIDATION_VERDICT_NOT_PASS');
 assert.equal(server.state({tenantId:TENANT_A,scope:SCOPE_A}).validations,1); // only the PASS from setup
 // Forged validator signature.
 const foreign=generateKeyPairSync('ed25519');
 const forged=validationReceipt({candidate,validator});
 const forgedOut=server.recordValidation(signed(forged.payload,foreign.privateKey));
 denied(forgedOut,'O4_VALIDATOR_SIGNATURE_INVALID');
 // Digest substitution: validation over different content is rejected.
 const other=candidateRecord(TENANT_A,SCOPE_A);
 const swapped=validationReceipt({candidate:other,validator,change:{
  candidateId:candidate.candidateId
 }});
 const swappedOut=server.recordValidation(swapped.receipt);
 denied(swappedOut,'O4_VALIDATION_DIGEST_MISMATCH');
 // STALE: an expired validation receipt is rejected at recording time.
 const stale=validationReceipt({candidate,validator,change:{expiresAtMs:clockMs-1}});
 const staleOut=server.recordValidation(stale.receipt);
 assert.equal(staleOut.status,'STALE');
 assert.equal(staleOut.reason,'O4_VALIDATION_RECEIPT_EXPIRED');
 // Promotion of the still-valid candidate still succeeds through the clean chain.
 const out=server.authorizePromotion(promotionPacket({candidate,validator,promoter}).packet);
 assert.equal(out.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 noEffect(out);
});
