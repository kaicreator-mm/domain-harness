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

test('R145 P2：Getter 只捕获一次；Getter/Proxy 抛错不泄漏原始异常', () => {
  let reads = 0;
  const safe: Record<string, unknown> = {};
  Object.defineProperty(safe,'value',{
    enumerable:true,
    get() { reads++; return 'yes'; },
  });
  const valid = writeJson(safe as never);
  assert.equal(valid.kind,'SUCCEEDED');
  assert.equal(reads,1);

  const secretGetter: Record<string, unknown> = {};
  Object.defineProperty(secretGetter,'value',{
    enumerable:true,
    get() { throw new Error('SECRET_GETTER_MARKER'); },
  });
  const badGetter=writeJson(secretGetter as never);
  assert.equal(badGetter.kind,'FAILED');
  assert.equal(JSON.stringify(badGetter).includes('SECRET_GETTER_MARKER'),false);

  const badProxy=new Proxy({}, {
    ownKeys() { throw new Error('SECRET_PROXY_MARKER'); },
  });
  const bad=writeYaml(badProxy as never);
  assert.equal(bad.kind,'FAILED');
  assert.equal(JSON.stringify(bad).includes('SECRET_PROXY_MARKER'),false);
});

test('R145 P2：深度、节点、序列化输出上限和非有限数受控失败', () => {
  let nested: unknown = null;
  for(let i=0;i<68;i++) nested={child:nested};
  const deep=writeJson(nested as never);
  assert.equal(deep.kind,'FAILED');
  if (deep.kind==='FAILED') assert.equal(deep.failure.code,'DH_STD_FILE_SIZE');

  const wide=writeJson(Array(32_769).fill(null));
  assert.equal(wide.kind,'FAILED');
  if (wide.kind==='FAILED') assert.equal(wide.failure.code,'DH_STD_FILE_SIZE');

  const expanded=writeJson({text:'\u0000'.repeat(200_000)});
  assert.equal(expanded.kind,'FAILED');
  if(expanded.kind==='FAILED') assert.equal(expanded.failure.code,'DH_STD_FILE_SIZE');

  const notNumber=writeYaml({n:Number.NaN});
  assert.equal(notNumber.kind,'FAILED');
  if(notNumber.kind==='FAILED') assert.equal(notNumber.failure.code,'DH_STD_FILE_INVALID');
});

test('R145 P2：YAML 自引用与密集别名、错误 API 输入和原始输入不变', () => {
  const self=readYaml('a: &self\n  b: *self\n');
  assert.equal(self.kind,'FAILED');
  const aliases='a: &shared [1]\nb: ['+Array(80).fill('*shared').join(', ')+']\n';
  assert.equal(readYaml(aliases).kind,'FAILED');
  const readUnknown=readJson(undefined as never);
  const writeUnknown=writeYaml(undefined as never);
  assert.equal(readUnknown.kind,'UNKNOWN');
  assert.equal(writeUnknown.kind,'UNKNOWN');
  if(readUnknown.kind==='UNKNOWN') assert.equal(readUnknown.unknownReason.code,'DH_STD_FILE_INPUT');

  const nested=Object.freeze([1,2,3]);
  const source=Object.freeze({items:nested});
  assert.equal(writeJson(source).kind,'SUCCEEDED');
  assert.deepEqual(source,{items:[1,2,3]});
});
