# DomainHarness v0.10.2 T03b — A3 W7 exact generated-dist / one literal test write-set amendment

**Status: PROSPECTIVE_REVIEW_CANDIDATE / NOT_ADOPTED / NO RETROACTIVE AUTHORITY.** This candidate extends T03b #1325's write set only AFTER independent exact-SHA review and adoption. Target PR #1367 HEAD `5e6812a89722d7bcc281704885019776ca25f05f`. Source precedent: adopted A3 #1345/PR #1346, adopted T03a/T05 A4 generated-output precedent #1352/#1353, and recent A3 W6 #1365 approved to version `0a13a0d0c38e109a6080ecd23a269a845b8aa17d`.

## Evidence and necessity

T04 #1324 is now independently reviewed PASS, merged to version #1358 and CLOSED. T03a #1347 already CLOSED; T03b dependency gate open. T03b PR #1367 moved selected Host index, SQLite adapter, deployment, Shadow, Meta, Evidence, CT02 and source parity, and updated catalog under its serial writer turn. Local real Node24.21.0 scoped Host-node tests **23/23**, several legacy Host scoped suites green, typecheck/lint exit 0 per PR receipt #6394822067. **Root `npm run build` / committed-dist checker still RED**, because 20 emitted files are not in legal author-owned tracked source outputs. Do not claim completed Task and do not hand-edit or fabricate generated files. This request is about predeclaring ONLY exact derived code output files that the Node24 compiler already actually produced in local worktree.

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
| `packages/contracts/src/known-error-codes.ts` + catalog | frozen serial catalog turn | unchanged, append 19 codes as disclosed, no K authority |
| `packages/contracts/dist/known-error-codes.{js,d.ts}` | prior compiled Contracts bytes | W7 two generated outputs, Node24 tsc only |
| `tests/assembly/v010-t05-agent-workflow.test.ts` | prior root test owned T11 root tests | **one-time**, one-line earlier inline specifier synchronization while T11 has NOT begun; T11 future source owner re-pins after T03b |
| `package*.json`, `package-lock.json`, `.woodpecker/**`, `tsconfig*`, old Compiler `dist/**` | T07b / existing frozen owner | strictly prohibited |
| `packages/microkernel/**`, K/S payload, other T03a files, T06a/T06b subscription | respective T04/T03a/T06 owners | strictly prohibited |

This adjustment changes NO Task DAG dependency edge or new Task count: T03b and T06a independent in parallel after T04; T06b waits both; T11 later, then A8b if formally approved, T07b/T08b/T09/R01. T07b retains exclusive manifest/CI/legacy distro cleanup. Any additional path requires separate reviewed change; no blanket `dist/**`.

## Independent review and adoption

Review only this prospective new document at exact PR SHA against T03b #1325 original frozen §12, approved A3, existing A4 and recent W6 precedent, real PR #1367 file list/local Node24 receipts. Check **exact 20 generated filenames plus one test consistency file** and whether generated outputs from listed source roots are expected; source catalog writer and future T11 root test ownership serialized; no immutable already closed source touched. Return P0/P1/P2, PASS/BLOCK, `W7_FILE_WRITESET_READY=YES/NO`, exact SHA. Docs-only CI green never substitutes T03b Code/Node24 physical qualification. Only then Controller may merge doc to **v0.10.2**, author commit real dist under explicit rights and independent source review. Main HOLD.
