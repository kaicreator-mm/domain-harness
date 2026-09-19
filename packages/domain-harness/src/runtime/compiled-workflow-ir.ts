import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  SUPPORTED_COMPILED_INVOKE_KINDS_V2,
  type SupportedCompiledInvokeKind,
} from '../v2/contracts/package.js';
import type { CompiledSkillDefinition } from './journaled-skill-runner.js';

/**
 * Authoritative decoded shape of a compiled Workflow definition for
 * `executionEngineMajor` 2 (issue #168). One decoder is shared by package
 * activation (fail-closed rejection of corrupt or unsupported artifacts, per
 * the PRD R4 corrupt-package acceptance criterion) and by the runtime
 * interpreter, so the artifact boundary no longer relies on
 * `as unknown as` casts plus a three-field spot check.
 *
 * Decoding normalizes optional route containers (`done`/`error`/`events`
 * default to empty) and rejects everything the engine cannot execute:
 * unknown or legacy invoke kinds, dangling route targets, non-array effect
 * lists (previously silently skipped), invalid `maxSteps`, and malformed
 * state/route/effect shapes.
 */

export interface CompiledRoute {
  readonly target: string;
  readonly when?: string;
}

export interface CompiledMessageEffect {
  readonly kind: 'domain-message';
  readonly targetExpression: string;
  readonly messageType: string;
  readonly payloadExpression?: string;
  readonly contractVersion?: string;
}

export interface CompiledInvoke {
  readonly kind: SupportedCompiledInvokeKind;
  readonly ref?: string;
  readonly expression?: string;
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly skill?: CompiledSkillDefinition;
}

export interface CompiledState {
  readonly final: boolean;
  readonly invoke?: CompiledInvoke;
  readonly done: readonly CompiledRoute[];
  readonly error: readonly CompiledRoute[];
  readonly events: Readonly<Record<string, { readonly routes: readonly CompiledRoute[] }>>;
  readonly effects?: readonly CompiledMessageEffect[];
}

export interface CompiledWorkflowIRV2 {
  readonly initial: string;
  readonly output?: string;
  readonly states: Readonly<Record<string, CompiledState>>;
  readonly limits?: { readonly maxSteps?: number };
}

export class CompiledWorkflowIrError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CompiledWorkflowIrError';
  }
}

function fail(workflowId: string, path: string, problem: string): never {
  throw new CompiledWorkflowIrError(
    `Compiled workflow "${workflowId}" IR is invalid at ${path}: ${problem}`,
  );
}

function asRecord(workflowId: string, path: string, value: JsonValue): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(workflowId, path, 'expected an object');
  }
  return value;
}

function asNonEmptyString(workflowId: string, path: string, value: JsonValue): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(workflowId, path, 'expected a non-empty string');
  }
  return value;
}

function asOptionalString(workflowId: string, path: string, value: JsonValue | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return asNonEmptyString(workflowId, path, value);
}

function decodeRoutes(
  workflowId: string,
  path: string,
  value: JsonValue | undefined,
  stateIds: ReadonlySet<string>,
): readonly CompiledRoute[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(workflowId, path, 'expected an array of routes');
  }
  return value.map((entry, index) => {
    const routePath = `${path}[${index}]`;
    const route = asRecord(workflowId, routePath, entry);
    const target = asNonEmptyString(workflowId, `${routePath}.target`, route.target as JsonValue);
    if (!stateIds.has(target)) {
      fail(workflowId, `${routePath}.target`, `route targets unknown state "${target}"`);
    }
    const when = asOptionalString(workflowId, `${routePath}.when`, route.when as JsonValue | undefined);
    return when === undefined ? { target } : { target, when };
  });
}

function decodeInvoke(workflowId: string, path: string, value: JsonValue): CompiledInvoke {
  const invoke = asRecord(workflowId, path, value);
  const kind = invoke.kind;
  if (
    typeof kind !== 'string' ||
    !(SUPPORTED_COMPILED_INVOKE_KINDS_V2 as readonly string[]).includes(kind)
  ) {
    fail(
      workflowId,
      `${path}.kind`,
      `invoke kind ${JSON.stringify(kind) ?? 'undefined'} is not executable by executionEngineMajor 2 `
        + `(supported: ${SUPPORTED_COMPILED_INVOKE_KINDS_V2.join(', ')}); legacy script invokes must be `
        + 'translated at build time (T-021) and child workflow invokes modeled as Domain Message effects',
    );
  }
  const decodedKind = kind as SupportedCompiledInvokeKind;
  const input = asOptionalString(workflowId, `${path}.input`, invoke.input as JsonValue | undefined);
  let timeoutMs: number | undefined;
  if (invoke.timeoutMs !== undefined) {
    if (
      typeof invoke.timeoutMs !== 'number' ||
      !Number.isSafeInteger(invoke.timeoutMs) ||
      invoke.timeoutMs <= 0
    ) {
      fail(workflowId, `${path}.timeoutMs`, 'expected a positive safe integer');
    }
    timeoutMs = invoke.timeoutMs;
  }

  if (decodedKind === 'expr') {
    const expression = asNonEmptyString(workflowId, `${path}.expression`, invoke.expression as JsonValue);
    return {
      kind: decodedKind,
      expression,
      ...(input === undefined ? {} : { input }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
  }

  const ref = asNonEmptyString(workflowId, `${path}.ref`, invoke.ref as JsonValue);
  if (decodedKind === 'skill') {
    if (invoke.skill === undefined) {
      fail(workflowId, `${path}.skill`, 'compiled skill invoke must carry its embedded skill definition');
    }
    const skill = asRecord(workflowId, `${path}.skill`, invoke.skill);
    asNonEmptyString(workflowId, `${path}.skill.skillId`, skill.skillId as JsonValue);
    asNonEmptyString(workflowId, `${path}.skill.instructions`, skill.instructions as JsonValue);
    asRecord(workflowId, `${path}.skill.outputSchema`, skill.outputSchema as JsonValue);
    if (!Array.isArray(skill.resources)) {
      fail(workflowId, `${path}.skill.resources`, 'expected an array of skill resources');
    }
    return {
      kind: decodedKind,
      ref,
      // Structural skill fields are validated above; deep identity/schema
      // semantics remain owned by the journaled skill runner.
      skill: skill as unknown as CompiledSkillDefinition,
      ...(input === undefined ? {} : { input }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    };
  }
  return {
    kind: decodedKind,
    ref,
    ...(input === undefined ? {} : { input }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

function decodeEffects(
  workflowId: string,
  path: string,
  value: JsonValue | undefined,
): readonly CompiledMessageEffect[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  // A non-array here was previously skipped silently at execution time, which
  // could vanish a durable Domain Message effect without any error (#168).
  if (!Array.isArray(value)) {
    fail(workflowId, path, 'expected an array of domain-message effects');
  }
  return value.map((entry, index) => {
    const effectPath = `${path}[${index}]`;
    const effect = asRecord(workflowId, effectPath, entry);
    if (effect.kind !== 'domain-message') {
      fail(workflowId, `${effectPath}.kind`, 'only "domain-message" effects are supported');
    }
    const targetExpression = asNonEmptyString(
      workflowId,
      `${effectPath}.targetExpression`,
      effect.targetExpression as JsonValue,
    );
    const messageType = asNonEmptyString(workflowId, `${effectPath}.messageType`, effect.messageType as JsonValue);
    const payloadExpression = asOptionalString(
      workflowId,
      `${effectPath}.payloadExpression`,
      effect.payloadExpression as JsonValue | undefined,
    );
    const contractVersion = asOptionalString(
      workflowId,
      `${effectPath}.contractVersion`,
      effect.contractVersion as JsonValue | undefined,
    );
    return {
      kind: 'domain-message' as const,
      targetExpression,
      messageType,
      ...(payloadExpression === undefined ? {} : { payloadExpression }),
      ...(contractVersion === undefined ? {} : { contractVersion }),
    };
  });
}

export function decodeCompiledWorkflowDefinition(
  workflowId: string,
  definition: unknown,
): CompiledWorkflowIRV2 {
  if (typeof definition !== 'object' || definition === null || Array.isArray(definition)) {
    fail(workflowId, 'definition', 'expected an object');
  }
  const root = definition as JsonObject;
  const initial = asNonEmptyString(workflowId, 'initial', root.initial as JsonValue);
  const statesRecord = asRecord(workflowId, 'states', root.states as JsonValue);
  const stateIds = new Set(Object.keys(statesRecord));
  if (stateIds.size === 0) {
    fail(workflowId, 'states', 'compiled workflow must declare at least one state');
  }
  if (!stateIds.has(initial)) {
    fail(workflowId, 'initial', `initial state "${initial}" is not declared in states`);
  }
  const output = asOptionalString(workflowId, 'output', root.output as JsonValue | undefined);

  const states: Record<string, CompiledState> = {};
  for (const [stateId, stateValue] of Object.entries(statesRecord)) {
    const statePath = `states.${stateId}`;
    const state = asRecord(workflowId, statePath, stateValue);

    let final = false;
    if (state.final !== undefined) {
      if (typeof state.final !== 'boolean') {
        fail(workflowId, `${statePath}.final`, 'expected a boolean');
      }
      final = state.final;
    }

    const eventsRecord =
      state.events === undefined ? undefined : asRecord(workflowId, `${statePath}.events`, state.events);
    const events: Record<string, { readonly routes: readonly CompiledRoute[] }> = {};
    for (const [eventName, eventValue] of Object.entries(eventsRecord ?? {})) {
      const event = asRecord(workflowId, `${statePath}.events.${eventName}`, eventValue);
      events[eventName] = {
        routes: decodeRoutes(workflowId, `${statePath}.events.${eventName}.routes`, event.routes as JsonValue | undefined, stateIds),
      };
    }

    const effects = decodeEffects(workflowId, `${statePath}.effects`, state.effects as JsonValue | undefined);
    states[stateId] = {
      final,
      ...(state.invoke === undefined
        ? {}
        : { invoke: decodeInvoke(workflowId, `${statePath}.invoke`, state.invoke) }),
      done: decodeRoutes(workflowId, `${statePath}.done`, state.done as JsonValue | undefined, stateIds),
      error: decodeRoutes(workflowId, `${statePath}.error`, state.error as JsonValue | undefined, stateIds),
      events,
      ...(effects === undefined ? {} : { effects }),
    };
  }

  if (root.limits !== undefined) {
    const limits = asRecord(workflowId, 'limits', root.limits);
    if (limits.maxSteps !== undefined) {
      // Previously an invalid maxSteps produced NaN comparisons at execution
      // time, killing every message with "exceeded maxSteps" (#168).
      if (
        typeof limits.maxSteps !== 'number' ||
        !Number.isSafeInteger(limits.maxSteps) ||
        limits.maxSteps < 1
      ) {
        fail(workflowId, 'limits.maxSteps', 'expected a positive safe integer');
      }
    }
  }
  const limitsRecord = root.limits as JsonObject | undefined;
  const maxSteps = limitsRecord?.maxSteps as number | undefined;

  return {
    initial,
    ...(output === undefined ? {} : { output }),
    states,
    ...(maxSteps === undefined ? {} : { limits: { maxSteps } }),
  };
}
