/**
 * DomainHarness v0.11.0 T02 (#1576) — canonical v011 BUILD entry
 * (`@kaicreator/domain-harness-build` v011 face; the package-root `.` stays
 * the legacy buildV10App face until the T04 integration wires the exports
 * flip, L2 §8.3).
 *
 * Export face: `buildV011App`, the BUILD-owned input/result types, and the
 * small deterministic helpers downstream tasks (T03/T05) need to re-verify
 * Lock facts without re-running BUILD.
 */
export { buildV011App } from './build.js';
export { V011BuildRefusal } from './refusal.js';
export { digestOfBytes } from './resources.js';
