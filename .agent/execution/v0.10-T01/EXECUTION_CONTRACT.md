# T01 — exact-base source-only audit execution contract

Task authority [#1165](https://github.com/kaicreator-mm/domain-harness/issues/1165); frozen [Task Pack #1165@6253004820](https://github.com/kaicreator-mm/domain-harness/issues/1165#issuecomment-6253004820). Target is `v0.10` from immutable base `32b6e776000669014c0384110e0340be59d5fd4b`; no runtime/ABI code writes, no BUILD/Package trust-rule rewrite.

Deliver **one 44-row evidence crosswalk** at `docs/roadmap/DomainHarness_v0.10_HISTORICAL_CAPABILITY_CROSSWALK.md`. Historical source existence is NOT selected-v9 public positive+negative coverage; v08 executed claims are historical only. Classify as:
- `SELECTED_V9_PN_SOURCE` only if a current reachable `./v9` consumer path has concrete P and N source assertions; cite actual file names/identity, and do not infer runtime PASS from test presence
- `SELECTED_V9_PARTIAL` if a reachable public path only covers a subset, with gaps explicitly named
- `ABSENT` if the retained capability has no identified selected `./v9` P+N witness; cite the inspected selected-v9 route and avoid treating all legacy library exports as selected
- `BUILD_ONLY` for frozen static ABI/closure/currentness facts; distinguish v09 historic Host rechecking from **accepted A01 v0.10 BUILD-only** design

Group Kernel live effects/CAS, Standard semantics, Capability READ vs governed EFFECT, BUILD, Host/user UX; route uncovered v0.10 behaviors to the existing correct owning Task; do not add 44 new Issues. Source-only proof must be true on this pinned branch. Avoid source edits, runtime tests, new services, QuickJS, target OS matrix or release claims.
