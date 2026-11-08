# DIS 0.2.0 — versioned conformance coverage snapshot (initial normalization)

**Owner:** [version master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), specification authority [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), implementation [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497).

**Authoritative machine file:** [matrix.json](matrix.json). The table counts below are **requirements**, not Node test counts, CI attempts or a claim of full conformance.

| Scope | VERIFIED | PARTIAL | NOT_RUN | OUT_OF_SCOPE | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 9 | 5 | 2 | 0 | 16 |
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
