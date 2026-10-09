/**
 * #987 V08-B2-R4 (P1-a repair): descriptor-safe public ingress for the R4
 * integrated Host façade.
 *
 * Successor of the A1 #984 `parseBusinessRequest` intake (experiments/
 * v08-b2-r3-a1/authority/native-authority-host.mjs at A1 HEAD
 * 0ef92f9433ba9e2d32260c32961859e1c686a63e, READ_ONLY). The Fresh Reviewer
 * terminal #984@6084161227 (P1-a) proved by execution that the A1 intake used
 * `Object.keys` (enumerable own only) + prototype-inclusive `'input' in` /
 * `'caller' in` + `JSON.stringify(q.input)` (runs getters) and forwarded
 * `q.caller` by reference, so non-enumerable own keys, symbol-key carriers and
 * inherited `input`/`caller` were silently ignored or accepted and own accessor
 * getters executed once during intake. This module replaces that intake for
 * the R4 public façade with an own-key, descriptor-strict, JSON-data-only
 * discipline:
 *
 * - `Reflect.ownKeys` + `Object.getOwnPropertyDescriptors` enumerate EVERY own
 *   key (string AND symbol, enumerable AND non-enumerable). Symbol keys,
 *   non-enumerable own keys and own accessors are TYPED-REJECTED — never
 *   silently ignored (P1-a claim accuracy).
 * - No getter/setter can ever execute: values are only read AFTER the
 *   descriptor gate at that level passes, and the recursion re-gates every
 *   nested level before reading its children. The snapshot is built by
 *   `Object.defineProperty` on fresh objects — `JSON.stringify` is never used.
 * - Inherited `input`/`caller` are rejected (`Object.hasOwn` gate); foreign
 *   prototypes, `__proto__` own keys, functions, symbols, bigints and
 *   undefined are rejected as non-JSON-data.
 * - Host-supplied material (armed intent, authorized callers, selector) passes
 *   through the SAME data-only snapshot at construction, so post-construction
 *   mutation of caller-held objects can never widen scope or alter the armed
 *   occurrence (R4-13); the Host never keeps a mutable alias.
 *
 * Honest boundary: this is claim-accurate input-descriptor safety, NOT a JS
 * sandbox. If the caller's identity is not independently authenticated by the
 * Host ingress, the Host MUST supply authenticated provenance and CANNOT
 * accept user-claimed `caller` as a verified identity (documented on the R4
 * façade; the real ingress prerequisite belongs to #972 D2).
 */

export class R4IngressError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'R4IngressError';
  }
}

const deny = (code, message) => {
  throw new R4IngressError(code, message);
};

/** The closed non-authority business input set (A1 heritage, unchanged). */
export const BUSINESS_INPUT_KEYS = Object.freeze(['input', 'caller']);

function requirePlainRecord(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    deny('E_R4_RECORD_SHAPE', path + ' must be a plain record object');
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    deny('E_R4_RECORD_PROTOTYPE',
      path + ' carries a foreign prototype (' + (proto && proto.constructor ? String(proto.constructor.name) : 'unknown') +
      '); class-instance/prototype payload is rejected');
  }
}

/**
 * Descriptor gate over EVERY own key: symbols, non-enumerable keys, accessors
 * and own `__proto__` keys are typed-rejected. Never silently ignores anything
 * and never invokes a getter/setter (getOwnPropertyDescriptor does not run
 * accessors). For arrays the built-in own non-enumerable `length` data
 * property is structural (not a carrier) and is skipped; any other
 * non-index own key still rejects.
 */
function checkOwnDescriptors(record, path, isArray = false) {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key === 'symbol') {
      const label = typeof key.description === 'string' ? key.description : 'symbol';
      deny('E_R4_RECORD_SYMBOL_KEY',
        path + ' carries a symbol own key (' + label +
        '); symbol-key carriers are rejected, never silently ignored');
    }
    if (isArray && key === 'length') continue;
    const desc = Object.getOwnPropertyDescriptor(record, key);
    if (!desc) {
      deny('E_R4_RECORD_DESCRIPTOR', path + ' own key ' + String(key) + ' has no property descriptor');
    }
    if (!desc.enumerable) {
      deny('E_R4_RECORD_NON_ENUMERABLE',
        path + '.' + String(key) + ' is a NON-ENUMERABLE own key; rejected explicitly (P1-a: no silent ignore)');
    }
    if (desc.get !== undefined || desc.set !== undefined || !('value' in desc)) {
      deny('E_R4_RECORD_ACCESSOR',
        path + '.' + String(key) + ' is an own accessor; rejected BEFORE any getter/setter can execute');
    }
    if (key === '__proto__') {
      deny('E_R4_RECORD_PROTO_KEY',
        path + ' carries an own __proto__ key; prototype-poisoning payloads are rejected');
    }
  }
}

/**
 * Strictly typed JSON data-only recursive snapshot. Returns a deep-frozen
 * plain copy; rejects (typed, before reading values at each level) every
 * accessor, symbol, non-enumerable key, foreign prototype, `__proto__` own
 * key, function, bigint, symbol value or undefined.
 */
export function snapshotJsonDataOnly(value, path) {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;
  if (kind === 'undefined' || kind === 'bigint' || kind === 'symbol' || kind === 'function') {
    deny('E_R4_RECORD_JSON_DATA_ONLY', path + ' is not JSON data (typeof ' + kind + ')');
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      deny('E_R4_RECORD_PROTOTYPE', path + ' array carries a foreign prototype');
    }
    checkOwnDescriptors(value, path, true);
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i += 1) {
      if (keys[i] !== String(i)) {
        deny('E_R4_RECORD_ARRAY_SHAPE', path + ' carries non-index own array keys');
      }
    }
    const out = [];
    for (let i = 0; i < value.length; i += 1) {
      out.push(snapshotJsonDataOnly(value[i], path + '[' + i + ']'));
    }
    return Object.freeze(out);
  }
  requirePlainRecord(value, path);
  checkOwnDescriptors(value, path);
  const out = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, {
      value: snapshotJsonDataOnly(value[key], path + '.' + key),
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  return Object.freeze(out);
}

/**
 * P1-a public ingress for the R4 façade: exactly `{input, caller}`, own keys
 * only, descriptor-safe, JSON-data-only, deep-frozen snapshots. Authority-
 * bearing enumerable keys stay typed-rejected with the A1 code
 * (E_HOST_BUSINESS_INPUT_ONLY); descriptor-level carriers get precise
 * E_R4_RECORD_* codes; nothing is ever silently ignored or executed.
 */
export function parseBusinessRequestDescriptorSafe(businessRequest) {
  if (businessRequest === undefined || businessRequest === null) {
    deny('E_R4_RECORD_SHAPE', 'business request is required');
  }
  requirePlainRecord(businessRequest, 'request');
  checkOwnDescriptors(businessRequest, 'request');
  for (const key of Object.keys(businessRequest)) {
    if (!BUSINESS_INPUT_KEYS.includes(key)) {
      deny('E_HOST_BUSINESS_INPUT_ONLY',
        'business request key ' + JSON.stringify(key) +
        ' is not expressible; the closed set is exactly {input, caller}');
    }
  }
  for (const key of BUSINESS_INPUT_KEYS) {
    if (Object.hasOwn(businessRequest, key)) continue;
    if (key in businessRequest) {
      deny('E_R4_RECORD_INHERITED',
        'input/caller must be OWN properties; prototype-inherited ' + key + ' is rejected');
    }
    deny('E_R4_RECORD_SHAPE', 'business request requires an own ' + key + ' property');
  }
  const input = snapshotJsonDataOnly(businessRequest.input, 'input');
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    deny('E_R4_RECORD_SHAPE', 'input must be a JSON object');
  }
  const caller = snapshotJsonDataOnly(businessRequest.caller, 'caller');
  if (caller === null || typeof caller !== 'object' || Array.isArray(caller)) {
    deny('E_R4_RECORD_SHAPE', 'caller must be a JSON object');
  }
  if (Object.keys(caller).sort().join(',') !== 'callerId,callerKind' ||
      typeof caller.callerId !== 'string' || caller.callerId.length === 0 ||
      typeof caller.callerKind !== 'string' || caller.callerKind.length === 0) {
    deny('E_R4_RECORD_SHAPE', 'caller must carry exactly {callerId, callerKind} as non-empty strings');
  }
  return Object.freeze({ input, caller });
}

/**
 * Trusted-constructor material (armed intent, authorized callers, selector)
 * passes through the same data-only discipline: the Host keeps only the frozen
 * snapshot, never a caller-held mutable alias (R4-13).
 */
export function snapshotTrustedMaterial(value, path = 'trusted') {
  return snapshotJsonDataOnly(value, path);
}
