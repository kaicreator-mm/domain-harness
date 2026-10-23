# DomainHarness v0.10.1 C03 — Experience Reuse Standard Feature (draft)

Parent #1274 / #1277. This is source-only, pure `dh.v10.standard-feature/1` application-facing functionality, not a Memory storage engine, retrieval database, promotion manager or Rule authority. Candidate inputs are externally supplied source references and provenance, rather than private task-meta records.

- Valid independent candidate evidence + current project/task/rule/source → `REVIEW_CANDIDATE_ONLY`; still cannot adopt automatically.
- Stale SHA, **even with an arbitrary caller-provided `compatibilityRef`**, → `uncertain`. A ref string is not independent proof; full cross-SHA eligibility requires a separately governed attestation contract (not in this version's C03 inputs).
- Known negative case, crossed project or rule conflict → not applicable.
- No hidden source/Tool/effect permissions or credential values accepted.

Run `node --test extensions/agent-improvement/packages/experience-reuse/tests/experience-reuse.test.mjs`.
Research G-Memory, A-Mem, LongMINT/Compliance Trap. v0.10 standard feature S ABI and v10 BUILD selection must be physically tested on Node24 after Product/L2/DAG freeze. Tests/packaging/release: NOT_RUN.


Canonical independent package: `extensions/agent-improvement/packages/experience-reuse`; physical Node24 `npm pack`/clean install/BUILD remains NOT_RUN.
