// Issue #328 / DAC v0.0.3 V3-004: immutable Application Manifest
// composition consumption (leaf module). Portable: no Node built-ins, no
// engine internals, no DAC product-implementation dependency, no edits to
// the historical v0.0.2 adapter or any earlier V3 leaf (all stay
// byte-separate and separately testable). Composition happens only in the
// public barrel (exports only).
//
// The guard layer is enumerated EXPLICITLY instead of `export *` from
// guards so the internal mint-registry helpers stay module-internal.
export * from './contracts.js';
export {
  computeDacV003ApplicationManifestDigest,
  adoptDacV003ApplicationManifest,
  isDacV003ApplicationManifest,
  dacV003ManifestIdentityOf,
  associateDacV003ManifestCompatibilityValidation,
  isDacV003ManifestCompatibilityAssociation,
} from './guards.js';
