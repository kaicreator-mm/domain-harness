# DIS 0.2.0 — App Init Contract R1（两层初始化）

**状态：Product/L1 提议；不是 KDP 或 SDK 已实现接口。** 关联 #1496、Boot/KDP #1484。

## 1. 权威分离

- **第一层技术初始化**：Boot 启动 KDP；KDP 管理 Package DAG 的 resolve/verify/bind、按依赖序执行 KDP 内部、SDP 和 Business Package 技术初始化与资源就绪。KDP 不能要求 SDP 已就绪才能独立自举。
- **第二层业务初始化**：当所需 Package 完成技术 READY 后，KDP 对 Domain App 描述符已锁定的**唯一** App Init Element 调用 \`init(context)\`。它建立当前 App 的业务服务、状态协调和受约束的 ingress 准入。
- 两层不能形成两个并行生命周期引擎；业务状态不能因此自动归 KDP/SDK State，Package init 也不能假装是业务 READY。

## 2. 逻辑签名与 Context

~~~typescript
type AppInit = (context: AppInitContext) => Promise<AppInitResult>;

interface AppInitContext {
  appIdentity: string;
  activationIdentity: string;
  buildPin: string;
  config: Readonly<unknown>;
  bindings: Readonly<SelectedFunctionCatalog>; // 仅已锁定可用集合
  lifecycle: { mode: 'fresh' | 'restart'; attemptId: string };
}
type AppInitResult =
  | { status: 'READY'; evidenceRefs?: string[] }
  | { status: 'DEGRADED'; unavailableOptionalServices: string[]; evidenceRefs?: string[] }
  | { status: 'BLOCKED' | 'FAILED'; reason: string; evidenceRefs?: string[] };
~~~

这是一份跨语言逻辑契约的 TypeScript 草图，不暴露任意物理 Host API、未经声明的其他 Function 或 KDP 的 Effect 内部对象。是否支持重启恢复由 Business State Element 和 App Init 具体实现决定。

## 3. Domain App 声明

~~~yaml
kind: DomainApp
schema: dis.app/v0.2
id: shun.desktop
version: 0.3.0
init:
  element: shun.app-init
  function: init
ingress:
  - id: submitGoal
    target: {element: shun.goal, function: interpret}
  - id: getCase
    target: {element: shun.case, function: get}
target: {platform: windows, runtime: node24}
~~~

App Init 是普通 Element：可有其他自己的私有 Function 和自有状态，唯有 \`init\` 的输入/输出遵守全局标准。App 显式选择唯一 init；可对外提供多个 ingress。Ingress **不必须**经 App Init，也不强制 Main Workflow。

## 4. 顺序与失败语义

1. KDP 载入精确 AOT Package Lock，验证选中 KDP/SDK/Business 的合法依赖。
2. 完成 Package 级资源初始化；任一必需 Package 失败则不执行业务 App Init。
3. 运行一个已选 \`app-init.init\`；标准结果含 READY、DEGRADED、BLOCKED/FAILED。
4. 缺失必需服务、未知 Effect、版本冲突不许报 READY。DEGRADED 仅可用于明确声明为可选的服务缺失，相关 ingress 必须按已选契约限制。
5. 满足业务 READY 条件才开放对应 ingress，KDP 继续治理已锁定 Function 运行及 Effect。
6. 关闭时 KDP 管理调用停止/资源释放及逆序 Package Dispose。可选业务 \`shutdown\` 不得绕过 KDP，也不要求每个 Element 创建空函数。

同一个 activationIdentity 下重复 \`init\` 应能拒绝或以受验证的幂等语义返回；进程 restart 视为新的激活尝试，应用自有状态是否恢复属于 Domain 决策。App Init **不**负责恢复每个 Task/Workflow 的全部生命周期。

## 5. 实践反例

- **Tally**：GitHub 读取服务和 B Elements 可初始化；Task Claim、Review、Release 仍由其业务 Function 判断，不能由 Init 成功推导任务完成。
- **xDownload**：加载一个 Core 实例；Browser/Desktop 共享该运行权威；Init 不能让多个入口各自创建不同的下载 Core。
- **Shun**：装配 Store/Provider Registry；业务用户授权是每次 Effect 的边界，不能被 App Init 的 READY 替代。
- **ai-rexform**：Case/规则/Interaction 资源就绪；Init 不能假冒设备已测、已授权设备操作或 Workflow 完成。

## 6. 验收与未决

须验证包 READY 前无 App Init、业务 Init 失败无 ingress、可选服务降级、重复 init、异常重启、Function 直接 ingress、无 Main Workflow、SDK 未选择时 fail-closed。需与真实 KDP SDK 的公共生命周期接口对照；本文件不承诺已经存在具体 \`load\`/lifecycle 实现。

R2 未决：App Init 能否返回部分 ingress 可用性及其静态声明方式、\`DEGRADED\` 在多入口 UI 下的映射、异步初始化超时与中止时 KDP 回收证据的精确字段。
