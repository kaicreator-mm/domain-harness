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


/**
 * FR08 model measurement capability, scoped to the protected Host bootstrap.
 *
 * Binding authority is NOT established by this ordinary JS factory. Only the
 * trusted Host, holding the module namespace behind qualified load(), may
 * supply an actual ModelPort and expose the returned resolver to K. Neither
 * a Business declaration nor interpret(..., context) can install one.
 *
 * A port invocation count is an observation of CALLS THROUGH THIS BOUND PORT
 * for this resolution, not a derived number from model text, journal entries,
 * user-provided context or historical fast-path assumptions. Without a
 * Host-bound port, plain interpret() emits 'unsupported'.
 *
 * The factory never mutates Domain state or commits a tool/effect/journal.
 */
export function createHostBoundModelResolver(hostModelPort, options = {}) {
  if (typeof hostModelPort !== 'object' || hostModelPort === null) {
    fail('SDK_MODEL_PORT_INVALID', 'a protected Host ModelPort object is required');
  }
  const descriptor = Object.getOwnPropertyDescriptor(hostModelPort, 'invoke');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
    fail('SDK_MODEL_PORT_INVALID', 'Host ModelPort.invoke must be a direct callable');
  }
  const invoke = descriptor.value.bind(hostModelPort);
  const config = data(options);
  const metered = config.metering === undefined || config.metering === 'measured';
  if (config.metering !== undefined && config.metering !== 'measured' && config.metering !== 'unmeasured') {
    fail('SDK_MODEL_PORT_INVALID', 'Host metering mode must be measured or unmeasured');
  }

  function observation(count) {
    return metered
      ? { status: 'measured', count, scope: 'bound-model-port-invocations' }
      : { status: 'unmeasured' };
  }

  return Object.freeze({
    /**
     * Model-free success: zero actual calls THROUGH THIS PORT. This does
     * not assert a global or cross-component LLM accounting total.
     */
    interpret(declaration, input, callerContext = {}) {
      const resolved = interpret(declaration, input, callerContext);
      return {
        ...resolved,
        modelCallEvidence: observation(0),
      };
    },
    /**
     * Fresh ModelPort invocation, with result captured as JSON. K alone can
     * admit the returned proposed decision, enforce guards and write state.
     */
    async invokeDecision(declaration, input, callerContext = {}) {
      const plan = record(data(declaration), 'model declaration');
      const selectedInput = record(data(input), 'model input');
      data(callerContext); // ignored for accounting; user-supplied meters cannot attest calls
      if (plan.kind !== 'model-decision') {
        fail('SDK_KIND_UNSUPPORTED', 'Host ModelPort invocation requires an explicit model-decision declaration');
      }
      const declarationId = ident(plan.id, 'model-decision.id');
      const modelOperation = ident(plan.modelOperation, 'model-decision.modelOperation');
      let output;
      try {
        output = await invoke({ operation: modelOperation, input: selectedInput });
      } catch (_error) {
        fail('SDK_MODEL_PORT_FAILED', 'trusted Host ModelPort invocation failed; no decision admitted');
      }
      const decision = data(output);
      record(decision, 'model result');
      if (!Object.hasOwn(decision, 'decision') || !Object.hasOwn(decision, 'event')) {
        fail('SDK_MODEL_OUTPUT_INVALID', 'ModelPort output requires structured decision and event');
      }
      return {
        kind: 'model-decision',
        structuredDecision: decision,
        provenance: { sdkModule: MODULE_ID, declarationId },
        source: 'host-model-port',
        llmAvoided: false,
        modelCallEvidence: observation(1),
        cacheDisposition: { read: 'disabled' },
        telemetry: [],
      };
    },
  });
}

/**
 * Retention: v0.7 ProjectionService @86110c6 blob 52b3127..., reduced to
 * the Standard-package-owned *deterministic projection* boundary.
 *
 * All source reads/currentness and exposure admission belong to K + trusted
 * Host. This method cannot read them or mint a provenance revision. It
 * consumes ONLY snapshots with exact K-attested revision selectors and yields
 * an inert projection candidate. Revision mismatch is fail-closed.
 */
export function projectRetainedRead(rawDeclaration, rawSnapshots) {
  const declaration = record(data(rawDeclaration), 'projection declaration');
  const snapshots = record(data(rawSnapshots), 'projection snapshots');
  const id = ident(declaration.projectionId, 'projectionId');
  const dependencies = declaration.dependencies;
  if (!Array.isArray(dependencies) || dependencies.length === 0 || dependencies.length > MAX_CASES) {
    fail('SDK_PROJECTION_INVALID', 'projection requires a bounded non-empty dependency list');
  }
  const assembled = Object.create(null);
  const revisions = Object.create(null);
  const keys = new Set();
  for (const dependency of dependencies) {
    record(dependency, 'projection dependency');
    const name = ident(dependency.name, 'projection dependency name');
    if (keys.has(name)) fail('SDK_PROJECTION_INVALID', 'ambiguous duplicate projection source');
    keys.add(name);
    const source = snapshots[name];
    if (source === undefined) fail('SDK_PROJECTION_MISSING', 'projection dependency is unavailable');
    record(source, 'projection source');
    const revision = ident(source.revision, 'projection source revision');
    const expected = ident(dependency.expectedRevision, 'projection expected revision');
    if (revision !== expected) fail('SDK_PROJECTION_STALE', 'the supplied source revision differs from the pinned projection');
    if (!Object.hasOwn(source, 'value')) fail('SDK_PROJECTION_MISSING', 'projection source contains no value');
    assembled[name] = source.value;
    revisions[name] = revision;
  }
  const fields = record(declaration.fields, 'projection fields');
  const candidate = Object.create(null);
  for (const [outputName, sourceName] of Object.entries(fields)) {
    ident(outputName, 'projection output');
    if (typeof sourceName !== 'string' || !Object.hasOwn(assembled, sourceName)) {
      fail('SDK_PROJECTION_INVALID', 'a projected field must reference a declared source');
    }
    candidate[outputName] = assembled[sourceName];
  }
  return {
    kind: 'projection',
    projectionId: id,
    candidate,
    sourceRevisions: revisions,
    revisionEvidence: { status: 'unmeasured' }, // only H can attest a revision digest
    authority: 'proposal-only',
  };
}

/**
 * Retention of the v0.7 resolver ordering (resolver.ts@86110c6
 * blob 25e8a621...): Rule -> Exact Cache -> Promoted -> Harness.
 * This does NOT execute any source. K passes current qualified observations;
 * the Standard SDK emits only a selected candidate. An unqualified cache
 * hit, stale promoted artifact, or missing harness is never auto-admitted.
 */
export function resolveRetainedDecision(rawSelection) {
  const selected = record(data(rawSelection), 'decision source selection');
  const id = ident(selected.decisionId, 'decisionId');
  const observations = record(selected.observations ?? {}, 'decision observations');
  const sources = ['rule', 'exact-cache', 'promoted-subworkflow', 'harness-machine'];
  for (const source of sources) {
    const observation = observations[source];
    if (observation === undefined) continue;
    record(observation, 'decision observation');
    switch (observation.status) {
      case 'not-applicable':
      case 'miss':
        continue;
      case 'revoked-deny':
      case 'failed':
        fail('SDK_DECISION_SOURCE_REFUSED', `source ${source} refuses or failed`);
        break;
      case 'match':
        if (!Object.hasOwn(observation, 'candidate')) fail('SDK_DECISION_SOURCE_INVALID', 'matching source has no candidate');
        if (source === 'exact-cache' && observation.exactCurrent !== true) {
          fail('SDK_DECISION_SOURCE_REFUSED', 'cache hit has no exact-currentness evidence');
        }
        if (source === 'promoted-subworkflow' && observation.artifactCurrent !== true) {
          fail('SDK_DECISION_SOURCE_REFUSED', 'promoted child is not verified current');
        }
        return {
          kind: 'decision-source',
          decisionId: id,
          selectedSource: source,
          candidate: observation.candidate,
          provenance: { sdkModule: MODULE_ID, authority: 'proposal-only' },
          modelCallEvidence: { status: 'unsupported' },
        };
      default:
        fail('SDK_DECISION_SOURCE_INVALID', 'unknown resolver source disposition');
    }
  }
  fail('SDK_DECISION_HARNESS_UNCONFIGURED', 'no admitted resolver candidate; no unbounded retries or invented fallback');
}

/**
 * Agent-safe Operation exposure projection ported from the frozen
 * v0.7 agent-tool-projection.ts@86110c6 blob 70932bed...
 * An S projection is never admission. Mutation-capable operations MUST NOT
 * acquire a query route merely because they were listed for an agent.
 */
export function projectRetainedAgentTools(rawOperations) {
  const operations = data(rawOperations);
  if (!Array.isArray(operations) || operations.length > MAX_CASES) {
    fail('SDK_TOOL_SURFACE_INVALID', 'operations must be a bounded list');
  }
  const tools = [];
  const seen = new Set();
  for (const operation of operations) {
    record(operation, 'operation descriptor');
    const id = ident(operation.operationId, 'operationId');
    if (seen.has(id)) fail('SDK_TOOL_SURFACE_INVALID', 'duplicate operation');
    seen.add(id);
    if (operation.agentExposed !== true) continue;
    if (operation.effectClass !== 'none') {
      fail('SDK_AGENT_MUTATION_REFUSED', 'agent read-only projection rejects effectful operation');
    }
    tools.push({ operationId: id, effectClass: 'none', authority: 'projection-only' });
  }
  return { kind: 'agent-tool-surface', tools, authority: 'projection-only' };
}

/**
 * #v0.6 NF05/NF06 retained decision handoff as inert data: exact assembly
 * qualification and durable append are K-owned, not Standard SDK authority.
 */
export function makeRetainedDecisionReceipt(rawResolution) {
  const resolution = record(data(rawResolution), 'decision resolution');
  const decisionId = ident(resolution.decisionId, 'decisionId');
  const turnId = ident(resolution.turnId, 'turnId');
  const source = ident(resolution.source, 'decision source');
  if (!Object.hasOwn(resolution, 'decision')) {
    fail('SDK_DECISION_RECEIPT_INVALID', 'decision receipt has no resolved decision');
  }
  return {
    kind: 'decision-receipt-proposal',
    eventType: 'DECISION_RECEIPT',
    decisionId,
    turnId,
    source,
    decision: resolution.decision,
    authority: 'proposal-only',
    durableAppend: 'required-by-kernel',
  };
}

/**
 * FR09 source reuse: promoted-child/selection + runtime@86110c6
 * blob e7e73afc...; qualified selection is a *candidate*, never an
 * executable child or substituted package authority.
 */
export function selectRetainedPromotedChild(rawSelection) {
  const choice = record(data(rawSelection), 'promoted child selection');
  const requested = record(choice.requested, 'requested promoted artifact');
  const approved = record(choice.approved, 'approved promoted artifact');
  const artifactId = ident(requested.artifactId, 'requested.artifactId');
  const contentDigest = ident(requested.contentDigest, 'requested.contentDigest');
  if (approved.artifactId !== artifactId || approved.contentDigest !== contentDigest) {
    fail('SDK_CHILD_IDENTITY_MISMATCH', 'promoted child does not match the approved exact artifact');
  }
  if (approved.revoked === true || approved.applicable !== true || approved.compatible !== true) {
    fail('SDK_CHILD_NOT_ELIGIBLE', 'promoted child is revoked, incompatible or not applicable');
  }
  if (choice.pinCommitted !== true) {
    fail('SDK_CHILD_PIN_REQUIRED', 'durable pin-before-execution must be established by Kernel');
  }
  return {
    kind: 'promoted-child-candidate',
    artifactId, contentDigest, authority: 'proposal-only',
    operation: 'run-in-authoritative-kernel-only',
  };
}

/**
 * HF17: v0.7 SubscriptionRegistry @86110c6 blob 52177373...
 * Deterministic coalescing of delivered revision observations, not Host
 * registration, authorization, resubscription or event dispatch.
 * Subscription currentness and credentials MUST be revalidated by H for
 * every physical delivery.
 */
export function coalesceRetainedObservations(rawObservations) {
  const observations = data(rawObservations);
  if (!Array.isArray(observations) || observations.length > MAX_ITEMS) {
    fail('SDK_SUBSCRIPTION_INVALID', 'observations must be a bounded data list');
  }
  const byId = new Map();
  for (const event of observations) {
    record(event, 'revision observation');
    const subscriptionId = ident(event.subscriptionId, 'subscriptionId');
    const revision = ident(event.revision, 'subscription revision');
    const epoch = event.epoch;
    if (!Number.isSafeInteger(epoch) || epoch < 0) {
      fail('SDK_SUBSCRIPTION_INVALID', 'an observation must have a nonnegative monotonic epoch');
    }
    const previous = byId.get(subscriptionId);
    if (previous && epoch < previous.epoch) {
      fail('SDK_SUBSCRIPTION_STALE', 'a reordered older observation cannot replace a newer revision');
    }
    if (previous && epoch === previous.epoch && revision !== previous.revision) {
      fail('SDK_SUBSCRIPTION_AMBIGUOUS', 'equal monotonic epochs with different revisions');
    }
    if (!previous || epoch > previous.epoch) byId.set(subscriptionId, { subscriptionId, revision, epoch });
  }
  return { kind: 'subscription-projection', observations: [...byId.values()], authority: 'projection-only' };
}

/**
 * FR12 evidence applicability from use-gate.ts@86110c6
 * blob 701ecad...; no credential minting. A claimed record is only a
 * *semantic applicability candidate*, not a signed/durable audit proof.
 */
export function checkRetainedEvidenceApplicability(rawRecord, rawExpected) {
  const receipt = record(data(rawRecord), 'evidence record');
  const expected = record(data(rawExpected), 'evidence required provenance');
  const packageId = ident(expected.packageId, 'expected packageId');
  const baselineDigest = ident(expected.baselineDigest, 'expected baselineDigest');
  if (receipt.packageId !== packageId || receipt.baselineDigest !== baselineDigest) {
    fail('SDK_EVIDENCE_SCOPE_MISMATCH', 'evidence belongs to a different package or governance baseline');
  }
  if (expected.durableAuditRequired === true && receipt.durableAudit !== true) {
    fail('SDK_EVIDENCE_DURABILITY_REQUIRED', 'governed evaluation requires durable audit evidence');
  }
  return { kind: 'evidence-applicability', eligibleForHostVerification: true, authority: 'proposal-only' };
}
