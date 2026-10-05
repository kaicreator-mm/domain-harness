/**
 * T007B stale-artifact currentness + replacement-seam + privacy matrix
 * (issue #620, fine-grained DAG T007B, authority #589 PACK-C).
 *
 * Pins the binding half of the PACK-C T007B checklist:
 *
 * - compilation results are bound to the exact DefinitionGraphDigest plus the
 *   assembly/KindImplementation currentness; every stale combination fails
 *   BEFORE any authoritative execution:
 *     - a replaced engine implementation (new sealed Assembly pin) rejects the
 *       old artifact (`STALE_COMPILED_WORKFLOW_ARTIFACT`);
 *     - Definition graph drift fails closed through the Assembly currentness
 *       recomputation (`RuntimeAssemblyError` ASSEMBLY_ADMISSION_CURRENTNESS_
 *       MISMATCH propagates unchanged);
 *     - a caller-supplied component whose semantic body drifted from the
 *       compiled body fails closed against the artifact's semantic digest;
 * - replacing the Workflow engine is an Assembly concern only: the same
 *   generic sealed-Assembly seam consumes the replacement pin, the
 *   DefinitionGraphDigest is untouched, and ZERO Microkernel source edits are
 *   involved (MICROKERNEL_SOURCE_DIFF=0 by construction);
 * - private XState typing: the adapter's exported surface never names an
 *   engine type, the compiled artifact's digest material is plain frozen
 *   JSON data (the engine machine handle is reachable only through a
 *   module-private registry), and the generic Microkernel contract files
 *   remain free of any engine import;
 * - no second runtime: the bridge executes exclusively through the existing
 *   internal XState boundary and the one shipped XState engine — no parallel
 *   v0.7 runtime engine, no new engine dependency.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  sealRuntimeAssembly,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  WORKFLOW_KIND_REF,
  createWorkflowKindImplementation,
} from '../../src/adapters/workflow-kind.js';
import {
  WorkflowBridgeError,
  compileWorkflowComponent,
  runCompiledWorkflow,
  type CompiledWorkflowArtifact,
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
    graphId: 'graph.t007b.currentness',
    components: [neutralComponent('component.neutral'), workflow],
    relations: [],
  };
}

async function sealedAssemblyFor(
  graph: DefinitionGraphEnvelope,
  implementationDigest: string,
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

async function fixture(
  body: BodySpec = LINEAR_BODY,
  implementationDigest = 'sha256:workflow-engine-v1',
): Promise<Fixture> {
  const component = workflowComponent('component.workflow', body);
  const graph = graphWith(component);
  const sealed = await sealedAssemblyFor(graph, implementationDigest);
  return { component, graph, sealed };
}

async function compileFx(fx: Fixture): Promise<CompiledWorkflowArtifact> {
  return compileWorkflowComponent({
    component: fx.component,
    sealedAssembly: fx.sealed,
    currentDefinitionGraph: fx.graph,
    sha256: realSha256,
  });
}

function run(
  fx: Fixture,
  artifact: CompiledWorkflowArtifact,
  events: readonly { type: string }[],
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

test('PACK-C T007B: a replaced engine implementation (new Assembly pin) rejects the stale artifact before execution', async () => {
  const v1 = await fixture();
  const v1Artifact = await compileFx(v1);

  // Same Definition graph, replacement engine implementation pin -> new
  // Assembly identity, unchanged Definition identity.
  const v2 = await fixture(LINEAR_BODY, 'sha256:workflow-engine-v2');
  assert.notEqual(v2.sealed.assemblyDigest, v1.sealed.assemblyDigest);
  assert.equal(v2.sealed.record.definitionGraphDigest, v1.sealed.record.definitionGraphDigest);

  // The v1 artifact bound to the v1 pin is stale against the v2 Assembly —
  // rejected before any transition executes, even though the machine would
  // run identically.
  await assert.rejects(run(v2, v1Artifact, [{ type: 'advance' }]), (error: unknown) => {
    assert.ok(error instanceof WorkflowBridgeError);
    assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
    assert.equal(error.failureClass, 'STALE');
    return true;
  });

  // Recompiling against the current Assembly binds the new pin and runs.
  const v2Artifact = await compileFx(v2);
  assert.equal(
    v2Artifact.identity.kindImplementation.implementation.implementationDigest,
    'sha256:workflow-engine-v2',
  );
  assert.equal((await run(v2, v2Artifact, [{ type: 'advance' }])).stateId, 'middle');

  // And the v2 artifact is equally stale against the old Assembly: staleness
  // is exactness, not recency.
  await assert.rejects(run(v1, v2Artifact, [{ type: 'advance' }]), (error: unknown) => {
    assert.ok(error instanceof WorkflowBridgeError);
    assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
    return true;
  });
});

test('PACK-C T007B: Definition graph drift fails closed through the Assembly currentness recomputation', async () => {
  const fx = await fixture();
  const artifact = await compileFx(fx);

  // The world moves on: the graph gains a state. The sealed Assembly still
  // pins the old exact digest, so the authoritative recomputation fails
  // closed with the typed kernel error — unchanged, before any validator or
  // execution use.
  const driftedComponent = workflowComponent('component.workflow', {
    initial: 'start',
    states: ['start', 'middle', 'done', 'extra'],
    transitions: [
      { transitionId: 't-advance', from: 'start', to: 'middle', event: 'advance' },
      { transitionId: 't-finish', from: 'middle', to: 'done', event: 'finish' },
    ],
  });
  const driftedGraph = graphWith(driftedComponent);

  await assert.rejects(
    runCompiledWorkflow({
      artifact,
      component: driftedComponent,
      sealedAssembly: fx.sealed,
      currentDefinitionGraph: driftedGraph,
      sha256: realSha256,
      events: [{ type: 'advance' }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('PACK-C T007B: a caller-supplied component with drifted semantic body is rejected before execution', async () => {
  const fx = await fixture();
  const artifact = await compileFx(fx);

  // Same graph digest (the graph itself is untouched), but the caller passes
  // a component body that is not the compiled body — the artifact's exact
  // semantic digest catches what graph currentness cannot.
  const swappedComponent = workflowComponent('component.workflow', {
    initial: 'start',
    states: ['start', 'middle', 'done'],
    transitions: [
      { transitionId: 't-advance', from: 'start', to: 'done', event: 'advance' },
      { transitionId: 't-finish', from: 'middle', to: 'done', event: 'finish' },
    ],
  });

  await assert.rejects(
    runCompiledWorkflow({
      artifact,
      component: swappedComponent,
      sealedAssembly: fx.sealed,
      currentDefinitionGraph: fx.graph,
      sha256: realSha256,
      events: [{ type: 'advance' }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
      assert.equal(error.failureClass, 'STALE');
      return true;
    },
  );

  // Sanity: the unmodified component still runs against the same artifact.
  assert.equal((await run(fx, artifact, [{ type: 'advance' }])).stateId, 'middle');
});

test('PACK-C T007B: replacing the engine is an Assembly concern with zero Microkernel edits', async () => {
  const v1 = await fixture();
  const v1DefinitionDigest = v1.sealed.record.definitionGraphDigest;

  // Replacement descriptor minted through the SAME T007A factory and consumed
  // by the SAME generic sealed-Assembly seam — the bridge resolves whatever
  // exact pin the Assembly binds, with no Workflow-specific kernel path.
  const replacement = await fixture(LINEAR_BODY, 'sha256:workflow-engine-v2');
  const replacementArtifact = await compileFx(replacement);

  // Definition identity is stable across the engine replacement; only the
  // Assembly identity and the bound pin move.
  assert.equal(replacement.sealed.record.definitionGraphDigest, v1DefinitionDigest);
  assert.notEqual(
    replacementArtifact.identity.assemblyDigest,
    (await compileFx(v1)).identity.assemblyDigest,
  );
  assert.equal(
    (await run(replacement, replacementArtifact, [{ type: 'advance' }, { type: 'finish' }]))
      .stateId,
    'done',
  );
});

test('PACK-C T007B: private XState typing — the exported surface names no engine type', () => {
  const adapterPath = fileURLToPath(
    new URL('../../src/adapters/workflow-runtime-bridge.ts', import.meta.url),
  );
  const source = readFileSync(adapterPath, 'utf8');

  // The adapter MAY drive the engine privately, but no exported declaration
  // may reference an engine type name — interfaces and type aliases alike.
  // (Case-sensitive: prose in doc comments must not trip the scan.)
  const exportedBlocks = [
    ...source.matchAll(
      /export\s+(?:interface\s+[A-Za-z0-9_]+[^{]*\{([^}]*)\}|type\s+[A-Za-z0-9_]+\s*=\s*([^;]+);)/gs,
    ),
  ];
  assert.ok(exportedBlocks.length > 0, 'sanity: exported declarations were detected');
  for (const block of exportedBlocks) {
    const body = block[1] ?? block[2] ?? '';
    assert.doesNotMatch(
      body,
      /\bXState\b|\bAnyStateMachine\b|\bActorRef\b|\bActor\b|\bxstate\b/,
      `exported declaration must not name an engine type: ${block[0].slice(0, 80)}`,
    );
  }

  // No host-private import in the adapter (Sha256Port is injected).
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  for (const specifier of imported) {
    assert.doesNotMatch(specifier, /^node:/, `adapter must stay host-portable: ${specifier}`);
  }
});

test('PACK-C T007B: no second runtime — the bridge executes only through the existing engine boundary', async () => {
  const adapterPath = fileURLToPath(
    new URL('../../src/adapters/workflow-runtime-bridge.ts', import.meta.url),
  );
  const source = readFileSync(adapterPath, 'utf8');

  // Inward imports stay inside the generic contract family, the existing
  // internal engine-neutral boundary, the T007A Kind adapter this bridge
  // consumes, and the one shipped engine module.
  const allowedImports = [
    '../contracts/component.js',
    '../contracts/component-digest.js',
    '../contracts/definition-graph.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/runtime-assembly.js',
    '../workflow/contract.js',
    '../workflow/internal/xstate-adapter.js',
    './workflow-kind.js',
    'xstate',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Workflow runtime bridge: ${specifier}`,
    );
  }

  // The harness/legacy compiler lanes are NOT imported — no parallel runtime
  // engine is constructed here.
  for (const forbidden of ['../harness/', '../compiler/', '../loader/', '../decision-resolver/']) {
    assert.ok(!source.includes(`'${forbidden}`), `bridge must not import ${forbidden}`);
  }

  // XState remains the only state-machine dependency of the package (the
  // bridge added no engine).
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const engineDeps = Object.keys(packageJson.dependencies).filter((name) =>
    /state|engine|machine/i.test(name),
  );
  assert.deepEqual(engineDeps, ['xstate']);
});

test('PACK-C T007B: the generic Microkernel contract files remain free of any engine import', () => {
  const contractsDir = fileURLToPath(new URL('../../src/contracts/', import.meta.url));
  const files = readdirSync(contractsDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(contractsDir, name))
    .filter((path) => statSync(path).isFile());

  const FORBIDDEN_PATTERNS = [/xstate/i, /\bnode:/];
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
      (match) => match[0],
    );
    for (const statement of importStatements) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        assert.doesNotMatch(
          statement,
          pattern,
          `${path}: generic Microkernel contract must not import an engine-private dependency: ${statement}`,
        );
      }
    }
  }
});
