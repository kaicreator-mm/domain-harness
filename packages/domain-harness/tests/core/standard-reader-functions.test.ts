/** R60 W02：普通 Standard File 的格式解析、失败与拒绝由其真实 ESM 负责。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)),
  '../../../../examples/selected-packages/packages/r60-standard-files');
const modulePath = pathToFileURL(join(root, 'dist/index.mjs')).href;

test('R60 W02: real JSON/YAML File returns deterministic selected JsonValue', async () => {
  const module = await import(modulePath);
  const json = module.readJson({ format:'json', source:'{"id":"json-a","result":1}' });
  const yaml = module.readYaml({ format:'yaml', source:'id: yaml-a\nresult: 3\n' });
  assert.deepEqual(json, { kind:'SUCCEEDED', value:{ id:'json-a', result:1 } });
  assert.deepEqual(yaml, { kind:'SUCCEEDED', value:{ id:'yaml-a', result:3 } });
});

test('R60 W02: YAML aliases, duplicate keys, invalid JSON and wrong format fail independently', async () => {
  const module = await import(modulePath);
  for (const source of [
    'a: 1\na: 2\n',
    'a: &self\n  b: *self\n',
    'value: !!js/function hacked\n',
  ]) {
    const outcome = module.readYaml({format:'yaml',source});
    assert.equal(outcome.kind, 'FAILED', 'unsafe YAML must not reach business logic');
    assert.equal(outcome.failure.code, 'DH_STD_FILE_INVALID');
  }
  const jsonBad = module.readJson({format:'json',source:'{"x":'});
  assert.equal(jsonBad.kind, 'FAILED');
  const wrong = module.readJson({format:'yaml',source:'a: 1'});
  assert.equal(wrong.kind, 'UNKNOWN');
  const tooLarge = module.readJson({format:'json',source:'x'.repeat(1048577)});
  assert.equal(tooLarge.kind, 'FAILED');
  assert.equal(tooLarge.failure.code, 'DH_STD_FILE_SIZE');
});

test('R60 W02: separate Standard File Element outputs support scalar, array and null JsonValues', async () => {
  const module = await import(modulePath);
  assert.deepEqual(module.readJson({ format: 'json', source: '42' }),
    { kind: 'SUCCEEDED', value: 42 });
  assert.deepEqual(module.readJson({ format: 'json', source: '[true,null,"a"]' }),
    { kind: 'SUCCEEDED', value: [true, null, 'a'] });
  assert.deepEqual(module.readYaml({ format: 'yaml', source: '- 1\n- 2\n' }),
    { kind: 'SUCCEEDED', value: [1, 2] });
  assert.deepEqual(module.readJson({ format: 'json', source: 'null' }),
    { kind: 'SUCCEEDED', value: null });
});

test('R60 W02: JSON/YAML file write uses native/library serializer and round-trips', async () => {
  const module = await import(modulePath);
  const data = { key: 'a: b', nested: [1, true, null, '你好'], flags: { enabled: false } };
  for (const format of ['json', 'yaml'] as const) {
    const write = format === 'json' ? module.writeJson : module.writeYaml;
    const read = format === 'json' ? module.readJson : module.readYaml;
    const encoded = write({ format, value: data });
    assert.equal(encoded.kind, 'SUCCEEDED', format);
    assert.equal(typeof encoded.value, 'string');
    assert.deepEqual(read({ format, source: encoded.value }), { kind: 'SUCCEEDED', value: data });
  }
  assert.deepEqual(module.writeJson({ format: 'json', value: null }),
    { kind: 'SUCCEEDED', value: 'null\n' });
});

test('R60 W02: writes refuse invalid values, wrong format, dangerous keys and byte overflow', async () => {
  const module = await import(modulePath);
  for (const value of [undefined, Infinity, NaN, { x: undefined }, { x: BigInt(1) },
    { x: () => 1 }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
    assert.equal(module.writeJson({ format: 'json', value }).kind, 'FAILED');
    assert.equal(module.writeYaml({ format: 'yaml', value }).kind, 'FAILED');
  }
  assert.equal(module.writeJson({ format: 'yaml', value: 1 }).kind, 'UNKNOWN');
  assert.equal(module.writeYaml({ format: 'yaml' }).kind, 'UNKNOWN');
  assert.equal(module.writeJson({ format: 'json', value: '🙂'.repeat(300_000) }).failure.code,
    'DH_STD_FILE_SIZE', 'write must limit UTF-8 bytes, not UTF-16 code units');
  assert.equal(module.readJson({ format: 'json', source: '"🙂'.repeat(300_000) }).failure.code,
    'DH_STD_FILE_SIZE', 'read must limit UTF-8 bytes before parsing');
  assert.equal(module.readYaml({ format: 'yaml', source: '__proto__: 1\n' }).kind, 'FAILED');
});


test('R70: File Writer bounds input bytes and node cost before serialization', async () => {
  const module = await import(modulePath);
  const big = Object.fromEntries(
    Array.from({ length: 32769 }, (_, i) => ['key' + i, i]));
  for (const format of ['json', 'yaml'] as const) {
    const write = format === 'json' ? module.writeJson : module.writeYaml;
    const outcome = write({ format, value: big });
    assert.equal(outcome.kind, 'FAILED');
    assert.equal(outcome.failure.code, 'DH_STD_FILE_SIZE');
  }
  const data = { nested: [1, true, null, { message: 'ok' }] };
  const encoded = module.writeYaml({ format:'yaml', value:data });
  assert.equal(encoded.kind, 'SUCCEEDED');
  assert.deepEqual(module.readYaml({ format:'yaml', source:encoded.value }),
    { kind:'SUCCEEDED', value:data });
});
