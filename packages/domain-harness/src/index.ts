export const DOMAIN_HARNESS_VERSION = '0.2.0' as const;

// v0.2 portable Runtime + contracts are the primary SDK surface.
export * from './public-v2/index.js';

// Frozen v0.1 compatibility surface remains available during migration.
export { createDomainHarness } from './create-domain-harness.js';
export type { CreateDomainHarnessOptions } from './create-domain-harness.js';
export * from './public/index.js';
