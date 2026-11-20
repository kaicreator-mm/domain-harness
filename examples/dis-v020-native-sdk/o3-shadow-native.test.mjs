/** Actual selected xDownload AOT→SDK observation, O3 shadow-only fail-closed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {prepareO3ShadowCandidate,makeO3Shadow} from './o3-shadow-rule.mjs';
const base=makeNativeFixture();

test('O3 selected real xDownload AOT/SDK source observation can only produce Candidate+Shadow; no Effect',async()=>{
 const f=await base;
 const app=await loadDisV020Aot(f.artifact,{expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-o3-shadow-r121'});
 try{
  const candidate=prepareO3ShadowCandidate({schema:'dis.v0.2.o3-shadow-candidate/1',
   functionId:'xdownload.describePolicy',contractVersion:'1.0.0',
   sourceGitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc',
   op:'eq',field:'value.domainId',equals:'downloads'});
  const got=await makeO3Shadow({app,candidate,maxWaitMs:15000}).probe();
  assert.equal(got.status,'NEED_MORE_EVIDENCE');
  assert.equal(got.scope,'SHADOW_ONLY');
  assert.equal(got.shadowMatched,true);
  assert.equal(got.authority,'NONE');
  assert.equal(got.qualified,false);
  assert.equal(got.ruleActivated,false);
  assert.equal(got.experienceIssued,false);
  assert.equal(got.effectDispatched,false);
  // Native function observation is not a trustworthy O3 QualificationReceipt.
  assert.equal(typeof app.activateLocalRule,'undefined');
 }finally{app.stop()}
});
