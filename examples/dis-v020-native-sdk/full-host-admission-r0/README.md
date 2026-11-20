# full-host-admission-r0 — one selected Function, trusted install → signed Host receipt

DIS #3 / Harness #1527 Phase B (R209), enabled by the recorded owner grant
(kaicreator-mm/domain-harness#1527 comment 7007585312, 2026-11-19).

## What this closes

Phase A (integrated @6244a0cd) proved the boundary: the O2 installed-rule
preflight is deliberately negative-only because no independent installer trust
root exists, and the historical R50 Host ABI cannot accept the selected
Function `dke.ev16.d02.vv.r188.observe`. This directory adds the minimal
admission seam: operator-pinned trust roots, an installer tool, an admission
Host process, and the caller-side same-call driver that boots the real
byte-pinned AOT/SDK, invokes the selected Function, and obtains a signed
same-call Host receipt with durable replay fencing.

## Trust topology (honest scope)

SINGLE-OWNER ECOSYSTEM: the project + Host owner exercised all four authority
roles (source purpose approval, installer-operator, tenant/deployment
operator, Host key custody) via the recorded grant. Independence is
**structural**, not inter-personal:

- issuer private key — operator file outside the repo, used only by
  `issuer-install.mjs` at provisioning time;
- Host private key — operator file outside the repo, read only by
  `admission-host-service.mjs` via `ADMISSION_HOST_KEY_FILE` (mandatory, no
  ephemeral fallback);
- caller/SDK — never sees either key; verifies receipts against the SPKIs
  pinned in the committed `admission-registry.json` (operator channel), never
  against a receipt-embedded key;
- durable state — append-only hash-chained ledger + atomic anchor; rollback,
  truncation, edit or injected lines pin the Host fail-closed.

This is an engineering admission Host, not a production oracle: receipts are
OBSERVATION-only (`claimAttested:false`, `externalBusinessEffect:false`,
disposition UNKNOWN carried through). No Effect, no experience issuance, no
Matrix promotion, no L2/Release claim.

## Files

| File | Role |
| --- | --- |
| `admission-registry.json` | operator-pinned public trust roots (issuer/Host SPKIs, tenant/deployment/scope approval, digest bindings, revocation epoch) |
| `installed-rule-r188.json` | immutable installed-rule record; its sha256 is the pinned `installedBytesDigest` |
| `issuer-install.mjs` | installer-operator tool: signs the canonical O2 payload with the operator-held Ed25519 key |
| `admission-host.mjs` | Host core: pinned-root verification, binding/epoch/freshness checks, hash-chained durable ledger, Ed25519 same-call receipt |
| `admission-host-service.mjs` | Host process (stdio JSON IPC); reads the Host key only from `ADMISSION_HOST_KEY_FILE` |
| `admission-consumer.mjs` | caller side: spawns the Host process, verifies receipts against the pinned Host identity |
| `test-fixture.mjs` | shared byte-pinned real-AOT fixture (identical construction to the accepted R188 boundary test) |
| `full-host-admission.test.mjs` | positive + adversarial negatives (see header) |
| `provision-owner-trust.mjs` | local owner run: generates the committed registry/installed-rule and `evidence/owner-run-r209/**` |
| `evidence/owner-run-r209/**` | archived owner same-call run: receipts, invocation record, durable ledger, run summary (public data only) |

## Owner provisioning run (local, once per rotation)

```bash
node --import tsx provision-owner-trust.mjs \
  --keys <owner-key-dir> --grant-file <owner-grant.md>
```

`<owner-key-dir>` holds `issuer-ed25519.pem`, `host-ed25519.pem`,
`host-spki.b64url` (persistent, outside the repository). The run performs the
real same-call and archives the evidence; CI re-verifies the archived
signatures, digest bindings, ledger chain and replay fence against the
committed registry on every pipeline run.

## CI

`.woodpecker/dis-v020-full-host-admission-r0.yaml` runs the admission tests
plus the unchanged R188 boundary and O2 preflight regressions on the exact
PR SHA.
