/**
 * Un-bootstrapped load() sentinel child (T-E #1004, #1000 Host-side closure).
 * STOCK NODE. The child imports the trusted Host module and the public v8
 * facade, then — WITHOUT any bootstrap — attempts load() of a closure whose
 * approval proof is GENUINELY HMAC'd with the real issuer secret.
 *
 * Expected: UNTRUSTED_ISSUER, isTrustChannelEstablished() === false, and the
 * sealed modules' top-level sentinel counters stay 0 (zero imports).
 * Prints exactly one JSON line.
 */

import { createHmac } from 'node:crypto';

import { isHostTrustChannelEstablished } from '@kaicreator/domain-harness/v8/host';
import { approvalBindingDigest, computeSubjectDigest, load, sha256Hex } from '@kaicreator/domain-harness/v8';

const SENTINEL = '__v08TeSentinelChild';

function moduleSource(packageId, kind, extra) {
  return [
    `globalThis.${SENTINEL} ??= {};`,
    `globalThis.${SENTINEL}[${JSON.stringify(packageId)}] = (globalThis.${SENTINEL}[${JSON.stringify(packageId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(kind)};`,
    `export const ABI_VERSION = ${JSON.stringify(
      kind === 'kernel' ? 'v08-kernel-abi/1' : kind === 'standard-sdk' ? 'v08-standard-sdk-abi/1' : 'v08-business-abi/1',
    )};`,
    kind === 'kernel'
      ? "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];"
      : kind === 'standard-sdk'
        ? "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];"
        : "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    extra,
    '',
  ].join('\n');
}

const issuerId = process.argv[2];
const issuerSecret = process.argv[3];

const kernelId = 'kernel:te-sentinel@1.0.0';
const sdkId = 'std:te-sentinel@1.0.0';
const bizId = 'biz:te-sentinel@1.0.0';
const kernelSource = moduleSource(kernelId, 'kernel', 'export function createOccurrenceRuntime() { return { ok: true }; }');
const sdkSource = moduleSource(sdkId, 'standard-sdk', 'export function interpret() { return null; }');
const bizSource = moduleSource(bizId, 'business', 'export const INTENT_TYPES = ["demo.sentinel"];\nexport function getPolicy() { return {}; }');
const packages = [
  {
    packageId: kernelId,
    kind: 'kernel',
    abiVersion: 'v08-kernel-abi/1',
    moduleSource: kernelSource,
    moduleSha256: sha256Hex(kernelSource),
    endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
  },
  {
    packageId: sdkId,
    kind: 'standard-sdk',
    abiVersion: 'v08-standard-sdk-abi/1',
    moduleSource: sdkSource,
    moduleSha256: sha256Hex(sdkSource),
    endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
  },
  {
    packageId: bizId,
    kind: 'business',
    abiVersion: 'v08-business-abi/1',
    moduleSource: bizSource,
    moduleSha256: sha256Hex(bizSource),
    endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
  },
];
const bindings = [
  { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
  { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
  { role: 'business', packageId: bizId, endpointId: 'business-policy' },
  { role: 'intent', intentType: 'demo.sentinel', packageId: bizId, endpointId: 'business-policy' },
];
const subjectDigest = computeSubjectDigest({ rootPackageId: 'app:te-sentinel@1.0.0', packages, bindings });
const base = { proofType: 'v08-external-approval/1', subjectDigest, issuerId, issuedAt: new Date().toISOString() };
const proofDigest = approvalBindingDigest(base);
const root = {
  formatVersion: 'dhpkg/v8-qualified-root/1',
  rootPackageId: 'app:te-sentinel@1.0.0',
  build: { producerId: 'qualified-producer:v08-te', builtAt: new Date().toISOString(), baseCommit: 'a835cabf7f0733797b421381d21104324310e75f', closureDigest: subjectDigest },
  approval: { ...base, proofDigest, issuerAttestation: `hmac-sha256:${createHmac('sha256', issuerSecret).update(proofDigest, 'utf8').digest('hex')}` },
  packages,
  bindings,
};

const channelEstablished = isHostTrustChannelEstablished();
let code;
try {
  await load(root);
  code = 'LOADED_UNEXPECTEDLY';
} catch (error) {
  code = error?.code ?? `UNEXPECTED:${String(error?.name ?? error)}`;
}
const sentinels = (globalThis[SENTINEL] ?? {});
console.log(
  JSON.stringify({
    channelEstablished,
    code,
    sentinelKernel: sentinels[kernelId] ?? 0,
    sentinelSdk: sentinels[sdkId] ?? 0,
    sentinelBiz: sentinels[bizId] ?? 0,
  }),
);
