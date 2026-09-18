import type { CapabilityId } from '../v2/contracts/capability.js';
import type { Sha256Port } from '../v2/contracts/host.js';
import type {
  CompiledPackageManifest,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import { PackageActivationError } from './errors.js';

export interface CompiledPackageValidationPolicy {
  readonly formatVersion: string;
  readonly runtimeContractMajor: number;
  readonly executionEngineMajor: number;
  readonly hostCapabilities: readonly CapabilityId[];
  readonly sha256: Sha256Port;
  readonly targetProfileId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function requireRecordField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = record[field];
  if (!isRecord(value)) {
    throw new PackageActivationError(
      'INVALID_COMPILED_PACKAGE',
      `compiled package manifest field "${field}" must be an object`,
    );
  }
  return value;
}

function requireStringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new PackageActivationError(
      'INVALID_COMPILED_PACKAGE',
      `compiled package manifest field "${field}" must be a non-empty string`,
    );
  }
  return value;
}

function requireIntegerField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new PackageActivationError(
      'INVALID_COMPILED_PACKAGE',
      `compiled package manifest field "${field}" must be a non-negative integer`,
    );
  }
  return value;
}

function validateManifestShape(value: unknown): asserts value is CompiledPackageManifest {
  if (!isRecord(value)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package manifest must be an object');
  }

  requireStringField(value, 'formatVersion');
  requireIntegerField(value, 'runtimeContractMajor');
  requireIntegerField(value, 'executionEngineMajor');
  requireStringField(value, 'domainId');
  requireStringField(value, 'domainVersion');
  requireStringField(value, 'packageId');
  requireStringField(value, 'targetProfileId');

  if (!isStringArray(value.requiredCapabilities)) {
    throw new PackageActivationError(
      'INVALID_COMPILED_PACKAGE',
      'compiled package manifest field "requiredCapabilities" must be a string array',
    );
  }

  requireRecordField(value, 'workflows');
  const tools = requireRecordField(value, 'tools');
  requireRecordField(value, 'projections');
  requireRecordField(value, 'schemas');
  const bindingDigests = requireRecordField(value, 'bindingDigests');

  for (const [bindingId, digest] of Object.entries(bindingDigests)) {
    if (bindingId.length === 0 || typeof digest !== 'string' || digest.length === 0) {
      throw new PackageActivationError(
        'INVALID_COMPILED_PACKAGE',
        'bindingDigests must map non-empty binding ids to non-empty digest strings',
      );
    }
  }

  for (const [toolKey, toolValue] of Object.entries(tools)) {
    if (!isRecord(toolValue)) {
      throw new PackageActivationError('INVALID_COMPILED_PACKAGE', `tool "${toolKey}" must be an object`);
    }
    requireStringField(toolValue, 'toolId');
    const execution = requireRecordField(toolValue, 'execution');
    const bindingId = requireStringField(execution, 'bindingId');
    requireStringField(execution, 'kind');
    if (!isStringArray(toolValue.requiredCapabilities)) {
      throw new PackageActivationError(
        'INVALID_COMPILED_PACKAGE',
        `tool "${toolKey}" requiredCapabilities must be a string array`,
      );
    }
    const manifestDigest = bindingDigests[bindingId];
    if (typeof manifestDigest !== 'string' || manifestDigest.length === 0) {
      throw new PackageActivationError(
        'BINDING_DIGEST_MISMATCH',
        `tool "${toolKey}" binding "${bindingId}" has no manifest binding digest`,
      );
    }
    if (execution.digest !== undefined && execution.digest !== manifestDigest) {
      throw new PackageActivationError(
        'BINDING_DIGEST_MISMATCH',
        `tool "${toolKey}" binding digest does not match manifest bindingDigests`,
      );
    }
  }
}

function validateBindings(
  manifest: CompiledPackageManifest,
  bindings: unknown,
): asserts bindings is TargetCompiledDomainPackage['bindings'] {
  if (!isRecord(bindings)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package bindings must be an object');
  }

  for (const [toolKey, tool] of Object.entries(manifest.tools)) {
    const bindingId = tool.execution.bindingId;
    if (!Object.prototype.hasOwnProperty.call(bindings, bindingId)) {
      throw new PackageActivationError(
        'MISSING_BINDING',
        `compiled package is missing executable binding "${bindingId}" required by tool "${toolKey}"`,
      );
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) result[key] = canonicalize(child);
    }
    return result;
  }
  return value;
}

export function canonicalPackageIdentityMaterial(manifest: CompiledPackageManifest): string {
  const { packageId: _packageId, ...identityMaterial } = manifest;
  return JSON.stringify(canonicalize(identityMaterial));
}

export async function computeCompiledPackageId(
  manifest: CompiledPackageManifest,
  sha256: Sha256Port,
): Promise<string> {
  return sha256.digestUtf8(canonicalPackageIdentityMaterial(manifest));
}

function validateCompatibility(
  manifest: CompiledPackageManifest,
  policy: CompiledPackageValidationPolicy,
): void {
  const mismatches: string[] = [];
  if (manifest.formatVersion !== policy.formatVersion) {
    mismatches.push(`formatVersion expected=${policy.formatVersion} actual=${manifest.formatVersion}`);
  }
  if (manifest.runtimeContractMajor !== policy.runtimeContractMajor) {
    mismatches.push(
      `runtimeContractMajor expected=${policy.runtimeContractMajor} actual=${manifest.runtimeContractMajor}`,
    );
  }
  if (manifest.executionEngineMajor !== policy.executionEngineMajor) {
    mismatches.push(
      `executionEngineMajor expected=${policy.executionEngineMajor} actual=${manifest.executionEngineMajor}`,
    );
  }
  if (policy.targetProfileId !== undefined && manifest.targetProfileId !== policy.targetProfileId) {
    mismatches.push(`targetProfileId expected=${policy.targetProfileId} actual=${manifest.targetProfileId}`);
  }

  const available = new Set<string>(policy.hostCapabilities);
  for (const capability of manifest.requiredCapabilities) {
    if (!available.has(capability)) mismatches.push(`missing host capability ${capability}`);
  }
  for (const tool of Object.values(manifest.tools)) {
    for (const capability of tool.requiredCapabilities) {
      if (!available.has(capability)) mismatches.push(`missing host capability ${capability}`);
    }
  }

  if (mismatches.length > 0) {
    throw new PackageActivationError(
      'INCOMPATIBLE_PACKAGE',
      'compiled package is incompatible with this runtime/host',
      [...new Set(mismatches)].sort(),
    );
  }
}

export async function validateCompiledPackage(
  value: unknown,
  policy: CompiledPackageValidationPolicy,
): Promise<TargetCompiledDomainPackage> {
  if (!isRecord(value)) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package must be an object');
  }

  validateManifestShape(value.manifest);
  validateBindings(value.manifest, value.bindings);
  validateCompatibility(value.manifest, policy);

  const calculatedPackageId = await computeCompiledPackageId(value.manifest, policy.sha256);
  if (calculatedPackageId !== value.manifest.packageId) {
    throw new PackageActivationError(
      'PACKAGE_ID_MISMATCH',
      'compiled package identity does not match canonical manifest identity',
      [`expected=${value.manifest.packageId}`, `actual=${calculatedPackageId}`],
    );
  }

  return value as unknown as TargetCompiledDomainPackage;
}
