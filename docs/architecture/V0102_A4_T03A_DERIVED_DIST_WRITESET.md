# DomainHarness v0.10.2 A4 — T03a generated dist write-set addendum

**Status: independent review pending.** Origin Issue #1352; affects T03a #1347 / PR #1350; additive only over independently adopted A3; pinned source `v0.10.2@eee1f2e07f519dec014586983ebb7bc857439095`. Product/L2/Freeze files remain unchanged.

## Real root cause
At PR #1350 HEAD `b20f1abf2cadee3fbd5cefebe93fe8389377ddea` a separate Node24.21.0 Build Host ran `npm ci`, Host typecheck and Host build with EXIT=0; all three targeted test files reported 6/6 PASS with EXIT=0. The existing committed-dist guard then returned EXIT=1, as Host TS emitted six untracked distributable `.js` and `.d.ts` files. `packages/host-node/dist/**` is a tracked distribution tree, while A3 authorized only 3 source files and 3 tests. A same-SHA CI retry cannot change this deterministic state.

## Sole new permissions
After independent A4 PASS and merge, T03a #1347 is authorized to add exactly these generated artifacts as mechanically source-paired BUILD output:
- `packages/host-node/dist/sqlite-cas.js`
- `packages/host-node/dist/sqlite-cas.d.ts`
- `packages/host-node/dist/scoped-memory.js`
- `packages/host-node/dist/scoped-memory.d.ts`
- `packages/host-node/dist/durable-controls.js`
- `packages/host-node/dist/durable-controls.d.ts`

These six are added to the existing exact A3 6-file write set, giving **12 exact paths**. No tsconfig/manifest/lock/gitignore/index, compiler, K/S payload, frozen Product/L2, BUILD tooling, other Host module or wire ABI may be changed. This is not authority to add `.map` files or other generated outputs; if the real build requires extras, halt for amendment instead of silently writing them. Source-generated and committed-dist byte match is mandatory; no manually fabricated JS or `.d.ts`.

## DAG and ownership
T03a still depends on closed+merged T00 and unlocks T03b. T03b retains SQLite/native adapter/Host integration. T07b retains exclusive **manifest/export/CI/distribution packaging** ownership; it must not overwrite these source-paired artifacts except during a separately controlled verified integration. T05 remains parallel, disjoint. Frozen Task DAG implementation node count remains **18**; this A4 document/governance issue is not a new implementation node.

## Acceptance and negative gates
1. Independent exact-HEAD doc review confirms non-overlap, exact six dist names and no altered original task scope; P0/P1/P2; `A4_FREEZE_READY=YES`, `T03A_DIST_WRITESET_GRANTED=YES`.
2. Once adopted, Builder on existing PR #1350 reruns Node24 Host build and commits only the six genuine emitted dist companion files; exact SHA, file list and real command exit receipts are recorded.
3. Existing committed-dist guard and relevant Host scoped tests PASS, CI original deterministic red is preserved; if subsequent CI first fails for unrelated transient reasons, apply approved ADS CI retry-first once same SHA, but do not use retry to bypass committed-dist.
4. Dist provenance check, independent source review and version-branch merge precede T03a closure. No main merge until R01.

### Evidence
- [PR #1350 local Node24 receipt](https://github.com/kaicreator-mm/domain-harness/pull/1350#issuecomment-6383998029)
- [T03a Issue #1347](https://github.com/kaicreator-mm/domain-harness/issues/1347)
- [A3 adoption #1345](https://github.com/kaicreator-mm/domain-harness/issues/1345)
- [A2 T00 derived-dist precedent #1341](https://github.com/kaicreator-mm/domain-harness/issues/1341)
