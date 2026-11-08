# DIS 0.2.0 full-scope R3 self-verification Demo (compact repository edition)

**Product/L1 reference only, not real KDP / SDK / Forge / Provider or independent audit.**

From repo root:

~~~sh
node --check examples/dis-v020-full-audit-demo/demo.mjs
node examples/dis-v020-full-audit-demo/demo.mjs
~~~

Expected terminal marker: `PASS_FULL_SCOPE_COMPACT_SIMULATED`. The self-contained script reports **24 named checks PASS** and runs the already committed sibling `examples/dis-v020-evolution-demo/demo.mjs` with its **25 nested checks PASS**. Git blob of this exact script: `469e54edc4cac81301adaaa7a5fb308af2917195` (matched source locally executed on Node v22.16.0).

**More complete modular reference Demo:** the separately provided `dis-v020-full-audit-demo.zip` (SHA256 `d8e5740d478cbd38fae7b6d928d70d9ec2452668d4c0e81715bb2be1cd078c71`) has multiple modules and a `node:test` suite: **74/74 outer PASS (27 POS / 47 NEG)**. One of those outer cases runs the same 25-check evolution fixture; don't count those as 99 independent production conformance cases. The ZIP is a conversation artifact, not a GitHub CI artifact.

Scope: Element/Package dependency closure, Semantic relationship cycles independent from DAG, multi-Function dependencies, lock sensitivity, resources, Provider/Target/required extension checks, one App Init, ingress readiness, intent not Effect permit, stale business state and single-use mocked effect permits, plus prior FakeLLM/Experience/Rule Candidate/Meta simulation. Simulated source truth is not live GitHub; mocked Effect admission doesn't sandbox arbitrary native JavaScript.

Missing: actual DomainHarness KDP/SDK ABI, real LLM, real Domain-Forge AOT, cross-process qualification signatures, crash-safe local Rule Slot, true OS effect policy, statistically independent source sets, Node24, Woodpecker and independent exact-SHA review. See [R3 full review](../../docs/standards/domain-intelligence/DIS-0.2.0/FULL_SCOPE_ADVERSARIAL_REVIEW_R3.zh-CN.md), [design fixes](../../docs/standards/domain-intelligence/DIS-0.2.0/FULL_SCOPE_REPAIRS_R3.zh-CN.md) and [validation narrative](../../docs/standards/domain-intelligence/DIS-0.2.0/FULL_SCOPE_DEMO_SELF_VALIDATION_R3.zh-CN.md).
