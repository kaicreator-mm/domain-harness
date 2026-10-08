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
5. The sealed assembly digest includes physical package digests, verified graph/bindings and selected Handler identities. Each invocation rechecks physical bytes and manifest currentness; invoking after on-disk mutation refuses instead of silently switching implementation. Schema has no Operation.
6. A business Operation can invoke only its declared/bound SDK capability; all D1 Operations are `effect=none`. Ambient JS globals, dynamic import sandboxes and source Host integrity remain **Host trust limitations**. D1 does not prove actual native T002/T004 effect/journal parity, which belongs to D2.

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

**Honest boundary:** B1's current `dhpkg/0.8-candidate-1` is still a *research candidate*, and its `KindCatalog` provenance/semantic validators are not yet a native frozen v0.8 Package API. A successful D1 physical-binary proof is bounded, not production conformance. The distinct #960 A1/native joining gap and fresh independent D1 Review remain open until separately proven. No Product Freeze, Tech Gate approval, v0.7 modification or merge.
