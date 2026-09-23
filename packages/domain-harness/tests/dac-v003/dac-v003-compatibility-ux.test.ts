// Issue #325 / DAC v0.0.3 V3-002 — Domain UX / interaction closure
// (APPLICATION_MANIFEST §9; conformance C58/C59): exactly one
// DomainUXDefinitionRef and exactly one RuntimeInteractionContractRef,
// distinct from each other and from renderer/presentation identity; every
// material UX semantic role the definition requires must be covered by the
// interaction contract; #308 anchors are renderer-independent correlation
// evidence only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DacV003CompatibilityError,
  adoptDomainUXDefinitionRef,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import {
  DAC_V003_BASELINE,
  DacV003ReferenceError,
  adoptRuntimeInteractionContractRef,
} from '../../src/dac-v003/index.js';
import { DAC_BRIDGE_BASELINE, adoptSemanticTargetRef } from '../../src/dac-bridge/index.js';
import { buildCompatibleRequest, buildV003Refs } from './compatibility-fixture.js';

function semanticTargetAnchor() {
  return adoptSemanticTargetRef({
    baseline: { ...DAC_BRIDGE_BASELINE },
    semanticIdentity: 'domain:tally:entry-form',
    authorityScope: 'dac://ux/acme-tally',
  });
}

test('v3-002 ux closure: exactly-1 definition + exactly-1 interaction contract recorded with exact identities', async () => {
  const request = await buildCompatibleRequest();
  const validation = await validateDacV003Compatibility(request);
  assert.deepEqual(validation.ux.domainUxDefinition, {
    authorityScope: 'dac://domain-ux/acme',
    semanticIdentity: 'tally-ledger-ux',
    revisionIdentity: 'ux-rev-3',
  });
  assert.deepEqual(validation.ux.runtimeInteractionContract, {
    authorityScope: 'domain-harness://runtime/interaction',
    semanticIdentity: 'tally-semantic-interaction',
    revisionIdentity: 'interaction-rev-2',
  });
  assert.deepEqual(validation.ux.requiredRoles, ['domain-intent', 'semantic-target', 'ux-view']);
  assert.deepEqual(validation.ux.missingRequiredRoles, []);
});

test('v3-002 ux closure: required semantic role not covered by the interaction contract => INCOMPATIBLE (C58)', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      uxSemanticRoleRequirements: [
        { role: 'domain-intent', required: true },
        { role: 'ux-watch', required: true },
      ],
      interactionCoverage: ['domain-intent'],
    }),
  );
  assert.equal(validation.disposition.value, 'INCOMPATIBLE');
  assert.deepEqual(validation.ux.missingRequiredRoles, ['ux-watch']);
  assert.ok(validation.findings.some((f) => f.includes('ux-watch') && f.includes('C58')));
});

test('v3-002 ux closure: optional semantic role may be uncovered', async () => {
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      uxSemanticRoleRequirements: [
        { role: 'domain-intent', required: true },
        { role: 'ux-snapshot', required: false },
      ],
      interactionCoverage: ['domain-intent'],
    }),
  );
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.deepEqual(validation.ux.missingRequiredRoles, []);
});

test('v3-002 ux closure: UX definition and interaction contract sharing one identity tuple is a role collapse', async () => {
  const baseline = { ...DAC_V003_BASELINE };
  const shared = {
    authorityScope: 'dac://shared-scope',
    semanticIdentity: 'same-semantic-identity',
    revisionIdentity: 'same-revision',
  };
  const uxDefinition = adoptDomainUXDefinitionRef({
    baseline,
    primaryIdentity: 'shared/1',
    ...shared,
  });
  const interactionContract = adoptRuntimeInteractionContractRef({
    baseline,
    primaryIdentity: 'shared/2',
    ...shared,
  });
  let caught: unknown;
  try {
    await validateDacV003Compatibility(
      await buildCompatibleRequest({
        domainUxDefinition: uxDefinition,
        runtimeInteractionContract: interactionContract,
      }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'UX_ROLE_IDENTITY_COLLAPSE');
});

test('v3-002 ux closure: renderer identity in locator hints never influences the outcome (non-authoritative hints)', async () => {
  const baseline = { ...DAC_V003_BASELINE };
  const withRendererHints = adoptDomainUXDefinitionRef({
    baseline,
    authorityScope: 'dac://domain-ux/acme',
    primaryIdentity: 'ux-def/tally-ledger-1',
    semanticIdentity: 'tally-ledger-ux',
    revisionIdentity: 'ux-rev-3',
    locatorHints: ['dom:#save-button', 'component:LedgerTable', 'route:/ledger'],
  });
  const validation = await validateDacV003Compatibility(
    await buildCompatibleRequest({ domainUxDefinition: withRendererHints }),
  );
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  // Same validation identity as without hints: hints are not identity.
  const withoutHints = await validateDacV003Compatibility(await buildCompatibleRequest());
  assert.equal(
    validation.subject.validationIdentity,
    withoutHints.subject.validationIdentity,
  );
});

test('v3-002 ux closure: DomainUXDefinitionRef adoption requires immutable revision identity (P1, no floating UX)', () => {
  const baseline = { ...DAC_V003_BASELINE };
  let caught: unknown;
  try {
    adoptDomainUXDefinitionRef({
      baseline,
      authorityScope: 'dac://domain-ux/acme',
      primaryIdentity: 'ux-def/floating',
      semanticIdentity: 'tally-ledger-ux',
      // no revisionIdentity
    } as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003ReferenceError);
  assert.equal((caught as DacV003ReferenceError).code, 'PROFILE_REQUIREMENT_UNMET');
});

test('v3-002 ux closure: #308 anchors must be bridge-minted refs of the matching renderer-independent role', async () => {
  const refs = buildV003Refs();

  // A genuine #308 semantic-target anchor is accepted.
  const anchor = semanticTargetAnchor();
  const anchored = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      domainUxDefinition: refs.uxDefinition,
      uxSemanticRoleRequirements: [
        { role: 'semantic-target', required: true, anchor },
        { role: 'domain-intent', required: true },
        { role: 'ux-view', required: true },
      ],
    }),
  );
  assert.equal(anchored.disposition.value, 'COMPATIBLE');

  // A v0.0.3 envelope can never pose as a bridge anchor (wrong family).
  let caught: unknown;
  try {
    await validateDacV003Compatibility(
      await buildCompatibleRequest({
        uxSemanticRoleRequirements: [
          { role: 'semantic-target', required: true, anchor: refs.interactionContract as never },
        ],
      }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_REQUEST');
});

test('v3-002 ux closure: ux-recovery-correlation has no #308 anchor role (owned by the external-operation lane)', async () => {
  const anchor = semanticTargetAnchor();
  let caught: unknown;
  try {
    await validateDacV003Compatibility(
      await buildCompatibleRequest({
        uxSemanticRoleRequirements: [
          { role: 'ux-recovery-correlation', required: false, anchor },
        ],
      }),
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_REQUEST');
});
