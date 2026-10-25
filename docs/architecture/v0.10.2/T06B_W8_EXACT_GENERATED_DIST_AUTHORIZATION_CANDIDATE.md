# DomainHarness v0.10.2 — T06b W8 exact generated-dist writer amendment

**PROSPECTIVE CANDIDATE ONLY. No retroactive authorization, no source code permission, no release PASS.**
Version-only baseline: `247524b64732ecaafe3091d90025a66a52e8f754`. Target T06b Issue #1326 / PR #1371, source HEAD `606659ae407f27de44886b2340e2c591ad15e3c6`. Frozen L2 §12 permits Microkernel and Host `src,tests` and two new root tests, but not compiler-generated `dist`; prior A3 W6 #1365 and W7 #1368 required exact prospective JS/d.ts permission.

## Exactly eight Node24 TypeScript emitted output paths

| Already authorized T06b TypeScript source | Emitted JS | Emitted declaration |
| --- | --- | --- |
| `packages/microkernel/src/domain-app.ts` | `packages/microkernel/dist/domain-app.js` | `packages/microkernel/dist/domain-app.d.ts` |
| `packages/microkernel/src/internal/activation.ts` | `packages/microkernel/dist/internal/activation.js` | `packages/microkernel/dist/internal/activation.d.ts` |
| `packages/microkernel/src/internal/subscription-runtime.ts` (NEW) | `packages/microkernel/dist/internal/subscription-runtime.js` | `packages/microkernel/dist/internal/subscription-runtime.d.ts` |
| `packages/host-node/src/deployment.ts` | `packages/host-node/dist/deployment.js` | `packages/host-node/dist/deployment.d.ts` |

Exactly FOUR source stems and EIGHT derived output files. No wildcard write grant. Actual Node24 tsc with src rootDir, dist outDir and declarations, no hand-authored dist. The T06b writer may re-emit these exact files only AFTER independent exact-SHA W8 PASS and adoption into the v0.10.2 branch; previously pushed code/output is not approved retroactively. Re-pin source and stage approved exact paths on fresh version branch before final Task review.

## Existing write-set boundaries unchanged

- Allowed original source: `packages/microkernel/src/{domain-app.ts,internal/activation.ts,internal/subscription-runtime.ts}` and `packages/host-node/src/deployment.ts`; related Microkernel/Host tests, including existing `packages/host-node/tests/host-activation-reachability.test.ts`.
- Original two new integration tests: `tests/assembly/v010-subscribe-stop.test.ts` and `tests/hosts/node/v010-t08-governed-subscribe.test.ts`.
- HARD READ-ONLY: T06a `packages/microkernel/src/subscription-projection.ts` and test and `dist/subscription-projection.{js,d.ts}`; T03a Host CAS/memory/durable foundations; K/S/Business/Capability payload; BUILD; Contracts; manifests/lock/tsconfigs/CI/catalog; legacy code; all other dist files.

## Independent T06b P1 remains BLOCK regardless of W8

PR #1371 exact `606659ae` fails a source-level authorization race: pump authorize returns true, but a later readAuthorizedSnapshot performs a second query/authorization that can deny after revocation, whose catch merely drops snapshot and delivers the event metadata with stale authorized:true. This violates L2 §8(ii) N3. Repair ONLY T06b's already approved source/test and these paired generated files, with deterministic later-authorization denial/reject and permanent-unsubscribe negative. W8 docs approval cannot certify that fix; new real Node24 scoped tests/typecheck/build/committed-dist and independent exact-SHA code review required.

## Acceptance

Independent reviewer verifies four source stems, eight exact dist paths, actual Node24 TS emit pairing, no changes to T06a and T03a, no overlap with A8b or T11, and no Code/Release PASS inferred. Return P0/P1/P2, W8_GENERATED_WRITESET_READY, MERGE_ELIGIBLE_DOC_VERSION_ONLY. If PASS, merge docs only to v0.10.2. Source PR remains blocked until P1 fixed, version re-pinned, physically checked, reviewed. No main merge and no additional Task DAG node.
