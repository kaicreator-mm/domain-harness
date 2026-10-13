# DomainHarness v0.9 — Production-Ready Node SDK Scope and Reuse Ledger

> **STATUS = USER_APPROVED_PRODUCTION_EXIT_TARGET / L1_NOT_FROZEN / L2_NOT_FROZEN / NOT_TASK_DAG / NO_IMPLEMENTATION / NO_RELEASE_PASS.** Scope is a Product **target**, not an independently accepted freeze or an executable work authorization.
> This is the roadmap index for [v0.9 Register #1026](https://github.com/kaicreator-mm/domain-harness/issues/1026) and six **candidate** intake issues. It is **not** an executable DAG or approved mandatory release scope. Created after the 2026-10-13 user architecture discussion and a bounded [v0.8 Package-first scope ledger](https://github.com/kaicreator-mm/domain-harness/blob/docs/v08-package-first-closed-world-scope-20261013/docs/implementation/DomainHarness_v0.8_PACKAGE_FIRST_SCOPE_DELTA.md). No changes to v0.8 PRD, L1/L2 Freeze, Task DAG, source or release gates.

## 1. The v0.8→v0.9 boundary

**v0.8 retains mandatory closure** under [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023) and existing formal T-A–T-G ([#1000–#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006)): minimally extensible closed-world BUILD/Package ABI, minimal lifecycle and unified safe OperationCall, actual Node physical baseline, selected K/S, two Approval/Engineering Domain Apps, FR/HF/NF preservation, full/hidden/critical-journey/release tests.

**v0.9 is now a production-readiness version:** its exit target is a **supported Node SDK for actual independent consumers**, not a feature-preview. Reuse exact released v0.8 K/S/Business/Node code, tested oracles, Host security, qualified BUILD and failure evidence. The bounded minimum for N01/N02, plus N06/N07/N08/N09, is the **P0 target**; the rest of N01/N02 and N03–N05 are optional value expansions. L1 selects technical scope and measured support limits, without weakening that release target.

### Architectural invariants

- `domain-harness` delivers embeddable SDK = minimal Microkernel + official Kernel and Standard Domain Packages and Package ABI. `DomainHarness.load(package)` loads an already built fixed Assembly of approved Packages. SDK does **not** own business state/Effect/Journal or compile arbitrary domain products at runtime.
- Capability definitions, Tool/Operation Handler, target-specific implementations, init/dispose and tests are owned by **their respective Domain Packages**. Node/browser is a *platform implementation axis*, **not** an independent `host-node` Domain Package.
- `Component → Capability → Operation → Handler` standardizes callable operations. Non-callable semantic definitions like Schema are **not** tools by default. BUILD selects exact bound handlers and deployment accepts immutable actual artifact bytes; Microkernel is not a fresh Package admission authority.
- Native caller/currentness and independent pre-execution H assurance remain separate from BUILD package selection; K owns actual Admission/Effect/Journal/UNKNOWN/Replay. v0.8 agent/LLM tool projection stays **read-only** absent a later Product decision.
- Portable future direction: TS authored → portable JS ESM → one of several runtime engines (possibly QuickJS embedded by Rust/Go/C host), using Package-owned native external functions where JS lacks platform APIs. QuickJS is not Node; **do not promise** all native adapters vanish upon rewriting Microkernel.
- No v1.0-before compatibility burden, dynamic arbitrary loading/registry by default, unbounded demos/research or new general Host authority.

## 2. v0.9 candidate intake — N01–N06

| ID | Candidate Issue | Candidate value | Prerequisite / scope guard |
| --- | --- | --- | --- |
| **N01** | [#1027 Capability-owned Domain Package family](https://github.com/kaicreator-mm/domain-harness/issues/1027) | Reusable Storage/File/Network/Model/Script/Device capabilities; owner-specific ABI and dependencies | Begin with 1–2 needed real capabilities; not a full marketplace |
| **N02** | [#1028 Capability-owned platform implementations](https://github.com/kaicreator-mm/domain-harness/issues/1028) | Node/Browser/Embedded adapters + bounded central physical Host code convergence | Preserve all frozen H-role assurance and Node physical tests; extra target requires actual evidence |
| **N03** | [#1029 Generated executable Domain App integration](https://github.com/kaicreator-mm/domain-harness/issues/1029) | Forge Business Package generation, Creator assembly, Simulator verification, domain-ux, DAC boundary | Cross-repo contract/owner decisions before scheduling, no Forge compiler in Harness Microkernel |
| **N04** | [#1030 Portable JS / QuickJS](https://github.com/kaicreator-mm/domain-harness/issues/1030) | Portable JS ABI, optional QuickJS + Rust/Go/C Microkernel candidate, native External Functions | L1 decide ABI-only vs real cross-language consumer; not automatically v0.9 Release P0 |
| **N05** | [#1031 Advanced OperationCall runtime](https://github.com/kaicreator-mm/domain-harness/issues/1031) | Streaming, cancellation, bounded remote calls and effect-safe controls where needed | No dynamic packages or agent effectful Tool privileges without new Product authorization |
| **N06** | [#1032 SDK delivery and multi-engine qualification](https://github.com/kaicreator-mm/domain-harness/issues/1032) | Clean SDK distribution, Package packaging, exact-SHA ABI/version/release tests | Follow **only admitted** runtime/platform scope; avoid infrastructure-led scope expansion |

**Intake state for ALL N01–N06:** `CAPTURED`, `L1_NOT_ADMITTED`, `L2_NOT_FROZEN`, `NO_FORMAL_TASK_DAG`, `NO_SOURCE_WRITE`, `NO_TEST_PASS`.


## 2a. Controlling v0.9 production-readiness scope (user-directed 2026-10-14)

**Product promise at v0.9 terminal:** A fresh third-party Node consumer, using **only official versioned SDK/Package artifacts and documented public interfaces**, installs an independently approved **closed-world** Domain App, calls it over the Host-authenticated capability-limited SDK interface, executes two distinct real business applications using the same K/S, performs safe operation calls and recovers under supported physical faults. Exact support and security boundaries are documented. The app can be deployed/operated/diagnosed and independently reinstalled from immutable published artifacts. Missing proof → `V09_RELEASE_HOLD`, never `PRODUCTION_READY`.

| Target | Issue | Concrete minimum for Release P0 | Explicitly optional after minimum |
| --- | --- | --- | --- |
| N01-min | [#1027](https://github.com/kaicreator-mm/domain-harness/issues/1027) | A truly reusable capability Package with independent clean consumer and >=2 meaningful business users, owned Handler/Node adapter/init/dispose; no Microkernel role switch | Full Storage/File/Network/Model/Script/Device collection |
| N02-min | [#1028](https://github.com/kaicreator-mm/domain-harness/issues/1028) | Supported physical Node capability realization and original independent H assurance preserved; actual approved bytes, currentness, auth, CAS | Browser/Embedded parity, full Host directory reorganization |
| N06 | [#1032](https://github.com/kaicreator-mm/domain-harness/issues/1032) | Reproducible versioned SDK+Package distribution, immutable manifest/provenance, typed ABI, external install and explicit host/OS/SQLite support | Publishing on npm if immutable exact-pinned artifacts suffice; multi-engine matrix |
| N07 | [#1035](https://github.com/kaicreator-mm/domain-harness/issues/1035) | Public SDK v0.9 API and types, safe authenticated operations and sample, Quickstart/consumer DX; no source/private import | Additional frameworks and old pre-v1 compatibility |
| N08 | [#1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | Deployment lifecycle, recovery/fault diagnosis, safe observability, operator runbook, measured support/stability envelope | Cloud-scale telemetry platform, broad orchestrator |
| N09 | [#1037](https://github.com/kaicreator-mm/domain-harness/issues/1037) | Independently executed security, real current Node/SQLite fault, Full/Hidden/Critical Journeys, clean consumer and exact-SHA Release Qualification | Cross-language native QuickJS verification if not Product-admitted |

**Optional N03/N04/N05:** [#1029](https://github.com/kaicreator-mm/domain-harness/issues/1029) complete Forge/Creator/Simulator/UX generated-app platform integration; [#1030](https://github.com/kaicreator-mm/domain-harness/issues/1030) QuickJS/native cross-language Microkernel; [#1031](https://github.com/kaicreator-mm/domain-harness/issues/1031) streaming/cancel/remote calls and broader Tool protocol. **None is inherently required for the first Node SDK Production PASS.** N05 dynamic unapproved Package discovery and agent-effectful tools additionally require a new explicit Product authority decision. A **hand-authored** independent real Domain App is acceptable for SDK production readiness.

**Do not transfer v0.8 blockers:** [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023) minimal Capability/lifecycle/Operation ABI + static safe installed artifact; [#1003](https://github.com/kaicreator-mm/domain-harness/issues/1003) retained functions; [#1005](https://github.com/kaicreator-mm/domain-harness/issues/1005) Approval+Engineering; [#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006) retained FR/HF/NF, Full/Hidden/critical journeys and release are **v0.8 MUST**. If any is missing, keep v0.8 `RELEASE_HOLD`. v0.9 adds stronger **consumer support, distributions, operations and fresh v0.9 qualification**; it does not repair a falsely certified earlier release or alter frozen v0.8 Product owners.

### v0.9 executable production exit checklist — all mandatory, but not yet PASS

- [ ] Actual accepted, tagged/baselined v0.8 Release PASS and inherited protection behavior, with exact adoption inventory
- [ ] One immutable official v0.9 SDK/K/S/Capability distribution, build-qualified and independently accepted before executable import; verify identity/currentness on **every startup/restart**, no post-acceptance forged root or caller
- [ ] Reusable capability with distinct business consumers, genuine Handler operation and lifecycle using only selected K-owned Admission/Journal/Effect/UNKNOWN; read-only Agent tools, no direct unauthorized effect
- [ ] Two real Approval+Engineering Apps, same v0.9 K/S, typed UX authentic principal; production-supported Node+SQLite, current caller read/subscribe permissions and revocation
- [ ] Independent clean project install/compile/launch with **documented public** SDK/Host APIs, published types/error contracts, Quickstart, sample and supported environment matrix
- [ ] Real Node physical competing CAS, crash/UNKNOWN/replay, denied/poison/stale currentness, resource failure/cleanup and tested bounded recovery; no false durable ACK and no secret leaks
- [ ] Operator diagnostics, redacted logs/metrics, instance correlation, supported backup/restore, update/rollback/incident and failure runbook with at least one actual exercise
- [ ] Full Regression + Hidden Validation + Critical Journeys + Security Review + Packaging + independently verified exact-v0.9-sha Release Qualification, zero unwaived P0/P1, qualifying tag/baseline

**Support scope:** v0.9 must name the tested Node/OS/native SQLite profile, unsupported features and operator assumptions; non-Node QuickJS/Browser and externally generated Forge app lifecycle are optional unless future L1 deliberately admits them. Being "production-ready" means qualified **for this supported profile only**, not universally safe or bug-free.

## 3. Entry/exit gates to prevent another pre-research loop

1. **v0.8 first:** complete #1003 T-D, #1005 T-F, #1023 bounded Package-first and #1006 T-G; capture actual reusable source SHA, tested K/S/Host baseline, defects and deployed artifacts. No v0.9 scope can retroactively weaken or expand v0.8 Product acceptance.
2. **v0.9 L1/Product:** treat P0 N01-min/N02-min/N06/N07/N08/N09 production exit outcomes as user-directed **target requirements**, define limited technical implementation and actual support/SLO thresholds; evaluate full N01/N02 and N03/N04/N05 as `IN`, `DEFER` or `REJECT` using evidence and marginal cost. Work backwards from executable capabilities and real Domain App needs, not from a desire to make platform abstractions complete.
3. **v0.9 L2/contract:** for admitted scope, map Package capability owner vs H assurance vs external platform implementation; prove ABI/Dependency/external Tool Calls without duplicate Kernel. Build cross-repo exchange Contract (if N03 admitted).
4. **v0.9 Task DAG/L3:** only after L2 evidence, create concern-sized build issues/PRs, distinct write sets, environment/CI readiness and meaningful cross-engine validation gates; reuse already tested code and oracles from v0.8.
5. **Version closure:** real tests (incl. faults, authorization, no false ACK, clean package consumer, replay/currentness), independent source/security review, Full/Hidden/Critical Journeys/packaging and Release Qualification. `PR_PASS != RELEASE_PASS`.

## 4. D01–D04 Foundation / Profile / Support / Plan — now decision-ready proposals

User direction is fixed: **v0.9 must ship a production-qualifiable Node SDK**, not merely an abstract protocol. Current **candidate Product specification** (requires one independent exact-HEAD Product L1 review before normative Freeze):

- **D01 Foundation Package Set:** [Product foundation contract](../product/DomainHarness_v0.9_FOUNDATION_PACKAGE_SET.md) — SDK Microkernel, independently addressable/versioned Kernel Basic, Standard Basic **including Workflow and WorkflowRouter**, Identity and SQLite Storage Capability Packages; BUILD Toolchain is not a Domain Package. `Runtime Profile` is only locked metadata, **not** a second Runtime/State/Journal owner.
- **D02 Node Basic Profile:** same foundation document — Build-fixed exact versions, digests, K/S selected bytes, capability handlers and Node target; independent actual-artifact H assurance + per-start DAC currentness; no dynamic plugin/Host-domain package. Actual IDs/metadata spelling remains an **L2 ABI decision**, not a preexisting API.
- **D03 Node support and budgets:** [Node production qualification](../product/DomainHarness_v0.9_NODE_PRODUCTION_QUALIFICATION.md) — proposed Ubuntu 24.04 x86_64 / Node24 / pinned native SQLite **P0**, Windows 11 Node24 and Ubuntu Node22 **candidate**; proposed concrete PERF-01..07 targets for startup, 30-min workload, p95/p99, reliability, memory, lifecycle, backup, security. **All targets NOT YET MEASURED.** One Product-approved calibration allowed from actual v0.8 baseline **before freeze**.
- **D04 Formal process:** [small DAG proposal](../implementation/DomainHarness_v0.9_TASK_DAG_PROPOSAL.md) maps existing #1027/#1028/#1032/#1035/#1036/#1037 into Foundation → Node profile + public consumer + distribution → operations → independent v0.9 version qualification. **Proposed dependencies only, no formal GitHub DAG/claim or source authorization.** Exact L1 review and Product Freeze, then L2 and DAG; v0.8 Release PASS needed before new version source implementation.

**Outstanding externally verifiable questions rather than open-ended architecture exploration:** actual v0.8 released baseline, accessible native Ubuntu24/Node24 Build Host, independent Product/L1 review and any one bounded threshold adjustment, then L2 exact ABI/security freeze. N03/N04/N05 and full capability/cross-platform ecosystem remain optional. Avoid new Demo/Research rounds.

**Next action (after this docs-only PR's independent Product review):** formalize this user-selected production-exit contract through L1/PRD and fresh Product Review, decide limited support profiles/metrics and optional expansions; then L2 and a minimal real-app-driven Task DAG. Do not reopen the existing v0.8 Design Chronicle to create v0.9 prerequisites.
