# DomainHarness v0.9 — Scope Intake and Reuse Ledger

> **STATUS = BACKLOG_CAPTURED / L1_NOT_ADMITTED / NOT_PRD / NOT_FROZEN / NOT_TASK_DAG / NO_IMPLEMENTATION / NO_RELEASE_PROMISE.**
> This is the roadmap index for [v0.9 Register #1026](https://github.com/kaicreator-mm/domain-harness/issues/1026) and six **candidate** intake issues. It is **not** an executable DAG or approved mandatory release scope. Created after the 2026-10-13 user architecture discussion and a bounded [v0.8 Package-first scope ledger](https://github.com/kaicreator-mm/domain-harness/blob/docs/v08-package-first-closed-world-scope-20261013/docs/implementation/DomainHarness_v0.8_PACKAGE_FIRST_SCOPE_DELTA.md). No changes to v0.8 PRD, L1/L2 Freeze, Task DAG, source or release gates.

## 1. The v0.8→v0.9 boundary

**v0.8 retains mandatory closure** under [#1023](https://github.com/kaicreator-mm/domain-harness/issues/1023) and existing formal T-A–T-G ([#1000–#1006](https://github.com/kaicreator-mm/domain-harness/issues/1006)): minimally extensible closed-world BUILD/Package ABI, minimal lifecycle and unified safe OperationCall, actual Node physical baseline, selected K/S, two Approval/Engineering Domain Apps, FR/HF/NF preservation, full/hidden/critical-journey/release tests.

**v0.9 is a candidate evolution backlog:** do not block or duplicate v0.8's implementation; reuse v0.8's exact released K/S/Business/Node code, real test oracles, host security, qualified BUILD and failure evidence. At v0.9 L1 kickoff, select a bounded executable minimum **per candidate** rather than assuming all rows are release gates.

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

## 3. Entry/exit gates to prevent another pre-research loop

1. **v0.8 first:** complete #1003 T-D, #1005 T-F, #1023 bounded Package-first and #1006 T-G; capture actual reusable source SHA, tested K/S/Host baseline, defects and deployed artifacts. No v0.9 scope can retroactively weaken or expand v0.8 Product acceptance.
2. **v0.9 L1/Product:** evaluate each N01–N06 as `IN`, `DEFER` or `REJECT` using concrete user/application evidence and expected marginal cost. Work backwards from executable capabilities and real Domain App needs, not from a desire to make platform abstractions complete.
3. **v0.9 L2/contract:** for admitted scope, map Package capability owner vs H assurance vs external platform implementation; prove ABI/Dependency/external Tool Calls without duplicate Kernel. Build cross-repo exchange Contract (if N03 admitted).
4. **v0.9 Task DAG/L3:** only after L2 evidence, create concern-sized build issues/PRs, distinct write sets, environment/CI readiness and meaningful cross-engine validation gates; reuse already tested code and oracles from v0.8.
5. **Version closure:** real tests (incl. faults, authorization, no false ACK, clean package consumer, replay/currentness), independent source/security review, Full/Hidden/Critical Journeys/packaging and Release Qualification. `PR_PASS != RELEASE_PASS`.

## 4. Explicitly unresolved Product choices

- N01/N02: minimum two real capability-sharing use cases, which runtime/platform environments are actually supported, whether browser/embedded is worthwhile now.
- N03: whether cross-project E2E generation is part of **domain-harness v0.9 release** or a separately versioned integration campaign; who owns each release gate.
- N04: ABI portability first vs actually executing same JS Package with one embedded QuickJS consumer, including Node API and native adapter costs.
- N05: which advanced operations are justified; agent read-only prohibition and closed-world loading preserved unless Product revision.
- N06: how to package and qualify only selected supported platforms; no accidental requirement for 4 runtimes and dual platform certification.

**Next action (on explicit v0.9 kickoff only):** produce a short L1 adoption/deferral table, PRD, architecture evidence and a minimal real-app-driven Task DAG. Do not reopen the existing v0.8 Design Chronicle to create v0.9 prerequisites.
