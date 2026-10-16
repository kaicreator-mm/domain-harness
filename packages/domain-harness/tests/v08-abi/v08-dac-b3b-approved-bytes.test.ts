// v0.8 T-G #1006 B3b — HF30/NF03/NF04 targeted P/N over the PACKAGED public
// DAC verifier entry and the EXACT approved Host bytes (test-only).
//
// Product allocation verified before any Host wiring (frozen L1 evidence
// rows HF30/NF03/NF04): BUILD is a DELIVERED_SCOPE_LIMITED PURE consumer of
// EXTERNAL DAC designation/binding/activation facts — never an issuer or
// signing service; H approves immutable module bytes; M performs the actual
// `load(package)`. This file therefore adds NO production Host gate, NO
// issuer/approval service and NO new Runtime: the DAC -> Host composition
// below lives on the test side only, exactly like the R3 compiler bridge
// (nf01-04-dac-build-bridge.test.ts) whose verifier matrix is NOT repeated
// here. What is new relative to that bridge:
//   1. every verifier is consumed through the already-shipped public npm
//      subpath `@kaicreator/domain-harness/v8/dac` (#1083), not private
//      src leaves, and the Host side through `/v8` + `/v8/host`;
//   2. the verified subject digest is the digest of the EXACT approved
//      sealed module bytes a real trusted Node Host activates through the
//      public `load()` gate — a real better-sqlite3 store, a real HMAC
//      issuer registry and real module evaluation sentinels;
//   3. every stale/revoked/forged/self-issued/wrong-binding refusal is
//      proven BEFORE EFFECT: the execution sentinel stays 0 and the
//      physical document store is untouched.
//
// ONE shared physical fixture serves all three rows (not three demos): one
// bootstrapped SQLite-backed trusted Host, one external DAC fact world
// (owner -> delegate -> seam leaf issuers, one intake/compatibility chain)
// and per-scenario sealed roots minted by the same builder with unique
// tags. Top-level tests run sequentially and the ORDER IS LOAD-BEARING:
// the positive path bootstraps the one-shot Host trust channel first, every
// later negative reuses it and must leave zero new effects behind.
import assert from 'node:assert/strict';
import test from 'node:test';
import { after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { authority, runtime } from '@kaicreator/domain-harness/v8/dac';
import { load } from '@kaicreator/domain-harness/v8';
import type { LoadedQualifiedPackages, SealedQualifiedPackageRoot } from '@kaicreator/domain-harness/v8';
import { bootstrapTrustedHost } from '@kaicreator/domain-harness/v8/host';
import type { CasDocumentStore } from '@kaicreator/domain-harness/v8/host';
import {
  adoptDacV0041RegistryReference,
  DAC_V0041_BASELINE,
  mintCompatibilityValidationRequestRef,
  mintRuntimeBindingRequestRef,
} from '@kaicreator/domain-harness/v4';

import { buildEndAct } from '../dac-v0041-authority/helpers.js';
import {
  buildCoverage,
  buildManifestFacts,
  buildSelectionFacts,
  buildValidIntakeInput,
} from '../dac-v0041-composition-intake/helpers.js';
import * as rt from '../dac-v0041-runtime/helpers.js';
import { buildSealedRoot, genuineApprovalProof, sentinelCount } from '../v08-host/helpers.js';

// ---------------------------------------------------------------------------
// The one shared external-DAC/Host fact world.
// ---------------------------------------------------------------------------
const HOST_AUDIENCE = 'host:b3b-dac-b3b';
const INTENT_TYPE = 'demo.b3b-dac';
/** The external DAC authority the chain designates for runtime activation. */
const APPROVAL_ISSUER = rt.IDENTITY.activationIssuer;
const APPROVAL_SECRET = 'b3b-external-approval-secret:material';
/** A builder/creator identity with NO external DAC standing of its own. */
const BUILD_SELF = 'id/build-self-b3b';
/** An impostor external issuer with no scope-owner root. */
const IMPOSTOR = 'id/impostor-issuer-b3b';
const TARGET = 'target/trusted-node-host@1';

interface ApprovedBytes {
  readonly root: SealedQualifiedPackageRoot;
  readonly manifestIdentity: string;
  readonly approvedDigest: string;
}

function approvedBytes(tag: string): ApprovedBytes {
  // buildSealedRoot is digest-deterministic for a fixed tag/intentType, so
  // the externally minted approval covers exactly the bytes of `root`.
  const subjectDigest = buildSealedRoot({ tag, intentType: INTENT_TYPE }).approval.subjectDigest;
  const root = buildSealedRoot({
    tag,
    intentType: INTENT_TYPE,
    proof: genuineApprovalProof(subjectDigest, undefined, APPROVAL_ISSUER, APPROVAL_SECRET),
  });
  return { root, manifestIdentity: root.rootPackageId, approvedDigest: subjectDigest };
}

function sentinels(tag: string): [string, string, string] {
  return [`kernel:te-${tag}@1.0.0`, `std:te-${tag}@1.0.0`, `biz:te-${tag}@1.0.0`];
}

// In-repo src test helpers and the PUBLIC dist entry are two module
// instances with INDEPENDENT nominal reference registries, so a reference
// minted by an src helper is FOREIGN to the public verifiers. A real npm
// consumer never hits this seam (it mints and verifies through the same
// package). The fixture therefore mints every reference it controls through
// the public foundation entry and re-mints the helper-built intake fact
// tree verbatim (same role/identity/digest/scope, field by field) — the
// re-mint adds and changes NO fact, it only rebrands the carrier.
function distRef(
  role: Parameters<typeof adoptDacV0041RegistryReference>[0]['role'],
  primaryIdentity: string,
  overrides: {
    authorityScope?: string;
    semanticIdentity?: string;
    revisionIdentity?: string;
    contentDigest?: string;
    contractProfileIdentity?: string;
  } = {},
) {
  return adoptDacV0041RegistryReference({
    role,
    baseline: DAC_V0041_BASELINE,
    authorityScope: overrides.authorityScope ?? rt.SCOPE.app,
    primaryIdentity,
    ...(overrides.semanticIdentity === undefined ? {} : { semanticIdentity: overrides.semanticIdentity }),
    ...(overrides.revisionIdentity === undefined ? {} : { revisionIdentity: overrides.revisionIdentity }),
    ...(overrides.contentDigest === undefined ? {} : { contentDigest: overrides.contentDigest }),
    ...(overrides.contractProfileIdentity === undefined ? {} : { contractProfileIdentity: overrides.contractProfileIdentity }),
    opaque: {},
  });
}

function isReferenceShape(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.adapter === 'string'
    && typeof candidate.role === 'string'
    && typeof candidate.primaryIdentity === 'string'
    && typeof candidate.authorityScope === 'string';
}

function distRemint<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => distRemint(entry)) as T;
  }
  if (isReferenceShape(value)) {
    const input: Record<string, unknown> = { opaque: {} };
    for (const key of [
      'baseline',
      'role',
      'authorityScope',
      'primaryIdentity',
      'semanticIdentity',
      'revisionIdentity',
      'contentDigest',
      'contractProfileIdentity',
      'locatorHints',
      'predecessorOrigin',
      'opaque',
    ]) {
      const slot = value[key];
      if (slot !== undefined) input[key] = slot;
    }
    return adoptDacV0041RegistryReference(input as unknown as Parameters<typeof adoptDacV0041RegistryReference>[0]) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, slot] of Object.entries(value)) {
      out[key] = distRemint(slot);
    }
    return out as T;
  }
  return value;
}

function zeroEffect(tag: string): void {
  for (const packageId of sentinels(tag)) {
    assert.equal(sentinelCount(packageId), 0, `module ${packageId} must never evaluate on refusal`);
  }
}

/** The designation chain the DAC world current-verifies for the approval issuer. */
function b3bDesignation(overrides: Partial<Parameters<typeof authority.verifyDacV0041DesignationChain>[0]> = {}): Parameters<typeof authority.verifyDacV0041DesignationChain>[0] {
  return rt.buildChainInput(
    'link/b3b-activation-leaf',
    APPROVAL_ISSUER,
    rt.ROLE.runtimeActivation,
    85,
    overrides,
  );
}

function approvedSubjectRef(digest: string) {
  return distRef('selected-domain-data', 'subject/approved-closure', {
    semanticIdentity: 'semantic/approved-closure',
    revisionIdentity: `revision/${digest}`,
    contentDigest: digest,
  });
}

function bridgedIntake(material: ApprovedBytes, digest: string) {
  const subjectRef = approvedSubjectRef(digest);
  return distRemint(buildValidIntakeInput({
    applicationSelection: buildSelectionFacts({ selectedDomainDataRefs: [subjectRef] }),
    manifest: buildManifestFacts({
      manifestRef: distRef('manifest', material.manifestIdentity),
      manifestContentDigestRef: distRef('manifest-content-digest', digest),
      selectedDomainDataRefs: [subjectRef],
    }),
    selectedDomainData: [buildCoverage('subject/approved-closure', { subjectRef })],
  }));
}

function bridgedCompatibility(material: ApprovedBytes, digest: string) {
  const subject = {
    manifestIdentity: material.manifestIdentity,
    manifestContentDigest: digest,
    targetIdentities: [TARGET],
    requirementsProfileIdentity: rt.PROFILE.requirements,
    dacProfileIdentity: rt.PROFILE.v0041,
    materialManifestRefs: [{
      role: 'manifest' as const,
      authorityScope: rt.SCOPE.app,
      primaryIdentity: material.manifestIdentity,
      contentDigest: digest,
    }],
  };
  const resultIdentity = `result/compat-b3b-${digest.slice(0, 16)}`;
  return {
    requestRef: mintCompatibilityValidationRequestRef({
      baseline: DAC_V0041_BASELINE,
      authorityScope: rt.SCOPE.app,
      primaryIdentity: 'request/compat-b3b-1',
      requesterIdentity: rt.IDENTITY.composer,
      providerIdentity: rt.IDENTITY.compatibilityValidator,
      requestedCapabilityKind: 'compatibility-validation',
      materialInputRefs: [distRef('manifest', material.manifestIdentity, { contentDigest: digest })],
      bindingTargetRef: distRef('compatibility-target', TARGET, {
        contractProfileIdentity: rt.PROFILE.requirements,
      }),
      contractProfileIdentity: rt.PROFILE.v0041,
    }),
    validationView: {
      validationViewIdentity: 'validation/compat-b3b-1',
      boundRequestIdentity: 'request/compat-b3b-1',
      validatorIdentity: rt.IDENTITY.compatibilityValidator,
      validatorDesignated: true,
      subject,
    },
    resultView: {
      resultViewIdentity: resultIdentity,
      boundValidationViewIdentity: 'validation/compat-b3b-1',
      validatorIdentity: rt.IDENTITY.compatibilityValidator,
      subject,
      disposition: 'COMPATIBLE' as const,
      currentness: 'current' as const,
    },
    precedenceFacts: {
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: true,
        materialStaleness: false,
        bindingTargetState: { presence: 'missing' as const },
      },
      bindingTimeCheckReliedAsCompatibilityResult: false,
      authoritativeResults: [{
        resultViewIdentity: resultIdentity,
        validatorIdentity: rt.IDENTITY.compatibilityValidator,
        validatorDesignated: true,
        disposition: 'COMPATIBLE' as const,
        currentness: 'current' as const,
      }],
      refusalEvidence: [],
      assertedDisposition: 'COMPATIBLE' as const,
    },
  };
}

interface BridgedBindingOptions {
  /** The digest the external DAC facts authorize. */
  readonly authorizedDigest: string;
  /** The digest of the bytes ACTUALLY presented to the Host for loading. */
  readonly actualDigest: string;
}

function bridgedBinding(
  material: ApprovedBytes,
  options: BridgedBindingOptions,
  overrides: Partial<Parameters<typeof runtime.verifyDacV0041RuntimeBinding>[0]> = {},
): Parameters<typeof runtime.verifyDacV0041RuntimeBinding>[0] {
  const { authorizedDigest, actualDigest } = options;
  return {
    bindingRequestRef: mintRuntimeBindingRequestRef({
      baseline: DAC_V0041_BASELINE,
      authorityScope: rt.SCOPE.app,
      primaryIdentity: 'request/binding-b3b-1',
      requesterIdentity: rt.IDENTITY.composer,
      providerIdentity: rt.IDENTITY.producer,
      requestedCapabilityKind: 'runtime-binding',
      materialInputRefs: [distRef('manifest', material.manifestIdentity, {
        contentDigest: actualDigest,
      })],
      bindingTargetRef: distRef('compatibility-target', TARGET, {
        contractProfileIdentity: rt.PROFILE.requirements,
      }),
      contractProfileIdentity: rt.PROFILE.v0041,
    }),
    bindingResultRef: distRef('runtime-binding', 'binding/b3b-record-1'),
    boundRequestIdentity: 'request/binding-b3b-1',
    subject: {
      manifestIdentity: material.manifestIdentity,
      manifestContentDigest: authorizedDigest,
      dacProfileIdentity: rt.PROFILE.v0041,
    },
    compositionIntake: bridgedIntake(material, authorizedDigest),
    compatibility: bridgedCompatibility(material, authorizedDigest),
    bindingIssuer: {
      issuerIdentity: rt.IDENTITY.bindingIssuer,
      requiredIssuingRole: rt.ROLE.runtimeBinding,
      issuerDesignationChain: rt.buildChainInput(
        'link/b3b-binding-leaf',
        rt.IDENTITY.bindingIssuer,
        rt.ROLE.runtimeBinding,
        70,
      ),
    },
    bindingIssuanceEvidence: { point: 70, assertedBy: [rt.IDENTITY.witness] },
    sod: rt.buildSodFacts(),
    evaluationPoint: 75,
    ...overrides,
  };
}

function bridgedActivation(
  binding: Parameters<typeof runtime.verifyDacV0041RuntimeBinding>[0],
  overrides: Partial<Parameters<typeof runtime.verifyDacV0041RuntimeActivation>[0]> = {},
): Parameters<typeof runtime.verifyDacV0041RuntimeActivation>[0] {
  const currentness = { state: 'current', establishedAt: 85, assertedBy: [rt.IDENTITY.witness] };
  const subject = binding.subject as { manifestIdentity: string; manifestContentDigest: string };
  return {
    activationRequestRef: distRef('runtime-activation-request', 'request/activation-b3b-1', {
      contractProfileIdentity: rt.PROFILE.v0041,
    }),
    activationResultRef: distRef('runtime-activation', 'activation/b3b-record-1'),
    boundRequestIdentity: 'request/activation-b3b-1',
    boundBindingIdentity: 'binding/b3b-record-1',
    boundManifestIdentity: subject.manifestIdentity,
    boundManifestContentDigest: subject.manifestContentDigest,
    activationRequestSubject: {
      targetBindingIdentity: 'binding/b3b-record-1',
      targetManifestIdentity: subject.manifestIdentity,
      targetManifestContentDigest: subject.manifestContentDigest,
      reliedBindingCurrentness: currentness,
    },
    binding,
    activationIssuer: {
      issuerIdentity: APPROVAL_ISSUER,
      requiredIssuingRole: rt.ROLE.runtimeActivation,
      issuerDesignationChain: b3bDesignation(),
    },
    activationIssuanceEvidence: { point: 80, assertedBy: [rt.IDENTITY.witness] },
    bindingReuseCurrentness: currentness,
    sod: rt.buildSodFacts(),
    evaluationPoint: 85,
    ...overrides,
  };
}

type DesignationResult = ReturnType<typeof authority.verifyDacV0041DesignationChain>;
type BindingResult = ReturnType<typeof runtime.verifyDacV0041RuntimeBinding>;
type ActivationResult = ReturnType<typeof runtime.verifyDacV0041RuntimeActivation>;
type GateRefusal =
  | { readonly stage: 'designation'; readonly result: DesignationResult }
  | { readonly stage: 'binding'; readonly result: BindingResult }
  | { readonly stage: 'activation'; readonly result: ActivationResult };

/**
 * Test-side admission composition (NO production adapter is claimed): pure
 * DAC fact verification through the public entry, and only a fully verified
 * designation -> binding -> activation chain reaches the public `load()`
 * gate for the exact approved bytes. Any refusal returns BEFORE the Host is
 * asked to execute anything.
 */
async function admitForExecution(input: {
  readonly designation: Parameters<typeof authority.verifyDacV0041DesignationChain>[0];
  readonly binding: Parameters<typeof runtime.verifyDacV0041RuntimeBinding>[0];
  readonly activation: Parameters<typeof runtime.verifyDacV0041RuntimeActivation>[0];
  readonly bytes: ApprovedBytes;
}): Promise<
  | { readonly admitted: true; readonly loaded: LoadedQualifiedPackages }
  | { readonly admitted: false; readonly refusal: GateRefusal }
> {
  const designation = authority.verifyDacV0041DesignationChain(input.designation);
  if (designation.outcome !== 'CHAIN_CURRENT') {
    return { admitted: false, refusal: { stage: 'designation', result: designation } };
  }
  const binding = runtime.verifyDacV0041RuntimeBinding(input.binding);
  if (binding.outcome !== 'BINDING_VERIFIED') {
    return { admitted: false, refusal: { stage: 'binding', result: binding } };
  }
  const activation = runtime.verifyDacV0041RuntimeActivation(input.activation);
  if (activation.outcome !== 'ACTIVATION_VERIFIED') {
    return { admitted: false, refusal: { stage: 'activation', result: activation } };
  }
  return { admitted: true, loaded: await load(input.bytes.root) };
}

// ---------------------------------------------------------------------------
// The shared physical fixture state (established by the first test).
// ---------------------------------------------------------------------------
let storageDir = '';
let docs: CasDocumentStore;
let durableBaseline: readonly string[] = [];

const POS = approvedBytes('b3b-pos');
const WRONG_BYTES = approvedBytes('b3b-wrongbytes');
const DRIFTED = approvedBytes('b3b-drift');

async function assertDurableStoreUntouched(): Promise<void> {
  assert.deepEqual(await docs.list(''), durableBaseline, 'no durable Host document may appear on refusal');
}

after(async () => {
  await docs?.close();
  if (storageDir !== '') {
    await rm(storageDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// HF30 — external DAC designation/delegation verifier (P, then N family).
// ---------------------------------------------------------------------------
test('V08-HF30-P independently sourced external designation chain is CHAIN_CURRENT for the exact approval issuer', async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'v08-dac-b3b-'));
  const bootstrapped = await bootstrapTrustedHost({
    issuers: new Map([[APPROVAL_ISSUER, APPROVAL_SECRET]]),
    audience: HOST_AUDIENCE,
    storage: { path: path.join(storageDir, 'host.db') },
  });
  docs = bootstrapped.store;
  durableBaseline = await docs.list('');

  const designation = authority.verifyDacV0041DesignationChain(b3bDesignation());
  assert.equal(designation.outcome, 'CHAIN_CURRENT');
  // The chain-current leaf designates EXACTLY the external identity whose
  // HMAC approval the physical Host registry trusts — no other issuer.
  const leaf = b3bDesignation().links.find((link) => link.linkIdentity === 'link/b3b-activation-leaf');
  assert.ok(leaf !== undefined);
  assert.equal(leaf.designatedIssuerIdentity, APPROVAL_ISSUER);
  assert.equal(leaf.authorityRole, rt.ROLE.runtimeActivation);
});

test('V08-HF30-N self-issued BUILD designation is denied before any effect', async () => {
  const refusal = await admitForExecution({
    designation: b3bDesignation({
      links: [
        rt.buildLeafLink('link/b3b-activation-leaf', BUILD_SELF, rt.ROLE.runtimeActivation),
        rt.buildRootIssuanceLink({
          designatorIdentity: BUILD_SELF,
          designatedIssuerIdentity: BUILD_SELF,
        }),
      ],
      scopeOwnerAnchors: [{ ownerIdentity: BUILD_SELF, provedScopes: [rt.SCOPE.app] }],
    }),
    binding: bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest }),
    activation: bridgedActivation(bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes: approvedBytes('b3b-selfn'),
  });
  assert.equal(refusal.admitted, false);
  assert.ok(refusal.refusal.stage === 'designation');
  assert.equal(refusal.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(refusal.refusal.result.code, 'SELF_DESIGNATION');
  zeroEffect('b3b-selfn');
  await assertDurableStoreUntouched();
});

test('V08-HF30-N lapsed and retroactively revoked designations are denied at effect time', async () => {
  const bytes = approvedBytes('b3b-lapsedn');
  const binding = bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest });
  const activation = bridgedActivation(binding);

  // Ordinary declared expiry: the evaluation point is past every window.
  const lapsed = await admitForExecution({
    designation: b3bDesignation({ evaluationPoint: 250 }),
    binding,
    activation,
    bytes,
  });
  assert.equal(lapsed.admitted, false);
  assert.ok(lapsed.refusal.stage === 'designation');
  assert.equal(lapsed.refusal.result.outcome, 'STALE');

  // Retroactive void by the scope owner: revoked, never re-usable.
  const revoked = await admitForExecution({
    designation: b3bDesignation({
      links: [
        rt.buildLeafLink('link/b3b-activation-leaf', APPROVAL_ISSUER, rt.ROLE.runtimeActivation, {
          endActs: [buildEndAct({ kind: 'retroactive-void', effectivePoint: 60 })],
        }),
        rt.buildRootIssuanceLink(),
      ],
    }),
    binding,
    activation,
    bytes,
  });
  assert.equal(revoked.admitted, false);
  assert.ok(revoked.refusal.stage === 'designation');
  assert.equal(revoked.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(revoked.refusal.result.code, 'CHAIN_VOIDED');

  zeroEffect('b3b-lapsedn');
  await assertDurableStoreUntouched();
});

test('V08-HF30-N spoofed external issuer chain without a scope-owner root is denied', async () => {
  const refusal = await admitForExecution({
    designation: b3bDesignation({
      links: [
        rt.buildLeafLink('link/b3b-activation-leaf', APPROVAL_ISSUER, rt.ROLE.runtimeActivation),
        // The impostor issues the root designation for the same delegate
        // (the chain itself stays continuous) but owns no proved scope:
        // no anchor can root it.
        rt.buildRootIssuanceLink({ designatorIdentity: IMPOSTOR }),
      ],
    }),
    binding: bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest }),
    activation: bridgedActivation(bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes: approvedBytes('b3b-spoofn'),
  });
  assert.equal(refusal.admitted, false);
  assert.ok(refusal.refusal.stage === 'designation');
  assert.equal(refusal.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(refusal.refusal.result.code, 'ROOT_ANCHOR_UNESTABLISHED');
  zeroEffect('b3b-spoofn');
  await assertDurableStoreUntouched();
});

// ---------------------------------------------------------------------------
// NF03 — runtime Binding fact verification, Binding != Activation/load.
// ---------------------------------------------------------------------------
test('V08-NF03-P binding verifies over the exact approved bytes and asserts no activation (nothing executes yet)', async () => {
  const binding = runtime.verifyDacV0041RuntimeBinding(bridgedBinding(POS, {
    authorizedDigest: POS.approvedDigest,
    actualDigest: POS.approvedDigest,
  }));
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  // Binding != Activation/load: a verified binding alone executes nothing —
  // the approved bytes exist but no module has been admitted for evaluation.
  zeroEffect('b3b-pos');
  await assertDurableStoreUntouched();
});

test('V08-NF03-N wrong actual installed bytes are denied before module activation', async () => {
  // Control: the verifier follows the material — the DRIFTED root is a
  // second genuine approved build, and facts authorizing ITS digest do
  // admit IT through the physical Host gate.
  const driftAdmitted = await admitForExecution({
    designation: b3bDesignation(),
    binding: bridgedBinding(DRIFTED, { authorizedDigest: DRIFTED.approvedDigest, actualDigest: DRIFTED.approvedDigest }),
    activation: bridgedActivation(bridgedBinding(DRIFTED, {
      authorizedDigest: DRIFTED.approvedDigest,
      actualDigest: DRIFTED.approvedDigest,
    })),
    bytes: DRIFTED,
  });
  assert.equal(driftAdmitted.admitted, true);
  for (const packageId of sentinels('b3b-drift')) {
    assert.equal(sentinelCount(packageId), 1);
  }

  // The DAC world authorizes the DRIFTED digest while the bytes ACTUALLY
  // presented are the POS closure: the request binds a different digest
  // than the authorized subject and the public verifier fails closed.
  const mismatch = await admitForExecution({
    designation: b3bDesignation(),
    binding: bridgedBinding(DRIFTED, { authorizedDigest: DRIFTED.approvedDigest, actualDigest: POS.approvedDigest }),
    activation: bridgedActivation(bridgedBinding(DRIFTED, {
      authorizedDigest: DRIFTED.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes: WRONG_BYTES,
  });
  assert.equal(mismatch.admitted, false);
  assert.ok(mismatch.refusal.stage === 'binding');
  assert.equal(mismatch.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(mismatch.refusal.result.code, 'SUBJECT_MISMATCH');
  zeroEffect('b3b-wrongbytes');
  await assertDurableStoreUntouched();
});

test('V08-NF03-N an activation record posing as the binding fact is refused (Binding != Activation)', async () => {
  const refusal = await admitForExecution({
    designation: b3bDesignation(),
    binding: bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    }, {
      bindingResultRef: distRef('runtime-activation', 'activation/poses-as-binding-b3b'),
    }),
    activation: bridgedActivation(bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes: approvedBytes('b3b-actslotn'),
  });
  assert.equal(refusal.admitted, false);
  assert.ok(refusal.refusal.stage === 'binding');
  assert.equal(refusal.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(refusal.refusal.result.code, 'ROLE_MISMATCH');
  zeroEffect('b3b-actslotn');
  await assertDurableStoreUntouched();
});

test('V08-NF03-N self-attested foreign issuer and stale upstream designation deny the binding', async () => {
  const bytes = approvedBytes('b3b-issuern');

  // Self-attested issuer: the input claims the real binding issuer while
  // the designation chain leaf designates someone else entirely.
  const foreign = await admitForExecution({
    designation: b3bDesignation(),
    binding: bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    }, {
      bindingIssuer: {
        issuerIdentity: rt.IDENTITY.bindingIssuer,
        requiredIssuingRole: rt.ROLE.runtimeBinding,
        issuerDesignationChain: rt.buildChainInput(
          'link/b3b-binding-leaf',
          rt.IDENTITY.outsider,
          rt.ROLE.runtimeBinding,
          70,
        ),
      },
    }),
    activation: bridgedActivation(bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes,
  });
  assert.equal(foreign.admitted, false);
  assert.ok(foreign.refusal.stage === 'binding');
  assert.equal(foreign.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(foreign.refusal.result.code, 'UNAUTHORIZED_BINDING_ISSUER');

  // Stale/revoked upstream: the binding record is evidenced as issued at
  // 250, long after its issuer's designation chain lapsed — an issuer whose
  // authority was already gone cannot have minted this binding fact.
  const lapsed = await admitForExecution({
    designation: b3bDesignation(),
    binding: bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    }, {
      bindingIssuanceEvidence: { point: 250, assertedBy: [rt.IDENTITY.witness] },
      evaluationPoint: 250,
    }),
    activation: bridgedActivation(bridgedBinding(POS, {
      authorizedDigest: POS.approvedDigest,
      actualDigest: POS.approvedDigest,
    })),
    bytes,
  });
  assert.equal(lapsed.admitted, false);
  assert.ok(lapsed.refusal.stage === 'binding');
  assert.equal(lapsed.refusal.result.outcome, 'STALE');
  assert.equal(lapsed.refusal.result.code, 'ISSUER_CHAIN_STALE');

  zeroEffect('b3b-issuern');
  await assertDurableStoreUntouched();
});

// ---------------------------------------------------------------------------
// NF04 — runtime Activation fact distinct from Binding + issuer currentness/SoD.
// ---------------------------------------------------------------------------
test('V08-NF04-P activation as a distinct fact admits the exact approved bytes behind the Host gate', async () => {
  const binding = bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest });
  const admitted = await admitForExecution({
    designation: b3bDesignation(),
    binding,
    activation: bridgedActivation(binding),
    bytes: POS,
  });
  assert.equal(admitted.admitted, true);
  // The Host executed the exact approved closure, each module exactly once.
  for (const packageId of sentinels('b3b-pos')) {
    assert.equal(sentinelCount(packageId), 1, `${packageId} evaluated exactly once behind the gate`);
  }
  const namespace = admitted.loaded.getModuleNamespace(`biz:te-b3b-pos@1.0.0`);
  assert.equal(namespace.MODULE_ID, `biz:te-b3b-pos@1.0.0`);
  // The executed bytes ARE the DAC-authorized subject: the loaded root's
  // approval covers exactly the digest the activation chain verified.
  assert.equal(POS.root.approval.subjectDigest, POS.approvedDigest);
  assert.ok(admitted.loaded.installedPackages.some((entry) => entry.moduleSha256 !== ''));
});

test('V08-NF04-N self-approval and co-hosted issuance without SoD permission deny activation with zero effects', async () => {
  const binding = bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest });
  const bytes = approvedBytes('b3b-sodn');

  const selfApproval = await admitForExecution({
    designation: b3bDesignation(),
    binding,
    activation: bridgedActivation(binding, {
      sod: rt.buildSodFacts({ subjectContributingIdentities: [APPROVAL_ISSUER] }),
    }),
    bytes,
  });
  assert.equal(selfApproval.admitted, false);
  assert.ok(selfApproval.refusal.stage === 'activation');
  assert.equal(selfApproval.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(selfApproval.refusal.result.code, 'SELF_APPROVAL');

  const sodMissing = await admitForExecution({
    designation: b3bDesignation(),
    binding,
    activation: bridgedActivation(binding, {
      sod: rt.buildSodFacts({
        subjectContributingIdentities: [rt.IDENTITY.composer],
        coHostingGroups: [[rt.IDENTITY.composer, APPROVAL_ISSUER]],
        explicitSodPermissionEstablished: false,
        coLocationDisclosed: true,
      }),
    }),
    bytes,
  });
  assert.equal(sodMissing.admitted, false);
  assert.ok(sodMissing.refusal.stage === 'activation');
  assert.equal(sodMissing.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(sodMissing.refusal.result.code, 'SOD_PERMISSION_MISSING');

  zeroEffect('b3b-sodn');
  await assertDurableStoreUntouched();
});

test('V08-NF04-N stale binding-reuse currentness and a wrong bound binding deny activation', async () => {
  const binding = bridgedBinding(POS, { authorizedDigest: POS.approvedDigest, actualDigest: POS.approvedDigest });
  const bytes = approvedBytes('b3b-stalen');
  const staleCurrentness = { state: 'stale', establishedAt: 85, assertedBy: [rt.IDENTITY.witness] };

  const stale = await admitForExecution({
    designation: b3bDesignation(),
    binding,
    activation: bridgedActivation(binding, {
      bindingReuseCurrentness: staleCurrentness,
      activationRequestSubject: {
        targetBindingIdentity: 'binding/b3b-record-1',
        targetManifestIdentity: POS.manifestIdentity,
        targetManifestContentDigest: POS.approvedDigest,
        reliedBindingCurrentness: staleCurrentness,
      },
    }),
    bytes,
  });
  assert.equal(stale.admitted, false);
  assert.ok(stale.refusal.stage === 'activation');
  assert.equal(stale.refusal.result.outcome, 'STALE');

  const wrongBinding = await admitForExecution({
    designation: b3bDesignation(),
    binding,
    activation: bridgedActivation(binding, { boundBindingIdentity: 'binding/foreign-record-b3b' }),
    bytes,
  });
  assert.equal(wrongBinding.admitted, false);
  assert.ok(wrongBinding.refusal.stage === 'activation');
  assert.equal(wrongBinding.refusal.result.outcome, 'FAIL_CLOSED');
  assert.equal(wrongBinding.refusal.result.code, 'SUBJECT_MISMATCH');

  zeroEffect('b3b-stalen');
  await assertDurableStoreUntouched();
});
