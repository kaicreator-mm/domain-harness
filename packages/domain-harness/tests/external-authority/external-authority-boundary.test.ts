// Issue #309 / A2 I-006 boundary tests: the external authority evidence/
// correlation adapter must stay a dependency-light, concern-separated,
// non-freezing surface around the EXISTING durable effect semantics. These
// tests fail if the adapter ever grows a store/journal/engine dependency, a
// runtime-transition-authority channel, a local-cause evidence factory
// (timeout/abandonment/cancel -> remote outcome), a PROVISIONAL wire freeze,
// or any role/evidence-class conversion surface.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as external from '../../src/external-authority/index.js';
import * as root from '../../src/index.js';

const srcDir = fileURLToPath(new URL('../../src/external-authority/', import.meta.url));

function sourceText(name: string): string {
  return readFileSync(`${srcDir}${name}`, 'utf8');
}

test('external-authority boundary: dependency-light leaf — no store/engine/journal/adapter coupling', () => {
  for (const name of ['contracts.ts', 'guards.ts', 'index.ts']) {
    const text = sourceText(name);
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const specifier of imports) {
      // Allowed: own leaf modules and the existing durable-effect contract
      // SHAPES (type-only import — the journal stays the runtime's truth).
      assert.ok(
        specifier === './contracts.js' ||
          specifier === './guards.js' ||
          specifier === '../v2/contracts/effect.js' ||
          specifier === '../v2/contracts/package.js' ||
          specifier.startsWith('node:'),
        `${name} has a non-leaf import "${specifier}"`,
      );
    }
    assert.ok(!/from\s+['"]\.\.\/dac/.test(text), `${name} must not import the #305 DAC adapter`);
    assert.ok(!/from\s+['"]\.\.\/observation/.test(text), `${name} must not import #312 observation`);
    assert.ok(!/from\s+['"]\.\.\/control/.test(text), `${name} must not import #313 control`);
    assert.ok(
      !/\b(RuntimeStore|DurableExecutionStore|beginEffect|completeEffect|transitionRequest|createRequest)\b/.test(
        text.replace(/^[/ ]*\*.*$/gm, '').replace(/^\s*\/\/.*$/gm, ''),
      ),
      `${name} must not name any runtime store/journal mutation channel`,
    );
  }
});

test('external-authority boundary: no runtime transition authority channel on the surface', () => {
  for (const name of Object.keys(external)) {
    assert.ok(
      !/(Store|Persist|Transition|Admit|Mutate|Execute|Dispatch.*Port)/.test(name),
      `surface name "${name}" suggests a runtime authority channel`,
    );
  }
  // The only Journal-typed surface is the READ-ONLY adoption from an existing
  // durable effect journal record (type-only names are not runtime names).
  const journalNames = Object.keys(external).filter((n) => /Journal/.test(n));
  assert.deepEqual(journalNames.sort(), ['adoptRuntimeLogicalOperationRefFromJournal']);
  // The only "dispatch" names on the runtime surface are dispatch-attempt
  // EVIDENCE guards (type-only names are not runtime properties).
  const dispatchNames = Object.keys(external).filter((n) => /dispatch/i.test(n));
  assert.deepEqual(dispatchNames.sort(), [
    'adoptExternalDispatchAttemptEvidence',
    'expectExternalDispatchAttemptEvidence',
    'isExternalDispatchAttemptEvidence',
  ]);
});

test('external-authority boundary: no local-cause evidence factory (timeout/abandonment/cancel inference)', () => {
  for (const name of Object.keys(external)) {
    assert.ok(
      !/(Timeout|Abort|Abandon.*Evidence|Cancel|Retry|Infer|Assume|Presume|Definitely|Failed)/.test(name),
      `surface name "${name}" suggests local-cause -> remote-outcome inference`,
    );
  }
  const guardsText = sourceText('guards.ts');
  // No AbortSignal/timeout material is even mentionable as evidence input.
  assert.ok(!/AbortSignal/.test(guardsText), 'AbortSignal must not appear as evidence material');
  // The forbidden-field guard is present and loud.
  assert.ok(guardsText.includes('LOCAL_CAUSE_FORBIDDEN'));
  assert.ok(guardsText.includes('LOCAL_CAUSE_FIELDS'));
});

test('external-authority boundary: no PROVISIONAL wire-schema freeze — opaque fields only', () => {
  for (const name of Object.keys(external)) {
    assert.ok(
      !/Serial|Encode|Decode|Wire|Transport|Persist/i.test(name),
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

test('external-authority boundary: no role/evidence-class conversion and no authority fabrication', () => {
  const exportNames = Object.keys(external).sort();
  for (const name of exportNames) {
    assert.ok(
      !/^(to|as|convert|promote|default|createDefault|resolveLatest|mint|fabricate)/i.test(name),
      `surface name "${name}" suggests conversion/fabrication`,
    );
  }
  // The reference adoption surface is exactly the five adopt*Ref constructors
  // plus the two existing-durable-effect shape adapters.
  const adopters = exportNames.filter((n) => n.startsWith('adopt'));
  assert.deepEqual(adopters.sort(), [
    'adoptExternalAuthorityRef',
    'adoptExternalDispatchAttemptEvidence',
    'adoptExternalObservationEvidence',
    'adoptExternalObservationRef',
    'adoptExternalReconciliationOutcome',
    'adoptExternalReconciliationRef',
    'adoptProviderOperationRef',
    'adoptRuntimeLogicalOperationRef',
    'adoptRuntimeLogicalOperationRefFromExecutionContext',
    'adoptRuntimeLogicalOperationRefFromJournal',
  ]);
  // Evidence classes cannot be converted: every exported evidence producer
  // takes plain correlation/material inputs, never another evidence class.
  const evidenceProducers = exportNames.filter((n) =>
    n.startsWith('adoptExternalDispatchAttemptEvidence') ||
    n.startsWith('adoptExternalObservationEvidence') ||
    n.startsWith('adoptExternalReconciliationOutcome'),
  );
  assert.equal(evidenceProducers.length, 3);
  for (const name of evidenceProducers) {
    const fn = (external as unknown as Record<string, unknown>)[name] as (
      ...args: unknown[]
    ) => unknown;
    assert.equal(fn.length, 1, `${name} takes exactly the evidence input`);
  }
  // External authority identity is never manufactured: the only runtime
  // producer/consumer of ExternalAuthorityRef identity is its own adoption
  // constructor and its nominal guards (no conversion producers).
  assert.deepEqual(
    exportNames.filter((n) => /ExternalAuthorityRef$/.test(n)).sort(),
    ['adoptExternalAuthorityRef', 'expectExternalAuthorityRef', 'isExternalAuthorityRef'],
  );
});

test('external-authority boundary: external ids are never heuristic-filtered (authority owns its ids)', () => {
  const guardsText = sourceText('guards.ts');
  // The DAC adapter's mutable-alias matcher must not leak here: the external
  // Business SoR owns its identifiers and this adapter never reinterprets,
  // normalizes or alias-filters them.
  assert.ok(!guardsText.includes('MUTABLE_ALIAS'), 'no mutable-alias heuristic may filter external ids');
  assert.ok(!/toLowerCase|toUpperCase/.test(guardsText), 'no case-normalization of external ids');
});

test('external-authority boundary: adapter reaches the package root and ./v3 public surfaces', () => {
  for (const name of [
    'EXTERNAL_AUTHORITY_ADAPTER_VERSION',
    'EXTERNAL_AUTHORITY_BASELINE',
    'EXTERNAL_AUTHORITY_REFERENCE_ROLES',
    'EXTERNAL_EVIDENCE_CLASSES',
    'EXTERNAL_OBSERVATION_CLASSIFICATIONS',
    'EXTERNAL_OBSERVATION_CLAIMS',
    'EXTERNAL_RECONCILIATION_RESULTS',
    'ExternalAuthorityError',
    'adoptExternalAuthorityRef',
    'adoptRuntimeLogicalOperationRef',
    'adoptRuntimeLogicalOperationRefFromJournal',
    'adoptRuntimeLogicalOperationRefFromExecutionContext',
    'adoptProviderOperationRef',
    'adoptExternalObservationRef',
    'adoptExternalReconciliationRef',
    'correlateExternalEffect',
    'verifyExternalEffectCorrelation',
    'adoptExternalDispatchAttemptEvidence',
    'adoptExternalObservationEvidence',
    'adoptExternalReconciliationOutcome',
    'maxClaimableForExternalObservation',
    'observationSupportsCommitClaim',
    'observationSupportsNonCommitClaim',
    'refuteNonExternalAuthorityIdentity',
    'isExternalAuthorityFamilyReference',
    'getExternalAuthorityFamilyRole',
  ]) {
    assert.ok(name in root, `root surface missing ${name}`);
  }
  const baseline = (root as unknown as {
    EXTERNAL_AUTHORITY_BASELINE: { baselineCommit: string };
  }).EXTERNAL_AUTHORITY_BASELINE.baselineCommit;
  assert.equal(baseline, '9c3ef91b8b40d893e4fe2b0370200e765816ec2b');
});
