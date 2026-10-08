/**
 * E7 SUCCESSOR RERUN — authority-admissible evidence with the REAL production
 * candidates (gate issue #913, the #898 redispatch; controller #537
 * LOCAL_FIRST_MAX_SAFE_PARALLELISM #537@6042127032; rediscovery record
 * #537@6043943145 making this redispatch legal).
 *
 * RERUN (#913, successor-rerun precedent PR #900): the frozen E7 obligations
 * of the original #898 mission (planning authority #589 PACK-D) are
 * re-executed AT THE CURRENT HEAD against the REAL production-owned
 * candidates landed by PR #912 (#906, E7-BOOT):
 *
 *   Semantic: kaicreator.standard.component.approval-workflow
 *             (src/standard/bootstrap-definition.ts, over the existing
 *             production Workflow Kind kaicreator.workflow@1.0.0, T007A)
 *   Tool:     kaicreator.standard.component.canonical-digest
 *             (src/standard/bootstrap-definition.ts, one deterministic
 *             effect=none operation op.digestCanonicalJson over the existing
 *             canonical-JSON digest seam of contracts/identity.js)
 *
 * WHY THIS RERUN EXISTS: PR #903 (the original E7 evidence) was adjudicated
 * AUTHORITY-INADMISSIBLE — its candidates were test-owned/synthetic
 * (`e7.test.*` namespace, see the landed-but-adjudicated
 * tests/e7/e7-standard-component-bootstrap.test.ts) and it carried no REAL
 * generic T004B invocation witness. The landed suite
 * tests/standard/e7-production-candidates.test.ts (PR #912, 9/9) proved the
 * obligations once with the real candidates; THIS file re-derives each frozen
 * obligation VISIBLY AT THIS HEAD, byte-faithfully, in successor-rerun form —
 * no obligation is merely cited.
 *
 * SUBJECT_BASE=version/v0.7@59a5b2d6668776d7c413f2c3aa678b41c276a236
 * (PR #912 merge head; verified `git rev-parse HEAD`; EVIDENCE_CLAIM
 * #913@6044036364). MICROKERNEL_SOURCE_DIFF=0; write set is this evidence
 * file only; the landed tests/standard/* suite is NOT edited.
 *
 * Obligation -> rerun-test mapping (frozen E7 obligations, REAL candidates):
 *  O1 (E7R-1) same Component/Kind/Tool/admission paths as app components —
 *     must-understand admission (admitComponent), T002B seal
 *     (sealRuntimeAssembly) + Assembly admission (admitComponentWithAssembly),
 *     Tool contract validation (validateToolComponent): identical entry
 *     points, identical typed failure codes for Standard candidates and an
 *     app-defined twin; no standard-specific dispatch;
 *  O2 (E7R-2) descriptor semantic identity is Definition-plane — the
 *     descriptor digests are byte-frozen and remain byte-identical across
 *     Assembly-plane pin replacement;
 *  O3 (E7R-3) Standard Set / reference implementation pins are Assembly-plane
 *     — pin replacement moves the Assembly digest and fails a stale Set
 *     closed typed (STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH) while
 *     the Definition graph digest stays byte-stable;
 *  O4 (E7R-4) no privileged Standard registry/admission/Microkernel branch —
 *     executable source scan over the WHOLE src tree: zero imports of the
 *     standard module from outside itself; zero `standard` references in the
 *     authority-bearing generic modules; the candidate modules themselves
 *     import no Standard contract module and carry no standardId branch;
 *  O5 (E7R-5) the REAL generic T004B invocation witness — the production
 *     candidates bootstrapped through the generic T002B -> T003B -> T003C
 *     chain, then invoked through the raw generic T004A -> T004B path with a
 *     COUNTING host dispatch port: exactly-once dispatch, output byte-equal
 *     to the independent production digest seam, full outcome-shape parity
 *     with an app-defined twin control through the identical raw entry points.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  createWorkflowKindImplementation,
  validateWorkflowComponent,
} from '../../src/adapters/workflow-kind.js';
import {
  ComponentAdmissionError,
  admitComponent,
  type UnderstoodKindDeclaration,
} from '../../src/contracts/component-admission.js';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  resolveCurrentCapabilityProvider,
  type CurrentCapabilityProviderSelection,
} from '../../src/contracts/capability-provision.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolInvocationResult,
} from '../../src/contracts/non-effectful-invocation.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationPin,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  StandardContractError,
  computeStandardDescriptorDigest,
  sealStandardSet,
  validateStandardComponentDescriptor,
  verifyStandardSetCurrentness,
  type StandardComponentDescriptor,
} from '../../src/contracts/standard.js';
import { validateToolComponent } from '../../src/contracts/tool-component.js';
import {
  bindToolImplementation,
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  STANDARD_APPROVAL_WORKFLOW_COMPONENT,
  STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR,
  STANDARD_CANONICAL_DIGEST_CAPABILITY,
  STANDARD_CANONICAL_DIGEST_COMPONENT,
  STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
  STANDARD_CANONICAL_DIGEST_KIND_REF,
  STANDARD_CANONICAL_DIGEST_OPERATION_ID,
} from '../../src/standard/bootstrap-definition.js';
import {
  STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION,
  STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION,
  bootstrapStandardCandidates,
  createStandardCanonicalDigestDispatchPort,
  invokeStandardCanonicalDigest,
  type StandardBootstrapEvidence,
} from '../../src/standard/bootstrap-runtime.js';

// ---------------------------------------------------------------------------
// Frozen identity — the SAME constants frozen by the landed PR #912 suite
// (tests/standard/e7-production-candidates.test.ts, pre-commit scratch probe
// over the exact landed material). This rerun re-derives every one of them
// FROM SCRATCH at the current head; byte-equality IS the frozen-identity
// proof at this head. Do not edit candidate material without recomputing.
// ---------------------------------------------------------------------------

const FROZEN = Object.freeze({
  definitionGraphDigest:
    '0e7353207aa7139dc225ab1debb505f020ab08d6d6c673d872fc1c160f607343',
  descriptorDigestApproval:
    'd277acadfbf027baa3bef0dca8f58c1c356019ddf84793f97b085564bed085a4',
  descriptorDigestTool:
    '70a007e5e8156311c6310bb979424ffb758f297a8f9840e0f26bcc58dbd11893',
  assemblyBaseDigest:
    '98054cc9996b193f4a3b413cb22aefb7f875938c0b3d64f1b338687a3320db87',
  assemblySuccessorDigest:
    '545b7d03f4bc6b7235969ee656c8562cde5aa08d83e79f203292d00a39b6cb35',
  toolBindingDigest:
    '6f61b451a6b658f7b6ab9dd67523c4fdeaefa344fbed3041db4498a05ca6ea0b',
});

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

async function bootstrap(): Promise<StandardBootstrapEvidence> {
  return bootstrapStandardCandidates(realSha256);
}

function workflowPinOf(assembly: SealedRuntimeAssembly): KindImplementationPin {
  const binding = assembly.bindings.find(
    (candidate) => candidate.pin.kind.kindId === 'kaicreator.workflow',
  );
  assert.ok(binding, 'assembly must bind the Workflow Kind');
  return binding.pin;
}

function toolKindPinOf(assembly: SealedRuntimeAssembly): KindImplementationPin {
  const binding = assembly.bindings.find(
    (candidate) => candidate.pin.kind.kindId === STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
  );
  assert.ok(binding, 'assembly must bind the canonical-digest Tool Kind');
  return binding.pin;
}

// ---------------------------------------------------------------------------
// E7R-1 (O1): the REAL Semantic and Tool candidates ride the SAME generic
// Component/Kind/Tool/admission paths as app components — identical entry
// points, identical typed failure codes, no standard-specific dispatch.
// ---------------------------------------------------------------------------

test('E7R-1: REAL Standard Semantic + Tool candidates use the SAME generic admission paths as an app-defined twin, with identical typed failure codes', async () => {
  const evidence = await bootstrap();
  const graph = evidence.definitionGraph;

  // The descriptor records validate through the REAL Standard contract
  // validator and assign to the contract type without a cast (compile-time
  // structural identity, exercised here at runtime).
  const approval: StandardComponentDescriptor = STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR;
  const tool: StandardComponentDescriptor = STANDARD_CANONICAL_DIGEST_DESCRIPTOR;
  assert.doesNotThrow(() => validateStandardComponentDescriptor(approval));
  assert.doesNotThrow(() => validateStandardComponentDescriptor(tool));
  assert.doesNotThrow(() => validateWorkflowComponent(STANDARD_APPROVAL_WORKFLOW_COMPONENT));
  assert.doesNotThrow(() => validateToolComponent(STANDARD_CANONICAL_DIGEST_COMPONENT));

  // Must-understand admission: ONE shared rule set for Standard and app twin.
  const appTwinSemantic: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.rerun.twin.review-workflow',
    kind: { kindId: 'kaicreator.workflow', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
    semanticBody: {
      initial: 'review.pending',
      states: [{ stateId: 'review.pending' }, { stateId: 'review.done' }],
      transitions: [
        {
          transitionId: 'review.transition.finish',
          from: 'review.pending',
          to: 'review.done',
          event: 'review.request.finish',
        },
      ],
    },
  };
  const workflowDeclaration: UnderstoodKindDeclaration = {
    kind: { kindId: 'kaicreator.workflow', version: '1.0.0' },
    understoodSemanticContracts: [],
    understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
    validateComponent: validateWorkflowComponent,
  };
  const toolDeclaration: UnderstoodKindDeclaration = {
    kind: {
      kindId: STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
      version: STANDARD_CANONICAL_DIGEST_KIND_REF.version,
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: validateToolComponent,
  };
  const admittedStandardSemantic = admitComponent(STANDARD_APPROVAL_WORKFLOW_COMPONENT, [
    workflowDeclaration,
  ]);
  const admittedTwinSemantic = admitComponent(appTwinSemantic, [workflowDeclaration]);
  const admittedStandardTool = admitComponent(STANDARD_CANONICAL_DIGEST_COMPONENT, [
    toolDeclaration,
  ]);
  assert.equal(admittedStandardSemantic.admittedKind.kindId, 'kaicreator.workflow');
  assert.equal(admittedTwinSemantic.admittedKind.kindId, 'kaicreator.workflow');
  assert.equal(admittedStandardTool.admittedKind.kindId, STANDARD_CANONICAL_DIGEST_KIND_REF.kindId);

  // T002B Assembly admission: the SAME generic admitComponentWithAssembly for
  // the Standard Semantic candidate and the app twin, against their sealed
  // Assemblies — the SAME admitted pin shape (both ride one Workflow Kind
  // implementation binding of the SAME final Assembly).
  const twinGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.app.rerun.semantic-parity',
    components: [{ ...appTwinSemantic, kind: { ...appTwinSemantic.kind } }],
    relations: [],
  };
  const twinAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: twinGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: { ...STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION },
          understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        }),
      ],
    },
    realSha256,
  );
  const assemblyAdmittedStandard = await admitComponentWithAssembly(
    STANDARD_APPROVAL_WORKFLOW_COMPONENT,
    evidence.assembly,
    { currentDefinitionGraph: graph, sha256: realSha256 },
  );
  const assemblyAdmittedTwin = await admitComponentWithAssembly(appTwinSemantic, twinAssembly, {
    currentDefinitionGraph: twinGraph,
    sha256: realSha256,
  });
  assert.deepEqual(
    Object.keys(assemblyAdmittedStandard.admittedKindImplementation).sort(),
    Object.keys(assemblyAdmittedTwin.admittedKindImplementation).sort(),
  );
  assert.deepEqual(assemblyAdmittedStandard.admittedKindImplementation, workflowPinOf(evidence.assembly));
  assert.deepEqual(assemblyAdmittedTwin.admittedKindImplementation, workflowPinOf(twinAssembly));

  // Negative parity: an unbound exact Kind fails with the SAME typed codes
  // for the Standard-referenced Component and the app twin — no
  // standard-specific branch anywhere in the admission path.
  const foreignComponent: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.rerun.twin.foreign',
    kind: { kindId: 'app.rerun.kind.foreign', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { arbitrary: 'material' },
  };
  await assert.rejects(
    admitComponentWithAssembly(foreignComponent, evidence.assembly, {
      currentDefinitionGraph: graph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError, `expected RuntimeAssemblyError, got ${String(error)}`);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
  await assert.rejects(
    admitComponentWithAssembly(foreignComponent, twinAssembly, {
      currentDefinitionGraph: twinGraph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError, `expected RuntimeAssemblyError, got ${String(error)}`);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
  assert.throws(
    () => admitComponent(STANDARD_APPROVAL_WORKFLOW_COMPONENT, []),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'UNKNOWN_KIND');
      return true;
    },
  );
  assert.throws(
    () => admitComponent(appTwinSemantic, []),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'UNKNOWN_KIND');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// E7R-2 (O2): descriptor semantic identity is Definition-plane — byte-frozen
// digests, immune to Assembly-plane pin replacement.
// ---------------------------------------------------------------------------

test('E7R-2: REAL candidate descriptor identity is Definition-plane — byte-frozen digests, unchanged by Assembly-plane pin replacement', async () => {
  const evidence = await bootstrap();

  // Frozen descriptor identity re-derived from scratch at this head.
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestApproval,
  );
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_CANONICAL_DIGEST_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestTool,
  );

  // Assembly-plane replacement: reseal the SAME Definition graph with a
  // DIFFERENT exact Workflow Kind implementation pin (and a bumped Tool Kind
  // pin digest). This is precisely the operation O2 says must not move
  // Definition identity.
  const replacementAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: evidence.definitionGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: {
            implementationId: STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION.implementationId,
            implementationVersion: '1.1.0',
            implementationDigest:
              'sha256:4e5a1c2b9d8f3a6e0b1c4d7f2a5e8b3c6d9f1a4b7e0d3c6a9f2b5e8d1c4a7b0e',
          },
          understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        }),
        {
          pin: {
            kind: { ...toolKindPinOf(evidence.assembly).kind },
            implementation: {
              ...STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION,
              implementationVersion: '1.1.0',
              implementationDigest:
                'sha256:1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: validateToolComponent,
        },
      ],
    },
    realSha256,
  );
  assert.notEqual(replacementAssembly.assemblyDigest, FROZEN.assemblyBaseDigest);

  // Definition identity is immune: descriptor digests AND the Definition
  // graph digest are byte-identical across the pin replacement.
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestApproval,
  );
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_CANONICAL_DIGEST_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestTool,
  );
  assert.equal(
    await computeDefinitionGraphDigest(evidence.definitionGraph, realSha256),
    FROZEN.definitionGraphDigest,
  );
});

// ---------------------------------------------------------------------------
// E7R-3 (O3): Standard Set / reference implementation pins are Assembly-plane
// — replacement moves Assembly/Set currentness, never Definition identity.
// ---------------------------------------------------------------------------

test('E7R-3: pins are Assembly-plane — replacement moves the Assembly digest and fails a stale Set closed typed, while Definition identity stays byte-stable', async () => {
  const evidence = await bootstrap();
  const { definitionGraph, assembly, successorAssembly, binding } = evidence;

  // Seal the Standard Set over the REAL candidates' exact pins (re-derived).
  async function descriptorEntry(
    descriptor: StandardComponentDescriptor,
    pin: KindImplementationPin,
  ) {
    return {
      descriptor: {
        standardId: descriptor.standardId,
        descriptorVersion: descriptor.descriptorVersion,
        descriptorDigest: await computeStandardDescriptorDigest(descriptor, realSha256),
      },
      pin,
    };
  }
  const set = await sealStandardSet(
    {
      entries: [
        await descriptorEntry(STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, workflowPinOf(assembly)),
        await descriptorEntry(STANDARD_CANONICAL_DIGEST_DESCRIPTOR, toolKindPinOf(assembly)),
      ],
      currentDescriptors: [
        STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR,
        STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
      ],
      implementationBindingEvidence: [
        {
          subject: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
          bindingDigest: binding.evidence.bindingDigest,
        },
      ],
    },
    realSha256,
  );

  // CURRENT against the exact successor Assembly with the exact sealed binding.
  const current = await verifyStandardSetCurrentness(set, {
    currentDescriptors: [
      STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR,
      STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
    ],
    currentDefinitionGraph: definitionGraph,
    finalAssembly: successorAssembly,
    sealedToolBindings: [binding],
    sha256: realSha256,
  });
  assert.equal(current.status, 'CURRENT');
  assert.equal(current.finalAssemblyDigest, FROZEN.assemblySuccessorDigest);

  // Pin replacement on the Assembly plane (same Definition graph).
  const replacementAssembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: {
            implementationId: STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION.implementationId,
            implementationVersion: '1.1.0',
            implementationDigest:
              'sha256:4e5a1c2b9d8f3a6e0b1c4d7f2a5e8b3c6d9f1a4b7e0d3c6a9f2b5e8d1c4a7b0e',
          },
          understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        }),
        {
          pin: {
            kind: { ...toolKindPinOf(assembly).kind },
            implementation: { ...toolKindPinOf(assembly).implementation },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: validateToolComponent,
        },
      ],
    },
    realSha256,
  );
  assert.notEqual(replacementAssembly.assemblyDigest, FROZEN.assemblyBaseDigest);

  // The Set pinned to the OLD implementation fails closed typed against the
  // replacement Assembly — unchanged Definition semantics cannot rescue a
  // stale Assembly-plane pin.
  await assert.rejects(
    verifyStandardSetCurrentness(set, {
      currentDescriptors: [
        STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR,
        STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
      ],
      currentDefinitionGraph: definitionGraph,
      finalAssembly: replacementAssembly,
      sealedToolBindings: [binding],
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH');
      return true;
    },
  );

  // Definition plane untouched by the replacement: byte-identical graph and
  // descriptor digests.
  assert.equal(
    await computeDefinitionGraphDigest(definitionGraph, realSha256),
    FROZEN.definitionGraphDigest,
  );
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestApproval,
  );
});

// ---------------------------------------------------------------------------
// E7R-4 (O4): no privileged Standard registry/admission/Microkernel branch —
// executable source scan of the WHOLE src tree at this head.
// ---------------------------------------------------------------------------

test('E7R-4: no privileged Standard branch — zero src imports of the standard module from outside itself; zero standard references in the authority-bearing generic modules', () => {
  const testDir = fileURLToPath(new URL('.', import.meta.url));
  const srcRoot = join(testDir, '..', '..', 'src');
  const sourceFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts')) {
        sourceFiles.push(full);
      }
    }
  };
  walk(srcRoot);
  assert.ok(sourceFiles.length > 100, `expected a real src tree, found ${sourceFiles.length} files`);

  // No src module outside the Standard contract module itself may import the
  // standard module (no privileged registry/admission/dispatch coupling).
  const standardModuleImport = /from\s+['"][^'"]*\/standard\.js['"]/g;
  const importers: string[] = [];
  for (const file of sourceFiles) {
    const rel = relative(srcRoot, file).replace(/\\/g, '/');
    const text = readFileSync(file, 'utf8');
    if (rel === 'contracts/standard.ts') {
      continue; // the module itself
    }
    for (const match of text.matchAll(standardModuleImport)) {
      if (match[0].includes('contracts/standard.js') || match[0].includes('./standard.js')) {
        importers.push(rel);
      }
    }
  }
  assert.deepEqual(
    importers,
    [],
    'no src module outside contracts/standard.ts may import the standard module',
  );

  // The authority-bearing generic paths must not even NAME Standard: T002B
  // Assembly admission/sealing, must-understand admission and the invocation
  // paths are standard-agnostic by construction.
  const authorityModules = [
    'contracts/runtime-assembly.ts',
    'contracts/component-admission.ts',
    'contracts/non-effectful-invocation.ts',
    'contracts/effectful-invocation.ts',
    'contracts/tool-implementation-binding.ts',
    'contracts/tool-component.ts',
    'contracts/capability-provision.ts',
  ];
  for (const rel of authorityModules) {
    const text = readFileSync(join(srcRoot, ...rel.split('/')), 'utf8');
    assert.doesNotMatch(
      text,
      /\bstandard\b/i,
      `${rel} must carry no Standard reference (no privileged branch in the generic authority path)`,
    );
  }

  // The candidate modules themselves: no Standard contract import (plain
  // data consumed through the generic authorities) and no standardId branch
  // in the runtime plane.
  const definitionSource = readFileSync(
    join(srcRoot, 'standard', 'bootstrap-definition.ts'),
    'utf8',
  );
  const runtimeSource = readFileSync(
    join(srcRoot, 'standard', 'bootstrap-runtime.ts'),
    'utf8',
  );
  for (const [name, source] of [
    ['bootstrap-definition.ts', definitionSource],
    ['bootstrap-runtime.ts', runtimeSource],
  ] as const) {
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*contracts\/standard\.js['"]/,
      `${name} must not import the Standard contract module (no privileged coupling)`,
    );
  }
  assert.doesNotMatch(
    runtimeSource,
    /\bstandardId\b/,
    'bootstrap-runtime.ts must carry no standardId branch (no Standard-only dispatch)',
  );
});

// ---------------------------------------------------------------------------
// E7R-5 (O5): the REAL generic T004B invocation witness — exactly-once
// dispatch via a counting port, output byte-equal to the independent
// production digest seam, parity with an app-defined twin.
// ---------------------------------------------------------------------------

/**
 * The raw generic T004A -> T004B chain — the identical entry points an
 * app-defined control uses, with a counting host dispatch port to prove real
 * execution (successor-rerun twin of the landed E7P-4 witness).
 */
async function rawGenericInvocation(options: {
  readonly graph: DefinitionGraphEnvelope;
  readonly binding: SealedToolImplementationBinding;
  readonly toolComponentId: string;
  readonly operationId: string;
  readonly input: JsonValue;
  readonly dispatch: NonEffectfulToolDispatchPort;
}): Promise<NonEffectfulToolInvocationResult> {
  const exposure = await admitToolExposure(
    {
      toolComponentId: options.toolComponentId,
      operationId: options.operationId,
      caller: { callerId: 'e7r.witness.raw-chain' },
      assembly: options.binding.successorAssembly,
      currentDefinitionGraph: options.graph,
      policy: { decideAdmission: () => ({ admitted: true } as const) },
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: options.toolComponentId,
      operationId: options.operationId,
      input: options.input,
      caller: { callerId: 'e7r.witness.raw-chain' },
      definitionGraphDigest: exposure.definitionGraphDigest,
      assemblyDigest: exposure.assemblyDigest,
      exposure,
    },
    { assembly: options.binding.successorAssembly, currentDefinitionGraph: options.graph },
    realSha256,
  );
  return invokeNonEffectfulTool({
    request: admitted,
    binding: options.binding,
    currentDefinitionGraph: options.graph,
    dispatch: options.dispatch,
    sha256: realSha256,
  });
}

test('E7R-5: REAL T004B invocation witness — the production candidates dispatch exactly once through the generic path, output byte-equal to the independent digest seam', async () => {
  const evidence = await bootstrap();
  const value: JsonValue = { claim: 'e7-successor-rerun-witness', rerun: 913, payload: [7, 13] };

  // Frozen Assembly-plane identity re-derived from scratch at this head
  // (base seal -> T003B exact selection -> T003C genuine binding).
  assert.equal(evidence.assembly.assemblyDigest, FROZEN.assemblyBaseDigest);
  assert.equal(evidence.successorAssembly.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(evidence.binding.evidence.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(
    await computeDefinitionGraphDigest(evidence.definitionGraph, realSha256),
    FROZEN.definitionGraphDigest,
  );

  // T003B: the exact provider of the canonical-digest Capability is the
  // Standard Tool Component; T003C: the sealed binding carries the exact
  // reference pin and operation set; the SAME accepted T003C verifier an app
  // uses re-verifies currentness.
  assert.equal(
    evidence.selection.provider.componentId,
    STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
  );
  assert.equal(evidence.binding.evidence.status, 'BOUND');
  assert.deepEqual(evidence.binding.evidence.supportedOperations, [
    STANDARD_CANONICAL_DIGEST_OPERATION_ID,
  ]);
  const verified = await verifyToolImplementationBinding({
    binding: evidence.binding,
    finalAssembly: evidence.successorAssembly,
    sha256: realSha256,
  });
  assert.equal(verified.evidence.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(verified.currentness.subject, STANDARD_CANONICAL_DIGEST_COMPONENT.componentId);

  // The REAL invocation through the production runtime helper (T004A -> T004B).
  const helperResult = await invokeStandardCanonicalDigest({
    bootstrap: evidence,
    value,
    sha256: realSha256,
  });
  assert.equal(helperResult.status, 'OBSERVED');
  assert.equal(helperResult.toolComponentId, STANDARD_CANONICAL_DIGEST_COMPONENT.componentId);
  assert.equal(helperResult.operationId, STANDARD_CANONICAL_DIGEST_OPERATION_ID);
  assert.equal(helperResult.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(helperResult.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(helperResult.definitionGraphDigest, FROZEN.definitionGraphDigest);

  // The output is EXACTLY what the existing production digest seam computes.
  const expectedDigest = await computeCanonicalJsonDigest(value, realSha256);
  assert.deepEqual(helperResult.output, { digest: expectedDigest });

  // The SAME Standard candidate through the RAW generic chain, with a
  // COUNTING host dispatch port proving the dispatch really executed.
  let standardDispatchCount = 0;
  const standardResult = await rawGenericInvocation({
    graph: evidence.definitionGraph,
    binding: evidence.binding,
    toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
    operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
    input: { value },
    dispatch: {
      async dispatch(query) {
        standardDispatchCount += 1;
        return createStandardCanonicalDigestDispatchPort(realSha256).dispatch(query);
      },
    },
  });
  assert.equal(standardDispatchCount, 1, 'the T004B dispatch executed exactly once');
  assert.deepEqual(
    standardResult.output,
    { digest: expectedDigest },
    'the raw generic chain output is byte-equal to the independent digest seam',
  );
  assert.deepEqual(standardResult.output, helperResult.output, 'raw chain and runtime helper agree');
  assert.equal(standardResult.bindingDigest, helperResult.bindingDigest);

  // App-defined twin control through the IDENTICAL raw generic chain: same
  // evidence shape, same output — the Standard candidate is not privileged.
  const twinCapability = Object.freeze({
    capabilityId: 'app.rerun.capability.canonical-digest',
    version: '1.0.0',
  });
  const twinTool: ComponentEnvelope = {
    family: 'tool',
    componentId: 'app.rerun.component.canonical-digest',
    kind: { kindId: 'app.rerun.kind.canonical-digest', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 'op.digest',
          inputSchema: {},
          outputSchema: {},
          effect: 'none',
        },
      ],
      providesCapabilities: [{ ...twinCapability }],
    },
  };
  const twinConsumer: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.rerun.component.digest-consumer',
    kind: { kindId: 'kaicreator.workflow', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ ...twinCapability }],
    semanticBody: {
      initial: 'twin.pending',
      states: [{ stateId: 'twin.pending' }, { stateId: 'twin.done' }],
      transitions: [
        {
          transitionId: 'twin.transition.finish',
          from: 'twin.pending',
          to: 'twin.done',
          event: 'twin.request.finish',
        },
      ],
    },
  };
  const twinGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.app.rerun.tool-parity',
    components: [
      { ...twinConsumer, kind: { ...twinConsumer.kind } },
      { ...twinTool, kind: { ...twinTool.kind } },
    ],
    relations: [],
  };
  const twinGraphDigest = await computeDefinitionGraphDigest(twinGraph, realSha256);
  const twinAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: twinGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: {
            implementationId: 'app.rerun.impl.workflow-engine',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:app-rerun-workflow-engine-content',
          },
          understoodCapabilities: [{ ...twinCapability }],
        }),
        {
          pin: {
            kind: { kindId: 'app.rerun.kind.canonical-digest', version: '1.0.0' },
            implementation: {
              implementationId: 'app.rerun.impl.digest-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:app-rerun-digest-kind-content',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: validateToolComponent,
        },
      ],
    },
    realSha256,
  );
  const twinSelection = await resolveCurrentCapabilityProvider(
    twinGraph,
    twinCapability,
    twinConsumer.componentId,
    twinGraphDigest,
    realSha256,
  );
  const twinBinding = await bindToolImplementation({
    assembly: twinAssembly,
    selection: JSON.parse(JSON.stringify(twinSelection)) as CurrentCapabilityProviderSelection,
    currentDefinitionGraph: twinGraph,
    implementations: [
      {
        implementation: {
          implementationId: 'app.rerun.impl.digest-exec',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:app-rerun-digest-exec-content',
        },
        supportedOperations: ['op.digest'],
        handle: Object.freeze({ twin: 'app.rerun.digest-handle' }),
      },
    ],
    sha256: realSha256,
  });
  let twinDispatchCount = 0;
  const twinResult = await rawGenericInvocation({
    graph: twinGraph,
    binding: twinBinding,
    toolComponentId: twinTool.componentId,
    operationId: 'op.digest',
    input: { value },
    dispatch: {
      async dispatch(query) {
        twinDispatchCount += 1;
        assert.equal(query.operationId, 'op.digest');
        const digest = await computeCanonicalJsonDigest(
          (query.input as { value: unknown }).value,
          realSha256,
        );
        return { digest };
      },
    },
  });
  assert.equal(twinDispatchCount, 1, 'the app twin dispatched exactly once through the same T004B path');
  assert.equal(standardResult.status, 'OBSERVED');
  assert.equal(twinResult.status, 'OBSERVED');
  assert.deepEqual(Object.keys(standardResult).sort(), Object.keys(twinResult).sort());
  assert.deepEqual(twinResult.output, standardResult.output);
});
