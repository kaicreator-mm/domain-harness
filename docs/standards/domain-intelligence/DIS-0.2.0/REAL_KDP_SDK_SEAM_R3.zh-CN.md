# DIS v0.2.0 — 真实 KDP/SDK 与原生 Effect Gate 的 Demo 优先验证（R3 补充）

**级别：Product/L1 与有界实际源码消费 Demo**，不是声称新 DIS 0.2.0 已具有正式 SDK ABI。权威 #1496 / Draft PR #1497。

## 1. 本次确实复用的现有真实实现

- `domain-packages/kernel/basic/kernel-mechanism-v1.mjs`：现有 KDP 机制与 `createOccurrenceRuntime`，**不是**重新造一个 R3 Mock Kernel。
- `packages/microkernel/dist/index.js`：公开 SDK `load(app, options)` Facade。
- `packages/microkernel/dist/internal/external-effect.js`：真实受信任 Host Effect Gate；最终 Effect 许可由**已选择的 K 模块** `readEffectAuthorityView` 判断；Host 不能自己伪造镜像权限。
- 现有 `tests/assembly/v010-c01-external-effect.test.ts`：真实 BUILD→已选 K→Admission→Journal→Permit→Gate→Adapter 的既有全链路证据源，接入独立的 DIS 0.2.0 Demo Woodpecker 流程。

此处跨标准的映射是 `DIS Function/Effect 描述 → 现有 selected K/SDK 执行路径` 的**消费可行性映射**。现有 Kernel 语义是旧 v08/v0.10 机制，不能直接称为最终 DIS 0.2.0 Element/Function/AOT/Init ABI。R3 的独立演进 Slot、正式 App Init 等仍需单独实现和构建验证。

## 2. Gate 的源级对抗验证（已执行）

取真实代码 `packages/microkernel/dist/internal/external-effect.js` 的 Git blob `4e76f700769eb24ff15cbcb0dfd0e6f696fe3ad2`，在隔离 V8 环境里执行原函数（仅替换 Contracts 类 import，使用语义等价的 `isPlainRecord` 和 typed error 测试壳），验证以下 8 项：

1. 拒绝非法 Envelope；
2. 允许合法 terminal Envelope；
3. accepted 不可携带已完成 Outcome；
4. 没有 K-issued Attestation 必须拒绝，0 Adapter Dispatch；
5. 没有 selected K authority view 必须拒绝，0 Dispatch；
6. K Authority Refused 不可向 Adapter 派发；
7. K Authority Granted 才能派发；
8. bound `awaitPolicy=terminal` 的 `accepted` 不能成为成功，Adapter 已派发则不伪造 pre-handler 零副作用证明。

**8/8 自测通过**；这只验证当下 Gate 的真实源码逻辑，未验证 Node 包解析、真实持久 K 状态或物理 I/O。新仓库 Demo 直接 import 原模块而不是重写函数，其 Temp File 测试需要在完整仓库/CI 中执行。

## 3. 原生 Effect 安全边界的修复决策

- **已能用真实代码证明的**：原始 K/Host Gate 在缺少 live Authority View 或明确拒绝时不调用 Adapter；同步接受 ACK 不会被解释为终态；Adapter 派发后 UNKNOWN 不得声称零副作用。
- **仍然缺少的**：如果任意不可信扩展代码本身获得无限 Node 原生 `fs/net/process` 权限，任何仅包在正常 API 外面的 Gate 都不能阻挡其旁路访问。这个问题**不是**通过增加一层 Script Mock 或允许 LLM 生成 JS 就能修复。正式实现需要可信代码闭包/系统隔离或严格的能力型执行沙箱。
- 对没有上述 Host 物理保护能力的 Target，`LLM Function Candidate` 保留在数据级 `RULE_DATA / Shadow`，**绝不被当作原生代码直接加载**。任何改权限/依赖/原生 API 必须走新 Package AOT+真实权限治理。
- 所有测试 I/O 只落临时目录；禁止测试中真实设备/用户目录/业务写入。

## 4. Node 与 Woodpecker

单独添加 Demo 专用 `.woodpecker/dis-v020-integration.yaml`：不检查特定 Node 大版本，直接以实际所分配的 Worker 版本运行；失败再以实际不兼容 API/依赖修复。**不改动既有** v0.10 历史发布流程及其 Node24 硬门禁，以免把文档版 DIS 改动扩大成旧版生产兼容性声明。

Demo pipeline 需依次运行：`npm ci`、`npm run build`、原模块 import/临时文件 Effect Gate Node 测试、现有 C01 全 KDP assembly regression。Woodpecker 实际服务回执和 Host 物理沙箱测试 **尚待 CI 运行确认**。

## 5. 下一阶段剩余工作

最重要的是在真实仓库中落地 Element/Function → selected build manifest/AOT mappings，生成有唯一 App Init 的可运行 Package，并用 **实际 KDP/SDK ABI** 实验；然后做进程崩溃/并发/重放、权限旁路、原子 Slot 更新/回滚。若没有跨进程与 Host 权限证据，**不要将风险 F02 P0 标为生产验证 CLOSED**。

## 6. R3.2 原生旁路对抗 Demo（Feature-first / 不锁定 Node 大版本）

新增 `examples/dis-v020-sdk-integration/native-isolation.test.mjs` 和 `dis-native-isolation-worker.mjs`。第一个场景用未隔离的子进程绕过 Library Gate，尝试直接 `fs.writeFileSync` 覆盖**临时目录内**的受保护文件，证实单靠 Host Gate 无法封堵原生旁路。第二个场景在**特性探测**成功的情况下使用 Node `--permission` 将子进程限制在受控只读源和只写 scratch；同样的直写/读取被 `ERR_ACCESS_DENIED` 拒绝，受控 scratch 写入成功。第三个场景验证默认不允许 child-process 派生。这不是攻击真实设备，也不对真实用户目录操作。

在本次本地 Node v22.16.0 上运行 **3/3 PASS**。没有要求特定 Node 版本：若目标 Worker 不支持所需权限特性，对应测试应标记 SKIP，生产隔离门禁记录 `NOT_VERIFIED`，绝不能把普通 CI SUCCESS 当作物理隔离 PASS。Node permission 是**受限演示机制**，并非对恶意 Node native addons、任意进程外逃或实际 OS 权限模型的通用安全证明。正式 F02 P0 仍需真实 Target 信任根、闭合加载/原生模块策略和独立安全验证。

相关用例追加到 `.woodpecker/dis-v020-integration.yaml`，与前述真实 KDP/SDK C01 回归同一验证 lane。

### R3.2a 按能力而非按 Node 主版本准入

对抗复核发现：如果隔离特性不存在，原测试以 SKIP 终止而整条 CI 仍可绿，容易被误认为生产隔离 PASS。现给专用 Woodpecker 流水线传入 `DIS_REQUIRE_CONFINEMENT=1`，要求隔离特性存在、正反边界测试实际执行，未支持则此专项门禁失败。**没有限制 Node 精确或主版本**。严格模式在本地测试为 4/4 PASS（包括特性必需断言），具体生产级 OS 沙箱/任意 Native Addon 保护仍然 OPEN。
