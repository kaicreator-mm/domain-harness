/**
 * Invoke kinds executable by the portable engine at `executionEngineMajor` 2.
 * One authoritative matrix shared by producer and consumer (issue #167):
 * the compiler refuses to emit any other kind, activation rejects it
 * (corrupt-package fail-closed), and the runtime IR decoder accepts exactly
 * this set. Legacy `script` invokes must be translated at build time into
 * synthetic Script Domain Tools (L2 §18.1 / T-021); child `workflow` invokes
 * must be modeled as durable Domain Message effects.
 */
export const SUPPORTED_COMPILED_INVOKE_KINDS_V2 = ['expr', 'tool', 'skill'];
//# sourceMappingURL=package.js.map