/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import {
  DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
  DOMAIN_DEFINITION_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  ELEMENT_DEFINITION_JSON_SCHEMA,
  canonicalJson,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts';
import { refusal, BuildRefusal } from './refusal.js';

export type DocumentSchemaName = 'descriptor' | 'domain' | 'manifest' | 'element';

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

  if (hasOwn(schema, 'prefixItems') && hasOwn(schema, 'items') && schema['items'] !== true) {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      'runtime Function schema does not support prefixItems together with items (except items:true)',
      `${path}.items`,
    );
  }

  const visitMap = (keyword: '$defs' | 'properties'): void => {
    const map = schema[keyword];
    if (!isSchemaObject(map)) return;
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
    if (!Array.isArray(schemas)) continue;
    for (const [index, subschema] of schemas.entries()) {
      assertRuntimeFunctionSchemaProfile(subschema, `${path}.${keyword}[${index}]`);
    }
  }
  if (hasOwn(schema, 'not')) {
    assertRuntimeFunctionSchemaProfile(schema['not'], `${path}.not`);
  }
}

export class SchemaChecker {
  private readonly ajv: InstanceType<typeof Ajv2020>;
  private readonly documentValidators = new Map<DocumentSchemaName, ValidateFunction>();
  private readonly contentSchemaCache = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new Ajv2020({ strict: false, allErrors: false, validateSchema: false });
  }

  validateDocument(schemaName: DocumentSchemaName, value: unknown): void {
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
          throw new BuildRefusal(
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
        `${schemaName} document violates the frozen current machine schema`,
      );
    }
  }

  compileContentSchema(schema: unknown, refPath: string): ValidateFunction {
    if (typeof schema !== 'boolean' && (typeof schema !== 'object' || schema === null)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', 'schemaRef does not resolve to a JSON Schema', refPath);
    }
    try {
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

  compileFunctionSchema(schema: unknown, refPath: string): ValidateFunction {
    assertRuntimeFunctionSchemaProfile(schema, refPath);
    try {
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

  compileInlineSchema(schema: JsonValue, refPath: string): ValidateFunction {
    const key = canonicalJson(schema);
    const cached = this.contentSchemaCache.get(key);
    if (cached) return cached;
    const compiled = this.compileContentSchema(schema, refPath);
    this.contentSchemaCache.set(key, compiled);
    return compiled;
  }
}
