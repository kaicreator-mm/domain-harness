/**
 * DomainHarness v0.10 T03 — selected Standard workflow-control feature.
 *
 * Bounded loop / child / WAIT / RESUME / callback / deadline SEMANTICS as
 * one sealed Standard feature. It is a pure data-only planner: it owns no
 * document, no journal, no scheduler, no runtime — the selected Kernel
 * alone owns durable turn identity, State, original receipts and Effect
 * authorization (K01/K02), and the trusted Host durable-controls
 * coordinators alone own the delivery CAS state machines. Every returned
 * action is a PROPOSAL the trusted driver executes through those real
 * seams; possessing feature data never creates a Kernel permit.
 *
 * The historical v0.5 RuntimeV3 engine semantics (bounded cycles, child
 * correlation, durable WAIT checkpoints, one-shot deadlines) are preserved
 * HERE as semantics only — authority stays with the v0.10 selected K.
 */
export const MODULE_ID = 'sfeature-workflow-control@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:workflow-control/1';

// Bounds re-declared by value with their provenance (never imported):
// loop budget ceiling is this feature's own declared bound; child depth 32
// mirrors the selected Host MAX_CHILD_LINEAGE_DEPTH (durable-controls.ts,
// itself the smallest existing frozen child-depth limit).
const MAX_LOOP_ITERATIONS = 1024;
const MAX_CHILD_DEPTH = 32;
const MAX_ORDINAL = 1024;

const OWNED_AUTHORITY_FIELDS = new Set([
  'effectPermit', 'permit', 'effectIntents', 'admissionFence',
  'effectJournal', 'journal', 'resources', 'hostPorts', 'kernelState',
  'createOccurrenceRuntime', 'submitOccurrence', 'principal',
]);

class WorkflowControlRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WorkflowControlRefusal';
    this.code = code;
  }
}

const record = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null);

function refuse(code, reason) {
  throw new WorkflowControlRefusal(code, reason);
}

function canonical(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  // JSON.stringify semantics: an undefined object value drops the key, an
  // undefined array item is null — an explicitly absent bound is then the
  // caller's own typed refusal case, not non-JSON data.
  if (Array.isArray(value)) return '[' + value.map((item) => (item === undefined ? 'null' : canonical(item, path))).join(',') + ']';
  if (record(value)) {
    return '{' + Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) =>
      JSON.stringify(key) + ':' + canonical(value[key], path)).join(',') + '}';
  }
  refuse('WORKFLOW_DATA_INVALID', `${path} must be finite plain JSON`);
}

/** Reject Kernel/Host authority fields anywhere in caller material. */
function checkedPlain(value, path = '$', depth = 0) {
  if (value === undefined) return undefined;
  if (depth > 32) refuse('WORKFLOW_DATA_INVALID', `${path} depth exceeds the bound`);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) checkedPlain(value[index], `${path}[${index}]`, depth + 1);
    return JSON.parse(canonical(value, path));
  }
  if (record(value)) {
    for (const key of Object.keys(value)) {
      if (OWNED_AUTHORITY_FIELDS.has(key)) {
        refuse('WORKFLOW_AUTHORITY_FORBIDDEN', `${path}.${key}: workflow-control material cannot carry Kernel or external-effect authority`);
      }
      checkedPlain(value[key], `${path}.${key}`, depth + 1);
    }
    return JSON.parse(canonical(value, path));
  }
  canonical(value, path);
  return value;
}

const IDENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Bounded ':'-free component (embeds into Host correlation doc keys). */
function component(value, label) {
  if (typeof value !== 'string' || !IDENT.test(value)) {
    refuse('WORKFLOW_REQUEST_INVALID', `${label} must be a bounded ':'-free identifier`);
  }
  return value;
}

function ordinal(value, label, ceiling = MAX_ORDINAL) {
  if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) {
    refuse('WORKFLOW_REQUEST_INVALID', `${label} must be a positive integer <= ${String(ceiling)}`);
  }
  return value;
}

function targetOf(request) {
  const target = request.target;
  if (!record(target)) refuse('WORKFLOW_REQUEST_INVALID', 'target must be a record');
  return {
    workflowId: component(target.workflowId, 'target.workflowId'),
    instanceKey: component(target.instanceKey, 'target.instanceKey'),
  };
}

function optionalScope(scope) {
  if (scope === undefined || scope === null) return null;
  if (!record(scope)) refuse('WORKFLOW_REQUEST_INVALID', 'scope must be a record when present');
  return {
    appId: component(scope.appId, 'scope.appId'),
    tenantId: component(scope.tenantId, 'scope.tenantId'),
  };
}

function deadlineOf(control, now) {
  if (control.deadlineEpochMs === undefined || control.deadlineEpochMs === null) return null;
  if (!Number.isFinite(control.deadlineEpochMs) || control.deadlineEpochMs < 0) {
    refuse('WORKFLOW_BUDGET_INVALID', 'deadlineEpochMs must be a finite nonnegative epoch millis');
  }
  if (now() > control.deadlineEpochMs) {
    refuse('WORKFLOW_DEADLINE_EXCEEDED', 'the workflow-control deadline passed before this proposal');
  }
  return control.deadlineEpochMs;
}

function proposalBase(target, evidence) {
  // kernelEffectPermit rides BOTH levels: the top level for one-glance
  // truth, evidence for receipt-style aggregation.
  return { target, kernelEffectPermit: false, evidence: { ...evidence, kernelEffectPermit: false } };
}

export function init(context) {
  // Bounded data-only init; no protected ports observed or returned.
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

/**
 * planWorkflowControl(request, deps?) — plan ONE bounded control action.
 *
 * request.kind:
 *   'loop.next'      plan the next bounded loop step (message turn proposal)
 *   'child.open'     plan one child-workflow correlation identity
 *   'wait.open'      plan one WAIT checkpoint (external work + deadline)
 *   'control.resume' validate a settled delivery and plan the K resume turn
 *
 * deps: { now?: () => number } — clock is proposal-time only; the Kernel
 * and the Host coordinators keep every durable authority.
 */
export function planWorkflowControl(request, deps = {}) {
  if (!record(request) || typeof request.kind !== 'string') {
    refuse('WORKFLOW_REQUEST_INVALID', 'request must be a record with a kind');
  }
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  checkedPlain(request);
  const target = targetOf(request);
  switch (request.kind) {
    case 'loop.next': return planLoopStep(request, target, now);
    case 'child.open': return planChildOpen(request, target);
    case 'wait.open': return planWaitOpen(request, target, now);
    case 'control.resume': return planControlResume(request, target);
    default: refuse('WORKFLOW_REQUEST_INVALID', `unknown workflow-control kind '${String(request.kind)}'`);
  }
}

/** A — bounded loop step with deterministic exit and typed exhaustion. */
function planLoopStep(request, target, now) {
  const control = request.control;
  if (!record(control)) refuse('WORKFLOW_REQUEST_INVALID', 'loop.next requires a control record');
  const loopId = component(control.loopId, 'control.loopId');
  const maxIterations = control.maxIterations;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > MAX_LOOP_ITERATIONS) {
    refuse('WORKFLOW_BUDGET_INVALID', `maxIterations must be an integer in [1, ${String(MAX_LOOP_ITERATIONS)}]; an unbounded loop is refused`);
  }
  const iteration = control.iteration;
  if (!Number.isSafeInteger(iteration) || iteration < 0) {
    refuse('WORKFLOW_BUDGET_INVALID', 'iteration must be a nonnegative integer');
  }
  const deadlineEpochMs = deadlineOf(control, now);
  if (iteration >= maxIterations) {
    refuse('WORKFLOW_BUDGET_EXHAUSTED', `loop ${loopId} consumed its full budget of ${String(maxIterations)} step(s); no further step is proposed`);
  }
  const step = request.step;
  if (!record(step) || typeof step.intentType !== 'string' || step.intentType.length === 0) {
    refuse('WORKFLOW_REQUEST_INVALID', 'loop.next requires a step with an intentType');
  }
  if (!Array.isArray(control.stepIntentTypes) || control.stepIntentTypes.length === 0
    || control.stepIntentTypes.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    refuse('WORKFLOW_REQUEST_INVALID', 'control.stepIntentTypes must be a non-empty array of sealed step intents');
  }
  if (!control.stepIntentTypes.includes(step.intentType)) {
    refuse('WORKFLOW_STEP_UNAUTHORIZED', `step intent '${step.intentType}' is not sealed for loop ${loopId}`);
  }
  const input = step.input === undefined ? {} : checkedPlain(step.input, 'step.input');
  const messageId = `wfc/loop/${target.workflowId}/${target.instanceKey}/${loopId}/${String(iteration)}`;
  return {
    ...proposalBase(target, { kind: 'loop.step', loopId, iteration, remaining: maxIterations - iteration - 1 }),
    action: 'submit',
    final: iteration === maxIterations - 1,
    proposal: { intentType: step.intentType, messageId, input, turnSource: null },
    budget: { iteration, maxIterations, ...(deadlineEpochMs === null ? {} : { deadlineEpochMs }) },
  };
}

/** B — one child correlation identity within the accepted depth bound. */
function planChildOpen(request, target) {
  const control = request.control;
  if (!record(control)) refuse('WORKFLOW_REQUEST_INVALID', 'child.open requires a control record');
  const childInstanceKey = component(control.childInstanceKey, 'control.childInstanceKey');
  if (childInstanceKey === target.instanceKey) {
    refuse('WORKFLOW_CHILD_INVALID', 'a workflow cannot invoke itself as its own child (unbounded self-recursion is refused)');
  }
  const lineageDepth = ordinal(control.lineageDepth, 'control.lineageDepth');
  if (lineageDepth > MAX_CHILD_DEPTH) {
    refuse('WORKFLOW_CHILD_DEPTH_EXCEEDED', `child lineage depth ${String(lineageDepth)} exceeds the accepted maximum ${String(MAX_CHILD_DEPTH)}`);
  }
  const invocationOrdinal = control.invocationOrdinal === undefined || control.invocationOrdinal === null
    ? null
    : ordinal(control.invocationOrdinal, 'control.invocationOrdinal');
  for (const field of ['childIntentType', 'doneIntentType', 'errorIntentType']) {
    if (typeof control[field] !== 'string' || control[field].length === 0) {
      refuse('WORKFLOW_REQUEST_INVALID', `control.${field} must be a non-empty intent type`);
    }
  }
  // The durable correlation grammar re-declared by value (the trusted Host
  // coordinator computes the record's own truth; the driver cross-checks).
  const expectedOrdinal = invocationOrdinal ?? 1;
  return {
    ...proposalBase(target, { kind: 'child.open', lineageDepth }),
    action: 'open-child',
    proposal: {
      parentActorId: target.instanceKey,
      childActorId: childInstanceKey,
      invocationOrdinal,
      lineageDepth,
      childIntentType: control.childIntentType,
      doneIntentType: control.doneIntentType,
      errorIntentType: control.errorIntentType,
      correlationGrammar: 'child:{parentInstanceKey}:{childInstanceKey}:{invocationOrdinal}',
      expectedCorrelationId: `child:${target.instanceKey}:${childInstanceKey}:${String(expectedOrdinal)}`,
    },
  };
}

/** C — one WAIT checkpoint proposal with exact resume identities. */
function planWaitOpen(request, target, now) {
  const control = request.control;
  if (!record(control)) refuse('WORKFLOW_REQUEST_INVALID', 'wait.open requires a control record');
  const externalCorrelationId = component(control.externalCorrelationId, 'control.externalCorrelationId');
  const deadlineTimerId = component(control.deadlineTimerId, 'control.deadlineTimerId');
  if (typeof control.dueAt !== 'string' || !Number.isFinite(Date.parse(control.dueAt))) {
    refuse('WORKFLOW_WAIT_INVALID', 'control.dueAt must be a valid ISO timestamp');
  }
  if (Date.parse(control.dueAt) <= now()) {
    refuse('WORKFLOW_WAIT_INVALID', 'control.dueAt must lie strictly in the future at registration time');
  }
  for (const field of ['callbackIntentType', 'timeoutIntentType']) {
    if (typeof control[field] !== 'string' || control[field].length === 0) {
      refuse('WORKFLOW_REQUEST_INVALID', `control.${field} must be a non-empty intent type`);
    }
  }
  return {
    ...proposalBase(target, { kind: 'wait.open' }),
    action: 'register-external-work',
    proposal: {
      externalCorrelationId,
      deadlineTimerId,
      dueAt: control.dueAt,
      callbackIntentType: control.callbackIntentType,
      timeoutIntentType: control.timeoutIntentType,
      // The exact one-shot resume identities (callback ordinal 1; the
      // deadline timer is one-shot fireOrdinal 1 — the Host contracts).
      callbackToken: { externalCorrelationId, callbackOrdinal: 1 },
      callbackMessageId: `ctrl:callback:${externalCorrelationId}:1`,
      timerMessageId: `ctrl:timer:${deadlineTimerId}:1`,
    },
  };
}

const RESUME_SOURCE_FIELDS = {
  callback: ['externalCorrelationId', 'callbackOrdinal'],
  timer: ['timerId', 'fireOrdinal'],
  'child-terminal': ['parentActorId', 'childActorId', 'invocationOrdinal', 'terminalKind'],
};

// Durable record truth may carry extra per-kind fields (the Host coordinator
// stores the callback payload / the owning correlation on its terminalSource);
// they are input material only — the emitted K turnSource below projects the
// strict Kernel field set and nothing else.
const RESUME_SOURCE_OPTIONAL_FIELDS = {
  callback: ['payload'],
  timer: ['externalCorrelationId'],
  'child-terminal': [],
};

/** Validate one settled delivery's source shape (the Kernel revalidates). */
function resumeSourceOf(settled) {
  const source = settled.source;
  if (!record(source) || typeof source.kind !== 'string') {
    refuse('WORKFLOW_RESUME_MISMATCH', 'settled.source must be a record with a kind');
  }
  const fields = RESUME_SOURCE_FIELDS[source.kind];
  if (fields === undefined) {
    refuse('WORKFLOW_RESUME_MISMATCH', `unknown settled source kind '${String(source.kind)}'`);
  }
  const tolerated = [...fields, ...RESUME_SOURCE_OPTIONAL_FIELDS[source.kind]];
  for (const key of Object.keys(source)) {
    if (key !== 'kind' && !tolerated.includes(key)) {
      refuse('WORKFLOW_RESUME_MISMATCH', `settled source ${String(source.kind)} carries the unsupported field ${key}`);
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(source, field)) {
      refuse('WORKFLOW_RESUME_MISMATCH', `settled source ${String(source.kind)} is missing ${field}`);
    }
  }
  if (source.kind === 'callback') {
    component(source.externalCorrelationId, 'source.externalCorrelationId');
    ordinal(source.callbackOrdinal, 'source.callbackOrdinal');
  } else if (source.kind === 'timer') {
    component(source.timerId, 'source.timerId');
    if (source.fireOrdinal !== 1) refuse('WORKFLOW_RESUME_MISMATCH', 'deadline timers are one-shot and resume at fireOrdinal 1');
  } else {
    component(source.parentActorId, 'source.parentActorId');
    component(source.childActorId, 'source.childActorId');
    ordinal(source.invocationOrdinal, 'source.invocationOrdinal');
    if (source.terminalKind !== 'done' && source.terminalKind !== 'error') {
      refuse('WORKFLOW_RESUME_MISMATCH', 'child-terminal terminalKind must be done or error');
    }
  }
  return source;
}

function scopeMismatch(expected, settledScope) {
  return expected !== null && (settledScope === null
    || settledScope.appId !== expected.appId || settledScope.tenantId !== expected.tenantId);
}

/** The durable terminal status that legitimately carries each source kind. */
function terminalStatusOf(source) {
  if (source.kind === 'callback') return 'callback_received';
  if (source.kind === 'timer') return 'timed_out';
  return source.terminalKind;
}

/**
 * C/D — validate ONE settled coordinator outcome against the expected
 * binding and return the exact data-only K resume-turn proposal, or an
 * idempotent REPLAY proposal when the turn was already submitted (the
 * stable turn identity makes re-submission a Kernel original-receipt
 * replay — zero new effect).
 */
function planControlResume(request, target) {
  const control = request.control;
  if (!record(control) || !record(control.expected)) {
    refuse('WORKFLOW_REQUEST_INVALID', 'control.resume requires control.expected');
  }
  const settled = request.settled;
  if (!record(settled)) refuse('WORKFLOW_REQUEST_INVALID', 'control.resume requires a settled record');
  const source = resumeSourceOf(settled);
  const expected = control.expected;
  const expectedScope = optionalScope(expected.scope);
  const settledScope = optionalScope(settled.scope);
  if (scopeMismatch(expectedScope, settledScope)) {
    refuse('WORKFLOW_RESUME_MISMATCH', 'the settled delivery belongs to a different app/tenant scope than the expected binding');
  }
  if (settled.status !== undefined && settled.status !== terminalStatusOf(source)) {
    // A losing delivery (a callback that arrived after the deadline won, an
    // out-of-order ordinal, a foreign settle) never carries the winning
    // terminal status — no resume turn is proposed for it.
    refuse('WORKFLOW_RESUME_MISMATCH', `the settled delivery status '${String(settled.status)}' did not win its correlation; a losing or stale delivery proposes no resume turn`);
  }

  let intentType;
  let messageId;
  if (source.kind === 'callback' || source.kind === 'timer') {
    if (typeof expected.externalCorrelationId !== 'string' || expected.externalCorrelationId.length === 0) {
      refuse('WORKFLOW_REQUEST_INVALID', 'expected.externalCorrelationId is required for callback/timer resumes');
    }
    if (source.externalCorrelationId !== expected.externalCorrelationId) {
      refuse('WORKFLOW_RESUME_MISMATCH', `settled correlation '${source.externalCorrelationId}' is not the binding this target waits on`);
    }
    if (source.kind === 'timer') {
      if (expected.deadlineTimerId !== undefined && source.timerId !== expected.deadlineTimerId) {
        refuse('WORKFLOW_RESUME_MISMATCH', `timer '${source.timerId}' does not own the awaited correlation`);
      }
      if (typeof expected.timeoutIntentType !== 'string' || expected.timeoutIntentType.length === 0) {
        refuse('WORKFLOW_REQUEST_INVALID', 'expected.timeoutIntentType is required for timer resumes');
      }
      intentType = expected.timeoutIntentType;
      messageId = `ctrl:timer:${source.timerId}:1`;
    } else {
      if (expected.callbackOrdinal !== undefined && source.callbackOrdinal !== expected.callbackOrdinal) {
        refuse('WORKFLOW_RESUME_MISMATCH', `callback ordinal ${String(source.callbackOrdinal)} is not the awaited ordinal`);
      }
      if (typeof expected.callbackIntentType !== 'string' || expected.callbackIntentType.length === 0) {
        refuse('WORKFLOW_REQUEST_INVALID', 'expected.callbackIntentType is required for callback resumes');
      }
      intentType = expected.callbackIntentType;
      messageId = `ctrl:callback:${source.externalCorrelationId}:${String(source.callbackOrdinal)}`;
    }
  } else {
    for (const field of ['parentActorId', 'childActorId']) {
      if (typeof expected[field] !== 'string' || expected[field].length === 0) {
        refuse('WORKFLOW_REQUEST_INVALID', `expected.${field} is required for child-terminal resumes`);
      }
      if (source[field] !== expected[field]) {
        refuse('WORKFLOW_RESUME_MISMATCH', `settled child-terminal ${field} '${String(source[field])}' does not match the exact binding`);
      }
    }
    if (source.parentActorId !== target.instanceKey) {
      refuse('WORKFLOW_RESUME_MISMATCH', 'the settled child terminal names a different parent than this target');
    }
    if (expected.invocationOrdinal !== undefined && source.invocationOrdinal !== expected.invocationOrdinal) {
      refuse('WORKFLOW_RESUME_MISMATCH', `child invocation ordinal ${String(source.invocationOrdinal)} is not the awaited ordinal`);
    }
    const intentField = source.terminalKind === 'done' ? 'doneIntentType' : 'errorIntentType';
    if (typeof expected[intentField] !== 'string' || expected[intentField].length === 0) {
      refuse('WORKFLOW_REQUEST_INVALID', `expected.${intentField} is required for a ${source.terminalKind} child terminal`);
    }
    intentType = expected[intentField];
    messageId = `ctrl:child:${source.parentActorId}:${source.childActorId}:${String(source.invocationOrdinal)}:${source.terminalKind}`;
  }

  const input = request.input === undefined || request.input === null ? {} : checkedPlain(request.input, 'input');
  const turnSource = { kind: source.kind };
  for (const field of RESUME_SOURCE_FIELDS[source.kind]) turnSource[field] = source[field];
  const alreadySubmitted = record(settled.submittedTurn) && settled.submittedTurn.messageId === messageId;
  return {
    ...proposalBase(target, { kind: 'control.resume', resumeSourceKind: source.kind }),
    action: alreadySubmitted ? 'replay' : 'submit',
    proposal: { intentType, messageId, input, turnSource },
    replayExpected: alreadySubmitted === true,
  };
}
