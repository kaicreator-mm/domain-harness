// Issue #359 / A41-005: DAC v0.0.4.1 Runtime binding/activation
// consumer/verifier surface (leaf module; consumer-only, never an
// issuer). Portable: no Node built-ins, no engine internals, no imports
// from any historical DAC adapter; imports only the A41-001 foundation
// and the A41-002/-003/-004 leaf modules. Deliberately NOT re-exported
// through the foundation barrel or any central public export (A41-005
// write-set boundary); later integration concerns compose it explicitly.
export * from './contracts.js';
export * from './verifier.js';
