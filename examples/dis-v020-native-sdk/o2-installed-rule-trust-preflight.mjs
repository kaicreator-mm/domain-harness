/** R180 B / formal-tools #11 G6: negative-only O2 installed Rule trust gate.
 * This module DOES NOT own an independent installer trust root or Host custody.
 * Even a mathematically valid self-issued Ed25519 signature is never authority.
 * Caller-provided expectations, issuer keys and revocation lists are UNTRUSTED.
 */
import {createPublicKey, verify as verifySignature, createHash} from 'node:crypto';
import {types} from 'node:util';

const HEX64=/^[0-9a-f]{64}$/;
const HEX40=/^[0-9a-f]{40}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const NONCE=/^[a-zA-Z0-9_-]{12,128}$/;
const ROOT=['sourceObservation','expected','receipt','nowEpochMs','observedNonces','revokedIssuerIds'];
const EXPECTED=['aotDigest','sdkDigest','ruleDigest','installedBytesDigest','tenantId','scope','deploymentId','sourceGitBlob','nonceChallenge'];
const PAYLOAD=['schema',...EXPECTED,'issuedAtMs','expiresAtMs','nonce','revocationEpoch'];
const RECEIPT=['issuerId','spkiDerBase64Url','signatureBase64Url','payload'];
const SOURCE=['authority','installedRuleAttested','sourceBoundCandidateVerified','selectedAotDigest','sourceBoundCandidateDigest','originalSourceGitBlob'];
export const O2_INSTALLER_PAYLOAD_SCHEMA='dis.v0.2.o2.installed-rule-attestation-candidate/1';
export const O2_REQUIRED_ATTESTATION_FIELDS=Object.freeze([...PAYLOAD]);

/** All own-data; reject Proxy, getters, symbols and prototype drift without invocation. */
function capture(value,keys,allowExtra=false,optional=[]){
  if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))return null;
  try {
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)return null;
    const own=Reflect.ownKeys(value);
    if(own.some(k=>typeof k!=='string'||(!allowExtra&&!keys.includes(k)&&!optional.includes(k))))return null;
    if(keys.some(k=>!own.includes(k))||(!allowExtra&&own.length<keys.length))return null;
    const out=Object.create(null);
    for(const key of own){
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return null;
      if(keys.includes(key)||optional.includes(key))out[key]=d.value;
    }
    return out;
  }catch{return null}
}
function listHas(list, needle) {
  if(list===undefined)return false;
  if(!Array.isArray(list)||types.isProxy(list))return null;
  try{
    if(Object.getPrototypeOf(list)!==Array.prototype||list.length>128)return null;
    for(let i=0;i<list.length;i++){
      const d=Object.getOwnPropertyDescriptor(list,String(i));
      if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string')return null;
      if(d.value===needle)return true;
    }
    return false;
  }catch{return null}
}
function result(reason,status='BLOCKED',extra={}) {
  return Object.freeze({
    schema:'dis.v0.2.o2.installed-rule-trust-preflight/1',
    status,reason,authority:'NONE',qualified:false,installedRuleAttested:false,
    trustedIssuer:false,tenantIdentityAttested:false,hostAttested:false,
    ruleInstalled:false,ruleActivated:false,experienceIssued:false,
    positiveReplayAllowed:false,effectDispatched:false,
    technicalSignatureVerified:false,...extra
  });
}
const deny=(reason,status='BLOCKED')=>result(reason,status);
function proper(expected,payload){
  if(EXPECTED.some(key=>typeof expected[key]!=='string')||
     [...EXPECTED].some(key=>typeof payload[key]!=='string')||
     !HEX64.test(expected.aotDigest)||!HEX64.test(expected.sdkDigest)||
     !HEX64.test(expected.ruleDigest)||!HEX64.test(expected.installedBytesDigest)||
     !HEX40.test(expected.sourceGitBlob)||!NONCE.test(expected.nonceChallenge)||
     !ID.test(expected.tenantId)||!ID.test(expected.scope)||!ID.test(expected.deploymentId))
   return false;
  return payload.schema===O2_INSTALLER_PAYLOAD_SCHEMA&&
    HEX64.test(payload.aotDigest)&&HEX64.test(payload.sdkDigest)&&
    HEX64.test(payload.ruleDigest)&&HEX64.test(payload.installedBytesDigest)&&
    HEX40.test(payload.sourceGitBlob)&&NONCE.test(payload.nonceChallenge)&&
    NONCE.test(payload.nonce)&&ID.test(payload.tenantId)&&
    ID.test(payload.scope)&&ID.test(payload.deploymentId)&&
    Number.isSafeInteger(payload.revocationEpoch)&&payload.revocationEpoch>=0&&
    Number.isSafeInteger(payload.issuedAtMs)&&payload.issuedAtMs>=0&&
    Number.isSafeInteger(payload.expiresAtMs)&&payload.expiresAtMs>payload.issuedAtMs&&
    payload.expiresAtMs-payload.issuedAtMs<=86400000;
}
/** Canonical candidate bytes. Never creates an issuer or qualified attestation. */
export function serializeO2UntrustedInstallerPayload(payload){
  const x=capture(payload,PAYLOAD);
  if(!x)throw Error('O2_INSTALLER_PAYLOAD_UNSAFE');
  return Buffer.from(JSON.stringify(Object.fromEntries(PAYLOAD.map(k=>[k,x[k]]))),'utf8');
}
/**
 * A real installed Rule requires an independently preconfigured installer/Host
 * trust root, authenticated deployment/tenant, key custody, freshness/revocation
 * and deployed byte attestation. None is present in this research demo.
 * Verifying a signature over caller-supplied data is only a negative control.
 */
export function inspectO2InstalledRuleTrustPreflight(options){
  const x=capture(options,ROOT.slice(0,4),false,ROOT.slice(4));
  if(!x)return deny('O2_INSTALLER_OPTIONS_UNSAFE');
  const expected=capture(x.expected,EXPECTED);
  const r=capture(x.receipt,RECEIPT);
  const source=capture(x.sourceObservation,SOURCE,true);
  if(!expected||!r||!source)return deny('O2_INSTALLER_CLAIM_UNSAFE');
  const p=capture(r.payload,PAYLOAD);
  if(!p)return deny('O2_INSTALLER_PAYLOAD_UNSAFE');
  if(!Number.isSafeInteger(x.nowEpochMs)||x.nowEpochMs<0||!proper(expected,p))
    return deny('O2_INSTALLER_SCHEMA_INVALID');
  if(source.authority!=='NONE'||source.installedRuleAttested!==false||
    source.sourceBoundCandidateVerified!==true||
    source.selectedAotDigest!==expected.aotDigest||
    source.sourceBoundCandidateDigest!==expected.ruleDigest||
    source.originalSourceGitBlob!==expected.sourceGitBlob)
    return deny('O2_INSTALLER_SELECTED_SOURCE_UNQUALIFIED','STALE');
  for(const field of EXPECTED)if(expected[field]!==p[field])
    return deny('O2_INSTALLER_BINDING_DRIFT_'+field.toUpperCase(),'STALE');
  if(x.nowEpochMs<p.issuedAtMs||x.nowEpochMs>=p.expiresAtMs)
    return deny('O2_INSTALLER_EXPIRED_OR_FUTURE','STALE');
  const seen=listHas(x.observedNonces,p.nonce),revoked=listHas(x.revokedIssuerIds,r.issuerId);
  if(seen===null||revoked===null)return deny('O2_INSTALLER_REVOCATION_INPUT_UNSAFE');
  if(seen)return deny('O2_INSTALLER_NONCE_REPLAY','STALE');
  if(revoked)return deny('O2_INSTALLER_ISSUER_REVOKED','STALE');
  if(typeof r.issuerId!=='string'||!ID.test(r.issuerId)||
    typeof r.spkiDerBase64Url!=='string'||r.spkiDerBase64Url.length>500||
    typeof r.signatureBase64Url!=='string'||r.signatureBase64Url.length>256||
    !/^[A-Za-z0-9_-]+$/.test(r.spkiDerBase64Url)||
    !/^[A-Za-z0-9_-]+$/.test(r.signatureBase64Url))
    return deny('O2_INSTALLER_SIGNATURE_FORMAT_INVALID');
  let valid=false;
  try{
    const key=createPublicKey({key:Buffer.from(r.spkiDerBase64Url,'base64url'),format:'der',type:'spki'});
    if(key.asymmetricKeyType!=='ed25519')return deny('O2_INSTALLER_SIGNATURE_ALGORITHM_UNSUPPORTED');
    valid=verifySignature(null,serializeO2UntrustedInstallerPayload(p),key,Buffer.from(r.signatureBase64Url,'base64url'));
  }catch{return deny('O2_INSTALLER_SIGNATURE_INVALID')}
  if(!valid)return deny('O2_INSTALLER_SIGNATURE_INVALID');
  // Deliberately hard stop: the key above CAME FROM THE UNTRUSTED RECEIPT.
  // A cryptographically valid signature is not independent issuer/Host custody.
  const candidateFingerprint=createHash('sha256').update(serializeO2UntrustedInstallerPayload(p)).digest('hex');
  return result('BLOCKED_MISSING_INDEPENDENT_INSTALLER_TRUST_ROOT','BLOCKED',{
    technicalSignatureVerified:true,candidateFingerprint,
    observedSourceBoundCandidate:true,
    missingAuthority:'DEPLOYED_INSTALLER_KMS_HOST_TENANT_AND_RULE_OWNER'
  });
}
