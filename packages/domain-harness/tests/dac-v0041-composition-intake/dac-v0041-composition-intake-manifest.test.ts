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
  buildManifestFacts,
  buildRef,
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

test('a41-004 manifest: Manifest claiming a subject the selection did not select fails closed (no composition absorption)', () => {
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
  assert.equal(result.code, 'COVERAGE_INCOMPLETE');
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
