// Issue #357 / A41-003 — authority ceiling, purity and bounded-verdict
// suite. The A41-003 surface is a bounded CONSUMER/VERIFIER, never an
// issuer: the runtime surface is frozen to exactly the declared inventory,
// every exported symbol is a verify/classify function or a frozen
// vocabulary constant, a compatibility PASS is a distinct bounded verdict
// implying nothing about ApplicationSelection/RuntimeBinding/
// RuntimeActivation (APPLICATION_MANIFEST §10; C107), the A41-001
// foundation barrel is untouched, no dac-v003 semantics are touched, and
// the module stays portable (no Node built-ins in src).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as compatibility from '../../src/dac-v0041/compatibility/index.js';
import * as foundation from '../../src/dac-v0041/index.js';
import {
  buildAssociationInput,
  buildPrecedenceFacts,
  buildRefusalEvidence,
} from './helpers.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041AuthorityRefusalEvidence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../src/dac-v0041/compatibility/index.js';

const FROZEN_COMPATIBILITY_SURFACE = [
  'DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS',
  'DAC_V0041_COMPATIBILITY_DISPOSITIONS',
  'DAC_V0041_COMPATIBILITY_SEAM_ROLES',
  'classifyDacV0041CompatibilityPrecedence',
  'verifyDacV0041AuthorityRefusalEvidence',
  'verifyDacV0041CompatibilityViewAssociation',
] as const;

test('a41-003 ceiling: the compatibility runtime surface is exactly the declared inventory', () => {
  assert.deepEqual(Object.keys(compatibility).sort(), [...FROZEN_COMPATIBILITY_SURFACE].sort());
});

test('a41-003 ceiling: every exported symbol is a frozen vocabulary constant or a verify/classify function (consumer/verifier only)', () => {
  for (const key of Object.keys(compatibility)) {
    assert.match(key, /^(?:DAC_V0041_[A-Z_]+|verify[A-Za-z0-9]*|classify[A-Za-z0-9]*)$/u);
  }
  const functionSurface = Object.keys(compatibility)
    .filter((key) => !key.startsWith('DAC_V0041_'))
    .join(' ');
  // No exported symbol names an issuance-side or authority-expansion verb:
  // this module can only verify or classify PRESENTED facts; it never
  // mints, issues, designates, selects, binds, activates, promotes or
  // reconciles anything.
  for (const forbidden of [
    /mint/iu,
    /issu/iu,
    /grant/iu,
    /designate/iu,
    /select/iu,
    /bind/iu,
    /activat/iu,
    /promot/iu,
    /reconcil/iu,
    /manifest/iu,
    /adopt/iu,
  ]) {
    assert.doesNotMatch(functionSurface, forbidden);
  }
});

test('a41-003 ceiling: compatibility PASS is a distinct bounded verdict — no selection/binding/activation field is derivable', () => {
  const verdict = classifyDacV0041CompatibilityPrecedence(buildPrecedenceFacts());
  assert.ok(verdict.outcome === 'COMPATIBLE_VERDICT');
  assert.equal(verdict.impliesApplicationSelection, false);
  assert.equal(verdict.impliesRuntimeBinding, false);
  assert.equal(verdict.impliesRuntimeActivation, false);
  for (const key of Object.keys(verdict)) {
    // The only permitted occurrence of those nouns is the explicit negative
    // implication marker family (implies*: false) — no affirmative
    // selection/binding/activation field may exist.
    if (!key.startsWith('implies')) {
      assert.doesNotMatch(key, /select|binding|activation|manifest/iu);
    }
  }
  const association = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput());
  assert.ok(association.outcome === 'VALID_TWO_VIEW');
  for (const key of Object.keys(association)) {
    assert.doesNotMatch(key, /select|binding|activation|manifest/iu);
  }
});

test('a41-003 ceiling: refusal evidence classification structurally cannot manufacture authority', () => {
  const refusal = verifyDacV0041AuthorityRefusalEvidence(buildRefusalEvidence());
  assert.ok(refusal.outcome === 'REFUSAL_EVIDENCE');
  assert.equal(refusal.canManufactureAuthority, false);
  assert.equal(refusal.canProduceCompatibilityPass, false);
});

test('a41-003 ceiling: the module is portable — no Node built-ins or host drivers in the compatibility sources', async () => {
  for (const file of ['contracts.ts', 'verifier.ts', 'index.ts']) {
    const sourceText = await readFile(
      new URL(`../../src/dac-v0041/compatibility/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      sourceText,
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:|better-sqlite3|expo-sqlite)/u,
      `${file} must stay portable`,
    );
  }
});

test('a41-003 ceiling: the compatibility surface is NOT wired into the foundation barrel or any central export', () => {
  const foundationSurface = foundation as Record<string, unknown>;
  for (const compatibilitySymbol of FROZEN_COMPATIBILITY_SURFACE) {
    assert.equal(
      foundationSurface[compatibilitySymbol],
      undefined,
      `${compatibilitySymbol} must not leak into the foundation barrel`,
    );
  }
  // The A41-001 foundation inventory itself stays byte-stable (23 symbols).
  assert.equal(Object.keys(foundation).length, 23);
});

test('a41-003 ceiling: purity — the verifiers never mutate their inputs and return JSON-representable results', () => {
  const associationInput = buildAssociationInput();
  const associationSnapshot = JSON.parse(JSON.stringify(associationInput)) as unknown;
  const associationResult = verifyDacV0041CompatibilityViewAssociation(associationInput);
  assert.deepEqual(JSON.parse(JSON.stringify(associationInput)), associationSnapshot);
  JSON.parse(JSON.stringify(associationResult));

  const precedenceFacts = buildPrecedenceFacts({
    refusalEvidence: [buildRefusalEvidence()],
  });
  const precedenceSnapshot = JSON.parse(JSON.stringify(precedenceFacts)) as unknown;
  const precedenceResult = classifyDacV0041CompatibilityPrecedence(precedenceFacts);
  assert.deepEqual(JSON.parse(JSON.stringify(precedenceFacts)), precedenceSnapshot);
  JSON.parse(JSON.stringify(precedenceResult));
});

test('a41-003 ceiling: totality — hostile inputs produce typed fail-closed results and never throw', () => {
  const hostileCarriers: unknown[] = [
    undefined,
    null,
    42,
    'string',
    true,
    [],
    new Proxy({}, {}),
  ];
  for (const carrier of hostileCarriers) {
    let associationOutcome: string | undefined;
    try {
      associationOutcome = verifyDacV0041CompatibilityViewAssociation(
        carrier as never,
      ).outcome;
    } catch {
      assert.fail('view association verifier threw on hostile input');
    }
    assert.equal(associationOutcome, 'FAIL_CLOSED');

    let precedenceOutcome: string | undefined;
    try {
      precedenceOutcome = classifyDacV0041CompatibilityPrecedence(carrier as never).outcome;
    } catch {
      assert.fail('precedence classifier threw on hostile input');
    }
    assert.equal(precedenceOutcome, 'FAIL_CLOSED');

    let refusalOutcome: string | undefined;
    try {
      refusalOutcome = verifyDacV0041AuthorityRefusalEvidence(carrier as never).outcome;
    } catch {
      assert.fail('refusal verifier threw on hostile input');
    }
    assert.equal(refusalOutcome, 'FAIL_CLOSED');
  }
});

test('a41-003 ceiling: the seam role vocabulary stays the frozen C89/F-05 chain and refusal seams stay frozen', () => {
  assert.deepEqual(compatibility.DAC_V0041_COMPATIBILITY_SEAM_ROLES, [
    'compatibility-validation-request',
    'compatibility-validation',
    'compatibility-result',
  ]);
  assert.deepEqual(compatibility.DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS, [
    'authority-designation',
    'application-identity-establishment',
    'manifest-issuance',
    'runtime-binding',
    'runtime-activation',
  ]);
  assert.deepEqual(compatibility.DAC_V0041_COMPATIBILITY_DISPOSITIONS, [
    'COMPATIBLE',
    'INCOMPATIBLE',
  ]);
});
