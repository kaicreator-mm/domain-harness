import type { JsonObject, JsonValue } from '../contracts/json.js';

export interface DomainPredicateEvent {
  readonly type: string;
  readonly payload?: JsonObject;
}

export type DomainPredicateOperand =
  | { readonly source: 'context'; readonly path: readonly string[] }
  | { readonly source: 'event'; readonly path: readonly string[] }
  | { readonly source: 'literal'; readonly value: JsonValue };

export type DomainPredicate =
  | { readonly op: 'constant'; readonly value: boolean }
  | { readonly op: 'exists'; readonly operand: DomainPredicateOperand }
  | {
      readonly op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
      readonly left: DomainPredicateOperand;
      readonly right: DomainPredicateOperand;
    }
  | { readonly op: 'not'; readonly predicate: DomainPredicate }
  | { readonly op: 'all' | 'any'; readonly predicates: readonly DomainPredicate[] };

export interface DomainWorkflowGuard {
  readonly guardId: string;
  readonly predicate: DomainPredicate;
}

/**
 * Hard Invariants are supplied by the pinned Governance Baseline. This type
 * only defines their predicate shape; governance pin lookup/binding is owned
 * by the governance/admission tasks, not by the Workflow contract.
 */
export interface DomainHardInvariantPredicate {
  readonly invariantId: string;
  readonly predicate: DomainPredicate;
}

export interface DomainPredicateEvaluationInput {
  readonly context: JsonObject;
  readonly event: DomainPredicateEvent;
}

export class PredicateContractViolation extends Error {
  readonly code = 'PREDICATE_CONTRACT_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PredicateContractViolation';
  }
}

const MISSING = Symbol('domain-harness.predicate.missing');
const MAX_PREDICATE_DEPTH = 64;

type ResolvedOperand = JsonValue | typeof MISSING;

export function evaluateDomainPredicate(
  predicate: DomainPredicate,
  input: DomainPredicateEvaluationInput,
): boolean {
  const safePredicate = cloneDataOnly(predicate, '$predicate') as unknown as DomainPredicate;
  const safeContext = cloneDataOnly(input.context, '$context') as JsonObject;
  const safeEvent = cloneDataOnly(input.event, '$event') as unknown as DomainPredicateEvent;

  return evaluateSafePredicate(safePredicate, { context: safeContext, event: safeEvent }, 0);
}

export function evaluateDomainWorkflowGuard(
  guard: DomainWorkflowGuard,
  input: DomainPredicateEvaluationInput,
): boolean {
  return evaluateFailClosed(guard.predicate, input);
}

export function evaluateDomainHardInvariantPredicate(
  invariant: DomainHardInvariantPredicate,
  input: DomainPredicateEvaluationInput,
): boolean {
  return evaluateFailClosed(invariant.predicate, input);
}

function evaluateFailClosed(
  predicate: DomainPredicate,
  input: DomainPredicateEvaluationInput,
): boolean {
  try {
    return evaluateDomainPredicate(predicate, input);
  } catch {
    return false;
  }
}

function evaluateSafePredicate(
  predicate: DomainPredicate,
  input: DomainPredicateEvaluationInput,
  depth: number,
): boolean {
  if (depth > MAX_PREDICATE_DEPTH) {
    throw new PredicateContractViolation('predicate nesting exceeds the supported deterministic depth');
  }

  switch (predicate.op) {
    case 'constant':
      return predicate.value;
    case 'exists':
      return resolveOperand(predicate.operand, input) !== MISSING;
    case 'eq':
      return compareEquality(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input));
    case 'neq':
      return !compareEquality(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input));
    case 'gt':
      return compareOrdered(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input)) > 0;
    case 'gte':
      return compareOrdered(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input)) >= 0;
    case 'lt':
      return compareOrdered(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input)) < 0;
    case 'lte':
      return compareOrdered(resolveOperand(predicate.left, input), resolveOperand(predicate.right, input)) <= 0;
    case 'not':
      return !evaluateSafePredicate(predicate.predicate, input, depth + 1);
    case 'all':
      return predicate.predicates.every((candidate) => evaluateSafePredicate(candidate, input, depth + 1));
    case 'any':
      return predicate.predicates.some((candidate) => evaluateSafePredicate(candidate, input, depth + 1));
    default:
      throw new PredicateContractViolation('unknown predicate operator');
  }
}

function resolveOperand(
  operand: DomainPredicateOperand,
  input: DomainPredicateEvaluationInput,
): ResolvedOperand {
  switch (operand.source) {
    case 'literal':
      return operand.value;
    case 'context':
      return readPath(input.context, operand.path);
    case 'event':
      return readPath(input.event as unknown as JsonObject, operand.path);
    default:
      throw new PredicateContractViolation('unknown predicate operand source');
  }
}

function readPath(root: JsonObject, path: readonly string[]): ResolvedOperand {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof segment !== 'string' || segment.length === 0) {
      throw new PredicateContractViolation('predicate path segments must be non-empty strings');
    }
    if (current === null || typeof current !== 'object') {
      return MISSING;
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (descriptor === undefined) {
      return MISSING;
    }
    if (!('value' in descriptor)) {
      throw new PredicateContractViolation('accessor properties are forbidden in predicate inputs');
    }
    current = descriptor.value;
  }
  return current as JsonValue;
}

function compareEquality(left: ResolvedOperand, right: ResolvedOperand): boolean {
  if (left === MISSING || right === MISSING) {
    return left === right;
  }
  return dataEquals(left, right);
}

function compareOrdered(left: ResolvedOperand, right: ResolvedOperand): number {
  if (left === MISSING || right === MISSING) {
    throw new PredicateContractViolation('ordered comparison cannot use a missing operand');
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right ? 0 : left > right ? 1 : -1;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right ? 0 : left > right ? 1 : -1;
  }
  throw new PredicateContractViolation('ordered comparison requires two numbers or two strings');
}

function dataEquals(left: JsonValue, right: JsonValue): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => {
      const other = right[index];
      return other !== undefined && dataEquals(value, other);
    });
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }
    const leftValue = left[key];
    const rightValue = right[key];
    return leftValue !== undefined && rightValue !== undefined && dataEquals(leftValue, rightValue);
  });
}

function cloneDataOnly(value: unknown, path: string, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new PredicateContractViolation(`${path} contains a non-finite number`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new PredicateContractViolation(`${path} must contain JSON data only`);
  }
  if (seen.has(value)) {
    throw new PredicateContractViolation(`${path} contains a cycle`);
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          throw new PredicateContractViolation(`${path}[${index}] must be a data property`);
        }
        result.push(cloneDataOnly(descriptor.value, `${path}[${index}]`, seen));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PredicateContractViolation(`${path} must use a plain object prototype`);
    }

    const result: JsonObject = {};
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new PredicateContractViolation(`${path}.${key} accessor properties are forbidden`);
      }
      result[key] = cloneDataOnly(descriptor.value, `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
