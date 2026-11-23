# DomainHarness · TypeScript/Node Language-Native Profile

> Owner [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685) 新设计 **CONFIRMED**。下面的 SDK API 与当前原生实现候选对应；历史 Contracts/Runtime 的物理移除仅在 Draft #1694，未合并前不得宣称版本列车已迁移完成。

## TS-01 · 三个固定映射

| 抽象 | 固定 TS 实现 |
|---|---|
| Package | **ESM 模块集合**，使用 `package.json#exports` 公开 |
| Element | **一个 Class**，无需强制继承 SDK Element 根类 |
| Function | 普通 `export function`、Element Class 的实例/静态方法 |
| 组合 Element | 普通 Class 组合其它 Element，该 Class 自身也是 Element |
| Order | Package 模块级可执行元数据 `packageMeta.order` |
| Init/Exit | 可选 `Init` Class 的 `start()` 与可选 `[Symbol.asyncDispose]()` |

Class PascalCase、Element 逻辑 id camelCase、Package id kebab-case。一个模块可公开多个函数和 Element，普通 helper 不需要成为 Element。

## TS-02 · 元数据即代码

```ts
// 普通业务 Core 模块；Metadata 是框架实际读取的代码
import type { CorePackageMetadata } from '@kaicreator/domain-harness';
export const packageMeta = {
  id: "order-business",
  role: "core",
  order: 2,
} as const satisfies CorePackageMetadata;
export { OrderInit as Init } from "./elements/order-init.js";
export { OrderService } from "./elements/order-service.js";
export { createOrderId } from "./functions/create-order-id.js";
```

```ts
/** 订单领域服务：优先组合标准应用级能力。 */
export class OrderService {
  static readonly metadata = { id: "orderService" } as const;

  public async submit(order: Order): Promise<OrderResult> {
    throw new Error("示意方法，真实业务由 Package 作者实现");
  }

  #normalize(): void { /* 原生 JS 私有实现 */ }
}
```

- **框架直接读取代码 Metadata**（Order 等）；`TSDoc/JSDoc + Skill` 则给 Agent/开发者阅读，不承担读取元数据的第二份运行时职责。
- Module 元数据优先 `export const packageMeta`，Class 元数据优先静态字段；只在确有需要时使用标准装饰器，不设 Reflect 全局注册/Agent-only 重复 Schema。
- TS 类型在运行时擦除；不要声称框架可从运行时泛型自动推导域 Schema。
- `public/private` 的 TS 可见性与 JS `#private` 不同，`exports` 才决定模块公开入口；业务鉴权是业务代码责任。

## TS-03 · 原生插件与依赖

- 应用**显式静态 import**所需 Package，`package.json` 明确直接 `dependencies`，`exports` 定义可调用的公开子模块/函数。Package 的版本、安装、导入和依赖解析由 Node/npm 处理。
- 不再需要单独 Extension/FunctionRef/ImplementationBinding/Target Registry、PackageSystem 插件扫描器或按函数动态派发；Package 级函数可直接公开调用，不强行创建包装静态 Class。
- A 直接 import C 应在生成期直接声明 C，不能依赖 npm 的传递依赖提升；作者可通过 ESLint/依赖工具检查，SDK Runtime 不重建依赖图。
- **ESM import 会执行顶层代码**；模块定义求值不等于生命周期 Init。生成期约束不必要顶层副作用，显式 `start()` 才进入业务初始化。

## TS-04 · 可选生命周期与 Order

- KDP 是唯一 Order=0 的根 Core；其它 Core Order 非负、互异、可跳号。生成期保证唯一、合法与静态 Core 集合；框架运行时**读取元数据并按数值排序**，不再验证代码/权限/Pin。
- 无 Init/Exit 的 Package **视为空操作**。有 `Init` 的才实例化并显式 `start(context)`。KDP 必须有生命周期协调入口，但其它 Package 不必有空 Init Class。
- 可选 `AsyncDisposable` 的 `async [Symbol.asyncDispose](): Promise<void>` 作为 Exit。KDP/实例所有者在应用终止时按实际进入逆序显式调用，清理失败继续其它 Exit，不遮盖原始异常。
- `await using` 只用于短作用域；不能在长期运行的 `start()` 内将活跃资源提前 Dispose。断电/强杀不承诺退出钩子。
- Package 自主决定重复 Init 的共享/去重，不强制全局 once。Core 在自己的 Init 中使用普通 TS 调用准备直接依赖，完成后才进入下个 Core；无需第二 Extension Init Registry。
- 关闭请求生效后须拒绝新的 Core/嵌套依赖/业务进入，待在途 Init 收敛且 Exit 完成后才能报告关闭；并发/同步重入关闭只允许每个拥有实例清理一次，Hook 不能等待其自身正在执行的同一轮关闭。行为 Oracle 见 [LIFE-10](./lifecycle-workflow.md)。

## TS-05 · Workflow/XState Standard Element

```ts
import { fromPromise } from 'xstate';
import { XStateWorkflowElement, StandardWorkflowSession } from '@kaicreator/domain-harness';

// 真实 SDK API：XState Actor Logic 的输入、输出类型由逻辑本身确定。
const logic = fromPromise<number, number>(async ({ input }) => input * 2);
const workflow = new XStateWorkflowElement<typeof logic, number>(
  logic,
  output => ({ status: 'COMPLETE', value: output }),
);
const actorOutcome = await workflow.run(3);

// 普通业务可不使用 XState，通过原生 TS 回调共享根预算。
const session = new StandardWorkflowSession({ maxCalls: 2, maxSteps: 3, maxDepth: 0 });
const businessOutcome = await session.run(ctx => ctx.invoke(() => 42));
void actorOutcome;
void businessOutcome;
```

通用 Workflow 定义与执行实现分离：XState 是下层库，`XStateWorkflowElement` 是 SDK 应用级标准能力，Domain App 或 Kernel Business 可以直接 import 使用；KDP 不垄断执行引擎。Reader/Storage 等同理，只有 Domain App 常用且有实际复用价值的能力才成为 Standard。

**类型约束与执行终态**：公开 `run(input)` 的 TypeScript 输入类型必须与实际 Actor Logic 输入类型安全兼容，不得以不受约束的 `AnyActorLogic` 让错型通过 strict TS；成功 mapper 只能在确认 Actor 已 `done` 后使用它的输出类型，或从 `unknown` 明确收窄，不以强制断言/缺失值自动成功。必须验证错型输入编译失败、合法输入和合法 `void` 正例，以及 [LIFE-11](./lifecycle-workflow.md) 的同步/异步异常及 Actor stop。

## TS-06 · Business 组合

Business 可以使用普通 TS 代码、标准 Element、直接调用 Node/第三方库；一个负责组合的 Class 也是 Element，但 Package 本身保持模块集合。没有生命周期需求时无需强制建组合根 Init。模块 Function 可直接公开而不依附某个 Element。

## TS-07 · 生成与运行边界

生成期确认 Order、依赖和元数据、类型/测试/功能正确性；应用通过普通 npm 锁文件与可信安装交付。运行期只使用既有源码和代码元数据，执行正常功能与最终错误兜底；不验证旧 DH Lock/Pin/Target、不重新编译静态 DAG，也不承诺恶意代码沙箱。业务输入、授权、资源异常仍是正常业务逻辑。

## TS-08 · Agent

Agent 阅读 [Skill](../../../.agents/skills/domain-harness-spec/SKILL.md) 与 TSDoc/JSDoc，必要时读取代码 Metadata；优先采用 SDK Standard Elements，再创建确实有内聚业务职责的 Element。代码样例是目标形式，严禁冒充现有可运行 SDK API。
