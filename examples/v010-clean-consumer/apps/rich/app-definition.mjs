/**
 * Rich App definition (#1180 T11) — one Node24 Domain App with:
 *  - one K Primary + TWO physically separate advisory K extensions
 *    (distinct provider/hook ids, non-authoritative),
 *  - one S Primary + >=3 physically separate S feature packages (four in v1,
 *    five in v2),
 *  - THREE Businesses: two of them share workflowId `external-jobs` and the
 *    SAME instanceKey so their K02 scoped namespaces stay disjoint, plus the
 *    ordinary Agent-as-Business-Workflow,
 *  - four selected C packages: the two unrelated external Effect adapters
 *    (job-shaped fake + notifier) and the scoped Memory + read-only Tool pair.
 *
 * v1 and v2 are two genuinely different BUILDs of the SAME stable deployment
 * identity: v2 selects the T06 decision-evidence feature in addition, so both
 * the subject digest and the package closure digest differ.
 */
const KERNEL = Object.freeze({
  packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
  endpoint: 'occurrence-runtime', provides: ['kernel:occurrence-runtime/1'],
});
const STANDARD = Object.freeze({
  packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
  endpoint: 'rule-interpreter', provides: ['standard:interpret/1', 'standard:route/1'],
});

const EXTENSIONS = Object.freeze([
  Object.freeze({
    packageId: 'kext-advisory-alpha@v010.1.0.0', role: 'kernel-extension', abiVersion: 'dh.v10.k-extension/1',
    file: 'kext-advisory-alpha-v1.mjs', endpoint: 'kernel-extension-advisory',
    provides: ['admission-budget-advice/v1'], providerId: 'advisory-alpha', hookExport: 'observeAlpha',
  }),
  Object.freeze({
    packageId: 'kext-advisory-beta@v010.1.0.0', role: 'kernel-extension', abiVersion: 'dh.v10.k-extension/1',
    file: 'kext-advisory-beta-v1.mjs', endpoint: 'kernel-extension-advisory',
    provides: ['turn-observation/v1'], providerId: 'advisory-beta', hookExport: 'observeBeta',
  }),
]);

const FEATURES_V1 = Object.freeze([
  Object.freeze({
    packageId: 'sfeature-semantic-decision@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
    payload: 'sfeature-semantic-decision', endpoint: 'standard-feature',
    provides: ['standard:semantic-decision/1'], featureExport: 'resolveSemanticDecision',
  }),
  Object.freeze({
    packageId: 'sfeature-workflow-control@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
    payload: 'sfeature-workflow-control', endpoint: 'standard-feature',
    provides: ['standard:workflow-control/1'], featureExport: 'planWorkflowControl',
  }),
  Object.freeze({
    packageId: 'sfeature-context-assembly@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
    payload: 'sfeature-context-assembly', endpoint: 'standard-feature',
    provides: ['standard:context-assembly/1'], featureExport: 'assembleBoundedContext',
  }),
  Object.freeze({
    packageId: 'sfeature-shadow-baseline@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
    file: 'sfeature-shadow-baseline-v1.mjs', endpoint: 'standard-feature',
    provides: ['standard:shadow-baseline/1'], featureExport: 'evaluate',
  }),
]);

const FEATURE_V2_EXTRA = Object.freeze({
  packageId: 'sfeature-decision-evidence@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
  payload: 'sfeature-decision-evidence', endpoint: 'standard-feature',
  provides: ['standard:decision-evidence/1'], featureExport: 'recordDecisionEvidence',
});

const BUSINESSES = Object.freeze([
  Object.freeze({
    packageId: 'business-external-jobs@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
    file: 'business-external-jobs-v1.mjs', endpoint: 'business-policy',
    provides: Object.freeze([
      'business:policy/1', 'intent:submitExternalJob', 'intent:checkExternalJob', 'intent:reconcileExternalJob',
      'intent:sendNotification', 'intent:submitUnpermittedJobProbe', 'intent:submitCrossCapabilityProbe',
      'intent:submitExpiringJob', 'intent:submitDoubleDispatchProbe', 'intent:submitConcurrentDispatchProbe',
    ]),
  }),
  Object.freeze({
    packageId: 'business-external-jobs-b@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
    file: 'business-external-b-second-v1.mjs', endpoint: 'business-policy',
    provides: Object.freeze(['business:policy/1', 'intent:submitSecondBJob']),
  }),
  Object.freeze({
    packageId: 'business-agent-workflow@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
    file: 'business-agent-workflow-v1.mjs', endpoint: 'business-policy',
    provides: Object.freeze(['business:policy/1', 'intent:agentCollectContext', 'intent:agentCommitTurn', 'intent:agentProbeForeignMemory']),
  }),
  Object.freeze({
    packageId: 'business-wait-resume@v010.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1',
    file: 'business-wait-resume-v1.mjs', endpoint: 'business-policy',
    provides: Object.freeze(['business:policy/1', 'intent:openWait', 'intent:resumeCallback', 'intent:timeoutWait']),
  }),
]);

const CAPABILITIES = Object.freeze([
  Object.freeze({
    packageId: 'capability-extjob-runx@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
    file: 'capability-extjob-runx-v1.mjs', endpoint: 'capability-endpoint', provides: ['capability:extjob/1'],
    capabilityId: 'extjob', externalEffect: true,
    externalImports: Object.freeze({ node: Object.freeze([]), npm: Object.freeze([]), native: Object.freeze(['better-sqlite3']) }),
    handlers: Object.freeze([
      Object.freeze({ operationId: 'job.submit', handler: 'jobSubmit' }),
      Object.freeze({ operationId: 'job.status', handler: 'jobStatus' }),
      Object.freeze({ operationId: 'job.reconcile', handler: 'jobReconcile' }),
    ]),
  }),
  Object.freeze({
    packageId: 'capability-extnotify-provider@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
    file: 'capability-extnotify-provider-v1.mjs', endpoint: 'capability-endpoint', provides: ['capability:extnotify/1'],
    capabilityId: 'extnotify', externalEffect: true,
    externalImports: Object.freeze({ node: Object.freeze([]), npm: Object.freeze([]), native: Object.freeze(['better-sqlite3']) }),
    handlers: Object.freeze([
      Object.freeze({ operationId: 'notify.send', handler: 'notifySend' }),
      Object.freeze({ operationId: 'notify.status', handler: 'notifyStatus' }),
    ]),
  }),
  Object.freeze({
    packageId: 'capability-agent-memory@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
    file: 'capability-agent-memory-v1.mjs', endpoint: 'capability-endpoint', provides: ['capability:memory/1'],
    capabilityId: 'memory',
    externalImports: Object.freeze({
      node: Object.freeze(['node:path', 'node:os', 'node:fs']),
      npm: Object.freeze(['@kaicreator/domain-harness/v8/host']),
      native: Object.freeze([]),
    }),
    handlers: Object.freeze([
      Object.freeze({ operationId: 'memory.put', handler: 'memoryPut' }),
      Object.freeze({ operationId: 'memory.get', handler: 'memoryGet' }),
      Object.freeze({ operationId: 'memory.search', handler: 'memorySearch' }),
      Object.freeze({ operationId: 'memory.delete', handler: 'memoryDelete' }),
    ]),
  }),
  Object.freeze({
    packageId: 'capability-agent-tool-read@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
    file: 'capability-agent-tool-v1.mjs', endpoint: 'capability-endpoint', provides: ['capability:tool/1'],
    capabilityId: 'tool',
    handlers: Object.freeze([
      Object.freeze({ operationId: 'tool.lookup', handler: 'toolLookup' }),
    ]),
  }),
]);

const ROUTES = Object.freeze([
  Object.freeze({ intentId: 'submitExternalJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' }),
  Object.freeze({ intentId: 'checkExternalJob', operationId: 'job.status', capabilityId: 'extjob', handlerId: 'jobStatus' }),
  Object.freeze({ intentId: 'reconcileExternalJob', operationId: 'job.reconcile', capabilityId: 'extjob', handlerId: 'jobReconcile' }),
  Object.freeze({ intentId: 'sendNotification', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' }),
  Object.freeze({ intentId: 'submitUnpermittedJobProbe', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' }),
  Object.freeze({ intentId: 'submitSecondBJob', operationId: 'job.submit', capabilityId: 'extjob', handlerId: 'jobSubmit' }),
  Object.freeze({ intentId: 'agentCollectContext', operationId: 'memory.search', capabilityId: 'memory', handlerId: 'memorySearch' }),
  Object.freeze({ intentId: 'agentCommitTurn', operationId: 'memory.put', capabilityId: 'memory', handlerId: 'memoryPut' }),
  Object.freeze({ intentId: 'agentProbeForeignMemory', operationId: 'memory.search', capabilityId: 'memory', handlerId: 'memorySearch' }),
  Object.freeze({ intentId: 'openWait', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' }),
  Object.freeze({ intentId: 'resumeCallback', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' }),
  Object.freeze({ intentId: 'timeoutWait', operationId: 'notify.send', capabilityId: 'extnotify', handlerId: 'notifySend' }),
]);

const DEPLOYMENT = Object.freeze({
  deployedAppId: 'deploy:v010-t05-rich',
  tenantId: 'tenant:v010-t05-rich',
  appId: 'app:v010-t05-rich',
});

/** BUILD v1: four S features. */
export const definitionV1 = Object.freeze({
  appId: DEPLOYMENT.appId,
  audience: 'aud:v010-clean-rich',
  buildId: 'rich-v1',
  deployment: DEPLOYMENT,
  modules: Object.freeze([KERNEL, STANDARD, ...FEATURES_V1, ...EXTENSIONS, ...BUSINESSES, ...CAPABILITIES]),
  routes: ROUTES,
  hardBudget: Object.freeze({ maxStepsPerTurn: 16, maxWorkUnitsPerTurn: 256 }),
});

/** BUILD v2: the SAME stable deployment plus the T06 decision-evidence feature. */
export const definitionV2 = Object.freeze({
  ...definitionV1,
  buildId: 'rich-v2',
  modules: Object.freeze([KERNEL, STANDARD, ...FEATURES_V1, FEATURE_V2_EXTRA, ...EXTENSIONS, ...BUSINESSES, ...CAPABILITIES]),
});
