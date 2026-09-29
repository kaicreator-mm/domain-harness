import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  canonicalJsonStringify,
  type PackageDataBounds,
} from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../src/raw/types.js';
import {
  buildCompiledDomainDataSection,
  compiledDomainDataIdentityMaterial,
  DomainDataCompileError,
} from '../src/package/domain-data.js';

const DEFAULT_BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 8,
  maxDomainDataEntryCanonicalBytes: 1024,
  maxTotalDomainDataCanonicalBytes: 4096,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 1024,
};

function projection(key: string): RawProjectionDefinition {
  return {
    projectionId: 'catalog-view',
    expression: '$',
    dependencies: [{ kind: 'domain-data', key }],
    outputSchema: {},
  };
}

test('I-PKG-DATA: input insertion order normalizes to identical Domain Data identity material', () => {
  const left = buildCompiledDomainDataSection([
    { key: 'b', value: { n: 2 } },
    { key: 'a', value: { n: 1 } },
  ], DEFAULT_BOUNDS);
  const right = buildCompiledDomainDataSection([
    { key: 'a', value: { n: 1 } },
    { key: 'b', value: { n: 2 } },
  ], DEFAULT_BOUNDS);

  assert.deepEqual(left.descriptors.map((item) => item.key), ['a', 'b']);
  assert.equal(
    canonicalJsonStringify(compiledDomainDataIdentityMaterial(left)),
    canonicalJsonStringify(compiledDomainDataIdentityMaterial(right)),
  );
});

test('I-PKG-DATA: duplicate and empty keys fail at compile time', () => {
  assert.throws(
    () => buildCompiledDomainDataSection([
      { key: 'a', value: 1 },
      { key: 'a', value: 2 },
      { key: '', value: 3 },
    ], DEFAULT_BOUNDS),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes("duplicate Domain Data key 'a'"))
      && error.issues.some((issue) => issue.includes('non-empty string')),
  );
});

test('I-PKG-DATA: projection references to undeclared Domain Data fail during compilation', () => {
  assert.throws(
    () => buildCompiledDomainDataSection(
      [{ key: 'declared', value: { ok: true } }],
      DEFAULT_BOUNDS,
      [projection('missing')],
    ),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes("undeclared Domain Data key 'missing'")),
  );
});

test('I-PKG-DATA: exact per-entry boundary passes and one-byte lower bound fails', () => {
  const value = 'é';
  const bytes = Buffer.byteLength(canonicalJsonStringify(value), 'utf8');
  const exact = {
    ...DEFAULT_BOUNDS,
    maxDomainDataEntryCanonicalBytes: bytes,
    maxTotalDomainDataCanonicalBytes: bytes,
  };

  const compiled = buildCompiledDomainDataSection([{ key: 'text', value }], exact);
  assert.equal(compiled.descriptors.length, 1);

  assert.throws(
    () => buildCompiledDomainDataSection([{ key: 'text', value }], {
      ...exact,
      maxDomainDataEntryCanonicalBytes: bytes - 1,
    }),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes('maxDomainDataEntryCanonicalBytes')),
  );
});

test('I-PKG-DATA: aggregate canonical byte overflow fails independently', () => {
  const entries = [
    { key: 'a', value: 'a' },
    { key: 'b', value: 'b' },
  ] as const;
  const total = entries.reduce(
    (sum, entry) => sum + Buffer.byteLength(canonicalJsonStringify(entry.value), 'utf8'),
    0,
  );

  assert.throws(
    () => buildCompiledDomainDataSection(entries, {
      ...DEFAULT_BOUNDS,
      maxTotalDomainDataCanonicalBytes: total - 1,
    }),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes('maxTotalDomainDataCanonicalBytes')),
  );
});

test('I-PKG-DATA: optional valueSchema is identity-bound but not semantically interpreted here', () => {
  const first = buildCompiledDomainDataSection([
    { key: 'a', value: 1, valueSchema: { type: 'number' } },
  ], DEFAULT_BOUNDS);
  const second = buildCompiledDomainDataSection([
    { key: 'a', value: 1, valueSchema: { type: 'integer' } },
  ], DEFAULT_BOUNDS);

  assert.equal(first.descriptors[0]?.contentDigest, second.descriptors[0]?.contentDigest);
  assert.notEqual(
    canonicalJsonStringify(compiledDomainDataIdentityMaterial(first)),
    canonicalJsonStringify(compiledDomainDataIdentityMaterial(second)),
  );
});

test('I-PKG-DATA: compiler canonical seam rejects accessor values without invoking getter', () => {
  let getterInvoked = false;
  const value: Record<string, unknown> = {};
  Object.defineProperty(value, 'secret', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 'should-not-run';
    },
  });

  assert.throws(
    () => buildCompiledDomainDataSection([{ key: 'a', value }], DEFAULT_BOUNDS),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes('not canonical JSON')),
  );
  assert.equal(getterInvoked, false);
});

test('I-PKG-DATA: zero Domain Data capacity is a valid fail-closed bound', () => {
  const zeroBounds: PackageDataBounds = {
    ...DEFAULT_BOUNDS,
    maxDomainDataEntries: 0,
    maxDomainDataEntryCanonicalBytes: 0,
    maxTotalDomainDataCanonicalBytes: 0,
  };
  assert.deepEqual(buildCompiledDomainDataSection([], zeroBounds).descriptors, []);
  assert.throws(
    () => buildCompiledDomainDataSection([{ key: 'a', value: null }], zeroBounds),
    DomainDataCompileError,
  );
});
