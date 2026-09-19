// Internal test-only bridge for the frozen v0.1 implementation that remains in
// the repository for regression/migration evidence. This module is deliberately
// NOT listed in package.json exports; the v0.2 package root must stay portable.
export { DOMAIN_HARNESS_VERSION } from '../index.js';
export { createDomainHarness } from '../create-domain-harness.js';
export type { CreateDomainHarnessOptions } from '../create-domain-harness.js';
export * from '../public/index.js';
