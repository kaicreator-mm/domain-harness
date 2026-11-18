/** R180 B: negative-only real selected native AOT/SDK & untrusted installer attestation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {inspectO2SelectedRuleDigestSource,deriveO2SelectedRuleCandidate} from './o2-selected-rule-digest-guard.mjs';
import {inspectO2InstalledRuleTrustPreflight,serializeO2UntrustedInstallerPayload,O2_INSTALLER_PAYLOAD_SCHEMA,O2_REQUIRED_ATTESTATION_FIELDS} from './o2-installed-rule-trust-preflight.mjs';

const TENANT='tenant:dis-o2-r180';
const CLOCK=1795000000000;
const fixturePromise=makeNativeFixture();
const noAuthority=r=>{
 assert.equal(r.authority,'NONE');
 for(const key of ['qualified','installedRuleAttested','trustedIssuer','tenantIdentityAttested','hostAttested','ruleInstalled','ruleActivated','experienceIssued','positiveReplayAllowed','effectDispatched'])
  assert.equal(r[key],false,key);
 assert.notEqual(r.status,'QUALIFIED');
};
async function selected(fn){
 const fixture=await fixturePromise;
 const app=await loadDisV020Aot(fixture.artifact,{expectedDigest:fixture.artifact.digest,registry:fixture.registry,store:new PlainCasDocStore(),tenantId:TENANT});
 try{
  const text=fixture.sources.find(s=>s.id==='tally-business').sourceText;
  const ruleDigest=deriveO2SelectedRuleCandidate({aotDigest:fixture.artifact.digest,scope:TENANT,sourceText:text});
  const old=await inspectO2SelectedRuleDigestSource({app,artifact:fixture.artifact,program:fixture.program,sources:fixture.sources,registry:fixture.registry,
   expectedScope:TENANT,expectedAotDigest:fixture.artifact.digest,
   claim:{scope:TENANT,aotDigest:fixture.artifact.digest,ruleDigest,issuedAtMs:CLOCK-1000,expiresAtMs:CLOCK+1000},nowEpochMs:CLOCK});
  assert.equal(old.reason,'BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION');
  assert.equal(old.sourceBoundCandidateVerified,true);noAuthority({...old,trustedIssuer:false,hostAttested:false,positiveReplayAllowed:false});
  const expected={
   aotDigest:fixture.artifact.digest,sdkDigest:'a'.repeat(64),ruleDigest,
   installedBytesDigest:'b'.repeat(64),tenantId:TENANT,scope:TENANT,
   deploymentId:'deployment:test',sourceGitBlob:old.originalSourceGitBlob,
   nonceChallenge:'challenge-unique-12345'
  };
  const payload={schema:O2_INSTALLER_PAYLOAD_SCHEMA,...expected,
   issuedAtMs:CLOCK-1000,expiresAtMs:CLOCK+1000,nonce:'nonce-unique-1234567890',revocationEpoch:0};
  const pair=generateKeyPairSync('ed25519');
  const signed={issuerId:'self-issued:test',
   spkiDerBase64Url:pair.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
   signatureBase64Url:sign(null,serializeO2UntrustedInstallerPayload(payload),pair.privateKey).toString('base64url'),
   payload};
  const options={sourceObservation:old,expected,receipt:signed,nowEpochMs:CLOCK};
  return await fn({app,fixture,payload,pair,options,expected,signed});
 }finally{app.stop()}
}
test('real selected AOT/SDK O2 source-bound candidate + valid self-issued Ed25519 still never installs Rule',async()=>{
 await selected(async({app,options})=>{
  assert.equal(app.state,'READY');assert.ok(app.functions.includes('tally.assessTaskEvidence'));
  const out=inspectO2InstalledRuleTrustPreflight(options);
  assert.equal(out.status,'BLOCKED');
  assert.equal(out.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT');
  assert.equal(out.technicalSignatureVerified,true);
  assert.match(out.candidateFingerprint,/^[0-9a-f]{64}$/);
  assert.deepEqual(O2_REQUIRED_ATTESTATION_FIELDS.slice(0,3),['schema','aotDigest','sdkDigest']);
  noAuthority(out);
 });
});
test('forged signature, unrelated issuer identity and mutated bindings never authorize installed Rule',async()=>{
 await selected(async({options,signed,payload})=>{
  const forged=inspectO2InstalledRuleTrustPreflight({...options,receipt:{...signed,signatureBase64Url:'A'.repeat(86)}});
  assert.equal(forged.reason,'O2_INSTALLER_SIGNATURE_INVALID');noAuthority(forged);
  for(const field of ['aotDigest','sdkDigest','ruleDigest','installedBytesDigest','tenantId','scope','deploymentId','sourceGitBlob','nonceChallenge']){
   const changed={...payload,[field]:field==='sourceGitBlob'?'0'.repeat(40):field==='tenantId'||field==='scope'||field==='deploymentId'||field==='nonceChallenge'?'forged-value-1234567890':'0'.repeat(64)};
   const bad=inspectO2InstalledRuleTrustPreflight({...options,receipt:{...signed,payload:changed}});
   assert.equal(bad.status,'STALE',field);noAuthority(bad);
  }
 });
});
test('stale, revoked, duplicate nonce and future claims are denied even when candidate signature is valid',async()=>{
 await selected(async({options,payload,signed})=>{
  for(const [input,reason] of [
   [{nowEpochMs:payload.expiresAtMs},'O2_INSTALLER_EXPIRED_OR_FUTURE'],
   [{nowEpochMs:payload.issuedAtMs-1},'O2_INSTALLER_EXPIRED_OR_FUTURE'],
   [{observedNonces:[payload.nonce]},'O2_INSTALLER_NONCE_REPLAY'],
   [{revokedIssuerIds:[signed.issuerId]},'O2_INSTALLER_ISSUER_REVOKED']
  ]){
   const got=inspectO2InstalledRuleTrustPreflight({...options,...input});
   assert.equal(got.reason,reason);assert.equal(got.status,'STALE');noAuthority(got);
  }
 });
});
test('Proxy/accessor nested attestation, reused signature and fake selected source fail closed without hostile getter execution',async()=>{
 await selected(async({options,signed,payload})=>{
  let calls=0;
  const proxy=new Proxy({...payload},{get(){calls++;throw Error('executed get')},ownKeys(){calls++;throw Error('executed ownKeys')},getPrototypeOf(){calls++;throw Error('executed prototype')}});
  const x=inspectO2InstalledRuleTrustPreflight({...options,receipt:{...signed,payload:proxy}});
  assert.equal(x.reason,'O2_INSTALLER_PAYLOAD_UNSAFE');noAuthority(x);
  const accessor={...payload};
  Object.defineProperty(accessor,'ruleDigest',{enumerable:true,get(){calls++;throw Error('executed accessor')}});
  const y=inspectO2InstalledRuleTrustPreflight({...options,receipt:{...signed,payload:accessor}});
  assert.equal(y.reason,'O2_INSTALLER_PAYLOAD_UNSAFE');noAuthority(y);
  const fake=inspectO2InstalledRuleTrustPreflight({...options,sourceObservation:{...options.sourceObservation,authority:'QUALIFIED'}});
  assert.equal(fake.reason,'O2_INSTALLER_SELECTED_SOURCE_UNQUALIFIED');noAuthority(fake);
  const absent=inspectO2InstalledRuleTrustPreflight({...options,sourceObservation:null});
  assert.equal(absent.reason,'O2_INSTALLER_CLAIM_UNSAFE');noAuthority(absent);
  assert.equal(calls,0);
 });
});
