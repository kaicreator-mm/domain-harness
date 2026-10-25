# Migrate DomainHarness v0.10.1 → v0.10.2

**Version-candidate guidance, not a release compatibility guarantee.** T08b #1329 source based on `v0.10.2@51dadcbb` after T07b. A final clean-installed Node24 proof is T09; R01 alone can qualify this release.

## Move responsibilities, not K policy

| Before | v0.10.2 destination | Action |
| --- | --- | --- |
| Compiler `/v10build` or deep build imports | `@kaicreator/domain-harness-build` | Move BUILD to an external, separate producer process |
| Legacy copied K/S modules | Independently sealed K/S Domain Packages | Pin selected module bytes/ABI; preserve K ownership |
| Shared v10 types in old Compiler | `@kaicreator/domain-harness-contracts` | Import public declarations only from Contracts |
| Runtime activation in old legacy surface | `@kaicreator/domain-harness-microkernel` | Call `load(prebuiltApp, {store, ...})`, never runtime compile |
| Storage/native adapters in old Host tree | Optional `@kaicreator/domain-harness-host-node` | Explicit Rich Host selection; inject real CAS/SQLite only if used |
| Raw observer/receipt | Microkernel `await subscribe(selector, listener)` | Query-scoped, redacted live observation, unsubscribe and stop |

At runtime, `send` retains Kernel-owned durable admission and original receipt replay; same `messageId` with conflicting intent/input must type-refuse, never apply the effect twice. Query and subscription refuse unauthorized targets. K authority and persisted wire literals remain stable across this internal split; cosmetic names are not substitutes for migration tests.

## Porting steps

1. Pin exact trusted source SHA, selected K/S/B/C Domain Package bytes, BUILD target ABI and deployment identity.
2. Remove Compiler `/v10*`, source `dist/` and other private paths. Use the exact four public selected npm package roots and `@kaicreator/domain-harness-microkernel/host-seam` only for trusted Host bootstrap.
3. Build the App outside its runtime dependency graph with `buildV10App`. An A8b `projectSelectedComponents` projection may select *already sealed* semantic/advisory Tool modules; it cannot authorize unknown hooks or remote transport.
4. Load the prebuilt App via public `load`; inject an approved store, then replace UI calls with `send`, `query`, async `subscribe`, and `stop`.
5. Execute the T09 clean-installed Tiny/Rich/external producer and forbidden-import negatives on Node24, including native SQLite only where explicitly required.
6. For R01 run the listed documentation commands **once** at the frozen exact candidate SHA and record actual exit codes + tarball digests alongside Full/Hidden/Critical/Packaging. Do not treat docs/CI green alone as release PASS.

All selected public npm manifests currently declare `engines.node >=24.0.0` and `0.10.2-rc.0`. This does not imply that packages are published to a registry. Node22 is not supported by this release lane; other newer Node majors remain unqualified.

**No compatibility layer or independent runtime policy engine will be added solely to preserve pre-1.0 legacy consumers.** If a real behavior is still required, carry it through its selected Domain Package/Host and demonstrate it under the final pack/install tests.
