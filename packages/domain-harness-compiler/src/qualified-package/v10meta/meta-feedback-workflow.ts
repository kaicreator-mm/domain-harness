/**
 * DomainHarness v0.10 T09 (#1178, R1 repair) — recurring proposal-only Meta
 * Feedback Workflow.
 * ====================================================================
 *
 * This Host-owned runner composes ONLY already-selected v0.10 surfaces:
 *
 *   (1) durable Decision Evidence / Candidate / Shadow records are read from
 *       the production document store through `get` only, bounded before any
 *       evaluator sees them, and ONLY from the exact deployment/tenant/App/
 *       Business evidence namespace derived from the trusted activation
 *       binding (never a public caller claim);
 *   (2) a selected Standard feature (`standard:meta-feedback/1`) turns those
 *       bounded observations into at most four PROPOSAL records;
 *   (3) exactly ONE ordinary selected Business workflow turn records that
 *       proposal. The selected Business policy declares a recurring
 *       self-transition whose guard accepts only `disposition:
 *       'proposal-only'` and `effectCount: 0`, and it declares no effect
 *       intent/binding at all;
 *   (4) a durable create-only RESERVATION is written BEFORE any business turn
 *       can be admitted, and a create-only ledger is written after the turn.
 *       Two simultaneous fresh writers of one round therefore cannot both
 *       reach `facade.send`: the one reservation CAS winner owns the send and
 *       every other fresh writer refuses typed. A later call that observes an
 *       existing reservation (a crashed or still-running earlier attempt)
 *       recovers by re-sending the SAME stable message identity with the
 *       reservation's own recorded input — the selected Kernel's durable
 *       message dedup replays the original receipt with zero new
 *       State/Journal/Effect activity — and then finalizes the terminal
 *       ledger. A pending reservation is never reported as success.
 *       Recurrence is explicit Host rounds (1..32), never an autonomous timer
 *       or a new Agent/Kernel runtime.
 *
 * The runner cannot approve, publish, promote a BUILD, activate a deployment
 * or dispatch an external Effect: it exposes no such operation and every
 * authority-shaped record is refused typed BEFORE any business turn or
 * reservation/ledger write. K State/Journal/Effect, the K02 fence and the
 * immutable original receipt remain exclusively the selected Kernel's.
 */
import { V10Error } from '../v10build/errors.js';
import { isPlainRecord } from '../v10build/guards.js';
import { V10AppFacade } from '../v10build/activation.js';
import type { V10DocStore } from '../v10build/activation.js';
import { sha256Canonical } from '../v10build/digest.js';

export const META_FEEDBACK_ABI = 'dh.v10.meta-feedback-workflow/2';
export const META_FEEDBACK_LEDGER_KIND = 'v10/meta-feedback-round';
export const META_FEEDBACK_CLAIM_KIND = 'v10/meta-feedback-round-claim';
export const META_FEEDBACK_CLAIM_STATE = 'reserved';
export const META_FEEDBACK_LEDGER_STATE = 'committed';
export const META_FEEDBACK_EVIDENCE_KEY_PREFIX = 'v10/t09/';
export const META_FEEDBACK_LEDGER_PREFIX = 'v10-meta-feedback:';
export const META_FEEDBACK_CLAIM_PREFIX = 'v10-meta-feedback-claim:';
export const MAX_META_ROUNDS = 32;
export const MAX_META_EVIDENCE_KEYS = 8;
export const MAX_META_RECORD_CHARS = 32_768;

const MAX_IDENTIFIER = 512;
const MAX_SCOPE_COMPONENT = 256;
const MAX_CREATED_AT = 64;
const HEX64 = /^[0-9a-f]{64}$/;
const AUTHORITY_KEYS = new Set([
  'approve', 'approved', 'approval', 'promote', 'promotion', 'activate',
  'activation', 'publish', 'publication', 'selfApprove', 'effectIntents',
  'effectPermit', 'permit', 'effectJournal', 'admissionFence', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'write', 'apply', 'execute',
  'dispatch', 'hotSwap', '__proto__', 'prototype', 'constructor',
]);
const SAFE_FALSE_FLAGS = new Set([
  'canSelfApprove', 'canPromote', 'canActivate', 'canPublish', 'kernelEffectPermit',
]);
const OPTION_FIELDS = new Set(['facade', 'store', 'workflow', 'sources', 'maxProposals', 'now']);
const WORKFLOW_FIELDS = new Set(['intentType', 'instanceKey', 'scheduleKey', 'round']);
const SOURCE_FIELDS = new Set(['evidenceKeys', 'candidateKey', 'shadowKey']);
const PROPOSAL_FIELDS = new Set(['proposalId', 'kind', 'summary', 'evidenceRefs', 'authority', 'canApply']);
const TURN_INPUT_FIELDS = new Set([
  'disposition', 'effectCount', 'proposalId', 'proposalDigest', 'evidenceDigest',
  'candidateDigest', 'shadowDigest',
]);

export class MetaFeedbackError extends V10Error {
  readonly detail: Readonly<Record<string, unknown>> | undefined;
  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(code, message);
    this.name = 'MetaFeedbackError';
    this.detail = detail === undefined ? undefined : Object.freeze({ ...detail });
  }
}

function refuse(code: string, message: string, detail?: Record<string, unknown>): never {
  throw new MetaFeedbackError(code, message, detail);
}


function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function bounded(value: unknown, label: string, max = MAX_IDENTIFIER): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    refuse('META_OPTIONS_INVALID', `${label} must be a bounded nonempty string`);
  }
  return value;
}

/**
 * Injective key-component encoding for BOTH delimiters this module uses:
 * `:` between ledger/claim components and `/` between evidence-namespace
 * components. `%` is escaped first, so the encoding is reversible and two
 * distinct identity tuples can never alias one key.
 */
function encodeKeyComponent(value: string): string {
  return value.replace(/%/g, '%25').replace(/:/g, '%3A').replace(/\//g, '%2F');
}

function isCasConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'HOST_CAS_CONFLICT' || code === 'HOST_KEY_EXISTS';
}

/**
 * The selected Kernel's durable message dedup returns the EXACT original
 * receipt plus its honest `idempotentReplay` marker (and an optional healed
 * `turnDisposition`). Those two annotations are replay metadata, not original
 * receipt content: two concurrent recovery callers may observe one original
 * and one replay-marked copy of the SAME receipt. Compare the stable original
 * payload when a raced ledger must be adjudicated, and keep the recorded
 * receipt itself byte-for-byte intact.
 */
function stableReceiptDigest(receipt: Record<string, unknown>): string {
  const copy = { ...receipt };
  delete copy.idempotentReplay;
  delete copy.turnDisposition;
  return sha256Canonical(copy);
}

/**
 * Bounded snapshot of one durable record. Structural/data faults and
 * authority material are distinguished so an honest corrupted record never
 * masquerades as an authorization attempt.
 */
function snapshotRecord(value: unknown, label: string): Record<string, unknown> {
  const state = { nodes: 0 };
  const copied = snapshotValue(value, state, 0, label);
  if (!isPlainRecord(copied)) {
    refuse('META_EVIDENCE_INVALID', `${label} must be a plain record`);
  }
  if (JSON.stringify(copied).length > MAX_META_RECORD_CHARS) {
    refuse('META_EVIDENCE_OVERSIZED', `${label} exceeds the bounded record size`);
  }
  return copied;
}

function snapshotValue(value: unknown, state: { nodes: number }, depth: number, label: string): unknown {
  state.nodes += 1;
  if (state.nodes > 4096 || depth > 24) {
    refuse('META_EVIDENCE_OVERSIZED', `${label} exceeds the bounded record shape`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) {
    if (value.length > 128) refuse('META_EVIDENCE_OVERSIZED', `${label} array exceeds the bound`);
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        refuse('META_EVIDENCE_INVALID', `${label} contains a sparse or accessor array entry`);
      }
      result.push(snapshotValue(descriptor.value, state, depth + 1, label));
    }
    return result;
  }
  if (!isPlainRecord(value)) {
    refuse('META_EVIDENCE_INVALID', `${label} must contain only plain data`);
  }
  const keys = Object.keys(value);
  if (keys.length > 128) refuse('META_EVIDENCE_OVERSIZED', `${label} record exceeds the bound`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (AUTHORITY_KEYS.has(key)) {
      refuse('META_AUTHORITY_FORBIDDEN', `${label} carries authority/effect material`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      refuse('META_EVIDENCE_INVALID', `${label} contains an accessor property`);
    }
    if (SAFE_FALSE_FLAGS.has(key) && descriptor.value !== false) {
      refuse('META_AUTHORITY_FORBIDDEN', `${label} may only carry explicitly false capability flags`);
    }
    result[key] = snapshotValue(descriptor.value, state, depth + 1, label);
  }
  return result;
}

/**
 * The exact selected deployment/Business identity that scopes BOTH the
 * read-only evidence namespace and the create-only round records. It is
 * derived from the trusted activation binding, never from public input.
 */
export interface MetaFeedbackScope {
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly businessPackageId: string;
}

function scopeSnapshot(scope: MetaFeedbackScope): MetaFeedbackScope {
  if (!isPlainRecord(scope)) {
    refuse('META_OPTIONS_INVALID', 'meta feedback scope must be a plain record');
  }
  return Object.freeze({
    deployedAppId: bounded(scope.deployedAppId, 'scope.deployedAppId', MAX_SCOPE_COMPONENT),
    tenantId: bounded(scope.tenantId, 'scope.tenantId', MAX_SCOPE_COMPONENT),
    appId: bounded(scope.appId, 'scope.appId', MAX_SCOPE_COMPONENT),
    businessPackageId: bounded(scope.businessPackageId, 'scope.businessPackageId', MAX_SCOPE_COMPONENT),
  });
}

/**
 * The read-only evidence namespace of ONE deployment/tenant/App/Business
 * tuple. Every component is injectively encoded, so Tenant A can never point
 * Tenant B's runner at its records through an ambiguous key.
 */
export function metaFeedbackEvidencePrefix(scope: MetaFeedbackScope): string {
  const frozen = scopeSnapshot(scope);
  return `${META_FEEDBACK_EVIDENCE_KEY_PREFIX}${encodeKeyComponent(frozen.deployedAppId)}/${encodeKeyComponent(frozen.tenantId)}/${encodeKeyComponent(frozen.appId)}/${encodeKeyComponent(frozen.businessPackageId)}/`;
}

function roundIdentity(scope: MetaFeedbackScope, instanceKey: string, scheduleKey: string, round: number): string {
  const frozen = scopeSnapshot(scope);
  if (!Number.isSafeInteger(round) || round < 1 || round > MAX_META_ROUNDS) {
    refuse('META_ROUND_INVALID', `workflow.round must be an integer in [1, ${String(MAX_META_ROUNDS)}]`);
  }
  return [
    encodeKeyComponent(frozen.deployedAppId),
    encodeKeyComponent(frozen.tenantId),
    encodeKeyComponent(frozen.appId),
    encodeKeyComponent(frozen.businessPackageId),
    encodeKeyComponent(bounded(instanceKey, 'workflow.instanceKey')),
    encodeKeyComponent(bounded(scheduleKey, 'workflow.scheduleKey', 256)),
    String(round),
  ].join(':');
}

/** The terminal create-only ledger key of one exact round. */
export function metaFeedbackLedgerKey(scope: MetaFeedbackScope, instanceKey: string, scheduleKey: string, round: number): string {
  return `${META_FEEDBACK_LEDGER_PREFIX}${roundIdentity(scope, instanceKey, scheduleKey, round)}`;
}

/** The create-only pre-admission reservation key of one exact round. */
export function metaFeedbackClaimKey(scope: MetaFeedbackScope, instanceKey: string, scheduleKey: string, round: number): string {
  return `${META_FEEDBACK_CLAIM_PREFIX}${roundIdentity(scope, instanceKey, scheduleKey, round)}`;
}

function messageIdOf(scheduleKey: string, round: number, proposalDigest: string): string {
  return `meta:${scheduleKey}:${String(round)}:${proposalDigest}`;
}

export interface MetaFeedbackSources {
  /** Durable DecisionTrace/Candidate/Shadow record keys (bounded, deduplicated). */
  readonly evidenceKeys: readonly string[];
  readonly candidateKey?: string;
  readonly shadowKey?: string;
}

export interface MetaFeedbackWorkflowAddress {
  readonly intentType: string;
  readonly instanceKey: string;
  readonly scheduleKey: string;
  /** Explicit Host round; the same round is idempotent, not a timer. */
  readonly round: number;
}

export interface RunMetaFeedbackWorkflowOptions {
  /** The REAL activated selected App facade; a lookalike is refused. */
  readonly facade: V10AppFacade;
  /** Durable production document store (read evidence, create-only round records). */
  readonly store: V10DocStore;
  readonly workflow: MetaFeedbackWorkflowAddress;
  readonly sources: MetaFeedbackSources;
  readonly maxProposals?: number;
  readonly now?: () => number;
}

export interface MetaFeedbackAuthorityFlags {
  readonly proposalOnly: true;
  readonly canApprove: false;
  readonly canPromote: false;
  readonly canActivate: false;
  readonly canPublish: false;
  readonly kernelEffectPermit: false;
}

export interface MetaFeedbackResult {
  readonly status: 'proposed' | 'no-observation';
  readonly replayed: boolean;
  /**
   * True when this call consumed a pre-existing durable reservation left by
   * an earlier (crashed or still-running) attempt and finalized it. A fresh
   * reservation winner reports false.
   */
  readonly recovered: boolean;
  readonly proposals: readonly Readonly<Record<string, unknown>>[];
  readonly proposalDigest: string | null;
  readonly inputDigest: string;
  readonly round: number;
  readonly ledgerKey: string | null;
  /** The pre-admission reservation key of this round, when one was addressed. */
  readonly claimKey: string | null;
  readonly receipt: Readonly<Record<string, unknown>> | null;
  readonly receiptDigest: string | null;
  readonly counters: Readonly<{
    evidenceRecords: number;
    missingEvidence: number;
    candidateRecords: number;
    shadowRecords: number;
    proposals: number;
  }>;
  readonly authority: MetaFeedbackAuthorityFlags;
}

const AUTHORITY: MetaFeedbackAuthorityFlags = Object.freeze({
  proposalOnly: true,
  canApprove: false,
  canPromote: false,
  canActivate: false,
  canPublish: false,
  kernelEffectPermit: false,
});

interface ValidatedMetaFeedbackOptions {
  readonly facade: V10AppFacade;
  readonly store: V10DocStore;
  readonly workflow: MetaFeedbackWorkflowAddress;
  readonly sources: MetaFeedbackSources;
  readonly scope: MetaFeedbackScope;
  readonly evidencePrefix: string;
  readonly ledgerKey: string;
  readonly claimKey: string;
  readonly maxProposals: number;
  readonly now: () => number;
}

function optionsSnapshot(options: unknown): ValidatedMetaFeedbackOptions {
  if (!isPlainRecord(options)) {
    refuse('META_OPTIONS_INVALID', 'meta feedback options must be a plain record');
  }
  for (const key of Object.keys(options)) {
    if (!OPTION_FIELDS.has(key)) {
      refuse('META_OPTIONS_INVALID', `meta feedback options carry an unsupported field '${key}'`);
    }
  }
  if (!(options.facade instanceof V10AppFacade)) {
    refuse('META_OPTIONS_INVALID', 'the meta feedback runner requires the real activated V10AppFacade');
  }
  if (options.facade.isClosed()) {
    refuse('META_FACADE_CLOSED', 'the observed App facade is closed');
  }
  if (options.store === null || typeof options.store !== 'object'
    || typeof (options.store as { get?: unknown }).get !== 'function'
    || typeof (options.store as { put?: unknown }).put !== 'function') {
    refuse('META_OPTIONS_INVALID', 'a durable document store with get/put is required');
  }
  if (!isPlainRecord(options.workflow)) {
    refuse('META_OPTIONS_INVALID', 'workflow must be a plain record');
  }
  for (const key of Object.keys(options.workflow)) {
    if (!WORKFLOW_FIELDS.has(key)) {
      refuse('META_OPTIONS_INVALID', `workflow carries an unsupported field '${key}'`);
    }
  }
  const intentType = bounded(options.workflow.intentType, 'workflow.intentType', 256);
  if (intentType !== 'recordMetaFeedback') {
    refuse('META_OPTIONS_INVALID', 'this workflow drives only the selected recordMetaFeedback intent');
  }
  const instanceKey = bounded(options.workflow.instanceKey, 'workflow.instanceKey');
  const scheduleKey = bounded(options.workflow.scheduleKey, 'workflow.scheduleKey', 256);
  const round = options.workflow.round;
  if (!Number.isSafeInteger(round) || (round as number) < 1 || (round as number) > MAX_META_ROUNDS) {
    refuse('META_ROUND_INVALID', `workflow.round must be an integer in [1, ${String(MAX_META_ROUNDS)}]`);
  }

  // Trusted activation binding — the ONLY source of the evidence/ledger scope.
  // A caller cannot supply tenant/deployment/B claims; a facade activated
  // without a deployment identity is refused rather than degrading to a
  // shared global namespace.
  let binding: V10AppFacade['selectedShadowBinding'];
  let target: ReturnType<V10AppFacade['resolveIntentTarget']>;
  try {
    binding = options.facade.selectedShadowBinding;
    target = options.facade.resolveIntentTarget(intentType);
  } catch (error) {
    refuse('META_OPTIONS_INVALID', 'the facade exposes no trusted activation binding for this Business', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (binding.deployedAppId === null || binding.deploymentAppId === null) {
    refuse(
      'META_DEPLOYMENT_REQUIRED',
      'scoped meta feedback requires an activation deployment identity (deployedAppId/tenantId/appId); no unscoped fallback exists',
    );
  }
  const scope = scopeSnapshot({
    deployedAppId: binding.deployedAppId,
    tenantId: binding.tenantId,
    appId: binding.deploymentAppId,
    businessPackageId: target.businessPackageId,
  });
  if (!binding.businessPackageIds.includes(scope.businessPackageId)) {
    refuse('META_OPTIONS_INVALID', 'the resolved intent target is not a selected Business package of this activation');
  }
  const evidencePrefix = metaFeedbackEvidencePrefix(scope);

  if (!isPlainRecord(options.sources)) {
    refuse('META_OPTIONS_INVALID', 'sources must be a plain record');
  }
  for (const key of Object.keys(options.sources)) {
    if (!SOURCE_FIELDS.has(key)) {
      refuse('META_OPTIONS_INVALID', `sources carry an unsupported field '${key}'`);
    }
  }
  const rawKeys = options.sources.evidenceKeys;
  if (!Array.isArray(rawKeys) || rawKeys.length > MAX_META_EVIDENCE_KEYS) {
    refuse('META_OPTIONS_INVALID', `sources.evidenceKeys must be an array of at most ${String(MAX_META_EVIDENCE_KEYS)} keys`);
  }
  const evidenceKey = (raw: unknown, label: string): string => {
    const key = bounded(raw, label);
    if (!key.startsWith(META_FEEDBACK_EVIDENCE_KEY_PREFIX)) {
      refuse('META_OPTIONS_INVALID', `${label} must live under the meta evidence prefix ${META_FEEDBACK_EVIDENCE_KEY_PREFIX}`);
    }
    // Refuse a foreign scope BEFORE any physical read: the key must already
    // carry this exact deployment/tenant/App/Business tuple.
    if (!key.startsWith(evidencePrefix)) {
      refuse('META_EVIDENCE_FOREIGN_SCOPE', `${label} belongs to another deployment/tenant/Business evidence scope`, {
        key,
        expectedPrefix: evidencePrefix,
      });
    }
    return key;
  };
  const evidenceKeys = [...new Set(rawKeys.map((key) => evidenceKey(key, 'sources.evidenceKeys entry')))].sort();
  const candidateKey = options.sources.candidateKey === undefined
    ? undefined
    : evidenceKey(options.sources.candidateKey, 'sources.candidateKey');
  const shadowKey = options.sources.shadowKey === undefined
    ? undefined
    : evidenceKey(options.sources.shadowKey, 'sources.shadowKey');
  const maxProposals = options.maxProposals ?? 4;
  if (!Number.isSafeInteger(maxProposals) || (maxProposals as number) < 1 || (maxProposals as number) > 4) {
    refuse('META_OPTIONS_INVALID', 'maxProposals must be an integer in [1, 4]');
  }
  const now = options.now ?? Date.now;
  if (typeof now !== 'function') {
    refuse('META_OPTIONS_INVALID', 'now must be callable when provided');
  }
  return {
    facade: options.facade,
    store: options.store as unknown as V10DocStore,
    workflow: Object.freeze({ intentType, instanceKey, scheduleKey, round: round as number }),
    sources: Object.freeze({ evidenceKeys: Object.freeze(evidenceKeys), ...(candidateKey === undefined ? {} : { candidateKey }), ...(shadowKey === undefined ? {} : { shadowKey }) }),
    scope,
    evidencePrefix,
    ledgerKey: metaFeedbackLedgerKey(scope, instanceKey, scheduleKey, round as number),
    claimKey: metaFeedbackClaimKey(scope, instanceKey, scheduleKey, round as number),
    maxProposals: maxProposals as number,
    now: now as () => number,
  };
}

async function readRecord(store: V10DocStore, key: string, label: string): Promise<{ present: boolean; value: Record<string, unknown> | null }> {
  const doc = await store.get(key);
  if (doc === null || doc === undefined) return { present: false, value: null };
  return { present: true, value: snapshotRecord(doc.value, label) };
}

function sameScope(value: unknown, expected: MetaFeedbackScope): boolean {
  return isPlainRecord(value)
    && value.deployedAppId === expected.deployedAppId
    && value.tenantId === expected.tenantId
    && value.appId === expected.appId
    && value.businessPackageId === expected.businessPackageId;
}

function validateProposalOutput(raw: unknown, maxProposals: number): readonly Readonly<Record<string, unknown>>[] {
  if (!isPlainRecord(raw)) {
    refuse('META_PROPOSAL_INVALID', 'the selected meta feedback feature returned no plain report');
  }
  if (raw.proposalOnly !== true
    || raw.canApprove !== false
    || raw.canPromote !== false
    || raw.canActivate !== false
    || raw.canPublish !== false
    || raw.kernelEffectPermit !== false) {
    refuse('META_PROPOSAL_INVALID', 'the selected feature did not return an explicitly proposal-only report');
  }
  if (!Array.isArray(raw.proposals) || raw.proposals.length === 0 || raw.proposals.length > maxProposals) {
    refuse('META_PROPOSAL_INVALID', `the selected feature must return 1..${String(maxProposals)} proposals`);
  }
  const proposals: Readonly<Record<string, unknown>>[] = [];
  for (const item of raw.proposals) {
    if (!isPlainRecord(item)) {
      refuse('META_PROPOSAL_INVALID', 'each proposal must be a plain record');
    }
    for (const key of Object.keys(item)) {
      if (!PROPOSAL_FIELDS.has(key)) {
        refuse('META_PROPOSAL_INVALID', `a proposal carries an unsupported field '${key}'`);
      }
    }
    if (typeof item.proposalId !== 'string' || item.proposalId.length === 0 || item.proposalId.length > 256
      || typeof item.kind !== 'string' || item.kind.length === 0 || item.kind.length > 64
      || typeof item.summary !== 'string' || item.summary.length === 0 || item.summary.length > 240
      || !Array.isArray(item.evidenceRefs) || item.evidenceRefs.length > 4
      || item.evidenceRefs.some((ref) => typeof ref !== 'string' || ref.length === 0 || ref.length > 256)
      || item.authority !== 'proposal-only'
      || item.canApply !== false) {
      refuse('META_PROPOSAL_INVALID', 'a proposal has an invalid bounded shape');
    }
    proposals.push(Object.freeze({
      proposalId: item.proposalId,
      kind: item.kind,
      summary: item.summary,
      evidenceRefs: Object.freeze([...(item.evidenceRefs as string[])]),
      authority: 'proposal-only',
      canApply: false,
    }));
  }
  return Object.freeze(proposals);
}

interface Reservation {
  readonly inputDigest: string;
  readonly proposalDigest: string;
  readonly proposals: readonly Readonly<Record<string, unknown>>[];
  readonly messageId: string;
  readonly turnInput: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

/**
 * Validate the create-only pre-admission reservation of THIS exact round.
 * The message identity and the full turn input are recovered from the
 * reservation itself, so recovery cannot depend on a re-run feature result
 * or a caller-supplied digest.
 */
function reservationRecord(value: unknown, validated: ValidatedMetaFeedbackOptions): Reservation {
  const record = snapshotRecord(value, 'meta feedback reservation');
  const { scope, workflow, maxProposals } = validated;
  if (record.kind !== META_FEEDBACK_CLAIM_KIND
    || record.abi !== META_FEEDBACK_ABI
    || record.state !== META_FEEDBACK_CLAIM_STATE
    || !sameScope(record.scope, scope)
    || record.instanceKey !== workflow.instanceKey
    || record.scheduleKey !== workflow.scheduleKey
    || record.round !== workflow.round
    || typeof record.inputDigest !== 'string' || !HEX64.test(record.inputDigest)
    || typeof record.proposalDigest !== 'string' || !HEX64.test(record.proposalDigest)
    || !Array.isArray(record.proposals)
    || typeof record.messageId !== 'string' || record.messageId.length === 0 || record.messageId.length > MAX_IDENTIFIER
    || typeof record.createdAt !== 'string' || record.createdAt.length === 0 || record.createdAt.length > MAX_CREATED_AT) {
    refuse('META_CLAIM_INVALID', 'the durable meta feedback reservation has an unrecognized shape');
  }
  const proposals = validateProposalOutput({
    proposalOnly: true,
    canApprove: false,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
    proposals: record.proposals,
  }, maxProposals);
  if (sha256Canonical(proposals) !== record.proposalDigest) {
    refuse('META_CLAIM_INVALID', 'the durable reservation proposal digest does not match its recorded proposals');
  }
  if (record.messageId !== messageIdOf(workflow.scheduleKey, workflow.round, record.proposalDigest)) {
    refuse('META_CLAIM_INVALID', 'the durable reservation message identity is not the exact stable round identity');
  }
  const turnInput = snapshotRecord(record.turnInput, 'meta feedback reservation turn input');
  for (const key of Object.keys(turnInput)) {
    if (!TURN_INPUT_FIELDS.has(key)) {
      refuse('META_CLAIM_INVALID', `the durable reservation turn input carries an unsupported field '${key}'`);
    }
  }
  const firstProposal = proposals[0];
  if (turnInput.disposition !== 'proposal-only'
    || turnInput.effectCount !== 0
    || turnInput.proposalId !== firstProposal?.proposalId
    || turnInput.proposalDigest !== record.proposalDigest
    || typeof turnInput.evidenceDigest !== 'string' || !HEX64.test(turnInput.evidenceDigest)
    || (turnInput.candidateDigest !== undefined && (typeof turnInput.candidateDigest !== 'string' || !HEX64.test(turnInput.candidateDigest)))
    || (turnInput.shadowDigest !== undefined && (typeof turnInput.shadowDigest !== 'string' || !HEX64.test(turnInput.shadowDigest)))) {
    refuse('META_CLAIM_INVALID', 'the durable reservation turn input is not the exact proposal-only input');
  }
  return Object.freeze({
    inputDigest: record.inputDigest,
    proposalDigest: record.proposalDigest,
    proposals,
    messageId: record.messageId,
    turnInput: deepFreeze(turnInput),
    createdAt: record.createdAt,
  });
}

interface Ledger {
  readonly inputDigest: string;
  readonly proposalDigest: string;
  readonly proposals: readonly Readonly<Record<string, unknown>>[];
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptDigest: string;
  readonly createdAt: string;
}

/** Validate the terminal create-only ledger of THIS exact round. */
function ledgerRecord(value: unknown, validated: ValidatedMetaFeedbackOptions): Ledger {
  const record = snapshotRecord(value, 'meta feedback ledger');
  const { scope, workflow, maxProposals } = validated;
  if (record.kind !== META_FEEDBACK_LEDGER_KIND
    || record.abi !== META_FEEDBACK_ABI
    || record.state !== META_FEEDBACK_LEDGER_STATE
    || !sameScope(record.scope, scope)
    || record.instanceKey !== workflow.instanceKey
    || record.scheduleKey !== workflow.scheduleKey
    || record.round !== workflow.round
    || typeof record.inputDigest !== 'string' || !HEX64.test(record.inputDigest)
    || typeof record.proposalDigest !== 'string' || !HEX64.test(record.proposalDigest)
    || typeof record.receiptDigest !== 'string' || !HEX64.test(record.receiptDigest)
    || !Array.isArray(record.proposals)
    || !isPlainRecord(record.receipt)
    || typeof record.createdAt !== 'string' || record.createdAt.length === 0 || record.createdAt.length > MAX_CREATED_AT) {
    refuse('META_LEDGER_INVALID', 'the durable meta feedback ledger record has an unrecognized shape');
  }
  const proposals = validateProposalOutput({
    proposalOnly: true,
    canApprove: false,
    canPromote: false,
    canActivate: false,
    canPublish: false,
    kernelEffectPermit: false,
    proposals: record.proposals,
  }, maxProposals);
  if (sha256Canonical(proposals) !== record.proposalDigest) {
    refuse('META_LEDGER_INVALID', 'the durable ledger proposal digest does not match its recorded proposals');
  }
  if (sha256Canonical(record.receipt) !== record.receiptDigest) {
    refuse('META_LEDGER_INVALID', 'the durable ledger receipt digest does not match its recorded receipt');
  }
  return Object.freeze({
    inputDigest: record.inputDigest,
    proposalDigest: record.proposalDigest,
    proposals,
    receipt: deepFreeze(record.receipt),
    receiptDigest: record.receiptDigest,
    createdAt: record.createdAt,
  });
}

function resultOf(input: {
  status: 'proposed' | 'no-observation';
  replayed: boolean;
  recovered: boolean;
  proposals: readonly Readonly<Record<string, unknown>>[];
  proposalDigest: string | null;
  inputDigest: string;
  round: number;
  ledgerKey: string | null;
  claimKey: string | null;
  receipt: Readonly<Record<string, unknown>> | null;
  receiptDigest: string | null;
  counters: MetaFeedbackResult['counters'];
}): MetaFeedbackResult {
  return Object.freeze({
    status: input.status,
    replayed: input.replayed,
    recovered: input.recovered,
    proposals: input.proposals,
    proposalDigest: input.proposalDigest,
    inputDigest: input.inputDigest,
    round: input.round,
    ledgerKey: input.ledgerKey,
    claimKey: input.claimKey,
    receipt: input.receipt,
    receiptDigest: input.receiptDigest,
    counters: input.counters,
    authority: AUTHORITY,
  });
}

function replayFromLedger(
  validated: ValidatedMetaFeedbackOptions,
  value: unknown,
  inputDigest: string,
  counters: MetaFeedbackResult['counters'],
): MetaFeedbackResult {
  const record = ledgerRecord(value, validated);
  if (record.inputDigest !== inputDigest) {
    refuse('META_ROUND_CONFLICT', 'this schedule round already recorded a different evidence/candidate/shadow input', {
      ledgerKey: validated.ledgerKey,
      recordedInputDigest: record.inputDigest,
      currentInputDigest: inputDigest,
    });
  }
  return resultOf({
    status: 'proposed',
    replayed: true,
    recovered: false,
    proposals: record.proposals,
    proposalDigest: record.proposalDigest,
    inputDigest,
    round: validated.workflow.round,
    ledgerKey: validated.ledgerKey,
    claimKey: validated.claimKey,
    receipt: record.receipt,
    receiptDigest: record.receiptDigest,
    counters: Object.freeze({ ...counters, proposals: record.proposals.length }),
  });
}

/**
 * Send the ONE reserved business turn using the reservation's own durable
 * message identity and input, then commit the terminal ledger. Re-sending an
 * already-admitted identity is exactly the selected Kernel's replay path: it
 * returns the original receipt with no new State/Journal/Effect activity.
 */
async function finalizeReserved(
  validated: ValidatedMetaFeedbackOptions,
  reservation: Reservation,
  counters: MetaFeedbackResult['counters'],
  recovered: boolean,
): Promise<MetaFeedbackResult> {
  let receipt: Record<string, unknown>;
  try {
    const raw = await validated.facade.send({
      intentType: validated.workflow.intentType,
      instanceKey: validated.workflow.instanceKey,
      messageId: reservation.messageId,
      input: { ...reservation.turnInput },
    });
    if (!isPlainRecord(raw)) {
      refuse('META_WORKFLOW_DENIED', 'the selected Business workflow returned no honest receipt');
    }
    receipt = raw;
  } catch (error) {
    if (error instanceof MetaFeedbackError) throw error;
    refuse('META_WORKFLOW_DENIED', 'the selected Business workflow refused the proposal turn', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (receipt.status !== 'admitted') {
    refuse('META_WORKFLOW_DENIED', 'the selected Business workflow did not admit the proposal-only turn', {
      receiptStatus: receipt.status,
    });
  }
  const receiptSnapshot = deepFreeze(structuredClone(receipt));
  const receiptDigest = sha256Canonical(receiptSnapshot);
  const ledger = Object.freeze({
    kind: META_FEEDBACK_LEDGER_KIND,
    abi: META_FEEDBACK_ABI,
    state: META_FEEDBACK_LEDGER_STATE,
    scope: validated.scope,
    instanceKey: validated.workflow.instanceKey,
    scheduleKey: validated.workflow.scheduleKey,
    round: validated.workflow.round,
    inputDigest: reservation.inputDigest,
    proposalDigest: reservation.proposalDigest,
    proposals: reservation.proposals,
    receipt: receiptSnapshot,
    receiptDigest,
    createdAt: reservation.createdAt,
  });

  let recordedReceipt: Readonly<Record<string, unknown>> = receiptSnapshot;
  let recordedReceiptDigest = receiptDigest;
  try {
    await validated.store.put(validated.ledgerKey, ledger, { kind: 'create' });
  } catch (error) {
    if (!isCasConflict(error)) throw error;
    const raced = await validated.store.get(validated.ledgerKey);
    if (raced === null || raced === undefined) {
      refuse('META_ROUND_CONFLICT', 'the durable meta feedback ledger conflicted and could not be re-read', {
        ledgerKey: validated.ledgerKey,
      });
    }
    const record = ledgerRecord(raced.value, validated);
    if (record.inputDigest !== reservation.inputDigest || record.proposalDigest !== reservation.proposalDigest) {
      refuse('META_ROUND_CONFLICT', 'a concurrent writer recorded a different proposal for this schedule round', {
        ledgerKey: validated.ledgerKey,
      });
    }
    if (record.receiptDigest !== receiptDigest
      && stableReceiptDigest(record.receipt) !== stableReceiptDigest(receiptSnapshot)) {
      refuse('META_ROUND_CONFLICT', 'a concurrent writer recorded a different original receipt for this schedule round', {
        ledgerKey: validated.ledgerKey,
      });
    }
    recordedReceipt = record.receipt;
    recordedReceiptDigest = record.receiptDigest;
  }

  return resultOf({
    status: 'proposed',
    replayed: false,
    recovered,
    proposals: reservation.proposals,
    proposalDigest: reservation.proposalDigest,
    inputDigest: reservation.inputDigest,
    round: validated.workflow.round,
    ledgerKey: validated.ledgerKey,
    claimKey: validated.claimKey,
    receipt: recordedReceipt,
    receiptDigest: recordedReceiptDigest,
    counters: Object.freeze({ ...counters, proposals: reservation.proposals.length }),
  });
}

/**
 * Run exactly one explicit Host round of the recurring proposal-only meta
 * feedback workflow. The same `(scope, instance, schedule, round)` is
 * idempotent; the next round is a distinct bounded business turn. At most one
 * fresh writer can reserve a round, and only a reservation owner (or a later
 * recovery caller that observes the existing reservation) may send. No
 * approval/promotion/activation/publication/Effect operation exists on this
 * surface.
 */
export async function runMetaFeedbackWorkflow(options: RunMetaFeedbackWorkflowOptions): Promise<MetaFeedbackResult> {
  const validated = optionsSnapshot(options);
  const { facade, store, workflow, sources, maxProposals, now } = validated;

  const evidence: { key: string; value: Record<string, unknown> }[] = [];
  let missingEvidence = 0;
  for (const key of sources.evidenceKeys) {
    const record = await readRecord(store, key, `evidence ${key}`);
    if (!record.present) {
      missingEvidence += 1;
      continue;
    }
    evidence.push({ key, value: record.value as Record<string, unknown> });
  }
  const candidate = sources.candidateKey === undefined
    ? { present: false, value: null as Record<string, unknown> | null }
    : await readRecord(store, sources.candidateKey, `candidate ${sources.candidateKey}`);
  const shadow = sources.shadowKey === undefined
    ? { present: false, value: null as Record<string, unknown> | null }
    : await readRecord(store, sources.shadowKey, `shadow ${sources.shadowKey}`);

  const evidenceDigest = sha256Canonical(evidence.map((entry) => ({ key: entry.key, digest: sha256Canonical(entry.value) })));
  const candidateDigest = candidate.value === null ? null : sha256Canonical(candidate.value);
  const shadowDigest = shadow.value === null ? null : sha256Canonical(shadow.value);
  const inputDigest = sha256Canonical({ evidenceDigest, candidateDigest, shadowDigest });

  const counters = Object.freeze({
    evidenceRecords: evidence.length,
    missingEvidence,
    candidateRecords: candidate.present ? 1 : 0,
    shadowRecords: shadow.present ? 1 : 0,
    proposals: 0,
  });

  // A terminal committed round is authoritative: replay it without invoking
  // the feature or sending a second business turn.
  const existing = await store.get(validated.ledgerKey);
  if (existing !== null && existing !== undefined) {
    return replayFromLedger(validated, existing.value, inputDigest, counters);
  }

  // A reservation observed BEFORE any proposal work is an earlier attempt
  // (crashed or still running), never a simultaneous fresh competitor. It is
  // recovered from its own durable message identity and input.
  const existingClaim = await store.get(validated.claimKey);
  if (existingClaim !== null && existingClaim !== undefined) {
    const reservation = reservationRecord(existingClaim.value, validated);
    if (reservation.inputDigest !== inputDigest) {
      refuse('META_ROUND_CONFLICT', 'this schedule round was already reserved with a different evidence/candidate/shadow input', {
        claimKey: validated.claimKey,
        recordedInputDigest: reservation.inputDigest,
        currentInputDigest: inputDigest,
      });
    }
    return await finalizeReserved(validated, reservation, counters, true);
  }

  if (evidence.length === 0) {
    return resultOf({
      status: 'no-observation',
      replayed: false,
      recovered: false,
      proposals: Object.freeze([]),
      proposalDigest: null,
      inputDigest,
      round: workflow.round,
      ledgerKey: null,
      claimKey: null,
      receipt: null,
      receiptDigest: null,
      counters,
    });
  }

  let report: unknown;
  try {
    report = await facade.invokeSelectedStandardFeature(
      'standard:meta-feedback/1',
      Object.freeze({
        observations: Object.freeze(evidence.map((entry) => entry.value)),
        ...(candidate.value === null ? {} : { candidate: candidate.value }),
        ...(shadow.value === null ? {} : { shadow: shadow.value }),
      }),
      Object.freeze({}),
    );
  } catch (error) {
    if (error instanceof MetaFeedbackError) throw error;
    refuse('META_FEATURE_FAILED', 'the selected meta feedback feature failed closed', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const proposals = validateProposalOutput(report, maxProposals);
  const proposalDigest = sha256Canonical(proposals);
  const firstProposal = proposals[0];
  const firstProposalId = typeof firstProposal?.proposalId === 'string' ? firstProposal.proposalId : 'none';
  const messageId = messageIdOf(workflow.scheduleKey, workflow.round, proposalDigest);
  const turnInput = Object.freeze({
    disposition: 'proposal-only',
    effectCount: 0,
    proposalId: firstProposalId,
    proposalDigest,
    evidenceDigest,
    ...(candidateDigest === null ? {} : { candidateDigest }),
    ...(shadowDigest === null ? {} : { shadowDigest }),
  });
  const createdAt = new Date(now()).toISOString();
  const reservation = Object.freeze({
    kind: META_FEEDBACK_CLAIM_KIND,
    abi: META_FEEDBACK_ABI,
    state: META_FEEDBACK_CLAIM_STATE,
    scope: validated.scope,
    instanceKey: workflow.instanceKey,
    scheduleKey: workflow.scheduleKey,
    round: workflow.round,
    inputDigest,
    proposalDigest,
    proposals,
    messageId,
    turnInput,
    createdAt,
  });

  // Pre-admission CAS arbitration: exactly ONE fresh writer may proceed from
  // here to `facade.send`. A concurrent loser NEVER sends, even when its
  // proposal happens to match, because the reservation owner owns the turn.
  try {
    await store.put(validated.claimKey, reservation, { kind: 'create' });
  } catch (error) {
    if (!isCasConflict(error)) throw error;
    const raced = await store.get(validated.claimKey);
    if (raced === null || raced === undefined) {
      refuse('META_ROUND_CONFLICT', 'the durable meta feedback reservation conflicted and could not be re-read', {
        claimKey: validated.claimKey,
      });
    }
    const other = reservationRecord(raced.value, validated);
    if (other.inputDigest !== inputDigest || other.proposalDigest !== proposalDigest) {
      refuse('META_ROUND_CONFLICT', 'a concurrent writer reserved this schedule round with a different selected proposal', {
        claimKey: validated.claimKey,
      });
    }
    refuse('META_ROUND_IN_PROGRESS', 'another writer owns this schedule round reservation; retry after it finalizes', {
      claimKey: validated.claimKey,
    });
  }

  const reserved = reservationRecord(reservation, validated);
  return await finalizeReserved(validated, reserved, counters, false);
}
