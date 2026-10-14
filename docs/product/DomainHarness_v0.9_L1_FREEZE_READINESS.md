# DomainHarness v0.9 — L1 Freeze Readiness and Evidence Ledger

```ini
PARENT=#1026
PREDECESSOR_PR=#1033
PREDECESSOR_MAIN_MERGE=db8b0e0c57b89fa893fbceafeed3ce111e7a2e6e
PREDECESSOR_REVIEW=PASS_L1_PROPOSAL_P0_0_P1_0_P2_3
PRODUCT_FREEZE=NOT_GRANTED
AUTHORITATIVE_V08_RELEASE_BASELINE=NOT_YET_AVAILABLE
L2_AUTHORITY=NOT_GRANTED
V09_IMPL=NOT_STARTED
```

## 1. Completed planning gates / disposition

- **Production product direction:** accepted: v0.9 ships production-ready supported Node SDK as Foundation Package Set + selected K/S + Identity/SQLite capability implementations + BUILD and external consumer, not a technology-demo version.
- **Product proposal source:** reviewed five-document PR #1033 exact `10aa58b2625b67219d735ad79338e6902165df27` has `PASS_L1_PROPOSAL` from fresh content reviewer and Woodpecker SUCCESS; merged docs-only to main at `db8b0e0c57b89fa893fbceafeed3ce111e7a2e6e`. A review by the same GitHub account as author does **not** count as a distinct-account `APPROVE`; no Product Freeze automatically follows.
- **P2-01 ownership:** proposal now fixes Standard Basic **WorkflowRouter semantic owner = #1027**; #1035 owns only public consumer API/docs; #1028 Node physical capability/H assurance; split write sets JIT if source work exceeds one concern. Existing `interpret('workflow')` is a reusable implementation, not proof of a dedicated Router public export.
- **P2-02 performance denominator:** proposal now requires at least 18,000 **eligible successful completions** across an actual 1,800-second four-caller run, explicit submitted/eligible/success/expected-conflict/unexpected-failure/timeout/late counts, 99.9% eligible fault-free correctness and documented tail inclusion. Any false ACK/security error is unconditional Release HOLD regardless of percentile.
- **P2-03 stale review pin:** PR #1033 metadata corrected to its reviewed exact SHA before merge.
- **No Code/Task DAG auto-admission:** #1027/#1028/#1032/#1035/#1036/#1037 remain the six P0 candidate owner Issues. N03/N04/N05 and broad platform/capability/ecosystem deferred by default.

## 2. Genuine Product Freeze blockers and how to close each once

| ID | Required fact (not new research) | Responsible source | Gate state |
| --- | --- | --- | --- |
| FZ-01 | Available physical production-reference Host with OS/arch/CPU/RAM/storage, Node version, native SQLite/driver ABI and supported CI location, or one explicit bounded alternative-profile choice | **Local Build Host preflight** | `NEEDS_REAL_HOST_EVIDENCE` |
| FZ-02 | Single **calibration** of proposed PERF-01–07 numeric budgets against **released** v0.8's real K/S/SQLite/dual-App workloads; if a v0.8 candidate exists but not released, explicitly label readings **NON_AUTHORITATIVE_EARLY_PROBE**, not release evidence | Local native environment only **after baseline qualified** (a non-authoritative early probe may be used to validate feasibility) | `NOT_RUN` |
| FZ-03 | v0.8 Released exact SHA/tree/tag, completion of original T-D/#1003, T-G/#1006 and bounded #1023, with physical K/S/Node/Approval/Engineering positive/negative tests and independent Release Qualification | v0.8 program controller | `BLOCKED_ON_V08_RELEASE` |
| FZ-04 | Product Scope: record exact supported primary profile, immutable distribution strategy, concrete public SDK target, P0/optional deferrals, quantitative budget and correct semantic owners after FZ-01/02 | #1026 Product Controller | `PROPOSED_NOT_FROZEN` |
| FZ-05 | One bounded fresh Product/L1 exact-SHA review of resulting candidate Freeze, no unwaived Product P0/P1 and explicit `PRODUCT_FREEZE_PASS` | reviewer independent of writing agent | `NOT_RUN` |

**Efficiency:** FZ-01 environment-only probe can be done **now** without touching any v0.8 source. FZ-02 full truthful performance baseline should bind the **released** v0.8 exact SHA; do not fabricate results from PR #1033 docs CI. FZ-03 is tracked by v0.8, **not** a reason to launch v0.9 implementation early. Product Freeze may use independently justified measured calibration or explicit support-scope amendments, never an arbitrary threshold change after failed tests.

## 3. Minimum local-only environment preflight (read-only)

On the intended Ubuntu Build Host, gather: `uname -a`, `/etc/os-release`, `node -v`, `npm -v`, `lscpu` summary, `free -h`, `lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT`, filesystem type and free bytes for the intended durable SQLite database path, exact native `better-sqlite3` module version and SQLite version **only if already installed**. In a clean temp directory, evaluate compatibility of declared Node binary with **already installed** native SQLite. Do not upload credentials, hostnames, IP addresses, user names, DB contents or private keys to GitHub; redact device serials and sensitive mount paths. Record any missing prereq as `NOT_VERIFIED`, not PASS.

The live App benchmark may run **only later** under an accepted exact v0.8 baseline; never characterize a metadata-only preflight as PERF PASS.

## 4. Next v0.9 gate (no mandatory fresh research)

1. Merge this bounded P2 closure docs PR after its exact-head review/CI (separate from #1033), recording it on #1026.
2. Consume the one Host preflight receipt as FZ-01; select/adjust supported Node profile once if necessary.
3. When v0.8 Release PASS is real, pin released SHA/tags/K/S payload/Node host and run one controlled budget calibration. Create a **formal L1 Freeze** checkpoint for the Product-specific P0 targets with actual evidence, not another six-page demo report.
4. Then use current sources as L2 Contract reference; freeze exact Package IDs/exports/ABI, H assurance and K/Standard/Capability owner matrix, official selected Profile and public SDK artifact boundary. Formalize concern-sized Task DAG only after that.
5. v0.9 source implementation/real production QA may then proceed in existing P0 task owners, with external clean SDK consumer and release security as terminal.

**Current result:** `P2_SOURCE_CORRECTIONS=PREPARED; HOST_PROBE=NOT_RUN; PRODUCT_FREEZE=NO; V09_L2=NO; FORMAL_DAG=NO; V09_PRODUCTION_READY=NO`.
