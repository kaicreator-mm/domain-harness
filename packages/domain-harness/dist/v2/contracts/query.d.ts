import type { JsonValue } from '../../contracts/json.js';
import type { MessageDispositionSnapshot } from './message.js';
import type { ProjectionSnapshot } from './projection.js';
import type { RuntimeFailure, WorkflowAddress, WorkflowInstanceSnapshot } from './workflow.js';
export type DomainQuery = {
    kind: 'instance';
    target: WorkflowAddress;
} | {
    kind: 'message-disposition';
    target: WorkflowAddress;
    messageId: string;
} | {
    kind: 'runtime-failure';
    target: WorkflowAddress;
} | {
    kind: 'package-pins';
} | {
    kind: 'projection';
    projectionId: string;
    key: string;
    input?: JsonValue;
};
export type DomainQueryResult = {
    kind: 'instance';
    value: WorkflowInstanceSnapshot | null;
} | {
    kind: 'message-disposition';
    value: MessageDispositionSnapshot | null;
} | {
    kind: 'runtime-failure';
    value: RuntimeFailure | null;
} | {
    kind: 'package-pins';
    value: readonly string[];
} | {
    kind: 'projection';
    value: ProjectionSnapshot;
};
//# sourceMappingURL=query.d.ts.map