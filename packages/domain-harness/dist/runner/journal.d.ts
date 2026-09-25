import type { JsonValue } from '../contracts/json.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StepIdentity, StoredStep } from '../persistence/types.js';
export declare function deriveIdempotencyKey(identity: StepIdentity): string;
/**
 * Frozen L2 semantics define maxSteps as Run-wide logical journal identities.
 * Accepted waiting-event visits count exactly like executable Step visits.
 * Recovery attempts reuse the same identity and therefore do not increase this count.
 */
export declare function countExecutableSteps(store: SqliteStore, runId: string): number;
export declare function incrementStartedAttempt(store: SqliteStore, identity: StepIdentity): StoredStep;
export declare function latestCompletedOutputs(store: SqliteStore, runId: string, workflowInstanceId: string): Record<string, JsonValue>;
export declare function latestFrameError(store: SqliteStore, runId: string, workflowInstanceId: string): StoredStep['error'] | undefined;
//# sourceMappingURL=journal.d.ts.map