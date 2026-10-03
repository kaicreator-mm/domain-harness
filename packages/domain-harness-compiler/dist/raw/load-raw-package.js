import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import jsonata from 'jsonata';
import { parse as parseYaml } from 'yaml';
import { RawPackageDefinitionError } from './errors.js';
import { validateChildGraph, validateWorkflowStructure } from './validation.js';
/**
 * Frozen resolver bypass vocabulary mirrored from the compiled semantic
 * decision contract (v0.6 T001 / issue #497). The declaration can pin one of
 * these reasons; it can never invent a new one. `satisfies` keeps this set
 * compile-time exhaustive against the core union, so a core-side vocabulary
 * change fails the compiler build instead of diverging silently.
 */
const SEMANTIC_DECISION_CACHE_BYPASS_REASONS = new Set(Object.keys({
    'non-cacheable': true,
    'time-sensitive': true,
    'live-dependency-without-semantic-revision': true,
    'dynamic-dependency-not-prebound': true,
    'explicit-domain-policy': true,
}));
const SEMANTIC_DECISION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function asRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function assertOnlyKeys(record, allowed, label) {
    const unexpected = Object.keys(record).filter((key) => !allowed.includes(key));
    if (unexpected.length)
        throw new Error(`${label} has unsupported keys: ${unexpected.sort().join(', ')}`);
}
function requiredString(record, key, label) {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${label}.${key} must be a non-empty string`);
    return value;
}
function optionalString(record, key, label) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(`${label}.${key} must be a non-empty string when present`);
    return value;
}
function assertContained(root, candidate, ref) {
    const rel = relative(root, candidate);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
        throw new Error(`path escapes Raw Domain Package root: ${ref}`);
}
async function safeExistingPath(root, ref) {
    if (isAbsolute(ref))
        throw new Error(`absolute path is not allowed: ${ref}`);
    const lexical = resolve(root, normalize(ref));
    assertContained(root, lexical, ref);
    const canonical = await realpath(lexical);
    assertContained(root, canonical, ref);
    return canonical;
}
async function readYaml(path) {
    return parseYaml(await readFile(path, 'utf8'));
}
function parseRoute(value, label) {
    const raw = asRecord(value, label);
    assertOnlyKeys(raw, ['target', 'when'], label);
    const target = requiredString(raw, 'target', label);
    const when = optionalString(raw, 'when', label);
    return { target, ...(when ? { when } : {}) };
}
function parseEvent(value, label) {
    if (Array.isArray(value)) {
        if (value.length === 0)
            throw new Error(`${label} route list must not be empty`);
        return { routes: value.map((route, index) => parseRoute(route, `${label}[${index}]`)) };
    }
    const raw = asRecord(value, label);
    if ('routes' in raw) {
        assertOnlyKeys(raw, ['schema', 'routes'], label);
        if (!Array.isArray(raw.routes) || raw.routes.length === 0)
            throw new Error(`${label}.routes must be a non-empty array`);
        const schemaPath = optionalString(raw, 'schema', label);
        return {
            ...(schemaPath ? { schemaPath } : {}),
            routes: raw.routes.map((route, index) => parseRoute(route, `${label}.routes[${index}]`)),
        };
    }
    assertOnlyKeys(raw, ['target', 'when', 'schema'], label);
    const route = parseRoute({ target: raw.target, ...(raw.when === undefined ? {} : { when: raw.when }) }, label);
    const schemaPath = optionalString(raw, 'schema', label);
    return { ...(schemaPath ? { schemaPath } : {}), routes: [route] };
}
function parseInvoke(value, label) {
    const raw = asRecord(value, label);
    assertOnlyKeys(raw, ['skill', 'tool', 'script', 'expr', 'workflow', 'input', 'timeoutMs'], label);
    const declared = ['skill', 'tool', 'script', 'expr', 'workflow'].filter((key) => raw[key] !== undefined);
    if (declared.length !== 1)
        throw new Error(`${label} must declare exactly one of skill/tool/script/expr/workflow`);
    const key = declared[0];
    if (!key)
        throw new Error(`${label} invoke kind is missing`);
    const common = {};
    const input = optionalString(raw, 'input', label);
    if (input)
        common.input = input;
    if (raw.timeoutMs !== undefined) {
        if (!Number.isInteger(raw.timeoutMs) || raw.timeoutMs <= 0)
            throw new Error(`${label}.timeoutMs must be a positive integer`);
        common.timeoutMs = raw.timeoutMs;
    }
    const body = requiredString(raw, key, label);
    if (key === 'expr')
        return { kind: 'expr', expression: body, ...common };
    return { kind: key, ref: body, ...common };
}
function parseMessageEffect(value, label) {
    const raw = asRecord(value, label);
    assertOnlyKeys(raw, ['kind', 'targetExpression', 'messageType', 'payloadExpression', 'contractVersion', 'rejected'], label);
    if (raw.kind !== 'domain-message')
        throw new Error(`${label}.kind must be 'domain-message'`);
    const payloadExpression = optionalString(raw, 'payloadExpression', label);
    const contractVersion = optionalString(raw, 'contractVersion', label);
    const rejected = parseRejectedRoutes(raw.rejected, `${label}.rejected`);
    return {
        kind: 'domain-message',
        targetExpression: requiredString(raw, 'targetExpression', label),
        messageType: requiredString(raw, 'messageType', label),
        ...(payloadExpression ? { payloadExpression } : {}),
        ...(contractVersion ? { contractVersion } : {}),
        ...(rejected === undefined ? {} : { rejected }),
    };
}
/**
 * Static shape validation for engine-major-3 rejection routing (L2-B §4.2):
 * non-empty array, conditional routes first, final route unconditional. State
 * target resolution and JSONata totality are compile-time checks in
 * compile-domain-package.ts, which knows the declared state set.
 */
function parseRejectedRoutes(value, label) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${label} must be a non-empty array of rejection routes`);
    }
    return value.map((route, index) => {
        const parsed = parseRoute(route, `${label}[${index}]`);
        const isFallback = index === value.length - 1;
        if (isFallback && parsed.when !== undefined) {
            throw new Error(`${label}[${index}] final rejection route must be unconditional`);
        }
        if (!isFallback && parsed.when === undefined) {
            throw new Error(`${label}[${index}] non-final rejection route must declare 'when'`);
        }
        return parsed;
    });
}
function compileExpression(expression, label, issues) {
    try {
        jsonata(expression);
    }
    catch (error) {
        issues.push(`${label}: JSONata compile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function loadJsonSchema(path, logicalRef, schemas, ajv, issues) {
    const existing = schemas.get(logicalRef);
    if (existing)
        return existing;
    try {
        const parsed = JSON.parse(await readFile(path, 'utf8'));
        const schema = asRecord(parsed, logicalRef);
        ajv.compile(schema);
        schemas.set(logicalRef, schema);
        return schema;
    }
    catch (error) {
        issues.push(`${logicalRef}: JSON Schema compile failed: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}
async function loadSkills(root, schemas, ajv, issues) {
    const skills = new Map();
    let skillsDir;
    try {
        skillsDir = await safeExistingPath(root, 'skills');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return skills;
        throw error;
    }
    const entries = (await readdir(skillsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const id = entry.name;
        const directory = join(skillsDir, id);
        try {
            const sidecar = asRecord(await readYaml(await safeExistingPath(directory, 'skill.harness.yaml')), `skill:${id}`);
            assertOnlyKeys(sidecar, ['input', 'output', 'resources', 'profile'], `skill:${id}`);
            const output = asRecord(sidecar.output, `skill:${id}.output`);
            assertOnlyKeys(output, ['schema'], `skill:${id}.output`);
            const outputRef = requiredString(output, 'schema', `skill:${id}.output`);
            const outputSchema = await loadJsonSchema(await safeExistingPath(directory, outputRef), `skill:${id}:output:${outputRef}`, schemas, ajv, issues);
            if (!outputSchema)
                continue;
            let inputSchema;
            if (sidecar.input !== undefined) {
                const input = asRecord(sidecar.input, `skill:${id}.input`);
                assertOnlyKeys(input, ['schema'], `skill:${id}.input`);
                const inputRef = requiredString(input, 'schema', `skill:${id}.input`);
                inputSchema = await loadJsonSchema(await safeExistingPath(directory, inputRef), `skill:${id}:input:${inputRef}`, schemas, ajv, issues);
            }
            const resourceRefs = sidecar.resources === undefined ? [] : sidecar.resources;
            if (!Array.isArray(resourceRefs) || !resourceRefs.every((item) => typeof item === 'string' && item.length > 0)) {
                throw new Error(`skill:${id}.resources must be an array of non-empty relative paths`);
            }
            const resources = [];
            for (const ref of resourceRefs) {
                resources.push({ path: ref, content: await readFile(await safeExistingPath(directory, ref), 'utf8') });
            }
            const profile = optionalString(sidecar, 'profile', `skill:${id}`);
            skills.set(id, {
                id,
                directory,
                instructions: await readFile(await safeExistingPath(directory, 'SKILL.md'), 'utf8'),
                ...(inputSchema ? { inputSchema } : {}),
                outputSchema,
                resources,
                ...(profile ? { profile } : {}),
            });
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                issues.push(`skill:${id}: required skill files are incomplete`);
            }
            else {
                issues.push(`skill:${id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return skills;
}
async function loadWorkflows(root, issues) {
    const workflows = new Map();
    const workflowsDir = await safeExistingPath(root, 'workflows');
    const entries = (await readdir(workflowsDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && ['.yaml', '.yml'].includes(extname(entry.name)))
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const sourcePath = await safeExistingPath(workflowsDir, entry.name);
        const id = basename(entry.name, extname(entry.name));
        try {
            const raw = asRecord(await readYaml(sourcePath), `workflow:${id}`);
            assertOnlyKeys(raw, ['initial', 'output', 'states'], `workflow:${id}`);
            const statesRaw = asRecord(raw.states, `workflow:${id}.states`);
            const states = {};
            for (const [stateId, stateValue] of Object.entries(statesRaw)) {
                const stateRaw = asRecord(stateValue, `workflow:${id}.${stateId}`);
                assertOnlyKeys(stateRaw, ['final', 'invoke', 'on', 'effects'], `workflow:${id}.${stateId}`);
                if (stateRaw.final !== undefined && typeof stateRaw.final !== 'boolean')
                    throw new Error(`workflow:${id}.${stateId}.final must be boolean when present`);
                const eventsRaw = stateRaw.on === undefined ? {} : asRecord(stateRaw.on, `workflow:${id}.${stateId}.on`);
                const events = {};
                let done = [];
                let error = [];
                for (const [eventName, spec] of Object.entries(eventsRaw)) {
                    const parsed = parseEvent(spec, `workflow:${id}.${stateId}.on.${eventName}`);
                    if (eventName === 'done' || eventName === 'error') {
                        if (parsed.schemaPath)
                            issues.push(`workflow:${id}.${stateId}.on.${eventName} cannot declare an event payload schema`);
                        if (eventName === 'done')
                            done = parsed.routes;
                        else
                            error = parsed.routes;
                    }
                    else
                        events[eventName] = parsed;
                }
                const invoke = stateRaw.invoke === undefined ? undefined : parseInvoke(stateRaw.invoke, `workflow:${id}.${stateId}.invoke`);
                if (invoke && error.length === 0)
                    error = [{ target: 'failed' }];
                const effects = stateRaw.effects === undefined ? undefined : stateRaw.effects;
                if (effects !== undefined && !Array.isArray(effects))
                    throw new Error(`workflow:${id}.${stateId}.effects must be an array`);
                states[stateId] = {
                    id: stateId,
                    final: stateRaw.final === true,
                    ...(invoke ? { invoke } : {}),
                    done,
                    error,
                    events,
                    ...(Array.isArray(effects) && effects.length ? { effects: effects.map((effect, index) => parseMessageEffect(effect, `workflow:${id}.${stateId}.effects[${index}]`)) } : {}),
                };
            }
            const output = optionalString(raw, 'output', `workflow:${id}`);
            const workflow = {
                id,
                sourcePath,
                initial: requiredString(raw, 'initial', `workflow:${id}`),
                ...(output ? { output } : {}),
                states,
            };
            issues.push(...validateWorkflowStructure(workflow));
            workflows.set(id, workflow);
        }
        catch (error) {
            issues.push(`workflow:${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return workflows;
}
/**
 * v0.6 T001 (issue #497, frozen L2 A2/A7): closed-key structural parse of one
 * authoring-form Semantic Decision Declaration. Provider/model names, engine
 * state ids and Adaptive Region/Goal/Obligation/JIT material are
 * unrepresentable: any key outside the closed set fails closed here.
 */
function parseSemanticDecision(value, label) {
    const raw = asRecord(value, label);
    assertOnlyKeys(raw, [
        'decisionId',
        'inputSelection',
        'resultSchema',
        'allowedOutcomes',
        'allowedEventTypes',
        'queryCapabilities',
        'requiredProjections',
        'requiredRevisionSources',
        'cachePolicy',
        'promotedReference',
        'policy',
        'unavailable',
    ], label);
    const decisionId = requiredString(raw, 'decisionId', label);
    if (!SEMANTIC_DECISION_ID_PATTERN.test(decisionId)) {
        throw new Error(`${label}.decisionId must match ${SEMANTIC_DECISION_ID_PATTERN.source}`);
    }
    const path = (key) => `${label}.${key}`;
    const allowedOutcomes = raw.allowedOutcomes;
    if (!Array.isArray(allowedOutcomes) || allowedOutcomes.length === 0
        || !allowedOutcomes.every((entry) => typeof entry === 'string' && entry.length > 0)) {
        throw new Error(`${path('allowedOutcomes')} must be a non-empty array of non-empty strings (finite allowed decision outcomes)`);
    }
    if (new Set(allowedOutcomes).size !== allowedOutcomes.length) {
        throw new Error(`${path('allowedOutcomes')} must not contain duplicates`);
    }
    const allowedEventTypes = raw.allowedEventTypes;
    if (!Array.isArray(allowedEventTypes) || allowedEventTypes.length === 0
        || !allowedEventTypes.every((entry) => typeof entry === 'string' && entry.length > 0)) {
        throw new Error(`${path('allowedEventTypes')} must be a non-empty array of non-empty strings (finite allowed Domain Event types)`);
    }
    if (new Set(allowedEventTypes).size !== allowedEventTypes.length) {
        throw new Error(`${path('allowedEventTypes')} must not contain duplicates`);
    }
    const queryCapabilities = raw.queryCapabilities ?? [];
    if (!Array.isArray(queryCapabilities)
        || !queryCapabilities.every((entry) => typeof entry === 'string' && entry.length > 0)) {
        throw new Error(`${path('queryCapabilities')} must be an array of non-empty strings (query/read-only capability identities)`);
    }
    if (new Set(queryCapabilities).size !== queryCapabilities.length) {
        throw new Error(`${path('queryCapabilities')} must not contain duplicates`);
    }
    for (const key of ['requiredProjections', 'requiredRevisionSources']) {
        const value0 = raw[key];
        if (value0 === undefined)
            continue;
        if (!Array.isArray(value0) || !value0.every((entry) => typeof entry === 'string' && entry.length > 0)) {
            throw new Error(`${path(key)} must be an array of non-empty strings`);
        }
        if (new Set(value0).size !== value0.length) {
            throw new Error(`${path(key)} must not contain duplicates`);
        }
    }
    let cachePolicy;
    if (raw.cachePolicy !== undefined) {
        const policyRaw = asRecord(raw.cachePolicy, path('cachePolicy'));
        if (policyRaw.mode === 'eligible') {
            assertOnlyKeys(policyRaw, ['mode'], path('cachePolicy'));
            cachePolicy = { mode: 'eligible' };
        }
        else if (policyRaw.mode === 'bypass') {
            assertOnlyKeys(policyRaw, ['mode', 'reason'], path('cachePolicy'));
            if (typeof policyRaw.reason !== 'string' || !SEMANTIC_DECISION_CACHE_BYPASS_REASONS.has(policyRaw.reason)) {
                throw new Error(`${path('cachePolicy')}.reason must be one of the frozen resolver bypass reasons: ${[...SEMANTIC_DECISION_CACHE_BYPASS_REASONS].sort().join(', ')}`);
            }
            cachePolicy = { mode: 'bypass', reason: policyRaw.reason };
        }
        else {
            throw new Error(`${path('cachePolicy')}.mode must be 'eligible' or 'bypass'`);
        }
    }
    let promotedReference;
    if (raw.promotedReference !== undefined) {
        const promotedRaw = asRecord(raw.promotedReference, path('promotedReference'));
        if (promotedRaw.kind === 'version') {
            assertOnlyKeys(promotedRaw, ['kind', 'artifactId', 'version'], path('promotedReference'));
            promotedReference = {
                kind: 'version',
                artifactId: requiredString(promotedRaw, 'artifactId', path('promotedReference')),
                version: requiredString(promotedRaw, 'version', path('promotedReference')),
            };
        }
        else if (promotedRaw.kind === 'alias') {
            assertOnlyKeys(promotedRaw, ['kind', 'artifactId', 'alias'], path('promotedReference'));
            promotedReference = {
                kind: 'alias',
                artifactId: requiredString(promotedRaw, 'artifactId', path('promotedReference')),
                alias: requiredString(promotedRaw, 'alias', path('promotedReference')),
            };
        }
        else {
            throw new Error(`${path('promotedReference')}.kind must be 'version' or 'alias'`);
        }
    }
    const policyRaw = asRecord(raw.policy, path('policy'));
    assertOnlyKeys(policyRaw, ['maxSteps'], path('policy'));
    if (!Number.isInteger(policyRaw.maxSteps) || policyRaw.maxSteps <= 0) {
        throw new Error(`${path('policy')}.maxSteps must be a positive integer (bounded Harness policy)`);
    }
    const unavailableRaw = asRecord(raw.unavailable, path('unavailable'));
    let unavailable;
    if (unavailableRaw.kind === 'fail-closed') {
        assertOnlyKeys(unavailableRaw, ['kind'], path('unavailable'));
        unavailable = { kind: 'fail-closed' };
    }
    else if (unavailableRaw.kind === 'declared-event') {
        assertOnlyKeys(unavailableRaw, ['kind', 'eventType', 'outcome'], path('unavailable'));
        const eventType = requiredString(unavailableRaw, 'eventType', path('unavailable'));
        const outcome = requiredString(unavailableRaw, 'outcome', path('unavailable'));
        // A3: the declared unavailable fallback must use the declaration's own
        // finite vocabulary; an undeclared fallback can never be authored.
        if (!allowedEventTypes.includes(eventType)) {
            throw new Error(`${path('unavailable')}.eventType '${eventType}' is not in ${label}.allowedEventTypes`);
        }
        if (!allowedOutcomes.includes(outcome)) {
            throw new Error(`${path('unavailable')}.outcome '${outcome}' is not in ${label}.allowedOutcomes`);
        }
        unavailable = { kind: 'declared-event', eventType, outcome };
    }
    else {
        throw new Error(`${path('unavailable')}.kind must be 'fail-closed' or 'declared-event'`);
    }
    return {
        decisionId,
        inputSelection: requiredString(raw, 'inputSelection', label),
        resultSchemaPath: requiredString(raw, 'resultSchema', label),
        allowedOutcomes: [...allowedOutcomes],
        allowedEventTypes: [...allowedEventTypes],
        queryCapabilities: [...queryCapabilities],
        ...(raw.requiredProjections === undefined ? {} : { requiredProjections: [...raw.requiredProjections] }),
        ...(raw.requiredRevisionSources === undefined ? {} : { requiredRevisionSources: [...raw.requiredRevisionSources] }),
        ...(cachePolicy === undefined ? {} : { cachePolicy }),
        ...(promotedReference === undefined ? {} : { promotedReference }),
        policy: { maxSteps: policyRaw.maxSteps },
        unavailable,
    };
}
async function loadSemanticDecisions(root, schemas, ajv, issues) {
    const decisions = new Map();
    let decisionsDir;
    try {
        decisionsDir = await safeExistingPath(root, 'decisions');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return decisions;
        throw error;
    }
    const entries = (await readdir(decisionsDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && ['.yaml', '.yml'].includes(extname(entry.name)))
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        const sourcePath = await safeExistingPath(decisionsDir, entry.name);
        try {
            const declaration = parseSemanticDecision(await readYaml(sourcePath), `decision:${entry.name}`);
            const existing = decisions.get(declaration.decisionId);
            if (existing) {
                issues.push(`decision:${entry.name}: duplicate decisionId '${declaration.decisionId}' (also declared by another decision file)`);
                continue;
            }
            compileExpression(declaration.inputSelection, `decision:${declaration.decisionId}.inputSelection`, issues);
            const schema = await loadJsonSchema(await safeExistingPath(root, declaration.resultSchemaPath), `decision:${declaration.decisionId}:result:${declaration.resultSchemaPath}`, schemas, ajv, issues);
            if (!schema)
                continue;
            decisions.set(declaration.decisionId, declaration);
        }
        catch (error) {
            issues.push(`decision:${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return decisions;
}
export async function loadRawDomainPackage(options) {
    const root = await realpath(resolve(options.root));
    const issues = [];
    const manifestRaw = asRecord(await readYaml(await safeExistingPath(root, 'harness.yaml')), 'harness.yaml');
    assertOnlyKeys(manifestRaw, ['schemaVersion', 'id', 'limits'], 'harness.yaml');
    if (manifestRaw.schemaVersion !== '0.1')
        throw new RawPackageDefinitionError([`harness.yaml.schemaVersion must be '0.1'`]);
    const limits = asRecord(manifestRaw.limits, 'harness.yaml.limits');
    assertOnlyKeys(limits, ['maxSteps'], 'harness.yaml.limits');
    if (!Number.isInteger(limits.maxSteps) || limits.maxSteps <= 0)
        throw new RawPackageDefinitionError(['harness.yaml.limits.maxSteps must be a positive integer']);
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const schemas = new Map();
    const skills = await loadSkills(root, schemas, ajv, issues);
    const workflows = await loadWorkflows(root, issues);
    const semanticDecisions = await loadSemanticDecisions(root, schemas, ajv, issues);
    const scripts = new Map();
    const childDependencies = new Map();
    for (const workflow of workflows.values()) {
        const children = new Set();
        if (workflow.output)
            compileExpression(workflow.output, `${workflow.id}.output`, issues);
        for (const state of Object.values(workflow.states)) {
            if (state.invoke?.input)
                compileExpression(state.invoke.input, `${workflow.id}.${state.id}.invoke.input`, issues);
            if (state.invoke?.kind === 'expr' && state.invoke.expression)
                compileExpression(state.invoke.expression, `${workflow.id}.${state.id}.invoke.expr`, issues);
            for (const route of [...state.done, ...state.error, ...Object.values(state.events).flatMap((event) => event.routes)]) {
                if (route.when)
                    compileExpression(route.when, `${workflow.id}.${state.id}.route.when`, issues);
            }
            for (const [eventName, event] of Object.entries(state.events)) {
                if (event.schemaPath) {
                    const schema = await loadJsonSchema(await safeExistingPath(root, event.schemaPath), `event:${workflow.id}:${state.id}:${eventName}:${event.schemaPath}`, schemas, ajv, issues);
                    if (schema)
                        event.schema = schema;
                }
            }
            for (const [index, effect] of (state.effects ?? []).entries()) {
                compileExpression(effect.targetExpression, `${workflow.id}.${state.id}.effects[${index}].targetExpression`, issues);
                if (effect.payloadExpression)
                    compileExpression(effect.payloadExpression, `${workflow.id}.${state.id}.effects[${index}].payloadExpression`, issues);
                for (const [routeIndex, route] of (effect.rejected ?? []).entries()) {
                    if (route.when) {
                        compileExpression(route.when, `${workflow.id}.${state.id}.effects[${index}].rejected[${routeIndex}].when`, issues);
                    }
                }
            }
            const invoke = state.invoke;
            if (!invoke)
                continue;
            if (invoke.kind === 'skill' && invoke.ref && !skills.has(invoke.ref))
                issues.push(`${workflow.id}.${state.id}: referenced Skill '${invoke.ref}' does not exist or lacks a valid sidecar`);
            if (invoke.kind === 'tool' && invoke.ref && !options.registeredTools?.has(invoke.ref))
                issues.push(`${workflow.id}.${state.id}: referenced Tool '${invoke.ref}' is not registered`);
            if (invoke.kind === 'script' && invoke.ref) {
                try {
                    const scriptPath = await safeExistingPath(root, invoke.ref);
                    if (!(await stat(scriptPath)).isFile())
                        throw new Error('not a file');
                    const source = await readFile(scriptPath, 'utf8');
                    scripts.set(invoke.ref, source);
                    invoke.scriptSource = source;
                }
                catch (error) {
                    issues.push(`${workflow.id}.${state.id}: referenced Script '${invoke.ref}' cannot be loaded: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            if (invoke.kind === 'workflow' && invoke.ref)
                children.add(invoke.ref);
        }
        childDependencies.set(workflow.id, [...children].sort());
    }
    issues.push(...validateChildGraph(workflows, childDependencies));
    if (issues.length)
        throw new RawPackageDefinitionError(issues);
    return {
        root,
        schemaVersion: '0.1',
        domainId: requiredString(manifestRaw, 'id', 'harness.yaml'),
        limits: { maxSteps: limits.maxSteps },
        workflows,
        skills,
        scripts,
        schemas,
        childDependencies,
        semanticDecisions,
    };
}
