/** R83 original AOT→SDK xDownload selected read-only invocation + Host-owned trace signature. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {assessExperience} from './o2-experience-gate.mjs';
import {createControlledTraceIssuer,createControlledTraceVerifier} from './o2-controlled-execution-trace.mjs';

test('R83 actual selected xDownload AOT→SDK interaction receives controlled signed TRACE_ONLY',async()=>{
 const f=await makeNativeFixture();
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-o2-r83-host'});
 try{
  const keys=generateKeyPairSync('ed25519'),scope='tenant:dis-o2-r83-host';
  const issuer=createControlledTraceIssuer({app,...keys,scope,maxWaitMs:15000});
  const verifier=createControlledTraceVerifier({publicKey:keys.publicKey,scope});
  const input={channel:'cli',requestId:'run:native-001',url:'https://example.com/media/sample.mp4',declaredBytes:2048};
  const captured=await issuer.capture({input,runId:input.requestId});
  assert.equal(captured.status,'ISSUED_TRACE_ONLY');
  assert.equal(captured.observation.kind,'OBSERVATION');
  assert.equal(captured.observation.authority,'NONE');
  assert.equal(captured.observation.disposition,'NEEDS_CONFIRMATION');
  assert.equal(captured.observation.evidence.attested,false);
  const verified=verifier.consume({receipt:captured.receipt,input,observation:captured.observation,runId:input.requestId});
  assert.equal(verified.status,'VERIFIED_TRACE_ONLY');
  assert.equal(verified.experienceIssued,false);assert.equal(verified.exportAllowed,false);
  const experience=assessExperience({observation:captured.observation,traceReceipt:captured.receipt,context:{privacyScope:'local-only'}});
  assert.equal(experience.status,'NEED_MORE_EVIDENCE');assert.equal(experience.experienceIssued,false);
  assert.equal(experience.exportAllowed,false);
 }finally{app.stop()}
});
