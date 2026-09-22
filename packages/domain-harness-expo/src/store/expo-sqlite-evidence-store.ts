import { RuntimeEvidenceIntegrationError } from '@kaicreator/domain-harness';
import type {
  RuntimeEvidencePort,
  RuntimeEvidenceRecord,
} from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import type { ExclusiveTransactionQueue } from './exclusive-transaction.js';
import type { ExpoSqliteExecutorLike } from './expo-sqlite-types.js';
import { canonicalText, decodeJson } from './authority-shared.js';

interface EvidenceRow {
  record_json: string;
}

/**
 * T-023 Expo SQLite adapter for the T-005 append-only Runtime Evidence port.
 * Semantics mirror the volatile reference and the T-022 Node adapter exactly:
 * same evidenceId with byte-identical canonical content is idempotent;
 * different content under an existing id is a fail-closed
 * RUNTIME_EVIDENCE_APPEND_CONFLICT.
 */
export class ExpoSqliteRuntimeEvidenceStore implements RuntimeEvidencePort {
  readonly #database: ExpoSqliteExecutorLike;
  readonly #writes: ExclusiveTransactionQueue;

  public constructor(database: ExpoSqliteExecutorLike, writes: ExclusiveTransactionQueue) {
    this.#database = database;
    this.#writes = writes;
  }

  async append(record: RuntimeEvidenceRecord): Promise<void> {
    const encoded = canonicalText(record as unknown as JsonValue, 'runtime evidence record');
    await this.#writes.run(async (transaction) => {
      const existing = await transaction.getFirstAsync<EvidenceRow>(
        `SELECT record_json FROM dh_v3_runtime_evidence WHERE evidence_id = ?`,
        [record.evidenceId],
      );
      if (existing !== null) {
        if (existing.record_json !== encoded) {
          throw new RuntimeEvidenceIntegrationError(
            'RUNTIME_EVIDENCE_APPEND_CONFLICT',
            `Runtime Evidence id ${record.evidenceId} already exists with different content`,
          );
        }
        return;
      }
      await transaction.runAsync(
        `INSERT INTO dh_v3_runtime_evidence (evidence_id, record_json) VALUES (?, ?)`,
        [record.evidenceId, encoded],
      );
    });
  }

  /** Inspection surface for tests/review tooling; not part of the runtime port. */
  async records(): Promise<readonly RuntimeEvidenceRecord[]> {
    const rows = await this.#database.getAllAsync<EvidenceRow>(
      `SELECT record_json FROM dh_v3_runtime_evidence ORDER BY evidence_id`,
    );
    return rows.map((row) => decodeJson<RuntimeEvidenceRecord>(row.record_json, 'runtime evidence record'));
  }
}
