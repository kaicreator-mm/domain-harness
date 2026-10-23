# DomainHarness v0.10.2 — L2 Freeze (exact independently reviewed content)

**Status: PRODUCT_FROZEN / L2_FROZEN / TASK_DAG_NOT_ADMITTED / IMPLEMENTATION_NOT_AUTHORIZED / RELEASE_NOT_QUALIFIED.**

```ini
EVENT=DH_V0102_L2_FREEZE
VERSION=v0.10.2
BASE_BRANCH=v0.10.2
PRODUCT_FREEZE=docs/product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md (PRD blob 746535c97e87c24b373a02175f8681015a16a589, crosswalk blob 46bfbe4755fe2b3aa07c0e8e71ceac842c5873e4; unchanged by L2)
REVIEWED_L2_PR=1316
REVIEWED_L2_HEAD=dd29a0834f7417c03ee1e768666b34a166976979
MERGED_L2_COMMIT=b6e99852ac03e66551b4b6ecf956a1a3a584f7f3
FROZEN_L2_DESIGN=docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md
FROZEN_L2_DESIGN_BLOB=68e7dbc591f4c0c694818ec574b8585f95239c8b
FROZEN_L2_INVENTORY=docs/validation/v0.10.2/L2_SOURCE_INVENTORY.md
FROZEN_L2_INVENTORY_BLOB=1e38229b63aa741d58d143482252b573945d2a8d
FROZEN_L2_INVENTORY_SCRIPTS=docs/validation/v0.10.2/L2_SOURCE_INVENTORY_SCRIPTS.md
FROZEN_L2_INVENTORY_SCRIPTS_BLOB=808b628ab80a3808d9e514c82d5644dbcadaeb62
SOURCE_PIN=v0.10.2@f49c2a5f9ad79809959d1c5b6f6d8542c8d06f44
ADS=4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd
CV_01_TO_12=INHERITED_UNCHANGED
L2_AUTHOR=Sonnet 5.5 subagent (controller-briefed and controller-reviewed)
L2_REVIEW_R1=REQUIRES_AMENDMENT_P0_1_P1_5_P2_2 (Codex, PR1316@6368278777, HEAD 09147298)
L2_REVIEW_R2=REQUIRES_AMENDMENT_P0_0_P1_2_P2_1 (Codex, PR1316@6368576987, HEAD e6b4dafe)
L2_REVIEW_R3=PASS_P0_0_P1_0_P2_1_L2_FREEZE_READY_YES_AFTER_PRODUCT_DISPOSITIONS (Codex, PR1316@6370417444, HEAD 48d12b23)
R3_P2_F11=RESOLVED_IN_dd29a083 (one-sentence write-set ownership fix, recorded on the PR)
PRODUCT_DISPOSITIONS=O1,O2,O3,O5,O8,O10 ACCEPTED_BY_USER_20261024
L2_FREEZE=EXACT_BLOBS
REMAINING_L2_P0=0
REMAINING_L2_P1=0
TASK_DAG=NOT_ADMITTED
PHYSICAL_NODE24_BUILD_PACK=NOT_RUN
RELEASE=NOT_QUALIFIED
```

## 1. Authority and exact-source identity

[PR #1316](https://github.com/kaicreator-mm/domain-harness/pull/1316) carries the L2 design candidate, the source inventory and its reproducible scripts. They are pinned to source `f49c2a5f`. A headless Codex reviewer ran three independent, read-only rounds on it ([R1](https://github.com/kaicreator-mm/domain-harness/pull/1316#issuecomment-6368278777), [R2](https://github.com/kaicreator-mm/domain-harness/pull/1316#issuecomment-6368576987), [R3](https://github.com/kaicreator-mm/domain-harness/pull/1316#issuecomment-6370417444)). R3 ended `PASS` with P0=0/P1=0 and `L2_FREEZE_READY=YES_AFTER_PRODUCT_DISPOSITIONS`. The one R3 P2 (F11, reachability-test ownership) was a one-sentence correction, made at `dd29a083` and disclosed on the PR.

After the merge into `v0.10.2` at `b6e99852`, all three blobs were read back **byte-identical** to the reviewed HEAD. The frozen Product PRD and crosswalk blobs are unchanged. The L2 authority is these bytes, including the `CANDIDATE` filename. A material L2 change needs a reviewed, scoped L2 amendment. This checkpoint adds provenance only and is not another review.

## 2. Product dispositions accepted (design §15.1)

On 2026-10-24 the user accepted all six proposed dispositions:

| # | Accepted disposition |
| --- | --- |
| O1 | The public SDK entry is `@kaicreator/domain-harness-microkernel`. |
| O2 | `./host-seam` is an exact, enumerated Host-bootstrap API. Any installed code can import it. Trust rests on Host bootstrap (CV-01), and the seam is not described as protected. |
| O3 | K Primary gains an additive, read-only protocol, consumed from the loaded K instance. The gate lives in `packages/microkernel/internal`. The K digest change is recorded in T01k. T01 stays a byte-identical move. |
| O5 | Legacy packages stay in place as `private` references, together with their regression suites. No mass relocation. |
| O8 | A subscription projection carries only what `query` may return. Delivery is asynchronous, with a re-check just before the listener runs. Listeners get a deep-frozen copy. Delivery is process-local and best-effort. |
| O10 | The redaction contract is frozen. A public error carries `name`, `code` and a safe `message`; only `V10DeploymentError` adds `detail = { retryable }`. A full audit is a task acceptance item. |

The remaining open questions (O4, O6, O7, O9, O11–O14) are classified in design §15.2 as DAG-admission or Task-level. None blocks this freeze.

## 3. Frozen-input errata (recorded; frozen Product blobs not edited)

Design §14 records two errata. Neither changes a Product requirement.
- **E1.** The frozen crosswalk §3 says the core `packages/domain-harness/package.json` has no `files` field. That is false: it declares `"files": ["dist","README.md"]`. The real defect is that `dist` carries the legacy directories.
- **E2.** The crosswalk omits some selected-path files: `v10evidence`, `v09build/{parser.ts,generated/acorn.mjs}` and `contracts/{identity,json}.ts`.

## 4. Next gate and truth limits

**Task DAG admission.** Derive the formal Task Issues from design §12, the candidate DAG that ends in T09 and R01. Each Issue carries its write set, dependencies, scoped tests and reviewer focus, and is pinned to the then-current `v0.10.2` HEAD. O4 is decided at admission. No CI, Review, Code or Task admission is inherited from this L2 freeze.

**Not run.** Real Node24 build, pack and install, all tests, the digest audit (unclassified 64-hex candidates) and the full redaction audit remain `NOT_RUN` or `NOT_VERIFIED`. #1265, #1267 and #1270 stay OPEN.

**Provenance:** [#1300](https://github.com/kaicreator-mm/domain-harness/issues/1300), [PR #1316](https://github.com/kaicreator-mm/domain-harness/pull/1316), pin `.dev-standard/VERSION`.
