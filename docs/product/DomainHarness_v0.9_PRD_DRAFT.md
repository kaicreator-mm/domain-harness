# DomainHarness v0.9 — Production-Ready Node SDK PRD (Draft / Not Frozen)

```ini
DOCUMENT_STATE=CONTENT_REVIEW_PASS_P2_CLOSURE_PROPOSED_L1_NOT_FROZEN
VERSION=v0.9
PARENT_ISSUE=#1026
BASELINE_REQUIRED=v0.8_RELEASE_QUALIFIED
L1_PROPOSAL_CONTENT_REVIEW=PASS_AT_1033_10aa58b_P2_3
INDEPENDENT_DISTINCT_ACCOUNT_APPROVAL=NOT_CLAIMED
PRODUCT_FREEZE=NO
L2=NOT_ADMITTED
TASK_DAG=NOT_ADMITTED
IMPLEMENTATION=NOT_STARTED_BY_THIS_DOC
RELEASE=NO
```

## 1. Objective and measurable success

**Job to be done:** A real, independent Node application developer/administrator must be able to **install, configure, execute, authenticate, recover, observe and support** a DomainHarness Domain App from **official versioned SDK + Domain Package artifacts**, without source checkout, special test fixtures or privileged deep imports. The SDK is ready for a **specified supported production environment** — not automatically all operating systems, JS engines, external threat models or the entire Domain App generation ecosystem.

### Release decision

`V09_PRODUCTION_READY=PASS` requires **all P0 Requirements PR-01–PR-09** and all P/N evidence witnesses below, independent exact-SHA Release Qualification, zero unresolved unwaived Product/security P0/P1 and a tested operator/developer guide. Otherwise `V09_RELEASE_HOLD` regardless of PR CI pass.

**Release prerequisites:** v0.8 has already passed its **own** frozen Product/L2 and #1023 minimum Package-first contract, T-D functional retention, T-F two real Apps, T-G Full/Hidden/Critical Journeys/clean consumer/Release/Tag. Do not migrate undone v0.8 requirements here. Imported v0.8 code is a reference/evidence asset; changed v0.9 artifacts require new-version verification.

## 2. Product identity / unchanged boundaries

- `domain-harness` ships **SDK Microkernel** plus official Kernel/Standard Domain Packages and a consuming ABI. A **closed-world Domain App** is a fixed independently approved selected Package composition with a separate UX, not a generic LLM agent, a dynamic package marketplace or the Runtime/compiler of domain-forge.
- `DomainHarness.load(package)` receives a **build-prelinked, independently accepted immutable App handle**. Package membership, version/target/Handler binding and build identity are qualified before runtime; installation/activation independently verifies actual approved bytes/current designation before ANY unapproved module code executes. Reject forged root, byte substitution, alternate K or stale/expired/revoked activation.
- Minimal Microkernel owns only load/binding/hook lifecycles. **Kernel Package** alone owns State/Guard/Admission/Effect/Journal/UNKNOWN/Replay. **Standard Package** owns reusable Kind/Decision/Workflow semantics. **Business Packages** own business rules. Each added capability owns its Operation contract, Handler, platform adapter and optional lifecycle. No general `host-node` Package or duplicate Kernel Runtime.
- H assurance still owns independent artifact, caller provenance and physical selected capability guarantees required by frozen Product. Actual request identity is dynamic (issuer, role, tenant/app/instance, currentness); H→K protected binding only, no caller/Business self-signed verified facts. Agent/LLM Tool surface remains **read-only by default** and cannot invoke effectful mutation without a separate future Product authority change.
- Real target is **production-qualified Node SDK**; TS→portable JS/QuickJS/non-Node runtimes may evolve in N04 but are not required for first production release.

## 3. P0 requirements / ownership / falsifiable acceptance

| ID | Requirement and accountable intake Issue | Positive acceptance | Required failure/negative |
| --- | --- | --- | --- |
| **PR-01** | Official versioned, reproducible SDK+BUILD+K/S+selected Capability artifact distribution; [N06 #1032](https://github.com/kaicreator-mm/domain-harness/issues/1032) | Independently install exact pinned release in a fresh repo, verify manifest/bytes/types/ABI/host profile and build/run | Tampered/unsigned/wrong ABI/target/package bytes, shadowed handler, missing dependency refused preimport/pre-effect |
| **PR-02** | Public safe SDK API and independent onboarding; [N07 #1035](https://github.com/kaicreator-mm/domain-harness/issues/1035) | SDK reference+Quickstart+typed API/error catalog and separate real consumer using public exports only, with supported Host bootstrap→load→authenticated send/query/subscribe→stop | Deep internal exports not required, forged principal/private port, missing capability, unsupported surface typed denied |
| **PR-03** | Package owner/ABI reuse; [N01-min #1027](https://github.com/kaicreator-mm/domain-harness/issues/1027) | At least one truly independently distributed reusable capability implemented by owning Package and shared by **two actual Business consumer contexts** without a Microkernel branch; pure and effectful Operations / lifecycle verified | Wrong provider, duplicate/late handler, unapproved effectful/agent operation, forged capability handle: zero unauthorized State/Journal/Effect |
| **PR-04** | Profile-qualified Node deployments; [N02-min #1028](https://github.com/kaicreator-mm/domain-harness/issues/1028) | Intended Windows/Linux Node24+SQLite platform families chosen at L1; exact supported target profiles published only after real selected-env native SQLite ABI/CAS/restart/clean-consumer proof | Unsupported Node/OS/driver typed refusal with no false safe profile, no central Host-owned policy |
| **PR-05** | Authentication/currentness/closed-world deployment safety; [N09 #1037](https://github.com/kaicreator-mm/domain-harness/issues/1037) | Independent issued/build-selected/actual executed bytes bound before import on **every initial activation and restart**, protected caller identity, denied revocation/scope and read/subscribe | Revoked after install, forged Root B after acceptance, substituted bytes, caller/LLM-provided authority: refused before unauthorized import/mutation |
| **PR-06** | Durable domain behavior; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | Two real Approval + Engineering apps on **same exact v0.9 K/S**, verified Workflow/Rule/Decision/Operation+UX, storage/Journal/UNKNOWN/replay, optional observed model-count truth | Concurrent CAS, crash, replay, duplicate Effect, stale observer, wrong SHA lineage, false durable ACK, absence of effect permission fail safely |
| **PR-07** | Operability and support; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | Deterministic init/cleanup/restart; redacted structured logs, diagnostics, correlation IDs, operator backup/recovery/rollback and incident guide exercised in a fresh consumer | Resource leak, secrets in output, false healthy/false durable recorded receipt, infinite retries/silent fallback |
| **PR-08** | Measurable supported-profile service quality; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | **At v0.9 L1 freeze** specify: supported Node/OS/SQLite profiles, concurrency workload, maximum authorized latency distribution, allowed failure/cleanup window, resource bounds and sample size; then record independent measured actual results | Unsupported profile, overloaded bounded queue, failed health/restart/performance envelope gets explicit `NOT_QUALIFIED`, not a silent production PASS |
| **PR-09** | Release/QA qualification; [N09 #1037](https://github.com/kaicreator-mm/domain-harness/issues/1037) | Full/Hidden/Critical Journeys/Packaged Consumer/Security/independent review/release exact-SHA, supported matrix, dependency/provenance report, release tag/baseline | Missing required test, unwaived safety P0/P1, reused stale old-head PASS, absent consumer/Host evidence or no provenance => `RELEASE_HOLD` |

**Minimum support-profile policy (user-directed platform-neutral successor):** v0.9 baseline is **Node 24 + pinned native SQLite** with separately testable Windows and Linux platform targets. WSL2/VM/container are valid declared runtime/test environments, not automatically equivalent to generic Windows or native Linux. **No required Ubuntu 24.04, bare metal or separate native Linux host** for Product/L1 Freeze; environment and PERF-01..07 evidence are candidate **Release Qualification** gates per claimed supported profile. The release must qualify at least one explicit operationally deployable profile and must not advertise a Windows+Linux combination unless both are independently verified. Node22/24 Windows/Ubuntu acceptance of **v0.8** remains untouched. Product/L1 freezes measurable target criteria, not fabricated pass results; support claim is published only for proven profiles.

## 4. Three real product journeys (no third demonstration wave)

**J1 — New SDK consumer integration:** independent developer uses Quickstart and released artifact → identity/dependency qualified by BUILD → external H accepts and statically pins App → safe public API opens selected immutable composition → legitimate principal reads/sends through authenticated gateway → receives typed receipt/query/subscribe and stops; replay in fresh process. Negative: missing/forged/shadowed package, fake caller, deprecated deep import never grants State/Effect.

**J2 — Production domain execution/ops:** same v0.9 K/S supports actual Approval and Engineering Business Packages. True data/Workflow transitions, Effect and real SQLite Journal; restart/race/UNKNOWN/recovery preserves durable truth; H-verifiable caller scope and read/subscribe revocation. No toy fixture or Host-private second state machine.

**J3 — Operations/security incident:** operator receives a typed recoverable/no-false-ACK failure, uses redacted correlation/metrics/runbook for safe restart; revokes approved deployment or credential; re-activation refuses before module import; production node stays safe and operator can restore data according to declared backup profile. Independent validator tests expected denial and resource cleanup.

## 5. Minimum release source & test matrix

- **External API:** exact exported package/subpaths + types + Node ESM profile + error shape + clean install from versioned artifact, no dev fixtures.
- **Package:** separately distributable capability + selected K/S + B1/B2, immutable independent approval, prelinked handle, activation-currentness/retained H assurance, lifecycle.
- **Safety:** agent Tool read-only; actual caller authenticated H→K, currentness, cross-tenant read/subscribe controls, Kernel admission/Journal/Effect with no direct Tool bypass.
- **Physical failure:** Node/SQLite CAS concurrent writers, crash windows, UNKNOWN/idempotency, disk error, unsupported capability, ModelPort fail/unmeasured, cleanup; exact current SHA and expected P/N.
- **Product:** 2 distinct completed Apps on same selected K/S, reusable capability; retained v0.8 useful semantics not removed.
- **Security & Supply Chain:** immutable installed executable bytes, anti-substitution after acceptance, revoked activation, dependency/version/hash transparency, clean consumer and independent review.
- **Release:** zero unwaived P0/P1; Full, Hidden, CJ, Security, Packaging, Release Qualification and tag on exact final candidate. `PR_PASS != RELEASE_PASS`.

## 6. Mandatory vs optional future candidates

**P0 Product target:** N01 **minimum only** (#1027), N02 **Node minimum only** (#1028), N06 (#1032), N07 (#1035), N08 (#1036), N09 (#1037).

**NOT v0.9 production gate by default** (requires separate L1 admission): N01 complete capability library, N02 Browser/Embedded/full Host reorganization, N03 (#1029) full Forge/Creator/Simulator/UX auto-generated App cross-project pipeline, N04 (#1030) QuickJS/Rust/Go/C second Microkernel, N05 (#1031) streaming/remote advanced calls. Arbitrary runtime Package hotloading and autonomous agent state/effect mutation additionally require explicit Product redesign; they are not implicit follow-ons.

## 7. Four formerly unresolved Product choices — **bounded proposals now specified, NOT formally frozen**

The 2026-10-14 user direction explicitly selects a production-ready Node SDK. This PRD now references **three concrete independently reviewable decisions** so L1 can settle quickly, without further exploratory Demo work:

### D01. Official Foundation Package Set / distribution boundaries

See [Foundation Package Set](./DomainHarness_v0.9_FOUNDATION_PACKAGE_SET.md). The supported baseline consists of:
- SDK Microkernel public `@kaicreator/domain-harness/v9` (one-arg `DomainHarness.load(package)`);
- independently identifiable `kaicreator.kernel.basic` (K State/Admission/Effect/Journal/UNKNOWN/Replay) and `kaicreator.standard.basic` (Schema/Rule/Decision/**Workflow+WorkflowRouter**/Operation);
- selected Node capability implementations `kaicreator.capability.identity.node` (H-backed independent true caller identity) and `kaicreator.capability.storage.sqlite` (physical CAS/Storage under K authority);
- producer-neutral official BUILD `@kaicreator/domain-harness-compiler` (not a Runtime Domain Package); and a `kaicreator.node.basic` **Profile** (immutable locked assembly list and tested target metadata, not a second Runtime Engine).

The **names and illustrative manifest shape are candidate identifiers** until L2 ABI review, but the **separation of responsibilities and independently installable/versionable Package identities** are target P0. A separate npm artifact per Domain Package is *not mandatory* if each Package can be selected/verified/versioned/installed independently from a stable published release archive. Business Packages are per consumer; re-use D2/D3 real assets. Do not move full generic BUILD into Forge, require one separate Workflow Package, or create a catch-all `host-node` Domain Package.

### D02. Node Basic Runtime Profile

`node-basic` pins **exact** SDK ABI + one K and one S Package and independently qualified Identity/SQLite capability implementation versions/hashes. BUILD fixes all bindings and selected platform. H independently verifies actual installed bytes and DAC approval/currentness on **every fresh activation/restart before untrusted JS module import**, and binds current callers over protected H→K transport. The Profile **cannot** grant its own issuer approval or let Runtime search/select other packages.

### D03. Platform-neutral supported Node environments and measurable qualification targets (user Product correction)

See [Node Production Qualification](./DomainHarness_v0.9_NODE_PRODUCTION_QUALIFICATION.md).

- **P0 technology:** Node 24.x + selected, ABI-matched native SQLite with K/S/Identity/Storage official Package closure; target Windows and Linux deployment families. **No fixed Ubuntu release, dedicated bare-metal host, or physical-only requirement.** WSL2 and VM/container are eligible under **their own real observed deployment assumptions**; WSL2 evidence cannot imply generic native Linux support.
- At v0.9 **Product Freeze** approve target platform families, precise per-profile qualification requirements, security/durability acceptance, numerical PERF-01..07 objectives and publication rules; **no runtime performance measurements or new host procurement prerequisite** to freeze a testable goal.
- At **Release** at least **one explicitly supported operational Node24+SQLite target** must pass independent real native-driver, installed external consumer, persistent storage/CAS, crash/UNKNOWN/recovery, H security, Full/Hidden/CJ and measured PERF-01..07. Each additional Windows/Linux/WSL2/VM/container support claim gets its own evidence. If only one target qualifies, release notes and SDK errors must not imply the others are production supported. No P0 environment qualification can be inferred from a Node package `engines` field or green CI alone.
- Real current FZ-01 WSL2 Ubuntu26/Node24/SQLite WAL preflight is valuable local evidence and can support later target-specific testing; FZ-01N no other native host is **not a Product Freeze or automatic Release blocker**. v0.8's separate previously frozen Host test requirements remain untouched.
- The PERF-01..07 budgets (startup, sustained eligible successful calls, p95/p99, error counting, memory, fault, backup, security) remain **proposed testable thresholds and NOT measurements**. Reference CPU/RAM/SSD class is advisory for comparison; always state the actual measured resource/OS/volume profile. Any post-freeze threshold change needs narrow independent Product change control, not silent post-failure relaxation.

### D04. Formal Product→L2→Task DAG execution order

See [bounded Task DAG proposal](../implementation/DomainHarness_v0.9_TASK_DAG_PROPOSAL.md). **Reuse existing** #1027 N01-min Foundation → #1028 N02-min physical Node adapters; parallel post-ABI #1035 N07 public SDK consumers and #1032 N06 distribution/profile; #1036 N08 operations after actual physical artifact; #1037 N09 **independent release qualification after all relevant merges**. This describes proposed dependencies, **NOT** registered GitHub native dependency edges or admitted executable work.

Product/L1 Freeze review and **provisional L2 evidence** may proceed while v0.8 work runs. Source implementation and qualified-baseline adoption require actual v0.8 Release PASS/Tag; Product Freeze and L2 require independent exact-SHA gates, not this PRD author's signature. No new research Issue or a full 9-issue JIT implementation wave now. Other version candidates N03/N04/N05 and broad N01/N02 are optional unless separately Product-admitted.

**Actual remaining gates:** formal Product/L1 Freeze review of revised OS-neutral scope; L2 ABI/authority contract and formal DAG; qualified released v0.8 baseline before v0.9 implementation; fresh v0.9 supported-profile native/Security/PERF/Full/Hidden/CJ/packaged consumer evidence at Release. FZ-01N's lack of a native Ubuntu host is **not** a Product blocker. Do not turn preflight into production PASS.

## 7a. Post-proposal review status and pending evidence

- PR #1033 `10aa58b2625b67219d735ad79338e6902165df27` docs CI SUCCESS and fresh content `PASS_L1_PROPOSAL` (P0/P1=0; P2=3), merged to main at `db8b0e0c57b89fa893fbceafeed3ce111e7a2e6e`. This is **NOT Product Freeze** and not independent distinct-account approval.
- Proposal P2-01 WorkflowRouter Standard semantic vs public API work ownership and P2-02 benchmark denominator rules are resolved in a bounded successor; P2-03 outdated-head PR metadata was corrected before merge.
- Actual Product Freeze requires [L1 Freeze Readiness](./DomainHarness_v0.9_L1_FREEZE_READINESS.md), an independent exact-SHA review of OS-neutral requirements and explicit Freeze decision; it **does not require** finished v0.8 release or a physical Ubuntu host. Source implementation and release qualification have separate gates, which are `NOT_PROVEN`.

## 8. Progress / authority

```ini
PRODUCT_DIRECTION=NODE_SDK_PRODUCTION_READY_AFTER_V09
USER_SCOPE_DIRECTION=YES
PRD_DRAFT_CREATED=YES
FOUNDATION_PACKAGE_SET_PROPOSED=YES
NODE_BASIC_PROFILE_PROPOSED=YES
PLATFORM_NEUTRAL_NODE24_SQLITE_PRODUCT_POLICY=USER_APPROVED_DIRECTION
FIXED_UBUNTU_OR_BARE_METAL_GATE=REMOVED
QUANTITATIVE_QUALIFICATION_TARGETS_PROPOSED=YES
SIX_CONCERN_DAG_PROPOSED_NOT_ADMITTED=YES
PRODUCT_L1_PROPOSAL_CONTENT_REVIEW=PASS_P2_3_AT_PR1033
PRODUCT_L1_FREEZE_REVIEW=NOT_RUN
PRODUCT_FREEZE=NO
L2_EVIDENCE=NOT_RUN
TASK_DAG=NOT_CREATED
V09_CODE=NOT_STARTED
V09_NATIVE_VALIDATION=NOT_RUN
V09_PRODUCTION_READY=NO
```
