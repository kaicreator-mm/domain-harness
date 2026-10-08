/**
 * T004C invariant matrix — Microkernel boundary and one-effect-authority
 * posture (issue #874; authority #589 PACK-C T004C section + #672
 * CENTRAL_ADMISSION / NO_SECOND_RUNTIME_EFFECT_AUTHORITY / FAIL_CLOSED).
 *
 * Pins the frozen authority posture at the source/contract level:
 *  - the module composes ONLY the accepted owner seams (T004A re-admission,
 *    T002B mint verification, T003C binding verification, T005B resolution,
 *    T002C/T002D/T005C occurrence-pin gates, Central Admission) and imports no
 *    concrete Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/
 *    Storage dependency; Agent/UX are adapters OUTSIDE the kernel;
 *  - Central Admission is the ONLY effect-admission/durable-effect path: the
 *    module consumes `admitCentralDecision` and the existing
 *    `AdmissionDurableEffectJournal` port — it mints no journal, no journal
 *    class, no effect registry, no idempotency namespace and no effect
 *    authority verdict of its own;
 *  - the adapter dispatches ONLY the already-verified exact T003C binding and
 *    performs no independent implementation selection: no descriptor lookup,
 *    no registry order, no latest/default selection exists in the module;
 *  - exactly one authority function is exported; the result is identity +
 *    the admission outcome — opaque handles and secrets never enter durable
 *    identity/evidence or diagnostics.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
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
import {
  invokeEffectfulTool,
  type EffectfulToolDispatchPort,
  type EffectfulToolInvocationResult,
  type InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type { GovernanceBaselineBody } from '../../src/governance/index.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import type {
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Source-level one-authority proof.
// ---------------------------------------------------------------------------

test('PACK-C T004C kernel boundary: only accepted owner seams, no forbidden concrete import, no caller-plane branch', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/effectful-invocation.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');

  // No concrete Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/
  // Storage/node dependency may be imported (Central Admission and the T002C
  // activator are accepted generic owner seams, not concrete planes).
  const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
    (match) => match[0],
  );
  const FORBIDDEN_PATTERNS = [
    /xstate/i,
    /v2\/contracts\/workflow/,
    /tool[\s\-_.]*registry/i,
    /sqlite/i,
    /\bsql\b/i,
    /node:/,
    /http/i,
    /search/i,
    /storage/i,
    /agent/i,
    /\bux\b/i,
    /compiler/i,
    /host-local/,
  ];
  for (const statement of importStatements) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        statement,
        pattern,
        `effectful-invocation.ts must not import a forbidden concrete dependency: ${statement}`,
      );
    }
  }

  // Positive boundary: only the accepted owner seams + generic contract
  // helpers are imported. No second admission/effect/journal module exists.
  const allowedImports = [
    './component.js',
    './definition-graph.js',
    './identity.js',
    './json.js',
    './record-safety.js',
    './invocation-request.js',
    './resource-resolution.js',
    './runtime-assembly.js',
    './tool-implementation-binding.js',
    './tool-component.js',
    '../admission/admission.js',
    '../admission/contracts.js',
    '../governance/assembly-activation.js',
    '../governance/contracts.js',
    '../governance/execution-binding.js',
    '../v2/contracts/package.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the effectful invocation seam: ${specifier}`,
    );
  }

  // Owner-seam consumption is structural, not incidental: the module must
  // consume the T004A re-admission, the T002B mint verifier, the T003C
  // consumer verifier, the T005B resolution, the T002C/T002D/T005C occurrence
  // pin gates and the ONE Central Admission effect path.
  for (const required of [
    'admitToolInvocationRequest(',
    'isSealedRuntimeAssembly(',
    'verifyToolImplementationBinding(',
    'resolveToolResources(',
    'requireProductionEffectAuthority(',
    'requireResourceCurrentness(',
    'admitCentralDecision(',
  ] as const) {
    assert.match(
      source,
      new RegExp(required.replace('(', '\\(').replace(')', '\\)')),
      `the effectful invocation seam must consume the accepted owner seam: ${required}`,
    );
  }

  // No second authority: no journal class/registry/mint of its own, no
  // idempotency namespace, no effect registry, no implementation selection.
  assert.doesNotMatch(
    source,
    /class\s+\w*Journal\w*/,
    'no second journal class may exist in the module (Central Admission owns the durable effect journal)',
  );
  assert.doesNotMatch(
    source,
    /new\s+WeakSet/,
    'no new effect-authority mint registry may exist in the module',
  );
  assert.doesNotMatch(
    source,
    /beginEffect|completeEffect/,
    'the module must never drive journal records directly — effect execution/journal semantics stay with Central Admission',
  );
  assert.doesNotMatch(
    source,
    /descriptors\[|registry\.|first[A-Z]|latest[A-Z]|default[A-Z]Implementation/,
    'no implementation selection by descriptor/registry order/latest/default may exist (only the verified exact T003C binding dispatches)',
  );
  assert.doesNotMatch(
    source,
    /sealRuntimeAssembly\(|bindToolImplementation\(|activate\(/,
    'the module must never mint Assemblies, bindings or occurrence pins — it only consumes them',
  );

  // Caller-plane neutrality: the kernel never switches on caller material.
  const bodyWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    bodyWithoutComments,
    /callerKind\s*===/,
    'the Microkernel must not branch on the caller plane (Agent/UX neutrality)',
  );
  assert.doesNotMatch(
    bodyWithoutComments,
    /['"]agent['"]|['"]ux['"]/i,
    'concrete caller-plane literals must not appear in the Microkernel even as branch keys',
  );

  // Exactly ONE authority function + the typed error class.
  const exportedFunctions = [...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(exportedFunctions.sort(), ['invokeEffectfulTool']);
});

test('PACK-C T004C one-authority proof: the result carries only identity + the admission outcome — no handle, secret, or second-authority surface', async () => {
  const moduleUrl = new URL('../../src/contracts/effectful-invocation.js', import.meta.url);
  const mod = (await import(moduleUrl.href)) as Record<string, unknown>;

  // Exactly one authority function + the error class constructor.
  const runtimeFunctions = Object.entries(mod)
    .filter(([, value]) => typeof value === 'function')
    .map(([key]) => key);
  assert.deepEqual(runtimeFunctions.sort(), ['EffectfulInvocationError', 'invokeEffectfulTool']);
  for (const forbidden of [
    'appendJournalEntry',
    'mintOccurrence',
    'mintEffectAuthority',
    'createJournal',
    'transitionDomain',
  ]) {
    assert.equal(mod[forbidden], undefined, `module must not export ${forbidden}`);
  }

  // Happy-path posture on a full fixture: the result never serializes the
  // opaque handle or any live material.
  const fx = await fixture();
  const calls: unknown[] = [];
  const dispatch: EffectfulToolDispatchPort = {
    async dispatch(query) {
      calls.push(query);
      return { charged: true };
    },
  };
  const input: InvokeEffectfulToolInput = {
    request: fx.admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: 'effect:charge',
    dispatch,
    sha256: realSha256,
  };
  const result: EffectfulToolInvocationResult = await invokeEffectfulTool(input);

  assert.equal(result.outcome.status, 'admitted');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('runtime-handle'), 'the opaque handle must never enter the result');
  assert.ok(!serialized.includes('handle.charge'), 'no handle identity may enter the result');
  // The result exposes identity material only.
  assert.deepEqual(Object.keys(result).sort(), ['invocation', 'occurrence', 'outcome']);
  assert.deepEqual(Object.keys(result.occurrence).sort(), [
    'assemblyDigest',
    'authorityClass',
    'pinBindingDigest',
    'workflowInstanceId',
    'workflowTarget',
  ]);
  assert.deepEqual(Object.keys(result.invocation).sort(), [
    'bindingDigest',
    'definitionGraphDigest',
    'effectSemantics',
    'effectType',
    'implementation',
    'operationId',
    'toolComponentId',
  ]);
});

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

function toolComponent(): ComponentEnvelope {
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
          effect: 'non-idempotent',
        },
      ],
      providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.t004c', components: [consumer(), toolComponent()], relations: [] };
}

function kindBinding() {
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
    pin: { readonly workflowInstanceId: string },
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
            effectIntents: [{ effectType: 'effect:charge', input: { amount: 42 } }],
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

async function fixture(): Promise<{
  g: DefinitionGraphEnvelope;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
  activator: AssemblyExecutionActivator;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  admissionRequest: CentralAdmissionRequest;
}> {
  const g = graph();
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
      input: { amount: 42 },
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
  await activator.activate({
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
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
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
  return { g, binding, admitted, activator, admissionPorts, admissionRequest };
}
