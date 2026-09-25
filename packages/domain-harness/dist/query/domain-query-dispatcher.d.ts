import type { JsonValue } from '../contracts/json.js';
import type { DomainQuery, DomainQueryResult } from '../v2/contracts/query.js';
import type { ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
export interface ProjectionQueryReader {
    read(request: {
        projectionId: string;
        key: string;
        input?: JsonValue;
    }): Promise<ProjectionSnapshot>;
}
export interface DomainQueryDispatcherOptions {
    store: Pick<RuntimeStore, 'getInstance' | 'getMessageDisposition' | 'listPinnedPackageIds'>;
    projection: ProjectionQueryReader;
}
/** Read-side dispatcher for the five frozen v0.2 DomainQuery variants. */
export declare class DomainQueryDispatcher {
    private readonly options;
    constructor(options: DomainQueryDispatcherOptions);
    query(request: DomainQuery): Promise<DomainQueryResult>;
}
//# sourceMappingURL=domain-query-dispatcher.d.ts.map