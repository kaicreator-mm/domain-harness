import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareCompiledDomainDataKeys,
  type PackageDataBounds,
} from '@kaicreator/domain-harness/v2';
import { buildCompiledDomainDataSection } from '../src/package/domain-data.js';

const BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 8,
  maxDomainDataEntryCanonicalBytes: 64,
  maxTotalDomainDataCanonicalBytes: 512,
  maxBusinessSources: 0,
  maxSchemaCanonicalBytes: 64,
};

test('I-PKG-DATA: exact key ordering is locale-independent UTF-16 lexical order', () => {
  const keys = ['ä', 'z', 'Z', 'á', 'a'];
  assert.deepEqual([...keys].sort(compareCompiledDomainDataKeys), ['Z', 'a', 'z', 'á', 'ä']);

  const section = buildCompiledDomainDataSection(
    keys.map((key) => ({ key, value: key })),
    BOUNDS,
    [],
  );
  assert.deepEqual(section.descriptors.map((descriptor) => descriptor.key), ['Z', 'a', 'z', 'á', 'ä']);
});

test('I-PKG-DATA: __proto__ remains an ordinary own Domain Data key', () => {
  const section = buildCompiledDomainDataSection(
    [{ key: '__proto__', value: { safe: true } }],
    BOUNDS,
    [],
  );

  assert.equal(Object.getPrototypeOf(section.values), null);
  assert.equal(Object.prototype.hasOwnProperty.call(section.values, '__proto__'), true);
  assert.deepEqual(section.values['__proto__'], { safe: true });
  assert.equal(section.descriptors[0]?.key, '__proto__');
});
