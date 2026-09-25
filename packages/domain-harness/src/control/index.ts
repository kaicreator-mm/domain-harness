// Issue #313: generic public Runtime cancel/interrupt control (leaf module).
// Portable: no Node built-ins, no engine internals, no raw XState/AbortController
// exposure. Composition happens in create-domain-runtime.ts (option) and the
// public barrels (exports only).
export * from './contracts.js';
export {
  RuntimeControlCoordinator,
  RuntimeControlInterruptSignal,
  type ActiveRuntimeTurn,
  type RuntimeControlCoordinatorOptions,
  type RuntimeControlRuntimePorts,
} from './coordinator.js';
