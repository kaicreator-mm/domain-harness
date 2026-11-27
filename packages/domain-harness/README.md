# DomainHarness SDK

Language-native Domain SDK for TypeScript and Node.js. Node >=22.12.0; one public package root, no legacy runtime or loader. This is an internal 0.11.x stage artifact, not a release. Use the exact supplied SDK archive and SHA256; the internal npm version remains 0.11.2 until release coordination, so version text alone cannot identify a stage. Do not infer npm registry availability.

```sh
npm install --ignore-scripts ./sdk.tgz
```

```ts
import { JsonReader } from '@kaicreator/domain-harness';
const result = new JsonReader().read('{"name":"alpha"}');
if (result.kind === 'SUCCEEDED') console.log(result.value);
```

## 使用 Skill

安装后从 [skills/domain-harness-spec/SKILL.md](skills/domain-harness-spec/SKILL.md) 开始。让 Agent 读取该文件，再按需要读取其本地能力及成员目录、指南、示例和权威规范快照；npm install 不自动向任何 Agent 注册 Skill。公开代码从包根导入，Skill 是文件系统文档而不是 JS 子路径。完整目录由真实声明生成，不需访问私有仓库才能使用 SDK。示例的业务正确性、授权、资源及适用环境仍由应用负责。


### XState 直接消费

SDK-only 应用只安装本 SDK。需要直接 import xstate 构建原生 actor 的应用，须复制本包 `vendor/xstate-5.33.2-dh.1.tgz` 到自己的 `vendor/`，声明 `"xstate": "file:vendor/xstate-5.33.2-dh.1.tgz"`，再执行 npm 安装和锁定。该兼容工件只修正上游两处声明及版本标识，SDK 内置的 XState 与 companion 同字节；详细来源、许可、完整性和退出条件见 `vendor/README.md` 和 `vendor/xstate-provenance.json`。不依赖安装脚本或消费者修改依赖。当前实际安装验收使用 npm。

## Workflow-first domain reasoning
- 固定非模型：受控 `StandardWorkflowSession`、`root.node`、真实前置/后置与根目标验证。
- 动态：`createWorkflowSlot`、`bindWorkflowFunction`、`bindWorkflowRegion`、`runWorkflowRegion` 使用显式可信能力和类型化输入输出；模型不是前置要求。
- 可选模型：`ModelElement` 仅在同根有限调用内产生提案；领域负责安全投影、真正 Tool 执行、专业校验和授权。不是 Agent Runtime 或持久恢复。
- 先读 [Workflow 指南](skills/domain-harness-spec/references/capabilities/workflow.md) 和 [受控区域示例](skills/domain-harness-spec/references/examples/managed-region.mts)，完整根及成员目录见 [API](skills/domain-harness-spec/references/capabilities.md)。实际候选和最终裁定分离；不要把模型输出、传输 ACK 或 UNKNOWN 当成业务成功。
