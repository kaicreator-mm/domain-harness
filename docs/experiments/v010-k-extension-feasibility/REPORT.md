# v0.10 K-Extension Feasibility — Architecture Research Demo Report (#1150)

> Status: REVIEW_R1_REPAIR_APPLIED / R2_DELTA_REVIEW_REQUIRED. Research
> branch `research/v010-k-extension-feasibility`, NOT merged to production.
> The initial evidence (below) resolved the `K_EXTENSION_FEASIBILITY_HOLD`
> of L2 R0 §C at seam scope; independent review PRR 5562125052 requested
> changes (P1 advisory replay/isolation, P2 execution host), and THIS HEAD
> carries the bounded repair plus the focused R6 scenarios — see "Review R1
> repair" near the end. It does not freeze architecture, admit a Task DAG
> node, or imply any v0.10 implementation PASS.

## Hypothesis (falsifiable, from #1150)

Given a realistic v0.10 candidate loader/Host seam built over the real
selected v0.9 K baseline with physically separate ESM extension modules,
selecting `admission-budget-advice/v1` and `recovery-diagnostics/v1`
produces distinct, useful data-only results while:

1. exactly one selected K Primary creates occurrence runtimes and alone owns
   Admission/State/Journal/Effect/Replay/UNKNOWN;
2. no extension can receive protected raw K State/Journal/CAS/effect permits
   or mint effects through approved API, and the Primary independently
   validates/clamps or ignores every suggestion;
3. a changed SHA/unknown dependency/provider collision/required feature
   mismatch causes typed refusal with zero ESM import/init/callback/recovery
   activity;
4. a maliciously shaped/privileged return does not commit, grant an effect or
   change UNKNOWN to terminal; absent optional extensions preserve Basic
   behavior.

## Result: **PASS** (for the stated seam scope; see What was NOT proven)

19/19 executable scenarios green on the exact evidence SHA below, exit code 0.
No synthetic PASS: every observable is read from the real components (real K
counters, real durable journal records, real store bytes, real ESM
evaluation sentinels), and every negative path is asserted against
zero-activity counters rather than absence of errors.

## Exact identity

| Artifact | Identity |
|---|---|
| Research base (frozen product main) | `2c511118821587e9abf1135cbccd3b001caadd87` |
| Evidence run commit (code+fixtures frozen) | `0492cf4fd756c952631d7d94f1095c78949a3bdb` |
| Review R1 repair code commit (R6 suite added) | `77216a2aac3595207c5e5bae2d4195900bd3685f` |
| Final research branch HEAD | branch tip carrying this report; recorded in the PR description and the #1150 evidence comment (the binding test identity is the evidence-run SHA above, plus the repair SHA for R6) |
| L2 DRAFT consumed | PR #1149 head `3932e4be61839c094a9f40d57f9f27b707b04d3b`, doc blob `085fbb00b8b6564530997c6add1253f79ead0242` (no drift vs #1150's recorded initial HEAD) |
| PRD blob / Crosswalk blob | `673da42ad90acde5ef942beb8ac63b58836a649f` / `2832ce0b4269737d934b071a6c2e830deefec629` (unchanged, read-only) |
| Standard | ADS 4.13.1@`f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd` |
| Runtime (initial R1–R5 evidence) | Node v24.21.0, npm 11.19.0, Git Bash MINGW64_NT-10.0-26300 — review P2 flagged this as a deviation from #1150's Ubuntu Build Host requirement |
| Runtime (review R1 repair runs) | Windows: Node v24.21.0, npm 11.19.0, Git Bash MINGW64_NT-10.0-26300. Ubuntu (WSL2): Ubuntu 26.04.1 LTS, Linux 6.18.54.1-microsoft-standard-WSL2, Node v22.23.2, npm 10.9.8 — both at repair SHA `77216a2a`, 23/23 green, exit 0 (`evidence/repair-r1/`) |
| Real bytes consumed | kernel-mechanism-v1.mjs sha256 `5a3ece5868da99d62f3f9c839c067918b51309369d437beb2186bb559a9980c6`; standard vendored bundle `5b032e1096ef2372f4ca5650c1c77e5d64ab72662aa83b07bd1415433bd211a1`; business-approval `fd494e6e91234d983727715cd379635d9951de65b99e240e56923fd21947a7d8`; capability-quote-tools `957ba228767f7ae0450cbcdf0bcfde615ed6595c44c1f96a49688bd9ff506dfa`; budget extension `aa38a6215ba5d747b79634767d07954961b5d9ee5982091fabe004f39a901b9d`; recovery extension `790db4c0ad5dace7f5729fb6944a64c2da2a93fd5413ad4fc767d27e4ae0192e` |

Commands and raw outputs: `evidence/commands.md`, `evidence/run.tap`,
`evidence/measurements.json`, `evidence/environment.txt`.

## Real Under Test / Deterministic Fakes / NOT tested

- **Real under test**: the v0.10 candidate loader/Host activation seam
  (whole-closure preflight → topological ESM import via private per-activation
  `data:` URLs → sealed-export check → bounded init → ONE K Primary); the
  real selected v0.9 kernel bytes (`createOccurrenceRuntime` actually runs —
  real admission/guard/journal/effect counters move); the real Standard SDK
  bytes with the pure WorkflowRouter vendored BUILD-style; the real Business
  approval package and real capability-quote-tools handlers; the real v0.9
  zero-import AST gate (`assertZeroImportEsmModule`) re-run by the loader on
  every selected module; real SHA-256 verification of real bytes; physically
  distinct extension ESM modules actually evaluated as ESM.
- **Deterministic fakes (outside the tested seam)**: in-memory true-CAS
  document store with conditional writes (create/CAS only — SQLite explicitly
  not required by #1150 for the extension seam); deterministic ticking clock;
  deterministic fixed business inputs (amount 30). The honest-UNKNOWN vector
  reuses the v0.9 bridge-test technique: a store wrapper failing terminal
  journal completions physically, so the real K durably holds `started`
  records and surfaces `ADMISSION_EFFECT_AMBIGUOUS`.
- **Intentionally NOT tested**: malicious-JS isolation (same-realm trusted JS
  is NOT a sandbox — a sealed extension can still busy-loop or read
  `globalThis`); #1124/#1126 principal/one-shot-permit machinery; multi-Host
  CAS interleaving and crash/restart (K01); canonical input digest and turn
  variants (K02); real external effect providers (C01); performance; packed
  tarball installation; CI matrix.

## What was proven (expected vs actual)

### R1 Tiny — Basic-only closure

Expected: zero optional-extension import/evaluation; one K runtime; stable
ordinary admission. Actual (measured): `extensionImports=0`, imports exactly
{kernel, standard, business, capability}=1 each, evaluation sentinel `[]`,
`runtimeFactoryInvocations=1`, three admitted turns with real K counters
`admissions=3, journalBegins=3, journalCompletes=3, effectDispatches=3,
engineCommits=3`; durable advisory record shows `disposition='none'`,
`effectiveCeiling=8` (hard-only Basic budget behavior).

### R2 Rich — two independently sealed K extensions

Expected: two distinct sealed/evaluated modules, useful bounded budget
advice, data-only recovery diagnostics, one runtime factory. Actual
(measured): distinct packageIds and distinct module SHA-256s;
`extensionImports=2`; both hooks selected (`admission-budget-advice/v1`,
`recovery-diagnostics/v1`); budget advice honored at ceiling 5 (two-thirds
policy) with `effectiveCeiling=5 ≤ hardCeiling=8`, durably recorded in the
Primary's own document namespace with provider identity; two real
outstanding UNKNOWNs (journal `started` records after physical
terminal-completion failures) projected permission-filtered
(correlationId+startedAt only); diagnostics accepted both hints, ordered
oldest-UNKNOWN-first, wrote exactly one append-only observation record, and
left journal keys and `effectDispatches` byte-identical; still exactly ONE
runtime factory invocation.

### R3 Role and privilege negatives

Expected: each attempt fails typed or is ignored/clamped BEFORE any K
authority change. Actual (measured):

- duplicate kernel-primary → `V10_ROLE_PRIMARY_CARDINALITY`, zero imports;
- duplicate provider/hook (identical provider key, distinct bytes) →
  `V10_PROVIDER_COLLISION`, zero imports;
- forged `createOccurrenceRuntime`/`effectPermit`/`principal` smuggled in
  the init return → `V10_INIT_CONTRACT_REFUSED`, module imported+initialized
  but `runtimeFactoryInvocations=0`, journal keys `0`, disposals `0`;
- 8 protected Host port names (docs/store/cas/sha256/hostPorts/principal/
  permit/resources) probed AND called at init → every probe recorded, every
  call denied typed `KEXT_PORT_DENIED` (8/8), activation still usable, one
  real admitted turn with `effectDispatches=1`;
- oversize advice (64 > hard 8) → clamped to 8 (`disposition='clamped'`);
  same ceiling plus smuggled `effectPermit`/`authorize` fields → WHOLE advice
  voided (`'ignored-fields'`, `adviceCeiling=null`), turn still admitted,
  only the two real effects dispatched, no store key contains a forged
  permit;
- malformed rotation (negative, non-integer, string ceiling, Promise return,
  missing fields, thrown error) → `ignored-malformed`×4, `ignored-fields`×1,
  `ignored-error`×1; all six turns admitted with Basic behavior;
- forged recovery terminal (`action:'markTerminal'`,
  `terminalStatus:'completed'` + one forged correlation id) → hints dropped
  typed (2 field-smuggles + 1 unknown correlation, 0 accepted), conservative
  fallback ordering, journal keys unchanged, both UNKNOWNs still `started`,
  no effect dispatch during diagnosis;
- over-hard work units (65 > 64) → `ADMISSION_BUDGET_EXCEEDED` typed refusal
  with `runtimeFactoryInvocations=0` and journal keys 0 (BEFORE any K
  admission activity); invalid requested ceilings (0/-3/2.5/'8') clamp to
  the hard ceiling and never break admission.

### R4 Preflight negatives (zero activity across the ENTIRE closure)

Expected: typed refusal with import/init/evaluation sentinel count 0 for the
whole closure, not merely the affected module. Actual (measured, each):
changed digest in a required transitive module (post-seal byte tamper) →
`V10_DIGEST_MISMATCH`; missing declared dependency →
`V10_DEPENDENCY_MISSING`; dependency cycle → `V10_DEPENDENCY_CYCLE`;
invalid extension ABI → `V10_ABI_UNSUPPORTED`; unmet required feature →
`V10_FEATURE_MISSING`. In every case `importsByPackage={}`, `initCalls=[]`,
evaluation sentinel `[]` — even the perfectly valid K/S/B/C core bytes were
never imported. Positive control: the same closure with intact digests
activates and evaluates the side-effect sentinel exactly once
(`evalSentinels=['kext:side-effect-sentinel@1']`), proving the sentinel is a
live detector, not a dead counter.

### R5 Missing optional extension and post-preflight init fault

Expected: fallback Basic behavior with no advanced import; init failure
after complete preflight disposes only initialized modules in reverse,
never rolls back durable K state, leaks no Host protected port. Actual
(measured): optional-absent roster row → `optionalMissing=[telemetry]`,
`extensionImports=0`, sentinel `[]`, admitted turn with Basic budget;
faulted activation on the SAME physical store (bytes/digests valid,
second-extension init throws after the first initialized successfully) →
`V10_EXTENSION_INIT_FAILED`, `disposals=[first-extension-only]` (reverse,
bounded), `runtimeFactoryInvocations=0`, and the whole-store snapshot is
byte-identical to before the faulted activation — durable K state committed
by the earlier successful activation (journal `completed` records) is
untouched, and `portProbes=[]` shows no Host protected port was even
reachable on the failure path.

## What was NOT proven (mandatory)

1. **Not a sandbox**: isolation is proven at the Host-port and contract
   boundary (bounded data-only context, denied probes, typed return
   validation, Primary revalidation), NOT against arbitrary hostile JS
   inside a sealed module (busy loops, memory exhaustion, `globalThis`
   probing, prototype pollution attempts against the advisory input are
   only covered insofar as the Primary validates plain-data shape).
2. **Not the production v0.10 loader**: this seam is a research candidate —
   the real v0.10 BUILD/Host must re-derive roster sealing, approval proof,
   subject digest domains, revocation/CAS linearization and Host profile
   from the frozen v0.9 registry design (my loader reuses its AST gate and
   `data:` URL import strategy but not its approval/CAS authority).
3. **No SQLite / process kill / network / provider**: per #1150 these belong
   to K01/C01; my store is a deterministic true-CAS memory store and my
   effects are real sealed handlers over in-process data.
4. **No #1124/#1126 principal/permit path**: the K Primary's resource port
   dispatches sealed handlers without the one-shot permit machinery; the
   forged-permit negatives prove the EXTENSION cannot mint authority, not
   that the full Host effect permit chain is implemented here.
5. **No packed-consumer journey (P0 Tiny/Rich tarball installs)**: this is
   the seam-level spike the issue scoped, not the version-level pack
   qualification.
6. **No performance, scale, or multi-Host concurrency evidence.**
7. **No remote CI run of this suite** (deliberate: narrow write set, no
   `package.json` edit; the branch's Woodpecker run covers only the standard
   pipeline).

## Failure / negative evidence summary

All negatives are executable scenarios with typed outcomes and zero-activity
counters (see `evidence/run.tap` names `R3:*`, `R4:*`, `R5:*` and
`evidence/measurements.json`). No scenario required repair during the run;
two earlier iterations (fixture `typeof` probes polluting the port-probe
counter; oversize-beyond-plausibility classified malformed instead of
clamped) were design corrections made BEFORE the evidence run, visible in
the branch history.

## Review R1 repair — advisory replay/isolation (R6), bounded to this Issue

Independent review PRR 5562125052 (CHANGES_REQUESTED, P1+P2) on the initial
evidence found a real defect in the research Primary composition: the
advisory consultation record was created with `mustBeAbsent` BEFORE real K
admission, keyed `kext-advisory:${messageId}` scoped only by
subject/tenant. An unchanged messageId retry or a distinct occurrence
reusing the same messageId would fail `HOST_CAS_CONFLICT` in front of real K
replay — observational advice had become a liveness/authority gate,
contradicting the claimed Basic preservation and the v0.10 #1110 replay
contract. Repair (research-branch only, no production code):

1. **No durable write before K.** `#consultBudgetAdvice` is now pure data
   (hook call + Primary validation/clamp); nothing touches the store until
   the authoritative K receipt (or honest UNKNOWN) exists.
2. **Occurrence+turn-scoped key.** The observation is appended under
   `kext-advisory:turn:<workflowId>:<instanceKey>:message:<messageId>` —
   the same components the kernel's own durable turn id derives from, so a
   record can never collide across distinct occurrences reusing a messageId.
3. **Best-effort append that never alters the ACK.** The post-K create is
   observational: a lost create re-reads the winner and compares the
   identity core (everything except the volatile `at` timestamp) — identical
   → idempotent replay; different → typed `conflict` observation, the stored
   record is never overwritten; any storage failure → typed `failed`. None
   of these outcomes can change, delay or refuse the authoritative K
   receipt (new counters `advisoryRecords/Replays/Conflicts/Failures`).
4. **Explicit non-claim (review instruction followed).** The real selected
   v0.9 kernel's turn-disposition identity binds (kernelSha, target,
   messageId, intentType) and EXCLUDES the input payload: a changed-input
   resubmission under the same target+messageId REPLAYS the original
   receipt. #1110 changed-payload conflict refusal is NOT implemented by
   the selected kernel and is NOT implemented here — it remains a v0.10 K02
   obligation. R6 records this as an observed seam gap, not a PASS.
5. **R2–R5 preserved.** All original R2–R5 scenarios and assertions are
   unchanged; R1/R2 only re-point their advisory-record assertions to the
   new occurrence+turn key required by the repair itself.

### R6 measured (expected vs actual, at repair SHA `77216a2a`)

- **Unchanged messageId retry (positive)**: the retry reaches the REAL
  kernel and returns the original receipt with `idempotentReplay=true`;
  durable activity stays once-only (`journalBegins=1, journalCompletes=1,
  effectDispatches=1`, one journal record) while the kernel's `admissions`
  counter — which counts submit ATTEMPTS, replay included — reads 2. The
  advisory observation re-reads its own record and reports
  `budget.record='replayed'` (identity-core match, `at` excluded); exactly
  one advisory key exists.
- **Distinct target, same messageId (positive)**: `instanceKey='b'` reusing
  the first turn's messageId admits independently (`admissions=2,
  effectDispatches=2`, no `idempotentReplay`), with its own advisory record
  under its own occurrence+turn key — `advisoryRecordConflicts=0`.
- **Changed input under same target+messageId (honest gap record)**: the
  real kernel replays the original admitted receipt
  (`idempotentReplay=true`, `journalBegins=1, effectDispatches=1`); the
  changed payload is not detected. Recorded as
  `changedInputDetectedByRealK=false` with the #1110 K02 gap note — NOT
  claimed as working.
- **Conflicting pre-existing advisory record (negative)**: a different
  record pre-written under the turn's advisory key does not refuse, block
  or mutate anything: the turn admits, `budget.disposition='honored'`
  rides intact, `budget.record='conflict'` is the typed observation, the
  winner is not overwritten (revision 0), one real effect dispatched.

Both focused environments at the same repair SHA: Windows (Node v24.21.0)
and Ubuntu 26.04.1 WSL2 (Node v22.23.2) — 23/23 scenarios, exit 0, TAP +
environment + measurements under `evidence/repair-r1/{windows,ubuntu}/`
(commands in `evidence/commands.md` §5). This satisfies review P2 (focused
Ubuntu run at the repaired exact HEAD, no matrix); the initial-round
Windows-only execution remains recorded above as history.

## KEEP / ADAPT / DROP

- **KEEP** — strict order of activation: whole-closure data-only preflight
  (roles/provider-uniqueness/dependency/features/ABI + per-module SHA-256 +
  real zero-import AST gate) BEFORE any import; the zero-evaluation proof
  technique (side-effect sentinel + import counters over the entire closure)
  is directly reusable as the P2-5 falsifier planned for L2/T00.
- **KEEP** — bounded data-only extension init context with denied-call
  proxies and a typed init-return contract; the sealed-export surface check
  (exact export set per extension); reverse-order disposal on late init
  failure with store byte-stability assertion.
- **KEEP** — advisory consumption discipline: exact-field plain-data return
  validation; clamp-against-own-hard-ceiling for sane oversize; whole-advice
  voiding when authority-shaped fields appear; observation-only recovery
  records in the Primary's own namespace; UNKNOWN never terminable by hint.
- **ADAPT** — the seam must be absorbed into the real v0.10 BUILD/Host
  design (registry-owned approval/subject digest/revocation; Host profile
  and audience binding; the resource port regains the #1126 one-shot permit
  path). The advisory durable-record namespace (`kext-advisory:*`,
  `kext-recovery-observation:*`) needs a formal K-owned doc-schema decision.
- **ADAPT** — `admission-budget-advice` demonstrated at the Host admission
  gate (turn-level ceiling/work-units) because the v0.9 K engine takes no
  external step budget; a production hook should ALSO clamp inside the
  K engine's step loop if L2 wants engine-internal enforcement.
- **DROP** — nothing measured falsifies the L2 §C proposal; no DROP.

## Architectural impact

- `K_EXTENSION_FEASIBILITY_HOLD` (L2 R0 §C, #1148) is **dischargeable by
  this evidence**: two separately sealed, non-authoritative K extension
  packages over the one real v0.9 K are feasible with useful data-only
  results and fail-closed boundaries, at seam scope.
- The L2 freeze gate list (§ Stage gates) can move "two separately packed
  useful K extension hints, no privileged K/Host port leakage, no preflight
  import and Primary hard-bound enforcement" from
  EXECUTABLE_DEMO_REQUIRED to EVIDENCED_AT_SEAM_SCOPE, citing this report.
- Follow-up seams still required (bounded, existing scope owners): the
  production loader/registry integration above; K01 two-Host CAS falsifier;
  K02 turn-identity falsifiers; C01 Host effect port with the real permit
  chain; the P0 packed Tiny/Rich consumer journey at version level.

## Reusable reference artifacts

`tests/architecture-v010-k-extensions/` — loader pipeline, bounded advisory
context, K Primary composition over real v0.9 bytes, malicious-fixture
library (oversize/smuggled/malformed/forged-terminal/privileged-init/
port-probe/init-throw/eval-sentinel), and the R1–R6 falsifier suite with
measurement materialization.
