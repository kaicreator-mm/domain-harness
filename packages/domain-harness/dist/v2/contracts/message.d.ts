import type { JsonValue } from '../../contracts/json.js';
import type { RuntimeFailure, WorkflowAddress } from './workflow.js';
export interface DomainMessage {
    messageId: string;
    target: WorkflowAddress;
    type: string;
    payload: JsonValue;
    correlationId?: string;
    causationId?: string;
    contractVersion?: string;
}
export interface MessageAcceptedAck {
    status: 'accepted' | 'duplicate';
    messageId: string;
    target: WorkflowAddress;
    targetSequence: number;
    packageId: string;
    acceptedAt: string;
}
export type MessageDisposition = 'accepted' | 'processing' | 'processed' | 'failed' | 'abandoned';
export interface MessageDispositionSnapshot {
    messageId: string;
    target: WorkflowAddress;
    targetSequence: number;
    packageId: string;
    disposition: MessageDisposition;
    correlationId: string;
    causationId?: string;
    failure?: RuntimeFailure;
    acceptedAt: string;
    processingAt?: string;
    resolvedAt?: string;
}
//# sourceMappingURL=message.d.ts.map