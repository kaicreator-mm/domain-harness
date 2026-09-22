// T-025 docs guard — the issue #243 acceptance rules, enforced executably.
//
// This test reads the shipped documentation and the example sources as TEXT
// and asserts the acceptance properties that prose review could silently lose:
//
//   1. the four new public docs exist and are non-trivial;
//   2. no public doc names the internal engine implementation (product
//      vocabulary only — engine identity stays internal);
//   3. the migration doc explicitly forbids silent floating-authority
//      substitution (`current`/`latest`/`active`);
//   4. the host integration doc states that durability claims are established
//      ONLY by dedicated validation evidence, citing the executed task
//      evidence anchors (T-022/T-023/T-024);
//   5. docs/sdk/README.md read order includes both new SDK docs;
//   6. the examples import the compiled package by its published name (never
//      internal src/ paths) and the boot example consumes a compiled Domain
//      Package at startup.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// This file lives at packages/domain-harness/tests/examples/docs-guard.test.ts.
const repoRoot = new URL('../../../../', import.meta.url);

const SDK_USAGE = 'docs/sdk/DomainHarness_v0.3_SDK_USAGE.md';
const SDK_REFERENCE = 'docs/sdk/DomainHarness_v0.3_SDK_REFERENCE.md';
const MIGRATION = 'docs/migration/DomainHarness_v0.2_TO_v0.3.md';
const HOST_INTEGRATION = 'docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md';
const BASELINE = 'docs/integration/DomainHarness_v0.3_DEVELOPMENT_INTEGRATION_BASELINE.md';
const SDK_README = 'docs/sdk/README.md';

const NEW_DOCS = [SDK_USAGE, SDK_REFERENCE, MIGRATION, HOST_INTEGRATION, BASELINE] as const;

// Marker strings kept in sync with the docs deliberately: the guard fails if a
// later edit drops the section, so the acceptance rule cannot rot silently.
const MIGRATION_FORBIDDEN_HEADING = '## Forbidden: silent floating-authority substitution';
const HOST_DURABILITY_HEADING =
  '## Durability claims are established only by dedicated validation evidence';
const BASELINE_NONCLAIMS_HEADING = '## What this baseline is NOT';

async function readDoc(path: string): Promise<string> {
  return readFile(new URL(path, repoRoot), 'utf8');
}

async function readExample(name: string): Promise<string> {
  return readFile(new URL(name, import.meta.url), 'utf8');
}

test('docs-guard: the five new public docs exist and are substantive', async () => {
  for (const path of NEW_DOCS) {
    const text = await readDoc(path);
    assert.ok(
      text.length > 4000,
      `${path} must be a substantive document, got ${text.length} bytes`,
    );
  }
});

test('docs-guard: public docs never name the internal engine implementation', async () => {
  for (const path of NEW_DOCS) {
    const text = await readDoc(path);
    assert.ok(
      !/xstate/i.test(text),
      `${path} must use product vocabulary only (Domain Workflow / guard / transition)`,
    );
  }
});

test('docs-guard: the migration doc explicitly forbids silent floating-authority substitution', async () => {
  const text = await readDoc(MIGRATION);
  assert.ok(
    text.includes(MIGRATION_FORBIDDEN_HEADING),
    `migration doc must contain the heading "${MIGRATION_FORBIDDEN_HEADING}"`,
  );
  const section = text.slice(text.indexOf(MIGRATION_FORBIDDEN_HEADING));
  for (const token of ['`current`', '`latest`', '`active`']) {
    assert.ok(
      section.includes(token),
      `migration doc forbidden-substitution section must name ${token}`,
    );
  }
});

test('docs-guard: the host integration doc binds durability claims to executed validation evidence', async () => {
  const text = await readDoc(HOST_INTEGRATION);
  assert.ok(
    text.includes(HOST_DURABILITY_HEADING),
    `host integration doc must contain the heading "${HOST_DURABILITY_HEADING}"`,
  );
  const section = text.slice(text.indexOf(HOST_DURABILITY_HEADING));
  for (const anchor of ['T-022', 'T-023', 'T-024']) {
    assert.ok(
      section.includes(anchor),
      `host durability section must cite the executed ${anchor} evidence`,
    );
  }
});

test('docs-guard: the SDK README read order includes both new SDK docs', async () => {
  const readme = await readDoc(SDK_README);
  assert.ok(readme.includes('DomainHarness_v0.3_SDK_USAGE.md'));
  assert.ok(readme.includes('DomainHarness_v0.3_SDK_REFERENCE.md'));
});

test('docs-guard: the integration baseline states its non-claims explicitly', async () => {
  const text = await readDoc(BASELINE);
  assert.ok(
    text.includes(BASELINE_NONCLAIMS_HEADING),
    `baseline doc must contain the heading "${BASELINE_NONCLAIMS_HEADING}"`,
  );
  const section = text.slice(text.indexOf(BASELINE_NONCLAIMS_HEADING));
  // The baseline is adoptable only because it does NOT overclaim: no release
  // qualification, no floating authority, release closure stays with T-026.
  assert.ok(
    /not (a )?release (qualification|ready)/i.test(section),
    'baseline must disclaim release qualification / Release Ready status',
  );
  assert.ok(section.includes('T-026'), 'baseline must leave release qualification to T-026');
  for (const token of ['`current`', '`latest`', '`active`']) {
    assert.ok(
      section.includes(token),
      `baseline non-claims section must name the forbidden floating authority ${token}`,
    );
  }
});

test('docs-guard: examples consume the published package name, never internal src paths', async () => {
  const exampleFiles = [
    'support.ts',
    'domain-workflow-boot.example.test.ts',
    'governance-baseline-binding-pin.example.test.ts',
    'candidate-promotion-activation.example.test.ts',
    'runtime-evidence.example.test.ts',
  ];
  for (const name of exampleFiles) {
    const text = await readExample(name);
    assert.ok(
      !text.includes('../../src/'),
      `${name} must import @kaicreator/domain-harness, not internal src/ paths`,
    );
  }
  // support.ts is the shared import surface; every example draws from it or
  // imports the package directly.
  const support = await readExample('support.ts');
  assert.ok(support.includes("from '@kaicreator/domain-harness'"));
});

test('docs-guard: the boot example consumes a compiled Domain Package at startup', async () => {
  const boot = await readExample('domain-workflow-boot.example.test.ts');
  assert.ok(
    boot.includes('buildCompiledPackage'),
    'boot example must start from a compiled package artifact',
  );
  assert.ok(
    boot.includes('createDomainRuntimeV3'),
    'boot example must assemble the runtime from the compiled package at startup',
  );
  const support = await readExample('support.ts');
  assert.ok(
    support.includes('computeCompiledPackageId'),
    'the example build step derives the package identity from compiled content',
  );
});
