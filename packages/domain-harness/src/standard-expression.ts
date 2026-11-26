import { types } from 'node:util';

/** 有限表达式的标量结果。
 * @dhKind type
 * @dhCapability expression
 */
export type ExpressionScalar = string | number | boolean | null;
/** 表达式输入、节点、深度和运算限制。
 * @dhKind type
 * @dhCapability expression
 */
export interface ExpressionLimits {
  readonly maxAstNodes: number;
  readonly maxAstDepth: number;
  readonly maxInputBytes: number;
  readonly maxOperations: number;
  readonly maxPathSegments: number;
  readonly maxStringBytes: number;
}
const hard: ExpressionLimits = Object.freeze({ maxAstNodes: 128, maxAstDepth: 16,
  maxInputBytes: 32768, maxOperations: 256, maxPathSegments: 8, maxStringBytes: 4096 });
type ErrorCode = 'EXPRESSION_INVALID' | 'EXPRESSION_LIMIT' | 'EXPRESSION_INPUT' | 'EXPRESSION_EVALUATION';
function fail(code: ErrorCode): never { throw new TypeError(code); }
function limitsOf(options: Partial<ExpressionLimits>): ExpressionLimits {
  if (!options || typeof options !== 'object' || types.isProxy(options)) return fail('EXPRESSION_INPUT');
  const proto: unknown = Object.getPrototypeOf(options);
  if (proto !== Object.prototype && proto !== null) return fail('EXPRESSION_INPUT');
  const read = (key: keyof ExpressionLimits): number => {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (descriptor === undefined) return hard[key];
    if (!Object.hasOwn(descriptor, 'value')) return fail('EXPRESSION_INPUT');
    const value: unknown = descriptor.value;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > hard[key]) return fail('EXPRESSION_LIMIT');
    return value;
  };
  return { maxAstNodes: read('maxAstNodes'), maxAstDepth: read('maxAstDepth'),
    maxInputBytes: read('maxInputBytes'), maxOperations: read('maxOperations'),
    maxPathSegments: read('maxPathSegments'), maxStringBytes: read('maxStringBytes') };
}
function parse(text: string, maxBytes: number, code: ErrorCode): unknown {
  // 先检查原始文本长度，绝不序列化或遍历调用方的任意 JS 对象。
  if (typeof text !== 'string') return fail(code);
  if (text.length > maxBytes || Buffer.byteLength(text, 'utf8') > maxBytes) return fail('EXPRESSION_LIMIT');
  try { return JSON.parse(text) as unknown; } catch { return fail(code); }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function validNumber(value: number): boolean {
  return Number.isFinite(value) && !Object.is(value, -0) && (!Number.isInteger(value) || Number.isSafeInteger(value));
}
function scalar(value: unknown, limits: ExpressionLimits, code: ErrorCode): ExpressionScalar {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && validNumber(value)) return value;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > limits.maxStringBytes) return fail('EXPRESSION_LIMIT');
    return value;
  }
  return fail(code);
}
function forbidden(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}
// 输入只来自 JSON.parse；迭代检查避免深层输入导致调用栈溢出。
function validateInput(input: unknown, limits: ExpressionLimits): void {
  const pending: unknown[] = [input];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) { for (const child of value as readonly unknown[]) pending.push(child); }
    else if (record(value)) {
      for (const [key, child] of Object.entries(value)) {
        scalar(key, limits, 'EXPRESSION_INPUT');
        if (forbidden(key)) fail('EXPRESSION_INPUT');
        pending.push(child);
      }
    } else scalar(value, limits, 'EXPRESSION_INPUT');
  }
}
type Binary = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'add' | 'sub' | 'mul' | 'div';
type Expr = { op: 'literal'; value: ExpressionScalar } | { op: 'get'; path: string[] } |
  { op: 'not'; arg: Expr } | { op: 'and' | 'or' | Binary; args: Expr[] };
function exact(value: Record<string, unknown>, key: string): void {
  if (Object.keys(value).length !== 2 || !Object.hasOwn(value, 'op') || !Object.hasOwn(value, key)) fail('EXPRESSION_INVALID');
}
function validateAst(root: unknown, limits: ExpressionLimits): Expr {
  let nodes = 0;
  const visit = (value: unknown, depth: number): Expr => {
    if (++nodes > limits.maxAstNodes || depth > limits.maxAstDepth) return fail('EXPRESSION_LIMIT');
    if (!record(value)) return fail('EXPRESSION_INVALID');
    const op = value.op;
    switch (op) {
      case 'literal': exact(value, 'value'); return { op, value: scalar(value.value, limits, 'EXPRESSION_INVALID') };
      case 'get': {
        exact(value, 'path');
        if (!Array.isArray(value.path) || value.path.length === 0) return fail('EXPRESSION_INVALID');
        if (value.path.length > limits.maxPathSegments) return fail('EXPRESSION_LIMIT');
        const path = (value.path as readonly unknown[]).map(key => {
          if (typeof key !== 'string' || forbidden(key)) return fail('EXPRESSION_INVALID');
          scalar(key, limits, 'EXPRESSION_INVALID');
          return key;
        });
        return { op, path };
      }
      case 'not': exact(value, 'arg'); return { op, arg: visit(value.arg, depth + 1) };
      case 'and': case 'or': case 'eq': case 'ne': case 'lt': case 'le': case 'gt': case 'ge':
      case 'add': case 'sub': case 'mul': case 'div': {
        exact(value, 'args');
        if (!Array.isArray(value.args)) return fail('EXPRESSION_INVALID');
        const args = value.args as readonly unknown[];
        if (op === 'and' || op === 'or' ? args.length < 1 || args.length > 8 : args.length !== 2) return fail('EXPRESSION_INVALID');
        return { op, args: args.map(arg => visit(arg, depth + 1)) };
      }
      default: return fail('EXPRESSION_INVALID');
    }
  };
  return visit(root, 1);
}
function boolean(value: ExpressionScalar): boolean {
  if (typeof value !== 'boolean') return fail('EXPRESSION_EVALUATION');
  return value;
}
function binary(op: Binary, a: ExpressionScalar, b: ExpressionScalar): ExpressionScalar {
  if (op === 'eq' || op === 'ne') {
    if (typeof a !== typeof b || (a === null) !== (b === null)) return fail('EXPRESSION_EVALUATION');
    return op === 'eq' ? a === b : a !== b;
  }
  if (typeof a !== 'number' || typeof b !== 'number') return fail('EXPRESSION_EVALUATION');
  switch (op) {
    case 'lt': return a < b;
    case 'le': return a <= b;
    case 'gt': return a > b;
    case 'ge': return a >= b;
    case 'add': return numericResult(a + b);
    case 'sub': return numericResult(a - b);
    case 'mul': return numericResult(a * b);
    case 'div': if (b === 0) return fail('EXPRESSION_EVALUATION'); return numericResult(a / b);
  }
}
function numericResult(value: number): number {
  if (!validNumber(value)) return fail('EXPRESSION_EVALUATION');
  return value;
}
/** 仅计算有限纯 JSON 表达式，不执行领域代码、不验证 Package。
 * @dhKind standard-element
 * @dhCapability expression
 */
export class BoundedExpressionElement {
  evaluate(astJson: string, inputJson: string, options: Partial<ExpressionLimits> = {}): ExpressionScalar {
    const limits = limitsOf(options);
    const ast = validateAst(parse(astJson, hard.maxInputBytes, 'EXPRESSION_INVALID'), limits);
    const input = parse(inputJson, limits.maxInputBytes, 'EXPRESSION_INPUT');
    validateInput(input, limits);
    let operations = 0;
    const charge = (): void => { if (operations >= limits.maxOperations) fail('EXPRESSION_LIMIT'); operations += 1; };
    const run = (expr: Expr): ExpressionScalar => {
      charge();
      switch (expr.op) {
        case 'literal': return expr.value;
        case 'get': {
          let value = input;
          for (const key of expr.path) {
            charge();
            if (!record(value) || !Object.hasOwn(value, key)) return fail('EXPRESSION_INPUT');
            value = value[key];
          }
          return scalar(value, limits, 'EXPRESSION_INPUT');
        }
        case 'not': return !boolean(run(expr.arg));
        case 'and': for (const arg of expr.args) { if (!boolean(run(arg))) return false; } return true;
        case 'or': for (const arg of expr.args) { if (boolean(run(arg))) return true; } return false;
        default: return binary(expr.op, run(expr.args[0] as Expr), run(expr.args[1] as Expr));
      }
    };
    return run(ast);
  }
}
