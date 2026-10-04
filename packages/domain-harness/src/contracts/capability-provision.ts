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
import { validateDefinitionGraphEnvelope, type DefinitionGraphEnvelope } from './definition-graph.js';
import { validateToolComponent, type ToolOperationsDeclaration } from './tool-component.js';

export type CapabilityProvisionErrorCode =
  | 'CAPABILITY_PROVIDER_NOT_FOUND'
  | 'CAPABILITY_PROVIDER_AMBIGUOUS'
  | 'INVALID_SELECTION_INPUT'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN';

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
 * no Tool Implementation id, no module/package path, no assembly digest, no
 * pin, no runtime endpoint, no provider-routing identity is representable.
 */
export interface CapabilityProviderSelection {
  /** Graph identity the selection was derived from. */
  readonly graphId: string;
  /** The exact required ref exactly as requested (never normalized). */
  readonly requiredCapability: CapabilityContractRef;
  /** The one Definition-selected Domain Tool provider. */
  readonly provider: CapabilityProviderEvidence;
}

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(code: CapabilityProvisionErrorCode, path: string, reason: string): never {
  throw new CapabilityProvisionContractError(code, `${path} ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Exact selection-input identity string, mirroring the component contract
 * convention unchanged: non-string/blank/`id@version` embedding fails
 * INVALID_SELECTION_INPUT; mutable selection tokens and range/wildcard
 * operators fail FLOATING_AUTHORITY_REFERENCE_FORBIDDEN. Never normalized.
 */
function requireExactSelectionIdentity(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    fail('INVALID_SELECTION_INPUT', path, 'must be a string');
  }
  if (value.trim().length === 0) {
    fail('INVALID_SELECTION_INPUT', path, 'must be a non-empty exact identity');
  }
  if (value.includes('@')) {
    fail(
      'INVALID_SELECTION_INPUT',
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
  if (
    FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) ||
    FLOATING_SELECTOR_PATTERN.test(value)
  ) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/range)',
    );
  }
}

/** Structural validation of the required ref: exactly {capabilityId, version}. */
function requireExactSelectionRef(ref: CapabilityContractRef): void {
  if (!isPlainObject(ref)) {
    fail(
      'INVALID_SELECTION_INPUT',
      'requiredCapability',
      'must be an exact {capabilityId, version} reference object',
    );
  }
  const keys = ownKeys(ref).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail(
      'INVALID_SELECTION_INPUT',
      'requiredCapability',
      'must contain exactly {capabilityId, version} (no extra identity, no embedded selector)',
    );
  }
  requireExactSelectionIdentity(ref.capabilityId, 'requiredCapability.capabilityId');
  requireExactSelectionIdentity(ref.version, 'requiredCapability.version');
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
  if (consumerComponentId.trim().length === 0) {
    fail('INVALID_SELECTION_INPUT', 'consumerComponentId', 'must be a non-empty exact identity');
  }
  if (consumerComponentId.includes('@')) {
    fail(
      'INVALID_SELECTION_INPUT',
      'consumerComponentId',
      'must not embed a version selector (`id@version`)',
    );
  }
  if (
    FLOATING_SELECTOR_TOKENS.has(consumerComponentId.trim().toLowerCase()) ||
    FLOATING_SELECTOR_PATTERN.test(consumerComponentId)
  ) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      'consumerComponentId',
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/range)',
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

  requireExactSelectionRef(requiredCapability);
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
        providesCapability.capabilityId === requiredCapability.capabilityId &&
        providesCapability.version === requiredCapability.version
      ) {
        eligible.push({ componentId: component.componentId, providesCapability });
        break;
      }
    }
  }

  if (eligible.length === 0) {
    throw new CapabilityProvisionContractError(
      'CAPABILITY_PROVIDER_NOT_FOUND',
      `capability provider selection: no eligible Domain Tool Component of graph "${graph.graphId}" provides the exact capability ref (capabilityId=${requiredCapability.capabilityId} version=${requiredCapability.version}) — no fallback, no nearest version, no self-provision`,
    );
  }

  if (eligible.length > 1) {
    const conflictingProviderComponentIds = eligible
      .map((provider) => provider.componentId)
      .sort(compareIds);
    throw new CapabilityProvisionContractError(
      'CAPABILITY_PROVIDER_AMBIGUOUS',
      `capability provider selection: ${eligible.length} Domain Tool Components of graph "${graph.graphId}" provide the exact capability ref (capabilityId=${requiredCapability.capabilityId} version=${requiredCapability.version}) — Definition authority requires exactly one (no first-wins, no ordering, no priority)`,
      conflictingProviderComponentIds,
    );
  }

  const selected = eligible[0] as {
    componentId: ComponentId;
    providesCapability: CapabilityContractRef;
  };
  return Object.freeze({
    graphId: graph.graphId,
    requiredCapability,
    provider: Object.freeze({
      componentId: selected.componentId,
      family: 'tool' as const,
      providesCapability: selected.providesCapability,
    }),
  });
}
