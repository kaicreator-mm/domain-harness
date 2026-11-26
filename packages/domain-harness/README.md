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


### XState 直接消费

SDK-only 应用只安装本 SDK。需要直接 import xstate 构建原生 actor 的应用，须复制本包 `vendor/xstate-5.33.2-dh.1.tgz` 到自己的 `vendor/`，声明 `"xstate": "file:vendor/xstate-5.33.2-dh.1.tgz"`，再执行 npm 安装和锁定。该兼容工件只修正上游两处声明及版本标识，SDK 内置的 XState 与 companion 同字节；详细来源、许可、完整性和退出条件见 `vendor/README.md` 和 `vendor/xstate-provenance.json`。不依赖安装脚本或消费者修改依赖。当前实际安装验收使用 npm。
