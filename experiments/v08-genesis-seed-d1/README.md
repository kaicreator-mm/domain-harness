# V08-DEMO-01 — Real hand-authored Genesis seed (Issue #971)

**Task Pack**: https://github.com/kaicreator-mm/domain-harness/issues/971

This is an isolated, unmerged **pre-Freeze research** experiment. No general Forge generator, no v0.7 new Runtime, no root lint changes, no claim of production ABI conformance. **D2/D3 may reuse only the exact trusted Kernel and Standard SDK bytes, not merely this README's claims.**

## Hand-authoring and versioned bytes
All `packages/{kernel,sdk,business-smoke}/manifest.json` and `modules/*.mjs` are actual committed physical files, **not generated at runtime**. The three manifests use the independently specified candidate B `dhpkg/0.8-candidate-1`/ `ucb/1` ABI of reviewed #956 → #963, not #940 legacy fixture schema. The source was individually hand-authored: Kernel provides a pure graph Link; SDK defines Schema, Rule, Decision, Workflow and effect=none Operation; minimal independent Business Smoke supplies a Schema plus a pure Operation that **uses an explicitly declared SDK Rule capability**.

Canonical manifest serialization is recursively sorted JSON with one terminal newline. Each implementation SHA-256 is over exact UTF-8 source bytes; manifest `integrity` is the candidate B `packageDigest` domain separator with SHA-256 of source bytes, not a user-editable success flag. The Host pins in `host/trust-roots.mjs` are independent of all Package files and must be provisioned by an authorized Host for any actual deployment. **Editing a Package and its own integrity field is insufficient to change Host trust.**

## Exact trusted candidates
| Package | Candidate integrity SHA-256 |
| --- | --- |
| genesis.kernel | `sha256:38c13d4a317e754dfa0ed344f584cd3aa74c67cd3938d39963e52697ed5bc3a2` |
| genesis.sdk | `sha256:1833a217993cb61587b5b0b65c3128d23bc0253baa3591336e72c575ce5c1a28` |
| genesis.business.smoke | `sha256:7f310dae4e619d4f9f1d1ea2cc2e8369be142e45b44d1c981895496533d7c57c` |

These are immutable reference seed digests; use `sha256sum packages/*/modules/*.mjs` and `git hash-object` to reproduce physical bytes. The exact root commit/tree is supplied by CI, not hardcoded into the Package.

## Run on Node 22+/trusted GitHub Actions host
**One-command complete reproduction** (from the repository root):

```bash
bash experiments/v08-genesis-seed-d1/verify.sh
```

Or use the individual commands:

```bash
npm ci
npm run build
node --test experiments/v08-genesis-seed-d1/tests/genesis.test.mjs
node experiments/v08-genesis-seed-d1/run.mjs
npm run lint
npm run typecheck
npm test
```

The dedicated workflow `.github/workflows/spike-v08-genesis-d1.yml` independently executes all of the above. No test is marked passed until its actual CI logs are inspected.

## Trust/Link/Seal semantics
1. `host/bootstrap.mjs` reads `host/trust-roots.mjs` *outside all Package trees*: the caller can choose a test checkout root but cannot supply pins, Kind providers, arbitrary handler functions or effect authority.
2. Every physical manifest and module is read from disk; manifest serialization and Host digest pins are verified before dynamic module loading. The reviewed B1 `candidate-validator.mjs` is used unmodified for package integrity, dependency/import/export/graph and capability binding.
3. The SDK's pinned `sdk-schema` Kind catalog supplies the installed Kind understanding to accepted v0.7 `decideKindCompatibility` and `admitComponent` seams. The Kernel does not hardcode business Workflow/Action handlers.
4. Selected Handler identity is `(Package, Component, KindRef, ImplementationId, modulePath, moduleSha256, OperationId)`. The Host imports only the previously read byte-verified ESM via immutable data URLs, never executes a user-supplied function. The Kernel Link must itself be selected by its declared capability.
5. The sealed assembly digest includes physical package digests, verified graph/bindings and selected Handler identities. **R2 currentness is Assembly-wide**: before each public invoke (and before each nested capability dispatch), the Host re-reads *all* Kernel/SDK/Business canonical manifests and declared implementation module bytes, verifies exact SHA-256, Package root digests and dependency/graph digest against the sealed occurrence. No read-once cache or caller-maintained currentness bit. Public selected identity, including nested `kindRef`, and Assembly package/binding views are deeply frozen. Schema has no Operation.
6. A business Operation can invoke only its declared/bound SDK capability; all D1 Operations are `effect=none`. **Host root immutability is a trusted deployment prerequisite** from initial Seal through every read/dispatch. Multiple independent filesystem reads cannot atomically prevent concurrent write/symlink races; this is not an arbitrary-adversary filesystem sandbox or JS realm sandbox. Host-provisioned trusted module bytes are authorized, not safe merely because a lexical `import`/`require` regex passes; comments/indirect imports and ambient globals bypass lexical heuristics (G26). A deployment with untrusted module authors needs proper module isolation/permissions beyond D1.
7. **Internal-only Host API:** `host.invoke` is a trusted Host/test orchestration entry point, not a user-facing authenticated API. Package `callers`/`exposure` annotations are **not enforced** as principal-based authorization by D1; calls with forged `caller`/`effectAuthority` overrides are rejected, but the trusted internal Host may call SDK Operations directly. End-user authorization requires an upstream trusted facade/identity context and independently tested policy, not shown here. D1 does not prove actual native T002/T004 effect/journal parity, which belongs to D2.

## Proof matrix
| ID | Gate or attack |
| --- | --- |
| G01–G04 | physical bytes, deterministic digest, actual Link/Seal, real Rule/Decision/Workflow/pure Operation, Schema without operation |
| G05–G06 | mutated module, forged manifest/Host pin |
| G07–G08 | wrong-but-existing Handler/owner |
| G09–G10 | unknown required Kind/semantic |
| G11–G12 | missing/ambiguous Provider |
| G13 | undeclared cross-package import |
| G14–G15 | post-Seal module/manifest mutation |
| G16 | bootstrap self-certification / authority injection |
| G17–G18 | input mutation and unknown physical identity |
| G19–G20 | **valid-context independently re-pinned** wrong-but-existing Handler and Component owner; candidate package+dependency graph passes, selected-callable stage rejects |
| G21 | unknown mandatory Capability denied by accepted v0.7 must-understand admission before Kind body |
| G22 | mutate only Kernel manifest or actual Kernel Link module after seal; invoke unaffected SDK Rule; typed failure, zero dispatch |
| G23 | mutate SDK Rule dependency module after seal; invoke Business parent; zero dispatch; verify a separately reattested candidate graph cannot self-authorize against fixed Host roots |
| G24 | reject post-seal nested KindRef and exported Assembly view mutation; same private Handler executes |
| G25 | caller/exposure are explicitly internal-Host-only; caller authority injection rejected, not a user authorization claim |
| G26 | valid comment-obfuscated dynamic import bypasses lexical heuristic but externally pinned module SHA refuses its bytes |

**Honest boundary:** B1's current `dhpkg/0.8-candidate-1` is still a *research candidate*, and its `KindCatalog` provenance/semantic validators are not yet a native frozen v0.8 Package API. A successful D1 physical-binary proof is bounded, not production conformance. The distinct #960 A1/native joining gap and fresh independent D1 Review remain open until separately proven. No Product Freeze, Tech Gate approval, v0.7 modification or merge.

## Same-concern R2 successor (review source PR #974 remains immutable)

R2 task contract: [#971@6077435376](https://github.com/kaicreator-mm/domain-harness/issues/971#issuecomment-6077435376); blocking independent review: [#975@6077109662](https://github.com/kaicreator-mm/domain-harness/issues/975#issuecomment-6077109662). Successor uses a separate Draft PR and `.github/workflows/spike-v08-genesis-d1-r2.yml`. All committed Kernel, SDK, Business manifest and module bytes and the Host's `trust-roots.mjs` remain **unchanged** from #974. The validator candidate ABI stays `dhpkg/0.8-candidate-1`; this research-only repair does not freeze production Package ABI, enable native effect/journal, change #960/B2, or authorize main merge.

To reproduce on a clean trusted Ubuntu/Node host, run `bash experiments/v08-genesis-seed-d1/verify.sh` from repository root. Real full CI must independently record exact commit/tree, Push and PR checkout identity, D1 G01–G26, full npm gates and historical failed attempts. A fresh reviewer **different from the R2 Builder** is mandatory; the Builder may not self-review or grant Tech Gate/Product Freeze.
