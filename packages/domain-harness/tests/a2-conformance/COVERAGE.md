# A2 I-008 — Incremental conformance coverage matrix (slice over v0.3@6ff6c10)

Status: **INCREMENTAL, NOT FINAL I-008 PASS.** This slice executes the A2
conformance/negative cases that the A2 surface **landed at
`v0.3@6ff6c102852b0e9d2255c7362a7117b9eee01210`** already owns:

- DAC cross-layer reference adapter — I-002 / #305 (`src/dac/**`),
- durable ordered Runtime observation stream — #312 (`src/observation/**`),
- generic public Runtime cancel/interrupt control — #313 (`src/control/**`).

Per DAG #300, final I-008 PASS is gated on I-003..I-007 all merging; deferred
cases below must be extended in the increments that land those concerns.

## Executable coverage

| DAC case (A2 §10) | Owner surface | Executable test |
| --- | --- | --- |
| C02 / N01 — mutable `latest/current/head` never enters authoritative selection | `src/dac` guards | `dac-c-series.test.ts` — alias tokens rejected for **every** role; whole-token semantics (contains-alias exact ids accepted) |
| C03 / N02 — revision/digest drift fails closed | `src/dac` verify | pinned by `tests/dac-refs/dac-reference-adapter.test.ts` (per-field + absent-field mismatch); this slice adds journey-stage drift in the C36 test |
| C07 / N03 — Simulator PASS / non-promotion never becomes promotion evidence | `src/dac` guards | `dac-c-series.test.ts` — promotion guard rejects every other role; forged `role` in adoption input ignored |
| C09 / N10 — stale/drifted basis cannot be silently applied | `src/dac` (adapter part only) | `dac-c-series.test.ts` — deeply frozen refs, post-adoption identity writes throw; runtime-application half deferred to I-005 |
| C11 / N13 — dispatch/provider acceptance != external authoritative commit | #312 observation | `cross-surface-authority.test.ts` — `MESSAGE_ACCEPTED` + `TURN_RECOVERY_REQUIRED` with no commit-family record; external-dispatch half deferred to I-006 |
| C12 / N14 — timeout/crash after possible effect stays unknown | #313 control | `cross-surface-authority.test.ts` — unresolved non-idempotent effect => `REQUIRES_RECONCILIATION`, effect journal stays `started`, never fabricated committed/failed/cancelled |
| C13 / N15 — ambiguous non-idempotent effect not blindly retried | #313 control | `cross-surface-authority.test.ts` — duplicate control reissue => `DUPLICATE`, no second effect execution |
| C16 / N09 — missing/incompatible runtime identity/capability blocks | `src/dac` (adapter part only) | `dac-c-series.test.ts` — implementation ref floating on `current` rejected; full capability-blocking validation deferred to I-003/I-004 |
| C22 / N05 / N06 — promotion/selection/compatibility/binding/activation separately referrable | `src/dac` guards | `dac-c-series.test.ts` — exhaustive 8x8 cross-role guard matrix with identical identity fields (nominal, not structural) |
| C23 / N08 — RuntimeContractRef != concrete RuntimeImplementationRef | `src/dac` guards | `dac-c-series.test.ts` — identical-fields contract/implementation cross-rejection |
| C31 / N06 — selected != bound != activated | `src/dac` guards | `dac-c-series.test.ts` — explicit selected/binding/activation cross-rejection (inside the 8x8 matrix and as a named case) |
| C32 / C37 / N07 — no auto-latest/substitution; fail closed | `src/dac` surface | `dac-c-series.test.ts` — exact frozen value-export snapshot (any substitution surface of any name fails this allowlist); full reselection flow deferred to I-003 |
| C36 — exact promoted→selected→compatible composition journey (positive) | `src/dac` | `dac-c-series.test.ts` — coherent 8-role journey, per-stage exact verification, in-journey drift fails closed |
| N04 — registry default can never become application selection | `src/dac` input | `dac-c-series.test.ts` — `defaultPackageId`/registry-shaped extra fields never reach adopted identity |
| N16 — no DAC role substitutes external Business SoR identity | `src/dac` refute | `dac-c-series.test.ts` — refutation across all eight roles; non-DAC values pass through |
| PROVISIONAL opaqueness — unknown fields preserved, never interpreted | `src/dac` opaque | `dac-c-series.test.ts` — forged authority keys in opaque never override identity or satisfy verification (verbatim round-trip itself pinned by #305) |
| Dispatch: #312/#313 must not collapse DAC distinctions or acquire lifecycle authority | all three | `cross-surface-authority.test.ts` — source-level import isolation both directions; DAC provenance in the observation stream stays opaque uninterpreted strings; observation reads are pure evidence; control records mint no DAC authority |

## Deferred to I-003..I-007 increments (NOT faked in this slice)

| Concern | Deferred cases | Owning increment |
| --- | --- | --- |
| Exact selected package validation / mapping | C03 full mapping fail-closed, C32/C37 reselection flow, C16 capability-blocking, N07 full | I-003 |
| Runtime binding / technical activation evidence | C22 flow-level binding/activation stages, C31 flow separation | I-004 |
| DomainIntent/View/Snapshot/Watch bridge | C09 runtime-application half, C33 / N12 presentation host != Runtime Host Binding, N11 | I-005 |
| External authority / operation / observation refs | C11 external-dispatch half, N13–N16 at the external-authority layer, C12/C13 reconciliation identity | I-006 |
| Application Manifest composition adapter | C38 / N17 / N18 Manifest instance-state leakage & evidence separation | I-007 |

## Observations recorded for review (no behavior change in this slice)

- `DAC_REFERENCE_BASELINE` is a shared module-level object carried by
  reference on every adopted ref; `Object.freeze` covers the ref and its
  `opaque` but not the shared baseline constant (top-level fields remain
  runtime-writable in plain JS). Fail direction is closed (a mutated constant
  makes adoptions mismatch, not accept foreign baselines more easily —
  adoption compares against the same mutated object), but hardening the
  constant would remove the shared-mutable-global surface. Left for reviewer
  adjudication; not asserted here.

## Fixture provenance

`InMemoryObservationStore`, `InMemoryControlRuntimeStore`,
`InMemoryRuntimeControlStore` and `createRuntimeHostFake` are the existing
VOLATILE in-memory reference fixtures from the #312/#313 suites (portable
semantic conformance only — never host-durability evidence). No product source
was changed by this slice.
