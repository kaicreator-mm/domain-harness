import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import { JournaledSkillRunner, } from './journaled-skill-runner.js';
import { decodeCompiledWorkflowDefinition, } from './compiled-workflow-ir.js';
export class CompiledWorkflowRuntime {
    options;
    constructor(options) {
        this.options = options;
    }
    initialState(workflow, input) {
        const definition = parseDefinition(workflow);
        requireState(definition, definition.initial);
        return portableState(definition.initial, input, null, null);
    }
    async processMessage(compiledPackage, workflow, current, stored, execution = {}) {
        const definition = parseDefinition(workflow);
        let state = parsePortableState(current.state);
        const sourceState = requireState(definition, state.stateId);
        const event = sourceState.events[stored.message.type];
        if (event === undefined) {
            throw new Error(`Workflow ${workflow.workflowId} state ${state.stateId} does not accept message ${stored.message.type}`);
        }
        const logicalTime = stored.ack.acceptedAt;
        const scope = messageScope(current, state, stored.message.payload);
        const route = await this.selectRoute(event.routes, scope, logicalTime);
        if (route === null) {
            throw new Error(`Workflow ${workflow.workflowId} message ${stored.message.type} has no matching route from ${state.stateId}`);
        }
        state = portableState(route.target, state.data, stored.message.payload, null);
        return this.settle(compiledPackage, workflow, definition, current, stored, state, logicalTime, execution);
    }
    async settle(compiledPackage, workflow, definition, current, stored, initialState, logicalTime, execution = {}) {
        let state = initialState;
        const maxSteps = Math.max(1, definition.limits?.maxSteps ?? 256);
        for (let step = 0; step < maxSteps; step += 1) {
            const stateDefinition = requireState(definition, state.stateId);
            await this.runMessageEffects(stateDefinition, current, stored, state, logicalTime, step);
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
                const result = await this.invoke(compiledPackage, stateDefinition.invoke, current, stored, state, logicalTime, step, execution);
                if (result.recoveryFailure !== undefined) {
                    return {
                        nextState: state,
                        nextLifecycle: 'recovery_required',
                        recoveryFailure: result.recoveryFailure,
                    };
                }
                state = portableState(state.stateId, state.data, state.lastMessage, result.value);
                const route = await this.selectRoute(stateDefinition.done, workflowScope(current, state), logicalTime);
                if (route === null) {
                    return { nextState: state, nextLifecycle: 'waiting' };
                }
                state = portableState(route.target, state.data, state.lastMessage, state.lastResult);
            }
            catch (error) {
                const errorScope = {
                    ...workflowScope(current, state),
                    error: error instanceof Error ? error.message : String(error),
                };
                const route = await this.selectRoute(stateDefinition.error, errorScope, logicalTime);
                if (route === null)
                    throw error;
                state = portableState(route.target, state.data, state.lastMessage, null);
            }
        }
        throw new Error(`Workflow ${workflow.workflowId} exceeded maxSteps while processing ${stored.message.messageId}`);
    }
    async invoke(compiledPackage, invoke, current, stored, state, logicalTime, step, execution = {}) {
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
                throw new Error(`Skill '${invoke.ref}' requires a provider-neutral AI operation port at Runtime activation`);
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
                ...(execution.signal === undefined ? {} : { signal: execution.signal }),
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
        // Exhaustiveness guard: the shared decoder only admits invoke kinds
        // supported by executionEngineMajor 2 ('expr' | 'tool' | 'skill'), and all
        // of them are handled above. Legacy 'script'/'workflow' invokes now fail
        // closed at compile time (#167) and at activation (#168), never here.
        throw new Error(`Compiled invoke kind ${String(invoke.kind)} is not executable by the portable v0.2 Runtime assembly`);
    }
    async runMessageEffects(stateDefinition, current, stored, state, logicalTime, step) {
        const effects = stateDefinition.effects ?? [];
        for (let index = 0; index < effects.length; index += 1) {
            const effect = effects[index];
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
            const source = effectSeed(current.address, stored.message.messageId, `${state.stateId}:message-effect:${index}`, step);
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
                correlationId: stored.message.correlationId ?? current.correlationId,
            });
            this.options.onChildAccepted(result.ack.target, result.messageId);
        }
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
                throw new Error(`Workflow route condition must return boolean, got ${matched === null ? 'null' : typeof matched}`);
            }
        }
        return null;
    }
}
function parseDefinition(workflow) {
    return decodeCompiledWorkflowDefinition(workflow.workflowId, workflow.definition);
}
function requireState(definition, stateId) {
    const state = definition.states[stateId];
    if (state === undefined)
        throw new Error(`Compiled workflow state ${stateId} does not exist`);
    return state;
}
function portableState(stateId, data, lastMessage, lastResult) {
    return { stateId, data, lastMessage, lastResult };
}
function parsePortableState(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Persisted Workflow state is not a portable v0.2 state object');
    }
    const candidate = value;
    if (typeof candidate.stateId !== 'string' || candidate.stateId.length === 0 || !('data' in candidate)) {
        throw new Error('Persisted Workflow state is missing stateId/data');
    }
    return portableState(candidate.stateId, candidate.data ?? null, candidate.lastMessage ?? null, candidate.lastResult ?? null);
}
function messageScope(current, state, payload) {
    return {
        ...workflowScope(current, state),
        message: payload,
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
//# sourceMappingURL=compiled-workflow-runtime.js.map