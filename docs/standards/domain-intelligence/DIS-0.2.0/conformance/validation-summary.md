# DIS 0.2.0 — versioned conformance coverage snapshot (initial normalization)

**Owner:** [version master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), specification authority [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), implementation [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497).

**Authoritative machine file:** [matrix.json](matrix.json). The table counts below are **requirements**, not Node test counts, CI attempts or a claim of full conformance.

| Scope | VERIFIED | PARTIAL | NOT_RUN | OUT_OF_SCOPE | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 9 | 7 | 0 | 0 | 16 |
| Optional profiles | 0 | 0 | 4 | 0 | 4 |
| Governance | 0 | 0 | 1 | 0 | 1 |

**Current status: PARTIAL.** P0 gaps: Function version, I/O Schema / typed Outcome / Evidence; executable constraints and semantic collaboration; native progressive Interaction. P1 optional profiles: Harness+LLM, Experience/Local Evolution/Server promotion, cross-target variants. Governance: independent exact-SHA review and L2 Freeze.

### Historical verified baseline (do not roll forward implicitly)

- [R9.5 pinned source/CI receipt](receipts/r9.5-baseline.json) — HEAD `7954bd91d51eb13fbeab96385f37ac8d9cd35c5e`, TREE `9250ad08f500bc8924458af1c833947c99ad0d4c`.
- 97 named test cases from actual selected KDP/SDK, real physical SQLite KDP Journal, Tally/Runx/xDownload source-real consumers and native AOT/SDK.
- Woodpecker three exact-SHA contexts SUCCESS; reference CI URLs in the receipt. The new normalization commit is separately validated and has no automatically inherited 97-case result.

### Interpretation and closure

A `VERIFIED` row means the **stated narrow requirement** has a positive+negative executable case associated with an exact historical receipt; it is not proof of all neighboring spec MUSTs. `PARTIAL` rows are not counted as complete. Optional profiles cannot silently disappear; `OUT_OF_SCOPE` requires a Product/L1 decision, and no OS hostile-native sandbox requirement is added. Every planned next implementation must modify the matrix and add its own exact commit receipt after CI success.

Machine validation from monorepo root: `node --test examples/dis-v020-conformance/validate.test.mjs`. This verifies IDs, statuses, source/test paths, named cases, fixed receipt integrity and honest evidence states.

Sub-issues are created only for genuinely independent write sets; the version index owns the final acceptance, Git owns immutable artifacts, Woodpecker owns execution proof.

### R10 new native Interaction coverage (candidate)

- Source-pinned `xdownload.interaction` has **two LOCAL public Functions**; one normalizes bounded Chat/Form/CLI Intent and one merges clarification + explicit user confirmation. Both return `OBSERVATION/NONE` and never issue an Effect permit. The existing real KDP `confirmDownload` remains a distinct call.
- Contract protects `kind=interaction` from `KDP_INTENT` / governed-Effect reclassification; no new OS trust gate or generic UI engine.
- New 6-case native SDK regression is wired through existing `native-consumer.test.mjs` and Woodpecker. **CORE-014 changes NOT_RUN → PARTIAL, not VERIFIED** until matching exact-SHA CI, actual UI adapters and cross-mode conformance are demonstrated.

### R10 exact-SHA blocked receipt (not PASS)

- [R10 current candidate failure receipt](receipts/r10-candidate-blocked.json) pins HEAD `c043fdaf22074cbda8230a2d1c36226205beda17` and all three Woodpecker failures (pipelines 2227/1–3). The GitHub connector does not expose pipeline step logs, so the cause is **UNDETERMINED**, not assumed to be a test assertion.
- Direct checked-out **Git Blob-identical** Interaction source (`f57747aa...`) passed 12 standalone Node22 assertions, and the 21-row matrix passed in-process reference validation; these are only targeted local checks, **not a native SDK/KDP CI qualification**.
- R10 stays PARTIAL until the blocked CI is investigated and a new exact-SHA success receipt is committed. Do not freeze the version or borrow R9.5 green contexts for new code.

### R10 CI recovery receipt (exact-SHA SUCCESS)

- The R10 block was diagnosed from the Woodpecker step logs as **CI infrastructure, not candidate code**: npm runs unreviewed dependency install scripts with only an advisory warning, so `better-sqlite3`'s install script fetched its prebuilt binary from github.com releases on every `npm ci`; the worker's direct GitHub egress returned 504s and prebuild-install fell back to node-gyp, which needs make the agent image does not ship. The lockfile is byte-identical to the R9.5 baseline (#2223 SUCCESS), and R9.5's green run only differed by a lucky GitHub download 82 minutes earlier.
- Fix: the three PR workflows pin the prebuild download to the npmmirror binary mirror (`npm_config_better_sqlite3_binary_host_mirror`, a native prebuild-install option); a local Node24 full gate additionally surfaced a staged/live pack inventory divergence in the new-workspace test staging, fixed in the same candidate.
- [R10 CI recovery receipt](receipts/r10-ci-recovery.json) pins HEAD `c9cc8d63e13b150cf462af05a58daef5748f0030` with all three Woodpecker contexts SUCCESS (pipelines 2229/1–3): 103 named demo cases (native consumer 27, including the 6 new Interaction cases; bridge 34; physical 7; source consumer 26; source selected 9), plus the 5-case matrix validator and the 12-case C01 assembly context.
- CORE-014 remains **PARTIAL** (real Chat/Form/CLI UI transports, external download Host and cross-mode conformance still missing); the coverage table above is unchanged. The docs commit that adds this receipt is validated by its own separate pipeline and inherits nothing automatically.

### R11 Function Contract candidate (no exact-SHA CI receipt yet)

- `DIS020-CORE-003` is **PARTIAL**: real original-source Tally task assessment and both xDownload native Interaction Functions now carry `dis.v0.2.function-contract/1` checked by published Contracts/Microkernel subpaths. Added 8 targeted positive/negative native tests, with no new fake Domain.
- Input/output record types are checked before typed disposition classification. Tally `UNQUALIFIED_INPUT` remains `UNKNOWN`; xDownload `READY_FOR_KDP` becomes `PENDING_AUTHORIZATION`, never Effect permission. The returned source pin is provenance, not independent business attestation; declared evidence references alone are never trusted as facts. `SUCCEEDED` without required references is rejected.
- Strict compatible reader/major is included in AOT and optional explicit caller version expectation rejects a stale consumer. Existing unprofiled R9 Functions remain outside CORE-003 completion. This candidate **cannot inherit R10 CI SUCCESS**; retain PARTIAL until new exact-SHA Woodpecker receipt and all remaining functions/typed KDP receipts/full schema/evidence verification are covered.
