/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { JsonValue } from './base.js';
import {
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
} from './schema-versions.js';
import { isContentDigest } from './digest.js';
import { isUnknownContentKind } from './element-contracts.js';
import type { ErrorCode } from './error-codes.js';

export interface ValidationIssue {
  readonly code: ErrorCode;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

const SCHEMA_INVALID = 'DH_BUILD_SCHEMA_INVALID' as const;
const RESOURCE_MISSING = 'DH_BUILD_RESOURCE_MISSING' as const;

type IssueSink = (path: string, code: ErrorCode, message: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ID_PATTERN.test(value) &&
    !value.endsWith('.') &&
    !value.endsWith('-')
  );
}

function isSemVer(value: unknown): value is `${number}.${number}.${number}` {
  return typeof value === 'string' && SEMVER_PATTERN.test(value);
}

export function isRelativeResourcePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function checkClosedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  sink: IssueSink,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      sink(
        `${path}.${key}`,
        SCHEMA_INVALID,
        `unknown field '${key}' (closed-world keys: ${allowed.join(', ')})`,
      );
    }
  }
}

function checkIdentifier(
  value: unknown,
  sink: IssueSink,
  path: string,
  code: ErrorCode = SCHEMA_INVALID,
): boolean {
  if (!isIdentifier(value)) {
    sink(path, code, `expected a non-empty identifier of [A-Za-z0-9._-] not ending in '.' or '-'`);
    return false;
  }
  return true;
}

function checkResourceRef(value: unknown, sink: IssueSink, path: string): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected a resource ref object {packageId, path, digest}');
    return;
  }
  checkClosedKeys(value, ['packageId', 'path', 'digest'], sink, path);
  if (!isNonEmptyString(value['packageId'])) {
    sink(`${path}.packageId`, SCHEMA_INVALID, 'expected a non-empty packageId string');
  }
  if (!isRelativeResourcePath(value['path'])) {
    sink(
      `${path}.path`,
      RESOURCE_MISSING,
      'resource path must be package-root relative POSIX (no absolute path, no "..")',
    );
  }
  if (!isContentDigest(value['digest'])) {
    sink(`${path}.digest`, SCHEMA_INVALID, 'digest must match sha256:<64 lowercase hex>');
  }
}

function checkSchemaRef(value: unknown, sink: IssueSink, path: string): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected a schema ref ({inline} | {packageId, path, digest})');
    return;
  }
  if ('inline' in value) {
    checkClosedKeys(value, ['inline'], sink, path);
    if (!isJsonValue(value['inline'])) {
      sink(`${path}.inline`, SCHEMA_INVALID, 'inline schema must be a JSON value');
    }
    return;
  }
  checkResourceRef(value, sink, path);
}

function checkStringArray(value: unknown, sink: IssueSink, path: string): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    sink(path, SCHEMA_INVALID, 'expected an array of strings');
  }
}

const FUNCTION_OUTCOME_LITERALS = ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const;
const EFFECT_INTENT_LITERALS = ['none', 'external', 'state'] as const;

export function validateContentBlock(value: unknown, basePath = 'content[i]'): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sink: IssueSink = (path, code, message) => {
    issues.push({ code, path, message });
  };
  checkContentBlock(value, basePath, sink);
  return finalize(issues);
}

function checkContentBlock(value: unknown, path: string, sink: IssueSink): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected a content block object');
    return;
  }
  checkClosedKeys(
    value,
    ['id', 'contentKind', 'schemaRef', 'required', 'value', 'ref', 'applicability', 'provenance'],
    sink,
    path,
  );
  checkIdentifier(value['id'], sink, `${path}.id`);
  if (!isNonEmptyString(value['contentKind'])) {
    sink(`${path}.contentKind`, SCHEMA_INVALID, 'expected a non-empty contentKind string');
  } else if (isUnknownContentKind(value['contentKind']) && value['required'] === true) {
    sink(
      `${path}.contentKind`,
      'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED',
      `required content block carries unknown contentKind '${value['contentKind']}'`,
    );
  }
  if (typeof value['required'] !== 'boolean') {
    sink(`${path}.required`, SCHEMA_INVALID, 'expected a boolean required flag');
  }
  if (!('schemaRef' in value)) {
    sink(`${path}.schemaRef`, SCHEMA_INVALID, 'schemaRef is mandatory');
  } else {
    checkSchemaRef(value['schemaRef'], sink, `${path}.schemaRef`);
  }
  const hasValue = 'value' in value;
  const hasRef = 'ref' in value;
  if (hasValue === hasRef) {
    sink(
      `${path}.value`,
      'DH_BUILD_CONTENT_XOR',
      'value and ref must be exactly-one (XOR): both present or both absent is refused',
    );
  }
  if (hasRef) checkResourceRef(value['ref'], sink, `${path}.ref`);
  if ('applicability' in value) {
    const applicability = value['applicability'];
    if (!isRecord(applicability)) {
      sink(`${path}.applicability`, SCHEMA_INVALID, 'expected an applicability object');
    } else {
      checkClosedKeys(applicability, ['targets', 'when'], sink, `${path}.applicability`);
      if ('targets' in applicability) checkStringArray(applicability['targets'], sink, `${path}.applicability.targets`);
      if ('when' in applicability && !isJsonValue(applicability['when'])) {
        sink(`${path}.applicability.when`, SCHEMA_INVALID, 'when must be a JSON value');
      }
    }
  }
  if ('provenance' in value) {
    const provenance = value['provenance'];
    if (!isRecord(provenance)) {
      sink(`${path}.provenance`, SCHEMA_INVALID, 'expected a provenance object');
    } else {
      checkClosedKeys(provenance, ['source', 'refs'], sink, `${path}.provenance`);
      if ('source' in provenance && !isNonEmptyString(provenance['source'])) {
        sink(`${path}.provenance.source`, SCHEMA_INVALID, 'expected a non-empty source string');
      }
      if ('refs' in provenance) {
        const refs = provenance['refs'];
        if (!Array.isArray(refs)) {
          sink(`${path}.provenance.refs`, SCHEMA_INVALID, 'expected an array of resource refs');
        } else {
          refs.forEach((ref, index) => checkResourceRef(ref, sink, `${path}.provenance.refs[${index}]`));
        }
      }
    }
  }
}

export function validateFunctionContract(value: unknown, basePath = 'functions[i]'): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sink: IssueSink = (path, code, message) => {
    issues.push({ code, path, message });
  };
  checkFunctionContract(value, basePath, sink);
  return finalize(issues);
}

function checkFunctionContract(value: unknown, path: string, sink: IssueSink): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected a function contract object');
    return;
  }
  checkClosedKeys(
    value,
    [
      'id',
      'contractVersion',
      'description',
      'inputSchemaRef',
      'outputSchemaRef',
      'outcomes',
      'effects',
      'applicability',
    ],
    sink,
    path,
  );
  checkIdentifier(value['id'], sink, `${path}.id`);
  if (!isNonEmptyString(value['contractVersion'])) {
    sink(`${path}.contractVersion`, SCHEMA_INVALID, 'expected a non-empty contractVersion string');
  }
  if ('description' in value && !isNonEmptyString(value['description'])) {
    sink(`${path}.description`, SCHEMA_INVALID, 'expected a non-empty description string');
  }
  for (const key of ['inputSchemaRef', 'outputSchemaRef'] as const) {
    if (!(key in value)) {
      sink(`${path}.${key}`, SCHEMA_INVALID, `${key} is mandatory`);
      continue;
    }
    checkSchemaRef(value[key], sink, `${path}.${key}`);
  }
  const outcomes = value['outcomes'];
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    sink(`${path}.outcomes`, 'DH_BUILD_OUTCOMES_INVALID', 'outcomes must be a non-empty array');
  } else {
    const hasSucceeded = outcomes.includes('SUCCEEDED');
    const literalsKnown = outcomes.every((item) =>
      (FUNCTION_OUTCOME_LITERALS as readonly unknown[]).includes(item),
    );
    if (!literalsKnown || !hasSucceeded) {
      sink(
        `${path}.outcomes`,
        'DH_BUILD_OUTCOMES_INVALID',
        `outcomes must contain only ${FUNCTION_OUTCOME_LITERALS.join('|')} and must include SUCCEEDED`,
      );
    }
  }
  if (!(EFFECT_INTENT_LITERALS as readonly unknown[]).includes(value['effects'])) {
    sink(
      `${path}.effects`,
      SCHEMA_INVALID,
      `effects must be one of ${EFFECT_INTENT_LITERALS.join('|')}`,
    );
  }
  if ('applicability' in value) {
    const applicability = value['applicability'];
    if (!isRecord(applicability)) {
      sink(`${path}.applicability`, SCHEMA_INVALID, 'expected an applicability object');
    } else {
      checkClosedKeys(applicability, ['targets', 'when'], sink, `${path}.applicability`);
    }
  }
}

const ELEMENT_ALLOWED_KEYS = [
  'kind',
  'schemaVersion',
  'id',
  'version',
  'description',
  'roles',
  'content',
  'functions',
  'dependencies',
  'validation',
] as const;

export function validateElementDefinition(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sink: IssueSink = (path, code, message) => {
    issues.push({ code, path, message });
  };
  checkElementDefinition(value, 'element', sink);
  return finalize(issues);
}

function checkElementDefinition(value: unknown, path: string, sink: IssueSink): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected an element definition object');
    return;
  }
  checkClosedKeys(value, ELEMENT_ALLOWED_KEYS, sink, path);
  if (value['kind'] !== 'Element') {
    sink(`${path}.kind`, SCHEMA_INVALID, `discriminant must be 'Element'`);
  }
  if (value['schemaVersion'] !== DH_ELEMENT_SCHEMA_VERSION) {
    sink(
      `${path}.schemaVersion`,
      SCHEMA_INVALID,
      `schemaVersion must be '${DH_ELEMENT_SCHEMA_VERSION}'`,
    );
  }
  checkIdentifier(value['id'], sink, `${path}.id`, 'DH_BUILD_ELEMENT_ID_INVALID');
  if (!isSemVer(value['version'])) {
    sink(`${path}.version`, SCHEMA_INVALID, 'expected a MAJOR.MINOR.PATCH semver string');
  }
  if (!isNonEmptyString(value['description'])) {
    sink(`${path}.description`, SCHEMA_INVALID, 'description is mandatory');
  }
  if ('roles' in value) {
    checkStringArray(value['roles'], sink, `${path}.roles`);
  }
  const content = value['content'];
  if (!Array.isArray(content)) {
    sink(`${path}.content`, SCHEMA_INVALID, 'content must be an array (0..N)');
  } else {
    const seenContentIds = new Set<string>();
    content.forEach((block, index) => {
      checkContentBlock(block, `${path}.content[${index}]`, sink);
      if (isNonEmptyString((block as Record<string, unknown>)['id'])) {
        const id = (block as Record<string, unknown>)['id'] as string;
        if (seenContentIds.has(id)) {
          sink(
            `${path}.content[${index}].id`,
            'DH_BUILD_ELEMENT_ID_INVALID',
            `content block id '${id}' is not unique within the element`,
          );
        }
        seenContentIds.add(id);
      }
    });
  }
  const functions = value['functions'];
  if (!Array.isArray(functions)) {
    sink(`${path}.functions`, SCHEMA_INVALID, 'functions must be an array (0..N)');
  } else {
    const seenFunctionIds = new Set<string>();
    functions.forEach((contract, index) => {
      checkFunctionContract(contract, `${path}.functions[${index}]`, sink);
      if (isNonEmptyString((contract as Record<string, unknown>)['id'])) {
        const id = (contract as Record<string, unknown>)['id'] as string;
        if (seenFunctionIds.has(id)) {
          sink(
            `${path}.functions[${index}].id`,
            'DH_BUILD_ELEMENT_ID_INVALID',
            `function id '${id}' is not unique within the element`,
          );
        }
        seenFunctionIds.add(id);
      }
    });
  }
  if ('dependencies' in value) {
    const dependencies = value['dependencies'];
    if (!Array.isArray(dependencies)) {
      sink(`${path}.dependencies`, SCHEMA_INVALID, 'dependencies must be an array');
    } else {
      dependencies.forEach((dependency, index) => {
        const depPath = `${path}.dependencies[${index}]`;
        if (!isRecord(dependency)) {
          sink(depPath, SCHEMA_INVALID, 'expected a dependency {element, version, functions?}');
          return;
        }
        checkClosedKeys(dependency, ['element', 'version', 'functions'], sink, depPath);
        checkIdentifier(dependency['element'], sink, `${depPath}.element`);
        if (!isNonEmptyString(dependency['version'])) {
          sink(`${depPath}.version`, SCHEMA_INVALID, 'expected a non-empty version range string');
        }
        if ('functions' in dependency) {
          checkStringArray(dependency['functions'], sink, `${depPath}.functions`);
        }
      });
    }
  }
  if ('validation' in value) {
    const validation = value['validation'];
    if (!isRecord(validation)) {
      sink(`${path}.validation`, SCHEMA_INVALID, 'expected {ref: ResourceRef}');
    } else {
      checkClosedKeys(validation, ['ref'], sink, `${path}.validation`);
      checkResourceRef(validation['ref'], sink, `${path}.validation.ref`);
    }
  }
}

const DOMAIN_ALLOWED_KEYS = [
  'kind',
  'schemaVersion',
  'id',
  'version',
  'description',
  'elements',
  'semanticRelations',
  'constraints',
] as const;

export function validateDomainDefinition(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sink: IssueSink = (path, code, message) => {
    issues.push({ code, path, message });
  };
  checkDomainDefinition(value, 'domain', sink);
  return finalize(issues);
}

function checkDomainDefinition(value: unknown, path: string, sink: IssueSink): void {
  if (!isRecord(value)) {
    sink(path, SCHEMA_INVALID, 'expected a domain definition object');
    return;
  }
  checkClosedKeys(value, DOMAIN_ALLOWED_KEYS, sink, path);
  if (value['kind'] !== 'Domain') {
    sink(`${path}.kind`, SCHEMA_INVALID, `discriminant must be 'Domain'`);
  }
  if (value['schemaVersion'] !== DH_DOMAIN_SCHEMA_VERSION) {
    sink(
      `${path}.schemaVersion`,
      SCHEMA_INVALID,
      `schemaVersion must be '${DH_DOMAIN_SCHEMA_VERSION}'`,
    );
  }
  checkIdentifier(value['id'], sink, `${path}.id`);
  if (!isSemVer(value['version'])) {
    sink(`${path}.version`, SCHEMA_INVALID, 'expected a MAJOR.MINOR.PATCH semver string');
  }
  if ('description' in value && !isNonEmptyString(value['description'])) {
    sink(`${path}.description`, SCHEMA_INVALID, 'expected a non-empty description string');
  }
  const elements = value['elements'];
  if (!Array.isArray(elements) || elements.length === 0) {
    sink(`${path}.elements`, SCHEMA_INVALID, 'elements must be a non-empty array (1..N)');
  } else {
    const seenElementIds = new Set<string>();
    elements.forEach((element, index) => {
      checkElementDefinition(element, `${path}.elements[${index}]`, sink);
      if (isNonEmptyString((element as Record<string, unknown>)['id'])) {
        const id = (element as Record<string, unknown>)['id'] as string;
        if (seenElementIds.has(id)) {
          sink(
            `${path}.elements[${index}].id`,
            'DH_BUILD_ELEMENT_ID_INVALID',
            `element id '${id}' is not unique within the domain`,
          );
        }
        seenElementIds.add(id);
      }
    });
  }
  if ('semanticRelations' in value) {
    const relations = value['semanticRelations'];
    if (!Array.isArray(relations)) {
      sink(`${path}.semanticRelations`, SCHEMA_INVALID, 'semanticRelations must be an array');
    } else {
      relations.forEach((relation, index) => {
        const edgePath = `${path}.semanticRelations[${index}]`;
        if (!isRecord(relation)) {
          sink(edgePath, SCHEMA_INVALID, 'expected a semantic edge {relation, from, to, version?}');
          return;
        }
        checkClosedKeys(relation, ['relation', 'from', 'to', 'version'], sink, edgePath);
        for (const key of ['relation', 'from', 'to'] as const) {
          if (!isNonEmptyString(relation[key])) {
            sink(`${edgePath}.${key}`, SCHEMA_INVALID, `expected a non-empty ${key} string`);
          }
        }
        if ('version' in relation && !isNonEmptyString(relation['version'])) {
          sink(`${edgePath}.version`, SCHEMA_INVALID, 'expected a non-empty version string');
        }
      });
    }
  }
  if ('constraints' in value) {
    const constraints = value['constraints'];
    if (!Array.isArray(constraints) || !constraints.every(isJsonValue)) {
      sink(`${path}.constraints`, SCHEMA_INVALID, 'constraints must be an array of JSON values');
    }
  }
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
