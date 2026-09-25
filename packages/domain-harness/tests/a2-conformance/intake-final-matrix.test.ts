// Issue #311 / A2 I-008 FINAL matrix — I-003 / #306 composition-intake layer.
// Executes the deferred C-cases of the incremental COVERAGE.md deferral table
// against the landed surface: exact selected-ref/package mapping fail-closed
// (C03/N02 full), mutable latest/current/head never entering an authoritative
// stage (C02/N01 flow level), Simulator PASS never becoming promotion/
// selection evidence (C07/N03 flow level), registry default never becoming
// selection (N04 flow level), no compatibility auto-substitution (C32/C37/N07
// full), runtime contract/implementation identity collapse (C23/N08 flow
// level) and capability/floating-declaration blocking (C16/N09 full).
//
// Test/doc-only: this file changes no product semantics and implements
// nothing from DAC v0.0.3 V3.
import test from 'node:test';
import {
  DacReferenceError,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  isSelectedDomainDataRef,
} from '../../src/dac/index.js';
import {
  CompositionIntakeError,
  validateSelectedComposition,
} from '../../src/composition-intake/index.js';
import { createCompiledPackage } from '../package/fixture.js';
import {
  FINAL_BASELINE,
  assertErrorCode,
  finalComposition,
  finalEnvironment,
  finalRefs,
} from './final-matrix-fixtures.js';

// ------------------------------------------------- C03 / N02 (full mapping)

test('final C03/N02: selected-ref -> package mapping fails closed on EVERY identity dimension (full)', async () => {
  const base = await finalComposition();

  // Digest drift: same semantic identity + same revision, different content.
  const driftedDigest = finalRefs({
    domainId: base.compiled.manifest.domainId,
    domainVersion: base.compiled.manifest.domainVersion,
    packageId: 'fixture-sha256:drifted-body',
  });
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        promotionDecision: driftedDigest.promotionDecision,
        applicationSelection: driftedDigest.applicationSelection,
        selectedDomainData: driftedDigest.selectedDomainData,
      }),
    CompositionIntakeError,
    'SELECTED_IDENTITY_MISMATCH',
    'digest drift vs packageId',
  );

  // Revision drift: selected pins rev-000042, an exact different package
  // revision rev-000043 of the same domain is presented.
  const otherRevision = await createCompiledPackage('rev-000043');
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        compiledPackage: otherRevision,
      }),
    CompositionIntakeError,
    'SELECTED_IDENTITY_MISMATCH',
    'revision drift vs domainVersion',
  );

  // Provenance-internal drift: promotion pins a different revision than the
  // selected identity (chain contradiction, not just package mismatch).
  const chain = finalRefs({
    domainId: base.compiled.manifest.domainId,
    domainVersion: 'rev-000041',
    packageId: base.compiled.manifest.packageId,
  });
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        promotionDecision: chain.promotionDecision,
      }),
    CompositionIntakeError,
    'PROVENANCE_CHAIN_MISMATCH',
    'promotion revision drift',
  );

  // Selection provenance that does not pin the digest cannot reach validation.
  const unpinnedSelection = adoptApplicationSelectionRef({
    baseline: FINAL_BASELINE,
    semanticIdentity: base.compiled.manifest.domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: base.compiled.manifest.domainVersion,
  });
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        applicationSelection: unpinnedSelection,
      }),
    CompositionIntakeError,
    'PROVENANCE_CHAIN_MISMATCH',
    'selection without digest pin',
  );
});

// ------------------------------------------- C02 / N01 (flow-level aliases)

test('final C02/N01: a mutable latest/current/head identity cannot reach stage-3 validation through any slot', async () => {
  const base = await finalComposition();

  // Every lifecycle slot is a #305-adopted ref, so an aliased identity dies at
  // adoption — before any mapping/validation logic runs.
  for (const alias of ['latest', 'current', 'head'] as const) {
    await assertErrorCode(
      () =>
        validateSelectedComposition({
          ...base.request,
          selectedDomainData: finalRefs({
            domainId: base.compiled.manifest.domainId,
            domainVersion: alias,
            packageId: base.compiled.manifest.packageId,
          }).selectedDomainData,
        }),
      DacReferenceError,
      'MUTABLE_ALIAS_REJECTED',
      `selectedDomainData revisionIdentity "${alias}"`,
    );
  }

  // The declared target cannot float to "whatever validated": a target pinned
  // to a different concrete profile than the environment fails closed.
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        compatibilityTarget: adoptCompatibilityTargetRef({
          baseline: FINAL_BASELINE,
          semanticIdentity: 'domain-harness/compatibility-target/node-canary',
          authorityScope: 'domain-harness://runtime/compatibility',
          revisionIdentity: 'node-canary',
        }),
      }),
    CompositionIntakeError,
    'COMPATIBILITY_TARGET_MISMATCH',
    'target profile drift fails closed (no floating target)',
  );
});

// -------------------------------------- C07 / N03 (Simulator PASS shortcut)

test('final C07/N03: a Simulator PASS is never promotion or selection evidence at the flow level', async () => {
  const base = await finalComposition();

  // 1) A raw simulator output object in a provenance slot fails the #305 role
  //    guard — it is not adopted lifecycle evidence of any role.
  const simulatorPass = {
    simulator: 'domain-simulator/1',
    verdict: 'PASS',
    domainId: base.compiled.manifest.domainId,
    revision: base.compiled.manifest.domainVersion,
    digest: base.compiled.manifest.packageId,
  };
  await assertErrorCode(
    () => validateSelectedComposition({ ...base.request, promotionDecision: simulatorPass as never }),
    DacReferenceError,
    'ROLE_MISMATCH',
    'raw simulator PASS as promotion decision',
  );

  // 2) A simulator PASS smuggled in opaque never substitutes identity: the
  //    ref is adoptable, but identity drift still fails closed (opaque is
  //    preserved, never interpreted — pinned by #305/#331).
  const opaqueSmuggler = adoptPromotionDecisionRef({
    baseline: FINAL_BASELINE,
    semanticIdentity: 'domain:other:entirely',
    authorityScope: 'dac://governance/promotion',
    revisionIdentity: 'rev-000099',
    contentDigest: 'fixture-sha256:other',
    opaque: { simulatorVerdict: 'PASS', source: 'domain-simulator' },
  });
  await assertErrorCode(
    () => validateSelectedComposition({ ...base.request, promotionDecision: opaqueSmuggler }),
    CompositionIntakeError,
    'PROVENANCE_CHAIN_MISMATCH',
    'opaque simulator PASS does not authorize drifted identity',
  );

  // 3) There is no intake input that takes simulator output at all: the only
  //    request shape consumes adopted refs + a concrete compiled package
  //    (pinned structurally by final-surface-freeze.test.ts).
});

// -------------------------------------------- N04 (registry default flow)

test('final N04: a registry default never becomes application selection at the flow level', async () => {
  const base = await finalComposition();

  // A registry-shaped object presented as the compiled package fails package
  // integrity: defaultPackageId/order are not manifest identity fields.
  const registryShaped = {
    manifest: {
      domainId: base.compiled.manifest.domainId,
      domainVersion: base.compiled.manifest.domainVersion,
      packageId: base.compiled.manifest.packageId,
      defaultPackageId: base.compiled.manifest.packageId,
      defaultRevision: 'latest',
      order: [base.compiled.manifest.packageId],
    },
    bindings: {},
  };
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        compiledPackage: registryShaped as never,
      }),
    CompositionIntakeError,
    'INVALID_COMPOSITION_PACKAGE',
    'registry-shaped package with default fields',
  );

  // The intake request has no registry, default or fallback slot at all: the
  // only selection evidence inside a verdict is the upstream pass-through
  // object (pinned by the nominal test and the freeze suite).
});

// ------------------------------- C32 / C37 / N07 (auto-substitution, full)

test('final C32/C37/N07: incompatibility is terminal — no auto-latest, default or other-revision substitution', async () => {
  const base = await finalComposition();

  // A DIFFERENT exact revision that maps cleanly onto its own package is not
  // silently substituted for the selected one: identity wins, mapping fails.
  const otherRevision = await createCompiledPackage('rev-000043');
  await assertErrorCode(
    () => validateSelectedComposition({ ...base.request, compiledPackage: otherRevision }),
    CompositionIntakeError,
    'SELECTED_IDENTITY_MISMATCH',
    'no substitution of another exact revision',
  );

  // Genuine incompatibility (declared contract major != package contract
  // major) is terminal with the substitution-refusing message. The refs are
  // pinned to the incompatible package's OWN exact identity so the mapping
  // passes and the incompatibility itself decides.
  const incompatible = await createCompiledPackage('rev-000043', { runtimeContractMajor: 3 });
  const incompatibleRefs = finalRefs({
    domainId: incompatible.manifest.domainId,
    domainVersion: incompatible.manifest.domainVersion,
    packageId: incompatible.manifest.packageId,
  });
  const incompatibleError = await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        promotionDecision: incompatibleRefs.promotionDecision,
        applicationSelection: incompatibleRefs.applicationSelection,
        selectedDomainData: incompatibleRefs.selectedDomainData,
        compiledPackage: incompatible,
      }),
    CompositionIntakeError,
    'INCOMPATIBLE_SELECTED_COMPOSITION',
    'contract-major incompatibility',
  );
  if (!incompatibleError.message.includes('never substitutes')) {
    throw new Error(
      `incompatibility error must refuse substitution explicitly, got: ${incompatibleError.message}`,
    );
  }

  // The verdict only exists for the exact validated package — a PASS can never
  // be read against a different package object.
  const verdict = await validateSelectedComposition(base.request);
  if (verdict.validatedPackage !== base.compiled) {
    throw new Error('verdict must reference the exact submitted package object');
  }
  if (!isSelectedDomainDataRef(verdict.selectedDomainData)) {
    throw new Error('verdict carries the exact selected ref');
  }
});

// ------------------------------- C23 / N08 (contract/implementation collapse)

test('final C23/N08: runtime contract and implementation cannot collapse into one identity at the flow level', async () => {
  const base = await finalComposition();

  // Identical full identity tuples for contract and implementation refs.
  const sameTuple = {
    baseline: FINAL_BASELINE,
    semanticIdentity: 'domain-harness/runtime-contract',
    authorityScope: 'domain-harness://runtime',
    revisionIdentity: '2',
    contentDigest: 'build-0d4d51e',
  };
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        runtimeContract: adoptRuntimeContractRef(sameTuple),
        runtimeImplementation: adoptRuntimeImplementationRef(sameTuple),
      }),
    CompositionIntakeError,
    'ROLE_IDENTITY_COLLAPSE',
    'contract == implementation tuple',
  );
});

// ------------------------------------- C16 / N09 (capability/floating block)

test('final C16/N09: capability gaps and floating implementation declarations block composition', async () => {
  const base = await finalComposition();

  // A capability the environment does not provide blocks the package (refs
  // pinned to that package's own identity so the capability gap decides).
  const capabilityHeavy = await createCompiledPackage('rev-000043', {
    requiredCapabilities: ['tool.host-local@1'],
  });
  const capabilityRefs = finalRefs({
    domainId: capabilityHeavy.manifest.domainId,
    domainVersion: capabilityHeavy.manifest.domainVersion,
    packageId: capabilityHeavy.manifest.packageId,
  });
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        promotionDecision: capabilityRefs.promotionDecision,
        applicationSelection: capabilityRefs.applicationSelection,
        selectedDomainData: capabilityRefs.selectedDomainData,
        compiledPackage: capabilityHeavy,
        environment: finalEnvironment({ hostCapabilities: [] }),
      }),
    CompositionIntakeError,
    'INCOMPATIBLE_SELECTED_COMPOSITION',
    'missing capability blocks',
  );

  // "Whatever the runtime currently provides" is not a declarable target:
  // implementation dimensions are mandatory (N09).
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        environment: finalEnvironment({
          implementation: { identity: '', version: '0.3.0', build: 'b' },
        }),
      }),
    CompositionIntakeError,
    'INVALID_COMPOSITION_INTAKE',
    'floating implementation identity rejected',
  );

  // A declared implementation ref that pins no concrete version/build never
  // matches a concrete environment.
  const unpinnedImpl = adoptRuntimeImplementationRef({
    baseline: FINAL_BASELINE,
    semanticIdentity: 'domain-harness-runtime',
    authorityScope: 'domain-harness://runtime',
  });
  await assertErrorCode(
    () =>
      validateSelectedComposition({
        ...base.request,
        runtimeImplementation: unpinnedImpl,
      }),
    CompositionIntakeError,
    'RUNTIME_IMPLEMENTATION_MISMATCH',
    'implementation ref without version/build pin',
  );
});
