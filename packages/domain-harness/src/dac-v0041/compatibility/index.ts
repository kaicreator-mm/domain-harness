// Issue #357 / A41-003: DAC v0.0.4.1 successor compatibility/capability/
// refusal/currentness CONSUMER/VERIFIER surface (leaf module; consumer-only,
// never an issuer). Portable: no Node built-ins, no engine internals, no
// imports from any historical DAC adapter; imports only the A41-001
// successor foundation. Deliberately NOT re-exported through the foundation
// barrel or any central public export (A41-003 write-set boundary); later
// integration concerns compose it explicitly.
export * from './contracts.js';
export * from './verifier.js';
