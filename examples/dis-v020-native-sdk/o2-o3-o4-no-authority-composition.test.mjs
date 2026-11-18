/** Formal-tools #11 G6 / DIS #3 R180 C: original selected AOT/SDK composition.
 * POS means technical observations only; no true installer/Host/Oracle,
 * permission, G4 qualified Solution, positive Replay, Experience or Effect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {deriveO2SelectedRuleCandidate,inspectO2SelectedRuleDigestSource} from './o2-selected-rule-digest-guard.mjs';
import {inspectO2InstalledRuleTrustPreflight,serializeO2UntrustedInstallerPayload,O2_INSTALLER_PAYLOAD_SCHEMA} from './o2-installed-rule-trust-preflight.mjs';
import {prepareO3ShadowCandidate} from './o3-shadow-rule.mjs';
import {getO3FixedRuleTechnicalPin} from './o3-bounded-shadow-interpreter.mjs';
import {createO3SelectedTaskEpochPreflight} from './o3-selected-task-epoch-preflight.mjs';
import {createControlledTraceIssuer} from './o2-controlled-execution-trace.mjs';
import {createO4ThreeKeyServerCandidatePreflight} from './o4-three-key-server-preflight.mjs';
import {persistSolutionCandidate,revokeStoredCandidate} from './snapshots/formal-tools/packages/runner/js/solution-store.mjs';
import {consumeVerifiedO4Candidate} from './o4-candidate-consumer.mjs';

const SCOPE='tenant:dis-r180-composition';
const CLOCK=1795000000000, RULE='d'.repeat(64);
const XDOWNLOAD_BLOB='a7dba9a896de0b84fc6d54093563adca2ccbcdfc';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const signed=(payload,key)=>({
  payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64url')
});
const snapshot=path=>new URL('./snapshots/formal-tools/benchmarks/llm-methods/g4/'+path,import.meta.url);
const onlyTechnical=(x)=>{
  assert.equal(x.authority,'NONE');
  assert.equal(x.qualified,false);
  assert.equal(x.effectDispatched,false);
  assert.equal(x.experienceIssued,false);
};
const o3NotAuthorized=x=>{
  onlyTechnical(x);
  assert.equal(x.scope,'SHADOW_ONLY');
  for(const name of ['taskAuthorized','ruleActivated','taskPinPersisted','hostAttested','installedRuleAttested','positiveReplayAllowed'])
    assert.equal(x[name],false,name);
};
const o2NotAuthorized=x=>{
  onlyTechnical(x);
  for(const name of ['installedRuleAttested','trustedIssuer','hostAttested','ruleInstalled','ruleActivated','positiveReplayAllowed'])
    assert.equal(x[name],false,name);
};

async function scenario(visit) {
 const f=await makeNativeFixture();
 const app=await loadDisV020Aot(f.artifact,{
   expectedDigest:f.artifact.digest,registry:f.registry,
   store:new PlainCasDocStore(),tenantId:SCOPE
 });
 const storeDir=mkdtempSync(join(tmpdir(),'dis-g6-no-authority-'));
 let o3;
 try {
  const selectedText=f.sources.find(x=>x.id==='tally-business').sourceText;
  const o2Rule=deriveO2SelectedRuleCandidate({
    aotDigest:f.artifact.digest,scope:SCOPE,sourceText:selectedText
  });
  const source=await inspectO2SelectedRuleDigestSource({
    app,artifact:f.artifact,program:f.program,sources:f.sources,registry:f.registry,
    expectedScope:SCOPE,expectedAotDigest:f.artifact.digest,
    claim:{scope:SCOPE,aotDigest:f.artifact.digest,ruleDigest:o2Rule,
      issuedAtMs:CLOCK-1000,expiresAtMs:CLOCK+1000},nowEpochMs:CLOCK
  });
  assert.equal(source.reason,'BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION');
  assert.equal(source.sourceBoundCandidateVerified,true);
  const expected={
    aotDigest:f.artifact.digest,sdkDigest:'a'.repeat(64),
    ruleDigest:o2Rule,installedBytesDigest:'b'.repeat(64),
    tenantId:SCOPE,scope:SCOPE,deploymentId:'deployment:r180',
    sourceGitBlob:source.originalSourceGitBlob,nonceChallenge:'challenge-r180-technical-1234'
  };
  const installerPayload={
    schema:O2_INSTALLER_PAYLOAD_SCHEMA,...expected,
    issuedAtMs:CLOCK-1000,expiresAtMs:CLOCK+1000,
    nonce:'nonce-r180-technical-123456789',revocationEpoch:0
  };
  const self=generateKeyPairSync('ed25519');
  const receipt={
    issuerId:'self-issued:r180',
    spkiDerBase64Url:self.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
    signatureBase64Url:sign(null,serializeO2UntrustedInstallerPayload(installerPayload),self.privateKey).toString('base64url'),
    payload:installerPayload
  };
  const installerOptions={sourceObservation:source,expected,receipt,nowEpochMs:CLOCK};
  const installer=inspectO2InstalledRuleTrustPreflight(installerOptions);
  assert.equal(installer.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT');
  assert.equal(installer.technicalSignatureVerified,true);o2NotAuthorized(installer);

  const pin=getO3FixedRuleTechnicalPin();
  const candidate=prepareO3ShadowCandidate({
    schema:'dis.v0.2.o3-shadow-candidate/1',
    functionId:'xdownload.describePolicy',contractVersion:'1.0.0',
    sourceGitBlob:XDOWNLOAD_BLOB,op:'eq',field:'value.domainId',equals:'downloads'
  });
  o3=createO3SelectedTaskEpochPreflight({
    app,candidate,expectedAotDigest:f.artifact.digest,
    expectedRuleDigest:pin.digest,maxWaitMs:15000
  });
  const published=o3.publishShadowForFutureTasks();o3NotAuthorized(published);
  const selectedToken=o3.beginTask();
  const observed=await o3.probeTask(selectedToken);o3NotAuthorized(observed);
  assert.equal(observed.shadowMatched,true);
  assert.equal(observed.sourceGitBlob,XDOWNLOAD_BLOB);

  const problemJson=await readFile(snapshot('PROBLEM.json'),'utf8');
  const methodJson=await readFile(snapshot('METHOD.json'),'utf8');
  const provenanceJson=await readFile(snapshot('PROVENANCE.json'),'utf8');
  const provenance=JSON.parse(provenanceJson);
  assert.equal(provenance.evidence_gate,'BYTES_BOUND_UNATTESTED');
  assert.equal(provenance.oracle_sha256,provenance.source_sha256);
  const persisted=await persistSolutionCandidate({
    store_dir:storeDir,problem_json:problemJson,method_json:methodJson,
    provenance_json:provenanceJson
  });
  assert.equal(persisted.status,'CANDIDATE_PERSISTED',JSON.stringify(persisted));
  const input={channel:'cli',requestId:'run:r180-composition',
    url:'https://example.com/media/composition.mp4',declaredBytes:2048};
  const runId=input.requestId;
  const trace=generateKeyPairSync('ed25519'),validator=generateKeyPairSync('ed25519'),server=generateKeyPairSync('ed25519');
  const issuer=createControlledTraceIssuer({
    app,privateKey:trace.privateKey,publicKey:trace.publicKey,
    scope:SCOPE,expectedAotDigest:f.artifact.digest
  });
  const captured=await issuer.capture({input,runId});
  assert.equal(captured.status,'ISSUED_TRACE_ONLY');
  const candidateBytes=Buffer.from(JSON.stringify({
    schema:'dis.o4.server-meta-candidate/2',scope:SCOPE,runId,
    selectedAotDigest:f.artifact.digest,
    modelSha256:provenance.model_sha256,
    sourceSha256:provenance.source_sha256,
    oracleSha256:provenance.oracle_sha256,
    ruleDigest:RULE,
    selectedFunction:'xdownload.interaction.inspect',
    continuationFunction:'xdownload.interaction.confirm',
    disposition:'CANDIDATE_PREFLIGHT_ONLY',
    solutionCandidateSha256:persisted.candidate_sha256,input
  }));
  const validatorPayload={
    version:'dis.o2.independent-validator/1',scope:SCOPE,runId,
    aotDigest:f.artifact.digest,ruleDigest:RULE,
    traceSignature:captured.receipt.signature,
    observationDigest:captured.receipt.payload.observationDigest,
    verdict:'PASS',authority:'TECHNICAL_VALIDATION_ONLY',
    experienceIssued:false,effectDispatched:false
  };
  const validatorReceipt=signed(validatorPayload,validator.privateKey);
  const proposalPayload={
    version:'dis.o4.server-candidate-preflight/1',scope:SCOPE,runId,
    selectedAotDigest:f.artifact.digest,ruleDigest:RULE,
    traceSignature:captured.receipt.signature,
    validatorSignature:validatorReceipt.signature,
    observationDigest:captured.receipt.payload.observationDigest,
    proposalDigest:sha(candidateBytes),consentScope:'local-only',
    disposition:'CANDIDATE_PREFLIGHT_ONLY',authorizedPromotion:false
  };
  const proposalPacket={
    candidateEnvelope:signed(proposalPayload,server.privateKey),
    validatorReceipt,traceReceipt:captured.receipt,input,
    observation:captured.observation,runId,candidateBytes
  };
  const gate=createO4ThreeKeyServerCandidatePreflight({
    tracePublicKey:trace.publicKey,validatorPublicKey:validator.publicKey,
    serverReviewPublicKey:server.publicKey,scope:SCOPE,
    expectedAotDigest:f.artifact.digest,expectedRuleDigest:RULE
  });
  const technicalO4=gate.verifyProposal(proposalPacket);
  assert.equal(technicalO4.status,'CANDIDATE_PREFLIGHT_VERIFIED_TECHNICAL_ONLY');
  onlyTechnical(technicalO4);
  assert.equal(technicalO4.serverPromotionAuthorized,false);
  assert.equal(technicalO4.newAotActivated,false);
  assert.equal(technicalO4.governanceApproved,false);

  return await visit({
    app,f,installer,installerOptions,source,o2Rule,expected,
    o3,observed,gate,technicalO4,proposalPacket,
    persisted,storeDir,provenanceJson,provenance,runId
  });
 } finally {
  o3?.close();app.stop();rmSync(storeDir,{recursive:true,force:true});
 }
}

test('real selected O2 source + O3 shadow + O4 three-key technical PASS never compose into Host/Rule/Effect',async()=>{
 await scenario(async s=>{
  o2NotAuthorized(s.installer);
  o3NotAuthorized(s.observed);
  onlyTechnical(s.technicalO4);
  assert.equal(s.installer.installedRuleAttested,false);
  assert.equal(s.observed.activationAllowed,false);
  assert.equal(s.technicalO4.serverPromotionAuthorized,false);
  assert.equal(typeof s.app.activateLocalRule,'undefined');
  const consumed=await consumeVerifiedO4Candidate({
    preflightResult:s.technicalO4,app:s.app,expectedScope:SCOPE,
    expectedRuleDigest:RULE,storeDir:s.storeDir,
    currentProvenanceJson:s.provenanceJson
  });
  assert.equal(consumed.status,'CONSUMED_OBSERVATION_ONLY',JSON.stringify(consumed));
  assert.equal(consumed.domainOutcome,'READY_FOR_KDP');
  assert.equal(consumed.solutionReplay,'BLOCKED_UNQUALIFIED');
  assert.equal(consumed.replayAllowed,false);onlyTechnical(consumed);
  assert.equal(consumed.serverPromotionAuthorized,false);
 });
});

test('O2 forged installer authority and O4 fake promotion cannot cross a technically successful O3 shadow',async()=>{
 await scenario(async s=>{
  const forgedO2=inspectO2InstalledRuleTrustPreflight({
    ...s.installerOptions,sourceObservation:{...s.source,authority:'QUALIFIED'}
  });
  assert.equal(forgedO2.status,'STALE');o2NotAuthorized(forgedO2);
  const forgedPre=Object.freeze({...s.technicalO4,qualified:true});
  const blocked=await consumeVerifiedO4Candidate({
    preflightResult:forgedPre,app:s.app,expectedScope:SCOPE,
    expectedRuleDigest:RULE,storeDir:s.storeDir,
    currentProvenanceJson:s.provenanceJson
  });
  assert.equal(blocked.status,'BLOCKED');
  assert.equal(blocked.reason,'O4_TECHNICAL_ONLY_PRECHECK_REQUIRED');
  assert.equal(blocked.replayAllowed,false);onlyTechnical(blocked);
  assert.throws(()=>createO3SelectedTaskEpochPreflight({
    app:s.app,candidate:{qualified:true},
    expectedAotDigest:s.f.artifact.digest,
    expectedRuleDigest:getO3FixedRuleTechnicalPin().digest
  }),/O3_/);
 });
});

test('revoked O3 epoch and G4 candidate stay revoked; O4 two-key replay is UNKNOWN not positive',async()=>{
 await scenario(async s=>{
  const epoch=s.o3.publishShadowForFutureTasks().taskEpoch;
  const token=s.o3.beginTask();
  o3NotAuthorized(s.o3.revokeEpoch(epoch));
  const after=await s.o3.probeTask(token);o3NotAuthorized(after);
  assert.equal(after.reason,'TASK_PIN_REVOKED');
  assert.throws(()=>s.o3.rollbackShadowTo(epoch),{code:'O3_EPOCH_REVOKED'});
  const replay=s.gate.verifyProposal(s.proposalPacket);
  assert.equal(replay.status,'UNKNOWN');
  assert.equal(replay.reason,'O4_ORIGINAL_TWO_KEY_EVIDENCE_NOT_VERIFIED');
  onlyTechnical(replay);
  const revoked=await revokeStoredCandidate({
    store_dir:s.storeDir,candidate_sha256:s.persisted.candidate_sha256,
    reason:'ORACLE_REVOKED'
  });
  assert.equal(revoked.status,'INVALIDATED');
  const consumed=await consumeVerifiedO4Candidate({
    preflightResult:s.technicalO4,app:s.app,expectedScope:SCOPE,
    expectedRuleDigest:RULE,storeDir:s.storeDir,
    currentProvenanceJson:s.provenanceJson
  });
  assert.equal(consumed.status,'INVALIDATED');
  assert.equal(consumed.reason,'G4_REVOCATION_TOMBSTONE');
  assert.equal(consumed.replayAllowed,false);onlyTechnical(consumed);
 });
});

test('G4 model and independent Oracle drift becomes STALE despite O2/O3 technical observations',async()=>{
 await scenario(async s=>{
  for(const field of ['model_sha256','oracle_sha256']){
   const changed={...s.provenance,[field]:'f'.repeat(64)};
   const outcome=await consumeVerifiedO4Candidate({
     preflightResult:s.technicalO4,app:s.app,expectedScope:SCOPE,
     expectedRuleDigest:RULE,storeDir:s.storeDir,
     currentProvenanceJson:JSON.stringify(changed)
   });
   assert.equal(outcome.status,'STALE',field);
   assert.equal(outcome.reason,'G4_SOURCE_OR_MODEL_PROVENANCE_MISMATCH',field);
   assert.equal(outcome.replayAllowed,false);onlyTechnical(outcome);
  }
 });
});
