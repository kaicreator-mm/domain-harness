import type { JsonObject, JsonValue } from '../contracts/json.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import type { EffectIdentitySeed } from '../execution/journal/effect-identity.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import type { SendDomainMessageEffect } from '../messaging/send-effect/contracts.js';
import type { ToolExecutorPort } from '../v2/contracts/effect.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type {
  CompiledToolDescriptor,
  CompiledWorkflowDescriptor,
  TargetCompiledDomainPackage,
} from '../v2/contracts/package.js';
import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type {
  RuntimeFailure,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
  WorkflowLifecycle,
} from '../v2/contracts/workflow.js';
import {
  JournaledSkillRunner,
  type CompiledSkillDefinition,
} from './journaled-skill-runner.js';

interface CompiledRoute {
  target: string;
  when?: string;
}

interface CompiledMessageEffect {
  kind: 'domain-message';
  targetExpression: string;
  messageType: string;
  payloadExpression?: string;
  contractVersion?: string;
}

interface CompiledInvoke {
  kind: string;
  ref?: string;
  expression?: string;
  input?: string;
  timeoutMs?: number;
  skill?: CompiledSkillDefinition;
}

interface CompiledState {
  final: boolean;
  invoke?: CompiledInvoke;
  done: readonly CompiledRoute[];
  error: readonly CompiledRoute[];
  events: Readonly<Record<string, { routes: readonly CompiledRoute[] }>>;
  effects?: readonly CompiledMessageEffect[];
}

interface CompiledDefinition {
  initial: string;
  output?: string;
  states: Readonly<Record<string, CompiledState>>;
  limits?: { maxSteps?: number };
}

export interface PortableWorkflowState extends JsonObject {
  stateId: string;
  data: JsonValue;
  lastMessage: JsonValue;
  lastResult: JsonValue;
}

export interface CompiledWorkflowRuntimeOptions {
  expression: ExpressionExecutorPort;
  toolRunner: DurableToolRunner;
  toolExecutor: ToolExecutorPort;
  skillRunner?: JournaledSkillRunner;
  messageEffect: JournaledDomainMessageEffect;
  onChildAccepted(target: WorkflowAddress, messageId: string): void;
}

export interface CompiledWorkflowTransition {
  nextState: JsonValue;
  nextLifecycle: WorkflowLifecycle;
  output?: JsonValue;
  recoveryFailure?: RuntimeFailure;
}

export class CompiledWorkflowRuntime {
  constructor(private readonly options: CompiledWorkflowRuntimeOptions) {}

  initialState(workflow: CompiledWorkflowDescriptor, input: JsonValue): JsonValue {
    const definition = parseDefinition(workflow);
    requireState(definition, definition.initial);
    return portableState(definition.initial, input, null, null);
  }

  async processMessage(
    compiledPackage: TargetCompiledDomainPackage,
    workflow: CompiledWorkflowDescriptor,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
  ): Promise<CompiledWorkflowTransition> {
    const definition = parseDefinition(workflow);
    let state = parsePortableState(current.state);
    const sourceState = requireState(definition, state.stateId);
    const event = sourceState.events[stored.message.type];
    if (event === undefined) {
      throw new Error(
        `Workflow ${workflow.workflowId} state ${state.stateId} does not accept message ${stored.message.type}`,
      );
    }

    const logicalTime = stored.ack.acceptedAt;
    const scope = messageScope(current, state, stored.message.payload);
    const route = await this.selectRoute(event.routes, scope, logicalTime);
    if (route === null) {
      throw new Error(
        `Workflow ${workflow.workflowId} message ${stored.message.type} has no matching route from ${state.stateId}`,
      );
    }

    state = portableState(route.target, state.data, stored.message.payload, null);
    return this.settle(
      compiledPackage,
      workflow,
      definition,
      current,
      stored,
      state,
      logicalTime,
    );
  }

  private async settle(
    compiledPackage: TargetCompiledDomainPackage,
    workflow: CompiledWorkflowDescriptor,
    definition: CompiledDefinition,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
    initialState: PortableWorkflowState,
    logicalTime: string,
  ): Promise<CompiledWorkflowTransition> {
    let state = initialState;
    const maxSteps = Math.max(1, definition.limits?.maxSteps ?? 256);

    for (let step = 0; step < maxSteps; step += 1) {
      const stateDefinition = requireState(definition, state.stateId);
      await this.runMessageEffects(
        stateDefinition,
        current,
        stored,
        state,
        logicalTime,
        step,
      );

      if (stateDefinition.final) {
        const output = definition.output === undefined
          ? state.data
          : await this.options.expression.evaluate({
              expression: definition.output,
              input: workflowScope(current, state),
              logicalTime,
            });
        return {
          nextState: state,
          nextLifecycle: 'completed',
          output,
        };
      }

      if (stateDefinition.invoke === undefined) {
        return {
          nextState: state,
          nextLifecycle: 'waiting',
        };
      }

      try {
        const result = await this.invoke(
          compiledPackage,
          stateDefinition.invoke,
          current,
          stored,
          state,
          logicalTime,
          step,
        );
        if (result.recoveryFailure !== undefined) {
          return {
            nextState: state,
            nextLifecycle: 'recovery_required',
            recoveryFailure: result.recoveryFailure,
          };
        }

        state = portableState(state.stateId, state.data, state.lastMessage, result.value);
        const route = await this.selectRoute(
          stateDefinition.done,
          workflowScope(current, state),
          logicalTime,
        );
        if (route === null) {
          return { nextState: state, nextLifecycle: 'waiting' };
        }
        state = portableState(route.target, state.data, state.lastMessage, state.lastResult);
      } catch (error) {
        const errorScope: JsonObject = {
          ...workflowScope(current, state),
          error: error instanceof Error ? error.message : String(error),
        };
        const route = await this.selectRoute(stateDefinition.error, errorScope, logicalTime);
        if (route === null) throw error;
        state = portableState(route.target, state.data, state.lastMessage, null);
      }
    }

    throw new Error(`Workflow ${workflow.workflowId} exceeded maxSteps while processing ${stored.message.messageId}`);
  }

  private async invoke(
    compiledPackage: TargetCompiledDomainPackage,
    invoke: CompiledInvoke,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
    state: PortableWorkflowState,
    logicalTime: string,
    step: number,
  ): Promise<{ value: JsonValue; recoveryFailure?: RuntimeFailure }> {
    const scope = workflowScope(current, state);

    if (invoke.kind === 'expr') {
      if (invoke.expression === undefined || invoke.expression.length === 0) {
        throw new Error(`Expression invoke in ${state.stateId} is missing expression source`);
      }
      return {
        value: await this.options.expression.evaluate({
          expression: invoke.expression,
          input: scope,
          logicalTime,
        }),
      };
    }

    if (invoke.kind === 'skill') {
      if (invoke.ref === undefined || invoke.ref.length === 0) {
        throw new Error(`Skill invoke in ${state.stateId} is missing Skill reference`);
      }
      if (invoke.skill === undefined || invoke.skill.skillId !== invoke.ref) {
        throw new Error(`Compiled Skill '${invoke.ref}' is missing or has mismatched identity`);
      }
      if (this.options.skillRunner === undefined) {
        throw new Error(
          `Skill '${invoke.ref}' requires a provider-neutral AI operation port at Runtime activation`,
        );
      }
      const input = invoke.input === undefined
        ? state.data
        : await this.options.expression.evaluate({
            expression: invoke.input,
            input: scope,
            logicalTime,
          });
      const result = await this.options.skillRunner.run({
        ...effectSeed(current.address, stored.message.messageId, state.stateId, step),
        skill: invoke.skill,
        input,
        ...(invoke.timeoutMs === undefined ? {} : { timeoutMs: invoke.timeoutMs }),
      });
      return { value: result.output };
    }

    if (invoke.kind === 'tool') {
      if (invoke.ref === undefined || invoke.ref.length === 0) {
        throw new Error(`Tool invoke in ${state.stateId} is missing tool reference`);
      }
      const descriptor = compiledPackage.manifest.tools[invoke.ref];
      if (descriptor === undefined) {
        throw new Error(`Compiled package ${compiledPackage.manifest.packageId} has no Tool ${invoke.ref}`);
      }
      const input = invoke.input === undefined
        ? scope
        : await this.options.expression.evaluate({
            expression: invoke.input,
            input: scope,
            logicalTime,
          });
      const seed = effectSeed(current.address, stored.message.messageId, state.stateId, step);
      const result = await this.options.toolRunner.run({
        ...seed,
        descriptor,
        input,
        logicalTime,
        executor: this.options.toolExecutor,
      });
      if (result.status === 'recovery_required') {
        return {
          value: null,
          recoveryFailure: {
            code: 'ambiguous_non_idempotent_effect',
            message: `Non-idempotent effect ${result.effectId} has an ambiguous durable outcome`,
            sourceMessageId: stored.message.messageId,
            effectId: result.effectId,
            details: {
              effectSemantics: descriptor.effect,
              attempt: result.attempt,
            },
          },
        };
      }
      return { value: result.output };
    }

    if (invoke.kind === 'script') {
      throw new Error(
        'Top-level Script invoke is not a v0.2 Runtime primitive; use a target-compiled Script Domain Tool',
      );
    }
    if (invoke.kind === 'workflow') {
      throw new Error(
        'Top-level child Workflow invoke is not a v0.2 Runtime primitive; use a durable Domain Message effect',
      );
    }

    throw new Error(
      `Compiled invoke kind ${invoke.kind} is not executable by the portable v0.2 Runtime assembly`,
    );
  }

  private async runMessageEffects(
    stateDefinition: CompiledState,
    current: WorkflowInstanceSnapshot,
    stored: StoredAcceptedMessage,
    state: PortableWorkflowState,
    logicalTime: string,
    step: number,
  ): Promise<void> {
    const effects = stateDefinition.effects ?? [];
    for (let index = 0; index < effects.length; index += 1) {
      const effect = effects[index]!;
      const scope = workflowScope(current, state);
      const targetValue = await this.options.expression.evaluate({
        expression: effect.targetExpression,
        input: scope,
        logicalTime,
      });
      const target = workflowAddress(targetValue);
      const payload = effect.payloadExpression === undefined
        ? scope
        : await this.options.expression.evaluate({
            expression: effect.payloadExpression,
            input: scope,
            logicalTime,
          });
      const source: EffectIdentitySeed = effectSeed(
        current.address,
        stored.message.messageId,
        `${state.stateId}:message-effect:${index}`,
        step,
      );
      const normalizedEffect: SendDomainMessageEffect = {
        kind: 'domain-message',
        targetExpression: effect.targetExpression,
        messageType: effect.messageType,
        ...(effect.payloadExpression === undefined ? {} : { payloadExpression: effect.payloadExpression }),
        ...(effect.contractVersion === undefined ? {} : { contractVersion: effect.contractVersion }),
      };
      const result = await this.options.messageEffect.run({
        source,
        effect: normalizedEffect,
        resolvedTarget: target,
        payload,
        correlationId: stored.message.correlationId ?? current.correlationId,
      });
      this.options.onChildAccepted(result.ack.target, result.messageId);
    }
  }

  private async selectRoute(
    routes: readonly CompiledRoute[],
    input: JsonValue,
    logicalTime: string,
  ): Promise<CompiledRoute | null> {
    for (const route of routes) {
      if (route.when === undefined) return route;
      const matched = await this.options.expression.evaluate({
        expression: route.when,
        input,
        logicalTime,
      });
      if (matched === true) return route;
      if (matched !== false) {
        throw new Error(`Workflow route condition must return boolean, got ${matched === null ? 'null' : typeof matched}`);
      }
    }
    return null;
  }
}

function parseDefinition(workflow: CompiledWorkflowDescriptor): CompiledDefinition {
  const definition = workflow.definition as unknown as CompiledDefinition;
  if (typeof definition.initial !== 'string' || definition.initial.length === 0 || !definition.states) {
    throw new Error(`Workflow ${workflow.workflowId} contains an invalid compiled definition`);
  }
  return definition;
}

function requireState(definition: CompiledDefinition, stateId: string): CompiledState {
  const state = definition.states[stateId];
  if (state === undefined) throw new Error(`Compiled workflow state ${stateId} does not exist`);
  return state;
}

function portableState(
  stateId: string,
  data: JsonValue,
  lastMessage: JsonValue,
  lastResult: JsonValue,
): PortableWorkflowState {
  return { stateId, data, lastMessage, lastResult };
}

function parsePortableState(value: JsonValue): PortableWorkflowState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Persisted Workflow state is not a portable v0.2 state object');
  }
  const candidate = value as Record<string, JsonValue>;
  if (typeof candidate.stateId !== 'string' || candidate.stateId.length === 0 || !('data' in candidate)) {
    throw new Error('Persisted Workflow state is missing stateId/data');
  }
  return portableState(
    candidate.stateId,
    candidate.data ?? null,
    candidate.lastMessage ?? null,
    candidate.lastResult ?? null,
  );
}

function messageScope(
  current: WorkflowInstanceSnapshot,
  state: PortableWorkflowState,
  payload: JsonValue,
): JsonObject {
  return {
    ...workflowScope(current, state),
    message: payload,
  };
}

function workflowScope(current: WorkflowInstanceSnapshot, state: PortableWorkflowState): JsonObject {
  return {
    state: {
      stateId: state.stateId,
      data: state.data,
      lastMessage: state.lastMessage,
      lastResult: state.lastResult,
    },
    input: state.data,
    result: state.lastResult,
    address: {
      workflowId: current.address.workflowId,
      instanceKey: current.address.instanceKey,
    },
    correlationId: current.correlationId,
    packageId: current.packageId,
    stateRevision: current.stateRevision,
  };
}

function workflowAddress(value: JsonValue): WorkflowAddress {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Domain Message target expression must return a WorkflowAddress object');
  }
  const record = value as Record<string, JsonValue>;
  if (typeof record.workflowId !== 'string' || typeof record.instanceKey !== 'string') {
    throw new Error('Domain Message target expression must return workflowId and instanceKey strings');
  }
  return { workflowId: record.workflowId, instanceKey: record.instanceKey };
}

function effectSeed(
  target: WorkflowAddress,
  sourceMessageId: string,
  workflowStepIdentity: string,
  stepVisit: number,
): EffectIdentitySeed {
  return { target, sourceMessageId, workflowStepIdentity, stepVisit };
}
