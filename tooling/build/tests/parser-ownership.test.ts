import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_PARSER_PIN, assertVendoredParserBytes } from '../src/parser.js';

test('T05 Acorn vendor identity is pinned to original reviewed upstream and emitted bytes', () => {
  assert.equal(BUILD_PARSER_PIN.name, 'acorn');
  assert.equal(BUILD_PARSER_PIN.version, '8.19.0');
  assert.equal(BUILD_PARSER_PIN.upstreamSourceSha256, '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b');
  assert.match(BUILD_PARSER_PIN.distSha256, /^[a-f0-9]{64}$/, 'T05 must pin built dist SHA before source PASS');
  assert.doesNotThrow(() => assertVendoredParserBytes());
});
