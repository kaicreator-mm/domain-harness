// Issue #323 / DAC v0.0.3 V3-001: versioned base-reference/profile foundation
// (leaf module). Portable: no Node built-ins, no engine internals, no DAC
// product-implementation dependency, no imports from the historical v0.0.2
// adapter (src/dac/** stays byte-separate and separately testable).
// Composition happens only in the public barrel (exports only).
export * from './contracts.js';
export * from './guards.js';
