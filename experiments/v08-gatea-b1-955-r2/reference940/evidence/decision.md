# #938 — Architecture-spike decision (sandbox evidence)

## Frozen subject / isolation

- Research authority: `kaicreator-mm/domain-harness#932`; execution exception: `#938`.
- Branch: `spike/v08-package-first-bootstrap-938` only; `main` frozen at base `535fd267a804e3c65c84718b3e55a527172721ac`, tree `355e38d9f4f13b8d3c412a02de0b07a2b1dde4e7`.
- Read-only v0.7 ref at claim: `b9d3df4e7a59dbe845b7bd03fd29b9d442a15f8b`, tree `39b210cb1071c03bbdc2fb7524b4a8d80394799a`.
- Final Git commit/tree: **bind to the final remote commit in the #938 terminal; this file is not a substitute for the exact-SHA terminal**.

## Sandbox execution (not designated project Build Host)

- Command, from experiment dir: `node --test tests/spike.test.mjs`.
- Environment: isolated ChatGPT Linux x86_64 container; Node v22.16.0; kernel Linux 6.18.44; no Windows workstation, local ECF Woodpecker VM, or real device.
- Sandbox test exit code `0`; `18` tests, `18` passed, `0` failed, `0` skipped (see `sandbox-test.tap`).
- Tests cover 3-layer boot, real loaded implementation, 2 different business packages, 0/1/N adaptive routing, exact Assembly reproducibility, manifest/module tamper, missing Kernel implementation, absent/ambiguous provider, incompatible dependency, cycle, bad selection, wrong operation contract, malformed Component, unauthorized invocation, failed state admission, explicit UNKNOWN/CANCELLED, version drift, frozen bindings and concrete implementation replacement.
- This is **real code execution in a container**, but not an established project Build Host. Do **not** relabel it as project-host or cross-host validation.

## A1–A6 matrix / decision

| Check | Observed sandbox evidence | Acceptance posture |
| --- | --- | --- |
| A1 true Kernel-origin bootstrap | trusted Kernel pin; Kernel executable linker stages SDK/Business; missing Kernel impl refuses | PASS (sandbox + real Linux CI host) |
| A2 deterministic link and refusal | exact Git blob bytes + package version/dependency + selected provider, digest; negative vectors refuse | PASS (sandbox + real Linux CI host) |
| A3 nodes and Capability scopes | 0 WAIT, 1 selection, N priority routing; approval and learning execute through bound rule/action | PASS (sandbox + real Linux CI host) |
| A4 mutation/outcome sketch | single in-memory revision path; refused commit has no mutation; explicit UNKNOWN/CANCELLED and duplicate refusal | PASS (toy sketch on real Linux CI host; NOT production journal) |
| A5 version and occurrence isolation | Business-only version change makes new digest/branching; old receipts retain old assembly; rebind refused | PASS (sandbox + real Linux CI host) |
| A6 real consumption and repeatability | actual implementation substitution changes approval result; single fresh-checkout Node test command | PASS (real GitHub Actions Linux Build Host; designated Windows/ECF NOT_RUN) |

`DEMO_ARCHITECTURE_VERDICT=PASS` for bounded **architecture feasibility only** (A1–A6 tested on a real hosted Linux Build Host). `REAL_TESTS=PASS_GITHUB_ACTIONS_UBUNTU_NODE22`. `PROJECT_DESIGNATED_WINDOWS_ECF_TESTS=NOT_RUN`. `GATE_B_V07_BEHAVIORAL_PARITY=NOT_TESTED`. `RELEASE_PASS=NO`. `INDEPENDENT_READ_ONLY_REVIEW=NOT_RUN`.

## Hypotheses for any future v0.8 L1 decision (NOT an implementation authorization)

| Core area | Initial posture | Further evidence required |
| --- | --- | --- |
| Package-first Kernel-origin linker + package descriptor compiler | REWRITE candidate | trust root/host rights, verifier proofs, structured exact-version resolution |
| Capability requires/provides and sealed Assembly/operation scopes | ADAPT candidate | compare real v0.7 ABI and currentness semantics; error contract |
| Pure hashing, immutable records, deterministic resolver utilities | REUSE candidate | audit v0.7 implementation and conformance vectors, do not blindly copy |
| Node-local bounded workflow adapter | ADAPT candidate | map existing Domain Machine, guards, repeat fairness, simulator replay |
| State, Central Admission, durable journal, unknown outcome, replay | NEEDS_EVIDENCE (REWRITE forbidden for now) | v0.7 golden oracle, exact host failure injections, recovery/retention |
| Legacy public SDK/host portability surfaces | NEEDS_EVIDENCE (REUSE/ADAPT decision pending) | clean consumer ABI, Expo/Hermes and Node parity |
| Redundant dynamic generic SDK registry/LLM router (if any) | RETIRE hypothesis | confirm actual usage, no blanket retirement |

No full v0.8 SDK, PRD, version branch, Task DAG or main merge is proposed by this spike.

## Independent Linux Build Host verification (GitHub Actions)

- Materialization-run: https://github.com/kaicreator-mm/domain-harness/actions/runs/37769708024 ; isolated GitHub-hosted Linux x86_64, Node v22.23.3, 18/18 PASS, exit 0. Tested transport/input SHA 577d54b46d17289235ecc20cdb8452d424de5431; resulting published source SHA 947a606cf47eba151a99a151000f299f8f27050f. Exact checked-out source contents and TAP output are preserved in `evidence/actions-test.tap`.
- A later standalone exact-SHA direct-source workflow checks the final branch head and includes the additional Component Capability cycle falsification test. Its terminal status/run URL is recorded in #938, **not preclaimed here**.
- Linux hosted runner **is an actual Build Host**, but not the project's Windows workstation or ECF Woodpecker VM. `PROJECT_DESIGNATED_BUILD_HOST_TESTS=NOT_RUN` remains true.

## Gate A final direct-source execution snapshot

- Exact tested source commit: `21382c66eb1c05b0d21e9aa4006f0b1b66e3bc86` / tree `c9fe89d17dd8c392aea22fa8bc477418fc5c329d`.
- GitHub Actions Linux real Build Host: https://github.com/kaicreator-mm/domain-harness/actions/runs/37770008591 ; Node v22.23.3; `node --test experiments/v08-package-first-bootstrap/tests/spike.test.mjs`; tests `19/19 PASS`, `0 FAIL`, exit code `0`; both approval and learning smoke demonstrations executed successfully.
- The latest documentation-only commit is revalidated by an exact-SHA GitHub Actions run; its run URL is written to the #938 terminal after completion. Never confuse its code SHA with the earlier tested code SHA.
- This is an **architecture spike** only: the real GitHub hosted Ubuntu runner is not the repository's designated Windows/ECF Build Host, and no production-equivalence or release gate is implied.

## Bounded repair / independent review follow-up (PR #940)

- Review source: https://github.com/kaicreator-mm/domain-harness/issues/938#issuecomment-6059040182
- P1-F1: 3- and 4-Package closed composition tested with exact caller-supplied dependency pins, real support capability consumption, orphan/duplicate/missing/cycle refusal. No dynamic/plugin registry.
- P1-F2: business Workflow moved from manifest top-level into `workflow.definition@1` Semantic Component with bound `business.workflow@1.resolve` operation, consumed through SDK scoped context; malformed/missing/manifest bypass and implementation-replacement probes added.
- P2-L1: SUCCESS commit-before-receipt failure is **diagnosed, deliberately not fixed**. Injected failure and duplicate receipt demonstrate committed revision without matching receipt; no durable parity claim.
- Local isolated Node 22 test command: `node --test experiments/v08-package-first-bootstrap/tests/spike.test.mjs`. Local dry run: 24/24 PASS, smoke approval+learning PASS; this is NOT a substitute for exact-new-SHA real-host evidence. See GitHub Issue #938 follow-up terminal / GitHub Actions run for exact commit result after push.
- Gate B v0.7 behavioral parity: NOT_TESTED; production durable journal/central admission/host isolation: NOT_PROVEN; draft PR not merge-authorized.
