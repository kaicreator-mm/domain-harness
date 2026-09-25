import type { RuntimeEvidencePort, RuntimeEvidenceRecord } from '../contracts/runtime-evidence.js';
/**
 * Volatile reference implementation of the append-only Runtime Evidence
 * port. Same evidenceId with byte-identical content is idempotent; different
 * content under an existing id is a fail-closed conflict. Host durability
 * truth belongs to the T-022/T-023 host persistence tasks.
 */
export declare class VolatileRuntimeEvidenceStore implements RuntimeEvidencePort {
    #private;
    append(record: RuntimeEvidenceRecord): Promise<void>;
    /** Inspection surface for tests/review tooling; not part of the runtime port. */
    records(): readonly RuntimeEvidenceRecord[];
}
//# sourceMappingURL=store.d.ts.map