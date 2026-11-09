/**
 * Standard SDK Domain Package — vnext v1.0.0 (experiment KPK-01)
 * ===============================================================
 *
 * Versioned, reusable Rule + Operation interpretation components. This
 * package owns HOW declarative rules are interpreted into structured
 * decisions; it owns NO admission, guard, journal, state or effect authority
 * (that mechanism belongs to the Kernel Domain Package) and no domain policy
 * (that belongs to Business Domain Packages).
 *
 * Kernel ABI: kpk01-sdk-abi/1 — endpoint export `interpret(rule, input,
 * context)` returning a deterministic ResolvedDecision (same evidence shape
 * consumed by the migrated v0.7 admission path: source/llmAvoided/
 * freshModelCallCount/cacheDisposition/telemetry).
 *
 * Rule component schema (sdk-rule/1, data-only — never executable):
 *   { ruleId, eventType, payloadFromInput: {<eventPayloadKey>: <inputKey>} }
 * `interpret` is deterministic and LLM-free by construction (llmAvoided is
 * reported truthfully as false with source 'harness-machine' exactly like
 * the v0.7 harness-machine resolver source, so golden comparison holds).
 */

export const MODULE_ID = 'standard-sdk@1.0.0';
export const PACKAGE_KIND = 'standard-sdk';
export const ABI_VERSION = 'kpk01-sdk-abi/1';
export const ENDPOINTS = [
  { endpointId: 'sdk:rule-interpreter', kind: 'rule-interpreter' },
];

function isPlainJson(value) {
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return Number.isFinite(value);
  if (type !== 'object') return false;
  if (Array.isArray(value)) return value.every(isPlainJson);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isPlainJson);
}

function projectPayload(rule, input) {
  const payload = {};
  const projection = rule.payloadFromInput ?? {};
  for (const [payloadKey, inputKey] of Object.entries(projection)) {
    if (typeof inputKey !== 'string' || !(inputKey in input)) {
      throw new Error(`rule ${rule.ruleId}: payload projection key ${String(inputKey)} missing from intent input`);
    }
    payload[payloadKey] = input[inputKey];
  }
  return payload;
}

/**
 * Interpret one data-only rule into a structured decision + evidence.
 * Deterministic: identical (rule, input, context) always yields the identical
 * structured decision; no model call is made and none is claimed.
 */
export function interpret(rule, input, context) {
  if (typeof rule?.ruleId !== 'string' || rule.ruleId.length === 0) {
    throw new Error('sdk rule must carry a non-empty ruleId');
  }
  if (typeof rule.eventType !== 'string' || rule.eventType.length === 0) {
    throw new Error(`rule ${rule.ruleId}: eventType must be a non-empty string`);
  }
  if (!isPlainJson(input)) {
    throw new Error(`rule ${rule.ruleId}: intent input must be plain JSON`);
  }
  if (!isPlainJson(context)) {
    throw new Error(`rule ${rule.ruleId}: evaluation context must be plain JSON`);
  }
  const payload = projectPayload(rule, input);
  return {
    source: 'harness-machine',
    structuredDecision: {
      decision: { outcome: 'decide', data: payload },
      event: { type: rule.eventType, payload },
    },
    provenance: { ruleId: rule.ruleId, sdkModule: MODULE_ID },
    freshModelCallCount: 1,
    llmAvoided: false,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}
