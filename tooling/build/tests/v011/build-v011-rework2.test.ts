/**
 * DomainHarness v0.11.0 T02 (#1576) — second-review rework counterexamples.
 *
 * P1: per-compiled-schema Ajv registries — one block's inline $id/$ref can
 * never resolve to another block's schema (no-bleed negative), while
 * duplicate $id with different semantics compiles independently (positive)
 * and intra-block $defs/internal refs keep working.
 * P2-1: a resource ref pointing at a real DIRECTORY maps to
 * DH_BUILD_RESOURCE_MISSING (post-realpath read failure).
 * P2-2: the non-symlink `..` containment guard is exercised directly against
 * V011ResourceScope (mandatory on hosts without symlink privilege).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DH_ELEMENT_SCHEMA_VERSION, contentDigestOf } from '@kaicreator/domain-harness-contracts/v011';
import { buildV011App, type V011BuildResult } from '../../src/v011/index.js';
import { V011BuildRefusal } from '../../src/v011/refusal.js';
import { V011ResourceScope } from '../../src/v011/resources.js';
import { makeWorkspace, sha256OfBytes } from './fixtures.js';
import { standardCase } from './standard-case.js';

function expectRefusal(result: V011BuildResult, code: string): void {
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
        value: { v: 1 }, // intra-block $defs/$ref must keep working
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
  // A shared registry would resolve block-b's $ref against block-a's schema
  // (type number → the string value fails... and worse, any cross-schema
  // semantics would silently apply). Isolated registries refuse to compile.
  expectRefusal(buildV011App(input), 'DH_BUILD_SCHEMA_INVALID');
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
  const result = buildV011App(input);
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
  // 'content' is a REAL directory inside the package: realpath succeeds, the
  // final read fails — must map to DH_BUILD_RESOURCE_MISSING.
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
  // keep the descriptor ingress ref consistent with the rewritten definition
  const appDescriptor = input.descriptor as {
    ingress: { function: { element: { digest: string } } }[];
  };
  const newDefinitionDigest = contentDigestOf(JSON.parse(Buffer.from(defBytes).toString('utf8')) as never);
  for (const entry of appDescriptor.ingress) entry.function.element.digest = newDefinitionDigest;
  expectRefusal(buildV011App(input), 'DH_BUILD_RESOURCE_MISSING');
});

test('P2-2: non-symlink `..` path escaping the package root is refused (no symlink needed)', (t) => {
  const ws = makeWorkspace();
  t.after(ws.dispose);
  const pkgDir = join(ws.root, 'pkg');
  mkdirSync(join(pkgDir, 'sub'), { recursive: true });
  // real file OUTSIDE the package root, reached by a ../ traversal
  const outside = join(ws.root, 'outside-secret.json');
  writeFileSync(outside, '{"secret": true}');
  const scope = new V011ResourceScope({ pkg: pkgDir });
  assert.throws(
    () => scope.read('pkg', 'sub/../../outside-secret.json'),
    (error: unknown) =>
      error instanceof V011BuildRefusal && error.code === 'DH_BUILD_RESOURCE_MISSING',
    'a non-symlink ../ escape must hit the containment guard',
  );
  assert.throws(
    () => scope.read('pkg', '../outside-secret.json'),
    (error: unknown) =>
      error instanceof V011BuildRefusal && error.code === 'DH_BUILD_RESOURCE_MISSING',
    'a direct ../ escape must hit the containment guard',
  );
});
