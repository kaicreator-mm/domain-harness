# DomainHarness v0.10.1 C02 — Candidate Evaluation (draft)

Parent #1274 / C02 #1276. Qualified Standard Feature source prototype using existing `dh.v10.standard-feature/1` contract; NO Kernel change, model grader, real verifier or promoter.

Run source test: `node --test extensions/agent-improvement/packages/candidate-evaluation/tests/candidate-evaluation.test.mjs`.

A real Domain App can BUILD-select `candidateEvaluationFeature` under the v10 manifest role/ABI and invoke `evaluateCandidateEvidence` through the named read-only Standard Feature entry. Given exact-source independent Verifier outcomes and explicit positive/negative/independent oracle evidence, it reports conditional cohort comparison; if hidden tests leak, oracle validity fails, cohort differs, observations are missing, or exact source mismatches it refuses to produce a comparative result. All input evidence is caller-supplied and **never automatically attested by K**. Output cannot authorize a Task Gate, change a Kernel Effect, promote a candidate, or claim real production improvement.

NeurIPS sources ABC/BenchRisk/AGENTIF, 2026 AutoSaddler/RuleEvolve. Real Node24 clean BUILD/pack/install, security review and independent exact-SHA validation remain NOT_RUN; source is unqualified until Product/L2/DAG.


Producer layout: canonical standalone source package under `extensions/agent-improvement/packages/candidate-evaluation`; `npm pack`/installed Node24 BUILD and Host tests remain NOT_RUN. Old example prototype path retired.
