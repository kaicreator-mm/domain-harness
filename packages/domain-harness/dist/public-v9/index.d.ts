/**
 * v0.9 public SDK CONTRACT surface (N07), portable JS/TS.
 *
 * The published DomainHarness value forwards only a single installed-ref
 * string to an existing trusted Host bootstrap (if any). It cannot create
 * Host/Kernels, accept a caller-supplied verifier or install raw packages.
 */
export { DomainHarnessV9Error, V9_PUBLIC_ERROR_CODES, publicInstalledReferenceFailure, } from './errors.js';
export type { V9PublicErrorCode } from './errors.js';
/** Public one-argument executable facade; no privileged bootstrap export. */
export { DomainHarness } from './runtime-channel.js';
export type { V9DomainFacade, V9DomainHarness, V9InstalledPackageReferenceString, V9PublicInstanceQuery, V9PublicLoadedPackage, V9PublicSendIntent, V9PublicSubscription, V9WorkflowRouterResult, } from './contracts.js';
//# sourceMappingURL=index.d.ts.map