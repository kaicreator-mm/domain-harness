# DomainHarness v0.10.1 → v0.10.2 migration (T08b preparation draft)

> **DRAFT / NOT FINAL / DO NOT MERGE BEFORE T07b #1328.** This is an A3-authorized, unmerged documentation outline, not a release claim or approved package export contract. Exact public imports and commands must be verified after T07b/T09.

## Package responsibility split

| Responsibility | Candidate owner | Must remain outside |
| --- | --- | --- |
| Canonical ABI/digests, plain types and typed errors | `@kaicreator/domain-harness-contracts` | Runtime decisions, BUILD and Host adapters |
| Loaded Domain Packages, Microkernel Facade and K protocol consumption | `@kaicreator/domain-harness-microkernel` | Compiler, SQLite and Host-native bindings |
| Node CAS, persistent state adapters, Shadow/Meta/Evidence | `@kaicreator/domain-harness-host-node` | BUILD compiler; SQLite is optional |
| Domain Package BUILD, qualification and external producer | `@kaicreator/domain-harness-build` | Tiny runtime dependency |
| K state/admission/journal/effect/replay semantics | Selected K Primary Domain Package | Do not re-implement in Microkernel |

Old `C/v10build`, `v10shadow`, `v10meta`, `v10evidence` temporary shims are pending the **T11** migration/cutover. Source/private `dist/**` imports are NOT the v0.10.2 public contract.

## Ordered migration plan for Domain App authors

1. Split producer/BUILD work from installed runtime. Qualified immutable K/S Package payloads and ABIs are pinned before activation.
2. Use Contracts + Microkernel + selected Domain Packages for Tiny. Rich adds Host via an explicit capability injection; neither Tiny nor Microkernel requires BUILD/compiler or SQLite.
3. Replace private/deep imports only with the public exports **actually emitted after T07b**. Final constructor/function names are deliberately not guessed here.
4. Preserve scoped target identities, message-id retry/conflict semantics and K-owned effect gate. A new Microkernel state authority is NOT part of this version.
5. Qualify observer `subscribe/stop` only after actual asynchronous authorization races, governed Host isolation and projection/redaction tests in T06b/T09.
6. Install from exact local `npm pack` artifacts in an independent consumer; unpublished `0.10.2-rc.0` dependencies require SHA-verified local tarballs in the same install, not an assumed registry version.

## Final evidence still required

- [ ] T11: 46 root importer/source path conversions, old v10 prefix scan and K02 reference-fragment relocation
- [ ] T07b: public export/engines/packlist freeze; no legacy K02 fragment in any tarball
- [ ] T08b: actual README/SDK/ABI/author-guide commands matching shipped JS + `.d.ts`
- [ ] T09: real Tiny external install with forbidden BUILD/SQLite/Host closure proof, Rich external producer/install and governed subscribe/stop
- [ ] T09: typed negative deep import and unsigned/unqualified package refusal
- [ ] R01: exact-SHA Full, Hidden Validation, Critical Journeys and Packaging qualification; PR_PASS != RELEASE_PASS

## Finalization TODOs

T07b must explicitly decide the keep/retire classification of legacy v09 exports and test-only consumers, not infer pre-1.0 compatibility. T08b must add exact package API imports, runnable examples, and product/docs matrix after T07b. T09 must contribute **real external** install receipts; the earlier T07a2/T07a3 regression-fixture passes are not final production pack provenance. This draft must remain unmerged until original T08b Issue #1329 admission after T07b closed.
