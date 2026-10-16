# DomainHarness v0.9 — Product/L1 Freeze Checkpoint (JS/TS Core)

```ini
EVENT=DH09_PRODUCT_FREEZE_CHECKPOINT
VERSION=v0.9
SCOPE=JS_TS_CORE
SOURCE_OF_TRUTH=IMMUTABLE_MERGED_MAIN_81ea9fe6e0f386e786e2f9cdc8c30d703de5f533
SOURCE_TREE=8f6f1c7783ccd6601d6f1247a1585c4d56a5bc87
PRODUCT_R2_CANDIDATE_BLOB=92b8626b2a3c2a0f7983403067dd537a6be1e681
PRODUCT_R2_REVIEW=ISSUE_1026_COMMENT_6169545765_PASS_L1_REVIEW_CONTENT
REVIEW_FINDINGS=P0_0_P1_0_P2_2
REVIEW_SEPARATE_SESSION_CONTENT=YES
DISTINCT_GITHUB_ACCOUNT_APPROVAL=NOT_ATTESTED
PRODUCT_OWNER_AUTHORITY=USER_DELEGATED_CONTINUE_ALL_ISSUES_AND_JS_TS_CORE_DIRECTION
PRODUCT_DECISION=ACCEPT_R2_F01_TO_F10_WITH_TWO_NONBLOCKING_P2_STAGE_ROUTES
PRODUCT_FREEZE_STATE=FROZEN_SCOPE_PENDING_CHECKPOINT_CI_AND_MERGE
L2=NOT_YET_FROZEN
FORMAL_IMPLEMENTATION_DAG=NOT_ADMITTED
V09_SOURCE_IMPLEMENTATION=NOT_AUTHORIZED
V09_RELEASE=HOLD
```

## 1. Product controller disposition and provenance

The user directly decided: DomainHarness Core requires only a **JavaScript execution environment and TypeScript authoring/build contract**, **not** Windows/Linux/WSL2 platform testing, Node 24 or SQLite requirements. The user delegated ongoing GitHub issue/program work to ChatGPT Web. The Product controller accepts Product decisions **F01–F10** exactly as specified in immutable [R2 Freeze Candidate](https://github.com/kaicreator-mm/domain-harness/blob/81ea9fe6e0f386e786e2f9cdc8c30d703de5f533/docs/product/DomainHarness_v0.9_PRODUCT_FREEZE_CANDIDATE_R2.md) after independent substantive content review [#1026@6169545765](https://github.com/kaicreator-mm/domain-harness/issues/1026#issuecomment-6169545765): `PASS_L1_REVIEW`, **P0=0, P1=0, P2=2**. The review's GitHub account independence is **NOT attested**, because the connected writing and independent reading agents posted through the same GitHub identity; this checkpoint neither asserts a second human/credential nor replaces any repository policy requiring a separate approval credential.

**Decision:** `PRODUCT_L1_FREEZE_SCOPE=APPROVED` as a bounded Product controller scope ruling, **effective only when this checkpoint is committed to version source control with CI and actual merge evidence**. It is **not** implementation acceptance, L2 Architecture Freeze, formal DAG or qualified SDK release. If the current ADS mandates distinct-account GitHub `APPROVE` for this Product checkpoint, mark that **specific compliance gate unverified** and request it separately; do not retroactively falsify account independence.

## 2. Frozen, immutable v0.9 Product input — byte-identical to reviewer

| Source | Exact reviewed Git blob SHA |
| --- | --- |
| `docs/product/DomainHarness_v0.9_PRODUCT_FREEZE_CANDIDATE_R2.md` | `92b8626b2a3c2a0f7983403067dd537a6be1e681` |
| `docs/product/DomainHarness_v0.9_PRD_DRAFT.md` | `3f1753d6090769de5e7c48156de24386a224e886` |
| `docs/product/DomainHarness_v0.9_FOUNDATION_PACKAGE_SET.md` | `9dc58386a52307c92f0facd0d12f86d9a63887d0` |
| `docs/product/DomainHarness_v0.9_JS_RUNTIME_CONTRACT_SUCCESSOR.md` | `ef0c785b173a4aa15913f138a3c4cf6ff8be0d08` |
| `docs/product/DomainHarness_v0.9_NODE_PRODUCTION_QUALIFICATION.md` (reference adapter only) | `8081c6f00cca22ae40de0b82c8f0aca434444c6e` |
| `docs/product/DomainHarness_v0.9_L1_FREEZE_READINESS.md` | `7563b3ca199a38183977d6d04e79f401b9a6ec40` |
| `docs/roadmap/DomainHarness_v0.9_SCOPE_INTAKE.md` | `88cc0af8de672dc60cff792137d23e5d8aeaa4eb` |
| `docs/implementation/DomainHarness_v0.9_TASK_DAG_PROPOSAL.md` (**informative**, not admitted Task DAG) | `b1d26f2881602ba5a0dd956854aa1b04b3831ccd` |

The exact reviewed Product content is **not** amended to add a `FROZEN` label. This checkpoint itself is a new controlling *scope/status record*; its later source SHA is separately auditable.

**Controlling normative precedence after scoped Product acceptance:** R2 F01–F10 and the JS Core successor govern v0.9. Historic Node-production PRD/roadmap texts in the exact frozen byte snapshot stay for provenance but are **superseded** where they erroneously demand OS/Node/SQLite as global SDK Core P0.

## 3. Two independent Product-review P2 dispositions — route, don't re-run research

**P2-01 — roadmap old Node/SQLite phrases:** `docs/roadmap/DomainHarness_v0.9_SCOPE_INTAKE.md` sections 0a, 2a, 4 retain historical Node-specific acceptance. Frozen snapshot is immutable. For all L2/Task DAG/Release decisions **only** JS Core successor is current; those legacy phrases must not be copied as normative. A doc-cleanup amendment is optional when it has actual consumer risk, **not a release gate**. Do not edit/repin frozen Product bytes merely for label changes.

**P2-02 — old candidate DAG makes conditional N02 universal:** the historical proposed diagram (lines 30–39) is **not** an admitted DAG. Formal DAG must distinguish:

- **Core P0 path:** #1027 (K/S/selected C contracts and bounded WorkflowRouter) → #1032 (JS/TS SDK + generic BUILD + selected distribution) and #1035 (public JS/TS API), then #1036 (Core lifecycle/ops on selected runtime) → #1037 (independent selected-runtime release). All require Product/L2 authority, bounded file write sets and qualified v0.8 release **before implementing source**.
- **Conditional adapter branch:** #1028 Node Identity/SQLite/physical source convergence **only if** that profile is selected and advertised. Its specific correctness/ops tests feed #1037 only for that profile. Never create N02 prerequisite edges for a Core release using a different selected Capability. No OS matrix as blanket Core requirement.
- **Core release security:** one real selected JavaScript runtime and real selected H/Capability implementations, independent preimport byte approval + protected caller identity, durable CAS/Journal/UNKNOWN where the Apps require it, two true Approval/Engineering business journeys, clean install, Full/Hidden/CJ/source-security review. No unmeasured portability/all-engine/OS claim.

This P2 routing is part of **Product decision**, not the later formal DAG admission; implementation source owners and edge freezing still belong to L2/L3.

## 4. Hard boundaries inherited from v0.8

1. **Only one K** physically selected by BUILD owns Business State, Admission, Effect, Journal and Replay; neither Microkernel nor H adapter shadows K.
2. `DomainHarness.load(package)` has a single public Package input; current v0.8 trust/approval and byte-currentness checks before unauthorized module imports must remain or improve. H's trust-root/currentness and principal cannot be minted by Business Package, an untrusted UX caller or an LLM.
3. v0.8 source currently has `node:crypto` imports plus `Buffer`/`data:` installation; **JS runtime neutrality is not demonstrated** and is an L2 engineering challenge, not permission to disable trust.
4. `WorkflowRouter` stays Standard-owned (#1027 semantics, #1035 public entry); existing v0.8 `interpret('workflow')` is reuse input, **not** proof Router is exported.
5. N01/N06/N07/N08/N09 are Core P0 concerns, N02 a selected conditional adapter. N03/N04/N05 broad ecosystem, QuickJS/polyglot parity, remote/stream and historical migration are OUT without a separate Product review.
6. **v0.8 T-D #1003, architecture #1023, T-G #1006** must complete original functional/security/version release obligations before v0.9 code implementation begins; v0.8's full native tests are **not waived** by v0.9 Core scope.

## 5. Stage transition and evidence truth

| Gate | Authority or measured evidence | Status after this checkpoint |
| --- | --- | --- |
| Product user target | User explicitly selected JS/TS Core and delegated issue execution | `APPROVED_DIRECTION` |
| Product R2 adversarial content review | #1026@6169545765, exact main SHA and 8 SHA pins, P0/P1=0, P2=2 | `PASS_L1_CONTENT` |
| Product scope controller | This checkpoint, when merged/CI passed | `FROZEN_SCOPE` |
| Distinct-account GitHub review (only if ADS requires it) | Not attested, do not invent credential | `NOT_ATTESTED` |
| L2 evidence and formal Architecture Freeze | #1046 is provisional Draft, L2 work needs separate admission/review | `NOT_FROZEN` |
| Formal Task DAG and v0.9 source | v0.8 release baseline/actual L2 and candidate task owners | `NOT_AUTHORIZED` |
| v0.9 Release Qualification | Actual selected JS runtime and C/H cohort, external consumer, Full/Hidden/CJ/security/durability | `NOT_RUN` |

No extra Linux/Windows/WSL2 machine is needed to make **Product/L1 scope** decisions. No claim of all-JS-engine compatibility, release readiness, v0.9 tests, or a completed executable SDK.

`PRODUCT_FREEZE=FROZEN_SCOPE_ONLY_AFTER_CHECKPOINT_MERGE; L2=NOT_FROZEN; V09_CODE=NOT_AUTHORIZED; V09_RELEASE=HOLD.`
