# DomainHarness v0.10.2 — copyable prompts / Agent 任务模板

Replace every `<...>` placeholder with **actual GitHub state**; do not ask an Agent to infer nonexistent issues/PRs. A prompt is not a job that ran.

## A. Learn the architecture (read-only, parallelizable)

~~~text
REPO=kaicreator-mm/domain-harness
VERSION=v0.10.2
PIN=cee14399d9d0af4e20e34b9111861b16a465b690
TASK=SOURCE_ARCHITECTURE_MAP
Read docs/v0.10.2/README.md, docs/architecture/V0102_RUNTIME_DIAGRAMS.md,
docs/sdk/V0102_PUBLIC_API.md and actual exported package roots.
Return K/S/B/C/BUILD/Microkernel/Node Host owner table, allowed import directions,
Tiny/Rich closure boundaries and any diagram-source drift. Read-only, no tests.
~~~

## B. Add a small Domain Package (developer Agent)

~~~text
REPO=kaicreator-mm/domain-harness
BASE=<exact future development branch SHA, NOT v0.10.2 tag>
TASK=<Issue number / planned component>
Read AGENTS.md, frozen product scope, docs/guides/V0102_PACKAGE_AUTHORING.md,
docs/guides/SUPPORTED_EXTENSION_POINTS.md and the runnable
examples/v0102-package-authoring/ fixture. First classify S semantic,
B private helper, C declared Tool/Operation, or K advisory extension.
Produce selected manifest/module identity, BUILD wiring, positive and typed
negative tests. Never add an undeclared Tool, bypass K, or import BUILD
at runtime. Only run scoped Node24 tests actually impacted.
Write exact SHA, commands and literal EXIT; do not claim release PASS.
~~~

## C. Integrate an external application (consumer Agent)

~~~text
REPO=<downstream project>
DOMAIN_HARNESS_TAG=v0.10.2
DOMAIN_HARNESS_SOURCE_SHA=cee14399d9d0af4e20e34b9111861b16a465b690
TASK=INTEGRATE_SELECTED_DOMAIN_APP
Build producer and consumer dependency closures separately; use the four
public roots and installed exact tarballs, not presumed npm registry versions.
Producer uses @kaicreator/domain-harness-build. Runtime uses
@kaicreator/domain-harness-microkernel.load(sealedApp, {store,...});
optional Node Host only if selected. Demonstrate send/query/subscribe/stop,
forbidden old compiler imports, denied effect zero dispatch, two-B query
scope and lifecycle cleanup. Start with ONE actual Critical Journey.
Return migration map and real test receipts; no private paths.
~~~

## D. Investigate a failure (independent triage Agent)

~~~text
REPO=kaicreator-mm/domain-harness
SHA=<exact commit>
TASK=<issue>
Read docs/manual/V0102_TROUBLESHOOTING.md and source around failed test IDs.
Classify PRODUCT / BUILD / HOST / TEST_RUNNER / OPERATING_SYSTEM / DOCUMENTATION.
Check actual literal EXIT and evidence; use only minimum affected-risk tests.
Do not change product code for unproven OS process/memory problems.
Report P0/P1/P2, causal counterexample or uncertainty and next action.
Do not turn failed or NOT_RUN tests into PASS.
~~~

## E. Independent source review (different logical context)

~~~text
REPO=kaicreator-mm/domain-harness
PR=<number>
EXACT_HEAD=<SHA>
TASK=INDEPENDENT_DIFF_REVIEW
Review actual PR diff and affected ownership/authority contracts.
Reuse unchanged eligible CI and physical evidence by exact SHA/tree with
documented impact decision. Find new P0/P1, assess scope, negative tests,
manifest ABI, import closure, side effect and public error redaction.
Output PASS/BLOCK, P0/P1/P2, MERGE_ELIGIBLE (separate from release).
Read-only, do not merge or edit source.
~~~

## F. Documentation-only maintenance

~~~text
REPO=kaicreator-mm/domain-harness
BASE=<current main SHA>
TASK=DOCS_ONLY_UPDATE
Preserve immutable refs/tags/v0.10.2 and Product/L2 evidence.
Work on isolated docs branch. Compare README, docs/sdk/README, architecture
Mermaid, zh-CN/en handbooks, SDK API, AGENTS and released manifests.
Fix stale candidate/old version claims and broken relative links only.
No runtime/source/manifest/lockfile/test edits. Verify all linked paths and
literal commands against repository tree; never rewrite historical test facts.
One docs-only PR, scoped source review, no whole-repo Full rerun.
~~~

Every output should distinguish **actual executions** from proposals and link the GitHub Issue/PR evidence. Use [Agent playbook](V0102_PLAYBOOK.md) for immutable review and version status.
