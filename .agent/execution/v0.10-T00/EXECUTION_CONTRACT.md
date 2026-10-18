# T00 Execution Contract — Closed-world Node24 BUILD composition (bound to v0.10 @ 1e6d4be)

Task authority: Issue #1166 + frozen Task Pack `#1166@6253225654` + dispatch
`#1166@6253946934` (dh010-t00-local-g1, builder, LOCAL_AGENT_NODE24). This
contract implements the Task Pack on exactly this base; it may narrow, never
redefine, task authority. Normative sources: accepted Product A01
(`docs/product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_TRUSTED_BUILD_OUTPUT.md`
blob `ade9c96395501577a1734882074be9975e0fc770`; acceptance blob
`6777acf013a24229e7aa28b4c5b7768e6070b350`), frozen L2 R3 (blob
`9e58c629b0a2074617ca3d38ac85d9527f284aab`, freeze `b7712055debbd8d36762e0a721cf69ab1a38516e`),
frozen Task DAG (blob `f375bb0acd1099da76f0849a1929ad11831b12f7`).

## 1. Deliverable (one concern)

A v0.10 BUILD composition seam in the compiler package that pins exactly one
Node24 target profile and one compatible SDK+K/S/B/C graph with ordinary
npm/native import allowances, plus its trusted-activation counterpart:

1. `buildV10App` — deterministic, purely static (zero module evaluation)
   once-only BUILD preflight over a proposed composition:
   closed-role cardinality (exactly one K Primary, exactly one S Primary,
   >=1 Business), K-advisory provider/hook uniqueness, S-feature key
   uniqueness, kernel-authority namespace reservation (forgery refusal),
   internal dependency completeness + acyclicity, sealed required-feature
   completeness, per-role ABI table matching, byte-identity pinning
   (sha256(moduleSource) == moduleSha256), sealed ordinary-import closure
   (node:/npm/native declared per module; undeclared/computed/code-string
   import edges refused), route-table admission against the sealed graph,
   and a canonical subject digest. Output is plain frozen data
   (`dh.v10.build/1`) carrying the sealed load order; no approval is minted.
2. `activateV10App` — the A01 trusted-activation counterpart: consume the
   BUILD output as plain data, import the sealed modules in the SEALED
   order through private per-activation `data:` URLs, structurally connect
   role exports, init advisory modules (K extensions + S features) in
   sealed order with a bounded data-only port-denying context (reverse
   disposal on any late failure, K state untouched), compose one K facade
   over the real selected kernel bytes (one `createOccurrenceRuntime`
   invocation per business package) for bounded execute, and dispose.
   It performs NO digest re-attestation, NO AST inspection, NO dependency
   recomputation, NO issuer/approval verification (A01-PC05: runtime SDK is
   not a second Package trust checker). Activation trusts BUILD facts; its
   fail-fast is limited to structural plain-data shape and actual missing
   callable exports/init failures.

Basic composition = no advisory/advanced modules sealed, none imported
("Basic skips advanced imports"); absent optional advisory modules fall back
to Basic. Rich composition = two physically distinct K advisory extension
modules + >=3 physically distinct selected S feature modules.

## 2. Exact write set on this base (single writer: T00)

New files (all additive; no existing product file is modified except the two
additive export barrels):

- `packages/domain-harness-compiler/src/qualified-package/v10build/errors.ts`
- `packages/domain-harness-compiler/src/qualified-package/v10build/digest.ts`
- `packages/domain-harness-compiler/src/qualified-package/v10build/import-policy.ts`
- `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts`
- `packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts`
- `packages/domain-harness-compiler/src/qualified-package/v10build/index.ts`
- `packages/domain-harness-compiler/src/qualified-package/index.ts` (additive v10 exports only)
- `packages/domain-harness-compiler/src/index.ts` (additive v10 exports only)
- `packages/domain-harness-compiler/dist/**` (committed-dist rebuild of the above)
- `tests/compiler/v10build-composition.test.ts`
- `tests/assembly/v010-build-activation.test.ts`
- `tests/assembly/fixtures-v010/*.mjs` (physically distinct advisory/feature fixtures)
- `tests/assembly/helpers-v010.ts` (composition fixture assembly + plain CAS doc store)
- `.agent/execution/v0.10-T00/*` (this pack)

Explicitly NOT touched (writer coordination / out of scope):

- `packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs`
  — reserved single writer K01 #1167 (dispatch #6253946934 file-collision rule).
- `packages/domain-harness-node/src/v09/sqlite-physical-cas.ts` and all
  `packages/domain-harness/src/host-v9/**` — K01/K02 physical-host scope.
- `tests/architecture-v010-k-extensions/**` — frozen E2 research evidence;
  reused as SEMANTIC REFERENCE ONLY, never edited.
- Frozen Product/L2/DAG docs, v0.9 release evidence, `tests/MATRIX.md`,
  CI workflow, root `scripts/**`.

## 3. Normative mapping (why this shape)

- A01-PC05: BUILD selects one runtime profile + exact K/S/B/C graph and
  resolves dependencies/contracts statically, once; ordinary Node/npm/native
  imports are allowed implementation details sealed per module; SDK consumes
  the trusted output without static re-attestation. → buildV10App does the
  once-only static closure; activateV10App is the ordinary-module-load
  consumer.
- A01-PC08 static negatives: two primaries, duplicate Kind/provider, missing
  or wrong version/ABI, declared dependency cycle → BUILD failures. → typed
  V10 refusal codes in TEST_MATRIX.
- Frozen PC-08 "forged extension hook" → wrong selected hook/provider fails
  BUILD (namespace reservation + uniqueness), NOT runtime source inspection.
- L2 §2.2 physical K/S/B/C + advisory extensions cannot become parallel
  commit authorities → kernel/cas/admission/journal/effect namespace is
  reserved to the K Primary at BUILD; advisory init contexts expose no
  protected K port at activation.
- L2 §2.1 no repeated runtime Package AST/hash/approval verification,
  no dynamic Package selection → activation imports only the sealed load
  order and never re-hashes bytes (a tampered sealed digest still activates:
  that is the intended A01 trust semantics, asserted in tests).
- E2 research #1151 (blob `763b9c16934f0a1a5690ff6acf842b7641048ec7`) is
  the K-extension seam SEMANTIC REFERENCE (subject shape, planning order,
  port denial, init contract, reverse disposal). Its activation-time
  SHA/AST re-verification is deliberately NOT carried into v0.10 (A01 moved
  those checks to BUILD). Advisory hook consultation semantics (budget
  advice, recovery diagnostics) remain research/K-side scope; T00 loads and
  initializes advisory modules but does not implement turn-time advisory
  consultation.

## 4. Validation ownership and environment

- Local Node 24 (fnm default 24.21.0) real ESM execution:
  `node --import tsx --test tests/compiler/v10build-composition.test.ts` and
  `node --import tsx --test tests/assembly/v010-build-activation.test.ts`
  (both also covered by root `npm run test:root` globs).
- Scoped static gates: `npm run build` (workspace dist + committed-dist
  guard), `npm run typecheck`, `npm run lint` — scoped to this task's
  changed surface plus the repo-standard gates these commands own.
- Physical two-process SQLite CAS, packed consumers, hidden validation,
  full-suite regression: NOT T00 — K01/K02/T11/R01 own them; recorded as
  NOT_RUN, never waived-in.
- PR: exactly one, `task/v0.10-t00-build-composition` → `v0.10`;
  `review:required` independent exact-HEAD review before merge; no
  self-asserted review PASS; no merge before acceptance.

## 5. Failure routing

- Unsupported host/environment or file-claim conflict → typed BLOCKED/NOT_RUN
  on #1166, no fake PASS.
- Frozen-authority contradiction discovered during execution → stop the
  affected path, publish `TASK_PACK_DEFECT`/`ARCHITECTURE_CONTRADICTION`
  on #1166; never silently redesign.
- Test/implementation defects inside the write set → repair locally,
  rerun affected validation, republish exact-SHA evidence.

## 6. Completion rule

T00 implementation completes at: all TEST_MATRIX rows PASS at one exact
pushed HEAD with real exit codes, scoped gates green, evidence comment on
#1166 (SHA, commands, P/N counts, Task Learning), PR open to v0.10 with
required independent review requested (not merged). `PR_PASS != RELEASE_PASS`.
