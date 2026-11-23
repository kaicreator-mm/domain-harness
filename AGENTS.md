# DomainHarness · 开发与 Agent 入口

**当前版本（R161）**：v0.11.x 为完全重写，原生 SDK v0.11.1 源码已在受审 PR #1694 合入 `version/v0.11.x@452e2212fb8a25168ee62d4e793897d77416cb92`；R151 整树审查的 2 P1/5 P2 经 R160 `ACCEPT_SCOPED P0/P1/P2=0` 关闭，Woodpecker #3151 属于已审 PR Head `0477edf9070c05ec3c89c46fb1aaa43cf2f850a3`，合并树无额外文件变动。Windows 实机 E2E 和恰好 Node 22.12 消费者运行未单独验证。0.11.x 各内部阶段不单独发行；尚未合并 main/创建正式 Release。无 0.10.x 兼容义务。

**唯一规范入口**：[目录](docs/specs/domain-harness/README.md) → [核心](docs/specs/domain-harness/core.md) → [TypeScript Profile](docs/specs/domain-harness/typescript-profile.md) → 按任务读取相应细则。Agent 从 [domain-harness-spec Skill](.agents/skills/domain-harness-spec/SKILL.md) 进入；Skill 不复制规范正文。

1. Package 是静态 ESM 插件模块集合；Element 是一个内聚 Class；Function 是普通模块函数/方法。Kernel、SDK、Domain App 统一使用这套模型，Business 优先复用 SDK 内置的 Standard Elements。
2. 元数据（例如 Core.Order）是框架直接读取的可执行代码。TSDoc/JSDoc 与 Skill 是 Agent/开发者说明。KDP Order=0；生成期检查 Order 唯一；没有 Init/Exit 的 Package 跳过。
3. **静态可信**：普通 TypeScript `import/export` 与 npm 直接依赖；不新增 SDK 运行时 Lock/Pin、FunctionRef/Target、权限源码验证或自定义 PackageSystem 加载器。安装可信性、Package/Element 正确性由生成/交付方负责。运行时 KDP 仅协调生命周期与未处理异常日志/退出 Hook。
4. 源码/测试修改前读 [工程质量规范](docs/specs/domain-harness/engineering-quality.md) 与 [TypeScript 质量 Skill](.agents/skills/typescript-quality/SKILL.md)；生成期运行语法、类型、Lint 和受影响测试。普通 TS/Node/成熟第三方库优先，Standard 是应用级抽象而非每个 Node API 的包装。
5. TS 源码与路径使用稳定语义名，代码注释/JSDoc 使用中文、内容与当前代码一致。具体命名读 [命名规范](docs/specs/domain-harness/identity-naming.md) 和 [domain-naming Skill](.agents/skills/domain-naming/SKILL.md)。
6. **历史 PRD/L2、旧 Boot/KDP L2 和旧工具源码不得凌驾于新 Canonical Spec**；#1668、#1682 已按 Owner #1685 的新实施 L2 完成源码交付；后续阶段不得复活历史 ABI。不能把旧 L2 中的 Lock/Pin/PackageSystem 复活，也不得以 docs-only 修改断言新源码 PASS。
7. GitHub Exact SHA 是事实源；本地等价验证优先，真实必要 CI 使用 Woodpecker；失败依据实际日志定位根因。独立 Reviewer 限定审核变更 HEAD，禁止持续本地 Agent 任务和把 v0.11.1 Foundation 负债转移给 0.11.2。
