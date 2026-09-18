import type {
  CapabilityId,
  JsonObject,
  JsonSchema,
  JsonValue,
  RawProjectionDependency,
  TargetHostProfile,
  ToolEffectSemantics,
} from '../raw/types.js';
import { canonicalJson, sha256Canonical, sha256Text } from './canonical.js';

export interface CompiledMessageContract {
  type: string;
  version?: string;
  payloadSchema: JsonSchema;
}

export interface CompiledWorkflowDescriptor {
  workflowId: string;
  definition: JsonObject;
  messageContracts: Readonly<Record<string, CompiledMessageContract>>;
}

export interface CompiledBindingDescriptor {
  kind: string;
  bindingId: string;
  digest?: string;
  config?: JsonValue;
}

export interface CompiledToolDescriptor {
  toolId: string;
  inputSchema?: JsonSchema;
  outputSchema: JsonSchema;
  effect: ToolEffectSemantics;
  execution: CompiledBindingDescriptor;
  requiredCapabilities: readonly CapabilityId[];
}

export type ProjectionDependencyDescriptor = RawProjectionDependency;

export interface CompiledProjectionDescriptor {
  projectionId: string;
  expression: string;
  dependencies: readonly ProjectionDependencyDescriptor[];
  outputSchema: JsonSchema;
}

export interface CompiledPackageManifest {
  formatVersion: string;
  runtimeContractMajor: number;
  executionEngineMajor: number;
  domainId: string;
  domainVersion: string;
  packageId: string;
  targetProfileId: string;
  requiredCapabilities: readonly CapabilityId[];
  workflows: Readonly<Record<string, CompiledWorkflowDescriptor>>;
  tools: Readonly<Record<string, CompiledToolDescriptor>>;
  projections: Readonly<Record<string, CompiledProjectionDescriptor>>;
  schemas: Readonly<Record<string, JsonSchema>>;
  bindingDigests: Readonly<Record<string, string>>;
  compatibility?: JsonObject;
}

export type ManifestWithoutPackageId = Omit<CompiledPackageManifest, 'packageId'>;

const FORBIDDEN_RUNTIME_KEYS = /^(?:secret|secrets|token|accessToken|refreshToken|password|credential|credentials|session|sessionId|endpoint|database|databasePath|dbPath|connection|connectionString|handle|runtimeResources?)$/i;

export class CompiledManifestValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Compiled package manifest is invalid:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'CompiledManifestValidationError';
    this.issues = [...issues];
  }
}

function inspectForbiddenRuntimeValues(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectForbiddenRuntimeValues(item, `${path}[${index}]`, issues));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_RUNTIME_KEYS.test(key)) issues.push(`${path}.${key} is runtime-only and must not be compiled into the package`);
    inspectForbiddenRuntimeValues(item, `${path}.${key}`, issues);
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
  if (manifest.formatVersion !== '0.2') issues.push(`formatVersion must be '0.2'`);
  if (manifest.runtimeContractMajor !== 2) issues.push('runtimeContractMajor must be 2');
  if (manifest.executionEngineMajor !== 2) issues.push('executionEngineMajor must be 2');
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
  }
  for (const [key, projection] of Object.entries(manifest.projections)) {
    if (key !== projection.projectionId) issues.push(`projection record key '${key}' does not match projectionId '${projection.projectionId}'`);
  }
  for (const [toolId, tool] of Object.entries(manifest.tools)) {
    if (tool.execution.config !== undefined) inspectForbiddenRuntimeValues(tool.execution.config, `$.tools.${toolId}.execution.config`, issues);
  }
  const expectedId = sha256Canonical(manifestIdentityMaterial(manifest));
  if (manifest.packageId !== expectedId) issues.push(`packageId mismatch: expected '${expectedId}'`);
  if (issues.length) throw new CompiledManifestValidationError(issues);
}
