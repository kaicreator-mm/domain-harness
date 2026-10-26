# DomainHarness v0.10.2 — L2 Amendment A1: local packed-closure and T07a2 (review candidate)

```ini
STATUS=L2_AMENDMENT_CANDIDATE_ONLY
ISSUE=#1335
FROZEN_L2=docs/architecture/DomainHarness_v0.10.2_L2_DESIGN_CANDIDATE.md@68e7dbc591f4c0c694818ec574b8585f95239c8b
FROZEN_PRODUCT_PRD=docs/product/DomainHarness_v0.10.2_PRD_CANDIDATE.md@746535c97e87c24b373a02175f8681015a16a589
BASE=v0.10.2@91eb3b9a84ed46671e92491515c0762808a3ae52
FROZEN_INPUTS=READ_ONLY_BYTES_UNCHANGED
SOURCE_IMPLEMENTATION=NOT_AUTHORIZED
A1_ADOPTION=REQUIRES_INDEPENDENT_EXACT_SHA_REVIEW
```

## 1. Problem and evidence

Frozen L2 §12 T07a planned legacy core/compiler manifest dependencies on new `0.10.2-rc.0` workspace artifacts, which are **unpublished**. Historical tests (~30, **approximation to enumerate at implementation**) package legacy `@kaicreator/domain-harness`, `-compiler`, sometimes `-node`, then `npm install` those tarballs in clean consumers. npm tries to fetch unpublished `@kaicreator/domain-harness-contracts`, `-microkernel`, `-host-node` and `-build` dependencies from a registry, yielding E404. The exact subset depends on imports and must be established at the source pin. Setting `bundleDependencies` did not work for npm workspace symlinks (observed pack metadata `bundled: []`), and is not admitted as a workaround.

The actual T07a PR [#1333](https://github.com/kaicreator-mm/domain-harness/pull/1333) deliberately leaves legacy manifests unchanged; this preserves old packed fixtures. However, **T00 and later** will introduce forwarding shims to newly separated workspace packages. Existing isolated packed regression consumers must then explicitly stage/install the new dependency tarballs, otherwise an unqualified E404 or unresolved import can hide a real regression. `packages/domain-harness-compiler/tests/packed-fixture-stage.ts` handles some fixtures; many other test files pack independently. T01 PR [#1334](https://github.com/kaicreator-mm/domain-harness/pull/1334) also writes packed helper/tests. This is a scheduling and write-set amendment, **not** a new runtime, ABI or capability.

## 2. Additive replacement for the affected frozen §12 rows (only these)

### T07a — revised interpretation for delivery and independent review

Create and compile four independent Node24 TS workspace skeletons (`packages/contracts`, `packages/microkernel`, `packages/host-node`, `tooling/build`), root workspaces/lockfile/lint/committed dist guard, as presently scoped in #1318/#1333. **Do NOT add legacy package `package.json` dependency edges in T07a**, and do not loosen existing pack tests to tolerate unresolved npm versions. Existing legacy manifests and tsconfigs remain exactly unchanged until their exclusive manifest owner T07b authorizes final dependency/exports choices. The remainder of T07a scope and its Node/CI gates are unchanged.

### NEW T07a2 — packed legacy consumer fixture bridge

**Depends on T07a (#1318) AND T01 (#1320)** because T01 already edits the packed helper and overlapping clean-consumer/Meta tests. T07a2 MUST merge before T00 (#1319) starts. It is distinct from T07b (final manifest/lockfile owner) and T09 (final external runtime delivery proof).

**Exclusive write set** (actual list of separately packed tests must be enumerated during Task admission and exact path listed there):
- `packages/domain-harness-compiler/tests/packed-fixture-stage.ts`: deterministic staging of exact local tarballs for new `packages/contracts`, `packages/microkernel`, `packages/host-node`, `tooling/build`; preserve legacy staged/live parity and no live-dist build while testing.
- `packages/domain-harness-compiler/tests/*packed*.*`, `packages/domain-harness-compiler/tests/*consumer*.*` and other **specifically enumerated** clean-pack fixtures across the `packages/domain-harness{,-compiler,-node}/tests/**` and `tests/{assembly,compiler,conformance,hosts,integration}/**` that independently `npm pack` / `npm install` legacy tarballs. **No broad glob write permission at Task admission:** each existing file requires a bounded exact path list reconciled against #1320/#1334 at T07a2's start.
- `.gitignore`, `.gitattributes`: new workspace committed-dist exception paths to match existing protected legacy git install rule (#299); preserve `-text` for binary-neutral deterministic build output where needed.
- Dedicated small packed-fixture closure assertions/tests added only under the named package test directories.

**Explicitly FORBIDDEN T07a2 writes:** root or existing/new `package.json`, `package-lock.json`, any `tsconfig*.json`, `.woodpecker/**`, `.dev-standard/**`, K/S payload bytes, wire identifiers, frozen Product/L2, shipped runtime/BUILD source. **Only T07a/T07b own lockfile and existing manifests**. New private staging fixtures must not invent or publish unsupported external packages. `T07a2` is a test-staging/delivery-proof support concern, NOT a second manifest owner or a feature.

**Implementation contract:**
1. Build each declared new workspace once, use **read-only snapshot stages** with exact Node24 builds and resolved local `npm pack` tarball **paths + SHA256**. Preserve the old `stagePackedWorkspaces` staleness-guard behavior and source-map deterministic equivalence.
2. For each existing **packed** clean consumer, stage/install all required dependencies by explicit exact local `*.tgz`/file paths **before** importing staged legacy packages; npm registry is used only for genuinely external third-party dependencies (user-specified `https://registry.npmmirror.com`). Do not expect unpublished `@kaicreator/*@0.10.2-rc.0` on public npm; do not rely on workspace symlink packaging, broad npm registry overrides, local repo-relative private module shortcuts, or bypassing `npm install`.
3. Required dependency closure is **minimal per actual consumer path**, no unconditional `tooling/build` in a **runtime Tiny** closure, no compiler-in-runtime regression. The transitional historical packed legacy test fixture may explicitly include producer/BUILD tarballs when its tested surface itself requires them; **the new production Tiny runtime** must remain compiler-free as specified in Product #1308 / final T09. Separate **regression fixture** from **supported distribution** in evidence.
4. A failing missing-tarball or forged/different digest setup must refuse instead of hitting an unaudited registry/fallback; positive clean-installed tarballs must resolve only intended packages. Count **all** distinct packed consumers and cover them by tests or explain a non-required historic fixture with Product/L2 disposition; do not say "30 PASS" from one shared-helper test.
5. No duplicate build/reserialize of K/S selected payloads, no fresh Tool runtime, no ABI/wire literal edits, no weakening the T01 t09 Meta installed-artifact assertion; T07b/T09 own final installed-package provenance restoration.

### T00 — new admission dependency

`T00 #1319 DEPENDS_ON = { T07a2 }` (transitively T07a and T01). This differs from frozen §12's direct `T00 -> T07a`. All T00 existing write set, catalog-set sequencing, tests, ABI obligations stay unchanged; no T00 source before A1 reviewed and T07a2 merged.

### T01k/T08a unchanged

`T01k` still depends only on T01 (can run in parallel with T07a2 once T01 merged); T08a still independent, and T11 still needs T08a. T05 through R01 original downstream order preserved.

### T07b + T08b legacy examples

`T07b` remains the **only exclusive writer** of final existing legacy package manifests, root lockfile/exports and Node24 smoke/distribution state. New A1 does not implicitly authorize T07a2 to write those. Add `examples/v09-clean-consumer/**` to T07b's explicit legacy reference/retirement test ownership **only if real current import/pack dependency review confirms it is broken by export pruning**; otherwise preserve as archived reference and document as such in T08b. Do not claim v0.9 public API compatibility as an v0.10.2 Product requirement.

## 3. Amended DAG

```text
T07a ─┐
      ├── T07a2 ── T00 ── T05 ── T04 ── T03 ── T06 ── T11 ── T07b ── T08b ── T09 ── R01
T01  ─┘                      ↑                         ↑
  └── T01k ───────────────────┘                         │
T08a ──────────────────────────────────────────────────┘
```

No new graph cycles; T07a2's overlapping packed-test write set is **ordered after T01**, and manifests/lockfile remain exclusive T07a/T07b. T01k's additive K protocol write set is disjoint from T07a2.

## 4. Review / release gates for adopting A1

**Independent L2 reviewer** checks: P0/P1/P2, exact HEAD, frozen Product/L2 byte preservation, essential source evidence for E404 + unpacked workspace symlinks, DAG dependency reachability, no overlapping writes among unordered tasks, precise no-lockfile rule, no runtime-packaging loopholes and no loss of old installed-provenance assertions. Publication must explicitly say `A1_FREEZE_READY=YES/NO` and `PASS/BLOCK`.

**Controller** may then admit a separate **T07a2 Task Issue**, enumerating the exact packed-test file list and its independently reviewed write set, dependencies `#1318/#1320` and gating `#1319` before issue execution. **A1 itself is not the authorization to implement.** The amendment is additive only; do not edit the original frozen `L2_DESIGN_CANDIDATE.md`, `L2_FREEZE.md`, frozen PRD or CVs.

**Physical verification** for T07a2 later: exact scoped `npm pack`/clean installs and existing packed fixtures, exit codes from direct commands `cmd > log 2>&1; echo EXIT=$?`, plus full `tools/task-check.sh` on quiet machine after `npm run build`, independently reviewed PR exact-HEAD before merging to `v0.10.2`. `NOT_RUN` is not PASS. No unnecessary repeat of version-wide Full/Hidden for this scoped change.

**Remaining open risk:** pre-existing high-load SQLite N08b flake diagnosis on T07a is a separate gating concern; this amendment does not waive full task-check. No claim any 30 packed tests or N08b physically passed during this document-only work.
