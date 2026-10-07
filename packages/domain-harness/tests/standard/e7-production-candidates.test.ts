/**
 * E7 production Standard candidates — authenticity, generic-path parity and
 * the REAL T004B invocation witness (issue #906, E7-BOOT successor of the
 * adjudicated authority-inadmissible PR #903; authority #713@6041746570
 * RELEASED_BOUNDED; acceptance packet #713@6041458190).
 *
 * PR #903's E7 suite proved the generic contracts with test-owned synthetic
 * candidates under the `e7.test.*` namespace. This suite proves the missing
 * production half: the two REAL candidates published as ordinary src material
 * in `src/standard/` — a published Standard Semantic descriptor over the
 * EXISTING production Workflow Kind (`kaicreator.workflow@1.0.0`) and a
 * published Standard Tool descriptor with one deterministic `effect=none`
 * operation over the EXISTING canonical-JSON digest seam — riding the SAME
 * generic authorities an app-defined control uses, with the REAL generic
 * T004B invocation executed and observed.
 *
 * Proof obligations (acceptance packet):
 *  E7P-1 candidate authenticity: the candidates resolve from src/ (never
 *     test-local synthesis), validate through the REAL contract validators
 *     (`validateStandardComponentDescriptor`, `validateWorkflowComponent`,
 *     `validateToolComponent`), assign to the contract types without casts,
 *     and the Definition module exports plain JSON data only (no handles,
 *     pins, module paths or Runtime authority);
 *  E7P-2 generic-path parity (Semantic): the Standard Semantic candidate is
 *     admitted through the identical must-understand and T002B Assembly
 *     admission functions as an app-defined control, with identical typed
 *     failure codes;
 *  E7P-3 T003B exact provider selection -> genuine T003C binding/currentness
 *     with frozen real identity digests;
 *  E7P-4 the mandatory witness: generic T004A exposure/request admission ->
 *     REAL T004B invocation of the Standard Tool, dispatch execution proven
 *     by a counting host port, output verified against the independent
 *     production digest seam, full parity with an app-defined twin control
 *     through the same raw generic entry points;
 *  E7P-5 negative/currentness matrix: stale pins fail closed typed; forged
 *     binding evidence fails through the owning T003C code; implementation
 *     replacement changes Assembly/Set identity only, never Definition
 *     identity; #820 effect=none eligibility consumes the real candidates;
 *     effectful operations and stale requests fail closed at T004B/T004A;
 *  E7P-6 no Standard-only path: executable source scan of the production
 *     modules (no import of the Standard contract module, no standardId
 *     branch in the runtime plane).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { computeCanonicalJsonDigest } from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  resolveCurrentCapabilityProvider,
  type CurrentCapabilityProviderSelection,
} from '../../src/contracts/capability-provision.js';
import {
  InvocationRequestError,
  admitToolExposure,
  admitToolInvocationRequest,
} from '../../src/contracts/invocation-request.js';
import {
  NonEffectfulInvocationError,
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
  STANDARD_SEMANTIC_CANDIDATE_ABSENT,
  STANDARD_TOOL_CANDIDATE_ABSENT,
  StandardCandidateAbsentError,
  StandardContractError,
  computeStandardDescriptorDigest,
  sealStandardSet,
  selectStandardBootstrapCandidate,
  validateStandardComponentDescriptor,
  verifyStandardSetCurrentness,
  type ExactComponentRef,
  type StandardBootstrapCandidate,
  type StandardComponentDescriptor,
  type StandardSetCurrentnessOptions,
} from '../../src/contracts/standard.js';
import { validateToolComponent } from '../../src/contracts/tool-component.js';
import {
  ToolImplementationBindingError,
  bindToolImplementation,
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import * as definitionModule from '../../src/standard/bootstrap-definition.js';
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
  STANDARD_CANONICAL_DIGEST_IMPLEMENTATION,
  STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION,
  bootstrapStandardCandidates,
  createStandardCanonicalDigestDispatchPort,
  invokeStandardCanonicalDigest,
  type StandardBootstrapEvidence,
} from '../../src/standard/bootstrap-runtime.js';

// ---------------------------------------------------------------------------
// Frozen identity (digests computed by scratch probe BEFORE this commit over
// the exact landed material; see issue #906 terminal). Do not edit candidate
// material without recomputing — these constants ARE the frozen identity.
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

async function bootstrap(): Promise<StandardBootstrapEvidence> {
  return bootstrapStandardCandidates(realSha256);
}

// ---------------------------------------------------------------------------
// E7P-1 (authenticity): production candidates resolve from src/, validate
// through the real contracts, and the Definition module is plain JSON data.
// ---------------------------------------------------------------------------

test('E7P-1: production candidates resolve from src/standard, validate through the real contracts, and carry no Runtime authority', async () => {
  // The descriptor records assign to the REAL contract type without a cast
  // (compile-time structural proof) and validate through the real validator.
  const approval: StandardComponentDescriptor = STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR;
  const tool: StandardComponentDescriptor = STANDARD_CANONICAL_DIGEST_DESCRIPTOR;
  assert.doesNotThrow(() => validateStandardComponentDescriptor(approval));
  assert.doesNotThrow(() => validateStandardComponentDescriptor(tool));

  // The referenced Components validate through the REAL Kind/Tool validators.
  assert.doesNotThrow(() => validateWorkflowComponent(STANDARD_APPROVAL_WORKFLOW_COMPONENT));
  assert.doesNotThrow(() => validateToolComponent(STANDARD_CANONICAL_DIGEST_COMPONENT));

  // Each descriptor refers EXACTLY to its Component (identity, not proximity).
  assert.deepEqual(approval.component, {
    family: STANDARD_APPROVAL_WORKFLOW_COMPONENT.family,
    componentId: STANDARD_APPROVAL_WORKFLOW_COMPONENT.componentId,
    kind: STANDARD_APPROVAL_WORKFLOW_COMPONENT.kind,
  });
  assert.deepEqual(tool.component, {
    family: STANDARD_CANONICAL_DIGEST_COMPONENT.family,
    componentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
    kind: STANDARD_CANONICAL_DIGEST_COMPONENT.kind,
  });

  // Both are published/supported Standard descriptors (production-owned).
  assert.equal(approval.classification, 'published');
  assert.equal(tool.classification, 'published');

  // Frozen Definition-plane identity — byte-exact against the pre-commit probe.
  assert.equal(
    await computeStandardDescriptorDigest(approval, realSha256),
    FROZEN.descriptorDigestApproval,
  );
  assert.equal(
    await computeStandardDescriptorDigest(tool, realSha256),
    FROZEN.descriptorDigestTool,
  );

  // Definition-plane purity: EVERY export of the definition module is plain
  // frozen JSON data — no function leaves (no handles), no pins, no module
  // paths, no Runtime authority. The only permitted function export is the
  // Definition-graph factory itself.
  const forbiddenExportKeys = /(handle|pin|implementation|module|path|resource|secret)/i;
  for (const [name, value] of Object.entries(definitionModule)) {
    assert.doesNotMatch(
      name,
      forbiddenExportKeys,
      `definition module export "${name}" must not name Assembly/runtime material`,
    );
    if (typeof value === 'function') {
      assert.equal(
        name,
        'standardBootstrapDefinitionGraph',
        'the only function export of the Definition module is the graph factory',
      );
      continue;
    }
    const walk = (material: unknown, path: string): void => {
      if (typeof material === 'function' || typeof material === 'symbol') {
        assert.fail(`${path} carries a live handle (${typeof material}) — Definition plane is JSON data only`);
      }
      if (typeof material === 'object' && material !== null) {
        for (const [key, nested] of Object.entries(material)) {
          assert.doesNotMatch(
            `${path}.${key}`,
            forbiddenExportKeys,
            `${path}.${key} must not name Assembly/runtime material`,
          );
          walk(nested, `${path}.${key}`);
        }
      }
    };
    walk(value, name);
  }
});

// ---------------------------------------------------------------------------
// E7P-2 (parity, Semantic): identical admission entry points and typed codes.
// ---------------------------------------------------------------------------

test('E7P-2: the Standard Semantic candidate is admitted through the SAME generic must-understand and T002B paths as an app-defined control, with identical typed failure codes', async () => {
  const evidence = await bootstrap();
  const graph = evidence.definitionGraph;

  // An app-defined twin control at the SAME existing Workflow Kind.
  const appTwin: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.twin.component.review-workflow',
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

  // Must-understand admission: ONE shared rule set for Standard and app twin.
  const workflowDeclaration: UnderstoodKindDeclaration = {
    kind: { kindId: 'kaicreator.workflow', version: '1.0.0' },
    understoodSemanticContracts: [],
    understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
    validateComponent: validateWorkflowComponent,
  };
  const admittedStandard = admitComponent(STANDARD_APPROVAL_WORKFLOW_COMPONENT, [workflowDeclaration]);
  const admittedTwin = admitComponent(appTwin, [workflowDeclaration]);
  assert.equal(admittedStandard.admittedKind.kindId, 'kaicreator.workflow');
  assert.equal(admittedTwin.admittedKind.kindId, 'kaicreator.workflow');

  // T002B Assembly admission: the SAME generic function, the SAME sealed pin
  // shape, the SAME admitted pin (both Components ride the one Workflow Kind
  // implementation binding of the SAME final Assembly).
  const twinGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.app.twin.semantic-parity',
    components: [
      { ...appTwin, kind: { ...appTwin.kind }, semanticBody: appTwin.semanticBody },
    ],
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
  const assemblyAdmittedTwin = await admitComponentWithAssembly(appTwin, twinAssembly, {
    currentDefinitionGraph: twinGraph,
    sha256: realSha256,
  });
  assert.deepEqual(
    Object.keys(assemblyAdmittedStandard.admittedKindImplementation).sort(),
    Object.keys(assemblyAdmittedTwin.admittedKindImplementation).sort(),
  );
  assert.deepEqual(
    assemblyAdmittedStandard.admittedKindImplementation,
    workflowPinOf(evidence.assembly),
  );
  assert.deepEqual(assemblyAdmittedTwin.admittedKindImplementation, workflowPinOf(twinAssembly));

  // Negative parity: an unbound exact Kind fails with the SAME typed codes
  // for the Standard-referenced Component and the app twin — no
  // standard-specific branch anywhere.
  const foreignComponent: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.twin.component.foreign',
    kind: { kindId: 'app.twin.kind.foreign', version: '1.0.0' },
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
    () => admitComponent(appTwin, []),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'UNKNOWN_KIND');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// E7P-3: T003B exact provider selection -> genuine T003C binding/currentness.
// ---------------------------------------------------------------------------

test('E7P-3: T003B exact provider selection mints genuine T003C binding/currentness evidence with frozen real identity', async () => {
  const evidence = await bootstrap();

  // Frozen real identity — byte-exact against the pre-commit probe.
  assert.equal(evidence.assembly.assemblyDigest, FROZEN.assemblyBaseDigest);
  assert.equal(evidence.successorAssembly.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(evidence.binding.evidence.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(await computeDefinitionGraphDigest(evidence.definitionGraph, realSha256), FROZEN.definitionGraphDigest);

  // T003B: the EXACT provider of the canonical-digest Capability for the
  // approval-workflow consumer is the Standard Tool Component.
  assert.equal(
    evidence.selection.provider.componentId,
    STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
  );
  assert.equal(evidence.selection.provider.family, 'tool');
  assert.equal(
    evidence.selection.requiredCapability.capabilityId,
    STANDARD_CANONICAL_DIGEST_CAPABILITY.capabilityId,
  );

  // T003C: the sealed binding binds the exact provider, the exact capability,
  // the exact reference pin and the exact operation set.
  assert.equal(evidence.binding.evidence.status, 'BOUND');
  assert.equal(evidence.binding.evidence.toolComponentId, STANDARD_CANONICAL_DIGEST_COMPONENT.componentId);
  assert.deepEqual(evidence.binding.evidence.implementation, {
    ...STANDARD_CANONICAL_DIGEST_IMPLEMENTATION,
  });
  assert.deepEqual(evidence.binding.evidence.supportedOperations, [
    STANDARD_CANONICAL_DIGEST_OPERATION_ID,
  ]);

  // Genuine currentness through the SAME accepted T003C verifier an app uses.
  const verified = await verifyToolImplementationBinding({
    binding: evidence.binding,
    finalAssembly: evidence.successorAssembly,
    sha256: realSha256,
  });
  assert.equal(verified.evidence.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(verified.currentness.subject, STANDARD_CANONICAL_DIGEST_COMPONENT.componentId);
});

// ---------------------------------------------------------------------------
// E7P-4 (MANDATORY WITNESS): REAL T004B invocation through the generic path.
// ---------------------------------------------------------------------------

/**
 * The raw generic T004A -> T004B chain — the identical entry points an
 * app-defined control uses (mirrors the production queryAgentTool structure),
 * with a counting host dispatch port to prove real execution.
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
      caller: { callerId: 'e7p.witness.raw-chain' },
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
      caller: { callerId: 'e7p.witness.raw-chain' },
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

test('E7P-4: REAL T004B invocation of the Standard Tool through the generic T004A path — dispatch executes, output matches the production digest seam, full parity with an app-defined twin', async () => {
  const evidence = await bootstrap();
  const value: JsonValue = { claim: 'e7-production-witness', payload: [1, 2, 3] };

  // --- The REAL invocation through the runtime helper (T004A -> T004B) ---
  const helperResult = await invokeStandardCanonicalDigest({
    bootstrap: evidence,
    value,
    sha256: realSha256,
  });
  assert.equal(helperResult.status, 'OBSERVED');
  assert.equal(helperResult.toolComponentId, STANDARD_CANONICAL_DIGEST_COMPONENT.componentId);
  assert.equal(helperResult.operationId, STANDARD_CANONICAL_DIGEST_OPERATION_ID);
  assert.deepEqual(helperResult.implementation, { ...STANDARD_CANONICAL_DIGEST_IMPLEMENTATION });
  assert.equal(helperResult.bindingDigest, FROZEN.toolBindingDigest);
  assert.equal(helperResult.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(helperResult.definitionGraphDigest, FROZEN.definitionGraphDigest);

  // The output is EXACTLY what the existing production digest seam computes.
  const expectedDigest = await computeCanonicalJsonDigest(value, realSha256);
  assert.deepEqual(helperResult.output, { digest: expectedDigest });

  // --- The same Standard candidate through the RAW generic chain, with a
  // counting host dispatch port proving the dispatch really executed ---
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
  assert.deepEqual(standardResult.output, helperResult.output, 'raw generic chain and runtime helper agree');
  assert.equal(standardResult.bindingDigest, helperResult.bindingDigest);

  // --- App-defined twin control through the IDENTICAL raw generic chain ---
  const twinCapability = Object.freeze({
    capabilityId: 'app.twin.capability.canonical-digest',
    version: '1.0.0',
  });
  const twinTool: ComponentEnvelope = {
    family: 'tool',
    componentId: 'app.twin.component.canonical-digest',
    kind: { kindId: 'app.twin.kind.canonical-digest', version: '1.0.0' },
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
    componentId: 'app.twin.component.digest-consumer',
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
    graphId: 'graph.app.twin.tool-parity',
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
            implementationId: 'app.twin.impl.workflow-engine',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:app-twin-workflow-engine-content',
          },
          understoodCapabilities: [{ ...twinCapability }],
        }),
        {
          pin: {
            kind: { kindId: 'app.twin.kind.canonical-digest', version: '1.0.0' },
            implementation: {
              implementationId: 'app.twin.impl.digest-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:app-twin-digest-kind-content',
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
  const twinHandle = Object.freeze({ twin: 'app.twin.digest-handle' });
  const twinBinding = await bindToolImplementation({
    assembly: twinAssembly,
    selection: JSON.parse(JSON.stringify(twinSelection)) as CurrentCapabilityProviderSelection,
    currentDefinitionGraph: twinGraph,
    implementations: [
      {
        implementation: {
          implementationId: 'app.twin.impl.digest-exec',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:app-twin-digest-exec-content',
        },
        supportedOperations: ['op.digest'],
        handle: twinHandle,
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

  // Parity: the Standard candidate and the app twin produce the SAME generic
  // evidence shape and the SAME output through the SAME entry points.
  assert.equal(standardResult.status, 'OBSERVED');
  assert.equal(twinResult.status, 'OBSERVED');
  assert.deepEqual(Object.keys(standardResult).sort(), Object.keys(twinResult).sort());
  assert.deepEqual(twinResult.output, standardResult.output);
  assert.equal(twinResult.definitionGraphDigest, twinGraphDigest);
});

// ---------------------------------------------------------------------------
// E7P-5 (negative/currentness matrix): stale pins, forged evidence, effect
// gating, eligibility, stale requests — every refusal typed and fail-closed.
// ---------------------------------------------------------------------------

test('E7P-5a: Standard Set sealing/currentness rides the generic authorities; stale pins fail closed typed; replacement moves Assembly/Set identity only', async () => {
  const evidence = await bootstrap();
  const { definitionGraph, assembly, successorAssembly, binding } = evidence;

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
      currentDescriptors: [STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, STANDARD_CANONICAL_DIGEST_DESCRIPTOR],
      implementationBindingEvidence: [
        { subject: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId, bindingDigest: binding.evidence.bindingDigest },
      ],
    },
    realSha256,
  );

  const currentnessOptions = (
    finalAssembly: SealedRuntimeAssembly,
  ): StandardSetCurrentnessOptions => ({
    currentDescriptors: [STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, STANDARD_CANONICAL_DIGEST_DESCRIPTOR],
    currentDefinitionGraph: definitionGraph,
    finalAssembly,
    sealedToolBindings: [binding],
    sha256: realSha256,
  });

  // CURRENT against the exact successor Assembly with the exact sealed binding.
  const current = await verifyStandardSetCurrentness(set, currentnessOptions(successorAssembly));
  assert.equal(current.status, 'CURRENT');
  assert.equal(current.finalAssemblyDigest, FROZEN.assemblySuccessorDigest);

  // Implementation replacement: a new Assembly seals a DIFFERENT exact
  // Workflow Kind implementation pin (Definition semantics unchanged).
  const replacementAssembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: {
            implementationId: STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION.implementationId,
            implementationVersion: '1.1.0',
            implementationDigest: 'sha256:4e5a1c2b9d8f3a6e0b1c4d7f2a5e8b3c6d9f1a4b7e0d3c6a9f2b5e8d1c4a7b0e',
          },
          understoodCapabilities: [{ ...STANDARD_CANONICAL_DIGEST_CAPABILITY }],
        }),
        {
          pin: { ...toolKindPinOf(assembly), kind: { ...toolKindPinOf(assembly).kind } },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: validateToolComponent,
        },
      ],
    },
    realSha256,
  );
  assert.notEqual(replacementAssembly.assemblyDigest, FROZEN.assemblyBaseDigest);

  // Definition plane is untouched by the replacement: graph and descriptor
  // digests are byte-identical.
  assert.equal(await computeDefinitionGraphDigest(definitionGraph, realSha256), FROZEN.definitionGraphDigest);
  assert.equal(
    await computeStandardDescriptorDigest(STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestApproval,
  );

  // A Set pinned to the OLD implementation fails closed typed against the
  // replacement Assembly — unchanged Definition semantics cannot rescue a
  // stale Assembly-plane pin.
  await assert.rejects(
    verifyStandardSetCurrentness(set, currentnessOptions(replacementAssembly)),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('E7P-5b: forged binding evidence fails through the OWNING T003C typed code, not a Standard-wrapped substitute', async () => {
  const evidence = await bootstrap();
  const forgedBinding = {
    evidence: {
      toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
      bindingDigest: evidence.binding.evidence.bindingDigest,
    },
  } as unknown as SealedToolImplementationBinding;

  await assert.rejects(
    verifyToolImplementationBinding({
      binding: forgedBinding,
      finalAssembly: evidence.successorAssembly,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );

  // The same forged evidence cannot smuggle currentness through the Set
  // verifier either.
  const set = await sealStandardSet(
    {
      entries: [
        {
          descriptor: {
            standardId: STANDARD_CANONICAL_DIGEST_DESCRIPTOR.standardId,
            descriptorVersion: STANDARD_CANONICAL_DIGEST_DESCRIPTOR.descriptorVersion,
            descriptorDigest: await computeStandardDescriptorDigest(
              STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
              realSha256,
            ),
          },
          pin: toolKindPinOf(evidence.assembly),
        },
      ],
      currentDescriptors: [STANDARD_CANONICAL_DIGEST_DESCRIPTOR],
      implementationBindingEvidence: [
        {
          subject: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
          bindingDigest: evidence.binding.evidence.bindingDigest,
        },
      ],
    },
    realSha256,
  );
  await assert.rejects(
    verifyStandardSetCurrentness(set, {
      currentDescriptors: [STANDARD_CANONICAL_DIGEST_DESCRIPTOR],
      currentDefinitionGraph: evidence.definitionGraph,
      finalAssembly: evidence.successorAssembly,
      sealedToolBindings: [forgedBinding],
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );
});

test('E7P-5c: #820 effect=none eligibility consumes the REAL candidates; effectful-only and missing-context pools fail closed typed', () => {
  const semanticCandidate: StandardBootstrapCandidate = {
    descriptor: STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR,
    referenceImplementation: Object.freeze({
      kind: Object.freeze({ kindId: 'kaicreator.workflow', version: '1.0.0' }),
      implementation: Object.freeze({ ...STANDARD_APPROVAL_WORKFLOW_IMPLEMENTATION }),
    }),
  };
  const toolCandidate: StandardBootstrapCandidate = {
    descriptor: STANDARD_CANONICAL_DIGEST_DESCRIPTOR,
    referenceImplementation: Object.freeze({
      kind: Object.freeze({
        kindId: STANDARD_CANONICAL_DIGEST_KIND_REF.kindId,
        version: STANDARD_CANONICAL_DIGEST_KIND_REF.version,
      }),
      implementation: Object.freeze({ ...STANDARD_CANONICAL_DIGEST_KIND_IMPLEMENTATION }),
    }),
  };

  // The REAL Semantic candidate is selected through the ordinary rule.
  const semanticWinner = selectStandardBootstrapCandidate([semanticCandidate], 'semantic', {
    // Tool-only context is IGNORED entirely for semantic selection.
    toolContracts: [
      {
        component: STANDARD_CANONICAL_DIGEST_DESCRIPTOR.component as ExactComponentRef,
        contract: STANDARD_CANONICAL_DIGEST_COMPONENT,
      },
    ],
  });
  assert.deepEqual(semanticWinner.descriptor, STANDARD_APPROVAL_WORKFLOW_DESCRIPTOR);

  // The REAL Tool candidate passes the effect=none pre-selection filter
  // through its ordinary Tool contract.
  const toolWinner = selectStandardBootstrapCandidate([toolCandidate], 'tool', {
    toolContracts: [
      {
        component: STANDARD_CANONICAL_DIGEST_DESCRIPTOR.component as ExactComponentRef,
        contract: STANDARD_CANONICAL_DIGEST_COMPONENT,
      },
    ],
  });
  assert.deepEqual(toolWinner.descriptor, STANDARD_CANONICAL_DIGEST_DESCRIPTOR);
  assert.deepEqual(toolWinner.referenceImplementation, toolCandidate.referenceImplementation);

  // An effectful-only candidate pool has no eligible Tool candidate — the
  // typed family-specific absent terminal, never an invented candidate.
  const effectfulContract: ComponentEnvelope = {
    family: 'tool',
    componentId: 'app.twin.component.effectful-only',
    kind: { kindId: 'app.twin.kind.effectful', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.mutate', inputSchema: {}, outputSchema: {}, effect: 'idempotent' },
      ],
      providesCapabilities: [],
    },
  };
  const effectfulCandidate: StandardBootstrapCandidate = {
    descriptor: {
      standardId: 'app.twin.standard.effectful-only',
      classification: 'published',
      descriptorVersion: '1.0.0',
      component: {
        family: 'tool',
        componentId: effectfulContract.componentId,
        kind: { kindId: 'app.twin.kind.effectful', version: '1.0.0' },
      },
    },
    referenceImplementation: {
      kind: { kindId: 'app.twin.kind.effectful', version: '1.0.0' },
      implementation: {
        implementationId: 'app.twin.impl.effectful',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:app-twin-effectful-content',
      },
    },
  };
  assert.throws(
    () =>
      selectStandardBootstrapCandidate([effectfulCandidate], 'tool', {
        toolContracts: [
          {
            component: effectfulCandidate.descriptor.component as ExactComponentRef,
            contract: effectfulContract,
          },
        ],
      }),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError, `expected StandardCandidateAbsentError, got ${String(error)}`);
      assert.equal(error.code, STANDARD_TOOL_CANDIDATE_ABSENT);
      return true;
    },
  );

  // A real Tool candidate whose exact ComponentRef has no Tool-contract
  // binding fails closed typed — no closest/latest/default lookup.
  assert.throws(
    () => selectStandardBootstrapCandidate([toolCandidate], 'tool', { toolContracts: [] }),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_TOOL_CONTRACT_MISSING');
      return true;
    },
  );

  // An empty semantic pool keeps the semantic absent terminal.
  assert.throws(
    () => selectStandardBootstrapCandidate([], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError, `expected StandardCandidateAbsentError, got ${String(error)}`);
      assert.equal(error.code, STANDARD_SEMANTIC_CANDIDATE_ABSENT);
      return true;
    },
  );
});

test('E7P-5d: an effectful operation is refused by the T004B effect gate; a stale request fails closed at re-admission — both with owning typed codes', async () => {
  const evidence = await bootstrap();

  // Effect gate: request admission for an UNDECLARED effectful operation is
  // impossible, so the gate is proven with an effectful twin Tool admitted
  // through the generic T004A seam and refused by T004B before any dispatch.
  const effectfulCapability = Object.freeze({
    capabilityId: 'app.twin.capability.effectful',
    version: '1.0.0',
  });
  const effectfulTool: ComponentEnvelope = {
    family: 'tool',
    componentId: 'app.twin.component.effectful-tool',
    kind: { kindId: 'app.twin.kind.effectful-tool', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.mutate', inputSchema: {}, outputSchema: {}, effect: 'non-idempotent' },
      ],
      providesCapabilities: [{ ...effectfulCapability }],
    },
  };
  const effectfulConsumer: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'app.twin.component.effectful-consumer',
    kind: { kindId: 'kaicreator.workflow', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ ...effectfulCapability }],
    semanticBody: {
      initial: 'fx.pending',
      states: [{ stateId: 'fx.pending' }, { stateId: 'fx.done' }],
      transitions: [
        { transitionId: 'fx.t', from: 'fx.pending', to: 'fx.done', event: 'fx.go' },
      ],
    },
  };
  const effectfulGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.app.twin.effectful',
    components: [
      { ...effectfulConsumer, kind: { ...effectfulConsumer.kind } },
      { ...effectfulTool, kind: { ...effectfulTool.kind } },
    ],
    relations: [],
  };
  const effectfulGraphDigest = await computeDefinitionGraphDigest(effectfulGraph, realSha256);
  const effectfulAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: effectfulGraph,
      kindImplementations: [
        createWorkflowKindImplementation({
          implementation: {
            implementationId: 'app.twin.impl.workflow-effectful',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:app-twin-workflow-effectful-content',
          },
          understoodCapabilities: [{ ...effectfulCapability }],
        }),
        {
          pin: {
            kind: { kindId: 'app.twin.kind.effectful-tool', version: '1.0.0' },
            implementation: {
              implementationId: 'app.twin.impl.effectful-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:app-twin-effectful-kind-content',
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
  const effectfulSelection = await resolveCurrentCapabilityProvider(
    effectfulGraph,
    effectfulCapability,
    effectfulConsumer.componentId,
    effectfulGraphDigest,
    realSha256,
  );
  let effectfulDispatchCount = 0;
  const effectfulBinding = await bindToolImplementation({
    assembly: effectfulAssembly,
    selection: JSON.parse(JSON.stringify(effectfulSelection)) as CurrentCapabilityProviderSelection,
    currentDefinitionGraph: effectfulGraph,
    implementations: [
      {
        implementation: {
          implementationId: 'app.twin.impl.effectful-exec',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:app-twin-effectful-exec-content',
        },
        supportedOperations: ['op.mutate'],
        handle: Object.freeze({ twin: 'app.twin.effectful-handle' }),
      },
    ],
    sha256: realSha256,
  });
  await assert.rejects(
    rawGenericInvocation({
      graph: effectfulGraph,
      binding: effectfulBinding,
      toolComponentId: effectfulTool.componentId,
      operationId: 'op.mutate',
      input: { value: 1 },
      dispatch: {
        async dispatch() {
          effectfulDispatchCount += 1;
          return {};
        },
      },
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof NonEffectfulInvocationError,
        `expected NonEffectfulInvocationError, got ${String(error)}`,
      );
      assert.equal(error.code, 'EFFECTFUL_OPERATION_REJECTED');
      return true;
    },
  );
  assert.equal(effectfulDispatchCount, 0, 'the effectful handle was NEVER dispatched');

  // Stale request: exposure + request admitted against the BASE Assembly are
  // refused by T004B's internal re-admission against the binding's successor
  // Assembly anchor — before any dispatch.
  const staleExposure = await admitToolExposure(
    {
      toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
      operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
      caller: { callerId: 'e7p.stale-request' },
      assembly: evidence.assembly,
      currentDefinitionGraph: evidence.definitionGraph,
      policy: { decideAdmission: () => ({ admitted: true } as const) },
    },
    realSha256,
  );
  const staleRequest = await admitToolInvocationRequest(
    {
      toolComponentId: STANDARD_CANONICAL_DIGEST_COMPONENT.componentId,
      operationId: STANDARD_CANONICAL_DIGEST_OPERATION_ID,
      input: { value: 1 },
      caller: { callerId: 'e7p.stale-request' },
      definitionGraphDigest: staleExposure.definitionGraphDigest,
      assemblyDigest: staleExposure.assemblyDigest,
      exposure: staleExposure,
    },
    { assembly: evidence.assembly, currentDefinitionGraph: evidence.definitionGraph },
    realSha256,
  );
  let staleDispatchCount = 0;
  await assert.rejects(
    invokeNonEffectfulTool({
      request: staleRequest,
      binding: evidence.binding,
      currentDefinitionGraph: evidence.definitionGraph,
      dispatch: {
        async dispatch() {
          staleDispatchCount += 1;
          return {};
        },
      },
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof InvocationRequestError,
        `expected InvocationRequestError, got ${String(error)}`,
      );
      return true;
    },
  );
  assert.equal(staleDispatchCount, 0, 'the stale request was refused before any dispatch');
});

// ---------------------------------------------------------------------------
// E7P-6: no Standard-only registry/admission/activation/binding/invocation
// path — executable source scan of the production modules.
// ---------------------------------------------------------------------------

test('E7P-6: the production candidate modules carry no Standard-only authority path — no Standard contract import, no standardId branch in the runtime plane', () => {
  const testDir = fileURLToPath(new URL('.', import.meta.url));
  const definitionSource = readFileSync(
    join(testDir, '..', '..', 'src', 'standard', 'bootstrap-definition.ts'),
    'utf8',
  );
  const runtimeSource = readFileSync(
    join(testDir, '..', '..', 'src', 'standard', 'bootstrap-runtime.ts'),
    'utf8',
  );

  // Neither module may import the Standard contract module — the candidates
  // are consumed as plain data through the generic authorities, so the
  // frozen no-privileged-coupling scan (landed E7-7) stays green.
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

  // The runtime plane decides NO admission/selection on standardId: a
  // standardId branch would show up as a token reference.
  assert.doesNotMatch(
    runtimeSource,
    /\bstandardId\b/,
    'bootstrap-runtime.ts must carry no standardId branch (no Standard-only dispatch)',
  );

  // The runtime module owns NO registry/provider table of its own: every
  // admission/binding/invocation it performs names an existing generic seam.
  for (const seam of [
    'sealRuntimeAssembly',
    'admitComponentWithAssembly',
    'resolveCurrentCapabilityProvider',
    'bindToolImplementation',
    'admitToolExposure',
    'admitToolInvocationRequest',
    'invokeNonEffectfulTool',
    'createWorkflowKindImplementation',
  ]) {
    assert.ok(runtimeSource.includes(seam), `bootstrap-runtime.ts must consume the generic seam ${seam}`);
  }
});
