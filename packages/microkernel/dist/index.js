/**
 * DomainHarness v0.10.2 — the public Microkernel SDK entry.
 * =====================================================================
 *
 * One frozen consumer surface over the selected Domain App (L2 §3):
 *
 *   - `load(app, options)` — activate a TRUSTED prebuilt App
 *     (`V10BuiltApp` plain data produced by the canonical BUILD package;
 *     the Microkernel never imports BUILD, not even type-only) and receive
 *     the frozen `{ send, query, subscribe, stop }` facade;
 *   - the typed error identities of Contracts (`V10Error`, `V10BuildError`,
 *     `V10ActivationError`, `V10ExternalEffectError`) plus the two runtime
 *     families owned here (`V10PortDeniedError`, `V10MultiBQueryError`).
 *
 * Host bootstrap code uses the separately exported `./host-seam` subpath
 * (an API-hygiene boundary, not a protection). No K State/Admission/
 * Journal/Effect is implemented here — the kernel owns those; the effect
 * gate consumes the K-owned read-only authority view.
 */
export { load } from './domain-app.js';
export { V10PortDeniedError } from './internal/activation.js';
export { V10MultiBQueryError } from './internal/multib-query.js';
export { V10Error, V10BuildError, V10ActivationError, V10ExternalEffectError, } from '@kaicreator/domain-harness-contracts';
