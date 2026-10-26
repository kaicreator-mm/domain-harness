/**
 * C01 physical two-process worker (#1177): ONE child Node process that
 * builds + activates the SAME App over the SAME physical SQLite K store and
 * submits ONE external job intent. The parent spawns two of these
 * concurrently with the SAME messageId/input/instance (the #1108-adjacent
 * competing-writers witness through the C01 external path): the durable
 * admission fence + journal + the provider's own idempotency must keep the
 * physical dispatch exactly-once no matter which child wins.
 *
 * Usage: node --import tsx v010-c01-child.mjs <kStorePath> <jobStorePath> <messageId> <requestId> <outcomeFile>
 */
import { writeFile } from 'node:fs/promises';

const [kStorePath, jobStorePath, messageId, requestId, outcomeFile] = process.argv.slice(2);

globalThis.__c01JobStorePath = jobStorePath;
globalThis.__c01NotifyStorePath = `${jobStorePath}.notify-unused`;

const [{ V10_TARGET_PROFILE, sha256Hex }, { buildV10App }, { activateV10App }] = await Promise.all([
  import('@kaicreator/domain-harness-contracts'),
  import('@kaicreator/domain-harness-build'),
  import('../../../packages/microkernel/src/internal/activation.js'),
]);

const { readFile } = await import('node:fs/promises');

const [kernel, sdk, router, business, extjob, extnotify] = await Promise.all([
  readFile(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../assembly/fixtures-v010/business-external-jobs-v1.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../assembly/fixtures-v010/capability-extjob-runx-v1.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../assembly/fixtures-v010/capability-extnotify-provider-v1.mjs', import.meta.url), 'utf8'),
]);
const routerBody = router.replace(/^export /gm, '');
const standardBundle = `${sdk}
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;

const { openSqliteCasStore } = await import('../../../packages/domain-harness/src/host-v8/index.js');

const TENANT = 'tenant:v010-c01';
const app = buildV10App({
  appId: 'app:v010-c01-external-effects',
  audience: 'aud:v010-c01',
  targetProfile: V10_TARGET_PROFILE,
  modules: [
    {
      packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256Hex(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standardBundle, moduleSha256: sha256Hex(standardBundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: 'business-external-jobs@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256Hex(business),
      endpoint: 'business-policy', dependencies: [],
      provides: [
        'business:policy/1', 'intent:submitExternalJob', 'intent:checkExternalJob', 'intent:reconcileExternalJob',
        'intent:sendNotification', 'intent:submitUnpermittedJobProbe', 'intent:submitCrossCapabilityProbe', 'intent:submitExpiringJob',
      ], requires: [],
    },
    {
      packageId: 'capability-extjob-runx@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extjob, moduleSha256: sha256Hex(extjob),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extjob/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extjob', externalEffect: true,
      handlers: [
        { operationId: 'job.submit', handler: 'jobSubmit' },
        { operationId: 'job.status', handler: 'jobStatus' },
        { operationId: 'job.reconcile', handler: 'jobReconcile' },
      ],
    },
    {
      packageId: 'capability-extnotify-provider@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: extnotify, moduleSha256: sha256Hex(extnotify),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:extnotify/1'], requires: [],
      externalImports: { node: [], npm: [], native: ['better-sqlite3'] },
      capabilityId: 'extnotify', externalEffect: true,
      handlers: [
        { operationId: 'notify.send', handler: 'notifySend' },
        { operationId: 'notify.status', handler: 'notifyStatus' },
      ],
    },
  ],
  routes: [
    { intentId: 'submitExternalJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' },
    { intentId: 'checkExternalJob', operationId: 'job.status', capabilityId: 'extjob', handlerId: 'jobStatus' },
    { intentId: 'reconcileExternalJob', operationId: 'job.reconcile', capabilityId: 'extjob', handlerId: 'jobReconcile' },
  ],
  hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
  buildId: 'c01-external-effect',
});

const store = await openSqliteCasStore({ path: kStorePath });
const v10Store = {
  get: (key) => store.get(key),
  put: (key, value, condition) => store.put(key, value, condition.kind === 'create' ? { mustBeAbsent: true } : { mustMatchRevision: condition.revision }),
  remove: (key, condition) => store.remove(key, condition.kind === 'create' ? { mustBeAbsent: true } : { mustMatchRevision: condition.revision }),
  keys: () => store.list(''),
};

let outcome;
try {
  const activation = await activateV10App(app, { store: v10Store, tenantId: TENANT, now: () => Date.UTC(2026, 9, 19, 12, 0, 0) });
  try {
    const receipt = await activation.facade.send({
      intentType: 'submitExternalJob',
      instanceKey: 'instance:c01-race',
      messageId,
      input: { requestId, jobSpec: { kind: 'race' }, jobId: null, idempotencyKey: null, channel: null, message: null },
    });
    // R01-C01 #1211: a non-throwing UNKNOWN/denied receipt is NOT admitted.
    // Only an actual admitted receipt is a winner. Preserve the genuine K02/K01
    // code on the fail-closed loser; never invent an ADMISSION_* error.
    // If an admitted receipt has no effect, keep ok=true/effect=null so the
    // parent's exact-effect witness still detects any broken original replay.
    outcome = receipt.status === 'admitted'
      ? { ok: true, status: receipt.status, effect: receipt.admitted?.effects?.[0] ?? null }
      : { ok: false, status: receipt.status, code: receipt.code ?? null, message: JSON.stringify(receipt).slice(0, 500) };
  } finally {
    activation.dispose();
  }
} catch (error) {
  outcome = { ok: false, code: String(error?.code ?? 'UNKNOWN_ERROR'), message: String(error?.message ?? error).slice(0, 400) };
}
await store.close();
await writeFile(outcomeFile, JSON.stringify(outcome), 'utf8');
process.exit(0);
