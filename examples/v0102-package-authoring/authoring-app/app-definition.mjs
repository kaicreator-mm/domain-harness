/**
 * Issue #1379 authoring-template App definition (#1305 minimal acceptance).
 * =====================================================================
 *
 * The minimal closed-world #1305 authoring composition: one K Primary, one
 * S Primary, ONE independently selected non-Tool S Feature
 * (semantic-decision), ONE Business whose private helper stays private, and
 * TWO physically separate Capability modules — read-only `inventory` and
 * external-effect `jobs`. No K extension, no model, no SQLite/Host-node
 * dependency: the consumer installs only the two public runtime packages.
 *
 * The K/S/Feature payload bytes are read from the INSTALLED Domain Packages
 * through their public export map by the producer (never from a repository
 * path); the B/C bytes are the staged App files next to this definition.
 */
export const definition = Object.freeze({
  appId: 'app:v0102-authoring',
  audience: 'aud:v0102-authoring',
  buildId: 'authoring-v1',
  deployment: Object.freeze({
    deployedAppId: 'deploy:v0102-authoring',
    tenantId: 'tenant:v0102-authoring',
    appId: 'app:v0102-authoring',
  }),
  modules: Object.freeze([
    Object.freeze({ packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1', endpoint: 'occurrence-runtime', provides: ['kernel:occurrence-runtime/1'] }),
    Object.freeze({ packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1', endpoint: 'rule-interpreter', provides: ['standard:interpret/1', 'standard:route/1'] }),
    Object.freeze({
      packageId: 'sfeature-semantic-decision@v010.1.0.0', role: 'standard-feature', abiVersion: 'dh.v10.standard-feature/1',
      payload: 'sfeature-semantic-decision', endpoint: 'standard-feature',
      provides: ['standard:semantic-decision/1'], featureExport: 'resolveSemanticDecision',
    }),
    Object.freeze({ packageId: 'business-authoring-review@v0102.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1', file: 'business-authoring-review.mjs', endpoint: 'business-policy', provides: ['business:policy/1', 'intent:submitAuthoringReview', 'intent:submitAuthoringJob', 'intent:submitUnpermittedJobProbe'] }),
    Object.freeze({
      packageId: 'capability-inventory-readonly@v0102.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      file: 'capability-inventory-readonly.mjs', endpoint: 'capability-endpoint',
      provides: ['capability:inventory/1'], capabilityId: 'inventory',
      handlers: Object.freeze([Object.freeze({ operationId: 'inventory.get', handler: 'getInventory' })]),
    }),
    Object.freeze({
      packageId: 'capability-jobs-effect@v0102.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      file: 'capability-jobs-effect.mjs', endpoint: 'capability-endpoint',
      provides: ['capability:jobs/1'], capabilityId: 'jobs', externalEffect: true,
      handlers: Object.freeze([Object.freeze({ operationId: 'jobs.submit', handler: 'submitJob' })]),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ intentId: 'submitAuthoringReview', operationId: 'inventory.get', capabilityId: 'inventory', handlerId: 'getInventory' }),
    Object.freeze({ intentId: 'submitAuthoringJob', operationId: 'jobs.submit', capabilityId: 'jobs', handlerId: 'submitJob' }),
    Object.freeze({ intentId: 'submitUnpermittedJobProbe', operationId: 'jobs.submit', capabilityId: 'jobs', handlerId: 'submitJob' }),
  ]),
  hardBudget: Object.freeze({ maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 }),
});
