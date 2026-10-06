import type {
  CapabilityId,
  TargetHostProfile,
} from '../raw/types.js';
import type {
  CompiledBindingDescriptor,
  CompiledMessageContract,
  CompiledPackageManifest,
  CompiledProjectionDescriptor,
  CompiledToolDescriptor,
  CompiledWorkflowDescriptor,
  ProjectionDependencyDescriptor,
} from '@kaicreator/domain-harness/v2';
import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  semanticDecisionManifestIssues,
} from '@kaicreator/domain-harness/v2';
import { canonicalJson, sha256Canonical, sha256Text } from './canonical.js';

// The compiled artifact contracts have exactly one authoritative owner: the
// core v2 contracts consumed by activation and the Runtime (frozen L2
// dependency rule "compiler -> core contracts", issue #164). The re-exports
// keep historical compiler-side import paths working while producer and
// consumer now share one TypeScript source of truth - a stale compiler can no
// longer emit an artifact that only looks assignable.
export type {
  CompiledBindingDescriptor,
  CompiledMessageContract,
  CompiledPackageManifest,
  CompiledProjectionDescriptor,
  CompiledToolDescriptor,
  CompiledWorkflowDescriptor,
  ProjectionDependencyDescriptor,
};

export type ManifestWithoutPackageId = Omit<CompiledPackageManifest, 'packageId'>;

/**
 * Closed logical binding config schema: the complete set of compile-time fields
 * an executable Tool config may carry, matching the logical binding fields of
 * the v0.2 runtime binding contracts (remote HTTP/JSON). Every field is logical
 * compile-time metadata (a Runtime Resource *reference*, never a value).
 * Anything outside this set is rejected, so runtime/credential material cannot
 * enter under any key name. This is an allowlist of structure, not a
 * secret-name denylist.
 */
const LOGICAL_CONFIG_FIELDS: ReadonlySet<string> = new Set(['transport', 'resourceKey', 'path', 'method']);
const LOGICAL_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LOGICAL_TRANSPORT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;

function isLogicalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !/\s/u.test(value);
}

export class InvalidToolConfigError extends Error {
  readonly issues: readonly string[];

  constructor(toolId: string, issues: readonly string[]) {
    super(`tool '${toolId}' executable config is not a closed logical binding descriptor:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'InvalidToolConfigError';
    this.issues = [...issues];
  }
}

/**
 * Structural validation of executable Tool config against the closed logical
 * binding schema. Runtime resources/secrets are unrepresentable by
 * construction: unknown keys, nested structures, arrays, scalars and
 * non-logical field values are all rejected.
 */
export function toolConfigIssues(config: unknown, path: string): string[] {
  const issues: string[] = [];
  if (Array.isArray(config) || config === null || typeof config !== 'object') {
    issues.push(`${path} must be a closed logical binding object (transport/resourceKey/path/method only); arrays, scalars and runtime values are rejected`);
    return issues;
  }
  for (const key of Object.keys(config)) {
    if (!LOGICAL_CONFIG_FIELDS.has(key)) {
      issues.push(`${path}.${key} is outside the closed logical binding schema; runtime resources/secrets must never be compile-time Tool config`);
    }
  }
  const source = config as Record<string, unknown>;
  const transport = source.transport;
  if (transport !== undefined && (typeof transport !== 'string' || !LOGICAL_TRANSPORT_PATTERN.test(transport))) {
    issues.push(`${path}.transport must be a logical transport capability id (pattern ${LOGICAL_TRANSPORT_PATTERN.source}); endpoint/URL values are rejected`);
  }
  const resourceKey = source.resourceKey;
  if (resourceKey !== undefined && (typeof resourceKey !== 'string' || !LOGICAL_IDENTIFIER_PATTERN.test(resourceKey))) {
    issues.push(`${path}.resourceKey must be a logical identifier (pattern ${LOGICAL_IDENTIFIER_PATTERN.source}); endpoint/credential/connection values are rejected`);
  }
  const configPath = source.path;
  if (configPath !== undefined && (typeof configPath !== 'string' || !isLogicalPath(configPath))) {
    issues.push(`${path}.path must be a single-root logical path beginning with / (pattern of remote-http-json@1); absolute/protocol-relative URLs are rejected`);
  }
  const method = source.method;
  if (method !== undefined && method !== 'POST') {
    issues.push(`${path}.method must be the logical HTTP method 'POST' (remote HTTP/JSON v1); transport/auth values are rejected`);
  }
  return issues;
}

export class CompiledManifestValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Compiled package manifest is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'CompiledManifestValidationError';
    this.issues = [...issues];
  }
}

export class MissingBindingContentError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`no immutable binding content identity supplied for target bindings: ${missing.join(', ')}`);
    this.name = 'MissingBindingContentError';
    this.missing = [...missing];
  }
}

/** Content identity of a target binding artifact. Path/location must never enter this value. */
export function bindingContentDigest(content: string): string {
  return sha256Text(content);
}

/** Digest recorded in `manifest.bindingDigests`: binds the binding slot to its artifact content identity. */
export function bindingArtifactDigest(bindingId: string, content: string): string {
  return sha256Canonical({ bindingId, contentDigest: bindingContentDigest(content) });
}

export function buildBindingDigests(
  target: TargetHostProfile,
  required: readonly CapabilityId[],
  bindingContents: Readonly<Record<string, string>>,
): Record<string, string> {
  const boundBindingIds = new Set<string>();
  for (const capability of required) {
    const bindingId = target.bindings[capability];
    if (bindingId) boundBindingIds.add(bindingId);
  }
  const missing = [...boundBindingIds]
    .filter((bindingId) => {
      const content = bindingContents[bindingId];
      return typeof content !== 'string' || content.length === 0;
    })
    .sort();
  if (missing.length) throw new MissingBindingContentError(missing);
  return Object.fromEntries(
    [...boundBindingIds]
      .sort((a, b) => a.localeCompare(b))
      .map((bindingId) => [bindingId, bindingArtifactDigest(bindingId, bindingContents[bindingId] as string)]),
  );
}

export function buildCompiledPackageManifest(input: ManifestWithoutPackageId): CompiledPackageManifest {
  const normalized: ManifestWithoutPackageId = {
    ...input,
    requiredCapabilities: [...input.requiredCapabilities].sort(),
    workflows: Object.fromEntries(Object.entries(input.workflows).sort(([a], [b]) => a.localeCompare(b))),
    tools: Object.fromEntries(Object.entries(input.tools).sort(([a], [b]) => a.localeCompare(b))),
    projections: Object.fromEntries(Object.entries(input.projections).sort(([a], [b]) => a.localeCompare(b))),
    schemas: Object.fromEntries(Object.entries(input.schemas).sort(([a], [b]) => a.localeCompare(b))),
    bindingDigests: Object.fromEntries(Object.entries(input.bindingDigests).sort(([a], [b]) => a.localeCompare(b))),
  };
  const packageId = sha256Canonical(normalized);
  const manifest: CompiledPackageManifest = { ...normalized, packageId };
  assertCompiledPackageManifest(manifest);
  return manifest;
}

export function manifestIdentityMaterial(manifest: CompiledPackageManifest): ManifestWithoutPackageId {
  const { packageId: _packageId, ...identity } = manifest;
  return identity;
}

export function assertCompiledPackageManifest(manifest: CompiledPackageManifest): void {
  const issues: string[] = [];
  try {
    canonicalJson(manifest);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (!manifest.domainId) issues.push('domainId must be non-empty');
  if (!manifest.domainVersion) issues.push('domainVersion must be non-empty');
  if (!manifest.targetProfileId) issues.push('targetProfileId must be non-empty');

  // Exact profile dispatch (L2 §2.3): exactly one of the frozen tuples is
  // acceptable, and successor-only material is valid only on the successor
  // tuple. A retained 0.2/2/2 manifest carrying successor fields would blur
  // the identity boundary between the two artifact generations.
  const isLegacyTuple = manifest.formatVersion === '0.2'
    && manifest.runtimeContractMajor === 2
    && manifest.executionEngineMajor === 2;
  const isSuccessorTuple = manifest.formatVersion === '0.3'
    && manifest.runtimeContractMajor === 2
    && manifest.executionEngineMajor === 3;
  if (!isLegacyTuple && !isSuccessorTuple) {
    if (manifest.formatVersion !== '0.2' && manifest.formatVersion !== '0.3') {
      issues.push(`formatVersion must be '0.2' or '0.3'`);
    } else {
      issues.push(
        `profile tuple ${manifest.formatVersion}/${manifest.runtimeContractMajor}/${manifest.executionEngineMajor} is not a supported compiled-artifact profile`,
      );
    }
  }
  if (isLegacyTuple) {
    if (manifest.schemaContractVersion !== undefined) issues.push('schemaContractVersion is successor-only material and must be absent on a 0.2/2/2 manifest');
    if (manifest.packageDataBounds !== undefined) issues.push('packageDataBounds is successor-only material and must be absent on a 0.2/2/2 manifest');
    if (manifest.domainData !== undefined) issues.push('domainData is successor-only material and must be absent on a 0.2/2/2 manifest');
    if (manifest.businessSources !== undefined) issues.push('businessSources is successor-only material and must be absent on a 0.2/2/2 manifest');
    if (manifest.semanticDecisions !== undefined) issues.push('semanticDecisions is successor-only material and must be absent on a 0.2/2/2 manifest');
    if (manifest.semanticDecisionContractVersion !== undefined) issues.push('semanticDecisionContractVersion is successor-only material and must be absent on a 0.2/2/2 manifest');
  }
  if (isSuccessorTuple) {
    if (manifest.schemaContractVersion !== DOMAIN_HARNESS_JSON_SCHEMA_V1) {
      issues.push(`schemaContractVersion must be exactly ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`);
    }
    issues.push(...packageDataBoundsIssues(manifest.packageDataBounds));
    if (manifest.domainData === undefined) issues.push('domainData descriptors are required on a 0.3/2/3 manifest');
    if (manifest.businessSources === undefined) issues.push('businessSources descriptors are required on a 0.3/2/3 manifest');
    issues.push(...semanticDecisionManifestPlacementIssues(manifest));
  }
  const requiredSet = new Set(manifest.requiredCapabilities);
  if (requiredSet.size !== manifest.requiredCapabilities.length) issues.push('requiredCapabilities contains duplicates');
  for (const [key, workflow] of Object.entries(manifest.workflows)) {
    if (key !== workflow.workflowId) issues.push(`workflow record key '${key}' does not match workflowId '${workflow.workflowId}'`);
    for (const [messageType, contract] of Object.entries(workflow.messageContracts)) {
      if (messageType !== contract.type) issues.push(`workflow '${key}' message key '${messageType}' does not match contract type '${contract.type}'`);
    }
  }
  for (const [key, tool] of Object.entries(manifest.tools)) {
    if (key !== tool.toolId) issues.push(`tool record key '${key}' does not match toolId '${tool.toolId}'`);
    for (const capability of tool.requiredCapabilities) {
      if (!requiredSet.has(capability)) issues.push(`tool '${key}' requires capability '${capability}' absent from package requiredCapabilities`);
    }
    const digest = tool.execution.digest;
    if (digest && manifest.bindingDigests[tool.execution.bindingId] !== digest) {
      issues.push(`tool '${key}' binding digest does not match bindingDigests['${tool.execution.bindingId}']`);
    }
    if (tool.execution.config !== undefined) {
      issues.push(...toolConfigIssues(tool.execution.config, `$.tools.${key}.execution.config`));
    }
  }
  for (const [key, projection] of Object.entries(manifest.projections)) {
    if (key !== projection.projectionId) issues.push(`projection record key '${key}' does not match projectionId '${projection.projectionId}'`);
  }
  const expectedId = sha256Canonical(manifestIdentityMaterial(manifest));
  if (manifest.packageId !== expectedId) issues.push(`packageId mismatch: expected '${expectedId}'`);
  if (issues.length) throw new CompiledManifestValidationError(issues);
}

/**
 * v0.6 T001 (issue #497, frozen L2 A2/A7) manifest placement rules for
 * compiled semantic decision declarations: version and descriptors are
 * present together under the exact frozen declaration contract version, the
 * compiled semantic-decision capability is declared, and every descriptor
 * passes the compiler-independent structural validation. Unsupported or
 * malformed material fails closed here instead of being silently ignored.
 */
function semanticDecisionManifestPlacementIssues(manifest: CompiledPackageManifest): string[] {
  const decisions = manifest.semanticDecisions;
  const version = manifest.semanticDecisionContractVersion;
  if (decisions === undefined && version === undefined) return [];
  if (decisions === undefined || version === undefined) {
    return ['semanticDecisionContractVersion and semanticDecisions must be present together'];
  }
  const issues: string[] = [];
  if (version !== SEMANTIC_DECISION_CONTRACT_VERSION_V1) {
    issues.push(`semanticDecisionContractVersion must be exactly ${String(SEMANTIC_DECISION_CONTRACT_VERSION_V1)}`);
  }
  if (!manifest.requiredCapabilities.includes(SEMANTIC_DECISION_CAPABILITY)) {
    issues.push(`semantic-decision declarations require capability '${SEMANTIC_DECISION_CAPABILITY}' in requiredCapabilities`);
  }
  issues.push(...semanticDecisionManifestIssues(decisions));
  return issues;
}

const PACKAGE_DATA_BOUND_KEYS = [
  'maxDomainDataEntries',
  'maxDomainDataEntryCanonicalBytes',
  'maxTotalDomainDataCanonicalBytes',
  'maxBusinessSources',
  'maxSchemaCanonicalBytes',
] as const;

function packageDataBoundsIssues(value: unknown): string[] {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['packageDataBounds must be an object on a 0.3/2/3 manifest'];
  }
  const issues: string[] = [];
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...PACKAGE_DATA_BOUND_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    return ['packageDataBounds must contain exactly the frozen package-data bound fields'];
  }
  const bounds = value as Record<string, unknown>;
  for (const key of PACKAGE_DATA_BOUND_KEYS) {
    const bound = bounds[key];
    if (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 0) {
      issues.push(`packageDataBounds.${key} must be a non-negative safe integer`);
    }
  }
  return issues;
}
