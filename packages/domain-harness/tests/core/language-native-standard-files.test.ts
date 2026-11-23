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

test('R151 P2：Writer 超节点上限时不读取最后未进入的 Getter', () => {
  const huge: Record<string, unknown> = {};
  for (let index=0; index<32_768; index++) huge['field'+index] = index;
  let reads=0;
  Object.defineProperty(huge,'lateGetter',{
    enumerable:true,
    get() { reads++; throw new Error('SECRET_LATE_GETTER'); },
  });
  for (const write of [writeJson,writeYaml]) {
    const result=write(huge as never);
    assert.equal(result.kind,'FAILED');
    if (result.kind==='FAILED') assert.equal(result.failure.code,'DH_STD_FILE_SIZE');
  }
  assert.equal(reads,0);
});

test('R151 P2：Writer 仅序列化自有可枚举属性，不包含继承字段', () => {
  const inherited = Object.create({ inherited: 'private' }) as Record<string, unknown>;
  inherited['own'] = 'ok';
  for (const write of [writeJson,writeYaml]) {
    const result=write(inherited as never);
    assert.equal(result.kind,'SUCCEEDED');
    if(result.kind==='SUCCEEDED') assert.equal(result.value.includes('private'),false);
  }
});

test('R151 P2：Getter 在读取时新增不安全字段不进入已捕获快照', () => {
  for(const write of [writeJson,writeYaml]) {
    const target:Record<string,unknown>={};
    Object.defineProperty(target,'safe',{
      enumerable:true,configurable:true,
      get() {
        Object.defineProperty(target,'__proto__',{
          enumerable:true,configurable:true,value:{polluted:true},
        });
        return 'checked';
      },
    });
    const result=write(target as never);
    assert.equal(result.kind,'SUCCEEDED');
    if(result.kind==='SUCCEEDED'){
      assert.equal(result.value.includes('__proto__'),false);
      assert.equal(result.value.includes('checked'),true);
    }
  }
});

test('R151 P2：Proxy 前后 ownKeys 不一致时按实际 Entries 受控拒绝', () => {
  for (const write of [writeJson,writeYaml]) {
    const target = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(target,'safe',{value:1,enumerable:true,configurable:true});
    Object.defineProperty(target,'__proto__',{
      value:{injected:true},enumerable:true,configurable:true,
    });
    let passes=0;
    const proxy = new Proxy(target,{
      ownKeys() {return ++passes===1?['safe']:['__proto__'];},
    });
    const result=write(proxy as never);
    assert.equal(result.kind,'FAILED');
    if(result.kind==='FAILED') assert.equal(result.failure.code,'DH_STD_FILE_INVALID');
    assert.ok(passes>=2);
  }
});

test('R151 P2：Writer 使用安全快照，不能在输出时第三次读取 Proxy 原对象', () => {
  for(const write of [writeJson,writeYaml]){
    let passes=0;
    const proxy=new Proxy({safe:'ok'},{
      ownKeys() {return ++passes<=2?['safe']:['constructor'];},
    });
    const result=write(proxy as never);
    assert.equal(result.kind,'SUCCEEDED');
    assert.equal(passes,2);
    if(result.kind==='SUCCEEDED') assert.equal(result.value.includes('constructor'),false);
  }
});
