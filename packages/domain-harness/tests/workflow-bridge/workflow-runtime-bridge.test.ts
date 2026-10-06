/**
 * T007B compile/run engine-policy matrix (issue #620, fine-grained DAG T007B,
 * authority #589 PACK-C).
 *
 * Pins the bridge half of the PACK-C T007B checklist that touches the EXISTING
 * runtime: an admitted Workflow Semantic Component is privately translated
 * into the engine-neutral Domain Workflow definition and executed through the
 * existing internal XState boundary — the shipped XState engine remains the
 * one Runtime/transition execution anchor (no parallel v0.7 engine exists).
 *
 * - compile/run via the existing runtime: events move the actor through the
 *   declared transition graph; unknown events leave the state unchanged;
 * - exact Kind implementation binding: only the exact
 *   `kaicreator.workflow@1.0.0` Kind is served, only through a sealed
 *   Assembly that binds it (T007A factory), dispatched through the sealed
 *   validator handle — never a raw validator;
 * - engine-side policy for the T007A P2-2 findings (routed to T007B by review
 *   issuecomment-5989873345), decided per EXISTING engine semantics without
 *   widening the T007A validator:
 *     - unreferenced ("dead") states are accepted as inert states (the
 *       existing boundary maps a state without transitions to a state
 *       without `on`);
   *     - duplicate (event, from) transitions carry an explicit canonical
   *       route identity in the existing engine-neutral route-selection shape
   *       (sourceStateId, routeClass 'event', routeIndex, eventType);
   *       event-only selection among more than one eligible route fails
   *       typed/closed — never first-declared, never array position 0;
 *     - self-transitions behave as ordinary engine self-transitions;
 * - representation limits of the existing engine fail typed and closed at
 *   COMPILE time (never a fallback to Raw/legacy semantics):
 *     - eventless transitions have no trigger in the existing engine trigger
 *       model (`WORKFLOW_EVENTLESS_TRANSITION_UNSUPPORTED`);
 *     - events unusable by the existing engine boundary (reserved internal
 *       namespace `@@domain-harness/`, unsafe record keys) are rejected via
 *       the engine's own provenance factory
 *       (`WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE`);
 * - a caller-constructed "compiled artifact" is not a minted artifact and is
 *   rejected before any execution (`UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  sealRuntimeAssembly,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  WORKFLOW_KIND_REF,
  WorkflowKindAdapterError,
  createWorkflowKindImplementation,
} from '../../src/adapters/workflow-kind.js';
import {
  WorkflowBridgeError,
  compileWorkflowComponent,
  runCompiledWorkflow,
  type CompiledWorkflowArtifact,
  type WorkflowBridgeEvent,
} from '../../src/adapters/workflow-runtime-bridge.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const NEUTRAL_KIND = { kindId: 'test.semantic.neutral', version: '1.0.0' } as const;

function neutralComponent(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { ...NEUTRAL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'neutral test Kind' },
  };
}

interface BodySpec {
  initial: string;
  states: readonly string[];
  transitions: readonly {
    transitionId: string;
    from: string;
    to: string;
    event?: string;
  }[];
}

function workflowComponent(componentId: string, body: BodySpec): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: body.initial,
      states: body.states.map((stateId) => ({ stateId })),
      transitions: body.transitions.map((transition) => ({ ...transition })),
    },
  };
}

const LINEAR_BODY: BodySpec = {
  initial: 'start',
  states: ['start', 'middle', 'done'],
  transitions: [
    { transitionId: 't-advance', from: 'start', to: 'middle', event: 'advance' },
    { transitionId: 't-finish', from: 'middle', to: 'done', event: 'finish' },
  ],
};

function graphWith(workflow: ComponentEnvelope): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t007b',
    components: [neutralComponent('component.neutral'), workflow],
    relations: [],
  };
}

async function sealedAssemblyFor(
  graph: DefinitionGraphEnvelope,
  implementationDigest = 'sha256:workflow-engine-v1',
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [
        {
          pin: {
            kind: { ...NEUTRAL_KIND },
            implementation: {
              implementationId: 'impl.test.semantic.neutral',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:neutral-v1',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
        createWorkflowKindImplementation({
          implementation: {
            implementationId: 'impl.workflow.engine',
            implementationVersion: '1.0.0',
            implementationDigest,
          },
        }),
      ],
    },
    realSha256,
  );
}

interface Fixture {
  component: ComponentEnvelope;
  graph: DefinitionGraphEnvelope;
  sealed: SealedRuntimeAssembly;
}

async function fixture(body: BodySpec = LINEAR_BODY): Promise<Fixture> {
  const component = workflowComponent('component.workflow', body);
  const graph = graphWith(component);
  const sealed = await sealedAssemblyFor(graph);
  return { component, graph, sealed };
}

async function compileFixture(body: BodySpec = LINEAR_BODY): Promise<{
  fixture: Fixture;
  artifact: CompiledWorkflowArtifact;
}> {
  const fx = await fixture(body);
  const artifact = await compileWorkflowComponent({
    component: fx.component,
    sealedAssembly: fx.sealed,
    currentDefinitionGraph: fx.graph,
    sha256: realSha256,
  });
  return { fixture: fx, artifact };
}

function run(
  fx: Fixture,
  artifact: CompiledWorkflowArtifact,
  events: readonly WorkflowBridgeEvent[],
) {
  return runCompiledWorkflow({
    artifact,
    component: fx.component,
    sealedAssembly: fx.sealed,
    currentDefinitionGraph: fx.graph,
    sha256: realSha256,
    events,
  });
}

test('PACK-C T007B: compile translates admitted material and run executes on the existing runtime', async () => {
  const { fixture: fx, artifact } = await compileFixture();

  // Initial state with no events; then single and multi-event runs.
  assert.equal((await run(fx, artifact, [])).stateId, 'start');
  assert.equal((await run(fx, artifact, [{ type: 'advance' }])).stateId, 'middle');
  assert.equal(
    (await run(fx, artifact, [{ type: 'advance' }, { type: 'finish' }])).stateId,
    'done',
  );

  // An event no transition consumes leaves the actor in its current state
  // (ordinary existing-engine semantics; the bridge adds no policy).
  assert.equal((await run(fx, artifact, [{ type: 'finish' }])).stateId, 'start');
  assert.equal(
    (await run(fx, artifact, [{ type: 'unknown-event' }, { type: 'advance' }])).stateId,
    'middle',
  );
});

test('PACK-C T007B: the compiled artifact binds the exact admission evidence and is plain frozen data', async () => {
  const { fixture: fx, artifact } = await compileFixture();

  // The artifact identity IS the admission-evidence identity: exact Component,
  // DefinitionGraphDigest, assemblyDigest and the exact KindImplementation pin.
  assert.equal(artifact.identity.componentId, 'component.workflow');
  assert.equal(artifact.identity.definitionGraphDigest, fx.sealed.record.definitionGraphDigest);
  assert.equal(artifact.identity.assemblyDigest, fx.sealed.assemblyDigest);
  assert.deepEqual(artifact.identity.kindImplementation, {
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    implementation: {
      implementationId: 'impl.workflow.engine',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:workflow-engine-v1',
    },
  });
  assert.ok(artifact.identity.componentSemanticDigest.length > 0);

  // Every compiled transition carries its canonical explicit route identity
  // (single routes are routeIndex 0 of their (from, event) group).
  assert.deepEqual(artifact.routes, [
    {
      transitionId: 't-finish',
      sourceStateId: 'middle',
      routeClass: 'event',
      routeIndex: 0,
      eventType: 'finish',
    },
    {
      transitionId: 't-advance',
      sourceStateId: 'start',
      routeClass: 'event',
      routeIndex: 0,
      eventType: 'advance',
    },
  ]);

  // Digest material is provably free of engine handles: the whole artifact is
  // JSON-serializable plain data, frozen, with exactly the identity and the
  // canonical explicit route table as own keys.
  assert.deepEqual(Object.keys(artifact), ['identity', 'routes']);
  assert.ok(Object.isFrozen(artifact));
  assert.ok(Object.isFrozen(artifact.identity));
  assert.ok(Object.isFrozen(artifact.routes));
  for (const route of artifact.routes) {
    assert.ok(Object.isFrozen(route));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(artifact)), artifact);
});

test('PACK-C T007B: exact Kind binding — a non-Workflow component is rejected before any admission', async () => {
  const fx = await fixture();
  await assert.rejects(
    compileWorkflowComponent({
      component: neutralComponent('component.neutral'),
      sealedAssembly: fx.sealed,
      currentDefinitionGraph: fx.graph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'WORKFLOW_BRIDGE_KIND_MISMATCH');
      assert.equal(error.failureClass, 'KIND');
      return true;
    },
  );
});

test('PACK-C T007B: exact Kind binding — a sealed Assembly without a Workflow binding fails closed', async () => {
  // A graph that does not require the Workflow Kind seals without it.
  const neutralOnly: DefinitionGraphEnvelope = {
    graphId: 'graph.t007b.neutral-only',
    components: [neutralComponent('component.neutral')],
    relations: [],
  };
  const sealedNeutralOnly = await sealRuntimeAssembly(
    {
      definitionGraph: neutralOnly,
      kindImplementations: [
        {
          pin: {
            kind: { ...NEUTRAL_KIND },
            implementation: {
              implementationId: 'impl.test.semantic.neutral',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:neutral-v1',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );

  const fx = await fixture();
  await assert.rejects(
    compileWorkflowComponent({
      component: fx.component,
      sealedAssembly: sealedNeutralOnly,
      currentDefinitionGraph: neutralOnly,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'WORKFLOW_KIND_IMPLEMENTATION_NOT_BOUND');
      assert.equal(error.failureClass, 'KIND');
      return true;
    },
  );
});

test('PACK-C T007B: P2-2 policy — dead (unreferenced) states are inert per existing engine semantics', async () => {
  const { fixture: fx, artifact } = await compileFixture({
    initial: 'start',
    states: ['start', 'done', 'stranded'],
    transitions: [{ transitionId: 't-finish', from: 'start', to: 'done', event: 'finish' }],
  });

  // The T007A validator admits the dead state; the bridge inherits it and the
  // existing engine maps it to a state without transitions — never a rejection.
  assert.equal((await run(fx, artifact, [])).stateId, 'start');
  assert.equal((await run(fx, artifact, [{ type: 'finish' }])).stateId, 'done');
});

// Duplicate (from, event) transitions: two semantic routes for one event.
const DUPLICATE_BODY_DECLARED_FIRST: BodySpec = {
  initial: 'start',
  states: ['start', 'a', 'b', 'done'],
  transitions: [
    { transitionId: 't-first', from: 'start', to: 'a', event: 'go' },
    { transitionId: 't-second', from: 'start', to: 'b', event: 'go' },
    { transitionId: 't-finish', from: 'a', to: 'done', event: 'finish' },
  ],
};

// The same semantic transitions in a permuted declaration order: the
// semantic-transition -> compiled-route identity mapping must not move.
const DUPLICATE_BODY_PERMUTED: BodySpec = {
  initial: 'start',
  states: ['start', 'a', 'b', 'done'],
  transitions: [
    { transitionId: 't-second', from: 'start', to: 'b', event: 'go' },
    { transitionId: 't-finish', from: 'a', to: 'done', event: 'finish' },
    { transitionId: 't-first', from: 'start', to: 'a', event: 'go' },
  ],
};

// Canonical explicit route identity: routeIndex is assigned by transitionId
// order within each (from, event) group and rows are sorted by
// (sourceStateId, eventType, routeIndex) — never by declaration position.
const CANONICAL_DUPLICATE_ROUTES = [
  {
    transitionId: 't-finish',
    sourceStateId: 'a',
    routeClass: 'event',
    routeIndex: 0,
    eventType: 'finish',
  },
  {
    transitionId: 't-first',
    sourceStateId: 'start',
    routeClass: 'event',
    routeIndex: 0,
    eventType: 'go',
  },
  {
    transitionId: 't-second',
    sourceStateId: 'start',
    routeClass: 'event',
    routeIndex: 1,
    eventType: 'go',
  },
];

test('PACK-C T007B: duplicate (event, from) transitions carry an explicit canonical route identity, invariant under declaration permutation', async () => {
  const declaredFirst = await compileFixture(DUPLICATE_BODY_DECLARED_FIRST);
  const permuted = await compileFixture(DUPLICATE_BODY_PERMUTED);

  // The two components are semantically identical but NOT digest-identical
  // (declaration order is part of the semantic digest), so the identical
  // route table below is a structural guarantee, not a digest coincidence.
  assert.notEqual(
    declaredFirst.artifact.identity.componentSemanticDigest,
    permuted.artifact.identity.componentSemanticDigest,
  );

  assert.deepEqual(declaredFirst.artifact.routes, CANONICAL_DUPLICATE_ROUTES);
  assert.deepEqual(permuted.artifact.routes, CANONICAL_DUPLICATE_ROUTES);
});

test('PACK-C T007B: event-only selection with duplicate eligible routes fails typed and closed, deterministically (never array position 0)', async () => {
  const declaredFirst = await compileFixture(DUPLICATE_BODY_DECLARED_FIRST);
  const permuted = await compileFixture(DUPLICATE_BODY_PERMUTED);

  const messages: string[] = [];
  for (const compiled of [declaredFirst, permuted]) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(
        run(compiled.fixture, compiled.artifact, [{ type: 'go' }]),
        (error: unknown) => {
          assert.ok(error instanceof WorkflowBridgeError);
          assert.equal(error.code, 'WORKFLOW_EVENT_ROUTE_AMBIGUOUS');
          assert.equal(error.failureClass, 'POLICY');
          messages.push(error.message);
          return true;
        },
      );
    }
  }

  // Deterministic and permutation-invariant: the typed failure names the
  // canonical route identities and never depends on declaration order.
  assert.equal(new Set(messages).size, 1);
});

test('PACK-C T007B: execution with an explicit route identity selects exactly that route, independent of declaration permutation', async () => {
  for (const compiled of [
    await compileFixture(DUPLICATE_BODY_DECLARED_FIRST),
    await compileFixture(DUPLICATE_BODY_PERMUTED),
  ]) {
    const { fixture: fx, artifact } = compiled;
    assert.equal(
      (
        await run(fx, artifact, [
          { type: 'go', route: { sourceStateId: 'start', routeIndex: 0 } },
        ])
      ).stateId,
      'a',
    );
    assert.equal(
      (
        await run(fx, artifact, [
          { type: 'go', route: { sourceStateId: 'start', routeIndex: 1 } },
        ])
      ).stateId,
      'b',
    );
    // The explicit route identity composes with the rest of the graph; the
    // follow-up 'finish' is a plain event-only send on a single-route state
    // of a machine that also carries an ambiguous route group.
    assert.equal(
      (
        await run(fx, artifact, [
          { type: 'go', route: { sourceStateId: 'start', routeIndex: 0 } },
          { type: 'finish' },
        ])
      ).stateId,
      'done',
    );
  }
});

test('PACK-C T007B: an explicit route identity that does not resolve to exactly one eligible route fails typed and closed', async () => {
  const { fixture: fx, artifact } = await compileFixture(DUPLICATE_BODY_DECLARED_FIRST);

  const invalidSelections: readonly WorkflowBridgeEvent[] = [
    // routeIndex outside the canonical route group
    { type: 'go', route: { sourceStateId: 'start', routeIndex: 2 } },
    { type: 'go', route: { sourceStateId: 'start', routeIndex: -1 } },
    { type: 'go', route: { sourceStateId: 'start', routeIndex: 0.5 } },
    // route identity names a state the run is not at
    { type: 'go', route: { sourceStateId: 'elsewhere', routeIndex: 0 } },
    // event with no eligible route at all from the current state
    { type: 'finish', route: { sourceStateId: 'start', routeIndex: 0 } },
  ];
  for (const event of invalidSelections) {
    await assert.rejects(run(fx, artifact, [event]), (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'WORKFLOW_ROUTE_SELECTION_INVALID');
      assert.equal(error.failureClass, 'POLICY');
      return true;
    });
  }
});

test('PACK-C T007B: single-route event behavior is unchanged and explicit identity stays optional', async () => {
  const { fixture: fx, artifact } = await compileFixture(DUPLICATE_BODY_DECLARED_FIRST);

  // 'finish' has exactly one eligible route from 'a': a plain event-only send.
  assert.equal(
    (
      await run(fx, artifact, [
        { type: 'go', route: { sourceStateId: 'start', routeIndex: 0 } },
        { type: 'finish' },
      ])
    ).stateId,
    'done',
  );
  // An explicit single-route identity resolves to that one route.
  assert.equal(
    (
      await run(fx, artifact, [
        { type: 'go', route: { sourceStateId: 'start', routeIndex: 0 } },
        { type: 'finish', route: { sourceStateId: 'a', routeIndex: 0 } },
      ])
    ).stateId,
    'done',
  );
  // An event no transition consumes still leaves the actor unchanged.
  assert.equal(
    (
      await run(fx, artifact, [
        { type: 'go', route: { sourceStateId: 'start', routeIndex: 0 } },
        { type: 'unknown-event' },
      ])
    ).stateId,
    'a',
  );
});

test('PACK-C T007B: self-transitions behave as ordinary existing-engine self-transitions', async () => {
  const { fixture: fx, artifact } = await compileFixture({
    initial: 'start',
    states: ['start', 'done'],
    transitions: [
      { transitionId: 't-loop', from: 'start', to: 'start', event: 'loop' },
      { transitionId: 't-finish', from: 'start', to: 'done', event: 'finish' },
    ],
  });

  assert.equal((await run(fx, artifact, [{ type: 'loop' }])).stateId, 'start');
  assert.equal(
    (await run(fx, artifact, [{ type: 'loop' }, { type: 'finish' }])).stateId,
    'done',
  );
});

test('PACK-C T007B: eventless transitions fail typed and closed at compile (no fallback path)', async () => {
  const fx = await fixture({
    initial: 'start',
    states: ['start', 'done'],
    transitions: [{ transitionId: 't-auto', from: 'start', to: 'done' }],
  });

  await assert.rejects(
    compileWorkflowComponent({
      component: fx.component,
      sealedAssembly: fx.sealed,
      currentDefinitionGraph: fx.graph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'WORKFLOW_EVENTLESS_TRANSITION_UNSUPPORTED');
      assert.equal(error.failureClass, 'POLICY');
      return true;
    },
  );
});

test('PACK-C T007B: events unusable by the existing engine boundary fail typed and closed at compile', async () => {
  for (const event of ['__proto__', 'constructor']) {
    const fx = await fixture({
      initial: 'start',
      states: ['start', 'done'],
      transitions: [{ transitionId: 't-finish', from: 'start', to: 'done', event }],
    });

    await assert.rejects(
      compileWorkflowComponent({
        component: fx.component,
        sealedAssembly: fx.sealed,
        currentDefinitionGraph: fx.graph,
        sha256: realSha256,
      }),
      (error: unknown) => {
        assert.ok(error instanceof WorkflowBridgeError);
        assert.equal(error.code, 'WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE');
        assert.equal(error.failureClass, 'POLICY');
        return true;
      },
    );
  }
});

test('PACK-C T007B: engine-reserved namespace events fail closed at the sealed T007A validator, before the bridge', async () => {
  // The T007A closed-world validator rejects '@@'-carrying identities as
  // embedded-selector material, so the reserved internal event namespace never
  // even reaches translation — the sealed validator handle is consumed first
  // and its typed failure propagates unchanged (no bridge fallback).
  const fx = await fixture({
    initial: 'start',
    states: ['start', 'done'],
    transitions: [
      { transitionId: 't-finish', from: 'start', to: 'done', event: '@@domain-harness/timer/key' },
    ],
  });

  await assert.rejects(
    compileWorkflowComponent({
      component: fx.component,
      sealedAssembly: fx.sealed,
      currentDefinitionGraph: fx.graph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowKindAdapterError);
      assert.equal(error.code, 'INVALID_WORKFLOW_TRANSITION');
      assert.equal(error.failureClass, 'SEMANTIC');
      return true;
    },
  );
});

test('PACK-C T007B: a caller-constructed artifact is not a minted artifact and never executes', async () => {
  const { fixture: fx, artifact } = await compileFixture();

  // Hand-forged identity material that mirrors the minted artifact exactly —
  // still not a compiled artifact, because compilation (not identity shape) is
  // the minting act. WeakSet membership cannot be reproduced from public data.
  const forged = {
    identity: JSON.parse(JSON.stringify(artifact.identity)),
  } as CompiledWorkflowArtifact;

  await assert.rejects(run(fx, forged, [{ type: 'advance' }]), (error: unknown) => {
    assert.ok(error instanceof WorkflowBridgeError);
    assert.equal(error.code, 'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT');
    assert.equal(error.failureClass, 'TRUST');
    return true;
  });
});
