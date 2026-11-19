/** DIE #4 R209 / #1527 Phase B — trusted-install admission same-call gate.
 * Positive: the committed owner trust registry, signed installer grant and
 * live Host receipt are all re-derived from the exact HEAD bytes and verified
 * against PINNED keys (never receipt-supplied SPKI). The full signed Host
 * path additionally runs on Linux with a CI-scoped Ed25519 Host key pinned in
 * a locally mutated trust copy — owner-key custody itself is proven only by
 * the committed live receipt. Negatives are adversarial and real (forged
 * keys, tampered bytes, registry drift, replay, revocation, expiry, missing
 * SAP/ECP fail-closed). No qualification promotion: the selected Function
 * stays OBSERVATION/UNKNOWN authority NONE in every layer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign as signBytes} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {serializeO2UntrustedInstallerPayload} from '../o2-installed-rule-trust-preflight.mjs';
import {createO2DurableNonceLedger} from '../o2-durable-nonce-ledger.mjs';
import {
  readCommittedAdmissionTrust,buildR188AdmissionAot,deriveR188RuleDigest,PIN,
  loadFullHostAdmissionTrustRegistry,verifyInstallerGrantAgainstPinnedRoot,
  createAdmissionChainVerifier,createFullHostAdmissionHost,
  verifyHostReceiptAgainstPinnedHostKey
} from './full-host-admission.mjs';

const LINUX=process.platform==='linux';
const sha256=x=>createHash('sha256').update(x).digest('hex');
const committed=await readCommittedAdmissionTrust();
const {trust,installerGrant,liveReceipt,registryText,issuerSpkiBase64Url}=committed;
const grantPayload=installerGrant.payload;
const grantCanonical=serializeO2UntrustedInstallerPayload(grantPayload);
const grantFingerprint=sha256(grantCanonical);
const SUBJECT=trust.admission.subjectBinding;
const receiptPayload=liveReceipt.receipt.payload;
const verifyGrant=(over={})=>verifyInstallerGrantAgainstPinnedRoot({
  trust,receipt:installerGrant,nowEpochMs:liveReceipt.executedAtMs,...over});

test('committed owner trust registry is structurally pinned (single-owner structural authority)',()=>{
  assert.equal(trust.schema,'dis.v0.2.full-host-admission.trust-registry/1');
  assert.equal(trust.authorityModel,'OWNER_ATTESTED_STRUCTURAL_NOT_INTERPERSONAL');
  assert.equal(trust.singleOwnerEcosystem,true);
  assert.deepEqual(trust.grant.rows,[1,2,3,4]);
  assert.equal(trust.grant.grantRef,'kaicreator-mm/domain-harness#1527 comment 7007585312');
  assert.equal(trust.issuer.provisionedOutsideRepo,true);
  assert.equal(trust.issuerKey.asymmetricKeyType,'ed25519');
  assert.equal(trust.hostKey.asymmetricKeyType,'ed25519');
  assert.equal(trust.ecp.functionId,'dke.ev16.d02.vv.r188.observe');
  assert.equal(trust.ecp.formalQualification,false);
  assert.equal(trust.limits.noConformancePromotion,true);
  assert.equal(sha256(Buffer.from(issuerSpkiBase64Url,'base64url')),trust.issuerFingerprint);
});

test('exact HEAD bytes re-derive the pinned AOT/SDK/installed-Rule digests',async()=>{
  const built=await buildR188AdmissionAot();
  assert.equal(built.artifact.digest,trust.admission.aotDigest);
  assert.equal(sourceSha256(built.texts.reader),trust.admission.installedBytesDigest);
  assert.equal(sha256(readFileSync(new URL('../../../packages/microkernel/dis-v020.mjs',import.meta.url),'utf8')),
    trust.admission.sdkDigest);
  assert.equal(deriveR188RuleDigest({aotDigest:built.artifact.digest,
    tenantId:trust.admission.tenantId,scope:trust.admission.scope,
    functionId:trust.admission.functionId,readerSha256:sourceSha256(built.texts.reader),
    readerGitBlob:PIN.reader}),trust.admission.ruleDigest);
  assert.equal(sourceSha256(built.texts.graph).length,64);
});

test('committed installer grant verifies against the pinned issuer root, not its own SPKI',()=>{
  const atExecution=verifyGrant();
  assert.equal(atExecution.status,'VERIFIED_PINNED_INSTALLER_TRUST_ROOT');
  assert.equal(atExecution.technicalSignatureVerified,true);
  assert.equal(atExecution.pinnedKeyProvenance,'COMMITTED_TRUST_REGISTRY_NOT_RECEIPT_SUPPLIED');
  assert.equal(atExecution.grantFingerprint,grantFingerprint);
  const fresh=verifyGrant({nowEpochMs:Date.now()});
  assert.equal(fresh.status,'VERIFIED_PINNED_INSTALLER_TRUST_ROOT');
});

test('committed live same-call receipt verifies against the pinned Host key over a fresh same-call observation',async()=>{
  assert.equal(liveReceipt.result.status,'SAME_CALL_ADMITTED_SIGNED_RECEIPT');
  assert.equal(liveReceipt.result.claimAttested,false);
  assert.equal(liveReceipt.result.effectDispatched,false);
  const verifier=await createAdmissionChainVerifier({trust});
  let observation;
  try{observation=await verifier.invokeObserve(SUBJECT)}
  finally{verifier.stop()}
  assert.equal(observation.kind,'OBSERVATION');
  assert.equal(observation.authority,'NONE');
  assert.equal(observation.disposition,'UNKNOWN');
  const check=verifyHostReceiptAgainstPinnedHostKey({trust,
    receipt:liveReceipt.receipt,observation,nowEpochMs:Date.now()});
  assert.equal(check.status,'VERIFIED_PINNED_HOST_RECEIPT');
  assert.equal(check.hostFingerprint,trust.hostFingerprint);
  assert.equal(receiptPayload.nonce,grantPayload.nonce);
  assert.equal(receiptPayload.grantFingerprint,grantFingerprint);
  assert.equal(receiptPayload.observationDisposition,'OBSERVATION_UNKNOWN');
  assert.equal(receiptPayload.aotDigest,trust.admission.aotDigest);
});

test('unsigned admission chain reproduces the committed receipt payload field-by-field at HEAD',async()=>{
  const verifier=await createAdmissionChainVerifier({trust});
  let dry;
  try{dry=await verifier.dryAdmit({installerReceipt:installerGrant,subject:SUBJECT,
    ecpClaim:trust.ecp,nowEpochMs:liveReceipt.executedAtMs})}
  finally{verifier.stop()}
  assert.equal(dry.status,'CHAIN_VERIFIED_UNSIGNED_DRAFT');
  assert.equal(dry.signed,false);
  for(const [key,value] of Object.entries(receiptPayload)){
    if(key==='issuedAtMs')continue;
    assert.equal(dry.receiptPayloadDraft[key],value,key);
  }
  assert.equal(Number.isSafeInteger(receiptPayload.issuedAtMs),true);
  assert.equal(dry.receiptPayloadDraft.issuedAtMs,null);
});

test('adversarial negatives: forged issuer, tampered bytes, registry drift, replay, revocation, expiry',async()=>{
  const attacker=generateKeyPairSync('ed25519');
  const attackerSpki=attacker.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  const attackerSig=signBytes(null,grantCanonical,attacker.privateKey).toString('base64url');
  assert.equal(verifyGrant({receipt:{issuerId:'owner-issuer-r209',
    spkiDerBase64Url:attackerSpki,signatureBase64Url:attackerSig,payload:grantPayload}})
    .reason,'ADM_ISSUER_NOT_PINNED');
  assert.equal(verifyGrant({receipt:{...installerGrant,
    signatureBase64Url:attackerSig}}).reason,'ADM_SIGNATURE_INVALID');
  assert.equal(verifyGrant({receipt:{...installerGrant,
    payload:{...grantPayload,tenantId:'tenant:attacker'}}}).reason,'ADM_BINDING_DRIFT_TENANTID');
  assert.equal(verifyGrant({receipt:{...installerGrant,
    payload:{...grantPayload,expiresAtMs:grantPayload.expiresAtMs+3600000}}}).reason,
    'ADM_SIGNATURE_INVALID');
  const mutatedTrust=(mutate)=>{
    const parsed=JSON.parse(registryText);mutate(parsed);
    return loadFullHostAdmissionTrustRegistry({registryText:JSON.stringify(parsed),
      issuerSpkiBase64Url,hostSpkiBase64Url:parsed.host.spkiDerBase64Url});
  };
  const tenantDrift=mutatedTrust(p=>{p.admission.tenantId='tenant:drift'});
  assert.equal(verifyInstallerGrantAgainstPinnedRoot({trust:tenantDrift,
    receipt:installerGrant,nowEpochMs:liveReceipt.executedAtMs}).reason,'ADM_BINDING_DRIFT_TENANTID');
  const ruleDrift=mutatedTrust(p=>{p.admission.ruleDigest='c'.repeat(64)});
  assert.equal(verifyInstallerGrantAgainstPinnedRoot({trust:ruleDrift,
    receipt:installerGrant,nowEpochMs:liveReceipt.executedAtMs}).reason,'ADM_BINDING_DRIFT_RULEDIGEST');
  assert.equal(verifyGrant({observedNonces:[grantPayload.nonce]}).reason,'ADM_NONCE_REPLAY');
  assert.equal(verifyGrant({revokedIssuerIds:[trust.issuer.issuerId]}).reason,'ADM_ISSUER_REVOKED');
  const floorBump=mutatedTrust(p=>{p.issuer.revocationEpochFloor=2});
  assert.equal(verifyInstallerGrantAgainstPinnedRoot({trust:floorBump,
    receipt:installerGrant,nowEpochMs:liveReceipt.executedAtMs}).reason,'ADM_REVOCATION_EPOCH_BELOW_FLOOR');
  assert.equal(verifyGrant({nowEpochMs:grantPayload.expiresAtMs}).reason,'ADM_EXPIRED_OR_FUTURE');
  await assert.rejects(createAdmissionChainVerifier({trust:ruleDrift}),
    /ADMISSION_(RULE_DIGEST|AOT_DIGEST|INSTALLED_BYTES|SDK_DIGEST)_DRIFT/);
});

test('missing/foreign SAP-ECP or unbound subject fails closed UNKNOWN before any Host signature',async()=>{
  const verifier=await createAdmissionChainVerifier({trust});
  try{
    const args={installerReceipt:installerGrant,subject:SUBJECT,nowEpochMs:liveReceipt.executedAtMs};
    const noEcp=await verifier.dryAdmit({...args,ecpClaim:null});
    assert.equal(noEcp.status,'UNKNOWN');
    assert.equal(noEcp.reason,'FAIL_CLOSED_MISSING_SAP_ECP');
    const foreignEcp=await verifier.dryAdmit({...args,
      ecpClaim:{...trust.ecp,purpose:'EFFECT_AUTHORIZATION_FORGERY'}});
    assert.equal(foreignEcp.status,'UNKNOWN');
    assert.equal(foreignEcp.reason,'FAIL_CLOSED_MISSING_SAP_ECP');
    const foreignSubject=await verifier.dryAdmit({...args,ecpClaim:trust.ecp,
      subject:'se:NOT-BOUND'});
    assert.equal(foreignSubject.status,'UNKNOWN');
    assert.equal(foreignSubject.reason,'FAIL_CLOSED_SUBJECT_NOT_BOUND');
    for(const r of [noEcp,foreignEcp,foreignSubject]){
      assert.equal(r.signed,false);assert.equal(r.claimAttested,false);
    }
  }finally{verifier.stop()}
});

test('committed restart-replay evidence records durable nonce denial for the same grant',()=>{
  const replay=JSON.parse(readFileSync(
    new URL('./receipts/live-restart-replay-r209.json',import.meta.url),'utf8'));
  assert.equal(replay.mode,'replay-expected-deny');
  assert.notEqual(replay.result.status,'SAME_CALL_ADMITTED_SIGNED_RECEIPT');
  assert.equal(replay.result.reason,'ADM_NONCE_REPLAY');
  assert.equal(replay.result.signed,false);
  assert.equal(replay.replayedNonce,grantPayload.nonce);
});

test('full signed same-call on Linux: durable fence admits once, denies replay and restart (CI-scoped Host key)',async(t)=>{
  if(!LINUX){t.skip('durable nonce ledger requires Linux trusted-root walk');return}
  const ciHost=generateKeyPairSync('ed25519');
  const ciSpki=ciHost.publicKey.export({format:'der',type:'spki'}).toString('base64url');
  const parsed=JSON.parse(registryText);
  parsed.host.spkiDerBase64Url=ciSpki;
  parsed.host.fingerprintSha256=sha256(Buffer.from(ciSpki,'base64url'));
  const ciTrust=loadFullHostAdmissionTrustRegistry({
    registryText:JSON.stringify(parsed),issuerSpkiBase64Url,hostSpkiBase64Url:ciSpki});
  assert.ok(ciTrust,'CI-scoped trust must load');
  const base=mkdtempSync(join(tmpdir(),'dis-adm-r209-'));
  const ledgerDir=join(base,'ledger');
  let host;
  try{
    mkdirSync(ledgerDir,{mode:0o700});
    const ledger=createO2DurableNonceLedger({directory:ledgerDir,
      scope:ciTrust.admission.scope,expectedAotDigest:ciTrust.admission.aotDigest});
    host=await createFullHostAdmissionHost({trust:ciTrust,
      hostPrivateKey:ciHost.privateKey,nonceLedger:ledger});
    const call=nowEpochMs=>host.admitSameCall({installerReceipt:installerGrant,
      subject:SUBJECT,ecpClaim:ciTrust.ecp,nowEpochMs});
    const admitted=await call(liveReceipt.executedAtMs);
    assert.equal(admitted.status,'SAME_CALL_ADMITTED_SIGNED_RECEIPT');
    assert.equal(admitted.authority,'OWNER_ATTESTED_STRUCTURAL');
    assert.equal(admitted.claimAttested,false);
    assert.equal(admitted.observationDisposition,'OBSERVATION_UNKNOWN');
    const check=verifyHostReceiptAgainstPinnedHostKey({trust:ciTrust,
      receipt:admitted.receipt,observation:admitted.observation,
      nowEpochMs:liveReceipt.executedAtMs});
    assert.equal(check.status,'VERIFIED_PINNED_HOST_RECEIPT');
    const replay=await call(liveReceipt.executedAtMs+1);
    assert.equal(replay.status,'DENIED');
    assert.equal(replay.reason,'ADM_NONCE_REPLAY');
    assert.equal(replay.signed,false);
    const emptyBase=mkdtempSync(join(tmpdir(),'dis-adm-r209-ecp-'));
    let host2;
    try{
      const emptyDir=join(emptyBase,'ledger');
      mkdirSync(emptyDir,{mode:0o700});
      const emptyLedger=createO2DurableNonceLedger({directory:emptyDir,
        scope:ciTrust.admission.scope,expectedAotDigest:ciTrust.admission.aotDigest});
      host2=await createFullHostAdmissionHost({trust:ciTrust,
        hostPrivateKey:ciHost.privateKey,nonceLedger:emptyLedger});
      const denied=await host2.admitSameCall({installerReceipt:installerGrant,
        subject:SUBJECT,ecpClaim:null,nowEpochMs:liveReceipt.executedAtMs});
      assert.equal(denied.status,'UNKNOWN');
      assert.equal(denied.reason,'FAIL_CLOSED_MISSING_SAP_ECP');
      assert.equal(readdirSync(emptyDir).length,0,'no ledger write before ECP admission');
    }finally{if(host2)host2.stop();rmSync(emptyBase,{recursive:true,force:true})}
    const moduleUrl=pathToFileURL(fileURLToPath(
      new URL('../o2-durable-nonce-ledger.mjs',import.meta.url))).href;
    const code=`import {createO2DurableNonceLedger} from ${JSON.stringify(moduleUrl)};`+
      `const l=createO2DurableNonceLedger({directory:process.argv[1],`+
      `scope:${JSON.stringify(ciTrust.admission.scope)},`+
      `expectedAotDigest:${JSON.stringify(ciTrust.admission.aotDigest)}});`+
      `console.log(l.reserve(${JSON.stringify(grantPayload.nonce)}));`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',code,ledgerDir],
      {encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
    assert.equal(child.stdout.trim(),'false','fresh process must be replay-denied');
  }finally{if(host)host.stop();rmSync(base,{recursive:true,force:true})}
});
