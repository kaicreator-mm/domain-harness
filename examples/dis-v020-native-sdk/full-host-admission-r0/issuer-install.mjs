/** Installer-operator side tool for full-host-admission-r0 (Harness #1527 Phase B).
 *
 * Signs the O2 installed-rule attestation candidate payload with the operator
 * held issuer Ed25519 key. The private key NEVER enters the repository, the
 * SDK or the caller: provisioning reads it from an operator-controlled file.
 * Receipts are public data (signature + payload); only the key is secret.
 *
 * CLI: node issuer-install.mjs --key <issuer.pem> --expected <expected.json>
 *        --out <receipt.json> --issuer-id <id> --nonce <nonce> [--epoch N]
 */
import {createHash,createPrivateKey,createPublicKey,sign as signWith}
  from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {serializeO2UntrustedInstallerPayload,O2_INSTALLER_PAYLOAD_SCHEMA}
  from '../o2-installed-rule-trust-preflight.mjs';

export const ISSUER_EXPECTED_BINDING_FIELDS=Object.freeze(['aotDigest','sdkDigest',
  'ruleDigest','installedBytesDigest','tenantId','scope','deploymentId',
  'sourceGitBlob','nonceChallenge']);

/** Issue an installer receipt over the canonical O2 payload field order. */
export function issueInstallerReceipt({issuerId,privateKey,expected,nowMs,
  lifetimeMs=3600_000,nonce,revocationEpoch=1}){
  if(typeof issuerId!=='string'||!/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/.test(issuerId)||
    !expected||typeof expected!=='object')
    throw Error('ISSUER_INSTALL_INPUT_INVALID');
  for(const field of ISSUER_EXPECTED_BINDING_FIELDS)
    if(typeof expected[field]!=='string')
      throw Error('ISSUER_INSTALL_EXPECTED_INVALID_'+field.toUpperCase());
  if(!Number.isSafeInteger(nowMs)||nowMs<=0||
    !Number.isSafeInteger(revocationEpoch)||revocationEpoch<0||
    !Number.isSafeInteger(lifetimeMs)||lifetimeMs<=0||lifetimeMs>86_400_000||
    typeof nonce!=='string'||!/^[a-zA-Z0-9_-]{12,128}$/.test(nonce))
    throw Error('ISSUER_INSTALL_INPUT_INVALID');
  const payload={schema:O2_INSTALLER_PAYLOAD_SCHEMA,...expected,
    issuedAtMs:nowMs,expiresAtMs:nowMs+lifetimeMs,nonce,revocationEpoch};
  const key=typeof privateKey==='string'
    ?createPrivateKey(readFileSync(privateKey)):privateKey;
  if(key.asymmetricKeyType!=='ed25519')throw Error('ISSUER_INSTALL_KEY_UNSUPPORTED');
  const spkiDerBase64Url=createPublicKey(key)
    .export({format:'der',type:'spki'}).toString('base64url');
  const receipt={issuerId,spkiDerBase64Url,
    signatureBase64Url:signWith(null,
      serializeO2UntrustedInstallerPayload(payload),key).toString('base64url'),
    payload};
  return receipt;
}

/** Public SPKI (base64url) of an issuer private key file, for registry pinning. */
export function issuerPublicSpkiBase64Url(keyPath){
  const key=createPrivateKey(readFileSync(keyPath));
  return createPublicKey(key).export({format:'der',type:'spki'}).toString('base64url');
}

export function spkiSha256Hex(spkiDerBase64Url){
  return createHash('sha256').update(Buffer.from(spkiDerBase64Url,'base64url'))
    .digest('hex');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  const get=name=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:undefined};
  const keyPath=get('key'),expectedPath=get('expected'),out=get('out');
  const issuerId=get('issuer-id'),nonce=get('nonce');
  const epoch=Number(get('epoch')??'1');
  if(!keyPath||!expectedPath||!out||!issuerId||!nonce)
    throw Error('usage: issuer-install.mjs --key <pem> --expected <json> '+
      '--out <json> --issuer-id <id> --nonce <n> [--epoch N]');
  const expected=JSON.parse(readFileSync(expectedPath,'utf8'));
  const receipt=issueInstallerReceipt({issuerId,privateKey:keyPath,expected,
    nowMs:Date.now(),nonce,revocationEpoch:epoch});
  writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({wrote:out,issuerId,
    payloadDigest:createHash('sha256')
      .update(serializeO2UntrustedInstallerPayload(receipt.payload)).digest('hex')}));
}
