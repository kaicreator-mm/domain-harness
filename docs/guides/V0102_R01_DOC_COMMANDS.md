# v0.10.2 docs executable acceptance inventory — T08b → R01

**DRAFT RECEIPT:** T08b writes the command inventory; `DOC_COMMAND_EXECUTION=NOT_RUN` until R01 #1331 on one frozen final SHA **after T08b and T09 are both merged**. Never infer execution from a docs-only CI PASS. Source baseline: `v0.10.2@51dadcbbd31baf612507703ad389a255a8704462`.

| Source | Command or runtime check | Physical owner | Current evidence |
| --- | --- | --- | --- |
| root `README.md` | Node version + `npm ci && npm run build && npm run lint && npm run typecheck` | R01 | NOT_RUN at this final candidate |
| root `README.md` / SDK | `node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts` | R01 | T07b earlier exact-SHA proof; final candidate NOT_RUN |
| `docs/guides/V0102_TINY_RICH.md` | actual packed Tiny/Rich producer/install/send/query/subscription, no private deep import | T09 and final R01 evidence reuse | NOT_RUN |
| `examples/v010-clean-consumer/README.md` | repaired `clean-consumers.test.ts` with installed package graph, physical SQLite | T09 | NOT_RUN against T09 final |
| `examples/v0102-external-producer/README.md` | installed external-producer fixture, negative import closure | T09 | NOT_RUN |
| migration and SDK snippets | type-check real public `load`, `subscribe`, `buildV10App`, selected exports | T09 / R01 | NOT_RUN |
| Release gate | Full regression, Hidden Validation, Critical Journeys, Packaging | R01 | NOT_RUN |

For each executed line R01 must record `source_path`, literal `command`, working directory, Node/npm version, `expected_sha`, `actual_sha`, `exit_code`, and the relevant packed digest. Failing mandatory commands must BLOCK, not disappear from the inventory. A compiled TypeScript illustration containing application-supplied placeholders is **not** directly runnable; R01 executes a complete real fixture exercising that same public API.

**Parallel rule A9**: T08b exclusively owns `examples/**/README.md` (including the new external producer README). T09 exclusively owns test/fixture code, no README. R01 is the single final documentation command execution owner. `T08b || T09 → R01` after T07b. `main` remains HOLD.
