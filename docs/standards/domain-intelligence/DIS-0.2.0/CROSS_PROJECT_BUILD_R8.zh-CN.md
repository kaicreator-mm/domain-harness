# DIS v0.2.0 R8 — Cross-project actual BUILD and KDP/SDK selection

**Scope:** follow-up to R7.1 verified source-real Tally/Runx/xDownload Function Demo. This is a **real canonical BUILD/SDK compatibility test** with constrained authority. It is not a claim of a native DIS v0.2.0 Product ABI.

## What is physically selected

From the five **exact Git Blob pinned source snapshots** already checked in R7.1:
- `tally/business.mjs` becomes a newly selected, **original unmodified Tally Business Package** with its actual 10 declared Intent IDs. Existing Tally `assessTaskEvidence` and release-readiness Functions remain directly consumed by R7.1.
- `xdownload/business-download.mjs` becomes a newly selected, **original unmodified xDownload Business Package** with `intent:confirmDownload`.
- `xdownload/capability-acquisition-stub.mjs` becomes the original xDownload selected external Effect Capability, with `externalEffect:true`, and `confirmDownload → acquisition.acquire` is the only additional selected KDP route.
- Real selected basic KDP/SDK/Business/Capability remain in the closure, so an existing known-safe order request can be sent after **real `load()`** to test activation.
- **Runx:** the genuine TypeScript `EnvironmentAgentPresence` is selected as a **stateful DIS Element** through the qualified R7 Function adapter. It is **not** a Business Policy and MUST NOT be mislabeled as a native v0.10 Business Package. An observer record does not grant a live lease or execution authorization.

**Authority:** The KDP has no selected Tally Claim execution route or qualified GitHub Host effect adapter in this R8 fixture. Merely including Tally Business source bytes MUST NOT grant native Claim, Task PASS or Release authority. The xDownload stub is selected with its original KDP external Effect declaration, but no real trusted acquisition Host bridge / download transfer is wired. R8 must **not** create a file, contact a provider, mint an Effect permit or perform a download. The R7 layer continues to reject direct invocation of xDownload acquisition without KDP.

## Demo-first tests

`examples/dis-v020-cross-project/selected-build.mjs` consumes the real `buildV10App` (canonical selected digest/route/modules) and real public Microkernel `load`. It does **not** implement a second build engine. `selected-build.test.mjs` covers nine outcomes:

1. Real Tally and xDownload source bytes become actual BUILD-selected Business modules.
2. xDownload Capability is selected with its real external Effect route and declared permission.
3. Exact BUILD output is deterministic across repeated real-source qualification.
4. Tally module source substitution with stale SHA must be **rejected by canonical BUILD**.
5. Forged xDownload acquisition handler route must be rejected by canonical BUILD.
6. Real KDP/SDK loads the selected closure; a known existing bounded orders request still dispatches.
7. Tally Claim Intent without a selected route is **not authorized** merely because the policy source is included.
8. Direct xDownload Effect invocation outside KDP remains refused.
9. Real Runx state observer stays a scoped stateful Element with no invented KDP execution rights.

The demo runs from the real domain-harness monorepo root:

```sh
npm ci
npm run build
node --import tsx --test examples/dis-v020-cross-project/selected-build.test.mjs
```

The dedicated Woodpecker DIS lane includes the **same previous R6.1 and R7.1 regression tests** and this new suite, with no extra Node major-version restriction. This is **source-real canonical BUILD / KDP activation** evidence; native DIS Element/App Init/Function ABI and product-specific Tally GitHub/Runx Agent/xDownload Host Effects remain subject to separate integration. The original three repositories are not modified.

**Evidence rule:** no R8 PASS until the exact new PR HEAD receives a successful Woodpecker receipt. An error in source compatibility or runtime authority must be repaired in the original R8 Demo write-set and re-validated.
