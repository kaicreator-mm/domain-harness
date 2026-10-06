/**
 * v0.7 Workflow compiler/runtime bridge (issue #620, fine-grained DAG T007B,
 * authority #589 PACK-C).
 *
 * ADAPTER, not Microkernel semantics: this module is the ONE private bridge
 * from an admitted v0.7 Workflow Semantic Component (T007A) into the existing
 * shipped workflow runtime. It owns exactly the concerns #589 assigns to
 * T007B:
 *
 * - consume the admitted Component exclusively through the T007A exact Kind
 *   implementation binding: the exact `kaicreator.workflow@1.0.0` KindRef,
 *   resolved from the sealed Assembly's generic KindImplementation bindings,
 *   with semantic material dispatched through the sealed validator handle —
 *   never a raw caller validator, never another Kind or version;
 * - translate the validated closed-world semantic material into the existing
 *   compiler/runtime representation PRIVATELY: an engine-neutral
 *   `DomainWorkflowDefinition` (the existing workflow contract) is built from
 *   the semantic body and handed to the existing internal XState boundary
 *   adapter, which remains the single translation seam to the one shipped
 *   XState engine. No parallel v0.7 runtime engine is instantiated here;
 * - keep every XState/compiler-specific object as an adapter/runtime handle:
 *   the compiled artifact's identity material is plain frozen JSON-serializable
 *   data (exact ComponentId, DefinitionGraphDigest, assemblyDigest, exact
 *   KindImplementation pin, v0.7 Component semantic digest) and the engine
 *   machine lives only in a module-private registry keyed by the artifact —
 *   engine types and handles never become semantic/Assembly digest material,
 *   and no exported declaration of this module names an engine type;
 * - bind the compilation result to the exact DefinitionGraphDigest plus the
 *   assembly/KindImplementation currentness, and fail stale artifacts BEFORE
 *   any authoritative execution: run re-admits through the Assembly-bound
 *   path (authoritative graph-digest recomputation included) and compares the
 *   fresh evidence and semantic digest against the artifact identity;
 * - fail typed and closed on any compiler failure, with no fallback to
 *   unvalidated Raw/legacy semantics — engine translation/machine-creation
 *   errors are wrapped, never guessed around;
 * - keep engine replacement an implementation/Assembly concern: any sealed
 *   Assembly binding the exact Workflow Kind (a different exact
 *   implementation pin, minted through the T007A factory) compiles and runs
 *   through this same bridge with zero Microkernel edits.
 *
 * Engine-side policy for the T007A review P2-2 findings (routed to T007B by
 * issuecomment-5989873345), decided per EXISTING engine semantics without
 * widening the T007A validator:
 *
 * - unreferenced ("dead") states are accepted as inert states — the existing
 *   boundary maps a state without transitions to a state without `on`;
 * - duplicate (event, from) transitions are representable only through
 *   explicit route identity: every compiled route carries the existing
 *   engine-neutral route-selection shape (sourceStateId, routeClass 'event',
 *   routeIndex, eventType) with the routeIndex assigned canonically by
 *   transitionId order within each (from, event) group. Execution either
 *   names the exact route identity or — for more than one eligible route —
 *   fails typed/closed: never first-declared, never array/object/insertion/
 *   lexical/first-registered authority, never XState-incidental order;
 * - self-transitions are ordinary engine self-transitions;
 * - representation limits of the existing engine fail closed at compile:
 *   eventless transitions have no trigger in the existing trigger model, and
 *   events colliding with the engine-reserved internal event namespace
 *   (`@@domain-harness/`) or unsafe record keys (`__proto__`, `prototype`,
 *   `constructor`) are unusable by the existing boundary.
 */
import { createActor, createMachine, type AnyStateMachine } from 'xstate';

import type { ComponentEnvelope, ComponentId } from '../contracts/component.js';
import { computeComponentSemanticDigest } from '../contracts/component-digest.js';
import type { DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../contracts/identity.js';
import type { JsonObject } from '../contracts/json.js';
import { describeRecordSafetyIssue, safeRecordSnapshot } from '../contracts/record-safety.js';
import {
  admitComponentWithAssembly,
  type KindImplementationPin,
  type SealedKindImplementationBinding,
  type SealedRuntimeAssembly,
} from '../contracts/runtime-assembly.js';
import type {
  DomainWorkflowDefinition,
  DomainWorkflowTransition,
} from '../workflow/contract.js';
import {
  adaptDomainWorkflowToXState,
  createDomainXStateEvent,
  type XStateMachineBoundaryConfig,
} from '../workflow/internal/xstate-adapter.js';
import { WORKFLOW_KIND_REF } from './workflow-kind.js';

/** Fail-closed Workflow runtime bridge failure taxonomy (#620, #649). */
export type WorkflowBridgeErrorCode =
  | 'WORKFLOW_BRIDGE_KIND_MISMATCH'
  | 'WORKFLOW_KIND_IMPLEMENTATION_NOT_BOUND'
  | 'WORKFLOW_EVENTLESS_TRANSITION_UNSUPPORTED'
  | 'WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE'
  | 'WORKFLOW_EVENT_ROUTE_AMBIGUOUS'
  | 'WORKFLOW_ROUTE_SELECTION_INVALID'
  | 'WORKFLOW_COMPILATION_FAILED'
  | 'WORKFLOW_ENGINE_STATE_NOT_REPRESENTABLE'
  | 'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT'
  | 'STALE_COMPILED_WORKFLOW_ARTIFACT';

/** The failure taxonomy discriminator: each code maps to exactly one class. */
export type WorkflowBridgeFailureClass = 'KIND' | 'POLICY' | 'ENGINE' | 'TRUST' | 'STALE';

const FAILURE_CLASS_BY_CODE: Record<WorkflowBridgeErrorCode, WorkflowBridgeFailureClass> = {
  WORKFLOW_BRIDGE_KIND_MISMATCH: 'KIND',
  WORKFLOW_KIND_IMPLEMENTATION_NOT_BOUND: 'KIND',
  WORKFLOW_EVENTLESS_TRANSITION_UNSUPPORTED: 'POLICY',
  WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE: 'POLICY',
  WORKFLOW_EVENT_ROUTE_AMBIGUOUS: 'POLICY',
  WORKFLOW_ROUTE_SELECTION_INVALID: 'POLICY',
  WORKFLOW_COMPILATION_FAILED: 'ENGINE',
  WORKFLOW_ENGINE_STATE_NOT_REPRESENTABLE: 'ENGINE',
  UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT: 'TRUST',
  STALE_COMPILED_WORKFLOW_ARTIFACT: 'STALE',
};

export class WorkflowBridgeError extends Error {
  readonly code: WorkflowBridgeErrorCode;
  readonly failureClass: WorkflowBridgeFailureClass;

  constructor(code: WorkflowBridgeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WorkflowBridgeError';
    this.code = code;
    this.failureClass = FAILURE_CLASS_BY_CODE[code];
  }
}

function fail(code: WorkflowBridgeErrorCode, message: string, options?: { cause?: unknown }): never {
  throw new WorkflowBridgeError(code, message, options);
}

// ---------------------------------------------------------------------------
// Compiled artifact identity (plain, frozen, JSON-serializable — no handles)
// ---------------------------------------------------------------------------

/**
 * The complete binding identity of one compiled Workflow artifact. This is
 * the whole digest material of the artifact: exactly what the compile-time
 * Assembly-bound admission evidence bound, plus the v0.7 Component semantic
 * digest of the compiled body. No function, handle, engine object or runtime
 * identity is representable here.
 */
export interface CompiledWorkflowArtifactIdentity {
  /** Exact admitted Component identity. */
  readonly componentId: ComponentId;
  /** v0.7 Component semantic digest of the exact compiled semantic body. */
  readonly componentSemanticDigest: ContentDigest;
  /** Exact Definition graph digest the Assembly is bound to. */
  readonly definitionGraphDigest: ContentDigest;
  /** Exact sealed Assembly digest the compilation is bound to. */
  readonly assemblyDigest: ContentDigest;
  /** Exact KindImplementation pin the compilation is bound to. */
  readonly kindImplementation: KindImplementationPin;
}

/**
 * Explicit route identity of one compiled Workflow transition, in the
 * existing engine-neutral route-selection shape (sourceStateId, route class,
 * routeIndex, event identity — the compiled control machine's RouteSelection
 * vocabulary): bridge routes are always of the event route class.
 */
export interface CompiledWorkflowRoute {
  readonly transitionId: string;
  readonly sourceStateId: string;
  readonly routeClass: 'event';
  readonly routeIndex: number;
  readonly eventType: string;
}

/**
 * A compiled Workflow artifact: plain frozen data only. The identity is the
 * whole digest material of the artifact; the canonical explicit route table
 * (below) is plain frozen route-identity data. The engine machine handle is
 * held in a module-private registry keyed by this object (see COMPILED_HANDLES
 * below), so engine objects can never leak into serializable material, and a
 * caller-constructed look-alike is not an artifact (see COMPILED_MINTS).
 */
export interface CompiledWorkflowArtifact {
  readonly identity: CompiledWorkflowArtifactIdentity;
  /**
   * Canonical explicit route identity of every compiled transition — the
   * semantic-transition -> compiled-route mapping. routeIndex is assigned by
   * transitionId order within each (sourceStateId, eventType) group and rows
   * are sorted by (sourceStateId, eventType, routeIndex), so the table is
   * invariant under semantic-transition declaration permutation.
   */
  readonly routes: readonly CompiledWorkflowRoute[];
}

/**
 * Explicit route selection supplied with one bridge event, in the existing
 * engine-neutral route-selection shape: the event type is the route's event
 * identity and bridge routes are always of the event route class, so the
 * selection names the source state and the canonical routeIndex.
 */
export interface WorkflowBridgeRouteSelection {
  readonly sourceStateId: string;
  readonly routeIndex: number;
}

/** One caller-neutral domain event applied to a running compiled Workflow. */
export interface WorkflowBridgeEvent {
  readonly type: string;
  readonly payload?: JsonObject;
  /**
   * Explicit route identity. Required whenever the current state carries more
   * than one eligible route for the event type — an event-only send among
   * duplicates fails typed/closed and never picks a declaration/array
   * position. Optional for single-route events and validated against the
   * compiled canonical route table whenever present.
   */
  readonly route?: WorkflowBridgeRouteSelection;
}

/** Compile input: the live Component, its sealed Assembly and currentness. */
export interface CompileWorkflowInput {
  /** The Workflow Semantic Component envelope to compile. */
  readonly component: ComponentEnvelope;
  /** The sealed Assembly binding the exact Workflow Kind implementation. */
  readonly sealedAssembly: SealedRuntimeAssembly;
  /** The current Definition graph (digest recomputed authoritatively). */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Injected Sha256 port; the adapter stays host-portable. */
  readonly sha256: Sha256Port;
}

/** Run input: the minted artifact plus the live world it is checked against. */
export interface RunCompiledWorkflowInput {
  /** The compiled artifact minted by compileWorkflowComponent. */
  readonly artifact: CompiledWorkflowArtifact;
  /** The Workflow Semantic Component envelope to execute against. */
  readonly component: ComponentEnvelope;
  /** The sealed Assembly expected to still bind the compiled pin. */
  readonly sealedAssembly: SealedRuntimeAssembly;
  /** The current Definition graph (digest recomputed authoritatively). */
  readonly currentDefinitionGraph: DefinitionGraphEnvelope;
  /** Injected Sha256 port; the adapter stays host-portable. */
  readonly sha256: Sha256Port;
  /** Caller-neutral domain events applied in order to a fresh actor. */
  readonly events: readonly WorkflowBridgeEvent[];
}

/** Authoritative run observation: the exact engine state id after the events. */
export interface WorkflowRunResult {
  readonly stateId: string;
}

// ---------------------------------------------------------------------------
// Module-private mint registry and engine-handle registry
// ---------------------------------------------------------------------------

interface CompiledWorkflowHandle {
  readonly machine: AnyStateMachine;
  /** Explicit routes grouped by `sourceStateId\0eventType`, canonical order. */
  readonly routesBySourceEvent: ReadonlyMap<string, readonly CompiledWorkflowRoute[]>;
}

/**
 * Module-private minting registry, symmetric to the T002B sealed-Assembly
 * seam: only compileWorkflowComponent can mint a member, so only a genuinely
 * compiled artifact can ever execute. Membership is neither inheritable nor
 * reproducible from the artifact's public serializable identity.
 */
const COMPILED_MINTS = new WeakSet<object>();

/** Engine handles keyed by the minted artifact; never exposed, never digested. */
const COMPILED_HANDLES = new WeakMap<CompiledWorkflowArtifact, CompiledWorkflowHandle>();

/**
 * Route-selection marks: for the one send they belong to, the bridge-minted
 * engine event is marked with the caller-validated explicit routeIndex.
 * Guards of duplicate (from, event) route candidates pass only for exactly
 * the marked route, so the engine's candidate-array order can never choose —
 * no first-wins by construction. Marks live on the per-send event object
 * (WeakMap) and never touch any identity or digest material.
 */
const ROUTE_SELECTION_MARKS = new WeakMap<object, number>();

/** Route group key of one (source state, event type) pair. */
function routeGroupKey(sourceStateId: string, eventType: string): string {
  return `${sourceStateId}\u0000${eventType}`;
}

// ---------------------------------------------------------------------------
// Exact Kind binding resolution (descriptor-safe, no getter execution)
// ---------------------------------------------------------------------------

/**
 * Descriptor-safe view of the caller's component restricted to the exact
 * Workflow Kind: accessor/symbol-backed material is rejected by the shared
 * record-safety primitive before any authority use, and anything that is not
 * exactly the Workflow semantic Kind fails closed as a KIND-class bridge
 * error — this bridge never serves another Kind or version.
 */
function requireExactWorkflowComponent(component: ComponentEnvelope): void {
  const view = safeRecordSnapshot(component, 'workflow bridge component');
  if (!view.ok) {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      `workflow bridge component ${describeRecordSafetyIssue(view.issue)}`,
    );
  }
  if (view.snapshot.family !== 'semantic') {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      'the Workflow runtime bridge serves exactly the semantic Workflow Kind; component envelope.family must be \'semantic\'',
    );
  }
  const kind = view.snapshot.kind;
  if (
    typeof kind !== 'object' ||
    kind === null ||
    (kind as Record<string, unknown>).kindId !== WORKFLOW_KIND_REF.kindId ||
    (kind as Record<string, unknown>).version !== WORKFLOW_KIND_REF.version
  ) {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      `the Workflow runtime bridge serves exactly ${WORKFLOW_KIND_REF.kindId}@${WORKFLOW_KIND_REF.version}; the supplied component carries a different Kind (exact Kind match only)`,
    );
  }
}

/**
 * Resolve the exact Workflow KindImplementation binding from the sealed
 * Assembly's generic bindings. The Assembly's own anti-forgery mint registry
 * was already enforced by admitComponentWithAssembly; this lookup only fixes
 * WHICH binding this bridge consumes — never first-wins, never another Kind.
 */
function requireWorkflowBinding(
  sealedAssembly: SealedRuntimeAssembly,
): SealedKindImplementationBinding {
  const binding = sealedAssembly.bindings.find(
    (candidate) =>
      candidate.pin.kind.kindId === WORKFLOW_KIND_REF.kindId &&
      candidate.pin.kind.version === WORKFLOW_KIND_REF.version,
  );
  if (binding === undefined) {
    fail(
      'WORKFLOW_KIND_IMPLEMENTATION_NOT_BOUND',
      `the sealed Assembly does not bind the exact Workflow Kind ${WORKFLOW_KIND_REF.kindId}@${WORKFLOW_KIND_REF.version}; compile through an Assembly sealed over the T007A Workflow Kind implementation`,
    );
  }
  return binding;
}

// ---------------------------------------------------------------------------
// Private translation: closed-world semantic body -> engine-neutral definition
// ---------------------------------------------------------------------------

/** Engine-reserved internal event namespace of the existing boundary. */
const RESERVED_INTERNAL_EVENT_PREFIX = '@@domain-harness/';

/** Record keys the existing engine boundary rejects as event/state keys. */
const UNSAFE_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Closed-world view of one validated Workflow semantic body. The T007A
 * sealed validator has already established this exact shape; the snapshots
 * here are descriptor-safe reads for translation only, never re-validation.
 */
interface WorkflowSemanticBodyView {
  readonly initial: string;
  readonly states: readonly string[];
  readonly transitions: readonly {
    readonly transitionId: string;
    readonly from: string;
    readonly to: string;
    readonly event?: string;
  }[];
}

/** Mutable build alias for one semantic transition during translation. */
interface WorkflowTransitionBuild {
  transitionId: string;
  from: string;
  to: string;
  event?: string;
}

/** Read the validated semantic body as a descriptor-safe translation view. */
function readSemanticBody(component: ComponentEnvelope): WorkflowSemanticBodyView {
  const envelopeView = safeRecordSnapshot(component, 'workflow bridge component');
  if (!envelopeView.ok) {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      `workflow bridge component ${describeRecordSafetyIssue(envelopeView.issue)}`,
    );
  }
  const body = safeRecordSnapshot(envelopeView.snapshot.semanticBody, 'workflow semantic body');
  if (!body.ok) {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      `workflow semantic body ${describeRecordSafetyIssue(body.issue)}`,
    );
  }
  const snapshot = body.snapshot;

  const initial = snapshot.initial;
  if (typeof initial !== 'string') {
    fail('WORKFLOW_COMPILATION_FAILED', 'workflow semantic body.initial is not representable');
  }

  const rawStates = snapshot.states;
  if (!Array.isArray(rawStates)) {
    fail('WORKFLOW_COMPILATION_FAILED', 'workflow semantic body.states is not representable');
  }
  const states: string[] = [];
  for (const [index, entry] of rawStates.entries()) {
    const stateId =
      typeof entry === 'object' && entry !== null
        ? (entry as Record<string, unknown>).stateId
        : undefined;
    if (typeof stateId !== 'string') {
      fail(
        'WORKFLOW_COMPILATION_FAILED',
        `workflow semantic body.states[${index}].stateId is not representable`,
      );
    }
    states.push(stateId);
  }

  const rawTransitions = snapshot.transitions;
  if (!Array.isArray(rawTransitions)) {
    fail('WORKFLOW_COMPILATION_FAILED', 'workflow semantic body.transitions is not representable');
  }
  const transitions: WorkflowTransitionBuild[] = [];
  for (const [index, entry] of rawTransitions.entries()) {
    const transition =
      typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : undefined;
    if (transition === undefined) {
      fail(
        'WORKFLOW_COMPILATION_FAILED',
        `workflow semantic body.transitions[${index}] is not representable`,
      );
    }
    const transitionId = transition.transitionId;
    const from = transition.from;
    const to = transition.to;
    if (
      typeof transitionId !== 'string' ||
      typeof from !== 'string' ||
      typeof to !== 'string'
    ) {
      fail(
        'WORKFLOW_COMPILATION_FAILED',
        `workflow semantic body.transitions[${index}] carries non-representable identity material`,
      );
    }
    const event = transition.event;
    transitions.push({
      transitionId,
      from,
      to,
      ...(typeof event === 'string' ? { event } : {}),
    });
  }

  return { initial, states, transitions };
}

/**
 * Engine-usability policy for one declared event identity, decided per the
 * EXISTING engine boundary rules (never widening the T007A validator): the
 * reserved internal event namespace and the unsafe record keys are unusable
 * by the shipped boundary, so the compile fails closed instead of producing
 * an artifact whose transitions could never fire.
 */
function requireEngineCompatibleEvent(event: string, transitionId: string): void {
  if (event.startsWith(RESERVED_INTERNAL_EVENT_PREFIX)) {
    fail(
      'WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE',
      `transition "${transitionId}" declares event "${event}" in the engine-reserved internal event namespace; such events are unusable by the existing runtime and fail closed (no fallback)`,
    );
  }
  if (UNSAFE_RECORD_KEYS.has(event)) {
    fail(
      'WORKFLOW_EVENT_NOT_ENGINE_COMPATIBLE',
      `transition "${transitionId}" declares event "${event}" which the existing engine boundary rejects as an unsafe record key; compilation fails closed (no fallback)`,
    );
  }
}

/**
 * Explicit-route plan of one compiled body: the canonical route table (rows
 * sorted by (sourceStateId, eventType, routeIndex)) plus the same routes
 * grouped by source state and event type for run-time selection checks.
 */
interface CompiledRoutePlan {
  readonly table: readonly CompiledWorkflowRoute[];
  readonly bySourceEvent: ReadonlyMap<string, readonly CompiledWorkflowRoute[]>;
}

/** Private translation result: the engine-neutral definition plus its routes. */
interface CompiledTranslation {
  readonly definition: DomainWorkflowDefinition;
  readonly routes: CompiledRoutePlan;
}

/** Code-unit string order — deterministic, locale-independent, stable. */
function byStringIdentity(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Translate the validated closed-world semantic material into the existing
 * engine-neutral Domain Workflow definition, privately, together with the
 * canonical explicit route plan. Transitions are grouped under their declared
 * source state; duplicate (event, from) transitions keep full semantic
 * representability through explicit route identity: each member of a
 * (sourceStateId, eventType) group receives the routeIndex of its position in
 * the group's transitionId order (code-unit order — deterministic and
 * invariant under declaration permutation; single-route groups are routeIndex
 * 0). The engine's candidate-array order is never selection authority:
 * ambiguous event-only execution fails typed/closed at run time (see
 * runCompiledWorkflow) and explicit identities are bound to the engine guards
 * at compile time (see bindExplicitRouteSelectionGuards). Dead states map to
 * states without transitions, exactly as the shipped engine already behaves.
 * Eventless transitions have no trigger in the existing trigger model and
 * fail typed/closed here.
 */
function translateToDomainDefinition(
  componentId: ComponentId,
  body: WorkflowSemanticBodyView,
): CompiledTranslation {
  const transitionsBySource = new Map<string, DomainWorkflowTransition[]>();
  const declaredBySourceEvent = new Map<
    string,
    readonly { transitionId: string; from: string; event: string }[]
  >();

  for (const transition of body.transitions) {
    if (transition.event === undefined) {
      fail(
        'WORKFLOW_EVENTLESS_TRANSITION_UNSUPPORTED',
        `transition "${transition.transitionId}" declares no event; the existing engine trigger model has no eventless/always trigger, so compilation fails closed (no fallback to Raw/legacy semantics)`,
      );
    }
    requireEngineCompatibleEvent(transition.event, transition.transitionId);
    const list = transitionsBySource.get(transition.from) ?? [];
    list.push({
      transitionKey: transition.transitionId,
      trigger: { kind: 'event', eventType: transition.event },
      targetState: transition.to,
    });
    transitionsBySource.set(transition.from, list);

    const groupKey = routeGroupKey(transition.from, transition.event);
    const group = declaredBySourceEvent.get(groupKey) ?? [];
    declaredBySourceEvent.set(groupKey, [
      ...group,
      { transitionId: transition.transitionId, from: transition.from, event: transition.event },
    ]);
  }

  // Canonical explicit route identity per (sourceStateId, eventType) group:
  // routeIndex by transitionId order, never by declaration position.
  const bySourceEvent = new Map<string, CompiledWorkflowRoute[]>();
  const table: CompiledWorkflowRoute[] = [];
  for (const [groupKey, declared] of declaredBySourceEvent) {
    const canonical = [...declared].sort((left, right) =>
      byStringIdentity(left.transitionId, right.transitionId),
    );
    const rows: CompiledWorkflowRoute[] = canonical.map((member, routeIndex) => ({
      transitionId: member.transitionId,
      sourceStateId: member.from,
      routeClass: 'event',
      routeIndex,
      eventType: member.event,
    }));
    bySourceEvent.set(groupKey, rows);
    table.push(...rows);
  }
  // Row order itself is canonical: (sourceStateId, eventType, routeIndex).
  table.sort(
    (left, right) =>
      left.sourceStateId !== right.sourceStateId
        ? byStringIdentity(left.sourceStateId, right.sourceStateId)
        : left.eventType !== right.eventType
          ? byStringIdentity(left.eventType, right.eventType)
          : left.routeIndex - right.routeIndex,
  );

  const states: DomainWorkflowDefinition['states'] = body.states.map((stateId) => {
    const transitions = transitionsBySource.get(stateId);
    return transitions === undefined ? { stateKey: stateId } : { stateKey: stateId, transitions };
  });

  return {
    definition: {
      workflowKey: componentId,
      initialState: body.initial,
      initialContext: {},
      states,
    },
    routes: { table, bySourceEvent },
  };
}

// ---------------------------------------------------------------------------
// Explicit route identity binding (compile-time guard seam)
// ---------------------------------------------------------------------------

/** Module-private structural views of the boundary's (unexported) configs. */
type BoundaryStateConfig = XStateMachineBoundaryConfig['states'][string];
type BoundaryTransitionConfig = NonNullable<BoundaryStateConfig['on']>[string][number];

/**
 * Bind explicit route identities to the engine's compiled transition guards:
 * for a (source state, event type) group with more than one eligible route,
 * every compiled candidate passes only for exactly the explicitly marked
 * route (ROUTE_SELECTION_MARKS), so the engine's candidate-array order can
 * never decide — no first-wins, no incidental-order authority. An event-only
 * send among duplicates never reaches the engine at all (run-time typed
 * failure first); unmarked candidates passing nothing keeps that invariant
 * true even under a raw engine send. Single-route groups keep the ordinary
 * existing-engine guards — their behavior is unchanged.
 */
function bindExplicitRouteSelectionGuards(
  config: XStateMachineBoundaryConfig,
  definition: DomainWorkflowDefinition,
): void {
  for (const state of definition.states) {
    const configState = config.states[state.stateKey];
    if (configState?.on === undefined) {
      continue;
    }
    const declaredByEvent = new Map<string, DomainWorkflowTransition[]>();
    for (const transition of state.transitions ?? []) {
      if (transition.trigger.kind !== 'event') {
        fail(
          'WORKFLOW_COMPILATION_FAILED',
          `transition "${transition.transitionKey}" carries a non-event trigger; the closed-world Workflow translation only produces event triggers`,
        );
      }
      const group = declaredByEvent.get(transition.trigger.eventType) ?? [];
      group.push(transition);
      declaredByEvent.set(transition.trigger.eventType, group);
    }

    for (const [eventType, declared] of declaredByEvent) {
      if (declared.length <= 1) {
        continue;
      }
      const candidates = configState.on[eventType];
      if (!Array.isArray(candidates) || candidates.length !== declared.length) {
        fail(
          'WORKFLOW_COMPILATION_FAILED',
          `the engine boundary translation drifted for state "${state.stateKey}" event "${eventType}": ${declared.length} semantic routes vs ${candidates === undefined ? 'no' : String(candidates.length)} compiled candidates`,
        );
      }
      const canonicalIndex = new Map<DomainWorkflowTransition, number>();
      [...declared]
        .sort((left, right) => byStringIdentity(left.transitionKey, right.transitionKey))
        .forEach((transition, routeIndex) => canonicalIndex.set(transition, routeIndex));
      // The boundary's transition configs are immutable; duplicate-route
      // candidates are re-minted with identity-bound guards, so the engine's
      // candidate-array order is never selection authority.
      const wrapped: BoundaryTransitionConfig[] = candidates.map(
        (candidate, declaredIndex) => {
          const declaredMember: DomainWorkflowTransition | undefined = declared[declaredIndex];
          const routeIndex =
            declaredMember === undefined ? undefined : canonicalIndex.get(declaredMember);
          if (declaredMember === undefined || routeIndex === undefined) {
            fail(
              'WORKFLOW_COMPILATION_FAILED',
              `the engine boundary candidate order drifted for state "${state.stateKey}" event "${eventType}"`,
            );
          }
          const originalGuard = candidate.guard;
          return {
            target: candidate.target,
            guard: (args: Parameters<typeof originalGuard>[0]) =>
              originalGuard(args) && ROUTE_SELECTION_MARKS.get(args.event) === routeIndex,
          };
        },
      );
      configState.on[eventType] = wrapped;
    }
  }
}

// ---------------------------------------------------------------------------
// Staleness comparison
// ---------------------------------------------------------------------------

/** Exact field-wise comparison of two KindImplementation pins. */
function pinsEqual(left: KindImplementationPin, right: KindImplementationPin): boolean {
  return (
    left.kind.kindId === right.kind.kindId &&
    left.kind.version === right.kind.version &&
    left.implementation.implementationId === right.implementation.implementationId &&
    left.implementation.implementationVersion === right.implementation.implementationVersion &&
    left.implementation.implementationDigest === right.implementation.implementationDigest
  );
}

// ---------------------------------------------------------------------------
// Public seam: compile, then run against the live world
// ---------------------------------------------------------------------------

/**
 * Compile one admitted Workflow Semantic Component into a bound compiled
 * artifact, privately translated into the existing compiler/runtime
 * representation. The Component is consumed exclusively through the T007A
 * exact Kind implementation binding of the supplied sealed Assembly:
 *
 * - the exact Kind is fixed (`kaicreator.workflow@1.0.0`) and the sealed
 *   Assembly must bind it (KIND-class failures otherwise);
 * - the semantic material is dispatched through the sealed validator handle
 *   (`binding.validateComponent`) and admitted through the one Assembly-bound
 *   admission path, which authoritatively recomputes the Definition graph
 *   digest — stale graphs and forged Assemblies fail closed with the typed
 *   kernel errors, unchanged;
 * - the translation/engine-machine creation runs inside a typed wrapper: any
 *   engine failure is `WORKFLOW_COMPILATION_FAILED`, never a fallback;
 * - the returned artifact is plain frozen identity data; the engine machine
 *   handle is registered in a module-private registry.
 *
 * Replacing the Workflow engine means sealing a new Assembly over a different
 * exact implementation pin (T007A factory) — this same bridge compiles and
 * runs against it with zero Microkernel edits.
 */
export async function compileWorkflowComponent(
  input: CompileWorkflowInput,
): Promise<CompiledWorkflowArtifact> {
  const inputView = safeRecordSnapshot(input, 'workflow bridge compile input');
  if (!inputView.ok) {
    fail(
      'WORKFLOW_BRIDGE_KIND_MISMATCH',
      `workflow bridge compile input ${describeRecordSafetyIssue(inputView.issue)}`,
    );
  }
  for (const required of ['component', 'sealedAssembly', 'currentDefinitionGraph', 'sha256'] as const) {
    if (!(required in inputView.snapshot)) {
      fail('WORKFLOW_BRIDGE_KIND_MISMATCH', `workflow bridge compile input.${required} is required`);
    }
  }

  const component = input.component;
  const sealedAssembly = input.sealedAssembly;
  requireExactWorkflowComponent(component);
  const binding = requireWorkflowBinding(sealedAssembly);

  // Consume the admitted material through the T007A exact Kind implementation
  // binding: the sealed validator handle is the only validation authority.
  binding.validateComponent(component);

  // Assembly-bound admission: anti-forgery mint check + authoritative
  // Definition graph digest recomputation happen inside; their typed errors
  // (RuntimeAssemblyError family) propagate unchanged and fail closed.
  const evidence = await admitComponentWithAssembly(component, sealedAssembly, {
    currentDefinitionGraph: input.currentDefinitionGraph,
    sha256: input.sha256,
  });

  const componentSemanticDigest = await computeComponentSemanticDigest(component, input.sha256);

  const body = readSemanticBody(component);
  const translation = translateToDomainDefinition(evidence.componentId, body);

  let config: XStateMachineBoundaryConfig;
  try {
    config = adaptDomainWorkflowToXState(translation.definition);
  } catch (error) {
    fail(
      'WORKFLOW_COMPILATION_FAILED',
      `the existing workflow runtime could not compile the admitted semantic material: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  bindExplicitRouteSelectionGuards(config, translation.definition);

  let machine: AnyStateMachine;
  try {
    machine = createMachine(config as unknown as Parameters<typeof createMachine>[0]);
  } catch (error) {
    fail(
      'WORKFLOW_COMPILATION_FAILED',
      `the existing workflow runtime could not compile the admitted semantic material: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const artifact: CompiledWorkflowArtifact = Object.freeze({
    identity: Object.freeze({
      componentId: evidence.componentId,
      componentSemanticDigest,
      definitionGraphDigest: evidence.definitionGraphDigest,
      assemblyDigest: evidence.assemblyDigest,
      kindImplementation: evidence.admittedKindImplementation,
    }),
    routes: Object.freeze(translation.routes.table.map((route) => Object.freeze(route))),
  });
  COMPILED_MINTS.add(artifact);
  COMPILED_HANDLES.set(
    artifact,
    Object.freeze({ machine, routesBySourceEvent: translation.routes.bySourceEvent }),
  );
  return artifact;
}

// ---------------------------------------------------------------------------
// Run-time explicit route resolution (event-only ambiguity fails closed)
// ---------------------------------------------------------------------------

/** Canonical route identities of one group, in deterministic canonical order. */
function describeCanonicalRoutes(group: readonly CompiledWorkflowRoute[]): string {
  return group.map((route) => `${route.transitionId}#${route.routeIndex}`).join(', ');
}

/**
 * Resolve one explicit route identity against the compiled canonical route
 * table for the CURRENT state: exactly one eligible route must match, or the
 * execution fails typed/closed (deterministic — never array-position
 * guessing, never a silently ignored selection).
 */
function requireExplicitRouteResolution(
  routesBySourceEvent: ReadonlyMap<string, readonly CompiledWorkflowRoute[]>,
  currentStateId: string,
  eventType: string,
  route: WorkflowBridgeRouteSelection,
): number {
  const routeView =
    typeof route === 'object' && route !== null
      ? (route as unknown as Record<string, unknown>)
      : undefined;
  const sourceStateId =
    typeof routeView?.sourceStateId === 'string' ? routeView.sourceStateId : undefined;
  const routeIndex = typeof routeView?.routeIndex === 'number' ? routeView.routeIndex : undefined;
  if (sourceStateId === undefined || routeIndex === undefined || !Number.isInteger(routeIndex)) {
    fail(
      'WORKFLOW_ROUTE_SELECTION_INVALID',
      `the explicit route identity for event "${eventType}" is not a valid {sourceStateId, routeIndex} selection (the source state must be the current state and the routeIndex a non-negative integer); refusing to guess a route`,
    );
  }
  if (sourceStateId !== currentStateId) {
    fail(
      'WORKFLOW_ROUTE_SELECTION_INVALID',
      `the explicit route identity names source state "${sourceStateId}" but the run is at "${currentStateId}"; route identity is bound to the current state`,
    );
  }
  const group = routesBySourceEvent.get(routeGroupKey(sourceStateId, eventType));
  if (group === undefined || routeIndex < 0 || routeIndex >= group.length) {
    fail(
      'WORKFLOW_ROUTE_SELECTION_INVALID',
      `the explicit route identity {sourceStateId: "${sourceStateId}", routeIndex: ${routeIndex}} does not resolve to exactly one eligible route for event "${eventType}" from "${currentStateId}" (canonical routes: ${group === undefined ? 'none' : describeCanonicalRoutes(group)})`,
    );
  }
  return routeIndex;
}

/** Read the actor's current flat state id; non-flat values fail typed. */
function currentFlatStateId(actor: {
  readonly getSnapshot: () => { readonly value: unknown };
}): string {
  const value: unknown = actor.getSnapshot().value;
  if (typeof value !== 'string') {
    fail(
      'WORKFLOW_ENGINE_STATE_NOT_REPRESENTABLE',
      'the existing engine reported a non-flat state value for a closed-world flat Workflow definition',
    );
  }
  return value;
}

/**
 * Execute one minted compiled artifact on the ONE existing runtime, after
 * proving the live world still matches what was compiled. Every check runs
 * BEFORE any transition executes:
 *
 * - the artifact must be a genuine compile-time mint (not a caller-built
 *   look-alike with copied identity material);
 * - the Component must still be exactly the Workflow Kind material;
 * - the Component is re-admitted through the Assembly-bound path — the
 *   authoritative graph-digest recomputation rejects drifted Definition
 *   graphs with the typed kernel error, and a forged/stale sealed Assembly is
 *   rejected by the kernel anti-forgery checks;
 * - the fresh admission evidence (componentId, DefinitionGraphDigest,
 *   assemblyDigest, exact KindImplementation pin) and the caller-supplied
 *   Component's current semantic digest must equal the artifact identity —
 *   any mismatch is `STALE_COMPILED_WORKFLOW_ARTIFACT`;
 * - only then does a fresh actor of the privately held engine machine apply
 *   the caller-neutral domain events in order through the existing engine
 *   event-provenance factory. Duplicate (from, event) route groups never
 *   resolve by declaration or candidate-array order: an event whose current
 *   state carries more than one eligible route must name the explicit route
 *   identity (`{sourceStateId, routeIndex}`) and then executes exactly that
 *   route, independent of any permutation; an event-only send among
 *   duplicates fails typed/closed (`WORKFLOW_EVENT_ROUTE_AMBIGUOUS`) before
 *   any transition executes, and an explicit identity that does not resolve
 *   to exactly one eligible route fails typed/closed
 *   (`WORKFLOW_ROUTE_SELECTION_INVALID`).
 */
export async function runCompiledWorkflow(
  input: RunCompiledWorkflowInput,
): Promise<WorkflowRunResult> {
  const artifact = input.artifact;
  if (typeof artifact !== 'object' || artifact === null || !COMPILED_MINTS.has(artifact)) {
    fail(
      'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT',
      'run requires a CompiledWorkflowArtifact minted by compileWorkflowComponent; a caller-constructed identity is never executable',
    );
  }

  const component = input.component;
  requireExactWorkflowComponent(component);

  const evidence = await admitComponentWithAssembly(component, input.sealedAssembly, {
    currentDefinitionGraph: input.currentDefinitionGraph,
    sha256: input.sha256,
  });

  const identity = artifact.identity;
  const staleReason =
    evidence.componentId !== identity.componentId
      ? `componentId "${evidence.componentId}" does not match the compiled "${identity.componentId}"`
      : evidence.definitionGraphDigest !== identity.definitionGraphDigest
        ? 'the current Definition graph digest does not match the compiled artifact binding'
        : evidence.assemblyDigest !== identity.assemblyDigest
          ? 'the sealed Assembly digest does not match the compiled artifact binding'
          : !pinsEqual(evidence.admittedKindImplementation, identity.kindImplementation)
            ? 'the sealed Assembly now binds a different exact KindImplementation pin'
            : undefined;

  const componentSemanticDigest = await computeComponentSemanticDigest(component, input.sha256);
  const stale =
    staleReason !== undefined
      ? staleReason
      : componentSemanticDigest !== identity.componentSemanticDigest
        ? 'the supplied Component semantic body does not match the compiled artifact binding'
        : undefined;
  if (stale !== undefined) {
    fail(
      'STALE_COMPILED_WORKFLOW_ARTIFACT',
      `stale compiled Workflow artifact rejected before execution: ${stale}`,
    );
  }

  const handle = COMPILED_HANDLES.get(artifact);
  if (handle === undefined) {
    // Invariant: every mint has a handle. Defensive, never reachable for
    // minted artifacts; fails closed rather than executing uncompiled input.
    fail(
      'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT',
      'the compiled artifact carries no engine handle; refusing to execute',
    );
  }

  const actor = createActor(handle.machine).start();
  try {
    for (const event of input.events) {
      const currentStateId = currentFlatStateId(actor);
      let selectedRouteIndex: number | undefined;
      if (event.route !== undefined) {
        selectedRouteIndex = requireExplicitRouteResolution(
          handle.routesBySourceEvent,
          currentStateId,
          event.type,
          event.route,
        );
      } else {
        const group = handle.routesBySourceEvent.get(routeGroupKey(currentStateId, event.type));
        if (group !== undefined && group.length > 1) {
          fail(
            'WORKFLOW_EVENT_ROUTE_AMBIGUOUS',
            `event-only selection is ambiguous: source state "${currentStateId}" carries ${group.length} eligible routes for event "${event.type}" (canonical route identity: ${describeCanonicalRoutes(group)}); supply the explicit route identity {sourceStateId, routeIndex} — the bridge never resolves duplicate routes by declaration or candidate-array order`,
          );
        }
      }
      // Engine event provenance is minted here, by the existing boundary
      // factory — the bridge never forwards raw caller event objects.
      const mintedEvent = createDomainXStateEvent({
        type: event.type,
        ...(event.payload === undefined ? {} : { payload: event.payload }),
      });
      if (selectedRouteIndex !== undefined) {
        ROUTE_SELECTION_MARKS.set(mintedEvent, selectedRouteIndex);
      }
      actor.send(mintedEvent);
    }
    return Object.freeze({ stateId: currentFlatStateId(actor) });
  } finally {
    actor.stop();
  }
}
