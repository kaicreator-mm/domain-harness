// Additive portable v0.7 successor public surface (fine-grained DAG #534
// T001E). Composition-only: every name comes from an already-reviewed leaf
// module; leaf modules are never edited to fit the center. No historical
// v0.2/v0.3/v0.4 semantics are edited, relabeled or re-exported through it;
// later v0.7 concerns extend it additively through their own leaf modules.
export * from '../contracts/component.js';
export * from '../contracts/component-digest.js';
export * from '../contracts/definition-graph.js';
export * from '../contracts/component-admission.js';
export * from '../contracts/tool-component.js';
// Shared foundation types required to call the v0.7 digest APIs (same
// declarations already public via the v0.2 surface; re-exported so the
// successor entry is self-contained).
export type { ContentDigest, Sha256Port } from '../contracts/identity.js';
