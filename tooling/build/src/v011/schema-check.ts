/**
 * DomainHarness v0.11.0 T02 (#1576) — real Draft 2020-12 machine-schema
 * validation through ajv (L2 §8.1 build dependency ruling; §13.4 relaxation
 * direction only ever REMOVES this dependency, never adds another third
 * party).
 *
 * Scope: per-document structural validation of the authoring inputs
 * (Descriptor / Domain / Package manifest / Element definition) using the
 * frozen T01 JSON Schemas, plus compilation of inline/ref content schemas for
 * real content validation. Cross-document semantics (closure, ownership, DAG,
 * selection, Lock) are deliberately NOT expressible here and live in the BUILD
 * pipeline — one schema authority only (L2 §2.2 boundary, T01 validate.ts).
 *
 * One checker instance per BUILD run: ajv's internal registry caches by
 * schema `$id`, so a shared instance across builds could let an authoring
 * schema carrying a colliding `$id` bleed into a later run. Fresh instance,
 * fresh caches, zero cross-run state.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import {
  DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
  DOMAIN_DEFINITION_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  ELEMENT_DEFINITION_JSON_SCHEMA,
  canonicalJson,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts/v011';
import { refusal, V011BuildRefusal } from './refusal.js';

export type V011DocumentSchemaName = 'descriptor' | 'domain' | 'manifest' | 'element';

/**
 * The closed schema profile executed by T03's minimal runtime validator.
 *
 * This is deliberately NOT the ContentBlock profile: content is validated only
 * by BUILD/Ajv and may use the complete Draft 2020-12 vocabulary. Function
 * input/output contracts cross the runtime seam, so unknown/custom keywords
 * and standard assertion/applicator keywords with no T03 implementation are
 * refused instead of becoming silent no-ops. Annotation keywords whose values
 * do not affect instance validation remain legal.
 */
const RUNTIME_FUNCTION_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  '$schema',
  '$id',
  '$comment',
  '$defs',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly',
  'const',
  'enum',
  'type',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'items',
  'prefixItems',
  'uniqueItems',
  'required',
  'properties',
  'additionalProperties',
  'minProperties',
  'maxProperties',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
]);

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Recursively admit only schema trees T03 can execute without dropping constraints. */
function assertRuntimeFunctionSchemaProfile(schema: unknown, path: string): void {
  if (typeof schema === 'boolean') return;
  if (!isSchemaObject(schema)) {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      'runtime Function schema must be a boolean or a Draft 2020-12 schema object',
      path,
    );
  }

  for (const key of Object.keys(schema).sort()) {
    if (!RUNTIME_FUNCTION_SCHEMA_KEYWORDS.has(key)) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `runtime Function schema keyword '${key}' is outside the supported subset`,
        `${path}.${key}`,
      );
    }
  }

  // T03 applies `items` to every array entry before applying `prefixItems`.
  // Draft 2020-12 applies it only AFTER the prefix, so the combination is not
  // runtime-equivalent (except the assertion-free items:true no-op).
  if (hasOwn(schema, 'prefixItems') && hasOwn(schema, 'items') && schema['items'] !== true) {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      'runtime Function schema does not support prefixItems together with items (except items:true)',
      `${path}.items`,
    );
  }

  const visitMap = (keyword: '$defs' | 'properties'): void => {
    const map = schema[keyword];
    if (!isSchemaObject(map)) return; // Ajv below reports the malformed keyword shape.
    for (const [key, subschema] of Object.entries(map)) {
      assertRuntimeFunctionSchemaProfile(subschema, `${path}.${keyword}[${JSON.stringify(key)}]`);
    }
  };
  visitMap('$defs');
  visitMap('properties');

  if (hasOwn(schema, 'additionalProperties')) {
    assertRuntimeFunctionSchemaProfile(schema['additionalProperties'], `${path}.additionalProperties`);
  }
  if (hasOwn(schema, 'items')) {
    assertRuntimeFunctionSchemaProfile(schema['items'], `${path}.items`);
  }
  for (const keyword of ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = schema[keyword];
    if (!Array.isArray(schemas)) continue; // Ajv below reports the malformed keyword shape.
    for (const [index, subschema] of schemas.entries()) {
      assertRuntimeFunctionSchemaProfile(subschema, `${path}.${keyword}[${index}]`);
    }
  }
  if (hasOwn(schema, 'not')) {
    assertRuntimeFunctionSchemaProfile(schema['not'], `${path}.not`);
  }
}

export class V011SchemaChecker {
  private readonly ajv: InstanceType<typeof Ajv2020>;
  private readonly documentValidators = new Map<V011DocumentSchemaName, ValidateFunction>();
  private readonly contentSchemaCache = new Map<string, ValidateFunction>();

  constructor() {
    // strict:false: the frozen T01 documents are the authority for which
    // keywords exist; ajv must not invent its own strictness failures.
    this.ajv = new Ajv2020({ strict: false, allErrors: false, validateSchema: false });
  }

  /** Validate one authoring document against a frozen T01 machine schema. */
  validateDocument(schemaName: V011DocumentSchemaName, value: unknown): void {
    const cached = this.documentValidators.get(schemaName);
    const validate: ValidateFunction =
      cached ??
      ((): ValidateFunction => {
        const schema =
          schemaName === 'descriptor'
            ? DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA
            : schemaName === 'domain'
              ? DOMAIN_DEFINITION_JSON_SCHEMA
              : schemaName === 'manifest'
                ? DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA
                : ELEMENT_DEFINITION_JSON_SCHEMA;
        let compiled: ValidateFunction;
        try {
          compiled = this.ajv.compile(schema as object);
        } catch (error) {
          throw new V011BuildRefusal(
            'DH_BUILD_SCHEMA_INVALID',
            `frozen T01 ${schemaName} schema failed to compile: ${(error as Error).message}`,
          );
        }
        this.documentValidators.set(schemaName, compiled);
        return compiled;
      })();
    if (!validate(value)) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `${schemaName} document violates the frozen v011 machine schema`,
      );
    }
  }

  /** Compile one JSON Schema (draft 2020-12); illegal schemas raise SCHEMA_INVALID. */
  compileContentSchema(schema: unknown, refPath: string): ValidateFunction {
    if (typeof schema !== 'boolean' && (typeof schema !== 'object' || schema === null)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', 'schemaRef does not resolve to a JSON Schema', refPath);
    }
    try {
      // Fresh registry PER COMPILED SCHEMA: one content block's inline
      // $id/$ref can never resolve against another block's schema. Intra-block
      // $defs/internal refs keep working; cross-block refs fail compilation
      // here and surface as SCHEMA_INVALID (review P1). The per-build
      // contentSchemaCache is safe to retain: same canonical schema text
      // compiles to an isolated, semantically identical validator.
      return new Ajv2020({ strict: false, allErrors: false, validateSchema: false }).compile(
        schema as object,
      );
    } catch (error) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `schemaRef is not a compilable draft 2020-12 JSON Schema: ${(error as Error).message}`,
        refPath,
      );
    }
  }

  /**
   * Compile one selected Function input/output schema for BUILD admission.
   * The returned validator is not shipped or reused as a second runtime
   * engine: Ajv proves Draft 2020-12 schema validity here, while the recursive
   * profile above proves every assertion is implemented by T03 at runtime.
   */
  compileFunctionSchema(schema: unknown, refPath: string): ValidateFunction {
    assertRuntimeFunctionSchemaProfile(schema, refPath);
    try {
      // As with ContentBlocks, isolate each schema's $id registry. Unlike the
      // BUILD-only content path, validate the schema itself against the
      // 2020-12 meta-schema so malformed supported keywords fail at BUILD.
      return new Ajv2020({ strict: false, allErrors: false, validateSchema: true }).compile(
        schema as object,
      );
    } catch (error) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `runtime Function schema is not a compilable draft 2020-12 JSON Schema: ${(error as Error).message}`,
        refPath,
      );
    }
  }

  /** Compile (cached within this BUILD run) an inline content schema object. */
  compileInlineSchema(schema: JsonValue, refPath: string): ValidateFunction {
    const key = canonicalJson(schema);
    const cached = this.contentSchemaCache.get(key);
    if (cached) return cached;
    const compiled = this.compileContentSchema(schema, refPath);
    this.contentSchemaCache.set(key, compiled);
    return compiled;
  }
}
