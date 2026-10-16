/**
 * NEGATIVE-ONLY synthetic Standard-SDK stub (#1057 R2 load gate).
 * ======================================================================
 *
 * This fixture exists for exactly ONE refusal vector: it is a
 * well-formed Standard SDK surface (MODULE_ID / ABI / endpoint /
 * rule-shorthand `interpret`) that does NOT export the three retained
 * decision-source endpoints (`resolveRetainedDecision` /
 * `selectRetainedPromotedChild` / `checkRetainedEvidenceApplicability`).
 * Sealed against the #1003 decision-source Business fixture (which
 * declares `decision-source` rules), the selected Kernel's trusted load
 * wiring must refuse the load typed
 * (`DECISION_SOURCE_SDK_ENDPOINT_UNAVAILABLE`) through the explicit
 * WeakMap-carried rule count — never silently degrade to another engine.
 *
 * It is NEVER evidence for decision semantics, never measures anything,
 * and is never used on a success path — the selected physical
 * `standard-sdk-v1.mjs` owns all real interpretation semantics.
 */

export const MODULE_ID = 'standard-sdk-no-decision-source-stub@v08.0.1.0';
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
