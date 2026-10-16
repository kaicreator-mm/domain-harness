/**
 * DomainHarness v0.9 N01 — selected Kernel/Standard/Capability ABI and the
 * BUILD binding interface over a sealed v0.8 qualified closure.
 *
 * Authority reuse, not duplication: the sealed root presented here must come
 * from the PUBLISHED v0.8 BUILD pipeline (qualifyPackageClosure → external
 * issueApprovalProof → buildQualifiedPackage), which already owns package
 * bytes, closed-role shape, handler-export AST verification, approval and
 * digest authority. This module only (a) re-asserts the closed selected-role
 * structure on the snapshot it consumes, (b) admits the v0.9 intent→operation
 * route table against those sealed capability handler maps, and (c) provides
 * the Kernel-owned admission revalidation of a Standard Router result.
 *
 * It is an ESM-import-free package-internal source slice. It computes NO new
 * digest format: the table carries the sealed root's published v0.8 closure
 * digest value, prefixed only to satisfy the pure Router input grammar. The
 * v0.9 digest domain decision stays with the protected BUILD owner (#1032);
 * public error names stay with the public façade owner (#1035); the physical
 * H→K principal/permit port and effect dispatch belong to #1032/#1036 and are
 * deliberately absent — nothing here can mint or accept a principal.
 *
 * Business intent membership is DERIVED from the sealed root's own
 * `role:'intent'` binding rows; no caller-supplied intent list exists (R0 P1
 * remedy). Trust boundary of the outputs: `bindSelectedClosure` yields a
 * plain-data table and `authorizeSelectedOperation` yields a candidate
 * revalidation datum — NEITHER is an issuer approval, an H-issued principal
 * or an effect permit, and no physical Kernel/Host path may treat either as
 * final authorization. Provenance-qualified tables reach the Kernel only
 * through the protected BUILD/Host handoff owned by #1032/#1036.
 */
export const V09_SELECTED_ABI_FORMAT = 'dh.v9.selected-abi/1';

export class SelectedAbiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SelectedAbiError';
    this.code = code;
  }
}

const ROUTER_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_LIST = 128;
const MAX_DEPTH = 16;

function refuse(code, message) {
  throw new SelectedAbiError(code, message);
}

// Descriptor-safe plain-data snapshot, same discipline as the Router: hostile
// accessors/prototypes/cycles are refused without being read.
function data(value, path = '$', depth = 0, seen = new WeakSet()) {
  if (depth > MAX_DEPTH) refuse('SELECTED_ABI_DATA_INVALID', `${path} depth exceeded`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') refuse('SELECTED_ABI_DATA_INVALID', `${path} is not plain data`);
  if (seen.has(value)) refuse('SELECTED_ABI_DATA_INVALID', `${path} contains a cycle`);
  seen.add(value);
  try {
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (proto !== Array.prototype || value.length > MAX_LIST) {
        refuse('SELECTED_ABI_DATA_INVALID', `${path} has invalid array shape`);
      }
      const desc = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(desc).length !== value.length + 1) {
        refuse('SELECTED_ABI_DATA_INVALID', `${path} has array holes or extra keys`);
      }
      return Array.from({ length: value.length }, (_, index) => {
        const item = desc[String(index)];
        if (!item || !item.enumerable || !Object.hasOwn(item, 'value')) {
          refuse('SELECTED_ABI_DATA_INVALID', `${path} contains an accessor or hole`);
        }
        return data(item.value, `${path}[${index}]`, depth + 1, seen);
      });
    }
    if (proto !== Object.prototype && proto !== null) {
      refuse('SELECTED_ABI_DATA_INVALID', `${path} has an unexpected prototype`);
    }
    const desc = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(desc).length > MAX_LIST) {
      refuse('SELECTED_ABI_DATA_INVALID', `${path} has too many keys`);
    }
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(desc)) {
      const item = desc[key];
      if (typeof key !== 'string' || BAD_KEYS.has(key) || !item.enumerable || !Object.hasOwn(item, 'value')) {
        refuse('SELECTED_ABI_DATA_INVALID', `${path} has an unsafe property`);
      }
      result[key] = data(item.value, `${path}.${key}`, depth + 1, seen);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function obj(value, label, keys) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    refuse('SELECTED_ABI_CONTRACT_INVALID', `${label} must be a record`);
  }
  if (Object.keys(value).some(key => !keys.includes(key))) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', `${label} contains an unsupported field`);
  }
  return value;
}

function routerIdent(value, label) {
  if (typeof value !== 'string' || !ROUTER_ID.test(value)) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', `${label} must satisfy the Router identifier grammar`);
  }
  return value;
}

function boundedString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', `${label} must be a bounded printable string`);
  }
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) {
      refuse('SELECTED_ABI_CONTRACT_INVALID', `${label} must be a bounded printable string`);
    }
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

const SEALED_ROOT_FIELDS = ['formatVersion', 'rootPackageId', 'build', 'approval', 'packages', 'bindings'];
const PACKAGE_FIELDS = ['packageId', 'kind', 'abiVersion', 'moduleSource', 'moduleSha256', 'endpoints'];
const ENDPOINT_FIELDS = ['endpointId', 'kind'];
const ROLE_BINDING_FIELDS = ['role', 'packageId', 'endpointId'];
const INTENT_BINDING_FIELDS = ['role', 'intentType', 'packageId', 'endpointId'];
const CAPABILITY_BINDING_FIELDS = ['role', 'capabilityId', 'packageId', 'endpointId', 'handlers'];
const HANDLER_FIELDS = ['operationId', 'handler'];
const ROUTE_FIELDS = ['intentId', 'operationId', 'capabilityId', 'handlerId'];
const KINDS = new Set(['kernel', 'standard-sdk', 'business', 'capability']);

/**
 * BUILD binding interface: admit the v0.9 intent→operation route table over
 * one sealed v0.8 qualified closure whose bytes, roles, handler exports,
 * approval and digest were already produced by the published v0.8 BUILD.
 * Business intent membership is derived from the sealed root's own
 * `role:'intent'` rows — a route may only name an intent the BUILD actually
 * sealed; there is no caller-supplied intent authority.
 *
 * @param {unknown} input `{sealedRoot, routes}` plain data.
 * @returns {object} Frozen SelectedClosureTable (see selected-abi.d.mts).
 */
export function bindSelectedClosure(input) {
  const root = obj(data(input), 'selected closure input', ['sealedRoot', 'routes']);
  const sealedRoot = obj(root.sealedRoot, 'sealed root', SEALED_ROOT_FIELDS);
  if (sealedRoot.formatVersion !== 'dhpkg/v8-qualified-root/1') {
    refuse('SELECTED_ABI_ROOT_FORMAT', 'only a sealed v0.8 qualified root may back a v0.9 selected table');
  }
  boundedString(sealedRoot.rootPackageId, 'sealed root rootPackageId');
  const build = obj(sealedRoot.build, 'sealed root build', ['producerId', 'builtAt', 'baseCommit', 'closureDigest']);
  if (typeof build.closureDigest !== 'string' || !HEX64.test(build.closureDigest)) {
    refuse('SELECTED_ABI_ROOT_FORMAT', 'sealed root build.closureDigest must be a published v0.8 hex sha-256');
  }
  const packagesValue = sealedRoot.packages;
  const bindingsValue = sealedRoot.bindings;
  if (!Array.isArray(packagesValue) || packagesValue.length === 0 || !Array.isArray(bindingsValue)) {
    refuse('SELECTED_ABI_ROOT_FORMAT', 'sealed root must carry a non-empty packages array and a bindings array');
  }
  const packagesById = new Map();
  for (const raw of packagesValue) {
    const pkg = obj(raw, 'sealed package', PACKAGE_FIELDS);
    const packageId = boundedString(pkg.packageId, 'package.packageId');
    if (packagesById.has(packageId)) {
      refuse('SELECTED_ABI_PACKAGE_INVALID', `duplicate sealed package ${packageId}`);
    }
    if (!KINDS.has(pkg.kind)) {
      refuse('SELECTED_ABI_PACKAGE_INVALID', `package ${packageId} has unknown kind ${String(pkg.kind)}`);
    }
    boundedString(pkg.abiVersion, `package ${packageId} abiVersion`);
    if (typeof pkg.moduleSha256 !== 'string' || !HEX64.test(pkg.moduleSha256)) {
      refuse('SELECTED_ABI_PACKAGE_INVALID', `package ${packageId} moduleSha256 must be lowercase hex sha-256`);
    }
    if (typeof pkg.moduleSource !== 'string' || pkg.moduleSource.length === 0) {
      refuse('SELECTED_ABI_PACKAGE_INVALID', `package ${packageId} must carry sealed module source bytes`);
    }
    const endpointsValue = pkg.endpoints;
    if (!Array.isArray(endpointsValue) || endpointsValue.length === 0) {
      refuse('SELECTED_ABI_PACKAGE_INVALID', `package ${packageId} must declare a non-empty endpoints array`);
    }
    const endpointIds = new Set();
    for (const endpointRaw of endpointsValue) {
      const endpoint = obj(endpointRaw, `package ${packageId} endpoint`, ENDPOINT_FIELDS);
      const endpointId = boundedString(endpoint.endpointId, `package ${packageId} endpoint.endpointId`);
      boundedString(endpoint.kind, `package ${packageId} endpoint.kind`);
      if (endpointIds.has(endpointId)) {
        refuse('SELECTED_ABI_PACKAGE_INVALID', `package ${packageId} declares endpoint ${endpointId} twice`);
      }
      endpointIds.add(endpointId);
    }
    packagesById.set(packageId, { pkg, endpointIds });
  }

  // Closed selected-role structure, re-asserted on the consumed snapshot with
  // the same closed-world semantics the published v0.8 BUILD enforces: one K,
  // one S, >=1 B, each bound to a package of its own kind. A capability can
  // never masquerade as (or shadow) a closed role here.
  const roleBindings = new Map([['kernel', null], ['standard-sdk', null], ['business', []]]);
  const capabilityBindings = [];
  // Sealed Business intent membership (R0 P1): retained from the root's own
  // role:'intent' rows, never from caller input.
  const sealedIntentsByPackage = new Map();
  const sealedIntentOwners = new Map();
  for (const raw of bindingsValue) {
    if (raw === null || Array.isArray(raw) || typeof raw !== 'object') {
      refuse('SELECTED_ABI_CONTRACT_INVALID', 'sealed binding must be a record');
    }
    if (raw.role === 'capability') {
      const binding = obj(raw, 'capability binding', CAPABILITY_BINDING_FIELDS);
      boundedString(binding.capabilityId, 'capability binding.capabilityId');
      const target = packagesById.get(binding.packageId);
      if (target === undefined) {
        refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability ${binding.capabilityId} binds unknown package ${String(binding.packageId)}`);
      }
      if (target.pkg.kind !== 'capability') {
        refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability ${binding.capabilityId} binds package ${binding.packageId} of kind ${target.pkg.kind}; a capability binding must target a capability package`);
      }
      if (!target.endpointIds.has(binding.endpointId)) {
        refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability ${binding.capabilityId} binds endpoint ${String(binding.endpointId)} which its package does not declare`);
      }
      const handlersValue = binding.handlers;
      if (!Array.isArray(handlersValue) || handlersValue.length === 0) {
        refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability ${binding.capabilityId} must carry a non-empty operation→handler map`);
      }
      const operations = [];
      const operationIds = new Set();
      for (const handlerRaw of handlersValue) {
        const handler = obj(handlerRaw, `capability ${binding.capabilityId} handler`, HANDLER_FIELDS);
        const operationId = routerIdent(handler.operationId, 'capability handler.operationId');
        boundedString(handler.handler, 'capability handler.handler');
        if (operationIds.has(operationId)) {
          refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability ${binding.capabilityId} binds operation ${operationId} more than once`);
        }
        operationIds.add(operationId);
        operations.push({ operationId, handler: handler.handler });
      }
      capabilityBindings.push({
        capabilityId: binding.capabilityId, packageId: binding.packageId,
        endpointId: binding.endpointId, moduleSha256: target.pkg.moduleSha256, operations,
      });
      continue;
    }
    if (raw.role === 'intent') {
      const binding = obj(raw, 'intent binding', INTENT_BINDING_FIELDS);
      const intentType = routerIdent(binding.intentType, 'intent binding.intentType');
      const target = packagesById.get(binding.packageId);
      if (target === undefined || target.pkg.kind !== 'business') {
        refuse('SELECTED_ABI_ROLE_INVALID', `sealed intent ${intentType} does not bind a business package`);
      }
      if (!target.endpointIds.has(binding.endpointId)) {
        refuse('SELECTED_ABI_ROLE_INVALID', `sealed intent ${intentType} binds endpoint ${String(binding.endpointId)} which its business package does not declare`);
      }
      const owner = sealedIntentOwners.get(intentType);
      if (owner !== undefined) {
        refuse('SELECTED_ABI_ROLE_INVALID', `sealed intent ${intentType} is bound to more than one business package in this closure`);
      }
      sealedIntentOwners.set(intentType, binding.packageId);
      let sealed = sealedIntentsByPackage.get(binding.packageId);
      if (sealed === undefined) {
        sealed = new Set();
        sealedIntentsByPackage.set(binding.packageId, sealed);
      }
      sealed.add(intentType);
      continue;
    }
    const binding = obj(raw, 'role binding', ROLE_BINDING_FIELDS);
    const role = binding.role;
    if (role !== 'kernel' && role !== 'standard-sdk' && role !== 'business') {
      refuse('SELECTED_ABI_CONTRACT_INVALID', `unknown sealed binding role ${String(role)}`);
    }
    const target = packagesById.get(binding.packageId);
    if (target === undefined) {
      refuse('SELECTED_ABI_ROLE_INVALID', `role ${role} binds unknown package ${String(binding.packageId)}`);
    }
    if (target.pkg.kind !== role) {
      refuse('SELECTED_ABI_ROLE_INVALID', `role ${role} binds package ${binding.packageId} of kind ${target.pkg.kind}; closed roles cannot be impersonated`);
    }
    if (!target.endpointIds.has(binding.endpointId)) {
      refuse('SELECTED_ABI_ROLE_INVALID', `role ${role} binds endpoint ${String(binding.endpointId)} which its package does not declare`);
    }
    if (role === 'business') {
      roleBindings.get('business').push({ packageId: binding.packageId, endpointId: binding.endpointId, moduleSha256: target.pkg.moduleSha256 });
    } else if (roleBindings.get(role) !== null) {
      refuse('SELECTED_ABI_ROLE_INVALID', `role ${role} is bound more than once in the sealed closure`);
    } else {
      roleBindings.set(role, { packageId: binding.packageId, endpointId: binding.endpointId, moduleSha256: target.pkg.moduleSha256 });
    }
  }
  const kernel = roleBindings.get('kernel');
  const standard = roleBindings.get('standard-sdk');
  const businesses = roleBindings.get('business');
  if (kernel === null) refuse('SELECTED_ABI_ROLE_INVALID', 'the sealed closure must select exactly one Kernel');
  if (standard === null) refuse('SELECTED_ABI_ROLE_INVALID', 'the sealed closure must select exactly one Standard SDK');
  if (businesses.length === 0) refuse('SELECTED_ABI_ROLE_INVALID', 'the sealed closure must select at least one Business package');
  const capabilityIds = new Set(capabilityBindings.map(binding => binding.capabilityId));
  if (capabilityIds.size !== capabilityBindings.length) {
    refuse('SELECTED_ABI_CAPABILITY_INVALID', 'capability identities must stay injective in the sealed closure');
  }
  const boundCapabilityPackages = new Set(capabilityBindings.map(binding => binding.packageId));
  for (const [packageId, target] of packagesById) {
    if (target.pkg.kind !== 'capability') continue;
    if (!boundCapabilityPackages.has(packageId)) {
      refuse('SELECTED_ABI_CAPABILITY_INVALID', `capability package ${packageId} is not covered by exactly one capability binding; it can never become executable`);
    }
  }

  // Business intent membership comes ONLY from the sealed role:'intent' rows
  // above (R0 P1): each role-bound Business carries exactly the intents the
  // BUILD sealed for it, and caller input cannot add, drop or re-own one.
  const businessesOut = businesses.map(binding => ({
    ...binding,
    intentTypes: [...(sealedIntentsByPackage.get(binding.packageId) ?? [])],
  }));

  // The v0.9 delta: exact intent→operation route rows resolved against the
  // sealed capability handler maps. One intent MAY carry several distinct
  // operations (the pure Router resolves priority/eligibility); a duplicate
  // (intentId, operationId) row is an unresolvable conflict and refuses.
  const routesValue = root.routes;
  if (!Array.isArray(routesValue) || routesValue.length === 0) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', 'routes must be a non-empty array');
  }
  const routeRows = [];
  const routeKeys = new Set();
  for (const raw of routesValue) {
    const route = obj(raw, 'selected route', ROUTE_FIELDS);
    const intentId = routerIdent(route.intentId, 'route.intentId');
    const operationId = routerIdent(route.operationId, 'route.operationId');
    const capabilityId = routerIdent(route.capabilityId, 'route.capabilityId');
    const handlerId = routerIdent(route.handlerId, 'route.handlerId');
    if (!sealedIntentOwners.has(intentId)) {
      refuse('SELECTED_ABI_INTENT_UNDECLARED', `route intent ${intentId} is not sealed as a business intent binding of this closure`);
    }
    const capability = capabilityBindings.find(binding => binding.capabilityId === capabilityId);
    if (capability === undefined) {
      refuse('SELECTED_ABI_CAPABILITY_UNBOUND', `route intent ${intentId} names capability ${capabilityId} which is not sealed in this closure`);
    }
    const sealedOperation = capability.operations.find(operation => operation.operationId === operationId);
    if (sealedOperation === undefined) {
      refuse('SELECTED_ABI_OPERATION_UNBOUND', `route intent ${intentId} names operation ${operationId} which capability ${capabilityId} does not seal`);
    }
    if (sealedOperation.handler !== handlerId) {
      refuse('SELECTED_ABI_HANDLER_MISMATCH', `route intent ${intentId} claims handler ${handlerId} but the sealed binding pins ${sealedOperation.handler} for ${operationId}`);
    }
    const key = `${intentId}\u0000${operationId}`;
    if (routeKeys.has(key)) {
      refuse('SELECTED_ABI_ROUTE_DUPLICATE', `duplicate route for intent ${intentId} → operation ${operationId}`);
    }
    routeKeys.add(key);
    routeRows.push({ intentId, operationId, capabilityId, handlerId });
  }

  return deepFreeze({
    formatVersion: V09_SELECTED_ABI_FORMAT,
    rootPackageId: sealedRoot.rootPackageId,
    // The published v0.8 closure digest VALUE, prefixed only for the Router
    // input grammar. No v0.9 digest format is invented here (#1032 owns it).
    basisDigest: `sha256:${build.closureDigest}`,
    kernel,
    standard,
    businesses: businessesOut,
    capabilities: capabilityBindings,
    routes: routeRows,
  });
}

/**
 * Standard-side pure derivation: the exact `routeWorkflowIntent` request for
 * one intent of a bound selected table. Candidates remain caller-supplied
 * Standard proposals; bindings come only from the sealed table.
 *
 * @param {unknown} table A table returned by bindSelectedClosure.
 * @param {unknown} intentId The intent whose sealed route rows are requested.
 * @param {unknown} candidates Standard-proposed candidate rows.
 * @returns {object} Frozen `routeWorkflowIntent` request.
 */
export function routerRequestFor(table, intentId, candidates) {
  const bound = obj(data(table), 'selected closure table', [
    'formatVersion', 'rootPackageId', 'basisDigest', 'kernel', 'standard', 'businesses', 'capabilities', 'routes',
  ]);
  if (bound.formatVersion !== V09_SELECTED_ABI_FORMAT) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', 'routerRequestFor requires a table produced by bindSelectedClosure');
  }
  const wanted = routerIdent(intentId, 'intentId');
  const rows = [];
  let declared = false;
  for (const business of bound.businesses) {
    if (Array.isArray(business.intentTypes) && business.intentTypes.includes(wanted)) declared = true;
  }
  if (!declared) {
    refuse('SELECTED_ABI_INTENT_UNDECLARED', `intent ${wanted} is not declared by any selected Business package`);
  }
  for (const route of bound.routes) {
    if (route.intentId !== wanted) continue;
    rows.push({
      intentId: route.intentId, operationId: route.operationId,
      capabilityId: route.capabilityId, handlerId: route.handlerId,
    });
  }
  if (rows.length === 0) {
    refuse('SELECTED_ABI_ROUTE_MISSING', `intent ${wanted} carries no sealed route rows; bind it at BUILD first`);
  }
  return deepFreeze({
    intentId: wanted,
    basisDigest: bound.basisDigest,
    bindings: rows,
    candidates: data(candidates),
  });
}

const RESULT_SHAPES = {
  selected: ['kind', 'operationId', 'capabilityId', 'handlerId', 'basisDigest'],
  missing: ['kind', 'intentId'],
  ambiguous: ['kind', 'intentId', 'candidateOperationIds'],
  denied: ['kind', 'reasonCode'],
};

/**
 * Kernel-owned admission revalidation of ONE Router result against the sealed
 * selected table. This is the N01 Kernel admission contract boundary: only a
 * `selected` result that matches one sealed route row exactly — including the
 * basis digest — may advance toward Kernel admission, and caller-supplied
 * authority fields are untrusted data, never credentials. The physical
 * H→K principal/permit port, State/Journal/Effect dispatch and UNKNOWN
 * handling stay with the selected Kernel/Host (#1032/#1036); this function
 * grants none of them.
 *
 * TRUST BOUNDARY (R0 reviewer question): the returned receipt is a pure
 * candidate revalidation DATUM, not an issuer approval and not an H-issued
 * authorization or permit. The `table` input is plain data — any fabricated
 * table can be internally consistent, so the receipt proves at most internal
 * agreement between the two given values. A provenance-qualified table
 * reaches the Kernel only through the protected BUILD/Host handoff owned by
 * #1032/#1036; no physical Kernel/Host path may treat this return value as
 * final authorization, and no path from this function executes an effect.
 *
 * @param {unknown} input `{table, intentId, routerResult}` plain data.
 * @returns {object} Frozen Kernel admission revalidation receipt.
 */
export function authorizeSelectedOperation(input) {
  const request = obj(data(input), 'kernel authorization input', ['table', 'intentId', 'routerResult']);
  const bound = obj(request.table, 'selected closure table', [
    'formatVersion', 'rootPackageId', 'basisDigest', 'kernel', 'standard', 'businesses', 'capabilities', 'routes',
  ]);
  if (bound.formatVersion !== V09_SELECTED_ABI_FORMAT) {
    refuse('SELECTED_ABI_CONTRACT_INVALID', 'authorizeSelectedOperation requires a table produced by bindSelectedClosure');
  }
  const intentId = routerIdent(request.intentId, 'intentId');
  const result = request.routerResult;
  if (result === null || Array.isArray(result) || typeof result !== 'object') {
    refuse('SELECTED_ABI_RESULT_UNTRUSTED', 'router result must be a record');
  }
  const kind = result.kind;
  const shape = RESULT_SHAPES[kind];
  if (shape === undefined) {
    refuse('SELECTED_ABI_RESULT_UNTRUSTED', `router result carries unknown kind ${String(kind)}`);
  }
  const present = Object.keys(result);
  if (present.some(key => !shape.includes(key))) {
    // Any smuggled principal/authorize/permit field is caller data, not
    // authority; it can only make the result LESS trustworthy, never more.
    refuse('SELECTED_ABI_RESULT_UNTRUSTED', 'router result carries fields beyond its kind union; caller data is not authority');
  }
  if (kind !== 'selected') {
    refuse('SELECTED_ABI_NOT_SELECTED', `a ${kind} Router outcome admits nothing at the Kernel boundary`);
  }
  routerIdent(result.operationId, 'result.operationId');
  routerIdent(result.capabilityId, 'result.capabilityId');
  routerIdent(result.handlerId, 'result.handlerId');
  if (typeof result.basisDigest !== 'string') {
    refuse('SELECTED_ABI_CONTRACT_INVALID', 'result.basisDigest must be a string');
  }
  const route = bound.routes.find(row => row.intentId === intentId && row.operationId === result.operationId);
  if (
    route === undefined
    || route.capabilityId !== result.capabilityId
    || route.handlerId !== result.handlerId
  ) {
    refuse('SELECTED_ABI_BINDING_UNMATCHED', `the claimed selected operation ${result.operationId} is not exactly BUILD-sealed for intent ${intentId}`);
  }
  if (result.basisDigest !== bound.basisDigest) {
    refuse('SELECTED_ABI_BASIS_MISMATCH', 'the Router result carries a basis digest foreign to this sealed selected closure');
  }
  return deepFreeze({
    admittedIntentId: intentId,
    operationId: route.operationId,
    capabilityId: route.capabilityId,
    handlerId: route.handlerId,
    basisDigest: bound.basisDigest,
  });
}
