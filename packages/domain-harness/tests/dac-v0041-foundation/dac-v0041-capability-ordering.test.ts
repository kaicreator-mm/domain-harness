// Issue #355 / A41-001 — deterministic capability-kind/currentness ordering
// primitives (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13.1/§13.2;
// C84/C85/C150-C153/C157/C158/C170/C171; FREEZE_MANIFEST §2.5). The frozen
// order: establish current exact descriptor → capability kind (blocked,
// target not judged) → structural invalidity (FAIL_CLOSED, dominates STALE)
// → staleness (STALE) → binding explicit target support (INCOMPATIBLE) →
// only then the provider evaluation namespace. The classifier invents no
// fact, consults no advisory hint, and never produces COMPATIBLE or any
// evaluation outcome.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V0041_CAPABILITY_EXCHANGE_PHASES,
  DAC_V0041_CAPABILITY_OUTCOME_CLASSES,
  DAC_V0041_REFERENCE_DISPOSITIONS,
  DacV0041ReferenceError,
  classifyDacV0041CapabilityExchange,
  classifyDacV0041CurrentnessUse,
  dacV0041OutcomeProducesResult,
} from '../../src/dac-v0041/index.js';
import type { DacV0041CapabilityExchangeFacts } from '../../src/dac-v0041/index.js';

const TARGET_MISSING = { presence: 'missing' } as const;
const TARGET_EXPLICIT_UNSUPPORTED = {
  presence: 'explicit',
  declaredSupport: 'unsupported',
} as const;

function facts(overrides: Partial<DacV0041CapabilityExchangeFacts> = {}): DacV0041CapabilityExchangeFacts {
  return {
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['domain-harness.compatibility-validation/1'],
    requestedCapabilityKind: 'domain-harness.compatibility-validation/1',
    requiredInputsStructurallyValid: true,
    materialStaleness: false,
    bindingTargetState: TARGET_MISSING,
    ...overrides,
  };
}

function expectFactsError(run: () => unknown, label: string): void {
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
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_FACTS', `${label}: code`);
}

test('a41-001 ordering: the frozen phase order and vocabularies are exact', () => {
  assert.deepEqual([...DAC_V0041_CAPABILITY_EXCHANGE_PHASES], [
    'descriptor-establishment',
    'capability-kind',
    'exactness-currentness',
    'target-support',
    'evaluation',
  ]);
  assert.deepEqual([...DAC_V0041_REFERENCE_DISPOSITIONS], [
    'FAIL_CLOSED',
    'STALE',
    'INCOMPATIBLE',
    'COMPATIBLE',
  ]);
  assert.deepEqual([...DAC_V0041_CAPABILITY_OUTCOME_CLASSES], [
    'accepted-for-evaluation',
    'pending/in-progress',
    'produced-result',
    'rejected/invalid-input',
    'blocked/missing-capability',
    'failed-known-no-result',
    'unknown/ambiguous-production',
  ]);
});

test('a41-001 ordering §13.1: no role-valid current exact descriptor => FAIL_CLOSED, no kind judgment', () => {
  assert.deepEqual(classifyDacV0041CapabilityExchange(facts({ currentDescriptorEstablished: false })), {
    phase: 'descriptor-establishment',
    disposition: 'FAIL_CLOSED',
  });
  // Even when the fact object also carries a stale-looking offered-kind list
  // or an unsupported target: without a current descriptor nothing else is
  // judged.
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(
      facts({
        currentDescriptorEstablished: false,
        materialStaleness: true,
        bindingTargetState: TARGET_EXPLICIT_UNSUPPORTED,
      }),
    ),
    { phase: 'descriptor-establishment', disposition: 'FAIL_CLOSED' },
  );
});

test('a41-001 ordering C84/C150/C170: capability-kind absence blocks and the target is not judged — even with an unsupported binding target or stale inputs', () => {
  const blocked = classifyDacV0041CapabilityExchange(
    facts({
      currentDescriptorOfferedCapabilityKinds: ['some.other-capability/1'],
      bindingTargetState: TARGET_EXPLICIT_UNSUPPORTED,
      materialStaleness: true,
    }),
  );
  assert.deepEqual(blocked, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
  // Empty offered-kind list is the same Step-1 result.
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(facts({ currentDescriptorOfferedCapabilityKinds: [] })),
    { phase: 'capability-kind', outcome: 'blocked/missing-capability', targetNotJudged: true },
  );
});

test('a41-001 ordering C152/C153/C171: structural invalidity dominates coexisting staleness inside Step 2', () => {
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(
      facts({ requiredInputsStructurallyValid: false, materialStaleness: true }),
    ),
    { phase: 'exactness-currentness', disposition: 'FAIL_CLOSED' },
  );
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(facts({ requiredInputsStructurallyValid: false })),
    { phase: 'exactness-currentness', disposition: 'FAIL_CLOSED' },
  );
});

test('a41-001 ordering C85: kind offered + structurally valid + material staleness => STALE (before any target judgment)', () => {
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(
      facts({ materialStaleness: true, bindingTargetState: TARGET_EXPLICIT_UNSUPPORTED }),
    ),
    { phase: 'exactness-currentness', disposition: 'STALE' },
  );
});

test('a41-001 ordering Step 3: binding explicit unsupported target => INCOMPATIBLE only after Steps 1–2 pass', () => {
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(facts({ bindingTargetState: TARGET_EXPLICIT_UNSUPPORTED })),
    { phase: 'target-support', disposition: 'INCOMPATIBLE' },
  );
});

test('a41-001 ordering Step 4: all precedence steps passed => evaluation phase, no outcome decided here', () => {
  const evaluation = classifyDacV0041CapabilityExchange(facts());
  assert.deepEqual(evaluation, { phase: 'evaluation' });
  assert.equal('disposition' in evaluation, false, 'foundation produces no disposition past Step 3');
  assert.equal('outcome' in evaluation, false, 'foundation produces no capability outcome');
});

test('a41-001 ordering: the classifier is deterministic over the full recoverable fact grid', () => {
  // Exhaustive 2^4 grid over the binary facts (kind offered varies via the
  // kind list): identical inputs always classify identically, and the
  // classification never contains COMPATIBLE or an outcome-namespace value.
  const results = new Map<string, number>();
  for (const established of [true, false]) {
    for (const kindOffered of [true, false]) {
      for (const structurallyValid of [true, false]) {
        for (const stale of [true, false]) {
          for (const target of [TARGET_MISSING, TARGET_EXPLICIT_UNSUPPORTED]) {
            const value = facts({
              currentDescriptorEstablished: established,
              currentDescriptorOfferedCapabilityKinds: kindOffered
                ? ['domain-harness.compatibility-validation/1']
                : [],
              requiredInputsStructurallyValid: structurallyValid,
              materialStaleness: stale,
              bindingTargetState: target,
            });
            for (let round = 0; round < 2; round += 1) {
              const classified = classifyDacV0041CapabilityExchange(value);
              const key = JSON.stringify(classified);
              results.set(key, (results.get(key) ?? 0) + 1);
            }
          }
        }
      }
    }
  }
  for (const key of results.keys()) {
    const classified = JSON.parse(key) as { disposition?: string; outcome?: string };
    assert.notEqual(
      classified.disposition,
      'COMPATIBLE',
      `classifier must never yield COMPATIBLE: ${key}`,
    );
    // The only outcome the ORDERING itself may assign is the Step-1
    // blocked/missing-capability class. The evaluation-phase classes
    // (accepted-for-evaluation, produced-result, rejected/invalid-input,
    // failed-known-no-result, unknown/ambiguous-production) belong to the
    // owning seam's evaluation, never to this foundation.
    if (classified.outcome !== undefined) {
      assert.equal(
        classified.outcome,
        'blocked/missing-capability',
        `classifier may only assign the Step-1 blocked class: ${key}`,
      );
    }
  }
  // Determinism: every classification appeared an even number of times
  // (two identical rounds per grid point) — no hidden state or randomness.
  for (const [key, count] of results) {
    assert.equal(count % 2, 0, `nondeterministic classification for ${key}`);
  }
});

test('a41-001 ordering: malformed facts fail closed instead of being guessed', () => {
  expectFactsError(
    () => classifyDacV0041CapabilityExchange(null as never),
    'null facts',
  );
  expectFactsError(
    () => classifyDacV0041CapabilityExchange({} as never),
    'empty facts',
  );
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ bindingTargetState: { presence: 'explicit', declaredSupport: 'supported' } as never }),
      ),
    'support classification beyond unsupported is not foundation authority',
  );
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ currentDescriptorOfferedCapabilityKinds: 'not-a-list' as never }),
      ),
    'offered kinds must be an array',
  );
});

test('a41-001 R1 ordering P2-1: empty/non-string capability-kind facts are INVALID_FACTS — never a blocked or evaluation classification', () => {
  // Hostile pair from review: an empty requested kind previously matched an
  // offered [''] at Step 1 and reached the evaluation phase.
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ requestedCapabilityKind: '', currentDescriptorOfferedCapabilityKinds: [''] }),
      ),
    'empty requested kind against empty offered kind',
  );
  expectFactsError(
    () => classifyDacV0041CapabilityExchange(facts({ requestedCapabilityKind: '' })),
    'empty requested kind alone',
  );
  expectFactsError(
    () => classifyDacV0041CapabilityExchange(facts({ requestedCapabilityKind: '   ' })),
    'whitespace-only requested kind',
  );
  expectFactsError(
    () => classifyDacV0041CapabilityExchange(facts({ requestedCapabilityKind: 42 as never })),
    'non-string requested kind',
  );
  // Non-string/empty offered members are malformed facts, never a normal
  // blocked/missing-capability classification.
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ currentDescriptorOfferedCapabilityKinds: [42] as never }),
      ),
    'non-string offered member must not classify as blocked',
  );
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ currentDescriptorOfferedCapabilityKinds: [''] }),
      ),
    'empty offered member',
  );
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({
          currentDescriptorOfferedCapabilityKinds: [
            'domain-harness.compatibility-validation/1',
            null,
          ] as never,
        }),
      ),
    'null offered member',
  );
  // Malformed kinds stay INVALID_FACTS even when other facts would fail an
  // earlier step — the facts guard dominates every classification phase.
  expectFactsError(
    () =>
      classifyDacV0041CapabilityExchange(
        facts({ currentDescriptorEstablished: false, requestedCapabilityKind: '' }),
      ),
    'malformed kind dominates a failing descriptor step',
  );
  // A legally EMPTY offered list stays a normal Step-1 blocked classification
  // (the empty list is valid; only malformed ENTRIES are invalid facts).
  assert.deepEqual(
    classifyDacV0041CapabilityExchange(facts({ currentDescriptorOfferedCapabilityKinds: [] })),
    { phase: 'capability-kind', outcome: 'blocked/missing-capability', targetNotJudged: true },
  );
});

test('a41-001 ordering C157: currentness-use classification is deterministic and fail-closed', () => {
  assert.deepEqual(classifyDacV0041CurrentnessUse('current'), { state: 'current', usable: true });
  assert.deepEqual(classifyDacV0041CurrentnessUse('stale'), { state: 'stale', disposition: 'STALE' });
  assert.deepEqual(classifyDacV0041CurrentnessUse('superseded'), {
    state: 'superseded',
    disposition: 'STALE',
  });
  assert.deepEqual(classifyDacV0041CurrentnessUse('revoked'), {
    state: 'revoked',
    disposition: 'FAIL_CLOSED',
  });
  assert.deepEqual(classifyDacV0041CurrentnessUse('voided'), {
    state: 'voided',
    disposition: 'FAIL_CLOSED',
  });

  let caught: unknown;
  try {
    classifyDacV0041CurrentnessUse('unknown' as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_CURRENTNESS_STATE');
});

test('a41-001 ordering C156/C158: only produced-result proves a result, and a negative decision stays a decision', () => {
  assert.equal(dacV0041OutcomeProducesResult('produced-result'), true);
  for (const neverADecision of [
    'accepted-for-evaluation',
    'pending/in-progress',
    'rejected/invalid-input',
    'blocked/missing-capability',
    'failed-known-no-result',
    'unknown/ambiguous-production',
  ] as const) {
    assert.equal(
      dacV0041OutcomeProducesResult(neverADecision),
      false,
      `${neverADecision} is never a produced decision/approval`,
    );
  }
  let caught: unknown;
  try {
    dacV0041OutcomeProducesResult('approved' as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_FACTS');
});
