/**
 * #1006 R5 HF29 — Host-owned approved Tool Call dispatch port.
 * ===========================================================================
 *
 * The Host-side execution seam for BUILD-approved local/HTTP JSON Tool Call
 * bindings of a registered Domain App closure. It reuses the closed-world
 * discipline of the frozen tool contracts (`src/tool/host-local-contract`,
 * `src/tool/remote-contract`): a sealed tool binding, a Host-provided
 * adapter pinned to the exact bound digest, capability allowlisting and
 * exact JSON Schema checks on both edges — now exposed as one typed,
 * authenticated gateway verb instead of the legacy in-process executor.
 *
 * What deliberately does NOT live here:
 *   - concrete tool implementations — they stay in the Host governance
 *     configuration (explicitly provided adapters, e.g. a local closure over
 *     SQLite or an injected network-free HTTP transport fake). The
 *     microkernel never receives one;
 *   - a second approval service — the approved binding is the SEALED
 *     capability `TOOLS` ABI of the qualified closure (module bytes digested
 *     into the closure identity, externally approved, durably pinned by
 *     registerApp). This port only re-checks that pinned truth;
 *   - any default network, module import or fallback transport — an adapter
 *     that was not explicitly registered never runs, and a binding whose
 *     sealed kind is outside the frozen approved transport family (e.g.
 *     script, which the selected v0.8 approved target profile does not
 *     include) refuses typed BEFORE any effect.
 *
 * Every check below runs before the adapter executes; a refusal leaves the
 * adapter untouched and produces zero Kernel/physical activity.
 */
import { HostBoundaryError } from './errors.js';
import { SchemaValidator } from '../execution/schema-validator.js';
import { ExecutorError } from '../execution/executor-error.js';
/**
 * Descriptor-safe plain-JSON gate (the same discipline the OperationCall
 * boundary enforces): hostile ACCESSORS are refused WITHOUT invocation, so
 * a caller-supplied or adapter-returned object can never run code inside
 * the validation walk. Dangerous own keys and non-plain prototypes refuse
 * alike; the walk is depth-bounded.
 */
function assertPlainJsonData(value, path, code, depth = 0) {
    if (depth > 32) {
        throw new HostBoundaryError(code, `${path} exceeds the Tool Call JSON depth bound`);
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new HostBoundaryError(code, `${path} carries a non-finite number`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertPlainJsonData(item, `${path}[${index}]`, code, depth + 1));
        return;
    }
    if (typeof value !== 'object') {
        throw new HostBoundaryError(code, `${path} carries unsupported ${typeof value}`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new HostBoundaryError(code, `${path} must be a plain JSON object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Object.keys(descriptors)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new HostBoundaryError(code, `${path}.${key} is a dangerous own key`);
        }
        const descriptor = descriptors[key];
        if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
            throw new HostBoundaryError(code, `${path}.${key} is not an own enumerable data slot (accessors are refused)`);
        }
        assertPlainJsonData(descriptor.value, `${path}.${key}`, code, depth + 1);
    }
    if (Reflect.ownKeys(descriptors).length !== Object.keys(descriptors).length) {
        throw new HostBoundaryError(code, `${path} has non-enumerable own keys`);
    }
}
/** Local transport kind (the frozen host-local tool contract family). */
export const HOST_TOOL_CALL_TRANSPORT_LOCAL = 'host-local-domain-tool@1';
/** Remote HTTP/JSON transport kind (the frozen remote tool contract family). */
export const HOST_TOOL_CALL_TRANSPORT_REMOTE_HTTP_JSON = 'remote-http-json@1';
/**
 * The frozen approved transport family of the selected v0.8 Host target
 * profile. Script-style transports are NOT in the approved profile: a sealed
 * script binding refuses typed at dispatch (it is never silently routed
 * through another transport).
 */
export const HOST_TOOL_CALL_APPROVED_TRANSPORTS = new Set([
    HOST_TOOL_CALL_TRANSPORT_LOCAL,
    HOST_TOOL_CALL_TRANSPORT_REMOTE_HTTP_JSON,
]);
/**
 * Bounded output: a Tool Call result whose canonical JSON encoding exceeds
 * this byte budget refuses typed — no unbounded Host adapter output ever
 * crosses the boundary.
 */
export const HOST_TOOL_CALL_MAX_OUTPUT_BYTES = 256 * 1024;
/**
 * Registration-time shape gate for the adapter map (registerApp input).
 * Digest/capability/transport agreement with the SEALED binding is enforced
 * per call below — the Host may register adapters for bindings a closure
 * does not seal; they simply never dispatch.
 */
export function validateHostToolCallAdapters(adapters) {
    if (typeof adapters !== 'object' || adapters === null || Array.isArray(adapters)) {
        throw new HostBoundaryError('GATEWAY_APP_MALFORMED', 'registerApp toolCallAdapters, when present, must be a plain record of bindingId → adapter');
    }
    for (const [bindingId, adapter] of Object.entries(adapters)) {
        if (typeof adapter !== 'object' || adapter === null) {
            throw new HostBoundaryError('GATEWAY_APP_MALFORMED', `toolCallAdapters['${bindingId}'] must be a plain adapter record`);
        }
        const record = adapter;
        if (typeof record.transport !== 'string' || record.transport.length === 0) {
            throw new HostBoundaryError('GATEWAY_APP_MALFORMED', `toolCallAdapters['${bindingId}'].transport must be a non-empty string`);
        }
        if (typeof record.capability !== 'string' || record.capability.length === 0) {
            throw new HostBoundaryError('GATEWAY_APP_MALFORMED', `toolCallAdapters['${bindingId}'].capability must be a non-empty string`);
        }
        if (typeof record.digest !== 'string' || record.digest.length === 0) {
            throw new HostBoundaryError('GATEWAY_APP_MALFORMED', `toolCallAdapters['${bindingId}'].digest must be a non-empty string`);
        }
        if (typeof record.execute !== 'function') {
            throw new HostBoundaryError('GATEWAY_APP_MALFORMED', `toolCallAdapters['${bindingId}'].execute must be a function`);
        }
    }
}
/**
 * Execute ONE sealed Tool Call binding through its explicitly provided Host
 * adapter. Check order (all before any adapter activity):
 *   1. effect class — only inert JSON tool calls dispatch here; effectful
 *      tool bindings refuse typed (the sealed central occurrence path owns
 *      every effect admission);
 *   2. sealed transport family — kinds outside the frozen approved profile
 *      (script, unknown) refuse;
 *   3. protected Host implementation — the adapter registered under the
 *      exact sealed bindingId (no cross-binding fallback);
 *   4. transport agreement — the adapter serves exactly the sealed kind,
 *      never a substitute transport;
 *   5. capability authorization — every sealed required capability is
 *      provided by the Host, and the bound adapter's capability is one the
 *      sealed tool declares;
 *   6. bound digest — the adapter digest equals the sealed binding digest;
 *   7. exact input JSON Schema;
 * and after the adapter runs, the exact output JSON Schema plus the bounded
 * output budget. Every refusal is typed and side-effect free.
 */
export async function dispatchHostToolCall(input) {
    const { sealed, adapters, validator } = input;
    // 1. Effectful tool bindings never dispatch through this port.
    if (sealed.effectClass !== 'none') {
        throw new HostBoundaryError('HOST_TOOL_EFFECT_REFUSED', `tool ${sealed.toolId} is sealed effectClass '${sealed.effectClass}'; effectful tool work belongs to the sealed central occurrence path, never to an inert Host Tool Call`);
    }
    // 2. The frozen approved transport family (script etc. refuse here).
    if (!HOST_TOOL_CALL_APPROVED_TRANSPORTS.has(sealed.bindingKind)) {
        throw new HostBoundaryError('HOST_TOOL_TRANSPORT_UNAPPROVED', `tool ${sealed.toolId} binding kind '${sealed.bindingKind}' is not in the frozen approved transport family of the selected Host target profile [${[...HOST_TOOL_CALL_APPROVED_TRANSPORTS].join(', ')}]; there is no fallback transport`);
    }
    // 3. The protected Host implementation for the exact sealed binding.
    const adapter = adapters[sealed.bindingId];
    if (adapter === undefined) {
        throw new HostBoundaryError('HOST_TOOL_ADAPTER_MISSING', `tool ${sealed.toolId} has no Host adapter registered for sealed binding '${sealed.bindingId}'; a Tool Call never executes without an explicitly provided protected Host implementation`);
    }
    // 4. Transport agreement — no substitute transport for a sealed kind.
    if (adapter.transport !== sealed.bindingKind) {
        throw new HostBoundaryError('HOST_TOOL_TRANSPORT_MISMATCH', `the Host adapter for binding '${sealed.bindingId}' serves transport '${adapter.transport}' but tool ${sealed.toolId} is sealed '${sealed.bindingKind}'; there is no fallback between transports`);
    }
    // 5. Capability authorization, both directions:
    //    every sealed required capability must be provided by the Host at
    //    large, and the bound adapter's own capability must be one the sealed
    //    tool declares (an undeclared capability can never execute it).
    const provided = new Set(Object.values(adapters).map((candidate) => candidate.capability));
    const missing = sealed.requiredCapabilities.filter((capability) => !provided.has(capability));
    if (missing.length > 0) {
        throw new HostBoundaryError('HOST_TOOL_CAPABILITY_MISSING', `tool ${sealed.toolId} requires host capabilities with no provided adapter: ${missing.join(', ')}`);
    }
    if (!sealed.requiredCapabilities.includes(adapter.capability)) {
        throw new HostBoundaryError('HOST_TOOL_CAPABILITY_NOT_ALLOWED', `the Host adapter for binding '${sealed.bindingId}' provides capability '${adapter.capability}' which sealed tool ${sealed.toolId} does not declare; an undeclared capability never executes a Tool Call`);
    }
    // 6. The bound digest — a stale or wrong adapter refuses before it runs.
    if (adapter.digest !== sealed.bindingDigest) {
        throw new HostBoundaryError('HOST_TOOL_BINDING_DIGEST_MISMATCH', `the Host adapter for binding '${sealed.bindingId}' (digest ${adapter.digest}) does not match the sealed binding digest of tool ${sealed.toolId} (${sealed.bindingDigest}); a stale or replaced adapter implementation refuses typed`);
    }
    // 7. Exact input JSON Schema check (the plain-data walk already refused
    //    hostile accessors without invoking them).
    const toolInput = input.toolInput === undefined ? null : input.toolInput;
    assertPlainJsonData(toolInput, '$toolCall.input', 'HOST_TOOL_INPUT_INVALID');
    let jsonInput;
    try {
        jsonInput = validator.validate(sealed.inputSchema, toolInput, 'invalid_input', `tool ${sealed.toolId} input`);
    }
    catch (error) {
        if (error instanceof ExecutorError) {
            throw new HostBoundaryError('HOST_TOOL_INPUT_INVALID', error.message);
        }
        throw error;
    }
    // The only effect: the explicitly provided adapter runs exactly once.
    let output;
    try {
        output = await adapter.execute(jsonInput);
    }
    catch (error) {
        throw new HostBoundaryError('HOST_TOOL_ADAPTER_FAILED', `the Host adapter for binding '${sealed.bindingId}' (tool ${sealed.toolId}) failed: ${String(error?.message ?? error)}`);
    }
    // Exact output JSON Schema check (plain-data walk first — an adapter can
    // never smuggle accessors past the boundary), then the bounded budget.
    assertPlainJsonData(output, '$toolCall.output', 'HOST_TOOL_OUTPUT_INVALID');
    let jsonOutput;
    try {
        jsonOutput = validator.validate(sealed.outputSchema, output, 'invalid_output', `tool ${sealed.toolId} output`);
    }
    catch (error) {
        if (error instanceof ExecutorError) {
            throw new HostBoundaryError('HOST_TOOL_OUTPUT_INVALID', error.message);
        }
        throw error;
    }
    const encoded = JSON.stringify(jsonOutput);
    if (encoded.length > HOST_TOOL_CALL_MAX_OUTPUT_BYTES) {
        throw new HostBoundaryError('HOST_TOOL_OUTPUT_UNBOUNDED', `tool ${sealed.toolId} produced ${encoded.length} bytes of output, beyond the ${HOST_TOOL_CALL_MAX_OUTPUT_BYTES}-byte Tool Call budget; unbounded output never crosses the Host boundary`);
    }
    return jsonOutput;
}
//# sourceMappingURL=tool-call-port.js.map