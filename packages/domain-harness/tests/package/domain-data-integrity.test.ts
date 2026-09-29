import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  type JsonValue,
  type PackageDataBounds,
} from '../../src/v2/index.js';
import {
  DomainDataIntegrityError,
  validateCompiledDomainDataSection,
} from '../../src/package/index.js';
import { createSha256Fake } from './fixture.js';

const DEFAULT_BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 4,
  maxDomainDataEntryCanonicalBytes: 1024,
  maxTotalDomainDataCanonicalBytes: 4096,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 1024,
};

async function descriptor(key: string, value: JsonValue) {
  return {
    key,
    contentDigest: await computeCanonicalJsonDigest(value, createSha256Fake()),
  };
}

test('I-PKG-DATA: valid section verifies exact descriptor/value digests and bounds', async () => {
  const alpha: JsonValue = { enabled: true, count: 2 };
  const beta: JsonValue = ['x', 'y'];
  const section = {
    descriptors: [
      await descriptor('alpha', alpha),
      await descriptor('beta', beta),
    ],
    values: { beta, alpha },
    packageDataBounds: DEFAULT_BOUNDS,
  };

  const validated = await validateCompiledDomainDataSection(section, createSha256Fake());
  assert.deepEqual(validated.descriptors.map((item) => item.key), ['alpha', 'beta']);
  assert.deepEqual(Object.keys(validated.values).sort(), ['alpha', 'beta']);
});

test('I-PKG-DATA: digest mismatch fails closed', async () => {
  const value: JsonValue = { amount: 3 };
  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [{ key: 'price', contentDigest: 'wrong-digest' }],
      values: { price: value },
      packageDataBounds: DEFAULT_BOUNDS,
    }, createSha256Fake()),
    (error: unknown) =>
      error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_DIGEST_MISMATCH',
  );
});

test('I-PKG-DATA: descriptor/value bijection rejects missing and orphaned material', async () => {
  const value: JsonValue = 1;
  const item = await descriptor('a', value);

  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [item],
      values: {},
      packageDataBounds: DEFAULT_BOUNDS,
    }, createSha256Fake()),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'INVALID_DOMAIN_DATA_SECTION',
  );

  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [],
      values: { a: value },
      packageDataBounds: DEFAULT_BOUNDS,
    }, createSha256Fake()),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'INVALID_DOMAIN_DATA_SECTION',
  );
});

test('I-PKG-DATA: duplicate, empty and unsorted descriptor keys fail closed', async () => {
  const value: JsonValue = 1;
  const a = await descriptor('a', value);
  const b = await descriptor('b', value);

  for (const descriptors of [
    [a, a],
    [{ ...a, key: '' }],
    [b, a],
  ]) {
    await assert.rejects(
      validateCompiledDomainDataSection({
        descriptors,
        values: descriptors.length === 1 && descriptors[0]?.key === ''
          ? { '': value }
          : { a: value, b: value },
        packageDataBounds: DEFAULT_BOUNDS,
      }, createSha256Fake()),
      (error: unknown) => error instanceof DomainDataIntegrityError
        && error.code === 'INVALID_DOMAIN_DATA_SECTION',
    );
  }
});

test('I-PKG-DATA: exact canonical byte boundary passes and +1 lower bound fails', async () => {
  const value: JsonValue = 'é';
  const bytes = Buffer.byteLength(canonicalJsonStringify(value), 'utf8');
  const item = await descriptor('text', value);

  await validateCompiledDomainDataSection({
    descriptors: [item],
    values: { text: value },
    packageDataBounds: {
      ...DEFAULT_BOUNDS,
      maxDomainDataEntryCanonicalBytes: bytes,
      maxTotalDomainDataCanonicalBytes: bytes,
    },
  }, createSha256Fake());

  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [item],
      values: { text: value },
      packageDataBounds: {
        ...DEFAULT_BOUNDS,
        maxDomainDataEntryCanonicalBytes: bytes - 1,
      },
    }, createSha256Fake()),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_BOUNDS_EXCEEDED',
  );
});

test('I-PKG-DATA: aggregate canonical byte overflow fails independently', async () => {
  const a: JsonValue = 'a';
  const b: JsonValue = 'b';
  const total = Buffer.byteLength(canonicalJsonStringify(a), 'utf8')
    + Buffer.byteLength(canonicalJsonStringify(b), 'utf8');

  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [await descriptor('a', a), await descriptor('b', b)],
      values: { a, b },
      packageDataBounds: {
        ...DEFAULT_BOUNDS,
        maxTotalDomainDataCanonicalBytes: total - 1,
      },
    }, createSha256Fake()),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'DOMAIN_DATA_BOUNDS_EXCEEDED',
  );
});

test('I-PKG-DATA: non-canonical accessor material fails without invoking getter', async () => {
  let getterInvoked = false;
  const values: Record<string, unknown> = {};
  Object.defineProperty(values, 'a', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 1;
    },
  });

  await assert.rejects(
    validateCompiledDomainDataSection({
      descriptors: [{ key: 'a', contentDigest: 'irrelevant' }],
      values,
      packageDataBounds: DEFAULT_BOUNDS,
    }, createSha256Fake()),
    (error: unknown) => error instanceof DomainDataIntegrityError
      && error.code === 'INVALID_DOMAIN_DATA_SECTION',
  );
  assert.equal(getterInvoked, false);
});

test('I-PKG-DATA: async digest-time caller mutation cannot alter the validated snapshot', async () => {
  const a: JsonValue = { n: 1 };
  const b: JsonValue = { n: 2 };
  const section = {
    descriptors: [await descriptor('a', a), await descriptor('b', b)],
    values: { a, b } as Record<string, JsonValue>,
    packageDataBounds: DEFAULT_BOUNDS,
  };
  let calls = 0;
  const mutatingSha = {
    async digestUtf8(value: string): Promise<string> {
      calls += 1;
      if (calls === 1) section.values.b = { n: 999 };
      return `fixture-sha256:${value}`;
    },
  };

  const validated = await validateCompiledDomainDataSection(section, mutatingSha);
  assert.deepEqual(section.values.b, { n: 999 });
  assert.deepEqual(validated.values.b, { n: 2 });
});
