/**
 * T004C tests-first matrix — duplicate/idempotency, outcome-unknown and
 * replay/recovery posture (issue #874; authority #589 PACK-C T004C section +
 * #672 DUPLICATE_EFFECT_SAFETY / RECOVERY_OUTCOME_UNKNOWN_POSTURE).
 *
 * Covers the PACK-C T004C test list (recovery file):
 *  - duplicate invocation of the SAME durable turn resolves the SAME effect
 *    identity through the existing journal and NEVER re-executes a completed
 *    effect (disposition 'replayed', one journal record, one dispatch);
 *  - an existing-started non-idempotent effect (outcome unknown) fails
 *    ADMISSION_EFFECT_AMBIGUOUS — closed, never auto-retried, never
 *    re-executed by a retry/rerun;
 *  - a crash after the effect may have happened but before the outcome could
 *    be persisted preserves the existing outcome-unknown posture
 *    (ADMISSION_EFFECT_JOURNAL_CONFLICT); a subsequent retry of the same turn
 *    fails ambiguous and never converts uncertainty into a duplicate effect;
 *  - recovery replay reuses the SAME occurrence/pin/journal lineage and never
 *    mints a fresh effect namespace;
 *  - the effect semantics in the durable journal derive from the exact
 *    current graph classification, never from caller material.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import type {
  EffectfulToolDispatchPort,
  EffectfulToolDispatchQuery,
  InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type { GovernanceBaselineBody } from '../../src/governance/index.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import { deriveDurableControlTurnId } from '../../src/admission/admission.js';
import type {
  AdmissionDurableEffectJournal,
  AdmissionEffectJournalRecord,
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import { CentralAdmissionError } from '../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import { invokeEffectfulTool } from '../../src/contracts/effectful-invocation.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixtures (same composite posture as the main matrix file).
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(effect: 'idempotent' | 'non-idempotent'): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.charge',
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect,
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    },
  };
}

function graph(effect: 'idempotent' | 'non-idempotent'): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t004c',
    components: [consumer(), toolComponent(effect)],
    relations: [],
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'test.t004c-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t004c-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function candidate(): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.charge.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.charge.alpha-content',
    },
    supportedOperations: ['op.charge'],
    handle: { kind: 'runtime-handle', id: 'handle.charge#1' },
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'workflow' };
}

const WORKFLOW_TARGET = 'orders.charge';
const WORKFLOW_INSTANCE_ID = 'orders.charge:instance:9';
const OCCURRENCE_TARGET: WorkflowAddress = { workflowId: 'orders.charge', instanceKey: 'instance:9' };
const NOW = '2026-10-06T12:00:00.000Z';
const EFFECT_TYPE = 'effect:charge';
const INPUT = { amount: 42 };

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(id: string): Promise<unknown> {
    return this.#pins.get(id);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
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

  async putGovernanceBoundSnapshot(snapshot: { readonly workflowInstanceId: string }): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

/** Journal wrapper whose completeEffect can be made to fail (outcome-unknown). */
class FailingCompleteJournal implements AdmissionDurableEffectJournal {
  completeCalls = 0;
  constructor(private readonly inner: VolatileAdmissionEffectJournal) {}

  async getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null> {
    return this.inner.getEffect(effectId);
  }

  async beginEffect(record: AdmissionEffectJournalRecord) {
    return this.inner.beginEffect(record);
  }

  async completeEffect(
    _effectId: string,
    _outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord> {
    this.completeCalls += 1;
    throw new Error('journal unavailable after possible effect (crash injection)');
  }

  snapshotRecords(): readonly AdmissionEffectJournalRecord[] {
    return this.inner.getRecords();
  }
}

function workflowDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'order-charge',
    initialState: 'review',
    initialContext: {},
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'charge',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'charged',
            effectIntents: [{ effectType: EFFECT_TYPE, input: INPUT, idempotencyKey: 'charge:1' }],
          },
        ],
      },
      { stateKey: 'charged', kind: 'final' },
    ],
  };
}

function resolvedDecision(): ResolvedDecision<JsonValue> {
  const source: DecisionResolverSource = 'harness-machine';
  return {
    source,
    structuredDecision: {
      decision: { outcome: 'charge', data: { amount: 42 } },
      event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    },
    provenance: {},
    freshModelCallCount: 1,
    llmAvoided: false,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

const decisionSchema = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record['decision'] === 'object' &&
      record['decision'] !== null &&
      typeof record['event'] === 'object' &&
      record['event'] !== null
    );
  },
};

interface Fixture {
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
  pin: GovernanceExecutionPin;
  activator: AssemblyExecutionActivator;
  journal: VolatileAdmissionEffectJournal;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  admissionRequest: CentralAdmissionRequest;
  turnId: string;
}

async function governanceBody(): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

async function fixture(
  effect: 'idempotent' | 'non-idempotent' = 'non-idempotent',
  turn: CentralAdmissionRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:1' },
): Promise<Fixture> {
  const g = graph(effect);
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph: g, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.charge', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [candidate()],
    sha256: realSha256,
  });
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      caller: caller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      input: INPUT,
      caller: caller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const pin = await activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: b1.identity,
    },
    assembly: binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: g,
  });
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'> = {
    governance: coordinator,
    baselines,
    effectJournal: journal,
  };
  const admissionRequest: CentralAdmissionRequest = {
    target: OCCURRENCE_TARGET,
    turn,
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: workflowDefinition(),
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    resolved: resolvedDecision(),
    decisionSchema,
    now: NOW,
  };
  return {
    g,
    binding,
    admitted,
    pin,
    activator,
    journal,
    admissionPorts,
    admissionRequest,
    turnId: deriveDurableControlTurnId(OCCURRENCE_TARGET, turn),
  };
}

function recordingDispatch(calls: EffectfulToolDispatchQuery[]): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { charged: true };
    },
  };
}

function invocationInput(
  fx: Fixture,
  overrides: Partial<InvokeEffectfulToolInput> = {},
): InvokeEffectfulToolInput {
  return {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: EFFECT_TYPE,
    dispatch: recordingDispatch([]),
    sha256: realSha256,
    ...overrides,
  } as InvokeEffectfulToolInput;
}

function expectAdmissionError(promise: Promise<unknown>, code: string): Promise<CentralAdmissionError> {
  return promise.then(
    () => {
      throw new Error(`expected CentralAdmissionError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof CentralAdmissionError,
        `expected CentralAdmissionError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// Duplicate/idempotency: same durable effect identity, never duplicated.
// ---------------------------------------------------------------------------

test('PACK-C T004C duplicate: re-invoking the SAME durable turn reuses the same effect identity and replays the completed effect without re-dispatch', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const dispatch = recordingDispatch(calls);

  const first = await invokeEffectfulTool(invocationInput(fx, { dispatch }));
  assert.equal(first.outcome.status, 'admitted');
  if (first.outcome.status !== 'admitted') return;
  assert.equal(first.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(calls.length, 1);

  // Same turn source re-driven (message redelivery / retry of the SAME turn):
  // the same effectId resolves to the durable completed record.
  const second = await invokeEffectfulTool(invocationInput(fx, { dispatch }));
  assert.equal(second.outcome.status, 'admitted');
  if (second.outcome.status !== 'admitted') return;
  const replayed = second.outcome.admitted.effects[0]!;
  assert.equal(replayed.disposition, 'replayed');
  assert.equal(replayed.effectId, first.outcome.admitted.effects[0]!.effectId);
  assert.deepEqual(replayed.output, { charged: true });
  assert.equal(calls.length, 1, 'a completed effect is never re-executed');

  const records = fx.journal.getRecords();
  assert.equal(records.length, 1, 'no second journal record may exist for the same effect identity');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectId, replayed.effectId);
});

test('PACK-C T004C idempotent semantics: the durable journal carries the graph-derived effect classification, and a completed idempotent effect still replays once', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture('idempotent');
  const dispatch = recordingDispatch(calls);

  const first = await invokeEffectfulTool(invocationInput(fx, { dispatch }));
  const second = await invokeEffectfulTool(invocationInput(fx, { dispatch }));

  assert.equal(first.outcome.status, 'admitted');
  assert.equal(second.outcome.status, 'admitted');
  if (first.outcome.status !== 'admitted' || second.outcome.status !== 'admitted') return;
  assert.equal(first.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(second.outcome.admitted.effects[0]!.disposition, 'replayed');
  assert.equal(calls.length, 1);
  const records = fx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.effectSemantics, 'idempotent', 'the classification comes from the exact current graph');
});

// ---------------------------------------------------------------------------
// Existing-started / unknown outcome: ambiguous, closed, never auto-retried.
// ---------------------------------------------------------------------------

test('PACK-C T004C unknown outcome: an existing-started non-idempotent effect fails ADMISSION_EFFECT_AMBIGUOUS and a retry never re-executes it', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const effectId = `${fx.turnId}/effect/1`;
  // Crash injection: the effect was begun durably but its outcome was never
  // committed — the journal holds a 'started' record (outcome unknown).
  await fx.journal.beginEffect({
    effectId,
    target: OCCURRENCE_TARGET,
    durableControlTurnId: fx.turnId,
    operationOrdinal: 1,
    effectType: EFFECT_TYPE,
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: 1,
    input: INPUT,
    idempotencyKey: 'charge:1',
    startedAt: NOW,
  });

  // First invocation after the crash: the non-idempotent effect is ambiguous.
  await expectAdmissionError(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(calls.length, 0, 'an ambiguous non-idempotent effect is never re-executed');

  // A retry of the same turn resolves the SAME durable record and fails
  // ambiguous again — uncertainty is never converted into a duplicate effect.
  await expectAdmissionError(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(calls) })),
    'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(calls.length, 0);

  const records = fx.journal.getRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0]!.status, 'started', 'the started record stays untouched (operator recovery owns the retry)');
});

test('PACK-C T004C unknown outcome: a journal commit failure after the effect ran preserves the outcome-unknown posture; the retry fails ambiguous and never auto-retries', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const fx = await fixture();
  const crashJournal = new FailingCompleteJournal(fx.journal);

  // The dispatch ran, but the outcome could not be persisted: the existing
  // admission posture surfaces the ambiguity as ADMISSION_EFFECT_JOURNAL_CONFLICT.
  await expectAdmissionError(
    invokeEffectfulTool(
      invocationInput(fx, {
        dispatch: recordingDispatch(calls),
        admissionPorts: {
          governance: fx.admissionPorts.governance,
          baselines: fx.admissionPorts.baselines,
          effectJournal: crashJournal,
        },
      }),
    ),
    'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  assert.equal(calls.length, 1, 'the effect itself ran exactly once');
  assert.equal(crashJournal.snapshotRecords().length, 1);
  assert.equal(crashJournal.snapshotRecords()[0]!.status, 'started');

  // Retry of the same turn: the started non-idempotent record is ambiguous.
  const retryCalls: EffectfulToolDispatchQuery[] = [];
  await expectAdmissionError(
    invokeEffectfulTool(invocationInput(fx, { dispatch: recordingDispatch(retryCalls) })),
    'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(retryCalls.length, 0, 'the retry must never re-execute the possibly-done effect');
});

// ---------------------------------------------------------------------------
// Replay/recovery: same occurrence/pin/journal lineage, no fresh namespace.
// ---------------------------------------------------------------------------

test('PACK-C T004C recovery replay: a recovery-resume turn of the SAME occurrence executes on the same journal lineage, and its replay reuses the same effect identity without re-dispatch', async () => {
  const calls: EffectfulToolDispatchQuery[] = [];
  const recoveryTurn: CentralAdmissionRequest['turn'] = {
    kind: 'recovery',
    durableRecoveryActionId: 'rec:1',
    resumeOrdinal: 1,
  };
  const fx = await fixture('non-idempotent', recoveryTurn);
  const dispatch = recordingDispatch(calls);

  const first = await invokeEffectfulTool(invocationInput(fx, { dispatch }));
  assert.equal(first.outcome.status, 'admitted');
  if (first.outcome.status !== 'admitted') return;
  assert.equal(first.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(first.outcome.admitted.effects[0]!.effectId, `${fx.turnId}/effect/1`);
  assert.equal(first.outcome.admitted.durableControlTurnId, fx.turnId);

  // The same recovery turn re-driven (process restart posture) resolves the
  // SAME occurrence lineage, pin and journal record — never a fresh namespace.
  const replay = await invokeEffectfulTool(invocationInput(fx, { dispatch }));
  assert.equal(replay.outcome.status, 'admitted');
  if (replay.outcome.status !== 'admitted') return;
  assert.equal(replay.outcome.admitted.effects[0]!.disposition, 'replayed');
  assert.equal(replay.outcome.admitted.effects[0]!.effectId, `${fx.turnId}/effect/1`);
  assert.equal(calls.length, 1);
  assert.equal(fx.journal.getRecords().length, 1);

  // The occurrence pin is unchanged: no re-mint, no second pin hierarchy.
  const reread = await fx.admissionPorts.governance.requirePinnedExecution(WORKFLOW_INSTANCE_ID);
  assert.equal(reread.bindingDigest, fx.pin.bindingDigest);
  assert.equal(reread.assemblyDigest, fx.pin.assemblyDigest);
  assert.equal(reread.authorityClass, 'PRODUCTION');
});
