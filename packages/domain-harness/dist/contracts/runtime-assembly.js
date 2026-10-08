/**
 * v0.7 sealed Runtime Assembly core contract (issue #587, fine-grained DAG
 * T002B; closes #568 and #575 by implementation + review).
 *
 * This module is the Microkernel seam between the frozen Definition plane
 * (Component/Definition identity, T001A-T001C) and trusted closed-world Kind
 * implementation handles. It owns exactly the concerns #587 assigns to T002B:
 *
 * - a content-addressed, serializable RuntimeAssemblyRecord: the exact
 *   Definition graph digest, the exact KindImplementation pins, the canonical
 *   #568 logical resource requirement material, and generic §G
 *   implementation-binding evidence slots;
 * - the exact KindImplementationPin identity (kind + implementation
 *   id/version/digest). Module paths, provider paths, function source text
 *   and live handles are NEVER digest material;
 * - `sealRuntimeAssembly`, the authority boundary that validates and
 *   synchronously snapshots every authority-bearing input, derives the
 *   low-level admission declarations from the SEALED bindings, and mints
 *   opaque/frozen sealed bindings paired with their exact pins;
 * - `admitComponentWithAssembly`, the Assembly-bound admission path that
 *   consumes the sealed binding (never a caller-supplied validator), proves
 *   Definition currentness by authoritative recomputation, and mints frozen,
 *   non-aliasing AssemblyBoundComponentAdmission evidence.
 *
 * Deliberately absent (successor-owned, per #587): activation/execution pins
 * (T002C), PRODUCTION|SIMULATION authority class enforcement (T002D), Tool
 * provider selection/implementation binding semantics (T003C — this module
 * provides only the generic content-addressed evidence container), resource
 * resolution (T005B), resource instance pins (T005C), and any public barrel
 * exposure (T001E/#570). A sealed Assembly carries identity and admission
 * provenance only — ASSEMBLY_SEALED=YES, ACTIVATION_AUTHORITY=NO,
 * DURABLE_EFFECT_AUTHORITY=NO.
 *
 * Boundary discipline: validation consumes the shared descriptor-safe record
 * primitive and unified exact-reference authority of `record-safety.ts`
 * (#557 + #578), the #573 frozen Kind-compatibility decision, the #556
 * low-level `admitComponent` decision helper, the T005A declaration
 * validator, and the #555 repaired Definition graph digest — all imported,
 * never reimplemented. No global Kind catalog or registry exists here, and
 * no concrete Workflow/XState/ToolRegistry/storage/provider import is
 * permitted in this file.
 *
 * Torn-snapshot discipline (#587 §E, same as #555): every authority-bearing
 * caller input is descriptor-safe validated and snapshotted synchronously
 * before the first `await`; after any suspension only module-owned snapshot
 * material is read, so a caller mutating its own graph, pins or declarations
 * while a digest promise is pending can never produce torn or hybrid
 * Assembly evidence.
 */
import { validateComponentEnvelope, } from './component.js';
import { admitComponent, } from './component-admission.js';
import { computeDefinitionGraphDigest, validateDefinitionGraphEnvelope, } from './definition-graph.js';
import { decideKindCompatibility, KindCompatibilityError, } from './kind-compatibility.js';
import { computeCanonicalJsonDigest, isContentDigest, } from './identity.js';
import { validateToolResourceRequirements, } from './resource-requirements.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, carriesXRangeVersionSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
/**
 * Versioned Runtime Assembly digest domain tag, owned exclusively by this
 * file. Sibling to, and never borrowed by, the T001B/T001C digest domains:
 * any future change to the material shape is a NEW domain tag; historical
 * Assembly identities never change retroactively.
 */
export const RUNTIME_ASSEMBLY_DIGEST_DOMAIN = 'kaicreator.runtime-assembly.digest.v1';
export class RuntimeAssemblyError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'RuntimeAssemblyError';
        this.code = code;
    }
}
/**
 * Private anti-forgery brand. The `unique symbol` computed key is not
 * exported, so no external code can construct a value satisfying
 * `SealedRuntimeAssembly`; `admitComponentWithAssembly` verifies the brand
 * before any authority use, closing the #575 raw-validator minting path.
 */
const SEALED_ASSEMBLY_BRAND = Symbol('kaicreator.runtime-assembly.sealed');
/**
 * Module-private minting registry: the authoritative anti-forgery check. A
 * property-style brand alone is bypassable — it is readable through the
 * prototype chain (Object.create forgery) and the symbol is reflectively
 * extractable from any self-sealed assembly (getOwnPropertySymbols theft),
 * and the record/digest an attacker pairs with it are public serializable
 * identity material by design (#587 §A). WeakSet membership is neither
 * inheritable, reflectively extractable, nor reproducible from public
 * material: only `sealRuntimeAssembly` can mint a member, so only a sealed
 * Assembly can ever authorize an admission. The brand property is retained
 * as a secondary, own-property-only (Object.hasOwn) defense in depth.
 */
const SEALED_ASSEMBLY_MINTS = new WeakSet();
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
/** Unambiguous composite key over an exact KindRef (`@` never occurs inside
 * exact identity strings — embedded selectors are rejected). */
function kindKey(ref) {
    return `${ref.kindId}@${ref.version}`;
}
/** Sort key making pins/declarations/evidence order-insensitive. */
function pinSortKey(pin) {
    return JSON.stringify([pin.kind.kindId, pin.kind.version]);
}
function fail(code, message) {
    throw new RuntimeAssemblyError(code, message);
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description, code) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value, description, code) {
    const result = safeArraySnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value, path, code) {
    if (typeof value !== 'string') {
        fail(code, `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(code, `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value)) {
        fail(code, `${path} must not embed a version selector (\`id@version\`); use the exact version field`);
    }
    return value;
}
/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value, path, code) {
    if (carriesFloatingOrRangeSemantics(value)) {
        fail(code, `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`);
    }
}
/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value, path, code) {
    if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
        fail(code, `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`);
    }
}
/** Snapshot one exact `{idField, version}` reference as a fresh frozen object. */
function snapshotExactRef(value, path, idField, code) {
    const candidate = requireSafeRecord(value, path, code);
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
        fail(code, `${path} must contain exactly {${idField}, version}`);
    }
    const id = requireExactIdentityString(candidate[idField], `${path}.${idField}`, code);
    requireNonFloatingIdentity(id, `${path}.${idField}`, code);
    const version = requireExactIdentityString(candidate.version, `${path}.version`, code);
    requireNonFloatingIdentity(version, `${path}.version`, code);
    requireExactVersion(version, `${path}.version`, code);
    return { id, version };
}
/** Snapshot one exact ref collection: duplicates by id fail closed (never deduplicated). */
function snapshotExactRefCollection(value, description, idField, code) {
    const entries = requireSafeArray(value, description, code);
    const seen = new Set();
    const refs = entries.map((entry, index) => {
        const ref = snapshotExactRef(entry, `${description}[${index}]`, idField, code);
        if (seen.has(ref.id)) {
            fail(code, `${description}[${index}] declares ${ref.id} more than once (exact refs only)`);
        }
        seen.add(ref.id);
        return Object.freeze(ref);
    });
    return Object.freeze(refs);
}
const BINDING_INPUT_FIELDS = new Set([
    'pin',
    'understoodSemanticContracts',
    'understoodCapabilities',
    'validateComponent',
]);
const PIN_FIELDS = new Set(['kind', 'implementation']);
const IMPLEMENTATION_FIELDS = new Set([
    'implementationId',
    'implementationVersion',
    'implementationDigest',
]);
/**
 * Synchronously validate and snapshot one KindImplementation binding input.
 * The pin kind's exactness is proven by consuming the #573 frozen
 * compatibility decision (never reimplemented here): a structurally invalid
 * or floating/range/x-range KindRef surfaces as INCOMPATIBLE_KIND_IMPLEMENTATION.
 * Implementation-side defects surface as INVALID_IMPLEMENTATION_PIN.
 */
function snapshotBindingEntry(value, index) {
    const at = `kind implementation binding [${index}]`;
    const view = requireSafeRecord(value, at, 'INVALID_ASSEMBLY_INPUT');
    const unexpectedField = Object.keys(view).find((key) => !BINDING_INPUT_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_ASSEMBLY_INPUT', `${at} must contain exactly {pin, understoodSemanticContracts, understoodCapabilities, validateComponent}; unexpected field "${unexpectedField}"`);
    }
    if (typeof view.validateComponent !== 'function') {
        fail('INVALID_ASSEMBLY_INPUT', `${at}.validateComponent must be a function`);
    }
    const pinView = requireSafeRecord(view.pin, `${at}.pin`, 'INVALID_IMPLEMENTATION_PIN');
    const unexpectedPinField = Object.keys(pinView).find((key) => !PIN_FIELDS.has(key));
    if (unexpectedPinField !== undefined) {
        fail('INVALID_IMPLEMENTATION_PIN', `${at}.pin must contain exactly {kind, implementation}; unexpected field "${unexpectedPinField}"`);
    }
    // Kind-side exactness decision — consumed from kind-compatibility.ts (#573).
    let kind;
    try {
        const decision = decideKindCompatibility(pinView.kind, [pinView.kind]);
        kind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
    }
    catch (error) {
        const reason = error instanceof KindCompatibilityError ? error.message : String(error);
        fail('INCOMPATIBLE_KIND_IMPLEMENTATION', `${at}.pin.kind is not an exact, decidable KindRef: ${reason}`);
    }
    const implementationView = requireSafeRecord(pinView.implementation, `${at}.pin.implementation`, 'INVALID_IMPLEMENTATION_PIN');
    const unexpectedImplField = Object.keys(implementationView).find((key) => !IMPLEMENTATION_FIELDS.has(key));
    if (unexpectedImplField !== undefined) {
        fail('INVALID_IMPLEMENTATION_PIN', `${at}.pin.implementation must contain exactly {implementationId, implementationVersion, implementationDigest}; unexpected field "${unexpectedImplField}"`);
    }
    const implementationId = requireExactIdentityString(implementationView.implementationId, `${at}.pin.implementation.implementationId`, 'INVALID_IMPLEMENTATION_PIN');
    requireNonFloatingIdentity(implementationId, `${at}.pin.implementation.implementationId`, 'INVALID_IMPLEMENTATION_PIN');
    const implementationVersion = requireExactIdentityString(implementationView.implementationVersion, `${at}.pin.implementation.implementationVersion`, 'INVALID_IMPLEMENTATION_PIN');
    requireNonFloatingIdentity(implementationVersion, `${at}.pin.implementation.implementationVersion`, 'INVALID_IMPLEMENTATION_PIN');
    requireExactVersion(implementationVersion, `${at}.pin.implementation.implementationVersion`, 'INVALID_IMPLEMENTATION_PIN');
    if (!isContentDigest(implementationView.implementationDigest)) {
        fail('INVALID_IMPLEMENTATION_PIN', `${at}.pin.implementation.implementationDigest must be a non-empty content digest string`);
    }
    const pin = Object.freeze({
        kind: Object.freeze(kind),
        implementation: Object.freeze({
            implementationId,
            implementationVersion,
            implementationDigest: implementationView.implementationDigest,
        }),
    });
    return {
        pin,
        understoodSemanticContracts: snapshotExactRefCollection(view.understoodSemanticContracts, `${at}.understoodSemanticContracts`, 'contractId', 'INVALID_ASSEMBLY_INPUT'),
        understoodCapabilities: snapshotExactRefCollection(view.understoodCapabilities, `${at}.understoodCapabilities`, 'capabilityId', 'INVALID_ASSEMBLY_INPUT'),
        validateComponent: view.validateComponent,
    };
}
const RESOURCE_BINDING_FIELDS = new Set(['owner', 'declaration']);
const REQUIREMENT_FIELDS = new Set(['resourceKey', 'contract', 'operationId', 'required']);
/**
 * Synchronously validate and snapshot T005A resource requirement bindings
 * into the canonical #568 five-field material. Composition, not
 * re-implementation: `validateToolResourceRequirements` owns declaration
 * semantics (whitelisted fields, exact refs, operation existence, key
 * uniqueness) and its typed failures propagate unchanged; this layer adds
 * only the binding-entry envelope, the exact owner key check and the
 * duplicate-owner fail-closed rule.
 */
function snapshotResourceBindings(value) {
    const entries = requireSafeArray(value, 'resource requirement bindings', 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
    const seenOwners = new Set();
    const materials = entries.map((entry, index) => {
        const at = `resource requirement binding [${index}]`;
        const view = requireSafeRecord(entry, at, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
        const unexpectedField = Object.keys(view).find((key) => !RESOURCE_BINDING_FIELDS.has(key));
        if (unexpectedField !== undefined) {
            fail('INVALID_RESOURCE_REQUIREMENT_IDENTITY', `${at} must contain exactly {owner, declaration}; unexpected field "${unexpectedField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`);
        }
        const owner = view.owner;
        const declaration = view.declaration;
        validateToolResourceRequirements(owner, declaration);
        const declarationView = requireSafeRecord(declaration, `${at}.declaration`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
        const componentId = requireExactIdentityString(declarationView.componentId, `${at}.declaration.componentId`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
        requireNonFloatingIdentity(componentId, `${at}.declaration.componentId`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
        if (seenOwners.has(componentId)) {
            fail('INVALID_RESOURCE_REQUIREMENT_IDENTITY', `${at}.declaration.componentId declares ${componentId} more than once across resource requirement bindings (one canonical declaration set per owner)`);
        }
        seenOwners.add(componentId);
        const requirementsView = requireSafeArray(declarationView.requirements, `${at}.declaration.requirements`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
        const requirements = requirementsView.map((candidate, requirementIndex) => {
            const path = `${at}.declaration.requirements[${requirementIndex}]`;
            const requirement = requireSafeRecord(candidate, path, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
            const unexpectedRequirementField = Object.keys(requirement).find((key) => !REQUIREMENT_FIELDS.has(key));
            if (unexpectedRequirementField !== undefined) {
                fail('INVALID_RESOURCE_REQUIREMENT_IDENTITY', `${path} must not carry unknown field "${unexpectedRequirementField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`);
            }
            const resourceKey = requireExactIdentityString(requirement.resourceKey, `${path}.resourceKey`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
            requireNonFloatingIdentity(resourceKey, `${path}.resourceKey`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
            const material = { resourceKey, required: requirement.required };
            if ('contract' in requirement && requirement.contract !== undefined) {
                const contract = snapshotExactRef(requirement.contract, `${path}.contract`, 'contractId', 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
                material.contract = Object.freeze({
                    contractId: contract.id,
                    version: contract.version,
                });
            }
            if ('operationId' in requirement && requirement.operationId !== undefined) {
                const operationId = requireExactIdentityString(requirement.operationId, `${path}.operationId`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
                requireNonFloatingIdentity(operationId, `${path}.operationId`, 'INVALID_RESOURCE_REQUIREMENT_IDENTITY');
                material.operationId = operationId;
            }
            return Object.freeze(material);
        });
        // Order normalization: semantically unordered declaration permutations
        // MUST NOT change Assembly identity.
        const sortedRequirements = Object.freeze([...requirements].sort((a, b) => lexicalCompare(a.resourceKey, b.resourceKey)));
        return Object.freeze({ componentId, requirements: sortedRequirements });
    });
    return Object.freeze([...materials].sort((a, b) => lexicalCompare(a.componentId, b.componentId)));
}
const EVIDENCE_FIELDS = new Set(['subject', 'bindingDigest']);
/**
 * Synchronously validate and snapshot §G generic implementation-binding
 * evidence slots. Exact-identity-only and opaque: the kernel records the
 * subject/digest pair without selecting, ranking or inspecting anything.
 */
function snapshotEvidence(value) {
    const entries = requireSafeArray(value, 'implementation binding evidence', 'INVALID_ASSEMBLY_INPUT');
    const seenSubjects = new Set();
    const slots = entries.map((entry, index) => {
        const at = `implementation binding evidence [${index}]`;
        const view = requireSafeRecord(entry, at, 'INVALID_ASSEMBLY_INPUT');
        const unexpectedField = Object.keys(view).find((key) => !EVIDENCE_FIELDS.has(key));
        if (unexpectedField !== undefined) {
            fail('INVALID_ASSEMBLY_INPUT', `${at} must contain exactly {subject, bindingDigest}; unexpected field "${unexpectedField}" (Tool-specific binding semantics are T003C-owned and never enter the generic slot)`);
        }
        const subject = requireExactIdentityString(view.subject, `${at}.subject`, 'INVALID_ASSEMBLY_INPUT');
        requireNonFloatingIdentity(view.subject, `${at}.subject`, 'INVALID_ASSEMBLY_INPUT');
        if (!isContentDigest(view.bindingDigest)) {
            fail('INVALID_ASSEMBLY_INPUT', `${at}.bindingDigest must be a non-empty content digest string`);
        }
        if (seenSubjects.has(subject)) {
            fail('DUPLICATE_BINDING_EVIDENCE', `${at}.subject declares ${subject} more than once (binding evidence slots are unique per subject; duplicates are never first-wins)`);
        }
        seenSubjects.add(subject);
        return Object.freeze({
            subject,
            bindingDigest: view.bindingDigest,
        });
    });
    return Object.freeze([...slots].sort((a, b) => lexicalCompare(a.subject, b.subject)));
}
const SEAL_INPUT_FIELDS = new Set([
    'definitionGraph',
    'kindImplementations',
    'resourceRequirements',
    'implementationBindingEvidence',
    'claimedDefinitionGraphDigest',
]);
function requireSha256Port(value, path) {
    if (typeof value !== 'object' ||
        value === null ||
        typeof value.digestUtf8 !== 'function') {
        fail('INVALID_ASSEMBLY_INPUT', `${path} must be a Sha256Port ({ digestUtf8(value): Promise<string> })`);
    }
    return value;
}
// ---------------------------------------------------------------------------
// sealRuntimeAssembly — the authority boundary (#587 §C, §E)
// ---------------------------------------------------------------------------
/**
 * Seal a Runtime Assembly over an exact Definition graph.
 *
 * Authority boundary: raw caller-provided declarations/validators never
 * become runtime authority. Every authority-bearing input is descriptor-safe
 * validated and synchronously snapshotted BEFORE the first `await` (#587 §E
 * torn-snapshot discipline, same as #555); after any suspension only
 * module-owned snapshot material is read. The Definition graph digest is
 * authoritatively recomputed through the accepted #555 seam — a
 * caller-supplied claim is verified against it, never trusted blindly — and
 * any stale/mismatching claim fails closed.
 *
 * Deterministic fail-closed precedence: seal-input shape, graph validation
 * (propagated unchanged), binding snapshots, ambiguity, missing
 * implementations, resource identity, evidence identity, then async digest
 * work (currentness claim, Assembly digest). Never downgrades a failure.
 */
export async function sealRuntimeAssembly(input, sha256) {
    requireSha256Port(sha256, 'sha256');
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const inputView = requireSafeRecord(input, 'runtime assembly seal input', 'INVALID_ASSEMBLY_INPUT');
    const unexpectedInputField = Object.keys(inputView).find((key) => !SEAL_INPUT_FIELDS.has(key));
    if (unexpectedInputField !== undefined) {
        fail('INVALID_ASSEMBLY_INPUT', `runtime assembly seal input must not carry unknown field "${unexpectedInputField}"`);
    }
    if (!('definitionGraph' in inputView)) {
        fail('INVALID_ASSEMBLY_INPUT', 'runtime assembly seal input.definitionGraph is required');
    }
    if (!('kindImplementations' in inputView)) {
        fail('INVALID_ASSEMBLY_INPUT', 'runtime assembly seal input.kindImplementations is required');
    }
    const definitionGraph = inputView.definitionGraph;
    // Graph validation is synchronous; typed DefinitionGraphContractError (and
    // the ComponentContractError it composes) propagate unchanged.
    validateDefinitionGraphEnvelope(definitionGraph);
    // Required/admitted exact Kinds, snapshotted synchronously before any await.
    const requiredKindKeys = new Set();
    for (const component of definitionGraph.components) {
        requiredKindKeys.add(kindKey(component.kind));
    }
    const bindings = requireSafeArray(inputView.kindImplementations, 'kind implementation bindings', 'INVALID_ASSEMBLY_INPUT').map((entry, index) => snapshotBindingEntry(entry, index));
    // Ambiguity fails closed — never first-wins.
    const bindingsByKind = new Map();
    for (const [index, binding] of bindings.entries()) {
        const key = kindKey(binding.pin.kind);
        if (bindingsByKind.has(key)) {
            fail('AMBIGUOUS_KIND_IMPLEMENTATION', `kind implementation bindings [${index}] declares exact Kind "${key}" more than once (one exact KindImplementation per exact KindRef; never first-wins)`);
        }
        bindingsByKind.set(key, binding);
    }
    // Every required/admitted graph Kind must have exactly one implementation.
    for (const key of [...requiredKindKeys].sort()) {
        if (!bindingsByKind.has(key)) {
            fail('MISSING_KIND_IMPLEMENTATION', `no KindImplementation binding is sealed for required/admitted exact Kind "${key}" of the Definition graph (missing implementations fail closed; no default/latest/fallback exists)`);
        }
    }
    const resourceRequirements = snapshotResourceBindings('resourceRequirements' in inputView ? inputView.resourceRequirements : []);
    const evidence = snapshotEvidence('implementationBindingEvidence' in inputView ? inputView.implementationBindingEvidence : []);
    const claimed = inputView.claimedDefinitionGraphDigest;
    if (claimed !== undefined && !isContentDigest(claimed)) {
        fail('INVALID_ASSEMBLY_INPUT', 'runtime assembly seal input.claimedDefinitionGraphDigest must be a non-empty content digest string when present');
    }
    // ---- PHASE 2 (async): digest work only; no caller-owned re-read after this point.
    const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, sha256);
    if (claimed !== undefined && claimed !== definitionGraphDigest) {
        fail('DEFINITION_CURRENTNESS_MISMATCH', 'the supplied/current Definition graph does not correspond to the claimed exact digest; Assembly sealing is bound to the authoritatively recomputed graph digest and stale/mismatching claims fail closed');
    }
    // Order normalization: binding input permutation MUST NOT change identity.
    const pins = Object.freeze([...bindings]
        .map((binding) => binding.pin)
        .sort((a, b) => lexicalCompare(pinSortKey(a), pinSortKey(b))));
    const record = Object.freeze({
        digestDomain: RUNTIME_ASSEMBLY_DIGEST_DOMAIN,
        definitionGraphDigest,
        kindImplementations: pins,
        resourceRequirements,
        implementationBindingEvidence: evidence,
    });
    const assemblyDigest = await computeCanonicalJsonDigest(record, sha256);
    // #641: the mapped authority arrays minted into sealed bindings are frozen
    // at every level (outer array, mapped array, per-element ref). The mapped
    // arrays themselves carry runtime authority through the admission
    // declaration derived from them, so an unfrozen mapped array would let
    // post-seal mutation of returned bindings alter admission behavior.
    const sealedBindings = Object.freeze(bindings.map((binding) => Object.freeze({
        pin: binding.pin,
        understoodSemanticContracts: Object.freeze(binding.understoodSemanticContracts.map((ref) => Object.freeze({ contractId: ref.id, version: ref.version }))),
        understoodCapabilities: Object.freeze(binding.understoodCapabilities.map((ref) => Object.freeze({ capabilityId: ref.id, version: ref.version }))),
        validateComponent: binding.validateComponent,
    })));
    const sealed = Object.freeze({
        record,
        assemblyDigest,
        bindings: sealedBindings,
        [SEALED_ASSEMBLY_BRAND]: true,
    });
    SEALED_ASSEMBLY_MINTS.add(sealed);
    return sealed;
}
// ---------------------------------------------------------------------------
// admitComponentWithAssembly — Assembly-bound admission (#587 §C, §D, §E)
// ---------------------------------------------------------------------------
/** Deep-copy validated portable JSON material into module-owned snapshot state. */
function snapshotJson(value) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * Synchronously snapshot a validated Component envelope into fresh
 * module-owned value objects (identity refs fresh; JSON bodies deep-copied)
 * so no caller-owned state is read after the first async suspension.
 */
function snapshotEnvelope(envelope) {
    const snapshot = {
        family: envelope.family,
        componentId: envelope.componentId,
        kind: Object.freeze({ kindId: envelope.kind.kindId, version: envelope.kind.version }),
        requiredSemanticContracts: Object.freeze(envelope.requiredSemanticContracts.map((ref) => Object.freeze({ contractId: ref.contractId, version: ref.version }))),
        requiredCapabilities: Object.freeze(envelope.requiredCapabilities.map((ref) => Object.freeze({ capabilityId: ref.capabilityId, version: ref.version }))),
        semanticBody: snapshotJson(envelope.semanticBody),
    };
    if ('nonMaterialExtensions' in envelope && envelope.nonMaterialExtensions !== undefined) {
        snapshot.nonMaterialExtensions = snapshotJson(envelope.nonMaterialExtensions);
    }
    return snapshot;
}
/**
 * Authoritative sealed-Assembly guard (#575, fresh-review P1 repair). The
 * module-private WeakSet mint registry is the authoritative test — it cannot
 * be satisfied by prototype inheritance or symbol reflection, since only
 * `sealRuntimeAssembly` ever adds a member. The unique-symbol brand is kept
 * as defense in depth, but consulted as an OWN property only
 * (`Object.hasOwn`), so a brand value inherited through a forged prototype
 * chain contributes nothing.
 */
function isSealedAssembly(value) {
    return (typeof value === 'object' &&
        value !== null &&
        SEALED_ASSEMBLY_MINTS.has(value) &&
        Object.hasOwn(value, SEALED_ASSEMBLY_BRAND) &&
        value[SEALED_ASSEMBLY_BRAND] === true);
}
/**
 * Read-only anti-forgery guard exported for the T002C assembly-activation seam
 * (#617). It confirms membership in the module-private mint registry without
 * exposing the brand symbol or the registry; it lets the activation authority
 * prove a caller-supplied value is a genuine `SealedRuntimeAssembly` minted by
 * `sealRuntimeAssembly`, but can never be used to mint or forge one.
 */
export function isSealedRuntimeAssembly(value) {
    return isSealedAssembly(value);
}
/**
 * Authoritative Assembly-bound Component admission.
 *
 * The exact Kind support decision is consumed from the #573 frozen decision
 * over the SEALED bindings' pins (never a caller validator): an unbound or
 * inexact Kind fails closed with ASSEMBLY_ADMISSION_KIND_NOT_BOUND. The
 * current Definition graph digest is authoritatively recomputed and must
 * equal the digest recorded in the sealed Assembly, else
 * ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH fails closed. Only then is the
 * low-level `admitComponent` invoked with a declaration derived from the
 * sealed binding, and its result is re-emitted as frozen, non-aliasing
 * Assembly-bound evidence binding componentId, currentness, assemblyDigest,
 * exact admitted KindRef and exact KindImplementationPin.
 *
 * Torn-snapshot discipline: the envelope is validated and snapshotted
 * synchronously before the first `await`; the caller's envelope is never
 * re-read after the currentness suspension, so post-admission caller mutation
 * cannot alter admitted evidence.
 */
export async function admitComponentWithAssembly(envelope, assembly, options) {
    // Anti-forgery boundary (#575): a raw/no-op validator supplied outside the
    // sealed Assembly path can never mint Assembly-bound admission — a
    // caller-constructed object does not carry the module-private brand.
    if (!isSealedAssembly(assembly)) {
        fail('INVALID_ASSEMBLY_INPUT', 'admission requires a SealedRuntimeAssembly minted by sealRuntimeAssembly; a caller-constructed assembly can never carry the sealed-Assembly brand');
    }
    // Defense-in-depth consistency re-derivation (fresh-review P1 repair): the
    // sealed bindings' pin set must be exactly the record's serialized pin
    // set. Every registry member minted by sealRuntimeAssembly satisfies this
    // by construction (both derive from the same synchronous snapshot), so a
    // mismatch indicates tampered module state and fails closed before any
    // authority use.
    const bindingPinKeys = assembly.bindings.map((binding) => pinSortKey(binding.pin)).sort();
    const recordPinKeys = assembly.record.kindImplementations.map(pinSortKey).sort();
    if (bindingPinKeys.length !== recordPinKeys.length ||
        bindingPinKeys.some((key, index) => key !== recordPinKeys[index])) {
        fail('INVALID_ASSEMBLY_INPUT', 'the sealed Assembly\'s bindings do not correspond exactly to its serialized record pins; Assembly evidence is inconsistent and fails closed');
    }
    const optionsView = requireSafeRecord(options, 'admission options', 'INVALID_ASSEMBLY_INPUT');
    const unexpectedOptionField = Object.keys(optionsView).find((key) => key !== 'currentDefinitionGraph' && key !== 'sha256');
    if (unexpectedOptionField !== undefined) {
        fail('INVALID_ASSEMBLY_INPUT', `admission options must contain exactly {currentDefinitionGraph, sha256}; unexpected field "${unexpectedOptionField}"`);
    }
    const sha256 = requireSha256Port(optionsView.sha256, 'admission options.sha256');
    const currentDefinitionGraph = optionsView.currentDefinitionGraph;
    // Synchronous envelope validation + snapshot, before the first await.
    validateComponentEnvelope(envelope);
    const envelopeSnapshot = snapshotEnvelope(envelope);
    // Exact Kind support decision over the sealed bindings (#573 consumed).
    const supportedKinds = assembly.bindings.map((binding) => binding.pin.kind);
    let admittedKind;
    try {
        const decision = decideKindCompatibility(envelopeSnapshot.kind, supportedKinds);
        admittedKind = { kindId: decision.supportedKind.kindId, version: decision.supportedKind.version };
    }
    catch (error) {
        const reason = error instanceof KindCompatibilityError ? error.message : String(error);
        fail('ASSEMBLY_ADMISSION_KIND_NOT_BOUND', `the sealed Assembly has no KindImplementation binding for the component's exact Kind: ${reason}`);
    }
    const binding = assembly.bindings.find((candidate) => kindKey(candidate.pin.kind) === kindKey(admittedKind));
    // Definition currentness: authoritative recomputation, never a blind trust.
    const currentDigest = await computeDefinitionGraphDigest(currentDefinitionGraph, sha256);
    if (currentDigest !== assembly.record.definitionGraphDigest) {
        fail('ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH', 'the current Definition graph digest does not match the exact digest bound in the sealed Assembly; stale graphs fail closed before any validator runs');
    }
    // The declaration is derived from the SEALED binding only (#587 §C).
    const declaration = {
        kind: Object.freeze({ kindId: admittedKind.kindId, version: admittedKind.version }),
        understoodSemanticContracts: binding.understoodSemanticContracts,
        understoodCapabilities: binding.understoodCapabilities,
        validateComponent: binding.validateComponent,
    };
    const result = admitComponent(envelopeSnapshot, [declaration]);
    // Mint frozen, non-aliasing Assembly-bound authority evidence (#587 §D).
    const pin = binding.pin;
    return Object.freeze({
        status: 'ADMITTED',
        componentId: result.componentId,
        definitionGraphDigest: assembly.record.definitionGraphDigest,
        assemblyDigest: assembly.assemblyDigest,
        admittedKind: Object.freeze({ kindId: result.admittedKind.kindId, version: result.admittedKind.version }),
        admittedKindImplementation: Object.freeze({
            kind: Object.freeze({ kindId: pin.kind.kindId, version: pin.kind.version }),
            implementation: Object.freeze({
                implementationId: pin.implementation.implementationId,
                implementationVersion: pin.implementation.implementationVersion,
                implementationDigest: pin.implementation.implementationDigest,
            }),
        }),
        admittedSemanticContracts: Object.freeze(result.admittedSemanticContracts.map((ref) => Object.freeze({ contractId: ref.contractId, version: ref.version }))),
        admittedCapabilities: Object.freeze(result.admittedCapabilities.map((ref) => Object.freeze({ capabilityId: ref.capabilityId, version: ref.version }))),
    });
}
//# sourceMappingURL=runtime-assembly.js.map