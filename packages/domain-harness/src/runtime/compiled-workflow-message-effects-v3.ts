import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { EffectIdentitySeed } from '../execution/journal/effect-identity.js';
import type { SendDomainMessageEffect } from '../messaging/send-effect/contracts.js';
import { SuccessorJournaledDomainMessageEffect } from '../messaging/send-effect/successor-journaled-domain-message-effect.js';
import type { WorkflowSendPermanentRejection } from '../messaging/contracts/workflow-send-acceptance.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type { CompiledRoute } from './compiled-workflow-ir.js';
import type { CompiledStateV3 } from './compiled-workflow-ir-v3.js';
import type { PortableWorkflowState } from './compiled-workflow-runtime.js';

export interface CompiledWorkflowMessageEffectsV3Options {
  readonly expression: ExpressionExecutorPort;
  readonly messageEffect: SuccessorJournaledDomainMessageEffect;
  readonly onChildAccepted: (target: WorkflowAddress, messageId: string) => void;
}

export type CompiledWorkflowMessageEffectsV3Result =
  | { readonly status: 'continued' }
  | {
      readonly status: 'rejected_routed';
      readonly state: PortableWorkflowState;
      readonly rejection: WorkflowSendPermanentRejection;
      readonly effectIndex: number;
    };

/**
 * Executes only engine-major-3 Domain Message effects for one settled state.
 *
 * A permanent child rejection is already durably committed by `messageEffect`
 * before this function selects its route. Route selection then returns
 * immediately, so no later old-state sibling effect can execute. The caller
 * must continue settling from the returned state before considering the old
 * state's invoke path.
 */
export class CompiledWorkflowMessageEffectsV3 {
  constructor(private readonly options: CompiledWorkflowMessageEffectsV3Options) {}

  async run(request: {
    readonly stateDefinition: CompiledStateV3;
    readonly current: WorkflowInstanceSnapshot;
    readonly stored: StoredAcceptedMessage;
    readonly state: PortableWorkflowState;
    readonly logicalTime: string;
    readonly step: number;
  }): Promise<CompiledWorkflowMessageEffectsV3Result> {
    const effects = request.stateDefinition.effects ?? [];
    for (let index = 0; index < effects.length; index += 1) {
      const effect = effects[index]!;
      const scope = workflowScope(request.current, request.state);
      const targetValue = await this.options.expression.evaluate({
        expression: effect.targetExpression,
        input: scope,
        logicalTime: request.logicalTime,
      });
      const target = workflowAddress(targetValue);
      const payload = effect.payloadExpression === undefined
        ? scope
        : await this.options.expression.evaluate({
            expression: effect.payloadExpression,
            input: scope,
            logicalTime: request.logicalTime,
          });
      const source: EffectIdentitySeed = effectSeed(
        request.current.address,
        request.stored.message.messageId,
        `${request.state.stateId}:message-effect:${index}`,
        request.step,
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
        correlationId: request.stored.message.correlationId ?? request.current.correlationId,
      });

      if (result.outcome.status === 'accepted') {
        this.options.onChildAccepted(result.outcome.ack.target, result.messageId);
        continue;
      }

      const rejection = result.outcome.rejection;
      const route = await this.selectRoute(
        effect.rejected,
        {
          ...scope,
          rejection: rejectionToJson(rejection),
        },
        request.logicalTime,
      );
      if (route === null) {
        throw new Error(
          `Engine-major-3 rejected routes for ${request.state.stateId} effect ${index} were not total at runtime`,
        );
      }
      return {
        status: 'rejected_routed',
        state: {
          stateId: route.target,
          data: request.state.data,
          lastMessage: request.state.lastMessage,
          lastResult: request.state.lastResult,
        },
        rejection,
        effectIndex: index,
      };
    }

    return { status: 'continued' };
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
        throw new Error(
          `Workflow rejected-route condition must return boolean, got ${matched === null ? 'null' : typeof matched}`,
        );
      }
    }
    return null;
  }
}

function rejectionToJson(rejection: WorkflowSendPermanentRejection): JsonObject {
  return {
    code: rejection.code,
    message: rejection.message,
    ...(rejection.targetLifecycle === undefined ? {} : { targetLifecycle: rejection.targetLifecycle }),
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
