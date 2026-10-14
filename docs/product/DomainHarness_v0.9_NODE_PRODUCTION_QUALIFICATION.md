# DomainHarness v0.9 — Node Production Support and Qualification Budget (Product/L1 Proposal)

```ini
STATUS=PROPOSED_L1_QUALIFICATION_CRITERIA_NOT_MEASURED
VERSION=v0.9
OWNER=#1036 (N08), #1037 (N09)
SOURCE=#1026
EFFECTIVE_RELEASE_PROFILE=ONLY_AFTER_TARGET_SPECIFIC_EXECUTABLE_PROOF
V08_VALIDATION_GATES=UNAFFECTED
PRODUCT_FREEZE=NO
TEST_PASS=NOT_CLAIMED
```

## 1. Platform-neutral Node SDK support and release qualification (user Product decision, 2026-10-14)

**Product requirement:** DomainHarness v0.9 is a portable Node.js SDK, **not an Ubuntu-specific or bare-metal-specific product**. The baseline technology is **Node.js 24.x + selected, ABI-compatible real SQLite + immutable K/S/Capability Domain Packages**. Windows and Linux are first-class target **platform families**; WSL2, VM, container, and cloud are valid environments when their exact support/observability/storage contract is declared and verified. Node22 is optional **for v0.9 only**; previously frozen v0.8 Node22/24 Windows/Ubuntu tests remain binding in v0.8.

| Profile class | Platform examples, not predetermined PASS | Qualification and publication rules |
| --- | --- | --- |
| **TARGET: Windows** | Windows 11 / supported Windows Server, Node 24, pinned native SQLite binding | **SUPPORTED only after** actual Windows-native clean consumer + file SQLite WAL/CAS/restart/backup/security/Full/CJ evidence at exact v0.9 artifact. Otherwise `NOT_QUALIFIED` |
| **TARGET: Linux** | Ubuntu 24/26, other specified Linux distro, bare metal, VM, cloud VM, or container, Node 24 | **SUPPORTED only after** actual Linux target OS/kernel/container storage/Node/SQLite binding, clean consumer, crash/recovery/currentness and release evidence. **No mandatory Ubuntu version or physical bare-metal host** |
| **CANDIDATE: WSL2** | Ubuntu 26.04.1 under Windows WSL2, Node 24, ext4-on-VHD-backed filesystem | May run build/tests and bounded qualification; **WSL2-specific production support only if** exact WSL2 profile (guest kernel, backing volume and shutdown/restart semantics) passes the *same applicable* P0 safety, recovery and operational gates. WSL2 PASS never implies native Linux server PASS |
| **OPTIONAL** | Node 22, macOS, ARM, embedded, QuickJS, Browser/Expo and other runtimes | Not v0.9 default production promise; any additional supported target needs separately selected profile and native evidence |

**Product versus release distinction:** Product/L1 Freeze selects the **capability envelope and intended platform families**, not fictitious OS test results. It **does not require** locating or provisioning a specific Ubuntu or physical native server, running PERF-01–07, or finishing v0.8's release before L1 decisions are recorded. L2 may use an explicitly **provisional** v0.8 SHA/source map for planning, but implementation cannot inherit a *qualified baseline* until v0.8 Release PASS. At **v0.9 Release Qualification**, publish **only profiles actually proven** on their exact installed SDK/artifact/native binding. At least **one explicitly supported, operationally deployable Node 24 + SQLite profile** must pass clean install, full P/N, critical journeys, durability, fault recovery, security and measured performance; otherwise `V09_RELEASE_HOLD`. Windows/Linux *as a dual-platform support claim* requires both independently qualified. A WSL-only release must be explicitly scoped as such and must not claim generic production Linux or Windows support.

**Environment neutrality is not evidence waiver.** Actual selected filesystem (including WSL2 VHD mount and Windows file sharing, Docker bind mounts or container volumes), locking, flush/durability, WAL behavior, OS credential/ACL behavior, process crash/restart, hardware/VM persistence assumptions and native driver ABI must each be tested under the declared supported profile. Avoid unsupported transitive native-driver/ABI reuse. Native testing means executing native compiled SQLite module in **the actual chosen target environment**, not requiring dedicated bare metal.

### FZ-01 / FZ-01N real environment evidence — reused without unnecessary blockers

October 14 [FZ-01 receipt](https://github.com/kaicreator-mm/domain-harness/issues/1026) showed **WSL2 Ubuntu 26.04.1 x64**, Node `24.21.0` ABI 137, native `better-sqlite3 12.11.1` with SQLite `3.53.2`, local guest-ext4-backed WAL, 8 vCPU and ~16 GiB memory. This is useful **verified local compatibility/prevalidation evidence**. It is **not** itself an exact-v0.9 clean-consumer/Full/Hidden/critical-journey, crash recovery or measured PERF qualification. However, it is no longer excluded *solely because it is WSL2 or Ubuntu 26*. Reuse this existing host for new relevant v0.9 work after proper authorization; no repeat FZ-01 inventory needed.

FZ-01N reported no accessible different non-WSL2 Ubuntu host; that fact is retained, but **`NATIVE_HOST_UNAVAILABLE` is no longer a Product/L1 Freeze blocker or automatic v0.9 release blocker**. Actual target profile qualification remains a release gate. Windows-native evidence can be captured on the existing workstation once release artifacts exist; Linux VM/container/CI environments may be used when their actual host/kernel/volume capabilities are established. No need to create a new server just to satisfy a historical OS pin.

## 2. Deterministic benchmark specification and initial proposed numeric targets

These are **target thresholds, NOT observed measurements**. Their purpose is to make v0.9 release testable. Numeric budget targets can be **Product-frozen before a Build Host is provisioned** as explicit acceptance criteria; real measurements and any feasibility calibration must be recorded **before the relevant v0.9 Release Qualification**, and changing a Product-frozen threshold requires a narrow independent Product amendment (never a post-failure silent relaxation). Compare against v0.8 evidence if available; no requirement to wait for v0.8 release solely to state v0.9 measurable goals.

**Reference bench:** a **documented and reproducible supported Node24+SQLite deployment profile** (Windows/Linux/WSL2/VM/Container as applicable) with recorded CPU allocation, RAM, filesystem, storage, native SQLite version/ABI and environment isolation. `4 vCPU / 8 GiB / local SSD` remains a **recommended comparability class, not a release gate or required host purchase**; disclose actual capacity and do not compare unlike hardware as equivalent. Pin this profile before performance qualification. Workload is local SDK **without external network I/O or optional LLM**, using two real Business Packages and the same selected K/S/Identity/Storage.

| Budget ID | Exact workload/measurement | Proposed v0.9 P0 budget |
| --- | --- | --- |
| **PERF-01 Startup** | 30 fresh process activations of a preinstalled, independently verifiable *valid* App; startup measured from app process enter to ready authenticated SDK endpoint; exclude npm download/build but include local artifact approval-currentness and selected Package init | **p95 <= 5,000 ms**, every start fails closed if revoked/stale |
| **PERF-02 Deterministic ops** | Warm 200 operations; >=18,000 mixed authorized local calls over **30 minutes**, 4 concurrent callers, at >=10 submitted ops/s combined; includes reads + state transitions + durable SQLite CAS, no external model/network latency. Report read and state-change distributions separately | **p95 <= 500 ms, p99 <= 2,000 ms** for completed authorized operations, with throughput actually sustained and **zero false durable ACK, duplicate Effect or admitted unauthorized mutation** |
| **PERF-03 Reliability** | Same 30-minute run plus fixed invalid caller/intent negatives (report separately); native process restarts and real storage persistence | >=**99.9%** valid authorized operations succeed under fault-free reference conditions; **100%** deliberate invalid-caller negatives rejected with zero unauthorized effect/journal; no unclassified accepted loss |
| **PERF-04 Resource containment** | Sample RSS and actual open SQLite handles/registered observers after warmup and at 30-minute terminal, fixed concurrent client count; record GC/heap observations and per-operation cleanup | Warm-to-end RSS growth **<=128 MiB** and terminal RSS **<=512 MiB** on the recorded benchmark profile, zero leaked DB handles/observers after stop; no unbounded retries or queues |
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
- This is a **decision-ready L1 proposal**. `SUPPORTED_PROFILE=NONE_RELEASE_QUALIFIED`; `PERFORMANCE_TARGETS=PROPOSED_NOT_MEASURED`; `PRODUCT_FREEZE=NO`; `V09_RELEASE=HOLD`.
