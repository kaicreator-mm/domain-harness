import type { JsonValue } from '../../contracts/json.js';
import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { ToolEffectSemantics } from '../../v2/contracts/package.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';
export interface ExpectedEffectJournalIdentity {
    effectId: string;
    target: WorkflowAddress;
    sourceMessageId: string;
    effectKind: string;
    effectSemantics: ToolEffectSemantics;
    input: JsonValue;
}
export declare class EffectJournalConflictError extends Error {
    constructor(message: string);
}
export declare class EffectJournalInvariantError extends Error {
    constructor(message: string);
}
export declare function canonicalJson(value: JsonValue): string;
export declare function assertCompatibleEffectRecord(record: EffectJournalRecord, expected: ExpectedEffectJournalIdentity): void;
//# sourceMappingURL=effect-journal.d.ts.map