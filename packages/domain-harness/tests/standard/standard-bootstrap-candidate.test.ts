/**
 * T006A invariant matrix — deterministic Standard bootstrap-candidate
 * eligibility (issue #618, fine-grained DAG #534 T006A; authority #589
 * PACK-C). The eligibility rule defined here is consumed by T006B/T006C.
 *
 * Frozen rules under test:
 *  1. a candidate must already exist as a published/supported exact Standard
 *     descriptor WITH an accepted reference implementation whose exact KindRef
 *     matches the descriptor's component Kind;
 *  2. Semantic and Tool candidates are classified by the ordinary Component
 *     family — no Standard-specific family or registry exists;
 *  3. among multiple eligible candidates, the lexicographically smallest
 *     canonical exact ComponentRef is selected — for FIXTURE CONSTRUCTION
 *     ONLY, never as runtime provider-selection semantics (the function is
 *     pure: it dispatches nothing and binds nothing);
 *  4. if no eligible candidate exists, the family-specific typed failure
 *     STANDARD_SEMANTIC_CANDIDATE_ABSENT / STANDARD_TOOL_CANDIDATE_ABSENT is
 *     thrown — the caller must return to ChatGPT Web; a candidate is NEVER
 *     invented locally;
 *  5. selection is deterministic: input permutation and duplicate-key
 *     orderings never change the winner.
 *
 * #653 D4/D5 hardening (BOUNDED_PLANNING_AMENDMENT #653@6011791871):
 *  6. R1 — ANY malformed or unsafe candidate structure (the candidate record
 *     itself or authority-bearing nested descriptor/pin material: accessors,
 *     exotic prototypes, hidden/symbol-keyed material, malformed shapes) is a
 *     deterministic typed invalid-input failure. There is NO silent-skip
 *     path and no reinterpretation as mere "ineligibility"; valid but
 *     genuinely ineligible candidates remain an ordinary filter;
 *  7. D4 — the returned candidate is fresh, frozen and non-aliased: caller
 *     mutation after selection can never change the material consumed by
 *     T006B/T006C;
 *  8. D5/G1 — the PACK-C primary key (lexicographically smallest canonical
 *     exact ComponentRef) is preserved; exact reference-implementation
 *     identity participates ONLY as the deterministic tie-breaker that
 *     removes stable-sort/input-position authority when otherwise-equal
 *     candidates share the same canonical exact ComponentRef. The same
 *     candidate multiset selects identically under permutation;
 *  9. exact duplicate semantic candidates deduplicate by exact identity —
 *     never first/latest/default/input-order selection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  KindImplementationPin,
} from '../../src/contracts/runtime-assembly.js';
import {
  STANDARD_TOOL_CANDIDATE_ABSENT,
  STANDARD_SEMANTIC_CANDIDATE_ABSENT,
  StandardCandidateAbsentError,
  StandardContractError,
  canonicalComponentRef,
  selectStandardBootstrapCandidate,
  type ExactComponentRef,
  type StandardBootstrapCandidate,
  type StandardComponentDescriptor,
} from '../../src/contracts/standard.js';

function componentRef(overrides: Partial<ExactComponentRef> = {}): ExactComponentRef {
  return {
    family: 'semantic',
    componentId: 'component.standard-example',
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    ...overrides,
  };
}

function descriptor(
  overrides: Partial<StandardComponentDescriptor> = {},
): StandardComponentDescriptor {
  return {
    standardId: 'standard.example',
    classification: 'published',
    descriptorVersion: '1.0.0',
    component: componentRef(),
    ...overrides,
  };
}

function pinFor(ref: ExactComponentRef, implementationId: string): KindImplementationPin {
  return {
    kind: { kindId: ref.kind.kindId, version: ref.kind.version },
    implementation: {
      implementationId,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${implementationId}`,
    },
  };
}

function candidate(
  descriptorOverrides: Partial<StandardComponentDescriptor> = {},
  implementationId = 'impl.standard.alpha',
): StandardBootstrapCandidate {
  const published = descriptor(descriptorOverrides);
  return {
    descriptor: published,
    referenceImplementation: pinFor(published.component, implementationId),
  };
}

test('#618 candidate 1: eligibility requires published/supported classification AND an accepted reference implementation bound to the exact Kind', () => {
  const eligible = candidate();
  const noImplementation: StandardBootstrapCandidate = { descriptor: descriptor() };
  const wrongKind: StandardBootstrapCandidate = {
    descriptor: descriptor(),
    referenceImplementation: pinFor(
      componentRef({ kind: { kindId: 'other.kind', version: '1.0.0' } }),
      'impl.wrong-kind',
    ),
  };
  const unsupported: StandardBootstrapCandidate = {
    ...candidate(),
    descriptor: descriptor({ classification: 'supported' }),
  };
  // 'supported' IS an eligible classification (publishing/support vocabulary).
  // #653 D4: the winner is a fresh non-aliased snapshot of the eligible
  // candidate, compared by semantic material rather than object identity.
  const winner = selectStandardBootstrapCandidate([eligible, noImplementation, wrongKind], 'semantic');
  assert.deepEqual(winner.descriptor, eligible.descriptor);
  assert.deepEqual(winner.referenceImplementation, eligible.referenceImplementation);
  const supportedWinner = selectStandardBootstrapCandidate(
    [unsupported, noImplementation, wrongKind],
    'semantic',
  );
  assert.deepEqual(supportedWinner.descriptor, unsupported.descriptor);
  assert.deepEqual(supportedWinner.referenceImplementation, unsupported.referenceImplementation);
});

test('#618 candidate 2: family classification is the ordinary Component family — semantic and tool pools are disjoint', () => {
  const semanticA = candidate({ component: componentRef({ componentId: 'component.a-semantic' }) });
  const semanticZ = candidate({ component: componentRef({ componentId: 'component.z-semantic' }) });
  const toolA = candidate({
    component: componentRef({ family: 'tool', componentId: 'component.a-tool' }),
  });
  const toolZ = candidate({
    component: componentRef({ family: 'tool', componentId: 'component.z-tool' }),
  });

  const semanticWinner = selectStandardBootstrapCandidate(
    [toolA, semanticZ, toolZ, semanticA],
    'semantic',
  );
  assert.equal(semanticWinner.descriptor.component.componentId, 'component.a-semantic');

  const toolWinner = selectStandardBootstrapCandidate(
    [semanticA, toolZ, semanticZ, toolA],
    'tool',
  );
  assert.equal(toolWinner.descriptor.component.componentId, 'component.a-tool');
});

test('#618 candidate 3: the lexicographically smallest canonical exact ComponentRef wins — fixture construction only', () => {
  const bravo = candidate({ component: componentRef({ componentId: 'component.bravo' }) });
  const alpha = candidate({ component: componentRef({ componentId: 'component.alpha' }) });
  const charlie = candidate({ component: componentRef({ componentId: 'component.charlie' }) });

  const winner = selectStandardBootstrapCandidate([bravo, charlie, alpha], 'semantic');
  // #653 D4: fresh frozen non-aliased snapshot — deep-equal to the eligible
  // input candidate, but never the caller's own object.
  assert.deepEqual(winner.descriptor, alpha.descriptor);
  assert.deepEqual(winner.referenceImplementation, alpha.referenceImplementation);
  assert.notEqual(winner, alpha as unknown);
  assert.notEqual(winner.descriptor, alpha.descriptor as unknown);

  // Canonical ref ordering is code-unit over the canonical JSON material, so
  // it is total and independent of declaration order.
  assert.ok(
    canonicalComponentRef(alpha.descriptor.component) <
      canonicalComponentRef(bravo.descriptor.component),
  );

  // Purity: fixture-construction selection never binds, dispatches or ranks
  // implementations; the returned pin snapshot carries exactly the accepted
  // reference implementation identity.
  assert.equal(winner.referenceImplementation?.implementation.implementationId, 'impl.standard.alpha');
});

test('#618 candidate 4: no eligible candidate is a typed family-specific ABSENT failure — never an invented candidate', () => {
  assert.throws(
    () => selectStandardBootstrapCandidate([], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError);
      assert.equal(error.code, STANDARD_SEMANTIC_CANDIDATE_ABSENT);
      assert.equal(error.family, 'semantic');
      return true;
    },
  );

  assert.throws(
    () => selectStandardBootstrapCandidate([], 'tool'),
    (error: unknown) => {
      assert.ok(error instanceof StandardCandidateAbsentError);
      assert.equal(error.code, STANDARD_TOOL_CANDIDATE_ABSENT);
      assert.equal(error.family, 'tool');
      return true;
    },
  );

  // Candidates missing an accepted reference implementation are ineligible —
  // their presence does not rescue a pool with no eligible member.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [{ descriptor: descriptor() }, { descriptor: descriptor({ classification: 'supported' }) }],
        'semantic',
      ),
    (error: unknown) => error instanceof StandardCandidateAbsentError,
  );

  // Wrong-family candidates never satisfy another family's pool.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [candidate({ component: componentRef({ family: 'tool' }) })],
        'semantic',
      ),
    (error: unknown) => error instanceof StandardCandidateAbsentError,
  );
});

test('#618 candidate 5: selection is deterministic under input permutation and exact-ref ties break by full descriptor key', () => {
  const alphaV2 = candidate({
    standardId: 'standard.alpha',
    descriptorVersion: '2.0.0',
    component: componentRef({ componentId: 'component.same-ref' }),
  });
  const alphaV1 = candidate({
    standardId: 'standard.alpha',
    descriptorVersion: '1.0.0',
    component: componentRef({ componentId: 'component.same-ref' }),
  });
  const beta = candidate({
    standardId: 'standard.beta',
    component: componentRef({ componentId: 'component.same-ref' }),
  });

  const forward = selectStandardBootstrapCandidate([alphaV2, beta, alphaV1], 'semantic');
  const reversed = selectStandardBootstrapCandidate([alphaV1, beta, alphaV2], 'semantic');
  assert.deepEqual(forward, reversed);
  assert.equal(forward.descriptor.descriptorVersion, '1.0.0');
  assert.equal(forward.descriptor.standardId, 'standard.alpha');
});

// ---------------------------------------------------------------------------
// #653 D4/D5 hardening — R1 absolute fail-closed candidate safety, D4
// fresh/frozen/non-aliased return, D5 permutation determinism with the exact
// reference-implementation identity as tie-breaker only.
// ---------------------------------------------------------------------------

test('#653 R1: a hostile accessor candidate fails closed typed — the getter never executes and the candidate is never silently skipped', () => {
  let getterExecutions = 0;
  const hostile: unknown = {};
  Object.defineProperty(hostile, 'descriptor', {
    enumerable: true,
    get() {
      getterExecutions += 1;
      return descriptor();
    },
  });

  assert.throws(
    () => selectStandardBootstrapCandidate([hostile as StandardBootstrapCandidate], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /accessor property "descriptor"/);
      return true;
    },
  );
  assert.equal(getterExecutions, 0);

  // Even alongside an eligible candidate, hostile structure fails the whole
  // call — malformed input is never reinterpreted as ineligible.
  const eligible = candidate();
  assert.throws(
    () =>
      selectStandardBootstrapCandidate([eligible, hostile as StandardBootstrapCandidate], 'semantic'),
    (error: unknown) => error instanceof StandardContractError,
  );
  assert.equal(getterExecutions, 0);
});

test('#653 R1: unsafe candidate record shapes fail closed typed — exotic prototype, symbol keys, hidden property, non-record, missing descriptor, unknown field', () => {
  const eligible = candidate();

  // Exotic prototype (class instance).
  class HostileCandidate {}
  const exotic = Object.assign(new HostileCandidate(), {
    descriptor: descriptor(),
    referenceImplementation: pinFor(componentRef(), 'impl.exotic'),
  });
  assert.throws(
    () => selectStandardBootstrapCandidate([exotic as unknown as StandardBootstrapCandidate], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /ordinary or null-prototype record/);
      return true;
    },
  );

  // Symbol-keyed hidden material.
  const symbolKeyed: Record<string, unknown> = {
    descriptor: descriptor(),
    referenceImplementation: pinFor(componentRef(), 'impl.symbolic'),
  };
  (symbolKeyed as unknown as Record<symbol, unknown>)[Symbol('hidden authority')] = { pin: true };
  assert.throws(
    () =>
      selectStandardBootstrapCandidate([symbolKeyed as unknown as StandardBootstrapCandidate], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /symbol-keyed/);
      return true;
    },
  );

  // Non-enumerable (hidden) descriptor property.
  const hidden: Record<string, unknown> = { referenceImplementation: pinFor(componentRef(), 'impl.hidden') };
  Object.defineProperty(hidden, 'descriptor', {
    value: descriptor(),
    enumerable: false,
    writable: true,
    configurable: true,
  });
  assert.throws(
    () => selectStandardBootstrapCandidate([hidden as unknown as StandardBootstrapCandidate], 'semantic'),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /non-enumerable property "descriptor"/);
      return true;
    },
  );

  // Non-record candidates.
  for (const malformed of [null, 'candidate', 42, true]) {
    assert.throws(
      () =>
        selectStandardBootstrapCandidate([malformed as unknown as StandardBootstrapCandidate], 'semantic'),
      (error: unknown) => {
        assert.ok(error instanceof StandardContractError);
        assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
        return true;
      },
    );
  }

  // Missing descriptor field — malformed candidate record, not ineligibility.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [{ referenceImplementation: pinFor(componentRef(), 'impl.orphan') } as unknown as StandardBootstrapCandidate],
        'semantic',
      ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /descriptor/);
      return true;
    },
  );

  // Unknown candidate field — closed-world candidate record.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [{ ...candidate(), runtimeShortcut: 'forbidden' } as unknown as StandardBootstrapCandidate],
        'semantic',
      ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      assert.match(error.message, /unexpected field "runtimeShortcut"/);
      return true;
    },
  );

  // None of the unsafe shapes above may ever fall through to selection.
  assert.throws(
    () =>
      selectStandardBootstrapCandidate(
        [eligible, exotic as unknown as StandardBootstrapCandidate],
        'semantic',
      ),
    (error: unknown) => error instanceof StandardContractError,
  );
});

test('#653 R1: malformed nested authority material fails closed typed — malformed descriptor and malformed reference-implementation pin', () => {
  const eligible = candidate();

  // Malformed descriptor bodies (present but structurally invalid).
  const malformedDescriptors: unknown[] = [
    42,
    { ...descriptor(), unexpectedField: 'not descriptor material' },
    { ...descriptor(), classification: 'privileged' },
    { ...descriptor(), descriptorVersion: '1.x' },
    { ...descriptor(), component: { ...componentRef(), kind: { kindId: 'k', version: 'latest' } } },
  ];
  for (const [index, malformed] of malformedDescriptors.entries()) {
    assert.throws(
      () =>
        selectStandardBootstrapCandidate(
          [{ ...candidate(), descriptor: malformed } as unknown as StandardBootstrapCandidate],
          'semantic',
        ),
      (error: unknown) => {
        assert.ok(error instanceof StandardContractError, `case ${index} must throw StandardContractError`);
        assert.notEqual(
          (error as StandardContractError).code,
          STANDARD_SEMANTIC_CANDIDATE_ABSENT,
        );
        return true;
      },
      `malformed descriptor case ${index} must fail closed`,
    );
    // Malformed structure poisons the whole pool — never silently skipped.
    assert.throws(
      () =>
        selectStandardBootstrapCandidate(
          [eligible, { ...candidate(), descriptor: malformed } as unknown as StandardBootstrapCandidate],
          'semantic',
        ),
      (error: unknown) => error instanceof StandardContractError,
      `malformed descriptor case ${index} must fail the whole pool`,
    );
  }

  // Malformed reference-implementation pins (present but structurally invalid).
  const malformedPins: unknown[] = [
    null,
    'pin',
    { ...pinFor(componentRef(), 'impl.extra'), extra: 'field' },
    { kind: { kindId: 'example.semantic-kind', version: '1.0.0' } },
    {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.float',
        implementationVersion: '1.x',
        implementationDigest: 'sha256:impl.float',
      },
    },
  ];
  for (const [index, malformed] of malformedPins.entries()) {
    assert.throws(
      () =>
        selectStandardBootstrapCandidate(
          [{ ...candidate(), referenceImplementation: malformed } as unknown as StandardBootstrapCandidate],
          'semantic',
        ),
      (error: unknown) => {
        assert.ok(error instanceof StandardContractError, `case ${index} must throw StandardContractError`);
        return true;
      },
      `malformed pin case ${index} must fail closed`,
    );
    assert.throws(
      () =>
        selectStandardBootstrapCandidate(
          [eligible, { ...candidate(), referenceImplementation: malformed } as unknown as StandardBootstrapCandidate],
          'semantic',
        ),
      (error: unknown) => error instanceof StandardContractError,
      `malformed pin case ${index} must fail the whole pool`,
    );
  }
});

test('#653 D4: the returned candidate is fresh, frozen and non-aliased — caller mutation after selection cannot change consumed material', () => {
  const input = candidate();
  const originalDescriptor = descriptor();
  const originalPin = pinFor(componentRef(), 'impl.standard.alpha');

  const winner = selectStandardBootstrapCandidate([input], 'semantic');

  // Fresh: structurally identical, but no alias to any caller-owned object.
  assert.deepEqual(winner.descriptor, originalDescriptor);
  assert.deepEqual(winner.referenceImplementation, originalPin);
  assert.notEqual(winner, input as unknown);
  assert.notEqual(winner.descriptor, input.descriptor as unknown);
  assert.notEqual(winner.referenceImplementation, input.referenceImplementation as unknown);

  // Frozen: the returned material is deeply immutable.
  assert.ok(Object.isFrozen(winner));
  assert.ok(Object.isFrozen(winner.descriptor));
  assert.ok(Object.isFrozen(winner.descriptor.component));
  assert.ok(Object.isFrozen(winner.descriptor.component.kind));
  assert.ok(Object.isFrozen(winner.referenceImplementation));
  assert.ok(Object.isFrozen(winner.referenceImplementation?.kind));
  assert.ok(Object.isFrozen(winner.referenceImplementation?.implementation));

  // Caller mutation AFTER selection cannot change the consumed material.
  const mutableInput = input as {
    descriptor: StandardComponentDescriptor;
    referenceImplementation: KindImplementationPin;
  };
  (mutableInput.descriptor as { standardId: string }).standardId = 'standard.hacked';
  (mutableInput.descriptor as { descriptorVersion: string }).descriptorVersion = '9.9.9';
  (mutableInput.descriptor.component as { componentId: string }).componentId = 'component.hacked';
  (mutableInput.descriptor.component.kind as { version: string }).version = '0.0.1';
  mutableInput.referenceImplementation = pinFor(componentRef(), 'impl.replaced');
  (mutableInput.referenceImplementation.implementation as { implementationId: string }).implementationId =
    'impl.hacked';

  assert.deepEqual(winner.descriptor, originalDescriptor);
  assert.deepEqual(winner.referenceImplementation, originalPin);
  assert.equal(winner.descriptor.standardId, 'standard.example');
  assert.equal(winner.descriptor.component.componentId, 'component.standard-example');
  assert.equal(winner.referenceImplementation?.implementation.implementationId, 'impl.standard.alpha');

  // The returned candidate cannot be mutated either (frozen), and the caller
  // input itself was never frozen by the selector.
  assert.throws(() => {
    (winner.descriptor as { standardId: string }).standardId = 'standard.mutated';
  });
  assert.equal((input.descriptor as { standardId: string }).standardId, 'standard.hacked');
});

test('#653 D5/G1: same canonical exact ComponentRef with different reference implementations selects identically under permutation — implementation identity is the tie-breaker, never the primary key', () => {
  // Same canonical exact ComponentRef, same descriptor key material; only the
  // accepted reference-implementation identity differs.
  const implBravo = candidate({ component: componentRef({ componentId: 'component.same-ref' }) }, 'impl.bravo');
  const implAlpha = candidate({ component: componentRef({ componentId: 'component.same-ref' }) }, 'impl.alpha');
  const implCharlie = candidate(
    { component: componentRef({ componentId: 'component.same-ref' }) },
    'impl.charlie',
  );

  const permutations: StandardBootstrapCandidate[][] = [
    [implBravo, implAlpha, implCharlie],
    [implCharlie, implBravo, implAlpha],
    [implAlpha, implCharlie, implBravo],
    [implBravo, implAlpha, implCharlie].slice().reverse(),
  ];
  const results = permutations.map(
    (pool) => selectStandardBootstrapCandidate(pool, 'semantic').referenceImplementation,
  );
  for (const result of results.slice(1)) {
    assert.deepEqual(result, results[0]);
  }
  // The winner is a deterministic function of the candidate multiset: the
  // exact implementation identity tie-breaker selects the lexicographically
  // smallest implementation identity — never input position.
  assert.equal(results[0]?.implementation.implementationId, 'impl.alpha');

  // G1: the PACK-C primary key is untouched — a candidate with the
  // lexicographically smaller canonical exact ComponentRef wins even when its
  // reference implementation sorts AFTER the loser's (implementation identity
  // must not replace, precede or alter the primary key).
  const refBravoImplAaa = candidate(
    { component: componentRef({ componentId: 'component.bravo' }) },
    'impl.aaa',
  );
  const refAlphaImplZzz = candidate(
    { component: componentRef({ componentId: 'component.alpha' }) },
    'impl.zzz',
  );
  const forward = selectStandardBootstrapCandidate([refBravoImplAaa, refAlphaImplZzz], 'semantic');
  const reversed = selectStandardBootstrapCandidate([refAlphaImplZzz, refBravoImplAaa], 'semantic');
  assert.equal(forward.descriptor.component.componentId, 'component.alpha');
  assert.deepEqual(forward, reversed);
  assert.equal(forward.referenceImplementation?.implementation.implementationId, 'impl.zzz');
});

test('#653 D5: exact duplicate semantic candidates deduplicate by exact identity — deterministic under permutation, never first/latest/default selection', () => {
  const duplicateA = candidate({ component: componentRef({ componentId: 'component.dup' }) }, 'impl.same');
  const duplicateB = candidate({ component: componentRef({ componentId: 'component.dup' }) }, 'impl.same');

  // The duplicates are exact semantic duplicates by construction.
  assert.deepEqual(duplicateA.descriptor, duplicateB.descriptor);
  assert.deepEqual(duplicateA.referenceImplementation, duplicateB.referenceImplementation);

  const forward = selectStandardBootstrapCandidate([duplicateA, duplicateB], 'semantic');
  const reversed = selectStandardBootstrapCandidate([duplicateB, duplicateA], 'semantic');
  assert.deepEqual(forward, reversed);

  // A pool of only exact duplicates selects that semantic candidate.
  assert.equal(forward.descriptor.component.componentId, 'component.dup');
  assert.equal(forward.referenceImplementation?.implementation.implementationId, 'impl.same');

  // Duplicates of the winner do not disturb a larger pool's deterministic
  // ordering, in either direction.
  const other = candidate({ component: componentRef({ componentId: 'component.aaa-dup' }) }, 'impl.other');
  const withDupForward = selectStandardBootstrapCandidate([duplicateA, duplicateB, other], 'semantic');
  const withDupReversed = selectStandardBootstrapCandidate([other, duplicateB, duplicateA], 'semantic');
  assert.equal(withDupForward.descriptor.component.componentId, 'component.aaa-dup');
  assert.deepEqual(withDupForward, withDupReversed);
});
