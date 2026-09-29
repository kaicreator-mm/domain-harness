import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  isContentDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonSchema, JsonValue } from '../contracts/json.js';
import {
  compareCompiledDomainDataKeys,
  type CompiledDomainDataDescriptor,
  type CompiledDomainDataSection,
  type PackageDataBounds,
} from '../v2/contracts/package-data.js';

export type DomainDataIntegrityErrorCode =
  | 'INVALID_DOMAIN_DATA_SECTION'
  | 'DOMAIN_DATA_DIGEST_MISMATCH'
  | 'DOMAIN_DATA_BOUNDS_EXCEEDED';

export class DomainDataIntegrityError extends Error {
  readonly code: DomainDataIntegrityErrorCode;
  readonly details: readonly string[];

  constructor(
    code: DomainDataIntegrityErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'DomainDataIntegrityError';
    this.code = code;
    this.details = [...details];
  }
}

const BOUND_KEYS = [
  'maxDomainDataEntries',
  'maxDomainDataEntryCanonicalBytes',
  'maxTotalDomainDataCanonicalBytes',
  'maxBusinessSources',
  'maxSchemaCanonicalBytes',
] as const satisfies readonly (keyof PackageDataBounds)[];

const DESCRIPTOR_KEYS = new Set(['key', 'contentDigest', 'valueSchema']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string, details: readonly string[] = []): never {
  throw new DomainDataIntegrityError('INVALID_DOMAIN_DATA_SECTION', message, details);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit < 0x80) {
      bytes += 1;
      continue;
    }
    if (codeUnit < 0x800) {
      bytes += 2;
      continue;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
        continue;
      }
    }
    bytes += 3;
  }
  return bytes;
}

function readBounds(value: unknown): PackageDataBounds {
  if (!isRecord(value)) invalid('packageDataBounds must be an object');
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...BOUND_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    invalid('packageDataBounds must contain exactly the frozen bound fields', actualKeys);
  }
  const result: Record<string, number> = {};
  for (const key of BOUND_KEYS) {
    const bound = value[key];
    if (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 0) {
      invalid(`packageDataBounds.${key} must be a non-negative safe integer`);
    }
    result[key] = bound;
  }
  return result as unknown as PackageDataBounds;
}

function readDescriptor(value: unknown, index: number): CompiledDomainDataDescriptor {
  if (!isRecord(value)) invalid(`descriptors[${index}] must be an object`);
  for (const key of Object.keys(value)) {
    if (!DESCRIPTOR_KEYS.has(key)) {
      invalid(`descriptors[${index}] contains unsupported field '${key}'`);
    }
  }
  if (typeof value.key !== 'string' || value.key.length === 0) {
    invalid(`descriptors[${index}].key must be a non-empty string`);
  }
  if (!isContentDigest(value.contentDigest)) {
    invalid(`descriptors[${index}].contentDigest must be a non-empty digest`);
  }
  let valueSchema: JsonSchema | undefined;
  if (value.valueSchema !== undefined) {
    if (!isRecord(value.valueSchema)) {
      invalid(`descriptors[${index}].valueSchema must be a JSON object`);
    }
    canonicalJsonStringify(value.valueSchema);
    valueSchema = value.valueSchema as JsonSchema;
  }
  return {
    key: value.key,
    contentDigest: value.contentDigest,
    ...(valueSchema === undefined ? {} : { valueSchema }),
  };
}

function readValues(value: unknown): Readonly<Record<string, JsonValue>> {
  if (!isRecord(value)) invalid('values must be an object record');
  const result = Object.create(null) as Record<string, JsonValue>;
  for (const key of Object.keys(value)) {
    if (key.length === 0) invalid('values may not contain an empty key');
    canonicalJsonStringify(value[key]);
    result[key] = value[key] as JsonValue;
  }
  return result;
}

/**
 * Portable successor Domain Data integrity validation. This helper does not
 * install successor package admission or JSON Schema semantics; it is consumed
 * later by the DomainHarness-owned successor validator assembly.
 *
 * Validation operates on a detached canonical snapshot so caller mutation
 * cannot create a time-of-check/time-of-use split while async digests run.
 */
export async function validateCompiledDomainDataSection(
  value: unknown,
  sha256: Sha256Port,
): Promise<CompiledDomainDataSection> {
  let canonicalText: string;
  try {
    canonicalText = canonicalJsonStringify(value);
  } catch (error) {
    invalid('compiled Domain Data section must be canonical JSON', [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const snapshot = JSON.parse(canonicalText) as unknown;
  if (!isRecord(snapshot)) invalid('compiled Domain Data section must be an object');
  const actualSectionKeys = Object.keys(snapshot).sort();
  const expectedSectionKeys = ['descriptors', 'packageDataBounds', 'values'];
  if (actualSectionKeys.length !== expectedSectionKeys.length
    || actualSectionKeys.some((key, index) => key !== expectedSectionKeys[index])) {
    invalid('compiled Domain Data section must contain exactly descriptors, values and packageDataBounds');
  }
  if (!Array.isArray(snapshot.descriptors)) invalid('descriptors must be an array');

  const descriptors = snapshot.descriptors.map(readDescriptor);
  const values = readValues(snapshot.values);
  const packageDataBounds = readBounds(snapshot.packageDataBounds);

  const descriptorKeys = descriptors.map((descriptor) => descriptor.key);
  const sortedDescriptorKeys = [...descriptorKeys].sort(compareCompiledDomainDataKeys);
  if (descriptorKeys.some((key, index) => key !== sortedDescriptorKeys[index])) {
    invalid('Domain Data descriptors must be sorted by exact key');
  }
  if (new Set(descriptorKeys).size !== descriptorKeys.length) {
    invalid('Domain Data descriptor keys must be unique');
  }

  const valueKeys = Object.keys(values).sort(compareCompiledDomainDataKeys);
  if (descriptorKeys.length !== valueKeys.length
    || descriptorKeys.some((key, index) => key !== valueKeys[index])) {
    invalid('Domain Data descriptors and bundled values must form an exact bijection', [
      `descriptors=${descriptorKeys.join(',')}`,
      `values=${valueKeys.join(',')}`,
    ]);
  }

  if (descriptors.length > packageDataBounds.maxDomainDataEntries) {
    throw new DomainDataIntegrityError(
      'DOMAIN_DATA_BOUNDS_EXCEEDED',
      'Domain Data entry count exceeds package-recorded bound',
      [`actual=${descriptors.length}`, `max=${packageDataBounds.maxDomainDataEntries}`],
    );
  }

  let totalBytes = 0;
  for (const descriptor of descriptors) {
    const bundled = values[descriptor.key] as JsonValue;
    const canonical = canonicalJsonStringify(bundled);
    const bytes = utf8ByteLength(canonical);
    if (bytes > packageDataBounds.maxDomainDataEntryCanonicalBytes) {
      throw new DomainDataIntegrityError(
        'DOMAIN_DATA_BOUNDS_EXCEEDED',
        `Domain Data '${descriptor.key}' exceeds per-entry canonical byte bound`,
        [`actual=${bytes}`, `max=${packageDataBounds.maxDomainDataEntryCanonicalBytes}`],
      );
    }
    totalBytes += bytes;
    const digest = await computeCanonicalJsonDigest(bundled, sha256);
    if (digest !== descriptor.contentDigest) {
      throw new DomainDataIntegrityError(
        'DOMAIN_DATA_DIGEST_MISMATCH',
        `Domain Data '${descriptor.key}' content digest does not match descriptor`,
        [`expected=${descriptor.contentDigest}`, `actual=${digest}`],
      );
    }
  }

  if (totalBytes > packageDataBounds.maxTotalDomainDataCanonicalBytes) {
    throw new DomainDataIntegrityError(
      'DOMAIN_DATA_BOUNDS_EXCEEDED',
      'aggregate Domain Data canonical bytes exceed package-recorded bound',
      [`actual=${totalBytes}`, `max=${packageDataBounds.maxTotalDomainDataCanonicalBytes}`],
    );
  }

  return { descriptors, values, packageDataBounds };
}
