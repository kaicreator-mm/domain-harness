# v0.10.2 S Feature Guide — semantic, not automatically a Tool

> Language: English. Chinese companion: `V0102_S_FEATURE.zh-CN.md`.

S Primary owns interpretation and route choice; a selected optional S Feature supplies one declared bounded semantic function. Select `role:'standard-feature'` with `abiVersion:'dh.v10.standard-feature/1'`, `featureExport`, source bytes + digest and `provides`. BUILD must include it in the closed module set; Tiny may omit it entirely.

The **pure non-Tool** path is `projectSelectedComponents([{class:'semantic',kind:'rule',componentId:'quality.rule',modulePackageId:feature.packageId,entry:feature.featureExport}], [feature])`. This returns exactly the original selected S module and an informational binding. A private function in its ESM body is not a Tool, and no separate Tool/Operation gets registered. Supported semantic kinds are `skill/rule/workflow/decision/context/validator/schema/diagnostics/knowledge/evidence`, **only when** they bind an already selected S Feature export; prompt/knowledge assets without a callable entry remain private Package data.

For a real source and installed BUILD reference use `domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs`, `examples/v0102-external-producer/producer.mjs`, and `tooling/build/tests/component-view.test.ts`. There is no implicit `Tool` wrapper, Model/Agent dependency or permission power in an S Feature. BUILD refuses `entry:'privateRule'` when not equal to the selected `featureExport`; the integration fixture must also prove an **unselected** feature has zero installed/imported footprint.

Node24 contributor check: `npm run build && node --import tsx --test tooling/build/tests/component-view.test.ts`. The physical public-tarball proof of this exact non-Tool path (selected through `projectSelectedComponents`, sealed, packed, clean-installed and invoked via `invokeSelectedStandardFeature`) is `examples/v0102-package-authoring/authoring-template-check.mjs` step `feature.nonToolSemantic`; a doc itself is never physical evidence, and the independent exact-HEAD review for Issue #1379 remains its own gate.
