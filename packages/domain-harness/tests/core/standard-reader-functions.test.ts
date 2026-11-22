/** R60 W02：普通 Standard Reader 的格式解析、失败与拒绝由其真实 ESM 负责。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)),
  '../../../../examples/selected-packages/packages/r60-standard-readers');
const modulePath = pathToFileURL(join(root, 'dist/index.mjs')).href;

test('R60 W02: real JSON/YAML Reader returns deterministic selected JsonValue', async () => {
  const module = await import(modulePath);
  const json = module.jsonReader({ format:'json', source:'{"id":"json-a","result":1}' });
  const yaml = module.yamlReader({ format:'yaml', source:'id: yaml-a\nresult: 3\n' });
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
    const outcome = module.yamlReader({format:'yaml',source});
    assert.equal(outcome.kind, 'FAILED', 'unsafe YAML must not reach business logic');
    assert.equal(outcome.failure.code, 'DH_STD_READER_INVALID');
  }
  const jsonBad = module.jsonReader({format:'json',source:'{"x":'});
  assert.equal(jsonBad.kind, 'FAILED');
  const wrong = module.jsonReader({format:'yaml',source:'a: 1'});
  assert.equal(wrong.kind, 'UNKNOWN');
  const tooLarge = module.jsonReader({format:'json',source:'x'.repeat(1048577)});
  assert.equal(tooLarge.kind, 'FAILED');
  assert.equal(tooLarge.failure.code, 'DH_STD_READER_SIZE');
});
