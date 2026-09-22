import { createActor } from 'xstate';
import { HarnessMachine } from '../harness/harness-machine.js';
/**
 * Production HarnessMachine runner: drives the merged bounded XState child
 * exactly once to its terminal output. Cancellation maps to the child's
 * cooperative CANCEL event; no timeout policy is invented here (execution
 * bounds live in the machine's maxSteps contract and the host's own signal).
 */
export function createXStateHarnessMachineRunner() {
    return {
        run(input, signal) {
            const actor = createActor(HarnessMachine, { input });
            return new Promise((resolve, reject) => {
                const onAbort = () => {
                    actor.send({ type: 'CANCEL' });
                };
                const subscription = actor.subscribe({
                    complete: () => {
                        if (signal !== undefined)
                            signal.removeEventListener('abort', onAbort);
                        const output = actor.getSnapshot().output;
                        if (output === undefined) {
                            reject(new Error('HarnessMachine reached a final state without output'));
                            return;
                        }
                        resolve(output);
                    },
                    error: (error) => {
                        if (signal !== undefined)
                            signal.removeEventListener('abort', onAbort);
                        reject(error instanceof Error ? error : new Error(String(error)));
                    },
                });
                void subscription;
                if (signal !== undefined) {
                    if (signal.aborted) {
                        actor.send({ type: 'CANCEL' });
                    }
                    else {
                        signal.addEventListener('abort', onAbort, { once: true });
                    }
                }
                actor.start();
            });
        },
    };
}
//# sourceMappingURL=harness-runner.js.map