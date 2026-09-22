import type { HarnessMachineRunnerPort } from './contracts.js';
/**
 * Production HarnessMachine runner: drives the merged bounded XState child
 * exactly once to its terminal output. Cancellation maps to the child's
 * cooperative CANCEL event; no timeout policy is invented here (execution
 * bounds live in the machine's maxSteps contract and the host's own signal).
 */
export declare function createXStateHarnessMachineRunner(): HarnessMachineRunnerPort;
//# sourceMappingURL=harness-runner.d.ts.map