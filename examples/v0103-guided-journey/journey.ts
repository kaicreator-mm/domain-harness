/**
 * An app-private offline Business example against the frozen #1397 wire Schema.
 * It has no Model/Tool/Effect port and does not implement another SDK engine.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { approvedTemplates, copy, templateVersion } from './catalog.ts';

type Ref = { artifactId: string; version: string; digest: string };
type CaseRef = { snapshotId: string; digest: string };
type JsonRecord = Record<string, unknown>;
type Event = 'USER_SUBMIT' | 'BACK' | 'SKIP' | 'PAUSE' | 'RESUME'
  | 'OBSERVATION_RECEIPT' | 'EFFECT_RECEIPT';
type Step = JsonRecord & { stepId: string; templateRef: Ref; caseRef: CaseRef;
  kind: string; fields: readonly { required?: boolean; options?: readonly { id: string; eligible: boolean }[] }[];
  allowedEvents: readonly string[] };
type Outcome = { journeyId: string; stepId: string; event: Event;
  selectedOptionIds?: string[]; evidenceRefs: string[]; receiptRef?: string };
type Decision = JsonRecord & { status: 'STEP' | 'NEED_EVIDENCE' | 'WAIT' | 'BLOCKED' | 'DONE';
  reasonCode: string; step?: Step };

export type HostReceipt = {
  receiptRef: string; journeyId: string; stepId: string;
  event: 'OBSERVATION_RECEIPT' | 'EFFECT_RECEIPT';
  fromCaseRef: CaseRef; toCaseRef: CaseRef;
  outcome: 'CONFIRMED' | 'FAILED' | 'UNKNOWN'; evidenceRefs: readonly string[];
};
/** App/Host input, not user/LLM data. This sample does not authenticate a device. */
export type HostObservation = {
  snapshotId: string; revision: number; gms: 'PRESENT_ENABLED' | 'PRESENT_DISABLED' | 'ABSENT' | 'UNKNOWN';
  observedAtUnixMs: number; validUntilUnixMs: number; evidenceRefs: readonly string[];
  packageProtected?: boolean; packageReversible?: boolean; receipts?: readonly HostReceipt[];
};

const contractVersion = 'dh.guided-journey/1';
const schemaBytes = readFileSync(new URL('../../docs/product/v0.10.3/contracts/guided-journey-v1.schema.json', import.meta.url));
const wire = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(schemaBytes.toString('utf8')));
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = <T>(value: T): T => globalThis.structuredClone(value);

export class JourneyRefusal extends Error {
  constructor(readonly code: string) { super(code); this.name = 'JourneyRefusal'; }
}
function refuse(code: string): never { throw new JourneyRefusal(code); }

export function assertWireMessage(value: unknown): void {
  if (!wire(value)) refuse('INVALID_WIRE_MESSAGE');
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Called once before starting a journey, like an app-owned BUILD data step. */
export function prepareApprovedAssets() {
  const templates = approvedTemplates.map(template => ({
    ref: { artifactId: template.id, version: templateVersion, digest: digest(template) },
    spec: clone(template),
  }));
  for (const template of templates) {
    assertWireMessage({ messageType: 'step.spec', contractVersion, journeyId: 'pre-build-validation',
      stepId: template.ref.artifactId, templateRef: template.ref,
      caseRef: { snapshotId: 'pre-build', digest: '0'.repeat(64) }, kind: template.spec.kind,
      titleKey: template.spec.titleKey, fields: template.spec.fields,
      allowedEvents: template.spec.allowedEvents, evidenceRefs: [] });
  }
  const schemaSha256 = createHash('sha256').update(schemaBytes).digest('hex');
  const catalogRef = { artifactId: 'offline-gms-debloat', version: templateVersion,
    digest: digest({ templates, copy, schemaSha256 }) };
  return freeze({ catalogRef, templates, copy: clone(copy), schemaSha256 });
}
type Assets = ReturnType<typeof prepareApprovedAssets>;
function sameRef(a: unknown, b: unknown): boolean {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const x = a as JsonRecord, y = b as JsonRecord;
  return x.digest === y.digest && ('snapshotId' in x
    ? x.snapshotId === y.snapshotId
    : x.artifactId === y.artifactId && x.version === y.version);
}

/** Case identity is derived from the trusted observation, never an advisory. */
export function caseRefFor(observation: HostObservation): CaseRef {
  const { snapshotId, revision, gms, observedAtUnixMs, validUntilUnixMs, evidenceRefs,
    packageProtected, packageReversible } = observation;
  return { snapshotId, digest: digest({ snapshotId, revision, gms, observedAtUnixMs,
    validUntilUnixMs, evidenceRefs, packageProtected, packageReversible }) };
}

export class OfflineGuidedJourney {
  readonly assets: Assets;
  private issued: Step | undefined;
  private paused = false;
  private sequence = 0;
  private revision = -1;
  private lastCase?: CaseRef;
  private verificationRequired = false;
  private recoveryRequired = false;

  constructor(readonly journeyId: string, readonly goal: 'gms' | 'debloat',
    private readonly now: () => number = Date.now) {
    this.assets = prepareApprovedAssets();
    Object.defineProperty(this, 'assets', { value: this.assets, enumerable: true, writable: false, configurable: false });
    if (goal !== 'gms' && goal !== 'debloat') refuse('INVALID_GOAL');
    // Validate the journey ID using the authoritative wire validator.
    assertWireMessage({ messageType: 'next-step.decision', contractVersion, journeyId,
      status: 'WAIT', reasonCode: 'INITIAL', evidenceRefs: [] });
  }

  next(observation: HostObservation, suppliedOutcome?: unknown, advisory?: unknown) {
    const snapshot = clone(observation);
    const now = this.now();
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < this.revision
      || !Number.isSafeInteger(snapshot.observedAtUnixMs) || !Number.isSafeInteger(snapshot.validUntilUnixMs)
      || snapshot.observedAtUnixMs > now || snapshot.validUntilUnixMs < now
      || snapshot.evidenceRefs.length === 0 || snapshot.evidenceRefs.length > 24
      || new Set(snapshot.evidenceRefs).size !== snapshot.evidenceRefs.length
      || snapshot.evidenceRefs.some(ref => typeof ref !== 'string' || ref.length === 0 || ref.length > 256)
      || !['PRESENT_ENABLED', 'PRESENT_DISABLED', 'ABSENT', 'UNKNOWN'].includes(snapshot.gms)) {
      refuse('STALE_EVIDENCE');
    }
    const caseRef = caseRefFor(snapshot);
    if (snapshot.revision === this.revision && !sameRef(caseRef, this.lastCase)) refuse('CASE_REVISION_CONFLICT');
    const templateId = this.goal === 'debloat'
      ? snapshot.packageProtected === true ? null
        : snapshot.packageProtected === false && snapshot.packageReversible === true ? 'review-debloat' : 'inspect-package'
      : { PRESENT_ENABLED: 'summary', PRESENT_DISABLED: 'review-enable', ABSENT: 'ask-compatibility', UNKNOWN: 'inspect-gms' }[snapshot.gms];
    let forcedTemplate: string | undefined;
    let disposition: { status: Decision['status']; reasonCode: string } | undefined;
    let paused = this.paused;
    let verificationRequired = this.verificationRequired;
    let recoveryRequired = this.recoveryRequired;

    if (suppliedOutcome !== undefined) {
      assertWireMessage(suppliedOutcome);
      const outcome = suppliedOutcome as Outcome;
      const issued = this.issued;
      if (!issued || outcome.journeyId !== this.journeyId || outcome.stepId !== issued.stepId) refuse('STALE_STEP');
      if (!issued.allowedEvents.includes(outcome.event)) refuse('EVENT_NOT_ALLOWED');
      const options = issued.fields.flatMap(field => field.options ?? []).filter(option => option.eligible).map(option => option.id);
      if ((outcome.selectedOptionIds ?? []).some(id => !options.includes(id))) refuse('INVALID_CHOICE');
      if (outcome.event === 'USER_SUBMIT' && issued.fields.some(field => field.required && field.options
        && !field.options.some(option => option.eligible && outcome.selectedOptionIds?.includes(option.id)))) refuse('INVALID_CHOICE');
      if (!outcome.evidenceRefs.every(ref => snapshot.evidenceRefs.includes(ref))) refuse('FORGED_EVIDENCE');
      if (outcome.event === 'OBSERVATION_RECEIPT' || outcome.event === 'EFFECT_RECEIPT') {
        const receipt = snapshot.receipts?.find(item => item.receiptRef === outcome.receiptRef);
        if (!receipt || receipt.journeyId !== this.journeyId || receipt.stepId !== issued.stepId
          || receipt.event !== outcome.event || !sameRef(receipt.fromCaseRef, issued.caseRef)
          || !sameRef(receipt.toCaseRef, caseRef) || !outcome.evidenceRefs.every(ref => receipt.evidenceRefs.includes(ref))
          || !['CONFIRMED', 'FAILED', 'UNKNOWN'].includes(receipt.outcome)) refuse('UNVERIFIED_RECEIPT');
        if (receipt.outcome === 'UNKNOWN') {
          verificationRequired = true; forcedTemplate = 'verify-outcome';
          disposition = { status: 'STEP', reasonCode: 'RECONCILE_UNKNOWN' };
        } else if (receipt.outcome === 'FAILED') {
          verificationRequired = false; recoveryRequired = true; forcedTemplate = 'recover';
          disposition = { status: 'STEP', reasonCode: 'CONFIRMED_FAILURE' };
        } else if (receipt.event === 'EFFECT_RECEIPT') {
          verificationRequired = true; forcedTemplate = 'verify-outcome';
          disposition = { status: 'STEP', reasonCode: 'VERIFY_EFFECT' };
        } else { verificationRequired = false; recoveryRequired = false; }
      } else {
        if (!['RESUME', 'BACK'].includes(outcome.event) && !sameRef(caseRef, issued.caseRef)) refuse('STALE_EVIDENCE');
        if (outcome.event === 'PAUSE') { paused = true; disposition = { status: 'WAIT', reasonCode: 'PAUSED' }; }
        else if (outcome.event === 'RESUME') paused = false;
        else if (outcome.event === 'SKIP') disposition = { status: 'BLOCKED', reasonCode: 'NO_APPROVED_SKIP_ROUTE' };
        else if (outcome.event === 'USER_SUBMIT') disposition = issued.kind === 'SUMMARY'
          ? { status: 'DONE', reasonCode: 'SAMPLE_INFORMATION_COMPLETE' }
          : { status: 'NEED_EVIDENCE', reasonCode: issued.kind === 'REVIEW_EFFECT' ? 'SEPARATE_K_PERMIT_REQUIRED' : 'HOST_RECEIPT_REQUIRED' };
      }
    }

    const held = paused ? { status: 'WAIT' as const, reasonCode: 'PAUSED' } : undefined;
    const chosen = held ?? disposition ?? (verificationRequired
      ? { status: 'STEP' as const, reasonCode: 'RECONCILE_OUTCOME' }
      : recoveryRequired ? { status: 'STEP' as const, reasonCode: 'RECOVERY_REQUIRED' }
      : templateId === null ? { status: 'BLOCKED' as const, reasonCode: 'PROTECTED_PACKAGE' }
      : { status: 'STEP' as const, reasonCode: 'APPROVED_OFFLINE_RULE' });
    const selectedId = forcedTemplate ?? (verificationRequired ? 'verify-outcome' : recoveryRequired ? 'recover' : templateId);
    const eligible = chosen.status === 'STEP' && selectedId !== null ? [this.template(selectedId).ref] : [];
    const request = { messageType: 'next-step.request', contractVersion, journeyId: this.journeyId,
      goals: [this.goal], caseRef, catalogRef: clone(this.assets.catalogRef), eligibleTemplateRefs: clone(eligible),
      ...(suppliedOutcome === undefined ? {} : { previousOutcome: suppliedOutcome }) };
    assertWireMessage(request);
    if (advisory !== undefined) {
      assertWireMessage(advisory);
      const proposal = advisory as { journeyId: string; caseRef: CaseRef; suggestedTemplateRef: Ref; evidenceRefs: string[] };
      if (proposal.journeyId !== this.journeyId || !sameRef(proposal.caseRef, caseRef)
        || !eligible.some(ref => sameRef(ref, proposal.suggestedTemplateRef))
        || !proposal.evidenceRefs.every(ref => snapshot.evidenceRefs.includes(ref))) refuse('INVALID_CANDIDATE');
      // Valid advice is still advisory: this deterministic Business route decides.
    }

    const decision: Decision = { messageType: 'next-step.decision', contractVersion, journeyId: this.journeyId,
      ...chosen, evidenceRefs: [...snapshot.evidenceRefs] };
    if (decision.status === 'STEP') {
      const template = this.template(selectedId ?? 'inspect-gms');
      const step: Step = { messageType: 'step.spec', contractVersion, journeyId: this.journeyId,
        stepId: `${this.journeyId.slice(0, 96)}:step:${this.sequence + 1}`, templateRef: clone(template.ref), caseRef,
        kind: template.spec.kind, titleKey: template.spec.titleKey, fields: clone(template.spec.fields),
        allowedEvents: clone(template.spec.allowedEvents), evidenceRefs: [...snapshot.evidenceRefs],
        ...(template.spec.kind === 'REVIEW_EFFECT' ? { actionPreviewRef: `preview:${template.ref.artifactId}` } : {}) };
      assertWireMessage(step);
      decision.step = step;
    }
    assertWireMessage(decision);
    this.revision = snapshot.revision;
    this.lastCase = caseRef;
    this.paused = paused;
    this.verificationRequired = verificationRequired;
    this.recoveryRequired = recoveryRequired;
    if (decision.step) { this.sequence += 1; this.issued = clone(decision.step); }
    else if (decision.status === 'DONE' || decision.status === 'BLOCKED') this.issued = undefined;
    return { request: clone(request), decision: clone(decision) };
  }

  private template(id: string) {
    const template = this.assets.templates.find(item => item.ref.artifactId === id);
    if (!template) refuse('UNSELECTED_TEMPLATE');
    return template;
  }
}
