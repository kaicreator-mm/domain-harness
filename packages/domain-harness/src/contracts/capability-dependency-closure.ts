/**
 * v0.7 Tool-to-Tool required Capability closure (issue #630, fine-grained DAG
 * T003E; authority #589 PACK-B).
 *
 * The Microkernel seam that computes the deterministic dependency closure of
 * one admitted root Tool's `requiresCapabilities`: every Tool the root
 * transitively requires is selected through the T003B Definition-plane
 * provider selection (consumed, never re-implemented) and bound to exactly
 * one compatible exact Tool implementation through the T003C Assembly-plane
 * binding (consumed, never re-implemented), threading the sealed Runtime
 * Assembly through each T003C successor reseal. The Microkernel owns exact
 * closure evidence/currentness here — never concrete Tool semantics: no
 * provider selection logic, no binding decision logic, no invocation, no
 * resource resolution and no ToolRegistry authority exists in this file.
 *
 * Normative rules owned here, without exception (#589 PACK-B T003E):
 * - the closure is derived ONLY from the root Tool's declared
 *   `requiredCapabilities` (exact {capabilityId, version} refs, already
 *   exactness-validated by the graph envelope contract at entry); traversal
 *   is normalized by exact identity — required refs are visited in sorted
 *   exact order and every emitted list (entries, edges) is sorted by exact
 *   identity, never by source/registry insertion order;
 * - each required ref is resolved by the corrected T003B currentness-bound
 *   selection (`resolveCurrentCapabilityProvider`, consumer excluded from
 *   candidacy — no silent self-provision); zero or multiple providers
 *   propagates the original typed `CapabilityProvisionContractError`
 *   unwrapped;
 * - each newly visited provider Tool is bound by T003C to exactly one
 *   compatible exact implementation; missing/ambiguous/incompatible
 *   propagates the original typed `ToolImplementationBindingError`
 *   unwrapped. An optional per-subject exact pin resolves ambiguity the same
 *   way T003C resolves it — never first/latest/default/ordering;
 * - a provider reached again through another edge is recorded as an edge but
 *   bound exactly once (diamond sharing);
 * - capability dependency cycles are rejected as `CAPABILITY_DEPENDENCY_CYCLE`
 *   in v0.7: any selected provider already on the current traversal stack
 *   fails closed with the exact cycle path. No lazy/runtime recursion
 *   semantics are invented;
 * - closure evidence binds the exact DefinitionGraphDigest (authoritatively
 *   recomputed before any traversal) AND the exact final successor
 *   assemblyDigest (the T002B sealed Assembly carrying every closure §G
 *   binding slot). It is fresh/frozen/non-aliasing and contains the exact
 *   selected dependency graph needed by the runtime — but NO live
 *   implementation handles or functions in identity: handles are paired with
 *   their exact pins OUTSIDE the evidence, on the sealed result;
 * - the root Tool's OWN implementation binding is intentionally NOT part of
 *   the closure: the closure covers exactly the tools the root requires.
 *   Binding the root itself is the caller's T003C concern;
 * - NO invocation occurs in T003E. Closure evidence grants no invocation,
 *   occurrence or effect authority.
 *
 * Authority closure: the sealed base Assembly (T002B) is caller-supplied
 * assembly-plane material; currentness is proven by authoritatively
 * recomputing the Definition graph digest through the #555 seam before any
 * traversal and requiring it to equal the digest recorded in the sealed
 * Assembly — a stale or foreign graph or assembly fails closed with
 * `DEFINITION_GRAPH_DIGEST_MISMATCH` before any closure evidence is minted.
 * Per-edge currentness (T003B selection digest + T003C assembly/selection
 * digest conjunction) re-verifies the same digest through the consumed
 * authority paths.
 *
 * Torn-snapshot discipline (#587 §E, same as #555/T003C): every
 * authority-bearing caller input is descriptor-safe validated and
 * synchronously snapshotted before the first `await`; the Definition graph is
 * deep-copied into module-owned state and the candidate/pin collections are
 * copied into module-owned arrays before any suspension, so a caller mutating
 * its own graph, candidates or pins while a digest promise is pending can
 * never mint torn or hybrid closure evidence.
 *
 * Boundary: validation consumes the shared descriptor-safe record primitive
 * and unified exact-reference authority of `record-safety.ts` (#557 + #578),
 * the #555 graph contract and digest seam, the T003A Tool declaration
 * validator, the T003B currentness-bound provider selection and the T003C
 * exact implementation binding — all imported, never reimplemented. No
 * Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage import
 * is permitted in this file.
 */
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentId,
} from './component.js';
import {
  computeDefinitionGraphDigest,
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
import type { SealedRuntimeAssembly } from './runtime-assembly.js';
import { validateToolComponent } from './tool-component.js';
import {
  bindToolImplementation,
  type ToolImplementationCandidate,
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
 * digest domains: any future change to the evidence material shape is a NEW
 * domain tag; historical closure identities never change retroactively.
 */
const CAPABILITY_DEPENDENCY_CLOSURE_EVIDENCE_DOMAIN =
  'kaicreator.capability-dependency-closure.evidence.v1';

/**
 * Fail-closed closure failure taxonomy (#589 PACK-B T003E). Every failure is
 * typed and terminal — none carries or suggests a substitute/default/latest
 * resolution, and no diagnostic ever serializes implementation handles,
 * secret values or live objects (only exact identity strings participate).
 * T003B/T003C failures propagate under their own typed error classes
 * unwrapped, exactly as those modules define them.
 */
export type CapabilityDependencyClosureErrorCode =
  | 'INVALID_CLOSURE_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'ROOT_COMPONENT_NOT_FOUND'
  | 'ROOT_NOT_TOOL_COMPONENT'
  | 'DUPLICATE_EXACT_PIN_SUBJECT'
  | 'CAPABILITY_DEPENDENCY_CYCLE'
  | 'DEFINITION_GRAPH_DIGEST_MISMATCH';

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

/** One exact per-subject authoritative pin resolving implementation
 * ambiguity for exactly one closure provider Tool. */
export interface CapabilityClosureExactPin {
  /** The exact closure provider Tool Component the pin authorizes. */
  readonly toolComponentId: ComponentId;
  /** The exact authoritative implementation pin (id/version/content digest). */
  readonly pin: ToolImplementationIdentity;
}

/** Complete closure input. All authority-bearing material is synchronously
 * snapshotted at call time; the caller's objects are never frozen or
 * mutated. */
export interface CapabilityDependencyClosureInput {
  /** The sealed base Runtime Assembly (never mutated; T002B seal). */
  readonly assembly: SealedRuntimeAssembly;
  /** The exact admitted root Tool Component whose closure is computed. */
  readonly rootComponentId: ComponentId;
  /** The live Definition graph; its digest is authoritatively recomputed. */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** The offered Tool implementation candidates for the closure providers. */
  readonly implementations: readonly ToolImplementationCandidate[];
  /**
   * Optional exact per-subject pins resolving ambiguity. Each subject may
   * carry at most one pin; duplicates fail closed typed.
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

/** One bound closure provider Tool: exact identity + exact implementation. */
export interface CapabilityClosureEntry {
  /** Exact ComponentId of the bound provider Tool. */
  readonly toolComponentId: ComponentId;
  /** The exact ref through which the provider was first bound (sorted-traversal deterministic). */
  readonly boundCapability: CapabilityContractRef;
  /** The exact implementation pin (id/version/content digest). */
  readonly implementation: ToolImplementationIdentity;
  /** The T003C binding evidence digest for this provider. */
  readonly bindingDigest: ContentDigest;
}

/**
 * Serializable, content-addressed closure evidence. Fresh, frozen,
 * non-aliasing; binds the exact DefinitionGraphDigest + the exact final
 * successor assemblyDigest + the exact selected dependency graph (entries +
 * edges, identity-normalized). No handle, secret, endpoint, provider object
 * or invocation field is representable.
 */
export interface CapabilityDependencyClosureEvidence {
  readonly status: 'CLOSED';
  /** Exact ComponentId of the admitted root Tool. */
  readonly rootComponentId: ComponentId;
  /** Exact Definition graph content digest, authoritatively recomputed. */
  readonly definitionGraphDigest: ContentDigest;
  /** Digest of the final successor Assembly carrying every closure slot. */
  readonly assemblyDigest: ContentDigest;
  /** Bound provider Tools, sorted by exact ComponentId. */
  readonly entries: readonly CapabilityClosureEntry[];
  /** Selected dependency edges, sorted by exact identity. */
  readonly edges: readonly CapabilityClosureEdge[];
  /** Content digest of the exact closure evidence material. */
  readonly closureDigest: ContentDigest;
}

/**
 * Opaque runtime handle paired with one exact closure provider pin, OUTSIDE
 * every digest material — the runtime pairing the evidence deliberately
 * excludes from identity.
 */
export interface CapabilityClosureHandlePair {
  /** Exact ComponentId of the bound provider Tool. */
  readonly toolComponentId: ComponentId;
  /** The exact implementation pin the handle is paired with. */
  readonly implementation: ToolImplementationIdentity;
  /** Opaque runtime handle; undefined when the candidate carried none. */
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
 * The sealed capability dependency closure: the serializable evidence, the
 * final successor sealed Assembly (carrying every §G closure slot) and the
 * runtime implementation handles paired with their exact pins outside digest
 * material. Minted only by `closeCapabilityDependencies`.
 */
export interface SealedCapabilityDependencyClosure {
  /** Serializable content-addressed closure evidence. */
  readonly evidence: CapabilityDependencyClosureEvidence;
  /** The final successor sealed Assembly (or the base Assembly when the closure is empty). */
  readonly successorAssembly: SealedRuntimeAssembly;
  /** Opaque runtime handles paired with the exact pins (never digest material). */
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
 * Read one own DATA property of the sealed Assembly without invoking hidden
 * getters (same discipline as T003C): a genuine sealed Assembly carries the
 * module-private brand symbol, which the descriptor-safe record primitive
 * rejects for contract input records, so own data-descriptor reads are used.
 */
function readAssemblyOwnDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    fail('INVALID_CLOSURE_INPUT', `closure input.assembly.${key} is required`);
  }
  if (descriptor.get !== undefined || descriptor.set !== undefined) {
    fail(
      'INVALID_CLOSURE_INPUT',
      `closure input.assembly.${key} must be a data property, not accessor-backed`,
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
  'implementations',
  'exactPins',
  'sha256',
]);

const EXACT_PIN_FIELDS = new Set<string>(['toolComponentId', 'pin']);

const PIN_FIELDS = new Set<string>([
  'implementationId',
  'implementationVersion',
  'implementationDigest',
]);

/** Snapshot one exact implementation pin as fresh frozen identity material. */
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

/** A fully snapshotted closure request: module-owned material only. */
interface SnapshotClosureRequest {
  readonly assembly: SealedRuntimeAssembly;
  readonly assemblyDigest: ContentDigest;
  readonly assemblyDefinitionDigest: ContentDigest;
  readonly rootComponentId: ComponentId;
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  readonly implementations: readonly ToolImplementationCandidate[];
  readonly pinsBySubject: ReadonlyMap<ComponentId, ToolImplementationIdentity>;
  readonly sha256: Sha256Port;
}

/**
 * Synchronously validate and snapshot the whole closure request (descriptor
 * safe, fail-closed, no caller-owned re-read after return). The current
 * Definition graph envelope is validated through the existing contract and
 * deep-copied into module-owned snapshot state (the T003C discipline); the
 * root Tool is validated through the T003A declaration validator (its errors
 * propagate unchanged). The candidate array is shallow-copied so its
 * membership is fixed at call time — every downstream bind re-snapshots the
 * candidates through T003C's own descriptor-safe path.
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
  if (!('implementations' in inputView)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.implementations is required`);
  }

  // Sealed Assembly: own-data reads only; the T002B seal is immutable by
  // construction, so holding the reference across suspensions is safe.
  const assemblyValue = inputView.assembly;
  if (typeof assemblyValue !== 'object' || assemblyValue === null) {
    fail('INVALID_CLOSURE_INPUT', `${at}.assembly must be a SealedRuntimeAssembly ({ record, bindings, ... })`);
  }
  const assemblyObject = assemblyValue;
  const recordValue = readAssemblyOwnDataProperty(assemblyObject, 'record');
  const assemblyDigest = readAssemblyOwnDataProperty(assemblyObject, 'assemblyDigest');
  if (typeof assemblyDigest !== 'string' || !isContentDigest(assemblyDigest)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.assemblyDigest must be a non-empty content digest string`);
  }
  const recordView = requireSafeRecord(recordValue, `${at}.assembly.record`);
  const assemblyDefinitionDigest = recordView.definitionGraphDigest;
  if (typeof assemblyDefinitionDigest !== 'string' || !isContentDigest(assemblyDefinitionDigest)) {
    fail('INVALID_CLOSURE_INPUT', `${at}.assembly.record.definitionGraphDigest must be a non-empty content digest string`);
  }

  const rootComponentId = requireExactIdentityString(inputView.rootComponentId, `${at}.rootComponentId`);
  requireNonFloatingIdentity(rootComponentId, `${at}.rootComponentId`);

  const currentDefinitionGraph = inputView.currentDefinitionGraph as DefinitionGraphEnvelope;
  // Graph envelope validation is synchronous; the original
  // DefinitionGraphContractError (and the ComponentContractError it
  // composes) propagate unchanged.
  validateDefinitionGraphEnvelope(currentDefinitionGraph);
  // Deep-copy the validated graph into module-owned snapshot state: the
  // digest recomputation and every consumed authority path run after async
  // suspensions and must never re-read caller-owned graph material.
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

  const implementations = Object.freeze(
    requireSafeArray(inputView.implementations, `${at}.implementations`).slice(),
  ) as readonly ToolImplementationCandidate[];

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
          `${pinAt}.toolComponentId "${subject}" carries a second exact pin — each closure subject resolves ambiguity through at most one exact authoritative pin`,
        );
      }
      pinsBySubject.set(subject, pin);
    }
  }

  return {
    assembly: assemblyObject as SealedRuntimeAssembly,
    assemblyDigest: assemblyDigest,
    assemblyDefinitionDigest: assemblyDefinitionDigest,
    rootComponentId,
    currentDefinitionGraph: graphSnapshot,
    implementations,
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
 * root Tool and bind every transitively required provider Tool to exactly
 * one compatible exact implementation.
 *
 * Authority boundary: the sealed input Assembly is never mutated. Each
 * provider binding is minted by T003C as fresh/frozen evidence, threading
 * the successor Assembly through the traversal; the final successor carries
 * one §G slot per closure provider. When the closure is empty (the root
 * declares no required capabilities) the base Assembly is returned
 * unchanged.
 *
 * Fail-closed precedence: input shape + assembly/root/graph/pin snapshot,
 * graph + root Tool declaration validation (propagated unchanged), the
 * authoritative currentness recomputation (DEFINITION_GRAPH_DIGEST_MISMATCH),
 * then the traversal: per-edge T003B provider selection (missing/ambiguous
 * propagate unwrapped), cycle rejection (CAPABILITY_DEPENDENCY_CYCLE),
 * per-provider T003C binding (missing/ambiguous/incompatible propagate
 * unwrapped). Never downgrades a failure.
 *
 * Torn-snapshot discipline: everything authority-bearing is synchronously
 * snapshotted before the first `await`; after the currentness suspension
 * only module-owned snapshot material is read.
 */
export async function closeCapabilityDependencies(
  input: CapabilityDependencyClosureInput,
): Promise<SealedCapabilityDependencyClosure> {
  const request = snapshotClosureRequest(input);

  // ---- Async phase: authoritative currentness first.
  const definitionGraphDigest = await computeDefinitionGraphDigest(
    request.currentDefinitionGraph,
    request.sha256,
  );
  if (definitionGraphDigest !== request.assemblyDefinitionDigest) {
    fail(
      'DEFINITION_GRAPH_DIGEST_MISMATCH',
      'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale or foreign graphs fail closed before any closure evidence is minted',
    );
  }

  // ---- Traversal (identity-normalized DFS over exact required refs).
  const visited = new Map<ComponentId, CapabilityClosureEntry>();
  const edges: CapabilityClosureEdge[] = [];
  const handles: CapabilityClosureHandlePair[] = [];
  const stack: ComponentId[] = [];
  let cursor: SealedRuntimeAssembly = request.assembly;

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
      // Diamond sharing: an already-bound provider is recorded as an edge
      // but bound exactly once.
      if (visited.has(providerComponentId)) {
        continue;
      }

      // T003C exact implementation binding on the threaded successor
      // Assembly; missing/ambiguous/incompatible propagate unwrapped. The
      // optional pin is attached only when present (`exactOptionalPropertyTypes`
      // discipline — an explicit undefined optional is not assignable).
      const exactPin = request.pinsBySubject.get(providerComponentId);
      const binding = await bindToolImplementation({
        assembly: cursor,
        selection,
        currentDefinitionGraph: request.currentDefinitionGraph,
        implementations: request.implementations,
        ...(exactPin !== undefined ? { exactPin } : {}),
        sha256: request.sha256,
      });
      cursor = binding.successorAssembly;
      visited.set(
        providerComponentId,
        Object.freeze({
          toolComponentId: providerComponentId,
          boundCapability: freezeCapabilityRef(ref),
          implementation: binding.evidence.implementation,
          bindingDigest: binding.evidence.bindingDigest,
        }),
      );
      handles.push(
        Object.freeze({
          toolComponentId: providerComponentId,
          implementation: binding.evidence.implementation,
          handle: binding.implementationHandle,
        }),
      );
      await visit(providerComponentId);
    }
    stack.pop();
  };

  await visit(request.rootComponentId);

  // ---- Evidence: identity-normalized, fresh frozen, non-aliasing.
  const entries = Object.freeze(
    [...visited.values()].sort((a, b) => lexicalCompare(a.toolComponentId, b.toolComponentId)),
  );
  const sortedEdges = Object.freeze([...edges].sort(compareEdges));
  const evidenceMaterial = Object.freeze({
    digestDomain: CAPABILITY_DEPENDENCY_CLOSURE_EVIDENCE_DOMAIN,
    definitionGraphDigest,
    assemblyDigest: cursor.assemblyDigest,
    rootComponentId: request.rootComponentId,
    entries,
    edges: sortedEdges,
  });
  const closureDigest = await computeCanonicalJsonDigest(evidenceMaterial, request.sha256);

  const evidence: CapabilityDependencyClosureEvidence = Object.freeze({
    status: 'CLOSED' as const,
    rootComponentId: request.rootComponentId,
    definitionGraphDigest,
    assemblyDigest: cursor.assemblyDigest,
    entries,
    edges: sortedEdges,
    closureDigest,
  });

  return Object.freeze({
    evidence,
    successorAssembly: cursor,
    implementationHandles: Object.freeze(handles),
    [SEALED_CAPABILITY_CLOSURE_BRAND]: true as const,
  });
}
