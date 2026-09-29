import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  DomainHarnessJsonSchemaV1Validator,
  canonicalSchemaUtf8ByteLength,
  compareCompiledBusinessSourceKeys,
  type CompiledBusinessSourceDescriptor,
  type CompiledBusinessSourceSection,
  type JsonSchema,
  type PackageDataBounds,
} from '@kaicreator/domain-harness/v2';
import type { RawProjectionDefinition } from '../raw/types.js';

export interface BusinessSourceCompileEntry {
  readonly source: string;
  readonly valueSchema: JsonSchema;
}

export class BusinessSourceCompileError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`successor Business Source compilation failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'BusinessSourceCompileError';
    this.issues = [...issues];
  }
}

function projectionBusinessSourceIssues(
  projections: readonly RawProjectionDefinition[],
  declaredSources: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  for (const projection of projections) {
    for (const dependency of projection.dependencies) {
      if (dependency.kind !== 'business') continue;
      if (typeof dependency.source !== 'string' || dependency.source.length === 0) {
        issues.push(`projection '${projection.projectionId}' declares an empty Business Source`);
        continue;
      }
      if (!declaredSources.has(dependency.source)) {
        issues.push(
          `projection '${projection.projectionId}' references undeclared Business Source '${dependency.source}'`,
        );
      }
    }
  }
  return issues;
}

/**
 * Internal successor compiler primitive. This implements Mode-A schema
 * interpretation only. No compiler-emitted validator bytes are produced here,
 * so no `validatorBindingDigest` is fabricated.
 */
export function buildCompiledBusinessSourceSection(
  entries: readonly BusinessSourceCompileEntry[],
  bounds: PackageDataBounds,
  projections: readonly RawProjectionDefinition[],
): CompiledBusinessSourceSection {
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const issues: string[] = [];
  const seen = new Set<string>();
  const descriptors: CompiledBusinessSourceDescriptor[] = [];

  if (!Number.isSafeInteger(bounds.maxBusinessSources) || bounds.maxBusinessSources < 0) {
    issues.push('packageDataBounds.maxBusinessSources must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(bounds.maxSchemaCanonicalBytes) || bounds.maxSchemaCanonicalBytes < 0) {
    issues.push('packageDataBounds.maxSchemaCanonicalBytes must be a non-negative safe integer');
  }

  for (const entry of entries) {
    if (typeof entry?.source !== 'string' || entry.source.length === 0) {
      issues.push('Business Source name must be a non-empty string');
      continue;
    }
    if (seen.has(entry.source)) {
      issues.push(`duplicate Business Source '${entry.source}'`);
      continue;
    }
    seen.add(entry.source);

    try {
      const valueSchema = validator.normalizeSchema(entry.valueSchema);
      const schemaBytes = canonicalSchemaUtf8ByteLength(valueSchema);
      if (schemaBytes > bounds.maxSchemaCanonicalBytes) {
        issues.push(
          `Business Source '${entry.source}' schema canonical bytes ${schemaBytes} exceed maxSchemaCanonicalBytes ${bounds.maxSchemaCanonicalBytes}`,
        );
      }
      descriptors.push({ source: entry.source, valueSchema });
    } catch (error) {
      issues.push(
        `Business Source '${entry.source}' has invalid ${DOMAIN_HARNESS_JSON_SCHEMA_V1} schema: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (entries.length > bounds.maxBusinessSources) {
    issues.push(
      `Business Source count ${entries.length} exceeds maxBusinessSources ${bounds.maxBusinessSources}`,
    );
  }
  issues.push(...projectionBusinessSourceIssues(projections, seen));

  if (issues.length > 0) throw new BusinessSourceCompileError(issues);

  descriptors.sort((left, right) => compareCompiledBusinessSourceKeys(left.source, right.source));
  return {
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    descriptors,
  };
}
