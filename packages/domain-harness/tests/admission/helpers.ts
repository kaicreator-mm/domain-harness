import { createHash } from 'node:crypto';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import type { CompiledArtifactIdentity } from '../../src/contracts/domain-data.js';
import type {
  DecisionResolverSource,
  ResolvedDecision,
} from '../../src/decision-resolver/index.js';
import {
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type BindGovernanceExecutionPinResult,
  type DurableExecutionStore,
  type GovernanceBaselineBody,
  type GovernanceBaselineIdentity,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
} from '../../src/governance/index.js';
import {
  CentralAdmissionError,
  VolatileAdmissionEffectJournal,
  type AdmissionEffectToolBinding,
  type AdmissionEffectToolPort,
  type AdmissionEffectToolRequest,
  type CentralAdmissionPorts,
  type CentralAdmissionRequest,
} from '../../src/admission/index.js';
import type { ToolEffectSemantics } from '../../src/v2/contracts/package.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import type {
  DomainWorkflowDefinition,
  DomainWorkflowEffectIntent,
  DomainWorkflowState,
  DomainWorkflowTransition,
} from '../../src/workflow/index.js';
import type { DomainHardInvariantPredicate } from '../../src/workflow/index.js';

export const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'instance:42' };
export const workflowInstanceId = 'order-quote:instance:42';
export const NOW = '2026-09-21T07:00:00.000Z';

export const EFFECT_RESERVE: CompiledArtifactIdentity = {
  kind: 'tool',
  artifactId: 'effect:reserve',
  contentDigest: 'digest-effect:reserve',
};

/* ------------------------------------------------------------------------ */
/* Pinned governance baselines                                               */
/* ------------------------------------------------------------------------ */

/** Deny any proposed event whose payload.amount exceeds 100. */
export const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
} satisfies DomainHardInvariantPredicate;

export async function makeBaseline(
  version: string,
  hardInvariants: readonly JsonValue[] = [CAP_INVARIANT],
): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version,
    semantics: { hardInvariants: [...hardInvariants], operatorAuthority: version },
  }, sha256);
}

export class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(id: string): Promise<unknown> {
    return this.#pins.get(id);
  }

  async bindGovernanceExecutionPin(pin: GovernanceExecutionPin): Promise<BindGovernanceExecutionPinResult> {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }

  async getGovernanceBoundSnapshot(id: string): Promise<unknown> {
    return this.#snapshots.get(id);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }

  snapshotCount(): number {
    return this.#snapshots.size;
  }
}

/**
 * Memory baseline store with a getBody spy and an optional fixed body, for
 * pinned-authority and hostile-store fixtures.
 */
export class SpiedBaselineStore extends MemoryGovernanceBaselineStore {
  readonly getBodyCalls: GovernanceBaselineIdentity[] = [];
  fixedBody: GovernanceBaselineBody | undefined;

  override async getBody(
    identity: GovernanceBaselineIdentity,
  ): Promise<GovernanceBaselineBody | undefined> {
    this.getBodyCalls.push(identity);
    return this.fixedBody ?? super.getBody(identity);
  }
}

/* ------------------------------------------------------------------------ */
/* Domain Workflow definition                                                */
/* ------------------------------------------------------------------------ */

export const RESERVE_INTENT: DomainWorkflowEffectIntent = {
  effectType: 'effect:reserve',
  input: { reservation: 'quote', amount: 42 },
  idempotencyKey: 'reserve:quote:1',
};

export function quoteEvent(amount: number): { readonly type: string; readonly payload: JsonObject } {
  return { type: 'QUOTE_DECIDED', payload: { amount } };
}

export interface DefinitionOverrides {
  /** undefined = default guard; null = no guard; any string = that guard id. */
  readonly approveGuardId?: string | null;
  readonly approveEffects?: readonly DomainWorkflowEffectIntent[];
  readonly extraTransitions?: readonly DomainWorkflowTransition[];
  readonly omitReject?: boolean;
  readonly guards?: DomainWorkflowDefinition['guards'];
  readonly states?: readonly DomainWorkflowState[];
}

export function makeDefinition(overrides: DefinitionOverrides = {}): DomainWorkflowDefinition {
  return {
    workflowKey: 'order-quote',
    initialState: 'review',
    initialContext: {},
    guards: overrides.guards ?? [
      {
        guardId: 'guard:amount-ok',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 1000 },
        },
      },
    ],
    states: overrides.states ?? [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'approved',
            ...(overrides.approveGuardId === undefined
              ? { guardId: 'guard:amount-ok' }
              : overrides.approveGuardId === null
                ? {}
                : { guardId: overrides.approveGuardId }),
            ...(overrides.approveEffects === undefined
              ? { effectIntents: [RESERVE_INTENT] }
              : overrides.approveEffects.length === 0
                ? {}
                : { effectIntents: overrides.approveEffects }),
          },
          {
            transitionKey: 'approve-child',
            trigger: { kind: 'invocation_done', invocationKey: 'quote-review' },
            targetState: 'approved',
            effectIntents: [RESERVE_INTENT],
          },
          ...(overrides.omitReject === true
            ? []
            : [{
                transitionKey: 'reject',
                trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
                targetState: 'rejected',
              } as DomainWorkflowTransition]),
          ...(overrides.extraTransitions ?? []),
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  };
}

/* ------------------------------------------------------------------------ */
/* Resolved decision fixtures                                                */
/* ------------------------------------------------------------------------ */

export function quoteDecision(amount: number): JsonValue {
  return {
    decision: { outcome: 'approve', data: { amount } },
    event: { type: 'QUOTE_DECIDED', payload: { amount } },
  };
}

export const decisionSchema = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const decision = record['decision'];
    const event = record['event'];
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof (decision as Record<string, unknown>)['outcome'] === 'string'
      && typeof (event as Record<string, unknown>)['type'] === 'string';
  },
};

export function resolvedFrom(
  source: DecisionResolverSource,
  structuredDecision: JsonValue,
  overrides: Partial<ResolvedDecision<JsonValue>> = {},
): ResolvedDecision<JsonValue> {
  return {
    source,
    structuredDecision,
    provenance: {},
    freshModelCallCount: source === 'harness-machine' ? 1 : 0,
    llmAvoided: source !== 'harness-machine',
    cacheDisposition: source === 'exact-cache' ? { read: 'hit' } : { read: 'disabled' },
    telemetry: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------------ */
/* Effect tool port                                                          */
/* ------------------------------------------------------------------------ */

export class ScriptedEffectTools implements AdmissionEffectToolPort {
  readonly calls: AdmissionEffectToolRequest[] = [];

  constructor(
    private readonly bindings: Readonly<Record<string, ToolEffectSemantics>> = { 'effect:reserve': 'non-idempotent' },
    private readonly failure?: (request: AdmissionEffectToolRequest) => Error,
  ) {}

  resolve(effectType: string): AdmissionEffectToolBinding | undefined {
    const semantics = this.bindings[effectType];
    if (semantics === undefined) return undefined;
    return { effectType, effectSemantics: semantics, toolArtifact: EFFECT_RESERVE };
  }

  async execute(request: AdmissionEffectToolRequest): Promise<JsonValue> {
    this.calls.push(request);
    if (this.failure !== undefined) throw this.failure(request);
    return { reserved: true, effectId: request.effectId };
  }
}

/* ------------------------------------------------------------------------ */
/* Admission fixture                                                         */
/* ------------------------------------------------------------------------ */

export interface AdmissionFixture {
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly durableStore: MemoryDurableExecutionStore;
  readonly coordinator: GovernanceExecutionCoordinator;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly ports: CentralAdmissionPorts;
  readonly b1: GovernanceBaselineBody;
  readonly b2: GovernanceBaselineBody;
  readonly pin: GovernanceExecutionPin;
}

export interface AdmissionFixtureOptions {
  readonly b1Invariants?: readonly JsonValue[];
  readonly b1Override?: GovernanceBaselineBody;
  readonly registerB1?: boolean;
  readonly pinInstance?: boolean;
  readonly bindings?: Readonly<Record<string, ToolEffectSemantics>>;
  readonly journal?: VolatileAdmissionEffectJournal;
  readonly baselines?: MemoryGovernanceBaselineStore;
  readonly durableStore?: MemoryDurableExecutionStore;
  readonly failTool?: (request: AdmissionEffectToolRequest) => Error;
}

export async function admissionFixture(options: AdmissionFixtureOptions = {}): Promise<AdmissionFixture> {
  const b1 = options.b1Override ?? await makeBaseline('B1', options.b1Invariants ?? [CAP_INVARIANT]);
  const b2 = await makeBaseline('B2', []);
  const baselines = options.baselines ?? new MemoryGovernanceBaselineStore();
  if (options.registerB1 ?? true) {
    await baselines.putBody(b1);
  }
  await baselines.putBody(b2);
  const durableStore = options.durableStore ?? new MemoryDurableExecutionStore();
  const coordinator = new GovernanceExecutionCoordinator(durableStore, sha256);
  const journal = options.journal ?? new VolatileAdmissionEffectJournal();
  const tools = new ScriptedEffectTools(options.bindings ?? { 'effect:reserve': 'non-idempotent' }, options.failTool);
  const pin = await createPinFor(b1, durableStore, options.pinInstance ?? true);
  return {
    baselines,
    durableStore,
    coordinator,
    journal,
    tools,
    ports: { governance: coordinator, baselines, sha256, effectJournal: journal, effectTools: tools },
    b1,
    b2,
    pin,
  };
}

async function createPinFor(
  body: GovernanceBaselineBody,
  store: MemoryDurableExecutionStore,
  pinInstance: boolean,
): Promise<GovernanceExecutionPin> {
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const request = {
    workflowTarget: target.workflowId,
    workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-b1',
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: body.identity,
    },
  };
  if (!pinInstance) {
    // Shape a pin for evidence without binding it durably.
    const pinned = new GovernanceExecutionCoordinator(new MemoryDurableExecutionStore(), sha256);
    return pinned.pinExecution(request);
  }
  return coordinator.pinExecution(request);
}

export interface RequestOverrides {
  readonly turn?: CentralAdmissionRequest['turn'];
  readonly trigger?: CentralAdmissionRequest['trigger'];
  readonly definition?: DomainWorkflowDefinition;
  readonly currentStateKey?: string;
  readonly context?: JsonObject;
  readonly event?: CentralAdmissionRequest['event'];
  readonly resolved?: ResolvedDecision<JsonValue>;
  readonly decisionSchema?: CentralAdmissionRequest['decisionSchema'];
}

export function makeRequest(overrides: RequestOverrides = {}): CentralAdmissionRequest {
  return {
    target,
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: overrides.trigger ?? { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId,
    definition: overrides.definition ?? makeDefinition(),
    currentStateKey: overrides.currentStateKey ?? 'review',
    context: overrides.context ?? {},
    event: overrides.event ?? quoteEvent(42),
    resolved: overrides.resolved ?? resolvedFrom('harness-machine', quoteDecision(42)),
    decisionSchema: overrides.decisionSchema ?? decisionSchema,
    now: NOW,
  };
}

export function isAdmissionError(error: unknown, code: string): boolean {
  return error instanceof CentralAdmissionError && error.code === code;
}
