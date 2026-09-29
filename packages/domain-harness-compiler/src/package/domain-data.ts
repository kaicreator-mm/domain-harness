import { Buffer } from 'node:buffer';
import {
  canonicalJsonStringify,
  compiledDomainDataIdentityMaterial,
  type CompiledDomainDataDescriptor,
  type CompiledDomainDataSection,
  type JsonSchema,
  type JsonValue,
  type PackageDataBounds,
} from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../raw/types.js';
import { sha256Text } from './canonical.js';

export interface DomainDataCompileEntry {
  readonly key: string;
  readonly value: unknown;
  readonly valueSchema?: JsonSchema;
}

export class DomainDataCompileError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`successor Domain Data compilation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'DomainDataCompileError';
    this.issues = [...issues];
  }
}

const BOUND_KEYS = [
  'maxDomainDataEntries',
  'maxDomainDataEntryCanonicalBytes',
  'maxTotalDomainDataCanonicalBytes',
  'maxBusinessSources',
  'maxSchemaCanonicalBytes',
] as const satisfies readonly (keyof PackageDataBounds)[];

function normalizedJson<T extends JsonValue | JsonSchema>(value: unknown): T {
  return JSON.parse(canonicalJsonStringify(value)) as T;
}

function assertBounds(bounds: PackageDataBounds): void {
  const issues: string[] = [];
  for (const key of BOUND_KEYS) {
    const value = bounds[key];
    if (!Number.isSafeInteger(value) || value < 0) {
      issues.push(`packageDataBounds.${key} must be a non-negative safe integer`);
    }
  }
  if (issues.length > 0) throw new DomainDataCompileError(issues);
}

function projectionDomainDataIssues(
  projections: readonly RawProjectionDefinition[],
  declaredKeys: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  for (const projection of projections) {
    for (const dependency of projection.dependencies) {
      if (dependency.kind !== 'domain-data') continue;
      if (typeof dependency.key !== 'string' || dependency.key.length === 0) {
        issues.push(`projection '${projection.projectionId}' declares an empty Domain Data dependency key`);
        continue;
      }
      if (!declaredKeys.has(dependency.key)) {
        issues.push(
          `projection '${projection.projectionId}' references undeclared Domain Data key '${dependency.key}'`,
        );
      }
    }
  }
  return issues;
}

/**
 * Internal successor compiler primitive. Public compileDomainPackage() remains
 * frozen on 0.2/2/2 until central I-03-ASSEMBLY.
 */
export function buildCompiledDomainDataSection(
  entries: readonly DomainDataCompileEntry[],
  bounds: PackageDataBounds,
  projections: readonly RawProjectionDefinition[] = [],
): CompiledDomainDataSection {
  assertBounds(bounds);

  const issues: string[] = [];
  const seen = new Set<string>();
  const prepared: Array<{
    key: string;
    canonicalValue: string;
    value: JsonValue;
    valueSchema?: JsonSchema;
  }> = [];

  for (const entry of entries) {
    if (typeof entry?.key !== 'string' || entry.key.length === 0) {
      issues.push('Domain Data key must be a non-empty string');
      continue;
    }
    if (seen.has(entry.key)) {
      issues.push(`duplicate Domain Data key '${entry.key}'`);
      continue;
    }
    seen.add(entry.key);

    try {
      const canonicalValue = canonicalJsonStringify(entry.value);
      const value = JSON.parse(canonicalValue) as JsonValue;
      const valueSchema = entry.valueSchema === undefined
        ? undefined
        : normalizedJson<JsonSchema>(entry.valueSchema);
      prepared.push({
        key: entry.key,
        canonicalValue,
        value,
        ...(valueSchema === undefined ? {} : { valueSchema }),
      });
    } catch (error) {
      issues.push(
        `Domain Data '${entry.key}' is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  issues.push(...projectionDomainDataIssues(projections, seen));
  if (entries.length > bounds.maxDomainDataEntries) {
    issues.push(
      `Domain Data entry count ${entries.length} exceeds maxDomainDataEntries ${bounds.maxDomainDataEntries}`,
    );
  }

  let totalBytes = 0;
  for (const entry of prepared) {
    const bytes = Buffer.byteLength(entry.canonicalValue, 'utf8');
    totalBytes += bytes;
    if (bytes > bounds.maxDomainDataEntryCanonicalBytes) {
      issues.push(
        `Domain Data '${entry.key}' canonical bytes ${bytes} exceed maxDomainDataEntryCanonicalBytes ${bounds.maxDomainDataEntryCanonicalBytes}`,
      );
    }
  }
  if (totalBytes > bounds.maxTotalDomainDataCanonicalBytes) {
    issues.push(
      `aggregate Domain Data canonical bytes ${totalBytes} exceed maxTotalDomainDataCanonicalBytes ${bounds.maxTotalDomainDataCanonicalBytes}`,
    );
  }

  if (issues.length > 0) throw new DomainDataCompileError(issues);

  prepared.sort((left, right) => left.key.localeCompare(right.key));
  const descriptors: CompiledDomainDataDescriptor[] = prepared.map((entry) => ({
    key: entry.key,
    contentDigest: sha256Text(entry.canonicalValue),
    ...(entry.valueSchema === undefined ? {} : { valueSchema: entry.valueSchema }),
  }));
  const values = Object.create(null) as Record<string, JsonValue>;
  for (const entry of prepared) values[entry.key] = entry.value;

  const section: CompiledDomainDataSection = {
    descriptors,
    values,
    packageDataBounds: { ...bounds },
  };
  // Force the shared identity projection to remain type-compatible with this
  // compiler output; central assembly consumes the same authoritative helper.
  compiledDomainDataIdentityMaterial(section);
  return section;
}
