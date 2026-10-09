# V08 B2 R3 K1 — one physical D1 Genesis Kernel/SDK Assembly with two real Business Kinds (#983)

Pre-Freeze ISOLATED research experiment (P1-01, Task Pack #983). Not a formal
v0.8 L2 implementation. Research gates never self-approve; merge is forbidden.

## Falsifiable hypothesis (ADS ARCHITECTURE_RESEARCH_DEMO_STANDARD)

If ONE sealed Assembly is built from the byte-exact D1 Genesis Kernel
(`genesis.kernel`) and D1 SDK (`genesis.sdk`, both pinned to their original
PR #978 @ f87cfdfcf9fd252cc757c02e77d155afa5572303 package roots) plus TWO
hand-authored semantically distinct Business Packages, then

- both a pure `std.rule` business operation and an effectful `std.operation`
  business operation execute through that ONE Assembly — the pure one via
  generic trusted Host dispatch of the byte-verified physical callable, the
  effectful one ONLY behind the ORIGINAL accepted v0.7 Central
  Admission/Journal;
- any post-Seal tamper of ONLY the D1 Kernel bytes (or ONLY the D1 SDK bytes)
  is refused before ANY dispatch and before ANY journal record, even for
  completely unaffected business operations;
- the accepted Kernel path stays business-free
  (no `business.workflow` / `business.action` / `workflow.definition`
  semantics, no derived dispatcher, no second Kernel Package), resolving
  #982 P1-01 for the K1 half without re-signing or modifying a single byte of
  the Genesis seed.

Evidence strength: E2 (integration evidence — real D1 bytes + real B1 #956
validator/graph + real v0.7 admission seams + real original durable journal).
Result: **PASS at this scope** (end-to-end combined A1+K1 single-Assembly
verdict remains honestly PARTIAL until the A1 #984 repair lands; see
BRIDGE.md).

## Option A model (per Controller JIT #983@6081509418)

- `genesis-exact/**` — byte-exact vendored D1 Kernel and SDK packages. The
  Host recomputes both package roots at every establishment and refuses any
  divergence from `D1_GENESIS_ROOT_DIGESTS` (`E_D1_GENESIS_PIN`); the
  kernel.link implementation SHA must equal the #982-review-pinned
  `966317ea…` (`E_D1_KERNEL_LINK_IDENTITY`). D1 original files are NOT touched.
- `business/**` — TWO hand-authored real Business Packages (reproducible via
  `tools/author-business.mjs`, canonical manifests):
  - `k1.business.claim` — pure `std.rule` policy screen (`claim-policy`)
    plus a pure `std.operation` underwriter (`claim-underwrite`) consuming the
    D1 SDK capability `rule.score@1.0.0` through a declared cross-package
    binding. No I/O, no effects.
  - `k1.business.charge` — effectful `std.operation` (`charge-op`,
    effect `non-idempotent`). Its physical callable is NEVER dispatched by the
    Host; it only ever executes behind the ORIGINAL v0.7 T002B→T003C→T004A→
    T004C chain (`host/native-join.mjs`).
- `host/bootstrap.mjs` — trusted Host glue: byte verification, #956 candidate
  validation, real v0.7 Kind admission, full provider/import/dependency graph,
  selected handler identity, the physical D1 `kernel.link` execution over the
  whole graph, ONE sealed Assembly, and generic business-neutral dispatch that
  re-reads EVERY member package's physical bytes before EVERY dispatch.
- The Host is NOT a second Kernel Domain Package or Runtime: it owns no
  admission/State/Effect/Journal decision, refuses all effectful dispatch
  (`E_EFFECT_ADMISSION_REQUIRED`), accepts no caller authority keys, and
  authority-bearing native ports are not caller-substitutable
  (`E_HOST_PORT_IMMUTABLE`).

## K3 executable matrix (tests/k1-assembly.test.mjs)

| ID | Scenario | Result |
|----|----------|--------|
| K3-01 | two different real Business Kind operations through ONE sealed Assembly (pure std.rule + effectful std.operation) + other profiles still available + original Journal replay discipline | PASS |
| K3-02 | exact D1 root matching (recomputed `38c13d4a…` / `1833a217…`), kernel.link module SHA `966317ea…`, deterministic assembly digest | PASS |
| K3-03 | wrong-existing Handler + wrong owner under still-valid re-attested graph refuse typed | PASS |
| K3-04 | unauthorized re-sign of a Business Package refused by Host trust roots | PASS |
| K3-05 | missing provider and ambiguous provider refuse in the real graph | PASS |
| K3-06 | unknown Kind / unknown Kind version / unknown mandatory capability refuse at exact-kind gates | PASS |
| K3-07 | unapproved cross-Package imports refuse at package and graph gates | PASS |
| K3-08 | post-Seal tamper of ONLY D1 Kernel bytes denies BOTH pure and effectful business before any dispatch/journal (0 dispatch, 0 records) | PASS |
| K3-09 | post-Seal tamper of ONLY D1 SDK bytes denies before any dispatch/journal | PASS |
| K3-10 | unknown operation refuses closed-world with zero dispatch | PASS |
| K3-11 | forged caller kernel/provider/host pins (construction override, self-declared digest, invoke authority keys, drifted seal, non-functioning host) never dispatch | PASS |
| K3-12 | malformed + prototype-polluting own keys (invoke input and package manifest) refuse typed `E_RECORD_SAFETY` | PASS |
| K3-13 | effectful route cannot bypass ORIGINAL v0.7 Central Admission: pure dispatch refuses; Host ports immutable; forged effect authority/lookalike T003C binding/moved request/foreign occurrence fail typed with 0 dispatch 0 records; the only admitted path journals exactly once | PASS |
| ARCH-01 | accepted Kernel path business-free; no second Kernel; no derived dispatcher/#940 module on the accepted path | PASS |
| ARCH-02 | deterministic Assembly, frozen/immutable selection, concurrent business profiles | PASS |

The suite also executes the ORIGINAL v0.7 PACK-C T004C tests (16) because the
unactivated occurrence fixture is imported from the original source test
module — those are original-authority regressions, not new claims.

## Run

```bash
npm ci
npm run build   # dist must exist for the v0.7 admission seams
node --import tsx --test experiments/v08-b2-r3-k1/tests/k1-assembly.test.mjs
node experiments/v08-b2-r3-k1/tools/author-business.mjs   # reproducible manifests (dry check)
```

## Honest scope limits (PARTIAL on purpose)

- The native projection in `host/native-join.mjs` is a trusted TEST Host
  bridge (permissive test admission policy, empty Tool body validator):
  governance-policy equivalence of the physical→native projection is the
  separate A1 #984 repair, not proven here.
- The combined K1+A1 single-Assembly end-to-end verdict is PARTIAL until A1
  lands on the bridge contract in BRIDGE.md.
- JS ambient globals are NOT sandboxed (same D1 research limitation).
- Historic red CI (first PR Full run ESM mismatch on the predecessor branch)
  remains NOT_PROVEN root cause and is not waived by this experiment.
