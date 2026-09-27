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
  buildSelectedSubjectRef,
  buildSelectionFacts,
  buildValidIntakeInput,
} from './helpers.js';
import type { DacV0041Reference } from '../../src/dac-v0041/index.js';

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
  // selection and Manifest agree on the COMPLETE alpha tuple (s1/r1/d1),
  // but the coverage row names the same primary identity under a different
  // complete revision: the exact selected tuple — not the primary identity
  // alone — must correspond, so primary-identity coincidence is never
  // accepted coverage (DOMAIN_DATA_IR §2).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        selectedDomainDataRefs: [
          buildSelectedSubjectRef('subject/selected-alpha'),
          buildSelectedSubjectRef('subject/selected-beta'),
        ],
      }),
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildSelectedSubjectRef('subject/selected-alpha'),
          buildSelectedSubjectRef('subject/selected-beta'),
        ],
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha', {
          subjectRef: buildSelectedSubjectRef('subject/selected-alpha', {
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

test('a41-004 selection: R3/#385 P1-1 — an omitted semanticIdentity/revisionIdentity/contentDigest on a selection selected ref fails closed INCOMPLETE_SELECTED_TUPLE', () => {
  // The canonical valid intake itself was the R2 counterexample: the
  // default fixtures selected only authorityScope + primaryIdentity, and
  // the null-normalizing tuple key let selection/Manifest/coverage
  // "correspond" on [scope, primary, null, null, null] all the way to
  // INTAKE_VERIFIED. Under R3 every consumed selected-domain-data ref must
  // carry the complete exact tuple BEFORE correspondence/coverage. Each
  // variant omits exactly one component; the counterexample that closed
  // the P1 is the omission making beta's exactness unknown.
  for (const [missing, present] of [
    ['semanticIdentity', { revisionIdentity: 'revision/beta-r1', contentDigest: 'digest/beta-d1' }],
    ['revisionIdentity', { semanticIdentity: 'semantic/beta-s1', contentDigest: 'digest/beta-d1' }],
    ['contentDigest', { semanticIdentity: 'semantic/beta-s1', revisionIdentity: 'revision/beta-r1' }],
  ] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        applicationSelection: buildSelectionFacts({
          selectedDomainDataRefs: [
            buildSelectedSubjectRef('subject/selected-alpha'),
            buildRef('selected-domain-data', 'subject/selected-beta', present),
          ],
        }),
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INCOMPLETE_SELECTED_TUPLE');
    assert.match(result.detail, new RegExp(missing, 'u'));
  }
});

test('a41-004 selection: R3/#385 P1-1 — an omitted exactness component on a coverage subject ref fails closed INCOMPLETE_SELECTED_TUPLE', () => {
  // Coverage rows are consumed through the same complete-tuple material
  // rule: a coverage subjectRef whose exactness is partially unknown can
  // never be reconciled against the selection/Manifest tuples.
  for (const [missing, present] of [
    ['semanticIdentity', { revisionIdentity: 'revision/beta-r1', contentDigest: 'digest/beta-d1' }],
    ['revisionIdentity', { semanticIdentity: 'semantic/beta-s1', contentDigest: 'digest/beta-d1' }],
    ['contentDigest', { semanticIdentity: 'semantic/beta-s1', revisionIdentity: 'revision/beta-r1' }],
  ] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        selectedDomainData: [
          buildCoverage('subject/selected-alpha'),
          buildCoverage('subject/selected-beta', {
            subjectRef: buildRef('selected-domain-data', 'subject/selected-beta', present),
          }),
        ],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INCOMPLETE_SELECTED_TUPLE');
    assert.match(result.detail, new RegExp(missing, 'u'));
  }
});

test('a41-004 selection: R3/#385 P1-1 — an incomplete tuple fails closed even when selection/Manifest/coverage all agree on the SAME incomplete shape', () => {
  // The exact reviewer counterexample: every position presents the same
  // selected subjects omitting semantic/revision/digest. Tuple keys become
  // identical [scope, primary, null, null, null] values, so R2
  // correspondence + coverage + currentness all closed and the verifier
  // could return INTAKE_VERIFIED with revision/content exactness unknown.
  // R3 fails closed before correspondence regardless of the agreement.
  for (const present of [
    { revisionIdentity: 'revision/alpha-r1', contentDigest: 'digest/alpha-d1' },
    { semanticIdentity: 'semantic/alpha-s1', contentDigest: 'digest/alpha-d1' },
    { semanticIdentity: 'semantic/alpha-s1', revisionIdentity: 'revision/alpha-r1' },
  ] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        applicationSelection: buildSelectionFacts({
          selectedDomainDataRefs: [
            buildRef('selected-domain-data', 'subject/selected-alpha', present),
            buildRef('selected-domain-data', 'subject/selected-beta'),
          ],
        }),
        manifest: buildManifestFacts({
          selectedDomainDataRefs: [
            buildRef('selected-domain-data', 'subject/selected-alpha', present),
            buildRef('selected-domain-data', 'subject/selected-beta'),
          ],
        }),
        selectedDomainData: [
          buildCoverage('subject/selected-alpha', {
            subjectRef: buildRef('selected-domain-data', 'subject/selected-alpha', present),
          }),
          buildCoverage('subject/selected-beta'),
        ],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INCOMPLETE_SELECTED_TUPLE');
  }
});

test('a41-004 selection: R3/#385 P1-1 — deterministic precedence: an incomplete selected tuple fails closed before reuse-currentness classification', () => {
  // The completeness gate is required material BEFORE
  // correspondence/coverage/currentness; a revoked selection (which would
  // fail SELECTION_INVALIDATED at 10d) never masks an incomplete tuple.
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', {
            semanticIdentity: 'semantic/alpha-s1',
            revisionIdentity: 'revision/alpha-r1',
          }),
          buildSelectedSubjectRef('subject/selected-beta'),
        ],
        reuseCurrentness: buildReuseCurrentness({ state: 'revoked' }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INCOMPLETE_SELECTED_TUPLE');
});

test('a41-004 selection: R3/#385 P1-1 — the mint API never issues a blank exactness component (INVALID_REFERENCE at mint)', () => {
  // Blank material cannot even become a minted selected-domain-data
  // reference: the foundation adopt path requires every present identity
  // component to be a non-empty exact identity string. The verifier's
  // completeness gate treats a hypothetical blank exactly like an omitted
  // component (fail closed), so blank fails closed at every layer.
  for (const blank of ['', '   ']) {
    assert.throws(
      () =>
        buildSelectedSubjectRef('subject/selected-alpha', {
          semanticIdentity: 'semantic/alpha-s1',
          revisionIdentity: 'revision/alpha-r1',
          contentDigest: blank,
        }),
      /INVALID_REFERENCE|non-empty/u,
    );
  }
});

test('a41-004 selection: R3/#385 P1-1 — a hand-forged carrier carrying a blank exactness component fails closed as FOREIGN_EVIDENCE (carrier dominates)', () => {
  // A blank component can only ride a FORGED carrier (mint rejects it), and
  // the minted-carrier pass dominates the completeness pass: structural
  // carrier validation fires FOREIGN_EVIDENCE first. Fail-closed either
  // way — blank is never admitted anywhere.
  const complete = buildSelectedSubjectRef('subject/selected-alpha');
  const forged = {
    ...complete,
    revisionIdentity: '',
  } as DacV0041Reference;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      selectedDomainData: [
        buildCoverage('subject/selected-alpha', { subjectRef: forged }),
        buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
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
