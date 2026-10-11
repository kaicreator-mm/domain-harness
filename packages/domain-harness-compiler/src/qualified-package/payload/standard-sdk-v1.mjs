/**
 * DomainHarness v0.8 — physically loadable Standard SDK Domain Package.
 *
 * A sealed, self-contained source module suitable for the v8 Qualified BUILD
 * closure. Adapted by file/contract from #994@b9ea4d1 sdk-standard.mjs; unlike
 * the experiment it never fabricates freshModelCallCount=1 for a model-free
 * evaluation. K owns admission, state, effect, journal, authorization and replay.
 * This package only interprets five data-only Standard Kind declarations.
 *
 * No imports / eval / Function constructors / external side effects.
 */
export const MODULE_ID = 'standard-sdk@v08.1.0.0';
export const PACKAGE_KIND = 'standard-sdk';
export const ABI_VERSION = 'v08-standard-sdk-abi/1';
export const ENDPOINTS = Object.freeze([
  Object.freeze({ endpointId: 'sdk:rule-interpreter', kind: 'rule-interpreter' }),
]);

export const STANDARD_KINDS = Object.freeze(['schema', 'rule', 'decision', 'workflow', 'operation']);
const MAX_DEPTH = 32;
const MAX_ITEMS = 1024;
const MAX_CASES = 64;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const INVALID_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export class StandardSdkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StandardSdkError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new StandardSdkError(code, message);
}

/**
 * Snapshot declarative inputs before interpretation. No accessors, inherited
 * data, non-enumerable keys or non-JSON syntax are read/evaluated. The ordinary
 * object/array constraint deliberately excludes arbitrary class instances.
 */
function data(value, path = '$', depth = 0) {
  if (depth > MAX_DEPTH) fail('SDK_DATA_BOUNDS', `${path} exceeds nesting bound`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('SDK_DATA_UNSAFE', `${path} is not finite`);
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_ITEMS) {
      fail('SDK_DATA_UNSAFE', `${path} is not a bounded plain array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      fail('SDK_DATA_UNSAFE', `${path} contains non-index properties or holes`);
    }
    const items = [];
    for (let i = 0; i < value.length; i += 1) {
      const property = descriptors[String(i)];
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) {
        fail('SDK_DATA_UNSAFE', `${path} contains an accessor or hole`);
      }
      items.push(data(property.value, `${path}[${i}]`, depth + 1));
    }
    return items;
  }
  if (typeof value !== 'object' || value === null || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail('SDK_DATA_UNSAFE', `${path} is not plain JSON data`);
  }
  const desc = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(desc).length > MAX_ITEMS) fail('SDK_DATA_BOUNDS', `${path} contains too many properties`);
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(desc)) {
    if (typeof key !== 'string' || INVALID_KEYS.has(key)) {
      fail('SDK_DATA_UNSAFE', `${path} contains forbidden key`);
    }
    const property = desc[key];
    if (!property.enumerable || !Object.hasOwn(property, 'value')) {
      fail('SDK_DATA_UNSAFE', `${path} contains accessor/non-enumerable field ${key}`);
    }
    result[key] = data(property.value, `${path}.${key}`, depth + 1);
  }
  return result;
}

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('SDK_DECLARATION_INVALID', `${label} must be an object`);
  }
  return value;
}

function ident(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('SDK_DECLARATION_INVALID', `${label} must be a bounded identifier`);
  }
  return value;
}

function project(fields, input, label) {
  const map = record(fields, `${label} projection`);
  const result = Object.create(null);
  for (const [outKey, inKey] of Object.entries(map)) {
    ident(outKey, `${label} output key`);
    if (typeof inKey !== 'string' || !Object.hasOwn(input, inKey)) {
      fail('SDK_PROJECTION_MISSING', `${label} cannot project missing input ${String(inKey)}`);
    }
    result[outKey] = input[inKey];
  }
  return result;
}

function evidence(id) {
  return {
    provenance: { sdkModule: MODULE_ID, declarationId: id },
    source: 'harness-machine',
    llmAvoided: true,
    // No trusted ModelPort attached at the SDK interpreter boundary. An
    // upstream caller-supplied number can NEVER prove a physical model call.
    modelCallEvidence: { status: 'unsupported' },
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

function schema(definition, input) {
  const properties = record(definition.properties ?? {}, 'schema.properties');
  const required = definition.required ?? [];
  if (!Array.isArray(required) || required.length > MAX_ITEMS) {
    fail('SDK_DECLARATION_INVALID', 'schema.required must be a bounded string list');
  }
  const issues = [];
  const types = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
  for (const name of required) {
    ident(name, 'schema.required');
    if (!Object.hasOwn(input, name)) issues.push({ path: name, code: 'REQUIRED_MISSING' });
  }
  for (const [name, expected] of Object.entries(properties)) {
    ident(name, 'schema.properties key');
    if (!types.has(expected)) fail('SDK_DECLARATION_INVALID', `unsupported schema type ${String(expected)}`);
    if (!Object.hasOwn(input, name)) continue;
    const value = input[name];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (actual !== expected) issues.push({ path: name, code: 'TYPE_MISMATCH' });
  }
  return { kind: 'schema', valid: issues.length === 0, issues };
}

function rule(definition, input) {
  const eventType = ident(definition.eventType, 'rule.eventType');
  const payload = project(definition.payloadFromInput ?? {}, input, 'rule');
  return {
    kind: 'rule',
    structuredDecision: {
      decision: { outcome: 'decide', data: payload },
      event: { type: eventType, payload },
    },
  };
}

function decision(definition, input) {
  const candidates = definition.cases;
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > MAX_CASES) {
    fail('SDK_DECLARATION_INVALID', 'decision.cases must contain 1..64 data-only cases');
  }
  for (const candidate of candidates) {
    record(candidate, 'decision case');
    record(candidate.when, 'decision.when');
    const field = ident(candidate.when.field, 'decision.when.field');
    if (!Object.hasOwn(candidate.when, 'equals')) fail('SDK_DECLARATION_INVALID', 'decision.when.equals missing');
    if (JSON.stringify(input[field]) !== JSON.stringify(candidate.when.equals)) continue;
    return { kind: 'decision', matched: true, outcome: ident(candidate.outcome, 'decision.outcome') };
  }
  return { kind: 'decision', matched: false, outcome: null };
}

function workflow(definition, input) {
  const from = ident(definition.from, 'workflow.from');
  const trigger = ident(definition.trigger, 'workflow.trigger');
  const to = ident(definition.to, 'workflow.to');
  if (input.state !== from || input.trigger !== trigger) {
    return { kind: 'workflow', matched: false, candidate: null };
  }
  // A proposal only: K still evaluates policy/Guard/Admission and writes state.
  return { kind: 'workflow', matched: true, candidate: { from, to, trigger } };
}

function operation(definition, input) {
  const operationId = ident(definition.operationId, 'operation.operationId');
  const resourceKey = ident(definition.resourceKey, 'operation.resourceKey');
  return {
    kind: 'operation',
    // Data-only effect intent. NO Host calls and NO execution permission.
    proposal: { operationId, resourceKey, input: project(definition.inputFrom ?? {}, input, 'operation') },
  };
}

/**
 * Interpret one frozen declarative Kind into a data-only proposal, not a
 * committed Runtime decision. SDK never executes a physical effect and
 * cannot authorize state, release or access control.
 */
export function interpret(declaration, rawInput, rawContext = {}) {
  const definition = record(data(declaration), 'declaration');
  const input = record(data(rawInput), 'input');
  data(rawContext); // validated but ignored for all security/measurement claims
  // #994 selected Kernel's rule endpoint supplies {ruleId,eventType,
  // payloadFromInput} with no generic {kind,id} wrapper. This is a
  // current-v0.8 K/S composition contract, not legacy public API support.
  // Do not guess a Kind from business input; the only permitted shorthand
  // is an explicit ruleId on an otherwise data-only Rule declaration.
  const shorthandRule = definition.kind === undefined
    && Object.hasOwn(definition, 'ruleId')
    && typeof definition.ruleId === 'string';
  const kind = shorthandRule ? 'rule' : definition.kind;
  const id = ident(shorthandRule ? definition.ruleId : definition.id, 'declaration.id');
  let result;
  switch (kind) {
    case 'schema': result = schema(definition, input); break;
    case 'rule': result = rule(definition, input); break;
    case 'decision': result = decision(definition, input); break;
    case 'workflow': result = workflow(definition, input); break;
    case 'operation': result = operation(definition, input); break;
    default: fail('SDK_KIND_UNSUPPORTED', `unsupported Standard Kind ${String(kind)}`);
  }
  return { ...result, ...evidence(id) };
}
