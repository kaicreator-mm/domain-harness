// Issue #308 / A2 I-005: DAC UX<->Runtime correlation bridge (leaf module).
// Renderer-independent correlation adapters over the existing
// DomainMessage/query/workflow-snapshot/projection/subscription mechanisms.
// Portable: no Node built-ins, no runtime mutation, no observation (#312) or
// control (#313) imports, no DAC product-implementation dependency, no
// rendering/presentation concepts. Composition happens only in the public
// barrels (exports only).
export * from './contracts.js';
export * from './guards.js';
export * from './adapters.js';
export * from './stale-basis.js';
