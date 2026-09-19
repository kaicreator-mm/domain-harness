export const DOMAIN_HARNESS_VERSION = '0.2.0' as const;

// v0.2 portable Runtime + contracts are the primary SDK surface.
// Keep the package root host-neutral: legacy v0.1 runtime/loader exports are not
// reachable from the v0.2 package root because they depend on Node-only host
// infrastructure. The explicit `./v2` export remains an alias for consumers that
// adopted it during v0.2 development.
export * from './public-v2/index.js';
