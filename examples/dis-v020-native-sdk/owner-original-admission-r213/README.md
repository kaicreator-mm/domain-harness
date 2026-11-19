# owner-original-admission-r213 — owner-tier original research path admission

DKE #2 / DIE #155 F-D (R213), enabled by the recorded owner grant
(kaicreator-mm/domain-intelligence-engineering#155 comment 7016171014,
2026-11-19; grant-scope sha256 `c814f424…`).

## What this is — and is NOT

R209 (Harness #1527 Phase B) delivered the owner-attested trusted-install →
signed Host same-call chain for the selected Function
`dke.ev16.d02.vv.r188.observe`. R211/R212 recorded that a future qualified
original SAP/ECP, **expressed as a pinned-Function version's own verified
output, is consumable via a new deployment pin with zero Host code change**
— and that the four professional/publisher/formal authority classes stay
external and NOT_ATTESTED. R213, under the owner's explicit scope selection,
delivers exactly that consumption path at the **owner tier**:

- a NEW deployment pin (`deployment:dis-v020-owner-original-admission-r213`)
  in a NEW registry (`owner-original-admission-registry-r213.json`),
  consumed by the **UNMODIFIED r209 admission Host machinery** —
  `full-host-admission-r0/admission-host*.mjs` and
  `o2-installed-rule-trust-preflight.mjs` bytes are untouched;
- an immutable installed-rule record whose bytes embed the versioned
  **owner-tier attestation**
  (`dis.v0.2.owner-original-admission.attestation/1`) binding the selected
  original research path to its content-addressed evidence identities:
  the 815-node Tally graph blob `a49ddf58…` (106/106 Claims PENDING_REVIEW,
  0 in-graph ReviewDecision), the R143 two-leg selected-CQ repin
  `63d671aa…` (p246 SECTION leg valid, p248 LO2 PAGE leg PENDING_REVIEW,
  binding `se:SCB-CS2023-VV-R1`, claim `se:CLM-TVV-0001`), the reader
  `23499770…`, the AI-only review ledger `f9319003…`, DIE R151
  `96e9f42c…`, Forge R123 retained base `bb25c029…`, and the R199 durable
  native-closeout receipt blob `801cec8b…` (R198 63/63 reused, not rerun).

The tier is `OWNER_ATTESTED_ORIGINAL_RESEARCH_ADMISSION`. It is **NOT** and
must never render as: original professional qualification, publisher
licensed rights over CS2023-derived content, formal SAP/ECP qualification
(SAP 0/6, Global 0/5, frozen R8 0/53 unchanged), FORMAL_ORIGINAL_E2E
(professional tier stays 0/1), or any DIS Full-21 promotion (13/21
unchanged). No Effect, no experience issuance, no L2/Release, no main
merge; the Draft parents domain-forge#208 and domain-harness#1497 stay open
drafts. Single-owner ecosystem: independence is structural (issuer/Host
private keys outside the repo; caller never holds them; SPKIs pinned from
the committed operator registry), never inter-personal.

## Files

| File | Role |
| --- | --- |
| `owner-original-evidence.mjs` | evidence bridge: byte-exact verification of the committed original fixtures + the versioned owner-tier attestation and installed-rule builders (tier-confusion guard included) |
| `installed-rule-owner-original-r213.json` | immutable installed-rule record; sha256 = pinned `installedBytesDigest`; embeds the attestation |
| `owner-original-admission-registry-r213.json` | NEW deployment pin (public trust roots: issuer/Host SPKIs, tenant/scope approval, digest bindings, epoch) |
| `provision-owner-trust-r213.mjs` | local owner run: generates the committed registry/installed-rule and `evidence/owner-run-r213/**`, performs the real same-call |
| `owner-original-admission.test.mjs` | positive + adversarial negatives + committed-chain re-verification (CI runs it on every pipeline) |
| `evidence/owner-run-r213/**` | archived owner same-call run: installer receipt, invocation record, signed Host admission result, durable ledger + anchor, run summary (public data only) |

## Owner provisioning run (local, once per rotation)

```bash
node --import tsx provision-owner-trust-r213.mjs \
  --keys <owner-key-dir> --grant-scope <grant_scope_canonical.txt> \
  [--extra-pins <dir-with-materialized-evidence-blobs>]
```

`<owner-key-dir>` holds `issuer-ed25519.pem`, `host-ed25519.pem`,
`host-spki.b64url` (persistent, outside the repository).
`--grant-scope` must hash exactly to the recorded grant scope
(`c814f424…`), else the run aborts. `--extra-pins` optionally re-verifies
the four DKE-side identity pins from materialized mirror bytes; without it
they stay identity-bound but are marked not-byte-reverified in the run
summary — no verification is ever invented.

## CI

`.woodpecker/dis-v020-owner-original-admission-r213.yaml` runs this suite
plus the unchanged r209 admission, R188 boundary and O2 preflight
regressions on the exact PR SHA.
