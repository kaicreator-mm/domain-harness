import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { CompletedDomainMessageEffectResult, JournaledDomainMessageEffectOptions, RunDomainMessageEffectRequest } from './contracts.js';
export declare class InvalidDomainMessageEffectError extends Error {
    constructor(message: string);
}
export declare class RetryableDomainMessageEffectError extends Error {
    readonly effectId: string;
    readonly attempt: number;
    constructor(effectId: string, attempt: number, cause: unknown);
}
export declare class JournaledDomainMessageEffectFailureError extends Error {
    readonly effectId: string;
    readonly journal: EffectJournalRecord;
    constructor(journal: EffectJournalRecord);
}
export declare class DomainMessageEffectJournalInvariantError extends Error {
    constructor(message: string);
}
export declare function serializeChildMessageIdentity(effectId: string): string;
export declare function deriveChildMessageId(sha256: Sha256Port, effectId: string): Promise<string>;
export declare class JournaledDomainMessageEffect {
    #private;
    constructor(options: JournaledDomainMessageEffectOptions);
    run(request: RunDomainMessageEffectRequest): Promise<CompletedDomainMessageEffectResult>;
}
//# sourceMappingURL=journaled-domain-message-effect.d.ts.map