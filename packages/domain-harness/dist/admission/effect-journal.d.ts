import type { JsonValue } from '../contracts/json.js';
import { type AdmissionDurableEffectJournal, type AdmissionEffectJournalRecord } from './contracts.js';
/**
 * Portable deterministic logical-reference effect journal. It mirrors the
 * frozen re-begin/complete semantics so host adapters can be parity-tested; it
 * makes no host durability claim (T-022/T-023 own real durability proof).
 */
export declare class VolatileAdmissionEffectJournal implements AdmissionDurableEffectJournal {
    private readonly records;
    getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null>;
    beginEffect(record: AdmissionEffectJournalRecord): Promise<{
        readonly disposition: 'created' | 'existing';
        readonly record: AdmissionEffectJournalRecord;
    }>;
    completeEffect(effectId: string, outcome: {
        readonly status: 'completed';
        readonly output: JsonValue;
        readonly completedAt: string;
    } | {
        readonly status: 'failed';
        readonly error: JsonValue;
        readonly completedAt: string;
    }): Promise<AdmissionEffectJournalRecord>;
    getRecords(): readonly AdmissionEffectJournalRecord[];
}
//# sourceMappingURL=effect-journal.d.ts.map