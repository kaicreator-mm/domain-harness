# DomainHarness v0.10.1 — Agent Improvement SDK C01 (source prototype)

**Status:** source prototype only, pre Product/L2/DAG freeze. **No qualified installation / Host / v0.10.1 release PASS claimed.** Parent #1274; C01 #1275.

This directory contains a physically separate v0.10 \`standard-feature\` package source with the **exact existing** \`dh.v10.standard-feature/1\` identity shape. It is a pure, bounded diagnostic feature, not another Kernel, Controller, Telemetry Collector, Evaluator authority or Tool. In a selected Domain App, the manifest entry declares \`featureExport='analyzeAgentRun'\` and \`provides=['standard:agent-diagnostics/1']\`; the v10 BUILD must pin the exact moduleSource/hash/ABI, reject duplicates and close dependencies **before import**.

Source studies: 2025 MAST/ABC and 2026 AutoSaddler/AgentLens/AgentForesight. Domain-specific taxonomy decisions belong to Business modules; this feature only identifies directly observed events and evidence gaps.

## Local source conformance

\`\`\`sh
node --test examples/v0101-agent-improvement/tests/agent-diagnostics.test.mjs
\`\`\`

Full acceptance remains: isolated Node24 \`npm ci && npm run build\`, selected v10 BUILD, packed clean App install and invocation of this feature via selected S primary (the read-only named-feature path), real runner verification (including #1267 revision where state-affecting decisions are integrated), same-module dependency/duplicate-provider negative tests, and independent exact-SHA review.

## Stable safety boundaries

- Observed FAIL is not a causal Root Cause; repeated failures are diagnostic candidates, not mandatory Pivot/retry decisions.
- This feature never produces GitHub Task/PR/Release PASS and never supplies an \`EffectPermit\`.
- No raw source diff, prompt, secrets, private chain-of-thought or Host handles accepted.
- Physical Tool effects and source currentness are the consuming App/Kernel/Host's responsibility; missing information remains visible.
