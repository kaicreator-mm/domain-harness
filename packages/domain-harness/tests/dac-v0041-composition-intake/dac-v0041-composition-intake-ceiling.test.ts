// Issue #358 / A41-004 — authority ceiling. The A41-004 surface is a
// bounded CONSUMER/VERIFIER, never an issuer: the runtime surface is frozen
// to exactly the declared inventory, every exported symbol is a verify
// function or a frozen vocabulary constant, no COMPATIBLE disposition is
// ever produced, the A41-001 foundation and A41-002 authority barrels stay
// untouched, and the module stays portable (no Node built-ins in src).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as compositionIntake from '../../src/dac-v0041/composition-intake/index.js';
import * as foundation from '../../src/dac-v0041/index.js';
import * as authority from '../../src/dac-v0041/authority/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import { buildValidIntakeInput } from './helpers.js';

const FROZEN_COMPOSITION_INTAKE_SURFACE = [
  'DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS',
  'DAC_V0041_COMPOSITION_INTAKE_EVIDENCE_ROLES',
  'DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES',
  'verifyDacV0041AuthorityRefusalEvidence',
  'verifyDacV0041CompositionIntake',
] as const;

test('a41-004 ceiling: the composition-intake runtime surface is exactly the declared inventory', () => {
  assert.deepEqual(Object.keys(compositionIntake).sort(), [
    ...FROZEN_COMPOSITION_INTAKE_SURFACE,
  ].sort());
});

test('a41-004 ceiling: every exported symbol is a frozen vocabulary constant or a verify function (consumer/verifier only)', () => {
  for (const key of Object.keys(compositionIntake)) {
    assert.match(key, /^(?:DAC_V0041_[A-Z_]+|verify[A-Za-z0-9]*)$/u);
  }
  const functionSurface = Object.keys(compositionIntake)
    .filter((key) => !key.startsWith('DAC_V0041_'))
    .join(' ');
  // No issuance-side verb: this module can only verify or classify
  // PRESENTED facts; it never mints, issues, establishes, selects, refuses
  // (issues a refusal), promotes, binds, activates, drafts or publishes any
  // identity/selection/refusal/Manifest/promotion artifact.
  for (const forbidden of [
    /mint/iu,
    /issu/iu,
    /establish/iu,
    /select/iu,
    /promot/iu,
    /grant/iu,
    /create/iu,
    /revoke/iu,
    /relinquish/iu,
    /approv/iu,
    /activat/iu,
    /absorb/iu,
    /repair/iu,
    /publish/iu,
    /draft/iu,
    /sign/iu,
  ]) {
    assert.doesNotMatch(functionSurface, forbidden);
  }
});

test('a41-004 ceiling: no COMPATIBLE disposition or evaluation outcome is ever produced', () => {
  const result = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /COMPATIBLE|INCOMPATIBLE/u);
  assert.equal(result.outcome, 'INTAKE_VERIFIED');
});

test('a41-004 ceiling: never throws on malformed/hostile inputs — every failure is a typed FAIL_CLOSED result', () => {
  const hostileInputs: unknown[] = [
    null,
    undefined,
    42,
    'text',
    {},
    { applicationIdentityEstablishment: {} },
  ];
  for (const hostile of hostileInputs) {
    const result = verifyDacV0041CompositionIntake(
      hostile as Parameters<typeof verifyDacV0041CompositionIntake>[0],
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
});

test('a41-004 ceiling: deterministic and pure — identical facts yield deeply identical results', () => {
  const a = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  const b = verifyDacV0041CompositionIntake(buildValidIntakeInput());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('a41-004 ceiling: the foundation and authority barrels are not re-exported or extended', () => {
  assert.equal(Object.keys(foundation).includes('verifyDacV0041CompositionIntake'), false);
  assert.equal(Object.keys(authority).includes('verifyDacV0041CompositionIntake'), false);
});

test('a41-004 ceiling: src stays portable — no Node built-in imports in the composition-intake module', async () => {
  for (const file of ['contracts.ts', 'verifier.ts', 'index.ts']) {
    const source = await readFile(
      new URL(`../../src/dac-v0041/composition-intake/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /from 'node:/u);
  }
});

test('a41-004 ceiling: frozen vocabulary constants match the F-04 §4.2 seam vocabulary exactly', () => {
  assert.deepEqual([...compositionIntake.DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS], [
    'authority-designation-issuance',
    'application-identity-establishment',
    'manifest-issuance',
    'runtime-binding',
    'runtime-activation',
  ]);
  assert.equal(
    compositionIntake.DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES['runtime-binding'],
    'runtime-binding-request',
  );
  assert.notEqual(
    compositionIntake.DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES['runtime-binding'],
    compositionIntake.DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES['runtime-activation'],
  );
});
