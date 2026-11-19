/**
 * DomainHarness v0.11.0 T01 (#1575) — the canonical v011 public ABI entry
 * (`@kaicreator/domain-harness-contracts/v011`, L2 §8.3 contracts scoped
 * deviation: the package root `.` stays the legacy v0.10.x inert
 * type/constant face; 0.11 code imports exclusively from this subpath).
 *
 * Export face = the frozen L2 machine contracts: schemaVersion constants,
 * L201–L206 types, the canonical digest tools, the append-only error code
 * catalog, schema-layer validators, the FunctionOutcome strict union with
 * its four static negatives, and the authoring fixtures.
 */
export * from './schema-versions.js';
export type * from './base.js';
export * from './element-contracts.js';
export * from './refs.js';
export * from './package-manifest.js';
export * from './app-descriptor.js';
export * from './app-lock.js';
export * from './boot-contracts.js';
export * from './app-contracts.js';
export * from './function-outcome-negatives.js';
export * from './digest.js';
export * from './json-schemas.js';
export * from './error-codes.js';
export * from './errors.js';
export * from './validate.js';
export * from './fixtures/legal.js';
export * from './fixtures/illegal.js';
