// Issue #329 / DAC v0.0.3 V3-005 — C53–C61 executable conformance closure:
// the Composition group over the merged #323/#325/#339/#328 surfaces —
// lifecycle-stage separation, Host-Binding role separation, requirement
// closure, UX semantic separation, external-authority identity, and the
// immutable Manifest's live-state boundary.
//
// Additive conformance evidence only: no product surface is edited here.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRequirementRef,
} from '../../src/dac-v003/index.js';
import {
  DacV003CompatibilityError,
  adoptDacV003RequirementSatisfactionEvidence,
  adoptDomainUXDefinitionRef,
  refuteDacV003LifecycleBindingInput,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import {
  DacV003ManifestError,
  adoptDacV003ApplicationManifest,
} from '../../src/dac-v003-manifest/index.js';
import {
  DacV003ExternalError,
  adoptDacV003ExternalAuthorityRef,
  refuteDacV003HarnessSideIdentityAsExternalAuthority,
} from '../../src/dac-v003-external/index.js';
import {
  buildAdoptedManifest,
  buildManifestInput,
  buildValidationFor,
  withDeclaredDigest,
} from '../dac-v003/manifest-fixture.js';
import {
  buildCompatibleRequest,
  buildV003Refs,
} from '../dac-v003/compatibility-fixture.js';
import { createSha256Fake } from '../package/fixture.js';

const baseline = { ...DAC_V003_BASELINE };

async function expectManifestError(
  fn: () => Promise<unknown> | unknown,
  code: string,
  label: string,
): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV003ManifestError,
    `${label}: expected DacV003ManifestError, got ${
      caught instanceof Error ? caught.message : String(caught)
    }`,
  );
  assert.equal((caught as DacV003ManifestError).code, code, `${label}: code`);
}

test('C53: promotion never implicitly becomes application selection — both authority steps are separately required', async () => {
  const { input, entry } = await buildManifestInput();
  // Selection coverage removed: the selected reference's lifecycle closure
  // no longer carries an application-selection authority for the entry.
  const promotionOnlySelected = adoptDacV003RegistryReference('selected-domain-data', {
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: `selected/fixture-domain@rev-000042`,
    semanticIdentity: 'fixture-domain',
    revisionIdentity: 'rev-000042',
    contentDigest: 'pkg-rev-000042',
    lifecycleAuthorityRefs: [entry.promotionEvidence],
  });
  await expectManifestError(
    () =>
      adoptDacV003ApplicationManifest(
        {
          ...input,
          selectedDomainData: [
            {
              selected: promotionOnlySelected,
              promotionEvidence: entry.promotionEvidence,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never,
        { sha256: createSha256Fake() },
      ),
    'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
    'entry whose selected closure carries promotion but not selection',
  );
  // Inverse: selection present, promotion evidence swapped for a selection
  // ref — promotion authority cannot be played by a selection authority.
  await expectManifestError(
    () =>
      adoptDacV003ApplicationManifest(
        {
          ...input,
          selectedDomainData: [
            {
              selected: entry.selected,
              promotionEvidence: entry.applicationSelection,
              applicationSelection: entry.applicationSelection,
            },
          ],
        } as never,
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'application-selection ref in the promotion-evidence position',
  );
});

test('C54: a compatibility PASS never creates binding or activation — validation stops before the later lifecycle stages', async () => {
  const validation = await buildValidationFor();
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  // The minted validation carries no binding/activation surface at all.
  for (const key of Object.keys(validation) as readonly (keyof typeof validation)[]) {
    assert.ok(
      !key.toLowerCase().includes('binding') || key === 'compatibility',
      `validation must not carry a binding/activation slot, found "${key}"`,
    );
    assert.ok(!key.toLowerCase().includes('activation'));
  }
  // Stage-4 evidence is structurally rejected from the stage-3 path.
  const runtimeBindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline,
    authorityScope: 'domain-harness://runtime/binding',
    primaryIdentity: 'binding/stage-4-1',
    semanticIdentity: 'runtime-binding',
  });
  assert.throws(
    () => refuteDacV003LifecycleBindingInput(runtimeBindingRef),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError &&
      error.code === 'LIFECYCLE_BINDING_INPUT_REJECTED',
  );
  const runtimeActivationRef = adoptDacV003RegistryReference('runtime-activation', {
    baseline,
    authorityScope: 'domain-harness://runtime/activation',
    primaryIdentity: 'activation/stage-5-1',
    semanticIdentity: 'runtime-activation',
  });
  assert.throws(
    () => refuteDacV003LifecycleBindingInput(runtimeActivationRef),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError &&
      error.code === 'LIFECYCLE_BINDING_INPUT_REJECTED',
  );
  // Binding/activation identity absorbed into manifest definition content
  // fails closed.
  const { input } = await buildManifestInput();
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          opaque: { smuggled: runtimeBindingRef },
        } as never),
        { sha256: createSha256Fake() },
      ),
    'MANIFEST_EVIDENCE_ABSORPTION',
    'runtime-binding identity inside manifest opaque content',
  );
});

test('C55: runtime contract, compatibility target and runtime implementation identities stay separately referrable', async () => {
  const { input } = await buildManifestInput();
  // The manifest primary runtime requires exactly the runtime-contract role:
  // a runtime-implementation reference in that position fails closed.
  const runtimeImplementation = adoptDacV003RegistryReference('runtime-implementation', {
    baseline,
    authorityScope: 'domain-harness://runtime',
    primaryIdentity: 'runtime-impl/domain-harness@0.3.0',
    semanticIdentity: 'domain-harness-runtime',
    revisionIdentity: '0.3.0',
    contentDigest: 'build-9f2c1',
  });
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          primaryRuntime: {
            runtimeContract: runtimeImplementation as never,
            compatibilityTarget: input.primaryRuntime.compatibilityTarget,
          },
        } as never),
        { sha256: createSha256Fake() },
      ),
    'INVALID_MANIFEST_INPUT',
    'runtime-implementation in the runtime-contract position',
  );
  // The compatibility-target position requires the P5 #325 target type; a
  // registry runtime-contract ref in that position fails closed too (the
  // non-target object cannot fill the exactly-one explicit target slot).
  const runtimeContract = adoptDacV003RegistryReference('runtime-contract', {
    baseline,
    authorityScope: 'domain-harness://runtime',
    primaryIdentity: 'runtime-contract/domain-harness@2',
    semanticIdentity: 'domain-harness/runtime-contract',
    revisionIdentity: '2',
  });
  {
    const caught = await (async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          primaryRuntime: {
            runtimeContract: input.primaryRuntime.runtimeContract,
            compatibilityTarget: runtimeContract as never,
          },
        } as never),
        { sha256: createSha256Fake() },
      ))().then(
      () => undefined,
      (error: unknown) => error,
    );
    assert.ok(
      caught instanceof DacV003ManifestError &&
        ['INVALID_MANIFEST_INPUT', 'PRIMARY_RUNTIME_CARDINALITY'].includes(caught.code),
      `runtime-contract in the compatibility-target position must fail closed, got ${
        caught instanceof Error ? caught.message : String(caught)
      }`,
    );
  }
  // The three identities are genuinely three distinct adopted references.
  assert.notEqual(
    runtimeContract.primaryIdentity,
    runtimeImplementation.primaryIdentity,
  );
  assert.notEqual(
    input.primaryRuntime.compatibilityTarget.primaryIdentity,
    runtimeContract.primaryIdentity,
  );
});

test('C56: RuntimeHostBindingRequirementRef is never a concrete Host Binding and never a lifecycle binding', async () => {
  const refs = buildV003Refs();
  const requirement = refs.hostBindingRequirement;
  const hostBinding = refs.hostBinding;
  assert.notEqual(requirement.role, hostBinding.role);
  assert.notEqual(requirement.primaryIdentity, hostBinding.primaryIdentity);
  // A requirement declaration cannot become satisfaction evidence: the
  // evidence provider position requires a runtime-family provider, and a
  // requirement reference there fails closed at evidence adoption.
  assert.throws(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/hb-requirement-as-provider',
        satisfies: refs.hostBindingRequirement,
        provider: refs.hostBindingRequirement,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      } as never),
    (error: unknown) =>
      (error instanceof DacV003CompatibilityError ||
        error instanceof DacV003ReferenceError) &&
      /INVALID_SATISFACTION_EVIDENCE|ROLE_MISMATCH|INVALID_REFERENCE/.test(
        (error as Error & { code?: string }).code ?? '',
      ),
    'requirement declaration used as satisfaction provider',
  );
  // The lifecycle binding ref is rejected from the entire compatibility path.
  const runtimeBindingRef = adoptDacV003RegistryReference('runtime-binding', {
    baseline,
    authorityScope: 'domain-harness://runtime/binding',
    primaryIdentity: 'binding/stage-4-2',
    semanticIdentity: 'runtime-binding',
  });
  assert.throws(
    () => refuteDacV003LifecycleBindingInput(runtimeBindingRef),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError &&
      error.code === 'LIFECYCLE_BINDING_INPUT_REJECTED',
  );
  // And the concrete host binding cannot be re-purposed as a requirement
  // declaration: it lacks requiredHostBindingRole.
  assert.throws(
    () =>
      adoptRuntimeHostBindingRequirementRef({
        baseline,
        authorityScope: 'domain-harness://host-bindings',
        primaryIdentity: 'hb/node-sqlite-1',
        // No requiredHostBindingRole: a concrete binding is not a requirement.
        semanticIdentity: 'node-sqlite-adapter',
      } as never),
    (error: unknown) =>
      error instanceof DacV003ReferenceError && error.code === 'INVALID_REFERENCE',
  );
});

test('C57: a required capability/port/host-binding without exact satisfaction yields INCOMPATIBLE, never COMPATIBLE', async () => {
  const refs = buildV003Refs();
  // All requirements declared, no evidence at all.
  const noEvidence = await validateDacV003Compatibility(
    await buildCompatibleRequest({ satisfactionEvidence: [] }),
  );
  assert.equal(noEvidence.disposition.value, 'INCOMPATIBLE');
  assert.ok(
    noEvidence.findings.some((f) => f.includes('is unsatisfied') && f.includes('C57')),
    'the unsatisfied required requirements are named in the findings',
  );
  assert.equal(noEvidence.requirementClosure.filter((r) => r.effectiveStrength === 'required').length, 3);
  assert.ok(
    noEvidence.requirementClosure.every((r) => r.satisfiedBy.length === 0),
    'no requirement is satisfied',
  );
  // Evidence bound to a different target profile proves nothing here: a
  // genuinely minted evidence whose exact target binding is another profile.
  const foreignProfileEvidence = adoptDacV003RequirementSatisfactionEvidence({
    baseline,
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/hb-foreign-profile',
    satisfies: refs.hostBindingRequirement,
    provider: refs.hostBinding,
    validForTargetProfile: 'other-runtime@profile-x',
    provenance: [refs.hostBinding],
  });
  const foreignProfile = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      satisfactionEvidence: [
        refs.capabilityEvidence,
        refs.portEvidence,
        foreignProfileEvidence,
      ],
    }),
  );
  assert.equal(foreignProfile.disposition.value, 'INCOMPATIBLE');
  assert.ok(
    foreignProfile.findings.some((f) => f.includes('is unsatisfied')),
    'target-bound evidence for another profile satisfies nothing',
  );
});

test('C58: selected UX lacking a required runtime interaction semantic contract role is INCOMPATIBLE and blocks later bind/activate', async () => {
  // The standard request requires domain-intent + semantic-target + ux-view;
  // drop one required role from the interaction coverage.
  const missingIntent = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      interactionCoverage: ['semantic-target', 'ux-view', 'ux-outcome'],
    }),
  );
  assert.equal(missingIntent.disposition.value, 'INCOMPATIBLE');
  assert.deepEqual(missingIntent.ux.missingRequiredRoles, ['domain-intent']);
  assert.ok(
    missingIntent.findings.some((f) => f.includes('domain-intent') && f.includes('C58')),
  );
  // Full coverage of exactly the required roles is COMPATIBLE — the closure
  // is a coverage rule, not a mandate to cover every primitive.
  const full = await buildValidationFor();
  assert.equal(full.disposition.value, 'COMPATIBLE');
  assert.deepEqual(full.ux.missingRequiredRoles, []);
});

test('C59: renderer/DOM/component identity never substitutes the Domain UX semantic identity', async () => {
  // A UX semantic definition requires semantic + revision identity (P1): a
  // floating renderer identity cannot stand in as the semantic definition.
  assert.throws(
    () =>
      adoptDomainUXDefinitionRef({
        baseline,
        authorityScope: 'dac://domain-ux/acme',
        primaryIdentity: 'ux-def/renderer-only',
        // no semanticIdentity / revisionIdentity: renderer identity alone
      } as never),
    (error: unknown) =>
      (error instanceof DacV003ReferenceError ||
        error instanceof DacV003CompatibilityError) &&
      /PROFILE_REQUIREMENT_UNMET|INVALID_REFERENCE/.test(
        (error as Error & { code?: string }).code ?? '',
      ),
    'renderer identity alone is not a UX semantic definition',
  );
  // Renderer identity can only ever ride in non-authoritative locator hints.
  const uxDefinition = adoptDomainUXDefinitionRef({
    baseline,
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'ux-def/tally-ledger-1',
    semanticIdentity: 'tally-ledger-ux',
    revisionIdentity: 'ux-rev-3',
    locatorHints: ['dom:#submit-button', 'component:SubmitButton'],
  });
  assert.equal(uxDefinition.semanticIdentity, 'tally-ledger-ux');
  assert.deepEqual([...uxDefinition.locatorHints], [
    'dom:#submit-button',
    'component:SubmitButton',
  ]);
  // The manifest UX closure has no renderer slot at all: exactly one Domain
  // UX definition and one semantic interaction contract.
  const manifest = await buildAdoptedManifest();
  assert.deepEqual(Object.keys(manifest.ux).sort(), [
    'domainUxDefinition',
    'runtimeInteractionContract',
  ]);
  assert.equal(manifest.ux.domainUxDefinition.role, 'domain-ux-definition');
  assert.equal(manifest.ux.runtimeInteractionContract.role, 'runtime-interaction-contract');
  assert.notEqual(
    manifest.ux.domainUxDefinition.primaryIdentity,
    manifest.ux.runtimeInteractionContract.primaryIdentity,
  );
});

test('C60: runtime implementation identity never substitutes external Business SoR identity', async () => {
  const runtimeImplementation = adoptDacV003RegistryReference('runtime-implementation', {
    baseline,
    authorityScope: 'domain-harness://runtime',
    primaryIdentity: 'runtime-impl/domain-harness@0.3.0',
    semanticIdentity: 'domain-harness-runtime',
    revisionIdentity: '0.3.0',
  });
  // The external-operation surface refutes Harness-side identity outright.
  assert.throws(
    () => refuteDacV003HarnessSideIdentityAsExternalAuthority(runtimeImplementation),
    (error: unknown) =>
      error instanceof DacV003ExternalError && error.code === 'EXTERNAL_IDENTITY_FORBIDDEN',
  );
  // The manifest external-authority declaration requires a genuine #327
  // ExternalAuthorityRef: a runtime implementation ref there fails closed.
  const { input } = await buildManifestInput();
  await expectManifestError(
    async () =>
      adoptDacV003ApplicationManifest(
        await withDeclaredDigest({
          ...input,
          externalAuthority: {
            applicability: 'APPLICABLE',
            declarations: [{ authority: runtimeImplementation as never }],
          },
        } as never),
        { sha256: createSha256Fake() },
      ),
    'EXTERNAL_IDENTITY_SUBSTITUTION',
    'runtime implementation identity as external Business SoR authority',
  );
  // And a genuine external authority ref is NOT refuted (negative control).
  const genuineExternal = adoptDacV003ExternalAuthorityRef({
    baseline,
    authorityId: 'sor://billing/acme-1',
    authorityScope: 'ext://billing/acme',
  });
  assert.doesNotThrow(() =>
    refuteDacV003HarnessSideIdentityAsExternalAuthority(genuineExternal),
  );
});

test('C61: live external operation/attempt/provider-job/reconciliation state embedded in the immutable Manifest fails closed', async () => {
  const { input } = await buildManifestInput();
  const liveAttempt = adoptDacV003RegistryReference('attempt', {
    baseline,
    authorityScope: 'app/checkout/integration',
    primaryIdentity: 'attempt-0001',
    logicalOperationIdentity: 'logical-op-0001',
  });
  const liveProviderJob = adoptDacV003RegistryReference('provider-operation', {
    baseline,
    authorityScope: 'ext://billing/acme',
    primaryIdentity: 'provider-job-77',
  });
  const liveReconciliation = adoptDacV003RegistryReference('reconciliation', {
    baseline,
    authorityScope: 'app/checkout/reconciliation',
    primaryIdentity: 'recon-0001',
  });
  for (const [label, live] of [
    ['live attempt', liveAttempt],
    ['live provider job', liveProviderJob],
    ['live reconciliation', liveReconciliation],
  ] as const) {
    await expectManifestError(
      async () =>
        adoptDacV003ApplicationManifest(
          await withDeclaredDigest({
            ...input,
            manifestIdentity: `manifest://acme/tally-ledger/7-${label.replace(/ /g, '-')}`,
            opaque: { liveOperations: { record: live } },
          } as never),
          { sha256: createSha256Fake() },
        ),
      'LIVE_EXTERNAL_STATE_ABSORPTION',
      `${label} inside manifest opaque content`,
    );
  }
});
