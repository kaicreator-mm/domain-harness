/**
 * Tiny App definition (#1180 T11) — the smallest closed-world v0.10 Domain
 * App: K Primary Basic + S Primary Basic + exactly one Business and only its
 * essential ordinary Capability. No K extension, no S feature, no Agent, no
 * model, no external Effect adapter is selected or installed.
 *
 * Module bytes are app-owned copies of the accepted v0.8/v0.9 public example
 * sources (see ../PROVENANCE.md); the selected K/S payload bytes come from the
 * installed compiler package, never from this repository.
 */
export const definition = Object.freeze({
  appId: 'app:v010-clean-tiny',
  audience: 'aud:v010-clean-tiny',
  buildId: 'tiny-v1',
  deployment: Object.freeze({
    deployedAppId: 'deploy:v010-clean-tiny',
    tenantId: 'tenant:v010-clean-tiny',
    appId: 'app:v010-clean-tiny',
  }),
  modules: Object.freeze([
    Object.freeze({ packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1', endpoint: 'occurrence-runtime', provides: ['kernel:occurrence-runtime/1'] }),
    Object.freeze({ packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1', endpoint: 'rule-interpreter', provides: ['standard:interpret/1', 'standard:route/1'] }),
    Object.freeze({ packageId: 'business-order-approval@v08.1.0.0', role: 'business', abiVersion: 'v08-business-abi/1', file: 'business-approval.mjs', endpoint: 'business-policy', provides: ['business:policy/1', 'intent:submitQuoteDecision'] }),
    Object.freeze({
      packageId: 'capability-quote-tools@v08.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1', file: 'capability-quote-tools.mjs',
      endpoint: 'capability-endpoint', provides: ['capability:ledger/1'], capabilityId: 'ledger',
      handlers: Object.freeze([
        Object.freeze({ operationId: 'reserve', handler: 'reserveLedger' }),
        Object.freeze({ operationId: 'preview', handler: 'previewTotal' }),
      ]),
    }),
  ]),
  routes: Object.freeze([
    Object.freeze({ intentId: 'submitQuoteDecision', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }),
  ]),
  hardBudget: Object.freeze({ maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 }),
});
