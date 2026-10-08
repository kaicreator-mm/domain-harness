/**
 * T008A — Raw authoring -> Component Graph strangler adapter (PACK-A #589,
 * thin issue #619).
 *
 * `COMPATIBILITY` boundary module (R2 MICROKERNEL_BOUNDARY): Raw authoring
 * material is evidence-input consumed from the existing compiler Raw modules;
 * it is NOT a v0.7 ontology root and never becomes runtime truth. Accepted Raw
 * is mapped deterministically onto the frozen v0.7 Definition contracts:
 *
 * - every Raw Tool becomes one `tool`-family Component whose body is exactly
 *   one `ToolOperationsDeclaration` (single `execute` operation — Raw Tools
 *   have no finer operation granularity, and none is invented);
 * - every Raw Workflow / Skill / Projection becomes one `semantic`-family
 *   Component carrying its behaviorally material Raw body as canonical JSON;
 * - tool/skill invokes become exact `invokes` relations (one per
 *   (workflow, target, kind) triple — repeated invokes never duplicate);
 * - `LogicalToolBindingConfig.resourceKey` becomes a T005A-shape logical
 *   resource requirement declaration (logical key only; endpoints,
 *   credentials and handles stay structurally unrepresentable);
 * - exact historical logical identity/provenance (ids, executionKind,
 *   bindingCapability, closed config, sourcePath, schemaVersion) is recorded
 *   verbatim in the mapping provenance and in non-material graph extensions —
 *   historical identity is never rewritten (strangler, not rewrite).
 *
 * Mapping guarantees (PACK-A):
 * - same Raw + same rules => same graph semantic digest (canonical copy sorts
 *   object keys recursively and preserves Raw array order; the produced graph
 *   is validated by the standard `validateDefinitionGraphEnvelope` gate);
 * - ambiguous or unrepresentable semantics fail typed with
 *   `NOT_TRANSLATABLE` — never a closest-match guess, never silent dropping;
 * - the produced graph is fully caller-isolated (deep canonical copies; no
 *   caller alias survives mapping), so post-mapping caller mutation cannot
 *   perturb the product;
 * - the product carries no reverse Raw authority: it is consumable only
 *   through the standard v0.7 Component/Definition contracts (envelope
 *   validation, must-understand admission, graph digest).
 *
 * Intentionally excluded (PACK-A boundaries): public compatibility promises
 * (T008C), harness-config/promoted-subworkflow special mapping (T008D), final
 * v0.6 delta (T008E). This module is internal to the compiler package: it is
 * not re-exported through any barrel.
 */
import {
  validateDefinitionGraphEnvelope,
  validateToolComponent,
  type CapabilityContractRef,
  type ComponentEnvelope,
  type ComponentId,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
  type KindRef,
} from '@kaicreator/domain-harness/v7';
import type {
  CapabilityId,
  JsonObject,
  JsonValue,
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawSkill,
  RawToolDefinition,
  RawWorkflow,
  ToolEffectSemantics,
} from '../../raw/types.js';

/** The only Raw authoring schema form the adapter accepts. */
export const RAW_V07_SUPPORTED_SCHEMA_VERSION = '0.1' as const;

/** Exact versioned KindRef the adapter binds Raw Tools to (open Kind contract). */
export const RAW_V07_TOOL_KIND: KindRef = Object.freeze({
  kindId: 'domain-harness.raw-authoring.tool',
  version: '1.0.0',
});

/** Exact versioned KindRef the adapter binds Raw Workflows to. */
export const RAW_V07_WORKFLOW_KIND: KindRef = Object.freeze({
  kindId: 'domain-harness.raw-authoring.workflow',
  version: '1.0.0',
});

/** Exact versioned KindRef the adapter binds Raw Skills to. */
export const RAW_V07_SKILL_KIND: KindRef = Object.freeze({
  kindId: 'domain-harness.raw-authoring.skill',
  version: '1.0.0',
});

/** Exact versioned KindRef the adapter binds Raw Projections to. */
export const RAW_V07_PROJECTION_KIND: KindRef = Object.freeze({
  kindId: 'domain-harness.raw-authoring.projection',
  version: '1.0.0',
});

/** Open exact relation kind used for tool/skill invokes from a workflow. */
export const RAW_V07_INVOKES_RELATION_KIND = 'invokes' as const;

/**
 * Raw Tools declare exactly one execution surface, so the mapped operation
 * identity is this fixed exact identity — never derived from target material.
 */
export const RAW_V07_EXECUTE_OPERATION_ID = 'execute' as const;

/** Marker recorded in graph `nonMaterialExtensions` (excluded from identity). */
export const RAW_V07_ADAPTER_PROVENANCE_MARKER = 'domain-harness.raw-v07-adapter' as const;

export type RawV07AdapterErrorCode =
  | 'UNSUPPORTED_RAW_SCHEMA_VERSION'
  | 'NOT_TRANSLATABLE'
  | 'INVALID_RAW_AUTHORING'
  | 'MAPPING_CONTRACT_VIOLATION';

/**
 * Typed fail-closed error for the Raw->Component Graph mapping. `path`
 * identifies the caller Raw location; no message ever normalizes or rewrites
 * the offending identity.
 */
export class RawV07AdapterError extends Error {
  readonly code: RawV07AdapterErrorCode;
  readonly path: string;

  constructor(code: RawV07AdapterErrorCode, path: string, reason: string, options?: { cause?: unknown }) {
    super(`raw authoring input at ${path}: ${reason}`, options);
    this.name = 'RawV07AdapterError';
    this.code = code;
    this.path = path;
  }
}

/** Accepted adapter input: authoring evidence only — no target/binding plane. */
export interface RawV07AuthoringInput {
  readonly raw: LoadedRawDomainPackage;
  readonly tools?: readonly RawToolDefinition[];
  readonly projections?: readonly RawProjectionDefinition[];
}

/** Provenance record of one mapped Component's exact historical identity. */
export interface RawV07ComponentProvenance {
  /** Component identity in the mapped graph (never rewritten). */
  readonly componentId: ComponentId;
  /** Which Raw family the Component was mapped from. */
  readonly sourceKind: 'workflow' | 'skill' | 'tool' | 'projection';
  /** Exact historical Raw identity material, deep-copied (never aliased). */
  readonly historicalIdentity: JsonObject;
}

/** Exact historical identity of the whole mapped Raw Domain Package. */
export interface RawV07MappingProvenance {
  readonly schemaVersion: '0.1';
  readonly domainId: string;
  readonly sourceRoot: string;
  readonly components: readonly RawV07ComponentProvenance[];
}

/** T005A-shape logical resource requirement (closed field set). */
export interface RawV07ResourceRequirement {
  readonly resourceKey: string;
  readonly required: boolean;
}

/**
 * T005A-shape logical resource requirement declaration keyed to exactly one
 * Tool Component. Structurally identical to the core
 * `ToolResourceRequirementsDeclaration`; consumers validate it through the
 * core contract.
 */
export interface RawV07ToolResourceDeclaration {
  readonly componentId: ComponentId;
  readonly requirements: readonly RawV07ResourceRequirement[];
}

/** Adapter output: an admitted-shape Component Graph plus mapping evidence. */
export interface RawV07GraphMappingResult {
  /** Bound Component Graph; passes `validateDefinitionGraphEnvelope`. */
  readonly graph: DefinitionGraphEnvelope;
  /** T005A-shape logical resource declarations for tools declaring resourceKey. */
  readonly resourceDeclarations: readonly RawV07ToolResourceDeclaration[];
  /** Exact historical identity/provenance evidence (mapping record). */
  readonly provenance: RawV07MappingProvenance;
}

// ---------------------------------------------------------------------------
// Exact-identity predicates (mirror the frozen record-safety matrix: no
// floating tokens, no range operators, no embedded `id@version` selectors, no
// x-range/partial versions). Validation only — never normalized.
// ---------------------------------------------------------------------------

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*', 'x']);

const RANGE_OPERATOR_PATTERN = /[\^~<>|*]/;

function fail(code: RawV07AdapterErrorCode, path: string, reason: string): never {
  throw new RawV07AdapterError(code, path, reason);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    fail('NOT_TRANSLATABLE', path, 'must be a string');
  }
  return value;
}

/** Non-empty, no floating/range selection, no embedded `id@version` selector. */
function isExactIdentity(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    !value.includes('@') &&
    !FLOATING_SELECTOR_TOKENS.has(trimmed.toLowerCase()) &&
    !RANGE_OPERATOR_PATTERN.test(value)
  );
}

/** Exact version: exact identity plus no x-range/partial version parts. */
function isExactVersion(value: string): boolean {
  if (!isExactIdentity(value)) return false;
  return !value.trim().split('.').some((part) => part.length === 0 || part.toLowerCase() === 'x');
}

function requireExactIdentity(value: unknown, path: string): string {
  const candidate = requireString(value, path);
  if (!isExactIdentity(candidate)) {
    fail(
      'NOT_TRANSLATABLE',
      path,
      'is not representable as an exact identity (empty, floating/range selection, or embedded `id@version` selector); historical identity is never rewritten',
    );
  }
  return candidate;
}

/**
 * Decompose a frozen Raw `CapabilityId` (`name@N`) into the exact
 * `{capabilityId, version}` contract-ref shape. Splitting is deterministic
 * (last `@` separator) and total on the frozen Raw form; anything outside
 * that form fails typed — never guessed.
 */
function mapCapabilityId(capabilityId: CapabilityId, path: string): CapabilityContractRef {
  const raw = requireString(capabilityId, path);
  const at = raw.lastIndexOf('@');
  const id = at === -1 ? '' : raw.slice(0, at);
  const version = at === -1 ? '' : raw.slice(at + 1);
  if (!isExactIdentity(id) || !isExactVersion(version)) {
    fail(
      'NOT_TRANSLATABLE',
      path,
      `capability identity '${raw}' is outside the frozen name@N form and cannot be represented as an exact {capabilityId, version} reference`,
    );
  }
  return { capabilityId: id, version };
}

/** Code-unit comparison only; `localeCompare` is environment-sensitive. */
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Canonical copy: descriptor-safe deep copy with recursively sorted object
// keys and preserved array order. Rejects (never silently drops) non-JSON
// material, accessors, symbol keys, non-enumerable properties, exotic
// prototypes and circular references. The result is fully caller-isolated.
// ---------------------------------------------------------------------------

function canonicalCopy(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('NOT_TRANSLATABLE', path, 'non-finite numbers are not portable JSON semantics');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') {
    fail('NOT_TRANSLATABLE', path, `unsupported value type ${typeof value} is not portable JSON`);
  }

  const record: object = value;
  if (Object.getOwnPropertySymbols(record).length > 0) {
    fail('NOT_TRANSLATABLE', path, 'symbol-keyed properties are not portable JSON');
  }
  if (ancestors.has(record)) {
    fail('NOT_TRANSLATABLE', path, 'circular references are not portable JSON');
  }

  if (Array.isArray(record)) {
    const source = record as unknown as Record<string, unknown>;
    const ownNames = Object.getOwnPropertyNames(source);
    const extra = ownNames.filter((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key));
    if (extra.length > 0) {
      fail('NOT_TRANSLATABLE', path, 'arrays carrying extra named properties are not portable JSON');
    }
    ancestors.add(record);
    const output: JsonValue[] = [];
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

  const prototype: unknown = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('NOT_TRANSLATABLE', path, 'values with exotic prototypes are not portable JSON');
  }
  const ownNames = Object.getOwnPropertyNames(record);
  const nonEnumerable = ownNames.filter((key) => !Object.prototype.propertyIsEnumerable.call(record, key));
  if (nonEnumerable.length > 0) {
    fail('NOT_TRANSLATABLE', path, 'non-enumerable properties are not portable JSON');
  }

  ancestors.add(record);
  const output: Record<string, JsonValue> = {};
  for (const key of ownNames.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)!;
    if (!('value' in descriptor)) {
      fail('NOT_TRANSLATABLE', `${path}.${key}`, 'accessor properties are not portable JSON');
    }
    if (descriptor.value === undefined) {
      fail('NOT_TRANSLATABLE', `${path}.${key}`, 'undefined is not portable JSON');
    }
    // Prototype-safe definition: plain assignment on the key `__proto__`
    // reaches the inherited Object.prototype setter instead of creating an own
    // property — an object/null value would mutate the copy's prototype and a
    // primitive value would be silently lost. defineProperty always creates
    // the exact own enumerable data property and never invokes any setter, so
    // an own data `__proto__` is preserved verbatim on a plain prototype.
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

/** Deep canonical, caller-isolated copy of Raw JSON material. */
function copyRawMaterial(value: unknown, path: string): JsonValue {
  return canonicalCopy(value, path, new Set<object>());
}

// ---------------------------------------------------------------------------
// Input guards
// ---------------------------------------------------------------------------

const TOOL_EFFECTS: readonly ToolEffectSemantics[] = Object.freeze([
  'none',
  'idempotent',
  'non-idempotent',
]);

function requireRawPackage(input: RawV07AuthoringInput): LoadedRawDomainPackage {
  const candidate: unknown = input;
  if (candidate === null || typeof candidate !== 'object') {
    fail('INVALID_RAW_AUTHORING', 'input', 'must be a RawV07AuthoringInput record');
  }
  const raw = (candidate as { raw?: unknown }).raw;
  if (raw === null || typeof raw !== 'object') {
    fail('INVALID_RAW_AUTHORING', 'input.raw', 'must be a LoadedRawDomainPackage');
  }
  const pkg = raw as {
    workflows?: unknown;
    skills?: unknown;
    scripts?: unknown;
    schemas?: unknown;
    childDependencies?: unknown;
  };
  for (const field of ['workflows', 'skills', 'scripts', 'schemas', 'childDependencies'] as const) {
    if (!(pkg[field] instanceof Map)) {
      fail('INVALID_RAW_AUTHORING', `input.raw.${field}`, 'must be a Map');
    }
  }
  return raw as LoadedRawDomainPackage;
}

function requireMaxSteps(raw: LoadedRawDomainPackage): number {
  const maxSteps = raw.limits?.maxSteps;
  if (typeof maxSteps !== 'number' || !Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    fail('NOT_TRANSLATABLE', 'input.raw.limits.maxSteps', 'must be a positive safe integer');
  }
  return maxSteps;
}

// ---------------------------------------------------------------------------
// Component mappers
// ---------------------------------------------------------------------------

interface MappedTool {
  envelope: ComponentEnvelope;
  declaration: RawV07ToolResourceDeclaration | undefined;
  provenance: RawV07ComponentProvenance;
}

function mapTool(tool: RawToolDefinition, path: string): MappedTool {
  if (tool === null || typeof tool !== 'object') {
    fail('INVALID_RAW_AUTHORING', path, 'must be a RawToolDefinition');
  }
  const toolId = requireExactIdentity(tool.toolId, `${path}.toolId`);
  const effect = tool.effect;
  if (!TOOL_EFFECTS.includes(effect)) {
    fail('NOT_TRANSLATABLE', `${path}.effect`, `must be exactly one of ${TOOL_EFFECTS.join(' | ')}`);
  }

  const requiredCapabilities = (tool.requiredCapabilities ?? [])
    .map((capability, index) => mapCapabilityId(capability, `${path}.requiredCapabilities[${index}]`))
    .sort((a, b) => compareIds(a.capabilityId, b.capabilityId));
  const seenCapabilities = new Set<string>();
  for (const ref of requiredCapabilities) {
    if (seenCapabilities.has(ref.capabilityId)) {
      fail(
        'NOT_TRANSLATABLE',
        `${path}.requiredCapabilities`,
        `capability '${ref.capabilityId}' is declared under more than one exact version`,
      );
    }
    seenCapabilities.add(ref.capabilityId);
  }

  const resourceKey = tool.config?.resourceKey;
  if (resourceKey !== undefined) {
    requireExactIdentity(resourceKey, `${path}.config.resourceKey`);
  }

  const operationsDeclaration: JsonValue = {
    operations: [
      {
        operationId: RAW_V07_EXECUTE_OPERATION_ID,
        inputSchema: tool.inputSchema === undefined ? {} : copyRawMaterial(tool.inputSchema, `${path}.inputSchema`),
        outputSchema: copyRawMaterial(tool.outputSchema, `${path}.outputSchema`),
        effect,
      },
    ],
    providesCapabilities: [],
  };

  const envelope: ComponentEnvelope = {
    family: 'tool',
    componentId: toolId,
    kind: RAW_V07_TOOL_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities,
    semanticBody: operationsDeclaration,
  };

  const declaration: RawV07ToolResourceDeclaration | undefined =
    resourceKey === undefined
      ? undefined
      : { componentId: toolId, requirements: [{ resourceKey, required: true }] };

  const provenance: RawV07ComponentProvenance = {
    componentId: toolId,
    sourceKind: 'tool',
    historicalIdentity: {
      toolId,
      ...(tool.executionKind !== undefined ? { executionKind: copyRawMaterial(tool.executionKind, `${path}.executionKind`) } : {}),
      ...(tool.bindingCapability !== undefined
        ? { bindingCapability: copyRawMaterial(tool.bindingCapability, `${path}.bindingCapability`) }
        : {}),
      ...(tool.config !== undefined ? { config: copyRawMaterial(tool.config, `${path}.config`) } : {}),
    },
  };

  return { envelope, declaration, provenance };
}

function mapWorkflow(
  workflow: RawWorkflow,
  maxSteps: number,
  path: string,
): { envelope: ComponentEnvelope; provenance: RawV07ComponentProvenance } {
  if (workflow === null || typeof workflow !== 'object') {
    fail('INVALID_RAW_AUTHORING', path, 'must be a RawWorkflow');
  }
  const workflowId = requireExactIdentity(workflow.id, `${path}.id`);

  const body: JsonValue = {
    initial: requireString(workflow.initial, `${path}.initial`),
    ...(workflow.output !== undefined ? { output: requireString(workflow.output, `${path}.output`) } : {}),
    states: copyRawMaterial(workflow.states ?? {}, `${path}.states`),
    limits: { maxSteps },
  };

  const envelope: ComponentEnvelope = {
    family: 'semantic',
    componentId: workflowId,
    kind: RAW_V07_WORKFLOW_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: body,
  };

  const provenance: RawV07ComponentProvenance = {
    componentId: workflowId,
    sourceKind: 'workflow',
    historicalIdentity: {
      workflowId,
      ...(workflow.sourcePath !== undefined
        ? { sourcePath: copyRawMaterial(workflow.sourcePath, `${path}.sourcePath`) }
        : {}),
    },
  };
  return { envelope, provenance };
}

function mapSkill(skill: RawSkill, path: string): { envelope: ComponentEnvelope; provenance: RawV07ComponentProvenance } {
  if (skill === null || typeof skill !== 'object') {
    fail('INVALID_RAW_AUTHORING', path, 'must be a RawSkill');
  }
  const skillId = requireExactIdentity(skill.id, `${path}.id`);

  const body: JsonValue = {
    instructions: copyRawMaterial(skill.instructions, `${path}.instructions`),
    ...(skill.inputSchema !== undefined ? { inputSchema: copyRawMaterial(skill.inputSchema, `${path}.inputSchema`) } : {}),
    outputSchema: copyRawMaterial(skill.outputSchema, `${path}.outputSchema`),
    resources: copyRawMaterial(skill.resources ?? [], `${path}.resources`),
    ...(skill.profile !== undefined ? { profile: copyRawMaterial(skill.profile, `${path}.profile`) } : {}),
  };

  const envelope: ComponentEnvelope = {
    family: 'semantic',
    componentId: skillId,
    kind: RAW_V07_SKILL_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: body,
  };

  const provenance: RawV07ComponentProvenance = {
    componentId: skillId,
    sourceKind: 'skill',
    historicalIdentity: {
      skillId,
      ...(skill.directory !== undefined ? { directory: copyRawMaterial(skill.directory, `${path}.directory`) } : {}),
    },
  };
  return { envelope, provenance };
}

function mapProjection(
  projection: RawProjectionDefinition,
  path: string,
): { envelope: ComponentEnvelope; provenance: RawV07ComponentProvenance } {
  if (projection === null || typeof projection !== 'object') {
    fail('INVALID_RAW_AUTHORING', path, 'must be a RawProjectionDefinition');
  }
  const projectionId = requireExactIdentity(projection.projectionId, `${path}.projectionId`);

  const body: JsonValue = {
    expression: requireString(projection.expression, `${path}.expression`),
    dependencies: copyRawMaterial(projection.dependencies ?? [], `${path}.dependencies`),
    outputSchema: copyRawMaterial(projection.outputSchema, `${path}.outputSchema`),
  };

  const envelope: ComponentEnvelope = {
    family: 'semantic',
    componentId: projectionId,
    kind: RAW_V07_PROJECTION_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: body,
  };

  const provenance: RawV07ComponentProvenance = {
    componentId: projectionId,
    sourceKind: 'projection',
    historicalIdentity: { projectionId },
  };
  return { envelope, provenance };
}

// ---------------------------------------------------------------------------
// Invoke scan: emits relations and enforces the accepted executable surface.
// ---------------------------------------------------------------------------

const ACCEPTED_INVOKE_KINDS = new Set(['tool', 'skill', 'expr']);

function scanInvokes(
  workflow: RawWorkflow,
  workflowPath: string,
  boundToolIds: ReadonlySet<string>,
  boundSkillIds: ReadonlySet<string>,
  relationTargets: Set<string>,
): void {
  for (const [stateId, state] of Object.entries(workflow.states ?? {})) {
    const invoke = state?.invoke;
    if (invoke === undefined) continue;
    const path = `${workflowPath}.states.${stateId}.invoke`;
    if (!ACCEPTED_INVOKE_KINDS.has(invoke.kind)) {
      fail(
        'NOT_TRANSLATABLE',
        `${path}.kind`,
        `invoke kind '${invoke.kind}' is outside the accepted Raw executable surface (top-level 'script'/'workflow' invokes and unknown kinds are not representable in a Component Graph; special legacy mapping is T008D, not this adapter)`,
      );
    }
    if (invoke.kind === 'expr') {
      if (typeof invoke.expression !== 'string' || invoke.expression.length === 0) {
        fail('NOT_TRANSLATABLE', `${path}.expression`, 'expr invoke must declare a non-empty expression');
      }
      continue;
    }
    const ref = requireString(invoke.ref, `${path}.ref`);
    if (ref.length === 0) {
      fail('NOT_TRANSLATABLE', `${path}.ref`, `${invoke.kind} invoke must declare a non-empty ref`);
    }
    const bound = invoke.kind === 'tool' ? boundToolIds.has(ref) : boundSkillIds.has(ref);
    if (!bound) {
      fail(
        'NOT_TRANSLATABLE',
        `${path}.ref`,
        `${invoke.kind} invoke references '${ref}', which is not bound in this authoring input; a dangling relation is never emitted`,
      );
    }
    relationTargets.add(ref);
  }
}

// ---------------------------------------------------------------------------
// Public mapping API
// ---------------------------------------------------------------------------

/**
 * Deterministically map accepted Raw authoring material to a v0.7 Component
 * Graph plus T005A-shape logical resource declarations and exact historical
 * provenance. Pure and synchronous: no I/O, no environment access, no
 * mutation of the caller input, no aliasing of caller-owned material.
 *
 * The produced graph is validated through the standard
 * `validateDefinitionGraphEnvelope` gate before returning; a violation there
 * is an adapter defect (`MAPPING_CONTRACT_VIOLATION`), never tolerated.
 */
export function mapRawV07AuthoringToComponentGraph(input: RawV07AuthoringInput): RawV07GraphMappingResult {
  const raw = requireRawPackage(input);

  const schemaVersion: unknown = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== RAW_V07_SUPPORTED_SCHEMA_VERSION) {
    fail(
      'UNSUPPORTED_RAW_SCHEMA_VERSION',
      'input.raw.schemaVersion',
      `is '${String(schemaVersion)}'; the adapter accepts exactly '${RAW_V07_SUPPORTED_SCHEMA_VERSION}'`,
    );
  }
  const domainId = requireExactIdentity(raw.domainId, 'input.raw.domainId');
  const maxSteps = requireMaxSteps(raw);
  if (typeof raw.root !== 'string') {
    fail('INVALID_RAW_AUTHORING', 'input.raw.root', 'must be a string; the provenance source root is never silently defaulted');
  }

  const components: ComponentEnvelope[] = [];
  const declarations: RawV07ToolResourceDeclaration[] = [];
  const provenanceComponents: RawV07ComponentProvenance[] = [];
  const boundIds = new Set<string>();

  const bind = (componentId: ComponentId, path: string): void => {
    if (boundIds.has(componentId)) {
      fail(
        'NOT_TRANSLATABLE',
        path,
        `componentId '${componentId}' collides across Raw families; the single v0.7 Component namespace cannot bind both without rewriting historical identity`,
      );
    }
    boundIds.add(componentId);
  };

  const tools = input.tools ?? [];
  const toolIds = new Set<string>();
  for (const [index, tool] of [...tools].entries()) {
    const mapped = mapTool(tool, `input.tools[${index}]`);
    if (toolIds.has(mapped.envelope.componentId)) {
      fail('NOT_TRANSLATABLE', `input.tools[${index}].toolId`, `duplicate tool '${mapped.envelope.componentId}'`);
    }
    toolIds.add(mapped.envelope.componentId);
    bind(mapped.envelope.componentId, `input.tools[${index}].toolId`);
    components.push(mapped.envelope);
    if (mapped.declaration) declarations.push(mapped.declaration);
    provenanceComponents.push(mapped.provenance);
  }

  const skillIds = new Set<string>();
  for (const [skillId, skill] of raw.skills.entries()) {
    const mapped = mapSkill(skill, `input.raw.skills.${skillId}`);
    if (skillIds.has(mapped.envelope.componentId)) {
      fail('NOT_TRANSLATABLE', `input.raw.skills.${skillId}.id`, `duplicate skill '${mapped.envelope.componentId}'`);
    }
    skillIds.add(mapped.envelope.componentId);
    bind(mapped.envelope.componentId, `input.raw.skills.${skillId}.id`);
    components.push(mapped.envelope);
    provenanceComponents.push(mapped.provenance);
  }

  for (const [workflowId, wf] of raw.workflows.entries()) {
    // Loader invariant (loadRawDomainPackage: workflows.set(id, workflow)): the
    // Map key IS the workflow id. Components bind by workflow.id while invoke
    // relations bind sourceComponentId by the Map key, so an unasserted
    // mismatch would cross-wire relations against the wrong workflow body —
    // the invariant is re-checked fail-closed like every other loader shape.
    if (wf?.id !== workflowId) {
      fail(
        'INVALID_RAW_AUTHORING',
        `input.raw.workflows.${workflowId}`,
        `workflow map key '${workflowId}' must equal workflow.id '${String(wf?.id)}' (loader invariant); a key/id mismatch would cross-wire invoke relations against the wrong workflow body`,
      );
    }
    const mapped = mapWorkflow(wf, maxSteps, `input.raw.workflows.${workflowId}`);
    bind(mapped.envelope.componentId, `input.raw.workflows.${workflowId}.id`);
    components.push(mapped.envelope);
    provenanceComponents.push(mapped.provenance);
  }

  const projections = input.projections ?? [];
  const projectionIds = new Set<string>();
  for (const [index, projection] of [...projections].entries()) {
    const mapped = mapProjection(projection, `input.projections[${index}]`);
    if (projectionIds.has(mapped.envelope.componentId)) {
      fail(
        'NOT_TRANSLATABLE',
        `input.projections[${index}].projectionId`,
        `duplicate projection '${mapped.envelope.componentId}'`,
      );
    }
    projectionIds.add(mapped.envelope.componentId);
    bind(mapped.envelope.componentId, `input.projections[${index}].projectionId`);
    components.push(mapped.envelope);
    provenanceComponents.push(mapped.provenance);
  }

  // Relations: one exact relation per (workflow, target, kind) invoke triple.
  const relationsById = new Map<string, DefinitionRelation>();
  for (const [workflowId, wf] of raw.workflows.entries()) {
    const relationTargets = new Set<string>();
    scanInvokes(
      wf,
      `input.raw.workflows.${workflowId}`,
      toolIds,
      skillIds,
      relationTargets,
    );
    for (const target of [...relationTargets].sort()) {
      const relationId = `${RAW_V07_INVOKES_RELATION_KIND}:${workflowId}:${target}`;
      relationsById.set(relationId, {
        relationId,
        relationKind: RAW_V07_INVOKES_RELATION_KIND,
        sourceComponentId: requireExactIdentity(workflowId, `input.raw.workflows.${workflowId}`),
        targetComponentId: target,
      });
    }
  }

  const graph: DefinitionGraphEnvelope = {
    graphId: domainId,
    components: components.sort((a, b) => compareIds(a.componentId, b.componentId)),
    relations: [...relationsById.values()].sort((a, b) => compareIds(a.relationId, b.relationId)),
    nonMaterialExtensions: {
      adapter: RAW_V07_ADAPTER_PROVENANCE_MARKER,
      sourceSchemaVersion: RAW_V07_SUPPORTED_SCHEMA_VERSION,
      sourceDomainId: domainId,
    },
  };

  const provenance: RawV07MappingProvenance = {
    schemaVersion: RAW_V07_SUPPORTED_SCHEMA_VERSION,
    domainId,
    sourceRoot: raw.root,
    components: provenanceComponents.sort((a, b) => compareIds(a.componentId, b.componentId)),
  };

  // Standard envelope gate: the adapter creates no bypass around Component
  // validation. A failure here is an adapter defect, never tolerated.
  try {
    validateDefinitionGraphEnvelope(graph);
    for (const component of components) {
      if (component.family === 'tool') validateToolComponent(component);
    }
  } catch (error) {
    throw new RawV07AdapterError(
      'MAPPING_CONTRACT_VIOLATION',
      'adapter.graph',
      `mapped graph failed the standard v0.7 envelope validation: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return {
    graph,
    resourceDeclarations: declarations.sort((a, b) => compareIds(a.componentId, b.componentId)),
    provenance,
  };
}
