import type { JsonObject, JsonValue } from '../contracts/json.js';
import { SchemaValidator } from '../execution/schema-validator.js';
import type { ExpressionExecutorPort, Sha256Port } from '../v2/contracts/host.js';
import type {
  CompiledProjectionDescriptor,
  PackageRegistry,
  ProjectionDependencyDescriptor,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import type {
  BusinessSnapshot,
  BusinessSnapshotPort,
  ProjectionSnapshot,
  WorkflowProjectionInput,
} from '../v2/contracts/projection.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';

const PROJECTION_LOGICAL_TIME = '1970-01-01T00:00:00.000Z';

export type ProjectionErrorCode =
  | 'package_not_found'
  | 'projection_not_found'
  | 'invalid_selector'
  | 'workflow_source_missing'
  | 'business_snapshot_port_missing'
  | 'business_snapshot_mismatch'
  | 'unsupported_dependency'
  | 'evaluation_failed'
  | 'invalid_output';

export class ProjectionError extends Error {
  constructor(
    readonly code: ProjectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectionError';
  }
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
  expression: ExpressionExecutorPort;
  sha256: Sha256Port;
}

/**
 * Executes frozen v0.2 projections over declared snapshots only.
 *
 * BusinessSnapshotPort I/O occurs while assembling the snapshot. The expression
 * executor receives only portable JSON and therefore has no Tool, Skill,
 * Runtime Resource, transport, or authoritative-data handle to call through.
 */
export class ProjectionService {
  private readonly validator = new SchemaValidator();

  constructor(private readonly options: ProjectionServiceOptions) {}

  async read(request: ProjectionReadRequest): Promise<ProjectionSnapshot> {
    assertNonEmpty(request.projectionId, 'projectionId');
    assertNonEmpty(request.key, 'projection key');

    const compiledPackage = this.resolvePackage();
    const descriptor = compiledPackage.manifest.projections[request.projectionId];
    if (!descriptor) {
      throw new ProjectionError(
        'projection_not_found',
        `Projection ${request.projectionId} does not exist in package ${compiledPackage.manifest.packageId}`,
      );
    }

    const assembled = await this.assembleDeclaredSnapshots(descriptor, request.key);
    const projectionInput: JsonObject = {
      key: request.key,
      input: request.input ?? null,
      workflows: assembled.workflowSources.map((source) => ({
        address: {
          workflowId: source.address.workflowId,
          instanceKey: source.address.instanceKey,
        },
        stateRevision: source.stateRevision,
        state: source.state,
      })),
      business: assembled.businessSnapshots.map((source) => ({
        source: source.source,
        key: source.key,
        revision: source.revision,
        value: source.value,
      })),
    };

    let evaluated: JsonValue;
    try {
      evaluated = await this.options.expression.evaluate({
        expression: descriptor.expression,
        input: projectionInput,
        logicalTime: PROJECTION_LOGICAL_TIME,
      });
    } catch (error) {
      throw new ProjectionError(
        'evaluation_failed',
        `Projection ${descriptor.projectionId} evaluation failed`,
        { cause: error },
      );
    }

    let value: JsonValue;
    try {
      value = this.validator.validate(
        descriptor.outputSchema,
        evaluated,
        'invalid_output',
        `Projection ${descriptor.projectionId} output`,
      );
    } catch (error) {
      throw new ProjectionError(
        'invalid_output',
        `Projection ${descriptor.projectionId} produced invalid output`,
        { cause: error },
      );
    }

    const revision = await this.options.sha256.digestUtf8(
      JSON.stringify({
        packageId: compiledPackage.manifest.packageId,
        projectionId: descriptor.projectionId,
        workflows: assembled.workflowSources.map((source) => ({
          workflowId: source.address.workflowId,
          instanceKey: source.address.instanceKey,
          stateRevision: source.stateRevision,
        })),
        business: assembled.businessSnapshots.map((source) => ({
          source: source.source,
          key: source.key,
          revision: source.revision,
        })),
      }),
    );

    return {
      projectionId: descriptor.projectionId,
      key: request.key,
      packageId: compiledPackage.manifest.packageId,
      revision,
      value,
      workflowSources: assembled.workflowSources,
      businessSources: assembled.businessSnapshots.map(({ source, key, revision: sourceRevision }) => ({
        source,
        key,
        revision: sourceRevision,
      })),
    };
  }

  private resolvePackage(): TargetCompiledDomainPackage {
    const packageId = this.options.packageRegistry.defaultPackageId;
    const compiledPackage = this.options.packageRegistry.get(packageId);
    if (!compiledPackage) {
      throw new ProjectionError(
        'package_not_found',
        `Default compiled package ${packageId} is not available`,
      );
    }
    return compiledPackage;
  }

  private async assembleDeclaredSnapshots(
    descriptor: CompiledProjectionDescriptor,
    key: string,
  ): Promise<{
    workflowSources: WorkflowProjectionInput[];
    businessSnapshots: BusinessSnapshot[];
  }> {
    const workflowSources: WorkflowProjectionInput[] = [];
    const businessSnapshots: BusinessSnapshot[] = [];

    for (const dependency of descriptor.dependencies) {
      await this.assembleDependency(dependency, key, workflowSources, businessSnapshots);
    }

    return { workflowSources, businessSnapshots };
  }

  private async assembleDependency(
    dependency: ProjectionDependencyDescriptor,
    key: string,
    workflowSources: WorkflowProjectionInput[],
    businessSnapshots: BusinessSnapshot[],
  ): Promise<void> {
    if (dependency.kind === 'workflow') {
      const target = resolveWorkflowSelector(dependency.selector, key);
      const snapshot = await this.options.store.getInstance(target);
      if (!snapshot) {
        throw new ProjectionError(
          'workflow_source_missing',
          `Projection workflow source ${target.workflowId}/${target.instanceKey} does not exist`,
        );
      }
      workflowSources.push({
        address: snapshot.address,
        stateRevision: snapshot.stateRevision,
        state: snapshot.state,
      });
      return;
    }

    if (dependency.kind === 'business') {
      if (!this.options.businessSnapshots) {
        throw new ProjectionError(
          'business_snapshot_port_missing',
          `Projection requires business source ${dependency.source}, but no BusinessSnapshotPort is configured`,
        );
      }
      assertNonEmpty(dependency.source, 'business source');
      const businessKey = resolveBusinessSelector(dependency.selector, key);
      const snapshot = await this.options.businessSnapshots.read({
        source: dependency.source,
        key: businessKey,
      });
      if (snapshot.source !== dependency.source || snapshot.key !== businessKey) {
        throw new ProjectionError(
          'business_snapshot_mismatch',
          `Business snapshot identity mismatch for ${dependency.source}/${businessKey}`,
        );
      }
      assertNonEmpty(snapshot.revision, 'business snapshot revision');
      businessSnapshots.push(snapshot);
      return;
    }

    throw new ProjectionError(
      'unsupported_dependency',
      `Projection dependency ${dependency.kind} is outside the T-014 Workflow/Business snapshot boundary`,
    );
  }
}

function resolveWorkflowSelector(selector: JsonObject, queryKey: string): WorkflowAddress {
  assertSelectorKeys(selector, ['workflowId', 'instanceKey']);
  const workflowId = selector.workflowId;
  if (typeof workflowId !== 'string' || workflowId.length === 0) {
    throw new ProjectionError('invalid_selector', 'Workflow projection selector requires workflowId');
  }
  const selectedInstanceKey = selector.instanceKey;
  if (selectedInstanceKey !== undefined && (typeof selectedInstanceKey !== 'string' || selectedInstanceKey.length === 0)) {
    throw new ProjectionError('invalid_selector', 'Workflow projection selector instanceKey must be a non-empty string');
  }
  return {
    workflowId,
    instanceKey: typeof selectedInstanceKey === 'string' ? selectedInstanceKey : queryKey,
  };
}

function resolveBusinessSelector(selector: JsonObject, queryKey: string): string {
  assertSelectorKeys(selector, ['key']);
  const selectedKey = selector.key;
  if (selectedKey !== undefined && (typeof selectedKey !== 'string' || selectedKey.length === 0)) {
    throw new ProjectionError('invalid_selector', 'Business projection selector key must be a non-empty string');
  }
  return typeof selectedKey === 'string' ? selectedKey : queryKey;
}

function assertSelectorKeys(selector: JsonObject, allowed: readonly string[]): void {
  const unsupported = Object.keys(selector).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    throw new ProjectionError(
      'invalid_selector',
      `Projection selector contains unsupported query behavior: ${unsupported.join(', ')}`,
    );
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.length === 0) {
    throw new ProjectionError('invalid_selector', `${label} must be a non-empty string`);
  }
}
