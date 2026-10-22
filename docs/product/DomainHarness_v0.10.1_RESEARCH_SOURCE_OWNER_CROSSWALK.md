# v0.10.1 — source and owner gap matrix (CANDIDATE)

This is Product/L1 evidence, not a verified code inventory or independent ABI Review. Pin all actual selected examples and code at \`main@65a1b5d68bc59695c6cff7ee2ec9d861c5a6ee10\`; a new dependent source HEAD requires refreshed currentness.

| Paper class | Desired application | Existing DomainHarness owner | Proposed v0.10.1 change | Excluded duplicate |
| --- | --- | --- | --- | --- |
| MAST / AgentLens / TraceML / AgentForesight | earliest observable failure / repeated-failure candidate | v0.10 T06 DecisionEvidence #1173; S Context | C01 pure diagnostic (not causality or Task outcome) | task-meta collection, Tally diagnosis policy |
| ABC / BenchRisk / AGENTIF / RuleEvolve | oracle-positive/negative coverage, matched candidate comparison | v0.10 T07 Candidate/Shadow #1174 | C02 pure evidence comparison | scorer execution and promotion |
| G-Memory / A-Mem / LongMINT / Compliance Trap | evidence-qualified history and contradiction checks | v0.10 T04 Memory #1171 + Context | C03 pure applicability projection | second Memory DB |
| Harness² / AutoSaddler | bounded task-local probe design | v0.10 S Workflow / Shadow, T08 sealed version #1175 | C04 pure proposal only | experiment scheduler and Host Effect |
| TraceML / AgentAbstain | Stop/Pivot/Revisit decision | T02 #1169 + Workflow and active #1267 | C05 source reuse decision pending | S kernel-side auto-permission |
| STORM / STRATUS | immutable K State, CAS, Effect, recovery | K Primary #1167, C01 #1177, product #1141 | integration adversarial fixtures only | K distributed manager, extra Journal |
| Repo2Run / SWE-rebench | physical environment truth | Node24/SQLite selected Host, v0.10 T11 examples | real clean install pack Validation | optional new Host service |

### Current source boundaries
- [v0.10 BUILD/ABI](https://github.com/kaicreator-mm/domain-harness/blob/65a1b5d68bc59695c6cff7ee2ec9d861c5a6ee10/packages/domain-harness-compiler/src/qualified-package/v10build/build.ts) supports \`kernel-primary\`, advisory \`kernel-extension\`, \`standard-primary\`, \`standard-feature\`, Business and Capability declarations, early duplicate/provider/requires refusal and qualified Module SHA.
- [Rich selected example](https://github.com/kaicreator-mm/domain-harness/blob/65a1b5d68bc59695c6cff7ee2ec9d861c5a6ee10/examples/v010-clean-consumer/apps/rich/app-definition.mjs) has physical feature modules, two K advisory extensions, three+ S features, B/C and exact BUILD pin. ModuleSource is sealed, not loose CommonJS dynamic injection.
- [#1267](https://github.com/kaicreator-mm/domain-harness/issues/1267) identifies **actual semantic decision routing gap**: state-changing T02/T03 S feature routing was Host facade-only; must rejoin Standard Primary→K path. Four proposed features are read-only/advisory and must never route a state-changing event outside K.
- [#1270](https://github.com/kaicreator-mm/domain-harness/issues/1270) verifies real atomic genesis gap. This version cannot silently treat v0.10 Kernel races as fixed.

### Epistemics
\`SOURCE_INSPECTED\` for ABI and example by referenced Git blobs; \`SOURCE_PROTOTYPE\` for C01–C04 separate draft PRs; V8 direct contract checks, **NOT_NODE24_BUILD**, **NOT_PHYSICAL_INSTALL**, **NOT_INDEPENDENT_REVIEW**, **NOT_RELEASE_QUALIFIED**.

### L1 decision to request from independent Product reviewer
Reject new Kernel package in this feature suite unless separately evidenced required invariant cannot be achieved with existing K Primary + S/C composition; if a K extension is needed it is advisory only. Admit C01–C04 as optional Standard Feature packages only after contract/test scope approved; for C05 choose reuse by default pending exact-current API proof. Missing direct runtime execution evidence must not be papered over by source-only checks.
