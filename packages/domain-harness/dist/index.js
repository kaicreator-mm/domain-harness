export const DOMAIN_HARNESS_VERSION = '0.2.0';
// v0.2 portable Runtime + contracts are the primary SDK surface.
// Keep the package root host-neutral: legacy v0.1 runtime/loader exports are not
// reachable from the v0.2 package root because they depend on Node-only host
// infrastructure. The explicit `./v2` export remains an alias for consumers that
// adopted it during v0.2 development.
export * from './public-v2/index.js';
// Additive portable v0.3 surface (T-021): governance/decision/admission/
// evidence authorities, retained Domain-App capability seams and the v0.3
// runtime assembly root. Host-neutral like the v0.2 surface; also reachable
// through the explicit `./v3` export.
export * from './public-v3/index.js';
//# sourceMappingURL=index.js.map