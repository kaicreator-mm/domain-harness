/** v0.10.3 T-C: selected capability operation only; not an alternate Kernel.
 * The handler settles ONE K external-effect phase envelope: an awaited Host
 * result becomes a terminal ok envelope carrying the neutral DTO, and a Host
 * UNKNOWN outcome throws a typed sanitized error so the existing K
 * fence/Journal owns UNKNOWN — never a forged settled terminal success. */
export const MODULE_ID = 'capability-llm-anthropic-messages';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const CAPABILITY_ID = 'llm.anthropic';
export const EXTERNAL_EFFECT = true;
export const ENDPOINTS = Object.freeze([{ endpointId: 'capability:llm.anthropic', kind: 'capability-endpoint' }]);
export const HANDLERS = Object.freeze([{ operationId: 'llm.anthropic.generate', handler: 'generate' }]);
/**
 * R wires a trusted Host-only immutable adapter before loading the selected C.
 * That adapter owns keys, model/endpoint allowlist, contracts and physical I/O.
 * This sealed C neither accepts a credential nor executes a Tool proposal.
 * A K external-effect permit is required by the selected BUILD route before
 * the caller can invoke this declared handler; direct JS imports are not grants.
 * The K external-effect dispatch passes (payload, dispatchContext); only the
 * payload record is this operation's input.
 */
export async function generate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('ANTHROPIC_INPUT_REFUSED');
  const slot = Object.getOwnPropertyDescriptor(globalThis, '__dhV0103AnthropicHostGenerate');
  if (!slot || typeof slot.value !== 'function' || slot.writable !== false || slot.configurable !== false)
    throw new TypeError('ANTHROPIC_TRUSTED_HOST_UNAVAILABLE');
  const result = await slot.value(input);
  const record = result !== null && typeof result === 'object' && !Array.isArray(result) ? result : null;
  if (record !== null && record.status === 'unknown') {
    // The physical send may or may not have settled remotely: the K Journal
    // and admission fence own this UNKNOWN, so no envelope is returned.
    const error = new Error('Anthropic external outcome requires reconciliation');
    error.code = 'ANTHROPIC_OUTCOME_UNKNOWN';
    throw error;
  }
  const requestId = record !== null && typeof record.requestId === 'string' && record.requestId.length > 0
    ? record.requestId : 'invalid-result';
  const externalRef = record !== null && typeof record.providerRequestId === 'string' &&
      record.providerRequestId.length > 0
    ? record.providerRequestId : `local-correlation:${requestId}`;
  return { phase: 'terminal', externalRef, outcome: { ok: true, output: result } };
}
