// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
import type { JsonValue } from '@kaicreator/domain-harness-contracts';

export function validateJsonSubset(instance: unknown, schema: unknown): boolean {
  if (
    instance === undefined ||
    typeof instance === 'function' ||
    typeof instance === 'symbol' ||
    typeof instance === 'bigint'
  ) {
    return false;
  }
  if (typeof instance === 'number' && !Number.isFinite(instance)) return false;
  if (Array.isArray(instance)) {
    for (let index = 0; index < instance.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(instance, index)) return false;
    }
  }
  if (typeof schema === 'boolean') return schema;
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) return false;
  const s = schema as Record<string, unknown>;

  if ('const' in s && !deepJsonEqual(instance, s['const'])) return false;

  if ('enum' in s) {
    const values = s['enum'];
    if (!Array.isArray(values) || !values.some((option) => deepJsonEqual(instance, option))) {
      return false;
    }
  }

  if ('type' in s && !matchesType(instance, s['type'])) return false;

  if (typeof instance === 'number') {
    if (typeof s['minimum'] === 'number' && instance < s['minimum']) return false;
    if (typeof s['maximum'] === 'number' && instance > s['maximum']) return false;
    if (s['exclusiveMinimum'] === true && typeof s['minimum'] === 'number' && instance <= s['minimum']) {
      return false;
    }
    if (typeof s['exclusiveMinimum'] === 'number' && instance <= s['exclusiveMinimum']) return false;
    if (typeof s['exclusiveMaximum'] === 'number' && instance >= s['exclusiveMaximum']) return false;
    if (typeof s['multipleOf'] === 'number' && s['multipleOf'] > 0 && !Number.isInteger(instance / s['multipleOf'])) {
      return false;
    }
  }

  if (typeof instance === 'string') {
    if (typeof s['minLength'] === 'number' || typeof s['maxLength'] === 'number') {
      let codePointLength = 0;
      for (const _character of instance) codePointLength += 1;
      if (typeof s['minLength'] === 'number' && codePointLength < s['minLength']) return false;
      if (typeof s['maxLength'] === 'number' && codePointLength > s['maxLength']) return false;
    }
    if (typeof s['pattern'] === 'string') {
      try {
        if (!new RegExp(s['pattern'], 'u').test(instance)) return false;
      } catch {
        return false;
      }
    }
  }

  if (Array.isArray(instance)) {
    if (typeof s['minItems'] === 'number' && instance.length < s['minItems']) return false;
    if (typeof s['maxItems'] === 'number' && instance.length > s['maxItems']) return false;
    const items = s['items'];
    if (items !== undefined) {
      if (Array.isArray(items)) return false;
      if (!instance.every((item) => validateJsonSubset(item, items))) return false;
    }
    const prefixItems = s['prefixItems'];
    if (Array.isArray(prefixItems)) {
      for (let index = 0; index < prefixItems.length && index < instance.length; index += 1) {
        if (!validateJsonSubset(instance[index], prefixItems[index])) return false;
      }
      if (s['items'] === false && instance.length > prefixItems.length) return false;
    }
    if (s['uniqueItems'] === true) {
      const seen = new Set<string>();
      for (const item of instance) {
        const key = stableStringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
  }

  if (typeof instance === 'object' && instance !== null && !Array.isArray(instance)) {
    const objectInstance = instance as Record<string, unknown>;
    const required = s['required'];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === 'string' && !hasOwn(objectInstance, key)) return false;
      }
    }
    const properties = s['properties'];
    if (isPlainObject(properties)) {
      for (const [key, subschema] of Object.entries(properties)) {
        if (hasOwn(objectInstance, key) && !validateJsonSubset(objectInstance[key], subschema)) return false;
      }
    }
    const additional = s['additionalProperties'];
    if (additional === false) {
      for (const key of Object.keys(objectInstance)) {
        const declared = isPlainObject(properties) && hasOwn(properties, key);
        if (!declared) return false;
      }
    } else if (isPlainObject(additional)) {
      for (const key of Object.keys(objectInstance)) {
        const declared = isPlainObject(properties) && hasOwn(properties, key);
        if (!declared && !validateJsonSubset(objectInstance[key], additional)) return false;
      }
    }
    const minProperties = s['minProperties'];
    const maxProperties = s['maxProperties'];
    if (typeof minProperties === 'number' && Object.keys(objectInstance).length < minProperties) return false;
    if (typeof maxProperties === 'number' && Object.keys(objectInstance).length > maxProperties) return false;
  }

  if (Array.isArray(s['allOf']) && !s['allOf'].every((sub) => validateJsonSubset(instance, sub))) return false;
  if (Array.isArray(s['anyOf']) && !s['anyOf'].some((sub) => validateJsonSubset(instance, sub))) return false;
  if (Array.isArray(s['oneOf'])) {
    const matches = s['oneOf'].filter((sub) => validateJsonSubset(instance, sub)).length;
    if (matches !== 1) return false;
  }
  if ('not' in s && validateJsonSubset(instance, s['not'])) return false;

  return true;
}

function matchesType(instance: unknown, type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((single) => {
    switch (single) {
      case 'null':
        return instance === null;
      case 'boolean':
        return typeof instance === 'boolean';
      case 'number':
        return typeof instance === 'number';
      case 'integer':
        return typeof instance === 'number' && Number.isInteger(instance);
      case 'string':
        return typeof instance === 'string';
      case 'array':
        return Array.isArray(instance);
      case 'object':
        return typeof instance === 'object' && instance !== null && !Array.isArray(instance);
      default:
        return false;
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function isPlainJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index) || !isPlainJsonValue(value[index])) return false;
    }
    return true;
  }
  if (isPlainObject(value)) {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every(isPlainJsonValue);
  }
  return false;
}

export function deepJsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepJsonEqual(item, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return (
      keysA.length === keysB.length &&
      keysA.every((key) => hasOwn(b, key) && deepJsonEqual(a[key], b[key]))
    );
  }
  return false;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',');
    return `{${body}}`;
  }
  throw new Error('stableStringify received a non-JSON value');
}
