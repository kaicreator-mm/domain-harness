import { extname } from 'node:path';
import { sha256Text } from '../../package/canonical.js';
import { SCRIPT_EXECUTION_CAPABILITY, } from '../../script/script-bundle.js';
const LEGACY_SCRIPT_TOOL_PREFIX = '__v01_script__';
export class V01ScriptTranslationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'V01ScriptTranslationError';
    }
}
export function translateV01ScriptInvokes(raw, options) {
    assertTargetProfile(options);
    const translatedTools = [];
    const translatedScripts = [];
    const translatedWorkflows = new Map();
    for (const [workflowKey, workflow] of raw.workflows) {
        if (workflowKey !== workflow.id) {
            throw new V01ScriptTranslationError(`Workflow map key '${workflowKey}' does not match workflow id '${workflow.id}'`);
        }
        const translatedStates = {};
        for (const [stateKey, state] of Object.entries(workflow.states)) {
            if (stateKey !== state.id) {
                throw new V01ScriptTranslationError(`Workflow '${workflow.id}' state key '${stateKey}' does not match state id '${state.id}'`);
            }
            if (state.invoke?.kind !== 'script') {
                translatedStates[stateKey] = cloneState(state);
                continue;
            }
            const translation = translateScriptState(raw, workflow, state, options);
            translatedTools.push(translation.tool);
            translatedScripts.push(translation);
            translatedStates[stateKey] = cloneState(state, {
                kind: 'tool',
                ref: translation.toolId,
                ...(state.invoke.input === undefined ? {} : { input: state.invoke.input }),
                ...(state.invoke.timeoutMs === undefined ? {} : { timeoutMs: state.invoke.timeoutMs }),
            });
        }
        translatedWorkflows.set(workflowKey, {
            ...workflow,
            states: translatedStates,
        });
    }
    assertUniqueIdentities(translatedScripts);
    return {
        raw: {
            ...raw,
            workflows: translatedWorkflows,
        },
        tools: translatedTools,
        scripts: translatedScripts,
    };
}
function translateScriptState(raw, workflow, state, options) {
    const invoke = state.invoke;
    if (invoke?.kind !== 'script') {
        throw new V01ScriptTranslationError(`Workflow '${workflow.id}' state '${state.id}' is not a legacy Script invoke`);
    }
    if (invoke.ref === undefined || invoke.ref.trim() === '') {
        throw new V01ScriptTranslationError(`Workflow '${workflow.id}' state '${state.id}' legacy Script invoke is missing ref`);
    }
    const frozenSource = invoke.scriptSource;
    const indexedSource = raw.scripts.get(invoke.ref);
    if (frozenSource === undefined || indexedSource === undefined) {
        throw new V01ScriptTranslationError(`Legacy Script '${invoke.ref}' in ${workflow.id}.${state.id} was not frozen by the v0.1 loader`);
    }
    if (frozenSource !== indexedSource) {
        throw new V01ScriptTranslationError(`Legacy Script '${invoke.ref}' in ${workflow.id}.${state.id} does not match the package's frozen Script source`);
    }
    const sourceDigest = sha256Text(frozenSource);
    const identityDigest = sha256Text(`${workflow.id}\0${state.id}\0${invoke.ref}\0${sourceDigest}`);
    const toolId = `${LEGACY_SCRIPT_TOOL_PREFIX}${identityDigest}`;
    const bindingId = toolId;
    const language = sourceLanguage(invoke.ref);
    const tool = {
        toolId,
        outputSchema: {},
        // Frozen v0.1 Script is deterministic trusted code with no external I/O.
        // `none` preserves that contract while retaining replay after interruption.
        effect: 'none',
        execution: {
            kind: 'script',
            bindingId,
        },
        requiredCapabilities: [SCRIPT_EXECUTION_CAPABILITY],
    };
    return {
        workflowId: workflow.id,
        stateId: state.id,
        sourceRef: invoke.ref,
        sourceDigest,
        toolId,
        bindingId,
        tool,
        bundleRequest: {
            bindingId,
            sourcePath: invoke.ref,
            source: frozenSource,
            language,
            target: options.target,
            targetProfile: options.targetProfile,
        },
    };
}
function cloneState(state, invoke = state.invoke) {
    return {
        ...state,
        ...(invoke === undefined ? {} : { invoke: { ...invoke } }),
        done: state.done.map((route) => ({ ...route })),
        error: state.error.map((route) => ({ ...route })),
        events: Object.fromEntries(Object.entries(state.events).map(([type, event]) => [type, {
                ...event,
                routes: event.routes.map((route) => ({ ...route })),
            }])),
        ...(state.effects === undefined
            ? {}
            : { effects: state.effects.map((effect) => ({ ...effect })) }),
    };
}
function sourceLanguage(sourceRef) {
    const extension = extname(sourceRef).toLowerCase();
    if (extension === '.ts' || extension === '.mts' || extension === '.cts')
        return 'typescript';
    if (extension === '.js' || extension === '.mjs' || extension === '.cjs')
        return 'javascript';
    throw new V01ScriptTranslationError(`Legacy Script '${sourceRef}' has unsupported source extension '${extension || '<none>'}'`);
}
function assertTargetProfile(options) {
    if (!options.targetProfile.capabilities.includes(SCRIPT_EXECUTION_CAPABILITY)) {
        throw new V01ScriptTranslationError(`Target profile '${options.targetProfile.id}' does not declare ${SCRIPT_EXECUTION_CAPABILITY}`);
    }
    const binding = options.targetProfile.bindings[SCRIPT_EXECUTION_CAPABILITY];
    if (typeof binding !== 'string' || binding.trim() === '') {
        throw new V01ScriptTranslationError(`Target profile '${options.targetProfile.id}' has no binding for ${SCRIPT_EXECUTION_CAPABILITY}`);
    }
}
function assertUniqueIdentities(translations) {
    const toolIds = new Set();
    const bindingIds = new Set();
    for (const translation of translations) {
        if (toolIds.has(translation.toolId)) {
            throw new V01ScriptTranslationError(`Duplicate synthetic Script Tool id '${translation.toolId}'`);
        }
        if (bindingIds.has(translation.bindingId)) {
            throw new V01ScriptTranslationError(`Duplicate synthetic Script binding id '${translation.bindingId}'`);
        }
        toolIds.add(translation.toolId);
        bindingIds.add(translation.bindingId);
    }
}
