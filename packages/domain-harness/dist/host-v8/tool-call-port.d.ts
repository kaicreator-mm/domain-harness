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
import { SchemaValidator } from '../execution/schema-validator.js';
import type { JsonValue } from '../contracts/json.js';
import type { V8SealedToolBinding } from '../public-v8/microkernel.js';
/**
 * The bounded plain-JSON array size: an array carrying more elements than
 * this refuses typed before any element is inspected.
 */
export declare const HOST_TOOL_CALL_MAX_JSON_ARRAY_LENGTH = 65536;
/** Local transport kind (the frozen host-local tool contract family). */
export declare const HOST_TOOL_CALL_TRANSPORT_LOCAL: "host-local-domain-tool@1";
/** Remote HTTP/JSON transport kind (the frozen remote tool contract family). */
export declare const HOST_TOOL_CALL_TRANSPORT_REMOTE_HTTP_JSON: "remote-http-json@1";
/**
 * The frozen approved transport family of the selected v0.8 Host target
 * profile. Script-style transports are NOT in the approved profile: a sealed
 * script binding refuses typed at dispatch (it is never silently routed
 * through another transport).
 */
export declare const HOST_TOOL_CALL_APPROVED_TRANSPORTS: ReadonlySet<string>;
/**
 * Bounded output: a Tool Call result whose canonical JSON encoding exceeds
 * this UTF-8 byte budget refuses typed — no unbounded Host adapter output
 * ever crosses the boundary. The budget counts true UTF-8 BYTES of the
 * encoded JSON (Review #5542905557 P2), never the UTF-16 code-unit count of
 * the in-memory string: multibyte emoji/CJK results are byte-accurate here.
 */
export declare const HOST_TOOL_CALL_MAX_OUTPUT_BYTES: number;
/**
 * One explicitly provided Host adapter for a sealed Tool Call binding.
 * `capability` is checked against the sealed tool's declared required
 * capabilities (an adapter holding an undeclared capability is refused);
 * `digest` must equal the sealed binding digest — a stale or wrong digest
 * refuses before the adapter runs. `execute` closes over the Host-owned
 * implementation (local resources, an injected HTTP transport fake, …) and
 * is the ONLY thing that ever executes a Tool Call.
 */
export interface HostToolCallAdapter {
    /** The transport family this adapter serves; must equal the sealed kind. */
    readonly transport: string;
    /** The Host capability this adapter provides for the sealed tool. */
    readonly capability: string;
    /** The exact binding artifact digest this adapter was built against. */
    readonly digest: string;
    execute(input: JsonValue): Promise<JsonValue>;
}
/** Host governance input: sealed bindingId → explicitly provided adapter. */
export type HostToolCallAdapters = Readonly<Record<string, HostToolCallAdapter>>;
/**
 * Registration-time shape gate for the adapter map (registerApp input).
 * Digest/capability/transport agreement with the SEALED binding is enforced
 * per call below — the Host may register adapters for bindings a closure
 * does not seal; they simply never dispatch.
 */
export declare function validateHostToolCallAdapters(adapters: unknown): asserts adapters is HostToolCallAdapters;
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
export declare function dispatchHostToolCall(input: {
    readonly sealed: V8SealedToolBinding;
    readonly adapters: HostToolCallAdapters;
    readonly validator: SchemaValidator;
    readonly toolInput: unknown;
}): Promise<JsonValue>;
//# sourceMappingURL=tool-call-port.d.ts.map