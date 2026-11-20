# DIS 0.2.0 R10 — native Interaction Function Demo with original xDownload Business

**Version master** [#1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), Product/L1 authority [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496). **Candidate only**; no L2 Freeze or direct xDownload Host dispatch.

## Normalized contract

The existing *actual* xDownload Business policy and `confirmDownload → acquisition.acquire` route are retained. A new ordinary `interaction` Element in the same Domain has two local, source-pinned public Functions: `xdownload.interaction.inspect` and `xdownload.interaction.confirm`. The implementing source `examples/dis-v020-interaction/download-goal.mjs` is a self-built sealed adapter, not an original xDownload product module, and its origin is explicitly permitted by the composite Domain's trusted repositories. AOT independently locks repository, commit, path, exact Git Blob, SHA256 and installed digest.

The Function contract now recognizes the `interaction` role but this role **does not grant any runtime authority**. `interaction` Functions must be bound as `LOCAL` with `effect:none`. `KDP_INTENT` binding or Effect reclassification is refused during native AOT qualification. They invoke actual native `loadDisV020Aot`, not a Demo-only alternative resolver.

## Actual user-oriented flow (no UI framework dependency)

- Form, Chat and CLI are merely source channel labels mapped to the **same bounded data schema and two native Functions**. Missing URL or declared size yields `CLARIFICATION_REQUIRED`, not an inferred success.
- HTTPS-only URL, size <= 1 MiB matching the actual xDownload Business guard, fixed request ID, no arbitrary fields. Invalid URL, size and injected execute fields fail closed.
- Confirmation is explicit: without it the Function returns `AWAITING_CONFIRMATION`; with it, `READY_FOR_KDP` remains `OBSERVATION/NONE`, explicitly `permittedEffect:false` and `effectDispatched:false`. The caller must make a **separate selected KDP Intent call** for any governed external Effect. There is no direct Host adapter or download transfer in this Demo.
- Forging a `draft.status=READY_FOR_KDP` does not bypass revalidation; binding, source and AOT authority remain checked by the native SDK.

Six executable native SDK cases added to the existing source-real R9 test suite. They cover positive three-channel clarification/confirmation, bad URL and byte limit, injected fields and forged state, KDP Effect escalation attempt and post-stop denial. **These prove only typed Interaction consumption via the native SDK, not deployed UI/Chat/CLI adapters or general Outcome/Evidence Schema**. Requirement DIS020-CORE-014 remains PARTIAL until full applicable coverage and exact-SHA proof.
