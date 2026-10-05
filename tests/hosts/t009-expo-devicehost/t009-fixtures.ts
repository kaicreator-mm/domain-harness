/**
 * T009 device fixture vocabulary — the v0.6 conformance helper surface
 * (packages/domain-harness/tests/{v06-conformance,decision-resolver,
 * admission,promoted-child}/helpers) ported to the Hermes bundle: every port
 * that was memory/in-memory on Node stays a portable in-process port here,
 * EXCEPT the runtime store, which is the REAL expo-sqlite adapter. The only
 * Node-only construct (node:crypto sha256) is replaced by the device pure-TS
 * SHA-256 port, whose known-answer vectors are asserted on device.
 */
import {
  PromotedArtifactRegistry,
  PromotedChildRuntime,
  VolatileAdmissionEffectJournal,
  VolatileExactSemanticCacheStore,
  VolatileHarnessExecutionJournalStore,
  computeCanonicalJsonDigest,
  createGovernanceBaselineBody,
  createRegistryPromotedChildArtifactPort,
  createXStateHarnessMachineRunner,
  type DynamicChildPinStore,
  type PromotedArtifactStore,
  type RuntimeHarnessDecisionTurnMaterial,
  type AdmissionEffectToolBinding,
  type AdmissionEffectToolPort,
  type AdmissionEffectToolRequest,
  type BusinessHarnessModelResponse,
  type CandidateValidationResult,
  type CompiledArtifactIdentity,
  type CompiledArtifactKind,
  type DecisionResolverPorts,
  type DecisionResolverRuleInput,
  type DecisionResolverRulePort,
  type DomainHardInvariantPredicate,
  type DomainWorkflowDefinition,
  type DomainWorkflowEffectIntent,
  type DomainWorkflowState,
  type DomainWorkflowTransition,
  type GovernanceBaselineBody,
  type GovernanceBaselineIdentity,
  type GovernanceBaselineAuthorityBinding,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type DurableExecutionStore,
  type BindGovernanceExecutionPinResult,
  type HarnessMachineRunnerPort,
  type JsonValue,
  type JsonObject,
  type ModelPort,
  type PromotedChildArtifactPort,
  type SemanticCacheCurrentSchema,
  type ToolEffectSemantics,
} from '@kaicreator/domain-harness';
import { deviceSha256, sha256HexUtf8 } from './device-sha256';

/* ------------------------------------------------------------------------ */
/* Identity vocabulary                                                       */
/* ------------------------------------------------------------------------ */

export const NOW = '2026-10-04T07:00:00.000Z';
export const TARGET = { workflowId: 'order-quote', instanceKey: 'instance:42' } as const;
export const CMD_TARGET = { workflowId: 'order-quote', instanceKey: 'cmd:loop' } as const;
export const workflowInstanceIdFor = (targetAddress: { workflowId: string; instanceKey: string }): string =>
  `${targetAddress.workflowId}:${targetAddress.instanceKey}`;
export const WORKFLOW_INSTANCE_ID = workflowInstanceIdFor(TARGET);
export const CMD_WORKFLOW_INSTANCE_ID = workflowInstanceIdFor(CMD_TARGET);

export function ref<K extends CompiledArtifactKind>(kind: K, artifactId: string, contentDigest = `digest-${artifactId}`): CompiledArtifactIdentity {
  return { kind, artifactId, contentDigest };
}

export const HARNESS_PRODUCER: CompiledArtifactIdentity = ref('harness-config', 'harness:quote', 'digest-harness:quote');

export const EFFECT_RESERVE: CompiledArtifactIdentity = {
  kind: 'tool',
  artifactId: 'effect:reserve',
  contentDigest: 'digest-effect:reserve',
};

/* ------------------------------------------------------------------------ */
/* Result shapes + schemas                                                   */
/* ------------------------------------------------------------------------ */

export type QuoteDecisionResult = {
  readonly decision: { readonly outcome: string; readonly data: JsonValue };
  readonly event: { readonly type: string; readonly payload: JsonValue };
};

export function quoteResult(outcome: string, data: JsonValue): QuoteDecisionResult {
  return {
    decision: { outcome, data },
    event: { type: 'QUOTE_DECIDED', payload: data },
  };
}

export const quoteDecisionSchema: SemanticCacheCurrentSchema<QuoteDecisionResult> = {
  isValid: (value: JsonValue): value is QuoteDecisionResult => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const decision = record.decision;
    const event = record.event;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof (decision as Record<string, unknown>).outcome === 'string'
      && typeof (event as Record<string, unknown>).type === 'string';
  },
};

/* ------------------------------------------------------------------------ */
/* Scripted model + rule ports                                               */
/* ------------------------------------------------------------------------ */

export class ScriptedModel implements ModelPort {
  calls = 0;
  readonly queue: BusinessHarnessModelResponse[];

  constructor(steps: readonly BusinessHarnessModelResponse[]) {
    this.queue = [...steps];
  }

  async generate(): Promise<BusinessHarnessModelResponse> {
    this.calls += 1;
    const next = this.queue.shift();
    if (next === undefined) throw new Error('scripted model queue exhausted');
    return next;
  }
}

export function finalResponse(outcome: string, data: JsonValue): BusinessHarnessModelResponse {
  return { kind: 'final', result: quoteResult(outcome, data) };
}

export class CapturingRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  calls = 0;
  readonly inputs: DecisionResolverRuleInput[] = [];
  readonly producerIdentity = {
    kind: 'rule' as const,
    artifactId: 'rule:quote-rules',
    contentDigest: 'digest-rule:quote-rules',
  };

  constructor(
    private readonly outcome:
      | { readonly status: 'no-match' }
      | { readonly status: 'match'; readonly result: QuoteDecisionResult },
  ) {}

  async evaluate(
    input: DecisionResolverRuleInput,
  ): Promise<{ readonly status: 'no-match' } | { readonly status: 'match'; readonly result: QuoteDecisionResult }> {
    this.calls += 1;
    this.inputs.push(input);
    return this.outcome;
  }
}

/** Rule port whose evaluation always fails closed (integrity failure). */
export class ThrowingRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  readonly producerIdentity: CompiledArtifactIdentity = ref('rule', 'rule:broken', 'digest-rule:broken');

  async evaluate(): Promise<never> {
    throw new Error('rule integrity failure');
  }
}

/* ------------------------------------------------------------------------ */
/* Turn material builders                                                    */
/* ------------------------------------------------------------------------ */

export function harnessMaterial(
  model: ScriptedModel,
  journal = new VolatileHarnessExecutionJournalStore(),
): RuntimeHarnessDecisionTurnMaterial {
  return {
    input: {
      domainFacts: {},
      compiledIntelligence: {},
      workflowContext: {},
      capabilities: [],
      model,
    },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

/** Harness material with one query-only capability bound (declaration-gated). */
export function queryHarnessMaterial(
  model: ScriptedModel,
  journal = new VolatileHarnessExecutionJournalStore(),
): RuntimeHarnessDecisionTurnMaterial {
  return {
    input: {
      domainFacts: {},
      compiledIntelligence: {},
      workflowContext: {},
      capabilities: [{
        capabilityId: 'quotes.lookup',
        description: 'quote lookup',
        kind: 'query' as const,
        execute: async () => ({ value: { ok: true } }),
      }],
      model,
    },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

/** Fresh rule-less resolver ports whose Harness fallback runs a scripted model. */
export function resolverFixture(): {
  runner: HarnessMachineRunnerPort;
  cacheStore: VolatileExactSemanticCacheStore<QuoteDecisionResult>;
  model: ScriptedModel;
} {
  return {
    runner: createXStateHarnessMachineRunner(),
    cacheStore: new VolatileExactSemanticCacheStore<QuoteDecisionResult>(),
    model: new ScriptedModel([finalResponse('approve', { via: 'harness' })]),
  };
}

export type ResolverPortsLike = DecisionResolverPorts<QuoteDecisionResult>;

/* ------------------------------------------------------------------------ */
/* Effect tool port (host-local, scripted)                                   */
/* ------------------------------------------------------------------------ */

export class ScriptedEffectTools implements AdmissionEffectToolPort {
  readonly calls: AdmissionEffectToolRequest[] = [];

  constructor(
    private readonly bindings: Readonly<Record<string, ToolEffectSemantics>> = { 'effect:reserve': 'non-idempotent' },
  ) {}

  resolve(effectType: string): AdmissionEffectToolBinding | undefined {
    const semantics = this.bindings[effectType];
    if (semantics === undefined) return undefined;
    return { effectType, effectSemantics: semantics, toolArtifact: EFFECT_RESERVE };
  }

  async execute(request: AdmissionEffectToolRequest): Promise<JsonValue> {
    this.calls.push(request);
    return { reserved: true, effectId: request.effectId };
  }
}

export function newEffectJournal(): VolatileAdmissionEffectJournal {
  return new VolatileAdmissionEffectJournal();
}

/* ------------------------------------------------------------------------ */
/* Domain workflow definition                                                */
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
  readonly omitReject?: boolean;
  readonly guards?: DomainWorkflowDefinition['guards'];
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
    states: [
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
          ...(overrides.omitReject === true
            ? []
            : [{
                transitionKey: 'reject',
                trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
                targetState: 'rejected',
              } as DomainWorkflowTransition]),
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ] satisfies DomainWorkflowState[],
  };
}

/* ------------------------------------------------------------------------ */
/* Governance baselines + authorities                                        */
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
  } satisfies DomainHardInvariantPredicate['predicate'],
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
  }, deviceSha256);
}

export class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly pins = new Map<string, unknown>();
  readonly snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(id: string): Promise<unknown> {
    return this.pins.get(id);
  }

  async bindGovernanceExecutionPin(pin: GovernanceExecutionPin): Promise<BindGovernanceExecutionPinResult> {
    const existing = this.pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }

  async getGovernanceBoundSnapshot(id: string): Promise<unknown> {
    return this.snapshots.get(id);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

export class MemoryActivationAuthority {
  current: unknown;
  async readDomainActivationBinding(): Promise<unknown> {
    return this.current;
  }
  async publishDomainActivationBinding(binding: unknown): Promise<void> {
    this.current = binding;
  }
}

export class MemoryPackageCdiAuthority {
  readonly records = new Map<string, unknown>();
  add(binding: unknown): void {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    this.records.set(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`, binding);
  }
  async resolveExactPackageCdi(binding: unknown): Promise<unknown> {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    return this.records.get(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`);
  }
}

/* ------------------------------------------------------------------------ */
/* Promoted subworkflow fixture (T009 J2c non-model promoted source)         */
/* ------------------------------------------------------------------------ */

export const promotedBaseline: GovernanceBaselineIdentity = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: 'governance-v1',
  version: 'B1',
  contentDigest: 'governance-content-b1',
};

export function promotedAuthority(
  overrides: Partial<GovernanceBaselineAuthorityBinding> = {},
): GovernanceBaselineAuthorityBinding {
  return {
    domainId: 'orders',
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: { ...promotedBaseline },
    ...overrides,
  };
}

export function makeEnvelope(): JsonValue {
  return {
    schemaVersion: 'candidate-envelope-v1',
    candidateKind: 'workflow',
    candidateId: 'candidate:quote-review',
    bodyContract: ref('output-schema', 'schema:quote-decision'),
    body: {
      schemaVersion: 'promoted-child-workflow/v1',
      nodes: [
        { node: 'fetch', step: { kind: 'query', tool: ref('tool', 'tool:price'), input: { kind: 'input', path: 'sku' } } },
        { node: 'notify', step: { kind: 'emit-event', eventType: 'QUOTE_PREPARED', payload: { kind: 'step-output', node: 'fetch', path: 'price' } } },
        { node: 'finish', step: { kind: 'terminal-output', output: { kind: 'step-output', node: 'fetch', path: 'quote' } } },
      ],
    },
    io: {
      inputs: [ref('output-schema', 'schema:quote-request')],
      outputs: [ref('output-schema', 'schema:quote-decision')],
    },
    capabilities: ['query'],
    tools: [{ ...ref('tool', 'tool:price'), capability: 'query' }],
    events: ['QUOTE_PREPARED'],
    mutation: { kind: 'none' },
    references: [ref('knowledge', 'knowledge:pricing')],
    applicability: [ref('knowledge', 'ctx:b2b-quote')],
    hardInvariants: [ref('rule', 'inv:positive-price')],
    control: {
      startNode: 'fetch',
      nodes: ['fetch', 'notify', 'finish'],
      edges: [
        { from: 'fetch', to: 'notify' },
        { from: 'notify', to: 'finish' },
      ],
      maxSteps: 5,
    },
  } as unknown as JsonValue;
}

async function validationFor(
  targetAuthority: GovernanceBaselineAuthorityBinding,
  material: JsonValue,
): Promise<CandidateValidationResult> {
  return {
    ok: true,
    identity: {
      candidateKind: 'workflow',
      candidateId: 'candidate:quote-review',
      candidateContentDigest: await computeCanonicalJsonDigest(material, deviceSha256),
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: { ...targetAuthority.governanceBaseline },
    },
    grantsExecutionPermission: false,
  };
}

export interface PromotedFixture {
  readonly store: PromotedArtifactStore;
  readonly registry: PromotedArtifactRegistry;
  readonly port: PromotedChildArtifactPort;
  readonly pinStore: DynamicChildPinStore;
  readonly runtime: PromotedChildRuntime;
  readonly body: { readonly identity: CompiledArtifactIdentity } & Record<string, unknown>;
  readonly semanticMaterial: JsonValue;
}

/**
 * Promote the quote-review subworkflow envelope into the caller-supplied
 * (device-durable) artifact store; the runtime serves selections from the SAME
 * durable store, so promoted material survives force-stop/relaunch.
 */
export async function promotedFixture(
  durable: { readonly store: PromotedArtifactStore; readonly pinStore: DynamicChildPinStore },
  authorityOverrides: Partial<GovernanceBaselineAuthorityBinding> = {},
): Promise<PromotedFixture> {
  const semanticMaterial = makeEnvelope();
  const targetAuthority = promotedAuthority(authorityOverrides);
  const store = durable.store;
  const registry = new PromotedArtifactRegistry(store, deviceSha256);
  const result = await registry.promote({
    artifactId: 'subworkflow:quote-review',
    version: '1.0.0',
    validation: await validationFor(targetAuthority, semanticMaterial),
    authorityBinding: targetAuthority,
    semanticMaterial,
    promotion: {
      recordId: 'promotion:quote-review:1',
      authorityRef: 'audit://promotion/quote-review/1',
      recordedAt: '2026-10-04T03:00:00.000Z',
    },
  });
  const port = createRegistryPromotedChildArtifactPort(registry);
  const pinStore = durable.pinStore;
  const runtime = new PromotedChildRuntime(port, pinStore, deviceSha256);
  return {
    store,
    registry,
    port,
    pinStore,
    runtime,
    body: result.body as unknown as { readonly identity: CompiledArtifactIdentity } & Record<string, unknown>,
    semanticMaterial,
  };
}

export function allAvailableArtifacts(): readonly CompiledArtifactIdentity[] {
  return [
    ref('output-schema', 'schema:quote-request'),
    ref('output-schema', 'schema:quote-decision'),
    { kind: 'tool', artifactId: 'tool:price', contentDigest: 'digest-tool:price' },
    ref('knowledge', 'knowledge:pricing'),
    ref('rule', 'inv:positive-price'),
  ] as readonly CompiledArtifactIdentity[];
}

/* ------------------------------------------------------------------------ */
/* sha256 known-answer + error helpers                                       */
/* ------------------------------------------------------------------------ */

export function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'missing-code');
  }
  return 'missing-code';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { deviceSha256, sha256HexUtf8 };
