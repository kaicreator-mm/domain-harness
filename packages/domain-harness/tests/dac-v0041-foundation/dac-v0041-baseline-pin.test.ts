// Issue #355 / A41-001 — exact immutable DAC v0.0.4.1 pin/currentness
// assertions for the successor foundation (audit #348 baselines; DAG #353).
// The pin is the semantic freeze commit AND tree; a status-only descendant,
// a predecessor baseline or any other drift fails closed.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  DAC_V0041_REFERENCE_ADAPTER_VERSION,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
} from '../../src/dac-v0041/index.js';

function expectBaselineError(run: () => unknown, label: string): void {
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
  assert.equal((caught as DacV0041ReferenceError).code, 'UNSUPPORTED_DAC_BASELINE', `${label}: code`);
}

test('a41-001 pin: the successor baseline is the exact DAC v0.0.4.1 semantic freeze commit and tree', () => {
  assert.equal(DAC_V0041_BASELINE.contract, 'domain-application-contract');
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1');
  assert.equal(
    DAC_V0041_BASELINE.semanticFreezeCommit,
    '75fee75b782ac229720dccd18d2a4ca54b285e51',
  );
  assert.equal(
    DAC_V0041_BASELINE.semanticFreezeTree,
    'c74cf5e3a0e6745da3eda6999836b61ee8103c60',
  );
});

test('a41-001 pin: baseline identity constants are frozen and deterministic', () => {
  assert.equal(Object.isFrozen(DAC_V0041_BASELINE), true, 'baseline record is frozen');
  assert.equal(
    Object.isFrozen(DAC_V0041_PREDECESSOR_BASELINES),
    true,
    'predecessor baseline record is frozen',
  );
  // ESM modules are strict mode: assignment to a frozen record must throw
  // and the pinned values can never be mutated in place.
  const baseline = DAC_V0041_BASELINE as unknown as { version?: string };
  assert.throws(
    () => {
      baseline.version = 'v0.0.4';
    },
    TypeError,
    'strict-mode assignment to the frozen baseline must throw',
  );
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1', 'pin value unchanged');
});

test('a41-001 pin: adoption fails closed on every baseline drift shape', () => {
  const good = {
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target' as const,
    authorityScope: 'domain-harness://successor/pin-check',
    primaryIdentity: 'pin-check-target-1',
  };
  assert.ok(adoptDacV0041RegistryReference(good), 'exact pin adopts');

  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: { ...DAC_V0041_BASELINE, semanticFreezeCommit: '0d31feec751cf21d2ae29de16315d35f73b0b8c8' },
      }),
    'v0.0.4 freeze commit as successor pin',
  );
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: { ...DAC_V0041_BASELINE, semanticFreezeTree: '529d83d7a4f25b72675fe50c80642e0471186b66' },
      }),
    'v0.0.4 tree as successor tree',
  );
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: { ...DAC_V0041_BASELINE, version: 'v0.0.4' },
      }),
    'v0.0.4 version',
  );
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: { ...DAC_V0041_BASELINE, version: 'v0.0.3' },
      }),
    'v0.0.3 version with successor freeze identities',
  );
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: {
          contract: 'domain-application-contract',
          version: 'v0.0.3',
          semanticFreezeCommit: '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
          semanticFreezeTree: '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06',
        },
      }),
    'predecessor v0.0.3 baseline as successor pin',
  );
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...good,
        baseline: { ...DAC_V0041_BASELINE, contract: 'some-other-contract' },
      }),
    'foreign contract',
  );
});

test('a41-001 pin: status-only descendants are never accepted as the semantic freeze', () => {
  // v0.0.4 status-only descendant 192091e… and v0.0.4.1 status-only
  // descendant 07593ac… are evidence/index reconciliation only.
  expectBaselineError(
    () =>
      adoptDacV0041RegistryReference({
        ...{
          baseline: { ...DAC_V0041_BASELINE },
          role: 'compatibility-target' as const,
          authorityScope: 'domain-harness://successor/pin-check',
          primaryIdentity: 'pin-check-target-2',
        },
        baseline: {
          contract: 'domain-application-contract',
          version: 'v0.0.4.1',
          semanticFreezeCommit: '07593acc5d8db5274efe756149d5145804d91988',
          semanticFreezeTree: 'bc24d01f78360fd9b9915417e9d10e28f9fa817f',
        },
      }),
    'v0.0.4.1 status-only descendant as semantic freeze',
  );
});

test('a41-001 pin: predecessor identities are retained exactly, for transition/adoption evidence only', () => {
  assert.equal(DAC_V0041_PREDECESSOR_BASELINES.length, 2, 'exactly two frozen predecessors');
  const [v003, v004] = DAC_V0041_PREDECESSOR_BASELINES;
  assert.equal(v003?.version, 'v0.0.3');
  assert.equal(v003?.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.equal(v003?.semanticFreezeTree, '163d2a4d9eb5b1659f35df1a0bb73bcaef96cd06');
  assert.equal(v004?.version, 'v0.0.4');
  assert.equal(v004?.semanticFreezeCommit, '0d31feec751cf21d2ae29de16315d35f73b0b8c8');
  assert.equal(v004?.semanticFreezeTree, '529d83d7a4f25b72675fe50c80642e0471186b66');
  for (const predecessor of DAC_V0041_PREDECESSOR_BASELINES) {
    assert.equal(
      predecessor.purpose,
      DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
      `${predecessor.version}: purpose is transition/adoption evidence only`,
    );
    assert.notEqual(
      predecessor.semanticFreezeCommit,
      DAC_V0041_BASELINE.semanticFreezeCommit,
      'predecessor never equals the successor pin',
    );
  }
});

test('a41-001 pin: adapter version identity is exact and distinct from historical adapters', () => {
  assert.equal(DAC_V0041_REFERENCE_ADAPTER_VERSION, 'dac-v0041-reference-adapter/1');
});

test('a41-001 pin: predecessorOrigin is optional evidence and rejects non-frozen origins', () => {
  const good = {
    baseline: { ...DAC_V0041_BASELINE },
    role: 'compatibility-target' as const,
    authorityScope: 'domain-harness://successor/pin-check',
    primaryIdentity: 'pin-check-target-3',
  };
  const withOrigin = adoptDacV0041RegistryReference({
    ...good,
    predecessorOrigin: DAC_V0041_PREDECESSOR_BASELINES[0],
  });
  assert.equal(withOrigin.predecessorOrigin?.version, 'v0.0.3', 'origin retained verbatim');

  let caught: unknown;
  try {
    adoptDacV0041RegistryReference({
      ...good,
      predecessorOrigin: {
        contract: 'domain-application-contract',
        version: 'v0.0.2',
        semanticFreezeCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
        semanticFreezeTree: 'irrelevant-tree',
        purpose: DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
      } as never,
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_PREDECESSOR_ORIGIN');
});
