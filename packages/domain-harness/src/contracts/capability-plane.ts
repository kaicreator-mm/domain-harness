/**
 * v0.7 Domain/host capability-plane collision (issue #634, fine-grained DAG
 * T003D).
 *
 * The frozen L2 keeps Capability as ONE stable `requires/provides` contract
 * identity; PACK-A (#589) freezes the T003D posture this module implements:
 * an internal provenance plane distinction `DOMAIN | HOST` over that single
 * identity — this is NOT a Component family, introduces no third Capability
 * ontology and adds no cross-plane DSL. For one exact required
 * `CapabilityContractRef`:
 *
 *   Domain plane only   => the normal T003B path — `selectCapabilityProvider`
 *                          selection evidence, unchanged, unwrapped;
 *   Host plane only     => a Host-plane result carrying the exact frozen
 *                          declared ref and no provider identity of any kind;
 *   both planes         => `CAPABILITY_PLANE_COLLISION`, fail closed;
 *   neither plane       => the T003B missing-provider failure, unwrapped.
 *
 * Boundary rules owned here, without exception:
 * - neither plane may override the other by order, declaration position,
 *   priority or default — the resolver has exactly four parameters and no
 *   priority surface; dual provision of the SAME exact ref (both fields) is
 *   always a collision, regardless of which plane is declared first or how
 *   either plane's declarations are ordered;
 * - the #579 disposition applies underneath unchanged: Domain candidacy is
 *   delegated verbatim to the T003B authority (`selectCapabilityProvider`),
 *   so 0 => CAPABILITY_PROVIDER_NOT_FOUND, 1 => select, >1 =>
 *   CAPABILITY_PROVIDER_AMBIGUOUS with sorted diagnostics; a collision is
 *   plane-prior — dual provision with an ambiguous Domain plane is still a
 *   collision, never an ambiguity win;
 * - exact refs only, exact two-field equality: a Domain or Host declaration
 *   of another version of the same capabilityId is NOT provision of the
 *   required ref — no normalization, no nearest-version, no compat suffix;
 * - the Domain plane remains the single validation authority for the
 *   required ref: this module runs Domain candidacy FIRST, so graph envelope
 *   errors (`DefinitionGraphContractError`), tool declaration errors
 *   (`ToolComponentContractError`) and required-ref exactness failures
 *   (T003B `CapabilityProvisionContractError`) all propagate unwrapped from
 *   the T003B path; only the Host declaration surface is validated here, on
 *   descriptor-safe snapshots through the shared record-safety authority
 *   (#557/#578) — accessor-backed, symbol-keyed, non-enumerable or
 *   exotic-prototype Host input is rejected before any authority use, with
 *   zero hidden-getter executions;
 * - the resolver is a pure function: no input mutation, no ambient state, no
 *   I/O; successful evidence owns fresh frozen values, never aliases of
 *   caller-owned graph/declaration objects;
 * - the "unless already-frozen Definition semantics explicitly resolve the
 *   plane" escape of PACK-A has NO representation in v0.7: no frozen
 *   Definition semantic resolves a plane crossing, so dual provision always
 *   fails closed. Admitting an intentional crossing requires later
 *   Product/L2 work; this module mints no resolution input.
 *
 * Host-plane evidence is deliberately minimal: graph identity plus the exact
 * required/provided refs. The Host plane is pure declaration data — no
 * concrete host provider, host profile, registry, handle or routing identity
 * is imported, minted or representable here (PACK-A: zero concrete
 * host-provider imports in the Microkernel).
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - Definition-currentness-bound plane resolution (a #572-style variant) and
 *   runtime admission/authority closure (T003C/T003E + #575/T002B);
 * - capability closure, recursion or batch resolution (T003E — exactly one
 *   required ref per call);
 * - runtime Host integration behind a ResourceProvider port (T005B);
 * - Tool invocation runtime, occurrence anchoring, exposure authority (T004).
 */
import type {
  CapabilityContractRef,
  ComponentId,
} from './component.js';
import type { DefinitionGraphEnvelope } from './definition-graph.js';
import {
  CapabilityProvisionContractError,
  selectCapabilityProvider,
  type CapabilityProviderSelection,
} from './capability-provision.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  carriesXRangeVersionSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

/**
 * The two frozen provenance planes of one Capability contract identity
 * (PACK-A T003D). Internal distinction only — not a Component family, not a
 * third Capability ontology.
 */
export type CapabilityProvenancePlane = 'domain' | 'host';

/**
 * T003D failure taxonomy: plane collision and this module's own Host
 * declaration input validation. Missing/ambiguous provider selection stays
 * owned by the T003B taxonomy and propagates unwrapped from it.
 */
export type CapabilityPlaneErrorCode = 'CAPABILITY_PLANE_COLLISION' | 'INVALID_PLANE_INPUT';

/**
 * Typed, fail-closed plane failure. Never recovered from, never wrapped.
 * The Domain plane's own failures (graph/tool contract errors, T003B
 * selection errors) are distinct classes and propagate unchanged — this
 * class covers only the two T003D-owned codes.
 */
export class CapabilityPlaneContractError extends Error {
  readonly code: CapabilityPlaneErrorCode;
  /**
   * COLLISION only: the Domain-plane provider ComponentIds, sorted
   * lexicographically, so the failure diagnostics are deterministic under
   * every component ordering. Empty for every other code.
   */
  readonly domainProviderComponentIds: readonly ComponentId[];

  constructor(
    code: CapabilityPlaneErrorCode,
    message: string,
    domainProviderComponentIds: readonly ComponentId[] = [],
  ) {
    super(message);
    this.name = 'CapabilityPlaneContractError';
    this.code = code;
    this.domainProviderComponentIds = Object.freeze([...domainProviderComponentIds]);
  }
}

/**
 * Domain-plane provision: the plane tag plus the unchanged T003B selection
 * evidence. Carries exactly what `selectCapabilityProvider` proves — nothing
 * more.
 */
export interface DomainCapabilityPlaneProvision {
  readonly plane: 'domain';
  readonly selection: CapabilityProviderSelection;
}

/**
 * Host-plane provision: the plane tag, graph identity and the exact required
 * ref next to the exact Host declaration that matched it — both fresh frozen.
 * No provider Component, implementation handle or routing identity is
 * representable.
 */
export interface HostCapabilityPlaneProvision {
  readonly plane: 'host';
  readonly graphId: string;
  /** The exact required ref as immutable value evidence (never normalized). */
  readonly requiredCapability: CapabilityContractRef;
  /** The exact matching Host declaration, fresh frozen (never normalized). */
  readonly hostProvidedCapability: CapabilityContractRef;
}

/** Plane-routing result for one exact required CapabilityRef. */
export type CapabilityPlaneResolution =
  | DomainCapabilityPlaneProvision
  | HostCapabilityPlaneProvision;

function fail(code: CapabilityPlaneErrorCode, path: string, reason: string): never {
  throw new CapabilityPlaneContractError(code, `${path} ${reason}`);
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
 * Structural stage of Host-declaration identity validation: the value must be
 * a non-empty string without an embedded `id@version` selector form (the
 * component contract convention, unchanged). Structurally unusable input is a
 * typed `INVALID_PLANE_INPUT`, never a TypeError, and no hidden getter
 * executes during validation or diagnostics.
 */
function requireExactHostIdentityString(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    fail('INVALID_PLANE_INPUT', path, 'must be a string');
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_PLANE_INPUT', path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      'INVALID_PLANE_INPUT',
      path,
      'must not embed a version selector (`id@version`); use the exact version field',
    );
  }
}

/**
 * Exactness stage for Host-declaration identity strings: mutable selection
 * tokens and range/wildcard operators are forbidden, never normalized — the
 * shared unified matrix of `record-safety.ts` (#557), the same matrix the
 * Tool declaration and graph seams consume.
 */
function requireNonFloatingHostIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'INVALID_PLANE_INPUT',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)',
    );
  }
}

/**
 * Exactness stage for Host-declaration version strings: the identity matrix
 * PLUS semver x-range/partial forms (`1.x`, `x`, `1.`), which are never
 * exact. Validation only — never resolved against anything.
 */
function requireExactHostVersion(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
    fail(
      'INVALID_PLANE_INPUT',
      path,
      'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)',
    );
  }
}

/**
 * Structural validation of one Host capability declaration on a
 * descriptor-safe snapshot (#578): an ordinary or null-prototype record
 * carrying exactly the own enumerable data keys `{capabilityId, version}`
 * (no accessor, no hidden symbol/non-enumerable material, no exotic
 * prototype), both fields exact identity strings. Returns the validated
 * snapshot: every downstream authority read (matching, evidence minting,
 * diagnostics) consumes the snapshot, never the caller-owned object, so
 * validation-to-use TOCTOU drift is impossible by construction.
 */
function requireExactHostDeclaration(
  declaration: CapabilityContractRef,
  path: string,
): Record<string, unknown> {
  const result = safeRecordSnapshot(declaration, path);
  if (!result.ok) {
    fail('INVALID_PLANE_INPUT', path, describeRecordSafetyIssue(result.issue));
  }
  const candidate = result.snapshot;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
    fail(
      'INVALID_PLANE_INPUT',
      path,
      'must contain exactly {capabilityId, version} (no extra identity, no embedded selector)',
    );
  }
  requireExactHostIdentityString(candidate.capabilityId, `${path}.capabilityId`);
  requireNonFloatingHostIdentity(candidate.capabilityId as string, `${path}.capabilityId`);
  requireExactHostIdentityString(candidate.version, `${path}.version`);
  requireExactHostVersion(candidate.version as string, `${path}.version`);
  return candidate;
}

/**
 * Domain-plane candidacy outcome: exactly one of selected / missing /
 * ambiguous — the T003B authority's three terminal states. All other T003B
 * failures (graph contract, tool contract, selection-input exactness)
 * propagate unwrapped and never reach this classification.
 */
type DomainCandidacyOutcome =
  | { readonly kind: 'selected'; readonly selection: CapabilityProviderSelection }
  | { readonly kind: 'missing'; readonly error: CapabilityProvisionContractError }
  | { readonly kind: 'ambiguous'; readonly error: CapabilityProvisionContractError };

/**
 * Domain candidacy runs through the T003B authority verbatim
 * (`selectCapabilityProvider`): its NOT_FOUND/AMBIGUOUS outcomes become the
 * plane-absence/plane-multiplicity signal; every other failure propagates
 * unwrapped.
 */
function classifyDomainCandidacy(
  graph: DefinitionGraphEnvelope,
  requiredCapability: CapabilityContractRef,
  consumerComponentId?: ComponentId,
): DomainCandidacyOutcome {
  try {
    return {
      kind: 'selected',
      selection: selectCapabilityProvider(graph, requiredCapability, consumerComponentId),
    };
  } catch (error) {
    if (
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND'
    ) {
      return { kind: 'missing', error };
    }
    if (
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_AMBIGUOUS'
    ) {
      return { kind: 'ambiguous', error };
    }
    throw error;
  }
}

/**
 * Descriptor-safe validation of the whole Host declaration surface: a plain
 * dense array of exact `{capabilityId, version}` declarations. The validated
 * snapshots (not the caller-owned array) are what matching consumes.
 */
function snapshotHostDeclarations(
  hostCapabilities: readonly CapabilityContractRef[],
): Array<{ capabilityId: string; version: string }> {
  const arrayResult = safeArraySnapshot(hostCapabilities, 'hostCapabilities');
  if (!arrayResult.ok) {
    fail('INVALID_PLANE_INPUT', 'hostCapabilities', describeRecordSafetyIssue(arrayResult.issue));
  }
  const snapshots: Array<{ capabilityId: string; version: string }> = [];
  for (let index = 0; index < arrayResult.snapshot.length; index += 1) {
    const snapshot = requireExactHostDeclaration(
      arrayResult.snapshot[index] as CapabilityContractRef,
      `hostCapabilities[${index}]`,
    );
    snapshots.push({
      capabilityId: snapshot.capabilityId as string,
      version: snapshot.version as string,
    });
  }
  return snapshots;
}

/**
 * Domain/host capability-plane routing for one exact required
 * `CapabilityContractRef` (PACK-A T003D).
 *
 * Evaluation order is deliberate and fail-closed:
 *
 * 1. The Host declaration surface is validated on descriptor-safe snapshots
 *    (typed `INVALID_PLANE_INPUT`; zero hidden-getter executions).
 * 2. Domain candidacy runs through the T003B authority
 *    (`selectCapabilityProvider`) verbatim — so graph/tool contract errors
 *    and required-ref exactness failures propagate unwrapped, one eligible
 *    provider yields the unchanged selection evidence, zero providers yield
 *    `CAPABILITY_PROVIDER_NOT_FOUND` and multiple yield
 *    `CAPABILITY_PROVIDER_AMBIGUOUS` with sorted diagnostics (#579).
 * 3. Plane routing: Host provision of the SAME exact ref (both fields) on
 *    top of any Domain provision (one provider or an ambiguous set) is
 *    `CAPABILITY_PLANE_COLLISION` — plane-prior, order-invariant, no escape
 *    hatch; Host-only is a Host-plane result; Domain-only is the T003B
 *    selection; neither re-throws the captured `CAPABILITY_PROVIDER_NOT_FOUND`
 *    so the missing-provider failure is byte-identical to the T003B path.
 *
 * Purity: no input mutation, no ambient state, no I/O; the result is
 * invariant under every ordering of graph components, Domain declarations,
 * Host declarations and their relative declaration order. Successful
 * evidence owns fresh frozen capability-ref values, so a later caller
 * mutation cannot alter an already-completed plane decision. When supplied,
 * `consumerComponentId` is passed through to the T003B candidacy unchanged
 * (the consumer is never its own provider; see the T003B contract).
 */
export function resolveCapabilityPlane(
  graph: DefinitionGraphEnvelope,
  hostCapabilities: readonly CapabilityContractRef[],
  requiredCapability: CapabilityContractRef,
  consumerComponentId?: ComponentId,
): CapabilityPlaneResolution {
  // Host declaration surface: descriptor-safe snapshot validation first, so
  // malformed Host input fails before any Domain authority runs.
  const hostDeclarations = snapshotHostDeclarations(hostCapabilities);

  // Domain plane: the T003B authority runs first and verbatim, so graph
  // envelope errors, tool declaration errors and required-ref exactness
  // failures all propagate unwrapped from the normal T003B path.
  const domain = classifyDomainCandidacy(graph, requiredCapability, consumerComponentId);

  // By this point the required ref is T003B-validated (the Domain candidacy
  // validates it before any candidacy work and propagates its failures
  // unwrapped), so the snapshot read here for Host matching cannot drift
  // from the validated identity.
  const requiredSnapshot = requireExactHostDeclaration(requiredCapability, 'requiredCapability');
  const requiredCapabilityId = requiredSnapshot.capabilityId as string;
  const requiredCapabilityVersion = requiredSnapshot.version as string;

  const hostMatch = hostDeclarations.find(
    (declaration) =>
      declaration.capabilityId === requiredCapabilityId &&
      declaration.version === requiredCapabilityVersion,
  );
  const hostProvisioned = hostMatch !== undefined;

  if (hostProvisioned && domain.kind === 'selected') {
    throw new CapabilityPlaneContractError(
      'CAPABILITY_PLANE_COLLISION',
      `capability plane collision: the exact capability ref (capabilityId=${requiredCapabilityId} version=${requiredCapabilityVersion}) is provided by BOTH the Domain plane (Domain Tool Component "${domain.selection.provider.componentId}" of graph "${graph.graphId}") and the Host plane (exact host declaration) — neither plane overrides the other by order/default; no frozen Definition semantics resolve this plane, so the requirement fails closed`,
      [domain.selection.provider.componentId],
    );
  }

  if (hostProvisioned && domain.kind === 'ambiguous') {
    throw new CapabilityPlaneContractError(
      'CAPABILITY_PLANE_COLLISION',
      `capability plane collision: the exact capability ref (capabilityId=${requiredCapabilityId} version=${requiredCapabilityVersion}) is provided by BOTH the Domain plane (${domain.error.conflictingProviderComponentIds.length} Domain Tool Components of graph "${graph.graphId}") and the Host plane (exact host declaration) — the plane crossing is plane-prior to Domain ambiguity; neither plane overrides the other by order/default; no frozen Definition semantics resolve this plane, so the requirement fails closed`,
      [...domain.error.conflictingProviderComponentIds].sort(compareIds),
    );
  }

  if (hostProvisioned) {
    // Host-only: fresh frozen evidence from the validated snapshots only —
    // never aliases of caller-owned declaration objects. `hostProvisioned`
    // is a const alias of `hostMatch !== undefined`, so the match is
    // narrowed non-undefined here.
    return Object.freeze({
      plane: 'host' as const,
      graphId: graph.graphId,
      requiredCapability: freezeCapabilityRef({
        capabilityId: requiredCapabilityId,
        version: requiredCapabilityVersion,
      }),
      hostProvidedCapability: freezeCapabilityRef({
        capabilityId: hostMatch.capabilityId,
        version: hostMatch.version,
      }),
    });
  }

  if (domain.kind === 'selected') {
    return Object.freeze({
      plane: 'domain' as const,
      selection: domain.selection,
    });
  }

  // Host-absent outcomes: the captured T003B failures re-throw unwrapped and
  // byte-identical — >1 Domain providers => AMBIGUOUS (#579), zero providers
  // on both planes => the missing-provider failure.
  throw domain.error;
}
