// Issue #356 / A41-002 — authority ceiling. The A41-002 surface is a
// bounded CONSUMER/VERIFIER, never an issuer: the runtime surface is frozen
// to exactly the declared inventory, every exported symbol is a verify/
// classify function or a frozen vocabulary constant, no COMPATIBLE
// disposition is ever produced, the A41-001 foundation barrel is untouched,
// and the module stays portable (no Node built-ins in src).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as authority from '../../src/dac-v0041/authority/index.js';
import * as foundation from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES,
  DAC_V0041_END_ACT_KINDS,
  DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES,
} from '../../src/dac-v0041/authority/index.js';

const FROZEN_AUTHORITY_SURFACE = [
  'DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES',
  'DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS',
  'DAC_V0041_DESIGNATION_ISSUANCE_ROLE',
  'DAC_V0041_END_ACT_KINDS',
  'DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES',
  'classifyDacV0041HistoricAuthorityArtifactUse',
  'verifyDacV0041AuthorityAdoption',
  'verifyDacV0041DesignationChain',
] as const;

test('a41-002 ceiling: the authority runtime surface is exactly the declared inventory', () => {
  assert.deepEqual(Object.keys(authority).sort(), [...FROZEN_AUTHORITY_SURFACE].sort());
});

test('a41-002 ceiling: every exported symbol is a frozen vocabulary constant or a verify/classify function (consumer/verifier only)', () => {
  // No exported symbol names an issuance-side verb: this module can only
  // verify or classify PRESENTED facts; it never mints, issues, grants,
  // creates, revokes, relinquishes, approves, promotes, selects, binds,
  // activates or signs any designation/adoption/authority artifact.
  for (const key of Object.keys(authority)) {
    assert.match(key, /^(?:DAC_V0041_[A-Z_]+|verify[A-Za-z0-9]*|classify[A-Za-z0-9]*)$/u);
  }
  const functionSurface = Object.keys(authority)
    .filter((key) => !key.startsWith('DAC_V0041_'))
    .join(' ');
  for (const forbidden of [
    /mint/iu,
    /issu/iu,
    /grant/iu,
    /create/iu,
    /revoke/iu,
    /relinquish/iu,
    /approve/iu,
    /promot/iu,
    /select/iu,
    /activat/iu,
    /manifest/iu,
    /conformance/iu,
  ]) {
    assert.doesNotMatch(functionSurface, forbidden);
  }
});

test('a41-002 ceiling: no COMPATIBLE or INCOMPATIBLE disposition is ever produced', async () => {
  const sourceTexts = await Promise.all(
    ['contracts.ts', 'verifier.ts'].map((file) =>
      readFile(new URL(`../../src/dac-v0041/authority/${file}`, import.meta.url), 'utf8'),
    ),
  );
  for (const sourceText of sourceTexts) {
    assert.doesNotMatch(sourceText, /'COMPATIBLE'|'INCOMPATIBLE'/u);
  }
});

test('a41-002 ceiling: the module is portable — no Node built-ins or host drivers in the authority sources', async () => {
  for (const file of ['contracts.ts', 'verifier.ts', 'index.ts']) {
    const sourceText = await readFile(
      new URL(`../../src/dac-v0041/authority/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      sourceText,
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:|better-sqlite3|expo-sqlite)/u,
      `${file} must stay portable`,
    );
  }
});

test('a41-002 ceiling: the authority surface is NOT wired into the foundation barrel or any central export', () => {
  // A41-002's write set forbids central public export wiring; the authority
  // module stays reachable only through its own module path until an
  // explicit integration concern composes it.
  const foundationSurface = foundation as Record<string, unknown>;
  for (const authoritySymbol of FROZEN_AUTHORITY_SURFACE) {
    assert.equal(
      foundationSurface[authoritySymbol],
      undefined,
      `${authoritySymbol} must not leak into the foundation barrel`,
    );
  }
  // The A41-001 foundation inventory itself stays byte-stable (23 symbols).
  assert.equal(Object.keys(foundation).length, 23);
});

test('a41-002 ceiling: end-act and adoptable-class vocabularies are closed and disjoint from non-adoptable classes', () => {
  assert.deepEqual(DAC_V0041_END_ACT_KINDS, [
    'ordinary-expiry',
    'supersession',
    'prospective-revocation',
    'relinquishment',
    'retroactive-void',
  ]);
  for (const adoptable of DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES) {
    assert.equal(
      (DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).indexOf(adoptable),
      -1,
      `class ${adoptable} must not appear in both vocabularies`,
    );
  }
  // Designation (and its attestation specialization) can never be adopted.
  for (const designationClass of ['authority-designation', 'authority-designation-attestation']) {
    assert.equal(
      (DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).indexOf(designationClass),
      -1,
    );
  }
});
