/** DIS #3 / Harness #1527 Phase B (R209): owner-attested full admission Host.
 *
 * Minimal adaptation seam for the selected Function dke.ev16.d02.vv.r188.observe.
 * The R50 controlled Python Host (DIE PR #20, historical bytes untouched) is NOT
 * modified and NOT invoked; this module implements the same signed-receipt
 * discipline (Ed25519 over a fixed-order payload, OBSERVED_SCOPED_CANDIDATE /
 * DENIED / REPLAY / STALE dispositions) parameterized for the R188 contract.
 *
 * Trust topology honesty: SINGLE-OWNER ECOSYSTEM. The issuer registry and Host
 * identity are pinned in an operator-owned committed registry; independence is
 * STRUCTURAL (caller/SDK never holds issuer or Host private keys; the pinned
 * SPKI comes from operator configuration, never from the receipt). This is not
 * an inter-personal third-party authority and never claims to be one.
 *
 * Fail-closed everywhere: any structural anomaly, unpinned key, epoch drift,
 * ledger rollback, replayed nonce or binding mismatch denies admission.
 */
import {createHash,createPublicKey,sign as signWith,verify as verifySignature}
  from 'node:crypto';
import {openSync,writeSync,fsyncSync,closeSync,readFileSync,existsSync,
  mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {inspectO2InstalledRuleTrustPreflight,serializeO2UntrustedInstallerPayload,
  O2_REQUIRED_ATTESTATION_FIELDS}
  from '../o2-installed-rule-trust-preflight.mjs';

const EXPECTED_BINDING_FIELDS=Object.freeze(O2_REQUIRED_ATTESTATION_FIELDS
  .filter(k=>!['schema','issuedAtMs','expiresAtMs','nonce','revocationEpoch'].includes(k)));

export const ADMISSION_HOST_SCHEMA='dis.v0.2.full-host-admission.host/1';
export const ADMISSION_HOST_RECEIPT_SCHEMA='dis.v0.2.full-host-admission.host-receipt/1';
export const ADMISSION_REGISTRY_SCHEMA='dis.v0.2.full-host-admission.registry/1';
/** Fixed canonical order for the signed Host receipt payload. */
export const HOST_RECEIPT_PAYLOAD=Object.freeze([
  'schema','hostId','status','functionId','subject','tenantId','scope','deploymentId',
  'issuerId','ruleDigest','installedBytesDigest','aotDigest','sdkDigest','sourceGitBlob',
  'installerNonce','invocationNonce','revocationEpoch','observedAtMs','observedOutputDigest',
  'functionDisposition','claimAttested','externalBusinessEffect','authority'
]);
const HEX64=/^[0-9a-f]{64}$/;
const HEX40=/^[0-9a-f]{40}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const NONCE=/^[a-zA-Z0-9_-]{12,128}$/;
const SHA256=h=>createHash('sha256').update(h).digest('hex');

/** Same own-data discipline as the O2 preflight: reject Proxy/getters/symbol drift. */
function capture(value,keys,allowExtra=false){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  try{
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)return null;
    if(Reflect.ownKeys(value).some(k=>typeof k!=='string'))return null;
    const out=Object.create(null);
    for(const key of keys){
      if(!Object.hasOwn(value,key))return null;
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return null;
      out[key]=d.value;
    }
    if(!allowExtra&&Reflect.ownKeys(value).length!==keys.length)return null;
    return out;
  }catch{return null}
}
function flags(extra={}){
  return {authority:'NONE',admitted:false,trustedIssuer:false,installedRuleAttested:false,
    hostAttested:false,tenantIdentityAttested:false,ruleInstalled:false,ruleActivated:false,
    experienceIssued:false,positiveReplayAllowed:false,effectDispatched:false,
    claimAttested:false,hostLedgerAppended:false,...extra};
}
function deny(reason,status='DENIED'){
  return Object.freeze({schema:ADMISSION_HOST_SCHEMA,status,reason,...flags()});
}
export function serializeAdmissionHostReceiptPayload(payload){
  const x=capture(payload,HOST_RECEIPT_PAYLOAD);
  if(!x)throw Error('ADMISSION_HOST_RECEIPT_PAYLOAD_UNSAFE');
  return Buffer.from(JSON.stringify(
    Object.fromEntries(HOST_RECEIPT_PAYLOAD.map(k=>[k,x[k]]))),'utf8');
}
function stableStringify(value){
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort()
      .map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
  }
  return JSON.stringify(value);
}
export const digestObservationOutput=output=>
  SHA256(stableStringify(output));

/** Boot-time registry validation. Only PUBLIC material may live here. */
export function loadAdmissionRegistry(registry){
  const r=capture(registry,['schema','registryId','trustTopology','ownerGrant',
    'revocationEpoch','issuers','hosts','deployments']);
  if(!r||r.schema!==ADMISSION_REGISTRY_SCHEMA||
    typeof r.registryId!=='string'||!ID.test(r.registryId)||
    r.trustTopology!=='SINGLE_OWNER_ECOSYSTEM_STRUCTURAL_INDEPENDENCE_NOT_INTERPERSONAL'||
    !Number.isSafeInteger(r.revocationEpoch)||r.revocationEpoch<1||
    !r.ownerGrant||typeof r.ownerGrant!=='object'||
    typeof r.ownerGrant.issue!=='string'||typeof r.ownerGrant.commentId!=='number'||
    typeof r.ownerGrant.recordedAtIso!=='string'||
    !r.issuers||typeof r.issuers!=='object'||!r.hosts||typeof r.hosts!=='object'||
    !r.deployments||typeof r.deployments!=='object')
    throw Error('ADMISSION_REGISTRY_INVALID');
  return Object.freeze(JSON.parse(JSON.stringify(r)));
}

/**
 * Durable admission ledger: append-only JSONL with a SHA-256 hash chain and an
 * atomically replaced anchor file. Truncation, edit or rollback of any line
 * breaks the chain or the anchor comparison and pins the Host fail-closed.
 */
export function openAdmissionLedger(ledgerDir,genesisTag){
  const file=join(ledgerDir,'admission-ledger.jsonl');
  const anchor=join(ledgerDir,'admission-ledger.anchor');
  mkdirSync(ledgerDir,{recursive:true});
  const genesisHash=SHA256('genesis:'+genesisTag);
  let lastSeq=0,lastHash=genesisHash,rolledBack=false,nonces=new Set();
  const parseLine=(line,seq)=>{
    let e;
    try{e=JSON.parse(line)}catch{return null}
    const x=e&&typeof e==='object'?capture(e,
      ['seq','prevHash','entryHash','nonce','issuerId','functionId','tenantId',
       'deploymentId','consumedAtMs','hostReceiptSha256']):null;
    if(!x||x.seq!==seq||typeof x.prevHash!=='string'||typeof x.entryHash!=='string'||
      !NONCE.test(x.nonce)||typeof x.issuerId!=='string')return null;
    const {entryHash,...rest}=x;
    if(SHA256(stableStringify(rest))!==entryHash||x.prevHash!==lastHash)return null;
    return x;
  };
  if(existsSync(file)){
    const lines=readFileSync(file,'utf8').split('\n').filter(l=>l.length>0);
    for(let i=0;i<lines.length;i++){
      const e=parseLine(lines[i],i+1);
      if(!e){rolledBack=true;break}
      lastSeq=e.seq;lastHash=e.entryHash;nonces.add(e.nonce+':'+e.issuerId);
    }
  }
  let anchorState=null;
  if(existsSync(anchor)){
    try{
      const a=capture(JSON.parse(readFileSync(anchor,'utf8')),
        ['seq','entryHash','updatedAtMs']);
      anchorState=a&&(a.seq===lastSeq&&a.entryHash===lastHash)?a:null;
      if(!anchorState)rolledBack=true;
    }catch{rolledBack=true}
  }else if(lastSeq>0){rolledBack=true}
  const writeAnchor=()=>{
    const tmp=anchor+'.tmp';
    writeFileSync(tmp,JSON.stringify({seq:lastSeq,entryHash:lastHash,
      updatedAtMs:Date.now()})+'\n');
    renameSync(tmp,anchor);
  };
  if(!rolledBack)writeAnchor();
  return Object.freeze({
    rolledBack:()=>rolledBack,
    hasNonce:(nonce,issuerId)=>nonces.has(nonce+':'+issuerId),
    append(entry){
      if(rolledBack)return false;
      const record={seq:lastSeq+1,prevHash:lastHash,
        nonce:entry.nonce,issuerId:entry.issuerId,functionId:entry.functionId,
        tenantId:entry.tenantId,deploymentId:entry.deploymentId,
        consumedAtMs:entry.consumedAtMs,hostReceiptSha256:entry.hostReceiptSha256};
      record.entryHash=SHA256(stableStringify(record));
      const fd=openSync(file,'a');
      try{
        writeSync(fd,JSON.stringify(record)+'\n');
        fsyncSync(fd);
      }finally{closeSync(fd)}
      lastSeq=record.seq;lastHash=record.entryHash;
      nonces.add(record.nonce+':'+record.issuerId);
      writeAnchor();
      return true;
    }
  });
}

/**
 * Create the admission Host. `hostPrivateKey` is an Ed25519 KeyObject whose
 * public half must equal the registry-pinned Host identity — the caller-facing
 * admission path never sees this key; it lives in the Host process only.
 */
export function createAdmissionHost({registry,hostId,hostPrivateKey,ledgerDir,nowMs}){
  const reg=loadAdmissionRegistry(registry);
  const host=reg.hosts[hostId];
  if(!host||typeof host.spkiDerBase64Url!=='string'||
    !/^[A-Za-z0-9_-]+$/.test(host.spkiDerBase64Url))
    throw Error('ADMISSION_HOST_NOT_PINNED');
  const actualSpki=createPublicKey(hostPrivateKey)
    .export({format:'der',type:'spki'}).toString('base64url');
  if(actualSpki!==host.spkiDerBase64Url)throw Error('ADMISSION_HOST_IDENTITY_MISMATCH');
  const ledger=openAdmissionLedger(ledgerDir,reg.registryId+':'+hostId);
  const now=()=>Number.isSafeInteger(nowMs)?nowMs:Date.now();
  return Object.freeze({
    hostId,registryId:reg.registryId,
    rolledBack:()=>ledger.rolledBack(),
    admit(request){
      const x=capture(request,['installerReceipt','expected','sourceObservation',
        'invocation','invocationNonce','actor'],true);
      if(!x)return deny('ADMISSION_REQUEST_UNSAFE');
      const inv=capture(x.invocation,['functionId','subject','aotDigest',
        'observedOutputDigest','functionDisposition']);
      if(!inv||typeof inv.functionId!=='string'||!ID.test(inv.functionId)||
        typeof inv.subject!=='string'||inv.subject.length<1||inv.subject.length>256||
        !HEX64.test(inv.aotDigest)||!HEX64.test(inv.observedOutputDigest)||
        typeof inv.functionDisposition!=='string')
        return deny('ADMISSION_INVOCATION_UNSAFE');
      if(typeof x.invocationNonce!=='string'||!NONCE.test(x.invocationNonce))
        return deny('ADMISSION_NONCE_FORMAT_INVALID');
      const expected=capture(x.expected,EXPECTED_BINDING_FIELDS);
      if(!expected)return deny('ADMISSION_EXPECTED_UNSAFE');
      const r=capture(x.installerReceipt,['issuerId','spkiDerBase64Url',
        'signatureBase64Url','payload']);
      if(!r)return deny('ADMISSION_INSTALLER_RECEIPT_UNSAFE');
      const payloadRaw=capture(r.payload,O2_REQUIRED_ATTESTATION_FIELDS);
      if(!payloadRaw)return deny('ADMISSION_INSTALLER_PAYLOAD_UNSAFE');
      if(ledger.rolledBack())
        return deny('ADMISSION_LEDGER_ROLLBACK');
      const deployment=reg.deployments[expected.deploymentId];
      if(!deployment)return deny('ADMISSION_DEPLOYMENT_NOT_PINNED');
      const issuer=reg.issuers[r.issuerId];
      if(!issuer)return deny('ADMISSION_ISSUER_NOT_PINNED');
      if(r.spkiDerBase64Url!==issuer.spkiDerBase64Url)
        return deny('ADMISSION_ISSUER_KEY_MISMATCH');
      if(Number.isSafeInteger(issuer.revokedAtMs)&&now()>=issuer.revokedAtMs)
        return deny('ADMISSION_ISSUER_REVOKED');
      if(ledger.hasNonce(payloadRaw.nonce,r.issuerId))
        return Object.freeze({schema:ADMISSION_HOST_SCHEMA,status:'REPLAY',
          reason:'ADMISSION_NONCE_REPLAY',...flags()});
      // Reuse the hardened negative-only O2 gate for every structural,
      // binding, freshness and receipt-signature check. Its terminal denial
      // BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT is EXPECTED here: the
      // pinned operator root that gate deliberately lacks is verified below.
      const pre=inspectO2InstalledRuleTrustPreflight({
        sourceObservation:x.sourceObservation,expected:x.expected,
        receipt:x.installerReceipt,nowEpochMs:now()});
      if(pre.reason!=='BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT'||
        pre.technicalSignatureVerified!==true)
        return Object.freeze({schema:ADMISSION_HOST_SCHEMA,
          status:pre.status==='STALE'?'STALE':'DENIED',
          reason:'ADMISSION_INSTALLER_'+pre.reason,...flags(),
          preflightReason:pre.reason});
      let pinnedValid=false;
      try{
        const pinnedKey=createPublicKey({key:Buffer.from(issuer.spkiDerBase64Url,'base64url'),
          format:'der',type:'spki'});
        if(pinnedKey.asymmetricKeyType!=='ed25519')
          return deny('ADMISSION_ISSUER_ALGORITHM_UNSUPPORTED');
        pinnedValid=verifySignature(null,
          serializeO2UntrustedInstallerPayload(r.payload),pinnedKey,
          Buffer.from(r.signatureBase64Url,'base64url'));
      }catch{return deny('ADMISSION_SIGNATURE_INVALID')}
      if(!pinnedValid)return deny('ADMISSION_SIGNATURE_INVALID');
      const p=payloadRaw;
      if(p.revocationEpoch!==reg.revocationEpoch)
        return Object.freeze({schema:ADMISSION_HOST_SCHEMA,status:'STALE',
          reason:'ADMISSION_EPOCH_DRIFT',...flags()});
      const b=deployment.bindings;
      const bindingChecks=[['aotDigest',b.aotDigest],['sdkDigest',b.sdkDigest],
        ['ruleDigest',b.ruleDigest],['installedBytesDigest',b.installedBytesDigest],
        ['sourceGitBlob',b.sourceGitBlob],['tenantId',deployment.tenantId],
        ['scope',deployment.scope]];
      for(const [field,pinned] of bindingChecks)
        if(x.expected[field]!==pinned)
          return deny('ADMISSION_BINDING_MISMATCH_'+field.toUpperCase());
      if(!HEX64.test(b.aotDigest)||!HEX64.test(b.sdkDigest)||!HEX64.test(b.ruleDigest)||
        !HEX64.test(b.installedBytesDigest)||!HEX40.test(b.sourceGitBlob))
        return deny('ADMISSION_REGISTRY_BINDING_INVALID');
      if(deployment.issuerId!==r.issuerId||deployment.hostId!==hostId)
        return deny('ADMISSION_DEPLOYMENT_PARTY_MISMATCH');
      if(inv.functionId!==deployment.functionId)
        return deny('ADMISSION_FUNCTION_NOT_BOUND');
      if(!Array.isArray(issuer.functionBindings)||!issuer.functionBindings.includes(inv.functionId))
        return deny('ADMISSION_ISSUER_FUNCTION_NOT_AUTHORIZED');
      if(Number.isSafeInteger(deployment.validUntilMs)&&now()>=deployment.validUntilMs)
        return Object.freeze({schema:ADMISSION_HOST_SCHEMA,status:'STALE',
          reason:'ADMISSION_DEPLOYMENT_EXPIRED',...flags()});
      const t=now();
      if(t<p.issuedAtMs||t>=p.expiresAtMs)
        return Object.freeze({schema:ADMISSION_HOST_SCHEMA,status:'STALE',
          reason:'ADMISSION_EXPIRED_OR_FUTURE',...flags()});
      const payload={schema:ADMISSION_HOST_RECEIPT_SCHEMA,hostId,
        status:'OBSERVED_SCOPED_CANDIDATE',functionId:inv.functionId,
        subject:inv.subject,tenantId:deployment.tenantId,scope:deployment.scope,
        deploymentId:x.expected.deploymentId,issuerId:r.issuerId,
        ruleDigest:b.ruleDigest,installedBytesDigest:b.installedBytesDigest,
        aotDigest:b.aotDigest,sdkDigest:b.sdkDigest,sourceGitBlob:b.sourceGitBlob,
        installerNonce:p.nonce,invocationNonce:x.invocationNonce,
        revocationEpoch:reg.revocationEpoch,observedAtMs:t,
        observedOutputDigest:inv.observedOutputDigest,
        functionDisposition:inv.functionDisposition,
        claimAttested:false,externalBusinessEffect:false,
        authority:'OWNER_ATTESTED_HOST_ADMISSION_SINGLE_OWNER_ECOSYSTEM'};
      const receipt={...payload,
        signatureBase64Url:signWith(null,
          serializeAdmissionHostReceiptPayload(payload),hostPrivateKey)
          .toString('base64url')};
      const appended=ledger.append({nonce:p.nonce,issuerId:r.issuerId,
        functionId:inv.functionId,tenantId:deployment.tenantId,
        deploymentId:x.expected.deploymentId,consumedAtMs:t,
        hostReceiptSha256:SHA256(serializeAdmissionHostReceiptPayload(payload))});
      if(!appended)return deny('ADMISSION_LEDGER_ROLLBACK');
      return Object.freeze({schema:ADMISSION_HOST_SCHEMA,
        status:'OBSERVED_SCOPED_CANDIDATE',reason:'ADMITTED_OBSERVATION_ONLY',
        authority:'OWNER_ATTESTED_HOST_ADMISSION_SINGLE_OWNER_ECOSYSTEM',
        admitted:true,trustedIssuer:true,installedRuleAttested:true,
        hostAttested:true,tenantIdentityAttested:true,ruleInstalled:true,
        ruleActivated:true,experienceIssued:false,positiveReplayAllowed:false,
        effectDispatched:false,claimAttested:false,hostLedgerAppended:true,
        preflightReason:pre.reason,receipt});
    }
  });
}
