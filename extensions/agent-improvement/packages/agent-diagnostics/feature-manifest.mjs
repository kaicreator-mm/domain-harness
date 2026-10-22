/** C01 standalone v0.10.1 DomainHarness Qualified Standard Feature descriptor. */
export const agentDiagnosticsFeature = Object.freeze({
  packageId: 'sfeature-agent-diagnostics@v0101.0.0',
  role: 'standard-feature',
  dependencies: Object.freeze([]),
  requires: Object.freeze([]),
  externalImports: Object.freeze({node:Object.freeze([]),npm:Object.freeze([]),native:Object.freeze([])}),
  abiVersion: 'dh.v10.standard-feature/1',
  file: 'modules/sfeature-agent-diagnostics-v1.mjs',
  endpoint: 'standard-feature',
  provides: Object.freeze(['standard:agent-diagnostics/1']),
  featureExport: 'analyzeAgentRun',
});
