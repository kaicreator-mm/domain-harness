/**
 * DomainHarness v0.11.0 T02 (#1576) — R11 selected Function schema profile.
 *
 * Function input/output schemas are executed by T03's deliberately minimal
 * runtime validator. BUILD must therefore admit only the self-contained Draft
 * 2020-12 subset whose assertions that runtime actually implements. This is a
 * different boundary from BUILD-only ContentBlock schemas, which retain full
 * Ajv-supported $defs/$ref behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  FunctionContract,
  JsonValue,
} from '@kaicreator/domain-harness-contracts/v011';
import { buildV011App, type V011BuildResult } from '../../src/v011/index.js';
import { addPackage, writeJson } from './fixtures.js';
import { standardCase, type StandardCase } from './standard-case.js';

type SchemaChannel = 'inputSchemaRef' | 'outputSchemaRef';
type SchemaRef = FunctionContract['inputSchemaRef'];

function setEvaluateSchema(scenario: StandardCase, channel: SchemaChannel, ref: SchemaRef): void {
  const fn = scenario.eligibility.functions.find((candidate) => candidate.id === 'evaluate')!;
  fn[channel] = ref;
}

function expectSuccess(result: V011BuildResult): Extract<V011BuildResult, { ok: true }> {
  assert.equal(result.ok, true, result.ok ? undefined : `${result.code}: ${result.message}`);
  return result;
}

function expectSchemaRefusal(result: V011BuildResult, pathPart: string): void {
  assert.equal(result.ok, false, 'BUILD must refuse the unsupported Function schema');
  if (!result.ok) {
    assert.equal(result.code, 'DH_BUILD_SCHEMA_INVALID', result.message);
    assert.match(result.message, /runtime Function schema/iu);
    assert.ok(result.path?.includes(pathPart), `expected path '${result.path}' to include '${pathPart}'`);
  }
}

for (const channel of ['inputSchemaRef', 'outputSchemaRef'] as const) {
  test(`R11: selected Function ${channel} inline $ref is refused before Lock emission`, (t) => {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    setEvaluateSchema(scenario, channel, {
      inline: { $defs: { n: { type: 'number' } }, $ref: '#/$defs/n' },
    });
    const { input } = scenario.finalize();
    // With output 'not-a-number' (or the analogous input), T03 would ignore
    // $ref and report a false successful validation. BUILD must remove that
    // possibility rather than emitting a Lock for the unsupported contract.
    expectSchemaRefusal(buildV011App(input), `${channel}.inline.$ref`);
  });
}

test('R11: selected Function resource schema is resolved, digest-verified and $ref-refused', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const businessDir = addPackage(scenario.ws, 'orders-business');
  const schemaRef = writeJson(businessDir, 'schemas/function-output.schema.json', {
    $defs: { n: { type: 'number' } },
    $ref: '#/$defs/n',
  });
  setEvaluateSchema(scenario, 'outputSchemaRef', schemaRef);
  const { input } = scenario.finalize();
  expectSchemaRefusal(buildV011App(input), 'outputSchemaRef.$ref');
});

const unsupportedSchemas: readonly [string, JsonValue][] = [
  ['$dynamicRef', { $dynamicRef: '#/$defs/n' }],
  ['if', { if: { type: 'number' }, then: { type: 'number' } }],
  ['contains', { type: 'array', contains: { type: 'number' } }],
  ['unevaluatedProperties', { type: 'object', unevaluatedProperties: false }],
  ['patternProperties', { patternProperties: { '^x': { type: 'number' } } }],
  ['format', { type: 'string', format: 'email' }],
];

for (const [keyword, schema] of unsupportedSchemas) {
  test(`R11: unsupported runtime assertion/applicator ${keyword} is refused`, (t) => {
    const scenario = standardCase();
    t.after(scenario.ws.dispose);
    setEvaluateSchema(scenario, 'inputSchemaRef', { inline: schema });
    const { input } = scenario.finalize();
    expectSchemaRefusal(buildV011App(input), `inputSchemaRef.inline.${keyword}`);
  });
}

test('R11: an unsupported keyword below supported nested applicators reports its exact path', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  setEvaluateSchema(scenario, 'inputSchemaRef', {
    inline: {
      type: 'object',
      properties: {
        child: {
          allOf: [{ type: 'number' }, { $ref: '#/$defs/n' }],
        },
      },
      $defs: { n: { type: 'number' } },
    },
  });
  const { input } = scenario.finalize();
  expectSchemaRefusal(buildV011App(input), '.properties["child"].allOf[1].$ref');
});

test('R11: prefixItems + items:false is refused because T03 applies items to prefix entries too', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  setEvaluateSchema(scenario, 'inputSchemaRef', {
    inline: {
      type: 'array',
      prefixItems: [{ type: 'number' }],
      items: false,
    },
  });
  const { input } = scenario.finalize();
  expectSchemaRefusal(buildV011App(input), 'inputSchemaRef.inline.items');
});

test('R11: a malformed schema inside the supported keyword set still fails Ajv compilation', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  setEvaluateSchema(scenario, 'inputSchemaRef', {
    inline: { type: 'string', minLength: -1 },
  });
  const { input } = scenario.finalize();
  expectSchemaRefusal(buildV011App(input), 'inputSchemaRef.inline');
});

test('R11: supported nested Function schemas and a digest-verified resource schema build successfully', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  setEvaluateSchema(scenario, 'inputSchemaRef', {
    inline: {
      type: 'object',
      required: ['total', 'region', 'history', 'tuple', 'nested'],
      properties: {
        total: { type: 'number', minimum: 0, multipleOf: 1 },
        region: { enum: ['EU', 'US', 'APAC'] },
        history: { type: 'array', items: { type: 'string', minLength: 1 }, uniqueItems: true },
        tuple: { type: 'array', prefixItems: [{ type: 'number' }, { type: 'string' }] },
        nested: {
          allOf: [
            { type: 'object', required: ['score'] },
            { properties: { score: { type: 'integer', maximum: 10 } } },
          ],
        },
        optional: { anyOf: [{ type: 'null' }, { type: 'string' }] },
        optionalBooleanSchema: true,
      },
      additionalProperties: false,
    },
  });
  const businessDir = addPackage(scenario.ws, 'orders-business');
  const outputRef = writeJson(businessDir, 'schemas/supported-function-output.schema.json', {
    type: 'object',
    required: ['decision'],
    properties: {
      decision: { enum: ['POS', 'NEG', 'UNKNOWN'] },
      explanation: { not: { type: 'number' } },
    },
    additionalProperties: { type: ['string', 'null'] },
  });
  setEvaluateSchema(scenario, 'outputSchemaRef', outputRef);
  // Boolean schemas remain legal selected Function contracts.
  scenario.appMain.functions[0]!.inputSchemaRef = { inline: true };
  scenario.appMain.functions[0]!.outputSchemaRef = { inline: false };

  const { input } = scenario.finalize();
  const result = expectSuccess(buildV011App(input));
  assert.ok(result.lock.selectedFunctions.some((fn) => fn.ref.functionId === 'evaluate'));
  assert.match(
    result.lock.resourceDigests['orders-business/schemas/supported-function-output.schema.json'] ?? '',
    /^sha256:[0-9a-f]{64}$/u,
    'the selected Function resource schema joins the exact resource closure',
  );
});

test('R11: prefixItems + items:true retains the spec-equivalent no-op combination', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  setEvaluateSchema(scenario, 'inputSchemaRef', {
    inline: { type: 'array', prefixItems: [{ type: 'number' }], items: true },
  });
  expectSuccess(buildV011App(scenario.finalize().input));
});

test('R11: Function schema resources must belong to the selected package closure', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const outsideDir = addPackage(scenario.ws, 'outside-schema-owner');
  const outsideRef = writeJson(outsideDir, 'schemas/outside.schema.json', { type: 'object' });
  setEvaluateSchema(scenario, 'inputSchemaRef', outsideRef);
  expectSchemaRefusal(buildV011App(scenario.finalize().input), 'inputSchemaRef');
});

test('R11: an unselected Function is outside the selected-Function profile admission', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const explain = scenario.eligibility.functions.find((candidate) => candidate.id === 'explain')!;
  explain.inputSchemaRef = { inline: { $ref: '#/$defs/not-selected' } };
  expectSuccess(buildV011App(scenario.finalize().input));
});

test('R11: BUILD-only ContentBlock schemas retain intra-schema $defs/$ref support', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  scenario.eligibility.content[0]!.schemaRef = {
    inline: {
      type: 'object',
      $defs: {
        nonNegative: { type: 'number', minimum: 0 },
      },
      properties: {
        minOrderTotal: { $ref: '#/$defs/nonNegative' },
        regions: { type: 'array', items: { type: 'string' } },
      },
      required: ['minOrderTotal', 'regions'],
    },
  };
  expectSuccess(buildV011App(scenario.finalize().input));
});
