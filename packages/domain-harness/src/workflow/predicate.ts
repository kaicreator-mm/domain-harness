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

/**
 * Admission-time evaluation never attempts to discover whether an arbitrary
 * live JavaScript object is safe. Values are copied/frozen at an explicit
 * preparation boundary and their prepared identity is then checked with
 * WeakSet.has(), which does not invoke Proxy traps.
 */
const preparedPredicates = new WeakSet<object>();
const preparedWorkflowGuards = new WeakSet<object>();
const preparedHardInvariants = new WeakSet<object>();
const preparedContexts = new WeakSet<object>();
const preparedEvents = new WeakSet<object>();
const preparedInputs = new WeakSet<object>();

type ResolvedOperand = JsonValue | typeof MISSING;

/**
 * Configuration/pre-admission boundary for compiled predicate data.
 * This function may inspect the supplied value while preparing it; callers
 * must not invoke it from an authoritative Guard/Hard-Invariant predicate.
 */
export function prepareDomainPredicate(predicate: DomainPredicate): DomainPredicate {
  const safePredicate = cloneDataOnlyForPreparation(predicate, '$predicate') as unknown as DomainPredicate;
  if (!isObjectReference(safePredicate)) {
    throw new PredicateContractViolation('$predicate must be an object');
  }
  deepFreezePreparedData(safePredicate as unknown as JsonValue);
  preparedPredicates.add(safePredicate);
  return safePredicate;
}

/**
 * Configuration/pre-admission boundary for Workflow Guard definitions.
 */
export function prepareDomainWorkflowGuard(guard: DomainWorkflowGuard): DomainWorkflowGuard {
  const safeGuard = cloneDataOnlyForPreparation(guard, '$guard') as unknown as DomainWorkflowGuard;
  if (
    !isObjectReference(safeGuard) ||
    typeof safeGuard.guardId !== 'string' ||
    safeGuard.guardId.length === 0 ||
    !isObjectReference(safeGuard.predicate)
  ) {
    throw new PredicateContractViolation('Workflow Guard must contain a non-empty guardId and predicate object');
  }
  deepFreezePreparedData(safeGuard as unknown as JsonValue);
  preparedWorkflowGuards.add(safeGuard);
  preparedPredicates.add(safeGuard.predicate);
  return safeGuard;
}

/**
 * Configuration/pre-admission boundary for Governance Hard Invariants.
 */
export function prepareDomainHardInvariantPredicate(
  invariant: DomainHardInvariantPredicate,
): DomainHardInvariantPredicate {
  const safeInvariant = cloneDataOnlyForPreparation(
    invariant,
    '$hardInvariant',
  ) as unknown as DomainHardInvariantPredicate;
  if (
    !isObjectReference(safeInvariant) ||
    typeof safeInvariant.invariantId !== 'string' ||
    safeInvariant.invariantId.length === 0 ||
    !isObjectReference(safeInvariant.predicate)
  ) {
    throw new PredicateContractViolation(
      'Hard Invariant must contain a non-empty invariantId and predicate object',
    );
  }
  deepFreezePreparedData(safeInvariant as unknown as JsonValue);
  preparedHardInvariants.add(safeInvariant);
  preparedPredicates.add(safeInvariant.predicate);
  return safeInvariant;
}

/**
 * Pre-admission boundary for Workflow context. The returned object is detached
 * from the caller, recursively frozen, and registered as trusted predicate
 * data. Runtime Guard evaluation only accepts this prepared identity.
 */
export function prepareDomainPredicateContext(context: JsonObject): JsonObject {
  const safeContext = cloneDataOnlyForPreparation(context, '$context');
  if (!isJsonObject(safeContext)) {
    throw new PredicateContractViolation('$context must be a JSON object');
  }
  deepFreezePreparedData(safeContext);
  preparedContexts.add(safeContext);
  return safeContext;
}

/**
 * Pre-admission boundary for structured Domain Events.
 */
export function prepareDomainPredicateEvent(event: DomainPredicateEvent): DomainPredicateEvent {
  const safeEvent = cloneDataOnlyForPreparation(event, '$event');
  if (!isJsonObject(safeEvent)) {
    throw new PredicateContractViolation('$event must be a JSON object');
  }
  const type = safeEvent['type'];
  if (typeof type !== 'string' || type.length === 0) {
    throw new PredicateContractViolation('$event.type must be a non-empty string');
  }
  const payload = safeEvent['payload'];
  if (payload !== undefined && !isJsonObject(payload)) {
    throw new PredicateContractViolation('$event.payload must be a JSON object when present');
  }
  deepFreezePreparedData(safeEvent);
  preparedEvents.add(safeEvent);
  return safeEvent as unknown as DomainPredicateEvent;
}

/**
 * Creates an admission input only from already prepared context/event values.
 * WeakSet membership checks are trap-free and therefore safe to run on an
 * untrusted candidate reference before any property access occurs.
 */
export function createPreparedDomainPredicateEvaluationInput(
  context: JsonObject,
  event: DomainPredicateEvent,
): DomainPredicateEvaluationInput {
  if (
    !isObjectReference(context) ||
    !preparedContexts.has(context) ||
    !isObjectReference(event) ||
    !preparedEvents.has(event)
  ) {
    throw new PredicateContractViolation('predicate input must use prepared context and event data');
  }
  const input: DomainPredicateEvaluationInput = Object.freeze({ context, event });
  preparedInputs.add(input);
  return input;
}

/**
 * Convenience preparation boundary for callers that already hold trusted
 * compiled/runtime-owned data. It is intentionally separate from evaluation.
 */
export function prepareDomainPredicateEvaluationInput(
  input: DomainPredicateEvaluationInput,
): DomainPredicateEvaluationInput {
  const context = prepareDomainPredicateContext(input.context);
  const event = prepareDomainPredicateEvent(input.event);
  return createPreparedDomainPredicateEvaluationInput(context, event);
}

export function evaluateDomainPredicate(
  predicate: DomainPredicate,
  input: DomainPredicateEvaluationInput,
): boolean {
  assertPreparedPredicate(predicate);
  assertPreparedInput(input);
  return evaluateSafePredicate(predicate, input, 0);
}

export function evaluateDomainWorkflowGuard(
  guard: DomainWorkflowGuard,
  input: DomainPredicateEvaluationInput,
): boolean {
  if (
    !isObjectReference(guard) ||
    !preparedWorkflowGuards.has(guard) ||
    !isObjectReference(input) ||
    !preparedInputs.has(input)
  ) {
    return false;
  }
  try {
    return evaluateSafePredicate(guard.predicate, input, 0);
  } catch {
    return false;
  }
}

export function evaluateDomainHardInvariantPredicate(
  invariant: DomainHardInvariantPredicate,
  input: DomainPredicateEvaluationInput,
): boolean {
  if (
    !isObjectReference(invariant) ||
    !preparedHardInvariants.has(invariant) ||
    !isObjectReference(input) ||
    !preparedInputs.has(input)
  ) {
    return false;
  }
  try {
    return evaluateSafePredicate(invariant.predicate, input, 0);
  } catch {
    return false;
  }
}

function assertPreparedPredicate(predicate: DomainPredicate): void {
  if (!isObjectReference(predicate) || !preparedPredicates.has(predicate)) {
    throw new PredicateContractViolation('predicate must be prepared before authoritative evaluation');
  }
}

function assertPreparedInput(input: DomainPredicateEvaluationInput): void {
  if (!isObjectReference(input) || !preparedInputs.has(input)) {
    throw new PredicateContractViolation('predicate input must be prepared before authoritative evaluation');
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
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return MISSING;
    }
    current = (current as Record<string, unknown>)[segment];
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

function cloneDataOnlyForPreparation(
  value: unknown,
  path: string,
  seen = new WeakSet<object>(),
): JsonValue {
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
        result.push(cloneDataOnlyForPreparation(descriptor.value, `${path}[${index}]`, seen));
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
      result[key] = cloneDataOnlyForPreparation(descriptor.value, `${path}.${key}`, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function deepFreezePreparedData(value: JsonValue): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreezePreparedData(item);
    }
  } else {
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item !== undefined) {
        deepFreezePreparedData(item);
      }
    }
  }
  Object.freeze(value);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectReference(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}
