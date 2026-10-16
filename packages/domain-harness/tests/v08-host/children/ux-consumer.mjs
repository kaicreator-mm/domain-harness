/**
 * KPK-13 port — clean stock-Node public consumer (T-E #1004). STOCK NODE, no
 * tsx, no loader flags: boots the trusted Host (protected bootstrap over a
 * SQLite physical store), runs the public one-argument load() with a genuine
 * approval proof, then performs a full typed UX round trip — send, query,
 * subscribe + scoped publish — and prints one JSON line with every result.
 *
 * argv: <issuerId> <issuerSecret> <dbPath>
 */

import { createHmac } from 'node:crypto';

import {
  bootstrapTrustedHost,
  createHostUxTransport,
  mintPrincipalCredential,
  uxDocumentNamespace,
} from '@kaicreator/domain-harness/v8/host';
import { approvalBindingDigest, computeSubjectDigest, load, sha256Hex } from '@kaicreator/domain-harness/v8';

const [issuerId, issuerSecret, dbPath] = process.argv.slice(2);

function moduleSource(packageId, kind, extra) {
  return [
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

const TENANT = 'tenant-consumer';
const APP = 'app-consumer';
const AUDIENCE = 'host:te-consumer';
const INTENT_TYPE = 'demo.consumer';

const kernelId = 'kernel:te-consumer@1.0.0';
const sdkId = 'std:te-consumer@1.0.0';
const bizId = 'biz:te-consumer@1.0.0';
const sources = {
  [kernelId]: moduleSource(kernelId, 'kernel', 'export function createOccurrenceRuntime() { return { ok: true }; }'),
  [sdkId]: moduleSource(sdkId, 'standard-sdk', 'export function interpret() { return null; }'),
  [bizId]: moduleSource(bizId, 'business', `export const INTENT_TYPES = [${JSON.stringify(INTENT_TYPE)}];\nexport function getPolicy() { return {}; }`),
};
const packages = [
  { packageId: kernelId, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: sources[kernelId], moduleSha256: sha256Hex(sources[kernelId]), endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }] },
  { packageId: sdkId, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: sources[sdkId], moduleSha256: sha256Hex(sources[sdkId]), endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }] },
  { packageId: bizId, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: sources[bizId], moduleSha256: sha256Hex(sources[bizId]), endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }] },
];
const bindings = [
  { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
  { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
  { role: 'business', packageId: bizId, endpointId: 'business-policy' },
  { role: 'intent', intentType: INTENT_TYPE, packageId: bizId, endpointId: 'business-policy' },
];
const subjectDigest = computeSubjectDigest({ rootPackageId: 'app:te-consumer@1.0.0', packages, bindings });
const base = { proofType: 'v08-external-approval/1', subjectDigest, issuerId, issuedAt: new Date().toISOString() };
const proofDigest = approvalBindingDigest(base);
const root = {
  formatVersion: 'dhpkg/v8-qualified-root/1',
  rootPackageId: 'app:te-consumer@1.0.0',
  build: { producerId: 'qualified-producer:v08-te', builtAt: new Date().toISOString(), baseCommit: 'a835cabf7f0733797b421381d21104324310e75f', closureDigest: subjectDigest },
  approval: { ...base, proofDigest, issuerAttestation: `hmac-sha256:${createHmac('sha256', issuerSecret).update(proofDigest, 'utf8').digest('hex')}` },
  packages,
  bindings,
};

const bootstrapped = await bootstrapTrustedHost({
  issuers: new Map([[issuerId, issuerSecret]]),
  audience: AUDIENCE,
  storage: { path: dbPath },
});
const host = bootstrapped.host;
const loaded = await load(root);

host.resources.provision(`intent:${INTENT_TYPE}`, async (_operation, payload, context) => {
  const received = payload;
  const key = `${uxDocumentNamespace(context.principal.tenantId, context.principal.appId)}receipt:${received.messageId}`;
  const existing = await host.docs.get(key);
  await host.docs.put(
    key,
    { messageId: received.messageId, amount: received.input.amount, bySubject: context.principal.subject },
    existing === null ? { mustBeAbsent: true } : { mustMatchRevision: existing.revision },
  );
  return { echoed: true };
});

const credential = mintPrincipalCredential(
  {
    issuerId,
    grantId: 'grant-consumer-1',
    tenantId: TENANT,
    appId: APP,
    subject: 'user:consumer',
    audience: AUDIENCE,
    roles: ['requester'],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  issuerSecret,
);
const ux = createHostUxTransport(host, credential);

const observed = [];
const subscription = await ux.subscribe({ topic: 'round-trip' }, (event) => observed.push(event.payload));
await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:1', topic: 'round-trip', payload: 'hello', emittedAt: new Date().toISOString() });

const receipt = await ux.send({
  intentType: INTENT_TYPE,
  target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
  messageId: 'msg:consumer-1',
  input: { amount: 27 },
  caller: { role: 'admin' },
});
const doc = await ux.query({ kind: 'doc', key: `${uxDocumentNamespace(TENANT, APP)}receipt:msg:consumer-1` });
subscription.unsubscribe();

// Revocation: the same grant is refused at the next dispatch after durable revocation.
await host.revokeGrant('grant-consumer-1');
let revokedRefused = 'SENT_UNEXPECTEDLY';
try {
  await ux.send({
    intentType: INTENT_TYPE,
    target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
    messageId: 'msg:consumer-2',
    input: { amount: 1 },
  });
} catch (error) {
  revokedRefused = error.code ?? 'UNKNOWN';
}

console.log(
  JSON.stringify({
    loadedPackages: loaded.installedPackages.length,
    kernelId,
    receipt: {
      status: receipt.status,
      intentType: receipt.intentType,
      authenticatedRoles: receipt.authenticatedPrincipal.roles,
      declaredCaller: receipt.declaredCaller,
    },
    query: { revision: doc.revision, messageId: doc.value.messageId, bySubject: doc.value.bySubject },
    observed,
    revokedRefused,
  }),
);
await host.close();
