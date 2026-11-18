/** DIS O2 R181: negative-only trust-root falsifiers, no positive authority. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,verify} from 'node:crypto';
import {inspectO2InstalledRuleTrustGap as inspect} from './o2-installed-rule-trust-preflight.mjs';

const CLOCK=1795000000000;
const EXPECTED=Object.freeze({
  tenantId:'tenant:r181',scope:'tenant:r181',deploymentId:'deploy:r181',
  aotDigest:'a'.repeat(64),sdkDigest:'b'.repeat(64),
  ruleDigest:'c'.repeat(64),installedBytesDigest:'d'.repeat(64),
  challenge:'challenge:r181',nonce:'nonce:r181',
  issuerId:'issuer:self-signed',keyId:'key:self-signed'
});
const keys=generateKeyPairSync('ed25519');
function make(payloadOverrides={},envelopeOverrides={}){
  const payload={...EXPECTED,issuedAtMs:CLOCK-1000,
    expiresAtMs:CLOCK+1000,revoked:false,...payloadOverrides};
  const message=Buffer.from(JSON.stringify(payload));
  const signature=sign(null,message,keys.privateKey).toString('base64url');
  return {version:'dis.o2.installed-rule-evidence/1',
    issuerId:payload.issuerId,keyId:payload.keyId,
    algorithm:'ed25519',signature,payload,...envelopeOverrides};
}
const call=(attestation,expected=EXPECTED,nowEpochMs=CLOCK)=>
  inspect({expected,attestation,nowEpochMs});
function noAuthority(r){
  for(const flag of ['qualified','installedRuleAttested','ruleInstalled',
    'ruleActivated','tenantIdentityAttested','keyCustodyAttested',
    'experienceIssued','effectDispatched','exportAllowed'])
    assert.equal(r[flag],false,flag);
  assert.equal(r.authority,'NONE');
  assert.ok(['BLOCKED','STALE'].includes(r.status));
  assert.ok(Object.isFrozen(r));
}

test('missing genuine installer/Host attestation is BLOCKED',()=>{
  const r=call(null);
  assert.equal(r.reason,'BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION');
  noAuthority(r);
});

test('a real Ed25519 signature using a self-generated key still cannot bootstrap trust',()=>{
  const a=make();
  assert.equal(verify(null,Buffer.from(JSON.stringify(a.payload)),
    keys.publicKey,Buffer.from(a.signature,'base64url')),true);
  const r=call(a);
  assert.equal(r.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_HOST_TRUST_ROOT');
  noAuthority(r);
  const forged={...a,signature:'X'.repeat(86)};
  const fake=call(forged);
  assert.equal(fake.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_HOST_TRUST_ROOT');
  noAuthority(fake); // cannot distinguish signatures without a trusted verifier
});

test('tenant, scope, deployed AOT/SDK, Rule and immutable-byte identity drift deny',()=>{
  const cases=[
    ['tenantId','tenant:other','TENANT'],
    ['scope','tenant:other','SCOPE'],
    ['deploymentId','deploy:other','DEPLOYMENT'],
    ['aotDigest','e'.repeat(64),'AOT'],
    ['sdkDigest','e'.repeat(64),'SDK'],
    ['ruleDigest','e'.repeat(64),'RULE'],
    ['installedBytesDigest','e'.repeat(64),'INSTALLED_BYTES'],
    ['challenge','challenge:other','CHALLENGE'],
    ['nonce','nonce:other','NONCE'],
    ['issuerId','issuer:other','ISSUER'],
    ['keyId','key:other','KEY']
  ];
  for(const [field,value,label] of cases){
    const r=call(make({[field]:value}));
    assert.equal(r.reason,'O2_INSTALLER_'+label+'_DRIFT',field);
    assert.equal(r.status,'STALE');noAuthority(r);
  }
});

test('revoked, expired, future and overlong attestation never become installed Rule',()=>{
  for(const [p,now,reason] of [
    [{revoked:true},CLOCK,'O2_INSTALLER_REVOKED'],
    [{expiresAtMs:CLOCK},CLOCK,'O2_INSTALLER_EXPIRED_OR_FUTURE'],
    [{issuedAtMs:CLOCK+10,expiresAtMs:CLOCK+100},CLOCK,'O2_INSTALLER_EXPIRED_OR_FUTURE'],
    [{expiresAtMs:CLOCK+86400002},CLOCK,'O2_INSTALLER_EXPIRED_OR_FUTURE']
  ]){
    const r=call(make(p),EXPECTED,now);
    assert.equal(r.reason,reason);noAuthority(r);
  }
});

test('no getter or Proxy trap is allowed on options, envelope, nested payload or Host pins',()=>{
  let traps=0;
  const trap=()=>{traps++;throw Error('should not execute')};
  const proxy=new Proxy(make(),{get:trap,getPrototypeOf:trap,ownKeys:trap});
  const a=call(proxy);
  assert.equal(a.reason,'O2_INSTALLER_ENVELOPE_UNSAFE');noAuthority(a);
  const b=make();
  Object.defineProperty(b.payload,'tenantId',{enumerable:true,get:trap});
  const rb=call(b);
  assert.equal(rb.reason,'O2_INSTALLER_PAYLOAD_UNSAFE');noAuthority(rb);
  const ep=new Proxy({...EXPECTED},{get:trap,getPrototypeOf:trap,ownKeys:trap});
  const rc=call(make(),ep);
  assert.equal(rc.reason,'O2_INSTALLER_HOST_PINS_UNAVAILABLE');noAuthority(rc);
  const root=new Proxy({expected:EXPECTED,attestation:make(),nowEpochMs:CLOCK},
    {get:trap,getPrototypeOf:trap,ownKeys:trap});
  const rd=inspect(root);
  assert.equal(rd.reason,'O2_INSTALLER_INPUT_UNSAFE');noAuthority(rd);
  assert.equal(traps,0);
});

test('malformed, spoofed, undeclared Host-authority flags and signer mismatch deny',()=>{
  for(const invalid of [
    {...make(),algorithm:'none'},
    {...make(),signature:'invalid'},
    {...make(),hostTrusted:true},
    {...make(),issuerId:'issuer:other'},
    {...make(),payload:{...make().payload,revoked:'false'}},
    {...make(),payload:{...make().payload,installingHost:true}}
  ]){
    const r=call(invalid);noAuthority(r);
    assert.notEqual(r.reason,'BLOCKED_MISSING_INDEPENDENT_INSTALLER_HOST_TRUST_ROOT');
  }
});
