# A2 I-008 — Final conformance coverage matrix (closure over v0.3@0d4d51e)

Status: **FINAL.** I-003..I-007 are all merged; this directory now executes
the complete A2 adversarial/conformance matrix over the full landed surface:

- DAC cross-layer reference adapter — I-002 / #305 (`src/dac/**`),
- durable ordered Runtime observation stream — #312 (`src/observation/**`),
- generic public Runtime cancel/interrupt control — #313 (`src/control/**`),
- DAC-aware composition intake — I-003 / #306 (`src/composition-intake/**`),
- Runtime binding + technical activation evidence — I-004 / #307
  (`src/runtime-binding/**`),
- DAC UX<->Runtime correlation bridge — I-005 / #308 (`src/dac-bridge/**`),
- external authority evidence/correlation adapter — I-006 / #309
  (`src/external-authority/**`),
- PROVISIONAL Application Manifest composition adapter — I-007 / #310
  (`src/application-manifest/**`).

The #331 incremental slice (over `v0.3@6ff6c10`) is preserved untouched in
`dac-c-series.test.ts`, `cross-surface-authority.test.ts` and its original
fixture; the final files extend the suite from
`final-matrix-fixtures.ts`.

## Final executable matrix (dispatch vectors -> tests)

| Closed vector | Final test |
| --- | --- |
| mutable `latest/current/head` at every authoritative stage | `intake-final-matrix.test.ts` (flow-level slots), `binding-final-matrix.test.ts` (activation instance identity), `bridge-final-matrix.test.ts` (observation basis), `manifest-final-matrix.test.ts` (identity fields) + incremental C02/N01 all-role pin |
| revision/digest drift, full selected-ref -> package mapping (C03/N02) | `intake-final-matrix.test.ts` — digest/revision drift, provenance-internal drift, unpinned digest selection |
| Simulator PASS -> promotion/selection shortcut (C07/N03) | `intake-final-matrix.test.ts` (raw simulator object, opaque smuggler) + `binding-final-matrix.test.ts` (simulator compatibility claim) |
| default package -> selection shortcut (N04) | `intake-final-matrix.test.ts` (registry-shaped package) + `manifest-final-matrix.test.ts` (exact entry or nothing) |
| compatibility auto-substitution (C32/C37/N07) | `intake-final-matrix.test.ts` — other exact revision never substituted, incompatibility terminal with refusal message, verdict only for the exact package + frozen no-substitution error taxonomy in `final-surface-freeze.test.ts` |
| Runtime contract/implementation collapse (C23/N08) | `intake-final-matrix.test.ts` — identical full tuples fail `ROLE_IDENTITY_COLLAPSE` |
| selection/binding/activation collapse (C22/C31/N05/N06) | `binding-final-matrix.test.ts` — genuine-verdict/genuine-binding-only minting, forged clones, foreign stages, structural content distinctness |
| stale UX basis (C09/N10 runtime half) | `bridge-final-matrix.test.ts` — CURRENT/STALE fail-safe classification, `BASIS_REQUIRED`, `TARGET_MISMATCH` reinterpretation refusal, SnapshotRef basis parity |
| presentation host -> Runtime Host Binding leak (C33/N12) | `bridge-final-matrix.test.ts` — recursive host-vocabulary scan over all seven roles, forged host objects, single command constructor + `manifest-final-matrix.test.ts` (renderer object as UX anchor) |
| dispatch/timeout -> external commit/non-commit fabrication (C11/C12/N13/N14) | `external-authority-final-matrix.test.ts` — dispatch proves dispatch only, `LOCAL_CAUSE_FORBIDDEN` on every evidence class, not-committed without basis, `TERMINAL_ABANDONMENT` stays unresolved |
| blind ambiguous non-idempotent retry (C13/N15) | `external-authority-final-matrix.test.ts` — `unknown-ambiguous` claim ceiling `no-claim`, caller-supplied claim rejected, `STILL_UNKNOWN` with decisive basis rejected, provider-scope success != business commit + incremental #313 control-layer DUPLICATE pin |
| Manifest live-state leakage (N17) | `manifest-final-matrix.test.ts` — recognized vocabulary rejected in every opaque area, novel state-shaped fields stay inert opaque content, deeply frozen post-adoption |
| binding/activation evidence absorption into Manifest (C38/N18) | `manifest-final-matrix.test.ts` — verdict/binding/activation evidence and refs rejected as definition content in every slot; correlations exist only as separate evidence with exact manifest identity/digest and object-identity verdict/binding matching |
| capability/floating-declaration blocking (C16/N09 full) | `intake-final-matrix.test.ts` — missing capability, floating implementation dimensions, unpinned implementation ref |
| reconciliation identity exactness (C12/C13/N13 external) | `external-authority-final-matrix.test.ts` — idempotency conflict, expectation mismatch, forged correlation clone |
| no Runtime-side identity substitutes external Business SoR identity (N16) | `external-authority-final-matrix.test.ts` + `manifest-final-matrix.test.ts` (bare URL, DAC refs, runtime implementation ref) + incremental 8-role refutation |
| no substitution/host/absorption surface of any name | `final-surface-freeze.test.ts` — exact export allowlists for all five I-003..I-007 modules (the incremental #305 allowlist tripwire extends here) |
| coherent positive journey end to end (C36 full) | `final-journey.test.ts` — stages 1-5 + manifest adoption/composition/correlation + UX correlation on a CURRENT basis + external dispatch/observation/reconciliation, with the standalone-binding piggyback attack failing |
| #312/#313 must not collapse DAC distinctions | `cross-surface-authority.test.ts` (incremental slice, unchanged) |

## Conformance facts recorded during closure (no behavior change)

- The #310 manifest digest registry (`VERIFIED_DIGEST_BY_MANIFEST_IDENTITY`)
  is process-global by design: the same immutable manifest identity can never
  resolve to two digests within one process. The final fixtures therefore give
  every adopted manifest a unique identity except where a test deliberately
  triggers `MANIFEST_IDENTITY_DIGEST_CONFLICT`.
- DAC-reference substitution attempts inside manifest external-authority
  declarations surface as unwrapped `DacReferenceError`
  (`EXTERNAL_IDENTITY_FORBIDDEN`) per the frozen contracts — the
  `EXTERNAL_IDENTITY_SUBSTITUTION` code is reserved for non-references such
  as a bare provider URL. Pinned as-is in `manifest-final-matrix.test.ts`.
- The incremental slice's observation on the shared `DAC_REFERENCE_BASELINE`
  constant (top-level mutability, fail direction closed) remains as recorded
  by the #331 fresh review: non-blocking, unchanged here.

## Fixture provenance

`createCompiledPackage` / `createSha256Fake` are the existing VOLATILE
in-memory fixtures from the package suites; `InMemoryObservationStore`,
`InMemoryControlRuntimeStore`, `InMemoryRuntimeControlStore` and
`createRuntimeHostFake` (incremental slice) are the #312/#313 VOLATILE
reference fixtures. Portable semantic conformance only — never
host-durability evidence. No product source was changed by this closure.
