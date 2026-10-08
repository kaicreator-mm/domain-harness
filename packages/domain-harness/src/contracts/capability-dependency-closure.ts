/**
 * v0.7 Tool-to-Tool required Capability closure (issue #630, fine-grained DAG
 * T003E; authority #589 PACK-B; bounded repair #651).
 *
 * The Microkernel seam that computes the deterministic dependency closure of
 * one admitted root Tool's `requiresCapabilities` as EVIDENCE/COMPOSITION
 * ONLY, against ONE unchanged final Runtime Assembly: the root Tool is seeded
 * through the accepted T002B Assembly-bound admission seam, every required
 * Capability is selected through the T003B Definition-plane provider
 * selection (consumed, never re-implemented), and every selected dependency
 * Tool is consumed through the shared T003C consumer-verifier seam (#640) —
 * the caller supplies the exact ALREADY-MINTED dependency binding for each
 * dependency, and T003E verifies each against that SAME final Assembly. The
 * Microkernel owns exact closure evidence here — never concrete Tool
 * semantics: no provider selection logic, no binding decision logic, no
 * minting of new bindings, no resealing of Assemblies, no invocation, no
 * resource resolution and no ToolRegistry authority exists in this file.
 *
 * Normative rules owned here, without exception (#589 PACK-B T003E, as
 * repaired by #651):
 * - the closure is derived ONLY from the root Tool's declared
 *   `requiredCapabilities` (exact {capabilityId, version} refs, already
 *   exactness-validated by the graph envelope contract at entry); traversal
 *   is normalized by exact identity — required refs are visited in sorted
 *   exact order and every emitted list (entries, edges) is sorted by exact
 *   identity, never by source/registry insertion order;
 * - the seed Tool is admitted through the accepted T002B
 *   `admitComponentWithAssembly` seam against the one exact final
 *   Assembly/current Definition; seed admission identity must match root
 *   Tool + current DefinitionGraphDigest + final assemblyDigest, and stale
 *   or foreign material fails with the T002B-owned typed taxonomy
 *   (ASSEMBLY_ADMISSION_*) before any traversal;
 * - each required ref is resolved by the corrected T003B currentness-bound
 *   selection (`resolveCurrentCapabilityProvider`, consumer excluded from
 *   candidacy — no silent self-provision); zero or multiple providers
 *   propagates the original typed `CapabilityProvisionContractError`
 *   unwrapped (0/1/>1 fail-closed semantics preserved);
 * - each selected dependency Tool consumes the accepted #640 T003C
 *   consumer-verification seam (`isSealedToolImplementationBinding` +
 *   `verifyToolImplementationBinding`) against that SAME unchanged final
 *   Assembly. T003E MUST NOT call the T003C mint/bind path to choose or bind
 *   a new implementation and MUST NOT reproduce T003C digest/currentness
 *   rules. The caller supplies the exact already-minted dependency
 *   binding(s): bindings are located BY EXACT SUBJECT IDENTITY — no lookup
 *   by latest/default/order/id alias, never first-wins — and a selected
 *   provider without a supplied binding, an unminted lookalike, a missing or
 *   replaced final-Assembly slot, a stale Definition identity or an
 *   exact-pin mismatch fails with the owning typed taxonomy
 *   (`ToolImplementationBindingError`) unwrapped;
 * - a provider reached again through another edge is recorded as an edge but
 *   consumed exactly once (diamond sharing);
 * - capability dependency cycles are rejected as `CAPABILITY_DEPENDENCY_CYCLE`
 *   in v0.7: any selected provider already on the current traversal stack
 *   fails closed with the exact cycle path. No lazy/runtime recursion
 *   semantics are invented;
 * - T003E NEVER reseals or mutates the Assembly: the input `finalAssembly`
 *   identity is the input/currentness authority, not a T003E output — the
 *   sealed result carries no successor Assembly at all;
 * - closure evidence binds the exact final DefinitionGraphDigest + the exact
 *   final assemblyDigest (both the unchanged input identity) + the seed
 *   admission identity + the exact selected dependency graph (entries with
 *   the exact verified implementation identities/bindingDigests + edges). It
 *   is fresh/frozen/non-aliasing and contains NO live implementation handles
 *   or functions in identity: handles are paired with their exact verified
 *   pins OUTSIDE the evidence, on the sealed result (the original opaque
 *   reference exposed only after full verification by the T003C seam);
 * - the root Tool's OWN implementation binding is intentionally NOT part of
 *   the closure: the closure covers exactly the tools the root requires.
 *   Binding the root itself is the caller's T003C concern;
 * - NO invocation occurs in T003E. Closure evidence grants no invocation,
 *   occurrence or effect authority.
 *
 * Torn-snapshot discipline (#587 §E, same as #555/T003C): every
 * authority-bearing caller input is descriptor-safe validated and
 * synchronously snapshotted before the first `await` — the Definition graph
 * is deep-copied into module-owned state and the dependency-binding claimed
 * subjects are captured own-data-only (zero getter executions) into a
 * module-owned map before any suspension, so a caller mutating its own
 * graph, bindings or pins while a digest promise is pending can never mint
 * torn or hybrid closure evidence.
 *
 * Boundary: validation consumes the shared descriptor-safe record primitive
 * and unified exact-reference authority of `record-safety.ts` (#557 + #578),
 * the #555 graph contract seam, the T003A Tool declaration validator, the
 * T002B Assembly-bound admission seam, the T003B currentness-bound provider
 * selection and the #640 T003C consumer-verifier seam — all imported, never
 * reimplemented. No Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/
 * Search/Storage import is permitted in this file.
 */
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentId,
} from './component.js';
import {
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from './definition-graph.js';
import {
  computeCanonicalJsonDigest,
  isContentDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import { resolveCurrentCapabilityProvider } from './capability-provision.js';
import {
  admitComponentWithAssembly,
  type SealedRuntimeAssembly,
} from './runtime-assembly.js';
import { validateToolComponent } from './tool-component.js';
import {
  isSealedToolImplementationBinding,
  ToolImplementationBindingError,
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
  type ToolImplementationIdentity,
} from './tool-implementation-binding.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

/**
 * Versioned closure-evidence digest domain tag, owned exclusively by this
 * file. Sibling to, and never borrowed by, the T001B/T001C/T002B/T003C
 * digest domains. The #651 bounded repair changed the evidence material
 * shape (seed admission bound in, input final Assembly identity bound in
 * place of a successor Assembly), so the domain tag advances per this
 * module's own rule: any material shape change is a NEW domain tag and
 * historical closure identities never change retroactively.
 */
const CAPABILITY_DEPENDENCY_CLOSURE_EVIDENCE_DOMAIN =
  'kaicreator.capability-dependency-closure.evidence.v2';

/**
 * Fail-closed closure failure taxonomy (#589 PACK-B T003E, as repaired by
 * #651). Every failure is typed and terminal — none carries or suggests a
 * substitute/default/latest resolution, and no diagnostic ever serializes
 * implementation handles, secret values or live objects (only exact identity
 * strings participate).
 *
 * T003B selection failures propagate under `CapabilityProvisionContractError`,
 * seed admission/currentness failures under the T002B-owned
 * `RuntimeAssemblyError`, and dependency-binding authority failures under the
 * T003C-owned `ToolImplementationBindingError` — each unwrapped, exactly as
 * those modules define them. This taxonomy covers only T003E-owned failures.
 */
export type CapabilityDependencyClosureErrorCode =
  | 'INVALID_CLOSURE_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'ROOT_COMPONENT_NOT_FOUND'
  | 'ROOT_NOT_TOOL_COMPONENT'
  | 'DUPLICATE_EXACT_PIN_SUBJECT'
  | 'CAPABILITY_DEPENDENCY_CYCLE';

export class CapabilityDependencyClosureError extends Error {
  readonly code: CapabilityDependencyClosureErrorCode;
  /**
   * CAPABILITY_DEPENDENCY_CYCLE only: the exact ComponentId cycle path
   * (stack entry point through the closing edge), deterministic under every
   * source ordering. Empty for every other code.
   */
  readonly cyclePath: readonly ComponentId[];

  constructor(
    code: CapabilityDependencyClosureErrorCode,
    message: string,
    cyclePath: readonly ComponentId[] = [],
  ) {
    super(message);
    this.name = 'CapabilityDependencyClosureError';
    this.code = code;
    this.cyclePath = Object.freeze([...cyclePath]);
  }
}

/**
 * One exact per-subject expected pin: the consumer-supplied exact
 * implementation identity that the verified binding evidence pin must equal
 * exactly (all three fields) for that closure provider Tool — never resolved
 * against candidates, ordering, latest or any other lookup.
 */
export interface CapabilityClosureExactPin {
  /** The exact closure provider Tool Component the pin is expected for. */
  readonly toolComponentId: ComponentId;
  /** The exact expected implementation pin (id/version/content digest). */
  readonly pin: ToolImplementationIdentity;
}

/** Complete closure input. All authority-bearing material is synchronously
 * snapshotted at call time; the caller's objects are never frozen or
 * mutated. */
export interface CapabilityDependencyClosureInput {
  /**
   * The ONE exact current final sealed Runtime Assembly — the unchanged
   * input/currentness authority of the whole closure. Never mutated, never
   * resealed, never replaced by a T003E output.
   */
  readonly assembly: SealedRuntimeAssembly;
  /** The exact admitted root Tool Component whose closure is computed. */
  readonly rootComponentId: ComponentId;
  /** The live Definition graph; its digest is authoritatively recomputed. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /**
   * The caller-supplied, ALREADY-MINTED dependency bindings (the accepted
   * #640 sealed binding objects) for the closure's dependency Tools. Each
   * selected provider consumes the binding whose exact subject identity
   * (`evidence.toolComponentId`) equals the provider ComponentId — no lookup
   * by latest/default/order/id alias, never first-wins; at most one binding
   * per claimed subject. Missing supply fails the owning typed taxonomy.
   */
  readonly dependencyBindings: readonly SealedToolImplementationBinding[];
  /**
   * Optional exact per-subject expected pins. Each subject may carry at most
   * one pin; duplicates fail closed typed. A supplied pin must equal the
   * verified binding evidence pin exactly.
   */
  readonly exactPins?: readonly CapabilityClosureExactPin[];
  /** The Sha256Port used for every authoritative digest recomputation. */
  readonly sha256: Sha256Port;
}

/** One selected dependency edge: consumer requires ref -> provider. */
export interface CapabilityClosureEdge {
  /** Exact ComponentId of the consuming Tool. */
  readonly consumerComponentId: ComponentId;
  /** The exact required capability ref (fresh frozen). */
  readonly requiredCapability: CapabilityContractRef;
  /** Exact ComponentId of the selected provider Tool. */
  readonly providerComponentId: ComponentId;
}

/** One consumed closure provider Tool: exact identity + exact verified pin. */
export interface CapabilityClosureEntry {
  /** Exact ComponentId of the consumed provider Tool. */
  readonly toolComponentId: ComponentId;
  /** The exact ref through which the provider was first consumed (sorted-traversal deterministic). */
  readonly boundCapability: CapabilityContractRef;
  /** The exact VERIFIED implementation pin (id/version/content digest). */
  readonly implementation: ToolImplementationIdentity;
  /** The exact verified T003C binding evidence digest for this provider. */
  readonly bindingDigest: ContentDigest;
}

/**
 * The seed admission identity bound into the closure evidence: the exact
 * T002B Assembly-bound admission of the root Tool against the one unchanged
 * final Assembly/current Definition.
 */
export interface CapabilityClosureSeedAdmission {
  /** Exact ComponentId of the admitted root Tool. */
  readonly componentId: ComponentId;
  /** Exact Definition identity the admission was bound to. */
  readonly definitionGraphDigest: ContentDigest;
  /** Exact final Assembly digest the admission was bound to. */
  readonly assemblyDigest: ContentDigest;
  /** The exact admitted Kind ref. */
  readonly admittedKind: { readonly kindId: string; readonly version: string };
  /** The exact sealed KindImplementation provenance of the admission. */
  readonly admittedKindImplementation: {
    readonly kind: { readonly kindId: string; readonly version: string };
    readonly implementation: ToolImplementationIdentity;
  };
}

/**
 * Serializable, content-addressed closure evidence. Fresh, frozen,
 * non-aliasing; binds the exact final DefinitionGraphDigest + the exact final
 * assemblyDigest (both the UNCHANGED INPUT identity — never a T003E output)
 * + the seed admission + the exact selected dependency graph (entries +
 * edges, identity-normalized). No handle, secret, endpoint, provider object
 * or invocation field is representable.
 */
export interface CapabilityDependencyClosureEvidence {
  readonly status: 'CLOSED';
  /** Exact ComponentId of the admitted root Tool. */
  readonly rootComponentId: ComponentId;
  /** Exact Definition graph content digest — the unchanged input identity. */
  readonly definitionGraphDigest: ContentDigest;
  /** Digest of the exact INPUT final Assembly — unchanged input identity. */
  readonly assemblyDigest: ContentDigest;
  /** The exact T002B Assembly-bound seed admission identity. */
  readonly seedAdmission: CapabilityClosureSeedAdmission;
  /** Consumed provider Tools, sorted by exact ComponentId. */
  readonly entries: readonly CapabilityClosureEntry[];
  /** Selected dependency edges, sorted by exact identity. */
  readonly edges: readonly CapabilityClosureEdge[];
  /** Content digest of the exact closure evidence material. */
  readonly closureDigest: ContentDigest;
}

/**
 * Opaque runtime handle paired with one exact closure provider pin, OUTSIDE
 * every digest material — the runtime pairing the evidence deliberately
 * excludes from identity. The handle reference is the ORIGINAL exposed only
 * after full T003C verification.
 */
export interface CapabilityClosureHandlePair {
  /** Exact ComponentId of the consumed provider Tool. */
  readonly toolComponentId: ComponentId;
  /** The exact verified implementation pin the handle is paired with. */
  readonly implementation: ToolImplementationIdentity;
  /** Opaque runtime handle; undefined when the mint carried none. */
  readonly handle: unknown;
}

/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedCapabilityDependencyClosure`.
 */
const SEALED_CAPABILITY_CLOSURE_BRAND: unique symbol = Symbol(
  'kaicreator.capability-dependency-closure.sealed',
);

/**
 * The sealed capability dependency closure: the serializable evidence and
 * the runtime implementation handles paired with their exact verified pins
 * outside digest material. Minted only by `closeCapabilityDependencies`.
 * There is deliberately NO Assembly output: the input final Assembly remains
 * the one unchanged authority.
 */
export interface SealedCapabilityDependencyClosure {
  /** Serializable content-addressed closure evidence. */
  readonly evidence: CapabilityDependencyClosureEvidence;
  /** Opaque runtime handles paired with the exact verified pins (never digest material). */
  readonly implementationHandles: readonly CapabilityClosureHandlePair[];
  readonly [SEALED_CAPABILITY_CLOSURE_BRAND]: true;
}

// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------

function fail(code: CapabilityDependencyClosureErrorCode, message: string): never {
  throw new CapabilityDependencyClosureError(code, message);
}

/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value: unknown, description: string): Record<string, unknown> {
  const result = safeRecordSnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_CLOSURE_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value: unknown, description: string): unknown[] {
  const result = safeArraySnapshot(value, description);
  if (!result.ok) {
    fail('INVALID_CLOSURE_INPUT', `${description} ${describeRecordSafetyIssue(result.issue)}`);
  }
  return result.snapshot;
}

/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('INVALID_CLOSURE_INPUT', `${path} must be a string`);
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_CLOSURE_INPUT', `${path} must be a non-empty exact identity`);
  }
  if (carriesEmbeddedSelector(value)) {
    fail('INVALID_CLOSURE_INPUT', `${path} must not embed a version selector (\`id@version\`); use the exact version field`);
  }
  return value;
}

/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`,
    );
  }
}

/** Copy one exact capability reference into immutable authority evidence. */
function freezeCapabilityRef(ref: CapabilityContractRef): CapabilityContractRef {
  return Object.freeze({
    capabilityId: ref.capabilityId,
    version: ref.version,
  });
}

/**
 * Read one own DATA property of an authority-bearing object without invoking
 * hidden getters (same discipline as T003C): accessor-backed or inherited
 * properties are rejected before any authority use, so no hidden getter ever
 * executes and no caller-owned re-read can occur after the snapshot.
 */
function readOwnDataProperty(value: object, key: string, path: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail('INVALID_CLOSURE_INPUT', `${path}.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail(
      'INVALID_CLOSURE_INPUT',
      `${path}.${key} must be a data property, not accessor-backed`,
    );
  }
  return descriptor.value;
}

function requireSha256Port(value: unknown, path: string): Sha256Port {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Sha256Port).digestUtf8 !== 'function'
  ) {
    fail('INVALID_CLOSURE_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
  }
  return value as Sha256Port;
}

const INPUT_FIELDS = new Set<string>([
  'assembly',
  'rootComponentId',
  'currentDefinitionGraph',
  'dependencyBindings',
  'exactPins',
  'sha256',
]);

const EXACT_PIN_FIELDS = new Set<string>(['toolComponentId', 'pin']);

const PIN_FIELDS = new Set<string>([
  'implementationId',
  'implementationVersion',
  'implementationDigest',
]);

/** Snapshot one exact expected implementation pin as fresh frozen identity material. */
function snapshotPin(value: unknown, path: string): ToolImplementationIdentity {
  const view = requireSafeRecord(value, path);
  const unexpectedField = Object.keys(view).find((key) => !PIN_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_CLOSURE_INPUT',
      `${path} must contain exactly { implementationId, implementationVersion, implementationDigest }; unexpected field "${unexpectedField}" (module paths, provider objects and function identity are never part of a Tool implementation pin)`,
    );
  }
  const implementationId = requireExactIdentityString(view.implementationId, `${path}.implementationId`);
  requireNonFloatingIdentity(implementationId, `${path}.implementationId`);
  const implementationVersion = requireExactIdentityString(
    view.implementationVersion,
    `${path}.implementationVersion`,
  );
  requireNonFloatingIdentity(implementationVersion, `${path}.implementationVersion`);
  if (!isContentDigest(view.implementationDigest)) {
    fail('INVALID_CLOSURE_INPUT', `${path}.implementationDigest must be a non-empty content digest string`);
  }
  return Object.freeze({
    implementationId,
    implementationVersion,
    implementationDigest: view.implementationDigest,
  });
}

/**
 * One claimed dependency binding: the ORIGINAL caller-supplied object (handed
 * to the T003C verifier, which re-snapshots it with its own discipline) plus
 * the synchronously captured claimed subject used for exact-identity routing.
 */
interface SnapshotDependencyBindingClaimant {
  readonly binding: SealedToolImplementationBinding;
  readonly subject: ComponentId;
}

/** A fully snapshotted closure request: module-owned material only. */
interface SnapshotClosureRequest {
  readonly assembly: SealedRuntimeAssembly;
  readonly rootComponentId: ComponentId;
  readonly rootComponent: ComponentEnvelope;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly claimantsBySubject: ReadonlyMap<ComponentId, SnapshotDependencyBindingClaimant>;
  readonly pinsBySubject: ReadonlyMap<ComponentId, ToolImplementationIdentity>;
  readonly sha256: Sha256Port;
}

/**
 * Synchronously validate and snapshot the whole closure request (descriptor
 * safe, fail-closed, no caller-owned re-read after return). The current
 * Definition graph envelope is validated through the existing contract and
 * deep-copied into module-owned snapshot state (the T003C discipline); the
 * root Tool is located on the module-owned snapshot and validated through the
 * T003A declaration validator (its errors propagate unchanged). The
 * dependency-binding claimed subjects are captured own-data-only BEFORE any
 * suspension: a genuine mint's evidence is fresh frozen module material; any
 * other object's CLAIMED subject is read without executing getters and is
 * routed to the T003C verifier, which fails it closed as unminted if it is
 * ever selected. Duplicate claimed subjects fail closed (never first-wins).
 */
function snapshotClosureRequest(input: unknown): SnapshotClosureRequest {
  const at = 'closure input';
  const inputView = requireSafeRecord(input, at);
  const unexpectedInputField = Object.keys(inputView).find((key) => !INPUT_FIELDS.has(key));
  if (unexpectedInputField !== undefined) {
    fail('INVALID_CLOSURE_INPUT', `${at} must not carry unknown field "${unexpectedInputField}"`);
  }
  if (!('assembly' in inputView)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.assembly is required`);
  }
  if (!('rootComponentId' in inputView)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.rootComponentId is required`);
  }
  if (!('currentDefinitionGraph' in inputView)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.currentDefinitionGraph is required`);
  }
  if (!('dependencyBindings' in inputView)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.dependencyBindings is required`);
  }

  // The sealed Assembly is immutable by construction (T002B mint); holding
  // the reference across suspensions is safe and the T002B/T003C seams own
  // its authenticity/currentness validation.
  const assemblyValue = inputView.assembly;
  if (typeof assemblyValue !== 'object' || assemblyValue === null || Array.isArray(assemblyValue)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.assembly must be a SealedRuntimeAssembly ({ record, assemblyDigest, ... })`);
  }

  const rootComponentId = requireExactIdentityString(inputView.rootComponentId, `${at}.rootComponentId`);
  requireNonFloatingIdentity(rootComponentId, `${at}.rootComponentId`);

  const currentDefinitionGraph = inputView.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope validation is synchronous; the original
  // DefinitionGraphContractError (and the ComponentContractError it
  // composes) propagate unchanged.
  validateDefinitionGraphEnvelope(currentDefinitionGraph);
  // Deep-copy the validated graph into module-owned snapshot state: the seed
  // admission digest recomputation, every selection and the traversal run
  // after async suspensions and must never re-read caller-owned material.
  const graphSnapshot = JSON.parse(
    JSON.stringify(currentDefinitionGraph),
  ) as DefinitionGraphEnvelope;

  // Root checks (synchronous, on the module-owned snapshot): the root must
  // be a bound Tool Component with a structurally valid declaration.
  const rootComponent = graphSnapshot.components.find(
    (component: ComponentEnvelope) => component.componentId === rootComponentId,
  );
  if (rootComponent === undefined) {
    fail(
      'ROOT_COMPONENT_NOT_FOUND',
      `closure root "${rootComponentId}" is not a component of graph "${graphSnapshot.graphId}" — the closure root must be an admitted Tool Component bound in this exact graph`,
    );
  }
  if (rootComponent.family !== 'tool') {
    fail(
      'ROOT_NOT_TOOL_COMPONENT',
      `closure root "${rootComponentId}" is family "${rootComponent.family}" — only Tool Components own requiredCapability dependency closures (semantic components never close Tool dependencies here)`,
    );
  }
  // Tool declaration validation propagates the unchanged T003A error.
  validateToolComponent(rootComponent);

  // Dependency bindings: capture the claimed subject of every supplied
  // binding synchronously (own-data reads only, zero getter executions) and
  // reject duplicate claimed subjects deterministically before any await.
  const claimantsBySubject = new Map<ComponentId, SnapshotDependencyBindingClaimant>();
  const bindingEntries = requireSafeArray(inputView.dependencyBindings, `${at}.dependencyBindings`);
  for (const [index, entry] of bindingEntries.entries()) {
    const bindingAt = `${at}.dependencyBindings[${index}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail('INVALID_CLOSURE_INPUT', `${bindingAt} must be a SealedToolImplementationBinding object`);
    }
    let subject: ComponentId;
    if (isSealedToolImplementationBinding(entry)) {
      // Genuine mint: the evidence field is fresh frozen module material.
      subject = entry.evidence.toolComponentId;
    } else {
      // Not (yet) proven a mint: read the CLAIMED subject own-data only.
      // The T003C verifier will fail this object closed as unminted if its
      // subject is ever selected; the claimed subject is routing material
      // only and never authority.
      const evidenceValue = readOwnDataProperty(entry, 'evidence', `${bindingAt}.evidence`);
      if (typeof evidenceValue !== 'object' || evidenceValue === null || Array.isArray(evidenceValue)) {
        fail('INVALID_CLOSURE_INPUT', `${bindingAt}.evidence must be a record`);
      }
      const subjectValue = readOwnDataProperty(
        evidenceValue,
        'toolComponentId',
        `${bindingAt}.evidence`,
      );
      subject = requireExactIdentityString(subjectValue, `${bindingAt}.evidence.toolComponentId`);
      requireNonFloatingIdentity(subject, `${bindingAt}.evidence.toolComponentId`);
    }
    if (claimantsBySubject.has(subject)) {
      fail(
        'INVALID_CLOSURE_INPUT',
        `${bindingAt} claims subject "${subject}", which is already claimed by an earlier dependency binding — exactly one binding per claimed subject, never first-wins`,
      );
    }
    claimantsBySubject.set(subject, {
      binding: entry as SealedToolImplementationBinding,
      subject,
    });
  }

  const pinsBySubject = new Map<ComponentId, ToolImplementationIdentity>();
  if (inputView.exactPins !== undefined) {
    const pins = requireSafeArray(inputView.exactPins, `${at}.exactPins`);
    for (const [index, entry] of pins.entries()) {
      const pinAt = `${at}.exactPins[${index}]`;
      const view = requireSafeRecord(entry, pinAt);
      const unexpectedPinField = Object.keys(view).find((key) => !EXACT_PIN_FIELDS.has(key));
      if (unexpectedPinField !== undefined) {
        fail('INVALID_CLOSURE_INPUT', `${pinAt} must contain exactly { toolComponentId, pin }; unexpected field "${unexpectedPinField}"`);
      }
      const subject = requireExactIdentityString(view.toolComponentId, `${pinAt}.toolComponentId`);
      requireNonFloatingIdentity(subject, `${pinAt}.toolComponentId`);
      const pin = snapshotPin(view.pin, `${pinAt}.pin`);
      if (pinsBySubject.has(subject)) {
        fail(
          'DUPLICATE_EXACT_PIN_SUBJECT',
          `${pinAt}.toolComponentId "${subject}" carries a second exact pin — each closure subject resolves its expected pin through at most one exact authoritative pin`,
        );
      }
      pinsBySubject.set(subject, pin);
    }
  }

  return {
    assembly: assemblyValue as SealedRuntimeAssembly,
    rootComponentId,
    rootComponent,
    currentDefinitionGraph: graphSnapshot,
    claimantsBySubject,
    pinsBySubject,
    sha256: requireSha256Port(inputView.sha256, `${at}.sha256`),
  };
}

/** Exact traversal order for one Tool's declared required refs: sorted by
 * exact identity, exact duplicates collapsed (identity-normalized, never
 * insertion-ordered). */
function sortedUniqueRequiredRefs(
  component: ComponentEnvelope,
): readonly CapabilityContractRef[] {
  const seen = new Set<string>();
  const refs: CapabilityContractRef[] = [];
  for (const ref of component.requiredCapabilities) {
    const key = `${ref.capabilityId}@${ref.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    refs.push(ref);
  }
  return Object.freeze(
    refs.sort(
      (a, b) =>
        lexicalCompare(a.capabilityId, b.capabilityId) || lexicalCompare(a.version, b.version),
    ),
  );
}

function compareEdges(a: CapabilityClosureEdge, b: CapabilityClosureEdge): number {
  return (
    lexicalCompare(a.consumerComponentId, b.consumerComponentId) ||
    lexicalCompare(a.requiredCapability.capabilityId, b.requiredCapability.capabilityId) ||
    lexicalCompare(a.requiredCapability.version, b.requiredCapability.version) ||
    lexicalCompare(a.providerComponentId, b.providerComponentId)
  );
}

// ---------------------------------------------------------------------------
// closeCapabilityDependencies — the authority boundary
// ---------------------------------------------------------------------------

/**
 * Compute the deterministic capability dependency closure of one admitted
 * root Tool as evidence/composition only, against ONE unchanged final
 * Assembly.
 *
 * Authority boundary: the input Assembly is NEVER mutated or resealed and no
 * successor Assembly exists — the sealed result carries the evidence and the
 * verified handle pairs only. The seed is admitted through the T002B
 * Assembly-bound admission seam (currentness T002B-owned:
 * ASSEMBLY_ADMISSION_*); each provider binding is CONSUMED through the
 * shared T003C consumer-verifier seam against the SAME final Assembly
 * (missing supply / unminted / missing or replaced slot / stale identity /
 * pin mismatch propagate the owning T003C taxonomy unwrapped).
 *
 * Fail-closed precedence: input shape + graph/root/pin/binding snapshot
 * (all synchronous, zero getter executions), then seed admission, then the
 * traversal: per-edge T003B provider selection (missing/ambiguous propagate
 * unwrapped), cycle rejection (CAPABILITY_DEPENDENCY_CYCLE), per-provider
 * T003C verification. Never downgrades a failure.
 *
 * Torn-snapshot discipline: everything authority-bearing is synchronously
 * snapshotted before the first `await`; after that only module-owned
 * snapshot material and frozen mint material are read.
 */
export async function closeCapabilityDependencies(
  input: CapabilityDependencyClosureInput,
): Promise<SealedCapabilityDependencyClosure> {
  const request = snapshotClosureRequest(input);

  // ---- Seed admission (T002B Assembly-bound, against the ONE unchanged
  // final Assembly). The current Definition digest is authoritatively
  // recomputed inside the seam and must equal the digest recorded in the
  // final Assembly; stale/foreign graphs or unbound Kinds fail with the
  // T002B-owned taxonomy before any traversal.
  const admission = await admitComponentWithAssembly(
    request.rootComponent,
    request.assembly,
    {
      currentDefinitionGraph: request.currentDefinitionGraph,
      sha256: request.sha256,
    },
  );
  const definitionGraphDigest = admission.definitionGraphDigest;

  // Seed admission identity bound into the evidence (fresh frozen,
  // non-aliasing, identity only).
  const seedAdmission = Object.freeze({
    componentId: admission.componentId,
    definitionGraphDigest: admission.definitionGraphDigest,
    assemblyDigest: admission.assemblyDigest,
    admittedKind: Object.freeze({
      kindId: admission.admittedKind.kindId,
      version: admission.admittedKind.version,
    }),
    admittedKindImplementation: Object.freeze({
      kind: Object.freeze({
        kindId: admission.admittedKindImplementation.kind.kindId,
        version: admission.admittedKindImplementation.kind.version,
      }),
      implementation: Object.freeze({
        implementationId: admission.admittedKindImplementation.implementation.implementationId,
        implementationVersion:
          admission.admittedKindImplementation.implementation.implementationVersion,
        implementationDigest: admission.admittedKindImplementation.implementation.implementationDigest,
      }),
    }),
  });

  // ---- Traversal (identity-normalized DFS over exact required refs).
  const visited = new Map<ComponentId, CapabilityClosureEntry>();
  const edges: CapabilityClosureEdge[] = [];
  const handles: CapabilityClosureHandlePair[] = [];
  const stack: ComponentId[] = [];

  const visit = async (toolComponentId: ComponentId): Promise<void> => {
    stack.push(toolComponentId);
    const component = request.currentDefinitionGraph.components.find(
      (candidate: ComponentEnvelope) => candidate.componentId === toolComponentId,
    ) as ComponentEnvelope;
    for (const ref of sortedUniqueRequiredRefs(component)) {
      // Corrected T003B currentness-bound selection; the consumer is
      // excluded from candidacy (no silent self-provision) and zero or
      // multiple providers propagate the original typed error unwrapped.
      const selection = await resolveCurrentCapabilityProvider(
        request.currentDefinitionGraph,
        ref,
        toolComponentId,
        definitionGraphDigest,
        request.sha256,
      );
      const providerComponentId = selection.provider.componentId;
      edges.push(
        Object.freeze({
          consumerComponentId: toolComponentId,
          requiredCapability: freezeCapabilityRef(ref),
          providerComponentId,
        }),
      );

      const cycleStart = stack.indexOf(providerComponentId);
      if (cycleStart !== -1) {
        const cyclePath = [...stack.slice(cycleStart), providerComponentId];
        throw new CapabilityDependencyClosureError(
          'CAPABILITY_DEPENDENCY_CYCLE',
          `capability dependency closure: cycle detected along ${cyclePath.join(' -> ')} — capability dependency cycles are rejected in v0.7; no lazy/runtime recursion semantics exist`,
          cyclePath,
        );
      }
      // Diamond sharing: an already-consumed provider is recorded as an edge
      // but consumed exactly once.
      if (visited.has(providerComponentId)) {
        continue;
      }

      // Exact dependency binding consumption: locate the caller-supplied
      // already-minted binding BY EXACT SUBJECT IDENTITY (no lookup by
      // latest/default/order/id alias, never first-wins) and verify it
      // through the shared T003C consumer-verifier seam against the SAME
      // unchanged final Assembly. T003E never mints a binding.
      const claimant = request.claimantsBySubject.get(providerComponentId);
      if (claimant === undefined) {
        throw new ToolImplementationBindingError(
          'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
          `capability dependency closure: no already-minted dependency binding was supplied for the selected provider "${providerComponentId}" — the caller supplies the exact verified authority inputs for every required dependency; the closure never mints a new binding and never looks one up by latest/default/order/id alias`,
        );
      }
      const exactPin = request.pinsBySubject.get(providerComponentId);
      const verified = await verifyToolImplementationBinding({
        binding: claimant.binding,
        finalAssembly: request.assembly,
        ...(exactPin !== undefined ? { expectedImplementationPin: exactPin } : {}),
        sha256: request.sha256,
      });

      visited.set(
        providerComponentId,
        Object.freeze({
          toolComponentId: providerComponentId,
          boundCapability: freezeCapabilityRef(ref),
          implementation: verified.evidence.implementation,
          bindingDigest: verified.evidence.bindingDigest,
        }),
      );
      handles.push(
        Object.freeze({
          toolComponentId: providerComponentId,
          implementation: verified.evidence.implementation,
          handle: verified.implementationHandle,
        }),
      );
      await visit(providerComponentId);
    }
    stack.pop();
  };

  await visit(request.rootComponentId);

  // ---- Evidence: identity-normalized, fresh frozen, non-aliasing. The
  // bound assemblyDigest is the UNCHANGED INPUT final Assembly identity —
  // never a T003E output.
  const entries = Object.freeze(
    [...visited.values()].sort((a, b) => lexicalCompare(a.toolComponentId, b.toolComponentId)),
  );
  const sortedEdges = Object.freeze([...edges].sort(compareEdges));
  const evidenceMaterial = Object.freeze({
    digestDomain: CAPABILITY_DEPENDENCY_CLOSURE_EVIDENCE_DOMAIN,
    definitionGraphDigest,
    assemblyDigest: admission.assemblyDigest,
    rootComponentId: request.rootComponentId,
    seedAdmission,
    entries,
    edges: sortedEdges,
  });
  const closureDigest = await computeCanonicalJsonDigest(evidenceMaterial, request.sha256);

  const evidence: CapabilityDependencyClosureEvidence = Object.freeze({
    status: 'CLOSED' as const,
    rootComponentId: request.rootComponentId,
    definitionGraphDigest,
    assemblyDigest: admission.assemblyDigest,
    seedAdmission,
    entries,
    edges: sortedEdges,
    closureDigest,
  });

  return Object.freeze({
    evidence,
    implementationHandles: Object.freeze(handles),
    [SEALED_CAPABILITY_CLOSURE_BRAND]: true as const,
  });
}
