/**
 * DIS O2 R181 — negative-only independently-installed Rule trust preflight.
 *
 * This does NOT verify an installer signature, Host principal, deployed bytes,
 * immutable filesystem, trusted clock, revocation service or key custody.
 * No current public DIS AOT/SDK contract supplies that independent trust root.
 * The expected pins are caller-provided comparison hints, not authority.
 * Even a matching, well-formed, cryptographically self-signed envelope DENIES.
 *
 * The earlier selected-source candidate guard is intentionally not replaced.
 */
import {types} from 'node:util';

const HEX=/^[0-9a-f]{64}$/;
const ID=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const TOKEN=/^[a-zA-Z0-9._:/-]{8,128}$/;
const SIG=/^[a-zA-Z0-9_-]{40,256}$/;
const VERSION='dis.o2.installed-rule-evidence/1';
const PINS=['tenantId','scope','deploymentId','aotDigest','sdkDigest',
  'ruleDigest','installedBytesDigest','challenge','nonce','issuerId','keyId'];
const PAYLOAD=[...PINS,'issuedAtMs','expiresAtMs','revoked'];
const ENVELOPE=['version','issuerId','keyId','algorithm','signature','payload'];

function plainOwnData(value,fields){
  try{
    if(!value||typeof value!=='object'||Array.isArray(value)||
       types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
    const keys=Reflect.ownKeys(value);
    if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))
      return null;
    const out=Object.create(null);
    for(const field of fields){
      const d=Object.getOwnPropertyDescriptor(value,field);
      if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return null;
      out[field]=d.value;
    }
    return out;
  }catch{return null}
}
function deny(reason,status='BLOCKED'){
  return Object.freeze({status,reason,authority:'NONE',qualified:false,
    installedRuleAttested:false,ruleInstalled:false,ruleActivated:false,
    tenantIdentityAttested:false,keyCustodyAttested:false,
    experienceIssued:false,effectDispatched:false,exportAllowed:false});
}
function pinsValid(p){
  return !!p && PINS.every(k=>typeof p[k]==='string') &&
    ['tenantId','scope','deploymentId','issuerId','keyId'].every(k=>ID.test(p[k])) &&
    ['aotDigest','sdkDigest','ruleDigest','installedBytesDigest'].every(k=>HEX.test(p[k])) &&
    TOKEN.test(p.challenge)&&TOKEN.test(p.nonce);
}
const DRIFT=Object.freeze({
  tenantId:'TENANT',scope:'SCOPE',deploymentId:'DEPLOYMENT',
  aotDigest:'AOT',sdkDigest:'SDK',ruleDigest:'RULE',
  installedBytesDigest:'INSTALLED_BYTES',challenge:'CHALLENGE',
  nonce:'NONCE',issuerId:'ISSUER',keyId:'KEY'
});

/**
 * Only identifies negative evidence and missing trust, never a valid install.
 * An independently deployed Host must separately prove authentic installer key
 * custody, immutable installed bytes and issuer/tenant binding before any
 * future positive contract can be considered. No positive path exists here.
 */
export function inspectO2InstalledRuleTrustGap(input={}){
  const args=plainOwnData(input,['expected','attestation','nowEpochMs']);
  if(!args)return deny('O2_INSTALLER_INPUT_UNSAFE');
  const expected=plainOwnData(args.expected,PINS);
  if(!pinsValid(expected)||!Number.isSafeInteger(args.nowEpochMs)||
     args.nowEpochMs<0)return deny('O2_INSTALLER_HOST_PINS_UNAVAILABLE');
  if(args.attestation==null)
    return deny('BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION');
  const envelope=plainOwnData(args.attestation,ENVELOPE);
  if(!envelope)return deny('O2_INSTALLER_ENVELOPE_UNSAFE');
  const payload=plainOwnData(envelope.payload,PAYLOAD);
  if(!payload)return deny('O2_INSTALLER_PAYLOAD_UNSAFE');
  if(envelope.version!==VERSION||envelope.algorithm!=='ed25519'||
     typeof envelope.issuerId!=='string'||!ID.test(envelope.issuerId)||
     typeof envelope.keyId!=='string'||!ID.test(envelope.keyId)||
     typeof envelope.signature!=='string'||!SIG.test(envelope.signature)||
     !pinsValid(payload)||
     !Number.isSafeInteger(payload.issuedAtMs)||
     !Number.isSafeInteger(payload.expiresAtMs)||
     payload.issuedAtMs<0||payload.expiresAtMs<=payload.issuedAtMs||
     typeof payload.revoked!=='boolean')
    return deny('O2_INSTALLER_ENVELOPE_SCHEMA_INVALID');
  if(envelope.issuerId!==payload.issuerId||envelope.keyId!==payload.keyId)
    return deny('O2_INSTALLER_SIGNER_PAYLOAD_DRIFT','STALE');
  for(const field of PINS){
    if(payload[field]!==expected[field])
      return deny('O2_INSTALLER_'+DRIFT[field]+'_DRIFT','STALE');
  }
  if(payload.revoked)return deny('O2_INSTALLER_REVOKED','STALE');
  if(args.nowEpochMs<payload.issuedAtMs||
     args.nowEpochMs>=payload.expiresAtMs||
     payload.expiresAtMs-payload.issuedAtMs>86400000)
    return deny('O2_INSTALLER_EXPIRED_OR_FUTURE','STALE');

  // A signature string and claimed key identity never constitute a trusted
  // issuer. Do not use the caller's publicKey/hostTrusted/bytes as a trust root.
  // Hash labels do not attest to filesystem immutability or key custody.
  return deny('BLOCKED_MISSING_INDEPENDENT_INSTALLER_HOST_TRUST_ROOT');
}
