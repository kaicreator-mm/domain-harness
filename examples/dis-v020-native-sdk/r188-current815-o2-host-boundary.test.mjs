/**
 * DIE #4 R188 — genuine current 815 byte-pinned research OBSERVATION from
 * selected AOT/SDK reaches O2's untrusted installed-Rule preflight.
 *
 * This is intentionally a NEGATIVE Host admission boundary, not proof of
 * original qualified SAP, ECP, provisioned Host, signed Host execution, R8
 * or Effect. R50's real Python Host has no trusted same-call API to this
 * selected R155 Knowledge Function; do not synthesize one in a test.
 * Existing R155/O3/H3 tests are reused rather than modified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sourceGitBlob,sourceSha256,qualifyDisV020Artifact}
  from '@kaicreator/domain-harness-contracts/dis-v020';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';
import {makeCurrentVv815Reader} from './r155-current-vv-815-research-consumer.mjs';
import {
  inspectO2InstalledRuleTrustPreflight,
  serializeO2UntrustedInstallerPayload,
  O2_INSTALLER_PAYLOAD_SCHEMA
} from './o2-installed-rule-trust-preflight.mjs';

const PIN=Object.freeze({
  graph:'a49ddf58a0c4a5b25ebdd4018c8234f64e6365e0',
  forge:'63d671aa270df0eff649cd34a5f6258f4c9cbc21',
  reader:'234997708b5520d7f9ce5997eb7ad6ff963a5e68',
  frozen807:'0f6007315fd7352fe6fd218effcfecf672cb4961',
  aiLedger:'f93190035f33516afd374b756897e0ce01fa29cb',
  tallyHead:'9c5b00085229e1f9b3b6596b2c382b32e0d03db8',
  forgeHead:'63754a51b373a50b83cc804d28b4dfa15a1553a2'
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
const SOURCE=Object.freeze({
  graph:'r188-graph-815',forge:'r188-forge-r143',reader:'r188-reader'
});
const FN='dke.ev16.d02.vv.r188.observe';
const ELEMENT='dke.ev16.d02.vv.r188';
const BINDING='se:SCB-CS2023-VV-R1',TENANT='tenant:r188-current815';
const NOW=1795000000000;
const invalid=code=>e=>e?.code===code;
const sha=s=>createHash('sha256').update(s).digest('hex');
const pending=async()=>{
  const [f,graph,forge,code,old]=await Promise.all([
    makeNativeFixture(),
    readFile(new URL('./fixtures/r155-c1-v212-graph-815.jsonld',import.meta.url),'utf8'),
    readFile(new URL('./fixtures/r155-ev16-d02-vv-two-leg-source-repin-r143.json',import.meta.url),'utf8'),
    readFile(new URL('./r155-current-vv-815-research-consumer.mjs',import.meta.url),'utf8'),
    readFile(new URL('./fixtures/dke-r23-ev16-tally-full.jsonld',import.meta.url),'utf8')
  ]);
  for(const [key,raw] of Object.entries({graph,forge,reader:code}))
    assert.equal(sourceGitBlob(raw),PIN[key],'source blob pin drift: '+key);
  assert.equal(sourceGitBlob(old),PIN.frozen807);
  assert.equal(JSON.parse(graph)['@graph'].length,815);
  assert.equal(JSON.parse(old)['@graph'].length,807);
  const reader=makeCurrentVv815Reader(graph,forge);
  assert.equal(reader.summary.authority,'NONE');
  assert.equal(reader.summary.sapQualified,false);
  assert.equal(reader.summary.reviewDecisions,0);
  // New Forge AI ledger is NOT in this earlier R155 selected AOT input set.
  // Its Git blob is recorded for a future true interface implementation.
  assert.notEqual(PIN.aiLedger,PIN.forge);
  assert.notEqual(reader.summary.producerTallyHead,PIN.tallyHead);
  assert.notEqual(reader.summary.producerForgeHead,PIN.forgeHead);
  const sources=[...f.sources,
    ...Object.entries({graph,forge,reader:code}).map(([key,sourceText])=>({
      id:SOURCE[key],sourceText,origin:ORIGIN[key]
    }))];
  const program=structuredClone(f.program);
  program.domains.push({
    id:'dke.ev16.r188',description:'Unqualified 815 research observation -> O2 deny',
    repositories:['kaicreator-mm/tally','kaicreator-mm/domain-forge','kaicreator-mm/domain-harness']
  });
  // Explicitly no ECP qualification or physical effect. AOT output schema is
  // bounded to the source-authenticated reader's actual static field types.
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
    }]
  });
  const origins={...f.expectedSourceOrigins,
    ...Object.fromEntries(Object.entries(SOURCE).map(([key,id])=>[id,ORIGIN[key]]))};
  const compile=(p=program,s=sources,o=origins)=>compileDisV020Aot({
    built:f.artifact.built,program:p,sources:s,expectedSourceOrigins:o});
  const artifact=compile();
  const registry={...f.registry,[FN]:{
    sourceId:SOURCE.reader,sha256:sourceSha256(code),origin:ORIGIN.reader,
    gitBlob:PIN.reader,execute:input=>reader.query({subject:input.subject})
  }};
  const expectedSourcePins=Object.fromEntries(
    sources.filter(s=>Object.values(SOURCE).includes(s.id))
      .map(s=>[s.id,{sha256:sourceSha256(s.sourceText),origin:s.origin}]));
  return {reader,graph,forge,old,program,sources,origins,compile,artifact,registry,
    expectedSourcePins};
};
const prepared=pending();
const boot=x=>loadDisV020Aot(x.artifact,{
  expectedDigest:x.artifact.digest,registry:x.registry,
  expectedSourcePins:x.expectedSourcePins,
  store:new PlainCasDocStore(),tenantId:TENANT
});
const noAuthority=o=>{
  assert.equal(o.authority,'NONE');
  for(const key of ['qualified','installedRuleAttested','trustedIssuer',
    'tenantIdentityAttested','hostAttested','ruleInstalled','ruleActivated',
    'experienceIssued','positiveReplayAllowed','effectDispatched'])
    assert.equal(o[key],false,key);
};
test('original 815 bytes -> true AOT/selected SDK yields only UNKNOWN/OBSERVATION',async()=>{
  const x=await prepared;
  const q=qualifyDisV020Artifact(x.artifact);
  assert.equal(q.functions.get(FN).definition.effect,'none');
  assert.deepEqual(q.functions.get(FN).definition.sourceDependencies,
    [SOURCE.graph,SOURCE.forge]);
  assert.equal(q.pins.get(SOURCE.graph).origin.gitBlob,PIN.graph);
  assert.equal(q.pins.get(SOURCE.forge).origin.gitBlob,PIN.forge);
  // A newer AI ledger must NOT silently be treated as included/attested.
  assert.equal(q.pins.has('r188-ai-ledger'),false);
  const app=await boot(x);
  try{
    const out=await app.invoke(FN,{subject:BINDING},{expectedContractVersion:'1.0.0'});
    assert.equal(out.kind,'OBSERVATION');
    assert.equal(out.disposition,'UNKNOWN');
    assert.equal(out.authority,'NONE');
    assert.equal(out.evidence.attested,false);
    assert.equal(out.value.sourceGraphGitBlob,PIN.graph);
    assert.equal(out.value.forgeSelectedGitBlob,PIN.forge);
    assert.equal(out.value.claimReviewStatus,'PENDING');
    assert.equal(out.value.bindingScope,
      'SELECTED_CQ_RESEARCH_CANDIDATE_ONLY_NOT_FROZEN_R8_CELL');
    for(const key of ['qualifiedSap','claimQualified','parentQualified',
      'rootQualified','oracleAttested','effectDispatched'])
      assert.equal(out.value[key],false,key);
    assert.equal(Object.hasOwn(out,'executionPermit'),false);
  }finally{app.stop()}
});
test('real historical 807 bytes, changed source and spoofed provenance cannot boot as current 815',async()=>{
  const x=await prepared;
  assert.throws(()=>makeCurrentVv815Reader(x.old,x.forge),
    invalid('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH'));
  assert.throws(()=>makeCurrentVv815Reader(x.graph+' ',x.forge),
    invalid('R155_CURRENT_GRAPH_GIT_BLOB_MISMATCH'));
  assert.throws(()=>makeCurrentVv815Reader(x.graph,x.forge+' '),
    invalid('R155_FORGE_SELECTED_GIT_BLOB_MISMATCH'));
  const stale=x.sources.map(s=>s.id===SOURCE.graph?{...s,sourceText:x.graph+' '}:s);
  assert.throws(()=>x.compile(x.program,stale),invalid('DIS_BUILD_SOURCE_BYTES_DRIFT'));
  const forged={...x.origins,[SOURCE.graph]:{
    ...x.origins[SOURCE.graph],gitBlob:PIN.frozen807}};
  assert.throws(()=>x.compile(x.program,x.sources,forged),
    invalid('DIS_SOURCE_ORIGIN_UNTRUSTED'));
});
test('815 SDK observation + mathematically valid SELF-issued Ed25519 still cannot authorize O2 or signed Host',async()=>{
  const x=await prepared,app=await boot(x);
  try{
    const out=await app.invoke(FN,{subject:BINDING},{expectedContractVersion:'1.0.0'});
    assert.equal(out.authority,'NONE');
    // ATTACKER-PROVIDED sourceObservation flag is not a true installed Rule
    // source attestation. Intentionally stronger than the observed SDK value:
    // if a caller fabricates it, the independent trust-root gate must stay shut.
    const rule=sha('r188-UNATTESTED-ONLY\0'+x.artifact.digest+'\0'+PIN.graph);
    const expected={
      aotDigest:x.artifact.digest,sdkDigest:'a'.repeat(64),ruleDigest:rule,
      installedBytesDigest:'b'.repeat(64),tenantId:TENANT,scope:TENANT,
      deploymentId:'deployment:r188-uninstalled',sourceGitBlob:PIN.graph,
      nonceChallenge:'challenge-r188-technical-1234'
    };
    const payload={
      schema:O2_INSTALLER_PAYLOAD_SCHEMA,...expected,
      issuedAtMs:NOW-1000,expiresAtMs:NOW+1000,
      nonce:'nonce-r188-selfissued-123456',revocationEpoch:0
    };
    const key=generateKeyPairSync('ed25519');
    const receipt={
      issuerId:'self-issued:r188',
      spkiDerBase64Url:key.publicKey.export({format:'der',type:'spki'}).toString('base64url'),
      signatureBase64Url:sign(null,
        serializeO2UntrustedInstallerPayload(payload),key.privateKey).toString('base64url'),
      payload
    };
    const sourceObservation={
      authority:out.authority,installedRuleAttested:false,
      sourceBoundCandidateVerified:true, // explicitly untrusted caller claim
      selectedAotDigest:x.artifact.digest,sourceBoundCandidateDigest:rule,
      originalSourceGitBlob:out.value.sourceGraphGitBlob
    };
    const options={sourceObservation,expected,receipt,nowEpochMs:NOW};
    const first=inspectO2InstalledRuleTrustPreflight(options);
    assert.equal(first.technicalSignatureVerified,true);
    assert.equal(first.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT');
    noAuthority(first);
    const cases=[
      [{receipt:{...receipt,signatureBase64Url:'A'.repeat(86)}},
        'O2_INSTALLER_SIGNATURE_INVALID'],
      [{nowEpochMs:NOW+1001},'O2_INSTALLER_EXPIRED_OR_FUTURE'],
      [{observedNonces:[payload.nonce]},'O2_INSTALLER_NONCE_REPLAY'],
      [{revokedIssuerIds:[receipt.issuerId]},'O2_INSTALLER_ISSUER_REVOKED'],
      [{receipt:{...receipt,payload:{...payload,tenantId:'tenant:forged'}}},
        'O2_INSTALLER_BINDING_DRIFT_TENANTID'],
      [{receipt:{...receipt,payload:{...payload,sourceGitBlob:PIN.frozen807}}},
        'O2_INSTALLER_BINDING_DRIFT_SOURCEGITBLOB'],
      [{sourceObservation:{...sourceObservation,authority:'QUALIFIED'}},
        'O2_INSTALLER_SELECTED_SOURCE_UNQUALIFIED']
    ];
    for(const [delta,reason] of cases){
      const denied=inspectO2InstalledRuleTrustPreflight({...options,...delta});
      assert.equal(denied.reason,reason,JSON.stringify(delta));
      noAuthority(denied);
    }
    // No credible ECP/Host handoff is installed in this app. R50 signed
    // Python Host is an external unchanged Demo, and MUST remain NOT_RUN.
    assert.equal(out.kind,'OBSERVATION');
    assert.equal(first.hostAttested,false);
    assert.equal(first.positiveReplayAllowed,false);
    assert.equal(first.effectDispatched,false);
  }finally{app.stop()}
});
