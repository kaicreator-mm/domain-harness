# DomainHarness 0.11.x — Standard Element Catalog（首版 R29）

> **【CURRENT · R60 W02 · 仍待合格审核】** [PR #1662](https://github.com/kaicreator-mm/domain-harness/pull/1662) 已将 JSON/YAML 两个具有读写 Function 的普通 ElementDefinition（`dh.std.file.json`、`dh.std.file.yaml`）及对应 ESM Function、精确 Package/Target/Manifest 作为**待审源码**提交，并把 KDP 实际解析改为只读取已封存 UTF-8，Format→JsonValue 交给受选 Reader。原 [#1644](https://github.com/kaicreator-mm/domain-harness/issues/1644) 已改为 0.11.1 [#1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) W02 统一执行。当前状态为 `IMPLEMENTED_CANDIDATE_PENDING_CI_AND_INDEPENDENT_REVIEW`，**不冒充 `STANDARD_ACCEPTED`**；0.11.2 #1612 不再承担其实现。

> Catalog 是随单一 Git monorepo 版本演化的资产清单，不是新的服务、运行时注册表或对 BUILD/Lock 的替代。准入规则见 [Standard Element 体系规范](./DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。下列候选没有正式的独立标准包实现，不能在业务代码中当成已合格组件直接依赖。

| ID / 资产 | 版本 / 资格 | 当前来源与真实边界 | 第一个拟消费版本 | 必须实现及证明的条件 |
|---|---|---|---|---|
| `dh.std.file.json` | `UNASSIGNED · CANDIDATE` | [PR #1662] 两个格式化读写普通 Element 中的 `dh.std.file.json`，已有独立 ESM 实现/Lock 正反例但尚待审核 | 0.11.1 #1656 W02 | 普通 ElementDefinition + versioned FunctionRef/Package；单一解析语义、选定资源/无任意 Host；2 场景真实消费；JSON 非法/超限/未知负例；Exact-SHA Review |
| `dh.std.file.yaml` | `UNASSIGNED · CANDIDATE` | [PR #1662] `dh.std.file.yaml`，解析与序列化归普通 Element，`yaml@2.9.1` 精确 SRI；BUILD 仅保留安全静态准入 | 0.11.1 #1656 W02 | 普通 Element/Package + 精确版本 SRI、UTF-8、安全 YAML、严格 JSON-compatible 输出；禁止解析器重复且安全语义漂移；E2E 正反例 |
| `dh.std.workflow.transition` | `CANDIDATE_NOT_IMPLEMENTED · R60 W02 限定决议` | v0.11.1 已有受审 `WorkflowDefinition`、Switch 和 KDP XState Actor；通用声明式状态/Transition 模板尚未形成独立 Element | 0.11.1 #1656 W02 决策已作、后续按真实需求重新立项 | 复用 `state-model` / `workflow-definition` Content、纯 Guard/Transition Function；两个不同业务 Workflow 消费；保留唯一 KDP Actor/路由/预算；若不满足跨域复用则不强制提取 |
| `dh.std.decision.selector` | `UNASSIGNED · CANDIDATE` | 0.11.2 将新增确定性 Rule/Decision 选择，当前无正式标准 Element | 0.11.2 #1612 | 稳定事实/适用范围/证据输入，明确 UNKNOWN/不适用；至少一个真实 Domain Consumer；无领域硬编码 |
| `dh.std.validation.schema` | `UNASSIGNED · CANDIDATE` | 通用输入/输出 Schema 已由 BUILD/Function 合同提供；仅独立于机器边界的**业务级验证规则**值得被提取 | 按需求 | 禁止重新实现 BUILD/KDP Schema 边界校验；只提取可复用业务 Validator |
| `dh.std.interaction.intent` | `UNASSIGNED · CANDIDATE` | 尚未进入 0.11.3，实现前依据真实交互需求确认 | 0.11.3 #1613 | 可复用 typed Intent/clarification Rule，保留本版验证/确认权限 |

## R60 W02 对 State/Guard/Transition 模板的限定不抽取决议

**两个真实 Consumer 的可复用反例**：`examples/basic-domain-app` 有七个选定 Workflow、父/子 XState Actor、Switch/Root Budget 与两个 File Element；另一真实 `examples/selected-packages` 的 r41 领域 App 仅在 Business Package.Init 调用同一 `dh.std.file.json` Function，并不需要 Workflow/状态转换模型。两者已经真实复用的是**解析 Function 合同**，而不是共享业务事件、状态集合、Guard/Transition 语义。若本轮强制导出一个共同状态模板，只能把业务专属状态空壳化或把唯一 KDP Actor 重写为第二套引擎，既无两个领域的实际迁移目标，也会改变已冻结预算和路由语义。

因此在 **0.11.1 本轮**将 `dh.std.workflow.transition` 判定为 `CANDIDATE_NOT_IMPLEMENTED`；不是“功能实现后移 0.11.2”，而是**不实施无实际跨域复用证据的抽取**。保留既有 KDP Actor/Transition 机制；若未来另有两个具备相同稳定 Guard/状态模型的真实 Domain Consumer，必须单独证明其状态语义等价后才可提升此 Candidate。不可仅因本条决策就判定 Standard File Element 已验收。

## Catalog 维护约束

- **当前正式 `STANDARD_ACCEPTED` 数量：0（本 R29 新增体系尚未提交代码）。** 0.11.1 真实 E2E 已接受不代表标准元素资产自动晋升。
- 每个版本先查 Catalog：能复用时引用已接受的 Element 身份与精确版本，不能复用时说明适用边界；新组件必须有普通 Package Manifest、Target Function 实现、真实 Consumer 与 scoped 审核，之后才可改成 `STANDARD_ACCEPTED`。
- `Element.id` 只是建议的稳定资产命名；真实 namespace/id、版本/digest、Owner、导出/导入关系必须按 0.11.x 合同在实施 PR 中最终定案，禁止凭本表生成虚假的 `ElementRef` 或 Lock。
- `DEPRECATED`/替换需要指明原资产版本、替代资产版本、受影响构建；绝不热更新已封存 Package。
- 不用“统一标准库数量”作为版本放行门；各阶段只交付已被真实功能需要的公共资产。旧源码/复用证明继续保留来源链接，不重复无效 CI。


### R69 · Standard File 双向纯格式合同（0.11.1 #1656 W02）

`dh.std.file.json` / `dh.std.file.yaml` 各包含 read / write 两种 Function，实际函数名分别为 `readJson`、`writeJson`、`readYaml`、`writeYaml`。写入在本受限 Node SDK Profile 下**表示纯序列化为 UTF-8 文本**，不直接拥有磁盘或网络写入 Effect；未来持久化只能经显式授权的 ResourceSink/Effect，不作为本次 Writer 的隐式能力。Node 内置 JSON API 与 SRI 锁定 `yaml@2.9.1` 承担格式算法，额外 JsonValue/字节/深度/YAML 安全约束保持 fail-closed。Consumer 仅声明所使用的精确 FunctionRef；待新 Exact-SHA CI + 独立审核通过后才准晋升 `STANDARD_ACCEPTED`。
