/**
 * #984 V08-B2-R3-A1 (P1-02 repair, part 1): explicit trust-preserving
 * physical Package Component -> native v0.7 Tool projection.
 *
 * Derived from experiments/v08-gatea-repair-942/authority/native-join.mjs
 * L45-75 at base SHA e11a0510134903d6f05a20dd024f3740429edc33 (B2 R2 PR #980).
 * The R2 shape silently DROPPED the physical operation `callers`/`exposure`/
 * `failures` scope and the component `requiresCapabilities`, built a synthetic
 * one-Tool graph, and installed an EMPTY `validateComponent(){}`. This
 * successor defines and enforces explicit projection rules instead:
 *
 * - IDENTITY: the native Tool keeps the physical componentId, packageId and
 *   exact attested KindRef verbatim. A selection whose implementation pin does
 *   not match the attested module bytes or component owner is typed-rejected
 *   (never re-attested under a foreign identity).
 * - SEMANTIC CONTRACT: every physical operation field survives the projection
 *   under its exact native v0.7 ToolOperationContract mapping:
 *   physical `failures` -> native `declaredFailures`;
 *   physical `exposure`+`callers` -> native `declaredExposure` (one JSON
 *   object carrying BOTH, so the caller/caller-scope provenance stays part of
 *   the exposure digest material that T004A hands to the policy decision).
 *   Nothing is defaulted, widened or dropped.
 * - CONSUMED CAPABILITIES: physical `requiresCapabilities` are carried into
 *   the native Tool `requiredCapabilities` (v0.7 refs are exactly
 *   {capabilityId, version}; the physical operation scope of a capability
 *   stays enforced by the #956 physical validation plus the T003C binding's
 *   exact supportedOperations) and each consumed capability MUST resolve
 *   inside the native graph (the join fail-closes with
 *   E_PROJECTION_CONSUMED_CAPABILITY_UNRESOLVED otherwise). Capability scope
 *   is never silently widened.
 * - UNSUPPORTED PHYSICAL SHAPES ARE TYPED-REJECTED: multi-operation
 *   components (this bounded bridge binds exactly the single declared
 *   operation), effect='none' selections (the effectful native path is
 *   T004C-only; T004B owns effect=none), unknown effect classes, empty or
 *   missing caller scope, malformed schemas. No silent relaxation.
 * - REAL Kind validator: `validateComponent` is a genuine function that
 *   deep-compares the projected envelope against the attested physical
 *   contract snapshot; any drift (including a mutated semanticBody between
 *   projection and admission) fails closed with a typed
 *   E_PROJECTION_VALIDATOR_* error. This is NOT the physical validator
 *   re-run (the B1/#956 validator already ran against the exact bytes); it
 *   proves the NATIVE projection itself cannot drift from what was attested.
 *
 * TRUST SEMANTICS (documented, not unconditional relaxation): the native
 * projection is a RESEARCH projection of one attested physical B Package
 * operation onto the original v0.7 Tool path. It grants no authority by
 * itself: admission stays with the trusted Host-only policy port
 * (./host-policy.mjs), dispatch stays with the original v0.7 T003C/T004C
 * chain, and the original v0.7 Central Admission + its Journal remain the
 * ONLY effect authority. This module is not a Runtime, not a second graph
 * owner and not a sandbox (data-URL module loading in the physical Host is
 * NOT an isolation boundary).
 *
 * This file is the #983 K1 integration seam: K1 may supply its own physically
 * attested selected-handler snapshot (the exact `physicalSelection` shape
 * documented on `projectPhysicalComponentToNative`) and receive exactly one
 * sealed native Assembly for it. Until that integration exists this remains
 * PARTIAL by construction.
 */

const EFFECTFUL_CLASSES = new Set(['idempotent', 'non-idempotent']);

/** Typed projection failure (fail-closed, never a silent widening). */
export class A1ProjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'A1ProjectionError';
  }
}

const deny = (code, message) => {
  throw new A1ProjectionError(code, message);
};

/** Stable deep-equality over plain JSON material (snapshots are JSON). */
export function jsonEquals(left, right) {
  return stableStringify(left) === stableStringify(right);
}

/** Deterministic JSON string with sorted object keys (for equality only). */
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

const snap = (value) => JSON.parse(JSON.stringify(value));

/**
 * Effect-type derivation from ATTESTED BINDING FACTS ONLY (P1-02: effect type
 * is never hardcoded and never caller-supplied): the admitted effect type of
 * the joined occurrence is exactly `effect:<physicalPackageId>.<operationId>`.
 */
export function deriveNativeEffectType(physical) {
  const checked = requireSelectionShape(physical);
  return 'effect:' + checked.packageId + '.' + checked.operation.operationId;
}

/** Structural shape gate over the attested physical selection snapshot. */
function requireSelectionShape(physical) {
  if (!physical || typeof physical !== 'object') {
    deny('E_PROJECTION_SELECTION_SHAPE', 'physical selection snapshot must be an object');
  }
  const expectedKeys = ['packageId', 'manifestSha256', 'moduleSha256', 'kindRef', 'component', 'implementation', 'operation', 'handler'].sort();
  const actualKeys = Object.keys(physical).sort();
  if (stableStringify(actualKeys) !== stableStringify(expectedKeys)) {
    deny('E_PROJECTION_SELECTION_SHAPE',
      'physical selection snapshot must contain exactly {packageId, manifestSha256, moduleSha256, kindRef, component, implementation, operation, handler}; got ' + actualKeys.join(','));
  }
  for (const id of ['packageId', 'manifestSha256', 'moduleSha256']) {
    if (typeof physical[id] !== 'string' || physical[id].length === 0) {
      deny('E_PROJECTION_SELECTION_SHAPE', 'physical selection.' + id + ' must be a non-empty string');
    }
  }
  if (!/^[a-f0-9]{64}$/.test(physical.manifestSha256) || !/^[a-f0-9]{64}$/.test(physical.moduleSha256)) {
    deny('E_PROJECTION_SELECTION_SHAPE', 'physical selection manifest/module SHA256 must be raw 64-hex digests');
  }
  if (typeof physical.handler !== 'function') {
    deny('E_PROJECTION_HANDLER_REQUIRED', 'physical selection.handler must be the exact captured callable');
  }
  return physical;
}

/**
 * Explicit projection rules (see module doc). Returns frozen plain objects:
 * {nativeTool, consumer, graph, kindImplementation, projectedOperation,
 *  consumedCapabilities, attested}.
 */
export function projectPhysicalComponentToNative(physicalSelection) {
  const physical = requireSelectionShape(physicalSelection);
  const component = physical.component;
  const operation = physical.operation;
  const implementation = physical.implementation;

  // ---- Identity gates: the projection can never re-attest under a foreign
  // identity, and the implementation pin must be the attested module bytes.
  if (!component || typeof component !== 'object' || typeof component.componentId !== 'string' ||
      component.componentId.length === 0) {
    deny('E_PROJECTION_IDENTITY', 'physical component must carry a non-empty componentId');
  }
  if (component.packageId !== physical.packageId) {
    deny('E_PROJECTION_IDENTITY',
      'physical component.packageId "' + String(component.packageId) +
      '" does not match the attested package "' + physical.packageId + '"');
  }
  if (!implementation || implementation.componentId !== component.componentId) {
    deny('E_PROJECTION_IDENTITY',
      'physical implementation.componentId does not match the attested component; the same bytes can never be re-attested under a foreign component identity');
  }
  if (implementation.sha256 !== 'sha256:' + physical.moduleSha256) {
    deny('E_PROJECTION_IDENTITY',
      'physical implementation.sha256 does not match the attested module bytes digest');
  }
  if (!physical.kindRef || typeof physical.kindRef.kindId !== 'string' || typeof physical.kindRef.version !== 'string') {
    deny('E_PROJECTION_IDENTITY', 'physical selection.kindRef must be an exact {kindId, version}');
  }

  // ---- Bounded shape gates: unsupported physical types are typed-rejected,
  // never silently narrowed or widened.
  if (!Array.isArray(component.operations) || component.operations.length !== 1) {
    deny('E_PROJECTION_UNSUPPORTED_MULTI_OPERATION',
      'this bounded bridge projects exactly the single declared physical operation; got ' +
      (Array.isArray(component.operations) ? component.operations.length : String(component.operations)));
  }
  const op = component.operations[0];
  if (op.operationId !== operation.operationId) {
    deny('E_PROJECTION_IDENTITY',
      'physical component operation "' + String(op.operationId) +
      '" does not match the attested selected operation "' + String(operation.operationId) + '"');
  }
  if (!EFFECTFUL_CLASSES.has(op.effect)) {
    if (op.effect === 'none') {
      deny('E_EFFECTLESS_NATIVE_SELECTION',
        'effect="none" operations can never enter the effectful native T004C path (T004B owns them)');
    }
    deny('E_PROJECTION_UNSUPPORTED_EFFECT_CLASS',
      'physical operation effect ' + JSON.stringify(op.effect) + ' is not a frozen L2 effect class');
  }
  if (typeof op.operationId !== 'string' || op.operationId.length === 0 ||
      typeof op.inputSchema !== 'object' || op.inputSchema === null ||
      typeof op.outputSchema !== 'object' || op.outputSchema === null) {
    deny('E_PROJECTION_UNSUPPORTED_PHYSICAL_SHAPE',
      'physical operation must carry exact {operationId, inputSchema, outputSchema, effect}');
  }
  if (!Array.isArray(op.callers) || op.callers.length === 0 || op.callers.some((c) => typeof c !== 'string' || c.length === 0)) {
    deny('E_PROJECTION_CALLER_SCOPE_REQUIRED',
      'physical operation caller scope is empty or malformed; the projection never defaults or widens caller scope');
  }
  if (typeof op.exposure !== 'string' || op.exposure.length === 0) {
    deny('E_PROJECTION_UNSUPPORTED_PHYSICAL_SHAPE', 'physical operation exposure must be a non-empty string');
  }
  if (!Array.isArray(op.failures)) {
    deny('E_PROJECTION_UNSUPPORTED_PHYSICAL_SHAPE', 'physical operation failures must be an array (possibly empty)');
  }
  if (!Array.isArray(component.requiresCapabilities)) {
    deny('E_PROJECTION_UNSUPPORTED_PHYSICAL_SHAPE', 'physical component requiresCapabilities must be an array');
  }
  if (!Array.isArray(component.providesCapabilities) || component.providesCapabilities.length === 0) {
    deny('E_PROJECTION_CAPABILITY_SCOPE',
      'physical component must provide the capability the selected operation belongs to');
  }
  const capability = component.providesCapabilities.find(
    (cap) => Array.isArray(cap.operations) && cap.operations.includes(op.operationId),
  );
  if (!capability) {
    deny('E_PROJECTION_CAPABILITY_SCOPE',
      'selected operation "' + op.operationId + '" is not in any provided capability operation set');
  }

  // ---- Explicit field mapping (semantic contract preserved verbatim).
  // v0.7 capability references carry exactly {capabilityId, version}; the
  // physical capability's operation scope is NOT carried as a widened
  // capability ref — it stays enforced by (a) the #956 physical validation
  // already run over the exact bytes and (b) the T003C binding's exact
  // supportedOperations (only the selected operation is ever bound).
  const projectedOperation = {
    operationId: op.operationId,
    inputSchema: snap(op.inputSchema),
    outputSchema: snap(op.outputSchema),
    effect: op.effect,
    declaredFailures: snap(op.failures),
    declaredExposure: { exposure: op.exposure, callers: snap(op.callers) },
  };
  const capabilityRef = (cap) => ({ capabilityId: cap.capabilityId, version: cap.version });
  const consumedCapabilities = snap(
    (component.requiresCapabilities ?? []).map(capabilityRef),
  );

  const nativeTool = Object.freeze({
    family: 'tool',
    componentId: component.componentId,
    kind: snap(physical.kindRef),
    requiredSemanticContracts: snap(component.requiredSemanticContracts ?? []),
    // Every consumed physical capability is preserved verbatim — the join
    // must resolve it in the native graph or fail closed.
    requiredCapabilities: consumedCapabilities,
    semanticBody: {
      operations: [projectedOperation],
      providesCapabilities: snap(component.providesCapabilities).map(capabilityRef),
    },
  });

  // The consumer is the native v0.7 calling context (no authority of its
  // own); its required capability is exactly the projected provided one.
  const consumer = Object.freeze({
    family: 'semantic',
    componentId: 'consumer.v08-b2-r3-a1',
    kind: snap(physical.kindRef),
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: capability.capabilityId, version: capability.version }],
    semanticBody: { note: 'native v0.7 control caller; no permission authority' },
  });

  const graph = Object.freeze({
    graphId: 'graph.v08-b2-r3-a1-native-' + physical.packageId,
    components: [consumer, nativeTool],
    relations: [],
  });

  const attested = Object.freeze({
    packageId: physical.packageId,
    manifestSha256: physical.manifestSha256,
    moduleSha256Hex: physical.moduleSha256,
    kindRef: snap(physical.kindRef),
    componentId: component.componentId,
    implementationId: implementation.implementationId,
    operationId: op.operationId,
    projectedSemanticBody: snap(nativeTool.semanticBody),
    requiredSemanticContracts: snap(component.requiredSemanticContracts ?? []),
    requiredCapabilities: consumedCapabilities,
    callerScope: snap(op.callers),
    exposure: op.exposure,
    effectClass: op.effect,
  });

  const kindImplementation = Object.freeze({
    pin: {
      kind: snap(physical.kindRef),
      implementation: {
        implementationId: implementation.implementationId,
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:' + physical.moduleSha256,
      },
    },
    understoodSemanticContracts: snap(component.requiredSemanticContracts ?? []),
    understoodCapabilities: consumedCapabilities,
    // REAL validator (P1-02): deep-compares the admitted native envelope
    // against the attested projection snapshot. Any drift fails closed.
    validateComponent(envelope) {
      validateProjectedEnvelope(attested, envelope);
    },
  });

  return Object.freeze({
    nativeTool, consumer, graph, kindImplementation,
    projectedOperation: Object.freeze(snap(projectedOperation)),
    consumedCapabilities: Object.freeze(consumedCapabilities),
    attested,
  });
}

/** The genuine Kind validator body: no-op is a P1-02 finding; this is real. */
export function validateProjectedEnvelope(attested, envelope) {
  if (!envelope || typeof envelope !== 'object') {
    deny('E_PROJECTION_VALIDATOR_SHAPE', 'projected component envelope must be an object');
  }
  if (envelope.componentId !== attested.componentId) {
    deny('E_PROJECTION_VALIDATOR_IDENTITY',
      'projected envelope componentId ' + JSON.stringify(envelope.componentId) +
      ' drifts from the attested physical component ' + JSON.stringify(attested.componentId));
  }
  if (stableStringify(envelope.kind ?? null) !== stableStringify(attested.kindRef)) {
    deny('E_PROJECTION_VALIDATOR_IDENTITY', 'projected envelope Kind drifts from the attested KindRef');
  }
  if (stableStringify(envelope.semanticBody ?? null) !== stableStringify(attested.projectedSemanticBody)) {
    deny('E_PROJECTION_VALIDATOR_CONTRACT',
      'projected semanticBody drifts from the attested physical contract (operations, capability scope, caller/exposure/failure scope or provenance changed)');
  }
  if (stableStringify(envelope.requiredSemanticContracts ?? []) !== stableStringify(attested.requiredSemanticContracts)) {
    deny('E_PROJECTION_VALIDATOR_CONTRACT', 'projected requiredSemanticContracts drift from the attested physical declarations');
  }
  if (stableStringify(envelope.requiredCapabilities ?? []) !== stableStringify(attested.requiredCapabilities)) {
    deny('E_PROJECTION_VALIDATOR_CONTRACT',
      'projected requiredCapabilities drift from the physical requiresCapabilities; consumed capability scope is never silently widened');
  }
}
