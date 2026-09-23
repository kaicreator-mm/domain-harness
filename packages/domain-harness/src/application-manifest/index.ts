// Issue #310 / A2 I-007: PROVISIONAL Application Manifest composition
// adapter (leaf module). Portable: no Node built-ins, no engine/observation/
// control imports, no DAC product dependency, no Forge/Simulator/Domain UX
// implementation import. Composition happens only in the public barrels
// (exports only).
export * from './contracts.js';
export * from './guards.js';
export * from './compose.js';
