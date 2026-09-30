import type { EffectJournalRecord } from '../../v2/contracts/effect.js';
import type { Sha256Port } from '../../v2/contracts/host.js';
import type { MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { WorkflowSendAcceptanceBoundary, WorkflowSendPermanentRejection } from '../contracts/workflow-send-acceptance.js';
import type { DomainMessageEffectJournalStore, RunDomainMessageEffectRequest } from './contracts.js';
export type DurableWorkflowSendOutcome = {
    readonly status: 'accepted';
    readonly ack: MessageAcceptedAck;
} | {
    readonly status: 'rejected';
    readonly rejection: WorkflowSendPermanentRejection;
};
export interface SuccessorJournaledDomainMessageEffectOptions {
    readonly store: DomainMessageEffectJournalStore;
    readonly acceptance: WorkflowSendAcceptanceBoundary;
    readonly sha256: Sha256Port;
    readonly now?: () => string;
}
export type RunSuccessorDomainMessageEffectRequest = RunDomainMessageEffectRequest;
export interface CompletedSuccessorDomainMessageEffectResult {
    readonly status: 'completed';
    readonly effectId: string;
    readonly messageId: string;
    readonly outcome: DurableWorkflowSendOutcome;
    readonly attempt: number;
    readonly replayed: boolean;
    readonly journal: EffectJournalRecord;
}
//# sourceMappingURL=successor-contracts.d.ts.map