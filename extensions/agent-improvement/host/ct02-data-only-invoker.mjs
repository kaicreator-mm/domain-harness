/**
 * DomainHarness v0.10.1 — T05 CT-02 read-only Agent Improvement Feature caller.
 *
 * A narrowly scoped, HOST-OWNED data boundary for four new Standard Feature
 * keys. This is NOT the global v10 selected facade, a Node/JS sandbox or a
 * Kernel Admission grant. T02 legitimately accepts callable dependencies via
 * its existing Host path; do not route T02 through this wrapper.
 *
 * Caller trust contract: the Host projects untrusted bytes to a validated
 * plain-data object before this API. JavaScript Proxy traps can execute during
 * introspection; no arbitrary hostile Proxy object can be safely introspected
 * with a universal "zero code execution" guarantee.
 */
const FEATURE_KEYS = new Set([
  'standard:agent-diagnostics/1',
  'standard:candidate-evaluation/1',
  'standard:experience-reuse/1',
  'standard:bounded-experiment/1',
]);

const FORBIDDEN_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', 'effectPermit', 'permit',
  'effectIntents', 'admissionFence', 'effectJournal', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'createOccurrenceRuntime',
  'submitOccurrence', 'effectHandler', 'effector', 'toolCall',
  'password', 'secret', 'privateKey', 'apiKey', 'accessToken',
  'authorization', 'credential', 'credentials',
]);

const MAX_DEPTH = 16;
const MAX_NODES = 1024;
const MAX_ARRAY = 128;
const MAX_KEYS = 128;
const MAX_STRING_CHARS = 8192;
const MAX_JSON_BYTES = 65536;

export class FeatureInputNotPlainDataError extends Error {
  constructor(reason) {
    super('FEATURE_INPUT_NOT_PLAIN_DATA');
    this.name = 'FeatureInputNotPlainDataError';
    this.code = 'FEATURE_INPUT_NOT_PLAIN_DATA';
    // Never include request/dependency values, secrets or getter exception text.
    this.reason = reason;
  }
}

function refuse(reason) {
  throw new FeatureInputNotPlainDataError(reason);
}

function checkString(value, budget) {
  if (value.length > MAX_STRING_CHARS) refuse('STRING_LIMIT');
  budget.chars += value.length;
  if (budget.chars > MAX_JSON_BYTES) refuse('TOTAL_TEXT_LIMIT');
  return value;
}

function copyPlain(value, budget, ancestors, depth) {
  budget.nodes++;
  if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) refuse('BOUNDS_EXCEEDED');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return checkString(value, budget);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refuse('NONFINITE_NUMBER');
    return value;
  }
  if (typeof value !== 'object') refuse('NON_DATA_VALUE');
  if (ancestors.has(value)) refuse('CYCLIC_INPUT');
  ancestors.add(value);
  try {
    // getPrototypeOf/ownKeys/descriptor operations CAN trigger Proxy traps.
    // This gate is intentionally for trusted-Host projected object graphs.
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype || value.length > MAX_ARRAY) refuse('ARRAY_INVALID');
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1
          || keys.some((key, i) => i < value.length
            ? key !== String(i) : key !== 'length')) refuse('ARRAY_PROPERTIES_INVALID');
      const result = [];
      for (let i = 0; i < value.length; i++) {
        const desc = Object.getOwnPropertyDescriptor(value, String(i));
        if (!desc || !Object.hasOwn(desc, 'value') || !desc.enumerable) {
          refuse('ARRAY_ACCESSOR_OR_HOLE');
        }
        result.push(copyPlain(desc.value, budget, ancestors, depth + 1));
      }
      return Object.freeze(result);
    }
    if (proto !== Object.prototype && proto !== null) refuse('OBJECT_PROTOTYPE_INVALID');
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_KEYS || keys.some(x => typeof x !== 'string')) {
      refuse('OBJECT_KEYS_INVALID');
    }
    const result = Object.create(null);
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key) || key.length > 256
          // eslint-disable-next-line no-control-regex -- intentional C0 control-character rejection
          || /[\u0000-\u001f]/.test(key)) refuse('OBJECT_KEY_NOT_DATA');
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc || !Object.hasOwn(desc, 'value') || !desc.enumerable) {
        refuse('OBJECT_ACCESSOR_OR_HIDDEN');
      }
      checkString(key, budget);
      Object.defineProperty(result, key, {
        value: copyPlain(desc.value, budget, ancestors, depth + 1),
        enumerable: true, configurable: false, writable: false,
      });
    }
    return Object.freeze(result);
  } catch (error) {
    if (error instanceof FeatureInputNotPlainDataError) throw error;
    // Exceptions thrown by a Proxy trap are never reflected to user-visible
    // errors. The Host must avoid passing raw malicious Proxies.
    refuse('OPAQUE_OR_THROWING_INPUT');
  } finally {
    ancestors.delete(value);
  }
}

function snapshot(value) {
  const budget = { nodes: 0, chars: 0 };
  const safe = copyPlain(value, budget, new WeakSet(), 0);
  // No getter/side-effect execution after the checked snapshot is built.
  const serialized = JSON.stringify(safe);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_JSON_BYTES) {
    refuse('JSON_BYTE_LIMIT');
  }
  return safe;
}

/**
 * Validate/copy BOTH data channels before invoking a selected feature.
 * The facade itself is an existing trusted Host object, never accepted from
 * arbitrary serialized request data and never serialized through snapshot().
 */
export async function invokeAgentImprovementFeature(
  facade, featureKey, request, trustedDependencies = {},
) {
  if (!FEATURE_KEYS.has(featureKey)) refuse('FEATURE_NOT_IN_ALLOWLIST');
  const safeRequest = snapshot(request);
  const safeDependencies = snapshot(trustedDependencies);
  if (!facade || typeof facade.invokeSelectedStandardFeature !== 'function') {
    refuse('FACADE_NOT_AVAILABLE');
  }
  return await facade.invokeSelectedStandardFeature(
    featureKey, safeRequest, safeDependencies,
  );
}
