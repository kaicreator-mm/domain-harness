import { canonicalJsonStringify } from '../contracts/identity.js';
import { RuntimeEvidenceIntegrationError } from './contracts.js';
function clone(record) {
    return JSON.parse(canonicalJsonStringify(record));
}
/**
 * Volatile reference implementation of the append-only Runtime Evidence
 * port. Same evidenceId with byte-identical content is idempotent; different
 * content under an existing id is a fail-closed conflict. Host durability
 * truth belongs to the T-022/T-023 host persistence tasks.
 */
export class VolatileRuntimeEvidenceStore {
    #records = new Map();
    async append(record) {
        const existing = this.#records.get(record.evidenceId);
        if (existing !== undefined) {
            if (canonicalJsonStringify(existing) !== canonicalJsonStringify(record)) {
                throw new RuntimeEvidenceIntegrationError('RUNTIME_EVIDENCE_APPEND_CONFLICT', `Runtime Evidence id ${record.evidenceId} already exists with different content`);
            }
            return;
        }
        this.#records.set(record.evidenceId, clone(record));
    }
    /** Inspection surface for tests/review tooling; not part of the runtime port. */
    records() {
        return [...this.#records.keys()].sort().map((id) => clone(this.#records.get(id)));
    }
}
//# sourceMappingURL=store.js.map