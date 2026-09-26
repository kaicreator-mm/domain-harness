// Issue #363 / A41-001R1 — post-mint transitive immutability and
// predecessor-origin closure negatives (repair of #362 P1-1). Every nested
// container participating in the exact request/evidence closure of a minted
// v0.0.4.1 reference (locatorHints, materialInputRefs, advisoryTargetHints,
// opaque, predecessorOrigin) is defensively snapshotted and frozen, matching
// the preserved historical v0.0.3 adoption-core closure rule: caller
// containers mutated after mint never reach the reference, direct mutation
// attempts throw in strict mode, and malformed origin carriers (including a
// relabeled evidence purpose) fail closed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  isDacV0041Reference,
  mintRuntimeBindingRequestRef,
} from '../../src/dac-v0041/index.js';

function expectOriginError(run: () => unknown, label: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof DacV0041ReferenceError,
    `${label}: expected DacV0041ReferenceError, got ${String(caught)}`,
  );
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_PREDECESSOR_ORIGIN', `${label}: code`);
}

test('a41-001 R1 immutability: caller-owned containers mutated after adoption never reach the minted reference', () => {
  const locatorHints = ['registry://targets/one'];
  const opaque: Record<string, unknown> = { sourceField: 'value-1' };
  const ref = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-target-1',
    locatorHints,
    opaque,
  });
  assert.ok(isDacV0041Reference(ref));

  // The caller keeps mutating its own containers after mint.
  locatorHints.push('registry://targets/injected');
  opaque.sourceField = 'mutated';
  opaque.injected = true;

  assert.deepEqual([...ref.locatorHints], ['registry://targets/one']);
  assert.deepEqual({ ...ref.opaque }, { sourceField: 'value-1' });
  assert.ok(isDacV0041Reference(ref), 'reference stays minted and valid');
});

test('a41-001 R1 immutability: every nested closure container of an adopted reference is frozen and direct mutation throws', () => {
  const ref = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-target-2',
    locatorHints: ['registry://targets/two'],
    opaque: { sourceField: 'value-2' },
    predecessorOrigin: DAC_V0041_PREDECESSOR_BASELINES[1],
  });
  assert.equal(Object.isFrozen(ref), true, 'outer reference frozen');
  assert.equal(Object.isFrozen(ref.locatorHints), true, 'locatorHints frozen');
  assert.equal(Object.isFrozen(ref.opaque), true, 'opaque record frozen');
  assert.equal(Object.isFrozen(ref.predecessorOrigin), true, 'predecessorOrigin snapshot frozen');

  // ESM modules are strict mode: direct mutation attempts throw.
  assert.throws(() => (ref.locatorHints as string[]).push('injected'), TypeError);
  assert.throws(() => {
    (ref.opaque as Record<string, unknown>).sourceField = 'mutated';
  }, TypeError);
  assert.throws(() => {
    (ref.predecessorOrigin as { semanticFreezeCommit?: string }).semanticFreezeCommit = '0'.repeat(40);
  }, TypeError);

  // Values are unchanged after the attempts.
  assert.deepEqual([...ref.locatorHints], ['registry://targets/two']);
  assert.equal(ref.opaque.sourceField, 'value-2');
  assert.equal(
    ref.predecessorOrigin?.semanticFreezeCommit,
    DAC_V0041_PREDECESSOR_BASELINES[1].semanticFreezeCommit,
  );
});

test('a41-001 R1 immutability: predecessorOrigin is a frozen canonical snapshot, never the caller carrier', () => {
  const carrier: Record<string, unknown> = {
    contract: 'domain-application-contract',
    version: 'v0.0.3',
    semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
    semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
    purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    extraHostileField: 'must-not-be-retained',
  };
  const ref = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-target-3',
    predecessorOrigin: carrier as never,
  });
  assert.notEqual(ref.predecessorOrigin, carrier, 'the caller carrier is never aliased');
  assert.equal(Object.isFrozen(ref.predecessorOrigin), true, 'snapshot is frozen');
  // Canonical frozen-table values only: extra carrier fields are dropped.
  assert.deepEqual(ref.predecessorOrigin, DAC_V0041_PREDECESSOR_BASELINES[0]);

  // Mutating the caller carrier after mint never changes the closed evidence.
  (carrier as { version?: string }).version = 'v0.0.4';
  (carrier as { semanticFreezeCommit?: string }).semanticFreezeCommit = '0'.repeat(40);
  (carrier as { purpose?: string }).purpose = 'successor-authority';
  assert.equal(ref.predecessorOrigin?.version, 'v0.0.3');
  assert.equal(
    ref.predecessorOrigin?.semanticFreezeCommit,
    '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
  );
  assert.equal(ref.predecessorOrigin?.purpose, DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE);
  assert.ok(isDacV0041Reference(ref));

  // A carrier that omits the purpose still mints; the closed snapshot always
  // carries the canonical evidence-only purpose.
  const partialCarrier = {
    contract: 'domain-application-contract',
    version: 'v0.0.4',
    semanticFreezeCommit: '0d31feec751cf21d2ae29de16315d35f73b0b8c8',
    semanticFreezeTree: '529d83d7a4f25b72675fe50c80642e0471186b66',
  };
  const withPartial = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-target-4',
    predecessorOrigin: partialCarrier as never,
  });
  assert.equal(
    withPartial.predecessorOrigin?.purpose,
    DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
    'canonical evidence-only purpose closed into the snapshot',
  );
  assert.deepEqual(withPartial.predecessorOrigin, DAC_V0041_PREDECESSOR_BASELINES[1]);
});

test('a41-001 R1 immutability: malformed predecessor-origin carriers fail closed', () => {
  const good = {
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target' as const,
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-target-5',
  };
  const v003Identity = {
    contract: 'domain-application-contract',
    version: 'v0.0.3',
    semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
    semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
  };
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: { ...v003Identity, purpose: 'successor-authority' } as never,
      }),
    'origin relabeled toward authority',
  );
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: { ...v003Identity, purpose: 'transition-or-adoption-evidence' } as never,
      }),
    'near-miss purpose',
  );
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: { ...v003Identity, purpose: '' } as never,
      }),
    'empty purpose',
  );
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: { ...v003Identity, purpose: 42 } as never,
      }),
    'non-string purpose',
  );
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: {
          ...v003Identity,
          semanticFreezeTree: '6a2ce1cecb13b1d1ac1b1b1f1e97a8d0a68d0ba9',
        } as never,
      }),
    'drifted predecessor tree',
  );
  expectOriginError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        predecessorOrigin: [v003Identity] as never,
      }),
    'array carrier',
  );
  // The exact evidence-only purpose is the only accepted purpose value.
  const valid = adoptDacV0041RegistryReference({
    ...good,
    predecessorOrigin: { ...v003Identity, purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE } as never,
  });
  assert.equal(valid.predecessorOrigin?.version, 'v0.0.3');
});

test('a41-001 R1 immutability: a minted request reference closes frozen nested request containers', () => {
  const descriptor = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'provider-capability-descriptor',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-descriptor-1',
  });
  const materialInput = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'domain-data-semantic',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-material-1',
  });
  const extraMaterial = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'domain-data-revision',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-material-2',
  });
  const bindingTarget = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target',
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-binding-target-1',
  });

  const materialInputRefs = [materialInput];
  const advisoryTargetHints = ['env:prod'];
  const locatorHints = ['registry://binding-requests'];
  const opaque: Record<string, unknown> = { transport: 'wire-1' };
  const originCarrier = { ...DAC_V0041_PREDECESSOR_BASELINES[0] };

  const request = mintRuntimeBindingRequestRef({
    baseline: { ...DAC_V0041_BASELINE },
    authorityScope: 'domain-harness://successor/r1-immutability',
    primaryIdentity: 'r1-binding-request-1',
    requesterIdentity: 'requester-r1',
    providerIdentity: 'provider-r1',
    requestedCapabilityKind: 'domain-harness.runtime-binding/1',
    locatorHints,
    descriptorRef: descriptor,
    materialInputRefs,
    bindingTargetRef: bindingTarget,
    advisoryTargetHints,
    predecessorOrigin: originCarrier,
    opaque,
  });

  // Transitive freeze over every nested closure container.
  assert.equal(Object.isFrozen(request), true, 'outer request frozen');
  assert.equal(Object.isFrozen(request.locatorHints), true, 'locatorHints frozen');
  assert.equal(Object.isFrozen(request.materialInputRefs), true, 'materialInputRefs frozen');
  assert.equal(Object.isFrozen(request.advisoryTargetHints), true, 'advisoryTargetHints frozen');
  assert.equal(Object.isFrozen(request.opaque), true, 'opaque record frozen');
  assert.equal(Object.isFrozen(request.predecessorOrigin), true, 'predecessorOrigin frozen');
  assert.equal(Object.isFrozen(request.descriptorRef), true, 'descriptorRef frozen');
  assert.equal(Object.isFrozen(request.bindingTargetRef), true, 'bindingTargetRef frozen');

  // Caller-side post-mint mutation never reaches the request.
  materialInputRefs.push(extraMaterial);
  advisoryTargetHints.push('injected');
  locatorHints.push('registry://injected');
  opaque.transport = 'mutated';
  (originCarrier as { semanticFreezeTree?: string }).semanticFreezeTree = 'f'.repeat(40);
  assert.equal(request.materialInputRefs.length, 1);
  assert.equal(request.materialInputRefs[0]?.primaryIdentity, 'r1-material-1');
  assert.deepEqual([...request.advisoryTargetHints], ['env:prod']);
  assert.deepEqual([...request.locatorHints], ['registry://binding-requests']);
  assert.deepEqual({ ...request.opaque }, { transport: 'wire-1' });
  assert.equal(
    request.predecessorOrigin?.semanticFreezeTree,
    DAC_V0041_PREDECESSOR_BASELINES[0].semanticFreezeTree,
  );

  // Direct mutation attempts throw; the request stays minted and valid.
  assert.throws(() => (request.materialInputRefs as unknown[]).push(extraMaterial), TypeError);
  assert.throws(() => (request.advisoryTargetHints as string[]).push('injected'), TypeError);
  assert.equal(isDacV0041Reference(request), true);
});
