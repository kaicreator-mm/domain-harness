/** v0.10.3 T-C: selected capability operation only; not an alternate Kernel. */
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
 */
export async function generate(input) {
  if (arguments.length !== 1 || input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('ANTHROPIC_INPUT_REFUSED');
  const slot = Object.getOwnPropertyDescriptor(globalThis, '__dhV0103AnthropicHostGenerate');
  if (!slot || typeof slot.value !== 'function' || slot.writable !== false || slot.configurable !== false)
    throw new TypeError('ANTHROPIC_TRUSTED_HOST_UNAVAILABLE');
  return slot.value(input);
}
