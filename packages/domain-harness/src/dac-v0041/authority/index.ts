// Issue #356 / A41-002: DAC v0.0.4.1 designation/delegation/currentness and
// AuthorityAdoption CONSUMER/VERIFIER surface (leaf module; consumer-only,
// never an issuer). Portable: no Node built-ins, no engine internals, no
// imports from any historical DAC adapter; imports only the A41-001
// successor foundation. Deliberately NOT re-exported through the foundation
// barrel or any central public export (A41-002 write-set boundary); later
// integration concerns compose it explicitly.
export * from './contracts.js';
export * from './verifier.js';
