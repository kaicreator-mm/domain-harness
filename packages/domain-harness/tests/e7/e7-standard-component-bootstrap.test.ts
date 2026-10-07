/**
 * E7 reference-evidence suite — Standard Component bootstrap (issue #898,
 * PACK-D E7; planning authority #589 issuecomment-5980528597 FROZEN;
 * prerequisites: standard chain #872/#879/#881 landed, incl. #652 D1-D3,
 * #653 R1/D4/D5 and the #820 effect=none eligibility binding).
 *
 * SUBJECT_BASE=version/v0.7@08aee5e6f723220137f5749fae1d784d9bf417b1
 * (worktree dh-e7-898, rebound to live HEAD at claim; ENTRY_BASE
 * 02dc8b913a69698f3f57fb45b231b0d70d94c0b2 recorded on the gate issue).
 *
 * A Standard Semantic and a Standard Tool descriptor under the OWN test
 * namespace `e7.*` (no reuse of the t007c / e6 / val evidence namespaces)
 * are carried
 * through the SAME public/generic contracts app components use:
 * must-understand Component admission (`admitComponent`), sealed Runtime
 * Assembly admission (`admitComponentWithAssembly`, T002B), the T003C Tool
 * implementation-binding verifier (`verifyToolImplementationBinding`) and
 * the ordinary Tool contract path (`validateToolComponent`, consumed by the
 * #820 eligibility context). No private bypass; no production source edit
 * (MICROKERNEL_SOURCE_DIFF=0; the no-privileged-branch obligation is also
 * proven by an executable source scan in E7-7).
 *
 * Proof obligations (PACK-D E7):
 *  O1 (E7-1/E7-2) Standard Semantic + Standard Tool components use the SAME
 *     Component/Kind/Tool/admission/invocation paths as app components —
 *     identical admission functions, identical typed failure codes, no
 *     standard-specific dispatch;
 *  O2 (E7-3) Standard descriptor semantic identity is Definition-plane: the
 *     descriptor digest is immune to implementation/pin replacement and
 *     moves only on descriptor semantic material changes;
 *  O3 (E7-4/E7-5) Standard Set / reference implementation pins are
 *     Assembly-plane: pin replacement moves the Set digest and the Assembly
 *     digest, never the Definition graph digest;
 *  O4 (E7-4/E7-5) replacing a Standard implementation changes
 *     Assembly/currentness while unchanged Definition semantics stay
 *     unchanged; a stale Set fails closed with typed codes
 *     (STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH /
 *      STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH);
 *  O5 (E7-7) no privileged Standard registry/admission/Microkernel branch
 *     exists — executable source scan: zero src imports of the standard
 *     module from outside itself; zero `standard` references in the
 *     T002B/T003C/admission/invocation modules;
 *  O6 (E7-6) the landed module's #820 eligibility + toolContracts context is
 *     consumed: effect=none is a pre-selection filter (never ranking
 *     authority), malformed/missing context fails closed typed, and
 *     Semantic-family selection never consults Tool context;
 *  O7 (E7-8) frozen identity: every digest is deterministic and byte-equal
 *     to the constants frozen at the pre-freeze commit.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
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
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type KindImplementationPin,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  ToolImplementationBindingError,
  bindToolImplementation,
  verifyToolImplementationBinding,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  STANDARD_DESCRIPTOR_DIGEST_DOMAIN,
  STANDARD_SEMANTIC_CANDIDATE_ABSENT,
  STANDARD_TOOL_CANDIDATE_ABSENT,
  StandardCandidateAbsentError,
  StandardContractError,
  computeStandardDescriptorDigest,
  sealStandardSet,
  selectStandardBootstrapCandidate,
  standardDescriptorIdentityMaterial,
  verifyStandardSetCurrentness,
  type ExactComponentRef,
  type SealStandardSetInput,
  type StandardBootstrapCandidate,
  type StandardComponentDescriptor,
  type StandardSetCurrentnessOptions,
  type StandardSetEntry,
} from '../../src/contracts/standard.js';

// ---------------------------------------------------------------------------
// Frozen identity (digests computed by scratch probe BEFORE the pre-freeze
// commit; see issue #898 terminal). Do not edit fixture material without
// recomputing — these constants ARE the frozen fixture identity.
// ---------------------------------------------------------------------------

const FROZEN = Object.freeze({
  definitionGraphDigest:
    '7c951ced836b2b62e380e4619ff7a692c803188f048ccb400909065149bd587f',
  descriptorDigestApproval:
    'ce4b8215fbdf5045a272be9be194799dab56812590b5bbd4b6822d58c55567d4',
  descriptorDigestCalc:
    '8261cdf6f5b0d2a93dfa5f84c91baedc2cfe75f7450f7a1697d6f379bdc71875',
  assemblyBaseDigest:
    'a2a6872e4d3e2f538ac1d20d467875d8550a0e50e388ddb282b223efcd6443dc',
  assemblyBetaDigest:
    '3ab02034c615529064ecbb3fd300c8a9ab9e32be1969238f95863c99cbc79dca',
  assemblySuccessorDigest:
    '90a508eeb6b0aaabd25faf62836238f2bf22b4c91d7c921a2db5a8dc3fb2d18b',
  setApprovalAlphaDigest:
    '6e32da1ec6b81b8841e3c5b43552e976e9c3ae924da22336a68927bf288aea90',
  setApprovalBetaDigest:
    '640965a4286db1e4099be8e343286a132aa855c435c6a313c9c4f0e6f3d4f003',
  setCombinedDigest:
    'cdc0e7dde702af4fce4ec4c7393b9d3a481b53a3b9728c8656bfcfeb6563c0bc',
  toolBindingDigest:
    '07a9956fa35be7e5296b6f790245516e64e4eb07a13c7b1cd9e12d02261ce21e',
});

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixture namespace e7.* — Standard descriptor bootstrap concern
// ---------------------------------------------------------------------------

const SEMANTIC_KIND = Object.freeze({ kindId: 'e7.test.approval-kind', version: '1.0.0' });
const APP_KIND = Object.freeze({ kindId: 'e7.test.ledger-kind', version: '1.0.0' });
const TOOL_KIND = Object.freeze({ kindId: 'e7.test.calc-kind', version: '1.0.0' });
const CALC_CAPABILITY = Object.freeze({ capabilityId: 'e7.test.cap.calc', version: '1.0.0' });

const APPROVAL_COMPONENT_ID = 'e7.test.component.approval-alpha';
const APP_LEDGER_COMPONENT_ID = 'e7.test.component.app-ledger';
const CALC_COMPONENT_ID = 'e7.test.component.calc';
const CALC_CONSUMER_COMPONENT_ID = 'e7.test.component.calc-consumer';

const ALPHA_APPROVAL_IMPL = Object.freeze({
  implementationId: 'e7.test.impl.approval-alpha',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e7-approval-alpha-content',
});
const BETA_APPROVAL_IMPL = Object.freeze({
  implementationId: 'e7.test.impl.approval-beta',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e7-approval-beta-content',
});

function definitionGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e7-standard-bootstrap',
    components: [
      {
        family: 'semantic',
        componentId: APPROVAL_COMPONENT_ID,
        kind: { kindId: SEMANTIC_KIND.kindId, version: SEMANTIC_KIND.version },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { ruleSet: 'e7-approval-rules' },
      },
      {
        family: 'semantic',
        componentId: APP_LEDGER_COMPONENT_ID,
        kind: { kindId: APP_KIND.kindId, version: APP_KIND.version },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { ledger: 'e7-app-ledger' },
      },
      {
        family: 'semantic',
        componentId: CALC_CONSUMER_COMPONENT_ID,
        kind: { kindId: APP_KIND.kindId, version: APP_KIND.version },
        requiredSemanticContracts: [],
        requiredCapabilities: [{ ...CALC_CAPABILITY }],
        semanticBody: { consumes: 'e7-calc' },
      },
      {
        family: 'tool',
        componentId: CALC_COMPONENT_ID,
        kind: { kindId: TOOL_KIND.kindId, version: TOOL_KIND.version },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: {
          operations: [
            { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
            { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
          ],
          providesCapabilities: [{ ...CALC_CAPABILITY }],
        },
      },
    ],
    relations: [],
  };
}

function kindBinding(
  kind: { kindId: string; version: string },
  implementation: { implementationId: string; implementationVersion: string; implementationDigest: string },
): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: kind.kindId, version: kind.version },
      implementation: { ...implementation },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

const APP_LEDGER_BINDING = kindBinding(APP_KIND, {
  implementationId: 'e7.test.impl.app-ledger',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e7-app-ledger-content',
});
const CALC_KIND_BINDING = kindBinding(TOOL_KIND, {
  implementationId: 'e7.test.impl.calc-alpha',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e7-calc-alpha-content',
});
const ALPHA_APPROVAL_BINDING = kindBinding(SEMANTIC_KIND, ALPHA_APPROVAL_IMPL);
const BETA_APPROVAL_BINDING = kindBinding(SEMANTIC_KIND, BETA_APPROVAL_IMPL);

const APPROVAL_DESCRIPTOR: StandardComponentDescriptor = Object.freeze({
  standardId: 'e7.test.standard.approval',
  classification: 'published',
  descriptorVersion: '1.0.0',
  component: Object.freeze({
    family: 'semantic',
    componentId: APPROVAL_COMPONENT_ID,
    kind: Object.freeze({ kindId: SEMANTIC_KIND.kindId, version: SEMANTIC_KIND.version }),
  }),
});

const CALC_DESCRIPTOR: StandardComponentDescriptor = Object.freeze({
  standardId: 'e7.test.standard.calc',
  classification: 'published',
  descriptorVersion: '1.0.0',
  component: Object.freeze({
    family: 'tool',
    componentId: CALC_COMPONENT_ID,
    kind: Object.freeze({ kindId: TOOL_KIND.kindId, version: TOOL_KIND.version }),
  }),
});

async function descriptorEntry(
  descriptor: StandardComponentDescriptor,
  pin: KindImplementationPin,
): Promise<StandardSetEntry> {
  return {
    descriptor: {
      standardId: descriptor.standardId,
      descriptorVersion: descriptor.descriptorVersion,
      descriptorDigest: await computeStandardDescriptorDigest(descriptor, realSha256),
    },
    pin,
  };
}

async function sealApprovalSet(pin: KindImplementationPin) {
  return sealStandardSet(
    {
      entries: [await descriptorEntry(APPROVAL_DESCRIPTOR, pin)],
      currentDescriptors: [APPROVAL_DESCRIPTOR],
    },
    realSha256,
  );
}

async function currentnessOptions(
  overrides: Partial<StandardSetCurrentnessOptions> = {},
): Promise<StandardSetCurrentnessOptions> {
  return {
    currentDescriptors: [APPROVAL_DESCRIPTOR, CALC_DESCRIPTOR],
    currentDefinitionGraph: definitionGraph(),
    finalAssembly: overrides.finalAssembly ?? (await baseAssembly()),
    sealedToolBindings: overrides.sealedToolBindings ?? [],
    sha256: realSha256,
    ...overrides,
  };
}

let cachedBaseAssembly: SealedRuntimeAssembly | undefined;
let cachedBetaAssembly: SealedRuntimeAssembly | undefined;
let cachedToolFixture:
  | {
      binding: SealedToolImplementationBinding;
      successorAssembly: SealedRuntimeAssembly;
    }
  | undefined;

async function baseAssembly(): Promise<SealedRuntimeAssembly> {
  cachedBaseAssembly ??= await sealRuntimeAssembly(
    {
      definitionGraph: definitionGraph(),
      kindImplementations: [ALPHA_APPROVAL_BINDING, APP_LEDGER_BINDING, CALC_KIND_BINDING],
    },
    realSha256,
  );
  return cachedBaseAssembly;
}

async function betaAssembly(): Promise<SealedRuntimeAssembly> {
  cachedBetaAssembly ??= await sealRuntimeAssembly(
    {
      definitionGraph: definitionGraph(),
      kindImplementations: [BETA_APPROVAL_BINDING, APP_LEDGER_BINDING, CALC_KIND_BINDING],
    },
    realSha256,
  );
  return cachedBetaAssembly;
}

/** The accepted #640 T003C mint path over the e7 calc Tool, plus the
 * successor Assembly carrying the exact-subject §G slot. */
async function toolFixture(): Promise<{
  binding: SealedToolImplementationBinding;
  successorAssembly: SealedRuntimeAssembly;
}> {
  if (cachedToolFixture === undefined) {
    const graph = definitionGraph();
    const graphDigest = await computeDefinitionGraphDigest(graph, realSha256);
    const selection = await resolveCurrentCapabilityProvider(
      graph,
      CALC_CAPABILITY,
      CALC_CONSUMER_COMPONENT_ID,
      graphDigest,
      realSha256,
    );
    const input: BindToolImplementationInput = {
      assembly: await baseAssembly(),
      selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
      currentDefinitionGraph: graph,
      implementations: [
        {
          implementation: {
            implementationId: 'e7.test.impl.calc-exec-alpha',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:e7-calc-exec-alpha-content',
          },
          supportedOperations: ['op.add', 'op.sub'],
        },
      ],
      sha256: realSha256,
    };
    const binding = await bindToolImplementation(input);
    cachedToolFixture = { binding, successorAssembly: binding.successorAssembly };
  }
  return cachedToolFixture;
}

async function combinedSet() {
  const { binding } = await toolFixture();
  return sealStandardSet(
    {
      entries: [
        await descriptorEntry(APPROVAL_DESCRIPTOR, ALPHA_APPROVAL_BINDING.pin),
        await descriptorEntry(CALC_DESCRIPTOR, CALC_KIND_BINDING.pin),
      ],
      currentDescriptors: [APPROVAL_DESCRIPTOR, CALC_DESCRIPTOR],
      implementationBindingEvidence: [
        { subject: CALC_COMPONENT_ID, bindingDigest: binding.evidence.bindingDigest },
      ],
    } satisfies SealStandardSetInput,
    realSha256,
  );
}

function componentById(graph: DefinitionGraphEnvelope, componentId: string): ComponentEnvelope {
  const found = graph.components.find((component) => component.componentId === componentId);
  assert.ok(found, `fixture graph must bind ${componentId}`);
  return found;
}

// ---------------------------------------------------------------------------
// E7-1 (O1): Standard-referenced components are admitted through the SAME
// must-understand and T002B Assembly admission paths as app components.
// ---------------------------------------------------------------------------

test('E7-1: Standard Semantic and Tool components are admitted through the SAME admission functions as app components (no standard-specific dispatch)', async () => {
  const graph = definitionGraph();
  const assembly = await baseAssembly();

  // Must-understand admission: the Standard-referenced approval Component and
  // the ordinary app ledger Component pass through admitComponent with
  // ordinary Kind declarations — the identical function and rule set.
  const understood: UnderstoodKindDeclaration[] = [
    {
      kind: { kindId: SEMANTIC_KIND.kindId, version: SEMANTIC_KIND.version },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
    {
      kind: { kindId: APP_KIND.kindId, version: APP_KIND.version },
      understoodSemanticContracts: [],
      understoodCapabilities: [CALC_CAPABILITY],
      validateComponent: () => {},
    },
    {
      kind: { kindId: TOOL_KIND.kindId, version: TOOL_KIND.version },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
  ];
  const admittedApproval = admitComponent(componentById(graph, APPROVAL_COMPONENT_ID), understood);
  const admittedLedger = admitComponent(componentById(graph, APP_LEDGER_COMPONENT_ID), understood);
  const admittedCalc = admitComponent(componentById(graph, CALC_COMPONENT_ID), understood);
  assert.equal(admittedApproval.admittedKind.kindId, SEMANTIC_KIND.kindId);
  assert.equal(admittedLedger.admittedKind.kindId, APP_KIND.kindId);
  assert.equal(admittedCalc.admittedKind.kindId, TOOL_KIND.kindId);

  // Sealed-Assembly admission: the SAME generic T002B authority
  // (admitComponentWithAssembly) admits the Standard-referenced approval
  // Component and the app ledger Component against the SAME final Assembly
  // and graph, with identical options shape.
  const approvalAdmission = await admitComponentWithAssembly(
    componentById(graph, APPROVAL_COMPONENT_ID),
    assembly,
    { currentDefinitionGraph: graph, sha256: realSha256 },
  );
  const ledgerAdmission = await admitComponentWithAssembly(
    componentById(graph, APP_LEDGER_COMPONENT_ID),
    assembly,
    { currentDefinitionGraph: graph, sha256: realSha256 },
  );
  // The admitted pins are the SAME generic T002B KindImplementationPin shape
  // for a Standard-referenced Component as for an app Component.
  assert.deepEqual(Object.keys(approvalAdmission.admittedKindImplementation).sort(), [
    'implementation',
    'kind',
  ]);
  assert.deepEqual(
    Object.keys(approvalAdmission.admittedKindImplementation.implementation).sort(),
    ['implementationDigest', 'implementationId', 'implementationVersion'],
  );
  assert.deepEqual(
    approvalAdmission.admittedKindImplementation,
    ALPHA_APPROVAL_BINDING.pin,
    'the Standard-referenced Component admits to the exact sealed Assembly pin',
  );
  assert.deepEqual(
    ledgerAdmission.admittedKindImplementation,
    APP_LEDGER_BINDING.pin,
    'the app Component admits through the identical path and pin shape',
  );
});

// ---------------------------------------------------------------------------
// E7-2 (O1, negative): fail-closed paths carry the SAME typed failure codes
// for Standard-referenced and app components.
// ---------------------------------------------------------------------------

test('E7-2: unbound Kind / unknown Kind fail closed with the SAME typed codes for Standard-referenced and app components', async () => {
  // A graph and Assembly that bind the app ledger Kind and the calc Kind but
  // NOT the approval Kind (the Standard-referenced semantic Kind). Seal-time
  // requires every graph Kind to be bound, so the unbound-Kind admission
  // failure is exercised with envelopes whose exact Kind has no binding.
  const partialGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.e7-standard-bootstrap',
    components: definitionGraph().components.filter(
      (component) =>
        component.componentId !== APPROVAL_COMPONENT_ID &&
        component.kind.kindId !== SEMANTIC_KIND.kindId,
    ),
    relations: [],
  };
  const partialAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: partialGraph,
      kindImplementations: [APP_LEDGER_BINDING, CALC_KIND_BINDING],
    },
    realSha256,
  );

  // T002B: the Standard-referenced approval Component fails with
  // ASSEMBLY_ADMISSION_KIND_NOT_BOUND — the exact SAME typed code an app
  // Component with an unbound Kind gets (control below). The exact-Kind
  // support decision runs before graph currentness, so the same code fires
  // for both families with no standard-specific branch.
  await assert.rejects(
    admitComponentWithAssembly(
      componentById(definitionGraph(), APPROVAL_COMPONENT_ID),
      partialAssembly,
      { currentDefinitionGraph: partialGraph, sha256: realSha256 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError, `expected RuntimeAssemblyError, got ${String(error)}`);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
  const unboundAppComponent: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'e7.test.component.audit-trail',
    kind: { kindId: 'e7.test.audit-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { audit: 'e7-app-audit' },
  };
  await assert.rejects(
    admitComponentWithAssembly(unboundAppComponent, partialAssembly, {
      currentDefinitionGraph: partialGraph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError, `expected RuntimeAssemblyError, got ${String(error)}`);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );

  // Must-understand control: an undeclared exact Kind fails UNKNOWN_KIND and
  // a declared-kindId/wrong-version fails KIND_VERSION_MISMATCH for BOTH the
  // Standard-referenced and the app component through one shared code path.
  const onlyAppUnderstood: UnderstoodKindDeclaration[] = [
    {
      kind: { kindId: APP_KIND.kindId, version: APP_KIND.version },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
  ];
  assert.throws(
    () => admitComponent(componentById(definitionGraph(), APPROVAL_COMPONENT_ID), onlyAppUnderstood),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'UNKNOWN_KIND');
      return true;
    },
  );
  const wrongVersionUnderstood: UnderstoodKindDeclaration[] = [
    {
      kind: { kindId: SEMANTIC_KIND.kindId, version: '2.0.0' },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
  ];
  assert.throws(
    () => admitComponent(componentById(definitionGraph(), APPROVAL_COMPONENT_ID), wrongVersionUnderstood),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'KIND_VERSION_MISMATCH');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// E7-3 (O2): Standard descriptor semantic identity is Definition-plane.
// ---------------------------------------------------------------------------

test('E7-3: descriptor digest is Definition-plane — immune to implementation pin replacement, moves only on descriptor semantic material', async () => {
  const baseline = await computeStandardDescriptorDigest(APPROVAL_DESCRIPTOR, realSha256);
  assert.equal(baseline, FROZEN.descriptorDigestApproval);

  // Replacing the accepted reference implementation (the Assembly-plane
  // material) cannot move the descriptor digest: two candidates identical in
  // descriptor material but pinned to different implementations digest equal.
  const pinnedAlpha: StandardBootstrapCandidate = Object.freeze({
    descriptor: APPROVAL_DESCRIPTOR,
    referenceImplementation: ALPHA_APPROVAL_BINDING.pin,
  });
  const pinnedBeta: StandardBootstrapCandidate = Object.freeze({
    descriptor: APPROVAL_DESCRIPTOR,
    referenceImplementation: BETA_APPROVAL_BINDING.pin,
  });
  assert.equal(
    await computeStandardDescriptorDigest(pinnedAlpha.descriptor, realSha256),
    await computeStandardDescriptorDigest(pinnedBeta.descriptor, realSha256),
  );

  // The identity material is the versioned descriptor domain + exact
  // descriptor fields + ordinary exact ComponentRef — nothing else.
  const material = standardDescriptorIdentityMaterial(APPROVAL_DESCRIPTOR);
  assert.equal(material.domain, STANDARD_DESCRIPTOR_DIGEST_DOMAIN);
  assert.equal(material.standardId, 'e7.test.standard.approval');
  assert.equal(material.classification, 'published');
  assert.equal(material.descriptorVersion, '1.0.0');
  assert.deepEqual(material.component, APPROVAL_DESCRIPTOR.component);
  assert.equal(await computeStandardDescriptorDigest(APPROVAL_DESCRIPTOR, realSha256), baseline);

  // A descriptor semantic version bump is an ordinary Definition identity
  // change (exactly as an app Component version bump would be).
  const bumped: StandardComponentDescriptor = {
    ...APPROVAL_DESCRIPTOR,
    descriptorVersion: '1.1.0',
  };
  assert.notEqual(await computeStandardDescriptorDigest(bumped, realSha256), baseline);

  // The calc (tool-family) descriptor digest is likewise frozen.
  assert.equal(
    await computeStandardDescriptorDigest(CALC_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestCalc,
  );
});

// ---------------------------------------------------------------------------
// E7-4 (O3/O4, semantic family): Set pins are Assembly-plane; implementation
// replacement moves Assembly/currentness only, never Definition identity.
// ---------------------------------------------------------------------------

test('E7-4: replacing a Standard Semantic implementation moves Assembly + Set identity while Definition graph and descriptor digests stay byte-identical; the stale Set fails closed typed', async () => {
  const graph = definitionGraph();
  const graphDigest = await computeDefinitionGraphDigest(graph, realSha256);
  assert.equal(graphDigest, FROZEN.definitionGraphDigest);

  const alphaAssembly = await baseAssembly();
  const replacementAssembly = await betaAssembly();
  assert.equal(alphaAssembly.assemblyDigest, FROZEN.assemblyBaseDigest);
  assert.equal(replacementAssembly.assemblyDigest, FROZEN.assemblyBetaDigest);
  assert.notEqual(alphaAssembly.assemblyDigest, replacementAssembly.assemblyDigest);

  // Definition plane untouched by the implementation swap: the graph digest
  // (recomputed over the SAME graph) is byte-identical across replacement.
  assert.equal(await computeDefinitionGraphDigest(graph, realSha256), graphDigest);

  const setAlpha = await sealApprovalSet(ALPHA_APPROVAL_BINDING.pin);
  const setBeta = await sealApprovalSet(BETA_APPROVAL_BINDING.pin);
  assert.equal(setAlpha.setDigest, FROZEN.setApprovalAlphaDigest);
  assert.equal(setBeta.setDigest, FROZEN.setApprovalBetaDigest);
  assert.notEqual(setAlpha.setDigest, setBeta.setDigest);

  // Descriptor semantic identity (Definition plane) is unchanged by the
  // replacement — the exact same descriptor digest pins both Sets.
  assert.equal(
    setAlpha.record.entries[0]!.descriptor.descriptorDigest,
    setBeta.record.entries[0]!.descriptor.descriptorDigest,
  );

  // The alpha Set is CURRENT against the alpha Assembly ...
  const currentAlpha = await verifyStandardSetCurrentness(setAlpha, await currentnessOptions());
  assert.equal(currentAlpha.status, 'CURRENT');
  assert.equal(currentAlpha.setDigest, setAlpha.setDigest);
  assert.equal(currentAlpha.checkedDescriptors, 1);
  assert.equal(currentAlpha.finalAssemblyDigest, alphaAssembly.assemblyDigest);

  // ... and the beta Set is CURRENT against the replacement Assembly ...
  const currentBeta = await verifyStandardSetCurrentness(
    setBeta,
    await currentnessOptions({ finalAssembly: replacementAssembly }),
  );
  assert.equal(currentBeta.status, 'CURRENT');
  assert.equal(currentBeta.finalAssemblyDigest, replacementAssembly.assemblyDigest);

  // ... but the alpha Set against the replacement Assembly fails closed with
  // the typed Assembly-plane staleness code — unchanged Definition semantics
  // cannot rescue stale implementation pins.
  await assert.rejects(
    verifyStandardSetCurrentness(setAlpha, await currentnessOptions({ finalAssembly: replacementAssembly })),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// E7-5 (O1/O3/O4, tool family): the Standard Tool path consumes the SAME
// T003C verifier; binding replacement moves currentness with typed failures.
// ---------------------------------------------------------------------------

test('E7-5: Standard Tool Set is current through the generic T002B + T003C path; forged binding evidence fails through the owning T003C typed code', async () => {
  const { binding, successorAssembly } = await toolFixture();
  assert.equal(successorAssembly.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(binding.evidence.bindingDigest, FROZEN.toolBindingDigest);

  const set = await combinedSet();
  assert.equal(set.setDigest, FROZEN.setCombinedDigest);

  // CURRENT against the successor Assembly carrying the exact-subject §G
  // slot, with the exact caller-supplied sealed T003C binding.
  const current = await verifyStandardSetCurrentness(
    set,
    await currentnessOptions({ finalAssembly: successorAssembly, sealedToolBindings: [binding] }),
  );
  assert.equal(current.status, 'CURRENT');
  assert.equal(current.checkedDescriptors, 2);
  assert.equal(current.finalAssemblyDigest, successorAssembly.assemblyDigest);

  // The Set's exact subject slot must equal the VERIFIED binding digest: a
  // Set whose slot digest differs from the verified binding fails closed
  // with the typed Set<->binding linkage code.
  const mismatchedSlotSet = await sealStandardSet(
    {
      entries: [
        await descriptorEntry(APPROVAL_DESCRIPTOR, ALPHA_APPROVAL_BINDING.pin),
        await descriptorEntry(CALC_DESCRIPTOR, CALC_KIND_BINDING.pin),
      ],
      currentDescriptors: [APPROVAL_DESCRIPTOR, CALC_DESCRIPTOR],
      implementationBindingEvidence: [
        { subject: CALC_COMPONENT_ID, bindingDigest: 'sha256:e7-forged-slot-digest' },
      ],
    },
    realSha256,
  );
  await assert.rejects(
    verifyStandardSetCurrentness(
      mismatchedSlotSet,
      await currentnessOptions({ finalAssembly: successorAssembly, sealedToolBindings: [binding] }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH');
      return true;
    },
  );

  // T003C mint authenticity is owned by the #640 verifier and propagates
  // UNCHANGED: a caller-constructed "sealed" binding lookalike fails with
  // the owning module's typed code, not a Standard-wrapped substitute.
  const forgedBinding = {
    evidence: {
      toolComponentId: CALC_COMPONENT_ID,
      bindingDigest: binding.evidence.bindingDigest,
    },
  } as unknown as SealedToolImplementationBinding;
  await assert.rejects(
    verifyStandardSetCurrentness(
      set,
      await currentnessOptions({
        finalAssembly: successorAssembly,
        sealedToolBindings: [forgedBinding],
      }),
    ),
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );

  // A caller-constructed lookalike Assembly can never supply currentness:
  // final-Assembly authenticity stays T002B-owned.
  const lookalikeAssembly = {
    assemblyDigest: successorAssembly.assemblyDigest,
    record: successorAssembly.record,
  } as unknown as SealedRuntimeAssembly;
  await assert.rejects(
    verifyStandardSetCurrentness(
      set,
      await currentnessOptions({ finalAssembly: lookalikeAssembly, sealedToolBindings: [binding] }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      return true;
    },
  );

  // Direct consumption check: the SAME accepted #640 verifier the Standard
  // module consumes also verifies the binding standalone against the SAME
  // final Assembly — identical evidence, identical currentness.
  const standalone = await verifyToolImplementationBinding({
    binding,
    finalAssembly: successorAssembly,
    sha256: realSha256,
  });
  assert.equal(standalone.currentness.bindingDigest, binding.evidence.bindingDigest);
  assert.equal(standalone.currentness.subject, CALC_COMPONENT_ID);
});

// ---------------------------------------------------------------------------
// E7-6 (O6): the #820 effect=none eligibility binding + toolContracts context
// is consumed as a pre-selection filter — never ranking authority.
// ---------------------------------------------------------------------------

test('E7-6: #820 toolContracts context is a pre-selection effect=none filter; effectful-only candidates cannot mask a pure candidate; semantic selection never consults Tool context', () => {
  const ref = (componentId: string): ExactComponentRef => ({
    family: 'tool',
    componentId,
    kind: { kindId: TOOL_KIND.kindId, version: TOOL_KIND.version },
  });
  const toolDescriptor = (componentId: string): StandardComponentDescriptor => ({
    standardId: `e7.test.standard.${componentId}`,
    classification: 'published',
    descriptorVersion: '1.0.0',
    component: ref(componentId),
  });
  const toolContract = (componentId: string, effect: 'none' | 'non-idempotent') => ({
    family: 'tool' as const,
    componentId,
    kind: { kindId: TOOL_KIND.kindId, version: TOOL_KIND.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect },
      ],
      providesCapabilities: [],
    },
  });
  const candidateFor = (
    componentId: string,
    implementationId: string,
  ): StandardBootstrapCandidate => ({
    descriptor: toolDescriptor(componentId),
    referenceImplementation: {
      kind: { kindId: TOOL_KIND.kindId, version: TOOL_KIND.version },
      implementation: {
        implementationId,
        implementationVersion: '1.0.0',
        implementationDigest: `sha256:e7-${implementationId}-content`,
      },
    },
  });
  const contextFor = (entries: readonly { componentId: string; effect: 'none' | 'non-idempotent' }[]) => ({
    toolContracts: entries.map((entry) => ({
      component: ref(entry.componentId),
      contract: toolContract(entry.componentId, entry.effect),
    })),
  });

  // The lexicographically SMALLER tool candidate is effectful-only; the pure
  // candidate wins anyway — the effect filter runs pre-selection and can
  // never be masked by input order or by the primary ordering key.
  const effectfulSmaller = candidateFor('e7.test.component.calc-a-effectful', 'e7.test.impl.effectful');
  const pureLarger = candidateFor('e7.test.component.calc-z-pure', 'e7.test.impl.pure');
  const winner = selectStandardBootstrapCandidate(
    [effectfulSmaller, pureLarger],
    'tool',
    contextFor([
      { componentId: 'e7.test.component.calc-a-effectful', effect: 'non-idempotent' },
      { componentId: 'e7.test.component.calc-z-pure', effect: 'none' },
    ]),
  );
  assert.equal(winner.descriptor.component.componentId, 'e7.test.component.calc-z-pure');
  // The same selection under reversed input order is identical (no
  // registry/source-order authority).
  const winnerReversed = selectStandardBootstrapCandidate(
    [pureLarger, effectfulSmaller],
    'tool',
    contextFor([
      { componentId: 'e7.test.component.calc-z-pure', effect: 'none' },
      { componentId: 'e7.test.component.calc-a-effectful', effect: 'non-idempotent' },
    ]),
  );
  assert.deepEqual(winnerReversed, winner);

  // A pool with ONLY an effectful-only tool candidate has no eligible
  // candidate — the typed family-specific absent terminal, never an
  // invented or downgraded candidate.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [effectfulSmaller],
        'tool',
        contextFor([{ componentId: 'e7.test.component.calc-a-effectful', effect: 'non-idempotent' }]),
      ),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError, `expected StandardCandidateAbsentError, got ${String(error)}`);
      assert.equal(error.code, STANDARD_TOOL_CANDIDATE_ABSENT);
      return true;
    },
  );

  // An otherwise-eligible tool candidate whose exact ComponentRef has no
  // binding in the verification-only context fails closed typed — no
  // closest/latest/default lookup.
  assert.throws(
    () => selectStandardBootstrapCandidate([pureLarger], 'tool', { toolContracts: [] }),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError, `expected StandardContractError, got ${String(error)}`);
      assert.equal(error.code, 'STANDARD_TOOL_CONTRACT_MISSING');
      return true;
    },
  );

  // Semantic-family selection NEVER consults the Tool context: even a
  // context that would be malformed for tool selection is ignored, and a
  // semantic pool with no eligible candidate yields the semantic absent
  // code — Semantic acquires no Tool/effect semantics.
  const semanticCandidate: StandardBootstrapCandidate = {
    descriptor: APPROVAL_DESCRIPTOR,
    referenceImplementation: ALPHA_APPROVAL_BINDING.pin,
  };
  const semanticWinner = selectStandardBootstrapCandidate(
    [semanticCandidate],
    'semantic',
    // Tool-only context (ignored for semantic selection entirely).
    { toolContracts: [{ component: ref(CALC_COMPONENT_ID), contract: toolContract(CALC_COMPONENT_ID, 'none') }] },
  );
  assert.deepEqual(semanticWinner.descriptor, APPROVAL_DESCRIPTOR);
  assert.throws(
    () => selectStandardBootstrapCandidate([], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError, `expected StandardCandidateAbsentError, got ${String(error)}`);
      assert.equal(error.code, STANDARD_SEMANTIC_CANDIDATE_ABSENT);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// E7-7 (O5): executable source scan — no privileged Standard registry,
// admission branch or Microkernel coupling exists.
// ---------------------------------------------------------------------------

test('E7-7: no privileged Standard branch — zero src imports of the standard module from outside itself; zero standard references in T002B/admission/invocation modules', () => {
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
    'no src module outside contracts/standard.ts may import the standard module (no privileged registry/admission/dispatch coupling)',
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
});

// ---------------------------------------------------------------------------
// E7-8 (O7): frozen identity — determinism re-run and byte-exact constants.
// ---------------------------------------------------------------------------

test('E7-8: frozen fixture identity — rebuilding every digest from scratch reproduces the pre-freeze constants byte-exactly', async () => {
  const graph = definitionGraph();
  assert.equal(await computeDefinitionGraphDigest(graph, realSha256), FROZEN.definitionGraphDigest);
  assert.equal(
    await computeStandardDescriptorDigest(APPROVAL_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestApproval,
  );
  assert.equal(
    await computeStandardDescriptorDigest(CALC_DESCRIPTOR, realSha256),
    FROZEN.descriptorDigestCalc,
  );

  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [ALPHA_APPROVAL_BINDING, APP_LEDGER_BINDING, CALC_KIND_BINDING],
    },
    realSha256,
  );
  assert.equal(assembly.assemblyDigest, FROZEN.assemblyBaseDigest);

  const replacement = await sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [BETA_APPROVAL_BINDING, APP_LEDGER_BINDING, CALC_KIND_BINDING],
    },
    realSha256,
  );
  assert.equal(replacement.assemblyDigest, FROZEN.assemblyBetaDigest);

  const graphDigest = await computeDefinitionGraphDigest(graph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    CALC_CAPABILITY,
    CALC_CONSUMER_COMPONENT_ID,
    graphDigest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: graph,
    implementations: [
      {
        implementation: {
          implementationId: 'e7.test.impl.calc-exec-alpha',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:e7-calc-exec-alpha-content',
        },
        supportedOperations: ['op.add', 'op.sub'],
      },
    ],
    sha256: realSha256,
  });
  assert.equal(binding.successorAssembly.assemblyDigest, FROZEN.assemblySuccessorDigest);
  assert.equal(binding.evidence.bindingDigest, FROZEN.toolBindingDigest);

  assert.equal((await sealApprovalSet(ALPHA_APPROVAL_BINDING.pin)).setDigest, FROZEN.setApprovalAlphaDigest);
  assert.equal((await sealApprovalSet(BETA_APPROVAL_BINDING.pin)).setDigest, FROZEN.setApprovalBetaDigest);
  assert.equal((await combinedSet()).setDigest, FROZEN.setCombinedDigest);
});
