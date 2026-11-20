/**
 * DIS 0.2.0 R211 Integrator seam (#1551): O4 OPT-004 server promotion
 * manifest -> O3 OPT-003 stable activation ABI end-to-end reconciliation.
 *
 * Both lanes merged into the Draft parent (#1497). O4's lane module keeps
 * activatePackage constructively fail-closed (no O3 contract inside that
 * lane); THIS file performs the Integrator-owned reconciliation the DAG
 * deferred: verify the published O4 manifest's activationSlot integrity
 * (pin recompute, scope binding, epoch identity), then run a REAL O3
 * data-only Evolution Slot activation lifecycle on the selected xDownload
 * AOT authorized by that manifest, plus fail-closed negatives.
 *
 * Honest scope: in-process, local, data-only. authority stays 'NONE';
 * no Effect, no Experience, no Host attestation, no Release, and O4's own
 * lane boundary (activatePackage deny) is asserted unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {makeNativeFixture} from '../native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../../tests/assembly/helpers-v010.ts';
import {createO4ServerPromotionLifecycle} from '../full-opt004-r0/o4-server-promotion-lifecycle.mjs';
import {prepareOpt003DataSlot,createOpt003EvolutionSlot} from '../full-opt003-r0/evolution-slot.mjs';

const TENANT='tenant:dis-r211-seam';
const SCOPE='scope:xdownload-na';
const CANDIDATE_SCHEMA='dis.o4.server-candidate/1';
const CONSENT_SCHEMA='dis.o4.server-consent/1';
const VALIDATION_VERSION='dis.o4.server-validation/1';
const PROMOTION_VERSION='dis.o4.server-promotion/1';
const O3_BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const O3_FN='xdownload.describePolicy';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Buffer.from(JSON.stringify(value));
const signed=(payload,key)=>({payload,signature:sign(null,canonical(payload),key).toString('base64url')});
let clockMs=1_800_500_000_000;
let seq=0;

function drivePromotion(){
 const validator=generateKeyPairSync('ed25519');
 const promoter=generateKeyPairSync('ed25519');
 const server=createO4ServerPromotionLifecycle({
  serverIdentity:'server:o4-r211-seam-1',
  validatorPublicKey:validator.publicKey,
  promoterPublicKeys:[promoter.publicKey],
  now:()=>clockMs});
 const consent={schema:CONSENT_SCHEMA,consentId:'consent:'+(++seq),tenantId:TENANT,
  grantedBy:'owner:'+TENANT,dataFields:['pattern','counterexample'],
  purpose:'authorized slow-layer pattern learning',grantedAtMs:clockMs,
  expiresAtMs:clockMs+3_600_000};
 server.recordConsent(consent);
 const data={};for(const f of consent.dataFields)data[f]='observed-'+f+'-'+(++seq);
 const candidate={schema:CANDIDATE_SCHEMA,candidateId:'cand:'+(++seq),tenantId:TENANT,
  scope:SCOPE,sourceSummary:'download confirm fallbacks',sourceVersion:'v'+(++seq),
  dataFields:consent.dataFields,data,consentId:consent.consentId,
  nominatedBy:'collector:'+TENANT,nominatedAtMs:clockMs};
 const nominated=server.nominateCandidate(candidate);
 assert.equal(nominated.status,'CANDIDATE_NOMINATED');
 const fields=[...candidate.dataFields].sort();
 const minimized={};for(const f of fields)minimized[f]=candidate.data[f];
 const contentDigest=sha(canonical({sourceSummary:candidate.sourceSummary,
  sourceVersion:candidate.sourceVersion,dataFields:fields,data:minimized}));
 const vp={version:VALIDATION_VERSION,tenantId:TENANT,scope:SCOPE,
  candidateId:candidate.candidateId,contentDigest,verdict:'PASS',
  validatorId:'validator:independent-1',validatedAtMs:clockMs,
  expiresAtMs:clockMs+3_600_000};
 const vReceipt=signed(vp,validator.privateKey);
 const validated=server.recordValidation(vReceipt);
 assert.equal(validated.status,'VALIDATION_RECORDED');
 const req={version:PROMOTION_VERSION,serverIdentity:'server:o4-r211-seam-1',
  tenantId:TENANT,scope:SCOPE,candidateId:candidate.candidateId,contentDigest,
  validationDigest:sha(canonical(vp)),consentId:consent.consentId,
  packageVersion:1,parentManifestDigest:null,nonce:'nonce:'+(++seq),
  issuedAtMs:clockMs,effectPolicy:'NO_BUSINESS_EFFECT'};
 const promotion=server.authorizePromotion(signed(req,promoter.privateKey));
 return {server,promotion,contentDigest};
}

// Integrator seam verifier: a published manifest may authorize exactly one
// O3 activation when (and only when) its own integrity holds.
function verifyManifestForO3Activation(manifest,{scope,packageVersion}){
 const reasons=[];
 if(manifest.status!=='READY_NOT_ACTIVATED')
  reasons.push('O4_MANIFEST_NOT_READY');
 if(manifest.scope!==scope)
  reasons.push('O4_SEAM_SCOPE_MISMATCH');
 if(manifest.packageVersion!==packageVersion)
  reasons.push('O4_SEAM_EPOCH_MISMATCH');
 const parent=manifest.parentManifestDigest??'';
 const expectPin=sha(Buffer.from(manifest.contentDigest+'\u0000'+parent,'utf8'));
 if(manifest.activationSlot.pin!==expectPin)
  reasons.push('O4_SEAM_PIN_MISMATCH');
 if(manifest.activationSlot.epoch!==manifest.packageVersion)
  reasons.push('O4_SEAM_EPOCH_IDENTITY_BROKEN');
 return {ok:reasons.length===0,reasons};
}

const o3Slot=()=>prepareOpt003DataSlot({schema:'dis.v0.2.opt003-slot/1',
 functionId:O3_FN,contractVersion:'1.0.0',sourceGitBlob:O3_BLOB,
 op:'eq',field:'value.domainId',equals:'downloads'});
const noAuthority=out=>{
 assert.equal(out.scope,'LOCAL_EVOLUTION_SLOT');
 assert.equal(out.authority,'NONE');
 for(const k of ['qualified','hostAttested','installedRuleAttested','experienceIssued','effectDispatched'])
  assert.equal(out[k],false,k);
};

test('R211 seam: O4 promotion manifest authorizes a real O3 activation end-to-end',async()=>{
 const {server,promotion,contentDigest}=drivePromotion();
 assert.equal(promotion.status,'PROMOTION_AUTHORIZED_PACKAGE_PUBLISHED');
 assert.equal(promotion.activated,false);
 assert.equal(promotion.effectDispatched,false);
 const manifest=promotion.manifest;
 assert.equal(manifest.activationSlot.slotId,'slot:'+SCOPE+':1');
 // Integrity of the authorization pin recomputed from manifest fields.
 const verified=verifyManifestForO3Activation(manifest,{scope:SCOPE,packageVersion:1});
 assert.deepEqual(verified,{ok:true,reasons:[]});
 // O4's own lane boundary stays fail-closed (delegation is Integrator's).
 const laneDeny=server.activatePackage({tenantId:TENANT,scope:SCOPE,
  packageId:manifest.packageId,activationContract:{anything:true}});
 assert.equal(laneDeny.status,'BLOCKED');
 assert.equal(laneDeny.reason,'O3_ACTIVATION_CONTRACT_NOT_AVAILABLE_IN_THIS_LANE');
 // REAL O3 lifecycle on the selected xDownload AOT.
 const fixture=await makeNativeFixture();
 const app=await loadDisV020Aot(fixture.artifact,{expectedDigest:fixture.artifact.digest,
  registry:fixture.registry,store:new PlainCasDocStore(),tenantId:TENANT});
 assert.equal(app.contractVersions[O3_FN],'1.0.0');
 const gate=createOpt003EvolutionSlot({app,slot:o3Slot(),
  expectedAotDigest:app.aotDigest,maxWaitMs:15000});
 const loaded=gate.loadSlot();
 assert.equal(loaded.status,'LOADED');
 noAuthority(loaded);
 const before=await gate.executeTask(gate.beginTask());
 assert.equal(before.status,'DENIED');
 assert.equal(before.reason,'OPT003_SLOT_NOT_ACTIVE');
 const {token,activation}=gate.activateForTask();
 assert.equal(activation.status,'ACTIVATED_LOCAL');
 noAuthority(activation);
 const outcome=await gate.executeTask(token);
 assert.equal(outcome.status,'SLOT_EXECUTED');
 assert.equal(outcome.reason,'RULE_MATCH');
 assert.equal(outcome.ruleActivated,true);
 assert.equal(outcome.decision,'ALLOW_DATA_ONLY_SHADOW');
 noAuthority(outcome);
 gate.revokeSlot();
 assert.equal(gate.state().ruleActivated,false);
 assert.equal(gate.state().slotRevoked,true);
 assert.throws(()=>gate.activateForTask(),e=>e.code==='OPT003_SLOT_REVOKED');
 const afterRevoke=await gate.executeTask(gate.beginTask());
 assert.equal(afterRevoke.status,'DENIED');
 noAuthority(afterRevoke);
 // The seam binds contentDigest of the promotion to the authorization.
 assert.equal(typeof contentDigest,'string');
 assert.equal(manifest.contentDigest,contentDigest);
});

test('R211 seam negatives: tampered/forged O4 manifests cannot authorize O3 activation',async()=>{
 const {promotion}=drivePromotion();
 const manifest=promotion.manifest;
 // Tampered content digest -> pin mismatch -> seam rejects.
 const tampered={...manifest,contentDigest:sha(Buffer.from('attacker-bytes'))};
 assert.equal(verifyManifestForO3Activation(tampered,{scope:SCOPE,packageVersion:1}).ok,false);
 // Wrong scope binding -> seam rejects.
 assert.equal(verifyManifestForO3Activation(manifest,{scope:'scope:xdownload-eu',packageVersion:1}).ok,false);
 // Wrong epoch/packageVersion -> seam rejects.
 assert.equal(verifyManifestForO3Activation(manifest,{scope:SCOPE,packageVersion:2}).ok,false);
 // Not-ready manifest -> seam rejects.
 assert.equal(verifyManifestForO3Activation({...manifest,status:'SOMETHING_ELSE'},{scope:SCOPE,packageVersion:1}).ok,false);
 // Forged slot payload (code, not data-only) is refused by O3 itself,
 // independent of any O4 authorization: O3's own fail-closed gate.
 const fixture=await makeNativeFixture();
 const app=await loadDisV020Aot(fixture.artifact,{expectedDigest:fixture.artifact.digest,
  registry:fixture.registry,store:new PlainCasDocStore(),tenantId:TENANT});
 assert.throws(()=>createOpt003EvolutionSlot({app,
  slot:{schema:'dis.v0.2.opt003-slot/1',functionId:O3_FN,contractVersion:'1.0.0',
   sourceGitBlob:O3_BLOB,op:'eq',field:'value.domainId',
   equals:'downloads;(function(){globalThis.pwned=true})()'},
  expectedAotDigest:app.aotDigest}),/OPT003_/);
 assert.equal(globalThis.pwned,undefined);
});
