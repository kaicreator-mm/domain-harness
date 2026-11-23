# DomainHarness v0.11.2 · R17 Tool 两种调用模式：系统预授权 vs 用户确认（Owner 候选）

```ini
OUTPUT_LABEL=DH_V0112_R17_PREAUTHORIZED_TOOL_VS_USER_APPROVAL_PRODUCT_CLARIFICATION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
DRAFT_PR=#1702
UPSTREAM=R15_R16_KNOWLEDGE_AND_TWO_WORKFLOWS
STATUS=PRODUCT_L1_CANDIDATE_PENDING_OWNER_REVIEW
L2=NOT_STARTED
IMPLEMENTATION=NOT_STARTED
CI=NOT_RUN_DOCS_ONLY
```

> **Owner 新的边界**：不应该对所有 Tool 无差别引入运行时单独授权。以可信静态 Domain App / Business Package 为前提，区分 **系统预授权 Tool 调用** 与 **需要用户批准的 Tool 调用**。用户批准是有些操作的业务交互条件，不是 SDK 对已编译可信代码的结构正确性再做一次验证。以下名称和接口都是候选，不是现有 SDK API。

## 1. 两种执行模式

| 模式 | 何时可以调用 | 运行时行为 | 审查要求 |
|---|---|---|---|
| **PREAUTHORIZED**（系统预授权） | 开发/生成时已选择、测试、显式 import，部署/配置时已授予应用对应资源权限，并由 Business 声明不需要单次用户确认 | Workflow 在现有业务条件满足后直接调用 Tool/Effect，不向用户单独询问；真实数据库/OS/远端服务凭据和资源边界仍生效 | 未声明 Tool、错误输入/范围、业务 Guard 不满足、资源拒绝/故障时如实失败，不能因为静态选定就对任意输入放行 |
| **USER_APPROVAL**（用户确认） | Tool 本身同样静态选定且应用有能力调用；但是 Business 要求用户确认本次目标操作 | Workflow 构造待确认请求 → UI/Host 返回有效确认 → 再核对用户同意的**确切操作、目标和参数**与实际调用一致 → 执行 Tool/Effect | 无用户确认、用户拒绝、参数改变、确认过期/作用域不符不得 Effect；ASK/WAIT/REJECT 分支完整 |

**不能混淆的三个事实：**
1. **生成期正确性/可信选择**：Business 生成者决定允许调用哪些 Tool、其类型/行为/依赖与何时请求用户确认。现行新 SDK 不负责运行时复查 Package/Element 结构。
2. **部署及资源访问权限**：Preauthorized 不是绕过 OS/DB/Host 资源权限。真实执行者仍只在自己具备的权限范围执行；外部服务可以按其自身权限拒绝。**不需新增一次 DomainHarness 中央运行期 Permit 流程**。
3. **用户对某次业务动作的确认**：由 Business Policy 决定是否需要；不赋予应用原本没有的 Host 资源权限，也不能通过 LLM/Knowledge 文字指令来提升 Tool 权限。

**分类由谁确定：** 可信 Domain App/Business Package 的**可执行静态策略**决定，不因 Knowledge 文件、模型输出或用户请求包含 `auto=true` 就动态降级。Knowledge 可以包含用于说明、提示、选择的 Tool 描述与风险提示；**真正调用方式以静态选定的 Business Tool 绑定/Policy 为准**。需要动态业务条件的确认范围，必须经已选可信业务函数确定；不能任由不可信记录绕过用户确认。

## 2. 在 Knowledge + Workflow 两层中的映射

```text
Knowledge (语义/策略说明): Intent 定义、Tool/Capability 描述、Rule、Applicability
       ↑ 用于查询/理解
Intent Recognition Workflow: Recognizer + Validator → ValidatedIntent
       ↓ 静态匹配 Business Handling Workflow
Intent Handling Workflow: Business State/Guard → Decision
       ↓
     Tool Policy (由选定可信 Business 代码提供)
       ├─ PREAUTHORIZED → 直接调用已选 Tool
       └─ USER_APPROVAL → ask user → verify scoped approval → 调用已选 Tool
       ↓
    Tool/Effect → actual provider response/readback → Outcome/Evidence
```

**Tool 的执行模式是执行层的行为条件，不引入第三层授权架构。** SDK 仅提供可复用的 Policy/Approval Result/Request 数据合同和可选用于 Workflow 的 helper；Business/Host 负责实际执行与最终权限。无须实现 `KDP.permit()` 统一调度器、独立 Tool Registry 或第二 Workflow Runner。

## 3. 最小的 TypeScript Policy 形状（候选，不是已实现 API）

```ts
type ToolInvocationPolicy =
  | { readonly mode: 'PREAUTHORIZED' }
  | { readonly mode: 'USER_APPROVAL'; readonly approvalScope: 'PER_CALL' | 'SESSION' };

// 普通 Business Function 或 Element 方法；toolFn 是静态 import 的函数引用。
async function executeSelectedTool<I, O>(
  policy: ToolInvocationPolicy,
  input: I,
  toolFn: (input: I) => Promise<O>,
  approval?: { operationId: string; inputDigest: string; scope: string; expiresAt?: string }
): Promise<unknown> {
  // 示意：PREAUTHORIZED 不请求额外用户确认；
  // USER_APPROVAL 只有确认凭据绑定本次真实操作和输入后才可执行。
  // 资源系统的访问权限和所有 Business Guard 仍然有效。
  throw new Error('Design sketch, not implemented');
}
```

**不要将此伪代码当作真正实现**。L2 决定需要显式 `ApprovalRequest` / `ApprovalResult` 类型还是仅通过既有 Workflow `ASK/WAIT/REJECT` + Business callback 表达。优先最小可用 API。

## 4. User Approval 的必要边界，但不做通用用户权限平台

- 用户确认内容明确说明 **Tool/Operation、资源目标、关键参数或摘要、实际效果、一次/会话有效期**，不接受“同意任意后续操作”的无限授权。用户可先前授予有效范围内的会话授权，不必每次弹窗；由业务明确其适用范围。
- 在确认之后如果动作参数、目标、关键业务状态发生变化，**重新验证批准覆盖范围，必要时重新要求确认**。不将用户批准视作绕过当前业务 Guard。
- 同步交互可以由 Domain App/Host adapter 返回确认结果；若需要外部异步批准，Workflow 返回 ASK/WAIT 并停止实际 Effect。**0.11.3** 负责成熟 UI/多轮交互，**0.11.6** 负责跨进程 TaskRun 持久等待/恢复。本版不承诺长时间驻留的审批平台。
- 未经批准、拒绝或未知状态不可通过 `root.invoke()` 被包装为 `COMPLETE.value`。具有业务非成功状态的函数需显式映射并用已有 `invokeOutcome()` / `leaf()` 传播。
- 不要通过单个用户批准在其权限之外获得宿主资源能力。调用端信任/生成期静态选择和执行目标自身的权限是另一边界。

## 5. 0.11.4 合并范围的对应修订

若 R16 合并最终获 Owner 批准，原 v0.11.4 Authorized Action 机制应统一为 **可信预授权调用 + 按需用户确认**，而不是对一切 Tool 调用强制做 KDP Permit。包含 State/CAS、Tool/Host/Effect、必要 Journal/Receipt/Readback 和未知结果的最小保守处理；是否需要用户审批与是否存在外部 Effect 不完全等价：

- 本地计算和授权的内部持久化可以是 PREAUTHORIZED；
- 真实外部 Effect 也可以是 PREAUTHORIZED（例如应用 Owner 授权配置的后台同步），条件是部署时已具备必要权限；
- 查询/只读亦可能需 USER_APPROVAL（例如某些隐私数据的明确访问许可）；
- 某操作即使用户批准了，也仍可能被真实 Host/服务拒绝；不得返回成功。

保留 0.11.6 对 TaskRun/Checkpoint 长期恢复与 Effect 保守恢复的职责，不把 R17 简化方案误当幂等安全自动完成。

## 6. 最小新增 Product/L1 验收候选（NOT_RUN）

| ID | 可观察验收 |
|---|---|
| DI-AC42 | 同一外部 Business Package 中 PREAUTHORIZED Tool 在满足可信静态选定、部署资源权限及 Business Guard 时**不触发用户确认**即能实际执行 |
| DI-AC43 | USER_APPROVAL Tool 在没有批准、用户拒绝、确认过期、目标/参数与批准不一致时**不提交 Effect**，返回 ASK/REJECT/UNKNOWN 等符合语义的结果；有效确认后才执行 |
| DI-AC44 | Knowledge/模型/用户输入注入 `mode=PREAUTHORIZED` 无法降低 Business 静态的 USER_APPROVAL 要求，未选 Tool 不能动态加载或获权 |
| DI-AC45 | PREAUTHORIZED Tool 仍遵守真实 Host/DB 的访问权限，调用参数/资源范围或 Business Guard 失败时不伪报成功，不创建额外 KDP 中央 Permit Runtime |
| DI-AC46 | 会话批准或一次性批准只有在绑定同一操作/主体/资源/参数与有效期限时复用；关键状态变化触发重新确认或业务拒绝 |
| DI-AC47 | 两类模式均使用现有 Workflow/Function 调用，真实 Host 回执和 Readback/UNKNOWN/重复消息安全分类由对应 Effect/State 能力处理；不重复实现 workflow engine |

## 7. 待 Owner 确认的决策

1. 接受 **Tool 调用两种模式：PREAUTHORIZED / USER_APPROVAL**，生成/部署时选择并配置允许能力；运行时只为后者追加明确用户确认，**不对所有 Tool 强制单独的运行时批准**。
2. 不改变生成期正确性/静态可信 Package 与 KDP 最小职责；资源本身的认证授权与用户确认是不同概念。
3. Knowledge 语义层可以描述 Tool/Capability/审批要求，但运行时采用由可信 Business 代码选定的 Policy，不许动态降级；Workflow 行为层负责两种处理路径。
4. R16 的 0.11.4→0.11.2 全量合并建议继续待产品裁决；用户确认 UI 和跨进程恢复继续分别归 0.11.3、0.11.6。
