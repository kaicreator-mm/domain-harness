# V08 B2 R3 A1 — trusted native authority / Host port closure (P1-02/P1-03)

Pre-Freeze **RESEARCH** successor for [issue #984](https://github.com/kaicreator-mm/domain-harness/issues/984).
**Not** a v0.8 L2 implementation, not a Tech Gate / D2 #972 closure, no merge.

- Base (exact): `e11a0510134903d6f05a20dd024f3740429edc33` (B2 R2 PR #980 HEAD), tree `86a8133d97a9c3c1d8fa97efa1ca5f9c57e592ab`.
- Repairs the two P1 findings of the independent #982 Fresh Review Terminal
  ([comment 6081321593](https://github.com/kaicreator-mm/domain-harness/issues/982#issuecomment-6081321593))
  against `experiments/v08-gatea-repair-942/authority/native-join.mjs` at that base.
- Any R2 source reused is imported **by module path and attributed to base SHA
  e11a051** in the file header; no pre-existing file is modified.

## Falsifiable hypotheses and results

| # | Hypothesis (if / then / and) | Result |
|---|---|---|
| H1 | If the physical Component is projected under the explicit rules of `authority/native-projection.mjs`, then the native Tool keeps the exact identity, semantic contract, caller/exposure/failure scope and consumed capabilities, and any projection drift or unsupported physical shape is typed-rejected. | PASS (A3 tests 1, 9) |
| H2 | If the exposure admission decision is made by a trusted Host-only policy port bound to the exact current (domain, package, occurrence, caller, operation, effect) tuple through the ORIGINAL T004A `admitToolExposure`, then unknown/forged/wrong-kind/non-carried callers are denied BEFORE dispatch with 0 unauthorized dispatch and 0 journal effect rows. | PASS (A3 tests 4, 5) |
| H3 | If the occurrence identity is derived only from the real physical package bytes (domainId/packageId = physical packageId, CDI digest = physical manifest SHA, T002D PRODUCTION pin on the successor Assembly), then no fixture `pkg-orders-1` identity/pin participates and the effect type is derived from binding facts (`effect:<packageId>.<operationId>`). | PASS (A3 tests 1, 2, 3) |
| H4 | If the public Host façade accepts only the closed business input set `{input, caller}`, then every authority-bearing key (`dispatch`, `admissionPorts`, `effectJournal`, `activator`, `sha256`, `effectType`, `binding`, `request`, `admissionRequest`, `currentDefinitionGraph`, `resourceProvider`, `effectAuthority`, `effectTools`, `policy`, `exposure`) is typed-rejected (`E_HOST_BUSINESS_INPUT_ONLY`) before admission/dispatch. | PASS (A3 test 4: 15 keys × fresh occurrence each) |
| H5 | If authority material is nonetheless injected through the privileged fenced research channel, then the ORIGINAL v0.7 seam still fail-closes (UNMINTED_TOOL_IMPLEMENTATION_BINDING, ASSEMBLY_PROVENANCE_UNVERIFIED, GOVERNANCE_EXECUTION_PIN_MISSING, INVOCATION_BINDING_MISMATCH, ADMISSION_EFFECT_TOOL_UNBOUND, INVALID_TOOL_DISPATCH_PORT, INVALID_INVOCATION_INPUT, FORGED_EXPOSURE_EVIDENCE) with 0 dispatch / 0 completed journal rows each. | PASS (A3 test 6) |
| H6 | If the authorized flow runs, then exactly 1 real dispatch + 1 `completed` record land in the ORIGINAL journal and the same-occurrence replay adds zero (disposition `replayed`). | PASS (A3 test 2) |
| H7 | If the physical module bytes are tampered after Seal, the Host byte-currentness gate refuses (`E_APPROVED_BYTES_STALE`) before admission/dispatch/journal. | PASS (A3 test 8) |

## Files

- `authority/native-projection.mjs` — P1-02 part 1: explicit trust-preserving
  physical→native projection (identity, semantic contract incl.
  `declaredFailures`/`declaredExposure` mapping of physical
  `failures`/`exposure`+`callers`, consumed capabilities, REAL
  `validateComponent`, typed rejects for unsupported shapes). Derived from R2
  `native-join.mjs` L45–75 @ e11a051.
- `authority/host-policy.mjs` — P1-02 part 2: trusted Host-ONLY exposure
  policy port; decisions tied to the exact attested tuple; consumed by the
  ORIGINAL `admitToolExposure`; ambiguity fails at construction. Derived from
  R2 `native-join.mjs` L98–109 finding @ e11a051.
- `authority/native-occurrence.mjs` — P1-02 part 3: fresh T002D PRODUCTION
  occurrence bound to the REAL physical package identity + armed ORIGINAL
  Central Admission request with binding-derived effect type. Derived from R2
  `native-join.mjs` L111–129 finding @ e11a051.
- `authority/native-authority-host.mjs` — the bounded Host bridge successor
  (P1-02 chain + P1-03 closed façade + fenced privileged research channel).
  Derived from R2 `native-join.mjs` (whole) @ e11a051. Exports the #983 K1
  seam `bindProjectedPhysicalToNativeAuthority`.
- `authority/invoke-v07.mjs` — v0.7 authority seam wrapper; derived from R2
  `invoke-v07.mjs` @ e11a051 (behavior unchanged; re-attributed).
- `tests/kind-authority-b2-r3-a1.test.mjs` — A3 matrix (12 tests, 60+
  assertions). Negative on **fresh occurrences**; never same-journal replay
  only. Fixture `candidate()` bytes reused verbatim from the R2 test @ e11a051.

## What is proven vs. honestly NOT proven

Proven (executable, original v0.7 source modules):
- Real T003C binding mint over the exact B1-attested physical handler bytes →
  seal-minted T002B successor Assembly → T002D PRODUCTION pin → T004A
  exposure+request admission (trusted policy) → ORIGINAL T004C Central
  Admission + ORIGINAL `VolatileAdmissionEffectJournal`. No second Runtime,
  store, journal or admission path exists.
- Closed non-authority façade; privileged channel is a separate constructor,
  unreachable from the façade object, and even it cannot substitute effect
  authority (v0.7 installs the only verified-binding effect adapter).

NOT proven / honest limitations:
- **Durable restart recovery: NOT_PROVEN.** The journal is the original
  VOLATILE fixture journal; no store process restart is tested or claimed.
- **#983 K1 unified Kernel: PARTIAL.** The physical attestation layer still
  comes from the R2 `establishTrustedPackageKindHost` (repository-code trusted
  neutral Kernel — P1-01 scope). A1 exports the precise consumption seam
  (`bindProjectedPhysicalToNativeAuthority` + `facade.describe().k1Interface`);
  K1 integration is NOT done here and is not mocked.
- **Caller authentication: out of scope.** Caller context remains v0.7
  provenance-only; the trusted Host policy authorizes exact (callerId,
  callerKind) tuples per occurrence — it does not authenticate humans.
- **No sandbox claim**: data-URL module loading and regexp import filtering in
  the physical Host are NOT isolation. The original v0.7 Central Admission
  effect/State/Journal/replay semantics are consumed unchanged; no effect is
  granted through any caller-supplied callback.
- A1 alone CANNOT close #942 Tech Gate or unlock D2 #972.

## Run

```bash
node --import tsx --test experiments/v08-b2-r3-a1/tests/kind-authority-b2-r3-a1.test.mjs
```

CI: `.github/workflows/v08-b2-r3-a1.yml` (push + PR; Ubuntu Node 22/24;
full gate + fast falsifiers; keeps B1 26/26, R1 32/32, R2 24/24).
