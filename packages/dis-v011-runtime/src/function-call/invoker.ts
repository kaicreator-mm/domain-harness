/**
 * Generic chosen-Function invoker (DIS Runtime 0.11.0-dev.2 A2, issue #1542):
 * the minimal composition of the D1 Element contract layer (validated
 * manifest, sealed AOT lock) and the D2 bounded execution envelope into one
 * runtime channel that only ever runs a Function that is
 *
 *   1. **selected** — `FunctionId -> {declaration, lockEntry, callable}` is
 *      pre-bound by the trusted BUILD bundle and checked at construction
 *      with own-key semantics (inherited properties are never bindings;
 *      `Object.prototype` members can never be hit). Binding ids must be
 *      manifest-selected public Functions whose declaration and lock entry
 *      match the sealed pair, and whose sealed target matches the channel's
 *      expected target. There is no dynamic module search at call time and
 *      no package SHA recomputation — ever.
 *   2. **effect-free** — only `declaration.effects === 'none'` may execute
 *      directly. Any `idempotent` / `non-idempotent` implementation is
 *      structurally rejected with the requirement for an existing Kernel/KDP
 *      Permit; this channel never mints a Permit and never dispatches an
 *      external effect (Effect authority stays with the existing Kernel
 *      Primary).
 *   3. **validated** — dynamic input is checked by the pre-compiled
 *      Validator bound for that Function (real execution of the compiled
 *      validator). When the schema exists only as a ref and no Validator was
 *      selected, the call fails closed as INPUT_VALIDATION_UNAVAILABLE and
 *      never claims to have validated.
 *   4. **bounded** — execution runs inside the caller-prepared D2 envelope
 *      (`local-deterministic` by contract; `fixture` providers are
 *      test-only). Budget exhaustion and executor throws surface as
 *      structured outcomes with no partial success; late results after a
 *      deadline never masquerade as success (envelope invariant).
 *
 * Static state is never re-verified per call (CV-04/05): the manifest, the
 * AOT lock, implementation digests and targets are consumed exactly as
 * prepared by BUILD. Construction performs own-key shape and consistency
 * checks only — no digest verification, no path search. Every outcome is an
 * honest OBSERVED-level observation (`attested:false`, `verified:false`,
 * `authority:'NONE'`): a result is not a trusted proof or final business
 * state, and Domain-owned State stays with Business.
 *
 * Runtime imports are limited to the self-contained D2 envelope module; the
 * D1 modules are consumed through type-only imports, so tests may run this
 * module from source under the strip-types runner while element modules are
 * imported from compiled dist output.
 */
import { BOUNDED_PROVIDER_KINDS, RESERVED_UNAVAILABLE_PROVIDER_KINDS } from '../bounded/envelope.js';
import type {
  BoundedBudgetAxis, BoundedEnvelope, BoundedProviderKind, BoundedProviderLabel,
  BoundedTraceEvent, BudgetSnapshot,
} from '../bounded/envelope.js';
import type { ElementFunctionDecl, ElementManifest, EffectMode } from '../element/manifest.js';
import type { AotLock, AotLockEntry } from '../element/aot.js';
import { FunctionCallError } from './errors.js';

/** Pre-compiled Validator for one Function's typed dynamic input schema. */
export type FunctionInputValidator = (input: unknown) => boolean;

/** One BUILD-prepared trusted binding: declaration + lock entry + callable (+ optional Validator). */
export interface FunctionBinding {
  /** Must be the manifest-selected declaration for this Function id. */
  readonly declaration: ElementFunctionDecl;
  /** Must be the AOT-lock-sealed entry for this Function id. */
  readonly lockEntry: AotLockEntry;
  /** The selected implementation as a callable reference; never re-resolved at call time. */
  readonly callable: (input: unknown) => unknown;
  /** Pre-compiled input Validator; absence makes the Function UNAVAILABLE (fail closed). */
  readonly validator?: FunctionInputValidator;
}

/** Entry form of a trusted binding: makes duplicate Function ids structurally expressible. */
export interface FunctionBindingEntry extends FunctionBinding {
  readonly functionId: string;
}

/**
 * Trusted pre-bound Functions, either as a plain id-keyed record (only own
 * enumerable keys are considered — inherited properties are never bindings)
 * or as an explicit entry list (duplicate ids are detectable and rejected).
 */
export type FunctionBindings =
  | Readonly<Record<string, FunctionBinding>>
  | readonly FunctionBindingEntry[];

/** Structured call-time rejection codes of this channel. */
export type FunctionCallRejectionCode =
  | 'FUNCTION_ID_UNKNOWN'
  | 'FUNCTION_NOT_BOUND'
  | 'EFFECT_PERMIT_REQUIRED'
  | 'INPUT_VALIDATION_UNAVAILABLE'
  | 'INPUT_VALIDATION_FAILED'
  | 'PROVIDER_KIND_UNREGISTERED';

/** Honest account of what dynamic-input validation actually did for one call. */
export type FunctionCallValidationStatus = 'VALIDATED' | 'UNAVAILABLE' | 'FAILED' | 'NOT_PERFORMED';

/** Read-only per-Function view of the pre-bound channel state. */
export interface InvokerFunctionInfo {
  readonly functionId: string;
  readonly elementId: string;
  readonly source: string;
  readonly target: string;
  readonly effects: EffectMode;
  readonly inputSchemaRef: string;
  /** Whether a pre-compiled input Validator was selected for this Function. */
  readonly validation: 'AVAILABLE' | 'UNAVAILABLE';
}

/**
 * Structured invocation outcome. COMPLETED carries the observable output with
 * Function id / source / provider / budget observation fields; every other
 * member is a structured rejection or failure with `output: null` — there is
 * no partial success. Nothing here is attested or verified.
 */
export type FunctionCallOutcome =
  | {
    readonly status: 'COMPLETED'; readonly disposition: 'OBSERVED'; readonly output: unknown;
    readonly functionId: string; readonly elementId: string; readonly source: string; readonly target: string;
    readonly provider: BoundedProviderLabel; readonly inputValidation: 'VALIDATED';
    readonly remaining: Readonly<BudgetSnapshot>; readonly trace: readonly BoundedTraceEvent[];
    readonly attested: false; readonly verified: false; readonly qualified: false;
    readonly authority: 'NONE'; readonly effectDispatched: false;
  }
  | {
    readonly status: 'REJECTED'; readonly code: FunctionCallRejectionCode; readonly detail: string;
    /** Present only on EFFECT_PERMIT_REQUIRED: an existing Kernel/KDP Permit is required. */
    readonly permitRequired?: true;
    readonly functionId: string; readonly inputValidation: FunctionCallValidationStatus;
    readonly remaining: Readonly<BudgetSnapshot>;
    readonly output: null; readonly disposition: 'UNKNOWN';
    readonly attested: false; readonly authority: 'NONE'; readonly effectDispatched: false;
  }
  | {
    readonly status: 'BUDGET_EXHAUSTED'; readonly axis: BoundedBudgetAxis;
    readonly disposition: 'UNKNOWN'; readonly output: null;
    readonly functionId: string; readonly elementId: string; readonly source: string; readonly target: string;
    readonly providerKind: BoundedProviderKind; readonly inputValidation: 'VALIDATED';
    readonly remaining: Readonly<BudgetSnapshot>; readonly trace: readonly BoundedTraceEvent[];
    readonly attested: false; readonly authority: 'NONE'; readonly effectDispatched: false;
  }
  | {
    readonly status: 'EXECUTION_FAILED'; readonly reason: string;
    readonly disposition: 'UNKNOWN'; readonly output: null;
    readonly functionId: string; readonly elementId: string; readonly source: string; readonly target: string;
    readonly providerKind: BoundedProviderKind; readonly inputValidation: 'VALIDATED';
    readonly remaining: Readonly<BudgetSnapshot>; readonly trace: readonly BoundedTraceEvent[];
    readonly attested: false; readonly authority: 'NONE'; readonly effectDispatched: false;
  };

export interface FunctionInvokeRequest {
  /** Requested Function id; non-strings and prototype-member names can never hit a binding. */
  readonly functionId: unknown;
  /** Dynamic input, validated by the bound pre-compiled Validator before any execution. */
  readonly input: unknown;
}

/** The bounded invocation channel for selected, effect-free Functions. */
export interface FunctionInvoker {
  readonly expectedTarget: string;
  readonly providerKind: BoundedProviderKind;
  /** Frozen read-only view of the pre-bound Functions (own-key bindings only). */
  readonly functions: readonly InvokerFunctionInfo[];
  invoke(request: FunctionInvokeRequest): Promise<FunctionCallOutcome>;
}

export interface FunctionInvokerConfig {
  /** D1-validated, deeply frozen manifest — consumed as prepared, never re-parsed or re-hashed. */
  readonly manifest: ElementManifest;
  /** D1-sealed, deeply frozen AOT lock over exactly that manifest. */
  readonly lock: AotLock;
  /** Platform target this channel serves; every bound lock entry must match it. */
  readonly expectedTarget: string;
  /** Caller-prepared D2 bounded envelope; every invocation runs inside it. */
  readonly envelope: BoundedEnvelope;
  /** Provider kind for every invocation; `llm`/`harness` are never admissible. */
  readonly providerKind: string;
  /** Trusted pre-bound Functions (own-key record or explicit entry list). */
  readonly bindings: FunctionBindings;
  /** Work units charged per invocation step (default 1). */
  readonly stepWorkUnits?: number;
}

/** Construction-time rejection: programmer/config error, thrown, never an outcome. */
type RejectedOutcome = Extract<FunctionCallOutcome, { status: 'REJECTED' }>;

const DECLARATION_FIELDS
  = ['id', 'exportName', 'source', 'implementation', 'effects', 'inputSchemaRef', 'outputSchemaRef'] as const;
const LOCK_ENTRY_FIELDS = ['elementId', 'functionId', 'path', 'sha256', 'target'] as const;

const REASON_MAX_LENGTH = 200;
/** C0 control characters (U+0000..U+001F) plus DEL (U+007F), by code point. */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  return code === undefined || code <= 0x1f || code === 0x7f;
}

function sanitizeDetail(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === 'string' ? value : String(value ?? '');
  const stripped = Array.from(raw).filter((character) => !isControlCharacter(character)).join('');
  const truncated = stripped.length > REASON_MAX_LENGTH ? stripped.slice(0, REASON_MAX_LENGTH) : stripped;
  return truncated.length > 0 ? truncated : 'FUNCTION_CALL_REJECTED';
}

function declaredFunctions(manifest: ElementManifest): Map<string, ElementFunctionDecl> {
  const declared = new Map<string, ElementFunctionDecl>();
  for (const consumer of manifest.consumers) {
    for (const element of consumer.elements) {
      for (const fn of element.functions) declared.set(fn.id, fn);
    }
  }
  return declared;
}

/** Value equality on the declaration fields (no hashing, no recomputation). */
function sameDeclaration(a: ElementFunctionDecl, b: ElementFunctionDecl): boolean {
  return DECLARATION_FIELDS.every((field) => a[field] === b[field]);
}

/** Value equality on the sealed lock entry fields (no hashing, no recomputation). */
function sameLockEntry(a: AotLockEntry, b: AotLockEntry): boolean {
  return LOCK_ENTRY_FIELDS.every((field) => a[field] === b[field]);
}

/**
 * Create the invocation channel from a BUILD-prepared trusted bundle.
 * Construction validates shapes and consistency only (own-key bindings,
 * manifest/lock cross-references, target match, envelope/provider
 * admissibility); no static verification is re-run and no digest is
 * recomputed. Throws structured {@link FunctionCallError}s on misuse.
 */
export function createFunctionInvoker(config: FunctionInvokerConfig): FunctionInvoker {
  if (!config || typeof config !== 'object') throw new FunctionCallError('FUNCTION_CALL_CONFIG_INVALID');
  const manifest = config.manifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.consumers)) {
    throw new FunctionCallError('FUNCTION_CALL_MANIFEST_INVALID');
  }
  const lock = config.lock;
  const sealedEntries = lock && typeof lock === 'object'
    ? lock.entries as Readonly<Record<string, AotLockEntry | undefined>>
    : undefined;
  if (!sealedEntries || typeof sealedEntries !== 'object' || lock.schema !== manifest.schema) {
    throw new FunctionCallError('FUNCTION_CALL_LOCK_INVALID');
  }
  const expectedTarget = config.expectedTarget;
  if (typeof expectedTarget !== 'string' || expectedTarget.length === 0) {
    throw new FunctionCallError('FUNCTION_CALL_TARGET_INVALID');
  }
  const envelope = config.envelope;
  if (!envelope || typeof envelope !== 'object'
      || typeof envelope.execute !== 'function' || typeof envelope.remaining !== 'function') {
    throw new FunctionCallError('FUNCTION_CALL_ENVELOPE_INVALID');
  }
  const providerKind = config.providerKind;
  if (typeof providerKind !== 'string' || providerKind.length === 0) {
    throw new FunctionCallError('FUNCTION_CALL_PROVIDER_KIND_INVALID');
  }
  if ((RESERVED_UNAVAILABLE_PROVIDER_KINDS as readonly string[]).includes(providerKind)) {
    throw new FunctionCallError('FUNCTION_CALL_PROVIDER_KIND_FORBIDDEN', providerKind);
  }
  if (!(BOUNDED_PROVIDER_KINDS as readonly string[]).includes(providerKind)
      || !envelope.providerKinds.includes(providerKind as BoundedProviderKind)) {
    throw new FunctionCallError('FUNCTION_CALL_PROVIDER_KIND_UNREGISTERED', providerKind);
  }
  const stepWorkUnits = config.stepWorkUnits ?? 1;
  if (typeof stepWorkUnits !== 'number' || !Number.isSafeInteger(stepWorkUnits) || stepWorkUnits < 1) {
    throw new FunctionCallError('FUNCTION_CALL_STEP_WORK_UNITS_INVALID', String(stepWorkUnits));
  }
  const bindings = config.bindings;
  if (!bindings || typeof bindings !== 'object') throw new FunctionCallError('FUNCTION_CALL_BINDINGS_INVALID');

  const declared = declaredFunctions(manifest);
  /** Internal map keyed by exact strings; prototype chains can never contribute entries. */
  const bound = new Map<string, {
    declaration: ElementFunctionDecl;
    lockEntry: AotLockEntry;
    callable: (input: unknown) => unknown;
    validator: FunctionInputValidator | undefined;
  }>();

  const bindEntry = (functionId: string, binding: unknown): void => {
    if (!declared.has(functionId)) throw new FunctionCallError('FUNCTION_CALL_ID_NOT_SELECTED', functionId);
    if (!binding || typeof binding !== 'object') {
      throw new FunctionCallError('FUNCTION_CALL_BINDING_INCOMPLETE', functionId);
    }
    const candidate = binding as Partial<FunctionBinding>;
    const sealed = sealedEntries[functionId];
    if (sealed === undefined) throw new FunctionCallError('FUNCTION_CALL_LOCK_ENTRY_MISSING', functionId);
    if (!candidate.lockEntry || typeof candidate.lockEntry !== 'object') {
      throw new FunctionCallError('FUNCTION_CALL_LOCK_ENTRY_INCOMPLETE', functionId);
    }
    if (!sameLockEntry(candidate.lockEntry, sealed)) {
      throw new FunctionCallError('FUNCTION_CALL_LOCK_ENTRY_MISMATCH', functionId);
    }
    if (sealed.target !== expectedTarget) {
      throw new FunctionCallError('FUNCTION_CALL_TARGET_MISMATCH', functionId + ':' + sealed.target);
    }
    const declaration = candidate.declaration;
    if (!declaration || typeof declaration !== 'object'
        || !sameDeclaration(declaration, declared.get(functionId) as ElementFunctionDecl)) {
      throw new FunctionCallError('FUNCTION_CALL_DECLARATION_MISMATCH', functionId);
    }
    if (typeof candidate.callable !== 'function') {
      throw new FunctionCallError('FUNCTION_CALL_CALLABLE_INVALID', functionId);
    }
    if (candidate.validator !== undefined && typeof candidate.validator !== 'function') {
      throw new FunctionCallError('FUNCTION_CALL_VALIDATOR_INVALID', functionId);
    }
    // The manifest's frozen declaration and the lock's frozen entry are the
    // authoritative shapes; the candidate's equal-value copies are dropped.
    bound.set(functionId, {
      declaration: declared.get(functionId) as ElementFunctionDecl,
      lockEntry: sealed,
      callable: candidate.callable,
      validator: candidate.validator,
    });
  };

  if (Array.isArray(bindings)) {
    const seen = new Set<string>();
    for (const entry of bindings) {
      if (!entry || typeof entry !== 'object') throw new FunctionCallError('FUNCTION_CALL_BINDING_INVALID');
      const functionId = (entry as FunctionBindingEntry).functionId;
      if (typeof functionId !== 'string' || functionId.length === 0) {
        throw new FunctionCallError('FUNCTION_CALL_ID_EMPTY', String(functionId));
      }
      if (seen.has(functionId)) throw new FunctionCallError('FUNCTION_CALL_ID_DUPLICATE', functionId);
      seen.add(functionId);
      bindEntry(functionId, entry);
    }
  } else {
    // Own enumerable keys only: inherited properties are never bindings, so
    // Object.prototype members can never be selected or hit through this map.
    for (const functionId of Object.keys(bindings)) {
      bindEntry(functionId, (bindings as Readonly<Record<string, FunctionBinding>>)[functionId]);
    }
  }

  const functions: readonly InvokerFunctionInfo[] = Object.freeze(
    Array.from(bound.entries()).map(([functionId, entry]) => Object.freeze({
      functionId,
      elementId: entry.lockEntry.elementId,
      source: entry.declaration.source,
      target: entry.lockEntry.target,
      effects: entry.declaration.effects,
      inputSchemaRef: entry.declaration.inputSchemaRef,
      validation: entry.validator === undefined ? 'UNAVAILABLE' : 'AVAILABLE',
    } satisfies InvokerFunctionInfo)),
  );

  const invoke = async (request: FunctionInvokeRequest): Promise<FunctionCallOutcome> => {
    const requestedId = request && typeof request === 'object' ? request.functionId : undefined;
    const echoedId = typeof requestedId === 'string' ? requestedId : '<non-string>';
    const rejection = (
      code: FunctionCallRejectionCode,
      detail: string,
      inputValidation: FunctionCallValidationStatus,
      extra: { permitRequired?: true } = {},
    ): RejectedOutcome => Object.freeze({
      status: 'REJECTED', code, detail,
      ...(extra.permitRequired === undefined ? {} : { permitRequired: true }),
      functionId: echoedId, inputValidation,
      remaining: envelope.remaining(), output: null, disposition: 'UNKNOWN',
      attested: false, authority: 'NONE', effectDispatched: false,
    });

    if (typeof requestedId !== 'string' || requestedId.length === 0) {
      return rejection('FUNCTION_ID_UNKNOWN', requestedId === '' ? 'id:empty' : 'id:type', 'NOT_PERFORMED');
    }
    const entry = bound.get(requestedId);
    if (entry === undefined) {
      // Not own-key bound: either manifest-selected but never pre-bound, or
      // not selected at all (covers prototype-member names like __proto__).
      return declared.has(requestedId)
        ? rejection('FUNCTION_NOT_BOUND', 'selected-but-unbound', 'NOT_PERFORMED')
        : rejection('FUNCTION_ID_UNKNOWN', 'not-selected', 'NOT_PERFORMED');
    }
    if (entry.declaration.effects !== 'none') {
      return rejection('EFFECT_PERMIT_REQUIRED',
        'effects:' + entry.declaration.effects
        + ' requires an existing Kernel/KDP Permit; this channel never mints permits or dispatches effects',
        'NOT_PERFORMED', { permitRequired: true });
    }
    if (entry.validator === undefined) {
      // The schema exists only as a ref; no Validator was selected. Fail
      // closed instead of pretending the input was schema-validated.
      return rejection('INPUT_VALIDATION_UNAVAILABLE',
        'inputSchemaRef:' + entry.declaration.inputSchemaRef, 'UNAVAILABLE');
    }
    let verdict: unknown;
    try {
      verdict = entry.validator(request.input);
    } catch (error) {
      return rejection('INPUT_VALIDATION_FAILED', sanitizeDetail(error), 'FAILED');
    }
    if (verdict !== true) {
      // Any non-true verdict (false, non-boolean, promise) fails closed.
      return rejection('INPUT_VALIDATION_FAILED',
        verdict === false ? 'input-rejected-by-validator' : 'verdict:not-boolean', 'FAILED');
    }

    const input = request.input;
    const envelopeOutcome = await envelope.execute({
      providerKind: providerKind as BoundedProviderKind,
      run: (ctx) => ctx.step({ workUnits: stepWorkUnits }, async () => entry.callable(input)),
    });

    const identity = {
      functionId: requestedId,
      elementId: entry.lockEntry.elementId,
      source: entry.declaration.source,
      target: entry.lockEntry.target,
    };
    switch (envelopeOutcome.status) {
      case 'COMPLETED':
        return Object.freeze({
          status: 'COMPLETED', disposition: 'OBSERVED', output: envelopeOutcome.output,
          ...identity, provider: envelopeOutcome.provider, inputValidation: 'VALIDATED',
          remaining: envelopeOutcome.remaining, trace: envelopeOutcome.trace,
          attested: false, verified: false, qualified: false,
          authority: 'NONE', effectDispatched: false,
        } satisfies Extract<FunctionCallOutcome, { status: 'COMPLETED' }>);
      case 'BUDGET_EXHAUSTED':
        return Object.freeze({
          status: 'BUDGET_EXHAUSTED', axis: envelopeOutcome.axis,
          disposition: 'UNKNOWN', output: null,
          ...identity, providerKind: providerKind as BoundedProviderKind, inputValidation: 'VALIDATED',
          remaining: envelopeOutcome.remaining, trace: envelopeOutcome.trace,
          attested: false, authority: 'NONE', effectDispatched: false,
        } satisfies Extract<FunctionCallOutcome, { status: 'BUDGET_EXHAUSTED' }>);
      case 'EXECUTION_FAILED':
        return Object.freeze({
          status: 'EXECUTION_FAILED', reason: envelopeOutcome.reason,
          disposition: 'UNKNOWN', output: null,
          ...identity, providerKind: providerKind as BoundedProviderKind, inputValidation: 'VALIDATED',
          remaining: envelopeOutcome.remaining, trace: envelopeOutcome.trace,
          attested: false, authority: 'NONE', effectDispatched: false,
        } satisfies Extract<FunctionCallOutcome, { status: 'EXECUTION_FAILED' }>);
      default:
        // Unreachable for a providerKind validated at construction; mapped
        // defensively so the envelope's admission verdict stays honest.
        return Object.freeze({
          status: 'REJECTED', code: 'PROVIDER_KIND_UNREGISTERED',
          detail: 'providerKind:' + (envelopeOutcome as { providerKind: string }).providerKind,
          functionId: echoedId, inputValidation: 'VALIDATED',
          remaining: envelopeOutcome.remaining, output: null, disposition: 'UNKNOWN',
          attested: false, authority: 'NONE', effectDispatched: false,
        } satisfies RejectedOutcome);
    }
  };

  return Object.freeze({
    expectedTarget,
    providerKind: providerKind as BoundedProviderKind,
    functions,
    invoke,
  } satisfies FunctionInvoker);
}
