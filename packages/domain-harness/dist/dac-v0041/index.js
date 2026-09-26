// Issue #355 / A41-001: DAC v0.0.4.1 successor reference/request-role
// foundation (leaf module). Portable: no Node built-ins, no engine
// internals, no imports from any historical DAC adapter (src/dac/** and
// src/dac-v003*/** stay byte-separate and separately testable).
// Composition happens only in the public barrel (exports only).
export * from './contracts.js';
export * from './guards.js';
//# sourceMappingURL=index.js.map