/**
 * v0.9 public SDK CONTRACT surface (N07), portable JS/TS.
 *
 * @kaicreator/domain-harness/v9 is wired by #1118 after the actual #1036
 * protected H→K operations bridge. Exporting types here does not create a
 * fake DomainHarness runtime or allow a caller-supplied verifier.
 */
export {
  DomainHarnessV9Error,
  V9_PUBLIC_ERROR_CODES,
  publicInstalledReferenceFailure,
} from './errors.js';
export type { V9PublicErrorCode } from './errors.js';

export type {
  V9DomainFacade,
  V9DomainHarness,
  V9InstalledPackageReferenceString,
  V9PublicInstanceQuery,
  V9PublicLoadedPackage,
  V9PublicSendIntent,
  V9PublicSubscription,
  V9WorkflowRouterResult,
} from './contracts.js';
