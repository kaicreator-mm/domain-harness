# v0.10.2 A5 R2 — T07a4 Node24 Compiler→BUILD predecessor and exact forwarding contract

**State: independent review required; not yet execution admission.** Origin #1354 and T05 R1 P1-01/P1-02. Supersedes A5 R1 at 0399032c. One prospective L2 Task-ownership/timing addendum, no edits to frozen Product/L2/Freeze blobs. The version's existing **18 implementation DAG nodes remain 18**; T07a4 is a serialized phase of T07 (as T07a/T07b are), not an independent task node or runtime gate.

## Grounded failure and ordered resolution

T05 PR #1351 migrated actual BUILD into `@kaicreator/domain-harness-build` but its three previously frozen Compiler source forwarders remain fully independent implementation algorithms (independent R1 P1-01). Compiler manifest does not declare BUILD. The current `.woodpecker/verify-min-node.yaml` enforces Node22.15 and all workspace build/lint/typecheck, while BUILD advertises Node>=24. Frozen T07b would change engines/CI only **after** T11, creating a contradiction if the Compiler forwards earlier.

**R2 decisions (no discretionary wording):**

1. T07 **moves the minimum supported CI/project/Compiler runtime to Node24 before T05**. This is a narrow *timing relocation* of Node24 changes already frozen under late T07b, not an additional permanent scope. The old Node22 min lane retires in T07a4; v0.10.2 Node24 verify retains existing exact-SHA smoke, plus the existing manual full-regression lane. Later T07b must not repeat this already completed engine/CI change; it still owns legacy export pruning, privatization and dist untracking after T11.
2. T07a4 adds the new BUILD runtime dependency to Compiler, and explicitly builds the BUILD workspace in Compiler's existing `prebuild` and `pretypecheck` before Compiler `tsc` to prevent stale BUILD `dist/index.d.ts` under the root's non-topological workspace order.
3. T05, after T07a4 merges, **must** replace its three source files with import/export-only static forwarding shims and expose the narrow **pure BUILD** symbol allowlist below via its already-owned `tooling/build/src/index.ts` and A4-admitted generated `dist/index.{js,d.ts}`. T05 must not touch manifests, CI, K/S, Microkernel, Host, private Compiler activation or policy decisions. The BUILD root export is deliberately a small transitional ABI; no deep imports or second parser/engine. T11 deletes Compiler legacy shims, and T07b prunes Compiler legacy public exports, so this export compatibility surface may be reduced in a separately reviewed future version once all consumers migrate.

## T07a4 exact exclusive write-set: six paths (one deletion)

| T07-only file | Prospective permitted change | Explicit prohibitions |
| --- | --- | --- |
| `packages/domain-harness-compiler/package.json` | Declare runtime `@kaicreator/domain-harness-build: 0.10.2-rc.0`; set `engines.node >=24.0.0`; extend existing `prebuild` and `pretypecheck` to build BUILD after their existing Core precursor | No other deps, peers, exports, files, private flag or scripts |
| `package-lock.json` | Generated root+Compiler `engines` and Compiler one local workspace dependency exactly; no new registry resolved packages or lock churn | No manually invented integrity/resolved entries |
| `package.json` (root) | Raise `engines.node` from `>=22.15.0` to `>=24.0.0` | No workspace/script/devDependencies changes |
| `.woodpecker/verify.yaml` | Exact-SHA Node major floor from 22 to **24**, keep required `ci/woodpecker/pr/verify` name and all existing bounded tests/one manual full event; Node24 ECF worker already present | No new/full automatic per-PR regression; no dropped legitimate smoke; no required-check rename |
| `.woodpecker/verify-min-node.yaml` | **Delete** obsolete Node22.15 compatibility lane (retired because selected v0.10.2 target is Node24). Record branch-protection required status check preflight before deletion; if `verify-min-node` is actually required externally, update branch protection under its rightful owner or BLOCK the deletion until policy is reconciled | Never call missing min-node status PASS, never bypass required branch protection |
| `.dev-standard/PROJECT_OVERRIDES.md` | Update only operative CI profile/runtime/required-check/runner statements to say Node24 verify only; ensure Node22 min lane retirement and exact-SHA existing evidence handling align with workflows. Preserve historical archive references and ADS pin. Note `verify.yaml` maintains one required context | No governance waiver, unrelated standard change or redundant CI gates |

**No seventh path.** T07a4 must not touch `packages/domain-harness/package.json`, `packages/domain-harness-node/package.json`, or `packages/domain-harness-expo/package.json` (those preserve historical independent declared floors until T07b legacy privatization); after Compiler adds BUILD only **its** effective runtime is Node>=24. CLI target, root and selected Domain App are Node24. No claim that unrelated legacy packages will work at Node22 after future prune. If physical Node24 check, package closure or protected check-status cannot be resolved within these six paths, escalate via independent amendment instead of a waiver.

**DAG:** `T07a/T00/A4 → T07a4 → T05 → T04 → (T03b ∥ T06a) → T06b → T11 → T07b → T08b → T09 → R01`; T03a already independently closed/merged at `ab4d4d1d7c1c08f33977c49749bf5ac363475398` and is not reopened. The `T07a4→T05` edge is a serialization constraint inside the original T07 owner's phased execution, not new implementation node. Remaining T07b edits cannot race with T07a4.

## Decided exact T05 BUILD-only forwarding ABI

No further open design decision. All listed symbols already exist in newly migrated BUILD implementation and belong to **pure deterministic BUILD tooling**, not K runtime or Host. T05 must add exactly the following to the package **root** `tooling/build/src/index.ts` (new workspace manifest already exports root only):

- Values: `buildV10App` from `./build.js`; `resolveV10SelectedClosure` from `./selected-closure.js`; `emptyExternalImports`, `collectModuleEdges`, `assertSealedImportClosure` from `./import-policy.js`.
- Types: `V10ClosureModule`, `V10SelectedClosure` from `./selected-closure.js`; `V10ModuleEdge`, `V10ExternalImports` from `./import-policy.js`; `V10ModuleInput`, `V10RouteRowInput`, `BuildV10AppOptions`, `V10SealedModule`, `V10BuiltApp` from `@kaicreator/domain-harness-contracts`.
- Error identity: `V10BuildError` must be imported from `@kaicreator/domain-harness-contracts` through the existing frozen Compiler `./errors.js` canonical shim. Confirm reference equality of thrown BUILD error constructors and legacy consumer `instanceof`. No separate cloned error or duplicate digest owner.
- Exact forwarding:
  - `C/src/qualified-package/v10build/build.ts`: `export { buildV10App } from '@kaicreator/domain-harness-build'; export type { V10ModuleInput, V10RouteRowInput, BuildV10AppOptions, V10SealedModule, V10BuiltApp } from '@kaicreator/domain-harness-build';`
  - `C/src/qualified-package/v10build/selected-closure.ts`: `export { resolveV10SelectedClosure } from '@kaicreator/domain-harness-build'; export type { V10ClosureModule, V10SelectedClosure } from '@kaicreator/domain-harness-build';`
  - `C/src/qualified-package/v10build/import-policy.ts`: `export { emptyExternalImports, collectModuleEdges, assertSealedImportClosure } from '@kaicreator/domain-harness-build'; export type { V10ModuleEdge, V10ExternalImports } from '@kaicreator/domain-harness-build';`
- **Deliberate exception to minimal BUILD root visibility:** these four pure internal analysis/closure helper values are exposed only to keep existing Compiler test/internal call sites and official forwarder contract functioning without private or uninstalled deep imports. This adds no `activateV10App`, import hook, policy checker authority, Host port, Kernel privileged API, storage, or external-Effect permit. T11 later consumes the canonical new BUILD directly and removes Compiler shims. The helper root surface receives independent source/API review as part of T05 exact-SHA R2.

## Measurable gates and denial cases

A5 **design reviewer** must independently check exact six-file T07a4 ownership, Node24 stage alignment and all required checks, new BUILD root helper scope and legacy type/ref identity, T07b late-phase reconciliation and unchanged 18-Task DAG. Return `P0/P1/P2`, `PASS/BLOCK`, `A5_FREEZE_READY`, `EARLY_T07_MANIFEST_AUTHORIZED`, `T05_COMPILER_FORWARDING_PATH_FEASIBLE`, `DAG_ACYCLIC`. Do not mark physical test PASS from design.

If A5 R2 PASS, controller may merge docs, update T07/T05 authoritative Issues, then implement **T07a4 as separate two-manifest-plus-three-config-plus-one-deletion PR** with only the six exact paths, fresh clean Node24 npm ci and lock-diff validation, CI required-status protection proof, and one clean-packed Compiler+BUILD+Contracts dependency closure positive/negative. Independent source review + applicable CI exact SHA before version merge. Then T05 executes the frozen three source shims + BUILD root, only the A4-admitted six actual generated Compiler `dist` companions and two `dist/index` companions, the L2 §4 manifest negative cases already physically 5/5 PASS at `3c500ef2`, named-error identity, old Compiler regression and installed Compiler+BUILD/Contracts smoke. If old files contain unexpected extra exports, STOP and request reviewed narrow change. Do **not** run new per-leaf full `task-check` unless changed-risk demands it; the prior green ~4170-test full suite is retained as historical but does not prove new shim bytes.

**No existing source/manifest/CI waiver. No main integration. No release qualification.**
