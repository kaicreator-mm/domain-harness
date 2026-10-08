/**
 * T003C tests-first matrix — consumer-verifiable binding authenticity and
 * final-Assembly currentness seam (issue #640; authority #589
 * issuecomment-5993726738 §A A1–A5).
 *
 * Covers the #640 required consumer-verifier test list:
 *  1. A1 mint authenticity — a module-private WeakSet registry is the
 *     authoritative mint test; brand/symbol/property shape alone is never
 *     sufficient; unminted lookalikes (field-copied, symbol-stolen,
 *     prototype-child) fail closed with UNMINTED_TOOL_IMPLEMENTATION_BINDING;
 *  2. A2 evidence verification — the T003C-owned seam snapshots the evidence
 *     descriptor-safely before its first await, validates the exact closed v1
 *     material, recomputes the accepted v1 bindingDigest and rejects
 *     malformed/canonical-content/digest mismatches deterministically
 *     (TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH); unsafe hidden/accessor
 *     structure fails INVALID_BINDING_INPUT before evidence verification with
 *     zero getter executions;
 *  3. A3 currentness — decided against the exact current final sealed
 *     Assembly: exact Definition identity, exact subject === toolComponentId
 *     slot with no first/latest/default/order/alias fallback, exact
 *     bindingDigest match; missing slot =>
 *     MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING, replaced/stale slot or
 *     foreign Definition => STALE_TOOL_IMPLEMENTATION_BINDING; a faithful
 *     later reseal that preserves the binding slot stays CURRENT while the
 *     historical evidence.assemblyDigest remains provenance only;
 *  4. A4 opaque runtime-handle pairing — the handle is exposed/paired only
 *     after mint + evidence + final-slot + exact-pin verification, remains
 *     outside every digest (two bindings differing only in handle carry
 *     byte-identical evidence) and never enters the returned verified
 *     evidence; a consumer-supplied exact pin that differs from the verified
 *     evidence pin fails TOOL_IMPLEMENTATION_PIN_MISMATCH;
 *  5. A5 snapshot/alias discipline — all authority material is synchronously
 *     snapshotted before the first await; caller mutation during or after
 *     verification cannot tear or alias the returned fresh frozen evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import { computeDefinitionGraphDigest } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import type { AssemblyImplementationBindingEvidence } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  isSealedToolImplementationBinding,
  verifyToolImplementationBinding,
  verifyToolImplementationBindingEvidence,
  ToolImplementationBindingError,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

/** Deterministically lying port: every digest differs from the honest one. */
const lyingSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(`${value}--verify-port-noise`, 'utf8').digest('hex');
  },
};

/**
 * Sha256Port that synchronously invokes `mutate` inside the digestUtf8 call
 * at zero-based index `callIndex`, while that digest promise is pending.
 */
function mutationSha256(callIndex: number, mutate: () => void): Sha256Port {
  let calls = 0;
  return {
    async digestUtf8(value: string): Promise<string> {
      if (calls === callIndex) {
        mutate();
      }
      calls += 1;
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures: one consumer + one Domain Tool provider over one exact Kind.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
  };
}

function graph(graphId = 'graph.t003c-verifier'): DefinitionGraphEnvelope {
  return {
    graphId,
    components: [consumer(), toolComponent()],
    relations: [],
  };
}

function kindBinding() {
  return {
    pin: {
      kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t003c-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function candidate(
  implementationId = 'impl.calc.alpha',
  overrides: Partial<ToolImplementationCandidate> = {},
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${implementationId}-content`,
    },
    supportedOperations: ['op.add', 'op.sub'],
    ...overrides,
  };
}

interface BindFixture {
  binding: SealedToolImplementationBinding;
  successorAssembly: Awaited<ReturnType<typeof sealRuntimeAssembly>>;
  baseAssembly: Awaited<ReturnType<typeof sealRuntimeAssembly>>;
  definitionGraph: DefinitionGraphEnvelope;
}

async function bindFixture(
  options: {
    graphId?: string;
    implementationId?: string;
    candidateOverrides?: Partial<ToolImplementationCandidate>;
    handle?: unknown;
  } = {},
): Promise<BindFixture> {
  const definitionGraph = graph(options.graphId);
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const implementations: ToolImplementationCandidate[] = [
    candidate(options.implementationId, options.candidateOverrides),
  ];
  if (options.handle !== undefined) {
    const base = implementations[0];
    if (base !== undefined) {
      implementations[0] = { ...base, handle: options.handle };
    }
  }
  const input: BindToolImplementationInput = {
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations,
    sha256: realSha256,
  };
  const binding = await bindToolImplementation(input);
  return { binding, successorAssembly: binding.successorAssembly, baseAssembly, definitionGraph };
}

/** Faithfully reseal over the same graph/kind pins with an explicit slot list. */
async function resealWithSlots(
  definitionGraph: DefinitionGraphEnvelope,
  slots: readonly AssemblyImplementationBindingEvidence[],
) {
  return sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [kindBinding()],
      implementationBindingEvidence: slots,
    },
    realSha256,
  );
}

function expectVerifierError(
  promise: Promise<unknown>,
  code: string,
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but verification resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// A1: mint authenticity — the WeakSet registry is the authoritative test.
// ---------------------------------------------------------------------------

test('#640 A1: the mint-membership guard is synchronous and accepts only genuine mints', async () => {
  const { binding } = await bindFixture();

  assert.equal(typeof isSealedToolImplementationBinding, 'function');
  assert.equal(isSealedToolImplementationBinding(binding), true);
  assert.equal(isSealedToolImplementationBinding({}), false);
  assert.equal(isSealedToolImplementationBinding(null), false);
  assert.equal(isSealedToolImplementationBinding('binding'), false);
});

test('#640 A1: a field-copied lookalike that steals the brand symbol is NOT a mint member', async () => {
  const { binding } = await bindFixture();

  const stolenBrand = Object.getOwnPropertySymbols(binding)[0];
  assert.ok(stolenBrand, 'the genuine mint carries a brand symbol');
  const lookalike = Object.freeze({
    evidence: JSON.parse(JSON.stringify(binding.evidence)),
    successorAssembly: binding.successorAssembly,
    implementationHandle: binding.implementationHandle,
    [stolenBrand]: true,
  });

  assert.equal(isSealedToolImplementationBinding(lookalike), false);
  await expectVerifierError(
    verifyToolImplementationBinding({
      binding: lookalike as unknown as SealedToolImplementationBinding,
      finalAssembly: binding.successorAssembly,
      sha256: realSha256,
    }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('#640 A1: a prototype child of a genuine mint does not inherit mint membership', async () => {
  const { binding } = await bindFixture();

  const child = Object.create(binding) as unknown;
  assert.equal(isSealedToolImplementationBinding(child), false);
  await expectVerifierError(
    verifyToolImplementationBinding({
      binding: child as SealedToolImplementationBinding,
      finalAssembly: binding.successorAssembly,
      sha256: realSha256,
    }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('#640 A1: every genuine bindToolImplementation result is registered exactly as a mint', async () => {
  const first = await bindFixture();
  const second = await bindFixture();

  assert.equal(isSealedToolImplementationBinding(first.binding), true);
  assert.equal(isSealedToolImplementationBinding(second.binding), true);
  assert.notEqual(first.binding, second.binding, 'each mint is its own registry member');
});

// ---------------------------------------------------------------------------
// A2: evidence verification — closed material + v1 digest recomputation.
// ---------------------------------------------------------------------------

test('#640 A2: valid evidence verification returns fresh frozen non-aliased material and CURRENT currentness', async () => {
  const { binding, successorAssembly, definitionGraph } = await bindFixture();
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);

  const verified = await verifyToolImplementationBindingEvidence({
    evidence: binding.evidence,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });

  assert.equal(verified.status, 'VERIFIED');
  assert.equal(verified.currentness.status, 'CURRENT');
  assert.equal(verified.currentness.definitionGraphDigest, definitionGraphDigest);
  assert.equal(verified.currentness.finalAssemblyDigest, successorAssembly.assemblyDigest);
  assert.equal(verified.currentness.subject, binding.evidence.toolComponentId);
  assert.equal(verified.currentness.bindingDigest, binding.evidence.bindingDigest);
  assert.deepEqual(verified.evidence, binding.evidence);
  assert.notEqual(verified.evidence, binding.evidence, 'the verified evidence is a fresh copy, not an alias');
  assert.equal(Object.isFrozen(verified.evidence), true);
  assert.equal(Object.isFrozen(verified.evidence.implementation), true);
  assert.equal(Object.isFrozen(verified.evidence.supportedOperations), true);
  assert.equal(Object.isFrozen(verified.currentness), true);
});

test('#640 A2: evidence digest mismatch (tampered implementation digest) fails TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', async () => {
  const { binding, successorAssembly } = await bindFixture();

  const tampered = JSON.parse(JSON.stringify(binding.evidence)) as typeof binding.evidence;
  (tampered.implementation as { implementationDigest: string }).implementationDigest =
    'sha256:tampered-content';

  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: tampered,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );
});

test('#640 A2: malformed evidence material fails TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH', async () => {
  const { binding, successorAssembly } = await bindFixture();

  // Unknown extra field: the closed v1 material is exact.
  const extraField = JSON.parse(JSON.stringify(binding.evidence)) as Record<string, unknown>;
  extraField.extra = 1;
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: extraField,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );

  // Missing field: bindingDigest absent from the closed material.
  const missingField = JSON.parse(JSON.stringify(binding.evidence)) as Record<string, unknown>;
  delete missingField.bindingDigest;
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: missingField,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );

  // Non-order-normalized operations: the accepted v1 material is sorted.
  const unsorted = JSON.parse(JSON.stringify(binding.evidence)) as typeof binding.evidence;
  (unsorted.supportedOperations as unknown as string[]) = ['op.sub', 'op.add'];
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: unsorted,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );

  // Wrong status token.
  const wrongStatus = JSON.parse(JSON.stringify(binding.evidence)) as Record<string, unknown>;
  wrongStatus.status = 'SOMEHOW_BOUND';
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: wrongStatus,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );
});

test('#640 A2: an inconsistent digest port through the binding verifier rejects the evidence deterministically', async () => {
  const { binding, successorAssembly } = await bindFixture();

  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: successorAssembly,
      sha256: lyingSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// A2/A5: hostile structure and torn-snapshot negatives.
// ---------------------------------------------------------------------------

test('#640 A5: accessor-backed evidence fails INVALID_BINDING_INPUT before evidence verification, with zero getter executions', async () => {
  const { binding, successorAssembly } = await bindFixture();

  let evidenceGetterCalls = 0;
  const accessorEvidence = {
    get status() {
      evidenceGetterCalls += 1;
      return 'BOUND';
    },
    definitionGraphDigest: binding.evidence.definitionGraphDigest,
    assemblyDigest: binding.evidence.assemblyDigest,
    toolComponentId: binding.evidence.toolComponentId,
    providesCapability: binding.evidence.providesCapability,
    implementation: binding.evidence.implementation,
    supportedOperations: binding.evidence.supportedOperations,
    bindingDigest: binding.evidence.bindingDigest,
  };

  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: accessorEvidence,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
  assert.equal(evidenceGetterCalls, 0, 'descriptor-safe validation never executes the getter');
});

test('#640 A5: symbol-keyed, non-enumerable and class-prototype evidence are typed rejections', async () => {
  const { binding, successorAssembly } = await bindFixture();
  const plain = JSON.parse(JSON.stringify(binding.evidence)) as Record<string, unknown>;

  const symbolKeyed = { ...plain };
  Object.defineProperty(symbolKeyed, Symbol('hidden'), { value: true, enumerable: false });
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: symbolKeyed,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );

  const hidden = { ...plain };
  Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false });
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: hidden,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );

  class CustomEvidence {}
  const classProto = Object.assign(new CustomEvidence(), plain);
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: classProto,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});

test('#640 A5: caller mutation of the evidence during the pending digest cannot tear the verified result', async () => {
  const { binding, successorAssembly } = await bindFixture();
  const mutable = JSON.parse(JSON.stringify(binding.evidence)) as Record<string, unknown>;

  const adversarial = mutationSha256(0, () => {
    (mutable.implementation as { implementationId: string }).implementationId = 'impl.hacked';
    (mutable.supportedOperations as string[]).length = 0;
  });

  const verified = await verifyToolImplementationBindingEvidence({
    evidence: mutable,
    finalAssembly: successorAssembly,
    sha256: adversarial,
  });

  assert.deepEqual(verified.evidence, binding.evidence, 'only the pre-await snapshot is verified');

  // The mutation was real: re-verifying the mutated evidence fails closed.
  await expectVerifierError(
    verifyToolImplementationBindingEvidence({
      evidence: mutable,
      finalAssembly: successorAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );
});

test('#640 A5: caller mutation after a completed verification cannot alias or alter the returned evidence', async () => {
  const { binding, successorAssembly } = await bindFixture();
  const mutable = JSON.parse(JSON.stringify(binding.evidence)) as typeof binding.evidence;

  const verified = await verifyToolImplementationBindingEvidence({
    evidence: mutable,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });
  const snapshot = JSON.parse(JSON.stringify(verified.evidence));

  (mutable.implementation as { implementationId: string }).implementationId = 'impl.hacked';
  (mutable.supportedOperations as string[]).length = 0;

  assert.deepEqual(verified.evidence, snapshot, 'returned evidence is fresh frozen and non-aliased');
  assert.equal(Object.isFrozen(verified.evidence), true);
});

// ---------------------------------------------------------------------------
// A3: final sealed-Assembly currentness.
// ---------------------------------------------------------------------------

test('#640 A3: a genuine binding is CURRENT against its own successor Assembly', async () => {
  const { binding, successorAssembly } = await bindFixture();

  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });

  assert.equal(verified.status, 'VERIFIED_CURRENT');
  assert.equal(verified.currentness.status, 'CURRENT');
  assert.equal(verified.currentness.finalAssemblyDigest, successorAssembly.assemblyDigest);
  assert.equal(verified.currentness.subject, 'tool.alpha');
});

test('#640 A3: a faithful later reseal that preserves the binding slot stays CURRENT; historical evidence.assemblyDigest is provenance only', async () => {
  const { binding, successorAssembly, definitionGraph } = await bindFixture();
  assert.notEqual(binding.evidence.assemblyDigest, undefined);

  // Reseal over the same exact graph/pins: the binding's slot is preserved
  // and one unrelated subject's slot is added. The final assemblyDigest
  // differs from the mint-time successor digest — that difference alone is
  // NOT stale.
  const finalAssembly = await resealWithSlots(definitionGraph, [
    { subject: 'zz.other.subject', bindingDigest: 'sha256:other-subject-binding' },
    { subject: binding.evidence.toolComponentId, bindingDigest: binding.evidence.bindingDigest },
  ]);
  assert.notEqual(finalAssembly.assemblyDigest, successorAssembly.assemblyDigest);

  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly,
    sha256: realSha256,
  });

  assert.equal(verified.status, 'VERIFIED_CURRENT');
  assert.equal(verified.currentness.status, 'CURRENT');
  assert.equal(verified.currentness.finalAssemblyDigest, finalAssembly.assemblyDigest);
  assert.equal(
    verified.currentness.finalAssemblyDigest === binding.evidence.assemblyDigest,
    false,
    'the historical mint-time digest remains provenance only',
  );
});

test('#640 A3: slot lookup is by exact subject identity, never first/latest/order position', async () => {
  const { binding, definitionGraph } = await bindFixture();

  // The binding's slot sorts LAST; a first/position-based lookup would
  // compare the unrelated slot and wrongly report STALE.
  const finalAssembly = await resealWithSlots(definitionGraph, [
    { subject: 'aaa.unrelated.subject', bindingDigest: 'sha256:unrelated' },
    { subject: binding.evidence.toolComponentId, bindingDigest: binding.evidence.bindingDigest },
  ]);

  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly,
    sha256: realSha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');
});

test('#640 A3: a missing final subject slot fails MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING — never another slot as fallback', async () => {
  const { binding, baseAssembly, definitionGraph } = await bindFixture();

  // Case 1: the base assembly carries no binding slots at all.
  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: baseAssembly,
      sha256: realSha256,
    }),
    'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
  );

  // Case 2: the final assembly carries only OTHER subjects' slots — the
  // verifier must not pick any of them as a fallback for this subject.
  const foreignSlotsOnly = await resealWithSlots(definitionGraph, [
    { subject: 'zz.other.subject', bindingDigest: 'sha256:other-subject-binding' },
  ]);
  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: foreignSlotsOnly,
      sha256: realSha256,
    }),
    'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('#640 A3: a present subject whose slot digest was replaced by a newer binding is STALE', async () => {
  // Two bindings of the SAME subject with different implementations: bravo
  // was bound later and its slot replaced alpha's in the final Assembly.
  const alpha = await bindFixture({ implementationId: 'impl.calc.alpha' });
  const bravo = await bindFixture({ implementationId: 'impl.calc.bravo' });

  assert.equal(alpha.binding.evidence.toolComponentId, bravo.binding.evidence.toolComponentId);
  assert.notEqual(
    alpha.binding.evidence.bindingDigest,
    bravo.binding.evidence.bindingDigest,
    'the replacement carries a different bindingDigest',
  );

  await expectVerifierError(
    verifyToolImplementationBinding({
      binding: alpha.binding,
      finalAssembly: bravo.successorAssembly,
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('#640 A3: a final Assembly whose Definition identity no longer matches is STALE even with the exact slot present', async () => {
  const { binding, definitionGraph } = await bindFixture();
  const foreignGraph = graph('graph.foreign-definition');
  assert.notEqual(
    await computeDefinitionGraphDigest(foreignGraph, realSha256),
    await computeDefinitionGraphDigest(definitionGraph, realSha256),
  );

  const foreignFinal = await resealWithSlots(foreignGraph, [
    { subject: binding.evidence.toolComponentId, bindingDigest: binding.evidence.bindingDigest },
  ]);

  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: foreignFinal,
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('#640 A3: the final Assembly must be a genuine T002B mint (authenticity stays T002B-owned)', async () => {
  const { binding, successorAssembly } = await bindFixture();

  const assemblyLookalike = {
    record: JSON.parse(JSON.stringify(successorAssembly.record)),
    assemblyDigest: successorAssembly.assemblyDigest,
    bindings: [],
  };

  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: assemblyLookalike as unknown as typeof successorAssembly,
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});

// ---------------------------------------------------------------------------
// A4: opaque runtime-handle pairing and exact-pin checking.
// ---------------------------------------------------------------------------

test('#640 A4: the original opaque handle is paired only after full verification', async () => {
  const handle = { connection: 'live-opaque' };
  const { binding, successorAssembly } = await bindFixture({ handle });

  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });

  assert.strictEqual(verified.implementationHandle, handle, 'the ORIGINAL reference is paired');
  assert.equal(
    'implementationHandle' in verified.evidence,
    false,
    'the verified evidence never carries the handle',
  );
});

test('#640 A4: a binding minted without a handle pairs undefined; the handle never enters identity', async () => {
  const { binding, successorAssembly } = await bindFixture();

  assert.equal(binding.implementationHandle, undefined);
  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });
  assert.equal(verified.implementationHandle, undefined);
});

test('#640 A4: two bindings differing only in handle carry byte-identical evidence and both verify', async () => {
  const bare = await bindFixture();
  const withHandle = await bindFixture({ handle: { connection: 'live' } });
  const otherHandle = await bindFixture({ handle: { connection: 'other' } });

  assert.deepEqual(bare.binding.evidence, withHandle.binding.evidence);
  assert.equal(bare.binding.evidence.bindingDigest, withHandle.binding.evidence.bindingDigest);
  assert.equal(bare.binding.evidence.bindingDigest, otherHandle.binding.evidence.bindingDigest);
  assert.equal(
    bare.binding.successorAssembly.assemblyDigest,
    withHandle.binding.successorAssembly.assemblyDigest,
  );

  for (const fixture of [bare, withHandle, otherHandle]) {
    const verified = await verifyToolImplementationBinding({
      binding: fixture.binding,
      finalAssembly: fixture.successorAssembly,
      sha256: realSha256,
    });
    assert.equal(verified.status, 'VERIFIED_CURRENT');
    assert.equal('implementationHandle' in verified.evidence, false);
  }
});

test('#640 A4: an expected exact pin equal to the verified evidence pin verifies; any field mismatch fails TOOL_IMPLEMENTATION_PIN_MISMATCH', async () => {
  const { binding, successorAssembly } = await bindFixture();
  const exact: ToolImplementationIdentity = { ...binding.evidence.implementation };

  const verified = await verifyToolImplementationBinding({
    binding,
    finalAssembly: successorAssembly,
    expectedImplementationPin: exact,
    sha256: realSha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');

  for (const mismatched of [
    { ...exact, implementationId: 'impl.calc.other' },
    { ...exact, implementationVersion: '2.0.0' },
    { ...exact, implementationDigest: 'sha256:different-content' },
  ] as ToolImplementationIdentity[]) {
    await expectVerifierError(
      verifyToolImplementationBinding({
        binding,
        finalAssembly: successorAssembly,
        expectedImplementationPin: mismatched,
        sha256: realSha256,
      }),
      'TOOL_IMPLEMENTATION_PIN_MISMATCH',
    );
  }
});

test('#640 A4: the expected pin is checked only against the verified evidence pin — never against candidates, order or latest', async () => {
  const { binding, successorAssembly } = await bindFixture();

  // An expected pin naming an implementation that was never bound cannot be
  // satisfied by any lookup: the only accepted pin is the evidence pin.
  await expectVerifierError(
    verifyToolImplementationBinding({
      binding,
      finalAssembly: successorAssembly,
      expectedImplementationPin: {
        implementationId: 'impl.calc.bravo',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.bravo-content',
      },
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );
});
