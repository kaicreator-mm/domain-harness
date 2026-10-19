import type { CasDocumentStore, CasPutConditions } from './cas.js';
export type V10MemoryOperation = 'put' | 'get' | 'search' | 'delete';
export interface V10MemoryScope {
    deployedAppId: string;
    tenantId: string;
    appId: string;
    businessPackageId: string;
    agentId: string;
    threadId: string;
}
export interface V10MemoryProvenance {
    source: string;
    recordedBy: string;
}
export interface V10MemoryRead {
    value: unknown;
    revision: number;
    provenance: V10MemoryProvenance;
    expiresAtMs: number | null;
}
export interface V10MemoryAuthRequest {
    operation: V10MemoryOperation;
    scope: V10MemoryScope;
    key: string;
}
export interface V10MemoryHost {
    store: CasDocumentStore;
    authorize: (request: V10MemoryAuthRequest) => boolean | Promise<boolean>;
    now?: () => number;
}
export declare class V10MemoryError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class V10ScopedMemoryCapability {
    #private;
    constructor(host: V10MemoryHost);
    put(input: {
        scope: V10MemoryScope;
        key: string;
        value: unknown;
        provenance: V10MemoryProvenance;
        expiresAtMs?: number | null;
        condition: CasPutConditions;
    }): Promise<{
        revision: number;
    }>;
    get(scope: V10MemoryScope, key: string): Promise<V10MemoryRead | null>;
    search(scope: V10MemoryScope, keyPrefix?: string, maxResults?: number): Promise<readonly ({
        key: string;
    } & V10MemoryRead)[]>;
    delete(scope: V10MemoryScope, key: string, revision: number): Promise<void>;
}
export declare function createV10ScopedMemory(host: V10MemoryHost): V10ScopedMemoryCapability;
//# sourceMappingURL=v010-scoped-memory.d.ts.map