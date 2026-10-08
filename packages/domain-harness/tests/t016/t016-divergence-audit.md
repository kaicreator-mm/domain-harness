# T016 — Divergence Audit (main vs version/v0.7)

Gate: `#943` (PACK-E T016). Contract: `#733`. Controller: `#537` / plan `#589`.
Audit time: 2026-10-08 (qualification run). All refs read LIVE via `gh api` / direct
GitHub fetch (`https://github.com/kaicreator-mm/domain-harness.git`); the local
mirror origin was not trusted for currentness.

```text
AUDIT_LIVE_MAIN=535fd267a804e3c65c84718b3e55a527172721ac
AUDIT_LIVE_VERSION_V0_7=86110c616b8cb18c730553e4cdab7ef555214521 (tree dd4e4596d02be7012468a475db8f6fcc6c756542)
COMPARE=gh api repos/kaicreator-mm/domain-harness/compare/version/v0.7...main -> status=diverged, ahead_by=27, behind_by=256
MERGE_BASE=040c3ff244da28f6253fb9c179c66b730caae4cd
MAIN_ONLY_COMMITS=27 (v0.6 release lane: v0.6 PRD/L2/DAG freeze docs, v0.6 T001-T010 runtime/compiler/expo/node changes, CI verify-redundancy cut 341101b, stray 5cee6a00 "x" + revert dadd4e60, governance successor record 823797bd, v0.6 release merge PR #699)
METHOD=git diff --name-status <v0.7> <main> -> 427 path deltas; for every path, both-side blob IDs computed; main blobs membership-tested against the full v0.7 reachable object set (git rev-list --objects; 9,660 objects); BASE-EQUAL tested against 040c3ff:<path>
```

## Classification

Every main-only file delta (path present in main's tree, 121 paths: 51 additions
main-side, 70 modifications) classified:

### (b) genuinely-absent docs/governance — CARRIED into the v0.7 lane (8 paths)

| Path | Main blob | Evidence |
|---|---|---|
| `docs/product/DomainHarness_v0.6_PRD_REVIEW_CANDIDATE.md` | `827eded678238e6a25972e5fa778cbd4e1ec0983` | absent from v0.7 object set |
| `docs/product/DomainHarness_v0.6_PRODUCT_FREEZE.md` | `877cb60a6482d362cbe62895d61ee8d8b7cc3611` | absent from v0.7 object set |
| `docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md` | `97d68e14b0dc0eca82d38e953beb48ca2e3ca2e5` | absent from v0.7 object set |
| `docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_COMPLETENESS_ADDENDUM.md` | `b6cebcb4fc8cdbaac3c7b0047e5b669e45c7ef11` | absent from v0.7 object set |
| `docs/architecture/DomainHarness_v0.6_L2_FREEZE.md` | `1fcba333e0e9c23eb2d0561b89111106d50aacc3` | absent from v0.7 object set |
| `docs/implementation/DomainHarness_v0.6_TASK_DAG.md` | `151098c965ee96c63fd9a3fb6efbcf02e4b5f362` | absent from v0.7 object set |
| `.dev-standard/PROJECT_OVERRIDES.md` (v0.6 governance record) | `25b0e002d724afa80ab373f903dc76c9fa8a177c` | absent from v0.7 object set; landed on main as `823797bd74186736459ea3bb7a75f9269ab931f0` — cherry-picked into the lane |
| `README.md` (v0.6 currentness line) | `9dd685b42e4b2bd2e8fb7828a4151c440e63d70f` | absent from v0.7 object set; folded into the v0.7 successor record |

Disposition: cherry-pick `823797bd` (clean, provenance preserved) + blob-identical
carry of the 6 freeze docs from `main@535fd26` (commit `5260c5e`, per-file blob
SHAs recorded in its message) + v0.7 successor governance record (commit `9bad635`,
following the `823797bd` convention).

### (a) v0.6-era content byte-present in v0.7 via T000 recovery — VERIFIED (7 paths)

Main's post-merge-base change committed byte-identically inside the v0.7 lane's
history (blob reachable from `gh-v07` AND different from the merge-base blob → a
genuine v0.6-side change that the v0.7 lane recovered; v0.7's CURRENT tree has
since evolved past every one of these blobs — recovery, then supersession in-tree):

| Path | Main blob | Recovery evidence |
|---|---|---|
| `packages/domain-harness-compiler/src/index.ts` | `d0357fe22d28e78112159dc1a212b9d709e6dd48` | v0.6 T001-R1 declaration-digest repair recovered by the T000 lane |
| `packages/domain-harness-compiler/dist/index.js` | `0943f9337f14a6097b8a9db836f8e5c17c438b3c` | same recovery (committed dist at the recovery commit) |
| `packages/domain-harness-compiler/dist/index.d.ts` | `a5e3467891fb8ffa52907daf240d95e39a3a21c7` | same recovery |
| `tests/hosts/t009-expo-devicehost/index.ts` | `5fd059fd067464cb23bb01b09db1891b15520310` | v0.6 T009 Expo device tooling recovered into the v0.7 lane |
| `tests/hosts/t009-expo-devicehost/device-sha256.ts` | `b5d12f83c3fb66cda5fcc7500dc60a26572621cf` | same recovery |
| `tests/hosts/t009-expo-devicehost/.gitignore` | `0806c6cb0d59d6e4ae70ff77aefd0712dec5a0bf` | same recovery |
| `packages/domain-harness/src/governance/execution-binding.ts` family cross-check | — | v0.6 T004 governance integration content reachable in v0.7 history (`74505570d101…` present at `packages/domain-harness/src/governance/index.ts` line; see BASE-EQUAL note below) |

### (c) v0.7-superseded — NOT carried (106 paths)

| Sub-class | Count | Paths (representative) | Evidence |
|---|---|---|---|
| (c1) main never changed the file vs merge-base; the M-status is purely v0.7-side evolution | 16 | `packages/domain-harness/src/index.ts` (`db25aadf…` == base), `src/governance/index.ts` (`74505570…` == base), `dist/index.js`, `dist/governance/*`, `scripts/check-committed-dist.mjs`, `packages/domain-harness-compiler/tests/public-consumer.test.ts` | `040c3ff:<path>` blob equals main blob |
| (c2) v0.6-era runtime/compiler/expo/node changes restructured into the v0.7 microkernel layout | ~62 | `packages/domain-harness/src/observation/decision-receipt.ts` (v0.6 T006 receipt; v0.7 re-homes receipt semantics in `src/admission/*` + `src/control/*` — `git grep -il receipt gh-v07 -- packages/domain-harness/src` hits `admission/admission.ts`, `admission/contracts.ts`, `control/contracts.ts`, `control/coordinator.ts`), `src/runtime/decision-resolver-binding.ts`, `src/runtime/runtime-v3-errors.ts`, `src/runtime/create-domain-runtime*.ts`, `src/observation/contracts.ts`, `src/public-v3/index.ts`, `src/decision-resolver/contracts.ts`, committed `dist/**`, `packages/domain-harness-node/src/store/node-sqlite-runtime-store.ts` (v0.6 T008-R1 receipt seam; v0.7 store evolved, 99 diff lines, receipt seam re-verified by the accepted T012r real-host rerun), `packages/domain-harness-expo/src/store/expo-sqlite-runtime-store.ts` (same, 117 diff lines, T013s on-device) | v0.6 blob absent from v0.7 object set; v0.7's current modules are the descendants; the semantic-decision public/package/currentness surface was restored byte-faithfully by T000-sd (`421e40d`), message-identity hardening by T000-mi (`c9351b5`), revision guard by T000-sr (`a9b6293`), final-v0.6 compatibility evidence by E8b (`1622bc5`) — all accepted in-tree |
| (c3) v0.6 validation tooling superseded by the v0.7 evidence chain | ~24 | `packages/domain-harness/tests/v06-conformance/*` (5 files), `packages/domain-harness/tests/v3-assembly/*` (3), `packages/domain-harness-node/tests/store/t006-decision-receipt.test.ts`, `packages/domain-harness-node/tests/cross-host/t006-expo-decision-receipt.test.ts` + `chm-corpus.ts` + `chm-cross-host.test.ts` + fixture `chm-device-evidence-a45f9370.json`, `tests/hosts/node/t594-*` (4 files), `tests/hosts/t009-expo-devicehost/*` (13 files, tooling-only; v0.7's accepted device evidence lives in `tests/t009r/`, `tests/t013/`, `tests/t013s/`), `tests/compiler/semantic-decision-contract.test.ts`, `tests/hosts/successor-expo/*.mjs` (2), `tests/integration/package-versioning/t022-package-versioning.test.ts`, `packages/domain-harness/tests/observation/in-memory-observation-store.ts` | v0.7 accepted evidence chain replaces these: t009r manifest, t011 disposition, E11 terminal, t012r Node real-host rerun (#926, PR #935 `83f26aca`), t013s Expo/Hermes on-device rerun (#933, PR #934 `3493fe3d`), t014 closure (#936), t015 final closure (#939, PR #941 `86110c61`) |
| (c4) CI verify-redundancy cut (341101b) and version pins — EXCLUDED by the T016 lane constraint | 11 | root `package.json` (build-first test cascade + `--test-isolation=none`), `tsconfig.base.json`, `packages/*/package.json` (4), `packages/*/tsconfig.build.json` (4), `.gitignore` (`+*.tsbuildinfo`) | `.woodpecker/verify.yaml` is ALREADY byte-identical across the two trees (blob `9a46ced88007cf42f8338fbd0123d7486060b5a6` on both sides) — nothing to carry from the pipeline file itself; the npm-script/tsconfig/tsconfig portion touches `package.json` and `packages/**`, which the T016 lane constraint forbids (packed-byte and authority preservation); the `.gitignore` one-liner is inert without the forbidden incremental-tsc tsconfig change. Recorded as intentionally NOT carried; may ride a post-integration housekeeping lane |

Note on the two stray commits `5cee6a00` ("x") and `dadd4e60` (its revert): net-zero;
no residual delta.

## Totals

```text
MAIN_ONLY_FILE_DELTAS=121
(b) carried = 8 (6 v0.6 freeze docs + PROJECT_OVERRIDES v0.6 record + README v0.6 line)
(a) T000 recovery verified, then evolved = 7
(c) v0.7-superseded / excluded = 106  (c1=16, c2=62, c3=24, c4=11)
```

## Lane-delta constraint check (vs 86110c6)

The lane tip delta touches ONLY: `docs/` (6 carried v0.6 freeze docs),
`.dev-standard/PROJECT_OVERRIDES.md`, `README.md`, and evidence files under
`packages/domain-harness/tests/t016/` (outside every workspace package `files`
list). ZERO changes under `packages/**/src`, `packages/**/dist`, any
`package.json`, `package-lock.json`, or `.woodpecker/`. Re-pack x4 at the lane
tip reproduces the accepted digests bit-for-bit (see `t016-run-log-summary.txt`).
