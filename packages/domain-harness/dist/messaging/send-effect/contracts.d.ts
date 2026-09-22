import type { JsonValue } from '../../contracts/json.js';
import type { EffectIdentitySeed } from '../../execution/journal/effect-identity.js';
import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';
import type { WorkflowAddress } from '../../v2/contracts/workflow.js';
import type { DomainMessageAcceptanceBoundary } from '../contracts/message-acceptance.js';
/**
 * Frozen L2 semantic form for a Runtime-owned Workflow-to-Workflow message effect.
 * Target/payload expression evaluation belongs to the surrounding workflow runtime;
 * this task owns only durable same-runtime delivery after those values are resolved.
 */
export interface SendDomainMessageEffect {
    kind: 'domain-message';
    targetExpression: string;
    messageType: string;
    payloadExpression?: string;
    contractVersion?: string;
}
export type DomainMessageEffectJournalStore = Pick<RuntimeStore, 'getEffect' | 'beginEffect' | 'completeEffect'>;
export interface JournaledDomainMessageEffectOptions {
    readonly store: DomainMessageEffectJournalStore;
    readonly acceptance: DomainMessageAcceptanceBoundary;
    readonly sha256: Sha256Port;
    readonly now?: () => string;
}
export interface RunDomainMessageEffectRequest {
    /** Identity of the source Workflow turn/step that owns this effect. */
    readonly source: EffectIdentitySeed;
    readonly effect: SendDomainMessageEffect;
    /** Deterministically resolved target from effect.targetExpression. */
    readonly resolvedTarget: WorkflowAddress;
    /** Deterministically resolved payload from effect.payloadExpression, or the caller's frozen default. */
    readonly payload: JsonValue;
    /** Current source message correlation identity, propagated per frozen L2. */
    readonly correlationId: string;
}
export interface CompletedDomainMessageEffectResult {
    readonly status: 'completed';
    readonly effectId: string;
    readonly messageId: string;
    readonly ack: MessageAcceptedAck;
    readonly attempt: number;
    readonly replayed: boolean;
    readonly journal: EffectJournalRecord;
}
//# sourceMappingURL=contracts.d.ts.map