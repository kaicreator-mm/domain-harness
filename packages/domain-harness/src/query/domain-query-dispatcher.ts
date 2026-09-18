import type { JsonValue } from '../contracts/json.js';
import type { DomainQuery, DomainQueryResult } from '../v2/contracts/query.js';
import type { ProjectionSnapshot } from '../v2/contracts/projection.js';
import type { RuntimeStore } from '../v2/contracts/store.js';

export interface ProjectionQueryReader {
  read(request: { projectionId: string; key: string; input?: JsonValue }): Promise<ProjectionSnapshot>;
}

export interface DomainQueryDispatcherOptions {
  store: Pick<RuntimeStore, 'getInstance' | 'getMessageDisposition' | 'listPinnedPackageIds'>;
  projection: ProjectionQueryReader;
}

/** Read-side dispatcher for the five frozen v0.2 DomainQuery variants. */
export class DomainQueryDispatcher {
  constructor(private readonly options: DomainQueryDispatcherOptions) {}

  async query(request: DomainQuery): Promise<DomainQueryResult> {
    switch (request.kind) {
      case 'instance':
        return {
          kind: 'instance',
          value: await this.options.store.getInstance(request.target),
        };

      case 'message-disposition':
        return {
          kind: 'message-disposition',
          value: await this.options.store.getMessageDisposition(request.target, request.messageId),
        };

      case 'runtime-failure': {
        const instance = await this.options.store.getInstance(request.target);
        return {
          kind: 'runtime-failure',
          value: instance?.failure ?? null,
        };
      }

      case 'package-pins':
        return {
          kind: 'package-pins',
          value: [...await this.options.store.listPinnedPackageIds()].sort(),
        };

      case 'projection': {
        const projectionRequest = request.input === undefined
          ? { projectionId: request.projectionId, key: request.key }
          : { projectionId: request.projectionId, key: request.key, input: request.input };
        return {
          kind: 'projection',
          value: await this.options.projection.read(projectionRequest),
        };
      }

      default:
        return assertNever(request);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported DomainQuery kind: ${String((value as { kind?: unknown }).kind)}`);
}
