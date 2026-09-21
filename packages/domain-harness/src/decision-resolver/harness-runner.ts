import { createActor } from 'xstate';
import type { BusinessHarnessInput, BusinessHarnessResult } from '../harness/contract.js';
import { HarnessMachine } from '../harness/harness-machine.js';
import type { HarnessMachineRunnerPort } from './contracts.js';

/**
 * Production HarnessMachine runner: drives the merged bounded XState child
 * exactly once to its terminal output. Cancellation maps to the child's
 * cooperative CANCEL event; no timeout policy is invented here (execution
 * bounds live in the machine's maxSteps contract and the host's own signal).
 */
export function createXStateHarnessMachineRunner(): HarnessMachineRunnerPort {
  return {
    run(input: BusinessHarnessInput, signal?: AbortSignal): Promise<BusinessHarnessResult> {
      const actor = createActor(HarnessMachine, { input });
      return new Promise<BusinessHarnessResult>((resolve, reject) => {
        const onAbort = (): void => {
          actor.send({ type: 'CANCEL' });
        };
        const subscription = actor.subscribe({
          complete: () => {
            if (signal !== undefined) signal.removeEventListener('abort', onAbort);
            const output = actor.getSnapshot().output;
            if (output === undefined) {
              reject(new Error('HarnessMachine reached a final state without output'));
              return;
            }
            resolve(output);
          },
          error: (error: unknown) => {
            if (signal !== undefined) signal.removeEventListener('abort', onAbort);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        });
        void subscription;
        if (signal !== undefined) {
          if (signal.aborted) {
            actor.send({ type: 'CANCEL' });
          } else {
            signal.addEventListener('abort', onAbort, { once: true });
          }
        }
        actor.start();
      });
    },
  };
}
