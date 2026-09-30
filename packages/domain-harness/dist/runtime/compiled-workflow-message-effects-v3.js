import { SuccessorJournaledDomainMessageEffect } from '../messaging/send-effect/successor-journaled-domain-message-effect.js';
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
    options;
    constructor(options) {
        this.options = options;
    }
    async run(request) {
        const effects = request.stateDefinition.effects ?? [];
        for (let index = 0; index < effects.length; index += 1) {
            const effect = effects[index];
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
            const source = effectSeed(request.current.address, request.stored.message.messageId, `${request.state.stateId}:message-effect:${index}`, request.step);
            const normalizedEffect = {
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
            const route = await this.selectRoute(effect.rejected, {
                ...scope,
                rejection: rejectionToJson(rejection),
            }, request.logicalTime);
            if (route === null) {
                throw new Error(`Engine-major-3 rejected routes for ${request.state.stateId} effect ${index} were not total at runtime`);
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
    async selectRoute(routes, input, logicalTime) {
        for (const route of routes) {
            if (route.when === undefined)
                return route;
            const matched = await this.options.expression.evaluate({
                expression: route.when,
                input,
                logicalTime,
            });
            if (matched === true)
                return route;
            if (matched !== false) {
                throw new Error(`Workflow rejected-route condition must return boolean, got ${matched === null ? 'null' : typeof matched}`);
            }
        }
        return null;
    }
}
function rejectionToJson(rejection) {
    return {
        code: rejection.code,
        message: rejection.message,
        ...(rejection.targetLifecycle === undefined ? {} : { targetLifecycle: rejection.targetLifecycle }),
    };
}
function workflowScope(current, state) {
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
function workflowAddress(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Domain Message target expression must return a WorkflowAddress object');
    }
    const record = value;
    if (typeof record.workflowId !== 'string' || typeof record.instanceKey !== 'string') {
        throw new Error('Domain Message target expression must return workflowId and instanceKey strings');
    }
    return { workflowId: record.workflowId, instanceKey: record.instanceKey };
}
function effectSeed(target, sourceMessageId, workflowStepIdentity, stepVisit) {
    return { target, sourceMessageId, workflowStepIdentity, stepVisit };
}
//# sourceMappingURL=compiled-workflow-message-effects-v3.js.map