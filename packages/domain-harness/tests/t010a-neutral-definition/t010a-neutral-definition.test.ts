/**
 * T010A self-proving tests — neutral Domain Definition fixture for E11
 * (issue #889; frozen authority #589@issuecomment-5980528597 T010A section;
 * readiness #718 PASS, rebind reviews #730/#746 PASS CLOSED; T004C
 * prerequisite accepted #880).
 *
 * Every frozen fixture-semantics bullet is proven here against the fixture
 * module `tests/fixtures/t010a-neutral-definition.ts`, exclusively through
 * the accepted public seams (no private runtime shortcut):
 *
 *  1. one neutral Workflow Semantic Component, lifecycle READY -> DONE via
 *     the admitted intent `complete`; one Tool Component providing the small
 *     exact capability used by the Workflow; >=1 effect=none operation and
 *     one effectful operation; one explicit relation/capability dependency
 *     exercising Definition graph composition/identity only (never
 *     provider-selection or authorization authority);
 *  2. the admitted intent is must-understand: Assembly-bound admission
 *     passes the frozen semantics and fails closed on any unknown or
 *     unadmitted intent;
 *  3. effect=none invocation flows through the T004B seam and gains no
 *     transition/business authority (OBSERVED only, zero journal effects);
 *  4. effectful invocation crosses the accepted T004C/Central Admission
 *     path under ONE already-authoritative PRODUCTION occurrence, with the
 *     durable effect recorded exactly once on the ONE existing journal;
 *     the deterministic test-only effect recorder is never a second journal;
 *  5. exact Kind/Tool implementations and the test ResourceProvider are
 *     bound through the same Assembly ports; stale Definition material
 *     fails closed before any dispatch;
 *  6. fixture names live in the test namespace and carry no Standard
 *     Component contract material (non-product, non-Standard,
 *     non-self-referential).
 *
 * Capability semantics are exactly: Workflow requiredCapability -> T003B
 * exact Domain Tool provider selection -> T003C exact Tool
 * implementation/currentness binding. T003E Tool-to-Tool closure is NOT
 * CLAIMED / NOT EXERCISED by T010A — T003E/E5 remains its sole owner. The
 * exact fixture freeze record
 * (`tests/fixtures/t010a-neutral-definition.freeze.ts`, issue #908 P1-2) is
 * recomputed through the accepted public APIs and deep-compared below; any
 * identity drift fails closed instead of refreshing the record.
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * SOURCE_MUTATION=NONE (tests-only write set).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateComponentEnvelope,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  DefinitionGraphContractError,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import {
  CapabilityProvisionContractError,
  resolveCurrentCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import {
  admitComponentWithAssembly,
  RuntimeAssemblyError,
} from '../../src/contracts/runtime-assembly.js';
import { ToolComponentContractError } from '../../src/contracts/tool-component.js';
import {
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  NonEffectfulInvocationError,
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchQuery,
} from '../../src/contracts/non-effectful-invocation.js';
import {
  EffectfulInvocationError,
  invokeEffectfulTool,
  type EffectfulToolDispatchQuery,
  type InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import type {
  AdmittedToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { ResourceProvider } from '../../src/contracts/resource-resolution.js';
import type { CentralAdmissionPorts, CentralAdmissionRequest } from '../../src/admission/contracts.js';
import type { AssemblyExecutionActivator } from '../../src/governance/index.js';
import { deriveDurableControlTurnId } from '../../src/admission/admission.js';
import {
  T010A_CAPABILITY,
  T010A_EFFECT_TYPE,
  T010A_IDEMPOTENCY_KEY,
  T010A_KIND,
  T010A_KIND_IMPLEMENTATION,
  T010A_NOW,
  T010A_OP_READ,
  T010A_OP_RECORD,
  T010A_OCCURRENCE_TARGET,
  T010A_RELATION_ID,
  T010A_RESOURCE_KEY,
  T010A_TOOL_COMPONENT_ID,
  T010A_TOOL_IMPLEMENTATION,
  T010A_WORKFLOW_COMPONENT_ID,
  T010A_WORKFLOW_INSTANCE_ID,
  T010A_WORKFLOW_TARGET,
  T010aTestExecutor,
  admitT010aOperation,
  bindT010aTool,
  buildT010aAssembly,
  buildT010aOccurrenceContext,
  t010aCaller,
  t010aDefinitionGraph,
  t010aKindValidator,
  t010aResourceProvider,
  t010aSha256,
  t010aToolComponent,
  t010aWorkflowComponent,
  type T010aAssemblyBundle,
} from '../fixtures/t010a-neutral-definition.js';
import { T010A_FREEZE_RECORD } from '../fixtures/t010a-neutral-definition.freeze.js';

// ---------------------------------------------------------------------------
// Frozen-bullet 1: neutral Definition shape, graph composition and the
// explicit relation/capability dependency.
// ---------------------------------------------------------------------------

test('T010A bullet 1: one neutral Workflow Semantic Component READY -> DONE via admitted intent `complete`, one Tool with effect=none + effectful operations, explicit relation/capability dependency', () => {
  const graph = t010aDefinitionGraph();
  validateDefinitionGraphEnvelope(graph);

  // Exactly the two frozen components and the one frozen relation.
  assert.equal(graph.components.length, 2);
  assert.equal(graph.relations.length, 1);
  const workflow = graph.components.find(
    (component) => component.componentId === T010A_WORKFLOW_COMPONENT_ID,
  )!;
  const tool = graph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  assert.equal(workflow.family, 'semantic');
  assert.equal(tool.family, 'tool');

  // Workflow lifecycle READY -> DONE via the admitted intent `complete`.
  const body = workflow.semanticBody as unknown as {
    lifecycle: { initial: string; final: string };
    states: readonly { stateKey: string; kind: string }[];
    intents: readonly {
      intentId: string;
      admitted: boolean;
      fromState: string;
      toState: string;
    }[];
  };
  assert.deepEqual(body.lifecycle, { initial: 'READY', final: 'DONE' });
  assert.deepEqual(
    body.states.map((state) => [state.stateKey, state.kind]),
    [
      ['READY', 'active'],
      ['DONE', 'final'],
    ],
  );
  assert.deepEqual(body.intents, [
    { intentId: 'complete', admitted: true, fromState: 'READY', toState: 'DONE' },
  ]);

  // Tool: one effect=none operation + one effectful operation; the provided
  // capability is exactly the one the Workflow requires (capability
  // dependency), and the typed relation binds the same endpoints (graph
  // composition).
  const toolBody = tool.semanticBody as unknown as {
    operations: readonly { operationId: string; effect: string }[];
    providesCapabilities: readonly { capabilityId: string; version: string }[];
  };
  const effectsByOp = new Map(toolBody.operations.map((op) => [op.operationId, op.effect]));
  assert.equal(effectsByOp.get(T010A_OP_READ), 'none');
  assert.equal(effectsByOp.get(T010A_OP_RECORD), 'idempotent');
  assert.deepEqual(toolBody.providesCapabilities, [T010A_CAPABILITY]);
  assert.deepEqual(workflow.requiredCapabilities, [T010A_CAPABILITY]);
  assert.deepEqual(graph.relations[0], {
    relationId: T010A_RELATION_ID,
    relationKind: 'uses-capability',
    sourceComponentId: T010A_WORKFLOW_COMPONENT_ID,
    targetComponentId: T010A_TOOL_COMPONENT_ID,
  });
});

test('T010A bullet 1: graph composition is normalized and relation material is part of Definition identity', async () => {
  const graph = t010aDefinitionGraph();
  const digest = await computeDefinitionGraphDigest(graph, t010aSha256);

  // Component order permutation must not change identity.
  const permuted: DefinitionGraphEnvelope = {
    ...graph,
    components: [graph.components[1]!, graph.components[0]!],
  };
  assert.equal(await computeDefinitionGraphDigest(permuted, t010aSha256), digest);

  // Dropping the relation changes identity (relations are included exactly
  // once); duplicating it fails closed typed.
  const withoutRelation = await computeDefinitionGraphDigest(
    { ...graph, relations: [] },
    t010aSha256,
  );
  assert.notEqual(withoutRelation, digest);
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope({
        ...graph,
        relations: [graph.relations[0]!, graph.relations[0]!],
      }),
    (error: unknown) =>
      error instanceof DefinitionGraphContractError && error.code === 'DUPLICATE_RELATION',
  );
});

// ---------------------------------------------------------------------------
// Frozen-bullet 6 (asserted at the Definition plane): test-namespace
// identity only — non-product, non-Standard, non-self-referential.
// ---------------------------------------------------------------------------

test('T010A bullet 6: fixture identities are test-namespace only (non-product, non-Standard, non-self-referential)', () => {
  const graph = t010aDefinitionGraph();
  const identities: string[] = [graph.graphId];
  for (const component of graph.components) {
    validateComponentEnvelope(component);
    identities.push(
      component.componentId,
      component.kind.kindId,
      ...component.requiredCapabilities.map((ref) => ref.capabilityId),
      ...component.requiredCapabilities.map((ref) => ref.version),
    );
    if (component.family === 'tool') {
      const body = component.semanticBody as unknown as {
        operations: readonly { operationId: string }[];
        providesCapabilities: readonly { capabilityId: string; version: string }[];
      };
      identities.push(
        ...body.operations.map((operation) => operation.operationId),
        ...body.providesCapabilities.map((ref) => ref.capabilityId),
        ...body.providesCapabilities.map((ref) => ref.version),
      );
    }
    if (component.family === 'semantic') {
      const body = component.semanticBody as unknown as { workflowKey: string };
      identities.push(body.workflowKey);
    }
  }
  for (const relation of graph.relations) {
    identities.push(relation.relationId);
  }
  for (const identity of identities) {
    assert.ok(
      identity.includes('t010a') || /^\d+\.\d+\.\d+$/.test(identity),
      `fixture identity "${identity}" must live in the t010a test namespace`,
    );
  }

  // The relation kind stays an exact, non-floating open identity string.
  const relationKind = graph.relations[0]!.relationKind;
  assert.equal(relationKind, 'uses-capability');
  for (const floating of ['latest', 'current', 'active', 'default', '*']) {
    assert.ok(!relationKind.includes(floating));
  }

  // Non-Standard: ordinary semantic/tool envelopes only — no Standard
  // descriptor material (standardId/classification/descriptorVersion) is
  // representable on the envelopes.
  for (const component of graph.components) {
    assert.ok(component.family === 'semantic' || component.family === 'tool');
    const serialized = JSON.stringify(component);
    assert.ok(!serialized.includes('standardId'));
    assert.ok(!serialized.includes('descriptorVersion'));
    assert.ok(!serialized.includes('"classification"'));
  }

  // Non-self-referential: the fixture never names the harness/product itself.
  const serializedGraph = JSON.stringify(graph);
  for (const productMarker of ['domain-harness', 'microkernel', 'kaicreator']) {
    assert.ok(!serializedGraph.includes(productMarker));
  }
});

// ---------------------------------------------------------------------------
// Frozen-bullet 2: must-understand admission of the admitted intent
// `complete` through the sealed Assembly-bound port.
// ---------------------------------------------------------------------------

test('T010A bullet 2: Assembly-bound must-understand admission passes the frozen READY -> DONE / intent-`complete` semantics', async () => {
  const bundle = await buildT010aAssembly();
  const admission = await admitComponentWithAssembly(t010aWorkflowComponent(), bundle.assembly, {
    currentDefinitionGraph: bundle.graph,
    sha256: t010aSha256,
  });
  assert.equal(admission.status, 'ADMITTED');
  assert.equal(admission.componentId, T010A_WORKFLOW_COMPONENT_ID);
  assert.deepEqual(admission.admittedKind, T010A_KIND);
  assert.deepEqual(admission.admittedKindImplementation.implementation, T010A_KIND_IMPLEMENTATION);
  assert.deepEqual(admission.admittedCapabilities, [T010A_CAPABILITY]);
  assert.equal(admission.definitionGraphDigest, bundle.definitionGraphDigest);
});

test('T010A bullet 2: the Tool Component is admitted through the same Kind port via the public T003A validator', async () => {
  const bundle = await buildT010aAssembly();
  const admission = await admitComponentWithAssembly(t010aToolComponent(), bundle.assembly, {
    currentDefinitionGraph: bundle.graph,
    sha256: t010aSha256,
  });
  assert.equal(admission.status, 'ADMITTED');
  assert.equal(admission.componentId, T010A_TOOL_COMPONENT_ID);
});

test('T010A bullet 2: unknown/unadmitted intents fail closed at must-understand admission (validator failure propagates unchanged)', async (t) => {
  const bundle = await buildT010aAssembly();
  const withBody = (mutate: (body: Record<string, unknown>) => void): ComponentEnvelope => {
    const workflow = t010aWorkflowComponent();
    const body = JSON.parse(JSON.stringify(workflow.semanticBody)) as Record<string, unknown>;
    mutate(body);
    return { ...workflow, semanticBody: body as unknown as JsonValue };
  };

  await t.test('an extra unknown intent is not understood and fails closed', async () => {
    await assert.rejects(
      admitComponentWithAssembly(
        withBody((body) => {
          const intents = body['intents'] as unknown[];
          intents.push({
            intentId: 'archive',
            admitted: true,
            fromState: 'DONE',
            toState: 'READY',
          });
        }),
        bundle.assembly,
        { currentDefinitionGraph: bundle.graph, sha256: t010aSha256 },
      ),
      /must-understand fail-closed/,
    );
  });

  await t.test('the intent `complete` must be admitted (admitted=false fails closed)', async () => {
    await assert.rejects(
      admitComponentWithAssembly(
        withBody((body) => {
          const intents = body['intents'] as { admitted: boolean }[];
          intents[0]!.admitted = false;
        }),
        bundle.assembly,
        { currentDefinitionGraph: bundle.graph, sha256: t010aSha256 },
      ),
      /unadmitted intent/,
    );
  });

  await t.test('a different lifecycle is not understood and fails closed', async () => {
    await assert.rejects(
      admitComponentWithAssembly(
        withBody((body) => {
          body['lifecycle'] = { initial: 'NEW', final: 'DONE' };
        }),
        bundle.assembly,
        { currentDefinitionGraph: bundle.graph, sha256: t010aSha256 },
      ),
      /must-understand fail-closed/,
    );
  });

  await t.test('an unbound exact Kind version fails closed (no fallback Kind exists)', async () => {
    const workflow = t010aWorkflowComponent();
    const wrongKind: ComponentEnvelope = {
      ...workflow,
      kind: { kindId: T010A_KIND.kindId, version: '2.0.0' },
    };
    await assert.rejects(
      admitComponentWithAssembly(wrongKind, bundle.assembly, {
        currentDefinitionGraph: bundle.graph,
        sha256: t010aSha256,
      }),
      (error: unknown) =>
        error instanceof RuntimeAssemblyError &&
        error.code === 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
    );
  });

  await t.test('a Tool with duplicate operation ids fails through the T003A validator unchanged', async () => {
    const tool = t010aToolComponent();
    const body = JSON.parse(JSON.stringify(tool.semanticBody)) as unknown as {
      operations: unknown[];
    };
    body.operations.push(body.operations[0]);
    await assert.rejects(
      admitComponentWithAssembly(
        { ...tool, semanticBody: body as unknown as JsonValue },
        bundle.assembly,
        { currentDefinitionGraph: bundle.graph, sha256: t010aSha256 },
      ),
      (error: unknown) => error instanceof ToolComponentContractError,
    );
  });
});

// ---------------------------------------------------------------------------
// Shared assembly/port fixture for the invocation paths.
// ---------------------------------------------------------------------------

interface BoundFixture {
  bundle: T010aAssemblyBundle;
  executor: T010aTestExecutor;
  binding: SealedToolImplementationBinding;
}

async function boundFixture(): Promise<BoundFixture> {
  const bundle = await buildT010aAssembly();
  const executor = new T010aTestExecutor();
  const binding = await bindT010aTool(bundle, executor);
  return { bundle, executor, binding };
}

// ---------------------------------------------------------------------------
// Frozen-bullet 1/5: Workflow requiredCapability -> T003B exact provider
// selection -> T003C exact implementation/currentness binding, through the
// same public ports. T003E Tool-to-Tool closure is NOT CLAIMED / NOT
// EXERCISED by T010A (T003E/E5 remains its sole owner).
// ---------------------------------------------------------------------------

test('T010A bullet 1/5: the Workflow requiredCapability resolves to exactly the one Tool provider via T003B and binds the exact implementation via T003C', async () => {
  const bundle = await buildT010aAssembly();

  // Exactly one compatible provider; selection is deterministic across
  // repeated calls and graph order permutations (no registry/source-order
  // authority).
  const digest = bundle.definitionGraphDigest;
  const selection = await resolveCurrentCapabilityProvider(
    bundle.graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    digest,
    t010aSha256,
  );
  const permuted: DefinitionGraphEnvelope = {
    ...bundle.graph,
    components: [bundle.graph.components[1]!, bundle.graph.components[0]!],
  };
  const permutedSelection = await resolveCurrentCapabilityProvider(
    permuted,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    digest,
    t010aSha256,
  );
  assert.deepEqual(permutedSelection, selection);
  assert.ok(JSON.stringify(selection).includes(T010A_TOOL_COMPONENT_ID));

  // Zero compatible providers fail closed with the owning typed taxonomy:
  // a consumer variant that requires a capability nobody provides.
  const absentConsumerGraph: DefinitionGraphEnvelope = {
    ...bundle.graph,
    components: [
      {
        ...t010aWorkflowComponent(),
        requiredCapabilities: [{ capabilityId: 'cap.t010a.absent', version: '1.0.0' }],
      },
      bundle.graph.components[1]!,
    ],
  };
  const absentDigest = await computeDefinitionGraphDigest(absentConsumerGraph, t010aSha256);
  await assert.rejects(
    resolveCurrentCapabilityProvider(
      absentConsumerGraph,
      { capabilityId: 'cap.t010a.absent', version: '1.0.0' },
      T010A_WORKFLOW_COMPONENT_ID,
      absentDigest,
      t010aSha256,
    ),
    (error: unknown) =>
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

test('T010A bullet 5: exact Tool implementation binds through the T003C port; the opaque handle is the original executor reference (no private shortcut)', async () => {
  const { bundle, executor, binding } = await boundFixture();

  // Exact verified pin; successor Assembly identity split; Definition
  // identity unchanged.
  assert.deepEqual(binding.evidence.implementation, T010A_TOOL_IMPLEMENTATION);
  assert.equal(
    binding.successorAssembly.record.definitionGraphDigest,
    bundle.definitionGraphDigest,
  );
  assert.notEqual(binding.successorAssembly.assemblyDigest, bundle.assembly.assemblyDigest);
  // The handle paired by the T003C mint is the ORIGINAL executor reference —
  // no clone, no re-read, no side channel.
  assert.equal(binding.implementationHandle, executor);

  // The public consumer verifier accepts the binding against the successor
  // Assembly under the exact pin.
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    expectedImplementationPin: T010A_TOOL_IMPLEMENTATION,
    sha256: t010aSha256,
  });
  assert.equal(verified.implementationHandle, executor);
});

// ---------------------------------------------------------------------------
// Issue #908 P1-1 guard: T003E Tool-to-Tool closure is NOT CLAIMED / NOT
// EXERCISED by T010A. T003E/E5 remains the sole owner of Tool-to-Tool
// closure evidence; this fixture binds no second Tool and no
// self-provision edge.
// ---------------------------------------------------------------------------

test('T010A guard: T003E Tool-to-Tool closure is NOT CLAIMED / NOT EXERCISED by T010A (sole owner: T003E/E5)', () => {
  const graph = t010aDefinitionGraph();

  // Exactly one Workflow + one Tool + one explicit relation; the relation
  // source is the Workflow Semantic Component — there is no Tool->Tool edge
  // and no second Tool / self-provision edge to close over.
  assert.equal(graph.components.filter((component) => component.family === 'tool').length, 1);
  assert.equal(
    graph.components.filter((component) => component.family === 'semantic').length,
    1,
  );
  assert.equal(graph.relations.length, 1);
  assert.equal(graph.relations[0]!.sourceComponentId, T010A_WORKFLOW_COMPONENT_ID);
  assert.equal(graph.relations[0]!.targetComponentId, T010A_TOOL_COMPONENT_ID);
  assert.equal(graph.relations[0]!.relationKind, 'uses-capability');

  // The relation is Definition graph composition/identity only: it records
  // across which endpoints the Workflow's capability dependency composes.
  // Its presence/order/kind/endpoints are never provider-selection or
  // authorization authority — selection authority is exclusively the T003B
  // port over the consumer's declared requiredCapabilities.
  const workflow = graph.components.find(
    (component) => component.componentId === T010A_WORKFLOW_COMPONENT_ID,
  )!;
  assert.deepEqual(workflow.requiredCapabilities, [T010A_CAPABILITY]);
});

// ---------------------------------------------------------------------------
// Issue #908 P1-2: the ONE literal source-controlled freeze record is
// recomputed through the accepted public APIs and deep-compared. Any change
// to the DefinitionGraphDigest, a KindImplementation pin, the T003C binding
// evidence/bindingDigest, or the final Assembly digest/currentness slot
// fails this test — the expected record is never auto-refreshed.
// ---------------------------------------------------------------------------

test('T010A freeze record: recomputation through the accepted public APIs deep-matches the literal freeze record', async () => {
  const graph = t010aDefinitionGraph();
  const bundle = await buildT010aAssembly();

  // T003B: the Workflow's exact requiredCapability resolves to the one
  // Domain Tool provider (deterministically, order-independent).
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    t010aSha256,
  );
  assert.equal(selection.provider.componentId, T010A_TOOL_COMPONENT_ID);
  assert.equal(selection.provider.family, 'tool');
  assert.deepEqual(selection.requiredCapability, T010A_CAPABILITY);

  // T003C: the exact Tool implementation binds into the successor Assembly.
  const binding = await bindT010aTool(bundle, new T010aTestExecutor());

  const workflow = graph.components.find(
    (component) => component.componentId === T010A_WORKFLOW_COMPONENT_ID,
  )!;
  const tool = graph.components.find(
    (component) => component.componentId === T010A_TOOL_COMPONENT_ID,
  )!;
  const toolBody = tool.semanticBody as unknown as {
    operations: readonly { operationId: string; effect: string }[];
  };

  // Recompute the exact freeze-record identity through the same accepted
  // APIs that produced the literal (no local canonicalization/digest code).
  const recomputed = {
    schema: 't010a.freeze-record/v1',
    semantic: {
      graphId: graph.graphId,
      workflowComponentId: workflow.componentId,
      toolComponentId: tool.componentId,
      relationId: graph.relations[0]!.relationId,
      relationKind: graph.relations[0]!.relationKind,
      workflowKindRef: workflow.kind,
      toolKindRef: tool.kind,
      capabilityRef: T010A_CAPABILITY,
      operations: toolBody.operations.map((operation) => ({
        operationId: operation.operationId,
        effect: operation.effect,
      })),
    },
    definition: {
      definitionGraphDigest: bundle.definitionGraphDigest,
    },
    kindImplementation: {
      // Both roles bind the SAME accepted pin; roles recorded explicitly.
      workflowRole: bundle.assembly.record.kindImplementations[0]!,
      toolRole: bundle.assembly.record.kindImplementations[0]!,
    },
    toolBinding: binding.evidence,
    finalAssembly: {
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      kindImplementations: binding.successorAssembly.record.kindImplementations,
      implementationBindingEvidence:
        binding.successorAssembly.record.implementationBindingEvidence,
    },
  };

  assert.deepEqual(recomputed, T010A_FREEZE_RECORD);

  // T003C currentness: the public consumer verifier accepts the binding
  // against the exact final successor Assembly under the exact pin, and the
  // Assembly's §G evidence slot carries exactly this binding's bindingDigest
  // — the frozen T003C binding IS the current final-Assembly slot.
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: binding.successorAssembly,
    expectedImplementationPin: T010A_TOOL_IMPLEMENTATION,
    sha256: t010aSha256,
  });
  assert.equal(verified.implementationHandle, binding.implementationHandle);
  assert.deepEqual(binding.successorAssembly.record.implementationBindingEvidence, [
    {
      subject: T010A_TOOL_COMPONENT_ID,
      bindingDigest: binding.evidence.bindingDigest,
    },
  ]);
  assert.equal(
    binding.successorAssembly.record.definitionGraphDigest,
    bundle.definitionGraphDigest,
  );
});

test('T010A freeze record: serializable data only — no handle/function/executor/recorder/resource-handle/secret/host-ambient material', () => {
  // JSON round-trip is identity: the record is pure serializable data.
  assert.deepEqual(JSON.parse(JSON.stringify(T010A_FREEZE_RECORD)), T010A_FREEZE_RECORD);

  // Negative key/value walk: runtime handles, functions, executors,
  // effect recorders, ResourceProvider handles, secrets/tokens/connections,
  // Central Admission journal objects, host paths and host-supplied
  // timestamps/ambient identity are structurally absent.
  const forbiddenKeyMarkers = [
    'handle',
    'secret',
    'token',
    'connection',
    'executor',
    'recorder',
    'journal',
    'hostpath',
    'timestamp',
  ];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) {
        visit(entry, `${path}[${index}]`);
      }
      return;
    }
    if (typeof value === 'object' && value !== null) {
      for (const [key, entry] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        for (const marker of forbiddenKeyMarkers) {
          assert.ok(
            !lowerKey.includes(marker),
            `freeze record key "${path}.${key}" must not contain runtime/ambient marker "${marker}"`,
          );
        }
        visit(entry, `${path}.${key}`);
      }
      return;
    }
    assert.ok(
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
      `freeze record leaf at ${path} must be serializable scalar data`,
    );
  };
  visit(T010A_FREEZE_RECORD, 'record');
});

// ---------------------------------------------------------------------------
// Frozen-bullet 3: effect=none path through the T004B seam.
// ---------------------------------------------------------------------------

test('T010A bullet 3: the effect=none operation invokes through T004B as OBSERVED only, with no transition/business authority', async () => {
  const { bundle, executor, binding } = await boundFixture();
  const input = { note: 't010a-read' };
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, input);

  const calls: NonEffectfulToolDispatchQuery[] = [];
  const result = await invokeNonEffectfulTool({
    request: admitted,
    binding,
    currentDefinitionGraph: bundle.graph,
    dispatch: {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    },
    sha256: t010aSha256,
  });

  // OBSERVED ≠ authoritative: no effect, no occurrence, no journal material.
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.toolComponentId, T010A_TOOL_COMPONENT_ID);
  assert.equal(result.operationId, T010A_OP_READ);
  assert.deepEqual(result.output, { observed: true, observationCount: 1 });
  assert.deepEqual(result.implementation, T010A_TOOL_IMPLEMENTATION);
  assert.equal(result.definitionGraphDigest, bundle.definitionGraphDigest);
  assert.equal(result.assemblyDigest, binding.successorAssembly.assemblyDigest);
  assert.equal(result.bindingDigest, binding.evidence.bindingDigest);

  // The dispatch went through the SAME paired handle; the read operation is
  // not narrowed to the resource requirement, so no resource was demanded.
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.handle, binding.implementationHandle);
  assert.deepEqual(calls[0]!.input, input);
  assert.equal(calls[0]!.resources.size, 0);

  // The executor observed but never effected.
  assert.equal(executor.observations().length, 1);
  assert.equal(executor.effects().length, 0);
});

test('T010A bullet 3: an effectful operation never enters the T004B path (typed fail-closed before dispatch)', async () => {
  const { bundle, executor, binding } = await boundFixture();
  const admitted = await admitT010aOperation(
    binding,
    bundle,
    T010A_OP_RECORD,
    { note: 't010a-via-t004b' },
  );
  const calls: NonEffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeNonEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: bundle.graph,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof NonEffectfulInvocationError &&
      error.code === 'EFFECTFUL_OPERATION_REJECTED',
  );
  assert.equal(calls.length, 0);
  assert.equal(executor.effects().length, 0);
  assert.equal(executor.observations().length, 0);
});

test('T010A bullet 3/5: a stale Definition graph fails closed at the T004B re-admission before any dispatch', async () => {
  const { bundle, executor, binding } = await boundFixture();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, { note: 'x' });
  const base = t010aDefinitionGraph();
  const workflow = base.components[0]!;
  const movedGraph: DefinitionGraphEnvelope = {
    ...base,
    components: [
      {
        ...workflow,
        semanticBody: { ...(workflow.semanticBody as object), note: 'MUTATED' },
      },
      base.components[1]!,
    ],
  };
  const calls: NonEffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeNonEffectfulTool({
      request: admitted,
      binding,
      currentDefinitionGraph: movedGraph,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'DEFINITION_CURRENTNESS_MISMATCH',
  );
  assert.equal(calls.length, 0);
  assert.equal(executor.observations().length, 0);
});

// ---------------------------------------------------------------------------
// Frozen-bullet 4: effectful path through T004C + Central Admission under
// ONE already-authoritative PRODUCTION occurrence.
// ---------------------------------------------------------------------------

interface EffectfulFx {
  readonly admitted: AdmittedToolInvocationRequest;
  readonly activator: AssemblyExecutionActivator;
  readonly admissionRequest: CentralAdmissionRequest;
  readonly admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  readonly resourceProvider?: ResourceProvider;
}

function effectfulInput(
  binding: SealedToolImplementationBinding,
  bundle: T010aAssemblyBundle,
  fx: EffectfulFx,
  dispatch: { dispatch: (query: EffectfulToolDispatchQuery) => Promise<unknown> },
): InvokeEffectfulToolInput {
  return {
    request: fx.admitted,
    binding,
    currentDefinitionGraph: bundle.graph,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    effectType: T010A_EFFECT_TYPE,
    dispatch,
    sha256: t010aSha256,
    ...(fx.resourceProvider === undefined ? {} : { resourceProvider: fx.resourceProvider }),
  } as InvokeEffectfulToolInput;
}

async function effectfulFixture(
  operationId: string,
  input: { note: string },
  options: { readonly skipActivation?: boolean } = {},
): Promise<BoundFixture & EffectfulFx> {
  const { bundle, executor, binding } = await boundFixture();
  const fx = await buildT010aOccurrenceContext(binding, bundle, {
    effectInput: input,
    ...(options.skipActivation === undefined ? {} : { skipActivation: options.skipActivation }),
  });
  const admitted = await admitT010aOperation(binding, bundle, operationId, input);
  return {
    bundle,
    executor,
    binding,
    admitted,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
    resourceProvider: t010aResourceProvider(),
  };
}

test('T010A bullet 4: the effectful operation executes through T004C/Central Admission — READY -> DONE via `complete` with exactly one durable journal record', async () => {
  const input = { note: 't010a-effect-1' };
  const fx = await effectfulFixture(T010A_OP_RECORD, input);

  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool(
    effectfulInput(fx.binding, fx.bundle, fx, {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    }),
  );

  // The admitted transition is exactly the fixture lifecycle READY -> DONE
  // via the admitted intent `complete`.
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.transitionKey, 'complete');
  assert.equal(result.outcome.admitted.targetState, 'DONE');
  assert.equal(result.outcome.admitted.effects.length, 1);
  const effect = result.outcome.admitted.effects[0]!;
  assert.equal(effect.disposition, 'executed');
  assert.deepEqual(effect.output, { recorded: true, effectCount: 1 });

  // Durable effect identity derives from the SAME occurrence turn lineage.
  const turnId = deriveDurableControlTurnId(T010A_OCCURRENCE_TARGET, {
    kind: 'message',
    sourceMessageId: 'msg:t010a:1',
  });
  assert.equal(effect.effectId, `${turnId}/effect/1`);

  // Exactly one dispatch of the VERIFIED handle with the admitted
  // operation/input and the required resource resolved through the injected
  // test ResourceProvider (the same public T005B port).
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  assert.equal(query.handle, fx.binding.implementationHandle);
  assert.equal(query.operationId, T010A_OP_RECORD);
  assert.deepEqual(query.input, input);
  assert.equal(query.effectId, effect.effectId);
  assert.equal(query.durableControlTurnId, turnId);
  assert.equal(query.operationOrdinal, 1);
  assert.equal(query.idempotencyKey, T010A_IDEMPOTENCY_KEY);
  assert.equal(query.logicalTime, T010A_NOW);
  assert.equal(query.resources.size, 1);
  const resource = query.resources.get(T010A_RESOURCE_KEY);
  assert.equal(resource?.status, 'resolved');
  if (resource?.status === 'resolved') {
    assert.deepEqual(resource.currentnessPin, {
      providerId: 'provider.t010a-test',
      resourceKey: T010A_RESOURCE_KEY,
      revisionDigest: 'sha256:t010a-audit-log-revision-v1',
    });
  }

  // Exactly ONE durable record exists: on the ONE existing Central Admission
  // journal. The deterministic test-only recorder mirrored the effect input
  // for assertions but is never consulted by any seam — it cannot become a
  // second journal.
  const journal = (fx.admissionPorts as unknown as {
    effectJournal: { getRecords(): readonly unknown[] };
  }).effectJournal;
  const records = journal.getRecords() as readonly {
    effectId: string;
    status: string;
    effectType: string;
    effectSemantics: string;
    input: unknown;
    durableControlTurnId: string;
  }[];
  assert.equal(records.length, 1);
  assert.equal(records[0]!.effectId, effect.effectId);
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectType, T010A_EFFECT_TYPE);
  assert.equal(records[0]!.effectSemantics, 'idempotent');
  assert.deepEqual(records[0]!.input, input);
  assert.equal(records[0]!.durableControlTurnId, turnId);
  assert.equal(fx.executor.effects().length, 1);
  assert.deepEqual(fx.executor.effects()[0], { operationId: T010A_OP_RECORD, input });

  // Occurrence-bound result identity; no live handle in the result.
  assert.equal(result.occurrence.workflowTarget, T010A_WORKFLOW_TARGET);
  assert.equal(result.occurrence.workflowInstanceId, T010A_WORKFLOW_INSTANCE_ID);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.deepEqual(result.invocation.implementation, T010A_TOOL_IMPLEMENTATION);
  assert.ok(!JSON.stringify(result).includes('t010a-test-audit-log'));
  assert.ok(Object.isFrozen(result));
});

test('T010A bullet 4: the effect=none operation never enters the T004C path (typed fail-closed before dispatch and before any journal record)', async () => {
  const fx = await effectfulFixture(T010A_OP_READ, { note: 'none' });

  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool(
      effectfulInput(fx.binding, fx.bundle, fx, {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      }),
    ),
    (error: unknown) =>
      error instanceof EffectfulInvocationError && error.code === 'EFFECTLESS_OPERATION_REJECTED',
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.executor.effects().length, 0);
});

test('T010A bullet 4: no already-authoritative occurrence pin fails closed at the T002C gate before any dispatch or journal record', async () => {
  const fx = await effectfulFixture(T010A_OP_RECORD, { note: 'x' }, { skipActivation: true });

  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool(
      effectfulInput(fx.binding, fx.bundle, fx, {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      }),
    ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.executor.effects().length, 0);
});

test('T010A bullet 4/5: the required resource without the injected provider fails closed (MISSING_RESOURCE_PROVIDER) before dispatch; with the provider the same port resolves it', async () => {
  const input = { note: 't010a-provider' };
  const fx = await effectfulFixture(T010A_OP_RECORD, input);

  const calls: EffectfulToolDispatchQuery[] = [];
  const withoutProvider: EffectfulFx = {
    admitted: fx.admitted,
    activator: fx.activator,
    admissionRequest: fx.admissionRequest,
    admissionPorts: fx.admissionPorts,
  };
  await assert.rejects(
    invokeEffectfulTool(
      effectfulInput(fx.binding, fx.bundle, withoutProvider, {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      }),
    ),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'MISSING_RESOURCE_PROVIDER',
  );
  assert.equal(calls.length, 0);
  assert.equal(fx.executor.effects().length, 0);

  // With the provider injected through the same public port, resolution
  // succeeds and the effect executes once.
  const result = await invokeEffectfulTool(
    effectfulInput(fx.binding, fx.bundle, fx, {
      async dispatch(query) {
        calls.push(query);
        return (query.handle as T010aTestExecutor).run(query.operationId, query.input);
      },
    }),
  );
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.resources.get(T010A_RESOURCE_KEY)?.status, 'resolved');
  assert.equal(fx.executor.effects().length, 1);
});

// ---------------------------------------------------------------------------
// Frozen-bullet 5 (closing): caller-built shortcut material is
// unrepresentable — a forged binding lookalike fails at the T003C mint seam.
// ---------------------------------------------------------------------------

test('T010A bullet 5: a forged binding lookalike fails at the T003C mint seam (no private runtime shortcut)', async () => {
  const { bundle, executor, binding } = await boundFixture();
  const admitted = await admitT010aOperation(binding, bundle, T010A_OP_READ, { note: 'x' });
  const lookalike = {
    evidence: { ...binding.evidence },
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;
  const calls: NonEffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeNonEffectfulTool({
      request: admitted,
      binding: lookalike,
      currentDefinitionGraph: bundle.graph,
      dispatch: {
        async dispatch(query) {
          calls.push(query);
          return null;
        },
      },
      sha256: t010aSha256,
    }),
    (error: unknown) =>
      error instanceof Error &&
      (error as { code?: string }).code === 'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
  assert.equal(calls.length, 0);
  assert.equal(executor.observations().length, 0);
});

test('T010A: the fixture Kind validator is the exact function sealed into the Assembly (no second admission channel)', async () => {
  // Sealing consumed the exported fixture validator; admission invokes the
  // sealed reference — one validator, one channel.
  const bundle = await buildT010aAssembly();
  const sealedValidator = bundle.assembly.bindings[0]!.validateComponent;
  assert.equal(sealedValidator, t010aKindValidator);
  // Both frozen component shapes pass through the sealed reference; a
  // malformed Tool body still fails through the T003A validator unchanged.
  sealedValidator(t010aWorkflowComponent());
  sealedValidator(t010aToolComponent());
  const malformedTool = t010aToolComponent();
  const malformedBody = JSON.parse(JSON.stringify(malformedTool.semanticBody)) as unknown as {
    operations: unknown[];
  };
  malformedBody.operations.push(malformedBody.operations[0]);
  assert.throws(
    () =>
      sealedValidator({
        ...malformedTool,
        semanticBody: malformedBody as unknown as import('../../src/contracts/json.js').JsonValue,
      }),
    ToolComponentContractError,
  );
  // Caller provenance carries no authority.
  assert.equal(t010aCaller().callerKind, 'workflow');
});
