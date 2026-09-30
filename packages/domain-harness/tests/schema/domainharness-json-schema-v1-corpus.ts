export interface SchemaV1AcceptRejectCase {
  readonly id: string;
  readonly schema: unknown;
  readonly accepted: readonly unknown[];
  readonly rejected: readonly unknown[];
}

export interface SchemaV1InvalidSchemaCase {
  readonly id: string;
  readonly schema: unknown;
}

/**
 * Portable canonical corpus for `domainharness-json-schema/1`.
 *
 * Keep this module data-only and host-neutral so the exact same cases can be
 * consumed by the core/Node tests today and Expo/Hermes parity validation in
 * the downstream cross-host validation node.
 */
export const DOMAIN_HARNESS_JSON_SCHEMA_V1_CORPUS = {
  acceptReject: [
    {
      id: 'local-defs-ref',
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: {
          amount: { type: 'number', minimum: 0 },
        },
        type: 'object',
        required: ['amount'],
        properties: {
          amount: { $ref: '#/$defs/amount' },
        },
        additionalProperties: false,
      },
      accepted: [{ amount: 3 }],
      rejected: [{ amount: -1 }],
    },
    {
      id: 'format-annotation-only',
      schema: { type: 'string', format: 'email' },
      accepted: ['not-an-email'],
      rejected: [],
    },
    {
      id: 'literal-instance-object-is-not-schema',
      schema: {
        const: {
          $ref: 'https://example.com/literal-not-a-schema',
          $schema: 'literal-value',
          domainHarnessMagic: true,
        },
      },
      accepted: [{
        $ref: 'https://example.com/literal-not-a-schema',
        $schema: 'literal-value',
        domainHarnessMagic: true,
      }],
      rejected: [{
        $ref: 'https://example.com/literal-not-a-schema',
        $schema: 'literal-value',
        domainHarnessMagic: false,
      }],
    },
    {
      id: 'local-dynamic-ref',
      schema: {
        $defs: {
          node: {
            $dynamicAnchor: 'node',
            type: 'object',
            required: ['value'],
            properties: {
              value: { type: 'string' },
              next: { $dynamicRef: '#node' },
            },
            additionalProperties: false,
          },
        },
        $ref: '#/$defs/node',
      },
      accepted: [{ value: 'a', next: { value: 'b' } }],
      rejected: [{ value: 'a', next: { value: 2 } }],
    },
  ] satisfies readonly SchemaV1AcceptRejectCase[],
  invalidSchemas: [
    {
      id: 'wrong-dialect',
      schema: { $schema: 'https://json-schema.org/draft/2019-09/schema', type: 'string' },
    },
    {
      id: 'external-ref',
      schema: { $ref: 'https://example.com/schema.json' },
    },
    {
      id: 'external-dynamic-ref',
      schema: { $dynamicRef: 'https://example.com/schema.json#node' },
    },
    {
      id: 'vocabulary-negotiation',
      schema: { $vocabulary: { 'https://example.com/vocab': true }, type: 'string' },
    },
    {
      id: 'unknown-keyword',
      schema: { type: 'string', domainHarnessMagic: true },
    },
    {
      id: 'unknown-extension-keyword',
      schema: { type: 'string', 'x-domain-harness-magic': true },
    },
  ] satisfies readonly SchemaV1InvalidSchemaCase[],
} as const;
