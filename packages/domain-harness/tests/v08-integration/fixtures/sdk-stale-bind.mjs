/**
 * NEGATIVE-ONLY synthetic Standard-SDK stub (#1013 R1 F-03 stale-bind).
 * =====================================================================
 *
 * This fixture exists for exactly ONE refusal vector: its
 * `createHostBoundModelResolver` returns a resolver WITHOUT the real
 * port-invoking `invokeDecision` endpoint (the "stale bind" shape the
 #1013 host wiring must refuse typed at load). It is NEVER evidence for
 * model-call semantics, never measures anything, and is never used on a
 * success path — the selected physical `standard-sdk-v1.mjs` owns all
 * real interpretation semantics.
 *
 * The interpret() passthrough mirrors only the rule-shorthand surface the
 * kernel's wiring needs so the closure SEALs and LOADS far enough to reach
 * the host bind — which is the point under test.
 */

export const MODULE_ID = 'standard-sdk-stale-bind-stub@v08.0.1.0';
export const PACKAGE_KIND = 'standard-sdk';
export const ABI_VERSION = 'v08-standard-sdk-abi/1';
export const ENDPOINTS = [
  { endpointId: 'sdk:rule-interpreter', kind: 'rule-interpreter' },
];

export function interpret(declaration, rawInput) {
  const eventType = declaration?.eventType ?? 'STUB_EVENT';
  const payload = { ...(rawInput ?? {}) };
  return {
    kind: 'rule',
    structuredDecision: {
      decision: { outcome: 'decide', data: payload },
      event: { type: eventType, payload },
    },
    provenance: { sdkModule: MODULE_ID, declarationId: declaration?.ruleId ?? declaration?.id ?? 'stub' },
    source: 'harness-machine',
    llmAvoided: true,
    modelCallEvidence: { status: 'unsupported' },
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

/**
 * The stale bind: accepts the port (so the shape gate passes) but returns
 * a resolver exposing ONLY the model-free wrapper — no `invokeDecision`.
 */
export function createHostBoundModelResolver(hostModelPort) {
  if (typeof hostModelPort !== 'object' || hostModelPort === null) {
    throw Object.assign(new Error('SDK_MODEL_PORT_INVALID'), { code: 'SDK_MODEL_PORT_INVALID' });
  }
  return Object.freeze({
    interpret(declaration, input) {
      return interpret(declaration, input);
    },
  });
}
