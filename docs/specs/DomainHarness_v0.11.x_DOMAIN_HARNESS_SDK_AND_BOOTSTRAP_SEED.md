# DomainHarness v0.11.x — Domain、Harness、SDK 与直接编写 Package 文件（R36）

> **Owner R36 修正 R34/R35 的工具化假设**：Domain Package 只是符合 DIS 适用 Package 规范与当前 Element-First 合同的一组文件，完全可以由 ChatGPT 在仓库中直接编写。**Seed Builder 不再是需要开发的工具，Package Assembly 也不是创建 Package 的必要环节**。细节见 [R36 产品与 Package 权威规范](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。

```ini
OUTPUT_LABEL=DH_V011X_R36_THREE_NAMES_DIRECT_AUTHORED_PACKAGE
PRODUCT=DOMAIN_HARNESS_SDK
DOMAIN=BOUNDED_DOMAIN_SEMANTICS
HARNESS=BOUNDED_EXECUTION_CONTROL
SDK=REUSABLE_PACKAGE_BOOT_AND_EXECUTION_API
PACKAGE=MANIFEST_ELEMENTS_IMPLEMENTATIONS_AND_RESOURCES_FILES
WRITER=HUMAN_OR_CHATGPT_OR_AGENT_OR_FUTURE_FORGE
GENERATOR_REQUIRED=FALSE
SEED_BUILDER_REQUIRED=FALSE
ASSEMBLY_REQUIRED_FOR_PACKAGE_CREATION=FALSE
VALIDATION_REQUIRED=TRUE
DOMAINFORGE=DEFERRED_NOT_BLOCKING
```

## 1. 三个名字及最终产品

**Domain** 表示业务领域的知识、事实、规则、约束与适用范围；**Harness** 是使用所选 Domain 完成 Task、Workflow/状态/授权/反馈的执行支架；**SDK** 是使用相同 Boot、Domain Packages、Function/Element/Package Contract 和公开 API 来搭建不同领域应用的可复用开发工具包。

**DomainHarness SDK** 本身不是独立的 Package 生成器。它可由 Boot + 若干基础/标准/领域 Domain Packages 组成，其余应用也复用这个相同模式。0.11.0–0.11.9 是交付这一个 SDK 的内部阶段，不是生产多个不同产品。

## 2. Domain Package 的文件构成

最简形式是 **一份规范 Manifest + 必要的 Element Definitions + 被引用的内容/函数实现/资源文件**。根据实际 Package 合同决定文件数量与类型，不规定必须有多少文件、必须使用某个模板目录、必须是工具产物。当前的 `packages/contracts/src/package-manifest.ts::DomainPackageManifest` 已含：
- Package 的 `kind/schemaVersion/id/version/layer/role`、Elements、显式 `dependsOn/imports/exports`、Target 绑定，以及所拥有的 Init 和可选 Exit Element；
- `ElementDefinition` 和 Function/Content/Schema 的合法引用、`ResourceRef` 所属 Package、相对路径、内容摘要；Target Function 的真实文件/静态导出与引用吻合；
- Core.Order 唯一且 KDP 为 0；跨 Package 访问遵守已声明直接 Extension；实际必须满足 Package 合同及目标运行环境。

**Manifest 可以由 ChatGPT 手工填写，ESM 和各类 Element/资源文件也可以由 ChatGPT 手工编写。** 将这些文件提交仓库之后，该 Package 就作为现成 Package 候选存在，无需另一套生成/重新“组包”的处理。真正的质量验收要看文件、引用、静态权限与真实 Boot/Consumer，不看生成者是谁。

当前的 DIS/AOT/SDK 适用 Package 规范应作为设计与合规检查依据；同时必须符合 **本 0.11.x 已生效的 Element-First 合同**。DIS 研究 Demo 的资格和 Full Conformance 状态并不会因手工 Package 结构合格而自动晋升。

## 3. 构建 SDK/Domain App，不等于“生成 Package”

```text
[直接编写的 Package A 多个文件] ─┐
[直接编写的 Package B 多个文件] ─┤
[已有标准 Package 文件] ────────┤
                                ↓
          确定需要的 Package / 依赖 / Target
                  （验证真实引用与权限）
                                ↓
            Boot → KDP → 已选 Packages
                                ↓
               DomainHarness SDK / Domain App
```

**确定选用的多个 Packages 是应用组合行为**，它可以由已有 manifest/配置和 SDK 代码完成。它不是“生成一个新的单 Package”的必要条件，更不要求开发专用 Assembly Service、Compiler 或 Build Pipeline。没有需要组合的新包时，也没有理由安排多余的 Assembly 工作。

若现有运行/安装形式要求 Lock/Pin、完整性、直接 Extension 静态校验，依旧沿用受审的必要验证和启动代码；**取消生成器的要求不等于取消安全门**。

## 4. DH 自身的启动与持续演化

第一代基础 Packages 可以直接由 ChatGPT 在 DomainHarness 仓库中编写；在必要的验证与 Boot 过程后得到 SDK。后续需要修改或新增 DomainHarness Package 时，也直接编辑其真实文件，经相同的 Package 合同验证并在 SDK 上运行。这样就能以一套 Package/Boot 模型持续构成下一代 SDK，不需要证明“生成工具能够生成自己”。

既有 [#1647](https://github.com/kaicreator-mm/domain-harness/issues/1647) 已调整为**直接编写基础 Domain Package 文件**的有限任务，撤销研发 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/` 工具的要求。

**Forge** 当前不可用，不参与 DomainHarness v0.11.x 开发或验收。未来基于完成的 SDK 开发后，它可能大规模创作 Package，但不会改变“Package 的身份只取决于实际文件及规范”的规则。唯一说明 Issue 为 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)。

## 5. 每个 0.11.x 版本共用的检查

新增 Package 时检查 **实际文件与 DIS/0.11.x 合同**；新增 SDK 行为时检查是否可由 Boot+Packages 表达并对外复用；有新的应用组合时检查 Target/依赖/权限与实际运行；**不得增加“必须经某生成器/Seed Builder/独立 Package Assembly”的前置**。

所有完成结论仍以实际源码文件、有效测试、Exact HEAD 和必要独审为准；文档修正不是源码完成收据。
