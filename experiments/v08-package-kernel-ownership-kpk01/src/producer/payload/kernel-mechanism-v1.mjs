/**
 * ============================================================================
 * Kernel Domain Package — vnext v1.1.0 mechanism module (experiment KPK-01)
 * ============================================================================
 *
 * [Controller 090 repair, #993] v1.1.0 supersedes the reviewed v1.0.0 sealed
 * bytes (digest 275b2ca7…) with ONE bounded addition: the kernel-owned,
 * data-only, allowlisted per-occurrence dynamic Admission Effect input and
 * business idempotency-key binding (section "[Controller 090 bounded
 * repair]" below). That section is NEW kernel-owned code — NOT a v0.7
 * migration — and closes the #972-documented contract limitation that the
 * effect side only ever saw the transition-declared STATIC intent payload
 * (#972@6096530583 CELL1, #972@6098188937 §C). The v1.0.0 independent
 * review does NOT transfer to these mutated bytes.
 *
 * This module is the PHYSICAL executable mechanism implementation of a
 * versioned Kernel Domain Package for the #993 bounded architecture
 * experiment. It is sealed as immutable package bytes by the test-only system
 * producer and instantiated from those exact bytes by the Microkernel
 * (`DomainHarness.load(package)`); the Microkernel itself contains none of
 * this code and never imports the original v0.7 runtime engine.
 *
 * SOURCE MIGRATION ATTRIBUTION (file/function level; see OWNERSHIP_MAP.md and
 * MIGRATION_MAP.json for the machine-readable map):
 *
 * All authoritative sections below are extracted/adapted from the accepted
 * frozen v0.7 sources of this same repository, pinned at:
 *   - main       3c71b9138056babfafbc7de1349b5924483f2203 (bridge/v0.7-to-main)
 *   - version/v0.7 86110c616b8cb18c730553e4cdab7ef555214521
 * Same-project provenance (kaicreator-mm/domain-harness); no third-party
 * license applies. Adaptations are strictly mechanical (TypeScript types
 * stripped, host ports generalized, per-mechanism trace counters added) and
 * are individually marked with `[KPK-01 adaptation]`; every authoritative
 * decision path keeps the v0.7 logic and error text verbatim so the original
 * v0.7 modules can be used as golden oracles side-by-side (KPK-14).
 *
 *   | Section            | v0.7 source (packages/domain-harness/src/)        | exact blob |
 *   |--------------------|---------------------------------------------------|------------|
 *   | canonical identity | contracts/identity.ts                             | 152e1c22… (json.ts types only) / identity.ts blob 89ab…* see MIGRATION_MAP.json |
 *   | predicate engine   | workflow/predicate.ts                             | see MIGRATION_MAP.json |
 *   | baseline identity  | governance/identity.ts (bounded subset)           | see MIGRATION_MAP.json |
 *   | admission          | admission/admission.ts (admitCentralDecision)     | 955ecf1fcd9e7ceb4478e46a1c2f5f4d0266fa4e |
 *   | admission contracts| admission/contracts.ts (CentralAdmissionError)    | 2b441f1fd4aaa5d0944131283de92153ae878a86 |
 *   | effect journal     | admission/effect-journal.ts (Volatile…)           | c6ae1f98c1e0c0cb5582df16ff3075c93c1f5fc2 |
 *   | serialized lane    | engine/per-instance-serialized-lane.ts            | d5a94501648f547ef408870c16b0ce6297fc81b5 |
 *   | instance repo      | instance/persistent-workflow-instance.ts          | 3e2252967aea56d8ef698001f02dc301f4f5925d |
 *   | instance engine    | engine/workflow-instance-engine.ts                | 108299995ba1b4be2366becd500fc1cd24d57c44 |
 *
 * NOT migrated (deliberately, per #993 migration precompute): the 1094-line
 * T004C `invokeEffectfulTool` composition, the 1159-line T002B static
 * assembly graph verifier, the 1752-line T003C build-time binding selector
 * and the 1176-line monolithic `createDomainRuntime` host constructor. Those
 * are build-time/host ownership; the Kernel Package here owns exactly the
 * dynamic authoritative occurrence mechanism nucleus.
 *
 * Kernel ABI (kpk01-kernel-abi/1) — exported endpoint factory:
 *   createOccurrenceRuntime({ moduleIdentity, hostPorts, sdkEndpoint,
 *   businessEndpoint, observe }) → { openInstance, submitOccurrence,
 *   getSnapshot, getJournalRecords, getMechanismIdentity, counters, stop }
 */

export const MODULE_ID = 'kernel-vnext@1.1.0';
export const PACKAGE_KIND = 'kernel';
export const ABI_VERSION = 'kpk01-kernel-abi/1';
export const KERNEL_GENERATION = '1';
export const ENDPOINTS = [
  { endpointId: 'kernel:occurrence-runtime', kind: 'occurrence-runtime' },
];

// ===========================================================================
// v0.7 migrated: contracts/json.ts + contracts/identity.ts (canonical JSON)
// Source: packages/domain-harness/src/contracts/identity.ts (verbatim logic)
// ===========================================================================

export class IdentityContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdentityContractError';
    this.code = code;
  }
}

function failCanonical(path, reason) {
  throw new IdentityContractError(
    'INVALID_CANONICAL_JSON',
    `cannot canonicalize ${path}: ${reason}`,
  );
}

function assertNoSymbolKeys(value, path) {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    failCanonical(path, 'symbol-keyed properties are not JSON');
  }
}

function requireDataProperty(value, key, path) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    failCanonical(path, 'JSON properties must be enumerable data properties');
  }
  return descriptor.value;
}

function canonicalize(value, path, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) failCanonical(path, 'number must be finite');
    return value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) failCanonical(path, 'circular reference');
    assertNoSymbolKeys(value, path);
    ancestors.add(value);

    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        failCanonical(`${path}[${index}]`, 'sparse array entries are not canonical JSON');
      }
      result.push(
        canonicalize(requireDataProperty(value, key, `${path}[${index}]`), `${path}[${index}]`, ancestors),
      );
    }

    const unexpectedKeys = Object.getOwnPropertyNames(value).filter((key) => {
      if (key === 'length') return false;
      if (!/^(0|[1-9]\d*)$/.test(key)) return true;
      const index = Number(key);
      return !Number.isSafeInteger(index) || index < 0 || index >= value.length;
    });
    if (unexpectedKeys.length > 0) {
      failCanonical(path, 'arrays may not carry extra object properties');
    }

    ancestors.delete(value);
    return result;
  }

  if (typeof value === 'object' && value !== null) {
    if (ancestors.has(value)) failCanonical(path, 'circular reference');
    assertNoSymbolKeys(value, path);

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      failCanonical(path, 'semantic objects must be plain JSON objects');
    }

    const ownNames = Object.getOwnPropertyNames(value);
    const nonEnumerable = ownNames.filter(
      (key) => !Object.prototype.propertyIsEnumerable.call(value, key),
    );
    if (nonEnumerable.length > 0) {
      failCanonical(path, 'non-enumerable properties are not canonical JSON');
    }

    ancestors.add(value);
    // Null-prototype avoids special setters such as Object.prototype.__proto__.
    const result = Object.create(null);
    for (const key of ownNames.sort()) {
      result[key] = canonicalize(
        requireDataProperty(value, key, `${path}.${key}`),
        `${path}.${key}`,
        ancestors,
      );
    }

    ancestors.delete(value);
    return result;
  }

  failCanonical(path, `unsupported value type ${typeof value}`);
}

/**
 * Convert JSON-compatible semantic material into a deterministic structure.
 * Object keys are sorted recursively; array order is preserved.
 */
export function canonicalizeJson(value) {
  return canonicalize(value, '$', new Set());
}

/** Deterministic UTF-8 material used as input to content-addressed digests. */
export function canonicalJsonStringify(value) {
  const encoded = JSON.stringify(canonicalizeJson(value));
  if (encoded === undefined) failCanonical('$', 'value did not produce JSON text');
  return encoded;
}

/** Compute a canonical SHA-256 content digest through the portable host seam. */
export async function computeCanonicalJsonDigest(value, sha256) {
  const digest = await sha256.digestUtf8(canonicalJsonStringify(value));
  if (typeof digest !== 'string' || digest.length === 0) {
    throw new IdentityContractError(
      'INVALID_CONTENT_DIGEST',
      'Sha256Port returned an empty or invalid content digest',
    );
  }
  return digest;
}

// ===========================================================================
// v0.7 migrated: workflow/predicate.ts — deterministic predicate engine
// Source: packages/domain-harness/src/workflow/predicate.ts (verbatim logic)
// ===========================================================================

export class PredicateContractViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'PredicateContractViolation';
    this.code = 'PREDICATE_CONTRACT_VIOLATION';
  }
}

const MISSING = Symbol('domain-harness.predicate.missing');
const MAX_PREDICATE_DEPTH = 64;

const preparedPredicates = new WeakSet();
const preparedWorkflowGuards = new WeakSet();
const preparedHardInvariants = new WeakSet();
const preparedContexts = new WeakSet();
const preparedEvents = new WeakSet();
const preparedInputs = new WeakSet();

function isObjectReference(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneDataOnlyForPreparation(value, path, seen = new WeakSet()) {
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
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          throw new PredicateContractViolation(`${path}[${index}] must be a data property`);
        }
        result.push(cloneDataOnlyForPreparation(descriptor.value, `${path}[${index}]`, seen));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new PredicateContractViolation(`${path} must use a plain object prototype`);
    }

    const result = Object.create(null);
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

function deepFreezePreparedData(value) {
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

export function prepareDomainPredicate(predicate) {
  const safePredicate = cloneDataOnlyForPreparation(predicate, '$predicate');
  if (!isObjectReference(safePredicate)) {
    throw new PredicateContractViolation('$predicate must be an object');
  }
  deepFreezePreparedData(safePredicate);
  preparedPredicates.add(safePredicate);
  return safePredicate;
}

export function prepareDomainWorkflowGuard(guard) {
  const safeGuard = cloneDataOnlyForPreparation(guard, '$guard');
  if (
    !isObjectReference(safeGuard) ||
    typeof safeGuard.guardId !== 'string' ||
    safeGuard.guardId.length === 0 ||
    !isObjectReference(safeGuard.predicate)
  ) {
    throw new PredicateContractViolation('Workflow Guard must contain a non-empty guardId and predicate object');
  }
  deepFreezePreparedData(safeGuard);
  preparedWorkflowGuards.add(safeGuard);
  preparedPredicates.add(safeGuard.predicate);
  return safeGuard;
}

export function prepareDomainHardInvariantPredicate(invariant) {
  const safeInvariant = cloneDataOnlyForPreparation(invariant, '$hardInvariant');
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
  deepFreezePreparedData(safeInvariant);
  preparedHardInvariants.add(safeInvariant);
  preparedPredicates.add(safeInvariant.predicate);
  return safeInvariant;
}

export function prepareDomainPredicateContext(context) {
  const safeContext = cloneDataOnlyForPreparation(context, '$context');
  if (!isJsonObject(safeContext)) {
    throw new PredicateContractViolation('$context must be a JSON object');
  }
  deepFreezePreparedData(safeContext);
  preparedContexts.add(safeContext);
  return safeContext;
}

export function prepareDomainPredicateEvent(event) {
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
  return safeEvent;
}

export function createPreparedDomainPredicateEvaluationInput(context, event) {
  if (
    !isObjectReference(context) ||
    !preparedContexts.has(context) ||
    !isObjectReference(event) ||
    !preparedEvents.has(event)
  ) {
    throw new PredicateContractViolation('predicate input must use prepared context and event data');
  }
  const input = Object.freeze({ context, event });
  preparedInputs.add(input);
  return input;
}

export function prepareDomainPredicateEvaluationInput(input) {
  const context = prepareDomainPredicateContext(input.context);
  const event = prepareDomainPredicateEvent(input.event);
  return createPreparedDomainPredicateEvaluationInput(context, event);
}

export function evaluateDomainPredicate(predicate, input) {
  assertPreparedPredicate(predicate);
  assertPreparedInput(input);
  return evaluateSafePredicate(predicate, input, 0);
}

export function evaluateDomainWorkflowGuard(guard, input) {
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

export function evaluateDomainHardInvariantPredicate(invariant, input) {
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

function assertPreparedPredicate(predicate) {
  if (!isObjectReference(predicate) || !preparedPredicates.has(predicate)) {
    throw new PredicateContractViolation('predicate must be prepared before authoritative evaluation');
  }
}

function assertPreparedInput(input) {
  if (!isObjectReference(input) || !preparedInputs.has(input)) {
    throw new PredicateContractViolation('predicate input must be prepared before authoritative evaluation');
  }
}

function evaluateSafePredicate(predicate, input, depth) {
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

function resolveOperand(operand, input) {
  switch (operand.source) {
    case 'literal':
      return operand.value;
    case 'context':
      return readPath(input.context, operand.path);
    case 'event':
      return readPath(input.event, operand.path);
    default:
      throw new PredicateContractViolation('unknown predicate operand source');
  }
}

function readPath(root, path) {
  let current = root;
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
    current = current[segment];
  }
  return current;
}

function compareEquality(left, right) {
  if (left === MISSING || right === MISSING) {
    return left === right;
  }
  return dataEquals(left, right);
}

function compareOrdered(left, right) {
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

function dataEquals(left, right) {
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

// ===========================================================================
// v0.7 migrated: governance/identity.ts — bounded baseline identity subset
// Source: packages/domain-harness/src/governance/identity.ts
// (assertGovernanceBaselineIdentity / governanceBaselineKey /
//  sameGovernanceBaselineIdentity / verifyGovernanceBaselineBody only)
// ===========================================================================

export class GovernanceContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GovernanceContractError';
    this.code = code;
  }
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GovernanceContractError(
      'INVALID_GOVERNANCE_IDENTITY',
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function isContentDigest(value) {
  return typeof value === 'string' && value.length > 0;
}

export function assertGovernanceBaselineIdentity(identity) {
  requireNonEmptyString(identity.domainId, 'domainId');
  requireNonEmptyString(identity.governanceId, 'governanceId');
  requireNonEmptyString(identity.schemaVersion, 'schemaVersion');
  if (!isContentDigest(identity.contentDigest)) {
    throw new GovernanceContractError(
      'INVALID_GOVERNANCE_IDENTITY',
      'contentDigest must be a non-empty exact content digest',
    );
  }
  if (identity.version !== undefined) requireNonEmptyString(identity.version, 'version');
}

/** Exact registry key. Lifecycle version labels are deliberately excluded. */
export function governanceBaselineKey(identity) {
  assertGovernanceBaselineIdentity(identity);
  return canonicalJsonStringify({
    domainId: identity.domainId,
    governanceId: identity.governanceId,
    schemaVersion: identity.schemaVersion,
    contentDigest: identity.contentDigest,
  });
}

export function sameGovernanceBaselineIdentity(left, right) {
  return governanceBaselineKey(left) === governanceBaselineKey(right);
}

function semanticDigestMaterial(schemaVersion, semantics) {
  return { schemaVersion, semantics };
}

export async function computeGovernanceBaselineIdentity(input, sha256) {
  const domainId = requireNonEmptyString(input.domainId, 'domainId');
  const governanceId = requireNonEmptyString(input.governanceId, 'governanceId');
  const schemaVersion = requireNonEmptyString(input.schemaVersion, 'schemaVersion');
  const version = input.version === undefined
    ? undefined
    : requireNonEmptyString(input.version, 'version');
  const contentDigest = await computeCanonicalJsonDigest(
    semanticDigestMaterial(schemaVersion, input.semantics),
    sha256,
  );

  return version === undefined
    ? { domainId, governanceId, schemaVersion, contentDigest }
    : { domainId, governanceId, schemaVersion, version, contentDigest };
}

export async function verifyGovernanceBaselineBody(body, sha256) {
  assertGovernanceBaselineIdentity(body.identity);
  const expected = await computeCanonicalJsonDigest(
    semanticDigestMaterial(body.identity.schemaVersion, body.semantics),
    sha256,
  );
  if (expected !== body.identity.contentDigest) {
    throw new GovernanceContractError(
      'GOVERNANCE_DIGEST_MISMATCH',
      `Governance Baseline ${body.identity.governanceId} content digest does not match canonical semantics`,
    );
  }
}

// ===========================================================================
// v0.7 migrated: admission/contracts.ts — runtime shapes + typed taxonomy
// Source: packages/domain-harness/src/admission/contracts.ts
// (CentralAdmissionError and the shapes consumed by admitCentralDecision)
// ===========================================================================

export class CentralAdmissionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CentralAdmissionError';
    this.code = code;
  }
}

// ===========================================================================
// v0.7 migrated: admission/admission.ts — the central authoritative path
// Source: packages/domain-harness/src/admission/admission.ts
// (deriveDurableControlTurnId, admissionResolverEvidence, predicate shape
//  validation, pinned baseline requirement, transition selection,
//  executeEffectIntents, admitCentralDecision)
// [KPK-01 adaptation] ports may carry an optional `trace` counter bag; guard /
// hard-invariant evaluation sites bump it for mechanism ownership evidence.
// Everything else is verbatim.
// ===========================================================================

function requireComponent(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_TURN_SOURCE',
      `${label} must be a non-empty string`,
    );
  }
  return encodeURIComponent(value);
}

function requireOrdinal(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_TURN_SOURCE',
      `${label} must be a positive safe integer`,
    );
  }
  return value;
}

/**
 * Deterministic Durable Control Turn identity (frozen L2 §13.2). Replaying the
 * same source derives the same id; distinct sources never collide. Synchronous
 * engine microsteps settle inside the containing turn — every effect/query/AI
 * operation identity derives from this id plus a stable operation ordinal.
 */
export function deriveDurableControlTurnId(target, source) {
  const base = `turn:${requireComponent(target.workflowId, 'workflowId')}:${requireComponent(target.instanceKey, 'instanceKey')}`;
  switch (source.kind) {
    case 'message':
      return `${base}:message:${requireComponent(source.sourceMessageId, 'sourceMessageId')}`;
    case 'child-terminal':
      if (source.terminalKind !== 'done' && source.terminalKind !== 'error') {
        throw new CentralAdmissionError(
          'ADMISSION_INVALID_TURN_SOURCE',
          'terminalKind must be done or error',
        );
      }
      return `${base}:child:${requireComponent(source.parentActorId, 'parentActorId')}:${requireComponent(source.childActorId, 'childActorId')}:${requireOrdinal(source.invocationOrdinal, 'invocationOrdinal')}:${source.terminalKind}`;
    case 'timer':
      return `${base}:timer:${requireComponent(source.timerId, 'timerId')}:${requireOrdinal(source.fireOrdinal, 'fireOrdinal')}`;
    case 'callback':
      return `${base}:callback:${requireComponent(source.externalCorrelationId, 'externalCorrelationId')}:${requireOrdinal(source.callbackOrdinal, 'callbackOrdinal')}`;
    case 'recovery':
      return `${base}:recovery:${requireComponent(source.durableRecoveryActionId, 'durableRecoveryActionId')}:${requireOrdinal(source.resumeOrdinal, 'resumeOrdinal')}`;
    default:
      throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', 'unknown turn source kind');
  }
}

/** §21 handoff: resolver telemetry/LLM-avoidance evidence for the turn receipt. */
export function admissionResolverEvidence(resolved) {
  return {
    source: resolved.source,
    llmAvoided: resolved.llmAvoided,
    freshModelCallCount: resolved.freshModelCallCount,
    cacheRead: resolved.cacheDisposition.read,
    ...(resolved.cacheDisposition.write === undefined
      ? {}
      : { cacheWrite: resolved.cacheDisposition.write }),
    telemetryEventCount: resolved.telemetry.length,
  };
}

const PREDICATE_OPS = new Set([
  'constant', 'exists', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'not', 'all', 'any',
]);
const OPERAND_SOURCES = new Set(['context', 'event', 'literal']);
const MAX_SHAPE_DEPTH = 64;

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertOperandShape(operand, path, fail) {
  if (!isPlainObject(operand)) fail(`${path} must be an operand object`);
  const source = operand['source'];
  if (typeof source !== 'string' || !OPERAND_SOURCES.has(source)) {
    fail(`${path}.source must be context, event or literal`);
  }
  if (source === 'literal') {
    if (!Object.prototype.hasOwnProperty.call(operand, 'value')) fail(`${path}.value is required for a literal operand`);
    try {
      canonicalizeJson(operand['value']);
    } catch (error) {
      fail(`${path}.value must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  const pathValue = operand['path'];
  if (
    !Array.isArray(pathValue)
    || pathValue.some((segment) => typeof segment !== 'string' || segment.length === 0)
  ) {
    fail(`${path}.path must be an array of non-empty strings`);
  }
}

/**
 * Recursive DomainPredicate shape validation. Evaluation trusts the shape
 * (e.g. `constant` returns its value raw), so admission validates the full
 * predicate tree before any authoritative evaluation — a digest-consistent
 * but type-malformed predicate can never become a truthy Hard Invariant or a
 * fail-open guard (T-019 review P2-2).
 */
function assertDomainPredicateShape(predicate, path, fail, depth = 0) {
  if (depth > MAX_SHAPE_DEPTH) fail(`${path} exceeds the supported predicate depth`);
  if (!isPlainObject(predicate)) fail(`${path} must be a predicate object`);
  const op = predicate['op'];
  if (typeof op !== 'string' || !PREDICATE_OPS.has(op)) {
    fail(`${path}.op is not a known predicate operator`);
  }
  switch (op) {
    case 'constant':
      if (typeof predicate['value'] !== 'boolean') fail(`${path}.value must be a boolean`);
      return;
    case 'exists':
      assertOperandShape(predicate['operand'], `${path}.operand`, fail);
      return;
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      assertOperandShape(predicate['left'], `${path}.left`, fail);
      assertOperandShape(predicate['right'], `${path}.right`, fail);
      return;
    case 'not':
      assertDomainPredicateShape(predicate['predicate'], `${path}.predicate`, fail, depth + 1);
      return;
    case 'all':
    case 'any': {
      const predicates = predicate['predicates'];
      if (!Array.isArray(predicates)) fail(`${path}.predicates must be an array`);
      predicates.forEach((candidate, index) => {
        assertDomainPredicateShape(candidate, `${path}.predicates[${index}]`, fail, depth + 1);
      });
      return;
    }
    default:
      fail(`${path}.op is not a known predicate operator`);
  }
}

function invalidHardInvariant(message) {
  throw new CentralAdmissionError('ADMISSION_INVALID_HARD_INVARIANTS', message);
}

/**
 * The pinned baseline body is the only Hard Invariant source. Structurally
 * malformed content fails closed loudly; evaluation-time errors are denied by
 * the T-006 evaluator (false), which is already the safe direction.
 */
function readPinnedHardInvariants(body) {
  const raw = body.semantics['hardInvariants'];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_HARD_INVARIANTS',
      'pinned baseline semantics.hardInvariants must be an array when present',
    );
  }
  return raw.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_HARD_INVARIANTS',
        `hardInvariants[${index}] must be an object`,
      );
    }
    if (typeof entry['invariantId'] !== 'string' || entry['invariantId'].length === 0) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_HARD_INVARIANTS',
        `hardInvariants[${index}].invariantId must be a non-empty string`,
      );
    }
    assertDomainPredicateShape(
      entry['predicate'],
      `hardInvariants[${index}].predicate`,
      invalidHardInvariant,
    );
    return {
      invariantId: entry['invariantId'],
      predicate: entry['predicate'],
    };
  });
}

async function requirePinnedBaseline(request, ports, sha256) {
  // T-014 gate: pinned governance for EVERY authoritative admission. Pin
  // absence/invalidity propagates as GovernanceExecutionBindingError.
  const pin = await ports.governance.requirePinnedExecution(request.workflowInstanceId);
  const body = await ports.baselines.getBody(pin.governanceBaseline);
  if (body === undefined) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      `exact pinned Governance Baseline ${pin.governanceBaseline.governanceId}@${pin.governanceBaseline.contentDigest} is unavailable; no substitution is permitted`,
    );
  }
  try {
    await verifyGovernanceBaselineBody(body, sha256);
  } catch (error) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      `exact pinned Governance Baseline body is corrupt: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!sameGovernanceBaselineIdentity(body.identity, pin.governanceBaseline)) {
    throw new CentralAdmissionError(
      'ADMISSION_PINNED_BASELINE_UNAVAILABLE',
      'resolved Governance Baseline body does not match the exact GovernanceExecutionPin',
    );
  }
  return { bindingDigest: pin.bindingDigest, hardInvariants: readPinnedHardInvariants(body) };
}

function sameTrigger(left, right) {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}

function deny(reason, turnId, bindingDigest, resolver, extras = {}) {
  return {
    status: 'denied',
    denial: {
      reason,
      durableControlTurnId: turnId,
      governanceBindingDigest: bindingDigest,
      ...(extras.invariantId === undefined ? {} : { invariantId: extras.invariantId }),
      ...(extras.transitionKey === undefined ? {} : { transitionKey: extras.transitionKey }),
      ...(extras.guardId === undefined ? {} : { guardId: extras.guardId }),
      resolver,
    },
  };
}

function evaluateHardInvariants(hardInvariants, input, trace) {
  for (const invariant of hardInvariants) {
    const prepared = prepareDomainHardInvariantPredicate(invariant);
    // [KPK-01 adaptation] mechanism ownership measurement only.
    if (trace !== undefined) trace.hardInvariantEvaluations += 1;
    if (!evaluateDomainHardInvariantPredicate(prepared, input)) {
      return invariant.invariantId;
    }
  }
  return undefined;
}

function selectAdmittedTransition(request, input, trace) {
  const state = request.definition.states.find((candidate) => candidate.stateKey === request.currentStateKey);
  if (state === undefined) {
    throw new CentralAdmissionError(
      'ADMISSION_UNKNOWN_STATE',
      `current state ${request.currentStateKey} is not declared in workflow ${request.definition.workflowKey}`,
    );
  }
  const guards = new Map((request.definition.guards ?? []).map((guard) => [guard.guardId, guard]));
  const candidates = (state.transitions ?? []).filter((transition) => sameTrigger(transition.trigger, request.trigger));
  if (candidates.length === 0) return { noCandidate: true };

  let lastRejected;
  for (const candidate of candidates) {
    let guardPasses = true;
    let guardId;
    if (candidate.guardId !== undefined) {
      const guard = guards.get(candidate.guardId);
      if (guard === undefined) {
        throw new CentralAdmissionError(
          'ADMISSION_UNKNOWN_GUARD',
          `transition ${candidate.transitionKey} references unknown guard ${candidate.guardId}`,
        );
      }
      guardId = guard.guardId;
      // Definition integrity: a malformed guard predicate must never become a
      // fail-open constant or a silent denial (T-019 review P2-2).
      assertDomainPredicateShape(
        guard.predicate,
        `guard ${guard.guardId}.predicate`,
        (message) => {
          throw new CentralAdmissionError('ADMISSION_INVALID_PREDICATE_SHAPE', message);
        },
      );
      // [KPK-01 adaptation] mechanism ownership measurement only.
      if (trace !== undefined) trace.guardEvaluations += 1;
      guardPasses = evaluateDomainWorkflowGuard(prepareDomainWorkflowGuard(guard), input);
    }
    if (guardPasses) return { admitted: candidate };
    lastRejected = {
      transitionKey: candidate.transitionKey,
      ...(guardId === undefined ? {} : { guardId }),
    };
  }
  return { rejected: lastRejected ?? { transitionKey: candidates[0]?.transitionKey ?? '' } };
}

async function executeEffectIntents(intents, request, ports, turnId) {
  const outcomes = [];
  let ordinal = 0;
  for (const intent of intents) {
    ordinal += 1;
    const effectId = `${turnId}/effect/${ordinal}`;
    const binding = ports.effectTools.resolve(intent.effectType);
    if (binding === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_TOOL_UNBOUND',
        `no mutation-capable tool binding is declared for effect type ${intent.effectType}`,
      );
    }
    const record = {
      effectId,
      target: request.target,
      durableControlTurnId: turnId,
      operationOrdinal: ordinal,
      effectType: intent.effectType,
      effectSemantics: binding.effectSemantics,
      status: 'started',
      attempt: 1,
      input: intent.input,
      ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
      startedAt: request.now,
    };

    let begun;
    try {
      begun = await ports.effectJournal.beginEffect(record);
    } catch (error) {
      if (error instanceof CentralAdmissionError) throw error;
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect journal begin failed for ${effectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const durable = begun.record;

    if (durable.status === 'completed') {
      // §18: a completed durable effect found during recovery is reused; the
      // mutation is never re-executed (V8/V12 — no evidence port involved).
      outcomes.push({
        effectId,
        effectType: durable.effectType,
        disposition: 'replayed',
        ...(durable.idempotencyKey === undefined ? {} : { idempotencyKey: durable.idempotencyKey }),
        ...(durable.output === undefined ? {} : { output: durable.output }),
      });
      continue;
    }
    if (durable.status === 'failed') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_FAILED',
        `effect ${effectId} has a durably failed outcome; operator recovery owns any retry`,
      );
    }
    if (begun.disposition === 'existing' && durable.effectSemantics === 'non-idempotent') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_AMBIGUOUS',
        `effect ${effectId} was started but never committed; re-executing a non-idempotent effect is forbidden`,
      );
    }

    let output;
    try {
      output = await ports.effectTools.execute({
        effectId,
        target: request.target,
        durableControlTurnId: turnId,
        operationOrdinal: ordinal,
        binding,
        input: intent.input,
        ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
        logicalTime: request.now,
      });
      canonicalizeJson(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = { message };
      try {
        await ports.effectJournal.completeEffect(
          effectId,
          { status: 'failed', error: failure, completedAt: request.now },
        );
      } catch (commitError) {
        // Never lose the journal-unreadable signal: the host must see that the
        // failure record itself is not durable (P3-2).
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} failed (${message}) and the failure record could not be committed: ${commitError instanceof Error ? commitError.message : String(commitError)}`,
        );
      }
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_FAILED',
        `effect ${effectId} (${intent.effectType}) failed: ${message}`,
      );
    }

    let committed;
    try {
      committed = await ports.effectJournal.completeEffect(
        effectId,
        { status: 'completed', output, completedAt: request.now },
      );
    } catch (error) {
      // Never repeat the external mutation in this attempt; a fresh attempt
      // re-reads the durable journal and either replays or fails closed.
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect journal commit for ${effectId} is ambiguous: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    outcomes.push({
      effectId,
      effectType: intent.effectType,
      disposition: 'executed',
      ...(intent.idempotencyKey === undefined ? {} : { idempotencyKey: intent.idempotencyKey }),
      ...(committed.output === undefined ? {} : { output: committed.output }),
    });
  }
  return outcomes;
}

/**
 * The single central authoritative admission path (frozen L2 §15, Amendment
 * A1 §8.1): structured result → current schema → pinned Governance Baseline
 * Hard Invariants → current guard → transition → durable effect intent.
 *
 * Every resolver source (rule / exact cache / promoted subworkflow / Business
 * Harness) passes the same gates, so no source can bypass admission. The
 * admitted output is a plan for the parent Durable Control Turn publication;
 * admission itself never mutates workflow state, message dispositions or
 * control snapshots, and holds no resolver/evidence handle — guard rejection
 * is final, with no hidden resolver retry (S7).
 */
export async function admitCentralDecision(request, ports) {
  const turnId = deriveDurableControlTurnId(request.target, request.turn);
  const pinned = await requirePinnedBaseline(request, ports, ports.sha256);
  const resolver = admissionResolverEvidence(request.resolved);
  const trace = ports.trace; // [KPK-01 adaptation] measurement only

  const input = createPreparedDomainPredicateEvaluationInput(
    prepareDomainPredicateContext(request.context),
    prepareDomainPredicateEvent(request.event),
  );

  let schemaValid;
  try {
    schemaValid = request.decisionSchema.isValid(request.resolved.structuredDecision);
  } catch (error) {
    // The schema is caller authority; its failure fails the admission closed
    // inside the typed taxonomy rather than escaping as a naked error (P3-1).
    throw new CentralAdmissionError(
      'ADMISSION_EVALUATION_INPUT_INVALID',
      `decision schema evaluation failed closed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!schemaValid) {
    return deny('schema', turnId, pinned.bindingDigest, resolver);
  }

  const failedInvariant = evaluateHardInvariants(pinned.hardInvariants, input, trace);
  if (failedInvariant !== undefined) {
    return deny('hard-invariant', turnId, pinned.bindingDigest, resolver, { invariantId: failedInvariant });
  }

  const selection = selectAdmittedTransition(request, input, trace);
  if ('noCandidate' in selection) {
    return deny('no-candidate-transition', turnId, pinned.bindingDigest, resolver);
  }
  if ('rejected' in selection) {
    return deny('guard', turnId, pinned.bindingDigest, resolver, selection.rejected);
  }

  // [Controller 090 repair] Per-occurrence dynamic effect input/idempotency
  // binding is resolved HERE: after authorized transition admission, before
  // any journal write or effect dispatch. Static intents pass through with
  // exact v0.7 behavior; dynamic failures fail closed typed with zero
  // journal/resource activity.
  const effectIntents = resolveAdmissionEffectIntents(
    selection.admitted.effectIntents ?? [],
    request,
    ports.effectBindings,
  );

  const effects = await executeEffectIntents(
    effectIntents,
    request,
    ports,
    turnId,
  );

  return {
    status: 'admitted',
    admitted: {
      durableControlTurnId: turnId,
      governanceBindingDigest: pinned.bindingDigest,
      transitionKey: selection.admitted.transitionKey,
      targetState: selection.admitted.targetState,
      effects,
      resolver,
    },
  };
}

// ===========================================================================
// [Controller 090 bounded repair (#993) — kernel-owned NEW mechanism code,
// NOT a v0.7 migration] Per-occurrence dynamic Admission Effect input
// binding and business idempotency-key binding (data-only, allowlisted,
// wiring-pinned).
//
// Closes the #972-documented contract limitation (#972@6096530583 CELL1,
// #972@6098188937 §C): the sealed kernel previously journaled and dispatched
// the transition-declared STATIC `intent.input`/`intent.idempotencyKey` on
// every occurrence, so per-request business data (approval amount/requestId,
// inventory sku/qty) could never reach the effect side. A Business package
// may now declare on a transition effect intent:
//
//   inputFrom:          { <effectField>: { source: 'event'|'decision', path } }
//   idempotencyKeyFrom: { template: 'reserve:quote:{requestId}' }
//
// Rules — all enforced by THIS kernel module, no other component gains
// authority:
//   - `event` paths may only address the rule-authorized projection
//     (['type'] or ['payload', <payloadFromInput key>]); `decision` paths
//     only the typed decision shape (['outcome'] or ['data', <same
//     authorized key>], because the Standard SDK projects decision.data
//     from the same authorized payload projection).
//   - Template literals are restricted to [A-Za-z0-9._:-]; every
//     {placeholder} must reference a declared inputFrom field.
//   - Static `input` and `inputFrom` (resp. `idempotencyKey` and
//     `idempotencyKeyFrom`) are mutually exclusive authorities.
//   - Validation happens ONCE at wiring (createOccurrenceRuntime — inside
//     the trusted DomainHarness.load installation boundary) and the
//     validated declaration is deep-frozen into a WeakMap keyed by the
//     exact intent objects: live mutation after wiring is IGNORED (the
//     snapshot is authoritative) and NEW binding syntax appearing on an
//     intent that was never wired fails typed at resolution
//     (ADMISSION_EFFECT_BINDING_UNVALIDATED).
//   - Resolution happens ONLY inside admitCentralDecision AFTER authorized
//     transition admission and BEFORE any journal write or effect dispatch;
//     a resolved idempotency key must match [A-Za-z0-9][A-Za-z0-9._:-]{0,127}
//     or the occurrence fails typed BEFORE the journal. Nothing is
//     string-evaluated; the resolved input must be canonical JSON; no Host
//     port, resource, doc store or UX payload participates in resolution.
// ===========================================================================

const ADMISSION_EFFECT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TEMPLATE_PLACEHOLDER_PATTERN = /^[A-Za-z0-9_]+$/;
const TEMPLATE_LITERAL_PATTERN = /^[A-Za-z0-9._:-]*$/;

function invalidEffectBinding(message) {
  throw new CentralAdmissionError('ADMISSION_EFFECT_BINDING_INVALID', message);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** Parse a key template into literal/placeholder segments (validated shapes only). */
function parseEffectKeyTemplate(template) {
  const segments = [];
  let index = 0;
  while (index < template.length) {
    const open = template.indexOf('{', index);
    if (open === -1) {
      const tail = template.slice(index);
      if (tail.length > 0) segments.push({ literal: tail });
      break;
    }
    const literal = template.slice(index, open);
    if (literal.length > 0) segments.push({ literal });
    const close = template.indexOf('}', open + 1);
    if (close === -1) {
      invalidEffectBinding('idempotencyKeyFrom.template has an unterminated {placeholder}');
    }
    const placeholder = template.slice(open + 1, close);
    if (!TEMPLATE_PLACEHOLDER_PATTERN.test(placeholder)) {
      invalidEffectBinding(`idempotencyKeyFrom.template placeholder {${placeholder}} is not a plain field name`);
    }
    segments.push({ placeholder });
    index = close + 1;
  }
  if (segments.length === 0) invalidEffectBinding('idempotencyKeyFrom.template is empty');
  return segments;
}

function validatedAuthorizedKeys(rule) {
  const projection = rule?.payloadFromInput;
  if (!isPlainObject(projection)) {
    invalidEffectBinding(`rule ${String(rule?.ruleId)}: payloadFromInput must be an object to authorize a dynamic effect binding`);
  }
  return new Set(Object.keys(projection));
}

function validateEffectBindingPath(spec, field, authorizedKeys) {
  if (!isPlainObject(spec)) invalidEffectBinding(`inputFrom.${field} must be an object`);
  for (const key of Object.keys(spec)) {
    if (key !== 'source' && key !== 'path') {
      invalidEffectBinding(`inputFrom.${field} may only declare source and path`);
    }
  }
  if (spec.source !== 'event' && spec.source !== 'decision') {
    invalidEffectBinding(`inputFrom.${field}.source must be 'event' or 'decision'`);
  }
  const path = spec.path;
  if (
    !Array.isArray(path)
    || path.length === 0
    || path.length > 2
    || path.some((segment) => typeof segment !== 'string' || segment.length === 0)
  ) {
    invalidEffectBinding(`inputFrom.${field}.path must be one or two non-empty string segments`);
  }
  const withinEventProjection = (path.length === 1 && path[0] === 'type')
    || (path.length === 2 && path[0] === 'payload' && authorizedKeys.has(path[1]));
  const withinDecisionShape = (path.length === 1 && path[0] === 'outcome')
    || (path.length === 2 && path[0] === 'data' && authorizedKeys.has(path[1]));
  const allowed = spec.source === 'event' ? withinEventProjection : withinDecisionShape;
  if (!allowed) {
    invalidEffectBinding(
      `inputFrom.${field} ${spec.source} path [${path.join(', ')}] is outside the rule-authorized projection`,
    );
  }
}

function snapshotEffectBinding(intent, authorizedKeys) {
  const inputFrom = intent.inputFrom;
  if (!isPlainObject(inputFrom) || Object.keys(inputFrom).length === 0) {
    invalidEffectBinding('inputFrom must be a non-empty object of field bindings');
  }
  for (const [field, spec] of Object.entries(inputFrom)) {
    validateEffectBindingPath(spec, field, authorizedKeys);
  }
  if (intent.idempotencyKeyFrom !== undefined) {
    if (!isPlainObject(intent.idempotencyKeyFrom) || Object.keys(intent.idempotencyKeyFrom).some((key) => key !== 'template')) {
      invalidEffectBinding('idempotencyKeyFrom may only declare template');
    }
    const template = intent.idempotencyKeyFrom.template;
    if (typeof template !== 'string' || template.length === 0 || template.length > 128) {
      invalidEffectBinding('idempotencyKeyFrom.template must be a 1..128 character string');
    }
    for (const segment of parseEffectKeyTemplate(template)) {
      if (segment.literal !== undefined && !TEMPLATE_LITERAL_PATTERN.test(segment.literal)) {
        invalidEffectBinding(
          `idempotencyKeyFrom.template literal "${segment.literal}" contains characters outside [A-Za-z0-9._:-]`,
        );
      }
      if (segment.placeholder !== undefined && !hasOwn(inputFrom, segment.placeholder)) {
        invalidEffectBinding(
          `idempotencyKeyFrom.template placeholder {${segment.placeholder}} is not a declared inputFrom field`,
        );
      }
    }
  }
  let frozenInputFrom;
  try {
    frozenInputFrom = cloneDataOnlyForPreparation(inputFrom, '$effectInputFrom');
  } catch (error) {
    invalidEffectBinding(`inputFrom must be JSON data only: ${error instanceof Error ? error.message : String(error)}`);
  }
  deepFreezePreparedData(frozenInputFrom);
  const snapshot = { inputFrom: frozenInputFrom };
  if (intent.idempotencyKeyFrom !== undefined) {
    snapshot.idempotencyKeyFrom = Object.freeze({ template: intent.idempotencyKeyFrom.template });
  }
  return Object.freeze(snapshot);
}

function definitionDeclaresDynamicBinding(definition) {
  for (const state of definition?.states ?? []) {
    for (const transition of state.transitions ?? []) {
      for (const intent of transition.effectIntents ?? []) {
        if (hasOwn(intent, 'inputFrom') || hasOwn(intent, 'idempotencyKeyFrom')) return true;
      }
    }
  }
  return false;
}

/**
 * Wiring-time validation of every dynamic effect-intent binding reachable
 * from the business policy, executed once inside createOccurrenceRuntime
 * (the trusted DomainHarness.load installation boundary). A malformed,
 * unauthorized or ambiguous declaration fails the load typed BEFORE any
 * instance can exist (KPK-10-class installation refusal; the producer and
 * Microkernel keep NO duplicate semantic validator).
 */
function wireAdmissionEffectBindings(businessEndpoint) {
  const registry = new WeakMap();

  const wireDefinition = (definition, rule, intentType) => {
    for (const state of definition?.states ?? []) {
      for (const transition of state.transitions ?? []) {
        for (const intent of transition.effectIntents ?? []) {
          if (!hasOwn(intent, 'inputFrom') && !hasOwn(intent, 'idempotencyKeyFrom')) continue;
          if (hasOwn(intent, 'input') && hasOwn(intent, 'inputFrom')) {
            invalidEffectBinding(`intent ${intentType}, transition ${transition.transitionKey}: static input and inputFrom are mutually exclusive`);
          }
          if (hasOwn(intent, 'idempotencyKey') && hasOwn(intent, 'idempotencyKeyFrom')) {
            invalidEffectBinding(`intent ${intentType}, transition ${transition.transitionKey}: static idempotencyKey and idempotencyKeyFrom are mutually exclusive`);
          }
          if (hasOwn(intent, 'idempotencyKeyFrom') && !hasOwn(intent, 'inputFrom')) {
            invalidEffectBinding(`intent ${intentType}, transition ${transition.transitionKey}: idempotencyKeyFrom requires inputFrom (placeholders reference declared fields)`);
          }
          const snapshot = snapshotEffectBinding(intent, validatedAuthorizedKeys(rule));
          const existing = registry.get(intent);
          if (existing !== undefined) {
            if (canonicalJsonStringify(existing) !== canonicalJsonStringify(snapshot)) {
              invalidEffectBinding(`intent ${intentType}: the same effect intent object is wired against conflicting rule authorizations`);
            }
          } else {
            registry.set(intent, snapshot);
          }
        }
      }
    }
  };

  for (const [intentType, binding] of Object.entries(businessEndpoint.intentBindings ?? {})) {
    const rule = (businessEndpoint.rules ?? {})[binding.ruleId];
    const definition = binding.definition ?? businessEndpoint.workflowDefinition;
    if (rule === undefined) {
      if (definitionDeclaresDynamicBinding(definition)) {
        invalidEffectBinding(`intent ${intentType}: a dynamic effect binding requires rule ${String(binding.ruleId)} to exist`);
      }
      continue;
    }
    wireDefinition(definition, rule, intentType);
  }
  return registry;
}

const BINDING_VALUE_MISSING = Symbol('kpk01.effect-binding.missing');

function readBindingPath(root, path) {
  let current = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || !hasOwn(current, segment)) {
      return BINDING_VALUE_MISSING;
    }
    current = current[segment];
  }
  return current;
}

/**
 * Resolve the per-occurrence dynamic effect inputs and idempotency keys for
 * the ADMITTED transition's effect intents. Called only from
 * admitCentralDecision AFTER authorized transition admission and BEFORE any
 * journal write or effect dispatch. Intents without dynamic declarations
 * pass through untouched (exact v0.7 static behavior). The wiring snapshot
 * is the ONLY trusted declaration source; a per-occurrence failure fails
 * closed typed with zero journal/resource activity.
 */
function resolveAdmissionEffectIntents(intents, request, wiring) {
  if (intents.length === 0) return intents;
  return intents.map((intent) => {
    if (!hasOwn(intent, 'inputFrom') && !hasOwn(intent, 'idempotencyKeyFrom')) {
      return intent; // static intent — v0.7-identical passthrough
    }
    const snapshot = wiring?.get(intent);
    if (snapshot === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_BINDING_UNVALIDATED',
        `effect intent for ${intent.effectType} carries dynamic-binding syntax that was never validated at wiring; post-wiring injected declarations are refused`,
      );
    }
    const decision = request.resolved?.structuredDecision?.decision;
    const input = {};
    for (const [field, spec] of Object.entries(snapshot.inputFrom)) {
      const root = spec.source === 'event' ? request.event : decision;
      const value = root === undefined || root === null
        ? BINDING_VALUE_MISSING
        : readBindingPath(root, spec.path);
      if (value === BINDING_VALUE_MISSING) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_BINDING_UNRESOLVED',
          `effect input field ${field} (${spec.source} path ${spec.path.join('.')}) is not present on this occurrence; dynamic bindings fail closed before any journal write`,
        );
      }
      try {
        canonicalizeJson(value);
      } catch (error) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_BINDING_UNRESOLVED',
          `effect input field ${field} must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      input[field] = value;
    }
    let idempotencyKey;
    if (snapshot.idempotencyKeyFrom !== undefined) {
      let composed = '';
      for (const segment of parseEffectKeyTemplate(snapshot.idempotencyKeyFrom.template)) {
        if (segment.literal !== undefined) {
          composed += segment.literal;
          continue;
        }
        const value = input[segment.placeholder];
        if (value === null || typeof value === 'object' || typeof value === 'function' || typeof value === 'bigint' || typeof value === 'symbol') {
          throw new CentralAdmissionError(
            'ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID',
            `idempotency key placeholder {${segment.placeholder}} must compose from a string, number or boolean value`,
          );
        }
        composed += String(value);
      }
      if (!ADMISSION_EFFECT_IDEMPOTENCY_KEY_PATTERN.test(composed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID',
          `resolved idempotency key is not a safe token ([A-Za-z0-9][A-Za-z0-9._:-]{0,127}); refusing before any journal write`,
        );
      }
      idempotencyKey = composed;
    }
    return {
      effectType: intent.effectType,
      input,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    };
  });
}

// ===========================================================================
// v0.7 migrated: admission/effect-journal.ts — VolatileAdmissionEffectJournal
// Source: packages/domain-harness/src/admission/effect-journal.ts (verbatim)
// ===========================================================================

function requireNonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      `${label} must be a non-empty string`,
    );
  }
}

function validateRecord(record) {
  requireNonEmpty(record.effectId, 'effectId');
  requireNonEmpty(record.target.workflowId, 'workflowId');
  requireNonEmpty(record.target.instanceKey, 'instanceKey');
  requireNonEmpty(record.durableControlTurnId, 'durableControlTurnId');
  requireNonEmpty(record.effectType, 'effectType');
  if (!Number.isSafeInteger(record.operationOrdinal) || record.operationOrdinal <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'operationOrdinal must be a positive safe integer',
    );
  }
  if (!Number.isSafeInteger(record.attempt) || record.attempt <= 0) {
    throw new CentralAdmissionError(
      'ADMISSION_EFFECT_JOURNAL_CONFLICT',
      'attempt must be a positive safe integer',
    );
  }
}

function effectIdentityKey(record) {
  return canonicalJsonStringify({
    effectId: record.effectId,
    target: {
      workflowId: record.target.workflowId,
      instanceKey: record.target.instanceKey,
    },
    durableControlTurnId: record.durableControlTurnId,
    operationOrdinal: record.operationOrdinal,
    effectType: record.effectType,
    effectSemantics: record.effectSemantics,
    input: record.input,
    idempotencyKey: record.idempotencyKey ?? null,
  });
}

function sameIdentity(left, right) {
  return effectIdentityKey(left) === effectIdentityKey(right);
}

function outcomeKey(record) {
  return canonicalJsonStringify({
    status: record.status,
    output: record.output ?? null,
    error: record.error ?? null,
  });
}

/**
 * Portable deterministic logical-reference effect journal. It mirrors the
 * frozen re-begin/complete semantics so host adapters can be parity-tested; it
 * makes no host durability claim (T-022/T-023 own real durability proof).
 */
export class VolatileAdmissionEffectJournal {
  #records = new Map();

  async getEffect(effectId) {
    return this.#records.get(effectId) ?? null;
  }

  async beginEffect(record) {
    validateRecord(record);
    if (record.status !== 'started') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        'beginEffect requires a started record',
      );
    }
    const existing = this.#records.get(record.effectId);
    if (existing !== undefined) {
      if (!sameIdentity(existing, record)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} already exists with an incompatible identity`,
        );
      }
      return { disposition: 'existing', record: existing };
    }
    this.#records.set(record.effectId, record);
    return { disposition: 'created', record };
  }

  async completeEffect(effectId, outcome) {
    requireNonEmpty(effectId, 'effectId');
    // Store-side canonical-JSON gate (P3-4): a journaled outcome must always be
    // canonical-JSON-safe, independent of the caller's own checks.
    try {
      canonicalJsonStringify(
        outcome.status === 'completed' ? { output: outcome.output } : { error: outcome.error },
      );
    } catch (error) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} outcome must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const existing = this.#records.get(effectId);
    if (existing === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `cannot complete effect ${effectId} that was never begun`,
      );
    }
    const completed = outcome.status === 'completed'
      ? {
          ...existing,
          status: 'completed',
          output: outcome.output,
          completedAt: outcome.completedAt,
        }
      : {
          ...existing,
          status: 'failed',
          error: outcome.error,
          completedAt: outcome.completedAt,
        };
    if (existing.status !== 'started') {
      if (outcomeKey(existing) !== outcomeKey(completed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} is already settled with a conflicting outcome`,
        );
      }
      return existing;
    }
    this.#records.set(effectId, completed);
    return completed;
  }

  getRecords() {
    return [...this.#records.values()].sort((left, right) =>
      left.effectId < right.effectId ? -1 : left.effectId > right.effectId ? 1 : 0);
  }
}

// ===========================================================================
// [KPK-01 experiment, kernel-owned] Durable effect journal adapter over the
// generic Host document-store port.
//
// The Host supplies raw durable document storage ONLY (get/put with
// compare-and-swap revision). ALL journal semantics — effect identity,
// re-begin compatibility, idempotent completion, conflict-fail-closed and the
// canonical-JSON gate — are owned by this Kernel Package code (ported from
// v0.7 effect-journal.ts above). The stored document is an envelope
// { kernelModuleSha256, record }; the inner record stays exactly the v0.7
// shape for golden comparison. A record pinned to a different kernel module
// SHA fails with typed code unavailability (KPK-09: no silent cross-version
// replay).
// ===========================================================================

function journalDocKey(effectId) {
  return `kpk01:effect-journal:${effectId}`;
}

export class KernelDurableEffectJournal {
  #docs;
  #moduleSha256;
  #counters;

  constructor(docs, moduleSha256, counters) {
    this.#docs = docs;
    this.#moduleSha256 = moduleSha256;
    this.#counters = counters;
  }

  async #readEnvelope(effectId) {
    const doc = await this.#docs.get(journalDocKey(effectId));
    return doc === null ? null : doc.value;
  }

  async getEffect(effectId) {
    const envelope = await this.#readEnvelope(effectId);
    return envelope === null ? null : envelope.record;
  }

  async beginEffect(record) {
    validateRecord(record);
    if (record.status !== 'started') {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        'beginEffect requires a started record',
      );
    }
    const existing = await this.#readEnvelope(record.effectId);
    if (existing !== null) {
      if (existing.kernelModuleSha256 !== this.#moduleSha256) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} is pinned to kernel module ${existing.kernelModuleSha256} which is unavailable under the loaded kernel module ${this.#moduleSha256}; typed code unavailability — no silent cross-version replay`,
        );
      }
      if (!sameIdentity(existing.record, record)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} already exists with an incompatible identity`,
        );
      }
      return { disposition: 'existing', record: existing.record };
    }
    if (this.#counters !== undefined) this.#counters.journalBegins += 1;
    await this.#docs.put(journalDocKey(record.effectId), {
      kernelModuleSha256: this.#moduleSha256,
      record,
    }, { mustBeAbsent: true });
    return { disposition: 'created', record };
  }

  async completeEffect(effectId, outcome) {
    requireNonEmpty(effectId, 'effectId');
    try {
      canonicalJsonStringify(
        outcome.status === 'completed' ? { output: outcome.output } : { error: outcome.error },
      );
    } catch (error) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} outcome must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const envelope = await this.#readEnvelope(effectId);
    if (envelope === null) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `cannot complete effect ${effectId} that was never begun`,
      );
    }
    if (envelope.kernelModuleSha256 !== this.#moduleSha256) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} is pinned to kernel module ${envelope.kernelModuleSha256} which is unavailable under the loaded kernel module ${this.#moduleSha256}; typed code unavailability — no silent cross-version replay`,
      );
    }
    const existing = envelope.record;
    const completed = outcome.status === 'completed'
      ? { ...existing, status: 'completed', output: outcome.output, completedAt: outcome.completedAt }
      : { ...existing, status: 'failed', error: outcome.error, completedAt: outcome.completedAt };
    if (existing.status !== 'started') {
      if (outcomeKey(existing) !== outcomeKey(completed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} is already settled with a conflicting outcome`,
        );
      }
      return existing;
    }
    if (this.#counters !== undefined) this.#counters.journalCompletes += 1;
    await this.#docs.put(journalDocKey(effectId), {
      kernelModuleSha256: this.#moduleSha256,
      record: completed,
    }, { mustMatchRevision: envelope.revision });
    return completed;
  }

  async getRecords() {
    const keys = await this.#docs.list('kpk01:effect-journal:');
    const envelopes = await Promise.all(keys.map((key) => this.#docs.get(key)));
    return envelopes
      .filter((doc) => doc !== null)
      .map((doc) => doc.value.record)
      .sort((left, right) =>
        left.effectId < right.effectId ? -1 : left.effectId > right.effectId ? 1 : 0);
  }
}

// ===========================================================================
// v0.7 migrated: engine/per-instance-serialized-lane.ts (verbatim)
// Source: packages/domain-harness/src/engine/per-instance-serialized-lane.ts
// ===========================================================================

function workflowAddressKey(address) {
  return JSON.stringify([address.workflowId, address.instanceKey]);
}

/**
 * Portable keyed scheduler: work for the same WorkflowAddress is chained, while
 * distinct addresses have independent promise tails and can progress concurrently.
 */
export class PerInstanceSerializedLane {
  #tails = new Map();

  run(address, operation) {
    const key = workflowAddressKey(address);
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );

    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) {
        this.#tails.delete(key);
      }
    });

    return result;
  }
}

// ===========================================================================
// v0.7 migrated: instance/persistent-workflow-instance.ts +
// engine/workflow-instance-engine.ts
// [KPK-01 adaptation] the v0.7 RuntimeStore port is replaced by the generic
// Host document-store port (get/put CAS/list). The instance snapshot
// discipline — stateRevision sequencing, identity assertions on committed
// reads, one-writer serialized lane — stays entirely in this Kernel Package
// code, verbatim from v0.7. The Host never learns workflow semantics.
// ===========================================================================

function instanceDocKey(address) {
  return `kpk01:wf-instance:${address.workflowId}:${address.instanceKey}`;
}

export class WorkflowInstanceNotFoundError extends Error {
  constructor(address) {
    super(`Workflow instance not found: ${address.workflowId}/${address.instanceKey}`);
    this.name = 'WorkflowInstanceNotFoundError';
    this.address = address;
  }
}

function workflowAddressesEqual(left, right) {
  return left.workflowId === right.workflowId && left.instanceKey === right.instanceKey;
}

export class PersistentWorkflowInstanceRepository {
  #docs;
  #now;

  constructor(docs, now = () => new Date().toISOString()) {
    this.#docs = docs;
    this.#now = now;
  }

  async create(request) {
    const timestamp = this.#now();
    const snapshot = {
      address: { ...request.address },
      correlationId: request.correlationId,
      packageId: request.packageId,
      lifecycle: request.lifecycle ?? 'active',
      stateRevision: 0,
      state: request.initialState,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await this.#docs.put(instanceDocKey(request.address), snapshot, { mustBeAbsent: true });
    return this.require(request.address);
  }

  async resolve(address) {
    const doc = await this.#docs.get(instanceDocKey(address));
    return doc === null ? null : doc.value;
  }

  async require(address) {
    const snapshot = await this.resolve(address);
    if (snapshot === null) {
      throw new WorkflowInstanceNotFoundError(address);
    }
    return snapshot;
  }
}

export class WorkflowInstanceEngine {
  #instances;
  #docs;
  #lane;
  #now;
  #counters;

  constructor(docs, options = {}) {
    this.#docs = docs;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#lane = options.lane ?? new PerInstanceSerializedLane();
    this.#instances = new PersistentWorkflowInstanceRepository(docs, this.#now);
    this.#counters = options.counters;
  }

  get lane() {
    return this.#lane;
  }

  createInstance(request) {
    if (this.#counters !== undefined) this.#counters.instanceCreates += 1;
    return this.#instances.create(request);
  }

  getInstance(target) {
    if (this.#counters !== undefined) this.#counters.instanceReads += 1;
    return this.#instances.resolve(target);
  }

  /**
   * v0.7 processAcceptedTransition over the generic Host doc port: the commit
   * is a compare-and-swap document write whose expected revision IS the v0.7
   * expectedTargetSequence (single-writer discipline is upheld by the lane).
   */
  processAcceptedTransition(request) {
    return this.#lane.run(request.target, () => this.commitAcceptedTransitionInLane(request));
  }

  /**
   * [KPK-01 adaptation] Same v0.7 commit body, for a caller that ALREADY
   * holds this instance's serialized lane (the kernel occurrence runtime
   * serializes its whole admission+commit occurrence on the same lane, like
   * the v0.7 control-turn publication did around its engine).
   */
  async commitAcceptedTransitionInLane(request) {
    const current = await this.#instances.require(request.target);
    const transition = await request.transition(current);
    const updatedAt = this.#now();
    if (this.#counters !== undefined) this.#counters.engineCommits += 1;

    await this.#docs.put(instanceDocKey(request.target), {
      address: current.address,
      correlationId: current.correlationId,
      packageId: current.packageId,
      lifecycle: transition.nextLifecycle ?? current.lifecycle,
      stateRevision: current.stateRevision + 1,
      state: transition.nextState,
      ...(transition.output === undefined ? {} : { output: transition.output }),
      ...(current.output === undefined || transition.output !== undefined ? {} : { output: current.output }),
      lastMessageId: request.messageId,
      createdAt: current.createdAt,
      updatedAt,
    }, { mustMatchRevision: current.stateRevision });

    const committed = await this.#instances.require(request.target);
    if (!workflowAddressesEqual(committed.address, current.address)) {
      throw new Error('RuntimeStore changed WorkflowAddress while committing an instance transition');
    }
    if (committed.packageId !== current.packageId || committed.correlationId !== current.correlationId) {
      throw new Error('RuntimeStore changed persistent Workflow Instance identity while committing a transition');
    }
    if (committed.stateRevision !== current.stateRevision + 1) {
      throw new Error(
        `RuntimeStore committed invalid stateRevision ${committed.stateRevision}; expected ${current.stateRevision + 1}`,
      );
    }

    return committed;
  }
}

// ===========================================================================
// [KPK-01 experiment, kernel-owned] Governance pin store over the Host doc
// port. Mirrors the T-014 semantics consumed by v0.7 admission: EVERY
// authoritative admission re-requires the exact durable pin; a missing pin
// fails typed. The pin binds the instance to the exact baseline identity AND
// the exact loaded kernel module bytes (digest), so a replaced Kernel Package
// can never silently ride an occurrence pinned to its predecessor.
// ===========================================================================

export class GovernanceExecutionBindingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GovernanceExecutionBindingError';
    this.code = code;
  }
}

function pinDocKey(workflowInstanceId) {
  return `kpk01:governance-pin:${workflowInstanceId}`;
}

export class KernelGovernancePinStore {
  #docs;
  #sha256;
  #moduleSha256;

  constructor(docs, sha256, moduleSha256) {
    this.#docs = docs;
    this.#sha256 = sha256;
    this.#moduleSha256 = moduleSha256;
  }

  async bindPin({ workflowInstanceId, governanceBaseline }) {
    assertGovernanceBaselineIdentity(governanceBaseline);
    const bindingDigest = await computeCanonicalJsonDigest(
      {
        workflowInstanceId,
        governanceBaseline: governanceBaselineKey(governanceBaseline),
        kernelModuleSha256: this.#moduleSha256,
      },
      this.#sha256,
    );
    const pin = { workflowInstanceId, governanceBaseline, bindingDigest, kernelModuleSha256: this.#moduleSha256 };
    const existing = await this.#docs.get(pinDocKey(workflowInstanceId));
    if (existing !== null) {
      if (canonicalJsonStringify(existing.value) !== canonicalJsonStringify(pin)) {
        throw new GovernanceExecutionBindingError(
          'GOVERNANCE_EXECUTION_PIN_CONFLICT',
          `workflow instance ${workflowInstanceId} is already bound to different execution authority`,
        );
      }
      return pin;
    }
    await this.#docs.put(pinDocKey(workflowInstanceId), pin, { mustBeAbsent: true });
    return this.requirePinnedExecution(workflowInstanceId);
  }

  async requirePinnedExecution(workflowInstanceId) {
    const doc = await this.#docs.get(pinDocKey(workflowInstanceId));
    if (doc === null) {
      throw new GovernanceExecutionBindingError(
        'GOVERNANCE_EXECUTION_PIN_MISSING',
        `workflow instance ${workflowInstanceId} has no durable GovernanceExecutionPin`,
      );
    }
    const pin = doc.value;
    if (pin.kernelModuleSha256 !== this.#moduleSha256) {
      throw new GovernanceExecutionBindingError(
        'GOVERNANCE_EXECUTION_PIN_CONFLICT',
        `workflow instance ${workflowInstanceId} is pinned to kernel module ${pin.kernelModuleSha256} which is unavailable under the loaded kernel module ${this.#moduleSha256}; typed code unavailability — no silent cross-version replay`,
      );
    }
    return pin;
  }
}

/** Kernel-owned baseline body registry over the Host doc port (immutable per digest key). */
export class KernelBaselineStore {
  #docs;

  constructor(docs) {
    this.#docs = docs;
  }

  static docKey(identity) {
    return `kpk01:baseline:${governanceBaselineKey(identity)}`;
  }

  async putBody(body) {
    const key = KernelBaselineStore.docKey(body.identity);
    const existing = await this.#docs.get(key);
    if (existing !== null) {
      if (canonicalJsonStringify(existing.value) !== canonicalJsonStringify(body)) {
        throw new GovernanceContractError(
          'GOVERNANCE_BODY_CONFLICT',
          'logical store rejected mutation under an existing Governance Baseline digest',
        );
      }
      return;
    }
    await this.#docs.put(key, body, { mustBeAbsent: true });
  }

  async getBody(identity) {
    const doc = await this.#docs.get(KernelBaselineStore.docKey(identity));
    return doc === null ? undefined : doc.value;
  }
}

// ===========================================================================
// [KPK-01 experiment, kernel-owned] Occurrence runtime endpoint — the kernel
// composition that the Microkernel wires from the sealed package endpoints.
// The kernel decides WHEN/WHETHER admission, effects, journal commits and
// state commits happen; the SDK endpoint interprets Rules; the Business
// endpoint supplies domain policy (workflow definitions, guards, effect
// handlers); the Host supplies raw storage/crypto/clock/resources.
// ===========================================================================

function stateKindIsTerminal(definition, stateKey) {
  const state = definition.states.find((candidate) => candidate.stateKey === stateKey);
  return state?.kind === 'final' || state?.kind === 'failure';
}

export function createOccurrenceRuntime(options) {
  const {
    moduleIdentity,
    hostPorts,
    sdkEndpoint,
    businessEndpoint,
    observe,
  } = options;

  if (typeof hostPorts?.docs?.get !== 'function' || typeof hostPorts?.docs?.put !== 'function') {
    throw new CentralAdmissionError('ADMISSION_EVALUATION_INPUT_INVALID', 'kernel endpoint requires a Host document-store port');
  }
  if (typeof sdkEndpoint?.interpret !== 'function') {
    throw new CentralAdmissionError('ADMISSION_EVALUATION_INPUT_INVALID', 'kernel endpoint requires an SDK rule-interpreter endpoint');
  }
  if (typeof businessEndpoint?.policyId !== 'string') {
    throw new CentralAdmissionError('ADMISSION_EVALUATION_INPUT_INVALID', 'kernel endpoint requires a Business policy endpoint');
  }

  const counters = {
    admissions: 0,
    guardEvaluations: 0,
    hardInvariantEvaluations: 0,
    journalBegins: 0,
    journalCompletes: 0,
    effectDispatches: 0,
    engineCommits: 0,
    instanceCreates: 0,
    instanceReads: 0,
  };

  const docs = hostPorts.docs;
  const sha256 = hostPorts.sha256;
  const clock = hostPorts.clock ?? (() => new Date().toISOString());

  const engine = new WorkflowInstanceEngine(docs, { now: clock, counters });
  const effectJournal = new KernelDurableEffectJournal(docs, moduleIdentity.moduleSha256, counters);
  const pinStore = new KernelGovernancePinStore(docs, sha256, moduleIdentity.moduleSha256);
  const baselines = new KernelBaselineStore(docs);

  // [Controller 090 repair] One-time wiring validation of every dynamic
  // effect-intent binding, at this trusted installation boundary: a
  // malformed/unauthorized/ambiguous declaration fails the load typed
  // BEFORE any instance can exist. The frozen snapshots registered here
  // are the only declaration source trusted at admission time.
  const effectBindings = wireAdmissionEffectBindings(businessEndpoint);

  async function bindGovernance(target) {
    const workflowInstanceId = `${target.workflowId}:${target.instanceKey}`;
    const identity = await computeGovernanceBaselineIdentity({
      domainId: businessEndpoint.domainId,
      governanceId: `governance:${businessEndpoint.policyId}`,
      schemaVersion: '1',
      semantics: businessEndpoint.governanceSemantics,
    }, sha256);
    const body = { identity, semantics: businessEndpoint.governanceSemantics };
    await baselines.putBody(body);
    await pinStore.bindPin({ workflowInstanceId, governanceBaseline: identity });
    return body;
  }

  const effectTools = {
    resolve(effectType) {
      const binding = businessEndpoint.effectBindings?.[effectType];
      if (binding === undefined) return undefined;
      return { effectType, effectSemantics: binding.semantics };
    },
    async execute(request) {
      counters.effectDispatches += 1;
      const binding = businessEndpoint.effectBindings[request.binding.effectType];
      return binding.handler({
        input: request.input,
        effectId: request.effectId,
        durableControlTurnId: request.durableControlTurnId,
        operationOrdinal: request.operationOrdinal,
        idempotencyKey: request.idempotencyKey,
        logicalTime: request.logicalTime,
        target: request.target,
        resources: hostPorts.resources,
      });
    },
  };

  async function openInstance(request) {
    const target = request.target;
    const snapshot = await engine.createInstance({
      address: target,
      correlationId: request.correlationId ?? `corr:${target.instanceKey}`,
      packageId: businessEndpoint.packageId,
      initialState: {
        stateKey: businessEndpoint.initialStateKey,
        context: { ...businessEndpoint.initialContext, ...(request.initialContext ?? {}) },
      },
    });
    await bindGovernance(target);
    return snapshot;
  }

  async function submitOccurrence(request) {
    counters.admissions += 1;
    const target = request.target;
    const binding = businessEndpoint.intentBindings[request.intentType];
    if (binding === undefined) {
      throw new CentralAdmissionError(
        'ADMISSION_EVALUATION_INPUT_INVALID',
        `intent type ${request.intentType} has no binding in business policy ${businessEndpoint.policyId}`,
      );
    }

    // Business-owned domain authorization (caller roles). The kernel routes
    // this gate; the Business package owns the policy. No admission, journal
    // or resource activity happens before it passes.
    const caller = request.caller ?? { role: 'anonymous' };
    if (Array.isArray(binding.roles) && !binding.roles.includes(caller.role)) {
      const denial = {
        reason: 'business-caller-role',
        deniedBy: businessEndpoint.packageId,
        intentType: request.intentType,
        callerRole: caller.role,
      };
      const receipt = {
        status: 'denied',
        denial,
        occurrence: { messageId: request.messageId, workflowInstanceId: `${target.workflowId}:${target.instanceKey}` },
        attribution: attribution(),
      };
      observe?.(receipt);
      return receipt;
    }

    return engine.lane.run(target, async () => {
      const workflowInstanceId = `${target.workflowId}:${target.instanceKey}`;
      const snapshot = await engine.getInstance(target);
      if (snapshot === null) {
        throw new WorkflowInstanceNotFoundError(target);
      }
      const context = {
        ...snapshot.state.context,
        callerRole: caller.role,
      };
      const rule = businessEndpoint.rules[binding.ruleId];
      const resolved = sdkEndpoint.interpret(rule, request.input, context);

      const definition = binding.definition ?? businessEndpoint.workflowDefinition;
      const request_shape = {
        target,
        turn: { kind: 'message', sourceMessageId: request.messageId },
        trigger: binding.trigger,
        workflowInstanceId,
        definition,
        currentStateKey: snapshot.state.stateKey,
        context,
        event: resolved.structuredDecision.event,
        resolved,
        decisionSchema: businessEndpoint.decisionSchema,
        now: clock(),
      };

      const outcome = await admitCentralDecision(request_shape, {
        governance: pinStore,
        baselines,
        sha256,
        effectJournal,
        effectTools,
        effectBindings,
        trace: counters,
      });

      if (outcome.status === 'denied') {
        const receipt = {
          status: 'denied',
          denial: outcome.denial,
          occurrence: { messageId: request.messageId, workflowInstanceId },
          attribution: attribution(),
        };
        observe?.(receipt);
        return receipt;
      }

      const nextLifecycle = stateKindIsTerminal(definition, outcome.admitted.targetState)
        ? 'completed'
        : 'active';
      const committed = await engine.commitAcceptedTransitionInLane({
        target,
        messageId: request.messageId,
        expectedTargetSequence: snapshot.stateRevision,
        transition: (current) => ({
          nextState: {
            stateKey: outcome.admitted.targetState,
            context: current.state.context,
          },
          nextLifecycle,
          output: {
            transitionKey: outcome.admitted.transitionKey,
            effects: outcome.admitted.effects,
          },
        }),
      });

      const receipt = {
        status: 'admitted',
        admitted: outcome.admitted,
        instance: committed,
        occurrence: { messageId: request.messageId, workflowInstanceId },
        attribution: attribution(),
      };
      observe?.(receipt);
      return receipt;
    });
  }

  function attribution() {
    return {
      kernel: {
        packageId: moduleIdentity.packageId,
        moduleSha256: moduleIdentity.moduleSha256,
        generation: KERNEL_GENERATION,
      },
      business: { packageId: businessEndpoint.packageId, policyId: businessEndpoint.policyId },
      sdk: { packageId: sdkEndpoint.packageId ?? 'standard-sdk' },
    };
  }

  async function getSnapshot(target) {
    counters.instanceReads += 1;
    return engine.getInstance(target);
  }

  function getMechanismIdentity() {
    return {
      moduleId: MODULE_ID,
      abiVersion: ABI_VERSION,
      kernelGeneration: KERNEL_GENERATION,
      moduleSha256: moduleIdentity.moduleSha256,
      mechanismFunctions: {
        admitCentralDecision: admitCentralDecision.toString(),
        executeEffectIntents: executeEffectIntents.toString(),
        resolveAdmissionEffectIntents: resolveAdmissionEffectIntents.toString(),
        wireAdmissionEffectBindings: wireAdmissionEffectBindings.toString(),
        VolatileAdmissionEffectJournal: VolatileAdmissionEffectJournal.toString(),
        WorkflowInstanceEngine: WorkflowInstanceEngine.toString(),
        deriveDurableControlTurnId: deriveDurableControlTurnId.toString(),
      },
    };
  }

  return {
    moduleId: MODULE_ID,
    moduleSha256: moduleIdentity.moduleSha256,
    kernelGeneration: KERNEL_GENERATION,
    counters,
    openInstance,
    submitOccurrence,
    getSnapshot,
    getJournalRecords: () => effectJournal.getRecords(),
    getMechanismIdentity,
    businessPackageId: businessEndpoint.packageId,
  };
}
