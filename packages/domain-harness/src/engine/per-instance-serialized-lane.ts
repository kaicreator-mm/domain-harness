import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { workflowAddressKey } from '../instance/workflow-address.js';

/**
 * Portable keyed scheduler: work for the same WorkflowAddress is chained, while
 * distinct addresses have independent promise tails and can progress concurrently.
 */
export class PerInstanceSerializedLane {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(address: WorkflowAddress, operation: () => Promise<T> | T): Promise<T> {
    const key = workflowAddressKey(address);
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );

    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    return result;
  }
}
