import { RuntimeEvidenceIntegrationError } from '@kaicreator/domain-harness';
import type {
  RuntimeEvidencePort,
  RuntimeEvidenceRecord,
} from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import { canonicalText, decodeJson, type AuthoritySqliteDatabase } from './authority-shared.js';

interface EvidenceRow {
  record_json: string;
}

/**
 * T-022 Node SQLite adapter for the T-005 append-only Runtime Evidence port.
 * Semantics mirror the volatile reference exactly: same evidenceId with
 * byte-identical canonical content is idempotent; different content under an
 * existing id is a fail-closed RUNTIME_EVIDENCE_APPEND_CONFLICT.
 */
export class NodeSqliteRuntimeEvidenceStore implements RuntimeEvidencePort {
  readonly #db: AuthoritySqliteDatabase;

  constructor(db: AuthoritySqliteDatabase) {
    this.#db = db;
  }

  async append(record: RuntimeEvidenceRecord): Promise<void> {
    const encoded = canonicalText(record as unknown as JsonValue, 'runtime evidence record');
    const transaction = this.#db.transaction(() => {
      const existing = this.#db.prepare(`
        SELECT record_json FROM dh_v3_runtime_evidence WHERE evidence_id = ?
      `).get(record.evidenceId) as EvidenceRow | undefined;
      if (existing !== undefined) {
        if (existing.record_json !== encoded) {
          throw new RuntimeEvidenceIntegrationError(
            'RUNTIME_EVIDENCE_APPEND_CONFLICT',
            `Runtime Evidence id ${record.evidenceId} already exists with different content`,
          );
        }
        return;
      }
      this.#db.prepare(`
        INSERT INTO dh_v3_runtime_evidence (evidence_id, record_json) VALUES (?, ?)
      `).run(record.evidenceId, encoded);
    });
    transaction.immediate();
  }

  /** Inspection surface for tests/review tooling; not part of the runtime port. */
  records(): readonly RuntimeEvidenceRecord[] {
    const rows = this.#db.prepare(`
      SELECT record_json FROM dh_v3_runtime_evidence ORDER BY evidence_id
    `).all() as EvidenceRow[];
    return rows.map((row) => decodeJson<RuntimeEvidenceRecord>(row.record_json, 'runtime evidence record'));
  }
}
