/**
 * DomainHarness v0.10 T07 (#1174) — Host-owned read-only Shadow L4 runner.
 * =====================================================================
 *
 * The pure Standard candidate feature
 * (`payload/sfeature-candidate-validation-v1.mjs`) validates *reported*
 * counterexamples and deliberately reports `productionWritesVerifiedZero:
 * false`: a selected feature invoked by a business caller can never prove
 * what the Host did or did not write. This module is the Host-owned trusted
 * counterpart that closes that gap for the T07 evidence:
 *
 *   (1) IDENTITY — the candidate is an exact byte-pinned source (the runner
 *       hashes the bytes itself) and the approved fallback is the ACTUAL
 *       selected module of the real built App: its package identity, exact
 *       `moduleSha256`, and the selected subject digest must all match. A
 *       missing, revoked or unpinned identity is a typed refusal, never a
 *       "latest" fallback.
 *   (2) READ-ONLY OBSERVATION — the actual selected K documents are read
 *       through a narrow `get`/`keys` view of the production store under the
 *       EXACT K02 physical prefixes of this activated deployment: the
 *       stable `v10/k/deployment:<deployedAppId>:<tenantId>:<appId>/` outer
 *       namespace plus each selected Business's injective `v010-k02:`
 *       tuple prefix, derived from the facade's private deployment identity. The
 *       BUILD/tenant arguments are only cross-checked against that binding;
 *       they never widen or define the observed prefix set. A nil deployment
 *       binding is a typed refusal, never a fallback to the whole App/Tenant
 *       namespace (two deployments of one BUILD/Tenant must stay disjoint).
 *       The runner never receives `put`, `remove`, `resources`, Memory, cache
 *       or the facade dispatcher. The observations are canonicalized, bounded
 *       and deep-frozen before any evaluator sees them.
 *   (3) ISOLATED EVALUATION — candidate and fallback source bytes are
 *       compiled and executed in a fresh `node:vm` context per evaluator
 *       with no process/network/module access, code generation disabled,
 *       non-determinism (`Math.random`, `Date.now`) refused, and a
 *       synchronous wall-clock budget. The evaluator receives only the
 *       frozen observation snapshot and App identity.
 *   (4) ZERO-WRITE WITNESS — before and after the evaluation the runner
 *       re-reads the selected K snapshot and a Host-supplied physical witness
 *       (for example SQLite file/WAL digests and `total_changes()`), then
 *       reports whether both are unchanged. `productionWritesVerifiedZero` is
 *       true only when the physical witness was captured on both sides and
 *       the snapshots agree.
 *
 * The runner grants no authority: it cannot approve or promote a candidate,
 * cannot activate a new BUILD, cannot mint a K Effect permit, and has no
 * effect/capability port. Candidate disagreement or evaluator failure leaves
 * the exact approved fallback untouched and the production snapshot
 * unchanged; the report is evidence, not an activation request.
 */
import { V10Error } from '../v10build/errors.js';
import { isPlainRecord } from '../v10build/guards.js';
import * as vm from 'node:vm';

import { V10AppFacade, v10DeploymentDocsPrefix, v10K02DocumentPrefix } from '../v10build/activation.js';
import type { V10AppView } from '../v10build/activation.js';
import { canonicalJson, sha256Canonical, sha256Hex } from '../v10build/digest.js';

export const SHADOW_L4_ABI = 'dh.v10.shadow-l4-readonly/1';
export const SHADOW_L4_EVIDENCE_KIND = 'shadow-l4-evidence';
/** Physical K docs root; the governed outer namespace is the stable deployment tuple. */
export const SHADOW_K_DOCS_PREFIX = 'v10/k/';

const KINDS = new Set(['Rule', 'Skill', 'DecisionProcedure', 'Workflow']);
const APPROVAL_STATES = new Set(['candidate', 'approved', 'revoked']);
const HEX64 = /^[a-f0-9]{64}$/;
const EXACT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/;
const LATEST = /^(?:latest|\*|head)$/i;
const MAX_SOURCE_CHARS = 262_144;
const MAX_OBSERVATION_CHARS = 65_536;
const MAX_OUTPUT_CHARS = 32_768;
const MAX_OUTPUT_NODES = 512;
const MAX_OUTPUT_DEPTH = 24;
const MAX_MESSAGE_CHARS = 400;
const MAX_CASES = 32;
const DEFAULT_EVALUATION_TIMEOUT_MS = 50;
const MAX_EVALUATION_TIMEOUT_MS = 5_000;
/** Same authority vocabulary the pure candidate feature refuses. */
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  '__proto__', 'prototype', 'constructor', 'effectPermit', 'permit',
  'effectIntents', 'effectJournal', 'admissionFence', 'kernelState',
  'kernelReceipt', 'hostPorts', 'resources', 'write', 'activate',
  'selfApprove', 'promote',
]);

export type ShadowL4Kind = 'Rule' | 'Skill' | 'DecisionProcedure' | 'Workflow';
export type ShadowL4ApprovalState = 'candidate' | 'approved' | 'revoked';

export class ShadowL4Error extends V10Error {
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(code, message, options);
    this.name = 'ShadowL4Error';
  }
}

function refuse(code: string, message: string, options?: { cause?: unknown }): never {
  throw new ShadowL4Error(code, message, options);
}


function boundedString(value: unknown, label: string, max = 256): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    refuse('SHADOW_PIN_INVALID', `${label} requires a bounded nonempty string`);
  }
  return value;
}

function errorMessage(value: unknown): string {
  if (value !== null && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message.slice(0, MAX_MESSAGE_CHARS);
  }
  return String(value).slice(0, MAX_MESSAGE_CHARS);
}

function errorCode(value: unknown): string | null {
  if (value !== null && typeof value === 'object' && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Exact identity of one pinned version (digest/revision/provenance included). */
export interface ShadowL4VersionPin {
  readonly kind: ShadowL4Kind;
  readonly id: string;
  readonly revision: string;
  readonly sha256: string;
  readonly provenance: string;
  readonly approvalState: ShadowL4ApprovalState;
}

/** One actual selected K document observed by the shadow runner. */
export interface ShadowKObservation {
  readonly key: string;
  readonly revision: number;
  readonly value: unknown;
  readonly valueSha256: string;
}

/**
 * The ONLY store surface the shadow runner receives. A `V10DocStore` is
 * structurally assignable, but the runner never names or calls any mutation
 * member; the production write path remains outside this module.
 */
export interface ShadowKReadStore {
  get(key: string): Promise<{ value: unknown; revision: number } | null>;
  keys(): readonly string[] | Promise<readonly string[]>;
}

/**
 * The activation-origin identity a shadow run is pinned to. Every field is
 * read from the real facade's private state; the runner's own tenant/BUILD
 * arguments only have to agree with it.
 */
interface ShadowActivatedIdentity {
  readonly subjectDigest: string;
  readonly appId: string;
  readonly tenantId: string;
  readonly deployedAppId: string;
  readonly businessPackageIds: readonly string[];
  readonly namespace: string;
  readonly documentPrefixes: readonly string[];
}

export interface ShadowL4CaseEvidence {
  readonly caseId: string;
  readonly key: string;
  readonly revision: number;
  readonly valueSha256: string;
  readonly candidateOutputSha256: string;
  readonly baselineOutputSha256: string;
  readonly same: boolean;
}

export interface ShadowL4Failure {
  readonly code: string;
  readonly caseId: string | null;
  readonly message: string;
}

export interface ShadowL4Report {
  readonly kind: typeof SHADOW_L4_EVIDENCE_KIND;
  readonly shadowAbi: typeof SHADOW_L4_ABI;
  readonly appSubjectDigest: string;
  /** The exact activated deployment instance whose K rows were observed. */
  readonly deployedAppId: string;
  readonly tenantId: string;
  readonly candidate: ShadowL4VersionPin;
  readonly candidateApproval: {
    readonly state: ShadowL4ApprovalState;
    readonly authority: 'host-admission' | 'explicit-candidate';
  };
  readonly approvedFallback: ShadowL4VersionPin & { readonly selectedPackageId: string };
  readonly budget: { readonly maxCases: number; readonly maxComparisons: number };
  readonly observations: {
    /** The App/Tenant K namespace; selection is narrowed to `documentPrefixes`. */
    readonly prefix: string;
    /** The exact deployment/B K02 prefixes the snapshot was selected from. */
    readonly documentPrefixes: readonly string[];
    readonly total: number;
    readonly considered: number;
    readonly truncated: boolean;
    readonly snapshotSha256: string;
    readonly keys: readonly string[];
  };
  readonly comparisons: number;
  readonly matchingCaseIds: readonly string[];
  readonly differingCaseIds: readonly string[];
  readonly cases: readonly ShadowL4CaseEvidence[];
  readonly differencePreview: string | null;
  readonly status: 'match' | 'difference' | 'shadow-failed';
  readonly failure: ShadowL4Failure | null;
  readonly production: {
    readonly beforeSnapshotSha256: string;
    readonly afterSnapshotSha256: string | null;
    readonly snapshotUnchanged: boolean;
    readonly physicalWitnessBeforeSha256: string;
    readonly physicalWitnessAfterSha256: string | null;
    readonly physicalWitnessUnchanged: boolean;
    readonly storeReads: number;
    readonly storeMutationMethodsUsed: 0;
    readonly externalEffectCalls: 0;
    readonly memoryWrites: 0;
    readonly cacheWrites: 0;
    readonly productionWritesVerifiedZero: boolean;
  };
  readonly evidenceAuthority: 'host-owned-readonly-shadow';
  readonly canSelfApprove: false;
  readonly canPromote: false;
  readonly kernelEffectPermit: false;
  readonly replayDigest: string;
}

export interface ShadowL4RunnerOptions {
  /** The REAL activated App facade (lookalikes are refused). */
  readonly facade: V10AppFacade;
  /** The BUILD view of that same App (selected module bytes/digests). */
  readonly app: V10AppView;
  /** Narrow read-only K view of the production store. */
  readonly store: ShadowKReadStore;
  readonly tenantId: string;
  readonly candidate: {
    readonly pin: ShadowL4VersionPin;
    /** Exact controlled candidate bytes; `sha256(source)` must equal the pin. */
    readonly source: string;
    readonly exportName?: string;
  };
  readonly approvedFallback: {
    readonly pin: ShadowL4VersionPin;
    /** The actual selected module this exact fallback pins. */
    readonly selectedPackageId: string;
    readonly exportName?: string;
  };
  readonly budget: {
    readonly maxCases: number;
    readonly maxComparisons: number;
  };
  /**
   * Host-owned trusted approval record. Required when the candidate pin
   * claims `approved`; a pin's own claim is never trusted by itself.
   */
  readonly trustedCandidateApproval?: {
    readonly id: string;
    readonly revision: string;
    readonly sha256: string;
    readonly state: 'approved';
  };
  /**
   * Mandatory physical zero-write witness. Captured before and after the
   * shadow run; canonical equality is the physical zero-write proof (for
   * example: SQLite DB/WAL digests plus a read-only `total_changes()`).
   */
  readonly physicalWitness: () => unknown;
  /** Per-evaluator synchronous wall-clock bound. */
  readonly evaluationTimeoutMs?: number;
}

/** The exact provenance the Host pins for an actually selected fallback module. */
export function selectedFallbackProvenance(app: V10AppView, selectedPackageId: string): string {
  return `selected:${app.subjectDigest}:${selectedPackageId}`;
}

function selectedModule(app: V10AppView, packageId: string): V10AppView['modules'][number] {
  if (typeof packageId !== 'string' || packageId.length === 0 || packageId.length > 256) {
    refuse('SHADOW_FALLBACK_NOT_SELECTED', 'approvedFallback.selectedPackageId is required');
  }
  const module = app.modules.find((entry) => entry.packageId === packageId);
  if (module === undefined) {
    refuse('SHADOW_FALLBACK_NOT_SELECTED', `approved fallback module ${packageId} is not selected in this App`);
  }
  return module;
}

/**
 * Host admission helper: derive the exact approved fallback pin from the
 * actually selected module bytes. The Host supplies the logical candidate
 * identity (kind/id); every byte/revision/provenance field is derived here,
 * not taken from candidate or business data.
 */
export function selectedFallbackPin(
  app: V10AppView,
  options: { readonly selectedPackageId: string; readonly kind: ShadowL4Kind; readonly id: string },
): ShadowL4VersionPin {
  if (!KINDS.has(options.kind)) {
    refuse('SHADOW_PIN_INVALID', 'approved fallback kind must be one of Rule/Skill/DecisionProcedure/Workflow');
  }
  const module = selectedModule(app, options.selectedPackageId);
  const sha256 = module.moduleSha256;
  if (typeof sha256 !== 'string' || !HEX64.test(sha256)) {
    refuse('SHADOW_FALLBACK_PIN_MISMATCH', `selected module ${options.selectedPackageId} carries no sealed byte digest`);
  }
  return Object.freeze({
    kind: options.kind,
    id: boundedString(options.id, 'approvedFallback.id'),
    revision: module.packageId,
    sha256,
    provenance: selectedFallbackProvenance(app, module.packageId),
    approvalState: 'approved',
  });
}

/** Pin exact candidate source bytes under a Host-supplied logical identity. */
export function pinCandidateSource(
  identity: Omit<ShadowL4VersionPin, 'sha256'>,
  source: string,
): ShadowL4VersionPin {
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_SOURCE_CHARS) {
    refuse('SHADOW_CANDIDATE_INVALID', 'candidate source must be bounded nonempty bytes');
  }
  return parsePin({ ...identity, sha256: sha256Hex(source) }, 'candidate');
}

function parsePin(raw: unknown, label: string): ShadowL4VersionPin {
  if (!isPlainRecord(raw)) refuse('SHADOW_PIN_INVALID', `${label} pin missing`);
  const kind = boundedString(raw.kind, `${label}.kind`);
  if (!KINDS.has(kind)) {
    refuse('SHADOW_PIN_INVALID', `${label}.kind must be Rule/Skill/DecisionProcedure/Workflow`);
  }
  const revision = boundedString(raw.revision, `${label}.revision`);
  if (LATEST.test(revision)) {
    refuse('SHADOW_PIN_INVALID', `${label}.revision must be an exact pinned revision, not '${revision}'`);
  }
  const sha256 = boundedString(raw.sha256, `${label}.sha256`);
  if (!HEX64.test(sha256)) {
    refuse('SHADOW_PIN_INVALID', `${label}.sha256 must be an exact 64-hex digest`);
  }
  const provenance = boundedString(raw.provenance, `${label}.provenance`);
  if (LATEST.test(provenance)) {
    refuse('SHADOW_PIN_INVALID', `${label}.provenance must identify exact bytes, not '${provenance}'`);
  }
  const approvalState = boundedString(raw.approvalState, `${label}.approvalState`);
  if (!APPROVAL_STATES.has(approvalState)) {
    refuse('SHADOW_PIN_INVALID', `${label}.approvalState must be candidate/approved/revoked`);
  }
  return Object.freeze({
    kind: kind as ShadowL4Kind,
    id: boundedString(raw.id, `${label}.id`),
    revision,
    sha256,
    provenance,
    approvalState: approvalState as ShadowL4ApprovalState,
  });
}

function pinIdentity(pin: ShadowL4VersionPin): string {
  return JSON.stringify([pin.kind, pin.id, pin.revision, pin.sha256, pin.provenance]);
}

interface CapturedSnapshot {
  readonly namespace: string;
  readonly documentPrefixes: readonly string[];
  readonly total: number;
  readonly considered: number;
  readonly truncated: boolean;
  readonly observations: readonly ShadowKObservation[];
  readonly snapshotSha256: string;
}

async function captureSelectedKSnapshot(
  store: ShadowKReadStore,
  namespace: string,
  documentPrefixes: readonly string[],
  limit: number,
  reads: { count: number },
): Promise<CapturedSnapshot> {
  let keys: readonly string[];
  try {
    const listed = await store.keys();
    if (!Array.isArray(listed)) {
      refuse('SHADOW_READ_INTERFACE_MISSING', 'the Host read-only store view returned no key list');
    }
    keys = listed;
  } catch (error) {
    if (error instanceof ShadowL4Error) throw error;
    refuse('SHADOW_READ_INTERFACE_MISSING', `the Host read-only store view cannot list keys: ${errorMessage(error)}`, { cause: error });
  }
  // Selection is the UNION of this deployment's exact K02 per-B
  // prefixes only. A sibling deployment of the same BUILD/Tenant shares the
  // parent namespace but never one of these prefixes, so its keys cannot
  // consume the case budget or masquerade as this deployment's observations.
  const matching = keys
    .filter((key): key is string => typeof key === 'string'
      && documentPrefixes.some((documentPrefix) => key.startsWith(documentPrefix)))
    .sort();
  const selected = matching.slice(0, limit);
  const observations: ShadowKObservation[] = [];
  for (const key of selected) {
    reads.count += 1;
    let document: { value: unknown; revision: number } | null;
    try {
      document = await store.get(key);
    } catch (error) {
      refuse('SHADOW_OBSERVATION_READ_FAILED', `selected K document ${key} could not be read: ${errorMessage(error)}`, { cause: error });
    }
    if (document === null) {
      refuse('SHADOW_OBSERVATION_MISSING', `selected K document ${key} disappeared while the shadow snapshot was read`);
    }
    if (!Number.isSafeInteger(document.revision) || document.revision < 0) {
      refuse('SHADOW_OBSERVATION_INVALID', `selected K document ${key} carries no valid revision`);
    }
    let canonical: string;
    try {
      canonical = canonicalJson(document.value);
    } catch (error) {
      refuse('SHADOW_OBSERVATION_INVALID', `selected K document ${key} is not bounded plain data: ${errorMessage(error)}`, { cause: error });
    }
    if (canonical.length > MAX_OBSERVATION_CHARS) {
      refuse('SHADOW_OBSERVATION_TOO_LARGE', `selected K document ${key} exceeds the shadow observation bound`);
    }
    observations.push(Object.freeze({
      key,
      revision: document.revision,
      value: deepFreeze(JSON.parse(canonical) as unknown),
      valueSha256: sha256Hex(canonical),
    }));
  }
  const snapshotSha256 = sha256Canonical({
    namespace,
    documentPrefixes,
    observations: observations.map((observation) => ({
      key: observation.key,
      revision: observation.revision,
      valueSha256: observation.valueSha256,
    })),
  });
  return Object.freeze({
    namespace,
    documentPrefixes: Object.freeze([...documentPrefixes]),
    total: matching.length,
    considered: observations.length,
    truncated: matching.length > observations.length,
    observations: Object.freeze(observations),
    snapshotSha256,
  });
}

async function captureWitness(capture: () => unknown): Promise<string> {
  let value: unknown;
  try {
    value = await capture();
  } catch (error) {
    refuse('SHADOW_WITNESS_FAILED', `the Host physical witness could not be captured: ${errorMessage(error)}`, { cause: error });
  }
  if (value === undefined || value === null) {
    refuse('SHADOW_WITNESS_FAILED', 'the Host physical witness returned no evidence; an empty witness is never zero-write proof');
  }
  return sha256Canonical(value);
}

const CALL_SCRIPT_SOURCE = `(function () {
  'use strict';
  function deepFreeze(value) {
    if (value !== null && typeof value === 'object') {
      for (var key of Object.keys(value)) deepFreeze(value[key]);
      Object.freeze(value);
    }
    return value;
  }
  var input = deepFreeze(JSON.parse(__shadowInputJson));
  var deps = deepFreeze(JSON.parse(__shadowDepsJson));
  var output = __shadowEvaluator(input, deps);
  if (output !== null && typeof output === 'object' && typeof output.then === 'function') {
    throw new Error('SHADOW_ASYNC_EVALUATOR');
  }
  var text = JSON.stringify(output);
  if (typeof text !== 'string') throw new Error('SHADOW_OUTPUT_NOT_JSON');
  return text;
})()`;

interface EvaluatorFailure {
  readonly code: string;
  readonly message: string;
}

interface EvaluatorResult {
  readonly canonical: string;
  readonly failure: EvaluatorFailure | null;
}

interface CompiledEvaluator {
  evaluate(input: unknown, deps: unknown): EvaluatorResult;
}

function evaluatorRoleCode(role: 'candidate' | 'baseline', suffix: string): string {
  return `SHADOW_${role.toUpperCase()}_${suffix}`;
}

function classifyEvaluatorError(error: unknown, role: 'candidate' | 'baseline'): EvaluatorFailure {
  const code = errorCode(error);
  const message = errorMessage(error);
  if (code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || message.includes('Script execution timed out')) {
    return Object.freeze({ code: evaluatorRoleCode(role, 'TIMEOUT'), message: `${role} evaluator exceeded its synchronous time budget` });
  }
  if (message.includes('SHADOW_ASYNC_EVALUATOR')) {
    return Object.freeze({ code: evaluatorRoleCode(role, 'ASYNC_FORBIDDEN'), message: `${role} evaluator must be synchronous and pure` });
  }
  if (message.includes('SHADOW_NONDETERMINISM_FORBIDDEN')) {
    return Object.freeze({ code: evaluatorRoleCode(role, 'NONDETERMINISM'), message: `${role} evaluator requested a non-deterministic clock/random source` });
  }
  if (message.includes('SHADOW_OUTPUT_NOT_JSON')) {
    return Object.freeze({ code: evaluatorRoleCode(role, 'OUTPUT_INVALID'), message: `${role} evaluator did not return JSON data` });
  }
  return Object.freeze({ code: evaluatorRoleCode(role, 'THREW'), message: `${role} evaluator failed: ${message}` });
}

function stripModuleExports(source: string, label: string): string {
  if (/\bimport\s*(?:\(|['"`])/u.test(source) || /\bimport\s+(?:[\w*{]|type\b)/u.test(source) || /\brequire\s*\(/u.test(source)) {
    refuse('SHADOW_EVALUATOR_IMPORT_FORBIDDEN', `${label} evaluator source may not import or require anything`);
  }
  if (/\bexport\s+default\b/u.test(source)) {
    refuse('SHADOW_EVALUATOR_EXPORT_INVALID', `${label} evaluator source must use a named export`);
  }
  const stripped = source.replace(/^(\s*)export\s+(?=(?:async\s+)?function|const|let|var|class)\b/gm, '$1');
  if (/\bexport\b/u.test(stripped)) {
    refuse('SHADOW_EVALUATOR_EXPORT_INVALID', `${label} evaluator source carries an unsupported export form`);
  }
  return stripped;
}

function compileEvaluator(options: {
  readonly source: string;
  readonly exportName: string;
  readonly role: 'candidate' | 'baseline';
  readonly label: string;
  readonly timeoutMs: number;
}): CompiledEvaluator {
  if (typeof options.exportName !== 'string' || !EXACT_IDENTIFIER.test(options.exportName)) {
    refuse('SHADOW_EVALUATOR_EXPORT_INVALID', `${options.role} evaluator export name must be a plain identifier`);
  }
  const stripped = stripModuleExports(options.source, options.role);
  const filename = `shadow-${options.role}-${options.label}`;
  const sandbox = Object.create(null) as Record<string, unknown>;
  const context = vm.createContext(sandbox, {
    name: filename,
    codeGeneration: { strings: false, wasm: false },
  });
  const contextRecord = context as Record<string, unknown>;
  try {
    // Deterministic evaluators only: the host clock and random source are
    // refused inside the isolated context, so a replay digest cannot drift
    // because of ambient state.
    new vm.Script(
      `(function () { 'use strict';
        Math.random = function () { throw new Error('SHADOW_NONDETERMINISM_FORBIDDEN'); };
        Date.now = function () { throw new Error('SHADOW_NONDETERMINISM_FORBIDDEN'); };
      })()`,
      { filename: `${filename}-prelude` },
    ).runInContext(context, { timeout: options.timeoutMs });
    const factory = new vm.Script(
      `(function () { 'use strict';\n${stripped}\n;return typeof ${options.exportName} === 'function' ? ${options.exportName} : null; })()`,
      { filename: `${filename}-factory` },
    );
    const evaluator = factory.runInContext(context, { timeout: options.timeoutMs }) as unknown;
    if (typeof evaluator !== 'function') {
      refuse('SHADOW_EVALUATOR_MISSING', `${options.role} evaluator source does not export ${options.exportName}`);
    }
    contextRecord.__shadowEvaluator = evaluator;
  } catch (error) {
    if (error instanceof ShadowL4Error) throw error;
    const failure = classifyEvaluatorError(error, options.role);
    const code = failure.code.endsWith('_TIMEOUT')
      ? failure.code
      : evaluatorRoleCode(options.role, 'COMPILE_FAILED');
    refuse(code, `the ${options.role} evaluator could not be compiled: ${failure.message}`, { cause: error });
  }
  const callScript = new vm.Script(CALL_SCRIPT_SOURCE, { filename: `${filename}-call` });
  return Object.freeze({
    evaluate(input: unknown, deps: unknown): EvaluatorResult {
      let inputJson: string;
      let depsJson: string;
      try {
        inputJson = JSON.stringify(input ?? null);
        depsJson = JSON.stringify(deps ?? null);
      } catch (error) {
        return Object.freeze({
          canonical: '',
          failure: Object.freeze({ code: evaluatorRoleCode(options.role, 'INPUT_INVALID'), message: `shadow input is not JSON data: ${errorMessage(error)}` }),
        });
      }
      contextRecord.__shadowInputJson = inputJson;
      contextRecord.__shadowDepsJson = depsJson;
      let text: unknown;
      try {
        text = callScript.runInContext(context, { timeout: options.timeoutMs });
      } catch (error) {
        return Object.freeze({ canonical: '', failure: classifyEvaluatorError(error, options.role) });
      }
      if (typeof text !== 'string') {
        return Object.freeze({
          canonical: '',
          failure: Object.freeze({ code: evaluatorRoleCode(options.role, 'OUTPUT_INVALID'), message: `${options.role} evaluator returned no JSON text` }),
        });
      }
      if (text.length > MAX_OUTPUT_CHARS) {
        return Object.freeze({
          canonical: '',
          failure: Object.freeze({ code: evaluatorRoleCode(options.role, 'OUTPUT_TOO_LARGE'), message: `${options.role} evaluator output exceeds the shadow bound` }),
        });
      }
      let value: unknown;
      try {
        value = JSON.parse(text) as unknown;
      } catch (error) {
        return Object.freeze({
          canonical: '',
          failure: Object.freeze({ code: evaluatorRoleCode(options.role, 'OUTPUT_INVALID'), message: `${options.role} evaluator output is not JSON: ${errorMessage(error)}` }),
        });
      }
      const inspection = inspectOutput(value, options.role);
      if (inspection.failure !== null) {
        return Object.freeze({ canonical: '', failure: inspection.failure });
      }
      return Object.freeze({ canonical: inspection.canonical, failure: null });
    },
  });
}

function inspectOutput(value: unknown, role: 'candidate' | 'baseline'): {
  readonly canonical: string;
  readonly failure: EvaluatorFailure | null;
} {
  let nodes = 0;
  let tooLarge = false;
  const walk = (node: unknown, depth: number): string | null => {
    nodes += 1;
    if (nodes > MAX_OUTPUT_NODES || depth > MAX_OUTPUT_DEPTH) {
      tooLarge = true;
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found !== null || tooLarge) return found;
      }
      return null;
    }
    if (node !== null && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (FORBIDDEN_AUTHORITY_KEYS.has(key)) return key;
        const found = walk((node as Record<string, unknown>)[key], depth + 1);
        if (found !== null || tooLarge) return found;
      }
    }
    return null;
  };
  const forbidden = walk(value, 0);
  if (forbidden !== null) {
    return Object.freeze({
      canonical: '',
      failure: Object.freeze({
        code: evaluatorRoleCode(role, 'EFFECT_PROPOSAL'),
        message: `${role} evaluator output carries privileged authority '${forbidden}'`,
      }),
    });
  }
  if (tooLarge) {
    return Object.freeze({
      canonical: '',
      failure: Object.freeze({
        code: evaluatorRoleCode(role, 'OUTPUT_TOO_LARGE'),
        message: `${role} evaluator output exceeds the bounded evidence shape`,
      }),
    });
  }
  let canonical: string;
  try {
    canonical = canonicalJson(value);
  } catch (error) {
    return Object.freeze({
      canonical: '',
      failure: Object.freeze({
        code: evaluatorRoleCode(role, 'OUTPUT_INVALID'),
        message: `${role} evaluator output is not canonical plain data: ${errorMessage(error)}`,
      }),
    });
  }
  if (canonical.length > MAX_OUTPUT_CHARS) {
    return Object.freeze({
      canonical: '',
      failure: Object.freeze({
        code: evaluatorRoleCode(role, 'OUTPUT_TOO_LARGE'),
        message: `${role} evaluator output exceeds the shadow bound`,
      }),
    });
  }
  return Object.freeze({ canonical, failure: null });
}

interface EvaluationOutcome {
  readonly status: 'match' | 'difference' | 'shadow-failed';
  readonly failure: ShadowL4Failure | null;
  readonly comparisons: number;
  readonly cases: readonly ShadowL4CaseEvidence[];
  readonly matchingCaseIds: readonly string[];
  readonly differingCaseIds: readonly string[];
  readonly differencePreview: string | null;
}

/** Keep both the head and the tail of a differing output (keys can be long). */
function boundedPreview(text: string): string {
  return text.length <= 768 ? text : `${text.slice(0, 384)}…${text.slice(-384)}`;
}

function failedOutcome(
  code: string,
  caseId: string | null,
  message: string,
  comparisons: number,
  cases: readonly ShadowL4CaseEvidence[],
  matching: readonly string[],
  differing: readonly string[],
): EvaluationOutcome {
  return Object.freeze({
    status: 'shadow-failed',
    failure: Object.freeze({ code, caseId, message: message.slice(0, MAX_MESSAGE_CHARS) }),
    comparisons,
    cases: Object.freeze([...cases]),
    matchingCaseIds: Object.freeze([...matching]),
    differingCaseIds: Object.freeze([...differing]),
    differencePreview: null,
  });
}

function evaluateSelectedObservations(
  snapshot: CapturedSnapshot,
  candidate: CompiledEvaluator,
  baseline: CompiledEvaluator,
  deps: Record<string, unknown>,
): EvaluationOutcome {
  const cases: ShadowL4CaseEvidence[] = [];
  const matching: string[] = [];
  const differing: string[] = [];
  let preview: string | null = null;
  for (const [index, observation] of snapshot.observations.entries()) {
    const caseId = `k${index}:${observation.valueSha256.slice(0, 16)}`;
    const input = Object.freeze({
      key: observation.key,
      revision: observation.revision,
      valueSha256: observation.valueSha256,
      value: observation.value,
    });
    const baselineResult = baseline.evaluate(input, deps);
    if (baselineResult.failure !== null) {
      return failedOutcome(baselineResult.failure.code, caseId, baselineResult.failure.message, cases.length, cases, matching, differing);
    }
    const candidateResult = candidate.evaluate(input, deps);
    if (candidateResult.failure !== null) {
      return failedOutcome(candidateResult.failure.code, caseId, candidateResult.failure.message, cases.length, cases, matching, differing);
    }
    const same = candidateResult.canonical === baselineResult.canonical;
    const evidence = Object.freeze({
      caseId,
      key: observation.key,
      revision: observation.revision,
      valueSha256: observation.valueSha256,
      candidateOutputSha256: sha256Hex(candidateResult.canonical),
      baselineOutputSha256: sha256Hex(baselineResult.canonical),
      same,
    });
    cases.push(evidence);
    if (same) {
      matching.push(caseId);
    } else {
      differing.push(caseId);
      if (preview === null) {
        preview = `${caseId}: candidate=${boundedPreview(candidateResult.canonical)} baseline=${boundedPreview(baselineResult.canonical)}`;
      }
    }
  }
  return Object.freeze({
    status: differing.length === 0 ? 'match' : 'difference',
    failure: null,
    comparisons: cases.length,
    cases: Object.freeze(cases),
    matchingCaseIds: Object.freeze(matching),
    differingCaseIds: Object.freeze(differing),
    differencePreview: preview,
  });
}

function assertFacadeMatchesApp(facade: V10AppFacade, app: V10AppView, tenantId: string): ShadowActivatedIdentity {
  // Read the original V10AppFacade getter *on its prototype*, not a virtual
  // member that a subclass can override. Its #private fields are the actual
  // Host activation's selection; caller-supplied digest/tenant claims do not
  // establish which BUILD/deployment is being observed.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype getter is deliberately detached and invoked with an explicit facade receiver below
  const getter = Object.getOwnPropertyDescriptor(V10AppFacade.prototype, 'selectedShadowBinding')?.get;
  let binding: V10AppFacade['selectedShadowBinding'];
  let observed: readonly { packageId: string; featureKey: string | null }[];
  try {
    if (typeof getter !== 'function') {
      refuse('SHADOW_APP_FACADE_MISMATCH', 'the activated facade has no Host-origin selected identity binding');
    }
    binding = getter.call(facade) as V10AppFacade['selectedShadowBinding'];
    observed = facade.selectedFeatures;
  } catch (error) {
    refuse('SHADOW_APP_FACADE_MISMATCH', `the activated facade cannot report its selected identity: ${errorMessage(error)}`, { cause: error });
  }
  const expectedBusinesses = app.modules
    .filter((module) => module.role === 'business')
    .map((module) => module.packageId)
    .sort();
  if (binding.subjectDigest !== app.subjectDigest
    || binding.appId !== app.appId
    || binding.tenantId !== tenantId
    || sha256Canonical(binding.businessPackageIds) !== sha256Canonical(expectedBusinesses)) {
    refuse('SHADOW_APP_FACADE_MISMATCH', 'BUILD digest, App, tenant or selected Business identity differs from the activated facade');
  }
  // An activation without a deployment identity has no K02 scoped
  // namespace: its K rows cannot be attributed to one deployment instance, so
  // there is no honest narrow observation set. STOP typed instead of silently
  // widening to the whole App/Tenant namespace.
  const deployedAppId = binding.deployedAppId;
  if (typeof deployedAppId !== 'string' || deployedAppId.length === 0 || deployedAppId.length > 256) {
    refuse(
      'SHADOW_DEPLOYMENT_BINDING_MISSING',
      'the activated facade carries no deployment identity; Shadow L4 cannot attribute K documents to one deployment instance (no unscoped fallback exists)',
    );
  }
  if (binding.deploymentAppId !== app.appId) {
    refuse('SHADOW_APP_FACADE_MISMATCH', 'the activated deployment App identity differs from the BUILD App view');
  }
  // Re-derive the exact per-B physical prefixes from the binding's deployment
  // tuple and require the facade to report exactly those. This is an integrity
  // agreement of two independently produced values, never a caller claim.
  // [#1217] The outer namespace is the stable deployment tuple (never the
  // BUILD subjectDigest) — the same single derivation the writer uses.
  const namespace = v10DeploymentDocsPrefix({ deployedAppId, tenantId: binding.tenantId, appId: app.appId });
  const expectedPrefixes = expectedBusinesses.map((businessPackageId) =>
    `${namespace}${v10K02DocumentPrefix({
      deployedAppId,
      tenantId: binding.tenantId,
      appId: app.appId,
      businessPackageId,
    })}`);
  const reportedPrefixes = binding.k02DocumentPrefixes;
  if (!Array.isArray(reportedPrefixes)
    || reportedPrefixes.length !== expectedPrefixes.length
    || sha256Canonical(reportedPrefixes) !== sha256Canonical(expectedPrefixes)) {
    refuse('SHADOW_APP_FACADE_MISMATCH', 'the activated facade did not report the exact K02 document prefixes of its deployment');
  }
  const expected = app.modules
    .filter((module) => module.role === 'standard-feature')
    .map((module) => ({ packageId: module.packageId, featureKey: module.provides[0] ?? null }))
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
  const actual = [...observed].sort((left, right) => left.packageId.localeCompare(right.packageId));
  if (sha256Canonical(actual) !== sha256Canonical(expected)) {
    refuse('SHADOW_APP_FACADE_MISMATCH', 'the BUILD App view and the activated facade do not describe the same selected features');
  }
  return Object.freeze({
    subjectDigest: binding.subjectDigest,
    appId: binding.appId,
    tenantId: binding.tenantId,
    deployedAppId,
    businessPackageIds: Object.freeze([...expectedBusinesses]),
    namespace,
    documentPrefixes: Object.freeze(expectedPrefixes),
  });
}

function validateBudget(raw: unknown): { readonly maxCases: number; readonly maxComparisons: number } {
  if (!isPlainRecord(raw)) refuse('SHADOW_BUDGET_INVALID', 'a bounded case/compare budget is required');
  const maxCases = raw.maxCases;
  const maxComparisons = raw.maxComparisons;
  if (!Number.isSafeInteger(maxCases) || (maxCases as number) < 1 || (maxCases as number) > MAX_CASES
    || !Number.isSafeInteger(maxComparisons) || (maxComparisons as number) < 1 || (maxComparisons as number) > MAX_CASES) {
    refuse('SHADOW_BUDGET_INVALID', `maxCases/maxComparisons must be integers in [1, ${MAX_CASES}]`);
  }
  return Object.freeze({ maxCases: maxCases as number, maxComparisons: maxComparisons as number });
}

function trustedApprovalMatches(raw: unknown, pin: ShadowL4VersionPin): boolean {
  return isPlainRecord(raw)
    && raw.state === 'approved'
    && raw.id === pin.id
    && raw.revision === pin.revision
    && raw.sha256 === pin.sha256;
}

/**
 * Run one bounded read-only Shadow L4 comparison against real selected K
 * documents. Typed identity/budget refusals throw before any evaluator runs;
 * evaluation and physical-witness failures are returned as an honest
 * `shadow-failed` report so zero-write evidence is never lost.
 */
export async function runShadowL4(options: ShadowL4RunnerOptions): Promise<ShadowL4Report> {
  if (!isPlainRecord(options)) refuse('SHADOW_OPTIONS_INVALID', 'shadow runner options must be a plain record');
  if (!(options.facade instanceof V10AppFacade)) {
    refuse('SHADOW_FACADE_INVALID', 'shadow runner requires the real activated V10AppFacade; lookalike facades are refused');
  }
  if (options.facade.isClosed()) {
    refuse('SHADOW_FACADE_CLOSED', 'the observed App facade is closed; no shadow can start');
  }
  const app = options.app;
  if (!isPlainRecord(app) || typeof app.subjectDigest !== 'string' || !/^[a-f0-9]{64}$/.test(app.subjectDigest)) {
    refuse('SHADOW_APP_INVALID', 'shadow runner requires the sealed BUILD App view');
  }
  if (typeof options.tenantId !== 'string' || options.tenantId.length === 0 || options.tenantId.length > 256) {
    refuse('SHADOW_OPTIONS_INVALID', 'tenantId must be a bounded nonempty string');
  }
  // Identity must match BEFORE any store.keys()/get() or physical witness.
  const identity = assertFacadeMatchesApp(options.facade, app, options.tenantId);
  if (!isPlainRecord(options.store) || typeof options.store.get !== 'function' || typeof options.store.keys !== 'function') {
    refuse(
      'SHADOW_READ_INTERFACE_MISSING',
      'the Host must supply a read-only selected-K view exposing get() and keys(); a shadow without a physical read interface STOPs with evidence',
    );
  }
  if (typeof options.physicalWitness !== 'function') {
    refuse('SHADOW_WITNESS_FAILED', 'a physical zero-write witness is mandatory for Shadow L4 evidence');
  }
  const timeoutMs = options.evaluationTimeoutMs ?? DEFAULT_EVALUATION_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_EVALUATION_TIMEOUT_MS) {
    refuse('SHADOW_OPTIONS_INVALID', `evaluationTimeoutMs must be an integer in [1, ${MAX_EVALUATION_TIMEOUT_MS}]`);
  }
  const budget = validateBudget(options.budget);
  if (!isPlainRecord(options.candidate) || typeof options.candidate.source !== 'string') {
    refuse('SHADOW_CANDIDATE_INVALID', 'a candidate pin and exact source bytes are required');
  }
  if (!isPlainRecord(options.approvedFallback)) {
    refuse('SHADOW_FALLBACK_NOT_SELECTED', 'an exact approved fallback is required');
  }

  // ---- Exact candidate identity ----
  const candidatePin = parsePin(options.candidate.pin, 'candidate');
  const candidateSource = options.candidate.source;
  if (candidateSource.length === 0 || candidateSource.length > MAX_SOURCE_CHARS) {
    refuse('SHADOW_CANDIDATE_INVALID', 'candidate source must be bounded nonempty bytes');
  }
  if (sha256Hex(candidateSource) !== candidatePin.sha256) {
    refuse(
      'SHADOW_CANDIDATE_SOURCE_MISMATCH',
      `candidate bytes hash to ${sha256Hex(candidateSource)} but the pin seals ${candidatePin.sha256}; byte substitution is refused`,
    );
  }
  if (candidatePin.approvalState === 'revoked') {
    refuse('SHADOW_CANDIDATE_REVOKED', 'a revoked candidate cannot enter shadow evaluation');
  }
  let candidateApprovalAuthority: 'host-admission' | 'explicit-candidate' = 'explicit-candidate';
  if (candidatePin.approvalState === 'approved') {
    if (!trustedApprovalMatches(options.trustedCandidateApproval, candidatePin)) {
      refuse(
        'SHADOW_APPROVAL_UNTRUSTED',
        'the candidate pin claims approved but no matching Host admission record was supplied',
      );
    }
    candidateApprovalAuthority = 'host-admission';
  }

  // ---- Exact approved fallback derived from the actually selected module ----
  const fallbackPin = parsePin(options.approvedFallback.pin, 'approvedFallback');
  if (fallbackPin.approvalState !== 'approved') {
    refuse('SHADOW_FALLBACK_NOT_APPROVED', 'the fallback must be exactly approved and pinned');
  }
  const fallbackModule = selectedModule(app, options.approvedFallback.selectedPackageId);
  if (fallbackPin.kind !== candidatePin.kind) {
    refuse('SHADOW_KIND_MISMATCH', 'candidate and approved fallback kinds differ');
  }
  if (fallbackModule.moduleSha256 !== fallbackPin.sha256) {
    refuse(
      'SHADOW_FALLBACK_PIN_MISMATCH',
      `approved fallback pins ${fallbackPin.sha256} but selected module ${fallbackModule.packageId} seals ${String(fallbackModule.moduleSha256)}`,
    );
  }
  if (fallbackPin.revision !== fallbackModule.packageId) {
    refuse(
      'SHADOW_FALLBACK_PIN_MISMATCH',
      `approved fallback revision ${fallbackPin.revision} is not the selected module revision ${fallbackModule.packageId}`,
    );
  }
  if (fallbackPin.provenance !== selectedFallbackProvenance(app, fallbackModule.packageId)) {
    refuse('SHADOW_FALLBACK_PIN_MISMATCH', 'approved fallback provenance is not the exact selected-module provenance');
  }
  if (typeof fallbackModule.moduleSource !== 'string' || fallbackModule.moduleSource.length === 0) {
    refuse('SHADOW_FALLBACK_PIN_MISMATCH', `selected fallback module ${fallbackModule.packageId} carries no sealed source bytes`);
  }
  if (fallbackModule.moduleSource.length > MAX_SOURCE_CHARS) {
    refuse('SHADOW_FALLBACK_PIN_MISMATCH', `selected fallback module ${fallbackModule.packageId} exceeds the bounded shadow compile allowance`);
  }
  if (sha256Hex(fallbackModule.moduleSource) !== fallbackPin.sha256) {
    refuse('SHADOW_FALLBACK_PIN_MISMATCH', 'selected fallback source bytes do not match the pinned digest');
  }
  if (pinIdentity(candidatePin) === pinIdentity(fallbackPin) || candidatePin.sha256 === fallbackPin.sha256) {
    refuse('SHADOW_CANDIDATE_IDENTICAL_TO_FALLBACK', 'candidate and fallback must be distinct exact revisions/digests');
  }

  const limit = Math.min(budget.maxCases, budget.maxComparisons);
  const reads = { count: 0 };
  const before = await captureSelectedKSnapshot(options.store, identity.namespace, identity.documentPrefixes, limit, reads);
  const witnessBefore = await captureWitness(options.physicalWitness);

  let outcome: EvaluationOutcome;
  if (before.considered === 0) {
    outcome = failedOutcome(
      'SHADOW_NO_OBSERVATIONS',
      null,
      'no actual selected K documents exist under this deployment\'s exact K02 prefixes; there is nothing to shadow',
      0,
      [],
      [],
      [],
    );
  } else {
    let candidateEvaluator: CompiledEvaluator;
    let baselineEvaluator: CompiledEvaluator;
    try {
      baselineEvaluator = compileEvaluator({
        source: fallbackModule.moduleSource,
        exportName: options.approvedFallback.exportName ?? 'evaluate',
        role: 'baseline',
        label: `${fallbackModule.packageId}@${fallbackPin.revision}`,
        timeoutMs,
      });
      candidateEvaluator = compileEvaluator({
        source: candidateSource,
        exportName: options.candidate.exportName ?? 'evaluate',
        role: 'candidate',
        label: `${candidatePin.id}@${candidatePin.revision}`,
        timeoutMs,
      });
    } catch (error) {
      const failure = error instanceof ShadowL4Error
        ? { code: error.code, message: error.message }
        : { code: 'SHADOW_EVALUATOR_COMPILE_FAILED', message: errorMessage(error) };
      outcome = failedOutcome(failure.code, null, failure.message, 0, [], [], []);
      return finalizeShadowReport({
        options, identity, candidatePin, candidateApprovalAuthority, fallbackPin, fallbackModule,
        budget, before, witnessBefore, reads, outcome,
      });
    }
    const deps = Object.freeze({
      app: Object.freeze({
        subjectDigest: app.subjectDigest,
        appId: app.appId,
        tenantId: identity.tenantId,
      }),
      observations: before.observations,
    });
    outcome = evaluateSelectedObservations(before, candidateEvaluator, baselineEvaluator, deps);
  }

  return finalizeShadowReport({
    options, identity, candidatePin, candidateApprovalAuthority, fallbackPin, fallbackModule,
    budget, before, witnessBefore, reads, outcome,
  });
}

async function finalizeShadowReport(input: {
  readonly options: ShadowL4RunnerOptions;
  readonly identity: ShadowActivatedIdentity;
  readonly candidatePin: ShadowL4VersionPin;
  readonly candidateApprovalAuthority: 'host-admission' | 'explicit-candidate';
  readonly fallbackPin: ShadowL4VersionPin;
  readonly fallbackModule: V10AppView['modules'][number];
  readonly budget: { readonly maxCases: number; readonly maxComparisons: number };
  readonly before: CapturedSnapshot;
  readonly witnessBefore: string;
  readonly reads: { count: number };
  readonly outcome: EvaluationOutcome;
}): Promise<ShadowL4Report> {
  const { options, identity, candidatePin, fallbackPin, budget, before, reads } = input;
  let after: CapturedSnapshot | null = null;
  let afterError: string | null = null;
  try {
    after = await captureSelectedKSnapshot(options.store, identity.namespace, identity.documentPrefixes, Math.min(budget.maxCases, budget.maxComparisons), reads);
  } catch (error) {
    afterError = errorMessage(error);
  }
  let witnessAfter: string | null = null;
  let witnessError: string | null = null;
  try {
    witnessAfter = await captureWitness(options.physicalWitness);
  } catch (error) {
    witnessError = errorMessage(error);
  }

  const snapshotUnchanged = after !== null && after.snapshotSha256 === before.snapshotSha256;
  const physicalWitnessUnchanged = witnessAfter !== null && witnessAfter === input.witnessBefore;
  const productionWritesVerifiedZero = afterError === null
    && witnessError === null
    && snapshotUnchanged
    && physicalWitnessUnchanged;

  let status = input.outcome.status;
  let failure = input.outcome.failure;
  if (!productionWritesVerifiedZero && failure === null) {
    status = 'shadow-failed';
    failure = Object.freeze({
      code: afterError !== null
        ? 'SHADOW_AFTER_SNAPSHOT_FAILED'
        : witnessError !== null
          ? 'SHADOW_WITNESS_FAILED'
          : snapshotUnchanged
            ? 'SHADOW_PHYSICAL_WITNESS_CHANGED'
            : 'SHADOW_PRODUCTION_WRITE_DETECTED',
      caseId: null,
      message: afterError ?? witnessError
        ?? (snapshotUnchanged
          ? 'the physical zero-write witness changed during the shadow run'
          : 'the production K snapshot changed during the shadow run'),
    });
  }

  const replayDigest = sha256Canonical({
    appSubjectDigest: identity.subjectDigest,
    deployedAppId: identity.deployedAppId,
    tenantId: identity.tenantId,
    candidate: candidatePin,
    approvedFallback: { ...fallbackPin, selectedPackageId: input.fallbackModule.packageId },
    budget,
    observationTotal: before.total,
    observationConsidered: before.considered,
    observationSnapshotSha256: before.snapshotSha256,
    status,
    failureCode: failure === null ? null : failure.code,
    cases: input.outcome.cases.map((entry) => ({
      caseId: entry.caseId,
      valueSha256: entry.valueSha256,
      candidateOutputSha256: entry.candidateOutputSha256,
      baselineOutputSha256: entry.baselineOutputSha256,
      same: entry.same,
    })),
  });

  return deepFreeze({
    kind: SHADOW_L4_EVIDENCE_KIND,
    shadowAbi: SHADOW_L4_ABI,
    appSubjectDigest: identity.subjectDigest,
    deployedAppId: identity.deployedAppId,
    tenantId: identity.tenantId,
    candidate: candidatePin,
    candidateApproval: Object.freeze({
      state: candidatePin.approvalState,
      authority: input.candidateApprovalAuthority,
    }),
    approvedFallback: Object.freeze({ ...fallbackPin, selectedPackageId: input.fallbackModule.packageId }),
    budget,
    observations: Object.freeze({
      prefix: identity.namespace,
      documentPrefixes: identity.documentPrefixes,
      total: before.total,
      considered: before.considered,
      truncated: before.truncated,
      snapshotSha256: before.snapshotSha256,
      keys: Object.freeze(before.observations.map((observation) => observation.key)),
    }),
    comparisons: input.outcome.comparisons,
    matchingCaseIds: input.outcome.matchingCaseIds,
    differingCaseIds: input.outcome.differingCaseIds,
    cases: input.outcome.cases,
    differencePreview: input.outcome.differencePreview,
    status,
    failure,
    production: Object.freeze({
      beforeSnapshotSha256: before.snapshotSha256,
      afterSnapshotSha256: after === null ? null : after.snapshotSha256,
      snapshotUnchanged,
      physicalWitnessBeforeSha256: input.witnessBefore,
      physicalWitnessAfterSha256: witnessAfter,
      physicalWitnessUnchanged,
      storeReads: reads.count,
      storeMutationMethodsUsed: 0,
      externalEffectCalls: 0,
      memoryWrites: 0,
      cacheWrites: 0,
      productionWritesVerifiedZero,
    }),
    evidenceAuthority: 'host-owned-readonly-shadow',
    canSelfApprove: false,
    canPromote: false,
    kernelEffectPermit: false,
    replayDigest,
  });
}
