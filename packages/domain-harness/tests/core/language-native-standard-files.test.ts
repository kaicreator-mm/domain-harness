import assert from 'node:assert/strict';
import test from 'node:test';
import { JsonReader, YamlReader, readJson, readYaml, writeJson, writeYaml } from '../../src/standard-files.js';

test('两个 JSON、两个 YAML 业务资源复用各自 Standard Reader 实例', () => {
  const json = new JsonReader(), yaml = new YamlReader();
  const docs = [
    json.read('{"id":"a","amount":1}'), json.read('{"id":"b","amount":2}'),
    yaml.read('id: c\namount: 3\n'), yaml.read('id: d\namount: 4\n'),
  ];
  assert.deepEqual(docs.map(x => x.kind), ['SUCCEEDED','SUCCEEDED','SUCCEEDED','SUCCEEDED']);
  assert.deepEqual(docs.filter(x => x.kind === 'SUCCEEDED').map(x => x.value), [
    {id:'a',amount:1},{id:'b',amount:2},{id:'c',amount:3},{id:'d',amount:4},
  ]);
});

test('原生 Module Function JSON/YAML 往返', () => {
  const data = {id:'hello',nested:[1,false,null]};
  const j = writeJson(data), y = writeYaml(data);
  assert.equal(j.kind,'SUCCEEDED');
  assert.equal(y.kind,'SUCCEEDED');
  if (j.kind === 'SUCCEEDED') assert.deepEqual(readJson(j.value), {kind:'SUCCEEDED',value:data});
  if (y.kind === 'SUCCEEDED') assert.deepEqual(readYaml(y.value), {kind:'SUCCEEDED',value:data});
});

test('格式错误、YAML 重复键/恶意 tag、原型污染和环被拒绝', () => {
  for (const src of ['a: 1\na: 2\n','value: !!js/function hacked\n','__proto__: hacked\n']) {
    assert.equal(readYaml(src).kind,'FAILED');
  }
  assert.equal(readJson('{"x":').kind,'FAILED');
  assert.equal(readJson('{"__proto__":{"polluted":true}}').kind,'FAILED');
  const cyclic: Record<string, unknown> = {};
  cyclic.child = cyclic;
  assert.equal(writeJson(cyclic as never).kind,'FAILED');
});

test('超过 1MiB 输入在解析前失败', () => {
  const outcome = readJson('a'.repeat(1_048_577));
  assert.equal(outcome.kind,'FAILED');
  if (outcome.kind === 'FAILED') assert.equal(outcome.failure.code,'DH_STD_FILE_SIZE');
});
