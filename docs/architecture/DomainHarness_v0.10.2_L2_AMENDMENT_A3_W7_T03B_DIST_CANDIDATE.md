# DomainHarness v0.10.2 T03b — A3 W7 exact generated-dist / one literal test write-set amendment

**Status: PROSPECTIVE_REVIEW_CANDIDATE / NOT_ADOPTED / NO RETROACTIVE AUTHORITY.** This candidate extends T03b #1325's write set only AFTER independent exact-SHA review and adoption. Target PR #1367 HEAD `4c3adc9b7cbadfe96fc17eccec618102743b7399`. Source precedent: adopted A3 #1345/PR #1346, adopted T03a/T05 A4 generated-output precedent #1352/#1353, and recent A3 W6 #1365 approved to version `0a13a0d0c38e109a6080ecd23a269a845b8aa17d`.

## Evidence and necessity

T04 #1324 is now independently reviewed PASS, merged to version #1358 and CLOSED. T03a #1347 already CLOSED; T03b dependency gate open. T03b PR #1367 moved selected Host index, SQLite adapter, deployment, Shadow, Meta, Evidence, CT02 and source parity, and updated catalog under its serial writer turn. Local real Node24.21.0 scoped Host-node tests **23/23**, several legacy Host scoped suites green, typecheck/lint exit 0 per PR receipt #6394822067. **Root `npm run build` / committed-dist checker still RED**, because 20 emitted files are not in legal author-owned tracked source outputs. Do not claim completed Task and do not hand-edit or fabricate generated files. This request prospectively authorizes the **20 exact derived output paths, one exact Contracts source-file append, and one exact test-line correction** required by T03b. It does NOT retroactively authorize already-pushed code or waive independent source review.

## Exact 20 derived output files (no globs)

- `packages/host-node/dist/index.js`
- `packages/host-node/dist/index.d.ts`
- `packages/host-node/dist/sqlite-adapter.js`
- `packages/host-node/dist/sqlite-adapter.d.ts`
- `packages/host-node/dist/deployment.js`
- `packages/host-node/dist/deployment.d.ts`
- `packages/host-node/dist/shadow-l4-readonly.js`
- `packages/host-node/dist/shadow-l4-readonly.d.ts`
- `packages/host-node/dist/meta-feedback-workflow.js`
- `packages/host-node/dist/meta-feedback-workflow.d.ts`
- `packages/host-node/dist/decision-evidence-observer.js`
- `packages/host-node/dist/decision-evidence-observer.d.ts`
- `packages/host-node/dist/ct02-invoker.js`
- `packages/host-node/dist/ct02-invoker.d.ts`
- `packages/host-node/dist/error-type-parity.js`
- `packages/host-node/dist/error-type-parity.d.ts`
- `packages/host-node/dist/query-type-parity.js`
- `packages/host-node/dist/query-type-parity.d.ts`
- `packages/contracts/dist/known-error-codes.js`
- `packages/contracts/dist/known-error-codes.d.ts`

18 Host files = 9 unique source stems ×2; 2 Contracts files = one existing Known Error Codes source updated by T03b catalog writer ×2. Each is `npm run build -w <package>` emitted genuine TS JS or declaration output. No source map files. Existing `index.*` and `known-error-codes.*` outputs are modified; other 16 output files NEW or absent at previous branch. The T03b implementation must commit all 20 **only after this amendment independent PASS and version-branch adoption**. Re-run normal real Node24 build, typecheck, lint and `scripts/check-committed-dist.mjs`; report exact hashes/exit codes, source parity and unchanged runtime behavior. No new Host feature or separate runtime is authorized by this docs change.

## One test consistency write-path exception

- `tests/assembly/v010-t05-agent-workflow.test.ts` — **ONE line**, duplicate inline Capability `externalImports.npm` allowlist string changed from legacy Host specifier to selected `@kaicreator/domain-harness-host-node`; aligns already approved `tests/assembly/fixtures-v010/capability-agent-memory-v1.mjs` and Rich twin. This single test source file was in PR #1367 without explicit T03b frozen write authorization. Prospective permission must be independently approved, **not retroactively justified** merely by PR code. No unrelated test edits, no new assertion relaxation. Source author should retain invariant/fixture parity and Node24 scoped test EXIT 0.

## Scope and owner matrix

| Path owner | Baseline | Amendment |
| --- | --- | --- |
| `packages/host-node/src/` T03b Host moved modules + tests | original frozen T03b after T03a/A3 split | unchanged; never edit T03a's 6 exact src/test files |
| `packages/host-node/dist/` 18 exact output files above | non-private Host compiled dist requires committed output | W7 exact mechanical outputs, Node24 tsc only |
| `packages/contracts/src/known-error-codes.ts` (ONE exact source file) + existing catalog artifact | Previously T00-owned Contracts source; T03b catalog turn alone does not grant this file | **W7 R2 prospective one-time source writer grant:** append EXACTLY the 19 selected CT02 / SQLite literals listed below, no deletion or rename, no other Contracts files, no Kernel authority; supersedes prior writer only after independent PASS + version adoption |
| `packages/contracts/dist/known-error-codes.{js,d.ts}` | prior compiled Contracts bytes | W7 two generated outputs, Node24 tsc only |
| `tests/assembly/v010-t05-agent-workflow.test.ts` | prior root test owned T11 root tests | **one-time**, one-line earlier inline specifier synchronization while T11 has NOT begun; T11 future source owner re-pins after T03b |
| `package*.json`, `package-lock.json`, `.woodpecker/**`, `tsconfig*`, old Compiler `dist/**` | T07b / existing frozen owner | strictly prohibited |
| `packages/microkernel/**`, K/S payload, other T03a files, T06a/T06b subscription | respective T04/T03a/T06 owners | strictly prohibited |

## W7 R2 — one-time Contracts source authority correcting independent R1 P1-01

At exact PR #1368 R1 (HEAD `6f8da9f0d2bdfd3e382c3439100868cf1bd52068`), independent reviewer returned **P0=0, P1=1, P2=1; BLOCK**, because this document requested the two generated `known-error-codes` outputs but failed to grant the **source** `packages/contracts/src/known-error-codes.ts`. The existing five-path serialized Catalog turn does NOT grant this otherwise T00-owned Contracts source; separate precedent T04 A7 W1 #1359/#1360 supports requiring one exact source permission in addition to dist.

**Precise additive authority requested for T03b #1325, AFTER independent W7 R2 PASS and v0.10.2 adoption only**: change precisely `packages/contracts/src/known-error-codes.ts`, from base blob `5dbd0b8061e1ea088f390b65700e92a684b0fc24` to append the following **19 unique refusal-code literals**, with all prior 147 values preserved and order retained per existing sorted table:

```text
ARRAY_ACCESSOR_OR_HOLE
ARRAY_INVALID
ARRAY_PROPERTIES_INVALID
BOUNDS_EXCEEDED
CYCLIC_INPUT
FACADE_NOT_AVAILABLE
FEATURE_NOT_IN_ALLOWLIST
HOST_STORE_CLOSED
HOST_STORE_DRIVER_UNAVAILABLE
JSON_BYTE_LIMIT
NONFINITE_NUMBER
NON_DATA_VALUE
OBJECT_ACCESSOR_OR_HIDDEN
OBJECT_KEYS_INVALID
OBJECT_KEY_NOT_DATA
OBJECT_PROTOTYPE_INVALID
OPAQUE_OR_THROWING_INPUT
STRING_LIMIT
TOTAL_TEXT_LIMIT
```

Only **two** `HOST_STORE_*` codes originate in the earlier committed SQLite adapter's previously missed serialized catalog turn; the other **17** entered the scanner with the selected CT02 migration from unscanned `extensions/` to `packages/host-node/src/ct02-invoker.ts`. This is an additive catalog correction, not a new K/Host refusal authority or new public error-handling engine. Verified with GitHub base→current T03b source blob `030bb3822f4815e2dab0c3ccd19a0a9d9d343db5`: 19 additions, **zero removed existing literals**; one previously existing `V10_TARGET_UNSUPPORTED` line was re-positioned, not removed. Preserve that set and forbid new codes beyond the 19.

The one-time grant is strictly **only** that exact source file, the two previously requested compiler-derived `packages/contracts/dist/known-error-codes.{js,d.ts}` outputs (already counted among 20), and the exactly one inline import-allowance line at `tests/assembly/v010-t05-agent-workflow.test.ts:324`. No root package/manifests/CI, arbitrary `packages/contracts/src/**`, T03a six paths, T06a four paths, Kernel/S, existing Task DAG, or writable T11 future source paths. Serialize T00 Contracts source baseline → T03b W7 additive catalog turn → later T11 and T07b packaging; do not conflate T03b Catalog entry with Contracts source right before prospective adoption.

The candidate implementation pin is now current **PR #1367 HEAD `4c3adc9b7cbadfe96fc17eccec618102743b7399`** (P2-01 R1 anchor resolved; earlier 5e6812a8 differed only by one authorized Host test assertion). Real Node24 brand tests **3/3 PASS** at this exact implementation HEAD; all previously emitted 20 dist results must be confirmed by genuine fresh compiler after version adoption, no source-byte fabrication. Then rerun targeted `node scripts/check-v010-error-code-catalog.mjs`, committed-dist/root build, scoped lineage and Host, typecheck/lint, and obtain separate exact-SHA source review; no per-leaf full regression.

**R2 acceptance**: an independent reviewer must verify the exact 19 additions, unchanged 147 legacy codes, real writer baseline and 20 dist mapping, one-line test exception, P1/P2 closure, no new P0/P1, and return `W7_WRITESET_READY` / `MERGE_ELIGIBLE_DOC_VERSION_ONLY` at **new PR #1368 exact HEAD**. This document remains PENDING until independent R2 decision; Code/Node24 Task PASS and main integration remain withheld.

This adjustment changes NO Task DAG dependency edge or new Task count: T03b and T06a independent in parallel after T04; T06b waits both; T11 later, then A8b if formally approved, T07b/T08b/T09/R01. T07b retains exclusive manifest/CI/legacy distro cleanup. Any additional path requires separate reviewed change; no blanket `dist/**`.

## Independent review and adoption

Review only this prospective new document at exact PR SHA against T03b #1325 original frozen §12, approved A3, existing A4 and recent W6 precedent, real PR #1367 file list/local Node24 receipts. Check **exact 20 generated filenames plus one test consistency file** and whether generated outputs from listed source roots are expected; source catalog writer and future T11 root test ownership serialized; no immutable already closed source touched. Return P0/P1/P2, PASS/BLOCK, `W7_FILE_WRITESET_READY=YES/NO`, exact SHA. Docs-only CI green never substitutes T03b Code/Node24 physical qualification. Only then Controller may merge doc to **v0.10.2**, author commit real dist under explicit rights and independent source review. Main HOLD.
