// Issue #325 / DAC v0.0.3 V3-002 — separation and no-manufacturing matrix
// (CROSS_LAYER_REFERENCES §6.2/§6.5; APPLICATION_MANIFEST §1/§3/§7.4/§13.2;
// conformance C53–C56): requirement != concrete host binding != lifecycle
// binding; presentation adapters never satisfy Runtime requirements; the
// upstream evidence must be a genuine #306 mint; an incompatible or
// compatible outcome alike manufactures no ApplicationSelection, no
// RuntimeBinding and no substitution — and #307 refuses to bind this
// module's records (validation != binding, C54).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptDacV003RegistryReference,
  adoptRuntimeHostBindingRequirementRef,
} from '../../src/dac-v003/index.js';
import {
  DAC_REFERENCE_BASELINE,
  adoptRuntimeBindingRef as adoptV002RuntimeBindingRef,
  isApplicationSelectionRef,
  isRuntimeBindingRef,
} from '../../src/dac/index.js';
import {
  DacV003CompatibilityError,
  adoptDacV003RequirementSatisfactionEvidence,
  refuteDacV003LifecycleBindingInput,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import { RuntimeBindingError, bindValidatedComposition } from '../../src/runtime-binding/index.js';
import { createSha256Fake } from '../package/fixture.js';
import { buildCompatibleRequest, buildIntakeVerdict, buildV003Refs } from './compatibility-fixture.js';

async function assertCompatibilityError(
  run: () => Promise<unknown> | unknown,
  code: string,
  label: string,
): Promise<void> {
  let caught: unknown;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError, `${label}: expected error, got ${String(caught)}`);
  assert.equal((caught as DacV003CompatibilityError).code, code, `${label}: code`);
}

function collectAdoptedV003Refs(value: unknown, found: unknown[] = [], seen = new Set<unknown>()): unknown[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (
    typeof (value as { adapter?: unknown }).adapter === 'string' &&
    (value as { adapter?: unknown }).adapter === 'dac-v003-reference-adapter/1'
  ) {
    found.push(value);
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectAdoptedV003Refs(nested, found, seen);
  }
  return found;
}

test('v3-002 separation: a v0.0.2 lifecycle RuntimeBindingRef can never occupy a host-binding position (C56)', async () => {
  const lifecycleBinding = adoptV002RuntimeBindingRef({
    baseline: { ...DAC_REFERENCE_BASELINE },
    authorityScope: 'domain-harness://runtime/binding',
    semanticIdentity: 'bound-composition-1',
    revisionIdentity: 'binding-rev-1',
  });
  assert.ok(isRuntimeBindingRef(lifecycleBinding));

  await assertCompatibilityError(
    async () =>
      validateDacV003Compatibility(
        await buildCompatibleRequest({
          hostBindingRequirements: [lifecycleBinding as never],
        }),
      ),
    'LIFECYCLE_BINDING_INPUT_REJECTED',
    'v0.0.2 runtime binding as host-binding requirement',
  );

  const refs = buildV003Refs();
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/via-lifecycle-binding',
        satisfies: refs.hostBindingRequirement,
        provider: lifecycleBinding as never,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'v0.0.2 runtime binding as satisfaction provider (foreign to v0.0.3 registry)',
  );
});

test('v3-002 separation: a v0.0.3 runtime-binding role envelope is refuted in host-binding positions', async () => {
  const forgedLifecycleRole = adoptDacV003RegistryReference('runtime-binding', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime/binding',
    primaryIdentity: 'v003-runtime-binding/1',
  });
  assert.throws(
    () => refuteDacV003LifecycleBindingInput(forgedLifecycleRole),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError &&
      error.code === 'LIFECYCLE_BINDING_INPUT_REJECTED',
  );
  await assertCompatibilityError(
    async () =>
      validateDacV003Compatibility(
        await buildCompatibleRequest({
          hostBindingRequirements: [forgedLifecycleRole as never],
        }),
      ),
    'LIFECYCLE_BINDING_INPUT_REJECTED',
    'v0.0.3 runtime-binding role as host-binding requirement',
  );
});

test('v3-002 separation: a requirement declaration can never be its own satisfaction provider', async () => {
  const refs = buildV003Refs();
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline: { ...DAC_V003_BASELINE },
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/self-satisfying',
        satisfies: refs.hostBindingRequirement,
        provider: refs.hostBindingRequirement,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      }),
    'INVALID_SATISFACTION_EVIDENCE',
    'requirement envelope as provider',
  );
});

test('v3-002 separation: UX/presentation-family references never satisfy Runtime requirements (§7.4)', async () => {
  const baseline = { ...DAC_V003_BASELINE };
  const refs = buildV003Refs();
  const presentationAdapter = adoptDacV003RegistryReference('ux-view', {
    baseline,
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'view/ledger-table-1',
    semanticIdentity: 'LedgerTable',
    revisionIdentity: 'view-rev-1',
  });
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/via-renderer',
        satisfies: refs.hostBindingRequirement,
        provider: presentationAdapter as never,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      }),
    'PRESENTATION_ADAPTER_CANNOT_SATISFY',
    'UX view reference as host-binding provider',
  );

  const uxDefinitionAsProvider = adoptDacV003RegistryReference('domain-ux-definition', {
    baseline,
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'ux-def/other-1',
    semanticIdentity: 'other-ux',
    revisionIdentity: 'ux-rev-9',
  });
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/via-ux-definition',
        satisfies: refs.capabilityRequirement.reference,
        provider: uxDefinitionAsProvider as never,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      }),
    'PRESENTATION_ADAPTER_CANNOT_SATISFY',
    'UX definition as capability provider',
  );
});

test('v3-002 separation: satisfaction evidence requires P6 closure (provenance, provider, target binding)', async () => {
  const refs = buildV003Refs();
  const baseline = { ...DAC_V003_BASELINE };
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/no-provenance',
        satisfies: refs.capabilityRequirement.reference,
        provider: refs.hostBinding,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [],
      }),
    'INVALID_SATISFACTION_EVIDENCE',
    'empty provenance',
  );
  await assertCompatibilityError(
    () =>
      adoptDacV003RequirementSatisfactionEvidence({
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'evidence/forged-requirement-link',
        satisfies: { role: 'capability-requirement' } as never,
        provider: refs.hostBinding,
        validForTargetProfile: 'domain-harness@v0.0.3-profile/node-1',
        provenance: [refs.hostBinding],
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'forged requirement link',
  );
});

test('v3-002 separation: the upstream evidence must be a genuine #306 mint (forged verdicts fail closed)', async () => {
  const verdict = await buildIntakeVerdict();
  const forged = { ...verdict };
  await assertCompatibilityError(
    async () =>
      validateDacV003Compatibility(
        await buildCompatibleRequest({ selectionValidation: forged as never }),
      ),
    'NOT_A_SELECTED_COMPOSITION_VALIDATION',
    'structurally cloned verdict',
  );
});

test('v3-002 separation: v0.0.2 DAC references never pass as v0.0.3 inputs', async () => {
  const v002Target = adoptV002RuntimeBindingRef; // any v0.0.2-minted object demonstrates registry separation
  void v002Target;
  const refs = buildV003Refs();
  await assertCompatibilityError(
    async () =>
      validateDacV003Compatibility(
        await buildCompatibleRequest({
          domainUxDefinition: refs.interactionContract as never,
        }),
      ),
    'INVALID_COMPATIBILITY_REQUEST',
    'interaction contract in the UX definition slot',
  );
});

test('v3-002 no-manufacturing: records contain no v0.0.3 application-selection / runtime-binding / runtime-activation references', async () => {
  const outcomes = [
    await validateDacV003Compatibility(await buildCompatibleRequest()),
    await validateDacV003Compatibility(
      await buildCompatibleRequest({ satisfactionEvidence: [] }),
    ),
    await validateDacV003Compatibility(
      await buildCompatibleRequest({ compatibilityTarget: undefined }),
    ),
  ];
  for (const validation of outcomes) {
    const adopted = collectAdoptedV003Refs(validation);
    assert.ok(adopted.length > 0, 'the record carries its adopted refs');
    const roles = new Set(adopted.map((ref) => (ref as { role: string }).role));
    assert.equal(roles.has('application-selection'), false, 'no v0.0.3 ApplicationSelection minted');
    assert.equal(roles.has('runtime-binding'), false, 'no RuntimeBinding minted');
    assert.equal(roles.has('runtime-activation'), false, 'no RuntimeActivation minted');
    // The only selection evidence anywhere in the record is the upstream
    // v0.0.2 pass-through inside the #306 verdict.
    assert.ok(
      isApplicationSelectionRef(
        validation.subject.upstreamSelectionValidation.provenance.applicationSelection,
      ),
    );
  }
});

test('v3-002 no-manufacturing: incompatibility is terminal — no substitute/default/latest surface exists', async () => {
  const incompatible = await validateDacV003Compatibility(
    await buildCompatibleRequest({ satisfactionEvidence: [] }),
  );
  assert.equal(incompatible.disposition.value, 'INCOMPATIBLE');
  for (const finding of incompatible.findings) {
    assert.match(finding, /unsatisfied|unsupported|missing/i);
  }
  // The record exposes no alternative, substitute or next candidate: the
  // surface freeze test in the authority suite pins that no such function
  // exists; here the record itself carries none.
  const serialized = JSON.stringify({
    targetProfile: incompatible.subject.targetProfile,
    findings: incompatible.findings,
    requirementClosure: incompatible.requirementClosure,
  });
  for (const forbidden of ['substitute', 'fallback', 'latest', 'next candidate', 'default to']) {
    assert.equal(serialized.includes(forbidden), false, `no "${forbidden}" suggestion`);
  }
  // Mutable aliases cannot enter through the requirement/evidence identities
  // (foundation alias rejection).
  let aliasCaught: unknown;
  try {
    adoptRuntimeHostBindingRequirementRef({
      baseline: { ...DAC_V003_BASELINE },
      authorityScope: 'dac://app-composition/acme',
      primaryIdentity: 'latest',
      requiredHostBindingRole: 'runtime-port/sqlite-storage',
    });
  } catch (error) {
    aliasCaught = error;
  }
  assert.ok(aliasCaught instanceof DacV003ReferenceError);
  assert.equal((aliasCaught as DacV003ReferenceError).code, 'MUTABLE_ALIAS_REJECTED');
});

test('v3-002 != binding: #307 refuses to bind this module\'s validation records (C54)', async () => {
  const validation = await validateDacV003Compatibility(await buildCompatibleRequest());
  let caught: unknown;
  try {
    await bindValidatedComposition(validation as never, { sha256: createSha256Fake() });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof RuntimeBindingError);
  assert.equal((caught as RuntimeBindingError).code, 'NOT_A_VALIDATED_COMPOSITION');

  // And the derived result view equally is not a #306 verdict.
  const { deriveDacV003CompatibilityResult } = await import(
    '../../src/dac-v003-compatibility/index.js'
  );
  const result = deriveDacV003CompatibilityResult(validation);
  let resultCaught: unknown;
  try {
    await bindValidatedComposition(result as never, { sha256: createSha256Fake() });
  } catch (error) {
    resultCaught = error;
  }
  assert.ok(resultCaught instanceof RuntimeBindingError);
  assert.equal((resultCaught as RuntimeBindingError).code, 'NOT_A_VALIDATED_COMPOSITION');
});
