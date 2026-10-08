/**
 * v0.7 Workflow Kind descriptor/dispatch adapter (issue #610, fine-grained
 * DAG T007A, authority #589 PACK-A).
 *
 * ADAPTER, not Microkernel semantics: Workflow is one ordinary Semantic Kind
 * implementation behind the generic Kind port, exactly like any neutral test
 * Kind. This module owns exactly the concerns #589 assigns to T007A:
 *
 * - the exact Workflow KindRef — one frozen `{kindId, version}` identity
 *   (`kaicreator.workflow@1.0.0`), a plain open Kind contract reference with
 *   no kernel-side special casing;
 * - the exact Workflow KindImplementation descriptor factory: given the exact
 *   opaque implementation identity (id/version/content digest) of whichever
 *   engine implementation binds this Kind, it mints the
 *   `KindImplementationBindingInput` consumed by the generic sealed Assembly
 *   seam (`sealRuntimeAssembly`, T002B) — binding is registration, and
 *   dispatch happens exclusively through the Assembly-bound admission path;
 * - the closed-world Workflow semantic validator: the material `semanticBody`
 *   is validated as exactly `{initial, states, transitions}` — unique exact
 *   state/transition identities, transition endpoints and the initial state
 *   referencing declared states only, and every unknown material Workflow
 *   semantic field failing closed (never guessed, never silently preserved).
 *
 * Boundary discipline: XState/compiler/runtime types are private to the
 * engine implementation selected at Assembly binding time and are ABSENT from
 * this adapter and from every generic Component/Definition/Assembly authority
 * contract. There is no second runtime/transition authority here and nothing
 * executes: the descriptor mints identity + the validator handle only, so
 * T007B can privately bridge the admitted material into the concrete engine
 * without any Microkernel source edit. Replacing the engine means sealing a
 * new Assembly over a different exact implementation pin — Assembly identity
 * changes, Definition identity does not.
 *
 * Validation consumes the shared descriptor-safe record primitive and unified
 * exact-reference authority of `record-safety.ts` (#557 + #578), the base
 * envelope validation of `component.ts`, and the content-digest predicate of
 * `identity.ts` — imported, never reimplemented. The `KindImplementationBindingInput`
 * TYPE is imported type-only from `runtime-assembly.ts` (T002B seam); the
 * adapter never calls the kernel and never gains activation/execution/effect
 * authority. No global Kind catalog or registry exists here.
 */
import {
  validateComponentEnvelope,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type KindRef,
  type SemanticContractRef,
} from '../contracts/component.js';
import { isContentDigest } from '../contracts/identity.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from '../contracts/record-safety.js';
import type { KindImplementationBindingInput } from '../contracts/runtime-assembly.js';

/**
 * Exact identity of the Workflow semantic Kind contract. Open KindRef
 * discipline (T001A): contract identity only — implementation/provider/module
 * identity is bound later at Assembly sealing time.
 */
export const WORKFLOW_KIND_ID = 'kaicreator.workflow';

/** Exact version of the Workflow semantic Kind contract bound by this adapter. */
export const WORKFLOW_KIND_VERSION = '1.0.0';

/** The one exact, frozen Workflow KindRef this adapter serves. */
export const WORKFLOW_KIND_REF: KindRef = Object.freeze({
  kindId: WORKFLOW_KIND_ID,
  version: WORKFLOW_KIND_VERSION,
});

/** Fail-closed Workflow adapter failure taxonomy (#610). */
export type WorkflowKindAdapterErrorCode =
  | 'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR'
  | 'INVALID_WORKFLOW_COMPONENT_ENVELOPE'
  | 'INVALID_WORKFLOW_COMPONENT_FAMILY'
  | 'WORKFLOW_KIND_MISMATCH'
  | 'INVALID_WORKFLOW_SEMANTIC_BODY'
  | 'UNKNOWN_WORKFLOW_SEMANTIC_FIELD'
  | 'INVALID_WORKFLOW_STATES'
  | 'INVALID_WORKFLOW_STATE'
  | 'INVALID_WORKFLOW_TRANSITIONS'
  | 'INVALID_WORKFLOW_TRANSITION'
  | 'UNKNOWN_WORKFLOW_STATE_REFERENCE';

/** The failure taxonomy discriminator: each code maps to exactly one class. */
export type WorkflowKindFailureClass = 'DESCRIPTOR' | 'ENVELOPE' | 'KIND' | 'SEMANTIC';

const FAILURE_CLASS_BY_CODE: Record<WorkflowKindAdapterErrorCode, WorkflowKindFailureClass> = {
  INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR: 'DESCRIPTOR',
  INVALID_WORKFLOW_COMPONENT_ENVELOPE: 'ENVELOPE',
  INVALID_WORKFLOW_COMPONENT_FAMILY: 'ENVELOPE',
  WORKFLOW_KIND_MISMATCH: 'KIND',
  INVALID_WORKFLOW_SEMANTIC_BODY: 'SEMANTIC',
  UNKNOWN_WORKFLOW_SEMANTIC_FIELD: 'SEMANTIC',
  INVALID_WORKFLOW_STATES: 'SEMANTIC',
  INVALID_WORKFLOW_STATE: 'SEMANTIC',
  INVALID_WORKFLOW_TRANSITIONS: 'SEMANTIC',
  INVALID_WORKFLOW_TRANSITION: 'SEMANTIC',
  UNKNOWN_WORKFLOW_STATE_REFERENCE: 'SEMANTIC',
};

export class WorkflowKindAdapterError extends Error {
  readonly code: WorkflowKindAdapterErrorCode;
  readonly failureClass: WorkflowKindFailureClass;

  constructor(code: WorkflowKindAdapterErrorCode, message: string) {
    super(message);
    this.name = 'WorkflowKindAdapterError';
    this.code = code;
    this.failureClass = FAILURE_CLASS_BY_CODE[code];
  }
}

function fail(code: WorkflowKindAdapterErrorCode, message: string): never {
  throw new WorkflowKindAdapterError(code, message);
}

// ---------------------------------------------------------------------------
// Closed-world Workflow semantic material shape
// ---------------------------------------------------------------------------

/** Closed-world fields of one Workflow state declaration. */
const WORKFLOW_STATE_FIELDS = new Set<string>(['stateId']);

/** Closed-world fields of one Workflow transition declaration. */
const WORKFLOW_TRANSITION_FIELDS = new Set<string>(['transitionId', 'from', 'to', 'event']);

/** The complete closed-world field set of the Workflow semantic material body. */
const WORKFLOW_SEMANTIC_BODY_FIELDS = new Set<string>(['initial', 'states', 'transitions']);

/**
 * One declared Workflow state: a single exact identity. Engine-private state
 * semantics (invocations, activities, guards, entry/exit effects) are NOT
 * material here — they belong to the engine implementation bound at Assembly
 * time and can never leak into the generic Kind contract.
 */
export interface WorkflowStateDeclaration {
  readonly stateId: string;
}

/**
 * One declared Workflow transition: exact identity, declared-state endpoints
 * and an optional exact triggering event identity. Engine-private transition
 * semantics (guards, actions, delays) are not material here.
 */
export interface WorkflowTransitionDeclaration {
  readonly transitionId: string;
  readonly from: string;
  readonly to: string;
  readonly event?: string;
}

/**
 * The complete behaviorally material semantic body of a Workflow Component:
 * one initial state identity, a non-empty set of uniquely identified states,
 * and transitions whose endpoints reference declared states only. This is
 * the whole closed world — unknown fields fail closed at validation.
 */
export interface WorkflowSemanticBody {
  readonly initial: string;
  readonly states: readonly [WorkflowStateDeclaration, ...WorkflowStateDeclaration[]];
  readonly transitions: readonly WorkflowTransitionDeclaration[];
}

// ---------------------------------------------------------------------------
// Exact KindImplementation descriptor factory
// ---------------------------------------------------------------------------

/**
 * Sealing input for the Workflow Kind implementation: the exact opaque
 * implementation identity (id/version/content digest) of the engine
 * implementation binding this Kind, plus the optional exact semantic/capability
 * contracts understood by that implementation. The descriptor is validated
 * and snapshotted here; only the returned binding may participate in sealing.
 */
export interface WorkflowKindImplementationDescriptor {
  readonly implementation: {
    readonly implementationId: string;
    readonly implementationVersion: string;
    readonly implementationDigest: string;
  };
  readonly understoodSemanticContracts?: readonly SemanticContractRef[];
  readonly understoodCapabilities?: readonly CapabilityContractRef[];
}

const DESCRIPTOR_FIELDS = new Set<string>(['implementation', 'understoodSemanticContracts', 'understoodCapabilities']);

const IMPLEMENTATION_FIELDS = new Set<string>([
  'implementationId',
  'implementationVersion',
  'implementationDigest',
]);

/** Snapshot one authority-bearing record, mapping descriptor issues to the typed descriptor failure. */
function requireSafeRecord(value: unknown, description: string): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${description} ${describeRecordSafetyIssue(result.issue)}`,
    );
  }
  return result.snapshot;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !isNonEmptyIdentityString(value)) {
    fail('INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${path} must not embed a version selector (\`id@version\`); use the exact version field`,
    );
  }
  return value;
}

/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`,
    );
  }
}

/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`,
    );
  }
}

/** Snapshot one exact `{idField, version}` reference as a fresh frozen object. */
function snapshotExactRef(
  value: unknown,
  path: string,
  idField: 'contractId' | 'capabilityId',
): { id: string; version: string } {
  const candidate = requireSafeRecord(value, path);
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${path} must contain exactly {${idField}, version}`,
    );
  }
  const id = requireExactIdentityString(candidate[idField], `${path}.${idField}`);
  requireNonFloatingIdentity(id, `${path}.${idField}`);
  const version = requireExactIdentityString(candidate.version, `${path}.version`);
  requireNonFloatingIdentity(version, `${path}.version`);
  requireExactVersion(version, `${path}.version`);
  return Object.freeze({ id, version });
}

/** Snapshot one exact ref collection: duplicates by id fail closed (never deduplicated). */
function snapshotExactRefCollection(
  value: unknown,
  description: string,
  idField: 'contractId' | 'capabilityId',
): ReadonlyArray<{ id: string; version: string }> {
  const entries = requireSafeArray(value, description);
  const seen = new Set<string>();
  const refs = entries.map((entry, index) => {
    const ref = snapshotExactRef(entry, `${description}[${index}]`, idField);
    if (seen.has(ref.id)) {
      fail(
        'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
        `${description}[${index}] declares ${ref.id} more than once (exact refs only)`,
      );
    }
    seen.add(ref.id);
    return ref;
  });
  return Object.freeze(refs);
}

/** Snapshot one authority-bearing array, mapping descriptor issues to the typed descriptor failure. */
function requireSafeArray(value: unknown, description: string): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `${description} ${describeRecordSafetyIssue(result.issue)}`,
    );
  }
  return result.snapshot;
}

/**
 * Mint the exact Workflow KindImplementation binding consumed by the generic
 * sealed Assembly seam (T002B). The returned binding registers the adapter's
 * closed-world validator as the dispatch handle for the exact
 * `kaicreator.workflow@1.0.0` KindRef bound to the supplied exact
 * implementation pin — nothing executes here, and replacing the engine means
 * calling this factory with a different exact implementation identity and
 * sealing a new Assembly over it (zero Microkernel source edits).
 */
export function createWorkflowKindImplementation(
  descriptor: WorkflowKindImplementationDescriptor,
): KindImplementationBindingInput {
  const view = requireSafeRecord(descriptor, 'workflow kind implementation descriptor');
  const unexpectedField = Object.keys(view).find((key) => !DESCRIPTOR_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `workflow kind implementation descriptor must contain only {implementation, understoodSemanticContracts?, understoodCapabilities?}; unexpected field "${unexpectedField}" (provider/module/function identities are never descriptor material)`,
    );
  }
  if (!('implementation' in view)) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      'workflow kind implementation descriptor.implementation is required',
    );
  }

  const implementationView = requireSafeRecord(view.implementation, 'descriptor.implementation');
  const unexpectedImplementationField = Object.keys(implementationView).find(
    (key) => !IMPLEMENTATION_FIELDS.has(key),
  );
  if (unexpectedImplementationField !== undefined) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      `descriptor.implementation must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected field "${unexpectedImplementationField}"`,
    );
  }
  const implementationId = requireExactIdentityString(
    implementationView.implementationId,
    'descriptor.implementation.implementationId',
  );
  requireNonFloatingIdentity(implementationId, 'descriptor.implementation.implementationId');
  const implementationVersion = requireExactIdentityString(
    implementationView.implementationVersion,
    'descriptor.implementation.implementationVersion',
  );
  requireNonFloatingIdentity(implementationVersion, 'descriptor.implementation.implementationVersion');
  requireExactVersion(implementationVersion, 'descriptor.implementation.implementationVersion');
  if (typeof implementationView.implementationDigest !== 'string') {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      'descriptor.implementation.implementationDigest must be a non-empty content digest string',
    );
  }
  requireNonFloatingIdentity(
    implementationView.implementationDigest,
    'descriptor.implementation.implementationDigest',
  );
  if (!isContentDigest(implementationView.implementationDigest)) {
    fail(
      'INVALID_WORKFLOW_IMPLEMENTATION_DESCRIPTOR',
      'descriptor.implementation.implementationDigest must be a non-empty content digest string',
    );
  }

  const understoodSemanticContracts =
    'understoodSemanticContracts' in view && view.understoodSemanticContracts !== undefined
      ? snapshotExactRefCollection(view.understoodSemanticContracts, 'descriptor.understoodSemanticContracts', 'contractId')
      : Object.freeze([] as ReadonlyArray<{ id: string; version: string }>);
  const understoodCapabilities =
    'understoodCapabilities' in view && view.understoodCapabilities !== undefined
      ? snapshotExactRefCollection(view.understoodCapabilities, 'descriptor.understoodCapabilities', 'capabilityId')
      : Object.freeze([] as ReadonlyArray<{ id: string; version: string }>);

  // #642: the mapped authority arrays minted into the returned binding are
  // frozen at every level (mapped array, per-element ref). The mapped arrays
  // themselves carry authority into sealed binding material, so an unfrozen
  // mapped array would let post-return caller mutation (e.g. push) alter the
  // evidence later sealed by the Assembly seam.
  return Object.freeze({
    pin: Object.freeze({
      kind: Object.freeze({ kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version }),
      implementation: Object.freeze({
        implementationId,
        implementationVersion,
        implementationDigest: implementationView.implementationDigest,
      }),
    }),
    understoodSemanticContracts: Object.freeze(
      understoodSemanticContracts.map((ref) =>
        Object.freeze({ contractId: ref.id, version: ref.version }),
      ),
    ),
    understoodCapabilities: Object.freeze(
      understoodCapabilities.map((ref) =>
        Object.freeze({ capabilityId: ref.id, version: ref.version }),
      ),
    ),
    validateComponent: validateWorkflowComponent,
  });
}

// ---------------------------------------------------------------------------
// Closed-world Workflow semantic validator
// ---------------------------------------------------------------------------

/** Snapshot one record of the semantic body, mapping issues to the typed body failure. */
function requireBodyRecord(value: unknown, description: string): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_WORKFLOW_SEMANTIC_BODY', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Snapshot one array of the semantic body, mapping issues to the typed body failure. */
function requireBodyArray(value: unknown, description: string): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_WORKFLOW_SEMANTIC_BODY', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Exact identity string of semantic material (states/transitions/events). */
function requireSemanticIdentity(value: unknown, path: string, code: WorkflowKindAdapterErrorCode): string {
  if (typeof value !== 'string' || !isNonEmptyIdentityString(value)) {
    fail(code, `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value)) {
    fail(code, `${path} must not embed a version selector (\`id@version\`)`);
  }
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(code, `${path} must be an exact identity, not a floating/range selector`);
  }
  return value;
}

/**
 * Structural fail-closed validation of the closed-world Workflow semantic
 * material body. Runs the base envelope validation first — its failures
 * surface unchanged as `ComponentContractError` — then validates
 * `semanticBody` on descriptor-safe snapshots as exactly
 * `{initial, states, transitions}`:
 *
 * - `states` is a non-empty array of uniquely identified `{stateId}` records;
 * - `transitions` is an array of uniquely identified `{transitionId, from, to,
 *   event?}` records whose endpoints reference declared states only;
 * - `initial` references a declared state;
 * - any unknown material field at any level fails closed — no guessing, no
 *   silent preservation, no engine-private semantics in the generic contract.
 */
function validateWorkflowSemanticBody(semanticBody: unknown): void {
  const view = requireBodyRecord(semanticBody, 'workflow semantic body');
  const unexpectedField = Object.keys(view).find((key) => !WORKFLOW_SEMANTIC_BODY_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'UNKNOWN_WORKFLOW_SEMANTIC_FIELD',
      `workflow semantic body must contain exactly {initial, states, transitions}; unknown material field "${unexpectedField}" (engine-private Workflow semantics are never generic Kind material)`,
    );
  }
  for (const required of WORKFLOW_SEMANTIC_BODY_FIELDS) {
    if (!(required in view)) {
      fail('INVALID_WORKFLOW_SEMANTIC_BODY', `workflow semantic body.${required} is required`);
    }
  }

  const stateEntries = requireBodyArray(view.states, 'workflow semantic body.states');
  if (stateEntries.length === 0) {
    fail('INVALID_WORKFLOW_STATES', 'workflow semantic body.states must declare at least one state');
  }
  const stateIds = new Set<string>();
  for (const [index, entry] of stateEntries.entries()) {
    const at = `workflow semantic body.states[${index}]`;
    const state = requireBodyRecord(entry, at);
    const unexpectedStateField = Object.keys(state).find((key) => !WORKFLOW_STATE_FIELDS.has(key));
    if (unexpectedStateField !== undefined) {
      fail(
        'INVALID_WORKFLOW_STATE',
        `${at} must contain exactly {stateId}; unknown material field "${unexpectedStateField}"`,
      );
    }
    if (!('stateId' in state)) {
      fail('INVALID_WORKFLOW_STATE', `${at}.stateId is required`);
    }
    const stateId = requireSemanticIdentity(state.stateId, `${at}.stateId`, 'INVALID_WORKFLOW_STATE');
    if (stateIds.has(stateId)) {
      fail('INVALID_WORKFLOW_STATES', `${at} declares state "${stateId}" more than once (exact identities only)`);
    }
    stateIds.add(stateId);
  }

  const transitionEntries = requireBodyArray(view.transitions, 'workflow semantic body.transitions');
  const transitionIds = new Set<string>();
  for (const [index, entry] of transitionEntries.entries()) {
    const at = `workflow semantic body.transitions[${index}]`;
    const transition = requireBodyRecord(entry, at);
    const unexpectedTransitionField = Object.keys(transition).find(
      (key) => !WORKFLOW_TRANSITION_FIELDS.has(key),
    );
    if (unexpectedTransitionField !== undefined) {
      fail(
        'INVALID_WORKFLOW_TRANSITION',
        `${at} must contain exactly {transitionId, from, to, event?}; unknown material field "${unexpectedTransitionField}"`,
      );
    }
    for (const required of ['transitionId', 'from', 'to'] as const) {
      if (!(required in transition)) {
        fail('INVALID_WORKFLOW_TRANSITION', `${at}.${required} is required`);
      }
    }
    const transitionId = requireSemanticIdentity(
      transition.transitionId,
      `${at}.transitionId`,
      'INVALID_WORKFLOW_TRANSITION',
    );
    if (transitionIds.has(transitionId)) {
      fail(
        'INVALID_WORKFLOW_TRANSITIONS',
        `${at} declares transition "${transitionId}" more than once (exact identities only)`,
      );
    }
    transitionIds.add(transitionId);
    for (const endpoint of ['from', 'to'] as const) {
      const target = requireSemanticIdentity(transition[endpoint], `${at}.${endpoint}`, 'INVALID_WORKFLOW_TRANSITION');
      if (!stateIds.has(target)) {
        fail(
          'UNKNOWN_WORKFLOW_STATE_REFERENCE',
          `${at}.${endpoint} references undeclared state "${target}" (transition endpoints must reference declared states; states are never implicitly created)`,
        );
      }
    }
    if ('event' in transition && transition.event !== undefined) {
      requireSemanticIdentity(transition.event, `${at}.event`, 'INVALID_WORKFLOW_TRANSITION');
    }
  }

  const initial = requireSemanticIdentity(view.initial, 'workflow semantic body.initial', 'INVALID_WORKFLOW_SEMANTIC_BODY');
  if (!stateIds.has(initial)) {
    fail(
      'UNKNOWN_WORKFLOW_STATE_REFERENCE',
      `workflow semantic body.initial references undeclared state "${initial}" (the initial state must be one of the declared states)`,
    );
  }
}

/**
 * Closed-world ComponentKindValidator for the exact Workflow KindRef. The
 * envelope is validated by the base contract first; the family must be
 * `semantic` and the KindRef must equal `WORKFLOW_KIND_REF` exactly — this
 * validator never validates another Kind's material. Failures are typed
 * `WorkflowKindAdapterError` and propagate unchanged through both the
 * low-level must-understand seam (T001D) and the Assembly-bound seam (T002B).
 */
export function validateWorkflowComponent(envelope: ComponentEnvelope): void {
  validateComponentEnvelope(envelope);

  const view = requireSafeRecord(envelope, 'component envelope');
  if (view.family !== 'semantic') {
    fail(
      'INVALID_WORKFLOW_COMPONENT_FAMILY',
      "component envelope.family must be 'semantic' for the Workflow Kind contract",
    );
  }
  const kind = requireSafeRecord(view.kind, 'component envelope.kind');
  if (kind.kindId !== WORKFLOW_KIND_REF.kindId || kind.version !== WORKFLOW_KIND_REF.version) {
    fail(
      'WORKFLOW_KIND_MISMATCH',
      `the Workflow validator serves exactly ${WORKFLOW_KIND_REF.kindId}@${WORKFLOW_KIND_REF.version}; got "${String(kind.kindId)}@${String(kind.version)}" (exact Kind match only, never another Kind or version)`,
    );
  }

  validateWorkflowSemanticBody(view.semanticBody);
}
