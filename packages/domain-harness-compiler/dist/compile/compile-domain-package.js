import jsonata from 'jsonata';
import { SUPPORTED_COMPILED_INVOKE_KINDS_V2 } from '@kaicreator/domain-harness/v2';
import { canonicalJson } from '../package/canonical.js';
import { assertCompiledPackageManifest, buildBindingDigests, buildCompiledPackageManifest, InvalidToolConfigError, toolConfigIssues, } from '../package/manifest.js';
import { assertTargetCapabilities, collectRequiredCapabilities } from './capabilities.js';
/**
 * Executable-artifact invariant (#167): a successful public v0.2 compilation
 * emits only workflow IR executable by executionEngineMajor 2. Legacy script
 * invokes must pass through the T-021 translation (translateV01ScriptInvokes,
 * L2 §18.1) before compilation; child workflow invokes must be modeled as
 * durable Domain Message effects. Route targets must resolve, and every
 * JSONata expression is syntax-checked at build time so invalid expressions
 * fail closed here instead of mid-drain.
 */
function assertJsonataSyntax(expression, context) {
    try {
        jsonata(expression);
    }
    catch (error) {
        throw new Error(`${context} is not valid JSONata: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
}
function jsonRoute(workflowId, stateId, route, stateIds, context) {
    if (!stateIds.has(route.target)) {
        throw new Error(`workflow '${workflowId}' state '${stateId}' ${context} targets unknown state '${route.target}'`);
    }
    if (route.when) {
        assertJsonataSyntax(route.when, `workflow '${workflowId}' state '${stateId}' ${context} route condition`);
    }
    return { target: route.target, ...(route.when ? { when: route.when } : {}) };
}
function jsonInvoke(workflowId, stateId, invoke) {
    const common = {};
    if (invoke.input) {
        assertJsonataSyntax(invoke.input, `workflow '${workflowId}' state '${stateId}' invoke input`);
        common.input = invoke.input;
    }
    if (invoke.timeoutMs !== undefined)
        common.timeoutMs = invoke.timeoutMs;
    if (invoke.kind === 'script') {
        throw new Error(`workflow '${workflowId}' state '${stateId}': top-level 'script' invoke is not executable by the v0.2 Runtime (executionEngineMajor 2); translate legacy Script invokes into synthetic Script Domain Tools via translateV01ScriptInvokes (T-021 / L2 18.1) before compiling`);
    }
    if (invoke.kind === 'workflow') {
        throw new Error(`workflow '${workflowId}' state '${stateId}': top-level child 'workflow' invoke is not executable by the v0.2 Runtime (executionEngineMajor 2); model child workflows as durable Domain Message effects`);
    }
    if (!SUPPORTED_COMPILED_INVOKE_KINDS_V2.includes(invoke.kind)) {
        throw new Error(`workflow '${workflowId}' state '${stateId}': invoke kind '${invoke.kind}' is outside the executable IR contract for executionEngineMajor 2`);
    }
    if (invoke.kind === 'expr') {
        if (!invoke.expression) {
            throw new Error(`workflow '${workflowId}' state '${stateId}': expr invoke must declare a non-empty expression`);
        }
        assertJsonataSyntax(invoke.expression, `workflow '${workflowId}' state '${stateId}' invoke expression`);
        return { kind: 'expr', expression: invoke.expression, ...common };
    }
    if (!invoke.ref) {
        throw new Error(`workflow '${workflowId}' state '${stateId}': ${invoke.kind} invoke must declare a non-empty ref`);
    }
    return { kind: invoke.kind, ref: invoke.ref, ...common };
}
function compiledSkill(raw, ref) {
    const skill = raw.skills.get(ref);
    if (!skill)
        throw new Error(`referenced Skill '${ref}' does not exist in the loaded Raw Domain Package`);
    return {
        skillId: skill.id,
        instructions: skill.instructions,
        ...(skill.inputSchema ? { inputSchema: skill.inputSchema } : {}),
        outputSchema: skill.outputSchema,
        resources: skill.resources.map((resource) => ({ path: resource.path, content: resource.content })),
        ...(skill.profile ? { profile: skill.profile } : {}),
    };
}
function sameSchema(left, right) {
    return canonicalJson(left) === canonicalJson(right);
}
function compileWorkflow(raw, workflowId) {
    const workflow = raw.workflows.get(workflowId);
    if (!workflow)
        throw new Error(`workflow '${workflowId}' does not exist`);
    if (!Number.isSafeInteger(raw.limits.maxSteps) || raw.limits.maxSteps < 1) {
        throw new Error(`workflow '${workflowId}': limits.maxSteps must be a positive safe integer`);
    }
    const stateIds = new Set(Object.keys(workflow.states));
    if (!stateIds.has(workflow.initial)) {
        throw new Error(`workflow '${workflowId}' initial state '${workflow.initial}' is not declared in states`);
    }
    if (workflow.output) {
        assertJsonataSyntax(workflow.output, `workflow '${workflowId}' output`);
    }
    const messageContracts = {};
    const states = {};
    for (const stateId of Object.keys(workflow.states).sort()) {
        const state = workflow.states[stateId];
        if (!state)
            continue;
        const events = {};
        for (const eventName of Object.keys(state.events).sort()) {
            const event = state.events[eventName];
            if (!event)
                continue;
            const payloadSchema = event.schema ?? {};
            const existing = messageContracts[eventName];
            if (existing && !sameSchema(existing.payloadSchema, payloadSchema)) {
                throw new Error(`workflow '${workflowId}' message '${eventName}' declares inconsistent payload schemas across states`);
            }
            if (!existing)
                messageContracts[eventName] = { type: eventName, payloadSchema };
            events[eventName] = {
                routes: event.routes.map((route) => jsonRoute(workflowId, stateId, route, stateIds, `event '${eventName}'`)),
            };
        }
        states[stateId] = {
            final: state.final,
            ...(state.invoke ? {
                invoke: state.invoke.kind === 'skill' && state.invoke.ref
                    ? { ...jsonInvoke(workflowId, stateId, state.invoke), skill: compiledSkill(raw, state.invoke.ref) }
                    : jsonInvoke(workflowId, stateId, state.invoke),
            } : {}),
            done: state.done.map((route) => jsonRoute(workflowId, stateId, route, stateIds, 'done route')),
            error: state.error.map((route) => jsonRoute(workflowId, stateId, route, stateIds, 'error route')),
            events,
            ...(state.effects?.length ? {
                effects: state.effects.map((effect) => {
                    assertJsonataSyntax(effect.targetExpression, `workflow '${workflowId}' state '${stateId}' domain-message targetExpression`);
                    if (effect.payloadExpression) {
                        assertJsonataSyntax(effect.payloadExpression, `workflow '${workflowId}' state '${stateId}' domain-message payloadExpression`);
                    }
                    return {
                        kind: 'domain-message',
                        targetExpression: effect.targetExpression,
                        messageType: effect.messageType,
                        ...(effect.payloadExpression ? { payloadExpression: effect.payloadExpression } : {}),
                        ...(effect.contractVersion ? { contractVersion: effect.contractVersion } : {}),
                    };
                }),
            } : {}),
        };
    }
    const definition = {
        initial: workflow.initial,
        ...(workflow.output ? { output: workflow.output } : {}),
        states,
        limits: { maxSteps: raw.limits.maxSteps },
    };
    return { workflowId, definition, messageContracts };
}
function compileTools(tools, target, bindingDigests) {
    const result = {};
    for (const tool of [...tools].sort((a, b) => a.toolId.localeCompare(b.toolId))) {
        if (result[tool.toolId])
            throw new Error(`duplicate tool '${tool.toolId}'`);
        const requiredCapabilities = [...(tool.requiredCapabilities ?? [])].sort();
        if (tool.bindingCapability && !requiredCapabilities.includes(tool.bindingCapability)) {
            throw new Error(`tool '${tool.toolId}' bindingCapability '${tool.bindingCapability}' must also appear in requiredCapabilities`);
        }
        const bindingCapability = tool.bindingCapability ?? (requiredCapabilities.length === 1 ? requiredCapabilities[0] : undefined);
        if (requiredCapabilities.length > 1 && !bindingCapability) {
            throw new Error(`tool '${tool.toolId}' declares multiple required capabilities and must select bindingCapability explicitly`);
        }
        const bindingId = bindingCapability ? target.bindings[bindingCapability] : `runtime:${tool.executionKind}`;
        if (!bindingId)
            throw new Error(`tool '${tool.toolId}' cannot resolve a target binding`);
        if (tool.config !== undefined) {
            const configIssues = toolConfigIssues(tool.config, `tool '${tool.toolId}' config`);
            if (configIssues.length)
                throw new InvalidToolConfigError(tool.toolId, configIssues);
        }
        result[tool.toolId] = {
            toolId: tool.toolId,
            ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
            outputSchema: tool.outputSchema,
            effect: tool.effect,
            execution: {
                kind: tool.executionKind,
                bindingId,
                ...(bindingDigests[bindingId] ? { digest: bindingDigests[bindingId] } : {}),
                // Copy into a plain record: the authoritative core CompiledBindingDescriptor
                // types config as JsonValue, and the closed LogicalToolBindingConfig interface
                // (validated above) carries no implicit index signature.
                ...(tool.config !== undefined ? { config: { ...tool.config } } : {}),
            },
            requiredCapabilities,
        };
    }
    return result;
}
function compileProjections(projections) {
    const result = {};
    for (const projection of [...projections].sort((a, b) => a.projectionId.localeCompare(b.projectionId))) {
        if (result[projection.projectionId])
            throw new Error(`duplicate projection '${projection.projectionId}'`);
        try {
            jsonata(projection.expression);
        }
        catch (error) {
            throw new Error(`projection '${projection.projectionId}' JSONata compile failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        }
        result[projection.projectionId] = {
            projectionId: projection.projectionId,
            expression: projection.expression,
            dependencies: projection.dependencies.map((dependency) => ({ ...dependency })),
            outputSchema: projection.outputSchema,
        };
    }
    return result;
}
function schemaRecord(raw) {
    return Object.fromEntries([...raw.schemas.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
export function compileDomainPackage(input) {
    if (!input.domainVersion)
        throw new Error('domainVersion must be non-empty');
    const tools = input.tools ?? [];
    const projections = input.projections ?? [];
    const requiredCapabilities = collectRequiredCapabilities(input.raw, input.requiredCapabilities ?? [], tools);
    assertTargetCapabilities(input.target, requiredCapabilities);
    const bindingDigests = buildBindingDigests(input.target, requiredCapabilities, input.bindingContents);
    const workflows = Object.fromEntries([...input.raw.workflows.keys()].sort().map((workflowId) => [workflowId, compileWorkflow(input.raw, workflowId)]));
    const manifest = buildCompiledPackageManifest({
        formatVersion: '0.2',
        runtimeContractMajor: 2,
        executionEngineMajor: 2,
        domainId: input.raw.domainId,
        domainVersion: input.domainVersion,
        targetProfileId: input.target.id,
        requiredCapabilities,
        workflows,
        tools: compileTools(tools, input.target, bindingDigests),
        projections: compileProjections(projections),
        schemas: schemaRecord(input.raw),
        bindingDigests,
        compatibility: {
            sourceSchemaVersion: input.raw.schemaVersion,
            legacyChildDependencies: Object.fromEntries([...input.raw.childDependencies.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([id, children]) => [id, [...children]])),
        },
    });
    assertCompiledPackageManifest(manifest);
    return {
        manifest,
        requiredBindingIds: [...new Set(requiredCapabilities.map((capability) => input.target.bindings[capability]).filter((value) => Boolean(value)))].sort(),
    };
}
