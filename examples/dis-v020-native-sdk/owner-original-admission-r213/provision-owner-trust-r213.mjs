/** Owner provisioning + REAL owner same-call run (DIE #155 F-D, R213).
 *
 * Local operator tool — NOT part of CI. Reads the persistent R213 owner key
 * files (issuer + Host Ed25519, kept OUTSIDE the repository) and produces
 * every committed public artifact of owner-original-admission-r213:
 *   - installed-rule-owner-original-r213.json      (immutable installed-rule
 *     record whose bytes embed the versioned owner-tier attestation)
 *   - owner-original-admission-registry-r213.json  (new deployment pin in a
 *     new registry — the R209-merged Host machinery is consumed UNCHANGED)
 *   - evidence/owner-run-r213/**                   (receipts, ledger, summary)
 *
 * The run then performs the actual same-call: boot the real selected AOT/SDK
 * app, invoke dke.ev16.d02.vv.r188.observe, and admit that exact invocation
 * at the owner-attested Host process (the UNMODIFIED r209
 * admission-host-service), which signs a same-call receipt into a durable
 * hash-chained ledger. Single-owner ecosystem; no third-party authority is
 * claimed; the tier is OWNER_ATTESTED_ORIGINAL_RESEARCH_ADMISSION and never
 * a professional/publisher/formal qualification. Run:
 *   node --import tsx provision-owner-trust-r213.mjs --keys <dir> \
 *     --grant-scope <grant_scope_canonical.txt> [--extra-pins <dir>]
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {sourceGitBlob,sourceSha256}
  from '@kaicreator/domain-harness-contracts/dis-v020';
import {buildR188AdmissionContext,bootR188App}
  from '../full-host-admission-r0/test-fixture.mjs';
import {issueInstallerReceipt,issuerPublicSpkiBase64Url,spkiSha256Hex}
  from '../full-host-admission-r0/issuer-install.mjs';
import {spawnAdmissionHost,verifyAdmissionHostReceipt,
  digestObservationOutput}
  from '../full-host-admission-r0/admission-consumer.mjs';
import {ADMISSION_REGISTRY_SCHEMA}
  from '../full-host-admission-r0/admission-host.mjs';
import {verifyOwnerOriginalEvidence,buildOwnerTierAttestation,
  installedRuleRecord,R213_PIN,R213_GRANT,R213_TIER,R213_IDS}
  from './owner-original-evidence.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const R0=join(HERE,'..','full-host-admission-r0');
const sha256file=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const DAY=86_400_000;

// Owner-run-only mirror materializations whose identity the attestation
// binds (R198/R199 already verified these; the run re-checks bytes locally).
const EXTRA_PINS=Object.freeze([
  {file:'aiLedger.jsonld',gitBlob:R213_PIN.tallyAiLedger,
    description:'Tally R180 AI-only cross-family review ledger'},
  {file:'dieR151.json',gitBlob:R213_PIN.dieR151,
    description:'DIE R151 merged source record'},
  {file:'forgeR123.json',gitBlob:R213_PIN.forgeR123,
    description:'Forge R123 REQ/VV source-backed SAP prep (retained base)'},
  {file:'r199receipt.json',gitBlob:R213_PIN.r199DurableReceiptBlob,
    description:'DIE R199 durable native-closeout receipt '
      +'(commit '+R213_PIN.r199DurableReceiptCommit+')'}
]);

function emit(path,data){
  writeFileSync(path,JSON.stringify(data,null,2)+'\n');
}

async function main(){
  const args=process.argv.slice(2);
  const get=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:undefined};
  const keysDir=get('keys'),grantScopeFile=get('grant-scope'),extraDir=get('extra-pins');
  if(!keysDir||!grantScopeFile)
    throw Error('usage: provision-owner-trust-r213.mjs --keys <dir> '+
      '--grant-scope <txt> [--extra-pins <dir>]');
  const issuerKey=join(keysDir,'issuer-ed25519.pem');
  const hostKey=join(keysDir,'host-ed25519.pem');
  const hostSpkiFile=join(keysDir,'host-spki.b64url');
  for(const f of [issuerKey,hostKey,hostSpkiFile,grantScopeFile])
    if(!existsSync(f))throw Error('missing owner artifact: '+f);

  // 0. Grant scope bytes must hash to the recorded R213 grant value.
  const grantScopeBytes=readFileSync(grantScopeFile);
  const grantScopeSha256=createHash('sha256').update(grantScopeBytes).digest('hex');
  if(grantScopeSha256!==R213_GRANT.grantScopeSha256)
    throw Error('GRANT_SCOPE_SHA256_MISMATCH '+grantScopeSha256);

  const evidence=join(HERE,'evidence','owner-run-r213');
  mkdirSync(evidence,{recursive:true});
  mkdirSync(join(evidence,'ledger'),{recursive:true});

  // 1. Original evidence: committed fixtures verified byte-exact.
  const evSummary=verifyOwnerOriginalEvidence({
    graphText:readFileSync(join(R0,'..','fixtures',
      'r155-c1-v212-graph-815.jsonld'),'utf8'),
    forgeRepinText:readFileSync(join(R0,'..','fixtures',
      'r155-ev16-d02-vv-two-leg-source-repin-r143.json'),'utf8'),
    readerCode:readFileSync(join(R0,'..',
      'r155-current-vv-815-research-consumer.mjs'),'utf8')
  });

  // 2. Owner-run-only identity pins re-verified from materialized mirror
  //    bytes (outside CI; the verification itself is archived below).
  const extraEvidencePins=[];
  if(extraDir){
    for(const pin of EXTRA_PINS){
      const file=join(extraDir,pin.file);
      if(!existsSync(file))throw Error('missing extra pin file: '+pin.file);
      const raw=readFileSync(file,'utf8');
      const blob=sourceGitBlob(raw);
      if(blob!==pin.gitBlob)
        throw Error('EXTRA_PIN_BLOB_MISMATCH '+pin.file+' '+blob);
      extraEvidencePins.push({gitBlob:pin.gitBlob,
        sha256:sourceSha256(raw),description:pin.description,
        verifiedFrom:'LOCAL_MIRROR_MATERIALIZED_BYTES'});
    }
  }else{
    // Without materialized bytes the identities are still bound verbatim,
    // but marked owner-run-not-reverified so no verification is invented.
    for(const pin of EXTRA_PINS)
      extraEvidencePins.push({gitBlob:pin.gitBlob,description:pin.description,
        verifiedFrom:'IDENTITY_BOUND_ONLY_NOT_BYTE_REVERIFIED_THIS_RUN'});
  }
  const nowMs=Date.now();
  const attestation=buildOwnerTierAttestation({evidence:evSummary,
    extraEvidencePins,nowMs});

  // 3. Real selected AOT context — digests from the genuine build; the SDK
  //    is the UNMODIFIED r209 consumer, so sdkDigest equals its file hash.
  const context=await buildR188AdmissionContext();
  const sdkDigest=sha256file(join(R0,'admission-consumer.mjs'));
  const ruleDigest=context.ruleDigest;
  const aotDigest=context.artifact.digest;
  const installedRule=installedRuleRecord({attestation,ruleDigest,aotDigest,
    sdkDigest});
  const installedRulePath=join(HERE,'installed-rule-owner-original-r213.json');
  emit(installedRulePath,installedRule);
  const installedBytesDigest=sha256file(installedRulePath);

  // 4. New deployment pin in a NEW registry (r209 registry bytes untouched).
  const issuerSpki=issuerPublicSpkiBase64Url(issuerKey);
  const hostSpki=readFileSync(hostSpkiFile,'utf8').trim();
  const registry={schema:ADMISSION_REGISTRY_SCHEMA,
    registryId:R213_IDS.registryId,
    trustTopology:'SINGLE_OWNER_ECOSYSTEM_STRUCTURAL_INDEPENDENCE_NOT_INTERPERSONAL',
    ownerGrant:{issue:R213_GRANT.issue,commentId:R213_GRANT.commentId,
      recordedAtIso:R213_GRANT.recordedAtIso,
      grantScopeSha256:R213_GRANT.grantScopeSha256},
    revocationEpoch:1,
    issuers:{[R213_IDS.issuerId]:{spkiDerBase64Url:issuerSpki,
      spkiSha256:spkiSha256Hex(issuerSpki),activeSinceMs:nowMs,
      functionBindings:[R213_IDS.functionId],
      custody:'OWNER_OPERATOR_CONTROLLED_FILE_OUTSIDE_REPO'}},
    hosts:{[R213_IDS.hostId]:{spkiDerBase64Url:hostSpki,
      spkiSha256:spkiSha256Hex(hostSpki),
      kind:'ENGINEERING_ADMISSION_HOST_OWNER_ATTESTED_NOT_PRODUCTION_ORACLE'}},
    deployments:{[R213_IDS.deploymentId]:{tenantId:R213_IDS.tenantId,
      scope:R213_IDS.scope,functionId:R213_IDS.functionId,
      issuerId:R213_IDS.issuerId,hostId:R213_IDS.hostId,
      bindings:{aotDigest,sdkDigest,ruleDigest,installedBytesDigest,
        sourceGitBlob:R213_PIN.reader},
      validUntilMs:nowMs+90*DAY}}};
  const registryPath=join(HERE,'owner-original-admission-registry-r213.json');
  emit(registryPath,registry);

  // 5. Installer receipt signed by the operator-held issuer key.
  const nonceChallenge='owner-r213-challenge-'+nowMs.toString(36);
  const expected={aotDigest,sdkDigest,ruleDigest,installedBytesDigest,
    tenantId:R213_IDS.tenantId,scope:R213_IDS.scope,
    deploymentId:R213_IDS.deploymentId,sourceGitBlob:R213_PIN.reader,
    nonceChallenge};
  const installerNonce='owner-r213-installer-'+nowMs.toString(36);
  const receipt=issueInstallerReceipt({issuerId:R213_IDS.issuerId,
    privateKey:issuerKey,expected,nowMs,lifetimeMs:24*3600_000,
    nonce:installerNonce,revocationEpoch:1});
  emit(join(evidence,'installer-receipt.json'),receipt);

  // 6. REAL same-call: AOT/SDK invoke -> UNMODIFIED r209 Host admission.
  const app=await bootR188App(context);
  let observation;
  try{
    observation=await app.invoke(R213_IDS.functionId,
      {subject:R213_IDS.bindingSubject},{expectedContractVersion:'1.0.0'});
  }finally{app.stop()}
  const observedOutputDigest=digestObservationOutput(observation.value);
  emit(join(evidence,'invocation.json'),{functionId:R213_IDS.functionId,
    subject:R213_IDS.bindingSubject,aotDigest,
    observedKind:observation.kind,observedDisposition:observation.disposition,
    observedAuthority:observation.authority,observedOutputDigest,
    observedValue:observation.value,invokedAtMs:nowMs});
  const invocationNonce='owner-r213-invoke-'+nowMs.toString(36);
  const host=await spawnAdmissionHost({
    servicePath:join(R0,'admission-host-service.mjs'),
    registryPath,ledgerDir:join(evidence,'ledger'),
    hostId:R213_IDS.hostId,hostKeyFile:hostKey});
  let admitted;
  try{
    admitted=await host.admit({installerReceipt:receipt,expected,
      sourceObservation:{authority:observation.authority,
        installedRuleAttested:false,sourceBoundCandidateVerified:true,
        selectedAotDigest:aotDigest,sourceBoundCandidateDigest:ruleDigest,
        originalSourceGitBlob:context.registry[R213_IDS.functionId].gitBlob},
      invocation:{functionId:R213_IDS.functionId,
        subject:R213_IDS.bindingSubject,aotDigest,observedOutputDigest,
        functionDisposition:observation.disposition},
      invocationNonce,actor:'owner-run-r213'});
  }finally{await host.shutdown()}
  emit(join(evidence,'host-admission-result.json'),admitted);
  if(admitted.status!=='OBSERVED_SCOPED_CANDIDATE'||admitted.admitted!==true)
    throw Error('OWNER_RUN_ADMISSION_DENIED '+admitted.status+' '+admitted.reason);
  const verification=verifyAdmissionHostReceipt(admitted.receipt,{registry,
    hostId:R213_IDS.hostId,expected:{deploymentId:R213_IDS.deploymentId,
      invocationNonce,subject:R213_IDS.bindingSubject,observedOutputDigest}});
  if(verification.valid!==true)
    throw Error('OWNER_RUN_RECEIPT_INVALID '+verification.reason);

  // 7. Run summary — public evidence only.
  emit(join(evidence,'run-summary.json'),{
    outputLabel:'DIE_DKE2_R213_OWNER_TIER_PROVISIONING_RUN',
    tier:R213_TIER.name,grant:R213_GRANT,
    evidenceVerification:{committed:evSummary,extraEvidencePins},
    bindings:{aotDigest,sdkDigest,ruleDigest,installedBytesDigest,
      sourceGitBlob:R213_PIN.reader},
    admission:{status:admitted.status,reason:admitted.reason,
      hostReceiptSha256:createHash('sha256')
        .update(JSON.stringify(admitted.receipt)).digest('hex')},
    nodeVersion:process.version,ranAtIso:new Date(nowMs).toISOString(),
    keyCustody:'PRIVATE_KEYS_OUTSIDE_REPO',
    honesty:'SINGLE_OWNER_ECOSYSTEM structural independence only; '
      +'owner-tier research admission; NOT professional/publisher/formal '
      +'qualification; FORMAL_ORIGINAL_E2E stays 0/1.'});
  console.log('R213_OWNER_RUN_COMPLETE tier='+R213_TIER.name+
    ' installedBytesDigest='+installedBytesDigest+
    ' admitted='+admitted.status);
}

if(process.argv[1]&&import.meta.url===
  pathToFileURL(resolve(process.argv[1])).href){
  main().catch(err=>{console.error(err);process.exit(1)});
}
export {main as provisionOwnerOriginalR213};
