// Issue #358 / A41-004: DAC v0.0.4.1 composition-intake consumer/verifier
// surface (leaf module; consumer-only, never an issuer). Portable: no Node
// built-ins, no engine internals, no imports from any historical DAC adapter;
// imports only the A41-001 successor foundation and the A41-002 authority
// verifier. Deliberately NOT re-exported through the foundation barrel or
// any central public export (A41-004 write-set boundary); later integration
// concerns compose it explicitly.
export * from './contracts.js';
export * from './verifier.js';
