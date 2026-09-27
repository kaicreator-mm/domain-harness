// Issue #359 / A41-005 — authority ceiling, purity and bounded-verdict
// suite. The A41-005 surface is a bounded CONSUMER/VERIFIER, never an
// issuer: the runtime surface is frozen to exactly the declared inventory,
// every exported symbol is a verify/classify function or a frozen
// vocabulary constant, a verified binding is not an activation (C107;
// ASSEMBLY_LIFECYCLE §12/§13), activation cannot manufacture the upstream
// authority its binding bundle did not prove, upstream A41-002/-003/-004
// verdicts are consumed and never absorbed, the A41-001 foundation barrel
// is untouched, no dac-v003 semantics are touched, and the module stays
// portable (no Node built-ins in src).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as runtime from '../../src/dac-v0041/runtime/index.js';
import * as foundation from '../../src/dac-v0041/index.js';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import {
  buildValidActivationInput,
  buildValidBindingInput,
  buildValidIntakeInput,
  IDENTITY,
} from './helpers.js';

const FROZEN_RUNTIME_SURFACE = [
  'DAC_V0041_RUNTIME_SEAM_ROLES',
  'DAC_V0041_RUNTIME_REUSE_CURRENTNESS_STATES',
  'DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES',
  'DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES',
  'verifyDacV0041RuntimeBinding',
  'verifyDacV0041RuntimeActivation',
  'classifyDacV0041BusinessSorTruthSource',
] as const;

test('a41-005 ceiling: the runtime surface is exactly the declared inventory', () => {
  assert.deepEqual(Object.keys(runtime).sort(), [...FROZEN_RUNTIME_SURFACE].sort());
});

test('a41-005 ceiling: every exported symbol is a frozen vocabulary constant or a verify/classify function (consumer/verifier only)', () => {
  for (const key of Object.keys(runtime)) {
    assert.match(key, /^(?:DAC_V0041_[A-Z_]+|verify[A-Za-z0-9]*|classify[A-Za-z0-9]*)$/u);
  }
  const functionSurface = Object.keys(runtime)
    .filter((key) => !key.startsWith('DAC_V0041_'))
    .join(' ');
  // No exported symbol names an issuance-side or authority-expansion verb:
  // this module can only verify or classify PRESENTED facts; it never
  // mints, issues, designates, selects, promotes, adopts, drafts or
  // publishes anything. (Binding/activation NOUNS legitimately appear in
  // verify-target names; the verbs above are what issuance would require.)
  for (const forbidden of [
    /mint/iu,
    /issu/iu,
    /grant/iu,
    /designat/iu,
    /select/iu,
    /promot/iu,
    /reconcil/iu,
    /adopt/iu,
    /draft/iu,
    /publish/iu,
  ]) {
    assert.doesNotMatch(functionSurface, forbidden);
  }
});

test('a41-005 ceiling: a verified binding is a bounded verdict — no activation/upstream field is derivable', () => {
  const result = verifyDacV0041RuntimeBinding(buildValidBindingInput());
  assert.ok(result.outcome === 'BINDING_VERIFIED');
  assert.equal(result.impliesRuntimeActivation, false);
  assert.equal(result.impliesApplicationSelection, false);
  assert.equal(result.isExternalBusinessSorTruth, false);
  for (const key of Object.keys(result)) {
    // The only permitted occurrence of an upstream authority noun is the
    // explicit negative implication marker family (implies*/is*: false) —
    // no affirmative activation/selection/promotion/SoR-truth field may
    // exist. (manifest*/compat* identity fields reference the verified
    // SUBJECT, not an upstream verdict, and stay permitted.)
    if (!key.startsWith('implies') && !key.startsWith('is')) {
      assert.doesNotMatch(key, /activation|select|promot|sor/iu);
    }
  }
});

test('a41-005 ceiling: activation manufactures no upstream authority its binding bundle did not prove', () => {
  const tamperedBinding = buildValidBindingInput();
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      binding: {
        ...tamperedBinding,
        compositionIntake: buildValidIntakeInput({
          manifest: {
            ...tamperedBinding.compositionIntake.manifest,
            reuseCurrentness: {
              state: 'revoked',
              establishedAt: 75,
              assertedBy: [IDENTITY.witness],
            },
          },
        }),
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_NOT_ESTABLISHED');
  assert.equal(result.bindingCode, 'COMPOSITION_INTAKE_INVALID');
});

test('a41-005 ceiling: upstream A41-002/-003/-004 verdicts are consumed, never re-evaluated or absorbed', () => {
  // Tampering the upstream compatibility verdict flips the binding result:
  // the Runtime seam has no independent path around the upstream gates.
  const input = buildValidBindingInput();
  const incompatible = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        authoritativeResults: [
          {
            ...input.compatibility.precedenceFacts.authoritativeResults[0]!,
            disposition: 'INCOMPATIBLE',
          },
        ],
        assertedDisposition: 'INCOMPATIBLE',
      },
    },
  });
  assert.ok(incompatible.outcome === 'FAIL_CLOSED');
  assert.equal(incompatible.code, 'COMPATIBILITY_NOT_ESTABLISHED');
});

test('a41-005 ceiling: the runtime surface is NOT wired into the foundation barrel or any central export', () => {
  const foundationSurface = foundation as Record<string, unknown>;
  for (const runtimeSymbol of FROZEN_RUNTIME_SURFACE) {
    assert.equal(
      foundationSurface[runtimeSymbol],
      undefined,
      `${runtimeSymbol} must not leak into the foundation barrel`,
    );
  }
  // The A41-001 foundation inventory itself stays byte-stable (23 symbols).
  assert.equal(Object.keys(foundation).length, 23);
});

test('a41-005 ceiling: purity — the verifiers never mutate their inputs and return JSON-representable results', () => {
  const bindingInput = buildValidBindingInput();
  const bindingSnapshot = JSON.parse(JSON.stringify(bindingInput)) as unknown;
  const bindingResult = verifyDacV0041RuntimeBinding(bindingInput);
  assert.deepEqual(JSON.parse(JSON.stringify(bindingInput)), bindingSnapshot);
  JSON.parse(JSON.stringify(bindingResult));

  const activationInput = buildValidActivationInput();
  const activationSnapshot = JSON.parse(JSON.stringify(activationInput)) as unknown;
  const activationResult = verifyDacV0041RuntimeActivation(activationInput);
  assert.deepEqual(JSON.parse(JSON.stringify(activationInput)), activationSnapshot);
  JSON.parse(JSON.stringify(activationResult));
});

test('a41-005 ceiling: totality — hostile inputs produce typed fail-closed results and never throw', () => {
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
    let bindingOutcome: string | undefined;
    try {
      bindingOutcome = verifyDacV0041RuntimeBinding(carrier as never).outcome;
    } catch {
      assert.fail('binding verifier threw on hostile input');
    }
    assert.equal(bindingOutcome, 'FAIL_CLOSED');

    let activationOutcome: string | undefined;
    try {
      activationOutcome = verifyDacV0041RuntimeActivation(carrier as never).outcome;
    } catch {
      assert.fail('activation verifier threw on hostile input');
    }
    assert.equal(activationOutcome, 'FAIL_CLOSED');

    let sorOutcome: string | undefined;
    try {
      sorOutcome = classifyDacV0041BusinessSorTruthSource(carrier as never).outcome;
    } catch {
      assert.fail('SoR boundary classifier threw on hostile input');
    }
    assert.equal(sorOutcome, 'FAIL_CLOSED');
  }
});

test('a41-005 ceiling: the module is portable — no Node built-ins or host drivers in the runtime sources', async () => {
  for (const file of ['contracts.ts', 'verifier.ts', 'index.ts']) {
    const sourceText = await readFile(
      new URL(`../../src/dac-v0041/runtime/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      sourceText,
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:|better-sqlite3|expo-sqlite)/u,
      `${file} must stay portable`,
    );
  }
});

test('a41-005 ceiling: the runtime module imports only reviewed successor modules — no historical adapter is touched', async () => {
  for (const file of ['contracts.ts', 'verifier.ts', 'index.ts']) {
    const sourceText = await readFile(
      new URL(`../../src/dac-v0041/runtime/${file}`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(
      sourceText,
      /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*(?:dac-v003|\/dac\/|runtime-binding|runtime-evidence|application-manifest|promotion-activation)/u,
      `${file} must not import any historical DAC adapter or the frozen v0.2/v0.3 runtime seams`,
    );
  }
});

test('a41-005 ceiling: the seam role vocabulary stays frozen', () => {
  assert.deepEqual(runtime.DAC_V0041_RUNTIME_SEAM_ROLES, [
    'runtime-binding-request',
    'runtime-binding',
    'runtime-host-binding',
    'runtime-implementation',
    'runtime-activation-request',
    'runtime-activation',
    'compatibility-validation-request',
    'compatibility-validation',
    'compatibility-result',
    'manifest',
  ]);
  assert.deepEqual(runtime.DAC_V0041_RUNTIME_REUSE_CURRENTNESS_STATES, [
    'current',
    'stale',
    'superseded',
    'revoked',
    'voided',
  ]);
});
