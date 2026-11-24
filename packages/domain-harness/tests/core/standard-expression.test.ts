import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedExpressionElement } from '../../src/standard-expression.js';
import type { ExpressionLimits } from '../../src/standard-expression.js';

const element = new BoundedExpressionElement();
const lit = (value: unknown) => ({ op: 'literal', value });
const get = (...path: string[]) => ({ op: 'get', path });
const op = (name: string, ...args: unknown[]) => ({ op: name, args });
const run = (ast: unknown, input: unknown = {}, limits: Partial<ExpressionLimits> = {}) =>
  element.evaluate(JSON.stringify(ast), JSON.stringify(input), limits);
const invalid = /^TypeError: EXPRESSION_INVALID$/u;
const limit = /^TypeError: EXPRESSION_LIMIT$/u;
const inputError = /^TypeError: EXPRESSION_INPUT$/u;
const evaluation = /^TypeError: EXPRESSION_EVALUATION$/u;

test('T04 two domains reuse one evaluator and do not alter input', () => {
  const repair = { approved: true, quote: { price: 50, ceiling: 80 } };
  const before = JSON.stringify(repair);
  assert.equal(run(op('and', get('approved'), op('le', get('quote', 'price'), get('quote', 'ceiling'))), repair), true);
  assert.equal(JSON.stringify(repair), before);
  const inventory = { stock: 12, reserved: 3 };
  assert.equal(run(op('sub', get('stock'), get('reserved')), inventory), 9);
  assert.equal(run(op('gt', get('stock'), lit(20)), inventory), false);
});
test('T04 every allowed operator with strict scalar results', () => {
  const cases: Array<[string, unknown, unknown, unknown]> = [
    ['eq', null, null, true], ['eq', 'a', 'a', true], ['ne', 'a', 'b', true],
    ['lt', 1, 2, true], ['le', 2, 2, true], ['gt', 2, 1, true], ['ge', 2, 2, true],
    ['add', 2, 3, 5], ['sub', 2, 3, -1], ['mul', 2, 3, 6], ['div', 3, 2, 1.5],
    ['and', true, false, false], ['or', false, true, true],
  ];
  for (const [name, a, b, expected] of cases) assert.equal(run(op(name, lit(a), lit(b))), expected);
  assert.equal(run({ op: 'not', arg: lit(false) }), true);
  assert.equal(run(lit('文')), '文');
  assert.equal(run(lit(null)), null);
});
test('T04 short circuit skips runtime lookup but validates whole AST', () => {
  assert.equal(run(op('and', lit(false), get('missing')), {}, { maxOperations: 2 }), false);
  assert.equal(run(op('or', lit(true), op('div', lit(1), lit(0))), {}, { maxOperations: 2 }), true);
  assert.throws(() => run(op('and', lit(false), op('call'))), invalid);
  assert.throws(() => run(op('or', lit(true), get('constructor'))), invalid);
  assert.throws(() => run(op('and', lit(true), get('missing'))), inputError);
});
test('T04 operation and path limits checked at exact boundary', () => {
  const ast = get('a', 'b');
  assert.equal(run(ast, { a: { b: 1 } }, { maxOperations: 3, maxPathSegments: 2 }), 1);
  assert.throws(() => run(ast, { a: { b: 1 } }, { maxOperations: 2 }), limit);
  assert.throws(() => run(ast, {}, { maxPathSegments: 1 }), limit);
  assert.throws(() => run(lit(1), {}, { maxOperations: 0 }), limit);
  assert.throws(() => run(get(...Array<string>(9).fill('a'))), limit);
  // 组合 73 个 AST 节点与 8 段路径的查找，超过硬操作上限。
  const path = Array<string>(8).fill('a');
  const leaf = get(...path);
  const tree = op('and', ...Array.from({ length: 8 }, () => op('and', ...Array.from({ length: 8 }, () => leaf))));
  let data: unknown = true;
  for (const key of path) data = { [key]: data };
  assert.throws(() => run(tree, data), limit);
});
test('T04 AST nodes, depth, arity and unknown properties fail closed', () => {
  assert.equal(run(lit(1), {}, { maxAstNodes: 1, maxAstDepth: 1 }), 1);
  assert.throws(() => run(lit(1), {}, { maxAstNodes: 0 }), limit);
  let tree: unknown = lit(true);
  for (let i = 0; i < 16; i += 1) tree = { op: 'not', arg: tree };
  assert.throws(() => run(tree), limit);
  const group = op('and', ...Array.from({ length: 8 }, () => lit(true)));
  const branch = op('and', ...Array.from({ length: 8 }, () => group));
  assert.throws(() => run(op('and', branch, branch)), limit);
  for (const ast of [op('add', lit(1)), op('and'), op('or', ...Array.from({ length: 9 }, () => lit(true))),
    { op: 'literal', value: 1, extra: 2 }, get(), { op: 'get', path: [1] }, lit({}), null]) {
    assert.throws(() => run(ast), invalid);
  }
});
test('T04 raw byte limits precede parsing and decoded strings are bounded', () => {
  assert.throws(() => element.evaluate('!'.repeat(32769), '{}'), limit);
  assert.throws(() => element.evaluate(JSON.stringify(lit(1)), '!'.repeat(32769)), limit);
  assert.throws(() => element.evaluate(JSON.stringify(lit(1)), '"文"', { maxInputBytes: 4 }), limit);
  assert.equal(element.evaluate(JSON.stringify(lit(1)), '"文"', { maxInputBytes: 5 }), 1);
  assert.throws(() => run(lit('文'), {}, { maxStringBytes: 2 }), limit);
  assert.throws(() => run(lit(1), { x: 'a'.repeat(4097) }), limit);
  assert.throws(() => run(lit(1), {}, { maxInputBytes: 32769 }), limit);
  assert.throws(() => run(lit(1), {}, { maxOperations: 257 }), limit);
  assert.throws(() => element.evaluate('not JSON private payload', '{}'), invalid);
  assert.throws(() => element.evaluate(JSON.stringify(lit(1)), 'bad private payload'), inputError);
});
test('T04 arbitrary objects, getter, proxy, cyclic and function rejected without traps', () => {
  let traps = 0;
  const poison = { get op() { traps += 1; throw Error('getter'); } };
  const proxy = new Proxy({}, { get() { traps += 1; throw Error('get'); }, ownKeys() { traps += 1; throw Error('keys'); } });
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const value of [poison, proxy, cyclic, () => true, Promise.resolve(true)]) {
    assert.throws(() => element.evaluate(value as unknown as string, '{}'), invalid);
    assert.throws(() => element.evaluate(JSON.stringify(lit(true)), value as unknown as string), inputError);
  }
  assert.throws(() => run(lit(true), {}, proxy), inputError);
  const options = { get maxOperations(): number { traps += 1; throw Error('getter'); } };
  assert.throws(() => run(lit(true), {}, options), inputError);
  assert.equal(traps, 0);
});
test('T04 finite numbers, strict types and safe own scalar paths', () => {
  for (const ast of [op('eq', lit(1), lit('1')), op('eq', lit(null), lit(false)), op('add', lit('1'), lit(1)),
    op('div', lit(1), lit(0)), op('add', lit(Number.MAX_SAFE_INTEGER), lit(1)),
    { op: 'not', arg: lit(1) }, op('mul', lit(-1), lit(0))]) assert.throws(() => run(ast), evaluation);
  assert.throws(() => element.evaluate('{"op":"literal","value":1e999}', '{}'), invalid);
  assert.throws(() => element.evaluate('{"op":"literal","value":-0}', '{}'), invalid);
  assert.throws(() => element.evaluate(JSON.stringify(lit(1)), '{"x":9007199254740992}'), inputError);
  for (const key of ['__proto__', 'prototype', 'constructor']) assert.throws(() => run(get(key)), invalid);
  assert.throws(() => run(get('toString')), inputError);
  assert.throws(() => run(get('x'), { x: {} }), inputError);
  assert.throws(() => run(get('x', '0'), { x: [1] }), inputError);
  assert.throws(() => element.evaluate(JSON.stringify(lit(1)), '{"__proto__":{}}'), inputError);
});
