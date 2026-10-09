/**
 * #984 V08-B2-R3-A1 (P1-02 repair, part 2): trusted Host-ONLY exposure
 * admission policy port.
 *
 * Derived from the finding on experiments/v08-gatea-repair-942/authority/
 * native-join.mjs L98-109 at base SHA e11a0510134903d6f05a20dd024f3740429edc33,
 * where the native join installed `decideAdmission:()=>({admitted:true})` with
 * a single hardcoded caller/input and a hardcoded `effect:charge` effect type.
 *
 * This successor replaces the constant-admit policy with a REAL policy port
 * whose decisions are tied to the EXACT current attested tuple:
 *
 *   (domainId, packageId, occurrenceId, workflowTarget, operationId,
 *    effectType, effectClass, projected caller scope, authorized callers)
 *
 * and which is exercised through the ORIGINAL v0.7 owner API: the port is
 * consumed by `admitToolExposure` (T004A), which snapshots the operation and
 * caller, weaves both into the exposure digest, and turns every denial into
 * the typed EXPOSURE_NOT_ADMITTED failure BEFORE any dispatch or journal
 * work. Unknown, forged, revoked/foreign and wrong-kind callers fail closed.
 *
 * The port is constructed ONCE by the trusted Host assembler from attested
 * facts only; consumers can never express, replace or reconfigure it (the
 * public façade accepts no policy material — see ./native-authority-host.mjs).
 * This is NOT a new effect authority: it decides caller EXPOSURE admission
 * only, exactly like any T004A `ToolExposureAdmissionPolicy`; effect admission
 * and durable journaling stay entirely with the original v0.7 Central
 * Admission and its Journal.
 */

import { stableStringify } from './native-projection.mjs';

/** Typed trusted-policy failure (host assembler specification errors). */
export class A1HostPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'A1HostPolicyError';
  }
}

const deny = (code, message) => {
  throw new A1HostPolicyError(code, message);
};

/**
 * Build the trusted Host-only policy port.
 *
 * @param {object} spec exact attested binding facts:
 *   domainId, packageId, occurrenceId, workflowTarget, operationId,
 *   effectType (derived from binding facts — see deriveNativeEffectType),
 *   effectClass (the attested physical operation effect),
 *   callerScope (the projected physical `callers` — allowed callerKind values),
 *   authorizedCallers (exact {callerId, callerKind} entries; duplicates are
 *   rejected as ambiguous at construction).
 */
export function createTrustedHostPolicyPort(spec) {
  if (!spec || typeof spec !== 'object') {
    deny('E_HOST_POLICY_SPEC', 'trusted policy specification must be an object');
  }
  for (const field of ['domainId', 'packageId', 'occurrenceId', 'workflowTarget', 'operationId', 'effectType', 'effectClass']) {
    if (typeof spec[field] !== 'string' || spec[field].length === 0) {
      deny('E_HOST_POLICY_SPEC', 'trusted policy specification.' + field + ' must be a non-empty string');
    }
  }
  if (!Array.isArray(spec.callerScope) || spec.callerScope.length === 0 ||
      spec.callerScope.some((k) => typeof k !== 'string' || k.length === 0)) {
    deny('E_HOST_POLICY_SPEC', 'trusted policy specification.callerScope must be a non-empty string array (the projected physical caller scope)');
  }
  if (!Array.isArray(spec.authorizedCallers) || spec.authorizedCallers.length === 0) {
    deny('E_HOST_POLICY_SPEC', 'trusted policy specification.authorizedCallers must list at least one exact caller');
  }
  const seen = new Set();
  for (const entry of spec.authorizedCallers) {
    if (!entry || typeof entry.callerId !== 'string' || entry.callerId.length === 0 ||
        typeof entry.callerKind !== 'string' || entry.callerKind.length === 0) {
      deny('E_HOST_POLICY_SPEC', 'each authorized caller must carry exact {callerId, callerKind}');
    }
    const key = entry.callerId + '\u0000' + entry.callerKind;
    if (seen.has(key)) {
      // Ambiguity fails closed at construction, never at admission time.
      deny('E_HOST_POLICY_AMBIGUOUS',
        'duplicate authorized caller entry ' + JSON.stringify(entry.callerId + '@' + entry.callerKind));
    }
    seen.add(key);
  }
  if (!spec.callerScope.includes(spec.authorizedCallers[0].callerKind)) {
    deny('E_HOST_POLICY_SPEC',
      'authorized caller kind ' + JSON.stringify(spec.authorizedCallers[0].callerKind) +
      ' is outside the projected physical caller scope; the policy can never authorize beyond the projected scope');
  }

  const expected = Object.freeze({
    domainId: spec.domainId,
    packageId: spec.packageId,
    occurrenceId: spec.occurrenceId,
    workflowTarget: spec.workflowTarget,
    operationId: spec.operationId,
    effectType: spec.effectType,
    effectClass: spec.effectClass,
    callerScope: Object.freeze([...spec.callerScope]),
    authorizedCallers: Object.freeze(spec.authorizedCallers.map((e) => Object.freeze({ ...e }))),
  });

  let decisions = 0;
  const denials = [];

  return Object.freeze({
    /** The exact attested tuple this policy is bound to (provenance export). */
    expected,
    /**
     * ToolExposureAdmissionPolicy port consumed by the ORIGINAL
     * `admitToolExposure` (T004A). Decisions are tied to the exact attested
     * tuple above; anything unknown, malformed, foreign or wrong-kind is
     * denied (fail-closed) with a precise reason.
     */
    decideAdmission({ operation, caller } = {}) {
      decisions += 1;
      const denyAdmission = (reason) => {
        denials.push(Object.freeze({ reason, callerId: caller && typeof caller.callerId === 'string' ? caller.callerId : null }));
        return Object.freeze({ admitted: false, reason });
      };
      if (!operation || typeof operation !== 'object' || operation.operationId !== expected.operationId) {
        return denyAdmission('operation is not the attested bound operation ' + JSON.stringify(expected.operationId));
      }
      if (operation.effect !== expected.effectClass) {
        return denyAdmission('operation effect class ' + JSON.stringify(operation.effect) +
          ' drifts from the attested binding ' + JSON.stringify(expected.effectClass));
      }
      if (!caller || typeof caller !== 'object' || typeof caller.callerId !== 'string' || caller.callerId.length === 0) {
        return denyAdmission('malformed caller context (callerId required)');
      }
      const exact = expected.authorizedCallers.find(
        (entry) => entry.callerId === caller.callerId && entry.callerKind === caller.callerKind,
      );
      if (!exact) {
        const knownId = expected.authorizedCallers.some((entry) => entry.callerId === caller.callerId);
        if (knownId) {
          // Same id under a different plane/kind: never silently re-scoped.
          return denyAdmission('caller ' + JSON.stringify(caller.callerId) +
            ' is not authorized under callerKind ' + JSON.stringify(caller.callerKind) +
            ' (projected physical caller scope: ' + expected.callerScope.join(', ') + ')');
        }
        return denyAdmission('caller ' + JSON.stringify(caller.callerId) +
          ' is not authorized for occurrence ' + JSON.stringify(expected.occurrenceId) +
          ' (unknown or revoked for this exact occurrence)');
      }
      if (!expected.callerScope.includes(exact.callerKind)) {
        return denyAdmission('authorized caller kind ' + JSON.stringify(exact.callerKind) +
          ' is outside the projected physical caller scope');
      }
      return Object.freeze({ admitted: true });
    },
    /** Observed decision statistics (evidence export for tests/terminal). */
    policyStats() {
      return Object.freeze({ decisions, denials: Object.freeze([...denials]) });
    },
    /** Canonical material identity of this policy binding (diagnostics). */
    bindingFingerprint() {
      return stableStringify(expected);
    },
  });
}
