# DomainHarness 0.11.x — Standard Element Catalog（首版 R29）

> **CURRENT · R60 Owner 版本归属**：`dh.std.reader.json`、`dh.std.reader.yaml` 的**实际源码与 Consumer 验收归 0.11.1 [#1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) W02，不归 0.11.2**。当前两者仍为未实施候选；仅在受审的两个实际 Element + 两领域消费者之后才晋升 `STANDARD_ACCEPTED`。状态转换模板在 0.11.1 给出真实复用或证据化拒绝的有界决定。旧 #1644 是已撤销的执行入口。

> Catalog 是随单一 Git monorepo 版本演化的资产清单，不是新的服务、运行时注册表或对 BUILD/Lock 的替代。准入规则见 [Standard Element 体系规范](./DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。下列候选没有正式的独立标准包实现，不能在业务代码中当成已合格组件直接依赖。

| ID / 资产 | 版本 / 资格 | 当前来源与真实边界 | 第一个拟消费版本 | 必须实现及证明的条件 |
|---|---|---|---|---|
| `dh.std.reader.json` | `UNASSIGNED · CANDIDATE` | v0.11.1 Demo `basic.rules/jsonReader`；实际 `JSON.parse` 在 KDP `prepareDataInput`，非独立发布 Element | 0.11.1 #1656 W02 | 普通 ElementDefinition + versioned FunctionRef/Package；单一解析语义、选定资源/无任意 Host；2 场景真实消费；JSON 非法/超限/未知负例；Exact-SHA Review |
| `dh.std.reader.yaml` | `UNASSIGNED · CANDIDATE` | v0.11.1 Demo `basic.rules/yamlReader`；真实 parser 为 `yaml@2.9.1` KDP 受信执行，当前 YAML 1.2 core/uniqueKeys 与 `maxAliasCount:32` | 0.11.1 #1656 W02 | 普通 Element/Package + 精确版本 SRI、UTF-8、安全 YAML、严格 JSON-compatible 输出；禁止解析器重复且安全语义漂移；E2E 正反例 |
| `dh.std.workflow.transition` | `UNASSIGNED · CANDIDATE` | v0.11.1 已有受审 `WorkflowDefinition`、Switch 和 KDP XState Actor；通用声明式状态/Transition 模板尚未形成独立 Element | 0.11.1 #1656 W02 有界结论（后续按需消费） | 复用 `state-model` / `workflow-definition` Content、纯 Guard/Transition Function；两个不同业务 Workflow 消费；保留唯一 KDP Actor/路由/预算；若不满足跨域复用则不强制提取 |
| `dh.std.decision.selector` | `UNASSIGNED · CANDIDATE` | 0.11.2 将新增确定性 Rule/Decision 选择，当前无正式标准 Element | 0.11.2 #1612 | 稳定事实/适用范围/证据输入，明确 UNKNOWN/不适用；至少一个真实 Domain Consumer；无领域硬编码 |
| `dh.std.validation.schema` | `UNASSIGNED · CANDIDATE` | 通用输入/输出 Schema 已由 BUILD/Function 合同提供；仅独立于机器边界的**业务级验证规则**值得被提取 | 按需求 | 禁止重新实现 BUILD/KDP Schema 边界校验；只提取可复用业务 Validator |
| `dh.std.interaction.intent` | `UNASSIGNED · CANDIDATE` | 尚未进入 0.11.3，实现前依据真实交互需求确认 | 0.11.3 #1613 | 可复用 typed Intent/clarification Rule，保留本版验证/确认权限 |

## Catalog 维护约束

- **当前正式 `STANDARD_ACCEPTED` 数量：0（本 R29 新增体系尚未提交代码）。** 0.11.1 真实 E2E 已接受不代表标准元素资产自动晋升。
- 每个版本先查 Catalog：能复用时引用已接受的 Element 身份与精确版本，不能复用时说明适用边界；新组件必须有普通 Package Manifest、Target Function 实现、真实 Consumer 与 scoped 审核，之后才可改成 `STANDARD_ACCEPTED`。
- `Element.id` 只是建议的稳定资产命名；真实 namespace/id、版本/digest、Owner、导出/导入关系必须按 0.11.x 合同在实施 PR 中最终定案，禁止凭本表生成虚假的 `ElementRef` 或 Lock。
- `DEPRECATED`/替换需要指明原资产版本、替代资产版本、受影响构建；绝不热更新已封存 Package。
- 不用“统一标准库数量”作为版本放行门；各阶段只交付已被真实功能需要的公共资产。旧源码/复用证明继续保留来源链接，不重复无效 CI。
