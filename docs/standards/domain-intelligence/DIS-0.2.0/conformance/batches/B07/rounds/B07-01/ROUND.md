# B07-01 / R51 — Full prior-batch qualification ledger (CI pending)

- Original isolated source commit: [`179e2127a884f6a10587563094f0a2d709af5300`](https://github.com/kaicreator-mm/domain-harness/commit/179e2127a884f6a10587563094f0a2d709af5300); TREE `8bd95bdbe1b209b5f1cb2ef339736a4ef964bd62`.
- Native test Git Blob: `639cfbcaa09f829f1b0687fff961c99e04a9da9c` at `examples/dis-v020-conformance/batch-ledger-18.test.mjs`.
- Existing B04-01/R41 auditor checks B01–B03 (9 rounds). R51 adds **separate all-B01–B06 audit (18 rounds)**, preserving historic default for old test contracts.
- Actual B06 #2300 assigned `verify-min-node` to job /3 and `verify` to /2. The former auditor equated job position with CI context; R51 uses three unique job slots in the same pipeline while matching **named** contexts across manifest/round/receipt.
- Negative checks cover fabricated cross-pipeline results, duplicated job number, changed source Git blob/tree, lost matrix link and excluded native test.
- Audit is **read-only stored record verification**, not independent GitHub CI status lookup or independent semantic Oracle; historical SHA evidence is not overwritten if current source differs.
- **State: CI_PENDING**. No batch qualification / Core promotion / Merge / Freeze / Release. B01–B06 remain 18/18 previously qualified at their own exact historic successful commits. Product/L1 scope and independent Tally SAP unresolved.

## Exact-source full CI result (supersedes above original PENDING snapshot)

R51 qualified at HEAD `61f32bfc274b701f6b4d8ffcd66f58d4349f22fc`, TREE `1dbcc01229a75dbb259d3f0d96c93b8a33c11369`, Woodpecker #2302/1-3 **3/3 SUCCESS**. The original test blob `639cfbcaa09f829f1b0687fff961c99e04a9da9c` was unchanged at that exact source. [Machine receipt](../../../receipts/r51-b07-full-ledger-ci.json); no independent semantic Oracle or Freeze.
