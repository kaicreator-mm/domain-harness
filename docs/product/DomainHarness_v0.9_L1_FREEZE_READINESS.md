# DomainHarness v0.9 — L1 Freeze Readiness and Evidence Ledger

```ini
PARENT=#1026
PREDECESSOR_PR=#1033
PREDECESSOR_MAIN_MERGE=db8b0e0c57b89fa893fbceafeed3ce111e7a2e6e
PREDECESSOR_REVIEW=PASS_L1_PROPOSAL_P0_0_P1_0_P2_3
PRODUCT_FREEZE=NOT_GRANTED
AUTHORITATIVE_V08_RELEASE_BASELINE=NOT_YET_AVAILABLE
PRODUCT_PLATFORM_POLICY=JS_TS_CORE_NO_OS_OR_NODE_NATIVE_MATRIX
FZ01_PREFLIGHT=RECEIVED_NONQUALIFYING_WSL2_UBUNTU26_NODE24_SQLITE
L2_AUTHORITY=NOT_GRANTED
V09_IMPL=NOT_STARTED
```

## 1. Completed planning gates / disposition

- **Production product direction:** corrected: v0.9 ships production-ready JS/TS-authorable, JS-executed SDK Core + selected K/S/Capability packages + BUILD and real external consumer; Node+SQLite are optional/reference integrations, not a technology-demo version.
- **Product proposal source:** reviewed five-document PR #1033 exact `10aa58b2625b67219d735ad79338e6902165df27` has `PASS_L1_PROPOSAL` from fresh content reviewer and Woodpecker SUCCESS; merged docs-only to main at `db8b0e0c57b89fa893fbceafeed3ce111e7a2e6e`. A review by the same GitHub account as author does **not** count as a distinct-account `APPROVE`; no Product Freeze automatically follows.
- **P2-01 ownership:** proposal now fixes Standard Basic **WorkflowRouter semantic owner = #1027**; #1035 owns only public consumer API/docs; #1028 Node physical capability/H assurance; split write sets JIT if source work exceeds one concern. Existing `interpret('workflow')` is a reusable implementation, not proof of a dedicated Router public export.
- **P2-02 performance denominator:** proposal now requires at least 18,000 **eligible successful completions** across an actual 1,800-second four-caller run, explicit submitted/eligible/success/expected-conflict/unexpected-failure/timeout/late counts, 99.9% eligible fault-free correctness and documented tail inclusion. Any false ACK/security error is unconditional Release HOLD regardless of percentile.
- **P2-03 stale review pin:** PR #1033 metadata corrected to its reviewed exact SHA before merge.
- **No Code/Task DAG auto-admission:** #1027/#1028/#1032/#1035/#1036/#1037 remain the six P0 candidate owner Issues. N03/N04/N05 and broad platform/capability/ecosystem deferred by default.

## Latest JS/TS Core Product successor — overrides all earlier Node/OS P0 assumptions

[JS runtime contract](./DomainHarness_v0.9_JS_RUNTIME_CONTRACT_SUCCESSOR.md) supersedes this ledger's previous references to mandatory `Node 24 + SQLite`, Windows/Linux target families, reference-host performance and Core-facing `FZ-01` inventory. **Product/L1 Freeze requires no OS, Node version, SQLite or host inventory**; freeze the minimum JS module/async execution/typed Host Capability contract, secure closed-world loader and falsifiable real App validation instead. Actual JS runner and physical selected providers receive their **own** release qualification only if selected or advertised. FZ-01/01N are retained as historical evidence but have no gating value for Core L1.

v0.8 original frozen Node/OS evidence remains in v0.8; no waiver. Until successor review, `PRODUCT_FREEZE=NO`, no runtime/portability PASS, and candidate #1044 must be superseded.

## 2. Corrected gate separation — platform-neutral SDK Product direction

**User Product decision 2026-10-14:** no mandatory Ubuntu 24.04, dedicated host, nonvirtualized hardware or special procurement. SDK Core P0 target is **JS/TS authoring and a proven selected JavaScript executable environment**, plus secure K/S/B and selected Capability contracts. OS/Node/SQLite details apply only to a chosen adapter, not a universal Core acceptance matrix. Read [Node Production Qualification](./DomainHarness_v0.9_NODE_PRODUCTION_QUALIFICATION.md) controlling successor.

| ID | Required evidence or decision | When required | Current disposition |
| --- | --- | --- | --- |
| **FZ-01 / FZ-01N** | WSL2 Ubuntu26/Node24/SQLite already verified; other native host unavailable; **no repeat search** | Planning environment inventory; not formal L1 Freeze gate | `RECEIPTED; NOT_BLOCKING_PRODUCT_FREEZE` |
| **FZ-02** | Actual PERF-01..07 and realistic selected-target budgets on exact installed candidate; numeric targets approved at L1, changes via a reviewed bounded Product amendment | Candidate native/supported-profile Release Qualification, **not pre-L1 measurement prerequisite** | `NOT_RUN; RELEASE_GATE` |
| **FZ-03** | v0.8 #1023/#1003/#1006 released and exact SHA/tag qualified for inheritance | Before v0.9 formal implementation starts and before v0.9 Release PASS | `V08_RELEASE_NOT_YET_QUALIFIED; IMPL_GATE` |
| **FZ-04** | Freeze architecture/scope: JS/TS minimal ESM/runtime/Host ABI, Foundation, WorkflowRouter, public ABI boundaries, selected capability constraints and real-core acceptance, optional deferrals and owners | **Product/L1 Freeze gate now** | `READY_FOR_BOUNDED_REVIEW` |
| **FZ-05** | Fresh review of exact revised Product contract and decision record; no unresolved Product/security P0/P1, valid authority/independence record | **Product/L1 Freeze gate now** | `NOT_RUN` |
| **FZ-06** | Selected/adverstised runtime + Capability-specific APIs, durable storage/persistence/restart/security, clean consumer and Full/Hidden/CJ; Node/SQLite native ABI only for that optional offering | Version qualification for **each** claimed profile | `NOT_RUN; RELEASE_GATE` |

**Schedule simplification:** Product/L1 Freeze and **non-executable** L2 architecture evidence can be advanced now, without a second Ubuntu host or measured v0.8 release performance. L2 must mark v0.8 borrowed SHAs **PROVISIONAL**, not a released fact. Formal v0.9 implementation starts **only after** accepted v0.8 Release PASS and v0.9 Product/L2/DAG. A green CI check is not OS-native or release-qualification evidence.

### Actual recorded FZ-01 facts and what they prove

Actual preflight received via [#1026](https://github.com/kaicreator-mm/domain-harness/issues/1026): WSL2 Ubuntu 26.04.1 x86_64, Node 24.21.0, native `better-sqlite3` 12.11.1 (bundled SQLite 3.53.2) loaded and file WAL checkpoint verified, 8 vCPU, ~16 GiB allocated, ext4 on a VHD backed by local NVMe SSD. **This proves those specific preflight operations only**. It is reusable for SDK build/ABI/integration and may later be used for an explicitly scoped WSL2-profile candidate with tests for its VHD durability/persistence/shutdown behavior. It **does not certify** a generic Windows/Linux profile, the future exact v0.9 installed artifact, or PERF-01..07.

FZ-01N `NATIVE_HOST_UNAVAILABLE` is a historically true inventory result but **does not block L1/L2**. No new physical or Ubuntu 24.04 host is required by Product scope. Production profiles are qualified from **real available environments**, independently for each promised target, at the version's release evidence gate.

`PLATFORM_SPECIFIC_RELEASE_EVIDENCE=NOT_RUN; NO_PRODUCT_FREEZE_CLAIM; NO_TEST_PASS_CLAIM`.

## 3. Existing local-only environment preflight (already completed; do not repeat)

The previous one-time FZ-01 already gathered: `uname -a`, `/etc/os-release`, `node -v`, `npm -v`, `lscpu` summary, `free -h`, `lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT`, filesystem type and free bytes for the intended durable SQLite database path, exact native `better-sqlite3` module version and SQLite version **only if already installed**. In a clean temp directory, evaluate compatibility of declared Node binary with **already installed** native SQLite. Do not upload credentials, hostnames, IP addresses, user names, DB contents or private keys to GitHub; redact device serials and sensitive mount paths. Record any missing prereq as `NOT_VERIFIED`, not PASS.

Live v0.9 SDK native/performance qualification runs later on an exact accepted candidate with declared actual supported profile; **no need to rerun this FZ-01**. Never label metadata-only probes as PERF PASS.

## 4. Next v0.9 gate (no mandatory fresh research)

1. Merge this bounded P2 closure docs PR after its exact-head review/CI (separate from #1033), recording it on #1026.
2. Consume the one Host preflight receipt as FZ-01; select/adjust supported Node profile once if necessary.
3. When v0.8 Release PASS is real, pin released SHA/tags/K/S payload/Node host and run one controlled budget calibration. Create a **formal L1 Freeze** checkpoint for the Product-specific P0 targets with actual evidence, not another six-page demo report.
4. Then use current sources as L2 Contract reference; freeze exact Package IDs/exports/ABI, H assurance and K/Standard/Capability owner matrix, official selected Profile and public SDK artifact boundary. Formalize concern-sized Task DAG only after that.
5. v0.9 source implementation/real production QA may then proceed in existing P0 task owners, with external clean SDK consumer and release security as terminal.

**Current result:** `P2_SOURCE_CORRECTIONS=PREPARED; HOST_PROBE=RECEIVED; PRODUCT_FREEZE=NO; V09_L2=NO; FORMAL_DAG=NO; V09_PRODUCTION_READY=NO`.
