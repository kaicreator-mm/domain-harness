# DomainHarness v0.9 — Product/L1 Freeze Candidate and Decision Register

```ini
DOCUMENT_STATUS=CANDIDATE_AWAITING_FRESH_INDEPENDENT_L1_REVIEW
VERSION=v0.9
PARENT_ISSUE=#1026
BASE_MAIN=47d929b57ff187dfc0747622d92041abd921ef65
USER_PRODUCT_DIRECTION=PRODUCTION_READY_NODE_SDK_PLATFORM_NEUTRAL
PRODUCT_FREEZE=NO
L2_FORMAL_FREEZE=NO
FORMAL_TASK_DAG=NO
V09_IMPLEMENTATION=NOT_AUTHORIZED
V09_RELEASE_QUALIFICATION=NOT_RUN
V08_RELEASE_PASS=NOT_ATTESTED
```

## 1. Normative candidate snapshot to approve or reject (no author self-freeze)

This **single candidate** locks a finite set of Product choices already discussed and reviewed in #1033/#1041 and corrected by user-directed #1043. It is a **proposal** until a fresh exact-SHA independent Product/L1 reviewer resolves all P0/P1, records its review provenance and the Product controller explicitly posts `PRODUCT_FREEZE_PASS` with this candidate's exact immutable reviewed SHA/tree/document blob set. **Merging this docs PR does not itself freeze Product/L1.**

### Proposed adopted document snapshot — exact bytes on main

| Artifact / role | Main Git blob SHA (freeze subject, not yet approved) |
| --- | --- |
| `docs/product/DomainHarness_v0.9_PRD_DRAFT.md` — PR-01..09, supported target, omissions | `d0694a9e0a9041296d12e7e89831b2b44a03e11f` |
| `docs/product/DomainHarness_v0.9_FOUNDATION_PACKAGE_SET.md` — K/S/C/BUILD, WorkflowRouter ownership | `05f32eace99e3dc47ea21573e291bd9374c3c4fc` |
| `docs/product/DomainHarness_v0.9_NODE_PRODUCTION_QUALIFICATION.md` — target-profile publication + PERF-01..07 | `7352aa811cdf71469ed7b4f2114541de5e7eb8ba` |
| `docs/product/DomainHarness_v0.9_L1_FREEZE_READINESS.md` — evidence vs phase ownership | `36d370c11c31983843daff5cb7bace549ef60529` |
| `docs/roadmap/DomainHarness_v0.9_SCOPE_INTAKE.md` — scope and deferrals | `312d5c7daa51eca2ef5490f61b30fce42ecbbcdb` |
| `docs/implementation/DomainHarness_v0.9_TASK_DAG_PROPOSAL.md` — **informative only**, NOT formally admitted DAG | `0dee23ed6b7a44c852b44cc25dd380f7c4cb5875` |

**Precedence:** upon eventual Freeze, this candidate's Product decisions + exact referenced PRD/qualification/Package documents govern v0.9 Product/L1. The roadmap and candidate DAG are supporting plans only; neither overrides Product nor establishes implementation authority. Earlier draft-text claims of `Ubuntu24 native/bare-metal MUST`, or that v0.8 release/measurement must precede **v0.9 L1 Freeze**, are superseded by the user-directed platform-neutral correction in #1043. The same-direction user decisions of v0.8 are **not** changed.

## 2. Product P0 decisions proposed for Freeze

| Decision | Proposed final L1 ruling | Accountability |
| --- | --- | --- |
| **F01 Outcome** | A production-qualifiable independently consumed **DomainHarness Node SDK**, not a technology-only ABI/Demo and not a generic agent or domain-forge app-generation backend | #1026 / PRD |
| **F02 Foundation** | Public SDK Microkernel + one physically selected **Kernel Basic** (State/Admission/Effect/Journal/UNKNOWN/Replay authority), one **Standard Basic** (Schema/Rule/Decision/Workflow/Operation semantics), Capability-owned Node **Identity** and **SQLite Storage**, producer-neutral BUILD toolchain, version/digest/target-locked **Node Basic Profile** | N01 #1027, N02 #1028, N06 #1032 |
| **F03 Runtime separation** | `DomainHarness.load(package)` consumes an independently authorized, build-prelinked, immutable installed executable App subject; **not** `load(compiledApp)`; Node Basic is **profile metadata only**, not a second Runtime Domain Package/Host Policy Engine; no separate `host-node` catchall Package | N01/N06, L2 concrete ABI |
| **F04 Workflow** | Workflow/WorkflowRouter remain inside **Standard Basic**. N01 owns bounded Standard workflow routing contract and selected semantics, N07 owns public facade; K alone executes WAIT/RESUME/State/Effect/Journal. Existing v0.8 `interpret('workflow')` reused before any new router code; no duplicate engine | #1027 / #1035 |
| **F05 Safety** | Closed-world BUILD exact Handler pins; external governance/DAC authorization of actual bytes on **every activation/restart before untrusted import**; H-provisioned non-shadowable caller Identity; per-app/tenant admission and read/subscribe revocation; no user-supplied executable Provider selection; Agent/LLM tools **read-only by default**; durable CAS/UNKNOWN/no false ACK | #1028 / #1037, v0.8 inherited frozen invariants |
| **F06 Platform** | Baseline Node **24.x** + pinned ABI-compatible native SQLite; **Windows and Linux** are *intended platform families*; WSL2/VM/container may be qualified under their exact stated target assumptions. **No Ubuntu distro, physical/bare-metal machine, mandatory other Linux host or pre-L1 benchmark requirement.** Publish ONLY individually tested exact-OS/Node/SQLite/filesystem/deployment profiles. Need >=1 genuinely deployable **profile-qualified** production target for v0.9 Release, never advertise both Windows+Linux as supported unless both separately proven | #1028 / #1036 / #1037 |
| **F07 Ops/metrics** | Documented public API/errors, clean consumer, scoped lifecycle, observability, diagnostics, backup/restore and security operations; proposed PERF-01–07 goals startup/eligible throughput/p95-p99/memory/faults, with **eligible_success >=18000 over >=1800s**, 99.9% eligible fault-free success and absolute no-false-ACK/no-unauthorized-effects | #1035 / #1036 / #1037 |
| **F08 Distribution** | Independently versioned/hashed/identifiable K/S/selected Capability Domain Packages and official SDK/BUILD artifacts; one clean external app consumer without private deep imports; independent package identities mandatory, **one npm package per Domain Package optional** if installable individually from immutable archives | #1032 / #1035 |
| **F09 True Release** | At least two actual v0.8-derived distinct Approval/Engineering Business contexts reused as functional and fault oracles, plus a clean independent v0.9 consumer; actual shipped-v0.9 artifact full/hidden/CJ/security/supply-chain/native fault/PERF and independent version qualification; PR CI alone never Release PASS | #1037 |
| **F10 Scope OUT** | No v0.1–v0.8 asset/API/Journal migration or old in-flight replay; no generalized QuickJS/nonNode cross-language SDK, remote/streaming, complete Forge/Creator UX generation ecosystem or all possible Capability families in v0.9 P0 unless separately Product-admitted | N03 #1029/N04 #1030/N05 #1031 and broad N01/N02 deferred |

**Do not overpromise:** Product freezes the **intended families and falsifiable acceptance conditions**, not passing runtime measurements, default "all Windows + Linux" compatibility, inferred WSL2 Server equivalence or actually selected native driver build hashes. Those evidence receipts are **later Release gates**. The names of candidate Package IDs, version metadata and error enums are **L2 decisions**, not invented current public ABI.

## 3. What this milestone admits versus what it does not

| Phase | Post-fresh-L1-review decision | Status now |
| --- | --- | --- |
| **Product/L1 Freeze** | May PASS only after independent exact-SHA review and controller decision; *does not* need v0.8 Release PASS, second Ubuntu Host, physical bare metal or pre-run PERF | **CANDIDATE** |
| **L2 Architecture Evidence** | After Product/L1 PASS, may source-map **provisionally** to current v0.8 source with exact SHAs; freeze Package ABI, ownership, H/BUILD trust/immutable artifact and external consumer contract only after independent L2 review | **NOT ADMITTED** |
| **Implementation Task DAG/L3** | After L2 PASS, formally admit **six existing P0 owner issues**: N01 #1027, N02 #1028, N06 #1032, N07 #1035, N08 #1036, N09 #1037; split oversized source work JIT only, not one research subissue per question | **PROPOSAL ONLY** |
| **v0.9 source work / qualified baseline adoption** | Requires v0.8 #1003/#1023/#1006 original frozen Release PASS/tag, plus v0.9 formal Product/L2/DAG authorization; v0.8 dual App functional retention not deferred to v0.9 | **NOT AUTHORIZED** |
| **v0.9 Release qualification** | Exact installed v0.9 artifact + real supported profile conformance + Full/Hidden/CJ/security/PERF/independent Review/Tag. Environment-specific negative results correctly reported; at least one supported profile necessary | **HOLD / NO TEST PASS** |

Versioned obligations outside the scope of v0.9 must remain with their original v0.8 owner. Separate PR source CI, user product approval, documentation review and Release Qualification must not be conflated.

## 4. Known unresolved items, owners, and no-fake-pass boundary

- **Product/P0/P1 at proposed scope:** none asserted by this author; independent reviewer must independently falsify F01–F10 at the exact candidate Head/Docs bytes. A major discrepancy is `NEEDS_REVISION`, not an author waived exception.
- **Reviewer independence:** original #1033 content review and #1043 comment were substantive but used the repository author's GitHub account. A separate authorized independent session/operator should perform the Freeze review; do not issue an `APPROVE` in the author's identity to counterfeit independence. If only a same-account context exists, record content review and `FORMAL_INDEPENDENCE_NOT_ATTESTED` instead of `PRODUCT_FREEZE_PASS`.
- **Physical environment:** FZ-01 actual WSL2 preflight and FZ-01N non-availability are historically truthful, but **not blocking Product/L1**. At release a claimed WSL2 profile still needs proper VHD durability/process/service restart/fault tests; Windows and Linux have independent claims.
- **Performance:** PERF-01–07 numerical acceptance are Product targets only, no benchmark evidence or native-result assumptions. If a target truly fails, change via explicit narrow Product decision, never quietly change threshold to mark PASS.
- **v0.8 dependency:** `v0.8@3c79a4bf1cd761c61c91079e7b0b5fb2e2914ae2` is a source-mapping snapshot, **not** a qualified release tag. #1023 S05 and S01, #1003, #1006 remain live and cannot be moved to this version.
- **No new implementation tasks** while source authors active on v0.8. No repetitive demonstration/research/stale review round trips.

## 5. Exact-HEAD Product Freeze terminal template (for independent reviewer + Product Controller)

```ini
EVENT=DH09_PRODUCT_L1_FREEZE_REVIEW_R1
REPO=kaicreator-mm/domain-harness
SUBJECT_PR=<actual PR number>
SUBJECT_HEAD=<immutable exact PR head SHA>
SUBJECT_TREE=<exact PR head tree>
PRODUCT_SNAPSHOT_MAIN=47d929b57ff187dfc0747622d92041abd921ef65
PRD_BLOB=d0694a9e0a9041296d12e7e89831b2b44a03e11f
NODE_QUALIFICATION_BLOB=7352aa811cdf71469ed7b4f2114541de5e7eb8ba
FOUNDATION_BLOB=05f32eace99e3dc47ea21573e291bd9374c3c4fc
REVIEWER_NOT_AUTHOR=<attest true/false>
P0=<count>
P1=<count>
P2=<count>
VERDICT=<PASS_L1_REVIEW|NEEDS_REVISION>
PRODUCT_FREEZE_PASS=<explicit separate controller decision or NO>
L2_AUTHORIZED=<explicit decision or NO>
IMPLEMENTATION=NO
NATIVE_PERF=NOT_RUN
V09_RELEASE=HOLD
```

**Candidate disposition:** `PRODUCT_SCOPE_READY_FOR_INDEPENDENT_L1_REVIEW`; `PRODUCT_FREEZE=NO` until exact-head independently reviewed controller closure.
