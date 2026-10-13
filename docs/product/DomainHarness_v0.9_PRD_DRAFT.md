# DomainHarness v0.9 — Production-Ready Node SDK PRD (Draft / Not Frozen)

```ini
DOCUMENT_STATE=USER_DIRECTED_PRODUCT_TARGET_DRAFT
VERSION=v0.9
PARENT_ISSUE=#1026
BASELINE_REQUIRED=v0.8_RELEASE_QUALIFIED
L1_REVIEW=NOT_YET_RUN
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
| **PR-04** | Supported physical Node deployments; [N02-min #1028](https://github.com/kaicreator-mm/domain-harness/issues/1028) | Exact declared supported Node22/24 / OS / SQLite native ABI test matrix chosen at L1, successful real physical CAS/UX, clean startup | Unsupported Node/OS/driver typed refusal with no false safe profile, no central Host-owned policy |
| **PR-05** | Authentication/currentness/closed-world deployment safety; [N09 #1037](https://github.com/kaicreator-mm/domain-harness/issues/1037) | Independent issued/build-selected/actual executed bytes bound before import on **every initial activation and restart**, protected caller identity, denied revocation/scope and read/subscribe | Revoked after install, forged Root B after acceptance, substituted bytes, caller/LLM-provided authority: refused before unauthorized import/mutation |
| **PR-06** | Durable domain behavior; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | Two real Approval + Engineering apps on **same exact v0.9 K/S**, verified Workflow/Rule/Decision/Operation+UX, storage/Journal/UNKNOWN/replay, optional observed model-count truth | Concurrent CAS, crash, replay, duplicate Effect, stale observer, wrong SHA lineage, false durable ACK, absence of effect permission fail safely |
| **PR-07** | Operability and support; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | Deterministic init/cleanup/restart; redacted structured logs, diagnostics, correlation IDs, operator backup/recovery/rollback and incident guide exercised in a fresh consumer | Resource leak, secrets in output, false healthy/false durable recorded receipt, infinite retries/silent fallback |
| **PR-08** | Measurable supported-profile service quality; [N08 #1036](https://github.com/kaicreator-mm/domain-harness/issues/1036) | **At v0.9 L1 freeze** specify: supported Node/OS/SQLite profiles, concurrency workload, maximum authorized latency distribution, allowed failure/cleanup window, resource bounds and sample size; then record independent measured actual results | Unsupported profile, overloaded bounded queue, failed health/restart/performance envelope gets explicit `NOT_QUALIFIED`, not a silent production PASS |
| **PR-09** | Release/QA qualification; [N09 #1037](https://github.com/kaicreator-mm/domain-harness/issues/1037) | Full/Hidden/Critical Journeys/Packaged Consumer/Security/independent review/release exact-SHA, supported matrix, dependency/provenance report, release tag/baseline | Missing required test, unwaived safety P0/P1, reused stale old-head PASS, absent consumer/Host evidence or no provenance => `RELEASE_HOLD` |

**Minimum support-profile policy:** v0.9 MUST publish all actually supported combos. The Node22/24 Windows/Ubuntu qualification obligations of v0.8 T-G remain intact; v0.9 may publish a narrower **new support commitment only if** Product L1 openly limits its new operational-support promise **without relabeling or waiving any previously required v0.8 tests**. Unsupported Browser/Embedded/QuickJS/OS hardware is explicit. No fabricated SLO values; L1 must pin metrics before L2/DAG.

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

## 7. Pre-L1 unknowns that must be resolved, not endless research

1. Actual accepted v0.8 Release SHA and installed Node package baseline, which remains v0.9 starting point.
2. The smallest two independent, meaningful capability consumers and business workload; use existing D2/D3 where possible.
3. Exact supported Node22/24 × Windows/Ubuntu × SQLite matrix and declared non-support, with a real test environment.
4. SLO/acceptance metrics from measured real package workload and failure injection, not arbitrary invented performance targets.
5. Official distribution channel (versioned signed tarballs/immutable exact Git pin vs npm), public ABI versioning policy **within v0.9 line**, developer support/incident response owner.
6. Which optional N03–N05 candidates independently meet a separate Product return-on-cost threshold.

Each answered through **bounded L1 evidence reuse**, no repeat #932/#938/#942 research demos. After L1 Product Freeze, prepare L2 owner/contract matrix, appropriately sized Task DAG, Tests→Contract→Implementation→Failure handling→Reference, disjoint PRs, real CI/Build Host and exact-SHA Version Closure. This draft confers no implementation approval.

## 8. Progress / authority

```ini
PRODUCT_DIRECTION=NODE_SDK_PRODUCTION_READY_AFTER_V09
USER_SCOPE_DIRECTION=YES
PRD_DRAFT_CREATED=YES
INDEPENDENT_PRODUCT_L1_REVIEW=NOT_RUN
PRODUCT_FREEZE=NO
L2_EVIDENCE=NOT_RUN
TASK_DAG=NOT_CREATED
V09_CODE=NOT_STARTED
V09_NATIVE_VALIDATION=NOT_RUN
V09_PRODUCTION_READY=NO
```
