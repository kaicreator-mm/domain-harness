// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DH_ELEMENT_SCHEMA_VERSION } from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { BuildRefusal } from '../../src/refusal.js';
import { ResourceScope } from '../../src/resources.js';
import { makeWorkspace, sha256OfBytes } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectRefusal(result: BuildResult, code: string): void {
  assert.equal(result.ok, false, 'BUILD must refuse this input');
  if (!result.ok) {
    assert.equal(result.code, code, `expected ${code}, got ${result.code}: ${result.message}`);
  }
}

test('P1 no-bleed: block B cross-$ref to block A inline $id is SCHEMA_INVALID', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.bleed',
    version: '1.0.0',
    description: 'Block B tries to $ref block A inline schema id.',
    content: [
      {
        id: 'block-a',
        contentKind: 'structured-data',
        schemaRef: {
          inline: {
            $id: 'https://fixture.review/block-a',
            type: 'object',
            $defs: { positive: { type: 'number' } },
            properties: { v: { $ref: '#/$defs/positive' } },
            required: ['v'],
          },
        },
        required: true,
        value: { v: 1 },
      },
      {
        id: 'block-b',
        contentKind: 'structured-data',
        schemaRef: {
          inline: {
            type: 'object',
            properties: { v: { $ref: 'https://fixture.review/block-a' } },
            required: ['v'],
          },
        },
        required: true,
        value: { v: 'would-validate-only-by-bleeding-into-block-a' },
      },
    ],
    functions: [],
  } as never);
  const { input } = scenario.finalize();
  expectRefusal(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('P1 duplicate-$id different-semantics: both blocks compile against their own schema', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.extraElements.push({
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.dup-id',
    version: '1.0.0',
    description: 'Two blocks reusing one $id with different bodies.',
    content: [
      {
        id: 'dup-object',
        contentKind: 'structured-data',
        schemaRef: { inline: { $id: 'https://fixture.review/dup', type: 'object' } },
        required: true,
        value: { anything: true },
      },
      {
        id: 'dup-string',
        contentKind: 'structured-data',
        schemaRef: { inline: { $id: 'https://fixture.review/dup', type: 'string' } },
        required: true,
        value: 'own semantics, not shadowed',
      },
    ],
    functions: [],
  } as never);
  const { input } = scenario.finalize();
  const result = buildApp(input);
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
  if (result.ok) {
    const element = result.lock.selectedElements.find((e) => e.ref.id === 'orders.dup-id')!;
    assert.equal(element.contentDigests.length, 2, 'both duplicate-$id blocks selected and digested');
  }
});

test('P2-1: resource ref pointing at a real directory is RESOURCE_MISSING', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const eligibilityDef = scenario.eligibility;
  eligibilityDef.content[1]!.ref = {
    packageId: 'orders-business',
    path: 'content',
    digest: `sha256:${'2'.repeat(64)}`,
  };
  const businessDir = scenario.ws.packageRoots['orders-business']!;
  const defPath = `${businessDir}/definitions/eligibility-1.0.0-1.json`;
  const defBytes = new TextEncoder().encode(JSON.stringify(eligibilityDef));
  writeFileSync(defPath, defBytes);
  const manifest = input.packages.find((pkg) => (pkg as { id: string }).id === 'orders-business') as {
    elements: { id: string; definitionRef: { digest: string } }[];
  };
  manifest.elements.find((entry) => entry.id === 'orders.eligibility')!.definitionRef.digest =
    sha256OfBytes(defBytes);
  expectRefusal(buildApp(input), 'DH_BUILD_RESOURCE_MISSING');
});

test('P2-2: non-symlink `..` path escaping the package root is refused (no symlink needed)', (t) => {
  const ws = makeWorkspace();
  t.after(ws.dispose);
  const pkgDir = join(ws.root, 'pkg');
  mkdirSync(join(pkgDir, 'sub'), { recursive: true });
  const outside = join(ws.root, 'outside-secret.json');
  writeFileSync(outside, '{"secret": true}');
  const scope = new ResourceScope({ pkg: pkgDir });
  assert.throws(
    () => scope.read('pkg', 'sub/../../outside-secret.json'),
    (error: unknown) =>
      error instanceof BuildRefusal && error.code === 'DH_BUILD_RESOURCE_MISSING',
    'a non-symlink ../ escape must hit the containment guard',
  );
  assert.throws(
    () => scope.read('pkg', '../outside-secret.json'),
    (error: unknown) =>
      error instanceof BuildRefusal && error.code === 'DH_BUILD_RESOURCE_MISSING',
    'a direct ../ escape must hit the containment guard',
  );
});
