# DomainHarness v0.8 — L2 Architecture Evidence / Research Adoption

> **STATUS: STAGE-2 ARCHITECTURE DRAFT — NOT L2 FROZEN, NOT IMPLEMENTATION TASK DAG.**
> Owner: [#999](https://github.com/kaicreator-mm/domain-harness/issues/999). Exact Product Freeze [#953@6106639644](https://github.com/kaicreator-mm/domain-harness/issues/953#issuecomment-6106639644) at `v0.8@c24243539de391554f30ecfbf043e92e5b73de2f` tree `dddf6fbcb6ff4bbe2707552a5cae18b855844b8e`. PRD blob `18aac91c86fdc63a27ffb0d1e8c0e43859d8e068`; L1 blob `c71d48925641ae1d6848dea7791efbe248febb37`. User's four approved Product decisions [#949@6106607603](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6106607603). Pinned ADS `1edaee9291e25b6dd99303493bed75132cb54881`.
>
> Main reference: [#997 research reuse index](https://github.com/kaicreator-mm/domain-harness/pull/997) `c38d65a7b63f2c23772e23169ae4098125d1f3bd`, 15 groups R00–R14. **Primary code+tests:** [#994 KPK-01](https://github.com/kaicreator-mm/domain-harness/pull/994) `b9ea4d1f42246c61d5382328788c50741cac8e43`, source-experiment tree `f08ea04fe45d668d9475ca9288b257502a306958`. This L2 selectively ADOPTS its proven concepts and implementation candidates; it does **not** certify all 76 research-PR files as mergeable production code.

## 1. Architecture drivers and hard invariants

| ID | Driver / required observable property | Product/test authority |
| --- | --- | --- |
| D01 | Embedded DomainHarness SDK = minimal trusted Microkernel + selected executable Kernel Domain Package + Standard SDK Package(s) + Business Domain Package(s), one coherent Assembly | Frozen Product #991; #993 KPK01/02/08 |
| D02 | `DomainHarness.load(package)` consumes a **system-produced, selected, sealed Domain Package root**; no raw `compiledApp` or runtime builder/Forge/Simulator inside SDK | #994 KPK03/10/13 |
| D03 | BUILD/Host qualified Identity, Compatibility, Binding are **fixed before installation**; K owns dynamic business State/Guard/Admission/Transition/Effects/UNKNOWN/Journal/Replay and consistency | #949 four approvals; #994 KPK01/14/15; #978, #963 |
| D04 | Host owns **generic** physical primitives (storage, clock, crypto, resource dispatcher, principal attestation and process operations) but never duplicates Domain State/Effect policy | #994 ownership map; #988 old-host comparator is an oracle, not an authority model |
| D05 | Business policy/data and all authoritative mutation semantics are tied to selected package bytes, immutable snapshots and bounded current-version identity | #994 KPK03/09/10; #956 graph safety |
| D06 | Strict H-authenticated caller → K-authorized read/write scope; no raw journal/instance/Kernel Runtime/observe bypass; legitimate authorized observer remains functional | Frozen PF-02; #949 C097/C098 negatives |
| D07 | Effect input and business idempotency key are resolved per occurrence **after authorized admission and before journal begin/effect**, no code-eval or caller-selected resource port | #972 Candidate A; #994 KPK15 |
| D08 | All useful previously delivered features from v0.1–v0.7 preserved with new ABI and full positive/negative functional coverage, while historical API/ABI/serialization and cross-version replay are not required | #942@6093650132; frozen 34 FR/HF + 6 NEW-FUNCTION + FR08 split |
| D09 | Optional typed observation failure is not a mandatory multi-record atomic receipt; qualified Node durability and K Journal/UNKNOWN recovery not removed; no false durable ACK | Frozen NF06 |
| D10 | Execution tests must cover Approval App and **genuine Engineering self-dogfood Domain Harness App** on same K/S, real Host, typed UX, clean consumer, fault/Hidden/release checks | #972, #973, frozen D2/D3 acceptance |

### Boundaries (component roles, authoritative direction)

```text
domain-ai-creator / domain-forge / domain-simulator / domain-ux (external)
                  ┆     validated, produced & approved Package root
                  v
 BUILD qualification & Host installation (trusted identities / exact sealed bytes / bindings)
                  |
     +------------v-----------------------------+
     | Minimal Microkernel (SDK)                |
     | load(package) / module verification      |
     | fixed closure wiring / lifecycle /       |
     | scoped intent+query+typed event facade   |
     | NO Guard/State/Effect/Journal authority  |
     +------------+-----------------------------+
                  | selected immutable Kernel endpoint
      +-----------v-----------------------------------------+
      | Selected Kernel Domain Package (single authority)    |
      | State + Guard + Hard Invariant + Admission/Transition |
      | Journal/Replay/UNKNOWN + Effect+idempotency/Recovery  |
      | verifies H principal + Business reader policy        |
      +------+-----------------+-----------------------------+
             |                 |
       Standard SDK      Business Package(s)
      Rule/Decision/      Workflow/Operation/Effect policy,
      Kind/Operation      roles/guards, approved bindings/data
             \                 /
              +-------+--------+
                      | generic physical-only Host ports
                 Node Host adapters, storage/crypto/clock/resource calls
```

**No "Host wraps old v0.7 DomainRuntime" production path.** #985/#988 native old-host bridge remains a regression oracle only. No second Runtime, Journal, Effect policy, business rule engine inside Microkernel/Host, and no implicit authority in raw manifests. Standard Kind contracts share one Component/Kind/Operation family rather than growing one adapter per Demo.

## 2. Adopted technical directions and contract boundaries (decisions, not code PASS)

| Architecture ID | Chosen direction / counterfactual | Status and production falsifier |
| --- | --- | --- |
| A01 Product root and closure | Trust an approved **produced** root pinning Kernel, Standard and Business immutable module bytes+ABI+Kind/Operation/Handler targets. Verify digests and Host-qualified origin before executable import. No late provider discovery or unqualified manifest fallback. | **ADOPT_BOUNDED** #994 `src/producer/build-package.mjs`, `src/microkernel/contracts.mjs`, `load.mjs`; KPK03/10/12. Extend #978 G22–26 and #963 attested handler negs before final L2 ABI Freeze. |
| A02 Loader/runtime owner | Microkernel is a loader+transport; selected Kernel's **own sealed executable code** implements authoritative admission/persistence/effect. | **ADOPT_BOUNDED** #994 Kernel `kernel-mechanism-v1.mjs` and `MIGRATION_MAP.json`; KPK01/02/04/14. Refuse Host-side v0.7 engine fallback, refuse Kernel selected by manifest only without exact execution identity. |
| A03 Component identity / safe canonical records | One explicit namespaced Package/Component/Kind/Operation schema, injective graph identity; JSON-compatible own enumerable data records, no dangerous getters/descriptors/ambiguous duplicate declaration. | **ADOPT_R3_NOT_R1** #956 `16037896...` `r3-adversarial.test.mjs`, `candidate-validator.mjs`; #948 r1 only predecessor known-gap witness. Adopt failing vectors before implementation. |
| A04 Handler / Kind provenance | Build-time selected signed or Host-approved exact module exports, static allowed imports and must-understand Kind+semantic obligations; fixed at install. | **ADOPT_BOUNDED** #963 `bridge/attested-binding.mjs`, B1 negatives; #978 Genesis trust roots and closure tests; #994 KPK03/10. Native production validator still requires independent security review. |
| A05 Deterministic decision and Effect | Business declarative rules & `inputFrom`/business idempotency template; Kernel validates once/pins snapshot at wiring, resolves authorized per-request values after Guard before Journal+Effect. Unknown and replay remain fail-closed with exact per-occurrence journal/effect key. | **ADAPT_REAL_SOURCE** #994 `kernel-mechanism-v1.mjs` KPK15 and business-approval/inventory fixtures; #972 scratch feasibility evidence only. No `eval`, no arbitrary Host resource from caller, no post-admission policy mutation. |
| A06 Host principal & readback | **Choose** a Host-minted, Host-verified opaque principal identity/attestation attached to every runtime request and scope bound to tenant/app/instance/operation. Kernel validates attested principal and Business reader/workflow before returning immutable completed receipt or typed pending/unavailable. Untrusted UX `caller.role` has zero authority. Raw Kernel/Journals are internal; public query/observe/subscription only scoped typed surface. | **MATERIAL ABI DESIGN TO REVIEW** (Product direction FROZEN). #994 public `runtime.kernelRuntime` and unrestricted `query('journal')` unacceptable as production. Consume #949 PF02 RB P/N falsifiers, preserve `#994/src/ux/ux-client.mjs` only after auth redesign. Untrusted ambient same-realm JavaScript does NOT become sandboxed by this contract. |
| A07 ModelPort accounting and prior FR08 | Split declaration-level rule/caching zero-call semantics from actual operational ModelPort call evidence. Host-instrumented invocation or same-request bound verified Journal; otherwise explicit unmeasured/unsupported. | **MATERIAL ABI DESIGN TO REVIEW**. #994 standard SDK `freshModelCallCount:1` on model-free path is **REJECT/REPLACE**, not an adopted feature. Frozen four FR08 P/N-SD slots, old resolver oracle, no invented precision. |
| A08 Durable Host trust boundary | Trust authenticated Host installation/adapters and controlled Host storage writer; per-record journal+CAS can claim only its tested consistency. Do NOT claim resistance to privileged malicious Host-store writer until MAC/isolated journal trust is an explicit additional accepted requirement. No cross-document atomicity implied. Existing useful durable observation/UNKNOWN/recovery, typed optional append failure mandatory. | **THREAT-BOUNDARY CHOICE; SECURITY REVIEW REQUIRED**. #994 KPK07/11 and `OWNERSHIP_MAP.md` hostile-store forged-completed negative. New mandatory cross-record K/H receipt OUT, unsupported mandatory requests typed-rejected pre-effect. Process restart, real SQLite/file Host, concurrent-open and permission checks required later. |
| A09 Current-version identity | New qualified selected Kernel bytes/closure cannot replace active pinned mechanism silently. No cross-version/multi-release forward replay or old wire compatibility mandate. | **ADOPT_BOUNDED** KPK09; different Kernel selected changes identity and current-version admission typed; v0.7 historical oracle tests only functional semantics. |
| A10 Host execution portability | First v0.8 production consumer is clean Node.js TypeScript SDK + Node Host with physical persistence. Windows real Build Host/Node22+24 and clean packaged consumer. Generic Microkernel remains portable, other Hosts do not gain unsupported claims. | **ADOPT_SCOPE** #994 KPK13, #996 staged pack consumers. #953 T016 racing dist write and N17 SQLite contention retained as infra risks; not Product scope regression. |
| A11 External composition | domain-ai-creator coordinates generation/entry; domain-forge normally produces Domain Package; DomainHarness first Genesis package may be manually authored but same approved produced-package format; domain-ux renders UX, contract via DAC. | **ADOPT_PRODUCT_BOUNDARY**, not a claim current siblings already generate/activate a production bundle. No cross-repo source edits from this L2. |
| A12 App value and validation | One K/S (same sealed bytes) drives Approval and Engineering Dogfood Apps; Inventory/Parts are negative/dynamic-value fixtures. | **ADOPT_ACCEPTANCE**, #972 A/B bounded and #994 3 Business packages reused, #973 real Engineering App **NOT_RUN** until authorized formal implementation. |

## 3. File-level adoption inventory — use source, not another Demo

**Each research reference is exact-SHA and isolated; production changes must be made in future Task PRs after L2 Freeze, with proper functional and security review.**

| Production concern | Candidate files/test vectors at research SHA | Source decision |
| --- | --- | --- |
| Package contract / minimal load | #994 `src/microkernel/contracts.mjs`, `src/microkernel/load.mjs`; `tests/kpk01/02/03/10/12-*.test.mjs` | **ADAPT** into SDK package contract+loader; remove dangerous public `kernelRuntime` and unscoped query/observe |
| K owned Runtime / migration | #994 `src/producer/payload/kernel-mechanism-v1.mjs`, `OWNERSHIP_MAP.md`, `MIGRATION_MAP.json`, `tests/kpk04/05/06/07/09/14-*.test.mjs` | **REUSE/ADAPT** actual migrated State/Guard/Admission/Journal/UNKNOWN code; do not rebuild from scratch without measured blocker |
| Dynamic Effect / business fixtures | #994 `tests/kpk15-dynamic-effect-binding.test.mjs`, business-approval/inventory/parts payloads; #972 canonical 2-App terminal @6098188937 | **REUSE/ADAPT** sealed KPK15 source + positive, forged, over-limit, stale, injection, replay, ambiguous/fault cases. #972 scratch source **NOT COPYABLE**, evidence only |
| Package producer + selected trust | #994 `src/producer/build-package.mjs`, #978 `experiments/v08-genesis-seed-d1/host/{bootstrap,trust-roots}.mjs`, #963 attested binding | **ADAPT** build/Host trust; use producer-generated first-version package when actual Forge not ready; no runtime compile in Microkernel |
| Unified component + Graph safety | #944 `experiments/v08-unified-component-ab/unified.mjs`; #948 r1 schemas as known-gap; **#956 R3** `experiments/v08-spec-conformance-942-r2/{candidate-validator.mjs,tests/r3-adversarial.test.mjs}` | **ADAPT #956** not #948 pre-repair r1; graft R3 negatives, never green known-gap passes as conformance |
| SDK Rule/Operation | #994 `src/producer/payload/sdk-standard.mjs`, `kpk08`; historical `packages/domain-harness/src/decision-resolver/resolver.ts` `version/v0.7@86110c61` | **ADAPT** deterministic rule behavior but **REJECT** hardcoded `source:'harness-machine'/freshModelCallCount:1` as actual ModelPort evidence; preserve FR08 and remaining functional categories |
| Host storage & faults | #994 `src/host/file-host.mjs`, `memory-host.mjs`, KPK06/07/11; #996 merged staged CI | **REUSE/ADAPT** generic primitives, remove fixture-specific shortcuts from actual Host; test multiple processes and real storage |
| UX intent/typed event transport | #994 `src/ux/ux-client.mjs`, KPK11/13; #949 PF02 scratch | **ADAPT** to H-attested+K-authorized query/event scope; never transfer raw `runtime.kernelRuntime` |
| Historical authority oracle | Original `version/v0.7@86110c61` admission.ts, predicate.ts, effect-journal.ts, workflow-instance-engine.ts, resolver.ts; #988 R4 old-host bridge | **TEST_ORACLE** only; old Host-v0.7 runtime code **REJECT as second v0.8 execution authority** |
| Version test infrastructure | #996 already merged on main, #953 T016 local claimed fix | **ALREADY_IN_BASE** use immutable staging; do not duplicate builder/research. |
| Research-only Product R1/R2/R3 drafts | #957/#967/#976 and superseded #940/#945 K0 toy | **REJECT AS CANONICAL CONTRACT/CODE**, retain unique negative/smoke provenance only |

## 4. ABI / ownership boundaries for formal L2 Review

```ts
// Conceptual interfaces — L2 contract candidates only. NOT authoritative compiled TypeScript.
type ProducedDomainPackageRoot = {
  buildIdentity: string;      // Host/BUILD-approved, not caller-asserted
  selectedKernel: ExactSealedModuleRef;
  selectedSdk: ExactSealedModuleRef;
  selectedBusiness: readonly ExactSealedModuleRef[];
  bindings: readonly PrequalifiedBinding[];
};

interface DomainHarnessFacade {
  send(intent: ScopedAuthenticatedIntent): Promise<AdmittedOrDenied>;
  query(request: ScopedAuthenticatedRead): Promise<CompletedOrUnavailable>;
  subscribe(request: ScopedAuthenticatedSubscription, onEvent: (event: ScopedTypedEvent) => void): Unsubscribe;
  stop(): Promise<void>;
}
// load(package) remains the public installation entry; caller can't supply a raw
// principal role, unapproved module or handler implementation to mutate authority.
const runtime = await DomainHarness.load(packageRoot, trustedHostPorts);
// Runtime public facade exposes NO kernelRuntime or raw Journal/instance dump.
```

The L2 review must confirm: (i) the Host trust is enforced independently of arbitrary caller-controlled JSON, including the write route; (ii) Kernel owns **both** auth decision and State/Effect mutation; (iii) typed unavailable/read-only receipt does not replay an effect; (iv) Host operator approval and code integrity are different trust facts; (v) threat claims exclude untrusted JS module ambient effects and hostile privileged Host storage unless a separately accepted sandbox/MAC implementation exists.

## 5. Architecture Unknowns / mandatory risk disposition before L2 Freeze

| ID | Problem / evidence | Proposed bounded disposition | Responsible future lane / status |
| --- | --- | --- | --- |
| U01 | Exact Package/Kind/Handler schema and cryptographic provenance across Host | Select #956 R3 strict Graph validator + #978/#963 Host-approved exact-bytes closed binding; define ABI naming/version rules in L2 contract annex and preserve must-understand semantics | **REVIEW_PENDING** — BUILD/Contract |
| U02 | Host principal attestation ABI for both send/query, readback + subscriptions | Opaque Host-verified principal bound to audience/tenant/app/instance/operation with Kernel reader-policy evaluation, no untrusted public raw bypass. Determine signed token vs opaque Host capability at review and ensure no caller-forged principal | **REVIEW_PENDING / MATERIAL_SECURITY** — Host+Kernel |
| U03 | ModelPort measurement boundary from actual Host/SDK/Kernel | Host-port instrumentation and occurrence-bound counters, typed `unmeasured|unsupported` fallback and declaration-level FR08 separation | **REVIEW_PENDING / MATERIAL_TRUTHFULNESS** — SDK+Host |
| U04 | Host-store trusted-writer vs hostile writer integrity promise, crash and multi-process | Explicit trust model: trusted qualified Host writer. Do **not** claim privileged hostile writer resistance. Observe actual file/SQLite/restart/replay on production tasks. Fail closed if persisted records cannot be trusted; stronger MAC only through future scope | **SECURITY_REVIEW_PENDING**, code+real-host tests later |
| U05 | Retained historical delivered functions feature owner/validation plan | Use frozen 34 FR/HF + NEW-FUNCTION01–06 + FR08 split as strict inventory, one owner per target, L3 adoption codes and current-version positive/negative tests | **ARCH_MAPPING_PENDING** — all runtime packages |
| U06 | T016 shared-dist test race and N17 SQLite contention | #996 already merged staging; distinct local #953 T016 repair active (claim @6106284288), don't duplicate; distinguish fail from product correctness | **IN_PROGRESS_SEPARATE_INFRA**, not L2 scope blocker unless reproducible contradiction |
| U07 | Real Domain-forge production producer not present in this repository | Manual/system-authored bootstrap first version only, with exact same BUILD output/Host admission contract; Forge interface is not claimed integrated | **BOUNDED_INITIAL_SCOPE**, formal creator/forge integration outside repository unless explicitly authorized |

**L2 Freeze admission criteria:** One architect-approved exact ABI and trust policy for U01–U04, assign U05 coverage owners, explicit U07 producer limit. Negative witnesses from existing #956/#963/#978/#994/#949 sufficient for architecture selection where they actually prove the hypothesis; do not require new generic Demo. New material P0/P1 counterexample must block affected L2 Freeze and receive a *bounded* finding. U06 independent infra may proceed in parallel.

## 6. Minimal future Task DAG after L2 Freeze (planning shape ONLY)

| Candidate concern | Inputs | Implementation/output (not authorized yet) | Parallelism |
| --- | --- | --- | --- |
| T-A Contract / Qualified BUILD | A01/A03/A04, U01 | unified Package/Component/Kind/Operation ABI, graph validator & negative tests, sealed producer | first, defines contracts |
| T-B Minimal Microkernel | T-A | selected Module loader + lifecycle + bounded facade; #994 selective source port | parallel with T-C after frozen contract, independent files |
| T-C Kernel Authority + Dynamic Effect | T-A | migrated K mechanism, KPK04–07/14/15, no second Host Runtime | parallel with T-B in separate write set |
| T-D Standard SDK / functional retention | T-A and Kernel contract | Rule/Decision/Operation/Workflow, truthful ModelPort, historical FR/HF/NF slots | parallel with T-B/T-C after contract |
| T-E Trusted Node Host + Scoped UX | T-A + B/C scoped surface | H identity issuance/verification, scoped read/write and authorized subscribe, Node durable resources | after auth ABI with separate source files |
| T-F Real Domain Apps & clean consumer | B+C+D+E | Approval and Engineering applications, typed UX+effect, negative/recovery/replay, parts/inventory regressions | after dependencies |
| T-G Formal release validation | integrated version | full regression, real-host crash, security, Hidden, CJ, package, independent validation and RQ | after integration, separate testers |

**After L2 Freeze only**, materialize minimal concrete Issues + Issue Dependencies; avoid re-creating 15 old research Issues and no redundant Demo/Implementation dual track.

## 7. Verification and current truth

- Actual verified source review evidence, not rerun: #993@6104775952 `PASS_BOUNDED` KPK receipts on `b9ea4d1`, GHA Node22/24 48/48 plus KPK14 4/4 on same experimental head (not production CI); #959 research R3 `PASS_BOUNDED` at #956, historical PR CI caveat; #972 canonical A/B @6098188937 and collision @6098219217.
- #997 R03 corrected to #956 in head `c38d65a`, independent previous-head source-fidelity reviewer @6106355858 F1; author patch recorded @6106459266. Latest repair narrowly verified; NOT a new independent successor REVIEW PASS.
- Product Stage1 `FROZEN`, exact checkpoint above, no L2 Freeze or Task DAG issued as of writing.
- Source retention statuses in this document are **intended adoption choices for L2 review**, not merged implementation or actual release validation. Research code may need new packaging, TS surface, security and Host proof.

```ini
EVENT=V08_L2_ARCHITECTURE_EVIDENCE_DRAFT_AFTER_FREEZE
OWNER=#999
PRODUCT_FREEZE=#953@6106639644
PRIMARY_CODE_AND_TEST_SOURCE=#994@b9ea4d1f42246c61d5382328788c50741cac8e43
SOURCE_ADOPTION_INDEX=#997@c38d65a7b63f2c23772e23169ae4098125d1f3bd
R03_SAFE_SUCCESSOR=#956@16037896d02fe5ba07159d07d4922375dc8553be
L2_REVIEW=NOT_RUN
MATERIAL_UNKNOWN_REVIEW=U01;U02;U03;U04;U05
L2_FREEZE=NO
TASK_DAG=NO
PRODUCTION_PR=NO
```
