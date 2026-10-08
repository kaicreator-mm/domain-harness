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
| A1 true Kernel-origin bootstrap | trusted Kernel pin; Kernel executable linker stages SDK/Business; missing Kernel impl refuses | PASS (sandbox only) |
| A2 deterministic link and refusal | exact Git blob bytes + package version/dependency + selected provider, digest; negative vectors refuse | PASS (sandbox only) |
| A3 nodes and Capability scopes | 0 WAIT, 1 selection, N priority routing; approval and learning execute through bound rule/action | PASS (sandbox only) |
| A4 mutation/outcome sketch | single in-memory revision path; refused commit has no mutation; explicit UNKNOWN/CANCELLED and duplicate refusal | PASS (toy sketch only) |
| A5 version and occurrence isolation | Business-only version change makes new digest/branching; old receipts retain old assembly; rebind refused | PASS (sandbox only) |
| A6 real consumption and repeatability | actual implementation substitution changes approval result; single fresh-checkout Node test command | PARTIAL (designated Build Host not run) |

`DEMO_ARCHITECTURE_VERDICT=PARTIAL` until independently verified on a real authorized Build Host. `REAL_DESIGNATED_BUILD_HOST_TESTS=NOT_RUN`. `GATE_B_V07_BEHAVIORAL_PARITY=NOT_TESTED`. `RELEASE_PASS=NO`. `INDEPENDENT_READ_ONLY_REVIEW=NOT_RUN`.

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
