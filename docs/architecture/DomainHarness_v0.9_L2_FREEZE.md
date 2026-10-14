# DomainHarness v0.9 — Formal L2 Architecture Freeze (JS/TS Core)

```ini
RECORD=DH09_L2_FREEZE_V1
STATUS=FROZEN_L2_ARCHITECTURE_SUBJECT_ONLY
PRODUCT_SCOPE_FROZEN=PR1048_MAIN_a51a0c57f1c66d602120e6538b4db24072a2e747
ARCH_REVIEW_SUBJECT_PR=#1049
ARCH_REVIEWED_EXACT_HEAD=f5e393e199654d1fddcf6730cece30f9875860fa
ARCH_REVIEWED_BLOB=4b127f22473c231f7fad8bbf8332260d2f4a6918
ARCH_MERGED_MAIN_COMMIT=d88c2bfd37e74dfd99a841f154f272afb24feff3
ARCH_FILE=docs/architecture/DomainHarness_v0.9_L2_ARCHITECTURE_CANDIDATE.md
REVIEW_KIND=INDEPENDENT_R3_DELTA
REVIEW_VERDICT=PASS_L2_CONTENT_R3_DELTA_P0_0_P1_0_NEW_P2_0
REVIEW_PROVENANCE=PR1049_REVIEW_PRR_kwDOUd_jbM8AAAABSS3Lcw
REVIEW_OPERATOR=chatgpt-web:dh09-pr1049-r3-delta-independent-20261015
REVIEW_SESSION=dh09-pr1049-r3-delta-review-context-20261015
DISTINCT_GITHUB_TRANSPORT_ACTOR=NOT_ATTESTED_NOT_REQUIRED_FOR_DISTINCT_CONTEXT
PR_CI=SKIP_ROUTINE_WAIT_PER_USER_NOT_CI_PASS
V08_RELEASE_QUALIFIED=NO_ISSUE_1006_OPEN
V09_TASK_DAG_FROZEN=NO_AT_THIS_CHECKPOINT
V09_SOURCE_IMPLEMENTATION=NOT_AUTHORIZED
V09_RELEASE=HOLD
```

## 1. Freeze authority and exact subject

The controlling v0.9 JS/TS Core Product scope is the merged R2 F01–F10 checkpoint [PR #1048](https://github.com/kaicreator-mm/domain-harness/pull/1048). The **L2 Architecture fact set** is the exact reviewed [PR #1049](https://github.com/kaicreator-mm/domain-harness/pull/1049) HEAD `f5e393e199654d1fddcf6730cece30f9875860fa`, immutable source blob `4b127f22473c231f7fad8bbf8332260d2f4a6918`, integrated by squash merge `d88c2bfd37e74dfd99a841f154f272afb24feff3`. This record **freezes the reviewed source and selected architecture decisions, not the file's historical Draft label**. The source's **§11 D01–D06 R3 decisions have precedence** over historical R0/R1/R2 exploration wherever text conflicts. The old combined `verifyCurrentApprovalAndInstall(root)` SPI and raw-root/object alternative are **rejected**, not implementation choices.

Two independent R1 adversarial reviews of previous HEAD `d5ebd952...` returned material P1s ([#6173661908](https://github.com/kaicreator-mm/domain-harness/pull/1049#issuecomment-6173661908), [#6173675083](https://github.com/kaicreator-mm/domain-harness/pull/1049#issuecomment-6173675083)). An actual separate ChatGPT-Web reviewer session then read the final exact R3 delta and submitted the [PASS_L2_CONTENT_R3_DELTA](https://github.com/kaicreator-mm/domain-harness/pull/1049) GitHub **COMMENTED** Review for HEAD `f5e393e...`; P0=0, P1=0, new P2=0. The reviewer `operator_id/session_ref` is distinct from the author context; a different GitHub transport account/APPROVE event is **not** claimed or silently required by pinned ADS `standards/CHATGPT_WEB_ROLE.md`.

## 2. Frozen architecture decisions

1. **K/S/C and Business ownership:** one physically selected Kernel Domain Package owns State, Admission, Effect, Journal, Replay and truthful UNKNOWN. Standard Basic owns pure Rule/Decision/Workflow/WorkflowRouter/Operation interpretation (deterministic selected/missing/ambiguous/denied discriminator); selected Capability owns physically bounded Operation/Handler ports. Business supplies policy. The Microkernel only loads/binds/hooks/provides scoped façade. No second Host business Journal/Runtime or `host-node` aggregate Domain Package. `domain-forge` owns business Domain Package generation; generic BUILD may seal/qualify artifact closure.
2. **JS/TS execution envelope:** TS-authored SDK Core compiles to selected JS ES2022/ESM/async compatible contract; **not** a universal OS, Node24, SQLite or QuickJS requirement. The **first actual release/validation cohort is explicitly Node.js 24.x ESM + protected Host + true-CAS SQLite physical support**, so N02 #1028 is **selected and required for that cohort only**. Another JS cohort needs a separately qualified real H/C store+runtime.
3. **Import closure:** BUILD bundles dependencies into one self-contained ESM per selected Package. Package ESM builtin/import allowlist **EMPTY** for the first cohort; no static/dynamic import, export-from, import.meta, CommonJS require, code-string eval. A pinned full AST parser validates at BUILD **and independently again in protected H** on exact SHA-confirmed immutable bytes **before module evaluation**. First selected Node24 host invokes only those verified `data:` ESM bytes with fresh activation cache identity. Approved Package code is trusted; no claim of malicious same-realm JS sandboxing or evaluation rollback. Any unverified module, parser failure or changed dependency bytes must fail closed; real negative tests are mandatory at #1032/#1037.
4. **Trusted deployment vs execution:** privileged governance-only inert `install(sealedRoot, approval, audience)` stores an immutable selected artifact. Public `DomainHarness.load(package)` accepts **one** Host-issued opaque installed-reference **string only**; no direct raw qualified Root/object `load`, no caller verifier/Host Port, and no v0.8 transition-path bypass on `./v9`. Protected H validates reference/audience/app/subject/issuer/ABI, durable bytes and current approval/issuer status at activation.
5. **Currentness and H→K scope:** H protected approval/revocation and per-op principal/tenant/app/scope/epoch/expiry authority precede every sensitive public action; `stop` is authenticated; sensitive subscription delivery rechecks rights; every effect dispatch requires an H-issued one-shot permit rechecking **both** caller and Package currentness. Revocation and permits have one protected CAS ordering; already-started physical I/O is not retroactively rolled back. K alone interprets admission/receipts/Journal/UNKNOWN. H protected registry logical owner #1032; selected physical CAS Node/SQLite owner #1028.
6. **Wire and public ABI:** version-separated `dh.v9.qualified-root.subject/1` digest over normalized strict plain-data canonical JSON UTF-8 sorted keys, module digests, bundled import policy revision, binding/handler map and Host/runtime ABI. Architecture §11 D04 includes two exact SHA256 encoding test vectors, independently checked at the reviewer; not complete signed three-role Package qualification. Stable caller-visible `PACKAGE_NOT_AUTHORIZED` fail family obscures forged/foreign/revoked details while protected diagnostics preserve typed subcodes. `#1027` owns Standard Router and K contract; `#1035` owns single public API/error names.

## 3. High-impact UNKNOWN and evidence disposition

| Question / gap | Disposition before L2 Freeze | Remaining executable gate |
| --- | --- | --- |
| Real ESM loader graph/authority boundary | **DECIDED:** self-contained zero-import per-Package, protected H exact AST preflight, selected Node24 `data:` evaluation and cache segregation | #1032+#1037 native Node24 positive/negative proof; failing selected loader blocks **implementation acceptance/release**, and material contradiction reopens L2 |
| Protected install, approval revocation, CAS races | **DECIDED:** private Host governance install and installed-string-only public load; CAS-ordered activation/revocation/permit | #1032+#1028+#1036+#1037 real physical Host tests; missing true-CAS fails closed |
| Protected H→K caller/effect/stream authority | **DECIDED:** nonforgeable private token, per-effect one-shot permit and per-sensitive-delivery revocation | #1027+#1032+#1036+#1037 adversarial tests; no synthetic PASS |
| Digest/Router errors | **DECIDED:** versioned strict canonical subject vectors, pure Standard candidate union; explicit single public error owner | #1027+#1032+#1035 contract tests/independent clean-package consumer |
| Portability claim | **BOUNDED:** first real Node24 ESM+SQLite cohort; general Core has no universal OS/Node/SQLite deployment contract | only explicitly shipped profile gets real release qualification; alternative Host cannot self-attest |
| v0.8 source inheritance | **BLOCKED FOR SOURCE IMPLEMENTATION:** v0.8 latest selected branch assets are research/reuse candidates, #1006 release not passed | exact qualified v0.8 tag/Release PASS and source/ABI re-pin required before **v0.9 source implementation** |

The architecture **does not claim executable evidence for untested Node24/SQLite selected Host behavior**. No additional demonstration wave is required merely to recapitulate already selected facts; implementation Tasks must produce true selected runtime/security tests. If a material executable contradiction emerges, explicitly reopen the affected L2 fact rather than silently changing authority.

## 4. Scope of this checkpoint and next actions

- **This file is the single normative L2 Freeze decision record** as soon as its PR is merged; the reviewed one-file architecture source remains byte-for-byte intact on main. Draft-status text inside that original candidate is historical and superseded by this checkpoint for **L2** only.
- The already merged [PR #1050](https://github.com/kaicreator-mm/domain-harness/pull/1050) `docs/implementation/DomainHarness_v0.9_TASK_DAG_DRAFT_R1.md` remains **informative / unadmitted**. Separate formal Task DAG freeze and canonical GitHub native Issue Dependencies/ready-state check are required, with only six existing owners and #1028 selected first-cohort specificity. This L2 Freeze does **not** authorize v0.9 implementation.
- No pre-v1.0 old API/ABI migration or universal Windows/Linux/WSL2 test matrix. N03/N04/N05 optional unless explicitly admitted by future Product.
- User direction skips *routine PR CI waiting*; this is **not** a green CI check, not permission to bypass mandatory branch rules and **not** a waiver for real security/Full/Hidden/Critical Journeys/clean external consumer/packaging/final release qualification.
- v0.8 #1006 still OPEN at this checkpoint: PR PASS is not Release PASS; v0.9 Source implementation remains `HOLD` until actual qualified v0.8 baseline plus later admitted Task DAG.

```ini
FREEZE_DECISION=ACCEPT_EXACT_REVIEWED_R3_L2_ARCHITECTURE
FREEZE_CONDITION=THIS_EXACT_RECORD_MERGED_TO_MAIN
SOURCE_IMPL_AUTHORIZATION=NO
FORMAL_DAG_ADMISSION=SEPARATE_FOLLOW_ON
RELEASE_QUALIFICATION=NOT_RUN
```
