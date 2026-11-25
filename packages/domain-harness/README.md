# DomainHarness SDK

Language-native Domain SDK for TypeScript and Node.js. Node >=22.12.0; one public package root, no legacy runtime or loader. This is an internal 0.11.x stage artifact, not a release.

```sh
npm install @kaicreator/domain-harness
```

```ts
import { JsonReader } from '@kaicreator/domain-harness';
const result = new JsonReader().read('{"name":"alpha"}');
if (result.kind === 'SUCCEEDED') console.log(result.value);
```

## 使用 Skill

安装后从 [skills/domain-harness-spec/SKILL.md](skills/domain-harness-spec/SKILL.md) 开始。让 Agent 读取该文件，再按需要读取其本地能力及成员目录、指南、示例和权威规范快照；npm install 不自动向任何 Agent 注册 Skill。公开代码从包根导入，Skill 是文件系统文档而不是 JS 子路径。完整目录由真实声明生成，不需访问私有仓库才能使用 SDK。示例的业务正确性、授权、资源及适用环境仍由应用负责。
