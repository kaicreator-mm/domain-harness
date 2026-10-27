# Public Meta reuse consumer / 公共 Meta 能力复用

Issue #1415 concludes **KEEP_EXISTING**: selected meta-feedback/candidate-validation
features plus the public `@kaicreator/domain-harness-host-node` root already cover
this example. No production ABI, shared export, manifest or Meta Kernel changes.

Run from the repository root with Node 24 and built workspace packages:

```sh
node --import tsx --test tests/hosts/node/v0103-meta-reuse-consumer.test.ts
```

The test packs four packages, installs them into an isolated consumer and copies
this unchanged consumer file plus approved Domain Package source payloads. Every
SDK import resolves via a declared installed package export, outside the source
repository. A private Host deep import is explicitly refused by the export map.

The consumer exercises real selected K receipts, bounded candidate validation,
Host `runShadowL4` and public `runMetaFeedbackWorkflow`. Shadow proves zero writes
against an example in-memory store witness. Caller-reported candidate comparisons
are kept separate from that Host shadow evidence. Workflow proposals cannot apply
or approve themselves; replay does not add another state revision. A separate
synthetic trusted operator callback can approve the exact candidate/shadow/current
identity before producing a different immutable future BUILD. The old activation
and its state/pin stay unchanged. This is an executable authority-boundary example,
not a claim that a real human or production deployment approved anything.

The optional task-meta adapter is illustrative, not a published task-meta schema.
It accepts only the exact Host deployment/tenant/App/Business scope and bounded
source-revision/evidence-digest metadata; prompts, keys and raw errors are not
copied. Invalid scope/provenance is refused before the observation turn. Existing
Host validation rejects authority injection and foreign evidence keys.

No paid Provider call, automatic promotion, SQLite durability or release
qualification is proven. The test reports its concrete in-memory/Node24 tuple.

中文：真实安装后的公共 Host 根入口和已选 S 能力可以复用，无需新增 Meta 框架。
证据产生候选，候选验证与只读 Shadow 仍无执行权，工作流只返回待审核提议。
测试中的合成操作者批准必须绑定精确身份，之后才另建未来 BUILD；旧实例不热切换。
跨作用域证据、授权注入和伪造来源会拒绝，敏感原文不进入观察。该示例不代表真实
人工批准、生产晋升、SQLite 持久化或版本发布通过。
