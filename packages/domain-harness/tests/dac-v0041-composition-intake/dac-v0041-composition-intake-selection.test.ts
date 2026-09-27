// Issue #358 / A41-004 — F-04 §4/§4.1 + APPLICATION_MANIFEST §2 + C80/C81
// selection intake: exact ApplicationSelection evidence is consumed WITHOUT
// creating selection authority; identity precedes selection (C140); selected
// Domain Data coverage is total wherever Runtime consequence depends on it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  ROLE,
  buildCoverage,
  buildManifestFacts,
  buildRef,
  buildReuseCurrentness,
  buildSelectionFacts,
  buildValidIntakeInput,
} from './helpers.js';

test('a41-004 selection: valid selection evidence verifies as evidence only — no selection authority is created', () => {
  const result = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
  assert.equal(result.selectionIdentity, 'selection/record-1');
});

test('a41-004 selection: C140 — selection issued before the establishment issuance point fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        issuanceEvidence: { point: 25, assertedBy: ['id/registry-witness'] },
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ESTABLISHMENT_ORDER_VIOLATED');
});

test('a41-004 selection: C140 — selection exactly at the establishment point fails closed (precedence must be strict)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        issuanceEvidence: { point: 30, assertedBy: ['id/registry-witness'] },
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ESTABLISHMENT_ORDER_VIOLATED');
});

test('a41-004 selection: selection binding a different application semantic identity fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        applicationSemanticIdentityRef: buildRef('application-semantic', 'app/semantic-other'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 selection: C80/C81 — a selected subject without promotion/selection coverage fails closed (total coverage)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        // subject/selected-beta has NO coverage record.
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'COVERAGE_INCOMPLETE');
});

test('a41-004 selection: coverage for an unselected subject fails closed (no extra absorption)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta'),
        buildCoverage('subject/selected-gamma'),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 selection: C81 — stale promotion coverage is STALE, not silently accepted', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta', { promotionCurrentness: 'stale' }),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.code, 'COVERAGE_NOT_CURRENT');
});

test('a41-004 selection: revoked/voided promotion coverage fails closed', () => {
  for (const currentness of ['revoked', 'voided'] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        selectedDomainData: [
          buildCoverage('subject/selected-alpha'),
          buildCoverage('subject/selected-beta', { promotionCurrentness: currentness }),
        ],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'COVERAGE_INVALIDATED');
  }
});

test('a41-004 selection: undecidable promotion currentness fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta', { promotionCurrentness: 'maybe' }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 selection: coverage citing a different ApplicationSelectionRef fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta', {
          selectionCoverageRef: buildRef(ROLE.selection, 'selection/other-record'),
        }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 selection: R2/#381 P1-2 — coverage row naming the same primary identity under a different exact tuple fails closed', () => {
  // selection and Manifest agree on alpha@revision-r1, but the coverage row
  // names the same primary identity under a different revision: the exact
  // selected tuple — not the primary identity alone — must correspond, so
  // primary-identity coincidence is never accepted coverage
  // (DOMAIN_DATA_IR §2).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', {
            revisionIdentity: 'revision/alpha-r1',
          }),
          buildRef('selected-domain-data', 'subject/selected-beta'),
        ],
      }),
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', {
            revisionIdentity: 'revision/alpha-r1',
          }),
          buildRef('selected-domain-data', 'subject/selected-beta'),
        ],
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha', {
          subjectRef: buildRef('selected-domain-data', 'subject/selected-alpha', {
            revisionIdentity: 'revision/alpha-forged-r9',
          }),
        }),
        buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});


test('a41-004 selection: a promotion decision presented in the selection slot fails closed (selection != promotion)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        selectionRef: buildRef('promotion-decision', 'selection/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-004 selection: unauthorized selection issuer fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        issuerIdentity: 'id/outsider',
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ISSUER');
});

test('a41-004 selection: R1/#377 P1-3 — superseded or reselected selection is STALE for authoritative reuse', () => {
  for (const state of ['stale', 'superseded', 'reselected'] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        applicationSelection: buildSelectionFacts({
          reuseCurrentness: buildReuseCurrentness({ state }),
        }),
      }),
    );
    assert.equal(result.outcome, 'STALE');
    assert.equal(result.code, 'SELECTION_NOT_CURRENT');
  }
});

test('a41-004 selection: R1/#377 P1-3 — revoked or voided selection fails closed', () => {
  for (const state of ['revoked', 'voided'] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        applicationSelection: buildSelectionFacts({
          reuseCurrentness: buildReuseCurrentness({ state }),
        }),
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'SELECTION_INVALIDATED');
  }
});

test('a41-004 selection: R1/#377 P1-3 — selection currentness determination not covering the evaluation point is STALE', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 59 }),
      }),
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.code, 'SELECTION_NOT_CURRENT');
});

test('a41-004 selection: R1/#377 P1-3 — undecidable selection currentness state fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ state: 'maybe' }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 selection: R1/#377 P1-3 — currentness determination predating the selection issuance is malformed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 39 }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 selection: R2/#381 P1-3 — evaluation point predating the selection issuance fails closed (impossible temporal claim)', () => {
  // Reviewer counterexample: selection@40 / Manifest@50 / determination@60
  // with evaluationPoint=35 — both currentness checks would classify
  // `current` even though neither the selection nor the Manifest existed
  // at the claimed evaluation point. The artifact must exist at the
  // intended-use point (ASSEMBLY_PROFILES §8.2).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      evaluationPoint: 35,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 selection: R2/#381 P1-3 — deterministic precedence: an evaluation point predating issuance is malformed facts even when the selection is also revoked', () => {
  // The impossible-temporal-claim check (structural malformed facts)
  // dominates the revoked currentness state (C152/C171 family).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      evaluationPoint: 35,
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ state: 'revoked' }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});


test('a41-004 selection: R1/#377 P1-3 — deterministic precedence: revoked selection fails closed even when promotion coverage is also stale', () => {
  // Structural/authority violation (explicit invalidation, FAIL_CLOSED)
  // dominates the temporal stale coverage state (C152/C171).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ state: 'revoked' }),
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta', { promotionCurrentness: 'stale' }),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SELECTION_INVALIDATED');
});

test('a41-004 selection: R1/#377 P1-3 — deterministic precedence: selection currentness is decided before per-subject promotion currentness', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ state: 'superseded' }),
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta', { promotionCurrentness: 'stale' }),
      ],
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.code, 'SELECTION_NOT_CURRENT');
});
