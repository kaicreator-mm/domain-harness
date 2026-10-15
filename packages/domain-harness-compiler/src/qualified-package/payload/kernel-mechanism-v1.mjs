/**
 * ============================================================================
 * Kernel Domain Package — v08-kernel-mechanism@1.0.0 mechanism module (T-C)
 * ============================================================================
 *
 * PHYSICAL selected Kernel Domain Package payload for v0.8 (Issue #1002).
 * This file IS the sealed executable module bytes of a `kernel`-kind package
 * under the frozen v0.8 qualified-package ABI (T-A, #1000 @a835cab):
 * `V8_QUALIFIED_ABI['v08-kernel-abi/1']` — required exports
 * `createOccurrenceRuntime` / `MODULE_ID` / `PACKAGE_KIND` / `ABI_VERSION` /
 * `ENDPOINTS` with the `occurrence-runtime` endpoint kind. Role→kind /
 * endpoint-existence / intent-advertiser binding integrity is enforced at
 * BUILD qualification and re-checked at load BEFORE import (P1-BIND-02);
 * this module CONSUMES the sealed bindings as authoritative and keeps NO
 * duplicate binding-validation copy.
 *
 * SELECTED-SOURCE REUSE (exact SHA, no recoding):
 *   - Primary reuse base: #994@b9ea4d1f42246c61d5382328788c50741cac8e43
 *     `experiments/v08-package-kernel-ownership-kpk01/src/producer/payload/kernel-mechanism-v1.mjs`
 *     (whose sections are the verbatim-logic migrations of the frozen v0.7
 *     sources pinned below, proven by KPK-14 side-by-side differential).
 *   - v0.7 blob pins (MIGRATION_MAP.json @ #994@b9ea4d1, all pinned at
 *     version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521):
 *     workflow/predicate.ts e680f125…, admission/admission.ts 955ecf1f…,
 *     admission/effect-journal.ts c6ae1f98…, engine/per-instance-serialized-lane.ts
 *     d5a94501…, instance/persistent-workflow-instance.ts 3e225296…,
 *     engine/workflow-instance-engine.ts 10829999… (plus the non-authoritative
 *     canonical-identity / contracts / governance-subset blobs listed in
 *     MIGRATION_MAP.json). Same-project provenance; no third-party license.
 * Adaptations remain strictly mechanical and individually marked; every
 * authoritative decision path keeps the v0.7 logic and error text verbatim.
 *
 * T-C REPAIRS carried by these bytes (both test-first, RED→GREEN evidence in
 * PR #1002-bound branch `work/v08-tc-kernel-package-cas-v1`):
 *   1. P1-L2-CAS-01 (#999/#1002): `#readEnvelope` preserved `{value,revision}`
 *      (the #994 source returned `doc.value` and dropped `doc.revision`, so
 *      `completeEffect` wrote `mustMatchRevision: undefined` — the Host
 *      treated the undefined CAS guard as an UNCONDITIONAL write and two
 *      competing trusted same-effect terminal completions could overwrite
 *      each other). Terminal effect completion is now a strongly conditional
 *      CAS write; a lost race re-reads the authoritative record and either
 *      returns the SAME authoritative terminal outcome (identical outcome
 *      key) or fails typed (`ADMISSION_EFFECT_JOURNAL_CONFLICT`) — status is
 *      never overwritten by a concurrent terminal, and there is no
 *      unconditional fall-through anywhere on the terminal path.
 *   2. #966 (post-release P2, fixed while porting the effect journal):
 *      VolatileAdmissionEffectJournal and the kernel durable adapter isolate
 *      caller input/return aliases — stored and returned records are
 *      canonical-JSON snapshots, so mutation of caller-held objects can
 *      never contaminate the committed journal state (test-covered).
 *
 * HONEST BOUNDARY (Issue #1002): cross-document atomicity, hostile
 * privileged-store MAC and multi-process proofs are NOT claimed here (T-E
 * owns the real atomic Host primitive, T-G owns multi-process proof). The
 * Host document port consumed below is: get(key) → {value,revision} | null,
 * put(key, value, {mustBeAbsent}|{mustMatchRevision}) → {revision} | typed
 * rejection with `code === 'HOST_CAS_CONFLICT'`, list(prefix) → string[].
 * Doc revisions start at 0 on the creating (mustBeAbsent) write — the
 * instance engine treats snapshot.stateRevision and the Host doc revision as
 * the same counter (the #994 convention, contract-noted for T-E).
 *
 * Kernel ABI (v08-kernel-abi/1) — exported endpoint factory:
 *   createOccurrenceRuntime({ moduleIdentity, hostPorts, sdkEndpoint,
 *   businessEndpoint, observe }) → { openInstance, submitOccurrence,
 *   getSnapshot, getJournalRecords, getMechanismIdentity, counters }
 */

export const MODULE_ID = 'v08-kernel-mechanism@1.0.0';
export const PACKAGE_KIND = 'kernel';
export const ABI_VERSION = 'v08-kernel-abi/1';
export const KERNEL_GENERATION = '1';
export const ENDPOINTS = [
  { endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' },
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

const NON_MESSAGE_TURN_SOURCE_FIELDS = {
  timer: ['timerId', 'fireOrdinal'],
  callback: ['externalCorrelationId', 'callbackOrdinal'],
  'child-terminal': ['parentActorId', 'childActorId', 'invocationOrdinal', 'terminalKind'],
};

/**
 * [#1062 shared durable-control seam] Strict validation of a NON-message turn
 * source supplied by the trusted Host seam (`request.turnSource`). The public
 * send path constructs no turnSource; message turns keep deriving from
 * messageId. The exact field set is enforced (no extra/missing fields) and
 * every component value is validated by the SAME single authority that derives
 * the turn id (`deriveDurableControlTurnId` runs on a probe target), so a
 * turnSource accepted here is byte-deterministically replayable and can never
 * smuggle foreign material into the turn identity.
 */
export function strictTurnSource(source) {
  if (!isJsonRecord(source)) {
    throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', 'turnSource must be a JSON record');
  }
  const kind = source.kind;
  if (kind === 'message' || kind === 'recovery') {
    throw new CentralAdmissionError(
      'ADMISSION_INVALID_TURN_SOURCE',
      `a turnSource of kind ${String(kind)} is not accepted at this seam: message turns derive from messageId and no recovery source is wired`,
    );
  }
  const fields = NON_MESSAGE_TURN_SOURCE_FIELDS[kind];
  if (fields === undefined) {
    throw new CentralAdmissionError('ADMISSION_INVALID_TURN_SOURCE', `unknown turn source kind ${JSON.stringify(kind)}`);
  }
  for (const key of Object.keys(source)) {
    if (key !== 'kind' && !fields.includes(key)) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_TURN_SOURCE',
        `turn source ${String(kind)} carries the unsupported field ${key}`,
      );
    }
  }
  for (const field of fields) {
    if (!hasOwn(source, field)) {
      throw new CentralAdmissionError(
        'ADMISSION_INVALID_TURN_SOURCE',
        `turn source ${String(kind)} is missing the required field ${field}`,
      );
    }
  }
  // Single validation authority: deriveDurableControlTurnId itself validates
  // every component (non-empty strings, positive safe integers, done|error).
  deriveDurableControlTurnId({ workflowId: 'shape-probe', instanceKey: 'shape-probe' }, source);
  return snapshotJson(source);
}

/**
 * The turn source of ONE occurrence request: the trusted-seam turnSource when
 * the Host supplies one (timer/callback/child-terminal durable control
 * delivery), else the plain message source derived from the messageId. Every
 * in-payload turn-id derivation site funnels through here — there is exactly
 * one way a turn identity is constructed.
 */
function occurrenceTurnOf(request) {
  return request.turnSource === undefined
    ? { kind: 'message', sourceMessageId: request.messageId }
    : strictTurnSource(request.turnSource);
}

/**
 * §21 handoff: resolver telemetry/LLM-avoidance evidence for the turn receipt.
 * [#1003 FR07-KH2, review B2] The legacy numeric `freshModelCallCount` is no
 * longer read: only the structured trusted `modelCallEvidence` (normalized by
 * admissionModelCallEvidence) and, for a K continuation, the K-built
 * continuation evidence (turns, queries, K-attested dependencies) are carried.
 */
export function admissionResolverEvidence(resolved) {
  return {
    source: resolved.source,
    llmAvoided: resolved.llmAvoided,
    modelCallEvidence: admissionModelCallEvidence(resolved.modelCallEvidence),
    cacheRead: resolved.cacheDisposition.read,
    ...(resolved.cacheDisposition.write === undefined
      ? {}
      : { cacheWrite: resolved.cacheDisposition.write }),
    telemetryEventCount: resolved.telemetry.length,
    ...(resolved.continuation === undefined
      ? {}
      : { continuation: JSON.parse(canonicalJsonStringify(resolved.continuation)) }),
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
      ...(extras.contextField === undefined ? {} : { contextField: extras.contextField }),
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

  // [#1005 D3-K] Declarative state-context projection: resolved after
  // authorized admission and before any journal write or effect dispatch;
  // committed by the caller's state CAS together with the target state.
  const context = resolveAdmissionContextProjection(selection.admitted, request, ports.contextProjections);
  if (context?.conflict !== undefined) {
    return deny('context-projection-conflict', turnId, pinned.bindingDigest, resolver, {
      transitionKey: selection.admitted.transitionKey,
      contextField: context.conflict.field,
    });
  }

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
      ...(context === undefined ? {} : { contextProjection: context.projection }),
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

// Controller 093: reject hostile JSON-declared own destination keys at Kernel
// wiring before any effect-input assignment / journal / resource dispatch.
const EFFECT_DESTINATION_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const EFFECT_DESTINATION_FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
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
    if (!EFFECT_DESTINATION_NAME.test(field) || EFFECT_DESTINATION_FORBIDDEN.has(field)) {
      invalidEffectBinding(`inputFrom destination field ${JSON.stringify(field)} must be a safe 1..64-character ASCII identifier, excluding prototype-sensitive names`);
    }
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

const BINDING_VALUE_MISSING = Symbol('v08-kernel.effect-binding.missing');

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
// [#1005 D3-K — kernel-owned NEW mechanism code, NOT a v0.7 migration]
// Declarative state-context projection (durable cross-stage lineage).
//
// Accepted minimal design: #1005@6130149429 (unlocked #1005@6151644929).
// Before this, a committed transition rewrote `context: current.state.context`
// unchanged, so no accepted stage could durably carry evidence (changeId,
// reviewedSha, validationId, testedSha …) to the next stage, and a guard could
// only compare an event with itself. A Business transition may now declare
//
//   contextProjection: { <contextField>: { source: 'event'|'decision',
//                                          path, type? } }
//
// with exactly the effect-binding path discipline (event ['payload', key] /
// decision ['data', key] inside THIS intent's rule-authorized projection, or
// ['type'] / ['outcome']). All rules are enforced HERE:
//   - validated ONCE at wiring and deep-frozen into a WeakMap keyed by the
//     exact transition object; live mutation is ignored and projection syntax
//     on an unwired transition refuses typed;
//   - resolved inside admitCentralDecision AFTER schema / hard-invariant /
//     guard admission and BEFORE any Journal write or Effect dispatch; a
//     missing or mistyped value fails typed with zero Journal/Effect;
//   - write-once lineage: a field already present in the committed context
//     may only be re-projected with the identical value, otherwise the
//     transition is denied ('context-projection-conflict') pre-effect;
//   - committed into the next state context by the SAME state CAS write that
//     moves the state (commitAcceptedTransitionInLane) — no second write, so a
//     crash/UNKNOWN before the CAS commits neither state nor lineage, and a
//     replay re-resolves the identical projection from the identical event.
// `callerRole` (K-injected predicate context) is never a projection target.
// ===========================================================================

const CONTEXT_PROJECTION_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const CONTEXT_PROJECTION_RESERVED = new Set(['callerRole']);

function invalidContextProjection(message) {
  throw new CentralAdmissionError('ADMISSION_CONTEXT_PROJECTION_INVALID', message);
}

function contextValueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function snapshotContextProjection(transition, rule, intentType) {
  const declared = transition.contextProjection;
  const label = `intent ${intentType}, transition ${String(transition.transitionKey)}`;
  if (!isPlainObject(declared) || Object.keys(declared).length === 0) {
    invalidContextProjection(`${label}: contextProjection must be a non-empty object of field projections`);
  }
  const projection = rule?.payloadFromInput;
  if (!isPlainObject(projection)) {
    invalidContextProjection(`${label}: rule ${String(rule?.ruleId)} must declare payloadFromInput to authorize a context projection`);
  }
  const authorizedKeys = new Set(Object.keys(projection));
  const fields = {};
  for (const [field, spec] of Object.entries(declared)) {
    if (!EFFECT_DESTINATION_NAME.test(field) || EFFECT_DESTINATION_FORBIDDEN.has(field) || CONTEXT_PROJECTION_RESERVED.has(field)) {
      invalidContextProjection(`${label}: context field ${JSON.stringify(field)} must be a safe 1..64-character identifier and not a reserved Kernel context key`);
    }
    if (!isPlainObject(spec) || Object.keys(spec).some((key) => key !== 'source' && key !== 'path' && key !== 'type')) {
      invalidContextProjection(`${label}: contextProjection.${field} may only declare source, path and type`);
    }
    if (spec.source !== 'event' && spec.source !== 'decision') {
      invalidContextProjection(`${label}: contextProjection.${field}.source must be 'event' or 'decision'`);
    }
    const path = spec.path;
    if (!Array.isArray(path) || path.length === 0 || path.length > 2 || path.some((segment) => typeof segment !== 'string' || segment.length === 0)) {
      invalidContextProjection(`${label}: contextProjection.${field}.path must be one or two non-empty string segments`);
    }
    const allowed = spec.source === 'event'
      ? (path.length === 1 && path[0] === 'type') || (path.length === 2 && path[0] === 'payload' && authorizedKeys.has(path[1]))
      : (path.length === 1 && path[0] === 'outcome') || (path.length === 2 && path[0] === 'data' && authorizedKeys.has(path[1]));
    if (!allowed) {
      invalidContextProjection(`${label}: contextProjection.${field} ${spec.source} path [${path.join(', ')}] is outside the rule-authorized projection`);
    }
    if (spec.type !== undefined && !CONTEXT_PROJECTION_TYPES.has(spec.type)) {
      invalidContextProjection(`${label}: contextProjection.${field}.type ${String(spec.type)} is not a JSON type`);
    }
    fields[field] = { source: spec.source, path: [...path], ...(spec.type === undefined ? {} : { type: spec.type }) };
  }
  deepFreezePreparedData(fields);
  return fields;
}

/**
 * Wiring-time validation of every context projection reachable from the
 * Business policy (createOccurrenceRuntime only — the trusted load boundary).
 */
function wireAdmissionContextProjections(businessEndpoint) {
  const registry = new WeakMap();
  for (const [intentType, binding] of Object.entries(businessEndpoint.intentBindings ?? {})) {
    const rule = (businessEndpoint.rules ?? {})[binding.ruleId];
    const definition = binding.definition ?? businessEndpoint.workflowDefinition;
    for (const state of definition?.states ?? []) {
      for (const transition of state.transitions ?? []) {
        if (!hasOwn(transition, 'contextProjection')) continue;
        const snapshot = snapshotContextProjection(transition, rule, intentType);
        const existing = registry.get(transition);
        if (existing !== undefined) {
          if (canonicalJsonStringify(existing) !== canonicalJsonStringify(snapshot)) {
            invalidContextProjection(`intent ${intentType}: the same transition object is wired against conflicting rule authorizations`);
          }
        } else {
          registry.set(transition, snapshot);
        }
      }
    }
  }
  return registry;
}

/**
 * Resolve the admitted transition's context projection (admitCentralDecision
 * only: after admission, before any Journal/Effect). The wiring-time frozen
 * snapshot is the FIRST authority — a live `contextProjection` property
 * deleted after wiring keeps the pinned projection; only a never-wired
 * transition carrying live projection syntax refuses typed. Returns
 * `undefined` when nothing was wired or declared, `{conflict}` for a
 * write-once violation, or `{projection}` — the canonical fields to merge
 * into the next context.
 */
function resolveAdmissionContextProjection(transition, request, wiring) {
  // [#1005 D3-K R2 — review #5508191410 P1] The wiring snapshot outranks the
  // live property: checking the live declaration first let a post-wiring
  // `delete transition.contextProjection` bypass the frozen projection.
  const fields = wiring?.get(transition);
  if (fields === undefined) {
    if (!hasOwn(transition, 'contextProjection')) return undefined;
    throw new CentralAdmissionError(
      'ADMISSION_CONTEXT_PROJECTION_UNVALIDATED',
      `transition ${String(transition.transitionKey)} carries context-projection syntax that was never validated at wiring; post-wiring injected declarations are refused`,
    );
  }
  const decision = request.resolved?.structuredDecision?.decision;
  const committed = request.context ?? {};
  const projection = {};
  for (const [field, spec] of Object.entries(fields)) {
    const root = spec.source === 'event' ? request.event : decision;
    const value = root === undefined || root === null ? BINDING_VALUE_MISSING : readBindingPath(root, spec.path);
    if (value === BINDING_VALUE_MISSING) {
      throw new CentralAdmissionError(
        'ADMISSION_CONTEXT_PROJECTION_UNRESOLVED',
        `context field ${field} (${spec.source} path ${spec.path.join('.')}) is not present on this occurrence; nothing is journaled or committed`,
      );
    }
    let canonical;
    try {
      canonical = canonicalizeJson(value);
    } catch (error) {
      throw new CentralAdmissionError(
        'ADMISSION_CONTEXT_PROJECTION_UNRESOLVED',
        `context field ${field} must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (spec.type !== undefined && contextValueType(value) !== spec.type) {
      throw new CentralAdmissionError(
        'ADMISSION_CONTEXT_PROJECTION_UNRESOLVED',
        `context field ${field} must be of type ${spec.type}; nothing is journaled or committed`,
      );
    }
    if (hasOwn(committed, field) && canonicalJsonStringify(committed[field]) !== canonicalJsonStringify(canonical)) {
      return { conflict: { field } };
    }
    projection[field] = JSON.parse(JSON.stringify(canonical));
  }
  return { projection };
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

  // [T-C, #966] Input/return alias isolation: every stored record and every
  // returned record is a canonical deep snapshot, so caller-held objects can
  // never contaminate committed state and exposed results can never mutate
  // it (existing canonical utility — no alternate serializer).
  async getEffect(effectId) {
    const existing = this.#records.get(effectId);
    return existing === undefined ? null : snapshotJson(existing);
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
      return { disposition: 'existing', record: snapshotJson(existing) };
    }
    const stored = snapshotJson(record);
    this.#records.set(record.effectId, stored);
    return { disposition: 'created', record: snapshotJson(stored) };
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
    const completed = snapshotJson(outcome.status === 'completed'
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
        });
    if (existing.status !== 'started') {
      if (outcomeKey(existing) !== outcomeKey(completed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} is already settled with a conflicting outcome`,
        );
      }
      return snapshotJson(existing);
    }
    this.#records.set(effectId, completed);
    return snapshotJson(completed);
  }

  getRecords() {
    return [...this.#records.values()]
      .map((record) => snapshotJson(record))
      .sort((left, right) =>
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
  return `v08-kernel:effect-journal:${effectId}`;
}

/**
 * [T-C, P1-L2-CAS-01] Typed rejection contract of the Host document port:
 * a conditional write ({mustBeAbsent} | {mustMatchRevision}) that loses its
 * compare-and-swap race rejects with an error carrying
 * `code === 'HOST_CAS_CONFLICT'`. Any other rejection is a Host fault and is
 * rethrown untouched (never silently retried, never fallen through).
 */
function isHostCasConflict(error) {
  return typeof error === 'object' && error !== null && error.code === 'HOST_CAS_CONFLICT';
}

/** [T-C, #966] Canonical deep snapshot: isolated JSON data only (no aliasing). */
function snapshotJson(value) {
  return JSON.parse(canonicalJsonStringify(value));
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

  /**
   * [T-C, P1-L2-CAS-01] The Host read returns the FULL {value, revision}
   * pair. The #994 source returned `doc.value` and dropped `doc.revision`,
   * which made every subsequent terminal write pass
   * `mustMatchRevision: undefined` — an unconditional write under the Host
   * contract — so two competing trusted same-effect terminal completions
   * could BOTH land and overwrite each other. The revision is now preserved
   * end-to-end and every write below is a strongly conditional CAS.
   */
  async #readEnvelope(effectId) {
    const doc = await this.#docs.get(journalDocKey(effectId));
    return doc === null ? null : { value: doc.value, revision: doc.revision };
  }

  async getEffect(effectId) {
    const envelope = await this.#readEnvelope(effectId);
    return envelope === null ? null : snapshotJson(envelope.value.record);
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
      if (existing.value.kernelModuleSha256 !== this.#moduleSha256) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} is pinned to kernel module ${existing.value.kernelModuleSha256} which is unavailable under the loaded kernel module ${this.#moduleSha256}; typed code unavailability — no silent cross-version replay`,
        );
      }
      if (!sameIdentity(existing.value.record, record)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${record.effectId} already exists with an incompatible identity`,
        );
      }
      return { disposition: 'existing', record: snapshotJson(existing.value.record) };
    }
    if (this.#counters !== undefined) this.#counters.journalBegins += 1;
    try {
      await this.#docs.put(journalDocKey(record.effectId), {
        kernelModuleSha256: this.#moduleSha256,
        record: snapshotJson(record),
      }, { mustBeAbsent: true });
    } catch (error) {
      // [T-C] Lost the conditional create against a concurrent begin: re-read
      // the authoritative envelope and settle honestly — same identity ⇒
      // existing; anything else fails typed. Never fall through to a second
      // unconditional write.
      if (!isHostCasConflict(error)) throw error;
      const winner = await this.#readEnvelope(record.effectId);
      if (
        winner !== null
        && winner.value.kernelModuleSha256 === this.#moduleSha256
        && sameIdentity(winner.value.record, record)
      ) {
        return { disposition: 'existing', record: snapshotJson(winner.value.record) };
      }
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${record.effectId} begin lost its conditional create race against an incompatible record`,
      );
    }
    return { disposition: 'created', record: snapshotJson(record) };
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
    if (envelope.value.kernelModuleSha256 !== this.#moduleSha256) {
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} is pinned to kernel module ${envelope.value.kernelModuleSha256} which is unavailable under the loaded kernel module ${this.#moduleSha256}; typed code unavailability — no silent cross-version replay`,
      );
    }
    const existing = envelope.value.record;
    // [T-C, #966] The completed record is a fresh canonical snapshot; the
    // caller's outcome object never aliases committed state.
    const completed = snapshotJson(outcome.status === 'completed'
      ? { ...existing, status: 'completed', output: outcome.output, completedAt: outcome.completedAt }
      : { ...existing, status: 'failed', error: outcome.error, completedAt: outcome.completedAt });
    if (existing.status !== 'started') {
      if (outcomeKey(existing) !== outcomeKey(completed)) {
        throw new CentralAdmissionError(
          'ADMISSION_EFFECT_JOURNAL_CONFLICT',
          `effect ${effectId} is already settled with a conflicting outcome`,
        );
      }
      return snapshotJson(existing);
    }
    if (this.#counters !== undefined) this.#counters.journalCompletes += 1;
    try {
      // [T-C, P1-L2-CAS-01] STRONGLY CONDITIONAL terminal write: the CAS
      // expectation is the exact revision read above. A concurrent terminal
      // completion bumps the revision, so at most ONE of the competing
      // completions can land — the terminal status is never overwritten.
      await this.#docs.put(journalDocKey(effectId), {
        kernelModuleSha256: this.#moduleSha256,
        record: completed,
      }, { mustMatchRevision: envelope.revision });
    } catch (error) {
      if (!isHostCasConflict(error)) throw error;
      // Lost the terminal race. Re-read the authoritative record and settle
      // honestly: the SAME authoritative terminal outcome is returned
      // idempotently; a DIFFERENT outcome fails typed. There is NO
      // unconditional fall-through on the terminal path.
      const winner = await this.#readEnvelope(effectId);
      if (winner !== null && winner.value.kernelModuleSha256 === this.#moduleSha256) {
        const settled = winner.value.record;
        if (settled.status !== 'started') {
          if (outcomeKey(settled) !== outcomeKey(completed)) {
            throw new CentralAdmissionError(
              'ADMISSION_EFFECT_JOURNAL_CONFLICT',
              `effect ${effectId} is already settled with a conflicting outcome`,
            );
          }
          return snapshotJson(settled);
        }
      }
      throw new CentralAdmissionError(
        'ADMISSION_EFFECT_JOURNAL_CONFLICT',
        `effect ${effectId} terminal completion lost its conditional CAS race; the authoritative record must be re-read before any further terminal claim`,
      );
    }
    // [T-C, #966] The returned record is a snapshot DISTINCT from the stored
    // one: a caller mutating the result can never reach committed state.
    return snapshotJson(completed);
  }

  async getRecords() {
    const keys = await this.#docs.list('v08-kernel:effect-journal:');
    const envelopes = await Promise.all(keys.map((key) => this.#docs.get(key)));
    return envelopes
      .filter((doc) => doc !== null)
      .map((doc) => snapshotJson(doc.value.record))
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
// [#1063 HF20] ordered durable mutation observation — the Kernel-internal
// contract twin of `src/host-v8/hf20-mutation-observation.ts` (semantic
// twin only: the payload is self-contained sealed bytes and imports
// nothing). The observation window rides the SAME instance document the
// authoritative state CAS writes (create seeds INSTANCE_OPENED; every
// commitAcceptedTransitionInLane appends MUTATION_COMMITTED inside the same
// single-key CAS value), so a record can never exist without its committed
// stateRevision and vice versa — one physical row, one counter, one
// transaction. Ordering authority is `sequence` alone; eviction of the
// retained tail is the explicit RETENTION_TRUNCATED gap; cursors are
// stream-bound opaque tokens re-validated against the CURRENT window.
// ===========================================================================

const HF20_MUTATION_OBSERVATION_CONTRACT_VERSION = 'hf20-mutation-observation/1';
const HF20_MUTATION_OBSERVATION_RETENTION_LIMIT = 64;
const HF20_MUTATION_OBSERVATION_KINDS = ['INSTANCE_OPENED', 'MUTATION_COMMITTED'];

function isHf20SafeNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isHf20MutationObservationWindow(value) {
  if (!isJsonRecord(value)) return false;
  if (value.contractVersion !== HF20_MUTATION_OBSERVATION_CONTRACT_VERSION) return false;
  if (!isHf20SafeNonNegativeInteger(value.mutationSequence)) return false;
  if (!Array.isArray(value.records)) return false;
  if (value.records.length > HF20_MUTATION_OBSERVATION_RETENTION_LIMIT) return false;
  if (value.records.length > value.mutationSequence) return false;
  const expectedFirst = value.mutationSequence - value.records.length + 1;
  for (let index = 0; index < value.records.length; index += 1) {
    const record = value.records[index];
    if (!isJsonRecord(record)) return false;
    if (!('sequence' in record) || !('kind' in record) || !('stateRevisionAfter' in record) || !('committedAt' in record)) {
      return false;
    }
    if (!isHf20SafeNonNegativeInteger(record.sequence) || record.sequence !== expectedFirst + index) return false;
    if (typeof record.kind !== 'string' || !HF20_MUTATION_OBSERVATION_KINDS.includes(record.kind)) return false;
    if (!isHf20SafeNonNegativeInteger(record.stateRevisionAfter)) return false;
    if (record.stateRevisionBefore !== undefined && !isHf20SafeNonNegativeInteger(record.stateRevisionBefore)) return false;
    if (record.sourceMessageId !== undefined && (typeof record.sourceMessageId !== 'string' || record.sourceMessageId.length === 0)) return false;
    if (typeof record.committedAt !== 'string' || record.committedAt.length === 0) return false;
    if (record.kind === 'INSTANCE_OPENED' && record.stateRevisionAfter !== 0) return false;
    if (record.kind === 'MUTATION_COMMITTED' && record.stateRevisionBefore !== record.stateRevisionAfter - 1) return false;
  }
  return true;
}

function newHf20ObservationWindow() {
  return {
    contractVersion: HF20_MUTATION_OBSERVATION_CONTRACT_VERSION,
    mutationSequence: 0,
    records: [],
  };
}

/**
 * The PURE append reducer the commit path runs INSIDE its CAS write value.
 * There is deliberately no separate append entry point: an observation
 * record that did not ride the authoritative commit would be exactly the
 * best-effort second-document shape HF20 forbids.
 */
function appendHf20MutationObservation(window, intent, committedAt) {
  if (!isHf20MutationObservationWindow(window)) {
    throw new CentralAdmissionError(
      'WINDOW_INVALID',
      'the stored mutation-observation window is structurally invalid; the commit fails closed',
    );
  }
  if (!HF20_MUTATION_OBSERVATION_KINDS.includes(intent.kind)) {
    throw new CentralAdmissionError('WINDOW_INVALID', `unknown mutation observation kind ${String(intent.kind)}`);
  }
  if (!isHf20SafeNonNegativeInteger(intent.stateRevisionAfter)) {
    throw new CentralAdmissionError('WINDOW_INVALID', 'stateRevisionAfter must be a safe non-negative integer');
  }
  if (typeof committedAt !== 'string' || committedAt.length === 0) {
    throw new CentralAdmissionError('WINDOW_INVALID', 'committedAt must be a non-empty string');
  }
  const record = {
    sequence: window.mutationSequence + 1,
    kind: intent.kind,
    stateRevisionAfter: intent.stateRevisionAfter,
    ...(intent.stateRevisionBefore === undefined ? {} : { stateRevisionBefore: intent.stateRevisionBefore }),
    ...(intent.sourceMessageId === undefined ? {} : { sourceMessageId: intent.sourceMessageId }),
    committedAt,
  };
  if (record.kind === 'INSTANCE_OPENED' && record.stateRevisionAfter !== 0) {
    throw new CentralAdmissionError('WINDOW_INVALID', 'INSTANCE_OPENED must commit at stateRevisionAfter 0');
  }
  if (record.kind === 'MUTATION_COMMITTED' && record.stateRevisionBefore !== record.stateRevisionAfter - 1) {
    throw new CentralAdmissionError('WINDOW_INVALID', 'MUTATION_COMMITTED must advance the document revision by exactly one');
  }
  return {
    window: {
      contractVersion: HF20_MUTATION_OBSERVATION_CONTRACT_VERSION,
      mutationSequence: record.sequence,
      records: [...window.records, record].slice(-HF20_MUTATION_OBSERVATION_RETENTION_LIMIT),
    },
    record,
  };
}

// Opaque cursor codec — base64url over UTF-8 JSON {v,s,a}, implemented with
// no Node/global dependency (the payload keeps its sealed-bytes portability;
// the encoding is wire-identical to any standard base64url implementation).
const HF20_CURSOR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8EncodeHf20(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length
      && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(index + 1) - 0xdc00);
      index += 1;
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

function utf8DecodeHf20(bytes) {
  let text = '';
  for (let index = 0; index < bytes.length;) {
    const lead = bytes[index];
    index += 1;
    let code;
    if (lead < 0x80) {
      code = lead;
    } else if (lead >= 0xc0 && lead < 0xe0) {
      code = ((lead & 0x1f) << 6) | (bytes[index] & 0x3f);
      index += 1;
    } else if (lead >= 0xe0 && lead < 0xf0) {
      code = ((lead & 0x0f) << 12) | ((bytes[index] & 0x3f) << 6) | (bytes[index + 1] & 0x3f);
      index += 2;
    } else {
      code = ((lead & 0x07) << 18) | ((bytes[index] & 0x3f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
      index += 3;
    }
    if (code > 0xffff) {
      code -= 0x10000;
      text += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      text += String.fromCharCode(code);
    }
  }
  return text;
}

function base64UrlEncodeHf20(text) {
  const bytes = utf8EncodeHf20(text);
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index];
    const b1 = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    const b2 = index + 2 < bytes.length ? bytes[index + 2] : undefined;
    encoded += HF20_CURSOR_ALPHABET[b0 >> 2];
    encoded += HF20_CURSOR_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    encoded += HF20_CURSOR_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    encoded += HF20_CURSOR_ALPHABET[b2 & 0x3f];
  }
  return encoded;
}

function base64UrlDecodeHf20(encoded) {
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes = [];
  for (const character of encoded) {
    const value = HF20_CURSOR_ALPHABET.indexOf(character);
    if (value < 0) {
      throw new CentralAdmissionError('CURSOR_MALFORMED', `the cursor token carries a non-base64url character`);
    }
    bitBuffer = (bitBuffer * 64) + value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push(Math.floor(bitBuffer / (2 ** bitCount)) & 0xff);
      bitBuffer %= (2 ** bitCount);
    }
  }
  return bytes;
}

function encodeHf20Cursor(stream, after) {
  if (typeof stream !== 'string' || stream.length === 0) {
    throw new CentralAdmissionError('CURSOR_MALFORMED', 'a cursor requires a non-empty stream identity');
  }
  if (!isHf20SafeNonNegativeInteger(after)) {
    throw new CentralAdmissionError('CURSOR_MALFORMED', 'a cursor requires a safe non-negative exclusive-after sequence');
  }
  return base64UrlEncodeHf20(JSON.stringify({ v: 1, s: stream, a: after }));
}

function decodeHf20Cursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length === 0) {
    throw new CentralAdmissionError('CURSOR_MALFORMED', 'a cursor token must be a non-empty string');
  }
  let payload;
  try {
    payload = JSON.parse(utf8DecodeHf20(base64UrlDecodeHf20(cursor)));
  } catch (error) {
    if (error instanceof CentralAdmissionError) throw error;
    throw new CentralAdmissionError('CURSOR_MALFORMED', 'the cursor token is not decodable base64url JSON');
  }
  if (!isJsonRecord(payload) || payload.v !== 1 || typeof payload.s !== 'string' || payload.s.length === 0
    || !isHf20SafeNonNegativeInteger(payload.a)) {
    throw new CentralAdmissionError('CURSOR_MALFORMED', 'the cursor token does not carry the {v,s,a} contract shape');
  }
  return { stream: payload.s, after: payload.a };
}

function clampHf20ReadLimit(limit) {
  if (limit === undefined) return 100;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1) {
    throw new CentralAdmissionError('READ_LIMIT_INVALID', 'the read limit must be an integer ≥ 1');
  }
  return Math.min(limit, 1000);
}

function projectHf20ObservationPage(window, request) {
  if (!isHf20MutationObservationWindow(window)) {
    throw new CentralAdmissionError('WINDOW_INVALID', 'the stored mutation-observation window is structurally invalid; fail closed');
  }
  if (typeof request.stream !== 'string' || request.stream.length === 0) {
    throw new CentralAdmissionError('CURSOR_STREAM_MISMATCH', 'a read requires the exact stream identity being read');
  }
  const limit = clampHf20ReadLimit(request.limit);
  let after = 0;
  if (request.afterCursor !== undefined) {
    const decoded = decodeHf20Cursor(request.afterCursor);
    if (decoded.stream !== request.stream) {
      throw new CentralAdmissionError(
        'CURSOR_STREAM_MISMATCH',
        `the cursor was minted for stream ${decoded.stream}, not ${request.stream}; substitution fails closed`,
      );
    }
    if (decoded.after > window.mutationSequence) {
      throw new CentralAdmissionError(
        'CURSOR_BEYOND_WATERMARK',
        `the cursor claims sequence ${String(decoded.after)} but the stream's committed watermark is ${String(window.mutationSequence)}; no such progress was ever committed`,
      );
    }
    after = decoded.after;
  }
  const highWatermark = window.mutationSequence;
  const retained = window.records;
  const earliestAvailable = retained.length > 0 ? retained[0].sequence : undefined;
  const truncated = after < highWatermark
    && earliestAvailable !== undefined
    && after < earliestAvailable - 1;
  const records = retained.filter((record) => record.sequence > after).slice(0, limit);
  const lastRecord = records.length > 0 ? records[records.length - 1] : undefined;
  return {
    records,
    ...(lastRecord !== undefined ? { nextCursor: encodeHf20Cursor(request.stream, lastRecord.sequence) } : {}),
    highWatermark,
    ...(truncated
      ? {
        gap: {
          kind: 'RETENTION_TRUNCATED',
          requestedAfter: after,
          ...(earliestAvailable === undefined ? {} : { earliestAvailable }),
          highWatermark,
        },
      }
      : {}),
  };
}

/**
 * [#1063 HF20 read-scope boundary] The outward projection of one instance
 * snapshot: the K-only carrier fields (`mutationObservations` — HF20;
 * `admittedControlTurns` — #1066 same-CAS turn admission history) stay
 * INTERNAL next-CAS/replay truth and never leave the Kernel through
 * queryInstance/FR05/Genesis/receipt surfaces; the protected
 * mutation-observation read verb is the ONLY authorized reader of the
 * observation window, and the turn history has no outward reader at all.
 */
function outwardInstanceSnapshot(snapshot) {
  if (!isJsonRecord(snapshot)) return snapshot;
  if (!('mutationObservations' in snapshot) && !('admittedControlTurns' in snapshot)) return snapshot;
  const outward = {};
  for (const key of Object.keys(snapshot)) {
    if (key === 'mutationObservations' || key === 'admittedControlTurns') continue;
    outward[key] = snapshot[key];
  }
  return outward;
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
  return `v08-kernel:wf-instance:${address.workflowId}:${address.instanceKey}`;
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
    // [#1063 HF20] The observation window rides the created instance
    // document from byte zero: INSTANCE_OPENED commits at stateRevision 0
    // in the SAME mustBeAbsent put that creates the row.
    const opened = appendHf20MutationObservation(
      newHf20ObservationWindow(),
      { kind: 'INSTANCE_OPENED', stateRevisionAfter: 0 },
      timestamp,
    );
    const snapshot = {
      address: { ...request.address },
      correlationId: request.correlationId,
      packageId: request.packageId,
      lifecycle: request.lifecycle ?? 'active',
      stateRevision: 0,
      state: request.initialState,
      mutationObservations: opened.window,
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
   *
   * [#1066 R1 P1-B] When the caller carries `admittedControlTurn` (a
   * NON-message durable control turn), its identity is appended to the
   * bounded `admittedControlTurns` history INSIDE this same authoritative
   * state-CAS write — the turn admission becomes part of the committed
   * instance truth itself, so a crash between this CAS and the independent
   * turn-disposition/marker observations still leaves a durable,
   * authoritative record that the turn was already admitted exactly once.
   */
  async commitAcceptedTransitionInLane(request) {
    const current = await this.#instances.require(request.target);
    const transition = await request.transition(current);
    const updatedAt = this.#now();
    if (this.#counters !== undefined) this.#counters.engineCommits += 1;
    const admittedControlTurns = request.admittedControlTurn === undefined
      ? current.admittedControlTurns
      : [
          ...(Array.isArray(current.admittedControlTurns) ? current.admittedControlTurns : [])
            .filter((entry) => !isJsonRecord(entry) || entry.turnId !== request.admittedControlTurn.turnId),
          {
            turnId: request.admittedControlTurn.turnId,
            identity: request.admittedControlTurn.identity,
            stateRevision: current.stateRevision + 1,
            admittedAt: updatedAt,
          },
        ].slice(-MAX_ADMITTED_CONTROL_TURN_HISTORY);

    // [#1063 HF20] The MUTATION_COMMITTED observation record is computed by
    // the pure reducer INSIDE this same transition body and rides the SAME
    // single-key CAS value below — one physical row write makes the record
    // and the new stateRevision durable together or not at all. A losing
    // writer takes HOST_CAS_CONFLICT from the put BEFORE any durable effect,
    // so a lost/uncommitted turn never yields an observation.
    const mutationObservations = appendHf20MutationObservation(
      current.mutationObservations,
      {
        kind: 'MUTATION_COMMITTED',
        stateRevisionBefore: current.stateRevision,
        stateRevisionAfter: current.stateRevision + 1,
        sourceMessageId: request.messageId,
      },
      updatedAt,
    ).window;

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
      mutationObservations,
      ...(admittedControlTurns === undefined || admittedControlTurns.length === 0 ? {} : { admittedControlTurns }),
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
  return `v08-kernel:governance-pin:${workflowInstanceId}`;
}

// ===========================================================================
// [#1003 NF06] K-owned decision-receipt records (OBSERVATIONAL_OPTIONAL).
// One durable data-only record per EXACT durable control turn, created
// through the Host true-CAS port (mustBeAbsent — create-or-conflict, never
// an unconditional write). The record NEVER carries admission authority:
// the admitted State, Effect journal and instance CAS remain the only
// authority; a lost/failed/conflicting record is reported as a separate
// typed observation outcome and can never rewrite the business truth.
// ===========================================================================

function decisionReceiptDocKey(turnId) {
  return `v08-kernel:decision-receipt:${turnId}`;
}

// ===========================================================================
// [#1062 HF18/HF32 shared seam] K-owned turn dispositions for NON-message
// durable control turns (timer/callback/child-terminal). One admitted turn
// creates exactly one record at the deterministic turn-id key; a replay of
// the SAME source (redelivery, restart recovery, heal-after-crash) reads it
// inside the occurrence lane and replays the stored receipt with ZERO new
// State/Journal/Effect activity. A record under the same turn id carrying a
// DIFFERENT identity (e.g. the same source re-submitted under another
// intentType) refuses typed before admission — one source is exactly one
// turn. The record is written AFTER the authoritative state CAS as a
// separate best-effort observation (same honest discipline as the NF06
// decision receipt): the v0.8 Host true-CAS store has no cross-document
// atomic batch, so a crash between the state commit and this create leaves
// an honest not_recorded window that the physical negative witnesses —
// atomicity is never claimed.
// ===========================================================================

function turnDispositionDocKey(turnId) {
  return `v08-kernel:turn-disposition:${turnId}`;
}

/**
 * [#1066 R1 P1-B] The bounded same-CAS admission history bound: the last
 * 16 non-message turn admissions ride inside the instance document. The
 * history is the crash-window backstop for a LOST turn-disposition record
 * (written best-effort after the state CAS). Before evicting the oldest of
 * 16 entries K must verify its independent disposition exists with the
 * exact identity; otherwise new control turns FAIL CLOSED until the old
 * source is recovered and its missing disposition healed. Thus a delayed
 * recovery cannot silently pass beyond the bounded crash backstop.
 */
const MAX_ADMITTED_CONTROL_TURN_HISTORY = 16;

function turnDispositionIdentity(moduleSha256, target, turn, intentType) {
  return canonicalJsonStringify({
    kernelModuleSha256: moduleSha256,
    target: { workflowId: target.workflowId, instanceKey: target.instanceKey },
    turn,
    intentType,
  });
}

/**
 * Receipt identity for idempotent-replay adjudication: the kernel module
 * bytes, the turn's occurrence identity and the redacted projected record —
 * everything EXCEPT the volatile recordedAt timestamp, so a crash-restart
 * replay of the same admitted turn recognizes its own record instead of
 * conflicting.
 */
function decisionReceiptIdentity(envelope) {
  const record = isJsonRecord(envelope) && isJsonRecord(envelope.record) ? envelope.record : {};
  const { recordedAt: _recordedAt, ...identity } = record;
  return canonicalJsonStringify({ kernelModuleSha256: envelope.kernelModuleSha256, record: identity });
}

const RECEIPT_DURABILITY_MODES = new Set(['observational-optional', 'durable-mandatory']);

/**
 * [#1003 NF06] Trusted load-boundary wiring of every intent-declared
 * `receiptPolicy`: shape-validated and frozen HERE, before any instance can
 * exist (same discipline as the effect/continuation/semantic wiring). A
 * malformed policy fails the load typed; a valid one is the ONLY receipt
 * authority the submit lane trusts at occurrence time.
 */
function wireDecisionReceiptPolicies(businessEndpoint) {
  const policies = new Map();
  const bindings = businessEndpoint.intentBindings ?? {};
  for (const [intentType, binding] of Object.entries(bindings)) {
    if (!isJsonRecord(binding) || !hasOwn(binding, 'receiptPolicy')) continue;
    const rawPolicy = binding.receiptPolicy;
    if (!isJsonRecord(rawPolicy)) {
      throw new CentralAdmissionError(
        'BUSINESS_RECEIPT_POLICY_INVALID',
        `intent ${intentType} declares a receiptPolicy that is not an object`,
      );
    }
    const durability = rawPolicy.durability;
    if (typeof durability !== 'string' || !RECEIPT_DURABILITY_MODES.has(durability)) {
      throw new CentralAdmissionError(
        'BUSINESS_RECEIPT_POLICY_INVALID',
        `intent ${intentType} declares receiptPolicy.durability ${JSON.stringify(durability)}; exactly 'observational-optional' or 'durable-mandatory' is accepted`,
      );
    }
    let readerRoles;
    if (rawPolicy.readerRoles !== undefined) {
      if (!Array.isArray(rawPolicy.readerRoles)
        || rawPolicy.readerRoles.length === 0
        || rawPolicy.readerRoles.length > 64
        || !rawPolicy.readerRoles.every((role) => typeof role === 'string' && role.length > 0)) {
        throw new CentralAdmissionError(
          'BUSINESS_RECEIPT_POLICY_INVALID',
          `intent ${intentType} declares receiptPolicy.readerRoles that is not a bounded non-empty list of roles`,
        );
      }
      readerRoles = [...new Set(rawPolicy.readerRoles)];
    } else if (durability === 'observational-optional') {
      throw new CentralAdmissionError(
        'BUSINESS_RECEIPT_POLICY_INVALID',
        `intent ${intentType} declares an observational-optional receiptPolicy without readerRoles; a readable observation must declare who may read it`,
      );
    }
    policies.set(intentType, Object.freeze({
      durability,
      ...(readerRoles === undefined ? {} : { readerRoles: Object.freeze(readerRoles) }),
    }));
  }
  return policies;
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
    return `v08-kernel:baseline:${governanceBaselineKey(identity)}`;
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
// [#1003 FR07-KH2 — kernel-owned NEW mechanism code, NOT a v0.7 migration]
// Bounded model continuation, trusted model-call accounting and the
// request-scoped cancellation latch.
//
// Contract: #1003@6122627750 (§4 K owns the loop) + review #1003@6130723310
// B2/B3/B4. The v0.7 harness-machine.ts@86110c6 (blob f2fe5d49) SEMANTICS are
// retained — query allowlist + explicit mutation denial, maxSteps guard,
// query observation + dependency capture/dedupe, ordinary query failure as a
// structured {ok:false,error} observation with bounded recovery, invalid
// query output fail-closed, exact final validation, cooperative cancellation
// — without its XState runtime and WITHOUT any Host/Business `execute()`
// callback: the only query executor is the K-owned read below.
//
//   - A sealed `model-decision` rule carrying a data-only `harness` policy
//     selects the continuation. The policy is validated ONCE at wiring
//     (createOccurrenceRuntime — the trusted load boundary) and deep-frozen
//     into a WeakMap keyed by the exact rule object; live mutation after
//     wiring is ignored and an unwired harness rule refuses typed.
//   - K owns every turn: before each S `invokeStep` call (recovery turns
//     included) the K budget is checked against the sealed `maxSteps`,
//     itself bounded by the immutable K ceiling MAX_FR07_STEPS. A query
//     never resets the budget and there are no hidden retries.
//   - A query envelope is a PROPOSAL: K authorizes the capability against
//     the wired policy (unknown ⇒ UNKNOWN_CAPABILITY, mutation ⇒
//     MUTATION_CAPABILITY_FORBIDDEN, both before any read) and executes the
//     only read kind that exists — a projection of the K-attested instance
//     context re-read through the Host document port at exactly the lane's
//     stateRevision. Nothing on this path writes.
//   - Model-call evidence: K accepts per-step evidence only in the exact
//     trusted shape the Host-bound resolver mints (`measured` count 1 per
//     physical turn, or `unmeasured`) and aggregates it; the legacy numeric
//     `freshModelCallCount` is not read anywhere on the selected path.
//   - Cancellation: a request-scoped signal from the H-authenticated gateway
//     flips a K latch. K checks it before and after every awaited model turn
//     and read and closes it immediately before central admission; once
//     admission has begun a late cancel can no longer split the occurrence.
//   - Only a final envelope (outcome/event allowlisted) reaches
//     admitCentralDecision; every terminal before it leaves zero State,
//     Journal and Effect.
// ===========================================================================

/** Immutable K-owned absolute ceiling on model turns per occurrence (B4). */
export const MAX_FR07_STEPS = 8;

const CONTINUATION_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const CONTINUATION_MAX_CAPABILITIES = 32;
const CONTINUATION_MAX_FIELDS = 32;
const CONTINUATION_MAX_ALLOWED = 64;
const CONTINUATION_HARNESS_KEYS = new Set(['maxSteps', 'capabilities', 'allowedOutcomes', 'allowedEvents']);
const CONTINUATION_READ_KEYS = new Set(['mode', 'source', 'fields', 'outputSchema']);
const CONTINUATION_SCHEMA_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const BOUND_PORT_EVIDENCE_SCOPE = 'bound-model-port-invocations';

function invalidContinuation(message) {
  throw new CentralAdmissionError('CONTINUATION_DECLARATION_INVALID', message);
}

function isJsonRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonTypeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function continuationIdentifier(value, label) {
  if (typeof value !== 'string' || !CONTINUATION_IDENTIFIER.test(value)) {
    invalidContinuation(`${label} must be a bounded identifier`);
  }
  return value;
}

function continuationIdentifierList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > CONTINUATION_MAX_ALLOWED) {
    invalidContinuation(`${label} must be a non-empty bounded identifier list`);
  }
  const seen = new Set();
  for (const item of value) {
    continuationIdentifier(item, label);
    if (seen.has(item)) invalidContinuation(`${label} contains the duplicate ${item}`);
    seen.add(item);
  }
  return [...value];
}

function snapshotReadDescriptor(descriptor, label) {
  for (const key of Object.keys(descriptor)) {
    if (!CONTINUATION_READ_KEYS.has(key)) invalidContinuation(`${label} carries the unsupported key ${key}`);
  }
  if (descriptor.source !== 'instance-context') {
    invalidContinuation(`${label}.source must be 'instance-context' (the only K-owned read kind)`);
  }
  const fieldEntries = isJsonRecord(descriptor.fields) ? Object.entries(descriptor.fields) : [];
  if (fieldEntries.length === 0 || fieldEntries.length > CONTINUATION_MAX_FIELDS) {
    invalidContinuation(`${label}.fields must map 1..${CONTINUATION_MAX_FIELDS} output names to context keys`);
  }
  const fields = {};
  for (const [outputName, contextKey] of fieldEntries) {
    continuationIdentifier(outputName, `${label}.fields output name`);
    fields[outputName] = continuationIdentifier(contextKey, `${label}.fields.${outputName}`);
  }
  const outputSchema = {};
  if (hasOwn(descriptor, 'outputSchema')) {
    if (!isJsonRecord(descriptor.outputSchema)) invalidContinuation(`${label}.outputSchema must be an object`);
    for (const [outputName, type] of Object.entries(descriptor.outputSchema)) {
      if (!hasOwn(fields, outputName)) invalidContinuation(`${label}.outputSchema names the undeclared field ${outputName}`);
      if (!CONTINUATION_SCHEMA_TYPES.has(type)) invalidContinuation(`${label}.outputSchema.${outputName} has the unsupported type ${String(type)}`);
      outputSchema[outputName] = type;
    }
  }
  return { mode: 'read', source: 'instance-context', fields, outputSchema };
}

/**
 * Validate and snapshot ONE harness policy (trusted wiring boundary). The
 * budget is checked against the K ceiling before anything else, so a
 * non-finite/non-integer/out-of-range value fails with its own typed code.
 */
function snapshotContinuationPolicy(rule, ruleId) {
  const harness = rule.harness;
  if (!isPlainObject(harness)) invalidContinuation(`rule ${ruleId}: harness must be a plain data object`);
  const budget = Object.getOwnPropertyDescriptor(harness, 'maxSteps');
  const maxSteps = budget !== undefined && hasOwn(budget, 'value') ? budget.value : undefined;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > MAX_FR07_STEPS) {
    throw new CentralAdmissionError(
      'CONTINUATION_MAX_STEPS_INVALID',
      `rule ${ruleId}: harness.maxSteps must be an integer in 1..${MAX_FR07_STEPS} (the K-owned absolute ceiling MAX_FR07_STEPS)`,
    );
  }
  let data;
  try {
    data = canonicalizeJson(harness);
  } catch (error) {
    invalidContinuation(`rule ${ruleId}: harness must be canonical JSON data (${error instanceof Error ? error.message : String(error)})`);
  }
  for (const key of Object.keys(data)) {
    if (!CONTINUATION_HARNESS_KEYS.has(key)) invalidContinuation(`rule ${ruleId}: harness carries the unsupported key ${key}`);
  }
  const capabilityEntries = isJsonRecord(data.capabilities) ? Object.entries(data.capabilities) : [];
  if (capabilityEntries.length === 0 || capabilityEntries.length > CONTINUATION_MAX_CAPABILITIES) {
    invalidContinuation(`rule ${ruleId}: harness.capabilities must declare 1..${CONTINUATION_MAX_CAPABILITIES} capability descriptors`);
  }
  const capabilities = {};
  for (const [capabilityId, descriptor] of capabilityEntries) {
    const label = `rule ${ruleId}: capability ${capabilityId}`;
    continuationIdentifier(capabilityId, `rule ${ruleId}: capability id`);
    if (!isJsonRecord(descriptor)) invalidContinuation(`${label} must be a descriptor object`);
    if (descriptor.mode === 'read') {
      capabilities[capabilityId] = snapshotReadDescriptor(descriptor, label);
    } else if (descriptor.mode === 'mutation') {
      // Declared ONLY so K can deny it explicitly: no other field, no callable.
      if (Object.keys(descriptor).length !== 1) invalidContinuation(`${label}: a mutation descriptor carries mode only`);
      capabilities[capabilityId] = { mode: 'mutation' };
    } else {
      invalidContinuation(`${label}.mode must be 'read' or 'mutation'`);
    }
  }
  if (typeof rule.id !== 'string' || typeof rule.modelOperation !== 'string') {
    invalidContinuation(`rule ${ruleId}: a harness model-decision rule requires string id and modelOperation`);
  }
  const policy = {
    // The ONLY declaration S ever receives for this rule (wiring snapshot).
    declaration: { kind: 'model-decision', id: rule.id, modelOperation: rule.modelOperation },
    maxSteps,
    capabilities,
    advertisedCapabilities: Object.keys(capabilities).filter((id) => capabilities[id].mode === 'read'),
    allowedOutcomes: continuationIdentifierList(data.allowedOutcomes, `rule ${ruleId}: harness.allowedOutcomes`),
    allowedEvents: continuationIdentifierList(data.allowedEvents, `rule ${ruleId}: harness.allowedEvents`),
  };
  deepFreezePreparedData(policy);
  return policy;
}

/** Wire every harness rule of the Business policy (createOccurrenceRuntime only). */
function wireContinuationPolicies(businessEndpoint) {
  const registry = new WeakMap();
  for (const [ruleId, rule] of Object.entries(businessEndpoint.rules ?? {})) {
    if (!isJsonRecord(rule) || rule.kind !== 'model-decision' || !hasOwn(rule, 'harness')) continue;
    registry.set(rule, snapshotContinuationPolicy(rule, ruleId));
  }
  return registry;
}

// ===========================================================================
// [#1003 FR08 SD1/SD2 + NF05] Trusted-boundary validation of every
// semantic-decision rule of the Business policy — the SELECTED-Kernel half
// of the BUILD→Standard declaration approval binding. BUILD compiles the
// SemanticDecision descriptor and pins its canonical content identity
// (declarationDigest); this wiring verifies that digest through the Host
// sha256 port (SYNCHRONOUSLY — the physical bootstrap port returns the hex
// digest directly) so ONLY the exact compiled declaration can run: a stale
// or substituted descriptor fails the load typed before any instance can
// exist. The shape is validated once here, the validated declaration is
// deep-frozen, and a semantic-decision rule that was never wired is refused
// at submit (no silent unbound fallback). The Kernel gains no new
// authority: Guard/Admission/Effect/Journal stay exactly where they were;
// the Standard SDK interpreter remains the only declaration semantics.
// ===========================================================================
const SEMANTIC_RULE_KEYS = new Set([
  'kind', 'id', 'decisionId', 'declarationDigest', 'inputSelection', 'resultSchema',
  'allowedOutcomes', 'allowedEventTypes', 'queryCapabilityIds', 'dependencyMaterial',
  'cachePolicy', 'promotedReference', 'policy', 'disposition', 'unavailable',
]);
const SEMANTIC_DISPOSITION_KEYS = new Set(['mode', 'outcome', 'eventType', 'outcomeFrom', 'eventTypeFrom', 'payloadFromInput']);
const SEMANTIC_SCHEMA_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const SEMANTIC_MAX_LIST = 64;
const SEMANTIC_MAX_FIELDS = 32;
const SEMANTIC_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

function invalidSemanticRule(message) {
  throw new CentralAdmissionError('SEMANTIC_DECISION_INVALID', message);
}

function semanticIdentifier(value, label) {
  if (typeof value !== 'string' || !SEMANTIC_IDENTIFIER.test(value)) {
    invalidSemanticRule(`${label} must be a bounded identifier`);
  }
  return value;
}

function semanticIdentifierList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.length > SEMANTIC_MAX_LIST) {
    invalidSemanticRule(`${label} must be a non-empty bounded identifier list`);
  }
  const seen = new Set();
  for (const item of value) {
    semanticIdentifier(item, label);
    if (seen.has(item)) invalidSemanticRule(`${label} contains the duplicate ${item}`);
    seen.add(item);
  }
  return [...value];
}

/** Validate ONE compiled semantic-decision rule and freeze its snapshot. */
function snapshotSemanticDecisionRule(rule, ruleId, sha256) {
  let data;
  try {
    data = canonicalizeJson(rule);
  } catch (error) {
    invalidSemanticRule(`rule ${ruleId}: the declaration must be canonical JSON data (${error instanceof Error ? error.message : String(error)})`);
  }
  for (const key of Object.keys(data)) {
    if (!SEMANTIC_RULE_KEYS.has(key)) invalidSemanticRule(`rule ${ruleId}: the declaration carries the unsupported key ${key}`);
  }
  const id = semanticIdentifier(data.id, `rule ${ruleId}: id`);
  if (data.decisionId !== undefined && data.decisionId !== id) {
    invalidSemanticRule(`rule ${ruleId}: decisionId does not match the declaration id`);
  }
  // BUILD approval binding: the pinned canonical content identity must
  // verify against the declaration actually present in this policy.
  const digest = data.declarationDigest;
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
    invalidSemanticRule(`rule ${ruleId}: a compiled semantic-decision rule must carry its 64-hex declarationDigest`);
  }
  const { declarationDigest: _pinned, ...body } = data;
  let computed;
  try {
    computed = sha256.digestUtf8(canonicalJsonStringify(body));
  } catch (error) {
    invalidSemanticRule(`rule ${ruleId}: the Host sha256 port refused the declaration digest material (${error instanceof Error ? error.message : String(error)})`);
  }
  if (typeof computed !== 'string' || computed.length === 0) {
    invalidSemanticRule(`rule ${ruleId}: the Host sha256 port must return the declarationDigest synchronously (an async digest cannot gate the synchronous trusted load boundary)`);
  }
  if (computed !== digest) {
    invalidSemanticRule(`rule ${ruleId}: declarationDigest does not match the declaration body (stale or substituted descriptor)`);
  }
  const allowedOutcomes = semanticIdentifierList(data.allowedOutcomes, `rule ${ruleId}: allowedOutcomes`);
  const allowedEventTypes = semanticIdentifierList(data.allowedEventTypes, `rule ${ruleId}: allowedEventTypes`);
  if (data.queryCapabilityIds !== undefined) {
    // A decision with no query capabilities is legal; the read-only
    // VERIFICATION of each listed capability belongs to BUILD.
    if (!Array.isArray(data.queryCapabilityIds) || data.queryCapabilityIds.length > SEMANTIC_MAX_LIST) {
      invalidSemanticRule(`rule ${ruleId}: queryCapabilityIds must be a bounded identifier list`);
    }
    const seenCapabilities = new Set();
    for (const capabilityId of data.queryCapabilityIds) {
      semanticIdentifier(capabilityId, `rule ${ruleId}: queryCapabilityIds`);
      if (seenCapabilities.has(capabilityId)) invalidSemanticRule(`rule ${ruleId}: queryCapabilityIds contains the duplicate ${capabilityId}`);
      seenCapabilities.add(capabilityId);
    }
  }
  // Exact input selection: 1..N declared projection fields.
  const selectionEntries = isJsonRecord(data.inputSelection) ? Object.entries(data.inputSelection) : [];
  if (selectionEntries.length === 0 || selectionEntries.length > SEMANTIC_MAX_FIELDS) {
    invalidSemanticRule(`rule ${ruleId}: inputSelection must map 1..${SEMANTIC_MAX_FIELDS} output names to input keys`);
  }
  const selectedKeys = new Set();
  for (const [outputName, sourceKey] of selectionEntries) {
    semanticIdentifier(outputName, `rule ${ruleId}: inputSelection output name`);
    semanticIdentifier(sourceKey, `rule ${ruleId}: inputSelection.${outputName}`);
    selectedKeys.add(outputName);
  }
  if (data.resultSchema !== undefined) {
    if (!isJsonRecord(data.resultSchema)) invalidSemanticRule(`rule ${ruleId}: resultSchema must be an object`);
    const required = data.resultSchema.required ?? [];
    if (!Array.isArray(required) || required.length > 1024) {
      invalidSemanticRule(`rule ${ruleId}: resultSchema.required must be a bounded string list`);
    }
    for (const name of required) semanticIdentifier(name, `rule ${ruleId}: resultSchema.required`);
    const properties = isJsonRecord(data.resultSchema.properties) ? data.resultSchema.properties : {};
    for (const [name, type] of Object.entries(properties)) {
      semanticIdentifier(name, `rule ${ruleId}: resultSchema.properties key`);
      if (!SEMANTIC_SCHEMA_TYPES.has(type)) {
        invalidSemanticRule(`rule ${ruleId}: resultSchema.properties.${name} has the unsupported type ${String(type)}`);
      }
    }
  }
  if (!isJsonRecord(data.policy) || !Number.isSafeInteger(data.policy.maxSteps) || data.policy.maxSteps < 1) {
    invalidSemanticRule(`rule ${ruleId}: policy.maxSteps must be a positive integer`);
  }
  if (data.promotedReference !== undefined) {
    if (!isJsonRecord(data.promotedReference)) invalidSemanticRule(`rule ${ruleId}: promotedReference must be an object`);
    semanticIdentifier(data.promotedReference.artifactId, `rule ${ruleId}: promotedReference.artifactId`);
    semanticIdentifier(data.promotedReference.contentDigest, `rule ${ruleId}: promotedReference.contentDigest`);
    if (data.promotedReference.required !== undefined && typeof data.promotedReference.required !== 'boolean') {
      invalidSemanticRule(`rule ${ruleId}: promotedReference.required must be a boolean`);
    }
  }
  if (data.unavailable !== undefined) {
    if (!isJsonRecord(data.unavailable) || data.unavailable.disposition !== 'semantic-unavailable'
      || typeof data.unavailable.reason !== 'string' || data.unavailable.reason.length === 0
      || data.unavailable.reason.length > 256) {
      invalidSemanticRule(`rule ${ruleId}: unavailable must declare disposition 'semantic-unavailable' with a bounded non-empty reason`);
    }
  } else {
    if (!isJsonRecord(data.disposition)) invalidSemanticRule(`rule ${ruleId}: disposition must be an object`);
    for (const key of Object.keys(data.disposition)) {
      if (!SEMANTIC_DISPOSITION_KEYS.has(key)) invalidSemanticRule(`rule ${ruleId}: disposition carries the unsupported key ${key}`);
    }
    const projection = isJsonRecord(data.disposition.payloadFromInput) ? data.disposition.payloadFromInput : {};
    if (Object.keys(projection).length > SEMANTIC_MAX_FIELDS) {
      invalidSemanticRule(`rule ${ruleId}: disposition.payloadFromInput is unbounded`);
    }
    for (const [field, sourceKey] of Object.entries(projection)) {
      semanticIdentifier(field, `rule ${ruleId}: disposition.payloadFromInput field`);
      semanticIdentifier(sourceKey, `rule ${ruleId}: disposition.payloadFromInput.${field}`);
      if (!selectedKeys.has(sourceKey)) {
        invalidSemanticRule(`rule ${ruleId}: disposition.payloadFromInput.${field} addresses ${String(sourceKey)} outside the declared inputSelection`);
      }
    }
    if (data.disposition.mode === 'deterministic') {
      if (!allowedOutcomes.includes(semanticIdentifier(data.disposition.outcome, `rule ${ruleId}: disposition.outcome`))) {
        invalidSemanticRule(`rule ${ruleId}: disposition.outcome is not a declared allowed outcome`);
      }
      if (!allowedEventTypes.includes(semanticIdentifier(data.disposition.eventType, `rule ${ruleId}: disposition.eventType`))) {
        invalidSemanticRule(`rule ${ruleId}: disposition.eventType is not a declared allowed event type`);
      }
    } else if (data.disposition.mode === 'route') {
      semanticIdentifier(data.disposition.outcomeFrom, `rule ${ruleId}: disposition.outcomeFrom`);
      semanticIdentifier(data.disposition.eventTypeFrom, `rule ${ruleId}: disposition.eventTypeFrom`);
    } else {
      invalidSemanticRule(`rule ${ruleId}: disposition.mode must be 'deterministic' or 'route'`);
    }
  }
  const snapshot = { declaration: data };
  deepFreezePreparedData(snapshot);
  return snapshot;
}

/** Wire every compiled semantic-decision rule (createOccurrenceRuntime only). */
function wireSemanticDecisionRules(businessEndpoint, sha256) {
  const registry = new WeakMap();
  for (const [ruleId, rule] of Object.entries(businessEndpoint.rules ?? {})) {
    if (!isJsonRecord(rule) || rule.kind !== 'semantic-decision') continue;
    registry.set(rule, snapshotSemanticDecisionRule(rule, ruleId, sha256));
  }
  return registry;
}

// ===========================================================================
// [#1003 FR08 general + FR09 + FR12] Trusted-boundary validation of
// decision-source rules — the Kernel half of the retained resolver
// composition, lawfully reduced to the frozen v0.8 S contract
// (standard-sdk-v1.mjs resolveRetainedDecision / selectRetainedPromotedChild
// / checkRetainedEvidenceApplicability): "K passes current qualified
// observations; the Standard SDK emits only a selected candidate".
//
// The Business package compiles a decision-source declaration whose legs
// mirror the retained v0.7 ordering Rule -> Exact Cache -> Promoted ->
// Harness; this wiring verifies the pinned canonical declarationDigest and
// freezes the validated legs EXACTLY like the semantic-decision wiring, so
// only the exact compiled declaration can run. The Kernel gains NO new
// admission authority: the S selection is the only ordering/currentness/
// eligibility authority, the selected candidate flows through the UNCHANGED
// central admission (schema → hard invariant → guard → transition →
// journal → effect), and every durable record (exact-cache entry,
// promoted-child pin) lives in the generic Host document store through the
// same ports the journal/pins/baselines already use. No second runtime, no
// v0.7 resolver port, no caller-injected store.
// ===========================================================================
const DECISION_SOURCE_RULE_KEYS = new Set([
  'kind', 'id', 'decisionId', 'declarationDigest', 'payloadFromInput', 'rule', 'cache', 'promoted', 'harness',
]);
const DECISION_SOURCE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const DECISION_SOURCE_DIGEST = /^[0-9a-f]{64}$/;
const DECISION_SOURCE_MAX_DEPS = 8;
const DECISION_SOURCE_MAX_PROJECTION = 16;
const DECISION_CACHE_PREFIX = 'v08-kernel:decision-cache:';
const PROMOTED_PIN_PREFIX = 'v08-kernel:promoted-pin:';

function invalidDecisionSource(message) {
  throw new CentralAdmissionError('DECISION_SOURCE_INVALID', message);
}

function decisionSourceIdentifier(value, label) {
  if (typeof value !== 'string' || !DECISION_SOURCE_IDENTIFIER.test(value)) {
    invalidDecisionSource(`${label} must be a bounded identifier`);
  }
  return value;
}

function snapshotDecisionSourcePredicate(value, label) {
  if (!isJsonRecord(value)) invalidDecisionSource(`${label} must be a DomainPredicate object`);
  try {
    assertDomainPredicateShape(value, label, invalidDecisionSource);
    return prepareDomainPredicate(value);
  } catch (error) {
    if (error instanceof CentralAdmissionError) throw error;
    invalidDecisionSource(`${label} is not a preparable DomainPredicate: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate ONE compiled decision-source rule and freeze its snapshot.
 * Shape follows the semantic-decision discipline: exact key set, pinned
 * canonical declarationDigest, deep-frozen legs. The promoted leg's
 * requested identity must match the sealed approved artifact EXACTLY at
 * this boundary (a BUILD inconsistency fails the load); eligibility
 * (revoked / applicable / compatible) is deliberately NOT decided here —
 * that is the retained S runtime authority.
 */
function snapshotDecisionSourceRule(rule, ruleId, businessEndpoint, sha256) {
  const data = rule;
  for (const key of Object.keys(data)) {
    if (!DECISION_SOURCE_RULE_KEYS.has(key)) {
      invalidDecisionSource(`rule ${ruleId}: unknown decision-source field ${JSON.stringify(key)}`);
    }
  }
  if (data.id !== ruleId) invalidDecisionSource(`rule ${ruleId}: decision-source id must equal the policy rule key`);
  decisionSourceIdentifier(data.id, `rule ${ruleId}: id`);
  const decisionId = decisionSourceIdentifier(data.decisionId, `rule ${ruleId}: decisionId`);
  if (typeof data.declarationDigest !== 'string' || !DECISION_SOURCE_DIGEST.test(data.declarationDigest)) {
    invalidDecisionSource(`rule ${ruleId}: a compiled decision-source rule must carry its 64-hex declarationDigest`);
  }
  const { declarationDigest: _pinned, ...body } = data;
  let digest;
  try {
    digest = sha256.digestUtf8(canonicalJsonStringify(body));
  } catch (error) {
    invalidDecisionSource(`rule ${ruleId}: the Host sha256 port must return the declarationDigest synchronously (${error instanceof Error ? error.message : String(error)})`);
  }
  if (digest !== data.declarationDigest) {
    invalidDecisionSource(`rule ${ruleId}: declarationDigest does not match the declaration body (stale or substituted descriptor)`);
  }

  // The bounded input-projection authorization (the exact context-projection
  // discipline: rule-level payloadFromInput). Doubles as the rule leg's
  // candidate payload source when a rule leg is declared.
  let payloadFromInput;
  if (data.payloadFromInput !== undefined) {
    if (!isJsonRecord(data.payloadFromInput) || Object.keys(data.payloadFromInput).length === 0
      || Object.keys(data.payloadFromInput).length > DECISION_SOURCE_MAX_PROJECTION) {
      invalidDecisionSource(`rule ${ruleId}: payloadFromInput must be a non-empty bounded key map`);
    }
    payloadFromInput = {};
    for (const [payloadKey, inputKey] of Object.entries(data.payloadFromInput)) {
      decisionSourceIdentifier(payloadKey, `rule ${ruleId}: payloadFromInput key`);
      decisionSourceIdentifier(inputKey, `rule ${ruleId}: payloadFromInput.${payloadKey}`);
      payloadFromInput[payloadKey] = inputKey;
    }
  }

  // Deterministic rule leg: predicate gate + declared outcome/eventType; the
  // candidate payload is projected from the occurrence input through the
  // authorized map. A mapped input key that is absent makes the leg MISS
  // (the deterministic rule declines to decide this input) — never a
  // half-projected candidate.
  let ruleLeg;
  if (data.rule !== undefined) {
    if (!isJsonRecord(data.rule)) invalidDecisionSource(`rule ${ruleId}: rule leg must be an object`);
    for (const key of Object.keys(data.rule)) {
      if (key !== 'when' && key !== 'outcome' && key !== 'eventType') {
        invalidDecisionSource(`rule ${ruleId}: rule leg may only declare when, outcome and eventType`);
      }
    }
    if (payloadFromInput === undefined) {
      invalidDecisionSource(`rule ${ruleId}: a rule leg requires the rule-level payloadFromInput projection`);
    }
    const when = snapshotDecisionSourcePredicate(data.rule.when, `rule ${ruleId}: rule.when`);
    const outcome = decisionSourceIdentifier(data.rule.outcome, `rule ${ruleId}: rule.outcome`);
    const eventType = decisionSourceIdentifier(data.rule.eventType, `rule ${ruleId}: rule.eventType`);
    ruleLeg = { when, outcome, eventType };
  }

  // Exact-cache leg: the declared dependency fields whose CURRENT context
  // values pin the cache key; a lookup under changed dependency material is
  // a miss by construction and the stale entry is never served.
  let cacheDeps;
  if (data.cache !== undefined) {
    if (!isJsonRecord(data.cache)) invalidDecisionSource(`rule ${ruleId}: cache leg must be an object`);
    for (const key of Object.keys(data.cache)) {
      if (key !== 'dependencies') invalidDecisionSource(`rule ${ruleId}: cache leg may only declare dependencies`);
    }
    const dependencies = data.cache.dependencies;
    if (!Array.isArray(dependencies) || dependencies.length === 0 || dependencies.length > DECISION_SOURCE_MAX_DEPS) {
      invalidDecisionSource(`rule ${ruleId}: cache.dependencies must be a non-empty bounded list of context fields`);
    }
    const seen = new Set();
    cacheDeps = [];
    for (const field of dependencies) {
      decisionSourceIdentifier(field, `rule ${ruleId}: cache dependency field`);
      if (seen.has(field)) invalidDecisionSource(`rule ${ruleId}: duplicate cache dependency field ${field}`);
      seen.add(field);
      cacheDeps.push(field);
    }
  }

  // Governed promoted-child leg (FR09): requested identity must match the
  // sealed approved artifact exactly; durable pin-before-execution is
  // established at turn time by THIS kernel; eligibility stays with S.
  let promoted;
  if (data.promoted !== undefined) {
    if (!isJsonRecord(data.promoted)) invalidDecisionSource(`rule ${ruleId}: promoted leg must be an object`);
    for (const key of Object.keys(data.promoted)) {
      if (key !== 'artifactId' && key !== 'contentDigest' && key !== 'when') {
        invalidDecisionSource(`rule ${ruleId}: promoted leg may only declare artifactId, contentDigest and when`);
      }
    }
    const artifactId = decisionSourceIdentifier(data.promoted.artifactId, `rule ${ruleId}: promoted.artifactId`);
    const contentDigest = decisionSourceIdentifier(data.promoted.contentDigest, `rule ${ruleId}: promoted.contentDigest`);
    const approved = isJsonRecord(businessEndpoint.promotedArtifacts)
      ? businessEndpoint.promotedArtifacts[artifactId]
      : undefined;
    if (!isJsonRecord(approved) || approved.artifactId !== artifactId || approved.contentDigest !== contentDigest) {
      invalidDecisionSource(
        `rule ${ruleId}: the promoted reference does not match the sealed approved artifact ${artifactId} (BUILD identity inconsistency)`,
      );
    }
    const candidate = approved.candidate;
    if (!isJsonRecord(candidate) || !isJsonRecord(candidate.decision) || !isJsonRecord(candidate.event)
      || typeof candidate.decision.outcome !== 'string' || typeof candidate.event.type !== 'string') {
      invalidDecisionSource(`rule ${ruleId}: approved artifact ${artifactId} carries no structured decision candidate`);
    }
    try {
      canonicalizeJson(candidate);
    } catch (error) {
      invalidDecisionSource(`rule ${ruleId}: approved artifact ${artifactId} candidate is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const when = snapshotDecisionSourcePredicate(data.promoted.when, `rule ${ruleId}: promoted.when`);
    promoted = { artifactId, contentDigest, when, candidate: snapshotJson(candidate) };
  }

  // Bounded harness fallback leg: ONE trusted ModelPort turn through the
  // sealed composite model-decision surface, reached only when every
  // earlier leg missed.
  let harness;
  if (data.harness !== undefined) {
    if (!isJsonRecord(data.harness)) invalidDecisionSource(`rule ${ruleId}: harness leg must be an object`);
    for (const key of Object.keys(data.harness)) {
      if (key !== 'modelOperation') invalidDecisionSource(`rule ${ruleId}: harness leg may only declare modelOperation`);
    }
    const modelOperation = decisionSourceIdentifier(data.harness.modelOperation, `rule ${ruleId}: harness.modelOperation`);
    harness = { modelOperation };
  }

  if (ruleLeg === undefined && promoted === undefined && harness === undefined) {
    invalidDecisionSource(`rule ${ruleId}: a decision-source rule must declare at least one resolver leg (rule/promoted/harness)`);
  }

  const snapshot = {
    id: data.id,
    decisionId,
    payloadFromInput,
    ruleLeg,
    cacheDeps,
    promoted,
    harness,
    declaration: snapshotJson(body),
  };
  deepFreezePreparedData(snapshot);
  return snapshot;
}

/** Wire every decision-source rule of the Business policy (createOccurrenceRuntime only). */
function wireDecisionSourceRules(businessEndpoint, sha256) {
  const registry = new WeakMap();
  let count = 0;
  for (const [ruleId, rule] of Object.entries(businessEndpoint.rules ?? {})) {
    if (!isJsonRecord(rule) || rule.kind !== 'decision-source') continue;
    registry.set(rule, snapshotDecisionSourceRule(rule, ruleId, businessEndpoint, sha256));
    count += 1;
  }
  // WeakMap has no .size: carry a bounded explicit count for fail-fast load gates.
  return { registry, count };
}

/**
 * Trusted per-step evidence: exactly the shape the Host-bound resolver
 * mints for ONE physically observed bound-port invocation. Anything else —
 * a different count, extra fields, a model-free source — fails closed.
 */
function trustedStepEvidence(envelope) {
  const evidence = envelope.modelCallEvidence;
  if (envelope.source === 'host-model-port' && envelope.llmAvoided === false && isJsonRecord(evidence)) {
    const keys = Object.keys(evidence).sort().join(',');
    if (evidence.status === 'measured' && evidence.count === 1 && evidence.scope === BOUND_PORT_EVIDENCE_SCOPE && keys === 'count,scope,status') {
      return 'measured';
    }
    if (evidence.status === 'unmeasured' && keys === 'status') {
      return 'unmeasured';
    }
  }
  throw new CentralAdmissionError(
    'CONTINUATION_MODEL_EVIDENCE_INVALID',
    'a continuation step did not carry the trusted single-invocation evidence of the Host-bound resolver; no decision is admitted',
  );
}

/**
 * K aggregate over completed turns. A discarded in-flight turn may have
 * reached the physical port without returning evidence, so the aggregate
 * can then no longer be an exact count: it degrades to `unmeasured`.
 */
function aggregateModelCallEvidence(stepEvidence, inFlightTurnDiscarded) {
  if (inFlightTurnDiscarded || stepEvidence.length === 0 || stepEvidence.some((status) => status !== 'measured')) {
    return { status: 'unmeasured' };
  }
  return { status: 'measured', count: stepEvidence.length, scope: BOUND_PORT_EVIDENCE_SCOPE };
}

/**
 * Admission-side normalization of resolver model-call evidence (B2). Only a
 * structured trusted shape is carried; absence is `unsupported`; a
 * malformed structured claim fails closed.
 */
function admissionModelCallEvidence(evidence) {
  if (evidence === undefined) return { status: 'unsupported' };
  if (isJsonRecord(evidence)) {
    const keys = Object.keys(evidence).sort().join(',');
    if (evidence.status === 'measured' && Number.isSafeInteger(evidence.count) && evidence.count >= 0
      && typeof evidence.scope === 'string' && keys === 'count,scope,status') {
      return { status: 'measured', count: evidence.count, scope: evidence.scope };
    }
    if ((evidence.status === 'unmeasured' || evidence.status === 'unsupported') && keys === 'status') {
      return { status: evidence.status };
    }
  }
  throw new CentralAdmissionError(
    'ADMISSION_MODEL_EVIDENCE_INVALID',
    'resolver model-call evidence must be a structured measured/unmeasured/unsupported record; no decision is admitted',
  );
}

/**
 * Request-scoped cancellation latch (B3). The signal is H-owned (the
 * authenticated gateway's AbortController); the latch state is K-owned:
 * open → cancelled, or open → admitting (closed for good once admission
 * starts). Without a control the latch never cancels.
 */
function createCancellationLatch(control) {
  if (control === undefined) {
    return { signal: undefined, get cancelled() { return false; }, closeForAdmission() { return true; }, dispose() {} };
  }
  const signal = isJsonRecord(control) ? control.signal : undefined;
  if (
    signal === null
    || typeof signal !== 'object'
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw new CentralAdmissionError(
      'OCCURRENCE_CONTROL_INVALID',
      'an occurrence control must carry a request-scoped cancellation signal {aborted, addEventListener, removeEventListener}',
    );
  }
  let state = signal.aborted ? 'cancelled' : 'open';
  const onAbort = () => {
    if (state === 'open') state = 'cancelled';
  };
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    signal,
    get cancelled() {
      if (state === 'open' && signal.aborted === true) state = 'cancelled';
      return state === 'cancelled';
    },
    closeForAdmission() {
      if (this.cancelled) return false;
      state = 'admitting';
      return true;
    },
    dispose() {
      signal.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * The ONLY continuation query executor: a K-owned, read-only projection of
 * the instance context, re-read through the Host document port and attested
 * at exactly the lane's stateRevision. Ordinary failures (input not allowed
 * by the descriptor, absent context key) become observations; read material
 * that is not canonical, carries no version, or violates the sealed output
 * contract is a terminal query-output failure.
 */
async function executeContinuationRead(descriptor, callInput, read) {
  let selected = Object.keys(descriptor.fields);
  let input;
  try {
    input = canonicalizeJson(callInput);
  } catch {
    return { ok: false, code: 'QUERY_INPUT_INVALID' };
  }
  if (!isJsonRecord(input) || Object.keys(input).some((key) => key !== 'fields')) {
    return { ok: false, code: 'QUERY_INPUT_INVALID' };
  }
  if (hasOwn(input, 'fields')) {
    const fields = input.fields;
    if (!Array.isArray(fields) || fields.length === 0 || new Set(fields).size !== fields.length
      || !fields.every((name) => typeof name === 'string' && hasOwn(descriptor.fields, name))) {
      return { ok: false, code: 'QUERY_INPUT_INVALID' };
    }
    selected = [...fields];
  }

  const doc = await read.docs.get(instanceDocKey(read.target));
  let material;
  try {
    material = canonicalizeJson(doc);
  } catch {
    return { invalid: 'read material is not canonical JSON (accessor, cycle or non-JSON value)' };
  }
  if (!isJsonRecord(material) || !isJsonRecord(material.value)) {
    return { invalid: 'read material carries no instance document' };
  }
  const value = material.value;
  if (!Number.isSafeInteger(material.revision) || !Number.isSafeInteger(value.stateRevision)) {
    return { invalid: 'read material carries no instance version' };
  }
  if (!isJsonRecord(value.address) || !workflowAddressesEqual(value.address, read.target)) {
    return { invalid: 'read material addresses a different workflow instance' };
  }
  if (material.revision !== value.stateRevision || value.stateRevision !== read.stateRevision) {
    return { stale: true };
  }
  const context = isJsonRecord(value.state) ? value.state.context : undefined;
  if (!isJsonRecord(context)) {
    return { invalid: 'read material carries no instance context' };
  }
  const output = {};
  for (const outputName of selected) {
    const contextKey = descriptor.fields[outputName];
    if (!hasOwn(context, contextKey)) return { ok: false, code: 'QUERY_SOURCE_MISSING' };
    const item = context[contextKey];
    if (hasOwn(descriptor.outputSchema, outputName) && jsonTypeOf(item) !== descriptor.outputSchema[outputName]) {
      return { invalid: `read output ${outputName} violates its sealed output type ${descriptor.outputSchema[outputName]}` };
    }
    output[outputName] = item;
  }
  return { ok: true, output, stateRevision: value.stateRevision };
}

/**
 * The K-owned bounded continuation loop (one occurrence, inside its lane).
 * Returns either {resolved} for central admission or {terminal} — never
 * writes State, Journal or Effect itself.
 */
async function runModelContinuation(run) {
  const { policy, sdkEndpoint, latch, requestInput } = run;
  const observations = [];
  const dependencies = [];
  const dependencyKeys = new Set();
  const stepEvidence = [];
  let steps = 0;
  let queries = 0;
  let inFlightTurnDiscarded = false;

  const evidence = () => ({
    source: 'host-model-port',
    llmAvoided: false,
    modelCallEvidence: aggregateModelCallEvidence(stepEvidence, inFlightTurnDiscarded),
    continuation: {
      maxSteps: policy.maxSteps,
      steps,
      queries,
      dependencies: dependencies.map((dependency) => ({ ...dependency })),
    },
  });
  const terminal = (code, extras = {}) => ({ terminal: { code, step: steps, ...extras }, evidence: evidence() });
  const control = latch.signal === undefined ? undefined : { signal: latch.signal };

  for (;;) {
    if (latch.cancelled) return terminal('CANCELLED');
    if (steps >= policy.maxSteps) return terminal('MAX_STEPS_EXHAUSTED');
    steps += 1;
    const modelInput = {
      request: requestInput,
      step: steps,
      maxSteps: policy.maxSteps,
      capabilities: [...policy.advertisedCapabilities],
      observations: observations.map((observation) => canonicalizeJson(observation)),
    };

    let envelope;
    try {
      envelope = await sdkEndpoint.invokeStep(policy.declaration, modelInput, {}, control);
    } catch (error) {
      if (latch.cancelled) {
        inFlightTurnDiscarded = true;
        return terminal('CANCELLED', { inFlightTurnDiscarded: true });
      }
      throw error;
    }
    if (!isJsonRecord(envelope) || (envelope.kind !== 'query' && envelope.kind !== 'final')) {
      throw new CentralAdmissionError('CONTINUATION_STEP_INVALID', 'the step surface returned no query/final envelope');
    }
    stepEvidence.push(trustedStepEvidence(envelope));
    // Late result: a turn that completes after cancellation is discarded.
    if (latch.cancelled) return terminal('CANCELLED', { lateResultDiscarded: true });

    if (envelope.kind === 'final') {
      const structuredDecision = envelope.structuredDecision;
      const outcome = isJsonRecord(structuredDecision) && isJsonRecord(structuredDecision.decision) ? structuredDecision.decision.outcome : undefined;
      const eventType = isJsonRecord(structuredDecision) && isJsonRecord(structuredDecision.event) ? structuredDecision.event.type : undefined;
      if (!policy.allowedOutcomes.includes(outcome)) return terminal('FINAL_OUTCOME_NOT_ALLOWED');
      if (!policy.allowedEvents.includes(eventType)) return terminal('FINAL_EVENT_NOT_ALLOWED');
      return {
        resolved: {
          kind: 'model-continuation',
          structuredDecision,
          provenance: envelope.provenance,
          cacheDisposition: { read: 'disabled' },
          telemetry: [],
          ...evidence(),
        },
      };
    }

    const call = envelope.call;
    const capabilityId = isJsonRecord(call) ? call.capabilityId : undefined;
    if (typeof capabilityId !== 'string') {
      throw new CentralAdmissionError('CONTINUATION_STEP_INVALID', 'a query envelope carries no capabilityId');
    }
    const descriptor = hasOwn(policy.capabilities, capabilityId) ? policy.capabilities[capabilityId] : undefined;
    if (descriptor === undefined) return terminal('UNKNOWN_CAPABILITY', { capabilityId });
    if (descriptor.mode !== 'read') return terminal('MUTATION_CAPABILITY_FORBIDDEN', { capabilityId });

    queries += 1;
    const result = await executeContinuationRead(descriptor, call.input, run.read);
    if (latch.cancelled) return terminal('CANCELLED', { lateReadDiscarded: true });
    if (result.invalid !== undefined) return terminal('QUERY_OUTPUT_INVALID', { capabilityId });
    if (result.stale === true) return terminal('QUERY_SOURCE_STALE', { capabilityId });
    if (result.ok) {
      observations.push({ step: steps, capabilityId, ok: true, output: result.output });
      const dependency = {
        capabilityId,
        source: 'instance-context',
        workflowInstanceId: run.read.workflowInstanceId,
        stateRevision: result.stateRevision,
      };
      const key = canonicalJsonStringify(dependency);
      if (!dependencyKeys.has(key)) {
        dependencyKeys.add(key);
        dependencies.push(dependency);
      }
    } else {
      observations.push({ step: steps, capabilityId, ok: false, error: { code: result.code } });
    }
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
    decisionReceiptAppends: 0,
    decisionCacheWrites: 0,
    decisionCacheWriteFailures: 0,
    mutationObservationReads: 0,
    promotedPins: 0,
    turnDispositions: 0,
    turnAdmissionReplays: 0,
    turnDispositionReplays: 0,
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
  // [#1005 D3-K] Same trusted boundary: every declared state-context
  // projection is validated and frozen before any instance can exist.
  const contextProjections = wireAdmissionContextProjections(businessEndpoint);
  // [#1003 FR07-KH2] Same trusted boundary, same discipline: every harness
  // rule is validated and frozen here, before any instance can exist.
  const continuationPolicies = wireContinuationPolicies(businessEndpoint);
  // [#1003 FR08 SD1/SD2 + NF05] Same trusted boundary: every compiled
  // semantic-decision rule has its pinned declarationDigest verified and its
  // shape validated ONCE here; a stale/substituted/malformed declaration
  // fails the load typed before any instance can exist.
  const semanticDecisionRules = wireSemanticDecisionRules(businessEndpoint, sha256);
  // [#1003 NF06] Same trusted boundary: every intent-declared receiptPolicy
  // is shape-validated and frozen here, before any instance can exist.
  const decisionReceiptPolicies = wireDecisionReceiptPolicies(businessEndpoint);
  // [#1003 FR08 general + FR09 + FR12] Same trusted boundary: every
  // decision-source rule is digest-verified, shape-validated and frozen
  // here before any instance can exist. The retained S decision-source
  // semantics must be exposed by the selected Standard SDK for any wired
  // rule — no silent degradation to a different engine.
  const { registry: decisionSourceRules, count: decisionSourceRuleCount } = wireDecisionSourceRules(businessEndpoint, sha256);
  if (decisionSourceRuleCount > 0 && (
    typeof sdkEndpoint?.resolveDecisionSource !== 'function'
    || typeof sdkEndpoint?.selectPromotedChild !== 'function'
    || typeof sdkEndpoint?.checkEvidenceApplicability !== 'function'
  )) {
    throw new CentralAdmissionError(
      'DECISION_SOURCE_SDK_ENDPOINT_UNAVAILABLE',
      'the Business policy declares decision-source rules but the selected Standard SDK exposes no retained decision-source endpoints (resolveRetainedDecision / selectRetainedPromotedChild / checkRetainedEvidenceApplicability)',
    );
  }
  // [#1003 FR12] The per-policy decision-scope identity exact-cache records
  // are pinned to: the exact Business package + policy + governance
  // semantics, through the SAME synchronous Host sha256 port as the wiring
  // digests. The retained S evidence-applicability helper validates its
  // package/baseline fields with the bounded-identifier grammar, so the
  // scope is encoded identifier-safely (policyId + a letter-prefixed
  // digest); a policy whose policyId is not identifier-shaped cannot
  // declare cacheable decision-source rules. A cached record from any
  // other scope is never applicable.
  const decisionScopeDigest = `decision-scope-v1:${sha256.digestUtf8(canonicalJsonStringify({
    packageId: businessEndpoint.packageId,
    policyId: businessEndpoint.policyId,
    governanceSemantics: businessEndpoint.governanceSemantics ?? null,
  }))}`;
  const decisionScopePackage = typeof businessEndpoint.policyId === 'string'
    && DECISION_SOURCE_IDENTIFIER.test(businessEndpoint.policyId)
    ? businessEndpoint.policyId
    : undefined;
  if (decisionSourceRuleCount > 0 && decisionScopePackage === undefined) {
    throw new CentralAdmissionError(
      'DECISION_SOURCE_INVALID',
      'a Business policy that declares decision-source rules must carry a bounded-identifier policyId for the retained evidence-applicability scope',
    );
  }

  /**
   * [#1003 FR08 general] Persist ONE exact-cache record through the Host
   * true-CAS port — the physical store has no unconditional writes, so the
   * write is exactly one of create (mustBeAbsent) or CAS
   * (mustMatchRevision at the just-read revision), like every other
   * Kernel-owned durable record. The key is content-addressed by the
   * instance + decision + canonical input + dependency material, so an
   * overwrite can only carry newer admitted truth for the exact same
   * lookup; any lost race is a bounded observation (the cache is an
   * optimization over the durable admission, never an authority).
   */
  async function writeDecisionCacheRecord(key, record) {
    let envelope;
    try {
      envelope = await docs.get(key);
    } catch {
      envelope = undefined;
    }
    const existing = isJsonRecord(envelope) ? envelope : undefined;
    if (
      existing !== undefined
      && isJsonRecord(existing.value)
      && existing.value.writtenAtTurn === record.writtenAtTurn
    ) {
      return; // idempotent same-turn replay of the exact admitted record
    }
    if (existing === undefined) {
      try {
        await docs.put(key, record, { mustBeAbsent: true });
        counters.decisionCacheWrites += 1;
        return;
      } catch {
        // lost the create race — fall through to the CAS re-read
      }
    }
    // Cache maintenance happens after the authoritative business commit.
    // A failed re-read must NEVER reject an already admitted business ACK.
    let current;
    try {
      current = await docs.get(key);
    } catch {
      counters.decisionCacheWriteFailures += 1;
      return;
    }
    if (!isJsonRecord(current)) {
      counters.decisionCacheWriteFailures += 1;
      return;
    }
    try {
      await docs.put(key, record, { mustMatchRevision: current.revision });
      counters.decisionCacheWrites += 1;
    } catch {
      counters.decisionCacheWriteFailures += 1;
    }
  }

  /**
   * [#1003 FR09] Durable pin-before-execution in the generic Host document
   * store (create-if-absent CAS). Re-pinning the EXACT approved artifact is
   * idempotent; a different digest under the same pin slot refuses typed —
   * the approved child can never drift.
   */
  async function commitDecisionSourcePin(pinKey, pinRecord) {
    try {
      await docs.put(pinKey, pinRecord, { mustBeAbsent: true });
      counters.promotedPins += 1;
      return;
    } catch {
      const envelope = await docs.get(pinKey);
      const existing = isJsonRecord(envelope) ? envelope.value : undefined;
      if (isJsonRecord(existing) && existing.artifactId === pinRecord.artifactId
        && existing.contentDigest === pinRecord.contentDigest) {
        return;
      }
      throw new CentralAdmissionError(
        'DECISION_SOURCE_PIN_CONFLICT',
        `the promoted-child pin ${pinKey} is already committed for a different artifact digest; the approved child cannot drift`,
      );
    }
  }

  /**
   * [#1003 FR08 general + FR09 + FR12] The K-owned decision-source
   * composition for ONE turn (inside its lane, before central admission).
   *
   * The legs are assembled lazily in the retained frozen order so an
   * earlier match never consults a later source: the deterministic rule
   * leg first, then the exact-cache leg (FR08 currentness: the lookup key
   * pins the current dependency material; FR12 applicability: the retained
   * S evidence check plus promoted-producer invalidation gate every hit),
   * then the governed promoted leg (FR09: sealed approval identity, S
   * eligibility, durable K pin before the candidate proceeds). S's
   * resolveRetainedDecision is the ONLY ordering authority. Only when every
   * declared cheap leg missed does the bounded harness fallback run —
   * exactly ONE trusted ModelPort turn through the sealed composite
   * model-decision surface with its honest measured(1) evidence.
   *
   * Returns {resolved, pendingWrite} for the UNCHANGED central admission,
   * or {terminal, evidence} for a typed zero-effect stop. The exact-cache
   * write is deferred: it happens only after the authoritative state
   * commit, so a candidate denied by any admission gate is never cached.
   */
  async function resolveDecisionSourceTurn({ wired, request, context, control, target, workflowInstanceId, latch }) {
    const turnId = deriveDurableControlTurnId(target, occurrenceTurnOf(request));
    let canonicalInput;
    try {
      canonicalInput = canonicalizeJson(request.input ?? {});
    } catch (error) {
      throw new CentralAdmissionError(
        'DECISION_SOURCE_INPUT_INVALID',
        `decision-source input must be canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!isJsonRecord(canonicalInput)) {
      throw new CentralAdmissionError('DECISION_SOURCE_INPUT_INVALID', 'decision-source input must be a JSON object');
    }
    const predicateInput = () => prepareDomainPredicateEvaluationInput({
      context,
      event: { type: 'decision-source-input', payload: canonicalInput },
    });

    // ---- current dependency material (exact-cache currentness) ----
    let dependencies;
    let cacheKey;
    if (wired.cacheDeps !== undefined) {
      dependencies = {};
      for (const field of wired.cacheDeps) {
        const value = context[field];
        if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
          throw new CentralAdmissionError(
            'DECISION_SOURCE_DEPENDENCY_INVALID',
            `decision ${wired.decisionId} dependency field ${field} is not a bounded revision string`,
          );
        }
        dependencies[field] = value === undefined ? '' : value;
      }
      cacheKey = `${DECISION_CACHE_PREFIX}${workflowInstanceId}:${wired.decisionId}`
        + `:${sha256.digestUtf8(canonicalJsonStringify(canonicalInput))}`
        + `:${sha256.digestUtf8(canonicalJsonStringify(dependencies))}`;
    }

    const observations = {};
    const legMissed = (name) => observations[name] === undefined || observations[name].status === 'miss';
    let cacheRead = 'disabled';
    let promotedArtifact;
    let harnessEnvelope;

    // ---- deterministic rule leg ----
    if (wired.ruleLeg !== undefined) {
      let projectable = true;
      const payload = {};
      for (const [payloadKey, inputKey] of Object.entries(wired.payloadFromInput)) {
        if (!hasOwn(canonicalInput, inputKey)) {
          projectable = false;
          break;
        }
        payload[payloadKey] = canonicalInput[inputKey];
      }
      if (projectable && evaluateDomainPredicate(wired.ruleLeg.when, predicateInput())) {
        observations.rule = {
          status: 'match',
          candidate: {
            decision: { outcome: wired.ruleLeg.outcome },
            event: { type: wired.ruleLeg.eventType, payload },
          },
        };
      } else {
        observations.rule = { status: 'miss' };
      }
    }

    // ---- exact-cache leg (FR08 currentness + FR12 applicability) ----
    if (wired.cacheDeps !== undefined && legMissed('rule')) {
      cacheRead = 'miss';
      let record;
      try {
        const envelope = await docs.get(cacheKey);
        record = isJsonRecord(envelope) ? envelope.value : undefined;
      } catch {
        record = undefined;
      }
      if (isJsonRecord(record) && isJsonRecord(record.candidate) && isJsonRecord(record.provenance)) {
        let applicable = true;
        try {
          sdkEndpoint.checkEvidenceApplicability(
            { packageId: record.provenance.packageId, baselineDigest: record.provenance.baselineDigest },
            { packageId: decisionScopePackage, baselineDigest: decisionScopeDigest },
          );
        } catch {
          applicable = false;
        }
        // Producer invalidation: a cached decision produced by a promoted
        // artifact is only current while that exact artifact is still the
        // sealed approval and not revoked — a retired producer can never
        // replay its old result through the cache.
        if (applicable && isJsonRecord(record.producedBy) && record.producedBy.kind === 'promoted-artifact') {
          const approved = isJsonRecord(businessEndpoint.promotedArtifacts)
            ? businessEndpoint.promotedArtifacts[record.producedBy.artifactId]
            : undefined;
          if (!isJsonRecord(approved) || approved.contentDigest !== record.producedBy.contentDigest
            || approved.revoked === true) {
            applicable = false;
          }
        }
        if (applicable) {
          observations['exact-cache'] = { status: 'match', exactCurrent: true, candidate: record.candidate };
          cacheRead = 'hit';
        }
      }
    }

    // ---- governed promoted-child leg (FR09) ----
    if (wired.promoted !== undefined && legMissed('rule') && legMissed('exact-cache')) {
      if (evaluateDomainPredicate(wired.promoted.when, predicateInput())) {
        const approved = businessEndpoint.promotedArtifacts[wired.promoted.artifactId];
        const approvedView = {
          artifactId: approved.artifactId,
          contentDigest: approved.contentDigest,
          ...(approved.revoked !== undefined ? { revoked: approved.revoked } : {}),
          ...(approved.applicable !== undefined ? { applicable: approved.applicable } : {}),
          ...(approved.compatible !== undefined ? { compatible: approved.compatible } : {}),
        };
        const requested = { artifactId: wired.promoted.artifactId, contentDigest: wired.promoted.contentDigest };
        let child;
        try {
          child = sdkEndpoint.selectPromotedChild({ requested, approved: approvedView, pinCommitted: false });
        } catch (error) {
          if (!(isJsonRecord(error) && error.code === 'SDK_CHILD_PIN_REQUIRED')) throw error;
        }
        if (child === undefined) {
          const pinKey = `${PROMOTED_PIN_PREFIX}${workflowInstanceId}:${wired.decisionId}`;
          await commitDecisionSourcePin(pinKey, {
            artifactId: requested.artifactId,
            contentDigest: requested.contentDigest,
            pinnedAtTurn: turnId,
            pinnedAt: clock(),
          });
          sdkEndpoint.selectPromotedChild({ requested, approved: approvedView, pinCommitted: true });
        }
        observations['promoted-subworkflow'] = {
          status: 'match',
          artifactCurrent: true,
          candidate: wired.promoted.candidate,
        };
        promotedArtifact = { kind: 'promoted-artifact', artifactId: requested.artifactId, contentDigest: requested.contentDigest };
      } else {
        observations['promoted-subworkflow'] = { status: 'miss' };
      }
    }

    // ---- S selection over the declared frozen ordering ----
    let selected;
    try {
      selected = sdkEndpoint.resolveDecisionSource({ decisionId: wired.decisionId, observations });
    } catch (error) {
      if (!(wired.harness !== undefined && isJsonRecord(error) && error.code === 'SDK_DECISION_HARNESS_UNCONFIGURED')) {
        throw error;
      }
      selected = undefined;
    }

    // ---- bounded harness fallback: exactly ONE trusted ModelPort turn ----
    if (selected === undefined) {
      const declaration = { kind: 'model-decision', id: `${wired.id}:harness`, modelOperation: wired.harness.modelOperation };
      try {
        harnessEnvelope = await sdkEndpoint.interpret(declaration, canonicalInput, context, control);
      } catch (error) {
        if (latch.cancelled) {
          return {
            terminal: { code: 'CANCELLED', step: 1, inFlightTurnDiscarded: true },
            evidence: { modelCallEvidence: { status: 'unmeasured' } },
          };
        }
        throw error;
      }
      if (!isJsonRecord(harnessEnvelope) || !isJsonRecord(harnessEnvelope.structuredDecision)) {
        throw new CentralAdmissionError(
          'DECISION_SOURCE_MODEL_EVIDENCE_INVALID',
          'the harness fallback envelope carries no structured decision; no decision is admitted',
        );
      }
      try {
        trustedStepEvidence(harnessEnvelope);
      } catch (error) {
        throw new CentralAdmissionError(
          'DECISION_SOURCE_MODEL_EVIDENCE_INVALID',
          `the harness fallback did not carry the trusted single-invocation evidence of the Host-bound resolver: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      selected = sdkEndpoint.resolveDecisionSource({
        decisionId: wired.decisionId,
        observations: {
          ...observations,
          'harness-machine': { status: 'match', candidate: harnessEnvelope.structuredDecision },
        },
      });
    }

    const source = selected.selectedSource;
    const resolved = {
      structuredDecision: selected.candidate,
      source,
      llmAvoided: source !== 'harness-machine',
      modelCallEvidence: source === 'harness-machine'
        ? harnessEnvelope.modelCallEvidence
        : { status: 'measured', count: 0, scope: BOUND_PORT_EVIDENCE_SCOPE },
      cacheDisposition: { read: cacheRead },
      telemetry: [],
    };
    // A cache-hit turn writes NOTHING back: the row already carries the
    // original admitted producer record (its source lineage and producedBy
    // identity are the durable ordering truth — relabeling them
    // 'exact-cache' would erase the producer).
    const pendingWrite = wired.cacheDeps === undefined || source === 'exact-cache' ? undefined : {
      key: cacheKey,
      record: {
        version: 1,
        decisionId: wired.decisionId,
        source,
        candidate: selected.candidate,
        provenance: {
          packageId: decisionScopePackage,
          baselineDigest: decisionScopeDigest,
          dependencies,
        },
        ...(promotedArtifact !== undefined && source === 'promoted-subworkflow' ? { producedBy: promotedArtifact } : {}),
        writtenAtTurn: turnId,
      },
    };
    return { resolved, pendingWrite };
  }

  function continuationPolicyFor(rule) {
    const wired = isJsonRecord(rule) ? continuationPolicies.get(rule) : undefined;
    if (wired !== undefined) return wired;
    if (isJsonRecord(rule) && rule.kind === 'model-decision' && hasOwn(rule, 'harness')) {
      throw new CentralAdmissionError(
        'CONTINUATION_DECLARATION_UNVALIDATED',
        'a harness model-decision rule that was never wired at the trusted load boundary cannot run',
      );
    }
    return undefined;
  }

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

  /**
   * [#1003 NF06 OBSERVATIONAL_OPTIONAL] The K-owned authoritative append of
   * ONE data-only decision receipt at the exact durable control turn key,
   * invoked strictly AFTER the admitted business commit. K alone decides
   * when/why a record may exist; S supplies only the redacted data-only
   * projection of the verified outcome; the generic Host CAS create is the
   * only persistence. Every failure is a SEPARATE typed observation outcome:
   * nothing here may throw out of the occurrence, rewrite the admitted
   * truth, or claim 'recorded' without a physically accepted create. A
   * create that loses to an existing record re-reads it INSIDE this
   * boundary: the re-read and the identity comparison are themselves
   * bounded — a Host read failure during the replay check is a typed
   * not_recorded observation, never a business failure [#1055 R1 P1-02];
   * the SAME turn's own identity (turn + declaration + projected record,
   * minus the volatile recordedAt) is an idempotent replay; anything else is
   * a typed conflict that never overwrites the stored record. The envelope
   * freezes the recording intent's reader scope, so every read authorizes
   * against THIS record's own scope — never the union of all policies'
   * roles [#1055 R1 P1-01].
   */
  async function appendObservationalDecisionReceipt({ request, target, workflowInstanceId, binding, declaration, resolved }) {
    const receiptPolicy = decisionReceiptPolicies.get(request.intentType);
    if (receiptPolicy === undefined || receiptPolicy.durability !== 'observational-optional') {
      return undefined;
    }
    if (typeof sdkEndpoint?.projectDecisionReceipt !== 'function') {
      return {
        status: 'not_recorded',
        error: { code: 'SDK_DECISION_RECEIPT_PROJECTION_UNAVAILABLE', message: 'the selected Standard SDK exposes no decision-receipt projection endpoint' },
      };
    }
    const turnId = deriveDurableControlTurnId(target, occurrenceTurnOf(request));
    const declarationIdentity = isJsonRecord(declaration)
      ? {
        ruleId: typeof declaration.id === 'string' ? declaration.id : binding.ruleId,
        ...(typeof declaration.declarationDigest === 'string' ? { declarationDigest: declaration.declarationDigest } : {}),
      }
      : { ruleId: binding.ruleId };
    let projected;
    try {
      projected = await sdkEndpoint.projectDecisionReceipt({
        turnId,
        workflowInstanceId,
        declaration: declarationIdentity,
        resolved,
        durability: 'observational-optional',
      });
    } catch (error) {
      return {
        status: 'not_recorded',
        error: {
          code: typeof error?.code === 'string' ? error.code : 'DECISION_RECEIPT_PROJECTION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    const envelope = {
      kernelModuleSha256: moduleIdentity.moduleSha256,
      // [#1055 R1 P1-01] The per-record frozen read scope: the readerRoles of
      // THE intent that records THIS receipt, snapshotted at append time.
      // getDecisionReceipt authorizes against this scope alone — a reader
      // declared by a different intent's policy never gains authority over
      // this record, and the key alone confers no read authority.
      readerRoles: snapshotJson(receiptPolicy.readerRoles ?? []),
      record: snapshotJson({
        projected,
        occurrence: { messageId: request.messageId, workflowInstanceId },
        attribution: attribution(),
        recordedAt: clock(),
      }),
    };
    counters.decisionReceiptAppends += 1;
    const key = decisionReceiptDocKey(turnId);
    try {
      await docs.put(key, envelope, { mustBeAbsent: true });
      return { status: 'recorded', receiptKey: key, durability: 'observational-optional' };
    } catch (error) {
      if (typeof error === 'object' && error !== null && error.code === 'HOST_KEY_EXISTS') {
        // [#1055 R1 P1-02] The re-read and the identity comparison live
        // INSIDE the optional observation boundary: a Host read failure,
        // an unreadable winner or a canonicalization exception during the
        // replay check is a separate typed not_recorded outcome — it can
        // never fail the already-committed business ACK.
        try {
          const winner = await docs.get(key);
          if (winner !== null && isJsonRecord(winner.value) && decisionReceiptIdentity(winner.value) === decisionReceiptIdentity(envelope)) {
            return { status: 'recorded', receiptKey: key, durability: 'observational-optional', idempotentReplay: true };
          }
          return {
            status: 'not_recorded',
            error: { code: 'DECISION_RECEIPT_CONFLICT', message: `a different record already occupies the decision-receipt key ${key}; the conflicting record is never overwritten` },
          };
        } catch (replayError) {
          return {
            status: 'not_recorded',
            error: {
              code: typeof replayError?.code === 'string' ? replayError.code : 'DECISION_RECEIPT_REPLAY_CHECK_FAILED',
              message: replayError instanceof Error ? replayError.message : String(replayError),
            },
          };
        }
      }
      return {
        status: 'not_recorded',
        error: {
          code: typeof error?.code === 'string' ? error.code : 'DECISION_RECEIPT_APPEND_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * [#1062 shared seam] Read the turn disposition of ONE non-message turn
   * inside the occurrence lane. An identity-matching record is an
   * idempotent replay of the already-admitted turn (zero new activity); a
   * record with a different identity under the same turn id refuses typed
   * BEFORE any admission — one source is exactly one turn, whatever intent
   * a later submission claims for it.
   */
  async function readTurnDispositionOrReplay(turnId, turn, request, target) {
    let envelope;
    try {
      envelope = await docs.get(turnDispositionDocKey(turnId));
    } catch {
      return undefined; // an unreadable disposition cannot veto the turn
    }
    if (envelope === null || !isJsonRecord(envelope.value)) return undefined;
    const stored = envelope.value;
    if (!isJsonRecord(stored.receipt) || typeof stored.identity !== 'string') return undefined;
    const identity = turnDispositionIdentity(moduleIdentity.moduleSha256, target, turn, request.intentType);
    if (stored.identity !== identity) {
      throw new CentralAdmissionError(
        'ADMISSION_TURN_DISPOSITION_CONFLICT',
        `turn ${turnId} already has a durably admitted disposition with a different identity; one source is exactly one turn`,
      );
    }
    counters.turnDispositionReplays += 1;
    const replayed = { ...stored.receipt, idempotentReplay: true };
    safeObserve(replayed);
    return replayed;
  }

  /**
   * [#1062 shared seam] Best-effort create of the turn disposition AFTER the
   * authoritative state CAS — a typed observation that never fails the
   * already-committed business ACK and never claims cross-document
   * atomicity. A create that loses to an existing record re-reads it
   * INSIDE this boundary (identical identity → idempotent; different →
   * typed conflict observation, the stored record is never overwritten).
   */
  async function writeTurnDisposition(turnId, turn, request, target, receipt) {
    const identity = turnDispositionIdentity(moduleIdentity.moduleSha256, target, turn, request.intentType);
    const envelope = {
      pinVersion: 1,
      identity,
      turn: snapshotJson(turn),
      intentType: request.intentType,
      receipt: snapshotJson(receipt),
    };
    try {
      await docs.put(turnDispositionDocKey(turnId), envelope, { mustBeAbsent: true });
      counters.turnDispositions += 1;
      return { status: 'recorded' };
    } catch (error) {
      if (typeof error === 'object' && error !== null && error.code === 'HOST_KEY_EXISTS') {
        try {
          const winner = await docs.get(turnDispositionDocKey(turnId));
          const winnerIdentity = winner !== null && isJsonRecord(winner.value)
            && typeof winner.value.identity === 'string' ? winner.value.identity : undefined;
          if (winnerIdentity === identity) {
            return { status: 'recorded', idempotentReplay: true };
          }
          return {
            status: 'conflict',
            error: { code: 'ADMISSION_TURN_DISPOSITION_CONFLICT', message: `a different admitted disposition already occupies the turn key ${String(turnId)}` },
          };
        } catch {
          // fall through to the honest not_recorded report below
        }
      }
      return {
        status: 'not_recorded',
        error: {
          code: typeof error?.code === 'string' ? error.code : 'TURN_DISPOSITION_APPEND_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * [#1066 R1 P1-B] The same-CAS admission-history replay of ONE non-message
   * turn, consulted when the independent turn-disposition record is absent
   * (the crash window between the authoritative state CAS and the
   * best-effort disposition create). The instance document committed by
   * that very state CAS carries the turn's admission identity, so the
   * re-submitted turn is recognized as already admitted HERE — with zero
   * new State/Journal/Effect activity — even where the business state
   * machine would legally re-admit it (self-loop). A different identity
   * under the same turn id refuses typed before any admission, exactly
   * like the disposition record itself does. The replay also best-effort
   * heals the lost disposition observation; the stored receipt is this
   * reconstructed replay truth, never invented business detail.
   */
  async function admittedControlTurnHistoryReplay(snapshot, turnId, turn, request, target, workflowInstanceId) {
    const history = Array.isArray(snapshot.admittedControlTurns) ? snapshot.admittedControlTurns : [];
    const admission = history.find((entry) => isJsonRecord(entry) && entry.turnId === turnId);
    if (admission === undefined) return undefined;
    const identity = turnDispositionIdentity(moduleIdentity.moduleSha256, target, turn, request.intentType);
    if (admission.identity !== identity) {
      throw new CentralAdmissionError(
        'ADMISSION_TURN_DISPOSITION_CONFLICT',
        `turn ${turnId} is already admitted in this instance's committed admission history with a different identity; one source is exactly one turn`,
      );
    }
    counters.turnAdmissionReplays += 1;
    const replay = {
      status: 'admitted',
      idempotentReplay: true,
      turnAdmission: { turnId, admittedAtStateRevision: admission.stateRevision },
      instance: outwardInstanceSnapshot(snapshot),
      occurrence: { messageId: request.messageId, workflowInstanceId },
      attribution: attribution(),
    };
    // Heal the lost disposition observation (best-effort; the outcome rides
    // the replay receipt as an independent field and never fails it).
    const healedDisposition = await writeTurnDisposition(turnId, turn, request, target, replay);
    const receipt = { ...replay, ...(healedDisposition === undefined ? {} : { turnDisposition: healedDisposition }) };
    safeObserve(receipt);
    return receipt;
  }

  /**
   * [#1003 NF06] Authorized read of ONE persisted decision receipt through
   * the same K authority that appended it. THE authorization decision is the
   * record's OWN frozen reader scope — the readerRoles of the intent that
   * recorded THIS receipt, snapshotted into the envelope at append time
   * [#1055 R1 P1-01]: a role declared by a DIFFERENT intent's receiptPolicy
   * (even one wired in the same closure) confers no authority over this
   * record, so a reader of an unprivileged intent can never read a more
   * sensitive intent's committed receipt. A coarse pre-filter (the caller
   * must hold a role declared by SOME wired receiptPolicy) refuses obvious
   * non-readers before the store is touched, but it is only a NECESSARY
   * condition — never sufficient. A record pinned to different Kernel
   * module bytes refuses typed (no silent cross-version replay), and an
   * absent record stays an honest null — it is never an error and never a
   * claim.
   */
  async function getDecisionReceipt(request) {
    if (!isJsonRecord(request)) {
      throw new CentralAdmissionError('DECISION_RECEIPT_READ_INVALID', 'a decision-receipt read must be a record {target, messageId, caller}');
    }
    const target = request.target;
    const messageId = request.messageId;
    if (!isJsonRecord(target) || typeof target.workflowId !== 'string' || typeof target.instanceKey !== 'string') {
      throw new CentralAdmissionError('DECISION_RECEIPT_READ_INVALID', 'a decision-receipt read requires a workflow target {workflowId, instanceKey}');
    }
    if (typeof messageId !== 'string' || messageId.length === 0) {
      throw new CentralAdmissionError('DECISION_RECEIPT_READ_INVALID', 'a decision-receipt read requires a non-empty messageId');
    }
    const caller = isJsonRecord(request.caller) ? request.caller : { role: 'anonymous' };
    const callerRoles = Array.isArray(caller.roles) && caller.roles.every((role) => typeof role === 'string')
      ? caller.roles
      : typeof caller.role === 'string' ? [caller.role] : [];
    // Coarse pre-filter only (necessary, never sufficient): refuse callers
    // holding no declared receipt-reader role at all before the store is
    // touched. The AUTHORITATIVE gate is the per-record frozen scope below.
    const declaredAnywhere = new Set();
    for (const policy of decisionReceiptPolicies.values()) {
      for (const role of policy.readerRoles ?? []) declaredAnywhere.add(role);
    }
    if (declaredAnywhere.size === 0 || !callerRoles.some((role) => declaredAnywhere.has(role))) {
      throw new CentralAdmissionError(
        'DECISION_RECEIPT_READ_UNAUTHORIZED',
        'the authenticated caller holds none of the Business-declared decision-receipt reader roles; the record is not readable',
      );
    }
    const turnId = deriveDurableControlTurnId(target, { kind: 'message', sourceMessageId: messageId });
    const doc = await docs.get(decisionReceiptDocKey(turnId));
    if (doc === null) return null;
    const envelope = doc.value;
    if (!isJsonRecord(envelope) || envelope.kernelModuleSha256 !== moduleIdentity.moduleSha256) {
      throw new CentralAdmissionError(
        'DECISION_RECEIPT_KERNEL_MISMATCH',
        `the decision receipt of turn ${turnId} is pinned to different kernel module bytes; typed code unavailability — no silent cross-version replay`,
      );
    }
    // [#1055 R1 P1-01] The authoritative per-record gate, checked BEFORE any
    // record byte is released: the caller must hold one of the readerRoles
    // frozen into THIS envelope by the intent that recorded it. A record
    // carrying no valid frozen scope is not readable by anyone (fail closed).
    const recordScope = envelope.readerRoles;
    if (!Array.isArray(recordScope) || recordScope.length === 0 || !recordScope.every((role) => typeof role === 'string' && role.length > 0)) {
      throw new CentralAdmissionError(
        'DECISION_RECEIPT_READ_UNAUTHORIZED',
        `the decision receipt of turn ${turnId} carries no frozen reader scope; it is not readable by any caller`,
      );
    }
    if (!callerRoles.some((role) => recordScope.includes(role))) {
      throw new CentralAdmissionError(
        'DECISION_RECEIPT_READ_UNAUTHORIZED',
        `the authenticated caller holds none of the reader roles the recording intent froze for the decision receipt of turn ${turnId}; the record is not readable`,
      );
    }
    return snapshotJson(envelope.record);
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

  // [T-C, V08-ABI-C01-N7b] Observation is OPTIONAL and best-effort: a
  // failing observer never mutates the authoritative occurrence (the
  // receipt side-channel is not an authority path).
  function safeObserve(receipt) {
    if (observe === undefined) return;
    try {
      observe(receipt);
    } catch {
      // Observer failures are deliberately swallowed: the occurrence's
      // admission/journal/state/terminal facts are already durable.
    }
  }

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
    // [#1063 HF20] Genesis answers with the OUTWARD snapshot: the seeded
    // observation window is internal carrier truth, readable only through
    // the protected mutation-observation read.
    return outwardInstanceSnapshot(snapshot);
  }

  /**
   * [#1003 FR07-KH2, B3] A continuation/cancellation terminal: the occurrence
   * stopped BEFORE central admission, so no State, Journal or Effect exists.
   */
  function terminatedReceipt(request, workflowInstanceId, terminal, resolver) {
    const receipt = {
      status: 'terminated',
      terminal,
      ...(resolver === undefined ? {} : { resolver }),
      occurrence: { messageId: request.messageId, workflowInstanceId },
      attribution: attribution(),
    };
    safeObserve(receipt);
    return receipt;
  }

  /**
   * `control` is the optional protected, request-scoped occurrence control
   * the H-authenticated gateway supplies (never intent data): currently its
   * cancellation `signal` only. K owns the latch it drives.
   */
  async function submitOccurrence(request, control) {
    const latch = createCancellationLatch(control);
    try {
      return await submitOccurrenceLatched(request, latch);
    } finally {
      latch.dispose();
    }
  }

  async function submitOccurrenceLatched(request, latch) {
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
      safeObserve(receipt);
      return receipt;
    }

    // [#1003 NF06 DURABLE_MANDATORY] Feasibility gate: the frozen v0.8 Host
    // storage contract is a true-CAS SINGLE-document store with NO
    // cross-document atomic batch or coordinated recovery protocol, so the
    // state-CAS + receipt-append of one occurrence CANNOT be proven atomic
    // or crash-recoverable (the physical negative of this slice witnesses
    // the receipt append failing after the admitted business commit). A
    // separately declared mandatory receipt policy is therefore refused
    // typed BEFORE admission — zero Guard/Journal/Effect/State mutation, no
    // silent fallback to the optional best-effort mode — and reported for
    // product adjudication instead of faking a durability the Host does not
    // supply.
    const wiredReceiptPolicy = decisionReceiptPolicies.get(request.intentType);
    if (wiredReceiptPolicy !== undefined && wiredReceiptPolicy.durability === 'durable-mandatory') {
      const receipt = {
        status: 'denied',
        denial: {
          reason: 'decision-receipt-mandatory-unsupported',
          deniedBy: businessEndpoint.packageId,
          intentType: request.intentType,
          decisionReceipt: {
            policy: 'durable-mandatory',
            supported: false,
            productDecision: 'PRODUCT_DECISION_REQUIRED',
            detail: 'the v0.8 Host true-CAS document store cannot coordinate an atomic or crash-recoverable state+receipt commit; the mandatory receipt mode is refused before admission rather than silently degraded',
          },
        },
        occurrence: { messageId: request.messageId, workflowInstanceId: `${target.workflowId}:${target.instanceKey}` },
        attribution: attribution(),
      };
      safeObserve(receipt);
      return receipt;
    }

    return engine.lane.run(target, async () => {
      const workflowInstanceId = `${target.workflowId}:${target.instanceKey}`;
      // [#1003 FR07-KH2, B3] Cancelled while queued on the lane: nothing read.
      if (latch.cancelled) {
        return terminatedReceipt(request, workflowInstanceId, { code: 'CANCELLED', step: 0 });
      }
      const snapshot = await engine.getInstance(target);
      if (snapshot === null) {
        throw new WorkflowInstanceNotFoundError(target);
      }
      // Cancelled during the lane-start read: no model turn may start.
      if (latch.cancelled) {
        return terminatedReceipt(request, workflowInstanceId, { code: 'CANCELLED', step: 0 });
      }
      // [#1062 shared seam] The turn identity of this occurrence, and the
      // disposition gate for non-message durable control turns: a replay of
      // an already-admitted source returns its stored receipt here with zero
      // new State/Journal/Effect activity, and a colliding identity refuses
      // typed before any admission activity. [#1066 R1 P1-B] When the
      // disposition record itself was lost to the crash window, the
      // same-CAS admission history INSIDE the committed instance document
      // answers the same replay guarantee — the authoritative state CAS,
      // not the best-effort observation, owns the once-only truth.
      const turn = occurrenceTurnOf(request);
      const controlTurnId = turn.kind === 'message' ? undefined : deriveDurableControlTurnId(target, turn);
      if (controlTurnId !== undefined) {
        const replayed = await readTurnDispositionOrReplay(
          controlTurnId,
          turn,
          request,
          target,
        );
        if (replayed !== undefined) {
          return replayed;
        }
        const historyReplayed = await admittedControlTurnHistoryReplay(
          snapshot,
          controlTurnId,
          turn,
          request,
          target,
          workflowInstanceId,
        );
        if (historyReplayed !== undefined) {
          return historyReplayed;
        }
        // [#1066 R2] The 16-entry SAME-CAS crash backstop may evict an
        // older turn ONLY if its independent durable disposition exists.
        // Otherwise a delayed Host recovery could re-admit the evicted
        // turn. Refuse a NEW turn before any admission/effect until the
        // older missing disposition is healed by replaying its source.
        const history = Array.isArray(snapshot.admittedControlTurns) ? snapshot.admittedControlTurns : [];
        if (history.length >= MAX_ADMITTED_CONTROL_TURN_HISTORY) {
          const oldest = history[0];
          if (!isJsonRecord(oldest) || typeof oldest.turnId !== 'string' || typeof oldest.identity !== 'string') {
            throw new CentralAdmissionError('ADMISSION_TURN_HISTORY_INVALID', 'cannot evict an invalid committed control-turn admission');
          }
          let disposition;
          try {
            disposition = await docs.get(turnDispositionDocKey(oldest.turnId));
          } catch {
            throw new CentralAdmissionError('ADMISSION_TURN_HISTORY_EVICTION_BLOCKED', 'cannot verify the oldest admitted control turn disposition; fail closed before eviction');
          }
          if (disposition === null || !isJsonRecord(disposition.value)
            || disposition.value.identity !== oldest.identity) {
            throw new CentralAdmissionError('ADMISSION_TURN_HISTORY_EVICTION_BLOCKED', 'oldest committed control turn has no matching durable disposition; recover it before admitting another turn');
          }
        }
      }
      const context = {
        ...snapshot.state.context,
        callerRole: caller.role,
      };
      const rule = businessEndpoint.rules[binding.ruleId];
      // [#1003 FR08 SD1/SD2 + NF05] A compiled semantic-decision rule that
      // was never digest-verified/frozen at this trusted load boundary can
      // never run — no silent unbound fallback for post-wiring injected or
      // swapped declarations. The registry is keyed by object identity, so
      // `get` (not a re-read of the mutable `kind`) is what binds a rule
      // wired as semantic even if its shape was mutated after wiring.
      const wiredSemanticDecision = isJsonRecord(rule) ? semanticDecisionRules.get(rule) : undefined;
      if (wiredSemanticDecision === undefined && isJsonRecord(rule) && rule.kind === 'semantic-decision') {
        throw new CentralAdmissionError(
          'SEMANTIC_DECISION_UNVALIDATED',
          `semantic-decision rule ${String(binding.ruleId)} was never validated at the trusted load boundary; post-wiring injected declarations are refused`,
        );
      }
      // [#1003 FR08 general + FR09 + FR12] A decision-source rule that was
      // never digest-verified/frozen at this trusted load boundary can
      // never run — same discipline as the semantic-decision wiring.
      const wiredDecisionSource = isJsonRecord(rule) ? decisionSourceRules.get(rule) : undefined;
      if (wiredDecisionSource === undefined && isJsonRecord(rule) && rule.kind === 'decision-source') {
        throw new CentralAdmissionError(
          'DECISION_SOURCE_UNVALIDATED',
          `decision-source rule ${String(binding.ruleId)} was never validated at the trusted load boundary; post-wiring injected declarations are refused`,
        );
      }
      // [#1051 R1 P1] S interprets ONLY the load-time verified frozen
      // declaration. The original rule object stays ordinary mutable policy
      // surface; an in-place mutation after wiring must not change what
      // executes — the approved meaning at load time is the meaning that
      // runs.
      const declaration = wiredSemanticDecision === undefined ? rule : wiredSemanticDecision.declaration;
      const continuation = continuationPolicyFor(declaration);
      const control = latch.signal === undefined ? undefined : { signal: latch.signal };
      let resolved;
      let decisionSourcePendingWrite;
      if (wiredDecisionSource !== undefined) {
        // [#1003 FR08 general + FR09 + FR12] The K-owned retained resolver
        // composition: S selects, K supplies the qualified observations, and
        // the selected candidate proceeds through the UNCHANGED central
        // admission below — there is no separate admission path.
        const decisionSource = await resolveDecisionSourceTurn({
          wired: wiredDecisionSource,
          request,
          context,
          control,
          target,
          workflowInstanceId,
          latch,
        });
        if (decisionSource.terminal !== undefined) {
          return terminatedReceipt(request, workflowInstanceId, decisionSource.terminal, decisionSource.evidence);
        }
        resolved = decisionSource.resolved;
        decisionSourcePendingWrite = decisionSource.pendingWrite;
      } else if (continuation !== undefined) {
        // [#1003 FR07-KH2] K-owned bounded model→query→observation→model
        // continuation over the S single-step surface; only a final
        // envelope proceeds to central admission below.
        if (typeof sdkEndpoint.invokeStep !== 'function') {
          throw new CentralAdmissionError(
            'CONTINUATION_STEP_ENDPOINT_UNAVAILABLE',
            'a harness model-decision rule requires the Host-bound Standard SDK step surface (invokeStep); none is wired',
          );
        }
        const run = await runModelContinuation({
          policy: continuation,
          sdkEndpoint,
          latch,
          requestInput: request.input,
          read: { docs, target, workflowInstanceId, stateRevision: snapshot.stateRevision },
        });
        if (run.terminal !== undefined) {
          return terminatedReceipt(request, workflowInstanceId, run.terminal, run.evidence);
        }
        resolved = run.resolved;
      } else {
        // [ABI ruling #1013@6118426531, R1 F-03] The endpoint contract is
        // "synchronous value OR Promise thereof": `await` is transparent for
        // every synchronous model-free Standard SDK endpoint (a non-Promise
        // resolves to itself), and it is what lets a Host-bound model resolver
        // route model-decision rules through its real async port-invoking
        // endpoint. [#1003 FR07-KH2] The protected control rides along so a
        // model-decision turn observes cancellation too.
        try {
          resolved = await sdkEndpoint.interpret(declaration, request.input, context, control);
        } catch (error) {
          if (latch.cancelled) {
            return terminatedReceipt(request, workflowInstanceId, { code: 'CANCELLED', step: 1, inFlightTurnDiscarded: true }, { modelCallEvidence: { status: 'unmeasured' } });
          }
          throw error;
        }
      }

      // [#1003 FR08 SD1] Declared semantic-unavailability: a typed
      // zero-effect terminal BEFORE central admission — no Guard/Admission
      // runs, no Journal record and no Effect dispatch exist, and the
      // ModelPort was never invoked (the declaration route is model-free).
      if (isJsonRecord(resolved) && resolved.semanticStatus === 'unavailable') {
        const declarationId = isJsonRecord(resolved.provenance) && typeof resolved.provenance.declarationId === 'string'
          ? { declarationId: resolved.provenance.declarationId }
          : {};
        return terminatedReceipt(request, workflowInstanceId, { code: 'SEMANTIC_UNAVAILABLE', ...declarationId }, admissionResolverEvidence(resolved));
      }

      // [#1003 FR07-KH2, B3] The final-result → admission race: the latch is
      // checked and CLOSED here, immediately before central admission. A
      // cancel observed now discards the ready result; one arriving after
      // this point can no longer split the authoritative occurrence.
      if (!latch.closeForAdmission()) {
        return terminatedReceipt(request, workflowInstanceId, { code: 'CANCELLED', lateResultDiscarded: true }, {
          modelCallEvidence: admissionModelCallEvidence(resolved?.modelCallEvidence),
          ...(resolved?.continuation === undefined ? {} : { continuation: JSON.parse(canonicalJsonStringify(resolved.continuation)) }),
        });
      }

      const definition = binding.definition ?? businessEndpoint.workflowDefinition;
      const request_shape = {
        target,
        turn,
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
        contextProjections,
        trace: counters,
      });

      if (outcome.status === 'denied') {
        const receipt = {
          status: 'denied',
          denial: outcome.denial,
          occurrence: { messageId: request.messageId, workflowInstanceId },
          attribution: attribution(),
        };
        safeObserve(receipt);
        return receipt;
      }

      const nextLifecycle = stateKindIsTerminal(definition, outcome.admitted.targetState)
        ? 'completed'
        : 'active';
      const committed = await engine.commitAcceptedTransitionInLane({
        target,
        messageId: request.messageId,
        expectedTargetSequence: snapshot.stateRevision,
        // [#1066 R1 P1-B] The non-message turn's admission identity rides
        // INSIDE the authoritative state CAS (bounded same-CAS history), so
        // a lost disposition record can never turn a crash-recovery
        // re-submission into a second State revision.
        ...(controlTurnId === undefined ? {} : {
          admittedControlTurn: {
            turnId: controlTurnId,
            identity: turnDispositionIdentity(moduleIdentity.moduleSha256, target, turn, request.intentType),
          },
        }),
        transition: (current) => ({
          nextState: {
            stateKey: outcome.admitted.targetState,
            // [#1005 D3-K] The admitted lineage projection is committed by
            // THIS state CAS write, atomically with the target state.
            context: outcome.admitted.contextProjection === undefined
              ? current.state.context
              : { ...current.state.context, ...outcome.admitted.contextProjection },
          },
          nextLifecycle,
          output: {
            transitionKey: outcome.admitted.transitionKey,
            effects: outcome.admitted.effects,
          },
        }),
      });

      // [#1003 FR08 general] The exact-cache write happens only AFTER the
      // authoritative state commit: a candidate denied by any admission
      // gate is never cached, and a write failure after the committed
      // truth is a bounded observation that never fails the ACK.
      if (decisionSourcePendingWrite !== undefined) {
        await writeDecisionCacheRecord(decisionSourcePendingWrite.key, {
          ...decisionSourcePendingWrite.record,
          writtenAt: clock(),
        });
      }

      // [#1003 NF06 OBSERVATIONAL_OPTIONAL] AFTER the admitted business
      // commit (the authoritative state CAS is already durable), the
      // K-owned decision receipt is appended as a SEPARATE best-effort
      // observation. Its typed outcome rides the occurrence receipt as an
      // independent field: the admitted business truth above is never
      // rewritten, rolled back or failed by this append.
      const decisionReceipt = await appendObservationalDecisionReceipt({
        request,
        target,
        workflowInstanceId,
        binding,
        declaration,
        resolved,
      });

      // [#1063 HF20] The committed instance projection that leaves the
      // Kernel is the OUTWARD snapshot: the observation window and the
      // control-turn admission history stay internal carrier/replay truth.
      const outwardCommitted = outwardInstanceSnapshot(committed);
      let turnDisposition;
      if (controlTurnId !== undefined) {
        turnDisposition = await writeTurnDisposition(
          controlTurnId,
          turn,
          request,
          target,
          {
            status: 'admitted',
            admitted: outcome.admitted,
            instance: outwardCommitted,
            occurrence: { messageId: request.messageId, workflowInstanceId },
            attribution: attribution(),
          },
        );
      }

      const receipt = {
        status: 'admitted',
        admitted: outcome.admitted,
        instance: outwardCommitted,
        occurrence: { messageId: request.messageId, workflowInstanceId },
        attribution: attribution(),
        ...(decisionReceipt === undefined ? {} : { decisionReceipt }),
        ...(turnDisposition === undefined ? {} : { turnDisposition }),
      };
      safeObserve(receipt);
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
    // [#1063 HF20] The outward snapshot redacts the K-only carrier fields;
    // the raw document stays the internal next-CAS/replay truth.
    return outwardInstanceSnapshot(await engine.getInstance(target));
  }

  /**
   * [#1063 HF20] Authorized read of the ordered durable mutation-observation
   * window riding the instance document. The Kernel alone validates the
   * opaque cursor against the CURRENT committed window (malformed /
   * substituted stream / beyond-watermark all fail closed typed) and owns
   * the page bytes; an absent instance answers null exactly like
   * getSnapshot — the read is neither an existence oracle nor a leak.
   */
  async function readMutationObservations(request) {
    counters.mutationObservationReads += 1;
    if (!isJsonRecord(request)) {
      throw new CentralAdmissionError('MUTATION_OBSERVATION_READ_INVALID', 'a mutation-observation read must be a record {target, afterCursor?, limit?}');
    }
    const target = request.target;
    if (!isJsonRecord(target) || typeof target.workflowId !== 'string' || target.workflowId.length === 0
      || typeof target.instanceKey !== 'string' || target.instanceKey.length === 0) {
      throw new CentralAdmissionError('MUTATION_OBSERVATION_READ_INVALID', 'a mutation-observation read requires a workflow target {workflowId, instanceKey}');
    }
    if (request.afterCursor !== undefined && (typeof request.afterCursor !== 'string' || request.afterCursor.length === 0)) {
      throw new CentralAdmissionError('MUTATION_OBSERVATION_READ_INVALID', 'afterCursor, when present, must be a non-empty string');
    }
    const raw = await engine.getInstance(target);
    if (raw === null) return null;
    if (!isHf20MutationObservationWindow(raw.mutationObservations)) {
      throw new CentralAdmissionError('WINDOW_INVALID', 'the instance carries no valid mutation-observation window; the read fails closed');
    }
    const stream = `${target.workflowId}:${target.instanceKey}`;
    return projectHf20ObservationPage(raw.mutationObservations, {
      stream,
      ...(request.afterCursor === undefined ? {} : { afterCursor: request.afterCursor }),
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    });
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
        readMutationObservations: readMutationObservations.toString(),
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
    readMutationObservations,
    getDecisionReceipt,
    getJournalRecords: () => effectJournal.getRecords(),
    getMechanismIdentity,
    businessPackageId: businessEndpoint.packageId,
  };
}
