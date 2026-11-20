# B03 — Target ABI / installer authority and original-source SAP boundary

**DIS v0.2.0 exploratory batch:** Draft PR [#1497](https://github.com/kaicreator-mm/domain-harness/pull/1497), Demo Master [#1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), Product/L1 [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496).

## Added real native contract (R38–R40)

R38 added the **optional, additive** `program.target` declaration `dis.v0.2.selected-target/1`, carrying `platform`, `architecture`, `runtime`, and a **complete exact canonical BUILD-selected Package ID/module SHA256 roster**. The Contracts qualifier checks the complete selection against the actual original Tally, xDownload and KDP/Capability BUILD output. A missing selected module, wrong module source SHA, duplicate or unknown Package and invalid enum/field fail closed. The Target declaration participates in the AOT digest. Preexisting untargeted v0.2 artifacts retain their previous native semantics: `qualified.target===null`.

R39 requires an **independent installed Target identity** to load a targeted AOT, alongside the previously independent `expectedDigest` and optional source origin/hash currentness. A missing/invalid/mismatched installer Target refuses boot; valid Target identity cannot override stale AOT digest, stale original source or authorize KDP Effects. A trusted installer supplying `expectedTarget` is a conscious caller-declared preflight **not** runtime host attestation.

R40 uses exactly the same **real canonical original Business/Capability module bytes** to compile both a Linux and a Windows *Target label*; this is an intentional counterexample, proving that a Target metadata label by itself does not qualify a platform-specific native implementation. The byte-identical DKE one-model original source-first reviewer and synthetic GH locator proposal still have no independent semantic Oracle, no owner accepted patch, and retain the original 16:24→23:03 gap. The actual selected Tally Function remains non-authoritative `OBSERVATION/NONE`. Target cannot grant SAP or an Effect.

## User-visible evidence and limitations

Each of the three rounds is independently Git committed with its native source/test Blob and `round.json` / `ROUND.md` under [B03 rounds](rounds/). Native regression checks run in the existing Woodpecker DIS Integration lane. **The authoritative receipt is the exact reported state in `receipts/r38-b03-target-roster-ci.json`, `r39-b03-installer-target-ci.json`, `r40-b03-target-sap-boundary-ci.json`; these must not be minted SUCCESS until all applicable source SHA CI contexts report SUCCESS.** Original intermediate ERROR/PENDING states remain in round history, not rewritten as earlier green builds.

**Product/L1 C3 is still pending**: the present Target contract identifies selected modules and installed target labels, but does not prove a different native binary/implementation at Windows/Linux/Android, does not validate an actual client OS, and cannot prove platform-resource closure. No production Form/Chat/CLI UI transport is implemented by this batch. Therefore **CORE-008 remains PARTIAL even after a passing native batch**, unless Product/L1 explicitly approves narrower scope and the corresponding real package/host evidence is verified.

**Product/L1 C1 is also pending**: two DKE SAP proposals and the GH locator repair remain unapproved; the first-party source owner/semantic reviewer must qualify the original graph, proposed Element ownership, and evidence semantics. No script-created independent Oracle can substitute for this decision.

## Efficiency and next gates

B01 and B02 previously delivered 6/6 bounded rounds and 22 new cases without changing Core 9/16. B03 makes a **real SDK/Contracts ABI change** rather than merely repeating test permutations, but this is not the same as full OS-Target domain truth. Subsequent work should prioritize one *genuinely different target-specific selected Package implementation* (if within Product/L1 scope), independent original Tally source-owner + SAP qualification, full C1/C2 obligation review, then C4 matrix finalization and C5 governance. Do not keep adding arbitrary labels or toy demos to lift coverage artificially.

No frozen DIS 0.1.0 changes, no original Tally/Runx/xDownload source edits, no GitHub Actions, no unrelated Node-version gate, no real physical Effect, no merge/freeze/release.
