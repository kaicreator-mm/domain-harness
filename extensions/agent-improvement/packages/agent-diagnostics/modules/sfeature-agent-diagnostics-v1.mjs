/**
 * DomainHarness v0.10.1 C01 — source-qualified advisory diagnostics.
 *
 * Pure selected Standard Feature; NEVER a Task verdict, reviewer, K admission,
 * effect permit, scheduler, independent verifier, or Tool executor.
 * Only observed failures can form firstFailure; repeated observations produce
 * candidates, NOT causal claims or automatic strategy changes.
 */
export const MODULE_ID = 'sfeature-agent-diagnostics@v0101.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:agent-diagnostics/1';

const EVENT_KINDS = new Set(['IMPLEMENTATION', 'TOOL', 'VALIDATION', 'REVIEW', 'HANDOFF']);
const OUTCOMES = new Set(['PASS', 'FAIL', 'UNKNOWN', 'ABORTED', 'NOT_RUN']);
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const FORBIDDEN = new Set([
  '__proto__', 'prototype', 'constructor', 'permit', 'effectPermit',
  'effectIntents', 'effectJournal', 'admissionFence', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'write', 'activate', 'promote',
]);

class DiagnosticInputError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DiagnosticInputError';
    this.code = code;
  }
}

function fail(code) { throw new DiagnosticInputError(code); }
function record(value, maxKeys = 20) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DIAG_RECORD_INVALID');
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) fail('DIAG_RECORD_INVALID');
  const keys = Reflect.ownKeys(value);
  if (keys.length > maxKeys || keys.some(key => typeof key !== 'string' || FORBIDDEN.has(key))) {
    fail('DIAG_RECORD_INVALID');
  }
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (!desc || !Object.hasOwn(desc, 'value')) fail('DIAG_RECORD_INVALID');
  }
  return value;
}
function own(value, field) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function text(value, code, max = 256) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max
      || /[\u0000-\u001f]/.test(value) || /^(?:head|latest|\*)$/i.test(value)) fail(code);
  return value;
}
function sourceSha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) fail('DIAG_SHA_INVALID');
  return value;
}
function boundedList(value, code, max = 128) {
  if (!Array.isArray(value) || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) {
    // Arrays expose their nonenumerable 'length'; no custom named/symbol keys.
    fail(code);
  }
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
  return value;
}
function optionalText(v, code) {
  return v === undefined ? null : text(v, code);
}
export function init(context) {
  record(context);
  const appId = text(own(context, 'appId'), 'DIAG_INIT_INVALID');
  return Object.freeze({ ok: true, featureKey: FEATURE_KEY, observedContext: Object.freeze({ appId }) });
}

/**
 * input = { subjectSha, events:[{eventId,kind,sourceRef,subjectSha,
 *    seq,status,failureClass?,actionFamily?}], expectedVerifierRefs?: string[],
 *    verifiers?:[{verifierRef,sourceRef,subjectSha,status,coverage}] }.
 *
 * Event seq is an OBSERVED source-local order; do not treat it as total
 * causal order of parallel agents. Verified success is never promoted here.
 */
export function analyzeAgentRun(input) {
  record(input);
  const expected = sourceSha(own(input, 'subjectSha'));
  const events = boundedList(own(input, 'events'), 'DIAG_EVENTS_INVALID');
  const verifierInputs = boundedList(own(input, 'verifiers') ?? [], 'DIAG_VERIFIERS_INVALID', 64);
  const required = boundedList(own(input, 'expectedVerifierRefs') ?? [], 'DIAG_EXPECTED_INVALID', 64);
  const expectedSet = new Set();
  for (const entry of required) {
    const ref = text(entry, 'DIAG_EXPECTED_INVALID');
    if (expectedSet.has(ref)) fail('DIAG_EXPECTED_DUPLICATE');
    expectedSet.add(ref);
  }
  const ordered = [];
  const eventIds = new Set();
  for (const entry of events) {
    record(entry);
    const eventId = text(own(entry, 'eventId'), 'DIAG_EVENT_INVALID');
    if (eventIds.has(eventId)) fail('DIAG_EVENT_DUPLICATE');
    eventIds.add(eventId);
    const kind = own(entry, 'kind');
    const status = own(entry, 'status');
    if (!EVENT_KINDS.has(kind) || !OUTCOMES.has(status)) fail('DIAG_EVENT_INVALID');
    const seq = own(entry, 'seq');
    if (!Number.isSafeInteger(seq) || seq < 0) fail('DIAG_SEQUENCE_INVALID');
    ordered.push({
      eventId, kind, seq, status,
      sourceRef: text(own(entry, 'sourceRef'), 'DIAG_SOURCE_MISSING'),
      subjectSha: sourceSha(own(entry, 'subjectSha')),
      failureClass: optionalText(own(entry, 'failureClass'), 'DIAG_FAILURE_CLASS_INVALID'),
      actionFamily: optionalText(own(entry, 'actionFamily'), 'DIAG_ACTION_FAMILY_INVALID'),
    });
  }
  ordered.sort((a, b) => a.seq - b.seq || a.eventId.localeCompare(b.eventId));
  const verifierIds = new Set();
  const verifiedRefs = new Set();
  const verifierSummary = [];
  for (const entry of verifierInputs) {
    record(entry);
    const ref = text(own(entry, 'verifierRef'), 'DIAG_VERIFIER_INVALID');
    if (verifierIds.has(ref)) fail('DIAG_VERIFIER_DUPLICATE');
    verifierIds.add(ref);
    const status = own(entry, 'status');
    const coverage = own(entry, 'coverage');
    if (!OUTCOMES.has(status) || !['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(coverage)) {
      fail('DIAG_VERIFIER_INVALID');
    }
    const sha = sourceSha(own(entry, 'subjectSha'));
    const matchingSubject = sha === expected;
    if (matchingSubject && coverage === 'COMPLETE' && ['PASS', 'FAIL'].includes(status)) verifiedRefs.add(ref);
    verifierSummary.push(Object.freeze({
      verifierRef: ref,
      sourceRef: text(own(entry, 'sourceRef'), 'DIAG_SOURCE_MISSING'),
      subjectMatch: matchingSubject, coverage, observedStatus: status,
    }));
  }
  // A reported verification result is not an independent proof that the
  // underlying verifier is correct, fresh or complete for the actual Task.
  const missingVerifierRefs = [...expectedSet].filter(ref => !verifiedRefs.has(ref));
  const mismatchedEvents = ordered.filter(event => event.subjectSha !== expected)
    .map(event => event.eventId);
  const observedFailures = ordered.filter(event =>
    event.subjectSha === expected && event.status === 'FAIL');
  // Equal seq across distinct events cannot establish a causal first divergence.
  const earliestSeq = observedFailures.length ? observedFailures[0].seq : null;
  const firstAtSeq = observedFailures.filter(event => event.seq === earliestSeq);
  const firstFailure = firstAtSeq.length === 1
    ? Object.freeze({
        eventId: firstAtSeq[0].eventId, seq: earliestSeq,
        sourceRef: firstAtSeq[0].sourceRef, kind: firstAtSeq[0].kind,
        failureClass: firstAtSeq[0].failureClass,
      })
    : null;
  const repeated = new Map();
  for (const event of observedFailures) {
    if (!event.failureClass || !event.actionFamily) continue;
    const key = JSON.stringify([event.failureClass, event.actionFamily]);
    let cluster = repeated.get(key);
    if (!cluster) {
      cluster = { failureClass: event.failureClass, actionFamily: event.actionFamily, eventIds: [] };
      repeated.set(key, cluster);
    }
    cluster.eventIds.push(event.eventId);
  }
  const loopCandidates = [...repeated.values()]
    .filter(x => x.eventIds.length >= 2)
    .map(x => Object.freeze({ ...x, eventIds: Object.freeze([...x.eventIds]),
      classification: 'REPEATED_FAILURE_CANDIDATE' }));
  const firstFailureAmbiguous = firstAtSeq.length > 1;
  const warnings = [];
  if (missingVerifierRefs.length) warnings.push('VERIFIER_COVERAGE_INCOMPLETE');
  if (mismatchedEvents.length || verifierSummary.some(x => !x.subjectMatch)) warnings.push('SUBJECT_MISMATCH');
  if (firstFailureAmbiguous) warnings.push('FIRST_FAILURE_ORDER_AMBIGUOUS');
  if (loopCandidates.length) warnings.push('REPEATED_FAILURE_REQUIRES_CAUSAL_REVIEW');
  if (!ordered.length) warnings.push('EVENTS_NOT_OBSERVED');
  return Object.freeze({
    schema: 'dh.v0101.agent-diagnostics/1',
    featureKey: FEATURE_KEY,
    subjectSha: expected,
    authority: 'ADVISORY_ONLY',
    taskGateVerdict: 'NOT_DETERMINED',
    firstFailure, firstFailureAmbiguous,
    observedEventCount: ordered.length,
    observedFailureCount: observedFailures.length,
    verifierSummary: Object.freeze(verifierSummary),
    missingVerifierRefs: Object.freeze(missingVerifierRefs),
    mismatchedEventIds: Object.freeze(mismatchedEvents),
    loopCandidates: Object.freeze(loopCandidates),
    warnings: Object.freeze(warnings),
  });
}
