import type { JsonValue } from '../contracts/json.js';
import type { CompiledDomainDataPort } from './compiled-domain-data.js';
import type { ExpressionExecutorPort, Sha256Port } from '../v2/contracts/host.js';
import type { PackageRegistry } from '../v2/contracts/package.js';
import type { BusinessSnapshotPort, ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
export type ProjectionErrorCode = 'package_not_found' | 'projection_not_found' | 'invalid_selector' | 'workflow_source_missing' | 'business_snapshot_port_missing' | 'business_snapshot_mismatch' | 'domain_data_port_missing' | 'domain_data_not_found' | 'unsupported_dependency' | 'evaluation_failed' | 'invalid_output';
export declare class ProjectionError extends Error {
    readonly code: ProjectionErrorCode;
    constructor(code: ProjectionErrorCode, message: string, options?: ErrorOptions);
}
export interface ProjectionReadRequest {
    projectionId: string;
    key: string;
    input?: JsonValue;
}
export interface ProjectionServiceOptions {
    packageRegistry: PackageRegistry;
    store: Pick<RuntimeStore, 'getInstance'>;
    businessSnapshots?: BusinessSnapshotPort;
    domainData?: CompiledDomainDataPort;
    expression: ExpressionExecutorPort;
    sha256: Sha256Port;
}
/**
 * Executes frozen v0.2 projections over declared snapshots only.
 *
 * BusinessSnapshotPort I/O occurs while assembling the snapshot. Compiled
 * Domain Data is immutable package content read through a synchronous
 * in-memory lookup. The expression executor receives only portable JSON and
 * therefore has no Tool, Skill, Runtime Resource, transport, or
 * authoritative-data handle to call through.
 */
export declare class ProjectionService {
    private readonly options;
    private readonly validator;
    constructor(options: ProjectionServiceOptions);
    read(request: ProjectionReadRequest): Promise<ProjectionSnapshot>;
    private resolvePackage;
    private assembleDeclaredSnapshots;
    private assembleDependency;
}
//# sourceMappingURL=projection-service.d.ts.map