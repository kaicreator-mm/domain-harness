/**
 * E1 reference-evidence suite — Generic Semantic dispatch (issue #621, PACK-D
 * E1; planning authority #589 issuecomment-5980528597 FROZEN + #534 E1 entry
 * <- T001, T002A/B).
 *
 * SUBJECT_BASELINE=version/v0.7@f9c1e75f7689093a21efae5dbc0239ce3a71d37c
 * (tree 1b86b7cd6882e9c58a09d3321d3e1eaad28f3e74).
 *
 * A NEUTRAL test-only Semantic Kind fixture (`e1.test.checklist-gate` — an
 * approval-gate checklist concern, not a copy of any production semantic and
 * not a Workflow kind) is added and bound EXCLUSIVELY through the same
 * public/generic contracts production semantics use: the public-v7 surface's
 * component envelope validation, must-understand admission, Definition graph
 * digest, sealed Runtime Assembly and Assembly-bound admission. No private
 * bypass; no production source edit (MICROKERNEL_SOURCE_DIFF=0).
 *
 * Proof obligations (PACK-D E1):
 *  1. neutral Kind implementation can be added/bound without Microkernel
 *     source edits;
 *  2. exact Component/Kind semantics are admitted by must-understand rules;
 *  3. replacing the exact KindImplementation changes Assembly
 *     identity/currentness but not unchanged Definition identity;
 *  4. unknown Kind, incompatible exact Kind, unknown/material semantic fields
 *     fail closed with typed codes;
 *  5. dispatch uses sealed Assembly provenance, never a caller-supplied
 *     validator authority; mid-flight caller mutation cannot alter evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  ComponentAdmissionError,
  admitComponent,
  type UnderstoodKindDeclaration,
} from '../../src/contracts/component-admission.js';
import { computeComponentSemanticDigest } from '../../src/contracts/component-digest.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type AssemblyBoundComponentAdmission,
  type KindImplementationBindingInput,
} from '../../src/contracts/runtime-assembly.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Neutral test-only Kind fixture: `e1.test.checklist-gate@1.0.0`
// ---------------------------------------------------------------------------

/** Typed failure of the fixture Kind's closed-world validator. */
class ChecklistGateContractError extends Error {
  readonly code:
    | 'CHECKLIST_GATE_INVALID_BODY'
    | 'CHECKLIST_GATE_UNKNOWN_MATERIAL_FIELD';

  constructor(code: 'CHECKLIST_GATE_INVALID_BODY' | 'CHECKLIST_GATE_UNKNOWN_MATERIAL_FIELD', message: string) {
    super(message);
    this.name = 'ChecklistGateContractError';
    this.code = code;
  }
}

/** Closed-world validator for the exact neutral Kind — material fields only. */
function validateChecklistGateComponent(envelope: ComponentEnvelope): void {
  const body = envelope.semanticBody as Record<string, unknown> | null;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ChecklistGateContractError(
      'CHECKLIST_GATE_INVALID_BODY',
      'checklist-gate semanticBody must be an object',
    );
  }
  const keys = Object.keys(body);
  for (const key of keys) {
    if (key !== 'checklistId' && key !== 'requiredApprovals') {
      throw new ChecklistGateContractError(
        'CHECKLIST_GATE_UNKNOWN_MATERIAL_FIELD',
        `checklist-gate semanticBody carries unknown material field "${key}"`,
      );
    }
  }
  if (typeof body.checklistId !== 'string' || body.checklistId.length === 0) {
    throw new ChecklistGateContractError(
      'CHECKLIST_GATE_INVALID_BODY',
      'checklist-gate semanticBody.checklistId must be a non-empty string',
    );
  }
  if (!Number.isInteger(body.requiredApprovals) || (body.requiredApprovals as number) < 1) {
    throw new ChecklistGateContractError(
      'CHECKLIST_GATE_INVALID_BODY',
      'checklist-gate semanticBody.requiredApprovals must be an integer >= 1',
    );
  }
}

const CHECKLIST_GATE_KIND = Object.freeze({ kindId: 'e1.test.checklist-gate', version: '1.0.0' });

function checklistGateComponent(
  overrides: Partial<ComponentEnvelope> = {},
): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'e1.test.component.checklist-alpha',
    kind: { kindId: CHECKLIST_GATE_KIND.kindId, version: CHECKLIST_GATE_KIND.version },
    requiredSemanticContracts: [{ contractId: 'e1.test.contract.gating', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' }],
    semanticBody: { checklistId: 'checklist.alpha', requiredApprovals: 2 },
    ...overrides,
  };
}

function checklistGraph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'e1.test.graph.alpha',
    components: [checklistGateComponent()],
    relations: [],
    ...overrides,
  };
}

function checklistImplementationBinding(
  implementationDigest = 'sha256:e1-checklist-impl-alpha-1.0.0-content',
): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: CHECKLIST_GATE_KIND.kindId, version: CHECKLIST_GATE_KIND.version },
      implementation: {
        implementationId: 'e1.test.impl.checklist-alpha',
        implementationVersion: '1.0.0',
        implementationDigest,
      },
    },
    understoodSemanticContracts: [{ contractId: 'e1.test.contract.gating', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' }],
    validateComponent: validateChecklistGateComponent,
  };
}

/** Low-level must-understand declaration for the neutral fixture Kind. */
const checklistUnderstood: UnderstoodKindDeclaration = {
  kind: { kindId: CHECKLIST_GATE_KIND.kindId, version: CHECKLIST_GATE_KIND.version },
  understoodSemanticContracts: [{ contractId: 'e1.test.contract.gating', version: '1.0.0' }],
  understoodCapabilities: [{ capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' }],
  validateComponent: validateChecklistGateComponent,
};

async function sealOver(
  binding: KindImplementationBindingInput,
  graph: DefinitionGraphEnvelope = checklistGraph(),
) {
  return sealRuntimeAssembly({ definitionGraph: graph, kindImplementations: [binding] }, realSha256);
}

// ---------------------------------------------------------------------------
// Obligation 2 — exact Component/Kind semantics admitted by must-understand
// ---------------------------------------------------------------------------

test('E1/obligation-2: neutral exact Kind is ADMITTED by must-understand rules with fresh refs', async () => {
  const envelope = checklistGateComponent();
  const result = admitComponent(envelope, [checklistUnderstood]);
  assert.equal(result.status, 'ADMITTED');
  assert.equal(result.admittedKind.kindId, 'e1.test.checklist-gate');
  assert.equal(result.admittedKind.version, '1.0.0');
  assert.deepEqual(result.admittedSemanticContracts, [
    { contractId: 'e1.test.contract.gating', version: '1.0.0' },
  ]);
  assert.deepEqual(result.admittedCapabilities, [
    { capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' },
  ]);
  // Non-aliasing: admitted refs are fresh value objects.
  assert.notEqual(result.admittedKind, envelope.kind);

  // Full generic path: sealed Assembly-bound admission over the same graph.
  const assembly = await sealOver(checklistImplementationBinding());
  const bound = await admitComponentWithAssembly(envelope, assembly, {
    currentDefinitionGraph: checklistGraph(),
    sha256: realSha256,
  });
  assert.equal(bound.status, 'ADMITTED');
  assert.equal(bound.componentId, 'e1.test.component.checklist-alpha');
  assert.equal(bound.admittedKindImplementation.implementation.implementationId, 'e1.test.impl.checklist-alpha');
});

// ---------------------------------------------------------------------------
// Obligations 1 + 5 — sealed provenance, frozen evidence
// ---------------------------------------------------------------------------

test('E1/obligations-1+5: neutral Kind binds through generic public contracts; sealed Assembly and admission evidence are frozen', async () => {
  const assembly = await sealOver(checklistImplementationBinding());
  assert.equal(Object.isFrozen(assembly), true);
  assert.equal(Object.isFrozen(assembly.record), true);
  assert.equal(Object.isFrozen(assembly.bindings), true);
  for (const binding of assembly.bindings) {
    assert.equal(Object.isFrozen(binding), true);
    assert.equal(Object.isFrozen(binding.pin), true);
    assert.equal(Object.isFrozen(binding.pin.implementation), true);
  }
  assert.ok(assembly.assemblyDigest.length > 0);
  assert.equal(assembly.record.digestDomain, 'kaicreator.runtime-assembly.digest.v1');
  assert.equal(assembly.record.kindImplementations.length, 1);
  assert.equal(assembly.record.kindImplementations[0]!.kind.kindId, 'e1.test.checklist-gate');

  const bound = await admitComponentWithAssembly(checklistGateComponent(), assembly, {
    currentDefinitionGraph: checklistGraph(),
    sha256: realSha256,
  });
  assert.equal(Object.isFrozen(bound), true);
  assert.equal(Object.isFrozen(bound.admittedKind), true);
  assert.equal(Object.isFrozen(bound.admittedKindImplementation), true);
  assert.equal(Object.isFrozen(bound.admittedSemanticContracts), true);
});

// ---------------------------------------------------------------------------
// Obligation 3 — implementation replacement changes Assembly identity, not
// unchanged Definition identity
// ---------------------------------------------------------------------------

test('E1/obligation-3: replacing the exact KindImplementation changes Assembly identity/currentness but not Definition identity', async () => {
  const graph = checklistGraph();
  const alpha = await sealOver(checklistImplementationBinding('sha256:e1-impl-alpha-content'));
  const beta = await sealOver(
    checklistImplementationBinding('sha256:e1-impl-beta-content'),
  );

  // Assembly identity changes with the implementation pin.
  assert.notEqual(alpha.assemblyDigest, beta.assemblyDigest);
  assert.notEqual(
    alpha.record.kindImplementations[0]!.implementation.implementationDigest,
    beta.record.kindImplementations[0]!.implementation.implementationDigest,
  );

  // Unchanged Definition identity: graph digest identical under both seals.
  const graphDigest = await computeDefinitionGraphDigest(graph, realSha256);
  assert.equal(alpha.record.definitionGraphDigest, graphDigest);
  assert.equal(beta.record.definitionGraphDigest, graphDigest);

  // Component semantic digest (Definition-plane) is implementation-blind.
  const componentAlpha = await computeComponentSemanticDigest(
    checklistGateComponent(),
    realSha256,
  );
  const componentBeta = await computeComponentSemanticDigest(
    checklistGateComponent(),
    realSha256,
  );
  assert.equal(componentAlpha, componentBeta);

  // Previously minted admission evidence carries the OLD assembly identity —
  // it is no longer current authority under the replaced implementation.
  const admittedUnderAlpha = await admitComponentWithAssembly(checklistGateComponent(), alpha, {
    currentDefinitionGraph: graph,
    sha256: realSha256,
  });
  assert.equal(admittedUnderAlpha.assemblyDigest, alpha.assemblyDigest);
  assert.notEqual(admittedUnderAlpha.assemblyDigest, beta.assemblyDigest);
  assert.equal(
    admittedUnderAlpha.admittedKindImplementation.implementation.implementationDigest,
    'sha256:e1-impl-alpha-content',
  );

  // Order normalization: binding permutation does not change Assembly identity.
  const graph2 = checklistGraph();
  const sealedA = await sealRuntimeAssembly(
    { definitionGraph: graph2, kindImplementations: [checklistImplementationBinding()] },
    realSha256,
  );
  const sealedB = await sealRuntimeAssembly(
    { definitionGraph: graph2, kindImplementations: [checklistImplementationBinding()] },
    realSha256,
  );
  assert.equal(sealedA.assemblyDigest, sealedB.assemblyDigest);
});

// ---------------------------------------------------------------------------
// Obligation 4 — fail-closed negatives (typed codes)
// ---------------------------------------------------------------------------

test('E1/obligation-4a: unknown Kind fails closed with UNKNOWN_KIND (no fallback)', () => {
  const envelope = checklistGateComponent({
    kind: { kindId: 'e1.test.orbital-gate', version: '1.0.0' },
  });
  assert.throws(
    () => admitComponent(envelope, [checklistUnderstood]),
    (error: unknown) =>
      error instanceof ComponentAdmissionError &&
      error.code === 'UNKNOWN_KIND' &&
      error.failureClass === 'KIND',
  );
});

test('E1/obligation-4b: incompatible exact Kind version fails closed with KIND_VERSION_MISMATCH (never falls back to another version)', async () => {
  const envelope = checklistGateComponent({
    kind: { kindId: 'e1.test.checklist-gate', version: '2.0.0' },
  });
  assert.throws(
    () => admitComponent(envelope, [checklistUnderstood]),
    (error: unknown) =>
      error instanceof ComponentAdmissionError &&
      error.code === 'KIND_VERSION_MISMATCH' &&
      error.failureClass === 'KIND',
  );

  // Assembly path: exact Kind not bound by the sealed assembly.
  const assembly = await sealOver(checklistImplementationBinding());
  await assert.rejects(
    admitComponentWithAssembly(envelope, assembly, {
      currentDefinitionGraph: checklistGraph(),
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof RuntimeAssemblyError &&
      error.code === 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
  );
});

test('E1/obligation-4c: unbound Kind fails closed on the Assembly path even when the low-level set would admit it', async () => {
  // A Kind another assembly understands, but the sealed assembly does not bind.
  const envelope = checklistGateComponent({
    kind: { kindId: 'e1.test.checklist-gate', version: '1.0.0' },
  });
  const otherKindBinding: KindImplementationBindingInput = {
    pin: {
      kind: { kindId: 'e1.test.other-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'e1.test.impl.other',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e1-other-impl-content',
      },
    },
    understoodSemanticContracts: [{ contractId: 'e1.test.contract.gating', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' }],
    validateComponent: validateChecklistGateComponent,
  };
  const otherGraph = checklistGraph({
    components: [
      checklistGateComponent({
        componentId: 'e1.test.component.other-holder',
        kind: { kindId: 'e1.test.other-kind', version: '1.0.0' },
      }),
    ],
  });
  const assembly = await sealRuntimeAssembly(
    { definitionGraph: otherGraph, kindImplementations: [otherKindBinding] },
    realSha256,
  );
  await assert.rejects(
    admitComponentWithAssembly(envelope, assembly, {
      currentDefinitionGraph: otherGraph,
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof RuntimeAssemblyError &&
      error.code === 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND',
  );
});

test('E1/obligation-4d: unknown semantic contract fails closed with UNKNOWN_SEMANTIC_CONTRACT', () => {
  const envelope = checklistGateComponent({
    requiredSemanticContracts: [
      { contractId: 'e1.test.contract.gating', version: '1.0.0' },
      { contractId: 'e1.test.contract.unknown-extra', version: '1.0.0' },
    ],
  });
  assert.throws(
    () => admitComponent(envelope, [checklistUnderstood]),
    (error: unknown) =>
      error instanceof ComponentAdmissionError &&
      error.code === 'UNKNOWN_SEMANTIC_CONTRACT' &&
      error.failureClass === 'CONTRACT',
  );
});

test('E1/obligation-4e: material unknown semantic field fails closed through the Kind validator (single source of truth)', async () => {
  const envelope = checklistGateComponent({
    semanticBody: {
      checklistId: 'checklist.alpha',
      requiredApprovals: 2,
      // Material unknown field — must-understand violation by the exact Kind.
      secretEscapeHatch: true,
    },
  });
  assert.throws(
    () => admitComponent(envelope, [checklistUnderstood]),
    (error: unknown) =>
      error instanceof ChecklistGateContractError &&
      error.code === 'CHECKLIST_GATE_UNKNOWN_MATERIAL_FIELD',
  );

  const assembly = await sealOver(checklistImplementationBinding());
  await assert.rejects(
    admitComponentWithAssembly(envelope, assembly, {
      currentDefinitionGraph: checklistGraph(),
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof ChecklistGateContractError &&
      error.code === 'CHECKLIST_GATE_UNKNOWN_MATERIAL_FIELD',
  );
});

// ---------------------------------------------------------------------------
// Obligation 5 — sealed provenance, not caller-supplied validator authority
// ---------------------------------------------------------------------------

test('E1/obligation-5a: caller-forged assembly with permissive validator authority is rejected', async () => {
  const genuine = await sealOver(checklistImplementationBinding());

  // Forgeries of increasing fidelity.
  const permissiveBinding = {
    pin: genuine.record.kindImplementations[0],
    understoodSemanticContracts: [{ contractId: 'e1.test.contract.gating', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'e1.test.capability.gate-read', version: '1.0.0' }],
    validateComponent: () => undefined, // permissive raw validator
  };
  const forged = {
    record: genuine.record,
    assemblyDigest: genuine.assemblyDigest,
    bindings: [permissiveBinding],
  };
  const forgedWithSymbols = Object.assign(Object.create(genuine), {}) as typeof genuine;

  const envelope = checklistGateComponent({
    semanticBody: { checklistId: 'x', requiredApprovals: 0, smuggled: 'yes' },
  });
  for (const [label, candidate] of [
    ['plain forged object', forged],
    ['prototype clone of genuine assembly', forgedWithSymbols],
  ] as const) {
    await assert.rejects(
      admitComponentWithAssembly(envelope, candidate as never, {
        currentDefinitionGraph: checklistGraph(),
        sha256: realSha256,
      }),
      (error: unknown) =>
        error instanceof RuntimeAssemblyError && error.code === 'INVALID_ASSEMBLY_INPUT',
      `forgery "${label}" must be rejected before any validator authority`,
    );
  }
});

test('E1/obligation-5b: mid-flight caller mutation cannot alter sealed Assembly identity or admitted evidence', async () => {
  const graph = checklistGraph();
  const binding = checklistImplementationBinding();
  const assembly = await sealRuntimeAssembly(
    { definitionGraph: graph, kindImplementations: [binding] },
    realSha256,
  );
  const digestBefore = assembly.assemblyDigest;
  const pinBefore = assembly.record.kindImplementations[0]!.implementation.implementationDigest;

  // Mutate caller-owned inputs after sealing (TS-readonly, runtime-mutable).
  (binding.pin.implementation as { implementationDigest: string }).implementationDigest =
    'sha256:tampered';
  (graph.components[0] as { semanticBody: unknown }).semanticBody = {
    checklistId: 'tampered',
    requiredApprovals: 99,
  };

  assert.equal(assembly.assemblyDigest, digestBefore);
  assert.equal(
    assembly.record.kindImplementations[0]!.implementation.implementationDigest,
    pinBefore,
  );

  // Currentness: admission recomputes the graph digest; the mutated (stale)
  // caller graph no longer matches the sealed digest and fails closed.
  await assert.rejects(
    admitComponentWithAssembly(checklistGateComponent(), assembly, {
      currentDefinitionGraph: graph,
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof RuntimeAssemblyError &&
      error.code === 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH',
  );

  // Fresh evidence with the authentic graph still succeeds and is immune to
  // post-admission caller mutation of the envelope.
  const envelope = checklistGateComponent();
  const bound: AssemblyBoundComponentAdmission = await admitComponentWithAssembly(
    envelope,
    assembly,
    { currentDefinitionGraph: checklistGraph(), sha256: realSha256 },
  );
  const capturedKind = bound.admittedKind;
  const capturedContracts = bound.admittedSemanticContracts;
  (envelope as { semanticBody: unknown }).semanticBody = {
    checklistId: 'post-admission-tamper',
    requiredApprovals: 1000,
  };
  assert.equal(bound.admittedKind, capturedKind);
  assert.deepEqual(bound.admittedSemanticContracts, capturedContracts);
  assert.equal(bound.assemblyDigest, digestBefore);
});
