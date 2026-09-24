// Issue #328 / DAC v0.0.3 V3-004 core: adoption/validation of an immutable
// DAC v0.0.3 Application Manifest, plus the external association of the
// exact subject/target-bound compatibility validation result. See
// contracts.ts for the frozen authority boundaries. No function in this
// module promotes, selects, computes compatibility, binds or activates —
// those authorities stay with the upstream composition layer, the V3-002
// compatibility authority and the Runtime binding/activation lane. That
// absence is the enforcement mechanism for "Manifest is immutable
// composition metadata, not a fourth semantic pillar".
import { DAC_V003_BASELINE } from '../dac-v003/contracts.js';
import type { DacV003Reference } from '../dac-v003/contracts.js';
import { getDacV003ReferenceRole, isDacV003Reference } from '../dac-v003/guards.js';
import { isRuntimeInteractionContractRef } from '../dac-v003/guards.js';
import { DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION } from '../dac-v003-external/contracts.js';
import { isDacV003ExternalAuthorityRef } from '../dac-v003-external/guards.js';
import {
  dacV003TargetProfileKey,
  isDacV003CapabilityRequirementValue,
  isDacV003CompatibilityTargetRefValue,
  isDacV003CompatibilityValidationValue,
  isDacV003PortRequirementValue,
  isDacV003RequirementSatisfactionEvidenceValue,
  isDomainUXDefinitionRefValue,
} from '../dac-v003-compatibility/guards.js';
import type {
  DacV003CompatibilityValidation,
  DacV003RequirementSatisfactionEvidence,
} from '../dac-v003-compatibility/contracts.js';
import { isSelectedCompositionValidation } from '../composition-intake/validate.js';
import type { SelectedCompositionValidation } from '../composition-intake/contracts.js';
import { RUNTIME_ACTIVATION_ADAPTER_VERSION } from '../runtime-binding/contracts.js';
import { isRuntimeBindingEvidence } from '../runtime-binding/evidence.js';
import {
  DAC_V003_MANIFEST_ADAPTER_VERSION,
  DAC_V003_MANIFEST_CONTRACT_VERSION,
  DAC_V003_MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY,
  DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION,
  DacV003ManifestError,
  type DacV003ApplicationManifest,
  type DacV003ApplicationManifestAdoptionInput,
  type DacV003ApplicationManifestDigestOptions,
  type DacV003ApplicationManifestIdentity,
  type DacV003ManifestCompatibilityAssociation,
  type DacV003ManifestExternalAuthorityDecision,
  type DacV003ManifestExternalAuthorityDeclaration,
  type DacV003ManifestSelectedDomainDataEntry,
} from './contracts.js';
import {
  isMintedValidationAssociation,
  isMintedV003Manifest,
  isMutableAliasToken,
  isRecord,
  isV003ManifestIdentitySet,
  mintValidationAssociation,
  mintV003Manifest,
} from './registry.js';

const INSTANCE_STATE_FIELDS = new Set<string>(DAC_V003_MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY);

/**
 * Live external operation/reconciliation state roles (V3-003 family): a
 * manifest may declare external-authority IDENTITY on the APPLICABLE path,
 * but live operation/observation/reconciliation records are never manifest
 * content. Role names match the #323 registry vocabulary.
 */
const LIVE_EXTERNAL_STATE_ROLES = new Set([
  'logical-operation',
  'attempt',
  'provider-operation',
  'external-observation',
  'authoritative-effect-record',
  'idempotency-identity',
  'reconciliation',
  'correlation',
  'observation',
]);

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `manifest field "${field}" must be a non-empty string`,
    );
  }
  return value;
}

function requireExactImmutableIdentity(value: unknown, field: string): string {
  const identity = requireNonEmptyString(value, field);
  if (isMutableAliasToken(identity)) {
    throw new DacV003ManifestError(
      'MUTABLE_ALIAS_REJECTED',
      `manifest field "${field}" carries the mutable alias "${identity}"; an exact immutable identity is required and a locator/alias never substitutes it`,
    );
  }
  return identity;
}

function requireOpaqueRecord(value: unknown, field: string): Readonly<Record<string, unknown>> {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `manifest field "${field}" must be an object of unknown/provisional source fields`,
    );
  }
  return value;
}

/** Structural role test for a genuinely adopted v0.0.3 reference. */
function isAdoptedRoleRef(value: unknown, role: string): value is DacV003Reference {
  return isDacV003Reference(value) && getDacV003ReferenceRole(value) === role;
}

/**
 * Rejects the compatibility/lifecycle evidence families the manifest must
 * never absorb as definition content (R1 P2 / C38/N18):
 * V3-002 validation acts and result records (including their reference
 * forms), #306 verdicts, and Runtime binding/activation identity/evidence.
 * All of them stay separately-minted records referencing the exact manifest
 * identity/digest; absorbing them into the definition is fail-closed.
 */
function rejectEvidenceAbsorption(value: unknown, where: string): void {
  if (isDacV003CompatibilityValidationValue(value)) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: a V3-002 compatibility validation act was presented as manifest definition content; the validation result is only ever an associated external record, never a field inside the content its digest covers (R1 P2 self-reference rule)`,
    );
  }
  if (isRecord(value) && (value as { result?: unknown }).result === 'dac-v003-compatibility-result/1') {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: a V3-002 compatibility result record was presented as manifest definition content; the result view is only ever an associated external record, never manifest content`,
    );
  }
  if (isAdoptedRoleRef(value, 'compatibility-validation') || isAdoptedRoleRef(value, 'compatibility-result')) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: a "${getDacV003ReferenceRole(value)}" reference was presented as manifest definition content; compatibility validation identity belongs to the separate V3-002 authority and only ever associates externally`,
    );
  }
  if (isSelectedCompositionValidation(value)) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: a #306 composition-intake verdict was presented as manifest definition content; compatibility validation is a separate stage that consumes the manifest, never part of its definition`,
    );
  }
  if (isRuntimeBindingEvidence(value)) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: #307 runtime binding evidence was presented as manifest definition content; binding evidence stays separate from the Manifest definition and only references its identity/digest`,
    );
  }
  if (
    isRecord(value) &&
    (value as { activation?: unknown }).activation === RUNTIME_ACTIVATION_ADAPTER_VERSION
  ) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: #307 runtime activation evidence was presented as manifest definition content; activation evidence stays separate from the Manifest definition`,
    );
  }
  if (isAdoptedRoleRef(value, 'runtime-binding') || isAdoptedRoleRef(value, 'runtime-activation')) {
    throw new DacV003ManifestError(
      'MANIFEST_EVIDENCE_ABSORPTION',
      `${where}: a "${getDacV003ReferenceRole(value)}" DAC reference was presented as manifest definition content; binding/activation identity is minted at stages 4/5 after compatibility validation and never inside the Manifest definition`,
    );
  }
}

/**
 * Rejects live external operation/reconciliation state (V3-003 family):
 * #327 live role wrappers (detected through the adapter marker + embedded
 * reference role, covering reconciliation which has no dedicated guard) and
 * bare v0.0.3 references with a live-state role. A manifest on the APPLICABLE
 * path declares external-authority IDENTITY only.
 */
function rejectLiveExternalState(value: unknown, where: string): void {
  if (isRecord(value) && value.adapter === DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION) {
    const reference = (value as { reference?: unknown }).reference;
    const role = isDacV003Reference(reference) ? getDacV003ReferenceRole(reference) : undefined;
    if (role !== undefined && LIVE_EXTERNAL_STATE_ROLES.has(role)) {
      throw new DacV003ManifestError(
        'LIVE_EXTERNAL_STATE_ABSORPTION',
        `${where}: a live V3-003 "${role}" record was presented as manifest definition content; the Manifest carries external-authority identity declarations only, never live external operation/reconciliation state`,
      );
    }
  }
  if (isDacV003Reference(value)) {
    const role = getDacV003ReferenceRole(value);
    if (role !== undefined && LIVE_EXTERNAL_STATE_ROLES.has(role)) {
      throw new DacV003ManifestError(
        'LIVE_EXTERNAL_STATE_ABSORPTION',
        `${where}: a "${role}" reference was presented as manifest definition content; live external operation/reconciliation state is never manifest composition metadata`,
      );
    }
  }
}

/**
 * Rejects adapter-recognized live instance-state field names (N17 / DAC
 * §12) at every object depth of each opaque-preserved area. Exact-match
 * only, no heuristics: unrecognized fields can only ever remain inert
 * opaque content that no API reads back as state.
 */
function rejectInstanceStateLeakage(area: Readonly<Record<string, unknown>>, where: string): void {
  for (const key of Object.keys(area)) {
    if (INSTANCE_STATE_FIELDS.has(key)) {
      throw new DacV003ManifestError(
        'INSTANCE_STATE_LEAKAGE',
        `${where}: field "${key}" is live instance state; the Manifest definition must not absorb live Business/Process/Execution/UX instance facts at any depth`,
      );
    }
  }
}

/**
 * Screens one opaque-preserved value and everything nested under it for all
 * absorption classes. The canonical digest material preserves opaque content
 * verbatim at full depth, so the screen must walk the same full depth: the
 * root object/array itself, every nested object, every array element and
 * every nested value are checked (R1 P2 review repair — a forbidden record
 * buried under extra nesting must never reach the digest either). Cyclic
 * structures are unserializable digest material and fail closed through the
 * declared taxonomy instead of a native TypeError/stack overflow.
 *
 * The screen additionally enforces the declared "JSON-shaped" domain
 * (review repair R2 P1): every value must be a JSON scalar
 * (null/undefined/boolean/number/string), a plain object or an array. An
 * exotic object (Date/Map/class instance) or a function/symbol/bigint value
 * is either mutable behind `Object.freeze` or not canonically serializable,
 * so accepting it would leave caller-mutable references or a degraded
 * canonicalization inside digest-covered content.
 */
function rejectCyclicOpaque(where: string): never {
  throw new DacV003ManifestError(
    'INVALID_MANIFEST_INPUT',
    `${where}: opaque-preserved manifest content must be an acyclic JSON-shaped structure (an object/array graph that visits itself can never be canonical digest material)`,
  );
}

function rejectNonJsonOpaque(where: string): never {
  throw new DacV003ManifestError(
    'INVALID_MANIFEST_INPUT',
    `${where}: opaque-preserved manifest content must be JSON-shaped (only null/boolean/number/string scalars, plain objects and arrays can be deterministic digest material; exotic objects, functions, symbols and bigints fail closed)`,
  );
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/**
 * Tracks only the ACTIVE recursion path (review repair R2 P2): an entry is
 * removed again when its subtree finishes screening, so a structure seen
 * twice in SIBLING positions — an acyclic JSON-serializable shared object —
 * is legitimately screened at each position, and only a structure that
 * re-enters itself on its own current path (a true cycle) fails closed.
 */
function screenOpaqueValue(value: unknown, where: string, active: WeakSet<object>): void {
  rejectEvidenceAbsorption(value, where);
  rejectLiveExternalState(value, where);
  if (value === null) return;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    rejectNonJsonOpaque(where);
  }
  if (typeof value !== 'object') return;
  if (Array.isArray(value)) {
    if (active.has(value)) rejectCyclicOpaque(where);
    active.add(value);
    for (let index = 0; index < value.length; index += 1) {
      screenOpaqueValue(value[index], `${where}[${index}]`, active);
    }
    active.delete(value);
    return;
  }
  if (!isPlainRecord(value)) {
    rejectNonJsonOpaque(where);
  }
  if (active.has(value)) rejectCyclicOpaque(where);
  active.add(value);
  rejectInstanceStateLeakage(value, where);
  for (const key of Object.keys(value)) {
    screenOpaqueValue(value[key], `${where}.${key}`, active);
  }
  active.delete(value);
}

/** Screens one opaque-preserved area (root included) at every depth. */
function screenOpaqueArea(area: Readonly<Record<string, unknown>>, where: string): void {
  screenOpaqueValue(area, where, new WeakSet());
}

// ---------------------------------------------------------------------------
// Adoption-time detachment of caller-owned opaque content (review repair
// R2 P1). Authority-minted records (V3-001 references, V3-002 declarations,
// #327 wrappers) are immutable by their minting authority and are carried by
// exact reference; the opaque-preserved areas below are caller-owned, so
// every one of them is deterministically deep-copied and recursively frozen
// BEFORE it becomes adopted/digest-bound state.
// ---------------------------------------------------------------------------

/**
 * Defines one copied key with CreateDataProperty semantics (review repair
 * R3 P1): an own enumerable `"__proto__"` data key — exactly what
 * `JSON.parse('{"__proto__": …}')` produces — must survive adoption as an
 * own enumerable data property. Ordinary assignment would route that key
 * through the legacy `Object.prototype` `"__proto__"` accessor, mutating the
 * copy's prototype and silently dropping the key from the adopted content
 * and its canonical digest material.
 */
function defineOwnJsonDataProperty(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function frozenJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((element) => frozenJsonValue(element)));
  }
  if (typeof value === 'object' && value !== null && isPlainRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      defineOwnJsonDataProperty(copy, key, frozenJsonValue(value[key]));
    }
    return Object.freeze(copy);
  }
  return value;
}

/**
 * Deterministic deep copy of one screened opaque-preserved area, recursively
 * frozen. Every own enumerable string key is preserved exactly — including an
 * own `"__proto__"` data key from `JSON.parse`, which stays an own enumerable
 * data key on an unmodified plain-object prototype. Key order, array order and
 * the canonical JSON view of shared subtrees are preserved (an acyclic aliased
 * subtree appears at each of its positions, exactly as the canonical material
 * serializes it), so the copy is digest-identical to the input while being
 * fully detached from it: after adoption, mutating the caller's original
 * input can change neither the returned manifest content nor the content
 * behind its verified digest, and a forbidden record inserted into the
 * original after the one-time screen is never absorbed.
 */
function frozenJsonCopyOf(area: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(area)) {
    defineOwnJsonDataProperty(copy, key, frozenJsonValue(area[key]));
  }
  return Object.freeze(copy);
}

// ---------------------------------------------------------------------------
// Selected Domain Data closure (cardinality 1..n, effective promotion
// evidence, total ApplicationSelection coverage).
// ---------------------------------------------------------------------------

/** Identity-tuple coverage: `authority` covers `selected` exactly. */
function authorityCoversSelected(
  authority: DacV003Reference,
  selected: DacV003Reference,
): boolean {
  if (authority.semanticIdentity !== selected.semanticIdentity) return false;
  if (authority.revisionIdentity !== selected.revisionIdentity) return false;
  if (
    authority.contentDigest !== undefined &&
    selected.contentDigest !== undefined &&
    authority.contentDigest !== selected.contentDigest
  ) {
    return false;
  }
  return true;
}

function validateSelectedEntry(entry: unknown, index: number): DacV003ManifestSelectedDomainDataEntry {
  const where = `selectedDomainData[${index}]`;
  if (!isRecord(entry)) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `${where} must be an object carrying the exact selected v0.0.3 reference plus promotion-decision and application-selection provenance`,
    );
  }
  const { selected, promotionEvidence, applicationSelection } = entry;
  rejectEvidenceAbsorption(selected, `${where}.selected`);
  rejectEvidenceAbsorption(promotionEvidence, `${where}.promotionEvidence`);
  rejectEvidenceAbsorption(applicationSelection, `${where}.applicationSelection`);
  rejectLiveExternalState(selected, `${where}.selected`);
  rejectLiveExternalState(promotionEvidence, `${where}.promotionEvidence`);
  rejectLiveExternalState(applicationSelection, `${where}.applicationSelection`);

  if (!isAdoptedRoleRef(selected, 'selected-domain-data')) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `${where}.selected is not a genuinely adopted DAC v0.0.3 "selected-domain-data" reference; forged or foreign objects fail closed`,
    );
  }
  if (!isAdoptedRoleRef(promotionEvidence, 'promotion-decision')) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `${where}.promotionEvidence is not a genuinely adopted DAC v0.0.3 "promotion-decision" reference; promotion authority is upstream and never synthesized here`,
    );
  }
  if (!isAdoptedRoleRef(applicationSelection, 'application-selection')) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `${where}.applicationSelection is not a genuinely adopted DAC v0.0.3 "application-selection" reference; selection authority is upstream and never synthesized here`,
    );
  }

  // P3 floor enforced manifest-side: the selected reference carries the
  // exact semantic/revision/digest identity plus its lifecycle authority
  // refs (§4 P3), and the stated provenance objects are exactly the ones
  // bound in that closure (object identity — the stated entry and the
  // adopted closure can never diverge).
  for (const slot of ['semanticIdentity', 'revisionIdentity', 'contentDigest'] as const) {
    const value = selected[slot];
    if (typeof value !== 'string' || value.length === 0) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        `${where}.selected.${slot} must be present (P3 exactness for selected Domain Data: semantic, revision and content identities together)`,
      );
    }
  }
  const lifecycle = selected.lifecycleAuthorityRefs;
  const bound = (ref: DacV003Reference): boolean => lifecycle.some((candidate) => candidate === ref);
  if (!bound(promotionEvidence)) {
    throw new DacV003ManifestError(
      'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
      `${where}: the stated promotion-decision provenance is not the exact object bound in the selected reference's lifecycleAuthorityRefs; the manifest never restates a lifecycle authority the adopted P3 closure does not carry`,
    );
  }
  if (!bound(applicationSelection)) {
    throw new DacV003ManifestError(
      'SELECTED_LIFECYCLE_AUTHORITY_UNBOUND',
      `${where}: the stated application-selection provenance is not the exact object bound in the selected reference's lifecycleAuthorityRefs; the manifest never restates a lifecycle authority the adopted P3 closure does not carry`,
    );
  }

  // Effective upstream promotion evidence: the promotion decision must
  // cover the entry's exact semantic/revision identity (and digest when it
  // carries one) — promotion for a different revision is not effective for
  // this entry.
  if (!authorityCoversSelected(promotionEvidence, selected)) {
    throw new DacV003ManifestError(
      'SELECTED_PROMOTION_EVIDENCE_NOT_EFFECTIVE',
      `${where}: the promotion-decision evidence does not cover the selected entry's exact semantic/revision identity; effective upstream promotion evidence is mandatory per entry and is never defaulted`,
      [
        `selected=${selected.semanticIdentity}/${selected.revisionIdentity}`,
        `promotion=${promotionEvidence.semanticIdentity ?? '<none>'}/${promotionEvidence.revisionIdentity ?? '<none>'}`,
      ],
    );
  }
  // Total upstream ApplicationSelection coverage: every selected entry is
  // covered by an application-selection authority for its exact identity.
  if (!authorityCoversSelected(applicationSelection, selected)) {
    throw new DacV003ManifestError(
      'SELECTED_APPLICATION_SELECTION_COVERAGE_INCOMPLETE',
      `${where}: the application-selection evidence does not cover the selected entry's exact semantic/revision identity; total upstream ApplicationSelection coverage is mandatory and never defaulted`,
      [
        `selected=${selected.semanticIdentity}/${selected.revisionIdentity}`,
        `selection=${applicationSelection.semanticIdentity ?? '<none>'}/${applicationSelection.revisionIdentity ?? '<none>'}`,
      ],
    );
  }
  return Object.freeze({
    selected: selected as DacV003ManifestSelectedDomainDataEntry['selected'],
    promotionEvidence: promotionEvidence as DacV003ManifestSelectedDomainDataEntry['promotionEvidence'],
    applicationSelection: applicationSelection as DacV003ManifestSelectedDomainDataEntry['applicationSelection'],
  });
}

// ---------------------------------------------------------------------------
// Primary Runtime / UX / requirements / external-authority closures.
// ---------------------------------------------------------------------------

function validatePrimaryRuntime(value: unknown): DacV003ApplicationManifest['primaryRuntime'] {
  if (!isRecord(value)) {
    throw new DacV003ManifestError(
      'PRIMARY_RUNTIME_CARDINALITY',
      'manifest must declare exactly one primary runtime closure (one runtime contract + one explicit compatibility target); a missing/malformed declaration is never defaulted to an ambient runtime',
    );
  }
  rejectEvidenceAbsorption(value.runtimeContract, 'primaryRuntime.runtimeContract');
  rejectEvidenceAbsorption(value.compatibilityTarget, 'primaryRuntime.compatibilityTarget');
  rejectLiveExternalState(value.runtimeContract, 'primaryRuntime.runtimeContract');
  rejectLiveExternalState(value.compatibilityTarget, 'primaryRuntime.compatibilityTarget');
  if (!isAdoptedRoleRef(value.runtimeContract, 'runtime-contract')) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      'primaryRuntime.runtimeContract is not a genuinely adopted DAC v0.0.3 "runtime-contract" reference',
    );
  }
  const contract = value.runtimeContract as DacV003ApplicationManifest['primaryRuntime']['runtimeContract'];
  if (
    typeof contract.semanticIdentity !== 'string' ||
    contract.semanticIdentity.length === 0 ||
    typeof contract.revisionIdentity !== 'string' ||
    contract.revisionIdentity.length === 0
  ) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      'primaryRuntime.runtimeContract requires semanticIdentity and exact revisionIdentity (immutable/versioned contract; a floating "current" contract is never a primary declaration)',
    );
  }
  if (!isDacV003CompatibilityTargetRefValue(value.compatibilityTarget)) {
    throw new DacV003ManifestError(
      'PRIMARY_RUNTIME_CARDINALITY',
      'primaryRuntime.compatibilityTarget is not a genuine V3-002 DacV003CompatibilityTargetRef; exactly one explicit compatibility target is mandatory and never inferred from the environment',
    );
  }
  return Object.freeze({
    runtimeContract: contract,
    compatibilityTarget: value.compatibilityTarget,
  });
}

function validateUxClosure(value: unknown): DacV003ApplicationManifest['ux'] {
  if (!isRecord(value)) {
    throw new DacV003ManifestError(
      'UX_CLOSURE_CARDINALITY',
      'the supported composition requires exactly one DomainUXDefinitionRef and exactly one RuntimeInteractionContractRef; a missing/malformed UX closure is never defaulted',
    );
  }
  rejectEvidenceAbsorption(value.domainUxDefinition, 'ux.domainUxDefinition');
  rejectEvidenceAbsorption(value.runtimeInteractionContract, 'ux.runtimeInteractionContract');
  if (!isDomainUXDefinitionRefValue(value.domainUxDefinition)) {
    throw new DacV003ManifestError(
      'UX_CLOSURE_CARDINALITY',
      'ux.domainUxDefinition is not a genuine V3-002 DomainUXDefinitionRef (immutable/versioned semantic UX contract; renderer/presentation identity is never the UX definition)',
    );
  }
  if (!isRuntimeInteractionContractRef(value.runtimeInteractionContract)) {
    throw new DacV003ManifestError(
      'UX_CLOSURE_CARDINALITY',
      'ux.runtimeInteractionContract is not a genuine V3-001 RuntimeInteractionContractRef (semantic UX↔Runtime interaction contract; not a renderer contract)',
    );
  }
  const definition = value.domainUxDefinition;
  const interaction = value.runtimeInteractionContract;
  if (
    definition.authorityScope === interaction.authorityScope &&
    definition.semanticIdentity === interaction.semanticIdentity &&
    definition.revisionIdentity === interaction.revisionIdentity
  ) {
    throw new DacV003ManifestError(
      'UX_CLOSURE_CARDINALITY',
      'ux.domainUxDefinition and ux.runtimeInteractionContract share one identity tuple; the Domain UX definition and the Runtime interaction contract are separately referrable semantic roles and never collapse',
    );
  }
  return Object.freeze({ domainUxDefinition: definition, runtimeInteractionContract: interaction });
}

/**
 * Optional array input check (review repair P2-1): the shape is verified
 * BEFORE any spread/iteration, so a malformed input (a string that would be
 * split into characters, a non-iterable that would throw a native TypeError)
 * fails closed through the declared taxonomy instead of a native error path.
 */
function requireOptionalArray<T>(
  value: readonly T[] | undefined | null,
  name: string,
): readonly T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      `manifest field "${name}" must be an array`,
    );
  }
  return value as readonly T[];
}

function validateRequirements(input: DacV003ApplicationManifestAdoptionInput): {
  requirements: DacV003ApplicationManifest['requirements'];
  satisfactionEvidenceRefs: readonly DacV003RequirementSatisfactionEvidence[];
} {
  const capability = [...requireOptionalArray(input.capabilityRequirements, 'capabilityRequirements')];
  const port = [...requireOptionalArray(input.portRequirements, 'portRequirements')];
  const hostBinding = [
    ...requireOptionalArray(input.hostBindingRequirements, 'hostBindingRequirements'),
  ];
  const evidence = [...requireOptionalArray(input.satisfactionEvidence, 'satisfactionEvidence')];
  for (const requirement of capability) {
    if (!isDacV003CapabilityRequirementValue(requirement)) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        'capabilityRequirements contains a descriptor not genuinely minted by the V3-002 compatibility authority',
      );
    }
    rejectLiveExternalState(requirement, 'capabilityRequirements[]');
  }
  for (const requirement of port) {
    if (!isDacV003PortRequirementValue(requirement)) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        'portRequirements contains a descriptor not genuinely minted by the V3-002 compatibility authority',
      );
    }
    rejectLiveExternalState(requirement, 'portRequirements[]');
  }
  for (const requirement of hostBinding) {
    if (!isAdoptedRoleRef(requirement, 'runtime-host-binding-requirement')) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        'hostBindingRequirements contains a reference that is not a genuinely adopted V3-001 RuntimeHostBindingRequirementRef (a requirement declaration, never concrete binding evidence)',
      );
    }
    rejectLiveExternalState(requirement, 'hostBindingRequirements[]');
  }
  for (const item of evidence) {
    if (!isDacV003RequirementSatisfactionEvidenceValue(item)) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        'satisfactionEvidence contains a record not genuinely minted by the V3-002 compatibility authority',
      );
    }
    rejectLiveExternalState(item, 'satisfactionEvidence[]');
  }

  // Manifest-side closure: every referenced evidence links a requirement
  // THIS manifest declares (identity + role). Whether a requirement is
  // actually SATISFIED is the V3-002 authority's evaluation — never decided
  // here.
  const declaredRequirementKeys = new Set<string>();
  for (const requirement of [
    ...capability.map((r) => r.reference),
    ...port.map((r) => r.reference),
    ...hostBinding,
  ]) {
    declaredRequirementKeys.add(`${requirement.role}\u0000${requirement.primaryIdentity}`);
  }
  for (const item of evidence) {
    const key = `${item.requirement.role}\u0000${item.requirement.primaryIdentity}`;
    if (!declaredRequirementKeys.has(key)) {
      throw new DacV003ManifestError(
        'REQUIREMENT_EVIDENCE_FOREIGN',
        'a satisfaction-evidence reference links a requirement this manifest does not declare; the manifest carries exact references for its own declared requirements only',
        [`evidence=${item.reference.primaryIdentity}`, `links=${item.requirement.primaryIdentity}`],
      );
    }
  }
  const requirements = Object.freeze({
    capability: Object.freeze(capability),
    port: Object.freeze(port),
    hostBinding: Object.freeze(hostBinding),
  });
  return { requirements, satisfactionEvidenceRefs: Object.freeze(evidence) };
}

function validateExternalAuthorityPath(value: unknown): DacV003ManifestExternalAuthorityDecision {
  if (!isRecord(value)) {
    throw new DacV003ManifestError(
      'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
      'the manifest must record the external-authority applicability decision explicitly (APPLICABLE with declarations, or NOT_APPLICABLE with applicability evidence); an absent/malformed decision is never guessed',
    );
  }
  if (value.applicability === 'NOT_APPLICABLE') {
    const applicabilityEvidence = value.applicabilityEvidence;
    if (typeof applicabilityEvidence !== 'string' || applicabilityEvidence.trim().length === 0) {
      throw new DacV003ManifestError(
        'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
        'a NOT_APPLICABLE external-authority decision must record non-empty applicability evidence stating why the supported Manifest path requires no external-authority declarations',
      );
    }
    return Object.freeze({ applicability: 'NOT_APPLICABLE', applicabilityEvidence });
  }
  if (value.applicability !== 'APPLICABLE') {
    throw new DacV003ManifestError(
      'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
      `externalAuthority.applicability must be "APPLICABLE" or "NOT_APPLICABLE"; got "${String(value.applicability)}"`,
    );
  }
  const declarationsInput = value.declarations;
  if (!Array.isArray(declarationsInput) || declarationsInput.length === 0) {
    throw new DacV003ManifestError(
      'EXTERNAL_AUTHORITY_APPLICABILITY_UNDECIDED',
      'an APPLICABLE external-authority decision must carry at least one declaration; a materially-applicable path with zero declarations is an undecided applicability, not an applicable one',
    );
  }
  const declarations = declarationsInput.map((declaration: unknown, index: number) => {
    const where = `externalAuthority.declarations[${index}]`;
    if (!isRecord(declaration)) {
      throw new DacV003ManifestError(
        'INVALID_MANIFEST_INPUT',
        `${where} must be an object (external-authority declaration)`,
      );
    }
    const authority = declaration.authority;
    if (!isDacV003ExternalAuthorityRef(authority)) {
      throw new DacV003ManifestError(
        'EXTERNAL_IDENTITY_SUBSTITUTION',
        `${where}.authority is not a DacV003ExternalAuthorityRef genuinely adopted by the V3-003 external-operation surface; a provider URL/locator alone is not an authority contract and no Runtime identity can substitute external Business SoR identity`,
      );
    }
    const capabilityRequirements = requireOpaqueRecord(
      declaration.capabilityRequirements,
      `${where}.capabilityRequirements`,
    );
    const opaque = requireOpaqueRecord(declaration.opaque, `${where}.opaque`);
    screenOpaqueArea(capabilityRequirements, `${where}.capabilityRequirements`);
    screenOpaqueArea(opaque, `${where}.opaque`);
    const adopted: DacV003ManifestExternalAuthorityDeclaration = {
      authority,
      capabilityRequirements: frozenJsonCopyOf(capabilityRequirements),
      opaque: frozenJsonCopyOf(opaque),
    };
    return Object.freeze(adopted);
  });
  return Object.freeze({ applicability: 'APPLICABLE', declarations: Object.freeze(declarations) });
}

// ---------------------------------------------------------------------------
// Canonical content digest.
// ---------------------------------------------------------------------------

/**
 * Canonical manifest material: the exact adopted content in THIS adapter's
 * deterministic projection (fixed key order). The digest over this material
 * is the manifest content identity, so any change to identities, entries,
 * primary runtime, UX closure, requirements, evidence references,
 * applicability decision, provenance or opaque content produces a different
 * digest — and the same immutable manifest identity resolving to a different
 * authoritative digest fails closed (DAC §3).
 *
 * The material structurally contains NO compatibility validation/result
 * field (R1 P2): the adopted record has no such slot, so the digest can
 * never cover the result that validates it. This canonicalization is
 * revision-bound to {@link DAC_V003_MANIFEST_ADAPTER_VERSION}; it is NOT a
 * DAC wire freeze (L2 A2 §7.3).
 */
function canonicalManifestMaterial(
  manifest: Omit<DacV003ApplicationManifest, 'manifestContentDigest'>,
): string {
  return JSON.stringify({
    authority: 'domain-harness/dac-v003-manifest',
    adapter: DAC_V003_MANIFEST_ADAPTER_VERSION,
    contractVersion: DAC_V003_MANIFEST_CONTRACT_VERSION,
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    selectedDomainData: manifest.selectedDomainData,
    primaryRuntime: {
      runtimeContract: manifest.primaryRuntime.runtimeContract,
      compatibilityTarget: manifest.primaryRuntime.compatibilityTarget,
    },
    ux: {
      domainUxDefinition: manifest.ux.domainUxDefinition,
      runtimeInteractionContract: manifest.ux.runtimeInteractionContract,
    },
    requirements: manifest.requirements,
    satisfactionEvidenceRefs: manifest.satisfactionEvidenceRefs,
    externalAuthority: manifest.externalAuthority,
    compositionProvenance: manifest.compositionProvenance,
    opaque: manifest.opaque,
  });
}

/**
 * Validates and canonicalizes an adoption input into the frozen manifest
 * record shape (without the digest comparison). Shared by
 * `computeDacV003ApplicationManifestDigest` and
 * `adoptDacV003ApplicationManifest`.
 */
async function materializeManifest(input: unknown): Promise<{
  material: string;
  record: Omit<DacV003ApplicationManifest, 'manifestContentDigest'>;
}> {
  if (!isRecord(input)) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      'manifest adoption input must be an object',
    );
  }
  const { baseline } = input;
  if (
    !isRecord(baseline) ||
    baseline.contract !== DAC_V003_BASELINE.contract ||
    baseline.version !== DAC_V003_BASELINE.version ||
    baseline.semanticFreezeCommit !== DAC_V003_BASELINE.semanticFreezeCommit ||
    baseline.semanticFreezeTree !== DAC_V003_BASELINE.semanticFreezeTree
  ) {
    throw new DacV003ManifestError(
      'UNSUPPORTED_MANIFEST_BASELINE',
      `manifest baseline must be exactly ${DAC_V003_BASELINE.contract}@${DAC_V003_BASELINE.version} semantic freeze commit ${DAC_V003_BASELINE.semanticFreezeCommit} / tree ${DAC_V003_BASELINE.semanticFreezeTree} (the single frozen DAC v0.0.3 baseline; no parallel manifest identity authority is forked)`,
    );
  }
  if (input.contractVersion !== DAC_V003_MANIFEST_CONTRACT_VERSION) {
    throw new DacV003ManifestError(
      'UNSUPPORTED_MANIFEST_CONTRACT_VERSION',
      `manifest contractVersion must be exactly "${DAC_V003_MANIFEST_CONTRACT_VERSION}"; got "${String(input.contractVersion)}"`,
    );
  }

  const applicationSemanticIdentity = requireNonEmptyString(
    input.applicationSemanticIdentity,
    'applicationSemanticIdentity',
  );
  const applicationRevisionIdentity = requireExactImmutableIdentity(
    input.applicationRevisionIdentity,
    'applicationRevisionIdentity',
  );
  const manifestIdentity = requireExactImmutableIdentity(input.manifestIdentity, 'manifestIdentity');

  if (!Array.isArray(input.selectedDomainData) || input.selectedDomainData.length === 0) {
    throw new DacV003ManifestError(
      'SELECTED_DATA_CARDINALITY_ZERO',
      'manifest must carry at least one authoritative selected Domain Data entry; a manifest that selects nothing cannot be composed and is never defaulted',
    );
  }
  const selectedDomainData = input.selectedDomainData.map(
    (entry: unknown, index: number) => validateSelectedEntry(entry, index),
  );

  const primaryRuntime = validatePrimaryRuntime(input.primaryRuntime);
  const ux = validateUxClosure(input.ux);
  const { requirements, satisfactionEvidenceRefs } = validateRequirements(
    input as unknown as DacV003ApplicationManifestAdoptionInput,
  );
  const externalAuthority = validateExternalAuthorityPath(input.externalAuthority);

  const compositionProvenance = requireOpaqueRecord(input.compositionProvenance, 'compositionProvenance');
  screenOpaqueArea(compositionProvenance, 'compositionProvenance');
  const opaque = requireOpaqueRecord(input.opaque, 'opaque');
  screenOpaqueArea(opaque, 'opaque');

  const record: Omit<DacV003ApplicationManifest, 'manifestContentDigest'> = {
    adapter: DAC_V003_MANIFEST_ADAPTER_VERSION,
    baseline: DAC_V003_BASELINE,
    contractVersion: DAC_V003_MANIFEST_CONTRACT_VERSION,
    applicationSemanticIdentity,
    applicationRevisionIdentity,
    manifestIdentity,
    selectedDomainData: Object.freeze([...selectedDomainData]),
    primaryRuntime,
    ux,
    requirements,
    satisfactionEvidenceRefs,
    externalAuthority,
    compositionProvenance: frozenJsonCopyOf(compositionProvenance),
    opaque: frozenJsonCopyOf(opaque),
  };
  return { material: canonicalManifestMaterial(record), record };
}

function requireDigestOptions(options: unknown): DacV003ApplicationManifestDigestOptions {
  if (
    !isRecord(options) ||
    !isRecord(options.sha256) ||
    typeof options.sha256.digestUtf8 !== 'function'
  ) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      'options must declare a sha256 port (digestUtf8) for exact manifest content identity derivation',
    );
  }
  return options as unknown as DacV003ApplicationManifestDigestOptions;
}

/**
 * Computes the canonical v0.0.3 manifest content digest for an adoption
 * input (validating its shape fail-closed first). Hosts use this to derive
 * the `manifestContentDigest` they declare when presenting a manifest.
 */
export async function computeDacV003ApplicationManifestDigest(
  input: DacV003ApplicationManifestAdoptionInput,
  options: DacV003ApplicationManifestDigestOptions,
): Promise<string> {
  requireDigestOptions(options);
  const { material } = await materializeManifest(input);
  return options.sha256.digestUtf8(material);
}

/**
 * Manifest identity → verified digest registry. The same immutable
 * `manifestIdentity` later resolving to a different authoritative digest is
 * the DAC §3 integrity violation and fails closed. This is a
 * conflict-detection registry only — it stores no live instance/process
 * state and confers no authority.
 */
const VERIFIED_DIGEST_BY_MANIFEST_IDENTITY = new Map<string, string>();

/**
 * Adopts a DAC v0.0.3 Application Manifest as immutable composition
 * metadata: validates every declared identity/reference/declaration/
 * applicability decision fail-closed, verifies the declared content digest
 * against the canonical digest of the presented content, rejects the same
 * manifest identity resolving to a different digest, and returns the deeply
 * frozen adopted record. Adoption never promotes, selects, computes
 * compatibility, binds or activates, and the record it returns structurally
 * has no slot for a validation result, binding, activation or live state.
 */
export async function adoptDacV003ApplicationManifest(
  input: DacV003ApplicationManifestAdoptionInput,
  options: DacV003ApplicationManifestDigestOptions,
): Promise<DacV003ApplicationManifest> {
  requireDigestOptions(options);
  const declaredDigest =
    isRecord(input) && typeof input.manifestContentDigest === 'string'
      ? input.manifestContentDigest
      : undefined;
  if (declaredDigest === undefined || declaredDigest.length === 0) {
    throw new DacV003ManifestError(
      'INVALID_MANIFEST_INPUT',
      'manifest field "manifestContentDigest" must be a non-empty string; compute it with computeDacV003ApplicationManifestDigest and present content and digest together',
    );
  }
  const { material, record } = await materializeManifest(input);
  const canonicalDigest = await options.sha256.digestUtf8(material);
  if (canonicalDigest !== declaredDigest) {
    throw new DacV003ManifestError(
      'MANIFEST_DIGEST_MISMATCH',
      'the declared manifest content digest does not match the canonical digest of the presented content; manifest content and declared digest must be adopted together exactly',
      [`declared=${declaredDigest}`, `canonical=${canonicalDigest}`],
    );
  }
  const knownDigest = VERIFIED_DIGEST_BY_MANIFEST_IDENTITY.get(record.manifestIdentity);
  if (knownDigest !== undefined && knownDigest !== canonicalDigest) {
    throw new DacV003ManifestError(
      'MANIFEST_IDENTITY_DIGEST_CONFLICT',
      `the immutable manifest identity "${record.manifestIdentity}" was already adopted under authoritative digest "${knownDigest}" and now resolves to "${canonicalDigest}"; the same ManifestIdentity resolving to different authoritative content digests fails closed`,
      [`identity=${record.manifestIdentity}`, `first=${knownDigest}`, `second=${canonicalDigest}`],
    );
  }
  VERIFIED_DIGEST_BY_MANIFEST_IDENTITY.set(record.manifestIdentity, canonicalDigest);

  return mintV003Manifest(
    Object.freeze({
      ...record,
      manifestContentDigest: canonicalDigest,
    }) as DacV003ApplicationManifest,
  );
}

/** True only for manifests actually adopted by `adoptDacV003ApplicationManifest`. */
export function isDacV003ApplicationManifest(value: unknown): value is DacV003ApplicationManifest {
  if (!isMintedV003Manifest(value)) return false;
  const candidate = value as Partial<DacV003ApplicationManifest>;
  return (
    candidate.adapter === DAC_V003_MANIFEST_ADAPTER_VERSION &&
    candidate.contractVersion === DAC_V003_MANIFEST_CONTRACT_VERSION &&
    typeof candidate.manifestIdentity === 'string' &&
    candidate.manifestIdentity.length > 0 &&
    typeof candidate.manifestContentDigest === 'string' &&
    candidate.manifestContentDigest.length > 0 &&
    Array.isArray(candidate.selectedDomainData) &&
    candidate.selectedDomainData.length > 0
  );
}

/** Projects the carried identity set of an adopted manifest (frozen copy). */
export function dacV003ManifestIdentityOf(
  manifest: DacV003ApplicationManifest,
): DacV003ApplicationManifestIdentity {
  if (!isDacV003ApplicationManifest(manifest)) {
    throw new DacV003ManifestError(
      'NOT_AN_ADOPTED_V003_MANIFEST',
      'identity projection requires a manifest actually adopted by the DAC v0.0.3 manifest adapter',
    );
  }
  return Object.freeze({
    applicationSemanticIdentity: manifest.applicationSemanticIdentity,
    applicationRevisionIdentity: manifest.applicationRevisionIdentity,
    manifestIdentity: manifest.manifestIdentity,
    manifestContentDigest: manifest.manifestContentDigest,
  });
}

// ---------------------------------------------------------------------------
// External association of the exact compatibility validation result (R1 P2).
// ---------------------------------------------------------------------------

/** Identity-tuple equality for the UX/authority comparisons below. */
function sameTuple(
  left: { readonly authorityScope: string; readonly semanticIdentity: string; readonly revisionIdentity: string },
  right: { readonly authorityScope: string; readonly semanticIdentity: string; readonly revisionIdentity: string },
): boolean {
  return (
    left.authorityScope === right.authorityScope &&
    left.semanticIdentity === right.semanticIdentity &&
    left.revisionIdentity === right.revisionIdentity
  );
}

/**
 * Complete-identity comparison between one #306 verdict closure (selected
 * ref + promotion/selection provenance) and one manifest selected entry.
 * The legacy #306 refs carry role/authorityScope/semanticIdentity/
 * revisionIdentity/contentDigest (no primaryIdentity slot), so that five-slot
 * identity IS the complete comparable identity across the two shapes: an
 * authority sharing only semantic/revision — a different scope, or a
 * different/absent content digest — is a foreign authority and never covers
 * the entry (review repair P1-2).
 */
function verdictCoversSelectedEntry(
  verdict: SelectedCompositionValidation,
  entry: DacV003ManifestSelectedDomainDataEntry,
): boolean {
  const legacyRefCoversEntry = (
    authority: {
      readonly role: string;
      readonly authorityScope: string;
      readonly semanticIdentity: string;
      readonly revisionIdentity?: string;
      readonly contentDigest?: string;
    },
    selected: DacV003Reference,
  ): boolean =>
    selected.role === authority.role &&
    selected.authorityScope === authority.authorityScope &&
    selected.semanticIdentity === authority.semanticIdentity &&
    selected.revisionIdentity === authority.revisionIdentity &&
    selected.contentDigest === authority.contentDigest;
  return (
    legacyRefCoversEntry(verdict.selectedDomainData, entry.selected) &&
    legacyRefCoversEntry(verdict.provenance.promotionDecision, entry.promotionEvidence) &&
    legacyRefCoversEntry(verdict.provenance.applicationSelection, entry.applicationSelection)
  );
}

/**
 * Associates the exact subject/target-bound compatibility validation result
 * of one adopted manifest as a SEPARATE external record (R1 P2). The
 * validation must be a genuine V3-002 mint evaluated over exactly this
 * manifest's declared closure:
 *
 *  - its explicit target profile equals this manifest's compatibility
 *    target key;
 *  - its UX closure tuples equal this manifest's UX definition/interaction
 *    contract tuples;
 *  - its requirement closure covers exactly this manifest's declared
 *    requirement identities;
 *  - every evidence identity it recorded as satisfying is one of this
 *    manifest's carried satisfaction-evidence references;
 *  - its upstream #306 verdict covers EVERY selected entry of this
 *    manifest by complete role/scope/semantic/revision/digest identity —
 *    authoritative validation coverage binds the entire selected Domain
 *    Data set, never only one entry;
 *
 * The returned record is NOT manifest content, is NOT covered by the
 * manifest content digest, and the disposition is the authority's
 * pass-through — this module never computes or alters one.
 */
export function associateDacV003ManifestCompatibilityValidation(
  manifest: DacV003ApplicationManifest,
  validation: DacV003CompatibilityValidation,
): DacV003ManifestCompatibilityAssociation {
  if (!isDacV003ApplicationManifest(manifest)) {
    throw new DacV003ManifestError(
      'NOT_AN_ADOPTED_V003_MANIFEST',
      'validation association requires a manifest actually adopted by the DAC v0.0.3 manifest adapter',
    );
  }
  if (!isDacV003CompatibilityValidationValue(validation)) {
    throw new DacV003ManifestError(
      'INVALID_ASSOCIATION_INPUT',
      'validation association requires a compatibility validation actually minted by the V3-002 compatibility authority; a forged lookalike or a bare reference can never stand in for the exact result',
    );
  }

  const mismatch = (reason: string): DacV003ManifestError =>
    new DacV003ManifestError(
      'ASSOCIATION_SUBJECT_MISMATCH',
      `the validation was not evaluated over this manifest's exact declared closure: ${reason}; an association references only the exact subject/target it was derived from`,
      [reason],
    );

  // Exact explicit target binding.
  const manifestTargetKey = dacV003TargetProfileKey(manifest.primaryRuntime.compatibilityTarget);
  if (validation.subject.targetProfile !== manifestTargetKey) {
    throw mismatch(
      `validation target profile "${String(validation.subject.targetProfile)}" != manifest compatibility target key "${manifestTargetKey}"`,
    );
  }

  // Exact UX closure binding.
  if (!sameTuple(validation.ux.domainUxDefinition, manifest.ux.domainUxDefinition)) {
    throw mismatch('validation UX definition tuple differs from the manifest UX definition');
  }
  if (
    !sameTuple(validation.ux.runtimeInteractionContract, manifest.ux.runtimeInteractionContract)
  ) {
    throw mismatch(
      'validation interaction-contract tuple differs from the manifest interaction contract',
    );
  }

  // Exact requirement-closure binding: the validation must have evaluated
  // exactly this manifest's declared requirements, and every satisfying
  // evidence identity must be one this manifest carries.
  const declaredRequirementIdentities = new Set<string>(
    [
      ...manifest.requirements.capability.map((r) => r.reference.primaryIdentity),
      ...manifest.requirements.port.map((r) => r.reference.primaryIdentity),
      ...manifest.requirements.hostBinding.map((r) => r.primaryIdentity),
    ],
  );
  const closureIdentities = new Set<string>(
    validation.requirementClosure.map((entry) => entry.requirementIdentity),
  );
  if (
    declaredRequirementIdentities.size !== closureIdentities.size ||
    [...declaredRequirementIdentities].some((identity) => !closureIdentities.has(identity))
  ) {
    throw mismatch('validation requirement closure differs from the declared requirement set');
  }
  const carriedEvidenceIdentities = new Set<string>(
    manifest.satisfactionEvidenceRefs.map((evidence) => evidence.reference.primaryIdentity),
  );
  for (const entry of validation.requirementClosure) {
    for (const evidenceIdentity of entry.satisfiedBy) {
      if (!carriedEvidenceIdentities.has(evidenceIdentity)) {
        throw mismatch(
          `validation recorded satisfying evidence "${evidenceIdentity}" the manifest does not carry`,
        );
      }
    }
  }

  // Exact upstream selected-set binding (review repair P1-2): the #306
  // verdict the validation consumed must cover EVERY selected entry of this
  // manifest by complete role/scope/semantic/revision/digest identity —
  // authoritative validation coverage binds the entire selected Domain Data
  // set, never `some` one entry. With the V3-002 single-verdict subject this
  // means every entry must carry the verdict's exact closure; a manifest
  // entry the verdict never evaluated stays unvalidated and the association
  // fails closed.
  const verdict = validation.subject.upstreamSelectionValidation;
  for (const [index, entry] of manifest.selectedDomainData.entries()) {
    if (!verdictCoversSelectedEntry(verdict, entry)) {
      throw mismatch(
        `selected entry [${index}] (${entry.selected.primaryIdentity}) is not covered by the validation's upstream selection verdict by complete role/scope/semantic/revision/digest identity; authoritative validation coverage must bind the entire selected Domain Data set, not some one entry`,
      );
    }
  }

  return mintValidationAssociation(
    Object.freeze({
      manifestValidationAssociation: DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION,
      manifestIdentity: dacV003ManifestIdentityOf(manifest),
      validationRef: validation.validationRef,
      resultRef: validation.resultRef,
      authority: Object.freeze({
        authorityScope: validation.subject.authorityScope,
        validationIdentity: validation.subject.validationIdentity,
      }),
      disposition: validation.disposition,
      targetProfile: validation.subject.targetProfile,
    }),
  );
}

/** True only for associations actually minted by this module. */
export function isDacV003ManifestCompatibilityAssociation(
  value: unknown,
): value is DacV003ManifestCompatibilityAssociation {
  if (!isMintedValidationAssociation(value)) return false;
  const candidate = value as Partial<DacV003ManifestCompatibilityAssociation>;
  return (
    candidate.manifestValidationAssociation ===
      DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION &&
    isV003ManifestIdentitySet(candidate.manifestIdentity) &&
    candidate.validationRef !== undefined &&
    candidate.resultRef !== undefined &&
    candidate.authority !== undefined &&
    candidate.disposition !== undefined
  );
}
