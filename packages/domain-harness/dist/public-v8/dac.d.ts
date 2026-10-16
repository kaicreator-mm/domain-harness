/**
 * v0.8 optional PORTABLE DAC fact-verifier SDK entry.
 *
 * Consumers may verify independently issued external DAC designation,
 * compatibility, intake, binding and activation facts. This module owns
 * NO issuer/signer, no authoritative selection or promotion, no Host trust
 * grant, no Kernel effects, and no automatic BUILD->DAC fact generator.
 *
 * Explicitly separated from the public /v8 microkernel facade so loading
 * a Domain App never imports the historical DAC verifier closure by default.
 * Named module namespaces avoid accidental cross-seam symbol collisions
 * (in particular AuthorityRefusalEvidence).
 */
export * as authority from '../dac-v0041/authority/index.js';
export * as compatibility from '../dac-v0041/compatibility/index.js';
export * as compositionIntake from '../dac-v0041/composition-intake/index.js';
export * as runtime from '../dac-v0041/runtime/index.js';
//# sourceMappingURL=dac.d.ts.map