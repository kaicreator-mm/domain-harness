import { createHash } from 'node:crypto';

import type { JsonValue } from '../contracts/json.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StepIdentity, StoredStep } from '../persistence/types.js';

export function deriveIdempotencyKey(identity: StepIdentity): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([
      identity.runId,
      identity.workflowInstanceId,
      identity.stateId,
      identity.visit,
    ]))
    .digest('hex');
  return `dh:v0.1:${digest}`;
}

/**
 * Frozen L2 semantics define maxSteps as Run-wide logical journal identities.
 * Accepted waiting-event visits count exactly like executable Step visits.
 * Recovery attempts reuse the same identity and therefore do not increase this count.
 */
export function countExecutableSteps(store: SqliteStore, runId: string): number {
  return store.listSteps(runId).length;
}

export function incrementStartedAttempt(store: SqliteStore, identity: StepIdentity): StoredStep {
  return store.transaction(() => {
    const result = store.db.prepare(`
      UPDATE steps
      SET attempt = attempt + 1
      WHERE run_id = @runId
        AND workflow_instance_id = @workflowInstanceId
        AND state_id = @stateId
        AND visit = @visit
        AND status = 'started'
    `).run(identity);
    if (result.changes !== 1) {
      throw new Error('cannot increment attempt for a non-started Step');
    }
    const step = store.getStep(identity);
    if (!step) throw new Error('Step disappeared after attempt increment');
    return step;
  });
}

export function latestCompletedOutputs(
  store: SqliteStore,
  runId: string,
  workflowInstanceId: string,
): Record<string, JsonValue> {
  const latest = new Map<string, StoredStep>();
  for (const step of store.listSteps(runId)) {
    if (step.workflowInstanceId !== workflowInstanceId || step.status !== 'completed') continue;
    const prior = latest.get(step.stateId);
    if (!prior || step.visit > prior.visit) latest.set(step.stateId, step);
  }

  const outputs: Record<string, JsonValue> = {};
  for (const [stateId, step] of latest) {
    if (step.output !== undefined) outputs[stateId] = step.output as JsonValue;
  }
  return outputs;
}

export function latestFrameError(
  store: SqliteStore,
  runId: string,
  workflowInstanceId: string,
): StoredStep['error'] | undefined {
  let latest: StoredStep | undefined;
  // SqliteStore.listSteps is ordered by started_at ascending; keep the last
  // failed Step in this frame rather than comparing per-state visit counters.
  for (const step of store.listSteps(runId)) {
    if (step.workflowInstanceId !== workflowInstanceId || step.status !== 'failed' || !step.error) continue;
    latest = step;
  }
  return latest?.error;
}
