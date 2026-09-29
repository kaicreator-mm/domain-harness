// Issue #355 / A41-001: adoption, guard and deterministic-classification
// functions for the DAC v0.0.4.1 successor reference / request-role
// foundation. See contracts.ts for the frozen authority invariants and the
// explicit non-goals (no designation/adoption issuance or verification, no
// compatibility evaluation, no composition-intake/selection/Manifest
// verification, no Runtime binding/activation behavior, no promotion or
// conformance authority).
//
// No function in this module converts one lifecycle role into another, and
// none manufactures an authority-bearing result: minting a request reference
// proves only that the request identity exists (ASSEMBLY_CAPABILITY_
// EXCHANGE §3); adopting a registry reference records identity only. The
// classifiers are pure deterministic functions over externally supplied
// facts and never invent a fact, a COMPATIBLE disposition or a target/
// binding authority.
import {
  DAC_V0041_BASELINE,
  DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT,
  DAC_V0041_CURRENTNESS_USE_STATES,
  DAC_V0041_FOUNDATION_REQUEST_ROLES,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  DAC_V0041_REFERENCE_ADAPTER_VERSION,
  DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS,
  DAC_V0041_ROLE_REGISTRY,
  DacV0041ReferenceError,
  type CompatibilityValidationRequestRef,
  type DacV0041BaselineInput,
  type DacV0041CapabilityExchangeClassification,
  type DacV0041CapabilityExchangeFacts,
  type DacV0041CapabilityOutcomeClass,
  type DacV0041CurrentnessUseClassification,
  type DacV0041CurrentnessUseState,
  type DacV0041PredecessorBaseline,
  type DacV0041Reference,
  type DacV0041ReferenceInput,
  type DacV0041RegistryReference,
  type DacV0041RequestReferenceInput,
  type DacV0041RegistryRole,
  type RuntimeBindingRequestRef,
} from './contracts.js';

/**
 * Mutable alias tokens that can never stand in for an exact identity
 * (CROSS_LAYER_REFERENCES §8 carried forward). Matched on the trimmed,
 * lower-cased whole token — an exact identity that merely contains one of
 * these words is not rejected (no heuristic guessing).
 */
const MUTABLE_ALIAS_TOKENS = new Set([
  'latest',
  'current',
  'head',
  'main',
  'master',
  'default',
  'stable',
  'tip',
]);

function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

function baselineEqualsSuccessor(input: DacV0041BaselineInput): boolean {
  return (
    input.contract === DAC_V0041_BASELINE.contract &&
    input.version === DAC_V0041_BASELINE.version &&
    input.semanticFreezeCommit === DAC_V0041_BASELINE.semanticFreezeCommit &&
    input.semanticFreezeTree === DAC_V0041_BASELINE.semanticFreezeTree
  );
}

function matchPredecessorBaselineInput(
  input: unknown,
): DacV0041PredecessorBaseline | null {
  if (input === null || typeof input !== 'object') return null;
  const candidate = input as Partial<DacV0041PredecessorBaseline>;
  // The evidence record is validated completely: a `purpose` retained by the
  // carrier must be the exact evidence-only purpose — a predecessor identity
  // relabeled toward any other purpose fails closed.
  if (
    candidate.purpose !== undefined &&
    candidate.purpose !== DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE
  ) {
    return null;
  }
  return (
    DAC_V0041_PREDECESSOR_BASELINES.find(
      (baseline) =>
        candidate.contract === baseline.contract &&
        candidate.version === baseline.version &&
        candidate.semanticFreezeCommit === baseline.semanticFreezeCommit &&
        candidate.semanticFreezeTree === baseline.semanticFreezeTree,
    ) ?? null
  );
}

function isPredecessorBaselineInput(input: unknown): input is DacV0041PredecessorBaseline {
  return matchPredecessorBaselineInput(input) !== null;
}

function requireNonEmptyString(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacV0041ReferenceError(
      'INVALID_REFERENCE',
      `${field} must be a non-empty string`,
    );
  }
}

function requireExactIdentityString(value: string, field: string): void {
  requireNonEmptyString(value, field);
  if (isMutableAliasToken(value)) {
    throw new DacV0041ReferenceError(
      'MUTABLE_ALIAS_REJECTED',
      `${field} "${value}" is a mutable alias (latest/current/head-style) and can never substitute an exact identity`,
    );
  }
}

function requireBaseline(input: DacV0041BaselineInput): void {
  // Fail closed on any drift — including a frozen predecessor baseline,
  // whose identity may travel only as transition/adoption evidence and can
  // never be interpreted as the successor pin (C105: a predecessor
  // authority artifact is not successor authority).
  if (!baselineEqualsSuccessor(input)) {
    throw new DacV0041ReferenceError(
      'UNSUPPORTED_DAC_BASELINE',
      `baseline must equal the exact DAC v0.0.4.1 successor freeze ${DAC_V0041_BASELINE.semanticFreezeCommit} (got ${String(
        input.semanticFreezeCommit,
      )}); predecessor identities are transition/adoption evidence only`,
    );
  }
}

function requirePredecessorOrigin(origin: DacV0041PredecessorBaseline | undefined): void {
  if (origin === undefined) return;
  if (!isPredecessorBaselineInput(origin)) {
    throw new DacV0041ReferenceError(
      'INVALID_PREDECESSOR_ORIGIN',
      'predecessorOrigin must name exactly one frozen predecessor baseline (v0.0.3 or v0.0.4 semantic freeze) carrying the exact evidence-only purpose, and is retained for transition/adoption evidence only',
    );
  }
}

/**
 * Frozen predecessor-evidence slot closed into a minted reference: a fresh
 * frozen snapshot of the matched frozen table entry (canonical evidence-only
 * purpose included, extra carrier fields dropped) — never the caller-owned
 * carrier object. Mutating the caller's origin object after mint can never
 * change the exact historic-origin evidence the reference carries.
 */
function predecessorOriginSlot(
  origin: DacV0041PredecessorBaseline | undefined,
): { predecessorOrigin: DacV0041PredecessorBaseline } | Record<string, never> {
  if (origin === undefined) return {};
  const matched = matchPredecessorBaselineInput(origin);
  if (matched === null) {
    throw new DacV0041ReferenceError(
      'INVALID_PREDECESSOR_ORIGIN',
      'predecessorOrigin must name exactly one frozen predecessor baseline (v0.0.3 or v0.0.4 semantic freeze) carrying the exact evidence-only purpose, and is retained for transition/adoption evidence only',
    );
  }
  return { predecessorOrigin: Object.freeze({ ...matched }) };
}

function freezeAdopted<T extends object>(value: T): T {
  return Object.freeze(value);
}

/**
 * Defensive FROZEN copy of an optional string collection. The copied
 * container participates in the exact request/evidence closure, so it is
 * frozen like the historical v0.0.3 adoption core freezes its copied
 * collections — minted material can never be mutated after mint.
 */
function copyStrings(value: readonly string[] | undefined): readonly string[] {
  return freezeAdopted(value === undefined ? [] : value.slice());
}

/** Defensive FROZEN copy of an optional reference collection (same closure rule). */
function copyRefs(value: readonly DacV0041Reference[] | undefined): readonly DacV0041Reference[] {
  return freezeAdopted(value === undefined ? [] : value.slice());
}

/** Defensive FROZEN shallow copy of the opaque record (same closure rule). */
function copyOpaque(
  value: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  return freezeAdopted(value === undefined ? {} : { ...value });
}

/**
 * Private minting registry. Only references actually minted by this
 * adoption core pass the `is*` guards — a structurally identical forged
 * object is rejected, so a role/authority claim can never be guessed into
 * existence by a foreign carrier (fail closed, never interpreted). This
 * registry is intentionally separate from every historical adapter's: a
 * v0.0.2 or v0.0.3 adopted reference is never a v0.0.4.1 reference and vice
 * versa.
 */
const MINTED_V0041_REFERENCES = new WeakSet<object>();

function structurallyMintedReference(value: unknown): value is DacV0041Reference {
  if (value === null || typeof value !== 'object') return false;
  if (!MINTED_V0041_REFERENCES.has(value)) return false;
  const candidate = value as Partial<DacV0041Reference>;
  return (
    candidate.adapter === DAC_V0041_REFERENCE_ADAPTER_VERSION &&
    typeof candidate.role === 'string' &&
    (DAC_V0041_ROLE_REGISTRY as readonly string[]).indexOf(candidate.role) !== -1 &&
    typeof candidate.authorityScope === 'string' &&
    typeof candidate.primaryIdentity === 'string'
  );
}

/** Type guard: is this value a reference minted by the v0.0.4.1 core? */
export function isDacV0041Reference(value: unknown): value is DacV0041Reference {
  return structurallyMintedReference(value);
}

function sharedEnvelopeSlots(input: DacV0041ReferenceInput) {
  requireBaseline(input.baseline);
  requireNonEmptyString(input.authorityScope, 'authorityScope');
  requireExactIdentityString(input.primaryIdentity, 'primaryIdentity');
  if (input.semanticIdentity !== undefined) {
    requireExactIdentityString(input.semanticIdentity, 'semanticIdentity');
  }
  if (input.revisionIdentity !== undefined) {
    requireExactIdentityString(input.revisionIdentity, 'revisionIdentity');
  }
  if (input.contentDigest !== undefined) {
    requireExactIdentityString(input.contentDigest, 'contentDigest');
  }
  if (input.contractProfileIdentity !== undefined) {
    requireExactIdentityString(input.contractProfileIdentity, 'contractProfileIdentity');
  }
  for (const hint of input.locatorHints ?? []) {
    requireNonEmptyString(hint, 'locatorHint');
  }
  requirePredecessorOrigin(input.predecessorOrigin);
}

/**
 * Adopt an arbitrary successor registry-role reference. Identity-only: no
 * role in the registry gains decision, evaluation, issuance or lifecycle
 * authority by being adopted here. In particular `authority-designation` /
 * `authority-adoption` / `compatibility-validation` / `compatibility-result`
 * / `runtime-binding` / `runtime-activation` / promotion / selection /
 * Manifest references carry identity only — their verification belongs to
 * A41-002..A41-006 and their issuance is never owned by this repository.
 *
 * The two foundation request roles are RESERVED: they have dedicated nominal
 * constructors (`mintCompatibilityValidationRequestRef` /
 * `mintRuntimeBindingRequestRef`) that enforce the request-envelope
 * minimums, so generic adoption of exactly those roles fails closed instead
 * of minting a request-shaped carrier that bypasses them.
 */
export function adoptDacV0041RegistryReference(
  input: DacV0041ReferenceInput & { readonly role: DacV0041RegistryRole },
): DacV0041Reference {
  if ((DAC_V0041_ROLE_REGISTRY as readonly string[]).indexOf(input.role) === -1) {
    throw new DacV0041ReferenceError(
      'ROLE_MISMATCH',
      `role "${String(input.role)}" is not in the DAC v0.0.4.1 successor role registry`,
    );
  }
  if (
    (DAC_V0041_FOUNDATION_REQUEST_ROLES as readonly string[]).indexOf(input.role) !== -1
  ) {
    throw new DacV0041ReferenceError(
      'ROLE_MISMATCH',
      `role "${String(input.role)}" is a foundation request role with a dedicated nominal constructor; generic adoption is reserved to prevent bypassing the request-envelope minimums`,
    );
  }
  sharedEnvelopeSlots(input);
  // Defensive copies with conditional spreads: every minted reference is
  // frozen, never aliases a caller-mutable array/object, and every nested
  // container closed into the reference (string/ref collections, opaque
  // record, predecessor-origin evidence snapshot) is frozen with it;
  // optional slots are omitted (not assigned undefined) under
  // exactOptionalPropertyTypes.
  const reference = freezeAdopted({
    adapter: DAC_V0041_REFERENCE_ADAPTER_VERSION,
    baseline: DAC_V0041_BASELINE,
    role: input.role,
    authorityScope: input.authorityScope,
    primaryIdentity: input.primaryIdentity,
    ...(input.semanticIdentity === undefined ? {} : { semanticIdentity: input.semanticIdentity }),
    ...(input.revisionIdentity === undefined ? {} : { revisionIdentity: input.revisionIdentity }),
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    locatorHints: copyStrings(input.locatorHints),
    ...predecessorOriginSlot(input.predecessorOrigin),
    opaque: copyOpaque(input.opaque),
  }) as DacV0041RegistryReference;
  MINTED_V0041_REFERENCES.add(reference);
  return reference;
}

function requireMintedRequestSlot(ref: DacV0041Reference | undefined, field: string): void {
  if (ref === undefined) return;
  if (!structurallyMintedReference(ref)) {
    throw new DacV0041ReferenceError(
      'INVALID_REFERENCE',
      `${field} must be a reference minted by the DAC v0.0.4.1 adoption core (foreign/forged carriers fail closed)`,
    );
  }
}

function mintRequestReference<R extends CompatibilityValidationRequestRef | RuntimeBindingRequestRef>(
  role: R['role'],
  input: DacV0041RequestReferenceInput,
): R {
  sharedEnvelopeSlots(input);
  requireNonEmptyString(input.requesterIdentity, 'requesterIdentity');
  requireNonEmptyString(input.providerIdentity, 'providerIdentity');
  requireExactIdentityString(input.requestedCapabilityKind, 'requestedCapabilityKind');
  requireMintedRequestSlot(input.descriptorRef, 'descriptorRef');
  requireMintedRequestSlot(input.bindingTargetRef, 'bindingTargetRef');
  for (const material of input.materialInputRefs ?? []) {
    requireMintedRequestSlot(material, 'materialInputRefs entry');
  }
  for (const hint of input.advisoryTargetHints ?? []) {
    requireNonEmptyString(hint, 'advisoryTargetHint');
  }
  // §4.1/§4.2: the binding explicit target slot may only hold a minted
  // `compatibility-target` reference; an advisory hint string can never
  // occupy it (advisory hints are discovery-only and can never satisfy a
  // required binding target/profile slot).
  if (
    input.bindingTargetRef !== undefined &&
    input.bindingTargetRef.role !== 'compatibility-target'
  ) {
    throw new DacV0041ReferenceError(
      'ADVISORY_HINT_NOT_BINDING_TARGET',
      `bindingTargetRef must carry role "compatibility-target" (got "${String(
        input.bindingTargetRef.role,
      )}"); advisory target hints are non-authoritative metadata and can never occupy the binding explicit target slot`,
    );
  }
  const reference = freezeAdopted({
    adapter: DAC_V0041_REFERENCE_ADAPTER_VERSION,
    baseline: DAC_V0041_BASELINE,
    role,
    authorityScope: input.authorityScope,
    primaryIdentity: input.primaryIdentity,
    ...(input.semanticIdentity === undefined ? {} : { semanticIdentity: input.semanticIdentity }),
    ...(input.revisionIdentity === undefined ? {} : { revisionIdentity: input.revisionIdentity }),
    ...(input.contentDigest === undefined ? {} : { contentDigest: input.contentDigest }),
    ...(input.contractProfileIdentity === undefined
      ? {}
      : { contractProfileIdentity: input.contractProfileIdentity }),
    locatorHints: copyStrings(input.locatorHints),
    ...predecessorOriginSlot(input.predecessorOrigin),
    requesterIdentity: input.requesterIdentity,
    providerIdentity: input.providerIdentity,
    requestedCapabilityKind: input.requestedCapabilityKind,
    ...(input.descriptorRef === undefined ? {} : { descriptorRef: input.descriptorRef }),
    materialInputRefs: copyRefs(input.materialInputRefs),
    ...(input.bindingTargetRef === undefined ? {} : { bindingTargetRef: input.bindingTargetRef }),
    advisoryTargetHints: copyStrings(input.advisoryTargetHints),
    opaque: copyOpaque(input.opaque),
  }) as R;
  MINTED_V0041_REFERENCES.add(reference);
  return reference;
}

/**
 * Mint a `CompatibilityValidationRequestRef` (C89). The request identity is
 * nominal and minted-only; it can never occupy a
 * `compatibility-validation`/`compatibility-result` position, and minting it
 * records no acceptance, evaluation or compatibility decision (A41-003 owns
 * evaluation; F-05 keeps the two result views separable).
 */
export function mintCompatibilityValidationRequestRef(
  input: DacV0041RequestReferenceInput,
): CompatibilityValidationRequestRef {
  return mintRequestReference('compatibility-validation-request', input);
}

/**
 * Mint a `RuntimeBindingRequestRef` (C108). The request identity is nominal
 * and minted-only; it can never occupy a `runtime-binding` or
 * `runtime-host-binding` position, and minting it records no binding,
 * activation or Runtime consequence (A41-005 owns binding/activation
 * behavior).
 */
export function mintRuntimeBindingRequestRef(
  input: DacV0041RequestReferenceInput,
): RuntimeBindingRequestRef {
  return mintRequestReference('runtime-binding-request', input);
}

/** Type guard for the C89 compatibility seam request role. */
export function isCompatibilityValidationRequestRef(
  value: unknown,
): value is CompatibilityValidationRequestRef {
  return structurallyMintedReference(value) && value.role === 'compatibility-validation-request';
}

/** Type guard for the C108 Runtime binding seam request role. */
export function isRuntimeBindingRequestRef(
  value: unknown,
): value is RuntimeBindingRequestRef {
  return structurallyMintedReference(value) && value.role === 'runtime-binding-request';
}

function aliasChainIndexOfRole(role: DacV0041RegistryRole): { chain: number; index: number } | null {
  for (let chain = 0; chain < DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS.length; chain += 1) {
    const index = (
      DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS[chain] as readonly string[]
    ).indexOf(role);
    if (index !== -1) return { chain, index };
  }
  return null;
}

/**
 * Universal request/result anti-alias verifier (CROSS_LAYER_REFERENCES §6;
 * C89/C108/C155). Given a minted request reference and one or more minted
 * counterpart references, fails closed (`REQUEST_RESULT_ALIAS`) when a
 * request identity aliases a distinct result/decision/definition identity
 * within the same seam chain — the shape that would make a consumer unable
 * to recover whether an action was merely requested, whether a
 * decision/result actually exists, or which authority acted. Distinct
 * identities across every presented chain position pass.
 */
export function verifyDacV0041RequestResultSeparation(
  request: DacV0041Reference,
  counterparts: readonly DacV0041Reference[],
): void {
  if (!structurallyMintedReference(request)) {
    throw new DacV0041ReferenceError(
      'INVALID_REFERENCE',
      'request must be a reference minted by the DAC v0.0.4.1 adoption core',
    );
  }
  const requestChain = aliasChainIndexOfRole(request.role);
  if (requestChain === null) {
    throw new DacV0041ReferenceError(
      'ROLE_MISMATCH',
      `role "${String(request.role)}" is not a request role of any frozen request/result alias chain`,
    );
  }
  for (const counterpart of counterparts) {
    if (!structurallyMintedReference(counterpart)) {
      throw new DacV0041ReferenceError(
        'INVALID_REFERENCE',
        'counterpart must be a reference minted by the DAC v0.0.4.1 adoption core',
      );
    }
    const counterpartChain = aliasChainIndexOfRole(counterpart.role);
    if (counterpartChain === null || counterpartChain.chain !== requestChain.chain) {
      continue;
    }
    if (
      counterpart.role !== request.role &&
      counterpart.primaryIdentity === request.primaryIdentity
    ) {
      throw new DacV0041ReferenceError(
        'REQUEST_RESULT_ALIAS',
        `request role "${String(request.role)}" and result/decision role "${String(
          counterpart.role,
        )}" alias the same identity "${request.primaryIdentity}"; request identity must remain distinct from every result/decision/definition identity in its seam chain`,
      );
    }
  }
}

/**
 * A capability kind (requested or offered) is an exact non-empty string.
 * Empty, whitespace-only and non-string kinds are MALFORMED facts — they fail
 * closed as `INVALID_FACTS` and never take part in the Step-1 kind match
 * (neither as an empty match nor as a normal blocked classification).
 */
function isCapabilityKindString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCapabilityExchangeFacts(value: DacV0041CapabilityExchangeFacts): value is DacV0041CapabilityExchangeFacts {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<DacV0041CapabilityExchangeFacts>;
  if (typeof candidate.currentDescriptorEstablished !== 'boolean') return false;
  if (!Array.isArray(candidate.currentDescriptorOfferedCapabilityKinds)) return false;
  for (const offeredKind of candidate.currentDescriptorOfferedCapabilityKinds) {
    if (!isCapabilityKindString(offeredKind)) return false;
  }
  if (!isCapabilityKindString(candidate.requestedCapabilityKind)) return false;
  if (typeof candidate.requiredInputsStructurallyValid !== 'boolean') return false;
  if (typeof candidate.materialStaleness !== 'boolean') return false;
  const target = candidate.bindingTargetState;
  if (target === null || typeof target !== 'object') return false;
  if (target.presence === 'missing') return true;
  return target.presence === 'explicit' && target.declaredSupport === 'unsupported';
}

/**
 * Deterministic capability-kind/currentness precedence classifier
 * (ASSEMBLY_CAPABILITY_EXCHANGE §5 + v0.0.4.1 §13.1/§13.2; C84/C85/
 * C150-C153/C170/C171). Pure, total and fail-closed:
 *
 *   Step 0  no role-valid current exact descriptor        => FAIL_CLOSED
 *   Step 1  current descriptor lacks capability kind      =>
 *             blocked/missing-capability, target not judged (even when a
 *             pinned/reused input is also stale — C150/C170)
 *   Step 2  structural invalidity                         => FAIL_CLOSED
 *           (dominates coexisting staleness — C152/C153/C171)
 *           else material staleness                       => STALE (C85)
 *   Step 3  binding explicit target unsupported           => INCOMPATIBLE
 *   Step 4  otherwise                                     => evaluation phase
 *
 * The classifier reads only the externally supplied facts, never invents or
 * defaults one (`INVALID_FACTS` on a malformed facts object — including
 * empty/whitespace-only/non-string capability kinds), never consults
 * advisory hints, and never produces COMPATIBLE or any evaluation outcome.
 */
export function classifyDacV0041CapabilityExchange(
  facts: DacV0041CapabilityExchangeFacts,
): DacV0041CapabilityExchangeClassification {
  if (!isCapabilityExchangeFacts(facts)) {
    throw new DacV0041ReferenceError(
      'INVALID_FACTS',
      'capability-exchange facts are malformed; classification must use externally recoverable request/descriptor facts and never invents one',
    );
  }
  // Step 0 (§13.1): establish the current exact descriptor before any
  // capability-kind judgment; a stale/mutable/inferred/provider-default
  // descriptor yields no kind judgment at all.
  if (!facts.currentDescriptorEstablished) {
    return { phase: 'descriptor-establishment', disposition: 'FAIL_CLOSED' };
  }
  // Step 1 (§5): capability-kind absence blocks, target/profile is not
  // reached — even when the request also carries a syntactically valid
  // target or another stale input (C84/C150/C170).
  const offered = facts.currentDescriptorOfferedCapabilityKinds.indexOf(
    facts.requestedCapabilityKind,
  );
  if (offered === -1) {
    return { phase: 'capability-kind', outcome: 'blocked/missing-capability', targetNotJudged: true };
  }
  // Step 2 (§13.2): structural invalidity dominates coexisting staleness.
  if (!facts.requiredInputsStructurallyValid) {
    return { phase: 'exactness-currentness', disposition: 'FAIL_CLOSED' };
  }
  if (facts.materialStaleness) {
    return { phase: 'exactness-currentness', disposition: 'STALE' };
  }
  // Step 3 (§5): only now may a binding explicit target/profile be judged
  // unsupported. Advisory hints can never reach this judgment (they are not
  // representable in the facts' explicit-target slot).
  if (
    facts.bindingTargetState.presence === 'explicit' &&
    facts.bindingTargetState.declaredSupport === 'unsupported'
  ) {
    return { phase: 'target-support', disposition: 'INCOMPATIBLE' };
  }
  // Steps 0–3 passed: the owning seam may proceed to its capability
  // evaluation namespace. This foundation still produces no outcome.
  return { phase: 'evaluation' };
}

/**
 * Deterministic currentness-use classifier for carrying an artifact or
 * result forward (LIFECYCLE_REFERENCE_REPAIRS §7; C157): revoked/voided =>
 * FAIL_CLOSED (invalidated), stale/superseded => STALE, current => usable
 * for the owning seam's own further checks. Unknown states fail closed
 * (`INVALID_CURRENTNESS_STATE`) — currentness is never guessed.
 */
export function classifyDacV0041CurrentnessUse(
  state: DacV0041CurrentnessUseState,
): DacV0041CurrentnessUseClassification {
  if ((DAC_V0041_CURRENTNESS_USE_STATES as readonly string[]).indexOf(state) === -1) {
    throw new DacV0041ReferenceError(
      'INVALID_CURRENTNESS_STATE',
      `currentness state "${String(state)}" is not in the closed v0.0.4.1 vocabulary; undecidable currentness fails closed`,
    );
  }
  switch (state) {
    case 'current':
      return { state: 'current', usable: true };
    case 'stale':
    case 'superseded':
      return { state, disposition: 'STALE' };
    case 'revoked':
    case 'voided':
      return { state, disposition: 'FAIL_CLOSED' };
  }
}

/**
 * Outcome polarity lookup (ASSEMBLY_CAPABILITY_EXCHANGE §6; C156/C158):
 * only `produced-result` proves a substantive result exists, and even a
 * produced result may carry a negative decision — produced-result !=
 * favorable. `accepted-for-evaluation`, `pending/in-progress` and every
 * other class are never a decision/approval. Unknown classes fail closed
 * rather than being guessed favorable.
 */
export function dacV0041OutcomeProducesResult(
  outcome: DacV0041CapabilityOutcomeClass,
): boolean {
  const produces = (DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT as Record<string, boolean>)[
    outcome
  ];
  if (typeof produces !== 'boolean') {
    throw new DacV0041ReferenceError(
      'INVALID_FACTS',
      `outcome class "${String(outcome)}" is not in the frozen Authoring/Capability Exchange outcome namespace`,
    );
  }
  return produces;
}
