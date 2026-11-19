/**
 * Element manifest parsing and validation for the Element-first contract layer
 * (DIS Runtime 0.11.0-dev D1, issue #1530).
 *
 * Shape source of truth is the DIS v0.2.0 cross-project Element manifest
 * (`examples/dis-v020-cross-project/manifest.json`, schema
 * `dis.v0.2.cross-project-demo/1` on PR #1497), ported as the minimal
 * engineering subset mandated by issue #1530:
 * - Functions additionally carry typed input/output schema refs (per #1530).
 * - Semantic relations are modeled as `{ from, to, kind }` declarations only;
 *   they never participate in static dependency resolution.
 *
 * Parsing is fail-closed and total: unknown fields, unknown implementation
 * kinds, unknown effect modes and malformed identifiers are rejected with
 * structured `ElementContractError` codes. The parsed manifest is deeply
 * frozen; mutation is impossible after validation.
 */
import { ElementContractError } from './errors.js';

export const ELEMENT_MANIFEST_SCHEMA = 'dis.v0.2.cross-project-demo/1';

export const IMPLEMENTATION_KINDS = ['rule', 'knowledge', 'code', 'stateful', 'external-effect'] as const;
export type ImplementationKind = (typeof IMPLEMENTATION_KINDS)[number];

export const EFFECT_MODES = ['none', 'idempotent', 'non-idempotent'] as const;
export type EffectMode = (typeof EFFECT_MODES)[number];

export interface ElementFunctionDecl {
  readonly id: string;
  readonly exportName: string;
  readonly source: string;
  readonly implementation: ImplementationKind;
  readonly effects: EffectMode;
  readonly inputSchemaRef: string;
  readonly outputSchemaRef: string;
}

export interface ElementDefinition {
  readonly id: string;
  readonly description: string;
  readonly dependsOn: readonly string[];
  readonly functions: readonly ElementFunctionDecl[];
}

export interface ElementSourceDecl {
  readonly file: string;
  readonly originalPath: string;
  readonly gitBlob: string;
}

export interface ElementConsumer {
  readonly id: string;
  readonly repository: string;
  readonly sourceCommit: string;
  readonly domainId: string;
  readonly sources: readonly ElementSourceDecl[];
  readonly elements: readonly ElementDefinition[];
}

export interface SemanticRelationDecl {
  readonly from: string;
  readonly to: string;
  readonly kind: string;
}

export interface ElementManifest {
  readonly schema: typeof ELEMENT_MANIFEST_SCHEMA;
  readonly origin?: string;
  readonly relations: readonly SemanticRelationDecl[];
  readonly consumers: readonly ElementConsumer[];
}

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/;
const SCHEMA_ID = /^[A-Za-z0-9][A-Za-z0-9./_-]*$/;
const NAME = /^[A-Za-z][A-Za-z0-9.-]*$/;
const RELATION_KIND = /^[a-z][a-z0-9-]*$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const SCHEMA_REF = /^[A-Za-z0-9_][A-Za-z0-9_./:@-]*$/;

type Payload = Record<string, unknown>;

function payload(value: unknown, at: string, code: string): Payload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ElementContractError(code, at);
  }
  return value as Payload;
}

function rejectUnknown(record: Payload, allowed: readonly string[], at: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) throw new ElementContractError('ELEMENT_FIELD_UNKNOWN', at + '.' + key);
  }
}

function has(record: Payload, key: string): boolean {
  return Object.hasOwn(record, key);
}

function requireString(record: Payload, key: string, at: string, pattern: RegExp, code: string): string {
  if (!has(record, key)) throw new ElementContractError('ELEMENT_FIELD_MISSING', at + '.' + key);
  const value = record[key];
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ElementContractError(code === '' ? 'ELEMENT_FIELD_TYPE_INVALID' : code, at + '.' + key);
  }
  return value;
}

function requireStringItem(value: unknown, at: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ElementContractError('ELEMENT_FIELD_TYPE_INVALID', at);
  }
  return value;
}

function optionalString(record: Payload, key: string, at: string, pattern: RegExp, code: string): string | undefined {
  if (!has(record, key)) return undefined;
  return requireString(record, key, at, pattern, code);
}

function requireArray(record: Payload, key: string, at: string): unknown[] {
  if (!has(record, key)) throw new ElementContractError('ELEMENT_FIELD_MISSING', at + '.' + key);
  if (!Array.isArray(record[key])) throw new ElementContractError('ELEMENT_FIELD_TYPE_INVALID', at + '.' + key);
  return record[key];
}

function optionalArray(record: Payload, key: string, at: string): unknown[] {
  if (!has(record, key)) return [];
  return requireArray(record, key, at);
}

function identifierArray(record: Payload, key: string, at: string): string[] {
  const items = optionalArray(record, key, at);
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = requireStringItem(item, at + '.' + key + '[' + index + ']', IDENTIFIER);
    if (seen.has(id)) throw new ElementContractError('ELEMENT_DEPENDENCY_DUPLICATE', at + '.' + key + '[' + index + ']');
    seen.add(id);
  }
  return items as string[];
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const property of Object.values(value as Payload)) deepFreeze(property);
    Object.freeze(value);
  }
  return value;
}

function parseSource(raw: unknown, at: string): ElementSourceDecl {
  const record = payload(raw, at, 'ELEMENT_FIELD_TYPE_INVALID');
  rejectUnknown(record, ['file', 'originalPath', 'gitBlob'], at);
  const source: ElementSourceDecl = {
    file: requireString(record, 'file', at, SCHEMA_REF, ''),
    originalPath: requireString(record, 'originalPath', at, SCHEMA_REF, ''),
    gitBlob: requireString(record, 'gitBlob', at, GIT_SHA, 'ELEMENT_GIT_BLOB_INVALID'),
  };
  return deepFreeze(source);
}

function parseFunction(raw: unknown, consumerSources: readonly string[], at: string): ElementFunctionDecl {
  const record = payload(raw, at, 'ELEMENT_FIELD_TYPE_INVALID');
  rejectUnknown(record, ['id', 'exportName', 'source', 'implementation', 'effects', 'inputSchemaRef', 'outputSchemaRef'], at);
  const implementation = requireString(record, 'implementation', at, /^[a-z-]+$/, '');
  if (!(IMPLEMENTATION_KINDS as readonly string[]).includes(implementation)) {
    throw new ElementContractError('ELEMENT_IMPLEMENTATION_KIND_INVALID', at + '.' + implementation);
  }
  const effects = requireString(record, 'effects', at, /^[a-z-]+$/, '');
  if (!(EFFECT_MODES as readonly string[]).includes(effects)) {
    throw new ElementContractError('ELEMENT_EFFECTS_INVALID', at + '.' + effects);
  }
  const source = requireString(record, 'source', at, SCHEMA_REF, '');
  if (!consumerSources.includes(source)) throw new ElementContractError('ELEMENT_SOURCE_UNRESOLVED', at + ':' + source);
  const declaration: ElementFunctionDecl = {
    id: requireString(record, 'id', at, IDENTIFIER, ''),
    exportName: requireString(record, 'exportName', at, IDENTIFIER, ''),
    source,
    implementation: implementation as ImplementationKind,
    effects: effects as EffectMode,
    inputSchemaRef: requireString(record, 'inputSchemaRef', at, SCHEMA_REF, ''),
    outputSchemaRef: requireString(record, 'outputSchemaRef', at, SCHEMA_REF, ''),
  };
  return deepFreeze(declaration);
}

function parseElement(raw: unknown, consumerSources: readonly string[], at: string): ElementDefinition {
  const record = payload(raw, at, 'ELEMENT_FIELD_TYPE_INVALID');
  rejectUnknown(record, ['id', 'description', 'dependsOn', 'functions'], at);
  const functions = requireArray(record, 'functions', at).map((item, index) =>
    parseFunction(item, consumerSources, at + '.functions[' + index + ']'));
  const functionIds = new Set<string>();
  for (const fn of functions) {
    if (functionIds.has(fn.id)) throw new ElementContractError('ELEMENT_ID_DUPLICATE', at + '.functions:' + fn.id);
    functionIds.add(fn.id);
  }
  const element: ElementDefinition = {
    id: requireString(record, 'id', at, IDENTIFIER, ''),
    description: requireString(record, 'description', at, /^[\s\S]+$/, ''),
    dependsOn: identifierArray(record, 'dependsOn', at),
    functions,
  };
  return deepFreeze(element);
}

function parseConsumer(raw: unknown, at: string): ElementConsumer {
  const record = payload(raw, at, 'ELEMENT_FIELD_TYPE_INVALID');
  rejectUnknown(record, ['id', 'repository', 'sourceCommit', 'domainId', 'sources', 'elements'], at);
  const sources = requireArray(record, 'sources', at).map((item, index) =>
    parseSource(item, at + '.sources[' + index + ']'));
  const sourceFiles = sources.map((source) => source.file);
  if (new Set(sourceFiles).size !== sourceFiles.length) {
    throw new ElementContractError('ELEMENT_ID_DUPLICATE', at + '.sources');
  }
  const elements = requireArray(record, 'elements', at).map((item, index) =>
    parseElement(item, sourceFiles, at + '.elements[' + index + ']'));
  const consumer: ElementConsumer = {
    id: requireString(record, 'id', at, IDENTIFIER, ''),
    repository: requireString(record, 'repository', at, /^\S+$/, ''),
    sourceCommit: requireString(record, 'sourceCommit', at, GIT_SHA, 'ELEMENT_COMMIT_INVALID'),
    domainId: requireString(record, 'domainId', at, NAME, ''),
    sources,
    elements,
  };
  return deepFreeze(consumer);
}

function parseRelation(raw: unknown, at: string): SemanticRelationDecl {
  const record = payload(raw, at, 'ELEMENT_FIELD_TYPE_INVALID');
  rejectUnknown(record, ['from', 'to', 'kind'], at);
  const relation: SemanticRelationDecl = {
    from: requireString(record, 'from', at, IDENTIFIER, ''),
    to: requireString(record, 'to', at, IDENTIFIER, ''),
    kind: requireString(record, 'kind', at, RELATION_KIND, 'ELEMENT_RELATION_INVALID'),
  };
  return deepFreeze(relation);
}

/** Parse and fully validate an Element manifest; returns a deeply frozen structure. */
export function parseElementManifest(input: unknown): ElementManifest {
  const record = payload(input, 'manifest', 'ELEMENT_MANIFEST_TYPE_INVALID');
  rejectUnknown(record, ['schema', 'origin', 'relations', 'consumers'], 'manifest');
  const schema = requireString(record, 'schema', 'manifest', SCHEMA_ID, '');
  if (schema !== ELEMENT_MANIFEST_SCHEMA) {
    throw new ElementContractError('ELEMENT_MANIFEST_SCHEMA_INVALID', schema);
  }
  const consumers = requireArray(record, 'consumers', 'manifest').map((item, index) =>
    parseConsumer(item, 'manifest.consumers[' + index + ']'));
  const consumerIds = consumers.map((consumer) => consumer.id);
  if (new Set(consumerIds).size !== consumerIds.length) {
    throw new ElementContractError('ELEMENT_ID_DUPLICATE', 'manifest.consumers');
  }
  const elementIds = consumers.flatMap((consumer) => consumer.elements.map((element) => element.id));
  if (new Set(elementIds).size !== elementIds.length) {
    throw new ElementContractError('ELEMENT_ID_DUPLICATE', 'manifest.consumers.elements');
  }
  const functionIds = consumers.flatMap((consumer) =>
    consumer.elements.flatMap((element) => element.functions.map((fn) => fn.id)));
  if (new Set(functionIds).size !== functionIds.length) {
    throw new ElementContractError('ELEMENT_ID_DUPLICATE', 'manifest.consumers.elements.functions');
  }
  const relations = optionalArray(record, 'relations', 'manifest').map((item, index) =>
    parseRelation(item, 'manifest.relations[' + index + ']'));
  const relationKeys = relations.map((relation) => relation.from + '|' + relation.to + '|' + relation.kind);
  if (new Set(relationKeys).size !== relationKeys.length) {
    throw new ElementContractError('ELEMENT_RELATION_DUPLICATE', 'manifest.relations');
  }
  const origin = optionalString(record, 'origin', 'manifest', /^\S+$/, '');
  const manifest: ElementManifest = {
    schema: ELEMENT_MANIFEST_SCHEMA,
    ...(origin === undefined ? {} : { origin }),
    relations,
    consumers,
  };
  return deepFreeze(manifest);
}
