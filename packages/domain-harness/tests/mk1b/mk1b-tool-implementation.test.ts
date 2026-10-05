/**
 * MK1B — Tool implementation pluggability proof (campaign #586, fresh
 * checkpoint-scoped verifier zcode-mk1b-verifier-r1).
 *
 * One neutral TestToolImplementation exercised through the same public /
 * generic contracts production uses (T003A declaration + T003B capability
 * provision + T002B sealed Assembly + T003C binding). No Workflow / XState /
 * ToolRegistry / SQLite / Agent / UX / AI / HTTP / Search / Storage concrete
 * implementation is imported. Obligations 1-7 only; item 8 (effect=none echo
 * invocation) is OUT OF SCOPE until T004B lands.
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
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  type BindToolImplementationInput,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Neutral fixture: TestToolImplementation (test-only, kernel-unknown)
// ---------------------------------------------------------------------------

function consumerComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'mk1b.consumer.a',
    kind: { kindId: 'mk1b.kind.semantic', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'mk1b.cap.echo', version: '1.0.0' }],
    semanticBody: { note: 'mk1b consumer' },
  };
}

/** The single Tool Component of the graph (the Definition-selectable provider). */
function testToolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'mk1b.tool.TestToolImplementation',
    kind: { kindId: 'mk1b.kind.tool', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'mk1b.op.alpha', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'mk1b.op.beta', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'mk1b.cap.echo', version: '1.0.0' }],
    },
  };
}

/**
 * A second, NON-selected Tool Component (host preference attack surface): it
 * exists in the same graph and provides a different capability, so the T003B
 * Definition-plane selection uniquely resolves to the provider above — the
 * host can never substitute this component through the bind seam.
 */
function otherToolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'mk1b.tool.HostPreferredTool',
    kind: { kindId: 'mk1b.kind.tool', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'mk1b.op.alpha', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'mk1b.op.beta', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'mk1b.cap.host-only', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'mk1b.graph.1',
    components: [consumerComponent(), testToolComponent(), otherToolComponent()],
    relations: [],
  };
}

/** Neutral TestToolImplementation candidate: exact pin identity + opaque handle. */
function testToolImplementation(
  implementationId: string,
  implementationVersion: string,
  supportedOperations: readonly string[] = ['mk1b.op.alpha', 'mk1b.op.beta'],
  handleMarker?: string,
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion,
      implementationDigest: `sha256:${implementationId}@${implementationVersion}#content`,
    },
    supportedOperations,
    handle: { marker: handleMarker ?? `${implementationId}-handle` },
  };
}

async function bindFixture(
  implementations: readonly ToolImplementationCandidate[],
  extra?: Partial<BindToolImplementationInput>,
) {
  const definitionGraph = graph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'mk1b.kind.semantic', version: '1.0.0' },
            implementation: {
              implementationId: 'mk1b.impl.kind-semantic',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-semantic-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
        {
          pin: {
            kind: { kindId: 'mk1b.kind.tool', version: '1.0.0' },
            implementation: {
              implementationId: 'mk1b.impl.kind-tool',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-tool-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    sha256,
  );
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  // Definition-plane provider selection (T003B) — the ONLY selection authority.
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'mk1b.cap.echo', version: '1.0.0' },
    'mk1b.consumer.a',
    definitionGraphDigest,
    sha256,
  );
  return bindToolImplementation({
    assembly,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations,
    sha256,
    ...extra,
  });
}

function expectBindingError(
  code: string,
  run: () => Promise<unknown>,
): Promise<ToolImplementationBindingError> {
  return run().then(
    () => assert.fail(`expected ToolImplementationBindingError ${code}`),
    (error: unknown) => {
      assert.ok(error instanceof ToolImplementationBindingError);
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// (1) + (2) pluggability with MICROKERNEL_SOURCE_DIFF=0; Component identity
//      unchanged while Assembly identity changes
// ---------------------------------------------------------------------------

test('MK1B-1/2: replacing the Tool implementation is a pure caller-side act; Definition identity unchanged, Assembly identity changes', async () => {
  const v1 = await bindFixture([testToolImplementation('acme.TestToolImplementation', '1.0.0')]);
  const v2 = await bindFixture([testToolImplementation('acme.TestToolImplementation', '2.0.0')]);
  const vOther = await bindFixture([
    testToolImplementation('vendor.z.test-tool-implementation', '9.9.9'),
  ]);

  // (2) Tool semantic Component identity is identical across all bindings.
  assert.equal(v1.evidence.toolComponentId, 'mk1b.tool.TestToolImplementation');
  assert.equal(v2.evidence.toolComponentId, v1.evidence.toolComponentId);
  assert.equal(vOther.evidence.toolComponentId, v1.evidence.toolComponentId);
  assert.equal(v1.evidence.definitionGraphDigest, v2.evidence.definitionGraphDigest);
  assert.equal(v1.evidence.definitionGraphDigest, vOther.evidence.definitionGraphDigest);

  // Assembly identity DOES change with the implementation, in both directions.
  assert.notEqual(v1.successorAssembly.assemblyDigest, v2.successorAssembly.assemblyDigest);
  assert.notEqual(v1.successorAssembly.assemblyDigest, vOther.successorAssembly.assemblyDigest);
  assert.notEqual(v1.evidence.bindingDigest, v2.evidence.bindingDigest);

  // The evidence pins the exact replacement identity each time.
  assert.equal(v1.evidence.implementation.implementationVersion, '1.0.0');
  assert.equal(v2.evidence.implementation.implementationVersion, '2.0.0');
  assert.equal(vOther.evidence.implementation.implementationId, 'vendor.z.test-tool-implementation');
});

// ---------------------------------------------------------------------------
// (3) Definition-selected provider cannot be replaced by Assembly/host
//     preference
// ---------------------------------------------------------------------------

test('MK1B-3: binding evidence always names the Definition-selected provider; no Assembly/host preference channel exists in the bind input', async () => {
  const bound = await bindFixture([testToolImplementation('acme.TestToolImplementation', '1.0.0')]);
  // T003B selection resolved the provider while a SECOND tool component
  // exists in the same graph: the evidence must bind exactly that selection.
  assert.equal(bound.evidence.toolComponentId, 'mk1b.tool.TestToolImplementation');
  assert.notEqual(bound.evidence.toolComponentId, 'mk1b.tool.HostPreferredTool');
  assert.deepEqual(bound.evidence.providesCapability, {
    capabilityId: 'mk1b.cap.echo',
    version: '1.0.0',
  });

  // An exact implementation pin cannot redirect the provider either: the pin
  // selects among implementations OF THE SELECTED COMPONENT only.
  const pinned = await bindFixture(
    [testToolImplementation('acme.TestToolImplementation', '1.0.0')],
    {
      exactPin: {
        implementationId: 'acme.TestToolImplementation',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:acme.TestToolImplementation@1.0.0#content',
      },
    },
  );
  assert.equal(pinned.evidence.toolComponentId, 'mk1b.tool.TestToolImplementation');

  // A host trying to smuggle a preferred provider/component through the bind
  // input fails closed: the input structurally has no such field.
  await expectBindingError('INVALID_BINDING_INPUT', () =>
    bindFixture([testToolImplementation('acme.TestToolImplementation', '1.0.0')], {
      ...( {
        preferredProviderComponentId: 'mk1b.tool.HostPreferredTool',
      } as unknown as Partial<BindToolImplementationInput>),
    }),
  );
});

// ---------------------------------------------------------------------------
// (4) + (5) fail-closed negatives
// ---------------------------------------------------------------------------

test('MK1B-4: zero compatible implementations fail closed MISSING_TOOL_IMPLEMENTATION', async () => {
  const error = await expectBindingError('MISSING_TOOL_IMPLEMENTATION', () => bindFixture([]));
  assert.match(error.message, /no default\/latest\/fallback exists/);

  // A candidate that exists but does not support a bound operation is not
  // compatible: still zero compatible => MISSING, not partial binding.
  await expectBindingError('MISSING_TOOL_IMPLEMENTATION', () =>
    bindFixture([testToolImplementation('acme.TestToolImplementation', '1.0.0', ['mk1b.op.alpha'])]),
  );
});

test('MK1B-5: multiple compatible implementations without an admitted exact pin fail AMBIGUOUS, never first/latest/default — under every candidate ordering', async () => {
  const a = testToolImplementation('acme.TestToolImplementation', '1.0.0');
  const b = testToolImplementation('vendor.z.test-tool-implementation', '1.0.0');

  const forward = await expectBindingError('AMBIGUOUS_TOOL_IMPLEMENTATION', () =>
    bindFixture([a, b]),
  );
  const backward = await expectBindingError('AMBIGUOUS_TOOL_IMPLEMENTATION', () =>
    bindFixture([b, a]),
  );
  assert.deepEqual(forward.conflictingImplementationIds, [
    'acme.TestToolImplementation',
    'vendor.z.test-tool-implementation',
  ]);
  // Deterministic, order-independent diagnostics; no ordering ever binds.
  assert.deepEqual(forward.conflictingImplementationIds, backward.conflictingImplementationIds);
  assert.equal(forward.message, backward.message);

  // Duplicate candidate identity (same id twice) is ambiguity, never first-wins.
  await expectBindingError('AMBIGUOUS_TOOL_IMPLEMENTATION', () =>
    bindFixture([
      testToolImplementation('acme.TestToolImplementation', '1.0.0'),
      testToolImplementation('acme.TestToolImplementation', '1.0.0'),
    ]),
  );

  // An admitted exact pin resolves the ambiguity to that exact candidate.
  const resolved = await bindFixture([a, b], {
    exactPin: {
      implementationId: 'vendor.z.test-tool-implementation',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:vendor.z.test-tool-implementation@1.0.0#content',
    },
  });
  assert.equal(resolved.evidence.implementation.implementationId, 'vendor.z.test-tool-implementation');

  // A pin matching no offered candidate exactly fails MISSING — never falls
  // back to another compatible candidate.
  await expectBindingError('MISSING_TOOL_IMPLEMENTATION', () =>
    bindFixture([a, b], {
      exactPin: {
        implementationId: 'acme.TestToolImplementation',
        implementationVersion: '3.0.0', // not offered
        implementationDigest: 'sha256:acme.TestToolImplementation@1.0.0#content',
      },
    }),
  );

  // An exactly pinned but incompatible candidate fails INCOMPATIBLE — the pin
  // never overrides compatibility.
  await expectBindingError('INCOMPATIBLE_TOOL_IMPLEMENTATION', () =>
    bindFixture([testToolImplementation('acme.TestToolImplementation', '1.0.0', ['mk1b.op.alpha'])], {
      exactPin: {
        implementationId: 'acme.TestToolImplementation',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:acme.TestToolImplementation@1.0.0#content',
      },
    }),
  );
});

// ---------------------------------------------------------------------------
// (6) legacy ToolRegistry / executable handle is not authoritative identity
// ---------------------------------------------------------------------------

test('MK1B-6: the runtime handle is not identity — same pin with different handles yields byte-identical evidence; legacy registry/module identity is structurally unrepresentable', async () => {
  const h1 = await bindFixture([
    testToolImplementation('acme.TestToolImplementation', '1.0.0', undefined, 'handle-A'),
  ]);
  const h2 = await bindFixture([
    testToolImplementation('acme.TestToolImplementation', '1.0.0', undefined, 'handle-B'),
  ]);

  // Handles differ, evidence is byte-identical: the handle lives outside all
  // digest material and never participates in binding identity.
  assert.notEqual(
    (h1.implementationHandle as { marker: string }).marker,
    (h2.implementationHandle as { marker: string }).marker,
  );
  assert.equal(h1.evidence.bindingDigest, h2.evidence.bindingDigest);
  assert.equal(h1.evidence.assemblyDigest, h2.evidence.assemblyDigest);
  assert.deepEqual(h1.evidence.implementation, h2.evidence.implementation);

  // The serializable evidence carries no handle field at all.
  assert.deepEqual(Object.keys(h1.evidence).sort(), [
    'assemblyDigest',
    'bindingDigest',
    'definitionGraphDigest',
    'implementation',
    'providesCapability',
    'status',
    'supportedOperations',
    'toolComponentId',
  ]);

  // A candidate trying to smuggle legacy registry/module identity (module
  // path, registry entry, invoke function) fails closed.
  await expectBindingError('INVALID_BINDING_INPUT', () =>
    bindFixture([
      {
        ...testToolImplementation('acme.TestToolImplementation', '1.0.0'),
        ...( { modulePath: 'legacy/registry/acme.js' } as unknown as Record<string, unknown>),
      } as ToolImplementationCandidate,
    ]),
  );
});

// ---------------------------------------------------------------------------
// (7) binding evidence pins the exact ToolImplementation identity and is
//     immutable / non-aliased
// ---------------------------------------------------------------------------

test('MK1B-7: binding evidence pins the exact implementation identity, is frozen, and never aliases caller-owned objects', async () => {
  const callerCandidate = testToolImplementation('acme.TestToolImplementation', '1.0.0');
  const bound = await bindFixture([callerCandidate]);

  // Exact pinning: all three identity fields verbatim.
  assert.equal(bound.evidence.implementation.implementationId, 'acme.TestToolImplementation');
  assert.equal(bound.evidence.implementation.implementationVersion, '1.0.0');
  assert.equal(
    bound.evidence.implementation.implementationDigest,
    'sha256:acme.TestToolImplementation@1.0.0#content',
  );

  // Frozen authority-grade output.
  assert.ok(Object.isFrozen(bound.evidence));
  assert.ok(Object.isFrozen(bound.evidence.implementation));
  assert.ok(Object.isFrozen(bound));
  assert.ok(Object.isFrozen(bound.evidence.supportedOperations));

  // Non-aliased: fresh objects, not the caller's records.
  assert.notEqual(bound.evidence.implementation, callerCandidate.implementation);
  assert.notEqual(bound.evidence.supportedOperations, callerCandidate.supportedOperations);

  // Caller mutation after the fact cannot alter minted evidence (deep copies).
  const evidenceBefore = JSON.stringify(bound.evidence);
  (callerCandidate.implementation as { implementationId: string }).implementationId = 'attacker.mutated';
  (callerCandidate.supportedOperations as string[]).push('mk1b.op.gamma');
  assert.equal(JSON.stringify(bound.evidence), evidenceBefore);
  assert.equal(bound.evidence.implementation.implementationId, 'acme.TestToolImplementation');

  // Handle is paired by reference (opaque runtime value) but the evidence and
  // the successor Assembly stay untouched by handle mutation.
  const handle = bound.implementationHandle as { marker: string };
  handle.marker = 'mutated-handle';
  assert.equal(JSON.stringify(bound.evidence), evidenceBefore);

  // The successor Assembly carries the §G slot for the exact subject with the
  // exact binding digest.
  const slot = bound.successorAssembly.record.implementationBindingEvidence.find(
    (entry: { subject: string }) => entry.subject === 'mk1b.tool.TestToolImplementation',
  );
  assert.ok(slot, 'successor assembly carries the §G slot for the exact Tool Component subject');
  assert.equal(slot.bindingDigest, bound.evidence.bindingDigest);
});
