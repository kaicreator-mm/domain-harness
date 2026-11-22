# DomainHarness v0.11.2 · Domain Intelligence L2 Contract Candidate

> **L2 candidate pending independent reviewer.** This implements a small, bounded Domain Intelligence model **inside ordinary Domain Packages** without changing R72/R81 accepted SDK interfaces. Implementation issue [#1666](https://github.com/kaicreator-mm/domain-harness/issues/1666), version controller [#1612](https://github.com/kaicreator-mm/domain-harness/issues/1612).

## Package/Trust boundary

```text
Independent Consumer: @kaicreator/domain-harness only
  DomainApp(reference.acceptance@1.1.0)
    KDP r41-kdp Core.Order=0
    SDK r41-sdk-base Core.Order=1
    Business reference-business@1.1.0 Core.Order=2
      directly dependsOn r60-standard-files@1.0.0 [readJson, writeYaml]
      directly dependsOn reference-knowledge@1.0.0 [queryFacts]
        ContentBlock(kind=knowledge, ref=content/facts.json, digest=SHA256)
        exact FunctionRef reference.knowledge.queryFacts
      selected WorkflowRoot: reference.app@1.1.0/decision-flow
        recognize -> queryFacts -> validate -> decide
        UNKNOWN/FAILED -> explicit terminal, never COMPLETE
```

No Package generation is required. The previous v0.11.1 application files remain addressable at the immutable [R81 exact source SHA](https://github.com/kaicreator-mm/domain-harness/tree/b4d9c5a9a095cfcb01af7118bd79a4add8f0b210/examples/reference-domain-app); the current working directory is **the same** Reference App and evolves only the new stage's ordinary files. Node22 ESM target stays unchanged; using Node24 in the CI runner does not change SDK minimum Node22.12.

## Data + Function Contract

1. Knowledge File `content/facts.json` is strictly package-root relative, verified and included in the Lock by `ContentBlock.ref` with SHA256. It includes `domain`, `revision`, and at most 64 relevant facts; each record has `id`, `key`, `region`, `value`, `source{id,version,kind}`, `validFrom`, `validTo`, `revision`.
2. Business Init gets this content **only** from the KDP selected read-only ResourceHandle and decodes it via the accepted `dh.std.file.json.readJson` Function. No unsealed fs/network/Host path lookup. It starts the BUILD-selected Workflow with the resource data and input; user input cannot select additional FunctionRefs or WorkflowRoots.
3. `reference.recognizer.recognize` validates domain, finite score, region, effective date and requested revision; unknown or out of scope returns UNKNOWN with a stable reason.
4. `reference.knowledge.queryFacts` is a separately selected **pure** Function in a directly declared ordinary Extension Package. It filters key+region+revision+effective interval; any conflicting current values or missing source identity yields UNKNOWN, never a made-up threshold. The result carries `minimumScore` and Evidence/Provenance identities.
5. `reference.validator.validate` checks that the resolved evidence is nonempty, applicable to exact scope/version/date and well formed, otherwise returns UNKNOWN.
6. `reference.rule.decide` uses only the **resolved selected fact's threshold** to choose ACCEPT/REJECT; the ESM function has no embedded numerical threshold. This removes R81's P2 two-source threshold drift and allows source facts to actually change decisions. The decision propagates current Fact/Source/Revision/Applicability proof.
7. `reference.app` owns one four-node `dh.workflow/0.11` definition, with `maxElementCalls=4`; each node explicitly branches SUCCEEDED to the next/COMPLETE, UNKNOWN to UNKNOWN, FAILED to FAILED. All refs are exact Element/Function Version+Digest bindings with R72/T14 normal source/target lock.
8. `main.mjs` builds a real `DomainDefinition` using **the actual loaded ElementDefinitions**, not duplicated manual objects, and provides an explicit semanticRelations graph. `buildApp` must validate/seal both Domain and selected Package graph before any Boot.

## Failure/recovery boundaries

- No external effects, LLM, tools, database, dynamic imports, arbitrary HostPorts or independent agent state machine.
- Modified facts bytes retaining old `ContentBlock.ref` MUST fail before Boot; wrong ESM digest/undeclared direct import also fail. The existing SRI preinstall negative and unselected Workflow negative remain.
- An UPDATE of selected knowledge facts MUST require a new SHA in the Element definition, changed Manifest definitionRef/ElementRef, fresh deterministic Lock and newly verified App; no hot swapping of a pinned Package/Workflow instance.
- Historical `SDK[i]+Packages[i]+ReferenceApp[i]` pairs are retained by real commit/ref/digest/receipt, not the latest source masquerading as history. This candidate does not claim to have reinstalled historical app on this new SHA.
- Prior 0.11.1 R72 preallocation P2 and R81 threshold duplication P2 are separate; the latter should close only after real two-threshold outcomes, exact SHA CI and independent review.

## Review gate

Exact-HEAD QA must check JSON/ESM syntax, manifest digest identities (UTF-8 file SHA versus canonical Element SHA), selected direct Extension imports, real four FunctionRefs in the Workflow Lock, independent npm package install, 10 distinct outcome cases, historical Stage Index preservation, actual log/receipt source SHA and bounded failure diagnostics. Do not claim `ACCEPTED`, `STANDARD_ACCEPTED`, CI PASS or source merge until evidenced.
