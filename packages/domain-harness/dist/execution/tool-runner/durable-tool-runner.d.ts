import type { JsonValue } from '../../contracts/json.js';
import type { EffectJournalRecord, ToolExecutorPort } from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { CompiledToolDescriptor } from '../../v2/contracts/package.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';
import { type EffectIdentitySeed } from '../journal/effect-identity.js';
export type EffectJournalStore = Pick<RuntimeStore, 'getEffect' | 'beginEffect' | 'completeEffect'>;
export interface DurableToolRunnerOptions {
    store: EffectJournalStore;
    sha256: Sha256Port;
    now?: () => string;
}
export interface RunToolEffectRequest extends EffectIdentitySeed {
    descriptor: CompiledToolDescriptor;
    input: JsonValue;
    logicalTime: string;
    executor: ToolExecutorPort;
    signal?: AbortSignal;
}
export interface CompletedToolEffectResult {
    status: 'completed';
    effectId: string;
    output: JsonValue;
    attempt: number;
    replayed: boolean;
    journal: EffectJournalRecord;
}
export interface RecoveryRequiredToolEffectResult {
    status: 'recovery_required';
    effectId: string;
    reason: 'ambiguous-non-idempotent';
    attempt: number;
    journal: EffectJournalRecord;
}
export type ToolEffectRunResult = CompletedToolEffectResult | RecoveryRequiredToolEffectResult;
export declare class RetryableToolExecutionError extends Error {
    readonly effectId: string;
    readonly attempt: number;
    constructor(effectId: string, attempt: number, cause: unknown);
}
export declare class JournaledToolFailureError extends Error {
    readonly effectId: string;
    readonly journal: EffectJournalRecord;
    constructor(journal: EffectJournalRecord);
}
export declare class DurableToolRunner {
    #private;
    constructor(options: DurableToolRunnerOptions);
    run(request: RunToolEffectRequest): Promise<ToolEffectRunResult>;
}
//# sourceMappingURL=durable-tool-runner.d.ts.map