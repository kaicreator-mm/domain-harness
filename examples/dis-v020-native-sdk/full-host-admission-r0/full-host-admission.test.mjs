/**
 * DIS #3 / Harness #1527 Phase B (R209) — ONE_SELECTED_TRUSTED_RULE_HOST_ADMISSION.
 *
 * Positive: the selected Function dke.ev16.d02.vv.r188.observe is invoked
 * through the real byte-pinned AOT/SDK, and that SAME call is admitted by the
 * owner-attested admission Host against operator-pinned issuer/tenant/Host
 * trust roots, producing a signed Host receipt with a durable hash-chained
 * ledger entry. Negatives: forged/unpinned/revoked issuer, tenant/deployment/
 * scope/function swaps, stale AOT/Rule/installed bytes, epoch drift, key
 * rotation, expiry, duplicate nonce, cross-process restart replay,
 * archived-nonce replay and ledger rollback — all fail closed.
 *
 * Honesty: single-owner ecosystem; structural (key/channel) independence
 * only; observation-only admission (no Effect, no claim attestation, no
 * experience issuance, no Matrix promotion). The O2 preflight itself stays
 * negative-only for every receipt, including the admitted one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,generateKeyPairSync,verify as verifySignature}
  from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,cpSync,writeFileSync,appendFileSync}
  from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {inspectO2InstalledRuleTrustPreflight,
  serializeO2UntrustedInstallerPayload}
  from '../o2-installed-rule-trust-preflight.mjs';
import {buildR188AdmissionContext,bootR188App,R188_FUNCTION,
  R188_BINDING_SUBJECT,R188_PIN} from './test-fixture.mjs';
import {issueInstallerReceipt} from './issuer-install.mjs';
import {spawnAdmissionHost,verifyAdmissionHostReceipt,
  digestObservationOutput} from './admission-consumer.mjs';
import {openAdmissionLedger,ADMISSION_REGISTRY_SCHEMA}
  from './admission-host.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const sha256file=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const TENANT='tenant:owner-admission-r209';
const SCOPE='scope:r188-observe-admission';
const DEPLOYMENT='deployment:dis-v020-full-admission-r209';
const OWNER_REGISTRY_ID='owner-admission-registry-r209';
const OWNER_HOST_ID='owner-admission-host-r209';
const OWNER_ISSUER_ID='owner-issuer-r209';
const NOW=Date.now();
let ledgerSeq=0;
const freshDir=()=>{
  const dir=join(tmpdir(),'admission-test-'+process.pid+'-'+(++ledgerSeq));
  mkdirSync(dir,{recursive:true});
  return dir;
};
/** Build a fully pinned test topology: fresh issuer+host keys, temp ledger. */
async function provisionTopology(context,overrides={}){
  const issuer=generateKeyPairSync('ed25519');
  const host=generateKeyPairSync('ed25519');
  const issuerSpki=issuer.publicKey.export({format:'der',type:'spki'});
  const hostSpki=host.publicKey.export({format:'der',type:'spki'});
  const issuerId=overrides.issuerId??'test-issuer-r209';
  const hostId=overrides.hostId??'test-admission-host-r209';
  const registry={schema:ADMISSION_REGISTRY_SCHEMA,
    registryId:overrides.registryId??'test-admission-registry-r209',
    trustTopology:'SINGLE_OWNER_ECOSYSTEM_STRUCTURAL_INDEPENDENCE_NOT_INTERPERSONAL',
    ownerGrant:{issue:'kaicreator-mm/domain-harness#1527',commentId:7007585312,
      recordedAtIso:'2026-11-19T11:23:00Z',grantTextSha256:'0'.repeat(64)},
    revocationEpoch:overrides.revocationEpoch??1,
    issuers:{[issuerId]:{spkiDerBase64Url:issuerSpki.toString('base64url'),
      spkiSha256:createHash('sha256').update(issuerSpki).digest('hex'),
      activeSinceMs:NOW-1000,
      functionBindings:overrides.functionBindings??[R188_FUNCTION],
      ...(overrides.issuerRevokedAtMs!==undefined
        ?{revokedAtMs:overrides.issuerRevokedAtMs}:{})}},
    hosts:{[hostId]:{spkiDerBase64Url:hostSpki.toString('base64url'),
      spkiSha256:createHash('sha256').update(hostSpki).digest('hex'),
      kind:'ENGINEERING_ADMISSION_HOST_TEST'}},
    deployments:{[DEPLOYMENT]:{tenantId:TENANT,scope:SCOPE,
      functionId:overrides.functionId??R188_FUNCTION,
      issuerId,hostId,
      bindings:overrides.bindings??{
        aotDigest:context.artifact.digest,
        sdkDigest:sha256file(join(HERE,'admission-consumer.mjs')),
        ruleDigest:context.ruleDigest,
        installedBytesDigest:sha256file(join(HERE,'installed-rule-r188.json')),
        sourceGitBlob:R188_PIN.reader},
      validUntilMs:NOW+90*86_400_000}}};
  const keyDir=freshDir();
  const issuerKeyFile=join(keyDir,'issuer.pem');
  const hostKeyFile=join(keyDir,'host.pem');
  writeFileSync(issuerKeyFile,
    issuer.privateKey.export({format:'pem',type:'pkcs8'}));
  writeFileSync(hostKeyFile,host.privateKey.export({format:'pem',type:'pkcs8'}));
  const ledgerDir=freshDir();
  const registryPath=join(keyDir,'registry.json');
  writeFileSync(registryPath,JSON.stringify(registry));
  return {registry,registryPath,issuerKeyFile,hostKeyFile,ledgerDir,
    issuerId,hostId};
}
const buildExpected=(topology,over={})=>({
  aotDigest:topology.registry.deployments[DEPLOYMENT].bindings.aotDigest,
  sdkDigest:topology.registry.deployments[DEPLOYMENT].bindings.sdkDigest,
  ruleDigest:topology.registry.deployments[DEPLOYMENT].bindings.ruleDigest,
  installedBytesDigest:topology.registry.deployments[DEPLOYMENT].bindings.installedBytesDigest,
  tenantId:TENANT,scope:SCOPE,deploymentId:DEPLOYMENT,
  sourceGitBlob:R188_PIN.reader,
  nonceChallenge:'test-challenge-r209-0001',...over});
const startHost=topology=>spawnAdmissionHost({
  servicePath:join(HERE,'admission-host-service.mjs'),
  registryPath:topology.registryPath,ledgerDir:topology.ledgerDir,
  hostId:topology.hostId,hostKeyFile:topology.hostKeyFile});
const sourceObservationFor=(expected,gitBlob=R188_PIN.reader)=>({authority:'NONE',
  installedRuleAttested:false,sourceBoundCandidateVerified:true,
  selectedAotDigest:expected.aotDigest,
  sourceBoundCandidateDigest:expected.ruleDigest,
  originalSourceGitBlob:gitBlob});
const prepared=buildR188AdmissionContext();

test('selected AOT compile is deterministic and rule digest matches committed reader bytes',async()=>{
  const context=await prepared;
  const second=await buildR188AdmissionContext();
  assert.equal(second.artifact.digest,context.artifact.digest);
  assert.equal(sourceSha256(context.readerCode),context.ruleDigest);
});

test('SAME-CALL positive: real R188 invoke admitted by pinned-root Host, signed receipt verified',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const receipt=issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    lifetimeMs:3600_000,nonce:'test-installer-nonce-0001',revocationEpoch:1});
  const app=await bootR188App(context);
  let observation;
  try{
    observation=await app.invoke(R188_FUNCTION,{subject:R188_BINDING_SUBJECT},
      {expectedContractVersion:'1.0.0'});
  }finally{app.stop()}
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.disposition,'UNKNOWN');
  assert.equal(observation.authority,'NONE');
  const observedOutputDigest=digestObservationOutput(observation.value);
  const host=await startHost(topology);
  let admitted;
  try{
    admitted=await host.admit({installerReceipt:receipt,expected,
      sourceObservation:{...sourceObservationFor(expected,
        // Genuine AOT-side binding pin, mirroring the owner provisioning run.
        context.registry[R188_FUNCTION].gitBlob),
        authority:observation.authority},
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:expected.aotDigest,observedOutputDigest,
        functionDisposition:observation.disposition},
      invocationNonce:'test-invoke-nonce-0001',actor:'test'});
  }finally{await host.shutdown()}
  assert.equal(admitted.status,'OBSERVED_SCOPED_CANDIDATE');
  assert.equal(admitted.admitted,true);
  assert.equal(admitted.reason,'ADMITTED_OBSERVATION_ONLY');
  assert.equal(admitted.trustedIssuer,true);
  assert.equal(admitted.installedRuleAttested,true);
  assert.equal(admitted.hostAttested,true);
  assert.equal(admitted.tenantIdentityAttested,true);
  assert.equal(admitted.effectDispatched,false);
  assert.equal(admitted.claimAttested,false);
  assert.equal(admitted.experienceIssued,false);
  assert.equal(admitted.receipt.functionDisposition,'UNKNOWN');
  assert.equal(admitted.receipt.claimAttested,false);
  assert.equal(admitted.receipt.externalBusinessEffect,false);
  const verification=verifyAdmissionHostReceipt(admitted.receipt,
    {registry:topology.registry,hostId:topology.hostId,
      expected:{deploymentId:DEPLOYMENT,invocationNonce:'test-invoke-nonce-0001',
        subject:R188_BINDING_SUBJECT,observedOutputDigest}});
  assert.equal(verification.valid,true,JSON.stringify(verification));
  // The hardened negative-only O2 preflight stays negative for this receipt.
  const pre=inspectO2InstalledRuleTrustPreflight({
    sourceObservation:sourceObservationFor(expected),expected,receipt,
    nowEpochMs:NOW});
  assert.equal(pre.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT');
  assert.equal(pre.technicalSignatureVerified,true);
  assert.equal(pre.hostAttested,false);
});

test('cross-process restart on the SAME durable ledger denies replayed nonce',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const make=nonce=>issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    lifetimeMs:3600_000,nonce,revocationEpoch:1});
  const request=receipt=>({installerReceipt:receipt,expected,
    sourceObservation:sourceObservationFor(expected),
    invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
      aotDigest:expected.aotDigest,observedOutputDigest:'0'.repeat(64),
      functionDisposition:'UNKNOWN'},
    invocationNonce:'restart-invoke-'+Date.now().toString(36),actor:'test'});
  const first=await startHost(topology);
  const ok=await first.admit(request(make('restart-installer-once-0001')));
  await first.shutdown();
  assert.equal(ok.admitted,true);
  const second=await startHost(topology); // NEW process, SAME ledger dir
  try{
    const replayed=await second.admit(request(make('restart-installer-once-0001')));
    assert.equal(replayed.status,'REPLAY');
    assert.equal(replayed.reason,'ADMISSION_NONCE_REPLAY');
    assert.equal(replayed.admitted,false);
    // A different nonce still succeeds after restart: durability, not lockout.
    const fresh=await second.admit(request(make('restart-installer-twice-0002')));
    assert.equal(fresh.admitted,true);
  }finally{await second.shutdown()}
});

test('forged, unpinned and revoked issuer keys never admit',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const attacker=generateKeyPairSync('ed25519');
  // Self-issued: mathematically valid Ed25519, wrong (unpinned) key.
  const selfIssued=issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:attacker.privateKey,expected,nowMs:NOW-1000,
    nonce:'attacker-selfissued-0001',revocationEpoch:1});
  const host=await startHost(topology);
  try{
    const base={expected,sourceObservation:sourceObservationFor(expected),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:expected.aotDigest,observedOutputDigest:'a'.repeat(64),
        functionDisposition:'UNKNOWN'},
      actor:'test'};
    const swapped=await host.admit({...base,installerReceipt:selfIssued,
      invocationNonce:'attacker-invoke-0001'});
    assert.equal(swapped.reason,'ADMISSION_ISSUER_KEY_MISMATCH');
    const unknown=JSON.parse(JSON.stringify(selfIssued));
    unknown.issuerId='issuer:not-in-registry';
    const unpinned=await host.admit({...base,installerReceipt:unknown,
      invocationNonce:'attacker-invoke-0002'});
    assert.equal(unpinned.reason,'ADMISSION_ISSUER_NOT_PINNED');
  }finally{await host.shutdown()}
  const revokedTopology=await provisionTopology(context,{issuerRevokedAtMs:NOW-1});
  const revokedReceipt=issueInstallerReceipt({issuerId:revokedTopology.issuerId,
    privateKey:revokedTopology.issuerKeyFile,
    expected:buildExpected(revokedTopology),nowMs:NOW-1000,
    nonce:'revoked-installer-0001',revocationEpoch:1});
  const revokedHost=await startHost(revokedTopology);
  try{
    const revoked=await revokedHost.admit({
      installerReceipt:revokedReceipt,expected:buildExpected(revokedTopology),
      sourceObservation:sourceObservationFor(buildExpected(revokedTopology)),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:revokedTopology.registry.deployments[DEPLOYMENT].bindings.aotDigest,
        observedOutputDigest:'2'.repeat(64),functionDisposition:'UNKNOWN'},
      invocationNonce:'revoked-invoke-0001',actor:'test'});
    assert.equal(revoked.reason,'ADMISSION_ISSUER_REVOKED');
    assert.equal(revoked.admitted,false);
  }finally{await revokedHost.shutdown()}
});

test('tenant, scope, digest and function swaps fail closed',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const host=await startHost(topology);
  try{
    const base={sourceObservation:sourceObservationFor(buildExpected(topology)),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:context.artifact.digest,observedOutputDigest:'b'.repeat(64),
        functionDisposition:'UNKNOWN'},
      actor:'test'};
    const issue=(expected,nonce)=>issueInstallerReceipt(
      {issuerId:topology.issuerId,privateKey:topology.issuerKeyFile,expected,
        nowMs:NOW-1000,nonce,revocationEpoch:1});
    const cases=[
      [buildExpected(topology,{tenantId:'tenant:forged'}),'swap-tenant-0001',
        'ADMISSION_BINDING_MISMATCH_TENANTID'],
      [buildExpected(topology,{scope:'scope:forged'}),'swap-scope-0001',
        'ADMISSION_BINDING_MISMATCH_SCOPE'],
      [buildExpected(topology,{aotDigest:'c'.repeat(64)}),'swap-aot-0001',
        'ADMISSION_BINDING_MISMATCH_AOTDIGEST'],
      [buildExpected(topology,{ruleDigest:'d'.repeat(64)}),'swap-rule-0001',
        'ADMISSION_BINDING_MISMATCH_RULEDIGEST'],
      [buildExpected(topology,{sourceGitBlob:'0'.repeat(40)}),'swap-blob-0001',
        'ADMISSION_BINDING_MISMATCH_SOURCEGITBLOB']];
    for(const [expected,nonce,reason] of cases){
      // Fully aligned attack: receipt, expected AND the untrusted caller
      // sourceObservation all carry the swapped values — only the pinned
      // registry can still deny.
      const denied=await host.admit({
        sourceObservation:sourceObservationFor(expected,expected.sourceGitBlob),
        invocation:{...base.invocation,aotDigest:expected.aotDigest},
        actor:'test',
        installerReceipt:issue(expected,nonce),expected,
        invocationNonce:'swap-invoke-'+nonce});
      assert.equal(denied.admitted,false,nonce);
      assert.equal(denied.reason,reason,nonce+' '+JSON.stringify(denied));
    }
    // Caller presents a DIFFERENT expected than the signed payload carries:
    // the hardened O2 preflight binding-drift path denies first.
    const honest=buildExpected(topology);
    const drift=await host.admit({...base,
      installerReceipt:issue(honest,'drift-expected-0001'),
      expected:buildExpected(topology,{tenantId:'tenant:forged'}),
      invocationNonce:'drift-invoke-0001'});
    assert.equal(drift.admitted,false);
    assert.equal(drift.reason,
      'ADMISSION_INSTALLER_O2_INSTALLER_BINDING_DRIFT_TENANTID');
  }finally{await host.shutdown()}
  // Registry never pinned the deployed bytes: pinned-side drift denies.
  const staleTopology=await provisionTopology(context,
    {bindings:{...topology.registry.deployments[DEPLOYMENT].bindings,
      installedBytesDigest:'e'.repeat(64)}});
  const staleHost=await startHost(staleTopology);
  try{
    const denied=await staleHost.admit({
      installerReceipt:issueInstallerReceipt(
        {issuerId:staleTopology.issuerId,privateKey:staleTopology.issuerKeyFile,
          expected:buildExpected(topology),nowMs:NOW-1000,
          nonce:'stale-bytes-0001',revocationEpoch:1}),
      expected:buildExpected(topology),
      sourceObservation:sourceObservationFor(buildExpected(topology)),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:context.artifact.digest,observedOutputDigest:'3'.repeat(64),
        functionDisposition:'UNKNOWN'},
      invocationNonce:'stale-invoke-0001',actor:'test'});
    assert.equal(denied.reason,'ADMISSION_BINDING_MISMATCH_INSTALLEDBYTESDIGEST');
  }finally{await staleHost.shutdown()}
  // Function not bound by this deployment.
  const fnTopology=await provisionTopology(context,
    {functionId:'dke.ev16.d02.vv.r999.other'});
  const fnHost=await startHost(fnTopology);
  try{
    const denied=await fnHost.admit({
      installerReceipt:issueInstallerReceipt(
        {issuerId:fnTopology.issuerId,privateKey:fnTopology.issuerKeyFile,
          expected:buildExpected(fnTopology),nowMs:NOW-1000,
          nonce:'fn-swap-0001',revocationEpoch:1}),
      expected:buildExpected(fnTopology),
      sourceObservation:sourceObservationFor(buildExpected(fnTopology)),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:context.artifact.digest,observedOutputDigest:'4'.repeat(64),
        functionDisposition:'UNKNOWN'},
      invocationNonce:'fn-invoke-0001',actor:'test'});
    assert.equal(denied.reason,'ADMISSION_FUNCTION_NOT_BOUND');
  }finally{await fnHost.shutdown()}
  // Issuer never authorized this function.
  const issuerScope=await provisionTopology(context,
    {functionBindings:['dke.ev16.d02.vv.r188.other']});
  const scopeHost=await startHost(issuerScope);
  try{
    const denied=await scopeHost.admit({
      installerReceipt:issueInstallerReceipt(
        {issuerId:issuerScope.issuerId,privateKey:issuerScope.issuerKeyFile,
          expected:buildExpected(issuerScope),nowMs:NOW-1000,
          nonce:'issuer-fn-0001',revocationEpoch:1}),
      expected:buildExpected(issuerScope),
      sourceObservation:sourceObservationFor(buildExpected(issuerScope)),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:context.artifact.digest,observedOutputDigest:'5'.repeat(64),
        functionDisposition:'UNKNOWN'},
      invocationNonce:'iss-invoke-0001',actor:'test'});
    assert.equal(denied.reason,'ADMISSION_ISSUER_FUNCTION_NOT_AUTHORIZED');
  }finally{await scopeHost.shutdown()}
});

test('epoch drift, key rotation and expiry deny STALE',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const oldEpoch=issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    nonce:'epoch-drift-0001',revocationEpoch:0});
  const expired=issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-10_000,
    lifetimeMs:1000,nonce:'expired-0001',revocationEpoch:1});
  const rotatedTopology=await provisionTopology(context,{revocationEpoch:2});
  const rotatedReceipt=issueInstallerReceipt({issuerId:rotatedTopology.issuerId,
    privateKey:rotatedTopology.issuerKeyFile,
    expected:buildExpected(rotatedTopology),nowMs:NOW-1000,
    nonce:'rotated-0001',revocationEpoch:1});
  const admitWith=async(topo,receipt,nonce)=>{
    const host=await startHost(topo);
    try{
      return await host.admit({installerReceipt:receipt,
        expected:buildExpected(topo),
        sourceObservation:sourceObservationFor(buildExpected(topo)),
        invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
          aotDigest:topo.registry.deployments[DEPLOYMENT].bindings.aotDigest,
          observedOutputDigest:'6'.repeat(64),functionDisposition:'UNKNOWN'},
        invocationNonce:nonce,actor:'test'});
    }finally{await host.shutdown()}
  };
  assert.equal((await admitWith(topology,oldEpoch,'epoch-invoke-0001')).reason,
    'ADMISSION_EPOCH_DRIFT');
  assert.equal((await admitWith(topology,expired,'expired-invoke-0001')).reason,
    'ADMISSION_INSTALLER_O2_INSTALLER_EXPIRED_OR_FUTURE');
  assert.equal(
    (await admitWith(rotatedTopology,rotatedReceipt,'rotated-invoke-0001')).reason,
    'ADMISSION_EPOCH_DRIFT');
});

test('host refuses to boot with a key the registry does not pin',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const rogue=generateKeyPairSync('ed25519');
  const rogueKeyFile=join(topology.ledgerDir,'rogue-host.pem');
  writeFileSync(rogueKeyFile,rogue.privateKey.export({format:'pem',type:'pkcs8'}));
  await assert.rejects(()=>spawnAdmissionHost({
    servicePath:join(HERE,'admission-host-service.mjs'),
    registryPath:topology.registryPath,ledgerDir:topology.ledgerDir,
    hostId:topology.hostId,hostKeyFile:rogueKeyFile}),
  /ADMISSION_HOST_EXITED_BEFORE_READY|ADMISSION_HOST_IDENTITY_MISMATCH/);
});

test('ledger truncation, edit or appended junk pins the Host fail-closed',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const admitRequest={installerReceipt:issueInstallerReceipt(
      {issuerId:topology.issuerId,privateKey:topology.issuerKeyFile,expected,
        nowMs:NOW-1000,nonce:'rollback-installer-0001',revocationEpoch:1}),
    expected,sourceObservation:sourceObservationFor(expected),
    invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
      aotDigest:expected.aotDigest,observedOutputDigest:'7'.repeat(64),
      functionDisposition:'UNKNOWN'},
    invocationNonce:'rollback-invoke-0001',actor:'test'};
  const good=await startHost(topology);
  const ok=await good.admit(admitRequest);
  await good.shutdown();
  assert.equal(ok.admitted,true);
  const genesisTag='test-admission-registry-r209:test-admission-host-r209';
  const ledgerFile=join(topology.ledgerDir,'admission-ledger.jsonl');
  const original=readFileSync(ledgerFile,'utf8');
  const lines=original.split('\n').filter(l=>l.length>0);
  assert.equal(lines.length,1);
  writeFileSync(ledgerFile,''); // truncation, anchor kept
  assert.equal(openAdmissionLedger(topology.ledgerDir,genesisTag).rolledBack(),true);
  writeFileSync(ledgerFile,original.slice(0,-40)+'0'+original.slice(-39)); // edit
  assert.equal(openAdmissionLedger(topology.ledgerDir,genesisTag).rolledBack(),true);
  writeFileSync(ledgerFile,original);
  appendFileSync(ledgerFile,JSON.stringify({seq:2})+'\n'); // injected junk
  assert.equal(openAdmissionLedger(topology.ledgerDir,genesisTag).rolledBack(),true);
  const rogueHost=await startHost(topology);
  try{
    assert.equal(rogueHost.rolledBack,true);
    const denied=await rogueHost.admit(admitRequest);
    assert.equal(denied.reason,'ADMISSION_LEDGER_ROLLBACK');
    assert.equal(denied.admitted,false);
  }finally{await rogueHost.shutdown()}
});

test('committed owner-run evidence verifies against the pinned registry',async()=>{
  const evidence=join(HERE,'evidence','owner-run-r209');
  const registryPath=join(HERE,'admission-registry.json');
  if(!existsSync(registryPath)||!existsSync(join(evidence,'run-summary.json')))
    return; // evidence is produced by the local owner provisioning run only
  const registry=JSON.parse(readFileSync(registryPath,'utf8'));
  const receipt=JSON.parse(readFileSync(join(evidence,'installer-receipt.json'),'utf8'));
  const invocation=JSON.parse(readFileSync(join(evidence,'invocation.json'),'utf8'));
  const admission=JSON.parse(readFileSync(join(evidence,'host-admission-result.json'),'utf8'));
  const summary=JSON.parse(readFileSync(join(evidence,'run-summary.json'),'utf8'));
  const bindings=registry.deployments[DEPLOYMENT].bindings;
  // Committed bytes still match every pinned digest (no silent drift).
  assert.equal(sha256file(join(HERE,'admission-consumer.mjs')),bindings.sdkDigest);
  assert.equal(sha256file(join(HERE,'installed-rule-r188.json')),
    bindings.installedBytesDigest);
  assert.equal(sha256file(join(HERE,'..','r155-current-vv-815-research-consumer.mjs')),
    bindings.ruleDigest);
  // The archived same-call really targeted the selected function + this AOT.
  const context=await prepared;
  assert.equal(context.artifact.digest,bindings.aotDigest);
  assert.equal(invocation.functionId,R188_FUNCTION);
  assert.equal(invocation.observedDisposition,'UNKNOWN');
  assert.equal(invocation.observedAuthority,'NONE');
  assert.equal(admission.admitted,true);
  assert.equal(admission.status,'OBSERVED_SCOPED_CANDIDATE');
  const verification=verifyAdmissionHostReceipt(admission.receipt,
    {registry,hostId:OWNER_HOST_ID,
      expected:{deploymentId:DEPLOYMENT,
        invocationNonce:admission.receipt.invocationNonce,
        subject:R188_BINDING_SUBJECT,
        observedOutputDigest:invocation.observedOutputDigest}});
  assert.equal(verification.valid,true,JSON.stringify(verification));
  // Installer receipt signature verifies under the pinned issuer key.
  assert.equal(verifySignature(null,
    serializeO2UntrustedInstallerPayload(receipt.payload),
    createPublicKey({key:Buffer.from(
      registry.issuers[receipt.issuerId].spkiDerBase64Url,'base64url'),
      format:'der',type:'spki'}),
    Buffer.from(receipt.signatureBase64Url,'base64url')),true);
  // Archived durable ledger (copied to tmp: opening rewrites the anchor)
  // is chain-intact under the archived genesis identity.
  const ledgerCopy=freshDir();
  cpSync(join(evidence,'ledger'),ledgerCopy,{recursive:true});
  assert.equal(openAdmissionLedger(ledgerCopy,
    registry.registryId+':'+OWNER_HOST_ID).rolledBack(),false);
  // The archived consumed nonce denies a FRESH valid receipt: replay fence
  // holds across archive boundaries. The replay topology pins a test issuer
  // key under the archived issuer identity and reuses the archived ledger.
  const replayTopology=await provisionTopology(context,
    {registryId:registry.registryId,hostId:OWNER_HOST_ID,
      issuerId:receipt.issuerId,bindings});
  cpSync(join(evidence,'ledger'),replayTopology.ledgerDir,{recursive:true});
  const replayExpected=buildExpected(replayTopology);
  const replayHost=await startHost(replayTopology);
  try{
    const replayed=await replayHost.admit({
      installerReceipt:issueInstallerReceipt(
        {issuerId:receipt.issuerId,privateKey:replayTopology.issuerKeyFile,
          expected:replayExpected,nowMs:NOW-1000,
          nonce:receipt.payload.nonce,revocationEpoch:1}),
      expected:replayExpected,
      sourceObservation:sourceObservationFor(replayExpected),
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest:replayExpected.aotDigest,observedOutputDigest:'8'.repeat(64),
        functionDisposition:'UNKNOWN'},
      invocationNonce:'archived-replay-invoke-0001',actor:'test'});
    assert.equal(replayed.status,'REPLAY');
    assert.equal(replayed.reason,'ADMISSION_NONCE_REPLAY');
  }finally{await replayHost.shutdown()}
  assert.equal(summary.receiptVerifiedByConsumer,true);
  assert.equal(summary.honestyNotes.includes('SINGLE_OWNER_ECOSYSTEM'),true);
});
