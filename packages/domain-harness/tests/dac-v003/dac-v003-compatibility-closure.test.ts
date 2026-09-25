// Issue #325 / DAC v0.0.3 V3-002 — Capability / Port / Host-Binding
// requirement-vs-satisfaction closure (APPLICATION_MANIFEST §3/§8/§11;
// conformance C57): a validator emits COMPATIBLE only when every required
// and applicable requirement in the closed requirement set has matching
// exact target-bound satisfaction evidence. Missing required evidence can
// only produce INCOMPATIBLE — emitting COMPATIBLE anyway would be a
// conformance failure. Optional may be unsatisfied; conditional applies only
// through its auditable declared condition.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DacV003CompatibilityError,
  adoptDacV003CapabilityRequirement,
  adoptDacV003PortRequirement,
  adoptDacV003RequirementSatisfactionEvidence,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import { DAC_V003_BASELINE } from '../../src/dac-v003/index.js';
import {
  V003_TARGET_PROFILE,
  buildCompatibleRequest,
  buildV003Refs,
} from './compatibility-fixture.js';

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
  assert.ok(caught instanceof DacV003CompatibilityError, `${label}: expected error`);
  assert.equal((caught as DacV003CompatibilityError).code, code, `${label}: code`);
}

test('v3-002 closure: every declared requirement satisfied => COMPATIBLE with full evidence trail', async () => {
  const validation = await validateDacV003Compatibility(await buildCompatibleRequest());
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.equal(validation.requirementClosure.length, 3);
  const kinds = validation.requirementClosure.map((entry) => entry.kind).sort();
  assert.deepEqual(kinds, ['capability', 'host-binding', 'port']);
  for (const entry of validation.requirementClosure) {
    assert.equal(entry.effectiveStrength, 'required');
    assert.equal(entry.satisfiedBy.length, 1);
  }
});

test('v3-002 closure: missing required capability evidence => INCOMPATIBLE, never COMPATIBLE (C57)', async () => {
  const refs = buildV003Refs();
  const request = await buildCompatibleRequest({
    satisfactionEvidence: [refs.portEvidence, refs.hostBindingEvidence],
  });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  const capability = validation.requirementClosure.find((e) => e.kind === 'capability');
  assert.ok(capability);
  assert.deepEqual(capability.satisfiedBy, []);
  assert.ok(
    validation.findings.some((f) =>
      f.includes('required capability requirement "cap-req/persistence-1" is unsatisfied')),
    'finding names the unsatisfied requirement and C57',
  );
});

test('v3-002 closure: missing required Port and Host-Binding evidence => INCOMPATIBLE (C57)', async () => {
  const portMissing = await validateDacV003Compatibility(
    await buildCompatibleRequest({ portRequirements: [] , satisfactionEvidence: [] }),
  );
  // No declared port requirement at all: closure has nothing to check there.
  assert.equal(portMissing.disposition.value, 'INCOMPATIBLE', 'host-binding evidence also missing');

  const refs = buildV003Refs();
  const hostBindingUnsatisfied = await validateDacV003Compatibility(
    await buildCompatibleRequest({ satisfactionEvidence: [refs.capabilityEvidence, refs.portEvidence] }),
  );
  assert.equal(hostBindingUnsatisfied.disposition.value, 'INCOMPATIBLE');
  const hostBinding = hostBindingUnsatisfied.requirementClosure.find(
    (e) => e.kind === 'host-binding',
  );
  assert.ok(hostBinding);
  assert.deepEqual(hostBinding.satisfiedBy, []);
  assert.ok(
    hostBindingUnsatisfied.findings.some((f) =>
      f.includes('required host-binding requirement "hb-req/sqlite-storage-1" is unsatisfied')),
  );
});

test('v3-002 closure: optional requirement may be unsatisfied without incompatibility', async () => {
  const refs = buildV003Refs();
  const optional = adoptDacV003CapabilityRequirement({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'cap-req/telemetry-1',
    semanticIdentity: 'capability/telemetry',
    strength: 'optional',
  });
  const request = await buildCompatibleRequest({
    capabilityRequirements: [refs.capabilityRequirement, optional],
    satisfactionEvidence: [
      refs.capabilityEvidence,
      refs.portEvidence,
      refs.hostBindingEvidence,
    ],
  });
  const validation = await validateDacV003Compatibility(request);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  const telemetry = validation.requirementClosure.find(
    (e) => e.requirementIdentity === 'cap-req/telemetry-1',
  );
  assert.ok(telemetry);
  assert.equal(telemetry.effectiveStrength, 'optional');
  assert.deepEqual(telemetry.satisfiedBy, []);
});

test('v3-002 closure: conditional requirement applies only through its declared auditable condition', async () => {
  const conditional = adoptDacV003CapabilityRequirement({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'cap-req/offline-queue-1',
    semanticIdentity: 'capability/offline-queue',
    strength: 'conditional',
    condition: 'composition.declares-offline-mode',
  });

  // Condition not declared to hold: not applicable, unsatisfied is fine.
  const notApplicable = await validateDacV003Compatibility(
    await buildCompatibleRequest({ capabilityRequirements: [conditional] }),
  );
  assert.equal(notApplicable.disposition.value, 'COMPATIBLE');
  const entry = notApplicable.requirementClosure.find(
    (e) => e.requirementIdentity === 'cap-req/offline-queue-1',
  );
  assert.equal(entry?.effectiveStrength, 'not-applicable');

  // Condition declared to hold but no evidence: required => INCOMPATIBLE.
  const applicable = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      capabilityRequirements: [conditional],
      applicableConditions: ['composition.declares-offline-mode'],
    }),
  );
  assert.equal(applicable.disposition.value, 'INCOMPATIBLE');
  const applicableEntry = applicable.requirementClosure.find(
    (e) => e.requirementIdentity === 'cap-req/offline-queue-1',
  );
  assert.equal(applicableEntry?.effectiveStrength, 'required');
});

test('v3-002 closure: satisfaction evidence is exact-target-bound; wrong profile does not count', async () => {
  const refs = buildV003Refs();
  const wrongTarget = adoptDacV003RequirementSatisfactionEvidence({
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://runtime/compatibility',
    primaryIdentity: 'evidence/cap-persistence-other-target',
    satisfies: refs.capabilityRequirement.reference,
    provider: refs.hostBinding,
    validForTargetProfile: 'domain-harness@v0.0.3-profile/other-host',
    provenance: [refs.hostBinding],
  });
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      satisfactionEvidence: [wrongTarget, refs.portEvidence, refs.hostBindingEvidence],
    }),
  );
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  const capability = validation.requirementClosure.find((e) => e.kind === 'capability');
  assert.deepEqual(capability?.satisfiedBy, []);
});

test('v3-002 closure: evidence linking an undeclared requirement is recorded but proves nothing', async () => {
  const refs = buildV003Refs();
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      // Only the capability requirement declared; its evidence covers it, but
      // the port/host-binding evidence links undeclared requirements.
      portRequirements: [],
      hostBindingRequirements: [],
      satisfactionEvidence: [
        refs.capabilityEvidence,
        refs.portEvidence,
        refs.hostBindingEvidence,
      ],
    }),
  );
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.equal(validation.requirementClosure.length, 1);
  assert.ok(
    validation.findings.some((f) =>
      f.includes('outside the declared closed requirement set')),
  );
});

test('v3-002 closure: a duplicated requirement identity is a conflicting declaration and fails closed', async () => {
  const refs = buildV003Refs();
  await assertCompatibilityError(
    async () =>
      validateDacV003Compatibility(
        await buildCompatibleRequest({
          capabilityRequirements: [refs.capabilityRequirement, refs.capabilityRequirement],
        }),
      ),
    'INVALID_COMPATIBILITY_REQUEST',
    'duplicate requirement identity',
  );
});

test('v3-002 closure: strength and condition shapes are enforced at adoption', async () => {
  const base = {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'cap-req/shape-1',
    semanticIdentity: 'capability/shape',
  };
  await assertCompatibilityError(
    () =>
      adoptDacV003CapabilityRequirement({
        ...base,
        strength: 'sometimes' as never,
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'unknown strength',
  );
  await assertCompatibilityError(
    () =>
      adoptDacV003CapabilityRequirement({
        ...base,
        strength: 'conditional',
        condition: '   ',
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'blank condition',
  );
  await assertCompatibilityError(
    () =>
      adoptDacV003CapabilityRequirement({
        ...base,
        strength: 'required',
        condition: 'composition.declares-offline-mode',
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'condition on non-conditional',
  );
  await assertCompatibilityError(
    () =>
      adoptDacV003PortRequirement({
        ...base,
        primaryIdentity: 'port-req/shape-1',
        strength: 'required',
        bindingAuthority: '',
      }),
    'INVALID_COMPATIBILITY_REQUEST',
    'empty binding authority',
  );
  assert.equal(V003_TARGET_PROFILE, 'domain-harness@v0.0.3-profile/node-1');
});
