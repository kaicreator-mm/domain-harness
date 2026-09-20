/**
 * Remaining simulated ports:
 * - SimDomainDataPort: CompiledDomainDataPort over `domain-data/*.json`,
 *   pinned by the pack's packageId(s) — the G1 out-of-band workaround the
 *   contract drafts document (the compiled manifest has no domainData field).
 * - SimAiPort: deterministic AIOperationPort keyed by skillId
 *   (`ai-responses.json`) — v0.3 PRD §26.3 deterministic fake AI; counts
 *   invocations so scenarios can assert replay reuse.
 * - createSimTransport: in-process RemoteTransportPort registered under
 *   `http-transport@1`, dispatching `remote-http-json@1` Tool bindings to
 *   pack handler modules by logical path. This is the documented
 *   PRD-CR-1/G3 interim workaround: registered/local project Tools
 *   disguised as remote bindings. The frozen RemoteTransportRequest carries
 *   no effect context (no idempotencyKey) — every invocation records that
 *   fact as L2-4 finding evidence.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import type { AIOperationPort, AIOperationRequest } from '../../../packages/domain-harness/src/contracts/ai.js';
import type { JsonValue } from '../../../packages/domain-harness/src/contracts/json.js';
import type { RemoteTransportPort } from '../../../packages/domain-harness/src/v2/contracts/host.js';
import type { CompiledDomainDataPort } from '../../../packages/domain-harness/src/projection/compiled-domain-data.js';
import type { Clock } from './host.js';
import type { SimBusinessStore } from './business-store.js';

export class SimDomainDataPort implements CompiledDomainDataPort {
  readonly lookups: Array<{ packageId: string; key: string; hit: boolean }> = [];

  constructor(
    private readonly entries: Readonly<Record<string, JsonValue>>,
    private readonly packageIds: ReadonlySet<string>,
  ) {}

  get(packageId: string, key: string): JsonValue | undefined {
    if (!this.packageIds.has(packageId)) {
      this.lookups.push({ packageId, key, hit: false });
      return undefined;
    }
    const value = this.entries[key];
    this.lookups.push({ packageId, key, hit: value !== undefined });
    return value === undefined ? undefined : structuredClone(value);
  }
}

export interface SimAiResponse {
  output: JsonValue;
}

export class SimAiPort implements AIOperationPort {
  readonly calls: AIOperationRequest[] = [];

  constructor(private readonly responses: Readonly<Record<string, SimAiResponse>>) {}

  async execute(request: AIOperationRequest): Promise<JsonValue> {
    this.calls.push(request);
    const response = this.responses[request.skillId];
    if (response === undefined) {
      throw new Error('sim_ai_unconfigured: no deterministic response for skill ' + request.skillId);
    }
    return structuredClone(response.output);
  }

  callCount(skillId?: string): number {
    return skillId === undefined
      ? this.calls.length
      : this.calls.filter((call) => call.skillId === skillId).length;
  }
}

export interface SimToolContext {
  resourceKey: string;
  path: string;
  bindingId: string;
  now: string;
  plus(seconds: number): string;
}

export interface SimToolResources {
  business: SimBusinessStore;
  domainData: Record<string, JsonValue>;
  clock: Clock;
}

export type SimToolHandler = (
  input: Record<string, unknown>,
  ctx: SimToolContext,
  resources: SimToolResources,
) => Promise<JsonValue> | JsonValue;

export interface TransportInvocation {
  path: string;
  resourceKey: string;
  bindingId: string;
  input: JsonValue;
  /** Evidence for L2-4: the frozen RemoteTransportRequest has no context field. */
  carriedIdempotencyKey: undefined;
}

export interface SimTransport {
  port: RemoteTransportPort;
  invocations: TransportInvocation[];
}

export async function createSimTransport(options: {
    packDir: string;
    handlerModules: Readonly<Record<string, string>>;
    business: SimBusinessStore;
    domainData: Record<string, JsonValue>;
    clock: Clock;
  }): Promise<SimTransport> {
  const handlers = new Map<string, SimToolHandler>();
  for (const [path, modulePath] of Object.entries(options.handlerModules)) {
    const loaded = await import(pathToFileURL(join(options.packDir, modulePath)).href) as {
      default?: SimToolHandler;
    };
    if (typeof loaded.default !== 'function') {
      throw new Error('tool handler ' + modulePath + ' must export a default function');
    }
    handlers.set(path, loaded.default);
  }

  const invocations: TransportInvocation[] = [];
  const port: RemoteTransportPort = {
    async execute(request) {
      const config = (request.binding.config ?? {}) as Record<string, unknown>;
      const path = typeof config.path === 'string' ? config.path : undefined;
      if (path === undefined) {
        throw new Error('sim transport requires a logical binding config.path');
      }
      const handler = handlers.get(path);
      if (handler === undefined) {
        throw new Error('sim transport has no handler for path ' + path);
      }
      invocations.push({
        path,
        resourceKey: request.resourceKey,
        bindingId: request.binding.bindingId,
        input: structuredClone(request.input),
        carriedIdempotencyKey: undefined,
      });
      const ctx: SimToolContext = {
        resourceKey: request.resourceKey,
        path,
        bindingId: request.binding.bindingId,
        now: options.clock.now(),
        plus: (seconds: number) => options.clock.plus(seconds),
      };
      return handler(
        request.input as Record<string, unknown>,
        ctx,
        { business: options.business, domainData: options.domainData, clock: options.clock },
      );
    },
  };
  return { port, invocations };
}
