/**
 * v0.7 Definition-plane Capability provider selection (issue #553, fine-grained
 * DAG T003B).
 *
 * The frozen L2 fixes the normative posture this module implements: Capability
 * remains a stable `requires/provides` contract identity, and **selection among
 * multiple Domain Tool providers is Definition authority** — Assembly may only
 * bind the already-selected provider to exactly one compatible implementation.
 * This file IS that Definition authority for the single-ref case: given a
 * validated `DefinitionGraphEnvelope` and one exact required
 * `CapabilityContractRef`, it deterministically names the one Domain Tool
 * Component whose `providesCapabilities` declares that exact ref — or fails
 * closed with a typed error when zero or multiple eligible providers exist.
 *
 * Boundary rules owned here, without exception:
 * - provider candidacy is Tool-family only; semantic-family components are
 *   never providers, and a component's own `requiredCapabilities` is never
 *   provider evidence (no silent self-provision);
 * - matching is exact ref equality on BOTH fields — no normalization, no
 *   ranges, no compat suffixes, no nearest-version, no ordering/priority;
 * - graph envelope failures propagate the original
 *   `DefinitionGraphContractError` unwrapped; tool declaration failures
 *   propagate the original `ToolComponentContractError` unwrapped (a broken
 *   tool body must never silently "provide nothing");
 * - the selection is a pure function: no input mutation, no ambient state, no
 *   I/O; invariant under every ordering of bound components and declared refs;
 * - the result evidence carries Component identity + capability ref only — no
 *   implementation, module, binding, pin, digest, endpoint or routing
 *   identity is representable.
 *
 * Definition-currentness-bound selection (issue #572, R2 delta): the additive
 * seam `resolveCurrentCapabilityProvider` reuses the same candidacy core but
 * additionally binds the decision to the exact current Definition graph
 * digest (recomputed through the #555 seam and compared against a supplied
 * claimed digest) and to the exact consumer Component that actually declares
 * the required capability in its `requiredCapabilities`. Its result proves,
 * and proves only:
 *
 *   PROVEN:     DEFINITION_SELECTION_CURRENTNESS_BOUND (exact graph content
 *               digest, recomputed and matched before any evidence is minted)
 *               + CONSUMER_REQUIREMENT_PROVEN (the exact ref occurs in the
 *               bound consumer's requiredCapabilities)
 *               + PROVIDER_CHOICE_PROVEN (deterministic exact-ref selection).
 *   NOT PROVEN: MUST_UNDERSTAND_ADMISSION (no trusted admission evidence is
 *               consumed), ASSEMBLY_KIND_PROVENANCE (no sealed Runtime
 *               Assembly / KindImplementation provenance), and
 *               RUNTIME_AUTHORITY_GRADE. A structurally valid, current graph
 *               without trusted admission provenance may therefore obtain a
 *               `CurrentCapabilityProviderSelection`, but that evidence is
 *               Definition-currentness-bound Definition selection — never
 *               admitted or runtime-authoritative evidence.
 *
 * T003C/#575 consumption guard: a `CurrentCapabilityProviderSelection`
 * without trusted must-understand admission evidence and exact sealed Runtime
 * Assembly / KindImplementation provenance MUST NOT be used to mint an
 * authoritative implementation binding. Authority closure is owned by
 * T003C/T003E with the #575/T002B conjunction:
 *
 *   currentness-bound Definition provider selection
 *   + trusted must-understand admission evidence
 *   + exact sealed Runtime Assembly / KindImplementation provenance
 *
 * Runtime enforcement of that conjunction lands with T003C/#575 and is
 * intentionally out of scope here.
 *
 * Input validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578, the
 * PR-2 retrofit): the required capability ref and the optional consumer id
 * are validated on descriptor-safe snapshots, so accessor-backed,
 * symbol-keyed, non-enumerable or exotic-prototype input is rejected before
 * any authority use, and downstream authority reads consume the validated
 * snapshot — never the caller-owned object. The exported runtime surface is
 * unchanged; no new public name is added.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - assembly-plane implementation binding/registries/pins (T003C): assembly
 *   may never choose a different provider than this selection returns;
 * - host/domain capability-plane collision semantics (T003D);
 * - capability closure, recursion or batch resolution over required
 *   capabilities (T003E — exactly one required ref per call);
 * - Tool invocation runtime, occurrence anchoring, exposure authority (T004);
 * - runtime resource resolution (T005).
 */
import type { CapabilityContractRef, ComponentEnvelope, ComponentId } from './component.js';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
} from './definition-graph.js';
import { isContentDigest, type ContentDigest, type Sha256Port } from './identity.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeRecordSnapshot,
} from './record-safety.js';
import { validateToolComponent, type ToolOperationsDeclaration } from './tool-component.js';

export type CapabilityProvisionErrorCode =
  | 'CAPABILITY_PROVIDER_NOT_FOUND'
  | 'CAPABILITY_PROVIDER_AMBIGUOUS'
  | 'INVALID_SELECTION_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'CONSUMER_CAPABILITY_NOT_REQUIRED'
  | 'DEFINITION_GRAPH_DIGEST_MISMATCH';

/**
 * Typed, fail-closed selection failure. Never recovered from, never wrapped:
 * graph/tool contract errors from the imported validators surface unchanged
 * (they are distinct error classes, not this one).
 */
export class CapabilityProvisionContractError extends Error {
  readonly code: CapabilityProvisionErrorCode;
  /**
   * AMBIGUOUS only: the conflicting provider ComponentIds, sorted
   * lexicographically, so the failure diagnostics are deterministic under
   * every component ordering. Empty for every other code.
   */
  readonly conflictingProviderComponentIds: readonly ComponentId[];

  constructor(
    code: CapabilityProvisionErrorCode,
    message: string,
    conflictingProviderComponentIds: readonly ComponentId[] = [],
  ) {
    super(message);
    this.name = 'CapabilityProvisionContractError';
    this.code = code;
    this.conflictingProviderComponentIds = Object.freeze([...conflictingProviderComponentIds]);
  }
}

/** Provider evidence: exact Component identity plus the exact declared ref. */
export interface CapabilityProviderEvidence {
  /** Exact ComponentId of the single selected Domain Tool Component. */
  readonly componentId: ComponentId;
  /** Always the `tool` family — semantic components are never providers. */
  readonly family: 'tool';
  /** The exact capability ref as declared by the provider. */
  readonly providesCapability: CapabilityContractRef;
}

/**
 * Deterministic selection evidence. Component identity + capability ref only:
 * no Tool Implementation id, module/package path, assembly digest, pin, runtime
 * endpoint, or provider-routing identity is representable. Capability refs in
 * successful evidence are fresh frozen values, never aliases of caller-owned
 * request/graph objects.
 *
 * This is candidate-discovery evidence: it is not bound to a graph
 * currentness digest and it carries no consumer-requirement proof, so it is
 * not admitted or runtime-authoritative evidence (see
 * `CurrentCapabilityProviderSelection` and the module docstring).
 */
export interface CapabilityProviderSelection {
  /** Graph identity the selection was derived from. */
  readonly graphId: string;
  /** The exact required ref as immutable value evidence (never normalized). */
  readonly requiredCapability: CapabilityContractRef;
  /** The one Definition-selected Domain Tool provider. */
  readonly provider: CapabilityProviderEvidence;
}

/**
 * Consumer-requirement evidence inside a currentness-bound selection: the
 * exact ComponentId plus the exact capability ref as copied (and frozen) from
 * that Component's `requiredCapabilities` in the validated graph — proof that
 * this consumer actually declares this exact requirement in this exact graph
 * content. Never an alias of caller-owned graph/envelope objects.
 */
export interface CurrentCapabilityConsumerEvidence {
  /** Exact ComponentId of the bound consumer Component. */
  readonly componentId: ComponentId;
  /** The exact required ref as declared by the consumer, fresh frozen. */
  readonly requiredCapability: CapabilityContractRef;
}

/**
 * Definition-currentness-bound provider selection evidence (issue #572).
 *
 * PROVEN by this evidence: the exact Definition graph content currentness
 * (`definitionGraphDigest`, recomputed through the #555 seam and matched
 * before minting), the consumer requirement (the exact ref occurs in the
 * bound consumer's `requiredCapabilities`), and the deterministic exact-ref
 * provider choice. NOT PROVEN: must-understand admission, sealed Runtime
 * Assembly / KindImplementation provenance, runtime authority. This type is
 * deliberately named and shaped so it cannot be mistaken for admitted or
 * runtime-authoritative evidence; authority closure is the T003C/T003E +
 * #575/T002B conjunction documented in the module docstring.
 */
export interface CurrentCapabilityProviderSelection {
  /** Graph identity the selection was derived from. */
  readonly graphId: string;
  /**
   * The exact Definition graph content digest, verified by recomputation
   * against the supplied graph before this evidence was minted — the
   * currentness anchor. Never the unverified supplied value alone.
   */
  readonly definitionGraphDigest: ContentDigest;
  /** The exact required ref as declared by the consumer, fresh frozen. */
  readonly requiredCapability: CapabilityContractRef;
  /** The bound consumer plus its declared requirement, fresh frozen. */
  readonly consumer: CurrentCapabilityConsumerEvidence;
  /** The one Definition-selected Domain Tool provider (existing shape). */
  readonly provider: CapabilityProviderEvidence;
}

function fail(code: CapabilityProvisionErrorCode, path: string, reason: string): never {
  throw new CapabilityProvisionContractError(code, `${path} ${reason}`);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Copy one exact capability reference into immutable authority evidence. */
function freezeCapabilityRef(ref: CapabilityContractRef): CapabilityContractRef {
  return Object.freeze({
    capabilityId: ref.capabilityId,
    version: ref.version,
  });
}

/**
 * Structural stage of exact selection-input identity validation: the value
 * must be a non-empty string without an embedded `id@version` selector form
 * (the component contract convention, unchanged). Structurally unusable
 * input is a typed `INVALID_SELECTION_INPUT`, never a TypeError, and no
 * hidden getter executes during validation or diagnostics.
 */
function requireExactSelectionIdentityString(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    fail('INVALID_SELECTION_INPUT', path, 'must be a string');
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_SELECTION_INPUT', path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      'INVALID_SELECTION_INPUT',
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
}

/**
 * Exactness stage for identity strings: mutable selection tokens and
 * range/wildcard operators are forbidden, never normalized — the shared
 * unified matrix of `record-safety.ts` (#557), the same matrix the Tool
 * declaration and graph seams consume.
 */
function requireNonFloatingSelectionIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)',
    );
  }
}

/**
 * Exactness stage for version strings: the identity matrix PLUS semver
 * x-range/partial forms (`1.x`, `x`, `1.`), which are never exact.
 * Validation only — never resolved against anything.
 */
function requireExactSelectionVersion(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)',
    );
  }
}

/**
 * Structural validation of the required ref on a descriptor-safe snapshot
 * (#578): an ordinary or null-prototype record carrying exactly the own
 * enumerable data keys `{capabilityId, version}` (no accessor, no hidden
 * symbol/non-enumerable material, no exotic prototype), both fields exact
 * identity strings. Returns the validated snapshot: every downstream
 * authority read (matching, evidence minting, diagnostics) consumes the
 * snapshot, never the caller-owned object, so validation-to-use TOCTOU
 * drift is impossible by construction.
 */
function requireExactSelectionRef(ref: CapabilityContractRef): Record<string, unknown> {
  const result = safeRecordSnapshot(ref, 'requiredCapability');
  if (!result.ok) {
    fail('INVALID_SELECTION_INPUT', 'requiredCapability', describeRecordSafetyIssue(result.issue));
  }
  const candidate = result.snapshot;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail(
      'INVALID_SELECTION_INPUT',
      'requiredCapability',
      'must contain exactly {capabilityId, version} (no extra identity, no embedded selector)',
    );
  }
  requireExactSelectionIdentityString(candidate.capabilityId, 'requiredCapability.capabilityId');
  requireNonFloatingSelectionIdentity(
    candidate.capabilityId as string,
    'requiredCapability.capabilityId',
  );
  requireExactSelectionIdentityString(candidate.version, 'requiredCapability.version');
  requireExactSelectionVersion(candidate.version as string, 'requiredCapability.version');
  return candidate;
}

/**
 * The optional consumer seam: when supplied it must be an exact identity bound
 * in the same graph; that component is then excluded from provider candidacy
 * (required practice for the T003E closure plane; here it makes
 * not-satisfied-by-self expressible at the Definition plane).
 */
function requireBoundConsumerId(
  graph: DefinitionGraphEnvelope,
  consumerComponentId: ComponentId,
): ComponentId {
  if (typeof consumerComponentId !== 'string') {
    fail('INVALID_SELECTION_INPUT', 'consumerComponentId', 'must be a string');
  }
  if (!isNonEmptyIdentityString(consumerComponentId)) {
    fail('INVALID_SELECTION_INPUT', 'consumerComponentId', 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(consumerComponentId)) {
    fail(
      'INVALID_SELECTION_INPUT',
      'consumerComponentId',
      'must not embed a version selector (`id@version`)',
    );
  }
  if (carriesFloatingOrRangeSemantics(consumerComponentId)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      'consumerComponentId',
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)',
    );
  }
  if (!graph.components.some((component) => component.componentId === consumerComponentId)) {
    fail(
      'INVALID_SELECTION_INPUT',
      'consumerComponentId',
      `must reference a bound component of graph "${graph.graphId}", not "${consumerComponentId}"`,
    );
  }
  return consumerComponentId;
}

/**
 * Definition-plane Capability provider selection: deterministically names the
 * one Domain Tool Component whose `providesCapabilities` declares the exact
 * required ref, or fails closed.
 *
 * Purity: the graph is validated (never mutated), candidacy is derived only
 * from the graph and the selection inputs, no ambient state is read and no
 * I/O is performed. The result is invariant under every ordering of bound
 * components, declared refs, and graph relations (relations are never
 * consulted). Failures are deterministic: ambiguity diagnostics are sorted by
 * componentId, and tool declaration validation runs in componentId order so
 * the surfaced `ToolComponentContractError` is permutation-invariant too.
 * Successful evidence owns fresh frozen capability-ref values so later caller
 * mutation cannot alter an already-completed provider-selection decision.
 */
export function selectCapabilityProvider(
  graph: DefinitionGraphEnvelope,
  requiredCapability: CapabilityContractRef,
  consumerComponentId?: ComponentId,
): CapabilityProviderSelection {
  // Entry validation is delegated unchanged to the existing graph contract;
  // its DefinitionGraphContractError (or the ComponentContractError of a bound
  // component envelope) propagates unwrapped.
  validateDefinitionGraphEnvelope(graph);

  const required = requireExactSelectionRef(requiredCapability);
  const requiredCapabilityId = required.capabilityId as string;
  const requiredCapabilityVersion = required.version as string;
  const excludedId =
    consumerComponentId === undefined
      ? undefined
      : requireBoundConsumerId(graph, consumerComponentId);

  // Provider candidacy: Tool-family components only, traversed in
  // componentId-sorted order (bound ids are unique, so the order is total).
  // Every tool-family declaration is validated by the existing
  // validateToolComponent — a broken tool body fails the selection closed
  // (ToolComponentContractError unwrapped); it never silently "provides
  // nothing". Semantic-family components are never candidates and are never
  // validated as tools.
  const toolComponents = graph.components
    .filter((component: ComponentEnvelope) => component.family === 'tool')
    .sort((a, b) => compareIds(a.componentId, b.componentId));

  const eligible: Array<{ componentId: ComponentId; providesCapability: CapabilityContractRef }> =
    [];
  for (const component of toolComponents) {
    validateToolComponent(component);
    if (excludedId !== undefined && component.componentId === excludedId) {
      continue;
    }
    const declaration = component.semanticBody as unknown as ToolOperationsDeclaration;
    // Within one declaration a capabilityId is unique (T003A validator), so
    // the first exact match is THE match regardless of declaration order.
    for (const providesCapability of declaration.providesCapabilities) {
      if (
        providesCapability.capabilityId === requiredCapabilityId &&
        providesCapability.version === requiredCapabilityVersion
      ) {
        eligible.push({ componentId: component.componentId, providesCapability });
        break;
      }
    }
  }

  if (eligible.length === 0) {
    throw new CapabilityProvisionContractError(
      'CAPABILITY_PROVIDER_NOT_FOUND',
      `capability provider selection: no eligible Domain Tool Component of graph "${graph.graphId}" provides the exact capability ref (capabilityId=${requiredCapabilityId} version=${requiredCapabilityVersion}) — no fallback, no nearest version, no self-provision`,
    );
  }

  if (eligible.length > 1) {
    const conflictingProviderComponentIds = eligible
      .map((provider) => provider.componentId)
      .sort(compareIds);
    throw new CapabilityProvisionContractError(
      'CAPABILITY_PROVIDER_AMBIGUOUS',
      `capability provider selection: ${eligible.length} Domain Tool Components of graph "${graph.graphId}" provide the exact capability ref (capabilityId=${requiredCapabilityId} version=${requiredCapabilityVersion}) — Definition authority requires exactly one (no first-wins, no ordering, no priority)`,
      conflictingProviderComponentIds,
    );
  }

  const selected = eligible[0] as {
    componentId: ComponentId;
    providesCapability: CapabilityContractRef;
  };
  const requiredCapabilityEvidence = freezeCapabilityRef({
    capabilityId: requiredCapabilityId,
    version: requiredCapabilityVersion,
  });
  const providedCapabilityEvidence = freezeCapabilityRef(selected.providesCapability);
  return Object.freeze({
    graphId: graph.graphId,
    requiredCapability: requiredCapabilityEvidence,
    provider: Object.freeze({
      componentId: selected.componentId,
      family: 'tool' as const,
      providesCapability: providedCapabilityEvidence,
    }),
  });
}

/**
 * Definition-currentness-bound Capability provider selection (issue #572).
 *
 * Deterministically names the one Domain Tool Component that provides the
 * exact required ref, exactly like `selectCapabilityProvider`, but the
 * returned evidence is additionally bound to:
 *
 * 1. the exact consumer — `consumerComponentId` is REQUIRED (compile-time and
 *    runtime fail-closed) and must reference a component bound in the graph;
 * 2. the exact consumer requirement — the exact ref (both fields) must occur
 *    in that component's `requiredCapabilities` inside the validated graph,
 *    otherwise `CONSUMER_CAPABILITY_NOT_REQUIRED`;
 * 3. the exact graph currentness — the supplied `currentGraphDigest` is a
 *    CLAIM that must be recomputed through the #555
 *    `computeDefinitionGraphDigest` seam over this exact graph content and
 *    compared; a structurally invalid digest fails `INVALID_SELECTION_INPUT`,
 *    a stale or foreign digest fails `DEFINITION_GRAPH_DIGEST_MISMATCH`. An
 *    unverified supplied digest is never written into evidence.
 *
 * Fail-closed order: graph validation -> ref/consumer exact validation ->
 * consumer requirement membership -> candidacy (the existing
 * `selectCapabilityProvider` core, which also excludes the consumer itself
 * from candidacy — never satisfied-by-self) -> digest recompute/compare.
 * Graph and tool contract errors propagate unwrapped; provider
 * NOT_FOUND/AMBIGUOUS semantics, sorted ambiguity diagnostics and permutation
 * invariance are identical to the candidate API because the candidacy is
 * delegated to it unchanged.
 *
 * Snapshot discipline (#558 seam, extended by the fresh review of #572): the
 * digest seam snapshots the graph synchronously at call time, and this
 * function matches that discipline — candidacy and every authority-bearing
 * capture (the requirement value, the graphId, the frozen evidence refs) run
 * BEFORE the `await computeDefinitionGraphDigest` suspension. After the await
 * only the digest comparison and the return remain, so a caller mutating its
 * own graph while the digest promise is pending can never mint torn hybrid
 * evidence (a digest certifying pre-mutation content alongside
 * requirement/provider/graphId read from post-mutation content).
 *
 * Semantics: this mints Definition-currentness-bound selection evidence, NOT
 * admitted or runtime-authoritative evidence — must-understand admission and
 * sealed Assembly/KindImplementation provenance are not consumed here (see
 * the module docstring and `CurrentCapabilityProviderSelection`).
 */
export async function resolveCurrentCapabilityProvider(
  graph: DefinitionGraphEnvelope,
  requiredCapability: CapabilityContractRef,
  consumerComponentId: ComponentId,
  currentGraphDigest: ContentDigest,
  sha256: Sha256Port,
): Promise<CurrentCapabilityProviderSelection> {
  // Entry validation order is deliberate and fail-closed; the graph and ref
  // validation mirror the candidate API exactly (its errors are shared).
  validateDefinitionGraphEnvelope(graph);

  const required = requireExactSelectionRef(requiredCapability);
  const requiredCapabilityId = required.capabilityId as string;
  const requiredCapabilityVersion = required.version as string;
  const consumerId = requireBoundConsumerId(graph, consumerComponentId);

  // Consumer requirement membership: the exact ref must be declared by the
  // bound consumer in THIS graph (exact two-field equality, the
  // component-admission precedent) — requirement proof precedes candidacy.
  const consumerEnvelope = graph.components.find(
    (component: ComponentEnvelope) => component.componentId === consumerId,
  ) as ComponentEnvelope;
  const declaredRequirement = consumerEnvelope.requiredCapabilities.find(
    (ref: CapabilityContractRef) =>
      ref.capabilityId === requiredCapabilityId && ref.version === requiredCapabilityVersion,
  );
  if (declaredRequirement === undefined) {
    fail(
      'CONSUMER_CAPABILITY_NOT_REQUIRED',
      'requiredCapability',
      `is not declared in the requiredCapabilities of consumer "${consumerId}" of graph "${graph.graphId}" — exact {capabilityId, version} membership is required before any provider selection`,
    );
  }

  // Candidacy is delegated unchanged to the candidate core: identical
  // matching, zero-provider, ambiguity, sorted-diagnostics and permutation
  // semantics, with the consumer excluded from candidacy (no self-provision).
  // It runs BEFORE the digest await so the whole decision is snapshotted
  // synchronously at call time (see the doc comment above).
  const selection = selectCapabilityProvider(graph, requiredCapability, consumerId);

  // Every authority-bearing value is captured and frozen before the await:
  // the graphId, the declared requirement, and the evidence refs. Evidence
  // owns fresh frozen values only — no aliases of caller-owned
  // graph/envelope/request objects — so a later caller mutation cannot
  // rewrite the completed decision, including one racing the pending digest.
  const graphId = graph.graphId;
  const requirementEvidence = freezeCapabilityRef(declaredRequirement);
  const consumerRequirementEvidence = freezeCapabilityRef(declaredRequirement);

  // Currentness: the supplied digest is only a claim. Structurally invalid
  // claims fail closed; a valid claim that does not match the recomputed
  // digest of this exact graph content is stale/foreign and fails closed.
  // The recomputed digest is what enters the evidence, never the claim.
  if (!isContentDigest(currentGraphDigest)) {
    fail(
      'INVALID_SELECTION_INPUT',
      'currentGraphDigest',
      'must be a non-empty content digest string',
    );
  }
  const recomputedDigest = await computeDefinitionGraphDigest(graph, sha256);
  if (recomputedDigest !== currentGraphDigest) {
    fail(
      'DEFINITION_GRAPH_DIGEST_MISMATCH',
      'currentGraphDigest',
      `does not match the recomputed Definition graph digest of graph "${graphId}" — stale or foreign currentness claims are never promoted to selection evidence`,
    );
  }

  return Object.freeze({
    graphId,
    definitionGraphDigest: recomputedDigest,
    requiredCapability: requirementEvidence,
    consumer: Object.freeze({
      componentId: consumerId,
      requiredCapability: consumerRequirementEvidence,
    }),
    provider: selection.provider,
  });
}
