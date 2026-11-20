/** Owner provisioning + REAL owner same-call run (Harness #1527 Phase B, R209).
 *
 * Local operator tool — NOT part of CI. Reads the persistent owner key files
 * (issuer + Host Ed25519, kept OUTSIDE the repository) and produces every
 * committed public artifact:
 *   - admission-registry.json            (pinned public trust roots)
 *   - installed-rule-r188.json           (immutable installed-rule record)
 *   - evidence/owner-run-r209/**         (receipts, ledger, run summary)
 *
 * The run then performs the actual same-call: boot the real selected AOT/SDK
 * app, invoke dke.ev16.d02.vv.r188.observe, and admit that exact invocation
 * at the owner-attested Host process, which signs a same-call receipt into a
 * durable hash-chained ledger. Single-owner ecosystem; no third-party
 * authority is claimed. Run:
 *   node --import tsx provision-owner-trust.mjs --keys <dir> \
 *     --grant-file <owner-grant.md>
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync}
  from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {buildR188AdmissionContext,bootR188App,R188_FUNCTION,
  R188_BINDING_SUBJECT,R188_PIN} from './test-fixture.mjs';
import {issueInstallerReceipt,issuerPublicSpkiBase64Url,spkiSha256Hex}
  from './issuer-install.mjs';
import {spawnAdmissionHost,verifyAdmissionHostReceipt,
  digestObservationOutput} from './admission-consumer.mjs';
import {ADMISSION_REGISTRY_SCHEMA} from './admission-host.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const sha256file=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const ISSUER_ID='owner-issuer-r209';
const HOST_ID='owner-admission-host-r209';
const TENANT='tenant:owner-admission-r209';
const SCOPE='scope:r188-observe-admission';
const DEPLOYMENT='deployment:dis-v020-full-admission-r209';
const DAY=86_400_000;

function emit(path,data){
  writeFileSync(path,JSON.stringify(data,null,2)+'\n');
}

async function main(){
  const args=process.argv.slice(2);
  const get=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:undefined};
  const keysDir=get('keys'),grantFile=get('grant-file');
  if(!keysDir||!grantFile)
    throw Error('usage: provision-owner-trust.mjs --keys <dir> --grant-file <md>');
  const issuerKey=join(keysDir,'issuer-ed25519.pem');
  const hostKey=join(keysDir,'host-ed25519.pem');
  for(const f of [issuerKey,hostKey,grantFile])
    if(!existsSync(f))throw Error('missing owner artifact: '+f);
  const evidence=join(HERE,'evidence','owner-run-r209');
  mkdirSync(evidence,{recursive:true});
  mkdirSync(join(evidence,'ledger'),{recursive:true});

  // 1. Real selected AOT context — digests come from the genuine build.
  const context=await buildR188AdmissionContext();
  const sdkDigest=sha256file(join(HERE,'admission-consumer.mjs'));
  const ruleDigest=context.ruleDigest;
  const aotDigest=context.artifact.digest;
  const installedRule={schema:'dis.v0.2.full-host-admission.installed-rule/1',
    functionId:R188_FUNCTION,sourceId:'r188-reader',
    sourceGitBlob:R188_PIN.reader,ruleDigest,aotDigest,sdkDigest,
    issuerId:ISSUER_ID,deploymentId:DEPLOYMENT,tenantId:TENANT,scope:SCOPE,
    custodyNote:
      'Immutable installed-rule record provisioned by the project+Host owner '+
      '(Harness #1527 owner grant, single-owner ecosystem). Private keys stay '+
      'outside the repository; only digests and public keys are committed.'};
  const installedRulePath=join(HERE,'installed-rule-r188.json');
  emit(installedRulePath,installedRule);
  const installedBytesDigest=sha256file(installedRulePath);

  // 2. Operator registry: pinned PUBLIC trust roots only.
  const issuerSpki=issuerPublicSpkiBase64Url(issuerKey);
  const hostSpki=readFileSync(join(keysDir,'host-spki.b64url'),'utf8').trim();
  const grantText=readFileSync(grantFile,'utf8');
  const registry={schema:ADMISSION_REGISTRY_SCHEMA,
    registryId:'owner-admission-registry-r209',
    trustTopology:'SINGLE_OWNER_ECOSYSTEM_STRUCTURAL_INDEPENDENCE_NOT_INTERPERSONAL',
    ownerGrant:{issue:'kaicreator-mm/domain-harness#1527',commentId:7007585312,
      recordedAtIso:'2026-11-19T11:23:00Z',
      grantTextSha256:createHash('sha256').update(grantText).digest('hex')},
    revocationEpoch:1,
    issuers:{[ISSUER_ID]:{spkiDerBase64Url:issuerSpki,
      spkiSha256:spkiSha256Hex(issuerSpki),activeSinceMs:Date.now(),
      functionBindings:[R188_FUNCTION],
      custody:'OWNER_OPERATOR_CONTROLLED_FILE_OUTSIDE_REPO'}},
    hosts:{[HOST_ID]:{spkiDerBase64Url:hostSpki,
      spkiSha256:spkiSha256Hex(hostSpki),
      kind:'ENGINEERING_ADMISSION_HOST_OWNER_ATTESTED_NOT_PRODUCTION_ORACLE'}},
    deployments:{[DEPLOYMENT]:{tenantId:TENANT,scope:SCOPE,
      functionId:R188_FUNCTION,issuerId:ISSUER_ID,hostId:HOST_ID,
      bindings:{aotDigest,sdkDigest,ruleDigest,installedBytesDigest,
        sourceGitBlob:R188_PIN.reader},
      validUntilMs:Date.now()+90*DAY}}};
  const registryPath=join(HERE,'admission-registry.json');
  emit(registryPath,registry);

  // 3. Installer receipt signed by the operator-held issuer key.
  const nonceChallenge='owner-r209-challenge-'+Date.now().toString(36);
  const expected={aotDigest,sdkDigest,ruleDigest,installedBytesDigest,
    tenantId:TENANT,scope:SCOPE,deploymentId:DEPLOYMENT,
    sourceGitBlob:R188_PIN.reader,nonceChallenge};
  const installerNonce='owner-r209-installer-'+Date.now().toString(36);
  const nowMs=Date.now();
  const receipt=issueInstallerReceipt({issuerId:ISSUER_ID,privateKey:issuerKey,
    expected,nowMs,lifetimeMs:24*3600_000,nonce:installerNonce,revocationEpoch:1});
  emit(join(evidence,'installer-receipt.json'),receipt);

  // 4. REAL same-call: AOT/SDK invoke -> Host admission -> signed receipt.
  const app=await bootR188App(context);
  let observation;
  try{
    observation=await app.invoke(R188_FUNCTION,{subject:R188_BINDING_SUBJECT},
      {expectedContractVersion:'1.0.0'});
  }finally{app.stop()}
  const observedOutputDigest=digestObservationOutput(observation.value);
  emit(join(evidence,'invocation.json'),{functionId:R188_FUNCTION,
    subject:R188_BINDING_SUBJECT,aotDigest,
    observedKind:observation.kind,observedDisposition:observation.disposition,
    observedAuthority:observation.authority,observedOutputDigest,
    observedValue:observation.value,invokedAtMs:Date.now()});
  const invocationNonce='owner-r209-invoke-'+Date.now().toString(36);
  const host=await spawnAdmissionHost({servicePath:join(HERE,'admission-host-service.mjs'),
    registryPath,ledgerDir:join(evidence,'ledger'),hostId:HOST_ID,hostKeyFile:hostKey});
  let admitted;
  try{
    admitted=await host.admit({installerReceipt:receipt,expected,
      sourceObservation:{authority:observation.authority,
        installedRuleAttested:false,sourceBoundCandidateVerified:true,
        selectedAotDigest:aotDigest,sourceBoundCandidateDigest:ruleDigest,
        // Genuine AOT-side binding pin for the selected Function's rule source.
        originalSourceGitBlob:context.registry[R188_FUNCTION].gitBlob},
      invocation:{functionId:R188_FUNCTION,subject:R188_BINDING_SUBJECT,
        aotDigest,observedOutputDigest,
        functionDisposition:observation.disposition},
      invocationNonce,actor:'owner-run-r209'});
  }finally{await host.shutdown()}
  emit(join(evidence,'host-admission-result.json'),admitted);
  if(admitted.status!=='OBSERVED_SCOPED_CANDIDATE'||admitted.admitted!==true)
    throw Error('OWNER_RUN_ADMISSION_DENIED '+admitted.status+' '+admitted.reason);
  const verification=verifyAdmissionHostReceipt(admitted.receipt,{registry,
    hostId:HOST_ID,expected:{deploymentId:DEPLOYMENT,invocationNonce,
      subject:R188_BINDING_SUBJECT,observedOutputDigest}});
  if(verification.valid!==true)
    throw Error('OWNER_RUN_RECEIPT_INVALID '+verification.reason);

  // 5. Run summary — public evidence only.
  emit(join(evidence,'run-summary.json'),{
    schema:'dis.v0.2.full-host-admission.owner-run-summary/1',
    runId:'owner-run-r209',nodeVersion:process.version,
    platform:process.platform,ranAtIso:new Date().toISOString(),
    registryPath:'admission-registry.json',
    registrySha256:sha256file(registryPath),
    installedRuleSha256:installedBytesDigest,
    issuerSpkiSha256:registry.issuers[ISSUER_ID].spkiSha256,
    hostSpkiSha256:registry.hosts[HOST_ID].spkiSha256,
    aotDigest,ruleDigest,sdkDigest,installedBytesDigest,
    admissionStatus:admitted.status,admissionReason:admitted.reason,
    receiptSignatureBase64UrlLength:admitted.receipt.signatureBase64Url.length,
    receiptVerifiedByConsumer:verification.valid,
    honestyNotes:['SINGLE_OWNER_ECOSYSTEM','STRUCTURAL_NOT_INTERPERSONAL_INDEPENDENCE',
      'OBSERVATION_ONLY_NO_EFFECT_NO_CLAIM_ATTESTATION',
      'PRIVATE_KEYS_OUTSIDE_REPOSITORY']});
  console.log(JSON.stringify({ok:true,runId:'owner-run-r209',
    admissionStatus:admitted.status,aotDigest}));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(String(error.stack??error));process.exit(1)});
}
