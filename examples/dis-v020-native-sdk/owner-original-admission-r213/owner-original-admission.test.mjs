/**
 * DKE #2 / DIE #155 F-D (R213) — OWNER_TIER_ORIGINAL_PATH_ADMISSION.
 *
 * Positive: the selected Function dke.ev16.d02.vv.r188.observe is invoked
 * through the real byte-pinned AOT/SDK and that SAME call is admitted by the
 * UNMODIFIED r209 admission Host against a NEW r213 deployment pin whose
 * installed-rule bytes embed the versioned owner-tier attestation — proving
 * the zero-Host-code-change consumption path R211 recorded as conditionally
 * ready. The committed owner-run chain (registry / installed-rule / signed
 * installer + Host receipts / durable ledger) is re-verified from public
 * data only, as CI does on every pipeline run.
 *
 * Negatives: tampered installed-rule bytes, unpinned/revoked-forger issuer,
 * forged signature, tenant/scope/deployment/function/binding swaps, epoch
 * drift, expiry, cross-process restart replay, archived-nonce replay and
 * ledger rollback — all fail closed. UNKNOWN: any drift of the committed
 * original evidence (graph node count, claim lifecycle, repin binding,
 * qualification booleans) fails verification; tier labels that could
 * impersonate professional/publisher/formal states are rejected.
 *
 * Honesty: single-owner ecosystem; structural (key/channel) independence
 * only; the owner tier attests research-grade facts and NEVER professional
 * qualification, publisher rights, formal SAP/ECP or DIS Full-21 promotion.
 * The O2 preflight stays negative-only for every receipt, admitted included.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPublicKey,generateKeyPairSync,
  verify as verifySignature} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serializeO2UntrustedInstallerPayload,
  inspectO2InstalledRuleTrustPreflight}
  from '../o2-installed-rule-trust-preflight.mjs';
import {buildR188AdmissionContext,bootR188App,R188_PIN}
  from '../full-host-admission-r0/test-fixture.mjs';
import {issueInstallerReceipt} from '../full-host-admission-r0/issuer-install.mjs';
import {spawnAdmissionHost,verifyAdmissionHostReceipt,
  digestObservationOutput}
  from '../full-host-admission-r0/admission-consumer.mjs';
import {ADMISSION_REGISTRY_SCHEMA,
  serializeAdmissionHostReceiptPayload}
  from '../full-host-admission-r0/admission-host.mjs';
import {verifyOwnerOriginalEvidence,buildOwnerTierAttestation,
  installedRuleRecord,checkOwnerTierLabel,R213_PIN,R213_GRANT,R213_TIER,
  R213_IDS}
  from './owner-original-evidence.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const R0=join(HERE,'..','full-host-admission-r0');
const sha256file=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const sha256bytes=b=>createHash('sha256').update(b).digest('hex');
const NOW=Date.now();
let ledgerSeq=0;
const freshDir=()=>{
  const dir=join(tmpdir(),'r213-admission-test-'+process.pid+'-'+(++ledgerSeq));
  mkdirSync(dir,{recursive:true});
  return dir;
};
const emitBytes=record=>Buffer.from(JSON.stringify(record,null,2)+'\n','utf8');

const readCommitted=()=>({
  graphText:readFileSync(join(HERE,'..','fixtures',
    'r155-c1-v212-graph-815.jsonld'),'utf8'),
  forgeRepinText:readFileSync(join(HERE,'..','fixtures',
    'r155-ev16-d02-vv-two-leg-source-repin-r143.json'),'utf8'),
  readerCode:readFileSync(join(HERE,'..',
    'r155-current-vv-815-research-consumer.mjs'),'utf8')
});

/** Fresh pinned test topology: fresh issuer+host keys, temp ledger, and an
 * installed-rule built from a REAL attestation over the committed evidence. */
async function provisionTopology(context,overrides={}){
  const committed=readCommitted();
  const evidence=verifyOwnerOriginalEvidence(committed);
  const attestation=buildOwnerTierAttestation({evidence,
    extraEvidencePins:overrides.extraEvidencePins??[],nowMs:NOW});
  const installedRule=installedRuleRecord({attestation,
    ruleDigest:context.ruleDigest,aotDigest:context.artifact.digest,
    sdkDigest:sha256file(join(R0,'admission-consumer.mjs'))});
  const installedBytes=emitBytes(installedRule);
  const installedBytesDigest=sha256bytes(installedBytes);
  const issuer=generateKeyPairSync('ed25519');
  const host=generateKeyPairSync('ed25519');
  const issuerSpki=issuer.publicKey.export({format:'der',type:'spki'});
  const hostSpki=host.publicKey.export({format:'der',type:'spki'});
  const issuerId=overrides.issuerId??'test-issuer-r213';
  const hostId=overrides.hostId??'test-admission-host-r213';
  const registry={schema:ADMISSION_REGISTRY_SCHEMA,
    registryId:overrides.registryId??'test-owner-original-registry-r213',
    trustTopology:'SINGLE_OWNER_ECOSYSTEM_STRUCTURAL_INDEPENDENCE_NOT_INTERPERSONAL',
    ownerGrant:{issue:R213_GRANT.issue,commentId:R213_GRANT.commentId,
      recordedAtIso:R213_GRANT.recordedAtIso,
      grantScopeSha256:R213_GRANT.grantScopeSha256},
    revocationEpoch:overrides.revocationEpoch??1,
    issuers:{[issuerId]:{spkiDerBase64Url:issuerSpki.toString('base64url'),
      spkiSha256:createHash('sha256').update(issuerSpki).digest('hex'),
      activeSinceMs:NOW-1000,
      functionBindings:overrides.functionBindings??[R213_IDS.functionId],
      ...(overrides.issuerRevokedAtMs!==undefined
        ?{revokedAtMs:overrides.issuerRevokedAtMs}:{})}},
    hosts:{[hostId]:{spkiDerBase64Url:hostSpki.toString('base64url'),
      spkiSha256:createHash('sha256').update(hostSpki).digest('hex'),
      kind:'ENGINEERING_ADMISSION_HOST_TEST'}},
    deployments:{[R213_IDS.deploymentId]:{tenantId:R213_IDS.tenantId,
      scope:R213_IDS.scope,
      functionId:overrides.functionId??R213_IDS.functionId,issuerId,hostId,
      bindings:overrides.bindings??{
        aotDigest:context.artifact.digest,
        sdkDigest:sha256file(join(R0,'admission-consumer.mjs')),
        ruleDigest:context.ruleDigest,installedBytesDigest,
        sourceGitBlob:R213_PIN.reader},
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
    issuerId,hostId,installedRule,installedBytes,installedBytesDigest,
    attestation,evidence};
}
const buildExpected=(topology,over={})=>({
  aotDigest:topology.registry.deployments[R213_IDS.deploymentId].bindings.aotDigest,
  sdkDigest:topology.registry.deployments[R213_IDS.deploymentId].bindings.sdkDigest,
  ruleDigest:topology.registry.deployments[R213_IDS.deploymentId].bindings.ruleDigest,
  installedBytesDigest:
    topology.registry.deployments[R213_IDS.deploymentId].bindings.installedBytesDigest,
  tenantId:R213_IDS.tenantId,scope:R213_IDS.scope,
  deploymentId:R213_IDS.deploymentId,sourceGitBlob:R213_PIN.reader,
  nonceChallenge:'test-challenge-r213-0001',...over});
const startHost=topology=>spawnAdmissionHost({
  servicePath:join(R0,'admission-host-service.mjs'),
  registryPath:topology.registryPath,ledgerDir:topology.ledgerDir,
  hostId:topology.hostId,hostKeyFile:topology.hostKeyFile});
const sourceObservationFor=expected=>({authority:'NONE',
  installedRuleAttested:false,sourceBoundCandidateVerified:true,
  selectedAotDigest:expected.aotDigest,
  sourceBoundCandidateDigest:expected.ruleDigest,
  originalSourceGitBlob:R213_PIN.reader});
const prepared=buildR188AdmissionContext();

test('committed original evidence verifies byte-exact; tier-confusion labels rejected',async()=>{
  const committed=readCommitted();
  const summary=verifyOwnerOriginalEvidence(committed);
  assert.equal(summary.graph.nodes,815);
  assert.equal(summary.graph.knowledgeClaims,106);
  assert.equal(summary.graph.claimsPendingReview,106);
  assert.equal(summary.graph.reviewDecisions,0);
  assert.equal(summary.selectedClaim.lifecycle,'PENDING_REVIEW');
  assert.equal(summary.twoLegBinding.outcomeLeg.lifecycle,'PENDING_REVIEW');
  assert.equal(summary.forgeRepin.state,'PREPARED_UNQUALIFIED');
  // The fixed tier label itself must pass its own confusion guard…
  assert.equal(checkOwnerTierLabel(R213_TIER.name),true);
  // …while impersonating labels are rejected — including morphological
  // variants (independent-review hardening probe class).
  for(const bad of ['OWNER_PROFESSIONAL_QUALIFICATION',
    'PUBLISHER_LICENSED_ORIGINAL','ORIGINAL_SAP_QUALIFIED_OWNER',
    'FORMAL_ORIGINAL_E2E_VERIFIED','PROFESSIONAL_QUALIFIED_OWNER_ATTESTED',
    'owner_attested_professional_qualification','LICENSED_RESEARCH_ADMISSION'])
    assert.throws(()=>checkOwnerTierLabel(bad),
      {message:/TIER_LABEL_CONFUSION_REJECTED/},bad);
  // UNKNOWN fail-closed: any drift of the committed evidence is rejected —
  // the byte-pin fence fires first (mutated bytes cannot keep their git
  // blob), which is itself the intended fail-closed behavior.
  const driftedGraph=JSON.parse(committed.graphText);
  driftedGraph['@graph'].pop();
  assert.throws(()=>verifyOwnerOriginalEvidence({...committed,
    graphText:JSON.stringify(driftedGraph)}),{message:/^R213_EVIDENCE_/});
  const driftedRepin=JSON.parse(committed.forgeRepinText);
  driftedRepin.selectedCqSourceBinding.claim.reviewStatus='ACCEPTED';
  assert.throws(()=>verifyOwnerOriginalEvidence({...committed,
    forgeRepinText:JSON.stringify(driftedRepin)}),
    {message:/^R213_EVIDENCE_/});
  const inflated=JSON.parse(committed.forgeRepinText);
  inflated.qualification.qualifiedSap=true;
  assert.throws(()=>verifyOwnerOriginalEvidence({...committed,
    forgeRepinText:JSON.stringify(inflated)}),
    {message:/^R213_EVIDENCE_/});
  // Byte-pin fence rejects a replaced fixture text outright.
  assert.throws(()=>verifyOwnerOriginalEvidence({...committed,
    graphText:committed.graphText+' '}),{message:/GRAPH_BLOB_DRIFT/});
  // Attestation refuses to build without verified evidence.
  assert.throws(()=>buildOwnerTierAttestation({evidence:null}),
    {message:/ATTESTATION_INPUT_MISSING/});
});

test('SAME-CALL positive: real r188 invoke admitted via NEW r213 deployment pin on the UNMODIFIED r209 Host, attestation bytes end-to-end bound',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const receipt=issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    lifetimeMs:3600_000,nonce:'r213-installer-nonce-0001',revocationEpoch:1});
  const app=await bootR188App(context);
  let observation;
  try{
    observation=await app.invoke(R213_IDS.functionId,
      {subject:R213_IDS.bindingSubject},{expectedContractVersion:'1.0.0'});
  }finally{app.stop()}
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.disposition,'UNKNOWN');
  assert.equal(observation.authority,'NONE');
  const observedOutputDigest=digestObservationOutput(observation.value);
  const host=await startHost(topology);
  let admitted;
  try{
    admitted=await host.admit({installerReceipt:receipt,expected,
      sourceObservation:sourceObservationFor(expected),
      invocation:{functionId:R213_IDS.functionId,
        subject:R213_IDS.bindingSubject,aotDigest:expected.aotDigest,
        observedOutputDigest,functionDisposition:observation.disposition},
      invocationNonce:'r213-invoke-nonce-0001',actor:'test-r213'});
  }finally{await host.shutdown()}
  assert.equal(admitted.status,'OBSERVED_SCOPED_CANDIDATE');
  assert.equal(admitted.admitted,true);
  assert.equal(admitted.reason,'ADMITTED_OBSERVATION_ONLY');
  assert.equal(admitted.claimAttested,false);
  assert.equal(admitted.effectDispatched,false);
  // The signed receipt binds the EXACT attested installed-rule bytes.
  assert.equal(admitted.receipt.installedBytesDigest,
    topology.installedBytesDigest);
  assert.equal(admitted.receipt.tenantId,R213_IDS.tenantId);
  assert.equal(admitted.receipt.scope,R213_IDS.scope);
  assert.equal(admitted.receipt.deploymentId,R213_IDS.deploymentId);
  assert.equal(admitted.receipt.functionDisposition,'UNKNOWN');
  assert.equal(admitted.receipt.claimAttested,false);
  assert.equal(admitted.receipt.externalBusinessEffect,false);
  // …and the attestation inside those bytes is the owner tier, honestly.
  assert.equal(topology.installedRule.admissionTier,R213_TIER.name);
  assert.equal(topology.attestation.formalOriginalE2e,'0_OF_1_UNCHANGED');
  assert.ok(topology.attestation.notAttested.some(x=>x.includes(
    'PUBLISHER_RIGHTS')));
  assert.ok(topology.attestation.notAttested.some(x=>x.includes(
    'PROFESSIONAL_OR_BUSINESS_SEMANTIC_ORACLE')));
  const verification=verifyAdmissionHostReceipt(admitted.receipt,
    {registry:topology.registry,hostId:topology.hostId,
      expected:{deploymentId:R213_IDS.deploymentId,
        invocationNonce:'r213-invoke-nonce-0001',
        subject:R213_IDS.bindingSubject,observedOutputDigest}});
  assert.equal(verification.valid,true,JSON.stringify(verification));
  // The hardened negative-only O2 preflight stays negative for this receipt.
  const pre=inspectO2InstalledRuleTrustPreflight({
    sourceObservation:sourceObservationFor(expected),expected,receipt,
    nowEpochMs:NOW});
  assert.equal(pre.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT');
  assert.equal(pre.technicalSignatureVerified,true);
  assert.equal(pre.hostAttested,false);
  // Durable ledger carries the receipt payload hash of the admitted call
  // (the Host signs/records the payload BEFORE appending the signature).
  const lines=readFileSync(join(topology.ledgerDir,'admission-ledger.jsonl'),
    'utf8').split('\n').filter(l=>l.length>0);
  assert.equal(lines.length,1);
  const entry=JSON.parse(lines[0]);
  assert.equal(entry.deploymentId,R213_IDS.deploymentId);
  const {signatureBase64Url:receiptSig,...receiptPayload}=admitted.receipt;
  assert.equal(entry.hostReceiptSha256,
    sha256bytes(Buffer.from(serializeAdmissionHostReceiptPayload(
      receiptPayload))));
});

test('committed owner-run chain re-verifies from public data only (registry <-> installed-rule <-> receipts <-> ledger)',async()=>{
  const registryPath=join(HERE,'owner-original-admission-registry-r213.json');
  const installedRulePath=join(HERE,'installed-rule-owner-original-r213.json');
  const evidenceDir=join(HERE,'evidence','owner-run-r213');
  for(const p of [registryPath,installedRulePath,
    join(evidenceDir,'installer-receipt.json'),
    join(evidenceDir,'invocation.json'),
    join(evidenceDir,'host-admission-result.json'),
    join(evidenceDir,'ledger','admission-ledger.jsonl'),
    join(evidenceDir,'run-summary.json')])
    assert.equal(existsSync(p),true,'missing committed artifact: '+p);
  const registry=JSON.parse(readFileSync(registryPath,'utf8'));
  const installedRule=JSON.parse(readFileSync(installedRulePath,'utf8'));
  const deployment=registry.deployments[R213_IDS.deploymentId];
  // Registry pin equals the exact committed installed-rule bytes…
  assert.equal(deployment.bindings.installedBytesDigest,
    sha256file(installedRulePath));
  // …whose embedded attestation is the owner tier with the recorded grant.
  assert.equal(installedRule.admissionTier,R213_TIER.name);
  assert.equal(installedRule.ownerTierAttestation.grant.commentId,
    R213_GRANT.commentId);
  assert.equal(installedRule.ownerTierAttestation.grant.grantScopeSha256,
    R213_GRANT.grantScopeSha256);
  assert.equal(installedRule.ownerTierAttestation.formalOriginalE2e,
    '0_OF_1_UNCHANGED');
  // Installer receipt signature verifies against the pinned issuer SPKI.
  const installerReceipt=JSON.parse(
    readFileSync(join(evidenceDir,'installer-receipt.json'),'utf8'));
  const issuer=registry.issuers[deployment.issuerId];
  assert.equal(installerReceipt.spkiDerBase64Url,issuer.spkiDerBase64Url);
  const issuerKey=createPublicKey({key:Buffer.from(issuer.spkiDerBase64Url,
    'base64url'),format:'der',type:'spki'});
  assert.equal(verifySignature(null,
    serializeO2UntrustedInstallerPayload(installerReceipt.payload),issuerKey,
    Buffer.from(installerReceipt.signatureBase64Url,'base64url')),true);
  for(const field of ['aotDigest','sdkDigest','ruleDigest',
    'installedBytesDigest','tenantId','scope','deploymentId','sourceGitBlob']){
    const pinned=field==='deploymentId'?R213_IDS.deploymentId:
      deployment.bindings[field]??deployment[field];
    assert.equal(installerReceipt.payload[field],pinned,field);
  }
  // Host receipt verifies against the pinned Host SPKI for this invocation
  // (invocationNonce is not re-checked here; the archived ledger entry below
  // binds the receipt payload hash of the admitted call).
  const invocation=JSON.parse(
    readFileSync(join(evidenceDir,'invocation.json'),'utf8'));
  const result=JSON.parse(
    readFileSync(join(evidenceDir,'host-admission-result.json'),'utf8'));
  assert.equal(result.admitted,true);
  const verification=verifyAdmissionHostReceipt(result.receipt,{registry,
    hostId:R213_IDS.hostId,expected:{deploymentId:R213_IDS.deploymentId,
      subject:invocation.subject,
      observedOutputDigest:invocation.observedOutputDigest}});
  assert.equal(verification.valid,true,JSON.stringify(verification));
  assert.equal(result.receipt.installedBytesDigest,
    deployment.bindings.installedBytesDigest);
  assert.equal(result.receipt.observedOutputDigest,
    invocation.observedOutputDigest);
  // Durable ledger hash chain + anchor are intact for the archived run.
  const chain=readFileSync(join(evidenceDir,'ledger','admission-ledger.jsonl'),
    'utf8').split('\n').filter(l=>l.length>0);
  const anchor=JSON.parse(
    readFileSync(join(evidenceDir,'ledger','admission-ledger.anchor'),'utf8'));
  assert.equal(anchor.seq,chain.length);
  let prevHash=createHash('sha256')
    .update('genesis:'+registry.registryId+':'+R213_IDS.hostId).digest('hex');
  for(let i=0;i<chain.length;i++){
    const entry=JSON.parse(chain[i]);
    assert.equal(entry.seq,i+1);
    assert.equal(entry.prevHash,prevHash);
    const {entryHash,...rest}=entry;
    const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':
      v&&typeof v==='object'?'{'+Object.keys(v).sort()
        .map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':
      JSON.stringify(v);
    assert.equal(entryHash,createHash('sha256').update(stable(rest))
      .digest('hex'));
    prevHash=entryHash;
  }
  assert.equal(anchor.entryHash,prevHash);
  // The run summary restates the honesty boundary.
  const summary=JSON.parse(
    readFileSync(join(evidenceDir,'run-summary.json'),'utf8'));
  assert.equal(summary.tier,R213_TIER.name);
  assert.match(summary.honesty,/NOT professional\/publisher\/formal/);
});

test('tampered installed-rule bytes, unpinned issuer and forged signature all deny',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const make=(over={})=>issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    lifetimeMs:3600_000,nonce:'r213-neg-installer-'+Date.now().toString(36),
    revocationEpoch:1,...over});
  const request=(receipt,exp=expected,invocationNonce=
    'r213-neg-invoke-'+Date.now().toString(36))=>({installerReceipt:receipt,
    expected:exp,sourceObservation:sourceObservationFor(exp),
    invocation:{functionId:R213_IDS.functionId,
      subject:R213_IDS.bindingSubject,aotDigest:exp.aotDigest,
      observedOutputDigest:'0'.repeat(64),functionDisposition:'UNKNOWN'},
    invocationNonce,actor:'test-r213-neg'});
  const host=await startHost(topology);
  try{
    // Tampered installed-rule bytes: digest of the bytes no longer matches
    // the deployment-pinned installedBytesDigest.
    const tampered=JSON.parse(
      JSON.stringify(topology.installedRule));
    tampered.ownerTierAttestation.attestedByOwner.push('SOMETHING_ELSE');
    const tamperedDigest=sha256bytes(emitBytes(tampered));
    const tamperedExpected=buildExpected(topology,
      {installedBytesDigest:tamperedDigest});
    const tamperedReceipt=issueInstallerReceipt({issuerId:topology.issuerId,
      privateKey:topology.issuerKeyFile,expected:tamperedExpected,
      nowMs:NOW-1000,lifetimeMs:3600_000,
      nonce:'r213-tampered-installer-0001',revocationEpoch:1});
    let denied=await host.admit(request(tamperedReceipt,tamperedExpected,
      'r213-tampered-invoke-0001'));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_BINDING_MISMATCH_INSTALLEDBYTESDIGEST');
    // Unpinned issuer: a perfectly valid signature from a foreign key.
    const foreign=generateKeyPairSync('ed25519');
    const foreignKeyFile=join(freshDir(),'foreign.pem');
    writeFileSync(foreignKeyFile,
      foreign.privateKey.export({format:'pem',type:'pkcs8'}));
    denied=await host.admit(request(issueInstallerReceipt(
      {issuerId:'foreign-issuer-r213',privateKey:foreignKeyFile,expected,
        nowMs:NOW-1000,lifetimeMs:3600_000,
        nonce:'r213-foreign-installer-0001',revocationEpoch:1})));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_ISSUER_NOT_PINNED');
    // Forged signature over the pinned issuer id.
    const forged=make();
    forged.signatureBase64Url=Buffer.from('f'.repeat(64)).toString('base64url');
    denied=await host.admit(request(forged));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,
      'ADMISSION_INSTALLER_O2_INSTALLER_SIGNATURE_INVALID');
    // Tenant/scope/deployment swaps deny on the Host's own binding checks:
    // the installer receipt is signed OVER the swapped expectation (so the
    // O2 layer passes) and the deployment pin still refuses it.
    const swappedTenant=buildExpected(topology,
      {tenantId:'tenant:someone-else'});
    denied=await host.admit(request(issueInstallerReceipt(
      {issuerId:topology.issuerId,privateKey:topology.issuerKeyFile,
        expected:swappedTenant,nowMs:NOW-1000,lifetimeMs:3600_000,
        nonce:'r213-swap-tenant-installer-0001',revocationEpoch:1}),
      swappedTenant));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_BINDING_MISMATCH_TENANTID');
    const swappedScope=buildExpected(topology,{scope:'scope:someone-else'});
    denied=await host.admit(request(issueInstallerReceipt(
      {issuerId:topology.issuerId,privateKey:topology.issuerKeyFile,
        expected:swappedScope,nowMs:NOW-1000,lifetimeMs:3600_000,
        nonce:'r213-swap-scope-installer-0001',revocationEpoch:1}),
      swappedScope));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_BINDING_MISMATCH_SCOPE');
    denied=await host.admit(request(make(),
      buildExpected(topology,{deploymentId:'deployment:not-pinned'})));
    assert.equal(denied.reason,'ADMISSION_DEPLOYMENT_NOT_PINNED');
    // Unbound function in the invocation denies without touching the ledger.
    denied=await host.admit({installerReceipt:make(),expected,
      sourceObservation:sourceObservationFor(expected),
      invocation:{functionId:'dke.ev16.d02.vv.r999.observe',
        subject:R213_IDS.bindingSubject,aotDigest:expected.aotDigest,
        observedOutputDigest:'0'.repeat(64),functionDisposition:'UNKNOWN'},
      invocationNonce:'r213-unbound-invoke-0001',actor:'test-r213-neg'});
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_FUNCTION_NOT_BOUND');
  }finally{await host.shutdown()}
});

test('cross-process restart on the SAME durable ledger denies replayed nonce; ledger rollback denies admission',async()=>{
  const context=await prepared;
  const topology=await provisionTopology(context);
  const expected=buildExpected(topology);
  const make=nonce=>issueInstallerReceipt({issuerId:topology.issuerId,
    privateKey:topology.issuerKeyFile,expected,nowMs:NOW-1000,
    lifetimeMs:3600_000,nonce,revocationEpoch:1});
  const request=(receipt,invocationNonce)=>({installerReceipt:receipt,
    expected,sourceObservation:sourceObservationFor(expected),
    invocation:{functionId:R213_IDS.functionId,
      subject:R213_IDS.bindingSubject,aotDigest:expected.aotDigest,
      observedOutputDigest:'0'.repeat(64),functionDisposition:'UNKNOWN'},
    invocationNonce,actor:'test-r213-replay'});
  const first=await startHost(topology);
  const ok=await first.admit(request(make('r213-restart-installer-once-0001'),
    'r213-restart-invoke-once-0001'));
  await first.shutdown();
  assert.equal(ok.admitted,true);
  // NEW Host process, SAME durable ledger: same installer nonce is replay.
  const second=await startHost(topology);
  try{
    const replayed=await second.admit(
      request(make('r213-restart-installer-once-0001'),
        'r213-restart-invoke-twice-0002'));
    assert.equal(replayed.admitted,false);
    assert.equal(replayed.status,'REPLAY');
    assert.equal(replayed.reason,'ADMISSION_NONCE_REPLAY');
  }finally{await second.shutdown()}
  // Ledger rollback (truncate the only entry) pins every later Host closed.
  const ledgerFile=join(topology.ledgerDir,'admission-ledger.jsonl');
  writeFileSync(ledgerFile,'');
  const third=await startHost(topology);
  try{
    const denied=await third.admit(
      request(make('r213-restart-installer-fresh-0003'),
        'r213-restart-invoke-fresh-0003'));
    assert.equal(denied.admitted,false);
    assert.equal(denied.reason,'ADMISSION_LEDGER_ROLLBACK');
  }finally{await third.shutdown()}
});

test('STALE paths: epoch drift and expiry deny/defer admission',async()=>{
  const context=await prepared;
  // Epoch drift: installer receipt from an older revocation epoch.
  const staleTopology=await provisionTopology(context,
    {revocationEpoch:2});
  const staleExpected=buildExpected(staleTopology);
  const staleReceipt=issueInstallerReceipt({issuerId:staleTopology.issuerId,
    privateKey:staleTopology.issuerKeyFile,expected:staleExpected,
    nowMs:NOW-1000,lifetimeMs:3600_000,
    nonce:'r213-epoch-installer-0001',revocationEpoch:1});
  const staleHost=await startHost(staleTopology);
  try{
    const denied=await staleHost.admit({installerReceipt:staleReceipt,
      expected:staleExpected,
      sourceObservation:sourceObservationFor(staleExpected),
      invocation:{functionId:R213_IDS.functionId,
        subject:R213_IDS.bindingSubject,aotDigest:staleExpected.aotDigest,
        observedOutputDigest:'0'.repeat(64),functionDisposition:'UNKNOWN'},
      invocationNonce:'r213-epoch-invoke-0001',actor:'test-r213-stale'});
    assert.equal(denied.admitted,false);
    assert.equal(denied.status,'STALE');
    assert.equal(denied.reason,'ADMISSION_EPOCH_DRIFT');
  }finally{await staleHost.shutdown()}
  // Expired installer receipt: issued in the past, already expired now.
  const expiredTopology=await provisionTopology(context);
  const expiredExpected=buildExpected(expiredTopology);
  const expiredReceipt=issueInstallerReceipt(
    {issuerId:expiredTopology.issuerId,
      privateKey:expiredTopology.issuerKeyFile,expected:expiredExpected,
      nowMs:NOW-2*3600_000,lifetimeMs:3600_000,
      nonce:'r213-expired-installer-0001',revocationEpoch:1});
  const expiredHost=await startHost(expiredTopology);
  try{
    const denied=await expiredHost.admit({installerReceipt:expiredReceipt,
      expected:expiredExpected,
      sourceObservation:sourceObservationFor(expiredExpected),
      invocation:{functionId:R213_IDS.functionId,
        subject:R213_IDS.bindingSubject,aotDigest:expiredExpected.aotDigest,
        observedOutputDigest:'0'.repeat(64),functionDisposition:'UNKNOWN'},
      invocationNonce:'r213-expired-invoke-0001',actor:'test-r213-stale'});
    assert.equal(denied.admitted,false);
    assert.equal(denied.status,'STALE');
  }finally{await expiredHost.shutdown()}
});
