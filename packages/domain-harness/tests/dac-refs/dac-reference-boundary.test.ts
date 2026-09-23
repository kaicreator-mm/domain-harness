// Issue #305 / A2 I-002 boundary tests: the DAC reference adapter must stay a
// dependency-light, concern-separated, non-freezing surface. These tests fail
// if the adapter ever grows a private DAC product dependency, telemetry or
// control semantics, a PROVISIONAL wire freeze, or any role-conversion /
// implicit-default-selection surface.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as dac from '../../src/dac/index.js';
import * as root from '../../src/index.js';

const srcDir = fileURLToPath(new URL('../../src/dac/', import.meta.url));

function sourceText(name: string): string {
  return readFileSync(`${srcDir}${name}`, 'utf8');
}

test('dac boundary: no private DAC product-implementation dependency', () => {
  for (const name of ['contracts.ts', 'guards.ts', 'index.ts']) {
    const text = sourceText(name);
    assert.ok(
      !/from\s+['"][^'"]*domain-application-contract/.test(text),
      `${name} must not import DAC product code`,
    );
    // Dependency-light: the leaf imports only its own contracts module and
    // node:/assert-free pure TypeScript (no runtime deps at all).
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const specifier of imports) {
      assert.ok(
        specifier === './contracts.js' || specifier === './guards.js' || specifier.startsWith('node:'),
        `${name} has a non-leaf import "${specifier}"`,
      );
    }
  }
});

test('dac boundary: no telemetry/observation or generic-control semantic leakage', () => {
  for (const name of ['contracts.ts', 'guards.ts', 'index.ts']) {
    const text = sourceText(name);
    assert.ok(!/from\s+['"]\.\.\/observation/.test(text), `${name} must not import #312 observation`);
    assert.ok(!/\b(telemetry|cancel|interrupt|observeStream|ObservationStream)\b/.test(text.replace(/^[/ ]*\*.*$/gm, '')), `${name} must not absorb #312/#313 semantics`);
  }
  // The exported surface itself carries no observation/control capability.
  for (const name of Object.keys(dac)) {
    assert.ok(!/Observation|Telemetry|Cancel|Interrupt|Control/.test(name), `unexpected surface name ${name}`);
  }
});

test('dac boundary: no PROVISIONAL wire-schema freeze — opaque fields only, no wire encoder/decoder', () => {
  for (const name of Object.keys(dac)) {
    assert.ok(
      !/Serial|Encode|Decode|Wire|Json|Transport|Persist/i.test(name),
      `surface name "${name}" suggests a frozen wire encoding`,
    );
  }
  const guardsText = sourceText('guards.ts');
  assert.ok(!/JSON\.stringify|JSON\.parse/.test(guardsText), 'no serialization of PROVISIONAL fields');
  const contractsText = sourceText('contracts.ts');
  assert.ok(
    contractsText.includes('readonly opaque: Readonly<Record<string, unknown>>'),
    'unknown/provisional fields must be carried opaquely',
  );
});

test('dac boundary: no role-conversion and no implicit default selection on the public surface', () => {
  const exportNames = Object.keys(dac).sort();
  for (const name of exportNames) {
    assert.ok(
      !/^(to|as|convert|promote|default|createDefault|resolveLatest)/i.test(name),
      `surface name "${name}" suggests conversion/defaulting`,
    );
  }
  // The adoption surface is exactly the eight adopt* constructors plus
  // guards/verification — no selection factory, no registry lookup, no
  // compatibility-to-selection bridge.
  const adopters = exportNames.filter((n) => n.startsWith('adopt'));
  assert.deepEqual(adopters.sort(), [
    'adoptApplicationSelectionRef',
    'adoptCompatibilityTargetRef',
    'adoptPromotionDecisionRef',
    'adoptRuntimeActivationRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeContractRef',
    'adoptRuntimeImplementationRef',
    'adoptSelectedDomainDataRef',
  ]);
  // No function export accepts another role's ref and returns a different
  // role's ref type at the type level: adopters take plain inputs only.
  for (const name of adopters) {
    const fn = (dac as unknown as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
    assert.equal(fn.length, 1, `${name} takes exactly the adoption input`);
  }
});

test('dac boundary: adapter reaches the package root and ./v3 public surfaces', () => {
  for (const name of [
    'DAC_REFERENCE_ADAPTER_VERSION',
    'DAC_REFERENCE_BASELINE',
    'DAC_REFERENCE_ROLES',
    'DacReferenceError',
    'adoptPromotionDecisionRef',
    'adoptApplicationSelectionRef',
    'adoptSelectedDomainDataRef',
    'adoptRuntimeContractRef',
    'adoptRuntimeImplementationRef',
    'adoptCompatibilityTargetRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeActivationRef',
    'verifyDacReferenceIdentity',
    'refuteExternalBusinessSoRIdentity',
    'isDacReference',
    'getDacReferenceRole',
  ]) {
    assert.ok(name in root, `root surface missing ${name}`);
  }
  assert.equal(
    DAC_BASELINE_COMMIT(root),
    '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
  );
});

function DAC_BASELINE_COMMIT(surface: typeof root): string {
  return (surface as unknown as { DAC_REFERENCE_BASELINE: { baselineCommit: string } })
    .DAC_REFERENCE_BASELINE.baselineCommit;
}
