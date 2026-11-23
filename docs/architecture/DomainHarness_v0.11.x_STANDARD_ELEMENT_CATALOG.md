# DomainHarness 0.11.x — Standard Element Catalog（首版 R29）

> **HISTORICAL / SUPERSEDED BY Language-Native DomainHarness**：本文记录旧 Element-First/Lock/Pin/FunctionRef/Target/BUILD 设计及当时 Exact-SHA 审查，只供历史追溯；**不是当前 v0.11.1 SDK 的规范、API、安装方式或新功能准入证明**。
现行唯一规范见 [Canonical](../specs/domain-harness/README.md)。当前 Standard Reader、Workflow 与 KDP 以 [#1682](https://github.com/kaicreator-mm/domain-harness/issues/1682) 的新 SHA 源码与消费者验收为准；旧 R60/R74 的 CURRENT 仅对应其原时间点。


> **【CURRENT · v0.11.1 R74 · 已受审合入版本列车】** [Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) 的普通标准 File Element `dh.std.file.json` / `dh.std.file.yaml` 已在 [集成 PR #1663](https://github.com/kaicreator-mm/domain-harness/pull/1663) 按已审 HEAD `030032416c684d066daa1f8c5a2e50d60c41c779` squash 合入 `version/v0.11.x@9f53c6e17d7a854fb57b2e1232702af15e6defe8`。独立 [R72 ACCEPT_SCOPED P0=0/P1=0/P2=1](https://github.com/kaicreator-mm/domain-harness/pull/1663#pullrequestreview-6012506153)，[Woodpecker #2979](https://ci.kaicreator.com/repos/18/pipeline/2979/1) 同 Exact-SHA SUCCESS。**以下两项正式获准 `STANDARD_ACCEPTED`，仅限本版 Node22 ESM Target 和实际受选 Package/Lock/Consumer，不表示已经正式 npm Release、任意语言运行时或全生态发布。** 原 [#1644](https://github.com/kaicreator-mm/domain-harness/issues/1644) 实施责任由本版 #1656 完成，0.11.2 #1612 不承接此 File Element 提取。

> Catalog 是随单一 Git monorepo 版本演化的资产清单，不是新的服务、运行时注册表或对 BUILD/Lock 的替代。准入规则见 [Standard Element 体系规范](./DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。仅标记为 `STANDARD_ACCEPTED` 且与受选目标、版本及 FunctionRef 一致的资产才有已审实现可供复用；其他条目继续是候选，不能当作已合格组件依赖。

| ID / 资产 | 版本 / 资格 | 当前来源与真实边界 | 第一个拟消费版本 | 必须实现及证明的条件 |
|---|---|---|---|---|
| `dh.std.file.json` | **`1.0.0 · STANDARD_ACCEPTED`**（Node22 ESM） | 普通 Package `r60-standard-files@1.0.0`，定义 `definitions/json-file.json`，受选 `readJson/writeJson` FunctionRef，原生 JSON API；真正业务语义解析不在 KDP；Writer 纯格式序列化，不拥有 Host 文件写权 | **0.11.1 #1656 W02 已实现并受审** | R69 完整验收 + R72 增量 ACCEPT_SCOPED，真实 T14 和第二 r41 Domain Consumer、Lock/Pin/权限与负例，CI #2979 SUCCESS；保持显式选用 |
| `dh.std.file.yaml` | **`1.0.0 · STANDARD_ACCEPTED`**（Node22 ESM） | 同一普通 Package `r60-standard-files@1.0.0`，定义 `definitions/yaml-file.json`，受选 `readYaml/writeYaml` FunctionRef，精确 `yaml@2.9.1` + SHA512；YAML 1.2 core / strict / uniqueKeys / maxAliasCount:32 | **0.11.1 #1656 W02 已实现并受审** | 双 Domain App 实际 YAML Reader/Writer、SRI/资源篡改、UNKNOWN/FAILED、大小及越权负例；#1663 + R72 + CI #2979；Writer 不隐式持久化 |
| `dh.std.workflow.transition` | `CANDIDATE_NOT_IMPLEMENTED · R60 W02 限定决议` | v0.11.1 已有受审 `WorkflowDefinition`、Switch 和 KDP XState Actor；通用声明式状态/Transition 模板尚未形成独立 Element | 0.11.1 #1656 W02 决策已作、后续按真实需求重新立项 | 复用 `state-model` / `workflow-definition` Content、纯 Guard/Transition Function；两个不同业务 Workflow 消费；保留唯一 KDP Actor/路由/预算；若不满足跨域复用则不强制提取 |
| `dh.std.decision.selector` | `UNASSIGNED · CANDIDATE` | 0.11.2 将新增确定性 Rule/Decision 选择，当前无正式标准 Element | 0.11.2 #1612 | 稳定事实/适用范围/证据输入，明确 UNKNOWN/不适用；至少一个真实 Domain Consumer；无领域硬编码 |
| `dh.std.validation.schema` | `UNASSIGNED · CANDIDATE` | 通用输入/输出 Schema 已由 BUILD/Function 合同提供；仅独立于机器边界的**业务级验证规则**值得被提取 | 按需求 | 禁止重新实现 BUILD/KDP Schema 边界校验；只提取可复用业务 Validator |
| `dh.std.interaction.intent` | `UNASSIGNED · CANDIDATE` | 尚未进入 0.11.3，实现前依据真实交互需求确认 | 0.11.3 #1613 | 可复用 typed Intent/clarification Rule，保留本版验证/确认权限 |

## R60 W02 对 State/Guard/Transition 模板的限定不抽取决议

**两个真实 Consumer 的可复用反例**：`examples/basic-domain-app` 有七个选定 Workflow、父/子 XState Actor、Switch/Root Budget 与两个 File Element；另一真实 `examples/selected-packages` 的 r41 领域 App 仅在 Business Package.Init 调用同一 `dh.std.file.json` Function，并不需要 Workflow/状态转换模型。两者已经真实复用的是**解析 Function 合同**，而不是共享业务事件、状态集合、Guard/Transition 语义。若本轮强制导出一个共同状态模板，只能把业务专属状态空壳化或把唯一 KDP Actor 重写为第二套引擎，既无两个领域的实际迁移目标，也会改变已冻结预算和路由语义。

因此在 **0.11.1 本轮**将 `dh.std.workflow.transition` 判定为 `CANDIDATE_NOT_IMPLEMENTED`；不是“功能实现后移 0.11.2”，而是**不实施无实际跨域复用证据的抽取**。保留既有 KDP Actor/Transition 机制；若未来另有两个具备相同稳定 Guard/状态模型的真实 Domain Consumer，必须单独证明其状态语义等价后才可提升此 Candidate。不可仅因本条决策就判定 Standard File Element 已验收。

## Catalog 维护约束

- **当前正式 `STANDARD_ACCEPTED` 数量：2**（`dh.std.file.json@1.0.0`、`dh.std.file.yaml@1.0.0`），证据为 v0.11.1 #1663 已合入 Train + R69 源码范围审核 + R72 限定独审 P0/P1=0 + Exact-SHA CI #2979 SUCCESS；其他资产均不自动晋升。
- 每个版本先查 Catalog：能复用时引用已接受的 Element 身份与精确版本，不能复用时说明适用边界；新组件必须有普通 Package Manifest、Target Function 实现、真实 Consumer 与 scoped 审核，之后才可改成 `STANDARD_ACCEPTED`。
- `Element.id` 只是建议的稳定资产命名；真实 namespace/id、版本/digest、Owner、导出/导入关系必须按 0.11.x 合同在实施 PR 中最终定案，禁止凭本表生成虚假的 `ElementRef` 或 Lock。
- `DEPRECATED`/替换需要指明原资产版本、替代资产版本、受影响构建；绝不热更新已封存 Package。
- 不用“统一标准库数量”作为版本放行门；各阶段只交付已被真实功能需要的公共资产。旧源码/复用证明继续保留来源链接，不重复无效 CI。


### R69 · Standard File 双向纯格式合同（0.11.1 #1656 W02）

`dh.std.file.json` / `dh.std.file.yaml` 各包含 read / write 两种 Function，实际函数名分别为 `readJson`、`writeJson`、`readYaml`、`writeYaml`。写入在本受限 Node SDK Profile 下**表示纯序列化为 UTF-8 文本**，不直接拥有磁盘或网络写入 Effect；未来持久化只能经显式授权的 ResourceSink/Effect，不作为本次 Writer 的隐式能力。Node 内置 JSON API 与 SRI 锁定 `yaml@2.9.1` 承担格式算法，额外 JsonValue/字节/深度/YAML 安全约束保持 fail-closed。Consumer 仅声明所使用的精确 FunctionRef；**R72 已审且 #1663 已合入版本 Train**，因此上表的两个 Element 正式成为仅面向已审 Node22 ESM Profile 的 `STANDARD_ACCEPTED`。

## R74 · 标准 File 资格证据与剩余能力边界

- **准确身份**：`r60-standard-files@1.0.0` 的 public `dh.std.file.json@1.0.0` / `dh.std.file.yaml@1.0.0`，各两个 `contractVersion:1` Functions；受选 ESM Target 模块 `dist/index.mjs` 的封存 SHA256 为 `f9aa851c424021ac2106cb5efe1eb85698547e75b4cb09fc2b4c032b0d7ca901`（R72 独立计算与全部六项 Manifest bindings 匹配）。**引用资产必须匹配实际 Manifest/ElementDefinition Digest 和所选 Lock**，不凭本表字符串授权或自动加载。
- **最小合法消费**：在同一 Node22 ESM Domain App 内显式选择 Package/直接 Extension + 精确 FunctionRef；KDP 只做资源权限、字节/UTF-8、Lock、任务路由和兜底；选中的普通 Standard File Element 才做格式解析和序列化。格式结果不直接写磁盘、云存储或网络，需要独立授权的 sink/Effect。
- **实证链接**：[单 SDK Registry + 七个真实 T14 Workflows + SRI 篡改拒绝](https://github.com/kaicreator-mm/domain-harness/blob/030032416c684d066daa1f8c5a2e50d60c41c779/scripts/verify-single-sdk-registry-install.mjs#L204-L274)、[第二领域精确 Writer FunctionRef 和缺失授权负例](https://github.com/kaicreator-mm/domain-harness/blob/030032416c684d066daa1f8c5a2e50d60c41c779/packages/domain-harness/tests/core/static-authored-packages.test.ts#L201-L304)、[R72 结论](https://github.com/kaicreator-mm/domain-harness/pull/1663#pullrequestreview-6012506153)、[CI #2979](https://ci.kaicreator.com/repos/18/pipeline/2979/1)。
- **R72 唯一非阻塞 P2**：Writer 对非受信任、极端大对象的 `Object.entries(value)` 可能在逐节点预算判断之前创建大量临时属性条目。现有节点/输入估算预算与实际 UTF-8 输出 1MiB 上限只在受限选定 Node 运行 Profile 下受审；**不宣称任意巨型 JS 对象的严格预分配内存/CPU 上界或通用恶意代码沙箱**。将来若要求这个更强属性，需替换为可证明有界迭代并补 many-key 压力负例；不影响 R72 当前 P0/P1=0 的受审资格，不将本版必须实现的 File Element 留给 0.11.2。
