/**
 * T008D — historical harness-config / promoted-subworkflow compatibility
 * mapping (PACK-B #589, thin issue #790).
 *
 * `COMPATIBILITY` boundary module (sibling of the T008A Raw adapter): the
 * historical `harness-config` and `promoted-subworkflow` compiled-artifact
 * material is evidence-input consumed from the legacy artifact model — it is
 * NOT a v0.7 ontology root and never becomes runtime truth:
 *
 * - every historical `promoted-subworkflow` artifact maps to exactly one
 *   ordinary `semantic`-family Workflow Component on the exact compat Kind
 *   `domain-harness.compat.promoted-subworkflow@1.0.0`, whose semanticBody is
 *   the exact historical candidate-envelope material (canonical copy: array
 *   order preserved, object keys sorted) — no privileged runtime magic, and
 *   no behaviorally material historical semantics are dropped or rewritten;
 * - every historical `harness-config` artifact maps to exactly one ordinary
 *   `semantic`-family Component on `domain-harness.compat.harness-config@1.0.0`
 *   carrying its exact historical material;
 * - intra-concern composition becomes exact typed `references` relations: one
 *   relation per (source, target) pair, emitted only when the referenced
 *   compat artifact is bound in the same mapping input (a dangling relation is
 *   never emitted, a stale revision never silently accepted). Historical
 *   references outside the compat concern (tools/rules/knowledge/...) stay
 *   exact historical envelope material — preserved verbatim, never relations,
 *   never dropped;
 * - DecisionResolver source authority is preserved: the frozen ADR-03 source
 *   order (`rule -> exact-cache -> promoted-subworkflow -> harness-machine`)
 *   is the module-owned canonical composition order. Historical decision
 *   declarations map to canonical evidence sorted by that frozen order — the
 *   declaration shape is closed (no priority/order/weight field exists), the
 *   source union is closed (unknown/inferred names fail), and input config
 *   order can never alter the recorded authority;
 * - exact historical identity/currentness (kind, artifactId, version,
 *   contentDigest) is preserved verbatim as mapping provenance — historical
 *   identity is never rewritten (strangler, not rewrite).
 *
 * Mapping guarantees (PACK-B):
 * - same input => same graph, same provenance, same standard normalized graph
 *   digest; unordered input permutation (component lists, declarations) is
 *   invariant; explicitly ordered historical sequences (control edges, body
 *   nodes) are preserved exactly;
 * - ambiguous or unrepresentable historical semantics fail typed — duplicate,
 *   conflicting, missing and stale material each get their own closed error
 *   code; there is no closest-match guess and no latest/default/first/
 *   registry-order inference anywhere;
 * - the product is fully caller-isolated (deep canonical copies) and carries
 *   no reverse authority: it is consumable only through the standard v0.7
 *   Component/Definition contracts. The module imports no runtime, executes
 *   no DecisionResolver/XState/Harness path, and accepts no ports.
 *
 * Intentionally excluded (PACK-B boundaries): legacy identity correspondence
 * evidence (T008B), public compatibility (T008C), final v0.6 delta (T008E),
 * and every edit to the runtime `decision-resolver` / promoted-child /
 * workflow-runtime-bridge sources. This module is internal to the compiler
 * package: it is not re-exported through any barrel.
 */
import { validateDefinitionGraphEnvelope, } from '@kaicreator/domain-harness/v7';
/** Marker recorded in graph `nonMaterialExtensions` (excluded from identity). */
export const COMPAT_ADAPTER_PROVENANCE_MARKER = 'domain-harness.compat.harness-config-promoted-subworkflow';
/** Exact historical promoted candidate envelope schema form the mapper accepts. */
export const COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION = 'candidate-envelope-v1';
/** Exact historical promoted child body schema form (relation-derivation surface). */
export const COMPAT_PROMOTED_CHILD_BODY_SCHEMA_VERSION = 'promoted-child-workflow/v1';
/** Exact versioned KindRef historical promoted subworkflows map to. */
export const COMPAT_PROMOTED_SUBWORKFLOW_KIND = Object.freeze({
    kindId: 'domain-harness.compat.promoted-subworkflow',
    version: '1.0.0',
});
/** Exact versioned KindRef historical harness configs map to. */
export const COMPAT_HARNESS_CONFIG_KIND = Object.freeze({
    kindId: 'domain-harness.compat.harness-config',
    version: '1.0.0',
});
/** Open exact relation kind for intra-concern historical composition. */
export const COMPAT_REFERENCES_RELATION_KIND = 'references';
/**
 * The frozen historical DecisionResolver source order (ADR-03): rule → exact
 * cache → promoted subworkflow → HarnessMachine. Compatibility mirror only —
 * the authoritative order stays owned by the runtime resolver, which this
 * module never imports or executes. Config material cannot reorder it: mapped
 * decision-source evidence is canonicalized by this exact order.
 */
export const COMPAT_DECISION_RESOLVER_SOURCE_ORDER = Object.freeze([
    'rule',
    'exact-cache',
    'promoted-subworkflow',
    'harness-machine',
]);
/** The closed historical compiled-artifact kind union a reference may carry. */
const HISTORICAL_ARTIFACT_KINDS = new Set([
    'rule',
    'knowledge',
    'skill',
    'tool',
    'output-schema',
    'workflow',
    'promoted-subworkflow',
    'harness-config',
]);
/** The only kinds whose targets this bounded concern maps (and can bind). */
const CONCERN_ARTIFACT_KINDS = new Set(['promoted-subworkflow', 'harness-config']);
/** The closed historical promoted child step kind union. */
const PROMOTED_STEP_KINDS = new Set([
    'query',
    'emit-event',
    'effect-intent',
    'terminal-output',
    'reasoned',
]);
/**
 * Typed fail-closed error for the historical compat mapping. `path` identifies
 * the caller input location; no message ever normalizes or rewrites the
 * offending historical identity.
 */
export class CompatHarnessConfigMappingError extends Error {
    code;
    path;
    constructor(code, path, reason, options) {
        super(`${code} at ${path}: ${reason}`, options);
        this.name = 'CompatHarnessConfigMappingError';
        this.code = code;
        this.path = path;
    }
}
// ---------------------------------------------------------------------------
// Exact-identity predicates (same accepted matrix as the T008A sibling: no
// floating tokens, no range operators, no embedded `id@version` selectors, no
// x-range/partial versions). Validation only — never normalized.
// ---------------------------------------------------------------------------
const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);
const RANGE_OPERATOR_PATTERN = /[\^~<>|*]/;
function fail(code, path, reason) {
    throw new CompatHarnessConfigMappingError(code, path, reason);
}
function requireString(value, path) {
    if (typeof value !== 'string') {
        fail('NOT_TRANSLATABLE', path, 'must be a string');
    }
    return value;
}
/** Non-empty, no floating/range selection, no embedded `id@version` selector. */
function isExactIdentity(value) {
    const trimmed = value.trim();
    return (trimmed.length > 0 &&
        !value.includes('@') &&
        !FLOATING_SELECTOR_TOKENS.has(trimmed.toLowerCase()) &&
        !RANGE_OPERATOR_PATTERN.test(value));
}
/** Exact version: exact identity plus no x-range/partial version parts. */
function isExactVersion(value) {
    if (!isExactIdentity(value))
        return false;
    return !value.trim().split('.').some((part) => part.length === 0 || part.toLowerCase() === 'x');
}
function requireExactIdentity(value, path) {
    const candidate = requireString(value, path);
    if (!isExactIdentity(candidate)) {
        fail('NOT_TRANSLATABLE', path, `is not representable as an exact identity (empty, floating/range selection, or embedded \`id@version\` selector); historical identity is never rewritten`);
    }
    return candidate;
}
/** Code-unit comparison only; `localeCompare` is environment-sensitive. */
function compareIds(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
// ---------------------------------------------------------------------------
// Structure-record guards: descriptor-safe, closed-shape checks over plain
// caller records. Own properties only; accessors, symbols, non-enumerable own
// properties and unknown fields fail closed — the input shape is closed, so
// priority/order-style authority fields cannot even be expressed.
// ---------------------------------------------------------------------------
function requireStructureRecord(value, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        fail('INVALID_COMPAT_INPUT', path, 'must be a plain record');
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        fail('INVALID_COMPAT_INPUT', path, 'must be an ordinary plain record (exotic prototypes are rejected fail-closed)');
    }
    return value;
}
function requireOwnKeysExact(record, allowed, path) {
    const ownNames = Object.getOwnPropertyNames(record);
    for (const name of ownNames) {
        if (!allowed.includes(name)) {
            fail('INVALID_COMPAT_INPUT', path, `carries unknown field "${name}"; the compat input shape is closed`);
        }
    }
    if (Object.getOwnPropertySymbols(record).length > 0) {
        fail('INVALID_COMPAT_INPUT', path, 'symbol-keyed fields are rejected fail-closed');
    }
    for (const name of ownNames) {
        const descriptor = Object.getOwnPropertyDescriptor(record, name);
        if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
            fail('INVALID_COMPAT_INPUT', `${path}.${name}`, 'must be an own enumerable data property (accessors are rejected fail-closed)');
        }
    }
}
function requireMissingAndPresent(record, required, path) {
    for (const name of required) {
        if (!Object.prototype.hasOwnProperty.call(record, name)) {
            fail('NOT_TRANSLATABLE', `${path}.${name}`, 'is required by the historical material form; absence is never silently defaulted');
        }
    }
}
// ---------------------------------------------------------------------------
// Canonical copy: descriptor-safe deep copy with recursively sorted object
// keys and preserved array order (the accepted T008A semantics, mirrored
// module-locally). Rejects non-JSON material, accessors, symbol keys,
// non-enumerable properties, exotic prototypes and circular references
// without ever executing a getter. The result is fully caller-isolated; an
// own data `__proto__` is preserved verbatim as data.
// ---------------------------------------------------------------------------
function canonicalCopy(value, path, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            fail('NOT_TRANSLATABLE', path, 'non-finite numbers are not portable JSON semantics');
        }
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value !== 'object') {
        fail('NOT_TRANSLATABLE', path, `unsupported value type ${typeof value} is not portable JSON`);
    }
    const record = value;
    if (Object.getOwnPropertySymbols(record).length > 0) {
        fail('NOT_TRANSLATABLE', path, 'symbol-keyed properties are not portable JSON');
    }
    if (ancestors.has(record)) {
        fail('NOT_TRANSLATABLE', path, 'circular references are not portable JSON');
    }
    if (Array.isArray(record)) {
        const source = record;
        const ownNames = Object.getOwnPropertyNames(source);
        const extra = ownNames.filter((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key));
        if (extra.length > 0) {
            fail('NOT_TRANSLATABLE', path, 'arrays carrying extra named properties are not portable JSON');
        }
        ancestors.add(record);
        const output = [];
        for (let index = 0; index < record.length; index += 1) {
            const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
            if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
                fail('NOT_TRANSLATABLE', `${path}[${index}]`, 'sparse or accessor array entries are not portable JSON');
            }
            output.push(canonicalCopy(descriptor.value, `${path}[${index}]`, ancestors));
        }
        ancestors.delete(record);
        return output;
    }
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
        fail('NOT_TRANSLATABLE', path, 'values with exotic prototypes are not portable JSON');
    }
    const ownNames = Object.getOwnPropertyNames(record);
    const nonEnumerable = ownNames.filter((key) => !Object.prototype.propertyIsEnumerable.call(record, key));
    if (nonEnumerable.length > 0) {
        fail('NOT_TRANSLATABLE', path, 'non-enumerable properties are not portable JSON');
    }
    ancestors.add(record);
    const output = {};
    for (const key of ownNames.sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!('value' in descriptor)) {
            fail('NOT_TRANSLATABLE', `${path}.${key}`, 'accessor properties are not portable JSON');
        }
        if (descriptor.value === undefined) {
            fail('NOT_TRANSLATABLE', `${path}.${key}`, 'undefined is not portable JSON');
        }
        // Prototype-safe definition (accepted T008A repair semantics): plain
        // assignment on the key `__proto__` would reach the inherited
        // Object.prototype setter instead of creating an own property.
        // defineProperty always creates the exact own enumerable data property
        // and never invokes any setter, so an own data `__proto__` is preserved
        // verbatim as data on a plain prototype.
        Object.defineProperty(output, key, {
            value: canonicalCopy(descriptor.value, `${path}.${key}`, ancestors),
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    ancestors.delete(record);
    return output;
}
function copyMaterial(value, path) {
    return canonicalCopy(value, path, new Set());
}
function requireHistoricalIdentity(value, expectedKind, path) {
    const record = requireStructureRecord(value, path);
    requireOwnKeysExact(record, ['kind', 'artifactId', 'version', 'contentDigest'], path);
    requireMissingAndPresent(record, ['kind', 'artifactId', 'contentDigest'], path);
    const kind = requireString(record.kind, `${path}.kind`);
    if (kind !== expectedKind) {
        fail('CONFLICTING_COMPAT_IDENTITY', `${path}.kind`, `declares historical kind '${kind}' which conflicts with the mapping family '${expectedKind}'`);
    }
    const artifactId = requireExactIdentity(record.artifactId, `${path}.artifactId`);
    const contentDigest = requireString(record.contentDigest, `${path}.contentDigest`);
    if (contentDigest.length === 0) {
        fail('NOT_TRANSLATABLE', `${path}.contentDigest`, 'historical currentness digest must be a non-empty string');
    }
    let version;
    if (record.version !== undefined) {
        const candidate = requireString(record.version, `${path}.version`);
        if (!isExactVersion(candidate)) {
            fail('NOT_TRANSLATABLE', `${path}.version`, 'is not an exact version (x-range/partial versions are never accepted); historical identity is never rewritten');
        }
        version = candidate;
    }
    return { kind, artifactId, version, contentDigest };
}
function identityEquals(left, right) {
    return (left.kind === right.kind &&
        left.artifactId === right.artifactId &&
        left.contentDigest === right.contentDigest &&
        left.version === right.version);
}
function requireExactReference(value, path) {
    const record = requireStructureRecord(value, path);
    requireOwnKeysExact(record, ['kind', 'artifactId', 'contentDigest'], path);
    requireMissingAndPresent(record, ['kind', 'artifactId', 'contentDigest'], path);
    const kind = requireString(record.kind, `${path}.kind`);
    if (!HISTORICAL_ARTIFACT_KINDS.has(kind)) {
        fail('NOT_TRANSLATABLE', `${path}.kind`, `'${kind}' is outside the closed historical artifact kind union; unknown reference semantics are never guessed`);
    }
    const artifactId = requireExactIdentity(record.artifactId, `${path}.artifactId`);
    const contentDigest = requireString(record.contentDigest, `${path}.contentDigest`);
    if (contentDigest.length === 0) {
        fail('NOT_TRANSLATABLE', `${path}.contentDigest`, 'historical currentness digest must be a non-empty string');
    }
    return { kind, artifactId, contentDigest };
}
function requireControl(value, path) {
    const record = requireStructureRecord(value, path);
    requireOwnKeysExact(record, ['startNode', 'nodes', 'edges', 'maxSteps'], path);
    requireMissingAndPresent(record, ['startNode', 'nodes', 'edges', 'maxSteps'], path);
    const startNode = requireExactIdentity(record.startNode, `${path}.startNode`);
    if (!Array.isArray(record.nodes)) {
        fail('NOT_TRANSLATABLE', `${path}.nodes`, 'must be an array of declared node identities');
    }
    const nodes = [];
    const nodeSet = new Set();
    for (const [index, node] of record.nodes.entries()) {
        const nodeId = requireExactIdentity(node, `${path}.nodes[${index}]`);
        if (nodeSet.has(nodeId)) {
            fail('NOT_TRANSLATABLE', `${path}.nodes[${index}]`, `duplicate node identity '${nodeId}' is ambiguous historical semantics`);
        }
        nodeSet.add(nodeId);
        nodes.push(nodeId);
    }
    if (!nodeSet.has(startNode)) {
        fail('NOT_TRANSLATABLE', `${path}.startNode`, `'${startNode}' is not a declared node; the initial state is never implicitly created`);
    }
    if (!Array.isArray(record.edges)) {
        fail('NOT_TRANSLATABLE', `${path}.edges`, 'must be an array of {from, to} control edges');
    }
    const edges = [];
    const edgeKeys = new Set();
    for (const [index, edge] of record.edges.entries()) {
        const edgePath = `${path}.edges[${index}]`;
        const edgeRecord = requireStructureRecord(edge, edgePath);
        requireOwnKeysExact(edgeRecord, ['from', 'to'], edgePath);
        requireMissingAndPresent(edgeRecord, ['from', 'to'], edgePath);
        const from = requireExactIdentity(edgeRecord.from, `${edgePath}.from`);
        const to = requireExactIdentity(edgeRecord.to, `${edgePath}.to`);
        if (!nodeSet.has(from) || !nodeSet.has(to)) {
            fail('NOT_TRANSLATABLE', edgePath, `edge '${from}' -> '${to}' references an undeclared node; endpoints are never implicitly created`);
        }
        if (from === to) {
            fail('NOT_TRANSLATABLE', edgePath, `edge '${from}' -> '${to}' is a self cycle; historical semantics reject all cycles`);
        }
        const edgeKey = `${from}->${to}`;
        if (edgeKeys.has(edgeKey)) {
            fail('NOT_TRANSLATABLE', edgePath, `duplicate control edge '${edgeKey}' is ambiguous historical semantics`);
        }
        edgeKeys.add(edgeKey);
        edges.push({ from, to });
    }
    const maxSteps = record.maxSteps;
    if (typeof maxSteps !== 'number' || !Number.isSafeInteger(maxSteps) || maxSteps < 1) {
        fail('NOT_TRANSLATABLE', `${path}.maxSteps`, 'must be a positive safe integer');
    }
    // Deterministic acyclicity (Kahn); the historical promoted-subworkflow
    // compiler rejects all control-flow cycles, so a cyclic envelope is not
    // representable historical material.
    const indegree = new Map(nodes.map((node) => [node, 0]));
    for (const edge of edges) {
        indegree.set(edge.to, indegree.get(edge.to) + 1);
    }
    const ready = nodes.filter((node) => indegree.get(node) === 0).sort(compareIds);
    let ordered = 0;
    while (ready.length > 0) {
        const node = ready.shift();
        ordered += 1;
        for (const edge of edges) {
            if (edge.from !== node)
                continue;
            const remaining = indegree.get(edge.to) - 1;
            indegree.set(edge.to, remaining);
            if (remaining === 0)
                ready.push(edge.to);
        }
    }
    if (ordered !== nodes.length) {
        fail('NOT_TRANSLATABLE', path, 'control graph contains a control-flow cycle; historical semantics reject all cycles');
    }
    return { startNode, nodes, edges };
}
/**
 * Validate the interpreted surfaces of a canonical envelope copy: the two
 * identity markers, the control graph (required), and — when present — the
 * exact-reference list and the body's step-kind union up to `reasoned`
 * harness-config bindings. Unknown material fails closed.
 */
function interpretEnvelope(envelope, envelopePath) {
    const record = requireStructureRecord(envelope, envelopePath);
    if (record.schemaVersion !== COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION) {
        fail('NOT_TRANSLATABLE', `${envelopePath}.schemaVersion`, `is '${String(record.schemaVersion)}'; the mapper accepts exactly '${COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION}' and never guesses across schema generations`);
    }
    if (record.candidateKind !== 'workflow') {
        fail('NOT_TRANSLATABLE', `${envelopePath}.candidateKind`, `requires candidateKind 'workflow', got '${String(record.candidateKind)}'; non-workflow historical material is outside this concern`);
    }
    requireMissingAndPresent(record, ['control'], envelopePath);
    requireControl(record.control, `${envelopePath}.control`);
    const referenceList = [];
    if (record.references !== undefined) {
        if (!Array.isArray(record.references)) {
            fail('NOT_TRANSLATABLE', `${envelopePath}.references`, 'must be an array of exact references');
        }
        for (const [index, reference] of record.references.entries()) {
            referenceList.push(requireExactReference(reference, `${envelopePath}.references[${index}]`));
        }
    }
    const reasonedReferences = [];
    if (record.body !== undefined && typeof record.body === 'object' && record.body !== null && !Array.isArray(record.body)) {
        const body = record.body;
        const bodyPath = `${envelopePath}.body`;
        if (body.nodes !== undefined) {
            if (body.schemaVersion !== COMPAT_PROMOTED_CHILD_BODY_SCHEMA_VERSION) {
                fail('NOT_TRANSLATABLE', `${bodyPath}.schemaVersion`, `is '${String(body.schemaVersion)}'; a declared body must be exactly '${COMPAT_PROMOTED_CHILD_BODY_SCHEMA_VERSION}'`);
            }
            if (!Array.isArray(body.nodes)) {
                fail('NOT_TRANSLATABLE', `${bodyPath}.nodes`, 'must be an array of {node, step} entries');
            }
            for (const [index, node] of body.nodes.entries()) {
                const nodePath = `${bodyPath}.nodes[${index}]`;
                const nodeRecord = requireStructureRecord(node, nodePath);
                requireOwnKeysExact(nodeRecord, ['node', 'step'], nodePath);
                requireMissingAndPresent(nodeRecord, ['node', 'step'], nodePath);
                requireExactIdentity(nodeRecord.node, `${nodePath}.node`);
                const stepPath = `${nodePath}.step`;
                const step = requireStructureRecord(nodeRecord.step, stepPath);
                requireOwnKeysExact(step, ['kind', 'tool', 'input', 'eventType', 'payload', 'effect', 'idempotencyKey', 'output', 'harnessConfig'], stepPath);
                const stepKind = requireString(step.kind, `${stepPath}.kind`);
                if (!PROMOTED_STEP_KINDS.has(stepKind)) {
                    fail('NOT_TRANSLATABLE', `${stepPath}.kind`, `'${stepKind}' is not a supported historical promoted child step; unknown material Workflow semantics fail closed`);
                }
                if (stepKind === 'reasoned') {
                    if (step.harnessConfig === undefined) {
                        fail('NOT_TRANSLATABLE', `${stepPath}.harnessConfig`, `a 'reasoned' step binds exactly one harness-config reference`);
                    }
                    const reference = requireExactReference(step.harnessConfig, `${stepPath}.harnessConfig`);
                    if (reference.kind !== 'harness-config') {
                        fail('NOT_TRANSLATABLE', `${stepPath}.harnessConfig`, `a 'reasoned' step binds exactly one harness-config reference, got kind '${reference.kind}'`);
                    }
                    reasonedReferences.push({ path: `${stepPath}.harnessConfig`, reference });
                }
            }
        }
    }
    return { reasonedReferences, referenceList };
}
// ---------------------------------------------------------------------------
// Public mapping API
// ---------------------------------------------------------------------------
/**
 * Deterministically map accepted historical harness-config /
 * promoted-subworkflow material to an ordinary v0.7 Component Graph plus
 * exact historical identity/currentness and canonical decision-source
 * evidence. Pure and synchronous: no I/O, no environment access, no ports,
 * no mutation of the caller input, no aliasing of caller-owned material, no
 * runtime/DecisionResolver/XState execution path.
 *
 * The produced graph is validated through the standard
 * `validateDefinitionGraphEnvelope` gate before returning; a violation there
 * is an adapter defect (`MAPPING_CONTRACT_VIOLATION`), never tolerated.
 */
export function mapHarnessConfigPromotedSubworkflowToComponentGraph(input) {
    const inputRecord = requireStructureRecord(input, 'input');
    requireOwnKeysExact(inputRecord, ['graphId', 'promotedSubworkflows', 'harnessConfigs', 'decisionSources'], 'input');
    requireMissingAndPresent(inputRecord, ['graphId'], 'input');
    const graphId = requireExactIdentity(inputRecord.graphId, 'input.graphId');
    const requireEntryArray = (value, path) => {
        if (value === undefined)
            return [];
        if (!Array.isArray(value)) {
            fail('INVALID_COMPAT_INPUT', path, 'must be an array');
        }
        return value.map((entry, index) => requireStructureRecord(entry, `${path}[${index}]`));
    };
    const promotedEntries = requireEntryArray(inputRecord.promotedSubworkflows, 'input.promotedSubworkflows');
    const harnessEntries = requireEntryArray(inputRecord.harnessConfigs, 'input.harnessConfigs');
    const declarationEntries = requireEntryArray(inputRecord.decisionSources, 'input.decisionSources');
    // Phase 1 — bind every historical identity exactly once. Identity is
    // explicit: family/kind agreement, uniqueness, conflict detection; nothing
    // is inferred, merged or silently re-digested.
    const boundIdentities = new Map();
    const bindIdentity = (identity, path) => {
        const existing = boundIdentities.get(identity.artifactId);
        if (existing !== undefined) {
            if (identityEquals(existing, identity)) {
                fail('DUPLICATE_COMPAT_IDENTITY', path, `historical artifact '${identity.artifactId}' is declared more than once with the identical identity`);
            }
            fail('CONFLICTING_COMPAT_IDENTITY', path, `historical artifact '${identity.artifactId}' is declared under conflicting identities (${existing.contentDigest} vs ${identity.contentDigest}); ambiguous identity is never silently resolved`);
        }
        boundIdentities.set(identity.artifactId, identity);
    };
    const promotedValidated = [];
    for (const [index, entry] of promotedEntries.entries()) {
        const path = `input.promotedSubworkflows[${index}]`;
        requireOwnKeysExact(entry, ['identity', 'envelope'], path);
        requireMissingAndPresent(entry, ['identity', 'envelope'], path);
        const identity = requireHistoricalIdentity(entry.identity, 'promoted-subworkflow', `${path}.identity`);
        bindIdentity(identity, `${path}.identity`);
        promotedValidated.push({ identity, envelope: copyMaterial(entry.envelope, `${path}.envelope`), path });
    }
    const harnessValidated = [];
    for (const [index, entry] of harnessEntries.entries()) {
        const path = `input.harnessConfigs[${index}]`;
        requireOwnKeysExact(entry, ['identity', 'material'], path);
        requireMissingAndPresent(entry, ['identity', 'material'], path);
        const identity = requireHistoricalIdentity(entry.identity, 'harness-config', `${path}.identity`);
        bindIdentity(identity, `${path}.identity`);
        const material = copyMaterial(entry.material, `${path}.material`);
        if (typeof material !== 'object' || material === null || Array.isArray(material)) {
            fail('NOT_TRANSLATABLE', `${path}.material`, 'harness-config material must be a record; array or primitive material is ambiguous historical semantics');
        }
        harnessValidated.push({ identity, material });
    }
    // Phase 2 — interpret the promoted envelope surfaces (structure + exact
    // references). Ambiguous historical semantics fail closed here.
    const interpreted = promotedValidated.map((entry) => ({
        identity: entry.identity,
        envelope: entry.envelope,
        path: entry.path,
        ...interpretEnvelope(entry.envelope, `${entry.path}.envelope`),
    }));
    // Phase 3 — decision-source declarations: closed shape, closed source union,
    // explicit bindings. The recorded authority is the frozen source identity;
    // input order is erased by canonicalization.
    const sourceOrderIndex = new Map(COMPAT_DECISION_RESOLVER_SOURCE_ORDER.map((source, index) => [source, index]));
    const validatedDeclarations = [];
    const declaredDecisions = new Map();
    for (const [index, entry] of declarationEntries.entries()) {
        const path = `input.decisionSources[${index}]`;
        requireOwnKeysExact(entry, ['decisionId', 'source', 'artifact'], path);
        requireMissingAndPresent(entry, ['decisionId', 'source'], path);
        const decisionId = requireExactIdentity(entry.decisionId, `${path}.decisionId`);
        const sourceName = requireString(entry.source, `${path}.source`);
        if (!sourceOrderIndex.has(sourceName)) {
            fail('NOT_TRANSLATABLE', `${path}.source`, `'${sourceName}' is not a frozen DecisionResolver source; unknown or inferred sources (latest/default/first/registry-order) are never accepted`);
        }
        const source = sourceName;
        const existingSource = declaredDecisions.get(decisionId);
        if (existingSource !== undefined) {
            if (existingSource === source) {
                fail('DUPLICATE_COMPAT_IDENTITY', path, `decision '${decisionId}' is declared more than once`);
            }
            fail('CONFLICTING_COMPAT_IDENTITY', path, `decision '${decisionId}' is declared under conflicting sources ('${existingSource}' and '${source}'); the authoritative source is never reassigned by config order`);
        }
        declaredDecisions.set(decisionId, source);
        let artifact;
        if (entry.artifact !== undefined) {
            const expectedKind = source === 'promoted-subworkflow' ? 'promoted-subworkflow' : source === 'harness-machine' ? 'harness-config' : undefined;
            if (expectedKind === undefined) {
                fail('NOT_TRANSLATABLE', `${path}.artifact`, `source '${source}' binds no compat artifact; carrying one is ambiguous historical semantics`);
            }
            artifact = requireHistoricalIdentity(entry.artifact, expectedKind, `${path}.artifact`);
        }
        validatedDeclarations.push({ decisionId, source, artifact, path });
    }
    // Phase 4 — resolve declared artifact bindings against the bound identities:
    // missing -> typed missing; digest drift -> typed stale; never repaired.
    for (const declaration of validatedDeclarations) {
        if (declaration.artifact === undefined)
            continue;
        const bound = boundIdentities.get(declaration.artifact.artifactId);
        if (bound === undefined) {
            fail('MISSING_REFERENCED_COMPAT_ARTIFACT', `${declaration.path}.artifact`, `binds '${declaration.artifact.artifactId}', which is not part of this mapping input; a dangling binding is never emitted`);
        }
        if (bound.contentDigest !== declaration.artifact.contentDigest) {
            fail('STALE_COMPAT_IDENTITY', `${declaration.path}.artifact`, `binds '${declaration.artifact.artifactId}' at digest '${declaration.artifact.contentDigest}' but the bound identity carries '${bound.contentDigest}'; historical currentness is exact`);
        }
    }
    // Phase 5 — components: one ordinary semantic Component per historical
    // artifact, on the exact compat Kind, with the exact historical material.
    const components = [];
    const provenanceComponents = [];
    for (const entry of interpreted) {
        components.push({
            family: 'semantic',
            componentId: entry.identity.artifactId,
            kind: COMPAT_PROMOTED_SUBWORKFLOW_KIND,
            requiredSemanticContracts: [],
            requiredCapabilities: [],
            semanticBody: entry.envelope,
        });
    }
    for (const entry of harnessValidated) {
        components.push({
            family: 'semantic',
            componentId: entry.identity.artifactId,
            kind: COMPAT_HARNESS_CONFIG_KIND,
            requiredSemanticContracts: [],
            requiredCapabilities: [],
            semanticBody: entry.material,
        });
    }
    for (const identity of [...promotedValidated.map((entry) => entry.identity), ...harnessValidated.map((entry) => entry.identity)]) {
        provenanceComponents.push({
            componentId: identity.artifactId,
            historicalKind: identity.kind,
            historicalIdentity: {
                kind: identity.kind,
                artifactId: identity.artifactId,
                ...(identity.version !== undefined ? { version: identity.version } : {}),
                contentDigest: identity.contentDigest,
            },
        });
    }
    // Phase 6 — intra-concern typed relations: one exact relation per (source,
    // target) pair, targets resolved against the bound identities (missing ->
    // typed missing, digest drift -> typed stale). References outside the
    // compat concern stay exact historical material and produce no relation.
    const resolveConcernTarget = (reference, path) => {
        if (!CONCERN_ARTIFACT_KINDS.has(reference.kind))
            return '';
        const bound = boundIdentities.get(reference.artifactId);
        if (bound === undefined) {
            fail('MISSING_REFERENCED_COMPAT_ARTIFACT', path, `references '${reference.artifactId}', which is not bound in this mapping input; a dangling relation is never emitted`);
        }
        if (bound.kind !== reference.kind) {
            fail('CONFLICTING_COMPAT_IDENTITY', path, `references '${reference.artifactId}' as kind '${reference.kind}' but the bound identity is kind '${bound.kind}'`);
        }
        if (bound.contentDigest !== reference.contentDigest) {
            fail('STALE_COMPAT_IDENTITY', path, `references '${reference.artifactId}' at digest '${reference.contentDigest}' but the bound identity carries '${bound.contentDigest}'; historical currentness is exact`);
        }
        return reference.artifactId;
    };
    const relationsById = new Map();
    for (const entry of interpreted) {
        const targets = new Set();
        for (const [index, reference] of entry.referenceList.entries()) {
            const target = resolveConcernTarget(reference, `${entry.path}.envelope.references[${index}]`);
            if (target !== '')
                targets.add(target);
        }
        for (const reasoned of entry.reasonedReferences) {
            const target = resolveConcernTarget(reasoned.reference, reasoned.path);
            if (target !== '')
                targets.add(target);
        }
        for (const target of [...targets].sort(compareIds)) {
            const relationId = `${COMPAT_REFERENCES_RELATION_KIND}:${entry.identity.artifactId}:${target}`;
            relationsById.set(relationId, {
                relationId,
                relationKind: COMPAT_REFERENCES_RELATION_KIND,
                sourceComponentId: entry.identity.artifactId,
                targetComponentId: target,
            });
        }
    }
    const graph = {
        graphId,
        components: components.sort((a, b) => compareIds(a.componentId, b.componentId)),
        relations: [...relationsById.values()].sort((a, b) => compareIds(a.relationId, b.relationId)),
        nonMaterialExtensions: {
            adapter: COMPAT_ADAPTER_PROVENANCE_MARKER,
            envelopeSchemaVersion: COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION,
        },
    };
    const decisionSources = validatedDeclarations
        .map((declaration) => ({
        decisionId: declaration.decisionId,
        source: declaration.source,
        ...(declaration.artifact !== undefined
            ? {
                artifact: {
                    kind: declaration.artifact.kind,
                    artifactId: declaration.artifact.artifactId,
                    ...(declaration.artifact.version !== undefined ? { version: declaration.artifact.version } : {}),
                    contentDigest: declaration.artifact.contentDigest,
                },
            }
            : {}),
    }))
        .sort((a, b) => {
        const bySource = sourceOrderIndex.get(a.source) - sourceOrderIndex.get(b.source);
        return bySource !== 0 ? bySource : compareIds(a.decisionId, b.decisionId);
    });
    const provenance = {
        graphId,
        envelopeSchemaVersion: COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION,
        components: provenanceComponents.sort((a, b) => compareIds(a.componentId, b.componentId)),
        decisionSources,
    };
    // Standard envelope gate: the mapper creates no bypass around Component
    // validation. A failure here is an adapter defect, never tolerated.
    try {
        validateDefinitionGraphEnvelope(graph);
    }
    catch (error) {
        throw new CompatHarnessConfigMappingError('MAPPING_CONTRACT_VIOLATION', 'mapper.graph', `mapped graph failed the standard v0.7 envelope validation: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    return { graph, provenance };
}
