# DomainHarness v0.9 — Product/L1 Freeze Candidate R2 (JS/TS Core)

```ini
STATUS=CANDIDATE_NOT_FROZEN
PARENT=#1026
PREDECESSOR=#1044_SUPERSEDED
USER_DIRECTION=JS_TS_EXECUTION_CORE
OS_MATRIX=NOT_CORE_P0
NODE_SQLITE=REFERENCE_SELECTED_CAPABILITY
L1_INDEPENDENT_REVIEW=PENDING
V09_CODE=NOT_AUTHORIZED
V09_RELEASE=HOLD
```

## Exact proposed source blobs (R2 branch, before merge)

| Product artifact | Git blob SHA |
| --- | --- |
| PRD | `3f1753d6090769de5e7c48156de24386a224e886` |
| Foundation | `9dc58386a52307c92f0facd0d12f86d9a63887d0` |
| Reference Node benchmark | `8081c6f00cca22ae40de0b82c8f0aca434444c6e` |
| L1 readiness | `7563b3ca199a38183977d6d04e79f401b9a6ec40` |
| Roadmap | `88cc0af8de672dc60cff792137d23e5d8aeaa4eb` |
| Proposed DAG (informative) | `b1d26f2881602ba5a0dd956854aa1b04b3831ccd` |
| **Controlling JS Core successor** | `ef0c785b173a4aa15913f138a3c4cf6ff8be0d08` |

Paths are the existing v0.9 product/roadmap/implementation files plus new product JS successor. A revised blob or HEAD requires fresh review; R1 candidate #1044 must **not** be independently frozen as though its old Node/OS assumptions remain authoritative.

## Ten Product decisions proposed for R2 freeze

| ID | Proposed ruling |
| --- | --- |
| F01 | **JS/TS SDK Core**: TypeScript authoring/typecheck → executable JS modules; minimal specified ESM/async/runtime ABI, not universal JS engine compatibility |
| F02 | Core consists of Microkernel + one K and Standard Domain Package, B packages, producer-neutral BUILD and **selected** Capability/Host contracts. Node Identity and SQLite are reference implementations, not universal mandatory dependencies |
| F03 | Single `DomainHarness.load(package)` over independently approved, immutable, prelinked selected package, no second Runtime, dynamic provider discovery or generic Host-owned Journal |
| F04 | Standard has bounded WorkflowRouter semantics (N01 #1027), public API N07 #1035, one K owns WAIT/RESUME/Effect/Journal/UNKNOWN; reuse v0.8 existing code before adding Router |
| F05 | True H/DAC approval/currentness, selected actual byte validation before untrusted import, protected caller, no unauthorized read/effect, agent read-only by default, honest durable ACK/UNKNOWN |
| F06 | No required Windows/Linux/WSL2 platform matrix, Ubuntu/distro, Node version, SQLite/native driver or physical host as **SDK Core** release gates. Tests of an explicitly selected/adopted adapter belong to that adapter |
| F07 | Public typed JS/TS API and real JS executable verification; L2 must address existing v0.8 Node `node:crypto`, `Buffer` and `data:` imports without weakening authentication or preimport security |
| F08 | Versioned, digest-bound independently consumable SDK/K/S/BUILD and chosen Capability artifacts; Node Basic is merely an optional separately qualified profile, never a Domain Runtime Engine |
| F09 | At least one **actual selected JS runtime + chosen Capability implementation** with two real Approval/Engineering Domain App contexts, real required durable Journal/Recovery, security, external consumer, Full/Hidden/CJ, independently qualified exact-version release. Additional OS/JS engines only if advertised; reference Node/SQLite PERF thresholds are not Core global SLOs |
| F10 | Full N03/N04/N05 ecosystem/QuickJS/remote/stream, every optional driver and pre-v1 historical ABI migration are OUT of default Core P0 until independently Product-admitted |

## Mandatory independent adversarial checks

- Core runtime neutrality is **not yet proven**: current v0.8 Core imports Node crypto in contracts/trust and uses Node Buffer and data URL imports. Must L2 specify Host cryptographic and module seams with exact runtime/toolchain truth, preserving H assurance; no fake portability PASS.
- No OS/platform matrix needed for Core; selected Node/SQLite implementation **must** still pass genuine native SQLite/locking/crash/backups if distributed as production supported.
- A selected business app claiming durable effect cannot use only nondurable in-memory receipts and claim release PASS. K remains sole State/Journal/UNKNOWN authority.
- The old v0.8 Windows/Ubuntu Node22/24 tests, Product, security and release requirements remain unchanged in **v0.8**; none transferred.
- The six historical P0 owner issues #1027/#1028/#1032/#1035/#1036/#1037 remain as existing traceability. The L1 reviewer must determine **Core mandatory versus selected adapter conditional work** before formal L2/DAG, not create repetitive research issues.

## Admission and authority

This document is a **proposed Product Freeze R2 candidate**, not a Product Freeze event or implementation authorization. Request a genuinely fresh independent exact-HEAD R2 reviewer terminal with P0/P1/P2 and PASS_L1_REVIEW/NEEDS_REVISION. Only after independent PASS may the Product Controller record a separate exact-head/immutable-document PRODUCT_FREEZE_PASS and enter L2. Any source implementation also waits for accepted v0.8 release plus admitted L2/DAG. Actual Release still requires real selected JS runtime/capabilities/security/Full/Hidden/CJ/consumer evidence.
