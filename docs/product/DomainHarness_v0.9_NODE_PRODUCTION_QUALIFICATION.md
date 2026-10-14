# DomainHarness v0.9 — Node Production Support and Qualification Budget (Product/L1 Proposal)

```ini
STATUS=PROPOSED_L1_QUALIFICATION_CRITERIA_NOT_MEASURED
VERSION=v0.9
OWNER=#1036 (N08), #1037 (N09)
SOURCE=#1026
EFFECTIVE_RELEASE_PROFILE=ONLY_AFTER_NATIVE_PROOF
V08_VALIDATION_GATES=UNAFFECTED
PRODUCT_FREEZE=NO
TEST_PASS=NOT_CLAIMED
```

## 1. Support-tier decision

**Product support target** (not a claim that the environment has been run):

| Profile tier | OS / Architecture | Node runtime / Native storage | v0.9 release disposition |
| --- | --- | --- | --- |
| **P0 PRIMARY** | Ubuntu **24.04 LTS x86_64**, local SSD filesystem | Node.js **24.x LTS**, pinned and natively built/loaded `better-sqlite3`, SQLite local durable store | **Production-ready** must PASS on actual physical/native reference host and a fresh consumer |
| **P1 CANDIDATE** | Windows 11 x64 workstation | Node.js 24.x + separately ABI-qualified `better-sqlite3` | Mark **supported only if** full relevant native, SQLite/ACL/crash/clean-install/security testing passes; otherwise publish as `NOT_QUALIFIED` without delaying PRIMARY Node release |
| **P1 CANDIDATE** | Ubuntu 24.04 LTS x86_64 | Node.js **22.x** + its own separately installed/native sqlite addon | Same conditional status; **v0.8's pre-existing Node22/24 acceptance still mandatory for v0.8** regardless of v0.9 P1 choice |
| **OUT** | Browser/Expo/Embedded/QuickJS, ARM, arbitrary Windows/Linux distro | Any arbitrary JS runtime or unqualified SQLite driver | Explicitly unsupported for the **v0.9 Node Basic production promise** unless independently admitted and proven |

**Deployment assumptions:** operator controls an approved Node process and private SQLite DB path on a trusted machine; disk is durable within the selected SQLite configuration; OS process/FS permissions are configured; external DAC authority and H issuance/activation verification have genuine independent credentials. This is **not** an OS sandbox for a hostile machine administrator. Packages are closed-world/build-approved; no arbitrary untrusted plugin injection. Business Apps may use optional external services, but those services' availability/latency is not an SDK production promise.

**Preflight and freeze hold:** if the real Build Host is not Ubuntu 24.04 x64 or a qualified equivalent is not available, the P0 profile remains **unqualified**; choose a real accessible supported host **through a bounded explicit Product L1 amendment and fresh evidence before freeze**, not by silently claiming Ubuntu 24.04 testing. Node versions are major-line selectors; exact patch, compiler flags, native ABI, SQLite mode and kernel/filesystem facts are pinned in validation records at candidate qualification.

## 2. Deterministic benchmark specification and initial proposed numeric targets

These are **target thresholds, NOT observed measurements**. Their purpose is to make v0.9 release testable. A single **bounded Product/L1 calibration** may revise the numeric targets based on the exact released v0.8 baseline **before** v0.9 Product Freeze; changes thereafter require an independently reviewed Product amendment, not a post-failure silent threshold increase.

**Reference bench:** Ubuntu 24.04 x86_64, `4 vCPU / 8 GiB RAM / local SSD` (dedicated or sufficiently isolated), pinned Node24 and SQLite package, no concurrent CI stress process. Record actual host model, CPU, storage and OS facts; no false claim that current Build Host matches. Workload is local SDK **without external network I/O or optional LLM**; DB initialized with two authentic Business Apps and real selected K/S/Identity/Storage.

| Budget ID | Exact workload/measurement | Proposed v0.9 P0 budget |
| --- | --- | --- |
| **PERF-01 Startup** | 30 fresh process activations of a preinstalled, independently verifiable *valid* App; startup measured from app process enter to ready authenticated SDK endpoint; exclude npm download/build but include local artifact approval-currentness and selected Package init | **p95 <= 5,000 ms**, every start fails closed if revoked/stale |
| **PERF-02 Deterministic ops** | Warm 200 operations; >=18,000 mixed authorized local calls over **30 minutes**, 4 concurrent callers, at >=10 submitted ops/s combined; includes reads + state transitions + durable SQLite CAS, no external model/network latency. Report read and state-change distributions separately | **p95 <= 500 ms, p99 <= 2,000 ms** for completed authorized operations, with throughput actually sustained and **zero false durable ACK, duplicate Effect or admitted unauthorized mutation** |
| **PERF-03 Reliability** | Same 30-minute run plus fixed invalid caller/intent negatives (report separately); native process restarts and real storage persistence | >=**99.9%** valid authorized operations succeed under fault-free reference conditions; **100%** deliberate invalid-caller negatives rejected with zero unauthorized effect/journal; no unclassified accepted loss |
| **PERF-04 Resource containment** | Sample RSS and actual open SQLite handles/registered observers after warmup and at 30-minute terminal, fixed concurrent client count; record GC/heap observations and per-operation cleanup | Warm-to-end RSS growth **<=128 MiB** and terminal RSS **<=512 MiB** on the specified reference host, zero leaked DB handles/observers after stop; no unbounded retries or queues |
| **PERF-05 Lifecycle/Recovery** | 20 start→authenticated use→graceful stop cycles; 5 forced process terminations across durable Journal/Effect windows, then fresh process restart with trusted artifact | Graceful stop **<=10 s** when no external operation is pending; recovered process starts under PERF-01; all committed outcomes replay once, externally ambiguous outcomes remain truthful **UNKNOWN** until resolved (do not demand fabricated automatic success) |
| **PERF-06 Backup/restore** | Real SQLite checkpoint/backup + restore on isolated process using documented runbook; verify selected Package/ABI/instance/Journal identity and startup-currentness again | Exact valid business state + Journal continuity after restore; corruption/mismatched artifact causes typed refusal/diagnosis, never silent replay into wrong Assembly |
| **PERF-07 Security/ops visibility** | Independent evaluator injects revoked credentials, wrong app/tenant, missing capability, invalid Handler/root, failed init, disk failure, stale observer and partial import; inspect logs/metrics/traces | 0 unauthorized effects, 0 leaked token/key/secret, 0 untruthful success, typed recovery/denial classification and end-to-end correlation; clear unsupported/failure status |

### PERF-02/03 denominator and inclusion contract — P2-02 closure

The reference run **must** write a machine-generated, per-attempt receipt and summary with the following disjoint counts and timestamps:

| Metric | Definition | How it is used |
| --- | --- | --- |
| `submitted_total` | All invocation attempts, including deliberate invalid/contending calls; retries have unique attempt IDs | Report only; **never** by itself qualifies throughput |
| `eligible_submitted` | Distinct authorized, valid, non-conflicting calls sent during the 30-min fault-free window; no deliberate denial, no injected crash or intentionally contended write | Availability denominator; minimum **18,000** attempts with four caller sessions |
| `eligible_success` | Eligible calls completed by the deadline with correct typed business receipt and **durable** outcome where applicable | Throughput numerator; must be **>=18,000 successful completions / 1,800 s (10.0/s)** and `eligible_success / eligible_submitted >= 0.999` |
| `eligible_unexpected_failure` | Unauthorized silent acceptance, unexpected error, untyped terminal, lost durable ACK, timed-out eligible call or incorrect result | Included in availability denominator; false ACK and security failure **always Release HOLD** independent of percent |
| `expected_negative` | Correctly denied unauthorized/invalid caller and deliberately forced contention/UNKNOWN cases | **Separate** positive-negative suite, never inflates eligible success or throughput |
| `warmup` | 200 seed operations (before the fixed 30-min clock) | Excluded from throughput/availability/latency qualification sample |

**Latency:** sample `eligible_submitted` from actual admission/submission monotonic timestamp to terminal receipt; report p50/p95/p99 for `eligible_success`, with all `eligible_unexpected_failure`, timeouts and incomplete calls **separately counted and not silently dropped**. In addition, report p99 *tail-inclusive* bound with non-successful eligible attempts classified at `+Infinity` (or right-censored with count displayed), so a run cannot meet a percentile by filtering worst attempts. The p95<=500ms / p99<=2,000ms targets apply to **eligible successful terminal calls**, **only if** the overall availability and tail inclusion gates also pass. Retried attempts count as separate requests only if the client explicitly submitted them; they never count as more than one successful durable business effect.

**Throughput:** `eligible_success / observed_run_duration_seconds >=10.0`; observed duration must be **at least 1,800 seconds**, not merely a simulator's nominal time. Publish submitted, eligible, successful, expected-negative, contention, unexpected-failure, timeout, retry and completion counts separately. Reject partial-duration/missing-raw-receipt summaries. Counts and percentile code are part of the **independent N09 validator** and must be tested with synthetic denominator counterexamples before a Release PASS.

**Workload scoring guard:** classify **expected, correctly typed CAS contention/conflict**, explicit `UNKNOWN` after an injected crash and deliberate denials as **valid semantic outcomes**, not service availability failures. Benchmark the 99.9% success rate against **eligible non-conflicting, fault-free authorized operations** only; publish concurrent contention attempts/conflict rate separately with asserted zero unauthorized effects and no blind retry. Report all **unexpected** failures/timeouts in latency/availability results, and count accepted-but-lost durable outcomes as Release HOLD regardless of percentage. Avoid a benchmark that accidentally rewards skipping CAS admission.

**Interpretation:** a latency target is meaningful only with actual measured distributions and reproducible fixtures. Document timeouts, exclusions and sample counts; record failures rather than filtering them out of percentiles. Invalid requests are not included in the authorized-op availability numerator but must pass separately. **No SLO claim** for arbitrary WAN calls, real LLM inference or privileged OS disruption. Any unsupported profile must be clearly labelled NOT_QUALIFIED.

## 3. Reliability, security and observability matrix

1. **Bootstrap:** protected installer binds independently accepted exact executable subject; every fresh start/restart re-checks DAC designation, expiration and issuer/tenant/audience/app; no import from caller `moduleSource` or forgeable handle. Source/build self-hash alone is NOT authority.
2. **Identity:** only H-provisioned non-shadowable Identity Capability verifies caller with protected keys/channel; B and agent may not mint `verifiedCaller`, and K owns request-specific State/Effect/Journal authorization. Every read/subscription checks currentness; revocation stops further observation.
3. **Storage:** SQLite WAL/synchronous policy, busy timeout and atomic CAS mode are recorded; actual disk full, locked DB, corrupt rows, concurrency and crash windows have physical P/N tests. No second Host-local business Journal.
4. **Failure handling:** typed `DENIED | UNSUPPORTED | RETRYABLE | UNKNOWN | FATAL` are **classification concepts**, not invented current exported error enums; actual error codes and retry policy are pinned after L2 and checked in independent consumer. Never blind-retry UNKNOWN non-idempotent effects.
5. **Telemetry:** structured redact-by-default app/tenant/instance/operation/correlation identifiers with sensitive ID masking policy; latency, refusals, active operations, DB/CAS retry and UNKNOWN counters; health distinguishes `ready`, `degraded`, `stopping`, `unqualified`, but no telemetry is a replacement Journal or security proof.
6. **Operator procedures:** artifact provenance/activation, key rotation/revocation, backup/restore, disk exhaustion, safe process stop/restart, app failure classification, same-supported-line redeployment/rollback restrictions; no v0.1–v0.8 cross-version running occurrence migration promise.

## 4. Candidate exact-SHA evidence receipt

Required fields in T-G equivalent v0.9 N09 closure record:

```text
candidate_sha / candidate_tree / profile_id / profile_digest
sdk_artifact_hash / foundation_package_ids+versions+hashes / build_toolchain_hash
node_binary_version / better_sqlite3_native_abi / sqlite_version
host_os_kernel_cpu_ram_disk_fs / setup_commands / workload_seed
PERF-01..PERF-07 execution command / exit code / raw per-case results
supported_matrix: [PRODUCTION_QUALIFIED | NOT_QUALIFIED] per actual target
independent_source_security_review_exact_head
full_regression / hidden / critical_journeys / supply_chain / clean_consumer
remaining_P0_P1 / waiver_scope / release_decision / tag
```

**Admissibility:** if the reference host is unavailable, performance unmeasured, the deterministic budget fails, native conformance is absent or a safety failure exists, v0.9 Production READY **cannot** be asserted for that profile. One independent review, one candidate-bound full suite, bounded targeted repairs; avoid iterative arbitrary benchmark threshold changes. Environmental waivers obey ADS but cannot waive actual security, correctness, unavailable essential P0 profile or user-visible missing functionality.

## 5. Existing input, owner and current result

- v0.8 #1004 real Node Host, #1002 K CAS, #1005 two real Apps provide **source and test reuse**, but their historical CI/Node22/24 PASS is **not** v0.9 exact-candidate qualification.
- #1036 N08 owns production operations, measured stability and runbooks; #1037 N09 independently validates; #1032 N06 owns pinned artifact distribution; #1028 N02 owns real physical Node+Storage/Identity realization.
- This is a **decision-ready L1 proposal**. `SUPPORTED_PROFILE=NOT_VERIFIED`; `PERFORMANCE_TARGETS=PROPOSED_NOT_MEASURED`; `PRODUCT_FREEZE=NO`; `V09_RELEASE=HOLD`.
