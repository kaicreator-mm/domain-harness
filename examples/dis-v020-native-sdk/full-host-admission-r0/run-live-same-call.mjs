/** R209 live provisioning + real same-call driver. NEVER run in CI.
 *  Owner keys are generated and held OUTSIDE the repository (grant row 2/4);
 *  only public SPKI + fingerprints + signed artifacts are committed. Modes:
 *   gen-keys --keys-dir D
 *   emit-registry --keys-dir D --head SHA            (writes ./trust/ public halves)
 *   issue-grant --keys-dir D --validity-days N       (writes ./trust/installer-grant-r209.json)
 *   same-call --keys-dir D --ledger-root D --out-dir D --head SHA --note S
 *   replay-expected-deny --keys-dir D --ledger-root D --head SHA
 *  The same-call mode performs the ONE admission invocation SAP/ECP -> pinned
 *  installer grant -> durable nonce fence -> real AOT/SDK observe -> Ed25519
 *  signed Host receipt, then persists durable evidence. replay-expected-deny
 *  re-attempts the SAME grant nonce in a FRESH process and must be denied.
 */
import {randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sourceSha256} from '@kaicreator/domain-harness-contracts/dis-v020';
import {serializeO2UntrustedInstallerPayload} from '../o2-installed-rule-trust-preflight.mjs';
import {createO2DurableNonceLedger} from '../o2-durable-nonce-ledger.mjs';
import {
  buildR188AdmissionAot,generateOwnerKeyPair,PIN,
  createFullHostAdmissionHost,verifyHostReceiptAgainstPinnedHostKey
} from './full-host-admission.mjs';

const arg=name=>{const i=process.argv.indexOf('--'+name);
  return i>=0?process.argv[i+1]:undefined};
// Real exit codes are part of the durable evidence: never let an async crash
// masquerade as success.
process.on('uncaughtException',error=>{console.error(error);process.exit(3)});
process.on('unhandledRejection',error=>{console.error(error);process.exit(3)});
const mode=process.argv[2];
const here=path.dirname(fileURLToPath(import.meta.url));
const trustDir=path.join(here,'trust');
const receiptsDir=path.join(here,'receipts');
const die=m=>{console.error(m);process.exit(2)};
const readB64u=f=>readFileSync(f,'utf8').trim();
const ADMISSION={functionId:'dke.ev16.d02.vv.r188.observe',
  subjectBinding:'se:SCB-CS2023-VV-R1',tenantId:'tenant:r188-current815',
  deploymentId:'dep:r209-full-host-admission',
  scope:'dis.o2.full-host-admission.r188/v1'};
const now=()=>Date.now();

if(mode==='gen-keys'){
  const dir=arg('keys-dir');if(!dir)die('keys-dir required');
  mkdirSync(dir,{recursive:true});
  const issuer=generateOwnerKeyPair(),host=generateOwnerKeyPair();
  writeFileSync(path.join(dir,'issuer.private.pkcs8.b64u'),issuer.pkcs8DerBase64Url);
  writeFileSync(path.join(dir,'issuer.public.spki.b64u'),issuer.spkiDerBase64Url);
  writeFileSync(path.join(dir,'host.private.pkcs8.b64u'),host.pkcs8DerBase64Url);
  writeFileSync(path.join(dir,'host.public.spki.b64u'),host.spkiDerBase64Url);
  console.log(JSON.stringify({mode,issuerFingerprint:issuer.fingerprintSha256,
    hostFingerprint:host.fingerprintSha256,custody:'OUTSIDE_REPO'},null,2));
  process.exit(0);
}
if(mode==='emit-registry'){
  const keysDir=arg('keys-dir'),head=arg('head');
  if(!keysDir||!head)die('keys-dir and head required');
  const built=await buildR188AdmissionAot();
  const sdkDigest=(await import('node:crypto')).createHash('sha256')
    .update(readFileSync(path.resolve(here,'../../../packages/microkernel/dis-v020.mjs'),'utf8')).digest('hex');
  const readerSha256=sourceSha256(built.texts.reader);
  const {deriveR188RuleDigest}=await import('./full-host-admission.mjs');
  const ruleDigest=deriveR188RuleDigest({aotDigest:built.artifact.digest,
    tenantId:ADMISSION.tenantId,scope:ADMISSION.scope,
    functionId:ADMISSION.functionId,readerSha256,readerGitBlob:PIN.reader});
  const issuerPublic=readB64u(path.join(keysDir,'issuer.public.spki.b64u'));
  const hostPublic=readB64u(path.join(keysDir,'host.public.spki.b64u'));
  const registry={schema:'dis.v0.2.full-host-admission.trust-registry/1',
    recordId:'DIE_DIS3_R209_OWNER_ATTESTED_TRUST_REGISTRY',
    authorityModel:'OWNER_ATTESTED_STRUCTURAL_NOT_INTERPERSONAL',
    singleOwnerEcosystem:true,
    ownerGrant:{grantRef:'kaicreator-mm/domain-harness#1527 comment 7007585312',
      grantVerbatim:'我作为项目和Host所有人授权你继续完成，必要使用可以使用其它 LLM 的子智能体完成',
      grantedAt:'2026-11-19',rows:[1,2,3,4]},
    issuer:{issuerId:'owner-issuer-r209',spkiDerBase64Url:issuerPublic,
      fingerprintSha256:(await import('node:crypto')).createHash('sha256')
        .update(Buffer.from(issuerPublic,'base64url')).digest('hex'),
      revocationEpochFloor:1,provisionedOutsideRepo:true},
    host:{spkiDerBase64Url:hostPublic,
      fingerprintSha256:(await import('node:crypto')).createHash('sha256')
        .update(Buffer.from(hostPublic,'base64url')).digest('hex'),
      custody:'owner-controlled persistent Ed25519 generated outside repo; R50 historical Host bytes untouched'},
    admission:{...ADMISSION,aotDigest:built.artifact.digest,sdkDigest,ruleDigest,
      installedBytesDigest:readerSha256,sourceGitBlob:PIN.reader,
      sdkModulePath:'packages/microkernel/dis-v020.mjs'},
    ecp:{functionId:ADMISSION.functionId,
      purpose:'TRUSTED_INSTALL_ADMISSION_SAME_CALL_POSITIVE',
      approvedFor:'research-engineering same-call closure only; no formal qualification',
      formalQualification:false,
      grantRef:'kaicreator-mm/domain-harness#1527 comment 7007585312 row1'},
    limits:{noConformancePromotion:true,
      observationRemains:'OBSERVATION_UNKNOWN_AUTHORITY_NONE',
      claimAttested:false,effectDispatched:false}};
  mkdirSync(trustDir,{recursive:true});
  writeFileSync(path.join(trustDir,'registry-r209.json'),JSON.stringify(registry,null,2)+'\n');
  writeFileSync(path.join(trustDir,'issuer-r209.spki.b64u'),issuerPublic+'\n');
  writeFileSync(path.join(trustDir,'host-r209.spki.b64u'),hostPublic+'\n');
  console.log(JSON.stringify({mode,head,aotDigest:built.artifact.digest,
    sdkDigest,ruleDigest,installedBytesDigest:readerSha256},null,2));
  process.exit(0);
}
if(mode==='issue-grant'){
  const keysDir=arg('keys-dir');
  const validityDays=Number(arg('validity-days')??180);
  if(!keysDir||!(validityDays>=1&&validityDays<=365))die('keys-dir and 1..365 validity-days required');
  const registry=JSON.parse(readFileSync(path.join(trustDir,'registry-r209.json'),'utf8'));
  const issuerPublic=readB64u(path.join(keysDir,'issuer.public.spki.b64u'));
  if(issuerPublic!==registry.issuer.spkiDerBase64Url)die('issuer key mismatch vs registry');
  const issuedAtMs=now(),expiresAtMs=issuedAtMs+validityDays*86400000;
  const payload={schema:'dis.v0.2.o2.installed-rule-attestation-candidate/1',
    aotDigest:registry.admission.aotDigest,sdkDigest:registry.admission.sdkDigest,
    ruleDigest:registry.admission.ruleDigest,
    installedBytesDigest:registry.admission.installedBytesDigest,
    tenantId:registry.admission.tenantId,scope:registry.admission.scope,
    deploymentId:registry.admission.deploymentId,
    sourceGitBlob:registry.admission.sourceGitBlob,
    nonceChallenge:randomBytes(24).toString('base64url'),
    issuedAtMs,expiresAtMs,
    nonce:'g'+randomBytes(32).toString('base64url'),revocationEpoch:1};
  const {sign}=await import('node:crypto');
  const signatureBase64Url=sign(null,serializeO2UntrustedInstallerPayload(payload),
    (await import('node:crypto')).createPrivateKey({key:Buffer.from(
      readB64u(path.join(keysDir,'issuer.private.pkcs8.b64u')),'base64url'),
      format:'der',type:'pkcs8'})).toString('base64url');
  const receipt={issuerId:registry.issuer.issuerId,spkiDerBase64Url:issuerPublic,
    signatureBase64Url,payload};
  writeFileSync(path.join(trustDir,'installer-grant-r209.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({mode,issuedAtMs,expiresAtMs,nonce:payload.nonce},null,2));
  process.exit(0);
}
if(mode==='same-call'||mode==='replay-expected-deny'){
  const keysDir=arg('keys-dir'),ledgerRoot=arg('ledger-root'),
    outDir=arg('out-dir')??receiptsDir,head=arg('head')??'unknown',
    note=arg('note')??'';
  if(!keysDir||!ledgerRoot)die('keys-dir and ledger-root required');
  if(process.platform!=='linux')die('durable nonce ledger requires Linux (trusted root walk)');
  const {readCommittedAdmissionTrust}=await import('./full-host-admission.mjs');
  const {trust,installerGrant}=await readCommittedAdmissionTrust({withLiveReceipt:false});
  mkdirSync(ledgerRoot,{recursive:true});chmodSync(ledgerRoot,0o700);
  const ledgerDir=path.join(ledgerRoot,'ledger');mkdirSync(ledgerDir,{recursive:true});chmodSync(ledgerDir,0o700);
  const ledger=createO2DurableNonceLedger({directory:ledgerDir,
    scope:trust.admission.scope,expectedAotDigest:trust.admission.aotDigest});
  const {createPrivateKey}=await import('node:crypto');
  const host=await createFullHostAdmissionHost({trust,
    hostPrivateKey:createPrivateKey({key:Buffer.from(
      readB64u(path.join(keysDir,'host.private.pkcs8.b64u')),'base64url'),
      format:'der',type:'pkcs8'}),nonceLedger:ledger});
  const executedAtMs=now();
  const result=await host.admitSameCall({installerReceipt:installerGrant,
    subject:trust.admission.subjectBinding,ecpClaim:trust.ecp,nowEpochMs:executedAtMs});
  if(mode==='same-call'){
    if(result.status!=='SAME_CALL_ADMITTED_SIGNED_RECEIPT')
      die('same-call not admitted: '+JSON.stringify(result));
    const check=verifyHostReceiptAgainstPinnedHostKey({trust,receipt:result.receipt,
      observation:result.observation,nowEpochMs:executedAtMs});
    if(check.status!=='VERIFIED_PINNED_HOST_RECEIPT')die('receipt verify failed: '+JSON.stringify(check));
    const evidence={schema:'dis.v0.2.full-host-admission.live-evidence/1',mode,
      head,note,nodeVersion:process.version,platform:process.platform,
      executedAtMs,executedAtIso:new Date(executedAtMs).toISOString(),
      ledgerScope:ledger.scope,ledgerDirectory:ledgerDir,
      aotDigest:host.artifactDigest,result:{status:result.status,
        authority:result.authority,grantFingerprint:result.grantFingerprint,
        issuerFingerprint:result.issuerFingerprint,hostFingerprint:result.hostFingerprint,
        nonce:result.nonce,claimAttested:false,effectDispatched:false,
        singleOwnerEcosystem:true},
      receipt:result.receipt};
    mkdirSync(outDir,{recursive:true});
    const out=path.join(outDir,'live-same-call-r209.json');
    writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({mode,status:result.status,nonce:result.nonce,
      observationDisposition:result.observationDisposition,receiptFile:out},null,2));
    process.exit(0);
  }
  const denied=result.status!=='SAME_CALL_ADMITTED_SIGNED_RECEIPT';
  const evidence={schema:'dis.v0.2.full-host-admission.live-evidence/1',mode,
    head,nodeVersion:process.version,platform:process.platform,
    executedAtMs,replayedNonce:installerGrant.payload.nonce,
    result:{status:result.status,reason:result.reason,signed:!!result.signed}};
  mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,'live-restart-replay-r209.json');
  writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({mode,expected:'DENIED',actual:result.status,reason:result.reason},null,2));
  process.exit(denied&&result.reason==='ADM_NONCE_REPLAY'?0:1);
}
die('unknown mode: '+mode);
