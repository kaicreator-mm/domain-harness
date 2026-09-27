// Issue #358 / A41-004 — Manifest successor-evidence intake
// (APPLICATION_MANIFEST §§1–4 under N-002 precedence; C88/C81): the exact
// Manifest evidence is VERIFIED without Manifest issuance and without
// absorbing live Runtime state; identity separation holds; a draft or
// mutable alias never occupies a Manifest position; selection precedes
// Manifest issuance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  SCOPE,
  buildCoverage,
  buildManifestFacts,
  buildRef,
  buildReuseCurrentness,
  buildSelectionFacts,
  buildValidIntakeInput,
  v003Predecessor,
} from './helpers.js';

test('a41-004 manifest: valid Manifest successor evidence verifies at intake (verified, never issued)', () => {
  const result = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
  assert.equal(result.manifestIdentity, 'manifest/record-1');
});

test('a41-004 manifest: Manifest issuance must follow the selection issuance point', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        issuanceEvidence: { point: 35, assertedBy: ['id/registry-witness'] },
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ESTABLISHMENT_ORDER_VIOLATED');
});

test('a41-004 manifest: ManifestIdentity aliasing the content digest fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        manifestContentDigestRef: buildRef('manifest-content-digest', 'manifest/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 manifest: ManifestIdentity aliasing the selection identity fails closed (Manifest never manufactures selection)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        manifestRef: buildRef('manifest', 'selection/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 manifest: ManifestIdentity aliasing the application revision fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        applicationRevisionRef: buildRef('application-revision', 'manifest/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'IDENTITY_ALIAS');
});

test('a41-004 manifest: a ManifestDraft-shaped request reference in the Manifest slot fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        manifestRef: buildRef('manifest-issuance-request', 'manifest/record-1'),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-004 manifest: C145 — predecessor-wrapped Manifest evidence fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        manifestRef: buildRef('manifest', 'manifest/record-1', {
          predecessorOrigin: v003Predecessor(),
        }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'PREDECESSOR_WRAPPED');
});

test('a41-004 manifest: R1/#377 P1-2 — Manifest claiming a subject the selection did not select fails closed (exact selected-subject correspondence)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha'),
          buildRef('selected-domain-data', 'subject/selected-gamma'),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 manifest: R1/#377 P1-2 — Manifest-only subject with a syntactically complete forged coverage row still fails closed', () => {
  // selection = {alpha,beta}; Manifest = {alpha,gamma}; the attacker also
  // forges a complete coverage row for gamma naming the PRESENTED
  // ApplicationSelectionRef with current promotion. Exact selected-subject
  // correspondence fails closed before any coverage row is consulted — a
  // Manifest must not retroactively manufacture selection authority
  // (APPLICATION_MANIFEST §2).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha'),
          buildRef('selected-domain-data', 'subject/selected-gamma'),
        ],
      }),
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

test('a41-004 manifest: R1/#377 P1-2 — a selection subject absent from the Manifest composition fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [buildRef('selected-domain-data', 'subject/selected-alpha')],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 manifest: R1/#377 P1-2 — a repeated selected subject identity fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha'),
          buildRef('selected-domain-data', 'subject/selected-alpha'),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 manifest: R2/#381 P1-2 — same primary identity under a different revision/digest fails closed (full exact selected tuple)', () => {
  // The reviewer counterexample: selection-side and Manifest-side refs share
  // primaryIdentity "subject/selected-alpha" but the Manifest ref carries a
  // different revisionIdentity/contentDigest, with otherwise valid minted
  // carriers and complete coverage rows naming the same
  // ApplicationSelectionRef. Primary-identity correspondence admits a
  // Manifest revision/digest the selection never selected; the full exact
  // tuple (DOMAIN_DATA_IR §2) must correspond instead.
  for (const forged of [
    { revisionIdentity: 'revision/alpha-forged-r9' },
    { contentDigest: 'digest/alpha-forged-d9' },
  ] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        manifest: buildManifestFacts({
          selectedDomainDataRefs: [
            buildRef('selected-domain-data', 'subject/selected-alpha', forged),
            buildRef('selected-domain-data', 'subject/selected-beta'),
          ],
        }),
        selectedDomainData: [
          buildCoverage('subject/selected-alpha'),
          buildCoverage('subject/selected-beta'),
        ],
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'SUBJECT_MISMATCH');
  }
});

test('a41-004 manifest: R2/#381 P1-2 — same primary identity under a different authority scope fails closed (full exact selected tuple)', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', {
            authorityScope: SCOPE.other,
          }),
          buildRef('selected-domain-data', 'subject/selected-beta'),
        ],
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha'),
        buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 manifest: R2/#381 P1-2 — a selection subject whose exact tuple is absent from the Manifest composition fails closed', () => {
  // selection alpha carries revision r1; the Manifest keeps the primary
  // identity but drops the exact revision, so the selected exact tuple is
  // absent from the composition (material identity change without a new
  // Manifest revision — APPLICATION_MANIFEST §6).
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
      selectedDomainData: [
        buildCoverage('subject/selected-alpha', {
          subjectRef: buildRef('selected-domain-data', 'subject/selected-alpha', {
            revisionIdentity: 'revision/alpha-r1',
          }),
        }),
        buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-004 manifest: R2/#381 P1-2 — identical full exact tuples on selection, Manifest and coverage verify (exact-tuple positive control)', () => {
  const exactAlpha = {
    semanticIdentity: 'semantic/alpha-s1',
    revisionIdentity: 'revision/alpha-r1',
    contentDigest: 'digest/alpha-d1',
  } as const;
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      applicationSelection: buildSelectionFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', exactAlpha),
          buildRef('selected-domain-data', 'subject/selected-beta'),
        ],
      }),
      manifest: buildManifestFacts({
        selectedDomainDataRefs: [
          buildRef('selected-domain-data', 'subject/selected-alpha', exactAlpha),
          buildRef('selected-domain-data', 'subject/selected-beta'),
        ],
      }),
      selectedDomainData: [
        buildCoverage('subject/selected-alpha', {
          subjectRef: buildRef('selected-domain-data', 'subject/selected-alpha', exactAlpha),
        }),
        buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
});


test('a41-004 manifest: R1/#377 P1-3 — stale or superseded Manifest revision is STALE, never silently reused', () => {
  for (const state of ['stale', 'superseded'] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        manifest: buildManifestFacts({
          reuseCurrentness: buildReuseCurrentness({ state }),
        }),
      }),
    );
    assert.equal(result.outcome, 'STALE');
    assert.equal(result.code, 'MANIFEST_NOT_CURRENT');
  }
});

test('a41-004 manifest: R1/#377 P1-3 — revoked or voided Manifest fails closed', () => {
  for (const state of ['revoked', 'voided'] as const) {
    const result = verifyDacV0041CompositionIntake(
      buildValidIntakeInput({
        manifest: buildManifestFacts({
          reuseCurrentness: buildReuseCurrentness({ state }),
        }),
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'MANIFEST_INVALIDATED');
  }
});

test('a41-004 manifest: R1/#377 P1-3 — Manifest currentness determination not covering the evaluation point is STALE', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 59 }),
      }),
    }),
  );
  assert.equal(result.outcome, 'STALE');
  assert.equal(result.code, 'MANIFEST_NOT_CURRENT');
});

test('a41-004 manifest: R1/#377 P1-3 — undecidable Manifest currentness state fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        // `reselected` is a selection-only state, not a Manifest state.
        reuseCurrentness: buildReuseCurrentness({ state: 'reselected' }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 manifest: R1/#377 P1-3 — currentness determination predating the Manifest issuance is malformed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 49 }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 manifest: R2/#381 P1-3 — evaluation point after selection issuance but before Manifest issuance fails closed', () => {
  // Normal fixture ordering: selection@40 / Manifest@50 / determination@60.
  // An intended use at 45 postdates the selection but predates the Manifest
  // issuance point — the Manifest did not exist at the claimed use point,
  // so no currentness determination can make it current there
  // (ASSEMBLY_PROFILES §8.2 / APPLICATION_MANIFEST §7).
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      evaluationPoint: 45,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-004 manifest: R2/#381 P1-3 — evaluation point exactly at the Manifest issuance point is a valid intended-use point', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      evaluationPoint: 50,
      applicationSelection: buildSelectionFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 50 }),
      }),
      manifest: buildManifestFacts({
        reuseCurrentness: buildReuseCurrentness({ establishedAt: 50 }),
      }),
    }),
  );
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
});


test('a41-004 manifest: unauthorized Manifest issuer fails closed', () => {
  const result = verifyDacV0041CompositionIntake(
    buildValidIntakeInput({
      manifest: buildManifestFacts({ issuerIdentity: 'id/composer-x' }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ISSUER');
});

test('a41-004 manifest: no live-state absorption — the verifier output is plain data and the input facts are untouched', () => {
  const input = buildValidIntakeInput();
  const snapshot = JSON.stringify({
    e: input.applicationIdentityEstablishment.issuanceEvidence,
    m: input.manifest.issuanceEvidence,
    c: input.selectedDomainData.map((coverage) => coverage.promotionCurrentness),
  });
  const first = verifyDacV0041CompositionIntake(input);
  const second = verifyDacV0041CompositionIntake(input);
  assert.deepEqual(first, second);
  assert.equal(
    JSON.stringify({
      e: input.applicationIdentityEstablishment.issuanceEvidence,
      m: input.manifest.issuanceEvidence,
      c: input.selectedDomainData.map((coverage) => coverage.promotionCurrentness),
    }),
    snapshot,
  );
  // No runtime state channel exists on the result at all.
  assert.equal(Object.isFrozen((first as { coveredSubjectIdentities: readonly string[] }).coveredSubjectIdentities), true);
});
