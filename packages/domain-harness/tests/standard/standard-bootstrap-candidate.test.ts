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
  assert.equal(
    selectStandardBootstrapCandidate([eligible, noImplementation, wrongKind], 'semantic'),
    eligible,
  );
  assert.equal(
    selectStandardBootstrapCandidate([unsupported, noImplementation, wrongKind], 'semantic'),
    unsupported,
  );
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
  assert.equal(winner, alpha);

  // Canonical ref ordering is code-unit over the canonical JSON material, so
  // it is total and independent of declaration order.
  assert.ok(
    canonicalComponentRef(alpha.descriptor.component) <
      canonicalComponentRef(bravo.descriptor.component),
  );

  // Purity: fixture-construction selection never binds, dispatches or ranks
  // implementations — the winner object is returned untouched.
  assert.equal(winner.referenceImplementation, alpha.referenceImplementation);
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
  assert.equal(forward, alphaV1);
  assert.equal(reversed, alphaV1);
});
