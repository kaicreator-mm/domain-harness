import type { WorkflowAddress } from './workflow.js';
export type DomainSubscription = {
    kind: 'instance';
    target: WorkflowAddress;
} | {
    kind: 'message';
    target: WorkflowAddress;
    messageId?: string;
} | {
    kind: 'projection';
    projectionId: string;
    key: string;
};
export interface DomainChange {
    kind: DomainSubscription['kind'];
    revision: string;
}
export type DomainChangeListener = (change: DomainChange) => void;
export type Unsubscribe = () => void;
export interface BusinessInvalidation {
    source: string;
    key: string;
}
//# sourceMappingURL=subscription.d.ts.map